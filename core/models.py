from django.db import models, transaction
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class NumberSequence(models.Model):
    """
    Locked counter row per warehouse, sequence type, and year.
    Used for safe, race-free sequential numbering (e.g., SL-PUN-2026-00001).
    """

    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.CASCADE, related_name="sequences"
    )
    sequence_type = models.CharField(max_length=20, db_index=True)  # 'sale', 'transfer'
    year = models.PositiveIntegerField(db_index=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("warehouse", "sequence_type", "year")

    @classmethod
    def get_next_number(cls, warehouse, sequence_type: str, year: int | None = None) -> int:
        if year is None:
            year = timezone.now().year

        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                warehouse=warehouse,
                sequence_type=sequence_type,
                year=year,
                defaults={"last_number": 0},
            )
            seq.last_number += 1
            seq.save(update_fields=["last_number"])
            return seq.last_number


class BusinessSettings(TimestampedModel):
    name = models.CharField(max_length=200, default="InvLab Enterprise")
    address_line1 = models.CharField(max_length=255, default="123 Tech Park, Phase 1")
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, default="Pune")
    state = models.CharField(max_length=100, default="Maharashtra")
    pincode = models.CharField(max_length=20, default="411057")
    phone = models.CharField(max_length=30, blank=True, default="+91 98765 43210")
    email = models.EmailField(blank=True, default="billing@invlab.local")
    gstin = models.CharField(max_length=20, default="27AABCU9603R1ZM")
    invoice_prefix = models.CharField(max_length=10, blank=True, default="")
    prices_include_tax = models.BooleanField(
        default=False,
        help_text="If True, product catalog prices include GST. If False, GST is added on top.",
    )

    class Meta:
        db_table = "core_business_settings"
        verbose_name_plural = "business settings"

    @classmethod
    def get_settings(cls):
        settings, _ = cls.objects.get_or_create(id=1)
        return settings
