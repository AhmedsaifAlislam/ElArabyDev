/**
 * run-tests.js — اختبارات وحدة للأساس (Foundation)
 * يشغّل الملفات الحقيقية من src/unified-extension داخل محاكاة chrome (Node).
 *
 * يُغطّي الوحدات التي ما زالت مستخدمة فعليًا:
 *   1. shared/ai-client.js      — سجل الأدوات + الجلسات + تنفيذ الأدوات
 *   2. shared/n8n-client.js     — الإرسال إلى n8n + تفعيل التصدير التلقائي
 *   3. ai/smart-ai-tools.js     — الأدوات الثلاث المسجّلة فعلًا للمساعد
 *   4. shared/problem-codes.js  — تصنيف العائلة + منع الأكواد الممنوعة
 *   5. shared/arabic-utils.js   — أدوات النص العربي
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
        // محاكاة background: N8N_SEND ينجح دائمًا
        if (msg && msg.type === 'N8N_SEND') {
          chrome.__sentEvents = chrome.__sentEvents || [];
          chrome.__sentEvents.push({
            event: msg.payload.event,
            data: msg.payload.data || {},
            ts: msg.payload.ts || Date.now()
          });
          return { ok: true, status: 200 };
        }
        if (msg && msg.type === 'AI_CHAT') {
          return { ok: true, text: 'رد تجريبي', model: 'test-model' };
        }
        return { ok: false, error: 'UNKNOWN_MESSAGE' };
      },
      lastError: null,
      connect: () => { throw new Error('no port in tests'); },
      getURL: (p) => 'https://extension.test/' + String(p || '').replace(/^\/+/, '')
    },
    __sentEvents: []
  };
  return chrome;
}

function createLocalStorageMock() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    __data: data
  };
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
    TextDecoder, TextEncoder, URL, Date, Math, JSON, Promise, Map, Set, RegExp, String, Number, Object, Array,
    chrome,
    localStorage: createLocalStorageMock(),
    globalThis: null
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    createEvent: () => ({ initEvent: () => {} })
  };
  ctx.location = { href: 'https://elarabyportalpfs.powerappsportals.com/incidents/?id=abc123' };
  return ctx;
}

async function main() {
  console.log('=== اختبارات وحدة للأساس — El Araby Unified ===\n');

  // ── 1) AI Client: سجل الأدوات + الجلسات ──
  console.log('▶ shared/ai-client.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/ai-client.js');

    assert(typeof ctx.aiRegisterTool === 'function', 'aiRegisterTool متاحة');
    assert(typeof ctx.aiListTools === 'function', 'aiListTools متاحة');
    assert(typeof ctx.aiRunTool === 'function', 'aiRunTool متاحة');
    assert(typeof ctx.aiRemember === 'function' && typeof ctx.aiRecall === 'function', 'aiRemember/aiRecall متاحتان');
    assert(ctx.SmartAI && ctx.SmartAI.MODELS, 'SmartAI.MODELS موجود');

    ctx.aiRegisterTool('test_tool', 'أداة اختبار', async (args) => ({ echo: args && args.x }));
    const tools = ctx.aiListTools();
    assert(tools.length === 1 && tools[0].name === 'test_tool', 'الأداة سُجّلت وظهرت في listTools');

    const run = await ctx.aiRunTool('test_tool', { x: 5 });
    assert(run.ok === true && run.result.echo === 5, 'aiRunTool ينفّذ الأداة ويعيد نتيجتها');

    const missing = await ctx.aiRunTool('nope_tool', {});
    assert(missing.ok === false && !!missing.error, 'aiRunTool يعيد خطأ واضحًا لأداة غير مسجّلة');

    ctx.aiRemember('s1', 'user', 'مرحبا');
    ctx.aiRemember('s1', 'assistant', 'أهلاً');
    assert(ctx.aiRecall('s1', 5).length === 2, 'aiRecall يسترجع رسائل الجلسة');
    assert(ctx.aiRecall('s1', 1).length === 1, 'aiRecall يحترم حد الرسائل المطلوب');

    // السجل في الذاكرة فقط — لا يجب أن يتسرب بين الجلسات
    ctx.aiRemember('s2', 'user', 'جلسة أخرى');
    assert(ctx.aiRecall('s1', 5).length === 2 && ctx.aiRecall('s2', 5).length === 1, 'الجلسات منفصلة عن بعضها');
  }

  // ── 2) n8n Client ──
  console.log('\n▶ shared/n8n-client.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/n8n-client.js');

    assert(typeof ctx.n8nSend === 'function', 'n8nSend متاحة');
    assert(typeof ctx.n8nAutoExportEnabled === 'function', 'n8nAutoExportEnabled متاحة');
    assert(typeof ctx.n8nReady === 'function', 'n8nReady متاحة');

    const r = await ctx.n8nSend('excel_export', { filename: 'a.xlsx', rowCount: 5 });
    assert(r.ok === true && r.status === 200, 'n8nSend ينجح عند استجابة background');
    assert(chrome.__sentEvents.length === 1 && chrome.__sentEvents[0].event === 'excel_export', 'الحدث وصل عبر N8N_SEND باسمه الصحيح');
    assert(chrome.__sentEvents[0].data.rowCount === 5, 'بيانات الحدث تصل كاملة');

    assert((await ctx.n8nReady()) === false, 'بدون webhook: n8nReady=false');
    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook', autoExport: true } });
    assert((await ctx.n8nReady()) === true, 'مع webhook: n8nReady=true');
    assert((await ctx.n8nAutoExportEnabled()) === true, 'autoExport=true يُفعّل التصدير التلقائي');
    await chrome.storage.local.set({ n8n: { webhookUrl: 'https://example.com/webhook', autoExport: false } });
    assert((await ctx.n8nAutoExportEnabled()) === false, 'autoExport=false يُعطّله');
  }

  // ── 3) smart-ai-tools: الأدوات المسجّلة فعلًا ──
  console.log('\n▶ ai/smart-ai-tools.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    ctx.storageGet = async (keys) => chrome.storage.local.get(keys);
    ctx.storageSet = async (items) => { await chrome.storage.local.set(items); };
    await chrome.storage.local.set({ slErrors: [{ message: 'x' }, { message: 'y' }] });

    loadScript(ctx, 'shared/ai-client.js');
    loadScript(ctx, 'ai/smart-ai-tools.js');
    await new Promise(r => setTimeout(r, 100));

    const names = ctx.aiListTools().map(t => t.name);
    assert(names.includes('read_smart_log'), 'read_smart_log مسجّلة');
    assert(names.includes('read_validation_patterns'), 'read_validation_patterns مسجّلة');
    assert(names.includes('get_page_state'), 'get_page_state مسجّلة');

    const log = await ctx.aiRunTool('read_smart_log', { kind: 'errors' });
    assert(log.ok === true && log.result.total === 2, 'read_smart_log يقرأ الأخطاء من التخزين');

    const state = await ctx.aiRunTool('get_page_state', {});
    assert(state.ok === true && state.result.incidentId === 'abc123', 'get_page_state يستخرج رقم البلاغ من الرابط');
  }

  // ── 4) problem-codes: تصنيف العائلة + منع الممنوع ──
  console.log('\n▶ shared/problem-codes.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/problem-codes.js');

    const PC = ctx.ProblemCodes;
    assert(!!PC && typeof PC.familyOf === 'function', 'ProblemCodes متاح');

    assert(PC.familyOf('غسالة أطباق') === 'WM' || PC.familyOf('غسالة') === 'WM', 'تصنيف الغسالة → WM');
    assert(PC.familyOf('ثلاجة') === 'GR', 'تصنيف الثلاجة → GR');
    assert(PC.familyOf('') === '', 'اسم فارغ → عائلة فارغة');
    assert(PC.familyOf('شيء غير معروف') === '', 'اسم غير معروف → عائلة فارغة');

    assert(PC.isForbidden('WM04') === true, 'WM04 ممنوع افتراضيًا');
    assert(PC.isForbidden('GS08') === true, 'GS08 ممنوع افتراضيًا');
    assert(PC.isForbidden('WM05') === false, 'WM05 غير ممنوع');

    const allowed = PC.filterAllowed(['WM05', 'WM04', 'GS08', '  ', null, 'GR01']);
    assert(allowed.length === 2 && allowed.includes('WM05') && allowed.includes('GR01'), 'filterAllowed يحذف الممنوع والفارغ');

    assert(PC.codeOf('WM05 - مشكلة') === 'WM05', 'codeOf يستخرج الكود من النص');
    assert(PC.isKnownCode('كود وهمي') === false, 'isKnownCode يرفض كودًا غير موجود');
  }

  // ── 5) arabic-utils ──
  console.log('\n▶ shared/arabic-utils.js');
  {
    const chrome = createChromeMock();
    const ctx = freshContext(chrome);
    loadScript(ctx, 'shared/arabic-utils.js');

    assert(ctx.hasArabic('مرحبا') === true, 'hasArabic تتعرف على العربي');
    assert(ctx.hasArabic('hello') === false, 'hasArabic ترفض الإنجليزي');
    assert(ctx.toEnglishNumbers('١٢٣') === '123', 'toEnglishNumbers تحوّل الأرقام العربية');
    assert(ctx.toArabicNumbers('123') === '١٢٣', 'toArabicNumbers تحوّل للأرقام العربية');
    assert(typeof ctx.cleanArabicText('  نص  ') === 'string', 'cleanArabicText تعمل');
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
