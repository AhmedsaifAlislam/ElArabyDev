// =========================================================
// content-script.js â€” Portal AutoFiller v3.0
// TARGET: Modular Architecture (Page1 & Page 2) + ClearBtn Verifier
// =========================================================
'use strict';

const LOG_PREFIX = '[AutoFiller v3.0]';
const PORTAL_BASE = 'https://elarabyportalpfs.powerappsportals.com';
const ORDERS_URL  = PORTAL_BASE + '/en-US/Orders/';

// â”€â”€ Storage proxy (Edge Tracking Prevention bypass) â”€â”€
async function storageGet(keys) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys });
    return resp?.data || {};
  } catch(e) { return {}; }
}
async function storageSet(data) {
  try {
    await chrome.runtime.sendMessage({ type: 'STORAGE_SET', data });
  } catch(e) {}
}
async function storageRemove(keys) {
  try {
    await chrome.runtime.sendMessage({ type: 'STORAGE_REMOVE', keys });
  } catch(e) {}
}

function sendSmartLog(eventType, details) {
  chrome.runtime.sendMessage({ type: 'SMART_LOG_EVENT', event: { pageVisitId: null, url: location.href, pageType: getPageType(), timestamp: Date.now(), eventType, isAutomated: document.body?.dataset?.isAutofilling === 'true', ...details } }).catch(()=>{});
}

async function sysLog(msg, type='info') {
  const symbol = type === 'error' ? 'âŒ' : type === 'success' ? 'âœ…' : type === 'warn' ? 'âš ï¸' : 'â„¹ï¸';
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

// â”€â”€ Utility: Safe Click to catch and log silent UI errors â”€â”€
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

// â”€â”€ Page Toast notification â”€â”€
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
    serial: ["#ldv_serialnumber","#ldv_technicalserialnumber","[aria-label*='Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„']","[name*='serial']","input[id*='serial']"],
    serial2: ["#ldv_serialnumber1","[aria-label*='Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 2']","[name*='serialnumber1']"],
    brandInput: ["#ats_producttypebrand_name","input[aria-label='Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡']","input[aria-label*='Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡']","input[id*='brand']","input[name*='brand']"],
    brandBtn: ["button[aria-label*='Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡ Launch lookup modal']",".launchentitylookup","button[aria-label*='Brand']",".lookup-brand button"],
    modelInput: ["#ldv_actualmodel_name","input[aria-label='Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 1']","input[aria-label*='Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ']","input[name*='actualmodel']","input[name*='model']","input[id*='actualModel']"],
    modelInput2: ["#ldv_actualmodel2_name","input[aria-label='Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 2']","input[aria-label*='Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 2']"],
    modelBtn: ["button[aria-label*='Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ Launch lookup modal']",".launchentitylookup","button[aria-label*='Model']",".lookup-model button"],
    statusSelect: ["#ldv_warrantystatus","select[name*='warranty']","select[aria-label*='Warranty']","select[id*='warranty']","select[name*='status']"],
    dateInput: ["#ldv_warrantydate_datepicker_description","input[aria-label*='Warranty Date']","input[aria-label*='ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¶Ù…Ø§Ù†']","input[name*='warrantyDate']","input[id*='warrantydate']","input[type='date']"],
    notes: ["textarea[aria-label*='Notes']","textarea[name*='notes']","textarea[id*='notes']"],
    nextBtn: ["#NextButton","input[type='button'][value='Next']","input[type='button'][value='Ø§Ù„ØªØ§Ù„ÙŠ']","button[aria-label='Next']","button[aria-label='Ø§Ù„ØªØ§Ù„ÙŠ']","button[type='submit']"],
    lookupModalItem: ["[role='dialog'] li","[role='listbox'] [role='option']",".lookup-modal .result-item",".modal .result-item","table tbody tr", ".entitylist-items li"],
    lookupSearchInput:["[role='dialog'] input[type='search']","[role='dialog'] input[type='text']",".modal input"],
    successIndicator: [".save-success",".alert-success","[class*='success']"],
    customer: [".customer-name","[class*='customer-name']"],
    orderNumber: [".order-number","[class*='order-id']","[class*='workorder-id']"],
    ordersSearchInput:["input[aria-label*='Search']","input[placeholder*='Search']","input[placeholder*='Ø¨Ø­Ø«']","#searchOrders","input[type='search']"],
    ordersSearchBtn: ["button[type='submit'][aria-label*='Search']","button[aria-label*='Search']","button[aria-label*='Ø¨Ø­Ø«']"],
    ordersTableRow: ["table tbody tr","[role='row']",".entitylist-items > li",".order-row"],
    ordersViewLink: ["a[href*='workorderreview']","a[href*='followup']","a[href*='review']","button[aria-label*='View']","button[aria-label*='Ù…ØªØ§Ø¨Ø¹Ø©']"],
    _batchDelay: 1200, _nextWaitTimeout: 10000, _lookupTimeout: 6000, _ordersSearchWait: 2000, _retryCount: 3
  };
}

function findFirst(list) {
  if (!list) return null; if (!Array.isArray(list)) list = [list];
  for (const s of list) { if (s instanceof HTMLElement) return s; try { const el = document.querySelector(s); if (el) return el; } catch (_) {} }
  return null;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// â”€â”€ Dynamic Resilience Wait for PowerApps Loading Overlay â”€â”€
async function waitForSaveComplete(startUrl, cfg, maxWaitMs = 15000) {
  log('â³ Waiting for PowerApps to process (Dynamic Wait)...');
  await sleep(1000); // Give UI time to show loading overlay
  const sw = Date.now();
  let isSaved = false;
  
  while (Date.now() - sw < maxWaitMs) {
    if (findFirst(cfg.successIndicator || [])) { isSaved = true; break; }
    if (location.href !== startUrl && !location.href.includes('stepid=')) { isSaved = true; break; }
    
    const isBlocked = !!document.querySelector('.blockUI, .blockOverlay, .loading-spinner');
    const hasError = !!document.querySelector('.alert-danger, .validation-summary-errors');
    
    if (!isBlocked && hasError) {
      warn('âš ï¸ Validation error appeared during wait. Aborting wait.');
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// UI INTERACTIONS & MODALS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  const btn = Array.from(container.querySelectorAll('button, a.btn')).find(b => !/clear|Ù…Ø³Ø­|remove|delete/i.test(b.className+(b.getAttribute('aria-label')||'')+(b.title||'')));
  return btn || findFirst(fallbackCfgSelectors);
}

async function fillLookupModal(btn, searchValue, rootDoc) {
  if (!btn || !searchValue) return { ok: false };
  if (!rootDoc) rootDoc = document;
  const clearBtn = btn.parentElement?.querySelector('button[aria-label*="Clear"], button[aria-label*="Ù…Ø³Ø­"]');
  if (clearBtn) { clearBtn.click(); await sleep(500); }

  log('Opening Modal for:', searchValue); btn.click(); await sleep(1800);

  // â”€â”€ Try direct pick first (single-page list like Brand) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const itemsSelectors = Array.isArray(CFG.lookupModalItem) ? [...CFG.lookupModalItem] : [CFG.lookupModalItem];
  itemsSelectors.push('.modal table tbody tr');

  const getVisibleItems = () => {
    let all = [];
    for (const sel of itemsSelectors) {
      try { all.push(...Array.from(rootDoc.querySelectorAll(sel)).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0 && !/norecords|Ù„Ø§ØªÙˆØ¬Ø¯/i.test(i.innerText.replace(/\s/g,'')))); } catch (_) {}
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
  const modelCodeOnly = (searchValue||'').split(/\s*[_â€“â€”]\s*/)[0].split('(')[0].trim();
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
        const selBtnList = Array.from(rootDoc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="ØªØ­Ø¯ÙŠØ¯"], .modal button[aria-label*="Ø§Ø®ØªØ±"]'));
        const selectBtn = selBtnList.reverse().find(b => b.offsetParent !== null);
        if (selectBtn) { try { selectBtn.focus(); } catch(e){} selectBtn.click(); try { selectBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(e){} await sleep(1000); }
        return { ok: true, selected: match.innerText?.trim() };
      }

      // Extract the model code from each row for precise matching
      const getRowCode = (row) => {
        const txt = row.innerText.trim();
        // Model code is typically the first segment before " _ " or before Arabic text
        const codePart = txt.split(/\s*[_â€“â€”]\s*/)[0].trim();
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
      // Priority 3: Code-part includes match only (NOT full row text â€” prevents Arabic description false positives)
      const includesMatch = (!exactMatch && !startsMatch) ? items.find(i => {
        const code = normalize(getRowCode(i));
        return code.includes(targetCode) || code.includes(target);
      }) : null;
      const match = exactMatch || startsMatch || includesMatch || null;
      log(`Model pick â€” exact:${!!exactMatch} starts:${!!startsMatch} includes:${!!includesMatch} â†’ "${match?.innerText?.trim().slice(0,60)}"`);
      if (!match) return { ok: false, reason: 'no-match' };
      const radio = match.querySelector('input[type="radio"]');
      if (radio) radio.click(); else { const chk = match.querySelector('input[type="checkbox"]'); if (chk) chk.click(); else match.click(); }
      await sleep(600);
      const selBtnList = Array.from(rootDoc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="ØªØ­Ø¯ÙŠØ¯"], .modal button[aria-label*="Ø§Ø®ØªØ±"]'));
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

  // â”€â”€ Fallback: search mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const searchSelectors = Array.isArray(CFG.lookupSearchInput) ? [...CFG.lookupSearchInput] : [CFG.lookupSearchInput];
  searchSelectors.push('.modal input[type="search"]', '.modal input[type="text"]', '.modal input.query', 'input[placeholder*="Search"]');
  let si = Array.from(rootDoc.querySelectorAll(searchSelectors.join(','))).find(i => i.offsetParent !== null);
  if (!si) { await sleep(1000); si = Array.from(rootDoc.querySelectorAll(searchSelectors.join(','))).find(i => i.offsetParent !== null); }
  
  if (si) { 
    // Use model code only for search to get better results
    const searchFor = modelCodeOnly || searchValue;
    await emulateUserInput(si, searchFor); await sleep(400); 
    const modalSearchBtn = si.parentElement?.querySelector('button') || rootDoc.querySelector('.modal button[aria-label*="Search"], .modal button[aria-label*="Ø¨Ø­Ø«"]');
    if (modalSearchBtn) modalSearchBtn.click(); else ['keydown','keypress','keyup'].forEach(ev => { try { si.dispatchEvent(new KeyboardEvent(ev, { key: 'Enter', keyCode: 13, bubbles: true })); } catch(e){} });
    
    log('â³ Waiting for search results...');
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

// â”€â”€ Modal guard: wait for any open modal to close before proceeding â”€â”€
async function waitForModalCloseIfOpen(timeoutMs = 20000) {
  const modal = document.querySelector('.modal.show, .modal-backdrop.show');
  if (!modal) return;
  log('â³ Waiting for existing modal to close...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!document.querySelector('.modal.show, .modal-backdrop.show')) {
      log('âœ… Existing modal closed');
      await sleep(1000);
      return;
    }
    await sleep(300);
  }
}

// â”€â”€ Find the iframe document inside a modal (PowerApps subgrid modals) â”€â”€
async function waitForModalIframe(modal, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const iframe = modal.querySelector('iframe');
    if (iframe) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iDoc && iDoc.querySelector('button.launchentitylookup, select:not([disabled])')) {
          return { iframe, iframeDoc: iDoc };
        }
        // Also accept if the doc is loaded even without the button yet
        if (iDoc && iDoc.body && iDoc.body.children.length > 0) {
          return { iframe, iframeDoc: iDoc };
        }
      } catch(e) {}
    }
    await sleep(500);
  }
  return null;
}

// Handle Page 2 modals (Problems & Technicians) â€” PowerApps modal with iframe inside
async function handlePage2Modal(btnRegex, searchValue) {
  // Guard: wait for any existing modal to close before clicking add
  await waitForModalCloseIfOpen();

  const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
    .filter(b => b.offsetParent !== null)
    .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));
  if (!addBtn) { warn(`handlePage2Modal: Add button not found`); return { ok: false, reason: 'button-not-found' }; }
  if (!searchValue) searchValue = '*';
  log(`â–¶ï¸ Opening Page2 modal for: ${searchValue}`);
  safeClick(addBtn, 'Page2 Add button');

  // Wait for modal to appear
  let modal = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    modal = document.querySelector('.modal.show, .modal-dialog.show, [role="dialog"]');
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
      /Ø­ÙØ¸|save/i.test((b.innerText || b.value || '').trim()) &&
      b.offsetParent !== null &&
      !/Ø¥Ù„ØºØ§Ø¡|cancel/i.test(b.className + (b.innerText || ''))
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
    let items; try { items = Array.from(document.querySelectorAll(sel)).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0); } catch (_) { continue; }
    if (!items.length) continue;
    const match = items.find(i => (i.textContent||'').toLowerCase().includes(value.toLowerCase())) || items[0];
    match.click(); await sleep(400);
    sendSmartLog('FIELD_FILLED', { field: labelText || 'lookup', value, method: 'fillPowerAppsLookup' });
    return { ok: true };
  }
  const btn = findSafeLookupButton(inputEl, cfgBtnSelectors); if (btn) return await fillLookupModal(btn, value); return { ok: true };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SUPERVISORY VERIFICATION ENGINE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  log(`â–¶ï¸ Filling ${fieldLabel}: "${targetValue}"`);
  
  // Real-time notification updates
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'filling', `Ø¬Ø§Ø±ÙŠ ØªØ¹Ø¨Ø¦Ø©: ${fieldLabel}...`);
  } catch(e){}

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await actionFn(); let verified = false; const start = Date.now();
    while (Date.now() - start < 4500) { if (verifyFn()) { verified = true; break; } await sleep(350); }
    if (verified) {
      log(`âœ… [Success] ${fieldLabel}`);
      sendSmartLog('FIELD_FILLED', { field: fieldLabel, value: targetValue, method: 'fillAndVerify' });
      return { ok: true, result };
    }
    warn(`âš ï¸ [Retry] ${fieldLabel} failed on attempt ${attempt}.`);
    const closeBtn = document.querySelector('.modal.show [data-dismiss="modal"], .modal.show button.close');
    if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); await sleep(800); }
  }
  err(`âŒ [Failed] ${fieldLabel} after ${maxRetries} attempts.`); return { ok: false };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â–¼â–¼â–¼  PAGE 2 HELPER FUNCTIONS (DETECTION)  â–¼â–¼â–¼
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function readDeviceTypeFromPage() {
  const labels = ['Product Category','Product Type','Device Type','Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬','ÙØ¦Ø© Ø§Ù„Ù…Ù†ØªØ¬'];
  for (const lab of labels) {
    const labelEl = Array.from(document.querySelectorAll('label, .field-label, th')).find(l => l.innerText.trim().includes(lab));
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
  } return null;
}

