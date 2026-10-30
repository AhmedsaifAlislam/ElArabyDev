# ARCHITECTURE FORENSIC REPORT — ElArabyDev Product Archaeology
**التاريخ:** 2026-08-24 · **النمط:** جرد/اكتشاف فقط (قراءة) · بلا أي تعديل أو Deploy أو Save/Submit/Finalize
**النطاق:** ElArabyDev كاملًا + `العربي سيستم` + `مساعد التقفيلات` + `مساعد التقفيلات V2` + `backups/` (بإذن صريح)
**مستويات الدليل:** `[CODE]`=قراءة كود مباشرة · `[DOC]`=وثيقة · `[GIT]`=تاريخ git · `[FS]`=ملاحظة نظام ملفات · `[RUNTIME]`=لوج/كابتشر · `[UNKNOWN — Evidence required]`

---

## 1) Executive Summary
- المشروع ليس إضافة واحدة بل **عائلة منتجات**: Unified Extension v1.2.0 «العربي ديف» + محرك Tampermonkey مدمج + أدوات دوك عائمة + لوحات (مالية/مخزون/CRM/AI/N8N/Telemetry) — مع 4 أجيال سابقة محفوظة داخليًا و3 مشاريع شقيقة خارجية. `[CODE][FS][GIT]`
- حجم المشروع الظاهري (7,697 ملف/455MB) مضخّم بـ`node_modules` داخل `src/dashboard` (8,113) و`tools/arena-ai-mcp` (3,950) و`backups/` ‏(354MB، 94 جيلًا يوميًا 07→23 أغسطس). `[FS]`
- **اكتشاف جوهري:** `deploy/` مطابق لـ`src/unified-extension/` في 81/82 ملفًا بالهاش؛ الاستثناء الوحيد `content-script.js` — نسخة الـdeploy **لا تتضمن باتش P0-B الأخير** (144,933 مقابل 146,844). إن كانت النسخة المحمَّلة في Chrome هي `deploy/` فالإصلاح المعتمد غير موجود فيها بعد. `[CODE][FS]`
- **"FABS" كنظام غير موجود** في أي مكان (داخلي/خارجي). كل الظهورات هي `fab` = Floating Action Button (نمط أزرار عائمة: `#msq-fab` وسجل أدوات الدوك). يُغلق البند كسؤال مصطلحي لا كميزة مفقودة. `[CODE]`
- تراجع selectors.json من 80 مفتاحًا (جيل pre-v1-rollback) إلى 33؛ 48 مفتاحًا اختفت من الكونفيغ ومعظمها **غير موجود إطلاقًا في كود الجيل الحالي** (fieldDefinitions, installationKeywords, sparePartsNoneText, busyIndicator, errorIndicator…) بينما مفاهيم مثل lookup/save/subgrid ما زالت حاضرة بأسماء في الكود → مزيج LOST-CANDIDATE + إعادة تنفيذ داخلي. تفصيل §9. `[CODE]`
- تناقض موثق حول DateFilter Unlocker: أداة فعالة في الدوك `[CODE]` مقابل «المحذوف — بديل آمن مخطط فقط» في IDEAS_BACKLOG ‏(16-08) `[DOC]`. يُعرض كما هو دون حسم.
- أقوى مرشح استرجاع (RECOVER): بنية `fieldDefinitions/fieldLabels` القديمة (تعريف حقول مركزي قابل للتكوين) التي استُبدلت بقيم صلبة موزعة في الكود.

