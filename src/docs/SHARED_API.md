# الواجهات المشتركة — Shared API
# El Araby System — Shared Code Reference

> **آخر تحديث:** 2026-07-11

---

## نظرة عامة

هذا الملف يوثق كل الدوال والواجهات المشتركة المتاحة في `master-portal/shared/`.

---

## 1. storage-proxy.js — الوسيط

### الدوال

| الدالة | المعاملات | الإرجاع | الوصف |
|--------|-----------|---------|-------|
| `storageGet(keys)` | `string\|string[]` | `Promise<Object>` | استرجاع بيانات |
| `storageSet(data)` | `Object` | `Promise<void>` | حفظ بيانات |
| `storageRemove(keys)` | `string[]` | `Promise<void>` | حذف مفاتيح |
| `bg(action, extra)` | `string, Object` | `Promise<any>` | إرسال رسالة لـ background |

### مثال الاستخدام
```javascript
// استرجاع
const data = await storageGet(['key1', 'key2']);
console.log(data.key1);

// حفظ
await storageSet({ key1: 'value1', key2: 'value2' });

// حذف
await storageRemove(['key1']);

// إرسال رسالة
const result = await bg('searchDB', { query: 'test' });
```

---

## 2. smart-log.js — السجل

### الدوال

| الدالة | المعاملات | الإرجاع | الوصف |
|--------|-----------|---------|-------|
| `logEvent(type, details)` | `string, Object` | `Promise<void>` | تسجيل عملية |
| `getLog(options)` | `Object` | `Promise<Array>` | استرجاع السجل |
| `clearLog()` | — | `Promise<void>` | مسح السجل |
| `exportLog()` | — | `Promise<void>` | تصدير السجل |

### أنواع العمليات
- `search` — بحث
- `import` — استيراد
- `inject` — حقن
- `cart_add` — إضافة للسلة
- `cart_remove` — إزالة من السلة
- `clear` — مسح

### مثال الاستخدام
```javascript
// تسجيل
await logEvent('search', { query: 'test', resultsCount: 5 });

// استرجاع
const entries = await getLog({ filter: 'all', search: '' });

// مسح
await clearLog();
```

---

## 3. arabic-utils.js — أدوات العربية

### الدوال

| الدالة | المعاملات | الإرجاع | الوصف |
|--------|-----------|---------|-------|
| `detectEncoding(bytes)` | `Uint8Array` | `string` | كشف الترميز |
| `decodeBytes(bytes, encoding)` | `Uint8Array, string` | `string` | فك الترميز |
| `removeBOM(text)` | `string` | `string` | إزالة BOM |
| `countArabic(text)` | `string` | `number` | عد الأحرف العربية |
| `cleanArabicText(text)` | `string` | `string` | تنظيف النص |
| `hasArabic(text)` | `string` | `boolean` | كشف العربية |
| `toEnglishNumbers(text)` | `string` | `string` | تحويل لأرقام إنجليزية |
| `toArabicNumbers(text)` | `string` | `string` | تحويل لأرقام عربية |

### مثال الاستخدام
```javascript
// كشف الترميز
const encoding = detectEncoding(uint8Array);

// فك الترميز
const text = decodeBytes(uint8Array, 'windows-1256');

// عد العربية
const count = countArabic('مرحبا بالعالم'); // 12

// تنظيف
const clean = cleanArabicText('  مرحبا   بالعالم  '); // 'مرحبا بالعالم'
```

---

## 4. data-mapper.js — محول البيانات

### الدوال

| الدالة | المعاملات | الإرجاع | الوصف |
|--------|-----------|---------|-------|
| `mapColumn(header)` | `string` | `string\|null` | تعيين رأس عمود |
| `mapColumns(headers)` | `string[]` | `Object` | تعيين مجموعة أعمدة |
| `getColumnValue(row, colMap, key)` | `string[], Object, string` | `string` | استخراج قيمة |
| `mapSAPColumns(headers)` | `string[]` | `Object` | تعيين أعمدة SAP |
| `getAvailableKeys()` | — | `string[]` | المفاتاحات المتاحة |
| `getAliases(key)` | `string` | `string[]` | الأسماء البديلة |

