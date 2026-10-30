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

  // Design-system tokens for runtime JS styles OUTSIDE the shadow panel
  // (elements appended to document.body cannot read var(--cp-*) from .cp-panel).
  const CP_THEME = {
    execGrad: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
    miniGrad: 'linear-gradient(135deg,#1e40af,#2563eb)',
    onGold: '#000',
    bg: '#131821',
    border: '#232840',
    border2: '#2a3050',
    surface: '#0d1528',
    sub: '#a8c7fa',
    muted: '#667799',
    warn: '#fbbf24',
    success: '#4ade80',
    error: '#ef4444',
    onAccent: '#fff',
    dangerBg: '#7f1d1d',
    dangerBorder: '#dc2626',
    popupShadow: '0 4px 16px rgba(0,0,0,0.6)'
  };

  let CFG = null;
  let isMinimized = true;
  let isDocked = false;
  let productsDb = null;
  let debugLog = [];
  let parsedImages = [];
  let currentTicket = '';
  const autoAttemptedTickets = new Set();
  const IMAGES_KEY = 'elaraby_cp_images_data';
  const IMAGES_DONE_KEY = 'elaraby_cp_images_done';
  const CODES_TRANSFER_KEY = 'elaraby_codes_transfer';

  function logEvent(type, detail) {
    const ts = new Date().toLocaleTimeString('ar-EG');
    const entry = `[${ts}] ${type}: ${detail}`;
    debugLog.push(entry);
    if (debugLog.length > 200) debugLog = debugLog.slice(-200);
    try { localStorage.setItem(LOG_KEY, debugLog.join('\n')); } catch(_) {}
    console.log(`%c[PortalHelper] ${entry}`, 'color:#60a5fa;font-weight:bold');
  }

  // الفرق بين القيمتين: يشيل البادئة/اللاحقة المشتركة ويُبقي الجزء المتغير فقط
  // (يجعل التجميع في اللوج الذكي يظهر نمط التغيير بدل النص الكامل)
  function getDiff(oldVal, newVal) {
    const o = String(oldVal || ''), n = String(newVal || '');
    if (!o && !n) return '';
    if (o === n) return '';
    let s = 0, min = Math.min(o.length, n.length);
    while (s < min && o[s] === n[s]) s++;
    let e = 0;
    while (e < min - s && o[o.length - 1 - e] === n[n.length - 1 - e]) e++;
    return o.substring(s, o.length - e) + ' → ' + n.substring(s, n.length - e);
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

  async function ensureReady() {
    for (let i = 0; i < 100; i++) {
      if (typeof findFirst !== 'undefined') {
        try {
          if (typeof loadSelectors === 'function') CFG = await loadSelectors();
        } catch (_) {}
        if (!CFG) CFG = getFallbackCfg();
        return true;
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
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
        top: Math.round(rect.top)
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
    const shadow = host.attachShadow({ mode: 'closed' });

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

    bindEvents(shadow);
    updateTab(shadow);

    if (isDocked) toggleDock(shadow);
    if (isMinimized) toggle(shadow, false, true);
  }

  function getCSS() {
    return `
*{box-sizing:border-box;margin:0;padding:0}
.cp-panel{--cp-bg:#131821;--cp-surface:#0d1528;--cp-surface2:#0f1a2e;--cp-surface3:#162a45;--cp-border:#232840;--cp-border2:#2a3050;--cp-border3:#1a2340;--cp-border-strong:#2a4a6a;--cp-text:#c8d0e0;--cp-text-strong:#e2eaf5;--cp-title:#60a5fa;--cp-sub:#a8c7fa;--cp-muted:#667799;--cp-label:#7a9cc8;--cp-faint:#445577;--cp-place:#334466;--cp-handle:#3a4a6a;--cp-accent:#2563eb;--cp-accent2:#1d4ed8;--cp-warn:#fbbf24;--cp-success:#4ade80;--cp-error:#ef4444;--cp-header-a:#1a2744;--cp-header-b:#0f1b33;--cp-exec-a:#2563eb;--cp-exec-b:#1d4ed8;--cp-inject-a:#059669;--cp-inject-b:#047857;--cp-gold-a:#f59e0b;--cp-gold-b:#d97706;--cp-danger-bg:#7f1d1d;--cp-danger-border:#dc2626;--cp-fill-a:rgba(255,255,255,.1);--cp-fill-b:rgba(255,255,255,.2);--cp-dock-bg:rgba(16,185,129,.2);--cp-dock-text:#34d399;--cp-shadow:0 12px 40px rgba(0,0,0,.7);--cp-shadow-docked:0 2px 10px rgba(0,0,0,.3)}
.cp-panel{position:fixed;bottom:14px;right:14px;width:300px;background:var(--cp-bg);border:1px solid var(--cp-border);border-radius:10px;box-shadow:var(--cp-shadow);z-index:2147483647;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;font-size:11px;color:var(--cp-text);overflow:hidden;display:flex;flex-direction:column}
.cp-header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:linear-gradient(135deg,var(--cp-header-a),var(--cp-header-b));border-bottom:1px solid var(--cp-border2);cursor:move;user-select:none}
.cp-title{font-weight:700;color:var(--cp-title);font-size:12px}
.cp-toggle{background:var(--cp-fill-a);border:none;border-radius:50%;color:var(--cp-muted);cursor:pointer;width:22px;height:22px;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s}
.cp-toggle:hover{background:var(--cp-fill-b);color:var(--cp-text-strong)}
.cp-body{padding:8px 10px;overflow-y:auto;max-height:440px;scrollbar-width:thin}
.cp-body::-webkit-scrollbar{width:4px}
.cp-body::-webkit-scrollbar-thumb{background:var(--cp-border2);border-radius:2px}
.cp-tab{display:none}
.cp-tab.active{display:block}
.cp-tab-title{font-weight:700;color:var(--cp-sub);margin-bottom:6px;font-size:11px;padding-bottom:4px;border-bottom:1px solid var(--cp-border3);letter-spacing:.3px}
.cp-info{background:var(--cp-surface);padding:5px 8px;border-radius:5px;margin-bottom:6px;font-size:11px;color:var(--cp-sub);line-height:1.5;border:1px solid var(--cp-border3)}
.cp-check,.cp-radio{display:flex;align-items:center;gap:5px;margin-bottom:2px;cursor:pointer;padding:3px 5px;border-radius:4px;transition:background .15s}
.cp-check:hover,.cp-radio:hover{background:var(--cp-border3)}
.cp-check input,.cp-radio input{width:13px;height:13px;cursor:pointer;flex-shrink:0;accent-color:var(--cp-accent)}
.cp-label{display:block;margin-bottom:2px;font-size:10px;color:var(--cp-label);margin-top:2px;font-weight:600}
.cp-select{width:100%;padding:4px 6px;margin-bottom:4px;background:var(--cp-bg);color:var(--cp-sub);border:1px solid var(--cp-border);border-radius:5px;font-size:11px;cursor:pointer}
.cp-btn{width:100%;padding:6px;border:none;border-radius:5px;font-weight:700;font-size:11px;cursor:pointer;margin-top:4px;transition:opacity .15s}
.cp-btn:hover{opacity:.85}
.cp-btn:active{opacity:.7}
.cp-btn-exec{background:linear-gradient(135deg,var(--cp-accent),var(--cp-accent2));color:var(--cp-text-strong)}
.cp-btn-inject{background:linear-gradient(135deg,var(--cp-inject-a),var(--cp-inject-b));color:var(--cp-text-strong)}
.cp-btn:disabled{opacity:.4;cursor:not-allowed}
.cp-status{padding:4px 10px;font-size:10px;color:var(--cp-muted);border-top:1px solid var(--cp-border3);min-height:20px;transition:color .3s}
.cp-badge{display:inline-block;background:var(--cp-header-b);color:var(--cp-sub);font-size:9px;padding:1px 5px;border-radius:8px;margin-right:3px}
.cp-install{color:var(--cp-warn);font-size:12px;font-weight:900}
.cp-maintenance{color:var(--cp-sub);font-size:11px}
.cp-empty{color:var(--cp-muted);padding:5px;text-align:center;font-size:10px}
.cp-notes-title{font-weight:700;color:var(--cp-warn);margin:6px 0 3px;padding-top:5px;border-top:1px solid var(--cp-border);font-size:11px}
.cp-note-item{background:var(--cp-surface2);padding:3px 6px;border-radius:5px;margin-bottom:1px;cursor:grab;font-size:10px;line-height:1.4;border:1px solid transparent;transition:all .12s;display:flex;align-items:flex-start;gap:4px;user-select:none}
.cp-note-item:hover{background:var(--cp-surface3);border-color:var(--cp-border-strong)}
.cp-note-item:active{cursor:grabbing}
.cp-note-item.dragging{opacity:.5;border-color:var(--cp-accent);background:var(--cp-surface2)}
.cp-note-item.drag-over{border-color:var(--cp-title);background:var(--cp-surface3)}
.cp-note-item input{margin-top:1px;flex-shrink:0;width:12px;height:12px;cursor:pointer;accent-color:var(--cp-accent)}
.cp-note-item .ni-handle{color:var(--cp-faint);font-size:9px;cursor:grab;flex-shrink:0;padding:0 1px;line-height:1.4}
.cp-note-item .ni-handle:active{cursor:grabbing}
.cp-note-item .ni-text{flex:1;line-height:1.4}
.cp-amount{width:100%;padding:4px 6px;margin:2px 0 4px;background:var(--cp-bg);color:var(--cp-sub);border:1px solid var(--cp-border);border-radius:5px;font-size:11px;direction:ltr;text-align:left}
.cp-amount::placeholder{color:var(--cp-border3)}
.cp-btn-gold{background:linear-gradient(135deg,var(--cp-gold-a),var(--cp-gold-b));color:${CP_THEME.onGold};font-size:11px;padding:6px}
.cp-image-paste{width:100%;min-height:56px;padding:5px 6px;margin:4px 0;background:var(--cp-bg);color:var(--cp-sub);border:1px solid var(--cp-border);border-radius:5px;font-size:10px;font-family:Consolas,monospace;direction:ltr;text-align:left;resize:vertical;line-height:1.4}
.cp-image-paste::placeholder{color:var(--cp-border3);direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;text-align:right}
.cp-img-status{background:var(--cp-surface);padding:4px 7px;border-radius:5px;margin-top:4px;font-size:10px;color:var(--cp-sub);line-height:1.5;border:1px solid var(--cp-border3);min-height:18px}
.cp-img-status.ok{color:var(--cp-success)}
.cp-img-status.err{color:var(--cp-error)}
.cp-img-status.warn{color:var(--cp-warn)}
.cp-panel.docked{position:relative!important;bottom:auto!important;right:auto!important;margin:6px 12px;width:auto;max-height:none;box-shadow:var(--cp-shadow-docked)}
.cp-panel.docked .cp-header{cursor:default}
.cp-panel.docked .cp-body{max-height:60vh}
.cp-dock{background:var(--cp-fill-a);border:none;border-radius:50%;color:var(--cp-muted);cursor:pointer;width:22px;height:22px;font-size:12px;display:flex;align-items:center;justify-content:center;line-height:1;transition:all .15s;margin-right:2px}
.cp-dock:hover{background:var(--cp-fill-b);color:var(--cp-text-strong)}
.cp-dock.active{background:var(--cp-dock-bg);color:var(--cp-dock-text)}
.cp-shortcuts{display:flex;flex-direction:column;gap:2px;margin:4px 0}
.cp-shortcut-row{display:flex;gap:4px}
.p2-sc, .cp-shortcut-btn{flex:1;padding:5px 4px;border:1px solid var(--cp-border2);border-radius:5px;background:var(--cp-surface);color:var(--cp-sub);font-size:10px;font-weight:600;cursor:pointer;transition:all .12s;text-align:center}
.p2-sc:hover, .cp-shortcut-btn:hover{background:var(--cp-header-a);border-color:var(--cp-label);color:var(--cp-text-strong)}
.p2-sc:active, .cp-shortcut-btn:active{transform:scale(.96)}
.p2-sc .sc-icon, .cp-shortcut-btn .sc-icon{display:block;font-size:16px;margin-bottom:1px}
`;
  }

  function getHTML() {
    return `
<div class="cp-header" id="cp-header">
  <span class="cp-title">⚙ لوحة التحكم</span>
  <div style="display:flex;align-items:center;gap:2px">
    <button class="cp-dock" id="cp-ai-ideas" title="أفكار تطوير (AI)">💡</button>
    <button class="cp-dock" id="cp-dock" title="إرساء">⛶</button>
    <button class="cp-toggle" id="cp-toggle" title="تصغير">−</button>
  </div>
</div>
<div class="cp-body" id="cp-body">
  <div class="cp-tab" data-page="PAGE_1" id="tab-p1">
    <div class="cp-tab-title">📋 الصفحة الأولى — بيانات الجهاز</div>
    <label class="cp-check"><input type="checkbox" id="chk-duplicate" checked> <span>تكرار بيانات الجهاز (model→model2, serial→serial2)</span></label>
    <label class="cp-check"><input type="checkbox" id="chk-next1" checked> <span>الانتقال للصفحة التالية</span></label>
    <button class="cp-btn cp-btn-exec" id="btn-exec1">▶ تنفيذ</button>
  </div>
  <div class="cp-tab" data-page="PAGE_2" id="tab-p2">
    <div class="cp-tab-title">📋 الصفحة الثانية — حالة البلاغ</div>
    <div class="cp-info" id="cp-device-info">⏳ جاري التحميل...</div>
    <div id="cp-install-warn" style="display:none;background:var(--cp-danger-bg);border:1px solid var(--cp-danger-border);border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:var(--cp-warn);font-weight:700;text-align:center">⚠️ لا تنسي صورة الضمان وفيديو الفاكيوم</div>
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
        <button class="p2-sc" data-sc="all" style="background:var(--cp-header-a);border-color:var(--cp-accent)"><span class="sc-icon">⚡</span>الكل</button>
      </div>
    </div>
    <div class="cp-notes-title" style="margin-top:8px">📷 صور السيريات (مرفقات)</div>
    <label class="cp-check"><input type="checkbox" id="cp-auto-next"> <span>الانتقال للصفحة التالية تلقائياً بعد التعبئة</span></label>
    <textarea id="cp-image-paste" class="cp-image-paste" spellcheck="false" placeholder="الصق هنا نتائج الـ AI... (OrderId: CAS... | Serial: ... | Image: data:image/jpeg;base64,...)"></textarea>
    <div class="cp-shortcut-row">
      <button class="p2-sc" id="cp-parse-images" style="background:var(--cp-header-a);border-color:var(--cp-title)"><span class="sc-icon">🔍</span>تحليل</button>
      <button class="p2-sc" id="cp-upload-images" style="background:var(--cp-header-a);border-color:var(--cp-inject-a)"><span class="sc-icon">📤</span>رفع</button>
    </div>
    <div class="cp-img-status" id="cp-image-status">لا يوجد نص بعد — الصق نتائج الـ AI</div>
    <div class="cp-notes-title" style="margin-top:8px">🔁 نقل أكواد الأعطال</div>
    <div class="cp-shortcut-row">
      <button class="p2-sc" id="cp-capture-codes-2" style="background:var(--cp-header-a);border-color:var(--cp-title)"><span class="sc-icon">📥</span>سحب من هذا البلاغ</button>
      <button class="p2-sc" id="cp-credit-codes-2" style="background:var(--cp-header-a);border-color:var(--cp-gold-a)"><span class="sc-icon">📤</span>ترصيد في هذا البلاغ</button>
    </div>
    <div class="cp-img-status" id="cp-codes-clipboard-info-2">لا توجد أكواد محفوظة</div>
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
        <button class="p2-sc" id="cp-parts-btn" style="flex:1;background:var(--cp-header-a);border-color:var(--cp-gold-a)"><span class="sc-icon">🔧</span>قطع الغيار</button>
      </div>
    </div>
    <div class="cp-notes-title" style="margin-top:8px">🔁 نقل أكواد الأعطال</div>
    <div class="cp-shortcut-row">
      <button class="p2-sc" id="cp-capture-codes" style="background:var(--cp-header-a);border-color:var(--cp-title)"><span class="sc-icon">📥</span>سحب من هذا البلاغ</button>
      <button class="p2-sc" id="cp-credit-codes" style="background:var(--cp-header-a);border-color:var(--cp-gold-a)"><span class="sc-icon">📤</span>ترصيد في هذا البلاغ</button>
    </div>
    <div class="cp-img-status" id="cp-codes-clipboard-info">لا توجد أكواد محفوظة</div>
    <div class="cp-notes-title">📝 جمل التقرير</div>
    <div class="cp-notes-list" id="cp-notes-list"></div>
    <label class="cp-label" style="margin-top:8px">المبلغ المحصل:</label>
    <input type="text" class="cp-amount" id="cp-amount" value="0" />
    <button class="cp-btn cp-btn-gold" id="btn-exec3">▶ تنفيذ الكل</button>
  </div>
</div>
<div class="cp-status" id="cp-status">✅ جاهز</div>
<div id="cp-ai-ideas-box" style="display:none;border-top:1px solid var(--cp-border3);padding:8px 10px;max-height:220px;overflow-y:auto;font-size:10px;line-height:1.6;color:var(--cp-text);background:var(--cp-surface);white-space:pre-wrap" dir="rtl"></div>
<div style="padding:3px 10px;border-top:1px solid var(--cp-border3);display:flex;gap:4px">
  <button id="cp-copy-log" style="flex:1;padding:3px;border:1px solid var(--cp-border);border-radius:4px;background:var(--cp-surface);color:var(--cp-muted);font-size:9px;cursor:pointer">📋 نسخ اللوج</button>
  <button id="cp-clear-log" style="flex:1;padding:3px;border:1px solid var(--cp-border);border-radius:4px;background:var(--cp-surface);color:var(--cp-muted);font-size:9px;cursor:pointer">🗑️ مسح</button>
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
        const name = tr.getAttribute('data-name') || '';
        const priceTd = tr.querySelector('td[data-attribute="ats_price"]');
        const totalTd = tr.querySelector('td[data-attribute="ats_totalprice"]');

        let priceVal = 0;
        let totalVal = 0;

        if (priceTd) {
          try { priceVal = JSON.parse(priceTd.getAttribute('data-value') || '{}').Value || 0; } catch(_) {}
        }
        if (totalTd) {
          try { totalVal = JSON.parse(totalTd.getAttribute('data-value') || '{}').Value || 0; } catch(_) {}
        }

        if (name && (priceVal > 0 || totalVal > 0)) {
          parts.push({ name, price: priceVal, total: totalVal });
          total += totalVal;
        }
      });

      if (parts.length > 0) return { parts, total };
    }

    return { parts: [], total: 0 };
  }

  async function executePartsShortcut(shadow) {
    logEvent('PARTS', 'بدء قراءة قطع الغيار');
    const { parts, total } = readPartsFromGrid();

    if (parts.length === 0) {
      setStatus(shadow, '⚠️ لا توجد قطع غيار في الجدول', 'warn');
      logEvent('PARTS', 'لم يتم العثور على قطع غيار');
      return;
    }

    logEvent('PARTS', `تم العثور على ${parts.length} قطعة - الإجمالي: ${total}`);

    const lines = ['يحتاج:'];
    parts.forEach(p => {
      lines.push(`[ ${p.name} ${p.price} ]`);
    });
    lines.push(`// والتكلفة [ ${total} ]`);
    const text = lines.join('\n');

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
      if (typeof emulateUserInput === 'function') {
        await emulateUserInput(notesEl, text);
      } else {
        notesEl.value = text;
        notesEl.dispatchEvent(new Event('input', { bubbles: true }));
        notesEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      logEvent('PARTS', 'تم حقن النص في حقل الملاحظات');
    } else {
      logEvent('PARTS', 'لم يتم العثور على حقل الملاحظات');
      setStatus(shadow, '⚠️ حقل الملاحظات غير موجود', 'warn');
    }

    const amtEl = shadow.getElementById('cp-amount');
    if (amtEl) amtEl.value = total;

    setStatus(shadow, `✅ ${parts.length} قطعة — الإجمالي: ${total} ج.م`, 'success');
  }

  // ════════════════════════════════════════════
  // سحب / ترصيد أكواد الأعطال بين البلاغات
  // ════════════════════════════════════════════

  function collectPanelDocs() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach(f => {
      try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch (_) {}
    });
    return docs;
  }

  function getCurrentOrderId() {
    const m = location.href.match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function saveCodesBuffer(codes) {
    const data = { codes, sourceOrderId: getCurrentOrderId(), capturedAt: Date.now() };
    try { localStorage.setItem(CODES_TRANSFER_KEY, JSON.stringify(data)); } catch (_) {}
    try {
      if (typeof window.storageSet === 'function') { window.storageSet({ [CODES_TRANSFER_KEY]: data }); }
      else if (chrome.storage?.local) { chrome.storage.local.set({ [CODES_TRANSFER_KEY]: data }).catch(() => {}); }
    } catch (_) {}
    return data;
  }

  function loadCodesBuffer() {
    const raw = localStorage.getItem(CODES_TRANSFER_KEY);
    if (raw) { try { return JSON.parse(raw); } catch (_) {} }
    return null;
  }

  function clearCodesBuffer() {
    try { localStorage.removeItem(CODES_TRANSFER_KEY); } catch (_) {}
    try {
      if (typeof window.storageRemove === 'function') { window.storageRemove([CODES_TRANSFER_KEY]); }
      else if (chrome.storage?.local) { chrome.storage.local.remove(CODES_TRANSFER_KEY).catch(() => {}); }
    } catch (_) {}
  }

  async function captureCodes(shadow, tab2) {
    logEvent('TRANSFER', 'بدء سحب أكواد هذا البلاغ');
    const codes = readFaultCodesFromGridPanel();
    if (!codes.length) {
      setStatus(shadow, '⚠️ لم يتم العثور على أكواد في الجدول — تأكد أن الصفحة فيها جدول أكواد الأعطال', 'warn');
      return;
    }
    saveCodesBuffer(codes);
    const order = getCurrentOrderId();
    setStatus(shadow, `✅ تم سحب ${codes.length} كود من البلاغ ${order}`, 'success');
    logEvent('TRANSFER', `تم سحب ${codes.length} كود من ${order}`);
    const el = shadow.getElementById(tab2 ? 'cp-codes-clipboard-info-2' : 'cp-codes-clipboard-info');
    if (el) el.textContent = `المحفوظ: ${codes.length} كود من ${order}`;
  }

  async function creditCodesToTarget(shadow, tab2) {
    const buf = loadCodesBuffer();
    if (!buf || !buf.codes || !buf.codes.length) {
      setStatus(shadow, '⚠️ لا توجد أكواد محفوظة — افتح البلاغ المصدر وضغط "سحب الأكواد" أولاً', 'warn');
      return;
    }
    const order = getCurrentOrderId();
    logEvent('TRANSFER', `بدء ترصيد ${buf.codes.length} كود إلى ${order}`);
    setStatus(shadow, `⏳ جاري ترصيد ${buf.codes.length} كود إلى ${order}...`);
    let ok = 0, fail = 0;
    for (const c of buf.codes) {
      setStatus(shadow, `⏳ كود: ${c.main}${c.sub ? ' / ' + c.sub : ''}`);
      try {
        if (typeof addFaultCodePage3 === 'function') {
          const res = await addFaultCodePage3(c.main, c.sub || null);
          if (res && res.ok) ok++; else fail++;
        } else {
          const addBtn = Array.from(document.querySelectorAll('a, button'))
            .find(el => el.innerText.trim() === 'اضافة كود عطل' && el.offsetParent !== null);
          if (addBtn) { addBtn.click(); fail++; }
          else fail++;
        }
      } catch (e) {
        logEvent('TRANSFER', `فشل ترصيد ${c.main}: ${e.message || e}`);
        fail++;
      }
      await sleep(800);
    }
    logEvent('TRANSFER', `اكتمل الترصيد: نجحت ${ok} فشل ${fail}`);
    setStatus(shadow, ok ? `✅ تم ترصيد ${ok} كود` + (fail ? ` (فشل ${fail})` : '') : `❌ فشلت جميع الأكواد (${fail})`, ok ? 'success' : 'error');
    const el = shadow.getElementById(tab2 ? 'cp-codes-clipboard-info-2' : 'cp-codes-clipboard-info');
    if (el) el.textContent = ok ? `تم ترصيد ${ok}` : `فشل ${fail}`;
  }

  async function archiveTransfer() {
    if (typeof logEvent !== 'function') return;
    const buf = loadCodesBuffer();
    if (buf && buf.codes) {
      try { await logEvent('TRANSFER_CAPTURED', { count: buf.codes.length, source: buf.sourceOrderId, ts: buf.capturedAt }); } catch(_) {}
    }
  }

  function readFaultCodesFromGridPanel() {
    const found = [];
    const visited = new Set();
    const codeRe = /[A-Z]{2,6}\d{2,6}[A-Z0-9_-]*/g;
    for (const doc of collectPanelDocs()) {
      const grids = doc.querySelectorAll('div.view-grid table, table.view-grid, table.entity-grid, table');
      for (const grid of grids) {
        const secText = (grid.closest('section, div[class*="grid"], div[aria-label], table')?.innerText || '') + ' ' + grid.innerText;
        if (!/أعطال|fault|defect/i.test(secText)) continue;
        const rows = grid.querySelectorAll('tbody tr, tr[data]');
        for (const tr of rows) {
          if (tr.offsetParent === null) continue;
          const tds = tr.querySelectorAll('td');
          if (tds.length < 2) continue;
          const cells = Array.from(tds).map(td => {
            try { const p = JSON.parse(td.getAttribute('data-value') || '{}'); if (p && p.FormattedValue) return String(p.FormattedValue); } catch (_) {}
            return (td.innerText || '').trim();
          }).filter(Boolean);
          const tokens = cells.join(' ').match(codeRe) || [];
          if (!tokens.length) continue;
          const main = tokens[0].replace(/^\*/, '');
          const sub = tokens.find(t => t.replace(/^\*/, '') !== main) || null;
          const key = main + (sub || '');
          if (visited.has(key)) continue;
          visited.add(key);
          found.push({ main, sub: sub || null, rowText: cells.join(' | ') });
        }
        if (found.length) break;
      }
      if (found.length) break;
    }
    return found;
  }

  function bindEvents(shadow) {
    shadow.getElementById('cp-toggle').onclick = () => { logEvent('CLICK', 'نقر على زر التبديل'); toggle(shadow); };
    shadow.getElementById('cp-dock').onclick = () => { logEvent('CLICK', 'نقر على زر الإرساء'); toggleDock(shadow); };
    shadow.getElementById('cp-ai-ideas').onclick = () => { logEvent('CLICK', 'أفكار تطوير AI'); runDevIdeas(shadow); };
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
    const captureBtns = ['cp-capture-codes', 'cp-capture-codes-2'];
    captureBtns.forEach(id => {
      const b = shadow.getElementById(id);
      if (b) b.onclick = () => { logEvent('CLICK', 'نقر على سحب الأكواد'); captureCodes(shadow, id.endsWith('-2')); };
    });
    const creditBtns = ['cp-credit-codes', 'cp-credit-codes-2'];
    creditBtns.forEach(id => {
      const b = shadow.getElementById(id);
      if (b) b.onclick = () => { logEvent('CLICK', 'نقر على ترصيد الأكواد'); creditCodesToTarget(shadow, id.endsWith('-2')); };
    });
    shadow.getElementById('cp-parse-images').onclick = () => {
      logEvent('IMAGES', 'تحليل النص');
      handleParseImages(shadow);
    };
    shadow.getElementById('cp-upload-images').onclick = () => {
      logEvent('IMAGES', 'بدء رفع الصور');
      handleUploadImages(shadow);
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
        background: CP_THEME.miniGrad, color: CP_THEME.onAccent,
        borderRadius: '50%', boxShadow: CP_THEME.popupShadow,
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
          <div id="${PANEL_ID}-popup-box" style="position:fixed;bottom:70px;right:14px;background:${CP_THEME.bg};border:1px solid ${CP_THEME.border};border-radius:8px;padding:6px;z-index:2147483646;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;display:none;box-shadow:${CP_THEME.popupShadow}">
            <div style="font-size:10px;color:${CP_THEME.warn};font-weight:700;margin-bottom:4px;text-align:center">⚡ شورت كت</div>
            <div style="display:flex;gap:3px">
              <button class="sc-popup-btn" data-sc="pm" style="flex:1;padding:4px 2px;border:1px solid ${CP_THEME.border2};border-radius:4px;background:${CP_THEME.surface};color:${CP_THEME.sub};font-size:9px;font-weight:600;cursor:pointer;text-align:center">🔧 صيانة</button>
              <button class="sc-popup-btn" data-sc="charge" style="flex:1;padding:4px 2px;border:1px solid ${CP_THEME.border2};border-radius:4px;background:${CP_THEME.surface};color:${CP_THEME.sub};font-size:9px;font-weight:600;cursor:pointer;text-align:center">❄️ شحن</button>
              <button class="sc-popup-btn" data-sc="drain" style="flex:1;padding:4px 2px;border:1px solid ${CP_THEME.border2};border-radius:4px;background:${CP_THEME.surface};color:${CP_THEME.sub};font-size:9px;font-weight:600;cursor:pointer;text-align:center">💧 صرف</button>
            </div>
            <div style="display:flex;gap:3px;margin-top:3px">
              <button class="sc-popup-btn" data-sc="pull" style="flex:1;padding:4px 2px;border:1px solid ${CP_THEME.border2};border-radius:4px;background:${CP_THEME.surface};color:${CP_THEME.sub};font-size:9px;font-weight:600;cursor:pointer;text-align:center">📦 سحب</button>
              <button class="sc-popup-btn" data-sc="refuse" style="flex:1;padding:4px 2px;border:1px solid ${CP_THEME.border2};border-radius:4px;background:${CP_THEME.surface};color:${CP_THEME.sub};font-size:9px;font-weight:600;cursor:pointer;text-align:center">🚫 رفض</button>
            </div>
            <button id="${PANEL_ID}-popup-exec" style="width:100%;margin-top:4px;padding:5px;border:none;border-radius:4px;background:${CP_THEME.execGrad};color:${CP_THEME.onAccent};font-size:10px;font-weight:700;cursor:pointer">▶ تنفيذ الكل</button>
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
    el.style.color = type === 'success' ? CP_THEME.success : type === 'error' ? CP_THEME.error : type === 'warn' ? CP_THEME.warn : CP_THEME.muted;
  }

  // ── أفكار تطوير (AI) — يجمع سياق الإضافة + الصفحة الحية ويرسلها للنموذج ──
  function collectExtensionContext() {
    const lines = [];
    try {
      const m = chrome.runtime.getManifest();
      lines.push('=== ملخص الإضافة ===');
      lines.push('اسم: ' + (m.name || ''));
      lines.push('نسخة: ' + (m.version || ''));
      lines.push('وصف: ' + (m.description || ''));
      if (m.permissions) lines.push('الصلاحيات: ' + m.permissions.join(', '));
      if (m.commands) lines.push('اختصارات: ' + Object.keys(m.commands).join(', '));
      if (m.content_scripts) {
        m.content_scripts.forEach((cs, i) => {
          lines.push('ContentScript[' + i + ']: يسري على ' + (cs.matches || []).join(', '));
          lines.push('  ملفات: ' + (cs.js || []).join(', '));
          if (cs.css) lines.push('  CSS: ' + cs.css.join(', '));
        });
      }
      if (m.web_accessible_resources) {
        const all = (m.web_accessible_resources || []).flatMap(w => w.resources || []);
        lines.push('موارد مكشوفة: ' + all.slice(0, 30).join(', '));
      }
    } catch (e) { lines.push('⚠️ تعذر قراءة الماني فيست: ' + e.message); }
    return lines.join('\n');
  }

  function collectPageContext() {
    const lines = [];
    try {
      lines.push('=== سياق الصفحة الحالية ===');
      lines.push('الرابط: ' + location.href);
      lines.push('العنوان: ' + (document.title || ''));
      lines.push('نوع الصفحة: ' + (typeof getPageType === 'function' ? (getPageType() || 'unknown') : 'unknown'));
      const feature = (typeof getActivePageFeature === 'function') ? (getActivePageFeature() || '') : '';
      if (feature) lines.push('ميزة الصفحة: ' + feature);

      const labels = new Set();
      document.querySelectorAll('label, .ms-Label, [data-label], th').forEach(el => {
        const t = (el.innerText || el.textContent || el.getAttribute('data-label') || '').trim().replace(/\s+/g, ' ');
        if (t && t.length < 80) labels.add(t);
      });
      if (labels.size) lines.push('حقول/تسميات ظاهرة (' + labels.size + '): ' + [...labels].slice(0, 40).join(' | '));

      const buttons = new Set();
      document.querySelectorAll('button, a.btn, input[type="button"]').forEach(b => {
        const t = (b.innerText || b.value || '').trim().replace(/\s+/g, ' ');
        if (t && t.length < 50) buttons.add(t);
      });
      if (buttons.size) lines.push('أزرار (' + buttons.size + '): ' + [...buttons].slice(0, 40).join(' | '));

      const selects = document.querySelectorAll('select');
      const selOpts = [];
      selects.forEach((s, i) => {
        if (i > 15) return;
        const name = (s.getAttribute('data-name') || s.name || s.id || 'sel' + i).trim();
        const opts = Array.from(s.options).slice(0, 8).map(o => o.text.trim()).filter(Boolean);
        if (opts.length) selOpts.push(name + '={' + opts.join(',') + '}');
      });
      if (selOpts.length) lines.push('قوائم منسدلة: ' + selOpts.join(' | '));

      const iframes = Array.from(document.querySelectorAll('iframe'));
      lines.push('Iframes (' + iframes.length + '): ' + iframes.slice(0, 10).map(f => f.src || f.id || '?').join(' | '));

      const grids = document.querySelectorAll('div.view-grid table thead, table.grid thead, [role="grid"] [role="columnheader"]');
      if (grids.length) {
        const headers = new Set();
        grids.forEach(g => { try { g.querySelectorAll('th, [role="columnheader"]').forEach(th => { const t = (th.innerText || '').trim(); if (t && t.length < 60) headers.add(t); }); } catch(_) {} });
        if (headers.size) lines.push('أعمدة الجداول: ' + [...headers].slice(0, 40).join(' | '));
      }

      const source = (document.documentElement.outerHTML || '').replace(/\s+/g, ' ').slice(0, 6000);
      if (source) lines.push('=== مقتطف من مصدر الصفحة (HTML) ===\n' + source);
    } catch (e) { lines.push('⚠️ خطأ بجمع سياق الصفحة: ' + e.message); }
    return lines.join('\n');
  }

  async function runDevIdeas(shadow) {
    const box = shadow.getElementById('cp-ai-ideas-box');
    if (!box) return;
    if (typeof aiService === 'undefined') {
      box.style.display = 'none';
      setStatus(shadow, '❌ aiService غير متاح', 'error');
      return;
    }
    if (!(await aiService.isAvailable())) {
      box.style.display = 'block';
      box.textContent = '⚠️ ضع API Key أولاً: افتح البوب-أب → تبويب التقارير → ⚙️ إعدادات الذكاء الاصطناعي.';
      return;
    }

    box.style.display = 'block';
    box.textContent = '💡 جاري جمع السياق وتحليل التطوير...';
    const context = collectExtensionContext() + '\n\n' + collectPageContext();

    const prompt = 'أنت خبير تطوير إضافات متصفح للبوابات (PowerApps / ASP.NET WebForms).\n' +
      'هذا ملخص إضافة موجودة تعمل على البوابة، وسياق الصفحة التي تعمل عليها حالياً.\n' +
      'اقترح 5-8 أفكار تطوير عملية وقابلة للتنفيذ، مفصّلة وواضحة بالعربية، مع إشارة لكل فكرة إلى: الفائدة والجهد (سهل/متوسط/متقدم). ركِّز على أتمتة ذكية وتقليل العمل اليدوي ورفع الدقة وتحسين تجربة المستخدم.\n\n' +
      context + '\n\nسلّط الضوء على أي ملاحظات أخطار أو تحسينات بناءة.'

    try {
      const res = await aiService.prompt(prompt,
        'أنت مساعد تطوير محترم يجيب بالعربية فقط، بشكل منظم وقوائم.',
        { maxTokens: 2000, timeout: 60000 });
      box.textContent = res || '⚠️ لم يُسحب رد';
    } catch (e) {
      box.textContent = '❌ فشل: ' + (e && e.message || String(e));
    }
  }

  function updateTab(shadow) {
    const page = detectPage();
    logEvent('TAB', `الصفحة الحالية: ${page}`);
    shadow.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
    const tab = shadow.querySelector(`.cp-tab[data-page="${page}"]`);
    if (tab) tab.classList.add('active');
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
      warn.style.cssText = `background:${CP_THEME.dangerBg};border:2px solid ${CP_THEME.dangerBorder};border-radius:8px;padding:10px 14px;margin:12px 0;color:${CP_THEME.warn};font-weight:700;font-size:15px;text-align:center;font-family:Segoe UI,Tahoma,Arial,sans-serif;box-shadow:0 2px 8px ${CP_THEME.dangerBorder}`;
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

  async function doDuplicate(shadow) {
    logEvent('EXEC_PAGE1', 'تكرار بيانات الجهاز');
    const modelEl = findFirst(CFG.modelInput) || findFieldByLabel(['الموديل الفعلي 1', 'الموديل الفعلي', 'Model']);
    const modelVal = modelEl?.value?.trim();
    if (!modelVal) { setStatus(shadow, '⚠️ لا توجد بيانات موديل', 'warn'); return; }
    const serialEl = findFirst(CFG.serial) || findFieldByLabel(['الرقم المسلسل 1', 'الرقم المسلسل', 'Serial'], 'input');
    const serialVal = serialEl?.value?.trim();

    const model2El = findFirst(CFG.modelInput2) || findFieldByLabel(['الموديل الفعلي 2', 'Model 2']);
    if (model2El) {
      if (typeof fillPowerAppsLookup === 'function') {
        await fillPowerAppsLookup(model2El, 'Model2', modelVal, CFG.modelBtn);
        await sleep(800);
      } else if (typeof emulateUserInput === 'function') {
        await emulateUserInput(model2El, modelVal);
      }
    }
    const serial2El = findFirst(CFG.serial2) || findFieldByLabel(['الرقم المسلسل 2', 'Serial 2'], 'input');
    if (serial2El && serialVal) {
      if (typeof emulateUserInput === 'function') {
        await emulateUserInput(serial2El, serialVal);
      } else {
        serial2El.value = serialVal;
        serial2El.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    setStatus(shadow, '✅ تم تكرار بيانات الجهاز', 'success');
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

      // 2. المشاكل والفنية حسب الشورت كت — الافتراضي (بدون شورت كت) = الكل
      const addManual = !shortcutType || shortcutType === 'all';
      const addProblems = addManual || shortcutType === 'prob';
      const addTech = addManual || shortcutType === 'tech';

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

      // 3. التالي — توقف بعد التعبئة (يترك الحفظ للمستخدم) إلا إذا طلب الصراحة
      const autoNext = shadow.getElementById('cp-auto-next')?.checked;
      if (autoNext) {
        await doNext(shadow);
      } else {
        setStatus(shadow, '✅ تم التعبئة — اضغط التالي/حفظ بنفسك', 'success');
      }

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
      let checkedCodes = shadow.querySelectorAll('.fault-cb:checked');
      // لو مفيش حاجة مختارة، اختار الـ 4 كلهم
      if (checkedCodes.length === 0) {
        logEvent('EXEC_PAGE3', 'مفيش كود محدد — اختيار الكل');
        shadow.querySelectorAll('.fault-cb').forEach(cb => cb.checked = true);
        checkedCodes = shadow.querySelectorAll('.fault-cb:checked');
      }
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
            if (typeof emulateUserInput === 'function') {
              await emulateUserInput(notesEl, combined);
            } else {
              notesEl.value = combined;
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

  // ════════════════════════════════════════════
  // IMAGE UPLOAD — صور السيريات
  // ════════════════════════════════════════════
  function collectDocs() {
    return [document, ...Array.from(document.querySelectorAll('iframe'))
      .map(f => { try { return f.contentDocument || f.contentWindow?.document; } catch(e) { return null; } })
      .filter(Boolean)];
  }

  function parseImageText(text) {
    const results = [];
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!/OrderId\s*:/.test(line) || !/Image\s*:/.test(line)) continue;
      const entry = {};
      const parts = line.split('|').map(p => p.trim());
      for (const part of parts) {
        const idx = part.indexOf(':');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (key === 'orderid') entry.ticket = value;
        else if (key === 'serial') entry.serial = value;
        else if (key === 'brand') entry.brand = value;
        else if (key === 'model') entry.model = value;
        else if (key === 'status') entry.status = value;
        else if (key === 'date') entry.date = value;
        else if (key === 'image') entry.imageData = value;
      }
      if (!entry.ticket || !entry.imageData || !entry.imageData.startsWith('data:image')) continue;
      const mime = (entry.imageData.split(';')[0].replace('data:', '')) || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      const safeTicket = entry.ticket.replace(/[^\w.-]/g, '_');
      const safeSerial = (entry.serial || '').replace(/[^\w.-]/g, '_');
      entry.mimetype = mime;
      entry.filename = `${safeTicket}${safeSerial ? '_' + safeSerial : ''}.${ext}`;
      const commaIdx = entry.imageData.indexOf(',');
      entry.base64 = commaIdx >= 0 ? entry.imageData.substring(commaIdx + 1) : entry.imageData;
      results.push(entry);
    }
    const merged = [];
    const byTicket = new Map();
    for (const im of results) {
      const key = (im.ticket || '').toLowerCase();
      if (!key) { merged.push(im); continue; }
      const existing = byTicket.get(key);
      if (!existing) { byTicket.set(key, im); merged.push(im); }
      else if (!existing.serial2) {
        existing.serial2 = im.serial || '';
        existing.model2 = im.model || '';
        existing.imageData2 = im.imageData || '';
        existing.base64_2 = im.base64 || '';
        existing.filename2 = im.filename || '';
        existing.mimetype2 = im.mimetype || '';
      } else { merged.push(im); }
    }
    logEvent('IMAGES', `تم تحليل ${merged.length} سطر يحتوي صور${merged.length < results.length ? ` (${results.length - merged.length} تم دمجهم)` : ''}`);
    return merged;
  }

  function readTicketFromPage() {
    const url = location.href;
    const m = url.match(/(CAS\d+)/i);
    if (m) return m[1];
    for (const doc of collectDocs()) {
      const tn = doc.querySelector('#ticketnumber, input[name*="ticketnumber"], input[id*="ticketnumber"]');
      if (tn && tn.value) {
        const vm = String(tn.value).match(/(CAS\d+)/i);
        if (vm) return vm[1];
      }
      const an = doc.querySelector('#ats_name, input[name*="ats_name"], input[id*="ats_name"]');
      if (an && an.value) {
        const am = String(an.value).match(/(CAS\d+)/i);
        if (am) return am[1];
      }
      const bodyText = (doc.body && doc.body.innerText) || '';
      const bm = bodyText.match(/(CAS\d+)/);
      if (bm) return bm[1];
    }
    return '';
  }

  function getEntityInfo() {
    const allDocs = collectDocs();
    for (const doc of allDocs) {
      const el = doc.querySelector('#notescontrol, [data-url-add]');
      if (el) {
        const targetAttr = el.getAttribute('data-target');
        if (targetAttr) {
          try {
            const parsed = JSON.parse(targetAttr);
            if (parsed.Id && parsed.LogicalName) {
              return { id: parsed.Id, logicalName: parsed.LogicalName };
            }
          } catch(e) {}
        }
        const eidEl = doc.querySelector('#EntityFormView_EntityID, input[name="EntityFormView_EntityID"]');
        if (eidEl && eidEl.value) return { id: eidEl.value, logicalName: 'incident' };
      }
    }
    for (const doc of allDocs) {
      const eidEl = doc.querySelector('#EntityFormView_EntityID, input[name="EntityFormView_EntityID"]');
      if (eidEl && eidEl.value) return { id: eidEl.value, logicalName: 'incident' };
    }
    return null;
  }

  function findNoteFileInput() {
    const allDocs = collectDocs();
    for (const doc of allDocs) {
      const input = doc.querySelector('#notescontrol input[type="file"], .entity-notes input[type="file"], [data-url-add] input[type="file"], input[type="file"][id*="note"], input[type="file"][id*="attach"], .modal input[type="file"], input[type="file"][accept*="image"]');
      if (input) return { input, doc };
    }
    return null;
  }

  function clickAddNoteButton() {
    const allDocs = collectDocs();
    for (const doc of allDocs) {
      const btn = Array.from(doc.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
        .find(b => b.offsetParent !== null && /add.?note|اضاف[ةه]\s*ملاحظ[ةه]|ملاحظ[ةه]\s*جديد|attachment/i.test((b.innerText || b.value || b.title || '').trim()));
      if (btn) { btn.click(); logEvent('IMAGES', 'تم فتح نافذة إضافة ملاحظة'); return true; }
    }
    return false;
  }

  async function getCsrfToken() {
    const allDocs = collectDocs();
    for (const doc of allDocs) {
      const inp = doc.querySelector('input[name="__RequestVerificationToken"]');
      if (inp && inp.value) { logEvent('IMAGES', 'CSRF token من input'); return inp.value; }
      const meta = doc.querySelector('meta[name="__RequestVerificationToken"], meta[name="csrf-token"]');
      if (meta && meta.content) { logEvent('IMAGES', 'CSRF token من meta'); return meta.content; }
    }
    const cookieMatch = document.cookie.match(/__RequestVerificationToken=([^;]+)/);
    if (cookieMatch) { logEvent('IMAGES', 'CSRF token من cookie'); return decodeURIComponent(cookieMatch[1]); }
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_CSRF_TOKEN' });
      if (resp && resp.token) { logEvent('IMAGES', 'CSRF token من MAIN world'); return resp.token; }
    } catch(e) {}
    return null;
  }

  function base64ToFile(entry) {
    try {
      const byteString = atob(entry.base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      return new File([bytes], entry.filename, { type: entry.mimetype });
    } catch(e) {
      logEvent('IMAGES', `فشل تحويل base64 لـ ${entry.filename}: ${e.message}`);
      return null;
    }
  }

  async function uploadImageViaWebApi(entry, entityInfo, token) {
    const navProp = `objectid_${entityInfo.logicalName}@odata.bind`;
    const body = {
      subject: 'سيريال' + (entry.serial ? ' ' + entry.serial : ''),
      notetext: '*WEB*',
      filename: entry.filename,
      mimetype: entry.mimetype,
      documentbody: entry.base64,
      objecttypecode: entityInfo.logicalName
    };
    body[navProp] = `/${entityInfo.logicalName}s(${entityInfo.id})`;
    const resp = await fetch('/_api/annotations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        '__RequestVerificationToken': token
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${text.slice(0, 160)}`);
    }
    return true;
  }

  async function uploadViaFileInput(entry) {
    let result = findNoteFileInput();
    if (!result || result.input.offsetParent === null) {
      clickAddNoteButton();
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        result = findNoteFileInput();
        if (result && result.input.offsetParent !== null) break;
      }
    }
    if (!result) return false;
    const { input } = result;
    const file = base64ToFile(entry);
    if (!file) throw new Error('تعذر تحويل الصورة');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2500);
    return true;
  }

  function setImgStatus(shadow, msg, type) {
    const el = shadow.getElementById('cp-image-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'cp-img-status' + (type ? ' ' + type : '');
    logEvent('IMAGES', msg);
  }

  function saveParsedImages(images) {
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(images.map(i => ({ ticket: i.ticket, serial: i.serial, model: i.model, filename: i.filename, mimetype: i.mimetype, base64: i.base64, serial2: i.serial2, model2: i.model2, filename2: i.filename2, mimetype2: i.mimetype2, base64_2: i.base64_2 }))));
      logEvent('IMAGES', `حفظ ${images.length} صورة في التخزين المحلي`);
    } catch(e) { logEvent('IMAGES', 'تعذر الحفظ في localStorage: ' + e.message); }
  }

  function loadParsedImages() {
    try {
      const raw = localStorage.getItem(IMAGES_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  function markImagesDone(ticket) {
    try {
      const done = JSON.parse(localStorage.getItem(IMAGES_DONE_KEY) || '[]');
      if (!done.includes(ticket)) { done.push(ticket); localStorage.setItem(IMAGES_DONE_KEY, JSON.stringify(done)); }
    } catch(e) {}
  }

  function isImagesDone(ticket) {
    try { return (JSON.parse(localStorage.getItem(IMAGES_DONE_KEY) || '[]')).includes(ticket); } catch(e) { return false; }
  }

  function handleParseImages(shadow) {
    const textarea = shadow.getElementById('cp-image-paste');
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) { setImgStatus(shadow, '⚠️ الصق نتائج الـ AI أولاً', 'warn'); return; }
    parsedImages = parseImageText(text);
    currentTicket = readTicketFromPage();
    saveParsedImages(parsedImages);
    const matching = parsedImages.filter(im => im.ticket.toLowerCase() === currentTicket.toLowerCase());
    if (parsedImages.length === 0) {
      setImgStatus(shadow, '⚠️ لم يتم العثور على صيغة صحيحة (OrderId + Image)', 'warn');
      return;
    }
    setImgStatus(shadow, `✅ تم تحليل ${parsedImages.length} صورة — ${matching.length} للبلاغ الحالي (${currentTicket || 'غير معروف'})`, 'ok');
  }

  async function handleUploadImages(shadow, imagesOverride, ticketOverride) {
    setImgStatus(shadow, '⏳ جاري التحضير...');
    try {
      if (imagesOverride) {
        parsedImages = imagesOverride;
      } else if (parsedImages.length === 0) {
        handleParseImages(shadow);
      }
      if (parsedImages.length === 0) return;

      currentTicket = ticketOverride || readTicketFromPage();
      if (!currentTicket) { setImgStatus(shadow, '⚠️ لم أجد رقم البلاغ في الصفحة', 'warn'); return; }

      const matching = parsedImages.filter(im => im.ticket.toLowerCase() === currentTicket.toLowerCase());
      if (matching.length === 0) {
        setImgStatus(shadow, `⚠️ لا توجد صور للبلاغ ${currentTicket} — صور النص: ${parsedImages.map(i => i.ticket).join(', ')}`, 'warn');
        return;
      }

      const entityInfo = getEntityInfo();
      const token = await getCsrfToken();
      const method = (entityInfo && token) ? 'webapi' : (findNoteFileInput() ? 'fileinput' : 'none');
      if (method === 'none') { setImgStatus(shadow, '⚠️ لا يوجد نظام مرفقات في الصفحة', 'warn'); return; }

      logEvent('IMAGES', `طريقة الرفع: ${method} — ${matching.length} صورة`);
      let uploaded = 0, failed = 0;
      for (const im of matching) {
        const toUpload = [{ filename: im.filename, mimetype: im.mimetype, base64: im.base64, serial: im.serial }];
        if (im.base64_2) toUpload.push({ filename: im.filename2 || im.filename, mimetype: im.mimetype2 || im.mimetype, base64: im.base64_2, serial: im.serial2 });
        for (const up of toUpload) {
          setImgStatus(shadow, `⏳ جاري رفع (${uploaded + failed + 1}/${matching.length + (im.base64_2 ? matching.length : 0)}): ${up.filename}`);
          try {
            let ok = false;
            if (method === 'webapi') {
              try {
                await uploadImageViaWebApi(up, entityInfo, token);
                ok = true;
              } catch(e) {
                logEvent('IMAGES', `Web API فشل لـ ${up.filename} — محاولة file input: ${e.message}`);
                ok = await uploadViaFileInput(up);
                if (!ok) throw new Error('لا يوجد file input بديل');
              }
            } else {
              ok = await uploadViaFileInput(up);
              if (!ok) throw new Error('لا يوجد file input');
            }
            uploaded++;
            await sleep(900);
          } catch(e) {
            failed++;
            logEvent('IMAGES', `فشل ${up.filename}: ${e.message}`);
          }
        }
      }
      if (uploaded > 0) markImagesDone(currentTicket);
      setImgStatus(shadow, `✅ تم رفع ${uploaded} صورة${failed ? ` — فشل ${failed}` : ''} للبلاغ ${currentTicket}`, uploaded > 0 && failed === 0 ? 'ok' : 'warn');
    } catch(e) {
      logEvent('IMAGES', 'خطأ: ' + e.message);
      setImgStatus(shadow, '❌ ' + e.message, 'err');
    }
  }

  async function autoUploadStoredImages(shadow) {
    const ticket = readTicketFromPage();
    if (!ticket || isImagesDone(ticket)) return;
    const stored = loadParsedImages();
    const matching = stored.filter(im => im.ticket.toLowerCase() === ticket.toLowerCase());
    if (matching.length === 0) return;
    logEvent('IMAGES', `رفع تلقائي: ${matching.length} صورة للبلاغ ${ticket}`);
    await handleUploadImages(shadow, matching);
  }

  function observePageChanges() {
    let lastPage = detectPage();
    setInterval(() => {
      const page = detectPage();
      const host = document.getElementById(PANEL_ID);
      if (page !== lastPage) {
        lastPage = page;
        if (host && host.shadowRoot) updateTab(host.shadowRoot);
      }
      if (page === 'PAGE_2' && host && host.shadowRoot) {
        const ticket = readTicketFromPage();
        if (ticket && !autoAttemptedTickets.has(ticket)) {
          autoAttemptedTickets.add(ticket);
          setTimeout(() => { autoUploadStoredImages(host.shadowRoot); }, 2500);
        }
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
        // تمرير الحدث للسجل المركزي (أحداث يدوية) في تبويب التقارير
        try {
          const oldValue = el._lastVal || '';
          chrome.runtime.sendMessage({
            type: 'SMART_LOG_EVENT',
            event: {
              pageVisitId: null,
              url: location.href,
              pageType: typeof getPageType === 'function' ? getPageType() : 'report',
              timestamp: Date.now(),
              eventType: 'FIELD_CHANGE',
              isAutomated: document.body?.dataset?.isAutofilling === 'true',
              field: id || 'غير معروف',
              tag,
              value: val || '',
              oldValue,
              diff: getDiff(oldValue, val || ''),
              label: id || tag,
              category: 'other',
            },
          }).catch(() => {});
        } catch (_) {}
        el._lastVal = el.value;
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

  document.addEventListener('elaraby:upload-images', (e) => {
    const detail = e.detail || {};
    logEvent('IMAGES', `أمر رفع من AutoFiller: ${detail.orderId || 'بدون رقم'}`);
    const host = document.getElementById(PANEL_ID);
    const shadow = host && host.shadowRoot ? host.shadowRoot : null;
    if (!shadow) { logEvent('IMAGES', 'اللوحة غير جاهزة بعد'); return; }
    handleUploadImages(shadow, null, detail.orderId).catch(() => {});
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
