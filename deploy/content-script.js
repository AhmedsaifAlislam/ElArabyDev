// =========================================================
// content-script.js — Portal AutoFiller v3.0
// TARGET: Modular Architecture (Page1 & Page 2) + ClearBtn Verifier
// =========================================================
'use strict';

const LOG_PREFIX = '[AutoFiller v3.0]';
const PORTAL_BASE = 'https://elarabyportalpfs.powerappsportals.com';
const ORDERS_URL  = PORTAL_BASE + '/en-US/Orders/';

// ── Storage (shared/storage-proxy.js provides window.storageGet/Set/Remove) ──

function sendSmartLog(eventType, details) {
  chrome.runtime.sendMessage({ type: 'SMART_LOG_EVENT', event: { pageVisitId: null, url: location.href, pageType: getPageType(), timestamp: Date.now(), eventType, isAutomated: document.body?.dataset?.isAutofilling === 'true', ...details } }).catch(()=>{});
}

async function sysLog(msg, type='info') {
  const symbol = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
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

// ── Page Toast notification ──
function showPageToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const colors = { info: '#4fc3f7', success: '#66bb6a', error: '#ef5350', warn: '#ffa726' };
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

// ── Suppress repeated portal errors (ldv_workordertype is not defined) ──
// This error repeats infinitely on workorderreview pages due to portal script initialization failure
const _suppressedErrors = new Set();
const _originalError = console.error.bind(console);
console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('ldv_workordertype is not defined')) {
    if (!_suppressedErrors.has('ldv_workordertype')) {
      _suppressedErrors.add('ldv_workordertype');
      _originalError('[Suppressed] Portal error: ldv_workordertype is not defined (repeating error suppressed)');
    }
    return;
  }
  _originalError(...args);
};

// ── Field Watcher: Diagnose unexpected field clearing (Brand/Model/Serial) ──
// Logs when critical fields are cleared unexpectedly (helps diagnose portal/extension issues)
function initFieldWatcher() {
  const fieldSelectors = [
    '#ats_producttypebrand_name',           // Brand
    '#ldv_actualmodel_name',                // Model 1
    '#ldv_actualmodel2_name',               // Model 2
    '#ldv_serialnumber',                    // Serial 1
    '#ldv_serialnumber1',                   // Serial 2
    '[aria-label*="العلامة التجاريه"]',      // Brand (AR)
    '[aria-label*="الموديل الفعلي 1"]',      // Model 1 (AR)
    '[aria-label*="الموديل الفعلي 2"]',      // Model 2 (AR)
    '[aria-label*="الرقم المسلسل"]',         // Serial (AR)
  ];

  const lastValues = new Map();

  function getFieldValue(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') return el.value;
    if (el.tagName === 'INPUT') return el.value;
    return el.innerText || el.textContent || '';
  }

  function checkFields() {
    for (const sel of fieldSelectors) {
      for (const doc of collectAllDocs(document)) {
        if (!doc) continue;
        const el = doc.querySelector(sel);
        if (el) {
          const key = `${doc === document ? 'main' : 'iframe'}-${sel}`;
          const val = getFieldValue(el).trim();
          const prev = lastValues.get(key);
          if (prev && prev.length > 0 && (!val || val.length === 0)) {
            log(`🔴 FIELD CLEARED: ${sel} was "${prev}" now empty`);
            // Don't log the same clearing repeatedly
            lastValues.set(key, '');
          } else if (val && val.length > 0) {
            lastValues.set(key, val);
          }
        }
      }
    }
  }

  // Initial baseline
  setTimeout(checkFields, 2000);

  // Periodic check
  setInterval(checkFields, 5000);
}

// Start watcher after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFieldWatcher);
} else {
  initFieldWatcher();
}

let CFG = null;
let _routerRunning = false; // Mutex: prevents parallel execution
let _quickBatchStarting = false; // Mutex: QUICK_PASTE_BATCH (command + keydown) start once

// ── أقصى عدد محاولات للصفحة الأولى قبل تخطي البلاغ (منع الحلقة اللانهائية) ──
// يعمل كحارس مستقل عن taskRetryFlag: يزداد عند كل دخول processQueueOnLoad
// لنفس taskId حتى لو البورتال أعاد تحميل الصفحة بنفسه (full reload يقطع التدفق).
const MAX_TASK_ATTEMPTS = 2;

// ── AI Service (proxy عبر background — المفتاح لا يظهر هنا) ──────
const aiService = {
  async isAvailable() {
    try {
      const { aiConfig = {} } = await storageGet({ aiConfig: {} });
      return !!aiConfig.apiKey;
    } catch (e) { return false; }
  },
  async prompt(prompt, system, opts = {}) {
    try {
      if (typeof global.aiChat === 'function') {
        const res = await global.aiChat(prompt, {
          system,
          maxTokens: opts.maxTokens || 512,
          model: opts.model || 'general',
          cacheKey: opts.cacheKey
        });
        return res.ok ? res.text : null;
      }
      const resp = await chrome.runtime.sendMessage({
        type: 'AI_CHAT',
        payload: { prompt, system: system || '??? ????? ???.', maxTokens: opts.maxTokens || 512 }
      });
      if (resp && resp.ok && resp.text) return resp.text;
      return null;
    } catch (e) { return null; }
  }
};
async function loadSelectors() {
  if (CFG) return CFG;
  // Base from shared library (master-portal/shared/portal-selectors.js)
  const sharedBase = (typeof window.PORTAL_SELECTORS?.POWERAPPS?.fields === 'object')
    ? { ...window.PORTAL_SELECTORS.POWERAPPS.fields }
    : {};
  try {
    const lsVal = localStorage.getItem('autofiller_selectors');
    if (lsVal) { CFG = { ...sharedBase, ...JSON.parse(lsVal) }; return CFG; }
  } catch (_) {}
  try {
    const fetched = await (await fetch(chrome.runtime.getURL('selectors.json'))).json();
    CFG = { ...sharedBase, ...fetched };
  } catch(e) { CFG = { ...sharedBase, ...getHardcodedDefaults() }; }
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
  for (const s of list) {
    if (s instanceof HTMLElement) return s;
    for (const doc of collectAllDocs(document)) {
      try { const el = doc.querySelector(s); if (el) return el; } catch (_) {}
    }
  }
  return null;
}

function findButtonByText(regex, rootDoc = document) {
  for (const doc of collectAllDocs(rootDoc)) {
    if (!doc) continue;
    const btn = Array.from(doc.querySelectorAll('a, button, input[type="button"], input[type="submit"]'))
      .find(b => b.offsetParent !== null && regex.test((b.innerText || b.title || b.value || '').trim()));
    if (btn) return btn;
  }
  return null;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Dynamic Resilience Wait for PowerApps Loading Overlay ──
async function waitForSaveComplete(startUrl, cfg, maxWaitMs = 15000) {
  log('⏳ Waiting for PowerApps to process (Dynamic Wait)...');
  await sleep(1000); // Give UI time to show loading overlay
  const sw = Date.now();
  let isSaved = false;
  
  while (Date.now() - sw < maxWaitMs) {
    if (findFirst(cfg.successIndicator || [])) { isSaved = true; break; }
    if (location.href !== startUrl && !location.href.includes('stepid=')) { isSaved = true; break; }
    
    const isBlocked = !!findFirst(['.blockUI, .blockOverlay, .loading-spinner']);
    const hasError = !!findFirst(['.alert-danger, .validation-summary-errors']);
    
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
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      for (const lbl of Array.from(doc.querySelectorAll('label'))) {
        const raw = (lbl.textContent || lbl.innerText || '').replace(/[*\s]/g, '');
        const needle = text.replace(/\s/g, '');
        if (!raw.includes(needle)) continue;
        const forId = lbl.getAttribute('for');
        if (forId) { const el = doc.getElementById(forId); if (el && (!tagName || el.tagName.toLowerCase()===tagName.toLowerCase())) return el; }
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
    }
  } return null;
}

// ═══════════════════════════════════════════════════════════
// UI INTERACTIONS & MODALS
// ═══════════════════════════════════════════════════════════
async function fillElement(el, value) {
  if (!el || !value) return { ok: false };
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  if (el.tagName === 'SELECT') {
    const opts = Array.from(el.options || []); const lower = value.toLowerCase();
    const match = opts.find(o => o.text.toLowerCase() === lower) || opts.find(o => o.text.toLowerCase().includes(lower)) || opts.find(o => lower.includes(o.text.toLowerCase()) && o.text.trim() !== '') || opts.find(o => o.value.toLowerCase().includes(lower));
    if (!match) return { ok: false };
    await emulateUserInput(el, match.value); return { ok: true, selected: match.text };
  }
  await emulateUserInput(el, String(value)); return { ok: true };
}

function findSafeLookupButton(inputEl, fallbackCfgSelectors) {
  const container = inputEl.closest('.input-group') || inputEl.parentElement;
  if (!container) return findFirst(fallbackCfgSelectors);
  const btn = Array.from(container.querySelectorAll('button, a.btn')).find(b => !/clear|مسح|remove|delete/i.test(b.className+(b.getAttribute('aria-label')||'')+(b.title||'')));
  return btn || findFirst(fallbackCfgSelectors);
}

async function fillLookupModal(btn, searchValue, rootDoc) {
  if (!btn || !searchValue) return { ok: false };
  if (!rootDoc) rootDoc = document;
  // ⛔ لا نمسح الحقل الحالي مسبقاً — الحذف يحدث فقط عند نجاح اختيار قيمة جديدة فعلياً.
  // القاعدة: لا يُحذف أي شيء خارج عملية تعبئة ناجحة ببيانات مغذاة.
  log('Opening Modal for:', searchValue); btn.click(); await sleep(1800);

  // ── Try direct pick first (single-page list like Brand) ──────────
  const itemsSelectors = Array.isArray(CFG.lookupModalItem) ? [...CFG.lookupModalItem] : [CFG.lookupModalItem];
  itemsSelectors.push('.modal table tbody tr');

  const getVisibleItems = () => {
    let all = [];
    for (const sel of itemsSelectors) {
      try { all.push(...Array.from(rootDoc.querySelectorAll(sel)).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0 && !/norecords|لاتوجد/i.test(i.innerText.replace(/\s/g,'')))); } catch (_) {}
    }
    return all;
  };

  // Wait briefly for items to appear without searching
  let visibleItems = [];
  for (let w = 0; w < 6; w++) {
    visibleItems = getVisibleItems();
    if (visibleItems.length > 0) break;
    await sleep(400);
  }

  const normalize = s => (s||'').replace(/[\s\-\(\)\[\]_#\*]/g,'').toLowerCase();
  const target = normalize(searchValue);
  // Also keep a "raw" version that preserves hyphens for strict boundary matching
  const rawTarget = (searchValue||'').replace(/[\s\(\)\[\]_#\*]/g,'').toLowerCase();
  // Extract just the model code part (before " _ " or "(") for better matching
  const modelCodeOnly = (searchValue||'').split(/\s*[_–—]\s*/)[0].split('(')[0].trim();
  const targetCode = normalize(modelCodeOnly);
  const rawTargetCode = modelCodeOnly.replace(/[\s\(\)\[\]_#\*]/g,'').toLowerCase();

    const pickAndConfirm = async (items) => {
      if (searchValue === '*') {
        log('Wildcard * provided, picking first available item.');
        const match = items[0];
        if (!match) return { ok: false, reason: 'no-match' };
        const radio = match.querySelector('input[type="radio"]');
        if (radio) radio.click(); else { const chk = match.querySelector('input[type="checkbox"]'); if (chk) chk.click(); else match.click(); }
        await sleep(600);
        const selBtnList = Array.from(rootDoc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="تحديد"], .modal button[aria-label*="اختر"]'));
        const selectBtn = selBtnList.reverse().find(b => b.offsetParent !== null);
        if (selectBtn) { try { selectBtn.focus(); } catch(e){} selectBtn.click(); try { selectBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(e){} await sleep(1000); }
        return { ok: true, selected: match.innerText?.trim() };
      }

      // Extract the model code from each row for precise matching
      const getRowCode = (row) => {
        const txt = row.innerText.trim();
        // Model code is typically the first segment before " _ " or before Arabic text
        const codePart = txt.split(/\s*[_–—]\s*/)[0].trim();
        return codePart;
      };

      // Priority 1: Exact model code match (e.g. "GR-EF40P-GR" matches row starting with "GR-EF40P-GR")
      const firstRow = items[0];
      const firstRowCode = firstRow ? getRowCode(firstRow) : '(none)';
      const firstRowNorm = firstRow ? normalize(firstRowCode) : '(none)';
      log(`Model DIAG: searchValue="${searchValue}" modelCodeOnly="${modelCodeOnly}" targetCode="${targetCode}" rawTargetCode="${rawTargetCode}"`);
      log(`Model DIAG: firstRow code="${firstRowCode}" norm="${firstRowNorm}" toLowerCase="${(firstRowCode||'').toLowerCase()}"`);
      log(`Model DIAG: comparisons: code===rawTarget=${(firstRowCode||'').toLowerCase()===rawTarget} norm===target=${firstRowNorm===target} code===rawTargetCode=${(firstRowCode||'').toLowerCase()===rawTargetCode} norm===targetCode=${firstRowNorm===targetCode}`);
      const exactMatch = items.find(i => {
        const code = getRowCode(i).toLowerCase();
        return code === rawTarget || normalize(code) === target || code === rawTargetCode || normalize(code) === targetCode;
      });
      // Priority 2: Starts-with + boundary (next char is not alphanumeric)
      const startsMatch = !exactMatch ? items.find(i => {
        const code = getRowCode(i).toLowerCase();
        const norm = normalize(code);
        const searchTarget = targetCode.length > target.length / 2 ? targetCode : target;
        return (norm.startsWith(searchTarget) && (norm.length === searchTarget.length || !/[a-z0-9]/.test(norm[searchTarget.length])));
      }) : null;
      // Priority 3: Code-part includes match only (NOT full row text — prevents Arabic description false positives)
      const includesMatch = (!exactMatch && !startsMatch) ? items.find(i => {
        const code = normalize(getRowCode(i));
        return code.includes(targetCode) || code.includes(target);
      }) : null;
      const match = exactMatch || startsMatch || includesMatch || null;
      log(`Model pick — exact:${!!exactMatch} starts:${!!startsMatch} includes:${!!includesMatch} → "${match?.innerText?.trim().slice(0,60)}"`);
      if (!match) return { ok: false, reason: 'no-match' };
      const radio = match.querySelector('input[type="radio"]');
      if (radio) radio.click(); else { const chk = match.querySelector('input[type="checkbox"]'); if (chk) chk.click(); else match.click(); }
      await sleep(600);
      const selBtnList = Array.from(rootDoc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="تحديد"], .modal button[aria-label*="اختر"]'));
      const selectBtn = selBtnList.reverse().find(b => b.offsetParent !== null);
      if (selectBtn) { try { selectBtn.focus(); } catch(e){} selectBtn.click(); try { selectBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(e){} await sleep(1000); }
      return { ok: true, selected: match.innerText?.trim() };
    };


  if (visibleItems.length > 0) {
    log(`Direct pick mode: found ${visibleItems.length} items without searching.`);
    const res = await pickAndConfirm(visibleItems);
    if (res.ok) return res;
    // If exact match not found in direct list, fall through to search
    log('No exact match in direct list, falling back to search...');
  }

  // ── Fallback: search mode ─────────────────────────────────────────
  const searchSelectors = Array.isArray(CFG.lookupSearchInput) ? [...CFG.lookupSearchInput] : [CFG.lookupSearchInput];
  searchSelectors.push('.modal input[type="search"]', '.modal input[type="text"]', '.modal input.query', 'input[placeholder*="Search"]');
  let si = Array.from(rootDoc.querySelectorAll(searchSelectors.join(','))).find(i => i.offsetParent !== null);
  if (!si) { await sleep(1000); si = Array.from(rootDoc.querySelectorAll(searchSelectors.join(','))).find(i => i.offsetParent !== null); }
  
  if (si) { 
    // Use model code only for search to get better results
    const searchFor = modelCodeOnly || searchValue;
    await emulateUserInput(si, searchFor); await sleep(400); 
    const modalSearchBtn = si.parentElement?.querySelector('button') || rootDoc.querySelector('.modal button[aria-label*="Search"], .modal button[aria-label*="بحث"]');
    if (modalSearchBtn) modalSearchBtn.click(); else ['keydown','keypress','keyup'].forEach(ev => { try { si.dispatchEvent(new KeyboardEvent(ev, { key: 'Enter', keyCode: 13, bubbles: true })); } catch(e){} });
    
    log('⏳ Waiting for search results...');
    const startWait = Date.now();
    while (Date.now() - startWait < 12000) {
      visibleItems = getVisibleItems();
      const matchFound = visibleItems.some(i => normalize(i.innerText).includes(targetCode) || normalize(i.innerText).includes(target));
      if (matchFound) break;
      await sleep(400);
    }
  }

  visibleItems = getVisibleItems();
  if (!visibleItems.length) {
    const closeBtn = rootDoc.querySelector('.modal.show [data-dismiss="modal"], .modal.show button.close'); if (closeBtn) closeBtn.click();
    return { ok: false, reason: 'no-results' };
  }

  return await pickAndConfirm(visibleItems) || { ok: false };
}

// ── Modal guard: wait for any open modal to close before proceeding ──
async function waitForModalCloseIfOpen(timeoutMs = 20000) {
  const modalOpen = () => collectAllDocs(document).some(doc => doc && doc.querySelector('.modal.show, .modal-backdrop.show'));
  if (!modalOpen()) return;
  log('⏳ Waiting for existing modal to close...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!modalOpen()) {
      log('✅ Existing modal closed');
      await sleep(1000);
      return;
    }
    await sleep(300);
  }
}

// ── Find the iframe document inside a modal (PowerApps subgrid modals) ──
async function waitForModalIframe(modal, timeoutMs = 15000) {
  const findLoadedDoc = (root) => {
    if (!root) return null;
    const fwWalk = (typeof globalThis.walkFrames === 'function') ? globalThis.walkFrames : null;
    const fallbackVisit = (current) => {
      const iframes = Array.from(current.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iDoc || !iDoc.body) continue;
          if (iDoc.querySelector('button.launchentitylookup, select:not([disabled])')) {
            return { iframe, iframeDoc: iDoc };
          }
          const nested = fallbackVisit(iDoc);
          if (nested) return nested;
          if (iDoc.body.children.length > 0) return { iframe, iframeDoc: iDoc };
        } catch(e) {}
      }
      return null;
    };
    if (fwWalk) {
      let result = null;
      fwWalk((current, iframe, depth) => {
        if (result) return;
        if (!iframe || depth === 0) return;
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iDoc || !iDoc.body) return;
          if (iDoc.querySelector('button.launchentitylookup, select:not([disabled])')) {
            result = { iframe, iframeDoc: iDoc };
            return;
          }
          if (iDoc.body.children.length > 0 && !result) result = { iframe, iframeDoc: iDoc };
        } catch(e) {}
      }, root);
      return result;
    }
    return fallbackVisit(root);
  };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = findLoadedDoc(modal);
    if (result) return result;
    await sleep(500);
  }
  return null;
}

// Handle Page 2 modals (Problems & Technicians) — PowerApps modal with iframe inside
async function handlePage2Modal(btnRegex, searchValue) {
  // Guard: wait for any existing modal to close before clicking add
  await waitForModalCloseIfOpen();

  const addBtn = findButtonByText(btnRegex);
  if (!addBtn) { warn(`handlePage2Modal: Add button not found`); return { ok: false, reason: 'button-not-found' }; }
  if (!searchValue) searchValue = '*';
  log(`▶️ Opening Page2 modal for: ${searchValue}`);
  safeClick(addBtn, 'Page2 Add button');

  // Wait for modal to appear
  let modal = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      modal = doc.querySelector('.modal.show, .modal-dialog.show, [role="dialog"]');
      if (modal && modal.offsetParent !== null) break;
    }
    if (modal && modal.offsetParent !== null) break;
  }
  if (!modal) { warn('handlePage2Modal: Modal did not appear'); return { ok: false, reason: 'modal-not-found' }; }

  // Wait for iframe inside modal (subgrid forms use iframes)
  const iframeResult = await waitForModalIframe(modal);
  if (!iframeResult) {
    warn('handlePage2Modal: iframe not found inside modal');
    const closeBtn = modal.querySelector('[data-dismiss="modal"]');
    if (closeBtn) safeClick(closeBtn);
    return { ok: false, reason: 'iframe-not-found' };
  }
  const { iframeDoc } = iframeResult;

  // Find lookup button inside the iframe document
  const lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
  if (!lookupBtn) {
    warn('handlePage2Modal: Lookup button not found in iframe');
    const closeBtn = modal.querySelector('[data-dismiss="modal"]');
    if (closeBtn) safeClick(closeBtn);
    return { ok: false, reason: 'lookup-not-found' };
  }
  await sleep(1500);
  // Pass document as rootDoc because the lookup modal opens in the main document (full-screen PowerApps lookup)
  const result = await fillLookupModal(lookupBtn, searchValue, document);
  if (!result || !result.ok) {
    warn(`handlePage2Modal: Lookup failed: ${result?.reason || 'unknown'}`);
    const closeBtn = modal.querySelector('[data-dismiss="modal"]');
    if (closeBtn) safeClick(closeBtn);
    return { ok: false, reason: 'lookup-failed' };
  }

  // Find Save button inside the iframe document
  log('handlePage2Modal: Lookup succeeded, clicking Save...');
  await sleep(1000);
  const saveBtn = iframeDoc.getElementById('InsertButton') ||
    iframeDoc.querySelector('input[type="submit"]') ||
    Array.from(iframeDoc.querySelectorAll('button')).find(b =>
      /حفظ|save/i.test((b.innerText || b.value || '').trim()) &&
      b.offsetParent !== null &&
      !/إلغاء|cancel/i.test(b.className + (b.innerText || ''))
    );
  if (!saveBtn) { warn('handlePage2Modal: Save button not found in iframe'); return { ok: false, reason: 'save-not-found' }; }
  saveBtn.click();

  // Wait for modal to close
  log('Waiting for Page2 modal to close...');
  const startClose = Date.now();
  while (Date.now() - startClose < 15000) {
    await sleep(500);
    if (!document.body.contains(modal) || modal.offsetParent === null) {
      log('Page2 modal closed');
      await sleep(1500);
      return { ok: true, name: result.selected || searchValue };
    }
  }
  return { ok: true, name: result.selected || searchValue };
}

