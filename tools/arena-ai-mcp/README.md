# Arena AI MCP + HTTP

أساس قوي يتكامل مع كل مشروعات `opencode` ويُعاد استخدامه في الإضافات.

## البنية

```
opencode  ──stdio──>  arena-ai-mcp (Playwright -> https://arena.ai/text/direct)
extension ──HTTP──>  arena-ai-mcp (http://127.0.0.1:8787)
```

## الملفات

- `src/config.ts` — selectors فعلية (textarea Ask anything… + combobox Direct)
- `src/session-manager.ts` — حفظ الجلسات في `~/.arena-ai-mcp/sessions/`
- `src/arena-client.ts` — Playwright automation
- `src/tools.ts` — أدوات MCP
- `src/index.ts` — MCP stdio server (lazy init)
- `src/http.ts` — HTTP server للإضافات

## تشغيل MCP (لـ opencode)

مُسجل في `~/.config/opencode/opencode.jsonc`:
```jsonc
"arena-ai": {
  "type": "local",
  "command": ["node", "dist/index.js"],
  "cwd": "E:/My First Lap/MY WORKE/Apps/ElArabyDev/tools/arena-ai-mcp",
  "enabled": true,
  "environment": { "ARENA_HEADLESS": "true" }
}
```
تحقق: `opencode mcp list` → `✓ arena-ai connected`

أدوات MCP:
- `arena_chat` {prompt, model?, systemPrompt?, sessionId?, newSession?, stream?}
- `arena_list_models` {refresh?}
- `arena_new_chat` {sessionId?}
- `arena_get_history` {sessionId, limit?}
- `arena_debug_page` / `arena_debug_models` (تشخيص)

## تشغيل HTTP (للإضافة)

```bash
cd tools/arena-ai-mcp
npm run build
npm run start:http          # http://127.0.0.1:8787
# أو
ARENA_HTTP_PORT=8787 ARENA_HEADLESS=true node dist/http.js
```

Endpoints:
```
GET  /health
GET  /api/models?refresh=true
POST /api/chat  {prompt, model?, systemPrompt?, sessionId?, newSession?, stream?}
GET  /api/sessions
GET  /api/history/:sessionId?limit=20
DELETE /api/sessions/:sessionId
POST /api/debug/page
POST /api/debug/models
```

مثال:
```bash
curl -X POST http://127.0.0.1:8787/api/chat -H "Content-Type: application/json" -d '{"prompt":"اكتب دالة JS تحسب ضريبة","newSession":true}'
```

## الاستخدام من الإضافة (مستقبلاً)

```js
// src/unified-extension/background.js أو shared/ai-client.js
async function arenaChat(prompt, opts={}) {
  const res = await fetch('http://127.0.0.1:8787/api/chat', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ prompt, ...opts, newSession: true })
  });
  return res.json(); // {text, model, sessionId}
}
```

## ملاحظات arena.ai

- الواجهة تستخدم Radix Combobox للـ Mode (Direct/Battle/Agent/Side by Side) — ليس اختيار model مباشر.
- النماذج قد تُحدد تلقائياً حسب Mode؛ `arena_list_models` يعود فارغاً حالياً حتى نكتشف selector الصحيح.
- الإرسال: `textarea[placeholder="Ask anything…"]` + `Enter` (الزر يبقى disabled حتى input event).

## متطلبات

- Node >=20, `npx playwright install chromium` (تم)
- `ARENA_HEADLESS=false` للتصحيح المرئي
