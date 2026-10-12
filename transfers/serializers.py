from rest_framework import serializers
from .models import StockTransfer, StockTransferLine
from catalog.serializers import ProductSerializer


class StockTransferLineSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = StockTransferLine
        fields = [
            "id",
            "product",
            "product_sku",
            "product_name",
            "dispatched_quantity",
            "received_quantity",
            "variance",
        ]


class StockTransferSerializer(serializers.ModelSerializer):
    lines = StockTransferLineSerializer(many=True, read_only=True)
    from_warehouse_name = serializers.CharField(source="from_warehouse.name", read_only=True)
    to_warehouse_name = serializers.CharField(source="to_warehouse.name", read_only=True)
    dispatched_by_username = serializers.CharField(source="dispatched_by.username", read_only=True)
    received_by_username = serializers.CharField(source="received_by.username", read_only=True)

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "transfer_number",
            "from_warehouse",
            "from_warehouse_name",
            "to_warehouse",
            "to_warehouse_name",
            "status",
            "notes",
            "dispatched_by",
            "dispatched_by_username",
            "dispatched_at",
            "received_by",
            "received_by_username",
            "received_at",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CreateTransferLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class CreateTransferRequestSerializer(serializers.Serializer):
    from_warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    to_warehouse_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = CreateTransferLineSerializer(many=True, allow_empty=False)


class ReceiveTransferItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    received_quantity = serializers.IntegerField(min_value=0)


class ReceiveTransferRequestSerializer(serializers.Serializer):
    items = ReceiveTransferItemSerializer(many=True, required=False, default=list)
