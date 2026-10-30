# AGENTS.md — excel_autofix

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\excel_autofix`
2. **الملف الرئيسي:** `excel_app.py`
3. **اللغة:** Python
4. **المكتبات:** customtkinter, openpyxl

## أنماط مهمة

### الأعمدة المطلوبة
```python
NEEDED = ["CaseNumber", "SAPOrderNumber", "Quantity", "Product", "ProductType"]
WIDTHS = [21.38, 13.81, 4.44, 49.13, 15.0]
ALIGNMENTS = ["center", "center", "center", "right", "center"]
ROWS_PER_GROUP = 30
```

### البحث عن الأعمدة
```python
def find_cols(ws, header_row):
    """Find column indices for needed headers."""
    mapping = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(header_row, c).value
        if v and str(v).strip() in NEEDED:
            mapping[str(v).strip()] = c
    return [mapping.get(h) for h in NEEDED]
```

### التنسيق
```python
DEFAULT_TITLE = "2000043359 // الامين-ASC-AC522"
```

## عند ظهور مشكلة

1. حدد موقع المشكلة (excel_app.py)
2. اقرأ الكود المرتبط كاملاً
3. تحقق من أن ملف Excel يحتوي الأعمدة المطلوبة
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## ملاحظات إضافية

- يعمل فقط على Windows
- يحتاج Python 3.x
- يحتاج customtkinter و openpyxl
- لا يعمل كملف EXE حالياً
