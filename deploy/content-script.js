// ============================================================================
// El Araby Portal Assistant — Unified Content Script
// Architecture: Modular V4 Engine Bridge & Core DOM Services
// Subsystems:
//   - Lookups: modules/autofill/engine-lookups.js
//   - Page 1:  modules/autofill/engine-page1.js
//   - Page 2:  modules/autofill/engine-page2.js
//   - Page 3:  modules/autofill/engine-page3.js
//   - Router:  modules/autofill/engine-orchestrator.js
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

const LOG_PREFIX = '[ElAraby Content]';

// ── Direct chrome.storage.local (V2 Core Foundation) ──
async function storageGet(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch(e) {
    return typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
  }
}
async function storageSet(data) {
  try {
    await chrome.storage.local.set(data);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: String(e) };
  }
}
async function storageRemove(keys) {
  try {
    await chrome.storage.local.remove(keys);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: String(e) };
  }
}

function sendSmartLog(eventType, details) {
  chrome.runtime.sendMessage({ type: 'SMART_LOG_EVENT', event: { pageVisitId: null, url: location.href, pageType: getPageType(), timestamp: Date.now(), eventType, isAutomated: document.body?.dataset?.isAutofilling === 'true', ...details } }).catch(()=>{});
}

async function sysLog(msg, type='info') {
  const symbol = type === 'error' ? 'Œ' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
  const text = `[${new Date().toLocaleTimeString('en-US', {hour12:false})}] ${symbol} ${msg}`;
  console.log(LOG_PREFIX, text);
  try {
    const data = await storageGet({ sysLogs: [] });
    const sysLogs = data.sysLogs || [];
    sysLogs.push(text);
    if (sysLogs.length > 300) sysLogs.shift();
    await storageSet({ sysLogs });
    chrome.runtime.sendMessage({ type: 'NEW_LOG' }).catch(()=>{});
  } catch(e){}
}

const log  = (...a) => sysLog(a.join(' '), 'info');
const warn = (...a) => sysLog(a.join(' '), 'warn');
const err  = (...a) => sysLog(a.join(' '), 'error');

// ── Multi-Run Runtime Trace (Diagnostic) ──────────────────
const TRACE_KEY = 'multiRunRuntimeTrace';
const MAX_TRACE_ENTRIES = 150;

function traceEvent(event, details = {}) {
  // ⚠️ نُبقي كل الحقول الإضافية ({ error, stack, ... }) وإلا تُضيع رسالة الخطأ
  const {
    tabId = null,
    taskId = null,
    orderId = null,
    url = location.href,
    processingTabId = null,
    currentTaskPresent = false,
    queueLength = 0,
    details: innerDetails,
    ...rest
  } = details;

  const entry = {
    timestamp: new Date().toISOString(),
    event,
    tabId,
    taskId,
    orderId,
    url,
    processingTabId,
    currentTaskPresent,
    queueLength,
    details: innerDetails !== undefined ? innerDetails : (Object.keys(rest).length ? rest : null)
  };
  
  chrome.runtime.sendMessage({ 
    type: 'TRACE_APPEND', 
    entry
  }).catch(()=>{});
  console.log(`%c[ContentScript-Trace] [${event}]`, 'color: #3b82f6; font-weight: bold;', details);
}

window.traceEvent = traceEvent;

function clearMultiRunTrace() {
  chrome.runtime.sendMessage({ type: 'TRACE_CLEAR' }).catch(()=>{});
}
window.clearMultiRunTrace = clearMultiRunTrace;

window.getMultiRunTrace = function() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'TRACE_GET' }, (resp) => {
      resolve(resp?.trace || []);
    });
  });
};

window.dumpMultiRunTrace = async function() {
  const trace = await window.getMultiRunTrace();
  console.log('📋 === MULTI RUN TRACE DUMP (' + trace.length + ' entries) ===');
  console.table(trace);
  return trace;
};

window.copyMultiRunTrace = async function() {
  const trace = await window.getMultiRunTrace();
  const text = JSON.stringify(trace, null, 2);
  await navigator.clipboard.writeText(text);
  console.log('✅ MultiRun Trace copied to clipboard (' + trace.length + ' entries)');
  showPageToast('✅ تم نسخ سجل التتبع للحافظة (' + trace.length + ' حدث)', 'success');
  return text;
};

// Self-test trace for content script
chrome.runtime.sendMessage({
  type: 'TRACE_APPEND',
  entry: {
    timestamp: new Date().toISOString(),
    event: 'TRACE_SELF_TEST',
    source: 'content-script'
  }
}).catch(()=>{});

// Version marker for deployment verification
traceEvent('CONTENT_SCRIPT_VERSION', { version: '1.0.0-lifecycle-fix', url: location.href });

// ── Utility: Safe Click to catch and log silent UI errors ──
function safeClick(element, description = 'element') {
  if (!element) { warn(`safeClick: ${description} is null or undefined.`); return false; }
  try {
    document.body.dataset.isAutofilling = 'true';
    element.focus?.();
    element.click();
    element.dispatchEvent(new Event('click', { bubbles: true }));
    setTimeout(() => { delete document.body.dataset.isAutofilling; }, 50);
    return true;
  } catch (e) {
    delete document.body.dataset.isAutofilling;
    err(`💥 safeClick failed for ${description}: ${e.message}`);
    return false;
  }
}
function getPageType() {
  const url = location.href.toLowerCase();
  if (url.includes('workorderreview') || url.includes('followup')) return 'WORK_ORDER_REVIEW';
  if (url.includes('/orders')) return 'ORDERS';
  return 'OTHER';
}

