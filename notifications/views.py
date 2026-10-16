from django.db.models import F
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    IsStaff,
    get_user_role,
)
from inventory.models import StockLevel
from .models import LowStockAlertState, NotificationSettings
from .serializers import LowStockAlertItemSerializer, NotificationSettingsSerializer


class NotificationSettingsView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        settings_obj = NotificationSettings.get_settings()
        serializer = NotificationSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial=False):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update notification settings.")

        settings_obj = NotificationSettings.get_settings()
        serializer = NotificationSettingsSerializer(
            settings_obj, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LowStockAlertsView(APIView):
    """
    Returns active low-stock & out-of-stock items for the notification bell.
    Scoped by role:
    - Admin: all warehouses (can optionally filter by ?warehouse=ID).
    - Manager / Staff: their own assigned warehouse only.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        role = get_user_role(request.user)
        warehouse_id = request.query_params.get("warehouse")

        qs = StockLevel.objects.filter(
            quantity__lte=F("reorder_level"),
            warehouse__is_active=True,
            product__is_active=True,
        ).select_related("warehouse", "product")

        if role == ROLE_ADMIN:
            if warehouse_id:
                qs = qs.filter(warehouse_id=warehouse_id)
        else:
            profile = getattr(request.user, "profile", None)
            user_warehouse = getattr(profile, "warehouse", None)
            if not user_warehouse:
                return Response({"count": 0, "results": []})
            qs = qs.filter(warehouse=user_warehouse)

        # Prefetch alert states for last_alerted_at timestamps
        alert_states = {
            (st.warehouse_id, st.product_id): st.last_alerted_at
            for st in LowStockAlertState.objects.filter(is_alerted=True)
        }

        # Order by most critical: out-of-stock first, then lowest quantity
        items = list(qs.order_by("quantity", "product__name"))

        # Attach last_alerted_at
        for item in items:
            setattr(item, "last_alerted_at", alert_states.get((item.warehouse_id, item.product_id)))

        serializer = LowStockAlertItemSerializer(items, many=True)
        return Response({
            "count": len(items),
            "results": serializer.data,
        })
