from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type


class BaseReport(ABC):
    """
    Base class for InvLab reports.
    Any new domain report (e.g. profit, receivables, returns) inherits from this
    and registers via @register_report.
    """

    report_id: str = ""
    name: str = ""
    description: str = ""
    supports_date_filter: bool = True
    supports_category_filter: bool = False
    supports_warehouse_filter: bool = True
    supported_formats: List[str] = ["json", "csv", "xlsx", "pdf"]

    @abstractmethod
    def generate(self, user, filters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute report queries and return structured dictionary:
        {
            "report_id": str,
            "name": str,
            "description": str,
            "filters_applied": dict,
            "summary": dict,  # KPI metrics
            "columns": list of dicts: {"key": str, "label": str, "align": "left|center|right", "is_currency": bool},
            "rows": list of dicts,
        }
        """
        pass

    def get_export_rows(self, data: Dict[str, Any]) -> List[List[Any]]:
        """
        Convert generated rows to simple 2D tabular array for CSV / Excel / PDF.
        Default implementation uses columns definition to extract values.
        """
        columns = data.get("columns", [])
        rows = data.get("rows", [])
        table: List[List[Any]] = []

        # Header row
        table.append([col["label"] for col in columns])

        # Data rows
        for row in rows:
            row_vals = []
            for col in columns:
                key = col["key"]
                val = row.get(key, "")
                row_vals.append(val)
            table.append(row_vals)

        return table


class ReportRegistry:
    def __init__(self):
        self._reports: Dict[str, BaseReport] = {}

    def register(self, report_cls: Type[BaseReport]) -> Type[BaseReport]:
        instance = report_cls()
        if not instance.report_id:
            raise ValueError(f"Report {report_cls.__name__} must define report_id.")
        self._reports[instance.report_id] = instance
        return report_cls

    def get(self, report_id: str) -> Optional[BaseReport]:
        return self._reports.get(report_id)

    def list_reports(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": r.report_id,
                "name": r.name,
                "description": r.description,
                "supports_date_filter": r.supports_date_filter,
                "supports_category_filter": r.supports_category_filter,
                "supports_warehouse_filter": r.supports_warehouse_filter,
                "supported_formats": r.supported_formats,
            }
            for r in self._reports.values()
        ]


registry = ReportRegistry()


def register_report(report_cls: Type[BaseReport]) -> Type[BaseReport]:
    return registry.register(report_cls)
