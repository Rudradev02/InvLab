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
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from inventory.services import get_or_create_locked_stock_level
from transfers.models import StockTransfer, StockTransferLine
from transfers.services import (
    cancel_transfer,
    create_transfer,
    dispatch_existing_transfer,
    dispatch_transfer,
    receive_transfer,
)
from warehouses.models import Warehouse

User = get_user_model()


class StockTransferServiceTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.wh1 = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.wh2 = Warehouse.objects.create(name="Warehouse Nagpur", code="NAG01", city="Nagpur")
        self.category = Category.objects.create(name="Electronics")
        self.product = Product.objects.create(
            sku="LAP-001",
            name="Laptop",
            price="50000.00",
            category=self.category,
            default_reorder_level=5,
        )
        self.user = User.objects.create_user(username="manager1", password="password123")
        self.user.groups.add(self.manager_group)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.warehouse = self.wh1
        profile.save()
        self.user = User.objects.get(id=self.user.id)

        # Set initial stock of 20 at WH1
        stock1 = get_or_create_locked_stock_level(self.wh1.id, self.product.id)
        stock1.quantity = 20
        stock1.save()

    def test_transfer_dispatch_and_receive_success(self):
        # 1. Dispatch 5 units from WH1 to WH2
        transfer = dispatch_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 5}],
            user=self.user,
            notes="Restock laptops",
        )

        self.assertEqual(transfer.status, "in_transit")
        self.assertTrue(transfer.transfer_number.startswith("TR-PUN01-NAG01-"))
        self.assertEqual(transfer.lines.count(), 1)
        line = transfer.lines.first()
        self.assertEqual(line.dispatched_quantity, 5)
        self.assertEqual(line.received_quantity, 0)

        # Check stock deducted from WH1
        stock_wh1 = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(stock_wh1.quantity, 15)

        # Check ledger movement for WH1
        out_movement = StockMovement.objects.filter(
            warehouse=self.wh1, product=self.product, movement_type="transfer_out"
        ).first()
        self.assertIsNotNone(out_movement)
        self.assertEqual(out_movement.delta, -5)
        self.assertEqual(out_movement.balance_after, 15)

        # 2. Receive at WH2 fully
        receive_transfer(
            transfer_id=transfer.id,
            received_items={self.product.id: 5},
            user=self.user,
        )

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "received")
        line.refresh_from_db()
        self.assertEqual(line.received_quantity, 5)
        self.assertEqual(line.variance, 0)

        # Stock in WH2 should now be 5
        stock_wh2 = StockLevel.objects.get(warehouse=self.wh2, product=self.product)
        self.assertEqual(stock_wh2.quantity, 5)

        # Check ledger movement for WH2
        in_movement = StockMovement.objects.filter(
            warehouse=self.wh2, product=self.product, movement_type="transfer_in"
        ).first()
        self.assertIsNotNone(in_movement)
        self.assertEqual(in_movement.delta, 5)
        self.assertEqual(in_movement.balance_after, 5)

    def test_transfer_with_variance_shortfall(self):
        # Dispatch 10 units
        transfer = dispatch_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 10}],
            user=self.user,
        )

        # Receive only 8 units (2 lost/damaged in transit)
        receive_transfer(
            transfer_id=transfer.id,
            received_items={self.product.id: 8},
            user=self.user,
        )

        transfer.refresh_from_db()
        line = transfer.lines.first()
        self.assertEqual(line.received_quantity, 8)
        self.assertEqual(line.variance, 2)

        # Only 8 units added to WH2
        stock_wh2 = StockLevel.objects.get(warehouse=self.wh2, product=self.product)
        self.assertEqual(stock_wh2.quantity, 8)

        # Total units across warehouses = 10 (WH1) + 8 (WH2) = 18. 2 is variance shortfall not added anywhere.
        stock_wh1 = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(stock_wh1.quantity, 10)

    def test_transfer_cancel_in_transit_restores_stock(self):
        transfer = dispatch_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 6}],
            user=self.user,
        )

        stock_wh1 = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(stock_wh1.quantity, 14)

        # Cancel transfer
        cancel_transfer(transfer.id, user=self.user)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "cancelled")

        stock_wh1.refresh_from_db()
        self.assertEqual(stock_wh1.quantity, 20)

        # Check ledger movement recorded for cancellation
        cancel_movement = StockMovement.objects.filter(
            warehouse=self.wh1, product=self.product, reference=transfer.transfer_number, movement_type="transfer_in"
        ).first()
        self.assertIsNotNone(cancel_movement)
        self.assertEqual(cancel_movement.delta, 6)
        self.assertEqual(cancel_movement.balance_after, 20)

    def test_draft_transfer_workflow(self):
        # Create draft transfer
        transfer = create_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 4}],
            user=self.user,
            is_draft=True,
        )
        self.assertEqual(transfer.status, "draft")

        # Source stock must NOT be deducted yet
        stock_wh1 = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(stock_wh1.quantity, 20)

        # Dispatch existing draft
        dispatch_existing_transfer(transfer.id, user=self.user)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "in_transit")

        stock_wh1.refresh_from_db()
        self.assertEqual(stock_wh1.quantity, 16)

    def test_edge_case_same_source_and_destination(self):
        from core.exceptions import DomainError
        with self.assertRaises(DomainError) as ctx:
            dispatch_transfer(
                from_warehouse_id=self.wh1.id,
                to_warehouse_id=self.wh1.id,
                lines_data=[{"product_id": self.product.id, "quantity": 1}],
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "same_warehouse")

    def test_edge_case_quantity_above_available(self):
        from core.exceptions import InsufficientStockError
        with self.assertRaises(InsufficientStockError):
            dispatch_transfer(
                from_warehouse_id=self.wh1.id,
                to_warehouse_id=self.wh2.id,
                lines_data=[{"product_id": self.product.id, "quantity": 25}],
                user=self.user,
            )

    def test_edge_case_inactive_destination(self):
        from core.exceptions import DomainError
        self.wh2.is_active = False
        self.wh2.save()

        with self.assertRaises(DomainError) as ctx:
            dispatch_transfer(
                from_warehouse_id=self.wh1.id,
                to_warehouse_id=self.wh2.id,
                lines_data=[{"product_id": self.product.id, "quantity": 2}],
                user=self.user,
            )
        self.assertEqual(ctx.exception.code, "warehouse_inactive")

    def test_edge_case_receiving_twice_rejected(self):
        from core.exceptions import ConflictError
        transfer = dispatch_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 2}],
            user=self.user,
        )
        receive_transfer(transfer.id, {self.product.id: 2}, self.user)

        with self.assertRaises(ConflictError):
            receive_transfer(transfer.id, {self.product.id: 2}, self.user)

    def test_edge_case_receiving_more_than_sent_rejected(self):
        from core.exceptions import DomainError
        transfer = dispatch_transfer(
            from_warehouse_id=self.wh1.id,
            to_warehouse_id=self.wh2.id,
            lines_data=[{"product_id": self.product.id, "quantity": 3}],
            user=self.user,
        )

        with self.assertRaises(DomainError) as ctx:
            receive_transfer(transfer.id, {self.product.id: 5}, self.user)
        self.assertEqual(ctx.exception.code, "received_exceeds_sent")


class StockTransferApiTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        self.wh1 = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.wh2 = Warehouse.objects.create(name="Warehouse Nagpur", code="NAG01", city="Nagpur")
        self.wh3 = Warehouse.objects.create(name="Warehouse Mumbai", code="BOM01", city="Mumbai")

        self.category = Category.objects.create(name="Hardware")
        self.product = Product.objects.create(
            sku="MOU-001",
            name="Wireless Mouse",
            price="1200.00",
            category=self.category,
            default_reorder_level=5,
        )

        # Stock at WH1
        stock1 = get_or_create_locked_stock_level(self.wh1.id, self.product.id)
        stock1.quantity = 50
        stock1.save()

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

        self.client = APIClient()

    def test_staff_cannot_access_transfers(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.get("/api/v1/transfers/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_scoping_on_list(self):
        # Create transfer 1: WH1 -> WH2
        dispatch_transfer(self.wh1.id, self.wh2.id, [{"product_id": self.product.id, "quantity": 5}], self.mgr1)
        # Create transfer 2: WH2 -> WH3 (WH1 not involved)
        stock2 = get_or_create_locked_stock_level(self.wh2.id, self.product.id)
        stock2.quantity = 10
        stock2.save()
        dispatch_transfer(self.wh2.id, self.wh3.id, [{"product_id": self.product.id, "quantity": 2}], self.mgr2)

        # Manager 1 can only see transfer 1
        self.client.force_authenticate(user=self.mgr1)
        res = self.client.get("/api/v1/transfers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["from_warehouse"], self.wh1.id)

        # Admin sees both
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/transfers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 2)

    def test_manager_incoming_outgoing_filters(self):
        dispatch_transfer(self.wh1.id, self.wh2.id, [{"product_id": self.product.id, "quantity": 5}], self.mgr1)
        
        # Manager 1 checking outgoing
        self.client.force_authenticate(user=self.mgr1)
        res = self.client.get("/api/v1/transfers/?direction=outgoing")
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)

        res = self.client.get("/api/v1/transfers/?direction=incoming")
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 0)

        # Manager 2 checking incoming
        self.client.force_authenticate(user=self.mgr2)
        res = self.client.get("/api/v1/transfers/?direction=incoming")
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)

    def test_manager_can_receive_incoming_transfer(self):
        t = dispatch_transfer(self.wh1.id, self.wh2.id, [{"product_id": self.product.id, "quantity": 5}], self.mgr1)

        # Manager 1 (source) cannot receive it
        self.client.force_authenticate(user=self.mgr1)
        res = self.client.post(f"/api/v1/transfers/{t.id}/receive/", {"items": [{"product_id": self.product.id, "received_quantity": 5}]})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Manager 2 (destination) receives it
        self.client.force_authenticate(user=self.mgr2)
        res = self.client.post(f"/api/v1/transfers/{t.id}/receive/", {"items": [{"product_id": self.product.id, "received_quantity": 5}]})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "received")


