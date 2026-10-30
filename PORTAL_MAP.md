# خريطة البورتال — Portal Map
# El Araby Portal Complete Reference

> **آخر تحديث:** 2026-08-21

---

## الدومينات / Domains

| الدومين | المنصة | الغرض | الدومين |
|---------|--------|-------|---------|
| `elarabyportalpfs.powerappsportals.com` | PowerApps Portal (Dataverse) | إدارة البلاغات وأوامر العمل | بوابة الشركاء |
| `elarabyiscrm2.azurewebsites.net` | ASP.NET Web Forms (.NET 4.0) | التقارير والصفحات المالية | بوابة CRM |

---

## أولاً: PowerApps Portal — بوابة الشركاء

### الصفحة الرئيسية
- **URL:** `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/`
- **الوظيفة:** عرض البلاغات (Orders) مع إمكانية البحث والفلترة

### صفحات البورتال

| الصفحة | URL | الوظيفة | الأدوات المستخدمة |
|--------|-----|---------|-------------------|
| **Orders (البلاغات)** | `/en-US/Orders/` | عرض وإدارة البلاغات | المساعد الذكي، مساعد التقفيلات |
| **Work Order Review** | `/en-US/workorderreview/?id=...` | متابعة أمر الشغل | مساعد التقفيلات، Smart Scheduler |
| **SignIn** | `/en-US/SignIn` | تسجيل الدخول | — |
| **ChangePassword** | `/en-US/ChangePassword` | تغيير كلمة المرور | — |
| **معاينة الحالة** | `/en-US/inspection-case-without-PhoneNumbers/?id=...` | فحص + توقيع رقمي | مساعد التقفيلات |
| **المراجعة الفنية** | `/en-US/technicalreviewdetails/?id=...` | تفاصيل المراجعة الفنية | مساعد التقفيلات |
| **العهد المتاحة** | `/en-US/ProductInventoryList/` | جرد العهدة والمخزون | — |

### نماذج الإضافة (Modal Form Template Path) — اكتشاف 2026-08-19

أزرار الإضافة في الـ subgrids (مشاكل فعلية / فنيين / أكواد أعطال) تفتح نموذج Create عبر `window.open`:

```
/_portal/modal-form-template-path/{modalFormId}?entityformid={entityFormId}&languagecode=1033&refentity=incident&refid={orderId}&refrel={relationship}
```

| الاستخدام | modalFormId | entityformid | refrel (العلاقة) |
|-----------|-------------|--------------|------------------|
| إضافة **مشاكل فعلية** | `6d6b3012-e709-4c45-a00d-df4b3befc518` | `4b0af62b-cc4f-ea11-a812-000d3ab95cbc` | `ldv_incident_ldv_case_problem_workorder` |
| إضافة **فني** | `6d6b3012-e709-4c45-a00d-df4b3befc518` | `29c3971e-b745-ea11-a812-000d3ab95431` | `ats_incident_ats_caseresource_Case` |

- حقول النموذج باسم كامل يبدأ بـ `ctl00$ContentContainer$MainContent$EntityFormControl$EntityFormControl_EntityFormView$` ثم `ldv_producttype_name` (نوع المنتج) ونظائره.
- زر الحفظ: `#InsertButton` (نص "حفظ").
- lookup الحقول: قوالب `div.lookup-modal` مخفية في DOM (7 قوالب — lookup-field واحد لكل حقل)، حقل بحث `input.query`، صفوف `tr[data-entity="contact"]` للفنيين، أزرار `button.primary[aria-label="Select"]` / `button[aria-label="Cancel"]` / إزالة القيمة / بحث `fa-search`.
- بنية lookup المشاكل: حقل بحث `input` في `.modal-body` (placeholder="Search"، يدعم wildcard `*`)، نتائج `table tr` (نص `CODE - (الوصف)`)، ترقيم `li` أو `a[data-page="N"]` (حتى 120 صفحة).
- **قيد:** النقر الآلي على صف lookup الفني لا يُفعّل الاختيار (زر Select يبقى disabled) — يلزم تعامل خاص في الأتمتة.
- الأكواد في القائمة كتالوج كامل غير مفلتر حسب المنتج (~1200 كود، يبدأ بـ AC ثم AF ثم AL).

