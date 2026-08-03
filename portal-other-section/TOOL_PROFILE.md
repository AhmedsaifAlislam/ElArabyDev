# بطاقة تعريف الأداة — portal-other-section
# Tool Profile — Financial Analytics

> **آخر تحديث:** 2026-07-11

---

## معلومات أساسية / Basic Info

| البند | القيمة |
|-------|--------|
| **الاسم بالعربي** | أدوات الصفحات المالية — قسم آخرى |
| **الاسم بالإنجليزي** | Financial Analytics — Other Section |
| **الإصدار** | v3.0 |
| **النوع** | Chrome Extension + Console Scripts |
| **البورتال المستهدف** | CRM Portal (`elarabyiscrm2.azurewebsites.net`) |
| **اللغة** | JavaScript (ES2022) |
| **تاريخ الإنشاء** | 2026-06 |
| **آخر تحديث** | 2026-07-11 |
| **المطور** | Zain (Antigravity) |

---

## الغرض الرئيسي / Purpose

> مجموعة أدوات وتحليلات لقسم "آخرى" في بوابة العربي CRM — تتضمن إضافة متصفح للتحليل المحاسبي المتخصص، سكريبتات Console لأتمتة الصفحات المالية، واستخراج البيانات من كل صفحة مالية.

---

## الهيكل / Directory Structure

```
portal-other-section/
├── elaraby_crm_analysis.md     ← تحليل تفصيلي لبوابة CRM
├── get_all_data.js             ← سكريبت Console لاستخراج البيانات
├── portal_automation.js        ← سكريبت أتمتة الصفحات المالية
├── TOOL_PROFILE.md             ← هذا الملف
├── PROJECT_STATUS.md           ← حالة المشروع
├── AGENTS.md                   ← تعليمات للذكاء الاصطناعي
├── README.md                   ← دليل الاستخدام
│
└── elaraby-extension/          ← إضافة Chrome
    ├── manifest.json           ← Manifest V3
    ├── popup.html              ← واجهة البوبداب
    ├── popup.js                ← منطق البوبداب
    ├── background.js           ← Service Worker
    ├── local-analyzer.js       ← المحلل المحاسبي
    ├── styles.css              ← الأنماط
    └── icon.png                ← الأيقونة
```

---

## البنية التقنية / Architecture

### المنصة
- **Backend:** ASP.NET Web Forms (.NET Framework 4.0)
- **الاستضافة:** Azure Web App (`elarabyiscrm2.azurewebsites.net`)
- **CRM:** Microsoft Dynamics 365 (Xrm SDK 9.0)
- **نموذج التصديق:** Azure AD / Microsoft Identity

### Manifest V3 (للإضافة)
```json
{
  "manifest_version": 3,
  "name": "العربي CRM - لوحة الحسابات",
  "version": "3.0",
  "permissions": ["activeTab", "scripting", "clipboardWrite", "storage"],
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "*://elarabyiscrm2.azurewebsites.net/*",
    "*://elarabyportalpfs.powerappsportals.com/*"
  ]
}
```

### صفحات "آخرى" المالية

| الصفحة | URL | الوظيفة | تحتاج كلمة سر |
|--------|-----|---------|----------------|
| **النواحي المالية** | `/ASPPage/MainMoney.aspx` | الصفحة الرئيسية | لا |
| **اصدار فاتورة** | `/ASPPage/AutoBuildWR.aspx` | إصدار فاتورة | لا |
| **جاري مراجعتها** | `/ASPPage/inprogress.aspx` | بلاغات جاري مراجعتها | لا |
| **متوقف احتسابها** | `/ASPPage/inasc.aspx` | بلاغات منتظر مراجعتها | لا |
| **مستحقات المراكز** | `/ASPPage/salaryasc2.aspx` | مستحقات مراكز الخدمة | نعم |
| **حركات الحساب CRM** | `/ASPPage/accountMovement.aspx` | حركات CRM | نعم |
| **حركات الحساب SAP** | `/ASPPage/accountMovementSAP.aspx` | حركات SAP | نعم |
| **الفواتير المطلوبة** | `/ASPPage/billingneeded.aspx` | الفواتير المطلوبة | نعم |
| **Call-Center خارج الضمان** | `/ASPPage/SalaryASC.aspx` | بلاغات Call-Center | نعم |
| **حوافز الفنيين** | `/ASPPage/mscreport.aspx` | حوافز الفنيين | نعم |
| **طلبات المدفوعات** | `/ASPPage/Fawry.aspx` | طلبات المدفوعات | لا |
| **ايصالات المدفوعات** | `/ASPPage/FinancialReceipt.aspx` | ايصالات المدفوعات | لا |

