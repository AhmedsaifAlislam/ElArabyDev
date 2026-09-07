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
      const grid = document.getElementById('InventoryAdjustmentProduct_Subgrid') ||
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
    log(`Adding Fault Code: ${code} (subCode: ${subCode || 'N/A'})...`);
    
    // Check if fault code already exists in subgrid
    const existingGrids = ['WorkOrder_defect', 'WorkOrderDefectIsLscYes_Subgrid'];
    for (const gid of existingGrids) {
      const g = document.getElementById(gid);
      if (g) {
        const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => (r.innerText || '').includes(code));
        if (rows.length > 0) {
          log(`Fault code ${code} already present in ${gid} — skipping`);
          return { ok: true, name: code, alreadyExists: true };
        }
      }
    }

    // Find add button for defect code
    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => b.offsetParent !== null)
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
      modal = document.querySelector('.modal.show, .modal.in, div[role="dialog"]');
      if (modal && modal.offsetParent !== null) break;
      modal = null;
      await sleep(400);
    }
    if (!modal) {
      warn('Defect Code modal did not open');
      return { ok: false, reason: 'modal-not-found' };
    }

    const iframeDoc = await window.AutoFillEngine.Lookups.waitForModalIframe(modal, 12000);
    if (!iframeDoc) {
      warn('Defect Code iframe did not load');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'iframe-not-found' };
    }

    await sleep(800);
    const lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
    if (!lookupBtn) {
      warn('Lookup button not found in defect iframe');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'lookup-btn-not-found' };
    }

    const lookupRes = await window.AutoFillEngine.Lookups.fillLookupModal(lookupBtn, code, document);
    if (!lookupRes || !lookupRes.ok) {
      warn('Lookup failed for fault code: ' + code);
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return lookupRes;
    }

    await sleep(1000);
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      saveBtn.click();
      const saveDeadline = Date.now() + 10000;
      while (Date.now() < saveDeadline) {
        if (modal.offsetParent === null || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(1000);
      return { ok: true, name: code };
    }

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
    executePage3_Resolution
  };

  window.AutoFillEngine.Page3 = Page3;
  Object.assign(window, Page3);

})(window);
