// =========================================================
// control-panel.js — لوحة التحكم الذكية v1.0
// بصمة الإصدار: تُطبع في الـ log وتظهر بجانب عنوان اللوحة، للتأكد أن المتصفح
// حمّل أحدث نسخة من الإضافة (Reload من edge://extensions مطلوب بعد أي نشر).
const PANEL_BUILD = '2026-10-26.38';
// Floating panel with auto-detecting page tabs
// =========================================================
(function () {
  'use strict';

  const PANEL_ID = 'elaraby-control-panel';
  const STATE_KEY = 'elaraby_cp_state';
  const LOG_KEY = 'elaraby_debug_log';
  const PAGE_LOG_KEY = 'elaraby_page_log';
  let CFG = null;
  let isMinimized = true;
  let isDocked = false;
  let productsDb = null;
  let debugLog = [];
  let flushTimer = null;

  // ===== Helpers: escapeHtml / safeParse (Wave A) =====
const escapeHtml = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/`/g, "&#96;");

  function safeParseJSON(raw, fallback) {
    try {
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      // basic shape guard for our STATE_KEY
      if (fallback && typeof fallback === 'object' && typeof parsed !== 'object') return fallback;
      return parsed;
    } catch (_) { return fallback; }
  }

  // ===== Unified iframe access (Wave B) =====
  // Shallow walk: main doc + first-level iframes only (matches current behavior exactly)
  function getShallowDocs(root = document) {
    return [root, ...Array.from(root.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch (_) { return null; } })
      .filter(Boolean)];
  }

  // Find first matching element across frames.
  // Prefers shared/frame-walker.js `findInFrames` — recursive walk of nested iframes
  // (matches the PowerApps rule in SHARED_KNOWLEDGE.md §11: elements live in nested iframes).
  // Falls back to a shallow walk (main + first-level iframes) only when frame-walker is absent.
  function findFirstInFrames(selector, root = document) {
    if (typeof window.findInFrames === 'function') {
      try { return window.findInFrames(selector, root); } catch (_) {}
    }
    const docs = getShallowDocs(root);
    for (const doc of docs) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  // كتابة localStorage مؤجلة (debounce) — تُستبدل الكتابة المتزامنة في كل حدث
  function flushLogs() {
    flushTimer = null;
    try { localStorage.setItem(LOG_KEY, debugLog.join('\n')); } catch(_) {}
    try { localStorage.setItem(PAGE_LOG_KEY, pageLog.join('\n')); } catch(_) {}
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushLogs, 1000);
  }

  function loadPersistedLogs() {
    try {
      const v = localStorage.getItem(LOG_KEY);
      if (v) debugLog = v.split('\n').filter(Boolean).slice(-200);
    } catch(_) {}
    try {
      const v = localStorage.getItem(PAGE_LOG_KEY);
      if (v) pageLog = v.split('\n').filter(Boolean).slice(-300);
    } catch(_) {}
  }

  function logEvent(type, detail) {
    const ts = new Date().toLocaleTimeString('ar-EG');
    const entry = `[${ts}] ${type}: ${detail}`;
    debugLog.push(entry);
    if (debugLog.length > 200) debugLog = debugLog.slice(-200);
    scheduleFlush();
    console.log(`%c[PortalHelper] ${entry}`, 'color:#60a5fa;font-weight:bold');
  }

  function getLogText() {
    let pageLogRaw = '';
    try { pageLogRaw = localStorage.getItem(PAGE_LOG_KEY) || ''; } catch(_) {}
    return '=== LOG الأداة ===\n' + debugLog.join('\n') + '\n\n=== LOG الصفحة ===\n' + pageLogRaw;
  }
  function clearLog() {
    debugLog = [];
    pageLog = [];
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    try { localStorage.removeItem(LOG_KEY); localStorage.removeItem(PAGE_LOG_KEY); } catch(_) {}
  }

  async function loadProductsDb() {
    try {
      const url = chrome.runtime.getURL('products-db.json');
      const res = await fetch(url);
      productsDb = await res.json();
    } catch (_) { productsDb = []; }
  }

  function findProductByModel(modelCode) {
    if (!productsDb || !modelCode) return null;
    const clean = modelCode.replace(/[\s\-\(\)\[\]_#\*]/g, '').toLowerCase();
    return productsDb.find(p => {
      if (p.model && p.model.replace(/[\s\-]/g, '').toLowerCase() === clean) return true;
      if (p.modelCodes) return p.modelCodes.some(c => c.replace(/[\s\-]/g, '').toLowerCase() === clean);
      return false;
    }) || null;
  }

  function findProductByModelPart(partialCode) {
    if (!productsDb || !partialCode) return null;
    const clean = partialCode.replace(/[\s\-\(\)\[\]_#\*]/g, '').toLowerCase();
    return productsDb.find(p => {
      if (p.model && p.model.replace(/[\s\-]/g, '').toLowerCase().includes(clean)) return true;
      if (p.modelCodes) return p.modelCodes.some(c => c.toLowerCase().includes(clean));
      return false;
    }) || productsDb.find(p => {
      if (p.model && clean.includes(p.model.replace(/[\s\-]/g, '').toLowerCase())) return true;
      return false;
    }) || null;
  }

  // البحث عن أول عنصر يطابق أحد المحددات (من النافذة المشتركة في portal-selectors.js)
  function findFirst(list) {
    return window.findFirst ? window.findFirst(list) : null;
  }

  async function ensureReady() {
    try {
      if (typeof loadSelectors === 'function') {
        CFG = await loadSelectors();
      }
    } catch (_) {}
    if (!CFG) {
      CFG = getFallbackCfg();
    }
    return true;
  }

  function getFallbackCfg() {
    return {
      serial: ["#ldv_serialnumber", "[aria-label*='الرقم المسلسل']"],
      serial2: ["#ldv_serialnumber1", "[aria-label*='الرقم المسلسل 2']"],
      modelInput: ["#ldv_actualmodel_name", "input[aria-label*='الموديل الفعلي']"],
      modelInput2: ["#ldv_actualmodel2_name", "input[aria-label*='الموديل الفعلي 2']"],
      modelBtn: ["button[aria-label*='الموديل الفعلي Launch lookup modal']", ".launchentitylookup"],
      modelBtn2: ["#ldv_actualmodel2_lookupmodalbutton", "#ldv_actualmodel2_name_lookupmodalbutton", "button[id*='actualmodel2'][id*='lookup']", "button[aria-label*='الموديل الفعلي 2']"],
      brandInput: ["#ats_producttypebrand_name", "input[aria-label*='العلامة التجاريه']"],
      brandBtn: ["button[aria-label*='العلامة التجاريه Launch lookup modal']", ".launchentitylookup"],
      nextBtn: ["#NextButton", "input[type='button'][value='Next']", "input[type='button'][value='التالي']", "button[aria-label='التالي']", "button[type='submit']"],
      statusSelect: ["#ldv_warrantystatus", "select[aria-label*='حالة الضمان']"]
    };
  }

  function isWorkOrderPage() {
    const url = location.href.toLowerCase();
    return url.includes('workorderreview') || url.includes('followup') || url.includes('technicalreviewdetails');
  }

  // هل اللوحة مبنية فعلًا؟ (مضيف بلا shadow أو بلا .cp-panel = بقايا سكربت ميت)
  function panelIsBuilt() {
    const host = document.getElementById(PANEL_ID);
    return !!(host && host.shadowRoot && host.shadowRoot.querySelector('.cp-panel'));
  }

  async function init() {
    try {
      if (!isWorkOrderPage()) return;
      if (!await ensureReady()) return;
      if (panelIsBuilt()) return;
      const stale = document.getElementById(PANEL_ID);
      if (stale) { try { stale.remove(); } catch (_) {} } // بقايا حقن قديم
      logEvent('INIT', 'بدء تحميل لوحة التحكم — build ' + PANEL_BUILD);
      await loadProductsDb();
      injectPanel();
      observePageChanges();
      logEvent('INIT', 'تم تحميل لوحة التحكم — build ' + PANEL_BUILD);
    } catch (e) {
      const msg = (e && (e.message || e)) || 'خطأ غير معروف';
      try { logEvent('INIT', '❌ فشل تحميل اللوحة: ' + msg); } catch (_) {}
      showBootErrorChip(msg);
    }
  }

  // شريحة خطأ مرئية بدل الاختفاء الصامت (لو فشل تحميل اللوحة لأي سبب)
  function showBootErrorChip(msg) {
    try {
      if (document.getElementById(PANEL_ID + '-boot-error')) return;
      const el = document.createElement('div');
      el.id = PANEL_ID + '-boot-error';
      el.textContent = '⚠️ اللوحة لم تبدأ: ' + msg + ' — اضغط F5';
      Object.assign(el.style, {
        position: 'fixed', bottom: '20px', right: '20px', maxWidth: '320px',
        background: '#7f1d1d', color: '#fff', padding: '10px 12px', borderRadius: '8px',
        fontFamily: 'Segoe UI,Tahoma,sans-serif', fontSize: '12px', lineHeight: '1.5',
        zIndex: '2147483647', direction: 'rtl', boxShadow: '0 8px 24px rgba(0,0,0,.5)', cursor: 'pointer'
      });
      el.onclick = () => { try { el.remove(); } catch (_) {} };
      document.body.appendChild(el);
    } catch (_) {}
  }

  function loadState() {
    let s = { minimized: true, docked: false };
    try {
      const raw = localStorage.getItem(STATE_KEY);
      s = safeParseJSON(raw, { minimized: true, docked: false });
    } catch (_) {}
    isMinimized = s.minimized !== false;
    isDocked = s.docked === true;
    return s;
  }

  function saveState(shadow) {
    try {
      const prev = safeParseJSON(localStorage.getItem(STATE_KEY), {});
      const panel = shadow.querySelector('.cp-panel');
      const rect = panel.getBoundingClientRect();
      // لو اللوحة مخفية (تصغير) يكون rect = 0 → نحتفظ بالأبعاد السابقة بدل تصفيرها
      const hasRect = rect.width > 0 && rect.height > 0;
      localStorage.setItem(STATE_KEY, JSON.stringify({
        minimized: isMinimized,
        docked: isDocked,
        left: hasRect ? Math.round(rect.left) : (prev.left || 0),
        top: hasRect ? Math.round(rect.top) : (prev.top || 0),
        width: hasRect ? Math.round(rect.width) : (prev.width || 0),
        height: hasRect ? Math.round(rect.height) : (prev.height || 0)
      }));
    } catch(e) {}
  }

  function readDeviceHint() {
    let device = (typeof readDeviceTypeFromPage === 'function') ? (readDeviceTypeFromPage() || '') : '';
    logEvent('DEVICE', `readDeviceTypeFromPage="${device}"`);
    if (device) return device;
    const modelEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    const modelVal = modelEl?.value?.trim();
    logEvent('DEVICE', `modelInput value="${modelVal || ''}"`);
    if (modelVal) {
      const found = findProductByModel(modelVal) || findProductByModelPart(modelVal);
      logEvent('DEVICE', `product found=${found ? found.productType : 'null'}`);
      if (found) return found.productType;
    }
    return '';
  }

  function detectPage() {
    const doc = document;
    function scanInDoc(d) {
      const btns = Array.from(d.querySelectorAll('a, button, input[type="button"]'));
      const labels = Array.from(d.querySelectorAll('label, h3'));
      if (btns.some(b => b.innerText.trim() === 'اضافة كود عطل' && b.offsetParent !== null)) return 'PAGE_3';
      if (labels.some(l => l.innerText.includes('أكواد الأعطال'))) return 'PAGE_3';
      if (btns.some(b => /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]/i.test(b.innerText) && b.offsetParent !== null)) return 'PAGE_2';
      if (btns.some(b => /اضاف[ةه]\s*فن/i.test(b.innerText) && b.offsetParent !== null)) return 'PAGE_2';
      return null;
    }
    let res = scanInDoc(doc);
    if (res) return res;
    const docs = getShallowDocs(doc);
    for (const d of docs) {
      if (d === doc) continue; // skip main doc, already scanned
      res = scanInDoc(d);
      if (res) return res;
    }
    return 'PAGE_1';
  }

  function getDeviceAC() {
    const device = readDeviceHint();
    logEvent('DEVICE', `readDeviceHint="${device}"`);
    if (/تكييف|ac|air.?cond|split|شباك|inverter/i.test(device)) {
      logEvent('DEVICE', 'isAC=true (from device hint)');
      return true;
    }
    // fallback: تحقق من الموديل مباشرة
    const modelEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    const modelVal = modelEl?.value?.trim() || '';
    logEvent('DEVICE', `modelValue="${modelVal}"`);
    const isAC = /ac|air.?cond|split|inverter|indoor|outdoor/i.test(modelVal);
    logEvent('DEVICE', `isAC=${isAC} (from model value)`);
    return isAC;
  }

  function injectPanel() {
    if (panelIsBuilt()) return; // لا حقن مزدوج
    const stale = document.getElementById(PANEL_ID);
    if (stale) { try { stale.remove(); } catch (_) {} } // بقايا حقن قديم بلا محتوى
    // ترحيل لكل build: إلغاء أي إرساء محفوظ وفتح اللوحة عائمة مرة واحدة بعد كل تحديث،
    // لأن الإرساء القديم قد يحبس اللوحة داخل حاوية مخفية في صفحة البوابة.
    try {
      if (localStorage.getItem('elaraby_cp_reset_build') !== PANEL_BUILD) {
        localStorage.setItem('elaraby_cp_reset_build', PANEL_BUILD);
        isDocked = false;
        isMinimized = false;
        localStorage.setItem(STATE_KEY, JSON.stringify({ minimized: false, docked: false }));
      }
    } catch (_) {}
    const host = document.createElement('div');
    host.id = PANEL_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const saved = loadState();

    const style = document.createElement('style');
    style.textContent = getCSS();
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'cp-panel';
    panel.innerHTML = getHTML();
    shadow.appendChild(panel);
    document.body.appendChild(host);

    if (saved.docked && saved.left) {
      panel.style.left = saved.left + 'px';
      panel.style.top = saved.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    if (saved.width) {
      panel.style.width = saved.width + 'px';
    }
    if (saved.height) {
      panel.style.height = saved.height + 'px';
    }

    bindEvents(shadow);
    updateTab(shadow);

    if (isDocked) setDock(shadow, true);
    if (isMinimized) toggle(shadow, false, true);
  }

function getCSS() {
    return `
*{box-sizing:border-box;margin:0;padding:0}
.cp-panel{position:fixed;bottom:14px;right:76px;width:300px;min-width:280px;max-width:520px;min-height:220px;max-height:70vh;background:#131821;border:1px solid #232840;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.7);z-index:2147483647;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;font-size:11px;color:#c8d0e0;overflow:auto;display:flex;flex-direction:column;resize:both;transition:opacity .15s ease, transform .15s ease}
.cp-header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:linear-gradient(135deg,#1a2744,#0f1b33);border-bottom:1px solid #2a3050;cursor:move;user-select:none}
.cp-title{font-weight:700;color:#60a5fa;font-size:12px}
.cp-toggle{background:rgba(255,255,255,.1);border:none;border-radius:50%;color:#94a3b8;cursor:pointer;width:22px;height:22px;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s}
.cp-toggle:hover{background:rgba(255,255,255,.2);color:#e2eaf5}
.cp-body{padding:8px 10px;overflow-y:auto;scrollbar-width:thin;flex:1}
.cp-body::-webkit-scrollbar{width:4px}
.cp-body::-webkit-scrollbar-thumb{background:#2a3050;border-radius:2px}
.cp-tab{display:none}
.cp-tab.active{display:block}
.cp-tab-title{font-weight:700;color:#a8c7fa;margin-bottom:6px;font-size:11px;padding-bottom:4px;border-bottom:1px solid #232840;letter-spacing:.3px}
.cp-info{background:#0d1528;padding:5px 8px;border-radius:5px;margin-bottom:6px;font-size:11px;color:#a8c7fa;line-height:1.5;border:1px solid #1a2340}
.cp-check,.cp-radio{display:flex;align-items:center;gap:5px;margin-bottom:2px;cursor:pointer;padding:3px 5px;border-radius:4px;transition:background .15s}
.cp-check:hover,.cp-radio:hover{background:#1a2340}
.cp-check input,.cp-radio input{width:13px;height:13px;cursor:pointer;flex-shrink:0;accent-color:#2563eb}
.cp-label{display:block;margin-bottom:2px;font-size:10px;color:#7a9cc8;margin-top:2px;font-weight:600}
.cp-select{width:100%;padding:4px 6px;margin-bottom:4px;background:#0a0f1f;color:#a8c7fa;border:1px solid #232840;border-radius:5px;font-size:11px;cursor:pointer}
.cp-btn{width:100%;padding:6px;border:none;border-radius:5px;font-weight:700;font-size:11px;cursor:pointer;margin-top:4px;transition:opacity .15s}
.cp-btn:hover{opacity:.85}
.cp-btn:active{opacity:.7}
.cp-btn-exec{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff}
.cp-btn-inject{background:linear-gradient(135deg,#059669,#047857);color:#fff}
.cp-btn:disabled{opacity:.4;cursor:not-allowed}
.cp-status{padding:4px 10px;font-size:10px;color:#667799;border-top:1px solid #1a2340;min-height:20px;transition:color .3s}
.cp-btn-stop{background:#7f1d1d;color:#fecaca;border:1px solid #dc2626;width:100%;margin:0 0 4px;padding:3px;font-size:10px;font-weight:900;border-radius:5px;cursor:pointer}
.cp-btn-stop:hover{background:#991b1b}
.cp-badge{display:inline-block;background:#1e3a5f;color:#a8c7fa;font-size:9px;padding:1px 5px;border-radius:8px;margin-right:3px}
.cp-install{color:#fbbf24;font-size:12px;font-weight:900}
.cp-maintenance{color:#a8c7fa;font-size:11px}
.cp-empty{color:#445577;padding:5px;text-align:center;font-size:10px}
.cp-notes-title{font-weight:700;color:#fbbf24;margin:6px 0 3px;padding-top:5px;border-top:1px solid #232840;font-size:11px}
.cp-model-note{display:none;background:#7c4d00;border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#fef3c7;line-height:1.5;text-align:center}
.cp-model-note.note-info{background:#0c4a6e;border-color:#0ea5e9;color:#e0f2fe}
.cp-model-note.note-warning{background:#7c4d00;border-color:#f59e0b;color:#fef3c7}
.cp-model-note.note-danger{background:#7f1d1d;border-color:#dc2626;color:#fecaca}
.cp-note-badge{display:inline-block;background:#1d4ed8;color:#dbeafe;border-radius:4px;padding:0 4px;margin-inline-end:4px;font-size:9px;font-weight:900;vertical-align:middle}
.cp-defect-row{display:flex;align-items:center;gap:4px;background:#0b1220;border:1px solid #1e293b;border-radius:4px;padding:3px 5px;margin-bottom:3px;font-size:10px}
.cp-defect-row.user{border-color:#a16207}
.cp-defect-code{font-weight:900;color:#93c5fd;white-space:nowrap;font-size:10px}
.cp-defect-row.user .cp-defect-code{color:#fbbf24}
.cp-defect-desc{flex:1;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-defect-mini{background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:3px;padding:0 4px;font-size:10px;cursor:pointer;line-height:16px}
.cp-defect-mini:hover{background:#334155}
.cp-defect-del:hover{background:#7f1d1d;border-color:#dc2626}
.cp-edef-tabs{display:flex;gap:3px;margin-bottom:6px}
.cp-edef-tab{flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:5px;background:#0d1528;color:#8fa7c9;font-size:10px;font-weight:700;cursor:pointer;transition:all .12s}
.cp-edef-tab:hover{background:#1a2744;color:#e2eaf5}
.cp-edef-tab.on{background:#1a2744;border-color:#2563eb;color:#e2eaf5}
.cp-edef-pane{display:block}
.cp-edef-count{font-size:9px;color:#64748b;margin-bottom:4px}
.cp-edef-list{max-height:170px;overflow:auto;margin-bottom:6px}
.cp-edef-picks{max-height:96px;overflow:auto;background:#0b1220;border:1px solid #1e293b;border-radius:4px;padding:3px 5px;margin-bottom:4px}
.cp-edef-picks label{display:flex;align-items:flex-start;gap:4px;font-size:10px;color:#cbd5e1;padding:1px 0;cursor:pointer;line-height:1.35}
.cp-edef-picks input{margin-top:1px;flex-shrink:0;width:12px;height:12px;cursor:pointer;accent-color:#2563eb}
.cp-edef-row{display:flex;align-items:center;gap:4px;background:#0b1220;border:1px solid #1e293b;border-radius:4px;padding:3px 5px;margin-bottom:3px;font-size:10px}
.cp-edef-row.user{border-color:#a16207}
.cp-edef-row .cp-edef-name{font-weight:700;color:#93c5fd;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.cp-edef-row.user .cp-edef-name{color:#fbbf24}
.cp-edef-row .cp-edef-meta{flex:1;color:#7c8ba6;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-edef-row .cp-edef-text{flex:1;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-edef-row .cp-edef-id{color:#475569;font-size:8px;white-space:nowrap;direction:ltr}
.cp-note-item{background:#0f1a2e;padding:3px 6px;border-radius:5px;margin-bottom:1px;cursor:grab;font-size:10px;line-height:1.4;border:1px solid transparent;transition:all .12s;display:flex;align-items:flex-start;gap:4px;user-select:none}
.cp-note-item:hover{background:#162a45;border-color:#2a4a6a}
.cp-note-item:active{cursor:grabbing}
.cp-note-item.dragging{opacity:.5;border-color:#2563eb;background:#0f1a2e}
.cp-note-item.drag-over{border-color:#60a5fa;background:#1a3060}
.cp-note-item input{margin-top:1px;flex-shrink:0;width:12px;height:12px;cursor:pointer;accent-color:#2563eb}
.cp-note-item .ni-handle{color:#3a4a6a;font-size:9px;cursor:grab;flex-shrink:0;padding:0 1px;line-height:1.4}
.cp-note-item .ni-handle:active{cursor:grabbing}
.cp-note-item .ni-text{flex:1;line-height:1.4}
.cp-amount{width:100%;padding:4px 6px;margin:2px 0 4px;background:#0a0f1f;color:#a8c7fa;border:1px solid #232840;border-radius:5px;font-size:11px;direction:ltr;text-align:left}
.cp-amount::placeholder{color:#334466}
.cp-parts-review{max-height:230px;overflow:auto;margin:6px 0;padding:6px;border:1px solid #2a3f6b;border-radius:6px;background:#0b1324}
.cp-part-row{padding:5px 3px;border-bottom:1px solid #16213a;font-size:11px}
.cp-part-row:last-of-type{border-bottom:none}
.cp-part-name{color:#cfe0ff;display:block;margin-bottom:3px;word-break:break-word}
.cp-part-ctl{display:flex;gap:3px;align-items:center;flex-wrap:wrap}
.cp-part-ctl select{flex:1;min-width:90px;background:#0a0f1f;color:#a8c7fa;border:1px solid #232840;border-radius:4px;font-size:10px;padding:2px}
.cp-w-btn{border:1px solid #232840;background:#111a2e;color:#8fa6c8;border-radius:4px;font-size:10px;padding:2px 6px;cursor:pointer;font-family:inherit}
.cp-w-btn.on{background:#14532d;border-color:#22c55e;color:#bbf7d0}
.cp-w-btn.on-out{background:#4a1d1d;border-color:#ef4444;color:#fecaca}
.cp-star{border:none;background:transparent;color:#475569;font-size:15px;cursor:pointer;padding:0 2px;line-height:1}
.cp-star.on{color:#fbbf24}
.cp-review-hint{font-size:9px;color:#7c8ba6;margin-bottom:4px;line-height:1.5}
.cp-code-pool{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;padding:4px;border:1px dashed #2a3f6b;border-radius:5px;min-height:26px}
.cp-code-pool.drag-over{border-color:#fbbf24;background:#241f0e}
.cp-code-chip{background:#152242;border:1px solid #3b82f6;color:#dbeafe;border-radius:10px;font-size:10px;padding:2px 7px;cursor:grab;user-select:none;line-height:1.5;display:inline-flex;align-items:center;gap:3px}
.cp-code-chip:active{cursor:grabbing}
.cp-code-chip small{color:#93c5fd;font-size:9px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-code-chip.used{background:#14321f;border-color:#22c55e;color:#bbf7d0}
.cp-code-chip.used small{color:#86efac}
.cp-code-chip.dragging{opacity:.45}
.cp-code-chip.armed{outline:2px solid #fbbf24;outline-offset:1px}
.cp-code-chip.cost{border-color:#f59e0b;background:#2a2008;color:#fde68a}
.cp-code-chip.cost small{color:#fcd34d}
.cp-cost-badge{font-size:10px;line-height:1;cursor:help;filter:saturate(1.2)}
.cp-cost-note{font-size:9px;color:#fbbf24;margin-top:3px;line-height:1.5}
.cp-part-slot{display:flex;align-items:center;gap:3px;flex:1;min-width:120px;min-height:24px;padding:2px 5px;border:1px dashed #2a3f6b;border-radius:5px;font-size:10px;color:#64748b}
.cp-part-slot.filled{border-style:solid;border-color:#22c55e;background:#0e2018;color:#bbf7d0}
.cp-part-slot.drag-over{border-color:#fbbf24;background:#2a2410}
.cp-part-slot.missing{border-color:#ef4444;background:#2a1212}
.cp-part-src{font-size:9px;color:#94a3b8;cursor:help}
.cp-slot-x{border:none;background:transparent;color:#f87171;cursor:pointer;font-size:12px;line-height:1;padding:0 2px}
.cp-fav-parts{display:flex;flex-wrap:wrap;gap:3px;margin:3px 0 4px}
.cp-fav-chip{background:#1a2744;border:1px solid #f59e0b;color:#fde68a;border-radius:10px;font-size:10px;padding:2px 6px;cursor:pointer;font-family:inherit}
.cp-fav-chip small{color:#94a3b8;margin-left:3px}
.cp-fav-chip .fav-other{border:1px solid #475569;border-radius:4px;font-size:8px;padding:0 3px;color:#94a3b8;margin-right:3px}
.cp-fav-head{display:flex;align-items:center;justify-content:space-between;gap:4px}
.cp-fav-manage{background:#1a2744;border:1px solid #f59e0b;color:#fde68a;border-radius:4px;font-size:9px;padding:1px 5px;cursor:pointer;font-family:inherit}
.cp-fav-manage:hover{background:#24365c}
.cp-edef-row.fav .cp-edef-name{color:#fbbf24}
.cp-edef-row.fav-stop .cp-edef-meta{color:#f87171}
.cp-fav-form-row{display:flex;gap:4px;margin-bottom:4px}
.cp-fav-sel{background:#0a0f1f;color:#a8c7fa;border:1px solid #232840;border-radius:5px;font-size:10px;padding:3px;margin:0}
#cp-pick{position:fixed;right:10px;bottom:70px;width:300px;max-width:calc(100vw - 20px);z-index:2147483600;background:#0b1324;border:1px solid #f59e0b;border-radius:6px;padding:7px;box-shadow:0 4px 18px #000c}
.cp-btn-gold{background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-size:11px;padding:6px}
.cp-panel.docked{position:relative!important;bottom:auto!important;right:auto!important;margin:6px 12px;width:auto;max-height:none;min-width:0;max-width:none;min-height:0;resize:none;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.cp-panel.docked .cp-header{cursor:default}
.cp-panel.docked .cp-body{max-height:60vh}
.cp-dock{background:rgba(255,255,255,.1);border:none;border-radius:50%;color:#94a3b8;cursor:pointer;width:22px;height:22px;font-size:12px;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s;margin-right:2px}
.cp-dock:hover{background:rgba(255,255,255,.2);color:#e2eaf5}
.cp-dock.active{background:rgba(23,51,76,.35);color:#ffffff; border:1px solid rgba(255,255,255,0.2)}
.cp-shortcuts{display:flex;flex-direction:column;gap:2px;margin:4px 0}
#cp-shortcut-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.cp-shortcut-btn.shared{border-color:#3a5a8a;background:#132033}
.cp-shortcut-row{display:flex;gap:4px}
.p2-sc, .cp-shortcut-btn{flex:1;padding:5px 4px;border:1px solid #2a3050;border-radius:5px;background:#0d1528;color:#a8c7fa;font-size:10px;font-weight:600;cursor:pointer;transition:all .12s;text-align:center}
.p2-sc:hover, .cp-shortcut-btn:hover{background:#1a2744;border-color:#3a5a8a;color:#e2eaf5}
.p2-sc:active, .cp-shortcut-btn:active{transform:scale(.96)}
.p2-sc .sc-icon, .cp-shortcut-btn .sc-icon{display:block;font-size:16px;margin-bottom:1px}
.cp-codes-action-group{display:flex;gap:6px;margin:6px 0 8px 0}
.cp-btn-code-copy{flex:1;background:#172554;border:1px solid #3b82f6;color:#93c5fd;font-weight:700;font-size:11px;padding:6px 4px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s}
.cp-btn-code-copy:hover{background:#1e3a8a;color:#dbeafe;border-color:#60a5fa}
.cp-btn-code-copy:active{transform:scale(.97)}
.cp-btn-code-paste{flex:1;background:#064e3b;border:1px solid #10b981;color:#6ee7b7;font-weight:700;font-size:11px;padding:6px 4px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s}
.cp-btn-code-paste:hover{background:#065f46;color:#a7f3d0;border-color:#34d399}
.cp-btn-code-paste:active{transform:scale(.97)}
.cp-codes-preview-box{display:none;background:#0d1528;border:1px dashed #2a3d60;border-radius:5px;padding:5px 8px;margin-bottom:8px;font-size:10px;color:#94a3b8;line-height:1.4}
.cp-codes-preview-box b{color:#60a5fa}
.cp-copy-board{display:none;margin:6px 0;padding:6px;border:1px solid #2a3f6b;border-radius:6px;background:#0b1324}
.cp-copy-head{font-size:11px;font-weight:700;color:#93c5fd;margin-bottom:3px;word-break:break-word}
.cp-copy-sec{font-size:10px;color:#7c8ba6;margin:6px 0 2px}
.cp-copy-part{display:flex;align-items:center;gap:3px;padding:3px 2px;border-bottom:1px solid #16213a;font-size:11px}
.cp-copy-part:last-of-type{border-bottom:none}
.cp-copy-name{flex:0 0 34%;color:#cfe0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right}
`;
  }

  function getHTML() {
    return `
<div class="cp-header" id="cp-header">
  <span class="cp-title">⚙ لوحة التحكم <span style="opacity:.55;font-weight:400;font-size:10px">b${PANEL_BUILD}</span></span>
  <div style="display:flex;align-items:center;gap:2px">
    <button class="cp-dock" id="cp-dock" title="إرساء">⛶</button>
    <button class="cp-toggle" id="cp-toggle" title="تصغير">−</button>
  </div>
</div>
<div class="cp-body" id="cp-body">
  <div class="cp-tab" data-page="PAGE_1" id="tab-p1">
    <div class="cp-tab-title">📋 الصفحة الأولى — بيانات الجهاز</div>
    <div id="cp-model-note" class="cp-model-note" role="note"></div>
    <button class="cp-btn cp-btn-inject" id="btn-note-edit" type="button" style="margin-bottom:6px">📝 ملاحظة الموديل</button>
    <div id="cp-note-editor" style="display:none;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px;margin-bottom:8px">
      <textarea id="cp-note-text" rows="3" placeholder="ملاحظة تظهر عند فتح هذا الموديل..." style="width:100%;box-sizing:border-box;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:4px;font-size:11px;resize:vertical;font-family:inherit"></textarea>
      <div style="display:flex;gap:4px;margin-top:4px;align-items:center">
        <select id="cp-note-type" class="cp-select" style="flex:0 0 92px;margin:0">
          <option value="info">ℹ️ معلومة</option>
          <option value="warning" selected>⚠️ تحذير</option>
          <option value="danger">⛔ خطر</option>
        </select>
        <button class="cp-btn cp-btn-exec" id="btn-note-save" type="button" style="flex:1;margin:0">💾 حفظ</button>
        <button class="cp-btn cp-btn-inject" id="btn-note-delete" type="button" style="flex:1;margin:0">🗑️ حذف</button>
      </div>
      <button class="cp-btn cp-btn-inject" id="btn-note-export" type="button" style="width:100%;margin-top:4px">📤 نسخ JSON (للنشر الدائم)</button>
    </div>
    <button class="cp-btn cp-btn-inject" id="btn-default-p1" type="button" style="margin-bottom:6px">📦 تعبئة بيانات افتراضية (زيارة ثانية)</button>
    <label class="cp-check"><input type="checkbox" id="chk-duplicate" checked> <span>تكرار بيانات الجهاز (model→model2, serial→serial2)</span></label>
    <label class="cp-check"><input type="checkbox" id="chk-next1" checked> <span>الانتقال للصفحة التالية</span></label>
    <button class="cp-btn cp-btn-exec" id="btn-exec1">▶ تنفيذ</button>
  </div>
  <div class="cp-tab" data-page="PAGE_2" id="tab-p2">
    <div class="cp-tab-title">📋 الصفحة الثانية — حالة البلاغ</div>
    <div class="cp-info" id="cp-device-info">⏳ جاري التحميل...</div>
    <div id="cp-install-warn" style="display:none;background:#7f1d1d;border:1px solid #dc2626;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#fbbf24;font-weight:700;text-align:center">⚠️ لا تنسي صورة الضمان وفيديو الفاكيوم</div>
    <label class="cp-label">حالة قطع الغيار:</label>
    <select class="cp-select" id="cp-spare-status">
      <option value="963400002" selected>بدون قطع غيار</option>
      <option value="963400000">مستعمل</option>
      <option value="963400001">منتظر</option>
      <option value="963400003">سحب</option>
      <option value="963400004">استبدال</option>
    </select>
    <div class="cp-shortcuts" id="cp-shortcuts-p2">
      <div class="cp-notes-title" style="margin:4px 0 2px;padding-top:3px">⚡ شورت كت</div>
      <div class="cp-shortcut-row">
        <button class="p2-sc" data-sc="tech"><span class="sc-icon">🔧</span>فني فقط</button>
        <button class="p2-sc" data-sc="prob"><span class="sc-icon">📋</span>مشاكل فقط</button>
      </div>
      <div class="cp-shortcut-row" style="margin-top:2px">
        <button class="p2-sc" data-sc="all" style="background:#1a2744;border-color:#2563eb"><span class="sc-icon">⚡</span>الكل</button>
      </div>
    </div>
    <div id="cp-problem-picker" style="display:none;margin:6px 0 2px;padding:6px;border:1px dashed #f59e0b;border-radius:6px;background:#1a1408">
      <div class="cp-label" style="margin:0 0 3px;color:#fbbf24">⚠️ الكود المطلوب غير متاح — اختر من المتاح:</div>
      <div id="cp-problem-context" style="font-size:11px;color:#94a3b8;margin:0 0 4px;line-height:1.5"></div>
      <div id="cp-problem-service" style="display:none;margin:0 0 5px;gap:4px">
        <button class="cp-btn" data-svc="install" type="button" style="padding:2px 8px;font-size:11px">🔧 تركيب</button>
        <button class="cp-btn" data-svc="maintenance" type="button" style="padding:2px 8px;font-size:11px">🛠️ صيانة</button>
      </div>
      <select class="cp-select" id="cp-problem-select"></select>
      <div id="cp-problem-countdown" style="font-size:11px;color:#fbbf24;margin:3px 0 0"></div>
      <button class="cp-btn cp-btn-exec" id="btn-add-problem" type="button" style="margin-top:4px">➕ إضافة المشكلة المختارة</button>
    </div>
    <button class="cp-btn cp-btn-exec" id="btn-exec2">▶ تنفيذ يدوي</button>
    <label class="cp-check" style="margin-top:6px"><input type="checkbox" id="chk-next2"> <span>الانتقال للصفحة التالية بعد المشاكل والفنيين</span></label>
  </div>
  <div class="cp-tab" data-page="PAGE_3" id="tab-p3">
    <div class="cp-tab-title">📋 الصفحة الثالثة — أكواد الأعطال</div>
    <div class="cp-info" id="cp-device-info3">الجهاز: <b id="cp-device-type">...</b></div>
    <label class="cp-check" style="margin-bottom:8px"><input type="checkbox" id="chk-done" checked> <span>✅ تمت الصيانة</span></label>
    <div class="cp-codes-action-group">
      <button class="cp-btn cp-btn-code-copy" id="btn-copy-codes" title="نسخ أكواد الأعطال الحالية من البلاغ بصيغة JSON">
        <span class="sc-icon">📋</span><span>نسخ الأكواد</span>
      </button>
      <button class="cp-btn cp-btn-code-paste" id="btn-paste-codes" title="لصق وإضافة الأكواد المنسوخة إلى هذا البلاغ تلقائياً">
        <span class="sc-icon">📥</span><span>لصق الأكواد</span>
      </button>
    </div>
    <div id="cp-codes-preview" class="cp-codes-preview-box"></div>
    <div id="cp-copy-board" class="cp-copy-board" style="display:none"></div>
    <div id="cp-parts-review" class="cp-parts-review" style="display:none"></div>
    <div id="cp-fav-parts-wrap">
      <div class="cp-fav-head">
        <div class="cp-notes-title" style="margin:2px 0">⭐ قطع شائعة</div>
        <button type="button" class="cp-fav-manage" id="cp-fav-manage" title="إدارة القطع الشائعة (تعديل / حذف / تصدير)">⚙ إدارة</button>
      </div>
      <div id="cp-fav-parts" class="cp-fav-parts"></div>
    </div>
    <div id="cp-pick" style="display:none">
      <div id="cp-pick-title" style="font-size:11px;color:#fbbf24;margin-bottom:4px"></div>
      <select id="cp-pick-select" class="cp-select"></select>
      <div style="display:flex;gap:4px;margin-top:5px">
        <button id="cp-pick-ok" class="cp-btn cp-btn-exec" type="button" style="flex:1;font-size:11px">✅ اختيار</button>
        <button id="cp-pick-skip" class="cp-btn" type="button" style="flex:1;font-size:11px;background:#334466">⏭ تخطّي</button>
      </div>
    </div>
    <label class="cp-label">أكواد إضافية (اختيار متعدد):</label>
    <div class="cp-codes" id="cp-codes-list"></div>
    <button class="cp-btn cp-btn-inject" id="cp-defect-edit-btn" type="button" style="margin:6px 0">🛠 محرر الخدمات (أكواد / شورت كت / ملاحظات)</button>
    <div id="cp-defect-editor" style="display:none;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px;margin-bottom:8px">
      <div class="cp-edef-tabs" id="cp-edef-tabs">
        <button type="button" class="cp-edef-tab on" data-etab="codes">🔤 أكواد</button>
        <button type="button" class="cp-edef-tab" data-etab="shortcuts">⚡ شورت كت</button>
        <button type="button" class="cp-edef-tab" data-etab="notes">📝 ملاحظات</button>
        <button type="button" class="cp-edef-tab" data-etab="favorites">⭐ قطع</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:5px">
        <select id="cp-defect-family" class="cp-select" style="flex:1;margin:0">
          <option value="AC">تكييف (AC)</option>
          <option value="GS">بوتجاز ومسطح (GS)</option>
          <option value="GR">ثلاجات (GR)</option>
          <option value="WM">غسالات (WM)</option>
          <option value="HT">سخانات (HT)</option>
          <option value="DW">غسالات أطباق (DW)</option>
          <option value="*">⭐ مشترك (كل العائلات)</option>
        </select>
        <button class="cp-btn cp-btn-inject" id="cp-defect-export" type="button" style="flex:0 0 70px;margin:0;font-size:10px">📤 JSON</button>
        <button class="cp-btn" id="cp-defect-reset" type="button" style="flex:0 0 62px;margin:0;font-size:10px;background:#334466">↩️ استعادة</button>
      </div>
      <div id="cp-edef-hint" class="cp-empty" style="display:none">اختر عائلة محددة — الأكواد والملاحظات لكل عائلة على حدة</div>

      <div id="cp-edef-pane-codes" class="cp-edef-pane">
        <div id="cp-defect-count" class="cp-edef-count"></div>
        <div id="cp-defect-list" class="cp-edef-list"></div>
        <div class="cp-notes-title" style="margin:4px 0">➕ إضافة / تعديل كود</div>
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <input id="cp-defect-major" class="cp-amount" placeholder="AC001" style="flex:1;margin:0;font-size:10px;text-transform:uppercase">
          <input id="cp-defect-sub" class="cp-amount" placeholder="0005" style="flex:1;margin:0;font-size:10px;text-transform:uppercase">
        </div>
        <input id="cp-defect-full" class="cp-amount" placeholder="الكود الكامل (اختياري)" style="width:100%;box-sizing:border-box;margin:0 0 4px;font-size:10px;text-transform:uppercase">
        <input id="cp-defect-desc" class="cp-amount" placeholder="الوصف" style="width:100%;box-sizing:border-box;margin:0 0 4px;font-size:10px">
        <div style="display:flex;gap:4px">
          <button class="cp-btn cp-btn-exec" id="cp-defect-save" type="button" style="flex:1">➕ إضافة</button>
          <button class="cp-btn" id="cp-defect-cancel-edit" type="button" style="flex:0 0 80px;background:#334466;display:none">✕ إلغاء</button>
        </div>
      </div>

      <div id="cp-edef-pane-shortcuts" class="cp-edef-pane" style="display:none">
        <div id="cp-sc-count" class="cp-edef-count"></div>
        <div id="cp-sc-list" class="cp-edef-list"></div>
        <div class="cp-notes-title" style="margin:4px 0">➕ إضافة / تعديل زر</div>
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <input id="cp-sc-icon" class="cp-amount" value="⚡" maxlength="2" title="الأيقونة" style="flex:0 0 42px;margin:0;font-size:12px;text-align:center;direction:ltr">
          <input id="cp-sc-name" class="cp-amount" placeholder="اسم الزر" style="flex:1;margin:0;font-size:10px">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <select id="cp-sc-codefrom" class="cp-select" style="flex:1;margin:0;font-size:10px">
            <option value="">أكواد محددة</option>
            <option value="noFaultCode">كود «لا يوجد عطل» للعائلة</option>
          </select>
          <input id="cp-sc-amount" class="cp-amount" type="number" min="0" step="1" value="0" title="المبلغ المحصل" style="flex:0 0 66px;margin:0;font-size:10px">
        </div>
        <div id="cp-sc-codes-wrap">
          <div class="cp-label" style="margin:2px 0">أكواد الزر:</div>
          <div id="cp-sc-codes" class="cp-edef-picks"></div>
        </div>
        <div id="cp-sc-notes-wrap">
          <div class="cp-label" style="margin:2px 0">ملاحظات الزر (جمل التقرير):</div>
          <div id="cp-sc-notes" class="cp-edef-picks"></div>
        </div>
        <input id="cp-sc-note-text" class="cp-amount" placeholder="تعليق مباشر في خانة الملاحظات (اختياري)" style="width:100%;box-sizing:border-box;margin:0 0 4px;font-size:10px">
        <div style="display:flex;gap:4px">
          <button class="cp-btn cp-btn-exec" id="cp-sc-save" type="button" style="flex:1">➕ إضافة زر</button>
          <button class="cp-btn" id="cp-sc-cancel" type="button" style="flex:0 0 80px;background:#334466;display:none">✕ إلغاء</button>
        </div>
      </div>

      <div id="cp-edef-pane-notes" class="cp-edef-pane" style="display:none">
        <div id="cp-nt-count" class="cp-edef-count"></div>
        <div id="cp-nt-list" class="cp-edef-list"></div>
        <div class="cp-notes-title" style="margin:4px 0">➕ إضافة / تعديل ملاحظة</div>
        <textarea id="cp-nt-text" class="cp-amount" rows="2" maxlength="2000" placeholder="نص الملاحظة (حتى 2000 حرف)…" style="width:100%;box-sizing:border-box;margin:0 0 4px;font-size:10px;resize:vertical;direction:rtl;text-align:right"></textarea>
        <div style="display:flex;gap:4px">
          <button class="cp-btn cp-btn-exec" id="cp-nt-save" type="button" style="flex:1">➕ إضافة ملاحظة</button>
          <button class="cp-btn" id="cp-nt-cancel" type="button" style="flex:0 0 80px;background:#334466;display:none">✕ إلغاء</button>
        </div>
      </div>

      <div id="cp-edef-pane-favorites" class="cp-edef-pane" style="display:none">
        <div id="cp-fav-count" class="cp-edef-count"></div>
        <div id="cp-fav-list" class="cp-edef-list"></div>
        <div class="cp-notes-title" style="margin:4px 0">➕ إضافة / تعديل قطعة ⭐</div>
        <div class="cp-fav-form-row">
          <input id="cp-fav-code" class="cp-amount" placeholder="كود القطعة" style="flex:1;margin:0;font-size:10px;text-transform:uppercase">
          <input id="cp-fav-name" class="cp-amount" placeholder="اسم القطعة" style="flex:1;margin:0;font-size:10px">
        </div>
        <div class="cp-fav-form-row">
          <select id="cp-fav-family" class="cp-fav-sel" style="flex:1">
            <option value="">كل العائلات</option>
            <option value="AC">تكييف (AC)</option>
            <option value="GS">بوتجاز ومسطح (GS)</option>
            <option value="GR">ثلاجات (GR)</option>
            <option value="WM">غسالات (WM)</option>
            <option value="HT">سخانات (HT)</option>
            <option value="DW">غسالات أطباق (DW)</option>
          </select>
          <select id="cp-fav-warranty" class="cp-fav-sel" style="flex:1">
            <option value="">ضمان افتراضي</option>
            <option value="in">داخل الضمان</option>
            <option value="out">خارج الضمان</option>
          </select>
        </div>
        <div class="cp-fav-form-row">
          <input id="cp-fav-qty" class="cp-amount" type="number" min="1" step="1" value="1" title="الكمية الافتراضية" style="flex:0 0 56px;margin:0;font-size:10px">
          <input id="cp-fav-price" class="cp-amount" type="number" min="0" step="1" value="0" title="السعر الافتراضي" style="flex:0 0 76px;margin:0;font-size:10px">
          <input id="cp-fav-comment" class="cp-amount" placeholder="تعليق (اختياري)" maxlength="500" style="flex:1;margin:0;font-size:10px">
        </div>
        <div style="display:flex;gap:4px">
          <button class="cp-btn cp-btn-exec" id="cp-fav-save" type="button" style="flex:1">➕ إضافة قطعة</button>
          <button class="cp-btn" id="cp-fav-cancel" type="button" style="flex:0 0 80px;background:#334466;display:none">✕ إلغاء</button>
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class="cp-btn cp-btn-inject" id="cp-fav-export" type="button" style="flex:1;margin:0;font-size:10px">📤 تصدير ⭐</button>
          <button class="cp-btn" id="cp-fav-reset" type="button" style="flex:0 0 90px;margin:0;font-size:10px;background:#334466">↩️ استعادة</button>
        </div>
      </div>
    </div>
    <!-- Manual JSON input (replaces window.prompt) -->
    <div id="cp-manual-json-wrap" style="display:none;margin:8px 0">
      <label class="cp-label">أو الصق JSON يدوياً:</label>
      <textarea id="cp-manual-json" class="cp-amount" rows="3" placeholder='{"type":"ELARABY_CODES_BUNDLE","version":2,"faultCodes":[...],"spareParts":[...]}'></textarea>
      <div style="display:flex;gap:4px;margin-top:4px">
        <button class="cp-btn cp-btn-exec" id="cp-manual-json-apply" style="flex:1">✅ تطبيق</button>
        <button class="cp-btn" id="cp-manual-json-cancel" style="flex:1;background:#334466">✕ إلغاء</button>
      </div>
    </div>
    <div class="cp-shortcuts" id="cp-shortcuts">
      <div class="cp-notes-title" style="margin:4px 0 2px;padding-top:3px">⚡ شورت كت</div>
      <div id="cp-shortcut-buttons"></div>
      <div class="cp-shortcut-row" style="margin-top:2px">
        <button class="p2-sc" id="cp-parts-btn" style="flex:1;background:#1a2744;border-color:#f59e0b"><span class="sc-icon">🔧</span>قطع الغيار</button>
      </div>
    </div>
    <div class="cp-notes-title">📝 جمل التقرير</div>
    <div class="cp-notes-list" id="cp-notes-list"></div>
    <label class="cp-label" style="margin-top:8px">المبلغ المحصل:</label>
    <input type="text" class="cp-amount" id="cp-amount" value="0" />
    <button class="cp-btn cp-btn-gold" id="btn-exec3">▶ تنفيذ الكل</button>
  </div>
</div>
<button class="cp-btn cp-btn-stop" id="cp-stop" type="button" style="display:none">⏹ إيقاف التنفيذ الجاري</button>
<div class="cp-status" id="cp-status">✅ جاهز</div>
<div style="padding:3px 10px;border-top:1px solid #1a2340;display:flex;gap:4px">
  <button id="cp-copy-log" style="flex:1;padding:3px;border:1px solid #232840;border-radius:4px;background:#0d1528;color:#667799;font-size:9px;cursor:pointer">📋 نسخ اللوج</button>
  <button id="cp-clear-log" style="flex:1;padding:3px;border:1px solid #232840;border-radius:4px;background:#0d1528;color:#667799;font-size:9px;cursor:pointer">🗑️ مسح</button>
</div>
`;
  }

  // ── الشبكات المقسّمة على صفحات ──────────────────────────────────────────
  // البوابة تعرض ٤ صفوف فقط في الصفحة، والبقية في «2» وما بعدها:
  //   <div class="view-pagination" data-current-page="1" data-pages="1">
  //     <a data-page="2" class="entity-pager-next-link">
  // قراءة الصفحة الأولى وحدها تُسقط أكوادًا حقيقية من الحزمة (تحقق حي 2026-10-26).
  // ملاحظة حيّة: `data-pages="1"` قد تكون خاطئة مع وجود رابط للصفحة ٢ فعليًا
  //   ⇒ نأخذ الأكبر بين data-pages وأكبر data-page موجود في الروابط.
  const GRID_PAGE_WAIT_MS = 7000;
  const GRID_MAX_PAGES = 15;

  function gridRootOf(row) {
    if (!row) return null;
    let el = row.closest('table') || row.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      if (el.querySelector && el.querySelector('.view-pagination, .entity-pager-next-link')) return el;
      el = el.parentElement;
    }
    const tbl = row.closest('table');
    return tbl ? tbl.parentElement : null;
  }

  function gridPagerOf(root) {
    return root && root.querySelector ? root.querySelector('.view-pagination') : null;
  }

  function gridPageCount(root) {
    const pager = gridPagerOf(root);
    if (!pager) return 1;
    const declared = parseInt(pager.getAttribute('data-pages') || '', 10) || 0;
    const nums = Array.from(pager.querySelectorAll('a[data-page]'))
      .map(a => parseInt(a.getAttribute('data-page') || '0', 10))
      .filter(v => v > 0);
    const maxLink = nums.length ? Math.max(...nums) : 0;
    return Math.max(1, declared, maxLink);
  }

  function gridCurrentPage(root) {
    const pager = gridPagerOf(root);
    const n = pager ? parseInt(pager.getAttribute('data-current-page') || '', 10) : NaN;
    if (n > 0) return n;
    const active = pager ? pager.querySelector('li.active a[data-page]') : null;
    return active ? (parseInt(active.getAttribute('data-page') || '1', 10) || 1) : 1;
  }

  function gridRowsSignature(root, rowSelector) {
    if (!root) return '';
    const rows = Array.from(root.querySelectorAll(rowSelector || 'table tbody tr'));
    return rows.map(r => r.getAttribute('data-id')
      || (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)).join('|');
  }

  function findFirstGridRoot(selectors) {
    for (const doc of getShallowDocs()) {
      for (const sel of selectors) {
        const row = doc.querySelector(sel);
        if (!row) continue;
        const root = gridRootOf(row);
        if (root) return { doc, root, row };
      }
    }
    return null;
  }

  async function gotoGridPage(root, page, rowSelector) {
    const pager = gridPagerOf(root);
    if (!pager) return false;
    const link = pager.querySelector('a[data-page="' + page + '"]');
    if (!link) return false;
    // رابط معطّل/مخفي = لا صفحة فعلية (البوابة ترسم كل الروابط أحيانًا)
    const li = link.closest('li');
    if (li && (li.classList.contains('disabled') || li.classList.contains('hidden') || li.style.display === 'none')) return false;
    if (link.getAttribute('aria-disabled') === 'true') return false;
    const beforeSig = gridRowsSignature(root, rowSelector);
    const beforePage = gridCurrentPage(root);
    try { link.click(); } catch (_) { return false; }
    const deadline = Date.now() + GRID_PAGE_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const nowSig = gridRowsSignature(root, rowSelector);
      if (gridCurrentPage(root) !== beforePage || nowSig !== beforeSig) {
        await sleep(300); // استقرار الرسم بعد AJAX
        return true;
      }
    }
    return false;
  }

  // بوابة أخطاء البورتال: الرسالة «Error completing request» تعني أن الطلب فشل،
  // وما قُرئ حتى الآن هو المعتمد — لا نُكمل الترقيم على شبكة معطوبة.
  function gridErrorTextVisible() {
    const RE = /error\s*completing\s*request|حدث\s*خطأ\s*أثناء\s*تنفيذ\s*الطلب|an\s*error\s*has\s*occurred/i;
    try {
      for (const doc of getShallowDocs()) {
        const nodes = doc.querySelectorAll('.alert, .alert-danger, .alert-error, .validation-summary-errors, .notification, [role="alert"], .text-danger');
        for (const n of nodes) {
          const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 300) continue;
          if (!RE.test(t)) continue;
          if (isElementVisible(n)) return t.slice(0, 120);
        }
      }
    } catch (_) {}
    return '';
  }

  // يقرأ كل صفحة عبر readFn ويعيد نتائجها؛ ثم يُرجع الشبكة للصفحة ١
  // aborted=true ⇒ توقف الترقيم لخطأ بوابة (اقرأ ما تيسّر فقط)
  async function forEachGridPage(root, rowSelector, readFn, opts) {
    const o = opts || {};
    const totalPages = Math.min(gridPageCount(root), o.maxPages || GRID_MAX_PAGES);
    const pages = [readFn()];
    let prevSig = gridRowsSignature(root, rowSelector);
    let aborted = false;
    if (totalPages > 1) {
      for (let p = 2; p <= totalPages; p++) {
        const ok = await gotoGridPage(root, p, rowSelector);
        // خطأ البورتال أثناء الترقيم ⇒ توقف + اعتماد ما قُرئ (لا ترقيم أعمى)
        const errText = gridErrorTextVisible();
        if (errText) {
          logEvent('GRID', `⛔ خطأ بوابة أثناء الانتقال للصفحة ${p}: «${errText}» — توقف واعتماد ${pages.length} صفحة`);
          aborted = true;
          break;
        }
        if (!ok) break;
        const sig = gridRowsSignature(root, rowSelector);
        // نفس الصفوف ⇒ الصفحة لم تتغيّر فعلًا (نهاية الشبكة) — لا نعيد القراءة
        if (sig && sig === prevSig) break;
        prevSig = sig;
        pages.push(readFn());
      }
      if (gridCurrentPage(root) !== 1) await gotoGridPage(root, 1, rowSelector);
    }
    return { pages, totalPages, aborted };
  }

  const PARTS_GRID_ROW_SELECTORS = [
    'tr[data-entity="msdyn_inventoryadjustmentproduct"]',
    '#InventoryAdjustmentProduct_Subgrid table tbody tr',
    '#InventoryAdjustmentProduct_SubGrid table tbody tr',
    '#InventoryAdjustmentProductIsLscYes_Subgrid table tbody tr',
    'div[data-name*="InventoryAdjustmentProduct"] table tbody tr',
    'div[data-name*="inventoryadjustmentproduct"] table tbody tr'
  ];

  const DEFECT_GRID_ROW_SELECTORS = [
    'tr[data-entity="ldv_workorder_defect"]',
    '#WorkOrder_defect table tbody tr',
    '#WorkOrder_Defects table tbody tr',
    '#WorkOrderDefectIsLscYes_Subgrid table tbody tr',
    '[data-name*="WorkOrder_defect"] table tbody tr'
  ];

  // قراءة قطع الغيار من كل الصفحات (لا الأولى فقط) — إزالة تكرار بـ rowId
  async function readPartsFromGridAllPages() {
    const found = findFirstGridRoot(PARTS_GRID_ROW_SELECTORS);
    if (!found) {
      const only = readPartsFromGrid();
      return { parts: only.parts, total: only.total, pages: 1, totalPages: 1, aborted: false };
    }
    const res = await forEachGridPage(found.root, 'table tbody tr', () => readPartsFromGrid());
    const parts = [];
    const seen = new Set();
    let total = 0;
    res.pages.forEach(pageRes => {
      (pageRes.parts || []).forEach(p => {
        const key = p.rowId || `${p.code || ''}|${p.fullName || ''}|${p.qty}`;
        if (seen.has(key)) return;
        seen.add(key);
        parts.push(p);
        total += Number(p.total) || 0;
      });
    });
    return { parts, total, pages: res.pages.length, totalPages: res.totalPages, aborted: res.aborted === true };
  }

  function readPartsFromGrid() {
    const allDocs = getShallowDocs();

    for (const doc of allDocs) {
      // البحث أولاً في شبكات قطع الغيار المحددة حصراً لتجنب قراءة شبكة أكواد الأعطال (WorkOrder_defect)
      let rows = Array.from(doc.querySelectorAll(
        'tr[data-entity="msdyn_inventoryadjustmentproduct"]',
      ));
      if (rows.length === 0) {
        rows = Array.from(doc.querySelectorAll(
          '#InventoryAdjustmentProduct_Subgrid table tbody tr, ' +
          '#InventoryAdjustmentProduct_SubGrid table tbody tr, ' +
          '#InventoryAdjustmentProductIsLscYes_Subgrid table tbody tr, ' +
          'div[data-name*="InventoryAdjustmentProduct"] table tbody tr, ' +
          'div[data-name*="inventoryadjustmentproduct"] table tbody tr'
        ));
      }

      if (rows.length === 0) {
        // فحص الجداول التي ترويستها تحتوي صراحة على "قطعة الغيار" ولا تحتوي على "كود العطل"
        // (الجداول الـleaf فقط: الخارجي جدول تخطيط يحوي جداول متداخلة)
        const tables = Array.from(doc.querySelectorAll('div.view-grid table, table')).filter(isLeafTable);
        for (const tbl of tables) {
          if (tbl.closest('#WorkOrder_defect, #WorkOrder_Defects, #WorkOrderDefectIsLscYes_Subgrid, [data-name*="WorkOrder_defect"], [data-name*="defect"]')) continue;
          const ths = ownHeaderCells(tbl).map(th => th.innerText.trim());
          const thJoined = ths.join(' ');
          if (/قطعة\s*الغيار|Spare\s*Part/i.test(thJoined) && !/كود\s*العطل|Defect\s*Major/i.test(thJoined)) {
            rows = ownBodyRows(tbl);
            if (rows.length > 0) break;
          }
        }
      }

      if (rows.length === 0) continue;

      const parts = [];
      let total = 0;

      rows.forEach(tr => {
        // تجاهل صفوف أكواد الأعطال أو صفوف لا توجد سجلات
        if (tr.getAttribute('data-entity') === 'ldv_workorder_defect') return;
        // صف الرؤوس قد يُرسم داخل tbody — يُرفض
        if (isHeaderRow(tr)) return;
        const rawText = tr.innerText.trim();
        if (!rawText || /no\s*records|لا\s*توجد/i.test(rawText)) return;
        if (/sort\s*descending|sort\s*ascending/i.test(rawText) && !tr.querySelector('td[data-attribute]')) return;

        const rowId = tr.getAttribute('data-id') || '';
        const prodTd = tr.querySelector('td[data-attribute="msdyn_product"]');
        let productId = '';
        if (prodTd) {
          try { productId = JSON.parse(prodTd.getAttribute('data-value') || '{}').Id || ''; } catch(_) {}
        }

        // الاسم الفعلي كما يخزّنه البورتال: "CODE _ (الاسم العربي)"
        const rawName = (tr.getAttribute('data-name') || (prodTd && prodTd.getAttribute('aria-label')) || '').trim();
        const parsed = parsePartName(rawName);
        let code = parsed.code;
        let name = parsed.name;

        if (!code) {
          const codeTd = tr.querySelector('td[data-attribute="ats_productcode"], td[data-attribute="productnumber"]');
          if (codeTd) code = (codeTd.getAttribute('data-value') || codeTd.innerText || '').trim();
        }
        if (!code && !name && prodTd) {
          const t = (prodTd.innerText || '').trim();
          if (t) { const p2 = parsePartName(t); code = p2.code; name = p2.name || t; }
        }
        if (code) code = code.replace(/[\s_\-–—]+$/, '').trim();
        // فلتر نظافة: أي «كود» ليس كودًا حقيقيًا (سعر/نص أثاث/عربي) يُسقَط ويُبقى الاسم
        if (code && !isValidPartCode(code)) {
          logEvent('PARTS_GRID', `🧹 كود قطعة غير صالح أُسقط: «${code}»`);
          code = '';
        }

        const qtyTd = tr.querySelector('td[data-attribute="ats_quantity"], td[data-attribute="quantity"]');
        const priceTd = tr.querySelector('td[data-attribute="ats_price"]');
        const totalTd = tr.querySelector('td[data-attribute="ats_totalprice"]');
        const wTd = tr.querySelector('td[data-attribute="ats_warrantystatus"]');
        const invTd = tr.querySelector('td[data-attribute="ats_inventorystatus"]');

        let qty = 1;
        if (qtyTd) {
          const qVal = parseFloat((qtyTd.getAttribute('data-value') || qtyTd.innerText || '1').replace(/[^0-9.]/g, ''));
          if (!isNaN(qVal) && qVal > 0) qty = qVal;
        }

        const moneyOf = (td) => {
          if (!td) return 0;
          try {
            const v = JSON.parse(td.getAttribute('data-value') || '{}').Value;
            if (typeof v === 'number') return v;
          } catch(_) {}
          const n = parseFloat((td.getAttribute('data-value') || td.innerText || '0').replace(/[^0-9.]/g, ''));
          return isNaN(n) ? 0 : n;
        };
        let priceVal = moneyOf(priceTd);
        const totalVal = moneyOf(totalTd);
        if (priceVal === 0 && totalVal > 0 && qty > 0) priceVal = totalVal / qty;

        // الضمان لكل صف: داخل (in) / خارج (out)
        let warranty = '';
        if (wTd) {
          const aria = (wTd.getAttribute('aria-label') || '').toLowerCase();
          const raw = wTd.getAttribute('data-value') || '';
          if (aria.includes('out') || raw.includes('963400001')) warranty = 'out';
          else if (aria.includes('in') || raw.includes('963400000')) warranty = 'in';
          else if (/خارج/.test(wTd.innerText || '')) warranty = 'out';
          else if (/داخل/.test(wTd.innerText || '')) warranty = 'in';
        }

        let inventoryStatus = '';
        if (invTd) {
          const aria = (invTd.getAttribute('aria-label') || '').toLowerCase();
          inventoryStatus = aria === 'inside' ? 'inside' : aria === 'outside' ? 'outside' : '';
        }

        if (name || code) {
          parts.push({
            code: code || '',
            name: name || '',
            fullName: rawName || (code && name ? `${code} _ (${name})` : (code || name)),
            productId: productId || '',
            rowId: rowId || '',
            warranty: warranty || '',
            inventoryStatus: inventoryStatus || '',
            price: priceVal,
            qty: qty,
            total: totalVal || (priceVal * qty)
          });
          total += (totalVal || (priceVal * qty));
        }
      });

      if (parts.length > 0) return { parts, total };
    }

    return { parts: [], total: 0 };
  }

  function readOfficialSparePartsTotal() {
    let el = findFirstInFrames('#ldv_originaltotalusedsparepartscost, input[name*="originaltotalusedsparepartscost"]');
    if (el) {
      const raw = (el.value || el.innerText || '').replace(/[^0-9.]/g, '');
      const val = parseFloat(raw);
      return isNaN(val) ? 0 : val;
    }
    return 0;
  }

  function readSparePartsStatusFromPage() {
    let el = findFirstInFrames('#ats_sparepartsstatus, select[name*="sparepartsstatus"], select[aria-label*="قطع الغيار"]');
    return el ? String(el.value || '').trim() : '';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // تعليق قطع الغيار — بناء النص (دالة نقية قابلة للاختبار)
  // القواعد المعتمدة:
  //   مستعمل  : «تم تغيير :» + كل قطعة (بسعرها لو إجماليها > 0) + «// والتكلفة [X]» لو فيه سعر
  //   منتظر   : «يحتاج CODE (NAME) بالتكلفة X» لكل قطعة (بدون «بالتكلفة» لو السعر 0)
  //   سحب/استبدال: لا تعليق
  //   بدون قطع غيار: «تم» + أوصاف الأكواد المعلّمة
  //   حالة فاضية أو تناقض الحالة مع الجدول: توقف بلا كتابة
  // ════════════════════════════════════════════════════════════════════════════
  const NOTES_MAX = 2000;
  const PARTS_STATUS = {
    USED: '963400000',
    WAITING: '963400001',
    NONE: '963400002',
    WITHDRAW: '963400003',
    EXCHANGE: '963400004'
  };

  function buildPartsNote(opts) {
    const o = opts || {};
    const list = Array.isArray(o.parts) ? o.parts.filter(p => p && (p.code || p.name)) : [];
    const status = String(o.partsStatus || '').trim();
    const sec = Array.isArray(o.secondaryDescriptions) ? o.secondaryDescriptions.filter(Boolean) : [];
    const money = (n) => {
      const v = Math.round(Number(n) * 100) / 100;
      return Number.isFinite(v) ? String(v) : '0';
    };
    const totalOf = (p) => {
      const t = Number(p.total);
      if (Number.isFinite(t) && t > 0) return t;
      const price = Number(p.price);
      const qty = Number(p.qty) > 0 ? Number(p.qty) : 1;
      return (Number.isFinite(price) && price > 0) ? price * qty : 0;
    };
    const labelOf = (p) => {
      const code = String(p.code || '').trim();
      const name = String(p.name || '').trim();
      if (code && name) return `${code} (${name})`;
      return code || name;
    };
    // أكواد الأعطال المعلّمة: «RF2000/2006 — تنظيف او تسليك خرطوم الصرف»
    const codeLabelOf = (c) => {
      const major = String((c && (c.major || c.majorCode)) || '').trim().toUpperCase();
      const sub = String((c && (c.sub || c.subCode)) || '').trim().toUpperCase();
      const desc = String((c && c.desc) || '').trim();
      const id = major ? (sub ? major + '/' + sub : major) : '';
      if (id && desc) return `${id} — ${desc}`;
      return id || desc;
    };
    const workList = (Array.isArray(o.secondaryCodes) && o.secondaryCodes.length)
      ? o.secondaryCodes.map(codeLabelOf)
      : sec;
    const workLabels = workList
      .map(x => String(x || '').trim())
      .filter((x, i, arr) => x && arr.indexOf(x) === i);
    // لا نكرر في «تم عمل» ما ذُكر فعلًا في ملاحظة موجودة (مثل ملاحظة الشورت كت):
    // «تم ضبط الجوانات وتنظيف الصرف» تغطي «تنظيف…الصرف» و«ضبط جوان…».
    const existing = String(o.existingNotes || '').trim();
    const normTxt = (s) => String(s || '').toLowerCase()
      .replace(/[\u064B-\u0652\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');
    const existingNorm = normTxt(existing);
    const mentionedInNotes = (label) => {
      if (!existingNorm) return false;
      const desc = String(label || '').split('—').pop().trim();
      const words = normTxt(desc).split(/[^a-z\u0600-\u06FF0-9]+/).filter(w => w.length >= 3);
      return words.length > 0 && words.some(w => existingNorm.includes(w));
    };
    const workLabelsToAdd = workLabels.filter(l => !mentionedInNotes(l));

    if (!status) {
      return { text: '', action: 'need-status', reason: 'حالة قطع الغيار غير محددة', eligibleTotal: 0 };
    }
    if (status === PARTS_STATUS.WITHDRAW || status === PARTS_STATUS.EXCHANGE) {
      return {
        text: '',
        action: 'skip',
        reason: status === PARTS_STATUS.WITHDRAW ? 'حالة «سحب» — لا تعليق' : 'حالة «استبدال» — لا تعليق',
        eligibleTotal: 0
      };
    }
    if ((status === PARTS_STATUS.USED || status === PARTS_STATUS.WAITING) && list.length === 0) {
      return {
        text: '',
        action: 'conflict',
        reason: 'الحالة «مستعمل/منتظر» لكن لا توجد قطع في الجدول',
        eligibleTotal: 0
      };
    }
    if (status === PARTS_STATUS.NONE || list.length === 0) {
      const text = workLabels.length ? `تم ${workLabels.join(' و')}` : 'تم';
      return { text, action: 'done', reason: 'بدون قطع غيار — نص «تم» وأكواد الأعطال', eligibleTotal: 0 };
    }

    if (status === PARTS_STATUS.WAITING) {
      // سطر واحد آمن: «يحتاج» مرة واحدة + بلوكات + الإجمالي في الآخر
      const sum = list.reduce((s, p) => s + totalOf(p), 0);
      const blocks = list.map(p => {
        const t = totalOf(p);
        return t > 0 ? `[ ${labelOf(p)} ${money(t)} ]` : `[ ${labelOf(p)} ]`;
      }).join(' ');
      const tail = sum > 0 ? ` // الإجمالي [ ${money(sum)} ] ج.م` : '';
      return { text: 'يحتاج : ' + blocks + tail, action: 'done', reason: 'منتظر — طلب قطع', eligibleTotal: 0 };
    }

    // مستعمل (وأي حالة أخرى غير معروفة تُعامل كتنفيذ فعلي)
    const blocks = list.map(p => {
      const t = totalOf(p);
      return t > 0 ? `[ ${labelOf(p)} ${money(t)} ]` : `[ ${labelOf(p)} ]`;
    }).join(' ');
    const eligibleTotal = list.reduce((s, p) => s + totalOf(p), 0);
    // قاعدة المالك: «إجمالي السعر لقطع الغيار» هو المرجع الوحيد للتكلفة في التعليق،
    // ولو كان 0 نتجاهل التكلفة تمامًا (لا fallback لمجموع أسعار القطع).
    const official = Number(o.officialTotal);
    const grand = (Number.isFinite(official) && official > 0) ? official : 0;
    const workTail = workLabelsToAdd.length ? ` // تم عمل: [ ${workLabelsToAdd.join(' · ')} ]` : '';
    const text = `تم تغيير : ${blocks}`
      + (grand > 0 ? ` // والتكلفة [ ${money(grand)} ] ج.م` : '')
      + workTail;
    return {
      text,
      action: 'done',
      reason: eligibleTotal > 0 ? 'مستعمل — قطع خارج الضمان' : 'مستعمل — كل القطع داخل الضمان (بدون أسعار)',
      eligibleTotal
    };
  }

  // كتابة نص في «آخر تعليق» — مصدر واحد لكل الأزرار (شورت كت + قطع الغيار)
  // ملاحظة مهمة: الحقل في البوابة عنصر <input type="text" maxlength="2000">
  // وأي \n يُحذف تلقائيًا ⇒ نفصل بفاصل ظاهر في الـinput ونحتفظ بالسطر الجديد للـtextarea.
  function notesSeparator(el) {
    const tag = String((el && el.tagName) || '').toUpperCase();
    return tag === 'TEXTAREA' ? '\n' : ' | ';
  }

  async function appendNotesText(text) {
    const msg = String(text || '').trim();
    if (!msg) return { ok: false, reason: 'empty' };
    const el = findNotesField();
    if (!el) return { ok: false, reason: 'no-field' };
    const cur = String(el.value || '').trim();
    if (cur.includes(msg)) return { ok: true, duplicated: true };
    const combined = cur ? `${msg}${notesSeparator(el)}${cur}` : msg;
    if (combined.length > NOTES_MAX) return { ok: false, reason: 'too-long', length: combined.length };
    if (typeof emulateUserInput === 'function') {
      try { await emulateUserInput(el, combined); }
      catch (_) {
        el.value = combined;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      el.value = combined;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { ok: true };
  }

  // «المبلغ المحصل»: لا يُلمس إلا لو فاضي/صفر وفيه قطع خارج الضمان (لا ينقص قيمة يدوية أبدًا)
  function applyCollectedAmount(shadow, eligibleTotal) {
    const amtEl = shadow.getElementById('cp-amount');
    if (!amtEl) return { applied: false, reason: 'no-field' };
    const total = Number(eligibleTotal);
    if (!(Number.isFinite(total) && total > 0)) return { applied: false, reason: 'no-cost' };
    const cur = String(amtEl.value || '').trim();
    const curNum = parseFloat(cur.replace(/[^0-9.]/g, ''));
    const empty = cur === '' || !Number.isFinite(curNum) || curNum === 0;
    if (!empty) return { applied: false, reason: 'keep-manual', current: curNum };
    amtEl.value = String(Math.round(total * 100) / 100);
    return { applied: true, value: amtEl.value };
  }

  // الأكواد المعلّمة كاملة (رئيسي/فرعي/وصف) — تُطبع في كومنت قطع الغيار
  function checkedCodesInfo(shadow) {
    const device = readDeviceHint();
    const family = defectFamilyOf(device);
    const catalog = defectCodesFor(device, family);
    const byKey = new Map();
    (catalog || []).forEach(c => {
      const majorKey = String((c && c.major) || '').toUpperCase();
      const subKey = String((c && c.sub) || '').toUpperCase();
      if (!majorKey) return;
      byKey.set(majorKey + '|' + subKey, c);
      // احتياطي للكود بلا فرع: الرئيسي وحده
      if (!byKey.has(majorKey + '|')) byKey.set(majorKey + '|', c);
    });
    const out = [];
    const seen = new Set();
    shadow.querySelectorAll('.fault-cb:checked').forEach(cb => {
      const parts = String(cb.value || '').split(',');
      const major = String(parts[0] || '').toUpperCase().trim();
      if (!major) return;
      const sub = String(parts[1] || '').toUpperCase().trim();
      const key = major + '|' + sub;
      if (seen.has(key)) return;
      seen.add(key);
      const info = byKey.get(key) || byKey.get(major + '|') || {};
      out.push({
        major,
        sub,
        full: String(parts[2] || info.full || '').trim(),
        desc: String(info.desc || '').trim()
      });
    });
    return out;
  }

  // أوصاف الأكواد المعلّمة (توافق خلفي — تُستخدم في فرع «بدون قطع غيار»)
  function checkedCodeDescriptions(shadow) {
    return checkedCodesInfo(shadow).map(c => c.desc || c.major);
  }

  // انتظار تحميل صفوف القطع (AJAX) قبل الحكم «لا توجد قطع»
  async function waitForPartsRows(timeoutMs) {
    const status = readSparePartsStatusFromPage();
    const relevant = !status || status === PARTS_STATUS.USED || status === PARTS_STATUS.WAITING;
    const waitMs = relevant ? (timeoutMs || 3000) : 300;
    const deadline = Date.now() + waitMs;
    let last = { parts: [], total: 0 };
    for (;;) {
      last = readPartsFromGrid();
      if (last.parts.length > 0) return last;
      if (Date.now() >= deadline) return last;
      await sleep(250);
    }
  }

  async function executePartsShortcut(shadow) {
    logEvent('PARTS', 'بدء قراءة قطع الغيار');
    const { parts } = await waitForPartsRows(3000);
    const partsStatus = readSparePartsStatusFromPage();
    const officialTotal = readOfficialSparePartsTotal();
    const secondaryCodes = checkedCodesInfo(shadow);
    const secondary = secondaryCodes.map(c => c.desc || c.major);
    const notesEl = findNotesField();
    const existingNotes = String((notesEl && notesEl.value) || '').trim();

    const plan = buildPartsNote({ parts, partsStatus, officialTotal, secondaryDescriptions: secondary, secondaryCodes, existingNotes });
    logEvent('PARTS', `حالة=${partsStatus || 'فاضية'} • قطع=${parts.length} • رسمي=${officialTotal} • أكواد معلّمة=${secondaryCodes.length} • ملاحظة قائمة=${existingNotes ? 'نعم' : 'لا'} • قرار=${plan.action} — ${plan.reason}`);

    if (plan.action === 'need-status') {
      setStatus(shadow, '⚠️ حدّد حالة قطع الغيار الأول (مستعمل/منتظر/بدون…)، ثم أعد المحاولة', 'warn');
      return;
    }
    if (plan.action === 'conflict') {
      setStatus(shadow, '⚠️ الحالة «مستعمل/منتظر» لكن جداول القطع فاضية — صحّح الحالة أو أضف القطع', 'warn');
      return;
    }
    if (plan.action === 'skip') {
      setStatus(shadow, `ℹ️ ${plan.reason} — لم يُكتب شيء`, 'warn');
      return;
    }

    const res = await appendNotesText(plan.text);
    if (!res.ok) {
      const msg = res.reason === 'no-field'
        ? '❌ حقل الملاحظات غير موجود — لم يُكتب شيء'
        : res.reason === 'too-long'
          ? `⚠️ النص ${res.length} حرفًا وأقصى حد ${NOTES_MAX} — لم يُكتب شيء`
          : '⚠️ لم يُكتب شيء';
      setStatus(shadow, msg, 'warn');
      logEvent('PARTS', `⛔ لم تُكتب الملاحظة: ${res.reason}${res.length ? ' (' + res.length + ')' : ''}`);
      return;
    }

    const amt = applyCollectedAmount(shadow, plan.eligibleTotal);
    const dupNote = res.duplicated ? ' (موجود مسبقًا)' : '';
    let amtMsg = '';
    if (amt.applied) amtMsg = ` • المبلغ المحصل = ${amt.value}`;
    else if (amt.reason === 'keep-manual') amtMsg = ` • المبلغ المحصل كما هو (${amt.current})`;
    else if (plan.eligibleTotal > 0) amtMsg = ` • 💡 تكلفة القطع: ${Math.round(plan.eligibleTotal * 100) / 100}`;

    setStatus(shadow, `✅ ${plan.reason}${dupNote}${amtMsg}`, 'success');
    logEvent('PARTS', `✅ تم: ${plan.reason} — النص:\n${plan.text}`);
  }

  // ربط آمن: أي خطأ في ميزة واحدة لا يوقف بقية أزرار اللوحة (كان bindEvents
  // يخرج كاملًا عند أول استثناء ⇒ «اللوحة كلها وقفت»).
  function safeBind(shadow, name, fn) {
    try { fn(); }
    catch (e) {
      const msg = (e && (e.message || e)) || 'خطأ غير معروف';
      try { logEvent('BIND', `⚠️ فشل ربط «${name}»: ${msg}`); } catch (_) {}
      try { setStatus(shadow, `⚠️ خطأ في «${name}»: ${msg}`, 'warn'); } catch (_) {}
    }
  }

  // التقاط أي خطأ غير معالج وإظهاره في شريط الحالة + السجل (بدل تجمّد صامت).
  let _panelErrorsHooked = false;
  function hookPanelErrors(shadow) {
    if (_panelErrorsHooked) return;
    _panelErrorsHooked = true;
    try {
      window.addEventListener('error', (e) => {
        const msg = (e && e.message) || '';
        if (!msg) return;
        try { logEvent('ERROR', `${msg} @ ${(e.filename || '').split('/').pop()}:${e.lineno || 0}`); } catch (_) {}
      });
      window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        const msg = (r && (r.message || r)) || 'promise';
        try { logEvent('ERROR', 'unhandled: ' + String(msg)); } catch (_) {}
      });
    } catch (_) {}
  }

  function bindEvents(shadow) {
    PANEL_SHADOW = shadow;
    renderFavParts(shadow);
    try { renderCopyBoard(shadow); } catch (e) { logEvent('COPY_CODES', 'لوحة النسخ: ' + (e.message || e)); }
    loadFavStore()
      .then(() => {
        try { renderFavParts(shadow); } catch (_) {}
        try { renderCopyBoard(shadow); } catch (_) {}
      })
      .catch(e => logEvent('FAV', 'تحميل ⭐: ' + (e.message || e)));
    shadow.getElementById('cp-toggle').onclick = () => { logEvent('CLICK', 'نقر على زر التبديل'); toggle(shadow); };
    shadow.getElementById('cp-dock').onclick = () => { logEvent('CLICK', 'نقر على زر الإرساء'); toggleDock(shadow); };
    const defaultBtn = shadow.getElementById('btn-default-p1');
    if (defaultBtn) defaultBtn.onclick = () => { logEvent('CLICK', 'نقر على تعبئة بيانات افتراضية'); runExclusive(shadow, 'تعبئة افتراضية', () => fillDefaultDeviceData(shadow)); };
    shadow.getElementById('btn-exec1').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 1'); runExclusive(shadow, 'تنفيذ الصفحة 1', () => executePage1(shadow)); };
    shadow.getElementById('btn-exec2').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 2'); runExclusive(shadow, 'تنفيذ الصفحة 2', () => executePage2(shadow)); };
    safeBind(shadow, 'التالي التلقائي (ص2)', () => bindAutoNext2(shadow));
    safeBind(shadow, 'ملاحظات الموديل', () => bindModelNoteEditor(shadow));
    safeBind(shadow, 'محرر أكواد الأعطال', () => bindDefectEditor(shadow));
    safeBind(shadow, 'محرر القطع الشائعة ⭐', () => bindFavEditor(shadow));
    safeBind(shadow, 'أزرار الشورت كت', () => {
      loadDefectCatalog().then(() => { try { renderShortcuts(shadow); } catch (e) { logEvent('SHORTCUT', 'render: ' + (e.message || e)); } });
    });
    hookPanelErrors(shadow);
    const stopBtn = shadow.getElementById('cp-stop');
    if (stopBtn) stopBtn.onclick = () => { logEvent('CLICK', 'نقر على إيقاف'); cancelExecution(shadow, 'user').catch(() => {}); };
    shadow.querySelectorAll('.p2-sc').forEach(btn => {
      btn.onclick = () => {
        const sc = btn.dataset.sc;
        logEvent('SHORTCUT_P2', `${sc} → تنفيذ`);
        runExclusive(shadow, `شورت كت ص2 ${sc}`, () => executePage2(shadow, sc));
      };
    });
    const addProbBtn = shadow.getElementById('btn-add-problem');
    if (addProbBtn) {
      addProbBtn.onclick = () => {
        logEvent('CLICK', 'نقر على إضافة المشكلة المختارة');
        const PC = window.ProblemCodes;
        // أثناء انتظار المحرّك لاختيارك: سلّمه الاختيار مباشرة (بدون قفل التنفيذ)
        if (PC && typeof PC.hasPendingPick === 'function' && PC.hasPendingPick()) {
          addSelectedProblem(shadow);
          return;
        }
        runExclusive(shadow, 'إضافة مشكلة مختارة', () => addSelectedProblem(shadow));
      };
    }
    renderProblemOptions(shadow, loadProblemOptions());
    bindProblemServiceChoice(shadow);
    shadow.getElementById('btn-exec3').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الكل'); runExclusive(shadow, 'تنفيذ الكل', () => executePage3(shadow)); };
    const btnCopyCodes = shadow.getElementById('btn-copy-codes');
    if (btnCopyCodes) {
      btnCopyCodes.onclick = () => {
        logEvent('CLICK', 'نقر على نسخ الأكواد');
        runExclusive(shadow, 'نسخ الأكواد', () => copyCodesAction(shadow));
      };
    }
    const btnPasteCodes = shadow.getElementById('btn-paste-codes');
    if (btnPasteCodes) {
      btnPasteCodes.onclick = () => {
        logEvent('CLICK', 'نقر على لصق الأكواد');
        runExclusive(shadow, 'لصق الأكواد', () => pasteCodesAction(shadow));
      };
    }
    const shortcutBox = shadow.getElementById('cp-shortcut-buttons');
    if (shortcutBox && shortcutBox.dataset.bound !== '1') {
      shortcutBox.dataset.bound = '1';
      shortcutBox.addEventListener('click', (e) => {
        const btn = e.target.closest('.cp-shortcut-btn');
        if (!btn) return;
        const id = btn.dataset.sc;
        logEvent('SHORTCUT_PANEL', `${id} → تنفيذ`);
        runExclusive(shadow, `شورت كت ${id}`, async () => {
          const ok = await runShortcut(shadow, id);
          if (!ok) return;
          await executePage3(shadow);
        });
      });
    }
    shadow.getElementById('cp-parts-btn').onclick = () => {
      logEvent('CLICK', 'نقر على قطع الغيار');
      runExclusive(shadow, 'قطع الغيار', () => executePartsShortcut(shadow));
    };
    shadow.getElementById('cp-copy-log').onclick = () => {
      const text = getLogText();
      navigator.clipboard.writeText(text).then(() => {
        setStatus(shadow, '✅ تم نسخ اللوج (' + debugLog.length + ' سطر)', 'success');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        setStatus(shadow, '✅ تم نسخ اللوج', 'success');
      });
    };
    shadow.getElementById('cp-clear-log').onclick = () => {
      clearLog();
      setStatus(shadow, '🗑️ تم مسح اللوج', 'success');
    };
    bindProblemPickGate(shadow);
    makeDraggable(shadow);
  }

  // ── بوابة اختيار كود المشكلة (مشتركة: الاوتو فيلينج + الكنترول بانل) ──
  let _problemGateBound = false;
  let _problemCountdownTimer = null;

  function focusPage2Tab(shadow) {
    try {
      if (isMinimized) toggle(shadow, true);
      shadow.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
      const tab = shadow.querySelector('.cp-tab[data-page="PAGE_2"]');
      if (tab) tab.classList.add('active');
    } catch (_) {}
  }

  function bindProblemPickGate(shadow) {
    if (_problemGateBound) return;
    const PC = window.ProblemCodes;
    if (!PC || !PC.PICK_EVENT) return;
    _problemGateBound = true;
    document.addEventListener(PC.PICK_EVENT, (e) => {
      const detail = (e && e.detail) || {};
      const list = Array.isArray(detail.list) ? detail.list : [];
      focusPage2Tab(shadow);
      renderProblemOptions(shadow, list, {
        device: detail.device || '',
        service: detail.service || '',
        persist: true
      });
      const cd = shadow.getElementById('cp-problem-countdown');
      const total = Number(detail.timeoutMs) || 0;
      const started = Date.now();
      const tick = () => {
        const left = Math.max(0, Math.ceil((total - (Date.now() - started)) / 1000));
        if (cd) cd.textContent = left > 0
          ? `⏳ اختر من القائمة خلال ${left} ثانية (لن يُختار تلقائيًا)`
          : '⌛ انتهت المهلة — اختر من القائمة واضغط «إضافة المشكلة»';
        if (left <= 0) { clearInterval(_problemCountdownTimer); _problemCountdownTimer = null; }
      };
      if (_problemCountdownTimer) clearInterval(_problemCountdownTimer);
      tick();
      _problemCountdownTimer = setInterval(tick, 500);
      logEvent('PROB_PICK', `طلب اختيار مشكلة — ${list.length} كود مسموح (مهلة ${total}ms)`);
    });
  }

  function toggle(shadow, forceShow, forceHide) {
    if (forceHide) isMinimized = true;
    else if (forceShow) isMinimized = false;
    else isMinimized = !isMinimized;
    logEvent('TOGGLE', isMinimized ? 'تصغير' : 'فتح');
    const panel = shadow.querySelector('.cp-panel');
    const body = shadow.getElementById('cp-body');
    const status = shadow.getElementById('cp-status');
    const tgl = shadow.getElementById('cp-toggle');
    const oldBtn = document.getElementById(PANEL_ID + '-mini');
    const oldPopup = document.getElementById(PANEL_ID + '-popup');
    if (oldBtn) oldBtn.remove();
    if (oldPopup) oldPopup.remove();
    if (isMinimized) {
      panel.style.display = 'none';
      const mini = document.createElement('div');
      mini.id = PANEL_ID + '-mini';
      mini.textContent = '⚙';
      Object.assign(mini.style, {
        position: 'fixed', bottom: '20px', right: '20px', width: '48px', height: '48px',
        background: 'linear-gradient(135deg,#1e40af,#2563eb)', color: '#fff',
        borderRadius: '50%', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        zIndex: '2147483647', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', lineHeight: '1', cursor: 'pointer', fontFamily: 'sans-serif',
        transition: 'transform 0.15s', userSelect: 'none'
      });
      mini.onclick = () => { logEvent('CLICK', 'نقر على الأيقونة المصغرة'); toggle(shadow, true); };
      document.body.appendChild(mini);

      const isPage3 = detectPage() === 'PAGE_3';

      if (isPage3) {
        const popup = document.createElement('div');
        popup.id = PANEL_ID + '-popup';
        popup.innerHTML = `
          <div id="${PANEL_ID}-popup-box" style="position:fixed;bottom:84px;right:76px;background:#131821;border:1px solid #232840;border-radius:8px;padding:6px;z-index:2147483646;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;display:none;box-shadow:0 8px 24px rgba(0,0,0,.7);transition:opacity .15s ease;">
            <div style="font-size:10px;color:#fbbf24;font-weight:700;margin-bottom:4px;text-align:center">⚡ شورت كت</div>
            <div id="${PANEL_ID}-popup-btns" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px"></div>
            <button id="${PANEL_ID}-popup-exec" style="width:100%;margin-top:4px;padding:5px;border:none;border-radius:4px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-size:10px;font-weight:700;cursor:pointer">▶ تنفيذ الكل</button>
          </div>`;
        document.body.appendChild(popup);
        const popupBox = popup.querySelector(`#${PANEL_ID}-popup-box`);

        let popupVisible = false;
        const showPopup = () => {
          popupVisible = true;
          popupBox.style.display = 'block';
          mini.style.transform = 'scale(1.1)';
          logEvent('SHORTCUTS_POPUP', 'إظهار البوب اب');
        };
        const hidePopup = () => {
          popupVisible = false;
          setTimeout(() => {
            if (!popupVisible) {
              popupBox.style.display = 'none';
              mini.style.transform = 'scale(1)';
            }
          }, 600);
        };

        mini.onmouseenter = showPopup;
        mini.onmouseleave = hidePopup;
        popupBox.onmouseenter = () => { popupVisible = true; };
        popupBox.onmouseleave = hidePopup;

        const popupBtns = popup.querySelector(`#${PANEL_ID}-popup-btns`);
        const renderPopupShortcuts = () => {
          if (!popupBtns) return;
          const family = defectFamilyOf(readDeviceHint());
          const { list } = visibleShortcuts(family);
          if (!list.length) {
            popupBtns.innerHTML = '<div style="font-size:9px;color:#94a3b8;text-align:center;grid-column:1/-1">لا توجد أزرار لهذه العائلة</div>';
            return;
          }
          popupBtns.innerHTML = list.map(s => {
            const label = escapeHtml(s.icon ? `${s.icon} ${s.name}` : s.name || s.id);
            const shared = s._scope === 'shared';
            return `<button class="sc-popup-btn" data-sc="${escapeHtml(s.id)}" title="${escapeHtml(s.name || s.id)}${shared ? ' — مشترك' : ''}" style="padding:4px 2px;border:1px solid ${shared ? '#3a5a8a' : '#2a3050'};border-radius:4px;background:${shared ? '#132033' : '#0d1528'};color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">${label}</button>`;
          }).join('');
        };
        renderPopupShortcuts();
        if (typeof loadDefectCatalog === 'function') {
          loadDefectCatalog().then(() => { try { renderPopupShortcuts(); } catch (e) { logEvent('SHORTCUTS_POPUP', 'render: ' + (e.message || e)); } });
        }

        popupBtns && popupBtns.addEventListener('click', (e) => {
          const btn = e.target.closest('.sc-popup-btn');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          const sc = btn.dataset.sc;
          console.log(`%c[PortalHelper] POPUP SHORTCUT: ${sc} → select + execute`, 'color:#4ade80;font-weight:bold;font-size:14px');
          logEvent('SHORTCUT_POPUP', `شورت كت: ${sc} → تنفيذ`);
          popupBox.style.display = 'none';
          mini.style.transform = 'scale(1)';
          try {
            runExclusive(shadow, `شورت كت بوب-اب ${sc}`, async () => {
              const ok = await runShortcut(shadow, sc);
              if (!ok) return;
              await executePage3(shadow);
            });
          } catch(err) {
            console.error('[PortalHelper] POPUP ERROR:', err);
            logEvent('SHORTCUT_POPUP', `خطأ: ${err.message}`);
          }
        });

        // زر تنفيذ الكل في البوب اب
        const execBtn = popup.querySelector(`#${PANEL_ID}-popup-exec`);
        if (execBtn) {
          execBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`%c[PortalHelper] POPUP EXECUTE ALL`, 'color:#2563eb;font-weight:bold;font-size:14px');
            logEvent('SHORTCUT_POPUP', 'نقر: تنفيذ الكل');
            popupBox.style.display = 'none';
            mini.style.transform = 'scale(1)';
            try {
              runExclusive(shadow, 'تنفيذ الكل (بوب-اب)', () => executePage3(shadow));
            } catch(err) {
              console.error('[PortalHelper] POPUP EXEC ERROR:', err);
              logEvent('SHORTCUT_POPUP', `خطأ تنفيذ: ${err.message}`);
            }
          });
        }

        logEvent('SHORTCUTS_POPUP', 'تم إنشاء الـ popup');
      } else {
        mini.onmouseenter = () => mini.style.transform = 'scale(1.1)';
        mini.onmouseleave = () => mini.style.transform = 'scale(1)';
      }
    } else {
      panel.style.display = '';
    }
    if (tgl) tgl.textContent = isMinimized ? '+' : '−';
    saveState(shadow);
  }

  // تطبيق حالة الإرساء بدون toggle — يُستخدم في الاستعادة والحقن من جديد
  function setDock(shadow, dock) {
    const panel = shadow.querySelector('.cp-panel');
    const host = document.getElementById(PANEL_ID);
    if (!panel || !host) return;
    isDocked = dock;
    if (isDocked) {
      panel.classList.add('docked');
      let placed = false;
      // 1) الأفضل: أعلى المحتوى، مباشرة قبل الفورم (في البوابة الفورم ابن مباشر لـ body)
      const form = document.querySelector('form');
      if (form && form.parentNode && form.offsetParent !== null) {
        form.parentNode.insertBefore(host, form);
        placed = true;
      }
      // 2) main / .main-content الظاهر
      if (!placed) {
        for (const sel of ['main', '.main-content']) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null && el.getBoundingClientRect().height > 200) {
            el.insertBefore(host, el.firstChild);
            placed = true;
            break;
          }
        }
      }
      // 3) أكبر .container ظاهر خارج شريط التنقل — أول .container في البوابة داخل النافبار (ارتفاعه ٥٧px) ويحبس اللوحة
      if (!placed) {
        const cands = Array.from(document.querySelectorAll('.container'))
          .filter(el => el.offsetParent !== null && !el.closest('.navbar') && el.getBoundingClientRect().height > 200)
          .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
        if (cands[0]) { cands[0].insertBefore(host, cands[0].firstChild); placed = true; }
      }
      // 4) لا حاوية إرساء ظاهرة ⇒ لا نحبس اللوحة داخل عنصر مخفي
      if (!placed) {
        isDocked = false;
        panel.classList.remove('docked');
        document.body.appendChild(host);
        logEvent('DOCK', 'لا حاوية إرساء ظاهرة — العودة للوضع العائم');
      }
    } else {
      panel.classList.remove('docked');
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.bottom = '';
      document.body.appendChild(host);
      // Restore user's last undocked dimensions
      const saved = loadState();
      if (saved.width) {
        panel.style.width = saved.width + 'px';
      }
      if (saved.height) {
        panel.style.height = saved.height + 'px';
      }
    }
    const dockBtn = shadow.getElementById('cp-dock');
    if (dockBtn) dockBtn.classList.toggle('active', isDocked);
  }

  function toggleDock(shadow) {
    setDock(shadow, !isDocked);
    saveState(shadow);
  }

  // ⚡ الشورت كت — يُقرأ بالكامل من defect-catalog.json (أزرار العائلة + الأزرار المشتركة)
  async function runShortcut(shadow, type) {
    logEvent('SHORTCUT', `بدء: ${type}`);
    logPageSnapshot(`شورت كت: ${type}`);
    console.log(`%c[PortalHelper] runShortcut: ${type}`, 'color:#fbbf24;font-weight:bold');

    const family = defectFamilyOf(readDeviceHint());
    const { services, list } = visibleShortcuts(family);
    const def = list.find(s => s.id === type);
    if (!def) {
      setStatus(shadow, `⚠️ الشورت كت «${type}» غير معرّف لهذه العائلة — أضفه من المحرر`, 'warn');
      logEvent('SHORTCUT', `⛔ ${type}: غير موجود في defect-catalog (عائلة ${family || '؟'})`);
      return false;
    }

    const codes = shadow.querySelectorAll('.fault-cb');
    const notes = shadow.querySelectorAll('.note-cb');
    const amount = shadow.getElementById('cp-amount');

    logEvent('SHORTCUT', `عائلة=${family || '؟'} • أكواد اللوحة=${codes.length} • ملاحظات=${notes.length}`);
    if (codes.length === 0) {
      setStatus(shadow, '⚠️ لا توجد أكواد أعطال في اللوحة — افتح تبويب الصفحة 3 لتحميل الكتالوج', 'warn');
      logEvent('SHORTCUT', '⛔ إيقاف: لا توجد checkboxes أكواد أعطال');
      return false;
    }

    // مسح التحديد السابق
    codes.forEach(cb => { cb.checked = false; });
    notes.forEach(cb => { cb.checked = false; });

    // ① الأكواد — «رئيسي|فرعي» يحدد الفرع بدقة، و«رئيسي» يحدد كل فروعه
    const wanted = shortcutCodes(def, services);
    const missing = [];
    wanted.forEach(code => {
      let hit = false;
      codes.forEach(cb => {
        const parts = String(cb.value || '').split(',');
        const entry = String(parts[0] || '').toUpperCase() + (parts[1] ? '|' + String(parts[1]).toUpperCase() : '');
        if (shortcutCodeMatches(entry, code)) { cb.checked = true; hit = true; }
      });
      if (!hit) missing.push(code);
    });
    if (missing.length) logEvent('SHORTCUT', `⚠️ أكواد غير موجودة في اللوحة: ${missing.join(' | ')}`);

    // ② الملاحظات المعلّمة (بمعرّف الملاحظة لا بترتيبها)
    const noteIds = Array.isArray(def.noteIds) ? def.noteIds : [];
    let notesChecked = 0;
    if (noteIds.length) {
      notes.forEach(cb => {
        if (noteIds.includes(cb.dataset.noteId)) { cb.checked = true; notesChecked++; }
      });
    }

    // ③ تعليق مباشر في خانة الملاحظات (مثل «عدم توافر»)
    let noteWritten = false;
    if (def.noteText) noteWritten = await appendShortcutNote(def.noteText);

    // ④ المبلغ (0 يعني بدون تحصيل)
    const amountNum = Number(def.amount);
    const amountOut = String(Number.isFinite(amountNum) ? amountNum : 0);
    if (amount) amount.value = amountOut;

    const finalChecked = shadow.querySelectorAll('.fault-cb:checked').length;
    if (finalChecked === 0) {
      setStatus(shadow, `⚠️ الشورت كت «${def.name || type}» لم يطابق أي كود — لم يُحدَّد شيء`, 'warn');
      logEvent('SHORTCUT', `⛔ ${type}: 0 كود — أكواد مطلوبة: ${wanted.join(' | ') || '—'}`);
      return false;
    }

    const extras = `${notesChecked ? ' + ملاحظة' : ''}${noteWritten ? ' + تعليق' : ''}`;
    const missMsg = missing.length ? ` • ⚠️ غير موجود في اللوحة: ${missing.join(' · ')}` : '';
    setStatus(shadow, `✅ ${def.name || type} (${finalChecked} كود)${extras} + ${amountOut} جنيه${missMsg}`, missing.length ? 'warn' : 'success');
    logEvent('SHORTCUT', `النتيجة: ${finalChecked} كود, ${notesChecked} ملاحظة${noteWritten ? ', تعليق مباشر' : ''}, مبلغ ${amountOut}`);
    return true;
  }

  // خانة الملاحظات الحقيقية في البوابة (نفس سلسلة البحث المستخدمة في التنفيذ)
  function findNotesField() {
    let el = typeof findFieldByLabel === 'function'
      ? (findFieldByLabel(['Notes', 'ملاحظات', 'الملاحظات', 'التعليق', 'notes_support'], 'textarea')
        || findFieldByLabel(['Notes', 'ملاحظات', 'الملاحظات', 'التعليق', 'notes_support'], 'input'))
      : null;
    if (!el) el = document.querySelector('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
    if (!el) el = findFirstInFrames('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
    return el || null;
  }

  // كتابة تعليق الشورت كت — تُمرَّر إلى الكاتب الموحّد (نفس كاتب قطع الغيار)
  async function appendShortcutNote(text) {
    const res = await appendNotesText(text);
    if (!res.ok) logEvent('SHORTCUT', `⚠️ تعليق لم يُكتب (${res.reason})`);
    else logEvent('SHORTCUT', res.duplicated ? 'التعليق موجود مسبقًا — بدون تكرار' : `✍️ تعليق في الملاحظات: ${text}`);
    return !!res.ok;
  }

  function makeDraggable(shadow) {
    const header = shadow.getElementById('cp-header');
    const panel = shadow.querySelector('.cp-panel');
    let startX, startY, origX, origY;
    header.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (isDocked) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = rect.left; origY = rect.top;
      document.onmousemove = (ev) => {
        ev.preventDefault();
        panel.style.left = (origX + ev.clientX - startX) + 'px';
        panel.style.top = (origY + ev.clientY - startY) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };
      document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; saveState(shadow); };
    };
  }

  function setStatus(shadow, msg, type) {
    const el = shadow.getElementById('cp-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'success' ? '#4ade80' : type === 'error' ? '#ef4444' : type === 'warn' ? '#fbbf24' : '#94a3b8';
  }

  // منع التشغيل المتوازي + مهلة قصوى 5 دقائق + إيقاف يدوي آمن (يفرّغ القفل ويغلق المودالات)
  let execLock = false;
  let execCancelRequested = false;
  let execWatchdog = null;
  const EXEC_TIMEOUT_MS = 5 * 60 * 1000;

  function setStopVisible(shadow, visible) {
    const btn = shadow && shadow.getElementById('cp-stop');
    if (btn) btn.style.display = visible ? 'block' : 'none';
  }

  // تُستدعى بين خطوات التنفيذ الطويل: ترفع استثناءً هادئًا عند طلب الإيقاف.
  function assertNotCancelled() {
    if (execCancelRequested) throw new Error('cancelled-by-user');
  }

  async function cancelExecution(shadow, reason) {
    if (!execLock && !execCancelRequested) return;
    execCancelRequested = true;
    logEvent('EXEC', 'طلب إيقاف: ' + reason);
    setStatus(shadow, '⏹ جارٍ الإيقاف وإغلاق المودالات…', 'warn');
    try { await resetModalsBeforeStep('إيقاف يدوي'); } catch (_) {}
    if (execWatchdog) { clearTimeout(execWatchdog); execWatchdog = null; }
    execLock = false;
    setStopVisible(shadow, false);
    setStatus(shadow, '⏹ أُوقف التنفيذ — يمكنك البدء من جديد', 'warn');
  }

  async function runExclusive(shadow, label, fn) {
    if (execLock) {
      logEvent('EXEC', `مرفوض (${label}): يوجد تنفيذ جارٍ`);
      setStatus(shadow, '⏳ يوجد تنفيذ جارٍ — انتظر انتهائه أو اضغط «إيقاف»', 'warn');
      return;
    }
    execLock = true;
    execCancelRequested = false;
    setStatus(shadow, `⏳ جارٍ: ${label}…`, 'warn');
    setStopVisible(shadow, true);
    execWatchdog = setTimeout(() => {
      logEvent('EXEC', `انتهت المهلة القصوى (5 دقائق): ${label}`);
      cancelExecution(shadow, 'timeout').catch(() => {});
    }, EXEC_TIMEOUT_MS);
    try {
      await fn();
    } catch (e) {
      if (e && e.message === 'cancelled-by-user') {
        logEvent('EXEC', `أُلغي التنفيذ (${label})`);
      } else {
        console.error('[PortalHelper] EXEC ERROR:', label, e);
        logEvent('EXEC', `خطأ (${label}): ${e && e.message}`);
        setStatus(shadow, `❌ خطأ: ${e && e.message}`, 'error');
      }
    } finally {
      if (execWatchdog) { clearTimeout(execWatchdog); execWatchdog = null; }
      execLock = false;
      execCancelRequested = false;
      setStopVisible(shadow, false);
    }
  }

  function updateTab(shadow) {
    const page = detectPage();
    logEvent('TAB', `الصفحة الحالية: ${page}`);
    shadow.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
    const tab = shadow.querySelector(`.cp-tab[data-page="${page}"]`);
    if (tab) tab.classList.add('active');
    if (page === 'PAGE_1') {
      renderModelNote(shadow);
    } else {
      const noteEl = shadow.getElementById('cp-model-note');
      if (noteEl) {
        noteEl.style.display = 'none';
        noteEl.textContent = '';
      }
    }
    if (page === 'PAGE_2') updateDeviceInfo(shadow);
    if (page === 'PAGE_3') {
      updateDeviceCodes(shadow);
      renderFavParts(shadow);
      try { renderCopyBoard(shadow); } catch (_) {}
    }
  }

  function detectInstallation() {
    const allDocs = getShallowDocs();
    for (const doc of allDocs) {
      try {
        const nameEl = doc.querySelector('#ats_workordertype_name') || doc.querySelector('#ats_servicetype_name');
        if (nameEl) {
          const v = (nameEl.value || nameEl.innerText || '') || '';
          if (/تركيب|installation/i.test(v)) { logEvent('INSTALL', `#ats_workordertype_name="${v}" → تركيب`); return true; }
        }
        const sel = doc.querySelector('#ldv_workordertype');
        if (sel) {
          const selText = sel.options && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '') : '';
          if (sel.value === '0' || /installation/i.test(selText)) { logEvent('INSTALL', `#ldv_workordertype="${sel.value}" → تركيب`); return true; }
        }
        const hiddenVal = doc.querySelector('#ldv_workordertype_Value');
        if (hiddenVal && hiddenVal.value === '0') { logEvent('INSTALL', '#ldv_workordertype_Value="0" → تركيب'); return true; }
      } catch(e) {}
    }
    // fallback: بحث label نوع الخدمة
    const labels = Array.from(document.querySelectorAll('label, .field-label, th'));
    for (const k of ['نوع الخدمة', 'نوع البلاغ', 'Report Type', 'Service Type']) {
      const label = labels.find(l => l.innerText && l.innerText.trim().includes(k));
      if (!label) continue;
      const td = label.closest('td, .cell, [data-logical-name]');
      const valEl = td ? td.querySelector('.control input, .control select, .control [role="textbox"], .control') : null;
      const val = valEl ? (valEl.value || valEl.innerText || '') : '';
      if (/تركيب|installation/i.test(val)) { logEvent('INSTALL', `label "${k}" → تركيب`); return true; }
    }
    logEvent('INSTALL', 'لم يتم العثور على تركيب');
    return false;
  }

  // ── نوع الخدمة: install | maintenance | unknown ──────────────────────
  // المصدر الأول هو الحقل الصريح #ats_workordertype_name (label: نوع الخدمة)،
  // ثم #ats_servicetype_name، ثم خلية label «نوع الخدمة»، وأخيرًا #ldv_workordertype
  // كاحتياط فقط — كي لا يقلب احتياط قديم نتيجة صريحة (صيانة → تركيب).
  function readServiceType() {
    const pick = (v) => {
      const s = String(v || '').trim();
      if (!s) return '';
      if (/تركيب|installation/i.test(s)) return 'install';
      if (/صيان|maintenance/i.test(s)) return 'maintenance';
      return '';
    };

    for (const doc of getShallowDocs()) {
      try {
        const el = doc.querySelector('#ats_workordertype_name') || doc.querySelector('#ats_servicetype_name');
        if (!el) continue;
        const svc = pick(el.value || el.innerText || el.getAttribute('aria-label'));
        if (svc) {
          logEvent('SERVICE', `#ats_workordertype_name="${(el.value || '').trim()}" → ${svc === 'install' ? 'تركيب' : 'صيانة'}`);
          return svc;
        }
      } catch (_) {}
    }

    try {
      const labels = Array.from(document.querySelectorAll('label, .field-label, th'));
      for (const k of ['نوع الخدمة', 'نوع البلاغ', 'Report Type', 'Service Type']) {
        const label = labels.find(l => l.innerText && l.innerText.trim().includes(k));
        if (!label) continue;
        const td = label.closest('td, .cell, [data-logical-name]');
        const valEl = td ? td.querySelector('.control input, .control select, .control [role="textbox"], .control') : null;
        const svc = pick(valEl ? (valEl.value || valEl.innerText || '') : '');
        if (svc) { logEvent('SERVICE', `label "${k}" → ${svc}`); return svc; }
      }
    } catch (_) {}

    try {
      for (const doc of getShallowDocs()) {
        const sel = doc.querySelector('#ldv_workordertype');
        const selText = sel && sel.options && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '') : '';
        const svc = pick(selText) || (sel && sel.value === '0' ? 'install' : '');
        if (svc) {
          logEvent('SERVICE', `#ldv_workordertype (احتياط) → ${svc}`);
          return svc;
        }
      }
    } catch (_) {}

    logEvent('SERVICE', 'نوع الخدمة غير معروف');
    return 'unknown';
  }

  // غلاف متوافق لكل المواضع القديمة (تنبيه التركيب، بيانات الجهاز، صفحة ٣...)
  function resolveIsInstall() {
    if (readServiceType() === 'install') return true;
    if (typeof isInstallationReport === 'function') {
      try { if (isInstallationReport() === true) return true; } catch(_) {}
    }
    return false;
  }

  const PAGE_WARN_ID = 'cp-page-install-warn';

  function findAttachmentsField() {
    const allDocs = getShallowDocs();
    for (const doc of allDocs) {
      try {
        const fieldset = doc.querySelector('fieldset[aria-label="مرفقات"], fieldset[aria-label*="مرفق"], [data-name="tab_4_section_7"]');
        if (fieldset) return { el: fieldset, doc };
        const notes = doc.querySelector('#notescontrol, .entity-notes, [data-add-accept-types]');
        if (notes) return { el: notes, doc };
      } catch(e) {}
    }
    return null;
  }

  function injectInstallWarnIntoPage() {
    try {
      document.getElementById(PAGE_WARN_ID)?.remove();
      if (!resolveIsInstall()) return;
      const attach = findAttachmentsField();
      if (!attach) { logEvent('INSTALL', 'مرفقات غير موجودة في الصفحة'); return; }
      const { el } = attach;
      const target = el.tagName === 'FIELDSET' ? el : (el.closest('fieldset') || el);
      const warn = document.createElement('div');
      warn.id = PAGE_WARN_ID;
      warn.setAttribute('role', 'alert');
      warn.style.cssText = 'background:#7f1d1d;border:2px solid #dc2626;border-radius:8px;padding:10px 14px;margin:12px 0;color:#fbbf24;font-weight:700;font-size:15px;text-align:center;font-family:Segoe UI,Tahoma,Arial,sans-serif;box-shadow:0 2px 8px rgba(220,38,38,.3)';
      warn.innerHTML = '⚠️ <b>لا تنسي صورة الضمان وفيديو الفاكيوم</b>';
      target.insertAdjacentElement('afterend', warn);
      logEvent('INSTALL', 'تم حقن التنبيه تحت المرفقات');
    } catch(e) {
      logEvent('INSTALL', 'خطأ حقن التنبيه: ' + e.message);
    }
  }

  function updateDeviceInfo(shadow) {
    const info = shadow.getElementById('cp-device-info');
    if (!info) return;
    const device = readDeviceHint();
    const isInstall = resolveIsInstall();
    const typeLabel = isInstall ? 'تركيب' : 'صيانة';
    const typeClass = isInstall ? 'cp-install' : 'cp-maintenance';
    info.innerHTML = `الجهاز: <b>${escapeHtml(device || 'غير معروف')}</b><br>نوع البلاغ: <span class="${typeClass}">${typeLabel}</span>`;
    const installWarn = shadow.getElementById('cp-install-warn');
    if (installWarn) installWarn.style.display = isInstall ? 'block' : 'none';
    injectInstallWarnIntoPage();
  }

  // ── كتالوج أكواد الأعطال (صفحة 3) — منفصل عن مشاكل الصفحة 2 ──────────
  const DEFECT_CATALOG_FILE = 'defect-catalog.json';
  let _defectCatalog = null;
  let _defectCatalogPromise = null;

  async function loadDefectCatalog(force) {
    if (_defectCatalog && !_defectCatalog.error && !force) return _defectCatalog;
    if (_defectCatalogPromise && !force) return _defectCatalogPromise;
    _defectCatalogPromise = (async () => {
      try {
        const res = await fetch(chrome.runtime.getURL(DEFECT_CATALOG_FILE), { cache: 'no-store' });
        if (!res || res.ok === false) throw new Error('http ' + ((res && res.status) || '?'));
        _defectCatalog = await res.json();
      } catch (e) {
        _defectCatalog = { families: {}, error: String((e && e.message) || e) };
        logEvent('CODES', '⚠️ تعذّر تحميل defect-catalog.json: ' + _defectCatalog.error);
      }
      _defectCatalogPromise = null;
      return _defectCatalog;
    })();
    return _defectCatalogPromise;
  }

  function defectFamilyOf(device) {
    const PC = window.ProblemCodes;
    const fromCatalog = (PC && typeof PC.familyOf === 'function') ? PC.familyOf(device) : '';
    if (fromCatalog) return fromCatalog;
    // طبقة الموديل: بعض البلاغات تُرجع «نوع المنتج» كود مجموعة (مثل HA) لا اسمًا،
    // فيفشل familyOf. الموديل الفعلي 1 (مثل GR-EF40P-…) يحسم العائلة ببادئته.
    try {
      const modelEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
      const modelVal = String((modelEl && modelEl.value) || '').trim();
      if (modelVal) {
        const fromModel = (PC && typeof PC.familyOf === 'function') ? PC.familyOf(modelVal) : '';
        if (fromModel) {
          logEvent('CODES', `device="${device}" غير معروف — الموديل "${modelVal}" ⇒ ${fromModel}`);
          return fromModel;
        }
      }
    } catch (_) {}
    return getDeviceAC() ? 'AC' : '';
  }

  // ── إدارة أكواد الأعطال: تعديل/حذف/إضافة فوق كتالوج الإضافة ─────────
  // الملف الرسمي للقراءة فقط وقت التشغيل ⇒ التعديلات تُحفظ في
  // chrome.storage.local → defect_catalog_user وتُدمج مع defect-catalog.json،
  // ويمكن تصديرها JSON للنشر الدائم.
  const LS_DEFECT_USER = 'defect_catalog_user';
  let _defectUser = null;
  let _defectUserPromise = null;   // يمنع قراءات storage المتكررة/المتوازية
  let _defectEditingKey = '';
  let _defectDeleteArmed = null;
  let _defectResetArmed = 0;

  function defectKey(family, major, sub) {
    return [family, major, sub].map(x => String(x || '').trim().toUpperCase()).join('|');
  }

  function bundledDefectCodes(family) {
    const fam = String(family || '').toUpperCase();
    const entry = _defectCatalog && _defectCatalog.families && _defectCatalog.families[fam];
    return (entry && Array.isArray(entry.codes)) ? entry.codes.filter(c => c && c.major) : [];
  }

  async function loadDefectUser(force) {
    if (_defectUser && !force) return _defectUser;
    if (_defectUserPromise && !force) return _defectUserPromise;
    _defectUserPromise = (async () => {
      try {
        const got = await chrome.storage.local.get({ [LS_DEFECT_USER]: { version: 2, codes: [], notes: [], shortcuts: [] } });
        const v = got && got[LS_DEFECT_USER];
        _defectUser = (v && typeof v === 'object') ? v : { version: 2 };
        normalizeDefectUser(_defectUser);
      } catch (e) {
        _defectUser = { version: 2, codes: [], notes: [], shortcuts: [] };
        logEvent('CODES', 'تعذّر قراءة تعديلات الكتالوج: ' + (e.message || e));
      }
      return _defectUser;
    })();
    try { return await _defectUserPromise; }
    finally { _defectUserPromise = null; }
  }

  // توحيد شكل مخزن التعديلات: أكواد + ملاحظات + شورت كت (ترقيات آمنة)
  function normalizeDefectUser(obj) {
    const out = (obj && typeof obj === 'object') ? obj : {};
    ['codes', 'notes', 'shortcuts'].forEach(k => {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    out.version = 2;
    return out;
  }

  async function saveDefectUser(data) {
    _defectUser = normalizeDefectUser((data && typeof data === 'object') ? data : null);
    try { await chrome.storage.local.set({ [LS_DEFECT_USER]: _defectUser }); }
    catch (e) { logEvent('CODES', 'تعذّر حفظ تعديلات الكتالوج: ' + (e.message || e)); }
    // إعادة الرسم مؤجّلة (خارج دورة حدث الحفظ) حتى لا تتعارض مع الكتابة في الحقول
    if (PANEL_SHADOW) {
      const sh = PANEL_SHADOW;
      setTimeout(() => {
        try { renderDefectEditor(sh); } catch (e) { logEvent('CODES', 'renderDefectEditor: ' + (e.message || e)); }
        try { updateDeviceCodes(sh); } catch (e) { logEvent('CODES', 'updateDeviceCodes: ' + (e.message || e)); }
      }, 0);
    }
  }

  // دمج الرسمي + تعديلات المستخدم: same key = استبدال، removed = حذف.
  function mergedDefectCodes(family) {
    const fam = String(family || '').toUpperCase();
    const map = new Map();
    bundledDefectCodes(fam).forEach(c => {
      map.set(defectKey(fam, c.major, c.sub), { ...c, family: fam, _src: 'bundled' });
    });
    const overrides = (_defectUser && Array.isArray(_defectUser.codes))
      ? _defectUser.codes.filter(c => c && String(c.family || '').toUpperCase() === fam)
      : [];
    overrides.forEach(c => {
      if (!c || !c.major) return;
      const k = defectKey(fam, c.major, c.sub);
      if (c.removed) { map.delete(k); return; }
      map.set(k, {
        major: String(c.major).toUpperCase(),
        sub: String(c.sub || '').toUpperCase(),
        full: c.full || '',
        desc: c.desc || '',
        family: fam,
        _src: 'user'
      });
    });
    return Array.from(map.values());
  }

  function defectCodesFor(device, family) {
    const fam = family || defectFamilyOf(device);
    if (!fam) return [];
    return mergedDefectCodes(fam);
  }

  // ── الخدمات: شورت كت + ملاحظات + كود «لا يوجد عطل» لكل عائلة ──────────
  // المصدر: defect-catalog.json (families[FAM].{shortcuts,notes,noFaultCode} + sharedShortcuts)
  function familyServices(family) {
    const fam = String(family || '').toUpperCase();
    const entry = (_defectCatalog && _defectCatalog.families && _defectCatalog.families[fam]) || null;
    return {
      shortcuts: mergedShortcutsFor(fam),
      notes: mergedNotesFor(fam),
      noFaultCode: entry ? String(entry.noFaultCode || '').toUpperCase() : '',
      shared: mergedSharedShortcuts()
    };
  }

  // ── دمج تعديلات المستخدم فوق الكتالوج الرسمي ─────────────────────────
  // الأكواد/الملاحظات/الشورت كت كلها في نفس المخزن _defectUser، والمفتاح
  // family='*' يعني «مشترك لكل العائلات» (للشورت كت فقط).
  // ملاحظة: typeof guard مقصود — اختبارات smoke تُقيّم هذه الكتلة وحدها.
  function catalogOverrides(kind, family) {
    const fam = String(family || '').toUpperCase();
    if (typeof _defectUser === 'undefined' || !_defectUser) return [];
    const arr = _defectUser[kind];
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && String(x.family || '').toUpperCase() === fam);
  }

  function normalizeShortcutDef(raw, scope) {
    const s = (raw && typeof raw === 'object') ? raw : {};
    const codes = Array.isArray(s.codes)
      ? Array.from(new Set(s.codes.map(c => String(c || '').toUpperCase().trim()).filter(Boolean)))
      : [];
    const noteIds = Array.isArray(s.noteIds)
      ? Array.from(new Set(s.noteIds.map(x => String(x || '').trim()).filter(Boolean)))
      : [];
    const amount = Number(s.amount);
    return {
      id: String(s.id || '').trim(),
      name: String(s.name || '').trim(),
      icon: String(s.icon || '⚡'),
      codes,
      noteIds,
      noteText: String(s.noteText || '').trim(),
      codeFrom: s.codeFrom === 'noFaultCode' ? 'noFaultCode' : '',
      amount: Number.isFinite(amount) ? amount : 0,
      _scope: scope,
      _src: s._src === 'user' ? 'user' : 'bundled'
    };
  }

  function mergeShortcutList(base, overrides, scope) {
    const map = new Map();
    (Array.isArray(base) ? base : []).forEach(s => {
      if (!s || !s.id) return;
      map.set(String(s.id), normalizeShortcutDef(s, scope));
    });
    (Array.isArray(overrides) ? overrides : []).forEach(o => {
      if (!o || !o.id) return;
      const id = String(o.id).trim();
      if (o.removed) { map.delete(id); return; }
      const def = normalizeShortcutDef(o, scope);
      def._src = 'user';
      if (!def.name) def.name = id;
      map.set(id, def);
    });
    return Array.from(map.values());
  }

  function mergedNotesFor(family) {
    const fam = String(family || '').toUpperCase();
    const entry = _defectCatalog && _defectCatalog.families && _defectCatalog.families[fam];
    const map = new Map();
    if (entry && Array.isArray(entry.notes)) {
      entry.notes.forEach(n => {
        if (!n || !n.id || !String(n.text || '').trim()) return;
        map.set(String(n.id), { id: String(n.id), text: String(n.text), _src: 'bundled' });
      });
    }
    catalogOverrides('notes', fam).forEach(o => {
      if (!o || !o.id) return;
      const id = String(o.id);
      if (o.removed) { map.delete(id); return; }
      const text = String(o.text || '').trim();
      if (!text) return;
      map.set(id, { id, text, _src: 'user' });
    });
    return Array.from(map.values());
  }

  function mergedShortcutsFor(family) {
    const fam = String(family || '').toUpperCase();
    const entry = _defectCatalog && _defectCatalog.families && _defectCatalog.families[fam];
    const base = (entry && Array.isArray(entry.shortcuts)) ? entry.shortcuts.filter(s => s && s.id) : [];
    return mergeShortcutList(base, catalogOverrides('shortcuts', fam), 'family');
  }

  function mergedSharedShortcuts() {
    const base = (_defectCatalog && Array.isArray(_defectCatalog.sharedShortcuts))
      ? _defectCatalog.sharedShortcuts.filter(s => s && s.id)
      : [];
    return mergeShortcutList(base, catalogOverrides('shortcuts', '*'), 'shared');
  }

  // أكواد الشورت كت الفعلية — codeFrom:'noFaultCode' يُحلّ إلى كود العائلة
  function shortcutCodes(shortcut, services) {
    if (!shortcut) return [];
    const out = [];
    const push = (v) => {
      const s = String(v || '').toUpperCase().trim();
      if (s && !out.includes(s)) out.push(s);
    };
    (shortcut.codes || []).forEach(push);
    if (shortcut.codeFrom === 'noFaultCode' && services && services.noFaultCode) push(services.noFaultCode);
    return out;
  }

  // مطابقة كود الزر مع كود القائمة:
  //   «رئيسي|فرعي» = الكود الفرعي بالتحديد (AC003|L24B · RF3600|3606)
  //   «رئيسي» فقط = كل فروعه (السلوك القديم — داعم للخلف)
  function shortcutCodeMatches(entryCode, wantedCode) {
    const entry = String(entryCode || '').toUpperCase().trim();
    const want = String(wantedCode || '').toUpperCase().trim();
    if (!entry || !want) return false;
    const [wMajor, wSub] = want.split('|');
    const [eMajor, eSub] = entry.split('|');
    if (wMajor !== eMajor) return false;
    if (!wSub) return true;
    return String(eSub || '') === wSub;
  }

  // الأزرار الظاهرة للعائلة: أزرار العائلة ثم المشتركة (بلا تكرار معرّف)
  function visibleShortcuts(family) {
    const services = familyServices(family);
    const seen = new Set();
    const list = [];
    services.shortcuts.forEach(s => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      list.push({ ...s, _scope: 'family' });
    });
    services.shared.forEach(s => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      list.push({ ...s, _scope: 'shared' });
    });
    return { services, list };
  }

  // ════════════════════════════════════════════════════════════════════
  // محرر الخدمات الموحّد — تبويبات: أكواد / شورت كت / ملاحظات
  // كل التعديلات تُحفظ في chrome.storage.local فوق الكتالوج الرسمي،
  // ويمكن تصديرها JSON للنشر الدائم في defect-catalog.json.
  // ════════════════════════════════════════════════════════════════════
  let _editorTab = 'codes';
  let _scEditingId = '';
  let _ntEditingId = '';
  let _scDeleteArmed = null;
  let _ntDeleteArmed = null;

  function editorFamily(shadow) {
    const sel = shadow.getElementById('cp-defect-family');
    return (sel && sel.value) ? sel.value : 'AC';
  }

  function setEditorTab(shadow, tab) {
    _editorTab = (tab === 'shortcuts' || tab === 'notes' || tab === 'favorites') ? tab : 'codes';
    shadow.querySelectorAll('.cp-edef-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.etab === _editorTab);
    });
  }

  function clipText(text, max) {
    const s = String(text || '');
    return s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s;
  }

  function shortcutMetaText(def) {
    const out = [];
    if (def.codes && def.codes.length) out.push(`${def.codes.length} كود`);
    if (def.codeFrom === 'noFaultCode') out.push('كود لا يوجد عطل');
    if (def.noteIds && def.noteIds.length) out.push(`${def.noteIds.length} ملاحظة`);
    if (def.noteText) out.push('تعليق');
    if (def.amount) out.push(`${def.amount} ج.م`);
    return out.join(' · ') || '—';
  }

  function renderDefectEditor(shadow) {
    const box = shadow.getElementById('cp-defect-editor');
    if (!box) return;
    setEditorTab(shadow, _editorTab);
    const fam = editorFamily(shadow);
    const sharedScope = fam === '*';
    const showHint = sharedScope && _editorTab !== 'shortcuts' && _editorTab !== 'favorites';
    const hint = shadow.getElementById('cp-edef-hint');
    if (hint) hint.style.display = showHint ? 'block' : 'none';
    ['codes', 'shortcuts', 'notes', 'favorites'].forEach(t => {
      const pane = shadow.getElementById('cp-edef-pane-' + t);
      if (pane) pane.style.display = (!showHint && t === _editorTab) ? 'block' : 'none';
    });
    if (showHint) return;
    if (_editorTab === 'favorites') {
      if (_favStore) renderFavEditor(shadow);
      else {
        const list = shadow.getElementById('cp-fav-list');
        if (list) list.innerHTML = '<div class="cp-empty">⏳ جاري تحميل قطع ⭐…</div>';
        loadFavStore().then(() => { try { renderFavEditor(shadow); } catch (_) {} });
      }
    }
    else if (_editorTab === 'shortcuts') renderShortcutEditor(shadow, fam);
    else if (_editorTab === 'notes') renderNoteEditor(shadow, fam);
    else renderCodeEditor(shadow, fam);
  }

  function renderCodeEditor(shadow, fam) {
    const list = shadow.getElementById('cp-defect-list');
    if (!list) return;
    const codes = mergedDefectCodes(fam);
    const count = shadow.getElementById('cp-defect-count');
    if (count) count.textContent = `${codes.length} كود — العائلة ${fam}`;
    if (!codes.length) {
      list.innerHTML = '<div class="cp-empty">لا توجد أكواد لهذه العائلة — أضف أول كود من الأسفل</div>';
      return;
    }
    list.innerHTML = codes.map(c => {
      const major = escapeHtml(c.major);
      const sub = escapeHtml(c.sub || '');
      const desc = escapeHtml(c.desc || '');
      return `<div class="cp-defect-row${c._src === 'user' ? ' user' : ''}" data-major="${major}" data-sub="${sub}" data-desc="${desc}">`
        + `<span class="cp-defect-code">${major}${sub ? '/' + sub : ''}</span>`
        + `<span class="cp-defect-desc" title="${desc}">${desc || '—'}</span>`
        + `<button type="button" class="cp-defect-mini" data-act="edit" title="تعديل">✏️</button>`
        + `<button type="button" class="cp-defect-mini cp-defect-del" data-act="del" title="حذف">🗑️</button>`
        + `</div>`;
    }).join('');
  }

  function renderShortcutEditor(shadow, fam) {
    const list = shadow.getElementById('cp-sc-list');
    if (!list) return;
    const shared = fam === '*';
    const items = shared ? mergedSharedShortcuts() : mergedShortcutsFor(fam);
    const count = shadow.getElementById('cp-sc-count');
    if (count) count.textContent = `${items.length} زر — ${shared ? 'مشترك لكل العائلات' : 'العائلة ' + fam}`;

    // النطاق المشترك: الأكواد والملاحظات تُحلّ من عائلة الجهاز وقت التشغيل
    const codesWrap = shadow.getElementById('cp-sc-codes-wrap');
    if (codesWrap) codesWrap.style.display = shared ? 'none' : 'block';
    const notesWrap = shadow.getElementById('cp-sc-notes-wrap');
    if (notesWrap) notesWrap.style.display = shared ? 'none' : 'block';

    list.innerHTML = items.length
      ? items.map(s => {
        const cls = 'cp-edef-row' + (s._src === 'user' ? ' user' : '');
        return `<div class="${cls}" data-id="${escapeHtml(s.id)}">`
          + `<span class="cp-edef-name" title="${escapeHtml(s.id)}">${escapeHtml(s.icon || '⚡')} ${escapeHtml(s.name || s.id)}</span>`
          + `<span class="cp-edef-meta">${escapeHtml(shortcutMetaText(s))}</span>`
          + `<button type="button" class="cp-defect-mini" data-act="edit" title="تعديل">✏️</button>`
          + `<button type="button" class="cp-defect-mini cp-defect-del" data-act="del" title="حذف">🗑️</button>`
          + `</div>`;
      }).join('')
      : `<div class="cp-empty">لا توجد أزرار ${shared ? 'مشتركة' : 'لهذه العائلة'} — أضف أول زر من الأسفل</div>`;

    const codesBox = shadow.getElementById('cp-sc-codes');
    if (codesBox) {
      // كل كود فرعي سطر مستقل (RF3600/3606 ≠ RF3600/3607) حتى لا تضيع دقة الزر:
      // القيمة «رئيسي|فرعي» = تحديد فرعي صريح، و«رئيسي» = كل فروعه.
      const codes = shared ? [] : mergedDefectCodes(fam).filter(c => String(c.major || '').trim());
      codesBox.innerHTML = codes.length
        ? codes.map(c => {
          const major = String(c.major || '').toUpperCase();
          const sub = String(c.sub || '').toUpperCase();
          const val = sub ? major + '|' + sub : major;
          return `<label><input type="checkbox" class="sc-code-cb" value="${escapeHtml(val)}"> <span>${escapeHtml(major)} — ${escapeHtml(c.desc || '')}${sub ? ` <span class="cp-badge">${escapeHtml(sub)}</span>` : ''}</span></label>`;
        }).join('')
        : '<div class="cp-empty">لا توجد أكواد لهذه العائلة بعد — أضفها من تبويب «أكواد»</div>';
    }

    const notesBox = shadow.getElementById('cp-sc-notes');
    if (notesBox) {
      const notes = shared ? [] : mergedNotesFor(fam);
      notesBox.innerHTML = notes.length
        ? notes.map(n => `<label><input type="checkbox" class="sc-note-cb" data-note-id="${escapeHtml(n.id)}"> <span>${escapeHtml(clipText(n.text, 80))}</span></label>`).join('')
        : '<div class="cp-empty">لا توجد ملاحظات لهذه العائلة بعد — أضفها من تبويب «ملاحظات»</div>';
    }
  }

  function renderNoteEditor(shadow, fam) {
    const list = shadow.getElementById('cp-nt-list');
    if (!list) return;
    const notes = mergedNotesFor(fam);
    const count = shadow.getElementById('cp-nt-count');
    if (count) count.textContent = `${notes.length} ملاحظة — العائلة ${fam}`;
    if (!notes.length) {
      list.innerHTML = '<div class="cp-empty">لا توجد ملاحظات لهذه العائلة — أضف أول ملاحظة من الأسفل</div>';
      return;
    }
    list.innerHTML = notes.map(n => {
      const cls = 'cp-edef-row' + (n._src === 'user' ? ' user' : '');
      return `<div class="${cls}" data-id="${escapeHtml(n.id)}">`
        + `<span class="cp-edef-text" title="${escapeHtml(n.text)}">${escapeHtml(n.text)}</span>`
        + `<button type="button" class="cp-defect-mini" data-act="edit" title="تعديل">✏️</button>`
        + `<button type="button" class="cp-defect-mini cp-defect-del" data-act="del" title="حذف">🗑️</button>`
        + `</div>`;
    }).join('');
  }

  async function deleteDefectCode(shadow, family, major, sub) {
    const user = await loadDefectUser();
    const key = defectKey(family, major, sub);
    const isBundled = bundledDefectCodes(family).some(c => defectKey(family, c.major, c.sub) === key);
    let codes = (user.codes || []).filter(c => defectKey(c.family, c.major, c.sub) !== key);
    if (isBundled) {
      codes.push({ family, major, sub: sub || '', removed: true, updatedAt: new Date().toISOString() });
    }
    await saveDefectUser({ ...user, version: 2, codes });
    setStatus(shadow, `🗑️ حُذف ${major}${sub ? '/' + sub : ''}`, 'success');
    logEvent('CODES', `حذف كود عطل: ${family} ${major}/${sub}${isBundled ? ' (تجاوز الرسمي)' : ''}`);
  }

  async function deleteShortcutDef(shadow, family, id) {
    const fam = String(family || '*').toUpperCase();
    const user = await loadDefectUser();
    const bundled = fam === '*'
      ? ((_defectCatalog && Array.isArray(_defectCatalog.sharedShortcuts)) ? _defectCatalog.sharedShortcuts : [])
      : (((_defectCatalog && _defectCatalog.families && _defectCatalog.families[fam]) || {}).shortcuts || []);
    const isBundled = (Array.isArray(bundled) ? bundled : []).some(s => s && String(s.id) === String(id));
    const rows = (user.shortcuts || []).filter(x => !(String(x.family || '').toUpperCase() === fam && String(x.id || '') === String(id)));
    if (isBundled) rows.push({ family: fam, id: String(id), removed: true, updatedAt: new Date().toISOString() });
    await saveDefectUser({ ...user, shortcuts: rows });
    setStatus(shadow, `🗑️ حُذف الزر «${id}»${isBundled ? ' (تجاوز الرسمي)' : ''}`, 'success');
    logEvent('CODES', `حذف زر شورت كت: ${fam} ${id}${isBundled ? ' (تجاوز الرسمي)' : ''}`);
  }

  async function deleteNoteDef(shadow, family, id) {
    const fam = String(family || '').toUpperCase();
    const user = await loadDefectUser();
    const entry = _defectCatalog && _defectCatalog.families && _defectCatalog.families[fam];
    const isBundled = !!(entry && Array.isArray(entry.notes) && entry.notes.some(n => n && String(n.id) === String(id)));
    const rows = (user.notes || []).filter(x => !(String(x.family || '').toUpperCase() === fam && String(x.id || '') === String(id)));
    if (isBundled) rows.push({ family: fam, id: String(id), removed: true, updatedAt: new Date().toISOString() });
    await saveDefectUser({ ...user, notes: rows });
    setStatus(shadow, `🗑️ حُذفت الملاحظة${isBundled ? ' (تجاوز الرسمي)' : ''}`, 'success');
    logEvent('CODES', `حذف ملاحظة: ${fam} ${id}${isBundled ? ' (تجاوز الرسمي)' : ''}`);
  }

  function bindDefectEditor(shadow) {
    const btn = shadow.getElementById('cp-defect-edit-btn');
    const box = shadow.getElementById('cp-defect-editor');
    const famSel = shadow.getElementById('cp-defect-family');
    const list = shadow.getElementById('cp-defect-list');
    const majorIn = shadow.getElementById('cp-defect-major');
    const subIn = shadow.getElementById('cp-defect-sub');
    const fullIn = shadow.getElementById('cp-defect-full');
    const descIn = shadow.getElementById('cp-defect-desc');
    const saveBtn = shadow.getElementById('cp-defect-save');
    const cancelBtn = shadow.getElementById('cp-defect-cancel-edit');
    if (!btn || !box || !famSel || !list || !majorIn || !subIn || !fullIn || !descIn || !saveBtn || !cancelBtn) return;
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    // عزل أحداث المحرر عن البوابة: الصفحة المضيفة عندها مستمعات عامة على
    // keydown/click، فمنع التمرير يمنعها من التدخّل أثناء الكتابة/التعديل.
    ['keydown', 'keypress', 'keyup', 'input', 'click', 'mousedown', 'mouseup'].forEach(type => {
      box.addEventListener(type, ev => { try { ev.stopPropagation(); } catch (_) {} });
    });

    const setVal = (id, v) => { const el = shadow.getElementById(id); if (el) el.value = v; };
    const render = () => {
      try { renderDefectEditor(shadow); } catch (e) { logEvent('CODES', 'renderDefectEditor: ' + (e.message || e)); }
    };

    // ── تفريغ النماذج الثلاثة ──────────────────────────────────────────
    const clearCodeForm = () => {
      _defectEditingKey = '';
      majorIn.value = ''; subIn.value = ''; fullIn.value = ''; descIn.value = '';
      saveBtn.textContent = '➕ إضافة';
      cancelBtn.style.display = 'none';
    };

    const clearShortcutForm = () => {
      _scEditingId = '';
      setVal('cp-sc-name', '');
      setVal('cp-sc-icon', '⚡');
      setVal('cp-sc-amount', '0');
      setVal('cp-sc-note-text', '');
      setVal('cp-sc-codefrom', '');
      shadow.querySelectorAll('#cp-sc-codes .sc-code-cb, #cp-sc-notes .sc-note-cb').forEach(cb => { cb.checked = false; });
      const save = shadow.getElementById('cp-sc-save');
      if (save) save.textContent = '➕ إضافة زر';
      const cancel = shadow.getElementById('cp-sc-cancel');
      if (cancel) cancel.style.display = 'none';
    };

    const clearNoteForm = () => {
      _ntEditingId = '';
      setVal('cp-nt-text', '');
      const save = shadow.getElementById('cp-nt-save');
      if (save) save.textContent = '➕ إضافة ملاحظة';
      const cancel = shadow.getElementById('cp-nt-cancel');
      if (cancel) cancel.style.display = 'none';
    };

    // ── فتح/غلق المحرر ─────────────────────────────────────────────────
    btn.onclick = () => {
      if (box.style.display === 'block') { box.style.display = 'none'; return; }
      // افتح فورًا ثم حدّث بعد التحميل
      try { famSel.value = defectFamilyOf(readDeviceHint()) || 'AC'; } catch (_) { famSel.value = 'AC'; }
      try { clearCodeForm(); clearShortcutForm(); clearNoteForm(); clearFavForm(shadow); } catch (_) {}
      try { renderDefectEditor(shadow); } catch (e) { logEvent('CODES', 'renderDefectEditor: ' + (e.message || e)); }
      box.style.display = 'block';
      logEvent('CODES', 'فتح محرر الخدمات (أكواد/شورت كت/ملاحظات)');
      Promise.all([loadDefectCatalog(), loadDefectUser()])
        .then(() => { render(); })
        .catch(e => logEvent('CODES', 'تحميل كتالوج الأعطال: ' + (e.message || e)));
    };

    // ── تبويبات المحرر (أكواد / شورت كت / ملاحظات) ──────────────────────
    const tabsBox = shadow.getElementById('cp-edef-tabs');
    if (tabsBox && tabsBox.dataset.bound !== '1') {
      tabsBox.dataset.bound = '1';
      tabsBox.addEventListener('click', (e) => {
        const b = e.target.closest('.cp-edef-tab');
        if (!b || !b.dataset.etab) return;
        setEditorTab(shadow, b.dataset.etab);
        render();
      });
    }

    famSel.onchange = () => {
      clearCodeForm(); clearShortcutForm(); clearNoteForm();
      render();
    };
    cancelBtn.onclick = () => clearCodeForm();

    // ── قائمة الأكواد: تعديل / حذف ──────────────────────────────────────
    list.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      const row = b && b.closest('.cp-defect-row');
      if (!row) return;
      const family = famSel.value;
      const major = row.dataset.major;
      const sub = row.dataset.sub || '';

      if (b.dataset.act === 'del') {
        const key = defectKey(family, major, sub);
        const armed = _defectDeleteArmed && _defectDeleteArmed.key === key
          && (Date.now() - _defectDeleteArmed.at < 4000);
        if (!armed) {
          _defectDeleteArmed = { key, at: Date.now() };
          b.textContent = '⚠️';
          setStatus(shadow, `⚠️ اضغط 🗑️ مرة أخرى لحذف ${major}${sub ? '/' + sub : ''}`, 'warn');
          setTimeout(() => { try { b.textContent = '🗑️'; } catch (_) {} }, 4000);
          return;
        }
        _defectDeleteArmed = null;
        await deleteDefectCode(shadow, family, major, sub);
        return;
      }

      majorIn.value = major;
      subIn.value = sub;
      fullIn.value = '';
      descIn.value = row.dataset.desc || '';
      const current = mergedDefectCodes(family)
        .find(c => c.major === major && String(c.sub || '') === sub);
      if (current && current.full) fullIn.value = current.full;
      _defectEditingKey = defectKey(family, major, sub);
      saveBtn.textContent = '💾 حفظ التعديل';
      cancelBtn.style.display = 'block';
      setStatus(shadow, `✏️ تعديل ${major}${sub ? '/' + sub : ''} — غيّر ثم احفظ`, 'warn');
    };

    saveBtn.onclick = async () => {
      const family = famSel.value;
      const major = majorIn.value.trim().toUpperCase();
      const sub = subIn.value.trim().toUpperCase();
      const full = fullIn.value.trim().toUpperCase();
      const desc = descIn.value.trim();
      if (!/^[A-Z]{2,3}\d{3}$/.test(major)) {
        setStatus(shadow, '⚠️ الكود الرئيسي بصيغة AC001 (حرفان/ثلاثة + ٣ أرقام)', 'warn');
        return;
      }
      if (!sub) { setStatus(shadow, '⚠️ أدخل الكود الفرعي (مثل 0005 أو 308A)', 'warn'); return; }

      const user = await loadDefectUser();
      const newKey = defectKey(family, major, sub);
      const codes = (user.codes || []).filter(c => {
        const k = defectKey(c.family, c.major, c.sub);
        if (_defectEditingKey && k === _defectEditingKey) return false;
        return k !== newKey;
      });
      codes.push({
        family, major, sub, full: full || '',
        desc, removed: false, updatedAt: new Date().toISOString()
      });
      await saveDefectUser({ ...user, codes });
      clearCodeForm();
      setStatus(shadow, `✅ حُفظ ${major}/${sub}`, 'success');
      logEvent('CODES', `حفظ كود عطل: ${family} ${major}/${sub} — ${desc || 'بلا وصف'}`);
    };

    // ── قائمة الشورت كت: تعديل / حذف ────────────────────────────────────
    const scList = shadow.getElementById('cp-sc-list');
    if (scList) scList.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      const row = b && b.closest('.cp-edef-row');
      if (!row) return;
      const fam = editorFamily(shadow);
      const id = row.dataset.id || '';

      if (b.dataset.act === 'del') {
        const key = 'sc|' + fam + '|' + id;
        const armed = _scDeleteArmed && _scDeleteArmed.key === key
          && (Date.now() - _scDeleteArmed.at < 4000);
        if (!armed) {
          _scDeleteArmed = { key, at: Date.now() };
          b.textContent = '⚠️';
          setStatus(shadow, `⚠️ اضغط 🗑️ مرة أخرى لحذف الزر «${id}»`, 'warn');
          setTimeout(() => { try { b.textContent = '🗑️'; } catch (_) {} }, 4000);
          return;
        }
        _scDeleteArmed = null;
        await deleteShortcutDef(shadow, fam, id);
        return;
      }

      const defs = fam === '*' ? mergedSharedShortcuts() : mergedShortcutsFor(fam);
      const def = defs.find(s => s.id === id);
      if (!def) return;
      _scEditingId = id;
      setVal('cp-sc-name', def.name || '');
      setVal('cp-sc-icon', def.icon || '⚡');
      setVal('cp-sc-amount', String(Number(def.amount) || 0));
      setVal('cp-sc-note-text', def.noteText || '');
      setVal('cp-sc-codefrom', def.codeFrom || '');
      shadow.querySelectorAll('#cp-sc-codes .sc-code-cb').forEach(cb => {
        cb.checked = (def.codes || []).some(w => shortcutCodeMatches(cb.value, w));
      });
      shadow.querySelectorAll('#cp-sc-notes .sc-note-cb').forEach(cb => {
        cb.checked = (def.noteIds || []).includes(cb.dataset.noteId || '');
      });
      const save = shadow.getElementById('cp-sc-save');
      if (save) save.textContent = '💾 حفظ الزر';
      const cancel = shadow.getElementById('cp-sc-cancel');
      if (cancel) cancel.style.display = 'block';
      setStatus(shadow, `✏️ تعديل الزر «${def.name || id}» — غيّر ثم احفظ`, 'warn');
    };

    const scSaveBtn = shadow.getElementById('cp-sc-save');
    if (scSaveBtn) scSaveBtn.onclick = async () => {
      const fam = editorFamily(shadow);
      const shared = fam === '*';
      const name = (shadow.getElementById('cp-sc-name').value || '').trim();
      if (!name) { setStatus(shadow, '⚠️ اكتب اسم الزر', 'warn'); return; }
      const icon = (shadow.getElementById('cp-sc-icon').value || '⚡').trim() || '⚡';
      const amountNum = Number(shadow.getElementById('cp-sc-amount').value || 0);
      const codeFrom = shared ? 'noFaultCode' : (shadow.getElementById('cp-sc-codefrom').value || '');
      const codes = shared ? [] : Array.from(shadow.querySelectorAll('#cp-sc-codes .sc-code-cb:checked'))
        .map(cb => String(cb.value || '').toUpperCase()).filter(Boolean);
      const noteIds = shared ? [] : Array.from(shadow.querySelectorAll('#cp-sc-notes .sc-note-cb:checked'))
        .map(cb => cb.dataset.noteId || '').filter(Boolean);
      const noteText = (shadow.getElementById('cp-sc-note-text').value || '').trim();
      if (!shared && codeFrom !== 'noFaultCode' && !codes.length && !noteText) {
        setStatus(shadow, '⚠️ الزر يحتاج كودًا واحدًا على الأقل (أو كود «لا يوجد عطل» أو تعليقًا)', 'warn');
        return;
      }
      if (noteText.length > 2000) { setStatus(shadow, '⚠️ التعليق أطول من 2000 حرف', 'warn'); return; }

      const editing = !!_scEditingId;
      const user = await loadDefectUser();
      const id = _scEditingId || ('u' + Date.now().toString(36));
      const entry = {
        family: shared ? '*' : fam,
        scope: shared ? 'shared' : 'family',
        id, name, icon,
        codes: Array.from(new Set(codes)),
        noteIds,
        noteText,
        codeFrom,
        amount: Number.isFinite(amountNum) ? amountNum : 0,
        removed: false,
        updatedAt: new Date().toISOString()
      };
      const rows = (user.shortcuts || []).filter(x =>
        !(String(x.family || '').toUpperCase() === entry.family && String(x.id || '') === id));
      rows.push(entry);
      await saveDefectUser({ ...user, shortcuts: rows });
      clearShortcutForm();
      setStatus(shadow, `✅ ${editing ? 'حُدِّث' : 'أُضيف'} الزر «${name}» (${shared ? 'مشترك' : fam})`, 'success');
      logEvent('CODES', `${editing ? 'تعديل' : 'إضافة'} زر شورت كت: ${entry.family} ${id} — ${name}`);
    };

    const scCancelBtn = shadow.getElementById('cp-sc-cancel');
    if (scCancelBtn) scCancelBtn.onclick = () => clearShortcutForm();

    // ── قائمة الملاحظات: تعديل / حذف ────────────────────────────────────
    const ntList = shadow.getElementById('cp-nt-list');
    if (ntList) ntList.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      const row = b && b.closest('.cp-edef-row');
      if (!row) return;
      const fam = editorFamily(shadow);
      const id = row.dataset.id || '';

      if (b.dataset.act === 'del') {
        const key = 'nt|' + fam + '|' + id;
        const armed = _ntDeleteArmed && _ntDeleteArmed.key === key
          && (Date.now() - _ntDeleteArmed.at < 4000);
        if (!armed) {
          _ntDeleteArmed = { key, at: Date.now() };
          b.textContent = '⚠️';
          setStatus(shadow, '⚠️ اضغط 🗑️ مرة أخرى لحذف الملاحظة', 'warn');
          setTimeout(() => { try { b.textContent = '🗑️'; } catch (_) {} }, 4000);
          return;
        }
        _ntDeleteArmed = null;
        await deleteNoteDef(shadow, fam, id);
        return;
      }

      const note = mergedNotesFor(fam).find(n => n.id === id);
      if (!note) return;
      _ntEditingId = id;
      setVal('cp-nt-text', note.text || '');
      const save = shadow.getElementById('cp-nt-save');
      if (save) save.textContent = '💾 حفظ الملاحظة';
      const cancel = shadow.getElementById('cp-nt-cancel');
      if (cancel) cancel.style.display = 'block';
      setStatus(shadow, '✏️ تعديل ملاحظة — غيّر ثم احفظ', 'warn');
    };

    const ntSaveBtn = shadow.getElementById('cp-nt-save');
    if (ntSaveBtn) ntSaveBtn.onclick = async () => {
      const fam = editorFamily(shadow);
      if (fam === '*') { setStatus(shadow, '⚠️ الملاحظات لكل عائلة — اختر عائلة محددة', 'warn'); return; }
      const text = (shadow.getElementById('cp-nt-text').value || '').trim();
      if (!text) { setStatus(shadow, '⚠️ اكتب نص الملاحظة', 'warn'); return; }
      if (text.length > 2000) { setStatus(shadow, '⚠️ الملاحظة أطول من 2000 حرف', 'warn'); return; }
      const editing = !!_ntEditingId;
      const user = await loadDefectUser();
      const id = _ntEditingId || ('un' + Date.now().toString(36));
      const rows = (user.notes || []).filter(x =>
        !(String(x.family || '').toUpperCase() === fam && String(x.id || '') === id));
      rows.push({ family: fam, id, text, removed: false, updatedAt: new Date().toISOString() });
      await saveDefectUser({ ...user, notes: rows });
      clearNoteForm();
      setStatus(shadow, `✅ ${editing ? 'حُدِّثت' : 'أُضيفت'} ملاحظة (${fam})`, 'success');
      logEvent('CODES', `${editing ? 'تعديل' : 'إضافة'} ملاحظة: ${fam} ${id}`);
    };

    const ntCancelBtn = shadow.getElementById('cp-nt-cancel');
    if (ntCancelBtn) ntCancelBtn.onclick = () => clearNoteForm();

    // ── تصدير الكتالوج الكامل (كتالوج + تعديلات) ─────────────────────────
    const exportBtn = shadow.getElementById('cp-defect-export');
    if (exportBtn) exportBtn.onclick = async () => {
      await loadDefectUser();
      await loadFavStore();
      const fams = ['AC', 'GS', 'GR', 'WM', 'HT', 'DW'];
      const shortOut = (s) => ({
        id: s.id, name: s.name, icon: s.icon,
        codes: s.codes || [], noteIds: s.noteIds || [],
        noteText: s.noteText || '',
        ...(s.codeFrom ? { codeFrom: s.codeFrom } : {}),
        amount: Number(s.amount) || 0
      });
      const out = { version: 2, updatedAt: new Date().toISOString(), families: {}, sharedShortcuts: [] };
      fams.forEach(f => {
        const entry = (_defectCatalog && _defectCatalog.families && _defectCatalog.families[f]) || {};
        out.families[f] = {
          label: entry.label || f,
          noFaultCode: String(entry.noFaultCode || '').toUpperCase(),
          codes: mergedDefectCodes(f).map(c => ({ major: c.major, sub: c.sub || '', full: c.full || '', desc: c.desc || '' })),
          notes: mergedNotesFor(f).map(n => ({ id: n.id, text: n.text })),
          shortcuts: mergedShortcutsFor(f).map(shortOut)
        };
      });
      out.sharedShortcuts = mergedSharedShortcuts().map(shortOut);
      out.favorites = (_favStore && Array.isArray(_favStore.items)) ? _favStore.items : [];
      const json = JSON.stringify(out, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        setStatus(shadow, '📤 نُسخ JSON الكامل — ألصقه في defect-catalog.json للنشر الدائم', 'success');
      } catch (_) {
        console.log('[PortalHelper] defect-catalog.json\n' + json);
        setStatus(shadow, '📋 تعذّر النسخ — الـ JSON مطبوع في Console', 'warn');
      }
      logEvent('CODES', 'تصدير الكتالوج الموحّد (أكواد + ملاحظات + شورت كت)');
    };

    const resetBtn = shadow.getElementById('cp-defect-reset');
    if (resetBtn) resetBtn.onclick = async () => {
      if (!_defectResetArmed || (Date.now() - _defectResetArmed > 4000)) {
        _defectResetArmed = Date.now();
        setStatus(shadow, '⚠️ اضغط «استعادة» مرة أخرى لإلغاء كل تعديلاتك (أكواد + ملاحظات + شورت كت)', 'warn');
        return;
      }
      _defectResetArmed = 0;
      await saveDefectUser({ version: 2, codes: [], notes: [], shortcuts: [] });
      clearCodeForm(); clearShortcutForm(); clearNoteForm();
      setStatus(shadow, '↩️ استُعيد الكتالوج الرسمي كما هو', 'success');
      logEvent('CODES', 'استعادة كتالوج الأعطال الرسمي');
    };
  }

  function renderDefectCodes(shadow, codes, device, family) {
    const list = shadow.getElementById('cp-codes-list');
    if (!list) return;
    if (!codes.length) {
      list.innerHTML = `<div class="cp-empty">لا توجد أكواد أعطال مسجّلة لـ <b>${escapeHtml(device || 'هذا الجهاز')}</b> بعد</div>`;
      logEvent('CODES', `لا توجد أكواد أعطال في الكتالوج للعائلة "${family || '؟'}"`);
      return;
    }
    list.innerHTML = codes.map(c => {
      const major = escapeHtml(c.major);
      const sub = escapeHtml(c.sub || '');
      const full = escapeHtml(c.full || c.sub || c.major);
      const desc = escapeHtml(c.desc || '');
      return `<label class="cp-check"><input type="checkbox" class="fault-cb" value="${major},${sub},${full}"> `
        + `<span>${major} — ${desc} <span class="cp-badge">${sub}</span></span></label>`;
    }).join('');
    logEvent('CODES', `تم إنشاء ${list.querySelectorAll('.fault-cb').length} checkboxes من كتالوج الأعطال (${family})`);
  }

  // ⚡ رسم أزرار الشورت كت حسب عائلة الجهاز (من defect-catalog.json)
  function renderShortcuts(shadow) {
    const box = shadow.getElementById('cp-shortcut-buttons');
    if (!box) return;
    const family = defectFamilyOf(readDeviceHint());
    const { list } = visibleShortcuts(family);
    if (!list.length) {
      box.innerHTML = '<div class="cp-empty">لا توجد أزرار شورت كت لهذه العائلة بعد — أضفها من المحرر</div>';
      return;
    }
    box.innerHTML = list.map(s => {
      const label = escapeHtml(s.name || s.id);
      const icon = escapeHtml(s.icon || '⚡');
      const shared = s._scope === 'shared';
      const tip = `${label}${shared ? ' — مشترك لكل العائلات' : ` — ${escapeHtml(family || '')}`}`;
      return `<button type="button" class="cp-shortcut-btn${shared ? ' shared' : ''}" data-sc="${escapeHtml(s.id)}" title="${tip}">`
        + `<span class="sc-icon">${icon}</span>${label}`
        + `${shared ? ' <span class="cp-badge">مشترك</span>' : ''}</button>`;
    }).join('');
    logEvent('SHORTCUT', `أزرار الشورت كت: ${list.length} (عائلة ${family || '؟'})`);
  }

  let _updatingCodes = false;   // حارس إعادة الدخول (يمنع أي حلقة رسم لا نهائية)
  function updateDeviceCodes(shadow) {
    if (_updatingCodes) return;
    const span = shadow.getElementById('cp-device-type');
    const list = shadow.getElementById('cp-codes-list');
    if (!span || !list) { logEvent('CODES', 'span أو list غير موجود'); return; }
    _updatingCodes = true;
    try {
      const device = readDeviceHint();
      span.textContent = device || 'غير معروف';
      const isInstall = resolveIsInstall();
      logEvent('CODES', `device="${device}" isInstall=${isInstall}`);
      const family = defectFamilyOf(device);
      logEvent('CODES', `device="${device}" defectFamily=${family || '؟'}`);

      if (!_defectCatalog || !_defectUser) {
        list.innerHTML = '<div class="cp-empty">⏳ جاري تحميل كتالوج الأعطال…</div>';
        Promise.all([loadDefectCatalog(), loadDefectUser()]).then(() => {
          setTimeout(() => { try { updateDeviceCodes(shadow); } catch (e) { logEvent('CODES', 'retry: ' + (e.message || e)); } }, 0);
        });
      } else {
        renderDefectCodes(shadow, defectCodesFor(device, family), device, family);
      }
      refreshCopiedCodesPreview(shadow);
      updateDeviceNotes(shadow);
      renderShortcuts(shadow);
    } finally {
      _updatingCodes = false;
    }
  }

  const NOTES_LIST = [
    "تم عمل صيانه وتنظيف الوحده الداخليه والوحده الخارجيه وغسيل بمكنه الغسيل وتنظيف حوض الصرف | خدمة بريميوم كير Premium Care وتحصيل 450",
    "تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف",
    "تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف",
    "يحتاج كباس وفلتر وريلاي واوفرلود",
    "تم تغيير كباس وفلتر وتم تنظيف الدائرة وعمل فاكيوم وشحن فريون وريلاي واوفرلود وتنظيف الصرف وضبط الجوانات",
    "تم سحب الجهاز و تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون و تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف وتم إعادة وتشغيل الجهاز بالكامل بعد الاصلاح بمركز الخدمه"
  ];

  // ترتيب الملاحظات بعد السحب — لكل عائلة داخل الجلسة
  const _noteOrder = Object.create(null);

  function updateDeviceNotes(shadow) {
    const list = shadow.getElementById('cp-notes-list');
    if (!list) return;
    const family = defectFamilyOf(readDeviceHint());
    list.dataset.family = family || '';
    const known = !!(_defectCatalog && _defectCatalog.families && _defectCatalog.families[family]);
    const { notes } = familyServices(family);

    // الكتالوج محمّل وعائلة معروفة ⇒ ملاحظاتها فقط.
    // غير ذلك (كتالوج لم يُحمّل بعد) ⇒ القائمة الافتراضية كي لا تختفي الخانة.
    let items = (known || notes.length)
      ? notes.map(n => ({ id: n.id, text: n.text }))
      : NOTES_LIST.map((text, i) => ({ id: 'default-' + i, text }));

    const ord = _noteOrder[family];
    if (ord && ord.length) {
      const pos = (id) => { const i = ord.indexOf(id); return i < 0 ? 1e9 : i; };
      items = items.slice().sort((a, b) => pos(a.id) - pos(b.id));
    }

    if (!items.length) {
      list.innerHTML = `<div class="cp-empty">لا توجد ملاحظات لهذه العائلة بعد — أضفها من المحرر</div>`;
      return;
    }

    list.innerHTML = items.map((n, i) =>
      `<label class="cp-note-item" draggable="true" data-idx="${i}" data-note-id="${escapeHtml(n.id)}">`
      + `<input type="checkbox" class="note-cb" data-idx="${i}" data-note-id="${escapeHtml(n.id)}" data-note-text="${escapeHtml(n.text)}" /> `
      + `<span class="ni-handle">⠿</span> <span class="ni-text">${escapeHtml(n.text)}</span></label>`
    ).join('');
    setupNoteDrag(shadow);
  }

  function setupNoteDrag(shadow) {
    const list = shadow.getElementById('cp-notes-list');
    if (!list) return;
    if (list.dataset.bound === '1') return; // ربط مرة واحدة فقط (كان يُكرر في كل إعادة رسم)
    list.dataset.bound = '1';
    let dragSrc = null;
    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.cp-note-item');
      if (!item) return;
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.idx);
    });
    list.addEventListener('dragend', () => {
      list.querySelectorAll('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
      dragSrc = null;
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const item = e.target.closest('.cp-note-item');
      if (!item || item === dragSrc) return;
      list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('.cp-note-item');
      if (!target || !dragSrc) return;
      const items = Array.from(list.querySelectorAll('.cp-note-item'));
      const srcIdx = items.indexOf(dragSrc);
      const tgtIdx = items.indexOf(target);
      if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return;
      const checked = new Set();
      shadow.querySelectorAll('.note-cb:checked').forEach(cb => { checked.add(cb.dataset.noteId || ''); });
      const order = items.map(el => el.dataset.noteId);
      const [moved] = order.splice(srcIdx, 1);
      order.splice(tgtIdx, 0, moved);
      _noteOrder[list.dataset.family || ''] = order;
      updateDeviceNotes(shadow);
      shadow.querySelectorAll('.note-cb').forEach(cb => {
        cb.checked = checked.has(cb.dataset.noteId || '');
      });
    });
  }

  // ════════════════════════════════════════════
  // PAGE 1
  // ════════════════════════════════════════════
  async function executePage1(shadow) {
    logEvent('EXEC_PAGE1', 'بدء التنفيذ');
    setStatus(shadow, '⏳ جاري التنفيذ...');
    try {
      assertNotCancelled();
      let dupOk = true;
      if (shadow.getElementById('chk-duplicate').checked) dupOk = await doDuplicate(shadow);
      if (dupOk === false) {
        // لا نضغط Next عندما يكون الموديل 2 غير مربوط — البوابة سترفض النموذج حتماً.
        logEvent('EXEC_PAGE1', 'إيقاف التنفيذ: الموديل 2 غير مربوط (GUID فارغ)');
        await sleep(300);
        return;
      }
      if (shadow.getElementById('chk-next1').checked) await doNext(shadow);
      setStatus(shadow, '✅ تم التنفيذ بنجاح', 'success');
      logEvent('EXEC_PAGE1', 'اكتمل التنفيذ');
      await sleep(800);
      if (!isMinimized) {
        logEvent('EXEC_PAGE1', 'تصغير التبويب تلقائياً');
        toggle(shadow, false, true);
      }
    } catch (e) {
      logEvent('EXEC_PAGE1', `خطأ: ${e.message || e}`);
      setStatus(shadow, '❌ خطأ: ' + (e.message || '') , 'error');
    }
  }

  function isEmptyValue(val) {
    if (val == null) return true;
    if (typeof val === 'string') return val.trim() === '';
    return false;
  }

  // حقول الـ lookup في PowerApps: العنصر المرئي <field>_name، والعنصر المخفي <field> يحمل الـ GUID.
  function findLookupGuidField(inputEl) {
    if (!inputEl) return null;
    const doc = inputEl.ownerDocument || document;
    const id = (inputEl.id || '').trim();
    const baseId = id.replace(/_name$/i, '');
    if (!baseId) return null;

    const direct = doc.getElementById(baseId);
    if (direct && direct.type === 'hidden') return direct;

    const needle = baseId.toLowerCase();
    return Array.from(doc.querySelectorAll('input[type="hidden"]'))
      .find(h => ((h.id || '') + ' ' + (h.name || '')).toLowerCase().includes(needle)) || null;
  }

  async function clearLookupField(inputEl) {
    if (!inputEl) return;
    const group = inputEl.closest('.input-group') || inputEl.parentElement;
    const clearBtn = group?.querySelector(
      'button.clearlookupfield, button[aria-label*="Clear lookup"], button[title*="Clear lookup"], button[aria-label*="مسح"]'
    );
    if (clearBtn) {
      await safeClick(clearBtn);
      await sleep(400);
    }
    if ((inputEl.value || '').trim()) {
      inputEl.value = '';
      try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      await sleep(200);
    }
  }

  // تعبئة حقل lookup عبر فتح نافذة البحث والاختيار الفعلي — لا حقن نصي.
  // ترجع { ok, selected, reason } وتتحقق من الـ GUID المخفي بعد الاختيار.
  async function fillLookupField(inputEl, val, btnSel, opts = {}) {
    if (!inputEl || !val) return { ok: false, reason: 'invalid-args' };
    const doc = inputEl.ownerDocument || document;
    const guidEl = findLookupGuidField(inputEl);
    const curText = (inputEl.value || inputEl.getAttribute('value') || '').trim();
    const curGuid = guidEl ? String(guidEl.value || '').trim() : '';

    // 1) مربوط فعلاً بالبوابة (GUID موجود) — لا داعي لإعادة الفتح
    if (curGuid && curText) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: مربوط بالفعل — تخطي`);
      return { ok: true, already: true, selected: curText };
    }

    // 2) نص بلا GUID (حقن نصي سابق) — لازم تفريغه وإلا سيُتخطّى البحث كأن القيمة مطابقة
    if (curText && !curGuid) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: نص بلا GUID — تفريغ الحقل قبل البحث`);
      await clearLookupField(inputEl);
    }

    const fallbackButtons = Array.isArray(btnSel) ? btnSel : (btnSel ? [btnSel] : []);
    const lookupBtn = (typeof window.findSafeLookupButton === 'function')
      ? window.findSafeLookupButton(inputEl, fallbackButtons)
      : null;
    if (!lookupBtn) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: زر فتح البحث غير موجود — فشل`);
      return { ok: false, reason: 'lookup-btn-not-found' };
    }

    const lookupModalFn = window.fillLookupModal || window.AutoFillEngine?.Lookups?.fillLookupModal;
    if (typeof lookupModalFn !== 'function') {
      logEvent('LOOKUP_FILL', `${inputEl.id}: محرك البحث fillLookupModal غير متاح — فشل`);
      return { ok: false, reason: 'lookup-engine-missing' };
    }

    let res = null;
    try {
      res = await lookupModalFn(lookupBtn, val, doc, { fallbackButtons, ...opts });
    } catch (e) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: استثناء أثناء البحث — ${e?.message || e}`);
      return { ok: false, reason: 'lookup-exception' };
    }
    if (!res || res.ok === false) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: فشل البحث — ${res?.reason || 'unknown'}`);
      return { ok: false, reason: res?.reason || 'lookup-failed' };
    }

    await sleep(700);
    const newText = (inputEl.value || '').trim();
    const newGuid = guidEl ? String(guidEl.value || '').trim() : '';
    if (guidEl && !newGuid) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: لم يُثبَّت الاختيار (GUID فارغ) — فشل`);
      return { ok: false, reason: 'lookup-not-committed' };
    }
    if (!newText) {
      logEvent('LOOKUP_FILL', `${inputEl.id}: الحقل بقي فارغاً بعد الاختيار — فشل`);
      return { ok: false, reason: 'lookup-empty-after-select' };
    }
    logEvent('LOOKUP_FILL', `${inputEl.id}: نجح — "${newText}"`);
    return { ok: true, selected: newText };
  }

  async function fillInputField(inputEl, val) {
    if (!inputEl || val == null) return false;
    try {
      if (typeof emulateUserInput === 'function') {
        await emulateUserInput(inputEl, val);
      } else {
        inputEl.value = val;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function fillSelectField(selectEl, targetValOrText) {
    if (!selectEl || selectEl.tagName !== 'SELECT' || !targetValOrText) return false;
    try {
      const target = String(targetValOrText).trim().toLowerCase();
      const opts = Array.from(selectEl.options || []);
      const match = opts.find(o => o.value === target || o.text.trim().toLowerCase() === target) ||
                    opts.find(o => o.text.trim().toLowerCase().includes(target)) ||
                    opts.find(o => target.includes(o.text.trim().toLowerCase()) && o.text.trim() !== '');
      if (match) {
        selectEl.value = match.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (_) {}
    return false;
  }

  let _svProfilesCache = null;
  async function loadSvProfiles() {
    if (_svProfilesCache) return _svProfilesCache;
    try {
      const resp = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
      if (resp.ok) {
        _svProfilesCache = await resp.json();
        return _svProfilesCache;
      }
    } catch (e) {
      logEvent('DEFAULT_P1', `خطأ تحميل secondVisitProfiles.json: ${e.message || e}`);
    }
    return null;
  }

  let _modelNotesCache = null;
  async function loadModelNotes() {
    if (_modelNotesCache) return _modelNotesCache;
    try {
      const resp = await fetch(chrome.runtime.getURL('model-notes.json'));
      if (resp.ok) {
        _modelNotesCache = await resp.json();
        return _modelNotesCache;
      }
    } catch (e) {
      logEvent('MODEL_NOTE', `fetch failed: ${e.message || e}`);
    }
    return null;
  }

  // ── ملاحظات الموديل: رسمية (model-notes.json) + شخصية (chrome.storage.local) ──
  // ملفات الإضافة للقراءة فقط وقت التشغيل؛ لذلك الملاحظات الشخصية تُحفظ في
  // chrome.storage.local تحت model_notes_user، ويمكن تصديرها JSON لإضافتها للملف.
  const LS_MODEL_NOTES_USER = 'model_notes_user';
  let _userModelNotes = null;

  function currentModelCode() {
    const mEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'Model']);
    return String(mEl?.value || mEl?.getAttribute?.('value') || '').trim().split(' _ ')[0].trim();
  }

  async function loadUserModelNotes(force) {
    if (_userModelNotes && !force) return _userModelNotes;
    try {
      const got = await chrome.storage.local.get({ [LS_MODEL_NOTES_USER]: [] });
      const arr = got && got[LS_MODEL_NOTES_USER];
      _userModelNotes = Array.isArray(arr) ? arr : [];
    } catch (e) {
      _userModelNotes = [];
      logEvent('MODEL_NOTE', 'تعذّر قراءة الملاحظات الشخصية: ' + (e.message || e));
    }
    return _userModelNotes;
  }

  async function saveUserModelNotes(arr) {
    _userModelNotes = Array.isArray(arr) ? arr : [];
    try { await chrome.storage.local.set({ [LS_MODEL_NOTES_USER]: _userModelNotes }); }
    catch (e) { logEvent('MODEL_NOTE', 'تعذّر حفظ الملاحظات الشخصية: ' + (e.message || e)); }
    try { renderModelNote(PANEL_SHADOW, true); } catch (_) {}
  }

  // مطابقة: exact (افتراضي) | prefix | regex — ويمكن ربط الملاحظة بعائلة منتج كاملة عبر family.
  function matchesModelNote(entry, model, device) {
    if (!entry) return false;
    if (entry.family && device) {
      const fam = (window.ProblemCodes && typeof window.ProblemCodes.familyOf === 'function')
        ? window.ProblemCodes.familyOf(device) : '';
      if (fam && String(entry.family).toUpperCase() === fam) return true;
    }
    const pattern = String(entry.model || '').trim();
    if (!pattern) return false;
    const mode = String(entry.match || 'exact').toLowerCase();
    if (mode === 'prefix') return model.startsWith(pattern);
    if (mode === 'regex') { try { return new RegExp(pattern, 'i').test(model); } catch (_) { return false; } }
    return model === pattern;
  }

  let _lastModelNoteValue = '';
  async function renderModelNote(shadow, force) {
    const el = shadow.getElementById('cp-model-note');
    if (!el) return;
    const model = currentModelCode();
    if (!model) {
      el.style.display = 'none';
      el.innerHTML = '';
      _lastModelNoteValue = '';
      return;
    }
    if (!force && model === _lastModelNoteValue) return;
    const bundled = (await loadModelNotes()) || [];
    const user = await loadUserModelNotes();
    const device = readDeviceHint();
    const hits = [
      ...user.filter(e => matchesModelNote(e, model, device)).map(e => ({ ...e, _user: true })),
      ...bundled.filter(e => matchesModelNote(e, model, device)).map(e => ({ ...e, _user: false }))
    ];
    _lastModelNoteValue = model;
    if (!hits.length) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const firstType = String(hits[0].type || 'warning').toLowerCase();
    el.className = 'cp-model-note note-' + (['info', 'warning', 'danger'].includes(firstType) ? firstType : 'warning');
    el.innerHTML = hits.map(h => {
      const badge = h._user ? '<span class="cp-note-badge">مخصصة</span>' : '';
      return badge + escapeHtml(h.message || '');
    }).join('<br>');
    el.style.display = 'block';
  }

  function bindModelNoteEditor(shadow) {
    const btn = shadow.getElementById('btn-note-edit');
    const box = shadow.getElementById('cp-note-editor');
    const ta = shadow.getElementById('cp-note-text');
    const typeSel = shadow.getElementById('cp-note-type');
    if (!btn || !box || !ta || !typeSel) return;
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.onclick = async () => {
      if (box.style.display === 'block') { box.style.display = 'none'; return; }
      const model = currentModelCode();
      if (!model) { setStatus(shadow, '⚠️ لا يوجد موديل في صفحة البلاغ', 'warn'); return; }
      const user = await loadUserModelNotes();
      const existing = user.find(e => String(e.model || '').trim() === model);
      ta.value = existing ? (existing.message || '') : '';
      typeSel.value = existing ? (existing.type || 'warning') : 'warning';
      box.style.display = 'block';
      ta.focus();
      logEvent('MODEL_NOTE', 'فتح محرر ملاحظة الموديل: ' + model);
    };

    shadow.getElementById('btn-note-save').onclick = async () => {
      const model = currentModelCode();
      const message = ta.value.trim();
      if (!model) { setStatus(shadow, '⚠️ لا يوجد موديل', 'warn'); return; }
      if (!message) { setStatus(shadow, '⚠️ اكتب الملاحظة أولًا', 'warn'); return; }
      const user = (await loadUserModelNotes()).filter(e => String(e.model || '').trim() !== model);
      user.unshift({
        model, message,
        type: typeSel.value || 'warning',
        match: 'exact',
        updatedAt: new Date().toISOString()
      });
      await saveUserModelNotes(user);
      box.style.display = 'none';
      setStatus(shadow, '✅ حُفظت ملاحظة الموديل', 'success');
      logEvent('MODEL_NOTE', `حفظ ملاحظة (${typeSel.value}) للموديل ${model}`);
    };

    shadow.getElementById('btn-note-delete').onclick = async () => {
      const model = currentModelCode();
      if (!model) return;
      const before = await loadUserModelNotes();
      const after = before.filter(e => String(e.model || '').trim() !== model);
      if (after.length === before.length) {
        setStatus(shadow, 'لا توجد ملاحظة شخصية لهذا الموديل', 'warn');
        return;
      }
      await saveUserModelNotes(after);
      ta.value = '';
      box.style.display = 'none';
      setStatus(shadow, '🗑️ حُذفت ملاحظة الموديل', 'success');
      logEvent('MODEL_NOTE', 'حذف ملاحظة الموديل: ' + model);
    };

    shadow.getElementById('btn-note-export').onclick = async () => {
      const all = await loadUserModelNotes();
      if (!all.length) { setStatus(shadow, 'لا توجد ملاحظات شخصية للتصدير', 'warn'); return; }
      const clean = all.map(({ updatedAt, ...rest }) => rest);
      const json = JSON.stringify(clean, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        setStatus(shadow, '📤 نُسخ JSON — ألصقه في model-notes.json', 'success');
      } catch (_) {
        ta.value = json;
        box.style.display = 'block';
        ta.select();
        setStatus(shadow, '📋 انسخ النص من المحرر', 'warn');
      }
      logEvent('MODEL_NOTE', `تصدير ${clean.length} ملاحظة`);
    };
  }

  async function doDuplicate(shadow) {
    logEvent('EXEC_PAGE1', 'بدء فحص تكرار بيانات الجهاز (AC)');

    // AC / Dual-unit Guard: verify device is AC using reliable existing detector
    const isAC = getDeviceAC();
    if (!isAC) {
      logEvent('EXEC_PAGE1', 'تخطي التكرار: الجهاز ليس تكييف');
      setStatus(shadow, '⚠️ التكرار متاح للتكييف فقط', 'warn');
      return true;
    }

    const modelEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    const model2El = findFirst(CFG.modelInput2) || findFieldByLabel(['الموديل الفعلي 2', 'Model 2']);
    const serialEl = findFirst(CFG.serial) || findFieldByLabel(['الرقم المسلسل 1', 'الرقم المسلسل', 'Serial'], 'input');
    const serial2El = findFirst(CFG.serial2) || findFieldByLabel(['الرقم المسلسل 2', 'Serial 2'], 'input');

    const model1Val = (modelEl?.value || modelEl?.getAttribute?.('value') || '').trim();
    const model2Val = (model2El?.value || model2El?.getAttribute?.('value') || '').trim();
    const serial1Val = (serialEl?.value || serialEl?.getAttribute?.('value') || '').trim();
    const serial2Val = (serial2El?.value || serial2El?.getAttribute?.('value') || '').trim();

    let modelDuplicated = false;
    let serialDuplicated = false;
    let preservedModel = false;
    let preservedSerial = false;
    let modelFailure = '';

    // «مربوط» = يوجد GUID مخفي، وليس مجرد نص في الحقل.
    // نص بلا GUID يعني حقناً نصياً سابقاً فاشلاً → يجب إعادة الربط لا الحفاظ عليه.
    const model2GuidEl = findLookupGuidField(model2El);
    const model2Guid = model2GuidEl ? String(model2GuidEl.value || '').trim() : '';
    const model2Bound = model2Guid ? true : (!model2GuidEl && !isEmptyValue(model2Val));

    // Rule: Model 1 -> Model 2
    if (!isEmptyValue(model1Val)) {
      if (!model2Bound) {
        if (model2El) {
          logEvent('EXEC_PAGE1', `نسخ الموديل 1 إلى الموديل 2: "${model1Val}"`);
          // ⚠️ نسخ lookup = فتح نافذة البحث واختيار صف فعلي (لا حقن نصي) —
          // الحقن النصي يترك حقل الـ GUID المخفي فارغاً فترفض البوابة النموذج.
          const res = await fillLookupField(model2El, model1Val, CFG.modelBtn2 || CFG.modelBtn, { isModel: true });
          if (res?.ok) {
            modelDuplicated = true;
            logEvent('EXEC_PAGE1', `✅ تم ربط الموديل 2 بالبوابة: "${res.selected || model1Val}"`);
          } else {
            modelFailure = res?.reason || 'unknown';
            logEvent('EXEC_PAGE1', `❌ فشل ربط الموديل 2 — ${modelFailure}`);
          }
        } else {
          modelFailure = 'field-not-found';
          logEvent('EXEC_PAGE1', '❌ حقل الموديل الفعلي 2 غير موجود في الصفحة');
        }
      } else {
        logEvent('EXEC_PAGE1', `الموديل 2 يحتوي بالفعل على قيمة: "${model2Val}" — الحفاظ عليها وعدم التعديل`);
        preservedModel = true;
      }
    } else {
      logEvent('EXEC_PAGE1', 'الموديل 1 فارغ — عدم اختراع قيمة وعدم تعديل الموديل 2');
    }

    // Rule: Serial 1 -> Serial 2
    if (!isEmptyValue(serial1Val)) {
      if (isEmptyValue(serial2Val)) {
        if (serial2El) {
          logEvent('EXEC_PAGE1', `نسخ السيريال 1 إلى السيريال 2: "${serial1Val}"`);
          await fillInputField(serial2El, serial1Val);
          serialDuplicated = true;
        }
      } else {
        logEvent('EXEC_PAGE1', `السيريال 2 يحتوي بالفعل على قيمة: "${serial2Val}" — الحفاظ عليها وعدم التعديل`);
        preservedSerial = true;
      }
    } else {
      logEvent('EXEC_PAGE1', 'السيريال 1 فارغ — عدم اختراع قيمة وعدم تعديل السيريال 2');
    }

    if (modelFailure) {
      setStatus(shadow, `❌ الموديل 2 لم يُربط بالبوابة (${modelFailure}) — البوابة سترفض النموذج. افتح البحث واختر الموديل يدويًا`, 'error');
      return false;
    }

    if (modelDuplicated || serialDuplicated) {
      setStatus(shadow, '✅ تم تكرار بيانات التكييف للحقول الفارغة فقط', 'success');
    } else if (preservedModel || preservedSerial) {
      setStatus(shadow, 'ℹ️ الحقول ممتلئة بالفعل (تم الحفاظ عليها)', 'success');
    } else {
      setStatus(shadow, '⚠️ لا توجد بيانات في الموديل 1 أو السيريال 1 للنسخ', 'warn');
    }
    return true;
  }

  async function fillDefaultDeviceData(shadow) {
    logEvent('DEFAULT_P1', 'بدء طلب تعبئة البيانات الافتراضية');
    setStatus(shadow, '⏳ جاري تحميل البيانات الافتراضية...');

    const svData = await loadSvProfiles();
    if (!svData || !svData.profiles) {
      setStatus(shadow, '❌ تعذر تحميل secondVisitProfiles.json', 'error');
      return;
    }

    const deviceHint = (readDeviceHint() || (typeof readDeviceTypeFromPage === 'function' ? readDeviceTypeFromPage() : '') || '').trim();
    logEvent('DEFAULT_P1', `deviceHint="${deviceHint}"`);

    let matchedProfile = null;
    if (deviceHint) {
      matchedProfile = svData.profiles.find(p => p.pattern && new RegExp(p.pattern, 'i').test(deviceHint));
    }
    if (!matchedProfile && getDeviceAC()) {
      matchedProfile = svData.profiles.find(p => p.name === 'تكييف');
    }
    if (!matchedProfile && svData.profiles.length > 0) {
      matchedProfile = svData.profiles[0];
    }

    if (!matchedProfile) {
      setStatus(shadow, '⚠️ لم يتم العثور على بروفايل مطابق', 'warn');
      return;
    }

    const p1 = matchedProfile.page1Defaults || {};
    let filledCount = 0;
    let preservedCount = 0;
    let failedCount = 0;

    // 1. العلامة التجارية (Brand) - fill only if empty
    const brandEl = findFirst(CFG.brandInput) || findFieldByLabel(['العلامة التجاريه', 'العلامة التجارية', 'Brand']);
    if (brandEl) {
      const curVal = (brandEl.value || brandEl.getAttribute?.('value') || '').trim();
      if (isEmptyValue(curVal) && p1.brand) {
        const res = await fillLookupField(brandEl, p1.brand, CFG.brandBtn, { isBrand: true });
        if (res?.ok) filledCount++;
        else { failedCount++; logEvent('DEFAULT_P1', `فشل ربط العلامة التجارية — ${res?.reason || 'unknown'}`); }
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 2. الموديل الفعلي الأول (Model 1) - fill only if empty
    const model1El = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    if (model1El) {
      const curVal = (model1El.value || model1El.getAttribute?.('value') || '').trim();
      if (isEmptyValue(curVal) && p1.model1) {
        const res = await fillLookupField(model1El, p1.model1, CFG.modelBtn, { isModel: true });
        if (res?.ok) filledCount++;
        else { failedCount++; logEvent('DEFAULT_P1', `فشل ربط الموديل 1 — ${res?.reason || 'unknown'}`); }
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 3. الموديل الفعلي الثاني (Model 2) - fill only if empty
    const model2El = findFirst(CFG.modelInput2) || findFieldByLabel(['الموديل الفعلي 2', 'Model 2']);
    if (model2El && (p1.model2 || matchedProfile.hasDualUnits)) {
      const curVal = (model2El.value || model2El.getAttribute?.('value') || '').trim();
      const targetModel2 = p1.model2 || p1.model1;
      if (isEmptyValue(curVal) && targetModel2) {
        const res = await fillLookupField(model2El, targetModel2, CFG.modelBtn2 || CFG.modelBtn, { isModel: true });
        if (res?.ok) filledCount++;
        else { failedCount++; logEvent('DEFAULT_P1', `فشل ربط الموديل 2 — ${res?.reason || 'unknown'}`); }
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 4. الرقم المسلسل الأول (Serial 1) - fill only if empty
    const serial1El = findFirst(CFG.serial) || findFieldByLabel(['الرقم المسلسل 1', 'الرقم المسلسل', 'Serial'], 'input');
    if (serial1El) {
      const curVal = (serial1El.value || serial1El.getAttribute?.('value') || '').trim();
      if (isEmptyValue(curVal) && p1.serial != null) {
        const ok = await fillInputField(serial1El, p1.serial);
        if (ok) filledCount++;
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 5. الرقم المسلسل الثاني (Serial 2) - fill only if empty
    const serial2El = findFirst(CFG.serial2) || findFieldByLabel(['الرقم المسلسل 2', 'Serial 2'], 'input');
    if (serial2El && (p1.serial2 != null || matchedProfile.hasDualUnits)) {
      const curVal = (serial2El.value || serial2El.getAttribute?.('value') || '').trim();
      const targetSerial2 = p1.serial2 != null ? p1.serial2 : p1.serial;
      if (isEmptyValue(curVal) && targetSerial2 != null) {
        const ok = await fillInputField(serial2El, targetSerial2);
        if (ok) filledCount++;
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 6. حالة الضمان (Warranty Status) - fill only if empty or default unselected
    const statusEl = findFirst(CFG.statusSelect) || findFieldByLabel(['حالة الضمان', 'Warranty Status'], 'select');
    if (statusEl && statusEl.tagName === 'SELECT') {
      const curVal = (statusEl.value || '').trim();
      if (isEmptyValue(curVal) || curVal === '0') {
        const targetStatus = svData.defaultStatus || 'Out warranty';
        const ok = fillSelectField(statusEl, targetStatus);
        if (ok) filledCount++;
      } else {
        preservedCount++;
      }
    }

    logEvent('DEFAULT_P1', `اكتمل: تم تعبئة ${filledCount} حقل، والحفاظ على ${preservedCount} حقل، وفشل ${failedCount}`);
    if (failedCount > 0) {
      setStatus(shadow, `⚠️ تم تعبئة ${filledCount} حقل، لكن فشل ربط ${failedCount} حقل lookup — راجع اللوج (السبب غالبًا عدم تطابق البحث)`, 'warn');
    } else if (filledCount > 0) {
      setStatus(shadow, `✅ تم تعبئة ${filledCount} حقل افتراضي (${matchedProfile.name})`, 'success');
    } else if (preservedCount > 0) {
      setStatus(shadow, `ℹ️ جميع الحقول ممتلئة بالفعل (تم الحفاظ عليها)`, 'success');
    } else {
      setStatus(shadow, '⚠️ لم يتم العثور على حقول لتعبئتها', 'warn');
    }
  }

  async function doNext(shadow) {
    logEvent('NAV', 'الانتقال للصفحة التالية');
    // بحث في main + iframes
    let btn = null;
    const allDocs = getShallowDocs();
    for (const doc of allDocs) {
      // بحث بالسيلكتورز أولاً
      if (CFG.nextBtn) {
        for (const sel of (Array.isArray(CFG.nextBtn) ? CFG.nextBtn : [CFG.nextBtn])) {
          try { btn = doc.querySelector(sel); if (btn) break; } catch(_) {}
        }
      }
      if (btn) break;
      // بحث بالنص
      btn = Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"]'))
        .find(b => /next|التالي/i.test((b.textContent + (b.value || '') + (b.getAttribute('aria-label') || '')).trim()) && b.offsetParent !== null && !/cancel|إلغاء/i.test(b.className));
      if (btn) break;
    }
    if (btn) {
      logEvent('NAV', `تم العثور على زر التالي: ${btn.textContent?.trim() || btn.getAttribute('aria-label') || 'btn'}`);
      btn.click();
      await sleep(1500);
    } else {
      logEvent('NAV', 'لم يتم العثور على زر التالي في أي مستند');
      setStatus(shadow, '⚠️ زر التالي غير موجود', 'warn');
    }
  }

  // ════════════════════════════════════════════
  // PAGE 2
  // ════════════════════════════════════════════

  // ── قائمة اختيار المشكلة ────────────────────────────────────────────────
  // البوابة تفلتر قائمة المشاكل بنوع المنتج، فكثيرًا لا يحتوي الفلتر على الكود
  // الذي يطلبه المحرّك/الـ AI. بدل تخمين كود غير موجود، نعرض للمستخدم ما تعرضه
  // البوابة فعلًا (تُرجَع من handleSubgridIframeModal في available) ليختار بنفسه.
  const PROBLEM_OPTIONS_KEY = 'cp-problem-options';
  const PROBLEM_OPTIONS_TTL_MS = 30 * 60 * 1000;

  // رقم البلاغ: مفتاح القائمة — لا تُسترجع قائمة بلاغ آخر أبدًا.
  function incidentKey() {
    try {
      const id = String(new URLSearchParams(location.search).get('id') || '').trim();
      if (/^[a-f0-9-]{36}$/i.test(id)) return id.toLowerCase();
    } catch (_) {}
    try {
      const el = document.querySelector('input[name*="incidentid"], #EntityFormView_EntityID, input[id*="EntityID"]');
      const v = el && el.value ? String(el.value).trim() : '';
      if (/^[a-f0-9-]{36}$/i.test(v)) return v.toLowerCase();
    } catch (_) {}
    return '';
  }

  function loadProblemOptions() {
    try {
      localStorage.removeItem(PROBLEM_OPTIONS_KEY); // تنظيف المفتاح القديم غير المرتبط ببلاغ
    } catch (_) {}
    try {
      const id = incidentKey();
      if (!id) return []; // بلاغ مجهول ⇒ لا استرجاع إطلاقًا
      const obj = safeParseJSON(localStorage.getItem(PROBLEM_OPTIONS_KEY + ':' + id), null);
      if (!obj || !Array.isArray(obj.list)) return [];
      if (obj.ts && (Date.now() - obj.ts) > PROBLEM_OPTIONS_TTL_MS) return [];
      return obj.list.filter(Boolean);
    } catch (_) { return []; }
  }

  function saveProblemOptions(options) {
    try {
      const id = incidentKey();
      if (!id) return;
      localStorage.setItem(
        PROBLEM_OPTIONS_KEY + ':' + id,
        JSON.stringify({ ts: Date.now(), incident: id, list: options || [] })
      );
    } catch (_) {}
  }

  function extractProblemCode(label) {
    const s = String(label || '').trim();
    const head = s.split(/\s+[-–]\s+/)[0] || s;
    return head.trim() || s;
  }

  // حالة صندوق الاختيار بين عمليات الرسم (نوع الخدمة اليدوي + القائمة الخام)
  const _pickerState = { raw: [], device: '', service: '', fromCatalog: false };

  // opts: { device, service, persist, fromCatalog }
  //  - persist=true فقط للقوائم الحيّة (طلب اختيار/تنفيذ) — لا عند استرجاع قائمة محفوظة.
  function renderProblemOptions(shadow, options, opts) {
    const box = shadow.getElementById('cp-problem-picker');
    const sel = shadow.getElementById('cp-problem-select');
    if (!box || !sel) return;
    const o = opts || {};
    const PC = window.ProblemCodes;

    if (Array.isArray(options)) _pickerState.raw = options.filter(Boolean);
    if (o.device) _pickerState.device = o.device;
    if (o.service !== undefined) _pickerState.service = o.service || '';
    if (o.fromCatalog !== undefined) _pickerState.fromCatalog = !!o.fromCatalog;

    const device = _pickerState.device || readDeviceHint();
    let service = _pickerState.service || readServiceType();
    if (service === 'unknown') service = '';

    // ممنوع + عائلة + نوع خدمة (fail-open لأي صف لا يُفهم)
    let list = _pickerState.raw.slice();
    let stats = {};
    if (PC && typeof PC.filterCompatible === 'function') {
      const res = PC.filterCompatible(list, { device, service });
      list = res.list;
      stats = res.stats || {};
    } else if (PC && typeof PC.filterAllowed === 'function') {
      list = PC.filterAllowed(list);
    }

    if (o.persist === true) saveProblemOptions(list);

    const ctx = shadow.getElementById('cp-problem-context');
    const svcBox = shadow.getElementById('cp-problem-service');
    const cd = shadow.getElementById('cp-problem-countdown');

    if (!list.length) {
      box.style.display = 'none';
      if (cd) cd.textContent = '';
      if (ctx) ctx.textContent = '';
      if (svcBox) svcBox.style.display = 'none';
      return;
    }

    if (ctx) {
      const fam = (PC && typeof PC.familyOf === 'function') ? (PC.familyOf(device) || '') : '';
      const svcLabel = service === 'install' ? 'تركيب' : (service === 'maintenance' ? 'صيانة' : 'غير معروف');
      const parts = [];
      if (device) parts.push(`الجهاز: ${device}${fam ? ' (' + fam + ')' : ''}`);
      parts.push(`الخدمة: ${svcLabel}`);
      if (_pickerState.fromCatalog) parts.push('المصدر: كتالوج العائلة');
      const excluded = [];
      if (stats.family) excluded.push(`عائلة ${stats.family}`);
      if (stats.service) excluded.push(`خدمة ${stats.service}`);
      if (stats.forbidden) excluded.push(`ممنوع ${stats.forbidden}`);
      if (excluded.length) parts.push(`استُبعد: ${excluded.join(' · ')}`);
      ctx.textContent = `${parts.join(' · ')} — ${list.length} خيار`;
    }
    if (svcBox) svcBox.style.display = service ? 'none' : 'flex';

    sel.innerHTML = list
      .map(o2 => `<option value="${String(o2).replace(/"/g, '&quot;')}">${String(o2).replace(/</g, '&lt;')}</option>`)
      .join('');
    box.style.display = 'block';
  }

  // أزرار نوع الخدمة عند الجهالة — تُعيد تصفية نفس القائمة فورًا (بلا مودال جديد).
  function bindProblemServiceChoice(shadow) {
    const svcBox = shadow.getElementById('cp-problem-service');
    if (!svcBox || svcBox.dataset.bound === '1') return;
    svcBox.dataset.bound = '1';
    svcBox.querySelectorAll('[data-svc]').forEach(btn => {
      btn.onclick = () => {
        const svc = btn.dataset.svc;
        logEvent('PROB_PICK', `نوع الخدمة يدويًا: ${svc === 'install' ? 'تركيب' : 'صيانة'}`);
        _pickerState.service = svc;
        renderProblemOptions(shadow, _pickerState.raw, { service: svc });
      };
    });
  }

  async function addSelectedProblem(shadow) {
    const sel = shadow.getElementById('cp-problem-select');
    const label = sel ? sel.value : '';
    if (!label) { setStatus(shadow, '⚠️ اختر مشكلة من القائمة أولًا', 'warn'); return; }
    const PC = window.ProblemCodes;
    const code = (PC && typeof PC.codeOf === 'function') ? PC.codeOf(label) : extractProblemCode(label);
    logEvent('PROB_PICK', `إضافة مشكلة مختارة: ${label}`);

    // حارس أخير قبل الإرسال: لا نضيف كودًا من عائلة أخرى للجهاز الحالي أبدًا.
    const device = _pickerState.device || readDeviceHint();
    const service = _pickerState.service || readServiceType();
    const deviceFam = (PC && typeof PC.familyOf === 'function') ? (PC.familyOf(device) || '') : '';
    const codeFam = (PC && typeof PC.familyOfCode === 'function') ? (PC.familyOfCode(code) || '') : '';
    if (deviceFam && codeFam && codeFam !== '*' && codeFam !== deviceFam) {
      logEvent('PROB_PICK', `⛔ مرفوض: ${code} عائلة ${codeFam} ≠ ${deviceFam} (${device})`);
      setStatus(shadow, `⛔ ${code} من عائلة أخرى (${codeFam}) — الجهاز ${deviceFam}`, 'warn');
      return;
    }

    // مسار واحد موحّد: لو المحرّك ينتظر اختيارًا، سلّمه الاختيار (هو الذي يضيف).
    if (PC && typeof PC.resolveUserPick === 'function' && typeof PC.hasPendingPick === 'function' && PC.hasPendingPick()) {
      PC.resolveUserPick(label);
      setStatus(shadow, `⏳ تم إرسال اختيارك: ${code}...`);
      return;
    }

    setStatus(shadow, `⏳ جاري إضافة المشكلة: ${code}...`);
    if (typeof handleSubgridIframeModal !== 'function') {
      setStatus(shadow, '❌ محرّك الاختيار غير متاح', 'error');
      return;
    }
    try {
      const res = await handleSubgridIframeModal(
        /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i,
        code,
        false,
        /ترصيد|تجار|ارضي|أرضي|بلاغ|GI00|GS08|GR05|SR00|SR01|WM04/i,
        null
      );
      if (PC && typeof PC.recordOutcome === 'function') {
        PC.recordOutcome(code, device, !!(res && res.ok), { service, family: deviceFam });
      }
      if (res && res.ok) {
        logEvent('PROB_PICK', `✅ أُضيفت: ${res.name || label}`);
        setStatus(shadow, `✅ أُضيفت المشكلة: ${res.name || label}`, 'success');
      } else {
        const reason = (res && res.reason) || 'سبب غير معروف';
        logEvent('PROB_PICK', `⚠️ فشل الإضافة: ${reason}`);
        setStatus(shadow, `⚠️ فشل إضافة "${code}" (${reason})`, 'warn');
      }
    } catch (e) {
      logEvent('PROB_PICK', 'خطأ: ' + (e.message || e));
      setStatus(shadow, '❌ خطأ: ' + (e.message || ''), 'error');
    }
  }

  // ════════════════════════════════════════════
  // PAGE 2 — الانتقال الاختياري + قياس التوقيت
  // ════════════════════════════════════════════
  const LS_AUTO_NEXT2 = 'cp_auto_next2';
  const LS_TIMINGS = 'cp_timings';

  // «التالي» في الصفحة ٢: غير مفعّل افتراضيًا، ويُحفظ اختيار المستخدم.
  function bindAutoNext2(shadow) {
    const cb = shadow.getElementById('chk-next2');
    if (!cb) return;
    try { cb.checked = localStorage.getItem(LS_AUTO_NEXT2) === '1'; } catch (_) {}
    if (cb.dataset.bound === '1') return;
    cb.dataset.bound = '1';
    cb.addEventListener('change', () => {
      try { localStorage.setItem(LS_AUTO_NEXT2, cb.checked ? '1' : '0'); } catch (_) {}
      logEvent('EXEC_PAGE2', 'الانتقال للصفحة التالية: ' + (cb.checked ? 'مفعّل' : 'معطّل (يدوي)'));
    });
  }

  function autoNext2Enabled(shadow) {
    const cb = shadow.getElementById('chk-next2');
    return !!(cb && cb.checked);
  }

  // آخر 20 قياسًا لمقارنة زمن «مشكلة → جاهزية الفني» بين البلاغات.
  function recordPage2Timing(t) {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_TIMINGS) || '[]');
      if (!Array.isArray(arr)) throw new Error('bad-store');
      arr.push(t);
      while (arr.length > 20) arr.shift();
      localStorage.setItem(LS_TIMINGS, JSON.stringify(arr));
    } catch (_) {}
  }

  async function executePage2(shadow, shortcutType) {
    logEvent('EXEC_PAGE2', `بدء التنفيذ${shortcutType ? ' [شورت كت: ' + shortcutType + ']' : ''}`);
    setStatus(shadow, '⏳ جاري التنفيذ...');
    const timing = { at: Date.now(), problemMs: 0, waitMs: 0, techMs: 0, totalMs: 0, shortcut: shortcutType || 'manual' };
    try {
      assertNotCancelled();
      await sleep(1000);

      // 1. حالة قطع الغيار
      const statusVal = shadow.getElementById('cp-spare-status').value;
      if (statusVal) {
        logEvent('EXEC_PAGE2', `حالة قطع الغيار: ${statusVal}`);
        let el = typeof findFieldByLabel === 'function' ? findFieldByLabel(['حالة قطع الغيار', 'Spare Parts'], 'select') : null;
        if (!el) el = document.getElementById('ats_sparepartsstatus');
        if (!el) {
          el = findFirstInFrames('#ats_sparepartsstatus, select[aria-label*="قطع الغيار"], select[aria-label*="Spare"]');
        }
        if (el && el.tagName === 'SELECT') {
          el.value = statusVal;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          setStatus(shadow, `✅ تم تعيين حالة قطع الغيار`, 'success');
        }
      }

      // 2. المشاكل والفنية حسب الشورت كت
      const addProblems = shortcutType === 'prob' || shortcutType === 'all';
      const addTech = shortcutType === 'tech' || shortcutType === 'all';
      const P2 = (window.AutoFillEngine && window.AutoFillEngine.Page2) || {};
      let probOk = false, probLabel = '', probReason = '', probAvailable = [], techOk = false, techLabel = '';

      if (addProblems) {
        const device = readDeviceHint();
        const serviceType = readServiceType();
        const isInstall = serviceType === 'install' || resolveIsInstall();
        const service = isInstall ? 'install' : (serviceType === 'maintenance' ? 'maintenance' : '');
        logEvent('EXEC_PAGE2', `إضافة مشاكل: الجهاز=${device}, النوع=${service === 'install' ? 'تركيب' : (service === 'maintenance' ? 'صيانة' : 'غير معروف')}`);
        const probCode = typeof getSmartProblemCode === 'function'
          ? await getSmartProblemCode(device, isInstall)
          : (typeof getProblemCode === 'function' ? await getProblemCode(device, isInstall) : null);
        logEvent('EXEC_PAGE2', `كود المشكلة: ${probCode || 'غير موجود'}`);
        if (probCode && typeof P2.resolveActualProblem === 'function') {
          setStatus(shadow, `⏳ جاري إضافة المشكلة: ${probCode}...`);
          try {
            const probRes = await P2.resolveActualProblem(probCode, {
              device,
              service,
              priority: isInstall ? /تركيب/i : null
            });
            probOk = !!(probRes && probRes.ok);
            probLabel = (probRes && probRes.name) || probCode;
            probReason = (probRes && probRes.reason) || '';
            probAvailable = (probRes && Array.isArray(probRes.available)) ? probRes.available : [];
            logEvent('EXEC_PAGE2', `نتيجة المشكلة: ok=${probOk} name=${probLabel} reason=${probReason || '—'} source=${probRes && probRes.source}`);
            if (probReason === 'pick-timeout') {
              logEvent('EXEC_PAGE2', '⏳ انتهت مهلة الاختيار — لا اختيار تلقائي؛ القائمة متاحة للإضافة اليدوية');
              setStatus(shadow, '⌛ لم يُختَر كود مشكلة — اختر من القائمة ثم «إضافة المشكلة»', 'warn');
            }
            if (!probOk && probAvailable.length) {
              logEvent('EXEC_PAGE2', 'الأكواد المسموحة في هذه القائمة: ' + probAvailable.join(' | '));
              renderProblemOptions(shadow, probAvailable, {
                device,
                service,
                persist: true,
                fromCatalog: !!(probRes && probRes.fromCatalog)
              });
            }
          } catch (e) {
            logEvent('EXEC_PAGE2', 'فشل إضافة المشكلة: ' + (e.message || e));
          }
        } else {
          logEvent('EXEC_PAGE2', 'لا يوجد كود مشكلة — تم التخطي');
        }
        timing.problemMs = Date.now() - timing.at;

        // توقيت ديناميكي: ابدأ الفنيين فور حفظ المشكلة وظهور زرهم (أقصر زمن ممكن)
        if (addTech && typeof P2.waitForProblemToTechReady === 'function') {
          const waitStart = Date.now();
          const ready = await P2.waitForProblemToTechReady(8000);
          timing.waitMs = Date.now() - waitStart;
          logEvent('TIMING', `مشكلة→جاهزية الفني: ${timing.waitMs}ms (${ready ? 'جاهز' : 'انتهت المهلة'})`);
          if (!ready && probOk) {
            setStatus(shadow, '⚠️ زر «إضافة فنيين» لم يظهر خلال 8 ثوانٍ — أوقفنا الإضافة', 'warn');
            logEvent('EXEC_PAGE2', 'توقف: مودال المشكلة لم يُغلق أو زر الفنيين لم يظهر');
            timing.totalMs = Date.now() - timing.at;
            recordPage2Timing(timing);
            return;
          }
        } else if (typeof P2.waitForModalsToClose === 'function') {
          const waitStart = Date.now();
          await P2.waitForModalsToClose(4000);
          timing.waitMs = Date.now() - waitStart;
        }
      }

      if (addTech) {
        const techStart = Date.now();
        if (typeof selectRandomTechnician === 'function') {
          setStatus(shadow, '⏳ جاري إضافة فني...');
          // المنطقة: نفس مسار المحرّك (DOM ثم واجهة البوابة) لاختيار الفني الصحيح
          let region = '';
          try {
            if (typeof P2.readRegionFromPage === 'function') region = (await P2.readRegionFromPage()) || '';
          } catch (e) { logEvent('EXEC_PAGE2', 'تعذّر قراءة المنطقة: ' + (e.message || e)); }
          logEvent('EXEC_PAGE2', `إضافة فني — المنطقة: ${region || 'غير محددة'}`);
          if (region && typeof P2.registerRegion === 'function') {
            try { await P2.registerRegion(region); } catch (_) {}
          }
          const normTech = (r) => (r && r.ok) ? { ok: true, name: r.name || r.selected || '', source: r.source || '' } : null;
          let techRes = normTech(await selectRandomTechnician(null, region || null));
          if (!techRes) {
            if (typeof P2.waitForModalsToClose === 'function') await P2.waitForModalsToClose(3000);
            else await sleep(3000);
            techRes = normTech(await selectRandomTechnician(null, region || null));
          }
          // احتياطي أخير: افتح مودال الفني واختر أول متاح (wildcard '*')
          // (يفيد أيضًا في تعبئة roster الفنيين تلقائيًا لمحاولات لاحقة).
          if (!techRes && typeof window.handlePage2Modal === 'function') {
            logEvent('EXEC_PAGE2', 'لا يوجد فني مُحلَّل — احتياطي: أول فني متاح من المودال');
            setStatus(shadow, '⏳ جاري فتح مودال الفني...');
            try {
              techRes = normTech(await window.handlePage2Modal(/[اإأ]ضاف[ةه]\s*فن|Add.*Tech/i, '*'));
            } catch (e) { logEvent('EXEC_PAGE2', 'فشل الاحتياطي: ' + (e.message || e)); }
          }
          if (techRes && techRes.name && !/موجود مسبقاً/.test(techRes.name)) {
            techOk = true;
            techLabel = techRes.name;
            try {
              const { technicianRoster = [] } = await chrome.storage.local.get({ technicianRoster: [] });
              const cleanN = techRes.name.replace(/\s+/g, ' ').trim();
              if (cleanN && !technicianRoster.includes(cleanN)) {
                await chrome.storage.local.set({ technicianRoster: [...technicianRoster, cleanN] });
              }
            } catch (_) {}
            if (region && typeof P2.registerRegion === 'function') {
              try { await P2.registerRegion(region, techRes.name); } catch (_) {}
            }
          }
          logEvent('EXEC_PAGE2', `نتيجة الفني: ok=${techOk} name=${techLabel || '—'} source=${techRes ? techRes.source : 'failed'}`);
        }
        timing.techMs = Date.now() - techStart;
      }

      let outcomeOk = true;
      if (addProblems || addTech) {
        const bits = [];
        if (addProblems) {
          if (probOk) bits.push(`✅ مشكلة: ${probLabel}`);
          else if (probAvailable.length) bits.push(`⚠️ المشكلة "${probLabel}" غير متاحة — المتاح: ${probAvailable.slice(0, 5).join(' | ')}`);
          else bits.push(`⚠️ فشلت المشكلة (${probReason || 'سبب غير معروف'})`);
        }
        if (addTech) bits.push(techOk ? `✅ فني: ${techLabel}` : '⚠️ فشل الفني');
        outcomeOk = (!addProblems || probOk) && (!addTech || techOk);
        setStatus(shadow, bits.join(' | '), outcomeOk ? 'success' : 'warn');
      }

      // لا تنتقل للصفحة التالية إذا فشلت المشكلة — اترك المستخدم يختار من القائمة
      if (addProblems && !probOk) {
        logEvent('EXEC_PAGE2', 'تم إيقاف الانتقال: المشكلة لم تُضف بعد');
        return;
      }

      // 3. التالي — اختياري وغير مفعّل افتراضيًا
      if (autoNext2Enabled(shadow)) {
        await doNext(shadow);
      } else {
        logEvent('EXEC_PAGE2', 'الانتقال للصفحة التالية معطّل — اضغط «التالي» بنفسك');
      }

      timing.totalMs = Date.now() - timing.at;
      recordPage2Timing(timing);
      logEvent('TIMING', `إجمالي الصفحة 2: ${timing.totalMs}ms | مشكلة=${timing.problemMs}ms | انتظار=${timing.waitMs}ms | فني=${timing.techMs}ms`);

      if (outcomeOk) setStatus(shadow, `✅ تم التنفيذ بنجاح (${(timing.totalMs / 1000).toFixed(1)} ث)`, 'success');
      logEvent('EXEC_PAGE2', 'اكتمل التنفيذ');
      await sleep(800);
      if (!isMinimized) {
        logEvent('EXEC_PAGE2', 'تصغير التبويب تلقائياً');
        toggle(shadow, false, true);
      }
    } catch (e) {
      logEvent('EXEC_PAGE2', `خطأ: ${e.message || e}`);
      timing.totalMs = Date.now() - timing.at;
      recordPage2Timing(timing);
      setStatus(shadow, '❌ خطأ: ' + (e.message || ''), 'error');
    }
  }

  // ════════════════════════════════════════════
  // PAGE 3 — نسخ ولصق أكواد الأعطال (JSON)
  // ════════════════════════════════════════════
  function readNotesFromPage() {
    const el = findFirstInFrames('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
    return el ? (el.value || el.innerText || '').trim() : '';
  }

  function readCollectedAmountFromPage() {
    const el = findFirstInFrames('#ldv_actualcollectedamount, input[aria-label*="المبلغ المحصل"], input.money.form-control');
    return el ? (el.value || el.innerText || '0').replace(/[^0-9.]/g, '') || '0' : '0';
  }

  // ── مساعدات قراءة الشبكات ──────────────────────────────────────────────────
  // البوابة تلفّ كل شبكة داخل جدول تخطيط خارجي (layout table) يحوي الشبكة الحقيقية
  // كجدول متداخل. القراءة العامة داخله تُرجع صفوف تخطيط/أثاث لا بيانات
  // (تحقق حي 2026-10-26 على W6226000701: ٨٧ صفًا متداخلًا ⇒ ٢٦ «كود» أثاث).
  // القاعدة: نقرأ الجداول الـleaf فقط، ورؤوس/صفوف الجدول نفسه فقط.
  function isLeafTable(tbl) {
    if (!tbl) return false;
    try { return !tbl.querySelector('table'); } catch (_) { return false; }
  }

  function ownHeaderCells(tbl) {
    if (!tbl) return [];
    try {
      return Array.from(tbl.querySelectorAll(':scope > thead > tr > th, :scope > thead > tr > td'));
    } catch (_) { return []; }
  }

  function ownBodyRows(tbl) {
    if (!tbl) return [];
    try { return Array.from(tbl.querySelectorAll(':scope > tbody > tr')); } catch (_) { return []; }
  }

  // صف الرؤوس قد يُرسم داخل tbody (حقيقة حية) — نرفضه حتى لا يُقرأ كبيانات
  function isHeaderRow(tr) {
    if (!tr) return false;
    try { if (tr.querySelector('th')) return true; } catch (_) {}
    try { if (tr.querySelector('td[data-attribute]')) return false; } catch (_) {}
    const t = (tr.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    return /sort\s*(?:ascending|descending)/i.test(t)
      || /كود\s*العطل\s*الرئيسي/.test(t)
      || /وصف\s*كود\s*العطل/.test(t)
      || /قطعة\s*الغيار/.test(t);
  }

  // ── فلاتر نظافة الاستخراج ──────────────────────────────────────────────────
  // نمط كود العطل الحقيقي (تحقق حي): بادئة المنتج (٢–٣ أحرف) + ٣–٤ أرقام مثل
  // RF1102 / VH0101. أي شيء آخر (نصوص أثاث الصفحة، أسعار مثل 1.000) يُرفض.
  const DEFECT_CODE_RE = /^[A-Za-z]{2,3}\s?-?\d{3,4}(?:[-_][A-Za-z0-9]{1,4})?$/;
  const FURNITURE_RE = /^(?:sort\s*(?:ascending|descending)|no\s*records|لا\s*توجد\s*سجلات?|إضافة|تعديل|حذف|عرض|تصفية|add|edit|delete|view|filter)$/i;

  function isValidDefectCode(value) {
    const c = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!c || c.length > 24) return false;
    if (FURNITURE_RE.test(c)) return false;
    return DEFECT_CODE_RE.test(c);
  }

  // صالح لو حمل كودًا حقيقيًا في أي من حقوله الثلاثة (رئيسي/فرعي/كامل)
  function isValidDefectEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return isValidDefectCode(entry.fullCode)
      || isValidDefectCode(entry.defectCode)
      || isValidDefectCode(entry.majorCode);
  }

  // أكواد القطع الحقيقية تبدأ بحروف-شرطات: WM-TH-BRAK-WIRE-G · EG-W6226000701
  function isValidPartCode(value) {
    const c = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!c || c.length > 40) return false;
    if (FURNITURE_RE.test(c)) return false;
    if (/^[\d.,\s]+$/.test(c)) return false;   // سعر/رقم فقط
    if (!/[A-Za-z]/.test(c)) return false;      // بلا حرف لاتيني ⇒ ليس كودًا
    return /^[A-Za-z0-9][A-Za-z0-9 _\-–—./]*$/.test(c);
  }

  // حزمة قديمة مخزَّنة قبل إصلاح الاستخراج قد تحمل «أكواد» أثاث — تُنظَّف عند القراءة
  function sanitizeStoredBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') return bundle;
    if (Array.isArray(bundle.faultCodes)) {
      const before = bundle.faultCodes.length;
      bundle.faultCodes = bundle.faultCodes.filter(isValidDefectEntry);
      if (bundle.faultCodes.length !== before) {
        logEvent('COPY_CODES', `🧹 حزمة مخزَّنة: حُذف ${before - bundle.faultCodes.length} «كود» غير صالح (أثاث/سعر)`);
      }
    }
    if (Array.isArray(bundle.spareParts)) {
      const before = bundle.spareParts.length;
      bundle.spareParts = bundle.spareParts.filter(p => p && (isValidPartCode(p.code) || String(p.name || '').trim()));
      if (bundle.spareParts.length !== before) {
        logEvent('COPY_CODES', `🧹 حزمة مخزَّنة: حُذف ${before - bundle.spareParts.length} صف قطعة غير صالح`);
      }
    }
    return bundle;
  }

  // استخراج أكواد الأعطال من الصفحة المعروضة حاليًا (تُكرَّر لكل صفحة شبكة)
  function extractDefectCodesOnce() {
    const allDocs = getShallowDocs();

    const faultCodes = [];
    const seen = new Set();

    for (const doc of allDocs) {
      // 1. البحث في صفوف Dataverse المهيكلة (ldv_workorder_defect)
      const rows = doc.querySelectorAll('tr[data-entity="ldv_workorder_defect"]');
      rows.forEach(tr => {
        let majorCode = '', majorName = '', majorId = '';
        let defectCode = '', defectId = '';
        let description = '', fullCode = '';

        const majorTd = tr.querySelector('td[data-attribute="ats_defectmajor"]');
        if (majorTd) {
          majorName = (majorTd.innerText || '').trim();
          try {
            const rawVal = majorTd.getAttribute('data-value');
            if (rawVal) {
              const val = JSON.parse(rawVal);
              if (val.Id) majorId = val.Id;
              if (val.Name) majorName = val.Name;
            }
          } catch(_) {}
        }

        const defectTd = tr.querySelector('td[data-attribute="ldv_defect"], td[data-attribute="ldv_defectcode"]');
        if (defectTd) {
          defectCode = (defectTd.innerText || '').trim();
          try {
            const rawVal = defectTd.getAttribute('data-value');
            if (rawVal) {
              const val = JSON.parse(rawVal);
              if (val.Id) defectId = val.Id;
              if (val.Name) defectCode = val.Name;
            }
          } catch(_) {}
        }

        const descTd = tr.querySelector('td[data-attribute="ats_defectdescription"], td[data-attribute*="description"]');
        if (descTd) {
          description = (descTd.innerText || descTd.getAttribute('data-value') || '').trim();
        }

        if (majorName) {
          const parts = majorName.split(/\s*[-–—_]\s*/);
          majorCode = parts[0]?.trim() || majorName;
        }
        if (description) {
          const parts = description.split(/\s*[-–—_]\s*/);
          fullCode = parts[0]?.trim() || '';
        }
        if (!fullCode && defectCode) fullCode = defectCode;

        const key = `${majorCode}|${defectCode}|${fullCode}`;
        if (!seen.has(key) && (majorCode || defectCode || fullCode)) {
          seen.add(key);
          faultCodes.push({
            majorCode: majorCode || '',
            majorName: majorName || '',
            majorId: majorId || '',
            defectCode: defectCode || '',
            defectId: defectId || '',
            fullCode: fullCode || '',
            description: description || ''
          });
        }
      });

      // 2. فحص الجداول العامة حسب ترويسات الأعمدة
      if (faultCodes.length === 0) {
        const tables = doc.querySelectorAll('table');
        tables.forEach(table => {
          // الجدول الخارجي = تخطيط الصفحة (يحوي جداول متداخلة) ⇒ يُتجاهل تمامًا
          if (!isLeafTable(table)) return;
          const ths = ownHeaderCells(table).map(th => (th.innerText || '').trim());
          const majorColIdx = ths.findIndex(t => /كود\s*العطل\s*الرئيسي/i.test(t));
          const defectColIdx = ths.findIndex(t => /^كود\s*العطل/i.test(t));
          const descColIdx = ths.findIndex(t => /وصف\s*كود\s*العطل/i.test(t));

          if (majorColIdx >= 0 || defectColIdx >= 0) {
            ownBodyRows(table).forEach(tr => {
              if (isHeaderRow(tr)) return;
              const tds = tr.querySelectorAll('td');
              if (tds.length === 0) return;
              const mText = majorColIdx >= 0 && tds[majorColIdx] ? tds[majorColIdx].innerText.trim() : '';
              const dText = defectColIdx >= 0 && tds[defectColIdx] ? tds[defectColIdx].innerText.trim() : '';
              const descText = descColIdx >= 0 && tds[descColIdx] ? tds[descColIdx].innerText.trim() : '';
              if (mText || dText) {
                const mCode = mText.split(/\s*[-–—_]\s*/)[0]?.trim() || mText;
                const fCode = descText ? (descText.split(/\s*[-–—_]\s*/)[0]?.trim() || dText) : dText;
                const entry = {
                  majorCode: mCode,
                  majorName: mText,
                  defectCode: dText,
                  fullCode: fCode,
                  description: descText
                };
                // لا نقبل صفًا لا يحمل كود عطل حقيقيًا (أثاث الصفحة/الأسعار)
                if (!isValidDefectEntry(entry)) return;
                const key = `${mCode}|${dText}|${fCode}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  faultCodes.push(entry);
                }
              }
            });
          }
        });
      }
    }

    // 🪙 وسم كلمات التكلفة مرة واحدة عند الاستخراج (تُقرأ لاحقًا بلا إعادة حساب)
    return faultCodes.map(markCostCode);
  }

  // الحزمة الكاملة: يقرأ كل صفحات شبكة الأعطال وكل صفحات شبكة القطع
  async function extractFaultCodesFromPage(shadow) {
    const faultCodes = [];
    const seen = new Set();
    const rejected = [];
    const pushAll = (list) => (list || []).forEach(c => {
      // فلتر نظافة: أي مدخل بلا كود عطل حقيقي (أثاث الصفحة/سعر/نص) يُرفض ويُسجَّل
      if (!isValidDefectEntry(c)) {
        const label = String((c && (c.fullCode || c.defectCode || c.majorCode)) || '').trim();
        if (label) rejected.push(label);
        return;
      }
      const key = `${c.majorCode || ''}|${c.defectCode || ''}|${c.fullCode || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      faultCodes.push(c);
    });

    let defectPages = 1;
    let defectTotalPages = 1;
    let gridAborted = false;
    const defectRoot = findFirstGridRoot(DEFECT_GRID_ROW_SELECTORS);
    if (defectRoot) {
      const res = await forEachGridPage(defectRoot.root, 'table tbody tr', () => extractDefectCodesOnce());
      res.pages.forEach(pushAll);
      defectPages = res.pages.length;
      defectTotalPages = res.totalPages;
      gridAborted = res.aborted === true;
      if (gridAborted) logEvent('COPY_CODES', '⛔ توقف ترقيم شبكة الأعطال (خطأ بوابة) — اعتُمد ما قُرئ');
    } else {
      pushAll(extractDefectCodesOnce());
    }

    // 3. كود احتياطي: لو لم تكن هناك صفوف بالجدول، قراءة الأكواد المحددة بالـ checkboxes في اللوحة
    if (faultCodes.length === 0 && shadow) {
      const checked = shadow.querySelectorAll('.fault-cb:checked');
      checked.forEach(cb => {
        const parts = cb.value.split(',');
        const m = parts[0] || '';
        const s = parts[1] || '';
        const full = parts[2] || '';
        const label = cb.closest('label')?.innerText?.trim() || '';
        pushAll([{
          majorCode: m,
          majorName: label || m,
          defectCode: s,
          fullCode: full || s || m,
          description: label
        }]);
      });
    }

    const partsRes = await readPartsFromGridAllPages();
    const amtVal = shadow ? (shadow.getElementById('cp-amount')?.value?.trim() || readCollectedAmountFromPage()) : readCollectedAmountFromPage();
    const notesVal = readNotesFromPage();
    const isLscEl = findFirstInFrames('#ldv_islsc');
    const isLscVal = isLscEl ? String(isLscEl.value || '').trim() : '';

    if (rejected.length) {
      logEvent('COPY_CODES', `🧹 رُفض ${rejected.length} مدخلًا ليس كود عطل: ${rejected.slice(0, 8).join(' · ')}${rejected.length > 8 ? ' …' : ''}`);
    }

    return {
      type: 'ELARABY_CODES_BUNDLE',
      version: 2,
      copiedAt: new Date().toISOString(),
      sourceUrl: location.pathname + location.search,
      // سياق البلاغ المصدر (للعلم وللعرض — لا يُطبّق تلقائيًا على البلاغ الجديد)
      sparePartsStatus: readSparePartsStatusFromPage() || '',
      isLsc: isLscVal,
      faultCodes: faultCodes.map(markCostCode),
      spareParts: partsRes?.parts || [],
      amount: amtVal || '0',
      notes: notesVal || '',
      // المنتج الذي تُجمَّع تحته الحزمة (من الصفحة/الموديل — لا تخمين)
      product: readProductContext(),
      // عدد الصفحات المقروءة فعليًا — يظهر في السجل ليُثبت أن القراءة شملت «٢» وما بعدها
      gridPages: {
        defects: defectPages,
        defectsTotal: defectTotalPages,
        parts: partsRes?.pages || 1,
        partsTotal: partsRes?.totalPages || 1
      },
      // بوابة الخطأ: هل توقف الترقيم قبل نهاية الشبكة؟ (اقرأ ما تيسّر، لا تُكمل بعمى)
      aborted: (gridAborted === true) || (partsRes?.aborted === true)
    };
  }

  function refreshCopiedCodesPreview(shadow) {
    const preview = shadow.getElementById('cp-codes-preview');
    if (!preview) return;
    try {
      const raw = localStorage.getItem('elaraby_copied_codes_bundle');
      if (!raw) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
      }
      const bundle = sanitizeStoredBundle(safeParseJSON(raw, null));
      if (bundle && ((Array.isArray(bundle.faultCodes) && bundle.faultCodes.length > 0) || (Array.isArray(bundle.spareParts) && bundle.spareParts.length > 0))) {
        const partsCount = bundle.spareParts?.length || 0;
        const codesCount = bundle.faultCodes?.length || 0;
        const codesSummary = (bundle.faultCodes || []).map(c => escapeHtml(c.fullCode || c.defectCode || c.majorCode)).join('، ');
        const partsText = partsCount > 0 ? ` + <b>${partsCount} قطعة غيار</b>` : '';
        const copiedAt = bundle.copiedAt || bundle.createdAt;
        const ageMin = copiedAt ? Math.max(0, Math.round((Date.now() - new Date(copiedAt).getTime()) / 60000)) : null;
        const ageText = ageMin == null ? '' : (ageMin < 1 ? ' • نُسخت الآن' : ` • عمرها ${ageMin} دقيقة`);
        preview.innerHTML = `<span>📋 <b>${codesCount} كود منسوخ</b>${partsText} جاهز للصق${ageText}: ${codesSummary}</span>`;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    } catch(_) {
      preview.style.display = 'none';
    }
  }

  // ── سياق المنتج (الصفحة/الموديل) ──────────────────────────────────────
  // الحزمة تُجمَّع افتراضيًا تحت منتج واحد يُقرأ من الصفحة، لا يُخمَّن.
  function readProductContext() {
    const readLookup = (sel) => {
      const el = findFirstInFrames(sel);
      if (!el) return { name: '', id: '' };
      let name = String(el.value || el.innerText || '').trim();
      let id = '';
      try {
        const v = JSON.parse(el.getAttribute('data-value') || '{}');
        if (v && v.Name) name = String(v.Name).trim();
        if (v && v.Id) id = String(v.Id);
      } catch (_) {}
      return { name, id };
    };
    const model = readLookup('#ats_modelid_name, #ats_modelid');
    const actual = readLookup('#ats_actualmodel_name, #ats_actualmodel');
    let device = '';
    try { device = String(readDeviceHint() || '').trim(); } catch (_) { device = ''; }
    const modelName = model.name || actual.name || '';
    let family = '';
    try { family = defectFamilyOf(modelName || device || '') || ''; } catch (_) { family = ''; }
    return {
      model: modelName || device || '',
      modelId: model.id || '',
      actualModel: actual.name || '',
      device: device || '',
      family: String(family || '').toUpperCase()
    };
  }

  function copyBoardCodeKey(c) {
    return String((c && c.majorCode) || '').trim() + '|' + String((c && c.defectCode) || '').trim();
  }

  // ── لوحة النسخ: سحب كود العطل على القطعة قبل ⭐ وقبل اللصق ──────────────
  // الهدف: ⭐ يُحفظ بالزوج الصحيح (رئيسي|فرعي) من شاشة النسخ نفسها،
  // والحزمة تحمل الاقتران (majorCode/subCode) فيصل إلى اللصق بلا تخمين.
  function renderCopyBoard(shadow, bundleIn) {
    const sh = shadow || (typeof PANEL_SHADOW !== 'undefined' ? PANEL_SHADOW : null);
    if (!sh) return;
    const box = sh.getElementById('cp-copy-board');
    if (!box) return;

    let bundle = bundleIn;
    if (!bundle) {
      try { bundle = sanitizeStoredBundle(safeParseJSON(localStorage.getItem('elaraby_copied_codes_bundle'), null)); } catch (_) { bundle = null; }
    } else {
      bundle = sanitizeStoredBundle(bundle);
    }
    const codes = Array.isArray(bundle?.faultCodes) ? bundle.faultCodes.filter(Boolean) : [];
    const parts = Array.isArray(bundle?.spareParts) ? bundle.spareParts.filter(Boolean) : [];
    if (!bundle || (!codes.length && !parts.length)) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const live = readProductContext();
    // منتج الحزمة (وقت النسخ) أولى من منتج الصفحة الحالية — الحزمة قد تكون من بلاغ آخر
    const product = (bundle.product && (bundle.product.model || bundle.product.family))
      ? bundle.product
      : live;
    if (!bundle.product) bundle.product = product;
    const fam = String(product.family || '').toUpperCase();

    const save = (msg) => {
      try { localStorage.setItem('elaraby_copied_codes_bundle', JSON.stringify(bundle)); } catch (_) {}
      try { refreshCopiedCodesPreview(sh); } catch (_) {}
      if (msg) setStatus(sh, msg, 'success');
    };
    const rerender = () => renderCopyBoard(sh, bundle);

    box.style.display = 'block';
    box.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cp-copy-head';
    head.textContent = `📦 ${product.model || bundle.product?.model || 'بدون منتج'}`
      + (fam ? ` · عائلة ${fam}` : '');
    box.appendChild(head);

    const hint = document.createElement('div');
    hint.className = 'cp-review-hint';
    box.appendChild(hint);

    const pool = document.createElement('div');
    pool.className = 'cp-code-pool';
    box.appendChild(pool);

    const slots = [];
    let dragState = null;
    const linkedKeyOf = (p) => {
      const m = String((p && p.majorCode) || '').trim();
      const s = String((p && p.subCode) || '').trim();
      return (m && s) ? `${m}|${s}` : '';
    };
    const usageOf = (key) => parts.filter(p => linkedKeyOf(p) === key).length;

    // ── تعبئة تلقائية عند النسخ (قرار المالك): لا قطعة بلا كود عطل ──────────
    // الترتيب: ⭐/ذاكرة مُثبتة ← كلمات الوصف ← احتياطي. القيمة قابلة للتعديل
    // بالسحب، ولا تُحفظ في ذاكرة الاقتران إلا بنقرة ⭐ صريحة.
    // تُنفَّذ مرة واحدة لكل حزمة (autoPaired) حتى لا يُعاد ربط قطعة فكّها المستخدم.
    if (!bundle.autoPaired) {
      const usedKeys = new Set(parts.map(linkedKeyOf).filter(Boolean));
      const loadOf = (c) => usageOf(copyBoardCodeKey(c));
      const filled = autoPairParts(parts, codes, { usedKeys, loadOf });
      bundle.autoPaired = true;
      try { localStorage.setItem('elaraby_copied_codes_bundle', JSON.stringify(bundle)); } catch (_) {}
      if (filled) logEvent('COPY_CODES', `🔗 تعبئة تلقائية: ${filled} قطعة اقترنت بكود عطل (راجعها قبل ⭐)`);
    }
    const autoCount = (src) => parts.filter(p => p.pairSource === src).length;


    const refreshHint = () => {
      const unlinked = codes.filter(c => usageOf(copyBoardCodeKey(c)) === 0).length;
      const kw = autoCount('keywords');
      const fb = autoCount('fallback');
      hint.textContent = `${codes.length} كود · ${parts.length} قطعة · ${unlinked} بلا قطعة`
        + (kw ? ` · 🔑 ${kw} مطابقة وصف` : '')
        + (fb ? ` · 🤖 ${fb} احتياطي` : '')
        + ' — راجع الاقتران ثم اضغط ⭐';
    };

    const makeChip = (code, opts) => {
      const o = opts || {};
      const key = copyBoardCodeKey(code);
      const chip = document.createElement('span');
      chip.className = 'cp-code-chip' + (usageOf(key) > 0 ? ' used' : '');
      chip.draggable = true;
      chip.dataset.key = key;
      chip.appendChild(document.createTextNode(String(code.fullCode || code.defectCode || key)));
      const desc = String(code.description || '')
        .replace(/^[A-Za-z]{2}\d{3,4}\s*[-–—]\s*/, '')
        .replace(/^[()\s]+|[()\s]+$/g, '')
        .trim();
      if (desc) {
        const d = document.createElement('small');
        d.textContent = desc.slice(0, 34);
        chip.appendChild(d);
      }
      if (isCostCode(code)) {
        chip.classList.add('cost');
        chip.appendChild(costBadge(code));
      }
      chip.addEventListener('dragstart', (ev) => {
        try {
          ev.dataTransfer.setData('text/plain', key);
          ev.dataTransfer.effectAllowed = 'copyMove';
        } catch (_) {}
        chip.classList.add('dragging');
        dragState = { key, from: o.from == null ? -1 : o.from };
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        dragState = null;
        slots.forEach(s => s.classList.remove('drag-over'));
      });
      return chip;
    };

    const renderSlot = (i) => {
      const p = parts[i];
      const slot = slots[i];
      if (!slot || !p) return;
      slot.innerHTML = '';
      const key = linkedKeyOf(p);
      slot.className = 'cp-part-slot' + (key ? ' filled' : '');
      if (!key) {
        slot.appendChild(document.createTextNode('— اسحب كود العطل هنا —'));
        return;
      }
      const code = codes.find(c => copyBoardCodeKey(c) === key)
        || { majorCode: p.majorCode, defectCode: p.subCode, fullCode: key };
      slot.appendChild(makeChip(code, { from: i }));
      // وسم مصدر الاقتران التلقائي (🔑 مطابقة وصف / 🤖 احتياطي) حتى تعرف ما تراجعه
      const srcMeta = PAIR_SRC[p.pairSource];
      if (srcMeta && (p.pairSource === 'keywords' || p.pairSource === 'fallback')) {
        const badge = document.createElement('span');
        badge.className = 'cp-part-src';
        badge.textContent = srcMeta.icon;
        badge.title = srcMeta.label;
        slot.appendChild(badge);
      }
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'cp-slot-x';
      x.textContent = '✕';
      x.title = 'فكّ الربط (تعود القطعة بلا كود)';
      x.onclick = (ev) => {
        ev.stopPropagation();
        p.majorCode = '';
        p.subCode = '';
        p.pairSource = '';
        save();
        rerender();
      };
      slot.appendChild(x);
    };

    // إفلات على القائمة = فكّ ربط القطعة المسحوبة
    pool.addEventListener('dragover', (ev) => { ev.preventDefault(); pool.classList.add('drag-over'); });
    pool.addEventListener('dragleave', () => pool.classList.remove('drag-over'));
    pool.addEventListener('drop', (ev) => {
      ev.preventDefault();
      pool.classList.remove('drag-over');
      const from = dragState ? dragState.from : -1;
      if (from >= 0 && parts[from]) {
        parts[from].majorCode = '';
        parts[from].subCode = '';
        parts[from].pairSource = '';
        save();
        rerender();
      }
    });

    parts.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'cp-copy-part';

      const nm = document.createElement('span');
      nm.className = 'cp-copy-name';
      nm.textContent = p.code || p.name || `قطعة ${i + 1}`;
      nm.title = p.fullName || p.name || '';
      row.appendChild(nm);

      const slot = document.createElement('div');
      slot.className = 'cp-part-slot';
      slot.addEventListener('dragover', (ev) => { ev.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', (ev) => {
        ev.preventDefault();
        slot.classList.remove('drag-over');
        const key = dragState ? dragState.key : (ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '');
        const code = codes.find(c => copyBoardCodeKey(c) === key);
        if (!code) return;
        const from = dragState ? dragState.from : -1;
        if (from >= 0 && from !== i && parts[from]) {
          parts[from].majorCode = '';
          parts[from].subCode = '';
        }
        p.majorCode = String(code.majorCode || '').trim();
        p.subCode = String(code.defectCode || '').trim();
        p.pairSource = 'manual';
        save();
        rerender();
      });
      slots[i] = slot;
      row.appendChild(slot);

      const star = document.createElement('button');
      star.type = 'button';
      const favNow = favFindItem(p);
      star.className = 'cp-star' + (favNow ? ' on' : '');
      star.textContent = '★';
      const pair = linkedKeyOf(p);
      star.title = pair
        ? `⭐ حفظ ${p.code || p.name || 'القطعة'} مع الاقتران ${pair}`
        : '⭐ حفظ القطعة بلا اقتران — اربطها بكود أولًا ليُحفظ صحيحًا';
      star.onclick = async () => {
        star.disabled = true;
        try {
          const on = await toggleFavPart({
            ...p,
            family: fam || favFamilyFor(p),
            majorCode: String(p.majorCode || '').trim(),
            subCode: String(p.subCode || '').trim()
          });
          star.className = 'cp-star' + (on ? ' on' : '');
          setStatus(sh, on
            ? `⭐ حُفظت ${p.code || p.name || 'القطعة'}${pair ? ' مع ' + pair : ' (بلا اقتران)'}`
            : '⭐ أُزيلت من المفضلة', on ? 'success' : 'warn');
        } catch (e) {
          setStatus(sh, '⚠️ تعذّر حفظ ⭐: ' + (e.message || e), 'warn');
        } finally {
          star.disabled = false;
        }
      };
      row.appendChild(star);

      box.appendChild(row);
    });

    codes.forEach(c => pool.appendChild(makeChip(c, {})));
    if (!codes.length) {
      const none = document.createElement('span');
      none.style.cssText = 'color:#f87171;font-size:10px';
      none.textContent = 'لا توجد أكواد أعطال في الحزمة';
      pool.appendChild(none);
    }
    slots.forEach((_, i) => renderSlot(i));
    refreshHint();

    // ⭐ الخاصة بهذا المنتج فقط (نفس العائلة أو بلا عائلة)
    const favs = Object.entries(loadFavParts())
      .filter(([, v]) => !fam || !v.family || String(v.family).toUpperCase() === fam)
      .sort((a, b) => ((b[1].count || 0) - (a[1].count || 0)) || ((b[1].at || 0) - (a[1].at || 0)))
      .slice(0, 12);
    if (favs.length) {
      const sec = document.createElement('div');
      sec.className = 'cp-copy-sec';
      sec.textContent = `⭐ هذا المنتج (${fam || 'كل العائلات'}) — اضغط لإضافتها للحزمة`;
      box.appendChild(sec);
      const favBox = document.createElement('div');
      favBox.className = 'cp-fav-parts';
      favs.forEach(([k, v]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cp-fav-chip';
        b.textContent = v.code || v.name || k;
        const fp = (v.majorCode && v.subCode) ? `${v.majorCode}|${v.subCode}` : '';
        b.title = [
          v.name || '',
          fp ? 'اقتران محفوظ: ' + fp : 'بلا اقتران محفوظ',
          'اضغط لإضافتها إلى الحزمة'
        ].filter(Boolean).join(' • ');
        b.onclick = () => {
          if (parts.some(p => favKeyOf(p) === k)) {
            setStatus(sh, 'ℹ️ القطعة موجودة في الحزمة بالفعل', 'warn');
            return;
          }
          parts.push({
            code: v.code || '',
            name: v.name || '',
            fullName: v.fullName || v.code || v.name || '',
            productId: v.productId || '',
            qty: v.qty || 1,
            price: v.price || 0,
            warranty: v.warranty || '',
            majorCode: v.majorCode || '',
            subCode: v.subCode || '',
            fromFav: true
          });
          save(`⭐ أُضيفت ${v.code || v.name} إلى الحزمة${fp ? ' مع ' + fp : ''}`);
          rerender();
        };
        favBox.appendChild(b);
      });
      box.appendChild(favBox);
    }
  }

  async function copyCodesAction(shadow) {
    logEvent('COPY_CODES', 'بدء نسخ الأكواد من الصفحة');
    setStatus(shadow, '⏳ جاري استخراج الأكواد من كل صفحات الشبكة...');
    try {
      // 🧹 مودال مفتوح يحجب الشبكة ويغيّر DOM ⇒ إغلاق آمن أولًا ثم النسخ
      //    (تحقق حي 2026-10-26: النسخ مع مودال مفتوح أعاد صفرًا/بيانات ناقصة)
      const openModals = [];
      for (const doc of getShallowDocs()) {
        try { Array.from(doc.querySelectorAll('.modal')).filter(isModalOpenSafe).forEach(m => openModals.push(m)); } catch (_) {}
      }
      if (openModals.length) {
        logEvent('COPY_CODES', `🧹 إغلاق ${openModals.length} مودال مفتوح قبل النسخ`);
        for (const m of openModals) {
          try { await closeModalSafely(m, 'نسخ الأكواد'); } catch (_) {}
        }
        await sleep(300);
      } else {
        clearOrphanBackdrops('نسخ الأكواد');
      }

      const bundle = await extractFaultCodesFromPage(shadow);
      const gp = bundle.gridPages || {};
      if (gp.defectsTotal > 1 || gp.partsTotal > 1) {
        logEvent('COPY_CODES', `📄 قُرئت ${gp.defects || 1}/${gp.defectsTotal || 1} صفحة أعطال · ${gp.parts || 1}/${gp.partsTotal || 1} صفحة قطع`);
      }
      if (bundle.aborted) {
        logEvent('COPY_CODES', '⛔ توقف الترقيم بخطأ بوابة — اعتُمد ما قُرئ فقط (لا ترقيم أعمى)');
        setStatus(shadow, '⚠️ توقف الترقيم بخطأ بوابة — اعتُمد ما قُرئ فقط', 'warn');
      }
      if ((!bundle.faultCodes || bundle.faultCodes.length === 0) && (!bundle.spareParts || bundle.spareParts.length === 0)) {
        setStatus(shadow, '⚠️ لم يتم العثور على أكواد أعطال أو قطع غيار لنسخها في هذه الصفحة', 'warn');
        logEvent('COPY_CODES', 'لا توجد أكواد أعطال أو قطع غيار في الصفحة');
        return;
      }

      const jsonStr = JSON.stringify(bundle, null, 2);
      let copiedToClip = false;
      try {
        await navigator.clipboard.writeText(jsonStr);
        copiedToClip = true;
      } catch (err) {
        logEvent('COPY_CODES', 'تعذر الكتابة المباشرة للحافظة، جاري الحفظ محلياً: ' + (err?.message || err));
      }

      try {
        localStorage.setItem('elaraby_copied_codes_bundle', jsonStr);
      } catch(_) {}

      refreshCopiedCodesPreview(shadow);
      try { renderCopyBoard(shadow, bundle); } catch (e) { logEvent('COPY_CODES', 'لوحة النسخ: ' + (e.message || e)); }

      const codesSummary = (bundle.faultCodes || []).map(c => c.fullCode || c.defectCode || c.majorCode).join('، ');
      const partsSummary = (bundle.spareParts && bundle.spareParts.length > 0) ? ` و ${bundle.spareParts.length} قطعة غيار` : '';
      const msg = `✅ تم نسخ ${(bundle.faultCodes || []).length} كود عطل${partsSummary} (${codesSummary})`;
      setStatus(shadow, msg, 'success');
      logEvent('COPY_CODES', `${msg} | الحافظة: ${copiedToClip ? 'نعم' : 'محلي فقط'}`);
    } catch (e) {
      logEvent('COPY_CODES', `خطأ: ${e.message || e}`);
      setStatus(shadow, '❌ خطأ أثناء النسخ: ' + (e.message || ''), 'error');
    }
  }

  function isModalOpenSafe(m) {
    if (!m) return false;
    if (m.classList.contains('in') || m.classList.contains('show')) return true;
    if (m.style.display === 'block') return true;
    try {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden';
    } catch(_) { return false; }
  }

  async function safeClick(el) {
    if (!el) return false;
    try { el.focus(); } catch(_) {}
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
      } catch(_) {}
    }
    return true;
  }

  // ── حماية من تراكم ستائر Bootstrap (شاشة سوداء تتغمق تدريجيًا) ───────────────
  // البوابة تستخدم Bootstrap 3: كل .modal-backdrop = أسود بعتامة 0.5 يغطي الشاشة.
  // عند إغلاق المودال بغير طريق Bootstrap (زر form-close، أو مسار فشل) تبقى الستارة
  // فتتراكم: 1=50%، 2=75%، 3=87.5% … ولهذا «تغمق الشاشة كل شوية».
  function countBackdrops() {
    try { return document.querySelectorAll('.modal-backdrop').length; } catch(_) { return 0; }
  }

  function hasVisibleModal() {
    try {
      for (const doc of getShallowDocs()) {
        if (Array.from(doc.querySelectorAll('.modal')).some(m => isModalOpenSafe(m))) return true;
      }
      return false;
    } catch(_) { return false; }
  }

  // نقرة واحدة فقط — نستخدم المحرك إن وُجد (يمنع النقر المزدوج على عناصر التبديل).
  function clickOnceSafe(el) {
    if (!el) return false;
    const once = window.AutoFillEngine?.Lookups?.clickOnce;
    if (typeof once === 'function') return once(el);
    try { el.focus(); } catch(_) {}
    try { el.click(); } catch(_) {}
    return true;
  }

  // حذف الستائر اليتيمة فقط: لا يلمس شيئًا إذا كان هناك مودال مفتوح فعلًا.
  function clearOrphanBackdrops(reason = '') {
    if (hasVisibleModal()) return 0;
    const nodes = Array.from(document.querySelectorAll('.modal-backdrop'));
    if (nodes.length === 0) return 0;
    nodes.forEach(n => { try { n.remove(); } catch(_) {} });
    try { document.body.classList.remove('modal-open'); } catch(_) {}
    try { document.body.style.removeProperty('padding-right'); } catch(_) {}
    logEvent('OVERLAY', `تنظيف ${nodes.length} ستارة متراكمة${reason ? ' — ' + reason : ''}`);
    return nodes.length;
  }

  // إغلاق آمن: Bootstrap API أولًا، ثم زر إغلاق واحد، ثم إخفاء قسري + تنظيف الستائر.
  async function closeModalSafely(modal, reason = '') {
    if (!modal) { clearOrphanBackdrops(reason); return false; }
    const $ = window.jQuery || window.$;
    if (typeof $ === 'function') {
      try {
        if ($(modal).data('bs.modal')) $(modal).modal('hide');
      } catch(_) {}
    }
    if (isModalOpenSafe(modal)) {
      const btn = modal.querySelector('button.form-close, .modal-header .close, .modal-header [data-dismiss="modal"]')
               || modal.querySelector('[data-dismiss="modal"]');
      if (btn) clickOnceSafe(btn);
    }
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline && isModalOpenSafe(modal)) await sleep(200);
    if (isModalOpenSafe(modal)) {
      try { modal.classList.remove('in', 'show'); modal.style.display = 'none'; } catch(_) {}
      try { modal.setAttribute('aria-hidden', 'true'); } catch(_) {}
      logEvent('OVERLAY', `إخفاء قسري لمودال لم يُغلق${reason ? ' — ' + reason : ''}`);
      await sleep(200);
    }
    clearOrphanBackdrops(reason);
    return !isModalOpenSafe(modal);
  }

  // قبل فتح مودال جديد: أغلق أي مودال عالق (يمنع فتح مودال فوق مودال ⇒ ستارتان).
  async function resetModalsBeforeStep(reason = '') {
    const open = Array.from(document.querySelectorAll('.modal')).filter(isModalOpenSafe);
    for (const m of open) {
      logEvent('OVERLAY', `مودال مفتوح قبل «${reason}» — إغلاقه أولًا`);
      await closeModalSafely(m, reason);
    }
    if (open.length === 0) clearOrphanBackdrops(reason);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // مطابقة نصوص دقيقة (بلا اختيار «أول صف» أعمى)
  // ════════════════════════════════════════════════════════════════════════════
  let PANEL_SHADOW = null;

  function normalizeAr(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u064B-\u0652\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[_\u2012\u2013\u2014()\[\]:,،.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // "CODE _ (NAME)" ⇒ CODE  |  "CODE _ NAME" ⇒ CODE  |  "CODE (NAME)" ⇒ CODE
  function simplifySearchText(v) {
    let s = String(v || '').trim();
    if (!s) return '';
    let m = s.match(/^(.+?)\s+_\s+/);
    if (m) return m[1].trim();
    if (s.includes('(')) s = s.split('(')[0].trim();
    const parts = s.split(/\s+[-–—]\s+/);
    return (parts.length > 1 ? parts[0] : s).trim();
  }

  // يفكك "CODE _ (الاسم العربي)" إلى كود واسم منفصلين
  function parsePartName(raw) {
    const s = String(raw || '').trim();
    if (!s) return { code: '', name: '', fullName: '' };
    let m = s.match(/^(.+?)\s+_\s+\((.*)\)\s*$/);
    if (m) return { code: m[1].trim(), name: m[2].trim(), fullName: s };
    m = s.match(/^(.+?)\s+_\s+(.+)$/);
    if (m) return { code: m[1].trim(), name: m[2].trim(), fullName: s };
    m = s.match(/^(.+?)\s*\((.*)\)\s*$/);
    if (m) return { code: m[1].trim(), name: m[2].trim(), fullName: s };
    m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (m) return { code: m[1].trim(), name: m[2].trim(), fullName: s };
    return { code: '', name: s, fullName: s };
  }

  function scoreLookupRow(rowText, target) {
    const rt = normalizeAr(rowText);
    const tt = normalizeAr(target);
    if (!rt || !tt) return 0;
    const code = normalizeAr(simplifySearchText(target));
    if (rt === tt) return 100;
    if (code && rt === code) return 98;
    if (code) {
      const re = new RegExp('(^|\\s)' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');
      if (re.test(rt)) return 95;
    }
    if (rt.includes(tt)) return 80;
    if (code && rt.includes(code)) return 75;
    const words = tt.split(' ').filter(w => w.length >= 3);
    if (words.length && words.every(w => rt.includes(w))) return 60;
    return 0;
  }

  // الحقل المخفي الذي يحمل GUID الاختيار (ats_x_name ⇒ ats_x)
  function findIframeLookupGuid(doc, inputId) {
    if (!doc || !inputId) return null;
    const base = String(inputId).replace(/_name$/, '');
    if (!base || base === inputId) return null;
    try {
      return doc.getElementById(base) || doc.querySelector(`input[name="${base}"]`) || null;
    } catch(_) { return null; }
  }

  async function closeLookupModalInDoc(modal) {
    if (!modal) return;
    const btn = modal.querySelector('button.close, [data-dismiss="modal"], button[aria-label*="Close"]');
    if (btn) clickOnceSafe(btn);
    else {
      try { modal.classList.remove('in', 'show'); modal.style.display = 'none'; } catch(_) {}
    }
    await sleep(300);
  }

  // قائمة اختيار سريعة داخل اللوحة (بدل الاختيار الأعمى أو window.prompt)
  // تقبل نصوصًا أو كائنات { text, cost } — و🪙 يظهر على أي خيار وصفه يحوي «بتكلفة».
  function promptLookupPick(title, options) {
    const sh = PANEL_SHADOW;
    const box = sh && sh.getElementById('cp-pick');
    const sel = sh && sh.getElementById('cp-pick-select');
    const titleEl = sh && sh.getElementById('cp-pick-title');
    const list = (options || []).map(o => {
      const isObj = o && typeof o === 'object';
      const text = String(isObj ? (o.text || '') : (o || '')).trim();
      if (!text) return null;
      return { text, cost: (isObj && o.cost === true) || hasCostTrigger(text) };
    }).filter(Boolean);
    if (!box || !sel || !list.length) return Promise.resolve(null);
    if (box._resolve) { try { box._resolve(null); } catch(_) {} }

    sel.innerHTML = '';
    let anyCost = false;
    list.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.text;
      const label = o.text.length > 80 ? o.text.slice(0, 80) + '…' : o.text;
      opt.textContent = o.cost ? '🪙 ' + label : label;
      if (o.cost) {
        anyCost = true;
        opt.dataset.cost = '1';
        opt.title = 'وصفه يحوي «بتكلفة» — يُحتسب على العميل حتى لو داخل الضمان';
      }
      sel.appendChild(opt);
    });
    if (titleEl) {
      titleEl.textContent = (title || 'اختر من المتاح:')
        + (anyCost ? ' — 🪙 وصفه يحوي «بتكلفة»: يُحتسب على العميل حتى داخل الضمان' : '');
    }
    box.style.display = 'block';

    return new Promise(resolve => {
      let done = false;
      const okBtn = sh.getElementById('cp-pick-ok');
      const skipBtn = sh.getElementById('cp-pick-skip');
      let timer = null;
      const finish = (val) => {
        if (done) return;
        done = true;
        box._resolve = null;
        box.style.display = 'none';
        if (okBtn) okBtn.onclick = null;
        if (skipBtn) skipBtn.onclick = null;
        if (timer) clearTimeout(timer);
        resolve(val);
      };
      box._resolve = finish;
      if (okBtn) okBtn.onclick = () => finish(sel.value || null);
      if (skipBtn) skipBtn.onclick = () => finish(null);
      timer = setTimeout(() => finish(null), 90000);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // الضمان لكل قطعة (داخل/خارج) — الحقل على مستوى صف الشبكة: ats_warrantystatus
  // ════════════════════════════════════════════════════════════════════════════
  function findPartRowOnPage(part) {
    if (!part) return null;
    const id = String(part.productId || '').trim().toLowerCase();
    const code = String(part.code || '').trim().toLowerCase();
    let rows = [];
    try { rows = Array.from(document.querySelectorAll('tr[data-entity="msdyn_inventoryadjustmentproduct"]')); } catch(_) {}
    if (!rows.length) {
      for (const doc of getShallowDocs()) {
        try { rows = rows.concat(Array.from(doc.querySelectorAll('tr[data-entity="msdyn_inventoryadjustmentproduct"]'))); } catch(_) {}
      }
    }
    return rows.find(r => {
      if (id) {
        const td = r.querySelector('td[data-attribute="msdyn_product"]');
        if (td && (td.getAttribute('data-value') || '').toLowerCase().includes(id)) return true;
      }
      if (code) {
        const txt = ((r.getAttribute('data-name') || '') + ' ' + (r.innerText || '')).toLowerCase();
        if (txt.includes(code)) return true;
      }
      return false;
    }) || null;
  }

  function readRowWarranty(row) {
    const td = row && row.querySelector('td[data-attribute="ats_warrantystatus"]');
    if (!td) return '';
    const aria = (td.getAttribute('aria-label') || '').toLowerCase();
    if (aria === 'in' || aria.includes('inside')) return 'in';
    if (aria === 'out' || aria.includes('outside')) return 'out';
    const raw = td.getAttribute('data-value') || '';
    if (raw.includes('963400000')) return 'in';
    if (raw.includes('963400001')) return 'out';
    const txt = (td.innerText || '').trim();
    if (/داخل/.test(txt)) return 'in';
    if (/خارج/.test(txt)) return 'out';
    return '';
  }

  // لا ينقر أي شيء: يعدّل فقط لو الشبكة فيها select فعلي، ثم يتحقق من النتيجة.
  async function applyWarrantyToRow(part, desired) {
    if (!desired) return { ok: true, skipped: true };
    const row = findPartRowOnPage(part);
    if (!row) return { ok: false, reason: 'row-not-found' };
    const current = readRowWarranty(row);
    if (current === desired) return { ok: true, already: true };
    const td = row.querySelector('td[data-attribute="ats_warrantystatus"]');
    const sel = td && td.querySelector('select');
    if (sel) {
      sel.value = desired === 'in' ? '963400000' : '963400001';
      try { sel.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      await sleep(800);
      if (readRowWarranty(row) === desired) return { ok: true, changed: true };
    }
    return { ok: false, reason: 'manual', current };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ⭐ القطع الشائعة — خدمة كاملة:
  //   كود + اسم + كود عطل + عائلة + ضمان افتراضي + كمية + سعر + تعليق + عدد استخدام
  //   المخزن: chrome.storage.local → fav_parts_v2 (نسخة احتياطية في localStorage)
  //   ترحيل تلقائي مرة واحدة من v1 (elaraby_fav_parts) — v1 خريطة بلا عائلة/سعر/تعليق
  // ════════════════════════════════════════════════════════════════════════════
  const FAV_PARTS_KEY = 'elaraby_fav_parts';        // v1 قديم — للترحيل فقط
  const FAV_STORE_KEY = 'fav_parts_v2';             // v2 في chrome.storage.local
  const FAV_LS_KEY = 'elaraby_fav_parts_v2';        // نسخة محلية احتياطية/بديلة
  const FAV_MIGRATED_KEY = 'elaraby_fav_parts_migrated';
  const FAV_FAMILIES = ['AC', 'GS', 'GR', 'WM', 'HT', 'DW'];

  let _favStore = null;
  let _favPromise = null;
  let _favEditingKey = '';
  let _favDeleteArmed = null;
  let _favResetArmed = 0;

  function favStorageAvailable() {
    try { return !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local); }
    catch (_) { return false; }
  }

  function favMigrated() {
    try { return localStorage.getItem(FAV_MIGRATED_KEY) === '1'; } catch (_) { return false; }
  }

  // توحيد شكل القطعة: أرقام منطقية + عائلة معروفة + ضمان محصور في in/out
  function favNormalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const key = String(raw.key || raw.productId || raw.code || raw.name || '').trim();
    if (!key) return null;
    const fam = String(raw.family || '').toUpperCase();
    return {
      key,
      code: String(raw.code || '').trim(),
      name: String(raw.name || '').trim(),
      fullName: String(raw.fullName || ''),
      productId: String(raw.productId || ''),
      family: FAV_FAMILIES.includes(fam) ? fam : '',
      majorCode: String(raw.majorCode || '').toUpperCase(),
      subCode: String(raw.subCode || '').toUpperCase(),
      warranty: raw.warranty === 'out' ? 'out' : (raw.warranty === 'in' ? 'in' : ''),
      qty: Math.max(1, Math.min(99, Number(raw.qty) || 1)),
      price: Math.max(0, Number(raw.price) || 0),
      comment: String(raw.comment || '').slice(0, 500),
      count: Math.max(0, Number(raw.count) || 0),
      at: Number(raw.at) || Date.now(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  // توحيد المخزن: {version:2, items:[]} مع إزالة التكرار بالمعرّف
  function favNormalizeStore(raw) {
    const src = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
    const out = { version: 2, items: [] };
    const seen = new Set();
    src.forEach(r => {
      const it = favNormalizeItem(r);
      if (it && !seen.has(it.key)) { seen.add(it.key); out.items.push(it); }
    });
    return out;
  }

  function favMapFrom(store) {
    const map = {};
    (store && Array.isArray(store.items) ? store.items : []).forEach(it => { map[it.key] = it; });
    return map;
  }

  // الخريطة المتزامنة (كل الواجهة الحالية تقرأها بلا await)
  function loadFavParts() {
    if (_favStore) return favMapFrom(_favStore);
    // قبل اكتمال التحميل: نسخة v2 المحلية ثم v1 (حتى لا تظهر الواجهة فاضية)
    const cached = safeParseJSON(localStorage.getItem(FAV_LS_KEY), null);
    if (cached && Array.isArray(cached.items) && cached.items.length) {
      return favMapFrom(favNormalizeStore(cached));
    }
    const legacy = safeParseJSON(localStorage.getItem(FAV_PARTS_KEY), null);
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      const items = Object.keys(legacy)
        .map(k => favNormalizeItem({ ...(legacy[k] || {}), key: k }))
        .filter(Boolean);
      return favMapFrom({ items });
    }
    return {};
  }

  async function favStorageRead() {
    if (favStorageAvailable()) {
      try {
        const got = await chrome.storage.local.get({ [FAV_STORE_KEY]: null });
        const v = got ? got[FAV_STORE_KEY] : null;
        // مخزن chrome فاضي (تثبيت جديد/مسح) ⇒ نستخدم النسخة المحلية إن وُجدت
        if (v && Array.isArray(v.items) && v.items.length) return v;
      } catch (e) {
        logEvent('FAV', 'تعذّر قراءة ⭐ من chrome.storage: ' + (e.message || e));
      }
    }
    return safeParseJSON(localStorage.getItem(FAV_LS_KEY), null);
  }

  async function favStorageWrite(store) {
    if (favStorageAvailable()) {
      await chrome.storage.local.set({ [FAV_STORE_KEY]: store });
    }
    try {
      localStorage.setItem(FAV_LS_KEY, JSON.stringify(store));
      localStorage.setItem(FAV_MIGRATED_KEY, '1');
    } catch (_) {}
  }

  async function loadFavStore(force) {
    if (_favStore && !force) return _favStore;
    if (_favPromise && !force) return _favPromise;
    _favPromise = (async () => {
      let store = favNormalizeStore(await favStorageRead());
      if (!store.items.length && !favMigrated()) {
        const legacy = safeParseJSON(localStorage.getItem(FAV_PARTS_KEY), null);
        if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
          const items = Object.keys(legacy)
            .map(k => favNormalizeItem({ ...(legacy[k] || {}), key: k }))
            .filter(Boolean);
          if (items.length) {
            store = favNormalizeStore({ items });
            try {
              await favStorageWrite(store);
              try { localStorage.removeItem(FAV_PARTS_KEY); } catch (_) {}
              logEvent('FAV', `ترحيل ⭐ من v1 إلى v2: ${items.length} قطعة`);
            } catch (e) {
              logEvent('FAV', 'تعذّر ترحيل ⭐ v1: ' + (e.message || e));
            }
          }
        }
      }
      _favStore = store;
      return _favStore;
    })();
    try { return await _favPromise; } finally { _favPromise = null; }
  }

  async function saveFavStore(store) {
    _favStore = favNormalizeStore(store);
    try { await favStorageWrite(_favStore); }
    catch (e) { logEvent('FAV', 'تعذّر حفظ ⭐: ' + (e.message || e)); }
    // إعادة الرسم مؤجّلة خارج دورة الحدث (نفس أسلوب مخزن الأعطال)
    if (typeof PANEL_SHADOW !== 'undefined' && PANEL_SHADOW) {
      const sh = PANEL_SHADOW;
      setTimeout(() => {
        try { renderFavParts(sh); } catch (_) {}
        try { renderFavEditor(sh); } catch (_) {}
      }, 0);
    }
    return _favStore;
  }

  function favKeyOf(p) {
    return String((p && (p.productId || p.code || p.name)) || '').trim();
  }

  // مطابقة موحّدة: نفس المعرّف أو نفس الكود (يمنع تكرار نفس القطعة
  // حين تُضاف يدويًا بكود فقط ثم تُعلَّم ★ من لوحة المراجعة بمعرّف منتج)
  function favFindMatch(items, p) {
    const key = favKeyOf(p);
    const code = String((p && p.code) || '').trim().toUpperCase();
    return (Array.isArray(items) ? items : []).findIndex(it =>
      it.key === key || (!!code && String(it.code || '').toUpperCase() === code));
  }

  function favFindItem(p) {
    const items = _favStore ? _favStore.items : Object.values(loadFavParts());
    const idx = favFindMatch(items, p);
    return idx >= 0 ? items[idx] : null;
  }

  function isFavPart(p) {
    const key = favKeyOf(p);
    return !!(key && favFindItem(p));
  }

  function favFamilyFor(p) {
    if (p && p.family) return String(p.family).toUpperCase();
    try { return defectFamilyOf(readDeviceHint()) || ''; } catch (_) { return ''; }
  }

  function favItemFromPart(p) {
    const key = favKeyOf(p);
    if (!key) return null;
    return favNormalizeItem({
      key,
      code: p.code || '', name: p.name || '', fullName: p.fullName || '',
      productId: p.productId || '', family: favFamilyFor(p),
      majorCode: p.majorCode || '', subCode: p.subCode || '',
      warranty: p.warranty || '', qty: p.qty || 1, price: p.price || 0,
      comment: p.comment || '', count: p.count || 0, at: p.at || Date.now(),
      updatedAt: new Date().toISOString()
    });
  }

  async function toggleFavPart(p) {
    const key = favKeyOf(p);
    if (!key) return false;
    const store = await loadFavStore();
    const idx = favFindMatch(store.items, p);
    if (idx >= 0) {
      store.items.splice(idx, 1);
      await saveFavStore(store);
      return false;
    }
    const item = favItemFromPart(p);
    if (!item) return false;
    store.items.push(item);
    await saveFavStore(store);
    return true;
  }

  async function bumpFavUsage(p) {
    const key = favKeyOf(p);
    if (!key) return;
    const store = await loadFavStore();
    const it = store.items.find(x => x.key === key);
    if (!it) return;
    it.count = (Number(it.count) || 0) + 1;
    if (p.warranty === 'in' || p.warranty === 'out') it.warranty = p.warranty;
    if (p.majorCode) it.majorCode = String(p.majorCode).toUpperCase();
    if (p.subCode) it.subCode = String(p.subCode).toUpperCase();
    it.updatedAt = new Date().toISOString();
    await saveFavStore(store);
  }

  function renderFavParts(shadow) {
    const sh = shadow || (typeof PANEL_SHADOW !== 'undefined' ? PANEL_SHADOW : null);
    if (!sh) return;
    const wrap = sh.getElementById('cp-fav-parts-wrap');
    const box = sh.getElementById('cp-fav-parts');
    if (!wrap || !box) return;
    wrap.style.display = 'block';
    const map = loadFavParts();
    let devFam = '';
    try { devFam = defectFamilyOf(readDeviceHint()) || ''; } catch (_) {}
    const list = Object.entries(map)
      .sort((a, b) => ((b[1].count || 0) - (a[1].count || 0)) || ((b[1].at || 0) - (a[1].at || 0)))
      .slice(0, 12);
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.innerHTML = '';
    list.forEach(([k, v]) => {
      const other = !!(v.family && devFam && v.family !== devFam);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cp-fav-chip';
      b.dataset.favKey = k;
      b.textContent = (v.code || v.name || k) + (v.count ? ` ×${v.count}` : '');
      if (other) {
        const badge = document.createElement('span');
        badge.className = 'fav-other';
        badge.textContent = v.family;
        b.appendChild(badge);
      }
      b.title = [
        v.name || v.code || k,
        v.family ? 'عائلة ' + v.family : 'كل العائلات',
        v.price ? v.price + ' ج.م' : '',
        v.comment ? '💬 ' + v.comment : '',
        other ? '⚠️ ليست لعائلة الجهاز الحالي — كليك يمين للتعديل' : 'كليك يمين للتعديل'
      ].filter(Boolean).join(' • ');
      b.onclick = () => {
        quickAddFavoritePart(sh, k).catch(e => logEvent('FAV', 'إضافة سريعة: ' + (e.message || e)));
      };
      b.oncontextmenu = (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
        openFavEditor(sh, k).catch(e => logEvent('FAV', 'محرر ⭐: ' + (e.message || e)));
      };
      box.appendChild(b);
    });
  }

  async function quickAddFavoritePart(shadow, key) {
    const store = await loadFavStore();
    const fav = store.items.find(it => it.key === key);
    if (!fav) { setStatus(shadow, '⚠️ القطعة لم تعد موجودة في ⭐ — أعد فتح اللوحة', 'warn'); return; }
    let devFam = '';
    try { devFam = defectFamilyOf(readDeviceHint()) || ''; } catch (_) {}
    if (fav.family && devFam && fav.family !== devFam) {
      setStatus(shadow, `⚠️ «${fav.code || fav.name}» لعائلة ${fav.family} والجهاز الحالي ${devFam}`, 'warn');
      logEvent('FAV', `منع إضافة ${fav.code || fav.name}: عائلة ${fav.family} ≠ ${devFam}`);
      return;
    }
    await runExclusive(shadow, `إضافة ${fav.code || fav.name}`, async () => {
      let faultCode = fav.majorCode ? { majorCode: fav.majorCode, defectCode: fav.subCode || '' } : null;
      if (!faultCode) {
        const cb = shadow.querySelector('.fault-cb:checked');
        if (cb) {
          const p = cb.value.split(',');
          faultCode = { majorCode: p[0] || '', defectCode: p[1] || '' };
        }
      }
      if (!faultCode) {
        setStatus(shadow, '⚠️ اختر كود عطل أولًا (لربط القطعة)', 'warn');
        return;
      }
      const part = {
        code: fav.code, name: fav.name, fullName: fav.fullName || '',
        productId: fav.productId, qty: fav.qty || 1, price: fav.price || 0,
        warranty: fav.warranty || ''
      };
      const res = await addSparePartPage3(part, faultCode);
      if (res && res.ok) {
        await bumpFavUsage({ ...part, majorCode: faultCode.majorCode, subCode: faultCode.defectCode });
        const note = fav.comment ? ` — 💬 ${fav.comment}` : '';
        setStatus(shadow, `✅ أُضيفت: ${fav.code || fav.name}${note}`, 'success');
      } else {
        setStatus(shadow, `⚠️ ${res?.reason || 'فشل الإضافة'}`, 'warn');
      }
      renderFavParts(shadow);
    });
  }

  // ── واجهة إدارة ⭐ (تبويب «قطع» داخل المحرر الموحّد) ──────────────────
  function favMetaText(it) {
    const out = [];
    out.push(it.family ? 'عائلة ' + it.family : 'كل العائلات');
    if (it.warranty === 'in') out.push('داخل الضمان');
    else if (it.warranty === 'out') out.push('خارج الضمان');
    if (it.qty > 1) out.push('×' + it.qty);
    if (it.price) out.push(it.price + ' ج.م');
    if (it.comment) out.push('💬 ' + it.comment);
    out.push('استُخدمت ' + (it.count || 0));
    return out.join(' · ');
  }

  function renderFavEditor(shadow) {
    const list = shadow.getElementById('cp-fav-list');
    if (!list) return;
    const items = (_favStore && Array.isArray(_favStore.items) ? _favStore.items : []).slice()
      .sort((a, b) => String(a.family || 'zz').localeCompare(String(b.family || 'zz'))
        || ((b.count || 0) - (a.count || 0))
        || ((b.at || 0) - (a.at || 0)));
    const count = shadow.getElementById('cp-fav-count');
    if (count) count.textContent = `${items.length} قطعة — الكود + العائلة + الضمان + الكمية + السعر + التعليق`;
    if (!items.length) {
      list.innerHTML = '<div class="cp-empty">لا توجد قطع ⭐ بعد — أضف أول قطعة من الأسفل أو من ★ في لوحة المراجعة</div>';
      return;
    }
    list.innerHTML = items.map(it => `<div class="cp-edef-row fav" data-fav-key="${escapeHtml(it.key)}">`
      + `<span class="cp-edef-name" title="${escapeHtml(it.name || '')}">${escapeHtml(it.code || it.name || it.key)}</span>`
      + `<span class="cp-edef-meta" title="${escapeHtml(favMetaText(it))}">${escapeHtml(favMetaText(it))}</span>`
      + `<button type="button" class="cp-defect-mini" data-act="edit" title="تعديل">✏️</button>`
      + `<button type="button" class="cp-defect-mini cp-defect-del" data-act="del" title="حذف">🗑️</button>`
      + `</div>`).join('');
  }

  function fillFavForm(shadow, it) {
    _favEditingKey = it.key;
    const set = (id, v) => { const el = shadow.getElementById(id); if (el) el.value = v; };
    set('cp-fav-code', it.code || '');
    set('cp-fav-name', it.name || '');
    set('cp-fav-family', it.family || '');
    set('cp-fav-warranty', it.warranty || '');
    set('cp-fav-qty', String(it.qty || 1));
    set('cp-fav-price', String(it.price || 0));
    set('cp-fav-comment', it.comment || '');
    const save = shadow.getElementById('cp-fav-save');
    if (save) save.textContent = '💾 حفظ القطعة';
    const cancel = shadow.getElementById('cp-fav-cancel');
    if (cancel) cancel.style.display = 'block';
  }

  function clearFavForm(shadow) {
    _favEditingKey = '';
    const set = (id, v) => { const el = shadow.getElementById(id); if (el) el.value = v; };
    set('cp-fav-code', '');
    set('cp-fav-name', '');
    set('cp-fav-family', '');
    set('cp-fav-warranty', '');
    set('cp-fav-qty', '1');
    set('cp-fav-price', '0');
    set('cp-fav-comment', '');
    const save = shadow.getElementById('cp-fav-save');
    if (save) save.textContent = '➕ إضافة قطعة';
    const cancel = shadow.getElementById('cp-fav-cancel');
    if (cancel) cancel.style.display = 'none';
  }

  async function openFavEditor(shadow, key) {
    const btn = shadow.getElementById('cp-defect-edit-btn');
    const box = shadow.getElementById('cp-defect-editor');
    if (!box) return;
    if (box.style.display !== 'block' && btn) { try { btn.click(); } catch (_) {} }
    if (box.style.display !== 'block') box.style.display = 'block';
    await loadFavStore();
    setEditorTab(shadow, 'favorites');
    renderDefectEditor(shadow);
    if (key) {
      const it = (_favStore.items || []).find(x => x.key === key);
      if (it) fillFavForm(shadow, it);
    }
    try { box.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  }

  async function saveFavEntry(shadow) {
    const g = (id) => { const el = shadow.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const code = g('cp-fav-code');
    const name = g('cp-fav-name');
    if (!code && !name) { setStatus(shadow, '⚠️ اكتب كود القطعة أو اسمها على الأقل', 'warn'); return null; }
    const key = code || name;
    const store = await loadFavStore();
    const editingKey = _favEditingKey;
    const existing = store.items.find(it => it.key === editingKey);
    const others = store.items.filter(it => it.key !== editingKey);
    if (favFindMatch(others, { key, code }) >= 0) {
      setStatus(shadow, `⚠️ «${key}» موجودة بالفعل في ⭐ — عدّلها من القائمة`, 'warn');
      return null;
    }
    const item = favNormalizeItem({
      key,
      code, name,
      fullName: existing ? existing.fullName : '',
      productId: existing ? existing.productId : '',
      family: g('cp-fav-family'),
      warranty: g('cp-fav-warranty'),
      majorCode: existing ? existing.majorCode : '',
      subCode: existing ? existing.subCode : '',
      qty: g('cp-fav-qty'),
      price: g('cp-fav-price'),
      comment: g('cp-fav-comment'),
      count: existing ? existing.count : 0,
      at: existing ? existing.at : Date.now()
    });
    if (!item) { setStatus(shadow, '⚠️ بيانات القطعة غير صالحة', 'warn'); return null; }
    const rows = store.items.filter(it => it.key !== editingKey && it.key !== item.key);
    rows.push(item);
    await saveFavStore({ version: 2, items: rows });
    clearFavForm(shadow);
    setStatus(shadow, `✅ ${editingKey ? 'حُدِّثت' : 'أُضيفت'} القطعة ⭐ «${item.code || item.name}»`, 'success');
    logEvent('FAV', `${editingKey ? 'تعديل' : 'إضافة'} قطعة ⭐: ${item.key}`);
    return item;
  }

  async function deleteFavEntry(shadow, key) {
    const store = await loadFavStore();
    const rows = store.items.filter(it => it.key !== key);
    if (rows.length === store.items.length) return;
    await saveFavStore({ version: 2, items: rows });
    if (_favEditingKey === key) clearFavForm(shadow);
    setStatus(shadow, `🗑️ حُذفت القطعة «${key}» من ⭐`, 'success');
    logEvent('FAV', 'حذف قطعة ⭐: ' + key);
  }

  async function exportFavoritesJson(shadow) {
    const store = await loadFavStore();
    const out = { version: 2, updatedAt: new Date().toISOString(), items: store.items };
    const json = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setStatus(shadow, `📤 نُسخ JSON لـ ${store.items.length} قطعة ⭐`, 'success');
    } catch (_) {
      console.log('[PortalHelper] fav_parts_v2.json\n' + json);
      setStatus(shadow, '📋 تعذّر النسخ — الـ JSON مطبوع في Console', 'warn');
    }
    logEvent('FAV', `تصدير ⭐ (${store.items.length} قطعة)`);
  }

  function bindFavEditor(shadow) {
    const manage = shadow.getElementById('cp-fav-manage');
    const list = shadow.getElementById('cp-fav-list');
    const saveBtn = shadow.getElementById('cp-fav-save');
    const cancelBtn = shadow.getElementById('cp-fav-cancel');
    const exportBtn = shadow.getElementById('cp-fav-export');
    const resetBtn = shadow.getElementById('cp-fav-reset');
    if (!list || !saveBtn || !cancelBtn) return;
    if (list.dataset.bound === '1') return;
    list.dataset.bound = '1';

    if (manage) manage.onclick = () => {
      openFavEditor(shadow).catch(e => logEvent('FAV', 'فتح محرر ⭐: ' + (e.message || e)));
    };

    list.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      const row = b && b.closest('.cp-edef-row');
      if (!row) return;
      const key = row.dataset.favKey || '';
      if (b.dataset.act === 'del') {
        const armed = _favDeleteArmed && _favDeleteArmed.key === key
          && (Date.now() - _favDeleteArmed.at < 4000);
        if (!armed) {
          _favDeleteArmed = { key, at: Date.now() };
          b.textContent = '⚠️';
          setStatus(shadow, '⚠️ اضغط 🗑️ مرة أخرى لحذف القطعة من ⭐', 'warn');
          setTimeout(() => { try { b.textContent = '🗑️'; } catch (_) {} }, 4000);
          return;
        }
        _favDeleteArmed = null;
        await deleteFavEntry(shadow, key);
        return;
      }
      const it = (_favStore && _favStore.items ? _favStore.items : []).find(x => x.key === key);
      if (!it) return;
      fillFavForm(shadow, it);
      setStatus(shadow, `✏️ تعديل «${it.code || it.name}» — غيّر ثم احفظ`, 'warn');
    };

    saveBtn.onclick = () => {
      saveFavEntry(shadow).catch(e => logEvent('FAV', 'حفظ ⭐: ' + (e.message || e)));
    };
    cancelBtn.onclick = () => clearFavForm(shadow);
    if (exportBtn) exportBtn.onclick = () => {
      exportFavoritesJson(shadow).catch(e => logEvent('FAV', 'تصدير ⭐: ' + (e.message || e)));
    };
    if (resetBtn) resetBtn.onclick = async () => {
      if (!_favResetArmed || (Date.now() - _favResetArmed > 4000)) {
        _favResetArmed = Date.now();
        setStatus(shadow, '⚠️ اضغط «استعادة» مرة أخرى لحذف كل قطع ⭐', 'warn');
        return;
      }
      _favResetArmed = 0;
      await saveFavStore({ version: 2, items: [] });
      clearFavForm(shadow);
      setStatus(shadow, '↩️ حُذفت كل قطع ⭐', 'success');
      logEvent('FAV', 'استعادة ⭐ (حذف الكل)');
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // لوحة مراجعة قبل اللصق: كود العطل + الضمان + ⭐ لكل قطعة
  // ════════════════════════════════════════════════════════════════════════════
  // ── ذاكرة اقتران مُثبتة بالتجربة: قطعة ← (رئيسي/فرعي) ───────────────────
  // تُسجَّل فقط بعد حفظ ناجح في البوابة (لا تخمين)، وتُستخدم كاقتراح قابل للتعديل.
  const PART_PAIRING_KEY = 'elaraby_part_pairing_v1';
  const PART_PAIRING_MAX = 300;

  function pairingKeyOf(sp) {
    const raw = String((sp && (sp.code || sp.name || sp.fullName)) || '').trim();
    return raw ? raw.replace(/\s+/g, ' ').toUpperCase() : '';
  }

  function readPairingCache() {
    try { return safeParseJSON(localStorage.getItem(PART_PAIRING_KEY), {}) || {}; } catch (_) { return {}; }
  }

  function recordPartPairing(sp, majorCode, subCode) {
    const key = pairingKeyOf(sp);
    if (!key || !majorCode || !subCode) return;
    try {
      const map = readPairingCache();
      map[key] = { majorCode, subCode, ts: Date.now() };
      const keys = Object.keys(map);
      if (keys.length > PART_PAIRING_MAX) {
        keys.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
        keys.slice(0, keys.length - PART_PAIRING_MAX).forEach(k => delete map[k]);
      }
      localStorage.setItem(PART_PAIRING_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  // 🚫 ذاكرة رفض: الزوج الذي فشل حفظه فعليًا لا يُقترح مرة أخرى تلقائيًا.
  //    تُسجَّل مع السبب، وتبقى للعلم — لا حذف صامت.
  function recordPartPairingFailure(sp, majorCode, subCode, reason) {
    const key = pairingKeyOf(sp);
    if (!key || !majorCode || !subCode) return;
    try {
      const map = readPairingCache();
      map[key] = {
        majorCode,
        subCode,
        ts: Date.now(),
        failed: true,
        reason: String(reason || 'failed').slice(0, 120),
        failedAt: Date.now()
      };
      const keys = Object.keys(map);
      if (keys.length > PART_PAIRING_MAX) {
        keys.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
        keys.slice(0, keys.length - PART_PAIRING_MAX).forEach(k => delete map[k]);
      }
      localStorage.setItem(PART_PAIRING_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function lookupPartPairing(sp) {
    const key = pairingKeyOf(sp);
    if (!key) return null;
    const rec = readPairingCache()[key];
    // الزوج الفاشل لا يُقترح — يُعرض في السجل فقط
    return (rec && rec.majorCode && rec.subCode && !rec.failed) ? rec : null;
  }

  // هل هذا الزوج بالتحديد مسجَّل فاشلًا لهذه القطعة؟
  function pairFailureOf(sp, majorCode, subCode) {
    const key = pairingKeyOf(sp);
    if (!key) return null;
    const rec = readPairingCache()[key];
    if (!rec || !rec.failed) return null;
    if (majorCode && subCode
      && !(sameCode(rec.majorCode, majorCode) && sameCode(rec.subCode, subCode))) return null;
    return rec;
  }

  // كود أول من نص صف البوابة: "RF1100 - (دائرة النوفروست)" ⇒ "RF1100"
  function codeTokenOf(text) {
    const t = String(text || '').trim();
    return (t.split(/\s*[-–—_]\s*/)[0] || '').trim();
  }

  // مقارنة كودين بعد إزالة المسافات وتوحيد الحالة (RF 1102 = RF1102)
  function sameCode(a, b) {
    const norm = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
    const A = norm(a);
    const B = norm(b);
    return !!A && !!B && A === B;
  }

  // سبب فشل مقروء للمستخدم — بدل رموز داخلية مبهمة في السجل/التقرير
  function partFailureReason(res) {
    const r = String(res?.reason || '');
    if (r === 'pair-inconsistent') {
      return `الزوج ${res.pair || '—'} غير متسق: القطعة «${res.part || ''}» غير موجودة في قائمة هذا الكود الفرعي`;
    }
    if (r === 'sub-mismatch') return `الكود الفرعي المختار «${res.picked || '—'}» ≠ المطلوب «${res.expected || '—'}»`;
    if (r === 'major-mismatch') return `الكود الرئيسي المختار «${res.picked || '—'}» ≠ المطلوب «${res.expected || '—'}»`;
    if (r === 'no-fault-code') return 'لا كود عطل مقترن — اربط الكود من اللوحة أولًا';
    if (r === 'need-major-and-sub') return 'كود بلا قطعة غيار — أضفه يدويًا من «اضافة كود عطل»';
    if (r === 'user-skipped') return 'أُلغي الاختيار يدويًا';
    if (r === 'cost-confirm') return 'الكود المكلِّف (بتكلفة) لم يُؤكَّد يدويًا — لا اختيار تلقائي';
    if (/^sub-no-match|^major-no-match/.test(r)) return 'الكود غير موجود في القائمة (حتى بكلمة الوصف)';
    if (/^part-/.test(r)) return 'قطعة الغيار غير موجودة في قائمة الكود الفرعي';
    return r || 'سبب غير معروف';
  }

  // ── 🪙 كلمات التكلفة (قاعدة تجارية مُثبتة من المالك) ─────────────────────
  // أي كود وصفه يحوي «بتكلفة» يُحتسب على العميل **بالتكلفة حتى لو داخل الضمان**.
  // لذلك لا يُقترح صامتًا أبدًا: يظهر بشارة 🪙 ويحتاج تأكيدًا يدويًا صريحًا.
  // القائمة قابلة للتوسعة من السجل إذا ظهرت صيغ أخرى.
  const COST_TRIGGER_WORDS = ['بتكلفة', 'بالتكلفة'];

  function hasCostTrigger(text) {
    const t = normalizeAr(text);
    if (!t) return false;
    return COST_TRIGGER_WORDS.some(w => t.includes(normalizeAr(w)));
  }

  function codeTextOf(code) {
    if (!code || typeof code !== 'object') return '';
    return [code.description, code.fullName, code.fullCode, code.majorName, code.defectCode]
      .filter(Boolean).join(' ');
  }

  function isCostCode(code) {
    if (!code || typeof code !== 'object') return false;
    if (code.cost === true) return true;
    return hasCostTrigger(codeTextOf(code));
  }

  // وسم دائم على الكود — يُحسب مرة واحدة عند الاستخراج ثم يُقرأ من اللوحات
  function markCostCode(code) {
    if (!code || typeof code !== 'object') return code;
    code.cost = hasCostTrigger(codeTextOf(code));
    return code;
  }

  function costBadge(code) {
    const b = document.createElement('span');
    b.className = 'cp-cost-badge';
    b.textContent = '🪙';
    b.title = 'وصف هذا الكود يحوي «بتكلفة» — يُحتسب على العميل حتى لو داخل الضمان. راجعه قبل الاستخدام.';
    return b;
  }

  function showPartsReview(shadow, jobs, allCodes) {
    const box = shadow.getElementById('cp-parts-review');
    if (!box) return Promise.resolve(jobs);
    box.innerHTML = '';
    return new Promise(resolve => {
      const state = jobs.map(j => ({
        sparePart: j.sparePart,
        faultCode: j.faultCode || null,
        source: j.faultCode ? 'bundle' : '',
        warranty: j.sparePart.warranty === 'out' ? 'out' : 'in'
      }));

      const codes = Array.isArray(allCodes) ? allCodes.filter(Boolean) : [];
      const selectors = [];
      const slots = [];

      // مفتاح الزوج = رئيسي|فرعي — الفرعيان المختلفان لا يُدمجان أبدًا
      // (RF3607 ضبط جوان الكابينة ≠ RF3606 ضبط جوان الفريزر، وكلاهما تحت RF3600).
      const codeKey = (c) => String((c && c.majorCode) || '').trim() + '|' + String((c && c.defectCode) || '').trim();
      const codeShortDesc = (c) => String((c && c.description) || '')
        .replace(/^[A-Za-z]{2}\d{3,4}\s*[-–—]\s*/, '')
        .replace(/^[()\s]+|[()\s]+$/g, '')
        .trim();
      const usageOf = (key) => state.filter(s => s.faultCode && codeKey(s.faultCode) === key).length;

      // ── تعبئة تلقائية قبل العرض (قرار المالك): لا قطعة بلا كود ───────────────
      // الترتيب: الحزمة (موجود) ← ⭐/ذاكرة مُثبتة ← كلمات الوصف ← احتياطي بالترتيب.
      // كل شيء قابل للتعديل؛ والوسم يُظهر مصدر كل اقتراح حتى تعرف ما تراجعه.
      {
        const usedKeys = new Set(state.filter(s => s.faultCode).map(s => codeKey(s.faultCode)));
        const loadOf = (c) => usageOf(codeKey(c));
        state.forEach(it => {
          if (it.faultCode) return;
          const pick = pickCodeForPart(it.sparePart, codes, { usedKeys, loadOf });
          if (!pick) return;
          it.faultCode = pick.code;
          it.source = pick.source;
          usedKeys.add(codeKey(pick.code));
          logEvent('PASTE_CODES', `🔗 اقتران ${it.sparePart.code || it.sparePart.name || 'قطعة'} ← ${codeKey(pick.code)} (${PAIR_SRC[pick.source]?.label || pick.source}${pick.score ? ' · ' + pick.score : ''})`);
        });
      }

      const autoCounts = () => ({
        keywords: state.filter(s => s.source === 'keywords').length,
        fallback: state.filter(s => s.source === 'fallback').length
      });

      let dragState = null;   // { key, from } — from = فهرس القطعة (أو -1 من القائمة)
      let armed = null;       // كود ملتقط بالنقر (بديل السحب للجوال/بلا ماوس)
      let costArmed = false;  // 🪙 نقرة أولى تحذّر بالتكلفة، والثانية تنفّذ
      let okBtnRef = null;

      const resetCostArm = () => {
        if (!costArmed) return;
        costArmed = false;
        if (okBtnRef) okBtnRef.textContent = '▶ تنفيذ اللصق';
      };

      const hint = document.createElement('div');
      hint.className = 'cp-review-hint';
      box.appendChild(hint);

      const pool = document.createElement('div');
      pool.className = 'cp-code-pool';
      pool.title = 'أكواد الأعطال المنسوخة — اسحب كودًا إلى القطعة، أو من قطعة إلى أخرى للتبديل';
      box.appendChild(pool);

      const refreshHint = () => {
        const unlinked = codes.filter(c => usageOf(codeKey(c)) === 0).length;
        const counts = autoCounts();
        hint.textContent = `${state.length} قطعة · ${codes.length} كود عطل · ${unlinked} بلا قطعة`
          + (counts.keywords ? ` · 🔑 ${counts.keywords} مطابقة وصف` : '')
          + (counts.fallback ? ` · 🤖 ${counts.fallback} احتياطي` : '')
          + (codes.length ? ' — راجع ثم صحّح بالسحب أو القائمة' : '');
      };

      const makeChip = (code, opts) => {
        const o = opts || {};
        const key = codeKey(code);
        const chip = document.createElement('span');
        chip.className = 'cp-code-chip' + (usageOf(key) > 0 ? ' used' : '') + (armed === key ? ' armed' : '');
        chip.draggable = true;
        chip.dataset.key = key;
        chip.appendChild(document.createTextNode(String(code.fullCode || code.defectCode || key)));
        const desc = codeShortDesc(code);
        if (desc) {
          const d = document.createElement('small');
          d.textContent = desc.slice(0, 40);
          chip.appendChild(d);
        }
        if (isCostCode(code)) {
          chip.classList.add('cost');
          chip.appendChild(costBadge(code));
        }
        if (!o.inSlot) {
          const n = usageOf(key);
          if (n > 1) {
            const u = document.createElement('small');
            u.textContent = '×' + n;
            chip.appendChild(u);
          }
        }
        chip.addEventListener('dragstart', (ev) => {
          try {
            ev.dataTransfer.setData('text/plain', key);
            ev.dataTransfer.effectAllowed = 'copyMove';
          } catch (_) {}
          chip.classList.add('dragging');
          dragState = { key, from: o.from == null ? -1 : o.from };
        });
        chip.addEventListener('dragend', () => {
          chip.classList.remove('dragging');
          dragState = null;
          slots.forEach(s => s.classList.remove('drag-over'));
          pool.classList.remove('drag-over');
        });
        chip.addEventListener('click', (ev) => {
          if (o.inSlot) return;                 // داخل خانة: الإزالة بزر ✕
          ev.stopPropagation();
          armed = (armed === key) ? null : key;
          refreshAll();
        });
        return chip;
      };

      const assign = (index, code, src, moveFrom) => {
        if (moveFrom != null && moveFrom >= 0 && moveFrom !== index) {
          state[moveFrom].faultCode = null;
          state[moveFrom].source = '';
        }
        state[index].faultCode = code;
        state[index].source = src || 'manual';
        armed = null;
        resetCostArm();
        refreshAll();
      };

      const unassign = (index) => {
        state[index].faultCode = null;
        state[index].source = '';
        armed = null;
        resetCostArm();
        refreshAll();
      };

      const SOURCE_LABEL = {
        bundle: ['📋', 'من الحزمة المنسوخة'],
        fav: ['⭐', 'من ⭐ المفضلة'],
        memory: ['🧠', 'من ذاكرة اقتران مُثبتة'],
        keywords: ['🔑', 'مطابقة كلمات الوصف — راجع'],
        fallback: ['🤖', 'احتياطي بالترتيب — راجع'],
        manual: ['✋', 'اختيار يدوي']
      };

      const renderSlot = (index) => {
        const it = state[index];
        const slot = slots[index];
        if (!slot) return;
        slot.innerHTML = '';
        slot.className = 'cp-part-slot' + (it.faultCode ? ' filled' : '');
        if (it.faultCode) {
          slot.appendChild(makeChip(it.faultCode, { inSlot: true, from: index }));
          const meta = SOURCE_LABEL[it.source] || SOURCE_LABEL.manual;
          const badge = document.createElement('span');
          badge.className = 'cp-part-src';
          badge.textContent = meta[0];
          badge.title = meta[1];
          slot.appendChild(badge);
          const x = document.createElement('button');
          x.type = 'button';
          x.className = 'cp-slot-x';
          x.textContent = '✕';
          x.title = 'إزالة الربط (يعود الكود للقائمة)';
          x.onclick = (ev) => { ev.stopPropagation(); unassign(index); };
          slot.appendChild(x);
        } else {
          slot.appendChild(document.createTextNode('— اسحب كود العطل هنا —'));
        }
      };

      const refreshAll = () => {
        pool.innerHTML = '';
        if (!codes.length) {
          const none = document.createElement('span');
          none.style.cssText = 'color:#f87171;font-size:10px';
          none.textContent = 'لا توجد أكواد أعطال في الحزمة — انسخ البلاغ كاملًا ثم أعد اللصق';
          pool.appendChild(none);
        } else {
          codes.forEach(c => pool.appendChild(makeChip(c, {})));
        }
        slots.forEach((_, i) => renderSlot(i));
        selectors.forEach(({ sel, it }) => {
          const key = it.faultCode ? codeKey(it.faultCode) : '';
          let idx = 0;
          for (let k = 1; k < sel.options.length; k++) {
            if (sel.options[k].dataset.key === key) { idx = k; break; }
          }
          sel.selectedIndex = idx;
          sel.style.outline = '';
        });
        refreshHint();
      };

      // إفلات على القائمة = فكّ الربط (الرجوع للوضع المستقل)
      pool.addEventListener('dragover', (ev) => { ev.preventDefault(); pool.classList.add('drag-over'); });
      pool.addEventListener('dragleave', () => pool.classList.remove('drag-over'));
      pool.addEventListener('drop', (ev) => {
        ev.preventDefault();
        pool.classList.remove('drag-over');
        const from = dragState ? dragState.from : -1;
        if (from >= 0) unassign(from);
      });

      state.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'cp-part-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'cp-part-name';
        const codeTxt = it.sparePart.code || simplifySearchText(it.sparePart.fullName || '') || '';
        nameEl.textContent = `${i + 1}. ${codeTxt}${it.sparePart.name ? ' — ' + it.sparePart.name : ''} ×${it.sparePart.qty || 1}`;
        row.appendChild(nameEl);

        const ctl = document.createElement('div');
        ctl.className = 'cp-part-ctl';

        // خانة الإفلات: هدف السحب لكل قطعة (السحب = زوج العطل كاملًا)
        const slot = document.createElement('div');
        slot.className = 'cp-part-slot';
        slot.addEventListener('dragover', (ev) => { ev.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', (ev) => {
          ev.preventDefault();
          slot.classList.remove('drag-over');
          const key = dragState ? dragState.key : (ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '');
          const code = codes.find(c => codeKey(c) === key);
          if (!code) return;
          const from = dragState ? dragState.from : -1;
          // من قائمة الأكواد = ربط جديد · من قطعة أخرى = نقل/تبديل
          assign(i, code, from >= 0 ? (state[from].source || 'manual') : 'manual', from);
        });
        slot.addEventListener('click', () => {
          if (!armed) return;
          const code = codes.find(c => codeKey(c) === armed);
          if (code) assign(i, code, 'manual', -1);
        });
        slots[i] = slot;
        ctl.appendChild(slot);

        if (codes.length) {
          const sel = document.createElement('select');
          const emptyOpt = document.createElement('option');
          emptyOpt.value = '';
          emptyOpt.textContent = '— اختر كود العطل —';
          sel.appendChild(emptyOpt);
          codes.forEach(c => {
            const o = document.createElement('option');
            o.dataset.key = codeKey(c);
            o.value = codeKey(c);
            o.textContent = String(c.fullCode || c.defectCode || c.majorCode || '(بدون كود)')
              + (isCostCode(c) ? ' 🪙' : '');
            sel.appendChild(o);
          });
          sel.value = '';
          sel.onchange = () => {
            sel.style.outline = '';
            const code = codes.find(c => codeKey(c) === sel.value);
            if (!code) { unassign(i); return; }
            assign(i, code, 'manual', -1);
          };
          selectors.push({ sel, it });
          ctl.appendChild(sel);
        } else {
          it.faultCode = null;
          const none = document.createElement('span');
          none.style.cssText = 'color:#64748b;font-size:10px';
          none.textContent = 'بدون كود عطل';
          ctl.appendChild(none);
        }

        const bIn = document.createElement('button');
        bIn.type = 'button'; bIn.className = 'cp-w-btn'; bIn.textContent = 'داخل';
        const bOut = document.createElement('button');
        bOut.type = 'button'; bOut.className = 'cp-w-btn'; bOut.textContent = 'خارج';
        const syncW = () => {
          bIn.className = 'cp-w-btn' + (it.warranty === 'in' ? ' on' : '');
          bOut.className = 'cp-w-btn' + (it.warranty === 'out' ? ' on-out' : '');
        };
        bIn.onclick = () => { it.warranty = 'in'; syncW(); };
        bOut.onclick = () => { it.warranty = 'out'; syncW(); };
        syncW();
        ctl.appendChild(bIn);
        ctl.appendChild(bOut);

        const star = document.createElement('button');
        star.type = 'button';
        const favNow = favFindItem(it.sparePart);
        star.className = 'cp-star' + (favNow ? ' on' : '');
        star.textContent = '★';
        star.title = (favNow && favNow.comment)
          ? `⭐ ${favNow.comment}`
          : 'تمييز كقطعة شائعة (تُعدَّل من تبويب ⭐ قطع)';
        star.onclick = async () => {
          star.disabled = true;
          try {
            const linked = it.faultCode || {};
            const on = await toggleFavPart({
              ...it.sparePart,
              qty: it.sparePart.qty || 1,
              warranty: it.warranty,
              family: favFamilyFor(it.sparePart),
              majorCode: linked.majorCode || it.sparePart.majorCode || '',
              subCode: linked.defectCode || it.sparePart.subCode || ''
            });
            star.className = 'cp-star' + (on ? ' on' : '');
            if (on) setStatus(shadow, '⭐ حُفظت القطعة — عدّلها من تبويب «⭐ قطع»', 'success');
          } catch (e) {
            setStatus(shadow, '⚠️ تعذّر حفظ ⭐: ' + (e.message || e), 'warn');
          } finally {
            star.disabled = false;
          }
        };
        ctl.appendChild(star);

        row.appendChild(ctl);
        box.appendChild(row);
      });

      refreshAll();

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;margin-top:7px';
      const okBtn = document.createElement('button');
      okBtn.type = 'button'; okBtn.className = 'cp-btn cp-btn-exec'; okBtn.style.flex = '1'; okBtn.textContent = '▶ تنفيذ اللصق';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button'; cancelBtn.className = 'cp-btn'; cancelBtn.style.cssText = 'flex:1;background:#334466'; cancelBtn.textContent = '✕ إلغاء';
      const finish = (val) => {
        box.style.display = 'none';
        box.innerHTML = '';
        resolve(val);
      };
      okBtnRef = okBtn;
      okBtn.onclick = () => {
        // لا تنفيذ بقطعة بلا كود عطل: نموذج القطعة يحتاج الرئيسي + الفرعي ليحفظ
        const missing = state.filter(s => !s.faultCode);
        if (missing.length) {
          resetCostArm();
          slots.forEach((s, idx) => { if (!state[idx].faultCode) s.classList.add('missing'); });
          const names = missing.map(s => s.sparePart.code || s.sparePart.name || 'قطعة').slice(0, 3).join('، ');
          setStatus(shadow, (!allCodes || !allCodes.length)
            ? '⚠️ لا توجد أكواد أعطال في الحزمة — انسخ البلاغ كاملًا (أكواد + قطع) ثم أعد اللصق'
            : `⚠️ ${missing.length} قطعة بلا كود عطل (${names}${missing.length > 3 ? '…' : ''}) — اختر كودًا لكل قطعة`, 'warn');
          return;
        }
        // 🪙 بوابة التكلفة: الكود الذي وصفه يحوي «بتكلفة» يُحتسب على العميل حتى داخل الضمان
        const costCodes = state.filter(s => isCostCode(s.faultCode));
        if (costCodes.length && !costArmed) {
          costArmed = true;
          okBtn.textContent = `🪙 تأكيد التكلفة والتنفيذ (${costCodes.length})`;
          const names = costCodes
            .map(s => String(s.faultCode.fullCode || s.faultCode.defectCode || '—'))
            .slice(0, 4).join('، ');
          setStatus(shadow, `🪙 ${costCodes.length} كود وصفه يحوي «بتكلفة» (${names}) — يُحتسب على العميل حتى لو داخل الضمان. اضغط «تأكيد التكلفة والتنفيذ» للمتابعة`, 'warn');
          logEvent('PASTE_CODES', `🪙 تأكيد تكلفة مطلوب: ${costCodes.map(s => s.sparePart.code || s.sparePart.name).join(' · ')}`);
          return;
        }
        // التأكيد صار صريحًا ⇒ يُمرَّر للتنفيذ حتى لا يُطلب مرة أخرى في البحث
        state.forEach(s => {
          if (s.faultCode && isCostCode(s.faultCode)) s.faultCode = { ...s.faultCode, cost: true, costConfirmed: true };
        });
        finish(state);
      };
      cancelBtn.onclick = () => finish(null);
      actions.appendChild(okBtn);
      actions.appendChild(cancelBtn);
      box.appendChild(actions);

      box.style.display = 'block';
    });
  }

  // ── صيغ البحث في نافذة lookup ─────────────────────────────────────────
  // البوابة تبحث بالكود كما هو، أما النص العربي/الوصف فلا يُطابق إلا بـ *…*
  // (تحقق حي 2026-10-26: "كباس" → 0 صفوف، "*كباس*" → صفّان RF1200/RF1300).
  // نجرب الصيغة الأرجح أولًا ثم الأخرى قبل اللجوء إلى «عرض كل الخيارات».
  function lookupSearchVariants(value) {
    const v = String(value || '').trim();
    if (!v) return [];
    const bare = v.replace(/^\*+|\*+$/g, '').trim();
    if (!bare) return [];
    const isCode = /^[A-Za-z0-9][A-Za-z0-9._\-\/]*$/.test(bare) && /[0-9]/.test(bare);
    const variants = isCode ? [bare, '*' + bare + '*'] : ['*' + bare + '*', bare];
    return Array.from(new Set(variants));
  }

  // ── البحث بكلمة من الوصف (بالنجمة) — الدور الثالث فقط ────────────────────
  // البوابة لا تطابق النص العربي إلا بـ *…* (تحقق حي: "كباس" → 0، "*كباس*" → 2).
  // يُستخدم فقط عند فشل البحث بالكود. والاختيار يبقى بالكود حرفيًا:
  // نقرأ كود العطل من الصف نفسه، والوصف لا يُختار به أبدًا.
  const DESC_STOP_WORDS = /^(تم|في|من|على|الى|إلى|او|أو|و|مع|غير|بدون|كود|عطل|العطل|اخر|آخر|the|of|and|for|with|none|other)$/i;

  function lookupDescriptionWords(description, max) {
    const raw = String(description || '')
      .replace(/^[A-Za-z]{2}\s?\d{3,4}\s*[-–—_]\s*/, '')   // كود البداية
      .replace(/[()]/g, ' ')
      .trim();
    if (!raw) return [];
    const seen = new Set();
    const out = [];
    raw.split(/[^\p{L}\p{N}]+/u).forEach(w => {
      const t = String(w || '').trim();
      if (t.length < 3) return;
      if (/^\d+$/.test(t)) return;
      if (/^[A-Za-z]{2}\d{3,4}$/i.test(t)) return;          // كود لا كلمة
      if (DESC_STOP_WORDS.test(t)) return;
      const k = normalizeAr(t);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(t);
    });
    return out.slice(0, max || 4);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // محرّك الاقتران التلقائي (قرار المالك 2026-10-26)
  //   القاعدة: **لكل قطعة غيار كود عطل** — والعكس غير مطلوب (كود بلا قطعة مسموح،
  //   لأن كود العطل الواحد قد يشمل أكثر من قطعة).
  //   الترتيب: ⭐/ذاكرة مُثبتة ← مطابقة كلمات الوصف ← احتياطي بالترتيب.
  //   كل النتائج اقتراح قابل للتعديل من لوحة المراجعة — لا حفظ بلا مراجعة.
  // ════════════════════════════════════════════════════════════════════════════
  const PAIR_SRC = {
    bundle:   { icon: '📋', label: 'من الحزمة المنسوخة' },
    fav:      { icon: '⭐', label: 'من ⭐ المفضلة' },
    memory:   { icon: '🧠', label: 'من ذاكرة اقتران مُثبتة' },
    keywords: { icon: '🔑', label: 'مطابقة كلمات الوصف' },
    fallback: { icon: '🤖', label: 'احتياطي بالترتيب — راجع' },
    manual:   { icon: '✋', label: 'اختيار يدوي' }
  };

  // كلمات دلالية من نص (عربي/لاتيني) بلا أكواد ولا أرقام ولا كلمات وقف
  function matchWordsOf(text, max) {
    const raw = String(text || '').replace(/[()\[\]{}]/g, ' ');
    const seen = new Set();
    const out = [];
    raw.split(/[^\p{L}\p{N}]+/u).forEach(w => {
      const t = String(w || '').trim();
      if (t.length < 3) return;
      if (/^\d+$/.test(t)) return;
      if (/^[A-Za-z]{2}\d{3,4}$/i.test(t)) return;      // كود لا كلمة
      if (DESC_STOP_WORDS.test(t)) return;
      const k = normalizeAr(t);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(k);
    });
    return out.slice(0, max || 6);
  }

  // نص الكود كاملًا (وصف + أسماء + أكواد) بعد التطبيع — للبحث الدلالي
  function codeSearchText(code) {
    if (!code || typeof code !== 'object') return '';
    return normalizeAr([code.description, code.fullName, code.fullCode, code.majorName, code.defectCode]
      .filter(Boolean).join(' '));
  }

  // درجة تطابق كلمات القطعة داخل نص كود العطل
  function keywordScoreOf(partWords, code) {
    if (!partWords || !partWords.length) return 0;
    const hay = codeSearchText(code);
    if (!hay) return 0;
    let score = 0;
    partWords.forEach(w => { if (hay.includes(w)) score += 1; });
    return score;
  }

  // كلمات القطعة الدلالية: الاسم العربي إن وُجد، وإلا يُفكّك fullName
  function partWordsOf(part) {
    if (!part) return [];
    const name = String(part.name || '').trim()
      || parsePartName(part.fullName || '').name
      || '';
    return matchWordsOf(name, 6);
  }

  // هل هذا الزوج مسجَّل فاشلًا لهذه القطعة؟ (لا يُقترح أبدًا)
  function isFailedPairFor(part, code) {
    if (!part || !code) return false;
    const rec = pairFailureOf(part, code.majorCode, code.defectCode);
    return !!rec;
  }

  // يختار كود عطل لقطعة بلا كود. يُرجع { code, source, score } أو null.
  // opts: { usedKeys:Set, loadOf(fn), allowFallback:boolean }
  function pickCodeForPart(part, codes, opts) {
    const o = opts || {};
    if (!part || !Array.isArray(codes) || codes.length === 0) return null;
    const keyOf = (c) => copyBoardCodeKey(c);

    // (١) ⭐ ثم الذاكرة المُثبتة — بيانات مؤكَّدة مسبقًا، تُقدَّم على أي مطابقة نصية
    let fav = null;
    try { fav = favFindItem(part); } catch (_) { fav = null; }
    const mem = lookupPartPairing(part);
    const proven = [
      { src: 'fav', majorCode: (fav && fav.majorCode) || part.majorCode, subCode: (fav && fav.subCode) || part.subCode },
      mem ? { src: 'memory', majorCode: mem.majorCode, subCode: mem.subCode } : null
    ];
    for (const cand of proven) {
      if (!cand) continue;
      const major = String(cand.majorCode || '').trim();
      const sub = String(cand.subCode || '').trim();
      if (!major || !sub) continue;
      if (pairFailureOf(part, major, sub)) continue;      // زوج فاشل سابقًا
      const match = codes.find(c => String(c.majorCode || '').trim() === major
        && String(c.defectCode || '').trim() === sub);
      if (match) return { code: match, source: cand.src, score: 99 };
    }

    // (٢) مطابقة كلمات الوصف: اسم القطعة ↔ وصف كود العطل (قرار المالك)
    const words = partWordsOf(part);
    if (words.length) {
      const scored = codes
        .map(c => ({ code: c, score: keywordScoreOf(words, c) }))
        .filter(x => x.score > 0 && !isFailedPairFor(part, x.code))
        .sort((a, b) => b.score - a.score);
      if (scored.length) return { code: scored[0].code, source: 'keywords', score: scored[0].score };
    }

    // (٣) احتياطي: لا قطعة بلا كود ⇒ كود غير مستخدم أولًا، وإلا الأقل تحميلًا
    if (o.allowFallback === false) return null;
    const used = o.usedKeys || new Set();
    const loadOf = typeof o.loadOf === 'function' ? o.loadOf : () => 0;
    const safe = codes.filter(c => !isFailedPairFor(part, c));
    const unused = safe.find(c => !used.has(keyOf(c)));
    if (unused) return { code: unused, source: 'fallback', score: 0 };
    const least = safe.slice().sort((a, b) => loadOf(a) - loadOf(b))[0];
    return least ? { code: least, source: 'fallback', score: 0 } : null;
  }

  // تعبئة قائمة قطع/أكواد (تُعدّل الكائنات في مكانها) — تُرجع عدد المُعبّأ
  function autoPairParts(parts, codes, opts) {
    const o = opts || {};
    const list = Array.isArray(parts) ? parts : [];
    const keyOf = (c) => copyBoardCodeKey(c);
    const usedKeys = o.usedKeys || new Set();
    const loadOf = typeof o.loadOf === 'function' ? o.loadOf : () => 0;
    let filled = 0;
    list.forEach(p => {
      if (!p || (p.majorCode && p.subCode)) return;
      const pick = pickCodeForPart(p, codes, { usedKeys, loadOf, allowFallback: o.allowFallback });
      if (!pick) return;
      p.majorCode = String(pick.code.majorCode || '').trim();
      p.subCode = String(pick.code.defectCode || '').trim();
      p.pairSource = pick.source;
      p.pairScore = pick.score;
      usedKeys.add(keyOf(pick.code));
      filled++;
    });
    return filled;
  }

  // أكواد العطل المكتوبة داخل نص الصف — تُقرأ كما تُعرض (تسامح مسافة: "RF 1102")
  const ROW_CODE_RE = /(?<![A-Za-z0-9])([A-Za-z]{2})\s?(\d{3,4})(?:[-_]([A-Za-z0-9]{1,3}))?(?![A-Za-z0-9])/g;

  function codesInRowText(text) {
    const out = [];
    const s = String(text || '');
    ROW_CODE_RE.lastIndex = 0;
    let m;
    while ((m = ROW_CODE_RE.exec(s)) !== null) {
      const base = (m[1] + m[2]).toUpperCase();
      out.push(base);
      if (m[3]) out.push((base + '-' + m[3]).toUpperCase());
    }
    return out;
  }

  function rowMatchesCode(text, code) {
    const want = String(code || '').replace(/\s+/g, '').toUpperCase();
    if (!want) return false;
    return codesInRowText(text).includes(want);
  }

  async function fillIframeLookup(iframeDoc, inputId, searchValue, opts = {}) {
    if (!iframeDoc || !inputId) return { ok: false, reason: 'معاملات البحث غير صالحة' };
    const input = iframeDoc.getElementById(inputId);
    if (!input) return { ok: false, reason: `الحقل ${inputId} غير موجود في النموذج` };

    const group = input.closest('.input-group') || input.parentElement;
    const launchBtn = group?.querySelector('button.launchentitylookup') || 
                      group?.querySelector('button[aria-label*="Launch"], button[title*="Launch"]') ||
                      group?.querySelectorAll('button')[1] ||
                      group?.querySelector('button');

    if (!launchBtn) return { ok: false, reason: `زر فتح البحث لـ ${inputId} غير موجود` };

    // تفريغ القيمة السابقة (نص + GUID) — وإلا قد تتخطى البوابة البحث وتُبقي القديم
    const clearBtn = group.querySelector('button[aria-label*="Clear"], button[title*="Clear"], button[aria-label*="مسح"], button[title*="مسح"]');
    if (clearBtn && (input.value || findIframeLookupGuid(iframeDoc, inputId))) {
      await safeClick(clearBtn);
      await sleep(400);
    }

    logEvent('PASTE_CODES', `فتح نافذة البحث لـ ${inputId}: "${searchValue}"`);
    await safeClick(launchBtn);
    await sleep(1500);

    // البحث عن نافذة الـ lookup داخل iframeDoc تحديداً لمنع التداخل مع المودال الخارجي
    let lookupModal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const modals = Array.from(iframeDoc.querySelectorAll('.modal.modal-lookup, .modal'));
      lookupModal = modals.find(m => {
        if (!m.classList.contains('modal-lookup')) return false;
        return m.classList.contains('in') || m.classList.contains('show') || window.getComputedStyle(m).display === 'block';
      });
      if (lookupModal) break;
      await sleep(350);
    }

    if (!lookupModal) {
      logEvent('PASTE_CODES', `نافذة البحث لـ ${inputId} لم تظهر`);
      return { ok: false, reason: `نافذة البحث لـ ${inputId} لم تظهر` };
    }

    const searchInput = lookupModal.querySelector('.query, input[type="text"]');
    const searchBtn = lookupModal.querySelector('button[aria-label="Search Results"], button[title="Search Results"]') ||
                      lookupModal.querySelector('button.search-btn, button.btn-default');

    let cleanSearch = (searchValue || '').trim();
    if (cleanSearch.includes('(')) {
      cleanSearch = cleanSearch.split('(')[0].trim();
    }
    const partsWithSpaces = cleanSearch.split(/\s+[-–—_]\s+/);
    if (partsWithSpaces.length > 1) {
      cleanSearch = partsWithSpaces[0].trim();
    }
    if (!cleanSearch) cleanSearch = simplifySearchText(searchValue);

    // قراءة صفوف النتائج الظاهرة فعلًا (getClientRects: offsetParent يفشل مع عناصر position:fixed)
    const readRows = () => Array.from(lookupModal.querySelectorAll('table tbody tr')).filter(r => {
      try {
        if (!r.getClientRects().length) return false;
        const txt = (r.innerText || '').trim();
        return txt.length > 0 && !/no\s*records|لا\s*توجد/i.test(txt);
      } catch(_) { return false; }
    });

    // كتابة نص البحث + تنفيذ البحث (بأحداث من عالم الـ iframe نفسه)
    const runSearch = async (value) => {
      const view = iframeDoc.defaultView || window;
      searchInput.value = value;
      try { searchInput.dispatchEvent(new view.Event('input', { bubbles: true })); } catch(_) {}
      try { searchInput.dispatchEvent(new view.Event('change', { bubbles: true })); } catch(_) {}
      await safeClick(searchBtn);
      await sleep(1800);
    };

    let rows = [];
    if (cleanSearch && searchInput && searchBtn) {
      for (const variant of lookupSearchVariants(cleanSearch)) {
        logEvent('PASTE_CODES', `كتابة نص البحث (${inputId}): "${variant}"`);
        await runSearch(variant);
        rows = readRows();
        if (rows.length > 0) {
          logEvent('PASTE_CODES', `${inputId}: صيغة البحث الناجحة "${variant}" — ${rows.length} نتيجة`);
          break;
        }
        logEvent('PASTE_CODES', `لا نتائج لـ "${variant}" في ${inputId} — تجربة الصيغة التالية`);
      }
    }

    // لو لم تظهر نتائج بأي صيغة، مسح حقل البحث وعرض كل السجلات المتاحة للموديل/العطل.
    // ⚠️ يُمنع في الحقول المرتبطة (opts.noShowAll): قائمة الكود الفرعي غير مقيّدة بالكود
    // الرئيسي (تحقق حي 2026-10-26: بعد اختيار RF1100 ظهرت RF1025..RF1035 من عائلة RF1000)،
    // فـ«عرض الكل» يعرض عائلات أخرى ويُغري باختيار كود غير تابع.
    if (rows.length === 0 && searchInput && searchBtn && !opts.noShowAll) {
      logEvent('PASTE_CODES', `لا توجد نتائج لـ "${cleanSearch}"، جاري مسح البحث وعرض كل الخيارات المتاحة`);
      await runSearch('');
      rows = readRows();
    }

    const target = (opts.exactText || searchValue || cleanSearch || '').trim();
    // الدور الثالث لا معنى له إلا إذا كان المطلوب كودًا فعليًا (لا نص صف)
    const targetIsCode = /^[A-Za-z]{2}\s?\d{3,4}(?:[-_][A-Za-z0-9]{1,3})?$/.test(target);

    // ── الدور الثالث: البحث بكلمة من الوصف بالنجمة (فقط عند فشل الكود) ──
    // مسح متسلسل: أول صف يحمل الكود المطلوب حرفيًا يُختار، وغيره يُرفض ويُسجَّل.
    let descTried = [];
    if (targetIsCode && !rows.some(r => rowMatchesCode(r.innerText || '', target))) {
      const descWords = Array.isArray(opts.descriptionWords) ? opts.descriptionWords : [];
      if (descWords.length && searchInput && searchBtn) {
        let descRows = [];
        for (const word of descWords) {
          const variant = '*' + word + '*';
          logEvent('PASTE_CODES', `الوصف (${inputId}): "${variant}"`);
          await runSearch(variant);
          const cand = readRows();
          descTried.push(`${variant}:${cand.length}`);
          if (!cand.length) continue;
          descRows = cand;
          const hit = cand.find(r => rowMatchesCode(r.innerText || '', target));
          if (hit) {
            rows = [hit];
            logEvent('PASTE_CODES', `✅ ${inputId}: وُجد بالوصف "${variant}" — الصف يحمل الكود ${target} حرفيًا`);
            break;
          }
          const codes = Array.from(new Set(cand.map(r => codesInRowText(r.innerText || '').join('/')).filter(Boolean)));
          logEvent('PASTE_CODES', `⛔ ${inputId}: "${variant}" أرجعت ${cand.length} صفًا بلا الكود ${target} — أكواد موجودة: ${codes.slice(0, 8).join(' · ') || '—'}`);
        }
        // لا مطابقة حرفية ⇒ نعرض ما وُجد كبدائل فقط (لا اختيار تلقائي)
        if (!rows.some(r => rowMatchesCode(r.innerText || '', target)) && descRows.length) {
          rows = descRows;
          logEvent('PASTE_CODES', `⚠️ ${inputId}: لا صف يحمل ${target} بعد ${descTried.length} صيغة وصف — البدائل تُعرض للمستخدم (لا اختيار تلقائي)`);
        }
      }
    }

    if (rows.length === 0) {
      logEvent('PASTE_CODES', `لا توجد صفوف نتائج في بحث ${inputId} عن "${cleanSearch}"`);
      await closeLookupModalInDoc(lookupModal);
      return { ok: false, reason: `لا توجد نتائج مطابقة لـ "${cleanSearch}"`, descTried };
    }

    // ── مطابقة مرتّبة بالنقاط: لا «أول صف» أعمى أبدًا ──
    const scored = rows
      .map(r => ({ row: r, text: (r.innerText || '').trim(), score: scoreLookupRow(r.innerText || '', target) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best || best.score < 50) {
      const available = scored.slice(0, 25).map(s => ({ text: s.text, cost: hasCostTrigger(s.text) }));
      logEvent('PASTE_CODES', `⚠️ ${inputId}: لا مطابقة كافية لـ "${target}" (أعلى نتيجة ${best ? best.score : 0}%) — ${available.length} بديل متاح`);
      await closeLookupModalInDoc(lookupModal);
      return { ok: false, reason: 'no-match', searched: target, available };
    }

    // 🪙 بوابة التكلفة: لا اختيار تلقائي لكود وصفه يحوي «بتكلفة».
    //    القاعدة التجارية: هذا الكود يُحتسب على العميل بالتكلفة حتى لو داخل الضمان.
    //    الاختيار اليدوي من القائمة (بشارة 🪙) هو التأكيد الصريح الوحيد المقبول.
    if (!opts.allowCost && hasCostTrigger(best.text)) {
      const available = scored.slice(0, 25).map(s => ({ text: s.text, cost: hasCostTrigger(s.text) }));
      logEvent('PASTE_CODES', `🪙 ${inputId}: أفضل صف يحوي «بتكلفة» — لا اختيار تلقائي، تأكيد يدوي مطلوب`);
      await closeLookupModalInDoc(lookupModal);
      return { ok: false, reason: 'cost-confirm', searched: target, available, cost: true };
    }

    logEvent('PASTE_CODES', `${inputId}: اختيار "${best.text.slice(0, 70)}" (مطابقة ${best.score}%)`);
    await safeClick(best.row);
    const radio = best.row.querySelector('input[type="radio"], input[type="checkbox"]');
    if (radio) {
      radio.checked = true;
      try { radio.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    }

    await sleep(400);

    const selectBtn = Array.from(lookupModal.querySelectorAll('button, input[type="button"]')).find(b => {
      const t = (b.innerText || b.getAttribute('aria-label') || b.title || b.value || '').trim();
      return /^(اختر|select)$/i.test(t) || (b.classList.contains('btn-primary') && !/بحث|search/i.test(t));
    }) || lookupModal.querySelector('button.btn-primary, button.primary, button[aria-label*="Select"], button[title*="Select"], button[aria-label*="اختر"], button[title*="اختر"]');

    if (!selectBtn) {
      await closeLookupModalInDoc(lookupModal);
      return { ok: false, reason: 'زر «اختر» غير موجود في نافذة البحث' };
    }

    selectBtn.removeAttribute('disabled');
    selectBtn.classList.remove('disabled');
    clickOnceSafe(selectBtn);           // نقرة واحدة (كانت مرتين)

    const lookupCloseDeadline = Date.now() + 8000;
    while (Date.now() < lookupCloseDeadline) {
      if (!isModalOpenSafe(lookupModal) || !iframeDoc.body.contains(lookupModal)) break;
      await sleep(300);
    }

    await sleep(1000);

    // ── تحقق فعلي: النص + GUID المخفي (نفس قاعدة الصفحة الأولى) ──
    const finalVal = String(input.value || '').trim();
    const guidEl = findIframeLookupGuid(iframeDoc, inputId);
    if (!finalVal) {
      logEvent('PASTE_CODES', `❌ ${inputId}: الحقل فارغ بعد الاختيار`);
      return { ok: false, reason: 'lookup-not-committed', selected: best.text };
    }
    if (guidEl && !String(guidEl.value || '').trim()) {
      logEvent('PASTE_CODES', `❌ ${inputId}: "${finalVal}" معروض بلا GUID — لم يُثبَّت الاختيار`);
      return { ok: false, reason: 'lookup-not-committed', selected: finalVal };
    }

    logEvent('PASTE_CODES', `✅ ${inputId}: "${finalVal}"`);
    return { ok: true, val: finalVal, selected: finalVal, score: best.score };
  }

  // ════════════════════════════════════════════════════════════════════
  //  زر حفظ النموذج داخل iframe — مصدر واحد للموضعين
  //  (إضافة قطعة غيار / إضافة كود عطل)
  //  ⚠️ لا تستخدم querySelector('#InsertButton, …, button.btn-primary'):
  //  قائمة المحدّدات ترجع أول عنصر في ترتيب الـDOM، وزر «اختر» المخفي لمودال
  //  الـlookup يسبق «حفظ» ⇒ يُضغط زر مخفي، فلا يُحفظ النموذج، ثم يُلغى بعد
  //  مهلة الـ15 ثانية. نفس الفخ الموثّق في engine-lookups.js:230-241.
  // ════════════════════════════════════════════════════════════════════
  const SAVE_READY_TIMEOUT_MS = 4000;   // انتظار جاهزية الزر/زوال السبينر
  const SAVE_CLOSE_TIMEOUT_MS = 15000;  // انتظار إغلاق النموذج بعد النقر
  const SAVE_BUSY_GRACE_MS = 8000;      // مهلة إضافية لو البوابة لا تزال «مشغولة»
  const SAVE_MAX_ATTEMPTS = 2;          // مرشحان كحد أقصى (منع الحفظ المزدوج)

  // عنصر مرئي فعلًا؟ (offsetParent وحده يفشل مع position:fixed)
  function isElementVisible(el) {
    if (!el) return false;
    try {
      if (typeof el.getClientRects === 'function' && el.getClientRects().length) return true;
      return el.offsetParent !== null;
    } catch (_) { return false; }
  }

  // هل النموذج ما زال يحمّل؟ (سبينر/تحميل مرئي داخل الـiframe)
  function isIframeFormBusy(doc) {
    if (!doc) return false;
    const sel = '.spinner, .loading, .loader, .busyIndicator, [aria-busy="true"]';
    let nodes = [];
    try { nodes = Array.from(doc.querySelectorAll(sel)); } catch (_) { return false; }
    return nodes.some(n => isElementVisible(n));
  }

  // زر الحفظ جاهز للنقر؟ (مرئي + مفعّل + النموذج غير مشغول)
  function isIframeSaveReady(doc, btn) {
    if (!doc || !btn) return false;
    try {
      if (btn.disabled) return false;
      if (btn.getAttribute('aria-disabled') === 'true') return false;
      if (btn.classList && btn.classList.contains('disabled')) return false;
    } catch (_) { return false; }
    if (!isElementVisible(btn)) return false;
    return !isIframeFormBusy(doc);
  }

  // نص الزر كما يظهر للمستخدم — للتسجيل والتحقق
  function iframeSaveButtonText(btn) {
    if (!btn) return '';
    const t = (btn.innerText || btn.value || btn.title || btn.getAttribute('aria-label') || '').trim();
    return t.replace(/\s+/g, ' ').slice(0, 40);
  }

  // المرشحون مرتبين: المعرّف الرسمي أولًا (الأدق)، ثم أي زر نصه «حفظ/Submit».
  // لا نعيد نفس العنصر مرتين، ولا نُدرج أزرار «اختر/بحث/إلغاء».
  function iframeSaveCandidates(doc) {
    if (!doc) return [];
    const out = [];
    const push = (el, src) => {
      if (!el || out.some(x => x.btn === el)) return;
      out.push({ btn: el, src });
    };
    push(doc.getElementById('InsertButton'), 'id:InsertButton');
    push(doc.getElementById('SubmitButton'), 'id:SubmitButton');
    let cands = [];
    try {
      cands = Array.from(doc.querySelectorAll(
        'input[type="submit"], button[type="submit"], button.btn-primary, input[type="button"], button'
      ));
    } catch (_) { return out; }
    for (const b of cands) {
      const text = iframeSaveButtonText(b);
      if (!text || !/save|submit|حفظ|insert/i.test(text)) continue;
      if (/اختر|select|بحث|search|إلغاء|cancel|حذف|delete|مسح|clear/i.test(text)) continue;
      push(b, 'text:' + text);
    }
    return out;
  }

  // أسماء الحقول المطلوبة كما تظهر للمستخدم (لرسالة واضحة بدل الرفض الصامت)
  const IFRAME_REQUIRED_LABELS = {
    ats_actualmodel: 'الموديل الفعلي',
    ats_modeldefectmajor: 'كود العطل الرئيسي',
    ats_defectcodedefectmajor: 'الكود الفرعي للعطل',
    ats_modeldefectspid: 'قطعة الغيار المرتبطة بالعطل',
    msdyn_product: 'المنتج (قطعة الغيار)',
    ats_modelid: 'الموديل',
    ats_inventorystatus: 'حالة المخزون',
    ats_warrantystatus: 'حالة الضمان',
    ats_quantity: 'الكمية'
  };

  // الحقول المطلوبة الفارغة فعليًا في النموذج.
  // ⚠️ البوابة ترفض الحفظ «بصمت» (0 كتابة، 0 رسالة خطأ، النموذج يبقى مفتوحًا)
  // إذا بقي أي حقل aria-required فارغًا — تحقق حي 2026-10-26.
  // الحقول المرجعية (lookup) GUIDها مخفي، فنقرأ الحقل المعروض `<id>_name` أولًا.
  function iframeRequiredFields(doc) {
    if (!doc) return [];
    let nodes = [];
    try { nodes = Array.from(doc.querySelectorAll('[aria-required="true"]')); } catch (_) { return []; }
    const out = [];
    for (const el of nodes) {
      const id = el.id || el.getAttribute('name') || '';
      if (!id) continue;
      const disp = doc.getElementById(id + '_name') || el;
      // حقل مخفي تمامًا: نتخطّاه إلا إذا كان حقل عمل معروفًا (مثل msdyn_product المخفي
      // لكن البوابة ترفض الحفظ بدونه) — منعًا للإنذار الكاذب على حقول داخلية مجهولة.
      if (!isElementVisible(disp) && !IFRAME_REQUIRED_LABELS[id]) continue;
      const textVal = String(disp.value == null ? '' : disp.value).trim();
      const idVal = disp === el ? textVal : String(el.value == null ? '' : el.value).trim();
      if (textVal && idVal) continue;
      out.push({ id, label: IFRAME_REQUIRED_LABELS[id] || id });
    }
    return out;
  }

  // نقر الحفظ مع بوابة جاهزية + إعادة محاولة على المرشح التالي قبل الإلغاء.
  // يرجع { ok, reason, btn, tried } — والمنادي هو من يغلق النموذج عند الفشل.
  async function saveIframeForm(iframeDoc, modal, label) {
    // ⓪ بوابة الحقول المطلوبة: لا ننقر حفظًا محكومًا عليه بالفشل ثم ننتظر 15 ثانية
    const missing = iframeRequiredFields(iframeDoc);
    if (missing.length) {
      const names = missing.map(f => f.label).join('، ');
      logEvent('PASTE_CODES', `❌ ${label}: حقول مطلوبة فارغة (${names}) — البوابة سترفض الحفظ`);
      return { ok: false, reason: 'required-empty', missing, fields: missing.map(f => f.label), tried: [] };
    }

    const cands = iframeSaveCandidates(iframeDoc);
    if (!cands.length) {
      logEvent('PASTE_CODES', `❌ ${label}: لا يوجد زر حفظ في النموذج`);
      return { ok: false, reason: 'save-button-missing', tried: [] };
    }

    const tried = [];
    const attempts = cands.slice(0, SAVE_MAX_ATTEMPTS);
    for (let i = 0; i < attempts.length; i++) {
      const cand = attempts[i];
      const btn = cand.btn;

      // ① بوابة الجاهزية: الزر مرئي/مفعّل ولا سبينر — وإلا ننتظر قليلًا
      const readyDeadline = Date.now() + SAVE_READY_TIMEOUT_MS;
      while (Date.now() < readyDeadline && !isIframeSaveReady(iframeDoc, btn)) {
        await sleep(250);
      }
      if (!isIframeSaveReady(iframeDoc, btn)) {
        const why = !isElementVisible(btn) ? 'مخفي' : (btn.disabled ? 'معطّل' : 'النموذج يحمّل');
        tried.push(`${cand.src} (${why})`);
        logEvent('PASTE_CODES', `⏳ ${label}: الزر [${cand.src}] غير جاهز (${why}) — تجربة المرشح التالي`);
        continue;
      }

      const btnText = iframeSaveButtonText(btn);
      logEvent('PASTE_CODES', `${label}: نقر زر الحفظ «${btnText}» [${cand.src}]`);
      clickOnceSafe(btn);              // نقرة واحدة (النقر المزدوج يكرر الحفظ)
      tried.push(cand.src);

      // ② انتظار إغلاق النموذج (دليل الحفظ الفعلي)
      let closed = false;
      const deadline = Date.now() + SAVE_CLOSE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (!isModalOpenSafe(modal) || !document.body.contains(modal)) { closed = true; break; }
        await sleep(400);
      }

      // ③ البوابة قد تكون لا تزال تحفظ: لو السبينر ظاهر نمنحه مهلة إضافية
      //    بدلًا من نقر زر آخر (النقر الثاني في هذه الحالة قد يكرر الحفظ).
      if (!closed && isIframeFormBusy(iframeDoc)) {
        logEvent('PASTE_CODES', `⏳ ${label}: النموذج ما زال يحمّل — مهلة إضافية قبل الحكم`);
        const graceDeadline = Date.now() + SAVE_BUSY_GRACE_MS;
        while (Date.now() < graceDeadline) {
          if (!isModalOpenSafe(modal) || !document.body.contains(modal)) { closed = true; break; }
          await sleep(500);
        }
      }

      if (closed) {
        await sleep(2500); // إتاحة وقت كافٍ للبورتال لتحديث الشبكة (AJAX)
        return { ok: true, btn: btnText, tried };
      }

      // ④ لم يُغلق ولا سبينر ⇒ الزر لم يُنفّذ الحفظ فعلًا. جرّب المرشح التالي.
      logEvent('PASTE_CODES', `⚠️ ${label}: «${btnText}» لم يُغلق النموذج — ${i + 1 < attempts.length ? 'تجربة المرشح التالي' : 'لا مرشح آخر'}`);
    }

    return { ok: false, reason: 'save-not-confirmed', tried };
  }

  // يعبّي حقل lookup، ولو مفيش مطابقة يعرض قائمة اختيار من اللوحة (لا اختيار أعمى)
  async function fillLookupWithPick(iframeDoc, inputId, searchValue, label, waitAfter = 1500, opts = {}) {
    if (!searchValue) return { ok: true, skipped: true };
    // كلمات الوصف تُجرَّب فقط عند فشل البحث بالكود (الدور الثالث)
    const descriptionWords = Array.isArray(opts.descriptionWords)
      ? opts.descriptionWords
      : lookupDescriptionWords(opts.description || '', 4);
    const runOpts = { ...opts, descriptionWords };
    let res = await fillIframeLookup(iframeDoc, inputId, searchValue, runOpts);
    if (!res.ok && (res.reason === 'no-match' || res.reason === 'cost-confirm')) {
      const short = String(searchValue).slice(0, 45);
      // بلا قائمة بديلة موثوقة ⇒ لا نعرض اختيارًا قد يكون من عائلة أخرى
      if (!Array.isArray(res.available) || res.available.length === 0) {
        logEvent('PASTE_CODES', `❌ ${label}: لا يوجد «${short}» في القائمة المرتبطة`);
        return { ok: false, reason: 'no-match' };
      }
      const cost = res.reason === 'cost-confirm';
      const pick = await promptLookupPick(
        cost
          ? `${label}: «${short}» وصفه يحوي «بتكلفة» — اختر صراحةً (يُحتسب على العميل حتى داخل الضمان):`
          : `${label}: لا مطابقة لـ «${short}» — اختر الصحيح:`,
        res.available
      );
      if (!pick) {
        logEvent('PASTE_CODES', `⏭ تخطّي ${label} («${short}») بطلب المستخدم`);
        return { ok: false, reason: 'user-skipped' };
      }
      logEvent('PASTE_CODES', `${cost ? '🪙 ' : ''}اختيار يدوي لـ ${label}: "${pick}"`);
      // الاختيار اليدوي صريح ⇒ allowCost يمنع تكرار بوابة التكلفة في نفس الاختيار
      res = await fillIframeLookup(iframeDoc, inputId, pick, { ...runOpts, exactText: pick, allowCost: true });
    }
    await sleep(waitAfter);
    return res;
  }

  // ── التحقق البعدي (بعد الحفظ): إغلاق النموذج ليس دليلًا على نجاح الحفظ ──────
  // نقرأ الشبكة الفعلية ونطابق: صف القطعة بالكود + صف العطل بالزوج (رئيسي/فرعي).
  const PARTS_GRID_IDS = ['InventoryAdjustmentProduct_Subgrid', 'InventoryAdjustmentProduct_SubGrid', 'InventoryAdjustmentProductIsLscYes_Subgrid'];
  const DEFECT_GRID_IDS = ['WorkOrder_defect', 'WorkOrder_Defects', 'WorkOrderDefectIsLscYes_Subgrid'];

  function readSubgridRows(ids) {
    for (const id of ids) {
      const g = document.getElementById(id);
      if (!g) continue;
      const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => r.querySelector('td[data-attribute]'));
      if (rows.length) return { id, rows };
    }
    return { id: '', rows: [] };
  }

  function gridCellOf(tr, attr) {
    const td = tr.querySelector('td[data-attribute="' + attr + '"]');
    return td ? String(td.innerText || '').trim() : '';
  }

  function verifyPartRow(partCode) {
    const clean = String(partCode || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!clean) return { ok: false, reason: 'no-part-code' };
    const { rows } = readSubgridRows(PARTS_GRID_IDS);
    const hit = rows.find(r => (r.innerText || '').replace(/[^a-z0-9]/gi, '').toLowerCase().includes(clean));
    return hit
      ? { ok: true, text: (hit.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100) }
      : { ok: false, reason: 'part-row-missing' };
  }

  function verifyDefectPair(majorCode, subCode) {
    const major = String(majorCode || '').trim().toUpperCase();
    const sub = String(subCode || '').trim().toUpperCase();
    const { rows } = readSubgridRows(DEFECT_GRID_IDS);
    const hit = rows.find(r => {
      const m = gridCellOf(r, 'ats_defectmajor').toUpperCase();
      const s = gridCellOf(r, 'ldv_defect').toUpperCase();
      return (!major || m.startsWith(major)) && (!sub || s.includes(sub));
    });
    return hit
      ? { ok: true, text: `${gridCellOf(hit, 'ats_defectmajor')} | ${gridCellOf(hit, 'ldv_defect')}` }
      : { ok: false, reason: 'defect-row-missing' };
  }

  async function addSparePartPage3(spObj, faultCodeObj = null) {
    if (!spObj) return { ok: false, reason: 'بيانات قطعة الغيار غير صالحة' };
    const majorSearch = (faultCodeObj?.majorCode || faultCodeObj?.majorName || spObj.majorCode || spObj.majorName || '').trim();
    const subSearch = (faultCodeObj?.defectCode || faultCodeObj?.fullCode || spObj.defectCode || spObj.defect || spObj.fullCode || '').trim();
    const partSearch = (spObj.fullName || spObj.code || spObj.name || spObj.product || '').trim();
    const partCodeOnly = (spObj.code || simplifySearchText(partSearch) || partSearch).trim();
    const qty = String(spObj.qty || 1);
    // 🪙 إن كان الكود مكلِّفًا وأكّده المستخدم صراحةً في لوحة المراجعة
    //    نمرّر allowCost حتى لا يُطلب التأكيد مرتين لنفس الكود.
    const costConfirmed = !!(faultCodeObj && faultCodeObj.costConfirmed);

    // 0. الاقتران شرط: نموذج «اضافة قطعة غيار» هو الذي يُنشئ صف العطل (major + sub)
    //    تلقائيًا في البوابة (تحقق حي 2026-10-26). بلا كود رئيسي/فرعي لا يُحفظ شيء.
    if (!majorSearch || !subSearch) {
      logEvent('PASTE_CODES', `⛔ ${partCodeOnly || partSearch}: لا كود عطل مقترن — لن تُضاف (لا تخمين)`);
      return { ok: false, reason: 'no-fault-code', part: partCodeOnly || partSearch };
    }

    // 1. التحقق من وجود قطعة الغيار في الجدول بالفعل
    const spGrids = ['InventoryAdjustmentProduct_Subgrid', 'InventoryAdjustmentProduct_SubGrid', 'InventoryAdjustmentProductIsLscYes_Subgrid'];
    for (const gid of spGrids) {
      const g = document.getElementById(gid);
      if (g) {
        const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => {
          const txt = (r.innerText || '').toLowerCase();
          const codeClean = partCodeOnly.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (partCodeOnly && txt.includes(partCodeOnly.toLowerCase())) return true;
          if (codeClean && txt.replace(/[^a-z0-9]/gi, '').includes(codeClean)) return true;
          return false;
        });
        if (rows.length > 0) {
          logEvent('PASTE_CODES', `قطعة الغيار ${partSearch} موجودة بالفعل في ${gid} — تخطي`);
          return { ok: true, name: partSearch, alreadyExists: true };
        }
      }
    }

    // 2. العثور على زر إضافة قطعة غيار المرئي مع مهلة انتظار لتحديث الـ Ajax
    let addBtn = null;
    const allDocs = getShallowDocs();

    const findBtnDeadline = Date.now() + 12000;
    while (Date.now() < findBtnDeadline) {
      for (const doc of allDocs) {
        const candidates = Array.from(doc.querySelectorAll('a, button, input[type="button"]')).filter(b => {
          try {
            if (b.offsetParent === null) return false;
            const s = window.getComputedStyle(b);
            return s.display !== 'none' && s.visibility !== 'hidden';
          } catch(_) { return false; }
        });
        addBtn = candidates.find(b => {
          const t = (b.innerText || b.title || b.value || '').trim();
          return /[اإأ]ضاف[ةه]\s*قطعة\s*غيار|Add.*Spare.*Part|Add.*Product/i.test(t) && !/الموديل\s*2/i.test(t);
        }) || candidates.find(b => /[اإأ]ضاف[ةه]\s*قطعة\s*غيار|Add.*Spare.*Part/i.test((b.innerText || b.title || b.value || '').trim()));
        if (addBtn) break;
      }
      if (addBtn) break;
      await sleep(400);
    }

    if (!addBtn) {
      logEvent('PASTE_CODES', 'لم يتم العثور على زر إضافة قطعة غيار مرئي');
      clearOrphanBackdrops('زر قطعة الغيار غير موجود');
      return { ok: false, reason: 'زر إضافة قطعة غيار غير موجود أو غير مرئي' };
    }

    // ممنوع فتح مودال فوق مودال: أغلق أي مودال عالق أولًا (يمنع تراكم ستائر Bootstrap).
    await resetModalsBeforeStep('إضافة قطعة غيار');

    // نقرة واحدة فقط. كان هنا 3 نقرات (handler مباشر + safeClick + click) ⇒
    // كل واحدة قد تفتح نسخة مودال جديدة، فتُضاف ستارة سوداء (opacity .5) لكل نسخة.
    clickOnceSafe(addBtn);
    await sleep(1500);

    // 3. انتظار ظهور النافذة المنبثقة (المودال) - فحص كافة المودالات في الصفحة للوصول للمودال المفتوح فعلياً
    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      for (const doc of allDocs) {
        const modals = Array.from(doc.querySelectorAll('.modal.modal-form-insert, .modal.in, .modal.show, section.modal, div[role="dialog"]'));
        modal = modals.find(m => isModalOpenSafe(m) && m.querySelector('iframe'));
        if (modal) break;
      }
      if (modal) break;
      await sleep(350);
    }
    if (!modal) {
      logEvent('PASTE_CODES', 'مودال إضافة قطعة غيار لم يفتح');
      clearOrphanBackdrops('مودال قطعة الغيار لم يفتح');
      return { ok: false, reason: 'نافذة إضافة قطعة غيار لم تفتح' };
    }

    // 4. انتظار تحميل الآي فريم داخل المودال
    let iframeDoc = null;
    const iframeDeadline = Date.now() + 12000;
    while (Date.now() < iframeDeadline) {
      const ifr = modal.querySelector('iframe');
      if (ifr) {
        try {
          const d = ifr.contentDocument || ifr.contentWindow?.document;
          if (d && (d.readyState === 'complete' || d.readyState === 'interactive')) {
            if (d.querySelector('#ats_modeldefectmajor_name, #ats_modeldefectspid_name, button')) {
              iframeDoc = d;
              break;
            }
          }
        } catch(_) {}
      }
      await sleep(400);
    }

    if (!iframeDoc) {
      await closeModalSafely(modal, 'فشل تحميل إطار قطعة الغيار');
      return { ok: false, reason: 'فشل تحميل إطار نموذج إضافة قطعة الغيار' };
    }

    await sleep(1000);

    // 5. كود العطل الرئيسي + بوابة الاتساق (المختار يجب أن يحمل الكود المطلوب)
    let majorPicked = '';
    if (majorSearch) {
      const r = await fillLookupWithPick(iframeDoc, 'ats_modeldefectmajor_name', majorSearch, 'كود العطل الرئيسي', 2000, {
        description: faultCodeObj?.majorName || majorSearch,
        allowCost: costConfirmed
      });
      if (!r.ok) {
        await closeModalSafely(modal, 'فشل اختيار كود العطل الرئيسي');
        return { ok: false, reason: `major-${r.reason || 'failed'}` };
      }
      majorPicked = codeTokenOf(r.text || iframeDoc.getElementById('ats_modeldefectmajor_name')?.value) || majorSearch;
      const expectedMajor = codeTokenOf(faultCodeObj?.majorCode || majorSearch) || majorSearch;
      if (!sameCode(majorPicked, expectedMajor)) {
        logEvent('PASTE_CODES', `⛔ ${partCodeOnly || partSearch}: الرئيسي المختار "${majorPicked}" ≠ المطلوب "${expectedMajor}" — توقّف قبل الحفظ`);
        await closeModalSafely(modal, 'كود رئيسي غير مطابق');
        return { ok: false, reason: 'major-mismatch', picked: majorPicked, expected: expectedMajor };
      }
    }

    // 6. كود العطل الفرعي — البحث بالكود، وبلا «عرض الكل» (القائمة غير مقيّدة بالرئيسي)
    let subPicked = '';
    if (subSearch) {
      const r = await fillLookupWithPick(iframeDoc, 'ats_defectcodedefectmajor_name', subSearch, 'كود العطل الفرعي', 1500, {
        noShowAll: true,
        description: faultCodeObj?.description || faultCodeObj?.fullCode || subSearch,
        allowCost: costConfirmed
      });
      if (!r.ok) {
        await closeModalSafely(modal, 'فشل اختيار كود العطل الفرعي');
        return { ok: false, reason: `sub-${r.reason || 'failed'}` };
      }
      subPicked = codeTokenOf(r.text || iframeDoc.getElementById('ats_defectcodedefectmajor_name')?.value) || subSearch;
      // بوابة الاتساق: الفرعي المختار يجب أن يكون الكود المطلوب نفسه
      // (قائمة الفرعي غير مقيّدة بالرئيسي ⇒ قد يختار المستخدم كود عائلة أخرى)
      const expectedSubs = [subSearch, faultCodeObj?.defectCode, faultCodeObj?.fullCode]
        .map(v => codeTokenOf(v)).filter(Boolean);
      if (!expectedSubs.some(e => sameCode(e, subPicked))) {
        logEvent('PASTE_CODES', `⛔ ${partCodeOnly || partSearch}: الفرعي المختار "${subPicked}" ≠ المطلوب "${expectedSubs[0] || subSearch}" — توقّف قبل الحفظ`);
        await closeModalSafely(modal, 'كود فرعي غير مطابق');
        return { ok: false, reason: 'sub-mismatch', picked: subPicked, expected: expectedSubs[0] || subSearch };
      }
    }

    // 7. قطعة الغيار — وهذا هو الدليل القابل للتحقق على اتساق الزوج:
    //    قائمة القطع مقيّدة بالكود الفرعي المختار (تحقق حي: RF1102→١، RF1104→٤، RF2408→١).
    //    صفر نتائج ⇒ الزوج غير متسق ⇒ توقّف فوري بلا محاولة حفظ.
    if (partCodeOnly || partSearch) {
      const r = await fillLookupWithPick(iframeDoc, 'ats_modeldefectspid_name', partCodeOnly || partSearch, 'قطعة الغيار', 1200, {
        description: spObj.name || spObj.fullName || ''
      });
      if (!r.ok) {
        const pair = `${majorPicked || '—'}|${subPicked || '—'}`;
        const inconsistent = r.reason === 'no-match' || r.reason === 'user-skipped';
        logEvent('PASTE_CODES', inconsistent
          ? `⛔ ${pair}: قطعة الغيار «${partCodeOnly || partSearch}» غير موجودة في قائمة هذا الفرعي — الزوج غير متسق، لا حفظ`
          : `⚠️ ${pair}: تعذّر اختيار قطعة الغيار (${r.reason || 'failed'})`);
        await closeModalSafely(modal, 'قطعة غير موجودة في قائمة الكود الفرعي');
        return {
          ok: false,
          reason: inconsistent ? 'pair-inconsistent' : `part-${r.reason || 'failed'}`,
          pair,
          part: partCodeOnly || partSearch
        };
      }
    }

    // 8. الكمية (native setter + تحقق)
    const qtyInput = iframeDoc.getElementById('ats_quantity');
    if (qtyInput) {
      if (typeof emulateUserInput === 'function') {
        try { await emulateUserInput(qtyInput, qty); } catch(_) {}
      }
      if (String(qtyInput.value || '') !== String(qty)) {
        qtyInput.value = qty;
        try { qtyInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
        try { qtyInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        try { qtyInput.dispatchEvent(new Event('blur', { bubbles: true })); } catch(_) {}
      }
      logEvent('PASTE_CODES', `الكمية بعد الكتابة: "${qtyInput.value}"`);
    }

    // 9. زر الحفظ — عبر الدالة الموحّدة (id أولًا، ثم مرئي/مفعّل/نص حفظ)
    const saveRes = await saveIframeForm(iframeDoc, modal, 'قطعة الغيار');
    if (saveRes.ok) {
      clearOrphanBackdrops('بعد حفظ قطعة الغيار');
      // اقتران مُثبت بالتجربة (حفظ ناجح فعلي) — يُستخدم كاقتراح لاحقًا
      recordPartPairing(spObj, majorPicked, subPicked);
      logEvent('PASTE_CODES', `🔗 اقتران محفوظ: ${partCodeOnly || partSearch} ← ${majorPicked}/${subPicked}`);

      // تحقق فعلي من الشبكة: إغلاق النموذج لا يعني أن الصف أُضيف صحيحًا
      const vPart = verifyPartRow(partCodeOnly || partSearch);
      const vDefect = verifyDefectPair(majorPicked, subPicked);
      const verified = !!(vPart.ok && vDefect.ok);
      if (verified) {
        logEvent('PASTE_CODES', `✅ تحقق فعلي: ${partCodeOnly || partSearch} + ${majorPicked}/${subPicked} موجودان في الشبكة`);
      } else {
        logEvent('PASTE_CODES', `⚠️ حفظ بلا تحقق: القطعة ${vPart.ok ? '✓' : '✗ ' + (vPart.reason || '')} · العطل ${vDefect.ok ? '✓' : '✗ ' + (vDefect.reason || '')}`);
      }

      // الضمان (داخل/خارج) — تعديل آمن فقط لو الحقل قابل للتعديل، ثم تحقق فعلي
      let warrantyManual = '';
      if (spObj.warranty) {
        const w = await applyWarrantyToRow({ productId: spObj.productId, code: spObj.code, name: spObj.name }, spObj.warranty);
        const wanted = spObj.warranty === 'out' ? 'خارج' : 'داخل';
        if (w && w.ok === false && w.reason === 'manual') {
          warrantyManual = w.current || 'unknown';
          logEvent('PASTE_CODES', `⚠️ ضمان ${spObj.code || spObj.name}: المطلوب «${wanted}» والحالي «${w.current || 'غير معروف'}» — يحتاج تعديلًا يدويًا`);
        } else if (w && w.ok) {
          logEvent('PASTE_CODES', `✅ ضمان ${spObj.code || spObj.name}: ${wanted}`);
        }
      }
      return { ok: true, name: partSearch || partCodeOnly, warrantyManual, saveBtn: saveRes.btn, verified, verify: { part: vPart, defect: vDefect } };
    }

    if (saveRes.reason === 'save-button-missing') {
      await closeModalSafely(modal, 'زر حفظ قطعة الغيار غير موجود');
      return { ok: false, reason: 'زر الحفظ غير موجود في نموذج قطعة الغيار' };
    }
    // حقول مطلوبة فارغة ⇒ البوابة ترفض بصمت: نغلق ونقول الحقل الناقص بدل الانتظار
    if (saveRes.reason === 'required-empty') {
      const names = (saveRes.fields || []).join('، ') || 'حقل مطلوب';
      logEvent('PASTE_CODES', `❌ قطعة الغيار (${partSearch || partCodeOnly}): حقول مطلوبة فارغة — ${names}`);
      await closeModalSafely(modal, 'حقول مطلوبة فارغة في نموذج قطعة الغيار');
      return { ok: false, reason: `لم تُحفظ قطعة الغيار «${partSearch || partCodeOnly}» — البوابة تطلب: ${names}` };
    }
    // الحفظ لم يُغلق النموذج ⇒ فشل حقيقي، مع إغلاق المودال لمنع تراكم الستائر.
    logEvent('PASTE_CODES', `❌ حفظ قطعة الغيار لم يُؤكَّد (جُرّب: ${(saveRes.tried || []).join(' | ') || '—'})`);
    await closeModalSafely(modal, 'حفظ قطعة الغيار لم يُغلق النموذج');
    return { ok: false, reason: 'save-not-confirmed' };
  }

  async function addSingleFaultCode(codeObj) {
    if (!codeObj) return { ok: false, reason: 'بيانات الكود غير صالحة' };
    const mainSearch = (codeObj.majorCode || codeObj.majorName || codeObj.fullCode || '').trim();
    const subSearch = (codeObj.defectCode || codeObj.fullCode || codeObj.description || '').trim();

    if (!mainSearch && !subSearch) return { ok: false, reason: 'لا يوجد كود رئيسي أو فرعي للبحث' };

    // نموذج «اضافة كود عطل» يحتاج الرئيسي والفرعي معًا، وقائمة الفرعي فيه فارغة دائمًا
    // (تحقق حي 2026-10-26: 0 صفوف مع الكود أو البادئة أو «*») ⇒ لا نحاول حفظًا محكومًا بالفشل.
    if (!mainSearch || !subSearch) {
      logEvent('PASTE_CODES', `⛔ كود العطل (${subSearch || mainSearch}): يحتاج رئيسيًا وفرعيًا معًا — أضفه يدويًا`);
      return { ok: false, reason: 'need-major-and-sub' };
    }

    // التحقق من وجود كود العطل مسبقاً
    const defectGrids = ['WorkOrder_defect', 'WorkOrder_Defects', 'WorkOrderDefectIsLscYes_Subgrid'];
    for (const gid of defectGrids) {
      const g = document.getElementById(gid);
      if (g) {
        const rows = Array.from(g.querySelectorAll('table tbody tr')).filter(r => {
          const txt = (r.innerText || '').toLowerCase();
          if (subSearch && txt.includes(subSearch.toLowerCase())) return true;
          if (mainSearch && txt.includes(mainSearch.toLowerCase())) return true;
          return false;
        });
        if (rows.length > 0) {
          logEvent('PASTE_CODES', `كود العطل ${subSearch || mainSearch} موجود بالفعل في ${gid} — تخطي`);
          return { ok: true, name: subSearch || mainSearch, alreadyExists: true };
        }
      }
    }

    // 1. العثور على زر إضافة كود عطل المرئي مع مهلة انتظار
    let addBtn = null;
    const allDocs = getShallowDocs();

    const findBtnDeadline = Date.now() + 12000;
    while (Date.now() < findBtnDeadline) {
      for (const doc of allDocs) {
        const candidates = Array.from(doc.querySelectorAll('a, button, input[type="button"]')).filter(b => {
          try {
            if (b.offsetParent === null) return false;
            const s = window.getComputedStyle(b);
            return s.display !== 'none' && s.visibility !== 'hidden';
          } catch(_) { return false; }
        });
        addBtn = candidates.find(b => /[اإأ]ضاف[ةه]\s*كود\s*عطل|Add.*Defect/i.test((b.innerText || b.title || b.value || '').trim()));
        if (addBtn) break;
      }
      if (addBtn) break;
      await sleep(400);
    }

    if (!addBtn) {
      logEvent('PASTE_CODES', 'لم يتم العثور على زر إضافة كود عطل مرئي');
      clearOrphanBackdrops('زر كود العطل غير موجود');
      return { ok: false, reason: 'زر إضافة كود عطل غير موجود أو غير مرئي' };
    }

    // ممنوع فتح مودال فوق مودال: أغلق أي مودال عالق أولًا (يمنع تراكم ستائر Bootstrap).
    await resetModalsBeforeStep('إضافة كود عطل');

    // نقرة واحدة فقط (كانت 3 نقرات ⇒ مودالات متعددة ⇒ ستائر سوداء متراكمة).
    clickOnceSafe(addBtn);
    await sleep(1500);

    // 2. انتظار ظهور النافذة المنبثقة (المودال الخارجي)
    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      for (const doc of allDocs) {
        const modals = Array.from(doc.querySelectorAll('.modal.modal-form-insert, .modal.in, .modal.show, section.modal, div[role="dialog"]'));
        modal = modals.find(m => isModalOpenSafe(m) && m.querySelector('iframe'));
        if (modal) break;
      }
      if (modal) break;
      await sleep(350);
    }
    if (!modal) {
      logEvent('PASTE_CODES', 'مودال إضافة كود عطل لم يفتح');
      clearOrphanBackdrops('مودال كود العطل لم يفتح');
      return { ok: false, reason: 'نافذة إضافة كود عطل لم تفتح' };
    }

    // 3. انتظار تحميل الآي فريم داخل المودال
    let iframeDoc = null;
    const iframeDeadline = Date.now() + 12000;
    while (Date.now() < iframeDeadline) {
      const ifr = modal.querySelector('iframe');
      if (ifr) {
        try {
          const d = ifr.contentDocument || ifr.contentWindow?.document;
          if (d && (d.readyState === 'complete' || d.readyState === 'interactive')) {
            if (d.querySelector('#ats_modeldefectmajor_name, button')) {
              iframeDoc = d;
              break;
            }
          }
        } catch(_) {}
      }
      await sleep(400);
    }

    if (!iframeDoc) {
      await closeModalSafely(modal, 'فشل تحميل إطار كود العطل');
      return { ok: false, reason: 'فشل تحميل إطار نموذج إضافة كود العطل (iframe)' };
    }

    await sleep(1000);

    // 4. خطوة كود العطل الرئيسي (Major defect lookup)
    if (mainSearch) {
      const r = await fillLookupWithPick(iframeDoc, 'ats_modeldefectmajor_name', mainSearch, 'كود العطل الرئيسي', 2000);
      if (!r.ok) {
        await closeModalSafely(modal, 'فشل اختيار كود العطل الرئيسي');
        return { ok: false, reason: `major-${r.reason || 'failed'}` };
      }
    }

    // 5. خطوة كود العطل الفرعي (Sub defect lookup)
    if (subSearch) {
      const r = await fillLookupWithPick(iframeDoc, 'ats_defectcodedefectmajor_name', subSearch, 'كود العطل الفرعي', 1200, { noShowAll: true });
      if (!r.ok) {
        await closeModalSafely(modal, 'فشل اختيار كود العطل الفرعي');
        return { ok: false, reason: `sub-${r.reason || 'failed'}` };
      }
    }

    // 6. نقر زر الحفظ — عبر الدالة الموحّدة (id أولًا، ثم مرئي/مفعّل/نص حفظ)
    const saveRes = await saveIframeForm(iframeDoc, modal, 'كود العطل');
    if (saveRes.ok) {
      clearOrphanBackdrops('بعد حفظ كود العطل');
      // تحقق فعلي: هل ظهر صف العطل في الشبكة بالزوج الصحيح؟
      const vDefect = verifyDefectPair(mainSearch, subSearch);
      logEvent('PASTE_CODES', vDefect.ok
        ? `✅ تحقق فعلي: كود العطل ${mainSearch}/${subSearch} في الشبكة`
        : `⚠️ حفظ بلا تحقق: صف العطل ${mainSearch}/${subSearch} غير ظاهر (${vDefect.reason || '—'})`);
      return { ok: true, name: subSearch || mainSearch, saveBtn: saveRes.btn, verified: vDefect.ok, verify: { defect: vDefect } };
    }

    if (saveRes.reason === 'save-button-missing') {
      await closeModalSafely(modal, 'زر حفظ كود العطل غير موجود');
      return { ok: false, reason: 'لم يتم العثور على زر الحفظ' };
    }
    // حقول مطلوبة فارغة ⇒ البوابة ترفض بصمت: نغلق ونقول الحقل الناقص بدل الانتظار
    if (saveRes.reason === 'required-empty') {
      const names = (saveRes.fields || []).join('، ') || 'حقل مطلوب';
      logEvent('PASTE_CODES', `❌ كود العطل (${subSearch || mainSearch}): حقول مطلوبة فارغة — ${names}`);
      await closeModalSafely(modal, 'حقول مطلوبة فارغة في نموذج كود العطل');
      return { ok: false, reason: `لم يُحفظ كود العطل «${subSearch || mainSearch}» — البوابة تطلب: ${names}` };
    }
    logEvent('PASTE_CODES', `❌ حفظ كود العطل لم يُؤكَّد (جُرّب: ${(saveRes.tried || []).join(' | ') || '—'})`);
    await closeModalSafely(modal, 'حفظ كود العطل لم يُغلق النموذج');
    return { ok: false, reason: 'save-not-confirmed' };
  }

  async function pasteCodesAction(shadow) {
    logEvent('PASTE_CODES', 'بدء لصق الأكواد وقطع الغيار');
    setStatus(shadow, '⏳ جاري قراءة البيانات المحفوظة...');
    await resetModalsBeforeStep('لصق الأكواد');
    try {
      let bundle = null;
      let bundleSource = '';
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          const trimmed = clipText.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length > 0) {
              bundle = { faultCodes: parsed };
              bundleSource = 'clipboard';
              logEvent('PASTE_CODES', 'تم قراءة مصفوفة أكواد من الحافظة');
            } else if (parsed && (Array.isArray(parsed.faultCodes) || Array.isArray(parsed.spareParts))) {
              bundle = parsed;
              bundleSource = 'clipboard';
              logEvent('PASTE_CODES', 'تم قراءة حزمة أكواد من الحافظة');
            }
          }
        }
      } catch(e) {
        logEvent('PASTE_CODES', 'تعذر قراءة الحافظة: ' + (e?.message || e));
      }

      if (!bundle || (!Array.isArray(bundle.faultCodes) && !Array.isArray(bundle.spareParts))) {
        const localRaw = localStorage.getItem('elaraby_copied_codes_bundle');
        if (localRaw) {
          try {
            const parsed = safeParseJSON(localRaw, null);
            if (parsed && Array.isArray(parsed)) bundle = { faultCodes: parsed };
            else if (parsed && (Array.isArray(parsed.faultCodes) || Array.isArray(parsed.spareParts))) bundle = parsed;
            if (bundle) bundleSource = 'localStorage';
            logEvent('PASTE_CODES', 'تم قراءة الأكواد من localStorage');
          } catch(_) {}
        }
      }

      if (!bundle || (!Array.isArray(bundle.faultCodes) && !Array.isArray(bundle.spareParts))) {
        // Show manual JSON input inline instead of window.prompt
        const manualWrap = shadow.getElementById('cp-manual-json-wrap');
        const manualInput = shadow.getElementById('cp-manual-json');
        const applyBtn = shadow.getElementById('cp-manual-json-apply');
        const cancelBtn = shadow.getElementById('cp-manual-json-cancel');
        if (manualWrap && manualInput && applyBtn && cancelBtn) {
          manualWrap.style.display = 'block';
          manualInput.value = '';
          manualInput.focus();
          setStatus(shadow, '📋 الصق JSON في المربع واضغط "تطبيق"', 'warn');
          await new Promise((resolve) => {
            const onApply = () => {
              const txt = manualInput.value.trim();
              manualWrap.style.display = 'none';
              applyBtn.removeEventListener('click', onApply);
              cancelBtn.removeEventListener('click', onCancel);
              if (txt) {
                try {
                  const parsed = safeParseJSON(txt, null);
                  if (parsed && Array.isArray(parsed)) { bundle = { faultCodes: parsed }; bundleSource = 'manual'; }
                  else if (parsed && (Array.isArray(parsed.faultCodes) || Array.isArray(parsed.spareParts))) { bundle = parsed; bundleSource = 'manual'; }
                } catch(_) {}
              }
              resolve();
            };
            const onCancel = () => {
              manualWrap.style.display = 'none';
              applyBtn.removeEventListener('click', onApply);
              cancelBtn.removeEventListener('click', onCancel);
              resolve();
            };
            applyBtn.addEventListener('click', onApply);
            cancelBtn.addEventListener('click', onCancel);
          });
        }
      }

      // تنظيف حزمة قديمة (قبل إصلاح الاستخراج): إسقاط «أكواد الأثاث»/الأسعار المخزَّنة
      const beforeCodes = Array.isArray(bundle?.faultCodes) ? bundle.faultCodes.length : 0;
      const beforeParts = Array.isArray(bundle?.spareParts) ? bundle.spareParts.length : 0;
      if (bundle) sanitizeStoredBundle(bundle);
      const rawSpareParts = Array.isArray(bundle?.spareParts) ? bundle.spareParts : [];
      const rawFaultCodes = Array.isArray(bundle?.faultCodes) ? bundle.faultCodes : [];
      if (bundle && (rawFaultCodes.length !== beforeCodes || rawSpareParts.length !== beforeParts)) {
        const dropped = (beforeCodes - rawFaultCodes.length) + (beforeParts - rawSpareParts.length);
        logEvent('PASTE_CODES', `🧹 حزمة قديمة: أُسقط ${dropped} مدخلًا غير صالح قبل اللصق`);
        setStatus(shadow, `🧹 نُظّفت الحزمة: ${dropped} مدخل غير صالح أُسقط`, 'warn');
      }

      // حزمة قديمة تُرفض فقط إذا حملت قطع غيار بلا معرّفات (v2).
      // حزمة أكواد أعطال فقط (بلا قطع) صالحة حتى لو لم تحمل version.
      const bundleVersion = Number((bundle && bundle.version) || 0);
      const hasParts = rawSpareParts.length > 0;
      const partsLackIds = hasParts && rawSpareParts.some(p => !p || (!p.productId && !p.rowId));
      if (bundle && hasParts && (bundleVersion < 2 || partsLackIds)) {
        logEvent('PASTE_CODES', `رفض قطع غيار بلا معرّفات (v${bundleVersion || '?'}) — تحتاج إعادة نسخ`);
        setStatus(shadow, '❌ حزمة قطع قديمة (v1) — اضغط «نسخ الأكواد» من البلاغ الأصلي مرة أخرى', 'error');
        return;
      }

      // إظهار مصدر الحزمة وعمرها قبل اللصق (الحافظة ≠ localStorage)
      const srcLabel = bundleSource === 'clipboard' ? 'الحافظة'
        : bundleSource === 'localStorage' ? 'localStorage'
        : bundleSource === 'manual' ? 'إدخال يدوي' : 'غير معروف';
      const madeAtRaw = bundle && (bundle.copiedAt || bundle.createdAt);
      const madeAt = madeAtRaw ? new Date(madeAtRaw) : null;
      const ageMin = (madeAt && !isNaN(madeAt.getTime()))
        ? Math.max(0, Math.round((Date.now() - madeAt.getTime()) / 60000))
        : null;
      const ageText = ageMin == null ? 'عمر غير معروف' : (ageMin < 1 ? 'نُسخت الآن' : `عمرها ${ageMin} دقيقة`);
      logEvent('PASTE_CODES', `الحزمة: source=${srcLabel} | ${ageText} | أكواد=${rawFaultCodes.length} قطع=${rawSpareParts.length} | v${bundleVersion || '?'}`);
      setStatus(shadow, `📋 ${srcLabel} — ${ageText} — ${rawFaultCodes.length} كود${hasParts ? ' + ' + rawSpareParts.length + ' قطعة' : ''}`, (ageMin != null && ageMin > 120) ? 'warn' : 'info');

      if (rawSpareParts.length === 0 && rawFaultCodes.length === 0) {
        setStatus(shadow, '⚠️ لا توجد أكواد أو قطع غيار منسوخة! اضغط على "نسخ الأكواد" أولاً أو الصق JSON في الحافظة', 'warn');
        return;
      }

      // إذا وُجد مبلغ وكان حقل المبلغ فارغًا
      if (bundle.amount && bundle.amount !== '0') {
        const amtInput = shadow.getElementById('cp-amount');
        if (amtInput && (!amtInput.value || amtInput.value === '0')) {
          amtInput.value = bundle.amount;
        }
      }

      // تصنيف العناصر — بلا أي تخمين:
      // 1. القطعة تُضاف عبر «اضافة قطعة غيار» وهي التي تُنشئ صف العطل (major + sub) في البوابة.
      // 2. الاقتران يأتي من البيانات المحفوظة مع القطعة (majorCode/subCode) أو من اختيار
      //    المستخدم في لوحة المراجعة — لا مطابقة كلمات مفتاحية ولا «أول كود غير مقترن».
      //    (تحقق حي 2026-10-26: قائمة الكود الفرعي غير مقيّدة بالرئيسي، والاقتران الخاطئ
      //     يجعل القطعة غير موجودة في قائمتها ⇒ رفض حفظ صامت.)
      const sparePartJobs = [];
      const usedCodeKeys = new Set();

      rawSpareParts.forEach(sp => {
        const explicitMajor = String(sp.majorCode || sp.major || '').trim();
        const explicitSub = String(sp.subCode || sp.defectCode || sp.defect || '').trim();
        let linked = null;
        if (explicitMajor && explicitSub) {
          const key = explicitMajor + '|' + explicitSub;
          linked = rawFaultCodes.find(fc => {
            const fcMajor = String(fc.majorCode || '').trim();
            const fcSub = String(fc.defectCode || '').trim();
            return fcMajor + '|' + fcSub === key;
          }) || { majorCode: explicitMajor, defectCode: explicitSub };
          usedCodeKeys.add(key);
        }
        sparePartJobs.push({ sparePart: sp, faultCode: linked });
      });

      // أكواد الأعطال التي لم تُقترن بأي قطعة (تُضاف عبر «اضافة كود عطل»)
      // ⚠️ تُحسب مبدئيًا هنا وتُعاد حسابتها بعد المراجعة (الاقتران النهائي هو المعتمد).
      let standaloneFaultCodes = rawFaultCodes.filter(fc => {
        const key = String(fc.majorCode || '').trim() + '|' + String(fc.defectCode || '').trim();
        return !usedCodeKeys.has(key);
      });

      const unpairedCount = sparePartJobs.filter(j => !j.faultCode).length;
      logEvent('PASTE_CODES', `الخطة: ${sparePartJobs.length} قطعة (${unpairedCount} بلا كود عطل) + ${standaloneFaultCodes.length} كود عطل مستقل`);
      // ── مراجعة قبل التنفيذ: كود العطل + الضمان (داخل/خارج) + ⭐ لكل قطعة ──
      if (sparePartJobs.length > 0) {
        setStatus(shadow, '👁️ راجع القطع (كود العطل + الضمان) ثم اضغط «تنفيذ اللصق»');
        const chosen = await showPartsReview(shadow, sparePartJobs, rawFaultCodes);
        if (!chosen) {
          logEvent('PASTE_CODES', 'أُلغي اللصق من لوحة المراجعة');
          setStatus(shadow, 'ℹ️ أُلغي اللصق', 'warn');
          return;
        }
        sparePartJobs.length = 0;
        chosen.forEach(c => sparePartJobs.push(c));
        logEvent('PASTE_CODES', `تم تأكيد ${chosen.length} قطعة من لوحة المراجعة`);
      }

      // إعادة حساب الأكواد المستقلة بالاقتران النهائي (المؤكَّد في المراجعة):
      // أي كود صار مقترنًا بقطعة أُنشئ صفّه تلقائيًا من نموذج القطعة ⇒ لا نضيفه مرة ثانية.
      const finalPairedKeys = new Set(
        sparePartJobs
          .map(j => `${String(j.faultCode?.majorCode || '').trim()}|${String(j.faultCode?.defectCode || '').trim()}`)
          .filter(k => k !== '|')
      );
      standaloneFaultCodes = rawFaultCodes.filter(fc => {
        const key = `${String(fc.majorCode || '').trim()}|${String(fc.defectCode || '').trim()}`;
        return !finalPairedKeys.has(key);
      });
      logEvent('PASTE_CODES', `بعد المراجعة: ${sparePartJobs.length} قطعة + ${standaloneFaultCodes.length} كود مستقل`);

      let addedPartsCount = 0;
      let addedCodesCount = 0;
      const manualWarranty = [];
      const unverified = [];
      const failedParts = [];

      // ── أ: تنفيذ إضافة قطع الغيار عبر "اضافة قطعة غيار" ──
      for (let i = 0; i < sparePartJobs.length; i++) {
        const job = sparePartJobs[i];
        const label = job.sparePart.code || job.sparePart.name || `قطعة ${i + 1}`;
        setStatus(shadow, `⏳ جاري إضافة قطعة غيار (${i + 1}/${sparePartJobs.length}): ${label}...`);
        const res = await addSparePartPage3({ ...job.sparePart, warranty: job.warranty }, job.faultCode);
        if (res && res.ok) {
          if (!res.alreadyExists) addedPartsCount++;
          if (res.warrantyManual) manualWarranty.push(`${label} (مطلوب: ${job.warranty === 'out' ? 'خارج' : 'داخل'})`);
          if (res.verified === false) unverified.push(`${label} — القطعة أو صف العطل غير ظاهر في الشبكة`);
          logEvent('PASTE_CODES', `✅ تم إضافة قطعة الغيار: ${label}`);
        } else {
          const why = partFailureReason(res);
          failedParts.push(`${label} — ${why}`);
          logEvent('PASTE_CODES', `⚠️ تعذر إضافة قطعة الغيار ${label}: ${why}`);
          // 🚫 ذاكرة الرفض: لا يُقترح هذا الزوج لهذه القطعة مرة أخرى تلقائيًا
          const fc = job.faultCode;
          if (fc && fc.majorCode && fc.defectCode) {
            recordPartPairingFailure(job.sparePart, fc.majorCode, fc.defectCode, why);
          }
        }
        await sleep(1500);
      }

      // ── ب: تنفيذ إضافة أكواد الأعطال فقط عبر "اضافة كود عطل" ──
      for (let i = 0; i < standaloneFaultCodes.length; i++) {
        const code = standaloneFaultCodes[i];
        const title = code.fullCode || code.defectCode || code.majorCode;
        setStatus(shadow, `⏳ جاري إضافة كود عطل (${i + 1}/${standaloneFaultCodes.length}): ${title}...`);
        const res = await addSingleFaultCode(code);
        if (res && res.ok) {
          if (!res.alreadyExists) addedCodesCount++;
          if (res.verified === false) unverified.push(`${title} — صف العطل غير ظاهر في الشبكة`);
          logEvent('PASTE_CODES', `✅ تم إضافة كود عطل: ${title}`);
        } else {
          const why = partFailureReason(res);
          failedParts.push(`${title} — ${why}`);
          logEvent('PASTE_CODES', `⚠️ تعذر إضافة كود عطل ${title}: ${why}`);
        }
        await sleep(1500);
      }

      refreshCopiedCodesPreview(shadow);
      renderFavParts(shadow);

      if (manualWarranty.length) {
        logEvent('PASTE_CODES', `⚠️ ضمان يحتاج تعديلًا يدويًا: ${manualWarranty.join('، ')}`);
      }
      if (unverified.length) {
        logEvent('PASTE_CODES', `⚠️ حفظ بلا تحقق فعلي (${unverified.length}): ${unverified.join(' · ')}`);
      }
      if (failedParts.length) {
        logEvent('PASTE_CODES', `⛔ لم تُضف (${failedParts.length}): ${failedParts.join(' · ')}`);
      }

      const summaryParts = [];
      if (addedPartsCount > 0) summaryParts.push(`${addedPartsCount} قطعة غيار`);
      if (addedCodesCount > 0) summaryParts.push(`${addedCodesCount} كود عطل`);

      if (summaryParts.length > 0 || failedParts.length > 0) {
        const warnBits = [];
        if (failedParts.length) warnBits.push(`${failedParts.length} لم تُضف (${failedParts.slice(0, 2).join(' · ')})`);
        if (manualWarranty.length) warnBits.push(`راجع الضمان يدويًا: ${manualWarranty.join('، ')}`);
        if (unverified.length) warnBits.push(`${unverified.length} بلا تحقق فعلي`);
        const warn = warnBits.length ? ` — ⚠️ ${warnBits.join(' · ')}` : '';
        const done = summaryParts.length ? `✅ تم لصق ${summaryParts.join(' و ')}` : '⛔ لم يُضف أي عنصر';
        setStatus(shadow, `${done}${unverified.length || failedParts.length ? '' : ' وتحقّقت من الشبكة'}!${warn}`, warnBits.length ? 'warn' : 'success');
      } else {
        setStatus(shadow, 'ℹ️ جميع قطع الغيار والأكواد مضافة بالفعل في هذا البلاغ', 'success');
      }
      clearOrphanBackdrops('نهاية لصق الأكواد');
    } catch (e) {
      logEvent('PASTE_CODES', `خطأ: ${e.message || e}`);
      clearOrphanBackdrops('خطأ لصق الأكواد');
      setStatus(shadow, '❌ خطأ أثناء لصق الأكواد: ' + (e.message || ''), 'error');
    }
  }

  async function executePage3(shadow) {
    logEvent('EXEC_PAGE3', 'بدء التنفيذ');
    logEvent('OVERLAY', `ستائر Bootstrap قبل التنفيذ: ${countBackdrops()}`);
    logPageSnapshot('قبل executePage3');
    setStatus(shadow, '⏳ جاري التنفيذ...');
    try {
      assertNotCancelled();
      // 0. تمت الصيانة — يفتح النافذة ويترك المستخدم يختار
      if (shadow.getElementById('chk-done').checked) {
        setStatus(shadow, '⏳ جاري فتح نافذة تمت الصيانة...');
        logEvent('EXEC_PAGE3', 'فتح نافذة تمت الصيانة');
        let lookupBtn = null, lookupDoc = document;
        for (const doc of getShallowDocs()) {
          const btns = doc.querySelectorAll('button.launchentitylookup');
          lookupBtn = Array.from(btns).find(b => {
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            return (aria.includes('حالة') || aria.includes('booking')) && !aria.includes('الموديل');
          });
          if (lookupBtn) { lookupDoc = doc; break; }
        }
        if (lookupBtn) {
          // يفتح النافذة بس — يدوي
          const clearBtn = lookupBtn.parentElement?.querySelector('button[aria-label*="Clear"], button[aria-label*="مسح"]');
          if (clearBtn) { clearBtn.click(); await sleep(500); }
          lookupBtn.click();
          logEvent('EXEC_PAGE3', 'تم فتح نافذة Lookup — اختار يدوياً');

          // ⚠️ لا نكمل قبل أن يغلق المستخدم النافذة: فتح مودال الأكواد فوقها
          // كان يضيف ستارة Bootstrap ثانية (أسود 0.5) فوق الأولى ⇒ الشاشة تغمق.
          const appearDeadline = Date.now() + 5000;
          while (Date.now() < appearDeadline && !hasVisibleModal()) await sleep(250);

          if (!hasVisibleModal()) {
            logEvent('EXEC_PAGE3', 'نافذة الحالة لم تُرصد — استكمال التنفيذ مباشرة');
            clearOrphanBackdrops('بعد محاولة فتح الحالة');
          } else {
            setStatus(shadow, '✅ اختر «تمت الصيانة» من النافذة — سيُستكمل التنفيذ بعد إغلاقها');
            logEvent('EXEC_PAGE3', 'بانتظار اختيار «تمت الصيانة» (حتى دقيقتين)');
            const pickDeadline = Date.now() + 120000;
            while (Date.now() < pickDeadline && hasVisibleModal()) await sleep(500);
            if (hasVisibleModal()) {
              logEvent('EXEC_PAGE3', 'انتهت مهلة الاختيار — إغلاق النافذة وإيقاف التنفيذ');
              await resetModalsBeforeStep('مهلة اختيار الحالة');
              setStatus(shadow, '⚠️ لم يتم اختيار «تمت الصيانة» — أعد التنفيذ واختر الحالة', 'warn');
              return;
            }
            clearOrphanBackdrops('بعد اختيار تمت الصيانة');
            logEvent('EXEC_PAGE3', 'تم إغلاق نافذة الحالة — استكمال التنفيذ');
          }
        } else {
          logEvent('EXEC_PAGE3', 'لم يتم العثور على زر Lookup');
          setStatus(shadow, '⚠️ لم يتم العثور على زر الحالة', 'warn');
        }
        await sleep(1000);
      }

      // 1. حقن أكواد الأعطال
      const checkedCodes = shadow.querySelectorAll('.fault-cb:checked');
      logEvent('EXEC_PAGE3', `عدد أكواد الأعطال: ${checkedCodes.length}`);
      const injectFails = [];
      let injectOk = 0;
      for (const cb of checkedCodes) {
        assertNotCancelled();
        const parts = cb.value.split(',');
        const mainCode = parts[0], subCode = parts[1] || null;
        const label = mainCode + (subCode ? '/' + subCode : '');
        logEvent('EXEC_PAGE3', `حقن كود: ${mainCode} / ${subCode || ''}`);
        setStatus(shadow, `⏳ جاري حقن ${label}...`);
        // أي مودال عالق من الكود السابق يُغلق أولًا (وإلا فتحنا مودالًا فوقه ⇒ ستارة إضافية).
        await resetModalsBeforeStep(`حقن ${label}`);
        let codeRes = null;
        if (typeof addFaultCodePage3 === 'function') {
          codeRes = await addFaultCodePage3(mainCode, subCode, []);
        } else {
          codeRes = await addSingleFaultCode({ majorCode: mainCode, defectCode: subCode });
        }
        if (codeRes && codeRes.ok === false) {
          injectFails.push(`${label} (${codeRes.reason || 'غير معروف'})`);
          logEvent('EXEC_PAGE3', `⚠️ فشل حقن ${label}: ${codeRes.reason || 'غير معروف'}`);
        } else {
          injectOk++;
          logEvent('EXEC_PAGE3', `✅ حُقن ${label}${codeRes && codeRes.verified === true ? ' (مُتحقَّق في الشبكة)' : ''}`);
        }
        clearOrphanBackdrops(`بعد حقن ${label}`);
        await sleep(500);
      }

      // 2. جمل التقرير
      const checkedNotes = shadow.querySelectorAll('.note-cb:checked');
      logEvent('EXEC_PAGE3', `عدد الملاحظات: ${checkedNotes.length}`);
      if (checkedNotes.length > 0) {
        const noteTexts = Array.from(checkedNotes).map(cb => {
          if (cb.dataset.noteText) return cb.dataset.noteText;
          const idx = parseInt(cb.dataset.idx);
          return NOTES_LIST[idx] || '';
        }).filter(Boolean);
        if (noteTexts.length) {
          setStatus(shadow, '⏳ جاري إدراج النص...');
          let notesEl = typeof findFieldByLabel === 'function'
            ? (findFieldByLabel(['Notes', 'ملاحظات', 'الملاحظات', 'التعليق', 'notes_support'], 'textarea')
            || findFieldByLabel(['Notes', 'ملاحظات', 'الملاحظات', 'التعليق', 'notes_support'], 'input'))
            : null;
          if (!notesEl) notesEl = document.querySelector('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
          if (!notesEl) notesEl = document.querySelector('textarea.form-control, input.form-control[aria-label*="التعليق"]');
          if (!notesEl) {
            notesEl = findFirstInFrames('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
          }
          if (notesEl) {
            const sep = notesSeparator(notesEl);
            const combined = noteTexts.join(sep);
            const currentVal = (notesEl.value || '').trim();
            let textToSet = combined;
            if (currentVal) {
              if (!currentVal.includes(combined)) {
                textToSet = `${currentVal}${sep}${combined}`;
              } else {
                textToSet = currentVal;
              }
            }

            if (typeof emulateUserInput === 'function') {
              await emulateUserInput(notesEl, textToSet);
            } else {
              notesEl.value = textToSet;
              notesEl.dispatchEvent(new Event('input', { bubbles: true }));
              notesEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }

      // 3. المبلغ المحصل
      const amountVal = shadow.getElementById('cp-amount').value.trim();
      logEvent('EXEC_PAGE3', `المبلغ المحصل: ${amountVal}`);
      if (amountVal) {
        setStatus(shadow, `⏳ جاري تعيين المبلغ: ${amountVal}`);
        let amtEl = null;
        const findAmt = () => {
          let el = document.querySelector('#ldv_actualcollectedamount, input[aria-label*="المبلغ المحصل"], input.money.form-control');
          if (el) return el;
          return findFirstInFrames('#ldv_actualcollectedamount, input[aria-label*="المبلغ المحصل"], input[aria-label*="المبلغ"], input.money.form-control, input[id*="actualcollected"], input[id*="collectedamount"]');
        };
        for (let v = 0; v < 10; v++) {
          amtEl = findAmt();
          if (amtEl) break;
          await sleep(500);
        }
        if (amtEl) {
          if (typeof emulateUserInput === 'function') {
            await emulateUserInput(amtEl, amountVal);
          } else {
            amtEl.value = amountVal;
            amtEl.dispatchEvent(new Event('input', { bubbles: true }));
            amtEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          setStatus(shadow, '⚠️ حقل المبلغ المحصل غير موجود', 'warn');
        }
      }

      clearOrphanBackdrops('نهاية تنفيذ الصفحة 3');
      const totalCodes = checkedCodes.length;
      if (injectFails.length) {
        const okPart = injectOk ? `✅ ${injectOk}/${totalCodes} كود` : '⚠️ لم يُحقن أي كود';
        setStatus(shadow, `${okPart} • ❌ فشل: ${injectFails.join(' · ')}`, 'warn');
        logEvent('EXEC_PAGE3', `اكتمل التنفيذ مع فشل حقن: ${injectFails.join(' | ')}`);
      } else {
        setStatus(shadow, totalCodes ? `✅ تم التنفيذ بنجاح (${injectOk}/${totalCodes} كود)` : '✅ تم التنفيذ بنجاح', 'success');
        logEvent('EXEC_PAGE3', 'اكتمل التنفيذ');
      }
      logEvent('OVERLAY', `ستائر Bootstrap بعد التنفيذ: ${countBackdrops()}`);
      await sleep(800);
      if (!isMinimized && !injectFails.length) {
        logEvent('EXEC_PAGE3', 'تصغير التبويب تلقائياً');
        toggle(shadow, false, true);
      }
    } catch (e) {
      logEvent('EXEC_PAGE3', `خطأ: ${e.message || e}`);
      clearOrphanBackdrops('خطأ تنفيذ الصفحة 3');
      setStatus(shadow, '❌ خطأ: ' + (e.message || ''), 'error');
    }
  }

  function observePageChanges() {
    if (window.__cpHeartbeat) return; // مؤقّت واحد فقط مهما تكرّر init
    window.__cpHeartbeat = true;
    let lastPage = detectPage();
    let heartbeatCounter = 0; // increments every 1200ms
    const HEARTBEAT_MS = 1200;
    const heartbeatId = setInterval(() => {
     try {
      heartbeatCounter++;
      const page = detectPage();
      let host = document.getElementById(PANEL_ID);
      // البوابة SPA: إعادة بناء الصفحة تحذف عناصرنا ⇒ نعيد الحقن تلقائيًا
      if (!panelIsBuilt()) {
        try {
          if (host) { try { host.remove(); } catch (_) {} }
          injectPanel();
          host = document.getElementById(PANEL_ID);
          logEvent('INIT', 'إعادة حقن اللوحة بعد إعادة بناء صفحة البوابة');
        } catch (e) {
          logEvent('INIT', 'فشل إعادة حقن اللوحة: ' + (e.message || e));
        }
        return;
      }
      if (page !== lastPage) {
        lastPage = page;
        if (host && host.shadowRoot) updateTab(host.shadowRoot);
      } else if (page === 'PAGE_1' && host && host.shadowRoot) {
        // Check for model change and re-render note
        const mEl = findFirst(CFG.modelInput)
          || (typeof findFieldByLabel === 'function' ? findFieldByLabel(['الموديل الفعلي 1', 'Model']) : null);
        const cur = ((mEl?.value || mEl?.getAttribute?.('value') || '').trim().split(' _ ')[0].trim());
        if (cur !== _lastModelNoteValue) {
          renderModelNote(host.shadowRoot);
        }
      } else if (page === 'PAGE_2' && host && host.shadowRoot) {
        const warn = host.shadowRoot.getElementById('cp-install-warn');
        if (warn) {
          const isInstall = resolveIsInstall();
          warn.style.display = isInstall ? 'block' : 'none';
        }
        if (!document.getElementById(PAGE_WARN_ID)) injectInstallWarnIntoPage();
      }

      // Every ~1500ms (counter 1, 2, 3... = 1200, 2400, 3600...) -> watchFields
      if (heartbeatCounter % 2 === 0) { // ~2400ms
        const watchFields = [
          { sel: '#ats_bookingstatus_name', name: 'حالة الحجز' },
          { sel: '#ldv_actualcollectedamount', name: 'المبلغ المحصل' },
          { sel: '#ats_sparepartsstatus', name: 'قطع الغيار' },
          { sel: 'textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"]', name: 'الملاحظات' },
          { sel: '#ldv_resourcelastcomment', name: 'آخر تعليق' }
        ];
        for (const f of watchFields) {
          const el = document.querySelector(f.sel);
          if (el && el.value && el.value !== (el._lastVal || '')) {
            el._lastVal = el.value;
            logPage('FIELD_VAL', `${f.name}: ${el.value.slice(0, 80)}`);
          }
        }
      }

      // Every ~10000ms (counter ~8)
      if (heartbeatCounter % 8 === 0) {
        // شبكة أمان: إزالة أي ستارة Bootstrap يتيمة (شاشة سوداء تتغمق تدريجيًا).
        if (!hasVisibleModal()) clearOrphanBackdrops('فحص دوري');
        const url = location.href;
        const title = document.title;
        logPage('PAGE_STATE', `url=${url.slice(0,80)} title=${title.slice(0,40)}`);
      }
     } catch (e) {
       // نبضة واحدة فاشلة لا تُسقط المتابعة (كان خطأ واحد يوقف كل الفحوص)
       try { logEvent('HEARTBEAT', 'خطأ: ' + (e && (e.message || e))); } catch (_) {}
     }
    }, HEARTBEAT_MS);

    // Store for cleanup if needed
    window._cpHeartbeatId = heartbeatId;

    observePageDOM();
  }

  let pageLog = [];
  function logPage(type, detail) {
    const ts = new Date().toLocaleTimeString('ar-EG');
    const entry = `[${ts}] ${type}: ${detail}`;
    pageLog.push(entry);
    if (pageLog.length > 300) pageLog = pageLog.slice(-300);
    scheduleFlush();
  }

  function logPageSnapshot(context) {
    logPage('SNAPSHOT', `=== ${context} ===`);
    // الحقول المرئية
    const inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
    let visibleCount = 0;
    inputs.forEach(el => {
      if (el.offsetParent !== null && el.value) {
        visibleCount++;
        if (visibleCount <= 10) {
          const id = el.id || el.name || el.getAttribute('aria-label') || '?';
          logPage('SNAPSHOT', `  ${el.tagName}#${id} = "${el.value.slice(0,50)}"`);
        }
      }
    });
    logPage('SNAPSHOT', `  إجمالي الحقول المملوءة: ${visibleCount}`);

    // الأزرار المرئية
    const btns = document.querySelectorAll('button, a[role="button"]');
    let visibleBtns = 0;
    btns.forEach(b => {
      if (b.offsetParent !== null) visibleBtns++;
    });
    logPage('SNAPSHOT', `  أزرار مرئية: ${visibleBtns}`);

    // الجداول
    const tables = document.querySelectorAll('table');
    logPage('SNAPSHOT', `  جداول: ${tables.length}`);

    // الـ iframes
    const iframes = getShallowDocs().length - 1; // minus main document
    logPage('SNAPSHOT', `  iframes: ${iframes}`);
  }

  function observePageDOM() {
    logPage('PAGE', 'بدء مراقبة الصفحة');

    // Throttle buffer for MutationObserver logs (Wave B)
    const moLogBuffer = [];
    let moFlushTimer = null;
    const flushMoLogs = () => {
      if (moLogBuffer.length > 0) {
        moLogBuffer.forEach(entry => logPage(entry.type, entry.detail));
        moLogBuffer.length = 0;
      }
      moFlushTimer = null;
    };
    const enqueueMoLog = (type, detail) => {
      moLogBuffer.push({ type, detail });
      if (!moFlushTimer) moFlushTimer = setTimeout(flushMoLogs, 1200); // flush with heartbeat
    };

    // مراقبة تغييرات DOM
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const tag = node.tagName?.toLowerCase();
          // نافذة modal
          if (node.classList?.contains('modal') || node.querySelector?.('.modal')) {
            const isVisible = node.style.display !== 'none' && !node.classList.contains('hide');
            const id = node.id || node.className?.slice(0,50);
            enqueueMoLog('MODAL', isVisible ? `فتح: ${id}` : `إغلاق: ${id}`);
            // تفاصيل النافذة
            if (isVisible) {
              const btns = node.querySelectorAll('button');
              const inputs = node.querySelectorAll('input, select, textarea');
              enqueueMoLog('MODAL', `  أزرار: ${btns.length}, حقول: ${inputs.length}`);
              btns.forEach(b => {
                const txt = b.textContent?.trim().slice(0,30);
                const aria = b.getAttribute('aria-label') || '';
                if (txt || aria) enqueueMoLog('MODAL', `  زر: "${txt}" aria="${aria}"`);
              });
            }
          }
          // زر lookup
          if (tag === 'button' && node.classList?.contains('launchentitylookup')) {
            const label = node.getAttribute('aria-label') || node.textContent?.trim().slice(0,30);
            const id = node.id || '';
            enqueueMoLog('LOOKUP_BTN', `"${label}" id=${id}`);
          }
          // حقل input/select
          if (['input', 'select', 'textarea'].includes(tag)) {
            const id = node.id || node.name || node.getAttribute('aria-label') || '';
            const type = node.type || tag;
            enqueueMoLog('FIELD_ADDED', `${tag}#${id} type=${type}`);
          }
          // جدول
          if (tag === 'table' || node.classList?.contains('entity-grid')) {
            const rows = node.querySelectorAll('tr').length;
            enqueueMoLog('TABLE', `جدول جديد: ${rows} صفوف`);
          }
        }
        // حذف عناصر
        for (const node of m.removedNodes) {
          if (node.nodeType !== 1) continue;
          // Check for panel removal (reinject)
          if (node.id === PANEL_ID) {
            logEvent('INIT', 'اللوحة أزيلت من DOM — إعادة حقن');
            try { injectPanel(); } catch (e) { logEvent('INIT', 'فشل إعادة الحقن: ' + (e && e.message)); }
          }
          if (node.classList?.contains('modal')) {
            enqueueMoLog('MODAL', `إغلاق: ${node.id || 'unknown'}`);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // مراقبة تغييرات الحقول
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        const id = el.id || el.name || el.getAttribute('aria-label') || '';
        const val = el.value?.slice(0, 80);
        const tag = el.tagName;
        logPage('FIELD_CHANGE', `${tag}#${id} = "${val}"`);
      }
    }, true);

    // مراقبة النقر على الأزرار
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a, input[type="button"], input[type="submit"]');
      if (btn) {
        const text = btn.textContent?.trim().slice(0, 50) || '';
        const aria = btn.getAttribute('aria-label') || '';
        const id = btn.id || '';
        const cls = btn.className?.slice(0, 40) || '';
        logPage('BTN_CLICK', `"${text}" aria="${aria}" id=${id} class=${cls}`);
      }
    }, true);

    logPage('PAGE', 'تم تفعيل مراقبة الصفحة');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // أثر بدء التشغيل: يسمح بالتحقق من الإصدار الذي عمل فعلًا على الصفحة
  try {
    localStorage.setItem('elaraby_cp_boot', PANEL_BUILD + ' | ' + new Date().toISOString() + ' | ' + location.pathname);
  } catch (_) {}

  // شارة تشخيص: تظهر فقط لو السكربت عمل ولم تُبنَ اللوحة (بدل صمت تام)
  setTimeout(() => {
    try {
      if (!isWorkOrderPage() || panelIsBuilt()) return;
      const ctx = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? 'سياق سليم' : 'السياق منتهي — أعد تحميل الصفحة';
      showBootErrorChip('لم تُبنَ اللوحة — build ' + PANEL_BUILD + ' | ' + ctx);
    } catch (_) {}
  }, 3000);

  loadPersistedLogs();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
