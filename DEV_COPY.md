# ElArabyDev — نسخة التطوير

> **تاريخ الإنشاء:** 2026-08-03  
> **المصدر:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم`  
> **الغرض:** نسخة عمل للتوحيد والتطوير، الأصل يبقى ثابتًا (مربوط بالإضافات)

---

## 📁 خريطة المجلدات

| المسار في ElArabyDev | المصدر الأصلي | ملاحظات |
|----------------------|--------------|---------|
| `ElArabyDev\excel_autofix` | `العربي سيستم\excel_autofix | مطابقة كاملة |
| `ElArabyDev\master-portal` | `العربي سيستم\master-portal` | **مصدر الحقيقة للمكتبات المشتركة** |
| `ElArabyDev\portal-other-section` | `العربي سيستم\portal-other-section` | مطابقة كاملة |
| `ElArabyDev\Rescheduling Portal Requests Optimization` | `العربي سيستم\Rescheduling Portal Requests Optimization` | مطابقة كاملة |
| `ElArabyDev\البحث عن بلاغ` | `العربي سيستم\البحث عن بلاغ` | مطابقة كاملة |
| `ElArabyDev\حجز البلاغات المستقبلة` | `العربي سيستم\حجز البلاغات المستقبلة` | مطابقة كاملة |
| `ElArabyDev\المساعد الذكي` | `العربي سيستم\المساعد الذكي` | **مستبعد:** ملفات البيانات الضخمة |
| `ElArabyDev\مساعد التقفيلات` | `العربي سيستم\مساعد التقفيلات` | **مستبعد:** فيديوهات، ملفات سجل، ملفات zip |
| `ElArabyDev\CHANGELOG.md` | `العربي سيستم\CHANGELOG.md` | سيتم تحديثه بالتغييرات الجديدة |
| `ElArabyDev\PORTAL_MAP.md` | `العربي سيستم\PORTAL_MAP.md` | سيتم تحديثه |
| `ElArabyDev\SHARED_KNOWLEDGE.md` | `العربي سيستم\SHARED_KNOWLEDGE.md` | سيتم تحديثه |
| `ElArabyDev\KNOWN_ISSUES.md` | `العربي سيستم\KNOWN_ISSUES.md` | سيتم تحديثه |
| `ElArabyDev\MASTER_README.md` | `العربي سيستم\MASTER_README.md` | نسخة ثابتة |

---

## 🚫 الملفات المستثناة (تم تجاهلها في النسخ)