// â”€â”€ Read Customer Complaint Code from page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function readComplaintCodeFromPage() {
  // Try common complaint/symptom field labels
  const labels = [
    'Customer Complaint', 'Complaint Code', 'Complaint',
    'ÙƒÙˆØ¯ Ø§Ù„Ø´ÙƒÙˆÙ‰', 'Ø´ÙƒÙˆÙ‰ Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Ø´ÙƒÙˆÙ‰', 'ÙƒÙˆØ¯ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©', 'Ø§Ù„Ù…Ø´ÙƒÙ„Ø©'
  ];
  for (const lab of labels) {
    const labelEl = Array.from(document.querySelectorAll('label, .field-label, th, td'))
      .find(l => l.innerText && l.innerText.trim().toLowerCase().includes(lab.toLowerCase()));
    if (labelEl) {
      // Check for linked input/select
      const forId = labelEl.getAttribute && labelEl.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
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
  // Fallback: check lookup/readonly display fields near complaint patterns
  const allLabels = Array.from(document.querySelectorAll('label, th'));
  for (const lb of allLabels) {
    if (/Ø´ÙƒÙˆ|complaint/i.test(lb.innerText || '')) {
      let next = lb.nextElementSibling || lb.closest('td')?.nextElementSibling;
      if (next) { const v = (next.innerText || next.value || '').trim(); if (v) return v; }
    }
  }
  return null;
}

// â”€â”€ Scrape full order details from current page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeFullOrderDetails(injectedData = {}) {
  const details = {};
  // Customer address
  const addrLabels = ['Ø§Ù„Ø¹Ù†ÙˆØ§Ù†', 'Address', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Customer Address'];
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
  const custLabels = ['Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Customer Name', 'Customer', 'Ø§Ù„Ø¹Ù…ÙŠÙ„'];
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
  const phoneLabels = ['Ø±Ù‚Ù… Ø§Ù„ØªÙ„ÙŠÙÙˆÙ†', 'Phone', 'Mobile', 'Ø§Ù„Ù…ÙˆØ¨Ø§ÙŠÙ„', 'Ø§Ù„ØªÙ„ÙŠÙÙˆÙ†'];
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
  const fieldMap = { serial: 'Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ØªØ³Ù„Ø³Ù„ÙŠ', brand: 'Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯', model: 'Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„', status: 'Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù†', date: 'Ø§Ù„ØªØ§Ø±ÙŠØ®', notes: 'Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª' };
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
    // Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø© Ù„Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø© / Ù†ÙˆØ¹ Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„
    const typeFields = [
      doc.querySelector('#ats_workordertype_name'),
      doc.querySelector('#ats_servicetype_name'),
      doc.querySelector('[data-logical-name="ats_workordertype"] input[type="text"], [data-logical-name="ats_workordertype"] [role="textbox"]')
    ];
    for (const el of typeFields) {
      if (!el) continue;
      const v = (el.value || el.innerText || '') || '';
      if (/ØªØ±ÙƒÙŠØ¨|installation|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(v)) return true;
    }
    // Ø§Ù„Ù€ select Ø§Ù„Ø®Ø§Øµ Ø¨Ù€ Work Order Type (0 = Installation)
    const sel = doc.querySelector('#ldv_workordertype');
    if (sel) {
      const selVal = sel.value || '';
      const selText = sel.options && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '') : '';
      if (selVal === '0' || /installation/i.test(selText)) return true;
    }
    const hiddenVal = doc.querySelector('#ldv_workordertype_Value');
    if (hiddenVal && hiddenVal.value === '0') return true;
  }
  // fallback: Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† label Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø© ÙˆÙ‚Ø±Ø§Ø¡Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ù…Ù† Ù†ÙØ³ Ø§Ù„Ø®Ù„ÙŠØ© (info/control)
  const keys = ['Report Type','Service Type','Ù†ÙˆØ¹ Ø§Ù„Ø¨Ù„Ø§Øº','Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø©'];
  for (const k of keys) {
    const label = Array.from(document.querySelectorAll('label, .field-label, th')).find(l => l.innerText && l.innerText.trim().includes(k));
    if (label) {
      const td = label.closest('td, .cell, [data-logical-name]');
      const valEl = td ? td.querySelector('.control input, .control select, .control [role="textbox"], .control') : null;
      const val = valEl ? (valEl.value || valEl.innerText || '') : '';
      if (/ØªØ±ÙƒÙŠØ¨|installation/i.test(val)) return true;
    }
  }
  const complaint = (document.querySelector('.initial-complaint, .complaint-text, .description')?.innerText || '');
  if (/ØªØ±ÙƒÙŠØ¨|installation/i.test(complaint)) return true;
  return false;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INSTALLATION & COMMISSIONING - SPECIAL FLOW
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function performInstallationAndCommissioning(data = {}) {
  try { await sleep(1500); } catch(e) {}
  let filledService = false;

  const serviceLabelCandidates = ['Service Type','Report Type','Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø©','Ù†ÙˆØ¹ Ø§Ù„Ø¨Ù„Ø§Øº','Service'];
  for (const lab of serviceLabelCandidates) {
    const labelEl = Array.from(document.querySelectorAll('label, .field-label, th')).find(l => l.innerText && l.innerText.includes(lab));
    if (labelEl) {
      const target = labelEl.getAttribute('for') ? document.getElementById(labelEl.getAttribute('for')) : (labelEl.closest('tr')?.querySelector('td:nth-child(2) input, td:nth-child(2) select, td:nth-child(2)') || labelEl.nextElementSibling);
      if (target) {
        if (target.tagName === 'SELECT') {
          const opt = Array.from(target.options).find(o => /ØªØ±ÙƒÙŠØ¨|Installation|Installation and Commissioning|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(o.text));
          if (opt && target.value !== opt.value) { target.value = opt.value; try { target.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){} filledService = true; break; }
        } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          await emulateUserInput(target, 'ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„'); filledService = true; break;
        } else {
          log('Service field is read-only, skipping direct write');
        }
      }
    }
  }
  const targetTech = data.technicianName || data.technician || null;
  const techRes = await selectRandomTechnician(targetTech);

  const notesCandidates = ['Notes','Ù…Ù„Ø§Ø­Ø¸Ø§Øª','notes_support','notes'];
  for (const nlab of notesCandidates) {
    const notesEl = Array.from(document.querySelectorAll('textarea, input')).find(el => {
      const lab = document.querySelector(`label[for="${el.id}"]`) || el.closest('.field');
      return lab && (lab.innerText || '').includes(nlab);
    });
    if (notesEl) {
      const noteText = data.notes || 'ØªÙ… ØªÙ†ÙÙŠØ° ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„ Ø­Ø³Ø¨ Ø·Ù„Ø¨ Ø§Ù„Ø¹Ù…ÙŠÙ„. Ù„Ø§ Ø£ÙƒÙˆØ§Ø¯ Ø£Ùˆ Ø£Ø±Ù‚Ø§Ù… Ø¥Ø¶Ø§ÙÙŠØ©.';
      await emulateUserInput(notesEl, noteText);
      break;
    }
  }

  const nextBtn = Array.from(document.querySelectorAll('button')).find(b => /Next|Ø§Ù„ØªØ§Ù„ÙŠ|Save|Ø­ÙØ¸|submit/i.test((b.innerText||b.value||b.title||'').trim()) && b.offsetParent !== null && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className));
  let saveOk = false;
  if (nextBtn) {
    const startUrl = location.href; nextBtn.click();
    saveOk = await new Promise(resolve => {
      let done = false; const finish = r => { if(done)return; done=true; obs.disconnect(); resolve(r); };
      const obs = new MutationObserver(() => { if (findFirst([".save-success",".alert-success","[class*='success']"])) finish(true); if (location.href !== startUrl) finish(true); });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true }); setTimeout(() => finish(true), 8000);
    });
  } else { warn('Next/Save button not found for Installation Flow'); }

  return { report: { fieldResults: { 'ØªØ±ÙƒÙŠØ¨': { ok: filledService }, technician: { ok: techRes.ok, selected: techRes.name } }, saveResult: { ok: saveOk } } };
}

