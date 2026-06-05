"""PDF report generation for selected retrosynthesis routes."""

from __future__ import annotations

import base64
import io
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import ReportRequest, RouteResult

PRIMARY_STATS = (
    "search_time",
    "top_score",
    "is_solved",
    "number_of_routes",
    "number_of_solved_routes",
    "number_of_steps",
    "number_of_precursors",
    "number_of_precursors_in_stock",
)


def build_pdf_report(request: ReportRequest) -> bytes:
    """Build a modern light PDF report for selected routes."""

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.55 * inch,
        title=request.title,
    )

    styles = _styles()
    story: list[Any] = [
        Paragraph(request.title, styles["Title"]),
        Spacer(1, 0.08 * inch),
        Paragraph(f"Target: <font color='#1d4ed8'>{_escape(request.target)}</font>", styles["SubTitle"]),
        Paragraph(
            f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} "
            f"from {len(request.routes)} selected route(s).",
            styles["Muted"],
        ),
        Spacer(1, 0.22 * inch),
    ]

    story.extend(_summary_section(request, styles))
    for idx, route in enumerate(request.routes, start=1):
        if idx > 1:
            story.append(PageBreak())
        story.extend(_route_section(route, styles))

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    return buffer.getvalue()


def _summary_section(request: ReportRequest, styles: dict[str, ParagraphStyle]) -> list[Any]:
    elements: list[Any] = [Paragraph("Search summary", styles["Heading"])]
    stat_rows = []
    for key in PRIMARY_STATS:
        if key in request.statistics:
            stat_rows.append([_label(key), _format_value(request.statistics[key])])
    if not stat_rows:
        stat_rows = [["Selected routes", str(len(request.routes))]]

    elements.append(_key_value_table(stat_rows))

    extra_rows = [
        [_label(key), _format_value(value)]
        for key, value in request.statistics.items()
        if key not in PRIMARY_STATS
    ]
    if extra_rows:
        elements.extend(
            [
                Spacer(1, 0.12 * inch),
                Paragraph("Additional statistics", styles["SmallHeading"]),
                _key_value_table(extra_rows[:10], small=True),
            ]
        )
    elements.append(Spacer(1, 0.22 * inch))
    return elements


def _route_section(route: RouteResult, styles: dict[str, ParagraphStyle]) -> list[Any]:
    summary = _route_summary(route.tree)
    status = "Solved" if route.is_solved else "Unsolved"
    elements: list[Any] = [
        Paragraph(f"Route {route.index}: {status}", styles["Heading"]),
        _summary_cards(
            [
                ("Reactions", summary["reactions"]),
                ("Leaves in stock", f"{summary['in_stock_leaves']}/{summary['leaf_molecules']}"),
                ("Max depth", summary["max_depth"]),
            ]
        ),
        Spacer(1, 0.12 * inch),
    ]

    if route.scores:
        elements.extend(
            [
                Paragraph("Scores", styles["SmallHeading"]),
                _key_value_table(
                    [[_label(key), _format_value(value)] for key, value in route.scores.items()],
                    small=True,
                ),
                Spacer(1, 0.12 * inch),
            ]
        )

    image = _route_image(route.image)
    if image:
        elements.extend(
            [
                Paragraph("Pathway image", styles["SmallHeading"]),
                image,
                Spacer(1, 0.12 * inch),
            ]
        )
    else:
        elements.extend(
            [
                Paragraph("Pathway image", styles["SmallHeading"]),
                Paragraph("No rendered pathway image was available for this route.", styles["Muted"]),
                Spacer(1, 0.12 * inch),
            ]
        )

    leaf_rows = _leaf_rows(route.tree)
    if leaf_rows:
        elements.extend(
            [
                Paragraph("Precursors", styles["SmallHeading"]),
                Table(
                    [["SMILES", "Stock"]] + leaf_rows,
                    colWidths=[4.75 * inch, 1.0 * inch],
                    style=_table_style(header=True),
                    repeatRows=1,
                ),
            ]
        )
    return [KeepTogether(elements[:3]), *elements[3:]]


