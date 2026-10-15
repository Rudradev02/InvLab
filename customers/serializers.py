from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from .models import Customer, Payment


class CustomerSerializer(serializers.ModelSerializer):
    total_balance_due = serializers.SerializerMethodField()
    lifetime_value = serializers.SerializerMethodField()
    sales_count = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "gstin",
            "address",
            "is_active",
            "total_balance_due",
            "lifetime_value",
            "sales_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_total_balance_due(self, obj):
        total = obj.sales.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
        return f"{Decimal(total):.2f}"

    def get_lifetime_value(self, obj):
        total = obj.sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        return f"{Decimal(total):.2f}"

    def get_sales_count(self, obj):
        return obj.sales.count()


class PaymentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    sale_number = serializers.CharField(source="sale.sale_number", read_only=True, default=None)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    cashier_name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "payment_number",
            "customer",
            "customer_name",
            "customer_phone",
            "sale",
            "sale_number",
            "warehouse",
            "warehouse_name",
            "warehouse_code",
            "user",
            "cashier_name",
            "amount",
            "payment_method",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class RecordPaymentRequestSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(choices=Payment.PAYMENT_METHOD_CHOICES, default="cash")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
