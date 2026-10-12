from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import (
    ChangePasswordView,
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    UserViewSet,
)
from audit.views import AuditLogViewSet
from catalog.views import CategoryViewSet, ProductViewSet
from inventory.views import StockLevelViewSet, StockMovementViewSet
from sales.views import SaleViewSet
from transfers.views import StockTransferViewSet
from warehouses.views import WarehouseViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"stock", StockLevelViewSet, basename="stock")
router.register(r"ledger", StockMovementViewSet, basename="ledger")
router.register(r"sales", SaleViewSet, basename="sale")
router.register(r"transfers", StockTransferViewSet, basename="transfer")
router.register(r"audit", AuditLogViewSet, basename="audit")

urlpatterns = [
    # Auth endpoints
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    # Router endpoints under /api/v1/
    path("", include(router.urls)),
]
