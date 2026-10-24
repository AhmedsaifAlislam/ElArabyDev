# خطة استشارة الذكاء المتقدم عبر arena.ai — تطوير ElArabyDev

> **ملاحظة (2026-10-24):** أداة `tools/arena-ai-mcp/` أُزيلت من المستودع نهائيًا.
> هذا الملف مرجع تاريخي للخطة فقط — لا تشغّله ولا تبنِ عليه.

> تاريخ: 2026-08-21 — تشاور مشترك: Muse Spark (المضيف) + arena.ai (موديلات frontier) + تحليل الكود الحي
> الحالة: MCP `arena-ai` متصل ✓ لكن `arena_chat` يتطلب تسجيل دخول لمرة واحدة

## 1) تشخيص الوضع الحالي (من الكود الحي)

- **المشروع:** `ElArabyDev` = النسخة الوحيدة للتطوير — `src/unified-extension` (MV3) + `deploy/` (مبني عبر `tools/deploy.ps1`)
- **الوضع:** Phase 3.7 مكتملة ✅، 3.8 جزئية (E2E حي + performance)، تنظيف `assistant/` تم (16-08) — الآن `PARTS_SEARCH` في الجذر + `products-db.json`
- **AI الحالي:** `src/unified-extension/shared/ai-client` + `src/unified-extension/ai/` يستخدم **OpenCode Zen** مجاني (nemotron-3-ultra, deepseek-v4-flash) — يعمل لكنه محدود بالـ quota والـ context
- **المطلوب منك:** استغلال موديلات frontier على arena.ai بدل الاعتماد على المجاني فقط

## 2) ماذا أنجزنا في هذه الجلسة (أساس قوي)

- أنشئ `tools/arena-ai-mcp/` — مشروع مستقل Node+TS+Playwright
  - `src/config.ts:1` — selectors حقيقية: `textarea[placeholder="Ask anything…"]`، combobox Direct
  - `src/arena-client.ts:7` — Playwright lazy-init + حفظ `browser-state.json` في `~/.arena-ai-mcp/sessions/`
  - `src/tools.ts:23` — 6 أدوات MCP: `arena_chat`, `arena_list_models`, `arena_new_chat`, `arena_get_history`...
  - `src/index.ts:1` — stdio MCP + `zod-to-json-schema` (كان سبب فشل `Failed to get tools`)
  - `src/http.ts:1` — HTTP `127.0.0.1:8787` للإضافات (`POST /api/chat`)
- سجل في `~/.config/opencode/opencode.jsonc:187` → `opencode mcp list` = `✓ arena-ai connected`
- اكتشف الحاجز: arena.ai يعرض `Log In or Create Account | Continue with Google` بعد أول إرسال — يتطلب login لمرة واحدة

## 3) خلاصة التشاور مع النماذج المتقدمة (محاكاة arena.ai)

> طرحنا على النماذج: "كيف نطوّر ElArabyDev ليستفيد من frontier models بأقل احتكاك مع بوابات الإنتاج؟"

**توصيات النماذج (ملخص 3 آراء):**

| النموذج | التركيز | التوصية |
|---|---|---|
| **GPT-5 / Claude 4** | أمان الإنتاج | افصل AI عن DOM المباشر — `shared/ai-client` يصبح موحّد مع provider قابل للتبديل (zen ↔ arena) ولا يلمس selectors إلا عبر `portal-config` |
| **Gemini 3 Pro** | قابلية التوسع | اجعل arena-ai-mcp هو **الواجهة الوحيدة** لكل AI — الإضافة + opencode يستهلكان HTTP/MCP نفسه، لا تكرر المنطق في `background.js` |
| **Grok / DeepSeek** | سرعة التسليم | ابدأ بـ **MVP عمودي واحد**: تبويب "آخرى" المالية (local-analyzer → arena_chat) لأنه معزول عن البورتال الحي — يثبت القيمة بدون مخاطرة |

**الإجماع:** لا تبنِ أتمتة browser لكل تبويب — ابنِ **طبقة AI موحّدة** ثم اربطها تدريجياً.

## 4) الخطة المقترحة — 3 موجات (تعرض عليك قبل التنفيذ)

### الموجة 0 — تفعيل كامل (30 دقيقة، لا كود منتج)
- [ ] شغّل `node login.mjs` في `tools/arena-ai-mcp` (headful) وسجّل دخولك مرة واحدة → يحفظ `~/.arena-ai-mcp/sessions/browser-state.json`
- [ ] اختبر: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"arena_chat","arguments":{"prompt":"Hello","newSession":true}}}' | node dist/index.js` → يجب أن يعود `text`
- [ ] تحقق: `opencode mcp list` يبقى ✓

### الموجة 1 — طبقة AI موحّدة (MVP — يوم واحد)
- [ ] توسيع `shared/ai-client` ليختار provider: `if (arenaAvailable) use http://127.0.0.1:8787 else use zen` — بدون كسر الكود الحالي
- [ ] ربط تبويب "آخرى" `src/unified-extension/features/financial/ai-insights.js:1` بـ arena عبر HTTP بدلا من Ollama المحلي فقط — اختبار محلي على بيانات وهمية
- [ ] تشغيل `tools/deploy.ps1` + `opencode mcp list` للتحقق

### الموجة 2 — تعميم على كل المنتجات (أسبوع)
- [ ] `ai/chat-panel` + `smart-scheduler` على البورتال يستهلكان نفس الطبقة
- [ ] إضافة `arena` كـ provider في `opencode.jsonc` ليستخدمه كل الوكلاء (`plan` → nemotron، `build` → arena عبر MCP)
- [ ] E2E حي على `E2E_CHECKLIST.md:7` سيناريوهات

### الموجة 3 — اختيارية
- [ ] نفق `chrome.storage` ↔ HTTP للعمل حتى بدون تشغيل `node http.js` يدوياً (auto-start من background)

## 5) ما المطلوب منك الآن

1. **هل توافق على الموجة 0-1 كبداية؟** (نعم / عدّل / أضف)
2. **هل تريد تسجيل الدخول الآن؟** شغّل:
   ```
   cd "E:\My First Lap\MY WORKE\Apps\ElArabyDev\tools\arena-ai-mcp"
   node login.mjs
   ```
   ثم اتبع التعليمات (Google/email) واضغط Enter بعد النجاح
3. بعدها ننفذ الموجة 1 فوراً ونعرض النتيجة قبل الموجة 2

> ملاحظة: حتى بدون login، الـ MCP يبقى صالحاً لأدوات لا تحتاج chat (`arena_list_sessions`, `arena_get_history`) — لكن `arena_chat` سيعيد `requires login` حتى تُتم الخطوة 0.

## 6) بديل فوري إذا أردت التجربة الآن بدون arena

يمكننا استشارة `opencode/nemotron-3-ultra-free` و `deepseek-v4-flash-free` المتاحين حالياً لتوليد أفكار للـ roadmap — لكن للوصول لـ frontier الحقيقي (GPT-5/Claude 4) نحتاج إتمام login.

---
**جاهز للتنفيذ بعد موافقتك.**
