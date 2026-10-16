import logging
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import models, transaction
from django.utils import timezone

from catalog.models import Product
from core.permissions import ROLE_ADMIN
from warehouses.models import Warehouse
from .models import LowStockAlertState, NotificationSettings

logger = logging.getLogger(__name__)
User = get_user_model()


def check_and_update_low_stock(
    warehouse_id: int, product_id: int, current_qty: int, reorder_level: int
) -> bool:
    """
    Evaluates stock crossing for a warehouse product.
    - If stock > reorder_level: resets alert state (handles restock).
    - If stock <= reorder_level: triggers email once if not already alerted.
    Must be called inside or outside an active transaction.
    Returns True if an alert was triggered.
    """
    try:
        settings_obj = NotificationSettings.get_settings()
    except Exception:
        settings_obj = None

    state, _ = LowStockAlertState.objects.get_or_create(
        warehouse_id=warehouse_id,
        product_id=product_id,
        defaults={
            "quantity_at_alert": current_qty,
            "reorder_level_at_alert": reorder_level,
        },
    )

    # Restock detection: stock has risen strictly above reorder level
    if current_qty > reorder_level:
        if state.is_alerted:
            state.is_alerted = False
            state.quantity_at_alert = current_qty
            state.reorder_level_at_alert = reorder_level
            state.save(update_fields=["is_alerted", "quantity_at_alert", "reorder_level_at_alert", "updated_at"])
            logger.info(
                f"Low stock alert reset for product {product_id} @ warehouse {warehouse_id} (restocked to {current_qty})"
            )
        return False

    # Low stock condition: current_qty <= reorder_level
    if not state.is_alerted:
        state.is_alerted = True
        state.last_alerted_at = timezone.now()
        state.quantity_at_alert = current_qty
        state.reorder_level_at_alert = reorder_level
        state.save(update_fields=["is_alerted", "last_alerted_at", "quantity_at_alert", "reorder_level_at_alert", "updated_at"])

        if settings_obj and settings_obj.enable_low_stock_alerts:
            # Enforce send_after_commit so email sending failure never blocks the database transaction
            transaction.on_commit(
                lambda: send_low_stock_email(
                    warehouse_id=warehouse_id,
                    product_id=product_id,
                    current_qty=current_qty,
                    reorder_level=reorder_level,
                )
            )
        return True

    return False


