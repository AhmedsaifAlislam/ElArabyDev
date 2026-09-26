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

// ── Storage proxy (Edge Tracking Prevention bypass) ──
async function storageGet(keys) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys });
    return resp?.data || {};
  } catch(e) { return {}; }
}
async function storageSet(data) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_SET', data });
    return { ok: resp?.ok === true, error: resp?.error };
  } catch(e) { return { ok: false, error: String(e) }; }
}
async function storageRemove(keys) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_REMOVE', keys });
    return { ok: resp?.ok === true, error: resp?.error };
  } catch(e) { return { ok: false, error: String(e) }; }
}

function sendSmartLog(eventType, details) {
  chrome.runtime.sendMessage({ type: 'SMART_LOG_EVENT', event: { pageVisitId: null, url: location.href, pageType: getPageType(), timestamp: Date.now(), eventType, isAutomated: document.body?.dataset?.isAutofilling === 'true', ...details } }).catch(()=>{});
}

async function sysLog(msg, type='info') {
  const symbol = type === 'error' ? 'Œ' : type === 'success' ? '✅' : type === 'warn' ? '⚠ï¸' : 'ℹï¸';
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
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    tabId: details.tabId || null,
    taskId: details.taskId || null,
    orderId: details.orderId || null,
    url: details.url || location.href,
    processingTabId: details.processingTabId || null,
    currentTaskPresent: details.currentTaskPresent || false,
    queueLength: details.queueLength || 0,
    details: details.details || null
  };
  
  chrome.runtime.sendMessage({ 
    type: 'TRACE_APPEND', 
    entry
  }).catch(()=>{});
}

function clearMultiRunTrace() {
  chrome.runtime.sendMessage({ type: 'TRACE_CLEAR' }).catch(()=>{});
}

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
    err(`ðŸ’¥ safeClick failed for ${description}: ${e.message}`);
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

let CFG = null;
let _routerRunning = false; // Mutex: prevents parallel execution
async function loadSelectors() {
  if (CFG) return CFG;
  try {
    const lsVal = localStorage.getItem('autofiller_selectors');
    if (lsVal) { CFG = JSON.parse(lsVal); return CFG; }
  } catch (_) {}
  try { CFG = await (await fetch(chrome.runtime.getURL('selectors.json'))).json(); } catch(e) { CFG = getHardcodedDefaults(); }
  return CFG;
}

function getHardcodedDefaults() {
  return {
    serial: ["#ldv_serialnumber","#ldv_technicalserialnumber","[aria-label*='الرقم المسلسل']","[name*='serial']","input[id*='serial']"],
    serial2: ["#ldv_serialnumber1","[aria-label*='الرقم المسلسل 2']","[name*='serialnumber1']"],
    brandInput: ["#ats_producttypebrand_name","input[aria-label='العلامة التجاريه']","input[aria-label*='العلامة التجاريه']","input[id*='brand']","input[name*='brand']"],
    brandBtn: ["button[aria-label*='العلامة التجاريه Launch lookup modal']",".launchentitylookup","button[aria-label*='Brand']",".lookup-brand button"],
    modelInput: ["#ldv_actualmodel_name","input[aria-label='الموديل الفعلي 1']","input[aria-label*='الموديل الفعلي']","input[name*='actualmodel']","input[name*='model']","input[id*='actualModel']"],
    modelInput2: ["#ldv_actualmodel2_name","input[aria-label='الموديل الفعلي 2']","input[aria-label*='الموديل الفعلي 2']"],
    modelBtn: ["button[aria-label*='الموديل الفعلي Launch lookup modal']",".launchentitylookup","button[aria-label*='Model']",".lookup-model button"],
    statusSelect: ["#ldv_warrantystatus","select[name*='warranty']","select[aria-label*='Warranty']","select[id*='warranty']","select[name*='status']"],
    dateInput: ["#ldv_warrantydate_datepicker_description","input[aria-label*='Warranty Date']","input[aria-label*='تاريخ الضمان']","input[name*='warrantyDate']","input[id*='warrantydate']","input[type='date']"],
    notes: ["textarea[aria-label*='Notes']","textarea[name*='notes']","textarea[id*='notes']"],
    nextBtn: ["#NextButton","input[type='button'][value='Next']","input[type='button'][value='التالي']","button[aria-label='Next']","button[aria-label='التالي']","button[type='submit']"],
    lookupModalItem: ["[role='dialog'] li","[role='listbox'] [role='option']",".lookup-modal .result-item",".modal .result-item","table tbody tr", ".entitylist-items li"],
    lookupSearchInput:["[role='dialog'] input[type='search']","[role='dialog'] input[type='text']",".modal input"],
    successIndicator: [".save-success",".alert-success","[class*='success']"],
    customer: [".customer-name","[class*='customer-name']"],
    orderNumber: [".order-number","[class*='order-id']","[class*='workorder-id']"],
    ordersSearchInput:["input[aria-label*='Search']","input[placeholder*='Search']","input[placeholder*='بحث']","#searchOrders","input[type='search']"],
    ordersSearchBtn: ["button[type='submit'][aria-label*='Search']","button[aria-label*='Search']","button[aria-label*='بحث']"],
    ordersTableRow: ["table tbody tr","[role='row']",".entitylist-items > li",".order-row"],
    ordersViewLink: ["a[href*='workorderreview']","a[href*='followup']","a[href*='review']","button[aria-label*='View']","button[aria-label*='متابعة']"],
    _batchDelay: 1200, _nextWaitTimeout: 10000, _lookupTimeout: 6000, _ordersSearchWait: 2000, _retryCount: 3
  };
}

