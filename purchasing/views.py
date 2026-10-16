from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsStaff, IsWarehouseManager, ROLE_ADMIN, get_user_role
from purchasing.models import PurchaseOrder, Supplier
from purchasing.serializers import (
    CreatePurchaseOrderSerializer,
    PurchaseOrderSerializer,
    ReceivePurchaseOrderSerializer,
    SupplierSerializer,
)
from purchasing.services import (
    cancel_purchase_order,
    create_purchase_order,
    mark_purchase_order_as_ordered,
    receive_purchase_order_items,
    update_purchase_order,
)


class SupplierViewSet(viewsets.ModelViewSet):
    """
    CRUD for Suppliers.
    Admins and Managers can create/edit.
    Deletion is prevented if any purchase orders exist.
    """
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "contact_person", "phone", "email", "gstin"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsWarehouseManager()]

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def perform_destroy(self, instance):
        if instance.purchase_orders.exists():
            raise ValidationError(
                f"Cannot delete supplier '{instance.name}' because {instance.purchase_orders.count()} "
                "purchase orders are associated with it. Deactivate the supplier instead."
            )
        instance.delete()


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    CRUD and status workflows for Purchase Orders.
    Managers are scoped to their warehouse; Admins can manage any warehouse.
    """
    queryset = PurchaseOrder.objects.select_related("supplier", "warehouse", "created_by").prefetch_related("lines__product")
    serializer_class = PurchaseOrderSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["po_number", "supplier__name", "notes"]
    ordering_fields = ["order_date", "created_at", "total_amount", "status"]
    ordering = ["-created_at"]

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsWarehouseManager()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)

        # Scoping
        if role != ROLE_ADMIN:
            user_wh = getattr(getattr(user, "profile", None), "warehouse", None)
            if not user_wh:
                return qs.none()
            qs = qs.filter(warehouse=user_wh)
        else:
            wh_param = self.request.query_params.get("warehouse")
            if wh_param:
                qs = qs.filter(warehouse_id=wh_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        supplier_param = self.request.query_params.get("supplier")
        if supplier_param:
            qs = qs.filter(supplier_id=supplier_param)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreatePurchaseOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user_role = get_user_role(request.user)
        user_wh = getattr(getattr(request.user, "profile", None), "warehouse", None)

        # Enforce manager warehouse
        if user_role != ROLE_ADMIN:
            if not user_wh or data["warehouse_id"] != user_wh.id:
                raise PermissionDenied("Warehouse Managers can only create purchase orders for their assigned warehouse.")

        try:
            po = create_purchase_order(
                supplier_id=data["supplier_id"],
                warehouse_id=data["warehouse_id"],
                lines_data=data["lines"],
                user=request.user,
                order_date=data.get("order_date"),
                expected_delivery_date=data.get("expected_delivery_date"),
                notes=data.get("notes", ""),
            )
            out = PurchaseOrderSerializer(po)
            return Response(out.data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            raise ValidationError(e.message if hasattr(e, "message") else e.messages)

    def update(self, request, *args, **kwargs):
        po = self.get_object()
        serializer = CreatePurchaseOrderSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated_po = update_purchase_order(po, serializer.validated_data, request.user)
            out = PurchaseOrderSerializer(updated_po)
            return Response(out.data)
        except DjangoValidationError as e:
            raise ValidationError(e.message if hasattr(e, "message") else e.messages)

    def perform_destroy(self, instance):
        if instance.status != PurchaseOrder.STATUS_DRAFT:
            raise ValidationError("Only draft purchase orders can be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def mark_ordered(self, request, pk=None):
        po = self.get_object()
        try:
            ordered_po = mark_purchase_order_as_ordered(po, request.user)
            return Response(PurchaseOrderSerializer(ordered_po).data)
        except DjangoValidationError as e:
            raise ValidationError(e.message if hasattr(e, "message") else e.messages)

    @action(detail=True, methods=["post"])
    def cancel_order(self, request, pk=None):
        po = self.get_object()
        try:
            cancelled_po = cancel_purchase_order(po, request.user)
            return Response(PurchaseOrderSerializer(cancelled_po).data)
        except DjangoValidationError as e:
            raise ValidationError(e.message if hasattr(e, "message") else e.messages)

    @action(detail=True, methods=["post"])
    def receive_items(self, request, pk=None):
        po = self.get_object()
        serializer = ReceivePurchaseOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            received_po = receive_purchase_order_items(
                po=po,
                receipts=serializer.validated_data["receipts"],
                user=request.user,
            )
            return Response(PurchaseOrderSerializer(received_po).data)
        except DjangoValidationError as e:
            raise ValidationError(e.message if hasattr(e, "message") else e.messages)