async function fillPowerAppsLookup(inputEl, labelText, value, cfgBtnSelectors) {
  if (!inputEl) return { ok: false };
  const useModal = inputEl.hasAttribute('readonly') || inputEl.classList.contains('lookup') || inputEl.tagName !== 'INPUT';
  if (useModal) {
    const btn = findSafeLookupButton(inputEl, cfgBtnSelectors);
    if (btn) {
      const result = await fillLookupModal(btn, value);
      if (result.ok) {
        sendSmartLog('FIELD_FILLED', { field: labelText || 'lookup', value, method: 'fillLookupModal' });
      }
      return result;
    }
    return { ok: false };
  }
  await emulateUserInput(inputEl, value); await sleep(1500);
  const dropdownSelectors = ['[role="option"]', '[role="listbox"] li', '.autocomplete-suggestions li', '.entitylist-items li'];
  for (const sel of dropdownSelectors) {
    let items; try { items = Array.from(collectAllDocs(document).flatMap(doc => doc ? Array.from(doc.querySelectorAll(sel)) : [])).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0); } catch (_) { continue; }
    if (!items.length) continue;
    // 🛡️ لا تختار أول عنصر أعمى (كان يفسد القيمة) — فقط تطابق حقيقي
    const match = items.find(i => (i.textContent||'').toLowerCase().includes(value.toLowerCase()));
    if (!match) return { ok: false };
    match.click(); await sleep(400);
    sendSmartLog('FIELD_FILLED', { field: labelText || 'lookup', value, method: 'fillPowerAppsLookup' });
    return { ok: true };
  }
  const btn = findSafeLookupButton(inputEl, cfgBtnSelectors); if (btn) return await fillLookupModal(btn, value); return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// SUPERVISORY VERIFICATION ENGINE
// ═══════════════════════════════════════════════════════════
function createLookupVerifier(elFinder) {
  return () => {
    const el = elFinder(); if (!el) return false;
    let val = el.value || el.getAttribute('value') || '';
    if (!val && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) val = el.innerText || '';
    return val.trim().length > 0; 
  };
}
function createInputVerifier(elFinder) {
  return () => {
    const el = elFinder(); if (!el) return false;
    if (el.tagName === 'SELECT') return el.selectedIndex > 0 && el.options[el.selectedIndex].text.trim() !== '';
    const val = el.value || el.getAttribute('value') || el.innerText || ''; return val.trim().length > 0; 
  };
}

async function fillAndVerify(fieldLabel, targetValue, actionFn, verifyFn, maxRetries = 2) {
  if (!targetValue) return null;
  log(`▶️ Filling ${fieldLabel}: "${targetValue}"`);
  
  // Real-time notification updates
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'filling', `جاري تعبئة: ${fieldLabel}...`, 'page1-review');
  } catch(e){}

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await actionFn(); let verified = false; const start = Date.now();
    while (Date.now() - start < 4500) { if (verifyFn()) { verified = true; break; } await sleep(350); }
    if (verified) {
      log(`✅ [Success] ${fieldLabel}`);
      sendSmartLog('FIELD_FILLED', { field: fieldLabel, value: targetValue, method: 'fillAndVerify' });
      return { ok: true, result };
    }
    warn(`⚠️ [Retry] ${fieldLabel} failed on attempt ${attempt}.`);
    const closeBtn = document.querySelector('.modal.show [data-dismiss="modal"], .modal.show button.close');
    if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); await sleep(800); }
  }
  err(`❌ [Failed] ${fieldLabel} after ${maxRetries} attempts.`); return { ok: false };
}

// ── حماية الحقول: لا نمسح قيمة حقيقية موجودة في الصفحة إلا بأمر صريح (forceOverwrite) ──
// إذا كان الحقل مملوءاً بالفعل (قيمة حقيقية ليست "0"/"لا يوجد") → نحتفظ بها ولا نلمسها.
function readFieldValue(el) {
  if (!el) return '';
  let val = el.value || el.getAttribute('value') || '';
  if (!val && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) val = el.innerText || '';
  return String(val || '').trim();
}

function isRealValue(v) {
  return !!v && v !== '0' && !/لا يوجد|n\/a|none|undefined/i.test(v);
}

// ── قاعدة حماية السيريال: القيمة الحقيقية = أكثر من 5 أحرف/أرقام إنجليزية ──
// أي سيريال أطول من 5 أحرف/أرقام إنجليزية (مثل 20C01#010171HA2C) هو بيانات حقيقية:
// لا يُحذف ولا يُعدل إطلاقاً إلا بتفعيل checkbox "الحقن الإجباري" (forceOverwrite).
// القيم القصيرة/الوهمية ("0", "AB", "123") ليست بيانات حقيقية → يسمح بالكتابة فوقها.
function isRealSerialValue(v) {
  const s = String(v || '').trim();
  if (!s || s === '0' || /لا يوجد|n\/a|none|undefined/i.test(s)) return false;
  const enCount = (s.match(/[a-zA-Z0-9]/g) || []).length;
  return enCount > 5;
}

// ينتظر حتى تظهر قيمة حقيقية في الحقل أو يختفي مؤشر التحميل (البورتال يحمّل البيانات غير متزامن)
// — يمنع قراءة الحقل وهو فاضي مؤقتاً ثم مسح/استبدال قيمة حقيقية موجودة.
async function waitForFieldStable(existingElFinder, maxWaitMs = 5000, realValueFn = isRealValue) {
  const start = Date.now();
  let lastVal = '';
  let sawReal = null;
  while (Date.now() - start < maxWaitMs) {
    const el = existingElFinder ? existingElFinder() : null;
    const v = readFieldValue(el);
    if (realValueFn(v)) return v; // قيمة حقيقية ظهرت — الحقل اكتمل تحميله
    if (v) lastVal = v;
    // البورتال معبأ القيمة لكن بـ "0"/"لا يوجد" مؤقتاً → ننتظر
    const loading = !!findFirst(['.blockUI:not([style*="display: none"])', '.blockOverlay', '.loading-spinner:not([style*="display: none"])', '[class*="loader"]:not([style*="display: none"])']);
    if (!loading && Date.now() - start > 800 && sawReal === null) sawReal = Date.now();
    // استقرت الحالة (لا تحميل) لمدة 1.2 ثانية ولم تظهر قيمة → نعتبرها فارغة نهائياً
    if (sawReal && Date.now() - sawReal > 1200) return lastVal;
    await sleep(250);
  }
  return lastVal;
}

// يملأ الحقل فقط إذا كان فارغاً — مع حماية القيمة الموجودة
async function fillAndVerifyProtected(fieldLabel, targetValue, actionFn, verifyFn, existingElFinder, forceOverwrite, realValueFn = isRealValue) {
  if (!targetValue) return null;
  if (!forceOverwrite) {
    // مهلة ذكية: ننتظر اكتمال تحميل الحقل من البورتال قبل قراءة قيمته الحقيقية
    // (300ms سابقاً كانت غير كافية — الحقل فاضي مؤقتاً أثناء التحميل غير المتزامن)
    const existing = await waitForFieldStable(existingElFinder, 5000, realValueFn);
    if (realValueFn(existing)) {
      log(`🛡️ ${fieldLabel}: قيمة موجودة ("${existing}") — تم الاحتفاظ بها (لا مسح).`);
      return { ok: true, keptExisting: existing };
    }
    if (existing) log(`🛡️ ${fieldLabel}: القيمة الحالية ("${existing}") غير حقيقية — سنكتب القيمة الجديدة.`);
  }
  return await fillAndVerify(fieldLabel, targetValue, actionFn, verifyFn);
}

// ═══════════════════════════════════════════════════════════
// ▼▼▼  PAGE 2 HELPER FUNCTIONS (DETECTION)  ▼▼▼
// ═══════════════════════════════════════════════════════════
function readDeviceTypeFromPage() {
  const labels = ['Product Category','Product Type','Device Type','نوع المنتج','فئة المنتج'];
  for (const lab of labels) {
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      const labelEl = Array.from(doc.querySelectorAll('label, .field-label, th')).find(l => l.innerText.trim().includes(lab));
      if (labelEl) {
        const parent = labelEl.closest('td, .form-group, .field');
        if (parent) {
           const input = parent.querySelector('input[type="text"]:not([class*="hidden"])');
           if (input && input.value) return input.value.trim();

           const clone = parent.cloneNode(true); 
           const lbl = clone.querySelector('label'); if (lbl) lbl.remove();
           clone.querySelectorAll('.lookup-modal, .input-group-btn, script, style').forEach(el => el.remove());
           const t = clone.innerText.replace(/[*:]/g, '').replace(/[\r\n]+/g, ' ').trim(); 
           if (t) return t;
        }
      }
    }
  } return null;
}

// ── Read Customer Complaint Code from page ──────────────────
function readComplaintCodeFromPage() {
  // Try common complaint/symptom field labels
  const labels = [
    'Customer Complaint', 'Complaint Code', 'Complaint',
    'كود الشكوى', 'شكوى العميل', 'شكوى', 'كود المشكلة', 'المشكلة'
  ];
  for (const lab of labels) {
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      const labelEl = Array.from(doc.querySelectorAll('label, .field-label, th, td'))
        .find(l => l.innerText && l.innerText.trim().toLowerCase().includes(lab.toLowerCase()));
      if (labelEl) {
        // Check for linked input/select
        const forId = labelEl.getAttribute && labelEl.getAttribute('for');
        if (forId) {
          const el = doc.getElementById(forId);
          if (el) { const v = (el.value || el.innerText || '').trim(); if (v) return v; }
        }
        // Check sibling cells or next elements
        const parent = labelEl.closest('tr, .form-group, .field, .fieldset');
        if (parent) {
          const cells = Array.from(parent.querySelectorAll('td, input, select, .field-value, [class*="value"]'));
          for (const cell of cells) {
            if (cell === labelEl) continue;
            const v = (cell.value || cell.innerText || '').replace(/[*:]/g,'').trim();
            if (v && v !== lab) return v;
          }
        }
      }
    }
  }
  // Fallback: check lookup/readonly display fields near complaint patterns
  const allLabels = Array.from(document.querySelectorAll('label, th'));
  for (const lb of allLabels) {
    if (/شكو|complaint/i.test(lb.innerText || '')) {
      let next = lb.nextElementSibling || lb.closest('td')?.nextElementSibling;
      if (next) { const v = (next.innerText || next.value || '').trim(); if (v) return v; }
    }
  }
  return null;
}

