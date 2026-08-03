# سجل التغييرات — Changelog
# El Araby System — Complete Changelog

> **تنسيق:** [Keep a Changelog](https://keepachangelog.com/)
> **الإصدار:** يتبع [Semantic Versioning](https://semver.org/)

---

## [2026-07-14] — مراجعة مساعد التقفيلات واكتشافات جديدة

### مساعد التقفيلات / Portal AutoFiller
- **إصدار v1.1.0** — تحديث بناءً على مراجعة الكود
- **اكتشاف order-extractor.js** (1,313 سطر) — محرك استخراج بـ 15 حقل، 9 محددات جداول، iframe traversal، pagination (50 صفحة)، سحب تفاصيل البلاغات
- **اكتشاف control-panel.js** — لوحة تحكم إضافية
- **اكتشاف smart-log.js** — سجل حركات المستخدم
- **اكتشاف travel-costs.json** — بدلات الانتقال حسب المناطق
- إضافة تبعيات: Moment.js + Timezone, daterangepicker, Choices.js, Signature/Ink Control
- استخراج المناطق من API (`/incidents(id)` → `/accounts(id)` → `_ldv_area_value`)
- تصدير Excel غني بـ ExcelJS (تلوين، حدود، RTL، إحصائيات)
- 3 مستويات مطابقة للأعمدة (حرفية، starts-with، includes)
- إحصائيات التصدير: شكاوى، صيانة، تركيب، معاينة

### PORTAL_MAP.md — صفحات جديدة
- **ProductInventoryList** — العهد المتاحة (صفحة جرد المخزون)
- **technicalreviewdetails** — المراجعة الفنية
- **inspection-case-without-PhoneNumbers** — معاينة الحالة + توقيع رقمي
- كيانات جديدة: `ldv_workorder_defect`, `ats_inspection`, `msdyn_inventoryadjustment`, `product`, `ldv_productgroup`, `ldv_producttype`, `ldv_producttypebrand`, `bookingstatus`
- إضافة حقول صفحة Work Order Review
- إضافة API endpoints للكيانات الجديدة

### المشاكل المكتشفة
- حد أقصى 50 صفحة في order-extractor.js
- عدم وجود retry mechanism للصفحات الفاشلة

### SHARED_KNOWLEDGE.md — مكتبات جديدة
- Signature/Ink Control (التوقيع الرقمي)
- Choices.js (القوائم المتعددة)
- daterangepicker (محدد النطاق الزمني)
- Moment.js + Timezone (معالجة التاريخ)

---

## [2026-07-11] — إنشاء التوثيق الموحد

### أضيف
- `MASTER_README.md` — الدليل الرئيسي لكل المشروع
- `PORTAL_MAP.md` — خريطة البورتال الكاملة
- `SHARED_KNOWLEDGE.md` — المعرفة المشتركة بين الأدوات
- `CHANGELOG.md` — سجل التغييرات
- `KNOWN_ISSUES.md` — المشاكل المعروفة
- ملفات تعريف (`TOOL_PROFILE.md`) لكل أداة
- ملفات حالة المشروع (`PROJECT_STATUS.md`) لكل أداة
- ملفات تعليمات الذكاء الاصطناعي (`AGENTS.md`) لكل أداة
- ملفات الدليل (`README.md`) لكل أداة

---

## المساعد الذكي / Smart Parts Assistant

### [2.2.0] - 2026-07-11

#### المنجز
- هيكل المجلدات مرتب (content/, dashboard/, shared/, scripts/)
- Manifest V3 جاهز
- قاعدة بيانات IndexedDB (`ElArabyPartsDB` v2)
- آلية اتصال بين content script و background.js
- 4 تبويبات في لوحة التحكم
- مزامنة من Google Drive (CSV/XLSX)
- رفع ملف محلي (CSV/XLSX)
- دمج 4 ملفات Excel في `master_data_merged.csv` (416,815 صف)
- بحث موحد مع فلترة متتالية
- حقن تلقائي للبيانات في البورتال
- عربة التسوق (Cart)
- سجل العمليات (Smart Log)
- لوحة التحكم (Dashboard)
- اللوحة المنبثقة في البورتال (Shadow Panel)

#### المشاكل المحلولة
- نتائج البحث لا تظهر — تم حلها بـ `loadFilters()` بصمت
- Infinite recursion في `enhanceSelect` — تم حذف `Object.defineProperty`
- 64MiB quota error في IndexedDB — تم تقطيع `sparePartDescription`
- Edge Tracking Prevention — تم توجيه التخزين عبر `background.js`

---

## مساعد التقفيلات / Portal AutoFiller

### [1.0.0] - 2026-07-11

#### المنجز
- 6 تبويبات: بحث وتعبئة، زيارة تانية، الاستخراج، التقارير، مساعد AI، سكريبتات
- تعبئة تلقائية لأوامر العمل في البورتال
- دعم Batch للمعالجة المتعددة
- تقارير محفوظة
- مساعد AI (Ollama مع `qwen2.2-coder:14b`)
- كشف أرقام الهواتف عبر `crmAccount`
- سكريبتات Tampermonkey مدمجة
- دعم Edge و Chrome

#### المشاكل المعروفة
- Edge Tracking Prevention — يمنع `chrome.storage.local` في content scripts
- CSP على Facebook/Messenger — يمنع `eval()` و `<script>` tags
- PowerApps iframes — يجب البحث في `document` + كل الـ iframes

---

## البحث عن بلاغ / Report Extractor

### [5.0.0] - 2026-07-11

#### المنجز
- استخراج تقارير البلاغات من بوابة CRM
- قراءة ملفات Excel المرفوعة
- البحث في جدول CRM عن أرقام البلاغات
- استخراج التقارير المرتبطة
- إعادة ضبط البيانات في ملف Excel الأصلي
- دعم تنسيقات متعددة (عام، استبدال، سحب، قطع غيار)
- بحث عبر CRM أو SAP أو اسم العميل أو التليفون
- دعم التنقل بين الصفحات (Pagination)
- تصفية البلاغات الملغاة والمؤجلة

#### معلومات تقنية
- يعمل فقط على `SelectReport.aspx`
- حجم الدفعة: 25 رقم/مرة
- الحالات المفلترة: `canceled`, `postpone`
- يستخدم SheetJS لقراءة/كتابة Excel

---

## portal-other-section / Financial Analytics

### [3.0.0] - 2026-07-11

#### المنجز
- تحليل تفصيلي لبوابة العربي CRM
- إضافة Chrome للتحليل المحاسبي (للمالية)
- سكريبت Console لاستخراج البيانات (`get_all_data.js`)
- سكريبت أتمتة الصفحات المالية (`portal_automation.js`)
- تحليل محاسبي متخصص لحركات الحساب SAP
- حساب الرصيد الجاري (Running Balance)
- كشف التحويلات البنكية
- كشف فواتير التالف
- تحليل تكرار القطع وتغير الأسعار
- كشف القطع الغالية (>1000 ج.م)
- إحصائيات شهرية

#### صفحات "آخرى" المدعومة
- MainMoney.aspx — الصفحة الرئيسية
- AutoBuildWR.aspx — إصدار فاتورة
- inprogress.aspx — جاري مراجعتها
- inasc.aspx — متوقف احتسابها
- salaryasc2.aspx — مستحقات المراكز
- accountMovement.aspx — حركات CRM
- accountMovementSAP.aspx — حركات SAP
- billingneeded.aspx — الفواتير المطلوبة
- Fawry.aspx — طلبات المدفوعات
- FinancialReceipt.aspx — ايصالات المدفوعات

#### المشاكل المعروفة
- خطأ ASCID في inprogress.aspx و inasc.aspx
- كلمات السر المتعددة لكل صفحة
- لا توجد أتمتة أصلاً (تم بناء `portal_automation.js`)

---

## حجز البلاغات المستقبلة / Date Filter Unlocker

### [1.0.0] - 2026-07-11

#### المنجز
- كشف البلاغات المخفية في البورتال
- التحكم الكامل في نطاق التاريخ
- اعتراض `window.crmAccount` قبل تحميل أي شيء
- حذف قيود `futureCases`
- مراقبة طلبات Fetch و XMLHttpRequest
- تعديل استجابات الفلتر

#### آلية العمل
- `Object.defineProperty` على `window.crmAccount`
- حذف `futureCases` من الإعدادات
- مراقبة `fetch` و `XMLHttpRequest`
- تعديل استجابات الفلتر تلقائياً

---

## Rescheduling Portal / Smart Scheduler

### [1.1.0] - 2026-07-11

#### المنجز
- تجاوز قيود عدد الأيام ومرات الجدولة في بوابة العربي
- زر عائم "جدولة حرة (بدون قيود)"
- نافذة منبثقة لاختيار التاريخ
- وضع God Mode للجدولة من أي صفحة
- بدون مكتبات خارجية

#### ملاحظات
- قيود الجدولة مقفلة من جانب السيرفر (Dynamics 365 Plugin)
- لا يمكن تخطيها برمجياً من المتصفح بالكامل

---

## excel_autofix / Excel Auto Formatter

### [1.0.0] - 2026-07-11

#### المنجز
- أداة سطح مكتب Python لتنسيق ملفات Excel للطباعة
- واجهة GUI بـ CustomTkinter
- استخراج أعمدة محددة (CaseNumber, SAPOrderNumber, Quantity, Product, ProductType)
- إعادة تنسيق كملف Excel جديد بعناوين متكررة كل 30 سطر
- تنسيق RTL للطباعة
- دعم تشغيل عبر Python أو VBS أو BAT

#### التبعيات
- customtkinter
- openpyxl
- threading

---

## تاريخ الإصدارات السابق

| التاريخ | الأداة | الإصدار | التغييرات الرئيسية |
|---------|--------|---------|---------------------|
| 2026-07-14 | مساعد التقفيلات | v1.1 | مراجعة الكود واكتشاف extraction engine |
| 2026-07-11 | كل الأدوات | — | إنشاء التوثيق الموحد |
| 2026-07-11 | المساعد الذكي | v2.2 | آخر إصدار مستقر |
| 2026-07-11 | مساعد التقفيلات | v1.0 | الإصدار الأول |
| 2026-07-11 | البحث عن بلاغ | v5.0 | آخر إصدار |
| 2026-07-11 | portal-other-section | v3.0 | إضافة التحليل المحاسبي |
| 2026-07-11 | حجز البلاغات | v1.0 | الإصدار الأول |
| 2026-07-11 | Smart Scheduler | v1.1 | تجاوز القيود |
| 2026-07-11 | excel_autofix | v1.0 | الإصدار الأول |

---

*هذا الملف يُحدّث بعد كل جلسة عمل أو إصدار جديد.*