// ── Page Toast notification ── (هوية العربي #17334c)
function showPageToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const colors = { info: '#17334c', success: '#17334c', error: '#ef5350', warn: '#ffa726' };
  Object.assign(toast.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999,
    padding: '12px 20px', borderRadius: '8px', background: colors[type] || '#4fc3f7',
    color: '#fff', fontFamily: 'Segoe UI, sans-serif', fontSize: '14px',
    fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'opacity 0.3s'
  });
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

let _routerRunning = false; // Mutex: prevents parallel execution

// ── دوال مشتركة: المصدر الوحيد في shared/portal-selectors.js ──
// ⚠️ تُعرَّف بـ const وليست function declaration:
// function declaration في ملف content script عادي (بدون IIFE) تُسجَّل على window،
// فتستولي على الدالة الأصلية من portal-selectors.js وتصبح دالة تنادي نفسها،
// والنتيجة: RangeError: Maximum call stack size exceeded عند أول استخدام.
const loadSelectors = async () => (window.loadSelectors ? window.loadSelectors() : {});
const findFirst = (list) => (window.findFirst ? window.findFirst(list) : null);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Dynamic Resilience Wait for PowerApps Loading Overlay ──
async function waitForSaveComplete(startUrl, cfg, maxWaitMs = 15000) {
  log('³ Waiting for PowerApps to process (Dynamic Wait)...');
  await sleep(1000); // Give UI time to show loading overlay
  const sw = Date.now();
  let isSaved = false;
  
  while (Date.now() - sw < maxWaitMs) {
    if (findFirst(cfg.successIndicator || [])) { isSaved = true; break; }
    if (location.href !== startUrl && !location.href.includes('stepid=')) { isSaved = true; break; }
    
    const isBlocked = !!document.querySelector('.blockUI, .blockOverlay, .loading-spinner');
    const hasError = !!document.querySelector('.alert-danger, .validation-summary-errors');
    
    if (!isBlocked && hasError) {
      warn('⚠️ Validation error appeared during wait. Aborting wait.');
      break;
    }
    await sleep(1000);
  }
  return isSaved;
}

function nativeSetValue(el, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor && descriptor.set) { try { descriptor.set.call(el, value); } catch(e){} } else { el.value = value; }
}

async function emulateUserInput(el, value) {
  try { el.focus(); } catch(e){}
  document.body.dataset.isAutofilling = 'true';
  nativeSetValue(el, value);
  try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
  await sleep(150); 
  try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
  setTimeout(() => { delete document.body.dataset.isAutofilling; }, 50);
}

function findFieldByLabel(labelTexts, tagName = null) {
  if (!Array.isArray(labelTexts)) labelTexts = [labelTexts];
  const inputQuery = tagName ? tagName : 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]), select, textarea';
  for (const text of labelTexts) {
    for (const lbl of Array.from(document.querySelectorAll('label'))) {
      const raw = (lbl.textContent || lbl.innerText || '').replace(/[*\s]/g, '');
      const needle = text.replace(/\s/g, '');
      if (!raw.includes(needle)) continue;
      const forId = lbl.getAttribute('for');
      if (forId) { const el = document.getElementById(forId); if (el && (!tagName || el.tagName.toLowerCase()===tagName.toLowerCase())) return el; }
      const container = lbl.closest('.form-group,.field,.control,.fieldset,.row,.question,[class*="field"],[class*="form-"]') || lbl.parentElement;
      if (container) { const el = container.querySelector(inputQuery); if (el && el !== lbl && (!tagName || el.tagName.toLowerCase()===tagName.toLowerCase())) return el; }
      let ancestor = lbl.parentElement;
      for (let i = 0; i < 2 && ancestor; i++) { const el = ancestor.querySelector(inputQuery); if (el && el !== lbl && (!tagName || el.tagName.toLowerCase()===tagName.toLowerCase())) return el; ancestor = ancestor.parentElement; }
      let sib = lbl.nextElementSibling;
      for (let i = 0; i < 4 && sib; i++) {
        if ((!tagName || sib.tagName.toLowerCase()===tagName.toLowerCase()) && /^(INPUT|SELECT|TEXTAREA)$/.test(sib.tagName)) return sib;
        const nested = sib.querySelector(inputQuery); if (nested && (!tagName || nested.tagName.toLowerCase()===tagName.toLowerCase())) return nested;
        sib = sib.nextElementSibling;
      }
    }
  } return null;
}

// ════════════════════════════════════════════════════════════════════
// DEVICE DATA CLEAR — Manual trigger, one-time, non-persistent
// mode: 'all' (default) | 'hidden-only'
// ═══════════════════════════════════════════════════════════════════
function findInAllFrames(selectors) {
  const docs = [document];
  document.querySelectorAll('iframe').forEach(f => {
    try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(e) {}
  });
  for (const doc of docs) {
    for (const s of Array.isArray(selectors) ? selectors : [selectors]) {
      try { const el = doc.querySelector(s); if (el) return { el, doc }; } catch(_) {}
    }
  }
  return null;
}




// ── Check if Page 1 fields are already filled (skip already-processed orders) ──



