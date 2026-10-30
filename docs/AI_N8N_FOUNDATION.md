# AI + n8n Foundation — أساس الذكاء الاصطناعي وناقل الأحداث الموحد

> **المشروع:** El Araby Unified System — الإضافة الموحدة
> **الموقع:** `src/unified-extension/`
> **الطبقة:** Shared Core (تعمل في content scripts + popup + background)
> **الحالة:** منفذ (Foundation v1)

---

## 1. المكوّنات

| المكوّن | الملف | السياق | الوظيفة |
|---------|-------|--------|---------|
| **AI Client v2** | `shared/ai-client.js` | كل السياقات | محادثة، بث، Tool Calling، جلسات دائمة، توجيه نماذج |
| **Prompt Templates** | `shared/ai-prompts.js` | كل السياقات | قوالب system prompts مركزية (8 قوالب) |
| **n8n Event Bus** | `shared/n8n-event-bus.js` | كل السياقات | سجل أحداث + طابور Outbox + Retry + Dedupe |
| **n8n Client** | `shared/n8n-client.js` | كل السياقات | emit / flush / status / إرسال مباشر |
| **AI Tools Registry** | `ai/smart-ai-tools.js` | البورتال | 7 أدوات: سجل، أنماط، حالة، أحداث، بث n8n، إحصائيات |
| **Scheduler Tools** | `ai/scheduler-tools.js` | البورتال | 3 أدوات جدولة (مع JSON Schema) |
| **AI Proxy** | `background.js` | background | OpenAI-compatible proxy (ZEN) + Retry + Usage |
| **n8n Proxy** | `background.js` | background | fetch للـ Webhook (تجاوز CORS) + Flush دوري |

---

## 2. ناقل الأحداث (n8n Event Bus)

### 2.1 تدفق الحدث

```
n8nEmit(event, data)
  ├── 1. سجل محلي (n8nEventLog، آخر 200) — دائماً
  └── 2. طابور Outbox (n8nOutbox، آخر 100) — فقط إن:
        ├── webhookUrl مُعدّ
        └── autoForward !== false (إعدادات) و spec.autoForward !== false (سجل الأحداث)
           └── 3. n8nFlushOutbox():
                 ├── نجاح → حذف من الطابور
                 └── فشل → attempts++ (حتى 5) ثم يُتخلى عنه
```

### 2.2 الحماية من الفقد

- **Outbox مستمر**: الأحداث تُخزَّن في `chrome.storage.local` قبل الإرسال — لا تضيع عند انقطاع الشبكة/الحاسوب.
- **Dedupe**: كل حدث له `eventId` فريد (`evt_<ts>_<rand>`) → n8n يكشف التكرار عبر `eventId` في الـ payload.
- **Retry**: حتى 5 محاولات لكل حدث (كل إرسال يحاول مرة واحدة، ويزداد العداد عند الفشل).
- **Flush دوري**: `chrome.alarms` كل 5 دقائق + زر "تفريغ الطابور" في popup.
- **سقف آمن**: 100 حدث كحد أقصى في الطابور (الأقدم يُحذف أولاً).

### 2.3 سجل الأحداث الرسمي (Event Registry)

| الحدث | الوصف | autoForward |
|-------|-------|-------------|
| `excel_export` | تصدير Excel/CSV | ✅ |
| `session_log` | سجل الجلسات الذكي | ✅ |
| `telemetry_summary` | ملخص تحليل السلوك | ✅ |
| `test` | اختبار اتصال | ✅ |
| `ai_call` / `ai_failed` | طلبات AI (عبر telemetryAI) | ✅ |
| `booking_done` / `report_saved` / `order_extracted` | أحداث العمل | ✅ |

> أي وحدة تضيف حدثاً عبر `n8nRegisterEvent(name, { autoForward, description })`.

### 2.4 إعدادات n8n (chrome.storage.local)

```json
{
  "n8n": {
    "webhookUrl": "https://.../webhook/elaraby-events",
    "token": "Bearer token (اختياري)",
    "autoExport": true,
    "autoForward": true,
    "telemetryAI": false
  }
}
```

### 2.5 شكل الـ payload المرسل للـ Webhook

```json
{
  "event": "excel_export",
  "eventId": "evt_lv0x_ab12cd34",
  "data": { "filename": "...", "rowCount": 12, "format": "xlsx" },
  "meta": { "source": "elaraby-unified", "ts": 1755270000000, "env": "production" }
}
```

---

## 3. عميل الذكاء الاصطناعي (AI Client v2)

### 3.1 Tool Registry v2 — JSON Schema

كل أداة تُسجَّل بـ:
```javascript
global.aiRegisterTool(name, description, run, parameters)
// parameters = JSON Schema: { type: 'object', properties: {...}, required: [...] }
```

- `listTools()` تُرجع `{ name, description, parameters }` — تُمرَّر حرفياً إلى native tool calling في الـ API (تحسين دقة اختيار النموذج للأداة الصحيحة).
- الأدوات الحالية:
  - `read_smart_log {kind, limit}` — سجل الأخطاء/الأحداث
  - `read_validation_patterns {limit}` — أنماط الرفض المكررة
  - `get_page_state` — حالة الصفحة الحالية
  - `read_event_log {limit}` — آخر أحداث الإضافة
  - `emit_n8n_event {event, data}` — بث حدث لـ n8n من المحادثة
  - `get_usage_stats` — إحصائيات استخدام AI
  - `list_ai_tools` — قائمة الأدوات المتاحة
  - `get_current_incident` / `schedule_current_incident {date, god_mode}` / `open_scheduler_modal {god_mode}` — الجدولة

