import io
import os
import shutil
import tempfile
from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from warehouses.models import Warehouse

User = get_user_model()
TEMP_MEDIA_ROOT = tempfile.mkdtemp()


def create_test_image(format="JPEG", size=(200, 200), color="blue"):
    file_io = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(file_io, format=format)
    file_io.seek(0)
    ext = "jpg" if format == "JPEG" else format.lower()
    return SimpleUploadedFile(f"test_image.{ext}", file_io.read(), content_type=f"image/{ext}")


@override_settings(
    MEDIA_ROOT=TEMP_MEDIA_ROOT,
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    STORAGES={
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    },
)
class ProductImageTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        from django.contrib.auth.models import Group

        self.category = Category.objects.create(name="Electronics")
        self.warehouse = Warehouse.objects.create(name="Main WH", code="MWH")

        admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Admin user
        self.admin = User.objects.create_user(username="admin_user", password="Password123")
        self.admin.groups.add(admin_group)

        # Manager user
        self.manager = User.objects.create_user(username="mgr_user", password="Password123")
        self.manager.groups.add(manager_group)
        self.manager.profile.warehouse = self.warehouse
        self.manager.profile.save()

        # Staff user
        self.staff = User.objects.create_user(username="staff_user", password="Password123")
        self.staff.groups.add(staff_group)
        self.staff.profile.warehouse = self.warehouse
        self.staff.profile.save()

        self.client = APIClient()

    def test_upload_valid_jpeg_generates_thumbnail(self):
        """Admin uploads valid JPEG image -> thumbnail is auto-generated."""
        self.client.force_authenticate(user=self.admin)
        image = create_test_image(format="JPEG", size=(400, 300))

        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-JPG-01",
                "name": "Wireless Mouse",
                "category": self.category.id,
                "price": "599.00",
                "image": image,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("image", response.data)
        self.assertIn("thumbnail", response.data)
        self.assertIsNotNone(response.data["image"])
        self.assertIsNotNone(response.data["thumbnail"])

        product = Product.objects.get(sku="PROD-JPG-01")
        self.assertTrue(bool(product.image))
        self.assertTrue(bool(product.thumbnail))
        self.assertTrue(os.path.exists(product.image.path))
        self.assertTrue(os.path.exists(product.thumbnail.path))

    def test_upload_valid_webp_and_png(self):
        """Supports WebP and PNG formats."""
        self.client.force_authenticate(user=self.admin)

        for fmt in ["PNG", "WEBP"]:
            img = create_test_image(format=fmt, size=(300, 300))
            response = self.client.post(
                "/api/v1/products/",
                {
                    "sku": f"PROD-{fmt}",
                    "name": f"Item {fmt}",
                    "category": self.category.id,
                    "price": "99.00",
                    "image": img,
                },
                format="multipart",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            product = Product.objects.get(sku=f"PROD-{fmt}")
            self.assertTrue(bool(product.image))
            self.assertTrue(bool(product.thumbnail))

    def test_reject_oversized_image(self):
        """Files larger than 2 MB are rejected."""
        self.client.force_authenticate(user=self.admin)
        # Create a real, valid JPEG that exceeds 2 MB
        noise = os.urandom(1500 * 1500 * 3)
        img = Image.frombytes("RGB", (1500, 1500), noise)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        buf.seek(0)
        large_file = SimpleUploadedFile("big.jpg", buf.read(), content_type="image/jpeg")

        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-BIG",
                "name": "Big Image Product",
                "category": self.category.id,
                "price": "100.00",
                "image": large_file,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.data.get("fields") or response.data.get("error", {}).get("fields", {})
        self.assertIn("image", fields)
        self.assertIn("exceeds the 2 MB limit", str(fields["image"]))

    def test_reject_fake_image_file(self):
        """A text/script file disguised as a .jpg is rejected by Pillow verification."""
        self.client.force_authenticate(user=self.admin)
        fake_content = b"<?php echo 'malicious script'; ?>"
        fake_file = SimpleUploadedFile("malware.jpg", fake_content, content_type="image/jpeg")

        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-FAKE",
                "name": "Fake Image Product",
                "category": self.category.id,
                "price": "100.00",
                "image": fake_file,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.data.get("fields") or response.data.get("error", {}).get("fields", {})
        self.assertIn("image", fields)

    def test_reject_unsupported_image_format(self):
        """Formats other than JPEG, PNG, WEBP (e.g. GIF or BMP) are rejected."""
        self.client.force_authenticate(user=self.admin)
        file_io = io.BytesIO()
        img = Image.new("RGB", (100, 100), color="red")
        img.save(file_io, format="GIF")
        file_io.seek(0)
        gif_file = SimpleUploadedFile("test.gif", file_io.read(), content_type="image/gif")

        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-GIF",
                "name": "GIF Product",
                "category": self.category.id,
                "price": "100.00",
                "image": gif_file,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.data.get("fields") or response.data.get("error", {}).get("fields", {})
        self.assertIn("image", fields)
        self.assertIn("Unsupported image format", str(fields["image"]))

    def test_image_replacement_cleans_up_old_files(self):
        """Updating an existing product with a new image deletes the old image and thumbnail."""
        self.client.force_authenticate(user=self.admin)
        initial_image = create_test_image(format="JPEG", size=(200, 200), color="blue")
        product = Product.objects.create(
            sku="PROD-REPLACE",
            name="Replace Test",
            category=self.category,
            price="150.00",
            image=initial_image,
        )
        old_image_path = product.image.path
        old_thumb_path = product.thumbnail.path
        self.assertTrue(os.path.exists(old_image_path))
        self.assertTrue(os.path.exists(old_thumb_path))

        # Replace image via PATCH
        new_image = create_test_image(format="PNG", size=(300, 300), color="green")
        response = self.client.patch(
            f"/api/v1/products/{product.id}/",
            {"image": new_image},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        product.refresh_from_db()
        # Old files must be gone
        self.assertFalse(os.path.exists(old_image_path))
        self.assertFalse(os.path.exists(old_thumb_path))
        # New files must exist
        self.assertTrue(os.path.exists(product.image.path))
        self.assertTrue(os.path.exists(product.thumbnail.path))

    def test_image_deletion_on_product_delete(self):
        """Deleting a product cleans up its image and thumbnail files from storage."""
        self.client.force_authenticate(user=self.admin)
        image = create_test_image(format="JPEG", size=(200, 200), color="yellow")
        product = Product.objects.create(
            sku="PROD-DELETE-ME",
            name="Delete Me",
            category=self.category,
            price="10.00",
            image=image,
        )
        image_path = product.image.path
        thumb_path = product.thumbnail.path
        self.assertTrue(os.path.exists(image_path))
        self.assertTrue(os.path.exists(thumb_path))

        # Admin deletes product
        response = self.client.delete(f"/api/v1/products/{product.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.assertFalse(os.path.exists(image_path))
        self.assertFalse(os.path.exists(thumb_path))

    def test_role_based_permissions(self):
        """Warehouse Manager can upload images; Staff cannot."""
        # Manager: allowed
        self.client.force_authenticate(user=self.manager)
        mgr_img = create_test_image()
        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-MGR",
                "name": "Manager Product",
                "category": self.category.id,
                "price": "200.00",
                "image": mgr_img,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Staff: forbidden from creating or updating
        self.client.force_authenticate(user=self.staff)
        staff_img = create_test_image()
        response = self.client.post(
            "/api/v1/products/",
            {
                "sku": "PROD-STAFF",
                "name": "Staff Product",
                "category": self.category.id,
                "price": "200.00",
                "image": staff_img,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Staff CAN read product list and see image/thumbnail
        get_list_response = self.client.get("/api/v1/products/")
        self.assertEqual(get_list_response.status_code, status.HTTP_200_OK)
        first_prod = get_list_response.data["results"][0]
        self.assertIn("image", first_prod)
        self.assertIn("thumbnail", first_prod)