// ── Scrape full order details from current page ──────────────
async function scrapeFullOrderDetails(injectedData = {}) {
  const details = {};
  // Customer address
  const addrLabels = ['العنوان', 'Address', 'عنوان العميل', 'Customer Address'];
  for (const lab of addrLabels) {
    const labelEl = Array.from(document.querySelectorAll('label, th, td, .field-label'))
      .find(l => l.innerText && l.innerText.trim().includes(lab));
    if (labelEl) {
      const parent = labelEl.closest('tr, .form-group, .field');
      if (parent) {
        const val = Array.from(parent.querySelectorAll('td, input, .field-value, [class*="value"]'))
          .map(el => (el.value || el.innerText || '').replace(/[*:]/g,'').trim())
          .find(v => v && v !== lab);
        if (val) { details.address = val; break; }
      }
      const next = labelEl.nextElementSibling || labelEl.closest('td')?.nextElementSibling;
      if (next) { const v = (next.innerText || '').trim(); if (v && v !== lab) { details.address = v; break; } }
    }
  }

  // Customer name
  const custLabels = ['اسم العميل', 'Customer Name', 'Customer', 'العميل'];
  for (const lab of custLabels) {
    const labelEl = Array.from(document.querySelectorAll('label, th, td, .field-label, .customer-name, [class*="customer"]'))
      .find(l => l.innerText && l.innerText.trim().includes(lab));
    if (labelEl) {
      const parent = labelEl.closest('tr, .form-group');
      if (parent) {
        const val = Array.from(parent.querySelectorAll('td, input, [class*="value"]'))
          .map(el => (el.value || el.innerText || '').trim())
          .find(v => v && v !== lab);
        if (val) { details.customerName = val; break; }
      }
    }
  }

  // Phone
  const phoneLabels = ['رقم التليفون', 'Phone', 'Mobile', 'الموبايل', 'التليفون'];
  for (const lab of phoneLabels) {
    const labelEl = Array.from(document.querySelectorAll('label, th, td'))
      .find(l => l.innerText && l.innerText.trim().includes(lab));
    if (labelEl) {
      const parent = labelEl.closest('tr, .form-group');
      if (parent) {
        const val = Array.from(parent.querySelectorAll('td, input'))
          .map(el => (el.value || el.innerText || '').trim())
          .find(v => v && v !== lab && /\d{6,}/.test(v));
        if (val) { details.phone = val; break; }
      }
    }
  }

  // Complaint code
  details.complaintCode = readComplaintCodeFromPage();

  // Compare injected vs current (detect manual additions)
  const manuallyAdded = {};
  const fieldMap = { serial: 'الرقم التسلسلي', brand: 'البراند', model: 'الموديل', status: 'حالة الضمان', date: 'التاريخ', notes: 'الملاحظات' };
  for (const [key, label] of Object.entries(fieldMap)) {
    const injectedVal = (injectedData[key] || '').toString().trim();
    // Try to read current value from page
    const allInputs = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'));
    const matchInput = allInputs.find(el => {
      const lb = document.querySelector(`label[for="${el.id}"]`);
      return lb && (lb.innerText || '').includes(label);
    });
    if (matchInput) {
      const pageVal = (matchInput.value || '').trim();
      if (pageVal && pageVal !== injectedVal) {
        manuallyAdded[key] = { injected: injectedVal, manual: pageVal };
      }
    }
  }
  if (Object.keys(manuallyAdded).length > 0) details.manuallyModified = manuallyAdded;

  return details;
}

function isInstallationReport() {
  const allDocs = [document, ...Array.from(document.querySelectorAll('iframe')).map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } }).filter(Boolean)];
  for (const doc of allDocs) {
    // الحقول المباشرة لنوع الخدمة / نوع أمر الشغل
    const typeFields = [
      doc.querySelector('#ats_workordertype_name'),
      doc.querySelector('#ats_servicetype_name'),
      doc.querySelector('[data-logical-name="ats_workordertype"] input[type="text"], [data-logical-name="ats_workordertype"] [role="textbox"]')
    ];
    for (const el of typeFields) {
      if (!el) continue;
      const v = (el.value || el.innerText || '') || '';
      if (/تركيب|installation|تركيب وتشغيل/i.test(v)) return true;
    }
    // الـ select الخاص بـ Work Order Type (0 = Installation)
    const sel = doc.querySelector('#ldv_workordertype');
    if (sel) {
      const selVal = sel.value || '';
      const selText = sel.options && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '') : '';
      if (selVal === '0' || /installation/i.test(selText)) return true;
    }
    const hiddenVal = doc.querySelector('#ldv_workordertype_Value');
    if (hiddenVal && hiddenVal.value === '0') return true;
  }
  // fallback: البحث عن label نوع الخدمة وقراءة القيمة من نفس الخلية (info/control)
  const keys = ['Report Type','Service Type','نوع البلاغ','نوع الخدمة'];
  for (const k of keys) {
    const label = Array.from(document.querySelectorAll('label, .field-label, th')).find(l => l.innerText && l.innerText.trim().includes(k));
    if (label) {
      const td = label.closest('td, .cell, [data-logical-name]');
      const valEl = td ? td.querySelector('.control input, .control select, .control [role="textbox"], .control') : null;
      const val = valEl ? (valEl.value || valEl.innerText || '') : '';
      if (/تركيب|installation/i.test(val)) return true;
    }
  }
  const complaint = (document.querySelector('.initial-complaint, .complaint-text, .description')?.innerText || '');
  if (/تركيب|installation/i.test(complaint)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// INSTALLATION & COMMISSIONING - SPECIAL FLOW
// ═══════════════════════════════════════════════════════════
async function performInstallationAndCommissioning(data = {}) {
  try { await sleep(1500); } catch(e) {}
  let filledService = false;

  const serviceLabelCandidates = ['Service Type','Report Type','نوع الخدمة','نوع البلاغ','Service'];
  for (const lab of serviceLabelCandidates) {
    const labelEl = Array.from(document.querySelectorAll('label, .field-label, th')).find(l => l.innerText && l.innerText.includes(lab));
    if (labelEl) {
      const target = labelEl.getAttribute('for') ? document.getElementById(labelEl.getAttribute('for')) : (labelEl.closest('tr')?.querySelector('td:nth-child(2) input, td:nth-child(2) select, td:nth-child(2)') || labelEl.nextElementSibling);
      if (target) {
        if (target.tagName === 'SELECT') {
          const opt = Array.from(target.options).find(o => /تركيب|Installation|Installation and Commissioning|تركيب وتشغيل/i.test(o.text));
          if (opt && target.value !== opt.value) { target.value = opt.value; try { target.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){} filledService = true; break; }
        } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          await emulateUserInput(target, 'تركيب وتشغيل'); filledService = true; break;
        } else {
          log('Service field is read-only, skipping direct write');
        }
      }
    }
  }
  const targetTech = data.technicianName || data.technician || null;
  const techRes = await selectRandomTechnician(targetTech);

  const notesCandidates = ['Notes','ملاحظات','notes_support','notes'];
  for (const nlab of notesCandidates) {
    const notesEl = Array.from(document.querySelectorAll('textarea, input')).find(el => {
      const lab = document.querySelector(`label[for="${el.id}"]`) || el.closest('.field');
      return lab && (lab.innerText || '').includes(nlab);
    });
    if (notesEl) {
      const noteText = data.notes || 'تم تنفيذ تركيب وتشغيل حسب طلب العميل. لا أكواد أو أرقام إضافية.';
      await emulateUserInput(notesEl, noteText);
      break;
    }
  }

  const nextBtn = findButtonByText(/Next|التالي|Save|حفظ|submit/i);
  let saveOk = false;
  if (nextBtn) {
    const startUrl = location.href; nextBtn.click();
    saveOk = await new Promise(resolve => {
      let done = false; const finish = r => { if(done)return; done=true; obs.disconnect(); resolve(r); };
      const obs = new MutationObserver(() => { if (findFirst([".save-success",".alert-success","[class*='success']"])) finish(true); if (location.href !== startUrl) finish(true); });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true }); setTimeout(() => finish(true), 8000);
    });
  } else { warn('Next/Save button not found for Installation Flow'); }

  return { report: { fieldResults: { 'تركيب': { ok: filledService }, technician: { ok: techRes.ok, selected: techRes.name } }, saveResult: { ok: saveOk } } };
}

async function handleSubgridIframeModal(btnRegex, targetName, pickRandomIfTargetMissing = true, excludePattern = null, priorityPattern = null) {
  const addBtn = findButtonByText(btnRegex);

  if (!addBtn) return null;

  log(`▶️ Opening subgrid modal for: ${btnRegex.source}...`);
  addBtn.click();
  
  let iframeDoc = null, targetIframe = null, lookupBtn = null;
  
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      const iframe = Array.from(doc.querySelectorAll('iframe')).find(ifr => ifr.offsetParent !== null && ifr.contentDocument);
      if (iframe && iframe.contentDocument) {
        targetIframe = iframe;
        iframeDoc = iframe.contentDocument;
        lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
        const selectEl = iframeDoc.querySelector('select:not([disabled])');
        if ((lookupBtn && lookupBtn.offsetParent !== null) || (selectEl && selectEl.offsetParent !== null)) break;
      }
    }
    if (iframeDoc) break;
  }
  
  if (!iframeDoc) return null;
  
  let selectedName = targetName || 'Selected Item';
  const cleanTarget = targetName ? targetName.replace(/\*/g, '') : null;
  
  if (lookupBtn && lookupBtn.offsetParent !== null) {
    log('Waiting 3s for iframe events to bind...');
    await sleep(3000);
    if (targetIframe && targetIframe.contentDocument) {
      iframeDoc = targetIframe.contentDocument;
      lookupBtn = iframeDoc.querySelector('button.launchentitylookup') || lookupBtn;
    }
    
    // Search all docs for rows (like addFaultCodePage3)
    function getRowsFromDocs(docs) {
      const results = [];
      docs.forEach(doc => {
        if (!doc) return;
        const rows = doc.querySelectorAll('table tbody tr, div[role="grid"] tr, table tr:not(:first-child)');
        rows.forEach(r => {
          if (r.offsetParent !== null && r.innerText.trim() && !/norecords|لا توجد/i.test(r.innerText.replace(/\s/g,''))) results.push(r);
        });
      });
      return results;
    }
    const allDocs = [...new Set([...collectAllDocs(iframeDoc), ...collectAllDocs(document)])];
    
    let items = [];
    for (let attempt = 0; attempt < 3 && items.length === 0; attempt++) {
      if (attempt > 0) { log(`Retry #${attempt}: clicking magnifying glass...`); await sleep(1500); }
      try { lookupBtn.focus(); } catch(e) {}
      lookupBtn.click();
      try { lookupBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch(e) {}
      
      for (let j = 0; j < 16; j++) {
        await sleep(500);
        items = getRowsFromDocs(allDocs);
        if (items.length > 0) break;
      }
      if (items.length === 0) await sleep(1000);
    }
    
    // Filter out excluded patterns (e.g. ترصيد for problems)
    if (excludePattern && items.length) {
      const before = items.length;
      items = items.filter(i => !excludePattern.test(i.innerText));
      if (items.length < before) log(`Filtered out ${before - items.length} items matching exclude pattern`);
    }
    log(`Found ${items.length} usable items after lookup.`);
    
    if (items.length) {
      // Priority 0: If priorityPattern provided, check first page items BEFORE code matching
      let priorityMatch = null;
      if (priorityPattern) {
        priorityMatch = items.find(i => priorityPattern.test(i.innerText));
        if (priorityMatch) log('⭐ Priority match found: "' + priorityMatch.innerText.trim().slice(0,60) + '"');
      }

      // Smart matching: separate installation vs regular
      let exactMatch = priorityMatch; // Priority match wins
      if (!exactMatch && cleanTarget) {
        if (/تركيب/.test(cleanTarget)) {
          exactMatch = items.find(i => /تركيب وتشغيل/i.test(i.innerText)) || items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
        } else {
          exactMatch = items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
        }
      }
      
      const rand = exactMatch || (pickRandomIfTargetMissing ? items[Math.floor(Math.random() * items.length)] : null);
      
      if (!rand) {
        log('⚠️ No match for "' + cleanTarget + '" in ' + items.length + ' items — skipping');
        const cBtn = Array.from(iframeDoc.querySelectorAll('[data-dismiss="modal"]')).filter(b => b.offsetParent !== null).reverse()[0];
        if (cBtn) cBtn.click();
        await sleep(1000);
        return { ok: false, reason: 'no-match' };
      }
      
      selectedName = rand.innerText.trim();
      const radio = rand.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radio) radio.click(); else rand.click();
      await sleep(600);
      
      log(`Selected: ${selectedName.slice(0, 50)}, clicking اختر...`);
      let selBtn = null;
      for (const d of allDocs) {
        if (!d) continue;
        const found = Array.from(d.querySelectorAll('button.btn-primary, input.btn-primary, input[value="اختر"], input[value="Select"], button[aria-label="Select"], button[aria-label*="اختر"]')).filter(b => b.offsetParent !== null);
        if (found.length) { selBtn = found[found.length - 1]; break; }
      }
      if (!selBtn) {
        for (const d of allDocs) {
          if (!d) continue;
          const modalClose = Array.from(d.querySelectorAll('[data-dismiss="modal"]')).find(b => b.offsetParent !== null && /اختر|select/i.test(b.innerText));
          if (modalClose) { selBtn = modalClose; break; }
        }
      }
      if (selBtn) {
        try { selBtn.focus(); } catch(e) {}
        selBtn.click();
        try { selBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(e) {}
      }
      await sleep(2000);
    } else {
      log('No items found in lookup! Closing modal.');
      const closeBtn = Array.from(iframeDoc.querySelectorAll('[data-dismiss="modal"]')).filter(b => b.offsetParent !== null).reverse()[0];
      if (closeBtn) closeBtn.click();
      await sleep(1000);
      return { ok: false };
    }
  } else {
    const selectEl = iframeDoc.querySelector('select');
    if (selectEl && selectEl.offsetParent !== null) {
      const opts = Array.from(selectEl.options).filter(o => o.value);
      const exactMatch = cleanTarget ? opts.find(o => o.text.includes(cleanTarget)) : null;
      const rand = exactMatch || (pickRandomIfTargetMissing ? opts[Math.floor(Math.random() * opts.length)] : opts[0]);
      if (rand) { selectEl.value = rand.value; selectedName = rand.text; try { selectEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {} }
    }
  }
  
  log('Clicking Save on primary modal...');
  const subBtn = iframeDoc.getElementById('InsertButton') || iframeDoc.getElementById('SubmitButton') || Array.from(iframeDoc.querySelectorAll('input[type="submit"], button.btn-primary')).find(b => b.offsetParent !== null && /save|submit|حفظ|insert/i.test(b.innerText || b.value || b.title));
  if (subBtn) {
    subBtn.click();
    log('Waiting for primary modal to close...');
    const startClose = Date.now();
    while (Date.now() - startClose < 15000) {
      if (targetIframe && targetIframe.offsetParent === null) { log('Primary modal closed.'); break; }
      await sleep(500);
    }
    await sleep(1500);
    return { ok: true, name: selectedName };
  }
  return { ok: false };
}

async function selectRandomTechnician(targetName = null) {
  // Skip if technician subgrid already has records
  const existing = await hasExistingSubgridRow(/الفنيين|Technicians/i);
  if (existing) {
    log('ℹ️ Technician subgrid already has rows — skipping');
    return { ok: true, name: '(موجود مسبقاً)' };
  }

  if (/(كامل|مكتمل)/i.test(targetName || '') && targetName) { targetName = null; }
  log('▶️ Looking for Technician button...');
  const allBtns = Array.from(collectAllDocs(document).flatMap(doc => doc ? Array.from(doc.querySelectorAll('a, button, input[type="button"]')) : [])).filter(b => b.offsetParent !== null);
  const techBtns = allBtns.filter(b => /فن|tech/i.test((b.innerText||b.title||b.value||'').trim()));
  log(`Found ${techBtns.length} tech-related buttons: ${techBtns.map(b=>'"'+(b.innerText||b.title||b.value||'').trim().slice(0,30)+'"').join(', ')}`);

  let res = await handlePage2Modal(/[اإأ]ضاف[ةه]\s*فن|Add.*Tech/i, targetName);
  if (res && res.ok) return res;
  if (res && !res.ok) log('⚠️ Technician handlePage2Modal failed');

  log('Trying inline technician lookup...');
  const lab = findFieldByLabel(['الفنيين','الفني','Technician','Technicians']);
  if (!lab) { log('❌ No technician field found on page'); return { ok: false }; }
  if (lab.tagName === 'SELECT') {
    const valid = Array.from(lab.options).filter(o => o.value && o.text.trim());
    if (valid.length) { const rand = targetName ? (valid.find(o=>o.text.includes(targetName))||valid[0]) : valid[Math.floor(Math.random()*valid.length)]; await emulateUserInput(lab, rand.value); return { ok: true, name: rand.text }; }
  }
  const btn = findSafeLookupButton(lab, ['.lookup-technician button', '.lookup-btn']);
  if (btn) {
    btn.click(); await sleep(2000); 
    const items = Array.from(collectAllDocs(document).flatMap(doc => doc ? Array.from(doc.querySelectorAll('.modal table tbody tr, .modal-body table tbody tr td:first-child')) : [])).filter(i => i.offsetParent !== null && i.innerText.trim() && !/norecords|لاتوجد/.test(i.innerText.replace(/\s/g,'')));
    if (items.length) {
      const rand = targetName ? (items.find(i => i.innerText.trim().includes(targetName)) || items[0]) : items[Math.floor(Math.random()*items.length)];
      const radio = rand.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radio) radio.click(); else rand.click(); await sleep(300);
      const sels = Array.from(collectAllDocs(document).flatMap(doc => doc ? Array.from(doc.querySelectorAll('.modal button.btn-primary, .modal input.btn-primary, .modal input[value="اختر"], .modal input[value="Select"], .modal button[aria-label*="Select"], .modal button[aria-label*="اختر"]')) : []));
      const selectBtn = sels.reverse().find(b => b.offsetParent !== null);
      if (selectBtn) { try{selectBtn.focus();}catch(e){} selectBtn.click(); try{selectBtn.dispatchEvent(new Event('click',{bubbles:true}));}catch(e){} }
      return { ok: true, name: rand.innerText.trim() };
    }
    const closeBtn = findFirst(['.modal.show [data-dismiss="modal"]']); if (closeBtn) closeBtn.click();
  }
  return { ok: false };
}

