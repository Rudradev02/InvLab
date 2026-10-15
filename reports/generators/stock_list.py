from decimal import Decimal
from typing import Any, Dict
from reports.registry import BaseReport, register_report
from inventory.models import StockLevel


@register_report
class StockListReport(BaseReport):
    report_id = "stock_list"
    name = "Stock Inventory Valuation"
    description = "Current stock on hand across warehouses with selling price inventory valuation."
    supports_date_filter = False
    supports_category_filter = True
    supports_warehouse_filter = True
    supported_formats = ["json", "csv", "xlsx", "pdf"]

    def generate(self, user, filters: Dict[str, Any]) -> Dict[str, Any]:
        warehouse_id = filters.get("warehouse")
        warehouse_name = filters.get("warehouse_name", "All Warehouses")
        category_id = filters.get("category")
        category_name = filters.get("category_name", "All Categories")

        # Query StockLevels
        stock_qs = StockLevel.objects.select_related("product", "product__category", "warehouse").all()

        if warehouse_id:
            stock_qs = stock_qs.filter(warehouse_id=warehouse_id)
        if category_id:
            stock_qs = stock_qs.filter(product__category_id=category_id)

        stock_qs = stock_qs.order_by("warehouse__name", "product__name")

        rows = []
        total_units = 0
        total_valuation = Decimal("0.00")
        low_stock_count = 0

        for s in stock_qs:
            prod = s.product
            price = prod.price or Decimal("0.00")
            val = Decimal(s.quantity) * price
            total_units += s.quantity
            total_valuation += val
            is_low = s.quantity <= s.reorder_level
            if is_low:
                low_stock_count += 1

            rows.append({
                "sku": prod.sku,
                "product_name": prod.name,
                "category": prod.category.name if prod.category else "Uncategorized",
                "warehouse": s.warehouse.code,
                "quantity": s.quantity,
                "reorder_level": s.reorder_level,
                "unit_price": float(price),
                "stock_valuation": float(val),
                "status": "Low Stock" if is_low else "Optimal",
            })

        columns = [
            {"key": "sku", "label": "SKU", "align": "center", "is_currency": False},
            {"key": "product_name", "label": "Product", "align": "left", "is_currency": False},
            {"key": "category", "label": "Category", "align": "center", "is_currency": False},
            {"key": "warehouse", "label": "Warehouse", "align": "center", "is_currency": False},
            {"key": "quantity", "label": "Stock Qty", "align": "right", "is_currency": False},
            {"key": "reorder_level", "label": "Reorder Level", "align": "right", "is_currency": False},
            {"key": "unit_price", "label": "Price (₹)", "align": "right", "is_currency": True},
            {"key": "stock_valuation", "label": "Valuation (₹)", "align": "right", "is_currency": True},
            {"key": "status", "label": "Status", "align": "center", "is_currency": False},
        ]

        summary = {
            "total_items_stocked": len(rows),
            "total_units_on_hand": total_units,
            "total_inventory_valuation": float(total_valuation),
            "low_stock_items": low_stock_count,
        }

        return {
            "report_id": self.report_id,
            "name": self.name,
            "description": self.description,
            "filters_applied": {
                "warehouse": warehouse_name,
                "category": category_name,
            },
            "summary": summary,
            "columns": columns,
            "rows": rows,
        }
