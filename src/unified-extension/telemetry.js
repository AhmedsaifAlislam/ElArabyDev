// =========================================================
// telemetry.js — Portal Behavior Tracker
// Tracks user clicks, input changes, and errors on the portal
// =========================================================

(function() {
  if (window._telemetryInitialized) return;
  window._telemetryInitialized = true;

  const PAGE_ENTER_TIME = Date.now();
  let currentSessionId = null;

  // Generate a random ID for the current page visit
  const pageVisitId = Math.random().toString(36).substr(2, 9);

  // We keep track of input values on focus to detect changes
  const inputStates = new WeakMap();

  function getPageType() {
    const url = location.href.toLowerCase();
    if (url.includes('workorderreview') || url.includes('followup')) return 'WORK_ORDER_REVIEW';
    if (url.includes('/orders')) return 'ORDERS';
    return 'OTHER';
  }

  function isAutomated() {
    return document.body && document.body.dataset.isAutofilling === 'true';
  }

  function getElementPath(el) {
    if (!el) return '';
    let path = el.tagName.toLowerCase();
    if (el.id) path += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      path += '.' + el.className.trim().split(/\s+/).join('.');
    }
    const label = el.getAttribute('aria-label') || el.name;
    if (label) path += `[name/label="${label}"]`;
    return path;
  }

  function sendTelemetryEvent(eventType, details) {
    const payload = {
      type: 'TELEMETRY_EVENT',
      event: {
        pageVisitId,
        url: location.href,
        pageType: getPageType(),
        timestamp: Date.now(),
        eventType,
        isAutomated: isAutomated(),
        ...details
      }
    };
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  // 1. Track Page Enter
  sendTelemetryEvent('PAGE_ENTER', { referrer: document.referrer });

  // 2. Track Clicks
  document.addEventListener('click', (e) => {
    // Only track meaningful clicks (buttons, links, interactable elements)
    const target = e.target.closest('button, a, input[type="submit"], input[type="button"], [role="button"], [role="option"], .result-item, td');
    if (!target) return;

    // Ignore clicks inside our own extension overlay
    if (target.closest('#autofiller-overlay') || target.closest('#autofiller-controls')) return;

    const textContent = (target.innerText || target.value || target.getAttribute('aria-label') || '').trim().substring(0, 100);
    sendTelemetryEvent('CLICK', {
      element: getElementPath(target),
      text: textContent
    });
  }, true);

  // 3. Track Input Changes
  document.addEventListener('focus', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      inputStates.set(target, target.value);
    }
  }, true);

  document.addEventListener('blur', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      const oldValue = inputStates.get(target);
      const newValue = target.value;
      if (oldValue !== newValue) {
        sendTelemetryEvent('FIELD_CHANGE', {
          element: getElementPath(target),
          oldValue: oldValue,
          newValue: newValue
        });
      }
      inputStates.delete(target);
    }
  }, true);

  // 4. Track Errors (Mutation Observer for .alert-danger)
  const errorObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element
          if (node.classList?.contains('alert-danger') || node.classList?.contains('validation-summary-errors') || node.querySelector('.alert-danger')) {
            const errEl = node.classList?.contains('alert-danger') ? node : node.querySelector('.alert-danger');
            const errText = (errEl.innerText || '').trim();
            if (errText) {
              sendTelemetryEvent('PAGE_ERROR', { errorText: errText });
            }
          }
        }
      });
    });
  });

  // Also check if error exists on load
  window.addEventListener('load', () => {
    errorObserver.observe(document.body, { childList: true, subtree: true });
    
    const existingErrors = document.querySelectorAll('.alert-danger, .validation-summary-errors');
    existingErrors.forEach(errEl => {
      const errText = (errEl.innerText || '').trim();
      if (errText) {
        sendTelemetryEvent('PAGE_ERROR', { errorText: errText });
      }
    });
  });

  // 5. Track Page Leave
  window.addEventListener('beforeunload', () => {
    const timeSpentMs = Date.now() - PAGE_ENTER_TIME;
    sendTelemetryEvent('PAGE_LEAVE', { timeSpentMs });
  });

})();
