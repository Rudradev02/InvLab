from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "is_active", "product_count", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_product_count(self, obj) -> int:
        return obj.products.filter(is_active=True).count()


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    barcode = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        validators=[],
    )
    is_active = serializers.BooleanField(default=True)
    image = serializers.ImageField(required=False, allow_null=True)
    thumbnail = serializers.ImageField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "category",
            "category_name",
            "description",
            "price",
            "cost_price",
            "gst_rate",
            "hsn_code",
            "barcode",
            "image",
            "thumbnail",
            "stock",
            "default_reorder_level",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "thumbnail", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # Handle empty string for image in multipart or JSON as None (clearing image)
        # Do not use data.copy() because deepcopying TemporaryUploadedFile fails on BufferedRandom
        if isinstance(data, dict):
            if "image" in data and data.get("image") in ("", "null", "undefined"):
                data = {k: (None if k == "image" else v) for k, v in data.items()}
        elif hasattr(data, "dict"):
            if "image" in data and data.get("image") in ("", "null", "undefined"):
                new_data = data.dict()
                new_data["image"] = None
                data = new_data
        return super().to_internal_value(data)

    def validate_image(self, value):
        if not value:
            return None
        from django.core.exceptions import ValidationError as DjangoValidationError
        from .image_utils import validate_product_image

        try:
            validate_product_image(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                list(exc.messages) if hasattr(exc, "messages") else str(exc)
            )
        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate_cost_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost price cannot be negative.")
        return value

    def validate_barcode(self, value):
        if not value:
            return None
        value = value.strip()
        if not value:
            return None
        qs = Product.objects.filter(barcode__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        existing = qs.first()
        if existing:
            raise serializers.ValidationError(
                f"A product with barcode '{value}' already exists ({existing.name} - SKU: {existing.sku})."
            )
        return value
