from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import Category, Product
from core.models import BusinessSettings
from core.num_to_words import amount_to_words_inr, number_to_words_inr
from core.permissions import ROLE_ADMIN, ROLE_STAFF, ROLE_WAREHOUSE_MANAGER
from customers.models import Customer
from inventory.models import StockLevel
from sales.invoice_pdf import generate_invoice_pdf
from sales.models import InvoiceSequence, Sale, SaleLine
from sales.services import create_sale
from warehouses.models import Warehouse

User = get_user_model()


class GSTInvoiceTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_WAREHOUSE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.admin = User.objects.create_user(username="admin_gst", password="password123")
        self.admin.groups.add(self.admin_group)

        self.staff = User.objects.create_user(username="staff_gst", password="password123")
        self.staff.groups.add(self.staff_group)

        self.warehouse = Warehouse.objects.create(name="Pune Depot", code="PUN", is_active=True)
        self.staff.profile.warehouse = self.warehouse
        self.staff.profile.save()

        # Business Settings
        self.settings = BusinessSettings.get_settings()
        self.settings.name = "InvLab Solutions"
        self.settings.state = "Maharashtra"
        self.settings.gstin = "27AABCU9603R1ZM"
        self.settings.invoice_prefix = ""
        self.settings.prices_include_tax = False
        self.settings.save()

        self.category = Category.objects.create(name="Electronics")
        self.product = Product.objects.create(
            name="Wireless Mouse",
            sku="WM-001",
            category=self.category,
            price=Decimal("1000.00"),
            cost_price=Decimal("600.00"),
            gst_rate=Decimal("18.00"),
            hsn_code="8471",
            stock=100,
            is_active=True,
        )
        StockLevel.objects.create(warehouse=self.warehouse, product=self.product, quantity=100)

        self.customer = Customer.objects.create(
            name="Retail Buyer",
            phone="9876543210",
            gstin="27AAAPL1234C1ZV",
            address="Shivajinagar, Pune, MH",
            is_active=True,
        )

        self.client = APIClient()

    def test_amount_to_words_indian_format(self):
        """Test Indian numbering formatting in words (Lakh, Crore, Paise)."""
        self.assertEqual(number_to_words_inr(0), "Zero")
        self.assertEqual(number_to_words_inr(100), "One Hundred")
        self.assertEqual(number_to_words_inr(100000), "One Lakh")
        self.assertEqual(number_to_words_inr(10500000), "One Crore Five Lakh")
        self.assertEqual(
            amount_to_words_inr(Decimal("125000.50")),
            "One Lakh Twenty Five Thousand Rupees and Fifty Paise Only",
        )
        self.assertEqual(
            amount_to_words_inr(Decimal("1.00")),
            "One Rupee Only",
        )

    def test_invoice_sequence_financial_year(self):
        """Test April-March financial year calculation and invoice number format."""
        import datetime
        # April 2026 -> 2026-27
        dt1 = datetime.datetime(2026, 4, 1, 10, 0, 0, tzinfo=datetime.timezone.utc)
        self.assertEqual(InvoiceSequence.get_financial_year(dt1), "2026-27")

        # March 2027 -> 2026-27
        dt2 = datetime.datetime(2027, 3, 31, 23, 59, 59, tzinfo=datetime.timezone.utc)
        self.assertEqual(InvoiceSequence.get_financial_year(dt2), "2026-27")

        # April 2027 -> 2027-28
        dt3 = datetime.datetime(2027, 4, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        self.assertEqual(InvoiceSequence.get_financial_year(dt3), "2027-28")

        # Sequential numbering
        num1 = InvoiceSequence.get_next_invoice_number(self.warehouse, dt=dt1)
        self.assertEqual(num1, "PUN/2026-27/000001")
        num2 = InvoiceSequence.get_next_invoice_number(self.warehouse, dt=dt1)
        self.assertEqual(num2, "PUN/2026-27/000002")

        # With prefix
        num_prefix = InvoiceSequence.get_next_invoice_number(self.warehouse, prefix="INV", dt=dt1)
        self.assertEqual(num_prefix, "INV/PUN/2026-27/000003")

    def test_exclusive_tax_intrastate_sale(self):
        """Exclusive pricing intra-state: CGST 9% + SGST 9% on 1000 = 90 + 90, total = 1180."""
        self.settings.prices_include_tax = False
        self.settings.save()

        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product.id, "quantity": 1}],
            user=self.staff,
            customer_id=self.customer.id,
            place_of_supply="Maharashtra",
        )

        self.assertFalse(sale.is_interstate)
        self.assertEqual(sale.subtotal, Decimal("1000.00"))
        self.assertEqual(sale.taxable_amount, Decimal("1000.00"))
        self.assertEqual(sale.cgst_amount, Decimal("90.00"))
        self.assertEqual(sale.sgst_amount, Decimal("90.00"))
        self.assertEqual(sale.igst_amount, Decimal("0.00"))
        self.assertEqual(sale.total_tax_amount, Decimal("180.00"))
        self.assertEqual(sale.round_off_amount, Decimal("0.00"))
        self.assertEqual(sale.total_amount, Decimal("1180.00"))
        self.assertTrue(sale.invoice_number.startswith("PUN/"))

        line = sale.lines.first()
        self.assertEqual(line.gst_rate, Decimal("18.00"))
        self.assertEqual(line.hsn_code, "8471")
        self.assertEqual(line.taxable_amount, Decimal("1000.00"))
        self.assertEqual(line.cgst_amount, Decimal("90.00"))
        self.assertEqual(line.sgst_amount, Decimal("90.00"))

    def test_exclusive_tax_interstate_sale(self):
        """Exclusive pricing inter-state: IGST 18% on 1000 = 180, total = 1180."""
        self.settings.prices_include_tax = False
        self.settings.save()

        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product.id, "quantity": 1}],
            user=self.staff,
            customer_id=self.customer.id,
            place_of_supply="Karnataka",
        )

        self.assertTrue(sale.is_interstate)
        self.assertEqual(sale.taxable_amount, Decimal("1000.00"))
        self.assertEqual(sale.cgst_amount, Decimal("0.00"))
        self.assertEqual(sale.sgst_amount, Decimal("0.00"))
        self.assertEqual(sale.igst_amount, Decimal("180.00"))
        self.assertEqual(sale.total_tax_amount, Decimal("180.00"))
        self.assertEqual(sale.total_amount, Decimal("1180.00"))

    def test_inclusive_tax_sale(self):
        """Inclusive pricing: unit price 1180 includes 18% tax -> taxable = 1000, tax = 180."""
        self.settings.prices_include_tax = True
        self.settings.save()

        p_inclusive = Product.objects.create(
            name="Keyboard",
            sku="KB-001",
            category=self.category,
            price=Decimal("1180.00"),
            gst_rate=Decimal("18.00"),
            hsn_code="8471",
            stock=50,
            is_active=True,
        )
        StockLevel.objects.create(warehouse=self.warehouse, product=p_inclusive, quantity=50)

        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": p_inclusive.id, "quantity": 1}],
            user=self.staff,
            place_of_supply="Maharashtra",
        )

        self.assertEqual(sale.subtotal, Decimal("1180.00"))
        self.assertEqual(sale.taxable_amount, Decimal("1000.00"))
        self.assertEqual(sale.cgst_amount, Decimal("90.00"))
        self.assertEqual(sale.sgst_amount, Decimal("90.00"))
        self.assertEqual(sale.total_tax_amount, Decimal("180.00"))
        self.assertEqual(sale.total_amount, Decimal("1180.00"))

    def test_discount_before_tax_and_round_off(self):
        """Discount applied before tax; round off to nearest rupee."""
        self.settings.prices_include_tax = False
        self.settings.save()

        # Item: price 333.33, 18% GST
        p_odd = Product.objects.create(
            name="Odd Item",
            sku="ODD-1",
            category=self.category,
            price=Decimal("333.33"),
            gst_rate=Decimal("18.00"),
            stock=10,
            is_active=True,
        )
        StockLevel.objects.create(warehouse=self.warehouse, product=p_odd, quantity=10)

        # 10% discount on 333.33 -> discount = 33.33, taxable = 300.00
        # 18% GST on 300.00 = 54.00. Total = 354.00, round-off = 0.00
        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": p_odd.id, "quantity": 1}],
            user=self.staff,
            discount_type="percent",
            discount_value=Decimal("10.00"),
            place_of_supply="Maharashtra",
        )

        self.assertEqual(sale.taxable_amount, Decimal("300.00"))
        self.assertEqual(sale.cgst_amount, Decimal("27.00"))
        self.assertEqual(sale.sgst_amount, Decimal("27.00"))
        self.assertEqual(sale.total_tax_amount, Decimal("54.00"))
        self.assertEqual(sale.total_amount, Decimal("354.00"))

    def test_business_settings_api(self):
        """Staff can GET settings; only Admin can PUT settings."""
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/business-settings/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["name"], "InvLab Solutions")

        # Staff cannot update
        res_put = self.client.put("/api/v1/business-settings/", {"name": "Hacked Name"})
        self.assertEqual(res_put.status_code, 403)

        # Admin can update
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.put(
            "/api/v1/business-settings/",
            {"name": "InvLab Enterprise Hub", "invoice_prefix": "INV"},
        )
        self.assertEqual(res_admin.status_code, 200)
        self.assertEqual(res_admin.data["name"], "InvLab Enterprise Hub")
        self.assertEqual(res_admin.data["invoice_prefix"], "INV")

    def test_invoice_json_and_pdf_endpoints(self):
        """Invoice JSON endpoint returns HSN summary, words; PDF returns valid application/pdf."""
        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product.id, "quantity": 2}],
            user=self.staff,
            customer_id=self.customer.id,
            place_of_supply="Maharashtra",
        )

        self.client.force_authenticate(user=self.staff)
        # JSON endpoint
        res = self.client.get(f"/api/v1/sales/{sale.id}/invoice/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["invoice_number"], sale.invoice_number)
        self.assertEqual(res.data["seller"]["gstin"], "27AABCU9603R1ZM")
        self.assertEqual(res.data["buyer"]["name"], "Retail Buyer")
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(len(res.data["hsn_summary"]), 1)
        self.assertIn("Rupees Only", res.data["financials"]["amount_in_words"])

        # PDF endpoint
        res_pdf = self.client.get(f"/api/v1/sales/{sale.id}/invoice/pdf/")
        self.assertEqual(res_pdf.status_code, 200)
        self.assertEqual(res_pdf["Content-Type"], "application/pdf")
        self.assertTrue(len(res_pdf.content) > 1000)
        self.assertTrue(res_pdf.content.startswith(b"%PDF"))

    def test_old_sale_without_tax_data(self):
        """Old sale where invoice_number and tax amounts are empty does not crash invoice view."""
        sale = Sale.objects.create(
            sale_number="SL-PUN-2025-00001",
            warehouse=self.warehouse,
            user=self.staff,
            subtotal=Decimal("500.00"),
            total_amount=Decimal("500.00"),
            amount_paid=Decimal("500.00"),
        )
        SaleLine.objects.create(
            sale=sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal("500.00"),
            subtotal=Decimal("500.00"),
        )

        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/v1/sales/{sale.id}/invoice/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["invoice_number"], "SL-PUN-2025-00001")

        # PDF generation should not crash
        pdf_bytes = generate_invoice_pdf(sale)
        self.assertTrue(len(pdf_bytes) > 500)
