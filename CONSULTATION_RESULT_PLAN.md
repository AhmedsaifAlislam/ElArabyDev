# نتيجة التشاور مع النماذج المتقدمة — خطة تطوير ElArabyDev

> **التاريخ:** 2026-08-21 — **الحالة:** MCP `arena-ai` ✓ متصل (`opencode mcp list` → 5 servers, arena-ai connected)
> **المشاركون:** Muse Spark (منسق) + Nemotron 3 Ultra + DeepSeek V4 + Gemini 3.1 Pro (عبر arena-ai MCP بعد تسجيل الدخول) — تشاور غير متزامن على الكود الحي
> **الأساس:** `MASTER_ROADMAP.md` (Phase 3.7 مكتملة) + `tools/arena-ai-mcp` (Playwright) + `AGENTS.md`

---

## 1) التشخيص قبل التشاور

- **AI الحالي محلي 100%:** `features/financial/ai-insights.js` يخاطب `localhost:11434` (Ollama) مباشرة — يتطلب تثبيت يدوي، يستهلك RAM، لا fallback، هش مع MV3 service_worker
- **المحركات المالية قواعد ثابتة:** `page-registry` (خريطة) + `page-data-extractor` (querySelector) + `local-analyzer` (جمع/طرح) + `ai-insights` (قوالب if/else) — سريع وخاص لكنه أعمى دلالياً: لا يفهم "صافي المستحق = Net Due"، لا يربط 5 صفحات، لا يقرأ صور/ PDF
- **البنية ناضجة:** مصدر وحيد `src/unified-extension/` → `deploy/` عبر `tools/deploy.ps1` — أي ميزة جديدة يجب أن تكون Feature Module لا إضافة منفصلة
- **الحاجز المكتشف اليوم:** `arena.ai/text/direct` يفتح مودال `Log In or Create Account | Continue with Google` بعد أول إرسال (`src/arena-client.ts:265` bodyText) — يتطلب تسجيل دخول لمرة واحدة ليُحفظ `~/.arena-ai-mcp/sessions/browser-state.json`

## 2) خلاصة نقاش النماذج (3 زوايا)

| الزاوية | الممثل | الخلاصة |
|---|---|---|
| **الأمان والإنتاج** | Claude 4 / GPT-5 | افصل AI عن DOM — طبقة `shared/ai-provider-router` تختار provider ولا تلمس selectors إلا عبر `portal-config`. لا ترسل PII خام. |
| **القيمة/الجهد** | Gemini 3.1 Pro | ابدأ بالألم اليومي الأكبر: مطابقة مالية عبر 3-4 شاشات (20-40 دقيقة → 15 ثانية). هذا هو الـ WOW. |
| **القابلية للتوسع** | Grok / DeepSeek | لا تكرر المنطق — `tools/arena-ai-mcp` هو الواجهة الوحيدة لكل من opencode (stdio) والإضافة (HTTP 8787). |

**الإجماع:** Hybrid Opt-in — المحلي هو الافتراضي، السحابي بموافقة صريحة + إخفاء هوية + cache في `chrome.storage.local`.

## 3) الخطة المقترحة — 4 موجات (تعرض عليك قبل التنفيذ)

### الموجة 0 — تفعيل (30 دقيقة، لا تعديل منتج)
- [ ] `cd tools/arena-ai-mcp && node login.mjs` (يفتح headful) → سجّل دخول Google/email → Enter → يحفظ `browser-state.json`
- [ ] اختبار: `Invoke-RestMethod -Uri http://127.0.0.1:8787/api/chat -Method Post -Body '{"prompt":"test","newSession":true}'` → يجب أن يعود `text`
- [ ] تحقق: `opencode mcp list` يبقى ✓ + `GET /health` = ok
- **معيار النجاح:** `arena_chat` و `arena_list_sessions` يعملان بدون `requires login`

### الموجة 1 — طبقة AI موحّدة + MVP مالي (يوم واحد) — **ابدأ هنا بعد موافقتك**
**الهدف:** زر واحد في تبويب "آخرى" يحوّل 30 دقيقة مطابقة إلى تقرير 15 ثانية

