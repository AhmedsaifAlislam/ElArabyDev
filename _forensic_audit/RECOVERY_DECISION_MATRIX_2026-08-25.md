# RECOVERY DECISION MATRIX — 2026-08-25
**المشروع:** ElArabyDev | **المصدر:** `_forensic_audit/ARCHAEOLOGY_REPORT_2026-08-24.md` + أدلة جديدة مؤرخة اليوم
**النطاق:** تحليل معماري فقط — صفر تعديل كود، لا Deploy، لا Save/Submit/Finalize.
**قاعدة الإثبات:** كل بند مثبت بسطر كود أو ملف أو هاش. ما لا دليل عليه يُوسم بوضوح.

---

# 0) ملحق إلزامي: فحص معماري لاستراتيجية الفني (أسئلة المعماري الستة)

> هذا القسم يجيب على ARCHITECT UPDATE قبل أي تنفيذ مستقبلي. لم يُعدَّل أي ملف.

## Q1 — أين يستخرج Region حاليًا؟
**لا يوجد استخراج Region إطلاقًا.** `parseDataLine()` (src/unified-extension/content-script.js سطور **1149–1174**) تستخرج بالضبط: `orderId, brand, model, serial, model2, serial2, status, date, reportType, date2, problemCode, faultCode, subFaultCode, notes, technician, technicianName`. لا يوجد أي مفتاح `region|منطقة|المنطقة|محافظة` في الدالة ولا في أي موضع آخر بالملف (فحص regex شامل = صفر إصابة). **Region يجب أن يُضاف حقلًا جديدًا من الصفر.**

## Q2 — ما مفتاح الإدخال الذي يمثل Region؟
**غير موجود حاليًا في أي مصدر إدخال.** آلية التحليل تطبّع المفاتيح: `trim().toLowerCase().replace(/\s+/g,'')` (سطر 1151)، فالمفاتيح العربية تعمل مباشرة. التوصية المعمارية للمفاتيح المستقبلية من Messenger/Input:
```js
region: obj['region'] || obj['المنطقة'] || obj['منطقة'] || ''
```
بديل احتياطي: `obj['الحي']`. قرار تسمية المفتاح المعتمد من المرسل (Messenger) مطلوب من المعماري لأنه يحدد صيغة الرسائل التشغيلية.

## Q3 — أين يجب أن يحدث حل الفني (Resolution)؟
**نقطة الاختناق الوحيدة مثالية:** `selectRandomTechnician(targetName)` سطر **1012**. تُستدعى من موضعين فقط:
- `handleInstallationFlow` سطر **816**: `const techRes = await selectRandomTechnician(data.technicianName || data.technician || null)`
- `executePage2Followup` سطر **1331** + إعادة محاولة واحدة سطر **1336**

التغيير الأنظف: توسيع التوقيع إلى `selectRandomTechnician(targetName, region)` وحل المصدر داخلها (region-map ← random)، مع تمرير `data.region` من الموضعين. لا حاجة للمس أي مسار آخر.

## Q4 — هل يوفر `selectRandomTechnician()` الحالي fallback عشوائي آمن؟
**لا.** بعد P0-B.1 (سطور **1020–1025**): إذا كان `wantedTech` فارغًا → `warn('⚠️ P0-B.1: no technician specified...')` ثم `{ ok:false, reason:'technician-not-specified' }`. **مسار الاختيار العشوائي أُزيل بالكامل عمدًا** — الاسم أصبح تاريخيًا مضللًا. ملاحظة مهمة: الآليات (modal lookup / select-options) ما زالت تعمل بمطابقة **exact** عند توفر اسم محدد (سطور 1041–1044 و1052–1060). أي أن "المحرك" جاهز؛ ينقصه فقط مصدر اسم بديل (mapping أو random pool) + التوسيم.
ملاحظة جانبية: `handleSubgridIframeModal(..., pickRandomIfTargetMissing=true)` سطر 845 يحتفظ بسلوك عشوائي افتراضي لكنه خاص بأكواد الأعطال/المشاكل وليس بالفنيين — خارج نطاق هذا القرار.

## Q5 — أقل تغيير لإدخال Region Mapping دون إزعاج P0-B؟
أربعة تعديلات معزولة (كله داخل content-script.js، ولا يمس أي مسار strictExact):
1. ثابت `REGION_TECH_MAP` (14 مدخلًا كما حددها المعماري) + مجموعة `TECH_POOL` مشتقة من قيمه (فنيان فعليان: يوسف محمد يونس، محمد محمود أمين محمد).
2. `normalizeRegion(s)` = collapse-whitespace فقط (بدون includes — مطابقة exact بعد التطبيع، حسب التعليمات).
3. في `parseDataLine`: إضافة حقل `region` (مفاتيح Q2).
4. في رأس `selectRandomTechnician`، **بعد** بوابة existing-rows وبديلًا عن fail المباشر عندما `!wantedTech`:
   - لو `region` موجودة وموجودة في الخريطة → اسم mapped → استمرار بنفس المسار exact الحالي، `source:'region'`.
   - وإلا → اختيار عشوائي من `TECH_POOL` + أسطر التحذير الخمسة المعتمدة + `source:'random-fallback'`, `confidence:'NONE'`.
   - النتيجة: `{ok:true, name, source}` — وعندما يكون الاسم قادمًا من الإدخال يبقى سلوك P0-B حرفيًا (`source:'input'|'messenger'` مستقبلًا).
5. تتبع (Telemetry): إضافة `source` و`confidence` إلى `FR.technician` (سطر 1338) و`report.fieldResults.technician` (سطر 842)؛ بناء التقرير سطر 2292 يمرر الكائن أصلًا فيلتقط الحقل الجديد تلقائيًا.
**حجم التغيير التقديري: ~40–60 سطرًا، ملف واحد، صفر تغيير على P0-B.2 أو مسارات strictExact.**

