# SMART_LOG_ARCHITECTURE.md — اللوج الذكي (Smart Log) المعماري

> **المشروع:** El Araby Unified System — الإضافة الموحدة
> **الموقع:** `src/unified-extension/`
> **الطبقة:** اللوج الذكي — التقاط + تخزين + عرض + تحليل AI
> **الحالة:** منفذ (v2 — شامل: تقاطعات شبكة، 5 مخازن، 10 ميزات متقدمة)
> **التاريخ:** 2026-08-15

---

## 1. نظرة عامة

اللوج الذكي هو سجل مركزي موحّد يلتقط كل ما يحدث أثناء العمل على البوابة:
تعديلات الحقول اليدوية/الآلية، أخطاء الشبكة والتحقق، حركات الأدوات،
**وطلبات الشبكة المجمّعة** (من سكربت فلاتر التاريخ `DateFilter`).

يتكون من 3 طبقات:

| الطبقة | الملفات | الوظيفة |
|--------|---------|---------|
| **التقاط** | `content-script.js`, `control-panel.js`, `Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js`, `background.js` (webRequest) | جمع الأحداث من كل السياقات وإرسالها للخلفية |
| **التخزين** | `background.js` | 5 مخازن بـ chrome.storage.local + توجيه + ترحيل + إشعارات |
| **العرض والتحليل** | `popup.html`, `popup.js`, `ai/smart-ai-tools.js` | لوحة تحكم + تحليل محلي + Excel/CSV/JSON/PDF + AI |

> **ملاحظة:** تبويب "تحليل السلوك (Telemetry)" القديم حُذف نهائياً (كان يقرأ `telemetryEvents`/`telemetrySessions` التي لا يكتبها أي كود في الإضافة الموحدة، ومحتواه مكرر مع اللوج الذكي). الجلسات الفعلية تُعرض الآن داخل اللوج الذكي من سجل `sessionLogs` الحقيقي.

---

## 2. مخطط التخزين (5 مخازن)

| المفتاح | المحتوى | الحد | التوجيه |
|---------|---------|-----|---------|
| `slManualChanges` | تعديلات حقول يدوية (FIELD_CHANGE يدوي) | 5000 | `isAutomated=false` |
| `slAutomatedChanges` | تعديلات حقول آلية (FIELD_CHANGE آلي) | 5000 | `isAutomated=true` |
| `slErrors` | أخطاء (شبكة/تحقق/عميل/صفحة) | 2000 | `NETWORK_ERROR`, `VALIDATION_WARNING`, `CLIENT_VALIDATION_ERROR`, `PAGE_ERROR` |
| `slEvents` | باقي الحركات (بدء/اكتمال/تعبئة...) | 5000 | كل ما تبقى |
| `slNetwork` | طلبات الشبكة المجمّعة (fetch/XHR/iframe) | 3000 | `NETWORK_REQUEST` |

### رسائل background

| النوع | الوظيفة |
|-------|---------|
| `SMART_LOG_EVENT` | إضافة حدث + بث `SMART_LOG_UPDATED` + كشف الخطأ المتكرر (إشعار) |
| `GET_SMART_LOG` | إرجاع `{ manual, automated, errors, events, network }` |
| `CLEAR_SMART_LOG` | مسح المخازن الخمسة |
| `RESTORE_SMART_LOG` | استعادة لقطة محفوظة |
| `SMART_LOG_UPDATED` | بث داخلي لإعادة تحميل الـ popup لحظياً |

---

## 3. تدفق التقاط الشبكة (من فابز الفلتر)

سكربت الفلتر يعمل بـ **MAIN world** (معزول عن `chrome.runtime`) — لذا يتم الجسر:

```
DateFilter (MAIN world)
   │  اعتراض fetch / XHR / iframes
   │  notifySmartLog(kind, url, {method, body, modified})
   ▼
window.postMessage({ type: 'EAU_NETWORK_EVENT' })
   ▼
content-script.js (جسر EAU_NETWORK_EVENT)
   ▼
chrome.runtime.sendMessage({ type: 'SMART_LOG_EVENT', eventType: 'NETWORK_REQUEST' })
   ▼
background.js → handleSmartLogEvent() → slNetwork
   ▼
popup → renderNetworkLog() (مجمّع بالأيقونات + ×count + 🔓 للمعدّل)
```

> **ملاحظة أمان:** نفس نمط جسر `EAU_GRID_CAPTURES` الموجود — `postMessage` يتحقق من `ev.data.type` فقط، ولا يقبل أي رسائل خارجية.

### نقاط الاعتراض المضافة في DateFilter

