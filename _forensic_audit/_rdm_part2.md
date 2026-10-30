
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
| 20 | sparePartsNoneText | sparePartsNoneText | 6 | 0 | MISSING (سلكشف «بدون قطع») |
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

1. **ليست خسارة موحدة.** ثلاث طبقات اختلاف: (أ) **SUPERSEDED-FUNCTIONAL (~17)** — الوظيفة حية لكن كمنطق مطابقة داخل الكود بدل config (fieldLabels/fieldDefinitions/labels). استرجاعها = إعادة تفعيل طبقة config، ليس استرجاع قدرة. (ب) **HARDENED (2)** — قيم timing صارت ثوابت كود؛ إرجاعها كطبقة config منخفض المخاطرة جدًا. (ج) **TRULY-MISSING (~28)** — أنماط subgrid، مؤشرات الأمان (error/busy)، أزرار المودال، فرز المشاكل، portalFieldIds، وسلاسل كشف («تركيب»، «بدون قطع»): هذه فقدان فعلي لقدرات متانة/سلامة.
2. **أخطر فاقد = شبكات الأمان:** `errorIndicator`/`busyIndicator` كانت تجعل الفلو ينتظر/يكشف فشل الحفظ. غيابها مع strictExact الحالي يعني اعتمادًا أكبر على timing أعمى.
3. **portalFieldIds الثلاثة** لا تُسترجع إلا بعد أخذ عينة DOM حديثة (E4) — استرجاع IDs قديمة دون تحقق = خطر ملء خاطئ صامت.
4. **هل فقدانها سبب regression؟** لا دليل على عطل قائم؛ لكنها تُفقد **عمق دفاع** وليست وظيفة أساسية. تُصنف NEEDS RUNTIME EVIDENCE قبل أي تفعيل (E6).
5. **كمسترجَع configuration-layer؟** نعم لثلاث مجموعات فقط (timing، indicators، patterns) عبر قراءة defensive من selectors.json مع قيم افتراضية حالية — أي أن غياب المفتاح لا يكسر شيئًا.

### TOP RECOVERY CANDIDATES (من هذه العائلة)
بالترتيب VALUE×CONFIDENCE×LOW-RISK: `errorIndicator+busyIndicator` ← `saveTimeoutMs+retryIntervalMs` ← `_subgridAddPatterns.{technician,problems}` ← `_exclude/_priorityProblemPatterns` ← `installationKeywords` ← `lookupModal* trio + lookupClearBtn` ← `portalFieldIds trio` (بعد E4) ← `sparePartsNoneText` ← `subgridTitle+subgridRow`.

---

# 5) تفكيك الـUserscripts السبعة إلى Features

المخزون الكامل بالدوال: `_forensic_audit/out_userscript_inventory.json` (نسخ pre-v1). المنطق: لا نعيد «سكربتًا»؛ نفصل كل feature ونقيس وجودها في المنتج الحالي (C1–C14).

## 5.1 elaraby-phone-reveal.js (67KB، 28 دالة)
| Feature | دوالها | في التيار؟ | الحكم |
|---------|--------|------------|-------|
| كشف الطبقات 0/3 | extractFromDOM, extractFromDoc, processLayer3 | Layer0 مشحونة بالمانيفست | KEEP (الحالية) |
| كشف يدوي شامل | forceRevealPhones | كزر مستقل؟ غير مثبت | NEEDS EVIDENCE |
| Autopilot ترقيم صفحات | fetchAllPages, clickNextPage, runAutoPilotStep | غائب عن الشجرة الحية | RECOVER (قيمة تشغيلية عالية) |
| مزامنة Google Sheets | getWebAppUrl, syncRowToGoogle, detectColumns, extractRow, fetchOne, worker | sheets-sync موجود (C7) | مقارنة غنى قبل قرار |
| إشعار صفوف جديدة | checkNewRowsAndNotify, sendNotification, requestNotificationPermission | غائب | DEFER (لمسة راحة) |
| جدول افتراضي | renderVirtualRow, getFilteredRows | غائب | DEFER (أداء عند حجم كبير) |
| **إيقاف حلقات ERP** | **stopERP** | **غير موجود في الشجرة الحية (تحقق بالبحث)** | **RECOVER — أولوية** (درء ضرر) |
| ملاحظات سريعة + UI | loadQuickNotes, saveQuickNotes, injectDesignTokens, tabStyle | جزئي | DEFER |
| لوحة سجلات | renderLogs, updateUI, log | smart-log.js الحالي يغطي | KEEP (الحالي) |

