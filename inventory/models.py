from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from core.models import TimestampedModel


class StockLevel(TimestampedModel):
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.CASCADE,
        related_name="stock_levels",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock_levels",
    )
    quantity = models.IntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=5)

    class Meta:
        db_table = "inventory_stock_level"
        unique_together = ("warehouse", "product")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name="stock_level_quantity_gte_zero",
            )
        ]
        indexes = [
            models.Index(fields=["warehouse", "quantity"]),
        ]

    def clean(self):
        if self.quantity < 0:
            raise ValidationError("Stock quantity can never be negative.")

    def __str__(self):
        return f"{self.product.name} @ {self.warehouse.name}: {self.quantity}"


class StockMovement(models.Model):
    MOVEMENT_TYPES = (
        ("receive", "Receive"),
        ("sale", "Sale"),
        ("adjustment", "Adjustment"),
        ("transfer_out", "Transfer Out"),
        ("transfer_in", "Transfer In"),
        ("return", "Return"),
    )

    stock_level = models.ForeignKey(
        StockLevel,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    delta = models.IntegerField()
    movement_type = models.CharField(max_length=30, choices=MOVEMENT_TYPES, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    reference = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "inventory_stock_movement"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["warehouse", "-created_at"]),
            models.Index(fields=["product", "-created_at"]),
        ]

    def __str__(self):
        return f"[{self.movement_type}] {self.delta} of {self.product.sku} at {self.warehouse.code}"
