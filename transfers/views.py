from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    IsWarehouseManager,
    get_user_role,
)

from .models import StockTransfer
from .serializers import (
    CreateTransferRequestSerializer,
    ReceiveTransferRequestSerializer,
    StockTransferSerializer,
)
from .services import (
    cancel_transfer,
    create_transfer,
    dispatch_existing_transfer,
    receive_transfer,
)


class StockTransferViewSet(viewsets.ModelViewSet):
    serializer_class = StockTransferSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        qs = (
            StockTransfer.objects.all()
            .select_related("from_warehouse", "to_warehouse", "dispatched_by", "received_by")
            .prefetch_related("lines__product")
        )

        query_params = getattr(self.request, "query_params", getattr(self.request, "GET", {}))
        direction = query_params.get("direction")
        status_filter = query_params.get("status")
        search = query_params.get("search")

        if role == ROLE_ADMIN:
            warehouse_id = query_params.get("warehouse")
            if warehouse_id:
                if direction == "incoming":
                    qs = qs.filter(to_warehouse_id=warehouse_id)
                elif direction == "outgoing":
                    qs = qs.filter(from_warehouse_id=warehouse_id)
                else:
                    qs = qs.filter(Q(from_warehouse_id=warehouse_id) | Q(to_warehouse_id=warehouse_id))
            else:
                if direction == "incoming":
                    pass  # Admin view all incoming doesn't make sense without warehouse
                elif direction == "outgoing":
                    pass
        else:
            profile = getattr(user, "profile", None)
            if not profile or not profile.warehouse_id:
                return StockTransfer.objects.none()

            wh_id = profile.warehouse_id
            if direction == "incoming":
                qs = qs.filter(to_warehouse_id=wh_id)
            elif direction == "outgoing":
                qs = qs.filter(from_warehouse_id=wh_id)
            else:
                qs = qs.filter(Q(from_warehouse_id=wh_id) | Q(to_warehouse_id=wh_id))

        if status_filter:
            qs = qs.filter(status=status_filter)

        if search:
            qs = qs.filter(
                Q(transfer_number__icontains=search)
                | Q(notes__icontains=search)
                | Q(from_warehouse__name__icontains=search)
                | Q(to_warehouse__name__icontains=search)
                | Q(lines__product__name__icontains=search)
                | Q(lines__product__sku__icontains=search)
            ).distinct()

        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreateTransferRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            from_wh_id = user.profile.warehouse_id
            if not from_wh_id:
                raise PermissionDenied("User is not assigned to any warehouse.")
        else:
            from_wh_id = data.get("from_warehouse_id")
            if not from_wh_id:
                raise PermissionDenied("Admin must specify from_warehouse_id.")

        transfer = create_transfer(
            from_warehouse_id=from_wh_id,
            to_warehouse_id=data["to_warehouse_id"],
            lines_data=data["lines"],
            user=user,
            notes=data.get("notes", ""),
            is_draft=data.get("is_draft", False),
        )

        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="dispatch")
    def dispatch_transfer(self, request, pk=None):
        transfer = self.get_object()
        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            if transfer.from_warehouse_id != user.profile.warehouse_id:
                raise PermissionDenied("You can only dispatch transfers originating from your warehouse.")

        transfer = dispatch_existing_transfer(transfer.id, user=user)
        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        transfer = self.get_object()
        user = request.user
        role = get_user_role(user)

        # Scoping: Manager can only receive transfers into their own warehouse
        if role != ROLE_ADMIN:
            if transfer.to_warehouse_id != user.profile.warehouse_id:
                raise PermissionDenied(
                    "You can only confirm transfers incoming to your own warehouse."
                )

        serializer = ReceiveTransferRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items_data = serializer.validated_data.get("items", [])
        received_map = {item["product_id"]: item["received_quantity"] for item in items_data}

        transfer = receive_transfer(
            transfer_id=transfer.id,
            received_items=received_map,
            user=user,
        )

        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        transfer = self.get_object()
        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            wh_id = user.profile.warehouse_id
            if transfer.from_warehouse_id != wh_id and transfer.to_warehouse_id != wh_id:
                raise PermissionDenied("You can only cancel transfers associated with your warehouse.")

        transfer = cancel_transfer(transfer.id, user=user)
        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_200_OK)
