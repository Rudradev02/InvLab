from django.db import transaction
from django.utils import timezone
from .models import StockTransfer, StockTransferLine
from catalog.models import Product
from warehouses.models import Warehouse
from inventory.models import StockLevel, StockMovement
from inventory.services import get_or_create_locked_stock_level
from core.models import NumberSequence
from core.exceptions import InsufficientStockError, DomainError, ConflictError
from audit.models import AuditLog


def dispatch_transfer(
    from_warehouse_id: int,
    to_warehouse_id: int,
    lines_data: list[dict],
    user,
    notes: str = "",
) -> StockTransfer:
    """
    Creates and immediately dispatches a stock transfer from one warehouse to another.
    Fixed lock order: warehouse id, then product id.
    """
    if from_warehouse_id == to_warehouse_id:
        raise DomainError("Source and destination warehouses cannot be the same.", code="same_warehouse")

    if not lines_data:
        raise DomainError("Transfer must contain at least one line item.", code="empty_transfer")

    sorted_lines = sorted(lines_data, key=lambda x: x["product_id"])

    with transaction.atomic():
        from_wh = Warehouse.objects.get(pk=from_warehouse_id, is_active=True)
        to_wh = Warehouse.objects.get(pk=to_warehouse_id, is_active=True)

        year = timezone.now().year
        seq_num = NumberSequence.get_next_number(warehouse=from_wh, sequence_type="transfer", year=year)
        transfer_number = f"TR-{from_wh.code}-{to_wh.code}-{year}-{seq_num:05d}"

        transfer = StockTransfer.objects.create(
            transfer_number=transfer_number,
            from_warehouse=from_wh,
            to_warehouse=to_wh,
            status="dispatched",
            notes=notes,
            dispatched_by=user,
            dispatched_at=timezone.now(),
        )

        for line in sorted_lines:
            product_id = line["product_id"]
            qty = line["quantity"]
            if qty <= 0:
                raise DomainError("Transfer quantity must be positive.", code="invalid_quantity")

            product = Product.objects.get(pk=product_id, is_active=True)
            stock_level = StockLevel.objects.select_for_update().filter(
                warehouse=from_wh,
                product=product,
            ).first()

            available = stock_level.quantity if stock_level else 0
            if available < qty:
                raise InsufficientStockError(
                    f"Only {available} units of {product.name} are available for transfer in {from_wh.name}.",
                    details={"product_id": product_id, "available": available, "requested": qty},
                )

            stock_level.quantity -= qty
            stock_level.save(update_fields=["quantity", "updated_at"])

            StockMovement.objects.create(
                stock_level=stock_level,
                warehouse=from_wh,
                product=product,
                delta=-qty,
                movement_type="transfer_out",
                user=user,
                reference=transfer_number,
            )

            StockTransferLine.objects.create(
                transfer=transfer,
                product=product,
                dispatched_quantity=qty,
                received_quantity=0,
                variance=0,
            )

        AuditLog.objects.create(
            user=user,
            action="transfer_dispatch",
            entity_type="stock_transfer",
            entity_id=str(transfer.id),
            warehouse=from_wh,
            details={"transfer_number": transfer_number, "to_warehouse": to_wh.name},
        )

        return transfer


def receive_transfer(
    transfer_id: int,
    received_items: dict[int, int],  # product_id -> received_quantity
    user,
) -> StockTransfer:
    """
    Receives an incoming transfer at the destination warehouse.
    BR-10: Stock transfers conserve stock: destination gains stock, variance recorded if shortfall.
    """
    with transaction.atomic():
        transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        if transfer.status != "dispatched":
            raise ConflictError(f"Cannot receive transfer in '{transfer.status}' status.", code="invalid_transfer_status")

        lines = transfer.lines.select_related("product").all()
        for line in lines:
            received_qty = received_items.get(line.product_id, line.dispatched_quantity)
            if received_qty < 0:
                raise DomainError("Received quantity cannot be negative.", code="invalid_received_quantity")

            variance = line.dispatched_quantity - received_qty
            line.received_quantity = received_qty
            line.variance = variance
            line.save(update_fields=["received_quantity", "variance"])

            if received_qty > 0:
                dest_stock = get_or_create_locked_stock_level(transfer.to_warehouse_id, line.product_id)
                dest_stock.quantity += received_qty
                dest_stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.create(
                    stock_level=dest_stock,
                    warehouse=transfer.to_warehouse,
                    product=line.product,
                    delta=received_qty,
                    movement_type="transfer_in",
                    user=user,
                    reference=transfer.transfer_number,
                )

        transfer.status = "received"
        transfer.received_by = user
        transfer.received_at = timezone.now()
        transfer.save(update_fields=["status", "received_by", "received_at", "updated_at"])

        AuditLog.objects.create(
            user=user,
            action="transfer_receive",
            entity_type="stock_transfer",
            entity_id=str(transfer.id),
            warehouse=transfer.to_warehouse,
            details={"transfer_number": transfer.transfer_number},
        )

        return transfer
