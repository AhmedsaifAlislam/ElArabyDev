# Portal AutoFiller — مساعد تعبئة أوامر العمل

> إضافة متصفح (Edge/Chrome MV3) لملء حقول صفحة **Work Order Review** في بوابة El Araby Partner Portal تلقائياً.

---

## 📦 هيكل الملفات

```
مساعد التقفيلات/
├── manifest.json
├── popup.html
├── popup.js
├── content-script.js
├── background.js
├── selectors.json          ← عدّل هذا الملف لضبط الـ selectors
├── styles/
│   └── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🚀 التثبيت (Developer Mode)

### Edge
1. افتح `edge://extensions`
2. فعّل **Developer mode** (المفتاح في الأسفل اليسار)
3. اضغط **Load unpacked**
4. اختر مجلد `مساعد التقفيلات`

### Chrome
1. افتح `chrome://extensions`
2. فعّل **Developer mode** (الزاوية العلوية اليمنى)
3. اضغط **Load unpacked**
4. اختر مجلد `مساعد التقفيلات`

> **ملاحظة**: يجب أن يحتوي المجلد على `manifest.json` مباشرةً (ليس داخل مجلد فرعي).

---

## 📝 تنسيقات الإدخال

### TAB 1 — بحث وتعبئة (مع OrderId)
```
OrderId: CAS2026041950492395 | Serial: 3200264225220034 | Brand: هوفر | Model: 32002642 | Status: No Info | Date: 26/05/2025
```

#### قائمة أوامر (Batch)
```
OrderId: CAS2026041950492395 | Serial: 1111111111 | Brand: كاندي | Model: A100 | Status: Under Warranty | Date: 01/01/2025
OrderId: CAS2026041950492396 | Serial: 2222222222 | Brand: هوفر  | Model: B200 | Status: No Info        | Date: 15/03/2025
```

#### فتح بدون تعبئة (رقم الأمر فقط)
```
CAS2026041950492395
```

### TAB 2 — تعبئة مباشرة (يجب أن تكون على صفحة Work Order Review)
```
Serial: 3200264225220034 | Brand: هوفر | Model: 32002642 | Status: No Info | Date: 26/05/2025
```

**الحقل الجديد**: `OrderId` — رقم أمر الشغل (CAS...)  
**الحقول الأخرى**: `Serial`, `Brand`, `Model`, `Status`, `Date`  
**الفاصل**: `|` أو `,`

---

## 🎯 طريقة الاستخدام

1. افتح صفحة **Work Order Review** في البوابة وتأكد من تسجيل دخولك.
2. اضغط أيقونة الإضافة في شريط الأدوات.
3. الصق السطر أو السطور في حقل الإدخال، أو اسحب/اختر ملف CSV.
4. اضبط **تأخير Batch** (المسافة الزمنية بين السطور).
5. اضغط:
   - **▶ سطر واحد**: لمعالجة أول سطر فقط في النص.
   - **📋 Batch**: لمعالجة جميع السطور متسلسلاً.
6. اضغط **⛔** لإيقاف Batch في أي وقت.
7. افتح تاب **📋 التقارير** لمراجعة النتائج والبحث فيها.

---

## ⚙️ ضبط الـ Selectors

> هذه هي الخطوة الأهم بعد التثبيت.

### أسلوب 1: تعديل selectors.json (موصى به)
1. افتح صفحة Work Order Review في البوابة.
2. افتح **DevTools** (F12) → Inspector.
3. حدد كل حقل، انسخ الـ selector المناسب (مثلاً `input[aria-label='Serial Number']`).
4. افتح `selectors.json` وحدّث المصفوفة المناسبة.
5. أعد تحميل الإضافة من `edge://extensions` (اضغط 🔄).

### أسلوب 2: Override سريع عبر Console (للاختبار السريع)
```javascript
// في DevTools Console على صفحة البوابة
localStorage.setItem('autofiller_selectors', JSON.stringify({
  serial:       ["input[aria-label='الرقم التسلسلي']"],
  brandBtn:     ["button[aria-label='البراند']"],
  modelInput:   ["input[aria-label='الموديل الفعلي']"],
  statusSelect: ["select[name='warrantyStatus']"],
  dateInput:    ["input[name='warrantyDate']"],
  nextBtn:      ["button#nextBtn"]
}));
```
> **ملاحظة**: هذا الـ override يُحمَّل أولاً ويتجاوز `selectors.json`. لإعادة الضبط، افتح Console ونفذ: `localStorage.removeItem('autofiller_selectors')`

