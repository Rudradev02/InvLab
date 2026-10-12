from rest_framework.permissions import BasePermission

ROLE_ADMIN = "Admin"
ROLE_MANAGER = "Warehouse Manager"
ROLE_STAFF = "Staff"


def get_user_role(user) -> str | None:
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return ROLE_ADMIN
    # Check groups
    groups = set(user.groups.values_list("name", flat=True))
    if ROLE_ADMIN in groups:
        return ROLE_ADMIN
    if ROLE_MANAGER in groups:
        return ROLE_MANAGER
    if ROLE_STAFF in groups:
        return ROLE_STAFF
    return None


class IsAdmin(BasePermission):
    """Allows access only to Admin users."""

    def has_permission(self, request, view):
        return get_user_role(request.user) == ROLE_ADMIN


class IsWarehouseManager(BasePermission):
    """Allows access to Admin or Warehouse Manager."""

    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role in (ROLE_ADMIN, ROLE_MANAGER)


class IsStaff(BasePermission):
    """Allows access to any valid staff, manager, or admin."""

    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role in (ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF)


class IsWarehouseStaffOrManager(BasePermission):
    """Allows access specifically to Staff or Manager of their assigned warehouse."""

    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role in (ROLE_MANAGER, ROLE_STAFF)
