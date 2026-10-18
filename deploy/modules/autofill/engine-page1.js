// ============================================================================
// AutoFill Engine — Page 1 Technical Review Subsystem
// File: modules/autofill/engine-page1.js
// Responsibilities:
// - Page 1 device data verification and pre-filled checks
// - Customer complaint code extraction
// - Installation report handling
// - Page 1 review execution and field population
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Page1]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Page1]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }
  function findFirst(sel) { return window.findFirst ? window.findFirst(sel) : null; }
  function emulateUserInput(el, val) {
    if (typeof window.emulateUserInput === 'function' && window.emulateUserInput !== emulateUserInput) {
      return window.emulateUserInput(el, val);
    }
    if (!el) return Promise.resolve();
    try { el.focus(); } catch(_) {}
    document.body.dataset.isAutofilling = 'true';
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) { try { descriptor.set.call(el, val); } catch(_) {} } else { el.value = val; }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch(_) {}
    return sleep(100);
  }

  function readDeviceTypeFromPage() {
    const el = document.getElementById('ldv_producttype_name') ||
               document.querySelector('input[name*="producttype"]') ||
               document.querySelector('input[aria-label*="نوع المنتج"]') ||
               document.getElementById('ldv_productgroup_name');
    if (el) {
      const val = (el.value || el.innerText || el.getAttribute('value') || '').trim();
      if (val) return val;
    }
    const label = Array.from(document.querySelectorAll('label, th, td')).find(l => /نوع المنتج|فئة المنتج/i.test(l.innerText));
    if (label) {
      const parent = label.closest('.form-group, tr, div');
      const valEl = parent ? parent.querySelector('.form-control-static, span, input') : null;
      if (valEl) return (valEl.value || valEl.innerText || '').trim();
    }
    return '';
  }

  function readComplaintCodeFromPage() {
    const selectors = [
      '#ats_problem_name',
      '#ldv_customercomplaint',
      '#ldv_complaintcode',
      'input[name*="problem"]',
      'input[name*="complaint"]',
      'textarea[name*="complaint"]',
      'span[id*="problem"]',
      'span[id*="complaint"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = (el.value || el.innerText || el.textContent || '').trim();
        if (val) {
          const match = val.match(/\b([A-Z]{2}\d{2})\b/i);
          if (match) return match[1].toUpperCase();
          if (/premium.?care|بريميم.?كير|بريميم كير/i.test(val)) return 'Premium Care';
          return val;
        }
      }
    }
    const labels = Array.from(document.querySelectorAll('label, .control-label, dt, th'));
    for (const label of labels) {
      if (/شكوى|عطل|مشكلة|complaint|problem/i.test(label.innerText || '')) {
        const parent = label.closest('.form-group, tr, .row, dl');
        if (parent) {
          const valEl = parent.querySelector('.form-control-static, p, span, dd, input, textarea');
          if (valEl) {
            const val = (valEl.value || valEl.innerText || valEl.textContent || '').trim();
            if (val) {
              const match = val.match(/\b([A-Z]{2}\d{2})\b/i);
              if (match) return match[1].toUpperCase();
              return val;
            }
          }
        }
      }
    }
    return '';
  }

  function isInstallationReport() {
    const pageText = document.body.innerText || '';
    if (/تقرير التركيب والتشغيل/i.test(pageText)) return true;
    const titleEl = document.querySelector('.page-header h1, .page-header h2, .panel-heading, #mainContent h1');
    if (titleEl && /تركيب|تشغيل/i.test(titleEl.innerText)) return true;
    const stepEl = document.querySelector('.wizard-step.active, .step.active, [aria-current="step"]');
    if (stepEl && /تركيب/i.test(stepEl.innerText)) return true;
    return false;
  }

  async function performInstallationAndCommissioning(data) {
    log('Starting Installation and Commissioning auto-fill...');
    const results = {};
    const selects = Array.from(document.querySelectorAll('select:not([disabled])')).filter(s => s.offsetParent !== null);
    for (const sel of selects) {
      const label = sel.closest('.form-group')?.querySelector('label')?.innerText?.trim() || sel.name || sel.id;
      const opts = Array.from(sel.options).filter(o => o.value && o.text.trim());
      const doneOpt = opts.find(o => /تم|نعم|yes|done|ok/i.test(o.text)) || opts[opts.length - 1];
      if (doneOpt) {
        sel.value = doneOpt.value;
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        results[label] = { ok: true, selected: doneOpt.text };
      }
    }
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:not([disabled])')).filter(c => c.offsetParent !== null && !c.checked);
    for (const chk of checkboxes) {
      chk.click();
      results[chk.name || chk.id || 'checkbox'] = { ok: true, checked: true };
    }
    return { report: { fieldResults: results } };
  }

  function isPage1AlreadyFilled(cfg) {
    const serial1 = document.getElementById('ldv_serialnumber');
    const serial2 = document.getElementById('ldv_serialnumber1');
    const isVal = el => el && (el.value || el.getAttribute('value') || '').trim().length >= 3;

    // A work order on Page 1 is ONLY considered already filled if it has a Serial Number!
    // Brand and Model are almost always pre-filled by customer service when opening the ticket.
    if (isVal(serial1) || isVal(serial2)) {
      log(`Page 1 has Serial Number: serial1="${serial1?.value || ''}", serial2="${serial2?.value || ''}" — marking as already filled.`);
      return true;
    }
    return false;
  }

  function extractExistingPage1Data() {
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? (el.value || el.getAttribute('value') || el.innerText || '').trim() : '';
    };
    return {
      serial: getVal('ldv_serialnumber'),
      serial2: getVal('ldv_serialnumber1'),
      brand: getVal('ats_producttypebrand_name'),
      model: getVal('ldv_actualmodel_name'),
      model2: getVal('ldv_actualmodel2_name'),
      warrantyDate: getVal('ldv_warrantydate'),
      warrantyStatus: getVal('ldv_warrantystatus') || getVal('ldv_warrantystatus_name')
    };
  }

  async function clearAllDeviceFields(mode = 'all') {
    log(`Clearing device fields in mode: ${mode}`);
    const clearActions = [];
    const fieldsToClear = [
      { id: 'ldv_serialnumber', type: 'input' },
      { id: 'ldv_serialnumber1', type: 'input' },
      { id: 'ldv_warrantydate', type: 'input' },
      { id: 'ats_producttypebrand_name', type: 'lookup' },
      { id: 'ldv_actualmodel_name', type: 'lookup' },
      { id: 'ldv_actualmodel2_name', type: 'lookup' }
    ];

    for (const field of fieldsToClear) {
      const el = document.getElementById(field.id);
      if (el) {
        if (field.type === 'input') {
          el.value = '';
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
          try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
          clearActions.push(field.id);
        } else if (field.type === 'lookup') {
          const parent = el.closest('.input-group') || el.parentElement;
          const clearBtn = parent ? parent.querySelector('button[aria-label*="Clear"], button[aria-label*="مسح"]') : null;
          if (clearBtn) {
            if (typeof window.dispatchClickSequence === 'function') {
              await window.dispatchClickSequence(clearBtn);
            } else {
              clearBtn.click();
            }
            clearActions.push(field.id + ' (via clear button)');
          } else {
            el.value = '';
            try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
            clearActions.push(field.id);
          }
        }
      }
    }
    return { ok: true, cleared: clearActions };
  }

  async function executePage1_Review(data, cfg) {
    const FR = {};
    log('【 PAGE 1 】 Review execution starting for order: ' + data.orderId);

    // Wait for form to load (as in V2)
    const startWait = Date.now();
    while (Date.now() - startWait < 12000) {
      if (document.querySelector('#ats_producttypebrand_name') || document.querySelector('#ldv_actualmodel_name') || document.getElementById('ldv_serialnumber')) break;
      await sleep(250);
    }
    await sleep(800);

    // Read and save product type for Page 2
    const pType = readDeviceTypeFromPage() || data.reportType;
    if (pType) {
      try { await chrome.storage.local.set({ autofiller_ProductType: pType }); } catch(_) {}
    }

    // 1. Brand (First, matching V2)
    let brandVal = data.brand;
    const existingBrandEl = document.getElementById('ats_producttypebrand_name') || document.querySelector('input[name*="producttypebrand"]');
    const existingBrandVal = (existingBrandEl?.value || existingBrandEl?.getAttribute('value') || '').trim();
    if (!brandVal && existingBrandVal) {
      brandVal = existingBrandVal;
      log(`Preserving existing Brand from portal: "${brandVal}"`);
    } else if (!brandVal && data.model) {
      const mUpper = data.model.toUpperCase();
      if (mUpper.startsWith('SJ-') || mUpper.startsWith('ES-') || mUpper.startsWith('KC-')) brandVal = 'شارب';
      else if (mUpper.startsWith('GR-') || mUpper.startsWith('AW-') || mUpper.startsWith('VH-')) brandVal = 'توشيبا';
      else if (mUpper.startsWith('TH-') || mUpper.startsWith('TC-')) brandVal = 'تورنيدو';
      else if (mUpper.startsWith('H-') || mUpper.startsWith('DX-')) brandVal = 'هوفر';
      else if (mUpper.startsWith('KD-') || mUpper.startsWith('XR-') || mUpper.startsWith('ZS-')) brandVal = 'سوني';
    }

    if (brandVal) {
      const brandSelectors = ['#ats_producttypebrand_name', 'input[id="ats_producttypebrand_name"]', 'input[aria-label*="العلامة التجاريه"]', 'input[aria-label*="العلامة التجارية"]'];
      const brandRes = await window.AutoFillEngine.Lookups.fillPowerAppsLookup(brandSelectors, brandVal, {
        fallbackButtons: cfg?.brandBtn || [],
        isBrand: true,
        forceOverwrite: !!data.forceOverwrite
      });
      FR.brand = brandRes;
      await sleep(600);
    }

    // 2. Actual Model 1
    if (data.model) {
      const modelSelectors = ['#ldv_actualmodel_name', 'input[id="ldv_actualmodel_name"]', 'input[aria-label*="الموديل الفعلي 1"]', 'input[aria-label*="الموديل الفعلي"]'];
      const modelRes = await window.AutoFillEngine.Lookups.fillPowerAppsLookup(modelSelectors, data.model, {
        fallbackButtons: cfg?.modelBtn || [],
        isModel: true
      });
      FR.model = modelRes;
      await sleep(600);
    }

    // 3. Actual Model 2 (for AC or dual unit)
    if (data.model2) {
      const model2Selectors = ['#ldv_actualmodel2_name', 'input[id="ldv_actualmodel2_name"]', 'input[aria-label*="الموديل الفعلي 2"]'];
      const model2Res = await window.AutoFillEngine.Lookups.fillPowerAppsLookup(model2Selectors, data.model2, {
        fallbackButtons: cfg?.modelBtn2 || cfg?.modelBtn || [],
        isModel: true
      });
      FR.model2 = model2Res;
      await sleep(600);
    }

    // Serial Number 1
    if (data.serial) {
      const s1 = document.getElementById('ldv_serialnumber');
      if (s1) {
        // Handle potential "serial duplicate" alert
        const alertHandler = (msg) => {
          if (msg && msg.includes && msg.includes('هذا السيريال مكرر')) {
            log('Serial duplicate alert detected, auto-accepting...');
            return true; // accept the alert
          }
        };
        
        // Set up one-time alert handler
        const originalAlert = window.alert;
        window.alert = function(msg) {
          if (msg && msg.includes && msg.includes('هذا السيريال مكرر')) {
            log('Serial duplicate alert intercepted, auto-accepting...');
            return; // suppress the alert
          }
          return originalAlert.apply(this, arguments);
        };
        
        // Also handle native browser alert
        const nativeAlert = window.alert.bind(window);
        window.alert = function(msg) {
          if (msg && msg.includes && msg.includes('هذا السيريال مكرر')) {
            log('Serial duplicate native alert intercepted, auto-accepting...');
            return;
          }
          return nativeAlert(msg);
        };
        
        await emulateUserInput(s1, data.serial);
        FR.serial = { ok: true, value: data.serial };
        
        // Restore original alert after a short delay
        setTimeout(() => {
          window.alert = originalAlert;
        }, 2000);
      }
    }

    // Serial Number 2
    if (data.serial2) {
      const s2 = document.getElementById('ldv_serialnumber1');
      if (s2) {
        await emulateUserInput(s2, data.serial2);
        FR.serial2 = { ok: true, value: data.serial2 };
      }
    }

    // Robust PowerApps Date Helper
    const setPowerAppsDate = async (baseId, rawDate) => {
      if (!rawDate) return false;
      const baseEl = document.getElementById(baseId) || document.querySelector(`[name*="${baseId}"]`);
      const pickerEl = document.getElementById(`${baseId}_datepicker_description`) ||
                       document.querySelector(`input[id*="${baseId}"][id*="datepicker"]`);

      // تحليل التاريخ عبر المصدر الوحيد: shared/portal-selectors.js → window.parsePortalDate
      // ⚠️ صيغة البوابة يوم/شهر/سنة (DD/MM/YYYY) — موثّقة في SHARED_KNOWLEDGE.md
      //    (daterangepicker: locale.format = 'DD/MM/YYYY')، وهي نفس ما كان يعمل في V1/V2.
      //    كتابة MM/DD/YYYY كانت تُرفض من السيرفر بالرسالة:
      //    «تاريخ الضمان must have a valid date format. Example: {1}»
      const parsedDate = (typeof window.parsePortalDate === 'function')
        ? window.parsePortalDate(rawDate)
        : null;
      if (!parsedDate) return false;

      const dObj = { day: parsedDate.day, month: parsedDate.month, year: parsedDate.year };
      const isoDate = parsedDate.iso;
      // يوم/شهر/سنة — نفس صيغة العرض في البوابة (وليس MM/DD/YYYY)
      const portalDisplay = parsedDate.display;

      // 1. Try jQuery DateTimePicker first if portal has initialized it
      try {
        const $ = window.$ || window.jQuery;
        if ($) {
          const $el = $(pickerEl || baseEl);
          const dtp = $el.data('DateTimePicker');
          if (dtp && typeof dtp.date === 'function') {
            dtp.date(new Date(dObj.year, dObj.month - 1, dObj.day, 12, 0, 0));
            log(`Set date via jQuery DateTimePicker on ${baseId}: ${portalDisplay}`);
          }
        }
      } catch (_) {}

      // 2. Write to visible datepicker description input
      if (pickerEl) {
        await emulateUserInput(pickerEl, portalDisplay);
      }

      // 3. Write to base hidden / value input
      if (baseEl) {
        if (baseEl.type === 'date') {
          await emulateUserInput(baseEl, isoDate);
        } else {
          // Both datepicker input and underlying input must hold the formatted date string
          await emulateUserInput(baseEl, portalDisplay);
        }
      }
      return true;
    };

    // Warranty Date
    const dateVal = data.warrantyDate || data.date;
    if (dateVal) {
      const ok = await setPowerAppsDate('ldv_warrantydate', dateVal);
      if (ok) {
        FR.warrantyDate = { ok: true, value: dateVal };
      }
    }

    // Scheduled Service End Date (if present on form)
    const endDateVal = data.scheduledServiceEndDate || data.date2 || data.date;
    if (endDateVal && (document.getElementById('ldv_scheduledserviceenddate') || document.getElementById('ldv_scheduledserviceenddate_datepicker_description'))) {
      const okEnd = await setPowerAppsDate('ldv_scheduledserviceenddate', endDateVal);
      if (okEnd) {
        FR.scheduledServiceEndDate = { ok: true, value: endDateVal };
      }
    }

    // 4. Status mapping - handle PowerApps select / combobox
    if (data.status) {
      const statusEl = document.getElementById('ldv_warrantystatus') || findFirst(cfg?.statusSelect) || findFirst(cfg?.status);
      if (statusEl) {
        const lower = data.status.toLowerCase();
        let matched = false;
        if (statusEl.tagName === 'SELECT') {
          const opts = Array.from(statusEl.options || []);
          let match = opts.find(o => o.text.toLowerCase() === lower) ||
                      opts.find(o => o.text.toLowerCase().includes(lower)) ||
                      opts.find(o => lower.includes(o.text.toLowerCase()) && o.text.trim() !== '');
          if (!match) {
            const inWarrantyVal = '753240000';
            const outWarrantyVal = '753240001';
            match = (lower.includes('in') || lower.includes('داخل') || lower.includes('صالح') || lower.includes('ساري'))
              ? opts.find(o => o.value === inWarrantyVal)
              : opts.find(o => o.value === outWarrantyVal);
          }
          if (match) {
            statusEl.value = match.value;
            try { statusEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
            FR.status = { ok: true, selected: match.text };
            matched = true;
          }
        } else {
          try {
            await window.dispatchClickSequence?.(statusEl) || statusEl.click();
            await sleep(400);
            const options = document.querySelectorAll('[role="option"], .ms-Dropdown-option, .ms-ComboBox-option, li[data-value], option');
            const option = Array.from(options).find(opt => 
              (opt.textContent || opt.innerText || '').toLowerCase().includes(lower)
            );
            if (option) {
              await window.dispatchClickSequence?.(option) || option.click();
              await sleep(300);
              FR.status = { ok: true, selected: option.textContent?.trim() };
              matched = true;
            }
          } catch (e) {
            warn('Combobox selection failed:', e);
          }
        }
        if (!matched) FR.status = { ok: false, reason: 'status-not-matched' };
      }
    }

    log('【 PAGE 1 DONE 】 Results:', FR);
    return { report: { fieldResults: FR } };
  }

  const Page1 = {
    readDeviceTypeFromPage,
    readComplaintCodeFromPage,
    isInstallationReport,
    performInstallationAndCommissioning,
    isPage1AlreadyFilled,
    extractExistingPage1Data,
    clearAllDeviceFields,
    executePage1_Review
  };

  window.AutoFillEngine.Page1 = Page1;
  Object.assign(window, Page1);

})(window);
