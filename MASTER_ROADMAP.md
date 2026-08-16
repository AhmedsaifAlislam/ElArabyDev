# MASTER_ROADMAP.md — El Araby System / العربي سيستم
**Master Task Tracker & Agent Team Specification**

> **آخر تحديث:** 2026-08-16  
> **الإصدار:** 2.0 — يعكس الواقع الفعلي (Phase 1-3.7 مكتملة + إصلاحات 13-08 + Reorg Feature-Based)  
> **الحالة:** Phase 3.8 جارية (E2E حي + وثائق الوكلاء)، Phase 4 معلقة  
> **المالك:** Zain (Antigravity)

---

## 📊 ملخص تنفيذي

| المؤشر | القيمة |
|----------|--------|
| **إجمالي المهام المكتشفة** | 52+ مهمة |
| **مكتمل (✅)** | 36 مهمة |
| **قيد التنفيذ / جزئي (🔄)** | 4 مهام (3.8 E2E، Performance، Second Visit دمج، Excel Test) |
| **لم يبدأ (❌)** | 12+ مهمة (معظمها Phase 4 + تحسينات) |
| **مشاريع فرعية** | 4 مشاريع (المساعد الذكي، البحث عن بلاغ، حجز/DateFilter، تحليلات مالية) |
| **أحدث إنجاز (14-08)** | **إصلاح الجدول الفارغ في التقفيلات (v1.5 — إزالة تطبيق الفلتر التلقائي) — ✅ تحقق حي من المستخدم** + second-visit.js + SMART_ASSISTANT_ARCHITECTURE.md + Security re-verify |
| **إنجاز (15-08)** | Phone-Reveal UI/UX (tokens + classes) + توحيد iframes (frame-walker) + أداء Batch (concurrency pool) + Google Sheets (sync-manager — منجز مسبقاً) + order-extractor (حد 200 + retry) + ملاحظات سريعة (Quick Notes tab + تصدير) + DateFilter v1.6.1 (توسيع آلي: reload ثم metafilter مع شبكة أمان — جذر "بلاغات اليوم" = الجدول server-rendered + الخادم يتجاهل dtStart/dtEnd) — ✅ منشور SHA256 MATCH |
| **إنجاز (16-08)** | **قاعدة صارمة: سيريال 2/موديل 2 للتكييف فقط** — بلاغ حي رُفض ("المنتج غير متطابق مع الرقم المسلسل" لأن serial2 = "0" في ثلاجة) → `isACProductType()` + `clearModel2Serial2Fields()` في `executePage1_Review` (إزالة isSharp + General fallback) — ✅ منشور SHA256 MATCH |
| **إنجاز (16-08) — تنظيف الدمج** | **حذف مجلد `assistant/` (نسخة قديمة من مساعد التقفيلات اتنسخت كـ content scripts → تعارض `const` في الـ scope المشترك وقتل `content-script.js`)** — تم: حذف المجلد من src/deploy، تنظيف manifest من إدخالاته (content_scripts + web_accessible_resources)، إزالة debug logs، إرجاع `const`/`let`. **القرار: إعادة هيكلة "البحث الذكي" وخدماته ومميزاته (قطع الغيار) بعد دراسة الإصدار القديم المرجعي** — الوظائف الحالية في الجذر (popup تبويب البحث الذكي + PARTS_SEARCH + products-db.json) سليمة، والبنية الجديدة تُصمَّم في مرحلة قادمة بناءً على دراسة الإصدار القديم. |

---

## 🏗️ البنية الحالية للمشروع (ElArabyDev — 14-08-2026)

```
ElArabyDev/
├── src/unified-extension/            # ★ المصدر الرئيسي (MV3 Extension)
│   ├── core/booking/                 # ★ قلب المشروع: auto-filler, scanner, shadow-panel
│   ├── ai/                           # ★ عقل المساعد: chat-panel, voice-control, smart-ai-tools, smart-scheduler, scheduler-tools
│   ├── features/
│   │   ├── spare-parts/dashboard/    # قطع الغيار/البحث: dashboard.html + dashboard.js
│   │   ├── financial/                # التحليلات المالية: scraper, analyzer, financial-boot
│   │   └── crm/                      # CRM: crm-content
│   ├── content/second-visit.js       # جديد (14-08): "زيارة تانية" مستقل + مسجل في manifest
│   ├── shared/                       # مكتبات موحدة (ai-client, frame-walker, table-scraper, excel-exporter, portal-config, ...)
│   ├── Tempermonky/                  # سكريبتات مدمجة (DateFilter, Phone Reveal, Messenger, Report, Booking)
│   ├── scripts/booking/              # أدوات مساعدة
│   ├── lib/ styles/ icons/           # مكتبات + تصميم
│   ├── background.js  popup.*  *.tab.js  content-script.js  tampermonkey-runner.js
│   ├── order-extractor.js  control-panel.js  unified-dock.js  dock-fab-hider.js
│   ├── elaraby-phone-reveal-layer0.js
│   └── manifest.json                 # 16 content_scripts (مع second-visit.js)
├── deploy/                           # ★ مجلد النشر (يُبنى من src عبر tools/deploy.ps1)
├── tools/                            # deploy.ps1, sync-shared.ps1, excel_autofix/
├── backups/                          # نسخ احتياطية تلقائية بتاريخ
├── legacy/                           # أرشيف (لا تطوير)
├── docs/                             # MASTER_README, PORTAL_MAP, SHARED_KNOWLEDGE, SMART_ASSISTANT_ARCHITECTURE.md (جديد)
└── *.md                              # CHANGELOG, AGENTS, MASTER_ROADMAP (هذا), E2E_CHECKLIST, IDEAS_BACKLOG, KNOWN_ISSUES
```

