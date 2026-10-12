from rest_framework import serializers
from decimal import Decimal
from .models import Sale, SaleLine
from catalog.serializers import ProductSerializer


class SaleLineSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SaleLine
        fields = [
            "id",
            "product",
            "product_sku",
            "product_name",
            "quantity",
            "unit_price",
            "subtotal",
        ]


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    cashier_name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "sale_number",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "user",
            "cashier_name",
            "total_amount",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CreateSaleLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class CreateSaleRequestSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = CreateSaleLineSerializer(many=True, allow_empty=False)
