from rest_framework import serializers

from catalog.models import Product
from catalog.serializers import ProductSerializer

from .models import StockLevel, StockMovement


class StockLevelSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        source="product",
        write_only=True,
        required=False,
    )
    initial_quantity = serializers.IntegerField(
        write_only=True, required=False, default=0, min_value=0
    )
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = StockLevel
        fields = [
            "id",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "product",
            "product_id",
            "initial_quantity",
            "quantity",
            "reorder_level",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "quantity", "created_at", "updated_at"]
        extra_kwargs = {
            "warehouse": {"required": False},
        }
        validators = []

    def get_status(self, obj) -> str:
        if obj.quantity <= 0:
            return "out_of_stock"
        if obj.quantity <= obj.reorder_level:
            return "low_stock"
        return "in_stock"


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "stock_level",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "product",
            "product_name",
            "product_sku",
            "delta",
            "movement_type",
            "user",
            "username",
            "reference",
            "reason",
            "balance_after",
            "created_at",
        ]
        read_only_fields = fields


class ReceiveStockSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)


class AdjustStockSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    delta = serializers.IntegerField()
    reason = serializers.CharField(required=True, allow_blank=False, min_length=2)
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_delta(self, value):
        if value == 0:
            raise serializers.ValidationError("Adjustment delta cannot be zero.")
        return value