---

## ✅ المهام المكتملة (18)

### Unified Extension - Core
| # | المهمة | الملف/المصدر | دليل الإنجاز |
|---|---------|--------------|--------------|
| 1 | Quick Tools Bar هيكل أساسي | `popup.html` + `popup.js` + `styles/popup.css` | الكود موجود، الأيقونات emoji |
| 2 | تبويب "مساعد التقفيلات" نشط افتراضيًا | `popup.html` line 22 | `class="main-panel active"` |
| 3 | Order Extractor - استخراج البلاغات | `order-extractor.js` | يعمل، يصدر Excel |
| 4 | Excel Export متقدم (freeze, ألوان, summary) | `order-extractor.js` exportXLSX | كود كامل موجود |
| 5 | Phone Reveal Layer0 (Manifest) | `manifest.json` + `elaraby-phone-reveal-layer0.js` | أرقام تظهر ✅ |
| 6 | Phone Reveal UI Script (913 سطر) | `Tempermonky/elaraby-phone-reveal.js` | كود كامل: UI, Tabs, Sync, Export |
| 7 | Tampermonkey Runner | `tampermonkey-runner.js` | إدارة 3 سكريبتات مدمجة |
| 8 | Smart Log + Telemetry | `shared/smart-log.js` + `popup.js` | تبويبات تعمل |
| 9 | Storage Proxy Pattern | `shared/storage-proxy.js` | يعمل عبر background |
| 10 | Manifest V3 + Permissions | `manifest.json` | صحيح، يحمل بدون أخطاء |
| 11 | Deploy Sync (hash verified) | `مساعد التقفيلات/` | SHA256 match مؤكد |

### مهمة "زيارة تانية" (Second Visit) - 6/7 مكتملة
| # | المهمة | المصدر | الحالة |
|---|---------|--------|-------|
| 12 | Create secondVisitProfiles.json | `task.md` | ✅ |
| 13 | Add tab to popup.html | `task.md` | ✅ |
| 14 | Implement Second Visit queue in popup.js | `task.md` | ✅ |
| 15 | Add START_SECOND_VISIT_QUEUE in content-script.js | `task.md` | ✅ |
| 16 | Update routing logic (fake data on Page 1) | `task.md` | ✅ |
| 17 | Force Page 2 transition | `task.md` | ✅ |
| 18 | Support subFault matching for Page 3 | `task.md` | ✅ |

> **ملاحظة:** المهمة السابعة (اختبار شامل + دمج) **تم إنشاء second-visit.js (14-08)** — يحتاج تحقق حي فقط.

---

## ✅ إنجازات 13-14 أغسطس 2026 (جديدة — بعد Phase 3)

### إصلاح عطل الفلترة (13-08) — 🔴 حرج
| المهمة | التفاصيل | الحالة |
|--------|-----------|---------|
| **scheduler-tools.js** | إصلاح `ai.aiListTools is not a function` — `register` تدعم `aiRegisterTool`/`registerTool`، `listTools` من `ai.listTools \|\| global.aiListTools` — أدوات الجدولة كانت لا تُسجَّل (6 أدوات الآن) | ✅ منشور + تحقق حي (Console: Array(6)) |
| **DateFilter_Unlocker** | إزالة `location.reload()` من `setAutoExpand` + حماية `__lastAnalyzedRaw` ضد التحليل المتكرر + مراقبة عنصر الفلتر فقط بدل `documentElement` | ✅ منشور + تحقق حي (تحليل مرة واحدة فقط) |
| **الجدول الفارغ في التقفيلات (14-08) 🔴 حرج** | v1.5: إزالة تطبيق الفلتر التلقائي (`applyFilterControlExpansion`/metafilter/نقر زر) من `watchFilter` — كان يمسح الجدول ويُظهر "لا توجد سجلات". الآن رصد فقط، تطبيق يدوي عبر الأزرار فقط | ✅ تحقق حي من المستخدم + SHA256 متطابق |

