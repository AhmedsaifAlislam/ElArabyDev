// core/booking/auto-filler.js â€” Portal Form Auto-Fill (Strong Merge + Phase 1 Router + Phase 2 Resilience)
// =========================================================
// Merged from:
//   1. Smart_Autofill.user.js       (findInputForField + autoFillForm keyword detection)
//   2. injector.js                  (fireEvents + cascade injection by field IDs)
//   3. AutoFiller v3.0 strong engine (collectAllDocs + safeClick + native setter +
//                                     strong fillLookupModal + verification engine)
//   4. Phase 1: Router & Page-Type Intelligence (getPageType / isInstallationReport /
//      performInstallationAndCommissioning / executePage1_Review / executePage2_FollowUp)
//   5. Phase 2: Dynamic Resilience (waitForSaveComplete / createLookupVerifier /
//      detectManualAdditions / scrapeFullOrderDetails / Clear-Button verification)
// =========================================================
// Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©: Ù„Ø§ Ù†Ù…Ø³Ø­ Ø£ÙŠ Ù‚ÙŠÙ…Ø© Ø­Ù‚ÙŠÙ‚ÙŠØ© Ù…ÙˆØ¬ÙˆØ¯Ø©ØŒ Ù„Ø§ Ù†Ø­Ø°Ù Ø£ÙŠ Ø´ÙŠØ¡ Ø®Ø§Ø±Ø¬ ØªØ¹Ø¨Ø¦Ø© Ù†Ø§Ø¬Ø­Ø©ØŒ
// ÙˆÙƒÙ„ Ø¨Ø­Ø« ÙŠÙ…Ø± Ø¹Ø¨Ø± collectAllDocs (main doc + iframes Ù…ØªØ¯Ø§Ø®Ù„Ø©).

