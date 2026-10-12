from rest_framework.exceptions import NotFound, PermissionDenied

from core.permissions import ROLE_ADMIN, get_user_role


class WarehouseScopeMixin:
    """
    Ensures queryset is strictly filtered by the user's assigned warehouse
    for Managers and Staff. Admins can view all, or optionally filter with ?warehouse=<id>.
    Detail lookups automatically return 404 for records outside the user's warehouse.
    """

    warehouse_field = "warehouse"

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if not user or not user.is_authenticated:
            return qs.none()

        role = get_user_role(user)

        # Admin can view all warehouses or filter by ?warehouse=<id>
        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                filter_kwargs = {f"{self.warehouse_field}_id": warehouse_id}
                return qs.filter(**filter_kwargs)
            return qs

        # Warehouse Manager and Staff are strictly scoped to their assigned warehouse
        profile = getattr(user, "profile", None)
        if not profile or not profile.warehouse_id:
            return qs.none()

        filter_kwargs = {f"{self.warehouse_field}_id": profile.warehouse_id}
        return qs.filter(**filter_kwargs)

    def get_effective_warehouse(self, serializer=None):
        """
        Helper for create actions:
        - Staff/Manager: always their profile warehouse.
        - Admin: explicitly passed warehouse, or from query/body.
        """
        user = self.request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            profile = getattr(user, "profile", None)
            if not profile or not profile.warehouse:
                raise PermissionDenied("User is not assigned to any warehouse.")
            return profile.warehouse

        # For Admin
        warehouse_id = self.request.data.get("warehouse") or self.request.query_params.get(
            "warehouse"
        )
        if warehouse_id:
            from warehouses.models import Warehouse

            try:
                return Warehouse.objects.get(pk=warehouse_id, is_active=True)
            except Warehouse.DoesNotExist:
                raise NotFound("Specified warehouse not found or is inactive.") from None

        return None