async function handleSubgridIframeModal(btnRegex, targetName, pickRandomIfTargetMissing = true, excludePattern = null, priorityPattern = null) {
  const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
    .filter(b => b.offsetParent !== null)
    .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));

  if (!addBtn) return null;

  log(`â–¶ï¸ Opening subgrid modal for: ${btnRegex.source}...`);
  addBtn.click();
  
  let iframeDoc = null, targetIframe = null, lookupBtn = null;
  
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const iframe = Array.from(document.querySelectorAll('iframe')).find(ifr => ifr.offsetParent !== null && ifr.contentDocument);
    if (iframe && iframe.contentDocument) {
      targetIframe = iframe;
      iframeDoc = iframe.contentDocument;
      lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
      const selectEl = iframeDoc.querySelector('select:not([disabled])');
      if ((lookupBtn && lookupBtn.offsetParent !== null) || (selectEl && selectEl.offsetParent !== null)) break;
    }
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
    function collectDocs(root) {
      const docs = [root];
      root.querySelectorAll('iframe').forEach(f => {
        try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(e) {}
      });
      return docs;
    }
    function getRowsFromDocs(docs) {
      const results = [];
      docs.forEach(doc => {
        if (!doc) return;
        const rows = doc.querySelectorAll('table tbody tr, div[role="grid"] tr, table tr:not(:first-child)');
        rows.forEach(r => {
          if (r.offsetParent !== null && r.innerText.trim() && !/norecords|Ù„Ø§ ØªÙˆØ¬Ø¯/i.test(r.innerText.replace(/\s/g,''))) results.push(r);
        });
      });
      return results;
    }
    const allDocs = [...new Set([...collectDocs(iframeDoc), ...collectDocs(document)])];
    
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
    
    // Filter out excluded patterns (e.g. ØªØ±ØµÙŠØ¯ for problems)
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
        if (priorityMatch) log('â­ Priority match found: "' + priorityMatch.innerText.trim().slice(0,60) + '"');
      }

      // Smart matching: separate installation vs regular
      let exactMatch = priorityMatch; // Priority match wins
      if (!exactMatch && cleanTarget) {
        if (/ØªØ±ÙƒÙŠØ¨/.test(cleanTarget)) {
          exactMatch = items.find(i => /ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(i.innerText)) || items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
        } else {
          exactMatch = items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
        }
      }
      
      const rand = exactMatch || (pickRandomIfTargetMissing ? items[Math.floor(Math.random() * items.length)] : null);
      
      if (!rand) {
        log('âš ï¸ No match for "' + cleanTarget + '" in ' + items.length + ' items â€” skipping');
        const cBtn = Array.from(iframeDoc.querySelectorAll('[data-dismiss="modal"]')).filter(b => b.offsetParent !== null).reverse()[0];
        if (cBtn) cBtn.click();
        await sleep(1000);
        return { ok: false, reason: 'no-match' };
      }
      
      selectedName = rand.innerText.trim();
      const radio = rand.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radio) radio.click(); else rand.click();
      await sleep(600);
      
      log(`Selected: ${selectedName.slice(0, 50)}, clicking Ø§Ø®ØªØ±...`);
      let selBtn = null;
      for (const d of allDocs) {
        if (!d) continue;
        const found = Array.from(d.querySelectorAll('button.btn-primary, input.btn-primary, input[value="Ø§Ø®ØªØ±"], input[value="Select"], button[aria-label="Select"], button[aria-label*="Ø§Ø®ØªØ±"]')).filter(b => b.offsetParent !== null);
        if (found.length) { selBtn = found[found.length - 1]; break; }
      }
      if (!selBtn) {
        for (const d of allDocs) {
          if (!d) continue;
          const modalClose = Array.from(d.querySelectorAll('[data-dismiss="modal"]')).find(b => b.offsetParent !== null && /Ø§Ø®ØªØ±|select/i.test(b.innerText));
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
  const subBtn = iframeDoc.getElementById('InsertButton') || iframeDoc.getElementById('SubmitButton') || Array.from(iframeDoc.querySelectorAll('input[type="submit"], button.btn-primary')).find(b => b.offsetParent !== null && /save|submit|Ø­ÙØ¸|insert/i.test(b.innerText || b.value || b.title));
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
  const existing = await hasExistingSubgridRow(/Ø§Ù„ÙÙ†ÙŠÙŠÙ†|Technicians/i);
  if (existing) {
    log('â„¹ï¸ Technician subgrid already has rows â€” skipping');
    return { ok: true, name: '(Ù…ÙˆØ¬ÙˆØ¯ Ù…Ø³Ø¨Ù‚Ø§Ù‹)' };
  }

  log('â–¶ï¸ Looking for Technician button...');
  const allBtns = Array.from(document.querySelectorAll('a, button, input[type="button"]')).filter(b => b.offsetParent !== null);
  const techBtns = allBtns.filter(b => /ÙÙ†|tech/i.test((b.innerText||b.title||b.value||'').trim()));
  log(`Found ${techBtns.length} tech-related buttons: ${techBtns.map(b=>'"'+(b.innerText||b.title||b.value||'').trim().slice(0,30)+'"').join(', ')}`);

  let res = await handlePage2Modal(/[Ø§Ø¥Ø£]Ø¶Ø§Ù[Ø©Ù‡]\s*ÙÙ†|Add.*Tech/i, targetName);
  if (res && res.ok) return res;
  if (res && !res.ok) log('âš ï¸ Technician handlePage2Modal failed');

  log('Trying inline technician lookup...');
  const lab = findFieldByLabel(['Ø§Ù„ÙÙ†ÙŠÙŠÙ†','Ø§Ù„ÙÙ†ÙŠ','Technician','Technicians']);
  if (!lab) { log('âŒ No technician field found on page'); return { ok: false }; }
  if (lab.tagName === 'SELECT') {
    const valid = Array.from(lab.options).filter(o => o.value && o.text.trim());
    if (valid.length) { const rand = targetName ? (valid.find(o=>o.text.includes(targetName))||valid[0]) : valid[Math.floor(Math.random()*valid.length)]; await emulateUserInput(lab, rand.value); return { ok: true, name: rand.text }; }
  }
  const btn = findSafeLookupButton(lab, ['.lookup-technician button', '.lookup-btn']);
  if (btn) {
    btn.click(); await sleep(2000); 
    const items = Array.from(document.querySelectorAll('.modal table tbody tr, .modal-body table tbody tr td:first-child')).filter(i => i.offsetParent !== null && i.innerText.trim() && !/norecords|Ù„Ø§ØªÙˆØ¬Ø¯/.test(i.innerText.replace(/\s/g,'')));
    if (items.length) {
      const rand = targetName ? (items.find(i => i.innerText.trim().includes(targetName)) || items[0]) : items[Math.floor(Math.random()*items.length)];
      const radio = rand.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radio) radio.click(); else rand.click(); await sleep(300);
      const sels = Array.from(document.querySelectorAll('.modal button.btn-primary, .modal input.btn-primary, .modal input[value="Ø§Ø®ØªØ±"], .modal input[value="Select"], .modal button[aria-label*="Select"], .modal button[aria-label*="Ø§Ø®ØªØ±"]'));
      const selectBtn = sels.reverse().find(b => b.offsetParent !== null);
      if (selectBtn) { try{selectBtn.focus();}catch(e){} selectBtn.click(); try{selectBtn.dispatchEvent(new Event('click',{bubbles:true}));}catch(e){} }
      return { ok: true, name: rand.innerText.trim() };
    }
    const closeBtn = document.querySelector('.modal.show [data-dismiss="modal"]'); if (closeBtn) closeBtn.click();
  }
  return { ok: false };
}

function getProblemCode(deviceName, isInstallRow) {
  // Read customer complaint code from page first (priority source)
  const complaintCode = readComplaintCodeFromPage();
  log('ðŸ” Complaint code from page: ' + (complaintCode || 'NOT FOUND'));

  // Special case: if complaint/reportType indicates installation
  if (isInstallRow || isInstallationReport()) return '*ØªØ±ÙƒÙŠØ¨';

  // Special case: Premium Care
  if (complaintCode && /premium.?care|Ø¨Ø±ÙŠÙ…ÙŠÙ….?ÙƒÙŠØ±|Ø¨Ø±ÙŠÙ…ÙŠÙ… ÙƒÙŠØ±/i.test(complaintCode)) {
    log('â­ Premium Care detected from complaint code');
    return complaintCode; // Return the complaint code itself to search for Premium Care
  }

  // Special case: installation inside complaint text
  if (complaintCode && /ØªØ±ÙƒÙŠØ¨|installation/i.test(complaintCode)) {
    log('ðŸ”§ Installation detected from complaint code');
    return '*ØªØ±ÙƒÙŠØ¨';
  }

  // If complaint code found AND matches problem code pattern, use it
  if (complaintCode && /^\*?\w{2}\d{2}$/i.test(complaintCode)) {
    log('âœ… Using complaint code as problem search: ' + complaintCode);
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
      } catch(e) { /* invalid regex â€” skip */ }
    }
  }

  // Hardcoded fallback (used if selectors.json patterns don't match)
  if (/ØªÙƒÙŠÙŠÙ|ac|air.?cond|split|Ø´Ø¨Ø§Ùƒ|inverter/i.test(text)) { const arr = ['*AC02','*AC03']; return arr[Math.floor(Math.random()*arr.length)]; }
  if (/Ø¨ÙˆØªÙˆØ¬Ø§Ø²|Ø·Ø¨Ø§Ø®|cooker/.test(text)) return '*GS04';
  if (/ØºØ³Ø§Ù„/i.test(text) && !/Ø§Ø·Ø¨Ø§Ù‚|Ø£Ø·Ø¨Ø§Ù‚/.test(text)) return '*WM05';
  if (/Ø«Ù„Ø§Ø¬|Ù…Ø¨Ø±Ø¯|fridge/.test(text)) { const arr = ['*GR01','*GR02','*GR03']; return arr[Math.floor(Math.random()*arr.length)]; }
  if (/Ø§Ø·Ø¨Ø§Ù‚|Ø£Ø·Ø¨Ø§Ù‚|dish/.test(text)) return '*DW06';
  if (/Ø³Ø®Ø§Ù†|heater/.test(text)) return '*HT01';
  return null;
}

