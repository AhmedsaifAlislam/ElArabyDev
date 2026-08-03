# المعرفة المشتركة — Shared Knowledge
# El Araby System — Common Patterns & Reference

> **آخر تحديث:** 2026-07-14

---

## أولًا: أنماط الاستهداف المشتركة / Common Selectors

### البحث عن العناصر في iframes (PowerApps Portal)

```javascript
// ⚠️ البورتال يعمل على PowerApps — الجداول دائماً داخل iframes
// ❌ غلط — لن يجد الجدول على البورتال
const table = document.querySelector('table');

// ✅ صحيح — يبحث في main + كل الـ iframes
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

### البحث في صفحات ASP.NET (CRM Portal)

```javascript
// البحث عن جدول النتائج
const table = document.getElementById('ContentPlaceHolder1_GridView1');

// البحث عن حقول الإدخال
const textBox = document.getElementById('ContentPlaceHolder1_TextBox1');
const dropDown = document.getElementById('ContentPlaceHolder1_DropDownList1');
const button = document.getElementById('ContentPlaceHolder1_Button1');

// البحث عن روابط PostBack
const links = document.querySelectorAll('a[href*="doPostBack"]');
const sameframeLinks = document.querySelectorAll('a.sameframe');
```

---

## ثانيًا: أنماط التخزين / Storage Patterns

### Edge Tracking Prevention

```javascript
// ⚠️ Edge يمنع chrome.storage.local من content scripts على صفحات البورتال
// الحل: وجّه كل عمليات التخزين عبر background.js

// من content script → background (Storage Proxy)
async function storageGet(keys) {
  const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys });
  return resp?.data || {};
}

async function storageSet(data) {
  await chrome.runtime.sendMessage({ type: 'STORAGE_SET', data });
}

async function storageRemove(keys) {
  await chrome.runtime.sendMessage({ type: 'STORAGE_REMOVE', keys });
}

// من popup → content script
chrome.tabs.sendMessage(tabId, { action: 'ACTION_NAME', ... });
```

### نموذج الاتصال بـ background.js

```javascript
function bg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, (res) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res);
    });
  });
}

// الاستخدام:
const data = await bg('searchDB', { query: 'test' });
await bg('LOG_EVENT', { type: 'search', details: { query: 'test' } });
```

---

## ثالثًا: أنماط POSTBack / POSTBack Patterns

### كيف يعمل __doPostBack

```html
<!-- شكل الرابط في HTML -->
<a id="LinkButton1" href="javascript:__doPostBack('ctl00$LinkButton1','')">
    جاري مراجعتها
</a>
```

```javascript
// آلية العمل:
// 1. المستخدم يضغط على الرابط
// 2. __doPostBack تملأ حقولاً مخفية:
//    - __EVENTTARGET = 'ctl00$LinkButton1'
//    - __EVENTARGUMENT = ''
// 3. الفورم يُرسل بالكامل (POST)
// 4. السيرفر يعالج الطلب ويعيد الصفحة الجديدة
// 5. لا يوجد AJAX — كل عملية PostBack كاملة

// الطريقة الصحيحة للتنقل:
const link = document.getElementById('LinkButton1');
link.click();  // يستدعي __doPostBack تلقائياً

// ❌ لا تستخدم:
// window.location.href = 'inprogress.aspx'  ← لن يعمل لأنه بدون session
// fetch('/ASPPage/inprogress.aspx')  ← لن يعمل لأنه يحتاج PostBack كامل
```

---

## رابعًا: أنماط حقن السكريبتات / Script Injection Patterns

### على مواقع CSP صارم (Facebook, Messenger)

```javascript
// ❌ لا تستخدم eval() أبداً — CSP بيحظروا
eval(someCode);
document.createElement('script').textContent = someCode;

// ✅ الحل: chrome.scripting.executeScript مع files parameter
chrome.scripting.executeScript({
  target: { tabId: tabId },
  files: ['script.js'],
  world: 'MAIN'  // عشان السكريبت يشتغل في سياق الصفحة
});

