from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User, UserProfile
from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.services import receive_stock
from sales.services import create_sale
from warehouses.models import Warehouse


class Command(BaseCommand):
    help = "Seeds initial demo data with Admin, Warehouses, Staff, Catalog, and Stock"

    def handle(self, *args, **options):
        self.stdout.write("Seeding InvLab demo data...")

        with transaction.atomic():
            # 1. Groups
            admin_grp, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
            mgr_grp, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
            staff_grp, _ = Group.objects.get_or_create(name=ROLE_STAFF)

            # 2. Admin User
            admin_user, created = User.objects.get_or_create(
                username="admin",
                defaults={
                    "email": "admin@invlab.local",
                    "first_name": "System",
                    "last_name": "Admin",
                    "is_staff": True,
                    "is_superuser": True,
                },
            )
            admin_user.set_password("Admin@123")
            admin_user.save()
            admin_user.groups.add(admin_grp)

            # 3. Warehouses
            wh_pune, _ = Warehouse.objects.get_or_create(
                code="PUN",
                defaults={
                    "name": "Pune Central Warehouse",
                    "address_line1": "Plot 42, Hinjewadi Phase 1",
                    "city": "Pune",
                    "state": "Maharashtra",
                    "pincode": "411057",
                    "phone": "+91 98230 11223",
                    "email": "pune@invlab.local",
                },
            )

            wh_mumbai, _ = Warehouse.objects.get_or_create(
                code="BOM",
                defaults={
                    "name": "Mumbai Logistics Hub",
                    "address_line1": "Bhiwandi Warehousing Zone, Sector 4",
                    "city": "Mumbai",
                    "state": "Maharashtra",
                    "pincode": "421302",
                    "phone": "+91 98200 44556",
                    "email": "mumbai@invlab.local",
                },
            )

            wh_blr, _ = Warehouse.objects.get_or_create(
                code="BLR",
                defaults={
                    "name": "Bengaluru Tech Depot",
                    "address_line1": "Electronic City Phase 2",
                    "city": "Bengaluru",
                    "state": "Karnataka",
                    "pincode": "560100",
                    "phone": "+91 98450 77889",
                    "email": "blr@invlab.local",
                },
            )

            # 4. Managers
            def create_mgr(username, first, last, wh):
                u, _ = User.objects.get_or_create(
                    username=username,
                    defaults={
                        "email": f"{username}@invlab.local",
                        "first_name": first,
                        "last_name": last,
                        "is_staff": True,
                    },
                )
                u.set_password("Manager@123")
                u.save()
                u.groups.add(mgr_grp)
                profile, _ = UserProfile.objects.get_or_create(user=u)
                profile.warehouse = wh
                profile.save()
                wh.manager = u
                wh.save(update_fields=["manager"])
                return u

            create_mgr("rahul.manager", "Rahul", "Sharma", wh_pune)
            create_mgr("priya.manager", "Priya", "Patel", wh_mumbai)
            create_mgr("vikram.manager", "Vikram", "Rao", wh_blr)

            # 5. Staff
            def create_staff(username, first, last, wh):
                u, _ = User.objects.get_or_create(
                    username=username,
                    defaults={
                        "email": f"{username}@invlab.local",
                        "first_name": first,
                        "last_name": last,
                    },
                )
                u.set_password("Staff@123")
                u.save()
                u.groups.add(staff_grp)
                profile, _ = UserProfile.objects.get_or_create(user=u)
                profile.warehouse = wh
                profile.save()
                return u

            staff_pune = create_staff("arun.staff", "Arun", "Kumar", wh_pune)
            create_staff("sneha.staff", "Sneha", "Deshmukh", wh_mumbai)
            create_staff("kavita.staff", "Kavita", "Nair", wh_blr)

            # 6. Categories
            cat_storage, _ = Category.objects.get_or_create(name="Storage & Racks")
            cat_handling, _ = Category.objects.get_or_create(name="Material Handling")
            cat_pack, _ = Category.objects.get_or_create(name="Packaging & Shipping")
            cat_safety, _ = Category.objects.get_or_create(name="Safety & PPE")

            # 7. Products
            products_data = [
                (
                    "SKU-ST-001",
                    "Heavy Duty Steel Shelving Unit (4-Tier)",
                    cat_storage,
                    "4500.00",
                    5,
                ),
                ("SKU-ST-002", "Industrial Plastic Storage Crate 60L", cat_storage, "650.00", 15),
                ("SKU-MH-001", "Hydraulic Hand Pallet Truck 2500kg", cat_handling, "18500.00", 2),
                ("SKU-MH-002", "Heavy Duty Platform Trolley 300kg", cat_handling, "3200.00", 4),
                (
                    "SKU-PK-001",
                    "Corrugated Shipping Boxes 12x10x8 (Bundle of 25)",
                    cat_pack,
                    "850.00",
                    20,
                ),
                ("SKU-PK-002", "Industrial Stretch Film Roll 500mm", cat_pack, "420.00", 25),
                ("SKU-SF-001", "Industrial Safety Helmet ANSI Z89.1", cat_safety, "380.00", 10),
                ("SKU-SF-002", "High-Visibility Reflective Safety Vest", cat_safety, "190.00", 15),
            ]

            created_products = []
            for sku, name, cat, price, reorder in products_data:
                prod, _ = Product.objects.get_or_create(
                    sku=sku,
                    defaults={
                        "name": name,
                        "category": cat,
                        "price": Decimal(price),
                        "default_reorder_level": reorder,
                    },
                )
                created_products.append(prod)

            # 8. Seed Stock
            # Pune stock
            for prod in created_products:
                receive_stock(wh_pune.id, prod.id, 40, admin_user, "Initial warehouse stock")
                receive_stock(wh_mumbai.id, prod.id, 25, admin_user, "Initial warehouse stock")
                receive_stock(wh_blr.id, prod.id, 30, admin_user, "Initial warehouse stock")

            # 9. Seed a sample sale in Pune
            sample_sale_lines = [
                {"product_id": created_products[0].id, "quantity": 2},
                {"product_id": created_products[4].id, "quantity": 5},
                {"product_id": created_products[6].id, "quantity": 4},
            ]
            create_sale(wh_pune.id, sample_sale_lines, staff_pune, "Counter order #101")

        self.stdout.write(self.style.SUCCESS("Successfully seeded InvLab demo data!"))
        self.stdout.write("Credentials:")
        self.stdout.write("  Admin:    admin / Admin@123")
        self.stdout.write("  Manager:  rahul.manager / Manager@123 (Pune)")
        self.stdout.write("  Staff:    arun.staff / Staff@123 (Pune)")
