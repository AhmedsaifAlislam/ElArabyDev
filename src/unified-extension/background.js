// =========================================================
// background.js — Portal AutoFiller v2.0
// =========================================================

'use strict';

const MAX_REPORTS = 200;
const MAX_VALIDATION_PATTERNS = 2000;
const TRACE_KEY = 'multiRunRuntimeTrace';
const MAX_TRACE_ENTRIES = 150;

// ── Allowlist for INJECT_SCRIPT_FILE ──────────────────────────────────────────
// Only these files (packaged with the extension) may be injected via chrome.scripting.executeScript
const ALLOWED_INJECT_FILES = new Set([
  // From fabs-controller.js tool.files
  'ai/chat-panel.js',
  'core/booking/scanner.js',
  'core/booking/shadow-panel.js',
  'ai/voice-control.js',
  // From tampermonkey-runner.js BUILTIN_SCRIPTS.source
  'Tempermonky/elaraby-phone-reveal.js',
  'Tempermonky/messenger-sender.js',
  'Tempermonky/report-processor.js',
  'Tempermonky/future-orders-reveal.js',
]);

// Validate and normalize requested files against allowlist
function normalizeInjectFiles(requested) {
  const files = Array.isArray(requested) ? requested : (requested ? [requested] : []);
  const normalized = [];
  for (const f of files) {
    if (typeof f !== 'string') continue;
    // Reject absolute paths, directory traversal, non-.js extensions
    if (f.startsWith('/') || f.startsWith('..') || f.includes('://') || !f.endsWith('.js')) {
      console.warn('[BG] INJECT_SCRIPT_FILE rejected (invalid path):', f);
      continue;
    }
    // Normalize path separators
    const norm = f.replace(/\\/g, '/');
    if (!ALLOWED_INJECT_FILES.has(norm)) {
      console.warn('[BG] INJECT_SCRIPT_FILE rejected (not in allowlist):', norm);
      continue;
    }
    normalized.push(norm);
  }
  return normalized;
}

// ── Keep Service Worker Alive ───────────────────────────────────────────────
function ensureKeepAliveAlarm() {
  try {
    chrome.alarms.get('keepAlive', (alarm) => {
      if (!alarm) {
        chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
        console.log('[BG] Keep-alive alarm created');
      } else {
        console.log('[BG] Keep-alive alarm already exists');
      }
    });
  } catch (e) {
    console.error('[BG] Failed to ensure keep-alive alarm:', e);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[BG] Keep-alive alarm fired - service worker alive');
  }
});

// Create alarm on startup/install and ensure it exists
chrome.runtime.onStartup.addListener(() => {
  console.log('[BG] onStartup - ensuring keep-alive alarm');
  ensureKeepAliveAlarm();
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[BG] onInstalled:', details.reason);
  if (details.reason === 'install' || details.reason === 'update') {
    ensureKeepAliveAlarm();
  }
});

// Also ensure alarm exists immediately
ensureKeepAliveAlarm();

// Fix 4: setInterval كـ heartbeat فقط — الـ Port connections تبقي SW حياً
// لا نُرسل sendMessage لأنه يُسبب ضجيجاً ولا فائدة منه مع وجود Port مفتوحة
let keepAliveInterval = setInterval(() => {
  console.log('[BG] Keep-alive interval ping');
}, 25000);

chrome.runtime.onSuspend.addListener(() => {
  console.log('[BG] Service worker suspending');
});