function getProblemCode(deviceName, isInstallRow) {
  // Read customer complaint code from page first (priority source)
  const complaintCode = readComplaintCodeFromPage();
  log('🔍 Complaint code from page: ' + (complaintCode || 'NOT FOUND'));

  // Special case: if complaint/reportType indicates installation
  if (isInstallRow || isInstallationReport()) return '*تركيب';

  // Special case: Premium Care
  if (complaintCode && /premium.?care|بريميم.?كير|بريميم كير/i.test(complaintCode)) {
    log('⭐ Premium Care detected from complaint code');
    return complaintCode; // Return the complaint code itself to search for Premium Care
  }

  // Special case: installation inside complaint text
  if (complaintCode && /تركيب|installation/i.test(complaintCode)) {
    log('🔧 Installation detected from complaint code');
    return '*تركيب';
  }

  // If complaint code found AND matches problem code pattern, use it
  if (complaintCode && /^\*?\w{2}\d{2}$/i.test(complaintCode)) {
    log('✅ Using complaint code as problem search: ' + complaintCode);
    return complaintCode;
  }

  // Fallback to device name matching
  const text = (deviceName || '').toLowerCase();

  // Read from selectors.json if available (externalized map)
  const map = CFG?.problemCodes;
  if (map && Array.isArray(map)) {
    for (const entry of map) {
      try {
        if (new RegExp(entry.pattern, 'i').test(text) && entry.codes?.length) {
          const codes = entry.codes;
          return codes[Math.floor(Math.random() * codes.length)];
        }
      } catch(e) { /* invalid regex — skip */ }
    }
  }

  // Hardcoded fallback (used if selectors.json patterns don't match)
  if (/تكييف|ac|air.?cond|split|شباك|inverter/i.test(text)) { const arr = ['*AC02','*AC03']; return arr[Math.floor(Math.random()*arr.length)]; }
  if (/بوتوجاز|طباخ|cooker/.test(text)) return '*GS04';
  if (/غسال/i.test(text) && !/اطباق|أطباق/.test(text)) return '*WM05';
  if (/ثلاج|مبرد|fridge/.test(text)) { const arr = ['*GR01','*GR02','*GR03']; return arr[Math.floor(Math.random()*arr.length)]; }
  if (/اطباق|أطباق|dish/.test(text)) return '*DW06';
  if (/سخان|heater/.test(text)) return '*HT01';
  return null;
}

// AI-powered problem code selection
async function getSmartProblemCode(deviceName, isInstallRow) {
  if (isInstallRow) return '*تركيب';
  
  const complaintCode = readComplaintCodeFromPage();
  
  if (typeof aiService !== 'undefined' && await aiService.isAvailable()) {
    const aiResult = await aiService.prompt(
      `شكوى العميل: "${complaintCode || 'غير محدد'}"
       نوع الجهاز: "${deviceName}"
       اختر كود العطل المناسب من: *AC02, *AC03, *GS04, *WM05, *GR01, *GR02, *GR03, *DW06, *HT01, *تركيب
       أرجع الكود فقط بدون شرح.`,
      'أنت مساعد متخصص في أكواد العطل للأجهزة الكهربائية.',
      { timeout: 5000, cacheKey: 'probcode|' + (complaintCode || '') + '|' + deviceName }
    );
    
    if (aiResult && /\*[A-Z]{2}\d{2}/.test(aiResult)) {
      log('🤖 AI Problem Code: ' + aiResult);
      return aiResult.trim();
    }
  }
  
  // fallback to legacy regex
  return getProblemCode(deviceName, isInstallRow);
}

// ═══════════════════════════════════════════════════════════
// ▼▼▼  MODULAR LOGIC: PAGE 1 (Review) vs PAGE 2 (FollowUp)
// ═══════════════════════════════════════════════════════════

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
    notes: obj['notes'] || obj['ملاحظات'] || ''
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
async function isPage1AlreadyFilled(cfg) {
  // انتظار استقرار تحميل البورتال قبل الفحص (الحقول فاضية مؤقتاً أثناء التحميل غير المتزامن)
  const settleStart = Date.now();
  while (Date.now() - settleStart < 6000) {
    const hasLoading = !!findFirst(['.blockUI:not([style*="display: none"])', '.blockOverlay', '.loading-spinner:not([style*="display: none"])']);
    const serialEl = findFirst(cfg.serial) || findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial Number','Serial']);
    const probe = (serialEl?.value || '').trim();
    if (!hasLoading && (probe || Date.now() - settleStart > 2000)) break;
    await sleep(300);
  }
  const serialEl = findFirst(cfg.serial) || findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial Number','Serial']);
  const serialVal = (serialEl?.value || '').trim();

  // لو Serial فاضي أو "0" أو "لا يوجد" → البيانات ناقصة/وهمية → متخطاش
  if (!serialVal || serialVal === '0' || serialVal.includes('لا يوجد')) {
    log(`🔍 Serial is "${serialVal || '(empty)'}" — page not considered filled.`);
    return false;
  }

  // لو Serial مملوء وحقيقي (> 3 chars) → شيك باقي الحقول
  const brandEl = findFirst(cfg.brandInput) || findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand']);
  const brandVal = (brandEl?.value || brandEl?.innerText || '').trim();
  const modelEl = findFirst(cfg.modelInput) || findFieldByLabel(['الموديل الفعلي 1','Model']);
  const modelVal = (modelEl?.value || modelEl?.innerText || '').trim();

  if (serialVal.length > 3 && brandVal.length > 1 && modelVal.length > 1) {
    log(`🔁 Page 1 already filled: Brand="${brandVal}", Model="${modelVal}", Serial="${serialVal}" — skipping.`);
    return true;
  }
  return false;
}

// ── قاعدة صارمة: سيريال 2 / موديل 2 مسموح فقط لمجموعة AC ──
// (تكييف، تكييف كونسيلد، PUMP CLEAN، مبرد هواء، منقى هواء، صيانة دورية تكييف)
// كل المنتجات الأخرى (ثلاجات، غسالات، بوتوجازات، شاشات ... إلخ) → سيريال 2 فاضي إلزاماً.
const AC_ALLOWED_PRODUCT_TYPES = new Set([
  'تكييف', 'تكييف كونسيلد', 'PUMP CLEAN', 'مبرد هواء', 'منقى هواء', 'صيانة دورية تكييف'
]);

function isACProductType(productType) {
  if (!productType) return false;
  const normalized = String(productType).trim();
  return AC_ALLOWED_PRODUCT_TYPES.has(normalized) ||
         /تكييف|ac\b|air\.?cond|split|شباك|inverter|مبردة?\s*هواء|منقى\s*هواء|صيانة\s*دورية\s*تكييف/i.test(normalized);
}

// مسح صريح لحقول موديل 2/سيريال 2 من الصفحة (لغير التكييف — القاعدة الصارمة)
// 🛡️ قاعدة حماية السيريال: سيريال 2 حقيقي (> 5 أحرف/أرقام إنجليزية) لا يُمسح إلا بالحقن الإجباري.
function clearModel2Serial2Fields(forceOverwrite) {
  // 1) حقل الرقم المسلسل 2 (نصي)
  const serial2El = document.getElementById('ldv_serialnumber1') || findFieldByLabel(['الرقم المسلسل 2','Serial 2'],'input');
  if (serial2El && serial2El.value) {
    if (!forceOverwrite && isRealSerialValue(serial2El.value)) {
      log(`🛡️ Serial 2 has real data ("${serial2El.value}") — kept, needs forceOverwrite to clear`);
    } else {
      serial2El.value = '';
      serial2El.dispatchEvent(new Event('input', { bubbles: true }));
      serial2El.dispatchEvent(new Event('change', { bubbles: true }));
      log(`🧹 Serial 2 cleared from page`);
    }
  }
  // 2) حقول lookup المخفية لموديل 2
  document.querySelectorAll('input[type="hidden"]').forEach(h => {
    if (/actualmodel2/i.test(h.id || '') || /actualmodel2/i.test(h.name || '')) h.value = '';
  });
  // 3) الحقل المرئي لموديل 2
  const model2El = document.getElementById('ldv_actualmodel2_name') || findFieldByLabel(['الموديل الفعلي 2','Model 2']);
  if (model2El && (model2El.value || model2El.getAttribute('value'))) {
    model2El.value = '';
    model2El.dispatchEvent(new Event('input', { bubbles: true }));
    model2El.dispatchEvent(new Event('change', { bubbles: true }));
    log('🧹 Model 2 cleared from page');
  }
  // 4) زر مسح الـ lookup إن وُجد
  const clearBtn = Array.from(document.querySelectorAll('button[aria-label*="Clear lookup field"], button[title*="Clear lookup field"]'))
    .find(b => /الموديل الفعلي 2|Model 2|actualmodel2/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));
  if (clearBtn) { clearBtn.click(); log('🧹 Model 2 lookup cleared via button'); }
}

