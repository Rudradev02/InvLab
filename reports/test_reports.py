from datetime import datetime, timedelta
from decimal import Decimal
import zoneinfo
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel
from sales.models import Sale, SaleLine, SaleReturn, SaleReturnLine
from warehouses.models import Warehouse

User = get_user_model()


class ReportsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create roles
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Create Warehouses
        self.warehouse1 = Warehouse.objects.create(
            name="Main Warehouse",
            code="MWH",
            address_line1="123 Industrial Area",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
        )
        self.warehouse2 = Warehouse.objects.create(
            name="North Hub",
            code="NHB",
            address_line1="456 Logistics Park",
            city="Delhi",
            state="Delhi",
            pincode="110001",
        )

        # Create Users
        self.admin = User.objects.create_user(
            username="admin_user", email="admin@invlab.com", password="password123", is_superuser=True
        )
        self.admin.groups.add(self.admin_group)

        self.manager1 = User.objects.create_user(
            username="manager_one", email="mgr1@invlab.com", password="password123"
        )
        self.manager1.groups.add(self.manager_group)
        self.manager1.profile.warehouse = self.warehouse1
        self.manager1.profile.save()

        self.staff1 = User.objects.create_user(
            username="staff_one", email="staff1@invlab.com", password="password123"
        )
        self.staff1.groups.add(self.staff_group)
        self.staff1.profile.warehouse = self.warehouse1
        self.staff1.profile.save()

        # Create Category and Products
        self.category = Category.objects.create(name="Electronics")
        self.product1 = Product.objects.create(
            sku="PROD-001",
            name="Wireless Mouse",
            category=self.category,
            price=Decimal("500.00"),
            stock=100,
        )
        self.product2 = Product.objects.create(
            sku="=CMD|' /C calc'!A0",  # Test formula injection in SKU/Name
            name="USB-C Hub",
            category=self.category,
            price=Decimal("1500.00"),
            stock=5,
        )

        # Stock levels
        StockLevel.objects.create(
            product=self.product1,
            warehouse=self.warehouse1,
            quantity=80,
            reorder_level=20,
        )
        StockLevel.objects.create(
            product=self.product2,
            warehouse=self.warehouse1,
            quantity=3,  # Below reorder level (low stock!)
            reorder_level=10,
        )
        StockLevel.objects.create(
            product=self.product1,
            warehouse=self.warehouse2,
            quantity=20,
            reorder_level=15,
        )

        # Create Sales
        self.sale1 = Sale.objects.create(
            sale_number="SALE-REP-001",
            warehouse=self.warehouse1,
            user=self.manager1,
            subtotal=Decimal("1000.00"),
            discount_type="amount",
            discount_value=Decimal("100.00"),
            discount_amount=Decimal("100.00"),
            total_amount=Decimal("900.00"),
            amount_paid=Decimal("900.00"),
            balance_due=Decimal("0.00"),
            payment_method="cash",
        )
        self.sale_line1 = SaleLine.objects.create(
            sale=self.sale1,
            product=self.product1,
            quantity=2,
            unit_price=Decimal("500.00"),
            subtotal=Decimal("1000.00"),
        )

        self.sale2 = Sale.objects.create(
            sale_number="SALE-REP-002",
            warehouse=self.warehouse1,
            user=self.manager1,
            subtotal=Decimal("1500.00"),
            discount_type="none",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            total_amount=Decimal("1500.00"),
            amount_paid=Decimal("500.00"),
            balance_due=Decimal("1000.00"),
            payment_method="credit",
        )
        self.sale_line2 = SaleLine.objects.create(
            sale=self.sale2,
            product=self.product2,
            quantity=1,
            unit_price=Decimal("1500.00"),
            subtotal=Decimal("1500.00"),
        )

        # Create Sale Return on sale1
        self.return1 = SaleReturn.objects.create(
            return_number="RET-REP-001",
            sale=self.sale1,
            warehouse=self.warehouse1,
            processed_by=self.manager1,
            total_refund_amount=Decimal("500.00"),
            refund_method="cash",
            reason="Customer returned 1 mouse",
        )
        SaleReturnLine.objects.create(
            sale_return=self.return1,
            sale_line=self.sale_line1,
            product=self.product1,
            quantity=1,
            unit_price=Decimal("500.00"),
            refund_amount=Decimal("500.00"),
        )

        self.sale1.total_refunded = Decimal("500.00")
        self.sale1.return_status = "partially_returned"
        self.sale1.save()

    def test_staff_forbidden_on_reports(self):
        """Staff members are forbidden from accessing report endpoints (403)."""
        self.client.force_authenticate(user=self.staff1)
        res = self.client.get("/api/v1/reports/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res2 = self.client.get("/api/v1/reports/sales_summary/")
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_and_admin_can_list_reports(self):
        """Managers and Admins can list available reports."""
        self.client.force_authenticate(user=self.manager1)
        res = self.client.get("/api/v1/reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        report_ids = [r["id"] for r in res.json()]
        self.assertIn("sales_summary", report_ids)
        self.assertIn("sales_by_product", report_ids)
        self.assertIn("stock_list", report_ids)
        self.assertIn("low_stock", report_ids)

    def test_sales_summary_report_and_database_totals_match(self):
        """Sales summary accurately computes gross sales, discounts, refunds, and net revenue."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/sales_summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        summary = data["summary"]
        self.assertEqual(summary["total_sales_count"], 2)
        # gross sales = 1000 + 1500 = 2500
        self.assertEqual(summary["gross_sales"], 2500.00)
        # discounts = 100
        self.assertEqual(summary["total_discounts"], 100.00)
        # refunds = 500
        self.assertEqual(summary["total_refunds"], 500.00)
        # net revenue = 2500 - 100 - 500 = 1900.00
        self.assertEqual(summary["net_revenue"], 1900.00)
        # total collected = 900 + 500 = 1400.00
        self.assertEqual(summary["total_collected"], 1400.00)
        # udhaar = 1000.00
        self.assertEqual(summary["total_udhaar_outstanding"], 1000.00)

        # Payment methods breakdown
        methods = data["payment_methods_breakdown"]
        self.assertEqual(methods["cash"]["count"], 1)
        self.assertEqual(methods["cash"]["amount"], 900.00)
        self.assertEqual(methods["credit"]["count"], 1)
        self.assertEqual(methods["credit"]["amount"], 1500.00)

    def test_csv_export_streaming_and_injection_sanitization(self):
        """CSV export streams response and sanitizes formula injection."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/sales_by_product/?format=csv")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "text/csv; charset=utf-8")
        self.assertTrue(res.streaming)

        content = b"".join(res.streaming_content).decode("utf-8")
        self.assertIn("SKU,Product Name,Category", content)

        # Check product2 SKU was sanitized with single quote
        self.assertIn("USB-C Hub", content)
        # In product2 SKU "=CMD|' /C calc'!A0", the leading '=' must be escaped
        self.assertIn("'=CMD", content)

    def test_excel_export_openpyxl(self):
        """Excel export returns valid .xlsx content."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/stock_list/?format=xlsx")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", res["Content-Type"])
        self.assertTrue(res.content.startswith(b"PK"))  # Zip header for xlsx

    def test_pdf_export_reportlab(self):
        """PDF export returns valid PDF starting with %PDF-."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/sales_summary/?format=pdf")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertTrue(res.content.startswith(b"%PDF-"))

    def test_sales_by_product_report(self):
        """Product sales report aggregates quantities, returns and revenues."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/sales_by_product/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        rows = data["rows"]
        # Product 1 has 2 sold, 1 returned -> net 1
        prod1_row = next(r for r in rows if r["sku"] == "PROD-001")
        self.assertEqual(prod1_row["units_sold"], 2)
        self.assertEqual(prod1_row["units_returned"], 1)
        self.assertEqual(prod1_row["net_units"], 1)
        self.assertEqual(prod1_row["gross_revenue"], 1000.00)
        self.assertEqual(prod1_row["refunded_amount"], 500.00)
        self.assertEqual(prod1_row["net_revenue"], 500.00)

    def test_low_stock_report(self):
        """Low stock report only lists items below reorder level."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/reports/low_stock/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        rows = data["rows"]
        # product2 has quantity 3, reorder_level 10 -> deficit 7
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["product_name"], "USB-C Hub")
        self.assertEqual(rows[0]["current_stock"], 3)
        self.assertEqual(rows[0]["reorder_level"], 10)
        self.assertEqual(rows[0]["shortfall"], 7)

    def test_warehouse_scoping_for_manager(self):
        """Warehouse manager can only access their warehouse; other warehouse returns 403."""
        self.client.force_authenticate(user=self.manager1)

        # Default query is scoped to manager's warehouse (warehouse1)
        res = self.client.get("/api/v1/reports/stock_list/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json()["rows"]
        for r in rows:
            self.assertEqual(r["warehouse"], self.warehouse1.code)

        # Trying to request warehouse2 raises 403
        res2 = self.client.get(f"/api/v1/reports/stock_list/?warehouse={self.warehouse2.id}")
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_asia_kolkata_date_boundaries(self):
        """Date boundaries are parsed using Asia/Kolkata timezone."""
        self.client.force_authenticate(user=self.admin)
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        today_str = datetime.now(tz).strftime("%Y-%m-%d")

        # Future date range has 0 sales
        res = self.client.get(f"/api/v1/reports/sales_summary/?date_from=2030-01-01&date_to=2030-01-02")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["summary"]["total_sales_count"], 0)
        self.assertEqual(len(res.json()["rows"]), 0)
