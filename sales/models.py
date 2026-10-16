from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from core.models import TimestampedModel


DISCOUNT_TYPE_NONE = "none"
DISCOUNT_TYPE_AMOUNT = "amount"
DISCOUNT_TYPE_PERCENT = "percent"

DISCOUNT_TYPE_CHOICES = [
    (DISCOUNT_TYPE_NONE, "None"),
    (DISCOUNT_TYPE_AMOUNT, "Amount"),
    (DISCOUNT_TYPE_PERCENT, "Percent"),
]

PAYMENT_METHOD_CASH = "cash"
PAYMENT_METHOD_UPI = "upi"
PAYMENT_METHOD_CARD = "card"
PAYMENT_METHOD_CREDIT = "credit"
PAYMENT_METHOD_UNKNOWN = "unknown"

PAYMENT_METHOD_CHOICES = [
    (PAYMENT_METHOD_CASH, "Cash"),
    (PAYMENT_METHOD_UPI, "UPI"),
    (PAYMENT_METHOD_CARD, "Card"),
    (PAYMENT_METHOD_CREDIT, "Credit"),
    (PAYMENT_METHOD_UNKNOWN, "Unknown"),
]


class Sale(TimestampedModel):
    sale_number = models.CharField(max_length=40, unique=True, db_index=True)
    invoice_number = models.CharField(max_length=50, unique=True, null=True, blank=True, db_index=True)
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
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="sales",
    )
    place_of_supply = models.CharField(max_length=100, blank=True, default="")
    customer_gstin = models.CharField(max_length=20, blank=True, default="")
    is_interstate = models.BooleanField(default=False)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_type = models.CharField(
        max_length=10, choices=DISCOUNT_TYPE_CHOICES, default=DISCOUNT_TYPE_NONE
    )
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    round_off_amount = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, default=PAYMENT_METHOD_CASH
    )
    notes = models.TextField(blank=True, default="")
    idempotency_key = models.CharField(max_length=64, blank=True, null=True, db_index=True)

    class Meta:
        db_table = "sales_sale"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["warehouse", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.invoice_number or self.sale_number} ({self.warehouse.code}) - ₹{self.total_amount}"


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.PROTECT, related_name="sale_lines"
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Snapshot of Product.cost_price at time of sale",
    )
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hsn_code = models.CharField(max_length=20, blank=True, default="")
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "sales_sale_line"
        unique_together = ("sale", "product")

    def __str__(self):
        return f"{self.quantity}x {self.product.sku} @ ₹{self.unit_price}"


class InvoiceSequence(models.Model):
    """
    Locked sequential counter per warehouse and April-March financial year.
    Format: WHCODE/2026-27/000123
    """
    warehouse = models.ForeignKey(
        "warehouses.Warehouse", on_delete=models.CASCADE, related_name="invoice_sequences"
    )
    financial_year = models.CharField(max_length=10, db_index=True)  # e.g. "2026-27"
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "sales_invoice_sequence"
        unique_together = ("warehouse", "financial_year")

    @classmethod
    def get_financial_year(cls, dt=None):
        if dt is None:
            dt = timezone.now()
        year = dt.year
        if dt.month >= 4:
            start_year = year
            end_year = (year + 1) % 100
        else:
            start_year = year - 1
            end_year = year % 100
        return f"{start_year}-{end_year:02d}"

    @classmethod
    def get_next_invoice_number(cls, warehouse, prefix="", dt=None) -> str:
        fy = cls.get_financial_year(dt)
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                warehouse=warehouse,
                financial_year=fy,
                defaults={"last_number": 0},
            )
            seq.last_number += 1
            seq.save(update_fields=["last_number"])
            p = f"{prefix}/" if prefix else ""
            return f"{p}{warehouse.code}/{fy}/{seq.last_number:06d}"


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

