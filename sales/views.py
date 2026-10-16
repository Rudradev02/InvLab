from decimal import Decimal

from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.models import BusinessSettings
from core.num_to_words import amount_to_words_inr
from core.permissions import (
    ROLE_ADMIN,
    ROLE_STAFF,
    IsStaff,
    IsWarehouseManager,
    get_user_role,
)
from core.scoping import WarehouseScopeMixin

from .invoice_pdf import generate_invoice_pdf
from .models import Sale, SaleReturn
from .serializers import (
    CreateReturnRequestSerializer,
    CreateSaleRequestSerializer,
    SaleReturnSerializer,
    SaleSerializer,
)
from .services import create_sale, process_sale_return


class SaleViewSet(WarehouseScopeMixin, viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = (
            Sale.objects.all()
            .select_related("warehouse", "user")
            .prefetch_related(
                "lines__product",
                "lines__return_lines",
                "returns__lines__product",
                "returns__processed_by",
            )
        )
        user = self.request.user
        role = get_user_role(user)

        # Scoping
        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(warehouse_id=warehouse_id)
        elif role == ROLE_STAFF:
            # Staff can only view their own sales (FRD Permission Matrix)
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id, user=user)
            else:
                return Sale.objects.none()
        else:
            # Warehouse Manager can view all sales for their warehouse
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id)
            else:
                return Sale.objects.none()

        payment_method = self.request.query_params.get("payment_method")
        if payment_method:
            qs = qs.filter(payment_method=payment_method)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(sale_number__icontains=search)
                | Q(notes__icontains=search)
                | Q(user__username__icontains=search)
                | Q(lines__product__name__icontains=search)
                | Q(lines__product__sku__icontains=search)
            ).distinct()

        return qs

    def update(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records are immutable. Use returns or refunds for corrections.")

    def partial_update(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records are immutable. Use returns or refunds for corrections.")

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Sales records cannot be deleted.")

    def create(self, request, *args, **kwargs):
        idempotency_key = (
            request.headers.get("Idempotency-Key")
            or request.META.get("HTTP_IDEMPOTENCY_KEY")
            or ""
        )
        user = request.user
        role = get_user_role(user)

        if idempotency_key:
            existing = Sale.objects.filter(user=user, idempotency_key=idempotency_key).first()
            if existing:
                return Response(SaleSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = CreateSaleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if role != ROLE_ADMIN:
            warehouse = getattr(getattr(user, "profile", None), "warehouse", None)
            if not warehouse:
                raise PermissionDenied("User is not assigned to any warehouse.")
            if not warehouse.is_active:
                raise PermissionDenied("Cannot record sale in a deactivated warehouse.")
            warehouse_id = warehouse.id
        else:
            warehouse_id = data.get("warehouse_id")
            if not warehouse_id:
                raise PermissionDenied("Admin must specify warehouse_id.")

        sale = create_sale(
            warehouse_id=warehouse_id,
            lines_data=data["lines"],
            user=user,
            notes=data.get("notes", ""),
            idempotency_key=idempotency_key,
            customer_id=data.get("customer_id"),
            amount_paid=data.get("amount_paid"),
            discount_type=data.get("discount_type", "none"),
            discount_value=data.get("discount_value", 0),
            payment_method=data.get("payment_method", "cash"),
            place_of_supply=data.get("place_of_supply"),
            customer_gstin=data.get("customer_gstin"),
        )

        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], permission_classes=[IsStaff])
    def invoice(self, request, pk=None):
        sale = self.get_object()
        biz_settings = BusinessSettings.get_settings()
        customer = sale.customer
        is_interstate = sale.is_interstate

        items = []
        for line in sale.lines.all():
            items.append({
                "id": line.id,
                "product_id": line.product_id,
                "product_name": line.product.name,
                "product_sku": line.product.sku,
                "hsn_code": line.hsn_code or "",
                "quantity": line.quantity,
                "unit_price": str(line.unit_price),
                "subtotal": str(line.subtotal),
                "gst_rate": str(line.gst_rate),
                "taxable_amount": str(line.taxable_amount),
                "cgst_amount": str(line.cgst_amount),
                "sgst_amount": str(line.sgst_amount),
                "igst_amount": str(line.igst_amount),
                "tax_amount": str(line.tax_amount),
                "total_amount": str((line.taxable_amount + line.tax_amount).quantize(Decimal("0.01"))),
            })

        # Aggregated HSN summary
        hsn_map = {}
        for line in sale.lines.all():
            hsn = line.hsn_code or "General"
            rate = str(line.gst_rate)
            key = f"{hsn}_{rate}"
            if key not in hsn_map:
                hsn_map[key] = {
                    "hsn_code": hsn,
                    "gst_rate": rate,
                    "taxable_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "tax_amount": Decimal("0.00"),
                }
            hsn_map[key]["taxable_amount"] += line.taxable_amount
            hsn_map[key]["cgst_amount"] += line.cgst_amount
            hsn_map[key]["sgst_amount"] += line.sgst_amount
            hsn_map[key]["igst_amount"] += line.igst_amount
            hsn_map[key]["tax_amount"] += line.tax_amount

        hsn_summary = [
            {
                "hsn_code": v["hsn_code"],
                "gst_rate": v["gst_rate"],
                "taxable_amount": str(v["taxable_amount"]),
                "cgst_amount": str(v["cgst_amount"]),
                "sgst_amount": str(v["sgst_amount"]),
                "igst_amount": str(v["igst_amount"]),
                "tax_amount": str(v["tax_amount"]),
            }
            for v in hsn_map.values()
        ]

        data = {
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "invoice_number": sale.invoice_number or sale.sale_number,
            "created_at": sale.created_at.isoformat(),
            "seller": {
                "name": biz_settings.name,
                "address_line1": biz_settings.address_line1,
                "address_line2": biz_settings.address_line2,
                "city": biz_settings.city,
                "state": biz_settings.state,
                "pincode": biz_settings.pincode,
                "phone": biz_settings.phone,
                "email": biz_settings.email,
                "gstin": biz_settings.gstin,
                "warehouse_name": sale.warehouse.name,
                "warehouse_code": sale.warehouse.code,
            },
            "buyer": {
                "customer_id": customer.id if customer else None,
                "name": customer.name if customer else "Walk-in Retail Customer",
                "phone": customer.phone if customer else "",
                "email": customer.email if customer else "",
                "address": customer.address if customer else "",
                "gstin": sale.customer_gstin or (customer.gstin if customer else ""),
                "place_of_supply": sale.place_of_supply or biz_settings.state,
            },
            "is_interstate": is_interstate,
            "prices_include_tax": biz_settings.prices_include_tax,
            "items": items,
            "hsn_summary": hsn_summary,
            "financials": {
                "subtotal": str(sale.subtotal),
                "discount_type": sale.discount_type,
                "discount_value": str(sale.discount_value),
                "discount_amount": str(sale.discount_amount),
                "taxable_amount": str(sale.taxable_amount),
                "cgst_amount": str(sale.cgst_amount),
                "sgst_amount": str(sale.sgst_amount),
                "igst_amount": str(sale.igst_amount),
                "total_tax_amount": str(sale.total_tax_amount),
                "round_off_amount": str(sale.round_off_amount),
                "total_amount": str(sale.total_amount),
                "amount_paid": str(sale.amount_paid),
                "balance_due": str(sale.balance_due),
                "payment_method": sale.payment_method,
                "amount_in_words": amount_to_words_inr(sale.total_amount),
            },
        }
        return Response(data)

    @action(detail=True, methods=["get"], url_path="invoice/pdf", permission_classes=[IsStaff])
    def invoice_pdf(self, request, pk=None):
        sale = self.get_object()
        pdf_bytes = generate_invoice_pdf(sale)
        filename = f"invoice-{(sale.invoice_number or sale.sale_number).replace('/', '_')}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["post"], permission_classes=[IsWarehouseManager])
    def return_items(self, request, pk=None):
        sale = self.get_object()
        user = request.user
        role = get_user_role(user)

        if role != ROLE_ADMIN:
            if sale.warehouse_id != user.profile.warehouse_id:
                raise PermissionDenied("You can only process returns for sales belonging to your warehouse.")

        serializer = CreateReturnRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sale_return = process_sale_return(
            sale_id=sale.id,
            items_data=data["lines"],
            user=user,
            reason=data.get("reason", ""),
            refund_method=data.get("refund_method", "cash"),
        )

        return Response(SaleReturnSerializer(sale_return).data, status=status.HTTP_201_CREATED)


class SaleReturnViewSet(WarehouseScopeMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = SaleReturnSerializer
    permission_classes = [IsWarehouseManager]

    def get_queryset(self):
        qs = (
            SaleReturn.objects.all()
            .select_related("warehouse", "sale", "processed_by")
            .prefetch_related("lines__product", "lines__sale_line")
        )
        user = self.request.user
        role = get_user_role(user)

        if role == ROLE_ADMIN:
            warehouse_id = self.request.query_params.get("warehouse")
            if warehouse_id:
                qs = qs.filter(warehouse_id=warehouse_id)
        else:
            profile = getattr(user, "profile", None)
            if profile and profile.warehouse_id:
                qs = qs.filter(warehouse_id=profile.warehouse_id)
            else:
                return SaleReturn.objects.none()

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(return_number__icontains=search)
                | Q(sale__sale_number__icontains=search)
                | Q(reason__icontains=search)
                | Q(lines__product__name__icontains=search)
            ).distinct()

        return qs
