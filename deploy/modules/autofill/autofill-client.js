// =========================================================
// autofill-client.js — Auto-Fill Client Orchestrator
// Component: Task Construction, Queue Dispatch & Status Polling
// =========================================================
'use strict';

(() => {
  // DOM References
  const searchInput      = document.getElementById('search-input');
  const searchCsvInput   = document.getElementById('search-csv-input');
  const searchFileDrop   = document.getElementById('search-file-drop');
  const searchDelaySlider= document.getElementById('search-delay-slider');
  const searchDelayLabel = document.getElementById('search-delay-label');
  const btnSearchSingle  = document.getElementById('btn-search-single');
  const btnSearchBatch   = document.getElementById('btn-search-batch');
  const btnSearchStop    = document.getElementById('btn-search-stop');
  const searchStatusMsg  = document.getElementById('search-status-msg');
  const searchProgressW  = document.getElementById('search-progress-wrap');
  const searchProgressB  = document.getElementById('search-progress-bar');
  const searchCounter    = document.getElementById('search-batch-counter');
  const taskList         = document.getElementById('task-list');

  // Client State
  let isBatchSearching   = false;
  let taskItems          = {};   // taskId -> div element
  let statusPollInterval = null;
  let _storageListener   = null;

  const PENDING_MESSAGES = new Map();

  const STATUS_ICON = {
    pending:    '⏳',
    searching:  '🔍',
    navigating: '🔗',
    filling:    '✍️',
    done:       '✅',
    'save-failed': '⚠️',
    'not-found':'❌',
    error:      '❌',
    opened:     '📄',
    stopped:    '⏭',
    skipped:    '⏭',
  };

  const escapeHtml = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/`/g, "&#96;");

  function setSearchStatus(text, type = 'info') {
    if (!searchStatusMsg) return;
    searchStatusMsg.className = `status-msg ${type}`;
    const icons = { info: 'ℹ️', ok: '✅', error: '❌', warn: '⚠️' };
    searchStatusMsg.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(text)}</span>`;
  }

  function setSearchStatusHtml(html, type = 'info') {
    if (!searchStatusMsg) return;
    searchStatusMsg.className = `status-msg ${type}`;
    searchStatusMsg.innerHTML = html;
  }

  function parseLines(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }

  function parseLineToObject(line) {
    const obj = {}; 
    const parts = line.includes('|') ? line.split('|') : line.split(',');
    parts.forEach(p => { 
      const i = p.indexOf(':'); 
      if (i < 0) return; 
      obj[p.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')] = p.slice(i + 1).trim(); 
    });
    return obj;
  }

  function extractOrderId(line) {
    const m1 = line.match(/orderid\s*:\s*([^\s|,]+)/i);
    if (m1) return m1[1].trim();
    const m2 = line.match(/(CAS\d{10,}|WO-?\d+)/i);
    if (m2) return m2[1];
    return null;
  }

  // إنشاء معرف مهمة فريد (من النافذة المشتركة في portal-selectors.js)
  function generateTaskId() {
    return window.generateTaskId ? window.generateTaskId() : ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  }

  function isPortalTab(tab) {
    if (!tab) return false;
    return tab.url?.includes('powerappsportals.com') || tab.url?.includes('elarabyportalpfs');
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(tabId, message, timeout = 300000) {
    const isLongRunning = message?.action === 'RUN_SINGLE' || message?.action === 'START_QUEUE';
    const effectiveTimeout = isLongRunning ? 300000 : (timeout || 30000);

    return new Promise(resolve => {
      const msgId = `${message?.action || 'unknown'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timer = setTimeout(() => {
        PENDING_MESSAGES.delete(msgId);
        resolve({ error: `timeout (${effectiveTimeout/1000}s) — تأكد من فتح صفحة البوابة وانتظر تحميلها` });
      }, effectiveTimeout);

      const cleanup = () => {
        clearTimeout(timer);
        PENDING_MESSAGES.delete(msgId);
      };

      PENDING_MESSAGES.set(msgId, cleanup);

      chrome.tabs.sendMessage(tabId, message, resp => {
        cleanup();
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('Receiving end does not exist')) {
            resolve({ error: 'السكربت لم يُحمّل بعد — أعد تحميل صفحة البوابة وأعد المحاولة' });
          } else {
            resolve({ error: msg || 'خطأ غير معروف' });
          }
        } else {
          resolve(resp || { error: 'no-response' });
        }
      });
    });
  }

  window.addEventListener('beforeunload', () => {
    for (const cleanup of PENDING_MESSAGES.values()) {
      cleanup();
    }
    PENDING_MESSAGES.clear();
  });

  // ── CSV File Handling ─────────────────────────────────────
  function setupFileDrop(dropZone, fileInput, targetTextarea) {
    if (!dropZone || !fileInput || !targetTextarea) return;
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      if (e.dataTransfer?.files?.[0]) readFile(e.dataTransfer.files[0], targetTextarea, dropZone);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) readFile(fileInput.files[0], targetTextarea, dropZone);
    });
  }

  function readFile(file, targetEl, dropZone) {
    const reader = new FileReader();
    reader.onload = e => {
      targetEl.value = e.target.result.trim();
      if (dropZone) dropZone.textContent = `✅ تم تحميل: ${file.name}`;
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ── Task Items & UI State ─────────────────────────────────
  function setBatchSearchUI(active) {
    isBatchSearching = active;
    if (btnSearchSingle) btnSearchSingle.disabled = active;
    if (btnSearchBatch)  btnSearchBatch.disabled  = active;
    if (btnSearchStop)   btnSearchStop.disabled   = !active;
    searchProgressW?.classList.toggle('visible', active);
    searchCounter?.classList.toggle('visible', active);
  }

  function updateSearchProgress(done, total, success, failed) {
    if (searchProgressB) {
      searchProgressB.style.width = total > 0 ? ((done / total) * 100) + '%' : '0%';
    }
    if (searchCounter) {
      searchCounter.textContent = `${done}/${total} — نجح: ${success} | فشل: ${failed}`;
    }
  }

  function getResultMessage(result) {
    return {
      done: '✅ تم الحفظ',
      'save-failed': '⚠️ لم يتأكد الحفظ',
      'not-found': '❌ غير موجود',
      error: '❌ خطأ',
      opened: '📄 مفتوح',
      stopped: '⛔ توقف',
      skipped: '⏭ تخطي'
    }[result] || result;
  }

  function updateTaskItem(taskId, status, message, itemsMap) {
    const map = itemsMap || taskItems;
    const div = map[taskId];
    if (!div) return;
    div.className = `task-item ${status}`;
    const iconEl = div.querySelector('.task-icon');
    if (iconEl) iconEl.textContent = STATUS_ICON[status] || '⚙️';
    const msgEl = div.querySelector('.task-message');
    if (msgEl) msgEl.textContent = message || status;

    const terminalStates = ['done','error','not-found','stopped','skipped','save-failed','opened'];
    const isTerminal = terminalStates.includes(status);
    const skipBtn = div.querySelector('.btn-skip');
    if (skipBtn) skipBtn.style.display = isTerminal ? 'none' : '';
    const reactivateBtn = div.querySelector('.btn-reactivate');
    if (reactivateBtn) {
      reactivateBtn.style.display = '';
      reactivateBtn.disabled = false;
      reactivateBtn.textContent = '🔄';
    }
  }

  function buildTaskItems(tasks) {
    if (!taskList) return;
    taskList.innerHTML = '';
    taskItems = {};
    tasks.forEach(t => {
      const div = document.createElement('div');
      div.className = 'task-item pending';
      div.id = 'ti-' + t.taskId;
      div.innerHTML = `
        <span class="task-icon">${STATUS_ICON.pending}</span>
        <div class="task-body">
          <div class="task-order-id">${escapeHtml(t.orderId)}</div>
          <div class="task-message">في الانتظار...</div>
        </div>
        <div class="task-actions">
          <button class="btn-reactivate" title="إعادة تنشيط — تشغيل هذا البلاغ من جديد" data-task-id="${escapeHtml(t.taskId)}" style="display:none">🔄</button>
          <button class="btn-skip" title="تخطي هذا البلاغ — استمر مع التالي" data-task-id="${escapeHtml(t.taskId)}">⏭</button>
        </div>`;
      taskList.appendChild(div);
      taskItems[t.taskId] = div;

      div.querySelector('.btn-skip')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        const { processingTabId } = await chrome.storage.local.get('processingTabId');
        const targetTabId = processingTabId || (await getActiveTab())?.id;
        if (targetTabId) await sendToTab(targetTabId, { action: 'SKIP_TASK', taskId: t.taskId });
      });

      div.querySelector('.btn-reactivate')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          const tab = await getActiveTab();
          if (!isPortalTab(tab)) {
            alert('افتح أي صفحة في البوابة أولاً');
            btn.disabled = false;
            btn.textContent = '🔄';
            return;
          }
          const reactivateTask = {
            ...t,
            data: { ...(t.data || {}), forceOverwrite: true },
            payload: { ...(t.payload || {}), forceOverwrite: true }
          };
          await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [reactivateTask], tabId: tab.id });
          updateTaskItem(t.taskId, 'pending', 'جارٍ إعادة التشغيل (فرض الكتابة)...');
          startStatusPolling(1, [reactivateTask]);
        } catch(err) {
          btn.disabled = false;
          btn.textContent = '🔄';
        }
      });
    });
  }

  function startStatusPolling(total, tasks, cfg) {
    const itemsMap  = cfg?.itemsMap  || taskItems;
    const onBatchDone = cfg?.onBatchDone || ((s, f, t) => {
      setSearchStatus(`اكتمل — نجح: ${s} | فشل: ${f} من ${t}`, f > 0 ? 'warn' : 'ok');
      setBatchSearchUI(false);
    });
    const onItemUpdate = cfg?.onItemUpdate || ((id, s, m) => updateTaskItem(id, s, m, itemsMap));
    const onProgress = cfg?.onProgress || ((d, t, s, f, nf) => updateSearchProgress(d, t, s, f));
    const onStatusMsg = cfg?.onStatusMsg || ((d, t, s, f, nf) => setSearchStatus(`جارٍ... ${d}/${t} — نجح: ${s} | غير موجود: ${nf} | فشل: ${f}`, 'info'));
    const stopFn = cfg?.stopFn || stopStatusPolling;

    let doneCount = 0;
    const taskIds = tasks.map(t => t.taskId);

    if (_storageListener) {
      chrome.storage.onChanged.removeListener(_storageListener);
      _storageListener = null;
    }

    const listener = async (changes, area) => {
      if (area !== 'local') return;

      if (changes.lastStatusUpdate?.newValue) {
        const { taskId, status, message } = changes.lastStatusUpdate.newValue;
        if (taskId === 'batch' || taskId === 'batch-done') {
          if (status === 'batch-done' || status === 'stopped') {
            stopFn();
            const { taskResults = [] } = await chrome.storage.local.get({ taskResults: [] });
            const success = taskResults.filter(r => r.result === 'done').length;
            const failed  = taskResults.filter(r => !['done','opened'].includes(r.result)).length;
            onBatchDone(success, failed, total);
            return;
          }
        } else {
          onItemUpdate(taskId, status, message);
        }
      }

      if (changes.taskResults?.newValue) {
        const taskResults = changes.taskResults.newValue;
        const newDone = taskResults.length;
        if (newDone !== doneCount) {
          doneCount = newDone;
          const success = taskResults.filter(r => r.result === 'done').length;
          const failed  = taskResults.filter(r => !['done','opened','not-found'].includes(r.result)).length;
          const notFound= taskResults.filter(r => r.result === 'not-found').length;
          onProgress(doneCount, total, success, failed, notFound);
          onStatusMsg(doneCount, total, success, failed, notFound);
          taskResults.forEach(r => {
            if (taskIds.includes(r.taskId)) onItemUpdate(r.taskId, r.result, getResultMessage(r.result));
          });
        }
      }
    };

    _storageListener = listener;
    chrome.storage.onChanged.addListener(listener);
  }

  function stopStatusPolling() {
    if (_storageListener) {
      chrome.storage.onChanged.removeListener(_storageListener);
      _storageListener = null;
    }
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  }

  // ── Execution Handlers ────────────────────────────────────
  async function executeSingleOrder() {
    const text = searchInput?.value.trim() || '';
    if (!text) { setSearchStatus('أدخل رقم أمر شغل واحد على الأقل', 'warn'); return; }

    const line = parseLines(text)[0];
    const orderId = extractOrderId(line);
    if (!orderId) { setSearchStatus('لم يُعثر على OrderId في السطر — استخدم تنسيق OrderId: CAS...', 'error'); return; }

    const tab = await getActiveTab();
    if (!isPortalTab(tab)) { setSearchStatus('افتح أي صفحة في البوابة أولاً', 'warn'); return; }

    setSearchStatusHtml('<span class="spinner"></span> جارٍ إرسال المهمة...', 'info');
    if (btnSearchSingle) btnSearchSingle.disabled = true;

    const opts = window.FillOptions ? window.FillOptions.getOptionsState() : {};

    if (opts.isMasaha && !opts.masahaProdType) {
      setSearchStatus('اختر نوع المنتج للمساحة', 'warn');
      if (btnSearchSingle) btnSearchSingle.disabled = false;
      return;
    }
    if (opts.isSecondVisit && !opts.productType) {
      setSearchStatus('اختر نوع المنتج للزيارة التانية', 'warn');
      if (btnSearchSingle) btnSearchSingle.disabled = false;
      return;
    }

    let profiles = null;
    if (opts.isMasaha || opts.isSecondVisit) {
      profiles = await window.FillOptions?.loadSvProfiles();
      if (!profiles) {
        setSearchStatus('فشل تحميل البروفايلات', 'error');
        if (btnSearchSingle) btnSearchSingle.disabled = false;
        return;
      }
    }

    const task = window.FillOptions?.createTask ? window.FillOptions.createTask({
      orderId,
      baseLine: line,
      options: opts,
      profiles
    }) : { orderId, line, data: opts };

    const resp = await sendToTab(tab.id, {
      action: 'RUN_SINGLE',
      taskId: task.taskId,
      orderId: task.orderId,
      line: task.line,
      data: task.data,
      payload: task.payload,
      mode: task.mode
    });

    if (resp.error) {
      setSearchStatus('خطأ: ' + resp.error, 'error');
      if (btnSearchSingle) btnSearchSingle.disabled = false;
      return;
    }

    setSearchStatus(`بدأت مهمة (مفرد): ${orderId}`, 'info');
    if (btnSearchSingle) btnSearchSingle.disabled = false;
  }

  async function executeBatchOrders() {
    const text = searchInput?.value.trim() || '';
    if (!text) { setSearchStatus('أدخل سطور CSV أو أكثر', 'warn'); return; }

    const lines = parseLines(text);
    if (!lines.length) { setSearchStatus('لا توجد سطور قابلة للمعالجة', 'warn'); return; }

    const tab = await getActiveTab();
    if (!isPortalTab(tab)) { setSearchStatus('افتح أي صفحة في البوابة أولاً', 'warn'); return; }

    const opts = window.FillOptions ? window.FillOptions.getOptionsState() : {};

    if (opts.isMasaha && !opts.masahaProdType) {
      setSearchStatus('اختر نوع المنتج للمساحة', 'warn');
      return;
    }
    if (opts.isSecondVisit && !opts.productType) {
      setSearchStatus('اختر نوع المنتج للزيارة التانية', 'warn');
      return;
    }

    let profiles = null;
    if (opts.isMasaha || opts.isSecondVisit) {
      profiles = await window.FillOptions.loadSvProfiles();
      if (!profiles) { setSearchStatus('فشل تحميل البروفايلات', 'error'); return; }
    }

    let tasks;
    if (opts.isMasaha || opts.isSecondVisit) {
      tasks = lines.map(line => {
        const oid = extractOrderId(line) || line.trim();
        return window.FillOptions.createTask({
          orderId: oid,
          baseLine: line,
          options: opts,
          profiles
        });
      }).filter(t => t.orderId);
    } else {
      // Normal mode with multi-device grouping
      const groupedTasks = {};
      lines.forEach(line => {
        const oid = extractOrderId(line) || line.trim().substring(0, 30);
        if (!groupedTasks[oid]) {
          groupedTasks[oid] = { orderId: oid, lines: [line] };
        } else {
          groupedTasks[oid].lines.push(line);
        }
      });

      tasks = Object.values(groupedTasks).map(group => {
        let mergedLine = group.lines[0];
        if (group.lines.length > 1) {
          const obj2 = parseLineToObject(group.lines[1]);
          const m2 = obj2['model'] || obj2['موديل'] || '';
          const s2 = obj2['serial'] || obj2['serialnumber'] || '';
          const d2 = obj2['date'] || obj2['تاريخ'] || '';
          if (m2 && String(m2).toLowerCase() !== 'null') mergedLine += ` | Model2: ${m2}`;
          if (s2 && String(s2).toLowerCase() !== 'null') mergedLine += ` | Serial2: ${s2}`;
          if (d2 && String(d2).toLowerCase() !== 'null') mergedLine += ` | Date2: ${d2}`;
        }
        return window.FillOptions.createTask({
          orderId: group.orderId,
          baseLine: mergedLine,
          options: opts,
          profiles: null
        });
      });
    }

    const invalid = tasks.filter(t => !extractOrderId(t.line));
    if (invalid.length > 0 && invalid.length === tasks.length) {
      setSearchStatus('لم يُعثر على OrderId في أي سطر', 'error');
      return;
    }

    // === MULTI RUN RUNTIME TRACE ===
    const firstOrderId = tasks[0]?.orderId || 'unknown';
    if (typeof window.traceEvent === 'function') {
      window.traceEvent('MULTI_RUN_CLICK', { tabId: tab.id, orderId: firstOrderId, queueLength: tasks.length });
    }

    try {
      if (typeof window.traceEvent === 'function') window.traceEvent('BEFORE_BUILD_TASK_ITEMS', { queueLength: tasks.length });
      buildTaskItems(tasks);
      if (typeof window.traceEvent === 'function') window.traceEvent('AFTER_BUILD_TASK_ITEMS', { queueLength: tasks.length, taskListLength: taskList?.children?.length || -1 });

      if (typeof window.traceEvent === 'function') window.traceEvent('BEFORE_TASK_RESULTS_RESET', { queueLength: tasks.length });
      await chrome.storage.local.set({ taskResults: [], lastStatusUpdate: null });
      if (typeof window.traceEvent === 'function') window.traceEvent('AFTER_TASK_RESULTS_RESET', { queueLength: tasks.length });

      if (typeof window.traceEvent === 'function') window.traceEvent('QUEUE_INITIALIZED', { queueLength: tasks.length, taskIds: tasks.map(t => t.taskId) });
    } catch (e) {
      if (typeof window.traceEvent === 'function') {
        window.traceEvent('MULTI_RUN_STARTUP_ERROR', { name: e?.name, message: e?.message, stack: e?.stack, stage: 'startup' });
      }
      throw e;
    }

    setSearchStatusHtml('<span class="spinner"></span> جارٍ بدء التشغيل المتعدد...', 'info');
    setBatchSearchUI(true);
    updateSearchProgress(0, tasks.length, 0, 0);

    const delay = parseInt(searchDelaySlider?.value || 2000, 10);

    if (typeof window.traceEvent === 'function') window.traceEvent('START_QUEUE_SEND', { tabId: tab.id, queueLength: tasks.length, delay });
    const resp = await sendToTab(tab.id, { action: 'START_QUEUE', tasks, tabId: tab.id, delay });
    if (typeof window.traceEvent === 'function') window.traceEvent('START_QUEUE_RESPONSE', { ok: !resp.error, error: resp.error || null });

    if (resp.error) {
      const msg = resp.error.includes('Receiving end does not exist') || resp.error.includes('Could not establish connection')
        ? 'أعد تحميل صفحة البوابة (F5) ثم اضغط تشغيل متعدد تاني'
        : resp.error;
      setSearchStatus('خطأ: ' + msg, 'error');
      setBatchSearchUI(false);
      return;
    }

    setSearchStatus(`بدأ التشغيل المتعدد — ${tasks.length} مهمة`, 'info');
    startStatusPolling(tasks.length, tasks);
  }

  async function stopBatchQueue() {
    stopStatusPolling();
    if (btnSearchStop) btnSearchStop.disabled = true;
    setSearchStatus('جارٍ الإيقاف...', 'warn');

    const { processingTabId } = await chrome.storage.local.get('processingTabId');
    const targetTabId = processingTabId || (await getActiveTab())?.id;
    if (targetTabId) await sendToTab(targetTabId, { action: 'STOP_QUEUE' });

    await chrome.storage.local.set({ taskQueue: [] });
    await chrome.storage.local.remove(['currentTask', 'processingTabId']);

    setBatchSearchUI(false);
    setSearchStatus('تم الإيقاف', 'warn');
  }

  // ── Session State Recovery on Load ─────────────────────────
  async function initOnLoad() {
    try {
      const { currentTask, taskQueue = [], taskResults = [] } = await chrome.storage.local.get({
        currentTask: null,
        taskQueue: [],
        taskResults: []
      });

      if (currentTask || taskQueue.length > 0) {
        const allTasks = [];
        if (currentTask) allTasks.push(currentTask);
        allTasks.push(...taskQueue);

        buildTaskItems(allTasks);

        taskResults.forEach(r => {
          updateTaskItem(r.taskId, r.result, getResultMessage(r.result));
        });

        if (currentTask) {
          updateTaskItem(currentTask.taskId, 'filling', 'جارٍ المتابعة...');
        }

        const total = allTasks.length + taskResults.length;
        setBatchSearchUI(true);
        setSearchStatus(`استئناف جلسة سابقة — ${allTasks.length} مهمة متبقية`, 'info');
        startStatusPolling(total, allTasks);
      }
    } catch(e) {
      console.warn('initOnLoad recovery skipped', e);
    }
  }

  function initAutofillClient() {
    // Wire file drop & pickers
    setupFileDrop(searchFileDrop, searchCsvInput, searchInput);

    // Auto-focus search input & enter to run batch
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          executeBatchOrders();
        }
      });
    }

    // Delay slider
    searchDelaySlider?.addEventListener('input', () => {
      if (searchDelayLabel) {
        searchDelayLabel.textContent = (searchDelaySlider.value / 1000).toFixed(1) + ' ث';
      }
    });

    // Action buttons
    btnSearchSingle?.addEventListener('click', executeSingleOrder);
    btnSearchBatch?.addEventListener('click', executeBatchOrders);
    btnSearchStop?.addEventListener('click', stopBatchQueue);

    // Message listener for status updates
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'STATUS_UPDATE') {
        if (taskItems[msg.taskId]) updateTaskItem(msg.taskId, msg.status, msg.message);
      }
      if (msg.type === 'BATCH_DONE_STORAGE') {
        stopStatusPolling();
        setBatchSearchUI(false);
      }
    });

    // Initial load recovery
    initOnLoad();
  }

  // Export helpers to window for backward compatibility
  window.setSearchStatus = setSearchStatus;
  window.setSearchStatusHtml = setSearchStatusHtml;
  window.sendToTab = sendToTab;
  window.getActiveTab = getActiveTab;
  window.isPortalTab = isPortalTab;
  window.updateTaskItem = updateTaskItem;
  window.setBatchSearchUI = setBatchSearchUI;
  window.stopStatusPolling = stopStatusPolling;
  window.buildTaskItems = buildTaskItems;
  window.startStatusPolling = startStatusPolling;

  window.AutofillClient = {
    init: initAutofillClient,
    initOnLoad,
    executeSingleOrder,
    executeBatchOrders,
    stopBatchQueue,
    buildTaskItems,
    updateTaskItem,
    setSearchStatus,
    setSearchStatusHtml,
    sendToTab,
    getActiveTab,
    isPortalTab
  };
})();