## Q6 — هل يتعارض سلوك P0-B الصارم مع هذه المعمارية؟
**لا تعارض بنيوي.** P0-B.1 يشدد فقط عندما **يوجد اسم مطلوب** ولا يجد مطابقة exact. القرار الجديد يغير فقط ما يحدث عندما **لا يوجد اسم أصلًا** (fail ← warning+random+continue). مكسب P0-B محفوظ حرفيًا: *ممنوع اختيار فني غلط بصمت* — العشوائية الجديدة **صاخبة** (sysLog + source + confidence=NONE) وليست نجاحًا صامتًا.
**نقطتا انتباه للمعماري:**
- أ) سطرا 1339 و842 يطبعان "✅ Technician added" على أي `ok:true` — يجب تمييز source في اللوج وإلا تحول fallback إلى نجاح صامت بصريًا (ينتهك متطلب Analytics).
- ب) حلقة retry (سطرا 1333–1337) لن تعود تُطلق لحالة "لا فني بالمدخل" (تصبح ok:true) — هذا مقصود؛ تبقى retry لأعطال الميكانيكا (modal لم يظهر إلخ).

---

# 1) Executive Summary
1. المنتج الحالي = **14 قدرة تشغيلية نشطة** (§2). الإرث موزع على 3 أجيال خارجية + pre-v1 + legacy داخلي (§3).
2. **الـ48 مفتاح "المفقودة" ليست فقدانًا موحدًا**: 11 لديها قيمة مكافئة حالية (superseded)، ~15 هي طبقة config هاجرت إلى hardcode داخل الكود (ليست ميتة بل **مُصلَّبة**)، والباقي (~22) غياب حقيقي بدرجات متفاوتة الأهمية (§4).
3. **DateFilter غير محذوف عمليًا**: مشحون في manifest للشجرتين src وdeploy حتى اليوم + FAB نشط بالـdock، بينما IDEAS_BACKLOG يقول "حُذف نهائيًا". الحكم: **PARTIAL** (§6).
4. **deploy ليس مرآة آمنة**: الشجرتان متطابقتان بالهاش في 81 ملفًا وتختلفان في **ملف واحد بالضبط هو الأخطر**: `content-script.js` نسخة deploy = **قبل P0-B تمامًا** (10 كتل فرق = باتش P0-B نفسه، 88 دالة متطابقة الأسماء). خطر تشغيل المتصفح لنسخة بلا ضمانات P0-B قائم حتى نثبت العكس (§7).
5. ≥90% من بايتات JS في المستودع نسخ backup مكررة بالهاش (297MB من 314MB) — مشكلة سياسة احتفاظ لا مشكلة كود (§8).
6. أولوية الاسترجاع المقترحة: **قرار حقيقة التشغيل (deploy/src) ← استراتيجية الفني v2 ← timing/indicators config ← طبقة fieldDefinitions ← stopERP** (§9، §12).

---

# 2) Current Product Capability Map
من manifest + unified-dock TOOLS + الكود (كلها مؤكدة وجودًا اليوم):

| # | القدرة | الناقل | الدليل | الحالة |
|---|--------|--------|--------|--------|
| C1 | AutoFill workflows (تركيب/Page2/Page3/Resolution) | content-script.js (2330 سطرًا) | flows + parseDataLine | نشطة (P0-B.1+B.2) |
| C2 | تعبئة الفني subgrid (exact) | selectRandomTechnician L1012 | P0-B.1 gate | نشطة صارمة |
| C3 | أكواد المشاكل/الأعطال (modals) | handlePage2Modal L424 + fillLookupModal | strictExact opt | نشطة |
| C4 | بحث الأوردرز + Batch queue | selectors.json orders* + batchDelay | config | نشطة |
| C5 | الحجز والجدولة الحرة | FAB `elaraby-ba-fab` → booking-automation.js v1.0 | dock TOOLS | موصولة؛ **إثبات تشغيل مطلوب (E3)** |
| C6 | معالج البلاغات Reports v5.7 | FAB `rp-fab` → report-processor.js (35 دالة) | dock | نشطة |
| C7 | كشف أرقام العملاء PhoneReveal v15 | layer0 + elaraby-phone-reveal.js (20 دالة) + sheets-sync | manifest | نشطة |
| C8 | مرسل الماسنجر v2.2.0 | FAB `msq-fab` (web_accessible) messenger-sender.js | manifest WAR | نشطة |
| C9 | لوحة التحكم (استعراض فني) | FAB `elaraby-control-panel-mini` → control-panel.js | dock | نشطة |
| C10 | المساعد الذكي + صوت + كتم أخطاء البورتال | `elaraby-ai-fab`, `ai-voice-fab`, `ea-suppressor-tool` | dock | نشطة |
| C11 | Dock موحد + fab-hider | unified-dock.js (10 أدوات) | manifest | نشطة |
| C12 | فلتر التاريخ Unlocker | manifest content_script + FAB `ea-date-unlocker-fab` | §6 | **مشحونة ومتنازع عليها** |
| C13 | جسر Userscript runner | tampermonkey-runner.js | manifest | بنية تحتية نشطة |
| C14 | Dashboard + عملاء AI/N8N | src/dashboard + shared/ai-client + n8n-client | شجرة src | مجاورة نشطة |

---