## 2) Project Architecture Map (System)
```
ElAraby System (E:\My First Lap\MY WORKE\Apps\)
├── ElArabyDev/  ← الجيل الموحد الحالي (Git, 33 commits)
│   ├── src/unified-extension/  ★ النسخة المرجعية v1.2.0 (82 ملفًا)
│   │   ├── content-script.js (146,844B, 90 دالة) · background.js (رفيع ~9KB)
│   │   ├── popup.html/js (265 id!) · control-panel.js (73KB) · unified-dock.js (10 أدوات)
│   │   ├── ai-core-v2.js · smart-log.js(shared) · portal-selectors.js(shared)
│   │   ├── Tempermonky/{messenger-sender,report-processor,services,tips}
│   │   └── {selectors,products-db,secondVisitProfiles,travel-costs}.json
│   ├── deploy/  ← مرآة src (80/82 هاش متطابق) — استثناء: content-script قديم (قبل P0-B)
│   ├── backups/ 94 جيل يومي 07→23-08 + backup-pre-unified-v4 (354MB)
│   ├── _archives/pre-v1-rollback_20260817_161034/ (لقطة ما قبل التراجع v1: bg 63KB, popup 165KB, cp 110KB, selectors 80 مفتاحًا)
│   ├── legacy/  ← متحف: مساعد التقفيلات (نشر قديم) كامل + المساعد الذكي + البحث عن بلاغ + Rescheduling + حجز البلاغات + portal-other-section + أكواد (لقطات HTML صفحات البوابة) + جلسة وكيل مؤرشفة
│   ├── tools/, scripts/, src/{dashboard(Vite), crm-content(esbuild), shared, ui-components, templates, design-system, docs, portal-config}
│   ├── docs/{AI_N8N_FOUNDATION, SMART_ASSISTANT_ARCHITECTURE, SMART_LOG_ARCHITECTURE}
│   └── جذر: وثائق رئيسية + session-captures-2026-08-24.json + تحليل_اللوج.xlsx + smart-log.js مكرر (19.8KB جذر مقابل 5KB shared) + content-script.js جذر (إصلاح P0-A) + .codegraph/codegraph.db (39MB)
├── العربي سيستم/  ← مساحة عمل جامعة (تضم نسخة متداخلة من «مساعد التقفيلات» + session-capture لقطات PAGE2/PAGE3 base64)
├── مساعد التقفيلات/    (V1 خارجي: cs=117,125B, popup=79,057B)
└── مساعد التقفيلات V2/ (V2 خارجي: cs=96,622B, popup=52,162B — أصغر وأحدث تصميمًا؟ التاريخ غير موثق)
```
خمس نسب مختلفة فعليًا لـcontent-script عبر الأجيال (هاشات): unified-current `624eac63` / deploy `fdf4fe3e` / pre-rollback `7b16e5e7` (=نسخة backup 161124) / legacy-pub `4360d2c9` / V1 `6e87427e` / V2 `a043aa4d`. `[CODE][FS]`

## 3) Current Feature Inventory (src/unified-extension v1.2.0)
| # | الميزة | الدليل | الحالة |
|---|---|---|---|
| 1 | Batch تقفيل بلاغات (queue→router→صفحات 1/2/3→finalize) | [CODE] 90 دالة cs | implemented/runtime-confirmed جزئيًا (RUNs) |
| 2 | Page1 fill: Brand/Model/Serial/Status/Date/Notes عبر lookup modals + verifiers | [CODE] fillLookupModal, fillAndVerify, createSnapshotVerifier | implemented |
| 3 | Page2 FollowUp: فني (selectRandomTechnician strictExact بعد P0-B) + مشاكل فعلية (problemCodes + AI) | [CODE]+[GIT] P0-B | implemented (غير منشور في deploy) |
| 4 | Page3 Resolution: أكواد أعطال + قطع غيار + مبالغ (readSparePartsTotalFromField/readCollectedAmount/formatMoney) | [CODE] | implemented |
| 5 | Installation & Commissioning workflow | [CODE] performInstallationAndCommissioning | implemented (runtime غير مؤكد) |
| 6 | Second Visit profiles (زيارة تانية) | [CODE]+[DOC] roadmap 19-08 ✅ | implemented (6/7 ثم أُكملت؟) |
| 7 | مصاححة (chk-masaha) + شحن (chk-shahn) + force-drain-cleaning/force-overwrite | [CODE] popup ids | implemented — سلوكها التفصيلي [UNKNOWN] |
| 8 | Dashboard: مخزون (inv*) + بحث + مزامنة | [CODE] popup ids | implemented (UI-confirmed) — استخدام واقعي [UNKNOWN] |
| 9 | Financial Analytics panel (bank-transfers/alerts/monthly/damaged/accno/pass) | [CODE] f-* ids | implemented UI — مصدر البيانات يحتاج تأكيدًا |
| 10 | Parts Search بمصادر ثلاثة: Portal/Local(DB)/CRM | [CODE] parts-search-* | implemented |
| 11 | Excel Autofix tab (process/rescan/download) | [CODE]+[DOC] Phase 3.4 | implemented (Python side خارج النطاق؟) |
| 12 | AI Core v2 (OpenCode Zen proxy, native tool calling, cache LRU, history, rate-limit) + Smart Problem Codes + زر أفكار تطوير + تحليل لوج ذكي | [CODE]+[DOC] | implemented |
| 13 | Telemetry (timeline/error-analysis/stats/export/copy/clear) + Session viewer (export/import sessions) + Session Capture (initSessionCapture…→ session-captures json) | [CODE][RUNTIME] | implemented |
| 14 | Smart Log (sysLog/sendSmartLog→storage→panels) + تصدير Excel للتحليل | [CODE][RUNTIME] | implemented |
| 15 | N8N integration UI (webhook/token/test/auto-export/send-logs/send-telemetry) | [CODE] | UI-implemented — التوصيل الفعلي «لم يبدأ» [DOC] |
| 16 | Sync: Local mode + Drive mode + cloud backup/restore | [CODE] | implemented UI — ملاحظة: تفضيل المستخدم الموثق «محلي فقط» |
| 17 | Unified Dock (10 أدوات) + Control Panel mini (التالي/إرساء/تصغير/مرفقات) | [CODE] | implemented |
| 18 | Tampermonkey runner مدمج (رفع/تشغيل/تعطيل userscripts؛ قائمتان builtin/custom) | [CODE] tm-* ids + tampermonkey-runner.js | implemented |
| 19 | Phone Reveal layer0 + Booking Automation + Date Unlocker + Reports Processor + Messenger + AI + Voice + Suppressor (أدوات الدوك) | [CODE] TOOLS registry | implemented (تفعيل كل أداة وقتها [UNKNOWN]) |
| 20 | Settings: editors لمباشر selectors وsv-profiles + ثيم + shortcuts | [CODE] | implemented |

