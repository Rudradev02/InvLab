from datetime import timedelta

from django.db.models import Count, F, Max, Q, Sum
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
            raise PermissionDenied("Only Admin can deactivate or delete warehouses.")
        instance = self.get_object()

        # BR-03 / BR-15: Check pending transfers before deactivation/deletion
        has_pending_transfers = (
            instance.transfers_sent.filter(status__in=["draft", "dispatched"]).exists()
            or instance.transfers_received.filter(status__in=["draft", "dispatched"]).exists()
        )
        if has_pending_transfers:
            raise PermissionDenied("Cannot deactivate or delete a warehouse with pending transfers.")

        has_stock = instance.stock_levels.filter(quantity__gt=0).exists()
        has_sales = instance.sales.exists()
        has_staff = instance.staff_members.filter(user__is_active=True).exists()

        if has_stock or has_sales or has_staff:
            instance.is_active = False
            instance.save(update_fields=["is_active"])

            AuditLog.objects.create(
                user=request.user,
                action="deactivate_warehouse",
                entity_type="warehouse",
                entity_id=str(instance.id),
                warehouse=instance,
            )
            return Response(
                {
                    "message": "Warehouse has associated stock, sales, or staff; deactivated instead of deleted.",
                    "is_active": False,
                    "deactivated": True,
                },
                status=status.HTTP_200_OK,
            )

        AuditLog.objects.create(
            user=request.user,
            action="delete_warehouse",
            entity_type="warehouse",
            entity_id=str(instance.id),
            warehouse=None,
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin], url_path="activate")
    def activate(self, request, pk=None):
        instance = self.get_object()
        instance.is_active = True
        instance.save(update_fields=["is_active"])

        AuditLog.objects.create(
            user=request.user,
            action="activate_warehouse",
            entity_type="warehouse",
            entity_id=str(instance.id),
            warehouse=instance,
        )
        return Response({"message": f"Warehouse '{instance.name}' activated.", "is_active": True})

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin], url_path="deactivate")
    def deactivate(self, request, pk=None):
        instance = self.get_object()
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
        return Response({"message": f"Warehouse '{instance.name}' deactivated.", "is_active": False})

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
            .select_related("manager", "manager__profile")
            .prefetch_related("staff_members__user", "staff_members__user__profile")
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
                sales_today_count=Count(
                    "sales",
                    filter=Q(sales__created_at__gte=today_start),
                    distinct=True,
                ),
                sales_30d=Sum(
                    "sales__total_amount",
                    filter=Q(sales__created_at__gte=thirty_days_ago),
                    default=0,
                ),
                sales_30d_count=Count(
                    "sales",
                    filter=Q(sales__created_at__gte=thirty_days_ago),
                    distinct=True,
                ),
                pending_transfers=Count(
                    "transfers_received",
                    filter=Q(transfers_received__status__in=["dispatched"]),
                    distinct=True,
                ),
                last_activity=Max("stock_movements__created_at"),
            )
        )

        serializer = WarehouseOverviewSerializer(warehouses, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], permission_classes=[IsAdmin], url_path="full-detail")
    def full_detail(self, request, pk=None):
        warehouse = self.get_object()

        # Staff
        staff_profiles = warehouse.staff_members.select_related("user", "user__profile").all()
        staff_data = [
            {
                "id": p.user.id,
                "username": p.user.username,
                "first_name": p.user.first_name,
                "last_name": p.user.last_name,
                "full_name": f"{p.user.first_name} {p.user.last_name}".strip() or p.user.username,
                "email": p.user.email,
                "phone": p.phone,
                "role": p.user.get_role(),
                "is_active": p.user.is_active,
            }
            for p in staff_profiles
            if getattr(p, "user", None)
        ]

        from inventory.models import StockLevel, StockMovement

        stock_qs = (
            StockLevel.objects.filter(warehouse=warehouse)
            .select_related("product")
            .order_by("product__name")
        )
        stock_data = [
            {
                "id": sl.id,
                "product_id": sl.product.id,
                "product_name": sl.product.name,
                "sku": sl.product.sku,
                "barcode": getattr(sl.product, "barcode", ""),
                "category": sl.product.category.name if getattr(sl.product, "category", None) else "",
                "quantity": sl.quantity,
                "reorder_level": sl.reorder_level,
                "unit": getattr(sl.product, "unit", "pcs"),
                "price": str(sl.product.price),
                "is_low_stock": sl.quantity <= sl.reorder_level,
            }
            for sl in stock_qs
        ]

        from sales.models import Sale

        sales_qs = (
            Sale.objects.filter(warehouse=warehouse)
            .select_related("user")
            .prefetch_related("lines")
            .order_by("-created_at")[:50]
        )
        sales_data = [
            {
                "id": s.id,
                "sale_number": s.sale_number,
                "total_amount": str(s.total_amount),
                "user": s.user.username if s.user else "-",
                "user_name": f"{s.user.first_name} {s.user.last_name}".strip()
                or (s.user.username if s.user else "-"),
                "created_at": s.created_at.isoformat(),
                "items_count": s.lines.count(),
                "notes": s.notes,
            }
            for s in sales_qs
        ]

        movements_qs = (
            StockMovement.objects.filter(warehouse=warehouse)
            .select_related("product", "user")
            .order_by("-created_at")[:50]
        )
        ledger_data = [
            {
                "id": sm.id,
                "product_id": sm.product.id,
                "product_name": sm.product.name,
                "product_sku": sm.product.sku,
                "delta": sm.delta,
                "movement_type": sm.movement_type,
                "reason": sm.reason,
                "reference": sm.reference,
                "balance_after": sm.balance_after,
                "user": sm.user.username if sm.user else "-",
                "created_at": sm.created_at.isoformat(),
            }
            for sm in movements_qs
        ]

        summary = StockLevel.objects.filter(warehouse=warehouse).aggregate(
            total_units=Sum("quantity", default=0),
            products_stocked=Count("id", filter=Q(quantity__gt=0)),
            low_stock_count=Count("id", filter=Q(quantity__lte=F("reorder_level"))),
        )

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        sales_agg = Sale.objects.filter(warehouse=warehouse).aggregate(
            sales_today_amount=Sum("total_amount", filter=Q(created_at__gte=today_start), default=0),
            sales_today_count=Count("id", filter=Q(created_at__gte=today_start)),
            sales_30d_amount=Sum("total_amount", filter=Q(created_at__gte=thirty_days_ago), default=0),
            sales_30d_count=Count("id", filter=Q(created_at__gte=thirty_days_ago)),
        )

        overview_serializer = WarehouseSerializer(warehouse)

        return Response(
            {
                "warehouse": overview_serializer.data,
                "summary": {
                    **summary,
                    **sales_agg,
                },
                "staff": staff_data,
                "stock": stock_data,
                "sales": sales_data,
                "ledger": ledger_data,
            }
        )