def send_low_stock_email(
    warehouse_id: int, product_id: int, current_qty: int, reorder_level: int
) -> bool:
    """
    Builds and sends a clean low stock notification email.
    Recipients:
    - Assigned Warehouse Manager gets alerts for their own warehouse.
    - Admins get alerts for all warehouses.
    - Additional configured email recipients.
    """
    try:
        warehouse = Warehouse.objects.select_related("manager").get(pk=warehouse_id)
        product = Product.objects.get(pk=product_id)
    except Exception as e:
        logger.error(f"Cannot send low stock email: entity lookup failed: {e}")
        return False

    recipients = set()

    # 1. Warehouse Manager
    if warehouse.manager and warehouse.manager.email:
        recipients.add(warehouse.manager.email.strip().lower())

    # 2. System Admins (role Admin)
    admin_emails = User.objects.filter(
        groups__name=ROLE_ADMIN, is_active=True
    ).exclude(email="").values_list("email", flat=True)
    for email in admin_emails:
        if email:
            recipients.add(email.strip().lower())

    # 3. Additional recipients from NotificationSettings
    try:
        notif_settings = NotificationSettings.get_settings()
        for email in notif_settings.get_additional_recipients_list():
            recipients.add(email)
    except Exception:
        pass

    if not recipients:
        logger.info(f"Low stock alert for {product.name} suppressed: no recipients found.")
        return False

    subject = f"[InvLab Alert] Low Stock: {product.name} ({warehouse.name})"
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "InvLab Alerts <alerts@invlab.local>")

    status_label = "OUT OF STOCK" if current_qty <= 0 else "LOW STOCK"

    plain_message = f"""
Low Stock Alert Notification
-------------------------------------------
Status:          {status_label}
Product:         {product.name}
SKU:             {product.sku}
Warehouse:       {warehouse.name} ({warehouse.code})
Current Stock:   {current_qty} units
Reorder Level:   {reorder_level} units
Price:           ₹{product.price}

Action Required:
Please place a Purchase Order with your supplier or initiate a Stock Transfer from another warehouse.

--
InvLab Inventory Management System
""".strip()

    html_message = f"""
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #202521; margin: 0; padding: 20px; }}
    .card {{ max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #E3E1DA; border-radius: 8px; overflow: hidden; }}
    .header {{ background: #173D32; color: #ffffff; padding: 18px 24px; }}
    .header h2 {{ margin: 0; font-size: 18px; }}
    .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-top: 6px; text-transform: uppercase; }}
    .badge-out {{ background: #B3261E; color: #ffffff; }}
    .badge-low {{ background: #F59E0B; color: #173D32; }}
    .content {{ padding: 24px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ text-align: left; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #F1F1EC; }}
    th {{ color: #5E6B63; font-weight: 600; width: 35%; }}
    td {{ color: #202521; font-weight: 500; }}
    .footer {{ background: #F8F8F5; padding: 14px 24px; font-size: 11px; color: #5E6B63; text-align: center; border-top: 1px solid #E3E1DA; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>InvLab Stock Alert</h2>
      <span class="badge { 'badge-out' if current_qty <= 0 else 'badge-low' }">{status_label}</span>
    </div>
    <div class="content">
      <p style="margin-top: 0; font-size: 14px;">The following inventory item has crossed its designated reorder threshold in <strong>{warehouse.name}</strong>:</p>
      <table>
        <tr><th>Product Name</th><td><strong>{product.name}</strong></td></tr>
        <tr><th>SKU</th><td style="font-family: monospace;">{product.sku}</td></tr>
        <tr><th>Warehouse</th><td>{warehouse.name} ({warehouse.code})</td></tr>
        <tr><th>Current Stock</th><td style="color: { '#B3261E' if current_qty <= 0 else '#D97706' }; font-weight: bold;">{current_qty} units</td></tr>
        <tr><th>Reorder Level</th><td>{reorder_level} units</td></tr>
        <tr><th>Unit Price</th><td>₹{product.price}</td></tr>
      </table>
      <p style="margin-top: 20px; font-size: 12px; color: #5E6B63;">
        Please review your inventory levels to arrange a purchase order or transfer stock from another warehouse.
      </p>
    </div>
    <div class="footer">
      Automated notification sent by InvLab Multi-Warehouse Inventory System.
    </div>
  </div>
</body>
</html>
""".strip()

    try:
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=from_email,
            recipient_list=list(recipients),
            html_message=html_message,
            fail_silently=False,
        )
        logger.info(f"Low stock alert email successfully sent for {product.name} to {recipients}")
        return True
    except Exception as e:
        logger.error(f"Failed to send low stock email: {e}")
        return False


