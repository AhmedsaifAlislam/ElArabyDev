# AGENTS.md — تعليمات للذكاء الاصطناعي

> هذا الملف يوجّه الذكاء الاصطناعي عند العمل على مشروع "المساعد الذكي — العربي".

## قواعد أساسية

1. **لا تعدل أي ملف دون قراءته أولاً** — اقرأ الملف كاملاً قبل إجراء أي تعديل.
2. **لا تحذف ملفات** —除非 المستخدم يطلب ذلك صراحة.
3. **استخدم Arabic للتعليقات والنصوص في UI** — كل واجهة المستخدم يجب أن تكون بالعربية (RTL).
4. **لا تستخدم Dexie** — IndexedDB API الخام فقط (لا مكتبات خارجية).
5. **الملفات والمجلدات بأسماء إنجليزية** — المحتوى العربي داخل الملفات مسموح.
6. **Manifest V3** — الإضافة تعمل على Chrome Manifest V3.
7. **Shadow DOM** — واجهة المستخدم في المواقع الخارجية (البورتال) تُحقن عبر Shadow DOM لتجنب تضارب الأنماط.
8. **التخزين** — `chrome.storage.local` لا يعمل في content scripts على Edge (Tracking Prevention). كل التخزين يمر عبر background.js.

## بنية المشروع

```
المساعد الذكي/
├── manifest.json          # Manifest V3
├── background.js          # الخلفية (Service Worker) — معالجة الرسائل
├── content/               # Content scripts (تُحقن في البورتال)
│   ├── auto-filler.js     # تعبئة بيانات قطع الغيار في النموذج
│   ├── scanner.js         # سحب بيانات العهدة من الجداول
│   └── ui/
│       ├── shadow-panel.js # اللوحة المنبثقة (Shadow DOM)
│       └── styles.css     # أنماط اللوحة المنبثقة
├── dashboard/             # لوحة التحكم (صفحة HTML مستقلة)
│   ├── dashboard.html
│   └── dashboard.js
├── shared/                # كود مشترك
│   ├── db.js              # IndexedDB — كل عمليات قاعدة البيانات
│   ├── smart-log.js       # سجل العمليات (chrome.storage.local عبر background)
│   └── data-mapper.js     # تحويل البيانات وتعيين الأعمدة (مرن: يدعم عربي/إنجليزي)
├── icons/                 # أيقونات الإضافة
├── lib/                   # مكتبات مساعدة
```

## أنماط الكود المهمة

### الاتصال بـ background.js
```javascript
function bg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, (res) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res);
    });
  });
}
```

### IndexedDB (ممنوع استخدام Dexie)
- الفتح: `openDB()` في `shared/db.js`
- المخازن: `masterData` (مفهرس: sparePartCode, modelCode, defectCode, defectMajor, productGroup, productType, source), `inventory` (مفهرس: sparePartCode, location, code_location فريد)
- كل الدوال المصدرة: `searchDB, getPreview, getMasterDataFilters, addBatch, getDBCount, clearStore, getInventoryWithMasterData, checkCodesStatus, getPricesForCodes, getInventoryFilters, addMasterDataItems`

### البحث
- `*text` → بحث بالاحتوائية (contains)
- `text` → بحث بالبداية (startsWith)
- البحث غير حساس لحالة الأحرف (case-insensitive)

### السجل (Smart Log)
```javascript
bg('LOG_EVENT', { type: 'search', details: { query: '...', resultsCount: 0 } });
bg('GET_LOG', { filter: 'all', search: '' });  // returns entries
bg('CLEAR_LOG');  // مسح الكل
```

## عند ظهور مشكلة

1. حدد موقع المشكلة (dashboard, shadow-panel, background, db)
2. اقرأ الكود المرتبط كاملاً
3. تحقق من تدفق الأحداث (event flow) — خاصة أثناء التهيئة
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## المتغيرات العامة الهامة

- `searchResults` — نتائج البحث الحالية في dashboard
- `filterRelations` — علاقات الفلترة المتتالية `{ modelsByType, defectMajorsByModel, defectDescsByMajor }`
- `currentFilterValues` — قيم الفلاتر الحالية `{ productType, model, defectMajor, defectDesc }`
- `searchDebounce` — مؤقت debounce للبحث (350ms)

## دوال الفلترة المتتالية

```
تغيير المنتج (productType) → cascadeModels() → populate model → change event
  → cascadeMajors() → populate defectMajor → change event
    → cascadeDefects() → populate defectDesc → change event
      → doSearch()
```

ملاحظة: `doSearch()` تُستدعى من كل مستوى في السلسلة، آخر استدعاء يحمل القيم الصحيحة الكاملة.

## ملاحظات إضافية

- API IndexedDB غير متزامن بالكامل — استخدم `async/await` أو Promises
- Content scripts لا يمكنها الوصول لـ `chrome.storage.local` على Edge — دائماً استخدم background.js كوسيط
- زر الفأرة الأيمن على الأيقونة → "فتح لوحة التحكم" يفتح `dashboard.html` في تاب جديد