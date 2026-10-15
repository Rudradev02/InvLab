from decimal import Decimal

from rest_framework import serializers

from catalog.serializers import ProductSerializer

from .models import Sale, SaleLine, SaleReturn, SaleReturnLine


class SaleReturnLineSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = SaleReturnLine
        fields = [
            "id",
            "sale_line",
            "product",
            "product_sku",
            "product_name",
            "quantity",
            "unit_price",
            "refund_amount",
        ]
        read_only_fields = fields


class SaleReturnSerializer(serializers.ModelSerializer):
    lines = SaleReturnLineSerializer(many=True, read_only=True)
    sale_number = serializers.CharField(source="sale.sale_number", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    processed_by_username = serializers.CharField(source="processed_by.username", read_only=True)

    class Meta:
        model = SaleReturn
        fields = [
            "id",
            "return_number",
            "sale",
            "sale_number",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "processed_by",
            "processed_by_username",
            "total_refund_amount",
            "refund_method",
            "reason",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SaleLineSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    returned_quantity = serializers.SerializerMethodField()
    returnable_quantity = serializers.SerializerMethodField()

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
            "returned_quantity",
            "returnable_quantity",
        ]

    def get_returned_quantity(self, obj):
        return sum(rl.quantity for rl in obj.return_lines.all())

    def get_returnable_quantity(self, obj):
        return obj.quantity - self.get_returned_quantity(obj)


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, read_only=True)
    returns = SaleReturnSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    cashier_name = serializers.CharField(source="user.username", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    total_refunded = serializers.SerializerMethodField()
    net_total = serializers.SerializerMethodField()
    return_status = serializers.SerializerMethodField()

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
            "customer",
            "customer_name",
            "customer_phone",
            "total_amount",
            "amount_paid",
            "balance_due",
            "total_refunded",
            "net_total",
            "return_status",
            "notes",
            "lines",
            "returns",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_total_refunded(self, obj):
        total = sum(r.total_refund_amount for r in obj.returns.all())
        return str(total)

    def get_net_total(self, obj):
        total_refunded = sum(r.total_refund_amount for r in obj.returns.all())
        net = obj.total_amount - total_refunded
        return str(max(Decimal("0.00"), net))

    def get_return_status(self, obj):
        returns = list(obj.returns.all())
        if not returns:
            return "not_returned"
        total_returned_units = sum(rl.quantity for r in returns for rl in r.lines.all())
        total_sold_units = sum(l.quantity for l in obj.lines.all())
        if total_returned_units >= total_sold_units:
            return "fully_returned"
        return "partially_returned"


class CreateSaleLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class CreateSaleRequestSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = CreateSaleLineSerializer(many=True, allow_empty=False)


class CreateReturnLineSerializer(serializers.Serializer):
    sale_line_id = serializers.IntegerField(required=False)
    product_id = serializers.IntegerField(required=False)
    quantity = serializers.IntegerField(min_value=1)


class CreateReturnRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    refund_method = serializers.ChoiceField(choices=SaleReturn.REFUND_METHOD_CHOICES, default="cash")
    lines = CreateReturnLineSerializer(many=True, allow_empty=False)
