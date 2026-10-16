from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone

from audit.models import AuditLog
from catalog.models import Product
from core.exceptions import DomainError, InsufficientStockError
from core.models import NumberSequence
from core.permissions import get_user_role, ROLE_ADMIN, ROLE_WAREHOUSE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from inventory.services import get_or_create_locked_stock_level, update_cached_product_stock
from customers.models import Customer
from warehouses.models import Warehouse

from .models import (
    Sale,
    SaleLine,
    SaleReturn,
    SaleReturnLine,
    DISCOUNT_TYPE_NONE,
    DISCOUNT_TYPE_AMOUNT,
    DISCOUNT_TYPE_PERCENT,
    DISCOUNT_TYPE_CHOICES,
    PAYMENT_METHOD_CASH,
    PAYMENT_METHOD_CREDIT,
    PAYMENT_METHOD_CHOICES,
)


def create_sale(
    warehouse_id: int,
    lines_data: list[dict],
    user,
    notes: str = "",
    idempotency_key: str = "",
    customer_id: int | None = None,
    amount_paid: Decimal | float | int | str | None = None,
    discount_type: str = DISCOUNT_TYPE_NONE,
    discount_value: Decimal | float | int | str = 0,
    payment_method: str = PAYMENT_METHOD_CASH,
) -> Sale:
    """
    Creates a sale atomically with row-locking, stock checks, and ledger recording.
    lines_data: [{'product_id': int, 'quantity': int}, ...]

    Hard rules:
    - Fixed lock order: warehouse id, then product id (BR-11)
    - Checked after locking
    - Total computed on server (BR-08)
    - Sequential sale number inside transaction from locked counter (NFR-DATA-06)
    - Idempotency key per user returns existing sale on replay
    """
    if idempotency_key:
        existing = Sale.objects.filter(user=user, idempotency_key=idempotency_key).first()
        if existing:
            return existing

    if not lines_data:
        raise DomainError("A sale must contain at least one line item.", code="empty_sale")

    # Check for duplicate products in lines
    product_ids = [line["product_id"] for line in lines_data]
    if len(product_ids) != len(set(product_ids)):
        raise DomainError(
            "Duplicate product lines are not allowed in a sale.", code="duplicate_lines"
        )

    # Sort lines by product_id for fixed lock ordering
    sorted_lines = sorted(lines_data, key=lambda x: x["product_id"])

    with transaction.atomic():
        if idempotency_key:
            existing = Sale.objects.select_for_update().filter(user=user, idempotency_key=idempotency_key).first()
            if existing:
                return existing

        warehouse = Warehouse.objects.get(pk=warehouse_id)
        if not warehouse.is_active:
            raise DomainError(
                "Cannot record sale in a deactivated warehouse.", code="warehouse_inactive"
            )

        year = timezone.now().year
        seq_num = NumberSequence.get_next_number(
            warehouse=warehouse, sequence_type="sale", year=year
        )
        sale_number = f"SL-{warehouse.code}-{year}-{seq_num:05d}"

        sale = Sale.objects.create(
            sale_number=sale_number,
            warehouse=warehouse,
            user=user,
            total_amount=Decimal("0.00"),
            notes=notes,
            idempotency_key=idempotency_key or None,
        )

        subtotal_amount = Decimal("0.00")

        for line in sorted_lines:
            product_id = line["product_id"]
            qty = line["quantity"]
            if qty <= 0:
                raise DomainError(
                    f"Quantity must be positive for product id {product_id}.",
                    code="invalid_quantity",
                )

            # Fixed lock order: warehouse_id, product_id
            stock_level = (
                StockLevel.objects.select_for_update()
                .filter(
                    warehouse_id=warehouse_id,
                    product_id=product_id,
                )
                .first()
            )

            product = Product.objects.get(pk=product_id)
            if not product.is_active:
                raise DomainError(f"Product '{product.name}' is inactive.", code="inactive_product")

            available = stock_level.quantity if stock_level else 0
            if available < qty:
                raise InsufficientStockError(
                    f"Only {available} units of {product.name} are available in {warehouse.name}.",
                    details={"product_id": product_id, "available": available, "requested": qty},
                    fields={"lines": [f"Only {available} units available for {product.name}."]},
                )

            # Deduct stock
            stock_level.quantity -= qty
            stock_level.save(update_fields=["quantity", "updated_at"])

            # Write stock movement
            StockMovement.objects.create(
                stock_level=stock_level,
                warehouse=warehouse,
                product=product,
                delta=-qty,
                movement_type="sale",
                user=user,
                reason=f"Sale {sale_number}",
                reference=sale_number,
                balance_after=stock_level.quantity,
            )

            update_cached_product_stock(product.id)

            # Server computes totals from product price at time of sale (BR-08)
            unit_price = product.price
            line_subtotal = unit_price * Decimal(qty)
            subtotal_amount += line_subtotal

            # Cost price snapshot: if product cost_price is set and > 0, copy as snapshot.
            # Missing or 0 cost price is stored as None (unknown cost, never treated as 0).
            unit_cost = None
            if product.cost_price is not None and product.cost_price > Decimal("0.00"):
                unit_cost = product.cost_price

            SaleLine.objects.create(
                sale=sale,
                product=product,
                quantity=qty,
                unit_price=unit_price,
                subtotal=line_subtotal,
                unit_cost=unit_cost,
            )

        # Discount Validation & Calculation
        discount_type = str(discount_type or DISCOUNT_TYPE_NONE).lower()
        if discount_type not in [c[0] for c in DISCOUNT_TYPE_CHOICES]:
            raise DomainError(f"Invalid discount type: {discount_type}.", code="invalid_discount_type")

        discount_val = Decimal(str(discount_value or 0))
        if discount_val < Decimal("0.00"):
            raise DomainError("Discount value cannot be negative.", code="invalid_discount")

        role = get_user_role(user)

        if discount_type == DISCOUNT_TYPE_PERCENT:
            if discount_val > Decimal("100.00"):
                raise DomainError("Discount percentage cannot exceed 100%.", code="discount_exceeds_100")
            if role == ROLE_STAFF and discount_val > Decimal("10.00"):
                raise DomainError(
                    "Staff can only apply discounts up to 10%. Higher discounts require Manager or Admin approval.",
                    code="discount_limit_exceeded",
                )
            discount_amount = (subtotal_amount * (discount_val / Decimal("100.00"))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        elif discount_type == DISCOUNT_TYPE_AMOUNT:
            if discount_val > subtotal_amount:
                raise DomainError(
                    f"Discount amount (₹{discount_val}) cannot exceed subtotal (₹{subtotal_amount}).",
                    code="discount_exceeds_subtotal",
                )
            max_staff_discount = (subtotal_amount * Decimal("0.10")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if role == ROLE_STAFF and discount_val > max_staff_discount:
                raise DomainError(
                    f"Staff can only apply discounts up to 10% of subtotal (₹{max_staff_discount}). Higher discounts require Manager or Admin approval.",
                    code="discount_limit_exceeded",
                )
            discount_amount = discount_val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            discount_type = DISCOUNT_TYPE_NONE
            discount_val = Decimal("0.00")
            discount_amount = Decimal("0.00")

        total_amount = max(Decimal("0.00"), subtotal_amount - discount_amount)

        # Payment Method & Customer Validation
        payment_method = str(payment_method or PAYMENT_METHOD_CASH).lower()
        valid_methods = [c[0] for c in PAYMENT_METHOD_CHOICES]
        if payment_method not in valid_methods:
            raise DomainError(f"Invalid payment method: {payment_method}.", code="invalid_payment_method")

        customer = None
        if customer_id:
            customer = Customer.objects.filter(pk=customer_id).first()
            if not customer or not customer.is_active:
                raise DomainError(
                    "Customer is inactive or does not exist.", code="customer_inactive"
                )

        if payment_method == PAYMENT_METHOD_CREDIT:
            if not customer:
                raise DomainError(
                    "Credit sales require an active registered customer.",
                    code="customer_required_for_credit",
                )

        if amount_paid is None:
            if payment_method == PAYMENT_METHOD_CREDIT:
                final_paid = Decimal("0.00")
                balance_due = total_amount
            else:
                final_paid = total_amount
                balance_due = Decimal("0.00")
        else:
            final_paid = Decimal(str(amount_paid))
            if final_paid < Decimal("0.00"):
                raise DomainError("Amount paid cannot be negative.", code="invalid_amount")
            if final_paid > total_amount:
                final_paid = total_amount
            if final_paid < total_amount:
                if not customer:
                    raise DomainError(
                        "A credit sale (unpaid balance) requires an active registered customer.",
                        code="customer_required_for_credit",
                    )
                balance_due = total_amount - final_paid
            else:
                balance_due = Decimal("0.00")

        sale.customer = customer
        sale.subtotal = subtotal_amount
        sale.discount_type = discount_type
        sale.discount_value = discount_val
        sale.discount_amount = discount_amount
        sale.total_amount = total_amount
        sale.amount_paid = final_paid
        sale.balance_due = balance_due
        sale.payment_method = payment_method
        sale.save(
            update_fields=[
                "customer",
                "subtotal",
                "discount_type",
                "discount_value",
                "discount_amount",
                "total_amount",
                "amount_paid",
                "balance_due",
                "payment_method",
            ]
        )

        AuditLog.objects.create(
            user=user,
            action="create_sale",
            entity_type="sale",
            entity_id=str(sale.id),
            warehouse=warehouse,
            details={
                "sale_number": sale_number,
                "total_amount": str(total_amount),
                "lines_count": len(sorted_lines),
            },
        )

        return sale


def process_sale_return(
    sale_id: int,
    items_data: list[dict],
    user,
    reason: str = "",
    refund_method: str = "cash",
) -> SaleReturn:
    """
    Processes a full or partial sale return.
    - Never edits the original sale.
    - Locks sale lines in atomic transaction.
    - returnable = sold - already_returned.
    - Restores stock to sale warehouse with 'return' ledger movement.
    - Updates cached product stock.
    - Generates sequential return number.
    - Fixed lock ordering to prevent deadlocks.
    """
    if not items_data:
        raise DomainError("Return must contain at least one line item.", code="empty_return")

    with transaction.atomic():
        sale = Sale.objects.select_for_update().get(pk=sale_id)
        if not sale.warehouse.is_active:
            raise DomainError(
                "Cannot process returns for an inactive warehouse.", code="warehouse_inactive"
            )

        # Fetch sale lines with lock
        sale_lines = {sl.id: sl for sl in sale.lines.select_for_update().select_related("product")}
        product_to_line = {sl.product_id: sl for sl in sale_lines.values()}

        # Verify items and sort by product_id
        parsed_items = []
        for item in items_data:
            line_id = item.get("sale_line_id")
            prod_id = item.get("product_id")
            qty = item.get("quantity", 0)

            if qty <= 0:
                raise DomainError("Return quantity must be positive.", code="invalid_quantity")

            sale_line = None
            if line_id and line_id in sale_lines:
                sale_line = sale_lines[line_id]
            elif prod_id and prod_id in product_to_line:
                sale_line = product_to_line[prod_id]

            if not sale_line:
                raise DomainError(
                    f"Line item not found on sale {sale.sale_number}.", code="line_not_found"
                )

            # Check existing returns for this sale line
            already_returned = (
                SaleReturnLine.objects.filter(sale_line=sale_line).aggregate(
                    total=Sum("quantity")
                )["total"]
                or 0
            )

            returnable = sale_line.quantity - already_returned
            if qty > returnable:
                raise DomainError(
                    f"Cannot return {qty} units of {sale_line.product.name}. Only {returnable} units are returnable.",
                    code="over_returning",
                    details={
                        "returnable": returnable,
                        "requested": qty,
                        "product_id": sale_line.product_id,
                    },
                )

            parsed_items.append({"sale_line": sale_line, "quantity": qty})

        # Check duplicate sale lines in request
        target_line_ids = [p["sale_line"].id for p in parsed_items]
        if len(target_line_ids) != len(set(target_line_ids)):
            raise DomainError("Duplicate lines in return request.", code="duplicate_lines")

        # Sort parsed items by (warehouse_id, product_id) for deadlock-free locking
        parsed_items.sort(key=lambda x: (sale.warehouse_id, x["sale_line"].product_id))

        year = timezone.now().year
        seq_num = NumberSequence.get_next_number(
            warehouse=sale.warehouse, sequence_type="return", year=year
        )
        return_number = f"RET-{sale.warehouse.code}-{year}-{seq_num:05d}"

        sale_return = SaleReturn.objects.create(
            return_number=return_number,
            sale=sale,
            warehouse=sale.warehouse,
            processed_by=user,
            refund_method=refund_method,
            reason=reason,
            total_refund_amount=Decimal("0.00"),
        )

        total_refund = Decimal("0.00")
        for item in parsed_items:
            sale_line = item["sale_line"]
            qty = item["quantity"]
            product = sale_line.product

            refund_amt = sale_line.unit_price * Decimal(qty)
            total_refund += refund_amt

            # Restore stock
            stock_level = get_or_create_locked_stock_level(sale.warehouse_id, product.id)
            stock_level.quantity += qty
            stock_level.save(update_fields=["quantity", "updated_at"])

            # Create 'return' ledger movement
            StockMovement.objects.create(
                stock_level=stock_level,
                warehouse=sale.warehouse,
                product=product,
                delta=qty,
                movement_type="return",
                user=user,
                reason=f"Return {return_number}: {reason}" if reason else f"Sale return {return_number}",
                reference=return_number,
                balance_after=stock_level.quantity,
            )

            update_cached_product_stock(product.id)

            SaleReturnLine.objects.create(
                sale_return=sale_return,
                sale_line=sale_line,
                product=product,
                quantity=qty,
                unit_price=sale_line.unit_price,
                refund_amount=refund_amt,
            )

        sale_return.total_refund_amount = total_refund
        sale_return.save(update_fields=["total_refund_amount", "updated_at"])

        AuditLog.objects.create(
            user=user,
            action="sale_return",
            entity_type="sale_return",
            entity_id=str(sale_return.id),
            warehouse=sale.warehouse,
            details={
                "return_number": return_number,
                "sale_number": sale.sale_number,
                "refund_amount": str(total_refund),
            },
        )

        return sale_return

