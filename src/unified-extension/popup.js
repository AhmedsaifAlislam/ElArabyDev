// =========================================================
// popup.js — Portal AutoFiller v3.0
// =========================================================
'use strict';

// ── DOM Refs ──────────────────────────────────────────────

// Search tab
const searchInput      = document.getElementById('search-input');
const searchCsvInput   = document.getElementById('search-csv-input');
const searchFileDrop   = document.getElementById('search-file-drop');
const searchDelaySlider= document.getElementById('search-delay-slider');
const searchDelayLabel = document.getElementById('search-delay-label');
const btnSearchSingle  = document.getElementById('btn-search-single');
const btnSearchBatch   = document.getElementById('btn-search-batch');
const btnSearchStop    = document.getElementById('btn-search-stop');
const btnExtractDevice = document.getElementById('btn-extract-device');
const searchStatusMsg  = document.getElementById('search-status-msg');
const searchProgressW  = document.getElementById('search-progress-wrap');
const searchProgressB  = document.getElementById('search-progress-bar');
const searchCounter    = document.getElementById('search-batch-counter');
const taskList         = document.getElementById('task-list');

// Smart Log tab
const logList         = document.getElementById('log-list');
const btnRefreshLogs  = document.getElementById('btn-refresh-logs');
const btnClearLogs    = document.getElementById('btn-clear-logs');
const searchLogsInput = document.getElementById('search-logs');

// ── State ─────────────────────────────────────────────────
let isBatchRunning     = false;
let isBatchSearching   = false;
let stopRequested      = false;
let allSessionLogs     = [];   // full unfiltered sessions
let taskItems          = {};   // taskId → div element
let statusPollInterval = null;

// ── Helpers ───────────────────────────────────────────────
const escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');
const sleep      = ms => new Promise(r => setTimeout(r, ms));

