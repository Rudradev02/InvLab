from django.conf import settings
from django.db import migrations


def populate_initial_movements(apps, schema_editor):
    StockLevel = apps.get_model("inventory", "StockLevel")
    StockMovement = apps.get_model("inventory", "StockMovement")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))

    user = User.objects.filter(is_superuser=True).first() or User.objects.first()
    if not user:
        return

    for sl in StockLevel.objects.all():
        if not StockMovement.objects.filter(stock_level=sl).exists():
            StockMovement.objects.create(
                stock_level=sl,
                warehouse=sl.warehouse,
                product=sl.product,
                delta=sl.quantity,
                movement_type="initial",
                reason="Initial inventory balance",
                reference="INITIAL-MIGRATION",
                user=user,
                balance_after=sl.quantity,
            )


def reverse_initial_movements(apps, schema_editor):
    StockMovement = apps.get_model("inventory", "StockMovement")
    StockMovement.objects.filter(movement_type="initial", reference="INITIAL-MIGRATION").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0003_stockmovement_balance_after_stockmovement_reason_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(populate_initial_movements, reverse_initial_movements),
    ]
