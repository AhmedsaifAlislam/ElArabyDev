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

// ── Quick Tools expand/collapse helper ──
function setQuickToolsExpanded(expanded) {
  document.querySelectorAll('.quick-tool-btn').forEach(btn => {
    if (expanded) btn.classList.add('expanded');
    else btn.classList.remove('expanded');
  });
}

// ── Main (Top-Level) Tab Switching ────────────────────────
document.querySelectorAll('.main-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const mainTab = btn.dataset.mainTab;
    const panel = document.getElementById('main-panel-' + mainTab);
    if (panel) panel.classList.add('active');
    // Quick tools: expand on tools tab, collapse otherwise
    setQuickToolsExpanded(mainTab === 'tools');
    // Lazy-load sub-module data when switching to a module
    if (mainTab === 'parts-search') loadPartsSearchSettings();
    if (mainTab === 'financial') initFinancialTab();
    if (mainTab === 'tools') {
      if (document.getElementById('sub-panel-tools-logs')?.classList.contains('active')) loadSmartLog();
      if (document.getElementById('sub-panel-tools-smart-log')?.classList.contains('active')) loadSmartLogDashboard();
      if (document.getElementById('sub-panel-tools-tampermonkey')?.classList.contains('active')) loadTampermonkeyScripts();
    }
  });
});

// ── Quick Tools: فتح قسم الأدوات مباشرة + التبويب الفرعي ──
document.querySelectorAll('.quick-tool-btn').forEach(qb => {
  qb.addEventListener('click', () => {
    // Activate tools main panel
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
    const toolsTab = document.getElementById('main-tab-tools');
    const toolsPanel = document.getElementById('main-panel-tools');
    if (toolsTab) toolsTab.classList.add('active');
    if (toolsPanel) toolsPanel.classList.add('active');
    // Expand quick tools when navigating to tools panel
    setQuickToolsExpanded(true);
    // Activate matching sub-tab inside tools panel
    const subTabBtn = toolsPanel.querySelector('#sub-tab-' + qb.dataset.quick);
    if (subTabBtn) subTabBtn.click();
  });
});

// ── Sub-Tab Switching (within each module) ────────────────
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const subTabs = btn.closest('.sub-tabs');
    if (!subTabs) return;
    subTabs.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    subTabs.parentElement.querySelectorAll('.sub-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = subTabs.parentElement.querySelector('#sub-panel-' + btn.dataset.subTab);
    if (panel) panel.classList.add('active');
    // Lazy-load on specific sub-tabs
    if (btn.dataset.subTab === 'logs' || btn.dataset.subTab === 'tools-logs') loadSmartLog();
    if (btn.dataset.subTab === 'smart-log' || btn.dataset.subTab === 'tools-smart-log') loadSmartLogDashboard();
    if (btn.dataset.subTab === 'tampermonkey' || btn.dataset.subTab === 'tools-tampermonkey') loadTampermonkeyScripts();
    if (btn.dataset.subTab === 'parts-history') loadPartsHistory();
    if (btn.dataset.subTab === 'parts-settings') loadPartsSearchSettings();
    if (btn.dataset.subTab === 'settings' || btn.dataset.subTab === 'tools-settings') loadSettingsEditors();
    if (btn.dataset.subTab === 'tools-excel-autofix') initExcelAutofixTab();
    if (btn.dataset.subTab === 'tools-ai') initAIAssistantTab();
    if (btn.dataset.subTab === 'tools-n8n') initN8NTab();
  });
});

// ── Switch back to the Search/Fill sub-tab (used by replay actions) ──
function switchToSearchTab() {
  ['autofiller', 'parts-search', 'extraction'].forEach(m => {
    const b = document.querySelector(`#main-panel-${m}`)?.querySelector('[data-sub-tab]');
    if (b && b.closest('.main-panel')) b.closest('.main-panel').classList.remove('active');
  });
  document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
  const main = document.getElementById('main-tab-autofiller');
  if (main) main.classList.add('active');
  const panel = document.getElementById('main-panel-autofiller');
  if (panel) panel.classList.add('active');
  document.querySelectorAll('#autofiller-sub-tabs .sub-tab-btn').forEach(b => b.classList.remove('active'));
  const searchBtn = document.querySelector('#sub-tab-search');
  if (searchBtn) searchBtn.classList.add('active');
  document.querySelectorAll('#main-panel-autofiller .sub-tab-panel').forEach(p => p.classList.remove('active'));
  const sp = document.getElementById('sub-panel-search');
  if (sp) sp.classList.add('active');
}

