from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Category, Product
from core.exceptions import InsufficientStockError
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel
from inventory.services import adjust_stock, receive_stock
from sales.services import create_sale
from warehouses.models import Warehouse


class InvLabCoreApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.mgr_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Warehouses
        self.wh_pune = Warehouse.objects.create(
            name="Pune Central Warehouse",
            code="PUN",
            address_line1="Plot 42",
            city="Pune",
            state="Maharashtra",
            pincode="411057",
            phone="9823011223",
        )
        self.wh_mumbai = Warehouse.objects.create(
            name="Mumbai Hub",
            code="BOM",
            address_line1="Bhiwandi Sector 4",
            city="Mumbai",
            state="Maharashtra",
            pincode="421302",
            phone="9820044556",
        )

        # Admin user
        self.admin_user = User.objects.create_user(
            username="test_admin", password="Password@123", is_superuser=True, is_staff=True
        )
        self.admin_user.groups.add(self.admin_group)

        # Manager user (Pune)
        self.mgr_pune = User.objects.create_user(
            username="test_mgr", password="Password@123", is_staff=True
        )
        self.mgr_pune.groups.add(self.mgr_group)
        self.mgr_pune.profile.warehouse = self.wh_pune
        self.mgr_pune.profile.save()
        self.wh_pune.manager = self.mgr_pune
        self.wh_pune.save()

        # Staff user (Pune)
        self.staff_pune = User.objects.create_user(username="test_staff", password="Password@123")
        self.staff_pune.groups.add(self.staff_group)
        self.staff_pune.profile.warehouse = self.wh_pune
        self.staff_pune.profile.save()

        # Catalog & Product
        self.category = Category.objects.create(name="Storage & Racks")
        self.product = Product.objects.create(
            sku="SKU-TEST-01",
            name="Test Shelving Unit",
            category=self.category,
            price=Decimal("1500.00"),
            default_reorder_level=5,
        )

    def test_healthz_endpoint(self):
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "healthy")
        self.assertEqual(response.json()["database"], "ok")

    def test_csrf_endpoint(self):
        response = self.client.get(reverse("auth-csrf"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrfToken", response.json())

    def test_login_and_me(self):
        response = self.client.post(
            reverse("auth-login"),
            {"username": "test_staff", "password": "Password@123"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["username"], "test_staff")
        self.assertEqual(data["role"], ROLE_STAFF)

        # me endpoint
        me_resp = self.client.get(reverse("auth-me"))
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(me_resp.json()["username"], "test_staff")

    def test_warehouse_scoping_staff_cannot_see_other_warehouse(self):
        # Staff is in Pune. Should only see Pune warehouse
        self.client.force_authenticate(user=self.staff_pune)
        response = self.client.get(reverse("warehouse-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["code"], "PUN")

        # Looking up Mumbai should return 404
        detail_resp = self.client.get(reverse("warehouse-detail", args=[self.wh_mumbai.id]))
        self.assertEqual(detail_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_permissions_staff_cannot_create_product_manager_can(self):
        # Staff attempts to create product -> 403 Forbidden
        self.client.force_authenticate(user=self.staff_pune)
        resp_staff = self.client.post(
            reverse("product-list"),
            {
                "sku": "SKU-UNAUTH",
                "name": "Unauthorized Item",
                "category": self.category.id,
                "price": "500.00",
            },
        )
        self.assertEqual(resp_staff.status_code, status.HTTP_403_FORBIDDEN)

        # Manager creates product -> 201 Created
        self.client.force_authenticate(user=self.mgr_pune)
        resp_mgr = self.client.post(
            reverse("product-list"),
            {
                "sku": "SKU-AUTH",
                "name": "Authorized Item",
                "category": self.category.id,
                "price": "500.00",
            },
        )
        self.assertEqual(resp_mgr.status_code, status.HTTP_201_CREATED)

    def test_stock_receive_adjust_and_integrity(self):
        # Receive 20 units
        stock = receive_stock(
            warehouse_id=self.wh_pune.id,
            product_id=self.product.id,
            quantity=20,
            user=self.staff_pune,
        )
        self.assertEqual(stock.quantity, 20)
        self.assertEqual(stock.movements.count(), 1)

        # Adjust -5 units
        stock = adjust_stock(
            warehouse_id=self.wh_pune.id,
            product_id=self.product.id,
            delta=-5,
            user=self.staff_pune,
        )
        self.assertEqual(stock.quantity, 15)
        self.assertEqual(stock.movements.count(), 2)

        # Negative adjust exceeding stock raises InsufficientStockError
        with self.assertRaises(InsufficientStockError):
            adjust_stock(
                warehouse_id=self.wh_pune.id,
                product_id=self.product.id,
                delta=-20,
                user=self.staff_pune,
            )

    def test_create_sale_atomicity_and_shortage_error(self):
        # Receive 10 units
        receive_stock(
            warehouse_id=self.wh_pune.id,
            product_id=self.product.id,
            quantity=10,
            user=self.staff_pune,
        )

        # Sale of 4 units
        sale = create_sale(
            warehouse_id=self.wh_pune.id,
            lines_data=[{"product_id": self.product.id, "quantity": 4}],
            user=self.staff_pune,
        )
        self.assertEqual(sale.total_amount, Decimal("6000.00"))  # 4 * 1500

        stock = StockLevel.objects.get(warehouse=self.wh_pune, product=self.product)
        self.assertEqual(stock.quantity, 6)

        # Sale exceeding remaining 6 units raises InsufficientStockError
        with self.assertRaises(InsufficientStockError):
            create_sale(
                warehouse_id=self.wh_pune.id,
                lines_data=[{"product_id": self.product.id, "quantity": 10}],
                user=self.staff_pune,
            )
        # Verify stock remains unchanged at 6
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 6)

    def test_all_api_endpoints_have_explicit_permissions(self):
        """
        Guard test: walks all API URL patterns and asserts every APIView/ViewSet
        has explicit, non-empty permission_classes defined on the view class.
        """
        from django.urls import get_resolver
        from rest_framework.views import APIView

        resolver = get_resolver()
        checked_views = set()

        def inspect_patterns(patterns):
            for pattern in patterns:
                if hasattr(pattern, "url_patterns"):
                    inspect_patterns(pattern.url_patterns)
                elif hasattr(pattern, "callback"):
                    callback = pattern.callback
                    view_class = getattr(callback, "cls", None)
                    if view_class and issubclass(view_class, APIView):
                        if view_class not in checked_views:
                            checked_views.add(view_class)
                            self.assertTrue(
                                hasattr(view_class, "permission_classes")
                                and view_class.permission_classes is not None
                                and len(view_class.permission_classes) > 0,
                                f"View {view_class.__name__} has no explicit permission_classes configured.",
                            )

        inspect_patterns(resolver.url_patterns)
        self.assertGreater(len(checked_views), 5, "Should have checked multiple API views.")

    def test_last_admin_cannot_be_demoted_or_deactivated(self):
        """
        Edge case: the last active Admin cannot be demoted or deactivated.
        """
        # Ensure self.admin_user is the sole active admin
        User.objects.filter(groups__name=ROLE_ADMIN).exclude(id=self.admin_user.id).delete()

        self.client.force_login(self.admin_user)
        # Attempt to demote to Staff
        res = self.client.patch(
            f"/api/v1/users/{self.admin_user.id}/",
            {"role_name": ROLE_STAFF},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to deactivate
        res = self.client.delete(f"/api/v1/users/{self.admin_user.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_change_own_role(self):
        """
        Edge case: nobody can change their own role.
        """
        # Create a second admin so last-admin check doesn't trigger first
        admin2 = User.objects.create_user(username="admin2", password="Password@123", is_staff=True)
        admin2.groups.add(self.admin_group)

        self.client.force_login(self.admin_user)
        res = self.client.patch(
            f"/api/v1/users/{self.admin_user.id}/",
            {"role_name": ROLE_MANAGER},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unassigned_non_admin_blocked_with_clear_message(self):
        """
        Edge case: a non-Admin without a warehouse is blocked with a clear message.
        """
        unassigned_staff = User.objects.create_user(
            username="unassigned_user", password="Password@123"
        )
        unassigned_staff.groups.add(self.staff_group)
        # Ensure no warehouse
        unassigned_staff.profile.warehouse = None
        unassigned_staff.profile.save()

        self.client.force_login(unassigned_staff)
        res = self.client.get("/api/v1/stock/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("active warehouse", res.json()["error"]["message"])

    def test_auth_me_returns_role_permissions_and_warehouse(self):
        """
        Verify /auth/me/ returns role, permissions, and warehouse.
        """
        self.client.force_login(self.mgr_pune)
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["role"], ROLE_MANAGER)
        self.assertIn("warehouse", data)
        self.assertEqual(data["warehouse"]["code"], "PUN")
        self.assertIn("permissions", data)
        self.assertIsInstance(data["permissions"], list)

