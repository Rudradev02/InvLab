from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.permissions import ROLE_STAFF
from catalog.models import Category, Product
from catalog.serializers import ProductSerializer

User = get_user_model()


class BarcodeModelAndSerializerTestCase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Electronics")

    def test_barcode_whitespace_trimming_and_null_storage(self):
        # Blank should become None
        p1 = Product.objects.create(
            name="Item 1",
            sku="SKU-001",
            price=Decimal("10.00"),
            category=self.category,
            barcode="   ",
        )
        self.assertIsNone(p1.barcode)

        # Whitespace trimmed
        p2 = Product.objects.create(
            name="Item 2",
            sku="SKU-002",
            price=Decimal("20.00"),
            category=self.category,
            barcode="  8901234567890  ",
        )
        self.assertEqual(p2.barcode, "8901234567890")

    def test_multiple_products_can_have_null_or_blank_barcode(self):
        p1 = Product.objects.create(
            name="Null 1",
            sku="SKU-N1",
            price=Decimal("10.00"),
            category=self.category,
            barcode=None,
        )
        p2 = Product.objects.create(
            name="Null 2",
            sku="SKU-N2",
            price=Decimal("20.00"),
            category=self.category,
            barcode="",
        )
        self.assertIsNone(p1.barcode)
        self.assertIsNone(p2.barcode)

    def test_duplicate_barcode_raises_integrity_error(self):
        Product.objects.create(
            name="First",
            sku="SKU-F1",
            price=Decimal("10.00"),
            category=self.category,
            barcode="123456789",
        )
        with self.assertRaises(IntegrityError):
            Product.objects.create(
                name="Second",
                sku="SKU-S2",
                price=Decimal("20.00"),
                category=self.category,
                barcode="123456789",
            )

    def test_serializer_duplicate_barcode_validation(self):
        Product.objects.create(
            name="Existing Widget",
            sku="WIDGET-01",
            price=Decimal("50.00"),
            category=self.category,
            barcode="BARCODE-999",
        )

        serializer = ProductSerializer(
            data={
                "name": "New Widget",
                "sku": "WIDGET-02",
                "price": "60.00",
                "category": self.category.id,
                "barcode": "BARCODE-999",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("barcode", serializer.errors)
        error_msg = str(serializer.errors["barcode"][0])
        self.assertIn("Existing Widget", error_msg)
        self.assertIn("WIDGET-01", error_msg)
        self.assertIn("BARCODE-999", error_msg)

    def test_serializer_update_same_product_retains_barcode(self):
        product = Product.objects.create(
            name="Widget",
            sku="WIDGET-10",
            price=Decimal("50.00"),
            category=self.category,
            barcode="BARCODE-123",
        )
        serializer = ProductSerializer(
            instance=product,
            data={
                "name": "Widget Updated",
                "sku": "WIDGET-10",
                "price": "55.00",
                "category": self.category.id,
                "barcode": "BARCODE-123",
            },
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class BarcodeApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)
        self.staff_user = User.objects.create_user(
            username="staff_bar", password="password123"
        )
        self.staff_user.groups.add(self.staff_group)
        self.client.force_authenticate(user=self.staff_user)

        self.category = Category.objects.create(name="Snacks")
        self.biscuit = Product.objects.create(
            name="Parle-G Biscuit",
            sku="PARLE-G-100G",
            price=Decimal("10.00"),
            category=self.category,
            barcode="8901719101014",
        )
        self.tea = Product.objects.create(
            name="Tata Tea Gold",
            sku="TATA-TEA-250G",
            price=Decimal("150.00"),
            category=self.category,
            barcode="8901058852378",
        )

    def test_lookup_barcode_success(self):
        res = self.client.get("/api/v1/products/lookup-barcode/?barcode=8901719101014")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.biscuit.id)
        self.assertEqual(res.data["name"], "Parle-G Biscuit")

    def test_lookup_barcode_by_sku_fallback(self):
        # Retail scanners scanning SKU
        res = self.client.get("/api/v1/products/lookup-barcode/?barcode=TATA-TEA-250G")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.tea.id)

    def test_lookup_barcode_not_found(self):
        res = self.client.get("/api/v1/products/lookup-barcode/?barcode=UNKNOWN999")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("detail", res.data)
        self.assertIn("UNKNOWN999", res.data["detail"])

    def test_lookup_barcode_missing_param(self):
        res = self.client.get("/api/v1/products/lookup-barcode/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_product_list_by_barcode(self):
        res = self.client.get("/api/v1/products/?barcode=8901058852378")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Tata Tea Gold")

    def test_search_product_list_by_barcode(self):
        res = self.client.get("/api/v1/products/?search=8901719101014")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Parle-G Biscuit")