class TransferDeadlockConcurrencyTests(TransactionTestCase):
    """
    Tests that opposite simultaneous transfers between warehouses do not deadlock.
    Requires PostgreSQL row-level locking.
    """
    def setUp(self):
        if connection.vendor == "sqlite":
            raise unittest.SkipTest(
                "Concurrency tests require PostgreSQL (row-level locking with threads is not supported on SQLite)"
            )

        self.wh1 = Warehouse.objects.create(name="Warehouse Pune", code="PUN01", city="Pune")
        self.wh2 = Warehouse.objects.create(name="Warehouse Nagpur", code="NAG01", city="Nagpur")

        self.category = Category.objects.create(name="Components")
        self.p1 = Product.objects.create(sku="RAM-8GB", name="RAM 8GB", price="3000.00", category=self.category)
        self.p2 = Product.objects.create(sku="SSD-512GB", name="SSD 512GB", price="4500.00", category=self.category)

        # Stock at both warehouses
        s1_p1 = get_or_create_locked_stock_level(self.wh1.id, self.p1.id)
        s1_p1.quantity = 100
        s1_p1.save()

        s1_p2 = get_or_create_locked_stock_level(self.wh1.id, self.p2.id)
        s1_p2.quantity = 100
        s1_p2.save()

        s2_p1 = get_or_create_locked_stock_level(self.wh2.id, self.p1.id)
        s2_p1.quantity = 100
        s2_p1.save()

        s2_p2 = get_or_create_locked_stock_level(self.wh2.id, self.p2.id)
        s2_p2.quantity = 100
        s2_p2.save()

        self.user = User.objects.create_user(username="concurrency_user", password="password123")

    def tearDown(self):
        connection.close()

    def test_simultaneous_opposite_transfers_no_deadlock(self):
        errors = []

        def transfer_1_to_2():
            try:
                dispatch_transfer(
                    from_warehouse_id=self.wh1.id,
                    to_warehouse_id=self.wh2.id,
                    lines_data=[
                        {"product_id": self.p2.id, "quantity": 10},
                        {"product_id": self.p1.id, "quantity": 10},
                    ],
                    user=self.user,
                )
            except Exception as e:
                errors.append(e)

        def transfer_2_to_1():
            try:
                dispatch_transfer(
                    from_warehouse_id=self.wh2.id,
                    to_warehouse_id=self.wh1.id,
                    lines_data=[
                        {"product_id": self.p1.id, "quantity": 10},
                        {"product_id": self.p2.id, "quantity": 10},
                    ],
                    user=self.user,
                )
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=transfer_1_to_2),
            threading.Thread(target=transfer_2_to_1),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Simultaneous transfers produced errors: {errors}")
        self.assertEqual(StockTransfer.objects.count(), 2)
