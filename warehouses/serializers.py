from rest_framework import serializers

from accounts.models import User

from .models import Warehouse


class ManagerMinimalSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(source="profile.phone", read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "phone"]

    def get_full_name(self, obj) -> str:
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username


class StaffMinimalSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(source="profile.phone", read_only=True)
    full_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "role",
            "is_active",
        ]

    def get_full_name(self, obj) -> str:
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username

    def get_role(self, obj) -> str:
        return obj.get_role()


class WarehouseSerializer(serializers.ModelSerializer):
    manager = ManagerMinimalSerializer(read_only=True)
    manager_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="manager",
        write_only=True,
        required=False,
        allow_null=True,
    )
    staff_count = serializers.SerializerMethodField()

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "name",
            "code",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "pincode",
            "phone",
            "email",
            "manager",
            "manager_id",
            "is_active",
            "staff_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_staff_count(self, obj) -> int:
        return obj.staff_members.filter(user__is_active=True).count()


class WarehouseOverviewSerializer(serializers.ModelSerializer):
    manager = ManagerMinimalSerializer(read_only=True)
    staff_count = serializers.IntegerField(read_only=True)
    staff = serializers.SerializerMethodField()
    products_stocked = serializers.IntegerField(read_only=True)
    total_units = serializers.IntegerField(read_only=True)
    low_stock_count = serializers.IntegerField(read_only=True)
    sales_today = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    sales_today_count = serializers.IntegerField(read_only=True)
    sales_30d = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    sales_30d_count = serializers.IntegerField(read_only=True)
    pending_transfers = serializers.IntegerField(read_only=True)
    last_activity = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            "id",
            "name",
            "code",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "pincode",
            "phone",
            "email",
            "manager",
            "is_active",
            "staff_count",
            "staff",
            "products_stocked",
            "total_units",
            "low_stock_count",
            "sales_today",
            "sales_today_count",
            "sales_30d",
            "sales_30d_count",
            "pending_transfers",
            "last_activity",
        ]

    def get_staff(self, obj) -> list[dict]:
        profiles = obj.staff_members.select_related("user").filter(user__is_active=True)
        return [
            {
                "id": p.user.id,
                "username": p.user.username,
                "first_name": p.user.first_name,
                "last_name": p.user.last_name,
                "full_name": f"{p.user.first_name} {p.user.last_name}".strip() or p.user.username,
                "email": p.user.email,
                "phone": p.phone,
                "role": p.user.get_role(),
            }
            for p in profiles
        ]
