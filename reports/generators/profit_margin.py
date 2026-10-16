import zoneinfo
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Dict
from reports.registry import BaseReport, register_report
from sales.models import Sale


@register_report
class ProfitMarginReport(BaseReport):
    report_id = "profit_margin"
    name = "Profit & Gross Margin Report"
    description = "Granular profit and gross margin analysis per sale line, reflecting discounts, returns, and cost snapshots."
    supports_date_filter = True
    supports_category_filter = True
    supports_warehouse_filter = True
    supported_formats = ["json", "csv", "xlsx", "pdf"]

    def generate(self, user, filters: Dict[str, Any]) -> Dict[str, Any]:
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        # Parse date range
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
        category_id = filters.get("category")

        # Query Sales with lines, products, returns
        sales_qs = Sale.objects.filter(
            created_at__gte=start_dt, created_at__lte=end_dt
        ).select_related("warehouse", "customer").prefetch_related(
            "lines__product__category", "lines__return_lines"
        ).order_by("-created_at")

        if warehouse_id:
            sales_qs = sales_qs.filter(warehouse_id=warehouse_id)

        rows = []
        total_known_revenue = Decimal("0.00")
        total_known_cost = Decimal("0.00")
        total_gross_profit = Decimal("0.00")
        known_lines_count = 0
        unknown_cost_count = 0

        for sale in sales_qs:
            local_dt = sale.created_at.astimezone(tz).strftime("%Y-%m-%d %H:%M")
            for line in sale.lines.all():
                if category_id and line.product.category_id != int(category_id):
                    continue

                # Discount apportionment
                if sale.subtotal > Decimal("0.00"):
                    line_eff_rev = (line.subtotal * sale.total_amount) / sale.subtotal
                else:
                    line_eff_rev = line.subtotal

                # Returns on line
                ret_refund = sum((rl.refund_amount for rl in line.return_lines.all()), Decimal("0.00"))
                ret_qty = sum((rl.quantity for rl in line.return_lines.all()), 0)

                net_rev = max(Decimal("0.00"), line_eff_rev - ret_refund)
                net_qty = max(0, line.quantity - ret_qty)

                if line.unit_cost is None:
                    unknown_cost_count += 1
                    cost_display = "Unknown"
                    net_cost_val = 0.0
                    profit_val = 0.0
                    margin_pct_val = 0.0
                else:
                    known_lines_count += 1
                    cost_val = line.unit_cost * Decimal(net_qty)
                    profit_amount = net_rev - cost_val
                    total_known_revenue += net_rev
                    total_known_cost += cost_val
                    total_gross_profit += profit_amount

                    if net_rev > Decimal("0.00"):
                        line_margin = (profit_amount / net_rev) * Decimal("100.00")
                    else:
                        line_margin = Decimal("0.00")

                    cost_display = f"₹{line.unit_cost:.2f}"
                    net_cost_val = float(cost_val)
                    profit_val = float(profit_amount)
                    margin_pct_val = round(float(line_margin), 2)

                rows.append({
                    "date": local_dt,
                    "sale_number": sale.sale_number,
                    "warehouse": sale.warehouse.code if sale.warehouse else "-",
                    "sku": line.product.sku,
                    "product_name": line.product.name,
                    "quantity_sold": line.quantity,
                    "quantity_returned": ret_qty,
                    "net_quantity": net_qty,
                    "unit_price": float(line.unit_price),
                    "unit_cost": cost_display,
                    "net_revenue": float(net_rev),
                    "net_cost": net_cost_val,
                    "gross_profit": profit_val,
                    "margin_pct": margin_pct_val,
                })

        overall_margin = (
            round(float((total_gross_profit / total_known_revenue) * Decimal("100.00")), 2)
            if total_known_revenue > Decimal("0.00")
            else 0.0
        )

        columns = [
            {"key": "date", "label": "Date", "align": "center", "is_currency": False},
            {"key": "sale_number", "label": "Sale #", "align": "center", "is_currency": False},
            {"key": "warehouse", "label": "Warehouse", "align": "center", "is_currency": False},
            {"key": "sku", "label": "SKU", "align": "left", "is_currency": False},
            {"key": "product_name", "label": "Item Name", "align": "left", "is_currency": False},
            {"key": "net_quantity", "label": "Net Units", "align": "center", "is_currency": False},
            {"key": "unit_price", "label": "Selling Price (₹)", "align": "right", "is_currency": True},
            {"key": "unit_cost", "label": "Unit Cost", "align": "right", "is_currency": False},
            {"key": "net_revenue", "label": "Net Revenue (₹)", "align": "right", "is_currency": True},
            {"key": "net_cost", "label": "Net Cost (₹)", "align": "right", "is_currency": True},
            {"key": "gross_profit", "label": "Profit (₹)", "align": "right", "is_currency": True},
            {"key": "margin_pct", "label": "Margin %", "align": "right", "is_currency": False},
        ]

        summary = {
            "total_lines": len(rows),
            "known_cost_lines": known_lines_count,
            "unknown_cost_lines": unknown_cost_count,
            "total_net_revenue": float(total_known_revenue),
            "total_net_cost": float(total_known_cost),
            "total_gross_profit": float(total_gross_profit),
            "overall_margin_pct": overall_margin,
        }

        return {
            "report_id": self.report_id,
            "name": self.name,
            "description": self.description,
            "filters_applied": {
                "date_from": date_from_str,
                "date_to": date_to_str,
                "warehouse": warehouse_id,
                "category": category_id,
            },
            "summary": summary,
            "columns": columns,
            "rows": rows,
        }