// ── AUTOFIL ENGINE BACKWARD-COMPATIBILITY BRIDGES ───────────────────────────
// Wire up window-level functions to point to the specialized engine modules
let Lookups, Page1, Page2, Page3, Orchestrator;
try {
  Lookups = window.AutoFillEngine?.Lookups || {};
  Page1 = window.AutoFillEngine?.Page1 || {};
  Page2 = window.AutoFillEngine?.Page2 || {};
  Page3 = window.AutoFillEngine?.Page3 || {};
  Orchestrator = window.AutoFillEngine?.Orchestrator || {};
  traceEvent('BRIDGES_READY', { hasLookups: !!Lookups, hasPage1: !!Page1, hasOrchestrator: !!Orchestrator });
} catch (e) {
  traceEvent('BRIDGES_ERROR', { error: String(e) });
  Lookups = Page1 = Page2 = Page3 = Orchestrator = {};
}

// ── REGISTER MESSAGE LISTENER EARLY (main frame only — prevents duplicate handlers in iframes) ──
if (window === window.top && window.AutoFillEngine?.Orchestrator?.registerMessageListener) {
  window.AutoFillEngine.Orchestrator.registerMessageListener();
  traceEvent('MESSAGE_LISTENER_REGISTERED', { url: location.href, frame: 'top' });
}

// ── DEFENSIVE ORCHESTRATOR BOOTSTRAP ────────────────────────────────────────
(async function bootstrapOrchestrator() {
  try {
    let Orchestrator = window.AutoFillEngine?.Orchestrator;

    traceEvent('ORCHESTRATOR_BOOTSTRAP', {
      hasGlobal: !!Orchestrator,
      hasProcessQueueOnLoad: typeof Orchestrator?.processQueueOnLoad === 'function',
      url: location.href,
      frame: window !== window.top ? 'iframe' : 'top'
    });

    if (!Orchestrator?.processQueueOnLoad) {
      await new Promise(r => queueMicrotask(r));
      Orchestrator = window.AutoFillEngine?.Orchestrator;
      traceEvent('ORCHESTRATOR_RETRY', {
        hasGlobal: !!Orchestrator,
        hasProcessQueueOnLoad: typeof Orchestrator?.processQueueOnLoad === 'function'
      });
    }

    if (!Orchestrator?.processQueueOnLoad) {
      traceEvent('ORCHESTRATOR_FALLBACK', { reason: 'direct_invoke' });
      try {
        await chrome.runtime.sendMessage({ type: 'INVOKE_PROCESS_QUEUE_ON_LOAD' });
      } catch (e) {
        traceEvent('ORCHESTRATOR_FALLBACK_FAILED', { error: String(e) });
      }
      return;
    }

    traceEvent('PROCESS_QUEUE_ON_LOAD_INVOKED', { url: location.href });
    Orchestrator.processQueueOnLoad().catch(e => {
      // نُظهر الخطأ نصًا + مكانه، وإلا تعذّر تشخيص توقّف الدورة
      traceEvent('PROCESS_QUEUE_ON_LOAD_ERROR', {
        error: String((e && e.message) || e),
        name: (e && e.constructor && e.constructor.name) || 'Error',
        stack: (e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null
      });
      try { showPageToast('⚠️ توقّف التشغيل: ' + ((e && e.message) || e), 'error'); } catch (_) {}
      try { console.error('[AutoFill] processQueueOnLoad failed:', e); } catch (_) {}
    });
  } catch (e) {
    traceEvent('BOOTSTRAP_CRASH', { error: String(e), stack: e?.stack });
  }
})();
// ──────────────────────────────────────────────────────────────────────────────

// Lookups
const findSafeLookupButton     = Lookups.findSafeLookupButton;
const dispatchClickSequence    = Lookups.dispatchClickSequence;
const fillLookupModal          = Lookups.fillLookupModal;
const waitForModalCloseIfOpen  = Lookups.waitForModalCloseIfOpen;
const waitForModalIframe       = Lookups.waitForModalIframe;
const handlePage2Modal         = Lookups.handlePage2Modal;
const fillPowerAppsLookup      = Lookups.fillPowerAppsLookup;
const waitForModalStable       = Lookups.waitForModalStable;
const handleSubgridIframeModal = Lookups.handleSubgridIframeModal;

// Page 1
const readDeviceTypeFromPage             = Page1.readDeviceTypeFromPage;
const readComplaintCodeFromPage          = Page1.readComplaintCodeFromPage;
const isInstallationReport              = Page1.isInstallationReport;
const performInstallationAndCommissioning = Page1.performInstallationAndCommissioning;
const isPage1AlreadyFilled               = Page1.isPage1AlreadyFilled;
const clearAllDeviceFields               = Page1.clearAllDeviceFields;
const executePage1_Review                = Page1.executePage1_Review;

// Page 2
const getProblemCode          = Page2.getProblemCode;
const getSmartProblemCode     = Page2.getSmartProblemCode;
const hasExistingSubgridRow   = Page2.hasExistingSubgridRow;
const selectRandomTechnician  = Page2.selectRandomTechnician;
const executePage2_FollowUp   = Page2.executePage2_FollowUp;

// Page 3
const collectAllDocs               = Page3.collectAllDocs;
const formatMoney                  = Page3.formatMoney;
const readIsLscFromPage            = Page3.readIsLscFromPage;
const findCommentField             = Page3.findCommentField;
const waitForSparePartsGrid        = Page3.waitForSparePartsGrid;
const extractSparePartRows         = Page3.extractSparePartRows;
const readSparePartsTotalFromField = Page3.readSparePartsTotalFromField;
const readCollectedAmount          = Page3.readCollectedAmount;
const handleSparePartsComment      = Page3.handleSparePartsComment;
const addFaultCodePage3            = Page3.addFaultCodePage3;
const executePage3_Resolution      = Page3.executePage3_Resolution;

// Orchestrator & Router
const normalizeTaskData       = Orchestrator.normalizeTaskData;
const extractOrderIdFromLine  = Orchestrator.extractOrderIdFromLine;
// ⚠️ const وليست function declaration — نفس السبب أعلاه (تجنّب الاستيلاء على window.generateTaskId)
const generateTaskId = () => (window.generateTaskId ? window.generateTaskId() : ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)));
const buildTasksFromLines     = Orchestrator.buildTasksFromLines;
const notifyStatus            = Orchestrator.notifyStatus;
const clearCurrentTask        = Orchestrator.clearCurrentTask;
const startNextTask           = Orchestrator.startNextTask;
const getActivePageFeature    = Orchestrator.getActivePageFeature;
const showOverlay             = Orchestrator.showOverlay;
const showMasahaOverlay       = Orchestrator.showMasahaOverlay;
const executeWorkflow         = Orchestrator.executeWorkflow;
const findOrderAndOpen        = Orchestrator.findOrderAndOpen;
const runSingleLineWithRouter = Orchestrator.runSingleLineWithRouter;
const processQueueOnLoad      = Orchestrator.processQueueOnLoad;
const openSession             = Orchestrator.openSession;
const finalizeOrderInSession  = Orchestrator.finalizeOrderInSession;
const finalizeSession         = Orchestrator.finalizeSession;