## 5.2 messenger-sender.js (53KB، 21 دالة)
| Feature | دوالها | في التيار؟ | الحكم |
|---------|--------|------------|-------|
| خط CSV كامل | loadData, parseCSV, parseRow, handleFile | messenger v2.2 الحالي | مقارنة غنى (غالبًا KEEP) |
| اكتشاف الإدخال عبر Shadow DOM | findInputBoxInDoc, walkShadow, findInputBox | نعم (جوهر الإرسال) | KEEP |
| **لصق فقط بدون إرسال آلي** | pasteOnly | يتطلب تحقق بالتيار | NEEDS EVIDENCE (قيمة أمان) |
| أوضاع الإرسال | sendMessage, sendService, runSend, runSendOneRandom | نعم | KEEP |
| توزيع نصائح/آlikes | sendAllTips, runSend10Likes + tips.json | غالبًا مقطوع في v2.2 الحالي | DEFER (ميزة تسويقية اختيارية) |
| لوحة UI والحالة | initUI, injectPanel, setStatus, addSent, addErr, el | نعم (msq-fab) | KEEP |

## 5.3 report-processor.js (35 دالة — Reports v5.7)
المعالج الحالي C6 نشط بنفس الجيل المعلن (v5.7). الفروقات المحتملة داخل الدوال الـ35 تحتاج مقارنة function-level قبل أي ادعاء فقدان. **الحكم الجماعي: KEEP (الحالي) + تدقيق فرق لاحق DEFERRED.**

## 5.4 booking-automation.js (v1.0، 26 دالة)
موصولة FAB وتعمل نظريًا (C5) لكن بلا إثبات تشغيل. **NEEDS RUNTIME EVIDENCE (E3) — لا استرجاع شيء منها قبل E3.**

## 5.5 date-filter-unlocker
انظر §6 — متنازع عليه توثيقيًا، مشحون فعليًا.

## 5.6 tampermonkey-runner.js
محرك تنفيذ userscripts داخل الإضافة — بنية تحتية حية (C13). **KEEP.**

## 5.7 tips.json
أصل محتوى (نصائح) لتوزيع الماسنجر — ليس كودًا. **DEFER مع أوضاع tips.**

**خلاصة SI-2:** الوظائف المفيدة القابلة للدمج النظيف في المنتج الحالي: **stopERP** ثم **Autopilot الترقيم** ثم **pasteOnly** (إن ثبت غيابه) — كلها إضافات معزولة لا تمس Core.

---

# 6) SPECIAL INVESTIGATION — DATE FILTER

**الأدلة (كلها مؤرخة اليوم):**
1. `manifest.json` في **src** وفي **deploy**: مدخل content_script لفلتر التاريخ موجود **الآن**.
2. `unified-dock.js`: أداة `ea-date-unlocker-fab` مسجلة بين أدوات الـdock العشر.
3. التوثيق: «DateFilter Unlocker = أداة فعالة».
4. `IDEAS_BACKLOG`: «DateFilter حُذف نهائيًا / بديل آمن مخطط».

**التفسير المتسق الوحيد للأدلة:** قرار «الحذف» وُثّق كنية/خطة ولم يُنفذ على هذه الشجرة (أو نُفذ على جيل userscript مختلف بينما نسخة الإضافة بقيت). لا مجال لحسم نيّة المطورين التاريخية، ومجال حسم **الحالة الفعلية** مفتوح.

```
DATE FILTER STATUS: PARTIAL
- EXISTS & SHIPPED:   CONFIRMED (manifest src + deploy + dock FAB اليوم)
- OPERATIVE AT RUNTIME: UNKNOWN (لم يُختبر أمام البورتال)
- "DELETED":           REFUTED عمليًا على الشجرة الحالية
```

**ما يحسمه:** E2 — نقرة واحدة على FAB داخل جلسة بورتال مراقبة: هل يعدّل سلوك فلتر التاريخ؟ إن نعم → ACTIVE-CONTESTED (قرار معماري: keep أو remove فعلي)؛ إن لا → DEAD-SHIPPED (تنظيف مستقبلي).

