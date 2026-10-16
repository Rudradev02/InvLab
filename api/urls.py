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
from customers.views import CustomerViewSet, PaymentViewSet
from purchasing.views import PurchaseOrderViewSet, SupplierViewSet
from sales.views import SaleReturnViewSet, SaleViewSet
from transfers.views import StockTransferViewSet
from warehouses.views import WarehouseViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"warehouses", WarehouseViewSet, basename="warehouse")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"stock", StockLevelViewSet, basename="stock")
router.register(r"ledger", StockMovementViewSet, basename="ledger")
router.register(r"sales", SaleViewSet, basename="sale")
router.register(r"returns", SaleReturnViewSet, basename="return")
router.register(r"transfers", StockTransferViewSet, basename="transfer")
router.register(r"audit", AuditLogViewSet, basename="audit")

from api.dashboard_views import DashboardView
from core.views import BusinessSettingsView

urlpatterns = [
    # Auth endpoints
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    # Dashboard endpoint
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    # Business & GST Settings
    path("business-settings/", BusinessSettingsView.as_view(), name="business-settings"),
    # Reports endpoints
    path("reports/", include("reports.urls")),
    # Router endpoints under /api/v1/
    path("", include(router.urls)),
]
