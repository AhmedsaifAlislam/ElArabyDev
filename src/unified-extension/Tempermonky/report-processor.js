// ==UserScript==
// @name         معالج البلاغات
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  يفتح البلاغات ويفحص البيانات + اختيار يوم + بلاغات محددة + يقرأ كل الصفحات + Concurrency + Export + Resume
// @author       Portal AutoFiller
// @match        *://elarabyportalpfs.powerappsportals.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SLEEP = ms => new Promise(r => setTimeout(r, ms));
  const ORDERS_URL = 'https://elarabyportalpfs.powerappsportals.com/en-US/Orders/';

  // ══════════════════════════════════════════════════════════════════
  //  State
  // ══════════════════════════════════════════════════════════════════
  const state = {
    isRunning: false,
    isPaused: false,
    pausePromise: null,
    stopRequested: false,
    totalProcessed: 0,
    totalWithData: 0,
    totalSkipped: 0,
    allReports: [],
    selectedReports: [],
    scrapedPages: new Set(),
    totalPages: 1,
    isScraping: false,
    orderIdFilter: new Set(),
    orderIdFilterOrder: [],
    sortMode: 'scraped',
    // Concurrency
    concurrencyLimit: 3,
    activeWorkers: 0,
    processingQueue: [],
    // Resume
    resumeEnabled: true,
    resumeKey: 'rp_resume_v6',
    currentIndex: 0,
    sessionStartTime: null,
  };

  // ══════════════════════════════════════════════════════════════════
  //  Column Detection (data-th based)
  // ══════════════════════════════════════════════════════════════════
  let COL = {};
  const REGEX = { CAS: /CAS\d+/, PHONE: /01[0-9]{9}/g };

  // ══════════════════════════════════════════════════════════════════
  //  Date Parsing Utilities (Better Date Parsing)
  // ══════════════════════════════════════════════════════════════════
  function parseFlexibleDate(dateStr) {
    if (!dateStr) return null;
    const s = dateStr.trim();
    
    // Relative dates in Arabic
    const now = new Date();
    if (s === 'اليوم' || s === 'today') return formatDate(now);
    if (s === 'أمس' || s === 'yesterday') return formatDate(new Date(now.getTime() - 86400000));
    if (s === 'غداً' || s === 'غدا' || s === 'tomorrow') return formatDate(new Date(now.getTime() + 86400000));
    
    // DD/MM/YYYY or DD-MM-YYYY
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
    
    // YYYY-MM-DD
    m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return `${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}/${m[1]}`;
    
    // DD/MM/YY or DD-MM-YY
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/20${m[3]}`;
    
    // Already in DD/MM/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
    
    return s; // Return as-is if no match
  }
  
  function formatDate(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  
  function normalizeReportDate(dateStr) {
    if (!dateStr) return '';
    // Portal dates might be in various formats, normalize to DD/MM/YYYY
    const parsed = parseFlexibleDate(dateStr);
    // Validate it's a valid date
    const parts = parsed.split('/');
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[1]}`);
      if (!isNaN(d.getTime())) return parsed;
    }
    return dateStr;
  }

  function detectColumns(doc) {
    doc = doc || document;
    COL = {};

    function detectInDoc(d) {
      const firstRow = d.querySelector('table tbody tr');
      if (!firstRow) return false;
      const cells = firstRow.querySelectorAll('td');
      cells.forEach((td, i) => {
        const th = td.getAttribute('data-th');
        if (th) COL[th.trim()] = i;
      });
      return Object.keys(COL).length > 0;
    }

    if (detectInDoc(doc)) return true;

    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iDoc) continue;
        if (detectInDoc(iDoc)) return true;
      } catch (e) {}
    }

    return false;
  }

  function getCellValue(row, headerName) {
    const cells = row.querySelectorAll('td');
    for (const td of cells) {
      if (td.getAttribute('data-th') === headerName) {
        return td.getAttribute('aria-label') || td.textContent.trim() || '';
      }
    }
    return '';
  }

  function getCellJsonValue(row, headerName) {
    const cells = row.querySelectorAll('td');
    for (const td of cells) {
      if (td.getAttribute('data-th') === headerName) {
        try {
          const raw = td.getAttribute('data-value');
          if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Export Functions (CSV/Excel)
  // ══════════════════════════════════════════════════════════════════
  function exportToCSV(reports, filename) {
    const headers = ['رقم البلاغ', 'اسم العميل', 'التاريخ', 'الحالة', 'الرابط'];
    const rows = reports.map(r => [
      r.casNo,
      r.name || '—',
      r.date || '—',
      r._status || (r._hasData ? 'فيه داتا' : 'مفيش داتا'),
      r.url || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename || `report-export-${Date.now()}.csv`);
  }

  function exportToExcel(reports, filename) {
    if (typeof XLSX === 'undefined') {
      addLog('XLSX غير متاح، جاري التصدير كـ CSV...', 'warn');
      exportToCSV(reports, filename?.replace('.xlsx', '.csv'));
      return;
    }
    const wsData = [
      ['رقم البلاغ', 'اسم العميل', 'التاريخ', 'الحالة', 'الرابط'],
      ...reports.map(r => [r.casNo, r.name || '—', r.date || '—', r._status || (r._hasData ? 'فيه داتا' : 'مفيش داتا'), r.url || ''])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch: 20}, {wch: 30}, {wch: 15}, {wch: 15}, {wch: 50}];
    XLSX.utils.book_append_sheet(wb, ws, 'Report Results');
    XLSX.writeFile(wb, filename || `report-export-${Date.now()}.xlsx`);
    addLog(`✅ تم تصدير ${reports.length} بلاغ إلى Excel`, 'ok');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Concurrency Control (Semaphore)
  // ══════════════════════════════════════════════════════════════════
  function acquireSlot() {
    return new Promise(resolve => {
      const check = () => {
        if (state.activeWorkers < state.concurrencyLimit) {
          state.activeWorkers++;
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  function releaseSlot() {
    state.activeWorkers = Math.max(0, state.activeWorkers - 1);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Resume Capability (localStorage persistence)
  // ══════════════════════════════════════════════════════════════════
  function saveResumeState() {
    if (!state.resumeEnabled) return;
    const resumeData = {
      version: 6,
      timestamp: Date.now(),
      selectedReports: state.selectedReports.map(r => ({ casNo: r.casNo, name: r.name, date: r.date, url: r.url })),
      currentIndex: state.currentIndex,
      totalProcessed: state.totalProcessed,
      totalWithData: state.totalWithData,
      totalSkipped: state.totalSkipped,
      processedCasNos: [...new Set(
        state.selectedReports
          .slice(0, state.currentIndex)
          .map(r => r.casNo)
      )],
      sessionStartTime: state.sessionStartTime,
    };
    try {
      localStorage.setItem(state.resumeKey, JSON.stringify(resumeData));
    } catch (e) {}
  }

  function loadResumeState() {
    try {
      const data = localStorage.getItem(state.resumeKey);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed.version !== 6) return null;
      // Check if session is recent (within 24 hours)
      if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
        clearResumeState();
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearResumeState() {
    try { localStorage.removeItem(state.resumeKey); } catch (e) {}
  }

  function applyResumeState(resumeData) {
    state.totalProcessed = resumeData.totalProcessed || 0;
    state.totalWithData = resumeData.totalWithData || 0;
    state.totalSkipped = resumeData.totalSkipped || 0;
    state.currentIndex = resumeData.currentIndex || 0;
    state.sessionStartTime = resumeData.sessionStartTime || Date.now();
    
    // Filter out already processed reports
    const processedSet = new Set(resumeData.processedCasNos || []);
    state.selectedReports = state.selectedReports.filter(r => !processedSet.has(r.casNo));
    
    updateStats();
    addLog(`🔄 استئناف الجلسة: ${state.selectedReports.length} بلاغ متبقي`, 'ok');
  }

  // ══════════════════════════════════════════════════════════════════
  //  Keyboard Shortcuts
  // ══════════════════════════════════════════════════════════════════
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle when mini-menu is visible or settings modal is visible
      const miniVisible = document.getElementById('rp-mini-menu')?.classList.contains('visible');
      const settingsVisible = document.getElementById('rp-settings')?.classList.contains('visible');
      if (!miniVisible && !settingsVisible) return;

      // Don't intercept if typing in input/textarea
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

      switch (e.key) {
        case 'Enter':
          if (settingsVisible) {
            e.preventDefault();
            const startBtnEl = document.getElementById('rp-settings-start');
            if (startBtnEl && !startBtnEl.disabled) startBtnEl.click();
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (settingsVisible) {
            hideSettings();
          } else if (miniVisible) {
            if (state.isRunning) {
              state.stopRequested = true;
              addLog('تم طلب الإيقاف...', 'skip');
            } else {
              document.getElementById('rp-mini-close')?.click();
            }
          }
          break;
        case ' ':
        case 'Spacebar':
          if (miniVisible && state.isRunning) {
            e.preventDefault();
            state.isPaused = !state.isPaused;
            if (state.isPaused) {
              addLog('⏸ تم الإيقاف المؤقت', 'warn');
              setStatus('متوقف مؤقتاً — اضغط Space للاستئناف', 'warn');
              state.pausePromise = new Promise(resolve => { state._pauseResolve = resolve; });
            } else {
              addLog('▶ استئناف المعالجة', 'ok');
              setStatus('جاري المعالجة...', 'info');
              if (state._pauseResolve) state._pauseResolve();
              state.pausePromise = null;
            }
          }
          break;
      }
    });
  }

  async function waitIfPaused() {
    if (state.pausePromise) {
      await state.pausePromise;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Styles
  // ══════════════════════════════════════════════════════════════════
  const CSS = `
    /* ── فاب rp-fab يُدار مركزياً من fabs-controller (حجم/موضوع/ثبات) ── */

    #rp-overlay {
      position: fixed !important; inset: 0 !important; background: rgba(0,0,0,.7) !important;
      z-index: 2147483645 !important; display: none !important;
    }
    #rp-overlay.visible { display: block !important; }

    #rp-settings {
      position: fixed !important; top: 50% !important; left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 480px !important; max-height: 85vh !important;
      background: #1a1d27 !important; border: 1px solid #2a2d3e !important;
      border-radius: 14px !important; box-shadow: 0 20px 60px rgba(0,0,0,.9) !important;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif !important;
      font-size: 13px !important; color: #c8d0e0 !important;
      z-index: 2147483647 !important; direction: rtl !important;
      overflow: hidden !important; display: none !important;
    }
    #rp-settings.visible { display: block !important; }

    #rp-settings-header {
      background: linear-gradient(135deg, #e67e22 0%, #d35400 100%) !important;
      padding: 12px 16px !important; display: flex !important;
      align-items: center !important; justify-content: space-between !important;
    }
    #rp-settings-title { font-weight: 700 !important; font-size: 14px !important; color: #fff !important; }
    #rp-settings-close {
      background: rgba(255,255,255,.2) !important; border: none !important;
      border-radius: 50% !important; color: #fff !important; cursor: pointer !important;
      width: 24px !important; height: 24px !important; font-size: 14px !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
    }

    #rp-settings-body {
      padding: 16px !important; display: flex !important; flex-direction: column !important;
      gap: 12px !important; max-height: calc(85vh - 50px) !important; overflow-y: auto !important;
    }
    #rp-settings-body::-webkit-scrollbar { width: 4px !important; }
    #rp-settings-body::-webkit-scrollbar-thumb { background: #2a3050 !important; border-radius: 2px !important; }

    .rp-section-title {
      font-size: 11px !important; font-weight: 700 !important; color: #e67e22 !important;
      margin-bottom: 4px !important; display: flex !important; align-items: center !important; gap: 4px !important;
    }

    .rp-date-grid {
      display: flex !important; flex-wrap: wrap !important; gap: 6px !important; margin-bottom: 8px !important;
    }
    .rp-date-chip {
      padding: 6px 12px !important; border-radius: 20px !important; font-size: 11px !important;
      cursor: pointer !important; border: 1px solid #2a4a7a !important;
      background: rgba(10,124,255,.08) !important; color: #a8c7fa !important;
      transition: all .15s !important; user-select: none !important;
    }
    .rp-date-chip:hover { background: rgba(10,124,255,.2) !important; border-color: #0a7cff !important; }
    .rp-date-chip.selected { background: #e67e22 !important; color: #fff !important; border-color: #e67e22 !important; }
    .rp-date-chip.all-dates { background: rgba(231,76,60,.15) !important; color: #e74c3c !important; border-color: #e74c3c !important; }
    .rp-date-chip.all-dates.selected { background: #e74c3c !important; color: #fff !important; }

    .rp-reports-list {
      max-height: 280px !important; overflow-y: auto !important;
      border: 1px solid #2a2d3e !important; border-radius: 8px !important; padding: 4px !important;
    }
    .rp-reports-list::-webkit-scrollbar { width: 3px !important; }
    .rp-reports-list::-webkit-scrollbar-thumb { background: #2a3050 !important; border-radius: 2px !important; }

    .rp-report-item {
      display: flex !important; align-items: center !important; gap: 8px !important;
      padding: 8px 10px !important; border-bottom: 1px solid #1e2340 !important;
      cursor: pointer !important; transition: background .1s !important; border-radius: 4px !important;
    }
    .rp-report-item:hover { background: rgba(230,126,34,.1) !important; }
    .rp-report-item:last-child { border-bottom: none !important; }
    .rp-report-item input[type="checkbox"] { accent-color: #e67e22 !important; cursor: pointer !important; width: 16px !important; height: 16px !important; flex-shrink: 0 !important; }
    .rp-report-cas {
      font-weight: 700 !important; font-size: 11px !important; color: #f0b429 !important;
      min-width: 140px !important; direction: ltr !important; text-align: left !important;
      font-family: 'Consolas', 'Monaco', monospace !important;
    }
    .rp-report-name {
      font-size: 12px !important; color: #60a5fa !important; flex: 1 !important;
      white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
      font-weight: 500 !important;
    }
    .rp-report-date {
      font-size: 10px !important; color: #94a3b8 !important; min-width: 80px !important;
      text-align: center !important; background: #1e293b !important; padding: 3px 8px !important;
      border-radius: 4px !important; font-family: 'Consolas', 'Monaco', monospace !important;
    }

    .rp-select-all {
      display: flex !important; align-items: center !important; gap: 6px !important;
      padding: 6px 8px !important; background: rgba(230,126,34,.1) !important;
      border-radius: 6px !important; cursor: pointer !important; font-size: 11px !important;
    }
    .rp-select-all input { accent-color: #e67e22 !important; width: 16px !important; height: 16px !important; }

    .rp-btn-row { display: flex !important; gap: 8px !important; margin-top: 4px !important; }
    .rp-btn {
      flex: 1 !important; padding: 10px !important; border: none !important;
      border-radius: 8px !important; font-size: 12px !important; font-weight: 600 !important;
      cursor: pointer !important; transition: opacity .15s !important; text-align: center !important;
    }
    .rp-btn:disabled { opacity: .4 !important; cursor: not-allowed !important; }
    .rp-btn-primary { background: #27ae60 !important; color: #fff !important; }
    .rp-btn-danger { background: #c0392b !important; color: #fff !important; }

    .rp-loading {
      text-align: center !important; padding: 20px !important; color: #f0b429 !important;
      font-size: 12px !important;
    }
    .rp-loading .rp-spinner {
      display: inline-block !important; width: 20px !important; height: 20px !important;
      border: 2px solid #2a2d3e !important; border-top-color: #e67e22 !important;
      border-radius: 50% !important; animation: rp-spin 0.8s linear infinite !important;
      margin-bottom: 6px !important;
    }
    @keyframes rp-spin { to { transform: rotate(360deg) !important; } }

    #rp-mini-menu {
      position: fixed !important; bottom: 70px !important; left: 76px !important;
      width: 300px !important; background: #1a1d27 !important;
      border: 1px solid #2a2d3e !important; border-radius: 14px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,.9) !important;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif !important;
      font-size: 13px !important; color: #c8d0e0 !important;
      z-index: 2147483647 !important; direction: rtl !important;
      display: none !important; overflow: hidden !important;
    }
    #rp-mini-menu.visible { display: block !important; }

    #rp-mini-header {
      background: linear-gradient(135deg, #e67e22 0%, #d35400 100%) !important;
      padding: 8px 12px !important; display: flex !important;
      align-items: center !important; justify-content: space-between !important;
    }
    #rp-mini-body { padding: 10px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }

    #rp-status {
      padding: 6px 10px !important; border-radius: 6px !important;
      font-size: 11px !important; font-weight: 500 !important;
      background: #12162a !important; color: #7a9cc8 !important;
      border: 1px solid #1e2340 !important; min-height: 28px !important;
      text-align: center !important;
    }
    #rp-status.ok { background: #0d2b1c !important; color: #2bd46f !important; border-color: #1a4a2a !important; }
    #rp-status.error { background: #2a0808 !important; color: #ff6b6b !important; border-color: #4a1a1a !important; }
    #rp-status.warn { background: #2a2008 !important; color: #f0b429 !important; border-color: #4a3a1a !important; }

    .rp-stats { display: flex !important; gap: 6px !important; }
    .rp-stat {
      flex: 1 !important; text-align: center !important; padding: 4px !important;
      background: #12162a !important; border-radius: 6px !important;
      border: 1px solid #1e2340 !important;
    }
    .rp-stat-num { font-size: 14px !important; font-weight: 700 !important; display: block !important; }
    .rp-stat-label { font-size: 8px !important; color: #7a9cc8 !important; }
    .rp-stat-green .rp-stat-num { color: #2bd46f !important; }
    .rp-stat-red .rp-stat-num { color: #ff6b6b !important; }
    .rp-stat-blue .rp-stat-num { color: #60a5fa !important; }

    #rp-log {
      max-height: 120px !important; overflow-y: auto !important;
      border-radius: 6px !important; padding: 4px !important;
      border: 1px solid #1e2340 !important; font-size: 10px !important;
      font-family: monospace !important;
    }
    #rp-log::-webkit-scrollbar { width: 3px !important; }
    #rp-log::-webkit-scrollbar-thumb { background: #2a3050 !important; border-radius: 2px !important; }
    .rp-log-item { padding: 2px 4px !important; border-bottom: 1px solid #1e2340 !important; }
    .rp-log-ok { color: #2bd46f !important; }
    .rp-log-skip { color: #f0b429 !important; }
    .rp-log-err { color: #ff6b6b !important; }
    .rp-log-info { color: #7a9cc8 !important; }
  `;

  if (!document.getElementById('rp-style')) {
    const style = document.createElement('style');
    style.id = 'rp-style';
    style.textContent = CSS;
    document.documentElement.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════════
  //  DOM Helpers
  // ══════════════════════════════════════════════════════════════════
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else if (k === 'textContent') e.textContent = v;
      else if (k === 'innerHTML') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c instanceof Node) e.appendChild(c);
    }
    return e;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Build UI
  // ══════════════════════════════════════════════════════════════════
  // الفاب rp-fab يُدار مركزياً من fabs-controller — لا ننشئه هنا

  // Settings Modal
  const overlay = el('div', { id: 'rp-overlay' });
  const settingsTitle = el('span', { id: 'rp-settings-title', textContent: '⚙️ إعدادات المعالجة' });
  const settingsClose = el('button', { id: 'rp-settings-close', textContent: '✕' });
  const settingsHeader = el('div', { id: 'rp-settings-header' }, [settingsTitle, settingsClose]);

  // Order ID Filter Section
  const orderIdSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '🔢 تصفية بأرقام الطلبات' });
  const orderIdTextarea = el('textarea', { 
    id: 'rp-order-id-filter', 
    placeholder: 'الصق أرقام الطلبات هنا (كل سطر رقم)\nمثال:\nCAS2026082553172366\nCAS2026081552971241\nCAS2026082353144001',
    style: 'width:100%;min-height:80px;padding:8px;border:1px solid #2a4a7a;border-radius:6px;background:#0d1117;color:#c8d0e0;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box;margin-bottom:8px;'
  });
  const orderIdActions = el('div', { style: 'display:flex;gap:6px;margin-bottom:8px;' }, [
    el('button', { id: 'rp-apply-order-filter', className: 'rp-btn rp-btn-primary', style: 'flex:1;padding:8px;font-size:11px;', textContent: '✅ تطبيق التصفية' }),
    el('button', { id: 'rp-clear-order-filter', className: 'rp-btn rp-btn-danger', style: 'flex:1;padding:8px;font-size:11px;', textContent: '🗑 مسح التصفية' }),
  ]);
  const orderIdStatus = el('div', { id: 'rp-order-filter-status', style: 'font-size:10px;color:#7a9cc8;text-align:center;padding:4px;display:none;' });

  const dateSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '📅 اختر التاريخ' });
  const dateGrid = el('div', { className: 'rp-date-grid', id: 'rp-date-grid' });

  // Sort Section
  const sortSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '🔃 ترتيب القائمة' });
  const sortSelect = el('select', { 
    id: 'rp-sort-select',
    style: 'width:100%;padding:8px;border:1px solid #2a4a7a;border-radius:6px;background:#0d1117;color:#c8d0e0;font-size:11px;'
  }, [
    el('option', { value: 'scraped', textContent: 'ترتيب الاستخراج (الأولوية)' }),
    el('option', { value: 'input-order', textContent: 'ترتيب الإدخال (كما أدخلته)' }),
    el('option', { value: 'cas-asc', textContent: 'رقم البلاغ (تصاعدي)' }),
    el('option', { value: 'cas-desc', textContent: 'رقم البلاغ (تنازلي)' }),
    el('option', { value: 'name-asc', textContent: 'اسم العميل (أ-ي)' }),
    el('option', { value: 'name-desc', textContent: 'اسم العميل (ي-أ)' }),
    el('option', { value: 'date-asc', textContent: 'التاريخ (الأقدم أولاً)' }),
    el('option', { value: 'date-desc', textContent: 'التاريخ (الأحدث أولاً)' }),
  ]);

  const reportsSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '📋 البلاغات المتاحة' });
  const selectAllLabel = el('label', { className: 'rp-select-all' }, [
    el('input', { type: 'checkbox', id: 'rp-select-all' }),
    el('span', { textContent: 'تحديد الكل' }),
  ]);
  const reportsList = el('div', { className: 'rp-reports-list', id: 'rp-reports-list' });
  reportsList.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div><div>جاري تحميل البلاغات من كل الصفحات...</div></div>';

  const selectedCountEl = el('div', { id: 'rp-selected-count', style: 'text-align:center;font-size:12px;color:#f0b429;padding:6px;display:none;' });
  const startBtn = el('button', { className: 'rp-btn rp-btn-primary', id: 'rp-settings-start', textContent: '▶ بدء المعالجة' });
  const cancelBtn = el('button', { className: 'rp-btn rp-btn-danger', id: 'rp-settings-cancel', textContent: 'إلغاء' });
  const exportCsvBtn = el('button', { className: 'rp-btn', id: 'rp-export-csv', textContent: '📊 تصدير CSV', style: 'background:#2980b9;color:#fff;' });
  const exportXlsxBtn = el('button', { className: 'rp-btn', id: 'rp-export-xlsx', textContent: '📈 تصدير Excel', style: 'background:#27ae60;color:#fff;' });
  const btnRow = el('div', { className: 'rp-btn-row' }, [startBtn, cancelBtn]);
  const exportRow = el('div', { className: 'rp-btn-row', style: 'margin-top:4px;' }, [exportCsvBtn, exportXlsxBtn]);

  const settingsBody = el('div', { id: 'rp-settings-body' }, [
    orderIdSectionTitle, orderIdTextarea, orderIdActions, orderIdStatus,
    dateSectionTitle, dateGrid,
    sortSectionTitle, sortSelect,
    reportsSectionTitle, selectAllLabel, reportsList, selectedCountEl, btnRow, exportRow,
  ]);
  const settingsModal = el('div', { id: 'rp-settings' }, [settingsHeader, settingsBody]);

  // Mini Menu (during run)
  const miniHeader = el('div', { id: 'rp-mini-header' }, [
    el('span', { style: 'font-weight:700;font-size:12px;color:#fff;', textContent: '🔧 معالج البلاغات' }),
    el('button', { id: 'rp-mini-close', style: 'background:rgba(255,255,255,.2);border:none;border-radius:50%;color:#fff;cursor:pointer;width:22px;height:22px;font-size:14px;', textContent: '✕' }),
  ]);

  const miniStatus = el('div', { id: 'rp-status', textContent: 'جاهز' });
  const miniStatProc = el('span', { className: 'rp-stat-num', textContent: '0' });
  const miniStatData = el('span', { className: 'rp-stat-num', textContent: '0' });
  const miniStatSkip = el('span', { className: 'rp-stat-num', textContent: '0' });
  const miniStats = el('div', { className: 'rp-stats' }, [
    el('div', { className: 'rp-stat rp-stat-blue' }, [miniStatProc, el('span', { className: 'rp-stat-label', textContent: 'المعالجة' })]),
    el('div', { className: 'rp-stat rp-stat-green' }, [miniStatData, el('span', { className: 'rp-stat-label', textContent: 'داتا' })]),
    el('div', { className: 'rp-stat rp-stat-red' }, [miniStatSkip, el('span', { className: 'rp-stat-label', textContent: 'متقفلاش' })]),
  ]);

  const miniStopBtn = el('button', { id: 'rp-mini-stop', textContent: '⏹ إيقاف', style: 'background:#c0392b;color:#fff;padding:8px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;' });
  const miniLog = el('div', { id: 'rp-log' });

  const miniBody = el('div', { id: 'rp-mini-body' }, [miniStatus, miniStats, miniStopBtn, miniLog]);
  const miniMenu = el('div', { id: 'rp-mini-menu' }, [miniHeader, miniBody]);

  // اللوحات فقط — الفاب يُدار من fabs-controller
  if (!document.getElementById('rp-overlay')) document.documentElement.appendChild(overlay);
  if (!document.getElementById('rp-settings')) document.documentElement.appendChild(settingsModal);
  if (!document.getElementById('rp-mini-menu')) document.documentElement.appendChild(miniMenu);

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // ══════════════════════════════════════════════════════════════════
  //  Log & Status
  // ══════════════════════════════════════════════════════════════════
  function setStatus(text, type = '') {
    miniStatus.className = '';
    miniStatus.id = 'rp-status';
    if (type) miniStatus.classList.add(`rp-${type}`);
    miniStatus.textContent = text;
  }

  function addLog(msg, type = 'info') {
    const cls = type === 'ok' ? 'rp-log-ok' : type === 'skip' ? 'rp-log-skip' : type === 'error' ? 'rp-log-err' : 'rp-log-info';
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const item = el('div', { className: `rp-log-item ${cls}`, textContent: `[${time}] ${msg}` });
    miniLog.prepend(item);
    if (miniLog.children.length > 100) miniLog.lastChild.remove();
  }

  function updateStats() {
    miniStatProc.textContent = state.totalProcessed;
    miniStatData.textContent = state.totalWithData;
    miniStatSkip.textContent = state.totalSkipped;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Find Table in Document + iframes
  // ══════════════════════════════════════════════════════════════════
  function findTableInDoc(doc) {
    // Try multiple table selectors
    const tableSelectors = [
      'table.entity-list',
      'table[class*="entity"]',
      'table',
    ];

    for (const sel of tableSelectors) {
      const tables = doc.querySelectorAll(sel);
      for (const table of tables) {
        // Try tbody first, then direct tr
        let rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) rows = table.querySelectorAll('tr');
        // Filter out header rows
        rows = Array.from(rows).filter(tr => tr.querySelectorAll('td').length > 2);
        if (rows.length > 0) return { table, rows, doc };
      }
    }
    return null;
  }

  function findTable() {
    let result = findTableInDoc(document);
    if (result) return result;

    // Search iframes recursively (up to 3 levels)
    function searchIframes(doc, depth) {
      if (depth > 3) return null;
      const iframes = doc.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (!iDoc) continue;
          const res = findTableInDoc(iDoc);
          if (res) return res;
          // Go deeper
          const deep = searchIframes(iDoc, depth + 1);
          if (deep) return deep;
        } catch (e) { /* cross-origin */ }
      }
      return null;
    }

    result = searchIframes(document, 0);
    if (result) return result;
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Extract Report Data from Row
  // ══════════════════════════════════════════════════════════════════
  function extractRowData(row, doc) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return null;

    // CAS number from data-value or text
    let casNo = '';
    const casVal = getCellJsonValue(row, 'رقم الطلب');
    if (casVal) casNo = casVal;
    if (!casNo) casNo = getCellValue(row, 'رقم الطلب');
    if (!casNo) casNo = row.getAttribute('data-name') || '';
    if (!casNo) casNo = row.textContent.match(REGEX.CAS)?.[0] || '';
    if (!casNo) return null;

    // Customer name from data-value JSON (Name field)
    let name = '';
    const customerVal = getCellJsonValue(row, 'اسم العميل');
    if (customerVal && customerVal.Name) {
      name = customerVal.Name;
    }
    if (!name) {
      name = getCellValue(row, 'اسم العميل');
    }

    // Date
    let date = getCellValue(row, 'تاريخ الحجز');
    if (!date) {
      // Try alternative column names
      const altNames = ['تاريخ الحجز', 'التاريخ', 'Date', 'Created On', 'Created'];
      for (const alt of altNames) {
        date = getCellValue(row, alt);
        if (date) break;
      }
    }

    // URL
    let url = '';
    const followupLink = row.querySelector('a[href*="workorderreview"]') || row.querySelector('a[href*="followup"]');
    if (followupLink) {
      url = followupLink.href;
    }
    if (!url) {
      const editLinks = row.querySelectorAll('a.edit-link');
      for (const a of editLinks) {
        if (a.href && a.href.includes('workorderreview')) {
          url = a.href;
          break;
        }
      }
    }
    if (!url) {
      // Build from data-id
      const dataId = row.getAttribute('data-id');
      if (dataId) {
        url = `https://elarabyportalpfs.powerappsportals.com/workorderreview/?id=${dataId}`;
      }
    }
    if (!url) {
      url = `https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=${casNo}`;
    }

    return { casNo, name, date, url };
  }

  // ══════════════════════════════════════════════════════════════════
  //  Extract Reports from Current Page
  // ══════════════════════════════════════════════════════════════════
  function extractFromCurrentPage() {
    const tableData = findTable();
    if (!tableData) {
      console.warn('[RP] No table found on page');
      return [];
    }
    console.log(`[RP] extractFromCurrentPage: found table in ${tableData.doc === document ? 'document' : 'iframe'}`);

    detectColumns(tableData.doc);

    const { rows, doc } = tableData;
    console.log(`[RP] Found ${rows.length} rows`);
    const reports = [];
    for (const row of rows) {
      const data = extractRowData(row, doc);
      if (data) reports.push(data);
    }
    console.log(`[RP] Extracted ${reports.length} reports`);
    if (reports.length > 0) {
      console.log(`[RP] Sample:`, JSON.stringify(reports[0]));
    } else {
      const firstRow = rows[0];
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        const colInfo = Array.from(cells).map((td, i) => `[${i}] data-th="${td.getAttribute('data-th')}" text="${td.textContent.trim().substring(0, 30)}"`);
        console.log(`[RP] No reports extracted. Row columns:`, colInfo);
      }
    }
    if (reports.length > 0) {
      console.log('[RP] First report:', reports[0]);
    }
    return reports;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Scrape All Pages — click-next approach (same as order-extractor.js)
  // ══════════════════════════════════════════════════════════════════
  function findNextBtn() {
    function searchDoc(doc) {
      return doc.querySelector('a.entity-pager-next-link:not([aria-disabled="true"])');
    }
    let btn = searchDoc(document);
    if (btn) {
      const li = btn.closest('li');
      if (li && !li.classList.contains('disabled')) return { btn, doc: document };
    }
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iDoc) continue;
        btn = searchDoc(iDoc);
        if (btn) {
          const li = btn.closest('li');
          if (li && !li.classList.contains('disabled')) return { btn, doc: iDoc };
        }
      } catch (e) {}
    }
    return null;
  }

  function hasNextPage() {
    return findNextBtn() !== null;
  }

  function clickNextPage() {
    const result = findNextBtn();
    if (result) { result.btn.click(); return true; }
    return false;
  }

  async function waitForTable(maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const td = findTable();
      if (td) {
        const rows = td.table.querySelectorAll('tbody tr');
        const filtered = Array.from(rows).filter(tr => tr.querySelectorAll('td').length > 2);
        if (filtered.length > 0) return td;
      }
      await SLEEP(500);
    }
    return null;
  }

  async function scrapeAllPages() {
    state.isScraping = true;
    state.allReports = [];
    state.scrapedPages = new Set();
    let pageNum = 1;

    console.log('[RP] scrapeAllPages started');
    await SLEEP(500);
    const first = extractFromCurrentPage();
    first.forEach(r => { if (!state.allReports.find(x => x.casNo === r.casNo)) state.allReports.push(r); });
    state.scrapedPages.add(1);
    addLog(`الصفحة 1: ${first.length} بلاغ`, 'ok');
    console.log(`[RP] Page 1: ${first.length} reports`);

    while (!state.stopRequested) {
      if (!hasNextPage()) {
        addLog('لا يوجد صفحة تالية', 'info');
        console.log('[RP] No next page');
        break;
      }

      pageNum++;
      if (pageNum > 50) { addLog('تم الوصول للحد الأقصى (50 صفحة)', 'warn'); break; }

      addLog(`جاري الانتقال للصفحة ${pageNum}...`, 'info');
      console.log(`[RP] Clicking next → page ${pageNum}`);
      clickNextPage();

      await SLEEP(800);
      const tableData = await waitForTable(12000);
      if (!tableData) {
        addLog(`الصفحة ${pageNum}: فشل تحميل الجدول`, 'error');
        console.log(`[RP] Page ${pageNum}: table load failed`);
        break;
      }

      const reports = extractFromCurrentPage();
      reports.forEach(r => { if (!state.allReports.find(x => x.casNo === r.casNo)) state.allReports.push(r); });
      state.scrapedPages.add(pageNum);
      addLog(`الصفحة ${pageNum}: ${reports.length} بلاغ`, 'ok');
      console.log(`[RP] Page ${pageNum}: ${reports.length} reports`);

      await SLEEP(600);
    }

    state.isScraping = false;
    addLog(`إجمالي البلاغات: ${state.allReports.length} من ${state.scrapedPages.size} صفحات`, 'ok');
    console.log(`[RP] Total: ${state.allReports.length} reports from ${state.scrapedPages.size} pages`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Show Settings Modal
  // ══════════════════════════════════════════════════════════════════
  async function showSettings() {
    overlay.classList.add('visible');
    settingsModal.classList.add('visible');
    reportsList.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div><div>جاري تحميل البلاغات من كل الصفحات...</div></div>';
    dateGrid.innerHTML = '';
    state.selectedReports = [];
    state._selectedDate = '';
    state.orderIdFilter.clear();
    state.sortMode = 'scraped';
    state.currentIndex = 0;
    state.isPaused = false;
    state.pausePromise = null;

    // Reset UI elements
    document.getElementById('rp-order-id-filter').value = '';
    document.getElementById('rp-order-filter-status').style.display = 'none';
    document.getElementById('rp-sort-select').value = 'scraped';

    // Check for resume state
    const resumeData = loadResumeState();
    if (resumeData && resumeData.selectedReports && resumeData.selectedReports.length > 0) {
      const resume = confirm(`🔄 تم العثور على جلسة سابقة محفوظة (${resumeData.selectedReports.length} بلاغ متبقي).\n\nهل تريد استئناف المعالجة من حيث توقفت؟`);
      if (resume) {
        state.sessionStartTime = resumeData.sessionStartTime || Date.now();
        await scrapeAllPages();
        // Re-match saved reports with freshly scraped ones
        const savedCasNos = new Set(resumeData.selectedReports.map(r => r.casNo));
        state.selectedReports = state.allReports.filter(r => savedCasNos.has(r.casNo));
        applyResumeState(resumeData);
        renderDateChips();
        renderReportsList();
        addLog(`✅ تم استئناف الجلسة: ${state.selectedReports.length} بلاغ للمتابعة`, 'ok');
        return;
      } else {
        clearResumeState();
      }
    }

    await scrapeAllPages();

    console.log(`[RP] After scrape: ${state.allReports.length} reports`, state.allReports.slice(0, 3));
    addLog(`تم جلب ${state.allReports.length} بلاغ`, 'ok');

    renderDateChips();
    renderReportsList();
  }

  function hideSettings() {
    overlay.classList.remove('visible');
    settingsModal.classList.remove('visible');
  }

  function extractDates() {
    const dates = new Set();
    for (const r of state.allReports) {
      if (r.date) dates.add(r.date);
    }
    return [...dates].sort().reverse();
  }

  function renderDateChips() {
    dateGrid.innerHTML = '';
    const dates = extractDates();
    console.log(`[RP] renderDateChips: dates found = ${dates.length}`, dates);

    // Build date labels map
    const now = new Date();
    const today = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const yesterday = new Date(now.getTime() - 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    console.log(`[RP] Date check: today="${today}", yesterday="${yesterday}", tomorrow="${tomorrow}"`, 'dates from reports:', dates);

    function getDateLabel(dateStr) {
      if (dateStr === today) return 'اليوم';
      if (dateStr === yesterday) return 'أمس';
      if (dateStr === tomorrow) return 'غداً';
      return dateStr;
    }

    function getDateEmoji(dateStr) {
      if (dateStr === today) return '📅';
      if (dateStr === yesterday) return '⏪';
      if (dateStr === tomorrow) return '⏩';
      return '📆';
    }

    // Sort dates: today first, then tomorrow, then yesterday, then others
    const priority = {};
    priority[today] = 0;
    priority[tomorrow] = 1;
    priority[yesterday] = 2;
    const sorted = [...dates].sort((a, b) => {
      const pa = priority[a] !== undefined ? priority[a] : 3;
      const pb = priority[b] !== undefined ? priority[b] : 3;
      return pa - pb;
    });

    // All chip
    const allChip = el('div', {
      className: 'rp-date-chip all-dates',
      textContent: `الكل (${state.allReports.length})`,
      onClick: () => {
        state._selectedDate = '';
        document.querySelectorAll('.rp-date-chip').forEach(c => c.classList.remove('selected'));
        allChip.classList.add('selected');
        renderReportsList();
      },
    });
    dateGrid.appendChild(allChip);

    // Date chips
    for (const date of sorted) {
      const count = state.allReports.filter(r => r.date === date).length;
      const label = getDateLabel(date);
      const emoji = getDateEmoji(date);
      const chip = el('div', {
        className: 'rp-date-chip',
        textContent: `${emoji} ${label} (${count})`,
        onClick: () => {
          console.log(`[RP] Date chip clicked: "${date}"`);
          state._selectedDate = date;
          document.querySelectorAll('.rp-date-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          renderReportsList();
        },
      });
      dateGrid.appendChild(chip);
    }

    // Auto-select today if available
    const todayChip = [...dateGrid.querySelectorAll('.rp-date-chip')].find(c => c.textContent.includes('اليوم'));
    console.log(`[RP] Auto-select: todayChip found =`, todayChip ? todayChip.textContent : 'NULL');
    if (todayChip) {
      todayChip.click();
    } else {
      console.log('[RP] Auto-select: falling back to allChip');
      allChip.click();
    }
  }

  function getFilteredAndSortedReports() {
    let reports = [...state.allReports];

    // Apply order ID filter if active
    if (state.orderIdFilter.size > 0) {
      reports = reports.filter(r => state.orderIdFilter.has(r.casNo));
    }

    // Apply date filter (only if no order ID filter is active)
    const selectedDate = state._selectedDate || '';
    if (state.orderIdFilter.size === 0 && selectedDate) {
      reports = reports.filter(r => r.date === selectedDate);
    }

    // Apply sorting
    switch (state.sortMode) {
      case 'cas-asc':
        reports.sort((a, b) => a.casNo.localeCompare(b.casNo));
        break;
      case 'cas-desc':
        reports.sort((a, b) => b.casNo.localeCompare(a.casNo));
        break;
      case 'name-asc':
        reports.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'name-desc':
        reports.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'date-asc':
        reports.sort((a, b) => {
          const da = a.date ? new Date(a.date.split('/').reverse().join('-')) : new Date(0);
          const db = b.date ? new Date(b.date.split('/').reverse().join('-')) : new Date(0);
          return da - db;
        });
        break;
      case 'date-desc':
        reports.sort((a, b) => {
          const da = a.date ? new Date(a.date.split('/').reverse().join('-')) : new Date(0);
          const db = b.date ? new Date(b.date.split('/').reverse().join('-')) : new Date(0);
          return db - da;
        });
        break;
      case 'input-order':
        if (state.orderIdFilter.size > 0 && state.orderIdFilterOrder.length > 0) {
          const orderMap = new Map(state.orderIdFilterOrder.map((cas, i) => [cas, i]));
          reports.sort((a, b) => (orderMap.get(a.casNo) ?? 9999) - (orderMap.get(b.casNo) ?? 9999));
        }
        break;
      // 'scraped' keeps original order
    }

    return reports;
  }

  function renderReportsList() {
    reportsList.innerHTML = '';
    state.selectedReports = [];

    const filtered = getFilteredAndSortedReports();
    const selectedDate = state._selectedDate || '';
    const totalCount = state.orderIdFilter.size > 0 ? state.allReports.length : (selectedDate ? state.allReports.filter(r => r.date === selectedDate).length : state.allReports.length);

    console.log(`[RP] renderReportsList: orderFilter=${state.orderIdFilter.size}, selectedDate="${selectedDate}", sort=${state.sortMode}, filtered=${filtered.length} from ${totalCount}`);

    const titleSuffix = state.orderIdFilter.size > 0 
      ? ` (مصفاة: ${filtered.length} من ${state.allReports.length})`
      : ` (${filtered.length}/${totalCount})`;
    reportsSectionTitle.innerHTML = `📋 البلاغات المتاحة${titleSuffix}`;

    if (filtered.length === 0) {
      let msg = 'لا توجد بلاغات';
      if (state.orderIdFilter.size > 0) {
        msg = `لم يتم العثور على أي من ${state.orderIdFilter.size} رقم طلب تم تصفيته`;
      } else if (selectedDate) {
        msg = `لا توجد بلاغات في ${selectedDate}`;
      }
      reportsList.innerHTML = `<div style="color:#7a9cc8;font-size:11px;padding:12px;text-align:center;">${msg}</div>`;
      return;
    }

    // Add table header
    const headerRow = el('div', {
      style: 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:#0d1117;border-bottom:2px solid #e67e22;font-size:10px;font-weight:700;color:#e67e22;border-radius:6px 6px 0 0;margin-bottom:2px;',
    }, [
      el('span', { style: 'width:16px;', textContent: '' }),
      el('span', { style: 'min-width:140px;direction:ltr;text-align:left;', textContent: 'رقم البلاغ' }),
      el('span', { style: 'flex:1;', textContent: 'اسم العميل' }),
      el('span', { style: 'min-width:75px;text-align:center;', textContent: 'التاريخ' }),
    ]);
    reportsList.appendChild(headerRow);

    for (const report of filtered) {
      const checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedReports.push(report);
        } else {
          state.selectedReports = state.selectedReports.filter(r => r.casNo !== report.casNo);
        }
        updateSelectAll();
        updateSelectedCount();
      });

      const displayName = report.name || '—';

      const item = el('label', { className: 'rp-report-item' }, [
        checkbox,
        el('span', { className: 'rp-report-cas', textContent: report.casNo }),
        el('span', { className: 'rp-report-name', textContent: displayName, title: displayName }),
        el('span', { className: 'rp-report-date', textContent: report.date || '--' }),
      ]);
      reportsList.appendChild(item);
    }

    // Auto-select all filtered reports
    state.selectedReports = [...filtered];

    const selectAll = document.getElementById('rp-select-all');
    if (selectAll) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    }
    updateSelectedCount();
  }

  function updateSelectAll() {
    const selectAll = document.getElementById('rp-select-all');
    if (!selectAll) return;
    const selectedDate = state._selectedDate || '';
    const filtered = selectedDate
      ? state.allReports.filter(r => r.date === selectedDate)
      : state.allReports;
    selectAll.checked = state.selectedReports.length === filtered.length && filtered.length > 0;
    selectAll.indeterminate = state.selectedReports.length > 0 && state.selectedReports.length < filtered.length;
    updateSelectedCount();
  }

  function updateSelectedCount() {
    const count = state.selectedReports.length;
    if (count > 0) {
      selectedCountEl.textContent = `✅ تم تحديد ${count} بلاغ`;
      selectedCountEl.style.display = 'block';
      startBtn.textContent = `▶ بدء المعالجة (${count})`;
    } else {
      selectedCountEl.style.display = 'none';
      startBtn.textContent = '▶ بدء المعالجة';
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Check Serial in Report Tab
  // ══════════════════════════════════════════════════════════════════
  function checkSerialInDoc(doc) {
    const selectors = [
      '#ldv_serialnumber',
      '#ldv_technicalserialnumber',
      '[aria-label*="الرقم المسلسل"]',
      '[aria-label*="Serial"]',
      'input[id*="serial"]',
    ];
    for (const sel of selectors) {
      const input = doc.querySelector(sel);
      if (input && input.value && input.value.trim().length > 4) {
        return true;
      }
    }
    return false;
  }

  function checkSerialInDocDeep(doc) {
    if (checkSerialInDoc(doc)) return true;
    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (checkSerialInDoc(iDoc)) return true;
      } catch (e) { /* cross-origin */ }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Click Next Button on Report Page
  // ══════════════════════════════════════════════════════════════════
  function clickNextOnReport(doc) {
    const selectors = [
      '#nextButton',
      'button#nextButton',
      'button[aria-label="التالي"]',
      'button[aria-label="Next"]',
    ];
    for (const sel of selectors) {
      const btn = doc.querySelector(sel);
      if (btn) { btn.click(); return true; }
    }

    const allBtns = doc.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const btn of allBtns) {
      const txt = (btn.textContent || btn.value || '').trim();
      if (txt === 'التالي' || txt.toLowerCase() === 'next') {
        btn.click();
        return true;
      }
    }

    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (clickNextOnReport(iDoc)) return true;
      } catch (e) { /* cross-origin */ }
    }

    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Wait for Report Page to Load
  // ══════════════════════════════════════════════════════════════════
  function waitForReportLoad(tab, timeout = 20000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        try {
          const readyState = tab.document.readyState;
          if (readyState === 'complete' || readyState === 'interactive') {
            const hasForm = tab.document.querySelector('input, select, textarea, #nextButton');
            if (hasForm || Date.now() - start > 8000) { resolve(true); return; }
          }
        } catch (e) {}
        if (Date.now() - start > timeout) { resolve(false); return; }
        setTimeout(check, 800);
      };
      check();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  Process Single Report
  // ══════════════════════════════════════════════════════════════════
  async function processReport(report) {
    if (state.stopRequested) return false;

    const { url, casNo, name } = report;
    setStatus(`جاري فحص: ${casNo}`, 'warn');
    addLog(`فتح: ${casNo} | ${name}`, 'info');

    const reportTab = window.open(url, '_blank');
    if (!reportTab) {
      addLog(`فشل فتح التبويب لـ ${casNo}`, 'error');
      report._hasData = false;
      report._status = 'فشل الفتح';
      return false;
    }

    const loaded = await waitForReportLoad(reportTab, 20000);
    if (!loaded) {
      addLog(`⏱ انتهى الوقت: ${casNo}`, 'error');
      state.totalProcessed++;
      state.totalSkipped++;
      updateStats();
      report._hasData = false;
      report._status = 'انتهى الوقت';
      try { reportTab.close(); } catch (e) {}
      return false;
    }

    const hasData = checkSerialInDocDeep(reportTab.document);
    state.totalProcessed++;

    if (hasData) {
      state.totalWithData++;
      addLog(`✅ ${casNo} - فيه داتا → فتح الصفحة 2`, 'ok');
      setStatus(`${casNo} - فيه داتا ✓`, 'ok');
      report._hasData = true;
      report._status = 'فيه داتا';

      await SLEEP(1500);
      const clicked = clickNextOnReport(reportTab.document);
      if (clicked) {
        addLog(`➡️ ${casNo} - تم الضغط على التالي`, 'ok');
        await SLEEP(2500);
        await waitForReportLoad(reportTab, 15000);
      } else {
        addLog(`⚠️ ${casNo} - لم يتم العثور على زر التالي`, 'skip');
      }
    } else {
      state.totalSkipped++;
      addLog(`❌ ${casNo} - مفيش داتا (قفل التبويب)`, 'skip');
      setStatus(`${casNo} - مفيش داتا`, 'warn');
      report._hasData = false;
      report._status = 'مفيش داتا';
      try { reportTab.close(); } catch (e) {}
    }

    updateStats();
    return hasData;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Main Run (with Concurrency Control)
  // ══════════════════════════════════════════════════════════════════
  async function run() {
    if (state.isRunning) return;

    if (state.selectedReports.length === 0) {
      addLog('لم يتم تحديد أي بلاغ!', 'error');
      return;
    }

    state.isRunning = true;
    state.stopRequested = false;
    state.isPaused = false;
    state.pausePromise = null;
    state.totalProcessed = 0;
    state.totalWithData = 0;
    state.totalSkipped = 0;
    state.currentIndex = 0;
    state.sessionStartTime = Date.now();
    miniLog.innerHTML = '';

    hideSettings();
    miniMenu.classList.add('visible');
    fab.classList.add('hidden');

    addLog(`بدء معالجة ${state.selectedReports.length} بلاغ (Concurrency: ${state.concurrencyLimit})...`, 'info');
    setStatus(`معالجة ${state.selectedReports.length} بلاغ...`, 'warn');

    // Concurrency-controlled processing
    const workers = [];
    for (let i = 0; i < state.selectedReports.length; i++) {
      if (state.stopRequested) break;
      
      // Wait for available slot
      await acquireSlot();
      
      if (state.stopRequested) { releaseSlot(); break; }
      
      // Check pause
      await waitIfPaused();
      if (state.stopRequested) { releaseSlot(); break; }

      const report = state.selectedReports[i];
      state.currentIndex = i;
      
      // Launch worker
      const worker = (async () => {
        try {
          await processReport(report);
        } finally {
          releaseSlot();
          saveResumeState(); // Save progress after each report
        }
      })();
      workers.push(worker);
      
      await SLEEP(300); // Small delay between launches
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    state.isRunning = false;
    clearResumeState(); // Clear resume on successful completion
    miniStopBtn.textContent = '🔄 معالجة جديدة';
    miniStopBtn.style.background = '#27ae60';

    const summary = `اكتمل - معالجة: ${state.totalProcessed} | فيها داتا: ${state.totalWithData} | متقفلاش: ${state.totalSkipped}`;
    addLog(summary, 'ok');
    setStatus(summary, 'ok');
  }

  // ══════════════════════════════════════════════════════════════════
  //  Event Listeners
  // ══════════════════════════════════════════════════════════════════
  fab.addEventListener('click', () => {
    const isOnOrders = window.location.href.includes('/Orders/');
    if (!isOnOrders) {
      window.open(ORDERS_URL, '_blank');
      return;
    }
    showSettings();
  });

  settingsClose.addEventListener('click', hideSettings);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideSettings(); });

  document.getElementById('rp-select-all').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const filtered = getFilteredAndSortedReports();
    state.selectedReports = checked ? [...filtered] : [];
    document.querySelectorAll('.rp-report-item input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
    updateSelectedCount();
  });

  // Order ID Filter - Apply
  document.getElementById('rp-apply-order-filter').addEventListener('click', () => {
    const text = document.getElementById('rp-order-id-filter').value;
    const casNumbers = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Extract CAS number from line (handles "CAS2026..." or "رقم الطلب CAS2026..." or "CAS2026... | Serial: ...")
        const match = line.match(/CAS\d+/);
        return match ? match[0] : line;
      });
    
    state.orderIdFilter = new Set(casNumbers);
    state.orderIdFilterOrder = casNumbers; // Preserve input order
    state._selectedDate = ''; // Clear date filter when order filter is active
    state.sortMode = 'input-order'; // Auto-select input order
    document.getElementById('rp-sort-select').value = 'input-order'; // Update UI
    
    document.getElementById('rp-order-filter-status').style.display = 'block';
    document.getElementById('rp-order-filter-status').textContent = `✅ تم تصفية ${state.orderIdFilter.size} رقم طلب`;
    document.getElementById('rp-order-filter-status').style.color = '#2bd46f';
    
    // Update date chips selection
    document.querySelectorAll('.rp-date-chip').forEach(c => c.classList.remove('selected'));
    const allChip = document.querySelector('.rp-date-chip.all-dates');
    if (allChip) allChip.classList.add('selected');
    
    renderReportsList();
    console.log('[RP] Order ID filter applied:', state.orderIdFilter.size, 'numbers, sortMode=input-order');
  });

  // Order ID Filter - Clear
  document.getElementById('rp-clear-order-filter').addEventListener('click', () => {
    document.getElementById('rp-order-id-filter').value = '';
    state.orderIdFilter.clear();
    state.orderIdFilterOrder = [];
    state.sortMode = 'scraped';
    document.getElementById('rp-sort-select').value = 'scraped';
    document.getElementById('rp-order-filter-status').style.display = 'none';
    renderReportsList();
    console.log('[RP] Order ID filter cleared, sortMode=scraped');
  });

  // Sort Select
  document.getElementById('rp-sort-select').addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    renderReportsList();
    console.log('[RP] Sort mode changed to:', state.sortMode);
  });

  startBtn.addEventListener('click', run);
  cancelBtn.addEventListener('click', hideSettings);
  
  // Export buttons
  document.getElementById('rp-export-csv').addEventListener('click', () => {
    const reports = getFilteredAndSortedReports();
    if (reports.length === 0) { addLog('لا توجد بلاغات للتصدير', 'error'); return; }
    // Add status to each report for export
    const exportData = reports.map(r => ({ ...r, _hasData: false, _status: '—' }));
    exportToCSV(exportData, `report-processor-${Date.now()}.csv`);
    addLog(`📊 تم تصدير ${reports.length} بلاغ إلى CSV`, 'ok');
  });
  
  document.getElementById('rp-export-xlsx').addEventListener('click', () => {
    const reports = getFilteredAndSortedReports();
    if (reports.length === 0) { addLog('لا توجد بلاغات للتصدير', 'error'); return; }
    const exportData = reports.map(r => ({ ...r, _hasData: false, _status: '—' }));
    exportToExcel(exportData, `report-processor-${Date.now()}.xlsx`);
  });

  miniStopBtn.addEventListener('click', () => {
    if (state.isRunning) {
      state.stopRequested = true;
      addLog('تم طلب الإيقاف...', 'skip');
      setStatus('جاري الإيقاف...', 'warn');
    } else {
      miniMenu.classList.remove('visible');
      fab.classList.remove('hidden');
      showSettings();
    }
  });

  document.getElementById('rp-mini-close').addEventListener('click', () => {
    if (state.isRunning) {
      state.stopRequested = true;
    }
    miniMenu.classList.remove('visible');
    fab.classList.remove('hidden');
  });

})();