// ── Smart Log buttons ────────────────────────────────────
document.getElementById('sl-btn-refresh')?.addEventListener('click', loadSmartLogDashboard);
document.getElementById('sl-btn-clear')?.addEventListener('click', async () => {
  if (!confirm('مسح كل بيانات التتبع؟')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_SMART_LOG' });
  currentSmartLogData = { manual: [], automated: [], errors: [], events: [], network: [] };
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-btn-analyze')?.addEventListener('click', () => renderManualAnalysis(currentSmartLogData));
document.getElementById('sl-btn-excel')?.addEventListener('click', () => exportSmartLogExcel(currentSmartLogData));
document.getElementById('sl-btn-ai')?.addEventListener('click', () => analyzeSmartLogWithAI(currentSmartLogData));

// ── Smart Log advanced buttons (بحث/تحديث حي/خط زمني/ملخص/تنبيهات) ──
let slSearchText = '';
let slLiveEnabled = false;
let slFilterFrom = 0;
let slFilterTo = 0;
let slFilterPage = '';
let slLiveTimer = null;

document.getElementById('sl-search')?.addEventListener('input', (e) => {
  slSearchText = (e.target.value || '').toLowerCase().trim();
  renderSmartLogDashboard(currentSmartLogData);
});

document.getElementById('sl-btn-live')?.addEventListener('click', () => {
  slLiveEnabled = !slLiveEnabled;
  const btn = document.getElementById('sl-btn-live');
  if (btn) btn.style.background = slLiveEnabled ? '#1a3a1a' : '#1e304b';
  if (slLiveEnabled) {
    slLiveTimer = setInterval(() => { loadSmartLogDashboard(true); }, 4000);
  } else if (slLiveTimer) {
    clearInterval(slLiveTimer);
    slLiveTimer = null;
  }
});

document.getElementById('sl-btn-timeline')?.addEventListener('click', () => {
  const el = document.getElementById('sl-timeline');
  const parent = el?.closest('details');
  if (parent) parent.open = !parent.open;
  if (el && !parent?.open) renderTimeline(currentSmartLogData);
});

document.getElementById('sl-btn-summary')?.addEventListener('click', () => aiSessionSummary(currentSmartLogData));

document.getElementById('sl-btn-alerts')?.addEventListener('click', () => {
  const el = document.getElementById('sl-anomalies');
  const parent = el?.closest('details');
  if (parent) parent.open = !parent.open;
  if (el) renderAnomalies(currentSmartLogData);
});

document.getElementById('sl-ai-ask')?.addEventListener('click', () => askAISmartLog());

document.getElementById('sl-ai-question')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') askAISmartLog();
});

document.getElementById('sl-btn-csv')?.addEventListener('click', () => exportSmartLogCSV(currentSmartLogData));
document.getElementById('sl-btn-json')?.addEventListener('click', () => exportSmartLogJSON(currentSmartLogData));
document.getElementById('sl-btn-snapshot')?.addEventListener('click', () => saveSmartLogSnapshot());
document.getElementById('sl-btn-restore')?.addEventListener('click', () => restoreSmartLogSnapshot());
document.getElementById('sl-btn-report')?.addEventListener('click', () => exportSmartLogWeeklyReport(currentSmartLogData));

// ⚖️ مقارنة جلستين (الحالي vs المحفوظ) — عبر أداة المسح في شريط البحث
document.getElementById('sl-btn-charts')?.addEventListener('click', () => {
  const el = document.getElementById('sl-charts');
  const parent = el?.closest('details');
  if (parent) parent.open = !parent.open;
  if (el) renderCharts(currentSmartLogData);
});

// 📊 فلاتر متقدمة: نطاق تاريخ + صفحة
document.getElementById('sl-btn-alerts')?.addEventListener('click', () => {
  const el = document.getElementById('sl-anomalies');
  const parent = el?.closest('details');
  if (parent) parent.open = !parent.open;
  if (el) renderAnomalies(currentSmartLogData);
});

document.getElementById('sl-filters-toggle')?.addEventListener('click', () => {
  const f = document.getElementById('sl-filters');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('sl-filter-from')?.addEventListener('change', (e) => {
  slFilterFrom = e.target.value ? new Date(e.target.value).getTime() : 0;
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-filter-to')?.addEventListener('change', (e) => {
  slFilterTo = e.target.value ? new Date(e.target.value).getTime() + 86400000 - 1 : 0;
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-filter-page')?.addEventListener('change', (e) => {
  slFilterPage = e.target.value || '';
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-btn-filter-clear')?.addEventListener('click', () => {
  slFilterFrom = 0; slFilterTo = 0; slFilterPage = '';
  ['sl-filter-from', 'sl-filter-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pg = document.getElementById('sl-filter-page'); if (pg) pg.value = '';
  renderSmartLogDashboard(currentSmartLogData);
});

// ⚖️ مقارنة جلستين: الحالي vs آخر نسخة محفوظة
document.getElementById('sl-btn-compare')?.addEventListener('click', () => {
  const el = document.getElementById('sl-compare');
  const parent = el?.closest('details');
  if (parent) parent.open = !parent.open;
  if (el) renderCompare(currentSmartLogData);
});

// ── AI Settings (OpenCode Zen) ─────────────────────────────
const aiKeyInput = document.getElementById('ai-api-key');
const aiModelSelect = document.getElementById('ai-model');
const aiSaveBtn = document.getElementById('ai-save-config');
const aiSaveStatus = document.getElementById('ai-save-status');

(async function loadAIConfig() {
  const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
  let model = aiConfig.model || '';
  if (model.includes('/')) model = model.split('/').pop();
  if (aiKeyInput && aiConfig.apiKey) aiKeyInput.value = aiConfig.apiKey;
  if (aiModelSelect && model) aiModelSelect.value = model;
})();

aiSaveBtn?.addEventListener('click', async () => {
  const aiConfig = { apiKey: (aiKeyInput.value || '').trim(), model: aiModelSelect.value || 'deepseek-v4-flash-free' };
  await chrome.storage.local.set({ aiConfig });
  if (aiSaveStatus) { aiSaveStatus.style.display = 'block'; setTimeout(() => { aiSaveStatus.style.display = 'none'; }, 2000); }
});

// ── Smart Log accordion: افتح واحدة تقفل الباقي ──────────
document.getElementById('sub-panel-tools-smart-log')?.addEventListener('toggle', (e) => {
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
  const total = tasks.length;
  tasks.forEach((t, idx) => {
    const taskNumber = `${idx + 1}/${total}`;
    const div = document.createElement('div');
    div.className = 'task-item pending';
    div.id = 'ti-' + t.taskId;
    div.innerHTML = `
      <span class="task-icon">${STATUS_ICON.pending}</span>
      <div class="task-body">
        <div class="task-order-id"><span class="task-number">${taskNumber}</span> ${escapeHtml(t.orderId)}</div>
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
  const onStatusMsg = cfg?.onStatusMsg || ((d, t, s, f, nf, phase) => {
    const phaseLabel = getPhaseLabel(phase);
    setSearchStatus(`${phaseLabel} ${d}/${t} — نجح: ${s} | غير موجود: ${nf} | فشل: ${f}`, 'info');
  });
  const stopFn = cfg?.stopFn || stopStatusPolling;

  let doneCount = 0;
  const taskIds = tasks.map(t => t.taskId);

  if (_storageListener) { chrome.storage.onChanged.removeListener(_storageListener); _storageListener = null; }

  const listener = async (changes, area) => {
    if (area !== 'local') return;

    if (changes.lastStatusUpdate?.newValue) {
      const { taskId, status, message, phase } = changes.lastStatusUpdate.newValue;
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
        onStatusMsg(doneCount, total, success, failed, notFound, phase);
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

function getPhaseLabel(phase) {
  const labels = {
    'search': '🔍 بحث',
    'navigation': '🔗 تنقل',
    'page1-review': '📝 تعبئة صفحة 1',
    'page2-problems': '⚠️ مشاكل فعلية',
    'page2-technician': '👷 فنيين',
    'page3-faults': '🔧 أكواد أعطال',
    'saving': '💾 حفظ',
    'complete': '✅ مكتمل',
    'paused': '⏸️ متوقف',
    'retry': '🔄 إعادة',
    'error': '❌ خطأ'
  };
  return labels[phase] || '';
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
  const remaining = total - done;
  searchProgressB.style.width = total > 0 ? ((done / total) * 100) + '%' : '0%';
  searchCounter.textContent = `${done}/${total} — متبقي: ${remaining} — نجح: ${success} | فشل: ${failed}`;
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

  const task = { taskId: generateTaskId(), orderId, line: finalLine, data: { forceDrainCleaning, shahnEnabled, forceOverwrite } };
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
      return { taskId: generateTaskId(), orderId: oid, line: finalLine, data: { forceDrainCleaning, shahnEnabled: shahnForTasks, forceOverwrite } };
    }).filter(t => t.orderId);
  } else if (isSecondVisit) {
    tasks = lines.map(line => {
      const oid = extractOrderId(line) || line.trim();
      const finalLine = generateSecondVisitLine(oid, productType, profiles);
      return { taskId: generateTaskId(), orderId: oid, line: finalLine, data: { forceDrainCleaning, shahnEnabled: shahnForTasks, forceOverwrite } };
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
        // فحص هل الجهاز تكييف أو Sharp من السطر الأول
        const obj1 = parseLineToObject(group.lines[0]);
        const isAC = /تكييف|ac|air.?cond|split|شباك|inverter/i.test(obj1['reporttype'] || obj1['report'] || '');
        const isSharp = /sharp/i.test(obj1['brand'] || obj1['علامهتجاريه'] || '');

        // دمج السطر الثاني (الوحدة الثانية: خارجية/داخلية) كموديل/سيريال 2
        if (isAC || isSharp) {
          const obj2 = parseLineToObject(group.lines[1]);
          const m2 = obj2['model'] || obj2['موديل'] || '';
          const s2 = obj2['serial'] || obj2['serialnumber'] || '';
          const d2 = obj2['date'] || obj2['تاريخ'] || '';
          if (m2 && String(m2).toLowerCase() !== 'null') mergedLine += ` | Model2: ${m2}`;
          if (s2 && String(s2).toLowerCase() !== 'null') mergedLine += ` | Serial2: ${s2}`;
          if (d2 && String(d2).toLowerCase() !== 'null') mergedLine += ` | Date2: ${d2}`;
        }
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
        <span style="font-size:11px;color:#4caf50;">${success} نجح</span>
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
      switchToSearchTab();
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
      switchToSearchTab();
      buildTaskItems([t]);
      startStatusPolling(1, [t]);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// TELEMETRY — مبسط: آلي/يدوي فقط
// ═══════════════════════════════════════════════════════════

let currentSmartLogData = { manual: [], automated: [], errors: [], events: [], network: [] };

async function loadSmartLogDashboard(silent) {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_SMART_LOG' });
  currentSmartLogData = resp || { manual: [], automated: [], errors: [], events: [], network: [] };
  if (!silent) renderSmartLogDashboard(currentSmartLogData);
  else renderSmartLogDashboard(currentSmartLogData);
}

function slFilter(arr) {
  if (!arr) return arr;
  if (slSearchText) arr = arr.filter(e => JSON.stringify(e).toLowerCase().includes(slSearchText));
  if (slFilterFrom) arr = arr.filter(e => (e.timestamp || 0) >= slFilterFrom);
  if (slFilterTo) arr = arr.filter(e => (e.timestamp || 0) <= slFilterTo);
  if (slFilterPage) arr = arr.filter(e => (e.page || '').includes(slFilterPage));
  return arr;
}

function renderSmartLogDashboard(data) {
  const manualArr = slFilter(data.manual || []);
  const autoArr = slFilter(data.automated || []);
  const errArr = slFilter(data.errors || []);
  const evtArr = slFilter(data.events || []);
  const netArr = slFilter(data.network || []);
  const total = manualArr.length + autoArr.length + errArr.length + evtArr.length + netArr.length;

  // ملء قائمة الصفحات للفلاتر المتقدمة (مرة واحدة، مع الحفاظ على التحديد)
  const pageSel = document.getElementById('sl-filter-page');
  if (pageSel && !pageSel.dataset.filled) {
    const pages = new Set();
    [...(data.manual || []), ...(data.errors || []), ...(data.network || [])].forEach(e => { if (e.page) pages.add(e.page); });
    [...pages].sort().forEach(p => {
      const o = document.createElement('option');
      o.value = p; o.textContent = p;
      pageSel.appendChild(o);
    });
    pageSel.dataset.filled = '1';
  }

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
  renderNetworkLog(netArr);
  renderActionLog(evtArr);
  renderTimeline(data);
  renderAnomalies(data);
  renderInsights(data);
  renderSessions();
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
      <span style="color:#4caf50;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.newValue || '(فارغ)')}</span>
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

// ── طلبات الشبكة (من سكربت الفلتر — fetch/XHR/iframe) ──
function renderNetworkLog(logs) {
  const countEl = document.getElementById('sl-network-count');
  const el = document.getElementById('sl-network-log');
  if (!el) return;
  const arr = (logs || []).filter(e => e.eventType === 'NETWORK_REQUEST');
  if (countEl) countEl.textContent = arr.length;
  if (!arr.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد طلبات شبكة مسجلة</div>'; return; }

  const grouped = {};
  arr.forEach(e => {
    const key = `${e.kind || 'fetch'}||${e.method || 'GET'}||${e.requestUrl || e.url || '—'}`;
    if (!grouped[key]) grouped[key] = { kind: e.kind || 'fetch', method: e.method || 'GET', url: e.requestUrl || e.url || '—', modified: !!e.modified, count: 0, lastTime: 0 };
    grouped[key].count++;
    grouped[key].lastTime = Math.max(grouped[key].lastTime, e.timestamp || 0);
  });

  const icons = { fetch: '🌐', xhr: '📡', frame: '🖼️' };
  const colors = { fetch: '#f59e0b', xhr: '#8b5cf6', frame: '#06b6d4' };
  const sorted = Object.values(grouped).sort((a, b) => b.lastTime - a.lastTime).slice(0, 100);

  el.innerHTML = sorted.map(g => {
    const time = g.lastTime ? new Date(g.lastTime).toLocaleTimeString('ar-EG') : '';
    const badge = g.modified ? '<span style="color:#10b981;font-weight:700;font-size:9px;">🔓</span>' : '';
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#0a1520;border:1px solid #1a2a3a;border-radius:4px;font-size:10px;">
      <span style="color:${colors[g.kind] || '#a8c7fa'};">${icons[g.kind] || '🌐'}</span>
      ${g.count > 1 ? `<span style="color:#ff9800;font-weight:700;white-space:nowrap;">×${g.count}</span>` : ''}
      <span style="color:${colors[g.kind] || '#a8c7fa'};font-weight:600;white-space:nowrap;">${escapeHtml(g.method)}</span>
      ${badge}
      <span style="color:#a8c7fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(g.url)}">${escapeHtml(g.url)}</span>
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
    if (e.eventType === 'FIELD_FILLED') { icon = '✅'; text = `${e.field || '—'} = ${e.value || '—'}`; color = '#4caf50'; }
    else if (e.eventType === 'TASK_START') { icon = '🚀'; text = `بدء ${e.orderId || '—'}`; color = '#2196f3'; }
    else if (e.eventType === 'TASK_COMPLETE') { icon = e.success ? '🏁' : '❌'; text = `${e.orderId || '—'} ${e.success ? 'نجح' : 'فشل'}`; color = e.success ? '#4caf50' : '#ef5350'; }
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
  const netArr = (data.network || []).filter(e => e.eventType === 'NETWORK_REQUEST');
  const netKinds = {};
  netArr.forEach(e => { netKinds[e.kind || 'fetch'] = (netKinds[e.kind || 'fetch'] || 0) + 1; });
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px;">
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ffb74d;">${manual.length}</div><div style="font-size:9px;color:#8899bb;">يدوي</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#4caf50;">${autoArr.length}</div><div style="font-size:9px;color:#8899bb;">آلي</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ef5350;">${errArr.length}</div><div style="font-size:9px;color:#8899bb;">أخطاء</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#64b5f6;">${errArr.filter(e => e.eventType === 'NETWORK_ERROR').length}</div><div style="font-size:9px;color:#8899bb;">شبكة خاطئة</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#f59e0b;">${netArr.length}</div><div style="font-size:9px;color:#8899bb;">طلبات (${Object.entries(netKinds).map(([k, c]) => `${k}:${c}`).join(' ')} )</div></div>
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

  // Sheet 4: طلبات الشبكة
  const netArr = (data.network || []).filter(e => e.eventType === 'NETWORK_REQUEST');
  const netGroups = {};
  netArr.forEach(e => {
    const key = `${e.kind || 'fetch'}||${e.method || 'GET'}||${e.requestUrl || e.url || ''}`;
    if (!netGroups[key]) netGroups[key] = { kind: e.kind || 'fetch', method: e.method || 'GET', url: e.requestUrl || e.url || '', modified: !!e.modified, count: 0 };
    netGroups[key].count++;
  });
  if (Object.keys(netGroups).length) {
    const nRows = [['النوع', 'الطريقة', 'الرابط', 'معدّل', 'عدد التكرارات']];
    Object.values(netGroups).forEach(g => nRows.push([g.kind, g.method, g.url, g.modified ? 'نعم' : 'لا', g.count]));
    const ws = XLSX.utils.aoa_to_sheet(nRows);
    ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 60 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'طلبات الشبكة');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `تحليل_اللوج_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Export Smart Log as CSV (flattened rows) ────────────
function exportSmartLogCSV(data) {
  const rows = [['الحدث', 'النوع', 'الوقت', 'التفاصيل']];
  const all = [
    ...(data.manual || []).map(e => ({ et: 'يدوي', type: e.label || e.field, ts: e.timestamp, det: `${e.oldValue || ''} → ${e.newValue || ''}` })),
    ...(data.automated || []).map(e => ({ et: 'آلي', type: e.label || e.field, ts: e.timestamp, det: `${e.oldValue || ''} → ${e.newValue || ''}` })),
    ...(data.errors || []).map(e => ({ et: 'خطأ', type: e.eventType, ts: e.timestamp, det: e.errorText || e.message || e.url || '' })),
    ...(data.events || []).map(e => ({ et: 'حدث', type: e.eventType, ts: e.timestamp, det: e.url || '' })),
    ...(data.network || []).map(e => ({ et: 'شبكة', type: `${e.kind} ${e.method}`, ts: e.timestamp, det: `${e.requestUrl || ''}${e.modified ? ' 🔓' : ''}` }))
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (!all.length) { alert('لا توجد بيانات للتصدير.'); return; }
  const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const csv = rows.concat(all.map(r => [esc(r.et), esc(r.type), esc(new Date(r.ts).toLocaleString('ar-EG')), esc(r.det)]))
    .map(row => row.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `لوج_ذكي_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Export Smart Log as JSON (raw) ─────────────────────
function exportSmartLogJSON(data) {
  if (!Object.values(data).some(a => (a || []).length)) { alert('لا توجد بيانات للتصدير.'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `لوج_ذكي_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
}

// ── Weekly Report (printable HTML → Save as PDF) ────────
function exportSmartLogWeeklyReport(data) {
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  const net = (data.network || []).filter(e => e.eventType === 'NETWORK_REQUEST');
  if (!manual.length && !auto.length && !errors.length && !net.length) { alert('لا توجد بيانات للتقرير.'); return; }

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

  const inWeek = (ts) => ts && ts >= weekStart.getTime();
  const mWeek = manual.filter(e => inWeek(e.timestamp)).length;
  const aWeek = auto.filter(e => inWeek(e.timestamp)).length;
  const eWeek = errors.filter(e => inWeek(e.timestamp)).length;
  const nWeek = net.filter(e => inWeek(e.timestamp)).length;

  const fmt = (ts) => new Date(ts).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

  const mRows = manual.slice(-8).reverse().map(e => `
    <tr><td>${escapeHtml(e.label || e.field || '—')}</td><td>${escapeHtml(e.category || '')}</td>
    <td>${escapeHtml(e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`)}</td>
    <td>${escapeHtml(e.isAutomated ? 'آلي' : 'يدوي')}</td><td>${fmt(e.timestamp || Date.now())}</td></tr>`).join('');

  const eRows = errors.slice(-8).reverse().map(e => `
    <tr><td>${escapeHtml(e.eventType || '')}</td><td>${escapeHtml((e.errorText || e.message || e.url || '').slice(0, 90))}</td>
    <td>${fmt(e.timestamp || Date.now())}</td></tr>`).join('');

  const nRows = net.slice(-8).reverse().map(e => `
    <tr><td>${escapeHtml(e.kind || 'fetch')}</td><td>${escapeHtml(e.method || 'GET')}</td>
    <td>${escapeHtml((e.requestUrl || e.url || '').slice(0, 70))}</td>
    <td>${e.modified ? '🔓 نعم' : '—'}</td><td>${fmt(e.timestamp || Date.now())}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>تقرير اللوج الذكي الأسبوعي</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#1a1a2e;margin:24px;}
    h1{color:#3f51b5;border-bottom:2px solid #3f51b5;padding-bottom:8px;font-size:20px;}
    h2{color:#5c6bc0;font-size:15px;margin-top:22px;}
    .grid{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap;}
    .card{flex:1;min-width:120px;border:1px solid #e0e0f0;border-radius:8px;padding:10px;text-align:center;}
    .card b{font-size:22px;color:#3f51b5;display:block;}
    .card span{font-size:11px;color:#666;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0;}
    th,td{border:1px solid #e0e0f0;padding:5px 8px;text-align:right;}
    th{background:#f5f5ff;color:#333;}
    .foot{color:#999;font-size:10px;margin-top:24px;border-top:1px solid #eee;padding-top:8px;}
    @media print{button{display:none}}
  </style></head><body>
  <h1>📋 تقرير اللوج الذكي الأسبوعي</h1>
  <div style="color:#666;font-size:12px;margin-bottom:12px;">الفترة: ${weekStart.toLocaleDateString('ar-EG')} ← ${now.toLocaleDateString('ar-EG')} — إجمالي السجلات في هذا الأسبوع: ${mWeek + aWeek + eWeek + nWeek}</div>
  <button onclick="window.print()" style="padding:8px 16px;background:#3f51b5;color:#fff;border:none;border-radius:6px;cursor:pointer;">🖨️ حفظ كـ PDF (طباعة)</button>

  <div class="grid">
    <div class="card"><b>${mWeek}</b><span>تعديلات يدوية (أسبوع)</span></div>
    <div class="card"><b>${aWeek}</b><span>تعديلات آلية (أسبوع)</span></div>
    <div class="card"><b>${eWeek}</b><span>أخطاء (أسبوع)</span></div>
    <div class="card"><b>${nWeek}</b><span>طلبات شبكة (أسبوع)</span></div>
    <div class="card"><b>${manual.length}</b><span>إجمالي يدوي</span></div>
    <div class="card"><b>${errors.length}</b><span>إجمالي أخطاء</span></div>
  </div>

  <h2>أحدث التعديلات اليدوية</h2>
  ${mRows ? `<table><tr><th>الحقل</th><th>الفئة</th><th>التغيير</th><th>النوع</th><th>الوقت</th></tr>${mRows}</table>` : '<div style="color:#999;">لا توجد</div>'}

  <h2>أحدث الأخطاء</h2>
  ${eRows ? `<table><tr><th>النوع</th><th>الوصف</th><th>الوقت</th></tr>${eRows}</table>` : '<div style="color:#999;">لا توجد</div>'}

  <h2>أحدث طلبات الشبكة</h2>
  ${nRows ? `<table><tr><th>النوع</th><th>الطريقة</th><th>الرابط</th><th>معدّل</th><th>الوقت</th></tr>${nRows}</table>` : '<div style="color:#999;">لا توجد</div>'}

  <div class="foot">تم إنشاء التقرير بواسطة اللوج الذكي — El Araby Unified Extension — ${now.toLocaleString('ar-EG')}</div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) { alert('افتح النوافذ المنبثقة للإضافة لتوليد التقرير.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.print(); } catch (_) {} }, 600);
}

// ── Snapshot: حفظ/استعادة نسخة كاملة من اللوج الذكي ──
const SNAPSHOT_KEY = 'sl_snapshot';

function saveSmartLogSnapshot() {
  chrome.storage.local.set({ [SNAPSHOT_KEY]: currentSmartLogData }, () => {
    alert('✅ تم حفظ نسخة من اللوج الذكي الحالي. يمكنك استعادتها في أي وقت.');
  });
}

function restoreSmartLogSnapshot() {
  chrome.storage.local.get({ [SNAPSHOT_KEY]: null }, async (res) => {
    if (!res[SNAPSHOT_KEY]) { alert('لا توجد نسخة محفوظة بعد.'); return; }
    if (!confirm('سيتم استبدال اللوج الذكي الحالي بالنسخة المحفوظة. متابعة؟')) return;
    const snap = res[SNAPSHOT_KEY];
    await chrome.runtime.sendMessage({
      type: 'RESTORE_SMART_LOG',
      payload: { manual: snap.manual || [], automated: snap.automated || [], errors: snap.errors || [], events: snap.events || [], network: snap.network || [] }
    });
    currentSmartLogData = snap;
    renderSmartLogDashboard(currentSmartLogData);
  });
}

// ── Analyze Smart Log with AI (streaming via ai-client) ──
async function analyzeSmartLogWithAI(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  if (!manual.length && !auto.length && !errors.length) { el.style.display = 'block'; el.innerHTML = '<div style="color:var(--muted);">لا توجد بيانات للتحليل</div>'; return; }

  el.style.display = 'block';
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:#a8c7fa;"><span class="sl-spinner"></span> جاري التحليل مع الذكاء الاصطناعي...</div>';
  if (!document.querySelector('style#sl-spinner-css')) {
    const s = document.createElement('style');
    s.id = 'sl-spinner-css';
    s.textContent = '.sl-spinner{width:12px;height:12px;border:2px solid #3a5a8a;border-top-color:#a8c7fa;border-radius:50%;display:inline-block;animation:slspin .7s linear infinite;}@keyframes slspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

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

  const netReqs = (data.network || []).filter(e => e.eventType === 'NETWORK_REQUEST');
  const netReqMap = {};
  netReqs.forEach(e => {
    const key = `${e.kind || 'fetch'} ${e.method || 'GET'} ${(e.requestUrl || e.url || '').slice(0, 80)}${e.modified ? ' 🔓' : ''}`;
    netReqMap[key] = (netReqMap[key] || 0) + 1;
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

طلبات الشبكة المجمعة (${netReqs.length} طلب، ${Object.keys(netReqMap).length} نمط):
${Object.entries(netReqMap).map(([k, v]) => `${k} ×${v}`).join('\n')}

التحذيرات:
${errors.filter(e => e.eventType === 'VALIDATION_WARNING').map(e => e.errorText).join('\n')}

إجمالي: ${manual.length} تعديل يدوي، ${auto.length} آلي، ${errors.length} خطأ، ${netReqs.length} طلب شبكة`;

  const system = 'أنت محلّل محترف لسجلات تتبع سلوك المستخدم في واجهات البوابة. أجب بالعربية وبتلخيص مختصر ومنظم.';
  const out = document.createElement('div');
  out.style.cssText = 'font-size:10px;line-height:1.7;white-space:pre-wrap;color:#a8c7fa;';
  el.appendChild(out);

  try {
    let res;
    if (typeof global.aiChatStream === 'function') {
      res = await global.aiChatStream(prompt, { system, maxTokens: 900 }, (full) => { out.textContent = full; });
    } else if (typeof global.aiChat === 'function') {
      res = await global.aiChat(prompt, { system, maxTokens: 900 });
      if (res.ok) out.textContent = res.text;
    } else {
      // Fallback قديم: رسالة مباشرة للـ background
      const resp = await chrome.runtime.sendMessage({ type: 'AI_CHAT', payload: { system, prompt } });
      res = { ok: !!(resp && resp.ok), text: resp?.text || '', error: resp?.error, message: resp?.message };
      if (res.ok && res.text) out.textContent = res.text;
    }
    if (!res.ok) {
      out.innerHTML = `<div style="color:#ef5350;">❌ ${escapeHtml(res.message || res.error || 'فشل الاتصال')}<br><span style="color:#8899bb;font-size:10px;">ضع API Key في تبويب المساعد الذكي ← الإعدادات</span></div>`;
    } else if (!(res.text || '').trim()) {
      out.innerHTML = '<div style="color:#ffb74d;">⚠️ النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج في الإعدادات</div>';
    }
  } catch (e) {
    out.innerHTML = `<div style="color:#ef5350;">❌ فشل الاتصال بالذكاء الاصطناعي: ${escapeHtml(e.message || String(e))}<br><span style="color:#8899bb;font-size:10px;">أعد تحميل الإضافة بعد حفظ المفتاح</span></div>`;
  }
}
 
// ── Smart Log: Timeline, Anomalies, Insights, AI Summary, AI Chat ──
function renderTimeline(data) {
  const el = document.getElementById('sl-timeline');
  if (!el) return;
  const all = [
    ...(data.manual || []).map(e => ({ ...e, _src: '👤' })),
    ...(data.automated || []).map(e => ({ ...e, _src: '🤖' })),
    ...(data.errors || []).map(e => ({ ...e, _src: '❌' })),
    ...(data.events || []).map(e => ({ ...e, _src: '📌' })),
    ...(data.network || []).map(e => ({ ...e, _src: '📡' }))
  ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100);

  if (!all.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد أحداث</div>'; return; }
  el.innerHTML = all.map(e => {
    const t = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    const txt = e.eventType || e.type || '—';
    const detail = e.label || e.field || e.diff || e.url || e.errorText || e.value || '';
    return `<div style="display:flex;gap:4px;align-items:center;padding:2px 4px;border-bottom:1px solid #122033;font-size:10px;">
      <span>${e._src}</span>
      <span style="color:#4dd0e1;white-space:nowrap;">${escapeHtml(txt)}</span>
      <span style="color:#a8c7fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(String(detail).slice(0, 70))}</span>
      <span style="color:var(--muted);white-space:nowrap;">${t}</span>
    </div>`;
  }).join('');
}

function renderAnomalies(data) {
  const el = document.getElementById('sl-anomalies');
  if (!el) return;
  const findings = [];
  const manual = data.manual || [];

  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!mGroups[key]) mGroups[key] = { label: e.label || e.field || '—', diff: diffKey, count: 0 };
    mGroups[key].count++;
  });
  Object.values(mGroups).filter(g => g.count >= 5).forEach(g => {
    findings.push(`🔄 التكرار المرتفع: "${g.label}" غُيّر ${g.count} مرات بنفس النمط (${g.diff})`);
  });

  const errGroups = {};
  (data.errors || []).forEach(e => {
    const detail = e.errorText || e.message || e.url || e.eventType;
    errGroups[detail] = (errGroups[detail] || 0) + 1;
  });
  Object.entries(errGroups).filter(([k, v]) => v >= 3).forEach(([k, v]) => {
    findings.push(`🚨 الخطأ المتكرر: ${v} مرات — ${String(k).slice(0, 80)}`);
  });

  if (!findings.length) { el.innerHTML = '<div style="color:#4caf50;padding:4px;">✅ لا توجد شذوذ أو أنماط متكررة</div>'; return; }
  el.innerHTML = findings.slice(0, 10).map(f =>
    `<div style="padding:3px 4px;margin-bottom:2px;background:#2e1010;border:1px solid #5a2020;border-radius:4px;font-size:10px;color:#ff8a80;">${escapeHtml(f)}</div>`
  ).join('');
}

function renderInsights(data) {
  const el = document.getElementById('sl-insights');
  if (!el) return;
  const manual = data.manual || [], errors = data.errors || [], net = data.network || [];
  const total = manual.length + (data.automated || []).length + errors.length + (data.events || []).length + net.length;
  if (!total) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  const fieldCounts = {};
  manual.forEach(e => { fieldCounts[e.label || e.field] = (fieldCounts[e.label || e.field] || 0) + 1; });
  const topField = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0];

  const hourCounts = {};
  [...manual, ...errors, ...net].forEach(e => {
    if (!e.timestamp) return;
    const h = new Date(e.timestamp).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const errorRate = total ? Math.round((errors.length / total) * 100) : 0;

  el.innerHTML = `
    <div style="font-weight:700;color:#4dd0e1;margin-bottom:3px;">📈 نظرة سريعة</div>
    <div>🔤 أكثر حقل تغيّر يدوياً: <b style="color:#ffb74d;">${topField ? `${escapeHtml(topField[0])} (×${topField[1]})` : '—'}</b></div>
    <div>⏰ أكثر ساعة نشاطاً: <b style="color:#ce93d8;">${topHour ? `${topHour[0]}:00 (${topHour[1]} حدث)` : '—'}</b></div>
    <div>📊 نسبة الأخطاء: <b style="color:${errorRate > 30 ? '#ef5350' : errorRate > 10 ? '#ffb74d' : '#4caf50'};">${errorRate}%</b> (${errors.length}/${total})</div>
    <div>📡 طلبات الشبكة: <b style="color:#f59e0b;">${net.length}</b> — تم تعديل ${net.filter(e => e.modified).length} منها (توسيع نطاق)</div>`;
}

// ── الجلسات: من سجل الجلسات الحقيقي (sessionLogs) ──────
async function renderSessions() {
  const el = document.getElementById('sl-sessions');
  if (!el) return;
  try {
    const { sessionLogs = [], activeSession = null } = await chrome.storage.local.get({ sessionLogs: [], activeSession: null });
    const all = [...(activeSession ? [{ _isActive: true, ...activeSession }] : []), ...sessionLogs];
    if (!all.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد جلسات مسجلة</div>'; return; }

    const totalDuration = all.reduce((a, s) => {
      const st = s.startTime ? new Date(s.startTime).getTime() : 0;
      const en = s.endTime ? new Date(s.endTime).getTime() : Date.now();
      return a + (en > st ? en - st : 0);
    }, 0);
    const totalOrders = all.reduce((a, s) => a + (s.orders || []).length, 0);

    const rows = all.slice().reverse().slice(0, 12).map(s => {
      const st = s.startTime ? new Date(s.startTime).toLocaleString('ar-EG') : '—';
      const en = s.endTime ? new Date(s.endTime).toLocaleString('ar-EG') : 'مستمرة';
      const orders = (s.orders || []).length;
      return `<div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid #2a2a45;align-items:center;">
        <span style="color:${s._isActive ? '#4caf50' : '#8899bb'};">${s._isActive ? '⚡' : '🗓️'}</span>
        <span style="flex:1;color:#e0e0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(s.id || '')}">
          ${escapeHtml(s.id || 'جلسة')} — ${orders} أمر
        </span>
        <span style="color:var(--muted);font-size:9px;">${st}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="font-weight:700;color:#4dd0e1;margin-bottom:3px;">🗓️ الجلسات — ${all.length} جلسة</div>
      <div style="color:var(--muted);margin-bottom:4px;">إجمالي الأوامر: <b style="color:#e0e0ff;">${totalOrders}</b> • إجمالي المدة: <b style="color:#e0e0ff;">${Math.round(totalDuration / 60000)}</b> دقيقة</div>
      ${rows}`;
  } catch (e) {
    el.innerHTML = '<div style="color:var(--muted);padding:4px;">تعذر تحميل الجلسات</div>';
  }
}

// ── إحصائيات بيانية: نشاط حسب الساعة / اليوم / الأسبوع ──
function renderCharts(data) {
  const el = document.getElementById('sl-charts');
  if (!el) return;
  const all = [...(data.manual || []), ...(data.automated || []), ...(data.errors || []), ...(data.events || []), ...(data.network || [])]
    .filter(e => e.timestamp);
  if (!all.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد بيانات</div>'; return; }

  const byHour = {}; const byDay = {}; const byWeek = {};
  all.forEach(e => {
    const d = new Date(e.timestamp);
    const h = d.getHours();
    byHour[h] = (byHour[h] || 0) + 1;
    const dayKey = d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'numeric' });
    byDay[dayKey] = (byDay[dayKey] || 0) + 1;
    const weekKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}-${d.getMonth()}`;
    byWeek[weekKey] = (byWeek[weekKey] || 0) + 1;
  });

  const bar = (obj, color, labelFmt) => {
    const entries = Object.entries(obj).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return `<div style="margin-bottom:6px;">${entries.map(([k, v]) => `
      <div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
        <span style="width:80px;font-size:9px;color:#8899bb;text-align:left;flex-shrink:0;">${labelFmt(k)}</span>
        <div style="flex:1;background:#0a1520;border-radius:3px;height:12px;overflow:hidden;">
          <div style="width:${Math.max((v / max) * 100, 2)}%;height:100%;background:${color};border-radius:3px;" title="${v}"></div>
        </div>
        <span style="width:28px;font-size:9px;color:#e0e0ff;text-align:right;">${v}</span>
      </div>`).join('')}</div>`;
  };

  el.innerHTML = `
    <div style="font-weight:700;color:#4dd0e1;margin-bottom:4px;">🕐 حسب الساعة</div>
    ${bar(byHour, '#4dd0e1', k => `${k}:00`)}
    <div style="font-weight:700;color:#4dd0e1;margin:8px 0 4px;">📅 حسب اليوم</div>
    ${bar(byDay, '#ffb74d', k => k)}
    <div style="font-weight:700;color:#4dd0e1;margin:8px 0 4px;">🗓️ حسب الأسبوع</div>
    ${bar(byWeek, '#ce93d8', k => k)}`;
}

// ── مقارنة جلستين: الحالي vs آخر نسخة محفوظة ────────────
function renderCompare(current) {
  const el = document.getElementById('sl-compare');
  if (!el) return;
  chrome.storage.local.get({ [SNAPSHOT_KEY]: null }, (res) => {
    const snap = res[SNAPSHOT_KEY];
    if (!snap) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">لا توجد نسخة محفوظة للمقارنة — احفظ نسخة أولاً (زر 💾 نسخة).</div>'; return; }
    const row = (name, c, s, fmt) => `
      <div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #2a2418;">
        <span style="width:90px;color:#8899bb;flex-shrink:0;">${name}</span>
        <span style="flex:1;color:#e0e0ff;">الحالي: <b style="color:#4dd0e1;">${fmt(c)}</b></span>
        <span style="flex:1;color:#e0e0ff;">المحفوظ: <b style="color:#ffb74d;">${fmt(s)}</b></span>
      </div>`;
    const cnt = (arr) => (arr || []).length;
    const diff = (name, c, s) => cnt(c) !== cnt(s) ? `<div style="color:#4caf50;font-size:9px;">▲ تغيّر</div>` : '<div style="color:#666;font-size:9px;">مطابق</div>';

    const cNet = cnt(current.network), sNet = cnt((snap.network || []));
    const cErr = cnt(current.errors), sErr = cnt((snap.errors || []));

    el.innerHTML = `
      <div style="font-weight:700;color:#ffb74d;margin-bottom:4px;">⚖️ الحالي ← آخر نسخة محفوظة</div>
      ${row('يدوي', cnt(current.manual), cnt(snap.manual), v => v) + diff('m', current.manual, snap.manual)}
      ${row('آلي', cnt(current.automated), cnt(snap.automated), v => v) + diff('a', current.automated, snap.automated)}
      ${row('أخطاء', cErr, sErr, v => v) + diff('e', current.errors, snap.errors)}
      ${row('أحداث', cnt(current.events), cnt(snap.events), v => v) + diff('ev', current.events, snap.events)}
      ${row('شبكة', cNet, sNet, v => v) + diff('n', current.network, snap.network)}
      <div style="margin-top:6px;color:#8899bb;font-size:9px;">
        ➕ منذ النسخة: ${cErr - sErr > 0 ? `+${cErr - sErr} خطأ جديد، ` : ''}${cNet - sNet > 0 ? `+${cNet - sNet} طلب شبكة جديد، ` : ''}${(cnt(current.manual) - cnt(snap.manual)) > 0 ? `+${cnt(current.manual) - cnt(snap.manual)} تعديل يدوي` : 'لا توجد تغييرات جوهرية'}
      </div>`;
  });
}

function buildLogContext(data) {
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [], net = data.network || [], events = data.events || [];
  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} → ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!mGroups[key]) mGroups[key] = { label: e.label || e.field, category: e.category, diff: diffKey, count: 0 };
    mGroups[key].count++;
  });
  const errGroups = {};
  errors.forEach(e => {
    const detail = e.errorText || e.message || e.url || e.eventType;
    errGroups[detail] = (errGroups[detail] || 0) + 1;
  });
  const netGroups = {};
  net.forEach(e => {
    const key = `${e.kind || 'fetch'} ${e.method || 'GET'} ${(e.requestUrl || e.url || '').slice(0, 80)}${e.modified ? ' 🔓' : ''}`;
    netGroups[key] = (netGroups[key] || 0) + 1;
  });
  return {
    summary: `يدوي: ${manual.length} | آلي: ${auto.length} | أخطاء: ${errors.length} | شبكة: ${net.length} | أحداث: ${events.length}`,
    manual: Object.values(mGroups).map(g => `${g.label} (${g.category}): ${g.diff} ×${g.count}`).slice(0, 25),
    errors: Object.entries(errGroups).map(([k, v]) => `${k} ×${v}`).slice(0, 15),
    network: Object.entries(netGroups).map(([k, v]) => `${k} ×${v}`).slice(0, 15)
  };
}

async function aiSessionSummary(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const ctx = buildLogContext(data);
  if (!Object.keys(data).length) { el.style.display = 'block'; el.innerHTML = '<div style="color:var(--muted);">لا توجد بيانات</div>'; return; }

  el.style.display = 'block';
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:#ce93d8;"><span class="sl-spinner"></span> جاري توليد الملخص التنفيذي...</div>';

  const prompt = `قم بتوليد ملخص تنفيذي موجز بالعربية لجلسة عمل على بوابة El Araby بناءً على سجل اللوج الذكي:
الإجمالي: ${ctx.summary}

التعديلات اليدوية المجمعة:
${ctx.manual.join('\n')}

الأخطاء المتكررة:
${ctx.errors.join('\n')}

طلبات الشبكة:
${ctx.network.join('\n')}

اكتب الملخص في 3 أقسام: (1) ماذا حدث؟ (2) المشاكل الواضحة. (3) توصيات عملية.`;

  const system = 'أنت مساعد تحليلي محترف يلخص سجلات العمل في بوابة El Araby بالعربية. كن دقيقاً وموجزاً.';
  const out = document.createElement('div');
  out.style.cssText = 'font-size:10px;line-height:1.7;white-space:pre-wrap;color:#ce93d8;';
  el.appendChild(out);
  try {
    let res;
    if (typeof global.aiChatStream === 'function') {
      res = await global.aiChatStream(prompt, { system, maxTokens: 700 }, (full) => { out.textContent = full; });
    } else if (typeof global.aiChat === 'function') {
      res = await global.aiChat(prompt, { system, maxTokens: 700 });
      if (res.ok) out.textContent = res.text;
    } else {
      const resp = await chrome.runtime.sendMessage({ type: 'AI_CHAT', payload: { system, prompt } });
      res = { ok: !!(resp && resp.ok), text: resp?.text || '', message: resp?.message, error: resp?.error };
      if (res.ok && res.text) out.textContent = res.text;
    }
    if (!res.ok) out.innerHTML = `<div style="color:#ef5350;">❌ ${escapeHtml(res.message || res.error || 'فشل الاتصال')}</div>`;
  } catch (e) {
    out.innerHTML = `<div style="color:#ef5350;">❌ ${escapeHtml(e.message || String(e))}</div>`;
  }
}

async function askAISmartLog() {
  const q = document.getElementById('sl-ai-question');
  const el = document.getElementById('sl-ai-answer');
  if (!q || !el) return;
  const question = q.value.trim();
  if (!question) return;
  const chatBox = document.getElementById('sl-ai-chat');
  if (chatBox) chatBox.style.display = 'block';

  el.innerHTML = '<div style="color:#a8c7fa;">💬 ' + escapeHtml(question) + '</div><div style="display:flex;align-items:center;gap:8px;color:#ce93d8;margin-top:4px;"><span class="sl-spinner"></span> جاري التفكير...</div>';
  const ctx = buildLogContext(currentSmartLogData);
  const prompt = `أنت مساعد خبير في تحليل سجلات العمل على بوابة El Araby. إليك ملخص اللوج الذكي الحالي:
الإجمالي: ${ctx.summary}

التعديلات اليدوية:
${ctx.manual.join('\n')}

الأخطاء:
${ctx.errors.join('\n')}

الشبكة:
${ctx.network.join('\n')}

سؤال المستخدم: ${question}

أجب بدقة وبالاعتماد على البيانات أعلاه فقط، وإذا لم توجد البيانات اللازمة فقل ذلك بوضوح.`;

  const system = 'أنت محلل سجلات محترف. أجب بالعربية، موجز، ومنظم بالنقاط.';
  const out = document.createElement('div');
  out.style.cssText = 'margin-top:6px;font-size:10px;line-height:1.7;white-space:pre-wrap;color:#a8c7fa;border-top:1px solid #1a2a3a;padding-top:4px;';
  el.appendChild(out);
  try {
    let res;
    if (typeof global.aiChatStream === 'function') {
      res = await global.aiChatStream(prompt, { system, maxTokens: 500 }, (full) => { out.textContent = full; });
    } else if (typeof global.aiChat === 'function') {
      res = await global.aiChat(prompt, { system, maxTokens: 500 });
      if (res.ok) out.textContent = res.text;
    } else {
      const resp = await chrome.runtime.sendMessage({ type: 'AI_CHAT', payload: { system, prompt } });
      res = { ok: !!(resp && resp.ok), text: resp?.text || '', message: resp?.message, error: resp?.error };
      if (res.ok && res.text) out.textContent = res.text;
    }
    if (!res.ok) out.innerHTML = `<div style="color:#ef5350;">❌ ${escapeHtml(res.message || res.error || 'فشل الاتصال')}</div>`;
  } catch (e) {
    out.innerHTML = `<div style="color:#ef5350;">❌ ${escapeHtml(e.message || String(e))}</div>`;
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
    if (document.getElementById('sub-panel-tools-logs')?.classList.contains('active')) {
      loadSmartLog();
    }
  }
  if (msg.type === 'SMART_LOG_UPDATED') {
    // تحديث حي: لو اللوج الذكي مفتوح (أو التحديث الحي مفعّل) نعيد القراءة فوراً
    if (slLiveEnabled || document.getElementById('sub-panel-tools-smart-log')?.classList.contains('active')) {
      loadSmartLogDashboard(true);
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
    desc: 'يلغي إخفاء أرقام الهاتف في البورتال ويسحب بيانات البلاغات',
    source: 'Tempermonky/elaraby-phone-reveal.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'messenger-sender',
    name: 'مساعد إرسال الماسنجر',
    desc: 'إرسال رسائل مجمّعة من CSV أو اللصق المباشر مع أزرار لايكات',
    source: 'Tempermonky/messenger-sender.js',
    match: 'https://*.facebook.com/*,https://*.messenger.com/*',
  },
  {
    id: 'report-processor',
    name: 'معالج البلاغات',
    desc: 'يفتح البلاغات ويفحص البيانات ويقفل اللي مفيهوش داتا + اختيار يوم + بلاغات محددة',
    source: 'Tempermonky/report-processor.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'booking-automation',
    name: 'الحجز والجدولة الحرة',
    desc: 'أداة موحدة: جدولة حرة للبلاغ المفتوح بدون قيود (God Mode) + حجز جماعي تلقائي لجدول الحالات',
    source: 'Tempermonky/booking-automation.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'elaraby-date-unlocker',
    name: 'فلتر التاريخ (Unlocker)',
    desc: 'يفتح فلتر التاريخ المقفل في بوابة العربي',
    source: 'Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'portal-error-suppressor',
    name: 'كتم أخطاء البورتال',
    desc: 'يكتم خطأ ldv_workordertype is not defined المتكرر في الكونسول',
    source: 'shared/portal-error-suppressor.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
];

function setTmStatus(text, type = 'info') {
  ['tm-status', 'tools-tm-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--muted)';
  });
}

async function loadTampermonkeyScripts() {
  setTmStatus('جاري تحميل القائمة...', 'info');

  let customScripts = [];
  try {
    const stored = await chrome.storage.local.get({ tampermonkeyCustomScripts: [] });
    customScripts = stored.tampermonkeyCustomScripts || [];
  } catch (e) { /* storage blocked */ }

  const builtinList = document.getElementById('tm-builtin-list') || document.getElementById('tools-tm-builtin-list');
  const customList = document.getElementById('tm-custom-list') || document.getElementById('tools-tm-custom-list');
  if (!builtinList || !customList) return;

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
          const flag = (id) => { try { return localStorage.getItem('tm_running_' + id); } catch(e) { return null; } };
          const hasRevealPanel = !!document.getElementById('elaraby-fixed-box') || !!document.getElementById('elaraby-mini-btn');
          const hasExtractorPanel = !!document.getElementById('oe-panel');
          const hasReportProcessor = !!document.getElementById('rp-fab');
          const phoneCells = document.querySelectorAll('td');
          let numbersVisible = false;
          for (const td of phoneCells) {
            const txt = td.innerText.trim();
            if (/^01[0-9]{8,9}$/.test(txt)) { numbersVisible = true; break; }
          }
          return {
            hasRevealPanel, hasExtractorPanel, numbersVisible, hasReportProcessor,
            revealStopped: flag('elaraby-phone-reveal') === '0',
            reportStopped: flag('report-processor') === '0',
            extractorStopped: flag('order-extractor') === '0',
          };
        },
      });
      if (results && results[0]?.result) {
        const r = results[0].result;
        tmRunning['elaraby-phone-reveal'] = { running: r.revealStopped ? false : (r.hasRevealPanel || r.numbersVisible) };
        tmRunning['report-processor'] = { running: r.reportStopped ? false : r.hasReportProcessor };
        if (r.extractorStopped) tmRunning['order-extractor'] = { running: false };
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

  // الحالة الحية من الـ runner (الفابز يغيّر tm_running_* → runner يقرأها)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      const resp = await chrome.tabs.sendMessage(tab.id, { action: 'GET_SCRIPT_STATE' }).catch(() => null);
      if (resp && resp.state) {
        for (const [sid, st] of Object.entries(resp.state)) {
          if (st.custom) continue;
          tmRunning[sid] = {
            running: st.running,
            injectedAt: st.running ? (tmRunning[sid]?.injectedAt || Date.now()) : undefined,
          };
        }
      }
    }
  } catch (e) { /* runner not present on this page */ }

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
        // Stop: تشغيل __TM_STOP__<id> فعلياً في الصفحة (world MAIN) + تحديث الحالة + flag دائم
        const tab = await getActiveTab();
        if (tab) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              world: 'MAIN',
              func: (sid) => {
                try { localStorage.setItem('tm_running_' + sid, '0'); } catch(e) {}
                const stopFn = window['__TM_STOP_' + sid];
                if (typeof stopFn === 'function') { try { stopFn(); } catch(e) {} }
                else if (sid === 'elaraby-phone-reveal' && typeof window.__ERP_STOP === 'function') { try { window.__ERP_STOP(); } catch(e) {} }
              },
              args: [id],
            });
          } catch (e) { /* التاب قد يكون مغلقاً */ }
        }
        tmRunning[id] = { running: false };
        try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
        setTmStatus(`⏹ تم إيقاف: ${id}`, 'info');
        loadTampermonkeyScripts();
        return;
      }

      // Start: activate flag ثم inject وتتبع
      const tab = await getActiveTab();
      if (!tab) { setTmStatus('افتح صفحة أولاً', 'error'); return; }

      const source = btn.dataset.source;
      setTmStatus('جاري تحميل وتنفيذ السكريبت...', 'warn');

      try {
        try {
          const saved = await chrome.storage.local.get('elarabyWebAppUrl');
          const url = saved.elarabyWebAppUrl || null;
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (sid, webUrl) => {
              try { localStorage.setItem('tm_running_' + sid, '1'); } catch(e) {}
              if (webUrl) { try { localStorage.setItem('elarabyWebAppUrl', webUrl); } catch(e) {} }
            },
            args: [id, url],
          });
        } catch (e) { /* تجاهل - قد تكون الصفحة محجوبة */ }

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
        const injected = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (scriptCode) => {
            // CSP-compliant: لا نستخدم eval() أبداً — حقن <script> tag
            try {
              const s = document.createElement('script');
              s.textContent = scriptCode;
              (document.head || document.documentElement).appendChild(s);
              s.remove();
              return { ok: true };
            } catch (e) {
              console.error('[TM Custom Script Error]', e);
              return { ok: false, cspBlocked: true };
            }
          },
          args: [code],
        });
        if (injected && injected[0]?.result?.cspBlocked) {
          tmRunning[cid] = { running: false };
          try { await chrome.storage.local.set({ tmRunning }); } catch(e) {}
          setTmStatus('CSP يمنع الحقن — انسخ السكريبت والصقه يدوياً في Console (F12)', 'error');
          loadTampermonkeyScripts();
          return;
        }
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

// Google Sheets WebApp URL — تحميل القيمة + حفظ + حقن فوري في التبويب النشط
const tmWebAppInput = document.getElementById('tools-tm-webapp-url');
const tmWebAppSaveBtn = document.getElementById('btn-tm-webapp-save');

async function loadTmWebAppUrl() {
  try {
    const saved = await chrome.storage.local.get('elarabyWebAppUrl');
    if (tmWebAppInput && saved.elarabyWebAppUrl) {
      tmWebAppInput.value = saved.elarabyWebAppUrl;
    }
  } catch(e) {}
}

if (tmWebAppSaveBtn && tmWebAppInput) {
  loadTmWebAppUrl();
  tmWebAppSaveBtn.addEventListener('click', async () => {
    const url = (tmWebAppInput.value || '').trim();
    if (!/^https:\/\/.+/.test(url)) {
      setTmStatus('❌ الرابط يجب أن يبدأ بـ https://', 'error');
      return;
    }
    try {
      await chrome.storage.local.set({ elarabyWebAppUrl: url });
      const tab = await getActiveTab();
      if (tab && tab.url && tab.url.startsWith('https://elarabyportalpfs.powerappsportals.com')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (webUrl) => { try { localStorage.setItem('elarabyWebAppUrl', webUrl); } catch(e) {} },
            args: [url],
          });
        } catch(e) {}
      }
      setTmStatus('✅ تم حفظ رابط Google Sheets', 'ok');
    } catch(e) {
      setTmStatus('❌ فشل الحفظ: ' + e.message, 'error');
    }
  });
}

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

// Tools copy of the tampermonkey uploader
const toolsTmFileInput = document.getElementById('tools-tm-file-input');
if (toolsTmFileInput && toolsTmFileInput !== tmFileInput) {
  toolsTmFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setTmStatus('❌ الملف كبير جداً (الحد الأقصى 512 KB)', 'error');
      toolsTmFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const code = ev.target.result;
      if (!code || !code.trim()) {
        setTmStatus('❌ الملف فارغ', 'error');
        toolsTmFileInput.value = '';
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
      } catch (err) {
        setTmStatus('❌ فشل رفع الملف: ' + (err.message || 'خطأ غير معروف'), 'error');
      }
      toolsTmFileInput.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// ══════════════════════════════════════════════════════════
// TAB 7: البحث عن بلاغ (CRM Report Extractor)
// ══════════════════════════════════════════════════════════

const CRM_URL = 'https://elarabyiscrm2.azurewebsites.net';
const crmStatusMsg = document.getElementById('crm-status-msg');
const crmFileDrop = document.getElementById('crm-file-drop');
const crmExcelInput = document.getElementById('crm-excel-input');
const crmFileInfo = document.getElementById('crm-file-info');
const btnCrmStart = document.getElementById('btn-crm-start');
const btnCrmStop = document.getElementById('btn-crm-stop');
const btnCrmOpen = document.getElementById('btn-crm-open');
const crmProgressWrap = document.getElementById('crm-progress-wrap');
const crmProgressBar = document.getElementById('crm-progress-bar');
const crmBatchCounter = document.getElementById('crm-batch-counter');
const crmLiveFeed = document.getElementById('crm-live-feed');
const crmSummary = document.getElementById('crm-summary');

let crmSapNumbers = [];

function setCrmStatus(msg, type = 'info') {
  if (!crmStatusMsg) return;
  crmStatusMsg.className = 'status-msg ' + (type === 'ok' ? 'success' : type);
  crmStatusMsg.innerHTML = '<span>' + msg + '</span>';
}

function crmFeedLine(text, color = 'var(--accent)') {
  const div = document.createElement('div');
  div.innerHTML = text;
  div.style.color = color;
  crmLiveFeed.appendChild(div);
  crmLiveFeed.scrollTop = crmLiveFeed.scrollHeight;
}

async function isCRMConnected() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.startsWith(CRM_URL)) return null;
  const resp = await sendToTab(tab.id, { action: 'crm:getStatus' }, 3000);
  return resp && !resp.error ? tab : null;
}

async function refreshCRMStatus() {
  if (!crmStatusMsg || !btnCrmStart) return; // CRM module inactive in unified popup
  const tab = await isCRMConnected();
  if (tab) {
    setCrmStatus('✅ تم الاتصال بصفحة CRM — يمكنك بدء البحث', 'ok');
    btnCrmStart.disabled = !(crmSapNumbers.length > 0);
  } else {
    setCrmStatus('⚠️ لم يتم اكتشاف صفحة CRM — افتح صفحة SelectReport.aspx أولاً');
    btnCrmStart.disabled = true;
  }
}

async function openCRM() {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = CRM_URL + '/ASPPage/SelectReport.aspx';
  if (current && current.url && current.url.startsWith(CRM_URL)) {
    await chrome.tabs.update(current.id, { url: base });
  } else {
    const tab = await chrome.tabs.create({ url: base });
    await waitTabLoaded(tab.id, base);
  }
  await new Promise(r => setTimeout(r, 1500));
  await refreshCRMStatus();
}

function waitTabLoaded(tabId, urlPrefix) {
  return new Promise(resolve => {
    const check = () => {
      chrome.tabs.get(tabId, tab => {
        if (chrome.runtime.lastError) return resolve();
        if (tab.status === 'complete' && tab.url && tab.url.startsWith(urlPrefix)) resolve();
        else setTimeout(check, 400);
      });
    };
    check();
  });
}

function parseCRMFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = () => {
        const lines = String(reader.result).split(/\r?\n/);
        const nums = [];
        for (const line of lines) {
          const parts = line.split(/[,;\t]/);
          for (const part of parts) {
            const m = part.trim().match(/(CAS\d+|CRM\d+|\d{10,})/i);
            if (m && !nums.includes(m[1].toUpperCase())) nums.push(m[1].toUpperCase());
          }
        }
        resolve(nums);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const nums = [];
          const pattern = /CAS\d+|CRM\d+|\d{10,}/gi;
          for (const row of rows) {
            for (const cell of row) {
              const m = String(cell).match(pattern);
              if (m) {
                for (const match of m) {
                  const up = match.toUpperCase();
                  if (!nums.includes(up)) nums.push(up);
                }
              }
            }
          }
          resolve(nums);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('صيغة غير مدعومة'));
    }
  });
}