def send_daily_summary_emails() -> int:
    """
    Management task: compiles and sends daily operational summaries.
    - Warehouse Managers receive a summary for their own warehouse.
    - Admins receive a consolidated multi-warehouse summary.
    Includes:
      - Low stock items
      - Today's sales count and net revenue
      - Total outstanding customer receivables (udhaar)
    Returns count of emails successfully dispatched.
    """
    from inventory.models import StockLevel
    from sales.models import Sale

    try:
        notif_settings = NotificationSettings.get_settings()
        if not notif_settings.enable_daily_summary:
            logger.info("Daily summary emails are disabled in NotificationSettings.")
            return 0
    except Exception:
        notif_settings = None

    now = timezone.now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    warehouses = Warehouse.objects.filter(is_active=True).select_related("manager")
    warehouse_summaries = []

    for w in warehouses:
        # Low stock items in this warehouse
        low_stocks = (
            StockLevel.objects.filter(warehouse=w, quantity__lte=models.F("reorder_level"))
            .select_related("product")
            .order_by("quantity")
        )

        # Today's sales in this warehouse
        today_sales = Sale.objects.filter(warehouse=w, created_at__gte=start_of_day)
        sales_count = today_sales.count()
        sales_revenue = today_sales.aggregate(
            rev=models.Sum("total_amount")
        )["rev"] or 0

        # Outstanding credit (udhaar balance) in this warehouse
        outstanding_credit = today_sales.aggregate(
            bal=models.Sum("balance_due")
        )["bal"] or 0

        warehouse_summaries.append({
            "warehouse": w,
            "low_stock_count": low_stocks.count(),
            "low_stocks": [
                {
                    "name": s.product.name,
                    "sku": s.product.sku,
                    "quantity": s.quantity,
                    "reorder_level": s.reorder_level,
                }
                for s in low_stocks[:10]  # top 10
            ],
            "sales_count": sales_count,
            "sales_revenue": sales_revenue,
            "outstanding_credit": outstanding_credit,
        })

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "InvLab Alerts <alerts@invlab.local>")
    emails_sent = 0

    # 1. Dispatch individual warehouse summaries to Warehouse Managers
    for ws in warehouse_summaries:
        w = ws["warehouse"]
        if w.manager and w.manager.email:
            subject = f"[InvLab Daily Summary] {w.name} ({now.strftime('%d %b %Y')})"
            plain = f"""
Daily Warehouse Summary: {w.name} ({w.code})
Date: {now.strftime('%d %B %Y')}
--------------------------------------------------
Today's Sales Count:       {ws['sales_count']}
Today's Net Revenue:       ₹{float(ws['sales_revenue']):.2f}
Outstanding Udhaar Added:  ₹{float(ws['outstanding_credit']):.2f}
Low Stock Items Count:     {ws['low_stock_count']}

Low Stock Items:
"""
            for it in ws["low_stocks"]:
                plain += f"- {it['name']} ({it['sku']}): {it['quantity']} left (threshold: {it['reorder_level']})\n"
            if ws["low_stock_count"] > 10:
                plain += f"... and {ws['low_stock_count'] - 10} more items.\n"

            try:
                send_mail(
                    subject=subject,
                    message=plain,
                    from_email=from_email,
                    recipient_list=[w.manager.email.strip().lower()],
                    fail_silently=False,
                )
                emails_sent += 1
            except Exception as e:
                logger.error(f"Failed to send manager daily summary for {w.code}: {e}")

    # 2. Dispatch consolidated company summary to Admins & Additional Recipients
    admin_recipients = set()
    admin_emails = User.objects.filter(
        groups__name=ROLE_ADMIN, is_active=True
    ).exclude(email="").values_list("email", flat=True)
    for e in admin_emails:
        if e:
            admin_recipients.add(e.strip().lower())

    if notif_settings:
        for e in notif_settings.get_additional_recipients_list():
            admin_recipients.add(e)

    if admin_recipients:
        total_sales_count = sum(ws["sales_count"] for ws in warehouse_summaries)
        total_revenue = sum(float(ws["sales_revenue"]) for ws in warehouse_summaries)
        total_low_stock = sum(ws["low_stock_count"] for ws in warehouse_summaries)
        total_credit = sum(float(ws["outstanding_credit"]) for ws in warehouse_summaries)

        subject = f"[InvLab Daily Summary] All Warehouses Overview ({now.strftime('%d %b %Y')})"
        plain = f"""
Company-Wide Daily Inventory & Sales Summary
Date: {now.strftime('%d %B %Y')}
--------------------------------------------------
Total Sales Recorded:      {total_sales_count}
Total Gross Revenue:       ₹{total_revenue:.2f}
Total Udhaar Booked:       ₹{total_credit:.2f}
Total Low Stock Alerts:    {total_low_stock}

Warehouse Breakdown:
"""
        for ws in warehouse_summaries:
            w = ws["warehouse"]
            plain += f"\n* {w.name} ({w.code}):\n"
            plain += f"  - Sales: {ws['sales_count']} (₹{float(ws['sales_revenue']):.2f})\n"
            plain += f"  - Low Stock Items: {ws['low_stock_count']}\n"
            plain += f"  - Outstanding Credit: ₹{float(ws['outstanding_credit']):.2f}\n"

        try:
            send_mail(
                subject=subject,
                message=plain,
                from_email=from_email,
                recipient_list=list(admin_recipients),
                fail_silently=False,
            )
            emails_sent += 1
        except Exception as e:
            logger.error(f"Failed to send admin daily summary: {e}")

    return emails_sent
