// =========================================================
// fabs-controller.js — El Araby FABs Controller (أيقونات موحدة)
// نقطة تحكم واحدة لكل أدوات الإضافة:
//   - فاب 🧰 ثابت: يفتح/يغلق لوحة الأيقونات (الإعدادات وكل شيء)
//   - Alt+Shift+E: إظهار/إخفاء فابز كل السكربتات (الظاهرة في الإعدادات فقط)
//   - الحالة محفوظة في التخزين: لا تُخفى الفابز مع كل تحديث للصفحة
// التفاعل مع الأيقونة: نقر = فتح | ضغط مطول/نقر يمين = إظهار/إخفاء
// =========================================================
(function () {
  'use strict';

  const CONTROLLER_ID = 'ea-fabs-controller';
  const STORAGE_KEY = 'eaDockToolVisibility';   // { toolId: bool } — الفابز المفعّلة
  const MASTER_KEY = 'eaDockMasterHidden';      // bool — إخفاء شامل من الاختصار
  const ORDER_KEY = 'eaDockToolOrder';          // [toolId...] — ترتيب الأدوات (سحب وإفلات)
  const POS_KEY = 'eaFabPositions';             // { toolId: {x,y} } — مواضع الفابز المخصصة
  const PIN_KEY = 'eaFabPinned';                // { toolId: {x,y} } — لقطة مواضع مثبتة

  // المجموعات الافتراضية: يمين/يسار + رصّ من الأسفل (مسافة موحدة)
  const LEFT_GROUPS = ['إرسال'];
  const FAB_GAP = 62;        // المسافة الرأسية بين الفابز المرصوصة
  const FAB_EDGE = 16;       // البعد عن حافة الشاشة

  // ── سجل الأدوات ──
  const TOOLS = [
    {
      id: 'elaraby-control-panel-mini',
      title: 'لوحة التحكم (الاستعراض الفني)',
      icon: '⚙️',
      color: '#0ea5e9',
      group: 'تعبئة',
      openByClick: true,
      defaultVisible: true
    },
    {
      id: 'msq-fab',
      title: 'مرسل الماسنجر',
      icon: '📨',
      color: '#10b981',
      group: 'إرسال',
      openByClick: true,
      panel: '#msq-panel.visible',
      defaultVisible: true,
      // مقيّد بمواقع المحادثة — لا يُحقن في البورتال
      homeMatch: /(^|\.)(facebook\.com|messenger\.com|instagram\.com|whatsapp\.com)/i,
      homeUrl: 'https://www.messenger.com/'
    },
    {
      id: 'elaraby-ai-fab',
      title: 'المساعد الذكي',
      icon: '💬',
      color: '#8b5cf6',
      group: 'أدوات',
      openByClick: true,
      files: ['ai/chat-panel.js'],
      panel: '#elaraby-ai-panel',
      defaultVisible: true
    },
    {
      id: 'rp-fab',
      title: 'معالج البلاغات (Reports)',
      icon: '📋',
      color: '#f59e0b',
      group: 'أدوات',
      openByClick: true,
      panel: '#rp-mini-menu.visible, #rp-overlay.visible, #rp-settings.visible',
      defaultVisible: true,
      // يعمل في صفحة أوامر الشغل فقط — من أي صفحة أخرى يُفتح الرابط
      homeMatch: /\/Orders(\/|$|[?#])/i,
      homeUrl: 'https://elarabyportalpfs.powerappsportals.com/en-US/Orders/'
    },
    {
      id: 'elaraby-mini-btn',
      title: 'كشف أرقام العملاء',
      icon: '📞',
      color: '#f97316',
      group: 'أدوات',
      openByClick: true,
      panel: '#elaraby-fixed-box',
      defaultVisible: true
    },
    {
      id: 'elaraby-unified-host',
      title: 'مساعد العربي (قطع الغيار)',
      icon: '🛍️',
      color: '#6366f1',
      group: 'أدوات',
      openByClick: false,
      shadowClick: '.trigger-btn',
      files: ['core/booking/scanner.js', 'core/booking/shadow-panel.js'],
      defaultVisible: true
    },
    {
      id: 'elaraby-ai-voice-fab',
      title: 'التحكم الصوتي',
      icon: '🎙️',
      color: '#ec4899',
      group: 'أدوات',
      openByClick: true,
      files: ['ai/voice-control.js'],
      panel: '#ea-voice-panel',
      defaultVisible: true
    },
    {
      id: 'ea-suppressor-tool',
      title: 'كتم أخطاء البورتال',
      icon: '🛡️',
      color: '#ef4444',
      group: 'أدوات',
      openByClick: false,
      scriptId: 'portal-error-suppressor',
      defaultVisible: true
    },
    {
      id: 'future-orders-fab',
      title: 'كشف البلاغات المستقبلية (+3 أيام)',
      icon: '📅',
      color: '#0284c7',
      group: 'أدوات',
      openByClick: true,
      panel: '#ea-future-orders-panel',
      scriptId: 'future-orders-reveal',
      defaultVisible: true
    }
  ];

  // خريطة الربط الموحدة: كل أداة ↔ السكربت الخاص بها (تمبر مونكي)
  // مصدر الحالة الواحد: localStorage tm_running_<scriptId> (تكتبه الفابز والبوبأب والـ runner)
  const TOOL_TO_SCRIPT = {
    'msq-fab': 'messenger-sender',
    'rp-fab': 'report-processor',
    'elaraby-mini-btn': 'elaraby-phone-reveal',
    'ea-suppressor-tool': 'portal-error-suppressor',
    'future-orders-fab': 'future-orders-reveal'
  };
  const SCRIPT_TO_TOOL = Object.fromEntries(Object.entries(TOOL_TO_SCRIPT).map(([k, v]) => [v, k]));
  // السكربتات المسجلة في الـ runner — كلها تظهر كأدوات في اللوحة
  const SCRIPT_META = {
    'messenger-sender': { icon: '📨', title: 'مرسل الماسنجر', group: 'إرسال' },
    'report-processor': { icon: '📄', title: 'معالج البلاغات (Reports)', group: 'أدوات' },
    'elaraby-phone-reveal': { icon: '📱', title: 'كشف أرقام العملاء', group: 'أدوات' },
    'portal-error-suppressor': { icon: '🛡️', title: 'كتم أخطاء البورتال', group: 'أدوات' },
    'future-orders-reveal': { icon: '📅', title: 'كشف البلاغات المستقبلية', group: 'أدوات' }
  };

  // حالة السكربت الحية — يقرأ من chrome.storage.local (يكتبه الـ runner) + fallback للـ localStorage
  async function getScriptRunning(scriptId) {
    try {
      const stored = await chrome.storage.local.get({ tmRunning: {} });
      if (stored.tmRunning && stored.tmRunning[scriptId]?.running) return true;
    } catch(e) {}
    // Fallback to localStorage
    try { return localStorage.getItem('tm_running_' + scriptId) === '1'; } catch(e) { return false; }
  }

  // حقن ملفات أداة داخلية عند الطلب (ليست ضمن content_scripts — خفيفة على الصفحة)
  function injectToolFiles(tool) {
    if (!tool.files || !tool.files.length) return Promise.resolve(false);
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(
          { action: 'INJECT_SCRIPT_FILE', files: tool.files, world: 'ISOLATED' },
          (res) => resolve(!!(res && res.ok))
        );
      } catch (e) { resolve(false); }
    });
  }

  // تشغيل/إيقاف السكربت عبر الـ runner فقط (مصدر الحقيقة الوحيد)
  function setToolScriptViaRunner(tool, active) {    const scriptId = TOOL_TO_SCRIPT[tool.id];
    if (!scriptId) return Promise.resolve(false);
    
    return new Promise(resolve => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        chrome.runtime.sendMessage(
          { action: active ? 'RUN_SCRIPT_NOW' : 'STOP_SCRIPT_NOW', scriptId },
          (res) => finish(!!(res && res.ok === true))
        );
      } catch (e) { finish(false); }
      // ضمان ألا تعلق اللوحة إلى الأبد لو لم يستجب أحد
      setTimeout(() => finish(false), 8000);
    });
  }

  const GROUP_ORDER = ['تعبئة', 'حجز', 'إرسال', 'أدوات'];
  const GROUP_ICON = { 'تعبئة': '✍️', 'حجز': '📅', 'إرسال': '📤', 'أدوات': '🧰' };

  // ── الحالة ──
  let paletteOpen = false;
  let settingsView = false;
  let visibility = {};      // { toolId: true } — الفابز المفعّلة من الإعدادات
  let masterHidden = false; // الاختصار يخفي الكل مؤقتاً
  let arranged = false;
  let lastShortcutFire = 0;
  let scanTimer = null;
  let dragToolId = null; // أداة السحب الحالية (إعادة الترتيب داخل اللوحة)
  let fabPositions = {}; // { toolId: {x,y} } — مواضع مخصصة بعد السحب
  let pinnedPositions = null; // لقطة المواضع المثبتة
  let eaDragging = false; // سحب فاب جارٍ — نمنع الرص أثناء السحب

  // ════════════════════════════════════════════════════════
  //  التخزين الدائم (لا تُخفى الفابز مع تحديث الصفحة)
  // ════════════════════════════════════════════════════════
  async function loadState() {
    try {
      const saved = await chrome.storage.local.get([STORAGE_KEY, MASTER_KEY, ORDER_KEY, POS_KEY, PIN_KEY]);
      visibility = saved[STORAGE_KEY] || {};
      masterHidden = saved[MASTER_KEY] === true;
      fabPositions = saved[POS_KEY] || {};
      pinnedPositions = saved[PIN_KEY] || null;
      // أول تشغيل: لو مفيش إعدادات محفوظة → استخدم defaultVisible لكل أداة
      if (!saved[STORAGE_KEY] || Object.keys(visibility).length === 0) {
        TOOLS.forEach(t => { visibility[t.id] = t.defaultVisible !== false; });
      } else {
        // تأكد إن كل الأدوات المعروفة لها قيمة في visibility
        TOOLS.forEach(t => {
          if (visibility[t.id] === undefined) visibility[t.id] = t.defaultVisible !== false;
        });
      }
      // استرجاع ترتيب السحب والإفلات المحفوظ
      const savedOrder = saved[ORDER_KEY];
      if (Array.isArray(savedOrder) && savedOrder.length === TOOLS.length) {
        const byId = new Map(TOOLS.map(t => [t.id, t]));
        const reordered = savedOrder.map(id => byId.get(id)).filter(Boolean);
        if (reordered.length === TOOLS.length) TOOLS.splice(0, TOOLS.length, ...reordered);
      }
    } catch (e) {
      visibility = {};
      masterHidden = false;
      TOOLS.forEach(t => { visibility[t.id] = t.defaultVisible !== false; });
    }
  }

  async function saveState() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: visibility,
        [MASTER_KEY]: masterHidden,
        [ORDER_KEY]: TOOLS.map(t => t.id),
        [POS_KEY]: fabPositions,
        [PIN_KEY]: pinnedPositions || {}
      });
    } catch (e) {}
  }

  // هل الفاب مسموح بالظهور حالياً؟
  function shouldShow(tool) {
    return visibility[tool.id] === true && !masterHidden;
  }

  // ════════════════════════════════════════════════════════
  //  التحكم في عناصر الفابز داخل الصفحة
  // ════════════════════════════════════════════════════════
  function findFab(tool) {
    const ids = tool.id === 'elaraby-mini-btn' ? ['elaraby-mini-btn', 'elaraby-fixed-box'] : [tool.id];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  // هل لوحة الأداة مفتوحة فعلاً؟ (لمنع النقر الذي يُغلقها بدلاً من فتحها)
  function isPanelOpen(tool) {
    if (!tool.panel) return false;
    try {
      const el = document.querySelector(tool.panel);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    } catch (e) { return false; }
  }

  // انتظار ظهور الفاب حتى يُحقن السكربت ويبني واجهته (بدل انتظار ثابت)
  function waitForFab(tool, timeoutMs) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const check = () => {
        const fab = findFab(tool);
        if (fab || (Date.now() - t0) >= timeoutMs) { resolve(fab); return; }
        setTimeout(check, 150);
      };
      check();
    });
  }

  function showFab(fab) {
    // يتجاوز قاعدة الإخفاء المبكر (dock-fab-hider) — يجب override بـ !important
    fab.style.setProperty('display', fab.tagName === 'DIV' ? 'block' : 'flex', 'important');
    fab.style.setProperty('visibility', 'visible', 'important');
    // تطبيق صنف وشكل الفاب الجديد (Glassmorphism + Hover Scale)
    fab.classList.add('ea-fab-page');
    // متغيرات اللون للـ CSS
    const tool = TOOLS.find(t => t.id === fab.id || (fab.id === 'elaraby-fixed-box' && t.id === 'elaraby-mini-btn') || (t.panel && document.querySelector(t.panel)?.contains(fab)));
    if (tool) {
      fab.style.setProperty('--fab-color', tool.color || '#0ea5e9');
      fab.style.setProperty('--fab-bg', 'linear-gradient(135deg, #0b1220, #0f1e35)');
    }
    // Hover listeners
    if (!fab.dataset.hoverBound) {
      fab.addEventListener('mouseenter', () => fab.classList.add('hovered'));
      fab.addEventListener('mouseleave', () => fab.classList.remove('hovered'));
      fab.dataset.hoverBound = '1';
    }
  }

  function applyToolVisibility(tool, forceVisible) {
    const fab = findFab(tool);
    if (!fab) return;
    if (forceVisible) {
      showFab(fab);
      // إعادة صندوق كشف الأرقام لوضعه قبل الإخفاء (بدل فرض ظهور/إخفاء دائم)
      if (tool.id === 'elaraby-mini-btn') {
        const box = document.getElementById('elaraby-fixed-box');
        if (box && box.dataset.eaPrevDisplay !== undefined) {
          box.style.display = box.dataset.eaPrevDisplay;
          delete box.dataset.eaPrevDisplay;
        }
      }
    } else {
      fab.style.setProperty('display', 'none', 'important');
      if (tool.id === 'elaraby-control-panel-mini') {
        const panel = document.getElementById('elaraby-control-panel');
        if (panel) panel.style.setProperty('display', 'none', 'important');
      }
      if (tool.id === 'elaraby-fixed-box' || tool.id === 'elaraby-mini-btn') {
        const box = document.getElementById('elaraby-fixed-box');
        if (box) {
          if (box.dataset.eaPrevDisplay === undefined) {
            box.dataset.eaPrevDisplay = box.style.display || 'flex';
          }
          box.style.setProperty('display', 'none', 'important');
        }
      }
    }
    // أي تغيير في الظهور → رص شامل فوراً (يمنع تداخل الأيقونات)
    relayout();
    // تحديث الـ Active state للفابز الفردية
    updateFabActiveState();
  }

  // تطبيق فوري — نظهر/نخفي الفابز الفردية مع الشكل الجديد
  function applyVisibilityImmediate(tool, fab) {
    if (!fab) return;
    attachFabDrag(tool, fab);
    const scriptId = TOOL_TO_SCRIPT[tool.id];
    const scriptRunning = scriptId ? getScriptRunning(scriptId) : false;
    const shouldShowNow = (visibility[tool.id] === true && !masterHidden) || scriptRunning;
    const current = getComputedStyle(fab).display;

    if (!shouldShowNow && current !== 'none') {
      applyToolVisibility(tool, false);
    } else if (shouldShowNow) {
      // فاب مفعل — تأكد إنه ظاهر بشكل صحيح مع الشكل الجديد
      if (current === 'none') {
        applyToolVisibility(tool, true);
      }
      // تأكد من تطبيق الشكل الجديد
      if (!fab.classList.contains('ea-fab-page')) {
        showFab(fab);
      }
      if (!fab.dataset.eaLaid) {
        if (relayout()) fab.dataset.eaLaid = '1';
      }
    }
  }

  // فحص دوري: أي فاب جديد يظهر في الصفحة يُطبّق عليه الحكم + السحب + الموضع
  function scanAndApply() {
    TOOLS.forEach(tool => {
      const fab = findFab(tool);
      if (!fab) return;
      applyVisibilityImmediate(tool, fab);
    });
  }

  // ════════════════════════════════════════════════════════
  //  الاختصار Alt+Shift+E: إظهار/إخفاء فابز السكربتات
  // ════════════════════════════════════════════════════════
  function toggleFabs() {
    const now = Date.now();
    if (now - lastShortcutFire < 250) return; // منع التنفيذ المزدوج (رسالة + كيبورد)
    lastShortcutFire = now;

    masterHidden = !masterHidden;
    saveState();

    if (masterHidden) {
      // إخفاء كل الفابز
      TOOLS.forEach(t => applyToolVisibility(t, false));
    } else {
      // إظهار الفابز المفعلة فقط + تطبيق مواضعها
      TOOLS.forEach(t => {
        if (visibility[t.id] === true) applyToolVisibility(t, true);
      });
      relayout();
    }
    updatePaletteIcons();
  }

  // ════════════════════════════════════════════════════════
  //  مواضع فابز الصفحة: رص افتراضي حسب الجروب + سحب حر + تثبيت/ريست
  // ════════════════════════════════════════════════════════

  // فابز قابلة للسحب على الصفحة (مستثنى: بوابة قطع الغيار — تسحب بمقبضها الداخلي)
  function isPageDraggable(tool) {
    return tool.id !== 'elaraby-unified-host';
  }

  // الترتيب الافتراضي: يمين (كل المجموعات إلا إرسال) + يسار (إرسال) — رص من الأسفل
  // الزاوية اليمنى السفلية محجوزة لفاب 🧰 لوحة الأدوات → رص اليمين يبدأ فوقها
  function applyDefaultLayout() {
    const visible = TOOLS.filter(t => shouldShow(t) && findFab(t));
    const hasSaved = (t) => (pinnedPositions && pinnedPositions[t.id]) || fabPositions[t.id];
    const right = visible.filter(t => !LEFT_GROUPS.includes(t.group) && !hasSaved(t));
    const left = visible.filter(t => LEFT_GROUPS.includes(t.group) && !hasSaved(t));
    right.forEach((t, i) => {
      const fab = findFab(t);
      if (!fab) return;
      fab.style.setProperty('position', 'fixed', 'important');
      fab.style.setProperty('bottom', (FAB_EDGE + (i + 1) * FAB_GAP) + 'px', 'important');
      fab.style.setProperty('right', FAB_EDGE + 'px', 'important');
      fab.style.setProperty('left', '', 'important');
      fab.style.setProperty('top', '', 'important');
    });
    left.forEach((t, i) => {
      const fab = findFab(t);
      if (!fab) return;
      fab.style.setProperty('position', 'fixed', 'important');
      fab.style.setProperty('bottom', (FAB_EDGE + i * FAB_GAP) + 'px', 'important');
      fab.style.setProperty('left', FAB_EDGE + 'px', 'important');
      fab.style.setProperty('right', '', 'important');
      fab.style.setProperty('top', '', 'important');
    });
  }

  // تطبيق المواضع المحفوظة (بعد السحب) أو اللقطة المثبتة
  function applySavedLayout(source) {
    const positions = source || fabPositions;
    if (!positions || typeof positions !== 'object') return;
    TOOLS.forEach(t => {
      const p = positions[t.id];
      const fab = findFab(t);
      if (!fab || !p || typeof p.x !== 'number') return;
      fab.style.setProperty('position', 'fixed', 'important');
      fab.style.setProperty('left', Math.round(p.x) + 'px', 'important');
      fab.style.setProperty('top', Math.round(p.y) + 'px', 'important');
      fab.style.setProperty('right', '', 'important');
      fab.style.setProperty('bottom', '', 'important');
    });
  }

  // رص شامل: الافتراضي أولاً (لمن لا موضع محفوظ) ثم المثبت/المزاح فوقه
  function relayout() {
    if (eaDragging) return false; // لا نعيد رص أي شيء أثناء سحب مستخدم
    applyDefaultLayout();
    if (pinnedPositions && Object.keys(pinnedPositions).length) applySavedLayout(pinnedPositions);
    else if (Object.keys(fabPositions).length) applySavedLayout(fabPositions);
    return true;
  }

  // سحب حر للفاب على الصفحة (Pointer Events) + حفظ الموقع
  function attachFabDrag(tool, fab) {    if (fab.dataset.eaDrag === '1' || !isPageDraggable(tool)) return;
    fab.dataset.eaDrag = '1';
    let dragging = false, moved = false, startX = 0, startY = 0, offX = 0, offY = 0;

    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; moved = false;
      eaDragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = fab.getBoundingClientRect();
      offX = startX - rect.left; offY = startY - rect.top;
      fab.setPointerCapture?.(e.pointerId);
      fab.style.cursor = 'grabbing';
    });

    fab.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = Math.abs(e.clientX - startX), dy = Math.abs(e.clientY - startY);
      if (dx > 3 || dy > 3) moved = true;
      if (!moved) return;
      e.preventDefault();
      const x = Math.min(Math.max(e.clientX - offX, 0), window.innerWidth - fab.offsetWidth);
      const y = Math.min(Math.max(e.clientY - offY, 0), window.innerHeight - fab.offsetHeight);
      fab.style.setProperty('position', 'fixed', 'important');
      fab.style.setProperty('left', x + 'px', 'important');
      fab.style.setProperty('top', y + 'px', 'important');
      fab.style.setProperty('right', '', 'important');
      fab.style.setProperty('bottom', '', 'important');
      fab.style.zIndex = '2147483646';
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      eaDragging = false;
      fab.style.cursor = '';
      try { fab.releasePointerCapture?.(e.pointerId); } catch (_) {}
      if (moved) {
        const rect = fab.getBoundingClientRect();
        fabPositions[tool.id] = { x: rect.left, y: rect.top };
        saveState();
        // السحب لا يُفتح لوحة الأداة بالخطأ: نبتلع النقرة التي تلي السحب
        const swallow = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          document.removeEventListener('click', swallow, true);
        };
        document.addEventListener('click', swallow, true);
      }
    };
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);
  }

  // 📌 تثبيت المواضع الحالية (لقطة) — تستبدل أي تثبيت سابق
  function pinFabs() {
    const snapshot = {};
    TOOLS.forEach(t => {
      const fab = findFab(t);
      if (!fab) return;
      const rect = fab.getBoundingClientRect();
      snapshot[t.id] = { x: Math.round(rect.left), y: Math.round(rect.top) };
    });
    pinnedPositions = snapshot;
    fabPositions = {};
    saveState();
    relayout();
    renderSettings();
  }

  // ↩️ إرجاع: رجوع كل الأيقونات إلى مواضعها المثبتة (يلغي السحب غير المثبت)
  function restorePinned() {
    if (!pinnedPositions || !Object.keys(pinnedPositions).length) return;
    fabPositions = {};
    saveState();
    relayout();
    renderSettings();
  }

  // 🔄 ريست: حذف كل المواضع المخصصة والمثبتة → الترتيب الافتراضي للجروبات
  function resetFabs() {
    fabPositions = {};
    pinnedPositions = null;
    saveState();
    relayout();
    renderSettings();
  }

  function updateSettingsBtn() {
    const btn = document.getElementById(CONTROLLER_ID + '-arrange-btn');
    if (!btn) return;
    const pinned = pinnedPositions && Object.keys(pinnedPositions).length > 0;
    btn.textContent = pinned ? '📌 تحديث التثبيت (لقطة جديدة ✓)' : '📌 تثبيت المواضع الحالية';
  }

  // ════════════════════════════════════════════════════════
  //  بناء الواجهة: فاب 🧰 + لوحة أيقونات مدمجة
  // ════════════════════════════════════════════════════════
  function buildDock() {
    if (document.getElementById(CONTROLLER_ID)) return;
    if (!document.body) return;

    // ── فاب 🧰 الثابت الوحيد ──
    const fab = document.createElement('button');
    fab.id = CONTROLLER_ID + '-fab';
    fab.textContent = '🧰';
    fab.title = 'أدوات العربي — الإعدادات وكل الأدوات (لوحة الأيقونات)';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483646',
      width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #0ea5e9',
      background: 'linear-gradient(135deg, #0b1220, #0f1e35)', color: '#0ea5e9',
      fontSize: '22px', cursor: 'pointer',
      boxShadow: '0 6px 20px rgba(0,0,0,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Segoe UI, sans-serif', userSelect: 'none', lineHeight: '1'
    });
    fab.addEventListener('click', (e) => { e.stopPropagation(); togglePalette(); });
    document.body.appendChild(fab);

    // ── أنماط: سكرولبار + FABs فردية (Glassmorphism + Hover Scale) ──
    const dockStyle = document.createElement('style');
    dockStyle.textContent = `
      #${CONTROLLER_ID}-palette::-webkit-scrollbar { width: 7px; }
      #${CONTROLLER_ID}-palette::-webkit-scrollbar-track { background: transparent; }
      #${CONTROLLER_ID}-palette::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #0ea5e9, #6366f1);
        border-radius: 4px;
        border: 2px solid #0b1220;
      }
      #${CONTROLLER_ID}-palette::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #38bdf8, #818cf8); }
      #${CONTROLLER_ID}-palette { scrollbar-width: thin; scrollbar-color: #6366f1 #0b1220; }

      /* ── FABs فردية على حواف الشاشة — Glassmorphism + Hover Scale ── */
      .ea-fab-page {
        width: 24px !important; height: 24px !important;
        min-width: 24px !important; min-height: 24px !important;
        border-radius: 50%;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 12px !important;
        line-height: 1 !important;
        /* الحالة الافتراضية: زجاجي/رمادي شفاف */
        background: rgba(19,43,78,.5) !important;
        border: 1px solid rgba(30,52,80,.5) !important;
        color: rgba(200,208,224,.7) !important;
        opacity: .4 !important;
        filter: grayscale(.6) saturate(.8) !important;
        /* أنيميشن سلسة */
        transition: all .2s cubic-bezier(.2,.8,.2,1) !important;
        transform-origin: center !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.3) !important;
        cursor: pointer !important;
        user-select: none !important;
        z-index: 2147483646 !important;
        box-sizing: border-box !important;
        padding: 0 !important;
      }

      /* ── عند hover: يكبر للوضوح + يأخذ اللون المميز ── */
      .ea-fab-page:hover,
      .ea-fab-page.hovered {
        width: 48px !important; height: 48px !important;
        min-width: 48px !important; min-height: 48px !important;
        font-size: 20px !important;
        opacity: 1 !important;
        filter: none !important;
        background: var(--fab-bg, linear-gradient(135deg, #0b1220, #0f1e35)) !important;
        border: 2px solid var(--fab-color, #0ea5e9) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.5) !important;
        z-index: 2147483650 !important;
        transform: scale(1) !important;
      }

      /* ── الأيقونة النشطة (اللي فتحت لوحتها) ── */
      .ea-fab-page.active {
        border-color: #2bd46f !important;
        box-shadow: 0 0 16px rgba(43,212,111,.6), 0 8px 24px rgba(0,0,0,.5) !important;
      }

      @media (max-width: 480px) {
        #${CONTROLLER_ID}-palette {
          width: calc(100vw - 24px) !important;
          right: 12px !important;
          bottom: 72px !important;
          max-height: 55vh !important;
          font-size: 12px !important;
        }
        .ea-fabs-tile { width: 62px !important; padding: 4px 2px !important; }
        .ea-fabs-icon { width: 34px !important; height: 34px !important; min-width: 34px !important; font-size: 15px !important; }
        #${CONTROLLER_ID}-fab { width: 44px !important; height: 44px !important; font-size: 20px !important; }
        .ea-fab-page { width: 20px !important; height: 20px !important; font-size: 10px !important; }
        .ea-fab-page:hover, .ea-fab-page.hovered { width: 40px !important; height: 40px !important; font-size: 18px !important; }
      }
      @media (min-width: 481px) and (max-width: 760px) {
        #${CONTROLLER_ID}-palette { width: 260px !important; }
      }
    `;
    document.head.appendChild(dockStyle);

    // ── اللوحة المدمجة (تطفو فوق الفاب) ──
    const palette = document.createElement('div');
    palette.id = CONTROLLER_ID + '-palette';
    Object.assign(palette.style, {
      position: 'fixed', bottom: '74px', right: '16px', zIndex: '2147483647',
      width: '212px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      background: 'linear-gradient(180deg, #0d1830, #0b1220)',
      border: '1px solid #1e3450', borderRadius: '14px',
      boxShadow: '0 12px 40px rgba(0,0,0,.6)', direction: 'rtl',
      fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", fontSize: '12px',
      opacity: '0', transform: 'scale(.9)', transformOrigin: 'bottom right',
      transition: 'opacity .18s ease, transform .18s ease',
      pointerEvents: 'none', userSelect: 'none'
    });

    // الهيدر
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '10px 12px', background: 'linear-gradient(135deg,#0f1e35,#132b4e)',
      borderBottom: '1px solid #1e3450', borderTopLeftRadius: '14px',
      borderTopRightRadius: '14px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky', top: '0', zIndex: '2'
    });
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:15px">🧰</span>
        <span style="font-weight:700;font-size:12px;color:#fff" id="${CONTROLLER_ID}-title">أدوات العربي</span>
      </div>
      <div style="display:flex;align-items:center;gap:2px">
        <button id="${CONTROLLER_ID}-settings-btn" style="background:none;border:none;color:#7d97b8;font-size:15px;cursor:pointer;padding:2px 5px" title="الإعدادات">⚙️</button>
        <button id="${CONTROLLER_ID}-close" style="background:none;border:none;color:#7d97b8;font-size:15px;cursor:pointer;padding:2px 5px" title="إغلاق (ESC)">✕</button>
      </div>`;
    palette.appendChild(header);

    // محتوى اللوحة (شبكة الأيقونات أو الإعدادات)
    const body = document.createElement('div');
    body.id = CONTROLLER_ID + '-body';
    Object.assign(body.style, { padding: '8px 10px 10px' });
    palette.appendChild(body);

    // الفوتر
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      padding: '6px 10px', borderTop: '1px solid #1e3450', color: '#7d97b8',
      fontSize: '9px', textAlign: 'center', position: 'sticky', bottom: '0',
      background: '#0b1220', borderBottomLeftRadius: '14px', borderBottomRightRadius: '14px'
    });
    footer.innerHTML = `اضغط مطولاً على الأيقونة لإظهار/إخفاء · الاختصار <kbd style="background:#132b4e;padding:0 4px;border-radius:3px;border:1px solid #1e3450">Alt+Shift+E</kbd> لإظهار/إخفاء الكل`;
    palette.appendChild(footer);

    document.body.appendChild(palette);

    document.getElementById(CONTROLLER_ID + '-close').addEventListener('click', (e) => { e.stopPropagation(); closePalette(); });
    document.getElementById(CONTROLLER_ID + '-settings-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); });

    // إغلاق بالنقر خارج اللوحة
    document.addEventListener('click', (e) => {
      if (!paletteOpen) return;
      if (palette.contains(e.target) || fab.contains(e.target)) return;
      closePalette();
    }, true);

    // إغلاق بـ ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && paletteOpen) closePalette();
    }, true);
  }

  // ── أيقونة أداة واحدة (36×36) + اسمها + سحب وإفلات ──
  function buildToolIcon(tool) {
    // حاوية الـ tile (تحتوي الأيقونة + الاسم) — قابلة للسحب للترتيب
    const tile = document.createElement('div');
    tile.className = 'ea-fabs-tile';
    tile.dataset.tool = tool.id;
    tile.draggable = true;
    Object.assign(tile.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      width: '72px', padding: '5px 3px', borderRadius: '10px',
      border: '1px solid transparent', cursor: 'grab',
      background: 'rgba(19,43,78,.45)', userSelect: 'none',
      transition: 'border-color .15s ease, opacity .15s ease'
    });
    tile.title = 'اسحب لترتيب الأدوات';

    const btn = document.createElement('button');
    btn.className = 'ea-fabs-icon';
    btn.id = CONTROLLER_ID + '-icon-' + tool.id;
    btn.textContent = tool.icon;
    btn.title = tool.title + ' — نقر: فتح | ضغط مطول: إظهار/إخفاء';
    Object.assign(btn.style, {
      width: '36px', height: '36px', minWidth: '36px',
      borderRadius: '9px', border: '1px solid #1e3450', background: '#132b4e',
      fontSize: '17px', cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', lineHeight: '1',
      transition: 'opacity .15s ease, border-color .15s ease, transform .1s ease'
    });
    if (visibility[tool.id] !== true) {
      btn.style.opacity = '.38';
      btn.style.filter = 'grayscale(.6)';
    } else {
      btn.style.borderColor = '#0ea5e9';
    }
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.08)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

    // اسم الأداة تحت الأيقونة (علشان مانتلخبطش)
    const name = document.createElement('div');
    name.textContent = tool.title;
    Object.assign(name.style, {
      marginTop: '4px', fontSize: '9px', color: '#9db4d0',
      maxWidth: '66px', whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis', textAlign: 'center', lineHeight: '1.25'
    });
    name.title = tool.title;
    tile.appendChild(btn);
    tile.appendChild(name);

    // ── ضغط مطول (500ms) = إظهار/إخفاء ──
    let pressTimer = null;
    let longPressed = false;
    btn.addEventListener('pointerdown', (e) => {
      longPressed = false;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        longPressed = true;
        toggleToolEnabled(tool);
      }, 500);
    });
    const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    btn.addEventListener('pointerup', clearPress);
    btn.addEventListener('pointerleave', clearPress);
    btn.addEventListener('pointercancel', clearPress);

    // نقر يمين = إظهار/إخفاء أيضاً
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearPress();
      toggleToolEnabled(tool);
    });

    // ── نقر = فتح الأداة ──
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (longPressed) { longPressed = false; return; }
      openTool(tool);
    });

    // ── سحب وإفلات: إعادة ترتيب الأدوات (محفوظ) ──
    tile.addEventListener('dragstart', (e) => {
      dragToolId = tool.id;
      tile.style.opacity = '.35';
      clearPress();            // ألغي الضغط المطول أثناء السحب
      longPressed = true;      // حتى لا يفتح الأداة بعد انتهاء السحب
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', tool.id); } catch(_) {}
    });
    tile.addEventListener('dragend', () => {
      dragToolId = null;
      tile.style.opacity = '';
      document.querySelectorAll('.ea-fabs-tile').forEach(t => { t.style.borderColor = 'transparent'; });
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragToolId || dragToolId === tool.id) return;
      e.dataTransfer.dropEffect = 'move';
      tile.style.borderColor = '#0ea5e9';
    });
    tile.addEventListener('dragleave', () => {
      if (tile.style.borderColor === 'rgb(14, 165, 233)') tile.style.borderColor = 'transparent';
    });
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragToolId || dragToolId === tool.id) return;
      reorderTool(dragToolId, tool.id);
    });

    return tile;
  }

  // إعادة ترتيب أداة قبل أداة أخرى + حفظ
  function reorderTool(dragId, beforeId) {
    const from = TOOLS.findIndex(t => t.id === dragId);
    const to = TOOLS.findIndex(t => t.id === beforeId);
    if (from === -1 || to === -1 || from === to) return;
    const [moved] = TOOLS.splice(from, 1);
    TOOLS.splice(to, 0, moved);
    saveState();
    renderPaletteMain();
  }

  // ── تبديل أداة: تشغيل/إيقاف سكربتها (من الفابز → ينعكس في التمبر مونكي) ──
  async function toggleToolEnabled(tool) {
    const scriptId = TOOL_TO_SCRIPT[tool.id];
    const targetOn = visibility[tool.id] !== true;

    if (scriptId) {
      // أداة مرتبطة بسكربت: التشغيل/الإيقاف الحقيقي عبر الـ runner
      await setToolScriptViaRunner(tool, targetOn);
      // تحديث تفعيل الفاب ليطابق حالة السكربت
      visibility[tool.id] = targetOn;
      saveState();
      if (targetOn) {
        if (!masterHidden) applyToolVisibility(tool, true);
      } else {
        applyToolVisibility(tool, false);
      }
    } else {
      // أداة داخلية بلا سكربت: نفس السلوك السابق (إظهار/إخفاء فقط)
      visibility[tool.id] = targetOn;
      saveState();
      if (targetOn) {
        if (!masterHidden) applyToolVisibility(tool, true);
      } else {
        applyToolVisibility(tool, false);
      }
    }
    updatePaletteIcons();
  }

  async function updatePaletteIcons() {
    const icons = document.querySelectorAll('.ea-fabs-icon');
    for (const el of icons) {
      const tool = TOOLS.find(t => CONTROLLER_ID + '-icon-' + t.id === el.id);
      if (!tool) continue;
      const scriptId = TOOL_TO_SCRIPT[tool.id];
      const running = scriptId ? await getScriptRunning(scriptId) : false;
      if (running) {
        el.style.opacity = '1';
        el.style.filter = '';
        el.style.borderColor = '#2bd46f';
        el.style.boxShadow = '0 0 8px rgba(43,212,111,.5)';
      } else if (visibility[tool.id] === true) {
        el.style.opacity = '1';
        el.style.filter = '';
        el.style.borderColor = '#0ea5e9';
        el.style.boxShadow = '';
      } else {
        el.style.opacity = '.38';
        el.style.filter = 'grayscale(.6)';
        el.style.borderColor = '#1e3450';
        el.style.boxShadow = '';
      }
    }
  }

  // ── تحديث حالة Active للفابز الفردية (اللي فتحت لوحتها) ──
  function updateFabActiveState() {
    TOOLS.forEach(t => {
      const fab = findFab(t);
      if (!fab) return;
      let isActive = false;
      if (t.panel) {
        const el = document.querySelector(t.panel);
        if (el) {
          const cs = getComputedStyle(el);
          isActive = cs.display !== 'none' && cs.visibility !== 'hidden';
        }
      } else if (t.id === 'elaraby-control-panel-mini') {
        const cp = document.getElementById('elaraby-control-panel');
        if (cp) {
          const shadow = cp.shadowRoot;
          const panel = shadow?.querySelector('.cp-panel');
          isActive = panel && panel.style.display !== 'none';
        }
      }
      fab.classList.toggle('active', isActive);
    });
  }

  // ── فتح أداة من اللوحة (Stack item click) ──
  async function openTool(tool) {
    // أدوات مقيّدة بموقع معيّن: لا تُحقن في صفحة غريبة — افتح موقعها بدلًا من ذلك
    if (tool.homeMatch && !tool.homeMatch.test(window.location.href)) {
      console.info('[fabs] out of scope:', tool.id, '→', tool.homeUrl);
      // فعّل السكربت (بدون حقن هنا) حتى يشتغل تلقائيًا في موقعـه الصحيح
      const sid = TOOL_TO_SCRIPT[tool.id];
      if (sid) {
        try { chrome.runtime.sendMessage({ action: 'ENABLE_SCRIPT', scriptId: sid }, () => void 0); } catch (_) {}
      }
      try { window.open(tool.homeUrl, '_blank', 'noopener'); } catch (_) {}
      return;
    }
    // تشغيل السكربت المرتبط إن وُجد — السكريبت ينشئ واجهته تلقائياً عند الحقن
    const scriptId = TOOL_TO_SCRIPT[tool.id];

    // 1) أدوات داخلية بملفات (chat-panel, voice-control, unified-host): حقن الملفات
    if (tool.files) {
      const ok = await injectToolFiles(tool);
      console.log('[fabs] inject files:', tool.id, ok ? 'ok' : 'FAILED', tool.files.join(', '));
      // بعد الحقن: أظهر اللوحة إن وجدت
      if (tool.panel) {
        await waitForFab(tool, 1000); // انتظار قصير لبناء اللوحة
      }
    }
    // 2) أدوات تامبرمونكي (msq-fab, rp-fab, elaraby-mini-btn): تشغيل السكربت عبر الـ runner
    else if (scriptId) {
      await setToolScriptViaRunner(tool, true);
      // لا ننتظر الفاب الفردي — نفتح اللوحة مباشرة عبر الـ selector
    }
    // 3) أدوات أخرى (suppressor): لا فاب ولا لوحة

    // تفعيل الأداة في الحالة
    visibility[tool.id] = true;
    masterHidden = false;
    saveState();

    // ── فتح اللوحة مباشرة عبر الـ panel selector (بدون فاب فردي) ──
    if (tool.panel) {
      try {
        const panel = document.querySelector(tool.panel);
        if (panel) {
          panel.style.setProperty('display', 'block', 'important');
          panel.style.setProperty('visibility', 'visible', 'important');
          // إذا كانت لوحة msq-panel تحتاج class .visible
          if (tool.id === 'msq-fab') panel.classList.add('visible');
          console.log('[fabs] panel shown via selector:', tool.id);
        } else {
          console.warn('[fabs] panel not found for:', tool.id, tool.panel);
        }
      } catch (e) {
        console.error('[fabs] error showing panel:', tool.id, e);
      }
    }

    // ── كشف البلاغات المستقبلية: السكربت في MAIN world → حدث DOM ──
    // بدونه تفتح اللوحة على «اضغط فحص» ولا يتم أي استعلام.
    if (tool.id === 'future-orders-fab') {
      const ping = () => { try { document.dispatchEvent(new CustomEvent('ea-future-orders-refresh')); } catch (_) {} };
      ping();
      setTimeout(ping, 700);
    }

    // ── معالج البلاغات: نفس القاعدة — السكربت لا يفتح لوحته بنفسه ──
    if (tool.id === 'rp-fab') {
      const ping = () => { try { document.dispatchEvent(new CustomEvent('ea-report-processor-open')); } catch (_) {} };
      ping();
      setTimeout(ping, 700);
    }

    // ── لوحة التحكم (shadow root) ──
    if (tool.id === 'elaraby-control-panel-mini') {
      try {
        const shadow = document.getElementById('elaraby-control-panel')?.shadowRoot;
        if (shadow) {
          const panel = shadow.querySelector('.cp-panel');
          const tgl = shadow.getElementById('cp-toggle');
          const isMin = !panel || panel.style.display === 'none' || tgl?.textContent === '+';
          if (isMin && tgl) tgl.click();
        }
      } catch (e) {}
    }

    // للأدوات الداخلية بملفات: relayout للفابز الصفحية إن وجدت
    if (tool.files) {
      relayout();
    }

    updatePaletteIcons();
    updateFabActiveState();
    closePalette();
  }

  // تشغيل سكربت Tampermonkey عند غياب الفاب (من خلال الـ runner في نفس الصفحة)
  function launchMissingScript(tool) {
    const scriptId = TOOL_TO_SCRIPT[tool.id];
    if (!scriptId) return Promise.resolve();
    return setToolScriptViaRunner(tool, true);
  }

  // ── الشبكة الرئيسية (مجمعة حسب المجموعة) ──
  function renderPaletteMain() {
    const body = document.getElementById(CONTROLLER_ID + '-body');
    if (!body) return;
    body.innerHTML = '';

    const grouped = {};
    TOOLS.forEach(t => { (grouped[t.group] = grouped[t.group] || []).push(t); });

    GROUP_ORDER.forEach(g => {
      const tools = grouped[g];
      if (!tools || !tools.length) return;
      const label = document.createElement('div');
      Object.assign(label.style, {
        margin: '6px 2px 4px', fontSize: '9px', color: '#7d97b8',
        fontWeight: '700', letterSpacing: '.5px'
      });
      label.textContent = (GROUP_ICON[g] || '') + ' ' + g;
      body.appendChild(label);

      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
      tools.forEach(t => row.appendChild(buildToolIcon(t)));
      body.appendChild(row);
    });

    const status = document.createElement('div');
    Object.assign(status.style, {
      marginTop: '8px', padding: '5px 8px', border: '1px dashed #1e3450',
      borderRadius: '8px', fontSize: '9px', color: '#7d97b8', textAlign: 'center'
    });
    const shown = TOOLS.filter(t => visibility[t.id] === true).length;
    status.textContent = masterHidden
      ? `الظاهرة: ${shown} من ${TOOLS.length} (الكل مخفي بالاختصار)`
      : `الظاهرة: ${shown} من ${TOOLS.length}`;
    body.appendChild(status);
  }

  // ── عرض الإعدادات ──
  function renderSettings() {
    const body = document.getElementById(CONTROLLER_ID + '-body');
    if (!body) return;
    body.innerHTML = '';

    const btn = (text, color, border, onClick) => {
      const b = document.createElement('button');
      Object.assign(b.style, {
        width: '100%', padding: '8px', margin: '3px 0', border: '1px solid ' + border,
        borderRadius: '8px', background: color, color: '#e2eaf5',
        cursor: 'pointer', fontSize: '11px', fontWeight: '600'
      });
      b.textContent = text;
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      body.appendChild(b);
      return b;
    };

    btn('👁️ إظهار كل الأدوات', '#14532d', '#166534', () => setAll(true));
    btn('🙈 إخفاء كل الأدوات', '#7f1d1d', '#991b1b', () => setAll(false));
    const arrangeBtn = btn('📌 تثبيت المواضع الحالية', '#132b4e', '#1e3450', () => { pinFabs(); });
    arrangeBtn.id = CONTROLLER_ID + '-arrange-btn';
    if (pinnedPositions && Object.keys(pinnedPositions).length) {
      btn('↩️ إرجاع للمكان المثبت', '#2b1a3e', '#5b3a8c', () => { restorePinned(); });
    }
    btn('🔄 ريست للوضع الافتراضي (حسب الجروب)', '#3b2f0a', '#6b4f0a', () => { resetFabs(); });

    const hint = document.createElement('div');
    Object.assign(hint.style, {
      marginTop: '8px', fontSize: '9px', color: '#7d97b8', lineHeight: '1.6'
    });
    hint.innerHTML = '💡 اختصار <kbd style="background:#132b4e;padding:0 4px;border-radius:3px;border:1px solid #1e3450">Alt+Shift+E</kbd> يظهر/يخفي الفابز المفعّلة هنا.<br>💡 اضغط مطولاً على أي أيقونة في اللوحة لإظهار/إخفائها.<br>💡 اسحب أي فاب على الصفحة لتحريكه — ثم ثبّت المواضع لتثبيتها.<br>💡 الحالة محفوظة — لا تتغير مع تحديث الصفحة.';
    body.appendChild(hint);

    updateSettingsBtn();
  }

  function setAll(visible) {
    TOOLS.forEach(t => {
      visibility[t.id] = visible;
      applyToolVisibility(t, visible);
    });
    saveState();
    if (visible) {
      relayout();
    }
    if (settingsView) renderSettings(); else updatePaletteIcons();
  }

  // ── فتح/إغلاق اللوحة ──
  function togglePalette() {
    paletteOpen ? closePalette() : openPalette();
  }

  function openPalette() {
    const palette = document.getElementById(CONTROLLER_ID + '-palette');
    if (!palette) return;
    settingsView = false;
    document.getElementById(CONTROLLER_ID + '-title').textContent = 'أدوات العربي';
    renderPaletteMain();
    paletteOpen = true;
    palette.style.opacity = '1';
    palette.style.transform = 'scale(1)';
    palette.style.pointerEvents = 'auto';
    updateFabActiveState();
  }

  function closePalette() {
    const palette = document.getElementById(CONTROLLER_ID + '-palette');
    if (!palette) return;
    paletteOpen = false;
    palette.style.opacity = '0';
    palette.style.transform = 'scale(.9)';
    palette.style.pointerEvents = 'none';
    updateFabActiveState();
  }

  function toggleSettings() {
    const palette = document.getElementById(CONTROLLER_ID + '-palette');
    if (!paletteOpen || !palette) return;
    settingsView = !settingsView;
    document.getElementById(CONTROLLER_ID + '-title').textContent = settingsView ? 'الإعدادات' : 'أدوات العربي';
    if (settingsView) renderSettings(); else renderPaletteMain();
  }

  // ════════════════════════════════════════════════════════
  //  الرسائل من الخلفية + أحداث الكلمات المفتاحية
  // ════════════════════════════════════════════════════════
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'TOGGLE_TOOLS_DOCK') {
        // الاختصار من المتصفح: إظهار/إخفاء فابز السكربتات
        toggleFabs();
      }
    });
  } catch (e) {}

  // احتياط محلي لو لم يسجَّل الاختصار في المتصفح
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.code === 'KeyE' || e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      e.stopPropagation();
      toggleFabs();
    }
  }, true);

  // مزامنة ثنائية: تغيير حالة السكربت من أي مصدر (البوبأب/الـ runner/الفابز)
  // → نعيد تقييم ظهور الفاب + لون أيقونته فوراً
  function syncToolFromScript(scriptId) {
    const toolId = SCRIPT_TO_TOOL[scriptId];
    if (!toolId) return;
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return;
    const active = getScriptRunning(scriptId);
    if (active && visibility[tool.id] !== true) {
      // فُعّل من أي مصدر → نفعله هنا ونظهر فابته
      visibility[tool.id] = true;
      saveState();
      if (!masterHidden) {
        applyToolVisibility(tool, true);
      }
    } else if (!active) {
      applyToolVisibility(tool, false);
    }
    updatePaletteIcons();
  }

  try {
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('tm_running_')) {
        syncToolFromScript(e.key.replace('tm_running_', ''));
      }
    });
  } catch (e) {}

// رسائل من الـ runner في نفس الصفحة (تحديث حالة لحظي بلا انتظار حدث storage)
  try {
    window.addEventListener('ea-script-state', (e) => {
      const scriptId = e.detail && e.detail.scriptId;
      if (scriptId) syncToolFromScript(scriptId);
    });
  } catch (e) {}

  // ═════════════════════════════════════════════════════════
  //  التشغيل
  // ═════════════════════════════════════════════════════════
  (async function init() {
    await loadState();
    if (document.body) {
      buildDock();
    } else {
      window.addEventListener('DOMContentLoaded', buildDock);
    }
    // تطبيق الحالة فوراً ثم دورياً على أي فاب يظهر لاحقاً
    scanAndApply();
    // رص شامل: المثبت/المزاح ثم الافتراضي حسب الجروب
    relayout();

    // MutationObserver: رصد إنشاء الفابز الجديدة فوراً (بدل انتظار 1.5s)
    const fabObserver = new MutationObserver(() => {
      scanAndApply();
    });
    fabObserver.observe(document.body, { childList: true, subtree: true });

    // اختصار ESC: يقلص/يقفل الفاب المفتوح أو اللوحة المحومة
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 1) لو اللوحة (palette) مفتوحة → اقفلها
        const palette = document.getElementById(CONTROLLER_ID + '-palette');
        if (palette && palette.style.opacity === '1') {
          closePalette();
          return;
        }
        // 2) لو فاب محوم (hovered) → رجعه للحجم الصغير
        const hovered = document.querySelector('.ea-fab-page.hovered');
        if (hovered) {
          hovered.classList.remove('hovered');
          return;
        }
        // 3) لو لوحة التحكم مفتوحة → صغرها
        const cpPanel = document.getElementById('elaraby-control-panel');
        if (cpPanel) {
          const shadow = cpPanel.shadowRoot;
          const tgl = shadow?.getElementById('cp-toggle');
          const panel = shadow?.querySelector('.cp-panel');
          if (tgl && panel && panel.style.display !== 'none') {
            tgl.click();
            return;
          }
        }
        // 4) لو أي أداة داخلية مفتوحة ولها panel selector → صغرها
        TOOLS.forEach(t => {
          if (t.panel && visibility[t.id] === true) {
            const el = document.querySelector(t.panel);
            if (el) {
              const cs = getComputedStyle(el);
              if (cs.display !== 'none' && cs.visibility !== 'hidden') {
                visibility[t.id] = false;
                saveState();
                applyToolVisibility(t, false);
                updatePaletteIcons();
              }
            }
          }
        });
      }
    });

    // أمان: علم السحب لا يعلق لو فُقد pointerup
    try {
      document.addEventListener('pointerup', () => { eaDragging = false; }, true);
      document.addEventListener('pointercancel', () => { eaDragging = false; }, true);
    } catch (e) {}
    scanTimer = setInterval(scanAndApply, 1500);
  })();
})();