// AI-powered problem code selection
async function getSmartProblemCode(deviceName, isInstallRow) {
  if (isInstallRow) return '*ØªØ±ÙƒÙŠØ¨';
  
  const complaintCode = readComplaintCodeFromPage();
  
  if (typeof aiService !== 'undefined' && await aiService.isAvailable()) {
    const aiResult = await aiService.prompt(
      `Ø´ÙƒÙˆÙ‰ Ø§Ù„Ø¹Ù…ÙŠÙ„: "${complaintCode || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}"
       Ù†ÙˆØ¹ Ø§Ù„Ø¬Ù‡Ø§Ø²: "${deviceName}"
       Ø§Ø®ØªØ± ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨ Ù…Ù†: *AC02, *AC03, *GS04, *WM05, *GR01, *GR02, *GR03, *DW06, *HT01, *ØªØ±ÙƒÙŠØ¨
       Ø£Ø±Ø¬Ø¹ Ø§Ù„ÙƒÙˆØ¯ ÙÙ‚Ø· Ø¨Ø¯ÙˆÙ† Ø´Ø±Ø­.`,
      'Ø£Ù†Øª Ù…Ø³Ø§Ø¹Ø¯ Ù…ØªØ®ØµØµ ÙÙŠ Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø¹Ø·Ù„ Ù„Ù„Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„ÙƒÙ‡Ø±Ø¨Ø§Ø¦ÙŠØ©.',
      { timeout: 5000 }
    );
    
    if (aiResult && /\*[A-Z]{2}\d{2}/.test(aiResult)) {
      log('ðŸ¤– AI Problem Code: ' + aiResult);
      return aiResult.trim();
    }
  }
  
  // fallback to legacy regex
  return getProblemCode(deviceName, isInstallRow);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â–¼â–¼â–¼  MODULAR LOGIC: PAGE 1 (Review) vs PAGE 2 (FollowUp)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function parseDataLine(line) {
  const obj = {}; const parts = line.includes('|') ? line.split('|') : line.split(',');
  parts.forEach(p => { const i = p.indexOf(':'); if(i<0)return; obj[p.slice(0,i).trim().toLowerCase().replace(/\s+/g,'')] = p.slice(i+1).trim(); });
  const parsed = {
    orderId: obj['orderid'] || obj['order'] || line.match(/\bCAS\d{10,}\b/i)?.[0] || '', brand: obj['brand'] || obj['Ø¹Ù„Ø§Ù…Ù‡ØªØ¬Ø§Ø±ÙŠÙ‡'] || '',
    model: obj['model'] || obj['Ù…ÙˆØ¯ÙŠÙ„'] || '', serial: obj['serial'] || obj['serialnumber'] || '', model2: obj['model2'] || '',
    serial2: obj['serial2'] || '', status: obj['status'] || obj['Ø­Ø§Ù„Ø©'] || '', date: obj['date'] || obj['ØªØ§Ø±ÙŠØ®'] || '', 
    reportType: obj['reporttype'] || obj['report'] || '',
    date2: obj['date2'] || '',
    problemCode: obj['problemcode'] || obj['problem'] || '',
    faultCode: obj['faultcode'] || obj['fault'] || '',
    subFaultCode: obj['subfault'] || null,
    notes: obj['notes'] || obj['Ù…Ù„Ø§Ø­Ø¸Ø§Øª'] || ''
  };

  // For AC with merged model+serial (model2 exists): pick the newest date
  if (parsed.model2 && parsed.date && parsed.date2) {
    try {
      const toDate = (d) => { const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(m[3], m[2]-1, m[1]) : new Date(d); };
      const d1 = toDate(parsed.date), d2 = toDate(parsed.date2);
      if (d2 > d1) { parsed.date = parsed.date2; sysLog('ðŸ“… Using newer date: ' + parsed.date2, 'info'); }
    } catch(e) { /* keep original date */ }
  }
  return parsed;
}

// â”€â”€ Check if Page 1 fields are already filled (skip already-processed orders) â”€â”€
function isPage1AlreadyFilled(cfg) {
  const serialEl = findFirst(cfg.serial) || findFieldByLabel(['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 1','Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„','Serial Number','Serial']);
  const serialVal = (serialEl?.value || '').trim();

  // Ù„Ùˆ Serial ÙØ§Ø¶ÙŠ Ø£Ùˆ "0" Ø£Ùˆ "Ù„Ø§ ÙŠÙˆØ¬Ø¯" â†’ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù†Ø§Ù‚ØµØ©/ÙˆÙ‡Ù…ÙŠØ© â†’ Ù…ØªØ®Ø·Ø§Ø´
  if (!serialVal || serialVal === '0' || serialVal.includes('Ù„Ø§ ÙŠÙˆØ¬Ø¯')) {
    log(`ðŸ” Serial is "${serialVal || '(empty)'}" â€” page not considered filled.`);
    return false;
  }

  // Ù„Ùˆ Serial Ù…Ù…Ù„ÙˆØ¡ ÙˆØ­Ù‚ÙŠÙ‚ÙŠ (> 3 chars) â†’ Ø´ÙŠÙƒ Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø­Ù‚ÙˆÙ„
  const brandEl = findFirst(cfg.brandInput) || findFieldByLabel(['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡','Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©','Brand']);
  const brandVal = (brandEl?.value || brandEl?.innerText || '').trim();
  const modelEl = findFirst(cfg.modelInput) || findFieldByLabel(['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 1','Model']);
  const modelVal = (modelEl?.value || modelEl?.innerText || '').trim();

  if (serialVal.length > 3 && brandVal.length > 1 && modelVal.length > 1) {
    log(`ðŸ” Page 1 already filled: Brand="${brandVal}", Model="${modelVal}", Serial="${serialVal}" â€” skipping.`);
    return true;
  }
  return false;
}

async function executePage1_Review(data, cfg) {
  const FR = {};
  log('ã€ PAGE 1 ã€‘ Waiting for form to load...');
  const startWait = Date.now();
  while (Date.now() - startWait < 15000) { 
    if (findFirst(cfg.brandInput || []) || findFieldByLabel(['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡','Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©','Brand'])) break; 
    await sleep(250); 
  }
  await sleep(1200);

  // Read and save product type for Page 2
  const pType = readDeviceTypeFromPage() || data.reportType;
  if (pType) await storageSet({ autofiller_ProductType: pType });

  FR.brand = await fillAndVerify('Brand', data.brand, () => fillPowerAppsLookup(findFirst(cfg.brandInput)||findFieldByLabel(['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡','Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©','Brand']), 'Brand', data.brand, cfg.brandBtn), createLookupVerifier(()=>findFirst(cfg.brandInput)||findFieldByLabel(['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡','Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©','Brand'])));
  FR.model = await fillAndVerify('Model1', data.model, () => fillPowerAppsLookup(findFirst(cfg.modelInput)||findFieldByLabel(['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 1','Model']), 'Model1', data.model, cfg.modelBtn), createLookupVerifier(()=>findFirst(cfg.modelInput)||findFieldByLabel(['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 1','Model'])));
  FR.serial = await fillAndVerify('Serial1', data.serial, () => fillElement(findFirst(cfg.serial)||findFieldByLabel(['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 1','Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„','Serial'],'input'), data.serial), createInputVerifier(()=>findFirst(cfg.serial)||findFieldByLabel(['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 1','Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„','Serial'],'input')));
  FR.model2 = await fillAndVerify('Model2', data.model2, () => fillPowerAppsLookup(findFirst(cfg.modelInput2)||findFieldByLabel(['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 2','Model 2']), 'Model2', data.model2, cfg.modelBtn), createLookupVerifier(()=>findFirst(cfg.modelInput2)||findFieldByLabel(['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„ÙŠ 2','Model 2'])));
  FR.serial2 = await fillAndVerify('Serial2', data.serial2, () => fillElement(findFirst(cfg.serial2)||findFieldByLabel(['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 2','Serial 2'],'input'), data.serial2), createInputVerifier(()=>findFirst(cfg.serial2)||findFieldByLabel(['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„ 2','Serial 2'],'input')));
  FR.status = await fillAndVerify('Status', data.status, async () => {
    let el = findFirst(cfg.statusSelect) || findFieldByLabel(['Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù†','Warranty Status'],'select');
    if (!el) el = Array.from(document.querySelectorAll('select')).find(s => /warranty|Ø¶Ù…Ø§Ù†/i.test(s.getAttribute('aria-label')||'') || /warranty|Ø¶Ù…Ø§Ù†/i.test(s.name||'') || /warranty|Ø¶Ù…Ø§Ù†/i.test(s.id||''));
    if (!el) el = Array.from(document.querySelectorAll('select')).find(s => {
      const opts = Array.from(s.options || []);
      return opts.some(o => /warranty|Ø¶Ù…Ø§Ù†/i.test(o.text));
    });
    if (!el) return { ok: false };
    const lower = (data.status || '').toLowerCase();
    const opts = Array.from(el.options || []);
    const match = opts.find(o => o.text.toLowerCase() === lower) || opts.find(o => o.text.toLowerCase().includes(lower)) || opts.find(o => lower.includes(o.text.toLowerCase()) && o.text.trim() !== '') || opts.find(o => o.value === '753240001');
    if (!match) return { ok: false };
    await emulateUserInput(el, match.value);
    return { ok: true, selected: match.text };
  }, createInputVerifier(() => document.querySelector('#ldv_warrantystatus') || document.querySelector('select[name*="warranty"]') || document.querySelector('select[id*="warranty"]') || findFieldByLabel(['Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù†'],'select')));
  FR.date = await fillAndVerify('Date', data.date, () => { let d = data.date; const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(dmy) d=`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; const el=findFirst(cfg.dateInput)||findFieldByLabel(['ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¶Ù…Ø§Ù†','Warranty Date'],'input'); return (el) ? emulateUserInput(el, el.type==='date'?d:data.date) : false; }, createInputVerifier(()=>findFirst(cfg.dateInput)||findFieldByLabel(['ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¶Ù…Ø§Ù†'],'input')));

  log('â”â”â” PAGE 1 DONE â”â”â”', FR);
  return { report: { fieldResults: FR } };
}

// Check if a subgrid already has records (to avoid adding duplicates)
async function hasExistingSubgridRow(sectionRegex) {
  const docs = [document];
  document.querySelectorAll('iframe').forEach(f => {
    try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(e) {}
  });
  for (const doc of docs) {
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
      return td && r.innerText.trim() && !/norecords|Ù„Ø§ ØªÙˆØ¬Ø¯|Ù„Ø§ØªÙˆØ¬Ø¯/i.test(r.innerText.replace(/\s/g,''));
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
  log('ã€ PAGE 2 ã€‘ Preparing Actual Problems and Technicians...');
  await sleep(1000); // Buffer for DOM render

  // Set Spare Parts to "Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±" (confirmed on live portal: id=ats_sparepartsstatus)
  let sparePartsEl = findFieldByLabel(['Ø­Ø§Ù„Ø© Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±', 'Spare Parts'], 'select');
  if (!sparePartsEl) sparePartsEl = document.getElementById('ats_sparepartsstatus'); // Direct ID fallback
  if (sparePartsEl && sparePartsEl.tagName === 'SELECT') {
      const noneOpt = Array.from(sparePartsEl.options).find(o => /Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±/i.test(o.text));
      if (noneOpt) {
         sparePartsEl.value = noneOpt.value;
         try { sparePartsEl.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){}
         FR.spareParts = { ok: true, selected: noneOpt.text };
         log('âœ… Spare Parts set to: ' + noneOpt.text);
      } else {
         warn('âš ï¸ "Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±" option not found in spare parts dropdown');
      }
  } else {
      log('â„¹ï¸ Spare Parts field not found â€” skipping');
  }

  const { autofiller_ProductType } = await chrome.storage.local.get('autofiller_ProductType');
  const deviceName = readDeviceTypeFromPage() || autofiller_ProductType || data.reportType || '';
  const isInstall = /ØªØ±ÙƒÙŠØ¨/.test(data.reportType) || isInstallationReport();
  
  // For Second Visit: use problemCode from profile directly
  const probCode = data.secondVisitMode && data.problemCode ? data.problemCode : getProblemCode(deviceName, isInstall);
  if (probCode) {
    log('â–¶ï¸ Adding Actual Problem: ' + probCode);
    // Exclude: ØªØ±ØµÙŠØ¯ØŒ Ø§Ø±Ø¶ÙŠØŒ Ø¨Ù„Ø§Øº â€” these are not valid actual problems
    const excludeActualProblems = /ØªØ±ØµÙŠØ¯|Ø§Ø±Ø¶ÙŠ|Ø£Ø±Ø¶ÙŠ|Ø¨Ù„Ø§Øº/i;
    // Priority: Premium Care match
    const priorityActualProblem = /Premium\s*care|Ø¨Ø±ÙŠÙ…ÙŠÙ….?ÙƒÙŠØ±|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i;
    let probRes = await handleSubgridIframeModal(
      /Ø§Ø¶Ø§Ù[Ø©Ù‡]\s*Ø§Ù„Ù…Ø´Ø§ÙƒÙ„\s*Ø§Ù„ÙØ¹Ù„ÙŠ[Ø©Ù‡]|Add.*Problem/i,
      probCode,
      false,
      excludeActualProblems,
      priorityActualProblem
    );
    if (probRes && probRes.ok) {
       FR.problem = { ok: true, selected: probRes.name };
       log('âœ… Problem added: ' + probRes.name);
    } else {
       warn('âš ï¸ Problem modal failed or no match. probRes:', JSON.stringify(probRes));
       FR.problem = { ok: false };
    }
  } else { warn('Could not determine Problem Code for device:', deviceName); }

  // Wait for any modal to fully close before opening technician modal
  log('Waiting 2s for problem modal cleanup before technician...');
  await sleep(2000);

  const targetTech = data.technicianName || data.technician || null;
  log('â–¶ï¸ Adding Technician...');
  let techRes = await selectRandomTechnician(targetTech);
  // Retry once if failed
  if (!techRes || !techRes.ok) {
    log('âš ï¸ Technician failed, retrying in 3s...');
    await sleep(3000);
    techRes = await selectRandomTechnician(targetTech);
  }
  FR.technician = { ok: techRes?.ok || false, selected: techRes?.name };
  log(techRes?.ok ? 'âœ… Technician added: ' + techRes.name : 'âŒ Technician failed');

  log('â”â”â” PAGE 2 DONE â”â”â”', FR);
  return { report: { fieldResults: FR } };
}
async function executePage3_Resolution(data, cfg) {
  const FR = {};
  log('ã€ PAGE 3 ã€‘ Preparing Resolution/Fault Codes...');
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'filling', 'Ø¬Ø§Ø±ÙŠ ØªØ¹Ø¨Ø¦Ø© Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø«Ø§Ù„Ø«Ø© (Ø§Ù„Ø£Ø¹Ø·Ø§Ù„)...');
  } catch(e){}
  await sleep(1000);

  const isInstall = /ØªØ±ÙƒÙŠØ¨/.test(data.reportType) || isInstallationReport();

  // Determine the fault code(s) to use
  if (data.forceDrainCleaning) {
    log('ðŸš¿ Force ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ©: adding 3 fault codes (ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© + ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© + Ø´Ø­Ù†)...');

    FR.faultMaintenance = await addFaultCodePage3('AC001', 'AC00000005', ['ØªÙØ±ÙŠØº']);
    log(FR.faultMaintenance?.ok ? 'âœ… ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© (AC001) added' : 'âš ï¸ ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© (AC001) failed');

    await sleep(2000);
    FR.faultDrain = await addFaultCodePage3('AC004', 'AC0300308A', ['ØªÙØ±ÙŠØº']);
    log(FR.faultDrain?.ok ? 'âœ… ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© (AC004) added' : 'âš ï¸ ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ© (AC004) failed');

    if (data.shahnEnabled) {
      await sleep(2000);
      FR.faultShahn = await addFaultCodePage3('AC003', 'AC9000L02B', ['ØªÙØ±ÙŠØº']);
      log(FR.faultShahn?.ok ? 'âœ… Ø´Ø­Ù† added' : 'âš ï¸ Ø´Ø­Ù† failed');
    }

  } else if (isInstall) {
    // Installation: search 'ØªØ±ÙƒÙŠØ¨' and pick the one with 'ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„'
    FR.fault = await addFaultCodePage3('*ØªØ±ÙƒÙŠØ¨');
  } else if (/ØªÙ†Ø¸ÙŠÙ|ØµØ±Ù/.test(data.reportType) || /ØªÙ†Ø¸ÙŠÙ|ØµØ±Ù/.test(data.notes || '')) {
    FR.fault = await addFaultCodePage3('AC004');
  } else if (data.faultCode) {
    FR.fault = await addFaultCodePage3(data.faultCode, data.subFaultCode);
  }

  // Spare Parts Comment Logic
  FR.sparePartsComment = await handleSparePartsComment(data, cfg);

  log('â”â”â” PAGE 3 DONE â”â”â”', FR);
  return { report: { fieldResults: FR } };
}

// Handle spare parts comment logic on PAGE_3 based on spare parts status + warranty status
async function handleSparePartsComment(data, cfg) {
  const SPA_STATUS = { Used: 963400000, Waiting: 963400001, Without: 963400002, Withdrawal: 963400003, Replace: 963400004 };
  const WAR_STATUS = { In: 963400000, Out: 963400001 };

  // 1) Read spare parts status + warranty status from the page
  const allDocs = collectAllDocs(document);
  let spareEl = null, warrantyEl = null;
  for (const doc of allDocs) {
    if (!doc) continue;
    if (!spareEl) spareEl = doc.getElementById('ats_sparepartsstatus') || doc.querySelector('select[data-logical-name="ats_sparepartsstatus"], select[name*="sparepartsstatus"]');
    if (!warrantyEl) warrantyEl = doc.getElementById('ats_warrantystatus') || doc.querySelector('select[data-logical-name="ats_warrantystatus"], select[name*="warrantystatus"]');
    if (spareEl && warrantyEl) break;
  }
  if (!spareEl) { warn('Spare parts status select not found on PAGE 3 — skipping spare parts comment'); return { ok: false, reason: 'no-status-select' }; }

  const spareValue = spareEl.value || '';
  const spareText = (Array.from(spareEl.options || []).find(o => o.value === spareValue) || {}).text || '';
  const warrantyValue = warrantyEl ? (warrantyEl.value || '') : '';
  const warrantyText = warrantyEl ? ((Array.from(warrantyEl.options || []).find(o => o.value === warrantyValue) || {}).text || '') : '';
  log(`🔧 SparePartsStatus=${spareValue}(${spareText}) | Warranty=${warrantyValue}(${warrantyText})`);

  // 2) Wait for the spare parts subgrid to load rows (AJAX), then extract part names + total
  const isLsc = await readIsLscFromPage();
  const subgridId = isLsc ? 'InventoryAdjustmentProductIsLscYes_Subgrid' : 'InventoryAdjustmentProduct_Subgrid';
  const parts = await waitForSparePartsGrid(subgridId, null, 15000);
  const partsTotal = readSparePartsTotalFromField() || parts.reduce((s, p) => s + (p.price || 0), 0);

  // 3) Build comment text per business rules
  let comment = '';
  const isOutOfWarranty = String(warrantyValue) === String(WAR_STATUS.Out) || /خارج/.test(warrantyText);

  if (String(spareValue) === String(SPA_STATUS.Waiting)) {
    // منتظر: قطع مطلوبة → "يحتاج [القطع] بالتكلفة [السعر]"
    if (parts.length === 0) { warn('Waiting spare parts but subgrid empty — skipping comment'); return { ok: false, reason: 'empty-grid-waiting' }; }
    comment = `يحتاج ${parts.map(p => p.name).join(' و ')} بالتكلفة ${formatMoney(partsTotal)}`;
  } else if (String(spareValue) === String(SPA_STATUS.Used)) {
    if (parts.length === 0) { warn('Used spare parts but subgrid empty — skipping comment'); return { ok: false, reason: 'empty-grid-used' }; }
    if (isOutOfWarranty) {
      // مستعمل + خارج الضمان → "تم تغير [القطع] بالتكلفة وتم تحصيل [المبلغ] جنية"
      const collected = await readCollectedAmount() || partsTotal;
      comment = `تم تغير ${parts.map(p => p.name).join(' و ')} بالتكلفة وتم تحصيل ${formatMoney(collected)} جنية`;
    } else {
      // مستعمل + داخل الضمان → "تم تغير [القطع]" بدون أسعار
      comment = `تم تغير ${parts.map(p => p.name).join(' و ')}`;
    }
  } else {
    // بدون / سحب / استبدال / غير محدد → no comment needed
    log(`Spare parts status "${spareText}" (${spareValue}) requires no comment`);
    return { ok: false, reason: 'no-comment-needed' };
  }

  // 4) Write comment into the required comment field
  const commentEl = findCommentField();
  if (!commentEl) { warn('Comment field (ldv_resourcelastcomment) not found'); return { ok: false, reason: 'no-comment-field', comment }; }
  await emulateUserInput(commentEl, comment);
  log('✅ Spare parts comment written: ' + comment);
  return { ok: true, comment, parts, partsTotal, spareStatus: spareText, warrantyStatus: warrantyText };
}

// Wait for the spare parts subgrid to load its rows (AJAX), returning extracted part rows
async function waitForSparePartsGrid(subgridId, extractor, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  let lastResult = [];
  while (Date.now() < deadline) {
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      const grid = doc.getElementById(subgridId) || doc.querySelector(`[id$="${subgridId}"], [id="InventoryAdjustmentProduct_Subgrid"], [id="InventoryAdjustmentProductIsLscYes_Subgrid"]`);
      if (!grid) continue;
      const rows = extractSparePartRows(grid);
      if (rows.length) {
        lastResult = rows;
        if (!extractor) return rows;
        const extracted = extractor(rows);
        if (extracted) return rows;
      }
      lastResult = rows;
    }
    await sleep(700);
  }
  warn(`Spare parts subgrid ${subgridId} didn't load rows within timeout`);
  return lastResult;
}

// Extract part rows from a loaded subgrid DOM
function extractSparePartRows(grid) {
  const rows = [];
  const table = grid.querySelector('table') || grid;
  const trs = Array.from(table.querySelectorAll('tbody tr, tr[data-id], tr[data-rowid]'));
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll('td[data-attribute], td'));
    const nameCell = cells.find(c => /product/i.test(c.getAttribute('data-attribute') || '') && !/total/i.test(c.getAttribute('data-attribute') || ''));
    const qtyCell = cells.find(c => /quantity/i.test(c.getAttribute('data-attribute') || ''));
    const priceCell = cells.find(c => /totalprice/i.test(c.getAttribute('data-attribute') || '') || /price/i.test(c.getAttribute('data-attribute') || ''));
    const name = nameCell ? (nameCell.getAttribute('data-value') || nameCell.textContent || '').trim() : (tr.textContent || '').trim();
    if (!name && !priceCell) continue;
    let price = 0;
    if (priceCell) {
      const raw = priceCell.getAttribute('data-value') || priceCell.textContent || '';
      try { const parsed = JSON.parse(raw); price = parseFloat(parsed.Value) || 0; } catch (_) { price = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0; }
    }
    rows.push({ name, qty: qtyCell ? (qtyCell.getAttribute('data-value') || qtyCell.textContent || '').trim() : '', price });
  }
  return rows;
}

// Read the total spare parts cost from the readonly calculated field
function readSparePartsTotalFromField() {
  for (const doc of collectAllDocs(document)) {
    if (!doc) continue;
    const el = doc.getElementById('ldv_originaltotalusedsparepartscost') || doc.querySelector('input[data-logical-name="ldv_originaltotalusedsparepartscost"], input[name*="originaltotalusedsparepartscost"]');
    if (el) {
      const v = parseFloat(String(el.value || '').replace(/[^\d.-]/g, '')) || 0;
      return v;
    }
  }
  return 0;
}

// Read the collected amount (المبلغ المحصل) if present
async function readCollectedAmount() {
  for (const doc of collectAllDocs(document)) {
    if (!doc) continue;
    const el = doc.getElementById('ldv_actualcollectedamount') || doc.querySelector('input[data-logical-name="ldv_actualcollectedamount"], input[name*="actualcollectedamount"]');
    if (el) return parseFloat(String(el.value || '').replace(/[^\d.-]/g, '')) || 0;
  }
  return 0;
}

// Find the comment / notes field on PAGE_3
function findCommentField() {
  const selectors = [
    '#ldv_resourcelastcomment',
    'input[data-logical-name="ldv_resourcelastcomment"]',
    'input[name*="resourcelastcomment"]',
    'input[id*="resourcelastcomment"]',
    'textarea[aria-label*="comment" i]',
    'textarea[name*="comment" i]',
    'textarea[id*="comment" i]',
    ...getHardcodedDefaults().notes
  ];
  for (const doc of collectAllDocs(document)) {
    if (!doc) continue;
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
  }
  return null;
}

// Format a number as money for the Arabic comment (e.g. 1500, not 1,500)
function formatMoney(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false });
}

