// =========================================================
// tampermonkey-runner.js — Tampermonkey Script Manager
// Manages and injects userscripts into web pages
// =========================================================
'use strict';

(function () {

  const BUILTIN_SCRIPTS = {
'elaraby-phone-reveal': {
      name: 'كشف أرقام الهواتف',
      desc: 'يلغي إخفاء أرقام الهاتف في البورتال ويسحب بيانات البلاغات',
      source: 'Tempermonky/elaraby-phone-reveal.js',
      match: '*://elarabyportalpfs.powerappsportals.com/*',
      enabled: true,
      injectAt: 'document-end',
      builtin: true,
      manifestInjected: true,
    },
    'messenger-sender': {
      name: 'مساعد إرسال الماسنجر',
      desc: 'إرسال رسائل مجمّعة من CSV أو اللصق المباشر مع أزرار لايكات',
      source: 'Tempermonky/messenger-sender.js',
      match: '*://*.facebook.com/*, *://*.messenger.com/*',
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
    },
'report-processor': {
      name: 'معالج البلاغات',
      desc: 'يفتح البلاغات ويفحص البيانات ويقفل اللي مفيهوش داتا + اختيار يوم + بلاغات محددة',
      source: 'Tempermonky/report-processor.js',
      match: '*://elarabyportalpfs.powerappsportals.com/*',
      enabled: true,
      injectAt: 'document-end',
      builtin: true,
      manifestInjected: true,
    },
    // Suppress repeated portal error: ldv_workordertype is not defined
    // Runs in MAIN world at document-start to catch early initialization errors
    'portal-error-suppressor': {
      name: 'كتم أخطاء البورتال المتكررة',
      desc: 'يكتم خطأ ldv_workordertype is not defined المتكرر في الكونسول',
      source: 'shared/portal-error-suppressor.js',
      match: '*://elarabyportalpfs.powerappsportals.com/*',
      enabled: true,
      injectAt: 'document-start',
      builtin: true,
    },
    'booking-automation': {
      name: 'أتمتة حجز البلاغات',
      desc: 'حجز جماعي: تعبئة تاريخ الزيارة وحفظ كل بلاغ تباعاً من جدول الحالات',
      source: 'Tempermonky/booking-automation.js',
      match: '*://elarabyportalpfs.powerappsportals.com/*',
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
    },
  };

  // ── State ──
  let scriptsRegistry = { ...BUILTIN_SCRIPTS };
  let customScripts = [];

  // ── Storage (via shared/storage-proxy.js → background) ──
  async function loadRegistry() {
    try {
      const stored = await storageGet(['tampermonkeyScripts', 'tampermonkeyCustomScripts']);
      scriptsRegistry = { ...BUILTIN_SCRIPTS, ...(stored.tampermonkeyScripts || {}) };
      customScripts = stored.tampermonkeyCustomScripts || [];
    } catch (e) {
      scriptsRegistry = { ...BUILTIN_SCRIPTS };
      customScripts = [];
    }
  }

  async function saveRegistry() {
    try {
      await storageSet({
        tampermonkeyScripts: scriptsRegistry,
        tampermonkeyCustomScripts: customScripts,
      });
    } catch (e) { /* storage blocked */ }
  }

  // ── URL Matching ──
  function matchesUrl(url, pattern) {
    if (!pattern) return false;
    return pattern.split(',').some(p => {
      const trimmed = p.trim();
      if (trimmed.includes('*://*')) {
        const base = trimmed.replace('*://*', '');
        return url.includes(base);
      }
      if (trimmed.startsWith('*://')) {
        const domain = trimmed.replace('*://', '').replace('/*', '');
        return url.includes(domain);
      }
      if (trimmed.startsWith('http')) {
        return url.startsWith(trimmed.replace('/*', ''));
      }
      return false;
    });
  }

  // ── CSP-compliant script injection via Background (content scripts can't call chrome.scripting) ──
  async function injectScriptFile(source, injectAt = 'document-end') {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'INJECT_SCRIPT_FILE',
          source,
          world: 'MAIN',
          allFrames: false
        }, (response) => {
          resolve(response?.ok === true);
        });
      });
    } catch (e) {
      console.error('[TampermonkeyRunner] File injection failed:', source, e);
      return false;
    }
  }

  async function injectScriptCode(code, injectAt = 'document-end') {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'INJECT_SCRIPT_CODE',
          code,
          world: 'MAIN',
          allFrames: false
        }, (response) => {
          resolve(response?.ok === true);
        });
      });
    } catch (e) {
      console.error('[TampermonkeyRunner] Code injection failed:', e);
      return false;
    }
  }

  // ── Fetch Script Code (kept for potential future use) ──
  async function fetchScriptCode(source) {
    try {
      const url = chrome.runtime.getURL(source);
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      console.warn(`[TampermonkeyRunner] Failed to fetch ${source}:`, e.message);
      return null;
    }
  }

  // ── Run Scripts for Current Page (CSP-compliant) ──
  async function runAll() {
    const currentUrl = window.location.href;
    const tabId = (await chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' })).tabId;

    // Only run scripts that are explicitly enabled
    for (const [id, script] of Object.entries(scriptsRegistry)) {
      if (!script.enabled) continue;
      if (script.manifestInjected) continue;
      if (!matchesUrl(currentUrl, script.match)) continue;

      if (script.builtin && script.source) {
        // Built-in scripts: inject via file (CSP-compliant)
        script.manifestInjected = await injectScriptFile(script.source, script.injectAt);
      } else if (script.code) {
        // Custom scripts: inject via code (may still hit CSP on FB/Messenger)
        await injectScriptCode(script.code, script.injectAt);
      }
    }

    // Also inject any active custom scripts
    for (const cs of customScripts) {
      if (!cs.enabled) continue;
      if (!matchesUrl(currentUrl, cs.match)) continue;
      if (cs.code) {
        await injectScriptCode(cs.code, cs.injectAt || 'document-end');
      }
    }
  }

  // ── بث تغيير الحالة للفابز في نفس الصفحة (حدث storage لا يعمل داخل نفس التبويب) ──
  function broadcastState(scriptId) {
    try {
      window.dispatchEvent(new CustomEvent('ea-script-state', { detail: { scriptId } }));
    } catch (e) {}
  }

  // ── Message Handler ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    if (msg.action === 'GET_SCRIPTS') {
      const scripts = [];
      for (const [id, s] of Object.entries(scriptsRegistry)) {
        scripts.push({ id, ...s });
      }
      customScripts.forEach((cs, i) => {
        scripts.push({ id: 'custom-' + i, ...cs, custom: true });
      });
      sendResponse({ scripts });
      return;
    }

    if (msg.action === 'TOGGLE_SCRIPT') {
      const id = msg.scriptId;
      if (scriptsRegistry[id]) {
        scriptsRegistry[id].enabled = !scriptsRegistry[id].enabled;
        saveRegistry();
        // Sync localStorage flag for elaraby-phone-reveal layer0
        if (id === 'elaraby-phone-reveal') {
          try { localStorage.setItem('elaraby_phone_reveal_disabled', scriptsRegistry[id].enabled ? '' : '1'); } catch(e) {}
        }
        try { localStorage.setItem('tm_running_' + id, scriptsRegistry[id].enabled ? '1' : '0'); } catch(e) {}
        broadcastState(id);
        sendResponse({ ok: true, enabled: scriptsRegistry[id].enabled });
      } else if (id.startsWith('custom-')) {
        const idx = parseInt(id.replace('custom-', ''));
        if (customScripts[idx]) {
          customScripts[idx].enabled = !customScripts[idx].enabled;
          saveRegistry();
          try { localStorage.setItem('tm_running_' + id, customScripts[idx].enabled ? '1' : '0'); } catch(e) {}
          broadcastState(id);
          sendResponse({ ok: true, enabled: customScripts[idx].enabled });
        }
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
      return;
    }

    if (msg.action === 'OPEN_SCRIPT_PANEL') {
      const script = scriptsRegistry[msg.scriptId];
      if (!script) { sendResponse({ ok: false, error: 'Script not found' }); return; }
      // دالة فتح اللوحة لكل سكربت (تعريفها داخل السكربت نفسه في MAIN world)
      const OPENERS = {
        'booking-automation': 'window.__elarabyBookingOpen',
        'report-processor': 'window.__elarabyReportProcessorOpen',
      };
      const openFn = OPENERS[msg.scriptId];
      if (!openFn) { sendResponse({ ok: false, error: 'No opener registered' }); return; }
      try { localStorage.setItem('tm_running_' + msg.scriptId, '1'); } catch(e) {}
      const doOpen = async () => {
        try {
          if (!script.manifestInjected) {
            script.manifestInjected = await injectScriptFile(script.source, script.injectAt);
            console.log('[TM-Runner] OPEN_SCRIPT_PANEL: injected', msg.scriptId, script.manifestInjected);
          }
          // مهلة قصيرة لضمان تعريف دالة الفتح في MAIN world بعد الحقن
          await new Promise(r => setTimeout(r, 150));
          await injectScriptCode(
            'try { (' + openFn + ' ? ' + openFn + '() : console.warn("[TM-Runner] opener missing for ' + msg.scriptId + '")); } catch(e) { console.error(e); }',
            'document-end'
          );
          console.log('[TM-Runner] OPEN_SCRIPT_PANEL ok:', msg.scriptId);
          broadcastState(msg.scriptId);
          sendResponse({ ok: true });
        } catch (e) {
          console.error('[TM-Runner] OPEN_SCRIPT_PANEL failed:', msg.scriptId, e);
          sendResponse({ ok: false, error: String(e) });
        }
      };
      doOpen();
      return;
    }

    if (msg.action === 'RUN_SCRIPT_NOW') {
      const id = msg.scriptId;
      let script = scriptsRegistry[id];
      if (!script && id.startsWith('custom-')) {
        script = customScripts[parseInt(id.replace('custom-', ''))];
      }
      if (script) {
        // إشارة التشغيل: تظهر فوراً في الفابز (dock) والبوبأب عبر localStorage
        try { localStorage.setItem('tm_running_' + id, '1'); } catch(e) {}
        broadcastState(id);
        if (script.manifestInjected) {
          // السكربت محقون تلقائياً — أزل flag الإيقاف الدائم وأعد التفعيل
          try { localStorage.setItem('elaraby_phone_reveal_disabled', ''); } catch(e) {}
          sendResponse({ ok: true, alreadyInjected: true });
          return;
        }
        const doInject = async () => {
          if (script.builtin && script.source) {
            script.manifestInjected = await injectScriptFile(script.source, script.injectAt);
          } else if (script.code) {
            await injectScriptCode(script.code, script.injectAt || 'document-end');
          } else {
            sendResponse({ ok: false, error: 'No code available' });
            return;
          }
          sendResponse({ ok: true });
        };
        doInject();
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
      return;
    }

    if (msg.action === 'STOP_SCRIPT_NOW') {
      const id = msg.scriptId;
      let script = scriptsRegistry[id];
      if (!script && id.startsWith('custom-')) {
        script = customScripts[parseInt(id.replace('custom-', ''))];
      }
      // إشارة الإيقاف الدائم — تظهر فوراً في الفابز والبوبأب
      try { localStorage.setItem('tm_running_' + id, '0'); } catch(e) {}
      broadcastState(id);
      if (id === 'elaraby-phone-reveal') {
        try { localStorage.setItem('elaraby_phone_reveal_disabled', '1'); } catch(e) {}
      }
      if (script) {
        script.enabled = false;
        saveRegistry();
        // استدعاء بروتوكول الإيقاف الفعلي في الصفحة (MAIN world)
        injectScriptCode(
          `(function(){ try { localStorage.setItem('tm_running_${id}','0'); } catch(e) {} ` +
          `var f = window['__TM_STOP_${id}']; if (typeof f === 'function') { try { f(); } catch(e) {} } ` +
          `else if ('${id}' === 'elaraby-phone-reveal' && typeof window.__ERP_STOP === 'function') { try { window.__ERP_STOP(); } catch(e) {} } })();`,
          'document-idle'
        ).then(() => sendResponse({ ok: true }));
      } else {
        // سكربت غير مسجل: فقط اضبط الإشارة (يكفي لسكربتات layer0/manifest)
        sendResponse({ ok: true });
      }
      return;
    }

    if (msg.action === 'GET_SCRIPT_STATE') {
      // الحالة الحية لكل السكربتات (enabled + running من localStorage)
      const state = {};
      const getFlag = (id) => {
        try { return localStorage.getItem('tm_running_' + id); } catch(e) { return null; }
      };
      for (const [id, s] of Object.entries(scriptsRegistry)) {
        state[id] = {
          enabled: s.enabled,
          manifestInjected: s.manifestInjected,
          running: getFlag(id) === '1'
        };
      }
      customScripts.forEach((cs, i) => {
        const id = 'custom-' + i;
        state[id] = { enabled: cs.enabled, running: getFlag(id) === '1', custom: true };
      });
      sendResponse({ state });
      return;
    }

    if (msg.action === 'UPLOAD_CUSTOM_SCRIPT') {
      const scriptData = {
        name: msg.name || 'Custom Script',
        desc: msg.desc || '',
        code: msg.code,
        match: msg.match || window.location.href,
        injectAt: msg.injectAt || 'document-end',
        enabled: true,
        custom: true,
      };
      customScripts.push(scriptData);
      saveRegistry();
      sendResponse({ ok: true });
      return;
    }

    if (msg.action === 'DELETE_CUSTOM_SCRIPT') {
      const idx = parseInt(msg.scriptId?.replace('custom-', ''));
      if (!isNaN(idx) && customScripts[idx]) {
        customScripts.splice(idx, 1);
        saveRegistry();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
      return;
    }

    if (msg.action === 'LIST_CUSTOM_SCRIPTS') {
      sendResponse({ scripts: customScripts });
      return;
    }
  });

  // ── Init ──
  loadRegistry().then(() => {
    // Sync localStorage flags with script states
    try {
      const elarabyReveal = scriptsRegistry['elaraby-phone-reveal'];
      if (elarabyReveal) {
        localStorage.setItem('elaraby_phone_reveal_disabled', elarabyReveal.enabled ? '' : '1');
      }
    } catch(e) {}

    // Only run if there are actually enabled scripts
    const hasEnabled = Object.values(scriptsRegistry).some(s => s.enabled) ||
                       customScripts.some(s => s.enabled);
    if (hasEnabled) runAll();
  });

})();
