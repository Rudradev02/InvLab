from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from audit.models import AuditLog
from catalog.models import Product
from core.exceptions import DomainError, InsufficientStockError
from core.models import NumberSequence
from inventory.models import StockLevel, StockMovement
from inventory.services import update_cached_product_stock
from warehouses.models import Warehouse

from .models import Sale, SaleLine


def create_sale(
    warehouse_id: int,
    lines_data: list[dict],
    user,
    notes: str = "",
) -> Sale:
    """
    Creates a sale atomically with row-locking, stock checks, and ledger recording.
    lines_data: [{'product_id': int, 'quantity': int}, ...]

    Hard rules:
    - Fixed lock order: warehouse id, then product id (BR-11)
    - Checked after locking
    - Total computed on server (BR-08)
    - Sequential sale number inside transaction from locked counter (NFR-DATA-06)
    """
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
        )

        total_amount = Decimal("0.00")

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
            subtotal = unit_price * Decimal(qty)
            total_amount += subtotal

            SaleLine.objects.create(
                sale=sale,
                product=product,
                quantity=qty,
                unit_price=unit_price,
                subtotal=subtotal,
            )

        sale.total_amount = total_amount
        sale.save(update_fields=["total_amount"])

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