### مثال الاستخدام
```javascript
// تعيين عمود واحد
const key = mapColumn('اسم العميل'); // 'customerName'

// تعيين مجموعة أعمدة
const colMap = mapColumns(['بلاغ', 'رقم الساب', 'اسم العميل']);
// { caseNumber: 0, sapOrderNumber: 1, customerName: 2 }

// استخراج قيمة
const name = getColumnValue(row, colMap, 'customerName');
```

---

## 5. portal-selectors.js — محددات البورتال

### الهيكل

```javascript
PORTAL_SELECTORS = {
  POWERAPPS: {
    table: { ... },
    inputs: { ... },
    selects: { ... },
    buttons: { ... },
    links: { ... },
    display: { ... }
  },
  FINANCIAL: {
    menuLinks: { ... },
    searchFields: { ... },
    searchButtons: { ... },
    centerInfo: { ... },
    reportColumns: { ... }
  },
  CRM: {
    selectReport: { ... },
    searchPatterns: { ... },
    skipStatuses: [...]
  },
  COMMON: {
    links: { ... },
    inputs: { ... },
    selects: '...',
    buttons: '...',
    tables: '...',
    errors: { ... }
  }
}
```

### الدوال

| الدالة | المعاملات | الإرجاع | الوصف |
|--------|-----------|---------|-------|
| `findElement(selector, doc)` | `string, Document` | `Element\|null` | البحث في iframes |
| `findAllElements(selector, doc)` | `string, Document` | `Element[]` | البحث عن كل العناصر |

### مثال الاستخدام
```javascript
// البحث عن جدول في iframes
const table = findElement('table.entity-grid');

// البحث عن كل الأزرار
const buttons = findAllElements('input[type="submit"]');
```

---

## 6. portal-config.js — إعدادات البورتال

### الهيكل

```javascript
PORTAL_CONFIG = {
  PORTAL: {
    powerapps: { baseUrl, ordersUrl, signInUrl, workOrderUrl },
    crm: { baseUrl, mainUrl, selectReportUrl, mainMoneyUrl },
    asc: { baseUrl }
  },
  CRM_ACCOUNT: { accountId, accountType, ... },
  CURRENT_USER: { name, accountNumber, accountId },
  PRODUCT_TYPES: { AC, WM, RF, ... },
  BRANDS: { Hoover, Candy, ... },
  TICKET_STATUSES: { scheduled, inProgress, ... },
  PASSWORDS: { salaryasc2, accountMovement, ... },
  PATTERNS: { phone, cas, sap, account, ... },
  SEARCH: { batchSize, skipStatuses, debounceMs },
  STORAGE: { maxLogEntries, maxReports, dbName, dbVersion }
}
```

### مثال الاستخدام
```javascript
// الوصول للإعدادات
const ordersUrl = PORTAL_CONFIG.PORTAL.powerapps.ordersUrl;
const user = PORTAL_CONFIG.CURRENT_USER.name;

// Regex
const phone = text.match(PORTAL_CONFIG.PATTERNS.phone);
```

---

## كيفية الاستخدام في إضافة جديدة

```html
<!-- في popup.html -->
<script src="../shared/storage-proxy.js"></script>
<script src="../shared/smart-log.js"></script>
<script src="../shared/arabic-utils.js"></script>
<script src="../shared/data-mapper.js"></script>
<script src="../shared/portal-selectors.js"></script>
<script src="../shared/portal-config.js"></script>
```

```javascript
// في content-script.js
// كل الدوال متاحة مباشرة على window
const data = await storageGet(['key']);
await logEvent('search', { query: 'test' });
const table = findElement('table.entity-grid');
```
