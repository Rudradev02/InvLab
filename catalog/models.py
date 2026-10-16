from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from core.models import TimestampedModel
from .image_utils import generate_thumbnail, safe_delete_storage_file, validate_product_image


class Category(TimestampedModel):
    name = models.CharField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_category"
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(TimestampedModel):
    sku = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=160, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Weighted average unit cost price",
    )
    stock = models.IntegerField(
        default=0,
        help_text="DEPRECATED: Cached sum of warehouse stock levels. Use StockLevel for active inventory.",
    )
    default_reorder_level = models.PositiveIntegerField(default=5)
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.00,
        help_text="GST percentage rate, e.g. 0.00, 5.00, 12.00, 18.00, 28.00",
    )
    hsn_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Harmonized System of Nomenclature code",
    )
    barcode = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional barcode or QR code string (UPC, EAN, Code128, etc.)",
    )
    image = models.ImageField(
        upload_to="products/images/",
        null=True,
        blank=True,
        max_length=500,
        validators=[validate_product_image],
        help_text="Optional product image (JPEG, PNG, WebP up to 2 MB)",
    )
    thumbnail = models.ImageField(
        upload_to="products/thumbnails/",
        null=True,
        blank=True,
        max_length=500,
        help_text="Auto-generated thumbnail (WebP 240x240)",
    )
    is_active = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        if self.barcode is not None:
            stripped = self.barcode.strip()
            self.barcode = stripped if stripped else None
        if self.image:
            validate_product_image(self.image)

    def save(self, *args, **kwargs):
        if self.barcode is not None:
            stripped = self.barcode.strip()
            self.barcode = stripped if stripped else None

        # Detect image changes to generate thumbnail and clean up old files
        old_image_to_delete = None
        old_thumb_to_delete = None
        image_changed = False

        if self.pk:
            orig = Product.objects.filter(pk=self.pk).only("image", "thumbnail").first()
            if orig:
                if orig.image and orig.image != self.image:
                    old_image_to_delete = orig.image
                    old_thumb_to_delete = orig.thumbnail
                    image_changed = True
                elif not self.image and orig.thumbnail:
                    old_thumb_to_delete = orig.thumbnail
                    self.thumbnail = None
        else:
            if self.image:
                image_changed = True

        # Generate thumbnail whenever a new or replaced image is provided
        if self.image and (image_changed or not self.thumbnail):
            try:
                thumb_file = generate_thumbnail(self.image)
                self.thumbnail.save(thumb_file.name, thumb_file, save=False)
            except Exception:
                # If thumbnail generation fails, save the product without crashing
                pass

        super().save(*args, **kwargs)

        # Safely remove superseded files from storage
        if old_image_to_delete:
            safe_delete_storage_file(old_image_to_delete)
        if old_thumb_to_delete:
            safe_delete_storage_file(old_thumb_to_delete)

    class Meta:
        db_table = "catalog_product"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"


@receiver(post_delete, sender=Product)
def cleanup_product_images_on_delete(sender, instance, **kwargs):
    """
    Remove orphaned product image and thumbnail from storage when Product is deleted.
    """
    safe_delete_storage_file(instance.image)
    safe_delete_storage_file(instance.thumbnail)

