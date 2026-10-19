// =========================================================
// control-panel.js — لوحة التحكم الذكية v1.0
// بصمة الإصدار: تُطبع في الـ log وتظهر بجانب عنوان اللوحة، للتأكد أن المتصفح
// حمّل أحدث نسخة من الإضافة (Reload من edge://extensions مطلوب بعد أي نشر).
const PANEL_BUILD = '2026-10-19.12';
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

  async function init() {
    if (!isWorkOrderPage()) return;
    if (!await ensureReady()) return;
    if (document.getElementById(PANEL_ID)) return;
    logEvent('INIT', 'بدء تحميل لوحة التحكم — build ' + PANEL_BUILD);
    await loadProductsDb();
    injectPanel();
    observePageChanges();
    logEvent('INIT', 'تم تحميل لوحة التحكم — build ' + PANEL_BUILD);
  }

  function loadState() {
    const raw = localStorage.getItem(STATE_KEY);
    const s = safeParseJSON(raw, { minimized: true, docked: false });
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
.cp-badge{display:inline-block;background:#1e3a5f;color:#a8c7fa;font-size:9px;padding:1px 5px;border-radius:8px;margin-right:3px}
.cp-install{color:#fbbf24;font-size:12px;font-weight:900}
.cp-maintenance{color:#a8c7fa;font-size:11px}
.cp-empty{color:#445577;padding:5px;text-align:center;font-size:10px}
.cp-notes-title{font-weight:700;color:#fbbf24;margin:6px 0 3px;padding-top:5px;border-top:1px solid #232840;font-size:11px}
.cp-model-note{display:none;background:#7c4d00;border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#fef3c7;line-height:1.5;text-align:center}
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
.cp-btn-gold{background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-size:11px;padding:6px}
.cp-panel.docked{position:relative!important;bottom:auto!important;right:auto!important;margin:6px 12px;width:auto;max-height:none;min-width:0;max-width:none;min-height:0;resize:none;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.cp-panel.docked .cp-header{cursor:default}
.cp-panel.docked .cp-body{max-height:60vh}
.cp-dock{background:rgba(255,255,255,.1);border:none;border-radius:50%;color:#94a3b8;cursor:pointer;width:22px;height:22px;font-size:12px;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s;margin-right:2px}
.cp-dock:hover{background:rgba(255,255,255,.2);color:#e2eaf5}
.cp-dock.active{background:rgba(23,51,76,.35);color:#ffffff; border:1px solid rgba(255,255,255,0.2)}
.cp-shortcuts{display:flex;flex-direction:column;gap:2px;margin:4px 0}
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
      <select class="cp-select" id="cp-problem-select"></select>
      <button class="cp-btn cp-btn-exec" id="btn-add-problem" type="button" style="margin-top:4px">➕ إضافة المشكلة المختارة</button>
    </div>
    <button class="cp-btn cp-btn-exec" id="btn-exec2">▶ تنفيذ يدوي</button>
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
    <label class="cp-label">أكواد إضافية (اختيار متعدد):</label>
    <div class="cp-codes" id="cp-codes-list"></div>
    <!-- Manual JSON input (replaces window.prompt) -->
    <div id="cp-manual-json-wrap" style="display:none;margin:8px 0">
      <label class="cp-label">أو الصق JSON يدوياً:</label>
      <textarea id="cp-manual-json" class="cp-amount" rows="3" placeholder='{"type":"ELARABY_CODES_BUNDLE","version":1,"faultCodes":[...],"spareParts":[...]}'></textarea>
      <div style="display:flex;gap:4px;margin-top:4px">
        <button class="cp-btn cp-btn-exec" id="cp-manual-json-apply" style="flex:1">✅ تطبيق</button>
        <button class="cp-btn" id="cp-manual-json-cancel" style="flex:1;background:#334466">✕ إلغاء</button>
      </div>
    </div>
    <div class="cp-shortcuts" id="cp-shortcuts">
      <div class="cp-notes-title" style="margin:4px 0 2px;padding-top:3px">⚡ شورت كت</div>
      <div class="cp-shortcut-row">
        <button class="cp-shortcut-btn" data-sc="pm"><span class="sc-icon">🔧</span>صيانة دورية</button>
        <button class="cp-shortcut-btn" data-sc="charge"><span class="sc-icon">❄️</span>شحن فريون</button>
        <button class="cp-shortcut-btn" data-sc="drain"><span class="sc-icon">💧</span>ضبط الصرف</button>
      </div>
      <div class="cp-shortcut-row" style="margin-top:2px">
        <button class="cp-shortcut-btn" data-sc="pull"><span class="sc-icon">📦</span>سحب و ارجاع</button>
        <button class="cp-shortcut-btn" data-sc="refuse"><span class="sc-icon">🚫</span>يرفض الدفع</button>
      </div>
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
<div class="cp-status" id="cp-status">✅ جاهز</div>
<div style="padding:3px 10px;border-top:1px solid #1a2340;display:flex;gap:4px">
  <button id="cp-copy-log" style="flex:1;padding:3px;border:1px solid #232840;border-radius:4px;background:#0d1528;color:#667799;font-size:9px;cursor:pointer">📋 نسخ اللوج</button>
  <button id="cp-clear-log" style="flex:1;padding:3px;border:1px solid #232840;border-radius:4px;background:#0d1528;color:#667799;font-size:9px;cursor:pointer">🗑️ مسح</button>
</div>
`;
  }

  function readPartsFromGrid() {
    const allDocs = getShallowDocs();

    for (const doc of allDocs) {
      // البحث أولاً في شبكات قطع الغيار المحددة حصراً لتجنب قراءة شبكة أكواد الأعطال (WorkOrder_defect)
      let rows = Array.from(doc.querySelectorAll(
        '#InventoryAdjustmentProduct_Subgrid table tbody tr, ' +
        '#InventoryAdjustmentProduct_SubGrid table tbody tr, ' +
        '#InventoryAdjustmentProductIsLscYes_Subgrid table tbody tr, ' +
        'div[data-name*="InventoryAdjustmentProduct"] table tbody tr, ' +
        'div[data-name*="inventoryadjustmentproduct"] table tbody tr'
      ));

      if (rows.length === 0) {
        // فحص الجداول التي ترويستها تحتوي صراحة على "قطعة الغيار" ولا تحتوي على "كود العطل"
        const tables = Array.from(doc.querySelectorAll('div.view-grid table, table'));
        for (const tbl of tables) {
          if (tbl.closest('#WorkOrder_defect, #WorkOrder_Defects, #WorkOrderDefectIsLscYes_Subgrid, [data-name*="WorkOrder_defect"], [data-name*="defect"]')) continue;
          const ths = Array.from(tbl.querySelectorAll('thead th, tr:first-child th')).map(th => th.innerText.trim());
          const thJoined = ths.join(' ');
          if (/قطعة\s*الغيار|Spare\s*Part/i.test(thJoined) && !/كود\s*العطل|Defect\s*Major/i.test(thJoined)) {
            rows = Array.from(tbl.querySelectorAll('tbody tr'));
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
        const rawText = tr.innerText.trim();
        if (!rawText || /no\s*records|لا\s*توجد/i.test(rawText)) return;
        if (/sort\s*descending|sort\s*ascending/i.test(rawText) && !tr.querySelector('td[data-attribute]')) return;

        let rawName = tr.getAttribute('data-name') || '';

        const codeTd = tr.querySelector('td[data-attribute="ats_productcode"], td[data-attribute="productnumber"], td[data-attribute*="code"]');
        const prodTd = tr.querySelector('td[data-attribute="msdyn_product"], td[data-attribute*="product"]:not([data-attribute*="code"]):not([data-attribute*="price"])');
        const qtyTd = tr.querySelector('td[data-attribute="ats_quantity"], td[data-attribute="quantity"]');
        const priceTd = tr.querySelector('td[data-attribute="ats_price"]');
        const totalTd = tr.querySelector('td[data-attribute="ats_totalprice"]');

        let code = '';
        if (codeTd) {
          code = (codeTd.getAttribute('data-value') || codeTd.innerText || '').trim();
        }

        let name = '';
        if (prodTd) {
          try {
            const parsed = JSON.parse(prodTd.getAttribute('data-value') || '{}');
            if (parsed.Name) name = parsed.Name;
          } catch(_) {}
          if (!name) {
            name = (prodTd.getAttribute('data-value') || prodTd.innerText || '').trim();
          }
        }

        // استخراج الكود والاسم في حال عدم توفرهما بحقول مخصصة
        if (!code && !name && rawName) {
          const parenMatch = rawName.match(/^([^(]+?)\s*\((.+)\)\s*$/);
          if (parenMatch) {
            code = parenMatch[1].trim();
            name = parenMatch[2].trim();
          } else {
            const dashMatch = rawName.match(/^([^-]+?)\s*[-_]\s*(.+)$/);
            if (dashMatch) {
              code = dashMatch[1].trim();
              name = dashMatch[2].trim();
            } else {
              name = rawName.trim();
            }
          }
        } else if (!name && rawName) {
          name = rawName.trim();
        }

        if (!code && name) {
          const parenMatch = name.match(/^([^(]+?)\s*\((.+)\)\s*$/);
          if (parenMatch) {
            code = parenMatch[1].trim();
          } else {
            const partsWithSpaces = name.split(/\s+[-–—_]\s+/);
            if (partsWithSpaces.length > 1) {
              code = partsWithSpaces[0].trim();
            }
          }
        }
        if (code) {
          code = code.replace(/[\s_\-–—]+$/, '').trim();
        }

        let qty = 1;
        if (qtyTd) {
          const qVal = parseFloat((qtyTd.getAttribute('data-value') || qtyTd.innerText || '1').replace(/[^0-9.]/g, ''));
          if (!isNaN(qVal) && qVal > 0) qty = qVal;
        }

        let priceVal = 0;
        let totalVal = 0;

        if (priceTd) {
          try { priceVal = JSON.parse(priceTd.getAttribute('data-value') || '{}').Value || 0; } catch(_) {
            priceVal = parseFloat((priceTd.getAttribute('data-value') || priceTd.innerText || '0').replace(/[^0-9.]/g, '')) || 0;
          }
        }
        if (totalTd) {
          try { totalVal = JSON.parse(totalTd.getAttribute('data-value') || '{}').Value || 0; } catch(_) {
            totalVal = parseFloat((totalTd.getAttribute('data-value') || totalTd.innerText || '0').replace(/[^0-9.]/g, '')) || 0;
          }
        }

        if (priceVal === 0 && totalVal > 0 && qty > 0) {
          priceVal = totalVal / qty;
        }

        if ((name || code) && (priceVal > 0 || totalVal > 0 || (rawText && !rawText.includes('كود العطل')))) {
          parts.push({
            code: code || '',
            name: name || rawName || '',
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

  async function executePartsShortcut(shadow) {
    logEvent('PARTS', 'بدء قراءة قطع الغيار');
    const { parts, total } = readPartsFromGrid();

    if (parts.length === 0) {
      setStatus(shadow, '⚠️ لا توجد قطع غيار في الجدول', 'warn');
      logEvent('PARTS', 'لم يتم العثور على قطع غيار');
      return;
    }

    const officialTotal = readOfficialSparePartsTotal();
    const spareStatus = readSparePartsStatusFromPage();

    logEvent('PARTS', `تم العثور على ${parts.length} قطعة - إجمالي الجدول: ${total} - الإجمالي الرسمي: ${officialTotal} - الحالة: ${spareStatus}`);

    let text = '';
    if (spareStatus === '963400000') {
      // مستعمل USED
      if (officialTotal <= 0) {
        // إذا كان الإجمالي الرسمي = 0 لا تكتب أي أسعار نهائياً
        const blocks = parts.map(p => {
          if (p.code && p.name) {
            return `[ ${p.code} (${p.name}) ]`;
          } else {
            return `[ ${p.name || p.code} ]`;
          }
        }).join('');
        text = `تم تغيير :${blocks}`;
      } else {
        // رسمي > 0 : كل قطعة بسعر الوحدة + والتكلفة [ الإجمالي الرسمي ]
        const blocks = parts.map(p => {
          if (p.code && p.name) {
            return `[ ${p.code} (${p.name}) ${p.price} ]`;
          } else {
            return `[ ${p.name || p.code} ${p.price} ]`;
          }
        }).join('');
        text = `تم تغيير :${blocks}// والتكلفة [ ${officialTotal} ]`;
      }
    } else {
      // منتظر WAITING (963400001 أو أي افتراضي آخر)
      const lines = parts.map(p => {
        const title = (p.code && p.name) ? `${p.code} (${p.name})` : (p.name || p.code);
        return `يحتاج ${title} بالتكلفة ${p.price}`;
      });
      text = lines.join('\n');
    }

    logEvent('PARTS', `النص:\n${text}`);

    let notesEl = findFirstInFrames('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');

    if (notesEl) {
      const currentVal = (notesEl.value || '').trim();
      let textToSet = text;
      if (currentVal) {
        if (!currentVal.includes(text)) {
          textToSet = `${text}\n${currentVal}`;
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
      logEvent('PARTS', 'تم حقن النص في حقل الملاحظات');
    } else {
      logEvent('PARTS', 'لم يتم العثور على حقل الملاحظات');
      setStatus(shadow, '⚠️ حقل الملاحظات غير موجود', 'warn');
    }

    const amtEl = shadow.getElementById('cp-amount');
    if (amtEl) amtEl.value = officialTotal;

    setStatus(shadow, `✅ ${parts.length} قطعة — الإجمالي المعتمد: ${officialTotal} ج.م`, 'success');
  }

  function bindEvents(shadow) {
    shadow.getElementById('cp-toggle').onclick = () => { logEvent('CLICK', 'نقر على زر التبديل'); toggle(shadow); };
    shadow.getElementById('cp-dock').onclick = () => { logEvent('CLICK', 'نقر على زر الإرساء'); toggleDock(shadow); };
    const defaultBtn = shadow.getElementById('btn-default-p1');
    if (defaultBtn) defaultBtn.onclick = () => { logEvent('CLICK', 'نقر على تعبئة بيانات افتراضية'); runExclusive(shadow, 'تعبئة افتراضية', () => fillDefaultDeviceData(shadow)); };
    shadow.getElementById('btn-exec1').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 1'); runExclusive(shadow, 'تنفيذ الصفحة 1', () => executePage1(shadow)); };
    shadow.getElementById('btn-exec2').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 2'); runExclusive(shadow, 'تنفيذ الصفحة 2', () => executePage2(shadow)); };
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
        runExclusive(shadow, 'إضافة مشكلة مختارة', () => addSelectedProblem(shadow));
      };
    }
    renderProblemOptions(shadow, loadProblemOptions());
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
    shadow.querySelectorAll('.cp-shortcut-btn').forEach(btn => {
      btn.onclick = () => {
        logEvent('SHORTCUT_PANEL', `${btn.dataset.sc} → تنفيذ`);
        runExclusive(shadow, `شورت كت ${btn.dataset.sc}`, async () => {
          runShortcut(shadow, btn.dataset.sc);
          await executePage3(shadow);
        });
      };
    });
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
    makeDraggable(shadow);
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
            <div style="display:flex;gap:3px">
              <button class="sc-popup-btn" data-sc="pm" style="flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:4px;background:#0d1528;color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">🔧 صيانة</button>
              <button class="sc-popup-btn" data-sc="charge" style="flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:4px;background:#0d1528;color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">❄️ شحن</button>
              <button class="sc-popup-btn" data-sc="drain" style="flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:4px;background:#0d1528;color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">💧 صرف</button>
            </div>
            <div style="display:flex;gap:3px;margin-top:3px">
              <button class="sc-popup-btn" data-sc="pull" style="flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:4px;background:#0d1528;color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">📦 سحب</button>
              <button class="sc-popup-btn" data-sc="refuse" style="flex:1;padding:4px 2px;border:1px solid #2a3050;border-radius:4px;background:#0d1528;color:#a8c7fa;font-size:9px;font-weight:600;cursor:pointer;text-align:center">🚫 رفض</button>
            </div>
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

        popup.querySelectorAll('.sc-popup-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sc = btn.dataset.sc;
            console.log(`%c[PortalHelper] POPUP SHORTCUT: ${sc} → select + execute`, 'color:#4ade80;font-weight:bold;font-size:14px');
            logEvent('SHORTCUT_POPUP', `شورت كت: ${sc} → تنفيذ`);
            popupBox.style.display = 'none';
            mini.style.transform = 'scale(1)';
            try {
              runExclusive(shadow, `شورت كت بوب-اب ${sc}`, async () => {
                runShortcut(shadow, sc);
                await executePage3(shadow);
              });
            } catch(err) {
              console.error('[PortalHelper] POPUP ERROR:', err);
              logEvent('SHORTCUT_POPUP', `خطأ: ${err.message}`);
            }
          });
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
      const target = document.querySelector('main, .main-content, .container, form, body');
      if (target && target !== document.body) {
        target.insertBefore(host, target.firstChild);
      } else {
        const form = document.querySelector('form');
        if (form) form.parentNode.insertBefore(host, form);
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

  function runShortcut(shadow, type) {
    logEvent('SHORTCUT', `بدء: ${type}`);
    logPageSnapshot(`شورت كت: ${type}`);
    console.log(`%c[PortalHelper] runShortcut: ${type}`, 'color:#fbbf24;font-weight:bold');

    // التحقق من وجود العناصر
    const allCbs = shadow.querySelectorAll('input[type="checkbox"]');
    const codes = shadow.querySelectorAll('.fault-cb');
    const notes = shadow.querySelectorAll('.note-cb');
    const amount = shadow.getElementById('cp-amount');

    logEvent('SHORTCUT', `DOM: جميع الـ checkboxes=${allCbs.length}, fault-cb=${codes.length}, note-cb=${notes.length}`);
    console.log(`%c[PortalHelper] DOM: total=${allCbs.length}, fault-cb=${codes.length}, note-cb=${notes.length}`, 'color:#60a5fa');

    // عرض قيم الـ checkboxes
    codes.forEach((cb, i) => {
      logEvent('SHORTCUT', `  [${i}] value="${cb.value}" checked=${cb.checked}`);
    });

    // مسح كل الـ checkboxes أولاً
    codes.forEach(cb => { cb.checked = false; });
    notes.forEach(cb => { cb.checked = false; });

    if (type === 'pm') {
      let checked = 0;
      codes.forEach(cb => {
        if (cb.value.startsWith('AC001,') || cb.value.startsWith('AC004,')) {
          cb.checked = true;
          checked++;
          logEvent('SHORTCUT', `✅ pm: تحديد ${cb.value}`);
        }
      });
      // تحديد الملاحظة رقم 2 (صيانة دورية)
      notes.forEach(cb => {
        if (parseInt(cb.dataset.idx) === 2) {
          cb.checked = true;
          logEvent('SHORTCUT', `✅ pm: تحديد ملاحظة idx=2`);
        }
      });
      if (amount) amount.value = '0';
      setStatus(shadow, `✅ صيانة دورية (${checked} كود) + 0 جنيه`, 'success');
      logEvent('SHORTCUT', `النتيجة: ${checked} كود, ملاحظة واحدة, 0 جنيه`);
    } else if (type === 'charge') {
      let checked = 0;
      codes.forEach(cb => {
        if (cb.value.startsWith('AC003,')) {
          cb.checked = true;
          checked++;
          logEvent('SHORTCUT', `✅ charge: تحديد ${cb.value}`);
        }
      });
      if (amount) amount.value = '0';
      setStatus(shadow, `✅ شحن فريون (${checked} كود) + 0 جنيه`, 'success');
      logEvent('SHORTCUT', `النتيجة: ${checked} كود, 0 جنيه`);
    } else if (type === 'drain') {
      let checked = 0;
      codes.forEach(cb => {
        if (cb.value.startsWith('AC004,')) {
          cb.checked = true;
          checked++;
          logEvent('SHORTCUT', `✅ drain: تحديد ${cb.value}`);
        }
      });
      if (amount) amount.value = '0';
      setStatus(shadow, `✅ ضبط الصرف (${checked} كود) + 0 جنيه`, 'success');
      logEvent('SHORTCUT', `النتيجة: ${checked} كود, 0 جنيه`);
    } else if (type === 'refuse') {
      let checked = 0;
      codes.forEach(cb => {
        if (cb.value.startsWith('AC005,')) {
          cb.checked = true;
          checked++;
          logEvent('SHORTCUT', `✅ refuse: تحديد ${cb.value}`);
        }
      });
      if (amount) amount.value = '0';
      // قطع الغيار
      const spareEl = typeof findFieldByLabel === 'function' ? findFieldByLabel(['حالة قطع الغيار', 'Spare Parts'], 'select') : null;
      if (spareEl && spareEl.tagName === 'SELECT') {
        const noneOpt = Array.from(spareEl.options).find(o => /بدون قطع غيار/i.test(o.text));
        if (noneOpt) {
          spareEl.value = noneOpt.value;
          spareEl.dispatchEvent(new Event('change', { bubbles: true }));
          logEvent('SHORTCUT', 'قطع غيار: بدون قطع غيار');
        }
      }
      // فتح نافذة يرفض الدفع
      if (typeof fillLookupModal === 'function') {
        const actionBtn = document.querySelector('button.launchentitylookup[aria-label*="الفعل"], button.launchentitylookup[aria-label*="حالة"], button.launchentitylookup[aria-label*="الحالة"]');
        if (actionBtn) {
          fillLookupModal(actionBtn, 'العميل يرفض الدفع');
          logEvent('SHORTCUT', 'فتح نافذة يرفض الدفع');
        }
      }
      setStatus(shadow, `✅ رفض الدفع (${checked} كود) + 0 جنيه`, 'success');
      logEvent('SHORTCUT', `النتيجة: ${checked} كود, 0 جنيه`);
    } else if (type === 'pull') {
      // سحب و ارجاع: الـ 5 أكواد كلهم + ملاحظة + 0 جنيه
      const pullCodes = ['AC001,', 'AC004,', 'AC006,', 'AC003,'];
      let checked = 0;
      codes.forEach(cb => {
        if (pullCodes.some(prefix => cb.value.startsWith(prefix))) {
          cb.checked = true;
          checked++;
          logEvent('SHORTCUT', `✅ pull: تحديد ${cb.value}`);
        }
      });
      // تحديد ملاحظة السحب (idx=5)
      notes.forEach(cb => {
        if (parseInt(cb.dataset.idx) === 5) {
          cb.checked = true;
          logEvent('SHORTCUT', `✅ pull: تحديد ملاحظة idx=5`);
        }
      });
      if (amount) amount.value = '0';
      setStatus(shadow, `✅ سحب و ارجاع (${checked} كود) + 0 جنيه`, 'success');
      logEvent('SHORTCUT', `النتيجة: ${checked} كود, ملاحظة سحب, 0 جنيه`);
    }

    // التحقق النهائي
    const finalChecked = shadow.querySelectorAll('.fault-cb:checked');
    logEvent('SHORTCUT', `=== النهاية: ${finalChecked.length} كود محدد ===`);
    console.log(`%c[PortalHelper] SHORTCUT DONE: ${finalChecked.length} codes checked`, 'color:#4ade80;font-weight:bold');
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

  // منع التشغيل المتوازي لأي تنفيذ (نقر مزدوج / اختصارات متعددة / بوب-اب + لوحة)
  let execLock = false;
  async function runExclusive(shadow, label, fn) {
    if (execLock) {
      logEvent('EXEC', `مرفوض (${label}): يوجد تنفيذ جارٍ`);
      setStatus(shadow, '⏳ يوجد تنفيذ جارٍ — انتظر انتهائه', 'warn');
      return;
    }
    execLock = true;
    setStatus(shadow, `⏳ جارٍ: ${label}…`, 'warn');
    try {
      await fn();
    } catch (e) {
      console.error('[PortalHelper] EXEC ERROR:', label, e);
      logEvent('EXEC', `خطأ (${label}): ${e && e.message}`);
      setStatus(shadow, `❌ خطأ: ${e && e.message}`, 'error');
    } finally {
      execLock = false;
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
    if (page === 'PAGE_3') updateDeviceCodes(shadow);
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

  // مصدر واحد لكشف "تركيب": الحقول المهيكلة أولًا (أقوى) ثم منطق الـ engine المشترك
  function resolveIsInstall() {
    try { if (detectInstallation()) return true; } catch(_) {}
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

  function updateDeviceCodes(shadow) {
    const span = shadow.getElementById('cp-device-type');
    const list = shadow.getElementById('cp-codes-list');
    if (!span || !list) { logEvent('CODES', 'span أو list غير موجود'); return; }
    const device = readDeviceHint();
    span.textContent = device || 'غير معروف';
    const isInstall = resolveIsInstall();
    logEvent('CODES', `device="${device}" isInstall=${isInstall}`);
    const isAC = getDeviceAC();
    logEvent('CODES', `device="${device}" isAC=${isAC}`);
    if (isAC) {
      list.innerHTML = `
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC001,0005,AC00000005"> <span>AC001 — صيانة دورية <span class="cp-badge">0005</span></span></label>
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC004,308A,AC0300308A"> <span>AC004 — ضبط حوض الصرف <span class="cp-badge">308A</span></span></label>
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC003,L02B,AC9000L02B"> <span>AC003 — فاكيوم و شحن <span class="cp-badge">L02B</span></span></label>
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC006,F01,AC7000F01"> <span>AC006 — سحب الجهاز <span class="cp-badge">F01</span></span></label>
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC006,F02,AC7000F02"> <span>AC006 — إرجاع الجهاز <span class="cp-badge">F02</span></span></label>
<label class="cp-check"><input type="checkbox" class="fault-cb" value="AC005,N02,AC0000N02"> <span>AC005 — لا يوجد عطل <span class="cp-badge">N02</span></span></label>`;
      logEvent('CODES', `تم إنشاء ${list.querySelectorAll('.fault-cb').length} checkboxes`);
    } else {
      list.innerHTML = '<div class="cp-empty">لا توجد أكواد افتراضية لهذا الجهاز</div>';
      logEvent('CODES', 'لم يتم إنشاء checkboxes (ليس AC)');
    }
    refreshCopiedCodesPreview(shadow);
    updateDeviceNotes(shadow);
  }

  const NOTES_LIST = [
    "تم عمل صيانه وتنظيف الوحده الداخليه والوحده الخارجيه وغسيل بمكنه الغسيل وتنظيف حوض الصرف | خدمة بريميوم كير Premium Care وتحصيل 450",
    "تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف",
    "تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف",
    "يحتاج كباس وفلتر وريلاي واوفرلود",
    "تم تغيير كباس وفلتر وتم تنظيف الدائرة وعمل فاكيوم وشحن فريون وريلاي واوفرلود وتنظيف الصرف وضبط الجوانات",
    "تم سحب الجهاز و تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون و تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف وتم إعادة وتشغيل الجهاز بالكامل بعد الاصلاح بمركز الخدمه"
  ];

  function updateDeviceNotes(shadow) {
    const list = shadow.getElementById('cp-notes-list');
    if (!list) return;
    list.innerHTML = NOTES_LIST.map((n, i) =>
      `<label class="cp-note-item" draggable="true" data-idx="${i}"><input type="checkbox" class="note-cb" data-idx="${i}" /> <span class="ni-handle">⠿</span> <span class="ni-text">${n}</span></label>`
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
      const srcIdx = parseInt(dragSrc.dataset.idx);
      const tgtIdx = parseInt(target.dataset.idx);
      if (srcIdx === tgtIdx) return;
      const checkedNotes = new Set();
      shadow.querySelectorAll('.note-cb:checked').forEach(cb => {
        checkedNotes.add(NOTES_LIST[parseInt(cb.dataset.idx)]);
      });
      const [moved] = NOTES_LIST.splice(srcIdx, 1);
      NOTES_LIST.splice(tgtIdx, 0, moved);
      updateDeviceNotes(shadow);
      shadow.querySelectorAll('.note-cb').forEach(cb => {
        cb.checked = checkedNotes.has(NOTES_LIST[parseInt(cb.dataset.idx)]);
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

  let _lastModelNoteValue = '';
  async function renderModelNote(shadow) {
    const el = shadow.getElementById('cp-model-note');
    if (!el) return;
    const mEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'Model']);
    const raw = ((mEl?.value || mEl?.getAttribute?.('value') || '').trim().split(' _ ')[0].trim());
    if (!raw) {
      el.style.display = 'none';
      el.textContent = '';
      _lastModelNoteValue = '';
      return;
    }
    if (raw === _lastModelNoteValue) return;
    const data = await loadModelNotes();
    if (!data) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    const hit = data.find(e => (e.model || '').trim() === raw);
    if (!hit) {
      el.style.display = 'none';
      el.textContent = '';
      _lastModelNoteValue = raw;
      return;
    }
    el.textContent = hit.message;
    el.style.display = 'block';
    _lastModelNoteValue = raw;
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

  function loadProblemOptions() {
    try {
      const raw = localStorage.getItem(PROBLEM_OPTIONS_KEY);
      const obj = safeParseJSON(raw, null);
      if (!obj || !Array.isArray(obj.list)) return [];
      // القائمة صالحة 30 دقيقة فقط — بعدها تكون مرتبطة بأمر شغل آخر
      if (obj.ts && (Date.now() - obj.ts) > 30 * 60 * 1000) return [];
      return obj.list.filter(Boolean);
    } catch (_) { return []; }
  }

  function saveProblemOptions(options) {
    try { localStorage.setItem(PROBLEM_OPTIONS_KEY, JSON.stringify({ ts: Date.now(), list: options || [] })); } catch (_) {}
  }

  function extractProblemCode(label) {
    const s = String(label || '').trim();
    const head = s.split(/\s+[-–]\s+/)[0] || s;
    return head.trim() || s;
  }

  function renderProblemOptions(shadow, options) {
    const box = shadow.getElementById('cp-problem-picker');
    const sel = shadow.getElementById('cp-problem-select');
    if (!box || !sel) return;
    const list = (options || []).filter(Boolean);
    saveProblemOptions(list);
    if (!list.length) { box.style.display = 'none'; return; }
    sel.innerHTML = list
      .map(o => `<option value="${String(o).replace(/"/g, '&quot;')}">${String(o).replace(/</g, '&lt;')}</option>`)
      .join('');
    box.style.display = 'block';
  }

  async function addSelectedProblem(shadow) {
    const sel = shadow.getElementById('cp-problem-select');
    const label = sel ? sel.value : '';
    if (!label) { setStatus(shadow, '⚠️ اختر مشكلة من القائمة أولًا', 'warn'); return; }
    const code = extractProblemCode(label);
    logEvent('PROB_PICK', `إضافة مشكلة مختارة: ${label}`);
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
        /ترصيد|ارضي|أرضي|بلاغ/i,
        null
      );
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

  async function executePage2(shadow, shortcutType) {
    logEvent('EXEC_PAGE2', `بدء التنفيذ${shortcutType ? ' [شورت كت: ' + shortcutType + ']' : ''}`);
    setStatus(shadow, '⏳ جاري التنفيذ...');
    try {
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
        const isInstall = resolveIsInstall();
        logEvent('EXEC_PAGE2', `إضافة مشاكل: الجهاز=${device}, النوع=${isInstall ? 'تركيب' : 'صيانة'}`);
        const probCode = typeof getSmartProblemCode === 'function'
          ? await getSmartProblemCode(device, isInstall)
          : (typeof getProblemCode === 'function' ? getProblemCode(device, isInstall) : null);
        logEvent('EXEC_PAGE2', `كود المشكلة: ${probCode || 'غير موجود'}`);
        if (probCode && typeof handleSubgridIframeModal === 'function') {
          setStatus(shadow, `⏳ جاري إضافة المشكلة: ${probCode}...`);
          try {
            const probRes = await handleSubgridIframeModal(
              /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i,
              probCode,
              false,
              /ترصيد|ارضي|أرضي|بلاغ/i,
              isInstall ? /تركيب وتشغيل/i : null
            );
            probOk = !!(probRes && probRes.ok);
            probLabel = (probRes && probRes.name) || probCode;
            probReason = (probRes && probRes.reason) || '';
            probAvailable = (probRes && Array.isArray(probRes.available)) ? probRes.available : [];
            logEvent('EXEC_PAGE2', `نتيجة المشكلة: ok=${probOk} name=${probLabel} reason=${probReason || '—'}`);
            if (!probOk && probAvailable.length) {
              logEvent('EXEC_PAGE2', 'الأكواد المتاحة في هذه القائمة: ' + probAvailable.join(' | '));
              renderProblemOptions(shadow, probAvailable);
              logEvent('EXEC_PAGE2', 'تم عرض قائمة الاختيار السريع — اختر مشكلة واضغط «إضافة المشكلة المختارة»');
            }
          } catch (e) {
            logEvent('EXEC_PAGE2', 'فشل إضافة المشكلة: ' + (e.message || e));
          }
        } else {
          logEvent('EXEC_PAGE2', 'لا يوجد كود مشكلة — تم التخطي');
        }
        await sleep(2000);
      }

      if (addTech) {
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
            await sleep(3000);
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

      // 3. التالي
      await doNext(shadow);

      if (outcomeOk) setStatus(shadow, '✅ تم التنفيذ بنجاح', 'success');
      logEvent('EXEC_PAGE2', 'اكتمل التنفيذ');
      await sleep(800);
      if (!isMinimized) {
        logEvent('EXEC_PAGE2', 'تصغير التبويب تلقائياً');
        toggle(shadow, false, true);
      }
    } catch (e) {
      logEvent('EXEC_PAGE2', `خطأ: ${e.message || e}`);
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

  function extractFaultCodesFromPage(shadow) {
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
          const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(th => (th.innerText || '').trim());
          const majorColIdx = ths.findIndex(t => /كود\s*العطل\s*الرئيسي/i.test(t));
          const defectColIdx = ths.findIndex(t => /^كود\s*العطل/i.test(t));
          const descColIdx = ths.findIndex(t => /وصف\s*كود\s*العطل/i.test(t));

          if (majorColIdx >= 0 || defectColIdx >= 0) {
            const trs = table.querySelectorAll('tbody tr');
            trs.forEach(tr => {
              const tds = tr.querySelectorAll('td');
              if (tds.length === 0) return;
              const mText = majorColIdx >= 0 && tds[majorColIdx] ? tds[majorColIdx].innerText.trim() : '';
              const dText = defectColIdx >= 0 && tds[defectColIdx] ? tds[defectColIdx].innerText.trim() : '';
              const descText = descColIdx >= 0 && tds[descColIdx] ? tds[descColIdx].innerText.trim() : '';
              if (mText || dText) {
                const mCode = mText.split(/\s*[-–—_]\s*/)[0]?.trim() || mText;
                const fCode = descText ? (descText.split(/\s*[-–—_]\s*/)[0]?.trim() || dText) : dText;
                const key = `${mCode}|${dText}|${fCode}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  faultCodes.push({
                    majorCode: mCode,
                    majorName: mText,
                    defectCode: dText,
                    fullCode: fCode,
                    description: descText
                  });
                }
              }
            });
          }
        });
      }
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
        faultCodes.push({
          majorCode: m,
          majorName: label || m,
          defectCode: s,
          fullCode: full || s || m,
          description: label
        });
      });
    }

    const partsRes = readPartsFromGrid();
    const amtVal = shadow ? (shadow.getElementById('cp-amount')?.value?.trim() || readCollectedAmountFromPage()) : readCollectedAmountFromPage();
    const notesVal = readNotesFromPage();

    return {
      type: 'ELARABY_CODES_BUNDLE',
      version: 1,
      copiedAt: new Date().toISOString(),
      sourceUrl: location.pathname + location.search,
      faultCodes,
      spareParts: partsRes?.parts || [],
      amount: amtVal || '0',
      notes: notesVal || ''
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
      const bundle = safeParseJSON(raw, null);
      if (bundle && ((Array.isArray(bundle.faultCodes) && bundle.faultCodes.length > 0) || (Array.isArray(bundle.spareParts) && bundle.spareParts.length > 0))) {
        const partsCount = bundle.spareParts?.length || 0;
        const codesCount = bundle.faultCodes?.length || 0;
        const codesSummary = (bundle.faultCodes || []).map(c => escapeHtml(c.fullCode || c.defectCode || c.majorCode)).join('، ');
        const partsText = partsCount > 0 ? ` + <b>${partsCount} قطعة غيار</b>` : '';
        preview.innerHTML = `<span>📋 <b>${codesCount} كود منسوخ</b>${partsText} جاهز للصق: ${codesSummary}</span>`;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    } catch(_) {
      preview.style.display = 'none';
    }
  }

  async function copyCodesAction(shadow) {
    logEvent('COPY_CODES', 'بدء نسخ الأكواد من الصفحة');
    setStatus(shadow, '⏳ جاري استخراج الأكواد من الصفحة...');
    try {
      const bundle = extractFaultCodesFromPage(shadow);
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

  async function fillIframeLookup(iframeDoc, inputId, searchValue) {
    if (!iframeDoc || !inputId) return { ok: false, reason: 'معاملات البحث غير صالحة' };
    const input = iframeDoc.getElementById(inputId);
    if (!input) return { ok: false, reason: `الحقل ${inputId} غير موجود في النموذج` };

    const group = input.closest('.input-group') || input.parentElement;
    const launchBtn = group?.querySelector('button.launchentitylookup') || 
                      group?.querySelector('button[aria-label*="Launch"], button[title*="Launch"]') ||
                      group?.querySelectorAll('button')[1] ||
                      group?.querySelector('button');

    if (!launchBtn) return { ok: false, reason: `زر فتح البحث لـ ${inputId} غير موجود` };

    // تفريغ القيمة السابقة إذا كانت موجودة
    const clearBtn = group.querySelector('button[aria-label*="Clear"], button[title*="Clear"]');
    if (clearBtn && input.value) {
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

    if (cleanSearch && searchInput && searchBtn) {
      logEvent('PASTE_CODES', `كتابة نص البحث: "${cleanSearch}"`);
      searchInput.value = cleanSearch;
      try { searchInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { searchInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      await safeClick(searchBtn);
      await sleep(1800);
    }

    // قراءة صفوف النتائج
    let rows = Array.from(lookupModal.querySelectorAll('table tbody tr')).filter(r => {
      try {
        if (r.offsetParent === null) return false;
        const txt = r.innerText.trim();
        return txt.length > 0 && !/no\s*records|لا\s*توجد/i.test(txt);
      } catch(_) { return false; }
    });

    // لو لم تظهر نتائج بالبحث النصي المحدد، مسح حقل البحث وعرض كل السجلات المتاحة للموديل/العطل
    if (rows.length === 0 && searchInput && searchBtn) {
      logEvent('PASTE_CODES', `لا توجد نتائج لـ "${cleanSearch}"، جاري مسح البحث وعرض كل الخيارات المتاحة`);
      searchInput.value = '';
      try { searchInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { searchInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      await safeClick(searchBtn);
      await sleep(1800);
      rows = Array.from(lookupModal.querySelectorAll('table tbody tr')).filter(r => {
        try {
          if (r.offsetParent === null) return false;
          const txt = r.innerText.trim();
          return txt.length > 0 && !/no\s*records|لا\s*توجد/i.test(txt);
        } catch(_) { return false; }
      });
    }

    if (rows.length === 0) {
      logEvent('PASTE_CODES', `لا توجد صفوف نتائج في بحث ${inputId} عن "${cleanSearch}"`);
      const closeBtn = lookupModal.querySelector('button.close, [data-dismiss="modal"]');
      if (closeBtn) await safeClick(closeBtn);
      return { ok: false, reason: `لا توجد نتائج مطابقة لـ "${cleanSearch}"` };
    }

    // مطابقة الصف الأنسب
    const targetLower = cleanSearch.toLowerCase();
    const matchRow = rows.find(r => r.innerText.toLowerCase().includes(targetLower)) || rows[0];

    await safeClick(matchRow);
    const radio = matchRow.querySelector('input[type="radio"], input[type="checkbox"]');
    if (radio) {
      radio.checked = true;
      try { radio.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    }

    await sleep(400);

    const selectBtn = Array.from(lookupModal.querySelectorAll('button, input[type="button"]')).find(b => {
      const t = (b.innerText || b.getAttribute('aria-label') || b.title || b.value || '').trim();
      return /^(اختر|select)$/i.test(t) || (b.classList.contains('btn-primary') && !/بحث|search/i.test(t));
    }) || lookupModal.querySelector('button.btn-primary, button.primary, button[aria-label*="Select"], button[title*="Select"], button[aria-label*="اختر"], button[title*="اختر"]');

    if (selectBtn) {
      selectBtn.removeAttribute('disabled');
      selectBtn.classList.remove('disabled');
      await safeClick(selectBtn);
      try { selectBtn.click(); } catch(_) {}
    }

    const lookupCloseDeadline = Date.now() + 8000;
    while (Date.now() < lookupCloseDeadline) {
      if (!isModalOpenSafe(lookupModal) || !iframeDoc.body.contains(lookupModal)) break;
      await sleep(300);
    }

    await sleep(1000);
    logEvent('PASTE_CODES', `تم اختيار القيمة بنجاح لـ ${inputId}: "${input.value}"`);
    return { ok: true, val: input.value };
  }

  async function addSparePartPage3(spObj, faultCodeObj = null) {
    if (!spObj) return { ok: false, reason: 'بيانات قطعة الغيار غير صالحة' };
    const majorSearch = (faultCodeObj?.majorCode || faultCodeObj?.majorName || spObj.majorCode || spObj.majorName || '').trim();
    const subSearch = (faultCodeObj?.defectCode || faultCodeObj?.fullCode || spObj.defectCode || spObj.defect || spObj.fullCode || '').trim();
    const partSearch = (spObj.name || spObj.code || spObj.product || '').trim();
    const partCodeOnly = (spObj.code || partSearch.split(/\s*[_–—]\s*/)[0] || '').trim();
    const qty = String(spObj.qty || 1);

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
      return { ok: false, reason: 'زر إضافة قطعة غيار غير موجود أو غير مرئي' };
    }

    if (window.$ && window.$._data) {
      try {
        const ev = window.$._data(addBtn, 'events');
        if (ev?.click?.[0]) ev.click[0].handler({ preventDefault: () => {} });
      } catch(_) {}
    }
    await safeClick(addBtn);
    try { addBtn.click(); } catch(_) {}
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
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'فشل تحميل إطار نموذج إضافة قطعة الغيار' };
    }

    await sleep(1000);

    // 5. كود العطل الرئيسي
    if (majorSearch) {
      await fillIframeLookup(iframeDoc, 'ats_modeldefectmajor_name', majorSearch);
      await sleep(2000);
    }

    // 6. كود العطل الفرعي
    if (subSearch) {
      await fillIframeLookup(iframeDoc, 'ats_defectcodedefectmajor_name', subSearch);
      await sleep(1500);
    }

    // 7. قطعة الغيار
    if (partCodeOnly || partSearch) {
      await fillIframeLookup(iframeDoc, 'ats_modeldefectspid_name', partCodeOnly || partSearch);
      await sleep(1200);
    }

    // 8. الكمية
    const qtyInput = iframeDoc.getElementById('ats_quantity');
    if (qtyInput) {
      qtyInput.value = qty;
      try { qtyInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { qtyInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    }

    // 9. زر الحفظ
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, input[value="حفظ"], input[value="Submit"], button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      logEvent('PASTE_CODES', 'نقر زر حفظ قطعة الغيار');
      await safeClick(saveBtn);
      try { saveBtn.click(); } catch(_) {}
      const saveDeadline = Date.now() + 15000;
      while (Date.now() < saveDeadline) {
        if (!isModalOpenSafe(modal) || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(2500); // إتاحة وقت كافي للبورتال لتحديث شبكة المنتجات AJAX
      return { ok: true, name: partSearch || partCodeOnly };
    }

    const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
    if (closeBtn) closeBtn.click();
    return { ok: false, reason: 'زر الحفظ غير موجود في نموذج قطعة الغيار' };
  }

  async function addSingleFaultCode(codeObj) {
    if (!codeObj) return { ok: false, reason: 'بيانات الكود غير صالحة' };
    const mainSearch = (codeObj.majorCode || codeObj.majorName || codeObj.fullCode || '').trim();
    const subSearch = (codeObj.defectCode || codeObj.fullCode || codeObj.description || '').trim();

    if (!mainSearch && !subSearch) return { ok: false, reason: 'لا يوجد كود رئيسي أو فرعي للبحث' };

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
      return { ok: false, reason: 'زر إضافة كود عطل غير موجود أو غير مرئي' };
    }

    if (window.$ && window.$._data) {
      try {
        const ev = window.$._data(addBtn, 'events');
        if (ev?.click?.[0]) ev.click[0].handler({ preventDefault: () => {} });
      } catch(_) {}
    }
    await safeClick(addBtn);
    try { addBtn.click(); } catch(_) {}
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
      const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
      return { ok: false, reason: 'فشل تحميل إطار نموذج إضافة كود العطل (iframe)' };
    }

    await sleep(1000);

    // 4. خطوة كود العطل الرئيسي (Major defect lookup)
    if (mainSearch) {
      await fillIframeLookup(iframeDoc, 'ats_modeldefectmajor_name', mainSearch);
      await sleep(2000);
    }

    // 5. خطوة كود العطل الفرعي (Sub defect lookup)
    if (subSearch) {
      await fillIframeLookup(iframeDoc, 'ats_defectcodedefectmajor_name', subSearch);
      await sleep(1200);
    }

    // 6. نقر زر الحفظ (InsertButton / SubmitButton)
    const saveBtn = iframeDoc.querySelector('#InsertButton, #SubmitButton, input[value="حفظ"], input[value="Submit"], button[type="submit"], input[type="submit"], button.btn-primary');
    if (saveBtn) {
      logEvent('PASTE_CODES', 'نقر زر حفظ كود العطل');
      await safeClick(saveBtn);
      try { saveBtn.click(); } catch(_) {}
      const saveDeadline = Date.now() + 15000;
      while (Date.now() < saveDeadline) {
        if (!isModalOpenSafe(modal) || !document.body.contains(modal)) break;
        await sleep(400);
      }
      await sleep(2500); // إتاحة وقت كافي للبورتال لتحديث شبكة الأعطال AJAX
      return { ok: true, name: subSearch || mainSearch };
    }

    const closeBtn = modal.querySelector('button.form-close, button.close, [data-dismiss="modal"]');
    if (closeBtn) closeBtn.click();
    return { ok: false, reason: 'لم يتم العثور على زر الحفظ' };
  }

  async function pasteCodesAction(shadow) {
    logEvent('PASTE_CODES', 'بدء لصق الأكواد وقطع الغيار');
    setStatus(shadow, '⏳ جاري قراءة البيانات المحفوظة...');
    try {
      let bundle = null;
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          const trimmed = clipText.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length > 0) {
              bundle = { faultCodes: parsed };
              logEvent('PASTE_CODES', 'تم قراءة مصفوفة أكواد من الحافظة');
            } else if (parsed && (Array.isArray(parsed.faultCodes) || Array.isArray(parsed.spareParts))) {
              bundle = parsed;
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
                  if (parsed && Array.isArray(parsed)) bundle = { faultCodes: parsed };
                  else if (parsed && (Array.isArray(parsed.faultCodes) || Array.isArray(parsed.spareParts))) bundle = parsed;
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

      const rawSpareParts = Array.isArray(bundle?.spareParts) ? bundle.spareParts : [];
      const rawFaultCodes = Array.isArray(bundle?.faultCodes) ? bundle.faultCodes : [];

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

      // تصنيف العناصر بدقة:
      // 1. الأكواد المقترنة بقطع غيار -> تُضاف عبر "اضافة قطعة غيار"
      // 2. الأكواد المستقلة بدون قطع غيار -> تُضاف عبر "اضافة كود عطل"
      const sparePartJobs = [];
      const pairedFaultIndices = new Set();

      rawSpareParts.forEach((sp, spIdx) => {
        let bestCode = null;
        let bestIdx = -1;

        const spText = ((sp.name || '') + ' ' + (sp.code || '')).toLowerCase();
        for (let i = 0; i < rawFaultCodes.length; i++) {
          if (pairedFaultIndices.has(i)) continue;
          const fc = rawFaultCodes[i];
          const fcText = ((fc.description || '') + ' ' + (fc.majorName || '') + ' ' + (fc.fullCode || '')).toLowerCase();
          
          const keywords = ['خرطوم', 'بودي', 'صرف', 'طلمبة', 'موتور', 'مروحة', 'حلة', 'مساعد', 'باب', 'لوحة', 'سير', 'كارت', 'تايمر', 'ريشة', 'سنسور', 'حساس'];
          const matchedKw = keywords.some(kw => spText.includes(kw) && fcText.includes(kw));
          if (matchedKw) {
            bestCode = fc;
            bestIdx = i;
            break;
          }
        }

        if (!bestCode) {
          for (let i = 0; i < rawFaultCodes.length; i++) {
            if (!pairedFaultIndices.has(i)) {
              bestCode = rawFaultCodes[i];
              bestIdx = i;
              break;
            }
          }
        }

        if (bestIdx >= 0) pairedFaultIndices.add(bestIdx);
        sparePartJobs.push({ sparePart: sp, faultCode: bestCode });
      });

      // أكواد الأعطال المتبقية التي ليس لها قطع غيار
      const standaloneFaultCodes = rawFaultCodes.filter((_, idx) => !pairedFaultIndices.has(idx));

      logEvent('PASTE_CODES', `الخطة: ${sparePartJobs.length} قطع غيار عبر (اضافة قطعة غيار) + ${standaloneFaultCodes.length} أكواد عطل عبر (اضافة كود عطل)`);

      let addedPartsCount = 0;
      let addedCodesCount = 0;

      // ── أ: تنفيذ إضافة قطع الغيار عبر "اضافة قطعة غيار" ──
      for (let i = 0; i < sparePartJobs.length; i++) {
        const job = sparePartJobs[i];
        const label = job.sparePart.code || job.sparePart.name || `قطعة ${i + 1}`;
        setStatus(shadow, `⏳ جاري إضافة قطعة غيار (${i + 1}/${sparePartJobs.length}): ${label}...`);
        const res = await addSparePartPage3(job.sparePart, job.faultCode);
        if (res && res.ok) {
          if (!res.alreadyExists) addedPartsCount++;
          logEvent('PASTE_CODES', `✅ تم إضافة قطعة الغيار: ${label}`);
        } else {
          logEvent('PASTE_CODES', `⚠️ تعذر إضافة قطعة الغيار ${label}: ${res?.reason || 'غير معروف'}`);
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
          logEvent('PASTE_CODES', `✅ تم إضافة كود عطل: ${title}`);
        } else {
          logEvent('PASTE_CODES', `⚠️ تعذر إضافة كود عطل ${title}: ${res?.reason || 'غير معروف'}`);
        }
        await sleep(1500);
      }

      refreshCopiedCodesPreview(shadow);

      const summaryParts = [];
      if (addedPartsCount > 0) summaryParts.push(`${addedPartsCount} قطعة غيار`);
      if (addedCodesCount > 0) summaryParts.push(`${addedCodesCount} كود عطل`);

      if (summaryParts.length > 0) {
        setStatus(shadow, `✅ تم لصق ${summaryParts.join(' و ')} بنجاح!`, 'success');
      } else {
        setStatus(shadow, 'ℹ️ جميع قطع الغيار والأكواد مضافة بالفعل في هذا البلاغ', 'success');
      }
    } catch (e) {
      logEvent('PASTE_CODES', `خطأ: ${e.message || e}`);
      setStatus(shadow, '❌ خطأ أثناء لصق الأكواد: ' + (e.message || ''), 'error');
    }
  }

  async function executePage3(shadow) {
    logEvent('EXEC_PAGE3', 'بدء التنفيذ');
    logPageSnapshot('قبل executePage3');
    setStatus(shadow, '⏳ جاري التنفيذ...');
    try {
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
          setStatus(shadow, '✅ افتح النافذة واختر تمت الصيانة', 'success');
        } else {
          logEvent('EXEC_PAGE3', 'لم يتم العثور على زر Lookup');
          setStatus(shadow, '⚠️ لم يتم العثور على زر الحالة', 'warn');
        }
        await sleep(1000);
      }

      // 1. حقن أكواد الأعطال
      const checkedCodes = shadow.querySelectorAll('.fault-cb:checked');
      logEvent('EXEC_PAGE3', `عدد أكواد الأعطال: ${checkedCodes.length}`);
      for (const cb of checkedCodes) {
        const parts = cb.value.split(',');
        const mainCode = parts[0], subCode = parts[1] || null;
        logEvent('EXEC_PAGE3', `حقن كود: ${mainCode} / ${subCode || ''}`);
        setStatus(shadow, `⏳ جاري حقن ${mainCode}...`);
        if (typeof addFaultCodePage3 === 'function') {
          await addFaultCodePage3(mainCode, subCode, []);
        } else {
          await addSingleFaultCode({ majorCode: mainCode, defectCode: subCode });
        }
        await sleep(500);
      }

      // 2. جمل التقرير
      const checkedNotes = shadow.querySelectorAll('.note-cb:checked');
      logEvent('EXEC_PAGE3', `عدد الملاحظات: ${checkedNotes.length}`);
      if (checkedNotes.length > 0) {
        const combined = Array.from(checkedNotes).map(cb => {
          const idx = parseInt(cb.dataset.idx);
          return NOTES_LIST[idx] || '';
        }).filter(Boolean).join('\n');
        if (combined) {
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
            const currentVal = (notesEl.value || '').trim();
            let textToSet = combined;
            if (currentVal) {
              if (!currentVal.includes(combined)) {
                textToSet = `${currentVal}\n${combined}`;
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

      setStatus(shadow, '✅ تم التنفيذ بنجاح', 'success');
      logEvent('EXEC_PAGE3', 'اكتمل التنفيذ');
      await sleep(800);
      if (!isMinimized) {
        logEvent('EXEC_PAGE3', 'تصغير التبويب تلقائياً');
        toggle(shadow, false, true);
      }
    } catch (e) {
      logEvent('EXEC_PAGE3', `خطأ: ${e.message || e}`);
      setStatus(shadow, '❌ خطأ: ' + (e.message || ''), 'error');
    }
  }

  function observePageChanges() {
    let lastPage = detectPage();
    let heartbeatCounter = 0; // increments every 1200ms
    const HEARTBEAT_MS = 1200;
    const heartbeatId = setInterval(() => {
      heartbeatCounter++;
      const page = detectPage();
      const host = document.getElementById(PANEL_ID);
      if (page !== lastPage) {
        lastPage = page;
        if (host && host.shadowRoot) updateTab(host.shadowRoot);
      } else if (page === 'PAGE_1' && host && host.shadowRoot) {
        // Check for model change and re-render note
        const mEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'Model']);
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
        const url = location.href;
        const title = document.title;
        logPage('PAGE_STATE', `url=${url.slice(0,80)} title=${title.slice(0,40)}`);
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

  loadPersistedLogs();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
