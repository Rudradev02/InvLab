from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class StockTransfer(TimestampedModel):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("dispatched", "Dispatched"),
        ("received", "Received"),
        ("cancelled", "Cancelled"),
    )

    transfer_number = models.CharField(max_length=40, unique=True, db_index=True)
    from_warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="transfers_sent",
    )
    to_warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="transfers_received",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True)
    notes = models.TextField(blank=True, default="")

    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_dispatched",
    )
    dispatched_at = models.DateTimeField(null=True, blank=True)

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_received_by",
    )
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "transfers_stock_transfer"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.transfer_number}: {self.from_warehouse.code} -> {self.to_warehouse.code} ({self.status})"


class StockTransferLine(models.Model):
    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="transfer_lines",
    )
    dispatched_quantity = models.PositiveIntegerField()
    received_quantity = models.PositiveIntegerField(default=0)
    variance = models.IntegerField(default=0)

    class Meta:
        db_table = "transfers_stock_transfer_line"
        unique_together = ("transfer", "product")

    def __str__(self):
        return f"{self.product.sku}: sent {self.dispatched_quantity}, received {self.received_quantity}"
