from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from audit.models import AuditLog
from core.exceptions import DomainError
from core.models import NumberSequence
from sales.models import Sale
from warehouses.models import Warehouse

from .models import Customer, Payment


def record_customer_payment(
    customer_id: int,
    amount: Decimal,
    warehouse_id: int,
    user,
    payment_method: str = "cash",
    notes: str = "",
) -> Payment:
    """
    Records a payment against customer's outstanding balance (udhaar).
    Payments apply to the oldest unpaid credit sale first.
    Edge cases:
    - Overpayment rejected (cannot pay more than total outstanding balance).
    - Customer must be active.
    - Customer balance always equals sum of their sale balances.
    """
    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise DomainError("Payment amount must be greater than zero.", code="invalid_amount")

    with transaction.atomic():
        customer = Customer.objects.select_for_update().get(pk=customer_id)
        if not customer.is_active:
            raise DomainError("Cannot record payments for an inactive customer.", code="customer_inactive")

        warehouse = Warehouse.objects.get(pk=warehouse_id)
        if not warehouse.is_active:
            raise DomainError("Cannot record payments in an inactive warehouse.", code="warehouse_inactive")

        # Find unpaid credit sales ordered by oldest first
        unpaid_sales = list(
            Sale.objects.select_for_update()
            .filter(customer=customer, balance_due__gt=0)
            .order_by("created_at")
        )

        total_balance_due = sum(s.balance_due for s in unpaid_sales)

        if amount > total_balance_due:
            raise DomainError(
                f"Payment amount (₹{amount}) cannot exceed customer's total outstanding balance (₹{total_balance_due}).",
                code="overpayment",
                details={"balance_due": str(total_balance_due), "amount_paid": str(amount)},
            )

        year = timezone.now().year
        seq_num = NumberSequence.get_next_number(
            warehouse=warehouse, sequence_type="payment", year=year
        )
        payment_number = f"PAY-{warehouse.code}-{year}-{seq_num:05d}"

        # Apply payment to oldest sales first
        remaining = amount
        first_sale = unpaid_sales[0] if unpaid_sales else None

        for sale in unpaid_sales:
            if remaining <= Decimal("0.00"):
                break
            alloc = min(remaining, sale.balance_due)
            sale.amount_paid += alloc
            sale.balance_due -= alloc
            sale.save(update_fields=["amount_paid", "balance_due", "updated_at"])
            remaining -= alloc

        payment = Payment.objects.create(
            payment_number=payment_number,
            customer=customer,
            sale=first_sale,
            warehouse=warehouse,
            user=user,
            amount=amount,
            payment_method=payment_method,
            notes=notes,
        )

        AuditLog.objects.create(
            user=user,
            action="record_payment",
            entity_type="payment",
            entity_id=str(payment.id),
            warehouse=warehouse,
            details={
                "payment_number": payment_number,
                "customer": customer.name,
                "amount": str(amount),
                "remaining_balance": str(total_balance_due - amount),
            },
        )

        return payment


def get_customer_summary(customer: Customer) -> dict:
    """
    Computes summary metrics for a customer:
    - Lifetime value (sum of all sales)
    - Total balance due (sum of sale balance_due)
    - Total payments recorded
    - Total sales count
    """
    sales = customer.sales.all()
    lifetime_value = sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
    balance_due = sales.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
    total_payments = customer.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    return {
        "lifetime_value": f"{Decimal(lifetime_value):.2f}",
        "total_balance_due": f"{Decimal(balance_due):.2f}",
        "total_payments": f"{Decimal(total_payments):.2f}",
        "sales_count": sales.count(),
    }


def get_receivables_total(warehouse_id: int | None = None) -> Decimal:
    """
    Returns the total outstanding receivables across all customers.
    Optionally scoped to a specific warehouse.
    """
    qs = Sale.objects.filter(balance_due__gt=0)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    return qs.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
