(function() {
  if (window._smartLogInitialized) return;
  window._smartLogInitialized = true;

  const PAGE_ENTER_TIME = Date.now();
  const pageVisitId = Math.random().toString(36).substr(2, 9);

  const TRACKED_FIELDS = {
    'ldv_serialnumber':            { label: 'الرقم المسلسل 1', category: 'serial' },
    'ldv_technicalserialnumber':   { label: 'الرقم المسلسل الفني', category: 'serial' },
    'ldv_actualmodel_name':        { label: 'الموديل الفعلي 1', category: 'model' },
    'ldv_actualmodel2_name':       { label: 'الموديل الفعلي 2', category: 'model' },
    'ats_producttypebrand_name':   { label: 'العلامة التجارية', category: 'brand' },
    'ldv_warrantystatus':          { label: 'حالة الضمان', category: 'status' },
    'ldv_warrantydate_datepicker_description': { label: 'تاريخ الضمان', category: 'date' },
    'ldv_secondtechnicalserial':   { label: 'الرقم المسلسل 2', category: 'serial' },
    'ats_sparepartsstatus':        { label: 'حالة قطع الغيار', category: 'spareparts' },
    'ats_modeldefectmajor_name':   { label: 'كود العطل الرئيسي', category: 'fault' },
    'ats_defectcodedefectmajor_name': { label: 'كود العطل', category: 'fault' }
  };

  const WARNING_FIELD_MAP = [
    { pattern: /الرقم المسلسل\s*(?:رقم\s*1)?/i, fieldId: 'ldv_serialnumber', label: 'الرقم المسلسل 1' },
    { pattern: /الرقم المسلسل\s*رقم\s*2/i, fieldId: 'ldv_serialnumber1', label: 'الرقم المسلسل 2' },
    { pattern: /الموديل\s*الفعلي\s*1/i, fieldId: 'ldv_actualmodel', label: 'الموديل الفعلي 1' },
    { pattern: /الموديل\s*الفعلي\s*2|الموديل\s*الفعلى\s*2/i, fieldId: 'ldv_actualmodel2', label: 'الموديل الفعلي 2' },
    { pattern: /العلامة\s*التجارية|العلامة\s*التجاريه/i, fieldId: 'ats_producttypebrand', label: 'العلامة التجارية' },
    { pattern: /حالة\s*الضمان/i, fieldId: 'ldv_warrantystatus', label: 'حالة الضمان' },
    { pattern: /تاريخ\s*الضمان/i, fieldId: 'ldv_warrantydate', label: 'تاريخ الضمان' },
    { pattern: /رقم\s*مسلسل\s*2/i, fieldId: 'ldv_serialnumber1', label: 'الرقم المسلسل 2' },
    { pattern: /قطع\s*الغيار|spare\s*parts/i, fieldId: 'ats_sparepartsstatus', label: 'حالة قطع الغيار' },
    { pattern: /كود\s*العطل\s*الرئيسي/i, fieldId: 'ats_modeldefectmajor_name', label: 'كود العطل الرئيسي' },
    { pattern: /كود\s*العطل/i, fieldId: 'ats_defectcodedefectmajor_name', label: 'كود العطل' },
  ];

  function correlateWarningToField(warningText) {
    for (const entry of WARNING_FIELD_MAP) {
      if (entry.pattern.test(warningText)) {
        return { fieldId: entry.fieldId, label: entry.label };
      }
    }
    return null;
  }

  function storeValidationPattern(errorText, source, correlated) {
    const el = document.getElementById('ldv_actualmodel_name');
    const model = el ? (el.value || '').trim() : '';
    const el2 = document.getElementById('ldv_actualmodel2_name');
    const model2 = el2 ? (el2.value || '').trim() : '';
    const serialEl = document.getElementById('ldv_serialnumber');
    const serial = serialEl ? (serialEl.value || '').trim() : '';
    const serialEl2 = document.getElementById('ldv_serialnumber1') || document.getElementById('ldv_secondtechnicalserial');
    const serial2 = serialEl2 ? (serialEl2.value || '').trim() : '';
    const productTypeEl = document.getElementById('ats_producttype_name');
    const productType = productTypeEl ? (productTypeEl.value || '').trim() : '';
    const brandEl = document.getElementById('ats_producttypebrand_name');
    const brand = brandEl ? (brandEl.value || '').trim() : '';
    const warrantyEl = document.getElementById('ldv_warrantystatus');
    const warrantyStatus = warrantyEl ? (warrantyEl.value || warrantyEl.textContent || '').trim() : '';
    const dateEl = document.getElementById('ldv_warrantydate_datepicker_description');
    const warrantyDate = dateEl ? (dateEl.value || '').trim() : '';
    const orderId = location.href.match(/id=([^&]+)/)?.[1] || '';

    chrome.runtime.sendMessage({
      type: 'STORE_VALIDATION_PATTERN',
      pattern: {
        errorText, source,
        correlatedField: correlated?.fieldId || null,
        correlatedLabel: correlated?.label || null,
        model, model2, serial, serial2, productType, brand, warrantyStatus, warrantyDate, orderId,
        isAutomated: isAutomated(),
        timestamp: Date.now()
      }
    }).catch(() => {});
  }

  const fieldHistory = {};
  const fieldChangeCounts = {};
  const networkRequests = [];
  const recentFieldChanges = [];

  function getPageType() {
    const url = location.href.toLowerCase();
    if (url.includes('workorderreview') || url.includes('followup')) return 'WORK_ORDER_REVIEW';
    if (url.includes('/orders')) return 'ORDERS';
    if (url.includes('technicalreviewdetails') || url.includes('Reportdetail')) return 'TECHNICAL_REVIEW';
    return 'OTHER';
  }

  function isAutomated() {
    return document.body && document.body.dataset.isAutofilling === 'true';
  }

  function sendSmartLogEvent(eventType, details) {
    const payload = {
      type: 'SMART_LOG_EVENT',
      event: {
        pageVisitId, url: location.href, pageType: getPageType(),
        timestamp: Date.now(), eventType, isAutomated: isAutomated(),
        ...details
      }
    };
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  function getDiff(oldVal, newVal) {
    if (!oldVal || !newVal || oldVal === newVal) return '';
    let s = 0, min = Math.min(oldVal.length, newVal.length);
    while (s < min && oldVal[s] === newVal[s]) s++;
    let e = 0;
    while (e < min - s && oldVal[oldVal.length - 1 - e] === newVal[newVal.length - 1 - e]) e++;
    return oldVal.substring(s, oldVal.length - e) + ' → ' + newVal.substring(s, newVal.length - e);
  }

  function recordFieldChange(change) {
    if (!change.fieldId || !change.label) return;
    if (!fieldHistory[change.fieldId]) fieldHistory[change.fieldId] = [];
    fieldHistory[change.fieldId].push(change);
    fieldChangeCounts[change.fieldId] = (fieldChangeCounts[change.fieldId] || 0) + 1;
    recentFieldChanges.push(change);
    if (recentFieldChanges.length > 100) recentFieldChanges.shift();

    sendSmartLogEvent('FIELD_CHANGE', {
      field: change.fieldId, label: change.label, category: change.category,
      oldValue: change.oldValue, newValue: change.newValue,
      diff: getDiff(change.oldValue, change.newValue)
    });

    if (fieldChangeCounts[change.fieldId] >= 3) {
      sendSmartLogEvent('FIELD_CHANGE_PATTERN', {
        field: change.fieldId, label: change.label,
        changeCount: fieldChangeCounts[change.fieldId],
        message: `"${change.label}" اتغير ${fieldChangeCounts[change.fieldId]} مرات`
      });
    }
  }

  const inputStates = new WeakMap();

  function handleFocus(e) {
    const el = e.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      inputStates.set(el, el.value);
      el._smartLogOldValue = el.value;
    }
  }

  function handleBlur(e) {
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') return;
    const oldValue = inputStates.get(el);
    const newValue = el.value;
    if (oldValue === newValue || newValue === undefined) return;
    inputStates.delete(el);

    const fieldId = el.id || '';
    const tracked = TRACKED_FIELDS[fieldId];
    const ariaLabel = el.getAttribute('aria-label') || '';
    const trackedByLabel = Object.values(TRACKED_FIELDS).find(f => ariaLabel.includes(f.label));
    const fieldInfo = tracked || trackedByLabel;
    if (!fieldInfo) return;

    recordFieldChange({
      fieldId: fieldId || ariaLabel, label: fieldInfo.label, category: fieldInfo.category,
      oldValue: oldValue || '', newValue: newValue || '',
      timestamp: Date.now(), isAutomated: isAutomated()
    });
  }

  function handleChange(e) {
    const el = e.target;
    if (el.tagName !== 'SELECT') return;
    const oldValue = el._smartLogOldValue !== undefined ? el._smartLogOldValue : '';
    const newValue = el.value;
    el._smartLogOldValue = newValue;
    if (oldValue === newValue) return;
    const fieldId = el.id || '';
    const tracked = TRACKED_FIELDS[fieldId];
    if (!tracked) return;
    recordFieldChange({
      fieldId, label: tracked.label, category: tracked.category,
      oldValue: oldValue || '', newValue: newValue || '',
      timestamp: Date.now(), isAutomated: isAutomated(), source: 'change'
    });
  }

  function trackIframeEvents(iframe) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iDoc || iDoc._smartLogTracked) return;
      iDoc._smartLogTracked = true;
      iDoc.addEventListener('focus', handleFocus, true);
      iDoc.addEventListener('blur', handleBlur, true);
      iDoc.addEventListener('change', handleChange, true);
      const subObserver = new MutationObserver(() => {
        iDoc.querySelectorAll('iframe').forEach(trackIframeEvents);
      });
      if (iDoc.body) {
        subObserver.observe(iDoc.body, { childList: true, subtree: true });
      }
    } catch (e) {}
  }

  const iframeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.tagName === 'IFRAME') trackIframeEvents(node);
        if (node.nodeType === 1) node.querySelectorAll('iframe').forEach(trackIframeEvents);
      }
    }
  });

  const modalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.tagName === 'DIV' && node.querySelector('[role="dialog"], .modal, .lookup-modal') ? node : (node.querySelector?.('[role="dialog"], .modal, .lookup-modal'));
        if (!modal) continue;
        const check = modal.querySelector('button.primary, button[aria-label="Select"], button[aria-label="اختر"]');
        if (!check) continue;
        const config = { attributes: true, childList: true, subtree: true };
        const closeObserver = new MutationObserver(() => {
          if (!document.body.contains(modal) || modal.offsetParent === null) {
            closeObserver.disconnect();
            setTimeout(() => {
              if (isAutomated()) return;
              for (const [id, info] of Object.entries(TRACKED_FIELDS)) {
                const el = document.getElementById(id);
                if (el && el.dataset._slPrevValue !== undefined && el.dataset._slPrevValue !== el.value) {
                  recordFieldChange({
                    fieldId: id, label: info.label, category: info.category,
                    oldValue: el.dataset._slPrevValue || '', newValue: el.value || '',
                    timestamp: Date.now(), isAutomated: false, source: 'lookup'
                  });
                }
                if (el) el.dataset._slPrevValue = el.value;
              }
            }, 500);
          }
        });
        closeObserver.observe(modal.parentElement || document.body, config);
      }
    }
  });

  // ── 1. NETWORK MONITORING ──
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = args[1]?.method || 'GET';
    const start = Date.now();
    try {
      const resp = await origFetch.apply(this, args);
      const duration = Date.now() - start;
      const entry = { url: url.substring(0, 200), method, status: resp.status, duration, timestamp: Date.now() };
      networkRequests.push(entry);
      if (networkRequests.length > 1000) networkRequests.shift();
      if (resp.status >= 400) {
        sendSmartLogEvent('NETWORK_ERROR', { url: entry.url, method, status: resp.status, duration });
      }
      return resp;
    } catch (e) {
      const duration = Date.now() - start;
      networkRequests.push({ url: url.substring(0, 200), method, status: 0, duration, timestamp: Date.now(), error: e.message });
      sendSmartLogEvent('NETWORK_ERROR', { url: url.substring(0, 200), method, status: 0, duration, error: e.message });
      throw e;
    }
  };

  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._smartLogMethod = method;
    this._smartLogUrl = url;
    this._smartLogStart = Date.now();
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      const duration = Date.now() - (this._smartLogStart || Date.now());
      const entry = {
        url: (this._smartLogUrl || '').substring(0, 200),
        method: this._smartLogMethod || 'GET',
        status: this.status, duration, timestamp: Date.now()
      };
      networkRequests.push(entry);
      if (networkRequests.length > 1000) networkRequests.shift();
      if (this.status >= 400) {
        sendSmartLogEvent('NETWORK_ERROR', { url: entry.url, method: entry.method, status: this.status, duration });
      }
    });
    return origXHRSend.apply(this, arguments);
  };

  // ── 2. FIELD CHANGE TRACKING ──
  document.addEventListener('focus', handleFocus, true);
  document.addEventListener('blur', handleBlur, true);
  document.addEventListener('change', handleChange, true);

  // ── 3. IFRAME TRACKING ──
  if (document.body) {
    iframeObserver.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('iframe').forEach(trackIframeEvents);
  }

  // ── 4. LOOKUP MODAL TRACKING ──
  if (document.body) {
    modalObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── 5. ERROR TRACKING ──
  const errorObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        const serverWarnEl = node.id === 'MessagePanel' ? node : node.querySelector?.('#MessagePanel');
        if (serverWarnEl) {
          const warnText = (serverWarnEl.innerText || '').trim();
          if (warnText) {
            const correlated = correlateWarningToField(warnText);
            const recentChanges = recentFieldChanges.filter(c => Date.now() - c.timestamp < 10000);
            const relatedFields = recentChanges.map(c => `${c.label}: "${c.oldValue}" → "${c.newValue}"`);
            sendSmartLogEvent('VALIDATION_WARNING', {
              source: 'server', errorText: warnText,
              correlatedField: correlated ? correlated.fieldId : null,
              correlatedLabel: correlated ? correlated.label : null,
              recentFieldChanges: relatedFields.length > 0 ? relatedFields : undefined,
              message: correlated ? `تحذير عن "${correlated.label}" — ${warnText}` : warnText
            });
            storeValidationPattern(warnText, 'server', correlated);
          }
          return;
        }

        const clientErrEl = node.id === 'ValidationSummaryEntityFormView' ? node : node.querySelector?.('#ValidationSummaryEntityFormView');
        if (clientErrEl) {
          const errText = (clientErrEl.innerText || '').trim();
          if (errText) {
            const recentChanges = recentFieldChanges.filter(c => Date.now() - c.timestamp < 10000);
            const relatedFields = recentChanges.map(c => `${c.label}: "${c.oldValue}" → "${c.newValue}"`);
            sendSmartLogEvent('CLIENT_VALIDATION_ERROR', {
              source: 'client', errorText: errText,
              recentFieldChanges: relatedFields.length > 0 ? relatedFields : undefined,
              message: relatedFields.length > 0 ? `خطأ عميل بعد تعديل: ${relatedFields.join(', ')}` : errText
            });
          }
          return;
        }

        const errEl = node.classList?.contains('alert-danger') ? node : node.querySelector?.('.alert-danger');
        if (!errEl) return;
        const errText = (errEl.innerText || '').trim();
        if (!errText) return;
        const recentChanges = recentFieldChanges.filter(c => Date.now() - c.timestamp < 10000);
        const relatedFields = recentChanges.map(c => `${c.label}: "${c.oldValue}" → "${c.newValue}"`);
        sendSmartLogEvent('PAGE_ERROR', {
          errorText: errText,
          recentFieldChanges: relatedFields.length > 0 ? relatedFields : undefined,
          message: relatedFields.length > 0 ? `خطأ بعد تعديل: ${relatedFields.join(', ')}` : errText
        });
      });
    });
  });

  window.addEventListener('load', () => {
    errorObserver.observe(document.body, { childList: true, subtree: true });

    document.querySelectorAll('#MessagePanel').forEach(el => {
      const warnText = (el.innerText || '').trim();
      if (warnText) {
        const correlated = correlateWarningToField(warnText);
        sendSmartLogEvent('VALIDATION_WARNING', { source: 'server', errorText: warnText, correlatedField: correlated?.fieldId || null, correlatedLabel: correlated?.label || null, message: correlated ? `تحذير عن "${correlated.label}" — ${warnText}` : warnText });
        storeValidationPattern(warnText, 'server', correlated);
      }
    });

    document.querySelectorAll('#ValidationSummaryEntityFormView').forEach(el => {
      const errText = (el.innerText || '').trim();
      if (errText) sendSmartLogEvent('CLIENT_VALIDATION_ERROR', { source: 'client', errorText: errText, message: errText });
    });

    document.querySelectorAll('.alert-danger:not(#MessagePanel)').forEach(el => {
      if (el.id === 'MessagePanel') return;
      const errText = (el.innerText || '').trim();
      if (errText) sendSmartLogEvent('PAGE_ERROR', { errorText: errText });
    });
  });

  // ── 6. PAGE ENTER / LEAVE ──
  sendSmartLogEvent('PAGE_ENTER', { referrer: document.referrer });
  window.addEventListener('beforeunload', () => {
    sendSmartLogEvent('PAGE_LEAVE', { timeSpentMs: Date.now() - PAGE_ENTER_TIME });
  });

  // ── 7. FEEDBACK DATA EXPORT ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GET_FEEDBACK_DATA') {
      const corrections = [];
      for (const changes of Object.values(fieldHistory)) {
        for (const c of changes) {
          if (c.oldValue && c.newValue && c.oldValue !== c.newValue && !c.isAutomated) {
            corrections.push({
              orderId: location.href.match(/id=([^&]+)/)?.[1] || 'unknown',
              field: c.label, category: c.category, oldValue: c.oldValue, newValue: c.newValue,
              timestamp: new Date(c.timestamp).toISOString(), url: location.href
            });
          }
        }
      }

      const patterns = [];
      for (const [fieldId, count] of Object.entries(fieldChangeCounts)) {
        if (count >= 3) {
          const field = TRACKED_FIELDS[fieldId];
          patterns.push({
            field: field?.label || fieldId, changeCount: count,
            history: (fieldHistory[fieldId] || []).map(c => ({ from: c.oldValue, to: c.newValue, time: new Date(c.timestamp).toISOString() }))
          });
        }
      }

      sendResponse({
        corrections, patterns,
        networkErrors: networkRequests.filter(r => r.status >= 400 || r.status === 0),
        totalChanges: Object.values(fieldChangeCounts).reduce((a, b) => a + b, 0),
        pageType: getPageType()
      });
    }
  });
})();
