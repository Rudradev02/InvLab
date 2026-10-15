from django.db import migrations
from django.db.models import Sum


def backfill_main_warehouse_stocklevels(apps, schema_editor):
    Warehouse = apps.get_model("warehouses", "Warehouse")
    Product = apps.get_model("catalog", "Product")
    StockLevel = apps.get_model("inventory", "StockLevel")

    main_wh = Warehouse.objects.filter(code="MAIN").first()
    if not main_wh:
        main_wh = Warehouse.objects.filter(is_active=True).first()
    if not main_wh:
        # Fallback create if no warehouse exists
        main_wh = Warehouse.objects.create(
            name="Main Warehouse",
            code="MAIN",
            address_line1="Default Facility",
            city="Pune",
            state="Maharashtra",
            pincode="411001",
            phone="9999999999",
            is_active=True,
        )

    for p in Product.objects.all():
        sl, created = StockLevel.objects.get_or_create(
            warehouse=main_wh,
            product=p,
            defaults={
                "quantity": getattr(p, "stock", 0) or 0,
                "reorder_level": getattr(p, "default_reorder_level", 5) or 5,
            },
        )
        # Sync product cached stock total
        total = StockLevel.objects.filter(product=p).aggregate(t=Sum("quantity"))["t"] or 0
        Product.objects.filter(pk=p.pk).update(stock=total)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0004_populate_initial_stock_movements"),
        ("catalog", "0002_product_stock"),
        ("warehouses", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_main_warehouse_stocklevels, noop),
    ]
