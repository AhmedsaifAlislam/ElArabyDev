// =========================================================
// control-panel.js — لوحة التحكم الذكية v1.0
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

  function logEvent(type, detail) {
    const ts = new Date().toLocaleTimeString('ar-EG');
    const entry = `[${ts}] ${type}: ${detail}`;
    debugLog.push(entry);
    if (debugLog.length > 200) debugLog = debugLog.slice(-200);
    try { localStorage.setItem(LOG_KEY, debugLog.join('\n')); } catch(_) {}
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

  function findFirst(list) {
    if (!list) return null;
    const arr = Array.isArray(list) ? list : [list];
    for (const s of arr) {
      if (!s) continue;
      if (s instanceof HTMLElement) return s;
      if (typeof s === 'string') {
        try {
          const el = document.querySelector(s);
          if (el) return el;
        } catch (_) {}
      }
    }
    return null;
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
    logEvent('INIT', 'بدء تحميل لوحة التحكم');
    await loadProductsDb();
    injectPanel();
    observePageChanges();
    logEvent('INIT', 'تم تحميل لوحة التحكم');
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        isMinimized = s.minimized !== false;
        isDocked = s.docked === true;
        return s;
      }
    } catch(e) {}
    return { minimized: true, docked: false };
  }

  function saveState(shadow) {
    try {
      const panel = shadow.querySelector('.cp-panel');
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(STATE_KEY, JSON.stringify({
        minimized: isMinimized,
        docked: isDocked,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
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
    for (const iframe of doc.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iDoc) { res = scanInDoc(iDoc); if (res) return res; }
      } catch (_) {}
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

    if (isDocked) toggleDock(shadow);
    if (isMinimized) toggle(shadow, false, true);
  }

function getCSS() {
    return `
*{box-sizing:border-box;margin:0;padding:0}
.cp-panel{position:fixed;bottom:14px;right:14px;width:300px;min-width:280px;max-width:520px;min-height:220px;max-height:70vh;background:#131821;border:1px solid #232840;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.7);z-index:2147483647;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;font-size:11px;color:#c8d0e0;overflow:auto;display:flex;flex-direction:column;resize:both}
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
`;
  }

  function getHTML() {
    return `
<div class="cp-header" id="cp-header">
  <span class="cp-title">⚙ لوحة التحكم</span>
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
    <button class="cp-btn cp-btn-exec" id="btn-exec2">▶ تنفيذ يدوي</button>
  </div>
  <div class="cp-tab" data-page="PAGE_3" id="tab-p3">
    <div class="cp-tab-title">📋 الصفحة الثالثة — أكواد الأعطال</div>
    <div class="cp-info" id="cp-device-info3">الجهاز: <b id="cp-device-type">...</b></div>
    <label class="cp-check" style="margin-bottom:10px"><input type="checkbox" id="chk-done" checked> <span>✅ تمت الصيانة</span></label>
    <label class="cp-label">أكواد إضافية (اختيار متعدد):</label>
    <div class="cp-codes" id="cp-codes-list"></div>
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
    const allDocs = [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];

    for (const doc of allDocs) {
      const rows = doc.querySelectorAll('div.view-grid table tbody tr');
      if (rows.length === 0) continue;

      const parts = [];
      let total = 0;

      rows.forEach(tr => {
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
          name = (prodTd.getAttribute('data-value') || prodTd.innerText || '').trim();
        }

        // If code or name not in specific cells, extract from data-name or tr text
        if (!code && !name && rawName) {
          // Check if data-name is formatted like "CODE (NAME)" or "CODE_ (NAME)" or "CODE - NAME"
          const parenMatch = rawName.match(/^([^(]+?)\s*\((.+)\)\s*$/);
          if (parenMatch) {
            code = parenMatch[1].trim();
            name = parenMatch[2].trim();
          } else {
            const dashMatch = rawName.match(/^([^-]+?)\s*-\s*(.+)$/);
            if (dashMatch) {
              code = dashMatch[1].trim();
              name = dashMatch[2].trim();
            } else {
              name = rawName.trim();
            }
          }
        } else if (!name && rawName) {
          name = rawName.trim();
        } else if (!code && rawName && name && rawName !== name) {
          code = rawName.replace(name, '').replace(/[()_-]/g, '').trim();
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

        // If unit price is 0 but line total and qty exist, deduce unit price
        if (priceVal === 0 && totalVal > 0 && qty > 0) {
          priceVal = totalVal / qty;
        }

        if ((name || code) && (priceVal > 0 || totalVal > 0 || tr.innerText.trim().length > 0)) {
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
    let el = document.querySelector('#ldv_originaltotalusedsparepartscost, input[name*="originaltotalusedsparepartscost"]');
    if (!el) {
      const iframes = document.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
          if (iDoc) {
            el = iDoc.querySelector('#ldv_originaltotalusedsparepartscost, input[name*="originaltotalusedsparepartscost"]');
            if (el) break;
          }
        } catch (_) {}
      }
    }
    if (el) {
      const raw = (el.value || el.innerText || '').replace(/[^0-9.]/g, '');
      const val = parseFloat(raw);
      return isNaN(val) ? 0 : val;
    }
    return 0;
  }

  function readSparePartsStatusFromPage() {
    let el = document.getElementById('ats_sparepartsstatus') || document.querySelector('select[name*="sparepartsstatus"], select[aria-label*="قطع الغيار"]');
    if (!el) {
      const iframes = document.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
          if (iDoc) {
            el = iDoc.getElementById('ats_sparepartsstatus') || iDoc.querySelector('select[name*="sparepartsstatus"], select[aria-label*="قطع الغيار"]');
            if (el) break;
          }
        } catch (_) {}
      }
    }
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

    let notesEl = document.querySelector('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
    if (!notesEl) {
      const iframes = document.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
          if (iDoc) {
            notesEl = iDoc.querySelector('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
            if (notesEl) break;
          }
        } catch(e) {}
      }
    }

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
    if (defaultBtn) defaultBtn.onclick = () => { logEvent('CLICK', 'نقر على تعبئة بيانات افتراضية'); fillDefaultDeviceData(shadow); };
    shadow.getElementById('btn-exec1').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 1'); executePage1(shadow); };
    shadow.getElementById('btn-exec2').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الصفحة 2'); executePage2(shadow); };
    shadow.querySelectorAll('.p2-sc').forEach(btn => {
      btn.onclick = () => {
        const sc = btn.dataset.sc;
        logEvent('SHORTCUT_P2', `${sc} → تنفيذ`);
        executePage2(shadow, sc);
      };
    });
    shadow.getElementById('btn-exec3').onclick = () => { logEvent('CLICK', 'نقر على تنفيذ الكل'); executePage3(shadow); };
    shadow.querySelectorAll('.cp-shortcut-btn').forEach(btn => {
      btn.onclick = () => {
        logEvent('SHORTCUT_PANEL', `${btn.dataset.sc} → تنفيذ`);
        runShortcut(shadow, btn.dataset.sc);
        executePage3(shadow);
      };
    });
    shadow.getElementById('cp-parts-btn').onclick = () => {
      logEvent('CLICK', 'نقر على قطع الغيار');
      executePartsShortcut(shadow);
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
        position: 'fixed', bottom: '20px', right: '20px', width: '44px', height: '44px',
        background: 'linear-gradient(135deg,#1e40af,#2563eb)', color: '#fff',
        borderRadius: '50%', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        zIndex: '2147483647', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', cursor: 'pointer', fontFamily: 'sans-serif',
        transition: 'transform 0.15s', userSelect: 'none'
      });
      mini.onclick = () => { logEvent('CLICK', 'نقر على الأيقونة المصغرة'); toggle(shadow, true); };
      document.body.appendChild(mini);

      const isPage3 = detectPage() === 'PAGE_3';

      if (isPage3) {
        const popup = document.createElement('div');
        popup.id = PANEL_ID + '-popup';
        popup.innerHTML = `
          <div id="${PANEL_ID}-popup-box" style="position:fixed;bottom:70px;right:14px;background:#131821;border:1px solid #232840;border-radius:8px;padding:6px;z-index:2147483646;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;display:none;box-shadow:0 4px 16px rgba(0,0,0,.6)">
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
              runShortcut(shadow, sc);
              executePage3(shadow);
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
              executePage3(shadow);
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

  function toggleDock(shadow) {
    const panel = shadow.querySelector('.cp-panel');
    const host = document.getElementById(PANEL_ID);
    isDocked = !isDocked;
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

    logEvent('SHORTCUT', `DOM: 전체 체크박스=${allCbs.length}, fault-cb=${codes.length}, note-cb=${notes.length}`);
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
    const allDocs = [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];
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

  const PAGE_WARN_ID = 'cp-page-install-warn';

  function findAttachmentsField() {
    const allDocs = [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];
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
      if (!detectInstallation()) return;
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
    const isInstall = detectInstallation();
    const typeLabel = isInstall ? 'تركيب' : 'صيانة';
    const typeClass = isInstall ? 'cp-install' : 'cp-maintenance';
    info.innerHTML = `الجهاز: <b>${device || 'غير معروف'}</b><br>نوع البلاغ: <span class="${typeClass}">${typeLabel}</span>`;
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
    const isInstall = (typeof isInstallationReport === 'function') ? isInstallationReport() : false;
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
      logEvent('CODES', 'تم إنشاء 4 checkboxes');
    } else {
      list.innerHTML = '<div class="cp-empty">لا توجد أكواد افتراضية لهذا الجهاز</div>';
      logEvent('CODES', 'لم يتم إنشاء checkboxes (ليس AC)');
    }
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
      if (shadow.getElementById('chk-duplicate').checked) await doDuplicate(shadow);
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

  async function fillLookupField(inputEl, val, btnSel) {
    if (!inputEl || !val) return false;
    if (typeof window.fillPowerAppsLookup === 'function') {
      try {
        const res = await window.fillPowerAppsLookup(inputEl, inputEl.id || 'Lookup', val, btnSel);
        if (res && res.ok !== false) return true;
      } catch (_) {}
    }
    if (typeof window.AutoFillEngine?.Lookups?.fillPowerAppsLookup === 'function') {
      try {
        const res = await window.AutoFillEngine.Lookups.fillPowerAppsLookup(inputEl, val, btnSel);
        if (res && res.ok !== false) return true;
      } catch (_) {}
    }
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
      return;
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

    // Rule: Model 1 -> Model 2
    if (!isEmptyValue(model1Val)) {
      if (isEmptyValue(model2Val)) {
        if (model2El) {
          logEvent('EXEC_PAGE1', `نسخ الموديل 1 إلى الموديل 2: "${model1Val}"`);
          await fillLookupField(model2El, model1Val, CFG.modelBtn);
          modelDuplicated = true;
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

    if (modelDuplicated || serialDuplicated) {
      setStatus(shadow, '✅ تم تكرار بيانات التكييف للحقول الفارغة فقط', 'success');
    } else if (preservedModel || preservedSerial) {
      setStatus(shadow, 'ℹ️ الحقول ممتلئة بالفعل (تم الحفاظ عليها)', 'success');
    } else {
      setStatus(shadow, '⚠️ لا توجد بيانات في الموديل 1 أو السيريال 1 للنسخ', 'warn');
    }
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

    // 1. العلامة التجارية (Brand) - fill only if empty
    const brandEl = findFirst(CFG.brandInput) || findFieldByLabel(['العلامة التجاريه', 'العلامة التجارية', 'Brand']);
    if (brandEl) {
      const curVal = (brandEl.value || brandEl.getAttribute?.('value') || '').trim();
      if (isEmptyValue(curVal) && p1.brand) {
        const ok = await fillLookupField(brandEl, p1.brand, CFG.brandBtn);
        if (ok) filledCount++;
      } else if (!isEmptyValue(curVal)) {
        preservedCount++;
      }
    }

    // 2. الموديل الفعلي الأول (Model 1) - fill only if empty
    const model1El = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    if (model1El) {
      const curVal = (model1El.value || model1El.getAttribute?.('value') || '').trim();
      if (isEmptyValue(curVal) && p1.model1) {
        const ok = await fillLookupField(model1El, p1.model1, CFG.modelBtn);
        if (ok) filledCount++;
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
        const ok = await fillLookupField(model2El, targetModel2, CFG.modelBtn);
        if (ok) filledCount++;
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

    logEvent('DEFAULT_P1', `اكتمل: تم تعبئة ${filledCount} حقل، والحفاظ على ${preservedCount} حقل`);
    if (filledCount > 0) {
      setStatus(shadow, `✅ تم تعبئة ${filledCount} حقل افتراضي (${matchedProfile.name})`, 'success');
    } else if (preservedCount > 0) {
      setStatus(shadow, `ℹ️ جميع الحقول ممتلئة بالفعل (تم الحفاظ عليها)`, 'success');
    } else {
      setStatus(shadow, '⚠️ لم يتم العثور على حقول لتعبئتها', 'warn');
    }
  }

  async function doNext(shadow) {
    logEvent('NAV', 'الانتقال للصفحة التالية');
    if (typeof clickNextAndWaitForSave === 'function') {
      await clickNextAndWaitForSave(CFG);
      return;
    }
    // بحث في main + iframes
    let btn = null;
    const allDocs = [document, ...Array.from(document.querySelectorAll('iframe')).map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } }).filter(Boolean)];
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
          const iframes = document.querySelectorAll('iframe');
          for (const ifr of iframes) {
            try {
              const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
              if (iDoc) {
                el = iDoc.querySelector('#ats_sparepartsstatus, select[aria-label*="قطع الغيار"], select[aria-label*="Spare"]');
                if (el) break;
              }
            } catch(e) {}
          }
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

      if (addProblems) {
        const device = readDeviceHint();
        const isInstall = (typeof isInstallationReport === 'function') ? isInstallationReport() : false;
        logEvent('EXEC_PAGE2', `إضافة مشاكل: الجهاز=${device}, النوع=${isInstall ? 'تركيب' : 'صيانة'}`);
        const probCode = typeof getSmartProblemCode === 'function'
          ? await getSmartProblemCode(device, isInstall)
          : (typeof getProblemCode === 'function' ? getProblemCode(device, isInstall) : null);
        logEvent('EXEC_PAGE2', `كود المشكلة: ${probCode || 'غير موجود'}`);
        if (probCode && typeof handleSubgridIframeModal === 'function') {
          setStatus(shadow, `⏳ جاري إضافة المشكلة: ${probCode}...`);
          await handleSubgridIframeModal(/اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i, probCode, false, /ترصيد|ارضي|أرضي|بلاغ/i, /Premium\s*care|بريميم.?كير|تركيب وتشغيل/i);
        }
        await sleep(2000);
      }

      if (addTech) {
        if (typeof selectRandomTechnician === 'function') {
          setStatus(shadow, '⏳ جاري إضافة فني...');
          logEvent('EXEC_PAGE2', 'إضافة فني');
          let techRes = await selectRandomTechnician(null);
          if (!techRes || !techRes.ok) {
            await sleep(3000);
            techRes = await selectRandomTechnician(null);
          }
        }
      }

      if (addProblems || addTech) {
        setStatus(shadow, '✅ تم التعبئة', 'success');
      }

      // 3. التالي
      await doNext(shadow);

      setStatus(shadow, '✅ تم التنفيذ بنجاح', 'success');
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
  // PAGE 3
  // ════════════════════════════════════════════
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
        for (const doc of [document, ...[].slice.call(document.querySelectorAll('iframe')).map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } }).filter(Boolean)]) {
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
          const addBtn = Array.from(document.querySelectorAll('a, button'))
            .find(el => el.innerText.trim() === 'اضافة كود عطل' && el.offsetParent !== null);
          if (addBtn) { addBtn.click(); logEvent('EXEC_PAGE3', 'نقر زر اضافة كود عطل'); }
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
            const iframes = document.querySelectorAll('iframe');
            for (const ifr of iframes) {
              try {
                const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
                if (iDoc) {
                  notesEl = iDoc.querySelector('#ldv_resourcelastcomment, textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"], textarea[id*="notes"], input[aria-label*="التعليق"], #notes');
                  if (notesEl) break;
                }
              } catch(e) {}
            }
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
          const iframes = document.querySelectorAll('iframe');
          for (const ifr of iframes) {
            try {
              const iDoc = ifr.contentDocument || ifr.contentWindow?.document;
              if (iDoc) {
                el = iDoc.querySelector('#ldv_actualcollectedamount, input[aria-label*="المبلغ المحصل"], input[aria-label*="المبلغ"], input.money.form-control, input[id*="actualcollected"], input[id*="collectedamount"]');
                if (el) return el;
              }
            } catch(e) {}
          }
          return null;
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
    setInterval(() => {
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
          const isInstall = detectInstallation();
          warn.style.display = isInstall ? 'block' : 'none';
        }
        if (!document.getElementById(PAGE_WARN_ID)) injectInstallWarnIntoPage();
      }
    }, 1200);
    observePageDOM();
  }

  let pageLog = [];
  function logPage(type, detail) {
    const ts = new Date().toLocaleTimeString('ar-EG');
    const entry = `[${ts}] ${type}: ${detail}`;
    pageLog.push(entry);
    if (pageLog.length > 300) pageLog = pageLog.slice(-300);
    try { localStorage.setItem(PAGE_LOG_KEY, pageLog.join('\n')); } catch(_) {}
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
    const iframes = document.querySelectorAll('iframe');
    logPage('SNAPSHOT', `  iframes: ${iframes.length}`);
  }

  function observePageDOM() {
    logPage('PAGE', 'بدء مراقبة الصفحة');

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
            logPage('MODAL', isVisible ? `فتح: ${id}` : `إغلاق: ${id}`);
            // تفاصيل النافذة
            if (isVisible) {
              const btns = node.querySelectorAll('button');
              const inputs = node.querySelectorAll('input, select, textarea');
              logPage('MODAL', `  أزرار: ${btns.length}, حقول: ${inputs.length}`);
              btns.forEach(b => {
                const txt = b.textContent?.trim().slice(0,30);
                const aria = b.getAttribute('aria-label') || '';
                if (txt || aria) logPage('MODAL', `  زر: "${txt}" aria="${aria}"`);
              });
            }
          }
          // زر lookup
          if (tag === 'button' && node.classList?.contains('launchentitylookup')) {
            const label = node.getAttribute('aria-label') || node.textContent?.trim().slice(0,30);
            const id = node.id || '';
            logPage('LOOKUP_BTN', `"${label}" id=${id}`);
          }
          // حقل input/select
          if (['input', 'select', 'textarea'].includes(tag)) {
            const id = node.id || node.name || node.getAttribute('aria-label') || '';
            const type = node.type || tag;
            logPage('FIELD_ADDED', `${tag}#${id} type=${type}`);
          }
          // جدول
          if (tag === 'table' || node.classList?.contains('entity-grid')) {
            const rows = node.querySelectorAll('tr').length;
            logPage('TABLE', `جدول جديد: ${rows} صفوف`);
          }
        }
        // حذف عناصر
        for (const node of m.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList?.contains('modal')) {
            logPage('MODAL', `إغلاق: ${node.id || 'unknown'}`);
          }
        }
        // تغيير خصائص
        for (const m2 of m.attributes || []) {
          const el = m2.target;
          if (m2.name === 'style' || m2.name === 'class') {
            const isVisible = el.offsetParent !== null;
            const id = el.id || el.tagName;
            logPage('ATTR', `${id}: ${m2.name} changed`);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

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

    // مراقبة حقول محددة
    const watchFields = [
      { sel: '#ats_bookingstatus_name', name: 'حالة الحجز' },
      { sel: '#ldv_actualcollectedamount', name: 'المبلغ المحصل' },
      { sel: '#ats_sparepartsstatus', name: 'قطع الغيار' },
      { sel: 'textarea[aria-label*="Notes"], textarea[aria-label*="ملاحظات"]', name: 'الملاحظات' },
      { sel: '#ldv_resourcelastcomment', name: 'آخر تعليق' }
    ];
    setInterval(() => {
      for (const f of watchFields) {
        const el = document.querySelector(f.sel);
        if (el && el.value && el.value !== (el._lastVal || '')) {
          el._lastVal = el.value;
          logPage('FIELD_VAL', `${f.name}: ${el.value.slice(0, 80)}`);
        }
      }
    }, 1500);

    // حالة الصفحة الحالية
    setInterval(() => {
      const url = location.href;
      const title = document.title;
      logPage('PAGE_STATE', `url=${url.slice(0,80)} title=${title.slice(0,40)}`);
    }, 10000);

    logPage('PAGE', 'تم تفعيل مراقبة الصفحة');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
