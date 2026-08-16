# Phase 3+ Unified Integration Plan — El Araby Unified System

**الهدف**: دمج جميع إضافات "العربي سيستم" المنفصلة في **سيستم موحد واحد** (`master-portal/unified-extension`) بهيكل هجين:
- **Backend**: Modular Content Scripts (كل ميزة = content script منفصل يحمل عبر runner)
- **Frontend**: Unified Popup Panels (واجهة موحدة بتبويبات/panels)
- **Shared Core**: مكتبات مشتركة (storage-proxy, portal-selectors, smart-log, arabic-utils, data-mapper, message-bus)

---

## أولويات الدمج (حسب المستخدم)

| الأولوية | الميزة | المصدر (العربي سيستم) | الحجم | التعقيد |
|----------|--------|------------------------|-------|---------|
| **1** | **حجز البلاغات** (Booking Reports) | `??????? ?????` (309 ملف) | كبير | عالي |
| **2** | **البحث عن بلاغ** (Search Reports) | `????? ?? ????` (14 ملف) | متوسط | متوسط |
| **3** | **إدارة المهام / DateFilter** | `??? ???????? ?????????` (5 ملف) | صغير | منخفض |
| **4** | **التحليلات المالية** | `portal-other-section` | متوسط | متوسط |
| **5** | **Excel Autofix (Python)** | `excel_autofix` | منفصل | متوسط |
| **6** | **Rescheduling Optimization** | `Rescheduling Portal Requests Optimization` | صغير | منخفض |
| **7** | **AI End-to-End Enhancement** | جديد | جديد | عالي |

---

## البنية المستهدفة (Hybrid Architecture)

```
master-portal/unified-extension/
├── manifest.json                 # MV3 manifest واحد
├── background.js                 # Service Worker مركزي (storage proxy, AI proxy, notifications)
├── shared/                       # مكتبات مشتركة (مستخدمة من كل الميزات)
│   ├── storage-proxy.js          # ✅ جاهز
│   ├── portal-selectors.js       # ✅ جاهز (يحتاج توسيع لـ CRM/Financial)
│   ├── smart-log.js              # ✅ جاهز
│   ├── arabic-utils.js           # ✅ جاهز
│   ├── data-mapper.js            # ✅ جاهز
│   ├── message-bus.js            # ✅ جاهز
│   ├── ai-client.js              # 🆕 عميل AI موحد (OpenCode Zen)
│   ├── frame-walker.js           # 🆕 مشي iframes موحد
│   ├── table-scraper.js          # 🆕 استخراج جداول موحد
│   ├── excel-exporter.js         # 🆕 تصدير Excel موحد (ExcelJS)
│   └── portal-config.js          # 🆕 إعدادات البورتال مركزي (PAGES, SELECTORS, SAP_KEYWORDS)
├── content/                      # Content Scripts رئيسية
│   ├── content-script.js         # ✅ أساسي (Auto-filler, AI chat)
│   ├── crm/crm-content.js        # ✅ CRM portal
│   ├── booking/                  # 🆕 حجز البلاغات (modular)
│   │   ├── auto-filler.js        # تعبئة تلقائية
│   │   ├── scanner.js            # مسح الصفحة
│   │   ├── shadow-panel.js       # لوحة ظل
│   │   ├── dashboard.js          # داشبورد
│   │   └── excel-processor.js    # معالجة Excel
│   ├── search/                   # 🆕 البحث عن بلاغ
│   │   ├── search-content.js     # محتوى البحث
│   │   └── exporter.js           # تصدير نتائج
│   ├── datefilter/               # 🆕 DateFilter Unlocker
│   │   └── unlocker.js
│   └── financial/                # 🆕 التحليلات المالية
│       ├── crm-analytics.js
│       └── sap-analytics.js
├── Tempermonky/                  # Tampermonkey Scripts (via runner)
│   ├── elaraby-phone-reveal.js   # ✅
│   ├── messenger-sender.js       # ✅
│   ├── report-processor.js       # ✅
│   ├── booking-automation.js     # 🆕 أتمتة حجز البلاغات
│   └── datefilter-unlocker.js    # 🆕 DateFilter
├── popup/                        # Unified Popup (Frontend)
│   ├── popup.html                # ✅ هيكل موحد
│   ├── popup.js                  # ✅ منطق موحد
│   ├── panels/                   # Panels لكل ميزة
│   │   ├── autofill-panel.js     # تعبئة تلقائية
│   │   ├── booking-panel.js      # حجز البلاغات
│   │   ├── search-panel.js       # البحث عن بلاغ
│   │   ├── datefilter-panel.js   # DateFilter
│   │   ├── financial-panel.js    # التحليلات المالية
│   │   ├── tampermonkey-panel.js # ✅ موجود
│   │   ├── ai-panel.js           # 🆕 AI Assistant
│   │   └── settings-panel.js     # إعدادات
│   └── styles/                   # CSS موحد
├── lib/                          # مكتبات خارجية
│   ├── xlsx.full.min.js          # ✅
│   ├── papaparse.min.js          # ✅
│   └── exceljs.min.js            # 🆕 لـ Excel export متقدم
└── styles/
    ├── tokens.css                # ✅ Design tokens
    └── popup.css                 # ✅ Popup styles
```

