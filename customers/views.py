from decimal import Decimal

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.permissions import (
    ROLE_ADMIN,
    IsStaff,
    IsWarehouseManager,
    get_user_role,
)
from sales.serializers import SaleSerializer

from .models import Customer, Payment
from .serializers import (
    CustomerSerializer,
    PaymentSerializer,
    RecordPaymentRequestSerializer,
)
from .services import (
    get_customer_summary,
    get_receivables_total,
    record_customer_payment,
)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = Customer.objects.all().prefetch_related("sales")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(gstin__icontains=search)
            )

        has_balance = self.request.query_params.get("has_balance")
        if has_balance == "true":
            qs = qs.filter(sales__balance_due__gt=0).distinct()

        return qs

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        if customer.sales.exists():
            raise PermissionDenied(
                "A customer with purchase history cannot be deleted. You can deactivate them instead."
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        customer = self.get_object()
        return Response(get_customer_summary(customer))

    @action(detail=True, methods=["get"])
    def sales(self, request, pk=None):
        customer = self.get_object()
        sales_qs = customer.sales.all().select_related("warehouse", "user").prefetch_related("lines__product")
        return Response(SaleSerializer(sales_qs, many=True).data)

    @action(detail=True, methods=["get"])
    def payments(self, request, pk=None):
        customer = self.get_object()
        payments_qs = customer.payments.all().select_related("warehouse", "user", "sale")
        return Response(PaymentSerializer(payments_qs, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsStaff])
    def record_payment(self, request, pk=None):
        customer = self.get_object()
        serializer = RecordPaymentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        role = get_user_role(user)

        if role == ROLE_ADMIN:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                # default to first warehouse or profile
                warehouse_id = getattr(getattr(user, "profile", None), "warehouse_id", None)
                if not warehouse_id:
                    from warehouses.models import Warehouse
                    wh = Warehouse.objects.filter(is_active=True).first()
                    warehouse_id = wh.id if wh else None
        else:
            profile = getattr(user, "profile", None)
            warehouse_id = profile.warehouse_id if profile else None

        if not warehouse_id:
            raise PermissionDenied("A valid warehouse is required to record payment.")

        payment = record_customer_payment(
            customer_id=customer.id,
            amount=data["amount"],
            warehouse_id=warehouse_id,
            user=user,
            payment_method=data.get("payment_method", "cash"),
            notes=data.get("notes", ""),
        )

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], permission_classes=[IsWarehouseManager])
    def receivables(self, request):
        user = request.user
        role = get_user_role(user)
        warehouse_id = None
        if role != ROLE_ADMIN:
            profile = getattr(user, "profile", None)
            if profile:
                warehouse_id = profile.warehouse_id
        else:
            wh_param = request.query_params.get("warehouse")
            if wh_param:
                warehouse_id = int(wh_param)

        total = get_receivables_total(warehouse_id=warehouse_id)
        return Response({"total_receivables": f"{Decimal(total):.2f}"})


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = Payment.objects.all().select_related("customer", "warehouse", "user", "sale")
        user = self.request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(payment_number__icontains=search)
                | Q(customer__name__icontains=search)
                | Q(customer__phone__icontains=search)
                | Q(notes__icontains=search)
            )

        return qs
