from django.db import models
from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from .models import StockLevel, StockMovement
from .serializers import (
    StockLevelSerializer,
    StockMovementSerializer,
    ReceiveStockSerializer,
    AdjustStockSerializer,
)
from .services import receive_stock, adjust_stock
from core.scoping import WarehouseScopeMixin
from core.permissions import (
    IsStaff,
    IsWarehouseManager,
    ROLE_ADMIN,
    get_user_role,
)


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


class StockMovementViewSet(WarehouseScopeMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Stock ledger viewset.
    Strictly scoped: Staff cannot view ledger; Manager sees own warehouse; Admin sees all.
    """
    queryset = StockMovement.objects.all().select_related("warehouse", "product", "user").order_by("-created_at")
    serializer_class = StockMovementSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        movement_type = self.request.query_params.get("movement_type")
        if movement_type:
            qs = qs.filter(movement_type=movement_type)
        return qs