// ── Port Connection Handler (keeps SW alive & handles storage proxy) ───────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'storage-proxy') return;
  
  console.log('[BG] Storage proxy port connected from:', port.sender?.tab?.id);
  
  port.onMessage.addListener((msg) => {
    const { type, payload, requestId } = msg;
    if (!requestId) return;
    
    const respond = (response) => {
      port.postMessage({ requestId, ...response });
    };
    
    (async () => {
      try {
        switch (type) {
          case 'STORAGE_GET': {
            const data = await chrome.storage.local.get(payload.keys || {});
            respond({ ok: true, data });
            break;
          }
          case 'STORAGE_SET': {
            if (payload.append && payload.key) {
              const data = await chrome.storage.local.get(payload.key);
              const existing = data[payload.key] || [];
              const combined = existing.concat(payload.data || []);
              await chrome.storage.local.set({ [payload.key]: combined });
              respond({ ok: true });
            } else {
              await chrome.storage.local.set(payload.data || {});
              respond({ ok: true });
            }
            break;
          }
          case 'STORAGE_REMOVE': {
            await chrome.storage.local.remove(payload.keys || []);
            respond({ ok: true });
            break;
          }
          default:
            respond({ ok: false, error: 'Unknown type: ' + type });
        }
      } catch (e) {
        respond({ ok: false, error: e.message });
      }
    })();
  });
  
  port.onDisconnect.addListener(() => {
    console.log('[BG] Storage proxy port disconnected');
  });
});

// ── Serialized Trace Write Queue ──────────────────────────
let traceWriteQueue = Promise.resolve();

function enqueueTraceWrite(operation) {
  traceWriteQueue = traceWriteQueue
    .then(operation)
    .catch(err => {
      console.error('[TRACE] Write error:', err);
    });
  return traceWriteQueue;
}

async function appendTrace(entries) {
  const items = Array.isArray(entries) ? entries : (entries ? [entries] : []);
  if (!items.length) return Promise.resolve([]);
  
  return enqueueTraceWrite(async () => {
    try {
      const data = await chrome.storage.local.get({ [TRACE_KEY]: [] });
      const existing = Array.isArray(data[TRACE_KEY]) ? data[TRACE_KEY] : [];
      const combined = existing.concat(items).slice(-MAX_TRACE_ENTRIES);
      items.forEach(item => {
        console.log(`[BG-TRACE] [${item.event || item.type || 'EVENT'}]`, item);
      });
      await chrome.storage.local.set({ [TRACE_KEY]: combined });
      return combined;
    } catch (e) {
      console.error('[TRACE] append error:', e);
      return [];
    }
  });
}

async function clearTrace() {
  return enqueueTraceWrite(async () => {
    try {
      await chrome.storage.local.set({ [TRACE_KEY]: [] });
      return [];
    } catch (e) {
      console.error('[TRACE] clear error:', e);
      return [];
    }
  });
}

async function getTrace() {
  await traceWriteQueue;
  const data = await chrome.storage.local.get({ [TRACE_KEY]: [] });
  return Array.isArray(data[TRACE_KEY]) ? data[TRACE_KEY] : [];
}

// Self-test using the production trace pipeline
async function runDiagnosticSelfTest() {
  await clearTrace();
  await appendTrace({ event: 'TRACE_TEST_1' });
  await appendTrace({ event: 'TRACE_TEST_2' });
  await appendTrace({ event: 'TRACE_TEST_3' });
  await appendTrace({ event: 'TRACE_TEST_4' });
  await appendTrace({ event: 'TRACE_TEST_5' });
  const trace = await getTrace();
  const suffix = trace.slice(-5).map(e => e.event);
  const expected = ['TRACE_TEST_1', 'TRACE_TEST_2', 'TRACE_TEST_3', 'TRACE_TEST_4', 'TRACE_TEST_5'];
  const pass = expected.length === 5 && expected.every((ev, i) => suffix[i] === ev);
  return { ok: pass, pass, suffix, count: trace.length };
}

// One-time migration: telemetryLogs → smartLogs
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
  
  // Trace self-test for background using the production trace pipeline
  runDiagnosticSelfTest().then(result => {
    console.log('[TRACE] Background self-test:', result.ok ? 'PASS' : 'FAIL', result);
  }).catch(e => console.error('[TRACE] self-test error:', e));
})();

