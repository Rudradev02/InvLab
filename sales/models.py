from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class Sale(TimestampedModel):
    sale_number = models.CharField(max_length=40, unique=True, db_index=True)
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="sales",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sales_recorded",
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "sales_sale"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["warehouse", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.sale_number} ({self.warehouse.code}) - ₹{self.total_amount}"


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="sale_lines")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "sales_sale_line"
        unique_together = ("sale", "product")

    def __str__(self):
        return f"{self.quantity}x {self.product.sku} @ ₹{self.unit_price}"
