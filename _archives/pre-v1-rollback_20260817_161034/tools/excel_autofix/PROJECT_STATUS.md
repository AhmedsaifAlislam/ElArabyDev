# حالة المشروع — excel_autofix
# Project Status — Excel Auto Formatter

> **آخر تحديث:** 2026-07-11
> **الإصدار:** v1.0

---

## 1. ✅ المنجز

### البنية التحتية
- [x] هيكل المجلدات مرتب
- [x] واجهة GUI بـ CustomTkinter
- [x] دعم تشغيل عبر Python أو VBS أو BAT

### معالجة Excel
- [x] قراءة الأعمدة المطلوبة تلقائياً
- [x] إعادة تنسيق بتنسيق RTL
- [x] عناوين متكررة كل 30 سطر
- [x] تنسيق احترافي للطباعة

### واجهة المستخدم
- [x] اختيار ملف الإدخال
- [x] اختيار ملف الإخراج
- [x] شريط تقدم
- [x] رسائل نجاح/خطأ

---

## 2. 🔄 قيد التطوير

- لا شيء حالياً

---

## 3. 🐛 المشاكل المعروفة

### محلولة
- لا توجد مشاكل محلولة حالياً

### مفتوحة
- **يحتاج Python مثبت** — لا يعمل كملف EXE
  - **الحل:** تثبيت Python أو تحويل لـ EXE بـ PyInstaller

---

## 4. 📋 المعمارية

### تدفق البيانات
```
ملف Excel → openpyxl.load_workbook() → find_cols() → save_as_excel()
→ تنسيق RTL → عناوين متكررة → حفظ الملف الجديد
```

### الأعمدة المطلوبة
```python
NEEDED = ["CaseNumber", "SAPOrderNumber", "Quantity", "Product", "ProductType"]
WIDTHS = [21.38, 13.81, 4.44, 49.13, 15.0]
ALIGNMENTS = ["center", "center", "center", "right", "center"]
ROWS_PER_GROUP = 30
```

---

## 5. 🔮 الخطوات القادمة المقترحة

- [ ] تحويل لـ EXE (PyInstaller)
- [ ] إضافة دعم لتنسيقات Excel متعددة
- [ ] إضافة خيارات تنسيق إضافية

---

## 6. ⚙️ أوامر مفيدة

```bash
# التثبيت
pip install customtkinter openpyxl

# التشغيل
python excel_app.py
```

---

## 7. 📊 معلومات الأداة

- **النوع:** Python Desktop App
- **اللغة:** Python
- **المكتبات:** customtkinter, openpyxl
- **يعمل على:** Windows فقط

---

*هذا الملف يُحدّث يدوياً بعد كل جلسة عمل.*
