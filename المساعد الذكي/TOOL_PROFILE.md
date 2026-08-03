# بطاقة تعريف الأداة — المساعد الذكي
# Tool Profile — Smart Parts Assistant

> **آخر تحديث:** 2026-07-11

---

## معلومات أساسية / Basic Info

| البند | القيمة |
|-------|--------|
| **الاسم بالعربي** | المساعد الذكي لقطع غيار العربي |
| **الاسم بالإنجليزي** | Smart Parts Assistant — El Araby |
| **الإصدار** | v2.2 |
| **النوع** | Chrome Extension (Manifest V3) |
| **البورتال المستهدف** | PowerApps Portal (`elarabyportalpfs.powerappsportals.com`) |
| **اللغة** | JavaScript (ES2022) |
| **تاريخ الإنشاء** | 2026-05 |
| **آخر تحديث** | 2026-07-11 |
| **المطور** | Zain (Antigravity) |

---

## الغرض الرئيسي / Purpose

> إضافة متصفح شاملة لإدارة قطع غيار مراكز صيانة العربي — تقدم بحثاً ذكياً, حقن تلقائي للبيانات في البورتال, إدارة جرد العهدة, مزامنة بيانات, ولوحة تحكم متكاملة.

---

## الهيكل / Directory Structure

```
المساعد الذكي/
├── manifest.json              ← Manifest V3 — إعدادات الإضافة
├── background.js              ← Service Worker — معالجة الرسائل
├── AGENTS.md                  ← تعليمات للذكاء الاصطناعي
├── MASTER_REFERENCE.md        ← ملف المرجع الرئيسي
├── PROJECT_STATUS.md          ← حالة المشروع
├── TOOL_PROFILE.md            ← هذا الملف
├── README.md                  ← دليل الاستخدام
│
├── content/                   ← Content Scripts (تُحقن في البورتال)
│   ├── auto-filler.js         ← تعبئة بيانات قطع الغيار في النموذج
│   ├── scanner.js             ← ماسح ضوئي للبيانات
│   └── ui/
│       ├── shadow-panel.js    ← اللوحة المنبثقة عبر Shadow DOM
│       └── styles.css         ← أنماط اللوحة
│
├── dashboard/                 ← لوحة التحكم (صفحة HTML مستقلة)
│   ├── dashboard.html         ← واجهة لوحة التحكم
│   ├── dashboard.js           ← منطق لوحة التحكم
│   └── styles.css             ← أنماط لوحة التحكم
│
├── shared/                    ← كود مشترك
│   ├── db.js                  ← IndexedDB — كل عمليات قاعدة البيانات
│   ├── arabic-utils.js        ← أدوات النص العربي
│   ├── data-mapper.js         ← تعيين الأعمدة (عرب-إنجليزي)
│   └── smart-log.js           ← سجل العمليات
│
├── lib/                       ← مكتبات مساعدة
│   ├── papaparse.min.js       ← PapaParse لقراءة CSV
│   └── xlsx.full.min.js       ← SheetJS لقراءة/كتابة Excel
│
├── scripts/                   ← سكربتات المعالجة
│   ├── generateMasterData.cjs ← إنشاء البيانات الرئيسية
│   ├── merge-files.js         ← دمج ملفات Excel
│   └── portal-data-extractor.js ← استخراج بيانات البورتال
│
├── public/                    ← بيانات جاهزة
│   └── masterData.json        ← البيانات الرئيسية بصيغة JSON
│
├── icons/                     ← أيقونات الإضافة
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon128.svg
│
└── node_modules/              ← التبعيات المثبتة
```

---

## البنية التقنية / Architecture

### Manifest V3
```json
{
  "manifest_version": 3,
  "name": "مساعد قطع الغيار العربي",
  "version": "2.2",
  "permissions": ["storage", "unlimitedStorage", "activeTab", "scripting", "tabs", "alarms"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://elarabyportalpfs.powerappsportals.com/*"],
    "js": ["content/auto-filler.js", "content/scanner.js"],
    "run_at": "document_idle"
  }]
}
```

### تدفق البيانات
```
Excel/CSV → parseFileContent() → parseRowsToMasterData() → addBatch() → IndexedDB (masterData)
Dashboard → searchDB() → IndexedDB → showSearchResults()
Shadow Panel → bg('searchDB') → background.js → searchDB() → render
حقن → bg('injectData') → background.js → content.js → auto-filler.js → portal form
```