function parseLines(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function parseLineToObject(line) {
  const obj = {}; 
  const parts = line.includes('|') ? line.split('|') : line.split(',');
  parts.forEach(p => { 
    const i = p.indexOf(':'); 
    if(i<0)return; 
    obj[p.slice(0,i).trim().toLowerCase().replace(/\s+/g,'')] = p.slice(i+1).trim(); 
  });
  return obj;
}

function extractOrderId(line) {
  // Key:value form
  const m1 = line.match(/orderid\s*:\s*([^\s|,]+)/i);
  if (m1) return m1[1].trim();
  // CAS/WO id anywhere in the line (removed ^ anchor to handle leading spaces or dates)
  const m2 = line.match(/(CAS\d{10,}|WO-?\d+)/i);
  if (m2) return m2[1];
  return null;
}

function generateTaskId() {
  return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

// ── Set Status (Search Tab) ───────────────────────────────
function setSearchStatus(text, type = 'info') {
  searchStatusMsg.className = `status-msg ${type}`;
  const icons = { info: 'ℹ️', ok: '✅', error: '❌', warn: '⚠️' };
  searchStatusMsg.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(text)}</span>`;
}

function setSearchStatusHtml(html, type = 'info') {
  searchStatusMsg.className = `status-msg ${type}`;
  searchStatusMsg.innerHTML = html;
}

// ── Tab Switching ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'logs') loadSmartLog();
    if (btn.dataset.tab === 'smart-log') { loadSmartLogDashboard(); }
    if (btn.dataset.tab === 'tampermonkey') loadTampermonkeyScripts();
    if (btn.dataset.tab === 'session') loadSessionCaptures();
  });
});

// ── Smart Log buttons ────────────────────────────────────
document.getElementById('sl-btn-refresh')?.addEventListener('click', loadSmartLogDashboard);
document.getElementById('sl-btn-clear')?.addEventListener('click', async () => {
  if (!confirm('مسح كل بيانات التتبع؟')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_SMART_LOG' });
  currentSmartLogData = { manual: [], automated: [], errors: [], events: [] };
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-btn-analyze')?.addEventListener('click', () => renderManualAnalysis(currentSmartLogData));
document.getElementById('sl-btn-excel')?.addEventListener('click', () => exportSmartLogExcel(currentSmartLogData));
document.getElementById('sl-btn-ai')?.addEventListener('click', () => analyzeSmartLogWithAI(currentSmartLogData));

// ── Smart Log accordion: افتح واحدة تقفل الباقي ──────────
document.getElementById('panel-smart-log')?.addEventListener('toggle', (e) => {
  if (!e.target.open) return;
  e.currentTarget.querySelectorAll('details').forEach(d => {
    if (d !== e.target) d.open = false;
  });
}, true);

// ── Smart Log Tab ─────────────────────────────────────────
searchDelaySlider.addEventListener('input', () => {
  searchDelayLabel.textContent = (searchDelaySlider.value / 1000).toFixed(1) + ' ث';
});

// ── Auto-focus search input + Enter to start search ──────
searchInput.focus();
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    btnSearchBatch.click();
  }
});

// ── Second Visit: Product Type Dropdown ─────────────────────
const chkSecondVisit = document.getElementById('chk-second-visit');
const svProductType  = document.getElementById('sv-product-type');
const chkMasaha      = document.getElementById('chk-masaha');
const masahaProductType = document.getElementById('masaha-product-type');

chkSecondVisit?.addEventListener('change', () => {
  svProductType.style.display = chkSecondVisit.checked ? '' : 'none';
  if (!chkSecondVisit.checked) svProductType.value = '';
  if (chkSecondVisit.checked && chkMasaha?.checked) { chkMasaha.checked = false; masahaProductType.style.display = 'none'; masahaProductType.value = ''; }
});

chkMasaha?.addEventListener('change', () => {
  masahaProductType.style.display = chkMasaha.checked ? '' : 'none';
  if (!chkMasaha.checked) masahaProductType.value = '';
  if (chkMasaha.checked && chkSecondVisit?.checked) { chkSecondVisit.checked = false; svProductType.style.display = 'none'; svProductType.value = ''; }
});

const chkDrain = document.getElementById('chk-force-drain-cleaning');
const lblShahn = document.getElementById('lbl-shahn');
if (chkDrain && lblShahn) {
  chkDrain.addEventListener('change', () => {
    lblShahn.style.display = chkDrain.checked ? '' : 'none';
    if (!chkDrain.checked) document.getElementById('chk-shahn').value = 'no';
  });
}

let svProfiles = null;
async function loadSvProfiles() {
  if (svProfiles) return svProfiles;
  try {
    const resp = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
    svProfiles = await resp.json();
    return svProfiles;
  } catch(e) { return null; }
}

function generateSecondVisitLine(orderId, productType, profiles) {
  if (!profiles || !productType) return `OrderId: ${orderId}`;
  const profile = profiles.profiles.find(p => p.name === productType);
  if (!profile) return `OrderId: ${orderId}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = String(yesterday.getDate()).padStart(2, '0');
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const year = yesterday.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  const p1 = profile.page1Defaults || {};
  const parts = [`OrderId: ${orderId}`];
  if (p1.brand) parts.push(`Brand: ${p1.brand}`);
  if (p1.model1) parts.push(`Model: ${p1.model1}`);
  if (p1.model2) parts.push(`Model2: ${p1.model2}`);
  parts.push(`Serial: ${p1.serial || '0'}`);
  if (p1.model2) parts.push(`Serial2: ${p1.serial2 || '0'}`);
  parts.push(`Status: ${profiles.defaultStatus || 'Out warranty'}`);
  if (profile.problemCode) parts.push(`ProblemCode: ${profile.problemCode}`);
  if (profile.faultSearch) parts.push(`FaultCode: ${profile.faultSearch}`);
  if (profile.subFault && profile.subFault !== 'first') parts.push(`SubFault: ${profile.subFault}`);
  parts.push(`Notes: ${profiles.defaultComment || 'زيارة ثانية قطع غيار'}`);
  parts.push(`Date: ${dateStr}`);
  return parts.join(' | ');
}

function generateMasahaLine(orderId, productType, profiles) {
  if (!profiles || !productType) return `OrderId: ${orderId}`;
  const profile = profiles.masahaProfiles?.find(p => p.name === productType);
  if (!profile) return `OrderId: ${orderId}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = String(yesterday.getDate()).padStart(2, '0');
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const year = yesterday.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  const p1 = profile.page1Defaults || {};
  const parts = [`OrderId: ${orderId}`];
  if (p1.brand) parts.push(`Brand: ${p1.brand}`);
  if (p1.model1) parts.push(`Model: ${p1.model1}`);
  if (p1.model2) parts.push(`Model2: ${p1.model2}`);
  parts.push(`Serial: ${p1.serial || '0'}`);
  if (p1.model2) parts.push(`Serial2: ${p1.serial2 || '0'}`);
  parts.push(`Status: ${profiles.defaultStatus || 'Out warranty'}`);
  if (profile.problemCode) parts.push(`ProblemCode: ${profile.problemCode}`);
  if (profile.faultSearch) parts.push(`FaultCode: ${profile.faultSearch}`);
  if (profile.subFaultCode) parts.push(`SubFault: ${profile.subFaultCode}`);
  parts.push(`Notes: مساحة`);
  parts.push(`Date: ${dateStr}`);
  return parts.join(' | ');
}

// ── CSV File Handling ─────────────────────────────────────
function setupFileDrop(dropZone, fileInput, targetTextarea) {
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
    dropZone.textContent = `✅ تم تحميل: ${file.name}`;
  };
  reader.readAsText(file, 'UTF-8');
}

setupFileDrop(searchFileDrop, searchCsvInput, searchInput);

// ── Get Active Tab ────────────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Send to Content Script ────────────────────────────────
async function sendToTab(tabId, message, timeout = 8000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ error: 'timeout — تأكد من فتح صفحة البوابة وانتظر تحميلها' }), timeout);
    chrome.tabs.sendMessage(tabId, message, resp => {
      clearTimeout(timer);
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

// ── Task Status UI ────────────────────────────────────────
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

function buildTaskItems(tasks) {
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

    // Skip handler
    div.querySelector('.btn-skip').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      const { processingTabId } = await chrome.storage.local.get('processingTabId');
      const targetTabId = processingTabId || (await getActiveTab())?.id;
      if (targetTabId) await sendToTab(targetTabId, { action: 'SKIP_TASK', taskId: t.taskId });
    });

    // Reactivate handler — re-enqueues this task as currentTask and starts it
    div.querySelector('.btn-reactivate').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const tab = await getActiveTab();
        if (!isPortalTab(tab)) { alert('افتح أي صفحة في البوابة أولاً'); btn.disabled = false; btn.textContent = '🔄'; return; }
        // Clear current task then restart just this one
        await chrome.storage.local.set({ lastStatusUpdate: null });
        await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [t], tabId: tab.id });
        updateTaskItem(t.taskId, 'pending', 'جارٍ إعادة التشغيل...');
        startStatusPolling(1, [t]);
      } catch(err) {
        btn.disabled = false; btn.textContent = '🔄';
      }
    });
  });
}

function updateTaskItem(taskId, status, message, itemsMap) {
  const map = itemsMap || taskItems;
  const div = map[taskId];
  if (!div) return;
  div.className = `task-item ${status}`;
  div.querySelector('.task-icon').textContent    = STATUS_ICON[status] || '⚙️';
  div.querySelector('.task-message').textContent = message || status;
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

// ── Storage Status Listener (Event-Driven) ────
let _storageListener = null;

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

  if (_storageListener) { chrome.storage.onChanged.removeListener(_storageListener); _storageListener = null; }

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
  if (_storageListener) { chrome.storage.onChanged.removeListener(_storageListener); _storageListener = null; }
  if (statusPollInterval) { clearInterval(statusPollInterval); statusPollInterval = null; }
}

function getResultMessage(result) {
  return { done:'✅ تم الحفظ', 'save-failed':'⚠️ لم يتأكد الحفظ', 'not-found':'❌ غير موجود', error:'❌ خطأ', opened:'📄 مفتوح', stopped:'⛔ توقف', skipped:'⏭ تخطي' }[result] || result;
}

// ── Batch Search UI State ─────────────────────────────────
function setBatchSearchUI(active) {
  isBatchSearching = active;
  btnSearchSingle.disabled = active;
  btnSearchBatch.disabled  = active;
  btnSearchStop.disabled   = !active;
  searchProgressW.classList.toggle('visible', active);
  searchCounter.classList.toggle('visible', active);
}

function updateSearchProgress(done, total, success, failed) {
  searchProgressB.style.width = total > 0 ? ((done / total) * 100) + '%' : '0%';
  searchCounter.textContent = `${done}/${total} — نجح: ${success} | فشل: ${failed}`;
}

// ── SEARCH TAB: Single Order ──────────────────────────────
btnSearchSingle.addEventListener('click', async () => {
  const text = searchInput.value.trim();
  if (!text) { setSearchStatus('أدخل رقم أمر شغل واحد على الأقل', 'warn'); return; }

  const line = parseLines(text)[0];
  const orderId = extractOrderId(line);
  if (!orderId) { setSearchStatus('لم يُعثر على OrderId في السطر — استخدم تنسيق OrderId: CAS...', 'error'); return; }

  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setSearchStatus('افتح أي صفحة في البوابة أولاً', 'warn'); return; }

  setSearchStatusHtml('<span class="spinner"></span> جارٍ إرسال المهمة...', 'info');
  btnSearchSingle.disabled = true;

  const forceDrainCleaning = document.getElementById('chk-force-drain-cleaning')?.checked || false;
  const shahnEnabled = document.getElementById('chk-shahn')?.value === 'yes' || false;
  const forceOverwrite = document.getElementById('chk-force-overwrite')?.checked || false;
  const isSecondVisit = document.getElementById('chk-second-visit')?.checked || false;
  const isMasaha = document.getElementById('chk-masaha')?.checked || false;
  const productType = svProductType?.value || '';
  const masahaProdType = masahaProductType?.value || '';

  let finalLine = line;

  if (isMasaha) {
    if (!masahaProdType) { setSearchStatus('اختر نوع المنتج للمساحة', 'warn'); btnSearchSingle.disabled = false; return; }
    const profiles = await loadSvProfiles();
    finalLine = generateMasahaLine(orderId, masahaProdType, profiles);
  } else if (isSecondVisit) {
    if (!productType) { setSearchStatus('اختر نوع المنتج للزيارة التانية', 'warn'); btnSearchSingle.disabled = false; return; }
    const profiles = await loadSvProfiles();
    finalLine = generateSecondVisitLine(orderId, productType, profiles);
  }

  const task = { taskId: generateTaskId(), orderId, line: finalLine, data: { forceDrainCleaning, shahnEnabled, forceOverwrite, secondVisitMode: isSecondVisit, masahaMode: isMasaha } };
  buildTaskItems([task]);

  // Clear previous results
  await chrome.storage.local.set({ taskResults: [], lastStatusUpdate: null });

  const delay = parseInt(searchDelaySlider?.value || 2000, 10);
  const resp = await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [task], tabId: tab.id, delay });

  if (resp.error) {
    setSearchStatus('خطأ: ' + resp.error, 'error');
    btnSearchSingle.disabled = false;
    return;
  }

  setSearchStatus(`بدأت مهمة: ${orderId}`, 'info');
  startStatusPolling(1, [task]);
  setBatchSearchUI(true);
});

// ── SEARCH TAB: Batch Orders ──────────────────────────────
btnSearchBatch.addEventListener('click', async () => {
  const text = searchInput.value.trim();
  if (!text) { setSearchStatus('أدخل سطور CSV أو أكثر', 'warn'); return; }

  const lines = parseLines(text);
  if (!lines.length) { setSearchStatus('لا توجد سطور قابلة للمعالجة', 'warn'); return; }

  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setSearchStatus('افتح أي صفحة في البوابة أولاً', 'warn'); return; }

  const forceDrainCleaning = document.getElementById('chk-force-drain-cleaning')?.checked || false;
  const shahnEnabled = document.getElementById('chk-shahn')?.value === 'yes' || false;
  const forceOverwrite = document.getElementById('chk-force-overwrite')?.checked || false;
  const isSecondVisit = document.getElementById('chk-second-visit')?.checked || false;
  const isMasaha = document.getElementById('chk-masaha')?.checked || false;
  const productType = svProductType?.value || '';
  const masahaProdType = masahaProductType?.value || '';

  if (isMasaha && !masahaProdType) {
    setSearchStatus('اختر نوع المنتج للمساحة', 'warn');
    return;
  }
  if (isSecondVisit && !productType) {
    setSearchStatus('اختر نوع المنتج للزيارة التانية', 'warn');
    return;
  }

  let profiles = null;
  if (isMasaha || isSecondVisit) {
    profiles = await loadSvProfiles();
    if (!profiles) { setSearchStatus('فشل تحميل البروفايلات', 'error'); return; }
  }

  let shahnForTasks = shahnEnabled;

  let tasks;
  if (isMasaha) {
    tasks = lines.map(line => {
      const oid = extractOrderId(line) || line.trim();
      const finalLine = generateMasahaLine(oid, masahaProdType, profiles);
      return { taskId: generateTaskId(), orderId: oid, line: finalLine, data: { forceDrainCleaning, shahnEnabled: shahnForTasks, forceOverwrite, secondVisitMode: false, masahaMode: true } };
    }).filter(t => t.orderId);
  } else if (isSecondVisit) {
    tasks = lines.map(line => {
      const oid = extractOrderId(line) || line.trim();
      const finalLine = generateSecondVisitLine(oid, productType, profiles);
      return { taskId: generateTaskId(), orderId: oid, line: finalLine, data: { forceDrainCleaning, shahnEnabled: shahnForTasks, forceOverwrite, secondVisitMode: true, masahaMode: false } };
    }).filter(t => t.orderId);
  } else {
    // Normal mode
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
      return {
        taskId: generateTaskId(),
        orderId: group.orderId,
        line: mergedLine,
        data: { forceDrainCleaning, shahnEnabled: shahnForTasks, forceOverwrite }
      };
    });
  }

  const invalid = tasks.filter(t => !extractOrderId(t.line));
  if (invalid.length > 0 && invalid.length === tasks.length) {
    setSearchStatus('لم يُعثر على OrderId في أي سطر', 'error');
    return;
  }

  buildTaskItems(tasks);
  await chrome.storage.local.set({ taskResults: [], lastStatusUpdate: null });

  setSearchStatusHtml('<span class="spinner"></span> جارٍ بدء التشغيل المتعدد...', 'info');
  setBatchSearchUI(true);
  updateSearchProgress(0, tasks.length, 0, 0);

  const delay = parseInt(searchDelaySlider?.value || 2000, 10);
  const resp = await sendToTab(tab.id, { action: 'START_QUEUE', tasks, tabId: tab.id, delay });

  if (resp.error) {
    setSearchStatus('خطأ: ' + resp.error, 'error');
    setBatchSearchUI(false);
    return;
  }

  setSearchStatus(`بدأ التشغيل المتعدد — ${tasks.length} مهمة`, 'info');
  startStatusPolling(tasks.length, tasks);
});

// ── SEARCH TAB: Stop ──────────────────────────────────────
btnSearchStop.addEventListener('click', async () => {
  stopStatusPolling();
  btnSearchStop.disabled = true;
  setSearchStatus('جارٍ الإيقاف...', 'warn');

  const { processingTabId } = await chrome.storage.local.get('processingTabId');
  const targetTabId = processingTabId || (await getActiveTab())?.id;
  if (targetTabId) await sendToTab(targetTabId, { action: 'STOP_QUEUE' });

  await chrome.storage.local.set({ taskQueue: [] });
  await chrome.storage.local.remove(['currentTask', 'processingTabId']);

  setBatchSearchUI(false);
  setSearchStatus('تم الإيقاف', 'warn');
});

btnExtractDevice?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) { setSearchStatus('افتح صفحة البلاغ أولاً', 'warn'); return; }
  const url = tab.url || '';
  if (!url.includes('workorderreview') && !url.includes('Reportdetail') && !url.includes('technicalreviewdetails')) {
    setSearchStatus('افتح صفحة workorderreview أو Reportdetail أو technicalreviewdetails أولاً', 'warn');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_DEVICE_DATA' });
    window.close();
  } catch (e) {
    setSearchStatus('فشل إرسال الأمر: ' + e.message, 'error');
  }
});

// ── Technical Archive Link ──
document.getElementById('btn-technical-archive')?.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    if (!tab.url?.includes('powerappsportals.com')) {
      alert('افتح أي صفحة في البوابة أولاً');
      return;
    }
    const orderIdMatch = tab.url.match(/id=([^&]+)/);
    if (!orderIdMatch) {
      alert('لم يتم العثور على رقم البلاغ في الرابط');
      return;
    }
    const orderId = orderIdMatch[1];
    const archiveUrl = `https://elarabyportalpfs.powerappsportals.com/en-US/technicalreviewdetails/?id=${orderId}`;
    chrome.tabs.update(tab.id, { url: archiveUrl });
    window.close();
  } catch(e) { console.error('Error opening archive', e); }
});

