// =========================================================
// background.js — Portal AutoFiller v2.0
// =========================================================

'use strict';

// ── Shared libs (booking / قطع الغيار layer + parsing) ──
importScripts(
  'lib/xlsx.full.min.js',
  'lib/papaparse.min.js',
  'shared/arabic-utils.js',
  'shared/data-mapper.js',
  'shared/db.js',
  'shared/smart-log.js',
  'shared/n8n-event-bus.js'
);

// ══════════════════════════════════════════════════════════
//  📡 WebRequest Interceptor — DateFilter Unlocker v2
//  ⚠️ مُعطَّل نهائيًا — webRequestBlocking مرفوض في Edge
//  (غير مسموح به إلا للإضافات المثبتة عبر ExtensionInstallForcelist)
//  وكان يضيّق نطاق عرض المستخدم بدل توسيعه.
//  الاعتراض يتم الآن من سكربت المحتوى (MAIN world) فقط.
// ══════════════════════════════════════════════════════════
const EAU_AUTO_EXPAND_DAYS = 30;

if (false) {
  // محجوب — لا يُسجَّل أي listener (يمنع أخطاء Edge)
}

function toEauInputDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MAX_REPORTS = 200;
const MAX_VALIDATION_PATTERNS = 2000;

// ── Periodic n8n Outbox flush (alarms) ──
if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== 'n8n-outbox-flush') return;
    globalThis.n8nFlushOutbox && globalThis.n8nFlushOutbox().catch(() => {});
    emitSmartLogNetworkBatch().catch(() => {});
  });
}

chrome.runtime.onStartup.addListener(() => { ensureN8nFlushAlarm(); });
chrome.runtime.onInstalled.addListener(() => { ensureN8nFlushAlarm(); });

function ensureN8nFlushAlarm() {
  try {
    chrome.alarms.create('n8n-outbox-flush', { periodInMinutes: 5 });
  } catch (_) {}
}