### 3.2 ذاكرة الجلسات الدائمة

- `aiRemember(sessionId, role, content)` — يخزّن في الذاكرة + `chrome.storage` (aiSessions، آخر 10 جلسات × 40 رسالة).
- `aiRecall(sessionId, n)` — يسترجع آخر n رسالة.
- `aiResetSession(sessionId)` — مسح جلسة محددة.
- لا تُفقد الجلسات عند إعادة تحميل الصفحة/الـ popup.

### 3.3 إحصائيات الاستخدام

- `aiGetUsage()` → `{ calls, tokens, ok, fail, byModel, last, history }` من background (AI_GET_USAGE).
- `aiResetUsage()` → مسح الإحصائيات.
- تُعرض في popup (تبويب المساعد الذكي) ويمكن للـ AI قراءتها عبر `get_usage_stats`.

### 3.4 قوالب البرومبت (ai-prompts.js)

| القالب | النموذج | الاستخدام |
|--------|---------|-----------|
| `general` | deepseek-v4-flash-free | محادثة popup |
| `portal` | deepseek-v4-flash-free | محادثة على البورتال (أدوات) |
| `scheduler` | deepseek-v4-flash-free | الجدولة الذكية |
| `booking` | deepseek-v4-flash-free | تعبئة البلاغات |
| `financial` | nemotron-3-ultra-free | التحليلات المالية |
| `extraction` | north-mini-code-free | استخراج البيانات |
| `qa` | ling-3.0-tiny-free | مراجعة الجودة |
| `summary` | mimo-v2.5-free | التلخيص |

استخدام: `ELARABY_PROMPTS.get(name)` أو `ELARABY_PROMPTS.build(name, {vars})` أو `register(name, tpl)`.

---

## 4. بروتوكول الرسائل (Message Protocol)

| Type | الوجهة | الوظيفة |
|------|--------|---------|
| `AI_CHAT` | background | طلب محادثة (مع history/tools/parameters) |
| `elaraby-ai-stream` (Port) | background | بث مباشر (chunk/done/error) |
| `N8N_SEND` | background | إرسال فوري لـ Webhook |
| `N8N_FLUSH` | background | تفريغ طابور Outbox |
| `N8N_QUEUE_STATUS` | background | حالة الطابور + آخر الأحداث |
| `AI_GET_USAGE` / `AI_RESET_USAGE` | background | إحصائيات استخدام AI |
| `STORAGE_GET/SET/REMOVE` | background | وسيط التخزين (Edge Tracking Prevention) |

---

## 5. الأمان

- **لا مفاتيح في الكود**: API key في `chrome.storage.local` فقط، ويُقرأ في background عند الطلب.
- **حدود**: maxTokens ≤ 4000، throttle 500ms، مهلة 90s، retry 3 مرات.
- **الخصوصية**: telemetryAI مغلق افتراضياً؛ لا يُرسل شيء لـ n8n بدون Webhook مُعدّ.
- **CORS**: كل fetch من background (host_permissions: localhost:5678 + *.n8n.cloud).

---

## 6. الاختبار

### وحدة (Node — tools/tests/)
`node tools/tests/run-tests.js`
- Event Bus: emit → سجل + طابور؛ flush ناجح يحذف؛ فشل يرفع attempts؛ dedupe؛ سقف السجلات.
- AI Client: تسجيل أدوات مع parameters؛ listTools تحمل schema؛ جلسات دائمة.

### يدوي (popup)
1. **n8n**: الأدوات ← n8n ← ضع Webhook (حقيقي أو https://webhook.site) ← حفظ ← "إرسال اختبار" ← تأكد استقبال JSON.
2. **طابور**: أرسل حدثاً (مثل تصدير Excel على البورتال) ← تحقق ظهوره في "آخر الأحداث" + عدّاد الطابور ← "تفريغ الطابور" ← تأكد الوصول لـ n8n.
3. **AI**: المساعد الذكي ← جرّب سؤالاً ← تحقق الرد + إحصائيات الاستخدام تزداد ← "مسح الإحصائيات".

### يدوي (البورتال)
4. افتح صفحة بلاغ ← محادثة المساعد ← اسأل "جدول البلاغ ليوم الغد" ← تحقق تنفيذ `schedule_current_incident`.
5. اسأل "ما آخر الأحداث؟" ← تحقق `read_event_log`.
6. اسأل "أرسل حدث اختبار لـ n8n" ← تحقق `emit_n8n_event`.

---

## 7. خطوات التوسع المقترحة (أفكار)

- **AI Workflows**: JSON يصف خطوات متعددة (استخراج → تحليل → إرسال n8n) يعملها الـ AI بأمر واحد.
- **نموذج سفير (Delegate)**: اختيار النموذج تلقائياً حسب قالب المهمة (من ai-prompts).
- **Auto-forward لكل الأحداث**: ربط حجز بلاغ / حفظ تقرير بـ `n8nEmit` (بدل اليدوي).
- **Google Sheets Sync**: ربط n8n بجدول مركزي للتقارير.
- **لوحة تحكم n8n**: عرض حالة workflows خارجياً في dashboard.