def _route_image(data_url: str | None) -> Image | None:
    if not data_url:
        return None
    try:
        encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
        image_data = base64.b64decode(encoded)
        image = Image(io.BytesIO(image_data))
        image._restrictSize(7.0 * inch, 4.8 * inch)  # noqa: SLF001 - reportlab API
        image.hAlign = "CENTER"
        return image
    except Exception:
        return None


def _route_summary(node: dict[str, Any]) -> dict[str, int]:
    summary = {
        "reactions": 0,
        "molecules": 0,
        "leaf_molecules": 0,
        "in_stock_leaves": 0,
        "max_depth": 0,
    }

    def visit(current: dict[str, Any], depth: int) -> None:
        summary["max_depth"] = max(summary["max_depth"], depth)
        children = current.get("children") or []
        if current.get("type") == "reaction":
            summary["reactions"] += 1
        else:
            summary["molecules"] += 1
            if not children:
                summary["leaf_molecules"] += 1
                if current.get("in_stock"):
                    summary["in_stock_leaves"] += 1
        for child in children:
            if isinstance(child, dict):
                visit(child, depth + 1)

    visit(node, 0)
    return summary


def _leaf_rows(node: dict[str, Any]) -> list[list[str]]:
    rows: list[list[str]] = []

    def visit(current: dict[str, Any]) -> None:
        children = current.get("children") or []
        if current.get("type") != "reaction" and not children:
            rows.append([
                _truncate(str(current.get("smiles", "-")), 90),
                "In stock" if current.get("in_stock") else "Not in stock",
            ])
        for child in children:
            if isinstance(child, dict):
                visit(child)

    visit(node)
    return rows


def _summary_cards(cards: list[tuple[str, Any]]) -> Table:
    data = [[Paragraph(f"<b>{_escape(str(value))}</b><br/><font color='#64748b'>{_escape(label)}</font>", _styles()["Card"]) for label, value in cards]]
    table = Table(data, colWidths=[1.85 * inch] * len(cards))
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#dbe4f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.7, colors.HexColor("#dbe4f0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def _key_value_table(rows: list[list[str]], small: bool = False) -> Table:
    table = Table(rows, colWidths=[2.05 * inch, 4.1 * inch])
    table.setStyle(_table_style(header=False, small=small))
    return table


def _table_style(header: bool = False, small: bool = False) -> TableStyle:
    style_commands: list[tuple[Any, ...]] = [
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#dbe4f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("FONTSIZE", (0, 0), (-1, -1), 8 if small else 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#475569")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#0f172a")),
    ]
    if header:
        style_commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    return TableStyle(style_commands)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=6,
        ),
        "SubTitle": ParagraphStyle(
            "SubTitle",
            parent=base["Normal"],
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#334155"),
        ),
        "Heading": ParagraphStyle(
            "Heading",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=20,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=4,
            spaceAfter=8,
        ),
        "SmallHeading": ParagraphStyle(
            "SmallHeading",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#1d4ed8"),
            spaceBefore=4,
            spaceAfter=6,
        ),
        "Muted": ParagraphStyle(
            "Muted",
            parent=base["Normal"],
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#64748b"),
        ),
        "Card": ParagraphStyle(
            "Card",
            parent=base["Normal"],
            fontSize=8,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0f172a"),
        ),
    }


def _page_footer(canvas: Any, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.drawRightString(
        doc.pagesize[0] - doc.rightMargin,
        0.32 * inch,
        f"Page {doc.page}",
    )
    canvas.drawString(doc.leftMargin, 0.32 * inch, "AiZynthFinder GUI")
    canvas.restoreState()


def _format_value(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.4f}"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, list):
        return ", ".join(_format_value(item) for item in value)
    if isinstance(value, dict):
        return _truncate(", ".join(f"{key}: {_format_value(val)}" for key, val in value.items()), 180)
    return _truncate(str(value), 180)


def _label(value: str) -> str:
    return value.replace("_", " ").title()


def _truncate(value: str, max_length: int) -> str:
    return value if len(value) <= max_length else f"{value[: max_length - 1]}…"


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