async function initCRM() {
  if (!crmExcelInput || !btnCrmStart || !btnCrmOpen || !crmFileDrop) return; // CRM module inactive in unified popup
  crmExcelInput.addEventListener('change', async () => {
    const file = crmExcelInput.files[0];
    if (!file) return;
    try {
      crmSapNumbers = await parseCRMFile(file);
      if (crmSapNumbers.length === 0) {
        setCrmStatus('⚠️ لم يتم العثور على أرقام CRM في الملف', 'error');
        crmFileInfo.style.display = 'none';
        btnCrmStart.disabled = true;
        return;
      }
      crmFileInfo.style.display = 'block';
      crmFileInfo.textContent = `✅ ${file.name} — تم العثور على ${crmSapNumbers.length} رقم (دفعات من 25)`;
      setCrmStatus(`📄 جاهز — ${crmSapNumbers.length} رقم للبحث`, 'ok');
      btnCrmStart.disabled = false;
    } catch (e) {
      setCrmStatus('❌ فشل قراءة الملف: ' + (e.message || 'خطأ غير معروف'), 'error');
      btnCrmStart.disabled = true;
    }
  });

  crmFileDrop.addEventListener('dragover', e => { e.preventDefault(); });
  crmFileDrop.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      crmExcelInput.files = e.dataTransfer.files;
      crmExcelInput.dispatchEvent(new Event('change'));
    }
  });

  btnCrmOpen.addEventListener('click', openCRM);

  btnCrmStart.addEventListener('click', async () => {
    const tab = await isCRMConnected();
    if (!tab) { setCrmStatus('❌ صفحة CRM غير مفتوحة', 'error'); return; }
    if (!crmSapNumbers.length) { setCrmStatus('⚠️ اختر ملف أولاً', 'error'); return; }

    crmLiveFeed.innerHTML = '';
    crmSummary.style.display = 'none';
    crmProgressWrap.style.display = 'block';
    crmProgressBar.style.width = '0%';
    crmBatchCounter.textContent = '';
    btnCrmStart.disabled = true;
    btnCrmStop.disabled = false;

    crmFeedLine('🚀 بدء البحث عن ' + crmSapNumbers.length + ' بلاغ', 'var(--accent)');

    // Send to content script — it posts progress via storage state (polled) + runtime messages
    const resp = await sendToTab(tab.id, {
      action: 'crm:startExtraction',
      payload: { sapNumbers: crmSapNumbers },
    }, 5000);

    if (resp && resp.error) {
      setCrmStatus('❌ فشل بدء البحث: ' + resp.error, 'error');
      crmProgressWrap.style.display = 'none';
      btnCrmStart.disabled = false;
      btnCrmStop.disabled = true;
      return;
    }
    crmFeedLine('✅ تم إرسال أمر البدء', 'var(--success)');
    pollCRMProgress(tab.id);
  });

  btnCrmStop.addEventListener('click', async () => {
    const tab = await isCRMConnected();
    if (tab) {
      await sendToTab(tab.id, { action: 'crm:stopExtraction' }, 3000);
      crmFeedLine('🛑 تم إيقاف البحث', '#ef5350');
    }
  });

  // Poll for progress every 1.5s while active
  let pollTimer = null;
  function pollCRMProgress(tabId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      const resp = await sendToTab(tabId, { action: 'crm:getStatus' }, 3000);
      if (resp && resp.error) { clearInterval(pollTimer); return; }
      const st = resp && resp.data ? resp.data : (resp && resp.state ? resp.state : resp);
      if (!st) return;

      const done = st.results?.length ?? st.done ?? 0;
      const total = st.sapList?.length ?? st.total ?? crmSapNumbers.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      crmProgressBar.style.width = pct + '%';
      crmBatchCounter.textContent = `📦 ${done} / ${total} (${pct}%)`;

      if (st.logs && st.logs.length) {
        crmLiveFeed.innerHTML = '';
        st.logs.slice(-12).forEach(log => {
          const text = typeof log === 'string' ? log : (log.m || JSON.stringify(log));
          const cls = String(text).includes('✅') || String(text).includes('تم') ? 'var(--success)'
            : String(text).includes('❌') ? '#ef5350' : 'var(--accent)';
          crmFeedLine('• ' + text, cls);
        });
      }

      if (st.running === false && st.results && st.results.length) {
        clearInterval(pollTimer);
        btnCrmStart.disabled = false;
        btnCrmStop.disabled = true;
        const found = st.results.filter(r => r.status === 'found').length;
        const empty = st.results.filter(r => r.status === 'empty').length;
        crmSummary.style.display = 'block';
        crmSummary.innerHTML = `✅ اكتمل البحث: <b>${found}</b> بها تقارير، <b>${empty}</b> بدون — إجمالي <b>${st.results.length}</b>`;
        crmFeedLine('🏁 اكتمل البحث', 'var(--success)');
        saveCRMResults(st.results);
      } else if (st.running === false) {
        clearInterval(pollTimer);
        btnCrmStart.disabled = false;
        btnCrmStop.disabled = true;
      }
    }, 1500);
  }
}

