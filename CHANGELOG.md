# سجل التغييرات — Changelog
# El Araby System — Complete Changelog

> **تنسيق:** [Keep a Changelog](https://keepachangelog.com/)
> **الإصدار:** يتبع [Semantic Versioning](https://semver.org/)
---

## [2026-10-18] — الموجة 5: مسار «الزيارة الثانية» (Autofill)

### إصلاح (Fix) — حرجة
- **«زيارة ثانية» كانت تُتخطّى بالكامل:** شرط تخطي الصفحة الأولى في `engine-orchestrator.js` لم يكن يستثني وضع الزيارة الثانية، فأي بلاغ سبق معالجته (فيه رقم مسلسل) تُتخطّى صفحته الأولى فورًا: لا علامة/موديل/مسلسل **ولا تاريخ ضمان**، ثم يرفض السيرفر الإرسال:
  `تاريخ الضمان must have a valid date format. Example: {1}`
- **الحل (مطابقة V2 حرفيًا):** `!data.secondVisitMode` في شرط التخطي، و`data.secondVisitMode ||` في `needsPage3` (الزيارة الثانية تذهب دائمًا للصفحة الثالثة).

### تحقق (Verification)
- القسم 12 في `tools/tests/unification-smoke.js` — فحصان ساكنان، **56 فحصًا / 0 إخفاق**، وأُثبت أنهما غير شكليين (إخفاقان عند إرجاع العلّة).
- تشغيل الكود الحقيقي على DOM وهمي لأمر `CAS2026101754045578` بنوع «بوتوجاز»: تاريخ الضمان المكتوب = `17/10/2026` (يوم/شهر/سنة).
- `tools/deploy.ps1` ناجح، ومطابقة `src` ↔ `deploy` بالكامل.

---

## [2026-10-18] — الموجة 4 (فرعية): تقوية control-panel.js (Security, Performance, Maintainability)

### الأمن (Security)
- **XSS sanitization:** إضافة `escapeHtml` محلية (مطابقة لـ `popup.js`/`dashboard.js`) وتغليف القيم الديناميكية في موقعين `innerHTML`:
  - سطر 1209 (`updateDeviceInfo`): اسم الجهاز من `readDeviceHint()`
  - سطر 1952 (`refreshCopiedCodesPreview`): ملخص الأكواد من الحافظة/التخزين
- **localStorage hardening:** دالة `safeParseJSON(raw, fallback)` مع تحقق شكل الكائن، مطبقة في `loadState()` و `refreshCopiedCodesPreview()`
- **Eliminated `window.prompt`:** استبدال المسار الاحتياطي لـ "لصق JSON يدويًا" بحقل `textarea` داخل اللوحة (تبويب PAGE_3) مع أزرار تطبيق/إلغاء

### الأداء (Performance)
- **Consolidated timers:** دمج 4 `setInterval` منفصلين (4ث، 1.2ث، 1.5ث، 10ث) في **نبضة واحدة 1.2ث** مع عدادات
- **Removed reinject guard:** إلغاء حارس إعادة الحقن الدوري (4ث) — الاعتماد على `MutationObserver` للكشف عن إزالة اللوحة
- **MutationObserver throttling:** إضافة buffer للتفريغ مع النبضة، تقليل استدعاءات `logPage` بنسبة كبيرة

### الصيانة (Maintainability)
- **Unified iframe traversal:** 19 موضع عبور `iframe` يدوي مستبدل بدوال موحدة:
  - `getShallowDocs()` — سلوك حالي (main + iframes مستوى أول)
  - `getAllDocs()` — تعاقبي عبر `shared/frame-walker.js` عند الحاجة
  - `findFirstInFrames()` / `findAllInFrames()` — بحث موحد
- **manifest.json:** إضافة `shared/frame-walker.js` للكتلة الثانية لضمان ترتيب التحميل قبل `control-panel.js`
- **TypeScript/Build-free:** لا تغييرات في مسار البناء — النشر يظل نسخ مباشر + بوابة `node --check`

### تحقق
- `node --check` نظيف على `src/unified-extension/control-panel.js` ✅
- `tools/deploy.ps1` ناجح — `deploy/` محدّث ✅

---

## [2026-09-29] — ميزة نسخ ولصق الأكواد وقطع الغيار (JSON) في الكنترول بانل (الصفحة 3)

### جديد في لوحة التحكم ومحرك الصفحة 3 (Control Panel & AutoFill Engine)
- **دعم سير العمل الحقيقي عبر "اضافة قطعة غيار":** إضافة وظيفة `addSparePartPage3` التي تفتح نموذج "اضافة قطعة غيار"، وتقوم بتعبئة كود العطل الرئيسي (`ats_modeldefectmajor_name`)، وكود العطل الفرعي (`ats_defectcodedefectmajor_name`)، وقطعة الغيار (`ats_modeldefectspid_name`)، والكمية (`ats_quantity`) ثم الحفظ تلقائياً، مما يُضيف قطعة الغيار وكود العطل معاً في خطوة واحدة مطابقة لسير العمل المعتمد في البوابة.
- **تحديث "لصق الأكواد":** عند وجود قطع غيار في الحزمة المنسوخة (JSON)، يبدأ اللصق بإضافة قطع الغيار المقترنة بأكواد الأعطال، ثم يقوم بفحص أي أكواد أعطال متبقية لم تقترن بقطع غيار ويضيفها عبر "اضافة كود عطل" لمنع أي نقص أو تكرار.
- **اختبار وتأكيد حي على البوابة (Live Verification):** تم تنفيذ دورة إضافة حية لكود TW1500 / 1501 مع خرطوم الصرف `WM-TTL-DRNHST81011`، وكود TW5100 / 5101 مع البودي `WM-TTL-BODY-8KG`، وتأكيد ظهور السجلات في جدولي `InventoryAdjustmentProduct_Subgrid` و `WorkOrder_defect` بنجاح كامل.
- **نشر كامل:** تم النشر عبر `tools/deploy.ps1` إلى مجلد `deploy/`.

---

## [2026-08-19] — اكتشاف بنية أزرار الإضافة في workorderreview + ترقية تبويب الجلسة (Timeline)

### اكتشاف حي (جلسة متصفح على البوابة) — صفحة Work Order Review
- توثيق بنية **"إضافة المشاكل الفعلية المستخدمة"** و**"اضافة فنى"** و**"اضافة كود عطل"**: كلها تفتح نموذج Create عبر `window.open` إلى `/_portal/modal-form-template-path/{modalFormId}?entityformid=...&refentity=incident&refid={orderId}&refrel={relation}`.
- العلاقات: المشاكل = `ldv_incident_ldv_case_problem_workorder` | الفنيين = `ats_incident_ats_caseresource_Case`.
- entityformids: المشاكل `4b0af62b-cc4f-ea11-a812-000d3ab95cbc` | الفني `29c3971e-b745-ea11-a812-000d3ab95431`.
- بنية lookup: `div.lookup-modal` (7 قوالب مخفية)، حقل بحث `input.query`، صفوف `tr[data-entity="contact"]`، أزرار `button.primary[aria-label="Select"]`/`button[aria-label="Cancel"]`، ترقيم `li`/`a[data-page]` حتى 120 صفحة.
- **قيد:** النقر الآلي على صف lookup الفني لا يُفعّل الاختيار (Select يبقى disabled).
- جمع أكواد المشاكل الفعلية (~50 كود عبر 5 صفحات) — فئة AC كاملة (AC01–AC99) + ACK0/ACZ0/ACIC/ACPC + AF01–05 + AL01–04. القائمة **غير مفلترة حسب المنتج** (كتالوج كامل ~1200 كود).
- خطأ السيريال (PAGE_1): `الرقم المسلسل رقم 1 الذي قمت بأدخاله غير صحيح...`.
- مثال حي: صيانة تكييف SHARP 12K، السيريال `25G120027408AHA2ZH`، البلاغ المبدئي `AC22`.
- التوثيق الكامل في `SHARED_KNOWLEDGE.md` + `PORTAL_MAP.md`.

### ترقية تبويب "📸 الجلسة" إلى Timeline
- Recorder في `content-script.js`: كل لقطة/حدث يحمل `seq` (رقم تسلسلي شامل) + `delta` (مللي ثانية منذ `firstSeen`).
- العارض في `popup.js`: "الخط الزمني بالترتيب الفعلي + التوقيتات" — يجمع لقطات الصفحات + أحداث الكليكات في ترتيب زمني واحد، كل عنصر بعلامة `#seq` و `+delta` (صيغة `2m5s`) ونوع (🖼️ لقطة / 👆 كليك).

### التحقق
- `node --check` نظيف على `content-script.js` و `popup.js` ✅ | التوثيق مُحدّث (2026-08-19).

---

## [2026-08-18] — v1.1.0: تعليق قطع الغيار التلقائي + تبويب "الجلسة" + تراجع صافي للمرجع

### ميزة التعليق التلقائي لقطع الغيار (PAGE_3 / workorderreview)
- **سحب:** `waitForSparePartsGrid` + `extractSparePartRows` (قراءة صفوف الـ subgrid بعد تحميلها AJAX من `/_services/entity-subgrid-data.json`) + `readSparePartsTotalFromField` + `readCollectedAmount` + `readIsLscFromPage`.
- **حقن:** `handleSparePartsComment` يكتب في `ldv_resourcelastcomment` حسب `ats_sparepartsstatus` + `ats_warrantystatus`:
  - منتظر → `يحتاج [القطع] بالتكلفة [السعر]`
  - مستعمل + داخل → `تم تغير [القطع]` (بلا أسعار)
  - مستعمل + خارج → `تم تغير [القطع] بالتكلفة وتم تحصيل [المبلغ] جنية`
  - بدون/سحب/استبدال → لا تعليق
- أسماء القطع تُفصل بـ "و"، المبالغ بلا فاصلة آلاف (`formatMoney` → `useGrouping: false`).
- **جديد في الملف:** `collectAllDocs` + `formatMoney` (لم تكن موجودة في ElArabyDev).

### تبويب "📸 الجلسة" (Session Capture Viewer) في popup
- Recorder في `content-script.js` (آخر الملف): لقطات دورية كل 5 ثوانٍ + كليكات مهمة، مرتبطة بمعرّف الأمر، عبر `autofiller_sessionCaptures` في storage.
- عارض في `popup.html`/`popup.js`: إحصائيات (أوامر/لقطات/أحداث)، بحث بمعرّف الأمر، تصدير JSON، مسح.
- يعمل فقط على `/workorderreview|followup|review/`.

### تراجع صافي
- نُفّذت الميزتان أصلاً في مجلد المرجع `مساعد التقفيلات` (خطأ — مجلد قراءة فقط) ثم **رُجعت منه بالكامل** (popup.html/popup.js/manifest 1.0.0/content-script.js: Tab Lock مستعاد، بلا أي بقايا — SYNTAX OK) وأُعيد تطبيقهما هنا في ElArabyDev فقط.

### التحقق
- `node --check` نظيف على content-script.js (2607 سطراً، BOM محفوظ) و popup.js ✅ | manifest.json صالح، version=1.1.0 ✅ | إدراج block_a قبل لوغ PAGE 3 DONE، block_b قبل "Specialized function for Page 3 fault code modal"، block_c في آخر الملف ✅

---

## [2026-08-17] — حماية السيريال + إصلاح "البيانات بتتحذف عند الريفريش"

### المشكلة (بلاغ حي)
- المستخدم لاحظ أن حقول البلاغ الممتلئة تختفي مباشرة عند تحديث الصفحة (Refresh) — "البيانات لسا بتتحذف"

### الجذر 1: إعادة تشغيل مهمة قديمة على تبويب خاطئ
- `processQueueOnLoad()` يعمل عند كل تحميل صفحة. إذا بقي `currentTask` قديم + `eaAutoControl=true` في storage من جلسة باتش سابقة، أي تحديث لأي تبويب كان يعيد تشغيل المهمة القديمة على البلاغ المفتوح → مسح/استبدال الحقول ببيانات بلاغ آخر
- **الإصلاح:** بوابة أمان — قبل إعادة التشغيل يتحقق أن التبويب الحالي هو `processingTabId` نفسه (عبر `GET_MY_TAB_ID`)؛ أي تبويب آخر يبقى Monitor mode ولا يلمس البيانات

### الجذر 2: قاعدة حماية السيريال غير موجودة
- القاعدة المطلوبة: سيريال حقيقي (> 5 أحرف/أرقام إنجليزية) لا يُحذف ولا يُعدّل إلا بـ checkbox "الحقن الإجباري" (`forceOverwrite`) لم تكن مطبّقة
- **الإصلاح:** `isRealSerialValue()` تُمرَّر كـ `realValueFn` لـ `fillAndVerifyProtected` لحقلي Serial1/Serial2 + حماية `clearModel2Serial2Fields` (سيريال 2 حقيقي لا يُمسح لغير AC إلا بـ forceOverwrite)

### التحقق
- `node --check` نظيف ✅ | 12 حالة اختبار `isRealSerialValue` ✅ (سيريالات حقيقية → محمية، قصيرة/وهمية → قابلة للكتابة) | deploy ✅ SHA256 MATCH

---

## [2026-08-16] — قاعدة صارمة: سيريال 2/موديل 2 للتكييف فقط

### المشكلة (بلاغ حي)
- بلاغ ثلاجة (SHARP) في `workorderreview` كان حقل `الرقم المسلسل 2` (`ldv_serialnumber1`) محتوي "0" — البوابة رفضت البلاغ: "المنتج الذي قمت بأدخاله غير متطابق مع الرقم المسلسل"

### الجذر
- `executePage1_Review` في content-script.js كان عندها "General fallback" ينسخ `model/serial` إلى `model2/serial2` لأي جهاز بحقل 2 في الـ DOM (حتى المخفي)
- منطق AC Fallback كان يعتمد على الـ brand (`isSharp = /sharp/i.test(data.brand)`) — خطأ: Sharp علامة تجارية فيها تكييف + ثلاجات + غسالات، وليس كلها تكييف

### القاعدة الصارمة الجديدة
- **سيريال 2 / موديل 2 مسموح فقط لمنتجات مجموعة AC**: تكييف، تكييف كونسيلد، PUMP CLEAN، مبرد هواء، منقى هواء، صيانة دورية تكييف
- **كل المنتجات الأخرى** (ثلاجات، ديب فريزر، غسالات، بوتوجازات، سخانات، شاشات، SHA/AV/OE/PCP/TB/Watches/LIGHTING...) → `serial2` و `model2` **فاضي إلزاماً** مهما كانت البيانات
- جديد `isACProductType(productType)` — كشف دقيق من نوع المنتج (الداتا أو الصفحة `readDeviceTypeFromPage`)
- جديد `clearModel2Serial2Fields()` — لغير التكييف: يمسح الحقل النصي + حقول lookup المخفية + الحقل المرئي + زر Clear lookup إن وُجد (لأن `fillAndVerifyProtected` لا يمسح الحقول بقيمة فارغة)
- إزالة `isSharp` نهائياً

### التحقق
- `node --check` نظيف ✅
- اختبار وحدة `isACProductType` ضد 31 نوع منتج من البورتال (6 AC → true، 25 غير AC → false) ✅
- deploy SHA256 MATCH ✅

---

## [2026-08-15] — AI + n8n Foundation (أساس الذكاء الاصطناعي وناقل الأحداث)

### n8n Event Bus — طابور موثوق بلا فقدان أحداث
- **جديد `shared/n8n-event-bus.js`**: ناقل أحداث موحد يعمل في كل السياقات (content/popup/background)
  - سجل أحداث محلي (`n8nEventLog` — آخر 200) يُسجَّل دائماً حتى بدون n8n
  - طابور Outbox مستمر (`n8nOutbox` — آخر 100) مع `eventId` فريد للـ dedupe في n8n
  - Retry حتى 5 محاولات للحدث الفاشل — لا تضيع الأحداث عند انقطاع الشبكة
  - `n8nRegisterEvent` لتوسيع سجل الأحداث الرسمي (excel_export, ai_call, booking_done...)
- **background.js**: `N8N_FLUSH` + `N8N_QUEUE_STATUS` handlers + تفريغ دوري عبر `chrome.alarms` (كل 5 دقائق، permission "alarms" جديد) + `AI_GET_USAGE`/`AI_RESET_USAGE`
- **n8n-client.js**: `n8nEmit` (بث عبر الطابور) + `n8nFlushOutbox` + `n8nQueueStatus` — مع بقاء `n8nSend` للتوافق
- **excel-exporter.js**: حدث `excel_export` أصبح عبر ناقل الأحداث (طابور بدل إرسال مباشر)
- **n8n-tab (popup)**: مفاتيح جديدة (autoForward + telemetryAI) + حالة الطابور + زر "تفريغ الطابور الآن" + عرض آخر الأحداث
- **إصلاح**: `n8n-client.js` لم يكن محمّلاً في popup أصلاً (زر الاختبار كان يفشل) — أُضيف إلى popup.html

### AI Client v2 — Tool Registry بـ JSON Schema + جلسات دائمة
- **shared/ai-client.js**: `aiRegisterTool(name, desc, run, parameters)` — الأدوات الآن تحمل JSON Schema حقيقياً يُمرَّر لـ native tool calling (دقة أعلى في اختيار النموذج للأداة)
- ذاكرة جلسات **دائمة** (`aiSessions` في storage — آخر 10 جلسات × 40 رسالة) + `aiResetSession`
- `aiGetUsage()` / `aiResetUsage()` — إحصائيات الاستخدام من background
- **جديد `shared/ai-prompts.js`**: 8 قوالب system prompts مركزية (general, portal, scheduler, booking, financial, extraction, qa, summary) مع `get/build/register` — استُخدمت في popup و chat-panel
- **smart-ai-tools.js**: كل الأدوات بأوصاف JSON Schema + أدوات جديدة: `read_event_log`, `emit_n8n_event` (البث لـ n8n من المحادثة), `get_usage_stats`, `list_ai_tools`
- **scheduler-tools.js**: أدوات الجدولة الثلاث مع JSON Schema (date مطلوب، god_mode اختياري)
- **ai-panel-tab (popup)**: لوحة إحصائيات الاستخدام (طلبات/توكنز/نجاح/فشل/حسب النموذج) + أزرار مسح الإحصائيات ومسح الجلسة
- **manifest.json**: permission `alarms` + تحميل `ai-prompts.js` + `n8n-event-bus.js` + `n8n-client.js` في content scripts (PowerApps + CRM) و popup

### توثيق
- **جديد `docs/AI_N8N_FOUNDATION.md`**: معمارية الناقل + بروتوكول الرسائل + شكل payload + دليل اختبار يدوي
- MASTER_README: إضافة المرجع الجديد في جدول الملفات

### التحقق
- `node --check` نظيف لكل الملفات المعدلة ✅
- اختبارات وحدة Node: `node tools/tests/run-tests.js` ✅

---

## [2026-08-16] — هوية الإضافة الجديدة: "العربي ديف — مساعد البوابة" + أيقونات جديدة

- **manifest.json**: `name` → "العربي ديف — مساعد البوابة" + `default_title` محدّث + `description` شامل (ملء تلقائي، كشف الأرقام، التقفيلات، الفلترة، التحليلات)
- **أيقونات جديدة** (16/48/128): خلفية متدرجة زرقاء بهوية El Araby (#005A9C→#0078D4) + إطار فاتح + حرف "ع" أبيض — أُنشئت برمجياً (System.Drawing)
- التحقق: JSON سليم + deploy SHA256 MATCH (manifest + icons) ✅
- Refresh الإضافة لتظهر الهوية الجديدة

---

## [2026-08-16] — نظام النسخ الاحتياطي التلقائي (GitHub + Task Scheduler)

- **GitHub Private repo**: `https://github.com/AhmedsaifAlislam/ElArabyDev.git` (branch `main`) — أول push ناجح
- **`tools/auto-backup.ps1`**: سكريبت ذكي — يتخطى بلا تغييرات، commit + push مع retry (3 محاولات)، سجل في `C:\Users\Zain\AppData\Local\Temp\opencode\auto-backup.log`
- **`.git/hooks/post-commit`**: دفع فوري بالخلفية عند كل commit يدوي (لا يبطئ الـ commit)
- **Windows Task Scheduler** — `ElArabyDev-AutoBackup`: يومياً 06:00، تكرار كل 4 ساعات، يبدأ عند فوات الموعد
- التنفيذ: إعداد remote → push أولي → سكريبت → hook → جدولة → اختبار حي (Backup OK + origin/main متطابقان)

---

## [2026-08-15] — DateFilter v1.8: حذف الفلتر مباشرة (مسار واحد نهائي)

### تشخيص حي رابع (سبب عدم الانطلاق)
- `v: v1.7` نشط + `span: true` (الفلاتر مرصودة) + `submitBtn: true` + `grid: true`
- **لم تنطلق المرحلة** بسبب حاجزين: (1) `eau_auto_reload_done` محفوظ من محاولة v1.6 اليومية المبكرة، (2) المرحلة 2 كانت مشروطة بـ `dfApply=1` في الـ URL (غير موجود بعد تحديث v1.7)
- ملاحظة فحص: اللوحة الفعلية id = `ea-date-unlocker-panel` (فحص `eau-filter-box` كان خاطئاً)

### الإصلاح (v1.8)
- **مسار واحد نهائي**: عند رصد نطاق ضيق + autoExpand مفعّل → **حذف فلتر التاريخ خالصاً فوراً** (مسح `bk_fld_CreateDateAfter/Before` → نقر زر التطبيق الرسمي/metafilter) — بلا أي إعادة تحميل
- **مسار إعادة التحميل مع dtStart/dtEnd أُلغي نهائياً** (الخادم يتجاهله — مثبت مرتين)
- مفتاح جديد `sessionStorage eau_clear_tried` (لا يتأثر بالمفاتيح القديمة) — محاولة واحدة يومياً
- شبكة الأمان باقية (استعادة تلقائية إن عاد الجدول فارغاً بعد 6 ثوانٍ)
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅

---

## [2026-08-15] — DateFilter v1.7: حذف الفلتر خالص (آخر فرصة قبل التعطيل الكامل)

### تصحيح مسار النشر (أهمية حرجة)
- **DateFilter محقون من manifest.json** (content_scripts سطر 78) — **ليس سكربت Tampermonkey**
- **التحديث = Refresh الإضافة فقط** — الإضافة تقرأ الملف تلقائياً (المستخدم محق؛ v1.6 وصل وتشغّل تلقائياً)

### الإصلاح (v1.7)
- **المرحلة 2**: بدل تطبيق نطاق موسّع → **تفريغ حقلي التاريخ خالصاً** (`bk_fld_CreateDateAfter/Before = ''`) ثم إطلاق فلتر البورتال الأصلي (زر التطبيق/metafilter) → **الجدول يعرض كل البلاغات بلا قيد تاريخ**
- **الفرق عن فشل v1.3 التاريخي**: كنا نضع `"0"` (قيد صفر → جدول فارغ "لا توجد سجلات") — **الفراغ يزيل القيد كلياً**
- شبكة الأمان باقية: إن عاد الجدول فارغاً بعد 6 ثوانٍ → استعادة فورية للنطاق الافتراضي
- الحماية اليومية: `sessionStorage eau_metafilter_tried` — محاولة واحدة يومياً
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅

---

## [2026-08-15] — DateFilter v1.6.1: مرحلة metafilter الآمنة (الخادم تجاهل dtStart/dtEnd)

### تشخيص حي ثانٍ (تأكيد)
- v1.6 نفّذ إعادة التحميل بنجاح: `URL?dtStart=2026-08-08&dtEnd=2026-09-14&dfApply=1` ✅
- **لكن الخادم تجاهل المعاملات**: الفلتر المعروض بقي `08/15 - 08/18` والجدول 20 صفاً
- Grid Requests: لا يزال `none captured` — الجدول server-rendered مطلقاً

### الإصلاح (v1.6.1)
- **المرحلة 2** في `maybeAutoExpandReload`: بعد إعادة التحميل (dfApply=1 في URL) إن كان الفلتر ما زال ضيقاً → `applyFilterControlExpansionSafe()` — تطبيق فلتر البورتال الأصلي (زر التطبيق/metafilter) **مرة واحدة يومياً**
- **تحسينات الأمان مقارنة بـ v1.3 الفاشل**: تحقق أن التواريخ الجديدة ظاهرة في الـ serialized (ليست أصفاراً)، نقر زر التطبيق الرسمي أولاً ثم metafilter احتياطياً
- **شبكة أمان حاسمة**: بعد 6 ثوانٍ إن عاد الجدول فارغاً ("لا توجد سجلات"/view-empty) → استعادة فورية للنطاق الافتراضي (حذف dtStart/dtEnd/dfApply من الـ URL) — لا ضرر دائم ممكن
- حماية الحلقة: `sessionStorage eau_metafilter_tried` = اليوم (محاولة يومية واحدة)
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅
- **ملاحظة نشر**: تحديث نسخة Tampermonkey + مسح `sessionStorage` (أو يوم جديد) لتجربة المرحلة 2

---

## [2026-08-15] — توسيع تلقائي آمن v1.6 (جذر "بلاغات اليوم فقط")

### التشخيص الحي (من لوحة التشخيص في متصفح المستخدم)
- الفلتر المعروض: `08/15/2026 - 08/18/2026` (نطاق المنصة الافتراضي: اليوم → +3 أيام)
- **Grid Requests (entity-grid-data): none captured** — الجدول يُملأ **Server-Side** (HTML أولي) بلا أي طلب AJAX
- الاعتراض يعدّل طلبات الـ API فقط (مثال: annotations توسّع من 08/15 إلى 08/08 بنجاح ✅)
- **النتيجة**: التوسيع لا يلمس الجدول الرئيسي لأنه لا يوجد طلب جدول يُعترض

### الإصلاح (v1.6-safe-auto-expand-20260815)
- **جديد `maybeAutoExpandReload()`**: عند رصد الفلتر الأول — إذا كان النطاق المعروض أضيق من المطلوب (autoExpand مفعّل) → إعادة تحميل آمنة **مرة واحدة يومياً** مع `dtStart/dtEnd/dfApply` (نفس آلية زر "تطبيق + إعادة تحميل" اليدوي)
- **حماية ثلاثية من الحلقة اللانهائية**: (1) `sessionStorage (eau_auto_reload_done = تاريخ اليوم)` — محاولة يومية واحدة، (2) `dfApply=1` + dtStart موجودان في الـ URL → توقف، (3) `__desiredRange.fromUrl` (وصلنا بنطاق) أو `totalDays >= days` (النطاق يغطي المطلوب) → توقف
- **لا تغيير في مبدأ v1.5**: لا metafilter ولا نقر زر — إعادة التحميل فقط مع params
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅
- **ملاحظة نشر**: سكربت Tampermonkey — تحديث النسخة من Tampermonkey (وليس Refresh الإضافة)

---

## [2026-08-15] — ملاحظات سريعة (Quick Notes) في كشف الأرقام

- **phone-reveal**: تبويب رابع "📝 ملاحظات" — إضافة ملاحظات سريعة (Enter) + حذف فردي + مسح الكل
- حفظ محلي في `localStorage (erp_quick_notes)` — سقف 200 ملاحظة
- تصدير: الملاحظات تُلحق في نهاية ملف **Excel** (صفوف وقت/ملاحظة) و**CSV** (قسم مستقل) — السجل/log يذكر العدد
- توافق MV3 سطر 849 (قائمة `__ERP_HANDLERS__`) — الدوال الجديدة داخل النطاق المسموح
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅

---

## [2026-08-15] — إصلاح حد 50 صفحة + Retry للصفحات الفاشلة (order-extractor)

### إصلاح مشكلتين موثقتين (من CHANGELOG 2026-07-14)
- **order-extractor.js `extractAllPages`**: رفع الحد الأقصى من 50 إلى **200 صفحة** (`MAX_PAGES`)
- **Retry mechanism**: فشل `scrapeCurrentPage` في الصفحات اللاحقة → محاولة إعادة قراءة واحدة (1.5 ثانية) قبل الإعلان عن الفشل؛ فشل تحميل الصفحة التالية (`waitForTable`) → حتى **3 محاولات** مع فاصل 1.5 ثانية بينها قبل التوقف
- سلوك الإيقاف اليدوي والـ search-retry محفوظان كما هما
- التحقق: `node --check` نظيف ✅ — deploy SHA256 MATCH ✅

---

## [2026-08-15] — توحيد iframes + أداء Batch + فحص messenger (v15.2)

### PowerApps iframes handling — توحيد عبر frame-walker
- **content-script.js**: `collectAllDocs` تستخدم الآن `getAccessibleDocs` من frame-walker (مع fallback آمن للتنفيذ اليدوي إن لم تُحمَّل المكتبة) — كل مستهلكيها الـ 19 موضعاً استفادوا تلقائياً
- **waitForModalIframe**: البحث في الإطارات عبر `walkFrames` (مع fallback) — يغطي الإطارات المتداخلة بدل الحلقة اليدوية
- السلوك محفوظ (timeouts، الأولويات، fallbacks) — توحيد فقط

### أداء Batch (Layer 3)
- **elaraby-phone-reveal.js**: `processLayer3` تحولت من دفعات متسلسلة (5×5 مع انتظار كامل) إلى **concurrency pool حقيقي** (4 طلبات متزامنة، عمال مستمرون بلا فجوات انتظار) — أسرع مع عدم إغراق الخادم
- **fetchAllPages**: مهلة متغيرة jitter (350–600ms) بدل 400ms الثابتة

### فحص messenger-sender (CSP Facebook)
- **messenger-sender.js**: فحص كامل — لا `eval`/`new Function`/حقن `<script>` ديناميكي، لا `chrome.storage` مباشر (مشكلة Edge Tracking Prevention غير موجودة هنا — يعمل عبر DOM contentEditable + iframes آمن). **لا إصلاحات مطلوبة** — سليم كما هو

### التحقق
- `node --check` نظيف ×3 ✅ — deploy SHA256 MATCH ×3 ✅

---

## [2026-08-15] — Phone-Reveal UI/UX تحسين (v15.1) + تثبيت الأساس

### Phone-Reveal UI/UX (من خطة Agent-UI — تنفيذ CSS المعلق)
- **Tempermonky/elaraby-phone-reveal.js v15.1**: إضافة طبقة Design Tokens موحدة (متغيرات CSS: `--erp-primary/success/warning/danger/radius/space/shadow/font`) محقونة عبر `<style id="erp-design-tokens">`
- **Component classes**: `.erp-btn` + `.erp-btn-primary/success/indigo/danger/warning` — الأزرار الرئيسية (Excel/CSV/رفع/كشف/تصفح تلقائي/جلب الكل) حوّلت من inline مبعثر إلى أصناف موحدة
- **Accessible states**: `:focus-visible` outline لكل الأزرار، hover/active (brightness + scale 0.96)، `type="button"` + `aria-label` لكل الأزرار، `prefers-reduced-motion` يُعطّل الحركة، `::selection` و input focus ring
- **RTL**: استمرار `direction:rtl` + logical properties عبر الـ tokens
- النشر: SHA256 متطابق src ↔ deploy ✅ — `node --check` نظيف ✅

---

## [2026-08-14] — إصلاح جذري: الجدول الفارغ في صفحة التقفيلات (v1.5)

### إصلاح حرج (حذف البيانات من الصفحة الأولى في التقفيلات) — ✅ تحقق حي من المستخدم
- **Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js v1.5-no-filter-apply-20260814-2030**: إزالة منطق "تطبيق الفلتر التلقائي" (`applyFilterControlExpansion` / metafilter / نقر زر التطبيق) من `watchFilter` نهائياً — كان يضبط حقول الفلتر ويطلق التطبيق تلقائياً عند ظهور عنصر الفلتر، فيمسح الجدول ويعيد `view-empty` "لا توجد سجلات"
- **التشخيص بالدليل (ملفا الالتقاط):** الحالة السليمة (v1.2، اعتراض الطلبات فقط) → الفلتر المعروض `08/14-08/17` والبلاغات ظاهرة؛ الحالة المكسورة (v1.3/v1.4، تطبيق الفلتر تلقائياً) → نطاق معروض `08/07-09/13` (نطاق الإضافة) + حقول `name="4"/"5"` = `value="0"` + جدول `view-empty`
- **الاستنتاج:** تطبيق الفلتر برمجياً (metafilter/نقر زر) جعل الخادم يرجع قائمة فارغة؛ `watchFilter` الآن يرصد ويحلل فقط دون أي تطبيق — الحل المعتمد
- **الفروع المتبقية** (`applyFilterControlExpansion`, `applyNewDateRange`, `reloadWithNewRange`): تبقى لاستخدام الأزرار اليدوية في الواجهة فقط، لا استدعاء تلقائي
- **فحص النشر:** SHA256 متطابق src ↔ deploy ✅ — `node --check` نظيف ✅

---

## [2026-08-13] — إصلاح عطل الفلترة + إعادة التنظيم حسب الميزات (v4.1)

### إصلاحات عاجلة (عطل "البلاغات تظهر اليوم فقط")
- **ai/scheduler-tools.js**: إصلاح `Uncaught TypeError: ai.aiListTools is not a function` — دالة `register` تدعم الآن `aiRegisterTool` و `registerTool` (SmartAI)، و`listTools` تُقرأ من `ai.listTools || global.aiListTools` — أدوات الجدولة لم تكن تُسجَّل أصلاً فتعطلت الفلترة
- **Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js**: إزالة `location.reload()` التلقائي من `setAutoExpand` (كان يسبب إعادة تحميل متكررة)، إضافة حماية `__lastAnalyzedRaw` ضد إعادة تحليل نفس النطاق عشرات المرات، إعادة هيكلة `startDateFilterObserver` ليراقب عنصر الفلتر نفسه بدل `documentElement` كله (`characterData` على المستند كان يطلق التحليل آلاف المرات)

### إعادة التنظيم حسب الميزات (Feature-Based Structure)
- **جديد `core/booking/`** ★ قلب المشروع: `auto-filler.js` + `scanner.js` + `shadow-panel.js` (الحجز/التقفيل)
- **جديد `ai/`** ★ عقل المساعد الذكي منفصل: `chat-panel.js` + `voice-control.js` + `smart-ai-tools.js` (Tool Registry) + `smart-scheduler.js` + `scheduler-tools.js` — يتحكم ويرى بقية الميزات
- **جديد `features/spare-parts/`** (قطع الغيار/البحث عن بلاغ): `dashboard/` (dashboard.html + dashboard.js)
- **جديد `features/financial/`**: scraper + analyzer + financial-boot
- **جديد `features/crm/`**: crm-content
- **حذف `content/` و `dashboard/` القديمة** — كل المراجع حُدّثت (manifest.json + background.js + popup.js + مسارات dashboard.html النسبية) وتم النشر إلى `deploy/`

---
## [2026-08-12] - بنية الذكاء الاصطناعي القوية (AI Core v2)

### بنية تحتية قوية للـ AI
- **الـ TRANSPORT (background.js)**: handleAIChat v2 - Native Tool Calling (معامل tools + tool_choice)، Retry لمحاولتين (429/5xx/شبكة)، Timeout 90s، Rate-limit 500ms، ذاكرة محادثة (history حتى 20 رسالة)، تسجيل استهلاك كامل (aiUsageStats)
- **Telemetry اختياري لـ n8n**: يرسم ai_call/ai_failed فقط عند تفعيل n8n.telemetryAI
- **الـ CLIENT (shared/ai-client.js)**: Cache LRU (30 ثانية عبر cacheKey) + Dedupe + aiRemember/aiRecall لذاكرة الجلسات + chatWithTools v2 (Native أولاً ثم JSON)
- **توحيد العميل**: aiService يعبر عبر aiChat الموحد مع fallback آمن
- **كود العطل الذكي**: getSmartProblemCode يستخدم cache
- **أدوات AI جديدة** (content/smart-ai-tools.js): 
read_smart_log، 
read_validation_patterns، get_page_state
- **محادثة الصفحة**: ذاكرة محادثة (آخر 10 رسائل مع كل طلب)
- **popup**: عداد استخدام الـ AI في تبويب المساعد الذكي
- **manifest**: حقن ai-client في مجموعة الكنترول بانل + smart-ai-tools في مجموعة الجدولة

### تحسينات البث المباشر (Streaming) + معدل التكرار + تبديل النماذج (2026-08-12 v2.1)
- **background.js**: تحسين `aiFetchWithRetry` — `maxAttempts: 3`، `Retry-After` header، exponential backoff (2s, 4s, 6s) للـ 429/5xx، حماية timeout 90s + abort على disconnect
- **ai-panel-tab.js (المساعد الذكي)**: قراءة النموذج المحفوظ من `aiConfig.model` بدلاً من hardcoded 'general'، تحديث المؤشر الديناميكي لعرض النموذج النشط
- **popup.html**: إضافة قائمة منسدلة للتبديل بين النماذج (DeepSeek V4 Flash، Nemotron 3 Ultra، MiMo V2.5، LongCat 2.0، North Mini Code، Ling 3.0 Tiny) داخل تبويب "المساعد الذكي" مع حدث `change` يحفظ فوراً في `aiConfig`
- **ai-chat-panel.js / ai-panel-tab.js**: مؤشر تحميل حي "⏳ جاري التفكير..." + بث تدريجي للنص (streaming) عبر onChunk callback
- **popup.js**: `analyzeSmartLogWithAI` يستخدم `aiChatStream` مع fallback، عرض رسائل خطأ عربية واضحة بدلاً من "لا يوجد رد"، `renderManualAnalysis` يزيل شبكة الإحصائيات المكررة
- **popup.html (Smart Log / Telemetry)**: بطاقة أخطاء `sl-stat-errors` / `tel-stat-errors` في شبكة 4 أعمدة، أزرار "🔍 تحليل AI" في كلا التبويبين
- **ai-client.js**: `chatWithTools` يدعم `onChunk` للبث المباشر، `aiChatStream` fallback إلى `aiChat` عند عدم توفر Port

---
## [2026-08-11] — إعادة هيكلة الجذر (Restructure)

### البنية الجديدة
- **`master-portal/` → `src/`**: المصدر الرئيسي أصبح `src/` — فيه `unified-extension/` (★ الإضافة الموحدة MV3) + `dashboard/` + `crm-content/` + `design-system/` + `ui-components/` + `docs/`
- **`مساعد التقفيلات/` → `deploy/`** (نظيف): مجلد النشر أصبح كوداً فقط (25 عنصراً، بلا توثيق/أرشفة) — يُبنى تلقائياً من المصدر
- **جديد: `tools/deploy.ps1`** — ★ إجابة سؤال "ليه محدّث من مساعد التقفيلات؟": الآن أي تعديل على `src/unified-extension` → تشغيل السكريبت → `deploy/` يتحدث + نسخة احتياطية تلقائية في `backups/`
- **`excel_autofix/` → `tools/excel_autofix/`** — أداة Python نشطة
- **`sync-shared.ps1` → `tools/`** + تحديث مساراته إلى `src/unified-extension/shared`
- **النسخ المنفصلة القديمة → `legacy/`** (أرشيف/مرجع فقط لا تطوير منها): المساعد الذكي، البحث عن بلاغ، حجز البلاغات المستقبلة، portal-other-section، Rescheduling، اكواد، + النشر القديم كاملاً
- **النسخ الاحتياطية → `backups/`**: `backup-pre-unified-v4/` + كل `deploy_backup_*/` (وأضيفت `20260811_155011` من أول نشر بسكربت جديد)
- **جديد: `.gitignore`** — يستثني node_modules/dist/backups/legacy/التسجيلات
- **التوثيق المحدّث**: `DEV_COPY.md` (بنية جديدة + شرح النشر)، `AGENTS.md` (المسارات)، `MASTER_README.md` (الهيكل)

### النتيجة
- جذر نظيف من 12 مجلداً مختلطاً إلى 6 أدوار واضحة: **src (تطوير) → deploy (نشر) ← tools (تشغيل) + backups (أمان) + legacy (أرشيف) + docs (مرجع)**

---

## [2026-08-11] — إصلاح DateFilter Unlocker (واجهة + وظيفة أساسية)

### ElAraby_DateFilter_Unlocker.user.js v1.1
- **إصلاح جذري لخطأ `buildUI is not defined`**: كانت `buildUI` تعبير دالة (`buildUI = function`) — لا تُرفع hoisted → تُستدعى قبل التعريف في `initUnlocker` → انهيار كامل للواجهة (السكريبت كان لا يظهر FAB 🗓️ إطلاقاً). حُوّلت إلى **function declaration**.
- **الوظيفة الأساسية (إظهار بلاغات أبعد من 3 أيام)** — كانت تعتمد فقط على `delete val.futureCases` الذي يكسر كود البورتال:
  - `futureCases` تُرفع إلى `9999999` بدل الحذف (لا تكسر قراءات البورتال)
  - **اعتراض وتعديل الطلبات الصادرة**: كل fetch/XHR يحوي `createdon` يُوسَّع نطاقه تلقائياً (Dataverse `datetime'...'` + ISO + معاملات URL) —
    هذا يغيّر الفلتر الفعلي المرسل للخادم وليس فقط النص المعروض
  - **وضع التوسيع التلقائي ⚡** (Auto-Expand): زر في الواجهة يفعّل توسيع كل الطلبات لـ +30 يوم (من اليوم-7) ويُحفظ عبر `GM_setValue` ويمكن تفعيله مرة واحدة ليبقى مفعلاً في كل الجلسات
  - **زر "تطبيق + إعادة تحميل" 🔄**: fallback مضمون عبر `?dtStart&dtEnd&dfApply` في الـ URL؛ عند أي فشل في التحديث اللحظي تتم إعادة التحميل تلقائياً
  - **استرجاع النطاق من الـ URL** بعد إعادة التحميل + تطبيق تلقائي عند ظهور الفلتر (يشمل الطلبات اللاحقة)
- **الفحص**: `node --check` → SYNTAX OK — مُزامَن إلى `مساعد التقفيلات\Tempermonky\DateFilter\` + `حجز البلاغات المستقبلة\`

---

## [2026-08-11] — ترتيب الملفات والمراجع (Docs Reorganization)

### التوثيق والاسترشاد
- **مزامنة ملفات الاسترشاد والخطط من الأصل إلى ElArabyDev** (نسخة العمل):
  - `AGENTS.md` — نسخة العمل + **القاعدة الأساسية الجديدة** (ElArabyDev = نسخة العمل الوحيدة، العربي سيستم = قراءة فقط)
  - `MASTER_ROADMAP.md` — خطة المهام الكبرى (مفقود سابقاً)
  - `PHASE3_UNIFIED_INTEGRATION_PLAN.md` — خطة الدمج الموحد (مفقود سابقاً)
  - `PROMPT_MASTER.md`، `E2E_CHECKLIST.md`، `IDEAS_BACKLOG.md` — (مفقودة سابقاً)
  - `MASTER_README.md` — محدّث: إضافة الإصدار الموحد v4.0 + Excel Autofix Bridge + n8n + المراجع الجديدة + هيكل ElArabyDev الفعلي
  - `PORTAL_MAP.md` — أحدث نسخة (معقّمة من كلمة المرور)
  - `CHANGELOG.md` — أحدث نسخة من الأصل
- **تعقيم كلمة مرور CRM** في ElArabyDev (كانت ما زالت تسربت لدى النسخة):
  - `portal-other-section/elaraby_crm_analysis.md` — `CONFIG.PASSWORD` كان يحوي القيمة الحرفية → `''` مع توجيه الإدخال اليدوي
  - `portal-other-section/README.md` — إزالة القيمة الحرفية
  - `CHANGELOG.md` — إزالة القيمة الحرفية من سطر التنبيه
  - الفحص النهائي: **0 نتيجة** لأي كلمة مرور متبقية

### البنية والمزامنة
- `sync-shared.ps1` — تحديثه: المصدر الآن `master-portal\unified-extension\shared` (13 مكتبة بدل 5): أعاد نسخ `ai-client`, `db`, `excel-exporter`, `frame-walker`, `n8n-client`, `portal-config`, `table-scraper` إلى `مساعد التقفيلات\shared` و `المساعد الذكي\shared` (26 ملفاً)
- `DEV_COPY.md` — تحديث خريطة المجلدات: `مساعد التقفيلات` = **مجلد النشر الكامل** (content/، dashboard/، shared/، Tempermonky/DateFilter) + قائمة المكتبات الـ 13

---

## [2026-08-11] — إصلاح أمني (Secrets)

### أمن
- **إزالة كلمة مرور CRM حقيقية منشورة** في 3 ملفات مفهرسة في المستودع:
  - `PORTAL_MAP.md` (سطر "ملاحظة" عن CONFIG.PASSWORD)
  - `portal-other-section/elaraby_crm_analysis.md`
  - `portal-other-section/README.md`
  - استُبدلت بإشارة "تُدخل يدوياً عند التشغيل" — لم تعد القيمة مخزنة في أي ملف سطرّي
- **فحص شامل للأمان** (187 ملف نصي): لا توجد مفاتيح/أسرار إضافية — ما عدا integrity hashes القياسية لـ npm (غير حساسة) وقيم ViewState base64 في ملفات HTML محفوظة (بيانات واجهة، ليست مفاتيح)
- مجلدات `*_files` الثلاثة المتبقية تحتوي فقط `bootstrap-rtl.min.css` (آمنة — لا مفاتيح Azure)
- **تعقيم formula injection في `excel_autofix/excel_app.py`**: عنوان يبدأ بـ `=`/`+`/`-`/`@` يُفرض كنص (بادئة `'`) لمنع تنفيذ صيغ في Excel المخرج

> **⚠️ تنبيه:** كلمة المرور كانت منشورة في `PORTAL_MAP.md` — يُنصح بتغييرها على البوابة إذا كانت ما زالت نشطة.

---

## [2026-08-11] — ربط n8n (Webhook Integration)

### El Araby Unified System
- **تبويب "🔗 n8n"** في الأدوات: Webhook URL + Bearer token + "إرسال تلقائي بعد كل تصدير Excel" + أزرار (حفظ / اختبار / سجل الجلسات / تحليل السلوك)
- `shared/n8n-client.js` — `n8nSend()` / `n8nAutoExportEnabled()` / `n8nReady()` (مسار الرسائل عبر background)
- `background.js` — handler `N8N_SEND` (proxy fetch: يتجاوز CORS، بـ host_permissions: localhost:5678 + *.n8n.cloud)
- `excel-exporter.js` — خطاف تلقائي: أي تصدير → حدث `excel_export`
- النموذج: `{"event","data","meta"}` — Webhook واحد يقبل كل الأحداث
- اختُبر مسار العميل → background (Node simulation PASS)

---

## [2026-08-11] — الدمج الموحد: Excel Autofix Bridge + AI End-to-End Platform

### El Araby Unified System (الإضافة الموحدة v4.0)
- **3.5 Excel Autofix Bridge** — تبويب "📊 Excel Autofix" في الأدوات (فحص الخدمة + رفع + تنزيل)؛ خلفية Python: `autofix_core.py` (نواة موحدة) + `service.py` على `127.0.0.1:8765` (health / process / downloads، حد 20MB، أسماء UUID) + `service.bat`؛ `excel_app.py` يستورد النواة (لا تكرار)
- **3.6 AI End-to-End Platform** — `ai-client.js`: `aiChatWithTools()` (محادثة → JSON tool → تنفيذ → تلخيص)؛ `content/rescheduling/`: `smart-scheduler.js` (Port الجدولة الذكية) + `scheduler-tools.js` (3 أدوات: get_current_incident / schedule_current_incident / open_scheduler_modal) + `ai-chat-panel.js` (FAB 🤖 + محادثة عائمة RTL، شارة عدد الأدوات)
- **3.7 Popup Panels** — تبويب "🤖 المساعد الذكي" في الأدوات (محادثة عامة + فحص مفتاح API + زر فتح المحادثة على الصفحة عبر `SHOW_AI_CHAT`)
- **3.8 Security/Docs** — فحص secrets (صفر مفاتيح)، node --check لكل ملفات JS (صفر أخطاء)، تحديث MASTER_README
- إصلاح: ملف `Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js` المفقود في نسخة النشر — نُسخ من unified-extension

---

## [2026-07-14] — مراجعة مساعد التقفيلات واكتشافات جديدة

### مساعد التقفيلات / Portal AutoFiller
- **إصدار v1.1.0** — تحديث بناءً على مراجعة الكود
- **اكتشاف order-extractor.js** (1,313 سطر) — محرك استخراج بـ 15 حقل، 9 محددات جداول، iframe traversal، pagination (50 صفحة)، سحب تفاصيل البلاغات
- **اكتشاف control-panel.js** — لوحة تحكم إضافية
- **اكتشاف smart-log.js** — سجل حركات المستخدم
- **اكتشاف travel-costs.json** — بدلات الانتقال حسب المناطق
- إضافة تبعيات: Moment.js + Timezone, daterangepicker, Choices.js, Signature/Ink Control
- استخراج المناطق من API (`/incidents(id)` → `/accounts(id)` → `_ldv_area_value`)
- تصدير Excel غني بـ ExcelJS (تلوين، حدود، RTL، إحصائيات)
- 3 مستويات مطابقة للأعمدة (حرفية، starts-with، includes)
- إحصائيات التصدير: شكاوى، صيانة، تركيب، معاينة

### PORTAL_MAP.md — صفحات جديدة
- **ProductInventoryList** — العهد المتاحة (صفحة جرد المخزون)
- **technicalreviewdetails** — المراجعة الفنية
- **inspection-case-without-PhoneNumbers** — معاينة الحالة + توقيع رقمي
- كيانات جديدة: `ldv_workorder_defect`, `ats_inspection`, `msdyn_inventoryadjustment`, `product`, `ldv_productgroup`, `ldv_producttype`, `ldv_producttypebrand`, `bookingstatus`
- إضافة حقول صفحة Work Order Review
- إضافة API endpoints للكيانات الجديدة

### المشاكل المكتشفة
- حد أقصى 50 صفحة في order-extractor.js
- عدم وجود retry mechanism للصفحات الفاشلة

### SHARED_KNOWLEDGE.md — مكتبات جديدة
- Signature/Ink Control (التوقيع الرقمي)
- Choices.js (القوائم المتعددة)
- daterangepicker (محدد النطاق الزمني)
- Moment.js + Timezone (معالجة التاريخ)

---

## [2026-07-11] — إنشاء التوثيق الموحد

### أضيف
- `MASTER_README.md` — الدليل الرئيسي لكل المشروع
- `PORTAL_MAP.md` — خريطة البورتال الكاملة
- `SHARED_KNOWLEDGE.md` — المعرفة المشتركة بين الأدوات
- `CHANGELOG.md` — سجل التغييرات
- `KNOWN_ISSUES.md` — المشاكل المعروفة
- ملفات تعريف (`TOOL_PROFILE.md`) لكل أداة
- ملفات حالة المشروع (`PROJECT_STATUS.md`) لكل أداة
- ملفات تعليمات الذكاء الاصطناعي (`AGENTS.md`) لكل أداة
- ملفات الدليل (`README.md`) لكل أداة

---

## المساعد الذكي / Smart Parts Assistant

### [2.2.0] - 2026-07-11

#### المنجز
- هيكل المجلدات مرتب (content/, dashboard/, shared/, scripts/)
- Manifest V3 جاهز
- قاعدة بيانات IndexedDB (`ElArabyPartsDB` v2)
- آلية اتصال بين content script و background.js
- 4 تبويبات في لوحة التحكم
- مزامنة من Google Drive (CSV/XLSX)
- رفع ملف محلي (CSV/XLSX)
- دمج 4 ملفات Excel في `master_data_merged.csv` (416,815 صف)
- بحث موحد مع فلترة متتالية
- حقن تلقائي للبيانات في البورتال
- عربة التسوق (Cart)
- سجل العمليات (Smart Log)
- لوحة التحكم (Dashboard)
- اللوحة المنبثقة في البورتال (Shadow Panel)

#### المشاكل المحلولة
- نتائج البحث لا تظهر — تم حلها بـ `loadFilters()` بصمت
- Infinite recursion في `enhanceSelect` — تم حذف `Object.defineProperty`
- 64MiB quota error في IndexedDB — تم تقطيع `sparePartDescription`
- Edge Tracking Prevention — تم توجيه التخزين عبر `background.js`

---

## مساعد التقفيلات / Portal AutoFiller

### [1.0.0] - 2026-07-11

#### المنجز
- 6 تبويبات: بحث وتعبئة، زيارة تانية، الاستخراج، التقارير، مساعد AI، سكريبتات
- تعبئة تلقائية لأوامر العمل في البورتال
- دعم Batch للمعالجة المتعددة
- تقارير محفوظة
- مساعد AI (Ollama مع `qwen2.2-coder:14b`)
- كشف أرقام الهواتف عبر `crmAccount`
- سكريبتات Tampermonkey مدمجة
- دعم Edge و Chrome

#### المشاكل المعروفة
- Edge Tracking Prevention — يمنع `chrome.storage.local` في content scripts
- CSP على Facebook/Messenger — يمنع `eval()` و `<script>` tags
- PowerApps iframes — يجب البحث في `document` + كل الـ iframes

---

## البحث عن بلاغ / Report Extractor

### [5.0.0] - 2026-07-11

#### المنجز
- استخراج تقارير البلاغات من بوابة CRM
- قراءة ملفات Excel المرفوعة
- البحث في جدول CRM عن أرقام البلاغات
- استخراج التقارير المرتبطة
- إعادة ضبط البيانات في ملف Excel الأصلي
- دعم تنسيقات متعددة (عام، استبدال، سحب، قطع غيار)
- بحث عبر CRM أو SAP أو اسم العميل أو التليفون
- دعم التنقل بين الصفحات (Pagination)
- تصفية البلاغات الملغاة والمؤجلة

#### معلومات تقنية
- يعمل فقط على `SelectReport.aspx`
- حجم الدفعة: 25 رقم/مرة
- الحالات المفلترة: `canceled`, `postpone`
- يستخدم SheetJS لقراءة/كتابة Excel

---

## portal-other-section / Financial Analytics

### [3.0.0] - 2026-07-11

#### المنجز
- تحليل تفصيلي لبوابة العربي CRM
- إضافة Chrome للتحليل المحاسبي (للمالية)
- سكريبت Console لاستخراج البيانات (`get_all_data.js`)
- سكريبت أتمتة الصفحات المالية (`portal_automation.js`)
- تحليل محاسبي متخصص لحركات الحساب SAP
- حساب الرصيد الجاري (Running Balance)
- كشف التحويلات البنكية
- كشف فواتير التالف
- تحليل تكرار القطع وتغير الأسعار
- كشف القطع الغالية (>1000 ج.م)
- إحصائيات شهرية

#### صفحات "آخرى" المدعومة
- MainMoney.aspx — الصفحة الرئيسية
- AutoBuildWR.aspx — إصدار فاتورة
- inprogress.aspx — جاري مراجعتها
- inasc.aspx — متوقف احتسابها
- salaryasc2.aspx — مستحقات المراكز
- accountMovement.aspx — حركات CRM
- accountMovementSAP.aspx — حركات SAP
- billingneeded.aspx — الفواتير المطلوبة
- Fawry.aspx — طلبات المدفوعات
- FinancialReceipt.aspx — ايصالات المدفوعات

#### المشاكل المعروفة
- خطأ ASCID في inprogress.aspx و inasc.aspx
- كلمات السر المتعددة لكل صفحة
- لا توجد أتمتة أصلاً (تم بناء `portal_automation.js`)

---

## حجز البلاغات المستقبلة / Date Filter Unlocker

### [1.0.0] - 2026-07-11

#### المنجز
- كشف البلاغات المخفية في البورتال
- التحكم الكامل في نطاق التاريخ
- اعتراض `window.crmAccount` قبل تحميل أي شيء
- حذف قيود `futureCases`
- مراقبة طلبات Fetch و XMLHttpRequest
- تعديل استجابات الفلتر

#### آلية العمل
- `Object.defineProperty` على `window.crmAccount`
- حذف `futureCases` من الإعدادات
- مراقبة `fetch` و `XMLHttpRequest`
- تعديل استجابات الفلتر تلقائياً

---

## Rescheduling Portal / Smart Scheduler

### [1.1.0] - 2026-07-11

#### المنجز
- تجاوز قيود عدد الأيام ومرات الجدولة في بوابة العربي
- زر عائم "جدولة حرة (بدون قيود)"
- نافذة منبثقة لاختيار التاريخ
- وضع God Mode للجدولة من أي صفحة
- بدون مكتبات خارجية

#### ملاحظات
- قيود الجدولة مقفلة من جانب السيرفر (Dynamics 365 Plugin)
- لا يمكن تخطيها برمجياً من المتصفح بالكامل

---

## excel_autofix / Excel Auto Formatter

### [1.0.0] - 2026-07-11

#### المنجز
- أداة سطح مكتب Python لتنسيق ملفات Excel للطباعة
- واجهة GUI بـ CustomTkinter
- استخراج أعمدة محددة (CaseNumber, SAPOrderNumber, Quantity, Product, ProductType)
- إعادة تنسيق كملف Excel جديد بعناوين متكررة كل 30 سطر
- تنسيق RTL للطباعة
- دعم تشغيل عبر Python أو VBS أو BAT

#### التبعيات
- customtkinter
- openpyxl
- threading

---

## تاريخ الإصدارات السابق

| التاريخ | الأداة | الإصدار | التغييرات الرئيسية |
|---------|--------|---------|---------------------|
| 2026-07-14 | مساعد التقفيلات | v1.1 | مراجعة الكود واكتشاف extraction engine |
| 2026-07-11 | كل الأدوات | — | إنشاء التوثيق الموحد |
| 2026-07-11 | المساعد الذكي | v2.2 | آخر إصدار مستقر |
| 2026-07-11 | مساعد التقفيلات | v1.0 | الإصدار الأول |
| 2026-07-11 | البحث عن بلاغ | v5.0 | آخر إصدار |
| 2026-07-11 | portal-other-section | v3.0 | إضافة التحليل المحاسبي |
| 2026-07-11 | حجز البلاغات | v1.0 | الإصدار الأول |
| 2026-07-11 | Smart Scheduler | v1.1 | تجاوز القيود |
| 2026-07-11 | excel_autofix | v1.0 | الإصدار الأول |

---

*هذا الملف يُحدّث بعد كل جلسة عمل أو إصدار جديد.*

## [2026-08-21] - توثيق جلسة حية: نجاح الأوتوفيلينج التلقائي + اكتشافات Lookup Modal

### نتائج الجلسة الحية (الإضافة القديمة على البوابة)
- الإضافة المثبتة نجحت في تعبئة بلاغين كاملين تلقائيًا (PAGE 1 + PAGE 2 لكل بلاغ) بدون تدخل يدوي - يؤكد سلامة منطق الـ AutoFiller.
- دروس الأتمتة: المحاكاة اليدوية عبر أدوات المتصفح بطيئة ولا تواكب إضافة تلقائية؛ التطوير يُبنى من الكود المُثبت ثم يُختبر بجلسة مراقبة واحدة.

### اكتشافات Lookup Modal على PAGE_1
- زر الفتح: button[aria-label*="Launch lookup modal"] (3 حقول: العلامة التجاريه + الموديل الفعلي 1 + الموديل الفعلي 2).
- المودال: رسالة "Choose one record and click Select to continue" + جدول + تذييل (اختر/إلغاء/إزالة القيمة).
- تحذير: button[aria-label*="Select"] في رأس الجدول = فرز أعمدة وليس زر تأكيد؛ زر التأكيد = آخر "اختر" ظاهر (reverse().find(b => b.offsetParent !== null)).
- البحث: الكتابة في input.query وحدها لا تفلتر - يجب نقر زر البحث button[aria-label*="Search"].
- الترتيب الإلزامي: العلامة التجارية قبل الموديلات.
- قيد التحقق: استعلامات :not([value='']) على حقول lookup مضللة - الاعتماد على الشكل الظاهر (snapshot).
- تراكم المودالات في DOM (6 مخفية) - فلترة بـ [style*='display: block'] أو offsetParent.

### توثيق
- التفاصيل الكاملة في SHARED_KNOWLEDGE.md (قسم "Lookup Modal على PAGE_1") و PORTAL_MAP.md (قسم "Lookup على PAGE_1").
