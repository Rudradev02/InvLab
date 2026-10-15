from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.exceptions import DomainError
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from customers.models import Customer, Payment
from customers.services import record_customer_payment
from inventory.services import get_or_create_locked_stock_level
from sales.models import Sale
from sales.services import create_sale
from warehouses.models import Warehouse

User = get_user_model()


class CustomerAndCreditTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.wh = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.category = Category.objects.create(name="Groceries")
        self.p1 = Product.objects.create(
            sku="RICE-01", name="Basmati Rice 1kg", price=Decimal("100.00"), category=self.category
        )
        self.p2 = Product.objects.create(
            sku="OIL-01", name="Sunflower Oil 1L", price=Decimal("150.00"), category=self.category
        )

        s1 = get_or_create_locked_stock_level(self.wh.id, self.p1.id)
        s1.quantity = 200
        s1.save()

        s2 = get_or_create_locked_stock_level(self.wh.id, self.p2.id)
        s2.quantity = 200
        s2.save()

        self.staff = User.objects.create_user(username="staff1", password="password123")
        self.staff.groups.add(self.staff_group)
        p, _ = UserProfile.objects.get_or_create(user=self.staff)
        p.warehouse = self.wh
        p.save()
        self.staff = User.objects.get(id=self.staff.id)

        self.manager = User.objects.create_user(username="manager1", password="password123")
        self.manager.groups.add(self.manager_group)
        pm, _ = UserProfile.objects.get_or_create(user=self.manager)
        pm.warehouse = self.wh
        pm.save()
        self.manager = User.objects.get(id=self.manager.id)

        self.client = APIClient()

    def test_customer_creation_and_duplicate_phone_rejected(self):
        self.client.force_authenticate(user=self.staff)

        # Create customer
        res = self.client.post(
            "/api/v1/customers/",
            {
                "name": "Rajesh Sharma",
                "phone": "9876543210",
                "email": "rajesh@example.com",
                "address": "Baner, Pune",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Rajesh Sharma")
        self.assertEqual(res.data["total_balance_due"], "0.00")

        # Duplicate phone rejected
        dup_res = self.client.post(
            "/api/v1/customers/",
            {"name": "Rajesh Clone", "phone": "9876543210"},
        )
        self.assertEqual(dup_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_walk_in_credit_sale_rejected(self):
        # Trying to record a credit sale (amount_paid < total) without customer must fail
        with self.assertRaises(DomainError) as ctx:
            create_sale(
                warehouse_id=self.wh.id,
                lines_data=[{"product_id": self.p1.id, "quantity": 5}],  # ₹500
                user=self.staff,
                amount_paid=Decimal("200.00"),  # leaves 300 balance
                customer_id=None,
            )
        self.assertEqual(ctx.exception.code, "customer_required_for_credit")

    def test_customer_credit_sale_and_balance_tracking(self):
        customer = Customer.objects.create(name="Amit Patel", phone="9988776655")

        # 5 units @ 100 = 500 total. Customer pays 300 now, leaves 200 on credit.
        sale = create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p1.id, "quantity": 5}],
            user=self.staff,
            customer_id=customer.id,
            amount_paid=Decimal("300.00"),
        )

        self.assertEqual(sale.total_amount, Decimal("500.00"))
        self.assertEqual(sale.amount_paid, Decimal("300.00"))
        self.assertEqual(sale.balance_due, Decimal("200.00"))
        self.assertEqual(sale.customer, customer)

        # Customer API reflects balance
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/v1/customers/{customer.id}/")
        self.assertEqual(res.data["total_balance_due"], "200.00")
        self.assertEqual(res.data["lifetime_value"], "500.00")

    def test_payment_applies_to_oldest_unpaid_sale_first(self):
        customer = Customer.objects.create(name="Sunil Verma", phone="9123456780")

        # Sale 1: ₹500 total, paid ₹200, balance = ₹300
        sale1 = create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p1.id, "quantity": 5}],
            user=self.staff,
            customer_id=customer.id,
            amount_paid=Decimal("200.00"),
        )

        # Sale 2: ₹300 total, paid ₹100, balance = ₹200
        sale2 = create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p2.id, "quantity": 2}],
            user=self.staff,
            customer_id=customer.id,
            amount_paid=Decimal("100.00"),
        )

        # Total customer balance = ₹300 + ₹200 = ₹500
        self.assertEqual(sale1.balance_due, Decimal("300.00"))
        self.assertEqual(sale2.balance_due, Decimal("200.00"))

        # Customer pays ₹400
        # FIFO allocation: ₹300 clears Sale 1 completely, remaining ₹100 reduces Sale 2 balance to ₹100
        payment = record_customer_payment(
            customer_id=customer.id,
            amount=Decimal("400.00"),
            warehouse_id=self.wh.id,
            user=self.staff,
            payment_method="upi",
            notes="Google Pay payment",
        )

        self.assertTrue(payment.payment_number.startswith("PAY-PUN01-"))

        sale1.refresh_from_db()
        sale2.refresh_from_db()

        self.assertEqual(sale1.amount_paid, Decimal("500.00"))
        self.assertEqual(sale1.balance_due, Decimal("0.00"))

        self.assertEqual(sale2.amount_paid, Decimal("200.00"))
        self.assertEqual(sale2.balance_due, Decimal("100.00"))

        # Verify customer's remaining balance is exactly 100
        self.client.force_authenticate(user=self.staff)
        res = self.client.get(f"/api/v1/customers/{customer.id}/")
        self.assertEqual(res.data["total_balance_due"], "100.00")

    def test_overpayment_rejected(self):
        customer = Customer.objects.create(name="Anita Roy", phone="9898989898")
        create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p1.id, "quantity": 2}],  # 200
            user=self.staff,
            customer_id=customer.id,
            amount_paid=Decimal("50.00"),  # leaves 150 balance
        )

        # Attempt to pay 200 when balance is 150
        with self.assertRaises(DomainError) as ctx:
            record_customer_payment(
                customer_id=customer.id,
                amount=Decimal("200.00"),
                warehouse_id=self.wh.id,
                user=self.staff,
            )
        self.assertEqual(ctx.exception.code, "overpayment")

    def test_customer_with_sales_cannot_be_deleted(self):
        customer = Customer.objects.create(name="Deepak Joshi", phone="9777888999")
        create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p1.id, "quantity": 1}],
            user=self.staff,
            customer_id=customer.id,
            amount_paid=Decimal("100.00"),
        )

        self.client.force_authenticate(user=self.manager)
        del_res = self.client.delete(f"/api/v1/customers/{customer.id}/")
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)

        # Deactivation works
        patch_res = self.client.patch(f"/api/v1/customers/{customer.id}/", {"is_active": False})
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        customer.refresh_from_db()
        self.assertFalse(customer.is_active)

    def test_receivables_total_endpoint(self):
        c1 = Customer.objects.create(name="Client A", phone="9111111111")
        c2 = Customer.objects.create(name="Client B", phone="9222222222")

        create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p1.id, "quantity": 3}],  # 300
            user=self.staff,
            customer_id=c1.id,
            amount_paid=Decimal("100.00"),  # balance 200
        )
        create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.p2.id, "quantity": 2}],  # 300
            user=self.staff,
            customer_id=c2.id,
            amount_paid=Decimal("150.00"),  # balance 150
        )

        self.client.force_authenticate(user=self.manager)
        res = self.client.get("/api/v1/customers/receivables/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Total receivables: 200 + 150 = 350
        self.assertEqual(res.data["total_receivables"], "350.00")