async function saveCRMResults(results) {
  try {
    const stored = await chrome.storage.local.get({ crmExtractorState: null });
    const prev = stored.crmExtractorState || {};
    await chrome.storage.local.set({
      crmExtractorState: { ...prev, results, lastRunAt: Date.now() },
    });
  } catch (e) { /* ignore */ }
}

initCRM();
if (crmStatusMsg && btnCrmStart) {
  chrome.tabs.onActivated.addListener(refreshCRMStatus);
  chrome.tabs.onUpdated.addListener((_, info) => { if (info.status === 'complete') refreshCRMStatus(); });
  refreshCRMStatus();
}

// ══════════════════════════════════════════════════════════
// Dashboard Module
// ══════════════════════════════════════════════════════════

const btnOpenDashboard = document.getElementById('btn-open-dashboard');
if (btnOpenDashboard) {
  btnOpenDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('features/spare-parts/dashboard/dashboard.html') });
  });
}

async function loadDashboardStats() {
  try {
    const data = await chrome.storage.local.get({ sessions: [], crmExtractorState: null });
    const sessions = data.sessions || [];
    const crmState = data.crmExtractorState || {};

    let totalOrders = 0, successCount = 0, failedCount = 0;
    for (const s of sessions) {
      const tasks = s.tasks || [];
      totalOrders += tasks.length;
      successCount += tasks.filter(t => t.status === 'success' || t.status === 'تم').length;
      failedCount += tasks.filter(t => t.status === 'failed' || t.status === 'فشل').length;
    }

    const el = (id) => document.getElementById(id);
    if (el('dash-stat-total')) el('dash-stat-total').textContent = totalOrders;
    if (el('dash-stat-success')) el('dash-stat-success').textContent = successCount;
    if (el('dash-stat-failed')) el('dash-stat-failed').textContent = failedCount;
    if (el('dash-stat-sessions')) el('dash-stat-sessions').textContent = sessions.length;
  } catch (e) { /* ignore */ }
}

