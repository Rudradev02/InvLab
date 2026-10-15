from django.core.cache import cache
from django.db import models
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    IsStaff,
    IsWarehouseManager,
    get_user_role,
)
from core.scoping import WarehouseScopeMixin

from .models import StockLevel, StockMovement
from .serializers import (
    AdjustStockSerializer,
    ReceiveStockSerializer,
    StockLevelSerializer,
    StockMovementSerializer,
)
from .services import adjust_stock, receive_stock


class StockLevelViewSet(WarehouseScopeMixin, viewsets.ModelViewSet):
    queryset = StockLevel.objects.all().select_related("warehouse", "product", "product__category")
    serializer_class = StockLevelSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter == "low":
            qs = qs.filter(quantity__gt=0, quantity__lte=models.F("reorder_level"))
        elif status_filter == "out":
            qs = qs.filter(quantity__lte=0)
        elif status_filter == "in_stock":
            qs = qs.filter(quantity__gt=0)
        return qs

    def create(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can add products to a warehouse.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data

        product = validated_data["product"]
        reorder_level = validated_data.get("reorder_level", product.default_reorder_level or 5)
        initial_quantity = validated_data.get("initial_quantity", 0)

        if role == ROLE_MANAGER:
            manager_wh_id = getattr(getattr(request.user, "profile", None), "warehouse_id", None)
            if not manager_wh_id:
                raise PermissionDenied("Manager has no assigned warehouse.")
            target_wh_obj = validated_data.get("warehouse")
            if target_wh_obj and target_wh_obj.id != manager_wh_id:
                raise PermissionDenied("Managers cannot manage stock in other warehouses.")
            warehouse_id = manager_wh_id
        else:
            wh_obj = validated_data.get("warehouse")
            if not wh_obj:
                raise PermissionDenied("Admin must specify warehouse.")
            warehouse_id = wh_obj.id

        from warehouses.models import Warehouse

        warehouse = Warehouse.objects.get(pk=warehouse_id)

        if StockLevel.objects.filter(warehouse=warehouse, product=product).exists():
            return Response(
                {
                    "detail": f"Product '{product.name}' is already registered in warehouse '{warehouse.name}'."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if initial_quantity > 0:
            stock_level = receive_stock(
                warehouse_id=warehouse.id,
                product_id=product.id,
                quantity=initial_quantity,
                user=request.user,
                reference="Initial Stock Allocation",
            )
            if reorder_level != stock_level.reorder_level:
                stock_level.reorder_level = reorder_level
                stock_level.save(update_fields=["reorder_level"])
        else:
            stock_level = StockLevel.objects.create(
                warehouse=warehouse,
                product=product,
                quantity=0,
                reorder_level=reorder_level,
            )

        return Response(StockLevelSerializer(stock_level).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update stock levels.")

        instance = self.get_object()
        if "quantity" in request.data and int(request.data["quantity"]) != instance.quantity:
            raise PermissionDenied(
                "Direct modification of stock quantity is not permitted. Use receive or adjust actions."
            )

        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update stock levels.")

        instance = self.get_object()
        if "quantity" in request.data and int(request.data["quantity"]) != instance.quantity:
            raise PermissionDenied(
                "Direct modification of stock quantity is not permitted. Use receive or adjust actions."
            )

        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can delete stock levels.")
        instance = self.get_object()
        if instance.quantity > 0 or instance.movements.exists():
            raise PermissionDenied(
                "Cannot delete stock level with recorded history or non-zero quantity."
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], permission_classes=[IsStaff])
    def receive(self, request):
        user = request.user
        role = get_user_role(user)
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or request.META.get("HTTP_IDEMPOTENCY_KEY")
            or ""
        )
        cache_key = f"idempotency:stock_receive:{user.id}:{idempotency_key}" if idempotency_key else None
        if cache_key:
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data, status=status.HTTP_200_OK)

        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Scoping rule: staff & managers always operate on own warehouse
        if role != ROLE_ADMIN:
            warehouse = getattr(getattr(user, "profile", None), "warehouse", None)
            if not warehouse:
                raise PermissionDenied("User is not assigned to any warehouse.")
            if not warehouse.is_active:
                raise PermissionDenied("Cannot receive stock in a deactivated warehouse.")
            warehouse_id = warehouse.id
        else:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                raise PermissionDenied("Admin must specify warehouse_id.")

        stock_level = receive_stock(
            warehouse_id=warehouse_id,
            product_id=data["product_id"],
            quantity=data["quantity"],
            user=user,
            reference=data.get("reference", ""),
        )
        resp_data = StockLevelSerializer(stock_level).data
        if cache_key:
            cache.set(cache_key, resp_data, timeout=86400)
        return Response(resp_data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], permission_classes=[IsStaff])
    def adjust(self, request):
        user = request.user
        role = get_user_role(user)
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or request.META.get("HTTP_IDEMPOTENCY_KEY")
            or ""
        )
        cache_key = f"idempotency:stock_adjust:{user.id}:{idempotency_key}" if idempotency_key else None
        if cache_key:
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data, status=status.HTTP_200_OK)

        serializer = AdjustStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if role != ROLE_ADMIN:
            warehouse = getattr(getattr(user, "profile", None), "warehouse", None)
            if not warehouse:
                raise PermissionDenied("User is not assigned to any warehouse.")
            if not warehouse.is_active:
                raise PermissionDenied("Cannot adjust stock in a deactivated warehouse.")
            warehouse_id = warehouse.id
        else:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                raise PermissionDenied("Admin must specify warehouse_id.")

        stock_level = adjust_stock(
            warehouse_id=warehouse_id,
            product_id=data["product_id"],
            delta=data["delta"],
            user=user,
            reason=data.get("reason", ""),
        )
        resp_data = StockLevelSerializer(stock_level).data
        if cache_key:
            cache.set(cache_key, resp_data, timeout=86400)
        return Response(resp_data, status=status.HTTP_200_OK)


class StockMovementViewSet(
    WarehouseScopeMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    Stock ledger viewset.
    Strictly scoped: Staff cannot view ledger; Manager sees own warehouse; Admin sees all.
    Append-only and immutable.
    """

    queryset = (
        StockMovement.objects.all()
        .select_related("warehouse", "product", "user")
        .order_by("-created_at")
    )
    serializer_class = StockMovementSerializer
    permission_classes = [IsWarehouseManager]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # Product filter
        product_id = params.get("product") or params.get("product_id")
        if product_id:
            qs = qs.filter(product_id=product_id)

        # Movement type filter (type or movement_type)
        m_type = params.get("movement_type") or params.get("type")
        if m_type:
            qs = qs.filter(movement_type=m_type)

        # User filter (ID or username)
        user_param = params.get("user") or params.get("user_id")
        if user_param:
            if user_param.isdigit():
                qs = qs.filter(user_id=int(user_param))
            else:
                qs = qs.filter(user__username__iexact=user_param)

        # Date range filter
        date_from = params.get("date_from") or params.get("start_date")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = params.get("date_to") or params.get("end_date")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs

    @action(detail=False, methods=["get"], url_path=r"product/(?P<product_id>\d+)")
    def product_history(self, request, product_id=None):
        """Returns paginated stock movement history for a specific product."""
        qs = self.get_queryset().filter(product_id=product_id)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