async function executePage1_Review(data, cfg) {
  const FR = {};
  log('【 PAGE 1 】 Waiting for form to load...');
  const { currentTask } = await storageGet({ currentTask: null });
  if (currentTask) notifyStatus(currentTask.taskId, 'filling', 'جاري تعبئة الصفحة الأولى...', 'page1-review');
  const startWait = Date.now();
  while (Date.now() - startWait < 15000) { 
    if (findFirst(cfg.brandInput || []) || findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand'])) break; 
    await sleep(250); 
  }
  // انتظار استقرار تحميل البيانات من البورتال (يختفي مؤشر التحميل + تظهر قيمة حقيقية)
  // — يمنع قراءة نوع المنتج والحقول وهي فاضية مؤقتاً ثم معاملة التكييف كغير تكييف (مسح موديل 2/سيريال 2)
  await sleep(1200);
  const loadStart = Date.now();
  let dataSettled = false;
  while (Date.now() - loadStart < 10000) {
    const hasLoading = !!findFirst(['.blockUI:not([style*="display: none"])', '.blockOverlay', '.loading-spinner:not([style*="display: none"])']);
    const brandEl = findFirst(cfg.brandInput) || findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand']);
    const serialEl = findFirst(cfg.serial) || findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial'],'input');
    const someValue = isRealValue(readFieldValue(brandEl)) || isRealValue(readFieldValue(serialEl));
    if (!hasLoading && (someValue || Date.now() - loadStart > 2500)) { dataSettled = true; break; }
    await sleep(300);
  }
  if (!dataSettled) warn('⚠️ لم نتأكد من استقرار تحميل الصفحة — سنكمل بحذر (نحمي القيم الموجودة).');

  // Read and save product type for Page 2
  const pType = readDeviceTypeFromPage() || data.reportType;
  if (pType) await storageSet({ autofiller_ProductType: pType });

  // ── قاعدة صارمة: سيريال 2/موديل 2 → للتكييف ومبرد/منقى الهواء فقط ──
  // غير التكييف (ثلاجات، غسالات، ...) → فاضي إلزاماً مهما كانت البيانات.
  // 🛡️ حماية: لو نوع المنتج غير معروف/فاضي (لم يكتمل تحميله) → لا نمسح إطلاقاً
  // (كان ذلك يمسح موديل 2/سيريال 2 للتكييف خطأً لأن الحقل فاضي مؤقتاً).
  const productType = (data.reportType || data.productType || '').trim() || (readDeviceTypeFromPage() || '').trim();
  const typeKnown = !!productType;
  const isAC = typeKnown && isACProductType(productType);
  if (!typeKnown) warn('⚠️ نوع المنتج غير معروف بعد — لن نمسح موديل 2/سيريال 2 (حماية القيم الموجودة).');

  const hasModel2Field = !!(findFirst(cfg.modelInput2) || findFieldByLabel(['الموديل الفعلي 2','Model 2']));
  if (hasModel2Field) {
    if (isAC) {
      // للتكييف فقط: املأ من البروفيل أو انسخ من الحقل الأول
      if (!data.model2) data.model2 = data.model || '';
      if (!data.serial2) {
        try {
          const r = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
          const svConfig = await r.json();
          const acProfile = svConfig.profiles.find(p => p.name === 'تكييف');
          data.serial2 = acProfile?.page1Defaults?.serial2 || data.serial || '';
          log('🔧 AC Fallback: Using profile defaults for model2/serial2');
        } catch(e) {
          data.serial2 = data.serial || '';
          log('🔧 AC Fallback: Duplicated model/serial to model2/serial2');
        }
      }
      log(`🔧 AC Product (${productType}): model2="${data.model2}" serial2="${data.serial2}"`);
    } else if (typeKnown) {
      // **قاعدة صارمة: غير التكييف → امسح serial2 و model2 من الداتا ومن الصفحة نفسها**
      // 🛡️ إلا إذا كان serial2 حقيقياً (> 5 أحرف/أرقام إنجليزية) وبدون حقن إجباري → يحفظ ولا يمسح.
      data.model2 = '';
      data.serial2 = '';
      clearModel2Serial2Fields(data.forceOverwrite);
      log(`🔧 Non-AC Product (${productType}): Cleared model2/serial2 — MUST BE EMPTY (real serial2 kept unless forceOverwrite)`);
    } else {
      // النوع غير معروف → لا تلمس موديل 2/سيريال 2 (حماية القيم الموجودة)
      log(`🔧 Product type unknown — keeping existing model2/serial2 untouched (no clear).`);
    }
  }

  FR.brand = await fillAndVerifyProtected('Brand', data.brand, () => fillPowerAppsLookup(findFirst(cfg.brandInput)||findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand']), 'Brand', data.brand, cfg.brandBtn), createLookupVerifier(()=>findFirst(cfg.brandInput)||findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand'])), () => findFirst(cfg.brandInput)||findFieldByLabel(['العلامة التجاريه','العلامة التجارية','Brand']), data.forceOverwrite);
  FR.model = await fillAndVerifyProtected('Model1', data.model, () => fillPowerAppsLookup(findFirst(cfg.modelInput)||findFieldByLabel(['الموديل الفعلي 1','Model']), 'Model1', data.model, cfg.modelBtn), createLookupVerifier(()=>findFirst(cfg.modelInput)||findFieldByLabel(['الموديل الفعلي 1','Model'])), () => findFirst(cfg.modelInput)||findFieldByLabel(['الموديل الفعلي 1','Model']), data.forceOverwrite);
  FR.serial = await fillAndVerifyProtected('Serial1', data.serial, () => fillElement(findFirst(cfg.serial)||findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial'],'input'), data.serial), createInputVerifier(()=>findFirst(cfg.serial)||findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial'],'input')), () => findFirst(cfg.serial)||findFieldByLabel(['الرقم المسلسل 1','الرقم المسلسل','Serial'],'input'), data.forceOverwrite, isRealSerialValue);
  FR.model2 = await fillAndVerifyProtected('Model2', data.model2, () => fillPowerAppsLookup(findFirst(cfg.modelInput2)||findFieldByLabel(['الموديل الفعلي 2','Model 2']), 'Model2', data.model2, cfg.modelBtn), createLookupVerifier(()=>findFirst(cfg.modelInput2)||findFieldByLabel(['الموديل الفعلي 2','Model 2'])), () => findFirst(cfg.modelInput2)||findFieldByLabel(['الموديل الفعلي 2','Model 2']), data.forceOverwrite);
  FR.serial2 = await fillAndVerifyProtected('Serial2', data.serial2, () => fillElement(findFirst(cfg.serial2)||findFieldByLabel(['الرقم المسلسل 2','Serial 2'],'input'), data.serial2), createInputVerifier(()=>findFirst(cfg.serial2)||findFieldByLabel(['الرقم المسلسل 2','Serial 2'],'input')), () => findFirst(cfg.serial2)||findFieldByLabel(['الرقم المسلسل 2','Serial 2'],'input'), data.forceOverwrite, isRealSerialValue);
  FR.status = await fillAndVerify('Status', data.status, async () => {
    let el = findFirst(cfg.statusSelect) || findFieldByLabel(['حالة الضمان','Warranty Status'],'select');
    if (!el) el = Array.from(document.querySelectorAll('select')).find(s => /warranty|ضمان/i.test(s.getAttribute('aria-label')||'') || /warranty|ضمان/i.test(s.name||'') || /warranty|ضمان/i.test(s.id||''));
    if (!el) el = Array.from(document.querySelectorAll('select')).find(s => {
      const opts = Array.from(s.options || []);
      return opts.some(o => /warranty|ضمان/i.test(o.text));
    });
    if (!el) return { ok: false };
    const lower = (data.status || '').toLowerCase();
    const opts = Array.from(el.options || []);
    const match = opts.find(o => o.text.toLowerCase() === lower) || opts.find(o => o.text.toLowerCase().includes(lower)) || opts.find(o => lower.includes(o.text.toLowerCase()) && o.text.trim() !== '') || opts.find(o => o.value === '753240001');
    if (!match) return { ok: false };
    await emulateUserInput(el, match.value);
    return { ok: true, selected: match.text };
  }, createInputVerifier(() => document.querySelector('#ldv_warrantystatus') || document.querySelector('select[name*="warranty"]') || document.querySelector('select[id*="warranty"]') || findFieldByLabel(['حالة الضمان'],'select')));
  FR.date = await fillAndVerify('Date', data.date, () => { let d = data.date; const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(dmy) d=`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; const el=findFirst(cfg.dateInput)||findFieldByLabel(['تاريخ الضمان','Warranty Date'],'input'); return (el) ? emulateUserInput(el, el.type==='date'?d:data.date) : false; }, createInputVerifier(()=>findFirst(cfg.dateInput)||findFieldByLabel(['تاريخ الضمان'],'input')));

  log('━━━ PAGE 1 DONE ━━━', FR);
  return { report: { fieldResults: FR } };
}

// Check if a subgrid already has records (to avoid adding duplicates)
async function hasExistingSubgridRow(sectionRegex) {
  for (const doc of collectAllDocs(document)) {
    if (!doc) continue;
    // Look for the subgrid section label (headings, legends, or container with matching text)
    const candidates = Array.from(doc.querySelectorAll(
      'section, fieldset, div[aria-label], .entity-grid, ' +
      'table.view-grid, table.entity-grid, ' +
      'h1, h2, h3, h4, h5, h6, label, legend, span.section-title'
    ));
    const section = candidates.find(el =>
      sectionRegex.test(el.getAttribute('aria-label') || el.innerText || '')
    );
    if (!section) continue;
    // Find the grid container (might be parent or self)
    const container = section.closest('.entity-grid, section, fieldset, div[role="tabpanel"]') || section;
    const rows = container.querySelectorAll('table.view-grid tbody tr, table.entity-grid tbody tr, table tbody tr, table tr');
    const dataRows = Array.from(rows).filter(r => {
      const td = r.querySelector('td');
      return td && r.innerText.trim() && !/norecords|لا توجد|لاتوجد/i.test(r.innerText.replace(/\s/g,''));
    });
    if (dataRows.length > 0) {
      log(`hasExistingSubgridRow: Found ${dataRows.length} existing row(s)`);
      return true;
    }
  }
  return false;
}

async function executePage2_FollowUp(data, cfg) {
  const FR = {};
  log('【 PAGE 2 】 Preparing Actual Problems and Technicians...');
  await sleep(1000); // Buffer for DOM render

  // Set Spare Parts to "بدون قطع غيار" (confirmed on live portal: id=ats_sparepartsstatus)
  let sparePartsEl = findFieldByLabel(['حالة قطع الغيار', 'Spare Parts'], 'select');
  if (!sparePartsEl) sparePartsEl = document.getElementById('ats_sparepartsstatus'); // Direct ID fallback
  if (sparePartsEl && sparePartsEl.tagName === 'SELECT') {
      const noneOpt = Array.from(sparePartsEl.options).find(o => /بدون قطع غيار/i.test(o.text));
      if (noneOpt) {
         sparePartsEl.value = noneOpt.value;
         try { sparePartsEl.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){}
         FR.spareParts = { ok: true, selected: noneOpt.text };
         log('✅ Spare Parts set to: ' + noneOpt.text);
      } else {
         warn('⚠️ "بدون قطع غيار" option not found in spare parts dropdown');
      }
  } else {
      log('ℹ️ Spare Parts field not found — skipping');
  }

const { autofiller_ProductType } = await storageGet('autofiller_ProductType');
  const deviceName = readDeviceTypeFromPage() || autofiller_ProductType || data.reportType || '';
  const isInstall = /تركيب/.test(data.reportType) || isInstallationReport();
  
  // Check if "المشاكل الفعلية" subgrid already has rows
  const existingProblem = await hasExistingSubgridRow(/المشاكل\s*الفعلي[ةه]|Actual.*Problems/i);
  if (existingProblem) {
    log('ℹ️ Problem subgrid already has a row — skipping problem addition');
    FR.problem = { ok: true, selected: '(موجود مسبقاً)' };
  } else {
    // Validate problemCode from user input — must match problem code pattern
    let userProbCode = data.problemCode || '';
    if (userProbCode && !/^\*?\w{2}\d{2}$|^\*?تركيب$|Premium.*Care/i.test(userProbCode)) {
      warn('⚠️ Invalid problemCode in data line: "' + userProbCode + '" — ignoring and using auto-detect');
      userProbCode = '';
    }

    const probCode = userProbCode || await getSmartProblemCode(deviceName, isInstall);
    if (probCode) {
        const { currentTask } = await storageGet({ currentTask: null });
        if (currentTask) notifyStatus(currentTask.taskId, 'filling', 'جاري إضافة المشاكل الفعلية...', 'page2-problems');
        log('▶️ Adding Actual Problem: ' + probCode);
        let probRes = await handlePage2Modal(
          /[اإأ]ضاف[ةه]\s*المشاكل\s*الفعلي[ةه]\s*المستخدم[ةه]?|Add.*Problem/i,
          probCode
        );
        if (probRes && probRes.ok) {
           FR.problem = { ok: true, selected: probRes.name };
           log('✅ Problem added: ' + probRes.name);
        } else {
           warn('⚠️ Problem modal failed or no match. probRes:', JSON.stringify(probRes));
           FR.problem = { ok: false };
        }
      } else { warn('Could not determine Problem Code for device:', deviceName); }
    }

  // Check if الفنيين subgrid already has rows before opening technician modal
  const existingTech = await hasExistingSubgridRow(/الفنيين|Technicians/i);
  if (existingTech) {
    log('ℹ️ Technician subgrid already has a row — skipping technician addition');
    FR.technician = { ok: true, selected: '(موجود مسبقاً)' };
  } else {
    // Wait for any modal to fully close before opening technician modal
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'filling', 'جاري إضافة الفني...', 'page2-technician');
    log('Waiting 2s for problem modal cleanup before technician...');
    await sleep(2000);

    const targetTech = data.technicianName || data.technician || null;
    log('▶️ Adding Technician...');
    let techRes = await selectRandomTechnician(targetTech);
    if (techRes && techRes.ok) {
      FR.technician = { ok: true, selected: techRes.name };
      log('✅ Technician added: ' + techRes.name);
    } else {
      log('⚠️ Technician failed attempt 1, retrying with inline lookup in 3s...');
      await sleep(3000);
      techRes = await selectRandomTechnician(targetTech);
      if (techRes && techRes.ok) {
        FR.technician = { ok: true, selected: techRes.name };
        log('✅ Technician added on retry 2: ' + techRes.name);
      } else {
        log('⚠️ Technician failed attempt 2, retrying with direct select in 3s...');
        await sleep(3000);
        techRes = await selectRandomTechnician(targetTech);
        FR.technician = { ok: techRes?.ok || false, selected: techRes?.name };
        log(techRes?.ok ? '✅ Technician added on retry 3: ' + techRes.name : '❌ Technician failed after 3 attempts');
      }
    }
  }

  log('━━━ PAGE 2 DONE ━━━', FR);
  return { report: { fieldResults: FR } };
}

async function executePage3_Resolution(data, cfg) {
  const FR = {};
  log('【 PAGE 3 】 Preparing Resolution/Fault Codes...');
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'filling', 'جاري تعبئة الصفحة الثالثة (الأعطال)...', 'page3-faults');
  } catch(e){}
  await sleep(1000);

  const isInstall = /تركيب/.test(data.reportType) || isInstallationReport();

  // Determine the fault code(s) to use
  if (data.forceDrainCleaning) {
    log('🚿 Force صيانة دورية: adding 3 fault codes (صيانة دورية + صيانة دورية + شحن)...');

    FR.faultMaintenance = await addFaultCodePage3('AC001', 'AC00000005', ['تفريغ']);
    log(FR.faultMaintenance?.ok ? '✅ صيانة دورية (AC001) added' : '⚠️ صيانة دورية (AC001) failed');

    await sleep(2000);
    FR.faultDrain = await addFaultCodePage3('AC004', 'AC0300308A', ['تفريغ']);
    log(FR.faultDrain?.ok ? '✅ صيانة دورية (AC004) added' : '⚠️ صيانة دورية (AC004) failed');

    if (data.shahnEnabled) {
      await sleep(2000);
      FR.faultShahn = await addFaultCodePage3('AC003', 'AC9000L02B', ['تفريغ']);
      log(FR.faultShahn?.ok ? '✅ شحن added' : '⚠️ شحن failed');
    }

  } else if (isInstall) {
    // Installation: search 'تركيب' and pick the one with 'تركيب وتشغيل'
    FR.fault = await addFaultCodePage3('*تركيب');
  } else if (/تنظيف|صرف/.test(data.reportType) || /تنظيف|صرف/.test(data.notes || '')) {
    FR.fault = await addFaultCodePage3('AC004');
  } else if (data.faultCode) {
    FR.fault = await addFaultCodePage3(data.faultCode, data.subFaultCode);
  }

  log('━━━ PAGE 3 DONE ━━━', FR);
  return { report: { fieldResults: FR } };
}

// Specialized function for Page 3 fault code modal (two-step lookup)
async function addFaultCodePage3(faultCode, subFaultCode = null, excludeTexts = []) {
  document.body.dataset.isAutofilling = 'true';
  // Step 1: Click "اضافة كود عطل"
  const addBtn = findButtonByText(/اضافة كود عطل/);
  if (!addBtn) { warn('اضافة كود عطل button not found'); return { ok: false }; }
  
  addBtn.click();
  log('▶️ Opening fault code modal for: ' + faultCode + (subFaultCode ? ` + ${subFaultCode}` : ''));
  const cleanCode = faultCode.replace(/\*/g, ''); // Strip wildcard for matching
  
  // Wait for iframe to load
  let iframeDoc = null, targetIframe = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      const iframe = Array.from(doc.querySelectorAll('iframe')).find(ifr => ifr.offsetParent !== null && ifr.contentDocument && ifr.contentDocument.getElementById('ats_modeldefectmajor_name'));
      if (iframe && iframe.contentDocument) {
        targetIframe = iframe;
        iframeDoc = iframe.contentDocument;
        const lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
        if (lookupBtn && lookupBtn.offsetParent !== null) break;
      }
    }
    if (iframeDoc) break;
  }
  if (!iframeDoc) { warn('Fault code iframe not loaded'); return { ok: false }; }
  
  // Step 2: Click first lookup (كود العطل الرئيسي)
  const lookupBtns = Array.from(iframeDoc.querySelectorAll('button.launchentitylookup')).filter(b => b.offsetParent !== null);
  const mainFaultBtn = lookupBtns.find(b => (b.getAttribute('aria-label') || '').includes('كود العطل الرئيسي'));
  if (!mainFaultBtn) { warn('كود العطل الرئيسي lookup button not found'); return { ok: false }; }
  
  log('Waiting for iframe events to bind...');
  await sleep(3000);
  mainFaultBtn.click();
  
  // Search all frames for lookup rows (not just iframeDoc)
  const allDocs = [...new Set([...collectAllDocs(iframeDoc), ...collectAllDocs(document)])];
  function getRowsFromDocs(docs) {
    const results = [];
    docs.forEach(doc => {
      if (!doc) return;
      const rows = doc.querySelectorAll('table tbody tr, div[role="grid"] tr, table tr:not(:first-child)');
      rows.forEach(r => {
        if (r.offsetParent !== null && r.innerText.trim()) results.push({ row: r, doc: doc });
      });
    });
    return results;
  }
  function findSelectBtn(docs) {
    let btns = [];
    docs.forEach(doc => {
      if (!doc) return;
      let found = Array.from(doc.querySelectorAll('button.btn-primary, input.btn-primary, input[value="اختر"], input[value="Select"], button[aria-label="Select"], button[aria-label*="اختر"]')).filter(b => b.offsetParent !== null);
      if (!found.length) found = Array.from(doc.querySelectorAll('button')).filter(b => b.offsetParent !== null && /اختر|select/i.test(b.innerText.trim()));
      btns = btns.concat(found);
    });
    return btns;
  }
  
  let mainRowEntries = [];
  for (let j = 0; j < 16; j++) {
    await sleep(500);
    mainRowEntries = getRowsFromDocs(allDocs);
    if (mainRowEntries.length > 0) break;
  }
  
  if (!mainRowEntries.length) {
    // Try search in any doc that has a search input
    for (const doc of allDocs) {
      if (!doc) continue;
      const si = doc.querySelector('input[type="text"], input[type="search"]');
      if (!si || si.offsetParent === null) continue;
      si.value = faultCode;
      si.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(500);
      const searchBtn = doc.querySelector('button[type="submit"], input[type="submit"]') || si.closest('form')?.querySelector('button');
      if (searchBtn) searchBtn.click(); else si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(3000);
      mainRowEntries = getRowsFromDocs(allDocs);
      if (mainRowEntries.length > 0) break;
    }
  }
  
  if (!mainRowEntries.length) { warn('No fault code rows found for ' + faultCode); return { ok: false }; }
  
  // Filter out unwanted codes
  let mainRows = mainRowEntries.map(e => e.row);
  const filteredRows = mainRows.filter(r => {
    if (r.innerText.includes('خزنة') || r.innerText.includes('ترصيد')) return false;
    if (excludeTexts && excludeTexts.length) {
      for (const ex of excludeTexts) { if (r.innerText.includes(ex)) return false; }
    }
    return true;
  });
  if (filteredRows.length > 0) mainRows = filteredRows;
  
  // Find best match
  const isWildcard = faultCode.startsWith('*');
  const bestRow = isWildcard
    ? (mainRows.find(r => r.innerText.includes('تركيب وتشغيل')) ||
       mainRows.find(r => r.innerText.includes('صيانة دورية')) ||
       mainRows.find(r => new RegExp(cleanCode, 'i').test(r.innerText)) ||
       mainRows[0])
    : (mainRows.find(r => r.innerText.includes(cleanCode + ' ')) ||
       mainRows.find(r => r.innerText.includes(cleanCode)) ||
       mainRows[0]);
  const chk = bestRow.querySelector('input[type="radio"], input[type="checkbox"]');
  if (chk) chk.click(); else bestRow.querySelector('td')?.click() || bestRow.click();
  await sleep(600);
  
  // Click اختر — search all docs
  let selectBtns = findSelectBtn(allDocs);
  if (selectBtns.length) selectBtns[selectBtns.length - 1].click();
  await sleep(2000);
  
  // Verify main field was set
  for (let v = 0; v < 10; v++) {
    if (iframeDoc.getElementById('ats_modeldefectmajor_name')?.value) break;
    await sleep(500);
  }
  log('✅ كود العطل الرئيسي selected: ' + iframeDoc.getElementById('ats_modeldefectmajor_name')?.value);
  
  // Step 3: Click second lookup (كود العطل) — search in iframeDoc + top doc
  const faultBtns = (Array.from(iframeDoc.querySelectorAll('button.launchentitylookup'))
    .concat(Array.from(document.querySelectorAll('button.launchentitylookup'))))
    .filter(b => b.offsetParent !== null);
  const subFaultBtn = faultBtns.find(b => (b.getAttribute('aria-label') || '').includes('كود العطل'));
  
  if (subFaultBtn) {
    await sleep(1500);
    subFaultBtn.click();
    
    // Wait for sub-fault rows — search all docs
    let subRowEntries = [];
    for (let j = 0; j < 16; j++) {
      await sleep(500);
      subRowEntries = getRowsFromDocs(allDocs);
      if (subRowEntries.length > 0) break;
    }
    
    if (subRowEntries.length) {
      let subRows = subRowEntries.map(e => e.row);
      let bestSubRow = subRows[0];
      if (subFaultCode) {
        const cleanSub = subFaultCode.replace(/\*/g, '');
        bestSubRow = subRows.find(r => r.innerText.includes(cleanSub)) || subRows[0];
      }
      
      const subTd = bestSubRow.querySelector('td:first-child');
      if (subTd) subTd.click(); else bestSubRow.click();
      await sleep(600);
      
      selectBtns = findSelectBtn(allDocs);
      if (selectBtns.length) selectBtns[selectBtns.length - 1].click();
      await sleep(2000);
      
      for (let v = 0; v < 10; v++) {
        if (iframeDoc.getElementById('ats_defectcodedefectmajor_name')?.value) break;
        await sleep(500);
      }
      log('✅ كود العطل selected: ' + iframeDoc.getElementById('ats_defectcodedefectmajor_name')?.value);
    } else {
      warn('No sub-fault rows appeared');
    }
  }
  
  // Step 4: Click حفظ
  const insertBtn = iframeDoc.getElementById('InsertButton') || document.getElementById('InsertButton');
  if (insertBtn) {
    insertBtn.click();
    log('Waiting for fault code modal to close...');
    const startClose = Date.now();
    while (Date.now() - startClose < 15000) {
      if (targetIframe && targetIframe.offsetParent === null) { log('Fault code modal closed.'); break; }
      await sleep(500);
    }
    await sleep(1500);
    delete document.body.dataset.isAutofilling;
    return { ok: true, name: faultCode };
  }
  delete document.body.dataset.isAutofilling;
  return { ok: false };
}


// ═══════════════════════════════════════════════════════════
// ROUTER & QUEUE MANAGER
// ═══════════════════════════════════════════════════════════
function collectAllDocs(root) {
  const fwGetDocs = (typeof globalThis.getAccessibleDocs === 'function')
    ? globalThis.getAccessibleDocs
    : (globalThis.FrameWalker && typeof globalThis.FrameWalker.getDocs === 'function')
      ? globalThis.FrameWalker.getDocs
      : null;
  if (fwGetDocs) {
    try { return fwGetDocs(root); } catch (_) { /* fallback below */ }
  }
  const docs = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    docs.push(node);
    node.querySelectorAll('iframe').forEach(f => {
      try { const d = f.contentDocument || f.contentWindow?.document; if (d) visit(d); } catch(e) {}
    });
  };
  visit(root);
  return docs;
}

async function getActivePageFeature() {
  const docs = collectAllDocs(document);
  const allEls = (sel, filter) => {
    const out = [];
    docs.forEach(doc => { if (!doc) return; doc.querySelectorAll(sel).forEach(el => { if (filter ? filter(el) : true) out.push(el); }); });
    return out;
  };
  // Page 3: contains "أكواد الأعطال" or "اضافة كود عطل"
  const hasFaultSection = allEls('label, h3', el => el.innerText.includes('أكواد الأعطال')).length > 0;
  const hasFaultBtn = allEls('a, button', el => el.innerText.trim() === 'اضافة كود عطل' && el.offsetParent !== null).length > 0;
  if (hasFaultSection || hasFaultBtn) return 'PAGE_3';

  // Page 2: use regex to handle text variants (فنى/فني, ةه endings, all alef forms)
  const hasTechBtn = allEls('a, button', el => /[اإأ]ضاف[ةه]\s*فن/i.test(el.innerText.trim()) && el.offsetParent !== null).length > 0;
  const hasProbBtn = allEls('a, button', el => /[اإأ]ضاف[ةه]\s*المشاكل\s*الفعلي[ةه]/i.test(el.innerText.trim()) && el.offsetParent !== null).length > 0;
  if (hasTechBtn || hasProbBtn) return 'PAGE_2';

  return 'PAGE_1';
}

async function clickNextAndWaitForSave(cfg) {
  const btn = findFirst(cfg.nextBtn) || findButtonByText(/next|التالي|save|حفظ|submit/i);
  if (!btn) return { ok: false, reason: 'next-not-found' };
  const startUrl = location.href; 
  btn.click();
  const isSaved = await waitForSaveComplete(startUrl, cfg);
  return { ok: isSaved, urlChanged: location.href !== startUrl, timeout: !isSaved };
}

function showOverlay(report) {
  document.getElementById('autofiller-overlay')?.remove();
  const div = document.createElement('div'); div.id = 'autofiller-overlay';
  Object.assign(div.style, { position:'fixed', bottom:'16px', left:'16px', background:'linear-gradient(135deg,#0b1220,#0f1e35)', border:'1px solid #1e3450', borderRadius:'12px', padding:'14px 18px', color:'#e2eaf5', fontFamily:"'Cairo', Tahoma, Arial, sans-serif", fontSize:'13px', zIndex:'2147483647', boxShadow:'0 8px 32px rgba(0,0,0,0.6)', maxWidth:'340px', direction:'rtl', pointerEvents:'none' });
  const fr = report.fieldResults || {}; const summary = Object.keys(fr).map(k => fr[k] ? `${fr[k].ok ? '✅':'❌'}${k}` : null).filter(Boolean).join(' | ');
  div.innerHTML = `<div style="font-weight:700;color:#1f8feb;margin-bottom:6px">⚡ Portal AutoFiller v3.0</div><div>✅ اكتمل — <b>${report.customer || 'العميل'}</b></div><div style="color:#2bd46f;font-size:11px;margin-top:4px">${summary}</div>`;
  document.body.appendChild(div); setTimeout(() => div.remove(), 7000);
}

function showMasahaOverlay() {
  document.getElementById('autofiller-overlay')?.remove();
  const div = document.createElement('div'); div.id = 'autofiller-overlay';
  Object.assign(div.style, { position:'fixed', bottom:'16px', left:'16px', background:'linear-gradient(135deg,#1a237e,#0d47a1)', border:'2px solid #ff9800', borderRadius:'12px', padding:'16px 20px', color:'#e2eaf5', fontFamily:"'Cairo', Tahoma, Arial, sans-serif", fontSize:'14px', zIndex:'2147483647', boxShadow:'0 8px 32px rgba(0,0,0,0.6)', maxWidth:'380px', direction:'rtl' });
  div.innerHTML = `
    <div style="font-weight:700;color:#ff9800;margin-bottom:8px;font-size:16px;">📸 مساحة — أرفق الصورة</div>
    <div style="margin-bottom:8px;">تم تعبئة جميع البيانات بنجاح.</div>
    <div style="margin-bottom:8px;color:#ffcc80;">الآن أرفق صورة المساحة يدوياً ثم اضغط <b>حفظ</b>.</div>
    <button id="masaha-close-overlay" style="background:#ff9800;color:#000;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">فهمت</button>
  `;
  document.body.appendChild(div);
  div.querySelector('#masaha-close-overlay')?.addEventListener('click', () => div.remove());
  setTimeout(() => div.remove(), 30000);
}

function notifyStatus(taskId, status, message, phase = null) {
  const u = { taskId, status, message, timestamp: Date.now(), phase };
  storageSet({ lastStatusUpdate: u });
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...u }).catch(()=>{});
}
async function clearCurrentTask() { await storageRemove(['currentTask']); }

// ── وضع التحكم/المراقبة ──
// eaAutoControl: true = المستخدم أعطى أمر تحكم صريح (بدء Batch/تعبئة بلاغ) → الإضافة تتحكم كاملة
// eaAutoControl: false = وضع المراقب → الإضافة تسجل فقط ولا تحذف/تعدل أي بيانات
async function setAutoControl(on) {
  try { await storageSet({ eaAutoControl: !!on }); } catch (e) {}
}

async function pauseToMonitor(reason, currentTask) {
  await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
  await setAutoControl(false);
  notifyStatus(currentTask?.taskId, 'error', '❌ توقف الوضع التلقائي — راجع يدوياً (البيانات محفوظة)', 'paused');
  log('🛡️ Paused to Monitor mode: ' + reason + ' — no data deleted, user takes over.');
}
async function startNextTask(queue) {
  if (!queue || queue.length === 0) {
    notifyStatus('batch', 'batch-done', 'اكتمل Batch');
    chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
    return;
  }
  await storageSet({ currentTask: queue[0], taskQueue: queue.slice(1) });
  // Open next order in a new tab, keep current tab open
  try {
    await chrome.runtime.sendMessage({ type: 'OPEN_NEXT_TAB', url: ORDERS_URL });
  } catch(e) {
    // Fallback: navigate current tab if background message fails
    location.href = ORDERS_URL;
  }
}

async function runSingleLineWithRouter(task) {
  // Mutex: prevent parallel execution (race condition between processQueueOnLoad + RUN_SINGLE)
  if (_routerRunning) {
    log('⚠️ Router already running — skipping duplicate call');
    return { report: {}, isFullyDone: false, skipped: true };
  }
  _routerRunning = true;
  try {
    return await _runSingleLineWithRouterInner(task);
  } finally {
    _routerRunning = false;
  }
}

async function _runSingleLineWithRouterInner(task) {
  const cfg = await loadSelectors(); 
  let data = parseDataLine(task.line || task);
  if (task.data && task.data.forceDrainCleaning) {
    data.forceDrainCleaning = true;
  }
  if (task.data && task.data.shahnEnabled !== undefined) {
    data.shahnEnabled = task.data.shahnEnabled;
  }
  if (task.data && task.data.forceOverwrite) {
    data.forceOverwrite = true;
  }
  const stopAfterPage2 = !!(task.stopAfterPage2 || (task.data && task.data.stopAfterPage2));

  log('📄 Router started. forceDrainCleaning=' + !!data.forceDrainCleaning + ' shahnEnabled=' + !!data.shahnEnabled + ' forceOverwrite=' + !!data.forceOverwrite + ' reportType=' + (data.reportType || 'N/A') + ' problemCode=' + (data.problemCode || 'N/A') + ' faultCode=' + (data.faultCode || 'N/A'));
  let resFR = {}, saveResult = { ok: false };

  if (isInstallationReport()) {
    log('【 INSTALLATION DETECTED 】 By-passing Review/Problems and executing explicit setup.');
    const res = await performInstallationAndCommissioning(data);
    return { report: res.report, isFullyDone: true };
  }

  let feature = await getActivePageFeature();
  
  if (feature === 'PAGE_1') {
    // ── Skip if page is already filled (order already processed) ──
    await sleep(800); // Wait briefly so fields render before checking
    if (!data.forceOverwrite && await isPage1AlreadyFilled(cfg)) {
        warn('⏭️ Page 1 already has data — marking task as done and skipping to next order.');
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'done', '⏭️ مكتمل مسبقاً — تخطي', 'complete');
        } catch(e){}
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: { skipped: { ok: true } }, saveResult: { ok: true, skipped: true }, skippedReason: 'already-filled' };
        return { report, isFullyDone: true };
    }
    const res1 = await executePage1_Review(data, cfg);
    Object.assign(resFR, res1.report.fieldResults);
    
    // Attempt to navigate to Page 2
    const nBtn = findFirst(['#NextButton']) || findFirst(cfg.nextBtn) || findButtonByText(/next|التالي/i);
    if (nBtn) { 
      try {
        const { currentTask } = await storageGet({ currentTask: null });
        if (currentTask) notifyStatus(currentTask.taskId, 'navigating', 'جاري الانتقال للصفحة الثانية...', 'navigation');
      } catch(e){}
      log('Clicking Next to load PAGE 2');
      nBtn.click(); 
    } else { warn('Next button not found on PAGE 1'); }

    // Wait and check if Page 2 loads in the same SPA window
    log('Waiting for Page 2...');
    const sw = Date.now();
    let p2Loaded = false;
    while(Date.now() - sw < 10000) {
      if (await getActivePageFeature() === 'PAGE_2') { p2Loaded = true; break; }
      await sleep(1000);
    }
    
    if (!p2Loaded) {
      log('Page 2 did not load inline. Probably a full reload or validation error. Pausing task loop.');
      return { report: { fieldResults: resFR }, isFullyDone: false };
    }
    feature = 'PAGE_2'; // Continues automatically!
  }

  if (feature === 'PAGE_2') {
    const res2 = await executePage2_FollowUp(data, cfg);
    Object.assign(resFR, res2.report.fieldResults);

    if (stopAfterPage2) {
      log('⏸️ PAGE_2 تمت تعبئته — توقف قبل الحفظ/الانتقال بناءً على طلب المستخدم.');
      const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult: { ok: false, manualStop: true }, serviceFilled: !!resFR['تركيب'], technician: resFR['technician']?.selected };
      try { await chrome.runtime.sendMessage({ type: 'SAVE_REPORT', payload: report }); } catch (_) {}
      return { report, isManualStop: true, isFullyDone: false };
    }

    // Check if we need to proceed to Page 3
    const isInstall = /تركيب/.test(data.reportType) || isInstallationReport();
    let needsPage3 = data.forceDrainCleaning || data.faultCode || (/تنظيف|صرف/.test(data.reportType) || /تنظيف|صرف/.test(data.notes || '')) || isInstall;
    log(`📋 needsPage3=${needsPage3} | forceDrain=${!!data.forceDrainCleaning} | faultCode=${data.faultCode||'N/A'} | isInstall=${isInstall}`);
    
    if (!needsPage3) {
        log('PAGE 3 is not needed. Clicking Save/Next to finalize order on Page 2.');
        const nBtn = findButtonByText(/next|التالي|save|حفظ|submit/i);
        let isSaved = false;
        if (nBtn) {
            const startUrl = location.href;
            try { nBtn.focus(); } catch(e) {}
            nBtn.click();
            isSaved = await waitForSaveComplete(startUrl, cfg);
        }
        // removed finalizeSmartLog()
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult: { ok: true }, serviceFilled: !!resFR['تركيب'], technician: resFR['technician']?.selected };
        return { report, isFullyDone: true };
    }
    
    const nBtn = findButtonByText(/next|التالي|save|حفظ|submit/i);
    
    if (nBtn) {
        log('Clicking Next/Save on PAGE 2 to go to PAGE 3');
        const startUrl = location.href; 
        try { nBtn.focus(); } catch(e) {}
        nBtn.click();
        
        let isSaved = await waitForSaveComplete(startUrl, cfg);
        let p3Loaded = false;
        
        if (!isSaved) {
            // Check if it's PAGE_3 now
            const newFeat = await getActivePageFeature();
            if (newFeat === 'PAGE_3') { p3Loaded = true; }
        }
        
        if (isSaved) {
            saveResult = { ok: true };
        } else if (p3Loaded) {
            feature = 'PAGE_3';
        } else {
            log('PAGE 2 ended but neither PAGE 3 nor Save detected. Assuming validation error.');
            return { report: { fieldResults: resFR }, isFullyDone: false };
        }
    } else {
        warn('Next/Save button not found on PAGE 2');
        return { report: { fieldResults: resFR }, isFullyDone: false };
    }
  }

  if (feature === 'PAGE_3') {
    const res3 = await executePage3_Resolution(data, cfg);
    Object.assign(resFR, res3.report.fieldResults);
    
    if (data.notes === 'مساحة') {
      // Masaha: DON'T auto-save — user must attach image manually
      log('PAGE 3 filled (مساحة). Waiting for user to attach image and save manually.');
      showMasahaOverlay();
      saveResult = { ok: true, masahaPending: true };
    } else {
    // Auto-save on Page 3
    log('PAGE 3 filled. Clicking Save/Submit.');
    const saveBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /save|حفظ|submit|إرسال/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|إلغاء/i.test(b.className) && b.offsetParent !== null);
    let isSaved = false;
    if (saveBtn) {
       const startUrl = location.href;
       try { saveBtn.focus(); } catch(e) {}
       saveBtn.click();
       isSaved = await waitForSaveComplete(startUrl, cfg);
    } else {
       warn('Save button not found on PAGE 3');
    }
    
    // removed finalizeTelemetryLog()
    saveResult = { ok: true };
    }
  }
  
  const isDone = saveResult.ok;
  const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult, serviceFilled: !!resFR['تركيب'], technician: resFR['technician']?.selected };
  try { await chrome.runtime.sendMessage({ type: 'SAVE_REPORT', payload: report }); } catch (_) {}
  showOverlay(report); 
  return { report, isFullyDone: isDone };
}

// ── JSON-Driven Workflow Engine (V4 Architecture) ──────────────────────────
async function executeWorkflow(workflowName, context, cfg) {
  const steps = cfg.workflows?.[workflowName];
  if (!steps) return false;
  
  log(`[Engine] Starting workflow: ${workflowName}`);
  for (const step of steps) {
    let selectors = cfg[step.target] || [step.target];
    let value = step.value ? step.value.replace('{{orderId}}', context.orderId) : '';
    let matchText = step.matchText ? step.matchText.replace('{{orderId}}', context.orderId) : '';
    
    if (step.action === 'wait') {
      let found = null;
      for (let i = 0; i < (step.timeout || 10000)/500; i++) {
        found = findFirst(selectors);
        if (found) break;
        await sleep(500);
      }
      if (!found) { warn(`[Engine] Wait timeout for ${step.target}`); return false; }
    }
    else if (step.action === 'type') {
      const el = findFirst(selectors);
      if (!el) return false;
      await emulateUserInput(el, value);
      try { el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true })); } catch(e){}
    }
    else if (step.action === 'click') {
      const el = findFirst(selectors);
      if (!el) return false;
      safeClick(el, step.target);
    }
    else if (step.action === 'click_row') {
      let rowFound = false;
      for (let i = 0; i < (step.timeout || 12000)/500; i++) {
        const rows = Array.from(document.querySelectorAll('tr, .entitylist-items > li, [role="row"]'));
        const targetRow = rows.find(r => (r.innerText||'').includes(matchText));
        if (targetRow) {
          rowFound = true;
          let clicked = false;
          for (const sel of selectors) {
            const btn = targetRow.querySelector(sel);
            if (btn) { safeClick(btn, step.target); clicked = true; break; }
          }
          if (!clicked) {
             const a = targetRow.querySelector('a[href]');
             if (a) { safeClick(a, 'Fallback Link in Row'); }
             else { safeClick(targetRow, 'Row directly'); }
          }
          break;
        }
        await sleep(500);
      }
      if (!rowFound) {
        const a = Array.from(document.querySelectorAll('a[href]')).find(l => (l.innerText||'').includes(matchText) || (l.href||'').toLowerCase().includes(matchText.toLowerCase()));
        if (a) { safeClick(a, 'Fallback Global Link'); }
        else { warn(`[Engine] Row matching ${matchText} not found`); return false; }
      }
    }
    await sleep(400);
  }
  return true;
}

// ── Legacy wrapper using Engine for Page 1 ──
async function findOrderAndOpen(orderId, cfg) {
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'searching', `جاري البحث عن رقم الأمر...`, 'search');
  } catch (e) {}

  await sleep(cfg._ordersSearchWait || 2000);
  
  // Try V4 Engine first
  if (cfg.workflows?.page1_search) {
    const success = await executeWorkflow('page1_search', { orderId }, cfg);
    if (success) return true;
    warn('[Engine] Workflow failed or timed out. Falling back to legacy hardcoded logic.');
  }

  // Legacy fallback
  const searchEl = findFirst(cfg.ordersSearchInput);
  if (searchEl) {
    searchEl.focus(); searchEl.value = orderId; try { searchEl.dispatchEvent(new Event('input', {bubbles:true})); } catch(e){}
    ['keydown','keypress','keyup'].forEach(k => { try { searchEl.dispatchEvent(new KeyboardEvent(k, { key:'Enter', keyCode:13, bubbles:true })); } catch(e){} });
    const searchBtn = findFirst(cfg.ordersSearchBtn); if (searchBtn) searchBtn.click(); await sleep(2000);
  }
  const rs = cfg.ordersTableRow || ['table tbody tr','[role="row"]','.entitylist-items > li']; const start = Date.now();
  while (Date.now() - start < 8000) {
    let rows = []; for (const c of rs) try { rows.push(...Array.from(document.querySelectorAll(c))); } catch(_) {}
    for (const row of [...new Set(rows)]) if ((row.innerText||'').includes(orderId)) {
        const v = (cfg.ordersViewLink || []).join(','); const vl = v ? row.querySelector(v) : null;
        if (vl) { safeClick(vl, 'View Link'); return true; }
        const a = row.querySelector('a[href]'); if (a) { safeClick(a, 'View Link a'); return true; }
        safeClick(row, 'Row'); return true;
    }
    await sleep(500);
  }
  const a = Array.from(document.querySelectorAll('a[href]')).find(l => l.innerText?.includes(orderId) || l.href?.toLowerCase().includes(orderId.toLowerCase()));
  if (a) { safeClick(a, 'Fallback Link'); return true; } return false;
}

async function processQueueOnLoad() {
  await sleep(500); 
  const { currentTask, processingTabId, eaAutoControl = false, eaControlHeartbeat = 0 } = await storageGet({ currentTask: null, processingTabId: null, eaAutoControl: false, eaControlHeartbeat: 0 });
  
  log('🔄 processQueueOnLoad started', { 
    hasCurrentTask: !!currentTask, 
    taskId: currentTask?.taskId,
    orderId: currentTask?.orderId,
    processingTabId,
    eaAutoControl,
    pageType: getPageType(),
    url: location.href
  });

  // ── وضع المراقب (الافتراضي): بدون أمر تحكم صريح لا نلمس أي بيانات ──
  // الإضافة مراقب فقط: تسجل ما يحدث، ولا تمسح ولا تعدّل أي شيء.
  if (!eaAutoControl) {
    if (currentTask) {
      log('👁️ Monitor mode: no control command from user — logging only, keeping currentTask untouched.');
      sendSmartLog('MONITOR', { orderId: currentTask.orderId, pageType: getPageType(), url: location.href, reason: 'no-control-command' });
    }
    return;
  }

  // ── حماية جديدة: لا نعيد تشغيل مهمة قديمة على تبويب ليس تبويب المعالجة ──
  // الباتش يعمل على تبويب محدد (processingTabId). أي تبويب آخر يفتحه المستخدم يدوياً
  // كان عند تحديثه يعيد تشغيل المهمة القديمة ويمسح/يعبئ حقول البلاغ ببيانات بلاغ آخر!
  // إذا لم يُحدد processingTabId → نسمح بالتشغيل (سلوك قديم آمن للباتش من التبويب الحالي).
  if (currentTask && processingTabId) {
    let myTabId = null;
    try { myTabId = (await chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }))?.tabId; } catch (e) {}
    if (myTabId && myTabId !== processingTabId) {
      log(`👁️ Monitor mode: this tab (${myTabId}) is not the processing tab (${processingTabId}) — logging only, data untouched.`);
      sendSmartLog('MONITOR', { orderId: currentTask.orderId, pageType: getPageType(), url: location.href, reason: 'not-processing-tab' });
      return;
    }
  }

  // ── مهلة التحكم: إذا مرّ وقت طويل بدون نشاط (تبويب ميت/باتش متعطل) نعود للمراقب ──
  // بدون حذف أي بيانات — فقط نتوقف عن التحكم.
  const CONTROL_TIMEOUT_MS = 60 * 60 * 1000; // ساعة واحدة
  if (currentTask && (Date.now() - eaControlHeartbeat) > CONTROL_TIMEOUT_MS) {
    warn('⏳ Control timeout reached — returning to Monitor mode (data untouched).');
    await pauseToMonitor('control-timeout', currentTask);
    return;
  }
  await storageSet({ eaControlHeartbeat: Date.now() });

  if (!currentTask) {
    log('⚠️ No currentTask found, exiting');
    return;
  }

  const p = getPageType(); const cfg = await loadSelectors();
  document.body.dataset.isAutofilling = 'true';
  sendSmartLog('TASK_START', { orderId: currentTask.orderId, mode: currentTask.mode || 'search' });
  if (p === 'ORDERS') {
     notifyStatus(currentTask.taskId, 'searching', `البحث عن: ${currentTask.orderId}`, 'search');
     if (!await findOrderAndOpen(currentTask.orderId, cfg)) {
         sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'not-found', mode: currentTask.mode || 'search' });
         delete document.body.dataset.isAutofilling;
         notifyStatus(currentTask.taskId, 'not-found', `لم يُعثر : ${currentTask.orderId}`, 'search');
         await finalizeOrderInSession(currentTask, { error: 'not-found' }, 'not-found');
         await clearCurrentTask(); const { taskQueue, taskDelay: td1 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 }); await sleep(td1); 
         if (taskQueue.length > 0) { await startNextTask(taskQueue); } else { notifyStatus('batch', 'batch-done', 'اكتمل Batch'); await finalizeSession(); chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); }
         return;
     }
     notifyStatus(currentTask.taskId, 'navigating', 'جارٍ الانتقال...', 'navigation');
   } else if (p === 'WORK_ORDER_REVIEW') {
      notifyStatus(currentTask.taskId, 'filling', `جاري التفريغ لـ: ${currentTask.orderId}`, 'page1-review');
      try {
       // ── عداد محاولات مستقل (حارس الحلقة اللانهائية) ──
       // حتى لو البورتال أعاد تحميل الصفحة بنفسه (full reload) بعد خطأ،
       // العداد يستمر في التزايد لكل دخول لنفس taskId — يمنع إعادة المحاولة لأكثر من الحد.
       const { taskRetryFlag, taskAttempts = 0, lastAttemptTaskId = '' } = await storageGet({ taskRetryFlag: false, taskAttempts: 0, lastAttemptTaskId: '' });
       const attempts = (lastAttemptTaskId === currentTask.taskId) ? (taskAttempts + 1) : 1;
       await storageSet({ taskAttempts: attempts, lastAttemptTaskId: currentTask.taskId });
       log(`🔁 محاولة #${attempts} من أصل ${MAX_TASK_ATTEMPTS} للبلاغ ${currentTask.orderId}`);

       if (attempts > MAX_TASK_ATTEMPTS) {
         warn(`❌ الصفحة الأولى فشلت ${attempts} محاولات — تخطي للتالي مباشرة (منع التكرار اللانهائي).`);
         sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'max-attempts-reached', mode: currentTask.mode || 'search', attempts });
         delete document.body.dataset.isAutofilling;
         notifyStatus(currentTask.taskId, 'error', '❌ فشل بعد محاولات متكررة — تخطي للتالي');
         await finalizeOrderInSession(currentTask, { error: 'max-attempts-reached', attempts }, 'error');
         await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
         await clearCurrentTask();
         const { taskQueue: qMax, taskDelay: tdMax = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
         if (qMax.length > 0) { await sleep(tdMax); await startNextTask(qMax); }
         else { 
            notifyStatus('batch', 'batch-done', 'اكتمل Batch'); 
            await finalizeSession(); // END SESSION
            chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
         }
         return;
       }

       const routerRes = await runSingleLineWithRouter(currentTask);
        if (routerRes && routerRes.isFullyDone) {
           const ok = routerRes.report?.saveResult?.ok;
           sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: ok, mode: currentTask.mode || 'search' });
           delete document.body.dataset.isAutofilling;
           notifyStatus(currentTask.taskId, ok ? 'done' : 'save-failed', ok ? '✅ اكتمل' : '⚠️ لم يتأكد', 'complete');
          await finalizeOrderInSession(currentTask, routerRes.report, ok ? 'done' : 'save-failed');

          if (ok) {
            try { document.dispatchEvent(new CustomEvent('elaraby:upload-images', { detail: { orderId: currentTask.orderId } })); log('📷 طلب رفع صور المرفقات: ' + currentTask.orderId); } catch(e) { log('📷 فشل إرسال طلب رفع الصور: ' + e.message); }
          }

          await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
          await clearCurrentTask();
          const { taskQueue, taskDelay: td2 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
          if (taskQueue.length > 0) { await sleep(td2); await startNextTask(taskQueue); }
          else { 
             notifyStatus('batch', 'batch-done', 'اكتمل Batch'); 
             await finalizeSession(); // END SESSION
             chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
          }
       } else if (routerRes && routerRes.isManualStop) {
          log('Manual stop requested. Pausing here.');
          notifyStatus(currentTask.taskId, 'stopped', '⏸️ بانتظار الإكمال اليدوي', 'paused');
          await finalizeOrderInSession(currentTask, routerRes.report, 'stopped');
          await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
          await clearCurrentTask();
          // We intentionally do not call startNextTask() to stop the queue.
       } else {
          if (!taskRetryFlag) {
            log('⚠️ Page 1 incomplete. Retrying once...');
            notifyStatus(currentTask.taskId, 'filling', '🔄 إعادة المحاولة...', 'retry');
            await storageSet({ taskRetryFlag: true });
            location.reload();
          } else {
            warn('❌ Retry failed. Skipping to next task.');
            sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'retry-failed', mode: currentTask.mode || 'search' });
            delete document.body.dataset.isAutofilling;
            notifyStatus(currentTask.taskId, 'error', '❌ فشل — تخطي للتالي', 'error');
            await finalizeOrderInSession(currentTask, routerRes.report, 'error');
            await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
            await clearCurrentTask();
            const { taskQueue: q2, taskDelay: td3 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
            if (q2.length > 0) { await sleep(td3); await startNextTask(q2); }
            else { 
               notifyStatus('batch', 'batch-done', 'اكتمل Batch'); 
               await finalizeSession(); // END SESSION
               chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
            }
          }
       }
     } catch (e) {
       err('💥 Unexpected error in router: ' + e);
        if (currentTask) sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'error', mode: currentTask.mode || 'search' });
        delete document.body.dataset.isAutofilling;
        notifyStatus(currentTask?.taskId, 'error', '❌ خطأ غير متوقع — تخطي للتالي', 'error');
       if (currentTask) await finalizeOrderInSession(currentTask, { error: e.toString() }, 'error');
       await clearCurrentTask();
       const { taskQueue: qErr, taskDelay: td5 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
       if (qErr.length > 0) { await sleep(td5); await startNextTask(qErr); }
       else { 
          notifyStatus('batch', 'batch-done', 'اكتمل Batch'); 
          await finalizeSession(); // END SESSION
          chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
       }
     }
  } else { location.href = ORDERS_URL; }
}

