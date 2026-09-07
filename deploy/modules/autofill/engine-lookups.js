// ============================================================================
// AutoFill Engine — Lookups & Modal Interaction Subsystem
// File: modules/autofill/engine-lookups.js
// Responsibilities:
// - PowerApps lookup modal automation
// - Iframe traversal and nested modal document collection
// - Subgrid iframe modal handling (problems, technicians, defect codes)
// - Deterministic matching (strictExact support for P0-B.1)
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Lookups]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Lookups]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }

  function findSafeLookupButton(input, extraSelectors = []) {
    if (typeof window.findSafeLookupButton === 'function' && window.findSafeLookupButton !== findSafeLookupButton) {
      return window.findSafeLookupButton(input, extraSelectors);
    }
    if (!input) return null;
    const parent = input.closest('.input-group') || input.parentElement;
    if (parent) {
      const btn = parent.querySelector('button.launchentitylookup, button.lookup-btn, .input-group-btn button, button[aria-label*="بحث"], button[aria-label*="Search"]');
      if (btn) return btn;
    }
    for (const sel of extraSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function dispatchClickSequence(el) {
    if (!el) return false;
    try { el.focus(); } catch(_) {}
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
      } catch(_) {}
    }
    return true;
  }

  async function waitForModalCloseIfOpen() {
    const openModals = () => Array.from(document.querySelectorAll('.modal.show, .modal.in, div[role="dialog"][style*="display: block"]'))
      .filter(m => m.offsetParent !== null && !m.classList.contains('fade'));
    if (openModals().length === 0) return true;
    log('Waiting for open modal to close before clicking...');
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const active = openModals();
      if (active.length === 0) { log('Prior modal closed.'); return true; }
      const closeBtn = active[0].querySelector('[data-dismiss="modal"], .modal-header .close, button[aria-label="Close"], button[aria-label="إغلاق"]');
      if (closeBtn && Date.now() - start > 3000) {
        log('Attempting to dismiss lingering modal...');
        closeBtn.click();
      }
      await sleep(400);
    }
    warn('Prior modal did not close within timeout, proceeding anyway.');
    return false;
  }

  async function waitForModalIframe(modal, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const iframe = modal.querySelector('iframe');
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
            const hasContent = doc.body && doc.body.children.length > 0;
            if (hasContent) return doc;
          }
        } catch (_) {}
      }
      await sleep(300);
    }
    return null;
  }

  async function fillLookupModal(btn, searchValue, rootDoc, opts = {}) {
    if (!btn || !searchValue) return { ok: false };
    if (!rootDoc) rootDoc = document;
    const clearBtn = btn.parentElement?.querySelector('button[aria-label*="Clear"], button[aria-label*="مسح"]');
    if (clearBtn && clearBtn.offsetParent !== null) {
      clearBtn.click();
      await sleep(400);
    }
    btn.click();
    await sleep(700);

    let modal = null;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      modal = rootDoc.querySelector('.modal.show, .modal.in, div[role="dialog"]');
      if (modal && modal.offsetParent !== null) break;
      modal = null;
      await sleep(300);
    }
    if (!modal) {
      warn('Lookup modal did not open for:', searchValue);
      return { ok: false, reason: 'modal-not-found' };
    }

    const searchInput = modal.querySelector('input.form-control[type="text"], input[aria-label*="Search"], input[placeholder*="Search"], input[placeholder*="بحث"]');
    if (searchInput) {
      if (typeof window.emulateUserInput === 'function') {
        await window.emulateUserInput(searchInput, searchValue);
      } else {
        searchInput.focus();
        searchInput.value = searchValue;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await sleep(300);
      const searchBtn = modal.querySelector('button[aria-label*="Search"], button[aria-label*="بحث"], .input-group-btn button');
      if (searchBtn) {
        searchBtn.click();
      } else {
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
      await sleep(1500);
    }

    const waitStart = Date.now();
    let rows = [];
    while (Date.now() - waitStart < 8000) {
      rows = Array.from(modal.querySelectorAll('table tbody tr, [role="row"], .entity-grid tr:not(:first-child)'))
        .filter(r => r.offsetParent !== null && r.innerText.trim() && !/no\s*records|لا\s*توجد/i.test(r.innerText));
      if (rows.length > 0) break;
      await sleep(400);
    }

    if (rows.length === 0) {
      warn('No results found in lookup modal for:', searchValue);
      const closeBtn = modal.querySelector('[data-dismiss="modal"], button.close, button[aria-label="Close"], button[aria-label="إغلاق"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'no-results' };
    }

    const normalize = s => (s || '').replace(/[\s\-_/\()]/g, '').toLowerCase();
    const target = normalize(searchValue);

    const getRowCode = row => {
      const cells = row.querySelectorAll('td');
      for (const cell of cells) {
        const text = cell.innerText.trim();
        if (text && !cell.querySelector('input[type="checkbox"], input[type="radio"]')) return text;
      }
      return row.innerText.trim();
    };

    const exactMatch = rows.find(i => normalize(getRowCode(i)) === target);
    const startsMatch = !exactMatch ? rows.find(i => normalize(getRowCode(i)).startsWith(target)) : null;
    const includesMatch = (!exactMatch && !startsMatch) ? rows.find(i => {
      const code = normalize(getRowCode(i));
      return code.includes(target) || target.includes(code);
    }) : null;

    let match = exactMatch || startsMatch || includesMatch || null;
    if (opts && opts.strictExact) {
      // P0-B.1: deterministic mode (technician) — accept ONLY exact matches, never starts-with/includes/first-row.
      match = exactMatch || null;
      log(`Strict deterministic pick — exactMatch only: ${!!exactMatch}`);
      if (!match) return { ok: false, reason: 'no-exact-match' };
    }
    log(`Model pick — exact:${!!exactMatch} starts:${!!startsMatch} includes:${!!includesMatch} → "${match?.innerText?.trim().slice(0,60)}"`);
    if (!match) return { ok: false, reason: 'no-match' };

    const radio = match.querySelector('input[type="radio"], input[type="checkbox"]');
    if (radio) {
      await dispatchClickSequence(radio);
    } else {
      await dispatchClickSequence(match);
    }
    await sleep(400);

    const selectBtn = Array.from(modal.querySelectorAll('button, input[type="button"]'))
      .find(b => b.offsetParent !== null && /اختر|select/i.test((b.innerText || b.value || '').trim()) && !b.hasAttribute('disabled'));
    if (selectBtn) {
      await dispatchClickSequence(selectBtn);
      log('Clicked lookup Select/اختر button');
    } else {
      const primaryBtn = modal.querySelector('.modal-footer button.btn-primary, button.primary');
      if (primaryBtn) await dispatchClickSequence(primaryBtn);
    }

    const closeDeadline = Date.now() + 6000;
    while (Date.now() < closeDeadline) {
      if (modal.offsetParent === null || !document.body.contains(modal)) break;
      await sleep(300);
    }
    await sleep(400);
    return { ok: true, selected: match.innerText.trim() };
  }

  async function handlePage2Modal(btnRegex, searchValue, opts = {}) {
    await waitForModalCloseIfOpen();

    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => b.offsetParent !== null)
      .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) {
      warn(`handlePage2Modal: Add button not found matching ${btnRegex}`);
      return { ok: false, reason: 'add-btn-not-found' };
    }

    log(`Clicking add button: "${(addBtn.innerText || addBtn.title || addBtn.value || '').trim().slice(0,30)}"`);
    addBtn.click();
    await sleep(1000);

    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      modal = document.querySelector('.modal.show, .modal.in, div[role="dialog"]');
      if (modal && modal.offsetParent !== null) break;
      modal = null;
      await sleep(400);
    }
    if (!modal) {
      warn('handlePage2Modal: Outer modal did not appear');
      return { ok: false, reason: 'outer-modal-not-found' };
    }

    const iframeDoc = await waitForModalIframe(modal, 12000);
    if (!iframeDoc) {
      warn('handlePage2Modal: Iframe inside modal did not load');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'iframe-not-loaded' };
    }

    await sleep(600);
    const lookupBtn = iframeDoc.querySelector('button.launchentitylookup, button.lookup-btn, .input-group-btn button');
    if (!lookupBtn) {
      warn('handlePage2Modal: Lookup button not found inside iframe');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'lookup-btn-not-found' };
    }
    await sleep(1500);

    const result = await fillLookupModal(lookupBtn, searchValue, document, opts);
    if (!result || !result.ok) {
      warn(`handlePage2Modal: Lookup failed: ${result?.reason || 'unknown'}`);
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return result;
    }

    await sleep(1000);
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      log('Clicking Save/Submit inside iframe modal');
      saveBtn.click();
      const saveDeadline = Date.now() + 10000;
      while (Date.now() < saveDeadline) {
        if (modal.offsetParent === null || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(1000);
      return { ok: true, selected: result.selected };
    } else {
      warn('handlePage2Modal: Save button not found inside iframe modal');
      return { ok: false, reason: 'save-btn-not-found' };
    }
  }

  async function fillPowerAppsLookup(inputSelector, searchValue, opts = {}) {
    if (!inputSelector || !searchValue) return { ok: false };
    const input = document.querySelector(inputSelector);
    if (!input) {
      warn(`fillPowerAppsLookup: input ${inputSelector} not found`);
      return { ok: false, reason: 'input-not-found' };
    }
    const lookupBtn = findSafeLookupButton(input);
    if (!lookupBtn) {
      warn(`fillPowerAppsLookup: lookup button for ${inputSelector} not found`);
      return { ok: false, reason: 'lookup-btn-not-found' };
    }
    return await fillLookupModal(lookupBtn, searchValue, document, opts);
  }

  async function waitForModalStable(timeoutMs = 5000) {
    const start = Date.now();
    let prevHeight = 0;
    let stableCount = 0;
    while (Date.now() - start < timeoutMs) {
      const modal = document.querySelector('.modal.show, .modal.in, div[role="dialog"]');
      if (!modal) { await sleep(200); continue; }
      const h = modal.offsetHeight;
      if (h > 0 && h === prevHeight) {
        stableCount++;
        if (stableCount >= 2) return modal;
      } else {
        stableCount = 0;
        prevHeight = h;
      }
      await sleep(250);
    }
    return document.querySelector('.modal.show, .modal.in, div[role="dialog"]');
  }

  async function handleSubgridIframeModal(btnRegex, targetName, pickRandomIfTargetMissing = true, excludePattern = null, priorityPattern = null) {
    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => b.offsetParent !== null)
      .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) return null;

    log(`Opening subgrid modal for: ${btnRegex.source}...`);
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
      
      function collectDocs(root) {
        const docs = [root];
        root.querySelectorAll('iframe').forEach(f => {
          try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(_) {}
        });
        return docs;
      }
      function getRowsFromDocs(docs) {
        const results = [];
        docs.forEach(doc => {
          if (!doc) return;
          const rws = doc.querySelectorAll('table tbody tr, div[role="grid"] tr, table tr:not(:first-child)');
          rws.forEach(r => {
            if (r.offsetParent !== null && r.innerText.trim() && !/norecords|لا توجد/i.test(r.innerText.replace(/\s/g,''))) results.push(r);
          });
        });
        return results;
      }
      const allDocs = [...new Set([...collectDocs(iframeDoc), ...collectDocs(document)])];
      
      let items = [];
      for (let attempt = 0; attempt < 3 && items.length === 0; attempt++) {
        if (attempt > 0) { log(`Retry #${attempt}: clicking magnifying glass...`); await sleep(1500); }
        try { lookupBtn.focus(); } catch(_) {}
        lookupBtn.click();
        try { lookupBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch(_) {}
        
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
        let priorityMatch = null;
        if (priorityPattern) {
          priorityMatch = items.find(i => priorityPattern.test(i.innerText));
          if (priorityMatch) log('Priority match found: "' + priorityMatch.innerText.trim().slice(0,60) + '"');
        }

        let exactMatch = priorityMatch;
        if (!exactMatch && cleanTarget) {
          if (/تركيب/.test(cleanTarget)) {
            exactMatch = items.find(i => /تركيب وتشغيل/i.test(i.innerText)) || items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
          } else {
            exactMatch = items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
          }
        }
        
        const rand = exactMatch || (pickRandomIfTargetMissing ? items[Math.floor(Math.random() * items.length)] : null);
        
        if (!rand) {
          log('No match for "' + cleanTarget + '" in ' + items.length + ' items — skipping');
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
          try { selBtn.focus(); } catch(_) {}
          selBtn.click();
          try { selBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(_) {}
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
        if (rand) { selectEl.value = rand.value; selectedName = rand.text; try { selectEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
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

  // Export to namespace and global scope for 100% backward compatibility
  const Lookups = {
    findSafeLookupButton,
    dispatchClickSequence,
    waitForModalCloseIfOpen,
    waitForModalIframe,
    fillLookupModal,
    handlePage2Modal,
    fillPowerAppsLookup,
    waitForModalStable,
    handleSubgridIframeModal
  };

  window.AutoFillEngine.Lookups = Lookups;
  Object.assign(window, Lookups);

})(window);
