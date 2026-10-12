from django.core.management.base import BaseCommand
from django.db.models import Sum

from inventory.models import StockLevel


class Command(BaseCommand):
    help = "Verifies data integrity: for every stock level, sum of movements equals quantity."

    def handle(self, *args, **options):
        self.stdout.write("Checking stock integrity across all warehouses...")

        mismatches = []
        for stock in StockLevel.objects.select_related("warehouse", "product").all():
            movement_sum = stock.movements.aggregate(total=Sum("delta"))["total"] or 0
            if stock.quantity != movement_sum:
                mismatches.append(
                    f"Mismatch for {stock.product.sku} in {stock.warehouse.code}: "
                    f"Quantity={stock.quantity}, MovementSum={movement_sum}"
                )

        if mismatches:
            for m in mismatches:
                self.stderr.write(self.style.ERROR(m))
            raise SystemExit(1)
        else:
            self.stdout.write(self.style.SUCCESS("All stock levels match movement sums perfectly!"))