### إعادة التنظيم حسب الميزات (13-08) — Feature-Based Structure
| المهمة | التفاصيل | الحالة |
|--------|-----------|---------|
| **core/booking/** | auto-filler + scanner + shadow-panel (قلب المشروع) | ✅ |
| **ai/** | chat-panel + voice-control + smart-ai-tools + smart-scheduler + scheduler-tools | ✅ |
| **features/** | spare-parts/dashboard + financial + crm | ✅ |
| **تنظيف** | حذف content/ و dashboard/ القديمة + تحديث كل المراجع (manifest، background، popup، dashboard.html) | ✅ node --check نظيف + deploy متزامن |

### تسليمات الوكلاء (14-08) — Phase 3.8 + Phase 4 Prep
| المهمة | الوكيل | التفاصيل | الحالة |
|--------|--------|-----------|---------|
| **3.8.3 Security Re-verify** | Agent-SEC | فحص secrets/CSP/eval/storage بعد Reorg — صفر secrets، كل شيء موثق | ✅ تقرير جاهز |
| **second-visit.js** (المهمة 7) | Agent-TAMPER | Content script مستقل كامل (queue → Page1 fake → Page2 force → Page3 subFault) + مسجل في manifest (16 content_scripts) | ✅ منشور + node --check OK |
| **Phone-Reveal UI/UX** | Agent-UI | خطة شاملة: design tokens (الألوان/مسافات/خطوط/ظلال) + component specs (Tabs/FAB/Modal/Buttons) + RTL logical properties + accessible states | ✅ منفذ (15-08): tokens CSS + .erp-btn classes + focus-visible/aria + reduced-motion — منشور (SHA256 MATCH) |
| **SMART_ASSISTANT_ARCHITECTURE.md** | Agent-ARCH | وثيقة تصميم كاملة: IndexedDB schema + Cascade Filters flow + Message Protocol + هيكل ملفات + قرارات | ✅ `docs/SMART_ASSISTANT_ARCHITECTURE.md` |
| **E2E Checklist** | Agent-QA | سيناريوهات 7 مفصلة + Pre-conditions + نتائج متوقعة + جداول تسجيل | ✅ جاهز (يتطلب تحديث شامل للنسخة القديمة) |

---

## 🔄 المهام قيد التنفيذ / جزئية (4)

| # | المهمة | المشكلة الحالية | الملف | الأولوية |
|---|---------|----------------|-------|----------|
| 1 | **3.8.1 E2E Live Test** | الاختبار الحي على البورتال (7 سيناريوهات) — يتطلب المستخدم | `E2E_CHECKLIST.md` | 🔴 حرجة |
| 2 | **3.8.2 Performance Report** | قياسات أداء (popup load، AI response، memory) — لم تُنفَّذ | — | 🟡 متوسطة |
| 3 | **Second Visit Integration Test** | second-visit.js أنشئ (14-08) لكن الربط الحي مع content-script غير مختبر | `content/second-visit.js` | 🟡 عالية |
| 4 | **Excel Export Live Test** | exportXLSX يعمل نظرياً، لم يُختبر بملف حقيقي | `order-extractor.js` | 🟡 متوسطة |

---

## ❌ المهام غير المنجزة (23+) — مجمعة حسب المصدر

### أ) خطة التطوير المشتركة (A1–E) — من تحليل خارجي
| المرحلة | المهام | التفاصيل | المصدر |
|----------|--------|-----------|--------|
| **A1** | ~~ReferenceError in pagination~~ ✅ | `result` غير معرف داخل الدالة المحقونة — في ElArabyDev مُصلح أصلاً بـ `data.length` في `src/unified-extension/background.js:1135` (مطابق في deploy). النسخة القديمة في `العربي سيستم/المساعد الذكي` لا نعدّلها (التعديلات داخل ElArabyDev فقط) | تحليل خارجي |
| **A2** | chrome.storage عبر background فقط | منع الوصول المباشر من content scripts | تحليل خارجي / AGENTS.md |
| **B1** | portal-defs.js موحد | PAGES/SELECTORS/SAP_KEYWORDS في ملف واحد | تحليل خارجي |
| **B2** | إعادة توجيه 4 مستهلكين | للملف الموحد الجديد | تحليل خارجي |
| **C1** | frame-walker module | وحدة مشتركة للمشي في الإطارات | تحليل خارجي |
| **C2** | storage-proxy module | موحد (موجود جزئياً) | تحليل خارجي |
| **C3** | table-scraper module | استخراج جداول موحد | تحليل خارجي |
| **C4** | excel-exporter module | تصدير Excel موحد | تحليل خارجي |
| **C5** | حذف النسخ المكررة | content-script/portal-automation/get_all_data/popup/excel_app | تحليل خارجي |
| **D1** | ~~تنظيف graphify-out~~ ✅ | حُذف (212MB ملفات تحليل مولّدة) | تحليل خارجي |
| **D2** | ~~تنظيف snapshots بمفاتيح Azure~~ ✅ | حُذف 38 مجلد `*_files` (125.5MB) بمفاتيح حقيقية + تحقق 0 متبقٍ | تحليل خارجي / أمان |
| **D3** | ~~manifest-template مكسور~~ ✅ | أُصلح: إزالة `portal-config.js` غير الموجود + `manifest-v3.json` → `manifest.json` | تحليل خارجي |
| **D4** | ~~أذونات غير مستخدمة~~ ✅ | كل الأذونات مستخدمة فعلياً (tabs 22، notifications، clipboardRead 9) | تحليل خارجي |
| **D5** | استبدال eval | 🔶 موثق: eval مشروع (حقن سكربتات مستخدم MAIN world — نمط Tampermonkey نفسه) | تحليل خارجي |
| **E** | تحقق شامل | End-to-end testing | تحليل خارجي |

### و) إعادة هيكلة "البحث الذكي" (قطع الغيار) — بعد دراسة الإصدار القديم
> **القرار (16-08):** حُذف مجلد `assistant/` (نسخة قديمة من مساعد التقفيلات تسبب تعارض `const`). وظائف البحث الذكي الحالية في الجذر (popup تبويب البحث الذكي + `PARTS_SEARCH` + `products-db.json`) سليمة. **تُعاد هيكلة خدمات ومميزات البحث الذكي في مرحلة قادمة بعد دراسة الإصدار القديم المرجعي.**

| المهمة | التفاصيل | الحالة |
|--------|-----------|--------|
| دراسة الإصدار القديم | تحليل ملفات `assistant/` المرجعية (control-panel: `readPartsFromGrid`, `executePartsShortcut`, `findProductByModel`, `loadProductsDb`) مقابل الجذر — تحديد الميزات المفقودة/الأفضل | ❌ |
| تصميم البنية الجديدة للبحث الذكي | الوصلات: popup تبويب البحث الذكي ↔ `content-script.js` (`PARTS_SEARCH`) ↔ `products-db.json` + dashboard قطع الغيار | ❌ |
| دمج ميزات الإصدار القديم المفقودة | قراءة جدول قطع الغيار من الصفحة، جملة "يحتاج: [...]", تكامل حالة قطع الغيار مع التقفيل (PAGE_2/PAGE_3) | ❌ |

### ب) Unified Extension - PROJECT_STATUS.md
| المهمة | التفاصيل | المصدر |
|----------|-----------|--------|
| تحسين Phone-Reveal UI/UX | واجهة المستخدم الحالية تحتاج تلميع | `PROJECT_STATUS.md` | ✅ منجز (15-08): tokens + .erp-btn + accessible states |
| تحسين دمج Tampermonkey | الربط بين runner و popup | `PROJECT_STATUS.md` |
| تحسين أداء Batch | معالجة دفعات البلاغات | `PROJECT_STATUS.md` |
| تحسين استخراج البيانات | دقة وسرعة الاستخراج | `PROJECT_STATUS.md` |
| تحسين المزامنة السحابية | Google Sheets sync | `PROJECT_STATUS.md` |
| Edge Tracking Prevention | حل عبر background.js | `PROJECT_STATUS.md` |
| CSP Facebook/Messenger | `chrome.scripting.executeScript` | `PROJECT_STATUS.md` |
| PowerApps iframes handling | البحث في iframes المتداخلة | `PROJECT_STATUS.md` | ✅ منجز (15-08): frame-walker في collectAllDocs + waitForModalIframe (fallback آمن) |
| أداء Batch (Layer 3) | معالجة دفعات البلاغات | `PROJECT_STATUS.md` | ✅ منجز (15-08): concurrency pool (4) + jitter |
| CSP Facebook/Messenger | `chrome.scripting.executeScript` | `PROJECT_STATUS.md` | ✅ فحص (15-08): سليم — لا eval/لا storage مباشر — لا إصلاح مطلوب |

### ج) المساعد الذكي (المجلد独立)
| المهمة | التفاصيل | المصدر |
|----------|-----------|--------|
| Dashboard + Shadow Panel | واجهة ظل مستقلة | `PROJECT_STATUS.md` |
| IndexedDB (Dexie) | تخزين محلي متقدم | `PROJECT_STATUS.md` / `AGENTS.md` |
| ربط Cascade Filters | Product Type → Model → Defect Major → Defect Desc | `AGENTS.md` |
| Event Flow بين المكونات | تفكيك الارتباط بين UI و State | `AGENTS.md` |
| Smart Log Integration | تسجيل ذكي للعمليات | `AGENTS.md` |

### د) البحث عن بلاغ
| المهمة | التفاصيل | المصدر |
|----------|-----------|--------|
| content.js فلترة/تصدير | GridView handling | `AGENTS.md` |
| DOM Selectors للصفحات المختلفة | خريطة عناصر ديناميكية | `AGENTS.md` |

### هـ) حجز البلاغات المستقبلة / DateFilter Unlocker
| المهمة | التفاصيل | المصدر |
|----------|-----------|--------|
| crmAccount futureCases handling | اعتراض setter/getter | `PROJECT_STATUS.md` |
| Fetch/XHR Interception | استخراج بيانات من الطلبات | `PROJECT_STATUS.md` |
| GM_getValue/GM_setValue | تخزين Tampermonkey | `PROJECT_STATUS.md` |

### و) خطة "زيارة تانية" - المهمة المتبقية
| المهمة | التفاصيل | المصدر |
|----------|-----------|--------|
| اختبار شامل + دمج نهائي | المهمة 7 في `task.md` | `task.md` |
| ملف `second-visit.js` منفصل | لم يُنشأ بعد | `implementation_plan.md` |
| تسجيل في Manifest | `second-visit.js` ك content script | `implementation_plan.md` |

---

## 🤖 فريق الوكلاء المقترح (Agent Team)

> **الفلسفة:** كل وكيل متخصص 100% في مجاله، يعمل باستقلالية، يتواصل عبر `MASTER_ROADMAP.md` المشترك.

| الوكيل | التخصص | النموذج المقترح (ZEN Free) | المهارات الأساسية | المهام الموكلة |
|---------|---------|----------------------|------------------|--------------|
| **Agent-UI** | Frontend / CSS / Extension Popup | **Nemotron 3 Ultra Free** | CSS Grid/Flex, SVG Icons, Chrome Extension Popup, RTL/Arabic UI, Design Tokens | Task 1.1 (Quick Tools SVG), Phase 2 UI Polish |
| **Agent-CORE** | Extension Core / Manifest / Background | **DeepSeek V4 Flash Free** | MV3 Manifest, Service Workers, chrome.* APIs, CSP, Content Scripts | Task 1.2, 1.3, 1.4, 1.5, A1, A2, D3, D4 |
| **Agent-TAMPER** | Tampermonkey / Userscripts / Page Injection | **MiMo V2.5 Free** | Tampermonkey API, `document-start/end`, MAIN world, CSP bypass, GM_* | Phone Reveal Stop/Start, Runner fixes, DateFilter Unlocker |
| **Agent-EXTRACT** | Data Extraction / Excel / Table Scraping | **North Mini Code Free** | ExcelJS, SheetJS, Table Parsing, PowerApps DOM, Pagination | Order Extractor, Excel Export, C3, C4 |
| **Agent-SYNC** | Cloud Sync / Google Sheets / Storage | **LongCat-2.0 Free** | Google Apps Script, WebApp URL, chrome.storage, IndexedDB/Dexie | Google Sheets Sync, Smart Log, C2 |
| **Agent-ARCH** | Architecture / Modularity / Refactoring | **Nemotron 3 Ultra Free** | Decoupling, JSON-Driven, Engine/Script Pattern, Shared Modules | B1, B2, C1-C5, D1, D5 |
| **Agent-SEC** | Security / Secrets / Cleanup | **DeepSeek V4 Flash Free** | Secrets scanning, CSP, eval removal, permissions audit | D2, D5, Manifest cleanup |
| **Agent-QA** | Testing / Verification / E2E | **Ling-3.0-tiny Free** | Chrome Extension testing, Manual test scripts, Regression | Phase E, Second Visit Integration, Excel Testing |

**سياقات الوكلاء**: ملفات مِنشأة في `.opencode/agents/agent-{اسم}.md` — تحتوي على الهدف والملفات والسياق التقني ومعيار القبول لكل وكيل.

> **ملاحظة النماذج:** التوزيع النهائي تم اعتماده: Nemotron 3 Ultra (Agent-UI, Agent-ARCH)، DeepSeek V4 Flash (Agent-CORE, Agent-SEC)، MiMo V2.5 (Agent-TAMPER)، LongCat-2.0 (Agent-SYNC)، North Mini Code (Agent-EXTRACT)، Ling-3.0-tiny (Agent-QA).

---

## 📦 هيكل التسليم لكل وكيل

كل وكيل يستلم **حزمة سياق (Context Package)** تحتوي:

```markdown
## Agent Context Package: [Agent-Name]

### 1. الهدف المحدد (Objective)
[وصف دقيق بمخرج واحد قابل للقياس]

### 2. الملفات الهدف (Target Files)
- مسار الملف 1
- مسار الملف 2
...

### 3. السياق التقني (Technical Context)
- كود موجود ذات صلة (مقاطع مختارة)
- تبعيات (Dependencies)
- قيود (Constraints: CSP, MV3, RTL, Arabic)

### 4. معيار القبول (Definition of Done)
- [ ] معيار قابل للاختبار 1
- [ ] معيار قابل للاختبار 2
...

### 5. مراجع من MASTER_ROADMAP
- رقم المهمة: X.Y
- الصفحات/الأسطر ذات الصلة
```

---

## 🚀 خطة التنفيذ المقترحة (Phased)

### Phase 0: التأسيس (يوم 1) — **يجب إنجازها أولاً**
| خطوة | الوصف | المسؤول |
|------|-------|---------|
| 0.1 | إنشاء `MASTER_ROADMAP.md` هذا الملف في الجذر | Human |
| 0.2 | إنشاء مجلد `.opencode/agents/` لملفات سياق الوكلاء | Human |
| 0.3 | تسجيل المهام في نظام تتبع (GitHub Issues / Linear / محلي) | Human |
| 0.4 | مراجعة وتأكيد معيار القبول لكل مهمة | Human + All Agents |

### Phase 1: إصلاحات حرجة — UI + Logic (أيام 2-4)
| Task | الوكيل | الحالة | المعيار |
|------|--------|--------|---------|
| 1.1 Quick Tools SVG Icons | Agent-UI | ✅ منفذ + منشور | 6 أيقونات SVG واضحة، تتمدد عند hover |
| 1.2 Manifest Double Injection Fix | Agent-CORE | ✅ منفذ + منشور | runner يتخطى `manifestInjected: true` |
| 1.3 __ERP_STOP حقيقي | Agent-TAMPER + Agent-CORE | ✅ منفذ + منشور | زر إيقاف يوقف كل شيء (intervals, hooks, state, DOM) |
| 1.4 Phone Reveal Window Verification | Agent-TAMPER | 🔄 تحقق المستخدم الأخير | أيقونة 🤖 تظهر على البورتال، التبويبات تعمل، الإيقاف فعلي |
| 1.5 Deploy Sync + Verification | Agent-CORE | ✅ Hash MATCH (7 ملفات) | Hash match، extension يحمل بدون أخطاء |
| 1.6 Tampermonkey Lifecycle v2 (قوي وعام) | Agent-TAMPER + Agent-CORE | ✅ منفذ + منشور (8 ملفات MATCH) | إيقاف دائم عبر `tm_running_<id>`، hooks `__TM_STOP_<id>`، إجبار كشف الأرقام عند إعادة التشغيل |

### Phase 2: المهام الهيكلية (أيام 5-10) — ✅ مكتملة بالكامل (11-08-2026)
| Task | الوكيل | الحالة | التفصيل |
|------|--------|--------|---------|
| 2.1 Portal-Defs موحد (shared/portal-selectors.js) | Agent-ARCH | ✅ | 4 نسخ مطابقة (974E608F) + محمّل في 3 امتدادات × 5 مواضع (content-script، order-extractor، crm، control-panel، المساعد الذكي) + مستهلكان فعليان (content-script.js، order-extractor.js) — order-extractor يقرأ `POWERAPPS.table` مع fallback |
| 2.2 Storage Proxy موحد | Agent-SYNC | ✅ | proxy في background + storage-proxy.js (4 نسخ مطابقة BA381654) + كل content scripts مُوجَّهة (content-script، smart-log، crm-content، control-panel — proxy أولاً + fallback) + 0 استخدام مباشر في سكربتات Tampermonkey — control-panel.js D063715C + storage-proxy في حقنته |
| 2.3 ReferenceError A1 | Agent-CORE | ✅ | `result` غير معرف داخل الدالة المحقونة → `data.length` بدلها في `المساعد الذكي\background.js:429` + node --check OK |
| 2.4 تنظيف النسخ المكررة C5 | Agent-ARCH | ✅ | 0 نسخ مكررة داخل أي مشروع (unified-extension، portal-other-section، excel_autofix، Rescheduling) — التكرار الوحيد بنية جذرين متطابقين (ElArabyDev ↔ المشروع) متعمدة |
| 2.5 Manifest Cleanup D1-D5 | Agent-SEC + Agent-CORE | ✅ | D1: graphify-out حُذف (212MB) — D2: 38 مجلد `*_files` بمفاتيح Azure حُذفت (125.5MB + تحقق 0 متبقٍ) — D3: template أُصلح (`portal-config.js` غير الموجود أُزيل + `manifest-v3.json` → `manifest.json`) — D4: كل الأذونات مستخدمة فعلياً (tabs 22، notifications، clipboardRead 9) — D5: eval موثق كمشروع (حلقن سكربتات مستخدم MAIN world بنمط Tampermonkey) |
| **النشر** | Agent-CORE | ✅ MATCH | control-panel D063715C، manifest E1C4CEB3، order-extractor 471B427D — الكل مطابق في مساعد التقفيلات |
| **التحقق اليدوي** | User | ✅ | أيقونات Quick Tools (توسيط + hover) تمام ✓ + التشغيل/الإيقاف الدائم تمام ✓ |

### Phase 3: الدمج الموحد (Unified Integration) — أيام 11-20+
> **الخطة الكاملة**: `PHASE3_UNIFIED_INTEGRATION_PLAN.md` — دمج 6 إضافات منفصلة + AI End-to-End في سيستم واحد
> **البنية الهجينة**: Modular Content Scripts (Backend) + Unified Popup Panels (Frontend) + Shared Core

| Task | الوكيل | الحالة | المعيار |
|------|--------|--------|---------|
| 3.1 Shared Core Expansion (مكتبات مشتركة) | Agent-ARCH + Agent-CORE | ✅ منجز + منشور (8 ملفات MATCH) | 5 مكتبات جديدة: ai-client، frame-walker، table-scraper، excel-exporter، portal-config |
| 3.1.1 frame-walker.js | Agent-ARCH | ✅ منجز + منشور | walkFrames + findInFrames + findAllInFrames + findElement + FrameWalker |
| 3.1.2 table-scraper.js | Agent-EXTRACT | ✅ منجز + منشور | اكتشاف + استخراج جداول عبر iframes + CSV |
| 3.1.3 excel-exporter.js | Agent-EXTRACT | ✅ منجز + منشور | ExcelJS (RTL + تنسيق) + fallback CSV + BOM عربي |
| 3.1.4 portal-config.js | Agent-ARCH | ✅ منجز + منشور | PAGES/DOMAINS/SAP_KEYWORDS مركزية + isPortal/isCRM/getPageInfo |
| 3.1.5 ai-client.js | Agent-CORE | ✅ منجز + منشور | ZEN موحد + MODEL_MAP (6 نماذج) + Tool Registry + سياق تلقائي |
| 3.1.x التحقق | Agent-CORE | ✅ 62 دالة عامة فريدة، 0 تعارضات، SYNTAX OK ×5، manifest VALID JSON | لا إعادة تعريف |
| 3.2 حجز البلاغات Port (auto-filler، scanner، shadow-panel، dashboard، excel) | Agent-TAMPER | ✅ منجز + منشور (43 ملف MATCH) | content/booking (3 سكربتات) + shared/db.js + dashboard + papaparse + router msg.action في background + مسارات Drive |
| 3.2.x Booking TM Script (booking-automation.js) | Agent-TAMPER | ✅ منجز + منشور (11-08) — يلزم تحقق حي | Tempermonky/booking-automation.js (runner-ready: لوحة ⚡ حجز جماعي + FAB، تاريخ + God Mode، يسجل التقدم في localStorage ويستأنف بلاغاً بلاغاً، يعمل عبر runner أو Tampermonkey مباشرة) + مسجّل في BUILTIN_SCRIPTS |
| 3.3 البحث عن بلاغ Port + DateFilter Unlocker | Agent-EXTRACT + Agent-TAMPER | ✅ منجز + منشور | البحث عن بلاغ مغطى بـ crm-content.js (نسخة محسّنة من الدورة نفسها) + DateFilter في Tempermonky/DateFilter/ بحقن MAIN document_start بعد layer0 |
| 3.4 التحليلات المالية Port (portal-other-section) + Google Sheets Sync | Agent-EXTRACT + Agent-SYNC | ✅ منجز + منشور (46 ملف MATCH) | content/financial (scraper+analyzer+financial-boot مع AI عبر ai-client) + تصدير Excel/CSV موحد + مسارات Drive |
| 3.5 Excel Autofix Bridge (Python) | Agent-SYNC | ✅ منجز + منشور (11-08) | excel_autofix: autofix_core.py (نواة موحدة) + service.py (HTTP على 127.0.0.1:8765: health/process/downloads) + service.bat + تبويب "📊 Excel Autofix" في الأدوات (فحص الخدمة + رفع + تنزيل blob) — اختُبر E2E (row_count=3, RTL ✓, title مخصص ✓) |
| 3.6 Rescheduling + **AI End-to-End Platform** | Agent-ARCH + Agent-UI + Agent-CORE | ✅ منجز + منشور (11-08) — يلزم تحقق حي على البورتال | content/rescheduling/: smart-scheduler.js (Port v1.1 مع دوال عامة) + scheduler-tools.js (3 أدوات: get_current_incident / schedule_current_incident / open_scheduler_modal) + ai-chat-panel.js (FAB 🤖 + محادثة عائمة)；ai-client.js: أُضيف aiChatWithTools (Tool Calling End-to-End: محادثة → JSON tool → تنفيذ → تلخيص) — اختُبر في Node (PASS) + manifest entry جديد |
| 3.7 Popup Panels موحدة (تبويبات لكل ميزة) | Agent-UI | ✅ منجز + منشور (11-08) | popup موحد: 4 تبويبات رئيسية (مساعد التقفيلات / البحث الذكي / الاستخراج / الأدوات) — الأدوات فيها 8 sub-tabs (Tampermonkey, تقارير, لوج ذكي, Telemetry, إعدادات, مزامنة, Excel Autofix, 🤖 المساعد الذكي) + زر "فتح المحادثة على صفحة البورتال" (SHOW_AI_CHAT → FAB يفتح ويُركز) — كلها بـ tokens.css موحد |
| 3.8 E2E Tests + Performance + Security + Docs | Agent-QA + Agent-SEC | 🔶 جزئي (11-08): Security ✅ (صفر secrets)، Syntax ✅ (كل ملفات JS)، Docs ✅ (MASTER_README + CHANGELOG) — **معلق:** E2E حي على البورتال (تحقق المستخدم) + تقرير أداء | 100% pass، صفر secrets، WCAG AA |

### Phase 4: المشاريع الفرعية (متوازي، مستمر)
| مشروع | الوكيل الرئيسي | ملاحظة |
|--------|----------------|--------|
| المساعد الذكي | Agent-ARCH + Agent-UI | يحتاج IndexedDB + Dashboard |
| البحث عن بلاغ | Agent-EXTRACT | يعتمد على Portal-Defs |
| حجز البلاغات / DateFilter | Agent-TAMPER | مستقل، Tampermonkey-based |
| تحليلات مالية (portal-other-section) | Agent-EXTRACT | منفصل |

---

## 🔗 خارطة التبعيات (Dependency Graph)

```
Phase 0 (تأسيس)
    ↓
Phase 1 (إصلاحات حرجة) ←─ لا تبعيات، يمكن البدء فوراً
    │
    ├── 1.1 (UI) مستقل
    ├── 1.2 (Runner) ← يتطلب 1.4 يعمل لتأكيد الإصلاح
    ├── 1.3 (Stop Logic) ← يتطلب 1.2 مكتمل (لا حقن مزدوج)
    ├── 1.4 (Window) ← يتطلب 1.2 (manifest entry)
    └── 1.5 (Sync) ← بعد 1.1-1.4
    ↓
Phase 2 (هيكلية) ← تتطلب Phase 1 مستقرة — ✅ مكتملة (11-08)
    ├── 2.1 (Portal-Defs) ← أساس لـ 2.2, 3.1, 3.2, 3.3
    ├── 2.2 (Storage Proxy) ← أساس لـ 3.4, 3.5
    ├── 2.3 (A1) ← مستقل — ✅ أُصلح (11-08)
    ├── 2.4 (C5) ← بعد 2.1
    └── 2.5 (Cleanup) ← في أي وقت بعد Phase 1 — ✅ D1-D4 + D5 موثق
    ↓
Phase 3 (الدمج الموحد) ← تتطلب Phase 2
    ├── 3.1 (Shared Core: frame-walker، table-scraper، excel-exporter، portal-config، ai-client)
    │     ← يستخدم 2.1 + 2.2 — أساس لكل ما يليه
    ├── 3.2 (حجز البلاغات Port) ← يستخدم 3.1 + 1.6 (Lifecycle v2)
    ├── 3.3 (البحث عن بلاغ + DateFilter) ← يستخدم 3.1 + 1.6
    ├── 3.4 (التحليلات المالية + Sheets Sync) ← يستخدم 3.1 + 2.2
    ├── 3.5 (Excel Autofix Bridge) ← يستخدم 3.1 + 2.2
    ├── 3.6 (Rescheduling + AI Platform) ← يستخدم 3.1 + 2.2 — الأخيرة
    ├── 3.7 (Popup Panels موحدة) ← بعد الميزات
    └── 3.8 (Tests + Security + Docs) ← في النهاية
    ↓
Phase 4 (مشاريع فرعية) ← يمكن التوازي بعد Phase 3
```

---

## ✅ تعريف الجاهزية (Readiness Criteria) للانتقال بين المراحل

| المرحلة | شرط الانتقال للمرحلة التالية |
|----------|----------------------------|
| Phase 0 → 1 | `MASTER_ROADMAP.md` معتمد، Issues مسجلة، Agents contexts جاهزة |
| Phase 1 → 2 | **كل Tasks 1.1-1.5** تمر تعريف الجاهزية، Extension يحمل على Chrome، أيقونات تظهر، نافذة Phone Reveal تظهر، إيقاف يعمل، لا حقن مزدوج |
| Phase 2 → 3 | **كل Tasks 2.1-2.5** تمر، Unit tests للـ modules المشتركة، لا regression في الميزات الحالية |
| Phase 3 → 4 | **كل Tasks 3.1-3.5** تمر، Integration tests، Second Visit يعمل على 3 بلاغات حقيقية |

---

## 📝 ملاحظات وقرارات مهمة (Decisions Log)

| التاريخ | القرار | السياق | التأثير |
|----------|--------|--------|---------|
| 2026-08-10 | **SVG Icons بدلاً من Emoji** | استقرار عبر OS، لا تعتمد على font fallback | Agent-UI ينفذ SVG inline في CSS |
| 2026-08-10 | **إيقاف حقيقي (__ERP_STOP)** | زر "إيقاف" الحالي تجميلي فقط | Agent-TAMPER ينفذ cleanup كامل |
| 2026-08-10 | **Manifest Injection للـ Phone Reveal** | CSP يحجب inline injection من runner | Manifest entry مضاف، runner يتخطى بـ flag |
| 2026-08-10 | **نموذج ZEN المجاني لجميع الوكلاء** | تكلفة صفر، أداء قوي في البرمجة | كل الوكلاء `zen-coder` ما عدا المعماري |
| 2026-08-10 | **JSON-Driven Architecture مستقبلاً** | قرّر في `architecture_analysis.md` | Phase 3 هدف استراتيجي |

---

## ⚠️ مخاطرKnown Issues & Mitigations

| المخاطر | الاحتمال | التأثير | التخفيف |
|----------|----------|---------|----------|
| CSP Änderungen في PowerApps تكسر Manifest injection | متوسط | عالٍ | Agent-TAMPER يراقب، fallback إلى runner إذا فشل |
| Google Sheets API Quotas | عالٍ | متوسط | Agent-SYNC: exponential backoff، batch writes، local cache |
| Edge Tracking Prevention يكسر storage | متوسط | عالٍ | Storage Proxy عبر background (معمول جزئياً) |
| تحديثات PowerApps DOM تكسر Selectors | عالٍ | عالٍ | Portal-Defs مركزي + اختبارات regression آلية |
| تضارب بين Manifest injection و Runner | منخفض (محلول بالـ flag) | متوسط | Flag `manifestInjected: true` في runner |
| Secrets في الكود (Azure keys) | مؤكد (تاريخي) | حرج | Agent-SEC: scan كامل، rotate secrets، لا commit |

---

## 📂 مواقع الملفات المرجعية السريعة

| الملف | المسار | الأهمية |
|--------|--------|---------|
| `MASTER_ROADMAP.md` (هذا الملف) | `E:\My First Lap\MY WORKE\Apps\العربي سيستم\` | **الرئيسي** |
| `AGENTS.md` (تعليمات الجذر) | `E:\My First Lap\MY WORKE\Apps\العربي سيستم\AGENTS.md` | القواعد الحاكمة |
| `PROJECT_STATUS.md` (Unified) | `E:\My First Lap\MY WORKE\Apps\ElArabyDev\master-portal\unified-extension\PROJECT_STATUS.md` | المهام الحالية |
| `architecture_analysis.md` | `E:\My First Lap\MY WORKE\Apps\ElArabyDev\مساعد التقفيلات\a859e936-...\architecture_analysis.md` | الرؤية المعمارية |
| `implementation_plan.md` | نفس المجلد | خطة "زيارة تانية" |
| `task.md` | نفس المجلد | قائمة مهام (6/7 ✅) |
| `PORTAL_REFERENCE.md` | `E:\My First Lap\MY WORKE\Apps\ElArabyDev\master-portal\docs\` | خريطة البوابة |
| `SHARED_API.md` | نفس المجلد | APIs مشتركة |

---
أفكار كثير عن الذكاء الاصطناعي 
أفكار عن الاتمتة وال n8n

## 🎯 الخطوة التالية الفورية

> **بانتظار موافقتك على هذا الملف كخطة رسمية.**

بمجرد الموافقة، سأقوم بـ:
1. **حفظ هذا الملف** كـ `MASTER_ROADMAP.md` في جذر المشروع
2. **إنشاء ملفات سياق الوكلاء** في `.opencode/agents/agent-<name>.md`
3. **تسجيل المهام** كنظام تتبع (GitHub Issues أو ملف `TASKS.md` محلي)
4. **بدء Phase 1** مع Agent-UI (أسرع فوز مرئي) + Agent-CORE (الأساس)

---

**هل أوافق على هذا كخطة رسمية وأبدأ التنفيذ؟**  
(أي تعديلات على الهيكل، الأولويات، أو تعيين الوكلاء — قل لي الآن قبل البدء)