loadDashboardStats();

// ══════════════════════════════════════════════════════════
// ▼▼▼ SMART PARTS SEARCH MODULE (البحث الذكي)
// ══════════════════════════════════════════════════════════
const partsModelInput  = document.getElementById('parts-model-input');
const partsSerialInput = document.getElementById('parts-serial-input');
const partsProductType = document.getElementById('parts-product-type');
const btnPartsSearch   = document.getElementById('btn-parts-search');
const btnPartsClear    = document.getElementById('btn-parts-clear');
const partsSearchStatus= document.getElementById('parts-search-status');
const partsResults     = document.getElementById('parts-results');
const partsHistoryList = document.getElementById('parts-history-list');

let partsLocalDb = null;

async function loadPartsLocalDb() {
  if (partsLocalDb) return partsLocalDb;
  try {
    const resp = await fetch(chrome.runtime.getURL('products-db.json'));
    partsLocalDb = await resp.json();
  } catch (e) {
    try {
      const stored = await chrome.storage.local.get({ partsDb: null });
      partsLocalDb = stored.partsDb;
    } catch (e2) { partsLocalDb = null; }
  }
  return partsLocalDb;
}

function setPartsStatus(text, type = 'info') {
  if (!partsSearchStatus) return;
  partsSearchStatus.style.background = type === 'ok' ? 'rgba(34,197,94,0.12)'
    : type === 'error' ? 'rgba(239,68,68,0.12)'
    : type === 'warn' ? 'rgba(245,158,11,0.12)' : 'var(--surface-2)';
  partsSearchStatus.style.color = type === 'ok' ? 'var(--success)'
    : type === 'error' ? 'var(--error)'
    : type === 'warn' ? 'var(--warn)' : 'var(--muted)';
  partsSearchStatus.textContent = text;
}

