// ============================================================================
// AutoFill Engine — Page 2 Follow-Up, Problems & Technicians Subsystem
// File: modules/autofill/engine-page2.js
// Dependencies:
// - window.AutoFillEngine.Page1: readComplaintCodeFromPage, readDeviceTypeFromPage, isInstallationReport
// - window.AutoFillEngine.Lookups: handleSubgridIframeModal (problems), handlePage2Modal (technicians), findSafeLookupButton
// Responsibilities:
// - Problem Code resolution (device mapping, complaint parsing, profile codes)
// - Strict deterministic technician matching (P0-B.1)
// - Spare parts dropdown setting ("بدون قطع غيار")
// - Subgrid existence checking
// - Page 2 follow-up execution
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Page2]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Page2]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }
  function findFieldByLabel(labels, tag) { return (typeof window.findFieldByLabel === 'function') ? window.findFieldByLabel(labels, tag) : null; }
  function emulateUserInput(el, val) { return (typeof window.emulateUserInput === 'function') ? window.emulateUserInput(el, val) : Promise.resolve(); }

  function getProblemCode(deviceName, isInstallRow) {
    const complaintCode = window.AutoFillEngine.Page1?.readComplaintCodeFromPage ? window.AutoFillEngine.Page1.readComplaintCodeFromPage() : '';
    log('Complaint code from page: ' + (complaintCode || 'NOT FOUND'));

    if (isInstallRow || (window.AutoFillEngine.Page1?.isInstallationReport && window.AutoFillEngine.Page1.isInstallationReport())) return '*تركيب';

    if (complaintCode && /premium.?care|بريميم.?كير|بريميم كير/i.test(complaintCode)) {
      log('Premium Care detected from complaint code');
      return complaintCode;
    }

    if (complaintCode && /تركيب|installation/i.test(complaintCode)) {
      log('Installation detected from complaint code');
      return '*تركيب';
    }

    if (complaintCode && /^\*?\w{2}\d{2}$/i.test(complaintCode)) {
      log('Using complaint code as problem search: ' + complaintCode);
      return complaintCode;
    }

    const text = (deviceName || '').toLowerCase();
    const CFG = window.CFG || {};
    const map = CFG.problemCodes;
    if (map && Array.isArray(map)) {
      for (const entry of map) {
        try {
          if (new RegExp(entry.pattern, 'i').test(text) && entry.codes?.length) {
            const codes = entry.codes;
            return codes[Math.floor(Math.random() * codes.length)];
          }
        } catch(_) {}
      }
    }

    if (/تكييف|ac|air.?cond|split|شباك|inverter/i.test(text)) { const arr = ['*AC02','*AC03']; return arr[Math.floor(Math.random()*arr.length)]; }
    if (/بوتوجاز|طباخ|cooker/.test(text)) return '*GS04';
    if (/غسال/i.test(text) && !/اطباق|أطباق/.test(text)) return '*WM05';
    if (/ثلاج|مبرد|fridge/.test(text)) { const arr = ['*GR01','*GR02','*GR03']; return arr[Math.floor(Math.random()*arr.length)]; }
    if (/اطباق|أطباق|dish/.test(text)) return '*DW06';
    if (/سخان|heater/.test(text)) return '*HT01';
    return null;
  }

  async function getSmartProblemCode(deviceName, isInstallRow) {
    if (isInstallRow) return '*تركيب';
    const complaintCode = window.AutoFillEngine.Page1?.readComplaintCodeFromPage ? window.AutoFillEngine.Page1.readComplaintCodeFromPage() : '';
    if (typeof window.aiService !== 'undefined' && await window.aiService.isAvailable()) {
      try {
        const aiResult = await window.aiService.prompt(
          `شكوى العميل: "${complaintCode || 'غير محدد'}"\nنوع الجهاز: "${deviceName}"\nاختر كود العطل المناسب من: *AC02, *AC03, *GS04, *WM05, *GR01, *GR02, *GR03, *DW06, *HT01, *تركيب\nأرجع الكود فقط بدون شرح.`
        );
        if (aiResult && /\*[A-Z]{2}\d{2}|\*تركيب/.test(aiResult.trim())) return aiResult.trim();
      } catch (_) {}
    }
    return getProblemCode(deviceName, isInstallRow);
  }

  async function hasExistingSubgridRow(labelRegex) {
    const subgrids = Array.from(document.querySelectorAll('.subgrid, [role="grid"], .entity-grid'));
    for (const sg of subgrids) {
      const heading = sg.querySelector('.form-subgrid-heading, h3, h4, caption, .panel-heading');
      if (heading && labelRegex.test(heading.innerText)) {
        const rows = Array.from(sg.querySelectorAll('tbody tr, [role="row"]'))
          .filter(r => r.offsetParent !== null && r.innerText.trim() && !/no\s*records|لا\s*توجد/i.test(r.innerText));
        if (rows.length > 0) return true;
      }
    }
    return false;
  }

  async function selectRandomTechnician(targetName = null) {
    // Skip if technician subgrid already has records
    const existing = await hasExistingSubgridRow(/الفنيين|Technicians/i);
    if (existing) {
      log('Technician subgrid already has rows — skipping');
      return { ok: true, name: '(موجود مسبقاً)' };
    }

    // P0-B.1: deterministic technician targeting — never pick random/first arbitrarily.
    const wantedTech = (targetName || '').trim();
    if (!wantedTech) {
      warn('⚠️ P0-B.1: no technician specified in input — failing explicitly instead of selecting random/first');
      return { ok: false, reason: 'technician-not-specified' };
    }

    log('Looking for Technician button...');
    const allBtns = Array.from(document.querySelectorAll('a, button, input[type="button"]')).filter(b => b.offsetParent !== null);
    const techBtns = allBtns.filter(b => /فن|tech/i.test((b.innerText||b.title||b.value||'').trim()));
    log(`Found ${techBtns.length} tech-related buttons: ${techBtns.map(b=>'"'+(b.innerText||b.title||b.value||'').trim().slice(0,30)+'"').join(', ')}`);

    const res = await window.AutoFillEngine.Lookups.handlePage2Modal(/[اإأ]ضاف[ةه]\s*فن|Add.*Tech/i, wantedTech, { strictExact: true });
    if (res && res.ok) return res;
    if (res && !res.ok) log('Technician handlePage2Modal failed');

    log('Trying inline technician lookup...');
    const lab = findFieldByLabel(['الفنيين','الفني','Technician','Technicians']);
    if (!lab) { log('No technician field found on page'); return { ok: false }; }
    if (lab.tagName === 'SELECT') {
      const normTxt = s => (s || '').replace(/\s+/g, '').toLowerCase();
      const exactOpt = Array.from(lab.options).find(o => o.value && normTxt(o.text) === normTxt(wantedTech));
      if (!exactOpt) {
        warn(`⚠️ P0-B.1: technician "${wantedTech}" not found in select options — failing explicitly (no random/first fallback)`);
        return { ok: false, reason: 'technician-not-found' };
      }
      await emulateUserInput(lab, exactOpt.value);
      return { ok: true, name: exactOpt.text };
    }
    const btn = window.AutoFillEngine.Lookups.findSafeLookupButton(lab, ['.lookup-technician button', '.lookup-btn']);
    if (btn) {
      btn.click();
      await sleep(2000); 
      const items = Array.from(document.querySelectorAll('.modal table tbody tr, .modal-body table tbody tr td:first-child'))
        .filter(i => i.offsetParent !== null && i.innerText.trim() && !/norecords|لاتوجد/.test(i.innerText.replace(/\s/g,'')));
      if (items.length) {
        const nrmRow = s => (s || '').replace(/\s+/g, '').toLowerCase();
        const exactItem = items.find(i => nrmRow(i.innerText.trim()) === nrmRow(wantedTech));
        if (!exactItem) {
          warn(`⚠️ P0-B.1: technician "${wantedTech}" not found in lookup modal — closing and failing explicitly (no random/first fallback)`);
          const closeX = document.querySelector('.modal.show [data-dismiss="modal"]');
          if (closeX) closeX.click();
          return { ok: false, reason: 'technician-not-found' };
        }
        const rand = exactItem;
        const radio = rand.querySelector('input[type="radio"], input[type="checkbox"]');
        if (radio) radio.click(); else rand.click();
        await sleep(300);
        const sels = Array.from(document.querySelectorAll('.modal button.btn-primary, .modal input.btn-primary, .modal input[value="اختر"], .modal input[value="Select"], .modal button[aria-label*="Select"], .modal button[aria-label*="اختر"]'));
        const selectBtn = sels.reverse().find(b => b.offsetParent !== null);
        if (selectBtn) {
          try { selectBtn.focus(); } catch(_) {}
          selectBtn.click();
          try { selectBtn.dispatchEvent(new Event('click', { bubbles: true })); } catch(_) {}
        }
        return { ok: true, name: rand.innerText.trim() };
      }
      const closeBtn = document.querySelector('.modal.show [data-dismiss="modal"]');
      if (closeBtn) closeBtn.click();
    }
    return { ok: false };
  }

  async function executePage2_FollowUp(data, cfg) {
    const FR = {};
    log('【 PAGE 2 】 Preparing Actual Problems and Technicians...');
    await sleep(1000);

    // Set Spare Parts to "بدون قطع غيار" (ats_sparepartsstatus)
    let sparePartsEl = findFieldByLabel(['حالة قطع الغيار', 'Spare Parts'], 'select');
    if (!sparePartsEl) sparePartsEl = document.getElementById('ats_sparepartsstatus');
    if (sparePartsEl && sparePartsEl.tagName === 'SELECT') {
      const noneOpt = Array.from(sparePartsEl.options).find(o => /بدون قطع غيار/i.test(o.text));
      if (noneOpt) {
        sparePartsEl.value = noneOpt.value;
        try { sparePartsEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        FR.spareParts = { ok: true, selected: noneOpt.text };
        log('Spare Parts set to: ' + noneOpt.text);
      } else {
        warn('"بدون قطع غيار" option not found in spare parts dropdown');
      }
    } else {
      log('Spare Parts field not found — skipping');
    }

    const { autofiller_ProductType } = await chrome.storage.local.get('autofiller_ProductType');
    const deviceName = (window.AutoFillEngine.Page1?.readDeviceTypeFromPage ? window.AutoFillEngine.Page1.readDeviceTypeFromPage() : '') || autofiller_ProductType || data.reportType || '';
    const isInstall = /تركيب/.test(data.reportType) || (window.AutoFillEngine.Page1?.isInstallationReport && window.AutoFillEngine.Page1.isInstallationReport());
    
    // For Second Visit & Masaha: use problemCode from profile directly
    const isProfileMode = data.secondVisitMode || data.masahaMode;
    const probCode = isProfileMode && data.problemCode ? data.problemCode : (data.problemCode || getProblemCode(deviceName, isInstall));
    if (probCode) {
      log('Adding Actual Problem: ' + probCode);
      const excludeActualProblems = /ترصيد|ارضي|أرضي|بلاغ/i;
      const priorityActualProblem = /Premium\s*care|بريميم.?كير|تركيب وتشغيل/i;
      let probRes = await window.AutoFillEngine.Lookups.handleSubgridIframeModal(
        /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i,
        probCode,
        false,
        excludeActualProblems,
        priorityActualProblem
      );
      if (probRes && probRes.ok) {
        FR.problem = { ok: true, selected: probRes.name };
        log('Problem added: ' + probRes.name);
      } else {
        warn('Problem modal failed or no match. probRes:', JSON.stringify(probRes));
        FR.problem = { ok: false };
      }
    } else {
      warn('Could not determine Problem Code for device:', deviceName);
    }

    log('Waiting 2s for problem modal cleanup before technician...');
    await sleep(2000);

    const targetTech = data.technicianName || data.technician || null;
    log('Adding Technician: ' + (targetTech || 'NOT SPECIFIED'));
    let techRes = await selectRandomTechnician(targetTech);
    if (!techRes || !techRes.ok) {
      log('Technician failed, retrying in 3s...');
      await sleep(3000);
      techRes = await selectRandomTechnician(targetTech);
    }
    FR.technician = { ok: techRes?.ok || false, selected: techRes?.name };
    log(techRes?.ok ? 'Technician added: ' + techRes.name : 'Technician failed');

    log('【 PAGE 2 DONE 】 Results:', FR);
    return { report: { fieldResults: FR } };
  }

  const Page2 = {
    getProblemCode,
    getSmartProblemCode,
    hasExistingSubgridRow,
    selectRandomTechnician,
    executePage2_FollowUp
  };

  window.AutoFillEngine.Page2 = Page2;
  Object.assign(window, Page2);

})(window);