### قاعدة بيانات IndexedDB
- **الاسم:** `ElArabyPartsDB`
- **الإصدار:** 2
- **المخازن:**
  - `masterData` — بيانات قطع الغيار (مفهرس: sparePartCode, modelCode, defectCode, defectMajor, productGroup, productType, brand, source)
  - `inventory` — جرد العهدة (مفهرس: sparePartCode, location, code_location فريد)

---

## التبعيات / Dependencies

### مكتبات خارجية
| المكتبة | الإصدار | الغرض |
|---------|---------|-------|
| PapaParse | — | قراءة ملفات CSV |
| SheetJS (xlsx) | — | قراءة/كتابة ملفات Excel |
| IndexedDB API | — | قاعدة بيانات محلية (بدون Dexie) |

### لا يعتمد على
- Dexie.js (يستخدم IndexedDB API الخام)
- أي مكتبات UI frameworks
- أي مكتبات خارجية أخرى

---

## الميزات / Features

### البحث
- [x] بحث موحد بنمط `*text` (contains) و `text` (startsWith)
- [x] فلترة متتالية: ProductType → Model → DefectMajor → DefectDescription
- [x] قوائم منسدلة مع بحث (Searchable Dropdowns)
- [x] تصدير نتائج البحث إلى Excel

### حقن البيانات
- [x] حقن قطعة واحدة في نموذج البورتال
- [x] حقن متعدد (Multi-Inject) — حقن قطع متتالية بفاصل 1.5 ثانية
- [x] عربة التسوق (Cart) — إضافة/إزالة/مسح/حقن من اللوحة المنبثقة

### لوحة التحكم
- [x] عرض حالة قاعدة البيانات (عدد السجلات، آخر مزامنة)
- [x] معاينة أول 50 سجل
- [x] تبويب جرد العهدة مع فلترة
- [x] تبويب إدارة البيانات (إضافة يدوية)
- [x] تبويب سجل العمليات

### اللوحة المنبثقة في البورتال (Shadow Panel)
- [x] دائرة عائمة قابلة للسحب (موضعها محفوظ)
- [x] بحث في Shadow DOM مع فلترة
- [x] زر حقن + إضافة إلى السلة لكل نتيجة

### المزامنة
- [x] مزامنة من Google Drive (CSV/XLSX عبر URL)
- [x] رفع ملف محلي (CSV/XLSX)
- [x] معالجة الترميز (UTF-8, Win-1256, ISO-8859-6)

---

## نقاط القوة / Strengths

1. **بحث ذكي مع فلترة متتالية** — يتيح البحث عن قطع الغيار بطريقة سريعة ودقيقة
2. **حقن تلقائي في البورتال** — يوفر الوقت في تعبئة النماذج يدوياً
3. **عربة تسوق** — يتيح تجميع القطع قبل الحقن
4. **لوحة تحكم شاملة** — تدير كل شيء من مكان واحد
5. **Shadow DOM** — لا يتضارب مع أنماط البورتال
6. **بدون Dexie** — يستخدم IndexedDB API الخام مباشرة

---

## المشاكل المعروفة / Known Issues

1. **Edge Tracking Prevention** — `chrome.storage.local` لا يعمل في content scripts
   - **الحل:** كل التخزين يمر عبر `background.js`

2. **حجم البيانات الكبير** — 416K+ سجل في IndexedDB
   - **الحل:** تقطيع `sparePartDescription` إلى 200 حرف

---

## الخطوات القادمة / Roadmap

- [ ] إضافة تحميل متعدد للملفات المحلية
- [ ] دعم XML من البورتال
- [ ] إحصائيات متقدمة (أكثر القطع بحثاً، أكثر الماركات طلباً)
- [ ] تقارير PDF للجرد
- [ ] مزامنة تلقائية مع Google Drive (polling)
- [ ] وضع أوفلاین (offline mode) كامل
- [ ] ترجمة إنجليزية للواجهة مع تبديل لغة
- [ ] نسخ احتياطي لقاعدة البيانات (export IndexedDB)

---

## أوامر مفيدة / Useful Commands

```bash
# تشغيل خادم التطوير
npm run dev

# بناء للإنتاج
npm run build

# فحص الكود
npx tsc --noEmit
```

---

## الملفات المرتبطة / Related Files

| الملف | الوصف |
|-------|-------|
| `AGENTS.md` | تعليمات للذكاء الاصطناعي عند العمل على الكود |
| `PROJECT_STATUS.md` | حالة المشروع التفصيلية |
| `MASTER_REFERENCE.md` | ملف المرجع الرئيسي (بيانات البورتال) |
| `README.md` | دليل التثبيت والاستخدام |

---

*هذا الملف يُحدّث بعد كل إصدار أو تغيير كبير.*
