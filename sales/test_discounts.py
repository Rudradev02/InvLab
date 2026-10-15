from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth.models import Group

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.exceptions import DomainError
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from customers.models import Customer
from inventory.models import StockLevel
from sales.models import Sale
from sales.services import create_sale
from warehouses.models import Warehouse

User = get_user_model()


class DiscountAndPaymentMethodTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.warehouse = Warehouse.objects.create(
            name="Discount Central Warehouse",
            code="DCW",
            address_line1="123 Discount St",
            city="Pune",
            state="Maharashtra",
            pincode="411001",
            phone="9876543210",
            email="dcw@example.com",
            is_active=True,
        )

        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.admin = User.objects.create_superuser(
            username="admin_user",
            password="Password123!",
            email="admin@example.com",
        )
        self.admin.groups.add(self.admin_group)
        UserProfile.objects.get_or_create(user=self.admin)

        self.manager = User.objects.create_user(
            username="mgr_user",
            password="Password123!",
            email="mgr@example.com",
        )
        self.manager.groups.add(self.manager_group)
        p_mgr, _ = UserProfile.objects.get_or_create(user=self.manager)
        p_mgr.warehouse = self.warehouse
        p_mgr.save()

        self.staff = User.objects.create_user(
            username="staff_user",
            password="Password123!",
            email="staff@example.com",
        )
        self.staff.groups.add(self.staff_group)
        p_staff, _ = UserProfile.objects.get_or_create(user=self.staff)
        p_staff.warehouse = self.warehouse
        p_staff.save()

        self.category = Category.objects.create(name="Electronics")
        self.product1 = Product.objects.create(
            name="Smartphone",
            sku="PHONE-001",
            category=self.category,
            price=Decimal("100.00"),
            is_active=True,
        )
        self.product2 = Product.objects.create(
            name="Charger",
            sku="CHG-002",
            category=self.category,
            price=Decimal("33.33"),
            is_active=True,
        )

        StockLevel.objects.create(
            warehouse=self.warehouse,
            product=self.product1,
            quantity=100,
            reorder_level=10,
        )
        StockLevel.objects.create(
            warehouse=self.warehouse,
            product=self.product2,
            quantity=100,
            reorder_level=10,
        )

        self.customer = Customer.objects.create(
            name="Discount Shopper",
            phone="9988776655",
            email="shopper@example.com",
            is_active=True,
        )

    def test_percent_discount_calculation_and_rounding(self):
        # 1 item @ 33.33, 15% discount -> 33.33 * 0.15 = 4.9995 -> 5.00 round half-up
        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product2.id, "quantity": 1}],
            user=self.admin,
            discount_type="percent",
            discount_value=Decimal("15.00"),
            payment_method="upi",
        )

        self.assertEqual(sale.subtotal, Decimal("33.33"))
        self.assertEqual(sale.discount_type, "percent")
        self.assertEqual(sale.discount_value, Decimal("15.00"))
        self.assertEqual(sale.discount_amount, Decimal("5.00"))
        self.assertEqual(sale.total_amount, Decimal("28.33"))
        self.assertEqual(sale.amount_paid, Decimal("28.33"))
        self.assertEqual(sale.balance_due, Decimal("0.00"))
        self.assertEqual(sale.payment_method, "upi")

    def test_flat_amount_discount(self):
        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product1.id, "quantity": 2}],
            user=self.manager,
            discount_type="amount",
            discount_value=Decimal("35.00"),
            payment_method="card",
        )

        self.assertEqual(sale.subtotal, Decimal("200.00"))
        self.assertEqual(sale.discount_type, "amount")
        self.assertEqual(sale.discount_value, Decimal("35.00"))
        self.assertEqual(sale.discount_amount, Decimal("35.00"))
        self.assertEqual(sale.total_amount, Decimal("165.00"))
        self.assertEqual(sale.amount_paid, Decimal("165.00"))
        self.assertEqual(sale.payment_method, "card")

    def test_discount_cannot_exceed_subtotal(self):
        with self.assertRaises(DomainError) as ctx:
            create_sale(
                warehouse_id=self.warehouse.id,
                lines_data=[{"product_id": self.product1.id, "quantity": 1}],
                user=self.admin,
                discount_type="amount",
                discount_value=Decimal("150.00"),
            )
        self.assertEqual(ctx.exception.code, "discount_exceeds_subtotal")

    def test_percent_cannot_exceed_100(self):
        with self.assertRaises(DomainError) as ctx:
            create_sale(
                warehouse_id=self.warehouse.id,
                lines_data=[{"product_id": self.product1.id, "quantity": 1}],
                user=self.admin,
                discount_type="percent",
                discount_value=Decimal("105.00"),
            )
        self.assertEqual(ctx.exception.code, "discount_exceeds_100")

    def test_staff_discount_limit_enforced(self):
        # Staff can discount up to 10%
        sale_ok = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product1.id, "quantity": 1}],
            user=self.staff,
            discount_type="percent",
            discount_value=Decimal("10.00"),
        )
        self.assertEqual(sale_ok.discount_amount, Decimal("10.00"))

        # Staff cannot discount > 10%
        with self.assertRaises(DomainError) as ctx:
            create_sale(
                warehouse_id=self.warehouse.id,
                lines_data=[{"product_id": self.product1.id, "quantity": 1}],
                user=self.staff,
                discount_type="percent",
                discount_value=Decimal("10.01"),
            )
        self.assertEqual(ctx.exception.code, "discount_limit_exceeded")

        # Manager can discount higher than 10%
        sale_mgr = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product1.id, "quantity": 1}],
            user=self.manager,
            discount_type="percent",
            discount_value=Decimal("25.00"),
        )
        self.assertEqual(sale_mgr.discount_amount, Decimal("25.00"))

    def test_credit_payment_method_requires_customer(self):
        with self.assertRaises(DomainError) as ctx:
            create_sale(
                warehouse_id=self.warehouse.id,
                lines_data=[{"product_id": self.product1.id, "quantity": 1}],
                user=self.admin,
                payment_method="credit",
                customer_id=None,
            )
        self.assertEqual(ctx.exception.code, "customer_required_for_credit")

        sale = create_sale(
            warehouse_id=self.warehouse.id,
            lines_data=[{"product_id": self.product1.id, "quantity": 1}],
            user=self.admin,
            payment_method="credit",
            customer_id=self.customer.id,
            amount_paid=Decimal("0.00"),
        )
        self.assertEqual(sale.payment_method, "credit")
        self.assertEqual(sale.balance_due, Decimal("100.00"))
        self.assertEqual(sale.amount_paid, Decimal("0.00"))

    def test_api_sale_creation_and_payment_method_filter(self):
        self.client.force_authenticate(user=self.admin)

        # Create sale with discount via API
        payload = {
            "warehouse_id": self.warehouse.id,
            "lines": [{"product_id": self.product1.id, "quantity": 2}],
            "discount_type": "percent",
            "discount_value": "10.00",
            "payment_method": "upi",
        }
        res = self.client.post("/api/v1/sales/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["subtotal"], "200.00")
        self.assertEqual(res.data["discount_type"], "percent")
        self.assertEqual(res.data["discount_amount"], "20.00")
        self.assertEqual(res.data["total_amount"], "180.00")
        self.assertEqual(res.data["payment_method"], "upi")

        # Filter by payment method
        res_upi = self.client.get("/api/v1/sales/?payment_method=upi")
        self.assertEqual(res_upi.status_code, status.HTTP_200_OK)
        results = res_upi.data.get("results", res_upi.data)
        self.assertTrue(all(s["payment_method"] == "upi" for s in results))

        res_card = self.client.get("/api/v1/sales/?payment_method=card")
        self.assertEqual(res_card.status_code, status.HTTP_200_OK)
        results_card = res_card.data.get("results", res_card.data)
        self.assertTrue(all(s["payment_method"] == "card" for s in results_card))
