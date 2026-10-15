import io
from typing import Any, Dict, List
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class NumberedCanvas:
    """Canvas wrapper to handle total page count and footer."""
    def __init__(self, canvas, doc):
        self.canvas = canvas
        self.doc = doc
        self.pages = []

    def showPage(self):
        self.pages.append(dict(self.canvas.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self.pages)
        for page in self.pages:
            self.canvas.__dict__.update(page)
            self.draw_page_number(page_count)
            self.canvas.showPage()
        self.canvas.save()

    def draw_page_number(self, page_count):
        self.canvas.saveState()
        self.canvas.setFont("Helvetica", 8)
        self.canvas.setFillColor(colors.HexColor("#5E6B63"))
        page_text = f"Page {self.canvas._pageNumber} of {page_count}"
        self.canvas.drawRightString(self.doc.pagesize[0] - 36, 20, page_text)
        self.canvas.drawString(36, 20, "InvLab • Confidential Business Report")
        self.canvas.restoreState()


def export_to_pdf(report_data: Dict[str, Any]) -> bytes:
    """
    Generate professional PDF report using ReportLab.
    ReportLab was chosen because it is pure Python, cross-platform, has zero
    system C-library dependencies (unlike WeasyPrint/cairo), and reliably produces
    fast, consistent business document layouts.
    """
    buffer = io.BytesIO()

    columns = report_data.get("columns", [])
    rows = report_data.get("rows", [])
    summary = report_data.get("summary", {})
    filters_applied = report_data.get("filters_applied", {})

    # Select orientation based on column count
    is_landscape = len(columns) > 6
    pagesize = landscape(letter) if is_landscape else letter

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()

    # Brand Styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#173D32"),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#5E6B63"),
        spaceAfter=12,
    )

    meta_style = ParagraphStyle(
        "ReportMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#202521"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1,  # Center
    )

    table_cell_style_left = ParagraphStyle(
        "TableCellLeft",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#202521"),
        alignment=0,
    )

    table_cell_style_right = ParagraphStyle(
        "TableCellRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#202521"),
        alignment=2,
    )

    table_cell_style_center = ParagraphStyle(
        "TableCellCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#202521"),
        alignment=1,
    )

    story: List[Any] = []

    # Title & Subtitle
    story.append(Paragraph(f"InvLab • {report_data.get('name', 'Management Report')}", title_style))
    desc = report_data.get("description", "")
    if desc:
        story.append(Paragraph(desc, subtitle_style))

    # Metadata & Filters Box
    filter_texts = []
    if "date_from" in filters_applied and "date_to" in filters_applied:
        filter_texts.append(f"<b>Period:</b> {filters_applied['date_from']} to {filters_applied['date_to']}")
    if "warehouse" in filters_applied and filters_applied["warehouse"]:
        filter_texts.append(f"<b>Warehouse:</b> {filters_applied['warehouse']}")
    if "category" in filters_applied and filters_applied["category"]:
        filter_texts.append(f"<b>Category:</b> {filters_applied['category']}")

    meta_line = " &nbsp;&nbsp;|&nbsp;&nbsp; ".join(filter_texts) if filter_texts else "<b>Scope:</b> All available records"
    story.append(Paragraph(meta_line, meta_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E3E1DA"), spaceAfter=12))

    # Summary KPI Cards Table (if summary data present)
    if summary:
        summary_items = list(summary.items())
        # Break summary items into chunks of 4 per row
        chunk_size = 4
        summary_table_data = []
        for i in range(0, len(summary_items), chunk_size):
            chunk = summary_items[i : i + chunk_size]
            row_cells = []
            for k, v in chunk:
                label_fmt = k.replace("_", " ").title()
                val_fmt = f"₹{v:,.2f}" if isinstance(v, (int, float)) and ("amount" in k or "revenue" in k or "value" in k or "cost" in k) else str(v)
                cell_content = f"<font size='7' color='#5E6B63'>{label_fmt}</font><br/><font size='10' color='#173D32'><b>{val_fmt}</b></font>"
                row_cells.append(Paragraph(cell_content, meta_style))
            # Pad with empty cells if fewer than chunk_size
            while len(row_cells) < chunk_size:
                row_cells.append(Paragraph("", meta_style))
            summary_table_data.append(row_cells)

        summary_table = Table(summary_table_data, colWidths=[(pagesize[0] - 72) / chunk_size] * chunk_size)
        summary_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8F9F8")),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E3E1DA")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E3E1DA")),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(summary_table)
        story.append(Spacer(1, 14))

    # Main Data Table
    table_data: List[List[Any]] = []

    # Header Row
    header_row = [Paragraph(col.get("label", ""), table_header_style) for col in columns]
    table_data.append(header_row)

    # Data Rows
    for row in rows:
        row_cells = []
        for col in columns:
            key = col.get("key", "")
            val = row.get(key, "")
            align = col.get("align", "left")

            if col.get("is_currency", False) and isinstance(val, (int, float)):
                formatted_val = f"₹{val:,.2f}"
            else:
                formatted_val = str(val if val is not None else "")

            if align == "right":
                p = Paragraph(formatted_val, table_cell_style_right)
            elif align == "center":
                p = Paragraph(formatted_val, table_cell_style_center)
            else:
                p = Paragraph(formatted_val, table_cell_style_left)
            row_cells.append(p)
        table_data.append(row_cells)

    # Calculate column widths
    avail_width = pagesize[0] - 72
    col_count = len(columns)
    col_width = avail_width / col_count

    data_table = Table(table_data, colWidths=[col_width] * col_count, repeatRows=1)
    data_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#173D32")),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E3E1DA")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9F8")]),
                ("TOPPADDING", (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(data_table)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