### Selectors Priority
الكود يجرب الـ selectors بالترتيب ويختار أول عنصر موجود. كل حقل له array من المحاولات كـ fallback.

---

## 🧪 خطوات الاختبار

### اختبار سطر واحد
1. افتح صفحة Work Order Review جديدة.
2. الصق سطر اختبار واحد في الإضافة.
3. اضغط **▶ سطر واحد**.
4. راقب:
   - Console البوابة (F12): ابحث عن `[AutoFiller]` logs.
   - الـ overlay الصغير في أسفل يسار الصفحة.
   - تاب التقارير في الإضافة.

### اختبار Batch
1. جهّز 5 سطور CSV مختلفة.
2. الصق في الإضافة.
3. اضغط **📋 Batch**.
4. تحقق من counter التقدم.
5. اختبر الإيقاف بالضغط على **⛔** في منتصف العملية.

### التحقق من التقارير
```javascript
// في DevTools → Application → Storage → chrome.storage.local
// أو في Console:
chrome.storage.local.get({autoReports:[]}, d => console.log(d.autoReports));
```

---

## 🔴 حالات الفشل المعروفة وكيفية التعامل

| الحالة | السبب | الحل |
|--------|-------|------|
| `btn-not-found` | زر Lookup غير موجود | حدّث `brandBtn` أو `modelBtn` في selectors.json |
| `modal-timeout` | Modal الـ Lookup لم يظهر | زد `_lookupTimeout` في selectors.json |
| `no-match` | لم يُعثر على قيمة في modal | تحقق من أن قيمة Brand/Model موجودة في البوابة |
| `next-not-found` | زر Next غير موجود | حدّث `nextBtn` في selectors.json |
| `timeout-assumed-ok` | لم تظهر رسالة نجاح | يُحفظ التقرير كـ "محفوظ (timeout)" — افحص البوابة يدوياً |
| CSP Error في Console | البوابة ترفض الـ script | تواصل مع مدير النظام لإضافة `extension-id` للـ CSP whitelist |

---

## 📊 بنية التقرير JSON

```json
{
  "timestamp":   "2025-05-26T10:00:00.000Z",
  "url":         "https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=...",
  "customer":    "اسم العميل",
  "orderNumber": "WO-12345",
  "filled": {
    "serial": "3200264225220034",
    "brand":  "هوفر/كاندي",
    "model":  "32002642",
    "status": "No Info",
    "date":   "2025-05-26"
  },
  "fieldResults": {
    "serial":  { "ok": true },
    "brand":   { "ok": true, "selected": "هوفر/كاندي" },
    "model":   { "ok": true },
    "status":  { "ok": true, "selected": "No Info" },
    "date":    { "ok": true }
  },
  "saveResult": { "ok": true, "reason": "success-indicator" }
}
```

---

## 🌐 تفعيل Dataverse API (مستقبلاً)

إذا أصبح متاحاً OAuth token وصلاحيات Dataverse:
```javascript
// في background.js — أضف هذا في handleSaveReport()
const token = await getOAuthToken(); // implement via chrome.identity
await fetch('https://your-org.crm.dynamics.com/api/data/v9.1/annotations', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subject: 'AutoFill Report',
    notetext: JSON.stringify(report),
    'objectid_workorder@odata.bind': `/workorders(${workorderId})`
  })
});
```

---

## 📌 ملاحظات مهمة

- **لا تعمل الإضافة إلا على** `https://elarabyportalpfs.powerappsportals.com/*`
- يجب أن تكون صفحة **Work Order Review** مفتوحة ومتاحة للتعديل.
- رفع الملفات (attachments) يتطلب تفاعل يدوي لأسباب أمنية في المتصفح.
- التقارير تُخزن محلياً في المتصفح (حتى 200 تقرير).
