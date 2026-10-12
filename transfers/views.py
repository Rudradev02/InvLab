from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound
from django.db.models import Q

from .models import StockTransfer
from .serializers import (
    StockTransferSerializer,
    CreateTransferRequestSerializer,
    ReceiveTransferRequestSerializer,
)
from .services import dispatch_transfer, receive_transfer
from core.permissions import (
    IsWarehouseManager,
    ROLE_ADMIN,
    ROLE_MANAGER,
    get_user_role,
)


class StockTransferViewSet(viewsets.ModelViewSet):
    serializer_class = StockTransferSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        qs = StockTransfer.objects.all().select_related(
            "from_warehouse", "to_warehouse", "dispatched_by", "received_by"
        ).prefetch_related("lines__product")

        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(Q(from_warehouse_id=warehouse_id) | Q(to_warehouse_id=warehouse_id))
            return qs

        profile = getattr(user, "profile", None)
        if not profile or not profile.warehouse_id:
            return StockTransfer.objects.none()

        wh_id = profile.warehouse_id
        return qs.filter(Q(from_warehouse_id=wh_id) | Q(to_warehouse_id=wh_id))

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

        transfer = dispatch_transfer(
            from_warehouse_id=from_wh_id,
            to_warehouse_id=data["to_warehouse_id"],
            lines_data=data["lines"],
            user=user,
            notes=data.get("notes", ""),
        )

        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsWarehouseManager])
    def receive(self, request, pk=None):
        transfer = self.get_object()
        user = request.user
        role = get_user_role(user)

        # Scoping: Manager can only receive transfers into their own warehouse
        if role != ROLE_ADMIN:
            if transfer.to_warehouse_id != user.profile.warehouse_id:
                raise PermissionDenied("You can only confirm transfers incoming to your own warehouse.")

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