// ── One-time migration: telemetryLogs → smartLogs ──────
(async function migrateOldStorage() {
  let { _migrated_v1_to_v2 } = await chrome.storage.local.get('_migrated_v1_to_v2');
  if (_migrated_v1_to_v2) return;

  const { telemetryLogs } = await chrome.storage.local.get({ telemetryLogs: [] });
  const { smartLogs } = await chrome.storage.local.get({ smartLogs: [] });
  const oldLogs = [...(smartLogs || []), ...(telemetryLogs || [])];

  if (oldLogs.length) {
    const manual = [], automated = [], errors = [], events = [];
    oldLogs.forEach(e => {
      if (e.eventType === 'FIELD_CHANGE') {
        (e.isAutomated ? automated : manual).push(e);
      } else if (['NETWORK_ERROR','VALIDATION_WARNING','CLIENT_VALIDATION_ERROR','PAGE_ERROR'].includes(e.eventType)) {
        errors.push(e);
      } else {
        events.push(e);
      }
    });
    await chrome.storage.local.set({
      slManualChanges: manual.slice(-5000),
      slAutomatedChanges: automated.slice(-5000),
      slErrors: errors.slice(-2000),
      slEvents: events.slice(-5000)
    });
  }

  await chrome.storage.local.remove(['telemetryLogs', 'smartLogs']);
  await chrome.storage.local.set({ _migrated_v1_to_v2: true });
  console.log('Migrated to 4-key storage:', oldLogs.length, 'total events');
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  switch (msg.type) {

    case 'SAVE_REPORT':
      handleSaveReport(msg.payload).then(sendResponse);
      return true;

    case 'GET_REPORTS':
      handleGetReports(msg.filter).then(sendResponse);
      return true;

    case 'CLEAR_REPORTS':
      chrome.storage.local.set({ autoReports: [] }, () => sendResponse({ ok: true }));
      return true;

    // Forward STATUS_UPDATE from content-script to popup
    case 'STATUS_UPDATE':
      chrome.runtime.sendMessage(msg).catch(() => {});
      sendResponse({ ok: true });
      return true;
      
    case 'NEW_LOG':
      chrome.runtime.sendMessage(msg).catch(() => {});
      sendResponse({ ok: true });
      return true;

    // إشعار عام من الأدوات (حارس الجلسة وغيره)
    case 'EA_NOTIFY':
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: String(msg.title || 'تنبيه'),
        message: String(msg.message || ''),
        priority: 2
      }).catch(() => {});
      sendResponse({ ok: true });
      return true;

    // Smart Log Events
    case 'SMART_LOG_EVENT':      handleSmartLogEvent(msg.event).then((r) => {
        // بث للإعلام المباشر (الـ popup المفتوح يتحدث تلقائياً بدون زر)
        chrome.runtime.sendMessage({ type: 'SMART_LOG_UPDATED' }).catch(() => {});
        if (r && r.notify) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '🚨 خطأ متكرر في اللوج الذكي',
            message: r.notify,
            priority: 2
          }).catch(() => {});
        }
        sendResponse(r);
      });
      return true;

    case 'RESTORE_SMART_LOG': {
      const p = msg.payload || {};
      chrome.storage.local.set({
        slManualChanges: p.manual || [],
        slAutomatedChanges: p.automated || [],
        slErrors: p.errors || [],
        slEvents: p.events || [],
        slNetwork: p.network || []
      }, () => sendResponse({ ok: true }));
      return true;
    }
      
    case 'GET_SMART_LOG':
      chrome.storage.local.get({ slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [], slNetwork: [] }, (data) => {
        sendResponse({
          manual: data.slManualChanges || [],
          automated: data.slAutomatedChanges || [],
          errors: data.slErrors || [],
          events: data.slEvents || [],
          network: data.slNetwork || []
        });
      });
      return true;

    case 'CLEAR_SMART_LOG':
      chrome.storage.local.set({ slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [], slNetwork: [] }, () => sendResponse({ ok: true }));
      return true;

    // Validation Pattern Collection (for reporting only)
    case 'STORE_VALIDATION_PATTERN':
      handleStoreValidationPattern(msg.pattern).then(sendResponse);
      return true;

    case 'GET_VALIDATION_PATTERNS':
      handleGetValidationPatterns().then(sendResponse);
      return true;

    case 'CLEAR_VALIDATION_PATTERNS':
      chrome.storage.local.set({ validationPatterns: [] }, () => sendResponse({ ok: true }));
      return true;

    // Batch done in storage — notify popup and show OS notification
    case 'BATCH_DONE_STORAGE':
      chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(() => {});
      chrome.storage.local.get({ taskResults: [] }, ({ taskResults }) => {
        const success = taskResults.filter(r => r.result === 'done').length;
        const failed  = taskResults.filter(r => !['done','opened'].includes(r.result)).length;
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Portal AutoFiller',
          message: `اكتمل Batch. نجح: ${success} | فشل: ${failed}`
        });
      });
      return true;

    // Open next task in a new tab (keeps current tab open)
    case 'OPEN_NEXT_TAB':
      chrome.tabs.create({ url: msg.url, active: true }, (newTab) => {
        if (newTab && newTab.id) {
          chrome.storage.local.set({ processingTabId: newTab.id }, () => {
             sendResponse({ ok: true });
          });
        } else {
          sendResponse({ ok: false });
        }
      });
      return true;

    case 'GET_MY_TAB_ID':
      sendResponse({ tabId: sender.tab?.id });
      return true;

    case 'BATCH_DONE':
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Portal AutoFiller',
        message: `Batch انتهى. نجح: ${msg.success} | فشل: ${msg.failed}`
      });
      return true;

    case 'PING':
      sendResponse({ ok: true, version: '2.0.0' });
      return true;

    // Storage proxy — Edge Tracking Prevention blocks chrome.storage.local from content scripts
    case 'STORAGE_GET':
      chrome.storage.local.get(msg.keys || {}, (data) => {
        sendResponse({ ok: true, data });
      });
      return true;

    case 'STORAGE_SET':
      chrome.storage.local.set(msg.data || {}, () => {
        sendResponse({ ok: true });
      });
      return true;

    case 'STORAGE_REMOVE':
      chrome.storage.local.remove(msg.keys || [], () => {
        sendResponse({ ok: true });
      });
      return true;

    // AI proxy — OpenCode Zen (opencode.ai). الـ API key مخزّن في chrome.storage المحلي فقط.
    case 'AI_CHAT':
      handleAIChat(msg.payload, msg.tabId).then(sendResponse);
      return true;

    // n8n proxy — إرسال الأحداث إلى Webhook (fetch من الـ background لتجاوز CORS)
    case 'N8N_SEND':
      handleN8nSend(msg.payload).then(sendResponse);
      return true;

    // n8n Event Bus — تفريغ طابور الأحداث (من popup / alarms / content)
    case 'N8N_FLUSH':
      (async () => {
        try {
          const res = await globalThis.n8nFlushOutbox();
          sendResponse({ ok: true, ...res });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
      })();
      return true;

    // n8n Event Bus — حالة الطابور + آخر الأحداث
    case 'N8N_QUEUE_STATUS':
      (async () => {
        try {
          const status = await globalThis.n8nQueueStatus();
          sendResponse({ ok: true, ...status });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
      })();
      return true;

    // إحصائيات استخدام الذكاء الاصطناعي
    case 'AI_GET_USAGE':
      chrome.storage.local.get({ aiUsageStats: null }, (data) => {
        sendResponse({ ok: true, stats: data.aiUsageStats || { calls: 0, tokens: 0, ok: 0, fail: 0, byModel: {} } });
      });
      return true;

    case 'AI_RESET_USAGE':
      chrome.storage.local.set({ aiUsageStats: { calls: 0, tokens: 0, ok: 0, fail: 0, byModel: {}, last: null, history: [] } }, () => {
        sendResponse({ ok: true });
      });
      return true;

    // Get CSRF token from the portal page (MAIN world — shell.getTokenDeferred)
    case 'GET_CSRF_TOKEN':

      (async () => {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ token: null }); return; }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => new Promise((resolve) => {
              try {
                if (window.shell && window.shell.getTokenDeferred) {
                  window.shell.getTokenDeferred().done(t => resolve(t || null)).fail(() => resolve(null));
                  return;
                }
                if (window.shell && typeof window.shell.getToken === 'function') {
                  Promise.resolve(window.shell.getToken()).then(t => resolve(t || null)).catch(() => resolve(null));
                  return;
                }
              } catch(e) {}
              const m = document.cookie.match(/__RequestVerificationToken=([^;]+)/);
              resolve(m ? decodeURIComponent(m[1]) : null);
            })
          });
          const token = results && results[0] && results[0].result;
          sendResponse({ token: token || null });
        } catch(e) {
          sendResponse({ token: null });
        }
      })();
      return true;

    // ── Script Injection for Tampermonkey Runner (CSP-compliant) ──
    case 'INJECT_SCRIPT_FILE': {
      const tabId = sender.tab?.id;
      if (!tabId) { sendResponse({ ok: false, error: 'No tab' }); return true; }
      (async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: msg.allFrames ?? false },
            world: msg.world || 'MAIN',
            files: [chrome.runtime.getURL(msg.source)]
          });
          sendResponse({ ok: true });
        } catch (e) {
          console.error('[BG] Inject file failed:', msg.source, e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }

    case 'INJECT_SCRIPT_CODE': {
      const tabId = sender.tab?.id;
      if (!tabId) { sendResponse({ ok: false, error: 'No tab' }); return true; }
      (async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: msg.allFrames ?? false },
            world: msg.world || 'MAIN',
            func: (code) => {
              const script = document.createElement('script');
              script.textContent = code;
              if (document.documentElement) {
                document.documentElement.appendChild(script);
                script.remove();
              }
            },
            args: [msg.code]
          });
          sendResponse({ ok: true });
        } catch (e) {
          console.error('[BG] Inject code failed:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
  }
});

async function handleSaveReport(report) {
  try {
    const data = await chrome.storage.local.get({ autoReports: [] });
    const arr  = data.autoReports || [];
    arr.push({ ...report, savedAt: Date.now() });
    await chrome.storage.local.set({ autoReports: arr.slice(-MAX_REPORTS) });
    return { ok: true, total: arr.length };
  } catch (e) {
    console.error('[AutoFiller BG] Save error:', e);
    return { ok: false, error: String(e) };
  }
}

async function handleGetReports(filter = {}) {
  try {
    const { autoReports } = await chrome.storage.local.get({ autoReports: [] });
    let arr = autoReports || [];
    if (filter?.customer) arr = arr.filter(r => (r.customer || '').includes(filter.customer));
    if (filter?.since)    arr = arr.filter(r => r.savedAt >= filter.since);
    return { ok: true, reports: arr };
} catch (e) {
    return { ok: false, error: String(e), reports: [] };
  }
}

