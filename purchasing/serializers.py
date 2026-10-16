from decimal import Decimal
from rest_framework import serializers
from catalog.models import Product
from purchasing.models import PurchaseOrder, PurchaseOrderLine, Supplier
from warehouses.models import Warehouse


class SupplierSerializer(serializers.ModelSerializer):
    po_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_person",
            "phone",
            "email",
            "gstin",
            "address",
            "is_active",
            "po_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_po_count(self, obj) -> int:
        return obj.purchase_orders.count()


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    quantity_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "quantity_ordered",
            "quantity_received",
            "quantity_remaining",
            "unit_cost",
            "subtotal",
        ]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    total_ordered_units = serializers.SerializerMethodField()
    total_received_units = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier",
            "supplier_name",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "status",
            "order_date",
            "expected_delivery_date",
            "total_amount",
            "created_by",
            "created_by_username",
            "notes",
            "lines",
            "total_ordered_units",
            "total_received_units",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "po_number", "status", "total_amount", "created_by", "created_at", "updated_at"]

    def get_total_ordered_units(self, obj) -> int:
        return sum(l.quantity_ordered for l in obj.lines.all())

    def get_total_received_units(self, obj) -> int:
        return sum(l.quantity_received for l in obj.lines.all())


class CreatePOLineInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity_ordered = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"))


class CreatePurchaseOrderSerializer(serializers.Serializer):
    supplier_id = serializers.IntegerField(min_value=1)
    warehouse_id = serializers.IntegerField(min_value=1)
    order_date = serializers.DateField(required=False, allow_null=True)
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = CreatePOLineInputSerializer(many=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("At least one product line is required.")
        product_ids = [l["product_id"] for l in value]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Duplicate products found in line items.")
        return value


class ReceiveItemInputSerializer(serializers.Serializer):
    line_id = serializers.IntegerField(min_value=1)
    quantity_received = serializers.IntegerField(min_value=1)


class ReceivePurchaseOrderSerializer(serializers.Serializer):
    receipts = ReceiveItemInputSerializer(many=True)

    def validate_receipts(self, value):
        if not value:
            raise serializers.ValidationError("At least one receipt line is required.")
        return value