### Lookup على PAGE_1 (العلامة التجارية / الموديلات) — اكتشاف حي 2026-08-21

- زر الفتح بجانب كل حقل: `button[aria-label*="Launch lookup modal"]` (3 حقول على PAGE 1: العلامة التجاريه + الموديل الفعلي 1 + الموديل الفعلي 2).
- المودال: رسالة `Choose one record and click Select to continue`، جدول `Select | Brand | Product Type | Name`، تذييل `اختر | إلغاء | إزالة القيمة`.
- **تحذير:** أزرار `aria-label*="Select"` في رأس الجدول = فرز أعمدة وليست زر تأكيد. زر التأكيد هو **"اختر"** (آخر زر ظاهر في القائمة).
- طريقة الاختيار (من `fillLookupModal` في content-script.js): Clear → فتح → direct pick على `.modal table tbody tr` الظاهرة → نقر الصف → نقر آخر "اختر" ظاهر (`reverse().find(b => b.offsetParent !== null)`) → انتظار.
- البحث: الكتابة في `input.query` ثم نقر زر البحث `button[aria-label*="Search"]` (الكتابة وحدها لا تفلتر) — العلامة اختيار مباشر، الموديلات بحث بالكود.
- الترتيب: العلامة التجارية قبل الموديلات (الموديل يعتمد على العلامة). التفاصيل الكاملة في `SHARED_KNOWLEDGE.md`.
- **تحقق 2026-08-21:** الإضافة القديمة نجحت تلقائيًا في تعبئة بلاغين كاملين (PAGE 1 + PAGE 2) — منطق `fillLookupModal` مُثبت حيًا.

### أكواد المشاكل الفعلية (مثال فئة AC)

| الكود | الوصف | الكود | الوصف |
|-------|-------|-------|-------|
| AC01 | البلازما لا تعمل | AC20 | رائحة كريهه |
| AC02 | التبريد ضعيف | AC22 | صوت عالى من الوحدة الخارجية |
| AC03 | التبريد منعدم | AC26 | يلزم تغيير الفلاتر |
| AC05 | الجهاز لا يعمل | AC33 | توريد غطاء خارجى - صيانة دورية |
| AC06 | الجهاز يفصل بعد فتره | AC34 | صيانة - تكييف - خارج الضمان |
| AC14 | الوضع الساخن لا يعمل | AC99 | تكرار أعطال |
| AC16 | تسريب فريون | ACK0 | دفع خزنة |
| AC17 | تسريب مياه من الوحدة الخارجية | ACZ0 | صيانة خدمة تجار |
| AC18 | تسريب مياه من الوحدة الداخليه | ACIC/ACPC | صيانة شركات شقيقة |

> القائمة الكاملة والمنتجات في `SHARED_KNOWLEDGE.md` — قسم "أكواد المشاكل الفعلية".

### حقول صفحة Work Order Review

| الحقل | المحدد | مثال |
|-------|--------|------|
| حالة الضمان | `select[name*="warranty"]` | In warranty / Out warranty |
| موافقة الفني | `input[name*="technician"]` | تم / لم يتم |
| حالة قطع الغيار | `select[name*="spareparts"]` | متوفرة / غير متوفرة |
| تاريخ الضمان | `input[name*="warrantydate"]` | 15/07/2026 |
| تاريخ الزيارة المخطط | `input[name*="plannedvisit"]` | 14/07/2026 |
| رقم الطلب | `input[name*="ticketnumber"]` | CAS... |
| ملاحظات الفني | `textarea[name*="techniciannotes"]` | تم الإصلاح |
| حالة الاستبدال | `select[name*="replacement"]` | مطلوب / غير مطلوب |

