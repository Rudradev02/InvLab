from decimal import Decimal
from typing import Any, Dict
from django.db.models import F
from reports.registry import BaseReport, register_report
from inventory.models import StockLevel


@register_report
class LowStockReport(BaseReport):
    report_id = "low_stock"
    name = "Low Stock Replenishment Alert"
    description = "Immediate inventory shortage items below their designated warehouse reorder threshold."
    supports_date_filter = False
    supports_category_filter = True
    supports_warehouse_filter = True
    supported_formats = ["json", "csv", "xlsx", "pdf"]

    def generate(self, user, filters: Dict[str, Any]) -> Dict[str, Any]:
        warehouse_id = filters.get("warehouse")
        warehouse_name = filters.get("warehouse_name", "All Warehouses")
        category_id = filters.get("category")
        category_name = filters.get("category_name", "All Categories")

        # Query items where quantity <= reorder_level
        low_stock_qs = StockLevel.objects.select_related("product", "product__category", "warehouse").filter(
            quantity__lte=F("reorder_level")
        )

        if warehouse_id:
            low_stock_qs = low_stock_qs.filter(warehouse_id=warehouse_id)
        if category_id:
            low_stock_qs = low_stock_qs.filter(product__category_id=category_id)

        low_stock_qs = low_stock_qs.order_by("warehouse__name", "quantity")

        rows = []
        total_shortfall_units = 0
        total_restock_cost = Decimal("0.00")

        for s in low_stock_qs:
            prod = s.product
            price = prod.price or Decimal("0.00")
            shortfall = max(0, s.reorder_level - s.quantity)
            estimated_cost = Decimal(shortfall) * price
            total_shortfall_units += shortfall
            total_restock_cost += estimated_cost

            rows.append({
                "sku": prod.sku,
                "product_name": prod.name,
                "category": prod.category.name if prod.category else "Uncategorized",
                "warehouse": s.warehouse.code,
                "current_stock": s.quantity,
                "reorder_level": s.reorder_level,
                "shortfall": shortfall,
                "unit_price": float(price),
                "estimated_restock_cost": float(estimated_cost),
                "urgency": "CRITICAL" if s.quantity == 0 else "WARNING",
            })

        columns = [
            {"key": "sku", "label": "SKU", "align": "center", "is_currency": False},
            {"key": "product_name", "label": "Product", "align": "left", "is_currency": False},
            {"key": "category", "label": "Category", "align": "center", "is_currency": False},
            {"key": "warehouse", "label": "Warehouse", "align": "center", "is_currency": False},
            {"key": "current_stock", "label": "Current Stock", "align": "right", "is_currency": False},
            {"key": "reorder_level", "label": "Reorder Level", "align": "right", "is_currency": False},
            {"key": "shortfall", "label": "Units Deficit", "align": "right", "is_currency": False},
            {"key": "unit_price", "label": "Unit Price (₹)", "align": "right", "is_currency": True},
            {"key": "estimated_restock_cost", "label": "Restock Estimate (₹)", "align": "right", "is_currency": True},
            {"key": "urgency", "label": "Severity", "align": "center", "is_currency": False},
        ]

        summary = {
            "low_stock_sku_count": len(rows),
            "critical_out_of_stock_count": sum(1 for r in rows if r["current_stock"] == 0),
            "total_shortfall_units": total_shortfall_units,
            "estimated_restock_capital": float(total_restock_cost),
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