// Ensure all are bound on window for any external callers
Object.assign(window, {
  findSafeLookupButton, dispatchClickSequence, fillLookupModal,
  waitForModalCloseIfOpen, waitForModalIframe, handlePage2Modal,
  fillPowerAppsLookup, waitForModalStable, handleSubgridIframeModal,
  readDeviceTypeFromPage, readComplaintCodeFromPage, isInstallationReport,
  performInstallationAndCommissioning, isPage1AlreadyFilled, clearAllDeviceFields,
  executePage1_Review, getProblemCode, getSmartProblemCode, hasExistingSubgridRow,
  selectRandomTechnician, executePage2_FollowUp, collectAllDocs, formatMoney,
  readIsLscFromPage, findCommentField, waitForSparePartsGrid, extractSparePartRows,
  readSparePartsTotalFromField, readCollectedAmount, handleSparePartsComment,
  addFaultCodePage3, executePage3_Resolution, normalizeTaskData,
  extractOrderIdFromLine, buildTasksFromLines, notifyStatus,
  clearCurrentTask, startNextTask, getActivePageFeature, showOverlay,
  showMasahaOverlay, executeWorkflow, findOrderAndOpen, runSingleLineWithRouter,
  processQueueOnLoad, openSession, finalizeOrderInSession, finalizeSession,
  safeClick, emulateUserInput, waitForSaveComplete
});









// --- Device Data Extraction Logic ---
async function startDeviceDataExtraction() {
  const currentUrl = window.location.href;
  if (currentUrl.includes('workorderreview')) {
    performExtractionAndLog();
  } else if (currentUrl.includes('Reportdetail')) {
    await storageSet({ extractingDeviceData: true });
    window.location.href = currentUrl.replace('Reportdetail', 'technicalreviewdetails');
  } else if (currentUrl.includes('technicalreviewdetails')) {
    performExtractionAndLog();
  } else {
    alert('الرجاء فتح صفحة workorderreview أو Reportdetail أو technicalreviewdetails للقيام بسحب البيانات.');
  }
}

// Check if we arrived at technicalreviewdetails specifically to extract data
(async () => {
  const res = await storageGet(['extractingDeviceData']);
  if (res.extractingDeviceData && window.location.href.includes('technicalreviewdetails')) {
    await storageRemove('extractingDeviceData');
    performExtractionAndLog();
  }
})();

function qSel(selector, root) {
  let el = (root || document).querySelector(selector);
  if (el) return el;
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iDoc) el = iDoc.querySelector(selector);
      if (el) return el;
    } catch(e) {}
  }
  return null;
}

