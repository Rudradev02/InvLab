from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from core.permissions import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_STAFF,
    IsAdmin,
    IsWarehouseManager,
    get_user_role,
)

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    UserSerializer,
)


class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)

        AuditLog.objects.create(
            user=user,
            action="login",
            entity_type="user",
            entity_id=str(user.id),
            warehouse=getattr(getattr(user, "profile", None), "warehouse", None),
            details={"ip": request.META.get("REMOTE_ADDR")},
        )

        user_data = UserSerializer(user).data
        # Return rotated CSRF token so frontend can track it explicitly
        token = get_token(request)
        return Response({**user_data, "csrfToken": token})


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def post(self, request):
        user = request.user
        if user and user.is_authenticated:
            AuditLog.objects.create(
                user=user,
                action="logout",
                entity_type="user",
                entity_id=str(user.id),
                warehouse=getattr(getattr(user, "profile", None), "warehouse", None),
            )
        logout(request)
        token = get_token(request)
        return Response({"message": "Logged out successfully.", "csrfToken": token})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save()
        login(request, user)  # Keep session active after password change

        AuditLog.objects.create(
            user=user,
            action="change_password",
            entity_type="user",
            entity_id=str(user.id),
            warehouse=getattr(getattr(user, "profile", None), "warehouse", None),
        )

        return Response({"message": "Password updated successfully."})


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        if role == ROLE_ADMIN:
            qs = User.objects.all().select_related("profile__warehouse").prefetch_related("groups")
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(profile__warehouse_id=warehouse_id)
            return qs

        if role == ROLE_MANAGER:
            # Manager sees only staff members of their own warehouse
            profile = getattr(user, "profile", None)
            if not profile or not profile.warehouse_id:
                return User.objects.none()
            return (
                User.objects.filter(
                    profile__warehouse_id=profile.warehouse_id,
                    groups__name=ROLE_STAFF,
                )
                .select_related("profile__warehouse")
                .prefetch_related("groups")
            )

        return User.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)

        if role == ROLE_MANAGER:
            # Manager can only create staff in their own warehouse
            profile = getattr(user, "profile", None)
            if not profile or not profile.warehouse_id:
                raise PermissionDenied("Manager has no assigned warehouse.")
            new_user = serializer.save(role_name=ROLE_STAFF, warehouse_id=profile.warehouse_id)
        else:
            new_user = serializer.save()

        AuditLog.objects.create(
            user=user,
            action="create_user",
            entity_type="user",
            entity_id=str(new_user.id),
            warehouse=getattr(getattr(new_user, "profile", None), "warehouse", None),
            details={"username": new_user.username, "role": new_user.get_role()},
        )

    def perform_update(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        instance = serializer.instance
        old_role = instance.get_role()
        old_warehouse = getattr(getattr(instance, "profile", None), "warehouse", None)

        # 1. Nobody changes their own role
        if instance == user and "role_name" in self.request.data:
            new_role = self.request.data.get("role_name")
            if new_role and new_role != old_role:
                raise PermissionDenied("You cannot change your own role.")

        # 2. Manager scoping checks
        if role == ROLE_MANAGER:
            manager_wh_id = getattr(getattr(user, "profile", None), "warehouse_id", None)
            target_wh_id = getattr(getattr(instance, "profile", None), "warehouse_id", None)
            if target_wh_id != manager_wh_id or old_role != ROLE_STAFF:
                raise PermissionDenied("Managers can only update Staff accounts in their assigned warehouse.")
            new_role = self.request.data.get("role_name")
            if new_role and new_role != ROLE_STAFF:
                raise PermissionDenied("Managers can only manage Staff accounts.")
            new_wh_id = self.request.data.get("warehouse_id")
            if new_wh_id and int(new_wh_id) != manager_wh_id:
                raise PermissionDenied("Managers cannot reassign staff to other warehouses.")

        # 3. Last active Admin cannot be demoted or deactivated
        if old_role == ROLE_ADMIN or instance.is_superuser:
            admin_count = User.objects.filter(is_active=True, groups__name=ROLE_ADMIN).count()
            if admin_count <= 1:
                new_role = self.request.data.get("role_name")
                if new_role and new_role != ROLE_ADMIN:
                    raise PermissionDenied("Cannot demote the last remaining active Admin.")
                if "is_active" in self.request.data and not self.request.data["is_active"]:
                    raise PermissionDenied("Cannot deactivate the last remaining active Admin.")

        updated_user = serializer.save()
        new_role = updated_user.get_role()
        new_warehouse = getattr(getattr(updated_user, "profile", None), "warehouse", None)

        details = {}
        if old_role != new_role:
            details["role_changed"] = {"from": old_role, "to": new_role}
        old_wh_code = old_warehouse.code if old_warehouse else None
        new_wh_code = new_warehouse.code if new_warehouse else None
        if old_wh_code != new_wh_code:
            details["warehouse_changed"] = {"from": old_wh_code, "to": new_wh_code}

        AuditLog.objects.create(
            user=user,
            action="update_user",
            entity_type="user",
            entity_id=str(updated_user.id),
            warehouse=new_warehouse or old_warehouse,
            details=details,
        )

    def perform_destroy(self, instance):
        user = self.request.user
        role = get_user_role(user)

        # Soft delete / deactivate (BR-09, BR-12)
        if instance == user:
            raise PermissionDenied("You cannot deactivate your own account.")

        if role == ROLE_MANAGER:
            manager_wh_id = getattr(getattr(user, "profile", None), "warehouse_id", None)
            target_wh_id = getattr(getattr(instance, "profile", None), "warehouse_id", None)
            if target_wh_id != manager_wh_id or instance.get_role() != ROLE_STAFF:
                raise PermissionDenied("Managers can only deactivate Staff accounts in their assigned warehouse.")

        if instance.is_superuser or instance.get_role() == ROLE_ADMIN:
            # Check if this is the last active admin
            admin_count = User.objects.filter(is_active=True, groups__name=ROLE_ADMIN).count()
            if admin_count <= 1:
                raise PermissionDenied("The last active Admin cannot be deactivated.")

        instance.is_active = False
        instance.save(update_fields=["is_active"])

        AuditLog.objects.create(
            user=self.request.user,
            action="deactivate_user",
            entity_type="user",
            entity_id=str(instance.id),
            warehouse=getattr(getattr(instance, "profile", None), "warehouse", None),
        )

    @action(detail=True, methods=["post"], url_path="reset-password", permission_classes=[IsWarehouseManager])
    def reset_password(self, request, pk=None):
        target_user = self.get_object()
        role = get_user_role(request.user)

        if role == ROLE_MANAGER:
            manager_wh_id = getattr(getattr(request.user, "profile", None), "warehouse_id", None)
            target_wh_id = getattr(getattr(target_user, "profile", None), "warehouse_id", None)
            if target_wh_id != manager_wh_id or target_user.get_role() != ROLE_STAFF:
                raise PermissionDenied("Managers can only reset passwords for staff in their assigned warehouse.")

        new_password = request.data.get("new_password") or "InvLab@123"
        target_user.set_password(new_password)
        target_user.must_change_password = True
        target_user.save(update_fields=["password", "must_change_password"])

        AuditLog.objects.create(
            user=request.user,
            action="reset_password",
            entity_type="user",
            entity_id=str(target_user.id),
            warehouse=getattr(getattr(target_user, "profile", None), "warehouse", None),
        )
        return Response({"message": f"Password reset successfully for @{target_user.username}."})

    @action(detail=True, methods=["post"], url_path="activate", permission_classes=[IsWarehouseManager])
    def activate(self, request, pk=None):
        target_user = self.get_object()
        role = get_user_role(request.user)

        if role == ROLE_MANAGER:
            manager_wh_id = getattr(getattr(request.user, "profile", None), "warehouse_id", None)
            target_wh_id = getattr(getattr(target_user, "profile", None), "warehouse_id", None)
            if target_wh_id != manager_wh_id or target_user.get_role() != ROLE_STAFF:
                raise PermissionDenied("Managers can only activate staff in their assigned warehouse.")

        target_user.is_active = True
        target_user.save(update_fields=["is_active"])

        AuditLog.objects.create(
            user=request.user,
            action="activate_user",
            entity_type="user",
            entity_id=str(target_user.id),
            warehouse=getattr(getattr(target_user, "profile", None), "warehouse", None),
        )
        return Response({"message": f"User @{target_user.username} activated.", "is_active": True})
