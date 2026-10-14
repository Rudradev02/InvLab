from django.db import migrations


def setup_roles_and_default_warehouse(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    User = apps.get_model("accounts", "User")
    UserProfile = apps.get_model("accounts", "UserProfile")
    Warehouse = apps.get_model("warehouses", "Warehouse")

    # 1. Create Roles as Django Groups idempotently
    admin_group, _ = Group.objects.get_or_create(name="Admin")
    mgr_group, _ = Group.objects.get_or_create(name="Warehouse Manager")
    staff_group, _ = Group.objects.get_or_create(name="Staff")

    # 2. Create default 'Main Warehouse'
    main_warehouse, _ = Warehouse.objects.get_or_create(
        code="MAIN",
        defaults={
            "name": "Main Warehouse",
            "address_line1": "Headquarters Warehouse, Industrial Estate",
            "city": "Pune",
            "state": "Maharashtra",
            "pincode": "411001",
            "phone": "+91 98000 00000",
            "email": "main@invlab.local",
            "is_active": True,
        },
    )

    # 3. Existing superusers become Admin (no warehouse)
    for superuser in User.objects.filter(is_superuser=True):
        superuser.groups.add(admin_group)
        profile, _ = UserProfile.objects.get_or_create(user=superuser)
        if profile.warehouse_id:
            profile.warehouse = None
            profile.save(update_fields=["warehouse"])

    # 4. Every other existing user becomes Staff in Main Warehouse
    for regular_user in User.objects.filter(is_superuser=False):
        # Only assign Staff if not already in Admin or Manager group
        user_groups = set(regular_user.groups.values_list("name", flat=True))
        if "Admin" not in user_groups and "Warehouse Manager" not in user_groups:
            regular_user.groups.add(staff_group)

        profile, _ = UserProfile.objects.get_or_create(user=regular_user)
        # Assign Main Warehouse only if no warehouse assigned yet
        if not profile.warehouse_id:
            profile.warehouse = main_warehouse
            profile.save(update_fields=["warehouse"])


def reverse_roles_and_warehouse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_alter_user_options"),
        ("warehouses", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(setup_roles_and_default_warehouse, reverse_roles_and_warehouse),
    ]