### قاعدة صارمة: الرقم المسلسل 2 (Serial 2)

| القاعدة | التفاصيل |
|---------|----------|
| **مسموح فقط** | منتجات مجموعة AC: تكييف، تكييف كونسيلد، PUMP CLEAN، مبرد هواء، منقى هواء، صيانة دورية تكييف |
| **فاضي إلزاماً** | كل المنتجات الأخرى (ثلاجات، غسالات، بوتوجازات، شاشات، SHA/AV/OE/PCP/TB/Watches/LIGHTING...) — `ldv_serialnumber1` و `ldv_actualmodel2` بلا بيانات |
| **سبب الرفض** | البوابة ترفض البلاغ: "المنتج الذي قمت بأدخاله غير متطابق مع الرقم المسلسل" لو serial2 متعبأ لمنتج غير AC |
| **Sharp** | علامة تجارية (فيها تكييف + ثلاجات + غسالات) وليست نوع منتج — لا تُملأ serial2 لثَلاجات شارب |
| **التنفيذ** | `content-script.js` → `isACProductType()` + `clearModel2Serial2Fields()` |

### قاعدة حماية السيريال (أُضيفت 2026-08-17)

| القاعدة | التفاصيل |
|---------|----------|
| **سيريال حقيقي محمي** | أكثر من 5 أحرف/أرقام إنجليزية (مثل `20C01#010171HA2C`) → لا يُحذف ولا يُعدّل إلا بـ checkbox "الحقن الإجباري" (`forceOverwrite`) |
| **قيم وهمية** | قصيرة/غير حقيقية (`"0"`, `"AB"`, `"123"`) → يسمح بالكتابة فوقها |
| **التنفيذ** | `content-script.js` → `isRealSerialValue()` تُمرَّر لـ `fillAndVerifyProtected` (Serial1/Serial2) + حماية داخل `clearModel2Serial2Fields()` |

### إعدادات window.crmAccount

```javascript
window.crmAccount = {
  accountId: '7707e653-ef63-ea11-a812-000d3ab953dd',
  changePassword: '0',
  accountType: 963400001,
  allowCancellation: true,
  futureCases: 963400002,          // ← محدود بـ 3 أيام (يتم حذفه بـ DateFilter Unlocker)
  hideCustomersPhones: false,       // ← الأرقام ظاهرة
  enableOverLapping: true,
  allowReschedule: true,
  allowInstallationCreation: true,
  allowMaintenanceCreation: true,
  allowDealerInstallation: false,
  allowOutsideInventory: true,
  showOtherMenu: true
};
```

### بنية جدول البلاغات (Orders Table)

| Index | العمود | مثال |
|-------|--------|------|
| [0] | رقم الطلب (CAS) | `CAS2026051450930703` |
| [1] | اسم العميل | `عميل 20` |
| [2] | رقم العقار | `0` |
| [3] | العنوان | `القاهرة، شارع النصر...` |
| [4] | نوع المنتج | `ثلاجات` |
| [5] | رقم الموبايل | `01000000000` |
| [6] | رقم شخص ذو صلة | `01000000000` |
| [7] | شكوى العميل | `GR01 - لا تبرد...` |
| [8] | تاريخ الحجز | `23/05/2026` |
| [9] | ملاحظات المكتب | `163496799 **بورسعيد` |
| [10] | ملاحظات الكول سنتر | _(فارغ)_ |
| [11] | نوع الخدمة | `صيانة` |
| [12] | يوجد شكوى | `لا` |
| [13] | رقم SAP | `733093443` |
| [14] | جهة البلاغ | `متنقلة` |
| [15] | الفني المسؤول | _(فارغ)_ |
| [16] | Actions | `متابعة / ارجاع / توزيع` |

### محددات DOM للبورتال (PowerApps)

