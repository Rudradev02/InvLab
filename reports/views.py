from datetime import datetime
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsWarehouseManager, ROLE_ADMIN, get_user_role
from reports.exporters.csv_exporter import stream_csv_rows
from reports.exporters.excel_exporter import export_to_excel
from reports.exporters.pdf_exporter import export_to_pdf
import reports.generators  # noqa: F401 - ensures all reports are registered
from reports.registry import registry
from warehouses.models import Warehouse
from catalog.models import Category


class ReportListView(APIView):
    """
    Lists all available registered reports with metadata.
    Accessible to Admins and Warehouse Managers.
    """
    permission_classes = [IsAuthenticated, IsWarehouseManager]

    def get(self, request):
        return Response(registry.list_reports())


class ReportDetailView(APIView):
    """
    Generates and exports a specific report by report_id.
    Query parameters:
      - date_from (YYYY-MM-DD)
      - date_to (YYYY-MM-DD)
      - warehouse (integer ID, Admin only; Managers are locked to their own)
      - category (integer ID)
      - format (json, csv, xlsx, pdf)
    """
    permission_classes = [IsAuthenticated, IsWarehouseManager]

    def perform_content_negotiation(self, request, force=False):
        """
        Bypass DRF's format-suffix / ?format= query param negotiation which
        causes 404s for custom file export formats (csv, xlsx, pdf).
        """
        renderers = self.get_renderers()
        return (renderers[0], renderers[0].media_type)

    def get(self, request, report_id: str):
        report = registry.get(report_id)
        if not report:
            raise NotFound(detail=f"Report '{report_id}' not found.")

        # Permissions and Scoping
        user_role = get_user_role(request.user)
        user_warehouse = getattr(getattr(request.user, "profile", None), "warehouse", None)

        requested_warehouse_id = request.query_params.get("warehouse")
        effective_warehouse_id = None
        warehouse_name = "All Warehouses"

        if user_role != ROLE_ADMIN:
            # Manager is strictly scoped to their assigned warehouse
            if not user_warehouse:
                raise PermissionDenied("You are not assigned to any warehouse.")
            if requested_warehouse_id and int(requested_warehouse_id) != user_warehouse.id:
                raise PermissionDenied("Warehouse Managers can only generate reports for their assigned warehouse.")
            effective_warehouse_id = user_warehouse.id
            warehouse_name = f"{user_warehouse.name} ({user_warehouse.code})"
        else:
            if requested_warehouse_id:
                try:
                    w = Warehouse.objects.get(id=int(requested_warehouse_id))
                    effective_warehouse_id = w.id
                    warehouse_name = f"{w.name} ({w.code})"
                except Warehouse.DoesNotExist:
                    raise NotFound(detail=f"Warehouse ID {requested_warehouse_id} does not exist.")

        # Category filter lookup
        category_id = request.query_params.get("category")
        category_name = "All Categories"
        if category_id:
            try:
                cat = Category.objects.get(id=int(category_id))
                category_name = cat.name
            except Category.DoesNotExist:
                raise NotFound(detail=f"Category ID {category_id} does not exist.")

        # Build filter dictionary
        filters = {
            "date_from": request.query_params.get("date_from"),
            "date_to": request.query_params.get("date_to"),
            "warehouse": effective_warehouse_id,
            "warehouse_name": warehouse_name,
            "category": int(category_id) if category_id else None,
            "category_name": category_name,
        }

        # Generate report data
        data = report.generate(user=request.user, filters=filters)

        export_format = request.query_params.get("format", "json").lower()
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")

        if export_format == "csv":
            filename = f"{report_id}_{now_str}.csv"
            export_rows = report.get_export_rows(data)
            response = StreamingHttpResponse(
                stream_csv_rows(export_rows),
                content_type="text/csv; charset=utf-8",
            )
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        elif export_format == "xlsx":
            filename = f"{report_id}_{now_str}.xlsx"
            xlsx_bytes = export_to_excel(data)
            response = HttpResponse(
                xlsx_bytes,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        elif export_format == "pdf":
            filename = f"{report_id}_{now_str}.pdf"
            pdf_bytes = export_to_pdf(data)
            response = HttpResponse(
                pdf_bytes,
                content_type="application/pdf",
            )
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        elif export_format == "json":
            return Response(data)

        else:
            return Response(
                {"error": f"Unsupported format '{export_format}'. Supported formats: json, csv, xlsx, pdf."},
                status=status.HTTP_400_BAD_REQUEST,
            )
