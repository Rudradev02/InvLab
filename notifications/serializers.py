from rest_framework import serializers
from .models import NotificationSettings, LowStockAlertState


class NotificationSettingsSerializer(serializers.ModelSerializer):
    additional_recipients_list = serializers.SerializerMethodField()

    class Meta:
        model = NotificationSettings
        fields = [
            "id",
            "enable_low_stock_alerts",
            "enable_daily_summary",
            "additional_recipients",
            "additional_recipients_list",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "additional_recipients_list"]

    def get_additional_recipients_list(self, obj) -> list[str]:
        return obj.get_additional_recipients_list()


class LowStockAlertItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(source="product.id")
    product_name = serializers.CharField(source="product.name")
    sku = serializers.CharField(source="product.sku")
    barcode = serializers.CharField(source="product.barcode", allow_null=True)
    warehouse_id = serializers.IntegerField(source="warehouse.id")
    warehouse_name = serializers.CharField(source="warehouse.name")
    warehouse_code = serializers.CharField(source="warehouse.code")
    quantity = serializers.IntegerField()
    reorder_level = serializers.IntegerField()
    is_out_of_stock = serializers.SerializerMethodField()
    last_alerted_at = serializers.DateTimeField(allow_null=True)

    def get_is_out_of_stock(self, obj) -> bool:
        return obj.quantity <= 0
