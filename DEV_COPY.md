# ElArabyDev — نسخة التطوير

> **تاريخ الإنشاء:** 2026-08-03  
> **آخر تحديث هيكلة:** 2026-08-11 (إعادة تنظيم: src/ + deploy/ + legacy/)
> **المصدر:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم`  
> **الغرض:** نسخة عمل للتوحيد والتطوير، الأصل يبقى ثابتًا (مربوط بالإضافات)

---

## 🏗️ البنية الحديثة (من 2026-08-11)

```
ElArabyDev/
├── src/                          ← المصدر (Souces)
│   ├── unified-extension/        ← ★ المصدر الحقيقي الوحيد للإضافة الموحدة (MV3)
│   ├── dashboard/                ← لوحة التحكم (Vite + node_modules)
│   ├── crm-content/              ← سكريبت CRM (TypeScript)
│   ├── design-system/            ← نظام التصميم الموحد
│   ├── ui-components/            ← مكونات UI
│   ├── templates/ portal-config/ libraries/
│   ├── docs/                     ← PORTAL_REFERENCE.md + SHARED_API.md
│   └── shared/                   ← نسخة قديمة من المكتبات (مرجعية)
│
├── deploy/                       ← ★ المجلد الذي يُحمَّل في المتصفح (Load unpacked)
│   └── (نسخة نظيفة من unified-extension — بلا توثيق، 100% كود)
│
├── tools/                        ← أدوات التشغيل
│   ├── deploy.ps1                ← ★ نشر: src/unified-extension → deploy (مع نسخة احتياطية)
│   ├── sync-shared.ps1           ← مزامنة المكتبات المشتركة
│   └── excel_autofix/            ← أداة Python للتنسيق (إصدار العمل)
│
├── legacy/                       ← النسخ المنفصلة القديمة (مرجع/أرشيف، لا تُستخدم للتطوير)
│   ├── مساعد التقفيلات (نشر قديم)/  ← النشر السابق كاملاً قبل الهيكلة
│   ├── المساعد الذكي/  البحث عن بلاغ/  حجز البلاغات المستقبلة/
│   ├── portal-other-section/     ← التحليلات المالية (منفصلة قديمة)
│   ├── Rescheduling Portal Requests Optimization/
│   └── اكواد/                    ← صفحات HTML محفوظة من البورتال
│
├── backups/                      ← كل النسخ الاحتياطية
│   ├── backup-pre-unified-v4/
│   └── deploy_backup_*/          ← + يضيف deploy.ps1 نسخة عند كل نشر
│
└── *.md                          ← التوثيق المركزي (AGENTS, MASTER_README, PORTAL_MAP...)
```

> **القاعدة الأساسية (من AGENTS.md):** `العربي سيستم` = مرجع للقراءة فقط. كل التعديلات في `ElArabyDev` فقط.

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

## 🔧 آلية المزامنة والنشر (Source of Truth)

> **قاعدة ذهبية:** `ElArabyDev\src\unified-extension\shared\` هو **المصدر الوحيد** للمكتبات المشتركة،
> و`ElArabyDev\src\unified-extension\` هو **مصدر الإضافة الوحيد**.

### المكتبات المشتركة (13 ملف):
1. `storage-proxy.js` — وسيط التخزين (content ↔ background): `window.storageGet/Set/Remove/bg`
2. `smart-log.js` — سجل العمليات الموحد: `window.logEvent/getLog/clearLog/exportLog` + `SmartLog` (SW-safe)
3. `arabic-utils.js` — أدوات النص العربي: واجهة عامة + `ArabicUtils` (normalize/مرادفات)
4. `data-mapper.js` — تعيين الأعمدة: واجهة عامة (COLUMN_MAP) + `DataMapper` (HEADERS/findColumnValue)
5. `portal-selectors.js` — محددات DOM للبورتال (تشمل `POWERAPPS.fields` من selectors.json)
6. `portal-config.js` — PAGES/DOMAINS/SAP_KEYWORDS مركزية + isPortal/isCRM/getPageInfo
7. `message-bus.js` — ناقل رسائل موحد بين المكونات
8. `ai-client.js` — عميل AI موحد (ZEN) + MODEL_MAP + Tool Registry
9. `frame-walker.js` — مشي في الإطارات (walkFrames/findInFrames/FrameWalker)
10. `table-scraper.js` — اكتشاف واستخراج الجداول عبر iframes
11. `excel-exporter.js` — تصدير Excel موحد (ExcelJS + fallback CSV)
12. `n8n-client.js` — عميل n8n (webhook) 
13. `db.js` — قاعدة بيانات محلية (IndexedDB) لحجز البلاغات

### سكربت النشر (الأهم — يجيب على "ليه محدّث من مساعد التقفيلات؟"):
```
ElArabyDev\tools\deploy.ps1
```
**الوظيفة:** src\unified-extension → deploy\ (مع نسخة احتياطية تلقائية في backups\deploy_backup_*).
**متى يُشغل:** بعد أي تعديل في `src\unified-extension\` + لتحميل النسخة الجديدة في المتصفح.
**خطوات التحديث الكاملة:**
1. عدّل في `src\unified-extension\` (أو أي مجلد مصدر)
2. شغّل `tools\deploy.ps1`
3. افتح `edge://extensions` ← زر 🔄 Refresh على الإضافة

