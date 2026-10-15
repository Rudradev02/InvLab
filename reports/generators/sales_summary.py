import zoneinfo
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Dict
from django.db.models import Sum
from reports.registry import BaseReport, register_report
from sales.models import Sale, SaleReturn


@register_report
class SalesSummaryReport(BaseReport):
    report_id = "sales_summary"
    name = "Sales Summary Report"
    description = "Comprehensive overview of revenue, discounts, returns, payment methods, and receivables."
    supports_date_filter = True
    supports_category_filter = False
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
        warehouse_name = filters.get("warehouse_name", "All Warehouses")

        # Query Sales in range
        sales_qs = Sale.objects.select_related("warehouse", "customer", "user").prefetch_related("returns").filter(
            created_at__gte=start_dt, created_at__lte=end_dt
        )
        if warehouse_id:
            sales_qs = sales_qs.filter(warehouse_id=warehouse_id)

        sales_qs = sales_qs.order_by("-created_at")

        # Query Returns in range
        returns_qs = SaleReturn.objects.filter(
            created_at__gte=start_dt, created_at__lte=end_dt
        )
        if warehouse_id:
            returns_qs = returns_qs.filter(warehouse_id=warehouse_id)

        # Aggregations
        total_sales_count = sales_qs.count()
        gross_sales = Decimal("0.00")
        total_discounts = Decimal("0.00")
        total_paid = Decimal("0.00")
        total_balance_due = Decimal("0.00")
        total_refunds = returns_qs.aggregate(total=Sum("total_refund_amount"))["total"] or Decimal("0.00")

        # Payment methods breakdown
        methods_breakdown = {
            "cash": {"count": 0, "amount": Decimal("0.00")},
            "upi": {"count": 0, "amount": Decimal("0.00")},
            "card": {"count": 0, "amount": Decimal("0.00")},
            "credit": {"count": 0, "amount": Decimal("0.00")},
            "unknown": {"count": 0, "amount": Decimal("0.00")},
        }

        rows = []
        for s in sales_qs:
            sub = s.subtotal if s.subtotal is not None else s.total_amount
            disc = s.discount_amount or Decimal("0.00")
            paid = s.amount_paid or Decimal("0.00")
            bal = s.balance_due or Decimal("0.00")
            ref = sum((r.total_refund_amount for r in s.returns.all()), Decimal("0.00"))
            net = (sub - disc) - ref

            gross_sales += sub
            total_discounts += disc
            total_paid += paid
            total_balance_due += bal

            pm = s.payment_method or "unknown"
            if pm in methods_breakdown:
                methods_breakdown[pm]["count"] += 1
                methods_breakdown[pm]["amount"] += s.total_amount
            else:
                methods_breakdown["unknown"]["count"] += 1
                methods_breakdown["unknown"]["amount"] += s.total_amount

            # Date formatted in Asia/Kolkata
            local_created = s.created_at.astimezone(tz)
            date_display = local_created.strftime("%Y-%m-%d %H:%M")

            rows.append({
                "sale_number": s.sale_number,
                "date": date_display,
                "warehouse": s.warehouse.code if s.warehouse else "-",
                "customer": s.customer.name if s.customer else "Walk-in",
                "payment_method": s.payment_method.upper() if s.payment_method else "CASH",
                "subtotal": float(sub),
                "discount": float(disc),
                "refunded": float(ref),
                "net_amount": float(net),
                "amount_paid": float(paid),
                "balance_due": float(bal),
            })

        net_revenue = (gross_sales - total_discounts) - total_refunds

        columns = [
            {"key": "sale_number", "label": "Sale #", "align": "center", "is_currency": False},
            {"key": "date", "label": "Date & Time", "align": "center", "is_currency": False},
            {"key": "warehouse", "label": "Warehouse", "align": "center", "is_currency": False},
            {"key": "customer", "label": "Customer", "align": "left", "is_currency": False},
            {"key": "payment_method", "label": "Method", "align": "center", "is_currency": False},
            {"key": "subtotal", "label": "Subtotal (₹)", "align": "right", "is_currency": True},
            {"key": "discount", "label": "Discount (₹)", "align": "right", "is_currency": True},
            {"key": "refunded", "label": "Refunded (₹)", "align": "right", "is_currency": True},
            {"key": "net_amount", "label": "Net Amount (₹)", "align": "right", "is_currency": True},
            {"key": "amount_paid", "label": "Paid (₹)", "align": "right", "is_currency": True},
            {"key": "balance_due", "label": "Udhaar (₹)", "align": "right", "is_currency": True},
        ]

        summary = {
            "total_sales_count": total_sales_count,
            "gross_sales": float(gross_sales),
            "total_discounts": float(total_discounts),
            "total_refunds": float(total_refunds),
            "net_revenue": float(net_revenue),
            "total_collected": float(total_paid),
            "total_udhaar_outstanding": float(total_balance_due),
        }

        return {
            "report_id": self.report_id,
            "name": self.name,
            "description": self.description,
            "filters_applied": {
                "date_from": date_from_str,
                "date_to": date_to_str,
                "warehouse": warehouse_name,
            },
            "summary": summary,
            "payment_methods_breakdown": {
                k: {"count": v["count"], "amount": float(v["amount"])}
                for k, v in methods_breakdown.items()
            },
            "columns": columns,
            "rows": rows,
        }
