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
  function findFirst(sel) { return (typeof window.findFirst === 'function') ? window.findFirst(sel) : null; }
  function emulateUserInput(el, val) { return (typeof window.emulateUserInput === 'function') ? window.emulateUserInput(el, val) : Promise.resolve(); }

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
    const model1  = document.getElementById('ldv_actualmodel_name');
    const model2  = document.getElementById('ldv_actualmodel2_name');
    const brand   = document.getElementById('ats_producttypebrand_name');

    const isVal = el => el && (el.value || el.getAttribute('value') || '').trim().length > 0;
    const filledCount = [serial1, serial2, model1, model2, brand].filter(isVal).length;

    if (filledCount >= 2) {
      log(`Page 1 already filled: ${filledCount} fields have values (serial1=${isVal(serial1)}, model1=${isVal(model1)}, brand=${isVal(brand)})`);
      return true;
    }
    return false;
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
            clearBtn.click();
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

    // Status mapping (P0-B.2: no hardcoded fallback ID)
    if (data.status) {
      const statusEl = document.getElementById('ldv_warrantystatus') || findFirst(cfg.status);
      if (statusEl && statusEl.tagName === 'SELECT') {
        const lower = data.status.toLowerCase();
        const opts = Array.from(statusEl.options || []);
        const match = opts.find(o => o.text.toLowerCase() === lower) ||
                      opts.find(o => o.text.toLowerCase().includes(lower)) ||
                      opts.find(o => lower.includes(o.text.toLowerCase()) && o.text.trim() !== '');
        if (match) {
          statusEl.value = match.value;
          try { statusEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
          FR.status = { ok: true, selected: match.text };
        } else {
          FR.status = { ok: false, reason: 'status-not-matched' };
        }
      }
    }

    // Brand
    if (data.brand) {
      const brandRes = await window.AutoFillEngine.Lookups.fillPowerAppsLookup('#ats_producttypebrand_name', data.brand);
      FR.brand = brandRes;
    }

    // Actual Model 1
    if (data.model) {
      const modelRes = await window.AutoFillEngine.Lookups.fillPowerAppsLookup('#ldv_actualmodel_name', data.model);
      FR.model = modelRes;
    }

    // Actual Model 2 (for AC or dual unit)
    if (data.model2) {
      const model2Res = await window.AutoFillEngine.Lookups.fillPowerAppsLookup('#ldv_actualmodel2_name', data.model2);
      FR.model2 = model2Res;
    }

    // Serial Number 1
    if (data.serial) {
      const s1 = document.getElementById('ldv_serialnumber');
      if (s1) {
        await emulateUserInput(s1, data.serial);
        FR.serial = { ok: true, value: data.serial };
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

    // Warranty Date
    if (data.warrantyDate) {
      const wd = document.getElementById('ldv_warrantydate');
      if (wd) {
        await emulateUserInput(wd, data.warrantyDate);
        FR.warrantyDate = { ok: true, value: data.warrantyDate };
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
    clearAllDeviceFields,
    executePage1_Review
  };

  window.AutoFillEngine.Page1 = Page1;
  Object.assign(window, Page1);

})(window);