// ⚠️ السكريبتات المخصصة (المُرفوعة كملفات) لا يمكن حقنها عبر files على مواقع CSP
// الحل: المستخدم ينسخ الكود والصقه يدوياً في Console (F12)
```

### حقن السكريبتات في البورتال

```javascript
// على PowerApps Portal — يمكن حقن السكريبتات عبر content scripts
// الملفات المدعومة في manifest.json:
{
  "content_scripts": [{
    "matches": ["https://elarabyportalpfs.powerappsportals.com/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }]
}
```

---

## خامسًا: أنماط قاعدة البيانات / Database Patterns

### IndexedDB (ممنوع استخدام Dexie)

```javascript
// الفتح
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ElArabyPartsDB', 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('masterData')) {
        const store = db.createObjectStore('masterData', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sparePartCode', 'sparePartCode', { unique: false });
        store.createIndex('modelCode', 'modelCode', { unique: false });
        store.createIndex('defectCode', 'defectCode', { unique: false });
      }
      if (!db.objectStoreNames.contains('inventory')) {
        const store = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sparePartCode', 'sparePartCode', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// البحث
async function searchDB(query) {
  const db = await openDB();
  const tx = db.transaction('masterData', 'readonly');
  const store = tx.objectStore('masterData');
  const results = [];
  
  return new Promise((resolve) => {
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const row = cursor.value;
        if (row.sparePartCode.includes(query) || row.modelCode.includes(query)) {
          results.push(row);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}
```

---

## سادسًا: أنماط البحث / Search Patterns

```javascript
// البحث غير حساس لحالة الأحرف
const query = 'test';
const isContains = query.startsWith('*');
const searchText = isContains ? query.slice(1) : query;

// *text → بحث بالاحتوائية (contains)
// text → بحث بالبداية (startsWith)

if (isContains) {
  return value.toLowerCase().includes(searchText.toLowerCase());
} else {
  return value.toLowerCase().startsWith(searchText.toLowerCase());
}
```

---

## سابعًا: أنماط تصدير البيانات / Export Patterns

### تصدير CSV

```javascript
function exportToCSV(data, filename) {
  let csv = '\uFEFF';  // BOM for UTF-8
  csv += data.headers.join(',') + '\n';
  data.rows.forEach(row => {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### تصدير Excel (عبر SheetJS)

```javascript
function exportToExcel(data, filename) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}
```

---

## ثامنًا: Regex Patterns الشائعة

| الهدف | Pattern | مثال |
|-------|---------|------|
| رقم موبايل مصري | `/01[0-9]{9}/` | `01098388669` |
| رقم CAS | `/CAS\d+/` | `CAS2026051450930703` |
| رقم SAP | `/\b7[0-9]{7,9}\b/` | `733093443` |
| رقم حساب (يبدأ بـ 200) | `/\b(200\d{7})\b/` | `2000043359` |
| رقم حساب عام | `/(?:رقم\s*(?:الحساب|العميل)|Account\s*(?:No|Number|ID))[\s:]*([0-9]{6,})/i` | — |

---

## تاسعًا: أنواع المنتجات والماركات

### المنتجات

| الرمز | المنتج بالعربي | المنتج بالإنجليزي |
|-------|---------------|-------------------|
| AC | تكييف | Air Conditioner |
| WM | غسالة | Washing Machine |
| RF | ثلاجة | Refrigerator |
| DW | غسالة أطباق | Dishwasher |
| RG | بوتجاز و مسطح و فرن | Range |
| WH | سخانات مياه | Water Heater |
| MR | مبرد مياه | Water Cooler |

### الماركات

| الماركة | الاسم بالإنجليزي |
|---------|-------------------|
| هوفر | Hoover |
| كاندي | Candy |
| بريليانس | Brilliance |
| يونيون اير | Union Air |
| لوران | Laurant |
| تورنيدو | Tornado |

---

## عاشراً: حالات البلاغ

| الحالة بالعربي | الحالة بالإنجليزي | القيمة | ملاحظات |
|---------------|-------------------|--------|---------|
| مجدول | Scheduled | — | تم الجدولة |
| قيد التنفيذ | In Progress | — | الفني ذهب يصلح |
| مكتمل | Completed | — | تم الانتهاء |
| ملغي | Canceled | — | يتم تجاهله في الاستخراج |
| مؤجل | Postpone | — | يتم تجاهله في الاستخراج |
| خارج الضمان | Out Warranty | `753240001` | No Info |

---

## الحادي عشر: قواعد iframes على PowerApps

```javascript
// البورتال يعمل على PowerApps — الجداول والعناصر دائماً داخل iframes
// ⚠️ عند البحث عن أي عنصر DOM (جدول، زر، رابط):
// يجب دائماً البحث في document + كل الـ iframes

// لا تكتفي بالبحث في document فقط — لن تجد شيء!

function findAllElements(selector, doc = document) {
  const results = [...doc.querySelectorAll(selector)];
  
  for (const iframe of doc.querySelectorAll('iframe')) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      results.push(...findAllElements(selector, iDoc));
    } catch (e) { /* cross-origin */ }
  }
  
  return results;
}
```

---

## الثاني عشر: قواعد CSP على Facebook/Messenger

```javascript
// ⚠️ على مواقع CSP صارم (Messenger, Facebook):
// - يمنع <script> tags
// - يمنع eval()
// - يمنع new Function()

// ❌ غلط:
eval(code);
document.createElement('script').textContent = code;
new Function(code)();

// ✅ الحل: chrome.scripting.executeScript مع files parameter
// حقن Chrome Extension API بيتخطى CSP تلقائياً

// للسكريبتات المخصصة (المُرفوعة كملفات):
// لا يمكن حقنها عبر files على مواقع CSP
// الحل: المستخدم ينسخ الكود والصقه يدوياً في Console (F12)
```

---

## الثالث عشر: أنماط السجل (Smart Log)

```javascript
// تسجيل عمليات البحث
bg('LOG_EVENT', {
  type: 'search',
  details: { query: 'test', resultsCount: 5 }
});

// استرجاع السجل
const entries = await bg('GET_LOG', { filter: 'all', search: '' });

// مسح السجل
await bg('CLEAR_LOG');

// هيكل السجل:
{
  type: 'search' | 'import' | 'clear' | 'inject' | 'cart_add' | 'cart_remove',
  details: { query, resultsCount, fileName, partCode, quantity },
  timestamp: '2026-07-11T10:30:00.000Z'
}
```

---

## الرابع عشر: أنماط IndexedDB المشتركة

### المخازن

```javascript
// masterData — بيانات قطع الغيار
{
  id: auto-increment,
  modelCode: 'AC-001',
  modelDescription: 'تكييف هيونداي 1.5 حصان',
  sparePartCode: 'SP001',
  sparePartDescription: 'كمبروسور',
  defectCode: 'FW0200',
  defectDescription: 'عطل في الموتور',
  defectMajor: 'Electrical',
  productType: 'Air Conditioner',
  productGroup: 'HA',
  maxQuantity: 1,
  price: 1500,
  source: 'master_data'
}

// inventory — جرد العهدة
{
  id: auto-increment,
  sparePartCode: 'SP001',
  sparePartDescription: 'كمبروسور',
  quantity: 5,
  location: 'المخزن الرئيسي'
}
```

---

## السادس عشر: مكتبات إضافية مكتشفة

### Signature/Ink Control

مكتبة التوقيع الرقمي المستخدمة في صفحة `inspection-case-without-PhoneNumbers`:

```javascript
// تعمل كـ<input type="text"> عادي لكن تعرض توقيع رقمي
// التواقيع تُرسل كـ base64 encoded strings
// تُستخدم في فحص البلاغات (معاينة الحالة)
```

### Choices.js

مكتبة القوائم المتعددة المستخدمة في واجهات التقارير:

```html
<select class="form-control" multiple="multiple">
  <!-- Choices.js يحولها لقوائم متعددة الاختيار -->
</select>
```

```javascript
const choices = new Choices(element, {
  removeItemButton: true,
  searchEnabled: true,
  placeholder: true,
  noResultsText: 'لا توجد نتائج'
});
```

### daterangepicker

محدد النطاق الزمني المستخدم في صفحات `technicalreviewdetails`:

```javascript
$(element).daterangepicker({
  locale: { format: 'DD/MM/YYYY', direction: 'rtl' },
  autoUpdateInput: true
});
```

### Moment.js + Timezone

معالجة التاريخ والوقت في `order-extractor.js`:

```javascript
moment(scheduledDate).format('DD/MM/YYYY');
moment.tz(date, 'Africa/Cairo').format('YYYY-MM-DD');
```

---

## السابع عشر: أوامر مفيدة

```bash
# تشغيل خادم التطوير
npm run dev

# بناء للإنتاج
npm run build

# فحص الكود
npx tsc --noEmit

# تنظيف node_modules
rm -rf node_modules && npm install

# تشغيل أداة Python
pip install customtkinter openpyxl
python excel_app.py
```

---

*هذا الملف يُحدّث عند اكتشاف أنماط جديدة مشتركة بين الأدوات.*