// ── Portal Tab Check ──────────────────────────────────────
function isPortalTab(tab) {
  if (!tab) return false;
  return tab.url?.includes('powerappsportals.com') || tab.url?.includes('elarabyportalpfs');
}

// ═══════════════════════════════════════════════════════════
// SMART LOG TAB — Unified Sessions + Reports
// ═══════════════════════════════════════════════════════════

async function loadSmartLog() {
  const { sessionLogs = [], activeSession } = await chrome.storage.local.get({ sessionLogs: [], activeSession: null });
  // Merge: show active session at top (if any) + saved sessions
  let allLogs = [...sessionLogs];
  if (activeSession && activeSession.orders && activeSession.orders.length > 0) {
    allLogs = [{ ...activeSession, _isActive: true }, ...allLogs];
  }
  allSessionLogs = allLogs;
  updateLogStats(allLogs);
  renderSmartLog(allLogs);
}

function updateLogStats(logs) {
  let totalOrders = 0, totalSuccess = 0, totalFailed = 0;
  logs.forEach(s => {
    (s.orders || []).forEach(o => {
      totalOrders++;
      if (o.status === 'done') totalSuccess++;
      else if (!['opened','skipped'].includes(o.status)) totalFailed++;
    });
  });
  document.getElementById('log-stat-sessions').textContent = `جلسات: ${logs.length}`;
  document.getElementById('log-stat-orders').textContent   = `بلاغات: ${totalOrders}`;
  document.getElementById('log-stat-success').textContent  = `نجح: ${totalSuccess}`;
  document.getElementById('log-stat-failed').textContent   = `فشل: ${totalFailed}`;
}