// ── SESSION ENGINE ─────────────────────────────────────────────────────────────
// Groups orders into sessions instead of single disjointed logs.

async function openSession(batchId, tasks) {
  try {
    const session = {
      id: batchId || 'session-' + Date.now(),
      startTime: new Date().toISOString(),
      endTime: null,
      totalTasks: tasks.length,
      orders: []
    };
    await storageSet({ activeSession: session });
    log('🟢 Session opened:', session.id);
  } catch (e) { warn('openSession error', e); }
}

async function finalizeOrderInSession(task, report, status) {
  try {
    const { activeSession } = await storageGet('activeSession');
    if (!activeSession) return;
    
    // Scrape full details from page (address, customer, phone, complaint code, manual modifications)
    let pageDetails = {};
    try {
      pageDetails = await scrapeFullOrderDetails(report?.filled || task?.data || {});
    } catch(e) { warn('scrapeFullOrderDetails error', e); }

    // Check if order already exists in this session
    const existingIdx = activeSession.orders.findIndex(o => o.orderId === task.orderId);
    
    const orderData = {
      orderId: task.orderId,
      status: status,
      timestamp: new Date().toISOString(),
      // Injected data (from the extension)
      injectedData: report?.filled || task?.data || {},
      // Rich field results (which fields succeeded/failed)
      fieldResults: report?.fieldResults || {},
      saveResult: report?.saveResult || {},
      // Page-scraped details (address, customer name, phone, complaint code)
      pageDetails,
      // Technician selected
      technician: report?.technician || report?.fieldResults?.technician?.selected || null,
      // Service filled (installation)
      serviceFilled: report?.serviceFilled || false,
      // Problem code selected
      problemSelected: report?.fieldResults?.problem?.selected || null,
      // Full report object for compatibility
      report: report || {},
      originalTask: task
    };
    
    if (existingIdx > -1) {
      activeSession.orders[existingIdx] = orderData;
    } else {
      activeSession.orders.push(orderData);
    }
    
    await storageSet({ activeSession });
    log('📥 Order finalized in session:', task.orderId, status);
  } catch (e) { warn('finalizeOrderInSession error', e); }
}