async function handleSmartLogEvent(event) {
  try {
    const key = event.eventType === 'FIELD_CHANGE'
      ? (event.isAutomated ? 'slAutomatedChanges' : 'slManualChanges')
      : (event.eventType === 'NETWORK_REQUEST'
        ? 'slNetwork'
        : (['NETWORK_ERROR','VALIDATION_WARNING','CLIENT_VALIDATION_ERROR','PAGE_ERROR'].includes(event.eventType)
          ? 'slErrors' : 'slEvents'));
    const max = key === 'slErrors' ? 2000 : key === 'slNetwork' ? 3000 : 5000;
    const data = await chrome.storage.local.get({ [key]: [] });
    const arr = data[key] || [];
    arr.push(event);
    if (arr.length > max) arr.splice(0, arr.length - max);
    await chrome.storage.local.set({ [key]: arr });

    // 🚨 كشف الشذوذ: نفس الخطأ تكرر ≥ 5 مرات خلال آخر 30 حدث → إشعار نظامي
    let notify = null;
    if (key === 'slErrors') {
      const detail = event.errorText || event.message || event.url || event.eventType;
      const recent = arr.slice(-30).filter(e => (e.errorText || e.message || e.url || e.eventType) === detail);
      if (recent.length >= 5) {
        notify = `الخطأ "${String(detail).slice(0, 70)}" تكرر ${recent.length} مرات في آخر 30 حدث.`;
      }
    }

    // 🔗 ناقل n8n: كل حدث غير شبكي يُبث (الشبكة تُرسل مدمجة دورياً لتجنب الإغراق)
    if (typeof globalThis.n8nEmit === 'function' && key !== 'slNetwork') {
      const compact = {
        eventType: event.eventType,
        kind: event.kind,
        label: event.label,
        field: event.field,
        isAutomated: event.isAutomated,
        page: event.page,
        ts: event.timestamp || event.ts || Date.now()
      };
      globalThis.n8nEmit('smart_log_event', compact, { source: 'background-smart-log' }).catch(() => {});
    }

    return { ok: true, notify };
  } catch (e) {
    console.error('Smart Log save error:', e);
    return { ok: false };
  }
}

// 🔗 بث دفعة طلبات الشبكة لناقل n8n (دوري — كل flush) — لا ترسل كل طلب على حدة
async function emitSmartLogNetworkBatch() {
  try {
    if (typeof globalThis.n8nEmit !== 'function') return;
    const { n8n = {} } = await chrome.storage.local.get({ n8n: {} });
    if (!n8n.webhookUrl) return;
    const data = await chrome.storage.local.get({ slNetwork: [] });
    const net = data.slNetwork || [];
    const modified = net.filter(e => e.modified);
    if (net.length) {
      await globalThis.n8nEmit('smart_log_batch', {
        total: net.length,
        modified: modified.length,
        samples: net.slice(-10).map(e => ({
          kind: e.kind, method: e.method, url: e.requestUrl, modified: e.modified, ts: e.timestamp
        }))
      }, { source: 'background-smart-log' }).catch(() => {});
    }
  } catch (_) {}
}

// ── Validation Pattern Collection (reporting only) ──
async function handleStoreValidationPattern(pattern) {
  try {
    const data = await chrome.storage.local.get({ validationPatterns: [] });
    const patterns = data.validationPatterns || [];
    patterns.push(pattern);

    if (patterns.length > MAX_VALIDATION_PATTERNS) {
      patterns.splice(0, patterns.length - MAX_VALIDATION_PATTERNS);
    }

    await chrome.storage.local.set({ validationPatterns: patterns });
    return { ok: true };
  } catch (e) {
    console.error('Validation pattern save error:', e);
    return { ok: false };
  }
}

async function handleGetValidationPatterns() {
  try {
    const { validationPatterns = [] } = await chrome.storage.local.get({ validationPatterns: [] });
    return { ok: true, patterns: validationPatterns };
  } catch (e) {
    return { ok: false, patterns: [] };
  }
}

// ── n8n Webhook proxy ─────────────────────────────────────
async function handleN8nSend(payload = {}) {
  try {
    const { n8n = {} } = await chrome.storage.local.get({ n8n: {} });
    const url = String(n8n.webhookUrl || '').trim();
    if (!url) {
      return { ok: false, error: 'N8N_NOT_CONFIGURED', message: 'ضع Webhook URL الخاص بـ n8n في الأدوات ← n8n أولاً' };
    }
    const headers = { 'Content-Type': 'application/json' };
    if (n8n.token && String(n8n.token).trim()) {
      headers['Authorization'] = 'Bearer ' + String(n8n.token).trim();
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: payload.event || 'unknown',
        eventId: payload.eventId || null,
        data: payload.data || {},
        meta: {
          source: 'elaraby-unified',
          ts: payload.ts || Date.now(),
          env: 'production'
        }
      })
    });
    if (resp.ok) return { ok: true, status: resp.status };
    const detail = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: 'HTTP ' + resp.status + (detail ? ': ' + detail.slice(0, 150) : '') };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ── OpenCode Zen AI proxy (v2 — النواة القوية) ─────────────
// الترقيات:
//   - Native Tool Calling (tools + tool_choice) وتمرير toolCalls في الرد
//   - ذاكرة محادثة (history) حتى 20 رسالة سابقة
//   - Rate-limit 500ms بين الطلبات + Timeout 90s + Retry لمحاولتين (429/5xx/شبكة)
//   - تسجيل الاستخدام (aiUsageStats): طلبات، توكنز، نجاح/فشل، لكل نموذج
//   - Telemetry اختياري لـ n8n (telemetryAI: true) — لا يُرسل شيء افتراضياً
const OPENCODE_ZEN_URL = 'https://opencode.ai/zen/v1/chat/completions';
const AI_MIN_INTERVAL_MS = 500;
const AI_TIMEOUT_MS = 90000;
const AI_USAGE_KEY = 'aiUsageStats';
let lastAICallTs = 0;

function aiThrottle() {
  const now = Date.now();
  const delay = Math.max(0, lastAICallTs + AI_MIN_INTERVAL_MS - now);
  lastAICallTs = now + delay;
  return new Promise(resolve => setTimeout(resolve, delay));
}

function aiSafeParse(text) {
  try { return JSON.parse(text); } catch (_) { return {}; }
}

async function recordAIUsage(entry) {
  try {
    const data = await chrome.storage.local.get({ [AI_USAGE_KEY]: null });
    const cur = data[AI_USAGE_KEY] || { calls: 0, tokens: 0, ok: 0, fail: 0, byModel: {}, last: null, history: [] };
    cur.calls += 1;
    if (entry.ok) cur.ok += 1; else cur.fail += 1;
    if (entry.tokens) cur.tokens += entry.tokens;
    if (entry.model) {
      const m = cur.byModel[entry.model] || { calls: 0, tokens: 0 };
      m.calls += 1;
      m.tokens += entry.tokens || 0;
      cur.byModel[entry.model] = m;
    }
    cur.last = { ts: Date.now(), model: entry.model || null, ok: !!entry.ok, error: entry.error || null, profile: entry.profile || null };
    cur.history = (cur.history || []).concat([cur.last]).slice(-100);
    await chrome.storage.local.set({ [AI_USAGE_KEY]: cur });
  } catch (_) {}
}