```javascript
// الجداول دائماً داخل iframes!
function findTableInDoc(doc) {
  return doc.querySelector('table.entity-grid') || doc.querySelector('table');
}

function findTable() {
  let result = findTableInDoc(document);
  if (result) return { table: result, doc: document };
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      result = findTableInDoc(iDoc);
      if (result) return { table: result, doc: iDoc, iframe };
    } catch (e) { /* cross-origin */ }
  }
  return null;
}
```

### API Endpoints المكتشفة

```
/_api/incidents?$top=100&$orderby=createdon desc
/_api/incidents?$filter=ticketnumber eq 'CAS...'
/_api/accounts?$top=100
/_api/accounts({customerId})
/_api/contacts({customerId})
/_api/msdyn_workorders?$top=100
/_api/ldv_workorder_defects?$top=100
/_api/ats_inspections?$top=100
/_api/msdyn_inventoryadjustments?$top=100
/_api/products?$top=100
/_api/ldv_productgroups?$top=100
/_api/ldv_producttypes?$top=100
/_api/ldv_producttypebrands?$top=100
/_api/bookingstatuses?$top=100
```

### كيانات النظام المكتشفة (Dataverse)

| الكيان | الوصف |
|--------|-------|
| `ldv_workorder_defect` | عيوب أمر الشغل (نافذة منبثقة) |
| `ats_inspection` | الفحوصات / المعاينات |
| `msdyn_inventoryadjustment` | تعديل المخزون |
| `product` | المنتجات |
| `ldv_productgroup` | مجموعات المنتجات |
| `ldv_producttype` | أنواع المنتجات |
| `ldv_producttypebrand` | ماركات المنتجات |
| `bookingstatus` | حالات الحجز |

### Regex Patterns

| الهدف | Pattern | مثال |
|-------|---------|------|
| رقم موبايل مصري | `/01[0-9]{9}/` | `01000000000` |
| رقم CAS | `/CAS\d+/` | `CAS2026051450930703` |
| رقم SAP | `/\b7[0-9]{7,9}\b/` | `733093443` |

---

## ثانياً: CRM Portal — بوابة التقارير والمالية

### الصفحة الرئيسية
- **URL:** `https://elarabyiscrm2.azurewebsites.net/ASPPage/{GUID}.aspx`
- **الوظيفة:** التقارير والصفحات المالية (آخرى)

### شريط التنقل

| الرابط | الصفحة | URL |
|--------|--------|-----|
| البريدج | MyBridge.aspx | `/ASPPage/MyBridge.aspx` |
| التقارير | mainASP.aspx | `/ASPPage/mainASP.aspx` |
| قطع غيار | PartsReport.aspx | `/ASPPage/PartsReport.aspx` |
| النواحى المالية | MainMoney.aspx | `/ASPPage/MainMoney.aspx` |
| اسألنى | ticketCreate.aspx | `/ASPPage/ticketCreate.aspx` |
| اجراءات | mainMsg.aspx | `/ASPPage/mainMsg.aspx` |
| ارشادات الاصلاح | Guid.aspx | `/ASPPage/Guid.aspx` |

### صفحات "آخرى" المالية — MainMoney.aspx

