import zoneinfo
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Dict
from django.db.models import Sum, F
from reports.registry import BaseReport, register_report
from sales.models import SaleLine, SaleReturnLine


@register_report
class SalesByProductReport(BaseReport):
    report_id = "sales_by_product"
    name = "Sales by Product & Category"
    description = "Performance analysis of product sales volumes, returns, discounts, and net revenues."
    supports_date_filter = True
    supports_category_filter = True
    supports_warehouse_filter = True
    supported_formats = ["json", "csv", "xlsx", "pdf"]

    def generate(self, user, filters: Dict[str, Any]) -> Dict[str, Any]:
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        date_from_str = filters.get("date_from")
        date_to_str = filters.get("date_to")

        if date_from_str:
            d_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(d_from, time.min, tzinfo=tz)
        else:
            start_dt = datetime.combine(datetime.now(tz).date(), time.min, tzinfo=tz)
            date_from_str = start_dt.strftime("%Y-%m-%d")

        if date_to_str:
            d_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
            end_dt = datetime.combine(d_to, time.max, tzinfo=tz)
        else:
            end_dt = datetime.combine(datetime.now(tz).date(), time.max, tzinfo=tz)
            date_to_str = end_dt.strftime("%Y-%m-%d")

        warehouse_id = filters.get("warehouse")
        warehouse_name = filters.get("warehouse_name", "All Warehouses")
        category_id = filters.get("category")
        category_name = filters.get("category_name", "All Categories")

        # Query SaleLines in date range
        sale_lines = SaleLine.objects.select_related("product", "product__category", "sale").filter(
            sale__created_at__gte=start_dt,
            sale__created_at__lte=end_dt,
        )
        if warehouse_id:
            sale_lines = sale_lines.filter(sale__warehouse_id=warehouse_id)
        if category_id:
            sale_lines = sale_lines.filter(product__category_id=category_id)

        # Aggregate by product
        products_map: Dict[int, Dict[str, Any]] = {}

        for line in sale_lines:
            pid = line.product_id
            if pid not in products_map:
                cat_name = line.product.category.name if line.product.category else "Uncategorized"
                products_map[pid] = {
                    "product_id": pid,
                    "product_name": line.product.name,
                    "sku": line.product.sku,
                    "category": cat_name,
                    "units_sold": 0,
                    "units_returned": 0,
                    "gross_sales": Decimal("0.00"),
                    "refunded_amount": Decimal("0.00"),
                }

            products_map[pid]["units_sold"] += line.quantity
            products_map[pid]["gross_sales"] += line.subtotal

        # Query Returns for returned quantity and refund amount
        return_lines = SaleReturnLine.objects.select_related("product", "product__category", "sale_return").filter(
            sale_return__created_at__gte=start_dt,
            sale_return__created_at__lte=end_dt,
        )
        if warehouse_id:
            return_lines = return_lines.filter(sale_return__warehouse_id=warehouse_id)
        if category_id:
            return_lines = return_lines.filter(product__category_id=category_id)

        for ret in return_lines:
            pid = ret.product_id
            if pid in products_map:
                products_map[pid]["units_returned"] += ret.quantity
                products_map[pid]["refunded_amount"] += ret.refund_amount
            elif ret.product:
                cat_name = ret.product.category.name if ret.product.category else "Uncategorized"
                products_map[pid] = {
                    "product_id": pid,
                    "product_name": ret.product.name,
                    "sku": ret.product.sku,
                    "category": cat_name,
                    "units_sold": 0,
                    "units_returned": ret.quantity,
                    "gross_sales": Decimal("0.00"),
                    "refunded_amount": ret.refund_amount,
                }

        # Build rows
        rows = []
        total_units_sold = 0
        total_units_returned = 0
        total_gross = Decimal("0.00")
        total_refunds = Decimal("0.00")

        # Sort by units sold descending
        sorted_products = sorted(products_map.values(), key=lambda x: x["units_sold"], reverse=True)

        for p in sorted_products:
            net_units = p["units_sold"] - p["units_returned"]
            net_revenue = p["gross_sales"] - p["refunded_amount"]

            total_units_sold += p["units_sold"]
            total_units_returned += p["units_returned"]
            total_gross += p["gross_sales"]
            total_refunds += p["refunded_amount"]

            rows.append({
                "sku": p["sku"],
                "product_name": p["product_name"],
                "category": p["category"],
                "units_sold": p["units_sold"],
                "units_returned": p["units_returned"],
                "net_units": net_units,
                "gross_revenue": float(p["gross_sales"]),
                "refunded_amount": float(p["refunded_amount"]),
                "net_revenue": float(net_revenue),
            })

        net_total = total_gross - total_refunds

        columns = [
            {"key": "sku", "label": "SKU", "align": "center", "is_currency": False},
            {"key": "product_name", "label": "Product Name", "align": "left", "is_currency": False},
            {"key": "category", "label": "Category", "align": "center", "is_currency": False},
            {"key": "units_sold", "label": "Units Sold", "align": "right", "is_currency": False},
            {"key": "units_returned", "label": "Returned", "align": "right", "is_currency": False},
            {"key": "net_units", "label": "Net Units", "align": "right", "is_currency": False},
            {"key": "gross_revenue", "label": "Gross Sales (₹)", "align": "right", "is_currency": True},
            {"key": "refunded_amount", "label": "Refunded (₹)", "align": "right", "is_currency": True},
            {"key": "net_revenue", "label": "Net Revenue (₹)", "align": "right", "is_currency": True},
        ]

        summary = {
            "products_sold_count": len(rows),
            "total_units_sold": total_units_sold,
            "total_units_returned": total_units_returned,
            "net_units_delivered": total_units_sold - total_units_returned,
            "gross_sales": float(total_gross),
            "total_refunds": float(total_refunds),
            "net_revenue": float(net_total),
        }

        return {
            "report_id": self.report_id,
            "name": self.name,
            "description": self.description,
            "filters_applied": {
                "date_from": date_from_str,
                "date_to": date_to_str,
                "warehouse": warehouse_name,
                "category": category_name,
            },
            "summary": summary,
            "columns": columns,
            "rows": rows,
        }
