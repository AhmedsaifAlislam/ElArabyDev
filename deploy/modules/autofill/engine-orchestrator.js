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
  async function storageGet(q) {
    try {
      return await chrome.storage.local.get(q);
    } catch(e) {
      return (typeof q === 'object' && !Array.isArray(q)) ? q : {};
    }
  }
  async function storageSet(items) {
    try {
      await chrome.storage.local.set(items);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  async function storageRemove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  function traceEvent(name, data) {
    console.log(`%c[Orchestrator-Trace] [${name}]`, 'color: #10b981; font-weight: bold;', data || {});
    if (typeof window.traceEvent === 'function') window.traceEvent(name, data);
  }
  function sendSmartLog(ev, meta) { if (typeof window.sendSmartLog === 'function') window.sendSmartLog(ev, meta); }
  function showPageToast(msg, type) { if (typeof window.showPageToast === 'function') window.showPageToast(msg, type); }
  function getPageType() {
    const url = (typeof location !== 'undefined' ? location.href : '').toLowerCase();
    if (url.includes('workorderreview') || url.includes('followup')) return 'WORK_ORDER_REVIEW';
    if (url.includes('/orders')) return 'ORDERS';
    return 'OTHER';
  }
  // ── دوال مشتركة: المصدر الوحيد في shared/portal-selectors.js ──
  function loadSelectors() { return window.loadSelectors ? window.loadSelectors() : {}; }
  function findFirst(list) { return window.findFirst ? window.findFirst(list) : null; }

  function safeClick(el, label) {
    if (typeof window.safeClick === 'function' && window.safeClick !== safeClick) {
      return window.safeClick(el, label);
    }
    if (!el) return false;
    try {
      document.body.dataset.isAutofilling = 'true';
      el.focus?.();
      el.click();
      return true;
    } catch (_) {
      return false;
    }
  }
  async function emulateUserInput(el, val) {
    if (typeof window.emulateUserInput === 'function' && window.emulateUserInput !== emulateUserInput) {
      return await window.emulateUserInput(el, val);
    }
    if (!el) return;
    try { el.focus(); } catch(_) {}
    document.body.dataset.isAutofilling = 'true';
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) { try { descriptor.set.call(el, val); } catch(_) {} } else { el.value = val; }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
    await sleep(150);
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    setTimeout(() => { delete document.body.dataset.isAutofilling; }, 50);
  }
  function parseDataLine(line) { return window.parseDataLine ? window.parseDataLine(line) : {}; }
  function waitForSaveComplete(url, cfg) { return (typeof window.waitForSaveComplete === 'function') ? window.waitForSaveComplete(url, cfg) : Promise.resolve(true); }

  // ── SYNCHRONOUS MESSAGE LISTENER (registered at module load, handles PING only) ──
  // Only register in main frame to avoid duplicate handlers in iframes
  if (window === window.top) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg?.action) return;
      if (msg.action === 'PING') { sendResponse({ ok: true, version: '2.0.0', orchestrator: true }); return true; }
      // START_QUEUE, RUN_SINGLE, STOP_QUEUE, SKIP_TASK are handled by registerMessageListener()
      // called ONCE from content-script.js (main frame only)
    });
  }

  function getOrdersUrl() {
    const cur = (typeof location !== 'undefined' ? location.href : '');
    const langMatch = cur.match(/\.powerappsportals\.com\/([a-zA-Z]{2}-[a-zA-Z]{2})\//i);
    const prefix = langMatch ? `/${langMatch[1]}` : '/en-US';
    return `https://elarabyportalpfs.powerappsportals.com${prefix}/Orders/`;
  }
  const ORDERS_URL = getOrdersUrl();
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

  function generateTaskId() { return window.generateTaskId ? window.generateTaskId() : ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)); }

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
    console.log(`%c[Status] [${status}] ${taskId || ''}: ${message || ''}`, 'color: #f59e0b; font-weight: bold;', u);
    storageSet({ lastStatusUpdate: u });
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...u }).catch(()=>{});
    try {
      let badge = document.getElementById('elaraby-autofill-live-status');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'elaraby-autofill-live-status';
        badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999999;background:#17334c;color:#fff;padding:8px 14px;border-radius:8px;font-family:Segoe UI,sans-serif;font-size:12px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);direction:rtl;border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;gap:8px;';
        document.body.appendChild(badge);
      }
      badge.innerHTML = `<span>⚡ العربي ديف:</span> <span style="color:#38bdf8;">${message || status}</span>`;
      if (status === 'batch-done' || status === 'done') {
        setTimeout(() => { badge?.remove(); }, 6000);
      }
      const diagStatus = document.getElementById('elaraby-diag-status');
      if (diagStatus) diagStatus.textContent = message || status;
    } catch (_) {}
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
    traceEvent('CURRENT_TASK_SET', { taskId: task?.taskId, orderId: task?.orderId, queueLength: queue.length - 1 });
    // Keep service worker alive before storage write
    try {
        await chrome.storage.local.get('keepAlive'); // dummy read
        await chrome.storage.local.set({ currentTask: task, taskQueue: queue.slice(1) });
        traceEvent('QUEUE_WRITE_SUCCESS', { taskId: task?.taskId });
    } catch (e) {
        traceEvent('QUEUE_WRITE_FAILED', { taskId: task?.taskId, error: e && e.message ? e.message : String(e) });
        console.error('Queue write failed', e);
    }
    
    // فتح البلاغ التالي في تبويب جديد مع إبقاء التبويب الحالي مفتوحًا
    // (سلوك V1/V2 الأصلي — كل بلاغ له تبويب مستقل يُترك مفتوحًا للإكمال اليدوي)
    const targetUrl = getOrdersUrl();
    traceEvent('OPEN_NEXT_TAB_REQUEST', { url: targetUrl });
    try {
      await chrome.runtime.sendMessage({ type: 'OPEN_NEXT_TAB', url: targetUrl });
      traceEvent('OPEN_NEXT_TAB_SENT', { url: targetUrl });
    } catch (e) {
      traceEvent('OPEN_NEXT_TAB_FALLBACK', { url: targetUrl, error: e && e.message ? e.message : String(e) });
      location.href = targetUrl;
    }
  }

  // ── PAGE DETECTOR ───────────────────────────────────────────────────────────
  async function getActivePageFeature() {
    const isVisible = el => el && el.offsetParent !== null;

    // Page 3: contains fault code section or button
    const hasFaultSection = Array.from(document.querySelectorAll('label, h3, h2, h4, th')).some(el =>
      el.innerText && el.innerText.includes('أكواد الأعطال')
    );
    const hasFaultBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]')).some(el =>
      /اضاف[ةه]\s*كود\s*عطل/i.test((el.innerText || el.value || '').trim()) && isVisible(el)
    );
    if (hasFaultSection || hasFaultBtn || document.getElementById('WorkOrder_defect')) return 'PAGE_3';

    // Page 2: contains technician or problems buttons
    const hasTechBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]')).some(el =>
      /اضاف[ةه]\s*فن/i.test((el.innerText || el.value || '').trim()) && isVisible(el)
    );
    const hasProbBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]')).some(el =>
      /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]/i.test((el.innerText || el.value || '').trim()) && isVisible(el)
    );
    if (hasTechBtn || hasProbBtn || isVisible(document.getElementById('ats_sparepartsstatus'))) return 'PAGE_2';

    // Page 1: contains serial or model or brand inputs
    const hasPage1Input = document.getElementById('ldv_serialnumber') || document.getElementById('ats_producttypebrand_name') || document.getElementById('ldv_actualmodel_name');
    if (hasPage1Input && isVisible(hasPage1Input)) return 'PAGE_1';

    // Text-based fallback
    const text = (document.body?.innerText || '').toLowerCase();
    if (text.includes('تقرير الاصلاح') || text.includes('resolution report') || text.includes('قطع الغيار')) return 'PAGE_3';
    if (text.includes('المشاكل الفعلية') || text.includes('actual problems')) return 'PAGE_2';
    if (text.includes('البيانات الاساسية') || text.includes('basic information')) return 'PAGE_1';

    return 'PAGE_1';
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

  // ── «لا توجد سجلات» detection ────────────────────────────────────────────────
  // العلّة: عند البحث عن أمر غير موجود، شبكة الأوامر تعرض «لا توجد سجلات»
  // بينما الكود كان يستمر في الانتظار حتى نهاية المهلة (12s في خطوة wait
  // + 12s في click_row + 8s في المسار القديم) فيضيع ~25 ثانية لكل أمر مفقود.
  const NO_RECORDS_RE = /there are no records to display|no records to display|no records found|لا توجد سجلات|لا يوجد سجلات|لا توجد نتائج|لا توجد بيانات/i;

  function ordersGridShowsNoRecords() {
    try {
      const emptyEl = document.querySelector(
        '.empty-message, [class*="empty-message"], .entity-grid .empty-message, .view-grid .empty-message'
      );
      if (emptyEl && NO_RECORDS_RE.test(emptyEl.innerText || '')) {
        const rows = document.querySelectorAll('tbody tr[data-id], tbody tr[data-row-id], tr[data-entity]');
        if (rows.length === 0) return true;
      }
      const grid = document.querySelector('.entity-grid, #grid_openorders, .view-grid, .entitylist');
      if (grid && NO_RECORDS_RE.test(grid.innerText || '')) {
        const dataRows = grid.querySelectorAll('tbody tr[data-id], tbody tr[data-row-id], tr[data-entity]');
        if (dataRows.length === 0) return true;
      }
    } catch (_) {}
    return false;
  }

  // ينتظر جاهزية حقل البحث بدل انتظار ثابت (كان 2000ms دائمًا).
  async function waitForOrdersSearchReady(cfg, maxWaitMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      let inputOk = true;
      try { inputOk = cfg.ordersSearchInput ? !!findFirst(cfg.ordersSearchInput) : true; } catch (_) { inputOk = true; }
      let btnOk = true;
      try { btnOk = cfg.ordersSearchBtn ? !!findFirst(cfg.ordersSearchBtn) : true; } catch (_) { btnOk = true; }
      if (inputOk && btnOk) return true;
      await sleep(120);
    }
    return false;
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
        const deadline = Date.now() + (step.timeout || 10000);
        while (Date.now() < deadline) {
          found = findFirst(selectors);
          if (found) break;
          // الشبكة قالت «لا توجد سجلات» → لا فائدة من انتظار بقية المهلة
          if (ordersGridShowsNoRecords()) {
            warn(`[Engine] Grid reports no records while waiting for ${step.target}`);
            return false;
          }
          await sleep(250);
        }
        if (!found) { warn(`[Engine] Wait timeout for ${step.target}`); return false; }
      }
      else if (step.action === 'type') {
        const el = findFirst(selectors);
        if (!el) return false;
        await emulateUserInput(el, value);
        try { el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true })); } catch(_) {}
        context._typed = (context._typed || 0) + 1;
      }
      else if (step.action === 'click') {
        const el = findFirst(selectors);
        if (!el) return false;
        safeClick(el, step.target);
        if (/search/i.test(step.target || '')) context._searched = true;
      }
      else if (step.action === 'click_row') {
        let rowFound = false;
        let noRecordsHits = 0;
        const deadline = Date.now() + (step.timeout || 4000);
        while (Date.now() < deadline) {
          const rows = Array.from(document.querySelectorAll('tr, .entitylist-items > li, [role="row"]'));
          const targetRow = rows.find(r => (r.innerText||'').includes(matchText));
          if (targetRow) {
            rowFound = true;
            let clicked = false;
            for (const sel of selectors) {
              const btn = targetRow.querySelector(sel);
              if (btn) { traceEvent('ORDER_ROW_CLICKED', { branch: 'workflow-click_row', tag: btn?.tagName || null, href: btn?.getAttribute?.('href') || null }); safeClick(btn, step.target); clicked = true; break; }
            }
            if (!clicked) {
               const a = targetRow.querySelector('a[href]');
               if (a) { traceEvent('ORDER_ROW_CLICKED', { branch: 'workflow-click_row', tag: a?.tagName || null, href: a?.getAttribute?.('href') || null }); safeClick(a, 'Fallback Link in Row'); }
               else { traceEvent('ORDER_ROW_CLICKED', { branch: 'workflow-click_row', tag: targetRow?.tagName || null, href: targetRow?.getAttribute?.('href') || null }); safeClick(targetRow, 'Row directly'); }
            }
            break;
          }
          // «لا توجد سجلات»: نأكد مرتين (250ms) قبل الخروج — يحمي من وميض
          // الشبكة أثناء إعادة الرسم.
          if (ordersGridShowsNoRecords()) {
            noRecordsHits++;
            if (noRecordsHits >= 2) { warn(`[Engine] No records for ${matchText} — stopping early`); break; }
          } else {
            noRecordsHits = 0;
          }
          await sleep(250);
        }
        if (!rowFound) {
          const a = Array.from(document.querySelectorAll('a[href]')).find(l => (l.innerText||'').includes(matchText) || (l.href||'').toLowerCase().includes(matchText.toLowerCase()));
          if (a) { traceEvent('ORDER_ROW_CLICKED', { branch: 'workflow-click_row', tag: a?.tagName || null, href: a?.getAttribute?.('href') || null }); safeClick(a, 'Fallback Global Link'); }
          else { warn(`[Engine] Row matching ${matchText} not found`); return false; }
        }
      }
      await sleep(400);
    }
    return true;
  }

  // ── ORDER NAVIGATION VERIFY (diagnostic only — no behavior change) ────────────
  async function verifyOrderNavigation() {
    try {
      await sleep(2500);
      const href = location.href || '';
      traceEvent('ORDER_NAVIGATION_VERIFY', {
        navigated: /workorderreview|followup/i.test(href),
        href
      });
    } catch (_) {}
  }

  // ── ORDER FIND & OPEN ────────────────────────────────────────────────────────
  async function findOrderAndOpen(orderId, cfg) {
    console.log('%c[Orchestrator] findOrderAndOpen start for:', 'color:#3b82f6;font-weight:bold;', orderId);
    try {
      const { currentTask } = await storageGet({ currentTask: null });
      if (currentTask) notifyStatus(currentTask.taskId, 'searching', `جاري البحث عن رقم الأمر...`);
    } catch (_) {}

    await waitForOrdersSearchReady(cfg);

    let workflowSearched = false;
    if (cfg.workflows?.page1_search) {
      const wfContext = { orderId };
      const success = await executeWorkflow('page1_search', wfContext, cfg);
      if (success) { await verifyOrderNavigation(); return true; }
      workflowSearched = !!wfContext._searched;
      warn('[Engine] Workflow failed or timed out. Falling back to legacy search logic.');
    }

    // لو الـ workflow كتب رقم الأمر وضغط البحث فعلًا، فالشبكة تحدّثت بالفعل —
    // إعادة الكتابة + البحث تكلّف ~4 ثوانٍ إضافية بلا أي فائدة.
    const searchEl = workflowSearched ? null : findFirst(cfg.ordersSearchInput);
    if (searchEl) {
      searchEl.focus();
      searchEl.value = orderId;
      try { searchEl.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      ['keydown','keypress','keyup'].forEach(k => {
        try { searchEl.dispatchEvent(new KeyboardEvent(k, { key:'Enter', keyCode:13, bubbles:true })); } catch(_) {}
      });
      const searchBtn = findFirst(cfg.ordersSearchBtn);
      if (searchBtn) searchBtn.click();
      // لا انتظار ثابت: الحلقة أدناه تلتقط الصف بمجرد ظهوره وتخرج فورًا
      // عند «لا توجد سجلات».
      await sleep(300);
    }

    const rs = cfg.ordersTableRow || ['table tbody tr','[role="row"]','.entitylist-items > li'];
    const start = Date.now();
    let noRecordsHits = 0;
    while (Date.now() - start < 3000) {
      let rows = [];
      for (const c of rs) try { rows.push(...Array.from(document.querySelectorAll(c))); } catch(_) {}
      for (const row of [...new Set(rows)]) {
        if ((row.innerText||'').includes(orderId)) {
          const v = (cfg.ordersViewLink || []).join(',');
          const vl = v ? row.querySelector(v) : null;
          if (vl) {
            traceEvent('ORDER_ROW_CLICKED', { branch: 'legacy-view-link', tag: vl?.tagName || null, href: vl?.getAttribute?.('href') || null });
            vl.removeAttribute?.('target');
            if (vl.tagName === 'A' && vl.getAttribute('href') && !vl.getAttribute('href').startsWith('javascript:')) {
              location.href = vl.href;
            } else {
              safeClick(vl, 'View Link');
            }
            await verifyOrderNavigation();
            return true;
          }
          const a = row.querySelector('a[href]');
          if (a) { traceEvent('ORDER_ROW_CLICKED', { branch: 'legacy-a', tag: a?.tagName || null, href: a?.getAttribute?.('href') || null }); a.removeAttribute('target'); if (a.href && !a.href.startsWith('javascript:')) { location.href = a.href; } else { safeClick(a, 'View Link a'); } await verifyOrderNavigation(); return true; }
          traceEvent('ORDER_ROW_CLICKED', { branch: 'legacy-row', tag: row?.tagName || null, href: row?.getAttribute?.('href') || null });
          safeClick(row, 'Row');
          await verifyOrderNavigation();
          return true;
        }
      }
      // «لا توجد سجلات» مؤكدة مرتين → اخرج فورًا بدل إكمال 3 ثوانٍ كاملة
      if (ordersGridShowsNoRecords()) {
        noRecordsHits++;
        if (noRecordsHits >= 2) {
          warn(`[Engine] Grid reports no records for ${orderId} — aborting search early`);
          break;
        }
      } else {
        noRecordsHits = 0;
      }
      await sleep(250);
    }

    const a = Array.from(document.querySelectorAll('a[href]')).find(l => l.innerText?.includes(orderId) || l.href?.toLowerCase().includes(orderId.toLowerCase()));
    if (a) { traceEvent('ORDER_ROW_CLICKED', { branch: 'fallback', tag: a?.tagName || null, href: a?.getAttribute?.('href') || null }); a.removeAttribute('target'); if (a.href && !a.href.startsWith('javascript:')) { location.href = a.href; } else { safeClick(a, 'Fallback Link'); } await verifyOrderNavigation(); return true; } return false;
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
    traceEvent('ROUTER_FEATURE', { feature });

    if (feature === 'PAGE_1') {
      await sleep(800);
      // ⚠️ استثناء «الزيارة الثانية» (مطابقة V2):
      //    V2 كان يُلغي التخطي في هذا الوضع — content-script.js L1306:
      //      `if (isPage1AlreadyFilled(cfg) && task.mode !== 'secondVisit')`
      //    و L1315-1318: «Always fill Page 1 in secondVisit mode (even if partially filled)».
      //    بدون الاستثناء: أمر «زيارة ثانية» سبق معالجته (فيه رقم مسلسل) تُتخطّى صفحته
      //    الأولى بالكامل، فلا يُكتب تاريخ الضمان ولا العلامة/الموديل، ثم يرفض السيرفر الحفظ:
      //    «تاريخ الضمان must have a valid date format. Example: {1}»
      const page1Filled = window.AutoFillEngine.Page1?.isPage1AlreadyFilled
        ? window.AutoFillEngine.Page1.isPage1AlreadyFilled(cfg)
        : false;
      if (page1Filled && data.secondVisitMode) {
        log('Page 1 partially filled — Second Visit mode: filling remaining fields anyway (V2 parity).');
      }
      if (!data.forceOverwrite && !data.secondVisitMode && page1Filled) {
        warn('Page 1 already has data — marking task as done and skipping to next order.');
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'skipped', 'مسجل مسبقاً — تخطي');
        } catch(_) {}
        const existingPortalData = (window.AutoFillEngine.Page1?.extractExistingPage1Data && window.AutoFillEngine.Page1.extractExistingPage1Data()) || {
          serial: document.getElementById('ldv_serialnumber')?.value || '',
          brand: document.getElementById('ats_producttypebrand_name')?.value || '',
          model: document.getElementById('ldv_actualmodel_name')?.value || ''
        };
        const report = { timestamp: new Date().toISOString(), url: location.href, customer: findFirst(cfg.customer)?.innerText?.trim(), orderNumber: data.orderId, filled: data, existingPortalData, fieldResults: { skipped: { ok: true } }, saveResult: { ok: true, skipped: true }, skippedReason: 'already-filled' };
        return { report, isFullyDone: true };
      }

      const res1 = await window.AutoFillEngine.Page1.executePage1_Review(data, cfg);
      Object.assign(resFR, res1.report.fieldResults);

      if (window.AutoFillEngine.Lookups?.waitForModalCloseIfOpen) {
        await window.AutoFillEngine.Lookups.waitForModalCloseIfOpen();
      }
      await sleep(500);

      const nBtn = document.getElementById('NextButton') || findFirst(cfg.nextBtn) || Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(b => /next|التالي/i.test((b.innerText||b.value||b.title||'').trim()) && !/cancel|إلغاء/i.test(b.className));
      if (nBtn) {
        try {
          const { currentTask } = await storageGet({ currentTask: null });
          if (currentTask) notifyStatus(currentTask.taskId, 'navigating', 'جاري الانتقال للصفحة الثانية...');
        } catch(_) {}
        log('Clicking Next to load PAGE 2');
        safeClick(nBtn, 'NextButton PAGE 1'); try { nBtn.click(); } catch(_) {}
        try { nBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch(_) {}
      } else {
        warn('Next button not found on PAGE 1');
      }

      log('Waiting for Page 2...');
      const sw = Date.now();
      let p2Loaded = false;
      while (Date.now() - sw < 18000) {
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
      // V2 — content-script.js L1355: الزيارة الثانية تذهب دائمًا للصفحة الثالثة
      // (أكواد العطل / قطع الغيار) حتى لو لم يكن هناك faultCode.
      let needsPage3 = data.secondVisitMode || data.forceDrainCleaning || data.faultCode || (/تنظيف|صرف/.test(data.reportType) || /تنظيف|صرف/.test(data.notes || '')) || isInstall;
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
    if (window !== window.top) return;
    traceEvent('PROCESS_QUEUE_ON_LOAD_ENTER', { url: location.href });
    log('[QUEUE_TRACE] phase=processQueueOnLoad url="' + location.href + '"');
    await sleep(500);
    const { currentTask, processingTabId } = await chrome.storage.local.get({ currentTask: null, processingTabId: null });
    if (!currentTask) {
      traceEvent('PROCESS_QUEUE_ABORT', { reason: 'no_current_task', url: location.href });
      log('[QUEUE_TRACE] phase=guard result=return reason=no_current_task url="' + location.href + '"');
      return;
    }

    let activeTabLock = processingTabId;
    if (activeTabLock) {
      const myTabIdResp = await new Promise(r => {
        try { chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r); } catch(_) { r(null); }
      });
      if (myTabIdResp && myTabIdResp.tabId && myTabIdResp.tabId !== activeTabLock) {
        await sleep(400);
        const fresh = await chrome.storage.local.get({ processingTabId: null });
        if (fresh.processingTabId) activeTabLock = fresh.processingTabId;
      }
      if (myTabIdResp && myTabIdResp.tabId && activeTabLock && myTabIdResp.tabId !== activeTabLock) {
        log('⛔ Tab Lock: This tab (' + myTabIdResp.tabId + ') is not the active processing tab (' + activeTabLock + '). Ignoring.');
        return;
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
        // أمر مفقود: لا شيء ينتظر — لا نحمّل المستخدم تأخير المهمة العادي
        await sleep(Math.min(td1, 250));
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
          const isSkippedFilled = routerRes.report?.skippedReason === 'already-filled';
          const ok = isSkippedFilled ? true : !!routerRes.report?.saveResult?.ok;
          const statusText = isSkippedFilled ? 'skipped' : (ok ? 'done' : 'save-failed');
          const messageText = isSkippedFilled ? 'مسجل مسبقاً ⏭️ (تخطي)' : (ok ? 'اكتمل' : 'لم يتأكد');
          sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: ok, skipped: isSkippedFilled, reason: isSkippedFilled ? 'already-filled' : null, mode: currentTask.mode || 'search' });
          delete document.body.dataset.isAutofilling;
          notifyStatus(currentTask.taskId, statusText, messageText);
          await finalizeOrderInSession(currentTask, routerRes.report, statusText);

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
            log("Page 1 incomplete. Waiting 1.5s then retrying inline...");
            await sleep(1500);
            const retryRes = await runSingleLineWithRouter(currentTask);
            if (retryRes && retryRes.isFullyDone) {
              const isSkippedFilled = retryRes.report?.skippedReason === 'already-filled';
              const ok = isSkippedFilled ? true : !!retryRes.report?.saveResult?.ok;
              const statusText = isSkippedFilled ? 'skipped' : (ok ? 'done' : 'save-failed');
              const messageText = isSkippedFilled ? 'مسجل مسبقاً ⏭️ (تخطي)' : (ok ? 'اكتمل' : 'لم يتأكد');
              sendSmartLog('TASK_COMPLETE', { orderId: currentTask.orderId, success: ok, skipped: isSkippedFilled, reason: isSkippedFilled ? 'already-filled' : null, mode: currentTask.mode || 'search' });
              delete document.body.dataset.isAutofilling;
              notifyStatus(currentTask.taskId, statusText, messageText);
              await finalizeOrderInSession(currentTask, retryRes.report, statusText);
              await storageRemove(['taskRetryFlag']);
              await clearCurrentTask();
              const { taskQueue: qRetry, taskDelay: tdRetry = 800 } = await storageGet({ taskQueue: [], taskDelay: 800 });
              if (qRetry.length > 0) {
                await sleep(tdRetry);
                await startNextTask(qRetry);
              } else {
                notifyStatus('batch', 'batch-done', 'اكتمل Batch');
                await finalizeSession();
                chrome.runtime.sendMessage({ type: 'BATCH_DONE_STORAGE' }).catch(()=>{});
              }
              return;
            }
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

  // ── SESSION ENGINE (V2 Compatible: activeSession & sessionLogs) ─────────
  async function openSession(batchId, tasks) {
    try {
      const session = {
        id: batchId || 'session-' + Date.now(),
        startTime: new Date().toISOString(),
        endTime: null,
        totalTasks: tasks.length,
        orders: []
      };
      await chrome.storage.local.set({ activeSession: session });
      log('🟢 Session opened:', session.id);
    } catch (e) { warn('openSession error', e); }
  }

  async function finalizeOrderInSession(task, report, status) {
    try {
      const { activeSession } = await chrome.storage.local.get('activeSession');
      if (!activeSession) return;
      
      let pageDetails = {};
      try {
        if (typeof window.scrapeFullOrderDetails === 'function') {
          pageDetails = await window.scrapeFullOrderDetails(report?.filled || task?.data || {});
        }
      } catch(e) { warn('scrapeFullOrderDetails error', e); }

      const existingIdx = (activeSession.orders || []).findIndex(o => o.orderId === task.orderId);
      
      const orderData = {
        orderId: task.orderId,
        status: status,
        timestamp: new Date().toISOString(),
        injectedData: report?.filled || task?.data || {},
        existingPortalData: report?.existingPortalData || null,
        fieldResults: report?.fieldResults || {},
        saveResult: report?.saveResult || {},
        pageDetails,
        technician: report?.technician || report?.fieldResults?.technician?.selected || null,
        serviceFilled: report?.serviceFilled || false,
        problemSelected: report?.fieldResults?.problem?.selected || null,
        report: report || {},
        originalTask: task
      };
      
      if (existingIdx > -1) {
        activeSession.orders[existingIdx] = orderData;
      } else {
        activeSession.orders.push(orderData);
      }
      
      await chrome.storage.local.set({ activeSession });
      log('📥 Order finalized in session:', task.orderId, status);
    } catch (e) { warn('finalizeOrderInSession error', e); }
  }

  async function finalizeSession() {
    try {
      const { activeSession, sessionLogs = [] } = await chrome.storage.local.get(['activeSession', 'sessionLogs']);
      if (!activeSession) return;
      
      activeSession.endTime = new Date().toISOString();
      sessionLogs.push(activeSession);
      
      await chrome.storage.local.set({ sessionLogs, activeSession: null });
      log('🔴 Session finalized and saved:', activeSession.id);
      chrome.runtime.sendMessage({ type: 'NEW_LOG' }).catch(()=>{});
    } catch (e) { warn('finalizeSession error', e); }
  }

  // ── CHROME MESSAGE HANDLER ──────────────────────────────────────────────────
  let _fullListenerRegistered = false;
  function registerMessageListener() {
    if (_fullListenerRegistered || window !== window.top) {
      traceEvent('MESSAGE_LISTENER_SKIP_DUPLICATE', { reason: 'already_registered' });
      return;
    }
    _fullListenerRegistered = true;
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

  // Auto-register immediately in main frame (matching V2 architecture)
  if (window === window.top) {
    registerMessageListener();
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
  // لا تُكتب على الدوال الموجودة أصلاً على النافذة (مثلاً من portal-selectors.js)
  Object.keys(Orchestrator).forEach(function (key) {
    if (!window[key]) window[key] = Orchestrator[key];
  });

})(window);
