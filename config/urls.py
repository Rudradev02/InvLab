from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import healthz_view, spa_index_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz/", healthz_view, name="healthz"),
    # OpenAPI 3 Schema & Swagger UI
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # API v1
    path("api/v1/", include("api.urls")),
    # SPA catch-all fallback
    re_path(r"^(?!api/|admin/|healthz/|static/).*$", spa_index_view, name="spa-index"),
]
