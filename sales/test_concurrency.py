import threading
import unittest
from decimal import Decimal

from django.db import connection
from django.test import TransactionTestCase

from accounts.models import User
from catalog.models import Category, Product
from core.exceptions import InsufficientStockError
from inventory.models import StockLevel, StockMovement
from inventory.services import adjust_stock, receive_stock
from sales.models import Sale
from sales.services import create_sale
from warehouses.models import Warehouse


class ConcurrencyOversellingTests(TransactionTestCase):
    """
    Concurrency tests to prove that concurrent sales and adjustments cannot
    oversell stock or corrupt ledger integrity under race conditions.

    Requires PostgreSQL row-level locking (select_for_update).
    Automatically skipped on SQLite.
    """

    def setUp(self):
        if connection.vendor == "sqlite":
            raise unittest.SkipTest(
                "Concurrency tests require PostgreSQL (row-level locking with threads is not supported on SQLite)"
            )

        self.warehouse = Warehouse.objects.create(
            name="Concurrency Test Warehouse",
            code="CONC",
            address_line1="123 Test Street",
            city="Pune",
            state="Maharashtra",
            pincode="411001",
        )
        self.user = User.objects.create_user(
            username="conc_user",
            password="TestPassword@123",
            email="conc@invlab.local",
        )
        self.category = Category.objects.create(name="Test Category")
        self.product = Product.objects.create(
            sku="CONC-SKU-001",
            name="Concurrent Widget",
            category=self.category,
            price=Decimal("150.00"),
            default_reorder_level=5,
        )

    def tearDown(self):
        # Close connection to avoid leaks across test threads
        connection.close()

    def test_two_simultaneous_sales_with_stock_one_gives_exactly_one_success(self):
        """
        Stock = 1. Two threads attempt to purchase quantity 1 simultaneously.
        Exactly one sale must succeed, and one must fail with InsufficientStockError.
        Final stock must be exactly 0.
        """
        receive_stock(self.warehouse.id, self.product.id, 1, self.user, "Initial 1")

        num_threads = 2
        barrier = threading.Barrier(num_threads)
        results = []
        errors = []

        def worker():
            # Close connection so thread gets a clean, thread-local connection
            connection.close()
            try:
                barrier.wait()
                sale = create_sale(
                    warehouse_id=self.warehouse.id,
                    lines_data=[{"product_id": self.product.id, "quantity": 1}],
                    user=self.user,
                    notes="Concurrent sale test",
                )
                results.append(sale)
            except InsufficientStockError as e:
                errors.append(e)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Assertions
        self.assertEqual(len(results), 1, "Exactly one sale should succeed.")
        self.assertEqual(len(errors), 1, "Exactly one sale should fail with InsufficientStockError.")

        stock_level = StockLevel.objects.get(warehouse=self.warehouse, product=self.product)
        self.assertEqual(stock_level.quantity, 0, "Stock level must be 0 after 1 successful sale.")

        # Ledger verification
        movements = StockMovement.objects.filter(warehouse=self.warehouse, product=self.product)
        # 1 receive (+1) and 1 sale (-1)
        self.assertEqual(movements.count(), 2)
        total_delta = sum(m.delta for m in movements)
        self.assertEqual(total_delta, 0)

    def test_ten_simultaneous_sales_with_stock_five_gives_exactly_five_successes(self):
        """
        Stock = 5. Ten threads attempt to purchase quantity 1 simultaneously.
        Exactly 5 sales must succeed, and 5 must fail with InsufficientStockError.
        Final stock must be exactly 0.
        """
        receive_stock(self.warehouse.id, self.product.id, 5, self.user, "Initial 5")

        num_threads = 10
        barrier = threading.Barrier(num_threads)
        results = []
        errors = []

        def worker():
            connection.close()
            try:
                barrier.wait()
                sale = create_sale(
                    warehouse_id=self.warehouse.id,
                    lines_data=[{"product_id": self.product.id, "quantity": 1}],
                    user=self.user,
                )
                results.append(sale)
            except InsufficientStockError as e:
                errors.append(e)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(results), 5, "Exactly 5 sales should succeed.")
        self.assertEqual(len(errors), 5, "Exactly 5 sales should fail with InsufficientStockError.")

        stock_level = StockLevel.objects.get(warehouse=self.warehouse, product=self.product)
        self.assertEqual(stock_level.quantity, 0, "Stock level must be 0 after 5 sales from 5 initial.")

        sales_count = Sale.objects.filter(warehouse=self.warehouse).count()
        self.assertEqual(sales_count, 5)

        movements = StockMovement.objects.filter(warehouse=self.warehouse, product=self.product)
        total_delta = sum(m.delta for m in movements)
        self.assertEqual(total_delta, 0)

    def test_simultaneous_sale_and_stock_adjustments_keep_stock_and_ledger_consistent(self):
        """
        Stock = 10.
        Thread 1: Sale of 4 (delta -4)
        Thread 2: Stock adjust -4 (delta -4)
        Thread 3: Stock adjust +5 (delta +5)
        All run concurrently with a barrier.
        Expected final stock: 10 - 4 - 4 + 5 = 7.
        Ledger sum must equal 7.
        """
        receive_stock(self.warehouse.id, self.product.id, 10, self.user, "Initial 10")

        barrier = threading.Barrier(3)
        exceptions = []

        def worker_sale():
            connection.close()
            try:
                barrier.wait()
                create_sale(
                    warehouse_id=self.warehouse.id,
                    lines_data=[{"product_id": self.product.id, "quantity": 4}],
                    user=self.user,
                )
            except Exception as e:
                exceptions.append(e)
            finally:
                connection.close()

        def worker_adjust_down():
            connection.close()
            try:
                barrier.wait()
                adjust_stock(
                    warehouse_id=self.warehouse.id,
                    product_id=self.product.id,
                    delta=-4,
                    user=self.user,
                    reason="Routine damage write-off",
                )
            except Exception as e:
                exceptions.append(e)
            finally:
                connection.close()

        def worker_adjust_up():
            connection.close()
            try:
                barrier.wait()
                adjust_stock(
                    warehouse_id=self.warehouse.id,
                    product_id=self.product.id,
                    delta=5,
                    user=self.user,
                    reason="Found unrecorded batch",
                )
            except Exception as e:
                exceptions.append(e)
            finally:
                connection.close()

        threads = [
            threading.Thread(target=worker_sale),
            threading.Thread(target=worker_adjust_down),
            threading.Thread(target=worker_adjust_up),
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(exceptions), 0, f"No exceptions expected: {exceptions}")

        stock_level = StockLevel.objects.get(warehouse=self.warehouse, product=self.product)
        self.assertEqual(stock_level.quantity, 7, "Final stock must be exactly 7 (10 - 4 - 4 + 5).")

        movements = StockMovement.objects.filter(warehouse=self.warehouse, product=self.product)
        total_delta = sum(m.delta for m in movements)
        self.assertEqual(total_delta, 7, "Sum of all movement deltas must equal final stock level.")