# 3) Legacy Capability Map (الأجيال)
| الجيل | الموقع | المحتوى الوظيفي | الحالة |
|-------|--------|------------------|--------|
| G-external-1 | `العربي سيستم` (خارجي، جرد مُسلَّم) | جيل AutoFill أول | متحف خارجي |
| G-external-2 | `مساعد التقفيلات` + V2 (خارجيان) | نشر قديم + تحسينات | متحف خارجي |
| G-pre-v1 | `_archives/pre-v1-rollback_20260817_161034/` | نظام selectors بالـconfig (80 مفتاحًا) + نسخ userscripts أغنى | أرشيف |
| G-backups | `backups/deploy_backup_*` (~80 لقطة، 338MB) | تاريخ نشر يومي 08-11←08-23 | أرشيف تجميعي |
| G-legacy-dir | `legacy/` (29MB، 7 مجلدات) | مساعد تقفيلات منشور قديم 19.6MB + اكواد 6.8MB + البحث عن بلاغ + المساعد الذكي + Rescheduling Opt. + portal-other-section + حجز البلاغات | متحف داخلي |
| G-inline-old | ملفات `-OLD` ونسخ nested داخل src/deploy | messenger v2.0.0، phone-reveal مكرر، JSONL محادثات | وزن ميت داخل الشجرة الحية |

---

# 4) تحليل الـ48 مفتاح المفقود (Selectors/Config)

**المنهجية:** مطابقة أسماء وقيم مفاتيح config بين جيل pre-v1 (80 مفتاحًا flat) والتيار (33). النتيجة الكمية: **48 مفتاحًا غير موجودة في config التيار**؛ منها 27 ما زال اسمها يظهر في شجرة الشيفرة الحية (إشارات بالاسم فقط)، و21 بلا أي أثر اسمي، وصفر مفتاح بقيمته الحرفية في config الحالي (`equivValueInCur = 0/48`). الجدول الكامل بالقيم محفوظ في `_forensic_audit/out_missing_selectors_matrix.json` والترتيب في `rdm_48_ranking.json`.

## 4.1 الجدول الكامل (48 صفًا)

| # | المفتاح | العائلة | ملفات pre-v1 | إشارات باسمه حاليًا* | التصنيف |
|---|---------|---------|--------------|----------------------|----------|
| 1 | fieldLabels.status | fieldLabels | 6 | 66 | SUPERSEDED-FUNCTIONAL |
| 2 | fieldLabels.date | fieldLabels | 6 | 50 | SUPERSEDED-FUNCTIONAL |
| 3 | fieldLabels.model | fieldLabels | 6 | 38 | SUPERSEDED-FUNCTIONAL |
| 4 | fieldDefinitions.model | fieldDefinitions | 6 | 38 | SUPERSEDED-FUNCTIONAL |
| 5 | fieldDefinitions.brand | fieldDefinitions | 6 | 32 | SUPERSEDED-FUNCTIONAL |
| 6 | fieldLabels.brand | fieldLabels | 6 | 32 | SUPERSEDED-FUNCTIONAL |
| 7 | phone | phone | 6 | 32 | SUPERSEDED (C7 يغطيه) |
| 8 | fieldDefinitions.productType | fieldDefinitions | 6 | 20 | SUPERSEDED-FUNCTIONAL |
| 9 | address | address | 6 | 20 | SUPERSEDED (استخراج حالي) |
| 10 | fieldLabels.serial | fieldLabels | 6 | 20 | SUPERSEDED-FUNCTIONAL |
| 11 | fieldDefinitions.defect | fieldDefinitions | 6 | 10 | SUPERSEDED-FUNCTIONAL |
| 12 | portalFieldIds.defectMajor | portalFieldIds | 6 | 12 | TRULY-MISSING (يتطلب E4) |
| 13 | fieldLabels.notes | fieldLabels | 6 | 14 | SUPERSEDED-FUNCTIONAL |
| 14 | portalFieldIds.defectCode | portalFieldIds | 6 | 12 | TRULY-MISSING (يتطلب E4) |
| 15 | fieldDefinitions.quantity | fieldDefinitions | 6 | 12 | SUPERSEDED-FUNCTIONAL |
| 16 | fieldDefinitions.sparePart | fieldDefinitions | 6 | 4 | TRULY-MISSING (يتطلب E4) |
| 17 | portalFieldIds.sparePart | portalFieldIds | 6 | 4 | TRULY-MISSING (يتطلب E4) |
| 18 | _subgridAddPatterns.technician | _subgridAddPatterns | 6 | 8 | MISSING-PATTERN (مرشح قوي) |
| 19 | complaintCode | complaintCode | 6 | 6 | MISSING (مسار نص الشكوى) |
| 20 | sparePartsNoneText | sparePartsNoneText | 6 | 0 | MISSING (كشف «بدون قطع») |
| 21 | subgrid | subgrid | 6 | 4 | MISSING (حاوية التحقق) |
| 22 | saveBtn | saveBtn | 6 | 4 | MISSING (يتطلب E6) |
| 23 | lookupBtn | lookupBtn | 6 | 4 | MISSING (يتطلب E6) |
| 24 | _subgridAddPatterns.problems | _subgridAddPatterns | 6 | 2 | MISSING-PATTERN (مرشح قوي) |
| 25 | _lookupBtnExcludePattern | _lookupBtnExcludePattern | 4 | 0 | MISSING-PATTERN |
| 26 | serviceType | serviceType | 4 | 2 | MISSING (تصنيف الخدمة) |
| 27 | saveTimeoutMs | saveTimeoutMs | 4 | 2 | HARDENED (مُصلَّب في الكود) |
| 28 | retryIntervalMs | retryIntervalMs | 4 | 2 | HARDENED (مُصلَّب في الكود) |
| 29 | lookupNameInput | lookupNameInput | 4 | 2 | MISSING (إدخال بحث المودال) |
| 30 | workOrderType | workOrderType | 2 | 0 | MISSING (تصنيف) |
| 31 | technicianSelect | technicianSelect | 2 | 0 | MISSING (selector صريح؛ مسار P0-B يعمل بدونه) |
| 32 | subgridTitle | subgridTitle | 2 | 0 | MISSING (مرساة تحقق) |
| 33 | subgridRow | subgridRow | 2 | 0 | MISSING (مرساة تحقق) |
| 34 | serviceLabels | serviceLabels | 2 | 0 | SUPERSEDED-FUNCTIONAL |
| 35 | notesLabels | notesLabels | 2 | 0 | SUPERSEDED-FUNCTIONAL |
| 36 | lookupModalSelectBtn | lookupModalButtons | 2 | 0 | MISSING (متانة المودال) |
| 37 | lookupModalSearchBtn | lookupModalButtons | 2 | 0 | MISSING (متانة المودال) |
| 38 | lookupModalCloseBtn | lookupModalButtons | 2 | 0 | MISSING (متانة المودال) |
| 39 | lookupClearBtn | lookupClearBtn | 2 | 0 | MISSING (تنظيف قبل البحث) |
| 40 | installationKeywords | installationKeywords | 2 | 0 | MISSING (كشف «تركيب») |
| 41 | errorIndicator | indicators | 2 | 0 | MISSING (شبكة أمان) — مرشح أولوية |
| 42 | deviceType | deviceType | 2 | 0 | MISSING (تصنيف) |
| 43 | complaintText | complaintText | 2 | 0 | MISSING (مسار الشكوى) |
| 44 | complaintCodeLabels | complaintCodeLabels | 2 | 0 | MISSING (مسار الشكوى) |
| 45 | busyIndicator | indicators | 2 | 0 | MISSING (شبكة أمان) — مرشح أولوية |
| 46 | _priorityProblemPatterns | problemPatterns | 2 | 0 | MISSING (فرز المشاكل) |
| 47 | _mergeNote | meta | 2 | 0 | NOT-CODE (أثر توثيقي لا وظيفي) |
| 48 | _excludeProblemPatterns | problemPatterns | 2 | 0 | MISSING (فرز المشاكل) |

