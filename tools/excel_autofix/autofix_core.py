"""autofix_core.py — نواة معالجة ملف الإكسيل الأسبوعي.

منطق المعالجة المشترك بين:
- excel_app.py (واجهة CustomTkinter)
- service.py (الخدمة المحلية للمتصفح)

لا يحتوي أي كود UI أو HTTP — فقط منطق الملفات.
"""

import os

DEFAULT_TITLE = "2000043359 // الامين-ASC-AC522"
NEEDED = ["CaseNumber", "SAPOrderNumber", "Quantity", "Product", "ProductType"]
WIDTHS = [21.38, 13.81, 4.44, 49.13, 15.0]
ALIGNMENTS = ["center", "center", "center", "right", "center"]
ROWS_PER_GROUP = 30

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter


def find_cols(ws, header_row):
    """Find column indices for needed headers."""
    mapping = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(header_row, c).value
        if v and str(v).strip() in NEEDED:
            mapping[str(v).strip()] = c
    return [mapping.get(h) for h in NEEDED]


def save_as_excel(in_path, out_path, title_text):
    """Read source Excel, build styled RTL workbook with repeating title+header every 35 rows."""
    src_wb = openpyxl.load_workbook(in_path, data_only=True)
    src_ws = src_wb.active

    hr = 1
    for r in range(1, min(src_ws.max_row + 1, 10)):
        for c in range(1, src_ws.max_column + 1):
            v = src_ws.cell(r, c).value
            if v and str(v).strip() == "CaseNumber":
                hr = r
                break
        else:
            continue
        break

    cols = find_cols(src_ws, hr)
    if None in cols:
        raise Exception("Columns not found!")

    rows = []
    for r in range(hr + 1, src_ws.max_row + 1):
        rd = []
        ok = False
        for c in cols:
            v = src_ws.cell(r, c).value
            rd.append(v)
            if v is not None:
                ok = True
        if ok:
            rows.append(rd)
    rows.sort(key=lambda x: str(x[4] or ""))

    if not rows:
        raise Exception("No data!")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = src_ws.title or "toBeWantedForm"

    from openpyxl.worksheet.views import Pane

    sv = ws.views.sheetView[0]
    sv.rightToLeft = True

    nc = len(NEEDED)

    title_font = Font("Arial", 18, bold=True, color="FFFFFF")
    title_fill = PatternFill("solid", fgColor="000000")
    title_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    hdr_font = Font("Calibri", 11, bold=True)
    hdr_fill = PatternFill("solid", fgColor="C0C0C0")
    hdr_align = Alignment(horizontal="center", vertical="center")

    data_font = Font("Calibri", 11)

    thin_border = Border(
        left=Side("thin"), right=Side("thin"), top=Side("thin"), bottom=Side("thin")
    )

    col_aligns = [Alignment(horizontal=a, vertical="center") for a in ALIGNMENTS]

    even_fill = PatternFill("solid", fgColor="F5F5F5")
    odd_fill = PatternFill("solid", fgColor="FFFFFF")

    current_row = 1
    data_in_group = 0

    def write_title_header(ws, row_num):
        ws.merge_cells(
            start_row=row_num, start_column=1, end_row=row_num, end_column=nc
        )
        c = ws.cell(row_num, 1, title_text)
        c.font = title_font
        c.fill = title_fill
        c.alignment = title_align
        ws.row_dimensions[row_num].height = 40
        for i, h in enumerate(NEEDED, 1):
            c = ws.cell(row_num + 1, i, h)
            c.font = hdr_font
            c.fill = hdr_fill
            c.alignment = hdr_align
            c.border = thin_border
        ws.row_dimensions[row_num + 1].height = 25

    write_title_header(ws, current_row)
    current_row += 2

    for ri, rd in enumerate(rows):
        remaining = len(rows) - ri

        if data_in_group >= ROWS_PER_GROUP:
            if remaining <= 10:
                for ci2, v2 in enumerate(rd, 1):
                    c = ws.cell(current_row, ci2, v2)
                    c.font = data_font
                    c.border = thin_border
                    c.fill = even_fill if data_in_group % 2 == 0 else odd_fill
                    c.alignment = col_aligns[ci2 - 1]
                ws.row_dimensions[current_row].height = 22
                current_row += 1
                data_in_group += 1
                continue

            current_row += 1
            write_title_header(ws, current_row)
            current_row += 2
            data_in_group = 0

        fill = even_fill if data_in_group % 2 == 0 else odd_fill
        for ci, v in enumerate(rd, 1):
            c = ws.cell(current_row, ci, v)
            c.font = data_font
            c.border = thin_border
            c.fill = fill
            c.alignment = col_aligns[ci - 1]
        ws.row_dimensions[current_row].height = 22
        current_row += 1
        data_in_group += 1

    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    last_col = get_column_letter(nc)
    ws.autoFilter = {"from": "A2", "to": f"{last_col}{current_row - 1}"}
    sv.pane = Pane(ySplit=2, topLeftCell="A3", activePane="bottomLeft", state="frozen")

    wb.save(out_path)
    return out_path, len(rows)


def process_file(src_path, title=None):
    """معالجة كاملة لملف: توليد اسم الإخراج + تنفيذ التنسيق.

    Returns:
        (out_path, row_count)
    """
    if not title or not str(title).strip():
        title = DEFAULT_TITLE
    out_path = os.path.splitext(src_path)[0] + "_modified.xlsx"
    return save_as_excel(src_path, out_path, str(title).strip() or DEFAULT_TITLE)
