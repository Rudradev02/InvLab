from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from sales.models import Sale, SaleLine
from warehouses.models import Warehouse

User = get_user_model()


class WarehouseAdminOverviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Users
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@example.com",
            first_name="Admin",
            last_name="Super",
            password="password123",
        )
        self.admin.groups.add(self.admin_group)

        self.manager = User.objects.create_user(
            username="mgr_user",
            email="mgr@example.com",
            first_name="Rajesh",
            last_name="Kumar",
            password="password123",
        )
        self.manager.groups.add(self.manager_group)

        self.staff1 = User.objects.create_user(
            username="staff1_user",
            email="staff1@example.com",
            first_name="Pooja",
            last_name="Sharma",
            password="password123",
        )
        self.staff1.groups.add(self.staff_group)

        # Warehouses
        self.wh1 = Warehouse.objects.create(
            name="Mumbai Hub",
            code="MUM01",
            address_line1="101 Logistics Park",
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            phone="9876543210",
            email="mum@example.com",
            manager=self.manager,
        )

        self.wh_empty = Warehouse.objects.create(
            name="Empty Warehouse",
            code="EMP01",
            address_line1="202 Nowhere St",
            city="Pune",
            state="Maharashtra",
            pincode="411001",
            phone="9123456780",
            email="empty@example.com",
            manager=None,
        )

        # Profiles (created automatically by signal on User creation)
        for user, wh, phone in [
            (self.admin, None, "9999999999"),
            (self.manager, self.wh1, "9888888888"),
            (self.staff1, self.wh1, "9777777777"),
        ]:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.warehouse = wh
            profile.phone = phone
            profile.save()

        # Category and Product
        self.category = Category.objects.create(name="Medicines")
        self.product = Product.objects.create(
            name="Paracetamol 500mg",
            sku="PARA-500",
            category=self.category,
            price=Decimal("25.00"),
            default_reorder_level=10,
        )

    def test_overview_endpoint_admin_access(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/warehouses/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        codes = [w["code"] for w in data]
        self.assertIn("MUM01", codes)
        self.assertIn("EMP01", codes)

        # Check wh1 data
        wh1_data = next(w for w in data if w["code"] == "MUM01")
        self.assertEqual(wh1_data["name"], "Mumbai Hub")
        self.assertIsNotNone(wh1_data["manager"])
        self.assertEqual(wh1_data["manager"]["phone"], "9888888888")
        self.assertEqual(wh1_data["manager"]["email"], "mgr@example.com")
        self.assertEqual(wh1_data["manager"]["full_name"], "Rajesh Kumar")
        self.assertGreaterEqual(wh1_data["staff_count"], 1)
        self.assertEqual(len(wh1_data["staff"]), 2)  # manager + staff1 both have warehouse=wh1

        # Check wh_empty data (warehouse without manager)
        emp_data = next(w for w in data if w["code"] == "EMP01")
        self.assertIsNone(emp_data["manager"])
        self.assertEqual(emp_data["staff_count"], 0)
        self.assertEqual(emp_data["products_stocked"], 0)

    def test_overview_endpoint_permission_denied_for_staff(self):
        self.client.force_authenticate(user=self.staff1)
        res = self.client.get("/api/v1/warehouses/overview/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_full_detail_endpoint(self):
        # Create stock, sale, and stock movement
        stock = StockLevel.objects.create(
            warehouse=self.wh1,
            product=self.product,
            quantity=15,
            reorder_level=5,
        )
        StockMovement.objects.create(
            stock_level=stock,
            warehouse=self.wh1,
            product=self.product,
            delta=15,
            movement_type="receive",
            reason="Initial shipment",
            reference="PO-001",
            user=self.manager,
            balance_after=15,
        )
        sale = Sale.objects.create(
            sale_number="INV-2026-0001",
            warehouse=self.wh1,
            user=self.staff1,
            total_amount=Decimal("50.00"),
            notes="Cash purchase",
        )
        SaleLine.objects.create(
            sale=sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal("25.00"),
            subtotal=Decimal("50.00"),
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/warehouses/{self.wh1.id}/full-detail/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertIn("warehouse", data)
        self.assertIn("summary", data)
        self.assertIn("staff", data)
        self.assertIn("stock", data)
        self.assertIn("sales", data)
        self.assertIn("ledger", data)

        self.assertEqual(len(data["stock"]), 1)
        self.assertEqual(data["stock"][0]["sku"], "PARA-500")
        self.assertEqual(len(data["sales"]), 1)
        self.assertEqual(data["sales"][0]["sale_number"], "INV-2026-0001")
        self.assertEqual(len(data["ledger"]), 1)
        self.assertEqual(data["ledger"][0]["movement_type"], "receive")

    def test_empty_warehouse_deletion(self):
        # Warehouse with no stock, no sales, no staff can be completely deleted
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f"/api/v1/warehouses/{self.wh_empty.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Warehouse.objects.filter(pk=self.wh_empty.id).exists())

    def test_warehouse_with_staff_or_stock_deactivates_instead_of_delete(self):
        # wh1 has staff assigned
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f"/api/v1/warehouses/{self.wh1.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data.get("deactivated"))

        # Warehouse still exists, but is_active is False
        self.wh1.refresh_from_db()
        self.assertFalse(self.wh1.is_active)

    def test_warehouse_activate_and_deactivate_actions(self):
        self.wh_empty.is_active = False
        self.wh_empty.save()

        self.client.force_authenticate(user=self.admin)
        res_act = self.client.post(f"/api/v1/warehouses/{self.wh_empty.id}/activate/")
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        self.wh_empty.refresh_from_db()
        self.assertTrue(self.wh_empty.is_active)

        res_deact = self.client.post(f"/api/v1/warehouses/{self.wh_empty.id}/deactivate/")
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)
        self.wh_empty.refresh_from_db()
        self.assertFalse(self.wh_empty.is_active)

    def test_user_reset_password_and_activate(self):
        self.client.force_authenticate(user=self.admin)

        # Reset password
        res = self.client.post(
            f"/api/v1/users/{self.staff1.id}/reset-password/",
            {"new_password": "NewSecret@2026"},
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.staff1.refresh_from_db()
        self.assertTrue(self.staff1.check_password("NewSecret@2026"))
        self.assertTrue(self.staff1.must_change_password)

        # Deactivate user first
        self.staff1.is_active = False
        self.staff1.save()

        # Activate user via action
        res_act = self.client.post(f"/api/v1/users/{self.staff1.id}/activate/")
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        self.staff1.refresh_from_db()
        self.assertTrue(self.staff1.is_active)
