from django.db import transaction
from django.utils import timezone

from audit.models import AuditLog
from catalog.models import Product
from core.exceptions import ConflictError, DomainError, InsufficientStockError
from core.models import NumberSequence
from inventory.models import StockLevel, StockMovement
from inventory.services import get_or_create_locked_stock_level
from warehouses.models import Warehouse

from .models import StockTransfer, StockTransferLine


def create_transfer(
    from_warehouse_id: int,
    to_warehouse_id: int,
    lines_data: list[dict],
    user,
    notes: str = "",
    is_draft: bool = False,
) -> StockTransfer:
    """
    Creates a stock transfer from one warehouse to another.
    If is_draft is True, creates in 'draft' status without deducting stock.
    If is_draft is False, dispatches immediately ('in_transit') and deducts stock from source.
    Lock ordering: always locks stock rows in (warehouse_id, product_id) ascending order.
    """
    if from_warehouse_id == to_warehouse_id:
        raise DomainError(
            "Source and destination warehouses cannot be the same.", code="same_warehouse"
        )

    if not lines_data:
        raise DomainError("Transfer must contain at least one line item.", code="empty_transfer")

    sorted_lines = sorted(lines_data, key=lambda x: x["product_id"])

    with transaction.atomic():
        from_wh = Warehouse.objects.filter(pk=from_warehouse_id).first()
        if not from_wh or not from_wh.is_active:
            raise DomainError(
                "Source warehouse is inactive or does not exist.", code="warehouse_inactive"
            )

        to_wh = Warehouse.objects.filter(pk=to_warehouse_id).first()
        if not to_wh or not to_wh.is_active:
            raise DomainError(
                "Destination warehouse is inactive or does not exist.", code="warehouse_inactive"
            )

        year = timezone.now().year
        seq_num = NumberSequence.get_next_number(
            warehouse=from_wh, sequence_type="transfer", year=year
        )
        transfer_number = f"TR-{from_wh.code}-{to_wh.code}-{year}-{seq_num:05d}"

        status = "draft" if is_draft else "in_transit"
        transfer = StockTransfer.objects.create(
            transfer_number=transfer_number,
            from_warehouse=from_wh,
            to_warehouse=to_wh,
            status=status,
            notes=notes,
            dispatched_by=user if not is_draft else None,
            dispatched_at=timezone.now() if not is_draft else None,
        )

        for line in sorted_lines:
            product_id = line["product_id"]
            qty = line["quantity"]
            if qty <= 0:
                raise DomainError("Transfer quantity must be positive.", code="invalid_quantity")

            product = Product.objects.filter(pk=product_id, is_active=True).first()
            if not product:
                raise DomainError(f"Product {product_id} is inactive or not found.", code="product_not_found")

            if not is_draft:
                stock_level = (
                    StockLevel.objects.select_for_update()
                    .filter(
                        warehouse=from_wh,
                        product=product,
                    )
                    .first()
                )

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
                    reason=f"Transfer dispatch {transfer_number}",
                    reference=transfer_number,
                    balance_after=stock_level.quantity,
                )

                from notifications.services import check_and_update_low_stock
                check_and_update_low_stock(from_wh.id, product.id, stock_level.quantity, stock_level.reorder_level)

            StockTransferLine.objects.create(
                transfer=transfer,
                product=product,
                dispatched_quantity=qty,
                received_quantity=0,
                variance=0,
            )

        AuditLog.objects.create(
            user=user,
            action="transfer_create" if is_draft else "transfer_dispatch",
            entity_type="stock_transfer",
            entity_id=str(transfer.id),
            warehouse=from_wh,
            details={"transfer_number": transfer_number, "to_warehouse": to_wh.name, "status": status},
        )

        return transfer


def dispatch_transfer(
    from_warehouse_id: int,
    to_warehouse_id: int,
    lines_data: list[dict],
    user,
    notes: str = "",
) -> StockTransfer:
    """Convenience wrapper to create and immediately dispatch a transfer."""
    return create_transfer(
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        lines_data=lines_data,
        user=user,
        notes=notes,
        is_draft=False,
    )


