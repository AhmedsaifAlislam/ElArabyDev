// ============================================================================
// AutoFill Engine — Orchestrator Subsystem
// File: modules/autofill/engine-orchestrator.js
// Responsibilities:
// - Task Data Normalization (merging TaskModel.payload, data, and line)
// - Queue Progression & Lifecycle (startNextTask, clearCurrentTask)
// - Tab Lock & Affinity (processingTabId check and claim)
// - Order Discovery & Navigation (findOrderAndOpen, workflow execution)
// - Multi-Step Router Execution (runSingleLineWithRouter: Page 1 -> 2 -> 3)
// - Automatic Page Load Queue Processing (processQueueOnLoad)
// - Chrome Runtime Message Handling (RUN_SINGLE, START_QUEUE, STOP_QUEUE, etc.)
// - Session Lifecycle Tracking
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Orchestrator]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Orchestrator]', ...args); }
  function err(...args) { if (typeof window.err === 'function') window.err(...args); else console.error('[Orchestrator]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }
  function storageGet(q) { return (typeof window.storageGet === 'function') ? window.storageGet(q) : chrome.storage.local.get(q); }
  function storageSet(items) { return (typeof window.storageSet === 'function') ? window.storageSet(items) : chrome.storage.local.set(items); }
  function storageRemove(keys) { return (typeof window.storageRemove === 'function') ? window.storageRemove(keys) : chrome.storage.local.remove(keys); }
  function traceEvent(name, data) { if (typeof window.traceEvent === 'function') window.traceEvent(name, data); }
  function sendSmartLog(ev, meta) { if (typeof window.sendSmartLog === 'function') window.sendSmartLog(ev, meta); }
  function showPageToast(msg, type) { if (typeof window.showPageToast === 'function') window.showPageToast(msg, type); }
  function getPageType() { return (typeof window.getPageType === 'function') ? window.getPageType() : 'UNKNOWN'; }
  function loadSelectors() { return (typeof window.loadSelectors === 'function') ? window.loadSelectors() : Promise.resolve({}); }
  function findFirst(sel) { return (typeof window.findFirst === 'function') ? window.findFirst(sel) : null; }
  function safeClick(el, label) { if (typeof window.safeClick === 'function') window.safeClick(el, label); else el?.click(); }
  function emulateUserInput(el, val) { return (typeof window.emulateUserInput === 'function') ? window.emulateUserInput(el, val) : Promise.resolve(); }
  function parseDataLine(line) {
    if (typeof window.parseDataLine === 'function' && window.parseDataLine !== parseDataLine) {
      return window.parseDataLine(line);
    }
    if (!line || typeof line !== 'string') return {};
    const obj = {};
    const parts = line.includes('|') ? line.split('|') : line.split(',');
    parts.forEach(p => {
      const i = p.indexOf(':');
      if (i < 0) return;
      obj[p.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')] = p.slice(i + 1).trim();
    });
    const parsed = {
      orderId: obj['orderid'] || obj['order'] || line.match(/\bCAS\d{10,}\b/i)?.[0] || '',
      brand: obj['brand'] || obj['علامهتجاريه'] || '',
      model: obj['model'] || obj['موديل'] || '',
      serial: obj['serial'] || obj['serialnumber'] || '',
      model2: obj['model2'] || '',
      serial2: obj['serial2'] || '',
      status: obj['status'] || obj['حالة'] || '',
      date: obj['date'] || obj['تاريخ'] || '',
      reportType: obj['reporttype'] || obj['report'] || '',
      date2: obj['date2'] || '',
      problemCode: obj['problemcode'] || obj['problem'] || '',
      faultCode: obj['faultcode'] || obj['fault'] || '',
      subFaultCode: obj['subfault'] || null,
      notes: obj['notes'] || obj['ملاحظات'] || '',
      technician: obj['technician'] || obj['الفني'] || obj['الفنى'] || '',
      technicianName: obj['technicianname'] || obj['اسمالفني'] || obj['اسمالفنى'] || ''
    };

    if (parsed.model2 && parsed.date && parsed.date2) {
      try {
        const toDate = (d) => { const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(m[3], m[2]-1, m[1]) : new Date(d); };
        const d1 = toDate(parsed.date), d2 = toDate(parsed.date2);
        if (d2 > d1) parsed.date = parsed.date2;
      } catch(_) {}
    }
    return parsed;
  }
  function waitForSaveComplete(url, cfg) { return (typeof window.waitForSaveComplete === 'function') ? window.waitForSaveComplete(url, cfg) : Promise.resolve(true); }

  const ORDERS_URL = 'https://elarabyportalpfs.powerappsportals.com/Orders/';
  let _routerRunning = false;

  // ── TASK NORMALIZATION ───────────────────────────────────────────────────────
  function normalizeTaskData(task) {
    let raw = task.line || task;
    let parsed = typeof raw === 'string' ? parseDataLine(raw) : (raw || {});
    let payload = (task.payload && typeof task.payload === 'object') ? task.payload : {};
    let legacyData = (task.data && typeof task.data === 'object') ? task.data : {};

    // Merged hierarchy: parsed line < legacy data < structured payload
    const merged = Object.assign({}, parsed, legacyData, payload);

    // Explicit semantic flags
    merged.orderId = merged.orderId || task.orderId || extractOrderIdFromLine(typeof raw === 'string' ? raw : '');
    merged.secondVisitMode = Boolean(merged.secondVisitMode || legacyData.secondVisitMode);
    merged.masahaMode = Boolean(merged.masahaMode || legacyData.masahaMode || merged.notes === 'مساحة');
    merged.forceDrainCleaning = Boolean(merged.forceDrainCleaning || legacyData.forceDrainCleaning);
    merged.shahnEnabled = Boolean(merged.shahnEnabled ?? legacyData.shahnEnabled);
    merged.forceOverwrite = Boolean(merged.forceOverwrite || legacyData.forceOverwrite);

    return merged;
  }

  function extractOrderIdFromLine(line) {
    if (!line || typeof line !== 'string') return null;
    const m1 = line.match(/orderid\s*:\s*([^\s|,]+)/i);
    if (m1) return m1[1].trim();
    const m2 = line.match(/(CAS\d{10,}|WO-?\d+)/i);
    if (m2) return m2[1];
    const tokens = line.trim().split(/[\s|,]+/);
    return tokens[0] || null;
  }

  function generateTaskId() {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  function buildTasksFromLines(lines) {
    const tasks = [];
    const seen = new Set();
    for (const line of lines) {
      const oid = extractOrderIdFromLine(line) || line.trim().substring(0, 30);
      if (seen.has(oid)) continue;
      seen.add(oid);
      tasks.push({
        taskId: generateTaskId(),
        orderId: oid,
        line: line,
        data: { forceDrainCleaning: false, shahnEnabled: false, forceOverwrite: false }
      });
    }
    return tasks;
  }

  // ── STATUS NOTIFICATIONS ────────────────────────────────────────────────────
  function notifyStatus(taskId, status, message) {
    const u = { taskId, status, message, timestamp: Date.now() };
    storageSet({ lastStatusUpdate: u });
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...u }).catch(()=>{});
  }

  async function clearCurrentTask() {
    await storageRemove(['currentTask']);
  }

  async function startNextTask(queue) {
    if (!queue || queue.length === 0) {
      notifyStatus('batch', 'batch-done', 'اكتمل Batch');
      chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
      return;
    }
    const task = queue[0];
    const taskId = task?.taskId;
    const orderId = task?.orderId;
    const tabId = (typeof chrome !== 'undefined' && chrome.runtime?.id) ? chrome.runtime.id : null;
    
    traceEvent('QUEUE_WRITE_ATTEMPT', { taskId, orderId, tabId });
    
    const setResult = await storageSet({ currentTask: task, taskQueue: queue.slice(1) });
    if (!setResult.ok) {
      traceEvent('QUEUE_WRITE_FAILED', { 
        taskId, 
        orderId, 
        expectedTaskId: taskId, 
        expectedOrderId: orderId, 
        expectedPresent: true, 
        actualPresent: false, 
        storageError: setResult.error 
      });
      return;
    }
    
    const readResult = await storageGet({ currentTask: null });
    const stored = readResult.currentTask;
    const storedPresent = !!stored;
    const taskIdMatch = storedPresent && stored.taskId === taskId;
    const orderIdMatch = storedPresent && stored.orderId === orderId;
    const verified = storedPresent && taskIdMatch && orderIdMatch;
    
    if (!verified) {
      traceEvent('QUEUE_WRITE_FAILED', { 
        taskId, 
        orderId, 
        expectedTaskId: taskId, 
        expectedOrderId: orderId, 
        expectedPresent: true, 
        actualPresent: storedPresent, 
        actualTaskId: stored?.taskId, 
        actualOrderId: stored?.orderId,
        taskIdMatch,
        orderIdMatch,
        storageError: readResult.error 
      });
      return;
    }
    
    traceEvent('QUEUE_WRITE_VERIFIED', { taskId, orderId, tabId });
    traceEvent('QUEUE_HANDOFF_EXPECTED', { taskId, orderId, tabId });
    
    traceEvent('CURRENT_TASK_SET', { taskId: task?.taskId, orderId: task?.orderId, queueLength: queue.length - 1 });
    traceEvent('OPEN_NEXT_TAB_REQUEST', { url: ORDERS_URL });
    try {
      await chrome.runtime.sendMessage({ type: 'OPEN_NEXT_TAB', url: ORDERS_URL });
    } catch(e) {
      location.href = ORDERS_URL;
    }
  }

  // ── PAGE DETECTOR ───────────────────────────────────────────────────────────
  async function getActivePageFeature() {
    const isVisible = el => el && el.offsetParent !== null;
    const has = id => isVisible(document.getElementById(id));
    const hasSel = s => isVisible(document.querySelector(s));

    if (has('ldv_serialnumber') || has('ldv_actualmodel_name') || has('ats_producttypebrand_name') || hasSel('.page-1-marker')) return 'PAGE_1';
    if (has('workorderProblem') || has('caseresources') || has('ats_sparepartsstatus') || hasSel('.page-2-marker')) return 'PAGE_2';
    if (has('WorkOrder_defect') || has('InventoryAdjustmentProduct_Subgrid') || has('WorkOrderDefectIsLscYes_Subgrid') || hasSel('.page-3-marker')) return 'PAGE_3';

    // Text-based fallback
    const text = (document.body?.innerText || '').toLowerCase();
    if (text.includes('البيانات الاساسية') || text.includes('basic information')) return 'PAGE_1';
    if (text.includes('المشاكل الفعلية') || text.includes('actual problems')) return 'PAGE_2';
    if (text.includes('تقرير الاصلاح') || text.includes('resolution report') || text.includes('قطع الغيار')) return 'PAGE_3';

    return 'UNKNOWN';
  }

  function showOverlay(report) {
    const id = 'autofill-done-overlay';
    let el = document.getElementById(id);
    if (el) el.remove();
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;bottom:24px;left:24px;background:#17334c;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.3);z-index:999999;font-family:Segoe UI,Tahoma,sans-serif;font-size:13px;direction:rtl;border:1px solid rgba(255,255,255,0.15);';
    el.innerHTML = `<strong>تم الانتهاء:</strong> ${report.orderNumber || ''} <span style="color:#22c55e;margin-right:8px;">مكتمل بنجاح</span>`;
    document.body.appendChild(el);
    setTimeout(() => { if (el && el.parentNode) el.remove(); }, 6000);
  }

  function showMasahaOverlay() {
    const id = 'autofill-masaha-overlay';
    let el = document.getElementById(id);
    if (el) el.remove();
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#1e293b;padding:16px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:999999;font-family:Segoe UI,Tahoma,sans-serif;font-size:14px;font-weight:600;direction:rtl;text-align:center;border:2px solid #d97706;';
    el.innerHTML = `<div>تعبئة تقرير المساحة مكتملة</div><div style="font-size:12px;font-weight:normal;margin-top:6px;">يرجى إرفاق صورة المساحة يدوياً ثم الضغط على "حفظ و اغلاق"</div>`;
    document.body.appendChild(el);
  }

  // ── WORKFLOW ENGINE ──────────────────────────────────────────────────────────
  async function executeWorkflow(workflowName, context, cfg) {
    const steps = cfg.workflows?.[workflowName];
    if (!steps) return false;
    log(`[Engine] Starting workflow: ${workflowName}`);
    for (const step of steps) {
      let selectors = cfg[step.target] || [step.target];
      let value = step.value ? step.value.replace('{{orderId}}', context.orderId) : '';
      let matchText = step.matchText ? step.matchText.replace('{{orderId}}', context.orderId) : '';

      if (step.action === 'wait') {
        let found = null;
        for (let i = 0; i < (step.timeout || 10000)/500; i++) {
          found = findFirst(selectors);
          if (found) break;
          await sleep(500);
        }
        if (!found) { warn(`[Engine] Wait timeout for ${step.target}`); return false; }
      }
      else if (step.action === 'type') {
        const el = findFirst(selectors);
        if (!el) return false;
        await emulateUserInput(el, value);
        try { el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true })); } catch(_) {}
      }
      else if (step.action === 'click') {
        const el = findFirst(selectors);
        if (!el) return false;
        safeClick(el, step.target);
      }
      else if (step.action === 'click_row') {
        let rowFound = false;
        for (let i = 0; i < (step.timeout || 12000)/500; i++) {
          const rows = Array.from(document.querySelectorAll('tr, .entitylist-items > li, [role="row"]'));
          const targetRow = rows.find(r => (r.innerText||'').includes(matchText));
          if (targetRow) {
            rowFound = true;
            let clicked = false;
            for (const sel of selectors) {
              const btn = targetRow.querySelector(sel);
              if (btn) { safeClick(btn, step.target); clicked = true; break; }
            }
            if (!clicked) {
               const a = targetRow.querySelector('a[href]');
               if (a) { safeClick(a, 'Fallback Link in Row'); }
               else { safeClick(targetRow, 'Row directly'); }
            }
            break;
          }
          await sleep(500);
        }
        if (!rowFound) {
          const a = Array.from(document.querySelectorAll('a[href]')).find(l => (l.innerText||'').includes(matchText) || (l.href||'').toLowerCase().includes(matchText.toLowerCase()));
          if (a) { safeClick(a, 'Fallback Global Link'); }
          else { warn(`[Engine] Row matching ${matchText} not found`); return false; }
        }
      }
      await sleep(400);
    }
    return true;
  }

  // ── ORDER FIND & OPEN ────────────────────────────────────────────────────────
  async function findOrderAndOpen(orderId, cfg) {
    try {
      const { currentTask } = await storageGet({ currentTask: null });
      if (currentTask) notifyStatus(currentTask.taskId, 'searching', `جاري البحث عن رقم الأمر...`);
    } catch (_) {}

    await sleep(cfg._ordersSearchWait || 2000);

    if (cfg.workflows?.page1_search) {
      const success = await executeWorkflow('page1_search', { orderId }, cfg);
      if (success) return true;
      warn('[Engine] Workflow failed or timed out. Falling back to legacy search logic.');
    }

    const searchEl = findFirst(cfg.ordersSearchInput);
    if (searchEl) {
      searchEl.focus();
      searchEl.value = orderId;
      try { searchEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      ['keydown','keypress','keyup'].forEach(k => {
        try { searchEl.dispatchEvent(new KeyboardEvent(k, { key:'Enter', keyCode:13, bubbles:true })); } catch(_) {}
      });
      const searchBtn = findFirst(cfg.ordersSearchBtn);
      if (searchBtn) searchBtn.click();
      await sleep(2000);
    }

    const rs = cfg.ordersTableRow || ['table tbody tr','[role="row"]','.entitylist-items > li'];
    const start = Date.now();
    while (Date.now() - start < 8000) {
      let rows = [];
      for (const c of rs) try { rows.push(...Array.from(document.querySelectorAll(c))); } catch(_) {}
      for (const row of [...new Set(rows)]) {
        if ((row.innerText||'').includes(orderId)) {
          const v = (cfg.ordersViewLink || []).join(',');
          const vl = v ? row.querySelector(v) : null;
          if (vl) { safeClick(vl, 'View Link'); return true; }
          const a = row.querySelector('a[href]');
          if (a) { safeClick(a, 'View Link a'); return true; }
          safeClick(row, 'Row');
          return true;
        }
      }
      await sleep(500);
    }

    const a = Array.from(document.querySelectorAll('a[href]')).find(l => l.innerText?.includes(orderId) || l.href?.toLowerCase().includes(orderId.toLowerCase()));
    if (a) { safeClick(a, 'Fallback Link'); return true; }
    return false;
  }

  // ── ROUTER EXECUTION ────────────────────────────────────────────────────────
  async function runSingleLineWithRouter(task) {
    if (_routerRunning) {
      log('Router already running — skipping duplicate call');
      return { report: {}, isFullyDone: false, skipped: true };
    }
    _routerRunning = true;
    try {
      return await _runSingleLineWithRouterInner(task);
    } finally {
      _routerRunning = false;
    }
  }

  async function _runSingleLineWithRouterInner(task) {
    const cfg = await loadSelectors();
    const data = normalizeTaskData(task);

    log('Router started. forceDrainCleaning=' + !!data.forceDrainCleaning + ' shahnEnabled=' + !!data.shahnEnabled + ' forceOverwrite=' + !!data.forceOverwrite + ' reportType=' + (data.reportType || 'N/A') + ' problemCode=' + (data.problemCode || 'N/A') + ' faultCode=' + (data.faultCode || 'N/A'));
    let resFR = {}, saveResult = { ok: false };

    if (window.AutoFillEngine.Page1?.isInstallationReport && window.AutoFillEngine.Page1.isInstallationReport()) {
      log('INSTALLATION DETECTED: Executing explicit setup.');
      const res = await window.AutoFillEngine.Page1.performInstallationAndCommissioning(data);
      return { report: res.report, isFullyDone: true };
    }

    let feature = await getActivePageFeature();

    if (feature === 'PAGE_1') {
      await sleep(800);
      if (!data.forceOverwrite && window.AutoFillEngine.Page1?.isPage1AlreadyFilled && window.AutoFillEngine.Page1.isPage1AlreadyFilled(cfg)) {
        warn('Page 1 already has data — marking task as done and skipping to next order.');
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'done', 'مكتمل مسبقاً — تخطي');
        } catch(_) {}
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: { skipped: { ok: true } }, saveResult: { ok: true, skipped: true }, skippedReason: 'already-filled' };
        return { report, isFullyDone: true };
      }

      const res1 = await window.AutoFillEngine.Page1.executePage1_Review(data, cfg);
      Object.assign(resFR, res1.report.fieldResults);

      const nBtn = document.getElementById('NextButton') || findFirst(cfg.nextBtn) || Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(b => /next|التالي/i.test((b.innerText||b.value||b.title||'').trim()) && !/cancel|إلغاء/i.test(b.className));
      if (nBtn) {
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'navigating', 'جاري الانتقال للصفحة الثانية...');
        } catch(_) {}
        log('Clicking Next to load PAGE 2');
        nBtn.click();
      } else {
        warn('Next button not found on PAGE 1');
      }

      log('Waiting for Page 2...');
      const sw = Date.now();
      let p2Loaded = false;
      while(Date.now() - sw < 10000) {
        if (await getActivePageFeature() === 'PAGE_2') { p2Loaded = true; break; }
        await sleep(1000);
      }

      if (!p2Loaded) {
        log('Page 2 did not load inline. Probably full reload or validation error.');
        return { report: { fieldResults: resFR }, isFullyDone: false };
      }
      feature = 'PAGE_2';
    }

    if (feature === 'PAGE_2') {
      const res2 = await window.AutoFillEngine.Page2.executePage2_FollowUp(data, cfg);
      Object.assign(resFR, res2.report.fieldResults);

      const isInstall = /تركيب/.test(data.reportType) || (window.AutoFillEngine.Page1?.isInstallationReport && window.AutoFillEngine.Page1.isInstallationReport());
      let needsPage3 = data.forceDrainCleaning || data.faultCode || (/تنظيف|صرف/.test(data.reportType) || /تنظيف|صرف/.test(data.notes || '')) || isInstall;
      log(`needsPage3=${needsPage3} | forceDrain=${!!data.forceDrainCleaning} | faultCode=${data.faultCode||'N/A'} | isInstall=${isInstall}`);

      if (!needsPage3) {
        log('PAGE 3 is not needed. Clicking Save/Next to finalize on Page 2.');
        const nBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /next|التالي|save|حفظ|submit/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|إلغاء/i.test(b.className) && b.offsetParent !== null);
        let isSaved = false;
        if (nBtn) {
          const startUrl = location.href;
          try { nBtn.focus(); } catch(_) {}
          nBtn.click();
          isSaved = await waitForSaveComplete(startUrl, cfg);
        }
        const saveRes = nBtn
          ? { ok: !!isSaved, timeout: !isSaved, verifiedVia: 'waitForSaveComplete' }
          : { ok: false, reason: 'save-button-not-found' };
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult: saveRes, serviceFilled: !!resFR['تركيب'], technician: resFR['technician']?.selected };
        return { report, isFullyDone: true };
      }

      const nBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /next|التالي|save|حفظ|submit/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|إلغاء/i.test(b.className) && b.offsetParent !== null);
      if (nBtn) {
        log('Clicking Next/Save on PAGE 2 to go to PAGE 3');
        const startUrl = location.href;
        try { nBtn.focus(); } catch(_) {}
        nBtn.click();

        let isSaved = await waitForSaveComplete(startUrl, cfg);
        let p3Loaded = false;
        if (!isSaved) {
          const newFeat = await getActivePageFeature();
          if (newFeat === 'PAGE_3') p3Loaded = true;
        }

        if (isSaved) {
          saveResult = { ok: true };
        } else if (p3Loaded) {
          feature = 'PAGE_3';
        } else {
          log('PAGE 2 ended but neither PAGE 3 nor Save detected.');
          return { report: { fieldResults: resFR }, isFullyDone: false };
        }
      } else {
        warn('Next/Save button not found on PAGE 2');
        return { report: { fieldResults: resFR }, isFullyDone: false };
      }
    }

    if (feature === 'PAGE_3') {
      const res3 = await window.AutoFillEngine.Page3.executePage3_Resolution(data, cfg);
      Object.assign(resFR, res3.report.fieldResults);

      if (data.masahaMode || data.notes === 'مساحة') {
        log('PAGE 3 filled (مساحة). Waiting for user to attach image and save manually.');
        showMasahaOverlay();
        saveResult = { ok: true, masahaPending: true };
      } else {
        log('PAGE 3 filled. Clicking Save/Submit.');
        const saveBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button')).find(b => /save|حفظ|submit|إرسال/i.test((b.textContent + (b.value||'') + (b.getAttribute('aria-label')||'')).trim()) && !/cancel|إلغاء/i.test(b.className) && b.offsetParent !== null);
        let isSaved = false;
        if (saveBtn) {
          const startUrl = location.href;
          try { saveBtn.focus(); } catch(_) {}
          saveBtn.click();
          isSaved = await waitForSaveComplete(startUrl, cfg);
        } else {
          warn('Save button not found on PAGE 3');
        }

        saveResult = saveBtn
          ? { ok: !!isSaved, timeout: !isSaved, verifiedVia: 'waitForSaveComplete' }
          : { ok: false, reason: 'save-button-not-found' };
      }
    }

    const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, fieldResults: resFR, saveResult, serviceFilled: !!resFR['تركيب'], technician: resFR['technician']?.selected };
    try { await chrome.runtime.sendMessage({ type: 'SAVE_REPORT', payload: report }); } catch(_) {}
    showOverlay(report);
    return { report, isFullyDone: true };
  }

  // ── TAB LOCK & QUEUE PROCESSOR ──────────────────────────────────────────────
  async function processQueueOnLoad() {
    traceEvent('PROCESS_QUEUE_ON_LOAD_ENTER', { url: location.href });
    log('[QUEUE_TRACE] phase=processQueueOnLoad url="' + location.href + '"');
    await sleep(500);
    const { currentTask, processingTabId } = await storageGet({ currentTask: null, processingTabId: null });
    log('[QUEUE_TRACE] phase=storage currentTask=' + (currentTask ? 'yes' : 'no') + ' taskId="' + (currentTask?.taskId || '') + '" orderId="' + (currentTask?.orderId || '') + '" processingTabId="' + (processingTabId || '') + '"');
    traceEvent('PROCESS_QUEUE_STORAGE_READ', { currentTaskPresent: !!currentTask, taskId: currentTask?.taskId, orderId: currentTask?.orderId, processingTabId: processingTabId || null });
    if (!currentTask) {
      traceEvent('PROCESS_QUEUE_ABORT', { reason: 'no_current_task', url: location.href });
      log('[QUEUE_TRACE] phase=guard result=return reason=no_current_task url="' + location.href + '"');
      return;
    }

    // Tab Lock checking with race-condition retry
    let myTabId = null;
    log('[QUEUE_TRACE] phase=tab_lock myTabId="pending" processingTabId="' + (processingTabId || '') + '" pageType="' + getPageType() + '" url="' + location.href + '"');
    if (processingTabId) {
      const myTabIdResp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r));
      myTabId = myTabIdResp?.tabId || null;
      if (!myTabId) log('[QUEUE_TRACE] phase=tab_id result=warning reason=get_my_tab_id_failed processingTabId="' + (processingTabId || '') + '"');
      else log('[QUEUE_TRACE] phase=tab_lock myTabId="' + myTabId + '" processingTabId="' + processingTabId + '" pageType="' + getPageType() + '"');
      if (myTabId && myTabId !== processingTabId) {
        log('[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="' + myTabId + '" processingTabId="' + processingTabId + '" pageType="' + getPageType() + '"');
        await sleep(1500);
        const retry = await storageGet({ processingTabId: null });
        const updatedId = retry.processingTabId;
        log('[QUEUE_TRACE] phase=tab_lock result=retry_check updatedId="' + (updatedId || '') + '" myTabId="' + myTabId + '"');
        if (updatedId && myTabId !== updatedId) {
          const pCheck = getPageType();
          log('[QUEUE_TRACE] phase=tab_lock result=decision pCheck="' + pCheck + '" myTabId="' + myTabId + '" updatedId="' + updatedId + '"');
          if (pCheck === 'ORDERS') {
            log(`Tab Lock race on ORDERS: claiming lock for tab ${myTabId} (was ${updatedId})`);
            await storageSet({ processingTabId: myTabId });
          } else {
            log(`Tab Lock: This tab (${myTabId}) is not the active processing tab (${updatedId}). Ignoring.`);
            log('[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="' + myTabId + '" processingTabId="' + updatedId + '" pageType="' + pCheck + '"');
            return;
          }
        } else if (updatedId) {
          log(`Tab Lock resolved after wait: ${myTabId} == ${updatedId}`);
        }
      }
    } else {
      log('[QUEUE_TRACE] phase=tab_lock result=no_lock_yet url="' + location.href + '"');
      const myTabIdResp2 = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r));
      myTabId = myTabIdResp2?.tabId || null;
      if (!myTabId) log('[QUEUE_TRACE] phase=tab_id result=warning reason=get_my_tab_id_failed_no_lock');
      else log('[QUEUE_TRACE] phase=tab_lock myTabId="' + myTabId + '" pageType="' + getPageType() + '" result=claim_check');
      if (myTabId && getPageType() === 'ORDERS') {
        log('[QUEUE_TRACE] phase=tab_lock result=claim myTabId="' + myTabId + '"');
        await storageSet({ processingTabId: myTabId });
      }
    }

    const p = getPageType();
    const cfg = await loadSelectors();
    log('[QUEUE_TRACE] phase=page_type result="' + p + '" url="' + location.href + '" orderId="' + (currentTask?.orderId || '') + '" taskId="' + (currentTask?.taskId || '') + '"');
    traceEvent('PAGE_TYPE_DETECTED', { pageType: p, url: location.href, taskId: currentTask?.taskId, orderId: currentTask?.orderId });
    document.body.dataset.isAutofilling = 'true';
    sendSmartLog('TASK_START', { orderId: currentTask.orderId, mode: currentTask.mode || 'search' });

    if (p === 'ORDERS') {
      traceEvent('FIND_ORDER_START', { taskId: currentTask.taskId, orderId: currentTask.orderId });
      log('[QUEUE_TRACE] phase=workflow action=findOrderAndOpen taskId="' + currentTask.taskId + '" orderId="' + currentTask.orderId + '"');
      notifyStatus(currentTask.taskId, 'searching', `البحث عن: ${currentTask.orderId}`);
      if (!await findOrderAndOpen(currentTask.orderId, cfg)) {
        traceEvent('FIND_ORDER_FAILURE', { taskId: currentTask.taskId, orderId: currentTask.orderId });
        sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'not-found', mode: currentTask.mode || 'search' });
        delete document.body.dataset.isAutofilling;
        notifyStatus(currentTask.taskId, 'not-found', `لم يُعثر : ${currentTask.orderId}`);
        await finalizeOrderInSession(currentTask, { error: 'not-found' }, 'not-found');
        await clearCurrentTask();
        const { taskQueue, taskDelay: td1 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
        await sleep(td1);
        if (taskQueue.length > 0) {
          await startNextTask(taskQueue);
        } else {
          notifyStatus('batch', 'batch-done', 'اكتمل Batch');
          await finalizeSession();
          chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
        }
        return;
      }
      traceEvent('FIND_ORDER_SUCCESS', { taskId: currentTask.taskId, orderId: currentTask.orderId });
      notifyStatus(currentTask.taskId, 'navigating', 'جارٍ الانتقال...');
    } else if (p === 'WORK_ORDER_REVIEW') {
      traceEvent('AUTOFILL_START', { taskId: currentTask.taskId, orderId: currentTask.orderId });
      log('[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="' + currentTask.taskId + '" orderId="' + currentTask.orderId + '"');
      notifyStatus(currentTask.taskId, 'filling', `جاري التفريغ لـ: ${currentTask.orderId}`);
      try {
        const { taskRetryFlag } = await storageGet({ taskRetryFlag: false });
        const routerRes = await runSingleLineWithRouter(currentTask);
        if (routerRes && routerRes.isFullyDone) {
          const ok = routerRes.report?.saveResult?.ok;
          sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: ok, mode: currentTask.mode || 'search' });
          delete document.body.dataset.isAutofilling;
          notifyStatus(currentTask.taskId, ok ? 'done' : 'save-failed', ok ? 'اكتمل' : 'لم يتأكد');
          await finalizeOrderInSession(currentTask, routerRes.report, ok ? 'done' : 'save-failed');

          await storageRemove(['taskRetryFlag']);
          await clearCurrentTask();
          const { taskQueue, taskDelay: td2 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
          if (taskQueue.length > 0) {
            await sleep(td2);
            await startNextTask(taskQueue);
          } else {
            notifyStatus('batch', 'batch-done', 'اكتمل Batch');
            await finalizeSession();
            chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
          }
        } else if (routerRes && routerRes.isManualStop) {
          log('Manual stop requested. Pausing here.');
          notifyStatus(currentTask.taskId, 'stopped', 'بانتظار الإكمال اليدوي');
          await finalizeOrderInSession(currentTask, routerRes.report, 'stopped');
          await storageRemove(['taskRetryFlag']);
          await clearCurrentTask();
        } else {
          if (!taskRetryFlag) {
            log('Page 1 incomplete. Retrying once...');
            notifyStatus(currentTask.taskId, 'filling', 'إعادة المحاولة...');
            await storageSet({ taskRetryFlag: true });
            location.reload();
          } else {
            warn('Retry failed. Skipping to next task.');
            sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'retry-failed', mode: currentTask.mode || 'search' });
            delete document.body.dataset.isAutofilling;
            notifyStatus(currentTask.taskId, 'error', 'فشل — تخطي للتالي');
            await finalizeOrderInSession(currentTask, routerRes.report, 'error');
            await storageRemove(['taskRetryFlag']);
            await clearCurrentTask();
            const { taskQueue: q2, taskDelay: td3 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
            if (q2.length > 0) {
              await sleep(td3);
              await startNextTask(q2);
            } else {
              notifyStatus('batch', 'batch-done', 'اكتمل Batch');
              await finalizeSession();
              chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
            }
          }
        }
      } catch (e) {
        err('Unexpected error in router: ' + e);
        if (currentTask) sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: false, reason: 'error', mode: currentTask.mode || 'search' });
        delete document.body.dataset.isAutofilling;
        notifyStatus(currentTask?.taskId, 'error', 'خطأ غير متوقع — تخطي للتالي');
        if (currentTask) await finalizeOrderInSession(currentTask, { error: e.toString() }, 'error');
        await clearCurrentTask();
        const { taskQueue: qErr, taskDelay: td5 = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
        if (qErr.length > 0) {
          await sleep(td5);
          await startNextTask(qErr);
        } else {
          notifyStatus('batch', 'batch-done', 'اكتمل Batch');
          await finalizeSession();
          chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
        }
      }
    } else {
      log('[QUEUE_TRACE] phase=page_type result=redirect target="ORDERS_URL" url="' + location.href + '" orderId="' + (currentTask?.orderId || '') + '"');
      location.href = ORDERS_URL;
    }
  }

  // ── SESSION TRACKING ─────────────────────────────────────────────────────────
  async function openSession(batchId, tasks) {
    if (typeof window.openSession === 'function' && window.openSession !== openSession) {
      return await window.openSession(batchId, tasks);
    }
    const session = {
      batchId,
      startTime: new Date().toISOString(),
      totalTasks: tasks.length,
      orders: {},
      status: 'running'
    };
    await storageSet({ currentSession: session });
  }

  async function finalizeOrderInSession(task, report, status) {
    if (typeof window.finalizeOrderInSession === 'function' && window.finalizeOrderInSession !== finalizeOrderInSession) {
      return await window.finalizeOrderInSession(task, report, status);
    }
    const { currentSession } = await storageGet({ currentSession: null });
    if (!currentSession) return;
    currentSession.orders[task.orderId] = {
      taskId: task.taskId,
      status,
      completedAt: new Date().toISOString(),
      technician: report?.technician || null,
      saveOk: report?.saveResult?.ok ?? null
    };
    await storageSet({ currentSession });
  }

  async function finalizeSession() {
    if (typeof window.finalizeSession === 'function' && window.finalizeSession !== finalizeSession) {
      return await window.finalizeSession();
    }
    const { currentSession, sessionHistory = [] } = await storageGet({ currentSession: null, sessionHistory: [] });
    if (!currentSession) return;
    currentSession.endTime = new Date().toISOString();
    currentSession.status = 'completed';
    sessionHistory.push(currentSession);
    if (sessionHistory.length > 20) sessionHistory.shift();
    await storageSet({ currentSession: null, sessionHistory });
  }

  // ── CHROME MESSAGE HANDLER ──────────────────────────────────────────────────
  function registerMessageListener() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg?.action) return;
      (async () => {
        try {
          if (msg.action === 'RUN_SINGLE') {
            traceEvent('RUN_SINGLE_RECEIVED', { tabId: null, taskId: msg.task?.taskId, orderId: msg.task?.orderId });
            sendResponse({ ok: true });
            traceEvent('ROUTER_START', { taskId: msg.task?.taskId, orderId: msg.task?.orderId });
            await runSingleLineWithRouter(msg);
          }
          else if (msg.action === 'START_QUEUE') {
            traceEvent('START_QUEUE_RECEIVED', { tabId: msg.tabId, queueLength: msg.tasks?.length });
            const tasks = msg.tasks || [];
            const batchId = 'batch-' + Date.now();
            await openSession(batchId, tasks);

            await storageSet({
              taskQueue: tasks.slice(1),
              taskResults: [],
              processingTabId: msg.tabId,
              taskDelay: msg.delay || 800
            });
            await storageRemove(['taskRetryFlag']);
            await clearCurrentTask();
            traceEvent('QUEUE_INITIALIZED', { queueLength: msg.tasks?.length });
            sendResponse({ ok: true });
            traceEvent('START_NEXT_TASK_ENTER', { queueLength: msg.tasks?.length });
            await startNextTask(tasks);
          }
          else if (msg.action === 'STOP_QUEUE') {
            await storageSet({ taskQueue: [] });
            await storageRemove(['taskRetryFlag']);
            await clearCurrentTask();
            notifyStatus('batch', 'stopped', 'تم إيقاف الكل');
            await finalizeSession();
            sendResponse({ ok: true });
          }
          else if (msg.action === 'SKIP_TASK') {
            const { taskQueue, currentTask } = await storageGet({ taskQueue: [], currentTask: null });
            await storageRemove(['taskRetryFlag']);
            const skippedId = msg.taskId;
            notifyStatus(skippedId, 'stopped', 'تم التخطي');
            if (currentTask) await finalizeOrderInSession(currentTask, { skippedReason: 'user-skipped' }, 'skipped');
            await clearCurrentTask();
            if (taskQueue.length > 0) {
              const { taskDelay: td4 = 800 } = await storageGet({ taskDelay: 800 });
              await sleep(td4);
              await startNextTask(taskQueue);
            } else {
              notifyStatus('batch', 'batch-done', 'اكتمل Batch');
              await finalizeSession();
              chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
            }
            sendResponse({ ok: true });
          }
          else if (msg.action === 'EXTRACT_DEVICE_DATA') {
            if (typeof window.startDeviceDataExtraction === 'function') {
              window.startDeviceDataExtraction();
            }
            sendResponse({ ok: true });
          }
          else if (msg.action === 'QUICK_PASTE_BATCH') {
            sendResponse({ ok: true });
            setTimeout(async () => {
              let text = '';
              try { text = await navigator.clipboard.readText(); } catch(_) { text = ''; }
              if (!text) { showPageToast('الحافظة فارغة', 'error'); return; }
              const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              if (!lines.length) { showPageToast('لا توجد بيانات في الحافظة', 'error'); return; }
              const tasks = buildTasksFromLines(lines);
              if (!tasks.length) { showPageToast('لم يتم التعرف على Order IDs', 'error'); return; }
              showPageToast(`بدء التشغيل — ${tasks.length} مهمة`, 'success');
              const batchId = 'batch-' + Date.now();
              await openSession(batchId, tasks);
              await storageSet({ taskQueue: tasks.slice(1), taskResults: [], taskDelay: 2000 });
              await startNextTask(tasks);
            }, 100);
            return;
          }
          else if (msg.action === 'OPEN_TECH_REVIEW') {
            const currentUrl = window.location.href;
            if (currentUrl.includes('Reportdetail')) {
              window.location.href = currentUrl.replace('Reportdetail', 'technicalreviewdetails');
            } else if (currentUrl.includes('workorderreview')) {
              window.location.href = currentUrl.replace('workorderreview', 'technicalreviewdetails');
            } else if (currentUrl.includes('technicalreviewdetails')) {
              showPageToast('أنت بالفعل في صفحة المراجعة الفنية', 'success');
            } else {
              showPageToast('افتح بلاغ أولاً', 'warn');
            }
            sendResponse({ ok: true });
          }
          else if (msg.action === 'CLEAR_DEVICE_DATA') {
            const mode = msg.mode || 'all';
            if (window.AutoFillEngine.Page1?.clearAllDeviceFields) {
              window.AutoFillEngine.Page1.clearAllDeviceFields(mode).then(result => sendResponse(result));
            } else {
              sendResponse({ ok: false });
            }
          }
          else {
            // Unhandled action
          }
        } catch (_) {
          sendResponse({ ok: false });
        }
      })();
      return true;
    });
  }

  // ── EXPORTS ──────────────────────────────────────────────────────────────────
  const Orchestrator = {
    normalizeTaskData,
    extractOrderIdFromLine,
    generateTaskId,
    buildTasksFromLines,
    notifyStatus,
    clearCurrentTask,
    startNextTask,
    getActivePageFeature,
    showOverlay,
    showMasahaOverlay,
    executeWorkflow,
    findOrderAndOpen,
    runSingleLineWithRouter,
    processQueueOnLoad,
    openSession,
    finalizeOrderInSession,
    finalizeSession,
    registerMessageListener
  };

  window.AutoFillEngine.Orchestrator = Orchestrator;
  Object.assign(window, Orchestrator);

})(window);
