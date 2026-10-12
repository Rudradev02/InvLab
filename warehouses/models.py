from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class Warehouse(TimestampedModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=10, unique=True)
    address_line1 = models.CharField(max_length=160)
    address_line2 = models.CharField(max_length=160, blank=True, default="")
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80)
    pincode = models.CharField(max_length=6)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True, default="")
    manager = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_warehouse",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "warehouses_warehouse"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.upper().strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"