async function aiTelemetry(ok, entry) {
  try {
    const { n8n = {} } = await chrome.storage.local.get({ n8n: {} });
    if (!n8n.webhookUrl || !n8n.telemetryAI) return;
    if (typeof globalThis.n8nEmit === 'function') {
      await globalThis.n8nEmit(ok ? 'ai_call' : 'ai_failed', entry, { source: 'background-ai' });
      await globalThis.n8nFlushOutbox().catch(() => {});
      return;
    }
    await handleN8nSend({ event: ok ? 'ai_call' : 'ai_failed', data: entry });
  } catch (_) {}
}

async function aiFetchWithRetry(body, maxAttempts = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch(OPENCODE_ZEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + body._apiKey },
        body: JSON.stringify(body._payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, data };
      }
      if (resp.status === 429 || resp.status >= 500) {
        const retryAfter = resp.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : attempt * 2000;
        lastErr = { error: 'HTTP ' + resp.status, message: `محاولة ${attempt} من ${maxAttempts} — انتظار ${waitMs}ms` };
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      let detail = '';
      try { const j = await resp.json(); detail = (j.error && (j.error.message || JSON.stringify(j.error))) || ''; } catch (_) {}
      return { ok: false, error: 'HTTP ' + resp.status, message: detail || resp.statusText };
    } catch (e) {
      clearTimeout(timer);
      lastErr = { error: (e && e.name === 'AbortError') ? 'AI_TIMEOUT' : 'AI_NETWORK', message: String(e && e.message || e) };
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  return { ok: false, error: lastErr.error || 'AI_FAILED', message: lastErr.message || 'فشل الاتصال بعد ' + maxAttempts + ' محاولات' };
}

async function handleAIChat(payload = {}) {
  try {
    const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
    const apiKey = aiConfig.apiKey || '';
    if (!apiKey) return { ok: false, error: 'AI_NOT_CONFIGURED', message: 'ضع مفتاح OpenCode API في إعدادات الإضافة أولاً' };

    const system = payload.system || 'أنت مساعد ذكي مفيد.';
    const prompt = payload.prompt || '';
    const maxTokens = Math.min(payload.maxTokens || 512, 4000);
    // زن يتطلب معرّف النموذج الكامل مع بادئة المزود (opencode/deepseek-v4-flash-free)
    //  القائمة في الواجهات تحفظ الاسم بدون بادئة — نضيفها هنا تلقائياً
    let model = String(payload.model || aiConfig.model || 'deepseek-v4-flash-free').trim();
    if (!model) model = 'deepseek-v4-flash-free';
    if (!model.includes('/')) model = 'opencode/' + model;

    await aiThrottle();

    const messages = [];
    if (Array.isArray(payload.history)) {
      for (const m of payload.history.slice(-20)) {
        if (!m || !m.role) continue;
        const clean = { role: String(m.role) };
        if (m.content) clean.content = String(m.content);
        if (m.tool_call_id) clean.tool_call_id = String(m.tool_call_id);
        if (Array.isArray(m.tool_calls)) clean.tool_calls = m.tool_calls;
        messages.push(clean);
      }
    }
    messages.push({ role: 'user', content: prompt });

    const body = { model, messages, max_tokens: maxTokens, stream: false };
    if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
    if (Array.isArray(payload.tools) && payload.tools.length) {
      body.tools = payload.tools.map(t => ({
        type: 'function',
        function: {
          name: String(t.name || ''),
          description: String(t.description || ''),
          parameters: (t.parameters && typeof t.parameters === 'object') ? t.parameters : { type: 'object', properties: {} }
        }
      }));
      body.tool_choice = payload.tool_choice || 'auto';
    }

    const res = await aiFetchWithRetry({ _apiKey: apiKey, _payload: body });
    if (!res.ok) {
      recordAIUsage({ model, ok: false, error: res.error, profile: payload.profile });
      aiTelemetry(false, { model, error: res.error, message: res.message, profile: payload.profile });
      return { ok: false, error: res.error, message: res.message };
    }

    const choice = res.data.choices && res.data.choices[0];
    const message = (choice && choice.message) || {};
    const usage = res.data.usage || {};
    const tokens = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)) || 0;
    const toolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length
      ? message.tool_calls.map(tc => ({
          id: tc.id || null,
          name: (tc.function && tc.function.name) || null,
          args: tc.function && tc.function.arguments ? aiSafeParse(tc.function.arguments) : {}
        }))
      : null;

    // حماية الرد الفارغ: لا نُرجع نجاحاً بنص خالٍ دون toolCalls
    const contentText = message.content || '';
    if (!contentText.trim() && !toolCalls) {
      recordAIUsage({ model, ok: false, error: 'AI_EMPTY_RESPONSE', profile: payload.profile });
      return { ok: false, error: 'AI_EMPTY_RESPONSE', message: 'النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج' };
    }
    recordAIUsage({ model, ok: true, tokens, profile: payload.profile });
    aiTelemetry(true, { model, tokens, profile: payload.profile });
    return { ok: true, text: contentText, toolCalls, model };
  } catch (e) {
    recordAIUsage({ ok: false, error: String(e && e.message || e) });
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ── بث مباشر (Streaming SSE) عبر Port — يبقي الـ service worker حياً أثناء الاستجابة ──
chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== 'elaraby-ai-stream') return;
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'START') return;
    await handleAIStream(port, msg.payload || {});
  });
});