\* «إشارات باسمه» عدّ سلاسل خام في الشجرة الحية — إشارة ضعيفة (كلمة مثل `status` تتكرر طبيعيًا). المعيار القوي هو قيمة المفتاح نفسها، وهي **صفر/48** في config التيار.

## 4.2 القراءة المعمارية

1. **ليست خسارة موحدة.** ثلاث طبقات اختلاف: (أ) **SUPERSEDED-FUNCTIONAL (~17)** — الوظيفة حية لكن كمنطق مطابقة داخل الكود بدل config (fieldLabels/fieldDefinitions/labels). استرجاعها = إعادة تفعيل طبقة config، ليس استرجاع قدرة. (ب) **HARDENED (2)** — قيم timing صارت ثوابت كود؛ إرجاعها كطبقة config منخفض المخاطرة جدًا. (ج) **TRULY-MISSING (~28)** — أنماط subgrid، مؤشرات الأمان (error/busy)، أزرار المودال، فرز المشاكل، portalFieldIds، وسلاسل كشف («تركيب»، «بدون قطع»): فقدان فعلي لقدرات متانة/سلامة.
2. **أخطر فاقد = شبكات الأمان:** `errorIndicator`/`busyIndicator` كانت تجعل الفلو ينتظر/يكشف فشل الحفظ. غيابها مع strictExact الحالي يعني اعتمادًا أكبر على timing أعمى.
3. **portalFieldIds الثلاثة** لا تُسترجع إلا بعد أخذ عينة DOM حديثة (E4) — استرجاع IDs قديمة دون تحقق = خطر ملء خاطئ صامت.
4. **هل فقدانها سبب regression؟** لا دليل على عطل قائم؛ لكنها تُفقد **عمق دفاع** وليست وظيفة أساسية. تُصنف NEEDS RUNTIME EVIDENCE قبل أي تفعيل (E6).
5. **كمسترجَع configuration-layer؟** نعم لثلاث مجموعات فقط (timing، indicators، patterns) عبر قراءة defensive من selectors.json مع قيم افتراضية حالية — غياب المفتاح لا يكسر شيئًا.

### TOP RECOVERY CANDIDATES (من هذه العائلة)
بالترتيب VALUE×CONFIDENCE×LOW-RISK: `errorIndicator+busyIndicator` ← `saveTimeoutMs+retryIntervalMs` ← `_subgridAddPatterns.{technician,problems}` ← `_exclude/_priorityProblemPatterns` ← `installationKeywords` ← `lookupModal* trio + lookupClearBtn` ← `portalFieldIds trio` (بعد E4) ← `sparePartsNoneText` ← `subgridTitle+subgridRow`.

---

# 5) تفكيك الـUserscripts السبعة إلى Features

المخزون الكامل بالدوال: `_forensic_audit/out_userscript_inventory.json` (نسخ pre-v1). المنطق: لا نعيد «سكربتًا»؛ نفصل كل feature ونقيس وجودها في المنتج الحالي (C1–C14).

## 5.1 elaraby-phone-reveal.js (67KB، 28 دالة)
| Feature | دوالها | في التيار؟ | الحكم |
|---------|--------|------------|-------|
| كشف الطبقات 0/3 | extractFromDOM, extractFromDoc, processLayer3 | Layer0 مشحونة بالمانيفست | KEEP (الحالية) |
| كشف يدوي شامل | forceRevealPhones | غير مثبت كزر مستقل | NEEDS EVIDENCE |
| Autopilot ترقيم صفحات | fetchAllPages, clickNextPage, runAutoPilotStep | غائب عن الشجرة الحية | RECOVER (قيمة تشغيلية عالية) |
| مزامنة Google Sheets | getWebAppUrl, syncRowToGoogle, detectColumns, extractRow, fetchOne, worker | sheets-sync موجود (C7) | مقارنة غنى قبل قرار |
| إشعار صفوف جديدة | checkNewRowsAndNotify, sendNotification, requestNotificationPermission | غائب | DEFER (لمسة راحة) |
| جدول افتراضي | renderVirtualRow, getFilteredRows | غائب | DEFER (أداء عند حجم كبير) |
| **إيقاف حلقات ERP** | **stopERP** | **غير موجود بالشجرة الحية (تحقق بالبحث)** | **RECOVER — أولوية** (درء ضرر) |
| ملاحظات سريعة + UI | loadQuickNotes, saveQuickNotes, injectDesignTokens, tabStyle | جزئي | DEFER |
| لوحة سجلات | renderLogs, updateUI, log | smart-log.js الحالي يغطي | KEEP (الحالي) |

