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
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
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
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
    },
  };

  // ── State ──
  let scriptsRegistry = { ...BUILTIN_SCRIPTS };
  let customScripts = [];

  // ── Storage ──
  async function loadRegistry() {
    try {
      const stored = await chrome.storage.local.get({
        tampermonkeyScripts: {},
        tampermonkeyCustomScripts: [],
      });
      scriptsRegistry = { ...BUILTIN_SCRIPTS, ...stored.tampermonkeyScripts };
      customScripts = stored.tampermonkeyCustomScripts || [];
    } catch (e) {
      scriptsRegistry = { ...BUILTIN_SCRIPTS };
      customScripts = [];
    }
  }

  async function saveRegistry() {
    try {
      await chrome.storage.local.set({
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

  // ── Script Injection ──
  function injectScript(code, injectAt = 'document-end') {
    try {
      const script = document.createElement('script');
      script.textContent = code;
      if (injectAt === 'document-start') {
        document.documentElement.prepend(script);
      } else {
        document.documentElement.appendChild(script);
      }
      script.remove();
      return true;
    } catch (e) {
      console.error('[TampermonkeyRunner] Injection failed:', e);
      return false;
    }
  }

  function injectCSS(css) {
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  // ── Fetch Script Code ──
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

  // ── Run Scripts for Current Page ──
  async function runAll() {
    const currentUrl = window.location.href;

    // Only run scripts that are explicitly enabled
    // Built-in scripts default to disabled — user must toggle them on
    for (const [id, script] of Object.entries(scriptsRegistry)) {
      if (!script.enabled) continue;
      if (!matchesUrl(currentUrl, script.match)) continue;

      let code = null;

      // Built-in scripts: fetch from extension resources
      if (script.builtin && script.source) {
        code = await fetchScriptCode(script.source);
      }
      // Custom scripts: code stored directly
      else if (script.code) {
        code = script.code;
      }

      if (code) {
        injectScript(code, script.injectAt);
      }
    }

    // Also inject any active custom scripts
    for (const cs of customScripts) {
      if (!cs.enabled) continue;
      if (!matchesUrl(currentUrl, cs.match)) continue;
      if (cs.code) {
        injectScript(cs.code, cs.injectAt || 'document-end');
      }
    }
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
        sendResponse({ ok: true, enabled: scriptsRegistry[id].enabled });
      } else if (id.startsWith('custom-')) {
        const idx = parseInt(id.replace('custom-', ''));
        if (customScripts[idx]) {
          customScripts[idx].enabled = !customScripts[idx].enabled;
          saveRegistry();
          sendResponse({ ok: true, enabled: customScripts[idx].enabled });
        }
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
      return;
    }

    if (msg.action === 'RUN_SCRIPT_NOW') {
      const id = msg.scriptId;
      let script = scriptsRegistry[id];
      if (!script && id.startsWith('custom-')) {
        script = customScripts[parseInt(id.replace('custom-', ''))];
      }
      if (script) {
        let code = script.code;
        if (script.builtin && script.source) {
          fetchScriptCode(script.source).then(code => {
            if (code) injectScript(code, script.injectAt);
          });
          sendResponse({ ok: true });
        } else if (code) {
          injectScript(code, script.injectAt || 'document-end');
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'No code available' });
        }
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
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