async function performExtractionAndLog(attempt = 1) {
  // Helper: try selectors in order, return first element with valid (non-empty, non-"0") value
  function pickValid(candidates, invalid = ['', '0', 'غير محدد']) {
    for (const c of candidates) {
      let el = null;
      try { el = typeof c === 'string' ? qSel(c) : c; } catch(e) {}
      if (!el) continue;
      const v = (el.value ?? el.innerText ?? '').toString().trim();
      if (!v) continue;
      if (invalid.includes(v)) continue;
      if (v.length < 2 && v !== '0') continue;
      return el;
    }
    return null;
  }
  let _cfg = null; try { _cfg = await loadSelectors(); } catch(e) {}
  // Build candidate lists — qSel variants FIRST (iframe-aware) then CFG then label fallback
  const brandCandidates = [
    'input[aria-label="علامة تجارية"]', 'input[aria-label*="علامة"]', '#ats_producttypebrand_name',
    ...(_cfg?.brandInput || []),
    findFieldByLabel(['العلامة التجاريه','العلامة التجارية','علامة تجارية','Brand'], 'input')
  ];
  const modelCandidates = [
    'input[aria-label="الموديل الفعلى 1"]', 'input[aria-label="الموديل الفعلي 1"]', 'input[aria-label*="الموديل الفعلي"]', 'input[aria-label*="الموديل"]', '#ldv_actualmodel_name',
    ...(_cfg?.modelInput || []),
    findFieldByLabel(['الموديل الفعلي 1','الموديل الفعلى 1','الموديل الفعلي','Model'], 'input')
  ];
  const model2Candidates = [
    'input[aria-label="الموديل الفعلى 2"]', 'input[aria-label="الموديل الفعلي 2"]', '#ldv_actualmodel2_name',
    ...(_cfg?.modelInput2 || []),
    findFieldByLabel(['الموديل الفعلي 2','الموديل الفعلى 2'], 'input')
  ];
  const serialCandidates = [
    '#ldv_technicalserialnumber', '#ldv_serialnumber', '[aria-label*="الرقم المسلسل"]',
    ...(_cfg?.serial || []),
    findFieldByLabel(['الرقم المسلسل','الرقم التسلسلي','Serial'], 'input')
  ];
  const serial2Candidates = [
    '#ldv_secondtechnicalserial', '#ldv_serialnumber1', '[aria-label*="الرقم المسلسل 2"]',
    ...(_cfg?.serial2 || []),
    findFieldByLabel(['الرقم المسلسل 2','Serial 2'], 'input')
  ];

  // For brand/model, skip "0" and "غير محدد"; for serial, allow "لا يوجد" (so don't filter it)
  const brandEl = pickValid(brandCandidates);
  const modelEl = pickValid(modelCandidates);
  const model2El = pickValid(model2Candidates, ['', '0', 'غير محدد', 'لا يوجد']);
  // Serial: allow "لا يوجد" — so invalid only ["", "0"? but user wants "لا يوجد" shown, so keep it]
  // Try valid first, fallback to any found (even if "لا يوجد")
  let serial1El = pickValid(serialCandidates, ['', '0']);
  if (!serial1El) serial1El = qSel('#ldv_technicalserialnumber') || qSel('[aria-label*="الرقم المسلسل"]') || (_cfg && findFirst(_cfg.serial)) || findFieldByLabel(['الرقم المسلسل'], 'input');
  let serial2El = pickValid(serial2Candidates, ['', '0']);
  if (!serial2El) serial2El = qSel('#ldv_secondtechnicalserial') || (_cfg && findFirst(_cfg.serial2));

  const brandRaw = brandEl?.value || brandEl?.innerText || '';
  let model1 = modelEl?.value || modelEl?.innerText || '';
  let model2 = model2El?.value || model2El?.innerText || '';
  const serial1 = serial1El?.value || serial1El?.innerText || '';
  const serial2 = serial2El?.value || serial2El?.innerText || '';

  // Fallback: if model1 still "0" or empty, scan all model-like inputs for a valid code (contains letters+numbers and "-")
  if (!model1 || model1.trim() === '0' || model1.trim() === 'غير محدد') {
    const allModelInputs = Array.from(document.querySelectorAll('input[id*="actualmodel"], input[aria-label*="الموديل"]')).concat(
      ...Array.from(document.querySelectorAll('iframe')).map(f => { try { return Array.from((f.contentDocument||f.contentWindow?.document||document).querySelectorAll('input[id*="actualmodel"], input[aria-label*="الموديل"]')); } catch(e){ return []; } }).flat()
    );
    for (const inp of allModelInputs) {
      const v = (inp.value || inp.innerText || '').trim();
      if (v && v !== '0' && v !== 'غير محدد' && /[A-Z]{1,3}-/.test(v)) { model1 = v; break; }
    }
  }

  // Clean brand: "ثلاجات - TOSHIBA" / "تكييف - SHARP" → "TOSHIBA"/"SHARP" (last segment after -/–/—/|)
  const brand = (() => { const b = brandRaw.trim(); if (!b) return ''; const parts = b.split(/\s*[-–—|]\s*/); return parts.length > 1 ? parts[parts.length - 1].trim() : b; })();

  if ((!brand || !model1 || !serial1) && attempt <= 20) {
    setTimeout(() => performExtractionAndLog(attempt + 1), 500);
    return;
  }

  const extractCode = (s) => (s || '').split(/\s*[_–—]\s*/)[0].split('(')[0].trim();
  const model1Code = extractCode(model1) || model1 || 'غير محدد';
  const model2Code = extractCode(model2) || model2 || '';
  const finalSerial2 = serial2.trim();
  const brandText = brand || 'غير محدد';

  const d = new Date();
  const today = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  const lines = [];
  lines.push(`OrderId: Unknown | Brand: ${brandText} | Model: ${model1Code} | Serial: ${serial1 || 'غير محدد'} | Status: Out of Warranty | Date: ${today}`);
  if (model2Code && finalSerial2) {
    lines.push(`OrderId: Unknown | Brand: ${brandText} | Model: ${model2Code} | Serial: ${finalSerial2} | Status: Out of Warranty | Date: ${today}`);
  }

  const copyText = lines.join('\n');

  const sessionLog = {
    sessionId: `ext_${Date.now()}`,
    orderId: `مسحوب (${(window.location.search.match(/id=([^&]+)/)?.[1] || 'unknown').substring(0,8)}...)`,
    startTime: Date.now(),
    steps: [],
    details: { brand: brandText, model: model1Code, serial: lines.length > 1 ? `${serial1} / ${finalSerial2}` : serial1 },
    status: 'success'
  };

  const res = await storageGet({ sessionLogs: [] });
  const sessionLogs = res.sessionLogs || [];
  sessionLogs.unshift(sessionLog);
  await storageSet({ sessionLogs });
  chrome.runtime.sendMessage({ type: 'NEW_LOG' }).catch(()=>{});

  const overlay = document.createElement('div');
  overlay.id = 'ext-device-overlay';
  overlay.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: #17334c; color: #ffffff;
    padding: 16px 20px; border-radius: 10px; z-index: 999999; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: Consolas, 'Courier New', monospace; direction: ltr; font-size: 13px; max-width: 600px; border: 1px solid rgba(255,255,255,0.15);
  `;
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:15px;font-family:Arial,sans-serif; color:#ffffff;">✅ تم سحب بيانات الجهاز بنجاح!</span>
      <div style="display:flex;gap:8px;">
        <button id="ext-copy-btn" style="background:#ffffff;color:#17334c;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">📋 نسخ</button>
        <button id="ext-hide-btn" style="background:rgba(255,255,255,0.15);color:#ffffff;border:1px solid rgba(255,255,255,0.35);padding:5px 10px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">✖️ إخفاء</button>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.08);padding:10px 12px;border-radius:6px;white-space:pre-wrap;line-height:1.8; color:#ffffff; border:1px solid rgba(255,255,255,0.12);">${copyText}</div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ext-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(copyText).then(() => {
      const btn = overlay.querySelector('#ext-copy-btn');
      btn.textContent = '✅ تم النسخ!';
      btn.style.color = '#17334c';
      setTimeout(() => { btn.textContent = '📋 نسخ'; btn.style.color = '#17334c'; }, 1500);
    });
  });
  overlay.querySelector('#ext-hide-btn').addEventListener('click', () => overlay.remove());

  setTimeout(() => overlay.remove(), 15000);
}
// ═══════════════════════════════════════════════════════════
// SESSION CAPTURE RECORDER — تسجيل الجلسة لحظة بلحظة
// لقطات دورية لصفحات workorderreview + الأزرار + الحقول + الكليكات
// مرتبطة بمعرّف أمر الشغل لتتبع البيانات قبل أي انتقال للصفحة.
// ═══════════════════════════════════════════════════════════
const SESSION_CAPTURE_KEY = 'autofiller_sessionCaptures';
const MAX_SESSION_CAPTURES = 500;
// سقف عام لعدد أوامر الشغل المخزنة في التخزين — لمنع تجاوز حصة 5MB
const MAX_TRACKED_ORDERS = 50;
// عدد اللقطات الحديثة التي نحتفظ بـ options[] كاملةً؛ للقطات الأقدم تُسقط الخيارات لتقليل الحجم
const MAX_FULL_OPTION_CAPTURES = 10;

function getOrderIdFromUrl() {
  return (window.location.search.match(/[?&]id=([^&]+)/) || [])[1] || 'unknown';
}
function getStepIdFromUrl() {
  return (window.location.search.match(/[?&]stepid=([^&]+)/) || [])[1] || 'none';
}

// جمع كل الحقول المنسدلة مع القيمة المختارة + الخيارات
function captureSelects(root = document) {
  const out = [];
  const selects = Array.from(root.querySelectorAll('select')).filter(s => s.offsetParent !== null || s.id);
  for (const sel of selects) {
    const labelEl = root.querySelector(`label[for="${sel.id}"]`);
    const label = labelEl ? (labelEl.textContent || '').trim() : (sel.getAttribute('aria-label') || sel.getAttribute('data-logical-name') || sel.name || sel.id);
    out.push({
      id: sel.id,
      name: sel.name || '',
      label,
      selectedValue: sel.value || '',
      selectedText: (Array.from(sel.options).find(o => o.value === sel.value) || {}).text || '',
      options: Array.from(sel.options).map(o => ({ value: o.value, text: (o.text || '').trim() }))
    });
  }
  return out;
}

// جمع كل الحقول النصية المرئية
function captureInputs(root = document) {
  const out = [];
  const els = Array.from(root.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]), textarea')).filter(el => el.offsetParent !== null);
  for (const el of els) {
    const labelEl = root.querySelector(`label[for="${el.id}"]`);
    const label = labelEl ? (labelEl.textContent || '').trim() : (el.getAttribute('aria-label') || el.getAttribute('data-logical-name') || el.name || el.id);
    out.push({
      id: el.id,
      name: el.name || '',
      label,
      tag: el.tagName.toLowerCase(),
      value: (el.value || '').slice(0, 500)
    });
  }
  return out;
}

// جمع الأزرار والروابط القابلة للنقر مع عنوانها
function captureButtons(root = document) {
  const out = [];
  const btns = Array.from(root.querySelectorAll('button, input[type=button], input[type=submit], a.btn, a[role=button]')).filter(el => el.offsetParent !== null);
  for (const b of btns) {
    const txt = (b.textContent || b.value || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
    if (!txt) continue;
    out.push({
      tag: b.tagName.toLowerCase(),
      id: b.id || '',
      text: txt.slice(0, 120),
      title: (b.getAttribute('title') || '').slice(0, 120)
    });
  }
  return out;
}

// تسجيل لحظة حالية من الصفحة
async function capturePageState(pageType, reason) {
  try {
    const orderId = getOrderIdFromUrl();
    const stepId = getStepIdFromUrl();
    const url = location.href;
    if (!/workorderreview|followup|review/i.test(url) && !pageType) return;

    // جمع من document + كل الـ iframes
    const selects = [];
    const inputs = [];
    const buttons = [];
    const seen = new Set();
    for (const doc of collectAllDocs(document)) {
      if (!doc || seen.has(doc)) continue;
      seen.add(doc);
      selects.push(...captureSelects(doc));
      inputs.push(...captureInputs(doc));
      buttons.push(...captureButtons(doc));
    }

    const feature = pageType || (await getActivePageFeature().catch(() => ''));
    const capture = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      url,
      orderId,
      stepId,
      pageType: feature,
      reason: reason || 'page-load',
      selects,
      inputs,
      buttons,
      title: document.title || ''
    };

    // حفظ مجمّعة: captureByOrderId[orderId].pages[]
    const { [SESSION_CAPTURE_KEY]: all } = await storageGet({ [SESSION_CAPTURE_KEY]: {} });
    const byOrder = all || {};
    if (!byOrder[orderId]) byOrder[orderId] = { orderId, firstSeen: Date.now(), pages: [], events: [] };
    byOrder[orderId].lastSeen = Date.now();
    capture.seq = (byOrder[orderId].pages.length || 0) + (byOrder[orderId].events.length || 0) + 1;
    capture.delta = capture.ts - byOrder[orderId].firstSeen;

    // إسقاط options[] للقطات الأقدم لتقليل حجم التخزين
    if (byOrder[orderId].pages.length >= MAX_FULL_OPTION_CAPTURES) {
      capture.options = capture.options?.slice(0, 5) || [];
      capture.inputs = capture.inputs?.slice(0, 10) || [];
      capture.buttons = capture.buttons?.slice(0, 10) || [];
    }

    byOrder[orderId].pages.push(capture);
    // حد أقصى للصفحات المخزنة لكل أمر
    if (byOrder[orderId].pages.length > 60) byOrder[orderId].pages = byOrder[orderId].pages.slice(-60);

    // سقف عام: إذا زاد عدد الأوامر عن MAX_TRACKED_ORDERS، احذف الأقدم (حسب lastSeen)
    const orderIds = Object.keys(byOrder);
    if (orderIds.length > MAX_TRACKED_ORDERS) {
      orderIds.sort((a, b) => (byOrder[a].lastSeen || 0) - (byOrder[b].lastSeen || 0));
      const toRemove = orderIds.slice(0, orderIds.length - MAX_TRACKED_ORDERS);
      for (const oldId of toRemove) {
        delete byOrder[oldId];
      }
      log(`📸 SessionCapture: trimmed ${toRemove.length} old orders (cap=${MAX_TRACKED_ORDERS})`);
    }

    await storageSet({ [SESSION_CAPTURE_KEY]: byOrder });

    log(`📸 SessionCapture [${feature}] order=${orderId.slice(0,8)} selects=${selects.length} inputs=${inputs.length} buttons=${buttons.length} reason=${reason}`);
    return capture;
  } catch (e) {
    warn('SessionCapture error: ' + e.message);
  }
}

// تسجيل كليك المستخدم على عناصر مهمة
function hookCaptureClicks() {
  try {
    document.addEventListener('click', (e) => {
      try {
        const t = e.target;
        const el = t.closest ? (t.closest('button, input[type=button], input[type=submit], a.btn, select, [role=button], a[href*="workorderreview"], a[href*="followup"]') || t) : t;
        if (!el) return;
        const txt = (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        const tag = el.tagName.toLowerCase();
        const id = el.id || '';
        // سجل فقط الكليكات المهمة (أزرار/روابط تنقل/selects) لتقليل الضوضاء
        const isImportant = ['button', 'a', 'input[type=button]', 'input[type=submit]'].includes(tag) || tag === 'select' ||
          /اضافة|حفظ|save|submit|التالي|next|كود عطل|قطعة غيار|تعديل|إلغاء|cancel/i.test(txt);
        if (!isImportant) return;
        setTimeout(async () => {
          try {
            const orderId = getOrderIdFromUrl();
            const { [SESSION_CAPTURE_KEY]: all } = await storageGet({ [SESSION_CAPTURE_KEY]: {} });
            const byOrder = all || {};
            if (!byOrder[orderId]) byOrder[orderId] = { orderId, firstSeen: Date.now(), pages: [] };
if (!byOrder[orderId].events) byOrder[orderId].events = [];
            const ev = { ts: Date.now(), iso: new Date().toISOString(), type: 'click', tag, id, text: txt, url: location.href };
            ev.seq = (byOrder[orderId].pages.length || 0) + (byOrder[orderId].events.length || 0) + 1;
            ev.delta = ev.ts - byOrder[orderId].firstSeen;
            byOrder[orderId].events.push(ev);
            if (byOrder[orderId].events.length > 200) byOrder[orderId].events = byOrder[orderId].events.slice(-200);
            await storageSet({ [SESSION_CAPTURE_KEY]: byOrder });
          } catch (_) {}
        }, 0);
      } catch (_) {}
    }, true);
  } catch (_) {}
}

// مراجع الموارد للتنظيف عند مغادرة الصفحة
let sessionCaptureInterval = null;
let technicianModalObserver = null;
let technicianModalInterval = null;

// الربط بين captureByOrderId الحالي في كل صفحة والصفحات التالية
// يُستدعى عند تحميل كل صفحة بعد ثانية من الجاهزية
async function initSessionCapture() {
  // حماية من التهيئة المزدوجة
  if (window._sessionCaptureInitialized) return;
  window._sessionCaptureInitialized = true;

  if (!/workorderreview|followup|review/i.test(location.href)) return;
  hookCaptureClicks();
  setTimeout(() => capturePageState('', 'page-load'), 1500);
  // استمر بالتقاط لقطات دورية (5ث) للصفحات التي لا تعيد التحميل (SPA)
  sessionCaptureInterval = setInterval(() => {
    if (document.visibilityState === 'visible') capturePageState('', 'interval');
  }, 5000);
}
initSessionCapture();

// ── MAIN WORLD BRIDGE (Makes dumpMultiRunTrace & copyMultiRunTrace work in F12 console) ──
function injectPageBridge() {
  if (window !== window.top) return;
  try {
    const script = document.createElement('script');
    script.textContent = `
      window.dumpMultiRunTrace = function() {
        window.postMessage({ type: '__ELARABY_CMD__', cmd: 'dump' }, '*');
      };
      window.copyMultiRunTrace = function() {
        window.postMessage({ type: '__ELARABY_CMD__', cmd: 'copy' }, '*');
      };
      console.log('%c[العربي ديف] تم تفعيل dumpMultiRunTrace() و copyMultiRunTrace() في الكونسول مباشرة', 'color:#10b981;font-weight:bold;');
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (_) {}

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.type !== '__ELARABY_CMD__') return;
    if (e.data.cmd === 'dump') {
      const trace = await window.getMultiRunTrace?.() || [];
      console.log('📋 === MULTI RUN TRACE DUMP (' + trace.length + ' entries) ===');
      console.table(trace);
    } else if (e.data.cmd === 'copy') {
      await window.copyMultiRunTrace?.();
    }
  });
}

