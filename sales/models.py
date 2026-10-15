from django.conf import settings
from django.db import models

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
    idempotency_key = models.CharField(max_length=64, blank=True, null=True, db_index=True)

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
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, related_name="sale_lines"
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "sales_sale_line"
        unique_together = ("sale", "product")

    def __str__(self):
        return f"{self.quantity}x {self.product.sku} @ ₹{self.unit_price}"


class SaleReturn(TimestampedModel):
    REFUND_METHOD_CHOICES = (
        ("cash", "Cash"),
        ("original_payment", "Original Payment Method"),
        ("store_credit", "Store Credit"),
        ("upi", "UPI"),
        ("bank_transfer", "Bank Transfer"),
    )

    return_number = models.CharField(max_length=40, unique=True, db_index=True)
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name="returns",
    )
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="sale_returns",
    )
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="processed_returns",
    )
    total_refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refund_method = models.CharField(max_length=30, choices=REFUND_METHOD_CHOICES, default="cash")
    reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "sales_sale_return"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["warehouse", "-created_at"]),
            models.Index(fields=["sale", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.return_number} for {self.sale.sale_number} - ₹{self.total_refund_amount}"


class SaleReturnLine(models.Model):
    sale_return = models.ForeignKey(
        SaleReturn,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    sale_line = models.ForeignKey(
        SaleLine,
        on_delete=models.PROTECT,
        related_name="return_lines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="sale_return_lines",
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "sales_sale_return_line"
        unique_together = ("sale_return", "sale_line")

    def __str__(self):
        return f"{self.quantity}x {self.product.sku} returned - ₹{self.refund_amount}"

