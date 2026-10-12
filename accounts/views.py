from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import PermissionDenied, NotFound

from .models import User
from .serializers import (
    UserSerializer,
    LoginSerializer,
    ChangePasswordSerializer,
)
from core.permissions import (
    IsAdmin,
    IsWarehouseManager,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_STAFF,
    get_user_role,
)
from audit.models import AuditLog


class CsrfView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


class LoginView(APIView):
    permission_classes = [AllowAny]

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

        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        AuditLog.objects.create(
            user=user,
            action="logout",
            entity_type="user",
            entity_id=str(user.id),
            warehouse=getattr(getattr(user, "profile", None), "warehouse", None),
        )
        logout(request)
        return Response({"message": "Logged out successfully."})


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
            return User.objects.filter(
                profile__warehouse_id=profile.warehouse_id,
                groups__name=ROLE_STAFF,
            ).select_related("profile__warehouse").prefetch_related("groups")

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

    def perform_destroy(self, instance):
        # Soft delete / deactivate (BR-09, BR-12)
        if instance == self.request.user:
            raise PermissionDenied("You cannot deactivate your own account.")

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