async function finalizeSession() {
  try {
    const { activeSession, sessionLogs = [] } = await storageGet(['activeSession', 'sessionLogs']);
    if (!activeSession) return;
    
    activeSession.endTime = new Date().toISOString();
    sessionLogs.push(activeSession);
    
    // نهاية الباتش = العودة لوضع المراقب (لا تحكم إلا بأمر صريح جديد)
    await storageSet({ sessionLogs, activeSession: null, eaAutoControl: false, eaControlHeartbeat: 0 });
    log('🔴 Session finalized and saved:', activeSession.id);
    log('👁️ Control released — back to Monitor mode.');
    chrome.runtime.sendMessage({ type: 'NEW_LOG' }).catch(()=>{});
  } catch (e) { warn('finalizeSession error', e); }
}

// ── Helper functions for QUICK_PASTE_BATCH ──
function extractOrderIdFromLine(line) {
  const m1 = line.match(/orderid\s*:\s*([^\s|,]+)/i);
  if (m1) return m1[1].trim();
  const m2 = line.match(/(CAS\d{10,}|WO-?\d+)/i);
  if (m2) return m2[1];
  // Last resort: first token that looks like an ID
  const tokens = line.trim().split(/[\s|,]+/);
  return tokens[0] || null;
}

function generateTaskId() {
  return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function buildTasksFromLines(lines) {
  const tasks = [];
  const seen = new Set();
  for (const line of lines) {
    const oid = extractOrderIdFromLine(line) || line.trim().substring(0, 30);
    if (seen.has(oid)) continue;
    seen.add(oid);
    tasks.push({
      taskId: generateTaskId(),
      orderId: oid,
      line: line,
      data: { forceDrainCleaning: false, shahnEnabled: false, forceOverwrite: false }
    });
  }
  return tasks;
}

// Unified Dispatcher: كل أفعال هذا الملف مقيّدة عبر message-bus (message-bus.js).
// لا مستمع خام واحد متعدد الأفعال؛ الموزع يكلّف بملكية action واحدة لكل handler.
if (typeof messageBus !== 'undefined') {
  messageBus.on('RUN_SINGLE', (msg, sendResponse) => {
    // أمر تحكم صريح من المستخدم (زر تعبئة بلاغ واحد) → تفعيل وضع التحكم
    storageSet({ eaAutoControl: true, eaControlHeartbeat: Date.now() });
    runSingleLineWithRouter(msg).then(async (res) => {
      // بعد اكتمال المهمة الفردية نعود لوضع المراقب:
      // أي reload لاحق (الضغط على التالي/حفظ) لن يلمس البيانات — مراقب وتسجيل فقط.
      try { await storageSet({ eaAutoControl: false, eaControlHeartbeat: 0 }); } catch (e) {}
      sendResponse(res);
    }, async (err) => {
      try { await storageSet({ eaAutoControl: false, eaControlHeartbeat: 0 }); } catch (e) {}
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });
  });

  messageBus.on('START_QUEUE', (msg, sendResponse) => startQueueHandler(msg, sendResponse));
  messageBus.on('START_SECOND_VISIT_QUEUE', (msg, sendResponse) => startQueueHandler(msg, sendResponse));

  messageBus.on('STOP_QUEUE', async (msg, sendResponse) => {
    try {
      await storageSet({ taskQueue: [], eaAutoControl: false, eaControlHeartbeat: 0 });
      await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
      await clearCurrentTask();
      notifyStatus('batch', 'stopped', 'تم إيقاف الكل');
      await finalizeSession(); // END SESSION
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false }); }
  });

  messageBus.on('SKIP_TASK', async (msg, sendResponse) => {
    try {
      const { taskQueue, currentTask } = await storageGet({ taskQueue: [], currentTask: null });
      await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
      const skippedId = msg.taskId;
      notifyStatus(skippedId, 'stopped', '⏭ تم التخطي');
      if (currentTask) await finalizeOrderInSession(currentTask, { skippedReason: 'user-skipped' }, 'skipped');
      await clearCurrentTask();
      if (taskQueue.length > 0) { const { taskDelay: td4 = 800 } = await storageGet({ taskDelay: 800 }); await sleep(td4); await startNextTask(taskQueue); }
      else {
        notifyStatus('batch', 'batch-done', 'اكتمل Batch');
        await finalizeSession(); // END SESSION
        chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(() => {});
      }
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false }); }
  });

  messageBus.on('EXTRACT_DEVICE_DATA', (msg, sendResponse) => {
    // Reportdetail ينقلنا إلى technicalreviewdetails — يجب الرد قبل بدء التنقل
    // حتى لا يضيع الرد في تمزق السياق (نفس قاعدة "Respond BEFORE navigation").
    if (window.location.href.includes('Reportdetail')) {
      startDeviceDataExtraction().catch(() => {});
      sendResponse({ ok: true, pending: true, error: 'جاري الانتقال إلى صفحة المراجعة الفنية لسحب البيانات...' });
      return;
    }
    startDeviceDataExtraction().then(sendResponse, (err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
  });

  messageBus.on('QUICK_PASTE_BATCH', (msg, sendResponse) => {
    sendResponse({ ok: true });
    setTimeout(async () => {
      try {
        if (_quickBatchStarting) return;
        _quickBatchStarting = true;
        const text = await readClipboardSafe();
        if (!text) { showPageToast('⚠️ الحافظة فارغة أو غير مسموحة', 'error'); return; }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) { showPageToast('⚠️ لا توجد بيانات في الحافظة', 'error'); return; }
        const tasks = buildTasksFromLines(lines);
        if (!tasks.length) { showPageToast('⚠️ لم يتم التعرف على Order IDs', 'error'); return; }
        tasks.forEach(t => { t.stopAfterPage2 = true; });
        showPageToast(`✅ بدء التشغيل — ${tasks.length} مهمة`, 'success');
        const batchId = 'batch-' + Date.now();
        await openSession(batchId, tasks);
        await storageSet({ taskQueue: tasks.slice(1), taskResults: [], taskDelay: 2000, eaAutoControl: true, eaControlHeartbeat: Date.now() });
        await startNextTask(tasks);
      } catch (e) { /* best effort */ }
      finally { _quickBatchStarting = false; }
    }, 100);
});

  // قراءة آمنة للحافظة: should work within (user gesture) OR أي pause
  async function readClipboardSafe() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  } catch (e) { /* permission/gesture — fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    const ok = document.execCommand('paste');
    document.body.removeChild(ta);
    if (ok && ta.value) return ta.value;
  } catch (e) { /* ignore */ }
  return '';
}

  messageBus.on('PARTS_SEARCH', (msg, sendResponse) => {
    try {
      const model = String(msg.model || '').replace(/[^\w\u0600-\u06FF-]/g, '').toLowerCase();
      const serial = String(msg.serial || '').replace(/[^\w\u0600-\u06FF-]/g, '').toLowerCase();
      const parts = [];
      document.querySelectorAll('tr, .entitylist-items > li, [role="row"]').forEach(row => {
        const text = (row.innerText || '').trim();
        if (!text || text.length > 500) return;
        const norm = text.replace(/[^\w\u0600-\u06FF-]/g, '').toLowerCase();
        const match = (model && norm.includes(model)) || (serial && norm.includes(serial));
        if (match) parts.push({ name: text.split('\n')[0] || text.substring(0, 60), model: msg.model || '', serial: msg.serial || '', source: 'صفحة الموديل' });
      });
      sendResponse({ ok: true, parts: parts.slice(0, 50) });
    } catch (e) { sendResponse({ ok: false }); }
  });

  messageBus.on('OPEN_TECH_REVIEW', (msg, sendResponse) => {
    try {
      const currentUrl = window.location.href;
      if (currentUrl.includes('Reportdetail')) {
        window.location.href = currentUrl.replace('Reportdetail', 'technicalreviewdetails');
      } else if (currentUrl.includes('workorderreview')) {
        window.location.href = currentUrl.replace('workorderreview', 'technicalreviewdetails');
      } else if (currentUrl.includes('technicalreviewdetails')) {
        showPageToast('✅ أنت بالفعل في صفحة المراجعة الفنية', 'success');
      } else {
        showPageToast('⚠️ افتح بلاغ أولاً', 'warn');
      }
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false }); }
  });
}