---

# 7) SPECIAL INVESTIGATION — DEPLOY VS SRC

**الحقائق المقاسة:**
- 81 ملفًا متطابق **byte-by-byte (SHA-1)** عبر الشجرتين، بما فيه manifest وshared/*.
- **مختلف واحد بالضبط: `content-script.js`.**
- الفرق المعماري = 10 كتل تغيّر، وهي **باتش P0-B نفسه** (بوابة P0-B.1 الصارمة في `selectRandomTechnician` + strictExact في مسارات المودالات). أسماء الدوال الـ88 متطابقة — لا features تاريخية إضافية في deploy.
- إذن: `deploy/content-script.js` = **لقطة سابقة لـP0-B**؛ `deploy/` كله = artifact مجمّد وليس بيئة تطوير.

**الإجابات المباشرة:**
- أي نسخة فيها P0-B؟ **src فقط.**
- أيهما فيه features تاريخية أغنى؟ **لا أحد** — الفرق محصور في P0-B.
- هل يمكن أن يكون deploy هو artifact؟ نعم، وهذا الاحتمال الراجح (mirror زمن النشر الأخير قبل P0-B).
- هل src هو source of truth؟ **نعم بحكم المحتوى (الأحدث منطقيًا وباحتوائه الإصلاحات)**، لكن هذا استنتاج، لا دليل تشغيل.
- خطر «المتصفح يشغل deploy ونحن نصلح src»؟ **قائم وحقيقي** لأن Load-unpacked يلتقي مجلدًا واحدًا ولا يمكن حسمه من الملفات وحدها.

**الدليل الحاسم المطلوب (E1):** `chrome://extensions` → Details للمكوّن المحمّل → مسار المصدر الفعلي + مقارنة SHA-1 لـ`content-script.js` هناك مع النسختين. دقيقة واحدة تحسم كل شيء. **لا يُلمس أي ملف قبل صدور هذا الدليل.**

---

# 8) DEAD / DUPLICATE / SUPERSEDED ANALYSIS

**مقاس بالهاش على الشجرة الحية** (src + deploy + root، مستبعدين _archives/backups/legacy/node_modules):
- ملفات كود ممسوحة: **214** | مجموعات تكرار: **74** | نسخًا زائدة: **80 ⇒ ≈37% من ملفات الكود الحية نسخ مطابقة حرفيًا**.
- أسوأ نمط: `deploy/shared/{arabic-utils,data-mapper,message-bus,portal-selectors,smart-log,storage-proxy}.js` مكرر **×3** (نسخ لكل feature folder) — قنبلة تعديل: تحديث نسخة وترك الباقي يعيد إنتاج الانحراف الذي أنتج أزمة deploy/src.
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

الترتيب بمعادلة VALUE × CONFIDENCE × LOW-RISK (وليس بالحنين):

| رتب | البند | النوع | السبب | الشرط |
|-----|------|------|-------|-------|
| R1 | حسم نسخة التشغيل (E1) | قرار+دليل | بدونها كل إصلاح src قد يكون على شجرة ميتة | نقرة extensions |
| R2 | Technician Strategy v2 (Region map + random صاخب) | سلوكي معتمد | تصميم المعماري جاهز (§0)؛ يرفع جودة البيانات ويوقف الفشل الأعمى | موافقة المعماري على التنفيذ |
| R3 | errorIndicator + busyIndicator | config layer | شبكة أمان الحفظ — أعلى قيمة متانة/مخاطرة صفر تقريبًا | E6 خفيف |
| R4 | saveTimeoutMs + retryIntervalMs | config layer | إرجاع قابلية الضبط بقيم افتراضية = قيم الكود الحالية | لا شيء |
| R5 | stopERP (من phone-reveal) | دالة معزولة | درء ضرر (قتل حلقات ERP الهائمة) — دليل وجود STRONG | قراءة سياق استدعائها الأصلي |
| R6 | _subgridAddPatterns.{technician,problems} | config layer | متانة زر الإضافة في subgrid الفني | E6 |
| R7 | _exclude/_priorityProblemPatterns | config layer | جودة فرز المشاكل | مراجعة قيم القديم |
| R8 | lookupModal{Search,Select,Close}+Clear | config layer | متانة مودالات البحث | E6 |
| R9 | installationKeywords | config layer | كشف «تركيب» يعيد تمييز نوع الفلو | لا شيء |
| R10 | portalFieldIds trio (defectMajor/defectCode/sparePart) | IDs بورتال | ملء مباشر أسرع | **E4 إلزامي أولًا** |
| R11 | sparePartsNoneText | سلسلة كشف | دقة كشف «بدون قطع» | لا شيء |
| R12 | subgridTitle + subgridRow | مراسيات تحقق | تأكيد بصري بعد الإضافة | E6 |
| R13 | طبقة fieldDefinitions كاملة (data-driven) | إعادة تصميم | أفق طويل الأجل لتوحيد التعبئة | بعد استقرار R3–R9 |

**خارج هذا الجدول (userscript features):** Autopilot الترقيم (بعد R5)، pasteOnly (بعد التحقق)، إشعارات Sheets (DEFER).

---

# 10) REJECT / DO NOT RECOVER

1. **الاختيار العشوائي الصامت للفني** — supersede نهائيًا بـTechnician v2؛ العودة له تهديد سلامة البيانات.
2. **مطابقة region بـincludes()** — ممنوعة بقرار معماري صريح (خطر تطابق عام/خاص).
3. **messenger-sender v2.0.0 وكل نسخ `-OLD` والمتداخلة** — وزن ميت؛ المرجع v2.2 الحي.
4. **rollbacks كاملة لنظام الـ80 مفتاحًا** — متحف؛ نتقدم بطبقات config انتقائية (§9).
5. **legacy/ المنشورة (binaries 19.6MB)** — مرجع تاريخي فقط، لا يُشغّل ولا يُدمج.
6. **اعتبار backups مصدر حق تشغيلي** — أرشفة فقط (مؤكد بفرق deploy/src: اللقطات تخدع).
7. **إحياء أوضاع tips/10-likes الآن** — قيمة تسويقية هامشية مقابل سطح تعارض مع v2.2.
8. **أي استرجاع portalFieldIds قبل E4** — IDs عمياء = خطر كتابة في حقول خاطئة بصمت.

---

# 11) RUNTIME EVIDENCE REQUIRED

| ID | السؤال | كيف | يحسم |
|----|--------|-----|------|
| E1 | أي مجلد يشغّله Chrome فعليًا؟ | chrome://extensions → path + هاش content-script.js | §7 كاملًا |
| E2 | هل DateFilter يعمل أمام البورتال؟ | نقرة FAB مراقبة + ملاحظة سلوك الفلتر | §6 → CONFIRMED-ACTIVE أو DEAD-SHIPPED |
| E3 | هل booking-automation يعمل end-to-end؟ | جلسة حجز تجريبية مراقبة | مصير C5 وfeaturesها |
| E4 | هل IDs البورتال القديمة صالحة للـDOM الحديث؟ | عينة عناصر (inspect) للحقول الثلاثة | R10 |
| E5 | ما قائمة أسماء الفنيين الحالية في select البورتال؟ | snapshot لخيارات الـselect | TECH_POOL في Technician v2 |
| E6 | كيف يبدو تدفق subgrid/المودالات اليوم؟ | كابتشر تدفق إضافة فني/مشكلة (قراءة فقط) | R3/R6/R8/R12 |

---

# 12) RECOMMENDED RECOVERY ORDER

- **Phase 0 — الحقيقة (E1+E2+E5):** يوم أدلة لا كود. مخرجه: نسخة التشغيل المؤكدة + حكم DateFilter + pool الفنيين.
- **Phase 1 — Technician v2:** تنفيذ تصميم §0/Q5 كما هو (40–60 سطرًا، ملف واحد) بعد إذن المعماري، فوق النسخة المؤكدة من E1.
- **Phase 2 — طبقات Config الآمنة:** R3←R4←R9←R11 (قراءة defensive من selectors.json، افتراضيات = قيم الكود الحالية؛ صفر تغيير سلوك افتراضي).
- **Phase 3 — المتانة المشروطة بالأدلة:** R6←R7←R8←R12 بعد E6، ثم R10 بعد E4 خلف flag.
- **Phase 4 — ثمار الـUserscripts:** stopERP أولًا (R5)، ثم Autopilot الترقيم، ثم pasteOnly إن ثبت غيابه.
- **مستمر (سياسة لا كود):** قرار احتواء نسبة الـ37% تكرارًا (خاصة deploy/shared ×3) — يُرفع للمعماري كقرار منفصل.

---

# 13) ARCHITECTURAL RISKS

1. **انحراف الشجرتين مجددًا** (السبب الجذري لهذه المرحلة كلها): ما دام deploy موجودًا بجانب src بلا بوابة نشر، سيتكرر الانحراف. E1 يعالج الحاضر؛ السياسة تعالج المستقبل.
2. **نمط «التصلّب» الصامت:** مفاتيح config تهاجر إلى الكود وتموت بالاسم دون قرار موثق (حدث لـ~15 مفتاحًا). أي Layer جديدة (R3/R4) تحتاج قاعدة: «لا يُنقل مفتاح لكود إلا بسجل migration».
3. **غموض ok:true:** نجاح تشغيلي ≠ ثقة مصدر. بدونه يتحول random-fallback إلى نجاح كاذب في التقارير. العلاج موصوف في §0/Q6-أ (source+confidence في اللوج والتقرير).
4. **تطبيع العربية في region:** اختلاف المسافات/الهمزات؛ القرار الحالي collapse-whitespace + exact فقط — آمن ضد التطابق الخاطئ، وقد يرفع معدل fallback لو جاءت الكتابات مشوهة؛ مراقبة نسب source=random-fallback أسبوعيًا تكشف جودة بيانات الماسنجر.
5. **manifest ينقل ميزة متنازع عليها (DateFilter):** يهدم ثقة «التوثيق = الواقع». الحسم عبر E2 ثم مواءمة Docs↔Manifest في اتجاه واحد.
6. **نسخ shared ×3:** أي hotfix مستقبلي على shared دون مزامنة الثلاث نسخ يعيد إنتاج انحراف من نوع deploy/src داخل src نفسها.

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
| stopERP | pre-v1 userscript | لا | لا | نعم (دالة) | لا | منخفض | PhoneReveal | STRONG EVIDENCE | **RECOVER (R5)** |
| Autopilot ترقيم | pre-v1 userscript | لا | لا | نعم | لا | منخفض | PhoneReveal | STRONG | RECOVER (بعد R5) |
| pasteOnly | pre-v1 userscript | غير مؤكد | ؟ | ؟ | لا | لا | Messenger | UNKNOWN | NEEDS RUNTIME EVIDENCE |
| أوضاع tips/10likes | pre-v1 userscript | لا | جزئي | نعم | لا | متوسط | Messenger | STRONG | DEFER |
| Messenger v2.2 (C8) | حالي | نعم | — | — | — | — | Messenger | CONFIRMED | KEEP |
| Control panel/AI/dock (C9,C10,C11) | حالي | نعم | — | — | — | — | UI/FAB | CONFIRMED | KEEP |
| DateFilter (C12) | حالي مشحون | نعم (manifest) | — | — | — | محتمل | UI/Portal | CONFIRMED-shipped / UNKNOWN-runtime | NEEDS RUNTIME EVIDENCE (E2) |
| Runner (C13) + Dashboard/N8N (C14) | حالي | نعم | — | — | — | — | Infra | CONFIRMED | KEEP |
| Technician v2 (region+random صاخب) | جديد | لا | تصميمه جاهز | نعم (§0/Q5) | جزئي (الخريطة) | لا (مكمل لـP0-B) | Booking | CONFIRMED-design | **REIMPLEMENT (R2)** |
| error/busyIndicators | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | **RECOVER (R3)** |
| saveTimeoutMs/retryIntervalMs | pre-v1 | لا (مُصلَّبة) | قيم بالكود | لا | نعم | لا | AutoFill | STRONG | RECOVER (R4) |
| _subgridAddPatterns ×2 | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R6, بعد E6) |
| exclude/priorityPatterns | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R7) |
| lookupModal btns + Clear | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R8, بعد E6) |
| installationKeywords | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | RECOVER (R9) |
| portalFieldIds ×3 | pre-v1 | لا | لا | لا | نعم | **نعم إن عُميت** | AutoFill | STRONG(قديم) | NEEDS EVIDENCE (E4) ثم R10 |
| sparePartsNoneText | pre-v1 | لا | لا | لا | نعم | لا | AutoFill | STRONG | RECOVER (R11) |
| subgridTitle/Row | pre-v1 | لا | لا | لا | نعم | لا | Booking | STRONG | RECOVER (R12, بعد E6) |
| طبقة fieldDefinitions كاملة | pre-v1 | لا (وظيفيًا بالكود) | نعم | إعادة تصميم | جزئي | متوسط | AutoFill | CONFIRMED | DEFER (R13 طويل الأجل) |
| fieldLabels/labels ~17 مفتاحًا | pre-v1 | لا بالاسم | نعم (منطق الكود) | لا | لا داعي | لا | AutoFill | CONFIRMED | REJECT-as-config (SUPERSEDED) |
| _mergeNote | pre-v1 | لا | — | — | — | — | meta | CONFIRMED | REJECT (NOT-CODE) |
| random صامت / includes() matching | قديم | لا (أُزيلت) | v2 | — | — | **نعم** | Booking | CONFIRMED | **REJECT** |
| messenger v2.0.0 / -OLD / nested dupes | inline-old | نعم كنسخ | v2.2 | — | — | — | — | CONFIRMED | REJECT (وزن ميت) |
| deploy/content-script.js (قبل P0-B) | لقطة | نعم | src | — | — | **نعم لو شُغّلت** | — | CONFIRMED | REJECT-as-source (artifact) |
| deploy/shared ×3 duplicates | حالي | نعم | الأصل | — | — | خطر صيانة | — | CONFIRMED | REJECT (سياسة dedupe للمعماري) |

---

# FINAL STATUS

| السؤال | الجواب |
|--------|--------|
| كم Feature موجودة حاليًا؟ | **14** (C1–C14، منها 1 مشحونة متنازع عليها C12 و1 بلا إثبات تشغيل C5) |
| كم Feature تاريخية (أجيال)؟ | **6 مجموعات أجيال** (G-external-1/2، pre-v1، backups، legacy-dir، inline-old) تفصّلت إلى ~110 دالة userscripts + 48 مفتاح config |
| كم Feature مفقودة؟ | **48 مفتاح config** (27 لها أثر اسمي، 21 بلا أثر، 0 بقيمة حرفية) + ~4 عناقيد userscript مفقودة (stopERP، autopilot، pasteOnly؟، tips-modes) |
| كم تستحق Recovery؟ | **13 بندًا مرتبًا (R1–R13)**؛ التنفيذ الواقعي القريب = R1–R5 |
| كم تحتاج Runtime Evidence؟ | **6 حزم أدلة (E1–E6)** — منها E1 حارس بوابة لكل ما بعده |
| أول 5 استرجاعات؟ | **R1** حسم نسخة التشغيل ← **R2** Technician v2 ← **R3** indicators ← **R4** timing-config ← **R5** stopERP |
| ما يجب ألا يُعاد؟ | العشوائية الصامتة، includes() للمطابقة، نسخ -OLD/v2.0.0، rollback الـ80 مفتاحًا، legacy binaries، اعتبار backups/deploy مصدر حق، tips-modes الآن، portalIds عمياء |
| تناقضات تقرير Archaeology نفسه؟ | **3 + ملاحظة تسمية:** (1) «deploy≈mirror» قلّلت من تقدير خطورة اختلاف ملف واحد هو الأخطر — صُححت هنا (§7). (2) «DateFilter حُذف» في BACKLOG مقابل شحنه بالمانيفست — الحالة الفعلية PARTIAL (§6). (3) «11 مفتاحًا لها مكافئ» هي مكافئة **وظيفية بالكود** بينما مصفوفة القيم الحرفية 0/48 — يلزم توحيد ثلاثية المعايير (قيمة/اسم/وظيفة) في أي تعداد قادم. (4) تسمية `selectRandomTechnician` أصبحت مضللة بعد P0-B (العشوائية مُزالة) — دين تسمية عند أول تعديل مشروع لها. |

---
*أُنتج هذا التقرير بلا أي تعديل على ملفات المنتج. الأدلة الخام: `out_missing_selectors_matrix.json`, `rdm_48_ranking.json`, `out_userscript_inventory.json`, `archaeology_census.json` داخل `_forensic_audit/`.*
