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
      injectViaFiles: true,
      world: 'MAIN',
    },
    'messenger-sender': {
      name: 'مساعد إرسال الماسنجر',
      desc: 'إرسال رسائل مجمّعة من CSV أو اللصق المباشر مع أزرار لايكات',
      source: 'Tempermonky/messenger-sender.js',
      match: '*://*.facebook.com/*, *://*.messenger.com/*, *://*.instagram.com/*, *://*.whatsapp.com/*',
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
      injectViaFiles: true,
      world: 'MAIN',
    },
    'report-processor': {
      name: 'معالج البلاغات',
      desc: 'يفتح البلاغات ويفحص البيانات ويقفل اللي مفيهوش داتا + اختيار يوم + بلاغات محددة',
      source: 'Tempermonky/report-processor.js',
      // صفحة أوامر الشغل فقط — لا يعمل في أي صفحة أخرى بالبورتال
      match: '*://elarabyportalpfs.powerappsportals.com/en-US/Orders/*, *://elarabyportalpfs.powerappsportals.com/Orders/*',
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
      injectViaFiles: true,
      world: 'MAIN',
    },
    'future-orders-reveal': {
      name: 'كشف البلاغات المستقبلية',
      desc: 'يكشف ويدمج البلاغات المحجوزة بعد أكثر من 3 أيام من الـ API مباشرة مع أيقونة تمييز',
      source: 'Tempermonky/future-orders-reveal.js',
      match: '*://elarabyportalpfs.powerappsportals.com/*',
      enabled: false,
      injectAt: 'document-end',
      builtin: true,
      injectViaFiles: true,
      world: 'MAIN',
    },
  };

  // State
  let scriptsRegistry = { ...BUILTIN_SCRIPTS };
  let customScripts = [];
  const inFlight = {}; // scriptId → true أثناء تنفيذ أمر تشغيل (منع الحقن المزدوج)

  // Helpers
  function emitScriptState(scriptId, running, metadata = {}) {
    try {
      window.dispatchEvent(new CustomEvent('ea-script-state', {
        detail: { scriptId, running, timestamp: Date.now(), ...metadata }
      }));
    } catch (e) {}
  }

  async function updateRunningState(scriptId, running, metadata = {}) {
    try {
      const stored = await chrome.storage.local.get({ tmRunning: {} });
      const tmRunning = stored.tmRunning || {};

      if (running) {
        tmRunning[scriptId] = {
          running: true,
          injectedAt: Date.now(),
          ...metadata
        };
      } else {
        delete tmRunning[scriptId];
      }

      await chrome.storage.local.set({ tmRunning });
    } catch (e) {}
  }

  function getLocalRunning(scriptId) {
    try { return localStorage.getItem('tm_running_' + scriptId) === '1'; } catch(e) { return false; }
  }

  function setLocalRunning(scriptId, running) {
    try { localStorage.setItem('tm_running_' + scriptId, running ? '1' : '0'); } catch(e) {}
  }

  // Storage
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

  // URL Matching
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

  // Script Injection
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

  // حقن ملف سكربت عبر الخلفية (chrome.scripting) — يتجاوز CSP الخاص بالصفحة
  // (الحقن النصي <script> يُرفض على البورتال/فيسبوك بسبب script-src)
  function injectViaFile(script) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          action: 'INJECT_SCRIPT_FILE',
          source: script.source,
          world: script.world || 'MAIN',
          injectAt: script.injectAt || 'document-end'
        }, (res) => resolve(!!(res && res.ok)));
      } catch (e) {
        console.warn('[Runner] injectViaFile failed:', e.message);
        resolve(false);
      }
    });
  }

  // Fetch Script Code
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

  // Stop Injected Script
  function stopInjectedScript(scriptId) {
    // Signal the injected script to stop via localStorage flag
    // Injected scripts (Phone Reveal, Report Processor, Messenger)
    // should monitor tm_running_<id> and self-stop when it becomes '0'
    setLocalRunning(scriptId, false);

    // Also dispatch event for immediate UI sync
    emitScriptState(scriptId, false);

    // For phone reveal, also set the layer0 disable flag
    if (scriptId === 'elaraby-phone-reveal') {
      try { localStorage.setItem('elaraby_phone_reveal_disabled', '1'); } catch(e) {}
    }

    // Note: Actual script removal from DOM is not possible after injection.
    // Injected scripts must self-monitor tm_running_<id> flag and cleanup.
  }

  // Run Scripts for Current Page
  async function runAll() {
    const currentUrl = window.location.href;

    // Only run scripts that are explicitly enabled
    for (const [id, script] of Object.entries(scriptsRegistry)) {
      if (!script.enabled) continue;
      if (!matchesUrl(currentUrl, script.match)) continue;

      let code = null;

      if (script.builtin && script.source) {
        if (script.injectViaFiles) {
          const ok = await injectViaFile(script);
          if (!ok) console.warn('[Runner] auto-run file injection failed:', id);
          continue;
        }
        code = await fetchScriptCode(script.source);
      } else if (script.code) {
        code = script.code;
      }

      if (code) {
        injectScript(code, script.injectAt);
      }
    }

    for (const cs of customScripts) {
      if (!cs.enabled) continue;
      if (!matchesUrl(currentUrl, cs.match)) continue;
      if (cs.code) {
        injectScript(cs.code, cs.injectAt || 'document-end');
      }
    }
  }

  // Message Handler
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    if (msg.action === 'GET_SCRIPTS') {
      const scripts = [];
      for (const [id, s] of Object.entries(scriptsRegistry)) {
        const running = getLocalRunning(id);
        scripts.push({ id, ...s, running });
      }
      customScripts.forEach((cs, i) => {
        const cid = 'custom-' + i;
        const running = getLocalRunning(cid);
        scripts.push({ id: cid, ...cs, custom: true, running });
      });
      sendResponse({ scripts });
      return;
    }

    if (msg.action === 'GET_RUNNING_STATE') {
      const state = {};
      for (const [id] of Object.entries(scriptsRegistry)) {
        state[id] = { running: getLocalRunning(id) };
      }
      customScripts.forEach((cs, i) => {
        const cid = 'custom-' + i;
        state[cid] = { running: getLocalRunning(cid) };
      });
      sendResponse({ state });
      return;
    }

    // تفعيل بدون حقن — يُستخدم عندما تُفتح الأداة في موقعها الصحيح من صفحة أخرى
    if (msg.action === 'ENABLE_SCRIPT') {
      const id = msg.scriptId;
      if (scriptsRegistry[id]) {
        scriptsRegistry[id].enabled = true;
        saveRegistry();
        setLocalRunning(id, true);
        updateRunningState(id, true);
        emitScriptState(id, true);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'Script not found: ' + id });
      }
      return;
    }

    if (msg.action === 'TOGGLE_SCRIPT') {
      const id = msg.scriptId;
      if (scriptsRegistry[id]) {
        const newEnabled = !scriptsRegistry[id].enabled;
        scriptsRegistry[id].enabled = newEnabled;
        saveRegistry();

        // Sync localStorage flags
        setLocalRunning(id, newEnabled);
        if (id === 'elaraby-phone-reveal') {
          try { localStorage.setItem('elaraby_phone_reveal_disabled', newEnabled ? '' : '1'); } catch(e) {}

          // If enabling phone reveal, schedule reload for Layer 0 (with 5s cooldown)
          if (newEnabled) {
            try {
              const lastToggle = sessionStorage.getItem('erp_phone_reveal_last_toggle');
              const now = Date.now();
              if (!lastToggle || (now - parseInt(lastToggle)) > 5000) {
                sessionStorage.setItem('erp_phone_reveal_last_toggle', now.toString());
                setTimeout(() => {
                  console.log('[Runner] Phone reveal toggled ON - reloading for Layer 0');
                  window.location.reload();
                }, 500);
              }
            } catch (e) {}
          }
        }

        // Dispatch event for dock/controller sync
        emitScriptState(id, newEnabled);
        sendResponse({ ok: true, enabled: newEnabled });
      } else if (id.startsWith('custom-')) {
        const idx = parseInt(id.replace('custom-', ''));
        if (customScripts[idx]) {
          customScripts[idx].enabled = !customScripts[idx].enabled;
          saveRegistry();
          emitScriptState(id, customScripts[idx].enabled);
          sendResponse({ ok: true, enabled: customScripts[idx].enabled });
        }
      } else {
        sendResponse({ ok: false, error: 'Script not found' });
      }
      return;
    }

    if (msg.action === 'RUN_SCRIPT_NOW') {
      const id = msg.scriptId;
      // In-flight guard: same command may arrive twice (direct + background relay)
      // or from an openTool retry — never inject twice concurrently.
      if (inFlight[id]) {
        sendResponse({ ok: true, deduped: true });
        return;
      }
      inFlight[id] = true;
      const finishRun = (resp) => {
        delete inFlight[id];
        if (resp && resp.ok) console.log('[Runner] RUN ok:', id, resp.deduped ? '(deduped)' : '');
        else console.warn('[Runner] RUN failed:', id, resp);
        sendResponse(resp);
      };
      let script = scriptsRegistry[id];
      if (!script && id.startsWith('custom-')) {
        script = customScripts[parseInt(id.replace('custom-', ''))];
      }
      if (script) {
        // Enable the script in registry if not already
        if (!script.enabled) {
          script.enabled = true;
          saveRegistry();
        }

        // Phone reveal: clear Layer 0 disable flag so next page load activates it
        if (id === 'elaraby-phone-reveal') {
          try { localStorage.setItem('elaraby_phone_reveal_disabled', ''); } catch (e) {}
        }

        // Scripts that need file-based injection (CSP bypass for portal/facebook/etc)
        if (script.injectViaFiles && script.source) {
          injectViaFile(script).then(ok => {
            if (ok) {
              setLocalRunning(id, true);
              updateRunningState(id, true);
              emitScriptState(id, true);
              finishRun({ ok: true });
            } else {
              finishRun({ ok: false, error: 'File injection failed (background/CSP)' });
            }
          });
          return true; // async response
        }

        // Special handling for phone reveal: needs reload to activate Layer 0
        const isPhoneReveal = id === 'elaraby-phone-reveal';
        const wasDisabled = isPhoneReveal && !script.enabled;

        let code = script.code;
        if (script.builtin && script.source) {
          // Wait for fetch and injection to complete before responding
          fetchScriptCode(script.source).then(fetchedCode => {
            if (fetchedCode) {
              injectScript(fetchedCode, script.injectAt);
            }
            // Update running state after injection
            setLocalRunning(id, true);
            updateRunningState(id, true);
            emitScriptState(id, true);

            // If phone reveal was just enabled, schedule a reload for Layer 0
            if (isPhoneReveal && wasDisabled) {
              try {
                const lastToggle = sessionStorage.getItem('erp_phone_reveal_last_toggle');
                const now = Date.now();
                if (!lastToggle || (now - parseInt(lastToggle)) > 5000) {
                  sessionStorage.setItem('erp_phone_reveal_last_toggle', now.toString());
                  setTimeout(() => {
                    console.log('[Runner] Phone reveal enabled - reloading for Layer 0 activation');
                    window.location.reload();
                  }, 500);
                }
              } catch (e) {}
            }
            finishRun({ ok: true });
          }).catch(err => {
            console.error('[Runner] Fetch/inject failed:', err);
            finishRun({ ok: false, error: err.message });
          });
          return true; // async response
        } else if (code) {
          injectScript(code, script.injectAt || 'document-end');
          setLocalRunning(id, true);
          updateRunningState(id, true);
          emitScriptState(id, true);
          finishRun({ ok: true });
        } else {
          finishRun({ ok: false, error: 'No code available' });
        }
      } else {
        finishRun({ ok: false, error: 'Script not found: ' + id });
      }
      return;
    }

    if (msg.action === 'STOP_SCRIPT_NOW') {
      const id = msg.scriptId;
      let script = scriptsRegistry[id];
      if (!script && id.startsWith('custom-')) {
        script = customScripts[parseInt(id.replace('custom-', ''))];
      }
      if (script) {
        // Disable in registry
        script.enabled = false;
        saveRegistry();

        // Stop the injected script
        stopInjectedScript(id);
        updateRunningState(id, false);

        sendResponse({ ok: true, enabled: false });
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

  // Init
  loadRegistry().then(() => {
    // Sync localStorage flags with script states
    try {
      const elarabyReveal = scriptsRegistry['elaraby-phone-reveal'];
      if (elarabyReveal) {
        setLocalRunning('elaraby-phone-reveal', elarabyReveal.enabled);
        try { localStorage.setItem('elaraby_phone_reveal_disabled', elarabyReveal.enabled ? '' : '1'); } catch(e) {}
        if (!elarabyReveal.enabled) {
          try { sessionStorage.removeItem('erp_phone_reveal_last_toggle'); } catch(e) {}
        }
      }
    } catch(e) {}

    // Only run if there are actually enabled scripts
    const hasEnabled = Object.values(scriptsRegistry).some(s => s.enabled) ||
                       customScripts.some(s => s.enabled);
    if (hasEnabled) runAll();
  });

})();