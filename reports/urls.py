from django.urls import path
from reports.views import ReportDetailView, ReportListView

urlpatterns = [
    path("", ReportListView.as_view(), name="report-list"),
    path("<str:report_id>/", ReportDetailView.as_view(), name="report-detail"),
]