// One-time migration: multiRunRuntimeTrace cleanup
chrome.storage.local.get('multiRunRuntimeTrace', (data) => {
  if (data.multiRunRuntimeTrace && !Array.isArray(data.multiRunRuntimeTrace)) {
    chrome.storage.local.remove('multiRunRuntimeTrace');
    console.log('[TRACE] Cleaned up invalid trace storage');
  }
});

// ── FETCH_PROXY for CDN URLs (fbcdn, fna, cdninstagram) — bypasses CORS ───────────
const CDN_DOMAINS = ['fbcdn.net', 'fna.fbcdn.net', 'cdninstagram.com'];

function isCdnUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname;
    return CDN_DOMAINS.some(function(d) { return host === d || host.endsWith('.' + d); });
  } catch (e) { return false; }
}

// Runner commands that must reach the tampermonkey-runner content script.
// Content scripts cannot receive chrome.runtime.sendMessage (only background/pages do),
// so fabs-controller sends them here and we relay them to the sender's tab.
const RUNNER_RELAY_ACTIONS = new Set([
  'RUN_SCRIPT_NOW', 'STOP_SCRIPT_NOW', 'TOGGLE_SCRIPT', 'ENABLE_SCRIPT', 'GET_SCRIPTS', 'GET_RUNNING_STATE'
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // ── action-based protocol (fabs-controller / tampermonkey-runner) ──
  if (typeof msg.action === 'string') {
    // File-based script injection (bypasses CSP for Facebook/Messenger/etc)
    if (msg.action === 'INJECT_SCRIPT_FILE') {
      // Validate sender is our own extension
      if (sender?.id !== chrome.runtime.id) {
        sendResponse({ ok: false, error: 'Unauthorized sender' });
        return true;
      }
      const files = normalizeInjectFiles(msg.files || msg.source);
      if (sender?.tab?.id && files.length) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files,
          world: msg.world || 'MAIN',
          injectImmediately: msg.injectAt === 'document-start'
        }).then(() => {
          sendResponse({ ok: true });
        }).catch(e => {
          console.error('[BG] INJECT_SCRIPT_FILE failed:', e);
          sendResponse({ ok: false, error: e.message });
        });
      } else {
        sendResponse({ ok: false, error: 'Invalid tab or no allowed files' });
      }
      return true;
    }

    // Relay runner commands: content script → background → runner (same tab)
    if (RUNNER_RELAY_ACTIONS.has(msg.action) && sender?.tab?.id != null) {
      chrome.tabs.sendMessage(sender.tab.id, msg)
        .then(res => sendResponse(res ?? { ok: false, error: 'No runner response' }))
        .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
      return true;
    }

    return; // unknown action — ignore
  }

  if (!msg.type) return;

  switch (msg.type) {

    // ── OpenCode Zen AI proxy ──────────────────────────────────────
    case 'AI_CHAT':
      handleAIChat(msg.payload).then(sendResponse);
      return true;

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
      
    // Smart Log Events
    case 'SMART_LOG_EVENT':
      handleSmartLogEvent(msg.event).then(sendResponse);
      return true;
      
    case 'GET_SMART_LOG':
      chrome.storage.local.get({ slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [] }, (data) => {
        sendResponse({
          manual: data.slManualChanges || [],
          automated: data.slAutomatedChanges || [],
          errors: data.slErrors || [],
          events: data.slEvents || []
        });
      });
      return true;

    case 'CLEAR_SMART_LOG':
      chrome.storage.local.set({ slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [] }, () => sendResponse({ ok: true }));
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

    // ── Dedicated Trace Protocol (Single Writer / Serialized) ──
    case 'TRACE_APPEND': {
      const items = msg.entries || (msg.entry ? [msg.entry] : (msg.data || []));
      appendTrace(items).then((trace) => {
        sendResponse({ ok: true, count: trace?.length || 0 });
      });
      return true;
    }

    case 'TRACE_CLEAR':
      clearTrace().then(() => {
        sendResponse({ ok: true });
      });
      return true;

    case 'TRACE_GET':
      getTrace().then((trace) => {
        sendResponse({ ok: true, trace });
      });
      return true;

    case 'TRACE_SELF_TEST_RUN':
      runDiagnosticSelfTest().then((result) => {
        sendResponse(result);
      });
      return true;

    // Fix 2: حُذف case 'BATCH_DONE_STORAGE' الأول (callback-based) — كان unreachable
    // Batch done in storage — notify popup and show OS notification (async/await)

    // Open next task in a new tab (keeps current tab open)
    case 'OPEN_NEXT_TAB':
      chrome.tabs.create({ url: msg.url, active: true }, (newTab) => {
        if (newTab && newTab.id) {
          chrome.storage.local.set({ processingTabId: newTab.id }, () => {
            appendTrace({
              timestamp: new Date().toISOString(),
              event: 'TAB_CREATE_SUCCESS',
              tabId: newTab.id,
              url: msg.url,
              details: { type: 'extension_created' }
            });
            sendResponse({ ok: true });
          });
        } else {
          appendTrace({
            timestamp: new Date().toISOString(),
            event: 'TAB_CREATE_ERROR',
            url: msg.url,
            details: { error: 'Failed to create tab' }
          });
          sendResponse({ ok: false });
        }
      });
      return true;

    case 'GET_MY_TAB_ID':
      sendResponse({ tabId: sender.tab?.id });
      // Trace the tab ID request directly
      appendTrace({
        timestamp: new Date().toISOString(),
        event: 'GET_MY_TAB_ID',
        tabId: sender.tab?.id,
        details: { type: 'tab_id_request' }
      });
      return true;

    // Batch done in storage — notify popup and show OS notification
    case 'BATCH_DONE_STORAGE':
      (async () => {
        try {
          chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(() => {});
          const { taskResults = [] } = await chrome.storage.local.get({ taskResults: [] });
          const success = taskResults.filter(r => r.result === 'done').length;
          const failed  = taskResults.filter(r => !['done','opened'].includes(r.result)).length;
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Portal AutoFiller',
            message: `اكتمل Batch. نجح: ${success} | فشل: ${failed}`
          });
        } catch (e) {
          console.error('[BG] BATCH_DONE_STORAGE error:', e.message);
        }
      })();
      return true;

    case 'FETCH_PROXY': {
      if (!msg.url || !isCdnUrl(msg.url)) {
        sendResponse({ ok: false, error: 'Invalid or non-CDN URL' });
        return true;
      }
      (async () => {
        try {
          // Fetch from SW context — no CORS restrictions for CDN
          const resp = await fetch(msg.url, { method: 'GET', credentials: 'omit', cache: 'no-store' });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const arrayBuffer = await resp.arrayBuffer();
          const contentType = resp.headers.get('content-type') || 'application/octet-stream';
          sendResponse({ ok: true, data: arrayBuffer, type: contentType });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true; // async response
    }

    case 'PING':
      sendResponse({ ok: true, version: '2.0.0' });
      return true;

    // Invoke processQueueOnLoad in a specific tab (fallback for new tabs)
    case 'INVOKE_PROCESS_QUEUE_ON_LOAD':
      if (sender?.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: () => window.AutoFillEngine?.Orchestrator?.processQueueOnLoad?.()
        }).catch(e => console.error('[BG] INVOKE_PROCESS_QUEUE_ON_LOAD failed:', e));
      }
      sendResponse({ ok: true });
      return true;

    // Storage proxy — Edge Tracking Prevention blocks chrome.storage.local from content scripts
    case 'STORAGE_GET':
      console.log('[BG] STORAGE_GET received, keys:', msg.keys);
      chrome.storage.local.get(msg.keys || {}, (data) => {
        if (chrome.runtime.lastError) {
          console.error('[BG] STORAGE_GET error:', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[BG] STORAGE_GET success, keys returned:', Object.keys(data || {}));
          sendResponse({ ok: true, data });
        }
      });
      return true;

    case 'STORAGE_SET':
      console.log('[BG] STORAGE_SET received, append:', msg.append, 'key:', msg.key, 'data keys:', msg.data ? Object.keys(msg.data || {}) : 'none');
      if (msg.append && msg.key) {
        chrome.storage.local.get(msg.key, (data) => {
          if (chrome.runtime.lastError) {
            console.error('[BG] STORAGE_SET (append) get error:', chrome.runtime.lastError.message);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          const existing = data[msg.key] || [];
          const combined = existing.concat(msg.data || []);
          console.log('[BG] STORAGE_SET (append) writing combined length:', combined.length);
          chrome.storage.local.set({ [msg.key]: combined }, () => {
            if (chrome.runtime.lastError) {
              console.error('[BG] STORAGE_SET (append) set error:', chrome.runtime.lastError.message);
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              console.log('[BG] STORAGE_SET (append) success');
              sendResponse({ ok: true });
            }
          });
        });
      } else {
        console.log('[BG] STORAGE_SET (direct) writing keys:', msg.data ? Object.keys(msg.data || {}) : 'none');
        chrome.storage.local.set(msg.data || {}, () => {
          if (chrome.runtime.lastError) {
            console.error('[BG] STORAGE_SET error:', chrome.runtime.lastError.message);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            console.log('[BG] STORAGE_SET success');
            sendResponse({ ok: true });
          }
        });
      }
      return true;

    case 'STORAGE_REMOVE':
      console.log('[BG] STORAGE_REMOVE received, keys:', msg.keys);
      chrome.storage.local.remove(msg.keys || [], () => {
        if (chrome.runtime.lastError) {
          console.error('[BG] STORAGE_REMOVE error:', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[BG] STORAGE_REMOVE success');
          sendResponse({ ok: true });
        }
      });
      return true;

    // File-based script injection (bypasses CSP for Facebook/Messenger/etc)
    case 'INJECT_SCRIPT_FILE':
      // Validate sender is our own extension
      if (sender?.id !== chrome.runtime.id) {
        sendResponse({ ok: false, error: 'Unauthorized sender' });
        return true;
      }
      const files = normalizeInjectFiles(msg.source);
      if (sender?.tab?.id && files.length) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files,
          world: msg.world || 'MAIN',
          injectImmediately: msg.injectAt === 'document-start'
        }).then(() => {
          sendResponse({ ok: true });
        }).catch(e => {
          console.error('[BG] INJECT_SCRIPT_FILE failed:', e);
          sendResponse({ ok: false, error: e.message });
        });
      } else {
        sendResponse({ ok: false, error: 'Invalid tab or no allowed files' });
      }
      return true;

    default:
      console.warn('[BG] Unhandled message type:', msg.type, 'from:', sender?.tab?.id);
      sendResponse({ ok: false, error: 'Unknown message type: ' + msg.type });
      return true;
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
      : (['NETWORK_ERROR','VALIDATION_WARNING','CLIENT_VALIDATION_ERROR','PAGE_ERROR'].includes(event.eventType)
        ? 'slErrors' : 'slEvents');
    const max = key === 'slErrors' ? 2000 : 5000;
    const data = await chrome.storage.local.get({ [key]: [] });
    const arr = data[key] || [];
    arr.push(event);
    if (arr.length > max) arr.splice(0, arr.length - max);
    await chrome.storage.local.set({ [key]: arr });
    return { ok: true };
  } catch (e) {
    console.error('Smart Log save error:', e);
    return { ok: false };
  }
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

