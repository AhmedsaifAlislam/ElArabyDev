// ============================================================================
// AutoFill Engine — Page 3 Resolution, Spare Parts & Fault Codes Subsystem
// File: modules/autofill/engine-page3.js
// Responsibilities:
// - Defect / Fault codes subgrid interaction (addFaultCodePage3)
// - Spare parts table scraping & comments formatting
// - Multi-document modal traversal
// - Periodic maintenance (صيانة دورية AC001 + AC004 + Shahn AC003)
// - Page 3 resolution execution
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Page3]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Page3]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }
  function storageGet(q) { return (typeof window.storageGet === 'function') ? window.storageGet(q) : chrome.storage.local.get(q); }

  function collectAllDocs(root) {
    const docs = [root];
    root.querySelectorAll('iframe').forEach(f => {
      try {
        const d = f.contentDocument || f.contentWindow?.document;
        if (d) docs.push(...collectAllDocs(d));
      } catch(_) {}
    });
    return docs;
  }

  function formatMoney(val) {
    const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function readIsLscFromPage() {
    const el = document.getElementById('ldv_islsc') || document.querySelector('[name*="islsc"]');
    if (el) {
      if (el.tagName === 'SELECT') {
        const text = el.options[el.selectedIndex]?.text || '';
        return /نعم|yes|1/i.test(text);
      }
      return /نعم|yes|1/i.test(el.value || '');
    }
    return false;
  }

  function findCommentField() {
    const selectors = [
      '#ldv_resourcelastcomment',
      'textarea[name*="resourcelastcomment"]',
      'textarea[id*="comment"]',
      'textarea[name*="comment"]',
      '#ats_notes',
      'textarea[name*="notes"]'
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  async function waitForSparePartsGrid(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const grid = document.getElementById('InventoryAdjustmentProduct_SubGrid') ||
                   document.getElementById('InventoryAdjustmentProduct_Subgrid') ||
                   document.getElementById('InventoryAdjustmentProductIsLscYes_Subgrid') ||
                   document.querySelector('.subgrid[data-name*="Inventory"]');
      if (grid) {
        const rows = grid.querySelectorAll('table tbody tr');
        if (rows.length > 0) return grid;
      }
      await sleep(500);
    }
    return null;
  }

  function extractSparePartRows(grid) {
    if (!grid) return [];
    const rows = Array.from(grid.querySelectorAll('table tbody tr'))
      .filter(r => r.offsetParent !== null && r.innerText.trim() && !/no\s*records|لا\s*توجد/i.test(r.innerText));
    return rows.map(r => {
      const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
      return { row: r, cells, text: cells.join(' | ') };
    });
  }

  function readSparePartsTotalFromField() {
    const el = document.getElementById('ldv_originaltotalusedsparepartscost') ||
               document.querySelector('[name*="originaltotalusedsparepartscost"]');
    if (el) {
      const val = parseFloat((el.value || el.innerText || '0').replace(/[^0-9.]/g, ''));
      return isNaN(val) ? 0 : val;
    }
    return 0;
  }

  async function readCollectedAmount() {
    const el = document.getElementById('ldv_actualcollectedamount') ||
               document.querySelector('[name*="actualcollectedamount"]');
    if (el) {
      const val = parseFloat((el.value || el.innerText || '0').replace(/[^0-9.]/g, ''));
      return isNaN(val) ? 0 : val;
    }
    return 0;
  }

  async function handleSparePartsComment(notes) {
    const grid = await waitForSparePartsGrid(4000);
    const parts = extractSparePartRows(grid);
    log(`Found ${parts.length} spare part rows in subgrid`);
    const commentField = findCommentField();
    if (!commentField) {
      log('No comment field found on page');
      return { ok: false, reason: 'no-comment-field' };
    }
    let comment = notes || '';
    if (parts.length > 0) {
      const totalParts = readSparePartsTotalFromField();
      const collected = await readCollectedAmount();
      comment = `قطع الغيار: ${parts.length} قطعة | الإجمالي: ${formatMoney(totalParts)} | المحصل: ${formatMoney(collected)} ${notes ? '| ' + notes : ''}`.trim();
    }
    if (comment) {
      commentField.value = comment;
      try { commentField.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { commentField.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      log('Comment field updated: ' + comment);
      return { ok: true, comment };
    }
    return { ok: true, comment: '' };
  }

  async function addFaultCodePage3(code, subCode, flags = []) {
    let mainSearch = '';
    let subSearch = '';

    if (code && typeof code === 'object') {
      mainSearch = (code.majorCode || code.majorName || code.fullCode || '').trim();
      subSearch = (code.defectCode || code.subCode || code.fullCode || '').trim();
    } else {
      mainSearch = (code || '').trim();
      subSearch = (subCode || '').trim();
    }

    log(`Adding Fault Code: main="${mainSearch}", sub="${subSearch || 'N/A'}"...`);
    
    // Check if fault code already exists in subgrid
    const existingGrids = ['WorkOrder_defect', 'WorkOrderDefectIsLscYes_Subgrid'];
    for (const gid of existingGrids) {
      const g = document.getElementById(gid);
      if (g) {
        const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => {
          const txt = (r.innerText || '').toLowerCase();
          if (subSearch && txt.includes(subSearch.toLowerCase())) return true;
          if (mainSearch && txt.includes(mainSearch.toLowerCase())) return true;
          return false;
        });
        if (rows.length > 0) {
          log(`Fault code ${subSearch || mainSearch} already present in ${gid} — skipping`);
          return { ok: true, name: subSearch || mainSearch, alreadyExists: true };
        }
      }
    }

    // Find add button for defect code (visible only)
    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => {
        try {
          if (b.offsetParent === null) return false;
          const s = window.getComputedStyle(b);
          return s.display !== 'none' && s.visibility !== 'hidden';
        } catch(_) { return false; }
      })
      .find(b => /[اإأ]ضاف[ةه]\s*كود\s*عطل|Add.*Defect/i.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) {
      warn('Add Defect Code button not found');
      return { ok: false, reason: 'add-btn-not-found' };
    }

    addBtn.click();
    await sleep(1500);

    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const modals = Array.from(document.querySelectorAll('.modal.modal-form-insert, .modal.in, .modal.show, section.modal, div[role="dialog"]'));
      modal = modals.find(m => (m.classList.contains('in') || m.classList.contains('show') || m.offsetParent !== null) && m.querySelector('iframe'));
      if (modal) break;
      await sleep(400);
    }
    if (!modal) {
      warn('Defect Code modal did not open');
      return { ok: false, reason: 'modal-not-found' };
    }

    const iframeDoc = await window.AutoFillEngine.Lookups.waitForModalIframe(modal, 12000);
    if (!iframeDoc) {
      warn('Defect Code iframe did not load');
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'iframe-not-found' };
    }

    await sleep(800);

    // 1. كود العطل الرئيسي
    const lookupBtns = Array.from(iframeDoc.querySelectorAll('button.launchentitylookup')).filter(b => b.offsetParent !== null);
    const mainBtn = lookupBtns.find(b => (b.getAttribute('aria-label') || '').includes('الرئيسي')) ||
                    iframeDoc.querySelector('#ats_modeldefectmajor_name')?.parentElement?.querySelector('button.launchentitylookup') ||
                    lookupBtns[0];

    if (!mainBtn) {
      warn('Main defect Lookup button not found in defect iframe');
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'lookup-btn-not-found' };
    }

    const lookupRes1 = await window.AutoFillEngine.Lookups.fillLookupModal(mainBtn, mainSearch, document, { strictExact: false });
    if (!lookupRes1 || !lookupRes1.ok) {
      warn('Lookup failed for major fault code: ' + mainSearch);
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return lookupRes1;
    }

    // انتظار التحديث المتتالي
    await sleep(2000);

    // 2. كود العطل الفرعي (لو محدد)
    if (subSearch) {
      const curBtns = Array.from(iframeDoc.querySelectorAll('button.launchentitylookup')).filter(b => b.offsetParent !== null);
      const subBtn = curBtns.find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return aria.includes('كود العطل') && !aria.includes('الرئيسي');
      }) || iframeDoc.querySelector('#ats_defectcodedefectmajor_name, #ldv_defect_name')?.parentElement?.querySelector('button.launchentitylookup') || curBtns[1];

      if (subBtn) {
        log(`Filling sub-fault code lookup: "${subSearch}"`);
        await window.AutoFillEngine.Lookups.fillLookupModal(subBtn, subSearch, document, { strictExact: false });
        await sleep(1000);
      }
    }

    // 3. حفظ
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      saveBtn.click();
      const saveDeadline = Date.now() + 10000;
      while (Date.now() < saveDeadline) {
        if (modal.offsetParent === null || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(1200);
      return { ok: true, name: subSearch || mainSearch };
    }

    const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
    if (closeBtn) closeBtn.click();
    return { ok: false, reason: 'save-failed' };
  }

  async function addSparePartPage3(sp, faultCode = null) {
    if (!sp) return { ok: false, reason: 'invalid-spare-part' };
    const majorSearch = (faultCode?.majorCode || faultCode?.majorName || sp.majorCode || sp.majorName || '').trim();
    const subSearch = (faultCode?.defectCode || faultCode?.fullCode || sp.defectCode || sp.defect || sp.fullCode || '').trim();
    const partSearch = (sp.name || sp.code || sp.product || '').trim();
    const partCodeOnly = (sp.code || partSearch.split(/\s*[_–—]\s*/)[0] || '').trim();
    const qty = String(sp.qty || 1);

    // 1. Check if spare part is already present in subgrid
    const spGrids = ['InventoryAdjustmentProduct_Subgrid', 'InventoryAdjustmentProductIsLscYes_Subgrid'];
    for (const gid of spGrids) {
      const g = document.getElementById(gid);
      if (g) {
        const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => {
          const txt = (r.innerText || '').toLowerCase();
          const clean = partCodeOnly.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (partCodeOnly && txt.includes(partCodeOnly.toLowerCase())) return true;
          if (clean && txt.replace(/[^a-z0-9]/gi, '').includes(clean)) return true;
          return false;
        });
        if (rows.length > 0) {
          log(`Spare part ${partSearch} already present in ${gid} — skipping`);
          return { ok: true, name: partSearch, alreadyExists: true };
        }
      }
    }

    // 2. Find visible Add Spare Part button
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="button"]')).filter(b => {
      try {
        if (b.offsetParent === null) return false;
        const s = window.getComputedStyle(b);
        return s.display !== 'none' && s.visibility !== 'hidden';
      } catch(_) { return false; }
    });

    const addBtn = candidates.find(b => {
      const t = (b.innerText || b.title || b.value || '').trim();
      return /[اإأ]ضاف[ةه]\s*قطعة\s*غيار|Add.*Spare.*Part|Add.*Product/i.test(t) && !/الموديل\s*2/i.test(t);
    }) || candidates.find(b => /[اإأ]ضاف[ةه]\s*قطعة\s*غيار|Add.*Spare.*Part/i.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) {
      warn('Add Spare Part button not found or not visible');
      return { ok: false, reason: 'add-btn-not-found' };
    }

    addBtn.click();
    await sleep(1500);

    // 3. Wait for modal
    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const modals = Array.from(document.querySelectorAll('.modal.modal-form-insert, .modal.in, .modal.show, section.modal, div[role="dialog"]'));
      modal = modals.find(m => (m.classList.contains('in') || m.classList.contains('show') || m.offsetParent !== null) && m.querySelector('iframe'));
      if (modal) break;
      await sleep(350);
    }
    if (!modal) {
      warn('Spare part modal did not open');
      return { ok: false, reason: 'modal-not-found' };
    }

    // 4. Wait for iframe
    const iframeDoc = await window.AutoFillEngine.Lookups.waitForModalIframe(modal, 12000);
    if (!iframeDoc) {
      warn('Spare part iframe did not load');
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'iframe-not-found' };
    }

    await sleep(1000);

    const lookupFn = window.AutoFillEngine.Lookups.fillLookupModal;
    function getLookupBtn(id) {
      const inp = iframeDoc.getElementById(id);
      if (!inp) return null;
      const grp = inp.closest('.input-group') || inp.parentElement;
      return grp?.querySelector('button.launchentitylookup') || grp?.querySelectorAll('button')[1];
    }

    // 5. Fill Major Defect
    if (majorSearch) {
      const majorBtn = getLookupBtn('ats_modeldefectmajor_name');
      if (majorBtn) {
        log(`Filling major defect for spare part: "${majorSearch}"`);
        await lookupFn(majorBtn, majorSearch, iframeDoc, { strictExact: false });
        await sleep(2000);
      }
    }

    // 6. Fill Sub Defect
    if (subSearch) {
      const defectBtn = getLookupBtn('ats_defectcodedefectmajor_name');
      if (defectBtn) {
        log(`Filling sub-defect for spare part: "${subSearch}"`);
        await lookupFn(defectBtn, subSearch, iframeDoc, { strictExact: false });
        await sleep(1500);
      }
    }

    // 7. Fill Spare Part
    if (partSearch || partCodeOnly) {
      const spBtn = getLookupBtn('ats_modeldefectspid_name');
      if (spBtn) {
        log(`Filling spare part: "${partCodeOnly || partSearch}"`);
        await lookupFn(spBtn, partCodeOnly || partSearch, iframeDoc, { strictExact: false });
        await sleep(1200);
      }
    }

    // 8. Quantity
    const qtyInput = iframeDoc.getElementById('ats_quantity');
    if (qtyInput) {
      qtyInput.value = qty;
      try { qtyInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { qtyInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    }

    // 9. Save
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, input[value="حفظ"], button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      saveBtn.click();
      const saveDeadline = Date.now() + 10000;
      while (Date.now() < saveDeadline) {
        if (modal.offsetParent === null || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(1500);
      return { ok: true, name: partSearch || partCodeOnly };
    }

    const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
    if (closeBtn) closeBtn.click();
    return { ok: false, reason: 'save-failed' };
  }

  async function executePage3_Resolution(data, cfg) {
    const FR = {};
    log('【 PAGE 3 】 Preparing Resolution/Fault Codes...');
    try {
      const { currentTask } = await storageGet({ currentTask: null });
      if (currentTask && typeof window.notifyStatus === 'function') {
        window.notifyStatus(currentTask.taskId, 'filling', 'جاري تعبئة الصفحة الثالثة (الأعطال)...');
      }
    } catch(_) {}
    await sleep(1000);

    // Periodic maintenance mode (صيانة دورية + تفريغ + شحن)
    if (data.forceDrainCleaning) {
      log('Force صيانة دورية: adding 3 fault codes (AC001 + AC004 + AC003)...');
      FR.faultMaintenance = await addFaultCodePage3('AC001', 'AC00000005', ['تفريغ']);
      log(FR.faultMaintenance?.ok ? 'AC001 added' : 'AC001 failed');

      await sleep(2000);
      FR.faultDrain = await addFaultCodePage3('AC004', 'AC0300308A', ['تفريغ']);
      log(FR.faultDrain?.ok ? 'AC004 added' : 'AC004 failed');

      if (data.shahnEnabled) {
        await sleep(2000);
        FR.faultShahn = await addFaultCodePage3('AC003', 'AC9000L02B', ['تفريغ']);
        log(FR.faultShahn?.ok ? 'AC003 (شحن) added' : 'AC003 (شحن) failed');
      }
    } else if (data.faultCode) {
      log('Adding specific fault code: ' + data.faultCode);
      FR.fault = await addFaultCodePage3(data.faultCode, data.subFaultCode);
    }

    // Spare parts comment
    await sleep(1000);
    FR.sparePartsComment = await handleSparePartsComment(data.notes);

    log('【 PAGE 3 DONE 】 Results:', FR);
    return { report: { fieldResults: FR } };
  }

  const Page3 = {
    collectAllDocs,
    formatMoney,
    readIsLscFromPage,
    findCommentField,
    waitForSparePartsGrid,
    extractSparePartRows,
    readSparePartsTotalFromField,
    readCollectedAmount,
    handleSparePartsComment,
    addFaultCodePage3,
    addSparePartPage3,
    executePage3_Resolution
  };

  window.AutoFillEngine.Page3 = Page3;
  Object.assign(window, Page3);

})(window);