---

## خطة التنفيذ التفصيلية

### Phase 3.1: الأساس المشترك + حجز البلاغات (Backend) — أسبوعين
**الوكيل**: Agent-ARCH + Agent-TAMPER + Agent-CORE

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.1.1 | **Shared Core Expansion**: إضافة `ai-client.js` (OpenCode Zen)، `frame-walker.js`، `table-scraper.js`، `excel-exporter.js`، `portal-config.js` | 5 مكتبات جديدة، اختبارات وحدة |
| 3.1.2 | **Manifest Update**: إضافة content scripts جديدة (`booking/*`, `search/*`, `datefilter/*`, `financial/*`) مع `run_at: document_idle` | Manifest صحيح، لا تعارض |
| 3.1.3 | **Runner Enhancement**: توسيع `tampermonkey-runner.js` لدعم تحميل modular scripts ديناميكياً + lifecycle flags لكل ميزة | runner يحمل modules حسب الطلب |
| 3.1.4 | **Booking Backend Port**: نقل `auto-filler.js`, `scanner.js`, `shadow-panel.js`, `dashboard.js`, `excel-processor.js` من العربي سيستم → `content/booking/` مع استخدام shared modules | 5 ملفات منقولة، تعمل مع portal-selectors/storage-proxy |
| 3.1.5 | **Booking TM Script**: إنشاء `booking-automation.js` في Tempermonky للعمليات الثقيلة (batch booking) | سكريبت runner-ready |
| 3.1.6 | **Integration Test**: اختبار حجز بلاغ كامل (auto-fill → scan → dashboard → excel export) | End-to-end يعمل على بورتال حقيقي |

### Phase 3.2: البحث عن بلاغ + DateFilter — أسبوع
**الوكيل**: Agent-EXTRACT + Agent-TAMPER

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.2.1 | **Search Reports Port**: نقل `content.js` + popup search logic → `content/search/` + `panels/search-panel.js` | بحث يعمل، تصدير Excel |
| 3.2.2 | **DateFilter Port**: نقل `ElAraby_DateFilter_Unlocker.user.js` → `content/datefilter/unlocker.js` + `Tempermonky/datefilter-unlocker.js` + `panels/datefilter-panel.js` | Date filter يعمل على CRM |
| 3.2.3 | **Popup Panels Integration**: إضافة تبويبات Search و DateFilter في popup.html/popup.js | UI موحد، تنقل سلس |

### Phase 3.3: التحليلات المالية (Financial Analytics) — أسبوع
**الوكيل**: Agent-EXTRACT + Agent-SYNC

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.3.1 | **Portal-Other-Section Port**: نقل CRM/Financial scripts من `portal-other-section` → `content/financial/` مع shared modules | تحليلات CRM/SAP تعمل |
| 3.3.3 | **Financial Panel**: `panels/financial-panel.js` مع تصدير Excel موحد | لوحة موحدة، تصدير يعمل |
| 3.3.3 | **Google Sheets Sync**: تحسين sync مع exponential backoff + local cache | Sync موثوق |

### Phase 3.4: Excel Autofix (Python) Integration — أسبوع
**الوكيل**: Agent-SYNC + Agent-CORE

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.4.1 | **Python Service**: تشغيل `excel_autofix` كخدمة محلية (FastAPI) أو WebAssembly | API متاح |
| 3.4.2 | **Bridge Module**: `shared/excel-autofix-bridge.js` يستدعي Python service عبر `fetch` | جسر يعمل |
| 3.4.3 | **Popup Integration**: إضافة خيار "Excel Autofix" في AI/Tools panel | متاح من الواجهة |