// Read isLsc flag from the page to pick the correct subgrid
async function readIsLscFromPage() {
  for (const doc of collectAllDocs(document)) {
    if (!doc) continue;
    const el = doc.getElementById('ldv_islsc') || doc.querySelector('select[data-logical-name="ldv_islsc"], select[name*="islsc"], input[name*="islsc"]');
    if (el) return String(el.value || '') !== '0' && String(el.value || '') !== '963400000';
  }
  return false;
}

// Collect all documents: root + every nested iframe document
function collectAllDocs(root) {
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
// Specialized function for Page 3 fault code modal (two-step lookup)
async function addFaultCodePage3(faultCode, subFaultCode = null, excludeTexts = []) {
  document.body.dataset.isAutofilling = 'true';
  // Step 1: Click "Ø§Ø¶Ø§ÙØ© ÙƒÙˆØ¯ Ø¹Ø·Ù„"
  const addBtn = Array.from(document.querySelectorAll('a, button'))
    .find(el => el.innerText.trim() === 'Ø§Ø¶Ø§ÙØ© ÙƒÙˆØ¯ Ø¹Ø·Ù„' && el.offsetParent !== null);
  if (!addBtn) { warn('Ø§Ø¶Ø§ÙØ© ÙƒÙˆØ¯ Ø¹Ø·Ù„ button not found'); return { ok: false }; }
  
  addBtn.click();
  log('â–¶ï¸ Opening fault code modal for: ' + faultCode + (subFaultCode ? ` + ${subFaultCode}` : ''));
  const cleanCode = faultCode.replace(/\*/g, ''); // Strip wildcard for matching
  
  // Wait for iframe to load
  let iframeDoc = null, targetIframe = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const iframe = Array.from(document.querySelectorAll('iframe')).find(ifr => ifr.offsetParent !== null && ifr.contentDocument && ifr.contentDocument.getElementById('ats_modeldefectmajor_name'));
    if (iframe && iframe.contentDocument) {
      targetIframe = iframe;
      iframeDoc = iframe.contentDocument;
      const lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
      if (lookupBtn && lookupBtn.offsetParent !== null) break;
    }
  }
  if (!iframeDoc) { warn('Fault code iframe not loaded'); return { ok: false }; }
  
  // Step 2: Click first lookup (ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ)
  const lookupBtns = Array.from(iframeDoc.querySelectorAll('button.launchentitylookup')).filter(b => b.offsetParent !== null);
  const mainFaultBtn = lookupBtns.find(b => (b.getAttribute('aria-label') || '').includes('ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ'));
  if (!mainFaultBtn) { warn('ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ lookup button not found'); return { ok: false }; }
  
  log('Waiting for iframe events to bind...');
  await sleep(3000);
  mainFaultBtn.click();
  
  // Search all frames for lookup rows (not just iframeDoc)
  function collectDocs(root) {
    const docs = [root];
    root.querySelectorAll('iframe').forEach(f => {
      try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(e) {}
    });
    return docs;
  }
  const allDocs = [...new Set([...collectDocs(iframeDoc), ...collectDocs(document)])];
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
      let found = Array.from(doc.querySelectorAll('button.btn-primary, input.btn-primary, input[value="Ø§Ø®ØªØ±"], input[value="Select"], button[aria-label="Select"], button[aria-label*="Ø§Ø®ØªØ±"]')).filter(b => b.offsetParent !== null);
      if (!found.length) found = Array.from(doc.querySelectorAll('button')).filter(b => b.offsetParent !== null && /Ø§Ø®ØªØ±|select/i.test(b.innerText.trim()));
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
    if (r.innerText.includes('Ø®Ø²Ù†Ø©') || r.innerText.includes('ØªØ±ØµÙŠØ¯')) return false;
    if (excludeTexts && excludeTexts.length) {
      for (const ex of excludeTexts) { if (r.innerText.includes(ex)) return false; }
    }
    return true;
  });
  if (filteredRows.length > 0) mainRows = filteredRows;
  
  // Find best match
  const isWildcard = faultCode.startsWith('*');
  const bestRow = isWildcard
    ? (mainRows.find(r => r.innerText.includes('ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„')) ||
       mainRows.find(r => r.innerText.includes('ØµÙŠØ§Ù†Ø© Ø¯ÙˆØ±ÙŠØ©')) ||
       mainRows.find(r => new RegExp(cleanCode, 'i').test(r.innerText)) ||
       mainRows[0])
    : (mainRows.find(r => r.innerText.includes(cleanCode + ' ')) ||
       mainRows.find(r => r.innerText.includes(cleanCode)) ||
       mainRows[0]);
  const chk = bestRow.querySelector('input[type="radio"], input[type="checkbox"]');
  if (chk) chk.click(); else bestRow.querySelector('td')?.click() || bestRow.click();
  await sleep(600);
  
  // Click Ø§Ø®ØªØ± â€” search all docs
  let selectBtns = findSelectBtn(allDocs);
  if (selectBtns.length) selectBtns[selectBtns.length - 1].click();
  await sleep(2000);
  
  // Verify main field was set
  for (let v = 0; v < 10; v++) {
    if (iframeDoc.getElementById('ats_modeldefectmajor_name')?.value) break;
    await sleep(500);
  }
  log('âœ… ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ selected: ' + iframeDoc.getElementById('ats_modeldefectmajor_name')?.value);
  
  // Step 3: Click second lookup (ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„) â€” search in iframeDoc + top doc
  const faultBtns = (Array.from(iframeDoc.querySelectorAll('button.launchentitylookup'))
    .concat(Array.from(document.querySelectorAll('button.launchentitylookup'))))
    .filter(b => b.offsetParent !== null);
  const subFaultBtn = faultBtns.find(b => (b.getAttribute('aria-label') || '').includes('ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„'));
  
  if (subFaultBtn) {
    await sleep(1500);
    subFaultBtn.click();
    
    // Wait for sub-fault rows â€” search all docs
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
      log('âœ… ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„ selected: ' + iframeDoc.getElementById('ats_defectcodedefectmajor_name')?.value);
    } else {
      warn('No sub-fault rows appeared');
    }
  }
  
  // Step 4: Click Ø­ÙØ¸
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROUTER & QUEUE MANAGER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function getActivePageFeature() {
  // Page 3: contains "Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø£Ø¹Ø·Ø§Ù„" or "Ø§Ø¶Ø§ÙØ© ÙƒÙˆØ¯ Ø¹Ø·Ù„"
  const hasFaultSection = Array.from(document.querySelectorAll('label, h3')).some(el => 
    el.innerText.includes('Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø£Ø¹Ø·Ø§Ù„')
  );
  const hasFaultBtn = Array.from(document.querySelectorAll('a, button')).some(el => 
    el.innerText.trim() === 'Ø§Ø¶Ø§ÙØ© ÙƒÙˆØ¯ Ø¹Ø·Ù„' && el.offsetParent !== null
  );
  if (hasFaultSection || hasFaultBtn) return 'PAGE_3';

  // Page 2: use regex to handle text variants (ÙÙ†Ù‰/ÙÙ†ÙŠ, Ø©Ù‡ endings, all alef forms)
  const hasTechBtn = Array.from(document.querySelectorAll('a, button')).some(el => 
    /[Ø§Ø¥Ø£]Ø¶Ø§Ù[Ø©Ù‡]\s*ÙÙ†/i.test(el.innerText.trim()) && el.offsetParent !== null
  );
  const hasProbBtn = Array.from(document.querySelectorAll('a, button')).some(el => 
    /[Ø§Ø¥Ø£]Ø¶Ø§Ù[Ø©Ù‡]\s*Ø§Ù„Ù…Ø´Ø§ÙƒÙ„\s*Ø§Ù„ÙØ¹Ù„ÙŠ[Ø©Ù‡]/i.test(el.innerText.trim()) && el.offsetParent !== null
  );
  if (hasTechBtn || hasProbBtn) return 'PAGE_2';

  return 'PAGE_1';
}