## 5.2 messenger-sender.js (53KB، 21 دالة)
| Feature | دوالها | في التيار؟ | الحكم |
|---------|--------|------------|-------|
| خط CSV كامل | loadData, parseCSV, parseRow, handleFile | messenger v2.2 الحالي | مقارنة غنى (غالبًا KEEP) |
| اكتشاف الإدخال عبر Shadow DOM | findInputBoxInDoc, walkShadow, findInputBox | نعم (جوهر الإرسال) | KEEP |
| **لصق فقط بلا إرسال آلي** | pasteOnly | يتطلب تحقق بالتيار | NEEDS EVIDENCE (قيمة أمان) |
| أوضاع الإرسال | sendMessage, sendService, runSend, runSendOneRandom | نعم | KEEP |
| توزيع نصائح/آlikes | sendAllTips, runSend10Likes + tips.json | غالبًا مقطوع في v2.2 الحالية | DEFER (ميزة تسويقية اختيارية) |
| لوحة UI والحالة | initUI, injectPanel, setStatus, addSent, addErr, el | نعم (msq-fab) | KEEP |

## 5.3 report-processor.js (35 دالة — Reports v5.7)
المعالج الحالي C6 نشط بنفس الجيل المعلن (v5.7). الفروقات المحتملة داخل الدوال الـ35 تحتاج مقارنة function-level قبل أي ادعاء فقدان. **الحكم الجماعي: KEEP (الحالي) + تدقيق فرق مؤجل.**

## 5.4 booking-automation.js (v1.0، 26 دالة)
موصولة FAB نظريًا (C5) لكن بلا إثبات تشغيل. **NEEDS RUNTIME EVIDENCE (E3) — لا استرجاع شيء منها قبل E3.**

## 5.5 date-filter-unlocker
انظر §6 — متنازع عليه توثيقيًا، مشحون فعليًا.

## 5.6 tampermonkey-runner.js
محرك تنفيذ userscripts داخل الإضافة — بنية تحتية حية (C13). **KEEP.**

## 5.7 tips.json
أصل محتوى (نصائح) لتوزيع الماسنجر — ليس كودًا. **DEFER مع أوضاع tips.**

**خلاصة SI-2:** الوظائف القابلة للدمج النظيف في المنتج الحالي: **stopERP** ثم **Autopilot الترقيم** ثم **pasteOnly** (إن ثبت غيابه) — كلها إضافات معزولة لا تمس Core.

---

# 6) SPECIAL INVESTIGATION — DATE FILTER

**الأدلة (كلها مؤرخة اليوم):**
1. `manifest.json` في **src** وفي **deploy**: مدخل content_script لفلتر التاريخ موجود **الآن**.
2. `unified-dock.js`: أداة `ea-date-unlocker-fab` مسجلة بين أدوات الـdock العشر.
3. التوثيق: «DateFilter Unlocker = أداة فعالة».
4. `IDEAS_BACKLOG`: «DateFilter حُذف نهائيًا / بديل آمن مخطط».

**التفسير المتسق الوحيد:** قرار «الحذف» وُثّق كنية/خطة ولم يُنفذ على هذه الشجرة (أو نُفذ على جيل userscript مختلف بينما نسخة الإضافة بقيت). لا مجال لحسم نيّة المطورين التاريخية، ومجال حسم **الحالة الفعلية** مفتوح.

```
DATE FILTER STATUS: PARTIAL
- EXISTS & SHIPPED:     CONFIRMED (manifest src + deploy + dock FAB اليوم)
- OPERATIVE AT RUNTIME: UNKNOWN (لم يُختبر أمام البورتال)
- "DELETED":            REFUTED عمليًا على الشجرة الحالية
```

**ما يحسمه:** E2 — نقرة واحدة على FAB داخل جلسة بورتال مراقبة: إن عدّل سلوك الفلتر → ACTIVE-CONTESTED (قرار معماري: keep فعلي أو إزالة فعلية)؛ إن لا → DEAD-SHIPPED (تنظيف مستقبلي).

---

# 7) SPECIAL INVESTIGATION — DEPLOY VS SRC