### Phase 3.5: Rescheduling + AI End-to-End — أسبوعين
**الوكيل**: Agent-ARCH + Agent-UI + Agent-CORE

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.5.1 | **Rescheduling Port**: نقل optimization logic → modular content script | يعمل |
| 3.5.2 | **AI End-to-End Platform**: بناء `ai-client.js` كامل مع: | منصة AI جاهزة |
|       | - Multi-model routing (Nemotron, DeepSeek, MiMo, إلخ) | |
|       | - Context injection (portal state, selectors, user history) | |
|       | - Tool calling (storage, scraping, excel, notifications) | |
|       | - Streaming responses في popup | |
| 3.5.3 | **AI Panel**: `panels/ai-panel.js` مع chat interface + tool results display | واجهة محادثة كاملة |
| 3.5.4 | **Smart Automation**: AI-driven workflows (مثال: "احجز كل البلاغات من النوع X") | أتمتة ذكية |

### Phase 3.6: Polish, Testing, Documentation — أسبوع
**الوكيل**: Agent-QA + Agent-UI + Agent-SEC

| المهمة | الوصف | المعيار |
|----------|--------|---------|
| 3.6.1 | **E2E Testing**: سيناريوهات كاملة لكل الميزات على بيئة staging | 100% pass |
| 3.6.2 | **Performance Audit**: قياس memory/CPU لكل modular script | <50MB per script |
| 3.6.3 | **Security Audit**: CSP، secrets scan، permissions review | Zero critical |
| 3.6.4 | **UI/UX Polish**: Design system tokens، animations، RTL، accessibility | WCAG AA |
| 3.6.5 | **Documentation**: MASTER_ROADMAP تحديث، API docs، user guide | توثيق كامل |

---

## خطة AI End-to-End (التفصيل)

### نماذج ZEN المعتمدة (من Phase 1)
| الوكيل | النموذج | الاستخدام |
|--------|---------|----------|
| Agent-UI | Nemotron 3 Ultra Free | UI generation, design decisions |
| Agent-ARCH | Nemotron 3 Ultra Free | Architecture, system design |
| Agent-CORE | DeepSeek V4 Flash Free | Extension core, background, manifest |
| Agent-SEC | DeepSeek V4 Flash Free | Security audit, CSP, permissions |
| Agent-TAMPER | MiMo V2.5 Free | Tampermonkey scripts, content scripts |
| Agent-SYNC | LongCat-2.0 Free | Storage sync, Google Sheets, background jobs |
| Agent-EXTRACT | North Mini Code Free | Data extraction, scraping, Excel |
| Agent-QA | Ling-3.0-tiny Free | Testing, validation |

### AI Client Architecture (`shared/ai-client.js`)
```javascript
// Capabilities exposed to AI
const tools = {
  storage: { get, set, remove },           // via storage-proxy
  scraping: { scrapeTable, findElement },  // via table-scraper + frame-walker
  excel: { export, import, autofix },      // via excel-exporter + python bridge
  notifications: { show, schedule },       // via background
  portal: { navigate, fillForm, click },   // via content scripts messaging
  tampermonkey: { runScript, stopScript }  // via runner
};

// Model routing based on task type
const modelMap = {
  'ui-design': 'nemotron-3-ultra',
  'architecture': 'nemotron-3-ultra',
  'core-coding': 'deepseek-v4-flash',
  'security': 'deepseek-v4-flash',
  'tampermonkey': 'mimo-v2.5',
  'sync-jobs': 'longcat-2.0',
  'extraction': 'north-mini-code',
  'qa': 'ling-3.0-tiny'
};
```

---

## مخطط التبعيات (Dependency Graph)