function findFirst(list) {
  if (!list) return null; if (!Array.isArray(list)) list = [list];
  for (const s of list) { if (s instanceof HTMLElement) return s; try { const el = document.querySelector(s); if (el) return el; } catch (_) {} }
  return null;
}
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
      warn('⚠ï¸ Validation error appeared during wait. Aborting wait.');
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



function parseDataLine(line) {
  const obj = {}; const parts = line.includes('|') ? line.split('|') : line.split(',');
  parts.forEach(p => { const i = p.indexOf(':'); if(i<0)return; obj[p.slice(0,i).trim().toLowerCase().replace(/\s+/g,'')] = p.slice(i+1).trim(); });
  const parsed = {
    orderId: obj['orderid'] || obj['order'] || line.match(/\bCAS\d{10,}\b/i)?.[0] || '', brand: obj['brand'] || obj['علامهتجاريه'] || '',
    model: obj['model'] || obj['موديل'] || '', serial: obj['serial'] || obj['serialnumber'] || '', model2: obj['model2'] || '',
    serial2: obj['serial2'] || '', status: obj['status'] || obj['حالة'] || '', date: obj['date'] || obj['تاريخ'] || '', 
    reportType: obj['reporttype'] || obj['report'] || '',
    date2: obj['date2'] || '',
    problemCode: obj['problemcode'] || obj['problem'] || '',
    faultCode: obj['faultcode'] || obj['fault'] || '',
    subFaultCode: obj['subfault'] || null,
    notes: obj['notes'] || obj['ملاحظات'] || '',
    technician: obj['technician'] || obj['الفني'] || obj['الفنى'] || '',
    technicianName: obj['technicianname'] || obj['اسمالفني'] || obj['اسمالفنى'] || ''
  };

  // For AC with merged model+serial (model2 exists): pick the newest date
  if (parsed.model2 && parsed.date && parsed.date2) {
    try {
      const toDate = (d) => { const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(m[3], m[2]-1, m[1]) : new Date(d); };
      const d1 = toDate(parsed.date), d2 = toDate(parsed.date2);
      if (d2 > d1) { parsed.date = parsed.date2; sysLog('📅 Using newer date: ' + parsed.date2, 'info'); }
    } catch(e) { /* keep original date */ }
  }
  return parsed;
}

// ── Check if Page 1 fields are already filled (skip already-processed orders) ──



