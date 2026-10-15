from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class Customer(TimestampedModel):
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, unique=True, db_index=True)
    email = models.EmailField(blank=True, default="")
    gstin = models.CharField(max_length=20, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "customers_customer"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["phone"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Payment(TimestampedModel):
    PAYMENT_METHOD_CHOICES = (
        ("cash", "Cash"),
        ("upi", "UPI"),
        ("card", "Card"),
        ("bank_transfer", "Bank Transfer"),
        ("cheque", "Cheque"),
    )

    payment_number = models.CharField(max_length=40, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True,
    )
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.PROTECT,
        related_name="customer_payments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, default="cash")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "customers_payment"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["warehouse", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.payment_number}: ₹{self.amount} from {self.customer.name}"