### سكريبت مزامنة المكتبات (فرعي):
```
ElArabyDev\tools\sync-shared.ps1
```
**الوظيفة:** ينسخ المكتبات من `src\unified-extension\shared\` إلى نسخ legacy المرجعية.

> **مجلد النشر في المتصفح = `ElArabyDev\deploy\`** — نظيف 100% (كود فقط، بلا توثيق/أرشيف).

---

## 🔄 إجراء التبديل في المتصفح

> **الطريقة الحالية (الاختبار الآمن):** نسخة التطوير تحمل الاسم **(Dev)** و ID مختلف (مشتق من المسار)،
> فتقدر تشغّلها **بجانب** الأصل بدون تعارض — وتلغي الأصل لاحقًا.

```powershell
# 1. افتح Edge على: edge://extensions
# 2. فعّل "Developer mode" (أعلى يمين)
# 3. اضغط "Load unpacked"
# 4. اختر المجلد: E:\My First Lap\MY WORKE\Apps\ElArabyDev\deploy
# 5. ستظهران معًا: الأصل باسمه العادي + الجديدة بـ "(Dev)"
```

**أثناء الاختبار — مهم جدًا:**
- **عطّل الإضافة الأصلية مؤقتًا** (زر التبديل في edge://extensions) — لأن الإضافتين تحقنان
  سكريبتات في نفس صفحة البورتال، وتشغيلهما معًا = لوحات مكررة وتداخل في التعبئة
- اختبار نسخة (Dev) أولًا، فإذا نجح كل شيء → امسح الأصل واحتفظ بالـ Dev
- للعودة للأصل: نفس الخطوات مع `E:\My First Lap\MY WORKE\Apps\العربي سيستم\مساعد التقفيلات`

**ملاحظة التخزين:** التخزين (`chrome.storage`) مرتبط بـ ID الإضافة — نسخة Dev لها تخزين مستقل
(بيانات نظيفة للاختبار، ولا تلمس بيانات الأصل).

> **بعد الهيكلة (2026-08-11):** مجلد النشر الجديد = `ElArabyDev\deploy\` — عند أي تحديث
> شغّل `tools\deploy.ps1` ثم اضغط 🔄 Refresh في edge://extensions (لا حاجة لإعادة Load unpacked).

---

## 📝 سجل التغييرات في ElArabyDev

| التاريخ | المرحلة | وصف | Commit |
|--------|---------|-----|--------|
| 2026-08-03 | Phase 0 | إنشاء نسخة ElArabyDev (robocopy مع استثناءات) + DEV_COPY.md + git init | `5ac3625` |
| 2026-08-03 | Phase 1 | إصلاح smart-log bug (`getWindow()` → `window`) + إنشاء `sync-shared.ps1` + أول مزامنة | `413dee3` |
| 2026-08-03 | Phase 2 | توحيد مساعد التقفيلات: المكتبات في manifest/popup، حذف storage المكرر، PORTAL_SELECTORS أساس للمحددات، tampermonkey عبر proxy | `91e4e51` |
| 2026-08-03 | Phase 3 | توحيد المساعد الذكي: مكتبات SW-safe (globalThis)، دمج ArabicUtils/DataMapper/SmartLog APIs، معالجات STORAGE_* في background، حذف bg()/logEvent المكررة | `53f76cf` |
| — | Phase 4 | توثيق + تبديل المتصفح + قرار المرحلة التالية | — |
| 2026-08-11 | **Restructure** | إعادة هيكلة الجذر: `master-portal/` → `src/`، `مساعد التقفيلات/` → `deploy/` (نظيف) + `legacy/` (أرشيف)، `excel_autofix/` → `tools/`، النسخ الاحتياطية → `backups/`، إنشاء `tools/deploy.ps1` (نشر من src → deploy بضغطة واحدة) | — |

---

## ⚠️ تنبيهات هامة

1. **لا تعدل في `العربي سيستم\` الأصلي** — هو baseline مستقر مربوط بالإضافات الحالية.
2. **كل تطوير في `ElArabyDev\src\` فقط** — المصدر الوحيد هو `src\unified-extension\`.
3. **`src\unified-extension\shared = مصدر واحد للمكتبات`** — لا تحرر نسخ `shared/` داخل الأدوات مباشرة.
4. **النشر عبر `tools\deploy.ps1`** — لا تعدّل `deploy\` يدوياً؛ أي تعديل هناك يضيع عند النشر التالي.
5. **`legacy/` و `backups/` للقراءة فقط** — لا تطوّر منها، فقط استنسخ عند الحاجة.

---

## 🎯 الهدف النهائي للمرحلة الحالية

- ✅ المصدر الموحد في `src\unified-extension\` (كل الميزات MV3)
- ✅ النشر النظيف في `deploy\` عبر `tools\deploy.ps1` (مع نسخ احتياطية تلقائية)
- ✅ المكتبات المشتركة موحدة (13 ملف) ومصدرها `src\unified-extension\shared\`
- ✅ التوثيق المركزي في الجذر + `docs/` مرجعي
- ⏳ الإضافة الجديدة تشتغل على البورتال بدون أخطاء console (يحتاج اختبار يدوي بعد التبديل في المتصفح)

---

*تم إنشاء هذا الملف تلقائيًا كجزء من Phase 0 — التحديث اليدوي مطلوب عند كل مرحلة.*