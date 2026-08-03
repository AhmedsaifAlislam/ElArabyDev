// content/scanner.js — Intelligent Portal Scanner
// Merged from: analyzer.js (MutationObserver + Shadow DOM detection) + content.js (data-attribute scraping)
// Auto-detects spare parts, defect codes, and prices on portal pages

(function() {
  'use strict';

  // ── Validation ──
  function isValidSparePartCode(str) {
    if (!str || str.length < 6 || str.length > 35) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    if (/^\d[\d,.]*$/.test(str) && !/^\d{8}$/.test(str)) return false;
    if (!/^[A-Z0-9._&/-]+$/.test(str)) return false;
    if (/^\d+$/.test(str) && str.length < 8) return false;
    return true;
  }

  // ── State ──
  let detectedParts = [];
  let detectedDefects = [];
  let dbStatus = { parts: {}, defects: {} };
  let isPanelOpen = false;

  // ── Extract defect code from text ──
  function extractDefect(text) {
    if (!text) return;
    const match = text.match(/\b([A-Z]{2}\d{3,}[A-Z]?)\b/);
    if (match) {
      const code = match[1];
      let desc = text.replace(code, '').replace(/^\s*[-:]\s*/, '').trim();
      desc = desc.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
      if (!detectedDefects.some(d => d.code === code)) {
        detectedDefects.push({ code, description: desc || 'تم سحبه تلقائياً', major: '' });
      }
    }
  }

  // ── Scan page for parts and defects ──
  function scanPage() {
    // Scan select menus and text inputs for defect codes
    document.querySelectorAll('select option:checked, select option[selected]').forEach(el => {
      extractDefect(el.text || el.innerText);
    });
    document.querySelectorAll('input[type="text"]').forEach(el => {
      extractDefect(el.value);
    });
    document.querySelectorAll('td, th, span, div, h1, h2, h3, label').forEach(el => {
      const txt = (el.innerText || '').trim();
      if (txt.length > 5 && txt.length < 180) extractDefect(txt);
    });

    // Scan tables for spare part codes
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) return;

      let partIdx = -1, priceIdx = -1;
      const headers = Array.from(rows[0].querySelectorAll('th, td')).map(h => (h.innerText || '').trim().toLowerCase());

      for (let j = 0; j < headers.length; j++) {
        const txt = headers[j];
        if (txt.includes('قطع الغيار') || txt.includes('كود القطعة') || txt.includes('spare part') || txt.includes('part code') || txt.includes('الصنف')) {
          partIdx = j;
        } else if (txt.includes('السعر') || txt.includes('price') || txt.includes('القيمة') || txt.includes('الإجمالي')) {
          priceIdx = j;
        }
      }

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 2) continue;

        let code = '', description = '', price = 0;

        if (partIdx !== -1 && cells[partIdx]) {
          const cellTxt = (cells[partIdx].innerText || '').trim();
          const m = cellTxt.match(/\b([A-Z0-9]{2,}[-._&/][A-Z0-9._&/-]+|[A-Z0-9]{8,})\b/);
          if (m && isValidSparePartCode(m[0])) {
            code = m[0];
            description = cellTxt.replace(code, '').replace(/^\s*[-:]\s*/, '').replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
          }
        } else {
          for (let j = 0; j < cells.length; j++) {
            const cellTxt = (cells[j].innerText || '').trim();
            const m = cellTxt.match(/\b([A-Z0-9]{2,}[-._&/][A-Z0-9._&/-]+|[A-Z0-9]{8,})\b/);
            if (m && isValidSparePartCode(m[0])) {
              code = m[0];
              description = cellTxt.replace(code, '').replace(/^\s*[-:]\s*/, '').replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
              break;
            }
          }
        }

        if (!code) continue;

        if (priceIdx !== -1 && cells[priceIdx]) {
          const priceTxt = (cells[priceIdx].innerText || '').trim();
          const priceVal = parseFloat(priceTxt.replace(/[^0-9.]/g, ''));
          if (!isNaN(priceVal)) price = priceVal;
        } else {
          for (let j = 0; j < cells.length; j++) {
            const cellTxt = (cells[j].innerText || '').trim();
            if (cellTxt.includes('ج.م') || cellTxt.includes('EGP') || cellTxt.includes('LE')) {
              const priceVal = parseFloat(cellTxt.replace(/[^0-9.]/g, ''));
              if (!isNaN(priceVal)) { price = priceVal; break; }
            }
          }
        }

        if (!detectedParts.some(p => p.code === code)) {
          detectedParts.push({ code, description, price });
        }
      }
    });

    // If we found something, check DB and sync
    if (detectedParts.length > 0 || detectedDefects.length > 0) {
      checkDatabaseAndSync();
    }

    // Update shadow panel if open
    if (isPanelOpen) updatePanelContent();
  }

  // ── Check DB status and auto-sync ──
  function checkDatabaseAndSync() {
    const partCodes = detectedParts.map(p => p.code);
    const defectCodes = detectedDefects.map(d => d.code);

    try {
    chrome.runtime.sendMessage({
      action: 'checkCodesStatus',
      parts: partCodes,
      defects: defectCodes
    }, async (response) => {
      if (chrome.runtime.lastError || !response) return;

      dbStatus = {
        parts: response.partStatus || {},
        defects: response.defectStatus || {}
      };

      let syncedCount = 0;

      // Sync parts
      for (const p of detectedParts) {
        const status = dbStatus.parts[p.code];
        if (!status) continue;
        if (!status.exists || (p.price > 0 && status.price !== p.price)) {
          await new Promise(resolve => {
            try {
            chrome.runtime.sendMessage({
              action: 'updatePartPrice',
              code: p.code, price: p.price, description: p.description
            }, () => {
              if (chrome.runtime.lastError) { resolve(); return; }
              dbStatus.parts[p.code] = { exists: true, price: p.price, description: p.description };
              syncedCount++;
              resolve();
            });
            } catch(e) { resolve(); }
          });
        }
      }

      // Sync defects
      for (const d of detectedDefects) {
        const status = dbStatus.defects[d.code];
        if (!status) continue;
        if (!status.exists) {
          await new Promise(resolve => {
            try {
            chrome.runtime.sendMessage({
              action: 'updateDefectCode',
              code: d.code, description: d.description, major: d.major
            }, () => {
              if (chrome.runtime.lastError) { resolve(); return; }
              dbStatus.defects[d.code] = { exists: true, description: d.description };
              syncedCount++;
              resolve();
            });
            } catch(e) { resolve(); }
          });
        }
      }

      updateBadge();
      if (syncedCount > 0) showSyncToast(syncedCount);
    });
    } catch(e) { /* extension context invalidated */ }
  }

  // ── Update badge count ──
  function updateBadge() {
    let changes = 0;
    detectedParts.forEach(p => {
      const status = dbStatus.parts?.[p.code];
      if (status && (!status.exists || status.price !== p.price)) changes++;
    });
    detectedDefects.forEach(d => {
      const status = dbStatus.defects?.[d.code];
      if (status && !status.exists) changes++;
    });
    // Badge is handled by shadow-panel.js
    if (globalThis.ShadowPanel) {
      globalThis.ShadowPanel.updateBadge(changes);
    }
  }

  // ── Show sync toast ──
  function showSyncToast(count) {
    if (globalThis.ShadowPanel) {
      globalThis.ShadowPanel.showToast(`✨ تم مزامنة ${count} كود/سعر تلقائياً`);
    }
  }

  // ── Update panel content ──
  function updatePanelContent() {
    if (globalThis.ShadowPanel) {
      globalThis.ShadowPanel.updateData(detectedParts, detectedDefects, dbStatus);
    }
  }

  // ── MutationObserver for auto-scanning ──
  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanPage, 1500);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  setTimeout(scanPage, 1000);

  // Expose to other content scripts
  globalThis.Scanner = {
    getDetectedParts: () => detectedParts,
    getDetectedDefects: () => detectedDefects,
    getDbStatus: () => dbStatus,
    setPanelOpen: (open) => { isPanelOpen = open; },
    forceScan: scanPage
  };

})();