| النمط | أمثلة | السبب | المكان الأصلي |
|--------|--------|-------|--------------|
| `*.mp4` | `Record_*.mp4`, `video.mp4`, `.tempmediaStorage\*.mp4` | فيديوهات تسجيل شاشة | `العربي سيستم\مساعد التقفيلات\a859e936-...\` + `البحث عن بلاغ\` |
| `master_data_merged*` | `.xlsx`, `.csv` (3 ملفات × ~200MB) | بيانات استيراد ضخمة | `العربي سيستم\` (الجذر) + `المساعد الذكي\scripts\` + `المساعد الذكي\public\` |
| `masterData.json` | 186 MB | بيانات قطع الغيار | `المساعد الذكي\public\` |
| `*.xlsx` (كبيرة) | `Active Model_Defect_SP *.xlsx` | ملفات Excel أصلية | `المساعد الذكي\` (الجذر + shared) |
| `*.csv` (كبيرة) | `Active Model_Defect_SP *.csv` | ملفات CSV أصلية | `المساعد الذكي\` |
| `*.zip` | `remix_*.zip` | أرشيفات قديمة | `مساعد التقفيلات\` |
| `node_modules` | — | تبعيات npm | `المساعد الذكي\node_modules\` |
| `AutoFiller_Conversation.jsonl` | 1.2 MB | سجل محادثات | `مساعد التقفيلات\` |
| `SmartScheduler_Conversation.jsonl` | 89 KB | سجل محادثات | `Rescheduling Portal Requests Optimization\` |
| `SpareParts_Conversation.jsonl` | 55 KB | سجل محادثات | `المساعد الذكي\` |
| `.tempmediaStorage` | مجلد كامل | صور مؤقتة | `مساعد التقفيلات\a859e936-...\` |

**الحجم الإجمالي المستثنى:** ~1.25 GB  
**الحجم المنسوخ:** ~110 MB (كود + توثيق + مكتبات + أيقونات)

---

## 🔧 آلية المزامنة (Source of Truth)

> **قاعدة ذهبية:** `ElArabyDev\master-portal\shared\` هو **المصدر الوحيد** للمكتبات المشتركة الخمس.

### المكتبات المشتركة (5 ملفات):
1. `storage-proxy.js` — وسيط التخزين (content ↔ background): `window.storageGet/Set/Remove/bg`
2. `smart-log.js` — سجل العمليات الموحد: `window.logEvent/getLog/clearLog/exportLog` + `SmartLog` (SW-safe)
3. `arabic-utils.js` — أدوات النص العربي: واجهة عامة + `ArabicUtils` (normalize/مرادفات)
4. `data-mapper.js` — تعيين الأعمدة: واجهة عامة (COLUMN_MAP) + `DataMapper` (HEADERS/findColumnValue)
5. `portal-selectors.js` — محددات DOM للبورتال (تشمل `POWERAPPS.fields` من selectors.json)

> **ملاحظة بيئات:** المكتبات الثلاث (smart-log, arabic-utils, data-mapper) تعمل في content scripts وصفحات الإضافة **و** background (service worker) — بلا أي مرجع `window`. storage-proxy و portal-selectors للصفحات فقط.

### سكريبت المزامنة:
```
ElArabyDev\sync-shared.ps1
```
**الوظيفة:** ينسخ الـ5 ملفات من `master-portal\shared\` إلى:
- `ElArabyDev\مساعد التقفيلات\shared\`
- `ElArabyDev\المساعد الذكي\shared\`

**متى يُشغل:** بعد أي تعديل في `master-portal\shared\` + قبل أي اختبار.

---

## 🔄 إجراء التبديل في المتصفح

> **الطريقة الحالية (الاختبار الآمن):** نسخة التطوير تحمل الاسم **(Dev)** و ID مختلف (مشتق من المسار)،
> فتقدر تشغّلها **بجانب** الأصل بدون تعارض — وتلغي الأصل لاحقًا.

```powershell
# 1. افتح Edge على: edge://extensions
# 2. فعّل "Developer mode" (أعلى يمين)
# 3. اضغط "Load unpacked"
# 4. اختر المجلد: E:\My First Lap\MY WORKE\Apps\ElArabyDev\مساعد التقفيلات
#    (أو ElArabyDev\المساعد الذكي)
# 5. ستظهران معًا: الأصل باسمه العادي + الجديدة بـ "(Dev)"
```

**أثناء الاختبار — مهم جدًا:**
- **عطّل الإضافة الأصلية مؤقتًا** (زر التبديل في edge://extensions) — لأن الإضافتين تحقنان
  سكريبتات في نفس صفحة البورتال، وتشغيلهما معًا = لوحات مكررة وتداخل في التعبئة
- اختبار نسخة (Dev) أولًا، فإذا نجح كل شيء → امسح الأصل واحتفظ بالـ Dev
- للعودة للأصل: نفس الخطوات مع `E:\My First Lap\MY WORKE\Apps\العربي سيستم\مساعد التقفيلات`

**ملاحظة التخزين:** التخزين (`chrome.storage`) مرتبط بـ ID الإضافة — نسخة Dev لها تخزين مستقل
(بيانات نظيفة للاختبار، ولا تلمس بيانات الأصل).

---

## 📝 سجل التغييرات في ElArabyDev

| التاريخ | المرحلة | وصف | Commit |
|--------|---------|-----|--------|
| 2026-08-03 | Phase 0 | إنشاء نسخة ElArabyDev (robocopy مع استثناءات) + DEV_COPY.md + git init | `5ac3625` |
| 2026-08-03 | Phase 1 | إصلاح smart-log bug (`getWindow()` → `window`) + إنشاء `sync-shared.ps1` + أول مزامنة | `413dee3` |
| 2026-08-03 | Phase 2 | توحيد مساعد التقفيلات: المكتبات في manifest/popup، حذف storage المكرر، PORTAL_SELECTORS أساس للمحددات، tampermonkey عبر proxy | `91e4e51` |
| 2026-08-03 | Phase 3 | توحيد المساعد الذكي: مكتبات SW-safe (globalThis)، دمج ArabicUtils/DataMapper/SmartLog APIs، معالجات STORAGE_* في background، حذف bg()/logEvent المكررة | `53f76cf` |
| — | Phase 4 | توثيق + تبديل المتصفح + قرار المرحلة التالية | — |

---

## ⚠️ تنبيهات هامة

1. **لا تعدل في `العربي سيستم\` الأصلي** — هو baseline مستقر مربوط بالإضافات الحالية.
2. **كل تطوير في `ElArabyDev\` فقط** — النسخ، التوحيد، الاختبارات.
3. **master-portal\shared = مصدر واحد** — لا تحرر نسخ `shared/` داخل الأدوات مباشرة، عدل المصدر وشغل `sync-shared.ps1`.
4. **Git يعمل داخل ElArabyDev فقط** — تاريخ التوحيد هنا، الأصل يبقى بلا Git.
5. **الملفات المستثناة متاحة في الأصل** — لو احتجت ملف بيانات للاختبار، انسخه يدويًا من الأصل.

---

## 🎯 الهدف النهائي للمرحلة الحالية

بعد إكمال Phase 1–4:
- ✅ المكتبات المشتركة موحدة ومستمدة من master-portal (تم — Phases 1–3)
- ✅ مساعد التقفيلات: storage-proxy + smart-log + arabic-utils + data-mapper + portal-selectors مدمجة (تم — Phase 2)
- ✅ المساعد الذكي: smart-log عبر background، bg() موحدة، النسخ المكررة محذوفة، إصلاح SW crash (تم — Phase 3)
- ✅ التوثيق محدث (CHANGELOG, TOOL_PROFILE, PROJECT_STATUS, SHARED_KNOWLEDGE)
- ⏳ الإضافة الجديدة تشتغل على البورتال بدون أخطاء console (يحتاج اختبار يدوي بعد التبديل في المتصفح)

---

*تم إنشاء هذا الملف تلقائيًا كجزء من Phase 0 — التحديث اليدوي مطلوب عند كل مرحلة.*