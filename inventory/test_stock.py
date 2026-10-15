from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from inventory.services import adjust_stock, receive_stock
from sales.services import InsufficientStockError, create_sale
from warehouses.models import Warehouse

User = get_user_model()


class StockMovementLedgerTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.mgr_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Warehouses
        self.wh1 = Warehouse.objects.create(
            name="Alpha Warehouse",
            code="WH-ALPHA",
            city="Pune",
            state="Maharashtra",
            pincode="411057",
            phone="9823011221",
        )
        self.wh2 = Warehouse.objects.create(
            name="Beta Warehouse",
            code="WH-BETA",
            city="Mumbai",
            state="Maharashtra",
            pincode="421302",
            phone="9820044552",
        )

        # Users
        self.admin = User.objects.create_superuser(
            username="admin_ledger",
            email="admin_ledger@invlab.com",
            password="adminpassword123",
        )
        self.admin.groups.add(self.admin_group)

        self.manager = User.objects.create_user(
            username="mgr_alpha",
            email="mgr_alpha@invlab.com",
            password="mgrpassword123",
        )
        self.manager.groups.add(self.mgr_group)
        self.manager.profile.warehouse = self.wh1
        self.manager.profile.save()

        self.staff = User.objects.create_user(
            username="staff_alpha",
            email="staff_alpha@invlab.com",
            password="staffpassword123",
        )
        self.staff.groups.add(self.staff_group)
        self.staff.profile.warehouse = self.wh1
        self.staff.profile.save()

        # Product
        self.category, _ = Category.objects.get_or_create(name="Electronics")
        self.product = Product.objects.create(
            name="Test Smartphone X",
            sku="PHONE-X-001",
            category=self.category,
            price=Decimal("19999.00"),
        )

    def test_stock_movement_created_on_receive_and_adjust(self):
        # 1. Receive stock
        sl = receive_stock(
            warehouse_id=self.wh1.id,
            product_id=self.product.id,
            quantity=15,
            user=self.manager,
            reference="PO-1001",
        )
        self.assertEqual(sl.quantity, 15)

        m1 = StockMovement.objects.filter(stock_level=sl, movement_type="receive").first()
        self.assertIsNotNone(m1)
        self.assertEqual(m1.delta, 15)
        self.assertEqual(m1.balance_after, 15)
        self.assertEqual(m1.user, self.manager)
        self.assertEqual(m1.reference, "PO-1001")

        # 2. Adjust stock down
        sl = adjust_stock(
            warehouse_id=self.wh1.id,
            product_id=self.product.id,
            delta=-4,
            user=self.manager,
            reason="Damaged items",
        )
        self.assertEqual(sl.quantity, 11)

        m2 = StockMovement.objects.filter(stock_level=sl, movement_type="adjustment").first()
        self.assertIsNotNone(m2)
        self.assertEqual(m2.delta, -4)
        self.assertEqual(m2.balance_after, 11)
        self.assertEqual(m2.reason, "Damaged items")

    def test_rejected_sale_writes_no_movements(self):
        # Give 3 units of stock
        receive_stock(
            warehouse_id=self.wh1.id,
            product_id=self.product.id,
            quantity=3,
            user=self.manager,
            reference="Initial Batch",
        )
        initial_movements_count = StockMovement.objects.count()

        # Attempt to sell 10 units (insufficient stock)
        with self.assertRaises(InsufficientStockError):
            create_sale(
                warehouse_id=self.wh1.id,
                lines_data=[{"product_id": self.product.id, "quantity": 10}],
                user=self.staff,
            )

        # Confirm no extra movements were written
        self.assertEqual(StockMovement.objects.count(), initial_movements_count)
        sl = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(sl.quantity, 3)

    def test_stock_movement_is_immutable(self):
        sl = receive_stock(
            warehouse_id=self.wh1.id,
            product_id=self.product.id,
            quantity=10,
            user=self.manager,
        )
        m = StockMovement.objects.get(stock_level=sl)

        # Trying to update delta
        m.delta = 999
        with self.assertRaises(ValidationError):
            m.save()

        # Trying to delete
        with self.assertRaises(ValidationError):
            m.delete()

    def test_sum_of_movements_equals_current_stock(self):
        # Multiple operations
        sl = receive_stock(self.wh1.id, self.product.id, 20, self.manager, "PO-1")
        sl = adjust_stock(self.wh1.id, self.product.id, 5, self.manager, "Audit found extra")
        sl = adjust_stock(self.wh1.id, self.product.id, -3, self.manager, "Defect discarded")
        create_sale(
            warehouse_id=self.wh1.id,
            lines_data=[{"product_id": self.product.id, "quantity": 7}],
            user=self.staff,
        )

        sl.refresh_from_db()
        self.assertEqual(sl.quantity, 15)

        movements = StockMovement.objects.filter(stock_level=sl)
        ledger_sum = sum(m.delta for m in movements)
        self.assertEqual(ledger_sum, sl.quantity)

    def test_staff_cannot_access_ledger_endpoint(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/ledger/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_scoped_to_own_warehouse_ledger(self):
        # Create movements in wh1 and wh2
        receive_stock(self.wh1.id, self.product.id, 10, self.manager, "WH1 receive")
        p2 = Product.objects.create(name="Item 2", sku="ITEM-2", category=self.category, price=Decimal("100.00"))
        receive_stock(self.wh2.id, p2.id, 5, self.admin, "WH2 receive")

        self.client.force_authenticate(user=self.manager)
        res = self.client.get("/api/v1/ledger/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        self.assertTrue(len(results) > 0)
        for entry in results:
            self.assertEqual(entry["warehouse"], self.wh1.id)

    def test_admin_can_filter_and_access_product_history(self):
        receive_stock(self.wh1.id, self.product.id, 10, self.manager, "Receive 1")
        adjust_stock(self.wh1.id, self.product.id, -2, self.manager, "Adjust 1")

        self.client.force_authenticate(user=self.admin)

        # 1. Filter by product
        res = self.client.get(f"/api/v1/ledger/?product={self.product.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for m in res.data["results"]:
            self.assertEqual(m["product"], self.product.id)

        # 2. Filter by type
        res_adj = self.client.get("/api/v1/ledger/?type=adjustment")
        self.assertEqual(res_adj.status_code, status.HTTP_200_OK)
        for m in res_adj.data["results"]:
            self.assertEqual(m["movement_type"], "adjustment")

        # 3. Product history dedicated action
        res_history = self.client.get(f"/api/v1/ledger/product/{self.product.id}/")
        self.assertEqual(res_history.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_history.data["results"]), 2)

    def test_sum_of_stocklevels_equals_cached_product_stock(self):
        # WH1 receives 20, WH2 receives 30
        receive_stock(self.wh1.id, self.product.id, 20, self.manager)
        receive_stock(self.wh2.id, self.product.id, 30, self.admin)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 50)

        # WH1 sells 5
        create_sale(
            warehouse_id=self.wh1.id,
            lines_data=[{"product_id": self.product.id, "quantity": 5}],
            user=self.staff,
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 45)

        # WH2 adjusts down 10
        adjust_stock(self.wh2.id, self.product.id, -10, self.admin, "WH2 write-off")

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 35)

        # Sum of StockLevels must equal product.stock
        sl_sum = sum(sl.quantity for sl in StockLevel.objects.filter(product=self.product))
        self.assertEqual(sl_sum, self.product.stock)

    def test_product_with_no_stocklevel_counts_as_zero_and_can_be_added(self):
        # Create brand new product without any StockLevels
        p_new = Product.objects.create(
            name="Brand New Tablet",
            sku="TAB-001",
            category=self.category,
            price=Decimal("12000.00"),
        )
        self.assertEqual(p_new.stock, 0)
        self.assertEqual(StockLevel.objects.filter(product=p_new).count(), 0)

        # Sale should fail gracefully indicating 0 available
        with self.assertRaises(InsufficientStockError) as ctx:
            create_sale(
                warehouse_id=self.wh1.id,
                lines_data=[{"product_id": p_new.id, "quantity": 1}],
                user=self.staff,
            )
        self.assertIn("0", str(ctx.exception))

        # Adding stock creates the StockLevel row dynamically
        receive_stock(self.wh1.id, p_new.id, 8, self.manager, "Initial stock")
        sl = StockLevel.objects.get(warehouse=self.wh1, product=p_new)
        self.assertEqual(sl.quantity, 8)
        p_new.refresh_from_db()
        self.assertEqual(p_new.stock, 8)

    def test_sales_in_different_warehouses_do_not_conflict(self):
        # Stock both warehouses
        receive_stock(self.wh1.id, self.product.id, 10, self.manager)
        receive_stock(self.wh2.id, self.product.id, 10, self.admin)

        # Sale in WH1
        sale1 = create_sale(
            warehouse_id=self.wh1.id,
            lines_data=[{"product_id": self.product.id, "quantity": 4}],
            user=self.staff,
        )
        self.assertEqual(sale1.warehouse, self.wh1)

        # Sale in WH2
        sale2 = create_sale(
            warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 6}],
            user=self.admin,
        )
        self.assertEqual(sale2.warehouse, self.wh2)

        sl1 = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        sl2 = StockLevel.objects.get(warehouse=self.wh2, product=self.product)
        self.assertEqual(sl1.quantity, 6)
        self.assertEqual(sl2.quantity, 4)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

