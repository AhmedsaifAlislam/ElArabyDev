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

  // النطاق: صفحة أوامر الشغل فقط (/Orders/) — لا أيقونة ولا واجهة في أي صفحة أخرى.
  // الـ runner يستطيع الحقن في أي تبويب، فالحماية لازم تكون داخل السكربت نفسه.
  if (!/\/Orders(\/|$|[?#])/i.test(location.pathname)) {
    console.info('[rp] خارج صفحة أوامر الشغل — لا تشغيل');
    return;
  }

  // حارس التكرار: الـ runner قد يحقن الملف أكثر من مرة عند كل ضغطة.
  // بدونه تتكرر المستمعات وتُبنى عناصر منفصلة عن الـ DOM الظاهر.
  if (window.__eaReportProcessorInited) return;
  window.__eaReportProcessorInited = true;

  // الأيقونة (الفاب): fabs-controller يتولى الحجم/اللون/الموضع والرص،
  // لكنه لا ينشئ العنصر — لذلك ننشئه هنا.
  function getFab() {
    try { return document.getElementById('rp-fab'); } catch (_) { return null; }
  }

  function ensureFab() {
    let f = getFab();
    if (f) return f;
    f = document.createElement('button');
    f.id = 'rp-fab';
    f.type = 'button';
    f.title = 'معالج البلاغات';
    f.textContent = '📋';
    // شكل مؤقت حتى يلتقطه fabs-controller (scanAndApply كل 1.5s) ويطبّق شكله
    Object.assign(f.style, {
      position: 'fixed', bottom: '70px', right: '16px', zIndex: '2147483640',
      width: '32px', height: '32px', borderRadius: '50%',
      border: '1px solid #2a4a7a', background: 'linear-gradient(135deg,#1a1d27,#2a2d3e)',
      color: '#e67e22', fontSize: '16px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1'
    });
    document.documentElement.appendChild(f);
    return f;
  }

  function setFabHidden(hidden) {
    const f = getFab();
    if (!f) return;
    f.classList.toggle('hidden', !!hidden);
    if (hidden) f.style.setProperty('display', 'none', 'important');
    else f.style.removeProperty('display');
  }

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
    // سبب فشل آخر عملية حصاد — يُعرض في قائمة البلاغات بدل رسالة «لا توجد» المبهمة
    _scrapeError: '',
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
  const REGEX = { CAS: /CAS\d+/, PHONE: /01[0-9]{9}/g };

  // ══════════════════════════════════════════════════════════════════
  //  CAS Normalization  — المصدر الوحيد لمطابقة أرقام الطلبات
  // ══════════════════════════════════════════════════════════════════
  // سبب وجودها: `getCellJsonValue` قد ترجع object/رقم، و`textContent` قد يحمل
  // مسافات أو محارف اتجاه غير مرئية (RTL/LTR) — فكانت المقارنة الحرفية
  // `Set.has(r.casNo)` تفشل بصمت والفلتر يرجع صفرًا بلا أي تفسير.
  const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

  function stripInvisible(v) {
    return String(v == null ? '' : v).replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * يطبّع أي تمثيل لرقم الطلب إلى `CAS...` بأحرف كبيرة بلا مسافات.
   * يقبل: نص، رقم، أو كائن JSON من data-value.
   * @param {*} value
   * @returns {string}
   */
  function normalizeCas(value) {
    if (value == null) return '';
    let s = '';
    if (typeof value === 'object') {
      const obj = value;
      s = obj.Name || obj.name || obj.Value || obj.value || obj.Id || obj.id || '';
      if (!s) { try { s = JSON.stringify(obj); } catch (_) { s = ''; } }
    } else {
      s = String(value);
    }
    s = stripInvisible(s);
    const m = s.match(/CAS\s*\d+/i);
    if (m) return m[0].replace(/\s+/g, '').toUpperCase();
    return s.replace(/\s+/g, '').toUpperCase();
  }

  /** أرقام الرقم المسلسل فقط — للمطابقة الاحتياطية لو اختلفت البادئة. */
  function casDigits(value) {
    const m = normalizeCas(value).match(/\d{10,}/);
    return m ? m[0].replace(/^0+/, '') : '';
  }

  /** هل القيمتان لنفس البلاغ؟ (تطبيع كامل + مطابقة احتياطية بالأرقام) */
  function sameCas(a, b) {
    const na = normalizeCas(a);
    const nb = normalizeCas(b);
    if (na && nb && na === nb) return true;
    const da = casDigits(a);
    const db = casDigits(b);
    return !!da && da === db;
  }

  /** DD/MM/YYYY → milliseconds (0 لو غير صالح) */
  function dateToMs(dateStr) {
    const parts = String(dateStr || '').split('/');
    if (parts.length !== 3) return 0;
    const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

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
    const raw = stripInvisible(dateStr);
    if (!raw) return '';

    const p2 = (v) => String(v).padStart(2, '0');

    // ISO أو datetime: 2026-10-29 / 2026-10-29T00:00:00Z
    let m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) return `${p2(m[3])}/${p2(m[2])}/${m[1]}`;

    // DD/MM/YYYY أو DD-MM-YYYY (مع وقت/AM/PM أو بدونه)
    m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let year = m[3];
      if (year.length === 2) year = '20' + year;
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      // البوابة DD/MM — لو الشهر مستحيل (مثال 10/29/2026) نقلبها MM/DD
      if (b >= 1 && b <= 12) return `${p2(a)}/${p2(b)}/${year}`;
      if (a >= 1 && a <= 12) return `${p2(b)}/${p2(a)}/${year}`;
    }

    // صيغ نسبية (اليوم/أمس/غداً) وأي صيغة أخرى يفهمها Date
    const parsed = parseFlexibleDate(raw);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(parsed)) return parsed;

    const d = new Date(raw);
    if (!isNaN(d.getTime())) return formatDate(d);

    return raw; // صيغة غير معروفة: تُعرض كما هي (المطابقة تبقى حرفية عليها)
  }

  function getCellValue(row, headerName) {
    const cells = row.querySelectorAll('td');
    for (const td of cells) {
      if (td.getAttribute('data-th') === headerName) {
        const aria = stripInvisible(td.getAttribute('aria-label'));
        return aria || stripInvisible(td.textContent) || '';
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
      // البلاغات المُعالجة فعليًا (لا شريحة من الترتيب) — `slice(0, currentIndex)`
      // كانت تعتمد على index غير متزامن فتفقد بلاغات أو تسجّل بلاغات لم تُعالج.
      processedCasNos: [...new Set(
        state.selectedReports
          .filter(r => r._hasData !== undefined)
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
    #rp-fab.hidden { display: none !important; }

    #rp-overlay {
      position: fixed !important; inset: 0 !important; background: rgba(0,0,0,.7) !important;
      z-index: 2147483645 !important; display: none !important;
    }
    #rp-overlay.visible { display: block !important; }

    #rp-settings {
      position: fixed !important; top: 50% !important; left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 480px !important; max-height: 92vh !important;
      background: #1a1d27 !important; border: 1px solid #2a2d3e !important;
      border-radius: 14px !important; box-shadow: 0 20px 60px rgba(0,0,0,.9) !important;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif !important;
      font-size: 13px !important; color: #c8d0e0 !important;
      z-index: 2147483647 !important; direction: rtl !important;
      overflow: hidden !important; display: none !important;
      flex-direction: column !important;
    }
    #rp-settings.visible { display: flex !important; }

    #rp-settings-header {
      background: linear-gradient(135deg, #e67e22 0%, #d35400 100%) !important;
      padding: 12px 16px !important; display: flex !important;
      align-items: center !important; justify-content: space-between !important;
      flex: 0 0 auto !important;
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
      gap: 12px !important; flex: 1 1 auto !important; min-height: 0 !important;
      max-height: none !important; overflow-y: auto !important;
    }
    #rp-settings-body::-webkit-scrollbar { width: 4px !important; }
    #rp-settings-body::-webkit-scrollbar-thumb { background: #2a3050 !important; border-radius: 2px !important; }

    /* شريط التنفيذ الثابت: زر «بدء المعالجة» كان يُقصّ أسفل الشاشة
       فيظن المستخدم أن «تطبيق التصفية» هو زر التشغيل. */
    #rp-settings-footer {
      flex: 0 0 auto !important; padding: 10px 16px 12px !important;
      background: #141722 !important; border-top: 1px solid #2a2d3e !important;
      box-shadow: 0 -6px 18px rgba(0,0,0,.35) !important;
    }
    .rp-step-hint {
      font-size: 10px !important; color: #8fa3c0 !important; line-height: 1.8 !important;
      background: rgba(41,128,185,.12) !important; border: 1px dashed #2a4a7a !important;
      border-radius: 6px !important; padding: 6px 8px !important; margin-bottom: 4px !important;
    }
    .rp-step-hint b { color: #f0b429 !important; }
    .rp-start-hint { font-size: 10px !important; color: #8fa3c0 !important; text-align: center !important; margin-top: 6px !important; }

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
    .rp-btn-apply { background: #2980b9 !important; color: #fff !important; border: 1px solid #3fa9f5 !important; }
    .rp-btn-ghost { background: #2c3e50 !important; color: #dbe6f2 !important; border: 1px solid #3a4a5f !important; }
    #rp-settings-start { padding: 12px !important; font-size: 13px !important; }

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
  const stepHint = el('div', {
    className: 'rp-step-hint',
    innerHTML: '1) الصق أرقام الطلبات → 2) <b>🔎 تصفية القائمة</b> → 3) <b>▶ بدء المعالجة</b> (الزر الأخضر الثابت أسفل النافذة).'
  });
  const orderIdSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '1) تصفية بأرقام الطلبات' });
  const orderIdTextarea = el('textarea', { 
    id: 'rp-order-id-filter', 
    placeholder: 'الصق أرقام الطلبات هنا (كل سطر رقم)\nمثال:\nCAS2026082553172366\nCAS2026081552971241\nCAS2026082353144001',
    style: 'width:100%;min-height:80px;padding:8px;border:1px solid #2a4a7a;border-radius:6px;background:#0d1117;color:#c8d0e0;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box;margin-bottom:8px;'
  });
  const orderIdActions = el('div', { style: 'display:flex;gap:6px;margin-bottom:8px;' }, [
    el('button', { id: 'rp-apply-order-filter', className: 'rp-btn rp-btn-apply', style: 'flex:2;padding:9px;font-size:11px;', textContent: '🔎 تصفية القائمة' }),
    el('button', { id: 'rp-clear-order-filter', className: 'rp-btn rp-btn-ghost', style: 'flex:1;padding:9px;font-size:11px;', textContent: '🗑 مسح' }),
  ]);
  const orderIdStatus = el('div', { id: 'rp-order-filter-status', style: 'font-size:10px;color:#7a9cc8;text-align:center;padding:4px;display:none;' });
  const refreshReportsBtn = el('button', {
    id: 'rp-refresh-reports',
    className: 'rp-btn rp-btn-ghost',
    style: 'width:100%;padding:7px;font-size:10px;margin-bottom:6px;',
    textContent: '🔁 تحديث القائمة (بعد توسيع البحث في البوابة)'
  });

  const dateSectionTitle = el('div', { className: 'rp-section-title', innerHTML: '2) اختر التاريخ (اختياري)' });
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

  const reportsSectionTitle = el('div', { id: 'rp-reports-title', className: 'rp-section-title', innerHTML: '3) البلاغات المتاحة' });
  const selectAllLabel = el('label', { className: 'rp-select-all' }, [
    el('input', { type: 'checkbox', id: 'rp-select-all' }),
    el('span', { textContent: 'تحديد الكل' }),
  ]);
  const reportsList = el('div', { className: 'rp-reports-list', id: 'rp-reports-list' });
  reportsList.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div><div>جاري تحميل البلاغات من كل الصفحات...</div></div>';

  const selectedCountEl = el('div', { id: 'rp-selected-count', style: 'text-align:center;font-size:12px;color:#f0b429;padding:6px;display:none;' });
  const startBtn = el('button', { className: 'rp-btn rp-btn-primary', id: 'rp-settings-start', textContent: '▶ بدء المعالجة' });
  const cancelBtn = el('button', { className: 'rp-btn rp-btn-ghost', id: 'rp-settings-cancel', textContent: 'إغلاق' });
  const exportCsvBtn = el('button', { className: 'rp-btn', id: 'rp-export-csv', textContent: '📊 تصدير CSV', style: 'background:#2980b9;color:#fff;' });
  const exportXlsxBtn = el('button', { className: 'rp-btn', id: 'rp-export-xlsx', textContent: '📈 تصدير Excel', style: 'background:#27ae60;color:#fff;' });
  const btnRow = el('div', { className: 'rp-btn-row' }, [startBtn, cancelBtn]);
  const exportRow = el('div', { className: 'rp-btn-row', style: 'margin-top:4px;' }, [exportCsvBtn, exportXlsxBtn]);

  const settingsBody = el('div', { id: 'rp-settings-body' }, [
    stepHint,
    orderIdSectionTitle, orderIdTextarea, orderIdActions, orderIdStatus, refreshReportsBtn,
    dateSectionTitle, dateGrid,
    sortSectionTitle, sortSelect,
    reportsSectionTitle, selectAllLabel, reportsList, selectedCountEl, exportRow,
  ]);
  const settingsFooter = el('div', { id: 'rp-settings-footer' }, [
    btnRow,
    el('div', { className: 'rp-start-hint', textContent: '⬆️ «تصفية القائمة» تختار البلاغات فقط — التنفيذ يبدأ من الزر الأخضر هنا.' }),
  ]);
  const settingsModal = el('div', { id: 'rp-settings' }, [settingsHeader, settingsBody, settingsFooter]);

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

  // اللوحات فقط — الأيقونة (الفاب) تُنسَّق مركزياً من fabs-controller،
  // **لكنه لا ينشئها**؛ لذلك ننشئها هنا وإلا لم تظهر أي أيقونة على الصفحة.
  if (!document.getElementById('rp-overlay')) document.documentElement.appendChild(overlay);
  if (!document.getElementById('rp-settings')) document.documentElement.appendChild(settingsModal);
  if (!document.getElementById('rp-mini-menu')) document.documentElement.appendChild(miniMenu);
  ensureFab();

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
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 3) return null;

    // ── رقم الطلب: data-value → data-th → data-name → الخلية الأولى → نص الصف ──
    // كل المسارات تمرّ على normalizeCas حتى لا يتحول object/رقم إلى قيمة لا
    // تطابق أبدًا في الفلتر (كان هذا أحد أسباب «تطبيق التصفية لا يفعل شيئًا»).
    let casNo = normalizeCas(getCellJsonValue(row, 'رقم الطلب'));
    if (!/^CAS\d+$/i.test(casNo)) casNo = normalizeCas(getCellValue(row, 'رقم الطلب'));
    if (!/^CAS\d+$/i.test(casNo)) casNo = normalizeCas(row.getAttribute('data-name'));
    if (!/^CAS\d+$/i.test(casNo) && cells[0]) casNo = normalizeCas(cells[0].textContent);
    if (!/^CAS\d+$/i.test(casNo)) casNo = normalizeCas(row.textContent.match(REGEX.CAS)?.[0] || '');
    if (!/^CAS\d+$/i.test(casNo)) return null;

    // ── اسم العميل: data-value (Name) → data-th → الخلية الثانية ──
    let name = '';
    const customerVal = getCellJsonValue(row, 'اسم العميل');
    if (customerVal && typeof customerVal === 'object') {
      name = stripInvisible(customerVal.Name || customerVal.name || '');
    } else if (customerVal != null && typeof customerVal !== 'object') {
      name = stripInvisible(customerVal);
    }
    if (!name) name = getCellValue(row, 'اسم العميل');
    if (!name && cells[1]) name = stripInvisible(cells[1].textContent);

    // ── التاريخ: data-th (بأسماء بديلة) → الخلية التاسعة (نفس ترتيب البوابة) ──
    let date = getCellValue(row, 'تاريخ الحجز');
    if (!date) {
      const altNames = ['تاريخ الحجز', 'التاريخ', 'Date', 'Created On', 'Created'];
      for (const alt of altNames) {
        date = getCellValue(row, alt);
        if (date) break;
      }
    }
    if (!date && cells[8]) date = stripInvisible(cells[8].textContent);
    date = normalizeReportDate(date);

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

  // بصمة أول صف — لمعرفة أن الشبكة تبدّلت فعلًا بعد الضغط على «التالي».
  // بدونها كان `waitForTable` يعيد الجدول القديم فورًا (لم يُستبدل بعد)
  // فيُقرأ نفس المحتوى ويُتخطّى صفحة كاملة.
  function firstRowSignature() {
    try {
      const td = findTable();
      if (!td || !td.rows.length) return '';
      const r = td.rows[0];
      return r.getAttribute('data-id') || (r.textContent || '').trim().slice(0, 80);
    } catch (_) { return ''; }
  }

  async function waitForTableChange(prevSig, maxWaitMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const td = findTable();
      if (td && td.rows.length) {
        const r = td.rows[0];
        const sig = r.getAttribute('data-id') || (r.textContent || '').trim().slice(0, 80);
        if (sig && sig !== prevSig) return td;
      }
      await SLEEP(300);
    }
    // لم يتغيّر شيء: نكمل بالجدول الحالي بدل التوقف الكامل
    return findTable();
  }

  // ── Pager helpers (نفس منطق control-panel.js المُجرَّب) ────────────────
  // الشبكة: <div class="view-pagination" data-current-page data-pages>
  //           <a data-page="2" class="entity-pager-next-link">
  // الاعتماد على «التالي» فقط يجعل الحصاد يبدأ من الصفحة الحالية وينتهي على
  // آخر صفحة — فالفتح التالي يقرأ آخر صفحة فقط. هنا نقرأ العدد الحقيقي للصفحات
  // وننتقل برقم الصفحة ثم نرجع للصفحة ١.
  function findPagerInfo() {
    let tableData = null;
    try { tableData = findTable(); } catch (_) {}
    if (!tableData) return { pager: null, root: null, total: 1, current: 1 };
    let root = tableData.table;
    for (let i = 0; i < 8 && root; i++) {
      if (root.querySelector && root.querySelector('.view-pagination, a[data-page]')) break;
      root = root.parentElement;
    }
    const pager = (root && root.querySelector) ? root.querySelector('.view-pagination') : null;
    const scope = pager || root;
    const links = scope ? Array.from(scope.querySelectorAll('a[data-page]')) : [];
    const nums = links.map(a => parseInt(a.getAttribute('data-page') || '0', 10)).filter(n => n > 0);
    const declared = pager ? (parseInt(pager.getAttribute('data-pages') || '', 10) || 0) : 0;
    const total = Math.max(1, declared, nums.length ? Math.max(...nums) : 0);
    let current = pager ? (parseInt(pager.getAttribute('data-current-page') || '', 10) || 0) : 0;
    if (!current && pager) {
      const active = pager.querySelector('li.active a[data-page]');
      current = active ? (parseInt(active.getAttribute('data-page') || '1', 10) || 1) : 1;
    }
    if (!current) current = 1;
    return { pager, root, total, current };
  }

  function gridRowsSignature() {
    try {
      const td = findTable();
      if (!td || !td.rows.length) return '';
      return td.rows.map(r => r.getAttribute('data-id') || (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)).join('|');
    } catch (_) { return ''; }
  }

  async function gotoReportPage(page, maxWaitMs = 9000) {
    const info = findPagerInfo();
    if (!info.pager) return false;
    if (info.current === page) return true;
    const link = info.pager.querySelector('a[data-page="' + page + '"]');
    if (!link) return false;
    const li = link.closest('li');
    if (li && (li.classList.contains('disabled') || li.classList.contains('hidden') || li.style.display === 'none')) return false;
    if (link.getAttribute('aria-disabled') === 'true') return false;

    const beforeSig = gridRowsSignature();
    const beforePage = info.current;
    try { link.click(); } catch (_) { return false; }

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await SLEEP(250);
      const nowInfo = findPagerInfo();
      const sig = gridRowsSignature();
      if (nowInfo.current !== beforePage || (sig && sig !== beforeSig)) {
        await SLEEP(300); // استقرار الرسم بعد AJAX
        return true;
      }
    }
    return false;
  }

  function findPagerLink(kind) {
    const sel = kind === 'prev'
      ? 'a.entity-pager-previous-link:not([aria-disabled="true"]), a[aria-label="Previous"], a[aria-label="السابق"]'
      : 'a.entity-pager-next-link:not([aria-disabled="true"])';
    let el = null;
    try { el = document.querySelector(sel); } catch (_) {}
    if (el) return el;
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const d = iframe.contentDocument || iframe.contentWindow.document;
        const x = d && d.querySelector(sel);
        if (x) return x;
      } catch (_) {}
    }
    return null;
  }

  async function gotoFirstPageLegacy() {
    for (let i = 0; i < 60; i++) {
      const prev = findPagerLink('prev');
      if (!prev) break;
      const li = prev.closest('li');
      if (li && (li.classList.contains('disabled') || li.classList.contains('hidden'))) break;
      const sig = firstRowSignature();
      prev.click();
      await waitForTableChange(sig, 9000);
      await SLEEP(250);
    }
  }

  async function scrapeAllPages() {
    state.isScraping = true;
    state.allReports = [];
    state.scrapedPages = new Set();
    state._scrapeError = '';
    const seen = new Set();

    console.log('[RP] scrapeAllPages started');
    addLog('جاري قراءة جدول البلاغات...', 'info');

    const firstTable = await waitForTable(15000);
    if (!firstTable) {
      state.isScraping = false;
      state._scrapeError = 'لم أجد جدول البلاغات في الصفحة. تأكد أنك على صفحة /Orders/ والجدول ظاهر (اضغط Search Results) ثم اضغط «🔁 تحديث القائمة».';
      addLog(state._scrapeError, 'error');
      console.warn('[RP] No table found — scrape aborted');
      return;
    }

    // ① ارجع لأول صفحة دائمًا (السبب الجذري لعدم عثور الفلتر على الأرقام).
    let info = findPagerInfo();
    if (info.pager && info.current > 1) {
      addLog(`الرجوع للصفحة 1 من ${info.current}...`, 'info');
      if (!await gotoReportPage(1)) addLog('تعذّر الرجوع للصفحة 1 — سأقرأ من الوضع الحالي', 'warn');
      info = findPagerInfo();
    } else if (!info.pager && findPagerLink('prev')) {
      addLog('الرجوع لأول صفحة...', 'info');
      await gotoFirstPageLegacy();
      info = findPagerInfo();
    }

    const hasPageLinks = !!(info.pager && info.pager.querySelector('a[data-page]') && info.total > 1);

    if (hasPageLinks) {
      // ② القراءة برقم الصفحة — لا نفترض أننا على الأولى ولا نتوقف عند «التالي».
      const totalPages = Math.min(info.total, 50);
      for (let p = 1; p <= totalPages; p++) {
        if (state.stopRequested) break;
        if (p > 1) {
          if (!await gotoReportPage(p)) { addLog(`تعذّر الانتقال للصفحة ${p} — توقفت القراءة`, 'warn'); break; }
        }
        await SLEEP(350);
        const reports = extractFromCurrentPage();
        let added = 0;
        for (const r of reports) {
          if (!r.casNo || seen.has(r.casNo)) continue;
          seen.add(r.casNo);
          state.allReports.push(r);
          added++;
        }
        state.scrapedPages.add(p);
        addLog(`الصفحة ${p}/${totalPages}: ${reports.length} صف — ${added} جديد`, 'ok');
        console.log(`[RP] Page ${p}/${totalPages}: ${reports.length} rows, ${added} new`);
      }
      // ③ ارجع للصفحة ١ حتى لا يبدأ التشغيل التالي من آخر صفحة.
      if (findPagerInfo().current !== 1) await gotoReportPage(1);
    } else {
      // شبكة بلا روابط صفحات رقمية: السلوك القديم «التالي» حتى النهاية.
      let pageNum = 1;
      let added = 0;
      extractFromCurrentPage().forEach(r => {
        if (r.casNo && !seen.has(r.casNo)) { seen.add(r.casNo); state.allReports.push(r); added++; }
      });
      state.scrapedPages.add(pageNum);
      addLog(`الصفحة 1: ${added} بلاغ`, 'ok');

      while (!state.stopRequested && hasNextPage()) {
        pageNum++;
        if (pageNum > 50) { addLog('تم الوصول للحد الأقصى (50 صفحة)', 'warn'); break; }
        const prevSig = firstRowSignature();
        clickNextPage();
        const tableData = await waitForTableChange(prevSig, 12000);
        if (!tableData) { addLog(`الصفحة ${pageNum}: فشل تحميل الجدول`, 'error'); break; }
        let n = 0;
        extractFromCurrentPage().forEach(r => {
          if (r.casNo && !seen.has(r.casNo)) { seen.add(r.casNo); state.allReports.push(r); n++; }
        });
        state.scrapedPages.add(pageNum);
        addLog(`الصفحة ${pageNum}: ${n} بلاغ`, 'ok');
        await SLEEP(600);
      }
    }

    state.isScraping = false;
    if (!state.allReports.length) {
      state._scrapeError = 'الجدول موجود لكن لم أستخرج منه أي رقم بلاغ — افتح «تشخيص» وأرسل أول صف.';
    }
    addLog(`إجمالي البلاغات: ${state.allReports.length} من ${state.scrapedPages.size} صفحات`, 'ok');
    console.log(`[RP] Total: ${state.allReports.length} reports from ${state.scrapedPages.size} pages`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Show Settings Modal
  // ══════════════════════════════════════════════════════════════════
  async function showSettings() {
    // حارس إعادة الدخول: الفتح من اللوحة والحدث يصلان معًا أحيانًا،
    // والحصاد الكامل مكلف (كل الصفحات) فلا يجوز تشغيله مرتين.
    if (state._settingsBusy) return;
    state._settingsBusy = true;
    try {
      await showSettingsInner();
    } catch (e) {
      console.error('[RP] showSettings failed:', e);
      addLog('خطأ أثناء تحميل البلاغات: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      state._settingsBusy = false;
    }
  }

  async function showSettingsInner() {
    overlay.classList.add('visible');
    settingsModal.classList.add('visible');
    const listEl = document.getElementById('rp-reports-list') || reportsList;
    listEl.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div><div>جاري تحميل البلاغات من كل الصفحات...</div></div>';
    (document.getElementById('rp-date-grid') || dateGrid).innerHTML = '';
    state.selectedReports = [];
    state._selectedDate = '';
    state.sortMode = 'scraped';
    state.currentIndex = 0;
    state.isPaused = false;
    state.pausePromise = null;
    state._listRendered = false;

    // ⚠️ لا نصفّر نص الفلتر ولا state.orderIdFilter هنا:
    // كان كل فتح للأداة يمسح أرقام المستخدم ويعيده للصفر.
    const sortSel0 = document.getElementById('rp-sort-select');
    if (sortSel0) sortSel0.value = 'scraped';
    const statusEl0 = document.getElementById('rp-order-filter-status');
    if (statusEl0) statusEl0.style.display = 'none';

    // Check for resume state
    const resumeData = loadResumeState();
    if (resumeData && resumeData.selectedReports && resumeData.selectedReports.length > 0) {
      const resume = confirm(`🔄 تم العثور على جلسة سابقة محفوظة (${resumeData.selectedReports.length} بلاغ متبقي).\n\nهل تريد استئناف المعالجة من حيث توقفت؟`);
      if (resume) {
        state.sessionStartTime = resumeData.sessionStartTime || Date.now();
        await scrapeAllPages();
        // Re-match saved reports with freshly scraped ones
        const savedCasNos = resumeData.selectedReports.map(r => normalizeCas(r.casNo));
        state.selectedReports = state.allReports.filter(r => savedCasNos.some(c => sameCas(r.casNo, c)));
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

    // أعد تطبيق الفلتر المحفوظ (لو المستخدم لصق أرقام ثم ضغط «تحديث القائمة»)
    const filterEl = document.getElementById('rp-order-id-filter');
    if (filterEl && filterEl.value.trim()) applyOrderFilter({ silent: true });
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
    return [...dates].sort((a, b) => dateToMs(b) - dateToMs(a));
  }

  function setDateChipsLocked(locked) {
    document.querySelectorAll('.rp-date-chip').forEach(c => {
      c.style.opacity = locked ? '0.45' : '';
      c.style.pointerEvents = locked ? 'none' : '';
      c.title = locked ? 'الفلتر بالأرقام نشط — اضغط «مسح التصفية» أولًا' : '';
    });
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
        if (state.orderIdFilter.size > 0) return;
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
          if (state.orderIdFilter.size > 0) return;
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

    // فلتر الأرقام نشط ⇒ شيب التاريخ لا تؤثر (كانت تُضغط بلا نتيجة)
    setDateChipsLocked(state.orderIdFilter.size > 0);
  }

  function getFilteredAndSortedReports() {
    let reports = [...state.allReports];

    // Apply order ID filter if active — بمطابقة مُطبَّعة (كانت حرفية فتفشل بصمت)
    if (state.orderIdFilter.size > 0) {
      const wanted = [...state.orderIdFilter];
      reports = reports.filter(r => wanted.some(c => sameCas(r.casNo, c)));
    }

    // Apply date filter (only if no order ID filter is active)
    const selectedDate = state._selectedDate || '';
    if (state.orderIdFilter.size === 0 && selectedDate) {
      reports = reports.filter(r => r.date === selectedDate);
    }

    // Apply sorting
    switch (state.sortMode) {
      case 'cas-asc':
        reports.sort((a, b) => normalizeCas(a.casNo).localeCompare(normalizeCas(b.casNo)));
        break;
      case 'cas-desc':
        reports.sort((a, b) => normalizeCas(b.casNo).localeCompare(normalizeCas(a.casNo)));
        break;
      case 'name-asc':
        reports.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'name-desc':
        reports.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'date-asc':
        reports.sort((a, b) => dateToMs(a.date) - dateToMs(b.date));
        break;
      case 'date-desc':
        reports.sort((a, b) => dateToMs(b.date) - dateToMs(a.date));
        break;
      case 'input-order':
        if (state.orderIdFilter.size > 0 && state.orderIdFilterOrder.length > 0) {
          const orderMap = new Map(state.orderIdFilterOrder.map((cas, i) => [normalizeCas(cas), i]));
          const idxOf = (r) => {
            const key = normalizeCas(r.casNo);
            if (orderMap.has(key)) return orderMap.get(key);
            for (const [k, i] of orderMap) if (sameCas(k, key)) return i;
            return 9999;
          };
          reports.sort((a, b) => idxOf(a) - idxOf(b));
        }
        break;
      // 'scraped' keeps original order
    }

    return reports;
  }

  function renderReportsList() {
    // عناصر حيّة من الـ DOM (وليس مراجع مغلقة) — لو أُعيد حقن السكربت أو أُعيد
    // بناء اللوحة، يبقى الرسم على العنصر الظاهر فعلًا.
    const listEl = document.getElementById('rp-reports-list') || reportsList;
    const titleEl = document.getElementById('rp-reports-title') || reportsSectionTitle;

    listEl.innerHTML = '';
    // حافظ على ما حدّده المستخدم عبر إعادة الرسم (تغيير الترتيب/الفلتر)
    const prevSelected = new Set(state.selectedReports.map(r => normalizeCas(r.casNo)));
    const hadSelection = state._listRendered === true;
    state.selectedReports = [];

    const filtered = getFilteredAndSortedReports();
    const selectedDate = state._selectedDate || '';
    const totalCount = state.orderIdFilter.size > 0 ? state.allReports.length : (selectedDate ? state.allReports.filter(r => r.date === selectedDate).length : state.allReports.length);

    console.log(`[RP] renderReportsList: orderFilter=${state.orderIdFilter.size}, selectedDate="${selectedDate}", sort=${state.sortMode}, filtered=${filtered.length} from ${totalCount}`);

    const titleSuffix = state.orderIdFilter.size > 0
      ? ` (مصفاة: ${filtered.length} من ${state.allReports.length})`
      : ` (${filtered.length}/${totalCount})`;
    if (titleEl) titleEl.innerHTML = `📋 البلاغات المتاحة${titleSuffix}`;

    if (filtered.length === 0) {
      let msg;
      if (state.allReports.length === 0) {
        msg = `<div style="color:#f0b429;font-weight:700;">لا توجد بلاغات محمّلة</div>
               <div style="margin-top:6px;">${state._scrapeError || 'اضغط «🔁 تحديث القائمة» بعد التأكد أن جدول Orders ظاهر.'}</div>`;
      } else if (state.orderIdFilter.size > 0) {
        const missing = [...state.orderIdFilter].filter(c => !state.allReports.some(r => sameCas(r.casNo, c)));
        msg = `<div style="color:#ff6b6b;font-weight:700;">❌ لا يوجد تطابق من ${state.orderIdFilter.size} رقم داخل ${state.allReports.length} بلاغ محمّل</div>`;
        if (missing.length) {
          msg += `<div style="margin-top:6px;color:#f0b429;direction:ltr;font-family:Consolas,monospace;font-size:10px;line-height:1.7;">${missing.slice(0, 8).join('<br>')}${missing.length > 8 ? '<br>…' : ''}</div>`;
        }
        msg += `<div style="margin-top:8px;color:#7a9cc8;">💡 الأرقام دي مش ضمن نتائج البحث الحالية — وسّع البحث في البوابة ثم «🔁 تحديث القائمة».</div>`;
      } else if (selectedDate) {
        msg = `لا توجد بلاغات في ${selectedDate}`;
      } else {
        msg = 'لا توجد بلاغات';
      }
      listEl.innerHTML = `<div style="color:#7a9cc8;font-size:11px;padding:12px;text-align:center;line-height:1.9;">${msg}</div>`;
      state._listRendered = true;
      updateSelectedCount();
      updateSelectAll();
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
    listEl.appendChild(headerRow);

    for (const report of filtered) {
      const key = normalizeCas(report.casNo);
      const checkbox = el('input', { type: 'checkbox' });
      // أول عرض: الكل محدد. بعدها: نحترم اختيار المستخدم.
      checkbox.checked = hadSelection ? prevSelected.has(key) : true;
      if (checkbox.checked) state.selectedReports.push(report);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedReports.push(report);
        } else {
          state.selectedReports = state.selectedReports.filter(r => normalizeCas(r.casNo) !== key);
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
      listEl.appendChild(item);
    }

    state._listRendered = true;
    updateSelectAll();
    updateSelectedCount();
  }

  function updateSelectAll() {
    const selectAll = document.getElementById('rp-select-all');
    if (!selectAll) return;
    // المقارنة بالقائمة المعروضة فعليًا (تشمل فلتر أرقام الطلبات والتاريخ وليس التاريخ وحده)
    const visible = getFilteredAndSortedReports();
    const selected = new Set(state.selectedReports.map(r => normalizeCas(r.casNo)));
    const selectedVisible = visible.filter(r => selected.has(normalizeCas(r.casNo))).length;
    selectAll.checked = selectedVisible === visible.length && visible.length > 0;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
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

  function checkSerialInDocDeep(doc, depth = 0) {
    if (!doc) return false;
    if (checkSerialInDoc(doc)) return true;
    if (depth >= 2) return false;
    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (checkSerialInDocDeep(iDoc, depth + 1)) return true;
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
      // المتصفح حجب النافذة المنبثقة (شائع بعد await داخل دالة async).
      // كان الخطأ يُسجَّل بدون تحديث العدادات فيبدو أن البلاغ «اختفى».
      const msg = `🚫 المتصفح منع فتح التبويب لـ ${casNo} — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة`;
      addLog(msg, 'error');
      setStatus(`محجوب: ${casNo}`, 'error');
      state.totalProcessed++;
      state.totalSkipped++;
      updateStats();
      report._hasData = false;
      report._status = 'محجوب (Pop-up)';
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
    setFabHidden(true);

    addLog(`بدء معالجة ${state.selectedReports.length} بلاغ (Concurrency: ${state.concurrencyLimit})...`, 'info');
    setStatus(`معالجة ${state.selectedReports.length} بلاغ...`, 'warn');

    // Concurrency-controlled processing
    // كل شيء داخل try/finally: أي استثناء غير متوقع كان يترك state.isRunning=true
    // و activeWorkers عالقًا، فتصبح الأداة «مجمّدة» ولا تقبل تشغيلًا جديدًا.
    try {
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

      // allSettled بدل all: فشل بلاغ واحد لم يكن يجب أن يمنع انتظار الباقي
      const settled = await Promise.allSettled(workers);
      const failed = settled.filter(r => r.status === 'rejected');
      if (failed.length) {
        addLog(`⚠️ ${failed.length} بلاغ انتهى بخطأ غير متوقع — راجع سجل الأخطاء`, 'error');
      }
    } catch (e) {
      addLog('توقف غير متوقع: ' + (e && e.message ? e.message : e), 'error');
      setStatus('توقف غير متوقع', 'error');
    } finally {
      state.activeWorkers = 0;
      state.isRunning = false;

      // لا تمسح الجلسة عند الإيقاف اليدوي — وإلا فُقد الاستئناف في الحالة
      // الوحيدة التي يُحتاج فيها فعلًا (كان يُمسح دائمًا).
      if (!state.stopRequested) {
        clearResumeState();
      } else {
        addLog('تم الإيقاف — يمكنك استئناف الجلسة لاحقًا', 'skip');
      }

      miniStopBtn.textContent = '🔄 معالجة جديدة';
      miniStopBtn.style.background = '#27ae60';

      const summary = `اكتمل - معالجة: ${state.totalProcessed} | فيها داتا: ${state.totalWithData} | لم تُفتح: ${state.totalSkipped}`;
      addLog(summary, 'ok');
      setStatus(summary, 'ok');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Event Listeners
  // ══════════════════════════════════════════════════════════════════
  function openFromFab() {
    // أثناء التشغيل: أظهر لوحة المتابعة فقط — لا تعِد الحصاد الكامل
    if (state.isRunning) {
      miniMenu.classList.add('visible');
      return;
    }
    const isOnOrders = window.location.href.includes('/Orders/');
    if (!isOnOrders) {
      window.open(ORDERS_URL, '_blank');
      return;
    }
    showSettings();
  }

  // الفاب قد ينشئه fabs-controller لاحقًا — نربطه فقط لو موجود الآن
  const fabEl = getFab();
  if (fabEl) fabEl.addEventListener('click', openFromFab);

  // جسر اللوحة الموحّدة: fabs-controller في world معزول ولا يصل لدوالنا،
  // فيرسل حدث DOM. بدونه كان فتح الأداة من اللوحة لا يفتح شيئًا إطلاقًا.
  document.addEventListener('ea-report-processor-open', openFromFab);

  settingsClose.addEventListener('click', hideSettings);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideSettings(); });

  // ── فلتر الأرقام: منطق واحد يستخدمه الزر و«تحديث القائمة» والفتح —────
  function readRequestedCas() {
    const textarea = document.getElementById('rp-order-id-filter');
    const lines = (textarea ? textarea.value : '').split('\n').map(l => l.trim()).filter(Boolean);
    const requested = [];
    const invalid = [];
    for (const line of lines) {
      const normalized = normalizeCas(line);
      if (/^CAS\d+$/i.test(normalized)) {
        if (!requested.includes(normalized)) requested.push(normalized);
      } else {
        invalid.push(line.slice(0, 40));
      }
    }
    return { requested, invalid, lines };
  }

  function pulseStartButton() {
    const btn = document.getElementById('rp-settings-start');
    if (!btn) return;
    btn.style.boxShadow = '0 0 0 3px #f0b429';
    setTimeout(() => { btn.style.boxShadow = ''; }, 1400);
  }

  function applyOrderFilter(opts = {}) {
    const { requested, invalid } = readRequestedCas();
    state.orderIdFilter = new Set(requested);
    state.orderIdFilterOrder = requested;
    if (!opts.keepDate) state._selectedDate = '';
    state.sortMode = requested.length ? 'input-order' : 'scraped';
    const sortSel = document.getElementById('rp-sort-select');
    if (sortSel) sortSel.value = state.sortMode;

    const matched = requested.filter(c => state.allReports.some(r => sameCas(r.casNo, c))).length;
    const missing = requested.length - matched;

    const status = document.getElementById('rp-order-filter-status');
    if (status) {
      status.style.display = 'block';
      if (!requested.length) {
        status.textContent = invalid.length
          ? `⚠️ ${invalid.length} سطر بدون رقم CAS — لم أطبّق تصفية`
          : '⚠️ الصندوق فاضي — الصق أرقام الطلبات أولًا';
        status.style.color = '#f0b429';
      } else {
        status.innerHTML = `✅ مطابق <b>${matched}</b> من ${requested.length}` +
          (missing ? ` — <span style="color:#f0b429">${missing} غير موجود في ${state.allReports.length} بلاغ</span>` : '') +
          (invalid.length ? `<br><span style="color:#f0b429">تجاهلت ${invalid.length} سطر ليس رقم CAS</span>` : '');
        status.style.color = matched ? '#2bd46f' : '#ff6b6b';
      }
    }

    document.querySelectorAll('.rp-date-chip').forEach(c => c.classList.remove('selected'));
    const allChip = document.querySelector('.rp-date-chip.all-dates');
    if (allChip) allChip.classList.add('selected');
    setDateChipsLocked(requested.length > 0);

    renderReportsList();
    if (requested.length) pulseStartButton();
    console.log('[RP] Order filter applied:', requested.length, 'matched:', matched, 'invalid:', invalid.length);
  }

  function clearOrderFilter() {
    const textarea = document.getElementById('rp-order-id-filter');
    if (textarea) textarea.value = '';
    state.orderIdFilter = new Set();
    state.orderIdFilterOrder = [];
    state.sortMode = 'scraped';
    const sortSel = document.getElementById('rp-sort-select');
    if (sortSel) sortSel.value = 'scraped';
    const status = document.getElementById('rp-order-filter-status');
    if (status) { status.style.display = 'none'; status.textContent = ''; }
    setDateChipsLocked(false);
    renderReportsList();
    console.log('[RP] Order ID filter cleared');
  }

  async function refreshReports() {
    if (state.isScraping) return;
    const btn = document.getElementById('rp-refresh-reports');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري تحديث القائمة...'; }
    const listEl = document.getElementById('rp-reports-list') || reportsList;
    listEl.innerHTML = '<div class="rp-loading"><div class="rp-spinner"></div><div>جاري إعادة قراءة الجدول...</div></div>';
    try {
      await scrapeAllPages();
      renderDateChips();
      applyOrderFilter({ keepDate: true });
      addLog(`تم تحديث القائمة: ${state.allReports.length} بلاغ`, 'ok');
    } catch (e) {
      addLog('تعذّر تحديث القائمة: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔁 تحديث القائمة (بعد توسيع البحث في البوابة)'; }
    }
  }

  // ربط آمن: لا يكرر المستمع لو أُعيد حقن السكربت
  function bindAction(id, handler, eventName) {
    const elm = document.getElementById(id);
    if (!elm || elm.__rpBound) return;
    elm.__rpBound = true;
    elm.addEventListener(eventName || 'click', handler);
  }

  bindAction('rp-select-all', (e) => {
    const checked = e.target.checked;
    const filtered = getFilteredAndSortedReports();
    state.selectedReports = checked ? [...filtered] : [];
    document.querySelectorAll('.rp-report-item input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
    updateSelectedCount();
    updateSelectAll();
  }, 'change');

  bindAction('rp-apply-order-filter', () => applyOrderFilter());
  bindAction('rp-clear-order-filter', clearOrderFilter);
  bindAction('rp-refresh-reports', refreshReports);
  bindAction('rp-sort-select', (e) => {
    state.sortMode = e.target.value;
    renderReportsList();
    console.log('[RP] Sort mode changed to:', state.sortMode);
  }, 'change');

  bindAction('rp-settings-start', run);
  bindAction('rp-settings-cancel', hideSettings);

  // Export buttons
  bindAction('rp-export-csv', () => {
    const reports = getFilteredAndSortedReports();
    if (reports.length === 0) { addLog('لا توجد بلاغات للتصدير', 'error'); return; }
    // نصدّر الحالة الحقيقية لكل بلاغ — كان الكود يفرض '—' فيمحو نتيجة المعالجة
    exportToCSV(reports, `report-processor-${Date.now()}.csv`);
    addLog(`📊 تم تصدير ${reports.length} بلاغ إلى CSV`, 'ok');
  });

  bindAction('rp-export-xlsx', () => {
    const reports = getFilteredAndSortedReports();
    if (reports.length === 0) { addLog('لا توجد بلاغات للتصدير', 'error'); return; }
    exportToExcel(reports, `report-processor-${Date.now()}.xlsx`);
  });

  miniStopBtn.addEventListener('click', () => {
    if (state.isRunning) {
      state.stopRequested = true;
      addLog('تم طلب الإيقاف...', 'skip');
      setStatus('جاري الإيقاف...', 'warn');
    } else {
      miniMenu.classList.remove('visible');
      setFabHidden(false);
      showSettings();
    }
  });

  document.getElementById('rp-mini-close').addEventListener('click', () => {
    if (state.isRunning) {
      state.stopRequested = true;
    }
    miniMenu.classList.remove('visible');
    setFabHidden(false);
  });

})();
