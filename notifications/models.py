import re
from django.db import models
from core.models import TimestampedModel


class NotificationSettings(TimestampedModel):
    """
    Global notification preferences and alert recipients.
    Singleton pattern, accessed via get_settings().
    """

    enable_low_stock_alerts = models.BooleanField(
        default=True,
        help_text="Send email alerts when stock reaches or falls below the reorder level.",
    )
    enable_daily_summary = models.BooleanField(
        default=True,
        help_text="Send daily summary emails of low stock, sales, and credit.",
    )
    additional_recipients = models.TextField(
        blank=True,
        default="",
        help_text="Comma or newline separated list of additional email recipients.",
    )

    class Meta:
        db_table = "notifications_settings"
        verbose_name_plural = "notification settings"

    @classmethod
    def get_settings(cls) -> "NotificationSettings":
        settings, _ = cls.objects.get_or_create(id=1)
        return settings

    def get_additional_recipients_list(self) -> list[str]:
        if not self.additional_recipients:
            return []
        # Split by commas or newlines
        raw_emails = re.split(r"[\n,;]+", self.additional_recipients)
        clean = []
        for e in raw_emails:
            e_str = e.strip().lower()
            if e_str and "@" in e_str and "." in e_str:
                clean.append(e_str)
        return list(dict.fromkeys(clean))  # Preserves order, removes duplicates

    def __str__(self):
        return f"NotificationSettings (low_stock={self.enable_low_stock_alerts}, daily={self.enable_daily_summary})"


class LowStockAlertState(TimestampedModel):
    """
    State tracking per (warehouse, product) to guarantee an alert fires only once
    when stock crosses the reorder level, and resets automatically after restock.
    """

    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.CASCADE,
        related_name="low_stock_alert_states",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="low_stock_alert_states",
    )
    is_alerted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True if an email alert has already fired and stock has not been restocked.",
    )
    last_alerted_at = models.DateTimeField(null=True, blank=True)
    quantity_at_alert = models.IntegerField(default=0)
    reorder_level_at_alert = models.PositiveIntegerField(default=5)

    class Meta:
        db_table = "notifications_low_stock_alert_state"
        unique_together = ("warehouse", "product")
        indexes = [
            models.Index(fields=["warehouse", "is_alerted"]),
        ]

    def __str__(self):
        return (
            f"AlertState: {self.product.name} @ {self.warehouse.code} "
            f"(alerted={self.is_alerted}, qty={self.quantity_at_alert})"
        )
