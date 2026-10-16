import zoneinfo
from datetime import datetime, time, timedelta
from decimal import Decimal
from django.db.models import F, Sum
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import ROLE_ADMIN, get_user_role
from inventory.models import StockLevel
from sales.models import Sale
from transfers.models import StockTransfer
from customers.models import Customer


class DashboardView(APIView):
    """
    Role-aware dashboard metrics and charts.
    GET /api/v1/dashboard/?warehouse=<id>&range=7d|30d|90d
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")

        # Warehouse scoping
        warehouse_id = None
        if role == ROLE_ADMIN:
            warehouse_param = request.query_params.get("warehouse")
            if warehouse_param:
                try:
                    warehouse_id = int(warehouse_param)
                except ValueError:
                    return Response({"error": "Invalid warehouse ID."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            profile = getattr(user, "profile", None)
            if not profile or not profile.warehouse_id:
                raise PermissionDenied("You must be assigned to an active warehouse to access dashboard metrics.")
            if not profile.warehouse.is_active:
                raise PermissionDenied("Your assigned warehouse has been deactivated.")
            warehouse_id = profile.warehouse_id

        # Range parsing
        range_param = request.query_params.get("range", "7d").lower()
        if range_param == "90d":
            days = 90
        elif range_param == "30d":
            days = 30
        else:
            days = 7
            range_param = "7d"

        now = datetime.now(tz)
        today = now.date()
        start_date = today - timedelta(days=days - 1)
        start_dt = datetime.combine(start_date, time.min, tzinfo=tz)
        end_dt = datetime.combine(today, time.max, tzinfo=tz)

        # Sales in range & warehouse
        sales_qs = Sale.objects.filter(
            created_at__gte=start_dt, created_at__lte=end_dt
        ).select_related("warehouse", "customer", "user").prefetch_related(
            "lines__product", "lines__return_lines", "returns"
        )
        if warehouse_id:
            sales_qs = sales_qs.filter(warehouse_id=warehouse_id)

        sales = list(sales_qs.order_by("created_at"))

        # Pre-populate daily chart buckets
        daily_map = {}
        for i in range(days):
            d_str = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
            daily_map[d_str] = {
                "date": d_str,
                "revenue": Decimal("0.00"),
                "profit": Decimal("0.00"),
                "sales_count": 0,
            }

        total_revenue = Decimal("0.00")
        gross_profit = Decimal("0.00")
        revenue_of_known = Decimal("0.00")
        unknown_cost_count = 0
        sales_count = len(sales)

        for sale in sales:
            sale_date_str = sale.created_at.astimezone(tz).strftime("%Y-%m-%d")
            if sale_date_str in daily_map:
                daily_map[sale_date_str]["sales_count"] += 1

            # Sale net revenue
            total_refunds = sum((r.total_refund_amount for r in sale.returns.all()), Decimal("0.00"))
            sale_net_revenue = max(Decimal("0.00"), sale.total_amount - total_refunds)
            total_revenue += sale_net_revenue

            if sale_date_str in daily_map:
                daily_map[sale_date_str]["revenue"] += sale_net_revenue

            # Lines profit calculation
            for line in sale.lines.all():
                # Line discount apportionment
                if sale.subtotal > Decimal("0.00"):
                    line_eff_rev = (line.subtotal * sale.total_amount) / sale.subtotal
                else:
                    line_eff_rev = line.subtotal

                # Subtract returns on this line
                line_refunds = sum((rl.refund_amount for rl in line.return_lines.all()), Decimal("0.00"))
                line_ret_qty = sum((rl.quantity for rl in line.return_lines.all()), 0)

                net_line_rev = max(Decimal("0.00"), line_eff_rev - line_refunds)
                net_line_qty = max(0, line.quantity - line_ret_qty)

                # If unit_cost is missing/unknown, exclude from profit (never treat as 0)
                if line.unit_cost is None:
                    unknown_cost_count += 1
                else:
                    line_cost = line.unit_cost * Decimal(net_line_qty)
                    line_profit = net_line_rev - line_cost
                    gross_profit += line_profit
                    revenue_of_known += net_line_rev

                    if sale_date_str in daily_map:
                        daily_map[sale_date_str]["profit"] += line_profit

        # Profit margin %
        if revenue_of_known > Decimal("0.00"):
            margin_pct = round(float((gross_profit / revenue_of_known) * Decimal("100.00")), 2)
        else:
            margin_pct = 0.00

        # Stock metrics
        stock_qs = StockLevel.objects.all()
        if warehouse_id:
            stock_qs = stock_qs.filter(warehouse_id=warehouse_id)

        total_units = stock_qs.aggregate(total=Sum("quantity"))["total"] or 0
        low_stock_count = stock_qs.filter(quantity__lte=F("reorder_level")).count()

        # Outstanding receivables
        if warehouse_id:
            receivables_agg = Sale.objects.filter(warehouse_id=warehouse_id).aggregate(total=Sum("balance_due"))["total"]
        else:
            receivables_agg = Customer.objects.aggregate(total=Sum("current_balance"))["total"]
        total_receivables = str(receivables_agg or "0.00")

        # Pending transfers
        transfer_qs = StockTransfer.objects.filter(status="in_transit")
        if warehouse_id:
            transfer_qs = transfer_qs.filter(to_warehouse_id=warehouse_id)
        pending_transfers = transfer_qs.count()

        # Convert daily map to list
        daily_chart = [
            {
                "date": v["date"],
                "revenue": float(v["revenue"].quantize(Decimal("0.01"))),
                "profit": float(v["profit"].quantize(Decimal("0.01"))),
                "sales_count": v["sales_count"],
            }
            for v in daily_map.values()
        ]

        return Response({
            "range": range_param,
            "warehouse_id": warehouse_id,
            "kpis": {
                "total_revenue": str(total_revenue.quantize(Decimal("0.01"))),
                "gross_profit": str(gross_profit.quantize(Decimal("0.01"))),
                "profit_margin_pct": margin_pct,
                "unknown_cost_count": unknown_cost_count,
                "sales_count": sales_count,
                "total_units": total_units,
                "low_stock_count": low_stock_count,
                "total_receivables": total_receivables,
                "pending_transfers": pending_transfers,
            },
            "daily_chart": daily_chart,
        })