async function startQueueHandler(msg, sendResponse) {
  try {
    const tasks = msg.tasks || [];
    const batchId = 'batch-' + Date.now();
    await openSession(batchId, tasks);
    await storageSet({
      taskQueue: tasks.slice(1),
      taskResults: [],
      processingTabId: msg.tabId,
      taskDelay: msg.delay || 800,
      // أمر تحكم صريح من المستخدم → تفعيل وضع التحكم
      eaAutoControl: true,
      eaControlHeartbeat: Date.now()
    });
    await storageRemove(['taskRetryFlag', 'taskAttempts', 'lastAttemptTaskId']);
    await clearCurrentTask();
    // Respond BEFORE startNextTask — it may navigate away, killing this context
    sendResponse({ ok: true });
    await startNextTask(tasks);
  } catch (e) { sendResponse({ ok: false }); }
}
processQueueOnLoad().catch(()=>{});

// --- Device Data Extraction Logic ---
async function startDeviceDataExtraction() {
  const currentUrl = window.location.href;
  if (currentUrl.includes('workorderreview')) {
    return await performExtractionAndLog();
  } else if (currentUrl.includes('Reportdetail')) {
    await storageSet({ extractingDeviceData: true });
    window.location.href = currentUrl.replace('Reportdetail', 'technicalreviewdetails');
    return { ok: true, pending: true, error: 'جاري الانتقال إلى صفحة المراجعة الفنية لسحب البيانات...' };
  } else if (currentUrl.includes('technicalreviewdetails')) {
    return await performExtractionAndLog();
  } else {
    return { ok: false, error: 'الرجاء فتح صفحة workorderreview أو Reportdetail أو technicalreviewdetails للقيام بسحب البيانات.' };
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
  const brandEl = qSel('input[aria-label="علامة تجارية"]') || qSel('#ats_producttypebrand_name');
  const modelEl = qSel('input[aria-label="الموديل الفعلى 1"]') || qSel('#ldv_actualmodel_name');
  const model2El = qSel('input[aria-label="الموديل الفعلى 2"]') || qSel('#ldv_actualmodel2_name');
  const serial1El = qSel('#ldv_technicalserialnumber') || qSel('[aria-label*="الرقم المسلسل"]');
  const serial2El = qSel('#ldv_secondtechnicalserial');

  const brand = brandEl?.value || brandEl?.innerText || '';
  const model1 = modelEl?.value || modelEl?.innerText || '';
  const model2 = model2El?.value || model2El?.innerText || '';
  const serial1 = serial1El?.value || serial1El?.innerText || '';
  const serial2 = serial2El?.value || serial2El?.innerText || '';

  if ((!brand || !model1 || !serial1) && attempt <= 20) {
    return await new Promise(resolve => {
      setTimeout(async () => resolve(await performExtractionAndLog(attempt + 1)), 500);
    });
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
    position: fixed; top: 20px; right: 20px; background: #4caf50; color: white;
    padding: 16px 20px; border-radius: 10px; z-index: 999999; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: Consolas, 'Courier New', monospace; direction: ltr; font-size: 13px; max-width: 600px;
  `;
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:15px;font-family:Arial,sans-serif;">✅ تم سحب بيانات الجهاز بنجاح!</span>
      <button id="ext-copy-btn" style="background:#fff;color:#4caf50;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">📋 نسخ</button>
    </div>
    <div style="background:rgba(0,0,0,0.15);padding:10px 12px;border-radius:6px;white-space:pre-wrap;line-height:1.8;">${copyText}</div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ext-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(copyText).then(() => {
      const btn = overlay.querySelector('#ext-copy-btn');
      btn.textContent = '✅ تم النسخ!';
      btn.style.color = '#4caf50';
      setTimeout(() => { btn.textContent = '📋 نسخ'; btn.style.color = '#4caf50'; }, 1500);
    });
  });

  setTimeout(() => overlay.remove(), 15000);

  return {
    ok: true,
    data: {
      brand: brandText,
      model: model1Code,
      model2: model2Code,
      serial: lines.length > 1 ? `${serial1} / ${finalSerial2}` : serial1,
      status: 'Out of Warranty'
    }
  };
}

// ══════════════════════════════════════════════════════════
//  📡 Network Capture Bridge — من سكربت الفلتر (MAIN world)
//  ⚠️ مُعطَّل نهائيًا — سكربت الفلتر حُذف بالكامل (كان يضيّق
//  نطاق عرض المستخدم بدل توسيعه). لا يوجد مرسل لهذه الأحداث.
// ══════════════════════════════════════════════════════════