async function clickNextAndWaitForSave(cfg) {
  const btn = findFirst(cfg.nextBtn) || Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], input[type="button"], button')).find(b => /next|Ø§Ù„ØªØ§Ù„ÙŠ|save|Ø­ÙØ¸|submit/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()));
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
  const fr = report.fieldResults || {}; const summary = Object.keys(fr).map(k => fr[k] ? `${fr[k].ok ? 'âœ…':'âŒ'}${k}` : null).filter(Boolean).join(' | ');
  div.innerHTML = `<div style="font-weight:700;color:#1f8feb;margin-bottom:6px">âš¡ Portal AutoFiller v3.0</div><div>âœ… Ø§ÙƒØªÙ…Ù„ â€” <b>${report.customer || 'Ø§Ù„Ø¹Ù…ÙŠÙ„'}</b></div><div style="color:#2bd46f;font-size:11px;margin-top:4px">${summary}</div>`;
  document.body.appendChild(div); setTimeout(() => div.remove(), 7000);
}

function showMasahaOverlay() {
  document.getElementById('autofiller-overlay')?.remove();
  const div = document.createElement('div'); div.id = 'autofiller-overlay';
  Object.assign(div.style, { position:'fixed', bottom:'16px', left:'16px', background:'linear-gradient(135deg,#1a237e,#0d47a1)', border:'2px solid #ff9800', borderRadius:'12px', padding:'16px 20px', color:'#e2eaf5', fontFamily:"'Cairo', Tahoma, Arial, sans-serif", fontSize:'14px', zIndex:'2147483647', boxShadow:'0 8px 32px rgba(0,0,0,0.6)', maxWidth:'380px', direction:'rtl' });
  div.innerHTML = `
    <div style="font-weight:700;color:#ff9800;margin-bottom:8px;font-size:16px;">ðŸ“¸ Ù…Ø³Ø§Ø­Ø© â€” Ø£Ø±ÙÙ‚ Ø§Ù„ØµÙˆØ±Ø©</div>
    <div style="margin-bottom:8px;">ØªÙ… ØªØ¹Ø¨Ø¦Ø© Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ù†Ø¬Ø§Ø­.</div>
    <div style="margin-bottom:8px;color:#ffcc80;">Ø§Ù„Ø¢Ù† Ø£Ø±ÙÙ‚ ØµÙˆØ±Ø© Ø§Ù„Ù…Ø³Ø§Ø­Ø© ÙŠØ¯ÙˆÙŠØ§Ù‹ Ø«Ù… Ø§Ø¶ØºØ· <b>Ø­ÙØ¸</b>.</div>
    <button id="masaha-close-overlay" style="background:#ff9800;color:#000;border:none;padding:6px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">ÙÙ‡Ù…Øª</button>
  `;
  document.body.appendChild(div);
  div.querySelector('#masaha-close-overlay')?.addEventListener('click', () => div.remove());
  setTimeout(() => div.remove(), 30000);
}

