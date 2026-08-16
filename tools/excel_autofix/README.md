# أداة تنسيق ملفات Excel للطباعة
# Excel Auto Formatter

> أداة سطح مكتب Python لتنسيق ملفات Excel المشفرة للطباعة بشكل تلقائي.

---

## التثبيت / Installation

### Python
1. تأكد من تثبيت Python 3.x
2. فتح Terminal
3. نفذ:
```bash
pip install customtkinter openpyxl
```

---

## طريقة الاستخدام / Usage

### التشغيل عبر Python
```bash
cd excel_autofix
python excel_app.py
```

### التشغيل الصامت (بدون نافذة CMD)
```bash
cscript ExcelAutoFix.vbs
```

### التشغيل عبر BAT
```bash
run.bat
```

### خطوات الاستخدام
1. افتح الأداة
2. اضغط **اختيار ملف الإدخال** واختر ملف Excel
3. اضغط **اختيار ملف الإخراج** واختر مكان الحفظ
4. اضغط **بدء التنسيق**
5. سيتم تنسيق الملف وحفظه

---

## ملاحظات مهمة / Important Notes

1. **الأعمدة المطلوبة:**
   - `CaseNumber`
   - `SAPOrderNumber`
   - `Quantity`
   - `Product`
   - `ProductType`

2. **التنسيق:**
   - RTL (من اليمين لليسار)
   - عناوين متكررة كل 30 سطر
   - تنسيق احترافي للطباعة

3. **التشغيل الصامت:**
   - `ExcelAutoFix.vbs` — يعمل بدون نافذة CMD
   - `run.bat` — يعمل عبر CMD

---

## حل المشاكل / Troubleshooting

| المشكلة | الحل |
|---------|------|
| `ModuleNotFoundError` | نفذ `pip install customtkinter openpyxl` |
| الأعمدة غير موجودة | تأكد من أن الملف يحتوي الأعمدة المطلوبة |
| خطأ في التنسيق | تحقق من إعدادات الطباعة |

---

## الملفات الرئيسية / Key Files

| الملف | الوصف |
|-------|-------|
| `excel_app.py` | التطبيق الرئيسي |
| `ExcelAutoFix.vbs` | سكريبت التشغيل الصامت |
| `run.bat` | ملف التشغيل البديل |

---

## حقوق النشر / License

هذا المشروع خاص بشركة العربي للإلكترونيات — مراكز خدمة الصيانة.