| الصفحة | URL | الوظيفة | تحتاج كلمة سر | الحالة |
|--------|-----|---------|----------------|--------|
| **النواحي المالية** | `/ASPPage/MainMoney.aspx` | الصفحة الرئيسية للقسم المالي | لا | ✅ شغالة |
| **اصدار فاتورة** | `/ASPPage/AutoBuildWR.aspx` | إصدار فاتورة لقطع الغيار | لا | ✅ شغالة |
| **جاري مراجعتها** | `/ASPPage/inprogress.aspx` | بلاغات جاري مراجعتها مالياً | لا | ⚠️ خطأ ASCID |
| **متوقف احتسابها** | `/ASPPage/inasc.aspx` | بلاغات منتظر مراجعتها من المركز | لا | ⚠️ خطأ ASCID |
| **مستحقات المراكز** | `/ASPPage/salaryasc2.aspx` | مستحقات مراكز الخدمة | نعم (الرقم السرى) | ✅ شغالة |
| **حركات الحساب CRM** | `/ASPPage/accountMovement.aspx` | حركات الحساب في CRM | نعم (كلمة السر) | ✅ شغالة |
| **حركات الحساب SAP** | `/ASPPage/accountMovementSAP.aspx` | حركات الحساب في SAP | نعم (كلمة المرور) | ✅ شغالة |
| **الفواتير المطلوبة** | `/ASPPage/billingneeded.aspx` | الفواتير المطلوبة | نعم (الرقم السرى) | ✅ شغالة |
| **Call-Center خارج الضمان** | `/ASPPage/SalaryASC.aspx` | بلاغات Call-Center خارج الضمان | نعم | ✅ شغالة |
| **حوافز الفنيين** | `/ASPPage/mscreport.aspx` | حوافز الفنيين | نعم | ✅ شغالة |
| **طلبات المدفوعات** | `/ASPPage/Fawry.aspx` | طلبات المدفوعات | لا | ⚠️ خطأ ASCID |
| **ايصالات المدفوعات** | `/ASPPage/FinancialReceipt.aspx` | ايصالات المدفوعات | لا | ⚠️ خطأ ASCID |

### تدفق العمل المالي

```
1. بلاغ خدمة جديد
   ↓
2. تنفيذ أمر العمل
   ↓
3. تقفيل البلاغة
   ↓
4. هل تحتاج فاتورة؟
   ├── نعم → billingneeded.aspx
   │         ↓
   │         AutoBuildWR.aspx (إصدار فاتورة)
   │         ↓
   │         inprogress.aspx (جاري مراجعتها)
   │         ├── مراجعة ناجحة → accountMovement.aspx
   │         │                   ↓
   │         │                   accountMovementSAP.aspx
   │         │                   ↓
   │         │                   salaryasc2.aspx
   │         │                   ↓
   │         │                   Fawry.aspx → FinancialReceipt.aspx
   │         │
   │         └── مراجعة فاشلة → inasc.aspx
   │
   └── لا → inasc.aspx

Call-Center خارج الضمان:
   └── SalaryASC.aspx → accountMovement.aspx

حوافز الفنيين (تلقائي):
   └── mscreport.aspx
```

### أنماط الحقول لكل صفحة

#### inprogress.aspx / inasc.aspx

| العنصر | ID | النوع |
|--------|-----|-------|
| تاريخ من | `ContentPlaceHolder1_TextBox1` | Date Input |
| تاريخ الى | `ContentPlaceHolder1_TextBox2` | Date Input |
| الحالة | `ContentPlaceHolder1_DropDownList1` | DropDownList |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit |
| استخراج اكسل | `ContentPlaceHolder1_Button2` | Submit |

**قيمة DropDownList:**
- inprogress.aspx: `Amal` (بلاغات جاري مراجعتها مالياً)
- inasc.aspx: `ASC` (بلاغات منتظر مراجعتها من المركز)

#### accountMovement.aspx / billingneeded.aspx

| العنصر | ID | النوع |
|--------|-----|-------|
| رقم حساب المركز | `ContentPlaceHolder1_Label1` | Span (ثابت) |
| تاريخ من | `ContentPlaceHolder1_TextBox1` | Date Input |
| تاريخ الى | `ContentPlaceHolder1_TextBox2` | Date Input |
| كلمة السر | `ContentPlaceHolder1_TextBox3` | Password |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit |
| Extract All Data | `ContentPlaceHolder1_LinkButton1` | LinkButton |

#### salaryasc2.aspx

| العنصر | ID | النوع |
|--------|-----|-------|
| اسم المركز | `ContentPlaceHolder1_lblnameasc` | Span |
| رقم حساب المركز | `ContentPlaceHolder1_lblaccount` | Span |
| السنة | `ContentPlaceHolder1_DropDownList3` | DropDownList (2019-2030) |
| الشهر | `ContentPlaceHolder1_DropDownList4` | DropDownList (12 شهر) |
| الرقم السرى | `ContentPlaceHolder1_TextBox1` | Password |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit |
| Export To Excel | `ContentPlaceHolder1_Button2` | Submit |