function notifyStatus(taskId, status, message) {
  const u = { taskId, status, message, timestamp: Date.now() };
  storageSet({ lastStatusUpdate: u });
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...u }).catch(()=>{});
}
async function clearCurrentTask() { await storageRemove(['currentTask']); }
async function startNextTask(queue) {
  if (!queue || queue.length === 0) {
    notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch');
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
    log('âš ï¸ Router already running â€” skipping duplicate call');
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
  if (task.data && task.data.secondVisitMode) {
    data.secondVisitMode = true;
  }
  if (task.data && task.data.masahaMode) {
    data.masahaMode = true;
  }

  log('ðŸ“„ Router started. forceDrainCleaning=' + !!data.forceDrainCleaning + ' shahnEnabled=' + !!data.shahnEnabled + ' forceOverwrite=' + !!data.forceOverwrite + ' reportType=' + (data.reportType || 'N/A') + ' problemCode=' + (data.problemCode || 'N/A') + ' faultCode=' + (data.faultCode || 'N/A'));
  let resFR = {}, saveResult = { ok: false };

  if (isInstallationReport()) {
    log('ã€ INSTALLATION DETECTED ã€‘ By-passing Review/Problems and executing explicit setup.');
    const res = await performInstallationAndCommissioning(data);
    return { report: res.report, isFullyDone: true };
  }

  let feature = await getActivePageFeature();
  
  if (feature === 'PAGE_1') {
    // â”€â”€ Skip if page is already filled (order already processed) â”€â”€
    await sleep(800); // Wait briefly so fields render before checking
    if (!data.forceOverwrite && isPage1AlreadyFilled(cfg)) {
        warn('â­ï¸ Page 1 already has data â€” marking task as done and skipping to next order.');
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'done', 'â­ï¸ Ù…ÙƒØªÙ…Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ â€” ØªØ®Ø·ÙŠ');
        } catch(e){}
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: { skipped: { ok: true } }, saveResult: { ok: true, skipped: true }, skippedReason: 'already-filled' };
        return { report, isFullyDone: true };
    }
    const res1 = await executePage1_Review(data, cfg);
    Object.assign(resFR, res1.report.fieldResults);
    
    // Attempt to navigate to Page 2
    const nBtn = document.getElementById('NextButton') || findFirst(cfg.nextBtn) || Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(b => /next|Ø§Ù„ØªØ§Ù„ÙŠ/i.test((b.innerText||b.value||b.title||'').trim()) && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className));
    if (nBtn) { 
      try {
        const { currentTask } = await storageGet({ currentTask: null });
        if (currentTask) notifyStatus(currentTask.taskId, 'navigating', 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ù„ØµÙØ­Ø© Ø§Ù„Ø«Ø§Ù†ÙŠØ©...');
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
    
    // Check if we need to proceed to Page 3
    const isInstall = /ØªØ±ÙƒÙŠØ¨/.test(data.reportType) || isInstallationReport();
    let needsPage3 = data.forceDrainCleaning || data.faultCode || (/ØªÙ†Ø¸ÙŠÙ|ØµØ±Ù/.test(data.reportType) || /ØªÙ†Ø¸ÙŠÙ|ØµØ±Ù/.test(data.notes || '')) || isInstall;
    log(`ðŸ“‹ needsPage3=${needsPage3} | forceDrain=${!!data.forceDrainCleaning} | faultCode=${data.faultCode||'N/A'} | isInstall=${isInstall}`);
    
    if (!needsPage3) {
        log('PAGE 3 is not needed. Clicking Save/Next to finalize order on Page 2.');
        const nBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /next|Ø§Ù„ØªØ§Ù„ÙŠ|save|Ø­ÙØ¸|submit/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className) && b.offsetParent !== null);
        let isSaved = false;
        if (nBtn) {
            const startUrl = location.href;
            try { nBtn.focus(); } catch(e) {}
            nBtn.click();
            isSaved = await waitForSaveComplete(startUrl, cfg);
        }
        // removed finalizeSmartLog()
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult: { ok: true }, serviceFilled: !!resFR['ØªØ±ÙƒÙŠØ¨'], technician: resFR['technician']?.selected };
        return { report, isFullyDone: true };
    }
    
    const nBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /next|Ø§Ù„ØªØ§Ù„ÙŠ|save|Ø­ÙØ¸|submit/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className) && b.offsetParent !== null);
    
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
    
    if (data.notes === 'Ù…Ø³Ø§Ø­Ø©') {
      // Masaha: DON'T auto-save â€” user must attach image manually
      log('PAGE 3 filled (Ù…Ø³Ø§Ø­Ø©). Waiting for user to attach image and save manually.');
      showMasahaOverlay();
      saveResult = { ok: true, masahaPending: true };
    } else {
    // Auto-save on Page 3
    log('PAGE 3 filled. Clicking Save/Submit.');
    const saveBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /save|Ø­ÙØ¸|submit|Ø¥Ø±Ø³Ø§Ù„/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className) && b.offsetParent !== null);
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
  const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult, serviceFilled: !!resFR['ØªØ±ÙƒÙŠØ¨'], technician: resFR['technician']?.selected };
  try { await chrome.runtime.sendMessage({ type: 'SAVE_REPORT', payload: report }); } catch (_) {}
  showOverlay(report); 
  return { report, isFullyDone: isDone };
}

// â”€â”€ JSON-Driven Workflow Engine (V4 Architecture) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Legacy wrapper using Engine for Page 1 â”€â”€
async function findOrderAndOpen(orderId, cfg) {
  try {
    const { currentTask } = await storageGet({ currentTask: null });
    if (currentTask) notifyStatus(currentTask.taskId, 'searching', `Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø±Ù‚Ù… Ø§Ù„Ø£Ù…Ø±...`);
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
  const { currentTask, processingTabId } = await storageGet({ currentTask: null, processingTabId: null });
  if (!currentTask) return;

  if (processingTabId) {
    const myTabIdResp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r));
    if (myTabIdResp && myTabIdResp.tabId && myTabIdResp.tabId !== processingTabId) {
        log(`â›” Tab Lock: This tab (${myTabIdResp.tabId}) is not the active processing tab (${processingTabId}). Ignoring.`);
        return;
    }
  }

  const p = getPageType(); const cfg = await loadSelectors();
  document.body.dataset.isAutofilling = 'true';
  sendSmartLog('TASK_START', { orderId: currentTask.orderId, mode: currentTask.mode || 'search' });
  if (p === 'ORDERS') {
     notifyStatus(currentTask.taskId, 'searching', `Ø§Ù„Ø¨Ø­Ø« Ø¹Ù†: ${currentTask.orderId}`);
     if (!await findOrderAndOpen(currentTask.orderId, cfg)) {
         sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'not-found', mode: currentTask.mode || 'search' });
         delete document.body.dataset.isAutofilling;
         notifyStatus(currentTask.taskId, 'not-found', `Ù„Ù… ÙŠÙØ¹Ø«Ø± : ${currentTask.orderId}`);
         await finalizeOrderInSession(currentTask, { error: 'not-found' }, 'not-found');
         await clearCurrentTask(); const { taskQueue, taskDelay: td1 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 }); await sleep(td1); 
         if (taskQueue.length > 0) { await startNextTask(taskQueue); } else { notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch'); await finalizeSession(); chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); }
         return;
     }
     notifyStatus(currentTask.taskId, 'navigating', 'Ø¬Ø§Ø±Ù Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„...');
  } else if (p === 'WORK_ORDER_REVIEW') {
     notifyStatus(currentTask.taskId, 'filling', `Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªÙØ±ÙŠØº Ù„Ù€: ${currentTask.orderId}`);
     try {
       const { taskRetryFlag } = await storageGet({ taskRetryFlag: false });
       const routerRes = await runSingleLineWithRouter(currentTask);
        if (routerRes && routerRes.isFullyDone) {
           const ok = routerRes.report?.saveResult?.ok;
           sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: ok, mode: currentTask.mode || 'search' });
           delete document.body.dataset.isAutofilling;
           notifyStatus(currentTask.taskId, ok ? 'done' : 'save-failed', ok ? 'âœ… Ø§ÙƒØªÙ…Ù„' : 'âš ï¸ Ù„Ù… ÙŠØªØ£ÙƒØ¯');
          await finalizeOrderInSession(currentTask, routerRes.report, ok ? 'done' : 'save-failed');
          
          await storageRemove(['taskRetryFlag']);
          await clearCurrentTask();
          const { taskQueue, taskDelay: td2 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
          if (taskQueue.length > 0) { await sleep(td2); await startNextTask(taskQueue); }
          else { 
             notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch'); 
             await finalizeSession(); // END SESSION
             chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
          }
       } else if (routerRes && routerRes.isManualStop) {
          log('Manual stop requested. Pausing here.');
          notifyStatus(currentTask.taskId, 'stopped', 'â¸ï¸ Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø¥ÙƒÙ…Ø§Ù„ Ø§Ù„ÙŠØ¯ÙˆÙŠ');
          await finalizeOrderInSession(currentTask, routerRes.report, 'stopped');
          await storageRemove(['taskRetryFlag']);
          await clearCurrentTask();
          // We intentionally do not call startNextTask() to stop the queue.
       } else {
          if (!taskRetryFlag) {
            log('âš ï¸ Page 1 incomplete. Retrying once...');
            notifyStatus(currentTask.taskId, 'filling', 'ðŸ”„ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©...');
            await storageSet({ taskRetryFlag: true });
            location.reload();
          } else {
            warn('âŒ Retry failed. Skipping to next task.');
            sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'retry-failed', mode: currentTask.mode || 'search' });
            delete document.body.dataset.isAutofilling;
            notifyStatus(currentTask.taskId, 'error', 'âŒ ÙØ´Ù„ â€” ØªØ®Ø·ÙŠ Ù„Ù„ØªØ§Ù„ÙŠ');
            await finalizeOrderInSession(currentTask, routerRes.report, 'error');
            await storageRemove(['taskRetryFlag']);
            await clearCurrentTask();
            const { taskQueue: q2, taskDelay: td3 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
            if (q2.length > 0) { await sleep(td3); await startNextTask(q2); }
            else { 
               notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch'); 
               await finalizeSession(); // END SESSION
               chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
            }
          }
       }
     } catch (e) {
       err('ðŸ’¥ Unexpected error in router: ' + e);
        if (currentTask) sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'error', mode: currentTask.mode || 'search' });
        delete document.body.dataset.isAutofilling;
        notifyStatus(currentTask?.taskId, 'error', 'âŒ Ø®Ø·Ø£ ØºÙŠØ± Ù…ØªÙˆÙ‚Ø¹ â€” ØªØ®Ø·ÙŠ Ù„Ù„ØªØ§Ù„ÙŠ');
       if (currentTask) await finalizeOrderInSession(currentTask, { error: e.toString() }, 'error');
       await clearCurrentTask();
       const { taskQueue: qErr, taskDelay: td5 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
       if (qErr.length > 0) { await sleep(td5); await startNextTask(qErr); }
       else { 
          notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch'); 
          await finalizeSession(); // END SESSION
          chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
       }
     }
  } else { location.href = ORDERS_URL; }
}

