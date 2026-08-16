# SMART_ASSISTANT_ARCHITECTURE.md — تصميم معماري: المساعد الذكي (Phase 4)

> **المشروع:** المساعد الذكي — العربي (مستقل، لا يلمس ElArabyDev)
> **الحالة:** وثيقة تصميم جاهزة للتنفيذ عند بدء Phase 4
> **التاريخ:** 2026-08-14

---

## 1. المكونات الأربعة

| المكوّن | النوع | الموقع | الوظيفة |
|---------|-------|--------|---------|
| Dashboard | HTML page (chrome-extension) | `dashboard/` | واجهة بحث/عرض/فلترة قطع الغيار |
| Shadow Panel | Content script (Shadow DOM) | `content/ui/shadow-panel.js` | واجهة ظل على البورتال |
| Background | Service Worker | `background.js` | وسيط تخزين + رسائل + IndexedDB proxy |
| IndexedDB | DB (raw API) | `shared/db.js` | masterData + inventory مخازن |

---

## 2. مخطط IndexedDB (Schema)

### مخزن masterData
| Index | KeyPath | ملاحظات |
|-------|---------|---------|
| sparePartCode | sparePartCode | كود قطعة الغيار |
| modelCode | modelCode | كود الموديل |
| defectCode | defectCode | كود العطل |
| defectMajor | defectMajor | تصنيف العطل الرئيسي |
| productGroup | productGroup | مجموعة المنتج |
| productType | productType | نوع المنتج |
| source | source | مصدر البيانات |
| code_location (فريد) | [sparePartCode, location] | فريد مركّب |

### مخزن inventory
| Index | KeyPath | ملاحظات |
|-------|---------|---------|
| sparePartCode | sparePartCode | |
| location | location | |
| code_location (فريد) | [sparePartCode, location] | فريد مركّب |

### دوال مصدّرة من db.js
`searchDB, getPreview, getMasterDataFilters, addBatch, getDBCount, clearStore, getInventoryWithMasterData, checkCodesStatus, getPricesForCodes, getInventoryFilters, addMasterDataItems`

---

## 3. State Management (Event-driven Pub/Sub)

- **Hub**: background.js يستقبل `LOG_EVENT` / `GET_LOG` / `CLEAR_LOG`
- **Event flow**: UI → `bg(action, payload)` → background → IndexedDB → response
- **قاعدة**: كل الوصول لـ chrome.storage عبر background فقط (Edge Tracking Prevention)

---

## 4. Cascade Filters Data Flow

```
تغيير productType → cascadeModels() → populate model → change event
  → cascadeMajors() → populate defectMajor → change event
    → cascadeDefects() → populate defectDesc → change event
      → doSearch()  (آخر استدعاء يحمل القيم الصحيحة الكاملة)
```

- `searchResults` — نتائج البحث الحالية
- `filterRelations` — `{ modelsByType, defectMajorsByModel, defectDescsByMajor }`
- `currentFilterValues` — `{ productType, model, defectMajor, defectDesc }`
- `searchDebounce` — 350ms

---

## 5. Message Protocol

| Action | Payload | Response |
|--------|---------|----------|
| `LOG_EVENT` | `{ type, details }` | `{ ok }` |
| `GET_LOG` | `{ filter, search }` | entries |
| `CLEAR_LOG` | — | `{ ok }` |
| `SEARCH` | `{ text, mode }` | results |
| `ADD_BATCH` | items[] | `{ count }` |

---

## 6. التكامل مع ElArabyDev

| وحدة مشتركة | الاستخدام |
|-------------|-----------|
| `shared/arabic-utils.js` | تطبيع عربي |
| `shared/portal-selectors.js` | محددات البورتال |
| `shared/smart-log.js` | سجل موحد |
| `shared/data-mapper.js` | تعيين الأعمدة |

---

## 7. هيكل ملفات مقترح

```
المساعد الذكي/
├── manifest.json
├── background.js
├── content/
│   ├── auto-filler.js
│   ├── scanner.js
│   └── ui/
│       ├── shadow-panel.js
│       └── styles.css
├── dashboard/
│   ├── dashboard.html
│   └── dashboard.js
├── shared/
│   ├── db.js
│   ├── smart-log.js
│   └── data-mapper.js
├── icons/
└── lib/
```

---

## 8. قرارات معمارية (Decisions Log)

| القرار | السبب |
|--------|-------|
| IndexedDB raw API فقط (لا Dexie) | AGENTS.md إلزام |
| Shadow DOM للواجهة المحقونة | تجنب تضارب الأنماط |
| كل التخزين عبر background | Tracking Prevention على Edge |
| أسماء ملفات إنجليزية + محتوى عربي | AGENTS.md إلزام |
| البحث: `*text` contains / `text` startsWith | سلوك موثق |

---

## 9. مخاطر

| الخطر | التخفيف |
|-------|---------|
| IndexedDB حجم كبير | فهرسة صحيحة + pagination |
| تعارض Shadow Panel مع DOM البورتال | shadow root معزول |
| بطء cascade filters | debounce + cache |
