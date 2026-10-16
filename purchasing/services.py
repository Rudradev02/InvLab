from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List
import uuid
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from catalog.models import Product
from inventory.models import StockLevel, StockMovement
from purchasing.models import PurchaseOrder, PurchaseOrderLine, Supplier
from warehouses.models import Warehouse


def generate_po_number() -> str:
    """Generate sequential or timestamped purchase order number: PO-YYYYMMDD-XXXX"""
    date_str = datetime.now().strftime("%Y%m%d")
    short_uuid = uuid.uuid4().hex[:4].upper()
    return f"PO-{date_str}-{short_uuid}"


def create_purchase_order(
    supplier_id: int,
    warehouse_id: int,
    lines_data: List[Dict[str, Any]],
    user,
    order_date=None,
    expected_delivery_date=None,
    notes: str = "",
) -> PurchaseOrder:
    """
    Creates a new Purchase Order in draft status.
    """
    if not lines_data:
        raise ValidationError("Purchase order must have at least one line item.")

    try:
        supplier = Supplier.objects.get(id=supplier_id)
    except Supplier.DoesNotExist:
        raise ValidationError(f"Supplier ID {supplier_id} does not exist.")

    if not supplier.is_active:
        raise ValidationError(f"Cannot place purchase orders with inactive supplier '{supplier.name}'.")

    try:
        warehouse = Warehouse.objects.get(id=warehouse_id)
    except Warehouse.DoesNotExist:
        raise ValidationError(f"Warehouse ID {warehouse_id} does not exist.")

    if not warehouse.is_active:
        raise ValidationError(f"Cannot place purchase orders for inactive warehouse '{warehouse.name}'.")

    with transaction.atomic():
        po_number = generate_po_number()
        # Ensure unique po_number
        while PurchaseOrder.objects.filter(po_number=po_number).exists():
            po_number = generate_po_number()

        po = PurchaseOrder.objects.create(
            po_number=po_number,
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrder.STATUS_DRAFT,
            order_date=order_date or timezone.now().date(),
            expected_delivery_date=expected_delivery_date,
            total_amount=Decimal("0.00"),
            created_by=user,
            notes=notes,
        )

        total_amount = Decimal("0.00")
        for line in lines_data:
            product_id = line.get("product_id")
            quantity_ordered = int(line.get("quantity_ordered", 0))
            unit_cost = Decimal(str(line.get("unit_cost", "0.00")))

            if quantity_ordered <= 0:
                raise ValidationError("Quantity ordered must be greater than zero.")
            if unit_cost < 0:
                raise ValidationError("Unit cost cannot be negative.")

            try:
                product = Product.objects.get(id=product_id)
            except Product.DoesNotExist:
                raise ValidationError(f"Product ID {product_id} does not exist.")

            subtotal = (Decimal(quantity_ordered) * unit_cost).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            total_amount += subtotal

            PurchaseOrderLine.objects.create(
                purchase_order=po,
                product=product,
                quantity_ordered=quantity_ordered,
                quantity_received=0,
                unit_cost=unit_cost,
                subtotal=subtotal,
            )

        po.total_amount = total_amount
        po.save(update_fields=["total_amount", "updated_at"])
        return po