// â”€â”€ SESSION ENGINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    log('ðŸŸ¢ Session opened:', session.id);
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
    log('ðŸ“¥ Order finalized in session:', task.orderId, status);
  } catch (e) { warn('finalizeOrderInSession error', e); }
}

async function finalizeSession() {
  try {
    const { activeSession, sessionLogs = [] } = await storageGet(['activeSession', 'sessionLogs']);
    if (!activeSession) return;
    
    activeSession.endTime = new Date().toISOString();
    sessionLogs.push(activeSession);
    
    await storageSet({ sessionLogs, activeSession: null });
    log('ðŸ”´ Session finalized and saved:', activeSession.id);
    chrome.runtime.sendMessage({ type: 'NEW_LOG' }).catch(()=>{});
  } catch (e) { warn('finalizeSession error', e); }
}

// â”€â”€ Helper functions for QUICK_PASTE_BATCH â”€â”€
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.action) return;
  (async () => {
    try {
      if (msg.action === 'RUN_SINGLE') sendResponse(await runSingleLineWithRouter(msg));
      else if (msg.action === 'START_QUEUE') {
        const tasks = msg.tasks || [];
        const batchId = 'batch-' + Date.now();
        await openSession(batchId, tasks);
        
        await storageSet({ 
            taskQueue: tasks.slice(1), 
            taskResults: [],
            processingTabId: msg.tabId,
            taskDelay: msg.delay || 800 
        });
        await storageRemove(['taskRetryFlag']);
        await clearCurrentTask();
        // Respond BEFORE startNextTask â€” it may navigate away, killing this context
        sendResponse({ ok: true });
        await startNextTask(tasks);
      }
      else if (msg.action === 'STOP_QUEUE') {
        await storageSet({ taskQueue: [] });
        await storageRemove(['taskRetryFlag']);
        await clearCurrentTask();
        notifyStatus('batch', 'stopped', 'ØªÙ… Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„ÙƒÙ„');
        await finalizeSession(); // END SESSION
        sendResponse({ ok: true });
      }
      else if (msg.action === 'SKIP_TASK') {
        const { taskQueue, currentTask } = await storageGet({ taskQueue: [], currentTask: null });
        await storageRemove(['taskRetryFlag']);
        const skippedId = msg.taskId;
        notifyStatus(skippedId, 'stopped', 'â­ ØªÙ… Ø§Ù„ØªØ®Ø·ÙŠ');
        if (currentTask) await finalizeOrderInSession(currentTask, { skippedReason: 'user-skipped' }, 'skipped');
        await clearCurrentTask();
        if (taskQueue.length > 0) { const { taskDelay: td4 = 800 } = await storageGet({ taskDelay: 800 }); await sleep(td4); await startNextTask(taskQueue); }
        else { 
            notifyStatus('batch', 'batch-done', 'Ø§ÙƒØªÙ…Ù„ Batch'); 
            await finalizeSession(); // END SESSION
            chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{}); 
        }
        sendResponse({ ok: true });
      }
      else if (msg.action === 'EXTRACT_DEVICE_DATA') {
        startDeviceDataExtraction();
        sendResponse({ ok: true });
      }
      else if (msg.action === 'QUICK_PASTE_BATCH') {
        sendResponse({ ok: true });
        setTimeout(async () => {
          let text = '';
          try { text = await navigator.clipboard.readText(); } catch(e) { text = ''; }
          if (!text) { showPageToast('âš ï¸ Ø§Ù„Ø­Ø§ÙØ¸Ø© ÙØ§Ø±ØºØ©', 'error'); return; }
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (!lines.length) { showPageToast('âš ï¸ Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª ÙÙŠ Ø§Ù„Ø­Ø§ÙØ¸Ø©', 'error'); return; }
          const tasks = buildTasksFromLines(lines);
          if (!tasks.length) { showPageToast('âš ï¸ Ù„Ù… ÙŠØªÙ… Ø§Ù„ØªØ¹Ø±Ù Ø¹Ù„Ù‰ Order IDs', 'error'); return; }
          showPageToast(`âœ… Ø¨Ø¯Ø¡ Ø§Ù„ØªØ´ØºÙŠÙ„ â€” ${tasks.length} Ù…Ù‡Ù…Ø©`, 'success');
          const batchId = 'batch-' + Date.now();
          await openSession(batchId, tasks);
          await storageSet({ taskQueue: tasks.slice(1), taskResults: [], taskDelay: 2000 });
          await startNextTask(tasks);
        }, 100);
        return;
      }
      else if (msg.action === 'OPEN_TECH_REVIEW') {
        const currentUrl = window.location.href;
        if (currentUrl.includes('Reportdetail')) {
          window.location.href = currentUrl.replace('Reportdetail', 'technicalreviewdetails');
        } else if (currentUrl.includes('workorderreview')) {
          window.location.href = currentUrl.replace('workorderreview', 'technicalreviewdetails');
        } else if (currentUrl.includes('technicalreviewdetails')) {
          showPageToast('âœ… Ø£Ù†Øª Ø¨Ø§Ù„ÙØ¹Ù„ ÙÙŠ ØµÙØ­Ø© Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„ÙÙ†ÙŠØ©', 'success');
        } else {
          showPageToast('âš ï¸ Ø§ÙØªØ­ Ø¨Ù„Ø§Øº Ø£ÙˆÙ„Ø§Ù‹', 'warn');
        }
        sendResponse({ ok: true });
      }
      else sendResponse({ ok: true });
    } catch { sendResponse({ ok: false }); }
  })(); return true;
});
processQueueOnLoad().catch(()=>{});

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
    alert('Ø§Ù„Ø±Ø¬Ø§Ø¡ ÙØªØ­ ØµÙØ­Ø© workorderreview Ø£Ùˆ Reportdetail Ø£Ùˆ technicalreviewdetails Ù„Ù„Ù‚ÙŠØ§Ù… Ø¨Ø³Ø­Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.');
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
  const brandEl = qSel('input[aria-label="Ø¹Ù„Ø§Ù…Ø© ØªØ¬Ø§Ø±ÙŠØ©"]') || qSel('#ats_producttypebrand_name');
  const modelEl = qSel('input[aria-label="Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„Ù‰ 1"]') || qSel('#ldv_actualmodel_name');
  const model2El = qSel('input[aria-label="Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„ÙØ¹Ù„Ù‰ 2"]') || qSel('#ldv_actualmodel2_name');
  const serial1El = qSel('#ldv_technicalserialnumber') || qSel('[aria-label*="Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„"]');
  const serial2El = qSel('#ldv_secondtechnicalserial');

  const brand = brandEl?.value || brandEl?.innerText || '';
  const model1 = modelEl?.value || modelEl?.innerText || '';
  const model2 = model2El?.value || model2El?.innerText || '';
  const serial1 = serial1El?.value || serial1El?.innerText || '';
  const serial2 = serial2El?.value || serial2El?.innerText || '';

  if ((!brand || !model1 || !serial1) && attempt <= 20) {
    setTimeout(() => performExtractionAndLog(attempt + 1), 500);
    return;
  }

  const extractCode = (s) => (s || '').split(/\s*[_â€“â€”]\s*/)[0].split('(')[0].trim();
  const model1Code = extractCode(model1) || model1 || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯';
  const model2Code = extractCode(model2) || model2 || '';
  const finalSerial2 = serial2.trim();
  const brandText = brand || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯';

  const d = new Date();
  const today = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  const lines = [];
  lines.push(`OrderId: Unknown | Brand: ${brandText} | Model: ${model1Code} | Serial: ${serial1 || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'} | Status: Out of Warranty | Date: ${today}`);
  if (model2Code && finalSerial2) {
    lines.push(`OrderId: Unknown | Brand: ${brandText} | Model: ${model2Code} | Serial: ${finalSerial2} | Status: Out of Warranty | Date: ${today}`);
  }

  const copyText = lines.join('\n');

  const sessionLog = {
    sessionId: `ext_${Date.now()}`,
    orderId: `Ù…Ø³Ø­ÙˆØ¨ (${(window.location.search.match(/id=([^&]+)/)?.[1] || 'unknown').substring(0,8)}...)`,
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
      <span style="font-size:15px;font-family:Arial,sans-serif;">âœ… ØªÙ… Ø³Ø­Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¬Ù‡Ø§Ø² Ø¨Ù†Ø¬Ø§Ø­!</span>
      <button id="ext-copy-btn" style="background:#fff;color:#4caf50;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">ðŸ“‹ Ù†Ø³Ø®</button>
    </div>
    <div style="background:rgba(0,0,0,0.15);padding:10px 12px;border-radius:6px;white-space:pre-wrap;line-height:1.8;">${copyText}</div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ext-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(copyText).then(() => {
      const btn = overlay.querySelector('#ext-copy-btn');
      btn.textContent = 'âœ… ØªÙ… Ø§Ù„Ù†Ø³Ø®!';
      btn.style.color = '#4caf50';
      setTimeout(() => { btn.textContent = 'ðŸ“‹ Ù†Ø³Ø®'; btn.style.color = '#4caf50'; }, 1500);
    });
  });

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
