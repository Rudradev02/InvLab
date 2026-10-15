from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from sales.models import Sale
from warehouses.models import Warehouse

User = get_user_model()


class StaffWorkspaceTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Warehouses
        self.wh1 = Warehouse.objects.create(
            name="Pune Hub",
            code="PUN01",
            address_line1="MIDC Bhosari",
            city="Pune",
            state="Maharashtra",
            pincode="411026",
            is_active=True,
        )
        self.wh2 = Warehouse.objects.create(
            name="Nagpur Hub",
            code="NAG01",
            address_line1="MIHAN SEZ",
            city="Nagpur",
            state="Maharashtra",
            pincode="441108",
            is_active=True,
        )

        # Users
        self.staff1 = User.objects.create_user(
            username="staff_pune",
            email="staff_pune@invlab.local",
            password="password123",
        )
        self.staff1.groups.add(self.staff_group)

        self.staff2 = User.objects.create_user(
            username="staff_nagpur",
            email="staff_nagpur@invlab.local",
            password="password123",
        )
        self.staff2.groups.add(self.staff_group)

        self.mgr = User.objects.create_user(
            username="mgr_pune",
            email="mgr_pune@invlab.local",
            password="password123",
        )
        self.mgr.groups.add(self.manager_group)
        self.wh1.manager = self.mgr
        self.wh1.save()

        # Assign profiles
        for user, wh in [
            (self.staff1, self.wh1),
            (self.staff2, self.wh2),
            (self.mgr, self.wh1),
        ]:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.warehouse = wh
            profile.save()

        # Reload users to refresh cached reverse profile
        self.staff1 = User.objects.get(id=self.staff1.id)
        self.staff2 = User.objects.get(id=self.staff2.id)
        self.mgr = User.objects.get(id=self.mgr.id)

        # Catalog
        self.category = Category.objects.create(name="Office Supplies")
        self.product = Product.objects.create(
            name="Thermal Receipt Paper 80mm",
            sku="TH-80-RL",
            category=self.category,
            price=Decimal("50.00"),
            default_reorder_level=10,
        )

        # Initial Stock Level for WH1
        self.stock1 = StockLevel.objects.create(
            warehouse=self.wh1,
            product=self.product,
            quantity=50,
            reorder_level=10,
        )
        # Initial Stock Level for WH2
        self.stock2 = StockLevel.objects.create(
            warehouse=self.wh2,
            product=self.product,
            quantity=30,
            reorder_level=5,
        )

    def test_staff_can_view_products_and_own_warehouse_stock(self):
        self.client.force_authenticate(user=self.staff1)

        # 1. Staff can view products catalogue
        res_prod = self.client.get("/api/v1/products/")
        self.assertEqual(res_prod.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_prod.json()["results"]), 1)

        # 2. Staff can view stock list, strictly scoped to their warehouse
        res_stock = self.client.get("/api/v1/stock/")
        self.assertEqual(res_stock.status_code, status.HTTP_200_OK)
        results = res_stock.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["warehouse_code"], "PUN01")
        self.assertEqual(results[0]["quantity"], 50)

    def test_staff_cannot_modify_or_delete_products_or_categories(self):
        self.client.force_authenticate(user=self.staff1)

        # Cannot create product
        res_create = self.client.post(
            "/api/v1/products/",
            {
                "sku": "STAFF-PROD",
                "name": "Staff Added Prod",
                "category": self.category.id,
                "price": "99.00",
            },
            format="json",
        )
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot edit product price or details
        res_patch = self.client.patch(
            f"/api/v1/products/{self.product.id}/",
            {"price": "10.00"},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot delete product
        res_del = self.client.delete(f"/api/v1/products/{self.product.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot create or delete category
        res_cat = self.client.post("/api/v1/categories/", {"name": "Staff Cat"}, format="json")
        self.assertEqual(res_cat.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_manage_users_or_access_other_warehouses(self):
        self.client.force_authenticate(user=self.staff1)

        # Cannot view users list
        res_users = self.client.get("/api/v1/users/")
        self.assertEqual(res_users.status_code, status.HTTP_403_FORBIDDEN)

        # Cannot access warehouses overview
        res_wh = self.client.get("/api/v1/warehouses/overview/")
        self.assertEqual(res_wh.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_stock_receive_creates_ledger_and_updates_stock(self):
        self.client.force_authenticate(user=self.staff1)

        res = self.client.post(
            "/api/v1/stock/receive/",
            {
                "product_id": self.product.id,
                "quantity": 25,
                "reference": "PO-2026-9901",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 75)

        # Verify movement in ledger
        movement = StockMovement.objects.filter(
            warehouse=self.wh1, product=self.product, movement_type="receive"
        ).latest("id")
        self.assertEqual(movement.delta, 25)
        self.assertEqual(movement.balance_after, 75)
        self.assertEqual(movement.user, self.staff1)
        self.assertEqual(movement.reference, "PO-2026-9901")

    def test_staff_stock_adjust_creates_ledger_and_updates_stock(self):
        self.client.force_authenticate(user=self.staff1)

        res = self.client.post(
            "/api/v1/stock/adjust/",
            {
                "product_id": self.product.id,
                "delta": -5,
                "reason": "Water damage in corner shelf",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 45)

        # Verify ledger movement
        movement = StockMovement.objects.filter(
            warehouse=self.wh1, product=self.product, movement_type="adjustment"
        ).latest("id")
        self.assertEqual(movement.delta, -5)
        self.assertEqual(movement.balance_after, 45)
        self.assertEqual(movement.reason, "Water damage in corner shelf")

    def test_adjustment_requires_reason(self):
        self.client.force_authenticate(user=self.staff1)

        # Attempt adjust without reason
        res_empty = self.client.post(
            "/api/v1/stock/adjust/",
            {
                "product_id": self.product.id,
                "delta": 2,
                "reason": "",
            },
            format="json",
        )
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_never_goes_below_zero(self):
        self.client.force_authenticate(user=self.staff1)

        # Attempt to adjust more than available (50 available, request -60)
        res = self.client.post(
            "/api/v1/stock/adjust/",
            {
                "product_id": self.product.id,
                "delta": -60,
                "reason": "Write-off attempt exceeding stock",
            },
            format="json",
        )
        self.assertIn(res.status_code, [status.HTTP_409_CONFLICT, status.HTTP_400_BAD_REQUEST])
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 50)

    def test_idempotency_key_double_submit_protection(self):
        self.client.force_authenticate(user=self.staff1)

        # 1. Receive with Idempotency-Key
        idem_key = "receive-test-uuid-001"
        res1 = self.client.post(
            "/api/v1/stock/receive/",
            {
                "product_id": self.product.id,
                "quantity": 10,
                "reference": "Delivery Batch A",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idem_key,
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 60)

        # Replay the identical receive request with same Idempotency-Key
        res2 = self.client.post(
            "/api/v1/stock/receive/",
            {
                "product_id": self.product.id,
                "quantity": 10,
                "reference": "Delivery Batch A",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=idem_key,
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        # Verify stock was NOT incremented again
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 60)

        # 2. Sale with Idempotency-Key
        sale_idem_key = "sale-test-uuid-002"
        res_sale1 = self.client.post(
            "/api/v1/sales/",
            {
                "lines": [{"product_id": self.product.id, "quantity": 4}],
                "notes": "Counter customer",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=sale_idem_key,
        )
        self.assertEqual(res_sale1.status_code, status.HTTP_201_CREATED)
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 56)

        # Replay same sale
        res_sale2 = self.client.post(
            "/api/v1/sales/",
            {
                "lines": [{"product_id": self.product.id, "quantity": 4}],
                "notes": "Counter customer",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=sale_idem_key,
        )
        self.assertEqual(res_sale2.status_code, status.HTTP_200_OK)
        self.assertEqual(res_sale1.json()["sale_number"], res_sale2.json()["sale_number"])
        self.stock1.refresh_from_db()
        self.assertEqual(self.stock1.quantity, 56)

    def test_staff_of_deactivated_warehouse_are_blocked(self):
        # Deactivate Pune Warehouse
        self.wh1.is_active = False
        self.wh1.save()

        self.client.force_authenticate(user=self.staff1)

        # Attempt receive
        res_rcv = self.client.post(
            "/api/v1/stock/receive/",
            {"product_id": self.product.id, "quantity": 5},
            format="json",
        )
        self.assertEqual(res_rcv.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt adjust
        res_adj = self.client.post(
            "/api/v1/stock/adjust/",
            {"product_id": self.product.id, "delta": 2, "reason": "Inventory count"},
            format="json",
        )
        self.assertEqual(res_adj.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt sale
        res_sale = self.client.post(
            "/api/v1/sales/",
            {"lines": [{"product_id": self.product.id, "quantity": 1}]},
            format="json",
        )
        self.assertIn(res_sale.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])

    def test_staff_can_record_sales_and_view_only_own_sales(self):
        # Staff 1 records a sale
        self.client.force_authenticate(user=self.staff1)
        res_s1 = self.client.post(
            "/api/v1/sales/",
            {"lines": [{"product_id": self.product.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res_s1.status_code, status.HTTP_201_CREATED)
        s1_number = res_s1.json()["sale_number"]

        # Manager records a sale in same warehouse
        self.client.force_authenticate(user=self.mgr)
        res_m = self.client.post(
            "/api/v1/sales/",
            {"lines": [{"product_id": self.product.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(res_m.status_code, status.HTTP_201_CREATED)
        sm_number = res_m.json()["sale_number"]

        # Staff 1 lists sales: MUST only see their own sale
        self.client.force_authenticate(user=self.staff1)
        res_list = self.client.get("/api/v1/sales/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        numbers = [s["sale_number"] for s in res_list.json()["results"]]
        self.assertIn(s1_number, numbers)
        self.assertNotIn(sm_number, numbers)

        # Staff cannot edit or delete their sale
        sale_obj = Sale.objects.get(sale_number=s1_number)
        res_patch = self.client.patch(f"/api/v1/sales/{sale_obj.id}/", {"notes": "Changed"}, format="json")
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        res_del = self.client.delete(f"/api/v1/sales/{sale_obj.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)