---

## التبعيات / Dependencies

### لا يعتمد على مكتبات خارجية
- يعمل بـ vanilla JavaScript فقط
- لا يحتاج SheetJS أو PapaParse

---

## الميزات / Features

### إضافة Chrome (elaraby-extension)
- [x] كشف تلقائي لنوع الصفحة من URL
- [x] استخراج رقم واسم الحساب
- [x] استخراج الجداول من الصفحة
- [x] تحليل محاسبي متخصص لـ SAP
- [x] تصدير CSV/JSON

### سكريبت Console
- [x] `get_all_data.js` — استخراج البيانات من كل الصفحات
- [x] `portal_automation.js` — أتمتة الصفحات المالية

### التحليل المحاسبي (local-analyzer.js)
- [x] حساب الرصيد الجاري (Running Balance)
- [x] كشف التحويلات البنكية
- [x] كشف فواتير التالف
- [x] تحليل تكرار القطع
- [x] تغير الأسعار
- [x] كشف القطع الغالية (>1000 ج.م)
- [x] إحصائيات شهرية

---

## نقاط القوة / Strengths

1. **تحليل محاسبي متخصص** — يركز على احتياجات مراكز الصيانة
2. **كشف تلقائي لنوع الصفحة** — يعمل على أي صفحة مالية
3. **أتمتة شاملة** — يغطي كل الصفحات المالية
4. **بدون مكتبات خارجية** — يعمل بـ vanilla JavaScript
5. **تحليل SAP متقدم** — يكتشف الأعمدة تلقائياً

---

## المشاكل المعروفة / Known Issues

1. **خطأ ASCID** — صفحات inprogress.aspx و inasc.aspx لا تعمل
   - **السبب:** `Entity 'account' With Id = 00000000... Does Not Exist`
   - **الحل:** إضافة validation قبل `GetascfromAccount()`

2. **كلمات السر المتعددة** — كل صفحة لها كلمة سر مختلفة
   - **الحل:** توحيد كلمة السر أو استخدام ملف إعدادات مركزي

3. **التنقل البطيء** — كل صفحة تستخدم PostBack كامل
   - **الحل:** بناء Dashboard موحد

---

## الخطوات القادمة / Roadmap

- [ ] إصلاح خطأ ASCID في صفحات inprogress و inasc
- [ ] بناء Dashboard موحد لكل الصفحات المالية
- [ ] توحيد كلمات السر
- [ ] إضافة أتمتة لصفحات Fawry و FinancialReceipt
- [ ] تحسين التحليل المحاسبي

---

## أوامر مفيدة / Useful Commands

```bash
# لا يوجد أوامر خاصة — السكريبتات تعمل في Console المتصفح
# افتح Console (F12) والصق الملف المطلوب
```

---

## الملفات المرتبطة / Related Files

| الملف | الوصف |
|-------|-------|
| `AGENTS.md` | تعليمات للذكاء الاصطناعي عند العمل على الكود |
| `PROJECT_STATUS.md` | حالة المشروع التفصيلية |
| `README.md` | دليل التثبيت والاستخدام |
| `elaraby_crm_analysis.md` | تحليل تفصيلي لبوابة CRM |

---

*هذا الملف يُحدّث بعد كل إصدار أو تغيير كبير.*
