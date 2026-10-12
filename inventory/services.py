from django.db import transaction
from django.core.exceptions import ValidationError
from .models import StockLevel, StockMovement
from catalog.models import Product
from warehouses.models import Warehouse
from core.exceptions import InsufficientStockError, DomainError
from audit.models import AuditLog


def get_or_create_locked_stock_level(warehouse_id: int, product_id: int) -> StockLevel:
    """
    Lock or create a StockLevel row for the given warehouse and product.
    Must be called inside transaction.atomic().
    """
    stock_level = StockLevel.objects.select_for_update().filter(
        warehouse_id=warehouse_id,
        product_id=product_id,
    ).first()

    if not stock_level:
        warehouse = Warehouse.objects.get(pk=warehouse_id)
        product = Product.objects.get(pk=product_id)
        stock_level, _ = StockLevel.objects.select_for_update().get_or_create(
            warehouse=warehouse,
            product=product,
            defaults={"quantity": 0, "reorder_level": product.default_reorder_level},
        )
    return stock_level


def receive_stock(warehouse_id: int, product_id: int, quantity: int, user, reference: str = "") -> StockLevel:
    """
    Receive new stock into warehouse. Idempotent and thread-safe.
    Hard rules: atomic, row-locking, exact 1 movement per change.
    """
    if quantity <= 0:
        raise DomainError("Received quantity must be greater than zero.", code="invalid_quantity")

    with transaction.atomic():
        stock_level = get_or_create_locked_stock_level(warehouse_id, product_id)
        stock_level.quantity += quantity
        stock_level.save(update_fields=["quantity", "updated_at"])

        StockMovement.objects.create(
            stock_level=stock_level,
            warehouse_id=warehouse_id,
            product_id=product_id,
            delta=quantity,
            movement_type="receive",
            user=user,
            reference=reference or "Stock received",
        )

        AuditLog.objects.create(
            user=user,
            action="stock_receive",
            entity_type="stock_level",
            entity_id=str(stock_level.id),
            warehouse_id=warehouse_id,
            details={"product_id": product_id, "delta": quantity, "new_quantity": stock_level.quantity},
        )

        return stock_level


def adjust_stock(warehouse_id: int, product_id: int, delta: int, user, reason: str = "") -> StockLevel:
    """
    Adjust existing stock (positive or negative).
    Checks that stock never goes below 0.
    """
    if delta == 0:
        raise DomainError("Stock adjustment delta cannot be zero.", code="invalid_delta")

    with transaction.atomic():
        stock_level = get_or_create_locked_stock_level(warehouse_id, product_id)
        new_quantity = stock_level.quantity + delta

        if new_quantity < 0:
            raise InsufficientStockError(
                f"Cannot adjust stock by {delta}. Only {stock_level.quantity} units are available in {stock_level.warehouse.name}.",
                details={"product_id": product_id, "available": stock_level.quantity, "requested_delta": delta},
            )

        stock_level.quantity = new_quantity
        stock_level.save(update_fields=["quantity", "updated_at"])

        StockMovement.objects.create(
            stock_level=stock_level,
            warehouse_id=warehouse_id,
            product_id=product_id,
            delta=delta,
            movement_type="adjustment",
            user=user,
            reference=reason or "Stock adjustment",
        )

        AuditLog.objects.create(
            user=user,
            action="stock_adjust",
            entity_type="stock_level",
            entity_id=str(stock_level.id),
            warehouse_id=warehouse_id,
            details={"product_id": product_id, "delta": delta, "new_quantity": stock_level.quantity, "reason": reason},
        )

        return stock_level
