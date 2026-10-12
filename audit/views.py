from rest_framework import viewsets, mixins
from .models import AuditLog
from .serializers import AuditLogSerializer
from core.permissions import IsAdmin


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Audit log viewset. Read-only and restricted to Admin only (FRD Permission Matrix).
    """
    queryset = AuditLog.objects.all().select_related("user", "warehouse").order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
