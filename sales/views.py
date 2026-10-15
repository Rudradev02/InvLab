from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    ROLE_STAFF,
    IsStaff,
    IsWarehouseManager,
    get_user_role,
)
from core.scoping import WarehouseScopeMixin

from .models import Sale, SaleReturn
from .serializers import (
    CreateReturnRequestSerializer,
    CreateSaleRequestSerializer,
    SaleReturnSerializer,
    SaleSerializer,
)
from .services import create_sale, process_sale_return


class SaleViewSet(WarehouseScopeMixin, viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = (
            Sale.objects.all()
            .select_related("warehouse", "user")
            .prefetch_related(
                "lines__product",
                "lines__return_lines",
                "returns__lines__product",
                "returns__processed_by",
            )
        )
        user = self.request.user
        role = get_user_role(user)

        # Scoping
        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(warehouse_id=warehouse_id)
        elif role == ROLE_STAFF:
            # Staff can only view their own sales (FRD Permission Matrix)
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id, user=user)
            else:
                return Sale.objects.none()
        else:
            # Warehouse Manager can view all sales for their warehouse
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id)
            else:
                return Sale.objects.none()

        payment_method = self.request.query_params.get("payment_method")
        if payment_method:
            qs = qs.filter(payment_method=payment_method)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(sale_number__icontains=search)
                | Q(notes__icontains=search)
                | Q(user__username__icontains=search)
                | Q(lines__product__name__icontains=search)
                | Q(lines__product__sku__icontains=search)
            ).distinct()

        return qs

    def update(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records are immutable. Use returns or refunds for corrections.")

    def partial_update(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records are immutable. Use returns or refunds for corrections.")

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records cannot be deleted.")

    def create(self, request, *args, **kwargs):
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or request.META.get("HTTP_IDEMPOTENCY_KEY")
            or ""
        )
        user = request.user
        role = get_user_role(user)

        if idempotency_key:
            existing = Sale.objects.filter(user=user, idempotency_key=idempotency_key).first()
            if existing:
                return Response(SaleSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = CreateSaleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if role != ROLE_ADMIN:
            warehouse = getattr(getattr(user, "profile", None), "warehouse", None)
            if not warehouse:
                raise PermissionDenied("User is not assigned to any warehouse.")
            if not warehouse.is_active:
                raise PermissionDenied("Cannot record sale in a deactivated warehouse.")
            warehouse_id = warehouse.id
        else:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                raise PermissionDenied("Admin must specify warehouse_id.")

        sale = create_sale(
            warehouse_id=warehouse_id,
            lines_data=data["lines"],
            user=user,
            notes=data.get("notes", ""),
            idempotency_key=idempotency_key,
            customer_id=data.get("customer_id"),
            amount_paid=data.get("amount_paid"),
            discount_type=data.get("discount_type", "none"),
            discount_value=data.get("discount_value", 0),
            payment_method=data.get("payment_method", "cash"),
        )

        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsWarehouseManager])
    def return_items(self, request, pk=None):
        sale = self.get_object()
        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            if sale.warehouse_id != user.profile.warehouse_id:
                raise PermissionDenied("You can only process returns for sales belonging to your warehouse.")

        serializer = CreateReturnRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sale_return = process_sale_return(
            sale_id=sale.id,
            items_data=data["lines"],
            user=user,
            reason=data.get("reason", ""),
            refund_method=data.get("refund_method", "cash"),
        )

        return Response(SaleReturnSerializer(sale_return).data, status=status.HTTP_201_CREATED)


class SaleReturnViewSet(WarehouseScopeMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = SaleReturnSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        qs = (
            SaleReturn.objects.all()
            .select_related("warehouse", "sale", "processed_by")
            .prefetch_related("lines__product", "lines__sale_line")
        )
        user = self.request.user
        role = get_user_role(user)

        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(warehouse_id=warehouse_id)
        else:
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id)
            else:
                return SaleReturn.objects.none()

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(return_number__icontains=search)
                | Q(sale__sale_number__icontains=search)
                | Q(reason__icontains=search)
                | Q(lines__product__name__icontains=search)
            ).distinct()

        return qs