#### accountMovementSAP.aspx

| العنصر | ID | النوع |
|--------|-----|-------|
| رقم حساب المركز | `ContentPlaceHolder1_Label1` | Span (قيمة: `2000043359`) |
| كلمة المرور | `ContentPlaceHolder1_TextBox1` | Password |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit |
| استخراج اكسل | `ContentPlaceHolder1_Button2` | Submit |

### كلمات السر

| الصفحة | اسم الحقل | القيمة المطلوبة |
|--------|-----------|----------------|
| salaryasc2.aspx | `ContentPlaceHolder1_TextBox1` | "الرقم السرى" |
| accountMovement.aspx | `ContentPlaceHolder1_TextBox3` | "كلمة السر" |
| accountMovementSAP.aspx | `ContentPlaceHolder1_TextBox1` | "كلمة المرور" |
| billingneeded.aspx | `ContentPlaceHolder1_TextBox3` | "الرقم السرى" |

> **ملاحظة:** كلمة السر في `portal_automation.js` تُدخل يدوياً عبر `CONFIG.PASSWORD` عند التشغيل — لا تُخزّن في الملفات.

### كيفية عمل POSTBack

```javascript
// كل الروابط تستخدم __doPostBack
// المثال: الضغط على "جاري مراجعتها"
// eventTarget = 'ctl00$LinkButton1'
// eventArgument = ''

// آلية العمل:
// 1. المستخدم يضغط على الرابط
// 2. __doPostBack تملأ __EVENTTARGET و __EVENTARGUMENT
// 3. الفورم يُرسل بالكامل (POST)
// 4. السيرفر يعالج الطلب ويعيد الصفحة الجديدة
// 5. لا يوجد AJAX — كل عملية PostBack كاملة

// في السكريبتات:
const link = document.getElementById('LinkButton1');
link.click();  // يستدعي __doPostBack تلقائياً
```

### محددات CSS الشائعة

```javascript
// الروابط المالية
'a[href*="doPostBack"]'
'a.sameframe'
'a[href*="MainMoney"]'

// الجداول
'table.table'
'table.table-striped.table-hover'

// أزرار البحث
'input[type="submit"][value*="بحث"]'
'input[type="submit"][value*="استخراج"]'

// حقول التاريخ
'input[type="date"].datepicker'

// كلمات السر
'input[type="password"]'

// القوائم المنسدلة
'select[id*="DropDownList"]'

// رسائل الخطأ
'span:contains("Does Not Exist")'
'span:contains("Entity")'

// حقول ASP.NET
'#ctl00_ContentPlaceHolder1_*'
'input[id*="AccountNo"]'
'input[id*="AccountName"]'
```

### أعمدة تقرير inprogress.aspx (28 عمود)

