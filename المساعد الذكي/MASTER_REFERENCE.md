# 🔒 ملف المرجع الرئيسي - المساعد الذكي للأرقام (العربي)
## ⚠️ هذا الملف للحفظ والمرجعية فقط - لا تحذفه أو تعدّله

**تاريخ الإنشاء:** 2026-05-23  
**آخر تحديث:** 2026-05-23  
**الإصدار الحالي للسكريبت:** v13 (مزامنة Google Sheets)  
**رابط Google Sheets Web App:** `https://script.google.com/macros/s/AKfycbwlDrxzd2u4RjpZNg1EOecVwNcmip3nwe75hJIMrrPmaBnnwIZh4knxxpVUwS3V0Ui-jA/exec`

---

## 1️⃣ بيانات البورتال الأساسية

| البند | القيمة |
|---|---|
| **رابط الصفحة الرئيسية** | `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/` |
| **رابط تسجيل الدخول** | `https://elarabyportalpfs.powerappsportals.com/en-US/SignIn` |
| **Account ID** | `7707e653-ef63-ea11-a812-000d3ab953dd` |
| **نوع البورتال** | PowerApps Portals / Dataverse |
| **عدد الصفحات** | 2 صفحات (20 بلاغ لكل صفحة = حتى 40 بلاغ) |

---

## 2️⃣ 🔑 إعدادات البورتال المكتشفة (window.crmAccount)

```javascript
window.crmAccount = {
  accountId: '7707e653-ef63-ea11-a812-000d3ab953dd',
  changePassword: '0',
  accountType: 963400001,
  allowCancellation: true,
  futureCases: 963400002,
  hideCustomersPhones: false,   // ✅ الأرقام ظاهرة (الأدمن فعّلها)
  enableOverLapping: true,
  allowReschedule: true,
  allowInstallationCreation: true,
  allowMaintenanceCreation: true,
  allowDealerInstallation: false,
  allowOutsideInventory: true,
  showOtherMenu: true
};
```

> **⚠️ مهم:** إذا عاد `hideCustomersPhones` إلى `true` - الأرقام ستختفي من الجدول وسيحتاج السكريبت للبحث عبر API مرة أخرى.

---

## 3️⃣ 📊 بنية أعمدة جدول البلاغات (Orders Table)

| Index | اسم العمود | مثال |
|---|---|---|
| **[0]** | رقم الطلب (CAS) | `CAS2026051450930703` |
| **[1]** | اسم العميل | `هدير محمد محمد` |
| **[2]** | رقم العقار | `0` |
| **[3]** | العنوان | `القاهرة، شارع النصر...` |
| **[4]** | نوع المنتج | `ثلاجات` |
| **[5]** | ⭐ رقم الموبايل | `01098388669` |
| **[6]** | رقم شخص ذو صلة | `01098388669` |
| **[7]** | شكوى العميل | `GR01 - لا تبرد...` |
| **[8]** | تاريخ الحجز | `23/05/2026` |
| **[9]** | ملاحظات المكتب | `163496799 **بورسعيد` |
| **[10]** | ملاحظات الكول سنتر | _(غالباً فارغ)_ |
| **[11]** | نوع الخدمة | `صيانة` |
| **[12]** | يوجد شكوى | `لا` |
| **[13]** | ⭐ رقم SAP | `733093443` |
| **[14]** | جهة البلاغ | `متنقلة` |
| **[15]** | الفني المسؤول | _(غالباً فارغ)_ |
| **[16]** | Actions | `متابعة / ارجاع / توزيع` |

---

## 4️⃣ 📱 نماذج بيانات حقيقية من البورتال (مُستخرجة 2026-05-23)

```json
[
  {
    "cas": "CAS2026051450930703",
    "name": "هدير محمد محمد",
    "phone": "01098388669",
    "phone2": "01098388669",
    "sap": "733093443",
    "type": "ثلاجات",
    "service": "صيانة",
    "date": "23/05/2026"
  },
  {
    "cas": "CAS2026051650978894",
    "name": "سميه احمد محمد سليمان",
    "phone": "01030045292",
    "phone2": "",
    "sap": "733119978",
    "type": "ثلاجات",
    "service": "صيانة",
    "date": "23/05/2026"
  },
  {
    "cas": "CAS2026051851028517",
    "name": "احمد عوض جمال",
    "phone": "01018737444",
    "phone2": "01018737444",
    "sap": "733147265",
    "type": "صيانة دورية تكييف",
    "service": "صيانة",
    "date": "23/05/2026"
  }
]
```

---

## 5️⃣ 📐 Regex Patterns المستخدمة

| الهدف | Pattern | مثال |
|---|---|---|
| **رقم الموبايل المصري** | `/01[0-9]{9}/` | `01098388669` |
| **رقم CAS** | `/CAS\d+/` | `CAS2026051450930703` |
| **رقم SAP** | `/\b7[0-9]{7,9}\b/` | `733093443` |

---

## 6️⃣ 🔌 API Endpoints المكتشفة في البورتال

```
/_api/incidents?$top=100&$orderby=createdon desc
/_api/incidents?$filter=ticketnumber eq 'CAS...'
/_api/accounts?$top=100
/_api/accounts({customerId})
/_api/contacts({customerId})
/_api/msdyn_workorders?$top=100
```

---

