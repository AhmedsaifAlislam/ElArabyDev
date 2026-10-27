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

  // ملاحظة: كود «المشكلة المبدئية» (شكوى العميل) لا يُنسخ كما هو إلا إذا كان
  // كودًا معروفًا في كتالوج المشاكل الفعلية وغير ممنوع. سبب الإصلاح: WM82 → WM82.

  // مطابقة عائلة الكود لعائلة الجهاز — fail-open لو أي طرف مجهول.
  function _familyMatches(code, deviceName) {
    const PC = window.ProblemCodes;
    if (!PC || typeof PC.familyOfCode !== 'function') return true;
    const fam = typeof PC.familyOf === 'function' ? PC.familyOf(deviceName) : '';
    const codeFam = PC.familyOfCode(code);
    if (!fam || !codeFam || codeFam === '*') return true;
    return codeFam === fam;
  }

  async function getProblemCode(deviceName, isInstallRow) {
    const PC = window.ProblemCodes;
    if (PC && typeof PC.loadCatalog === 'function') {
      try { await PC.loadCatalog(); } catch (_) {}
    }

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

    // ③ كود الشكوى: يُقبل فقط ككود مشكلة معروف (وليس مجرد شكل XX99) ومطابق لعائلة الجهاز
    if (complaintCode && /^\*?\w{2}\d{2}$/i.test(complaintCode)) {
      const bare = String(complaintCode).replace(/^\*+/, '').trim().toUpperCase();
      const known = PC && typeof PC.isKnownCode === 'function' ? PC.isKnownCode(bare) : false;
      if (known && !(PC && PC.isForbidden(bare))) {
        if (!_familyMatches(bare, deviceName)) {
          warn('Complaint code "' + complaintCode + '" is from another family than "' + deviceName + '" — ignored');
        } else {
          log('Complaint code is a catalog problem code: ' + complaintCode);
          return complaintCode;
        }
      } else {
        log('Complaint code "' + complaintCode + '" is not a usable catalog code — resolving from device type');
      }
    }

    // ④ الكتالوج حسب عائلة الجهاز (المصدر الأول) — بلا التعلّم العالق من بلاغات سابقة
    if (PC && typeof PC.allowedCodesForDevice === 'function') {
      const fromCatalog = PC.allowedCodesForDevice(deviceName, null, {
        service: isInstallRow ? 'install' : 'maintenance'
      }) || [];
      if (fromCatalog.length) {
        const picked = fromCatalog[Math.floor(Math.random() * fromCatalog.length)];
        log('Picked catalog problem code: ' + picked);
        return picked;
      }
    }

    // ⑤ خريطة selectors.json + الافتراضات القديمة (احتياطي)
    const text = (deviceName || '').toLowerCase();
    const CFG = window._CFG || window.CFG || {};
    const map = CFG.problemCodes;
    if (map && Array.isArray(map)) {
      for (const entry of map) {
        try {
          if (new RegExp(entry.pattern, 'i').test(text) && entry.codes?.length) {
            const picked = _pickAllowedCode(entry.codes);
            if (picked) return picked;
          }
        } catch(_) {}
      }
    }

    if (/تكييف|ac|air.?cond|split|شباك|inverter/i.test(text)) { const p = _pickAllowedCode(['*AC02','*AC03']); if (p) return p; }
    if (/بوتوجاز|طباخ|cooker/.test(text)) { const p = _pickAllowedCode(['*GS04']); if (p) return p; }
    if (/غسال/i.test(text) && !/اطباق|أطباق/.test(text)) { const p = _pickAllowedCode(['*WM05']); if (p) return p; }
    if (/ثلاج|مبرد|fridge/.test(text)) { const p = _pickAllowedCode(['*GR01','*GR02','*GR03']); if (p) return p; }
    if (/اطباق|أطباق|dish/.test(text)) { const p = _pickAllowedCode(['*DW06']); if (p) return p; }
    if (/سخان|heater/.test(text)) { const p = _pickAllowedCode(['*HT01']); if (p) return p; }
    return null;
  }

  // اختيار عشوائي («تدوير») بين المسموح فقط — يستخدم السجل المشترك ProblemCodes
  function _pickAllowedCode(arr) {
    let list = Array.isArray(arr) ? arr.slice().filter(Boolean) : [];
    const PC = window.ProblemCodes;
    if (PC && typeof PC.filterAllowed === 'function') {
      list = PC.filterAllowed(list);
    } else {
      list = list.filter(c => !/(GI00|GS08|GR05|SR00|SR01|WM04|ترصيد|تجار|ارضي|أرضي|بلاغ)/i.test(c));
    }
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  // الأكواد المسموح بها من الـ AI — تُبنى من كتالوج المشاكل حسب عائلة الجهاز.
  // (الـ AI كان يخترع أكوادًا مثل WM30 غير موجودة في البوابة إطلاقًا، فيفشل الاختيار بـ no-match).
  const ALLOWED_PROBLEM_CODES = ['*AC02', '*AC03', '*GS04', '*WM05', '*GR01', '*GR02', '*GR03', '*DW06', '*HT01', '*تركيب'];

  function allowedCodesForAI(deviceName) {
    const PC = window.ProblemCodes;
    if (PC && typeof PC.codesForDevice === 'function') {
      const list = PC.codesForDevice(deviceName) || [];
      if (list.length) return list.map(c => '*' + String(c).replace(/^\*+/, ''));
    }
    return ALLOWED_PROBLEM_CODES.slice();
  }

  async function getSmartProblemCode(deviceName, isInstallRow) {
    if (isInstallRow) return '*تركيب';
    const PC = window.ProblemCodes;
    if (PC && typeof PC.loadCatalog === 'function') {
      try { await PC.loadCatalog(); } catch (_) {}
    }
    const complaintCode = window.AutoFillEngine.Page1?.readComplaintCodeFromPage ? window.AutoFillEngine.Page1.readComplaintCodeFromPage() : '';
    const allowedCodes = allowedCodesForAI(deviceName);
    if (typeof window.aiService !== 'undefined' && await window.aiService.isAvailable()) {
      try {
        const aiResult = await window.aiService.prompt(
          `شكوى العميل: "${complaintCode || 'غير محدد'}"\nنوع الجهاز: "${deviceName}"\nاختر كود العطل المناسب من: ${allowedCodes.join(', ')}\nأرجع الكود فقط بدون شرح.`
        );
        if (aiResult) {
          const found = (aiResult.trim().match(/\*[A-Z]{2}\d{2}|\*تركيب|^[A-Z]{2}\d{2}/) || [])[0];
          const candidate = found ? (found.startsWith('*') ? found : '*' + found) : '';
          const bare = candidate.replace(/^\*+/, '');
          const known = (PC && typeof PC.isKnownCode === 'function')
            ? PC.isKnownCode(bare)
            : allowedCodes.includes(candidate);
          if (candidate && known) {
            if (PC && typeof PC.isForbidden === 'function' && PC.isForbidden(bare)) {
              log('AI returned a forbidden code: ' + candidate + ' — falling back to the device map');
            } else if (!_familyMatches(candidate, deviceName)) {
              log('AI returned a code from another family: ' + candidate + ' — falling back to the device map');
            } else {
              return candidate;
            }
          }
          if (candidate) log('AI returned a code outside the catalog: ' + candidate + ' — falling back');
        }
      } catch (_) {}
    }
    return await getProblemCode(deviceName, isInstallRow);
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

  async function fetchAreaFromPortalApi() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let incidentId = urlParams.get('id');

      if (!incidentId || !/^[a-f0-9-]{36}$/i.test(incidentId)) {
        const idEl = document.querySelector('input[name*="incidentid"], #EntityFormView_EntityID, input[id*="EntityID"]');
        if (idEl && idEl.value && /^[a-f0-9-]{36}$/i.test(idEl.value)) {
          incidentId = idEl.value;
        }
      }

      if (!incidentId || !/^[a-f0-9-]{36}$/i.test(incidentId)) return '';

      // 1. Fetch Customer ID from Incident
      const incResp = await fetch(`/_api/incidents(${incidentId})?$select=_customerid_value`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!incResp.ok) return '';
      const incData = await incResp.json();
      const customerId = incData._customerid_value;
      if (!customerId) return '';

      // 2. Fetch Area from Customer/Account
      const accResp = await fetch(`/_api/accounts(${customerId})?$select=accountid,_ldv_area_value,_ldv_centraltelephone_value`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!accResp.ok) return '';
      const accData = await accResp.json();
      const area = accData['_ldv_area_value@OData.Community.Display.V1.FormattedValue']
        || accData['_ldv_centraltelephone_value@OData.Community.Display.V1.FormattedValue']
        || '';
      return (area || '').trim();
    } catch(e) {
      return '';
    }
  }

  async function readRegionFromPage() {
    // 1. Try DOM elements first (immediate)
    const selectors = [
      '#ldv_area_name',
      '#ldv_area',
      'input[name*="area"]',
      'input[aria-label*="المنطقة"]',
      'input[aria-label*="منطقة"]',
      'span[id*="area"]',
      '.customer-area',
      '[data-id*="area"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = (el.value || el.innerText || el.textContent || '').trim();
        if (val && val !== '0' && val !== 'غير محدد') return val;
      }
    }
    const label = Array.from(document.querySelectorAll('label, th, td, span')).find(l => /^(المنطقة|منطقة|Area)$/i.test(l.innerText.trim()));
    if (label) {
      const parent = label.closest('.form-group, tr, div');
      const valEl = parent ? parent.querySelector('.form-control-static, span, input, select') : null;
      if (valEl) {
        const val = (valEl.value || valEl.innerText || '').trim();
        if (val && val !== '0' && val !== 'غير محدد') return val;
      }
    }

    // 2. Query portal API for current incident customer area (100% reliable across any center)
    const apiArea = await fetchAreaFromPortalApi();
    if (apiArea) {
      log('[REGION] Extracted area from portal API:', apiArea);
      return apiArea;
    }

    return '';
  }

  async function registerRegion(region, assignedTech = '') {
    if (!region || !region.trim()) return;
    const reg = region.trim();
    try {
      const { regionTechMap = {} } = await chrome.storage.local.get({ regionTechMap: {} });
      if (!regionTechMap[reg]) {
        regionTechMap[reg] = assignedTech || '';
        await chrome.storage.local.set({ regionTechMap });
        log(`[REGION-MAP] Auto-registered region: "${reg}" -> "${regionTechMap[reg]}"`);
      } else if (assignedTech && !regionTechMap[reg]) {
        regionTechMap[reg] = assignedTech;
        await chrome.storage.local.set({ regionTechMap });
      }
    } catch(e) {
      warn('[REGION-MAP] Registration error:', e.message);
    }
  }

  // ── Technician Resolution V2 ─────────────────────────────────────────────
  // L1: exact name from input data  → pick deterministically
  // L2: region from data → look up saved regionTechMap → pick that technician
  // L3: random from live roster (with warning) — last resort, never silent
  //
  // Roster: pulled live from the technician modal on first use, saved to
  //         chrome.storage.local key 'technicianRoster' as string[]
  // Region map: user-configured via popup Settings → key 'regionTechMap' { region: techName }

  // Pull live technician names from the currently-open technician lookup modal
  // and save/merge into chrome.storage.local 'technicianRoster'.
  async function _pullRosterFromModal(modal) {
    try {
      const rows = Array.from(modal.querySelectorAll('table tbody tr, div[role="grid"] tr'))
        .filter(r => r.innerText.trim() && !/norecords|لاتوجد|لا\s*توجد/i.test(r.innerText.replace(/\s/g, '')));
      if (!rows.length) return;
      const names = rows.map(r => r.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
      const { technicianRoster: existing = [] } = await chrome.storage.local.get({ technicianRoster: [] });
      const merged = [...new Set([...existing, ...names])];
      await chrome.storage.local.set({ technicianRoster: merged });
      log(`[TECH-ROSTER] saved ${merged.length} technician names from live modal`);
    } catch (e) {
      warn('[TECH-ROSTER] failed to pull roster from modal:', e.message);
    }
  }

  // Core resolution function: L1 → L2 → L3
  async function resolveTechnician(targetName, region) {
    const normStr = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // L1 — exact name from input
    if (targetName && targetName.trim()) {
      log(`[TECHNICIAN] target="${targetName}" source=input_exact`);
      return { name: targetName.trim(), source: 'input_exact' };
    }

    // L2 — region mapping
    if (region && region.trim()) {
      try {
        const { regionTechMap = {} } = await chrome.storage.local.get({ regionTechMap: {} });
        const normRegion = normStr(region);
        const found = Object.entries(regionTechMap).find(([k]) => normStr(k) === normRegion);
        // القيمة قد تكون '' (منطقة مُلتقطة تلقائيًا ولم يُسند لها فني بعد) =>
        // نتجاهلها ونكمل إلى L3 بدل الفشل الفوري (2026-10-19).
        if (found && found[1]) {
          log(`[TECHNICIAN] region="${region}" resolved="${found[1]}" source=region_mapping`);
          return { name: found[1], source: 'region_mapping' };
        }
        if (found) {
          log(`[TECHNICIAN] region="${region}" mapped to an empty technician — falling back to L3`);
        } else {
          log(`[TECHNICIAN] region="${region}" not found in regionTechMap (${Object.keys(regionTechMap).length} entries)`);
        }
      } catch(e) {
        warn('[TECHNICIAN] regionTechMap read failed:', e.message);
      }
    }

    // L3 — random fallback from saved roster
    try {
      const { technicianRoster = [] } = await chrome.storage.local.get({ technicianRoster: [] });
      if (technicianRoster.length) {
        const pick = technicianRoster[Math.floor(Math.random() * technicianRoster.length)];
        warn(`[TECHNICIAN] target=null region=${region || 'null'} resolved="${pick}" source=random_fallback warning=NO_TECHNICIAN_DATA`);
        return { name: pick, source: 'random_fallback', warning: 'NO_TECHNICIAN_DATA' };
      }
    } catch(e) {
      warn('[TECHNICIAN] roster read failed:', e.message);
    }

    warn('[TECHNICIAN] source=failed warning=EMPTY_ROSTER');
    return { name: null, source: 'failed', warning: 'EMPTY_ROSTER' };
  }

  async function selectRandomTechnician(targetName = null, region = null) {
    // Skip if technician subgrid already has records
    const existing = await hasExistingSubgridRow(/الفنيين|Technicians/i);
    if (existing) {
      log('Technician subgrid already has rows — skipping');
      return { ok: true, name: '(موجود مسبقاً)', source: 'existing' };
    }

    // Resolve who to pick (L1 → L2 → L3)
    const resolved = await resolveTechnician(targetName, region);
    if (!resolved.name) {
      warn('Technician resolution failed (EMPTY_ROSTER) — skipping technician step');
      return { ok: false, reason: 'empty-roster', source: resolved.source };
    }
    if (resolved.warning) {
      warn(`⚠️ Technician random fallback used. warning=${resolved.warning}`);
    }
    const wantedTech = resolved.name;

    log(`Selecting technician: "${wantedTech}" (source: ${resolved.source})`);
    log('Looking for Add-Technician button...');
    const allBtns = Array.from(document.querySelectorAll('a, button, input[type="button"]')).filter(b => b.offsetParent !== null);
    const techBtns = allBtns.filter(b => /فن|tech/i.test((b.innerText||b.title||b.value||'').trim()));
    log(`Found ${techBtns.length} tech-related buttons`);

    // For L1 (exact input) keep strict mode; for L2/L3 allow roster pick
    const strictMode = resolved.source === 'input_exact';
    const res = await window.AutoFillEngine.Lookups.handlePage2Modal(
      /[اإأ]ضاف[ةه]\s*فن|Add.*Tech/i,
      wantedTech,
      strictMode ? { strictExact: true } : {}
    );
    if (res && res.ok) return { ...res, source: resolved.source };
    log('handlePage2Modal failed, trying inline lookup...');

    const lab = findFieldByLabel(['الفنيين','الفني','Technician','Technicians']);
    if (!lab) { log('No technician field found on page'); return { ok: false }; }
    if (lab.tagName === 'SELECT') {
      const normTxt = s => (s || '').replace(/\s+/g, '').toLowerCase();
      // Try exact match first, then any option as fallback for L3
      const exactOpt = Array.from(lab.options).find(o => o.value && normTxt(o.text) === normTxt(wantedTech));
      const opt = exactOpt || (resolved.source !== 'input_exact' ? Array.from(lab.options).find(o => o.value) : null);
      if (!opt) {
        warn(`Technician "${wantedTech}" not found in select options`);
        return { ok: false, reason: 'technician-not-found' };
      }
      // Save names from select options to roster
      try {
        const names = Array.from(lab.options).filter(o => o.value).map(o => o.text.trim());
        const { technicianRoster: ex = [] } = await chrome.storage.local.get({ technicianRoster: [] });
        await chrome.storage.local.set({ technicianRoster: [...new Set([...ex, ...names])] });
      } catch(_) {}
      await emulateUserInput(lab, opt.value);
      return { ok: true, name: opt.text, source: resolved.source };
    }

    const btn = window.AutoFillEngine.Lookups.findSafeLookupButton(lab, ['.lookup-technician button', '.lookup-btn']);
    if (btn) {
      if (typeof window.dispatchClickSequence === 'function') {
        await window.dispatchClickSequence(btn);
      } else {
        btn.click();
      }
      await sleep(2000);
      const modalEls = Array.from(document.querySelectorAll('.modal table tbody tr, .modal-body table tbody tr td:first-child'))
        .filter(i => i.offsetParent !== null && i.innerText.trim() && !/norecords|لاتوجد/.test(i.innerText.replace(/\s/g,'')));
      if (modalEls.length) {
        // Pull roster from live modal rows
        await _pullRosterFromModal(document.querySelector('.modal.show, .modal.in'));
        const nrmRow = s => (s || '').replace(/\s+/g, '').toLowerCase();
        const exactItem = modalEls.find(i => nrmRow(i.innerText.trim()) === nrmRow(wantedTech));
        // For L3 random fallback, pick any available if exact not found
        const item = exactItem || (resolved.source !== 'input_exact' ? modalEls[Math.floor(Math.random() * modalEls.length)] : null);
        if (!item) {
          warn(`Technician "${wantedTech}" not found in lookup modal, closing`);
          const closeX = document.querySelector('.modal.show [data-dismiss="modal"]');
          if (closeX) { if (typeof window.dispatchClickSequence === 'function') await window.dispatchClickSequence(closeX); else closeX.click(); }
          return { ok: false, reason: 'technician-not-found' };
        }
        const radio = item.querySelector('input[type="radio"], input[type="checkbox"]');
        if (radio) {
          if (typeof window.dispatchClickSequence === 'function') await window.dispatchClickSequence(radio); else radio.click();
        } else {
          if (typeof window.dispatchClickSequence === 'function') await window.dispatchClickSequence(item); else item.click();
        }
        await sleep(300);
        const sels = Array.from(document.querySelectorAll('.modal button.btn-primary, .modal input.btn-primary, .modal input[value="اختر"], .modal input[value="Select"], .modal button[aria-label*="Select"], .modal button[aria-label*="اختر"]'));
        const selectBtn = sels.reverse().find(b => b.offsetParent !== null);
        if (selectBtn) {
          try { selectBtn.focus(); } catch(_) {}
          if (typeof window.dispatchClickSequence === 'function') await window.dispatchClickSequence(selectBtn); else selectBtn.click();
        }
        return { ok: true, name: item.innerText.trim(), source: resolved.source };
      }
      const closeBtn = document.querySelector('.modal.show [data-dismiss="modal"]');
      if (closeBtn) { if (typeof window.dispatchClickSequence === 'function') await window.dispatchClickSequence(closeBtn); else closeBtn.click(); }
    }
    return { ok: false };
  }

  // ════════════════════════════════════════════════════════════════════
  //  توقيت ديناميكي بين المشاكل والفنيين (بدل الانتظار الثابت)
  // ════════════════════════════════════════════════════════════════════
  function anyPageModalOpen() {
    try {
      return Array.from(document.querySelectorAll('.modal.in, section.modal.in, .modal.show'))
        .some(m => m.offsetParent !== null);
    } catch (_) { return false; }
  }

  function techAddButtonExists() {
    try {
      return Array.from(document.querySelectorAll('a, button, input[type="button"]'))
        .some(b => b.offsetParent !== null && /[اإأ]ضاف[ةه]\s*فن|Add.*Tech/i.test((b.innerText || b.title || b.value || '').trim()));
    } catch (_) { return false; }
  }

  // ترجع فورًا بمجرد أن تصبح إضافة الفنيين جاهزة:
  // (مودال المشكلة مغلق فعليًا + زر إضافة الفنيين ظاهر) — أقصر زمن ممكن.
  // لو الزر لم يظهر خلال 600ms من إغلاق المودال، نتابع دون تعطيل التدفق.
  async function waitForProblemToTechReady(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let closedAt = 0;
    while (Date.now() < deadline) {
      if (!anyPageModalOpen()) {
        if (techAddButtonExists()) return true;
        if (!closedAt) closedAt = Date.now();
        if (Date.now() - closedAt >= 600) return true;
      }
      await sleep(120);
    }
    return false;
  }

  async function waitForModalsToClose(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!anyPageModalOpen()) return true;
      await sleep(120);
    }
    return !anyPageModalOpen();
  }

  // ════════════════════════════════════════════════════════════════════
  //  حل كود المشكلة الموحّد (الاوتو فيلينج + الكنترول بانل)
  //  ① كود البيانات المخزنة  ② قائمة البوابة (مسموح فقط)
  //  ③ انتظار اختيار المستخدم  ④ عند انتهاء المهلة: لا اختيار تلقائي — القائمة تبقى للمستخدم
  // ════════════════════════════════════════════════════════════════════
  const PROBLEM_BTN_REGEX = /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i;
  const PROBLEM_EXCLUDE = /ترصيد|تجار|ارضي|أرضي|بلاغ|GI00|GS08|GR05|SR00|SR01|WM04/i;

  async function resolveActualProblem(requestedCode, opts = {}) {
    const PC = window.ProblemCodes;
    const lookups = window.AutoFillEngine && window.AutoFillEngine.Lookups;
    if (!lookups || typeof lookups.handleSubgridIframeModal !== 'function') {
      return { ok: false, reason: 'lookups-unavailable' };
    }
    if (PC && typeof PC.loadRules === 'function') {
      try { await PC.loadRules(); } catch (_) {}
    }
    const device = opts.device || '';
    const priority = opts.priority || null;
    const exclude = opts.exclude || PROBLEM_EXCLUDE;
    const service = (PC && typeof PC.normalizeService === 'function') ? PC.normalizeService(opts.service) : '';
    const family = (PC && typeof PC.familyOf === 'function') ? PC.familyOf(device) : '';

    // تحذير تشخيصي فقط: الكود المطلوب غير موجود في الكتالوج (قد يكون كودًا قديمًا).
    if (PC && typeof PC.isKnownCode === 'function' && requestedCode
      && !PC.isKnownCode(String(requestedCode).replace(/^\*+/, ''))) {
      log('[Problem] ⚠️ requested code is not in problem-catalog: ' + requestedCode);
    }

    // ⓪ هل الكود المطلوب يخص هذا الجهاز/هذه الخدمة؟
    let requestedCompatible = !!requestedCode;
    if (requestedCode && PC) {
      if (!_familyMatches(requestedCode, device)) {
        requestedCompatible = false;
        warn('[Problem] ⛔ كود من عائلة أخرى: ' + requestedCode + ' | الجهاز: ' + (device || '?') + ' — سيُستبدل من قائمة البوابة');
      }
      const reqSvc = /تركيب/i.test(String(requestedCode)) ? 'install' : '';
      if (requestedCompatible && service && reqSvc && reqSvc !== service) {
        requestedCompatible = false;
        warn('[Problem] ⛔ كود لنوع خدمة مختلف: ' + requestedCode + ' | المطلوب: ' + service + ' — سيُستبدل من قائمة البوابة');
      }
    }

    // ① المحاولة بكود البيانات المخزنة (فقط لو مطابق للجهاز/الخدمة)
    let res = null;
    if (requestedCompatible) {
      res = await lookups.handleSubgridIframeModal(PROBLEM_BTN_REGEX, requestedCode, false, exclude, priority);
      if (res && res.ok) {
        if (PC) PC.recordOutcome(requestedCode, device, true, { service, family });
        return { ok: true, name: res.name, code: requestedCode, source: 'stored' };
      }
      // فشل لسبب غير «عدم وجود الكود»؟ لا معنى لقائمة الاختيار.
      const reason = (res && res.reason) || 'failed';
      if (reason !== 'no-match') {
        return { ok: false, reason, available: [] };
      }
    }

    // ② قائمة ما تعرضه البوابة فعلًا — ممنوع + عائلة + نوع خدمة
    const available = (res && Array.isArray(res.available)) ? res.available : [];
    const compat = (PC && typeof PC.filterCompatible === 'function')
      ? PC.filterCompatible(available, { device, family, service })
      : { list: (PC ? PC.filterAllowed(available) : available.filter(x => !PROBLEM_EXCLUDE.test(x))), stats: {} };
    let allowed = compat.list;
    let fromCatalog = false;

    // لا صف مطابق في ما يعرضه المودال ⇒ بديل من كتالوج العائلة نفسها (لا من عائلة أخرى أبدًا)
    if (!allowed.length && PC && typeof PC.allowedCodesForDevice === 'function') {
      const pool = PC.allowedCodesForDevice(device, null, { service }) || [];
      if (pool.length) {
        allowed = pool.slice();
        fromCatalog = true;
        log(`[Problem] لا صف مطابق في البوابة — بديل من الكتالوج (${allowed.length} كودًا للعائلة ${family || '?'})`);
      }
    }
    if (!allowed.length) {
      return {
        ok: false,
        reason: (requestedCode && !requestedCompatible) ? 'incompatible-requested-code' : 'no-allowed-or-available',
        available,
        stats: compat.stats
      };
    }
    log(`[Problem] requested="${requestedCode || '—'}" — ${allowed.length} خيارًا مطابقًا (استُبعد: عائلة ${compat.stats.family || 0} / خدمة ${compat.stats.service || 0} / ممنوع ${compat.stats.forbidden || 0})`);

    // ③ عرض القائمة وانتظار اختيار المستخدم (أو انتهاء المهلة)
    let chosen = null;
    if (PC && typeof PC.requestUserPick === 'function') {
      chosen = await PC.requestUserPick(allowed, { device, requestedCode, service, family });
    }
    let source = 'user-pick';
    if (!chosen) {
      // لا اختيار تلقائي (طلب المستخدم): انتهاء المهلة يعني «اتركها للمستخدم»،
      // والقائمة تبقى معروضة في اللوحة لإضافتها يدويًا. لا نضيف كودًا لم يختره أحد.
      log('[Problem] ⏳ انتهت مهلة الاختيار بدون تدخل — لن يُختار كود تلقائيًا');
      return { ok: false, reason: 'pick-timeout', needsPick: true, available: allowed, fromCatalog, stats: compat.stats };
    }

    // ④ إضافة الكود المختار (تدوير بين المسموح)
    const chosenCode = PC ? PC.codeOf(chosen) : String(chosen).split(/\s+[-–]\s+/)[0].trim();
    log(`[Problem] adding picked code: "${chosenCode}" (${source})`);
    res = await lookups.handleSubgridIframeModal(PROBLEM_BTN_REGEX, chosenCode, false, exclude, priority);
    if (PC) PC.recordOutcome(chosenCode, device, !!(res && res.ok));
    return {
      ok: !!(res && res.ok),
      name: (res && res.name) || chosenCode,
      code: chosenCode,
      source,
      reason: (res && res.reason) || '',
      available: allowed
    };
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
    const service = isInstall ? 'install' : 'maintenance';
    
    // For Second Visit & Masaha: use problemCode from profile directly
    const isProfileMode = data.secondVisitMode || data.masahaMode;
    const probCode = isProfileMode && data.problemCode ? data.problemCode : (data.problemCode || await getProblemCode(deviceName, isInstall));
    if (probCode) {
      log('Adding Actual Problem: ' + probCode);
      const priorityActualProblem = /Premium\s*care|بريميم.?كير|تركيب/i;
      try {
        const probRes = await resolveActualProblem(probCode, {
          device: deviceName,
          service,
          priority: priorityActualProblem
        });
        if (probRes && probRes.ok) {
          FR.problem = { ok: true, selected: probRes.name, code: probRes.code, source: probRes.source };
          log('Problem added: ' + probRes.name + ' [' + probRes.source + ']');
        } else {
          warn('Problem modal failed or no match. probRes:', JSON.stringify(probRes));
          FR.problem = { ok: false, reason: (probRes && probRes.reason) || '' };
        }
      } catch (e) {
        warn('resolveActualProblem error:', e && e.message);
        FR.problem = { ok: false, reason: (e && e.message) || 'error' };
      }
    } else {
      warn('Could not determine Problem Code for device:', deviceName);
    }

    // توقيت ديناميكي: ننتظر فقط حتى تُحفظ المشكلة فعليًا ويظهر زر الفنيين.
    const readyForTech = await waitForProblemToTechReady(8000);
    log('Problem→Technician ready (dynamic): ' + readyForTech);

    const targetTech = data.technicianName || data.technician || null;
    const targetRegion = data.region || data.منطقة || data.area || (await readRegionFromPage()) || null;
    if (targetRegion) {
      await registerRegion(targetRegion);
    }
    log('Adding Technician: ' + (targetTech || 'NOT SPECIFIED') + ' | Region: ' + (targetRegion || 'NOT SPECIFIED'));
    let techRes = await selectRandomTechnician(targetTech, targetRegion);
    if (!techRes || !techRes.ok) {
      log('Technician failed, retrying after modals settle...');
      await waitForModalsToClose(3000);
      techRes = await selectRandomTechnician(targetTech, targetRegion);
    }
    if (techRes && techRes.ok && techRes.name) {
      try {
        const { technicianRoster = [] } = await chrome.storage.local.get({ technicianRoster: [] });
        const cleanN = techRes.name.replace(/\s+/g, ' ').trim();
        if (cleanN && !technicianRoster.includes(cleanN)) {
          await chrome.storage.local.set({ technicianRoster: [...technicianRoster, cleanN] });
        }
      } catch(_) {}
      if (targetRegion) {
        await registerRegion(targetRegion, techRes.name);
      }
    }
    FR.technician = { ok: techRes?.ok || false, selected: techRes?.name, source: techRes?.source };
    log(techRes?.ok ? `Technician added: ${techRes.name} (${techRes.source})` : 'Technician failed');

    log('【 PAGE 2 DONE 】 Results:', FR);
    return { report: { fieldResults: FR } };
  }

  const Page2 = {
    getProblemCode,
    getSmartProblemCode,
    hasExistingSubgridRow,
    readRegionFromPage,
    registerRegion,
    resolveTechnician,
    selectRandomTechnician,
    resolveActualProblem,
    waitForProblemToTechReady,
    waitForModalsToClose,
    executePage2_FollowUp
  };

  window.AutoFillEngine.Page2 = Page2;
  Object.assign(window, Page2);

})(window);
