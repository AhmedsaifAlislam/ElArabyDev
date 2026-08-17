/**
 * run-tests.js — اختبارات وحدة لطبقة AI + n8n Foundation
 * يشغّل الملفات الحقيقية من src/unified-extension في محاكاة chrome (Node)
 *
 * التشغيل:  node tools/tests/run-tests.js
 * يعيد:  ✅/❌ لكل مجموعة + exit code (0 = نظيف)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT_ROOT = path.join(__dirname, '..', '..', 'src', 'unified-extension');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) { passed++; console.log('  ✅ ' + label); }
  else { failed++; failures.push(label); console.log('  ❌ ' + label); }
}

// ── محاكاة chrome ──
function createChromeMock() {
  const store = {};
  const chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const defaults = typeof keys === 'object' && keys !== null && !Array.isArray(keys) ? keys : {};
          const keysArr = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(defaults));
          const out = {};
          for (const k of keysArr) out[k] = (k in store) ? JSON.parse(JSON.stringify(store[k])) : (defaults[k] !== undefined ? defaults[k] : undefined);
          return out;
        },
        set: async (items) => { Object.assign(store, JSON.parse(JSON.stringify(items))); },
        remove: async (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); }
      }
    },
    runtime: {
      sendMessage: async (msg) => {
        // محاكاة background: N8N_SEND ينجح دائماً (بترتيب محدد), AI_CHAT يعيد رداً
        if (msg && msg.type === 'N8N_SEND') {
          chrome.__sentEvents = chrome.__sentEvents || [];
          // محاكاة background.handleN8nSend: يضيف meta ويبني الـ payload النهائي
          chrome.__sentEvents.push({
            event: msg.payload.event,
            eventId: msg.payload.eventId || null,
            data: msg.payload.data || {},
            meta: { source: 'elaraby-unified', ts: msg.payload.ts || Date.now(), env: 'production' }
          });
          return { ok: true, status: 200 };
        }
        if (msg && msg.type === 'N8N_QUEUE_STATUS') {
          const outbox = store['n8nOutbox'] || [];
          const log = store['n8nEventLog'] || [];
          return { ok: true, queued: outbox.length, eventLog: log.slice(0, 30) };
        }
        if (msg && msg.type === 'AI_GET_USAGE') {
          return { ok: true, stats: { calls: 3, tokens: 100, ok: 2, fail: 1, byModel: { 'deepseek-v4-flash-free': { calls: 2, tokens: 50 } } } };
        }
        if (msg && msg.type === 'AI_CHAT') {
          return { ok: true, text: 'رد تجريبي', model: 'opencode/deepseek-v4-flash-free' };
        }
        return { ok: false, error: 'UNKNOWN_MESSAGE' };
      },
      lastError: null,
      connect: () => { throw new Error('no port in tests'); }
    },
    __sentEvents: []
  };
  return chrome;
}

function loadScript(ctx, relPath) {
  const full = path.join(EXT_ROOT, relPath);
  const code = fs.readFileSync(full, 'utf8');
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: relPath });
  return ctx;
}

function freshContext(chrome) {
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextDecoder, TextEncoder, URL, Date, Math, JSON, Promise,
    chrome,
    globalThis: null
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  return ctx;
}

async function main() {
  console.log('=== AI + n8n Foundation — اختبارات الوحدة ===\n');

  // ── 1) n8n Event Bus ──
  console.log('▶ n8n-event-bus.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/n8n-event-bus.js');

    assert(typeof ctx.n8nEmit === 'function', 'n8nEmit متاحة');
    assert(typeof ctx.n8nFlushOutbox === 'function', 'n8nFlushOutbox متاحة');
    assert(typeof ctx.n8nQueueStatus === 'function', 'n8nQueueStatus متاحة');
    assert(ctx.N8nEventBus && ctx.N8nEventBus.REGISTRY && ctx.N8nEventBus.REGISTRY.excel_export, 'سجل الأحداث يحتوي excel_export');

    // بدون webhook: يسجّل محلياً فقط
    const r1 = await ctx.n8nEmit('test', { message: 'x' });
    assert(r1.queued === false, 'بدون webhook: queued=false');
    let st = await ctx.n8nQueueStatus();
    assert(st.eventLog.length === 1, 'السجل المحلي يحتوي الحدث');

    // مع webhook: يدخل الطابور
    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook' } });
    const r2 = await ctx.n8nEmit('excel_export', { filename: 'a.xlsx', rowCount: 5 });
    assert(r2.queued === true, 'مع webhook: queued=true');
    st = await ctx.n8nQueueStatus();
    assert(st.queued === 1, 'الطابور يحتوي حدثاً واحداً');

    // dedupe: نفس الحدث لا يتكرر
    await ctx.n8nEmit('excel_export', { filename: 'a.xlsx' }, { eventId: r2.id });
    st = await ctx.n8nQueueStatus();
    assert(st.queued === 1, 'dedupe: نفس eventId لا يتكرر في الطابور');

    // flush ناجح → يفرّغ الطابور ويرسل عبر background
    const flush = await ctx.n8nFlushOutbox();
    assert(flush.flushed === 1 && flush.remaining === 0, 'flush ناجح: أُرسل 1 وبقي 0');
    assert(chrome.__sentEvents && chrome.__sentEvents.length === 1, 'background استلم حدث N8N_SEND');
    assert(chrome.__sentEvents[0].eventId === r2.id, 'الـ eventId يمر للـ webhook (dedupe في n8n)');
    assert(chrome.__sentEvents[0].meta && chrome.__sentEvents[0].meta.source === 'elaraby-unified', 'meta.source موحد');

    // autoForward=false في الإعدادات → لا يدخل الطابور
    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook', autoForward: false } });
    await ctx.n8nEmit('booking_done', { id: 1 });
    st = await ctx.n8nQueueStatus();
    assert(st.queued === 0, 'autoForward=false: لا يدخل الطابور');
    assert(st.eventLog.length >= 2, 'لكنه ما زال يُسجَّل محلياً');

    // سقف السجل (200)
    for (let i = 0; i < 220; i++) await ctx.n8nEmit('test', { i });
    st = await ctx.n8nQueueStatus();
    assert(st.eventLog.length <= 200, 'سقف السجل المحلي ≤ 200');
  }

  // ── 2) n8n Client ──
  console.log('\n▶ n8n-client.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/n8n-event-bus.js');
    loadScript(ctx, 'shared/n8n-client.js');

    assert(typeof ctx.n8nSend === 'function', 'n8nSend متاحة (توافق)');
    assert(typeof ctx.n8nEmit === 'function', 'n8nEmit متاحة');
    assert(typeof ctx.n8nFlushOutbox === 'function', 'n8nFlushOutbox متاحة');

    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook', autoExport: true } });
    const auto = await ctx.n8nAutoExportEnabled();
    assert(auto === true, 'n8nAutoExportEnabled يعمل');

    const r = await ctx.n8nEmit('excel_export', { filename: 'x.xlsx' });
    assert(r.queued === true, 'n8nEmit عبر العميل يوجّه للـ event bus');
  }

  // ── 3) AI Client v2 ──
  console.log('\n▶ ai-client.js (Tool Registry v2 + جلسات)');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/ai-client.js');

    assert(typeof ctx.aiRegisterTool === 'function', 'aiRegisterTool متاحة');
    assert(typeof ctx.aiListTools === 'function', 'aiListTools متاحة');
    assert(typeof ctx.aiGetUsage === 'function', 'aiGetUsage متاحة');
    assert(typeof ctx.aiResetSession === 'function', 'aiResetSession متاحة');
    assert(ctx.SmartAI && ctx.SmartAI.MODELS && ctx.SmartAI.MODELS['core-coding'], 'SmartAI.MODELS موجود');

    // تسجيل أداة مع JSON Schema
    ctx.aiRegisterTool('test_tool', 'أداة اختبار', async () => ({ ok: true }), {
      type: 'object',
      properties: { date: { type: 'string' } },
      required: ['date']
    });
    const tools = ctx.aiListTools();
    assert(tools.length === 1, 'الأداة سُجّلت');
    const t = tools[0];
    assert(t.parameters && t.parameters.required && t.parameters.required[0] === 'date', 'listTools تحمل JSON Schema');

    // جلسات دائمة (تخزين)
    ctx.aiRemember('test-session', 'user', 'مرحبا');
    ctx.aiRemember('test-session', 'assistant', 'أهلاً');
    const recalled = ctx.aiRecall('test-session', 5);
    assert(recalled.length === 2, 'aiRecall يسترجع الرسائل');
    const stored = await chrome.storage.local.get({ aiSessions: {} });
    assert(stored.aiSessions && stored.aiSessions['test-session'] && stored.aiSessions['test-session'].length === 2, 'الجلسة حُفظت في storage (دائمة)');
    ctx.aiResetSession('test-session');
    const stored2 = await chrome.storage.local.get({ aiSessions: {} });
    assert(!stored2.aiSessions['test-session'], 'aiResetSession يمسح الجلسة من storage');

    // aiGetUsage عبر background
    const usage = await ctx.aiGetUsage();
    assert(usage.ok && usage.stats.calls === 3, 'aiGetUsage يقرأ الإحصائيات من background');
  }

  // ── 4) AI Prompts ──
  console.log('\n▶ ai-prompts.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/ai-prompts.js');

    assert(ctx.ELARABY_PROMPTS && typeof ctx.ELARABY_PROMPTS.get === 'function', 'ELARABY_PROMPTS متاح');
    const g = ctx.ELARABY_PROMPTS.get('general');
    assert(g.system && g.model && g.maxTokens > 0, 'قالب general مكتمل');
    const fin = ctx.ELARABY_PROMPTS.get('financial');
    assert(fin.model === 'nemotron-3-ultra-free', 'financial يوجّه لنموذج Nemotron');
    const built = ctx.ELARABY_PROMPTS.build('portal', { page: 'New Incident' });
    assert(typeof built === 'string' && built.length > 10, 'build يحقن المتغيرات');
    const list = ctx.ELARABY_PROMPTS.list();
    assert(list.length >= 8, '8 قوالب على الأقل');
  }

  // ── 5) smart-ai-tools (تكامل تسجيل الأدوات) ──
  console.log('\n▶ ai/smart-ai-tools.js (تكامل)');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    // محاكاة DOM و storageGet
    ctx.document = { querySelector: () => null };
    ctx.location = { href: 'https://elarabyportalpfs.powerappsportals.com/incidents/?id=abc123' };
    ctx.storageGet = async (keys) => {
      const d = await chrome.storage.local.get(keys);
      return d;
    };
    ctx.storageSet = async (items) => { await chrome.storage.local.set(items); };
    loadScript(ctx, 'shared/ai-client.js');
    loadScript(ctx, 'shared/n8n-event-bus.js');
    loadScript(ctx, 'shared/n8n-client.js');
    loadScript(ctx, 'ai/smart-ai-tools.js');
    await new Promise(r => setTimeout(r, 600)); // انتظار تسجيل الأدوات

    const tools = ctx.aiListTools();
    const names = tools.map(t => t.name);
    assert(names.includes('read_smart_log'), 'read_smart_log مسجلة');
    assert(names.includes('emit_n8n_event'), 'emit_n8n_event مسجلة');
    assert(names.includes('get_usage_stats'), 'get_usage_stats مسجلة');
    assert(names.includes('list_ai_tools'), 'list_ai_tools مسجلة');
    const emitTool = tools.find(t => t.name === 'emit_n8n_event');
    assert(emitTool.parameters && emitTool.parameters.required.includes('event'), 'emit_n8n_event بمعايير JSON Schema');

    // تنفيذ emit_n8n_event عبر aiRunTool
    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook' } });
    const res = await ctx.aiRunTool('emit_n8n_event', { event: 'booking_done', data: { id: 7 } });
    assert(res.ok === true, 'aiRunTool(emit_n8n_event) يعمل');
    const st = await ctx.n8nQueueStatus();
    assert(st.queued === 1, 'حدث AI دخل طابور n8n');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`النتيجة: ${passed} نجح • ${failed} فشل`);
  if (failed) {
    console.log('الفشل:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('✅ كل الاختبارات نجحت');
}

main().catch(e => {
  console.error('خطأ في التشغيل:', e);
  process.exit(1);
});
