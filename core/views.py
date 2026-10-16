import logging

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse

logger = logging.getLogger(__name__)


def healthz_view(request):
    """
    Health check endpoint: returns 200 without authentication
    and confirms database connectivity.
    """
    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as e:
        logger.error("Health check database failure: %s", e)
        db_ok = False

    status_code = 200 if db_ok else 503
    return JsonResponse(
        {
            "status": "healthy" if db_ok else "unhealthy",
            "database": "ok" if db_ok else "down",
        },
        status=status_code,
    )


def spa_index_view(request):
    """
    Serves the SPA index.html for client-side routing fallback.
    """
    index_path = settings.BASE_DIR / "frontend" / "dist" / "index.html"
    if index_path.exists():
        with open(index_path, "r", encoding="utf-8") as f:
            return HttpResponse(f.read(), content_type="text/html")
    return HttpResponse(
        "<html><body><h1>InvLab Backend</h1><p>Frontend SPA bundle not yet built. Run <code>npm run build</code> in frontend directory.</p></body></html>",
        content_type="text/html",
    )


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from core.permissions import IsStaff, get_user_role, ROLE_ADMIN
from .models import BusinessSettings
from .serializers import BusinessSettingsSerializer


class BusinessSettingsView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        settings = BusinessSettings.get_settings()
        serializer = BusinessSettingsSerializer(settings)
        return Response(serializer.data)

    def put(self, request):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can update business settings.")
        settings = BusinessSettings.get_settings()
        serializer = BusinessSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        return self.put(request)

