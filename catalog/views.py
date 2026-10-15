from rest_framework import filters, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    ROLE_MANAGER,
    IsStaff,
    get_user_role,
)

from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [IsStaff]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def create(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can create categories.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update categories.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update categories.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can delete categories.")
        category = self.get_object()
        # BR-09: Records that have history are deactivated
        if category.products.exists():
            category.is_active = False
            category.save(update_fields=["is_active"])
            return Response(status=status.HTTP_204_NO_CONTENT)
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.filter(is_active=True).select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [IsStaff]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "sku", "category__name"]
    ordering_fields = ["name", "price", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()
        category_id = self.request.query_params.get("category")
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def create(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can create products.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update products.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if role not in (ROLE_ADMIN, ROLE_MANAGER):
            raise PermissionDenied("Only Admin and Warehouse Managers can update products.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if get_user_role(request.user) != ROLE_ADMIN:
            raise PermissionDenied("Only Admin can delete products.")
        product = self.get_object()
        # BR-09: Products with movements or sales are deactivated, not deleted
        if product.stock_levels.filter(quantity__gt=0).exists() or product.sale_lines.exists():
            product.is_active = False
            product.save(update_fields=["is_active"])
            return Response(status=status.HTTP_204_NO_CONTENT)
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
