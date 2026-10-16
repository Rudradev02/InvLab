from django.conf import settings
from django.conf.urls.static import static
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
    # SPA catch-all fallback (excludes api, admin, healthz, static, and media)
    re_path(r"^(?!api/|admin/|healthz/|static/|media/).*$", spa_index_view, name="spa-index"),
]

# Serve media files in development (when using local storage)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

