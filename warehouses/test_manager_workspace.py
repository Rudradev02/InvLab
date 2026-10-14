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
from warehouses.models import Warehouse

User = get_user_model()


class WarehouseManagerWorkspaceTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Warehouses
        self.wh1 = Warehouse.objects.create(
            name="Pune Central Hub",
            code="PUN01",
            address_line1="Plot 42 MIDC",
            city="Pune",
            state="Maharashtra",
            pincode="411018",
            phone="9876500001",
            email="pune@invlab.local",
        )
        self.wh2 = Warehouse.objects.create(
            name="Nagpur Depot",
            code="NAG01",
            address_line1="Plot 88 Logistics Park",
            city="Nagpur",
            state="Maharashtra",
            pincode="440001",
            phone="9876500002",
            email="nagpur@invlab.local",
        )

        # Users
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@invlab.local",
            password="password123",
        )
        self.admin.groups.add(self.admin_group)

        self.mgr1 = User.objects.create_user(
            username="pune_mgr",
            email="mgr_pune@invlab.local",
            first_name="Vikram",
            last_name="Patil",
            password="password123",
        )
        self.mgr1.groups.add(self.manager_group)
        self.wh1.manager = self.mgr1
        self.wh1.save()

        self.mgr2 = User.objects.create_user(
            username="nagpur_mgr",
            email="mgr_nagpur@invlab.local",
            first_name="Sanjay",
            last_name="Rao",
            password="password123",
        )
        self.mgr2.groups.add(self.manager_group)
        self.wh2.manager = self.mgr2
        self.wh2.save()

        self.staff_pune = User.objects.create_user(
            username="staff_pune_1",
            email="staff1@pune.local",
            first_name="Anil",
            last_name="Deshmukh",
            password="password123",
        )
        self.staff_pune.groups.add(self.staff_group)

        self.staff_nagpur = User.objects.create_user(
            username="staff_nagpur_1",
            email="staff1@nagpur.local",
            first_name="Manoj",
            last_name="Tiwari",
            password="password123",
        )
        self.staff_nagpur.groups.add(self.staff_group)

        # Profiles
        for user, wh, phone in [
            (self.admin, None, "9999999999"),
            (self.mgr1, self.wh1, "9888888881"),
            (self.mgr2, self.wh2, "9888888882"),
            (self.staff_pune, self.wh1, "9777777771"),
            (self.staff_nagpur, self.wh2, "9777777772"),
        ]:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.warehouse = wh
            profile.phone = phone
            profile.save()

        # Reload users so cached profile relation is updated
        self.admin = User.objects.get(id=self.admin.id)
        self.mgr1 = User.objects.get(id=self.mgr1.id)
        self.mgr2 = User.objects.get(id=self.mgr2.id)
        self.staff_pune = User.objects.get(id=self.staff_pune.id)
        self.staff_nagpur = User.objects.get(id=self.staff_nagpur.id)

        # Catalog Category and Product
        self.category = Category.objects.create(name="Electronics")
        self.product = Product.objects.create(
            name="Barcode Scanner Wireless",
            sku="SCAN-W01",
            category=self.category,
            price=Decimal("1500.00"),
            default_reorder_level=5,
        )

    def test_manager_scoped_staff_crud(self):
        self.client.force_authenticate(user=self.mgr1)

        # 1. Manager can create Staff in their own warehouse
        res = self.client.post(
            "/api/v1/users/",
            {
                "username": "new_pune_staff",
                "first_name": "Ramesh",
                "last_name": "Jadhav",
                "email": "ramesh@pune.local",
                "phone": "9555555555",
                "role_name": "Staff",
                "password": "password123",
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_user = User.objects.get(username="new_pune_staff")
        self.assertEqual(new_user.profile.warehouse, self.wh1)
        self.assertEqual(new_user.get_role(), ROLE_STAFF)

        # 2. Manager cannot create Manager or Admin accounts
        res_mgr = self.client.post(
            "/api/v1/users/",
            {
                "username": "attempt_mgr",
                "role_name": ROLE_MANAGER,
                "password": "password123",
            },
        )
        # In accounts/views.py perform_create: Manager automatically forces role=ROLE_STAFF
        # Verify it remained Staff and cannot be elevated
        if res_mgr.status_code == status.HTTP_201_CREATED:
            created_user = User.objects.get(username="attempt_mgr")
            self.assertEqual(created_user.get_role(), ROLE_STAFF)

        # 3. Manager can edit Staff of their own warehouse
        res_edit = self.client.patch(
            f"/api/v1/users/{self.staff_pune.id}/",
            {"first_name": "Anil Updated"},
        )
        self.assertEqual(res_edit.status_code, status.HTTP_200_OK)
        self.staff_pune.refresh_from_db()
        self.assertEqual(self.staff_pune.first_name, "Anil Updated")

        # 4. Manager cannot reassign staff to another warehouse
        res_wh_move = self.client.patch(
            f"/api/v1/users/{self.staff_pune.id}/",
            {"warehouse_id": self.wh2.id},
        )
        self.assertEqual(res_wh_move.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Manager cannot deactivate themselves
        res_self = self.client.delete(f"/api/v1/users/{self.mgr1.id}/")
        self.assertIn(res_self.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 6. Manager can deactivate Staff of their own warehouse
        res_deact = self.client.delete(f"/api/v1/users/{self.staff_pune.id}/")
        self.assertEqual(res_deact.status_code, status.HTTP_204_NO_CONTENT)
        self.staff_pune.refresh_from_db()
        self.assertFalse(self.staff_pune.is_active)

    def test_manager_cannot_access_or_modify_other_warehouse_staff(self):
        self.client.force_authenticate(user=self.mgr1)

        # Manager 1 tries to access / edit staff in Warehouse 2
        res = self.client.patch(
            f"/api/v1/users/{self.staff_nagpur.id}/",
            {"first_name": "Hacked Name"},
        )
        # Should be 404 because get_queryset() filters to Pune staff only
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_manager_product_catalog_permissions(self):
        self.client.force_authenticate(user=self.mgr1)

        # 1. Manager can create products in shared catalog
        res_create = self.client.post(
            "/api/v1/products/",
            {
                "sku": "THERMAL-ROLL-80",
                "name": "Thermal Paper Roll 80mm",
                "category": self.category.id,
                "price": "45.00",
                "default_reorder_level": 20,
            },
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        new_prod = Product.objects.get(sku="THERMAL-ROLL-80")

        # 2. Manager can update products
        res_patch = self.client.patch(
            f"/api/v1/products/{new_prod.id}/",
            {"price": "50.00"},
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        new_prod.refresh_from_db()
        self.assertEqual(new_prod.price, Decimal("50.00"))

        # 3. Manager CANNOT delete products (Admin only)
        res_del = self.client.delete(f"/api/v1/products/{new_prod.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Admin CAN delete empty products
        self.client.force_authenticate(user=self.admin)
        res_del_admin = self.client.delete(f"/api/v1/products/{new_prod.id}/")
        self.assertEqual(res_del_admin.status_code, status.HTTP_204_NO_CONTENT)

    def test_manager_stock_crud_for_own_warehouse(self):
        self.client.force_authenticate(user=self.mgr1)

        # 1. Manager adds product to their warehouse stock
        res = self.client.post(
            "/api/v1/stock/",
            {
                "product_id": self.product.id,
                "reorder_level": 8,
                "initial_quantity": 25,
            },
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        stock = StockLevel.objects.get(warehouse=self.wh1, product=self.product)
        self.assertEqual(stock.quantity, 25)
        self.assertEqual(stock.reorder_level, 8)

        # 2. Manager updates reorder level
        res_reorder = self.client.patch(
            f"/api/v1/stock/{stock.id}/",
            {"reorder_level": 12},
        )
        self.assertEqual(res_reorder.status_code, status.HTTP_200_OK)
        stock.refresh_from_db()
        self.assertEqual(stock.reorder_level, 12)

        # 3. Manager cannot tamper with quantity directly via PATCH
        res_qty = self.client.patch(
            f"/api/v1/stock/{stock.id}/",
            {"quantity": 999},
        )
        self.assertEqual(res_qty.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Manager cannot add stock level targeting another warehouse
        res_other = self.client.post(
            "/api/v1/stock/",
            {
                "product_id": self.product.id,
                "warehouse": self.wh2.id,
                "reorder_level": 5,
            },
        )
        self.assertIn(res_other.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])

    def test_manager_workspace_endpoint_and_scoping(self):
        self.client.force_authenticate(user=self.mgr1)

        # 1. /api/v1/warehouses/my-warehouse/ returns Pune Hub data
        res = self.client.get("/api/v1/warehouses/my-warehouse/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["warehouse"]["code"], "PUN01")
        self.assertIn("summary", data)
        self.assertIn("staff", data)

        # 2. Accessing another warehouse on full-detail returns 404
        res_other = self.client.get(f"/api/v1/warehouses/{self.wh2.id}/full-detail/")
        self.assertEqual(res_other.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Accessing own warehouse on full-detail succeeds
        res_own = self.client.get(f"/api/v1/warehouses/{self.wh1.id}/full-detail/")
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
