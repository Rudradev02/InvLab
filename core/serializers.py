from rest_framework import serializers

from .models import BusinessSettings


class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSettings
        fields = [
            "id",
            "name",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "pincode",
            "phone",
            "email",
            "gstin",
            "invoice_prefix",
            "prices_include_tax",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