function normalizeText(s) {
  return String(s || '').replace(/[^\w\u0600-\u06FF-]/g, '').toLowerCase();
}

function matchPart(part, modelNorm, serialNorm) {
  const haystack = normalizeText([part.model, part.serial, part.codes, part.name, part.partNo].join(' '));
  if (modelNorm && haystack.includes(modelNorm)) return true;
  if (serialNorm && (normalizeText(part.serial).includes(serialNorm) || normalizeText(part.serial).includes(serialNorm))) return true;
  return false;
}

async function runPartsSearch() {
  const model  = normalizeText(partsModelInput?.value || '');
  const serial = normalizeText(partsSerialInput?.value || '');
  if (!model && !serial) { setPartsStatus('أدخل الموديل أو الرقم التسلسلي', 'warn'); return; }

  setPartsStatus('جارٍ البحث...', 'info');
  const results = [];

  // 1) Local DB
  const db = await loadPartsLocalDb();
  if (db && Array.isArray(db)) {
    db.forEach(p => { if (matchPart(p, model, serial)) results.push({ ...p, source: 'قاعدة البيانات المحلية' }); });
  } else if (db && Array.isArray(db.parts)) {
    db.parts.forEach(p => { if (matchPart(p, model, serial)) results.push({ ...p, source: 'قاعدة البيانات المحلية' }); });
  }

  // 2) Portal live search (via content script)
  const tab = await getActiveTab();
  if (isPortalTab(tab)) {
    setPartsStatus('جاري البحث في البورتال...', 'info');
    const resp = await sendToTab(tab.id, { action: 'PARTS_SEARCH', model: model, serial: serial }, 30000);
    if (resp && resp.ok && Array.isArray(resp.parts)) {
      resp.parts.forEach(p => results.push({ ...p, source: 'بورتال الشركاء' }));
    }
  }

  // Save to history
  try {
    const { partsHistory = [] } = await chrome.storage.local.get({ partsHistory: [] });
    partsHistory.unshift({ query: { model, serial }, results: results.length, time: Date.now() });
    await chrome.storage.local.set({ partsHistory: partsHistory.slice(0, 100) });
  } catch (e) { /* ignore */ }

  if (!results.length) {
    setPartsStatus('لا توجد نتائج مطابقة', 'warn');
    partsResults.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><div>لا توجد نتائج مطابقة</div></div>`;
    return;
  }

  setPartsStatus(`تم العثور على ${results.length} نتيجة`, 'ok');
  partsResults.innerHTML = results.map((p, i) => `
    <div class="part-result">
      <div class="part-name">${escapeHtml(p.name || p.partNo || 'قطعة غيار')}</div>
      <div class="part-meta">موديل: ${escapeHtml(p.model || '-')} ${p.serial ? '| سيريال: ' + escapeHtml(p.serial) : ''}</div>
      ${p.price ? `<div class="part-price">💰 ${escapeHtml(p.price)}</div>` : ''}
      <div class="part-meta" style="margin-top:2px;color:var(--accent);font-size:9.5px;">المصدر: ${escapeHtml(p.source || '')}</div>
    </div>`).join('');
}

btnPartsSearch?.addEventListener('click', runPartsSearch);
btnPartsClear?.addEventListener('click', () => {
  if (partsModelInput) partsModelInput.value = '';
  if (partsSerialInput) partsSerialInput.value = '';
  if (partsProductType) partsProductType.value = '';
  if (partsResults) partsResults.innerHTML = '';
  setPartsStatus('جاهز للبحث');
});

// ── Parts History ──
async function loadPartsHistory() {
  try {
    const { partsHistory = [] } = await chrome.storage.local.get({ partsHistory: [] });
    if (!partsHistoryList) return;
    if (!partsHistory.length) {
      partsHistoryList.innerHTML = `<div class="empty-state"><div class="icon">📜</div><div>لا يوجد تاريخ بحث</div></div>`;
      return;
    }
    partsHistoryList.innerHTML = partsHistory.map(h => {
      const t = h.time ? new Date(h.time).toLocaleString('ar-EG') : '';
      return `
      <div class="report-item">
        <div class="report-header">
          <span class="report-customer">🔍 ${escapeHtml(h.query?.model || h.query?.serial || 'بحث')}</span>
          <span class="report-time">${t}</span>
        </div>
        <div class="report-badges"><span class="badge badge-neutral">${h.results || 0} نتيجة</span></div>
      </div>`;
    }).join('');
  } catch (e) { /* ignore */ }
}

document.getElementById('btn-parts-history-refresh')?.addEventListener('click', loadPartsHistory);
document.getElementById('btn-parts-history-export')?.addEventListener('click', async () => {
  const { partsHistory = [] } = await chrome.storage.local.get({ partsHistory: [] });
  const blob = new Blob([JSON.stringify(partsHistory, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'parts-search-history.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
});
document.getElementById('btn-parts-history-clear')?.addEventListener('click', async () => {
  if (!confirm('مسح كل تاريخ البحث؟')) return;
  await chrome.storage.local.set({ partsHistory: [] });
  loadPartsHistory();
});

// ── Parts Settings ──
async function loadPartsSearchSettings() {
  try {
    const s = await chrome.storage.local.get({ partsSearchSettings: { portal: true, crm: false, local: true } });
    const cfg = s.partsSearchSettings || { portal: true, crm: false, local: true };
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    set('parts-search-portal', cfg.portal);
    set('parts-search-crm', cfg.crm);
    set('parts-search-local', cfg.local);
  } catch (e) { /* ignore */ }
}

document.getElementById('btn-parts-settings-save')?.addEventListener('click', async () => {
  const cfg = {
    portal: document.getElementById('parts-search-portal')?.checked ?? true,
    crm: document.getElementById('parts-search-crm')?.checked ?? false,
    local: document.getElementById('parts-search-local')?.checked ?? true,
  };
  await chrome.storage.local.set({ partsSearchSettings: cfg });
  const el = document.getElementById('btn-parts-settings-save');
  if (el) { el.textContent = '✅ تم الحفظ'; setTimeout(() => el.textContent = '💾 حفظ الإعدادات', 1500); }
});

// ══════════════════════════════════════════════════════════
// ▼▼▼ EXTRACTION MODULE (الاستخراج)
// ══════════════════════════════════════════════════════════
function setExtractOrdersStatus(text, type = 'info') {
  const el = document.getElementById('extract-orders-status');
  if (!el) return;
  el.style.background = type === 'ok' ? 'rgba(34,197,94,0.12)' : type === 'error' ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)';
  el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--muted)';
  el.textContent = text;
}

document.getElementById('btn-extract-orders-open')?.addEventListener('click', async () => {
  chrome.tabs.create({ url: 'https://elarabyportalpfs.powerappsportals.com/en-US/Orders/' });
  setExtractOrdersStatus('جاري فتح صفحة Orders في البورتال...');
});

document.getElementById('btn-extract-orders-all')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setExtractOrdersStatus('افتح صفحة Orders في البورتال أولاً', 'error'); return; }
  setExtractOrdersStatus('جاري استخراج كل الصفحات...');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_ALL_PAGES' }, 120000);
  if (resp?.ok) setExtractOrdersStatus('✅ تم التحميل بنجاح', 'ok');
  else setExtractOrdersStatus(resp?.error || 'فشل الاستخراج', 'error');
});

document.getElementById('btn-extract-orders-current')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setExtractOrdersStatus('افتح صفحة Orders في البورتال أولاً', 'error'); return; }
  setExtractOrdersStatus('جاري استخراج الصفحة الحالية...');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_CURRENT_PAGE' }, 30000);
  if (resp?.ok) setExtractOrdersStatus(`✅ تم تحميل ${resp.count || 0} بلاغ`, 'ok');
  else setExtractOrdersStatus(resp?.error || 'فشل الاستخراج', 'error');
});

// Reports extraction
function setExtractReportsStatus(text, type = 'info') {
  const el = document.getElementById('extract-reports-status');
  if (!el) return;
  el.style.background = type === 'ok' ? 'rgba(34,197,94,0.12)' : type === 'error' ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)';
  el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--muted)';
  el.textContent = text;
}

document.getElementById('btn-extract-reports-current')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setExtractReportsStatus('افتح صفحة بلاغ في البورتال أولاً', 'error'); return; }
  setExtractReportsStatus('جاري استخراج بيانات التقرير...');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_REPORT_DETAIL' }, 30000);
  if (resp?.ok) {
    setExtractReportsStatus(`✅ تم استخراج ${resp.fields || 0} حقل`, 'ok');
    if (resp.data) {
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'report-detail.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  } else {
    setExtractReportsStatus(resp?.error || 'فشل الاستخراج', 'error');
  }
});

document.getElementById('btn-extract-reports-batch')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { setExtractReportsStatus('افتح صفحة بلاغ في البورتال أولاً', 'error'); return; }
  setExtractReportsStatus('جاري استخراج الدفعات...');
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_REPORTS_BATCH' }, 120000);
  if (resp?.ok) setExtractReportsStatus(`✅ تم استخراج ${resp.count || 0} بلاغ`, 'ok');
  else setExtractReportsStatus(resp?.error || 'فشل الاستخراج', 'error');
});

// Device data extraction
const extractDeviceResult = document.getElementById('extract-device-result');

function setExtractDeviceResult(html, show = true) {
  if (!extractDeviceResult) return;
  extractDeviceResult.style.display = show ? 'block' : 'none';
  extractDeviceResult.innerHTML = html;
}

document.getElementById('btn-extract-device-current')?.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!isPortalTab(tab)) { alert('افتح صفحة بلاغ في البورتال أولاً'); return; }
  const resp = await sendToTab(tab.id, { action: 'EXTRACT_DEVICE_DATA' }, 30000);
  if (resp?.ok && resp.data) {
    const d = resp.data;
    setExtractDeviceResult(`
      <b>العلامة التجارية:</b> ${escapeHtml(d.brand || '-')}<br>
      <b>الموديل:</b> ${escapeHtml(d.model || '-')}<br>
      <b>الرقم التسلسلي:</b> ${escapeHtml(d.serial || '-')}<br>
      <b>الحالة:</b> ${escapeHtml(d.status || '-')}
    `);
  } else {
    setExtractDeviceResult(`<span style="color:var(--error)">${escapeHtml(resp?.error || 'فشل')}</span>`);
  }
});

document.getElementById('btn-extract-device-save')?.addEventListener('click', async () => {
  try {
    const { deviceLog = [] } = await chrome.storage.local.get({ deviceLog: [] });
    const tab = await getActiveTab();
    let data = { time: Date.now() };
    if (isPortalTab(tab)) {
      const resp = await sendToTab(tab.id, { action: 'EXTRACT_DEVICE_DATA' }, 30000);
      if (resp?.ok && resp.data) data = { ...data, ...resp.data };
    }
    deviceLog.unshift(data);
    await chrome.storage.local.set({ deviceLog: deviceLog.slice(0, 500) });
    setExtractDeviceResult(`<span style="color:var(--success)">✅ تم الحفظ في السجل</span>`);
  } catch (e) {
    setExtractDeviceResult(`<span style="color:var(--error)">❌ ${escapeHtml(e.message)}</span>`);
  }
});

// ══════════════════════════════════════════════════════════
// ▼▼▼ SETTINGS EDITORS (الإعدادات)
// ══════════════════════════════════════════════════════════
async function loadSettingsEditors() {
  const selectorsEditor = document.getElementById('settings-selectors-editor');
  const svEditor = document.getElementById('settings-sv-profiles-editor');
  try {
    const resp = await fetch(chrome.runtime.getURL('selectors.json'));
    const sel = await resp.json();
    if (selectorsEditor) selectorsEditor.value = JSON.stringify(sel, null, 2);
  } catch (e) {
    if (selectorsEditor) selectorsEditor.value = '// تعذر تحميل selectors.json — سيبقى فارغاً';
  }
  try {
    const resp2 = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
    const prof = await resp2.json();
    if (svEditor) svEditor.value = JSON.stringify(prof, null, 2);
  } catch (e2) {
    if (svEditor) svEditor.value = '// تعذر تحميل secondVisitProfiles.json — سيبقى فارغاً';
  }
  // Behavior checkboxes
  try {
    const prefs = await chrome.storage.local.get({ prefs: {} });
    const p = prefs.prefs || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('settings-dark-mode', p.darkMode ?? true);
    set('settings-auto-refresh', p.autoRefresh ?? true);
    set('settings-notifications', p.notifications ?? true);
  } catch (e) { /* ignore */ }
}

document.getElementById('btn-settings-selectors-save')?.addEventListener('click', async () => {
  const editor = document.getElementById('settings-selectors-editor');
  if (!editor) return;
  try {
    const json = JSON.parse(editor.value);
    await chrome.storage.local.set({ selectorsOverride: json });
    const btn = document.getElementById('btn-settings-selectors-save');
    if (btn) { btn.textContent = '✅ تم الحفظ'; setTimeout(() => btn.textContent = '💾 حفظ', 1500); }
  } catch (e) { alert('JSON غير صالح: ' + e.message); }
});
document.getElementById('btn-settings-selectors-reload')?.addEventListener('click', loadSettingsEditors);
document.getElementById('btn-settings-sv-profiles-save')?.addEventListener('click', async () => {
  const editor = document.getElementById('settings-sv-profiles-editor');
  if (!editor) return;
  try {
    const json = JSON.parse(editor.value);
    await chrome.storage.local.set({ secondVisitProfilesOverride: json });
    const btn = document.getElementById('btn-settings-sv-profiles-save');
    if (btn) { btn.textContent = '✅ تم الحفظ'; setTimeout(() => btn.textContent = '💾 حفظ', 1500); }
  } catch (e) { alert('JSON غير صالح: ' + e.message); }
});
document.getElementById('btn-settings-sv-profiles-reload')?.addEventListener('click', loadSettingsEditors);

['settings-dark-mode', 'settings-auto-refresh', 'settings-notifications'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', async (e) => {
    try {
      const prefs = await chrome.storage.local.get({ prefs: {} });
      const p = prefs.prefs || {};
      const key = id.replace('settings-', '');
      p[key] = e.target.checked;
      await chrome.storage.local.set({ prefs: p });
    } catch (err) { /* ignore */ }
  });
});

// ══════════════════════════════════════════════════════════
// ▼▼▼ SYNC MODULE (المزامنة)
// ══════════════════════════════════════════════════════════
function setSyncStatus(text, type = 'info') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.style.background = type === 'ok' ? 'rgba(34,197,94,0.12)' : type === 'error' ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)';
  el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--muted)';
  el.textContent = text;
}

async function buildSyncPayload() {
  const keys = ['prefs', 'partsSearchSettings', 'selectorsOverride', 'secondVisitProfilesOverride', 'deviceLog', 'partsHistory'];
  const payload = { exportedAt: Date.now(), data: {} };
  for (const k of keys) {
    try {
      const stored = await chrome.storage.local.get({ [k]: null });
      if (stored[k] !== null && stored[k] !== undefined) payload.data[k] = stored[k];
    } catch (e) { /* ignore */ }
  }
  return payload;
}

document.getElementById('btn-sync-export')?.addEventListener('click', async () => {
  const payload = await buildSyncPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'el-araby-settings-' + Date.now() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setSyncStatus('✅ تم التصدير', 'ok');
});

document.getElementById('btn-sync-import')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (!payload || !payload.data) throw new Error('ملف غير صالح');
        await chrome.storage.local.set(payload.data);
        setSyncStatus('✅ تم استيراد الإعدادات بنجاح', 'ok');
        loadSettingsEditors();
      } catch (err) { setSyncStatus('❌ ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  };
  input.click();
});

const SYNC_CLOUD_KEY = 'el-araby-sync-cloud';
document.getElementById('btn-sync-cloud-backup')?.addEventListener('click', async () => {
  const payload = await buildSyncPayload();
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  try {
    await chrome.storage.sync.set({ [SYNC_CLOUD_KEY]: encoded });
    setSyncStatus('☁️ تم النسخ الاحتياطي السحابي بنجاح', 'ok');
  } catch (e) {
    setSyncStatus('❌ فشل المزامنة السحابية: ' + e.message, 'error');
  }
});

document.getElementById('btn-sync-cloud-restore')?.addEventListener('click', async () => {
  try {
    const stored = await chrome.storage.sync.get(SYNC_CLOUD_KEY);
    if (!stored[SYNC_CLOUD_KEY]) { setSyncStatus('لا يوجد نسخة احتياطية سحابية', 'warn'); return; }
    const payload = JSON.parse(decodeURIComponent(escape(atob(stored[SYNC_CLOUD_KEY]))));
    if (payload?.data) await chrome.storage.local.set(payload.data);
    setSyncStatus('⬇️ تمت الاستعادة من السحابة بنجاح', 'ok');
    loadSettingsEditors();
  } catch (e) {
    setSyncStatus('❌ فشل الاستعادة: ' + e.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════
// END OF FILE
// ══════════════════════════════════════════════════════════