def dispatch_existing_transfer(transfer_id: int, user) -> StockTransfer:
    """
    Dispatches a previously created draft transfer.
    Deducts stock from source warehouse and marks status as 'in_transit'.
    """
    with transaction.atomic():
        transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        if transfer.status != "draft":
            raise ConflictError(
                f"Cannot dispatch transfer in '{transfer.status}' status.",
                code="invalid_transfer_status",
            )

        if not transfer.from_warehouse.is_active:
            raise DomainError(
                "Source warehouse is inactive.", code="warehouse_inactive"
            )
        if not transfer.to_warehouse.is_active:
            raise DomainError(
                "Destination warehouse is inactive.", code="warehouse_inactive"
            )

        lines = transfer.lines.select_related("product").order_by("product_id")
        for line in lines:
            stock_level = (
                StockLevel.objects.select_for_update()
                .filter(
                    warehouse=transfer.from_warehouse,
                    product=line.product,
                )
                .first()
            )

            available = stock_level.quantity if stock_level else 0
            if available < line.dispatched_quantity:
                raise InsufficientStockError(
                    f"Only {available} units of {line.product.name} are available for transfer in {transfer.from_warehouse.name}.",
                    details={
                        "product_id": line.product_id,
                        "available": available,
                        "requested": line.dispatched_quantity,
                    },
                )

            stock_level.quantity -= line.dispatched_quantity
            stock_level.save(update_fields=["quantity", "updated_at"])

            StockMovement.objects.create(
                stock_level=stock_level,
                warehouse=transfer.from_warehouse,
                product=line.product,
                delta=-line.dispatched_quantity,
                movement_type="transfer_out",
                user=user,
                reason=f"Transfer dispatch {transfer.transfer_number}",
                reference=transfer.transfer_number,
                balance_after=stock_level.quantity,
            )

        transfer.status = "in_transit"
        transfer.dispatched_by = user
        transfer.dispatched_at = timezone.now()
        transfer.save(update_fields=["status", "dispatched_by", "dispatched_at", "updated_at"])

        AuditLog.objects.create(
            user=user,
            action="transfer_dispatch",
            entity_type="stock_transfer",
            entity_id=str(transfer.id),
            warehouse=transfer.from_warehouse,
            details={"transfer_number": transfer.transfer_number, "to_warehouse": transfer.to_warehouse.name},
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
    Edge cases:
    - Inactive destination rejected.
    - Already received or cancelled rejected (cannot receive twice).
    - Received quantity cannot exceed sent quantity.
    """
    with transaction.atomic():
        transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        if transfer.status not in ("in_transit", "dispatched"):
            raise ConflictError(
                f"Cannot receive transfer in '{transfer.status}' status.",
                code="invalid_transfer_status",
            )

        if not transfer.to_warehouse.is_active:
            raise DomainError("Destination warehouse is inactive.", code="warehouse_inactive")

        lines = transfer.lines.select_related("product").order_by("product_id")
        for line in lines:
            received_qty = received_items.get(line.product_id, line.dispatched_quantity)
            if received_qty < 0:
                raise DomainError(
                    "Received quantity cannot be negative.", code="invalid_received_quantity"
                )

            if received_qty > line.dispatched_quantity:
                raise DomainError(
                    f"Received quantity ({received_qty}) cannot exceed sent quantity ({line.dispatched_quantity}) for {line.product.name}.",
                    code="received_exceeds_sent",
                )

            variance = line.dispatched_quantity - received_qty
            line.received_quantity = received_qty
            line.variance = variance
            line.save(update_fields=["received_quantity", "variance"])

            if received_qty > 0:
                dest_stock = get_or_create_locked_stock_level(
                    transfer.to_warehouse_id, line.product_id
                )
                dest_stock.quantity += received_qty
                dest_stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.create(
                    stock_level=dest_stock,
                    warehouse=transfer.to_warehouse,
                    product=line.product,
                    delta=received_qty,
                    movement_type="transfer_in",
                    user=user,
                    reason=f"Transfer received {transfer.transfer_number}",
                    reference=transfer.transfer_number,
                    balance_after=dest_stock.quantity,
                )

                from notifications.services import check_and_update_low_stock
                check_and_update_low_stock(transfer.to_warehouse_id, line.product_id, dest_stock.quantity, dest_stock.reorder_level)

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


def cancel_transfer(transfer_id: int, user) -> StockTransfer:
    """
    Cancels a transfer.
    - If draft: sets status to 'cancelled'.
    - If in_transit / dispatched: returns dispatched stock back to source warehouse and marks 'cancelled'.
    - If received: raises ConflictError.
    - If already cancelled: raises ConflictError.
    """
    with transaction.atomic():
        transfer = StockTransfer.objects.select_for_update().get(pk=transfer_id)
        if transfer.status == "cancelled":
            raise ConflictError("Transfer is already cancelled.", code="already_cancelled")

        if transfer.status == "received":
            raise ConflictError("Cannot cancel an already received transfer.", code="cannot_cancel_received")

        if transfer.status in ("in_transit", "dispatched"):
            if not transfer.from_warehouse.is_active:
                raise DomainError("Source warehouse is inactive.", code="warehouse_inactive")

            lines = transfer.lines.select_related("product").order_by("product_id")
            for line in lines:
                source_stock = get_or_create_locked_stock_level(
                    transfer.from_warehouse_id, line.product_id
                )
                source_stock.quantity += line.dispatched_quantity
                source_stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.create(
                    stock_level=source_stock,
                    warehouse=transfer.from_warehouse,
                    product=line.product,
                    delta=line.dispatched_quantity,
                    movement_type="transfer_in",
                    user=user,
                    reason=f"Transfer cancelled {transfer.transfer_number}",
                    reference=transfer.transfer_number,
                    balance_after=source_stock.quantity,
                )

        transfer.status = "cancelled"
        transfer.save(update_fields=["status", "updated_at"])

        AuditLog.objects.create(
            user=user,
            action="transfer_cancel",
            entity_type="stock_transfer",
            entity_id=str(transfer.id),
            warehouse=transfer.from_warehouse,
            details={"transfer_number": transfer.transfer_number},
        )

        return transfer
