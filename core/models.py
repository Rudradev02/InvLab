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
