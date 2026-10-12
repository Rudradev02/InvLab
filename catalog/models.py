from django.db import models

from core.models import TimestampedModel


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
    default_reorder_level = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "catalog_product"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"
