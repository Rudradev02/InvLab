from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.db import transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_STAFF, ROLE_WAREHOUSE_MANAGER
from inventory.models import StockLevel
from inventory.services import adjust_stock, receive_stock
from notifications.models import LowStockAlertState, NotificationSettings
from notifications.services import (
    check_and_update_low_stock,
    send_daily_summary_emails,
    send_low_stock_email,
)
from sales.services import create_sale
from warehouses.models import Warehouse

User = get_user_model()


class LowStockAlertServiceTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_WAREHOUSE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.admin = User.objects.create_user(
            username="admin_notif", email="admin@invlab.com", password="password123"
        )
        self.admin.groups.add(self.admin_group)

        self.manager = User.objects.create_user(
            username="manager_pune", email="manager.pune@invlab.com", password="password123"
        )
        self.manager.groups.add(self.manager_group)

        self.warehouse = Warehouse.objects.create(
            name="Pune Central Depot",
            code="PUN",
            manager=self.manager,
            is_active=True,
        )

        self.category = Category.objects.create(name="Hardware")
        self.product = Product.objects.create(
            name="Wireless Mouse",
            sku="WM-100",
            price=Decimal("499.00"),
            category=self.category,
            default_reorder_level=5,
        )

        self.stock_level = StockLevel.objects.create(
            warehouse=self.warehouse,
            product=self.product,
            quantity=10,
            reorder_level=5,
        )

        # Ensure settings are clean
        self.settings = NotificationSettings.get_settings()
        self.settings.enable_low_stock_alerts = True
        self.settings.enable_daily_summary = True
        self.settings.additional_recipients = "alerts.external@invlab.com"
        self.settings.save()
        mail.outbox.clear()

    def test_alert_fires_once_when_crossing_reorder_level(self):
        # Quantity drops from 10 to 4 (<= 5)
        triggered = check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=4,
            reorder_level=5,
        )
        self.assertTrue(triggered)

        state = LowStockAlertState.objects.get(
            warehouse=self.warehouse, product=self.product
        )
        self.assertTrue(state.is_alerted)
        self.assertEqual(state.quantity_at_alert, 4)

        # Subsequent drop from 4 to 2: should NOT trigger a repeat alert
        triggered_again = check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=2,
            reorder_level=5,
        )
        self.assertFalse(triggered_again)

    def test_alert_resets_after_restock(self):
        # 1. Drop into low stock
        check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=3,
            reorder_level=5,
        )
        state = LowStockAlertState.objects.get(
            warehouse=self.warehouse, product=self.product
        )
        self.assertTrue(state.is_alerted)

        # 2. Restock: quantity rises above reorder level
        check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=15,
            reorder_level=5,
        )
        state.refresh_from_db()
        self.assertFalse(state.is_alerted)

        # 3. Drops below reorder level again: new alert should trigger
        new_trigger = check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=4,
            reorder_level=5,
        )
        self.assertTrue(new_trigger)
        state.refresh_from_db()
        self.assertTrue(state.is_alerted)

    def test_email_recipients_scoping_and_delivery(self):
        mail.outbox.clear()
        sent = send_low_stock_email(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=3,
            reorder_level=5,
        )
        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertIn("Low Stock: Wireless Mouse", email.subject)
        self.assertIn("manager.pune@invlab.com", email.to)
        self.assertIn("admin@invlab.com", email.to)
        self.assertIn("alerts.external@invlab.com", email.to)
        self.assertIn("WM-100", email.body)
        self.assertIn("Pune Central Depot", email.body)

    def test_disabled_toggle_suppresses_alert_emails(self):
        self.settings.enable_low_stock_alerts = False
        self.settings.save()
        mail.outbox.clear()

        # Should update state but not send email
        triggered = check_and_update_low_stock(
            warehouse_id=self.warehouse.id,
            product_id=self.product.id,
            current_qty=3,
            reorder_level=5,
        )
        self.assertTrue(triggered)
        self.assertEqual(len(mail.outbox), 0)

    def test_send_after_commit_with_stock_adjustment(self):
        mail.outbox.clear()
        # Adjust stock from 10 by -6 to 4 (threshold: 5)
        with self.captureOnCommitCallbacks(execute=True):
            adjust_stock(
                warehouse_id=self.warehouse.id,
                product_id=self.product.id,
                delta=-6,
                user=self.admin,
                reason="Stock audit",
            )
        # On transaction commit, email was dispatched
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Wireless Mouse", mail.outbox[0].subject)

    def test_send_after_commit_with_sale_deduction(self):
        mail.outbox.clear()
        # Create sale deducting 7 units from 10 down to 3
        with self.captureOnCommitCallbacks(execute=True):
            create_sale(
                warehouse_id=self.warehouse.id,
                user=self.admin,
                lines_data=[{"product_id": self.product.id, "quantity": 7}],
                payment_method="cash",
                amount_paid=Decimal("3493.00"),
            )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Wireless Mouse", mail.outbox[0].subject)


class DailySummaryCommandTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_WAREHOUSE_MANAGER)

        self.admin = User.objects.create_user(
            username="admin_ds", email="admin.daily@invlab.com", password="password123"
        )
        self.admin.groups.add(self.admin_group)

        self.manager = User.objects.create_user(
            username="mgr_ds", email="mgr.daily@invlab.com", password="password123"
        )
        self.manager.groups.add(self.manager_group)

        self.warehouse = Warehouse.objects.create(
            name="Mumbai Hub",
            code="BOM",
            manager=self.manager,
            is_active=True,
        )

        self.category = Category.objects.create(name="Electronics")
        self.product = Product.objects.create(
            name="USB-C Hub",
            sku="HUB-01",
            price=Decimal("1200.00"),
            category=self.category,
        )

        # Low stock item
        self.stock = StockLevel.objects.create(
            warehouse=self.warehouse,
            product=self.product,
            quantity=2,
            reorder_level=5,
        )

        mail.outbox.clear()

    def test_daily_summary_dispatch(self):
        emails_sent = send_daily_summary_emails()
        # 1 email for Manager (Mumbai Hub) + 1 email for Admin (Consolidated)
        self.assertEqual(emails_sent, 2)
        self.assertEqual(len(mail.outbox), 2)

        subjects = [m.subject for m in mail.outbox]
        self.assertTrue(any("Mumbai Hub" in s for s in subjects))
        self.assertTrue(any("All Warehouses" in s for s in subjects))

    def test_management_command_execution(self):
        mail.outbox.clear()
        call_command("send_daily_summary")
        self.assertEqual(len(mail.outbox), 2)

    def test_management_command_dry_run(self):
        mail.outbox.clear()
        call_command("send_daily_summary", "--dry-run")
        self.assertEqual(len(mail.outbox), 0)


class NotificationsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.admin = User.objects.create_user(username="admin_api", password="password123")
        self.admin.groups.add(self.admin_group)

        self.staff = User.objects.create_user(username="staff_api", password="password123")
        self.staff.groups.add(self.staff_group)

        self.wh1 = Warehouse.objects.create(name="WH Alpha", code="WHA", is_active=True)
        self.wh2 = Warehouse.objects.create(name="WH Beta", code="WHB", is_active=True)

        self.staff.profile.warehouse = self.wh1
        self.staff.profile.save()

        self.cat = Category.objects.create(name="Groceries")
        self.p1 = Product.objects.create(
            name="Rice 5kg", sku="RICE-5K", price=Decimal("300.00"), category=self.cat
        )
        self.p2 = Product.objects.create(
            name="Wheat 10kg", sku="WHEAT-10K", price=Decimal("450.00"), category=self.cat
        )

        # WH1 has p1 low stock
        StockLevel.objects.create(warehouse=self.wh1, product=self.p1, quantity=3, reorder_level=10)
        # WH2 has p2 low stock
        StockLevel.objects.create(warehouse=self.wh2, product=self.p2, quantity=1, reorder_level=5)

    def test_get_notification_settings(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/notification-settings/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["enable_low_stock_alerts"])

    def test_update_notification_settings_admin_only(self):
        # Staff denied
        self.client.force_authenticate(user=self.staff)
        res = self.client.patch("/api/v1/notification-settings/", {"enable_low_stock_alerts": False})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin allowed
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            "/api/v1/notification-settings/",
            {"enable_low_stock_alerts": False, "additional_recipients": "test@test.com"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["enable_low_stock_alerts"])
        self.assertIn("test@test.com", res.data["additional_recipients_list"])

    def test_low_stock_notifications_scoping(self):
        # Admin sees all low stock items (2 items)
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get("/api/v1/notifications/low-stock/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.data["count"], 2)

        # Staff sees only their assigned warehouse (WH1: 1 item)
        self.client.force_authenticate(user=self.staff)
        res_staff = self.client.get("/api/v1/notifications/low-stock/")
        self.assertEqual(res_staff.status_code, status.HTTP_200_OK)
        self.assertEqual(res_staff.data["count"], 1)
        self.assertEqual(res_staff.data["results"][0]["sku"], "RICE-5K")