async function handleAIStream(port, payload = {}) {
  let recordDone = false;
  const tryRecord = (entry) => { if (!recordDone) { recordDone = true; recordAIUsage(entry); } };

  const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
  const apiKey = aiConfig.apiKey || '';
  if (!apiKey) { port.postMessage({ type: 'error', error: 'AI_NOT_CONFIGURED', message: 'ضع مفتاح OpenCode API في إعدادات الإضافة أولاً' }); return; }

  const system = payload.system || 'أنت مساعد ذكي مفيد.';
  const prompt = payload.prompt || '';
  const maxTokens = Math.min(payload.maxTokens || 512, 4000);
  let model = String(payload.model || aiConfig.model || 'deepseek-v4-flash-free').trim();
  if (!model) model = 'deepseek-v4-flash-free';
  if (!model.includes('/')) model = 'opencode/' + model;

  await aiThrottle();

  const messages = [];
  if (Array.isArray(payload.history)) {
    for (const m of payload.history.slice(-20)) {
      if (!m || !m.role) continue;
      const clean = { role: String(m.role) };
      if (m.content) clean.content = String(m.content);
      if (m.tool_call_id) clean.tool_call_id = String(m.tool_call_id);
      if (Array.isArray(m.tool_calls)) clean.tool_calls = m.tool_calls;
      messages.push(clean);
    }
  }
  messages.push({ role: 'user', content: prompt });

  const body = { model, messages, max_tokens: maxTokens, stream: true };
  if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools.map(t => ({
      type: 'function',
      function: {
        name: String(t.name || ''),
        description: String(t.description || ''),
        parameters: (t.parameters && typeof t.parameters === 'object') ? t.parameters : { type: 'object', properties: {} }
      }
    }));
    body.tool_choice = payload.tool_choice || 'auto';
  }

  // Retry logic for streaming (429/5xx)
  const MAX_STREAM_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_STREAM_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    port.onDisconnect.addListener(() => { clearTimeout(timer); controller.abort(); });

    try {
      const resp = await fetch(OPENCODE_ZEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!resp.ok) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && (j.error.message || JSON.stringify(j.error))) || ''; } catch (_) {}
        if (resp.status === 429 || resp.status >= 500) {
          const retryAfter = resp.headers.get('Retry-After');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : attempt * 2000;
          if (attempt < MAX_STREAM_ATTEMPTS) {
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
        }
        tryRecord({ model, ok: false, error: 'HTTP ' + resp.status, profile: payload.profile });
        port.postMessage({ type: 'error', error: 'HTTP ' + resp.status, message: detail || resp.statusText });
        return;
      }
      if (!resp.body) {
        tryRecord({ model, ok: false, error: 'AI_STREAM_UNAVAILABLE', profile: payload.profile });
        port.postMessage({ type: 'error', error: 'AI_STREAM_UNAVAILABLE', message: 'الخادم لا يدعم البث حالياً — أعد المحاولة' });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const toolAcc = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const choice = json.choices && json.choices[0];
            if (!choice) continue;
            const delta = choice.delta || {};
            if (typeof delta.content === 'string' && delta.content) {
              fullText += delta.content;
              port.postMessage({ type: 'chunk', text: delta.content });
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = (typeof tc.index === 'number') ? tc.index : toolAcc.size;
                const item = toolAcc.get(idx) || { id: null, name: '', arguments: '' };
                if (tc.id) item.id = tc.id;
                if (tc.function) {
                  if (tc.function.name) item.name += tc.function.name;
                  if (tc.function.arguments) item.arguments += tc.function.arguments;
                }
                toolAcc.set(idx, item);
              }
            }
          } catch (_) {}
        }
      }

      const toolCalls = toolAcc.size
        ? [...toolAcc.values()].filter(t => t.name).map(t => ({ id: t.id || null, name: t.name, args: aiSafeParse(t.arguments || '{}') }))
        : null;

      if (!fullText.trim() && !toolCalls) {
        tryRecord({ model, ok: false, error: 'AI_EMPTY_RESPONSE', profile: payload.profile });
        port.postMessage({ type: 'error', error: 'AI_EMPTY_RESPONSE', message: 'النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج' });
        return;
      }
      const tokens = Math.round(fullText.length / 4) || 0;
      tryRecord({ model, ok: true, tokens, profile: payload.profile });
      aiTelemetry(true, { model, tokens, profile: payload.profile });
      port.postMessage({ type: 'done', text: fullText, toolCalls, model });
      return;

    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        if (attempt < MAX_STREAM_ATTEMPTS) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        tryRecord({ model: payload.model || '', ok: false, error: 'AI_TIMEOUT', profile: payload.profile });
        port.postMessage({ type: 'error', error: 'AI_TIMEOUT', message: 'انتهت مهلة الاستجابة — حاول مرة أخرى' });
        return;
      }
      if (attempt < MAX_STREAM_ATTEMPTS) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      tryRecord({ model: payload.model || '', ok: false, error: String(e && e.message || e), profile: payload.profile });
      port.postMessage({ type: 'error', error: 'AI_NETWORK', message: String(e && e.message || e) });
      return;
    }
  }
}

// ── توجيه RUN_SCRIPT_NOW من اللوحة/الاختصارات إلى سكربت-المحتوى (tampermonkey-runner) ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.action !== 'RUN_SCRIPT_NOW') return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
    sendResponse({ ok: true });
  });
  return true; // sendResponse غير متزامن
});

// ── Keyboard shortcuts ─────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-tools-dock') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_TOOLS_DOCK' }).catch(() => {});
    });
  } else if (command === 'quick-paste-batch') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'QUICK_PASTE_BATCH' }).catch(() => {});
    });
  } else if (command === 'trigger-messenger') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'RUN_SCRIPT_NOW', scriptId: 'messenger-sender' }).catch(() => {});
    });
  } else if (command === 'open-technical-review') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'OPEN_TECH_REVIEW' }).catch(() => {});
    });
  }
});

// ══════════════════════════════════════════════════════════
// مساعد قطع الغيار العربي (Booking Layer) — merged from حجز البلاغات
// يستقبل رسائل بروتوكول msg.action القديم من: dashboard، shadow-panel، scanner
// ══════════════════════════════════════════════════════════

// ── Fix double-encoded Arabic text (UTF-8 read as Windows-1256) ──
function fixDoubleEncodedText(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('\u00E2') && !text.includes('\u2122') && !text.includes('\u00A7')) return text;
  try {
    const bytes = new Uint8Array(text.length);
    let hasNonLatin = false;
    for (let i = 0; i < text.length; i++) {
      const cp = text.charCodeAt(i);
      if (cp > 255) { hasNonLatin = true; break; }
      bytes[i] = cp;
    }
    if (hasNonLatin) return text;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const arabicCount = (decoded.match(/[\u0600-\u06FF]/g) || []).length;
    const origArabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicCount >= origArabic ? decoded : text;
  } catch (e) { return text; }
}

function fixGarbledFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'string' && v.length > 2) {
      result[k] = fixDoubleEncodedText(v);
    }
  }
  return result;
}

// ── Shared File Parsing Utilities ──────────────────────────
function bookingDecodeBytes(uint8arr, encoding) {
  try { return new TextDecoder(encoding, { fatal: true }).decode(uint8arr); }
  catch (e) { return null; }
}

function bookingCountArabic(str) {
  if (!str) return 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06FF) count++;
  }
  return count;
}

