// =========================================================
// background.js — Portal AutoFiller v2.0
// =========================================================

'use strict';

const MAX_REPORTS = 200;
const MAX_VALIDATION_PATTERNS = 2000;

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
