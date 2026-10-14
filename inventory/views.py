from django.db import models
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
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


class StockLevelViewSet(WarehouseScopeMixin, viewsets.ReadOnlyModelViewSet):
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

    @action(detail=False, methods=["post"], permission_classes=[IsStaff])
    def receive(self, request):
        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        role = get_user_role(user)

        # Scoping rule: staff & managers always operate on own warehouse
        if role != ROLE_ADMIN:
            warehouse_id = user.profile.warehouse_id
            if not warehouse_id:
                raise PermissionDenied("User is not assigned to any warehouse.")
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
        return Response(StockLevelSerializer(stock_level).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], permission_classes=[IsStaff])
    def adjust(self, request):
        serializer = AdjustStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            warehouse_id = user.profile.warehouse_id
            if not warehouse_id:
                raise PermissionDenied("User is not assigned to any warehouse.")
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
        return Response(StockLevelSerializer(stock_level).data, status=status.HTTP_200_OK)


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