function parseFileContent(uint8) {
  const isXLSX = uint8.length > 2 && uint8[0] === 0x50 && uint8[1] === 0x4B;
  if (isXLSX) {
    const workbook = XLSX.read(uint8, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log(`[ElAraby] XLSX parsed: ${rows.length} rows from sheet "${sheetName}"`);
    return rows;
  }

  let bytes = uint8;
  if (uint8.length > 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    bytes = uint8.slice(3);
  }
  const encodings = ['utf-8', 'windows-1256', 'iso-8859-6'];
  let bestText = null, bestCount = 0;
  for (const enc of encodings) {
    const text = bookingDecodeBytes(bytes, enc);
    if (text) {
      const count = bookingCountArabic(text);
      if (count > bestCount) { bestCount = count; bestText = text; }
    }
  }
  const text = bestText || new TextDecoder('utf-8').decode(bytes);

  const parsed = Papa.parse(text, {
    header: true, skipEmptyLines: true, dynamicTyping: false,
    transformHeader: h => h.trim().replace(/^\uFEFF/, ''),
  });
  const rows = parsed.data;
  return rows;
}

function parseRowsToMasterData(rows, tabId, clearFirst = true) {
  const BATCH_SIZE = 5000;
  let batch = [];
  let total = 0;
  let errors = 0;

  function extractFromFormat(raw) {
    if (!raw) return { code: '', description: '' };
    const s = String(raw).trim();
    const m = s.match(/^(\S+)\s+_\s+\((.+)\)\s*$/);
    if (m) return { code: m[1], description: m[2] };
    const m2 = s.match(/^(\S+)\s*-\s*\((.+)\)\s*$/);
    if (m2) return { code: m2[1], description: m2[2] };
    const m3 = s.match(/^(\S+)\s*-\s*(.+)$/);
    if (m3) return { code: m3[1], description: m3[2].trim() };
    return { code: s, description: '' };
  }

  const extractRows = async () => {
    if (clearFirst) await ElArabyDB.clearStore(ElArabyDB.STORES.masterData);

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const row = fixGarbledFields(raw);
      const keys = Object.keys(row);
      const find = (search) => {
        const k = keys.find(k => k.toLowerCase().includes(search.toLowerCase()));
        return k ? String(row[k] || '').trim() : '';
      };

      const norm = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '')] = String(v || '').trim();
      }

      const dm = globalThis.DataMapper;
      const dmVal = (headers) => dm ? dm.findColumnValue(row, headers) : undefined;

      const modelRaw      = dmVal(dm.HEADERS.model) || find('Model') || norm.model || '';
      const spareRaw      = dmVal(dm.HEADERS.sparePart) || find('Spare Part') || norm.sparepart || norm.sparepartcode || '';
      const defectDescRaw = dmVal(dm.HEADERS.defectDesc) || find('Defect Description') || find('Defect') || norm.defect || norm.defectcode || '';
      const rawDefectMajor = dmVal(dm.HEADERS.defectMajor) || find('Defect Major') || norm.defectmajor || '';
      const rawMaxQty     = dmVal(dm.HEADERS.maxQuantity) || find('Quantity') || find('Max Quantity') || norm.maxquantity || norm.quantity || '';
      const priceRaw      = dmVal(dm.HEADERS.price) || find('Price') || norm.price || '';
      const groupRaw      = dmVal(dm.HEADERS.productGroup) || find('Product Group') || norm.productgroup || '';
      const typeRaw       = dmVal(dm.HEADERS.productType) || find('Product Type') || norm.producttype || '';

      const model = extractFromFormat(modelRaw);
      const spare = extractFromFormat(spareRaw);
      const defectDesc = extractFromFormat(defectDescRaw);
      const defectMajorParsed = extractFromFormat(rawDefectMajor);

      let maxQty = 0;
      if (rawMaxQty) maxQty = parseInt(String(rawMaxQty).replace(/[^\d]/g, '')) || 0;

      const item = {
        productGroup: groupRaw || typeRaw || '',
        productType: typeRaw || groupRaw || '',
        brand: '',
        defectGroup: '',
        defectCode: defectDesc.code || norm.defect || norm.defectcode || '',
        defectDescription: defectDesc.description || norm.defectdescription || '',
        modelCode: model.code || norm.model || norm.modelcode || '',
        modelDescription: model.description || norm.modeldescription || '',
        sparePartCode: spare.code || norm.sparepart || norm.sparepartcode || '',
        sparePartDescription: spare.description || norm.sparepartdescription || '',
        defectMajor: rawDefectMajor || defectMajorParsed.code || '',
        price: parseFloat(priceRaw.replace ? priceRaw.replace(/[^\d.]/g, '') : priceRaw) || 0,
        maxQuantity: maxQty,
        source: 'System'
      };

      if (!item.modelCode && !item.sparePartCode) continue;
      batch.push(item);
      total++;

      if (batch.length >= BATCH_SIZE) {
        try {
          await ElArabyDB.addBatch(ElArabyDB.STORES.masterData, batch);
        } catch (batchErr) {
          console.error(`[ElAraby] Batch failed at row ${i}:`, batchErr.message);
          errors += batch.length;
        }
        batch = [];
        if (tabId) {
          const pct = 55 + Math.round((i / rows.length) * 45);
          chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'parse', pct, count: total }).catch(() => {});
        }
      }
    }

    if (batch.length > 0) {
      try {
        await ElArabyDB.addBatch(ElArabyDB.STORES.masterData, batch);
      } catch (batchErr) {
        console.error(`[ElAraby] Final batch failed:`, batchErr.message);
        errors += batch.length;
      }
    }
  };

  return extractRows().then(() => total);
}

// ── Google Drive CSV/XLSX Import ────────────────────────────
async function fetchAndImportCSV(driveUrl, tabId) {
  let downloadUrl = driveUrl;

  const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const fileId = match[1];
    const warningRes = await fetch(
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      { credentials: 'omit' }
    );
    const html = await warningRes.text();
    const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/);
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
    if (confirmMatch) {
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}`;
      if (uuidMatch) downloadUrl += `&uuid=${uuidMatch[1]}`;
    } else {
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    }
  }

  const response = await fetch(downloadUrl, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: فشل تنزيل الملف`);

  const contentLength = response.headers.get('Content-Length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  let loadedBytes = 0;
  const chunks = [];

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.length;
    if (totalBytes > 0 && tabId) {
      const pct = Math.round((loadedBytes / totalBytes) * 50);
      chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'download', pct }).catch(() => {});
    }
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  if (tabId) chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'parse', pct: 55, count: 0 }).catch(() => {});

  const rows = parseFileContent(merged);
  const total = await parseRowsToMasterData(rows, tabId);
  return total;
}

// ── Local File Import (bypasses Drive download) ──────────────
async function importFileData(uint8, fileName) {
  const rows = parseFileContent(uint8);
  const total = await parseRowsToMasterData(rows, null);
  return total;
}