injectPageBridge();

// ── V2 Core: Trigger Queue Processing on Page Load ──
if (window === window.top) {
  if (typeof processQueueOnLoad === 'function') {
    processQueueOnLoad().catch(e => console.error('[AutoFill] processQueueOnLoad error:', e));
  } else if (window.AutoFillEngine?.Orchestrator?.processQueueOnLoad) {
    window.AutoFillEngine.Orchestrator.processQueueOnLoad().catch(e => console.error('[AutoFill] processQueueOnLoad error:', e));
  }
}

// ── Global Observer: Auto-capture Technician Roster from any open modal ──
function initTechnicianModalWatcher() {
  function collectAllDocs(rootDoc) {
    const docs = [rootDoc];
    try {
      rootDoc.querySelectorAll('iframe').forEach(f => {
        try {
          const d = f.contentDocument || f.contentWindow?.document;
          if (d) docs.push(...collectAllDocs(d));
        } catch(_) {}
      });
    } catch(_) {}
    return docs;
  }

  function checkModalForTechnicians(modal) {
    if (!modal) return;
    const txt = modal.innerText || '';
    if (!/Full\s*Name|الفن|Technician|Mobile\s*Phone/i.test(txt)) return;
    // Exclude header rows strictly — only data rows in tbody or role="row" with td
    const rows = Array.from(modal.querySelectorAll('table tbody tr, div[role="grid"] tbody tr'))
      .filter(r => !r.closest('thead') && r.querySelector('td') && !r.querySelector('th'));
    if (!rows.length) return;
    if (typeof window.AutoFillEngine?.Lookups?.extractAndSaveTechnicians === 'function') {
      window.AutoFillEngine.Lookups.extractAndSaveTechnicians(rows);
    }
  }

  function scanAllDocs() {
    const docs = collectAllDocs(document);
    for (const d of docs) {
      d.querySelectorAll('.modal.show, .modal.in, div[role="dialog"], section.modal').forEach(checkModalForTechnicians);
    }
  }

  const observer = new MutationObserver(() => {
    scanAllDocs();
  });

  try {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch(_) {}
  technicianModalObserver = observer;

  // Periodic scan while modal is open
  technicianModalInterval = setInterval(scanAllDocs, 2000);
}

initTechnicianModalWatcher();

// ═════════════════════════════════════════════════════════════════════════════════════
// cleanup — تنظيف الموارد عند مغادرة الصفحة أو الإغلاق
// يمنع تسرب الذاكرة من التimers و observers في التنقلات SPA
// ═════════════════════════════════════════════════════════════════════════════════════
function cleanupSessionResources() {
  if (sessionCaptureInterval) {
    clearInterval(sessionCaptureInterval);
    sessionCaptureInterval = null;
  }
  if (technicianModalInterval) {
    clearInterval(technicianModalInterval);
    technicianModalInterval = null;
  }
  if (technicianModalObserver) {
    try { technicianModalObserver.disconnect(); } catch(_) {}
    technicianModalObserver = null;
  }
  window._sessionCaptureInitialized = false;
}

window.addEventListener('pagehide', cleanupSessionResources);
window.addEventListener('beforeunload', cleanupSessionResources);

// ── Auto-capture Order Region on Page Load ──
(async () => {
  if (window !== window.top) return;
  const url = window.location.href;
  if (!url.includes('workorderreview') && !url.includes('followup') && !url.includes('technicalreviewdetails') && !url.includes('Reportdetail')) return;
  try {
    await new Promise(r => setTimeout(r, 2500));
    if (typeof window.AutoFillEngine?.Page2?.readRegionFromPage === 'function') {
      const reg = await window.AutoFillEngine.Page2.readRegionFromPage();
      if (reg) {
        const { regionTechMap = {} } = await chrome.storage.local.get({ regionTechMap: {} });
        if (regionTechMap[reg] === undefined) {
          regionTechMap[reg] = '';
          await chrome.storage.local.set({ regionTechMap });
          console.log('[REGION] Auto-captured region from order page:', reg);
        }
      }
    }
  } catch(_) {}
})();