## 7️⃣ 📄 الكود الكامل للسكريبت v11 (نسخة احتياطية)

**ملاحظة:** الكود الكامل محفوظ في:  
`scripts/portal-reveal-v11.js`

**المنطق الأساسي للقراءة المباشرة:**

```javascript
// قراءة صف واحد من الجدول بالـ index المباشر
function extractRow(tr, pageNum) {
  const tds = Array.from(tr.querySelectorAll('td'));
  if (tds.length < 6) return null;
  const get = (i) => (tds[i] ? tds[i].textContent.trim().replace(/\s+/g, ' ') : '');

  const casNo = get(0).match(/CAS\d+/)?.[0];
  if (!casNo) return null;

  return {
    orderNo: casNo,
    name:    get(1) || 'غير محدد',
    phone:   get(5).match(/01[0-9]{9}/)?.[0] || '',
    phone2:  get(6).match(/01[0-9]{9}/)?.[0] || '',
    sap:     get(13).match(/\b7[0-9]{7,9}\b/)?.[0] || '',
    type:    get(4)  || '',
    date:    get(8)  || '',
    service: get(11) || '',
    pageNum
  };
}

// جلب صفحة أخرى في الخلفية
async function fetchPage(pageNum) {
  let url = window.location.pathname + window.location.search;
  url = url.includes('page=')
    ? url.replace(/page=\d+/, `page=${pageNum}`)
    : url + (url.includes('?') ? '&' : '?') + `page=${pageNum}`;

  const html = await fetch(url, { credentials: 'same-origin' }).then(r => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table tbody tr').forEach(tr => {
    const data = extractRow(tr, pageNum);
    if (data) state.rows.push(data);
  });
}
```

---

## 8️⃣ 📥 تعليمات تثبيت Tampermonkey (خطوة بخطوة)

1. افتح متصفح Chrome
2. اذهب إلى: `chrome://extensions/`
3. ابحث عن **Tampermonkey** أو ثبّته من: https://www.tampermonkey.net/
4. اضغط على أيقونة Tampermonkey → **Create new script**
5. احذف الكود القديم بالكامل
6. افتح الملف: `scripts/portal-reveal-v11.js`
7. انسخ محتواه والصقه في Tampermonkey
8. اضغط `Ctrl + S` للحفظ
9. اذهب لصفحة البورتال وستجد 🤖 في أسفل اليمين

---

## 9️⃣ 🗺️ سجل الإصدارات

| الإصدار | الملف | الوصف |
|---|---|---|
| **v13** | `portal-reveal-v13.js` | ✅ الحالي - مزامنة سحابية صامتة مع Google Sheets وكشف العنوان |
| v12 | `portal-reveal-v12.js` | نظام طبقات متعددة (كشف إجباري + API + محلي) |
| v11 | `portal-reveal-v11.js` | قراءة مباشرة من أعمدة الجدول |
| v10 | `portal-reveal-v10-final.js` | قراءة بـ Regex + API fetch |
| v9 | `portal-reveal-v9-tampermonkey.js` | محاولة مزامنة الصفحات |
| v8 | `portal-reveal-v8-master.js` | نسخة مع دليل هاتف محلي |
| v6 | `portal-reveal-v6-pro.js` | نسخة احترافية مبكرة |
| v5 | `portal-reveal-v5-debug.js` | نسخة تشخيص |
| v3 | `portal-reveal-v3-quiet.js` | نسخة صامتة |
| v2 | `portal-reveal-v2.js` | نسخة مبكرة |

---

## 🔟 ⚡ سيناريوهات المشاكل والحلول

| المشكلة | السبب المحتمل | الحل |
|---|---|---|
| الأرقام اختفت | `hideCustomersPhones` عاد لـ `true` | استخدم API fetch كـ fallback |
| "جاري البحث" يعلق | فشل API أو timeout | أضف `fetchAttempted = true` بعد أول محاولة |
| الصفحة 2 لا تُجلب | مشكلة في URL أو AJAX | جرب GET مع `?page=2` |
| الأرقام مكررة | نفس العميل بأكثر من بلاغ | استخدم `Set` أو `Map` بالـ phone كـ key |
| SAP خاطئ | أرقام المكتب تبدأ بـ 7 أيضاً | تحقق أن SAP يبدأ بـ `73` تحديداً |

---

## 1️⃣1️⃣ 💾 localStorage Keys المستخدمة

```javascript
localStorage.getItem('elaraby_phone_directory')
// يخزن: { "اسم العميل": { name, phones: [], sap: [], lastUpdated } }
```

---

## 1️⃣2️⃣ 📝 ملاحظات مهمة

- البورتال يعرض **20 بلاغ لكل صفحة** (hard limit من PowerApps)
- `CAS` = Case Number = رقم الطلب/البلاغ
- `SAP` = رقم العميل في نظام SAP الداخلي لشركة العربي
- عمود [6] "رقم شخص ذو صلة" = رقم بديل للاتصال (أحياناً يكون مختلفاً عن [5])
- الجدول يُرتَّب تنازلياً حسب **تاريخ الإنشاء** (الأحدث أولاً)
- البيانات تُعرض في نطاق تاريخي محدد (filter بالتاريخ في أعلى الصفحة)

---

*آخر تحديث: 2026-05-23 | المطور: المساعد الذكي Antigravity*
