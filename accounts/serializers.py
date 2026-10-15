from django.contrib.auth import authenticate
from django.contrib.auth.models import Group
from rest_framework import serializers

from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF, get_user_role
from warehouses.models import Warehouse

from .models import User, UserProfile


class WarehouseMinimalSerializer(serializers.ModelSerializer):
    class propensity:
        pass

    class Meta:
        model = Warehouse
        fields = ["id", "name", "code", "city", "state", "is_active"]


class UserProfileSerializer(serializers.ModelSerializer):
    warehouse = WarehouseMinimalSerializer(read_only=True)
    warehouse_id = serializers.PrimaryKeyRelatedField(
        queryset=Warehouse.objects.all(),
        source="warehouse",
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = UserProfile
        fields = ["phone", "warehouse", "warehouse_id"]


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    warehouse = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    profile = UserProfileSerializer(read_only=True)
    warehouse_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role_name = serializers.ChoiceField(
        choices=[ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF],
        write_only=True,
        required=False,
    )
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "must_change_password",
            "role",
            "warehouse",
            "permissions",
            "profile",
            "warehouse_id",
            "phone",
            "role_name",
            "password",
            "last_login",
            "date_joined",
        ]
        read_only_fields = ["id", "last_login", "date_joined"]

    def get_role(self, obj) -> str:
        return get_user_role(obj) or ROLE_STAFF

    def get_warehouse(self, obj):
        profile = getattr(obj, "profile", None)
        if profile and profile.warehouse:
            return WarehouseMinimalSerializer(profile.warehouse).data
        return None

    def get_permissions(self, obj) -> list[str]:
        perms = set()
        for group in obj.groups.all():
            for perm in group.permissions.all():
                perms.add(f"{perm.content_type.app_label}.{perm.codename}")
        role = self.get_role(obj)
        perms.add(f"role:{role.lower().replace(' ', '_')}")
        return sorted(list(perms))

    def create(self, validated_data):
        warehouse_id = validated_data.pop("warehouse_id", None)
        phone = validated_data.pop("phone", "")
        role_name = validated_data.pop("role_name", ROLE_STAFF)
        password = validated_data.pop("password", None)

        user = User(
            username=validated_data.get("username"),
            email=validated_data.get("email", ""),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            must_change_password=True,
        )
        if password:
            user.set_password(password)
        else:
            user.set_password("InvLab@123")
        user.save()

        # Assign role group
        group, _ = Group.objects.get_or_create(name=role_name)
        user.groups.add(group)

        # Update profile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if phone:
            profile.phone = phone
        if warehouse_id and role_name != ROLE_ADMIN:
            try:
                profile.warehouse = Warehouse.objects.get(pk=warehouse_id)
            except Warehouse.DoesNotExist:
                pass
        profile.save()

        return user

    def update(self, instance, validated_data):
        warehouse_id = validated_data.pop("warehouse_id", None)
        phone = validated_data.pop("phone", None)
        role_name = validated_data.pop("role_name", None)
        password = validated_data.pop("password", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)
        instance.save()

        if role_name:
            instance.groups.clear()
            group, _ = Group.objects.get_or_create(name=role_name)
            instance.groups.add(group)

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if phone is not None:
            profile.phone = phone
        if warehouse_id is not None:
            if role_name == ROLE_ADMIN:
                profile.warehouse = None
            else:
                try:
                    profile.warehouse = Warehouse.objects.get(pk=warehouse_id)
                except Warehouse.DoesNotExist:
                    profile.warehouse = None
        profile.save()

        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get("username", "").strip()
        password = data.get("password", "")

        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.is_active:
            raise serializers.ValidationError("This user account has been deactivated.")

        data["user"] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value