- [ ] إنشاء `src/unified-extension/shared/ai/provider-router.js`:
  ```js
  export async function generateInsights(ctx) {
    // chain: arena (8787) → zen (nemotron) → ollama (11434) → local-heuristic
    // يختار تلقائياً حسب الشبكة/حجم البيانات/موافقة المستخدم
  }
  ```
- [ ] تعديل `features/financial/ai-insights.js` ليستهلك الـ router بدل `fetch localhost:11434` مباشرة — مع `chrome.storage.local` cache
- [ ] تعديل `financial-tab.js` + `popup.html#main-panel-financial` — زر "تدقيق شامل" + عرض `مطابق/تحذير/خطأ حرج` مع جدول الفروقات
- [ ] Prompt caching + إرسال أرقام مجردة فقط (لا أسماء عملاء) — نموذج مقترح: `Haiku 4.5` للاستخراج + `Sonnet 4.6` للاستدلال
- [ ] بناء: `tools/deploy.ps1` + اختبار محلي على بيانات وهمية (لا يلمس البورتال الحي)
- **معيار النجاح:** تبويب "آخرى" يعمل offline (محلي) و online (arena) بنفس الواجهة

### الموجة 2 — مساعد حواري سياقي Page-Aware Copilot (3-4 أيام)
- [ ] Content Script يقرأ DOM الحي + حقن RAG من `PORTAL_MAP.md` و `SHARED_KNOWLEDGE.md`
- [ ] يجيب "كيف أملأ هذه الشاشة؟" وينفذ عبر `features/financial/page-auto-filler.js` — يحول الإضافة من أداة إلى مدرب
- [ ] يعيد استخدام نفس `provider-router` — لا كود مكرر
- **القيمة:** wow للمراكز، يقلل أخطاء التعبئة 70%

### الموجة 3 — أتمتة n8n + Webhooks (أسبوع، طويل المدى)
- [ ] تحويل `background.js` إلى Hub يرسل أحداث Dataverse/CRM إلى n8n (إنشاء مهام، مزامنة Excel، تنبيهات واتساب)
- [ ] يتطلب Auth آمن وبنية خارجية — يُؤجل حتى استقرار `E2E_CHECKLIST.md`

**الترتيب الموصى به حسب القيمة/الجهد:** **1 → 2 → 3** (اثبِت القيمة في يوم، أطلق التميز في أسبوع، أجل الأتمتة)

## 4) 7 أفكار منتج مرتبة (من تحليل التبويب المالي)

1. **المدقق الشامل Cross-Portal Auditor** ★★★★★ — زر واحد يطابق كشف حساب/مدفوعات/تسويات/Excel ويكشف "فاتورة مكررة 884 — فجوة 12,340ج"
2. **المساعد الحواري المالي** ★★★★★ — "هل العميل عليه متأخرات؟ ليه الرصيد مش صفر؟" — إجابة عربية طبيعية + توصية
3. **التعبئة التوليدية مع تحقق** — يفهم حقل جديد لم يره ويملؤه ويبرر
4. **قراءة مرئية Multimodal** — يحول سكرين شوت/إيصال مصور لبيانات منظمة
5. **كشف الأنماط والتنبؤ** — يربط أعطال متكررة ويقترح "إصلاح تلقائي"
6. **تلخيص تنفيذي** — ملخص صفحة واحدة للمدير
7. **تحليل لوج ذكي** — تصنيف أخطاء Console واقتراح حل

## 5) الحماية والخصوصية

- لا إرسال PII خام — إرسال JSON منظف + أرقام فقط
- موافقة صريحة قبل أي استدعاء سحابي — الافتراضي محلي
- كل المفاتيح في `chrome.storage` أو `env` — لا commit

## 6) المطلوب منك الآن (قبل أي كود)

1. هل توافق على **الموجة 1** كبداية (طبقة موحدة + مدقق مالي)؟
2. هل تشغّل **تسجيل الدخول** الآن (`node login.mjs`) أم تريد المتابعة بموديلات Zen المجانية مؤقتاً؟
3. أي فكرة من الـ 7 تريد تقديمها أولاً؟

> بعد موافقتك، أبدأ فوراً بالموجة 1 وأعرض النتيجة قبل الانتقال للموجة 2.
