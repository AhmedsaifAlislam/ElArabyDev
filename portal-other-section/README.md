# أدوات الصفحات المالية — portal-other-section
# Financial Analytics

> أدوات لتحليل وأتمتة صفحات "آخرى" المالية في بوابة CRM العربي.

---

## التثبيت / Installation

### إضافة Chrome (elaraby-extension)
1. افتح `chrome://extensions`
2. فعّل **Developer mode**
3. اضغط **Load unpacked**
4. اختر مجلد `portal-other-section/elaraby-extension`

### سكريبتات Console
- لا تحتاج تثبيت — تعمل مباشرة في Console المتصفح

---

## طريقة الاستخدام / Usage

### 1. سكريبت استخراج البيانات (get_all_data.js)
1. افتح بوابة CRM وسجل دخول
2. اذهب لصفحة `MainMoney.aspx`
3. افتح Console (F12 → Console)
4. انسخ محتوى `get_all_data.js` والصقه
5. اضغط Enter
6. سيتم استخراج البيانات من كل الصفحات وتحميلها كملف JSON

### 2. سكريبت الأتمتة (portal_automation.js)
1. افتح بوابة CRM وسجل دخول
2. اذهب لصفحة `MainMoney.aspx`
3. افتح Console (F12 → Console)
4. انسخ محتوى `portal_automation.js` والصقه
5. اكتب: `startFinancialAutomation()`
6. اختر العملية المطلوبة من القائمة

### 3. إضافة Chrome
1. افتح أي صفحة مالية في بوابة CRM
2. اضغط على أيقونة الإضافة
3. اضغط **تحميل البيانات**
4. اضغط **تحليل البيانات**
5. ستظهر نتائج التحليل المحاسبي

---

## الدوال المتاحة / Available Functions

### portal_automation.js

| الدالة | الوظيفة |
|--------|---------|
| `startFinancialAutomation()` | القائمة الرئيسية |
| `analyzeCurrentPage()` | تحليل الصفحة الحالية |
| `analyzeAllPages()` | تحليل كل الصفحات |
| `searchAllPages()` | بحث تلقائي في كل الصفحات |
| `compareCRMvsSAP()` | مقارنة حركات CRM مع SAP |
| `extractTableData()` | استخراج بيانات الجدول |
| `exportToExcel(data, filename)` | تصدير لـ Excel |

---

## ملاحظات مهمة / Important Notes

1. **كلمة السر:** `portal_automation.js` يحتاج كلمة السر يدوياً
   - اكتبها في `CONFIG.PASSWORD` قبل التشغيل
   - كلمة السر الحالية: `4000086735`

2. **خطأ ASCID:** صفحات inprogress.aspx و inasc.aspx قد لا تعمل
   - السبب: `Entity 'account' With Id = 00000000... Does Not Exist`
   - الحل: تأكد من تسجيل الدخول بشكل صحيح

3. **التنقل البطيء:** كل صفحة تستخدم PostBack كامل
   - لا تفتح عدة صفحات في نفس الوقت
   - انتظر انتهاء كل عملية قبل البدء في التالية

---

## حل المشاكل / Troubleshooting

| المشكلة | الحل |
|---------|------|
| الخطأ `Entity 'account' Does Not Exist` | أعد تسجيل الدخول |
| كلمة السر خاطئة | تحقق من `CONFIG.PASSWORD` |
| الصفحة لا تستجيب | انتظر بضع ثوانٍ ثم أعد المحاولة |
| البيانات لا تظهر | تأكد من أنك على الصفحة الصحيحة |

---

## الملفات الرئيسية / Key Files

| الملف | الوصف |
|-------|-------|
| `get_all_data.js` | سكريبت استخراج البيانات |
| `portal_automation.js` | سكريبت الأتمتة |
| `elaraby_crm_analysis.md` | تحليل تفصيلي للبورتال |
| `elaraby-extension/popup.js` | واجهة إضافة Chrome |
| `elaraby-extension/local-analyzer.js` | المحلل المحاسبي |

---

## حقوق النشر / License

هذا المشروع خاص بشركة العربي للإلكترونيات — مراكز خدمة الصيانة.
