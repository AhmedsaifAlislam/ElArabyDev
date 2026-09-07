// =========================================================
// runtime-trace.js — Persistent Multi-Run Diagnostic Tracing
// Component: Runtime Tracing Subsystem
// =========================================================
'use strict';

(() => {
  const TRACE_KEY = 'multiRunRuntimeTrace';
  const MAX_TRACE_ENTRIES = 150;

  // Self-test ping on load
  chrome.runtime.sendMessage({
    type: 'TRACE_APPEND',
    entry: {
      timestamp: new Date().toISOString(),
      event: 'TRACE_SELF_TEST',
      source: 'popup'
    }
  }).catch(() => {});

  function traceEvent(event, details = {}) {
    const {
      tabId = null,
      taskId = null,
      orderId = null,
      url = (typeof location !== 'undefined' ? location.href : null),
      processingTabId = null,
      currentTaskPresent = false,
      queueLength = 0,
      details: innerDetails,
      ...rest
    } = details;

    const entry = {
      timestamp: new Date().toISOString(),
      event,
      tabId,
      taskId,
      orderId,
      url,
      processingTabId,
      currentTaskPresent,
      queueLength,
      details: innerDetails !== undefined ? innerDetails : (Object.keys(rest).length ? rest : null)
    };

    chrome.runtime.sendMessage({
      type: 'TRACE_APPEND',
      entry
    }).catch(() => {});
  }

  function clearMultiRunTrace() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TRACE_CLEAR' }, () => {
        resolve({ ok: true });
      });
    });
  }

  async function getMultiRunTrace() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TRACE_GET' }, (resp) => {
        resolve(resp?.trace || []);
      });
    });
  }

  function formatTraceForCopy(trace) {
    if (!trace || !trace.length) return 'EMPTY TRACE';

    return trace.map(e => {
      const ts = new Date(e.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      const parts = [`[${ts}] event=${e.event}`];
      if (e.tabId) parts.push(`tabId=${e.tabId}`);
      if (e.taskId) parts.push(`taskId=${e.taskId}`);
      if (e.orderId) parts.push(`orderId=${e.orderId}`);
      if (e.processingTabId) parts.push(`processingTabId=${e.processingTabId}`);
      if (e.queueLength !== undefined) parts.push(`queueLength=${e.queueLength}`);
      if (e.currentTaskPresent !== undefined) parts.push(`currentTask=${e.currentTaskPresent}`);
      if (e.details) {
        Object.entries(e.details).forEach(([k, v]) => parts.push(`${k}=${v}`));
      }
      return parts.join(' ');
    }).join('\n');
  }

  function notifyStatus(msg, type = 'info') {
    if (typeof window.setSearchStatus === 'function') {
      window.setSearchStatus(msg, type);
    } else {
      const el = document.getElementById('search-status-msg');
      if (el) {
        el.className = `status-msg ${type}`;
        el.textContent = msg;
      }
    }
  }

  function notifyStatusHtml(html, type = 'info') {
    if (typeof window.setSearchStatusHtml === 'function') {
      window.setSearchStatusHtml(html, type);
    } else {
      const el = document.getElementById('search-status-msg');
      if (el) {
        el.className = `status-msg ${type}`;
        el.innerHTML = html;
      }
    }
  }

  function copyTraceToClipboard() {
    getMultiRunTrace().then(trace => {
      const text = 'MULTI RUN RUNTIME TRACE\n\n' + formatTraceForCopy(trace);
      navigator.clipboard.writeText(text).then(() => {
        notifyStatus('✅ Runtime trace copied to clipboard', 'ok');
      }).catch(() => {
        notifyStatus('❌ Failed to copy trace', 'error');
      });
    });
  }

  function clearRuntimeTrace() {
    clearMultiRunTrace();
    notifyStatus('Runtime trace cleared', 'info');
  }

  function showTraceSystemStatus() {
    chrome.storage.local.get('multiRunRuntimeTrace', (data) => {
      const trace = data.multiRunRuntimeTrace || [];
      const contentScriptOk = trace.some(e => e.source === 'content-script');
      const backgroundOk = trace.some(e => e.source === 'background');
      const popupOk = trace.some(e => e.source === 'popup');

      const statusHtml = `
        <div style="font-family: monospace; font-size: 11px; line-height: 1.6;">
          <b>TRACE SYSTEM STATUS</b><br><br>
          popup trace writer: ${typeof traceEvent === 'function' ? '✅ PASS' : '❌ FAIL'}<br>
          background trace writer: ${backgroundOk ? '✅ PASS' : '❌ FAIL (no events)'}<br>
          content-script trace writer: ${contentScriptOk ? '✅ PASS' : '❌ FAIL (no events)'}<br>
          storage key: <code>${TRACE_KEY}</code><br>
          deployed build contains tracing: YES<br>
          trace entries: ${trace.length}<br>
          <br>
          <button id="btn-refresh-trace-status" class="btn btn-secondary btn-small" style="margin-top:8px;">تحديث الحالة</button>
        </div>
      `;
      notifyStatusHtml(statusHtml, 'info');

      document.getElementById('btn-refresh-trace-status')?.addEventListener('click', showTraceSystemStatus);
    });
  }

  function initRuntimeTrace() {
    // Search tab buttons
    document.getElementById('btn-copy-runtime-trace')?.addEventListener('click', copyTraceToClipboard);
    document.getElementById('btn-clear-runtime-trace')?.addEventListener('click', clearRuntimeTrace);
    document.getElementById('btn-trace-status')?.addEventListener('click', showTraceSystemStatus);

    // Settings tab duplicate buttons
    document.getElementById('btn-settings-copy-trace')?.addEventListener('click', copyTraceToClipboard);
    document.getElementById('btn-settings-clear-trace')?.addEventListener('click', clearRuntimeTrace);
    document.getElementById('btn-settings-trace-status')?.addEventListener('click', showTraceSystemStatus);
  }

  // Export to window
  window.traceEvent = traceEvent;
  window.RuntimeTrace = {
    traceEvent,
    clearMultiRunTrace,
    getMultiRunTrace,
    formatTraceForCopy,
    copyTraceToClipboard,
    clearRuntimeTrace,
    showTraceSystemStatus,
    init: initRuntimeTrace
  };
})();