| النقطة | الوظيفة |
|--------|---------|
| `notifySmartLog(kind, url, opts)` | دالة إرسال جديدة بجانب `notifyTopFrame` |
| fetch جديد | تسجيل `kind:'fetch'` مع method |
| fetch معدّل (توسيع createdon) | تسجيل `modified:true` |
| XHR جديد | تسجيل `kind:'xhr'` + method مخزّن في `this._method` |
| XHR معدّل (body) | تسجيل `modified:true` |
| iframe (من أعلى صفحة) | تسجيل `kind: eauFrameLog.kind` + modified |

---

## 4. الـ 10 ميزات المتقدمة

### 1) 🔍 بحث فوري
- حقل `#sl-search` يفلتر كل القوائم لحظياً عبر `slFilter()`.
- لا إعادة تحميل — فقط `renderSmartLogDashboard()` على `slSearchText`.

### 2) ⏱️ تحديث حي تلقائي
- زر `#sl-btn-live` يفعّل `setInterval` كل 4 ثوانٍ.
- الخلفية تبث `SMART_LOG_UPDATED` بعد كل `SMART_LOG_EVENT`؛ الـ popup المفتوح يتحدث فوراً.

### 3) 🕒 الخط الزمني الموحد
- `renderTimeline()` يدمج كل المخازن الخمسة ويرتبها زمنياً (آخر 100 حدث).
- زر `#sl-btn-timeline` يفتح/يغلق القسم.

### 4) 🧠 ملخص AI تنفيذي
- `aiSessionSummary()` يبني سياقاً مضغوطاً (تجميع يدوي + أخطاء + شبكة) ويرسله لـ AI بثلاثة أقسام: ماذا حدث؟ / المشاكل / توصيات.

### 5) 💬 AI مساعد تفاعلي
- صندوق `#sl-ai-question` + زر `سؤال` — يسأل المستخدم الذكاء الاصطناعي عن اللوج مباشرة.
- البث عبر `aiChatStream` مع fallback لـ `aiChat` / رسالة `AI_CHAT` للخلفية.

### 6) 🚨 كشف الشذوذ والتنبيهات
- **محلي:** `renderAnomalies()` يكشف: تكرار حقل يدوي ≥5 مرات بنفس النمط، خطأ متكرر ≥3 مرات.
- **خلفية:** نفس الخطأ يتكرر ≥5 مرات في آخر 30 حدث → إشعار نظام (`chrome.notifications`) بأيقونة `icons/icon128.png`.

### 7) 📈 نظرة سريعة (Insights)
- `renderInsights()`: أكثر حقل تغيّر يدوياً، أكثر ساعة نشاطاً، نسبة الأخطاء، طلبات الشبكة المعدّلة.

### 8) 📄 تصدير CSV + JSON
- `exportSmartLogCSV()`: صفوف مسطحة (فئة/نوع/وقت/تفاصيل) — كل المخازن.
- `exportSmartLogJSON()`: بيانات خام كاملة.

### 9) 💾 نسخة / استعادة (Snapshot)
- `saveSmartLogSnapshot()` → يخزن اللوج الحالي في `sl_snapshot`.
- `restoreSmartLogSnapshot()` → يستبدل المخازن الخمسة عبر `RESTORE_SMART_LOG` (مع تأكيد).

### 10) 🖱️ تفاعل مباشر
- كل الأزرار ترتبط بـ listeners؛ الفلاتر لحظية؛ الأقسام `details` قابلة للفتح/الإغلاق.
- Tooltips موسّعة (`title`) على عناصر التجميع تعرض أوقات آخر 3 تكرارات.

---

## 5. أحداث FIELD_CHANGE وحقل diff

- `control-panel.js` يرسل `FIELD_CHANGE` مع: `field/tag/value/oldValue/label/category`.
- **جديد:** دالة `getDiff(oldVal, newVal)` تشيل البادئة/اللاحقة المشتركة وتُبقي الجزء المتغير فقط
  (مثال: `3200264225220034 → 3200264225220099` تتحول إلى `0034 → 0099`).
- التجميع في الـ popup يتم على `(label, category, diff)` — فتظهر أنماط التكرار بوضوح بدل النص الكامل.

---

## 6. ملفات عدّلتها (أجزاء فقط — لا إعادة كتابة كاملة)