def update_purchase_order(
    po: PurchaseOrder,
    data: Dict[str, Any],
    user,
) -> PurchaseOrder:
    """
    Update purchase order header and line items.
    Edge case: Editing after ordered is blocked.
    """
    if po.status != PurchaseOrder.STATUS_DRAFT:
        raise ValidationError("Only draft purchase orders can be modified.")

    with transaction.atomic():
        if "supplier_id" in data:
            supplier = Supplier.objects.get(id=data["supplier_id"])
            if not supplier.is_active:
                raise ValidationError("Selected supplier is inactive.")
            po.supplier = supplier

        if "warehouse_id" in data:
            warehouse = Warehouse.objects.get(id=data["warehouse_id"])
            if not warehouse.is_active:
                raise ValidationError("Selected warehouse is inactive.")
            po.warehouse = warehouse

        if "order_date" in data and data["order_date"]:
            po.order_date = data["order_date"]
        if "expected_delivery_date" in data:
            po.expected_delivery_date = data["expected_delivery_date"]
        if "notes" in data:
            po.notes = data["notes"]

        if "lines" in data and data["lines"]:
            po.lines.all().delete()
            total_amount = Decimal("0.00")
            for line in data["lines"]:
                product_id = line.get("product_id")
                qty = int(line.get("quantity_ordered", 0))
                cost = Decimal(str(line.get("unit_cost", "0.00")))
                if qty <= 0:
                    raise ValidationError("Quantity ordered must be greater than zero.")
                if cost < 0:
                    raise ValidationError("Unit cost cannot be negative.")

                product = Product.objects.get(id=product_id)
                subtotal = (Decimal(qty) * cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                total_amount += subtotal

                PurchaseOrderLine.objects.create(
                    purchase_order=po,
                    product=product,
                    quantity_ordered=qty,
                    quantity_received=0,
                    unit_cost=cost,
                    subtotal=subtotal,
                )
            po.total_amount = total_amount

        po.save()
        return po


def mark_purchase_order_as_ordered(po: PurchaseOrder, user) -> PurchaseOrder:
    """
    Transitions status from draft to ordered.
    """
    if po.status != PurchaseOrder.STATUS_DRAFT:
        raise ValidationError(f"Cannot mark order #{po.po_number} as ordered because it is in '{po.status}' status.")

    po.status = PurchaseOrder.STATUS_ORDERED
    po.save(update_fields=["status", "updated_at"])
    return po


def cancel_purchase_order(po: PurchaseOrder, user) -> PurchaseOrder:
    """
    Cancels purchase order if draft or ordered and no items have been received.
    Edge case: Cancelling after a receipt is blocked.
    """
    if po.status not in (PurchaseOrder.STATUS_DRAFT, PurchaseOrder.STATUS_ORDERED):
        raise ValidationError(f"Cannot cancel purchase order #{po.po_number} in '{po.status}' status.")

    has_received_items = any(l.quantity_received > 0 for l in po.lines.all())
    if has_received_items:
        raise ValidationError("Cannot cancel a purchase order that has already received stock.")

    po.status = PurchaseOrder.STATUS_CANCELLED
    po.save(update_fields=["status", "updated_at"])
    return po


def receive_purchase_order_items(
    po: PurchaseOrder,
    receipts: List[Dict[str, Any]],
    user,
) -> PurchaseOrder:
    """
    Receives stock against a purchase order.
    Edge cases handled:
    - Atomic transaction with row locking
    - Increases destination warehouse's StockLevel quantity
    - Writes immutable 'purchase' StockMovement ledger records
    - Updates Product.cost_price using weighted average formula:
      new_cost = ((old_units * old_cost) + (received_units * unit_cost)) / (old_units + received_units)
    - Updates cached Product.stock
    - Prevents over-receiving
    - Updates PO status to partially_received or received
    """
    if not receipts:
        raise ValidationError("No receipt quantities specified.")

    with transaction.atomic():
        locked_po = PurchaseOrder.objects.select_for_update().get(id=po.id)

        if locked_po.status not in (
            PurchaseOrder.STATUS_ORDERED,
            PurchaseOrder.STATUS_PARTIALLY_RECEIVED,
        ):
            raise ValidationError(
                f"Cannot receive items for purchase order in '{locked_po.status}' status. "
                "Purchase order must be in 'ordered' or 'partially_received' status."
            )

        lines_by_id = {l.id: l for l in locked_po.lines.select_for_update().all()}

        total_received_in_this_batch = 0

        for item in receipts:
            line_id = item.get("line_id")
            qty_receiving = int(item.get("quantity_received", 0))

            if qty_receiving <= 0:
                continue

            if line_id not in lines_by_id:
                raise ValidationError(f"Purchase order line ID {line_id} not found in this order.")

            line = lines_by_id[line_id]

            if line.quantity_received + qty_receiving > line.quantity_ordered:
                max_allowed = line.quantity_remaining
                raise ValidationError(
                    f"Over-receiving error for {line.product.sku}: attempted to receive {qty_receiving} units, "
                    f"but only {max_allowed} units remain to be received."
                )

            # Update line received quantity
            line.quantity_received += qty_receiving
            line.save(update_fields=["quantity_received"])
            total_received_in_this_batch += qty_receiving

            # Lock StockLevel for this warehouse & product
            stock_level, _ = StockLevel.objects.select_for_update().get_or_create(
                product=line.product,
                warehouse=locked_po.warehouse,
                defaults={"quantity": 0, "reorder_level": line.product.default_reorder_level},
            )

            stock_level.quantity += qty_receiving
            stock_level.save(update_fields=["quantity", "updated_at"])

            # Write 'purchase' StockMovement ledger entry
            StockMovement.objects.create(
                stock_level=stock_level,
                warehouse=locked_po.warehouse,
                product=line.product,
                delta=qty_receiving,
                movement_type="purchase",
                reason=f"PO {locked_po.po_number} receipt from {locked_po.supplier.name}",
                reference=locked_po.po_number,
                user=user,
                balance_after=stock_level.quantity,
            )

            # Update Product weighted average cost price and cached stock
            product = Product.objects.select_for_update().get(id=line.product_id)
            current_units = max(0, product.stock)
            current_cost = product.cost_price or Decimal("0.00")
            new_units_total = current_units + qty_receiving

            if new_units_total > 0:
                weighted_cost = (
                    (Decimal(current_units) * current_cost) + (Decimal(qty_receiving) * line.unit_cost)
                ) / Decimal(new_units_total)
                product.cost_price = weighted_cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            product.stock += qty_receiving
            product.save(update_fields=["cost_price", "stock", "updated_at"])

        if total_received_in_this_batch == 0:
            raise ValidationError("Total received quantity across all lines must be at least 1 unit.")

        # Determine overall PO status
        all_lines = locked_po.lines.all()
        is_all_received = all(l.quantity_received >= l.quantity_ordered for l in all_lines)

        if is_all_received:
            locked_po.status = PurchaseOrder.STATUS_RECEIVED
        else:
            locked_po.status = PurchaseOrder.STATUS_PARTIALLY_RECEIVED

        locked_po.save(update_fields=["status", "updated_at"])
        return locked_po