(function() {
  'use strict';

  const LOG_PREFIX = '[Booking AutoFiller]';

  // â”€â”€ Field Definitions (keyword-based detection) â€” Smart_Autofill â”€â”€
  const FIELD_DEFINITIONS = {
    productType: ['Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬', 'product type', 'producttype', 'Ù†ÙˆØ¹Ø§Ù„Ù…Ù†ØªØ¬'],
    brand: ['Ø¹Ù„Ø§Ù…Ø© ØªØ¬Ø§Ø±ÙŠØ©', 'Ø¹Ù„Ø§Ù…Ù‡ ØªØ¬Ø§Ø±ÙŠÙ‡', 'brand', 'Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©', 'Ø§Ù„Ø¹Ù„Ø§Ù…Ù‡ Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡'],
    model: ['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„', 'Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ *', 'model', 'Ù…ÙˆØ¯ÙŠÙ„'],
    defect: ['Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø£Ø¹Ø·Ø§Ù„', 'Ø§ÙƒÙˆØ§Ø¯ Ø§Ù„Ø§Ø¹Ø·Ø§Ù„', 'ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„', 'defect', 'Ø§Ù„Ø¹Ø·Ù„'],
    sparePart: ['Ù‚Ø·Ø¹ ØºÙŠØ§Ø±', 'Ù‚Ø·Ø¹Ù‡ ØºÙŠØ§Ø±', 'Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±', 'ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø·Ø¹Ø©', 'ÙƒÙˆØ¯ Ù‚Ø·Ø¹Ù‡ Ø§Ù„ØºÙŠØ§Ø±', 'spare part', 'sparepart'],
    quantity: ['Ø§Ù„ÙƒÙ…ÙŠØ©', 'Ø§Ù„ÙƒÙ…ÙŠÙ‡', 'quantity', 'Ø§Ù„Ø¹Ø¯Ø¯']
  };

  // â”€â”€ Portal-specific field IDs (injector.js) â”€â”€
  const PORTAL_FIELD_IDS = {
    defectMajor: 'ats_modeldefectmajor',
    defectCode: 'ats_defectcodedefectmajor',
    sparePart: 'ats_modeldefectspid'
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PHASE 2 â€” CONFIGURATION OBJECT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const CFG = {
    // Ù…Ø¤Ø´Ø±Ø§Øª Ù†Ø¬Ø§Ø­ Ø§Ù„Ø­ÙØ¸ (ØªØ¸Ù‡Ø± Ø¨Ø¹Ø¯ Ù…Ø¹Ø§Ù„Ø¬Ø© PowerApps)
    successIndicator: [
      '.notification.toast-success',
      '.ms-MessageBar--success',
      '[data-testid="save-success"]',
      '.alert-success',
      '.toast-success'
    ],
    // Ù…Ù‡Ù„Ø© Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙƒÙ„ÙŠØ©
    saveTimeoutMs: 15000,
    // Ù…Ù‡Ù„Ø© Ø¨ÙŠÙ† Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø§Øª
    retryIntervalMs: 1000
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // STRONG FOUNDATION â€” Ù…Ù† Ù…Ø­Ø±Ùƒ AutoFiller v3.0 Ø§Ù„Ù‚Ø¯ÙŠÙ…
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Ø¬Ù…Ø¹ ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª (main + iframes Ù…ØªØ¯Ø§Ø®Ù„Ø©) â”€â”€
  function collectAllDocs(root) {
    if (globalThis.FrameWalker && typeof globalThis.FrameWalker.getDocs === 'function') {
      try { return globalThis.FrameWalker.getDocs(root); } catch (_) {}
    }
    const docs = [];
    const seen = new Set();
    const visit = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      docs.push(node);
      node.querySelectorAll('iframe').forEach(f => {
        try { const d = f.contentDocument || f.contentWindow?.document; if (d) visit(d); } catch (_) {}
      });
    };
    visit(root || document);
    return docs;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // â”€â”€ Safe Click Ù…Ø¹ Ø¹Ù„Ù… isAutofilling (ÙŠÙ…Ù†Ø¹ ØªÙØ¹ÙŠÙ„ Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø¥Ø¶Ø§ÙØ©) â”€â”€
  function safeClick(element, description = 'element') {
    if (!element) { console.warn(LOG_PREFIX, 'safeClick: ' + description + ' is null.'); return false; }
    try {
      document.body.dataset.isAutofilling = 'true';
      element.focus?.();
      element.click();
      element.dispatchEvent(new Event('click', { bubbles: true }));
      setTimeout(() => { delete document.body.dataset.isAutofilling; }, 50);
      return true;
    } catch (e) {
      delete document.body.dataset.isAutofilling;
      console.error(LOG_PREFIX, 'safeClick failed for ' + description + ': ' + e.message);
      return false;
    }
  }

  // â”€â”€ Native Setter (ÙŠØªØ¬Ø§ÙˆØ² Ø·Ø¨Ù‚Ø© React/Angular ÙÙŠ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„) â”€â”€
  function nativeSetValue(el, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) { try { descriptor.set.call(el, value); } catch (_) {} }
    else { el.value = value; }
  }

  // â”€â”€ Ù…Ø­Ø§ÙƒØ§Ø© Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… (native setter + input/change + flag) â”€â”€
  async function emulateUserInput(el, value) {
    try { el.focus(); } catch (_) {}
    document.body.dataset.isAutofilling = 'true';
    nativeSetValue(el, value);
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    await sleep(150);
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    setTimeout(() => { delete document.body.dataset.isAutofilling; }, 50);
  }

  // â”€â”€ Event Trigger helper (React/Angular compatible) â€” Ù…Ù† injector.js â”€â”€
  function fireEvents(el) {
    if (!el) return;
    ['focus', 'mousedown', 'mouseup', 'click', 'input', 'change', 'blur'].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
    nativeSetValue(el, el.value);
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  }

  // â”€â”€ findFirst Ø¹Ø¨Ø± ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª (Ù…Ø«Ù„ Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù‚Ø¯ÙŠÙ…) â”€â”€
  function findFirst(list) {
    if (!list) return null;
    if (!Array.isArray(list)) list = [list];
    for (const s of list) {
      if (s instanceof HTMLElement) return s;
      for (const doc of collectAllDocs(document)) {
        try { const el = doc.querySelector(s); if (el) return el; } catch (_) {}
      }
    }
    return null;
  }

  // â”€â”€ Ø²Ø± Ø§Ù„Ù€ lookup Ø§Ù„Ø¢Ù…Ù† (ÙŠØªØ¬Ø§Ù‡Ù„ Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ø³Ø­/Ø§Ù„Ø­Ø°Ù) â”€â”€
  function findSafeLookupButton(inputEl, fallbackCfgSelectors) {
    const container = inputEl?.closest('.input-group') || inputEl?.parentElement;
    if (!container) return findFirst(fallbackCfgSelectors || ['button.launchentitylookup']);
    const btn = Array.from(container.querySelectorAll('button, a.btn')).find(b =>
      !/clear|Ù…Ø³Ø­|remove|delete/i.test(b.className + (b.getAttribute('aria-label') || '') + (b.title || ''))
    );
    return btn || findFirst(fallbackCfgSelectors || ['button.launchentitylookup']);
  }

  // â”€â”€ Ù…Ø­Ø±Ùƒ Ø§Ù„Ù€ lookup modal Ø§Ù„Ù‚ÙˆÙŠ (Ù†ÙØ³ Ù…Ù†Ø·Ù‚ AutoFiller v3.0) â”€â”€
  // Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ©: Ù…Ø·Ø§Ø¨Ù‚Ø© ÙƒÙˆØ¯ Ø¯Ù‚ÙŠÙ‚Ø© â†’ starts-with Ù…Ø¹ boundary â†’ includes ÙÙŠ Ø¬Ø²Ø¡ Ø§Ù„ÙƒÙˆØ¯ ÙÙ‚Ø·
  async function fillLookupModal(btn, searchValue, rootDoc) {
    if (!btn || !searchValue) return { ok: false };
    if (!rootDoc) rootDoc = document;

    const allDocs = () => collectAllDocs(rootDoc);

    // ÙØªØ­ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„
    console.log(LOG_PREFIX, 'Opening Modal for:', searchValue);
    safeClick(btn, 'Lookup button'); await sleep(1800);

    // â”€â”€ Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø£ÙˆÙ„Ø§Ù‹ â”€â”€
    const itemsSelectors = ['.modal table tbody tr', '[role="dialog"] li', '[role="listbox"] [role="option"]', '.lookup-modal .result-item', '.modal .result-item', '.entitylist-items li'];
    const getVisibleItems = () => {
      let all = [];
      for (const doc of allDocs()) {
        if (!doc) continue;
        for (const sel of itemsSelectors) {
          try { all.push(...Array.from(doc.querySelectorAll(sel)).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0 && !/norecords|Ù„Ø§ØªÙˆØ¬Ø¯/i.test(i.innerText.replace(/\s/g, '')))); } catch (_) {}
        }
      }
      return all;
    };

    let visibleItems = [];
    for (let w = 0; w < 6; w++) {
      visibleItems = getVisibleItems();
      if (visibleItems.length > 0) break;
      await sleep(400);
    }

    const normalize = s => (s || '').replace(/[\s\-\(\)\[\]_#\*]/g, '').toLowerCase();
    const rawTarget = (searchValue || '').replace(/[\s\(\)\[\]_#\*]/g, '').toLowerCase();
    const modelCodeOnly = (searchValue || '').split(/\s*[_â€“â€”]\s*/)[0].split('(')[0].trim();
    const targetCode = normalize(modelCodeOnly);
    const rawTargetCode = modelCodeOnly.replace(/[\s\(\)\[\]_#\*]/g, '').toLowerCase();

    const verifyLookupWithClearButton = async () => {
      // PHASE 2.3: Ø§Ù†ØªØ¸Ø± Ø¸Ù‡ÙˆØ± Clear Button ÙƒØªØ­Ù‚Ù‚ Ù†Ù‡Ø§Ø¦ÙŠ Ù…Ù† Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù‚ÙŠÙ…Ø©
      await sleep(500);
      const lookupNameInput = findFirst([
        'input[id$="_name"]',
        'input[id="ats_modeldefectmajor_name"], input[id="ats_defectcodedefectmajor_name"], input[id="ats_modeldefectspid_name"]'
      ]);
      if (lookupNameInput) {
        const clearBtn = lookupNameInput.parentElement?.querySelector(
          'button[aria-label*="Clear"], button[aria-label*="Ù…Ø³Ø­"], .clear-button, [data-action="clear"]'
        );
        if (clearBtn) {
          console.log(LOG_PREFIX, 'âœ… Lookup verified: Clear Button detected');
          return true;
        }
        console.warn(LOG_PREFIX, 'âš ï¸ Lookup: Clear Button not found after selection');
      }
      return false;
    };

    const pickAndConfirm = async (items) => {
      if (searchValue === '*') {
        const match = items[0];
        if (!match) return { ok: false, reason: 'no-match' };
        const radio = match.querySelector('input[type="radio"]');
        if (radio) radio.click(); else { const chk = match.querySelector('input[type="checkbox"]'); if (chk) chk.click(); else safeClick(match, 'lookup row'); }
        await sleep(600);
        const selBtn = allDocs().flatMap(doc => doc ? Array.from(doc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="ØªØ­Ø¯ÙŠØ¯"], .modal button[aria-label*="Ø§Ø®ØªØ±"]')) : []).reverse().find(b => b.offsetParent !== null);
        if (selBtn) { try { selBtn.focus(); } catch (_) {} selBtn.click(); await sleep(1000); }
        await verifyLookupWithClearButton();
        return { ok: true, selected: match.innerText?.trim() };
      }

      const getRowCode = (row) => (row.innerText.trim() || '').split(/\s*[_â€“â€”]\s*/)[0].trim();

      // Priority 1: Exact code match
      const exactMatch = items.find(i => {
        const code = getRowCode(i).toLowerCase();
        return code === rawTarget || normalize(code) === normalize(searchValue) || code === rawTargetCode || normalize(code) === targetCode;
      });
      // Priority 2: Starts-with + boundary (Ø§Ù„Ø­Ø±Ù Ø§Ù„ØªØ§Ù„ÙŠ Ù„ÙŠØ³ alphanumeric)
      const startsMatch = !exactMatch ? items.find(i => {
        const norm = normalize(getRowCode(i));
        const searchTarget = targetCode.length > normalize(searchValue).length / 2 ? targetCode : normalize(searchValue);
        return norm.startsWith(searchTarget) && (norm.length === searchTarget.length || !/[a-z0-9]/.test(norm[searchTarget.length]));
      }) : null;
      // Priority 3: Includes ÙÙŠ Ø¬Ø²Ø¡ Ø§Ù„ÙƒÙˆØ¯ ÙÙ‚Ø· (ÙŠÙ…Ù†Ø¹ false positives Ù…Ù† Ø§Ù„ÙˆØµÙ Ø§Ù„Ø¹Ø±Ø¨ÙŠ)
      const includesMatch = (!exactMatch && !startsMatch) ? items.find(i => {
        const code = normalize(getRowCode(i));
        return code.includes(targetCode) || code.includes(normalize(searchValue));
      }) : null;

      const match = exactMatch || startsMatch || includesMatch || null;
      if (!match) return { ok: false, reason: 'no-match' };
      const radio = match.querySelector('input[type="radio"]');
      if (radio) radio.click(); else { const chk = match.querySelector('input[type="checkbox"]'); if (chk) chk.click(); else safeClick(match, 'lookup row'); }
      await sleep(600);
      const selBtn = allDocs().flatMap(doc => doc ? Array.from(doc.querySelectorAll('.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="ØªØ­Ø¯ÙŠØ¯"], .modal button[aria-label*="Ø§Ø®ØªØ±"]')) : []).reverse().find(b => b.offsetParent !== null);
      if (selBtn) { try { selBtn.focus(); } catch (_) {} selBtn.click(); try { selBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch (_) {} await sleep(1000); }
      await verifyLookupWithClearButton();
      return { ok: true, selected: match.innerText?.trim() };
    };

    if (visibleItems.length > 0) {
      const res = await pickAndConfirm(visibleItems);
      if (res.ok) return res;
    }

    // â”€â”€ Fallback: ÙˆØ¶Ø¹ Ø§Ù„Ø¨Ø­Ø« Ø¯Ø§Ø®Ù„ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ â”€â”€
    const searchSelectors = ['[role="dialog"] input[type="search"]', '[role="dialog"] input[type="text"]', '.modal input[type="search"]', '.modal input[type="text"]', '.modal input.query', 'input[placeholder*="Search"]'];
    let si = null;
    for (const doc of allDocs()) {
      if (!doc) continue;
      si = Array.from(doc.querySelectorAll(searchSelectors.join(','))).find(i => i.offsetParent !== null);
      if (si) break;
    }
    if (si) {
      const searchFor = modelCodeOnly || searchValue;
      await emulateUserInput(si, searchFor); await sleep(400);
      const modalSearchBtn = si.parentElement?.querySelector('button') || findFirst(['.modal button[aria-label*="Search"]', '.modal button[aria-label*="Ø¨Ø­Ø«"]']);
      if (modalSearchBtn) safeClick(modalSearchBtn, 'Modal search button');
      else ['keydown', 'keypress', 'keyup'].forEach(ev => { try { si.dispatchEvent(new KeyboardEvent(ev, { key: 'Enter', keyCode: 13, bubbles: true })); } catch (_) {} });
      const startWait = Date.now();
      while (Date.now() - startWait < 12000) {
        visibleItems = getVisibleItems();
        if (visibleItems.some(i => normalize(i.innerText).includes(targetCode) || normalize(i.innerText).includes(normalize(searchValue)))) break;
        await sleep(400);
      }
    }

    visibleItems = getVisibleItems();
    if (!visibleItems.length) {
      const closeBtn = findFirst(['.modal.show [data-dismiss="modal"]', '.modal.show button.close']);
      if (closeBtn) safeClick(closeBtn, 'Modal close');
      return { ok: false, reason: 'no-results' };
    }
    return await pickAndConfirm(visibleItems) || { ok: false };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SUPERVISORY VERIFICATION ENGINE â€” Ù…Ù† AutoFiller v3.0 + Phase 2
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function createInputVerifier(elFinder) {
    return () => {
      const el = elFinder(); if (!el) return false;
      if (el.tagName === 'SELECT') return el.selectedIndex > 0 && el.options[el.selectedIndex].text.trim() !== '';
      const val = el.value || el.getAttribute('value') || el.innerText || '';
      return val.trim().length > 0;
    };
  }

  // â”€â”€ PHASE 2.2 â€” Lookup Verifier: ÙŠØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯ Clear Button ÙƒØ¯Ù„ÙŠÙ„ Ø§Ø¹ØªÙ…Ø§Ø¯ â”€â”€
  function createLookupVerifier(elFinder) {
    return () => {
      const el = elFinder(); if (!el) return false;
      // Ù„Ù„Ù€ lookup fields: ÙˆØ¬ÙˆØ¯ Ø²Ø± Clear = ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù‚ÙŠÙ…Ø©
      const clearBtn = el.parentElement?.querySelector(
        'button[aria-label*="Clear"], button[aria-label*="Ù…Ø³Ø­"], .clear-button, [data-action="clear"]'
      );
      return !!clearBtn;
    };
  }

  // â”€â”€ Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø­Ù‚ÙˆÙ„: Ù„Ø§ Ù†Ù…Ø³Ø­ Ù‚ÙŠÙ…Ø© Ø­Ù‚ÙŠÙ‚ÙŠØ© Ù…ÙˆØ¬ÙˆØ¯Ø© â”€â”€
  function readFieldValue(el) {
    if (!el) return '';
    let val = el.value || el.getAttribute('value') || '';
    if (!val && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) val = el.innerText || '';
    return String(val || '').trim();
  }

  function isRealValue(v) {
    return !!v && v !== '0' && !/Ù„Ø§ ÙŠÙˆØ¬Ø¯|n\/a|none|undefined/i.test(v);
  }

  // ØªØ¹Ø¨Ø¦Ø© + ØªØ­Ù‚Ù‚ Ù…Ø¹ Ø¥Ø¹Ø§Ø¯Ø© Ù…Ø­Ø§ÙˆÙ„Ø© â€” Ù…Ø«Ù„ fillAndVerify ÙÙŠ Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù‚Ø¯ÙŠÙ…
  async function fillAndVerify(fieldLabel, targetValue, actionFn, verifyFn, maxRetries = 2) {
    if (!targetValue) return { ok: false, reason: 'no-value' };
    console.log(LOG_PREFIX, 'â–¶ï¸ Filling ' + fieldLabel + ': "' + targetValue + '"');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await actionFn();
      let verified = false;
      const start = Date.now();
      while (Date.now() - start < 4500) {
        if (verifyFn()) { verified = true; break; }
        await sleep(350);
      }
      if (verified) {
        console.log(LOG_PREFIX, 'âœ… [Success] ' + fieldLabel);
        try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('field_filled', { field: fieldLabel, value: targetValue, method: 'booking' }); } catch (_) {}
        return { ok: true, result };
      }
      console.warn(LOG_PREFIX, 'âš ï¸ [Retry] ' + fieldLabel + ' failed on attempt ' + attempt);
      const closeBtn = findFirst(['.modal.show [data-dismiss="modal"]', '.modal.show button.close']);
      if (closeBtn && closeBtn.offsetParent !== null) { safeClick(closeBtn, 'Modal close'); await sleep(800); }
    }
    console.error(LOG_PREFIX, 'âŒ [Failed] ' + fieldLabel + ' after ' + maxRetries + ' attempts.');
    return { ok: false };
  }

  // ØªØ¹Ø¨Ø¦Ø© Ù…Ø­Ù…ÙŠØ©: ØªØ­ØªÙØ¸ Ø¨Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØ© Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø©
  async function fillAndVerifyProtected(fieldLabel, targetValue, actionFn, verifyFn, existingElFinder, forceOverwrite) {
    if (!targetValue) return { ok: false, reason: 'no-value' };
    if (!forceOverwrite) {
      await sleep(300);
      const existing = readFieldValue(existingElFinder ? existingElFinder() : null);
      if (isRealValue(existing)) {
        console.log(LOG_PREFIX, 'ðŸ›¡ï¸ ' + fieldLabel + ': Ù‚ÙŠÙ…Ø© Ù…ÙˆØ¬ÙˆØ¯Ø© ("' + existing + '") â€” ØªÙ… Ø§Ù„Ø§Ø­ØªÙØ§Ø¸ Ø¨Ù‡Ø§.');
        return { ok: true, keptExisting: existing };
      }
    }
    return await fillAndVerify(fieldLabel, targetValue, actionFn, verifyFn);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PHASE 2.1 â€” waitForSaveComplete (Dynamic Wait)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  async function waitForSaveComplete(startUrl, cfg, maxWaitMs = 15000) {
    console.log(LOG_PREFIX, 'â³ Waiting for PowerApps to process (Dynamic Wait)...');
    await sleep(1000);
    const sw = Date.now();
    while (Date.now() - sw < maxWaitMs) {
      // Ù†Ø¬Ø§Ø­: Ù…Ø¤Ø´Ø± Ù†Ø¬Ø§Ø­ Ø£Ùˆ ØªØºÙŠÙŠØ± URL (Ø®Ø±ÙˆØ¬ Ù…Ù† stepid)
      if (findFirst(cfg.successIndicator || [])) return true;
      if (location.href !== startUrl && !location.href.includes('stepid=')) return true;
      // ÙØ´Ù„: Ø®Ø·Ø£ validation Ø¸Ø§Ù‡Ø±
      const hasError = !!document.querySelector('.alert-danger, .validation-summary-errors');
      const isBlocked = !!document.querySelector('.blockUI, .blockOverlay, .loading-spinner');
      if (!isBlocked && hasError) {
        console.warn(LOG_PREFIX, 'âš ï¸ Validation error during wait.');
        return false;
      }
      await sleep(cfg.retryIntervalMs || 1000);
    }
    console.warn(LOG_PREFIX, 'âš ï¸ Save wait timeout.');
    return false;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PHASE 2.4 â€” detectManualAdditions + scrapeFullOrderDetails
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function detectManualAdditions(injectedData) {
    const manuallyAdded = {};
    const fieldMap = {
      serial: ['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ØªØ³Ù„Ø³Ù„ÙŠ', 'Serial'],
      brand: ['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©', 'Brand'],
      model: ['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„', 'Model'],
      status: ['Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù†', 'Warranty Status'],
      date: ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Date'],
      notes: ['Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª', 'Notes']
    };
    for (const [key, labels] of Object.entries(fieldMap)) {
      const injectedVal = (injectedData[key] || '').toString().trim();
      if (!injectedVal) continue;
      const allInputs = Array.from(collectAllDocs(document).flatMap(d => Array.from(d.querySelectorAll('input:not([type=hidden]), select, textarea'))));
      const matchInput = allInputs.find(el => {
        const lb = Array.from(collectAllDocs(document).flatMap(d => Array.from(d.querySelectorAll('label')))).find(l => l.htmlFor === el.id);
        return lb && labels.some(l => (lb.innerText || '').includes(l));
      });
      if (matchInput) {
        const pageVal = (matchInput.value || '').trim();
        if (pageVal && pageVal !== injectedVal) {
          manuallyAdded[key] = { injected: injectedVal, manual: pageVal };
        }
      }
    }
    return manuallyAdded;
  }

  function scrapeFullOrderDetails(injectedData) {
    const page = {};
    const fieldMap = {
      serial: ['Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ØªØ³Ù„Ø³Ù„ÙŠ', 'Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø³Ù„Ø³Ù„', 'Serial Number', 'Serial'],
      brand: ['Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©', 'Ø§Ù„Ø¹Ù„Ø§Ù…Ù‡ Ø§Ù„ØªØ¬Ø§Ø±ÙŠÙ‡', 'Brand'],
      model: ['Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„', 'Model'],
      status: ['Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù†', 'Warranty Status'],
      date: ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Date'],
      notes: ['Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª', 'Notes'],
      workOrder: ['Ø±Ù‚Ù… Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„', 'Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„', 'Ø±Ù‚Ù… Ø§Ù„Ø´ØºÙ„', 'Work Order'],
      complaintCode: ['ÙƒÙˆØ¯ Ø§Ù„Ø¨Ù„Ø§Øº', 'Ø±Ù‚Ù… Ø§Ù„Ø¨Ù„Ø§Øº', 'ÙƒÙˆØ¯ Ø§Ù„Ø´ÙƒÙˆÙ‰', 'Ø¨Ù„Ø§Øº Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Complaint Code', 'Customer Complaint', 'Complaint'],
      phone: ['Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ', 'Ø±Ù‚Ù… Ø§Ù„ØªÙ„ÙŠÙÙˆÙ†', 'Ø§Ù„ØªÙ„ÙŠÙÙˆÙ†', 'Ø§Ù„Ù…ÙˆØ¨Ø§ÙŠÙ„', 'Phone', 'Mobile'],
      address: ['Ø§Ù„Ø¹Ù†ÙˆØ§Ù†', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Address', 'Customer Address']
    };

    // Ù‚Ø±Ø§Ø¡Ø© Ù‚ÙŠÙ…Ø© Ø­Ù‚Ù„: findFieldByLabel Ø£ÙˆÙ„Ø§Ù‹ (input)ØŒ Ø«Ù… Ù‚Ø±Ø§Ø¡Ø© Ù†ØµÙŠØ© Ù…Ù† Ø­Ø§ÙˆÙŠØ© Ø§Ù„Ù€ label
    const readValue = (labels) => {
      const input = findFieldByLabel(labels);
      if (input) {
        const v = readFieldValue(input);
        if (v) return v;
      }
      for (const doc of collectAllDocs(document)) {
        if (!doc) continue;
        for (const lab of labels) {
          const needle = String(lab).replace(/[*\s]/g, '');
          const labelEl = Array.from(doc.querySelectorAll('label, th, .field-label, td, dt'))
            .find(l => {
              const t = l.textContent || l.innerText || '';
              return t.length < 160 && String(t).replace(/[*\s:]/g, '').includes(needle);
            });
          if (!labelEl) continue;
          const parent = labelEl.closest('tr, .form-group, .field, .fieldset');
          if (parent) {
            const vals = Array.from(parent.querySelectorAll('td, input, select, textarea, .field-value, [class*="value"]'))
              .filter(c => c !== labelEl)
              .map(el => String(el.value || el.innerText || el.textContent || '').replace(/[*:]/g, '').trim())
              .filter(v => v && v !== lab && v.length < 300);
            if (vals.length) return vals[0];
          }
        }
      }
      return '';
    };

    for (const [key, labels] of Object.entries(fieldMap)) {
      page[key] = readValue(labels);
    }

    // PHASE 3: Ù…Ù‚Ø§Ø±Ù†Ø© Ø§Ù„Ù…Ø­Ù‚ÙˆÙ† Ø¨Ø§Ù„Ù…Ù‚Ø±ÙˆØ¡ â€” diff Ù„ÙƒÙ„ Ø­Ù‚Ù„ (Ø¹Ù†Ø¯ ØªÙ…Ø±ÙŠØ± injectedData)
    if (injectedData && typeof injectedData === 'object') {
      const injected = {};
      const diff = {};
      for (const key of Object.keys(fieldMap)) {
        const injectedVal = String(injectedData[key] || '').trim();
        injected[key] = injectedVal;
        const pageVal = page[key] || '';
        if (injectedVal && pageVal && injectedVal !== pageVal) {
          diff[key] = { injected: injectedVal, page: pageVal };
        }
      }
      return { page, injected, diff: Object.keys(diff).length ? diff : null };
    }

    return page;
  }

  // â”€â”€ Toast Ù„Ù„ØµÙØ­Ø© â”€â”€
  function showPageToast(msg, type = 'info') {
    try {
      const toast = document.createElement('div');
      const colors = { info: '#17334c', success: '#17334c', error: '#ef5350', warn: '#ffa726' };
      Object.assign(toast.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999,
        padding: '12px 20px', borderRadius: '8px', background: colors[type] || '#4fc3f7',
        color: '#fff', fontFamily: 'Segoe UI, sans-serif', fontSize: '14px',
        fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.3s'
      });
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    } catch (_) {}
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BOOKING FLOW â€” Ø§Ù„Ø­Ù‚ÙˆÙ„ ÙˆØ§Ù„Ø¨Ø­Ø« (Ù…Ø­Ø³Ù‘Ù† Ø¹Ø¨Ø± ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Find input element for a field (keyword-based + DOM traversal + iframes) â”€â”€
  function findInputForField(keywords) {
    // PHASE 3: Ù…Ø·Ø§Ø¨Ù‚Ø© label Ø¯Ù‚ÙŠÙ‚Ø© Ø¹Ø¨Ø± findFieldByLabel Ø£ÙˆÙ„Ø§Ù‹ (ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª + Ù…Ø±Ø¦ÙŠ)
    const byLabel = findFieldByLabel(keywords);
    if (byLabel) return byLabel;

    const allDocs = collectAllDocs(document);
    // 1. Search by label text
    for (const doc of allDocs) {
      if (!doc) continue;
      const labels = Array.from(doc.querySelectorAll('label, span, div, td')).filter(el => {
        if (el.children.length > 0 && el.tagName !== 'LABEL') {
          const firstChildText = el.childNodes[0]?.textContent || '';
          return keywords.some(kw => firstChildText.trim().includes(kw));
        }
        const text = el.innerText || el.textContent || '';
        return keywords.some(kw => text.trim().includes(kw));
      });

      for (const label of labels) {
        if (label.tagName === 'LABEL' && label.htmlFor) {
          const input = doc.getElementById(label.htmlFor);
          if (input) return input;
        }
        const nestedInput = label.querySelector('input, select, textarea');
        if (nestedInput) return nestedInput;
        let current = label;
        for (let depth = 0; depth < 4; depth++) {
          if (!current) break;
          const siblingInputs = Array.from(current.querySelectorAll('input, select, textarea'));
          if (siblingInputs.length > 0) {
            const visible = siblingInputs.find(inp => inp.type !== 'hidden' && inp.style.display !== 'none');
            if (visible) return visible;
          }
          let sibling = current.nextElementSibling;
          while (sibling) {
            const sibInput = sibling.querySelector('input, select, textarea') ||
              (['INPUT', 'SELECT', 'TEXTAREA'].includes(sibling.tagName) ? sibling : null);
            if (sibInput) return sibInput;
            sibling = sibling.nextElementSibling;
          }
          current = current.parentElement;
        }
      }
    }

    // 2. Fallback: search by input name/id/placeholder
    for (const doc of allDocs) {
      if (!doc) continue;
      const allInputs = Array.from(doc.querySelectorAll('input, select, textarea'));
      for (const input of allInputs) {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();
        const matched = keywords.some(kw =>
          name.includes(kw.toLowerCase()) ||
          id.includes(kw.toLowerCase()) ||
          placeholder.includes(kw.toLowerCase())
        );
        if (matched) return input;
      }
    }
    return null;
  }

  // â”€â”€ Find target document (nested iframes) â”€â”€
  function findTargetDoc() {
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      if (doc.getElementById(PORTAL_FIELD_IDS.defectMajor + '_name') ||
          doc.getElementById(PORTAL_FIELD_IDS.defectCode + '_name') ||
          doc.getElementById(PORTAL_FIELD_IDS.sparePart + '_name')) {
        return doc;
      }
    }
    return null;
  }

  // â”€â”€ ØªØ¹Ø¨Ø¦Ø© Ø­Ù‚Ù„ lookup Ø¨Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ù‚ÙˆÙŠØ©: modal Ø¥Ù† Ø£Ù…ÙƒÙ†ØŒ Ø£Ùˆ Ø­Ù‚Ù† Ù…Ø¨Ø§Ø´Ø± Ù…Ø­Ù…ÙŠ â”€â”€
  async function setField(doc, fieldId, value, forceOverwrite) {
    const nameInput = doc.getElementById(fieldId + '_name');
    const rawInput = doc.getElementById(fieldId);
    const target = nameInput || rawInput;
    if (!target) return { ok: false, reason: 'field-not-found' };

    // Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ù€ lookup modal Ø£ÙˆÙ„Ø§Ù‹ (Ø²Ø± launch Ø¢Ù…Ù†).
    // Ø§Ù„Ø¬Ø°Ø± = document Ø¯Ø§Ø¦Ù…Ø§Ù‹: Ù…ÙˆØ¯Ø§Ù„Ø§Øª PowerApps ØªÙÙØªØ­ ÙÙŠ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØŒ
    // Ùˆ collectAllDocs(document) ÙŠÙ…Ø´ÙŠ Ù†Ø²ÙˆÙ„Ø§Ù‹ Ø¯Ø§Ø®Ù„ ÙƒÙ„ Ø§Ù„Ù€ iframes â€” ÙŠØºØ·ÙŠ Ø§Ù„Ø­Ø§Ù„ØªÙŠÙ†.
    const launchBtn = findSafeLookupButton(target, ['button.launchentitylookup', '[aria-label*="Launch lookup"]']);
    if (launchBtn) {
      const res = await fillLookupModal(launchBtn, value, document);
      if (res.ok) return res;
      // Ù„Ùˆ ÙØ´Ù„ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ â†’ Ù†ØºÙ„Ù‚ Ø£ÙŠ Ù…ÙˆØ¯Ø§Ù„ Ù…Ø§ Ø²Ø§Ù„ Ù…ÙØªÙˆØ­Ø§Ù‹ Ø«Ù… Ù†ÙƒÙ…Ù„ Ø¨Ø§Ù„Ø­Ù‚Ù† Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø§Ù„Ù…Ø­Ù…ÙŠ
      const openModal = findFirst(['.modal.show [data-dismiss="modal"]', '.modal.show button.close']);
      if (openModal) { safeClick(openModal, 'Modal close after failed lookup'); await sleep(800); }
    }

    // PHASE 2.3: Ø§Ø³ØªØ®Ø¯Ù… createLookupVerifier Ù„Ù„Ø­Ù‚ÙˆÙ„ lookup (defectMajor, defectCode, sparePart)
    const isLookupField = [PORTAL_FIELD_IDS.defectMajor, PORTAL_FIELD_IDS.defectCode, PORTAL_FIELD_IDS.sparePart].includes(fieldId);
    const verifier = isLookupField
      ? createLookupVerifier(() => target)
      : createInputVerifier(() => target);

    return await fillAndVerifyProtected(
      fieldId,
      value,
      async () => { await emulateUserInput(target, value); return { ok: true }; },
      verifier,
      () => target,
      forceOverwrite
    );
  }

  // â”€â”€ Auto-fill form with part data (keyword + portal IDs cascade) â”€â”€
  async function autoFillForm(data) {
    // Format values to match portal expectations
    const fieldsToFill = {
      productType: data.productType || '',
      brand: data.brand ? `${data.brand} - ${data.productType || ''}` : (data.productType || ''),
      model: data.modelDescription ? `${data.modelCode} _ (${data.modelDescription})` : data.modelCode,
      defect: data.defectDescription ? `${data.defectCode} - (${data.defectDescription})` : data.defectCode,
      sparePart: data.sparePartDescription ? `${data.sparePartCode} _ (${data.sparePartDescription})` : data.sparePartCode,
      quantity: '1'
    };

    let filledCount = 0;

    // Method 1: Keyword-based field detection (Smart_Autofill approach)
    for (const [fieldKey, keywords] of Object.entries(FIELD_DEFINITIONS)) {
      const input = findInputForField(keywords);
      const value = fieldsToFill[fieldKey];
      if (input && value) {
        await emulateUserInput(input, value);
        fireEvents(input);

        // Visual feedback
        const originalBorder = input.style.border;
        const originalShadow = input.style.boxShadow;
        input.style.transition = 'all 0.3s ease';
        input.style.border = '2px solid #10B981';
        input.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
        setTimeout(() => {
          input.style.border = originalBorder;
          input.style.boxShadow = originalShadow;
        }, 1500);

        filledCount++;
      }
    }

    // Method 2: Portal-specific field IDs with cascade injection (injector.js approach)
    //    Ù…Ø­Ø³Ù‘Ù†: Ø¨Ø­Ø« ÙÙŠ ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª + lookup modal Ù‚ÙˆÙŠ + ØªØ­Ù‚Ù‚ Ù…Ø­Ù…ÙŠ
    const doc = findTargetDoc();
    if (doc) {
      const majorText = data.defectMajor || `${data.defectCode} - (${data.defectDescription || ''})`;

      const r1 = await setField(doc, PORTAL_FIELD_IDS.defectMajor, majorText, !!data.forceOverwrite);
      if (r1.ok) filledCount++;

      await sleep(600);
      const r2 = await setField(doc, PORTAL_FIELD_IDS.defectCode, data.defectDescription || data.defectCode || '', !!data.forceOverwrite);
      if (r2.ok) filledCount++;

      await sleep(1200);
      const r3 = await setField(doc, PORTAL_FIELD_IDS.sparePart, data.sparePartCode || '', !!data.forceOverwrite);
      if (r3.ok) filledCount++;

      const ldvPart = doc.getElementById('ldv_partname');
      if (ldvPart) {
        await emulateUserInput(ldvPart, data.sparePartDescription || '');
        fireEvents(ldvPart);
      }
    }

    try {
      if (typeof globalThis.logEvent === 'function') globalThis.logEvent('inject', { filledCount, method: 'booking', codes: { defect: data.defectCode, part: data.sparePartCode } });
    } catch (_) {}

    return filledCount;
  }

  // â”€â”€ Inject multiple spare parts sequentially â”€â”€
  async function injectMultiple(items) {
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < items.length; i++) {
      try {
        const filled = await autoFillForm(items[i]);
        if (filled > 0) {
          successCount++;
          // Wait for portal cascading to settle before next item
          if (i < items.length - 1) await sleep(1500);
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(LOG_PREFIX, 'injectMultiple error:', err);
        errorCount++;
      }
    }
    return { status: 'success', filled: successCount, errors: errorCount, total: items.length };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PHASE 3 â€” FIELD FINDING & ORDER INTELLIGENCE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ findFieldByLabel: Ø¨Ø­Ø« Ø­Ù‚Ù„ Ø¹Ø¨Ø± Ù…Ø·Ø§Ø¨Ù‚Ø© Ù†Øµ Ø§Ù„Ù€ label (Ù…Ù† V1 â€” Ù…Ø¹Ø²Ù‘Ø²) â”€â”€
  // ÙŠØ¨Ø­Ø« Ø¹Ø¨Ø± collectAllDocs (main + iframes)ØŒ ÙŠØ·Ø¨Ù‘Ø¹ Ø§Ù„Ù†ØµÙˆØµ (Ø¨Ø¯ÙˆÙ† Ù…Ø³Ø§ÙØ§Øª/Ù†Ø¬ÙˆÙ…/Ù†Ù‚Ø·ØªÙŠÙ†)ØŒ
  // ÙˆÙŠØªØ¹Ø§Ù…Ù„ Ù…Ø¹: label.htmlFor / aria-labelledby / nested input / container /
  // ancestor walk / sibling traversal â€” ÙˆÙŠØ¹ÙŠØ¯ Ø£ÙˆÙ„ Ø­Ù‚Ù„ Ù…Ø±Ø¦ÙŠ Ù…Ø·Ø§Ø¨Ù‚ (input/select/textarea).
  function findFieldByLabel(labelTexts, tagName) {
    if (!Array.isArray(labelTexts)) labelTexts = [labelTexts];
    const inputQuery = tagName
      ? String(tagName).toLowerCase()
      : 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

    const matchesTag = (el) => {
      if (!tagName) return true;
      return String(el.tagName || '').toLowerCase() === String(tagName).toLowerCase();
    };

    const isVisible = (el) => {
      try {
        if (el.type === 'hidden') return false;
        if (el.closest('[hidden], [style*="display:none"], [style*="display: none"], [aria-hidden="true"]')) return false;
        return el.offsetParent !== null || el.getClientRects().length > 0;
      } catch (_) { return true; }
    };

    const normalize = (s) => String(s || '').replace(/[*\s:]/g, '');
    const findInSiblings = (lbl, count) => {
      let sib = lbl.nextElementSibling;
      for (let i = 0; i < count && sib; i++) {
        if (matchesTag(sib) && /^(INPUT|SELECT|TEXTAREA)$/.test(sib.tagName) && isVisible(sib)) return sib;
        const nested2 = sib.querySelector(inputQuery);
        if (nested2 && matchesTag(nested2) && isVisible(nested2)) return nested2;
        sib = sib.nextElementSibling;
      }
      return null;
    };

    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;

      // Ø§Ù„Ù…Ø±Ø­Ù„Ø© A â€” Ø¹Ù†Ø§ØµØ± label Ø¯Ù„Ø§Ù„ÙŠØ© (Ø§Ù„Ø£Ø¯Ù‚ Ø£ÙˆÙ„Ø§Ù‹)
      const semantic = Array.from(doc.querySelectorAll('label, .field-label, th, legend, dt'));
      for (const text of labelTexts) {
        const needle = normalize(text);
        if (!needle) continue;
        for (const lbl of semantic) {
          const raw = normalize(lbl.textContent || lbl.innerText);
          if (!raw.includes(needle)) continue;

          // 1) label.htmlFor / aria-labelledby
          const forId = lbl.getAttribute && (lbl.getAttribute('for') || lbl.getAttribute('aria-labelledby'));
          if (forId) {
            const el = doc.getElementById(forId);
            if (el && matchesTag(el) && isVisible(el)) return el;
          }

          // 2) nested input Ø¯Ø§Ø®Ù„ Ø§Ù„Ù€ label Ù†ÙØ³Ù‡
          const nested = lbl.querySelector(inputQuery);
          if (nested && nested !== lbl && matchesTag(nested) && isVisible(nested)) return nested;

          // 3) Ø­Ø§ÙˆÙŠØ© Ø§Ù„Ø­Ù‚Ù„ (form-group/field/row/tr â€¦)
          const container = lbl.closest('.form-group, .field, .control, .fieldset, .row, .question, tr, [class*="field"], [class*="form-"]') || lbl.parentElement;
          if (container) {
            const el = container.querySelector(inputQuery);
            if (el && el !== lbl && matchesTag(el) && isVisible(el)) return el;
          }

          // 4) ØµØ¹ÙˆØ¯ ÙÙŠ Ø§Ù„Ø´Ø¬Ø±Ø© (Ø¹Ù…Ù‚Ø§Ù†)
          let ancestor = lbl.parentElement;
          for (let i = 0; i < 2 && ancestor; i++) {
            const el = ancestor.querySelector(inputQuery);
            if (el && el !== lbl && matchesTag(el) && isVisible(el)) return el;
            ancestor = ancestor.parentElement;
          }

          // 5) Ø§Ù„Ø£Ø®ÙˆØ© Ø§Ù„ØªØ§Ù„ÙŠÙˆÙ† (4)
          const sibRes = findInSiblings(lbl, 4);
          if (sibRes) return sibRes;
        }
      }

      // Ø§Ù„Ù…Ø±Ø­Ù„Ø© B â€” Ø¹Ù†Ø§ØµØ± Ø¨Ù†ÙŠÙˆÙŠØ© (td/span/div) Ø¨Ù†Øµ Ù‚ØµÙŠØ± ÙÙ‚Ø· (Ø¯Ù‚Ø© Ø£Ø¹Ù„Ù‰)
      const structural = Array.from(doc.querySelectorAll('td, span, div')).filter(el => {
        const t = (el.textContent || el.innerText || '').trim();
        return t.length > 0 && t.length < 120;
      });
      for (const text of labelTexts) {
        const needle = normalize(text);
        if (!needle) continue;
        for (const lbl of structural) {
          const raw = normalize(lbl.textContent || lbl.innerText);
          if (!raw.includes(needle)) continue;
          const nested = lbl.querySelector(inputQuery);
          if (nested && matchesTag(nested) && isVisible(nested)) return nested;
          const sibRes = findInSiblings(lbl, 3);
          if (sibRes) return sibRes;
        }
      }
    }
    return null;
  }

  // â”€â”€ readDeviceTypeFromPage: Ù†ÙˆØ¹ Ø§Ù„Ø¬Ù‡Ø§Ø² Ù…Ù† Ø§Ù„ØµÙØ­Ø© (Ù…Ù† V2 â€” Ù…Ø¹Ø²Ù‘Ø²) â”€â”€
  // ÙŠÙ‚Ø±Ø£ Ø­Ù‚Ù„ "Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬/ÙØ¦Ø© Ø§Ù„Ù…Ù†ØªØ¬/Product Type": input Ù†ØµÙŠ â† select â† Ù†Øµ Ø§Ù„Ø¹Ø±Ø¶ (clone).
  function readDeviceTypeFromPage() {
    const labels = ['Product Category', 'Product Type', 'Device Type', 'Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬', 'ÙØ¦Ø© Ø§Ù„Ù…Ù†ØªØ¬', 'Ø§Ù„Ù…Ù†ØªØ¬', 'Product'];
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      for (const lab of labels) {
        const labelEl = Array.from(doc.querySelectorAll('label, .field-label, th'))
          .find(l => (l.innerText || l.textContent || '').trim().includes(lab));
        if (!labelEl) continue;
        const parent = labelEl.closest('td, .form-group, .field');
        if (!parent) continue;

        // 1) input Ù†ØµÙŠ Ù…Ø¨Ø§Ø´Ø± (Ø§Ù„Ø£Ø¯Ù‚ â€” Ù†ÙØ³ V2)
        const input = parent.querySelector('input[type="text"]:not([class*="hidden"])');
        if (input && input.value && input.value.trim()) return input.value.trim();

        // 2) select â€” Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬ Ù‚Ø¯ ÙŠÙƒÙˆÙ† dropdown
        const sel = parent.querySelector('select');
        if (sel && sel.selectedIndex >= 0) {
          const t = (sel.options[sel.selectedIndex].text || '').trim();
          if (t && t !== lab) return t;
        }

        // 3) Ù†Øµ Ø§Ù„Ø¹Ø±Ø¶ Ø¨Ø¹Ø¯ Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù€ label ÙˆØ§Ù„Ø£Ø²Ø±Ø§Ø± (clone â€” Ù†ÙØ³ V2)
        const clone = parent.cloneNode(true);
        const lbl2 = clone.querySelector('label');
        if (lbl2) lbl2.remove();
        clone.querySelectorAll('.lookup-modal, .input-group-btn, .btn, script, style').forEach(el => el.remove());
        const t = clone.innerText.replace(/[*:]/g, '').replace(/[\r\n]+/g, ' ').trim();
        if (t && t !== lab) return t;
      }
    }
    return null;
  }

  // â”€â”€ readComplaintCodeFromPage: ÙƒÙˆØ¯ Ø§Ù„Ø´ÙƒÙˆÙ‰/Ø§Ù„Ø¨Ù„Ø§Øº Ù…Ù† Ø§Ù„ØµÙØ­Ø© (Ù…Ù† V2 â€” Ù…Ø¹Ø²Ù‘Ø²) â”€â”€
  // htmlFor â† Ø®Ù„Ø§ÙŠØ§ Ø§Ù„Ø­Ø§ÙˆÙŠØ© â† Ø§Ù„Ø¹Ù†ØµØ± Ø§Ù„ØªØ§Ù„ÙŠØ› Ù…Ø¹ Ø¥Ø²Ø§Ù„Ø© Ø¨Ø§Ø¯Ø¦Ø© Ø§Ù„Ù€ label Ù…Ù† Ø§Ù„Ù‚ÙŠÙ…Ø©.
  function readComplaintCodeFromPage() {
    const labels = [
      'Customer Complaint', 'Complaint Code', 'Complaint',
      'ÙƒÙˆØ¯ Ø§Ù„Ø´ÙƒÙˆÙ‰', 'Ø´ÙƒÙˆÙ‰ Ø§Ù„Ø¹Ù…ÙŠÙ„', 'Ø´ÙƒÙˆÙ‰', 'ÙƒÙˆØ¯ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©', 'Ø§Ù„Ù…Ø´ÙƒÙ„Ø©',
      'ÙƒÙˆØ¯ Ø§Ù„Ø¨Ù„Ø§Øº', 'Ø±Ù‚Ù… Ø§Ù„Ø¨Ù„Ø§Øº'
    ];
    const clean = (v) => String(v || '').replace(/[*:]/g, '').trim();
    const stripLabelPrefix = (v, lab) => {
      v = clean(v);
      const re = new RegExp('^' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-â€“â€”]?\\s*', 'i');
      return v.replace(re, '').trim();
    };
    for (const doc of collectAllDocs(document)) {
      if (!doc) continue;
      for (const lab of labels) {
        const needle = lab.toLowerCase();
        const labelEl = Array.from(doc.querySelectorAll('label, .field-label, th, td'))
          .find(l => {
            const t = (l.innerText || l.textContent || '').trim();
            return t.length > 0 && t.length < 160 && t.toLowerCase().includes(needle);
          });
        if (!labelEl) continue;

        // 1) Ø§Ù„Ø­Ù‚Ù„ Ø§Ù„Ù…Ø±ØªØ¨Ø· Ø¹Ø¨Ø± for
        const forId = labelEl.getAttribute && labelEl.getAttribute('for');
        if (forId) {
          const el = doc.getElementById(forId);
          if (el) {
            const v = clean(el.value || el.innerText);
            if (v && v.toLowerCase() !== needle) return v;
          }
        }

        // 2) Ø®Ù„Ø§ÙŠØ§/Ø­Ù‚ÙˆÙ„ Ø§Ù„Ø­Ø§ÙˆÙŠØ© (tr/form-group/field/fieldset)
        const parent = labelEl.closest('tr, .form-group, .field, .fieldset');
        if (parent) {
          const cells = Array.from(parent.querySelectorAll('td, input, select, .field-value, [class*="value"]'));
          for (const cell of cells) {
            if (cell === labelEl) continue;
            const v = stripLabelPrefix(cell.value || cell.innerText, lab);
            if (v && v.toLowerCase() !== needle) return v;
          }
        }

        // 3) Ø§Ù„Ø¹Ù†ØµØ± Ø§Ù„ØªØ§Ù„ÙŠ Ù…Ø¨Ø§Ø´Ø±Ø© Ø£Ùˆ Ø§Ù„Ø®Ù„ÙŠØ© Ø§Ù„ØªØ§Ù„ÙŠØ© ÙÙŠ Ø§Ù„ØµÙ
        const next = labelEl.nextElementSibling || labelEl.closest('td')?.nextElementSibling;
        if (next) {
          const v = stripLabelPrefix(next.innerText || next.value, lab);
          if (v && v.toLowerCase() !== needle) return v;
        }
      }
    }
    return null;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // ROUTER & PAGE-TYPE INTELLIGENCE (Phase 1)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Enhanced getPageType: ÙŠÙ…ÙŠØ² WORK_ORDER_REVIEW, FOLLOWUP, ORDERS, INSTALLATION, OTHER â”€â”€
  function getPageType() {
    const url = location.href.toLowerCase();
    const allDocs = [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];

    // Installation Report Ù„Ù‡Ø§ Ø£ÙˆÙ„ÙˆÙŠØ© Ù‚ØµÙˆÙ‰
    if (isInstallationReport(allDocs)) return 'INSTALLATION';

    // URL-based detection
    if (url.includes('workorderreview')) return 'WORK_ORDER_REVIEW';
    if (url.includes('followup')) return 'FOLLOWUP';
    if (url.includes('/orders')) return 'ORDERS';

    // Content-based fallback Ù„Ù€ WORK_ORDER_REVIEW / FOLLOWUP
    for (const doc of allDocs) {
      if (!doc) continue;
      const text = (doc.body?.innerText || '').toLowerCase();
      if (text.includes('work order review') || text.includes('Ù…Ø±Ø§Ø¬Ø¹Ø© Ø£Ù…Ø± Ø§Ù„Ø´ØºÙ„')) return 'WORK_ORDER_REVIEW';
      if (text.includes('follow up') || text.includes('Ù…ØªØ§Ø¨Ø¹Ø©')) return 'FOLLOWUP';
    }

    return 'OTHER';
  }

  // â”€â”€ Detect Installation Report (Ø¨Ù„Ø§ØºØ§Øª Ø§Ù„ØªØ±ÙƒÙŠØ¨) â”€â”€
  function isInstallationReport(docs = null) {
    const allDocs = docs || [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];

    for (const doc of allDocs) {
      if (!doc) continue;

      // Direct service type / work order type fields
      const typeFields = [
        doc.querySelector('#ats_workordertype_name'),
        doc.querySelector('#ats_servicetype_name'),
        doc.querySelector('[data-logical-name="ats_workordertype"] input[type="text"], [data-logical-name="ats_workordertype"] [role="textbox"]')
      ];

      for (const el of typeFields) {
        if (!el) continue;
        const v = (el.value || el.innerText || '').toLowerCase();
        if (/ØªØ±ÙƒÙŠØ¨|installation|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(v)) return true;
      }

      // Work Order Type select (0 = Installation)
      const sel = doc.querySelector('#ldv_workordertype');
      if (sel) {
        const selVal = sel.value || '';
        const selText = sel.options && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '') : '';
        if (selVal === '0' || /installation/i.test(selText)) return true;
      }

      const hiddenVal = doc.querySelector('#ldv_workordertype_Value');
      if (hiddenVal && hiddenVal.value === '0') return true;

      // Fallback: Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ù†Øµ Ø§Ù„Ù€ label ÙˆÙ‚Ø±Ø§Ø¡Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ù…Ù† Ù†ÙØ³ Ø§Ù„Ø®Ù„ÙŠØ©
      const keys = ['Report Type', 'Service Type', 'Ù†ÙˆØ¹ Ø§Ù„Ø¨Ù„Ø§Øº', 'Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø©'];
      for (const k of keys) {
        const label = Array.from(doc.querySelectorAll('label, .field-label, th, td'))
          .find(l => l.innerText && l.innerText.includes(k));
        if (label) {
          const target = label.getAttribute('for') ? doc.getElementById(label.getAttribute('for')) :
            (label.closest('tr')?.querySelector('td:nth-child(2) input, td:nth-child(2) select, td:nth-child(2)') || label.nextElementSibling);
          if (target) {
            const v = (target.value || target.innerText || '').toLowerCase();
            if (/ØªØ±ÙƒÙŠØ¨|installation|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(v)) return true;
          }
        }
      }
    }

    return false;
  }

  // â”€â”€ Ø§Ø®ØªÙŠØ§Ø± ÙÙ†ÙŠ Ø¹Ø´ÙˆØ§Ø¦ÙŠ Ø£Ùˆ ÙÙ†ÙŠ Ù…Ø­Ø¯Ø¯ â”€â”€
  async function selectRandomTechnician(targetName = null) {
    try {
      const techSelect = findFirst([
        '#ats_technician_name',
        'select[aria-label*="Technician"]',
        'select[aria-label*="ÙÙ†ÙŠ"]',
        'select[name*="technician"]',
        'select[id*="technician"]'
      ]);
      if (!techSelect) return false;

      if (targetName) {
        const opt = Array.from(techSelect.options).find(o => o.text.includes(targetName));
        if (opt) {
          techSelect.value = opt.value;
          techSelect.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }

      // Ø§Ø®ØªÙŠØ§Ø± Ø¹Ø´ÙˆØ§Ø¦ÙŠ (ØªØ®Ø·ÙŠ Ø§Ù„Ø®ÙŠØ§Ø± Ø§Ù„ÙØ§Ø±Øº Ø§Ù„Ø£ÙˆÙ„)
      const validOptions = Array.from(techSelect.options).slice(1).filter(o => o.value);
      if (validOptions.length > 0) {
        const randomOpt = validOptions[Math.floor(Math.random() * validOptions.length)];
        techSelect.value = randomOpt.value;
        techSelect.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'selectRandomTechnician error:', e);
    }
    return false;
  }

  // â”€â”€ Ù…Ø³Ø§Ø± Ø§Ù„ØªØ±ÙƒÙŠØ¨ ÙˆØ§Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ø³ØªÙ‚Ù„ (Ø¨Ø¯ÙˆÙ† Ù„Ù…Ø³ Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„/Ø§Ù„Ø¹Ø·Ù„/Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±) â”€â”€
  async function performInstallationAndCommissioning(data) {
    try { await sleep(1500); } catch(e) {}
    let filledService = false;

    const serviceLabelCandidates = ['Service Type', 'Report Type', 'Ù†ÙˆØ¹ Ø§Ù„Ø®Ø¯Ù…Ø©', 'Ù†ÙˆØ¹ Ø§Ù„Ø¨Ù„Ø§Øº', 'Service'];
    for (const lab of serviceLabelCandidates) {
      const labelEl = Array.from(document.querySelectorAll('label, .field-label, th'))
        .find(l => l.innerText && l.innerText.includes(lab));
      if (labelEl) {
        const target = labelEl.getAttribute('for') ? document.getElementById(labelEl.getAttribute('for')) :
          (labelEl.closest('tr')?.querySelector('td:nth-child(2) input, td:nth-child(2) select, td:nth-child(2)') || labelEl.nextElementSibling);
        if (target) {
          if (target.tagName === 'SELECT') {
            const opt = Array.from(target.options).find(o => /ØªØ±ÙƒÙŠØ¨|Installation|Installation and Commissioning|ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„/i.test(o.text));
            if (opt && target.value !== opt.value) {
              target.value = opt.value;
              try { target.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
              filledService = true;
              break;
            }
          } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            await emulateUserInput(target, 'ØªØ±ÙƒÙŠØ¨ ÙˆØªØ´ØºÙŠÙ„');
            filledService = true;
            break;
          } else {
            console.log(LOG_PREFIX, 'Service field is read-only, skipping direct write');
          }
        }
      }
    }

    // Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„ÙÙ†ÙŠ (Ø¹Ø´ÙˆØ§Ø¦ÙŠ Ø£Ùˆ Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª)
    const targetTech = data.technicianName || data.technician || null;
    await selectRandomTechnician(targetTech);

    // ØªØ¹Ø¨Ø¦Ø© Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¨Ø§Ù„Ù†Øµ Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠ
    const notesCandidates = ['Notes', 'Ù…Ù„Ø§Ø­Ø¸Ø§Øª', 'notes_support', 'notes'];
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

    // Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ Next/Save Ù…Ø¨Ø§Ø´Ø±Ø© Ø¨Ø¯ÙˆÙ† Ù„Ù…Ø³ Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„/Ø§Ù„Ø¹Ø·Ù„/Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±
    const nextBtn = Array.from(document.querySelectorAll('button')).find(b =>
      /Next|Ø§Ù„ØªØ§Ù„ÙŠ|Save|Ø­ÙØ¸|submit/i.test((b.innerText || b.value || b.title || '').trim()) &&
      b.offsetParent !== null && !/cancel|Ø¥Ù„ØºØ§Ø¡/i.test(b.className)
    );

    let saveOk = false;
    if (nextBtn) {
      const startUrl = location.href;
      safeClick(nextBtn, 'Next/Save button');
      saveOk = await waitForSaveComplete(startUrl, CFG, CFG.saveTimeoutMs);
    } else {
      console.warn(LOG_PREFIX, 'Next/Save button not found for Installation Flow');
    }

    try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('installation_done', { event: 'installation_done', saveOk }); } catch (_) {}

    return {
      report: {
        fieldResults: { 'ØªØ±ÙƒÙŠØ¨': { ok: filledService } },
        technician: { ok: true },
        notes: { ok: true },
        save: { ok: saveOk }
      },
      isFullyDone: saveOk
    };
  }

  // â”€â”€ Ù…Ø³Ø§Ø± Ø§Ù„ØµÙØ­Ø© 1 (Work Order Review) â”€â”€
  async function executePage1_Review(data) {
    const filled = await autoFillForm(data);

    // Ø­ÙØ¸ Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬ Ù„Ù„ØµÙØ­Ø© 2 â€” Ø¹Ø¨Ø± storage-proxy Ø§Ù„Ù…ÙˆØ­Ø¯ (fallback Ù„Ù„Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©)
    const pType = data.productType || data.reportType;
    if (pType) {
      try {
        if (typeof globalThis.storageSet === 'function') {
          await globalThis.storageSet({ autofiller_ProductType: pType });
        } else {
          // fallback Ø¢Ù…Ù†: Ù„Ùˆ Ù„Ù… ÙŠÙØ­Ù…ÙŽÙ‘Ù„ Ø§Ù„Ù€ proxy â†’ Ø±Ø³Ø§Ù„Ø© STORAGE_SET Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©
          await chrome.runtime.sendMessage({
            type: 'STORAGE_SET',
            data: { autofiller_ProductType: pType }
          });
        }
      } catch (_) {}
    }

    try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('page1_done', { event: 'page1_done', filled }); } catch (_) {}

    return {
      report: {
        fieldResults: { filled: { ok: filled > 0, count: filled } }
      },
      isFullyDone: filled > 0
    };
  }

  // â”€â”€ Helper: Ù‡Ù„ Ø§Ù„Ù€ subgrid ÙŠØ­ØªÙˆÙŠ ØµÙÙˆÙØ§Ù‹ Ù…ÙˆØ¬ÙˆØ¯Ø©ØŸ â”€â”€
  async function hasExistingSubgridRow(labelPattern) {
    try {
      const labels = Array.from(document.querySelectorAll('label, .subgrid-title, h3, h4, .entity-grid-title'))
        .filter(l => labelPattern.test(l.innerText));
      for (const label of labels) {
        const grid = label.closest('.subgrid, .entity-grid') || label.nextElementSibling;
        if (grid) {
          const rows = grid.querySelectorAll('tbody tr, [role="row"]');
          for (const row of rows) {
            if (row.offsetParent !== null && row.innerText.trim().length > 0 && !/norecords|Ù„Ø§ØªÙˆØ¬Ø¯|no records/i.test(row.innerText)) {
              return true;
            }
          }
        }
      }
    } catch (_) {}
    return false;
  }

  // â”€â”€ Helper: Ø¥Ø¶Ø§ÙØ© Ù…Ø´ÙƒÙ„Ø© Ù„Ù„Ù€ subgrid (ÙŠØ³ØªØ®Ø¯Ù… Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù‚ÙˆÙŠ Ø¹Ø¨Ø± autoFillForm) â”€â”€
  async function addProblemToSubgrid(problemCode, data) {
    console.log(LOG_PREFIX, 'addProblemToSubgrid called with:', problemCode);
    return { ok: false, reason: 'subgrid logic uses existing strong engine via autoFillForm' };
  }

  // â”€â”€ Ù…Ø³Ø§Ø± Ø§Ù„ØµÙØ­Ø© 2 (FollowUp) â”€â”€
  async function executePage2_FollowUp(data) {
    const FR = {};

    console.log(LOG_PREFIX, 'ã€ PAGE 2 ã€‘ Preparing FollowUp fields...');
    await sleep(1000);

    // ØªØ¹ÙŠÙŠÙ† Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø± Ø¥Ù„Ù‰ "Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±" (Ù…Ø¤ÙƒØ¯ Ø¹Ù„Ù‰ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„ Ø§Ù„Ø­ÙŠ)
    let sparePartsEl = findFirst([
      '#ats_sparepartsstatus',
      'select[aria-label*="Spare Parts"]',
      'select[aria-label*="Ù‚Ø·Ø¹ ØºÙŠØ§Ø±"]',
      'select[name*="sparepart"]'
    ]);

    if (sparePartsEl && sparePartsEl.tagName === 'SELECT') {
      const noneOpt = Array.from(sparePartsEl.options).find(o => /Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±/i.test(o.text));
      if (noneOpt) {
        sparePartsEl.value = noneOpt.value;
        try { sparePartsEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
        FR.spareParts = { ok: true, selected: noneOpt.text };
        console.log(LOG_PREFIX, 'âœ… Spare Parts set to:', noneOpt.text);
      } else {
        console.warn(LOG_PREFIX, 'âš ï¸ "Ø¨Ø¯ÙˆÙ† Ù‚Ø·Ø¹ ØºÙŠØ§Ø±" option not found in spare parts dropdown');
      }
    } else {
      console.log(LOG_PREFIX, 'Spare Parts field not found â€” skipping');
    }

    // Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†ØªØ¬ Ù…Ù† Ø§Ù„ØªØ®Ø²ÙŠÙ† â€” Ø¹Ø¨Ø± storage-proxy Ø§Ù„Ù…ÙˆØ­Ø¯ (fallback Ù„Ù„Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©)
    let deviceName = data.reportType || '';
    try {
      if (typeof globalThis.storageGet === 'function') {
        const stored = await globalThis.storageGet(['autofiller_ProductType']);
        deviceName = stored?.autofiller_ProductType || deviceName;
      } else {
        // fallback Ø¢Ù…Ù†: Ù„Ùˆ Ù„Ù… ÙŠÙØ­Ù…ÙŽÙ‘Ù„ Ø§Ù„Ù€ proxy â†’ Ø±Ø³Ø§Ù„Ø© STORAGE_GET Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø©
        const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: ['autofiller_ProductType'] });
        deviceName = resp?.data?.autofiller_ProductType || deviceName;
      }
    } catch (_) {}

    const isInstall = /ØªØ±ÙƒÙŠØ¨/.test(deviceName) || isInstallationReport();

    // Ù„Ù„Ù€ FollowUp: ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯ ØµÙÙˆÙ ÙÙŠ subgrid Ø§Ù„Ù…Ø´Ø§ÙƒÙ„ Ø£ÙˆÙ„Ø§Ù‹
    const existingProblem = await hasExistingSubgridRow(/Ø§Ù„Ù…Ø´Ø§ÙƒÙ„\s*Ø§Ù„ÙØ¹Ù„ÙŠ[Ø©Ù‡]|Actual.*Problems/i);
    if (existingProblem) {
      console.log(LOG_PREFIX, 'âœ… Problem subgrid already has a row â€” skipping problem addition');
      FR.problem = { ok: true, selected: '(Ù…ÙˆØ¬ÙˆØ¯ Ù…Ø³Ø¨Ù‚Ø§Ù‹)' };
    } else {
      // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ØµØ­Ø© problemCode Ø§Ù„Ù…Ø¯Ø®Ù„
      let userProbCode = data.problemCode || '';
      if (userProbCode && !/^\*?\w{2}\d{2}$|^\*?ØªØ±ÙƒÙŠØ¨$|Premium.*Care/i.test(userProbCode)) {
        console.warn(LOG_PREFIX, 'âš ï¸ Invalid problemCode in data line:', userProbCode, 'â€” ignoring');
        userProbCode = '';
      }

      if (userProbCode) {
        FR.problem = await addProblemToSubgrid(userProbCode, data);
      } else {
        FR.problem = { ok: false, reason: 'no valid problemCode' };
      }
    }

    // ØªØ¹Ø¨Ø¦Ø© Ø§Ù„ÙÙ†ÙŠ Ø¥Ø°Ø§ ÙˆÙØ¬Ø¯
    if (data.technicianName || data.technician) {
      FR.technician = await selectRandomTechnician(data.technicianName || data.technician);
    }

    // ØªØ¹Ø¨Ø¦Ø© Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª
    const notesCandidates = ['Notes', 'Ù…Ù„Ø§Ø­Ø¸Ø§Øª', 'notes_support', 'notes'];
    for (const nlab of notesCandidates) {
      const notesEl = Array.from(document.querySelectorAll('textarea, input')).find(el => {
        const lab = document.querySelector(`label[for="${el.id}"]`) || el.closest('.field');
        return lab && (lab.innerText || '').includes(nlab);
      });
      if (notesEl) {
        const noteText = data.notes || 'Ù…ØªØ§Ø¨Ø¹Ø© ØµÙŠØ§Ù†Ø©';
        await emulateUserInput(notesEl, noteText);
        FR.notes = { ok: true };
        break;
      }
    }

    // Ø§Ù„Ø¶ØºØ· Ø¹Ù„Ù‰ Next/Save
    const nextBtn = findFirst([
      '#NextButton', 'button[aria-label="Next"]', 'button[aria-label="Ø§Ù„ØªØ§Ù„ÙŠ"]',
      'input[type="button"][value="Next"]', 'input[type="button"][value="Ø§Ù„ØªØ§Ù„ÙŠ"]',
      'button[type="submit"]'
    ]);

    let saveOk = false;
    if (nextBtn) {
      const startUrl = location.href;
      safeClick(nextBtn, 'Next/Save button');
      saveOk = await waitForSaveComplete(startUrl, CFG, CFG.saveTimeoutMs);
    }

    try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('page2_done', { event: 'page2_done', saveOk }); } catch (_) {}

    return {
      report: { ...FR, save: { ok: saveOk } },
      isFullyDone: saveOk
    };
  }

  // â”€â”€ Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© Ù„Ù„Ù€ Router â”€â”€
  async function runSingleLineWithRouter(data) {
    const pageType = getPageType();

    try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('router_start', { event: 'router_start', pageType }); } catch (_) {}
    console.log(LOG_PREFIX, 'Router: pageType =', pageType, '| isInstallation =', isInstallationReport());

    // Ø¨Ù„Ø§ØºØ§Øª Ø§Ù„ØªØ±ÙƒÙŠØ¨ Ù„Ù‡Ø§ Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ© Ø§Ù„Ù‚ØµÙˆÙ‰
    if (isInstallationReport()) {
      console.log(LOG_PREFIX, 'ã€ INSTALLATION DETECTED ã€‘ Executing Installation & Commissioning flow');
      return await performInstallationAndCommissioning(data);
    }

    if (pageType === 'WORK_ORDER_REVIEW') {
      console.log(LOG_PREFIX, 'ã€ PAGE 1 ã€‘ Executing Work Order Review flow');
      return await executePage1_Review(data);
    }

    if (pageType === 'FOLLOWUP') {
      console.log(LOG_PREFIX, 'ã€ PAGE 2 ã€‘ Executing FollowUp flow');
      return await executePage2_FollowUp(data);
    }

    if (pageType === 'ORDERS') {
      console.warn(LOG_PREFIX, 'âš ï¸ ORDERS page detected â€” auto-fill not supported on list view');
      return { report: {}, isFullyDone: false, error: 'Auto-fill not supported on Orders list page' };
    }

    console.error(LOG_PREFIX, 'Unsupported page type:', pageType);
    return { report: {}, isFullyDone: false, error: 'ØµÙØ­Ø© ØºÙŠØ± Ù…Ø¯Ø¹ÙˆÙ…Ø©: ' + pageType };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PHASE 4 â€” LOOKUP HANDLER Ø§Ù„Ù…ÙˆØ­Ø¯ (Ù…Ù† V2 â€” Ù…Ø­Ø³Ù‘Ù†)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ fillPowerAppsLookup: Ù…Ø¹Ø§Ù„Ø¬ lookup Ù…ÙˆØ­Ø¯ (Ù…Ù† V2 + Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ Ø§Ù„Ù‚ÙˆÙŠ Ø§Ù„Ù‚Ø§Ø¦Ù…) â”€â”€
  // Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ù‚ÙÙˆÙ„Ø© (readonly / .lookup / ØºÙŠØ± INPUT) â†’ Ø²Ø± Ø§Ù„Ù€ lookup Ø§Ù„Ù‚Ø±ÙŠØ¨ â†’ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ Ù…Ø¨Ø§Ø´Ø±Ø©.
  // Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ÙƒØªØ§Ø¨Ø© â†’ autocomplete dropdown Ø£ÙˆÙ„Ø§Ù‹ (Ù†ÙØ³ V2)ØŒ ÙˆØ¥Ù† Ù„Ù… ÙŠÙØ¹ØªÙ…Ø¯
  // Ø§Ù„Ø§Ø®ØªÙŠØ§Ø± (Ù„Ø§ Clear Button) â†’ Ø²Ø± Ø§Ù„Ù€ lookup Ø§Ù„Ù‚Ø±ÙŠØ¨ â†’ fillLookupModal Ø§Ù„Ù‚Ø§Ø¦Ù….
  // Ø§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ Ø¹Ø¨Ø± createLookupVerifier (Clear Button = Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ù‚ÙŠÙ…Ø© Ù…Ù† PowerApps).
  // ØªØ±Ø¬Ø¹ { ok, method, verified, selected } â€” Ù…ØªÙˆØ§ÙÙ‚Ø© Ù…Ø¹ fillAndVerify.
  // Ù„Ø§ ÙŠÙÙƒØ±ÙŽÙ‘Ø± Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ Ù‡Ù†Ø§ â€” ÙŠÙØ³ØªØ¯Ø¹Ù‰ fillLookupModal Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯ (Ø§Ù„Ø¬Ø°Ø± = document
  // Ù„Ø£Ù† Ù…ÙˆØ¯Ø§Ù„Ø§Øª PowerApps ØªÙÙØªØ­ ÙÙŠ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ Ùˆ collectAllDocs ÙŠØºØ·ÙŠ iframes).
  async function fillPowerAppsLookup(inputEl, labelText, value, cfgBtnSelectors) {
    if (!inputEl || !value) return { ok: false, reason: 'no-input-or-value' };

    // Ø§Ù„ØªØ­Ù‚Ù‚ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ: Clear Button Ø¹Ù„Ù‰ Ø§Ù„Ø­Ù‚Ù„ (Ù…Ù† createLookupVerifier Ø§Ù„Ù‚Ø§Ø¦Ù… â€” PHASE 2.2)
    const verifier = createLookupVerifier(() => inputEl);
    const isLocked = inputEl.hasAttribute('readonly') || inputEl.classList.contains('lookup') || inputEl.tagName !== 'INPUT';

    // Ø§Ù„Ù…Ø³Ø§Ø± 1 â€” Ø­Ù‚Ù„ Ù…Ù‚ÙÙˆÙ„: Ø²Ø± Ø§Ù„Ù€ lookup Ø§Ù„Ù‚Ø±ÙŠØ¨ â†’ Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„ Ø§Ù„Ù‚ÙˆÙŠ
    if (isLocked) {
      const btn = findSafeLookupButton(inputEl, cfgBtnSelectors);
      if (!btn) return { ok: false, method: 'modal', verified: false, reason: 'lookup-button-not-found' };
      const res = await fillLookupModal(btn, value, document);
      if (!res.ok) return { ok: false, method: 'modal', verified: false, ...res };
      return { ok: true, method: 'modal', verified: await verifier(), selected: res.selected };
    }

    // Ø§Ù„Ù…Ø³Ø§Ø± 2 â€” Ø­Ù‚Ù„ Ù‚Ø§Ø¨Ù„ Ù„Ù„ÙƒØªØ§Ø¨Ø©: autocomplete dropdown Ø£ÙˆÙ„Ø§Ù‹ (Ù†ÙØ³ V2ØŒ Ø¹Ø¨Ø± ÙƒÙ„ Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª)
    console.log(LOG_PREFIX, 'fillPowerAppsLookup [' + (labelText || '?') + '] â†’ typing:', value);
    await emulateUserInput(inputEl, value);
    await sleep(1500);
    const dropdownSelectors = ['[role="option"]', '[role="listbox"] li', '.autocomplete-suggestions li', '.entitylist-items li'];
    let picked = null;
    for (const doc of collectAllDocs(document)) {
      if (!doc || picked) continue;
      for (const sel of dropdownSelectors) {
        let items;
        try { items = Array.from(doc.querySelectorAll(sel)).filter(i => i.offsetParent !== null && i.innerText.trim().length > 0); } catch (_) { continue; }
        if (!items.length) continue;
        picked = items.find(i => (i.textContent || '').toLowerCase().includes(value.toLowerCase())) || items[0];
        safeClick(picked, 'autocomplete item');
        break;
      }
    }
    if (picked) {
      await sleep(400);
      if (await verifier()) return { ok: true, method: 'dropdown', verified: true, selected: picked.innerText?.trim() };
      // Ù„Ø§ Clear Button Ø¨Ø¹Ø¯ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù€ dropdown â†’ Ù†ÙƒÙ…Ù„ Ù„Ù„Ù…ÙˆØ¯Ø§Ù„ (Ø¥Ø¹Ø§Ø¯Ø© Ù…Ø­Ø§ÙˆÙ„Ø© Ø£Ù‚ÙˆÙ‰)
    }

    // Ø§Ù„Ù…Ø³Ø§Ø± 3 â€” Ø²Ø± Ø§Ù„Ù€ lookup Ø§Ù„Ù‚Ø±ÙŠØ¨ â†’ fillLookupModal Ø§Ù„Ù‚ÙˆÙŠ Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯ (Ù„Ø§ Ù†ÙƒØ±Ø± Ø§Ù„Ù…Ø­Ø±Ùƒ)
    const btn = findSafeLookupButton(inputEl, cfgBtnSelectors);
    if (btn) {
      const res = await fillLookupModal(btn, value, document);
      if (res.ok) return { ok: true, method: 'modal', verified: await verifier(), selected: res.selected };
      return { ok: false, method: 'modal', verified: false, ...res };
    }

    // Ø§Ù„Ù…Ø³Ø§Ø± Ø§Ù„Ø£Ø®ÙŠØ± â€” Ù„Ø§ dropdown ÙˆÙ„Ø§ Ø²Ø± lookup: Ø§Ù„Ù‚ÙŠÙ…Ø© ÙƒÙØªØ¨Øª Ù„ÙƒÙ†Ù‡Ø§ ØºÙŠØ± Ù…Ø¹ØªÙ…Ø¯Ø©
    return { ok: readFieldValue(inputEl).length > 0, method: 'direct', verified: await verifier(), reason: 'no-dropdown-no-lookup-button' };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MESSAGE HANDLERS â€” Ù…ÙˆØ¬Ù‡Ø© Ø¹Ø¨Ø± Ø§Ù„Ù€ Router
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Listen for injection messages â”€â”€
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.action === 'injectData') {
      runSingleLineWithRouter(msg.data).then(res => {
        if (res.isFullyDone) {
          showPageToast('âœ… ØªÙ… Ø§Ù„Ø­Ù‚Ù† Ø¨Ù†Ø¬Ø§Ø­ (' + (res.report?.fieldResults?.filled?.count || 'ØªØ±ÙƒÙŠØ¨') + ')', 'success');
          respond({ status: 'success', ...res });
        } else if (res.filled > 0 || res.report?.fieldResults?.filled?.ok) {
          showPageToast('âœ… ØªÙ… Ø­Ù‚Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª', 'success');
          respond({ status: 'success', ...res });
        } else {
          showPageToast('âš ï¸ ' + (res.error || 'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ù‚ÙˆÙ„ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©'), 'warn');
          respond({ status: 'error', message: res.error || 'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ù‚ÙˆÙ„ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©' });
        }
      }).catch(err => {
        showPageToast('âŒ ' + (err?.message || 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø­Ù‚Ù†'), 'error');
        respond({ status: 'error', message: err?.message || String(err) });
      });
      return true;
    }

    if (msg.action === 'injectCart') {
      // Ù„Ø­Ù‚Ù† Ø§Ù„Ø³Ù„Ø©: Ù…Ø¹Ø§Ù„Ø¬Ø© ÙƒÙ„ Ø¹Ù†ØµØ± Ø¹Ø¨Ø± Ø§Ù„Ù€ Router Ø¨Ø§Ù„ØªØ³Ù„Ø³Ù„
      const items = msg.items || [];
      (async () => {
        let totalFilled = 0;
        let totalErrors = 0;
        for (const item of items) {
          try {
            const res = await runSingleLineWithRouter(item);
            if (res.isFullyDone || res.filled > 0) totalFilled++;
            else totalErrors++;
            if (items.length > 1) await sleep(1500);
          } catch (err) {
            console.error(LOG_PREFIX, 'injectCart item error:', err);
            try { if (typeof globalThis.logEvent === 'function') globalThis.logEvent('inject_cart_error', { event: 'inject_cart_error', error: err.message }); } catch (_) {}
            totalErrors++;
          }
        }
        if (totalErrors > 0) showPageToast('âš ï¸ ØªÙ… Ø­Ù‚Ù† ' + totalFilled + '/' + items.length + ' â€” ÙØ´Ù„ ' + totalErrors, 'warn');
        else showPageToast('âœ… ØªÙ… Ø­Ù‚Ù† ' + totalFilled + ' Ù‚Ø·Ø¹ ÙÙŠ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„', 'success');
        respond({ status: 'success', filled: totalFilled, errors: totalErrors, total: items.length });
      })();
      return true;
    }
  });

  // â”€â”€ Expose to other content scripts â”€â”€
  globalThis.AutoFiller = {
    autoFillForm,
    findInputForField,
    findTargetDoc,
    setField,
    fillLookupModal,
    collectAllDocs,
    fillAndVerify,
    fillAndVerifyProtected,
    injectMultiple,
    // Phase 1: Router functions
    getPageType,
    isInstallationReport,
    selectRandomTechnician,
    performInstallationAndCommissioning,
    executePage1_Review,
    executePage2_FollowUp,
    hasExistingSubgridRow,
    addProblemToSubgrid,
    runSingleLineWithRouter,
    // Phase 2: Resilience functions
    waitForSaveComplete,
    createLookupVerifier,
    detectManualAdditions,
    scrapeFullOrderDetails,
    // Phase 3: Field Finding & Order Intelligence
    findFieldByLabel,
    readDeviceTypeFromPage,
    readComplaintCodeFromPage,
    // Phase 4: Unified Lookup Handler
    fillPowerAppsLookup
  };

  console.log(LOG_PREFIX, 'âœ… ØªÙ… ØªØ­Ù…ÙŠÙ„ Ù…Ø­Ø±Ùƒ Ø§Ù„ØªØ¹Ø¨Ø¦Ø© Ø§Ù„Ù‚ÙˆÙŠ (strong merge) Ù…Ø¹ Router Ø°ÙƒÙŠ ÙˆResilience Ø¨Ù†Ø¬Ø§Ø­');

})();