// ── Keyboard shortcuts ─────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-paste-batch') {
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

console.log('[BG] Background service worker initialized with chrome.alarms keep-alive');

// ══════════════════════════════════════════════════════════════════════
//  OpenCode Zen AI proxy — OpenCode Zen (opencode.ai)
//  الـ API key مخزّن في chrome.storage.local فقط ولا يُكتب في الكود.
//  - Native Tool Calling (tools + tool_choice) + toolCalls في الرد
//  - history حتى 20 رسالة، throttle 500ms، timeout 90s، retry 3 مرات
//  - بث SSE عبر منفذ elaraby-ai-stream
//  - إحصاءات استخدام: aiUsageStats
// ══════════════════════════════════════════════════════════════════════
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

// المفتاح والنموذج من الإعدادات
async function aiResolveConfig(payloadModel) {
  const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
  const apiKey = String(aiConfig.apiKey || '').trim();
  let model = String(payloadModel || aiConfig.model || 'deepseek-v4.1-flash').trim();
  if (!model) model = 'deepseek-v4.1-flash';
  // Zen الحالي يرفض بادئة المزود ("opencode/xxx" ⇒ Model is unavailable) — نزيلها لو وُجدت
  model = model.replace(/^opencode\//i, '');
  return { apiKey, model, profile: null };
}

// رسائل أخطاء واضحة بالعربية بدل HTTP 402/403 الغامضة
function aiHttpError(status, json) {
  const type = json && json.error && json.error.type;
  if (status === 401) return { error: 'AI_AUTH', message: 'مفتاح OpenCode غير صحيح أو منتهي — أعد إدخاله من الإعدادات' };
  if (status === 402) return { error: 'AI_PAYMENT', message: 'رصيد حساب OpenCode غير كافٍ — اشحن الحساب أو استخدم مفتاحاً آخر' };
  if (status === 403) {
    if (type === 'FreeTierError') {
      return { error: 'AI_FREE_TIER', message: 'النماذج المجانية تعمل من داخل تطبيق OpenCode فقط — اختر نموذجاً مدفوعاً بعد شحن الرصيد' };
    }
    return { error: 'AI_FORBIDDEN', message: aiErrorDetail(json) || 'الوصول مرفوض — تحقق من صلاحيات المفتاح' };
  }
  if (status === 404) return { error: 'AI_MODEL_NOT_FOUND', message: 'النموذج غير موجود — اختر نموذجاً آخر من الإعدادات' };
  if (status === 429) return { error: 'AI_RATE_LIMIT', message: 'طلبات كثيرة على المفتاح — انتظر قليلاً ثم أعد المحاولة' };
  return { error: 'HTTP ' + status, message: aiErrorDetail(json) || 'فشل الطلب — حاول مرة أخرى' };
}

function aiBuildMessages(payload) {
  const messages = [];
  const system = String(payload.system || '').trim();
  if (system) messages.push({ role: 'system', content: system });
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
  messages.push({ role: 'user', content: String(payload.prompt || '') });
  return messages;
}

function aiBuildBody(payload, model, stream) {
  const body = {
    model,
    messages: aiBuildMessages(payload),
    max_tokens: Math.min(payload.maxTokens || 512, 4000),
    stream: !!stream
  };
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
  return body;
}

function aiErrorDetail(json) {
  return (json && json.error && (json.error.message || JSON.stringify(json.error))) || '';
}

async function aiFetchWithRetry(apiKey, body, maxAttempts = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const resp = await fetch(OPENCODE_ZEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        return { ok: true, data };
      }
      let errJson = {};
      try { errJson = await resp.json(); } catch (_) {}
      if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts) {
        const retryAfter = resp.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : attempt * 2000;
        lastErr = aiHttpError(resp.status, errJson);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return { ok: false, ...aiHttpError(resp.status, errJson) };
    } catch (e) {
      clearTimeout(timer);
      lastErr = { error: (e && e.name === 'AbortError') ? 'AI_TIMEOUT' : 'AI_NETWORK', message: String(e && e.message || e) };
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  return { ok: false, error: (lastErr && lastErr.error) || 'AI_FAILED', message: (lastErr && lastErr.message) || ('فشل الاتصال بعد ' + maxAttempts + ' محاولات') };
}

async function handleAIChat(payload = {}) {
  try {
    const { apiKey, model } = await aiResolveConfig(payload.model);
    if (!apiKey) {
      return { ok: false, error: 'AI_NOT_CONFIGURED', message: 'ضع مفتاح OpenCode API في إعدادات المساعد الذكي أولاً' };
    }
    await aiThrottle();
    const body = aiBuildBody(payload, model, false);
    const res = await aiFetchWithRetry(apiKey, body);
    if (!res.ok) {
      recordAIUsage({ model, ok: false, error: res.error, profile: payload.profile });
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

    const contentText = message.content || '';
    if (!String(contentText).trim() && !toolCalls) {
      recordAIUsage({ model, ok: false, error: 'AI_EMPTY_RESPONSE', profile: payload.profile });
      return { ok: false, error: 'AI_EMPTY_RESPONSE', message: 'النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج' };
    }
    recordAIUsage({ model, ok: true, tokens, profile: payload.profile });
    return { ok: true, text: contentText, toolCalls, model };
  } catch (e) {
    recordAIUsage({ ok: false, error: String(e && e.message || e) });
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function handleAIStream(port, payload = {}) {
  let recordDone = false;
  const tryRecord = (entry) => { if (!recordDone) { recordDone = true; recordAIUsage(entry); } };

  try {
    const { apiKey, model } = await aiResolveConfig(payload.model);
    if (!apiKey) {
      port.postMessage({ type: 'error', error: 'AI_NOT_CONFIGURED', message: 'ضع مفتاح OpenCode API في إعدادات المساعد الذكي أولاً' });
      return;
    }
    await aiThrottle();
    const body = aiBuildBody(payload, model, true);

    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    port.onDisconnect.addListener(() => { clearTimeout(timer); try { controller.abort(); } catch (_) {} });

    const MAX_STREAM_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_STREAM_ATTEMPTS; attempt++) {
      try {
        const resp = await fetch(OPENCODE_ZEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!resp.ok) {
          let errJson = {};
          try { errJson = await resp.json(); } catch (_) {}
          if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_STREAM_ATTEMPTS) {
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          const mapped = aiHttpError(resp.status, errJson);
          tryRecord({ model, ok: false, error: mapped.error, profile: payload.profile });
          port.postMessage({ type: 'error', error: mapped.error, message: mapped.message });
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
        tryRecord({ model, ok: true, tokens: Math.round(fullText.length / 4) || 0, profile: payload.profile });
        port.postMessage({ type: 'done', text: fullText, toolCalls, model });
        return;
      } catch (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') {
          tryRecord({ model, ok: false, error: 'AI_TIMEOUT', profile: payload.profile });
          port.postMessage({ type: 'error', error: 'AI_TIMEOUT', message: 'انتهت مهلة الاستجابة — حاول مرة أخرى' });
          return;
        }
        if (attempt < MAX_STREAM_ATTEMPTS) {
          await new Promise(r => setTimeout(r, attempt * 1000));
          continue;
        }
        tryRecord({ model, ok: false, error: String(e && e.message || e), profile: payload.profile });
        port.postMessage({ type: 'error', error: 'AI_NETWORK', message: String(e && e.message || e) });
        return;
      }
    }
  } catch (e) {
    tryRecord({ ok: false, error: String(e && e.message || e) });
    try { port.postMessage({ type: 'error', error: 'AI_FAILED', message: String(e && e.message || e) }); } catch (_) {}
  }
}

// منفذ البث: يبقي الـ service worker حياً أثناء توليد الرد
chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== 'elaraby-ai-stream') return;
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'START') return;
    handleAIStream(port, msg.payload || {});
  });
});
