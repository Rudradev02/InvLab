from django.db import models

from core.models import TimestampedModel


class Category(TimestampedModel):
    name = models.CharField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_category"
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(TimestampedModel):
    sku = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=160, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Weighted average unit cost price",
    )
    stock = models.IntegerField(
        default=0,
        help_text="DEPRECATED: Cached sum of warehouse stock levels. Use StockLevel for active inventory.",
    )
    default_reorder_level = models.PositiveIntegerField(default=5)
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="GST percentage rate, e.g. 0.00, 5.00, 12.00, 18.00, 28.00",
    )
    hsn_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Harmonized System of Nomenclature code",
    )
    barcode = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional barcode or QR code string (UPC, EAN, Code128, etc.)",
    )
    is_active = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        if self.barcode is not None:
            stripped = self.barcode.strip()
            self.barcode = stripped if stripped else None

    def save(self, *args, **kwargs):
        if self.barcode is not None:
            stripped = self.barcode.strip()
            self.barcode = stripped if stripped else None
        super().save(*args, **kwargs)

    class Meta:
        db_table = "catalog_product"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"