**الحقائق المقاسة:**
- 81 ملفًا متطابق **byte-by-byte (SHA-1)** عبر الشجرتين، بما فيها manifest وshared/*.
- **المختلف واحد بالضبط: `content-script.js`.**
- الفرق المعماري = 10 كتل تغيّر هي **باتش P0-B نفسه** (بوابة P0-B.1 الصارمة في `selectRandomTechnician` + strictExact في مسارات المودالات)؛ أسماء الدوال الـ88 متطابقة — لا features تاريخية إضافية في deploy.
- إذن: `deploy/content-script.js` = **لقطة سابقة لـP0-B**؛ `deploy/` ككل = artifact مجمّد وليس بيئة تطوير.

**الإجابات المباشرة:**
- أي نسخة فيها P0-B؟ **src فقط.**
- أيهما فيه features تاريخية أغنى؟ **لا أحد** — الفرق محصور في P0-B.
- هل يمكن أن يكون deploy هو artifact؟ نعم، وهذا الراجح (mirror زمن آخر نشر قبل P0-B).
- هل src هو source of truth؟ **نعم بحكم المحتوى** (الأحدث منطقيًا وباحتوائه الإصلاحات) — استنتاج، لا دليل تشغيل.
- خطر «المتصفح يشغّل deploy ونحن نصلح src»؟ **قائم وحقيقي**: Load-unpacked يلتزم مجلدًا واحدًا ولا يمكن حسمه من الملفات وحدها.

**الدليل الحاسم المطلوب (E1):** `chrome://extensions` → Details للمكوّن المحمّل → مسار المصدر الفعلي + مطابقة SHA-1 لـ`content-script.js` هناك مع النسختين. دقيقة واحدة تحسم كل شيء. **لا يُلمس أي ملف قبل صدور هذا الدليل.**

---

# 8) DEAD / DUPLICATE / SUPERSEDED ANALYSIS

**مقاسًا بالهاش على الشجرة الحية** (src + deploy + root، مستبعدين _archives/backups/legacy/node_modules):
- ملفات كود ممسوحة: **214** | مجموعات تكرار: **74** | نسخ زائدة: **80 ⇒ ≈37% من ملفات الكود الحية نسخ مطابقة حرفيًا**.
- أسوأ نمط: `deploy/shared/{arabic-utils,data-mapper,message-bus,portal-selectors,smart-log,storage-proxy}.js` مكرر **×3** — قنبلة تعديل: تحديث نسخة وترك الباقي يعيد إنتاج انحراف من نوع deploy/src داخل الشجرة نفسها.
- على مستوى المستودع كله: ≥90% من بايتات JS نسخ backup مكررة بالهاش (297MB/314MB) — **مشكلة سياسة احتفاظ، ليست مشكلة كود.**

**التصنيف التقريبي للكود الفريد الحي:**
| الفئة | النسبة التقريبية | أمثلة |
|-------|------------------|-------|
| Active | ~55% | حاملات C1–C14 |
| Duplicate (نسخ حرفية) | ~37% من الملفات | deploy/shared ×3، ai-panel/background/control-panel ×2 |
| Superseded | ~5% | deploy/content-script.js (قبل P0-B)، config مهاجر لكود |
| Dead-inline | ~3% | ملفات `-OLD`، messenger v2.0.0 المتداخل، JSONL محادثات داخل أشجار الكود |
| Unknown | هامشي | dashboard/n8n (خارج نطاق التشغيل المدروس) |

**قاعدة صارمة:** لا يُسترجع شيء لمجرد وجوده في backup. الـbackups مصدر أرشفة وإسناد زمني فقط.

---

# 9) TOP RECOVERY CANDIDATES (الترتيب النهائي)

VALUE × CONFIDENCE × LOW-RISK (وليس بالحنين):

| رتب | البند | النوع | السبب | الشرط |
|-----|------|------|-------|-------|
| R1 | حسم نسخة التشغيل (E1) | قرار+دليل | بدونها كل إصلاح src قد يكون على شجرة ميتة | نقرة extensions |
| R2 | Technician Strategy v2 (region map + random صاخب) | سلوكي معتمد | تصميم المعماري جاهز (§0/Q5)؛ يرفع جودة البيانات ويوقف الفشل الأعمى | موافقة المعماري على التنفيذ فوق نسخة E1 المؤكدة |
| R3 | errorIndicator + busyIndicator | config layer | شبكة أمان الحفظ — أعلى متانة/أقل مخاطرة | E6 خفيف |
| R4 | saveTimeoutMs + retryIntervalMs | config layer | إعادة قابلية الضبط بافتراضيات = قيم الكود الحالية | لا شيء |
| R5 | stopERP (من phone-reveal) | دالة معزولة | درء ضرر (قتل حلقات ERP الهائمة) — STRONG | قراءة سياق استدعائها الأصلي |
| R6 | _subgridAddPatterns.{technician,problems} | config layer | متانة زر الإضافة في subgrid الفني | E6 |
| R7 | _exclude/_priorityProblemPatterns | config layer | جودة فرز المشاكل | مراجعة قيم القديم |
| R8 | lookupModal{Search,Select,Close}+lookupClearBtn | config layer | متانة مودالات البحث | E6 |
| R9 | installationKeywords | config layer | كشف «تركيب» يميّز نوع الفلو | لا شيء |
| R10 | portalFieldIds trio | IDs بورتال | ملء مباشر أسرع | **E4 إلزامي أولًا** |
| R11 | sparePartsNoneText | سلسلة كشف | دقة كشف «بدون قطع» | لا شيء |
| R12 | subgridTitle + subgridRow | مراسيات تحقق | تأكيد بصري بعد الإضافة | E6 |
| R13 | طبقة fieldDefinitions كاملة (data-driven) | إعادة تصميم | أفق طويل لتوحيد التعبئة | بعد استقرار R3–R9 |

**خارج الجدول (userscript features):** Autopilot الترقيم (بعد R5)، pasteOnly (بعد التحقق)، إشعارات Sheets (DEFER).

---

# 10) REJECT / DO NOT RECOVER

1. **الاختيار العشوائي الصامت للفني** — superseded نهائيًا بـTechnician v2؛ العودة له تهديد سلامة البيانات.
2. **مطابقة region بـincludes()** — ممنوعة بقرار معماري صريح (خطر تطابق عام/خاص).
3. **messenger v2.0.0 وكل نسخ `-OLD` والمتداخلة** — وزن ميت؛ المرجع v2.2 الحي.
4. **rollback كامل لنظام الـ80 مفتاحًا** — متحف؛ نتقدم بطبقات config انتقائية (§9).
5. **legacy/ المنشورة (binaries 19.6MB)** — مرجع تاريخي فقط، لا تُشغَّل ولا تُدمج.
6. **اعتبار backups مصدر حق تشغيلي** — أرشفة فقط (فرق deploy/src يثبت أن اللقطات تخدع).
7. **إحياء أوضاع tips/10-likes الآن** — قيمة هامشية مقابل سطح تعارض مع v2.2.
8. **أي استرجاع portalFieldIds قبل E4** — IDs عمياء = كتابة في حقول خاطئة بصمت.

---

# 11) RUNTIME EVIDENCE REQUIRED

| ID | السؤال | كيف | يحسم |
|----|--------|-----|------|
| E1 | أي مجلد يشغّله Chrome فعليًا؟ | chrome://extensions → path + هاش content-script.js | §7 كاملًا؛ بوابة كل ما بعده |
| E2 | هل DateFilter يعمل أمام البورتال؟ | نقرة FAB مراقبة + ملاحظة سلوك الفلتر | §6 → ACTIVE-CONTESTED أو DEAD-SHIPPED |
| E3 | هل booking-automation يعمل end-to-end؟ | جلسة حجز تجريبية مراقبة | مصير C5 وfeaturesها |
| E4 | هل IDs البورتال القديمة صالحة للـDOM الحديث؟ | عينة inspect للحقول الثلاثة | R10 |
| E5 | ما أسماء الفنيين الحالية في select البورتال؟ | snapshot لخيارات الـselect | TECH_POOL في Technician v2 |
| E6 | كيف يبدو تدفق subgrid/المودالات اليوم؟ | كابتشر تدفق إضافة فني/مشكلة (قراءة فقط) | R3/R6/R8/R12 |

---

# 12) RECOMMENDED RECOVERY ORDER

- **Phase 0 — الحقيقة (E1+E2+E5):** يوم أدلة لا كود. المخرج: نسخة التشغيل المؤكدة + حكم DateFilter + pool الفنيين.
- **Phase 1 — Technician v2:** تنفيذ تصميم §0/Q5 كما هو (40–60 سطرًا، ملف واحد) بعد إذن المعماري وفوق نسخة E1 المؤكدة.
- **Phase 2 — طبقات Config الآمنة:** R3←R4←R9←R11 (قراءة defensive من selectors.json، الافتراضيات = قيم الكود الحالية؛ صفر تغيير سلوك افتراضي).
- **Phase 3 — المتانة المشروطة بالأدلة:** R6←R7←R8←R12 بعد E6، ثم R10 بعد E4 خلف flag.
- **Phase 4 — ثمار الـUserscripts:** stopERP أولًا (R5)، ثم Autopilot الترقيم، ثم pasteOnly إن ثبت غيابه.
- **مستمر (سياسة لا كود):** قرار احتواء الـ37% تكرارًا (خصوصًا deploy/shared ×3) يُرفع للمعماري كقرار منفصل.

---

# 13) ARCHITECTURAL RISKS

1. **انحراف الشجرتين مجددًا** — الجذر الكامن لهذه المرحلة كلها: ما دام deploy جنب src بلا بوابة نشر، سيتكرر الانحراف. E1 يعالج الحاضر؛ السياسة تعالج المستقبل.
2. **نمط «التصلّب» الصامت:** مفاتيح config تهاجر إلى الكود وتموت بالاسم دون قرار موثق (~15 مفتاحًا حدث لها هذا). أي Layer جديدة (R3/R4) تحتاج قاعدة: «لا يُنقل مفتاح لكود إلا بسجل migration».
3. **غموض ok:true:** نجاح تشغيلي ≠ ثقة مصدر؛ بدونه يتحول random-fallback إلى نجاح كاذب في التقارير. العلاج في §0/Q6-أ (source+confidence في اللوج والتقرير).
4. **تطبيع العربية في region:** القرار collapse-whitespace + exact آمن ضد التطابق الخاطئ وقد يرفع نسبة fallback مع الكتابات المشوهة — مراقبة source=random-fallback أسبوعيًا تقيس جودة بيانات الماسنجر.
5. **مانيفست ينقل ميزة متنازع عليها (DateFilter):** يهدم ثقة «التوثيق = الواقع». E2 ثم مواءمة Docs↔Manifest في اتجاه واحد.
6. **نسخ shared ×3:** hotfix على shared دون مزامنة الثلاث نسخ يعيد إنتاج انحرافًا داخل src نفسها.

---

# 14) FINAL DECISION MATRIX (مكثفة)

| الوحدة | الجيل | موجودة؟ | بديل حالي؟ | استرجاع بكود؟ | بconfig فقط؟ | تعارض Core؟ | النطاق | الدليل | **القرار** |
|--------|------|---------|-----------|----------------|---------------|---------------|--------|--------|-------------|
| AutoFill flows (C1) | حالي | نعم | — | — | — | — | AutoFill | CONFIRMED | KEEP |
| فني subgrid strictExact (C2) | حالي/P0-B | نعم | — | — | — | — | Booking/AutoFill | CONFIRMED | KEEP |
| مودالات مشاكل strictExact (C3) | حالي | نعم | — | — | — | — | Booking | CONFIRMED | KEEP |
| بحث أوردرز+Batch (C4) | حالي | نعم | — | — | — | — | Navigation | CONFIRMED | KEEP |
| booking-automation (C5) | حالي | مشحونة | — | — | — | — | Booking/Scheduling | POSSIBLE | NEEDS RUNTIME EVIDENCE (E3) |
| Reports v5.7 (C6) | حالي | نعم | — | — | — | — | Reports | CONFIRMED | KEEP (+تدقيق فرق مؤجل) |
| PhoneReveal core (C7) | حالي | نعم | — | — | — | — | PhoneReveal | CONFIRMED | KEEP |
| stopERP | pre-v1 userscript | لا | لا | نعم (دالة) | لا | منخفض | PhoneReveal | STRONG | **RECOVER (R5)** |
| Autopilot ترقيم | pre-v1 userscript | لا | لا | نعم | لا | منخفض | PhoneReveal | STRONG | RECOVER (بعد R5) |
| pasteOnly | pre-v1 userscript | غير مؤكد | ؟ | ؟ | لا | لا | Messenger | UNKNOWN | NEEDS RUNTIME EVIDENCE |
| أوضاع tips/10likes | pre-v1 userscript | لا | جزئي | نعم | لا | متوسط | Messenger | STRONG | DEFER |
| Messenger v2.2 (C8) | حالي | نعم | — | — | — | — | Messenger | CONFIRMED | KEEP |
| Control panel/AI/dock (C9–C11) | حالي | نعم | — | — | — | — | UI/FAB | CONFIRMED | KEEP |
| DateFilter (C12) | حالي مشحون | نعم (manifest) | — | — | — | محتمل | UI/Portal | CONFIRMED-shipped / UNKNOWN-runtime | NEEDS RUNTIME EVIDENCE (E2) |
| Runner (C13) + Dashboard/N8N (C14) | حالي | نعم | — | — | — | — | Infra | CONFIRMED | KEEP |
| Technician v2 (region+random صاخب) | جديد | لا | تصميمه جاهز | نعم (§0/Q5) | جزئي (الخريطة) | لا (مكمل لـP0-B) | Booking | CONFIRMED-design | **REIMPLEMENT (R2)** |
| error/busyIndicators | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | **RECOVER (R3)** |
| saveTimeoutMs/retryIntervalMs | pre-v1 | لا (مُصلَّبة) | قيم بالكود | لا | نعم | لا | AutoFill | STRONG | RECOVER (R4) |
| _subgridAddPatterns ×2 | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R6، بعد E6) |
| exclude/priorityPatterns | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R7) |
| lookupModal btns + Clear | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R8، بعد E6) |
| installationKeywords | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | RECOVER (R9) |
| portalFieldIds ×3 | pre-v1 | لا | لا | لا | نعم | **نعم إن عُميت** | AutoFill | STRONG(قديم) | NEEDS EVIDENCE (E4) ثم R10 |
| sparePartsNoneText | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | RECOVER (R11) |
| subgridTitle/Row | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R12، بعد E6) |
| طبقة fieldDefinitions كاملة | pre-v1 | لا (وظيفيًا بالكود) | نعم | إعادة تصميم | جزئي | متوسط | AutoFill | CONFIRMED | DEFER (R13 طويل الأجل) |
| fieldLabels/labels ~17 مفتاحًا | pre-v1 | لا بالاسم | نعم (منطق الكود) | لا | لا داعٍ | لا | AutoFill | CONFIRMED | REJECT-as-config (SUPERSEDED) |
| _mergeNote | pre-v1 | لا | — | — | — | — | meta | CONFIRMED | REJECT (NOT-CODE) |
| random صامت / includes() matching | قديم | لا (أُزيلت) | v2 | — | — | **نعم** | Booking | CONFIRMED | **REJECT** |
| messenger v2.0.0 / -OLD / nested dupes | inline-old | نعم كنسخ | v2.2 | — | — | — | — | CONFIRMED | REJECT (وزن ميت) |
| deploy/content-script.js (قبل P0-B) | لقطة | نعم | src | — | — | **نعم لو شُغّلت** | — | CONFIRMED | REJECT-as-source (artifact) |
| deploy/shared ×3 duplicates | حالي | نعم | الأصل | — | — | خطر صيانة | — | CONFIRMED | REJECT (قرار dedupe للمعماري) |

---

# FINAL STATUS

| السؤال | الجواب |
|--------|--------|
| كم Feature موجودة حاليًا؟ | **14** (C1–C14؛ منها C12 مشحونة متنازع عليها وC5 بلا إثبات تشغيل) |
| كم Feature تاريخية؟ | **6 مجموعات أجيال** (G-external-1/2، pre-v1، backups، legacy-dir، inline-old) تفصّلت إلى ~110 دالة userscripts + 48 مفتاح config |
| كم Feature مفقودة؟ | **48 مفتاح config** (27 بأثر اسمي، 21 بلا أثر، 0 بقيمة حرفية) + عناقيد userscript مفقودة: stopERP، autopilot، pasteOnly؟، tips-modes |
| كم تستحق Recovery؟ | **13 بندًا مرتبًا (R1–R13)**؛ الواقعي القريب = R1–R5 |
| كم تحتاج Runtime Evidence؟ | **6 حزم (E1–E6)** — E1 حارس بوابة لكل ما بعده |
| أول 5 استرجاعات؟ | **R1** حسم نسخة التشغيل ← **R2** Technician v2 ← **R3** indicators ← **R4** timing-config ← **R5** stopERP |
| ما يجب ألا يُعاد؟ | العشوائية الصامتة، includes() للمطابقة، نسخ -OLD/v2.0.0، rollback الـ80 مفتاحًا، legacy binaries، اعتبار backups/deploy مصدر حق، tips-modes الآن، portalIds عمياء |
| تناقضات Archaeology نفسه؟ | **3 + ملاحظة تسمية:** (1) «deploy≈mirror» قلّلت تقدير خطر اختلاف ملف واحد هو الأخطر — صُححت هنا (§7). (2) «DateFilter حُذف» (BACKLOG) مقابل شحنه بالمانيفست — الحالة الفعلية PARTIAL (§6). (3) «11 مفتاحًا لها مكافئ» مكافئة **وظيفية بالكود** بينما المصفوفة القيمية 0/48 — تلزم ثلاثية معايير موحدة (قيمة/اسم/وظيفة) لأي تعداد قادم. (4) تسمية `selectRandomTechnician` أصبحت مضللة بعد P0-B (العشوائية مُزالة) — دِين تسمية عند أول تعديل مشروع لها. |

---
*أُنتج هذا التقرير بلا أي تعديل على ملفات المنتج. الأدلة الخام داخل `_forensic_audit/`: `out_missing_selectors_matrix.json`, `rdm_48_ranking.json`, `out_userscript_inventory.json`, `archaeology_census.json`. (ملف `_rdm_part2.md` شطب وسيط للكتابة يمكن حذفه بأمر المعماري.)*