| # | الاسم | القيمة | محدد مسبقاً |
|---|-------|--------|------------|
| 1 | البلاغ | `ticketnumber` | نعم |
| 2 | رقم الساب | `ldv_sapordernumber` | نعم |
| 3 | اسم العميل | `ldv_customername` | نعم |
| 4 | العنوان | `ldv_address` | لا |
| 5 | مشكلة الجهاز | `ldv_problem` | نعم |
| 6 | السنترال | `ldv_centraltelephone` | نعم |
| 7 | المنتج | `ldv_producttype` | نعم |
| 8 | الماركة | `ldv_brand` | لا |
| 9 | الموديل | `ldv_modelnumber` | نعم |
| 10 | الموديل الفعلى | `ldv_actualmodel` | نعم |
| 11 | سيريال1 | `ldv_productbarcode` | لا |
| 12 | السيريال2 | `ldv_productbarcodeatlsc` | لا |
| 13 | التقرير | `ldv_resourcelastcomment` | لا |
| 14 | سيريال محلية | `ldv_productbarcodeatlsc` | لا |
| 15 | تاريخ الحجز | `ldv_scheduledservicestartdate` | لا |
| 16 | تاريخ انشاء البلاغ | `createdon` | لا |
| 17 | تارخ الضمان | `ldv_warrantydate` | لا |
| 18 | حالة البلاغ | `statuscode` | نعم |
| 19 | قائمة الانتظار | `new_queue` | نعم |
| 20 | جهة الانشاء | `ldv_createdfrom` | نعم |
| 21 | ملاحظات الكول سنتر | `ldv_callcenternotes` | لا |
| 22 | ملاحظات الدعم الفنى | `ldv_technicalsupportnotes` | لا |
| 23 | ملاحظات التخطيط | `ldv_planningteamnotes` | لا |
| 24 | ملاحظات المكتب | `ldv_backofficenotes` | لا |
| 25 | حالة الاستبدال | `ldv_technicalsupportreplacementapproval` | لا |
| 26 | حالة السحب | `ldv_technicalsupportlscapproval` | لا |
| 27 | حالة قطع الغيار BO | `ldv_sparepartsshortage` | لا |
| 28 | حالة قطع الغيار PL | `ldv_sparepartsavailability` | لا |

### أعمدة تقرير inasc.aspx (29 عمود)
نفس inprogress.aspx مع إضافة:
| # | الاسم | القيمة |
|---|-------|--------|
| 4 | رقم الارضي | `ldv_landline` |

---

## ثالثاً: أنواع المنتجات

| الرمز | المنتج | Product Group |
|-------|--------|---------------|
| HA | أجهزة منزلية (Home Appliances) | HA |
| AC | تكييف (Air Conditioner) | HA |
| WM | غسالة (Washing Machine) | HA |
| RF | ثلاجة (Refrigerator) | HA |
| DW | غسالة أطباق (Dishwasher) | HA |
| RG | بوتجاز و مسطح و فرن (Range) | HA |
| WH | سخانات مياه (Water Heater) | HA |
| MR | مبرد مياه (Water Cooler) | HA |

---

## رابعاً: حالات البلاغ

| الحالة | القيمة | الوصف |
|--------|--------|-------|
| Scheduled | — | تم الجدولة |
| In Progress | — | قيد التنفيذ |
| Completed | — | مكتمل |
| Canceled | — | ملغي (يتم تجاهله في الاستخراج) |
| Postpone | — | مؤجل (يتم تجاهله في الاستخراج) |
| No Info | `753240001` | Out warranty (خارج الضمان) |

---

## خامساً: معلومات المستخدم

| البند | القيمة |
|-------|--------|
| المستخدم الحالي | `الامين-ASC-AC522` |
| رقم الحساب | `2000043359` |
| Account ID | `7707e653-ef63-ea11-a812-000d3ab953dd` |
| نوع البورتال | `963400001` |

---

## سادساً: معرفات الروابط في MainMoney.aspx

| الرابط | ID | الصفحة |
|--------|-----|--------|
| اصدار فاتورة | `LinkButton7` | AutoBuildWR.aspx |
| جاري مراجعتها | `LinkButton1` | inprogress.aspx |
| متوقف احتسابها | `LinkButton2` | inasc.aspx |
| مستحقات المراكز | `LinkButton5` | salaryasc2.aspx |
| Call-Center خارج الضمان | `LinkButton8` | SalaryASC.aspx |
| حوافز الفنيين | `LinkButton9` | mscreport.aspx |
| حركات الحساب SAP | `LinkButton3` | accountMovementSAP.aspx |
| حركات الحساب | `LinkButton4` | accountMovement.aspx |
| الفواتير المطلوبة | `LinkButton6` | billingneeded.aspx |
| طلبات المدفوعات | `LinkButton10` | Fawry.aspx |
| ايصالات المدفوعات | `LinkButton12` | FinancialReceipt.aspx |

---

*هذا الملف يُحدّث عند اكتشاف صفحات أو حقول جديدة في البورتال.*
