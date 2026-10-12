from rest_framework import serializers
from .models import Warehouse
from accounts.models import User


class ManagerMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email"]


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
    products_stocked = serializers.IntegerField(read_only=True)
    total_units = serializers.IntegerField(read_only=True)
    low_stock_count = serializers.IntegerField(read_only=True)
    sales_today = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    sales_30d = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    pending_transfers = serializers.IntegerField(read_only=True)

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
            "products_stocked",
            "total_units",
            "low_stock_count",
            "sales_today",
            "sales_30d",
            "pending_transfers",
        ]