// ── AUTOFIL ENGINE BACKWARD-COMPATIBILITY BRIDGES ───────────────────────────
// Wire up window-level functions to point to the specialized engine modules
let Lookups, Page1, Page2, Page3;
try {
  Lookups = window.AutoFillEngine.Lookups || {};
  Page1 = window.AutoFillEngine.Page1 || {};
  Page2 = window.AutoFillEngine.Page2 || {};
  Page3 = window.AutoFillEngine.Page3 || {};
  traceEvent('BRIDGES_READY', { hasLookups: !!window.AutoFillEngine?.Lookups, hasPage1: !!window.AutoFillEngine?.Page1 });
} catch (e) {
  traceEvent('BRIDGES_ERROR', { error: String(e) });
  Lookups = Page1 = Page2 = Page3 = {};
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
    Orchestrator.processQueueOnLoad().catch(e =>
      traceEvent('PROCESS_QUEUE_ON_LOAD_ERROR', { error: String(e) })
    );
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
const generateTaskId          = Orchestrator.generateTaskId;
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
  extractOrderIdFromLine, generateTaskId, buildTasksFromLines, notifyStatus,
  clearCurrentTask, startNextTask, getActivePageFeature, showOverlay,
  showMasahaOverlay, executeWorkflow, findOrderAndOpen, runSingleLineWithRouter,
  processQueueOnLoad, openSession, finalizeOrderInSession, finalizeSession
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
    byOrder[orderId].pages.push(capture);
    // حد أقصى للصفحات المخزنة لكل أمر
    if (byOrder[orderId].pages.length > 60) byOrder[orderId].pages = byOrder[orderId].pages.slice(-60);
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

// الربط بين captureByOrderId الحالي في كل صفحة والصفحات التالية
// يُستدعى عند تحميل كل صفحة بعد ثانية من الجاهزية
async function initSessionCapture() {
  if (!/workorderreview|followup|review/i.test(location.href)) return;
  hookCaptureClicks();
  setTimeout(() => capturePageState('', 'page-load'), 1500);
  // استمر بالتقاط لقطات دورية (5ث) للصفحات التي لا تعيد التحميل (SPA)
  setInterval(() => {
    if (document.visibilityState === 'visible') capturePageState('', 'interval');
  }, 5000);
}
initSessionCapture();

// ════════════════════════════════════════════════════════════════════
// FAB: Clear Device Data — فقط على workorderreview/followup
// ═══════════════════════════════════════════════════════════════════
function injectClearDeviceFAB() {
  if (!/workorderreview|followup/i.test(location.href)) return;
  if (document.getElementById('ea-clear-device-fab')) return;
  
  const fab = document.createElement('button');
  fab.id = 'ea-clear-device-fab';
  fab.innerHTML = '🗑️';
  fab.title = 'مسح بيانات الجهاز (خيارات: الكل / المخفي فقط)';
  Object.assign(fab.style, {
    position: 'fixed', bottom: '90px', left: '20px', zIndex: 999999,
    width: '48px', height: '48px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    border: 'none', color: '#fff', fontSize: '20px',
    cursor: 'pointer', boxShadow: '0 4px 20px rgba(220,38,38,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s'
  });
  
  fab.onmouseenter = () => { fab.style.transform = 'scale(1.1)'; fab.style.boxShadow = '0 6px 25px rgba(220,38,38,0.6)'; };
  fab.onmouseleave = () => { fab.style.transform = 'scale(1)'; fab.style.boxShadow = '0 4px 20px rgba(220,38,38,0.4)'; };
  
  fab.onclick = async () => {
    const choice = await showFABClearDialog();
    if (!choice || choice === 'cancel') return;
    
    fab.disabled = true;
    fab.textContent = '⏳';
    try {
      await clearAllDeviceFields(choice);
    } finally {
      fab.disabled = false;
      fab.textContent = '🗑️';
    }
  };
  
  document.body.appendChild(fab);
}

function showFABClearDialog() {
  return new Promise(resolve => {
    const existing = document.getElementById('ea-fab-clear-dialog');
    if (existing) existing.remove();
    
    const dialog = document.createElement('div');
    dialog.id = 'ea-fab-clear-dialog';
    Object.assign(dialog.style, {
      position: 'fixed', bottom: '150px', left: '20px', zIndex: 1000000,
      direction: 'rtl', fontFamily: 'Cairo, sans-serif',
      background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
      padding: '16px', minWidth: '260px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
    });
    
    dialog.innerHTML = `
      <div style="font-size:13px; font-weight:700; color:#e2e8f0; margin-bottom:12px;">🗑️ مسح بيانات الجهاز</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button class="ea-fab-choice" data-mode="all" style="padding:10px; border-radius:8px; border:none; background:#dc2626; color:#fff; font-weight:700; cursor:pointer;">🗑️ نعم — مسح الكل</button>
        <button class="ea-fab-choice" data-mode="hidden-only" style="padding:10px; border-radius:8px; border:none; background:#f59e0b; color:#fff; font-weight:700; cursor:pointer;">🔧 الحقول المخفية فقط</button>
        <button class="ea-fab-choice" data-mode="cancel" style="padding:10px; border-radius:8px; border:none; background:#334155; color:#94a3b8; font-weight:700; cursor:pointer;">❌ لا</button>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelectorAll('.ea-fab-choice').forEach(btn => {
      btn.onclick = () => { dialog.remove(); resolve(btn.dataset.mode); };
    });
    
    setTimeout(() => {
      document.addEventListener('click', function closeOutside(e) {
        if (!dialog.contains(e.target) && e.target !== fab) {
          dialog.remove(); resolve('cancel');
          document.removeEventListener('click', closeOutside);
        }
      });
    }, 0);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectClearDeviceFAB);
} else {
  injectClearDeviceFAB();
}