// ── Inventory Scraper ──────────────────────────────────────
async function scrapeInventoryFromPortal() {
  const tabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
  if (tabs.length === 0) throw new Error('NO_PORTAL_TAB');

  const tabId = tabs[0].id;
  const currentUrl = tabs[0].url || '';
  if (!currentUrl.includes('ProductInventoryList')) {
    await chrome.tabs.update(tabId, { url: 'https://elarabyportalpfs.powerappsportals.com/en-US/ProductInventoryList/' });
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  const allData = [];
  const seenCodes = new Set();
  let pageNum = 1;
  const maxPages = 50;

  while (pageNum <= maxPages) {
    console.log(`[ElAraby] Scraping inventory page ${pageNum}...`);

    const pageResult = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => {
        const data = [];

        function findMainTable() {
          const allTables = document.querySelectorAll('table');
          for (const table of allTables) {
            const headerRow = table.querySelector('thead tr, tr:first-child');
            if (!headerRow) continue;
            const headerText = headerRow.innerText.toLowerCase();
            if (headerText.includes('كود') || headerText.includes('part') || headerText.includes('قطع الغيار')) {
              return table;
            }
          }
          return null;
        }

        const mainTable = findMainTable();
        if (mainTable) {
          const headerRow = mainTable.querySelector('thead tr, tr:first-child');
          const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.innerText.trim().toLowerCase());

          let codeIdx = headers.findIndex(h => h.includes('كود قطع الغيار') || h.includes('كود'));
          let descIdx = headers.findIndex(h => h.includes('وصف'));
          let locIdx = headers.findIndex(h => h.includes('مخزن') || h.includes('المخزن'));
          let qtyIdx = headers.findIndex(h => h.includes('كمية') || h.includes('الكمية'));

          if (codeIdx < 0 && headers.length >= 4) {
            codeIdx = headers.length - 1;
            descIdx = headers.length - 2;
            locIdx = 1;
            qtyIdx = 0;
          }

          const bodyRows = mainTable.querySelectorAll('tbody tr');
          bodyRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            const code = (codeIdx >= 0 && cells[codeIdx]) ? cells[codeIdx].innerText.trim() : '';
            const description = (descIdx >= 0 && cells[descIdx]) ? cells[descIdx].innerText.trim() : '';
            const quantity = (qtyIdx >= 0 && cells[qtyIdx]) ? cells[qtyIdx].innerText.trim() : '0';
            const location = (locIdx >= 0 && cells[locIdx]) ? cells[locIdx].innerText.trim() : '';
            if (code && code.length > 1) data.push({ code, description, quantity, location });
          });
        }

        let nextExists = false;

        const allLinks = document.querySelectorAll('a, button, li, span');
        let currentPageNum = 0;

        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          const isActive = (el.classList && (el.classList.contains('active') || el.classList.contains('selected'))) ||
            (el.parentElement && el.parentElement.classList && (el.parentElement.classList.contains('active') || el.parentElement.classList.contains('selected'))) ||
            (el.getAttribute && el.getAttribute('aria-current') === 'page') ||
            (el.style && el.style.fontWeight === 'bold');
          if (isActive && /^\d+$/.test(text)) {
            currentPageNum = parseInt(text);
            break;
          }
        }

        if (currentPageNum === 0) {
          const activeLi = document.querySelector('li.active, li.selected, .pagination .active, .page-item.active');
          if (activeLi) {
            const num = parseInt(activeLi.innerText.trim());
            if (num > 0) currentPageNum = num;
          }
        }

        if (currentPageNum === 0) {
          const urlMatch = window.location.search.match(/[?&]page=(\d+)/i);
          if (urlMatch) currentPageNum = parseInt(urlMatch[1]);
        }

        if (currentPageNum > 0) {
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            if (text === String(currentPageNum + 1)) {
              nextExists = true;
              break;
            }
          }
        }

        if (!nextExists) {
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            const parent = el.parentElement;
            const isNext = text === '>' || text === '›' || text === 'التالي' || text === 'Next' ||
              (parent && parent.classList && parent.classList.contains('next'));
            const isDisabled = el.classList.contains('disabled') || el.disabled ||
              (parent && parent.classList && parent.classList.contains('disabled'));
            if (isNext && !isDisabled) {
              nextExists = true;
              break;
            }
          }
        }

        if (!nextExists) {
          const pageNums = [];
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            if (/^\d+$/.test(text)) pageNums.push(parseInt(text));
          }
          const maxPage = Math.max(...pageNums, 0);
          if (maxPage > currentPageNum) nextExists = true;
        }

        if (!nextExists && data.length >= 10) {
          const paginationNav = document.querySelector('nav, .pagination, ul.pagination, [role="navigation"]');
          if (paginationNav) nextExists = true;
        }

        return { data, nextExists, rowCount: data.length, currentPage: currentPageNum };
      }
    });

    const result = pageResult[0]?.result || { data: [], nextExists: false, rowCount: 0, currentPage: 0 };

    for (const item of result.data) {
      if (!seenCodes.has(item.code)) {
        seenCodes.add(item.code);
        allData.push(item);
      }
    }

    console.log(`[ElAraby] Page ${pageNum} (portal page ${result.currentPage}): ${result.data.length} rows scraped, total unique: ${allData.length}, nextExists: ${result.nextExists}`);

    if (!result.nextExists || result.rowCount === 0) break;

    const clicked = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: (currentPage) => {
        const allLinks = document.querySelectorAll('a, button, li');

        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          if (text === String(currentPage + 1) && el.tagName !== 'LI') {
            el.click();
            return true;
          }
        }

        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          const parent = el.parentElement;
          const isNext = text === '>' || text === '›' || text === 'التالي' || text === 'Next' ||
            (parent && parent.classList && parent.classList.contains('next'));
          const isDisabled = el.classList.contains('disabled') || el.disabled ||
            (parent && parent.classList && parent.classList.contains('disabled'));
          if (isNext && !isDisabled) {
            el.click();
            return true;
          }
        }

        const nextEl = document.querySelector('li.next:not(.disabled), .next-page:not(.disabled), a[rel="next"]');
        if (nextEl) { nextEl.click(); return true; }

        return false;
      },
      args: [result.currentPage || pageNum]
    });

    const didClick = clicked[0]?.result || false;
    if (!didClick) {
      console.log(`[ElAraby] Could not click next page, stopping.`);
      break;
    }

    const prevFirstCode = result.data[0]?.code || '';
    let waitAttempts = 0;
    while (waitAttempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitAttempts++;

      const check = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: () => {
          const allTables = document.querySelectorAll('table');
          for (const table of allTables) {
            const headerRow = table.querySelector('thead tr, tr:first-child');
            if (!headerRow) continue;
            const headerText = headerRow.innerText.toLowerCase();
            if (headerText.includes('كود') || headerText.includes('part')) {
              const firstRow = table.querySelector('tbody tr');
              if (!firstRow) return '';
              const cells = firstRow.querySelectorAll('td');
              return cells[cells.length - 1]?.innerText?.trim() || '';
            }
          }
          return '';
        }
      });
      const newFirstCode = check[0]?.result || '';
      if (newFirstCode && newFirstCode !== prevFirstCode) {
        console.log(`[ElAraby] Page loaded, new first code: ${newFirstCode}`);
        break;
      }
    }

    pageNum++;
  }

  await ElArabyDB.clearStore(ElArabyDB.STORES.inventory);
  const BATCH_SIZE = 500;
  let batch = [];
  let stored = 0;
  for (const item of allData) {
    batch.push({
      sparePartCode: item.code,
      sparePartDescription: item.description || '',
      quantity: parseFloat(item.quantity) || 0,
      location: item.location || '',
    });
    if (batch.length >= BATCH_SIZE) {
      await ElArabyDB.addBatch(ElArabyDB.STORES.inventory, batch);
      batch = [];
    }
  }
  if (batch.length > 0) await ElArabyDB.addBatch(ElArabyDB.STORES.inventory, batch);
  stored = allData.length;

  console.log(`[ElAraby] Total inventory items scraped: ${stored}`);
  return { count: stored };
}