function renderSmartLog(logs, filterText = '') {
  if (!logs || !logs.length) {
    logList.innerHTML = `<div class="empty-state"><div class="icon">📜</div><div>لا توجد جلسات مسجلة بعد</div></div>`;
    return;
  }

  const q = filterText.toLowerCase();

  const html = logs.map((session, sIdx) => {
    // Filter orders if search active
    let orders = session.orders || [];
    if (q) {
      orders = orders.filter(o =>
        (o.orderId || '').toLowerCase().includes(q) ||
        (o.pageDetails?.customerName || '').toLowerCase().includes(q) ||
        (o.pageDetails?.address || '').toLowerCase().includes(q) ||
        (o.technician || '').toLowerCase().includes(q)
      );
      if (!orders.length) return ''; // skip sessions with no matching orders
    }

    const startTime = session.startTime ? new Date(session.startTime).toLocaleString('ar-EG') : '';
    const endTime   = session.endTime   ? new Date(session.endTime).toLocaleString('ar-EG') : '';
    const isActive  = session._isActive;
    const totalOrds = orders.length;
    const success   = orders.filter(o => o.status === 'done').length;
    const failed    = orders.filter(o => !['done','opened','skipped'].includes(o.status)).length;

    const ordersHtml = orders.map((o, oIdx) => {
      const pd = o.pageDetails || {};
      const injected = o.injectedData || o.report?.filled || {};
      const fr = o.fieldResults || {};
      const saveOk = o.saveResult?.ok || o.status === 'done';

      const statusIcon = { done:'✅', error:'❌', 'not-found':'❌', 'save-failed':'⚠️', skipped:'⏭', stopped:'⛔', opened:'📄' }[o.status] || '⚙️';
      const statusColor = o.status === 'done' ? 'var(--success)' : (o.status === 'skipped' ? 'var(--muted)' : 'var(--danger,#ef5350)');

      // Build rich detail grid
      const detailRows = [];
      // Page-scraped info (address, phone, complaint)
      if (pd.address)       detailRows.push(['📍 العنوان', escapeHtml(pd.address)]);
      if (pd.customerName)  detailRows.push(['👤 العميل', escapeHtml(pd.customerName)]);
      if (pd.phone)         detailRows.push(['📞 الهاتف', escapeHtml(pd.phone)]);
      if (pd.complaintCode) detailRows.push(['🔴 كود الشكوى', escapeHtml(pd.complaintCode)]);
      // Technician
      if (o.technician)     detailRows.push(['🔧 الفني', escapeHtml(o.technician)]);
      // Problem code selected
      if (o.problemSelected) detailRows.push(['🛠️ المشكلة الفعلية', escapeHtml(o.problemSelected)]);
      // Fault codes (drain)
      if (fr.faultDrain?.name)       detailRows.push(['🚿 كود الصرف', escapeHtml(fr.faultDrain.name)]);
      if (fr.faultMaintenance?.name) detailRows.push(['🔁 الصيانة الدورية', escapeHtml(fr.faultMaintenance.name)]);
      if (fr.fault?.name)            detailRows.push(['⚡ كود العطل', escapeHtml(fr.fault.name)]);
      // Injected fields (from extension)
      if (injected.serial)  detailRows.push(['🔢 Serial (محقون)', escapeHtml(injected.serial)]);
      if (injected.brand)   detailRows.push(['🏷️ Brand (محقون)', escapeHtml(injected.brand)]);
      if (injected.model)   detailRows.push(['📦 Model (محقون)', escapeHtml(injected.model)]);
      if (injected.status)  detailRows.push(['🛡️ حالة الضمان (محقون)', escapeHtml(injected.status)]);
      if (injected.date)    detailRows.push(['📅 التاريخ (محقون)', escapeHtml(injected.date)]);
      // Manually modified fields
      if (pd.manuallyModified) {
        for (const [key, vals] of Object.entries(pd.manuallyModified)) {
          detailRows.push([`✏️ ${key} (يدوي)`, `${escapeHtml(vals.manual)} <span style="color:var(--muted);font-size:10px;">(كان: ${escapeHtml(vals.injected || 'فارغ')})</span>`]);
        }
      }
      // Spare parts
      if (fr.spareParts?.selected) detailRows.push(['🔩 قطع الغيار', escapeHtml(fr.spareParts.selected)]);

      const detailGridHtml = detailRows.length
        ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin-top:8px;font-size:11px;color:#c5d9f5;">
            ${detailRows.map(([k,v]) => `<span style="color:var(--muted);white-space:nowrap;">${k}:</span><span style="word-break:break-word;">${v}</span>`).join('')}
           </div>`
        : '';

      const ts = o.timestamp ? new Date(o.timestamp).toLocaleString('ar-EG') : '';

      return `<div class="log-order-entry" style="margin:6px 0;border:1px solid #1f3a5a;border-radius:6px;background:#0f1e35;overflow:hidden;">
        <div class="log-order-header" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none;"
             onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <span style="font-size:14px;">${statusIcon}</span>
          <span style="flex:1;font-weight:600;color:#e2eaf5;font-size:12px;">${escapeHtml(o.orderId)}</span>
          <span style="font-size:10px;color:var(--muted);">${ts}</span>
          <span style="font-size:11px;font-weight:700;color:${statusColor};">${getResultMessage(o.status)}</span>
        </div>
        <div style="display:none;padding:0 10px 10px;border-top:1px solid #1f3a5a;">
          ${detailGridHtml}
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-order-copy" data-sidx="${sIdx}" data-oidx="${oIdx}" style="font-size:10px;padding:3px 8px;">📋 نسخ</button>
            <button class="btn btn-primary btn-order-replay" data-sidx="${sIdx}" data-oidx="${oIdx}" style="font-size:10px;padding:3px 8px;background:var(--success-bg);color:var(--success);border-color:var(--success);">🔄 إعادة التقفيل</button>
          </div>
        </div>
      </div>`;
    }).join('');

    if (!ordersHtml.trim()) return '';

    return `<div class="log-session-card" style="margin-bottom:14px;border:1px solid #2b4568;border-radius:8px;background:var(--surface-2);overflow:hidden;">
      <div class="log-session-header" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#131f33;cursor:pointer;"
           onclick="const b=this.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none'">
        <span style="font-size:16px;">${isActive ? '🟢' : '📂'}</span>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--accent);font-size:12px;">${isActive ? '⚡ جلسة نشطة' : 'جلسة: ' + escapeHtml(session.id)}</div>
          <div style="font-size:10px;color:var(--muted);">${startTime}${endTime ? ' ← ' + endTime : ''}</div>
        </div>
        <span style="font-size:11px;color:#ffffff; background: #17334c; padding: 1px 6px; border-radius: 4px;">${success} نجح</span>
        <span style="font-size:11px;color:#ef5350;">${failed} فشل</span>
        <span style="font-size:11px;color:var(--muted);">${totalOrds} بلاغ</span>
      </div>
      <div style="display:block;padding:8px;">
        ${ordersHtml}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-session-copy" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;">📋 نسخ الجلسة</button>
          <button class="btn btn-primary btn-session-replay" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;background:var(--success-bg);color:var(--success);border-color:var(--success);">🔄 إعادة الكل</button>
          ${!isActive ? `<button class="btn btn-danger btn-session-delete" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;">🗑️ حذف</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  logList.innerHTML = html || `<div class="empty-state"><div class="icon">🔍</div><div>لا توجد نتائج للبحث</div></div>`;

  // ── Attach event listeners ──
  // Session copy
  document.querySelectorAll('.btn-session-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const s = logs[parseInt(e.currentTarget.dataset.sidx)];
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      const orig = e.currentTarget.textContent; e.currentTarget.textContent = '✅ تم';
      setTimeout(() => e.currentTarget.textContent = orig, 1500);
    });
  });

  // Session replay
  document.querySelectorAll('.btn-session-replay').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const session = logs[parseInt(e.currentTarget.dataset.sidx)];
      const tasksToReplay = (session.orders || []).map(o => o.originalTask).filter(Boolean);
      if (!tasksToReplay.length) { alert('لا توجد بيانات مهام كاملة لإعادة تشغيلها.'); return; }
      const tab = await getActiveTab();
      if (!isPortalTab(tab)) { alert('افتح أي صفحة في البوابة أولاً'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = '⏳';
      await chrome.storage.local.set({ lastStatusUpdate: null });
      await sendToTab(tab.id, { action: 'START_QUEUE', tasks: tasksToReplay, tabId: tab.id });
      document.querySelector('[data-tab="search"]').click();
      buildTaskItems(tasksToReplay);
      startStatusPolling(tasksToReplay.length, tasksToReplay);
    });
  });

  // Session delete
  document.querySelectorAll('.btn-session-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const sIdx = parseInt(e.currentTarget.dataset.sidx);
      if (!confirm('حذف هذه الجلسة؟')) return;
      // Remove from saved sessionLogs (not active session)
      const { sessionLogs = [] } = await chrome.storage.local.get({ sessionLogs: [] });
      // Find by id
      const targetId = logs[sIdx]?.id;
      const updated = sessionLogs.filter(s => s.id !== targetId);
      await chrome.storage.local.set({ sessionLogs: updated });
      await loadSmartLog();
    });
  });

  // Order copy
  document.querySelectorAll('.btn-order-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const o = logs[parseInt(e.currentTarget.dataset.sidx)]?.orders?.[parseInt(e.currentTarget.dataset.oidx)];
      if (!o) return;
      const txt = JSON.stringify({ orderId: o.orderId, status: o.status, pageDetails: o.pageDetails, injected: o.injectedData, technician: o.technician, problem: o.problemSelected }, null, 2);
      await navigator.clipboard.writeText(txt);
      const orig = e.currentTarget.textContent; e.currentTarget.textContent = '✅ تم';
      setTimeout(() => e.currentTarget.textContent = orig, 1500);
    });
  });

  // Order replay (single)
  document.querySelectorAll('.btn-order-replay').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const o = logs[parseInt(e.currentTarget.dataset.sidx)]?.orders?.[parseInt(e.currentTarget.dataset.oidx)];
      if (!o) return;
      const t = o.originalTask || { taskId: 'r-' + Date.now(), orderId: o.orderId };
      const tab = await getActiveTab();
      if (!isPortalTab(tab)) { alert('افتح أي صفحة في البوابة أولاً'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = '⏳';
      await chrome.storage.local.set({ lastStatusUpdate: null });
      await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [t], tabId: tab.id });
      document.querySelector('[data-tab="search"]').click();
      buildTaskItems([t]);
      startStatusPolling(1, [t]);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// TELEMETRY — مبسط: آلي/يدوي فقط
// ═══════════════════════════════════════════════════════════

let currentSmartLogData = { manual: [], automated: [], errors: [], events: [] };

async function loadSmartLogDashboard() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_SMART_LOG' });
  currentSmartLogData = resp || { manual: [], automated: [], errors: [], events: [] };
  renderSmartLogDashboard(currentSmartLogData);
}

function renderSmartLogDashboard(data) {
  const manualArr = data.manual || [];
  const autoArr = data.automated || [];
  const errArr = data.errors || [];
  const evtArr = data.events || [];
  const total = manualArr.length + autoArr.length + errArr.length + evtArr.length;

  const elEvents = document.getElementById('sl-stat-events');
  const elAuto = document.getElementById('sl-stat-auto');
  const elManual = document.getElementById('sl-stat-manual');
  if (elEvents) elEvents.textContent = total;
  if (elAuto) elAuto.textContent = autoArr.length;
  if (elManual) elManual.textContent = manualArr.length;

  // Manual changes — grouped by diff
  const listEl = document.getElementById('sl-manual-list');
  if (listEl) {
    if (!manualArr.length) {
      listEl.innerHTML = '<div style="color:var(--muted);padding:8px;text-align:center;">لا توجد أحداث يدوية مسجلة</div>';
    } else {
      const groups = {};
      const catOrder = { serial: 0, model: 1, brand: 2, status: 3, date: 4, spareparts: 5, fault: 6 };
      manualArr.forEach(e => {
        const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
        const key = `${e.label || e.field}||${e.category}||${diffKey}`;
        if (!groups[key]) {
          groups[key] = { label: e.label || e.field || '—', category: e.category || 'other', oldValue: e.oldValue || '(فارغ)', newValue: e.newValue || '(فارغ)', diff: diffKey, count: 0, lastTime: 0, times: [] };
        }
        groups[key].count++;
        groups[key].lastTime = Math.max(groups[key].lastTime, e.timestamp || 0);
        if (e.timestamp) groups[key].times.push(new Date(e.timestamp).toLocaleTimeString('ar-EG'));
      });

      const sorted = Object.values(groups).sort((a, b) => {
        const catA = catOrder[a.category] ?? 99, catB = catOrder[b.category] ?? 99;
        return catA !== catB ? catA - catB : b.lastTime - a.lastTime;
      });

      const catLabels = { serial: 'سيريال', model: 'موديل', brand: 'براند', status: 'حالة', date: 'تاريخ', spareparts: 'قطع غيار', fault: 'عطل' };

      let currentCategory = '';
      listEl.innerHTML = sorted.map(g => {
        const catColor = g.category === 'serial' ? '#64b5f6' : g.category === 'model' ? '#ce93d8' : g.category === 'brand' ? '#ffb74d' : '#a8c7fa';
        const htmlCat = g.category !== currentCategory ? `<div style="color:${catColor};font-weight:700;font-size:10px;padding:6px 4px 3px;">${catLabels[g.category] || g.category}</div>` : '';
        currentCategory = g.category;
        const timeHint = g.times.slice(-3).join('، ');
        return `${htmlCat}<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#2e2a1a;border:1px solid #4a4020;border-radius:4px;font-size:10px;" title="${escapeHtml(timeHint)}">
          <span style="color:#ff9800;font-weight:700;white-space:nowrap;">×${g.count}</span>
          <span style="color:${catColor};font-weight:600;white-space:nowrap;">${escapeHtml(g.label)}</span>
          <span style="color:#ef5350;white-space:nowrap;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.diff)}</span>
        </div>`;
      }).join('');
    }
  }

  renderFieldChanges([...manualArr, ...autoArr]);
  renderNetworkErrors(errArr);
  renderActionLog(evtArr);
}

function renderFieldChanges(logs) {
  const changes = logs.filter(e => e.eventType === 'FIELD_CHANGE').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 200);
  const el = document.getElementById('sl-field-changes');
  if (!el) return;
  if (!changes.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد تعديلات</div>'; return; }
  el.innerHTML = changes.map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    const auto = e.isAutomated ? '🤖' : '👤';
    const catColor = e.category === 'serial' ? '#64b5f6' : e.category === 'model' ? '#ce93d8' : e.category === 'brand' ? '#ffb74d' : '#a8c7fa';
    const pt2 = e.pageType === 'WORK_ORDER_REVIEW' ? '📋' : e.pageType === 'ORDERS' ? '🔍' : e.pageType === 'TECHNICAL_REVIEW' ? '📄' : '🌐';
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#1a1a0f;border:1px solid #3a3a1a;border-radius:4px;font-size:10px;">
      <span>${auto}</span>
      <span title="${escapeHtml(e.pageType || '')}">${pt2}</span>
      <span style="color:${catColor};font-weight:700;white-space:nowrap;">${escapeHtml(e.label || e.field || '—')}</span>
      <span style="color:#ef5350;white-space:nowrap;">${escapeHtml(e.oldValue || '(فارغ)')}</span>
      <span style="color:var(--muted);">→</span>
      <span style="color:#ffffff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.newValue || '(فارغ)')}</span>
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

function renderNetworkErrors(logs) {
  const netErrs = logs.filter(e => e.eventType === 'NETWORK_ERROR');
  const el = document.getElementById('sl-network-errors');
  if (!el) return;
  if (!netErrs.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد أخطاء شبكة</div>'; return; }
  const grouped = {};
  netErrs.forEach(e => {
    const key = `${e.method || 'GET'} ${e.url || '—'} [${e.status || 0}]`;
    if (!grouped[key]) grouped[key] = { ...e, count: 0 };
    grouped[key].count++;
  });
  el.innerHTML = Object.values(grouped).slice(0, 50).map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    const statusColor = e.status === 0 ? '#ef5350' : e.status >= 500 ? '#ff9800' : '#ffb74d';
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#0a1520;border:1px solid #1a2a3a;border-radius:4px;font-size:10px;">
      <span style="color:${statusColor};font-weight:700;white-space:nowrap;">[${e.status || 0}]</span>
      <span style="color:#a8c7fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.url || '—')}</span>
      ${e.count > 1 ? `<span style="color:#ff9800;font-weight:700;">×${e.count}</span>` : ''}
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

function renderActionLog(logs) {
  const actions = logs.filter(e => ['FIELD_FILLED','TASK_START','TASK_COMPLETE','VALIDATION_WARNING','CLIENT_VALIDATION_ERROR'].includes(e.eventType));
  const el = document.getElementById('sl-action-log');
  if (!el) return;
  if (!actions.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد حركات</div>'; return; }
  const sorted = [...actions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 200);
  el.innerHTML = sorted.map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    let icon, text, color;
    if (e.eventType === 'FIELD_FILLED') { icon = '✅'; text = `${e.field || '—'} = ${e.value || '—'}`; color = '#ffffff'; }
    else if (e.eventType === 'TASK_START') { icon = '🚀'; text = `بدء ${e.orderId || '—'}`; color = '#a8c7fa'; }
    else if (e.eventType === 'TASK_COMPLETE') { icon = e.success ? '🏁' : '❌'; text = `${e.orderId || '—'} ${e.success ? 'نجح' : 'فشل'}`; color = e.success ? '#ffffff' : '#ef5350'; }
    else if (e.eventType === 'VALIDATION_WARNING') { icon = '⚠️'; text = e.correlatedLabel ? `"${e.correlatedLabel}" — ${(e.errorText||'').substring(0,60)}` : (e.errorText||'').substring(0,60); color = '#ffc107'; }
    else if (e.eventType === 'CLIENT_VALIDATION_ERROR') { icon = '❌'; text = (e.errorText||'').substring(0,60); color = '#f44336'; }
    else { icon = '📌'; text = e.eventType; color = '#a8c7fa'; }
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#0f1e35;border:1px solid #1f3a5a;border-radius:4px;font-size:10px;">
      <span>${icon}</span>
      <span style="color:${color};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

// ── Manual Analysis (grouped display) ────────────────────
function renderManualAnalysis(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const manual = data.manual || [];
  if (!manual.length) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:var(--muted);">لا توجد تعديلات يدوية</div>';
    return;
  }
  const groups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!groups[key]) groups[key] = { label: e.label || e.field || '—', category: e.category || 'other', diff: diffKey, count: 0 };
    groups[key].count++;
  });
  const sorted = Object.values(groups).sort((a, b) => {
    const order = { serial: 0, model: 1, brand: 2, status: 3, date: 4, spareparts: 5, fault: 6 };
    const ca = order[a.category] ?? 99, cb = order[b.category] ?? 99;
    return ca !== cb ? ca - cb : b.count - a.count;
  });
  const autoArr = data.automated || [];
  const errArr = data.errors || [];
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;">
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ffb74d;">${manual.length}</div><div style="font-size:9px;color:#8899bb;">يدوي</div></div>
      <div style="background:#17334c;padding:4px;border-radius:4px;text-align:center; border:1px solid rgba(255,255,255,0.15);"><div style="font-size:14px;font-weight:700;color:#ffffff;">${autoArr.length}</div><div style="font-size:9px;color:rgba(255,255,255,0.8);">آلي</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ef5350;">${errArr.length}</div><div style="font-size:9px;color:#8899bb;">أخطاء</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#64b5f6;">${errArr.filter(e => e.eventType === 'NETWORK_ERROR').length}</div><div style="font-size:9px;color:#8899bb;">شبكة</div></div>
    </div>
    <div style="font-size:10px;font-weight:700;color:#ffb74d;margin-bottom:4px;">🔧 التعديلات اليدوية (${Object.keys(groups).length} نمط)</div>` +
    sorted.map(g => {
      const catColor = g.category === 'serial' ? '#64b5f6' : g.category === 'model' ? '#ce93d8' : g.category === 'brand' ? '#ffb74d' : '#a8c7fa';
      return `<div style="display:flex;gap:4px;align-items:center;padding:2px 4px;margin-bottom:1px;background:#2e2a1a;border:1px solid #4a4020;border-radius:3px;font-size:10px;">
        <span style="color:#ff9800;font-weight:700;">×${g.count}</span>
        <span style="color:${catColor};">${escapeHtml(g.label)}</span>
        <span style="color:#ef5350;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.diff)}</span>
      </div>`;
    }).join('');
}

// ── Export Smart Log to Excel ────────────────────────────
function exportSmartLogExcel(data) {
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  if (!manual.length && !auto.length && !errors.length) { alert('لا توجد بيانات للتصدير.'); return; }
  if (typeof XLSX === 'undefined') { alert('مكتبة Excel غير متوفرة.'); return; }

  const wb = XLSX.utils.book_new();

  // Sheet 1: يدوي
  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!mGroups[key]) mGroups[key] = { label: e.label || e.field || '—', category: e.category || '', diff: diffKey, count: 0 };
    mGroups[key].count++;
  });
  if (Object.keys(mGroups).length) {
    const mRows = [['الحقل', 'الفئة', 'التغيير', 'عدد التكرارات']];
    Object.values(mGroups).forEach(g => mRows.push([g.label, g.category, g.diff, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(mRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'يدوي');
  }

  // Sheet 2: آلي
  const aGroups = {};
  auto.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${diffKey}`;
    if (!aGroups[key]) aGroups[key] = { label: e.label || e.field || '—', diff: diffKey, count: 0 };
    aGroups[key].count++;
  });
  if (Object.keys(aGroups).length) {
    const aRows = [['الحقل', 'التغيير', 'عدد التكرارات']];
    Object.values(aGroups).forEach(g => aRows.push([g.label, g.diff, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(aRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'آلي');
  }

  // Sheet 3: أخطاء
  const errGroups = {};
  errors.forEach(e => {
    const detail = e.errorText || e.message || e.url || '';
    const key = `${e.eventType}||${detail}`;
    if (!errGroups[key]) errGroups[key] = { type: e.eventType === 'VALIDATION_WARNING' ? 'تحذير' : e.eventType === 'CLIENT_VALIDATION_ERROR' ? 'خطأ عميل' : e.eventType === 'NETWORK_ERROR' ? 'شبكة' : 'خطأ صفحة', detail, count: 0 };
    errGroups[key].count++;
  });
  if (Object.keys(errGroups).length) {
    const eRows = [['النوع', 'الوصف', 'عدد التكرارات']];
    Object.values(errGroups).forEach(g => eRows.push([g.type, g.detail, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(eRows);
    ws['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'أخطاء');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `تحليل_اللوج_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Analyze Smart Log with AI (Ollama) ──────────────────
async function analyzeSmartLogWithAI(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  if (!manual.length && !auto.length && !errors.length) { el.style.display = 'block'; el.innerHTML = '<div style="color:var(--muted);">لا توجد بيانات للتحليل</div>'; return; }

  el.style.display = 'block';
  el.innerHTML = '<div style="color:#a8c7fa;">جاري التحليل مع الذكاء الاصطناعي...</div>';

  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!mGroups[key]) mGroups[key] = { label: e.label || e.field, category: e.category, diff: diffKey, count: 0 };
    mGroups[key].count++;
  });

  const netErrs = errors.filter(e => e.eventType === 'NETWORK_ERROR');
  const netMap = {};
  netErrs.forEach(e => {
    const key = `${e.url} [${e.status}]`;
    netMap[key] = (netMap[key] || 0) + 1;
  });

  const prompt = `حلل بيانات تتبع سلوك المستخدم التالية بالعربية. ركز على:
1. أكثر الحقول اليدوية تغييراً
2. أنماط التكرار
3. الأخطاء المتكررة
4. توصيات للتحسين

التعديلات اليدوية (${manual.length} حدث، ${Object.keys(mGroups).length} نمط):
${Object.values(mGroups).map(g => `${g.label} (${g.category}): ${g.diff} ×${g.count}`).join('\n')}

أخطاء الشبكة:
${Object.entries(netMap).map(([k, v]) => `${k} ×${v}`).join('\n')}

التحذيرات:
${errors.filter(e => e.eventType === 'VALIDATION_WARNING').map(e => e.errorText).join('\n')}

إجمالي: ${manual.length} تعديل يدوي، ${auto.length} آلي، ${errors.length} خطأ`;

  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5-coder:14b', prompt, stream: false })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    el.innerHTML = '<div style="font-size:10px;line-height:1.7;white-space:pre-wrap;color:#a8c7fa;">' + escapeHtml(data.response || 'لا يوجد رد') + '</div>';
  } catch (e) {
    el.innerHTML = `<div style="color:#ef5350;">❌ فشل الاتصال بالذكاء الاصطناعي: ${escapeHtml(e.message)}<br><span style="color:#8899bb;font-size:10px;">تأكد من تشغيل Ollama على localhost:11434</span></div>`;
  }
}

// Smart log search
if (searchLogsInput) {
  searchLogsInput.addEventListener('input', () => {
    renderSmartLog(allSessionLogs, searchLogsInput.value);
  });
}

// Export
document.getElementById('btn-export-sessions')?.addEventListener('click', async () => {
  const { sessionLogs = [] } = await chrome.storage.local.get({ sessionLogs: [] });
  if (!sessionLogs.length) { alert('لا توجد جلسات مسجلة بعد.'); return; }
  const blob = new Blob([JSON.stringify(sessionLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sessions_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  setTimeout(async () => {
    if (confirm('تم التصدير! هل تريد مسح الجلسات الحالية؟')) {
      await chrome.storage.local.set({ sessionLogs: [] });
      await loadSmartLog();
    }
  }, 800);
});

btnRefreshLogs?.addEventListener('click', loadSmartLog);
btnClearLogs?.addEventListener('click', async () => {
  if (!confirm('مسح جميع الجلسات بالكامل؟')) return;
  await chrome.storage.local.set({ sessionLogs: [], activeSession: null });
  allSessionLogs = [];
  renderSmartLog([]);
  updateLogStats([]);
});

// ── Listen for background messages ───────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'STATUS_UPDATE') {
    if (taskItems[msg.taskId]) updateTaskItem(msg.taskId, msg.status, msg.message);
  }
  if (msg.type === 'BATCH_DONE_STORAGE') {
    stopStatusPolling();
    setBatchSearchUI(false);
  }
  if (msg.type === 'NEW_LOG') {
    // If on logs tab, refresh
    if (document.getElementById('panel-logs').classList.contains('active')) {
      loadSmartLog();
    }
  }
});
 
async function initOnLoad() {
  const { currentTask, taskQueue, taskResults } = await chrome.storage.local.get({
    currentTask: null,
    taskQueue: [],
    taskResults: []
  });

  if (currentTask || taskQueue.length > 0) {
    const total = taskResults.length + (currentTask ? 1 : 0) + taskQueue.length;
    const allTasks = [...taskResults, ...(currentTask ? [currentTask] : []), ...taskQueue];
    buildTaskItems(allTasks);
    taskResults.forEach(r => {
      updateTaskItem(r.taskId, r.result, getResultMessage(r.result));
    });
    setBatchSearchUI(true);
    setSearchStatus(`استئناف عرض الجلسة الحالية...`, 'info');
    startStatusPolling(total, allTasks);
  }
}
initOnLoad();

// ══════════════════════════════════════════════════════════
// EXTRACT TAB LOGIC
// ══════════════════════════════════════════════════════════

function setExtractStatus(text, type = 'info') {
  const el = document.getElementById('extract-status-msg');
  if (!el) return;
  el.className = `status-msg ${type}`;
  const icons = { info: 'ℹ️', ok: '✅', error: '❌', warn: '⚠️' };
  el.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(text)}</span>`;
}

// Open Orders page in portal
document.getElementById('btn-extract-open-orders')?.addEventListener('click', async () => {
  chrome.tabs.create({ url: 'https://elarabyportalpfs.powerappsportals.com/en-US/Orders/' });
  setExtractStatus('جاري فتح صفحة Orders في البورتال...', 'info');
});

// Extract all pages
document.getElementById('btn-extract-run')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) {
    setExtractStatus('افتح صفحة Orders في البورتال أولاً', 'warn');
    return;
  }
  setExtractStatus('جاري استخراج كل الصفحات...', 'warn');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_ALL_PAGES' }, 120000);
  if (resp?.ok) {
    setExtractStatus('✅ تم التحميل بنجاح', 'ok');
  } else {
    setExtractStatus(resp?.error || 'فشل الاستخراج', 'error');
  }
});

// Extract current page only
document.getElementById('btn-extract-current-page')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) {
    setExtractStatus('افتح صفحة Orders في البورتال أولاً', 'warn');
    return;
  }
  setExtractStatus('جاري استخراج الصفحة الحالية...', 'warn');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_CURRENT_PAGE' }, 30000);
  if (resp?.ok) {
    setExtractStatus(`✅ تم تحميل ${resp.count || 0} بلاغ`, 'ok');
  } else {
    setExtractStatus(resp?.error || 'فشل الاستخراج', 'error');
  }
});

// ══════════════════════════════════════════════════════════
// TAMPERMONKEY TAB LOGIC
// ══════════════════════════════════════════════════════════

const TM_BUILTIN = [
  {
    id: 'elaraby-phone-reveal',
    name: 'كشف أرقام الهواتف',
    desc: 'يلغي إخفاء أرقام الهاتف في البورتال',
    source: 'Tempermonky/elaraby-phone-reveal.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'messenger-sender',
    name: 'مساعد إرسال الماسنجر',
    desc: 'إرسال رسائل مجمّعة من CSV أو اللصق المباشر',
    source: 'Tempermonky/messenger-sender.js',
    match: 'https://*.facebook.com/*,https://*.messenger.com/*',
  },
  {
    id: 'report-processor',
    name: 'معالج البلاغات',
    desc: 'يفتح البلاغات ويفحص البيانات + اختيار يوم + بلاغات محددة',
    source: 'Tempermonky/report-processor.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
];

function setTmStatus(text, type = 'info') {
  const el = document.getElementById('tm-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--muted)';
}

async function loadTampermonkeyScripts() {
  setTmStatus('جاري تحميل القائمة...', 'info');

  let customScripts = [];
  try {
    const stored = await chrome.storage.local.get({ tampermonkeyCustomScripts: [] });
    customScripts = stored.tampermonkeyCustomScripts || [];
  } catch (e) { /* storage blocked */ }

  const builtinList = document.getElementById('tm-builtin-list');
  const customList = document.getElementById('tm-custom-list');

  // Load running state
  let tmRunning = {};
  try {
    const stored2 = await chrome.storage.local.get({ tmRunning: {} });
    tmRunning = stored2.tmRunning || {};
  } catch (e) { /* storage blocked */ }

  // Live detection: check if scripts are actually running on the active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('elarabyportalpfs.powerappsportals.com')) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const hasRevealPanel = !!document.getElementById('elaraby-fixed-box') || !!document.getElementById('elaraby-mini-btn');
          const hasExtractorPanel = !!document.getElementById('oe-panel');
          const hasReportProcessor = !!document.getElementById('rp-fab');
          const phoneCells = document.querySelectorAll('td');
          let numbersVisible = false;
          for (const td of phoneCells) {
            const txt = td.innerText.trim();
            if (/^01[0-9]{8,9}$/.test(txt)) { numbersVisible = true; break; }
          }
          return { hasRevealPanel, hasExtractorPanel, numbersVisible, hasReportProcessor };
        },
      });
      if (results && results[0]?.result) {
        const r = results[0].result;
        tmRunning['elaraby-phone-reveal'] = { running: r.hasRevealPanel || r.numbersVisible };
        tmRunning['report-processor'] = { running: r.hasReportProcessor };
      }
    } else if (tab && tab.url && (tab.url.includes('facebook.com') || tab.url.includes('messenger.com'))) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const hasPanel = !!document.getElementById('msq-panel');
          return { hasPanel };
        },
      });
      if (results && results[0]?.result) {
        tmRunning['messenger-sender'] = { running: results[0].result.hasPanel };
      }
    }
  } catch (e) { /* detection failed, use stored state */ }

  if (builtinList) {
    builtinList.innerHTML = TM_BUILTIN.map(s => {
      const isRunning = tmRunning[s.id]?.running;
      const injectedAt = tmRunning[s.id]?.injectedAt;
      const timeStr = injectedAt ? new Date(injectedAt).toLocaleTimeString('ar-EG') : '';
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--surface-2);border:1px solid ${isRunning ? 'var(--success,#2bd46f)' : 'var(--border)'};border-radius:6px;">
        <span style="font-size:14px;flex-shrink:0;">${isRunning ? '🟢' : '⚪'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(s.name)} ${isRunning ? '<span style="color:var(--success,#2bd46f);font-size:10px;">● شغال</span>' : ''}</div>
          <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.desc)}${timeStr ? ' — ' + timeStr : ''}</div>
        </div>
        <button class="btn ${isRunning ? 'btn-danger' : 'btn-secondary'} tm-toggle" data-id="${escapeHtml(s.id)}" data-source="${escapeHtml(s.source)}" data-match="${escapeHtml(s.match)}" data-running="${isRunning ? '1' : '0'}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">${isRunning ? '⏹ إيقاف' : '▶️ تشغيل'}</button>
      </div>`;
    }).join('');
  }

  if (customList) {
    if (customScripts.length === 0) {
      customList.innerHTML = '<div class="empty-state" style="padding:12px;font-size:11px;">لا توجد سكريبتات مخصصة</div>';
    } else {
      customList.innerHTML = customScripts.map((s, i) => {
        const cid = 'custom-' + i + '-' + (s.name || '').replace(/[^a-z0-9]/gi, '');
        const isRunning = tmRunning[cid]?.running;
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--surface-2);border:1px solid ${isRunning ? 'var(--success,#2bd46f)' : 'var(--border)'};border-radius:6px;">
          <span style="font-size:14px;flex-shrink:0;">${isRunning ? '🟢' : '⚪'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(s.name || 'Custom')} ${isRunning ? '<span style="color:var(--success,#2bd46f);font-size:10px;">● شغال</span>' : ''}</div>
            <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.desc || 'Script #' + (i+1))}</div>
          </div>
          <button class="btn ${isRunning ? 'btn-danger' : 'btn-secondary'} tm-run-custom" data-idx="${i}" data-cid="${cid}" data-running="${isRunning ? '1' : '0'}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">${isRunning ? '⏹' : '▶️'}</button>
          <button class="btn btn-danger tm-delete" data-idx="${i}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">🗑</button>
        </div>`;
      }).join('');
    }
  }

  // Attach toggle handlers for built-in scripts
  document.querySelectorAll('.tm-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isRunning = btn.dataset.running === '1';

      if (isRunning) {
        // Stop: just mark as not running
        tmRunning[id] = { running: false };
        try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
        setTmStatus(`⏹ تم إيقاف: ${id}`, 'info');
        loadTampermonkeyScripts();
        return;
      }

      // Start: inject and track
      const tab = await getActiveTab();
      if (!tab) { setTmStatus('افتح صفحة أولاً', 'error'); return; }

      const source = btn.dataset.source;
      setTmStatus('جاري تحميل وتنفيذ السكريبت...', 'warn');

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [source],
          world: 'MAIN',
        });

        tmRunning[id] = { running: true, injectedAt: Date.now(), tabId: tab.id, url: tab.url };
        try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
        setTmStatus(`✅ تم تنفيذ: ${id}`, 'ok');
        loadTampermonkeyScripts();
      } catch (e) {
        setTmStatus('❌ ' + e.message, 'error');
      }
    });
  });

  // Attach run handlers for custom scripts
  document.querySelectorAll('.tm-run-custom').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const cid = btn.dataset.cid;
      const isRunning = btn.dataset.running === '1';

      if (isRunning) {
        tmRunning[cid] = { running: false };
        try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
        setTmStatus(`⏹ تم إيقاف`, 'info');
        loadTampermonkeyScripts();
        return;
      }

      const tab = await getActiveTab();
      if (!tab) { setTmStatus('افتح صفحة أولاً', 'error'); return; }

      const code = customScripts[idx]?.code;
      if (!code) { setTmStatus('لا يوجد كود', 'error'); return; }

      setTmStatus('جاري التنفيذ...', 'warn');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (scriptCode) => {
            try { eval(scriptCode); } catch(e) {
              console.error('[TM Custom Script Error]', e);
              throw new Error('CSP يمنع التنفيذ — انسخ السكريبت والصقه يدوياً في Console (F12)');
            }
          },
          args: [code],
        });
        tmRunning[cid] = { running: true, injectedAt: Date.now(), tabId: tab.id, url: tab.url };
        try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
        setTmStatus('✅ تم التنفيذ', 'ok');
        loadTampermonkeyScripts();
      } catch (e) {
        setTmStatus('❌ ' + e.message, 'error');
      }
    });
  });

  // Attach delete handlers
  document.querySelectorAll('.tm-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا السكريبت؟')) return;
      const idx = parseInt(btn.dataset.idx);
      customScripts.splice(idx, 1);
      try { await chrome.storage.local.set({ tampermonkeyCustomScripts: customScripts }); } catch(e) {}
      loadTampermonkeyScripts();
    });
  });

  const runningCount = Object.values(tmRunning).filter(r => r.running).length;
  setTmStatus(`${TM_BUILTIN.length} مدمج (${runningCount} شغال) | ${customScripts.length} مخصص`, 'ok');
}

// File upload for custom scripts
const tmFileInput = document.getElementById('tm-file-input');

if (tmFileInput) {
  tmFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setTmStatus('❌ الملف كبير جداً (الحد الأقصى 512 KB)', 'error');
      tmFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setTmStatus('❌ فشل قراءة الملف', 'error');
      tmFileInput.value = '';
    };
    reader.onload = async (ev) => {
      const code = ev.target.result;
      if (!code || !code.trim()) {
        setTmStatus('❌ الملف فارغ', 'error');
        tmFileInput.value = '';
        return;
      }
      try {
        const stored = await chrome.storage.local.get({ tampermonkeyCustomScripts: [] });
        const scripts = stored.tampermonkeyCustomScripts || [];
        scripts.push({
          name: file.name.replace('.js', ''),
          code: code,
          match: '*://*/*',
          enabled: true,
          addedAt: Date.now(),
        });
        await chrome.storage.local.set({ tampermonkeyCustomScripts: scripts });
        setTmStatus(`✅ تم رفع ${file.name} (${(code.length / 1024).toFixed(1)} KB)`, 'ok');
        loadTampermonkeyScripts();
      } catch (e) {
        console.error('[Tampermonkey Upload]', e);
        setTmStatus('❌ فشل رفع الملف: ' + (e.message || 'خطأ غير معروف'), 'error');
      }
      tmFileInput.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// ── Shortcuts button: opens Edge keyboard-shortcuts page ──
const btnShortcuts = document.getElementById('btn-shortcuts');
if (btnShortcuts) {
  btnShortcuts.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url: 'edge://extensions/shortcuts' }).catch(() => {});
    }
  });
}

// ── Connection strip: is the active tab a portal page? ────
async function refreshConnStrip() {
  const dot = document.getElementById('conn-dot');
  const txt = document.getElementById('conn-text');
  if (!dot || !txt) return;
  try {
    const tab = await getActiveTab();
    if (!tab?.url) { dot.className = 'conn-dot'; txt.textContent = 'لا يوجد تبويب نشط'; return; }
    const isPortal = /elarabyportalpfs\.powerappsportals\.com/.test(tab.url);
    const isCrm    = /elarabyiscrm2\.azurewebsites\.net/.test(tab.url);
    if (isPortal) {
      dot.className = 'conn-dot on';
      txt.textContent = 'بوابة PowerApps متصلة — الاختصارات جاهزة';
    } else if (isCrm) {
      dot.className = 'conn-dot on';
      txt.textContent = 'بوابة CRM متصلة — الاختصارات جاهزة';
    } else {
      dot.className = 'conn-dot off';
      txt.textContent = 'التبويب النشط ليس بوابة — افتح صفحة بوابة أولاً';
    }
  } catch (e) {
    dot.className = 'conn-dot';
    txt.textContent = 'تعذر الفحص';
  }
}
document.addEventListener('DOMContentLoaded', refreshConnStrip);
chrome.tabs.onActivated && chrome.tabs.onActivated.addListener(refreshConnStrip);
chrome.tabs.onUpdated   && chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') refreshConnStrip(); });

// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// SESSION CAPTURE TAB — الجلسة (لقطات الصفحات لحظة بلحظة)
// ══════════════════════════════════════════════════════════

const SESSION_CAPTURE_KEY = 'autofiller_sessionCaptures';

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (_) { return String(ts); }
}

async function loadSessionCaptures() {
  const { [SESSION_CAPTURE_KEY]: all = {} } = await chrome.storage.local.get({ [SESSION_CAPTURE_KEY]: {} });
  const q = (document.getElementById('search-session')?.value || '').trim().toLowerCase();
  renderSessionCaptures(all || {}, q);
}

function fmtDelta(ms) {
  if (ms == null) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m > 0 ? `${m}m` : '') + `${r}s`;
}

function renderSessionCaptures(byOrder, q = '') {
  const list = document.getElementById('session-list');
  const orders = Object.values(byOrder || {}).filter(o => o && o.orderId);
  let totalPages = 0, totalEvents = 0;
  orders.forEach(o => { totalPages += (o.pages || []).length; totalEvents += (o.events || []).length; });

  document.getElementById('session-stat-orders').textContent = `أوامر: ${orders.length}`;
  document.getElementById('session-stat-pages').textContent  = `لقطات صفحات: ${totalPages}`;
  document.getElementById('session-stat-events').textContent = `أحداث: ${totalEvents}`;

  if (!orders.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📸</div><div>لا توجد جلسات مسجلة بعد — افتح صفحة أمر شغل (workorderreview) لتسجيل لحظاتها</div></div>';
    return;
  }

  const filtered = q ? orders.filter(o =>
    (o.orderId || '').toLowerCase().includes(q) ||
    (o.pages || []).some(p => (p.url || '').toLowerCase().includes(q) || (p.pageType || '').toLowerCase().includes(q))
  ) : orders;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><div>لا نتائج مطابقة</div></div>';
    return;
  }

  const html = filtered.map(o => {
    const pages = o.pages || [];
    const events = o.events || [];
    const first = fmtTime(o.firstSeen);
    const last  = fmtTime(o.lastSeen);
    const oid = escapeHtml(o.orderId);

    // بناء Timeline واحد يجمع اللقطات + الأحداث بالترتيب الزمني الفعلي
    const timeline = [];
    pages.forEach(p => timeline.push({ kind: 'page', ...p }));
    events.forEach(e => timeline.push({ kind: 'event', ...e }));
    timeline.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const timelineHtml = timeline.map((item, idx) => {
      const seq = item.seq != null ? item.seq : (idx + 1);
      const delta = fmtDelta(item.delta != null ? item.delta : ((item.ts || 0) - (o.firstSeen || 0)));
      const ts = fmtTime(item.ts);

      if (item.kind === 'page') {
        const selRows = (item.selects || []).map(s =>
          `<li style="margin:0 0 1px 0;"><b>${escapeHtml(s.label || s.name || s.id || '؟')}</b>: <span style="color:${s.selectedValue ? '#ffb74d' : 'var(--muted)'}">${escapeHtml(s.selectedText || s.selectedValue || '(فارغ)')}</span>${s.selectedText ? ` <span style="color:var(--muted)">[${escapeHtml(s.selectedValue)}]</span>` : ''}</li>`
        ).join('');
        const inpRows = (item.inputs || []).map(x =>
          `<li style="margin:0 0 1px 0;"><b>${escapeHtml(x.label || x.name || x.id || '؟')}</b>: <span style="color:${x.value ? '#a8c7fa' : 'var(--muted)'}">${escapeHtml(x.value || '(فارغ)')}</span></li>`
        ).join('');
        const btnList = (item.buttons || []).map(b => b.text).join('، ');
        const pageType = escapeHtml(item.pageType || '');
        const reason = escapeHtml(item.reason || '');

        return `<details style="margin:0 0 6px 0;border-right:3px solid #64b5f6;">
          <summary style="cursor:pointer;font-size:11px;color:#64b5f6;padding:3px 6px;background:#0f1a2e;border-radius:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span style="background:#1e3a5f;color:#fff;border-radius:3px;padding:0 5px;font-weight:700;">#${seq}</span>
            <span style="color:#ffd54f;">⏱ +${delta}</span>
            <span>🖼️ <b>${pageType}</b></span>
            <span style="color:var(--muted);font-size:10px;">${reason}</span>
            <span style="color:var(--muted);font-size:10px;">(${(item.selects || []).length} selects / ${(item.inputs || []).length} inputs / ${(item.buttons || []).length} buttons)</span>
          </summary>
          <div style="padding:5px 6px;font-size:10px;background:#0d1b2a;border-radius:4px;line-height:1.5;">
            <div style="color:var(--muted);word-break:break-all;margin-bottom:4px;">🕐 ${ts} — ${escapeHtml(item.url || '')}</div>
            ${selRows ? `<div style="color:#ffcc80;margin-top:2px;">🔻 القوائم المنسدلة:</div><ul style="margin:2px 0 0 14px;padding:0;list-style:none;">${selRows}</ul>` : ''}
            ${inpRows ? `<div style="color:#90caf9;margin-top:2px;">✏️ الحقول:</div><ul style="margin:2px 0 0 14px;padding:0;list-style:none;">${inpRows}</ul>` : ''}
            ${btnList ? `<div style="color:#a5d6a7;margin-top:2px;">🔘 الأزرار: <span style="color:var(--muted)">${escapeHtml(btnList.slice(0, 400))}</span></div>` : ''}
          </div>
        </details>`;
      }

      // event (كليك / ضغطة)
      const icon = item.type === 'click' ? '👆' : '⚙️';
      const color = item.type === 'click' ? '#ffb74d' : '#90caf9';
      return `<div style="margin:0 0 3px 0;padding:2px 6px;font-size:10px;background:#1a1305;border-radius:4px;border-right:3px solid ${color};display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <span style="background:#5f4a1e;color:#fff;border-radius:3px;padding:0 5px;font-weight:700;">#${seq}</span>
        <span style="color:#ffd54f;">⏱ +${delta}</span>
        <span>${icon} <b style="color:${color};">${escapeHtml(item.tag || '')}</b> ${escapeHtml(item.text || '')}</span>
        <span style="color:var(--muted);font-size:9px;">🕐 ${ts}</span>
      </div>`;
    }).join('') || '<div style="color:var(--muted);padding:4px;">لا أحداث مسجلة بعد</div>';

    // ملخص الأزرار المستخدمة عبر كل اللقطات
    const allBtnTexts = [...new Set(
      (pages || []).flatMap(p => (p.buttons || []).map(b => b.text))
    )].slice(0, 30);

    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;margin-bottom:10px;padding:6px 8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:12px;color:#ffb74d;">🆔 ${oid}</span>
        <span style="font-size:10px;color:var(--muted);">أول: ${first} • آخر: ${last}</span>
      </div>
      <div style="font-size:10px;color:#a8c7fa;margin:2px 0 4px;">📄 ${pages.length} لقطة • 👆 ${events.length} كليك</div>
      ${allBtnTexts.length ? `<div style="font-size:9px;color:var(--muted);margin-bottom:4px;word-break:break-word;">🔘 أزرار الصفحة: ${allBtnTexts.map(t => escapeHtml(t)).join('، ')}</div>` : ''}
      <details open>
        <summary style="cursor:pointer;font-size:10px;font-weight:700;color:#64b5f6;padding:2px 4px;background:#0f1a2e;border-radius:4px;margin-bottom:3px;">⏳ الخط الزمني (بالترتيب الفعلي + التوقيتات)</summary>
        <div style="padding:4px 2px;">${timelineHtml}</div>
      </details>
    </div>`;
  }).join('');

  list.innerHTML = html;
}

function exportSessionCaptures() {
  chrome.storage.local.get({ [SESSION_CAPTURE_KEY]: {} }).then(({ [SESSION_CAPTURE_KEY]: all }) => {
    const blob = new Blob([JSON.stringify(all || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'session-captures-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

function clearSessionCaptures() {
  if (!confirm('مسح كل لقطات الجلسة المسجلة؟')) return;
  chrome.storage.local.remove(SESSION_CAPTURE_KEY).then(loadSessionCaptures);
}

document.getElementById('btn-refresh-session')?.addEventListener('click', loadSessionCaptures);
document.getElementById('btn-export-session')?.addEventListener('click', exportSessionCaptures);
document.getElementById('btn-clear-session')?.addEventListener('click', clearSessionCaptures);
document.getElementById('search-session')?.addEventListener('input', loadSessionCaptures);

// ══════════════════════════════════════════════════════════
// END OF FILE
// ══════════════════════════════════════════════════════════