## 4) Legacy Feature Inventory (legacy/ + أرشيف pre-v1)
- **مساعد التقفيلات (نشر قديم)** — الجد المباشر للجيل الحالي: cs 122,503 + popup 128,264 + control-panel 108,994 + order-extractor 56,395 + products-db/products.ts + travel-costs + secondVisitProfiles + smart-log 19.8KB + tampermonkey-runner. جلسة وكيل مؤرشفة (a859e936…) فيها implementation plans (queue_fix/telemetry) وtranscripts 2.6MB. `[FS]`
- **المساعد الذكي (Smart Parts Assistant)** — جد وحدة قطع الغيار: shadow-panel 42KB + scanner/auto-filler + db.js 24KB + excel-exporter + n8n-client + frame-walker + dashboard 37KB. `[FS]`
- **البحث عن بلاغ** — جد وحدة البحث/الاستخراج: content.js 39KB + xlsx.full.min.js. `[FS]`
- **Rescheduling (Smart Scheduler)** — smart-scheduler.js userscript v1.1 (10.5KB) + توثيق TOOL_PROFILE. `[FS]`
- **حجز البلاغات المستقبلة** — DateFilter Unlocker + Booking Automation. `[FS]`
- **portal-other-section** — تجارب SAP/inasc/inprogress/accountMovement + local-analyzer extension مستقل (popup 18KB). `[FS]`
- **أكواد/** — لقطات HTML لكل صفحات البوابة، ومنها نسخة صفحة 2 موسومة «تكييف مع اضافة المشكلات وفني عشوائي» — دليل تاريخي على نشأة منطق الفني العشوائي. `[FS]`
- **pre-v1-rollback** — الجيل قبل إعادة البناء: background 63KB (مقابل 9KB)، popup 165KB، control-panel 110KB، selectors 80 مفتاحًا، مجلدات ai/core/content/features/financial-tab/excel-autofix-tab/n8n-tab/ai-panel-tab/dock-fab-hider. `[FS]`

## 5) Tampermonkey Inventory — 7 سكربتات فريدة (+محرك مدمج)
| السكربت | الإصدار | match | أين اليوم |
|---|---|---|---|
| Booking Automation (أتمتة حجز البلاغات) | 1.0 | portal/* | backups فقط + أداة دوك «الحجز والجدولة الحرة» [CODE] |
| Smart Scheduler | 1.1 | portal/* | legacy/Rescheduling فقط |
| كشف أرقام الهواتف v15 | 15.0 | portal/* | Tempermonky حالي (3 نسخ: جذر/فرعي/layer0) + أداة دوك |
| معالج البلاغات (Reports) | 5.7 | portal/* | Tempermonky حالي + أداة دوك rp-fab |
| مساعد إرسال الماسنجر | 2.2.0 (+OLD 2.0.0) | facebook.com | Tempermonky حالي + أداة دوك msq-fab |
| Date Filter Unlocker | 1.0 | portal/* | Tempermonky/DateFilter + أداة دوك — **تناقض §1** |
| (محرك) tampermonkey-runner | — | — | مدمج بالإضافة: قوائم builtin/custom + RUN_SCRIPT_NOW عبر background |
ملاحظة: messenger-sender يظهر بحجمين تاريخيين (53,226/56,517/53,432) وتحديث v2.0.0→v2.2.0. tips.json/services.json بياناته المساعدة. `[CODE][FS]`

## 6) FABS Inventory
**النتيجة: لا وجود لنظام باسم FABS.** فحص حساس لحالة الأحرف: unified-dock (106 ظهور `fab`، صفر `FABS`)، messenger-sender (17 `fab`)، والمشاريع الخارجية كلها `fabDragging/#msq-fab` إلخ. الاسم ورد في الطلب الأصلي كمسمى محتمل — التصنيف الصحيح: **نمط Floating Action Buttons** داخل الدوك والأدوات، وليس وحدة قائمة بذاتها. (ظهوران نصيان وحيدان في base64 لقطات شاشة = ضوضاء.) `[CODE]`

## 7) Backup Inventory
- `backups/deploy_backup_*`: **94 جيلًا** من 07-08 إلى 23-08 (يوميًا، آلي على الأرجح [GIT] رسائل auto-backup). كل جيل يشمل Tempermonky كاملة → 7×94 ≈ 658 نسخة userscript (فريدة فعليًا: 7).
- `backups/backup-pre-unified-v4/`: ليلة التوحيد (manifest 3,878B، popup 91KB) — الجيل «Portal AutoFiller v4» قبل الدمج.
- `_archives/pre-v1-rollback_20260817_161034/` + `backups/deploy_backup_20260817_161124/`: نفس هاش cs `7b16e5e7` — لقطتان متناسقتان لحظة التراجع v1.
- الحجم الكلي 354MB سببه تكرار libs (xlsx 951KB ×94…) — خطر صيانة لا أكثر.

## 8) Hidden Features (موجودة في الكود ولا تذكرها الوثائق الرئيسية)
1. **Portal Error Suppressor** (`ea-suppressor-tool`) — كتم أخطاء البورتال. `[CODE]`
2. **Voice Control fab** (`elaraby-ai-voice-fab`). `[CODE]`
3. **dock-fab-hider.js** في pre-v1 (إخفاء أزرار الدوك — هل نجوّا للجيل الحالي؟ INVESTIGATE). `[FS]`
4. **Session Capture hook** يسجل كل click/select/input تلقائيًا في JSON (أساس ملف session-captures-2026-08-24.json الذي حللناه سابقًا). `[CODE][RUNTIME]`
5. **QUICK_PASTE_BATCH / OPEN_TECH_REVIEW** رسائل background — مسارات تشغيل سريعة غير موثقة. `[CODE]`
6. **Selector live editor** + **sv-profiles editor** داخل Settings. `[CODE]`
7. **Cloud Drive backup/restore** رغم تفضيل «محلي فقط». `[CODE]`
8. **excel-autofix** بجانب Python خارجي (حدود المساعدة غير موثقة). `[CODE][DOC]`
9. **crm-content** esbuild package مستقل (BatchController/FileUploader/xlsx-worker) — دورة بناء ثانية داخل نفس الريبو. `[FS]`
10. **`.planning/PHASE1_AC_SERIAL_MODEL2_FIX.md`** — خطة إصلاح AC/Serial/Model2 موثقة (مرتبطة بعقلانية modelInput2/serial2 الحالية). `[DOC]`

## 9) Lost Features (من selectors.json القديم 80→33)
**مجموعة A — اختفت من الكونفيغ والكود معًا (LOST-CANDIDATE حقيقي):**
`fieldDefinitions.{brand,model,productType,quantity,sparePart,defect}` · `fieldLabels.*` (7) · `installationKeywords` · `sparePartsNoneText` · `busyIndicator` · `errorIndicator` · `complaintCode/complaintCodeLabels/complaintText` · `deviceType/serviceType/workOrderType` · `phone/address/notesLabels/serviceLabels` · `retryIntervalMs/saveTimeoutMs` · `_priorityProblemPatterns/_excludeProblemPatterns/_subgridAddPatterns` · `lookupClearBtn/lookupModal{Close,Search,Select}Btn/lookupNameInput`.
→ وظائفها إما أُعيد تنفيذها صلبًا في الكود (مثال: تعريف الحقول انتقل إلى getHardcodedDefaults/parseDataLine) أو سقطت. **الأبرز للاسترجاع:** نظام التعريف المركزي fieldDefinitions/fieldLabels (قابلية تكوين دون لمس كود).
**مجموعة B — اسم الكونفيغ اختفى لكن المفهوم حي بأسماء كود:** lookupBtn (25 ظهورًا) saveBtn (8) subgrid (20) complaintCode (16) technicianSelect (0 بالمفتاح لكن المنطق حي عبر handleSubgridIframeModal/selectRandomTechnician).
**مجموعة C — مفقودة موثقة من DOC:** «DateFilter المحذوف» + بديل آمن مخطط فقط (IDEAS_BACKLOG 16-08) — مع تناقض الدوك الحالي §1.

## 10) Planned / Unimplemented (من MASTER_ROADMAP + IDEAS_BACKLOG)
- ❌ 23+ مهمة غير منجزة مجمعة (roadmap): منها إعادة هيكلة البحث الذكي، مهام المساعد الذكي الفرعية، تحسينات البحث عن بلاغ.
- ❌ N8N: استئناف التوصيل «لم يبدأ» رغم اكتمال UI (§3#15). Webhooks/مزامنة/جدولة/Dashboard موحد — كلها planned.
- ❌ بدائل DateFilter الآمنة (تصميم مقترح فقط).
- ❌ ذكاء توسعات: محادثة طبيعية، تعلم ذاتي من الجلسات، اقتراح تعليقات وهمية حسب المنتج، ربط opencode باللوج.
- ❌ Batch: retry 3×، استئناف بعد reload، قفل تبويب واحد، تسريع الانتقالات، تقارير Excel لكل جلسة.
- ❌ المساعد الذكي: XML، إحصائيات متقدمة، PDF جرد، Drive polling، offline كامل، EN i18n، نسخ احتياطي IndexedDB، رفع متعدد.
- ❌ فكرة «اللامركزية» JSON-Driven Automation (متصفح آلي يقرأ خطوات من JSON) — الجدّة المفاهيمية لـworkflows الحالي جزئيًا.
- ❌ elaraby-phone-reveal «لا توجد نتائج» على البورتال — يحتاج تحقيقًا [DOC].

## 11) Every Button / Control (عدّ آلي بالمعرفات — الكتالوج الكامل في popup.html)
- **popup.html: 265 معرّفًا تفاعليًا** موزعة: main-tabs‏ 13 (search/session/dashboard/parts-search/logs/smart-log/telemetry/settings/extract/financial/tools/ai/tampermonkey…) + sub-tabs‏ 22 + أزرار btn-*‏ ~40 (بحث مفرد/دفعة/إيقاف، استخراج، N8N×5، Sync×4+cloud×2، Excel-autofix×3، AI، تصديرات…).
- **unified-dock: 10 أدوات** (§3#17-19) بخصائص openByClick.
- **control-panel mini: التالي/إرساء/تصغير/مرفقات + عرض الجهاز** — لوحة الاستعراض الفني السريعة. `[CODE]`
- داخل content-script: dispatchClickSequence/findSafeLookupButton/upButton… (تفاعلات برمجية لا أزرار UI).
العدد الإجمالي لعناصر التحكم المكتشفة: **~280 عنصرًا مسمى** (UI-confirmed) — الجرد الحرفي محفوظ في هذا القسم من مصادر ids أعلاه.

## 12) Data Flow (إعادة بناء من الكود — الجيل الحالي)
1. **دخول المهمة:** Popup ‏(لصق أسطر/orders) → `buildTasksFromLines` (taskId = timestamp+rand) → queue في storage → background (رفيع: tabs/storage/onMessage واحد) → content-script.
2. **Router:** `processQueueOnLoad` → `startNextTask` → `runSingleLineWithRouter` → `findOrderAndOpen` (page1_search workflow: بحث→صف→View) → `getPageType` (REVIEW/ORDERS/OTHER) + `getActivePageFeature` (PAGE_3 بأكواد الأعطال، PAGE_2 بزرّي إضافة فني/مشاكل، وإلا PAGE_1).
3. **Page1:** parseDataLine → fill_lookup (Brand/Model عبر lookup modal: findSafeLookupButton→dispatchClickSequence→fillLookupModal→verifiers→waitForModalStable) → fill مباشر (Serial/Date/Notes/Status) → `isPage1AlreadyFilled` guard → next (`clickNextAndWaitForSave`→`waitForSaveComplete`+successIndicator).
4. **Page2:** handleSubgridIframeModal → iframe → فني: selectRandomTechnician ‏(exact-only + strictExact، null→فشل صريح — P0-B) ؛ مشاكل: getProblemCode (regex أنماط) → getSmartProblemCode (AI عند الغموض؛ عشوائية مضبوطة ضمن codes).
5. **Page3:** addFaultCodePage3 + قطع الغيار (handleSparePartsComment/waitForSparePartsGrid/readSparePartsTotalFromField) + مبلغ محصل (readCollectedAmount/formatMoney) + LSC flag.
6. **Installation path:** isInstallationReport → performInstallationAndCommissioning (مسار موازٍ).
7. **إنهاء:** finalizeOrderInSession → finalizeSession → notifyStatus/overlay → smart-log.
8. **Observability loop:** sysLog/sendSmartLog → chrome.storage → popup (logs/telemetry/session panels) → تصدير/‏N8N. Session Capture يسجل بالتوازي (clicks/inputs/selects + snapshots) → session-captures JSON.
9. **أدوات الدوك:** unified-dock ينشئ fabs ويطلع userscripts/tab modules حسب TOOLS registry (بعضها عبر tampermonkey-runner).

## 13) Random / Fallback Audit (الجيل الحالي)
Math.random ×6 فقط، كلها محصورة: (1)(2) اختيار عشوائي عند فشل exact **مشروط بفلاغ** pickRandomIfTargetMissing (items/options) — سلوك fallback متحكم به وليس صامتًا؛ (3) problemCodes: لو تعددت الأكواد المطابقة → عشوائي بينها؛ (4) تكييف: `['*AC02','*AC03']` عشوائي؛ (5) غسالات `['*GR01','*GR02','*GR03']`؛ (6) توليد taskId (غير وظيفي).
⚠️ ملاحظة P0-B: fallback الفني Page1 حُذف؛ العشوائيات (4)(5) **ما زالت حية بالتصميم** (قيم كود عطل بديلة) — تسجيلًا لا إصلاحًا.
Fallback آخر: opts[0] عند غياب الفلاغ (أول خيار افتراضي) — نقطة انتباه مستقبلية.

## 14) Verification Audit
طبقات تحقق موجودة: createLookupVerifier/createInputVerifier (حقول)، verifyBySnapshot/createSnapshotVerifier (لقطات DOM قبل/بعد)، waitForModalStable/closeIfOpen/Iframe، fillAndVerify (إعادة محاولة ثم فشل صريح {ok:false})، waitForSaveComplete + successIndicator، hasExistingSubgridRow (منع تكرار). الخلاصة: نمط verify-after-fill منتظم في مسارات lookup والصفحات، مع نقطة عمياء موثقة سابقًا: انقلاب الضمان بعد التحقق (postback/re-render) — خارج نطاق الجرد.

## 15) Timing / Retry Audit
setTimeout صريح ×14؛ histrogram القيم: 300/500/1500/7000/8000/15000/30000ms؛ sleep/waitFor استدعاءات ×94 (polling loops). Tuning مركزي في selectors.json: `_batchDelay, _nextWaitTimeout, _lookupTimeout, _ordersSearchWait, _retryCount`. لا alarms في background (لا مهام دورية). retry عام: _retryCount + إعادة fillAndVerify؛ «retry 3× للصفحات» الموعود غير منفذ [DOC §10].

## 16) Logging / Observability Audit
console. واحد فقط في cs (الكل عبر sysLog/sendSmartLog → smart-log shared). لوحات: log-list بإحصائيات (orders/sessions/success/failed/manual/auto/events)، smart-log analysis (field-changes/network-errors/manual-list)، telemetry (timeline/error-analysis/duration/sessions)، تصدير JSON/Excel، N8N send-logs/telemetry. ملفات جذر داعمة: session-captures-2026-08-24.json (22 session/972 snapshot/397 click) + تحليل_اللوج.xlsx (336 خطأ "Error completing request."). **تنبيه:** smart-log.js مزدوج (جذر 19.8KB مقابل shared 5KB) — أيهما يعمل فعليًا [UNKNOWN — Evidence required] (manifest web_access/imports غير مفحوص سطرًا بسطر هنا).

## 17) Test Coverage
- اختبار آلي واحد: `_forensic_audit/p0b_validation.js` (هارنس 15/15 PASS على دوال مستخرجة حرفيًا ضد DOM مصطنع) — أداة تدقيق وليست جزءًا من المنتج.
- لا إطار اختبارات (jest/vitest/playwright) في أي جيل. templates/ تحتوي هياكل extension فارغة (boilerplate تعليمي).
- تغطية فعلية = جلسات RUN حية + session captures (يدوية).

## 18) Current vs Reality
- النسخة المرجعية (src) تتقدم على المنشور (deploy) بخطوة واحدة (باتش P0-B غير منسوخ) → **ما يعمل في المتصفح الآن قد لا يطابق ما دُقق.** أيهما محمَّل فعليًا [UNKNOWN — Evidence required].
- الوثائق (MASTER_README 14-08) أقدم من الكود (auto-backups حتى 23-08 وباتشات 24-08) → الواقع = الكود + اللوجات.
- popup يَعِد بوظائف (Drive sync، N8N delivery) وضعها التشغيلي الفعلي غير مؤكد — UI≠runtime (قاعدة معتمدة).
- تناقض DateFilter (§1/§9-C) معروض دون حسم.

## 19) Master Feature Matrix (مختصر التحويلات بين الأجيال)
| الميزة | المساعد الذكي | البحث عن بلاغ | legacy-pub (V0.5) | pre-v1 | V1/V2 خارجي | unified الحالي |
|---|---|---|---|---|---|---|
| تقفيل صفحات 1/2/3 | — | — | ✔ (cs122K) | ✔ (cs148K,80sel) | V1✔/V2✔ (مختلفان) | ✔ (cs147K,33sel) |
| قطع غيار/مخزون | ✔ (جد الوحدة) | — | popup parts | ✔ | ? | ✔ (3 مصادر) |
| مالية | — | — | — | ✔ financial-tab | ? | ✔ panel |
| AI | ai-client | — | — | ✔ ai-panel-tab | ? | ✔ core v2 |
| N8N | n8n-client | — | — | ✔ n8n-tab | ? | ✔ UI (توصيل ❌) |
| Booking/DateFilter | — | — | TM فقط | TM | TM | TM+دوك |
| Messenger/Reports/PhoneReveal | — | — | TM | TM | TM | TM+دوك |
| Session capture/Telemetry | — | — | جزئي (لوجات وكيل) | ✔ | ? | ✔ كامل |
| fieldDefinitions مركزي | — | — | ✔ (كونفيغ) | ✔ | ? | ❌ (صلب) RECOVER |
(؟) = يتطلب فحص محتوى أعمق للمجلدين الخارجيين — متاح عند الطلب.

## 20) Architectural Risks
1. **انحراف deploy↔src** (باتش غير منسوخ) — خطر تشغيلي فوري.
2. **ازدواجية smart-log** + ازدواج arabic-utils/data-mapper/message-bus/portal-selectors بين shared وlegacy وtemplates (نسخ متفرقة بنفس الأسماء) — مصدر انجراف silent drift.
3. **selectors -48 مفتاحًا**: فقدان قابلية التكوين المركزية؛ كل تغيير بورتال يستهدف الكود مباشرة.
4. **backups 354MB داخل الريبو** (وليست git-lfs) — بطء clone/بحث؛ node_modules داخل الشجرة (8K+3.9K ملف).
5. **background رفيع (9KB)** مع onMessage واحد: كل المنطق في cs — هش أمام تغييرات SPA/postback (متسق مع فرضية Portal في انقلاب الضمان).
6. **مفاتيح/توكنز UI** (n8n token, AI key في chrome.storage) — لا hardcoded سرّ شوهد في الجرد ([REDACTED] سياسة)، لكن لا سياسة rotate موثقة.
7. ملف جذر content-script.js (P0-A) بلا وضوح مصيري — نسخة طافشة محتملة.

## 21) KEEP / RECOVER / INVESTIGATE / DEPRECATE / FUTURE (توصيات استرشادية — القرار للمعماري)
- **KEEP:** بنية unified الحالية، smart-log/telemetry/session-capture، strictExact الفني، workflows JSON في selectors.
- **RECOVER (مرشح):** fieldDefinitions/fieldLabels المركزية؛ saveTimeoutMs/retryIntervalMs ككونفيغ؛ (اختياري) dock-fab-hider.
- **INVESTIGATE:** أي نسخة محمَّلة فعليًا (deploy أم src)؛ الازدواج smart-log؛ حالة DateFilter الحقيقية؛ V2 الخارجي (تاريخه وهدفه)؛ ملف الجذر الطافش؛ «لا توجد نتائج» في phone-reveal.
- **DEPRECATE (بقرار معماري لاحق):** نسخ libs المكررة، templates القديمة، OLD messenger v2.0.0، أرشيف a859e936 داخل legacy (أو نقله خارج الشجرة).
- **FUTURE:** N8N end-to-end، البديل الآمن للفلتر، JSON-driven automation، تعلم ذاتي.

## 22) Evidence Gaps
- لا runtime confirmation لمعظم أدوات الدوك (تفعيل/استخدام فعلي).
- محتوى V1/V2 الخارجي لم يُقرأ سطرًا بسطر (بنية وهاشات فقط) + العربي سيستم (مساحة عمل) لم تُفهرس وظيفيًا.
- أي build يحمّله Chrome فعليًا (unpacked target) غير موثق في أي ملف.
- products-db.json (170KB) حداثته/مصدره.
- خريطة استدعاء popup→background→cs الرسائل غير مكتملة (رسائل QUICK_PASTE_BATCH/OPEN_TECH_REVIEW بلا توثيق).
- delay histogram وسطها اقتُطع في الالتقاط (قيم بين 8s و30s) — إعادة قراءة موضعية عند الحاجة.

## 23) Recommended Next Investigation
1. **حسم نسخة التشغيل:** تحديد مجلد unpacked المحمَّل في Chrome (قراءة فقط من chrome://extensions أو سؤال مباشر) ثم مزامنة قرار نشر P0-B (عملية منفصلة بإذن).
2. **فروق function-level** بين cs الحالي وpre-v1 (148K) لتصنيف كل دالة: انتقلت/أعيدت/سقطت — يكمل §9 آليًا.
3. **تجربة استرجاع fieldDefinitions** كتصميم (ورقة تصميم لا كود) لإعادة التكوين المركزي.
4. **ترقية capture (isTrusted + نسخ data.status)** ثم RUN21 مُشرف عليه — من تقرير P0-B السابق (خارج نطاق هذا الجرد، تذكير فقط).
5. فهرسة وظيفية عميقة للمجلدين V1/V2 عند الحاجة لأي استرجاع منهما.

---
### ملحق أ) أرقام الجرد الأساسية
ملفات المشروع 7,697/455MB (بدون .git) · backups 354MB/94 جيلًا · src/unified-extension 82 ملفًا · deploy 81 (80 مطابق هاش) · cs الحالي 146,844B/90 دالة · popup.html 265 id · dock 10 أدوات · userscripts فريدة 7 · selectors 33 مقابل 80 · node_modules داخل الشجرة 12,063 ملفًا.
### ملحق ب) ملفات الأدلة المنتجة في هذا الجرد
`_forensic_audit/out_external_census.txt` (6,022 سطرًا للمجلدات الخارجية) · `archaeology_census.json` · هذا التقرير.


1️⃣ أولاً: خلّص الـ Feature Archaeology صح (p4 + p45)
ما تكتفيش بـ "الشاشة موجودة". لازم تسأل:
الشاشة دي بتعمل إيه بالظبط؟
الأزرار فيها شغالة فعلاً ولا واجهة بس؟
الـ API بتاعها بيرد ولا بيرجع error/empty؟
الـ state management بتاعها سليم ولا بيحصل reset عشوائي؟
قارن بالـ original app لو الكود الأصلي لسه موجود (git history أو backup). كل feature مش موجودة في الريسكن = LOST ومحتاج تتصنف.
2️⃣ ثانياً: الـ Admin Panel مش رفاهية (p5)
تطبيق الاختبارات من غير Admin Panel = جثة.
لازم تكتشف:
هل الـ PHP endpoints لسه بتتكلم مع الـ Flutter app؟
هل الـ CRUD بتاع الأسئلة والأنمي شغال؟
هل الـ authentication بين الـ app والـ panel سليم؟
هل في API keys أو tokens اتغيرت/اتنسيت أثناء الريسكن؟
3️⃣ ثالثاً: الـ Data Flow هو العمود الفقري (p6)
Random questions: هل الـ shuffle/random بيشتغل فعلاً ولا بيجيب نفس الأسئلة كل مرة؟
Fallback: لو الـ API وقع، الـ app بيعمل إيه؟ (crash ولا graceful fallback؟)
Timing: الـ timer بتاع الاختبار بيعد صح ولا بيسرّع/يبطّأ؟
Verification: إجابات المستخدم بتتصحح فين؟ (client-side ولا server-side؟)
Logging: هل في logs بتتسجل عشان نعرف إيه اللي بيحصل فعلاً؟
4️⃣ رابعاً: الـ Tests (p7)
ما تكتبش tests جديدة لسه. الأول شوف الـ existing tests:
كام test موجود؟
كام واحد فيهم بيفشل؟
الـ failures دي بسبب الـ reskin ولا كانت موجودة قبل كده؟
الـ Playwright tests بتاع الـ Admin Panel مهمة جداً عشان تتأكد إن الـ endpoints شغالة.
5️⃣ خامساً: الـ Master Feature Matrix (p8) — ده أهم deliverable
عايزك تطلع جدول بالشكل ده:

Feature	الأصلية	الريسكن	الحالة	التوصية
Login	✅	✅	شغال	KEEP
Random Quiz	✅	⚠️	جزئي	RECOVER
Leaderboard	✅	❌	مفقود	RECOVER
Timer	✅	❌	مفقود	RECOVER
Anime Categories	❌	⚠️	جديد/ناقص	FIX
⚠️ تحذير بخصوص الـ Context Compression
أنا شايف إن الـ skills بتاعتك اتحذفت أثناء الـ compression. قبل ما تكمل أي task:

أعد تحميل skill_view(name='runtime-log-forensics')
راجع كل finding سجلته قبل الـ compression — ممكن يكون اتغير أو اتنسى
اتأكد إن الـ task list لسه منطقي بناءً على اللي اكتشفته
🎯 الخلاصة — الترتيب اللي عايزك تمشي بيه
text

1. خلّص p4 + p45 (الجرد الكامل)
2. ابدأ p5 (الـ Admin Panel) فوراً بعد كده
3. اعمل p6 (الـ Data Flow audit)
4. اعمل p8 (الـ Matrix) — ده اللي هنبني عليه كل حاجة
5. p7 (الـ Tests) آخر حاجة
6. p9 (التقرير النهائي) بعد ما كل حاجة تخلص
أنا مستني ردك الكامل عشان أدق التوجيهات وأقولك بالظبط إيه اللي يتعمل الأول وإيه اللي يتأجل.

