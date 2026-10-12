from datetime import timedelta

from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from audit.models import AuditLog
from core.permissions import (
    ROLE_ADMIN,
    IsAdmin,
    IsStaff,
    get_user_role,
)

from .models import Warehouse
from .serializers import WarehouseOverviewSerializer, WarehouseSerializer


class WarehouseViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        if role == ROLE_ADMIN:
            return (
                Warehouse.objects.all().select_related("manager").prefetch_related("staff_members")
            )

        profile = getattr(user, "profile", None)
        if not profile or not profile.warehouse_id:
            return Warehouse.objects.none()

        # Manager and Staff only see their own warehouse
        return (
            Warehouse.objects.filter(pk=profile.warehouse_id)
            .select_related("manager")
            .prefetch_related("staff_members")
        )

    def create(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can create warehouses.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can update warehouses.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can update warehouses.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can deactivate warehouses.")
        instance = self.get_object()

        # BR-03 / BR-15: Check pending transfers before deactivation
        has_pending_transfers = (
            instance.transfers_sent.filter(status__in=["draft", "dispatched"]).exists()
            or instance.transfers_received.filter(status__in=["draft", "dispatched"]).exists()
        )
        if has_pending_transfers:
            raise PermissionDenied("Cannot deactivate a warehouse with pending transfers.")

        instance.is_active = False
        instance.save(update_fields=["is_active"])

        AuditLog.objects.create(
            user=request.user,
            action="deactivate_warehouse",
            entity_type="warehouse",
            entity_id=str(instance.id),
            warehouse=instance,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], permission_classes=[IsAdmin])
    def overview(self, request):
        """
        FR-WH-004: All warehouses with manager, staff, address, units,
        low stock, sales today and last 30 days, pending transfers.
        """
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        thirty_days_ago = timezone.now() - timedelta(days=30)

        warehouses = (
            Warehouse.objects.all()
            .select_related("manager")
            .annotate(
                staff_count=Count(
                    "staff_members", filter=Q(staff_members__user__is_active=True), distinct=True
                ),
                products_stocked=Count(
                    "stock_levels", filter=Q(stock_levels__quantity__gt=0), distinct=True
                ),
                total_units=Sum("stock_levels__quantity", default=0),
                low_stock_count=Count(
                    "stock_levels",
                    filter=Q(stock_levels__quantity__lte=F("stock_levels__reorder_level")),
                    distinct=True,
                ),
                sales_today=Sum(
                    "sales__total_amount",
                    filter=Q(sales__created_at__gte=today_start),
                    default=0,
                ),
                sales_30d=Sum(
                    "sales__total_amount",
                    filter=Q(sales__created_at__gte=thirty_days_ago),
                    default=0,
                ),
                pending_transfers=Count(
                    "transfers_received",
                    filter=Q(transfers_received__status__in=["dispatched"]),
                    distinct=True,
                ),
            )
        )

        serializer = WarehouseOverviewSerializer(warehouses, many=True)
        return Response(serializer.data)
