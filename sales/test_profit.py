from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel
from sales.models import Sale, SaleLine
from sales.services import create_sale, process_sale_return
from warehouses.models import Warehouse
from reports.registry import registry

User = get_user_model()


class ProfitTrackingTestCase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Electronics")
        self.warehouse1 = Warehouse.objects.create(name="North Hub", code="WH-N", is_active=True)
        self.warehouse2 = Warehouse.objects.create(name="South Hub", code="WH-S", is_active=True)

        self.admin = User.objects.create_superuser("admin_usr", "admin@test.com", "pass123")
        self.admin.profile.role = ROLE_ADMIN
        self.admin.profile.save()

        self.manager = User.objects.create_user("mgr_usr", "mgr@test.com", "pass123")
        self.manager.profile.role = ROLE_MANAGER
        self.manager.profile.warehouse = self.warehouse1
        self.manager.profile.save()

        # Product with cost_price
        self.product_with_cost = Product.objects.create(
            sku="PHONE-001",
            name="Smart Phone",
            category=self.category,
            price=Decimal("1000.00"),
            cost_price=Decimal("700.00"),
        )
        StockLevel.objects.create(warehouse=self.warehouse1, product=self.product_with_cost, quantity=50)

        # Product without cost_price (0 or None)
        self.product_no_cost = Product.objects.create(
            sku="CABLE-001",
            name="USB Cable",
            category=self.category,
            price=Decimal("100.00"),
            cost_price=Decimal("0.00"),
        )
        StockLevel.objects.create(warehouse=self.warehouse1, product=self.product_no_cost, quantity=100)

        self.client = APIClient()

    def test_unit_cost_snapshot_copied_on_sale(self):
        sale = create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[
                {"product_id": self.product_with_cost.id, "quantity": 2},
                {"product_id": self.product_no_cost.id, "quantity": 3},
            ],
            user=self.manager,
        )

        line_with_cost = sale.lines.get(product=self.product_with_cost)
        line_no_cost = sale.lines.get(product=self.product_no_cost)

        # Snapshot copied
        self.assertEqual(line_with_cost.unit_cost, Decimal("700.00"))
        # Missing/zero cost stored as None (never treated as 0)
        self.assertIsNone(line_no_cost.unit_cost)

    def test_later_cost_change_does_not_alter_past_sales(self):
        sale = create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[{"product_id": self.product_with_cost.id, "quantity": 1}],
            user=self.manager,
        )
        past_line = sale.lines.get(product=self.product_with_cost)
        self.assertEqual(past_line.unit_cost, Decimal("700.00"))

        # Update product cost_price later
        self.product_with_cost.cost_price = Decimal("850.00")
        self.product_with_cost.save()

        # Past sale line unchanged
        past_line.refresh_from_db()
        self.assertEqual(past_line.unit_cost, Decimal("700.00"))

    def test_discount_reduces_profit_proportionally(self):
        # 10% discount on 1 unit of phone (price=1000, cost=700)
        # sale total = 900. Gross profit = 900 - 700 = 200. Margin = 200 / 900 = 22.22%
        sale = create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[{"product_id": self.product_with_cost.id, "quantity": 1}],
            discount_type="percent",
            discount_value=Decimal("10.00"),
            user=self.manager,
        )
        self.assertEqual(sale.total_amount, Decimal("900.00"))

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/dashboard/?warehouse={self.warehouse1.id}")
        self.assertEqual(res.status_code, 200)
        kpis = res.data["kpis"]
        self.assertEqual(Decimal(kpis["gross_profit"]), Decimal("200.00"))
        self.assertEqual(Decimal(kpis["total_revenue"]), Decimal("900.00"))
        self.assertEqual(kpis["profit_margin_pct"], 22.22)

    def test_returns_reduce_profit(self):
        sale = create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[{"product_id": self.product_with_cost.id, "quantity": 2}], # 2 x 1000 = 2000, cost = 1400, profit = 600
            user=self.manager,
        )
        line = sale.lines.get(product=self.product_with_cost)

        # Return 1 unit
        process_sale_return(
            sale_id=sale.id,
            items_data=[{"sale_line_id": line.id, "quantity": 1}],
            reason="Customer return",
            refund_method="cash",
            user=self.manager,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/dashboard/?warehouse={self.warehouse1.id}")
        self.assertEqual(res.status_code, 200)
        kpis = res.data["kpis"]
        # Net units = 1. Net revenue = 1000. Net cost = 700. Net profit = 300.
        self.assertEqual(Decimal(kpis["gross_profit"]), Decimal("300.00"))
        self.assertEqual(Decimal(kpis["total_revenue"]), Decimal("1000.00"))
        self.assertEqual(kpis["profit_margin_pct"], 30.0)

    def test_dashboard_endpoint_scoping_and_unknown_cost(self):
        # Sale in WH1: 1 phone (cost=700, price=1000) and 1 cable (cost=None, price=100)
        create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[
                {"product_id": self.product_with_cost.id, "quantity": 1},
                {"product_id": self.product_no_cost.id, "quantity": 1},
            ],
            user=self.manager,
        )

        # Authenticate as Manager (scoped to WH1)
        self.client.force_authenticate(user=self.manager)
        res = self.client.get("/api/v1/dashboard/?range=7d")
        self.assertEqual(res.status_code, 200)
        data = res.data
        self.assertEqual(data["range"], "7d")
        self.assertEqual(data["warehouse_id"], self.warehouse1.id)
        self.assertEqual(data["kpis"]["unknown_cost_count"], 1) # cable has unknown cost
        self.assertEqual(Decimal(data["kpis"]["gross_profit"]), Decimal("300.00")) # only phone counted
        self.assertGreater(len(data["daily_chart"]), 0)

    def test_profit_report_generation(self):
        create_sale(
            warehouse_id=self.warehouse1.id,
            lines_data=[{"product_id": self.product_with_cost.id, "quantity": 2}],
            user=self.manager,
        )

        report = registry.get("profit_margin")
        self.assertIsNotNone(report)

        report_data = report.generate(
            user=self.admin,
            filters={"warehouse": self.warehouse1.id, "date_from": None, "date_to": None},
        )
        self.assertEqual(report_data["report_id"], "profit_margin")
        self.assertEqual(report_data["summary"]["total_lines"], 1)
        self.assertEqual(report_data["summary"]["total_gross_profit"], 600.0)
        self.assertEqual(report_data["summary"]["overall_margin_pct"], 30.0)
