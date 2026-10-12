from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    ROLE_STAFF,
    IsStaff,
    get_user_role,
)
from core.scoping import WarehouseScopeMixin

from .models import Sale
from .serializers import CreateSaleRequestSerializer, SaleSerializer
from .services import create_sale


class SaleViewSet(WarehouseScopeMixin, viewsets.ModelViewSet):
    queryset = (
        Sale.objects.all().select_related("warehouse", "user").prefetch_related("lines__product")
    )
    serializer_class = SaleSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)

        # Staff can only view their own sales (FRD Permission Matrix)
        if role == ROLE_STAFF:
            qs = qs.filter(user=user)

        # Manager can view all sales for their warehouse (already handled by WarehouseScopeMixin)
        # Admin can view all
        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreateSaleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            warehouse_id = user.profile.warehouse_id
            if not warehouse_id:
                raise PermissionDenied("User is not assigned to any warehouse.")
        else:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                raise PermissionDenied("Admin must specify warehouse_id.")

        sale = create_sale(
            warehouse_id=warehouse_id,
            lines_data=data["lines"],
            user=user,
            notes=data.get("notes", ""),
        )

        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)