| الملف | التغيير |
|-------|---------|
| `background.js` | مفتاح `slNetwork` + توجيه + `RESTORE_SMART_LOG` + بث `SMART_LOG_UPDATED` + كشف الخطأ المتكرر بإشعار |
| `content-script.js` | جسر `EAU_NETWORK_EVENT` → `SMART_LOG_EVENT` |
| `control-panel.js` | `getDiff()` + حقل `diff` في FIELD_CHANGE |
| `popup.html` | صفوف أزرار جديدة + بحث + أقسام (خط زمني / شذوذ / نظرة سريعة / AI chat) + أزرار CSV/JSON/نسخة/استعادة |
| `popup.js` | دوال: `slFilter`, `renderTimeline`, `renderAnomalies`, `renderInsights`, `aiSessionSummary`, `askAISmartLog`, `exportSmartLogCSV/JSON`, `save/restoreSmartLogSnapshot` + ربط الأزرار + تحديث حي |
| `ai/smart-ai-tools.js` | أداة `read_smart_log` تدعم `kind: "network"` |
| `Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js` | `notifySmartLog()` + حقنها في fetch/XHR/iframe |
| `shared/n8n-event-bus.js` | تسجيل حدثي `smart_log_event` و `smart_log_batch` |
| `popup.js` (خارطة التطوير) | `exportSmartLogWeeklyReport`, `renderCharts`, `renderCompare`, فلاتر التاريخ/الصفحة, `renderSessions` (الجلسات من sessionLogs) |
| `popup.html` (خارطة التطوير) | أزرار ⚙️/📊/📋/⚖️ + لوحة فلاتر + قسما المخططات والمقارنة + قسم الجلسات |
| `background.js` (خارطة التطوير) | بث n8n غير الشبكي + `emitSmartLogNetworkBatch` دوري |
| `popup.html` + `popup.js` + `background.js` | **حذف تبويب تحليل السلوك (Telemetry) نهائياً**: الزر، اللوحة، `loadTelemetry`/`renderTelemetry`/`analyzeTelemetryWithAI`، وحالات `GET_TELEMETRY`/`CLEAR_TELEMETRY` |

> **التحقق:** `node --check` نظيف على كل ملفات JS، `manifest.json` صالح، كل الدوال معرّفة ومرتبطة، وبنية HTML متوازنة (div/details).

---

## 7. تكامل الذكاء الاصطناعي

| الوظيفة | الدالة | القناة |
|---------|--------|--------|
| تحليل اللوج (أخطاء/أنماط/توصيات) | `analyzeSmartLogWithAI` | `aiChatStream` → fallback `AI_CHAT` |
| ملخص تنفيذي | `aiSessionSummary` | `aiChatStream` |
| سؤال تفاعلي | `askAISmartLog` | `aiChatStream` |
| أداة AI (تقرأ سجل الشبكة) | `read_smart_log` | `SmartAI` registry |
| إعدادات (API Key + نموذج) | قسم `⚙️ إعدادات الذكاء الاصطناعي` | `aiConfig` في storage |

---

## 8. خارطة التطوير — منفذ

- [x] **ربط الأحداث بناقل n8n** — حدث `smart_log_event` لكل حدث غير شبكي (compact) + حدث `smart_log_batch` دوري لطلبات الشبكة (كل 5 دقائق عبر alarm) → `n8n-event-bus` (سجل محلي + طابور + إرسال للـ webhook إن مُعدّ).
- [x] **تقرير PDF أسبوعي** — `exportSmartLogWeeklyReport()` يولّد تقرير HTML جاهز للطباعة (بطاقات إحصاءات الأسبوع + جداول يدوي/أخطاء/شبكة) ويفتح نافذة طباعة تلقائياً → Save as PDF.
- [x] **فلاتر متقدمة** — نطاق تاريخ (من/إلى) + فلتر الصفحة: `slFilterFrom/slFilterTo/slFilterPage`، لوحة `#sl-filters`، زر ⚙️ في صف الأزرار.
- [x] **مقارنة جلستين** — `renderCompare()` يقارن الحالي مع آخر نسخة محفوظة (`sl_snapshot`) ويبين الفروق في كل فئة (يدوي/آلي/أخطاء/أحداث/شبكة).
- [x] **إحصائيات بيانية** — `renderCharts()` أعمدة CSS حسب الساعة / اليوم / الأسبوع (دون مكتبة خارجية).
- [x] **الجلسات** — قسم `🗓️ الجلسات` داخل اللوج الذكي يعرض سجل الجلسات الحقيقي (`sessionLogs`) بعدد الأوامر والمدة، بدلاً من تبويب Telemetry المحذوف.

### مقترحات مستقبلية
- [ ] تصدير تقرير PDF حقيقي (مكتبة jsPDF) بدل الطباعة
- [ ] مقارنة جلستين جنباً إلى جنب على مستوى الحدث (وليس العدد فقط)
- [ ] رسم بياني تفاعلي (Chart.js) بفترات قابلة للتخصيص
- [ ] تصدير تلقائي دوري لناقل n8n مع حد أقصى للحجم