```
Phase 3.1 (Shared Core + Booking Backend)
    │
    ├── 3.1.1 Shared Core Expansion ──────────► (لا تبعيات)
    ├── 3.1.2 Manifest Update ────────────────► يحتاج 3.1.1
    ├── 3.1.3 Runner Enhancement ─────────────► يحتاج 3.1.2
    ├── 3.1.4 Booking Backend Port ───────────► يحتاج 3.1.1, 3.1.3
    ├── 3.1.5 Booking TM Script ──────────────► يحتاج 3.1.3
    └── 3.1.6 Integration Test ───────────────► يحتاج 3.1.4, 3.1.5
         │
         ▼
Phase 3.2 (Search + DateFilter) ◄────────────► يحتاج 3.1 مكتمل
    ├── 3.2.1 Search Port ────────────────────► يحتاج Shared Core
    ├── 3.2.2 DateFilter Port ────────────────► يحتاج Shared Core + Runner
    └── 3.2.3 Popup Panels ───────────────────► يحتاج 3.2.1, 3.2.2
         │
         ▼
Phase 3.3 (Financial) ◄──────────────────────► يحتاج 3.1 مكتمل
    ├── 3.3.1 Financial Port ─────────────────► يحتاج Shared Core
    ├── 3.3.2 Financial Panel ────────────────► يحتاج 3.3.1
    └── 3.3.3 Sheets Sync ────────────────────► يحتاج 2.2 (Storage Proxy) ✅
         │
         ▼
Phase 3.4 (Excel Autofix) ◄──────────────────► يحتاج 3.1 مكتمل
    ├── 3.4.1 Python Service ─────────────────► مستقل
    ├── 3.4.2 Bridge Module ──────────────────► يحتاج 3.4.1 + Shared Core
    └── 3.4.3 Popup Integration ──────────────► يحتاج 3.4.2
         │
         ▼
Phase 3.5 (Rescheduling + AI Platform) ◄─────► يحتاج 3.1-3.4
    ├── 3.5.1 Rescheduling ───────────────────► يحتاج Shared Core
    ├── 3.5.2 AI Platform ────────────────────► يحتاج كل Shared Core
    ├── 3.5.3 AI Panel ───────────────────────► يحتاج 3.5.2
    └── 3.5.4 Smart Automation ───────────────► يحتاج 3.5.2, 3.5.3
         │
         ▼
Phase 3.6 (Polish) ◄──────────────────────────► يحتاج كل السابق
```

---

## تقديرات الجهد

| Phase | المهام | الجهد التقديري | الوكلاء الرئيسيون |
|-------|--------|----------------|-------------------|
| 3.1 | 6 | 2 أسابيع | ARCH, TAMPER, CORE |
| 3.2 | 3 | 1 أسبوع | EXTRACT, TAMPER |
| 3.3 | 3 | 1 أسبوع | EXTRACT, SYNC |
| 3.4 | 3 | 1 أسبوع | SYNC, CORE |
| 3.5 | 4 | 2 أسابيع | ARCH, UI, CORE |
| 3.6 | 5 | 1 أسبوع | QA, UI, SEC |
| **المجموع** | **24** | **~8 أسابيع** | **جميع الوكلاء** |

---

## معايير النجاح (Definition of Done)

1. **سيستم موحد واحد**: `master-portal/unified-extension` يحمل كل الميزات
2. **Manifest واحد**: MV3، permissions دقيقة، لا CSP violations
3. **Modular Loading**: كل محتوى يحمل عند الطلب عبر runner (Lazy loading)
4. **Unified Popup**: واجهة واحدة، تبويبات لكل ميزة، Design system موحد
5. **Shared Modules**: صفر تكرار كود، كل ميزة تستخدم shared libraries
4. **AI End-to-End**: محادثة ذكية مع tool calling حقيقي على البورتال
5. **Zero Secrets**: لا مفاتيح في الكود، tudo في storage مشفر
6. **Performance**: <3s load، <50MB memory لكل content script
7. **Tests**: Unit + Integration + E2E تمر 100%
8. **Documentation**: MASTER_ROADMAP محدث، API docs، User Guide

---

## المخاطر والتخفيفات

| المخاطرة | الاحتمال | التأثير | التخفيف |
|----------|----------|---------|----------|
| تعارض CSP في PowerApps | عالي | عالٍ | Runner في MAIN world، fallback للـ ISOLATED |
| Google Sheets quotas | متوسط | متوسط | Exponential backoff + local cache + batch writes |
| Edge Tracking Prevention | عالي | عالٍ | Storage Proxy عبر background (منفذ ✅) |
| DOM changes في البورتال | عالي | متوسط | Portal-selectors قابل للتوسع + regression tests |
| تعقيد AI tool calling | متوسط | عالٍ | بدء بنموذج بسيط، توسيع تدريجي |
| حجم الكود الموحد | منخفض | متوسط | Code splitting، lazy loading، tree shaking |

---

## الخطوة التالية الفورية

**الموافقة على هذه الخطة** → ثم بدء **Phase 3.1 Task 3.1.1** (Shared Core Expansion: إنشاء المكتبات الخمس الجديدة: `ai-client.js`, `frame-walker.js`, `table-scraper.js`, `excel-exporter.js`, `portal-config.js`) مع Agent-ARCH + Agent-CORE.

---

*تم إنشاء هذه الخطة بناءً على تحليل شامل لـ:*
- *`العربي سيستم` (الإضافات المنفصلة الحالية)*
- *`ElArabyDev/master-portal/unified-extension` (السيستم الموحد القائم)*
- *الأولويات المحددة من المستخدم*
- *الهيكل الهجين المطلوب (Modular Backend + Unified Frontend)*