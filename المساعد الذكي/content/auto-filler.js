// content/auto-filler.js — Portal Form Auto-Fill
// Merged from: Smart_Autofill.user.js (findInputForField + autoFillForm) + injector.js (fireEvents + cascade injection)

(function() {
  'use strict';

  // ── Field Definitions (keyword-based detection) ──
  const FIELD_DEFINITIONS = {
    productType: ['نوع المنتج', 'product type', 'producttype', 'نوعالمنتج'],
    brand: ['علامة تجارية', 'علامه تجاريه', 'brand', 'العلامة التجارية', 'العلامه التجاريه'],
    model: ['الموديل', 'الموديل *', 'model', 'موديل'],
    defect: ['أكواد الأعطال', 'اكواد الاعطال', 'كود العطل', 'defect', 'العطل'],
    sparePart: ['قطع غيار', 'قطعه غيار', 'قطع الغيار', 'كود القطعة', 'كود قطعه الغيار', 'spare part', 'sparepart'],
    quantity: ['الكمية', 'الكميه', 'quantity', 'العدد']
  };

  // ── Portal-specific field IDs (from injector.js) ──
  const PORTAL_FIELD_IDS = {
    defectMajor: 'ats_modeldefectmajor',
    defectCode: 'ats_defectcodedefectmajor',
    sparePart: 'ats_modeldefectspid'
  };

  // ── Event Trigger helper (React/Angular compatible) ──
  function fireEvents(el) {
    if (!el) return;
    ['focus', 'mousedown', 'mouseup', 'click', 'input', 'change', 'blur'].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (nativeInputValueSetter && nativeInputValueSetter.set) {
      nativeInputValueSetter.set.call(el, el.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ── Find input element for a field (keyword-based + DOM traversal) ──
  function findInputForField(keywords) {
    // 1. Search by label text
    const labels = Array.from(document.querySelectorAll('label, span, div, td')).filter(el => {
      if (el.children.length > 0 && el.tagName !== 'LABEL') {
        const firstChildText = el.childNodes[0]?.textContent || '';
        return keywords.some(kw => firstChildText.trim().includes(kw));
      }
      const text = el.innerText || el.textContent || '';
      return keywords.some(kw => text.trim().includes(kw));
    });

    for (const label of labels) {
      if (label.tagName === 'LABEL' && label.htmlFor) {
        const input = document.getElementById(label.htmlFor);
        if (input) return input;
      }

      const nestedInput = label.querySelector('input, select, textarea');
      if (nestedInput) return nestedInput;

      let current = label;
      for (let depth = 0; depth < 4; depth++) {
        if (!current) break;
        const siblingInputs = Array.from(current.querySelectorAll('input, select, textarea'));
        if (siblingInputs.length > 0) {
          const visible = siblingInputs.find(inp => inp.type !== 'hidden' && inp.style.display !== 'none');
          if (visible) return visible;
        }
        let sibling = current.nextElementSibling;
        while (sibling) {
          const sibInput = sibling.querySelector('input, select, textarea') ||
            (['INPUT', 'SELECT', 'TEXTAREA'].includes(sibling.tagName) ? sibling : null);
          if (sibInput) return sibInput;
          sibling = sibling.nextElementSibling;
        }
        current = current.parentElement;
      }
    }

    // 2. Fallback: search by input name/id/placeholder
    const allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
    for (const input of allInputs) {
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const matched = keywords.some(kw =>
        name.includes(kw.toLowerCase()) ||
        id.includes(kw.toLowerCase()) ||
        placeholder.includes(kw.toLowerCase())
      );
      if (matched) return input;
    }
    return null;
  }

  // ── Find target document (may be inside iframe) ──
  function findTargetDoc() {
    if (document.getElementById(PORTAL_FIELD_IDS.defectMajor + '_name') ||
        document.getElementById(PORTAL_FIELD_IDS.defectCode + '_name') ||
        document.getElementById(PORTAL_FIELD_IDS.sparePart + '_name')) {
      return document;
    }
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        if (doc.getElementById(PORTAL_FIELD_IDS.defectMajor + '_name') ||
            doc.getElementById(PORTAL_FIELD_IDS.defectCode + '_name') ||
            doc.getElementById(PORTAL_FIELD_IDS.sparePart + '_name')) {
          return doc;
        }
      } catch (e) { /* cross-origin */ }
    }
    return null;
  }

  // ── Set field value with fireEvents ──
  function setField(doc, fieldId, value) {
    const el = doc.getElementById(fieldId + '_name') || doc.getElementById(fieldId);
    if (!el) return false;
    el.value = value;
    fireEvents(el);
    return true;
  }

  // ── Auto-fill form with part data ──
  function autoFillForm(data) {
    // Format values to match portal expectations
    const fieldsToFill = {
      productType: data.productType || '',
      brand: data.brand ? `${data.brand} - ${data.productType || ''}` : (data.productType || ''),
      model: data.modelDescription ? `${data.modelCode} _ (${data.modelDescription})` : data.modelCode,
      defect: data.defectDescription ? `${data.defectCode} - (${data.defectDescription})` : data.defectCode,
      sparePart: data.sparePartDescription ? `${data.sparePartCode} _ (${data.sparePartDescription})` : data.sparePartCode,
      quantity: '1'
    };

    let filledCount = 0;

    // Method 1: Keyword-based field detection (Smart_Autofill approach)
    for (const [fieldKey, keywords] of Object.entries(FIELD_DEFINITIONS)) {
      const input = findInputForField(keywords);
      const value = fieldsToFill[fieldKey];
      if (input && value) {
        input.value = value;
        fireEvents(input);

        // Visual feedback
        const originalBorder = input.style.border;
        const originalShadow = input.style.boxShadow;
        input.style.transition = 'all 0.3s ease';
        input.style.border = '2px solid #10B981';
        input.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
        setTimeout(() => {
          input.style.border = originalBorder;
          input.style.boxShadow = originalShadow;
        }, 1500);

        filledCount++;
      }
    }

    // Method 2: Portal-specific field IDs with cascade injection (injector.js approach)
    const doc = findTargetDoc();
    if (doc) {
      const majorText = data.defectMajor || `${data.defectCode} - (${data.defectDescription || ''})`;
      setField(doc, PORTAL_FIELD_IDS.defectMajor, majorText);

      setTimeout(() => {
        const defectText = data.defectDescription || data.defectCode || '';
        setField(doc, PORTAL_FIELD_IDS.defectCode, defectText);
      }, 600);

      setTimeout(() => {
        setField(doc, PORTAL_FIELD_IDS.sparePart, data.sparePartCode || '');
        const ldvPart = doc.getElementById('ldv_partname');
        if (ldvPart) { ldvPart.value = data.sparePartDescription || ''; fireEvents(ldvPart); }
      }, 1200);

      filledCount += 3;
    }

    return filledCount;
  }

  // ── Inject multiple spare parts sequentially ──
  async function injectMultiple(items) {
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < items.length; i++) {
      try {
        const filled = autoFillForm(items[i]);
        if (filled > 0) {
          successCount++;
          // Wait for portal cascading to settle before next item
          if (i < items.length - 1) await new Promise(r => setTimeout(r, 1500));
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }
    return { status: 'success', filled: successCount, errors: errorCount, total: items.length };
  }

  // ── Listen for injection messages ──
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.action === 'injectData') {
      try {
        const filled = autoFillForm(msg.data);
        if (filled > 0) {
          respond({ status: 'success', filled });
        } else {
          respond({ status: 'error', message: 'لم يتم العثور على حقول البوابة في الصفحة الحالية' });
        }
      } catch (err) {
        respond({ status: 'error', message: err.message });
      }
      return true;
    }

    if (msg.action === 'injectCart') {
      injectMultiple(msg.items || []).then(res => respond(res));
      return true;
    }
  });

  // Expose to other content scripts
  globalThis.AutoFiller = { autoFillForm, findInputForField };

})();
