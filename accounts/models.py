from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    must_change_password = models.BooleanField(default=False)

    class Meta:
        db_table = "accounts_user"

    def get_role(self) -> str:
        from core.permissions import get_user_role
        return get_user_role(self) or "Staff"

    def __str__(self):
        return self.username


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    warehouse = models.ForeignKey(
        "warehouses.Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_members",
    )
    phone = models.CharField(max_length=15, blank=True, default="")

    class Meta:
        db_table = "accounts_user_profile"

    def __str__(self):
        wh_name = self.warehouse.name if self.warehouse else "No Warehouse"
        return f"{self.user.username} ({wh_name})"