// ── Booking Message Router (msg.action protocol) ────────────
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || !msg.action) return false;
  const knownActions = [
    'openDashboard', 'getDBCount', 'getPreview', 'searchDB', 'getPricesForCodes', 'clearDB',
    'syncDrive', 'importLocalFile', 'importLocalChunk', 'scrapeInventory',
    'injectData', 'injectCart', 'checkCodesStatus', 'updatePartPrice', 'updateDefectCode',
    'importMasterData', 'getInventory', 'getInventoryFull', 'getInventoryFilters',
    'getMasterDataFilters', 'getLocations', 'LOG_EVENT', 'GET_LOG', 'CLEAR_LOG'
  ];
  if (!knownActions.includes(msg.action)) return false;

  const handle = async () => {
    switch (msg.action) {

      case 'openDashboard':
        chrome.tabs.create({ url: chrome.runtime.getURL('features/spare-parts/dashboard/dashboard.html') });
        return { ok: true };

      case 'getDBCount':
        return { count: await ElArabyDB.countDB(ElArabyDB.STORES.masterData) };

      case 'getPreview':
        return { data: await ElArabyDB.getPreview(ElArabyDB.STORES.masterData, msg.limit || 50) };

      case 'searchDB': {
        let filters;
        if (typeof msg.query === 'string') {
          const q = msg.query.trim();
          const forceKeyword = q.startsWith('*');
          if (forceKeyword) {
            filters = { model: '', part: '', defect: '', keyword: q };
          } else {
            const looksLikePartCode = /^[A-Z0-9]{2,}[.\-_]/i.test(q);
            const looksLikeModel = /^[A-Z]{2}\d/i.test(q) && q.length < 20;
            filters = {
              model: looksLikeModel ? q : '',
              part: looksLikePartCode ? q : '',
              defect: '',
              keyword: (!looksLikeModel && !looksLikePartCode) ? q : '',
            };
          }
        } else {
          filters = msg.query || { model: msg.model || '', part: msg.part || '', defect: msg.defect || '', keyword: msg.keyword || '', productType: msg.productType || '', defectMajor: msg.defectMajor || '', defectDescription: msg.defectDescription || '' };
        }
        return { data: await ElArabyDB.searchDB(filters, 100) };
      }

      case 'getPricesForCodes':
        return await ElArabyDB.getPricesForCodes(msg.codes || []);

      case 'clearDB':
        await ElArabyDB.clearStore(ElArabyDB.STORES.masterData);
        return { ok: true };

      case 'syncDrive': {
        const total = await fetchAndImportCSV(msg.url, msg.tabId);
        return { total };
      }

      case 'importLocalFile': {
        const uint8 = new Uint8Array(msg.fileData);
        const total = await importFileData(uint8, msg.fileName || '');
        return { total };
      }

      case 'importLocalChunk': {
        const rows = msg.rows || [];
        const isFirst = msg.isFirst || false;
        if (rows.length > 0) {
          await parseRowsToMasterData(rows, null, isFirst);
        }
        const count = await ElArabyDB.countDB(ElArabyDB.STORES.masterData);
        return { total: count };
      }

      case 'scrapeInventory':
        return await scrapeInventoryFromPortal();

      case 'injectData': {
        const tabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
        if (tabs.length === 0) return { error: 'NO_PORTAL_TAB' };
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'injectData', data: msg.data }, (res) => {
            if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
            else resolve(res || { error: 'NO_RESPONSE' });
          });
        });
      }

      case 'injectCart': {
        const portalTabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
        if (portalTabs.length === 0) return { error: 'NO_PORTAL_TAB' };
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(portalTabs[0].id, { action: 'injectCart', items: msg.items || [] }, (res) => {
            if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
            else resolve(res || { error: 'NO_RESPONSE' });
          });
        });
      }

      case 'checkCodesStatus':
        return await ElArabyDB.checkCodesStatus(msg.parts, msg.defects);

      case 'updatePartPrice':
        return { ok: await ElArabyDB.updatePartPrice(msg.code, msg.price, msg.description) };

      case 'updateDefectCode':
        return { ok: await ElArabyDB.updateDefectCode(msg.code, msg.description, msg.major) };

      case 'importMasterData': {
        const stats = await ElArabyDB.addMasterDataItems(msg.items || [], msg.isFirst !== false);
        return stats;
      }

      case 'getInventory':
        return { data: await ElArabyDB.getInventory() };

      case 'getInventoryFull':
        return { data: await ElArabyDB.getInventoryWithMasterData() };

      case 'getInventoryFilters':
        return await ElArabyDB.getInventoryFilters();

      case 'getMasterDataFilters':
        return await ElArabyDB.getMasterDataFilters();

      case 'getLocations':
        return { data: await ElArabyDB.getExistingLocations() };

      case 'LOG_EVENT':
        await SmartLog.addEntry(msg.actionType, msg.details || {});
        return { ok: true };

      case 'GET_LOG':
        return { entries: await SmartLog.getEntries(msg.limit || 500) };

      case 'CLEAR_LOG':
        await SmartLog.clearAll();
        return { ok: true };

      default:
        return { error: 'unknown action: ' + msg.action };
    }
  };

  handle().then(respond).catch(err => {
    console.error('[ElAraby] Error in', msg.action, err);
    respond({ error: err && err.message ? err.message : String(err) });
  });
  return true;
});
