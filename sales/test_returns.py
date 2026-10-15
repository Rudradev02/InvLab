from decimal import Decimal
import threading
import unittest

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase, TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.exceptions import DomainError
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from inventory.services import get_or_create_locked_stock_level
from sales.models import Sale, SaleLine, SaleReturn, SaleReturnLine
from sales.services import create_sale, process_sale_return
from warehouses.models import Warehouse

User = get_user_model()


class SaleReturnServiceTests(TestCase):
    def setUp(self):
        self.wh = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.category = Category.objects.create(name="Stationery")
        self.p1 = Product.objects.create(
            sku="PEN-BLU",
            name="Blue Gel Pen",
            price=Decimal("20.00"),
            category=self.category,
            default_reorder_level=10,
        )
        self.p2 = Product.objects.create(
            sku="NTB-A4",
            name="A4 Notebook",
            price=Decimal("80.00"),
            category=self.category,
            default_reorder_level=5,
        )

        # Initial stock at warehouse
        s1 = get_or_create_locked_stock_level(self.wh.id, self.p1.id)
        s1.quantity = 100
        s1.save()

        s2 = get_or_create_locked_stock_level(self.wh.id, self.p2.id)
        s2.quantity = 50
        s2.save()

        self.user = User.objects.create_user(username="cashier", password="password123")
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.warehouse = self.wh
        profile.save()

        # Create a sale: 10 pens (₹200) and 5 notebooks (₹400) = ₹600
        self.sale = create_sale(
            warehouse_id=self.wh.id,
            lines_data=[
                {"product_id": self.p1.id, "quantity": 10},
                {"product_id": self.p2.id, "quantity": 5},
            ],
            user=self.user,
        )

    def test_process_full_return(self):
        # Stock after sale: pens 90, notebooks 45
        s1 = StockLevel.objects.get(warehouse=self.wh, product=self.p1)
        s2 = StockLevel.objects.get(warehouse=self.wh, product=self.p2)
        self.assertEqual(s1.quantity, 90)
        self.assertEqual(s2.quantity, 45)

        line_pen = self.sale.lines.get(product=self.p1)
        line_ntb = self.sale.lines.get(product=self.p2)

        # Process full return
        sale_return = process_sale_return(
            sale_id=self.sale.id,
            items_data=[
                {"sale_line_id": line_pen.id, "quantity": 10},
                {"sale_line_id": line_ntb.id, "quantity": 5},
            ],
            user=self.user,
            reason="Customer cancelled order",
            refund_method="cash",
        )

        self.assertEqual(sale_return.total_refund_amount, Decimal("600.00"))
        self.assertTrue(sale_return.return_number.startswith("RET-PUN01-"))

        # Original sale is never modified (BR)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.total_amount, Decimal("600.00"))

        # Stock restored to original quantities
        s1.refresh_from_db()
        s2.refresh_from_db()
        self.assertEqual(s1.quantity, 100)
        self.assertEqual(s2.quantity, 50)

        # Check StockMovements
        pen_return_mov = StockMovement.objects.filter(
            warehouse=self.wh, product=self.p1, movement_type="return"
        ).first()
        self.assertIsNotNone(pen_return_mov)
        self.assertEqual(pen_return_mov.delta, 10)
        self.assertEqual(pen_return_mov.balance_after, 100)

    def test_process_partial_return(self):
        line_pen = self.sale.lines.get(product=self.p1)

        # Return 4 pens out of 10
        ret1 = process_sale_return(
            sale_id=self.sale.id,
            items_data=[{"sale_line_id": line_pen.id, "quantity": 4}],
            user=self.user,
            reason="Damaged tips",
        )
        self.assertEqual(ret1.total_refund_amount, Decimal("80.00"))

        s1 = StockLevel.objects.get(warehouse=self.wh, product=self.p1)
        self.assertEqual(s1.quantity, 94)

        # Return another 3 pens
        ret2 = process_sale_return(
            sale_id=self.sale.id,
            items_data=[{"sale_line_id": line_pen.id, "quantity": 3}],
            user=self.user,
            reason="Excess items",
        )
        self.assertEqual(ret2.total_refund_amount, Decimal("60.00"))

        s1.refresh_from_db()
        self.assertEqual(s1.quantity, 97)

    def test_over_returning_rejected(self):
        line_pen = self.sale.lines.get(product=self.p1)

        # 1. Attempt to return 11 when 10 were sold
        with self.assertRaises(DomainError) as ctx:
            process_sale_return(
                sale_id=self.sale.id,
                items_data=[{"sale_line_id": line_pen.id, "quantity": 11}],
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "over_returning")

        # 2. Return 8 successfully
        process_sale_return(
            sale_id=self.sale.id,
            items_data=[{"sale_line_id": line_pen.id, "quantity": 8}],
            user=self.user,
        )

        # 3. Attempt to return 3 more when only 2 are returnable
        with self.assertRaises(DomainError) as ctx:
            process_sale_return(
                sale_id=self.sale.id,
                items_data=[{"sale_line_id": line_pen.id, "quantity": 3}],
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "over_returning")


class SaleReturnApiTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.wh1 = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.wh2 = Warehouse.objects.create(name="Warehouse Nagpur", code="NAG01", city="Nagpur")

        self.category = Category.objects.create(name="Stationery")
        self.product = Product.objects.create(
            sku="MRK-01",
            name="Whiteboard Marker",
            price=Decimal("40.00"),
            category=self.category,
            default_reorder_level=5,
        )

        # Stock
        s1 = get_or_create_locked_stock_level(self.wh1.id, self.product.id)
        s1.quantity = 50
        s1.save()

        # Users
        self.admin = User.objects.create_superuser(username="admin", password="password123")
        self.admin.groups.add(self.admin_group)

        self.mgr1 = User.objects.create_user(username="mgr_pune", password="password123")
        self.mgr1.groups.add(self.manager_group)
        p1, _ = UserProfile.objects.get_or_create(user=self.mgr1)
        p1.warehouse = self.wh1
        p1.save()

        self.mgr2 = User.objects.create_user(username="mgr_nagpur", password="password123")
        self.mgr2.groups.add(self.manager_group)
        p2, _ = UserProfile.objects.get_or_create(user=self.mgr2)
        p2.warehouse = self.wh2
        p2.save()

        self.staff = User.objects.create_user(username="staff_pune", password="password123")
        self.staff.groups.add(self.staff_group)
        ps, _ = UserProfile.objects.get_or_create(user=self.staff)
        ps.warehouse = self.wh1
        ps.save()

        self.mgr1 = User.objects.get(id=self.mgr1.id)
        self.mgr2 = User.objects.get(id=self.mgr2.id)
        self.staff = User.objects.get(id=self.staff.id)

        self.sale = create_sale(
            warehouse_id=self.wh1.id,
            lines_data=[{"product_id": self.product.id, "quantity": 5}],
            user=self.staff,
        )

        self.client = APIClient()

    def test_staff_cannot_process_returns(self):
        self.client.force_authenticate(user=self.staff)
        line = self.sale.lines.first()
        res = self.client.post(
            f"/api/v1/sales/{self.sale.id}/return_items/",
            {"lines": [{"sale_line_id": line.id, "quantity": 1}], "reason": "Customer request"},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_warehouse_manager_cannot_process_returns(self):
        # Manager 2 from Nagpur cannot return sale from Pune (scoped out)
        self.client.force_authenticate(user=self.mgr2)
        line = self.sale.lines.first()
        res = self.client.post(
            f"/api/v1/sales/{self.sale.id}/return_items/",
            {"lines": [{"sale_line_id": line.id, "quantity": 1}], "reason": "Wrong item"},
            format="json",
        )
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_manager_can_process_returns_and_view_returnable_quantity(self):
        self.client.force_authenticate(user=self.mgr1)
        line = self.sale.lines.first()

        # Check sale detail has returnable_quantity
        res = self.client.get(f"/api/v1/sales/{self.sale.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        line_data = res.data["lines"][0]
        self.assertEqual(line_data["returnable_quantity"], 5)
        self.assertEqual(line_data["returned_quantity"], 0)
        self.assertEqual(res.data["return_status"], "not_returned")

        # Process return of 2 units
        ret_res = self.client.post(
            f"/api/v1/sales/{self.sale.id}/return_items/",
            {
                "lines": [{"sale_line_id": line.id, "quantity": 2}],
                "reason": "Defective piece",
                "refund_method": "cash",
            },
            format="json",
        )
        self.assertEqual(ret_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ret_res.data["total_refund_amount"], "80.00")

        # Re-fetch sale detail: returnable is now 3, status is partially_returned
        res = self.client.get(f"/api/v1/sales/{self.sale.id}/")
        self.assertEqual(res.data["lines"][0]["returnable_quantity"], 3)
        self.assertEqual(res.data["lines"][0]["returned_quantity"], 2)
        self.assertEqual(res.data["total_refunded"], "80.00")
        self.assertEqual(res.data["net_total"], "120.00")
        self.assertEqual(res.data["return_status"], "partially_returned")


class SaleReturnConcurrencyTests(TransactionTestCase):
    def setUp(self):
        if connection.vendor == "sqlite":
            raise unittest.SkipTest(
                "Concurrency tests require PostgreSQL (row-level locking with threads is not supported on SQLite)"
            )

        self.wh = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.category = Category.objects.create(name="Components")
        self.product = Product.objects.create(
            sku="CBL-001", name="HDMI Cable", price=Decimal("300.00"), category=self.category
        )

        stock = get_or_create_locked_stock_level(self.wh.id, self.product.id)
        stock.quantity = 50
        stock.save()

        self.user = User.objects.create_user(username="conc_user", password="password123")
        self.sale = create_sale(
            warehouse_id=self.wh.id,
            lines_data=[{"product_id": self.product.id, "quantity": 4}],
            user=self.user,
        )

    def tearDown(self):
        connection.close()

    def test_simultaneous_returns_prevent_over_returning(self):
        line = self.sale.lines.first()
        successes = []
        failures = []

        def return_item(qty):
            try:
                process_sale_return(
                    sale_id=self.sale.id,
                    items_data=[{"sale_line_id": line.id, "quantity": qty}],
                    user=self.user,
                )
                successes.append(qty)
            except Exception as e:
                failures.append(e)

        # Both try to return 3 units when only 4 are sold in total
        t1 = threading.Thread(target=return_item, args=(3,))
        t2 = threading.Thread(target=return_item, args=(3,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one must succeed and one must fail
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(failures), 1)
