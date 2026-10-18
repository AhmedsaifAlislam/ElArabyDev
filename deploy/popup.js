// =========================================================
// popup.js â€” Portal AutoFiller v3.0
// =========================================================
'use strict';

// â”€â”€ DOM Refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let isBatchRunning     = false;
let isBatchSearching   = false;
let stopRequested      = false;
let allSessionLogs     = [];   // full unfiltered sessions
let taskItems          = {};   // taskId â†’ div element
let statusPollInterval = null;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const escapeHtml = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/`/g, "&#96;");
// Runtime Trace & Diagnostics logic is now modularized in modules/autofill/runtime-trace.js

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
  return window.generateTaskId ? window.generateTaskId() : ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
}

// â”€â”€ Set Status (Search Tab) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setSearchStatus(text, type = 'info') {
  searchStatusMsg.className = `status-msg ${type}`;
  const icons = { info: 'â„¹ï¸', ok: 'âœ…', error: 'âŒ', warn: 'âš ï¸' };
  searchStatusMsg.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(text)}</span>`;
}

function setSearchStatusHtml(html, type = 'info') {
  searchStatusMsg.className = `status-msg ${type}`;
  searchStatusMsg.innerHTML = html;
}

// â”€â”€ Tab Switching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');

    const directPanel = document.getElementById('panel-' + btn.dataset.tab);
    if (directPanel) {
      directPanel.classList.add('active');
    } else {
      // Map quick-tool to panel-tools and activate corresponding sub-panel
      const toolsPanel = document.getElementById('panel-tools');
      if (toolsPanel) {
        toolsPanel.classList.add('active');
        const subId = 'sub-panel-tools-' + btn.dataset.tab;
        const subPanel = document.getElementById(subId);
        if (subPanel) {
          toolsPanel.querySelectorAll('.sub-tab-panel').forEach(p => p.classList.remove('active'));
          toolsPanel.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
          subPanel.classList.add('active');
          const subBtn = document.getElementById('sub-tab-tools-' + btn.dataset.tab);
          if (subBtn) subBtn.classList.add('active');
        }
      }
    }

    if (btn.dataset.tab === 'monitoring') {
      const activePill = document.querySelector('.monitoring-pill-btn.active') || document.querySelector('.monitoring-pill-btn');
      const targetId = activePill ? activePill.dataset.targetCard : 'card-mon-sessions';
      document.querySelectorAll('.monitoring-card').forEach(card => {
        if (card.id === targetId) {
          card.open = true;
          card.style.display = 'block';
        } else {
          card.open = false;
          card.style.display = 'none';
        }
      });
      loadSmartLog();
      loadSmartLogDashboard();
      initTelemetry();
      loadSessionCaptures();
    }
    if (btn.dataset.tab === 'logs') loadSmartLog();
    if (btn.dataset.tab === 'smart-log') loadSmartLogDashboard();
    if (btn.dataset.tab === 'tampermonkey') loadTampermonkeyScripts();
    if (btn.dataset.tab === 'session') loadSessionCaptures();
    if (btn.dataset.tab === 'dashboard') initDashboard();
    if (btn.dataset.tab === 'parts-search') initPartsSearch();
    if (btn.dataset.tab === 'telemetry') initTelemetry();
    if (btn.dataset.tab === 'n8n') initN8n();
    if (btn.dataset.tab === 'settings') { initSettings(); initSync(); }
    if (btn.dataset.tab === 'sync') initSync();
    if (btn.dataset.tab === 'ai') initAI();
    if (btn.dataset.tab === 'financial') initFinancial();
  });
});

// â”€â”€ Sub-Tab Switching (generic for all main panels) â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parentPanel = btn.closest('.tab-panel');
    if (!parentPanel) return;
    parentPanel.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    parentPanel.querySelectorAll('.sub-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const subId = 'sub-panel-' + btn.dataset.subTab;
    const subPanel = parentPanel.querySelector('#' + subId) || document.getElementById(subId);
    if (subPanel) subPanel.classList.add('active');

    // Keep quick-tool button active state in sync
    if (btn.dataset.subTab && btn.dataset.subTab.startsWith('tools-')) {
      const toolKey = btn.dataset.subTab.replace('tools-', '');
      const quickBtn = document.querySelector(`.quick-tool-btn[data-tab="${toolKey}"]`);
      if (quickBtn) {
        document.querySelectorAll('.quick-tool-btn').forEach(b => b.classList.remove('active'));
        quickBtn.classList.add('active');
      }
    }
    // Sub-tab specific init
    if (btn.dataset.subTab === 'parts-search') initPartsSearchContent();
    if (btn.dataset.subTab === 'tools-telemetry') initTelemetry();
    if (btn.dataset.subTab === 'tools-n8n') initN8n();
    if (btn.dataset.subTab === 'tools-excel-autofix') initExcelAutofix();
    if (btn.dataset.subTab === 'tools-settings') initSettings();
    if (btn.dataset.subTab === 'tools-sync') initSync();
    if (btn.dataset.subTab === 'tools-ai') initAI();
    if (btn.dataset.subTab === 'dashboard-sync') initDashboardSync();
    if (btn.dataset.subTab === 'dashboard-search') initDashboardSearch();
    if (btn.dataset.subTab === 'dashboard-inventory') initDashboardInventory();
  });
});

// â”€â”€ Tab Initialization Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initDashboard() {
  // Initialize dashboard - load stats and default to sync tab
  initDashboardSync();
  console.log('[Dashboard] tab activated');
}

function initDashboardSync() {
  // Load DB stats from background
  chrome.runtime.sendMessage({ action: 'getDBCount' }, (res) => {
    if (res && res.count !== undefined) {
      const elStatCount = document.getElementById('statCount'); if (elStatCount) { elStatCount.textContent = res.count.toLocaleString('ar-EG'); }
    }
    if (res && res.lastSync) {
      const elStatLastSync = document.getElementById('statLastSync'); if (elStatLastSync) { elStatLastSync.textContent = new Date(res.lastSync).toLocaleString('ar-EG'); }
      const elStatStatus = document.getElementById('statStatus'); if (elStatStatus) { elStatStatus.textContent = 'Ù…Ø­Ø¯Ø«Ø©'; }
      const elStatStatus2 = document.getElementById('statStatus'); if (elStatStatus2) { elStatStatus2.style.color = 'var(--ea-success)'; }
    }
  });

  // Drive/Local mode toggle
  document.getElementById('tabDrive')?.addEventListener('click', () => showSyncMode('drive'));
  document.getElementById('tabLocal')?.addEventListener('click', () => showSyncMode('local'));

  // Local file upload
  const fileInput = document.getElementById('localFileInput');
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('localFileName').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    window.localFileData = file;
    document.getElementById('localFileReady').style.display = 'block';
  });

  // Sync buttons
  document.getElementById('btnSync')?.addEventListener('click', syncFromDrive);
  document.getElementById('btnLocalImport')?.addEventListener('click', importLocalFile);

  console.log('[Dashboard Sync] initialized');
}

function showSyncMode(mode) {
  const driveMode = document.getElementById('syncDriveMode');
  const localMode = document.getElementById('syncLocalMode');
  const tabDrive = document.getElementById('tabDrive');
  const tabLocal = document.getElementById('tabLocal');
  if (mode === 'local') {
    driveMode.style.display = 'none';
    localMode.style.display = 'block';
    tabDrive.classList.remove('active');
    tabLocal.classList.add('active');
  } else {
    driveMode.style.display = 'block';
    localMode.style.display = 'none';
    tabDrive.classList.add('active');
    tabLocal.classList.remove('active');
  }
}

function syncFromDrive() {
  const url = document.getElementById('driveUrl')?.value;
  if (!url) return showAlert('syncAlert', 'Ø£Ø¯Ø®Ù„ Ø±Ø§Ø¨Ø· Google Drive', 'error');
  const btn = document.getElementById('btnSync');
  btn.disabled = true;
  btn.textContent = 'â³ Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©...';
  document.getElementById('progressWrap').style.display = 'block';
  document.getElementById('progressFill').style.width = '10%';
  document.getElementById('progressLabel').textContent = 'ðŸ“¥ Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ù„Ù...';

  chrome.runtime.sendMessage({ action: 'syncFromDrive', url }, (res) => {
    btn.disabled = false;
    btn.textContent = 'â¬‡ï¸ Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ø¢Ù†';
    document.getElementById('progressWrap').style.display = 'none';
    if (res?.error) {
      showAlert('syncAlert', `âŒ ÙØ´Ù„: ${res.error}`, 'error');
    } else {
      document.getElementById('progressFill').style.width = '100%';
      document.getElementById('progressLabel').textContent = `âœ… Ø§ÙƒØªÙ…Ù„! ${res.count?.toLocaleString('ar-EG') || ''} Ø³Ø¬Ù„`;
      showAlert('syncAlert', `âœ… ØªÙ…Øª Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø© Ø¨Ù†Ø¬Ø§Ø­`, 'success');
      loadDashboardStats();
    }
  });
}

function importLocalFile() {
  const file = window.localFileData;
  if (!file) return showAlert('syncAlert', 'Ø§Ø®ØªØ± Ù…Ù„Ù Ø£ÙˆÙ„Ø§Ù‹', 'error');
  const btn = document.getElementById('btnLocalImport');
  btn.disabled = true;
  btn.textContent = 'â³ Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù‚Ø±Ø§Ø¡Ø©...';
  document.getElementById('progressWrap').style.display = 'block';
  document.getElementById('progressFill').style.width = '10%';
  document.getElementById('progressLabel').textContent = 'ðŸ“‚ Ø¬Ø§Ø±ÙŠ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ù…Ù„Ù...';

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('progressFill').style.width = '20%';
    document.getElementById('progressLabel').textContent = 'âš™ï¸ Ø¬Ø§Ø±ÙŠ ØªØ­Ù„ÙŠÙ„ Ø§Ù„Ù…Ù„Ù...';

    const uint8 = new Uint8Array(e.target.result);
    let rows = [];
    const isXLSX = uint8.length > 2 && uint8[0] === 0x50 && uint8[1] === 0x4B;

    try {
      if (isXLSX) {
        const workbook = XLSX.read(uint8, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      } else {
        let bytes = uint8;
        if (uint8.length > 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
          bytes = uint8.slice(3);
        }
        function decodeAndCount(enc) {
          try {
            const text = new TextDecoder(enc, { fatal: true }).decode(bytes);
            let arabic = 0;
            for (let i = 0; i < Math.min(text.length, 5000); i++) {
              const c = text.charCodeAt(i);
              if (c >= 0x0600 && c <= 0x06FF) arabic++;
            }
            return { text, arabic };
          } catch(e) { return null; }
        }
        let best = null;
        for (const enc of ['utf-8', 'windows-1256', 'iso-8859-6']) {
          const r = decodeAndCount(enc);
          if (r && (!best || r.arabic > best.arabic)) best = r;
        }
        const text = best?.text || new TextDecoder('utf-8').decode(bytes);
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false,
          transformHeader: h => h.trim().replace(/^\uFEFF/, '') });
        rows = parsed.data;
      }
    } catch (err) {
      showAlert('syncAlert', `âŒ ÙØ´Ù„ ÙÙŠ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ù…Ù„Ù: ${err.message}`, 'error');
      document.getElementById('progressWrap').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'â¬†ï¸ Ø±ÙØ¹ ÙˆØ§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„Ø¢Ù†';
      return;
    }

      document.getElementById('progressFill').style.width = '50%';
      document.getElementById('progressLabel').textContent = `âš™ï¸ Ø¬Ø§Ø±ÙŠ Ø­ÙØ¸ ${rows.length.toLocaleString('ar-EG')} Ø³Ø¬Ù„...`;

      const BATCH = 10000;
      let totalSaved = 0;
      (async () => {
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const isFirst = i === 0;
          const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'importLocalChunk', rows: chunk, isFirst }, r));
          if (res?.error) throw new Error(res.error);
          totalSaved = res?.total || totalSaved;
          const pct = 50 + Math.round((i / rows.length) * 45);
          document.getElementById('progressFill').style.width = pct + '%';
          document.getElementById('progressLabel').textContent = `âš™ï¸ Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø­ÙØ¸: ${Math.min(i + BATCH, rows.length).toLocaleString('ar-EG')} / ${rows.length.toLocaleString('ar-EG')}`;
        }
        localStorage.setItem('lastSync', new Date().toISOString());
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('progressLabel').textContent = `âœ… Ø§ÙƒØªÙ…Ù„! ØªÙ… Ø­ÙØ¸ ${totalSaved.toLocaleString('ar-EG')} Ø³Ø¬Ù„`;
        showAlert('syncAlert', `âœ… ØªÙ…Øª Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø© Ø¨Ù†Ø¬Ø§Ø­ â€” ${totalSaved.toLocaleString('ar-EG')} Ø³Ø¬Ù„ Ù…Ø­ÙÙˆØ¸`, 'success');
        loadDashboardStats();
        loadFilters();
        btn.disabled = false;
        btn.textContent = 'â¬†ï¸ Ø±ÙØ¹ ÙˆØ§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„Ø¢Ù†';
      })().catch(err => {
        showAlert('syncAlert', `âŒ ÙØ´Ù„: ${err.message}`, 'error');
        document.getElementById('progressWrap').style.display = 'none';
        btn.disabled = false;
        btn.textContent = 'â¬†ï¸ Ø±ÙØ¹ ÙˆØ§Ø³ØªÙŠØ±Ø§Ø¯ Ø§Ù„Ø¢Ù†';
      });
    };
    reader.readAsArrayBuffer(file);
  }

function loadDashboardStats() {
  chrome.runtime.sendMessage({ action: 'getDBCount' }, (res) => {
    if (res && res.count !== undefined) {
      document.getElementById('statCount').textContent = res.count.toLocaleString('ar-EG');
    }
    if (res && res.lastSync) {
      document.getElementById('statLastSync').textContent = new Date(res.lastSync).toLocaleString('ar-EG');
      document.getElementById('statStatus').textContent = 'Ù…Ø­Ø¯Ø«Ø©';
      document.getElementById('statStatus').style.color = 'var(--ea-success)';
    }
  });
}

function loadFilters() {
  chrome.runtime.sendMessage({ action: 'getMasterDataFilters' }, (res) => {
    if (!res) return;
    window.filterRelations = {
      modelsByType: res.modelsByType || {},
      defectMajorsByModel: res.defectMajorsByModel || {},
      defectDescsByMajor: res.defectDescsByMajor || {}
    };
    populateSelect('fAdvProductGroup', res.productTypes || [], 'Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª', true);
    const allModels = [...new Set(Object.values(window.filterRelations.modelsByType).flat())].sort();
    populateSelect('fAdvBrand', allModels.length ? allModels : (res.models || []), 'Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„Ø§Øª', true);
    const allMajors = [...new Set(Object.values(window.filterRelations.defectMajorsByModel).flat())].sort();
    populateSelect('fAdvModel', allMajors.length ? allMajors : (res.defectMajors || []), 'Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', true);
    const allDescs = [...new Set(Object.values(window.filterRelations.defectDescsByMajor).flat())].sort();
    populateSelect('fAdvDefect', allDescs.length ? allDescs : (res.defectDescs || []), 'Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„ÙØ±Ø¹ÙŠ', true);
  });
}

function populateSelect(id, items, label, silent) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">' + escapeHtml(label) + '</option>' + items.map(v => '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>').join('');
  sel.value = items.includes(currentVal) ? currentVal : '';
  if (!silent) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function cascadeModels(silent) {
  const type = document.getElementById('fAdvProductGroup')?.value || '';
  window.currentFilterValues = window.currentFilterValues || {};
  window.currentFilterValues.productType = type;
  window.currentFilterValues.model = '';
  window.currentFilterValues.defectMajor = '';
  window.currentFilterValues.defectDesc = '';
  const models = type ? (window.filterRelations?.modelsByType?.[type] || []) : [...new Set(Object.values(window.filterRelations?.modelsByType || {}).flat())].sort();
  populateSelect('fAdvBrand', models, 'Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„Ø§Øª', silent);
}

function cascadeMajors() {
  const md = document.getElementById('fAdvBrand')?.value || '';
  window.currentFilterValues = window.currentFilterValues || {};
  window.currentFilterValues.model = md;
  window.currentFilterValues.defectMajor = '';
  window.currentFilterValues.defectDesc = '';
  const majors = md ? (window.filterRelations?.defectMajorsByModel?.[md] || []) : [...new Set(Object.values(window.filterRelations?.defectMajorsByModel || {}).flat())].sort();
  populateSelect('fAdvModel', majors, 'Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ');
}

function cascadeDefects(silent) {
  const maj = document.getElementById('fAdvModel')?.value || '';
  window.currentFilterValues = window.currentFilterValues || {};
  window.currentFilterValues.defectMajor = maj;
  window.currentFilterValues.defectDesc = '';
  const descs = maj ? (window.filterRelations?.defectDescsByMajor?.[maj] || []) : [...new Set(Object.values(window.filterRelations?.defectDescsByMajor || {}).flat())].sort();
  populateSelect('fAdvDefect', descs, 'Ø§Ù„Ø¹Ø·Ù„ Ø§Ù„ÙØ±Ø¹ÙŠ', silent);
}

function setupFilterEvents() {
  document.getElementById('fAdvProductGroup')?.addEventListener('change', () => { cascadeModels(); doSearch(); });
  document.getElementById('fAdvBrand')?.addEventListener('change', () => { cascadeMajors(); doSearch(); });
  document.getElementById('fAdvModel')?.addEventListener('change', () => { cascadeDefects(); doSearch(); });
  document.getElementById('fAdvDefect')?.addEventListener('change', () => { doSearch(); });
  document.getElementById('btnSearch')?.addEventListener('click', doSearch);
  document.getElementById('btnClearSearch')?.addEventListener('click', () => {
    document.getElementById('fAdvProductGroup').value = '';
    document.getElementById('fAdvBrand').value = '';
    document.getElementById('fAdvModel').value = '';
    document.getElementById('fAdvDefect').value = '';
    document.getElementById('fAdvKeyword').value = '';
    cascadeModels(true);
    cascadeMajors();
    cascadeDefects(true);
    doSearch();
  });
  document.getElementById('fAdvKeyword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

async function doSearch() {
  const btn = document.getElementById('btnSearch');
  const spinner = document.getElementById('searchSpinner');
  btn.disabled = true;
  spinner.style.display = 'inline';
  document.getElementById('tableControls').style.display = 'flex';

  const filters = {
    productType: document.getElementById('fAdvProductGroup')?.value || '',
    model: document.getElementById('fAdvBrand')?.value || '',
    defectMajor: document.getElementById('fAdvModel')?.value || '',
    defectDesc: document.getElementById('fAdvDefect')?.value || '',
    keyword: document.getElementById('fAdvKeyword')?.value || ''
  };

  const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'searchDB', filters }, r));
  btn.disabled = false;
  spinner.style.display = 'none';

  if (res?.error) {
    showAlert('syncAlert', `âŒ Ø¨Ø­Ø« ÙØ§Ø´Ù„: ${res.error}`, 'error');
    return;
  }
  renderSearchResults(res?.rows || []);
  document.getElementById('advResultCount').textContent = (res?.rows || []).length.toLocaleString('ar-EG');
}

function renderSearchResults(data) {
  const tbody = document.getElementById('dataBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--muted);"><div>Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬</div><div style="font-size:10px; margin-top:4px;">Ø¬Ø±Ø¨ ÙÙ„Ø§ØªØ± Ø£Ø®Ø±Ù‰</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td style="padding:8px; font-size:11px;">${escapeHtml(r.productType || 'â€“')}</td>
      <td style="padding:8px;"><span style="font-family:monospace; font-size:11px;">${escapeHtml(r.modelCode || 'â€“')}</span><br><span style="font-size:10px; color:var(--muted);">${escapeHtml(r.modelDescription || '')}</span></td>
      <td style="padding:8px; font-size:10px; max-width:180px;">${escapeHtml((r.defectMajor || '').substring(0,35))}</td>
      <td style="padding:8px;"><span style="background:var(--ea-warning-bg); color:var(--ea-warning); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">${escapeHtml(r.defectCode || 'â€“')}</span><br><span style="font-size:10px; color:var(--muted);">${escapeHtml((r.defectDescription || '').substring(0,40))}</span></td>
      <td style="padding:8px;"><strong style="font-family:monospace; font-size:11px;">${escapeHtml(r.sparePartCode || 'â€“')}</strong></td>
      <td style="padding:8px; text-align:center;">${escapeHtml(r.maxQuantity > 0 ? r.maxQuantity : 'â€“')}</td>
    </tr>
  `).join('');
}

function initDashboardSearch() {
  setupFilterEvents();
  loadFilters();
  console.log('[Dashboard Search] initialized');
}

function initDashboardInventory() {
  document.getElementById('btnScrape')?.addEventListener('click', scrapeInventory);
  document.getElementById('btnExportInv')?.addEventListener('click', exportInventory);
  document.getElementById('invSearch')?.addEventListener('input', filterInventoryTable);
  console.log('[Dashboard Inventory] initialized');
}

async function scrapeInventory() {
  const btn = document.getElementById('btnScrape');
  btn.disabled = true;
  btn.textContent = 'â³ Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø³Ø­Ø¨...';
  showAlert('invAlert', 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„...', 'info');

  const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'scrapeInventory' }, r));
  btn.disabled = false;
  btn.textContent = 'ðŸ“¥ Ø³Ø­Ø¨ Ø§Ù„Ø¹Ù‡Ø¯Ø© Ù…Ù† Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„';

  if (res?.error) {
    showAlert('invAlert', `âŒ ${res.error}`, 'error');
    return;
  }
  if (!res?.data?.length) {
    showAlert('invAlert', 'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø¨ÙŠØ§Ù†Ø§Øª Ø¹Ù‡Ø¯Ø© ÙÙŠ Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ù†Ø´Ø·', 'error');
    return;
  }
  window.inventoryData = res.data;
  renderInventory(res.data);
  document.getElementById('btnExportInv').disabled = false;
  showAlert('invAlert', `âœ… ØªÙ… Ø³Ø­Ø¨ ${res.data.length} ØµÙ†Ù`, 'success');
}

function renderInventory(data) {
  document.getElementById('invStats').style.display = 'grid';
  const totalItems = data.length;
  const totalQty = data.reduce((s, r) => s + (r.qty || 0), 0);
  const totalValue = data.reduce((s, r) => s + (r.price * r.qty || 0), 0);
  document.getElementById('invCount').textContent = totalItems.toLocaleString('ar-EG');
  document.getElementById('invQty').textContent = totalQty.toLocaleString('ar-EG');
  document.getElementById('invValue').textContent = totalValue.toLocaleString('ar-EG') + ' Ø¬.Ù…';

  document.getElementById('invTableCard').style.display = 'block';
  const tbody = document.getElementById('invBody');
  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td style="padding:8px;"><span style="font-family:monospace;">${escapeHtml(r.code || r.sparePartCode || 'â€“')}</span></td>
      <td style="padding:8px;">${escapeHtml(r.desc || r.description || 'â€“')}</td>
      <td style="padding:8px; text-align:right;">${escapeHtml(r.store || r.location || 'â€“')}</td>
      <td style="padding:8px; text-align:center;">${escapeHtml(r.qty || 0)}</td>
      <td style="padding:8px; text-align:center; font-family:monospace;">${escapeHtml(r.price ? r.price.toLocaleString('ar-EG') : 'â€“')}</td>
      <td style="padding:8px; text-align:center; font-family:monospace; color:var(--ea-success);">${escapeHtml((r.price * r.qty || 0).toLocaleString('ar-EG'))}</td>
    </tr>
  `).join('');
  document.getElementById('invTableCount').textContent = `${data.length} Ø³Ø¬Ù„`;
}

function filterInventoryTable() {
  const term = document.getElementById('invSearch').value.toLowerCase();
  const rows = document.getElementById('invBody')?.querySelectorAll('tr') || [];
  rows.forEach(tr => {
    const text = tr.textContent.toLowerCase();
    tr.style.display = text.includes(term) ? '' : 'none';
  });
  const visible = [...rows].filter(r => r.style.display !== 'none').length;
  document.getElementById('invTableCount').textContent = `${visible} / ${rows.length} Ø³Ø¬Ù„`;
}

function exportInventory() {
  if (!window.inventoryData?.length) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(window.inventoryData.map(r => ({
    'ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø·Ø¹Ø©': r.code || r.sparePartCode,
    'Ø§Ù„ÙˆØµÙ': r.desc || r.description,
    'Ø§Ù„Ù…Ø®Ø²Ù†': r.store || r.location,
    'Ø§Ù„ÙƒÙ…ÙŠØ©': r.qty,
    'Ø³Ø¹Ø± Ø§Ù„ÙˆØ­Ø¯Ø©': r.price,
    'Ø§Ù„Ù‚ÙŠÙ…Ø©': r.price * r.qty
  })));
  XLSX.utils.book_append_sheet(wb, ws, 'Ø§Ù„Ø¹Ù‡Ø¯Ø©');
  XLSX.writeFile(wb, 'Ø§Ù„Ø¹Ù‡Ø¯Ø©_Ø§Ù„Ù…Ø³Ø¹Ø±Ø©_' + new Date().toISOString().split('T')[0] + '.xlsx');
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert ' + type;
  el.style.display = 'block';
  if (type === 'success') { el.style.background = 'var(--ea-success-bg)'; el.style.color = 'var(--ea-success)'; el.style.borderColor = 'var(--ea-success-border)'; }
  else if (type === 'error') { el.style.background = 'var(--ea-error-bg)'; el.style.color = 'var(--ea-error)'; el.style.borderColor = 'var(--ea-error-border)'; }
  else { el.style.background = 'var(--ea-brand-bg)'; el.style.color = 'var(--ea-brand)'; el.style.borderColor = 'var(--ea-brand-border)'; }
}

// â”€â”€ Smart Log buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('sl-btn-refresh')?.addEventListener('click', loadSmartLogDashboard);
document.getElementById('sl-btn-clear')?.addEventListener('click', async () => {
  if (!confirm('Ù…Ø³Ø­ ÙƒÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØªØ¨Ø¹ØŸ')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_SMART_LOG' });
  currentSmartLogData = { manual: [], automated: [], errors: [], events: [] };
  renderSmartLogDashboard(currentSmartLogData);
});
document.getElementById('sl-btn-analyze')?.addEventListener('click', () => renderManualAnalysis(currentSmartLogData));
document.getElementById('sl-btn-excel')?.addEventListener('click', () => exportSmartLogExcel(currentSmartLogData));
document.getElementById('sl-btn-ai')?.addEventListener('click', () => analyzeSmartLogWithAI(currentSmartLogData));

// â”€â”€ Smart Log accordion: Ø§ÙØªØ­ ÙˆØ§Ø­Ø¯Ø© ØªÙ‚ÙÙ„ Ø§Ù„Ø¨Ø§Ù‚ÙŠ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('panel-smart-log')?.addEventListener('toggle', (e) => {
  if (!e.target.open) return;
  e.currentTarget.querySelectorAll('details').forEach(d => {
    if (d !== e.target) d.open = false;
  });
}, true);

// â”€â”€ Auto-Fill Subsystem Modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The Auto-Fill subsystem has been modularized into distinct, dedicated modules:
// - modules/autofill/fill-options.js   -> Options, conditional dropdowns, Second Visit & Masaha profiles
// - modules/autofill/device-actions.js -> Extract device, technical archive link, clear device data modal
// - modules/autofill/autofill-client.js-> Search single/batch engine, task list, progress & queue polling
// - modules/autofill/runtime-trace.js  -> Diagnostics, runtime trace logging, copy/clear/status trace


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SMART LOG TAB â€” Unified Sessions + Reports
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
  let totalOrders = 0, totalSuccess = 0, totalSkipped = 0, totalFailed = 0;
  logs.forEach(s => {
    (s.orders || []).forEach(o => {
      totalOrders++;
      if (o.status === 'done') totalSuccess++;
      else if (o.status === 'skipped') totalSkipped++;
      else if (!['opened'].includes(o.status)) totalFailed++;
    });
  });
  const elSess = document.getElementById('log-stat-sessions');
  const elOrds = document.getElementById('log-stat-orders');
  const elSucc = document.getElementById('log-stat-success');
  const elSkip = document.getElementById('log-stat-skipped');
  const elFail = document.getElementById('log-stat-failed');
  if (elSess) elSess.textContent = `Ø¬Ù„Ø³Ø§Øª: ${logs.length}`;
  if (elOrds) elOrds.textContent = `Ø¨Ù„Ø§ØºØ§Øª: ${totalOrders}`;
  if (elSucc) elSucc.textContent = `Ù†Ø¬Ø­: ${totalSuccess}`;
  if (elSkip) elSkip.textContent = `ØªØ®Ø·ÙŠ: ${totalSkipped}`;
  if (elFail) elFail.textContent = `ÙØ´Ù„: ${totalFailed}`;
}

function getResultMessage(st) {
  const map = {
    'done': 'Ø§ÙƒØªÙ…Ù„ Ø¨Ù†Ø¬Ø§Ø­ âœ…',
    'skipped': 'Ù…Ø³Ø¬Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ â­ï¸',
    'error': 'ÙØ´Ù„ âŒ',
    'not-found': 'ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ âŒ',
    'save-failed': 'ÙØ´Ù„ Ø§Ù„Ø­ÙØ¸ âš ï¸',
    'stopped': 'Ù…ØªÙˆÙ‚Ù ÙŠØ¯ÙˆÙŠØ§Ù‹ â›”',
    'opened': 'Ù…ÙØªÙˆØ­ ðŸ“„'
  };
  return map[st] || st || 'â€”';
}

function renderSmartLog(logs, filterText = '') {
  if (!logs || !logs.length) {
    logList.innerHTML = `<div class="empty-state"><div class="icon">ðŸ“œ</div><div>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¬Ù„Ø³Ø§Øª Ù…Ø³Ø¬Ù„Ø© Ø¨Ø¹Ø¯</div></div>`;
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
    const skipped   = orders.filter(o => o.status === 'skipped').length;
    const failed    = orders.filter(o => !['done','opened','skipped'].includes(o.status)).length;

    const ordersHtml = orders.map((o, oIdx) => {
      const pd = o.pageDetails || {};
      const injected = o.injectedData || o.report?.filled || {};
      const fr = o.fieldResults || {};
      const saveOk = o.saveResult?.ok || o.status === 'done';

      const statusIcon = { done:'âœ…', error:'âŒ', 'not-found':'âŒ', 'save-failed':'âš ï¸', skipped:'â­ï¸', stopped:'â›”', opened:'ðŸ“„' }[o.status] || 'âš™ï¸';
      const statusColor = o.status === 'done' ? 'var(--success)' : (o.status === 'skipped' ? '#ffb74d' : 'var(--danger,#ef5350)');

      // Build rich detail grid
      const detailRows = [];
      // Page-scraped info (address, phone, complaint)
      if (pd.address)       detailRows.push(['ðŸ“ Ø§Ù„Ø¹Ù†ÙˆØ§Ù†', escapeHtml(pd.address)]);
      if (pd.customerName)  detailRows.push(['ðŸ‘¤ Ø§Ù„Ø¹Ù…ÙŠÙ„', escapeHtml(pd.customerName)]);
      if (pd.phone)         detailRows.push(['ðŸ“ž Ø§Ù„Ù‡Ø§ØªÙ', escapeHtml(pd.phone)]);
      if (pd.complaintCode) detailRows.push(['ðŸ”´ ÙƒÙˆØ¯ Ø§Ù„Ø´ÙƒÙˆÙ‰', escapeHtml(pd.complaintCode)]);
      // Pre-existing Portal Data vs Injected Data Comparison
      if (o.existingPortalData) {
        const ep = o.existingPortalData;
        detailRows.push(['âš ï¸ Ø­Ø§Ù„Ø© Ø§Ù„Ø£Ù…Ø±', '<span style="color:#ffb74d;font-weight:bold;">Ù…Ø³Ø¬Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© (ØªÙ… Ø§Ù„ØªØ®Ø·ÙŠ Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª)</span>']);
        if (ep.serial) detailRows.push(['ðŸ”¢ Ø³ÙŠØ±ÙŠØ§Ù„ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©', `<b style="color:#ffb74d;">${escapeHtml(ep.serial)}</b> (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨: ${escapeHtml(injected.serial || 'â€”')})`]);
        if (ep.brand)  detailRows.push(['ðŸ·ï¸ Ø¨Ø±Ø§Ù†Ø¯ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©', `<b style="color:#ffb74d;">${escapeHtml(ep.brand)}</b> (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨: ${escapeHtml(injected.brand || 'â€”')})`]);
        if (ep.model)  detailRows.push(['ðŸ“¦ Ù…ÙˆØ¯ÙŠÙ„ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©', `<b style="color:#ffb74d;">${escapeHtml(ep.model)}</b> (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨: ${escapeHtml(injected.model || 'â€”')})`]);
        if (ep.warrantyDate) detailRows.push(['ðŸ“… ØªØ§Ø±ÙŠØ® Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©', `<b style="color:#ffb74d;">${escapeHtml(ep.warrantyDate)}</b> (Ø§Ù„Ù…Ø·Ù„ÙˆØ¨: ${escapeHtml(injected.date || 'â€”')})`]);
      }
      // Technician
      if (o.technician)     detailRows.push(['ðŸ”§ Ø§Ù„ÙÙ†ÙŠ', escapeHtml(o.technician)]);
      // Problem code selected
      if (o.problemSelected) detailRows.push(['ðŸ› ï¸ Ø§Ù„Ù…Ø´ÙƒÙ„Ø© Ø§Ù„ÙØ¹Ù„ÙŠØ©', escapeHtml(o.problemSelected)]);
      // Fault codes (drain)
      if (fr.faultDrain?.name)       detailRows.push(['ðŸš¿ ÙƒÙˆØ¯ Ø§Ù„ØµØ±Ù', escapeHtml(fr.faultDrain.name)]);
      if (fr.faultMaintenance?.name) detailRows.push(['ðŸ” Ø§Ù„ØµÙŠØ§Ù†Ø© Ø§Ù„Ø¯ÙˆØ±ÙŠØ©', escapeHtml(fr.faultMaintenance.name)]);
      if (fr.fault?.name)            detailRows.push(['âš¡ ÙƒÙˆØ¯ Ø§Ù„Ø¹Ø·Ù„', escapeHtml(fr.fault.name)]);
      // Injected fields (from extension)
      if (injected.serial)  detailRows.push(['ðŸ”¢ Serial (Ù…Ø­Ù‚ÙˆÙ†)', escapeHtml(injected.serial)]);
      if (injected.brand)   detailRows.push(['ðŸ·ï¸ Brand (Ù…Ø­Ù‚ÙˆÙ†)', escapeHtml(injected.brand)]);
      if (injected.model)   detailRows.push(['ðŸ“¦ Model (Ù…Ø­Ù‚ÙˆÙ†)', escapeHtml(injected.model)]);
      if (injected.status)  detailRows.push(['ðŸ›¡ï¸ Ø­Ø§Ù„Ø© Ø§Ù„Ø¶Ù…Ø§Ù† (Ù…Ø­Ù‚ÙˆÙ†)', escapeHtml(injected.status)]);
      if (injected.date)    detailRows.push(['ðŸ“… Ø§Ù„ØªØ§Ø±ÙŠØ® (Ù…Ø­Ù‚ÙˆÙ†)', escapeHtml(injected.date)]);
      // Manually modified fields
      if (pd.manuallyModified) {
        for (const [key, vals] of Object.entries(pd.manuallyModified)) {
          detailRows.push([`âœï¸ ${key} (ÙŠØ¯ÙˆÙŠ)`, `${escapeHtml(vals.manual)} <span style="color:var(--muted);font-size:10px;">(ÙƒØ§Ù†: ${escapeHtml(vals.injected || 'ÙØ§Ø±Øº')})</span>`]);
        }
      }
      // Spare parts
      if (fr.spareParts?.selected) detailRows.push(['ðŸ”© Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±', escapeHtml(fr.spareParts.selected)]);

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
            <button class="btn btn-secondary btn-order-copy" data-sidx="${sIdx}" data-oidx="${oIdx}" style="font-size:10px;padding:3px 8px;">ðŸ“‹ Ù†Ø³Ø®</button>
            <button class="btn btn-primary btn-order-replay" data-sidx="${sIdx}" data-oidx="${oIdx}" style="font-size:10px;padding:3px 8px;background:var(--success-bg);color:var(--success);border-color:var(--success);">ðŸ”„ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªÙ‚ÙÙŠÙ„</button>
            <button class="btn btn-primary btn-order-overwrite" data-sidx="${sIdx}" data-oidx="${oIdx}" style="font-size:10px;padding:3px 8px;background:#c25e00;color:#fff;border-color:#ff9800;" title="Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ¹Ø¨Ø¦Ø© Ù…Ø¹ ÙØ±Ø¶ Ø§Ù„ÙƒØªØ§Ø¨Ø© ÙˆØ§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©">âš¡ ÙØ±Ø¶ Ø§Ù„Ø§Ø³ØªØ¨Ø¯Ø§Ù„</button>
          </div>
        </div>
      </div>`;
    }).join('');

    if (!ordersHtml.trim()) return '';

    return `<div class="log-session-card" style="margin-bottom:14px;border:1px solid #2b4568;border-radius:8px;background:var(--surface-2);overflow:hidden;">
      <div class="log-session-header" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#131f33;cursor:pointer;"
           onclick="const b=this.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none'">
        <span style="font-size:16px;">${isActive ? 'ðŸŸ¢' : 'ðŸ“‚'}</span>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--accent);font-size:12px;">${isActive ? 'âš¡ Ø¬Ù„Ø³Ø© Ù†Ø´Ø·Ø©' : 'Ø¬Ù„Ø³Ø©: ' + escapeHtml(session.id)}</div>
          <div style="font-size:10px;color:var(--muted);">${startTime}${endTime ? ' â† ' + endTime : ''}</div>
        </div>
        <span style="font-size:11px;color:#ffffff; background: #17334c; padding: 1px 6px; border-radius: 4px;">${success} Ù†Ø¬Ø­</span>
        ${skipped ? `<span style="font-size:11px;color:#ffb74d; background: #3d2f10; padding: 1px 6px; border-radius: 4px;">${skipped} ØªØ®Ø·ÙŠ</span>` : ''}
        <span style="font-size:11px;color:#ef5350;">${failed} ÙØ´Ù„</span>
        <span style="font-size:11px;color:var(--muted);">${totalOrds} Ø¨Ù„Ø§Øº</span>
      </div>
      <div style="display:block;padding:8px;">
        ${ordersHtml}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-session-copy" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;">ðŸ“‹ Ù†Ø³Ø® Ø§Ù„Ø¬Ù„Ø³Ø©</button>
          <button class="btn btn-primary btn-session-replay" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;background:var(--success-bg);color:var(--success);border-color:var(--success);">ðŸ”„ Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„ÙƒÙ„</button>
          ${!isActive ? `<button class="btn btn-danger btn-session-delete" data-sidx="${sIdx}" style="font-size:10px;padding:4px 10px;">ðŸ—‘ï¸ Ø­Ø°Ù</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  logList.innerHTML = html || `<div class="empty-state"><div class="icon">ðŸ”</div><div>Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬ Ù„Ù„Ø¨Ø­Ø«</div></div>`;

  // â”€â”€ Attach event listeners â”€â”€
  // Session copy
  document.querySelectorAll('.btn-session-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const s = logs[parseInt(e.currentTarget.dataset.sidx)];
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      const orig = e.currentTarget.textContent; e.currentTarget.textContent = 'âœ… ØªÙ…';
      setTimeout(() => e.currentTarget.textContent = orig, 1500);
    });
  });

  // Session replay
  document.querySelectorAll('.btn-session-replay').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const session = logs[parseInt(e.currentTarget.dataset.sidx)];
      const tasksToReplay = (session.orders || []).map(o => o.originalTask).filter(Boolean);
      if (!tasksToReplay.length) { alert('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ù‡Ø§Ù… ÙƒØ§Ù…Ù„Ø© Ù„Ø¥Ø¹Ø§Ø¯Ø© ØªØ´ØºÙŠÙ„Ù‡Ø§.'); return; }
      const tab = await getActiveTab();
      if (!isPortalTab(tab)) { alert('Ø§ÙØªØ­ Ø£ÙŠ ØµÙØ­Ø© ÙÙŠ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø£ÙˆÙ„Ø§Ù‹'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'â³';
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
      if (!confirm('Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„Ø¬Ù„Ø³Ø©ØŸ')) return;
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
      const orig = e.currentTarget.textContent; e.currentTarget.textContent = 'âœ… ØªÙ…';
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
      if (!isPortalTab(tab)) { alert('Ø§ÙØªØ­ Ø£ÙŠ ØµÙØ­Ø© ÙÙŠ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø£ÙˆÙ„Ø§Ù‹'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'â³';
      await chrome.storage.local.set({ lastStatusUpdate: null });
      await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [t], tabId: tab.id });
      document.querySelector('[data-tab="search"]').click();
      buildTaskItems([t]);
      startStatusPolling(1, [t]);
    });
  });

  // Order replay with force-overwrite (single)
  document.querySelectorAll('.btn-order-overwrite').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const o = logs[parseInt(e.currentTarget.dataset.sidx)]?.orders?.[parseInt(e.currentTarget.dataset.oidx)];
      if (!o) return;
      const baseTask = o.originalTask || { taskId: 'r-' + Date.now(), orderId: o.orderId, data: o.injectedData || {} };
      const t = JSON.parse(JSON.stringify(baseTask));
      t.forceOverwrite = true;
      t.data = t.data || {};
      t.data.forceOverwrite = true;
      const tab = await getActiveTab();
      if (!isPortalTab(tab)) { alert('Ø§ÙØªØ­ Ø£ÙŠ ØµÙØ­Ø© ÙÙŠ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø£ÙˆÙ„Ø§Ù‹'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'â³';
      await chrome.storage.local.set({ lastStatusUpdate: null });
      await sendToTab(tab.id, { action: 'START_QUEUE', tasks: [t], tabId: tab.id });
      document.querySelector('[data-tab="search"]').click();
      buildTaskItems([t]);
      startStatusPolling(1, [t]);
    });
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TELEMETRY â€” Ù…Ø¨Ø³Ø·: Ø¢Ù„ÙŠ/ÙŠØ¯ÙˆÙŠ ÙÙ‚Ø·
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // Manual changes â€” grouped by diff
  const listEl = document.getElementById('sl-manual-list');
  if (listEl) {
    if (!manualArr.length) {
      listEl.innerHTML = '<div style="color:var(--muted);padding:8px;text-align:center;">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£Ø­Ø¯Ø§Ø« ÙŠØ¯ÙˆÙŠØ© Ù…Ø³Ø¬Ù„Ø©</div>';
    } else {
      const groups = {};
      const catOrder = { serial: 0, model: 1, brand: 2, status: 3, date: 4, spareparts: 5, fault: 6 };
      manualArr.forEach(e => {
        const diffKey = e.diff || `${e.oldValue || ''} â†’ ${e.newValue || ''}`;
        const key = `${e.label || e.field}||${e.category}||${diffKey}`;
        if (!groups[key]) {
          groups[key] = { label: e.label || e.field || 'â€”', category: e.category || 'other', oldValue: e.oldValue || '(ÙØ§Ø±Øº)', newValue: e.newValue || '(ÙØ§Ø±Øº)', diff: diffKey, count: 0, lastTime: 0, times: [] };
        }
        groups[key].count++;
        groups[key].lastTime = Math.max(groups[key].lastTime, e.timestamp || 0);
        if (e.timestamp) groups[key].times.push(new Date(e.timestamp).toLocaleTimeString('ar-EG'));
      });

      const sorted = Object.values(groups).sort((a, b) => {
        const catA = catOrder[a.category] ?? 99, catB = catOrder[b.category] ?? 99;
        return catA !== catB ? catA - catB : b.lastTime - a.lastTime;
      });

      const catLabels = { serial: 'Ø³ÙŠØ±ÙŠØ§Ù„', model: 'Ù…ÙˆØ¯ÙŠÙ„', brand: 'Ø¨Ø±Ø§Ù†Ø¯', status: 'Ø­Ø§Ù„Ø©', date: 'ØªØ§Ø±ÙŠØ®', spareparts: 'Ù‚Ø·Ø¹ ØºÙŠØ§Ø±', fault: 'Ø¹Ø·Ù„' };

      let currentCategory = '';
      listEl.innerHTML = sorted.map(g => {
        const catColor = g.category === 'serial' ? '#64b5f6' : g.category === 'model' ? '#ce93d8' : g.category === 'brand' ? '#ffb74d' : '#a8c7fa';
        const htmlCat = g.category !== currentCategory ? `<div style="color:${catColor};font-weight:700;font-size:10px;padding:6px 4px 3px;">${catLabels[g.category] || g.category}</div>` : '';
        currentCategory = g.category;
        const timeHint = g.times.slice(-3).join('ØŒ ');
        return `${htmlCat}<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#2e2a1a;border:1px solid #4a4020;border-radius:4px;font-size:10px;" title="${escapeHtml(timeHint)}">
          <span style="color:#ff9800;font-weight:700;white-space:nowrap;">Ã—${g.count}</span>
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
  if (!changes.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ¹Ø¯ÙŠÙ„Ø§Øª</div>'; return; }
  el.innerHTML = changes.map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    const auto = e.isAutomated ? 'ðŸ¤–' : 'ðŸ‘¤';
    const catColor = e.category === 'serial' ? '#64b5f6' : e.category === 'model' ? '#ce93d8' : e.category === 'brand' ? '#ffb74d' : '#a8c7fa';
    const pt2 = e.pageType === 'WORK_ORDER_REVIEW' ? 'ðŸ“‹' : e.pageType === 'ORDERS' ? 'ðŸ”' : e.pageType === 'TECHNICAL_REVIEW' ? 'ðŸ“„' : 'ðŸŒ';
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#1a1a0f;border:1px solid #3a3a1a;border-radius:4px;font-size:10px;">
      <span>${auto}</span>
      <span title="${escapeHtml(e.pageType || '')}">${pt2}</span>
      <span style="color:${catColor};font-weight:700;white-space:nowrap;">${escapeHtml(e.label || e.field || 'â€”')}</span>
      <span style="color:#ef5350;white-space:nowrap;">${escapeHtml(e.oldValue || '(ÙØ§Ø±Øº)')}</span>
      <span style="color:var(--muted);">â†’</span>
      <span style="color:#ffffff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.newValue || '(ÙØ§Ø±Øº)')}</span>
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

function renderNetworkErrors(logs) {
  const netErrs = logs.filter(e => e.eventType === 'NETWORK_ERROR');
  const el = document.getElementById('sl-network-errors');
  if (!el) return;
  if (!netErrs.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£Ø®Ø·Ø§Ø¡ Ø´Ø¨ÙƒØ©</div>'; return; }
  const grouped = {};
  netErrs.forEach(e => {
    const key = `${e.method || 'GET'} ${e.url || 'â€”'} [${e.status || 0}]`;
    if (!grouped[key]) grouped[key] = { ...e, count: 0 };
    grouped[key].count++;
  });
  el.innerHTML = Object.values(grouped).slice(0, 50).map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    const statusColor = e.status === 0 ? '#ef5350' : e.status >= 500 ? '#ff9800' : '#ffb74d';
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#0a1520;border:1px solid #1a2a3a;border-radius:4px;font-size:10px;">
      <span style="color:${statusColor};font-weight:700;white-space:nowrap;">[${e.status || 0}]</span>
      <span style="color:#a8c7fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.url || 'â€”')}</span>
      ${e.count > 1 ? `<span style="color:#ff9800;font-weight:700;">Ã—${e.count}</span>` : ''}
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

function renderActionLog(logs) {
  const actions = logs.filter(e => ['FIELD_FILLED','TASK_START','TASK_COMPLETE','VALIDATION_WARNING','CLIENT_VALIDATION_ERROR'].includes(e.eventType));
  const el = document.getElementById('sl-action-log');
  if (!el) return;
  if (!actions.length) { el.innerHTML = '<div style="color:var(--muted);padding:4px;">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª</div>'; return; }
  const sorted = [...actions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 200);
  el.innerHTML = sorted.map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ar-EG') : '';
    let icon, text, color;
    if (e.eventType === 'FIELD_FILLED') { icon = 'âœ…'; text = `${e.field || 'â€”'} = ${e.value || 'â€”'}`; color = '#ffffff'; }
    else if (e.eventType === 'TASK_START') { icon = 'ðŸš€'; text = `Ø¨Ø¯Ø¡ ${e.orderId || 'â€”'}`; color = '#a8c7fa'; }
    else if (e.eventType === 'TASK_COMPLETE') {
      if (e.skipped || e.reason === 'already-filled') {
        icon = 'â­ï¸';
        text = `${e.orderId || 'â€”'} Ù…Ø³Ø¬Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ (ØªØ®Ø·ÙŠ)`;
        color = '#ffb74d';
      } else {
        icon = e.success ? 'ðŸ' : 'âŒ';
        text = `${e.orderId || 'â€”'} ${e.success ? 'Ù†Ø¬Ø­' : 'ÙØ´Ù„'}`;
        color = e.success ? '#ffffff' : '#ef5350';
      }
    }
    else if (e.eventType === 'VALIDATION_WARNING') { icon = 'âš ï¸'; text = e.correlatedLabel ? `"${e.correlatedLabel}" â€” ${(e.errorText||'').substring(0,60)}` : (e.errorText||'').substring(0,60); color = '#ffc107'; }
    else if (e.eventType === 'CLIENT_VALIDATION_ERROR') { icon = 'âŒ'; text = (e.errorText||'').substring(0,60); color = '#f44336'; }
    else { icon = 'ðŸ“Œ'; text = e.eventType; color = '#a8c7fa'; }
    return `<div style="display:flex;gap:4px;align-items:center;padding:3px 6px;margin-bottom:2px;background:#0f1e35;border:1px solid #1f3a5a;border-radius:4px;font-size:10px;">
      <span>${icon}</span>
      <span style="color:${color};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>
      <span style="color:var(--muted);white-space:nowrap;">${time}</span>
    </div>`;
  }).join('');
}

// â”€â”€ Manual Analysis (grouped display) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderManualAnalysis(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const manual = data.manual || [];
  if (!manual.length) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:var(--muted);">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ¹Ø¯ÙŠÙ„Ø§Øª ÙŠØ¯ÙˆÙŠØ©</div>';
    return;
  }
  const groups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} â†’ ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!groups[key]) groups[key] = { label: e.label || e.field || 'â€”', category: e.category || 'other', diff: diffKey, count: 0 };
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
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ffb74d;">${manual.length}</div><div style="font-size:9px;color:#8899bb;">ÙŠØ¯ÙˆÙŠ</div></div>
      <div style="background:#17334c;padding:4px;border-radius:4px;text-align:center; border:1px solid rgba(255,255,255,0.15);"><div style="font-size:14px;font-weight:700;color:#ffffff;">${autoArr.length}</div><div style="font-size:9px;color:rgba(255,255,255,0.8);">Ø¢Ù„ÙŠ</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#ef5350;">${errArr.length}</div><div style="font-size:9px;color:#8899bb;">Ø£Ø®Ø·Ø§Ø¡</div></div>
      <div style="background:#1e304b;padding:4px;border-radius:4px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#64b5f6;">${errArr.filter(e => e.eventType === 'NETWORK_ERROR').length}</div><div style="font-size:9px;color:#8899bb;">Ø´Ø¨ÙƒØ©</div></div>
    </div>
    <div style="font-size:10px;font-weight:700;color:#ffb74d;margin-bottom:4px;">ðŸ”§ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„ÙŠØ¯ÙˆÙŠØ© (${Object.keys(groups).length} Ù†Ù…Ø·)</div>` +
    sorted.map(g => {
      const catColor = g.category === 'serial' ? '#64b5f6' : g.category === 'model' ? '#ce93d8' : g.category === 'brand' ? '#ffb74d' : '#a8c7fa';
      return `<div style="display:flex;gap:4px;align-items:center;padding:2px 4px;margin-bottom:1px;background:#2e2a1a;border:1px solid #4a4020;border-radius:3px;font-size:10px;">
        <span style="color:#ff9800;font-weight:700;">Ã—${g.count}</span>
        <span style="color:${catColor};">${escapeHtml(g.label)}</span>
        <span style="color:#ef5350;flex:1;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.diff)}</span>
      </div>`;
    }).join('');
}

// â”€â”€ Export Smart Log to Excel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function exportSmartLogExcel(data) {
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  if (!manual.length && !auto.length && !errors.length) { alert('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„ØªØµØ¯ÙŠØ±.'); return; }
  if (typeof XLSX === 'undefined') { alert('Ù…ÙƒØªØ¨Ø© Excel ØºÙŠØ± Ù…ØªÙˆÙØ±Ø©.'); return; }

  const wb = XLSX.utils.book_new();

  // Sheet 1: ÙŠØ¯ÙˆÙŠ
  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} â†’ ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${e.category}||${diffKey}`;
    if (!mGroups[key]) mGroups[key] = { label: e.label || e.field || 'â€”', category: e.category || '', diff: diffKey, count: 0 };
    mGroups[key].count++;
  });
  if (Object.keys(mGroups).length) {
    const mRows = [['Ø§Ù„Ø­Ù‚Ù„', 'Ø§Ù„ÙØ¦Ø©', 'Ø§Ù„ØªØºÙŠÙŠØ±', 'Ø¹Ø¯Ø¯ Ø§Ù„ØªÙƒØ±Ø§Ø±Ø§Øª']];
    Object.values(mGroups).forEach(g => mRows.push([g.label, g.category, g.diff, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(mRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'ÙŠØ¯ÙˆÙŠ');
  }

  // Sheet 2: Ø¢Ù„ÙŠ
  const aGroups = {};
  auto.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} â†’ ${e.newValue || ''}`;
    const key = `${e.label || e.field}||${diffKey}`;
    if (!aGroups[key]) aGroups[key] = { label: e.label || e.field || 'â€”', diff: diffKey, count: 0 };
    aGroups[key].count++;
  });
  if (Object.keys(aGroups).length) {
    const aRows = [['Ø§Ù„Ø­Ù‚Ù„', 'Ø§Ù„ØªØºÙŠÙŠØ±', 'Ø¹Ø¯Ø¯ Ø§Ù„ØªÙƒØ±Ø§Ø±Ø§Øª']];
    Object.values(aGroups).forEach(g => aRows.push([g.label, g.diff, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(aRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Ø¢Ù„ÙŠ');
  }

  // Sheet 3: Ø£Ø®Ø·Ø§Ø¡
  const errGroups = {};
  errors.forEach(e => {
    const detail = e.errorText || e.message || e.url || '';
    const key = `${e.eventType}||${detail}`;
    if (!errGroups[key]) errGroups[key] = { type: e.eventType === 'VALIDATION_WARNING' ? 'ØªØ­Ø°ÙŠØ±' : e.eventType === 'CLIENT_VALIDATION_ERROR' ? 'Ø®Ø·Ø£ Ø¹Ù…ÙŠÙ„' : e.eventType === 'NETWORK_ERROR' ? 'Ø´Ø¨ÙƒØ©' : 'Ø®Ø·Ø£ ØµÙØ­Ø©', detail, count: 0 };
    errGroups[key].count++;
  });
  if (Object.keys(errGroups).length) {
    const eRows = [['Ø§Ù„Ù†ÙˆØ¹', 'Ø§Ù„ÙˆØµÙ', 'Ø¹Ø¯Ø¯ Ø§Ù„ØªÙƒØ±Ø§Ø±Ø§Øª']];
    Object.values(errGroups).forEach(g => eRows.push([g.type, g.detail, g.count]));
    const ws = XLSX.utils.aoa_to_sheet(eRows);
    ws['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Ø£Ø®Ø·Ø§Ø¡');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ØªØ­Ù„ÙŠÙ„_Ø§Ù„Ù„ÙˆØ¬_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// â”€â”€ Analyze Smart Log with AI (Ollama) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function analyzeSmartLogWithAI(data) {
  const el = document.getElementById('sl-analysis');
  if (!el) return;
  const manual = data.manual || [], auto = data.automated || [], errors = data.errors || [];
  if (!manual.length && !auto.length && !errors.length) { el.style.display = 'block'; el.innerHTML = '<div style="color:var(--muted);">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„ØªØ­Ù„ÙŠÙ„</div>'; return; }

  el.style.display = 'block';
  el.innerHTML = '<div style="color:#a8c7fa;">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù„ÙŠÙ„ Ù…Ø¹ Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ...</div>';

  const mGroups = {};
  manual.forEach(e => {
    const diffKey = e.diff || `${e.oldValue || ''} â†’ ${e.newValue || ''}`;
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

  const prompt = `Ø­Ù„Ù„ Ø¨ÙŠØ§Ù†Ø§Øª ØªØªØ¨Ø¹ Ø³Ù„ÙˆÙƒ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„ØªØ§Ù„ÙŠØ© Ø¨Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©. Ø±ÙƒØ² Ø¹Ù„Ù‰:
1. Ø£ÙƒØ«Ø± Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„ÙŠØ¯ÙˆÙŠØ© ØªØºÙŠÙŠØ±Ø§Ù‹
2. Ø£Ù†Ù…Ø§Ø· Ø§Ù„ØªÙƒØ±Ø§Ø±
3. Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ù…ØªÙƒØ±Ø±Ø©
4. ØªÙˆØµÙŠØ§Øª Ù„Ù„ØªØ­Ø³ÙŠÙ†

Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„ÙŠØ¯ÙˆÙŠØ© (${manual.length} Ø­Ø¯Ø«ØŒ ${Object.keys(mGroups).length} Ù†Ù…Ø·):
${Object.values(mGroups).map(g => `${g.label} (${g.category}): ${g.diff} Ã—${g.count}`).join('\n')}

Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ø´Ø¨ÙƒØ©:
${Object.entries(netMap).map(([k, v]) => `${k} Ã—${v}`).join('\n')}

Ø§Ù„ØªØ­Ø°ÙŠØ±Ø§Øª:
${errors.filter(e => e.eventType === 'VALIDATION_WARNING').map(e => e.errorText).join('\n')}

Ø¥Ø¬Ù…Ø§Ù„ÙŠ: ${manual.length} ØªØ¹Ø¯ÙŠÙ„ ÙŠØ¯ÙˆÙŠØŒ ${auto.length} Ø¢Ù„ÙŠØŒ ${errors.length} Ø®Ø·Ø£`;

  try {
    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5-coder:14b', prompt, stream: false })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    el.innerHTML = '<div style="font-size:10px;line-height:1.7;white-space:pre-wrap;color:#a8c7fa;">' + escapeHtml(data.response || 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø±Ø¯') + '</div>';
  } catch (e) {
    el.innerHTML = `<div style="color:#ef5350;">âŒ ÙØ´Ù„ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ: ${escapeHtml(e.message)}<br><span style="color:#8899bb;font-size:10px;">ØªØ£ÙƒØ¯ Ù…Ù† ØªØ´ØºÙŠÙ„ Ollama Ø¹Ù„Ù‰ localhost:11434</span></div>`;
  }
}

// Smart log search
if (searchLogsInput) {
  searchLogsInput.addEventListener('input', () => {
    renderSmartLog(allSessionLogs, searchLogsInput.value);
  });
}

// Export
// Export Full Diagnostic & Session Report
document.getElementById('btn-export-sessions')?.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  const report = {
    exportedAt: new Date().toISOString(),
    version: '1.2.0',
    activeSession: data.activeSession || null,
    sessionLogs: data.sessionLogs || [],
    currentTask: data.currentTask || null,
    taskQueue: data.taskQueue || [],
    processingTabId: data.processingTabId || null,
    lastStatusUpdate: data.lastStatusUpdate || null,
    multiRunRuntimeTrace: data.multiRunRuntimeTrace || [],
    sysLogs: data.sysLogs || []
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elaraby_debug_report_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnRefreshLogs?.addEventListener('click', loadSmartLog);
btnClearLogs?.addEventListener('click', async () => {
  if (!confirm('Ù…Ø³Ø­ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¬Ù„Ø³Ø§Øª Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ØŸ')) return;
  await chrome.storage.local.set({ sessionLogs: [], activeSession: null });
  allSessionLogs = [];
  renderSmartLog([]);
  updateLogStats([]);
});

// â”€â”€ Listen for background messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'NEW_LOG') {
    // If on logs tab, refresh
    if (document.getElementById('panel-logs')?.classList.contains('active')) {
      loadSmartLog();
    }
  }
});

// â”€â”€ Initialize Auto-Fill Modular Subsystems â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.RuntimeTrace?.init();
window.FillOptions?.init();
window.DeviceActions?.init();
window.AutofillClient?.init();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXTRACT TAB LOGIC
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function setExtractStatus(text, type = 'info') {
  const el = document.getElementById('extract-status-msg');
  if (!el) return;
  el.className = `status-msg ${type}`;
  const icons = { info: 'â„¹ï¸', ok: 'âœ…', error: 'âŒ', warn: 'âš ï¸' };
  el.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(text)}</span>`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MONITORING & DIAGNOSTICS SUB-NAV & CARD CONTROLS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
document.querySelectorAll('.monitoring-pill-btn').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.monitoring-pill-btn').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const targetId = pill.dataset.targetCard;
    
    // Exclusive mode: close all monitoring cards, open ONLY the selected one
    document.querySelectorAll('.monitoring-card').forEach(card => {
      if (card.id === targetId) {
        card.open = true;
        card.style.display = 'block';
      } else {
        card.open = false;
        card.style.display = 'none';
      }
    });

    if (targetId === 'card-mon-sessions') loadSmartLog();
    else if (targetId === 'card-mon-smartlog') loadSmartLogDashboard();
    else if (targetId === 'card-mon-telemetry') initTelemetry();
    else if (targetId === 'card-mon-session') loadSessionCaptures();

    const targetCard = document.getElementById(targetId);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

document.getElementById('btn-mon-expand-all')?.addEventListener('click', () => {
  document.querySelectorAll('.monitoring-card').forEach(card => card.open = true);
});

document.getElementById('btn-mon-collapse-all')?.addEventListener('click', () => {
  document.querySelectorAll('.monitoring-card').forEach(card => card.open = false);
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAMPERMONKEY TAB LOGIC
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const TM_BUILTIN = [
  {
    id: 'elaraby-phone-reveal',
    name: 'ÙƒØ´Ù Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ù‡ÙˆØ§ØªÙ',
    desc: 'ÙŠÙ„ØºÙŠ Ø¥Ø®ÙØ§Ø¡ Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ù‡Ø§ØªÙ ÙÙŠ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„',
    source: 'Tempermonky/elaraby-phone-reveal.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'messenger-sender',
    name: 'Ù…Ø³Ø§Ø¹Ø¯ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ø§Ø³Ù†Ø¬Ø±',
    desc: 'Ø¥Ø±Ø³Ø§Ù„ Ø±Ø³Ø§Ø¦Ù„ Ù…Ø¬Ù…Ù‘Ø¹Ø© Ù…Ù† CSV Ø£Ùˆ Ø§Ù„Ù„ØµÙ‚ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±',
    source: 'Tempermonky/messenger-sender.js',
    match: 'https://*.facebook.com/*,https://*.messenger.com/*,https://*.instagram.com/*,https://*.whatsapp.com/*',
  },
  {
    id: 'report-processor',
    name: 'Ù…Ø¹Ø§Ù„Ø¬ Ø§Ù„Ø¨Ù„Ø§ØºØ§Øª',
    desc: 'ÙŠÙØªØ­ Ø§Ù„Ø¨Ù„Ø§ØºØ§Øª ÙˆÙŠÙØ­Øµ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª + Ø§Ø®ØªÙŠØ§Ø± ÙŠÙˆÙ… + Ø¨Ù„Ø§ØºØ§Øª Ù…Ø­Ø¯Ø¯Ø©',
    source: 'Tempermonky/report-processor.js',
    match: 'https://elarabyportalpfs.powerappsportals.com/*',
  },
  {
    id: 'future-orders-reveal',
    name: 'ÙƒØ´Ù Ø§Ù„Ø¨Ù„Ø§ØºØ§Øª Ø§Ù„Ù…Ø³ØªÙ‚Ø¨Ù„ÙŠØ©',
    desc: 'ÙŠÙƒØ´Ù Ø§Ù„Ø¨Ù„Ø§ØºØ§Øª Ø§Ù„Ù…Ø­Ø¬ÙˆØ²Ø© Ø¨Ø¹Ø¯ Ø£ÙƒØ«Ø± Ù…Ù† 3 Ø£ÙŠØ§Ù… ÙˆÙŠØ¯Ù…Ø¬Ù‡Ø§ ÙÙŠ Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ù…Ø¹ ØªÙ…ÙŠÙŠØ² ÙˆØ£ÙŠÙ‚ÙˆÙ†Ø©',
    source: 'Tempermonky/future-orders-reveal.js',
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
  setTmStatus('Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©...', 'info');

  let customScripts = [];
  try {
    const stored = await chrome.storage.local.get({ tampermonkeyCustomScripts: [] });
    customScripts = stored.tampermonkeyCustomScripts || [];
  } catch (e) { /* storage blocked */ }

  const builtinList = document.getElementById('tm-builtin-list');
  const customList = document.getElementById('tm-custom-list');

  // Load running state from runner (single source of truth)
  let tmRunning = {};
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_RUNNING_STATE' });
      if (response?.state) tmRunning = response.state;
    }
  } catch (e) { /* runner not available, fallback to stored state */ }

  // Fallback to stored state if runner didn't respond
  if (Object.keys(tmRunning).length === 0) {
    try {
      const stored2 = await chrome.storage.local.get({ tmRunning: {} });
      tmRunning = stored2.tmRunning || {};
    } catch (e) {}
  }

  if (builtinList) {
    builtinList.innerHTML = TM_BUILTIN.map(s => {
      const isRunning = tmRunning[s.id]?.running;
      const injectedAt = tmRunning[s.id]?.injectedAt;
      const timeStr = injectedAt ? new Date(injectedAt).toLocaleTimeString('ar-EG') : '';
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--surface-2);border:1px solid ${isRunning ? 'var(--success,#2bd46f)' : 'var(--border)'};border-radius:6px;">
        <span style="font-size:14px;flex-shrink:0;">${isRunning ? 'ðŸŸ¢' : 'âšª'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(s.name)} ${isRunning ? '<span style="color:var(--success,#2bd46f);font-size:10px;">â— Ø´ØºØ§Ù„</span>' : ''}</div>
          <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.desc)}${timeStr ? ' â€” ' + timeStr : ''}</div>
        </div>
        <button class="btn ${isRunning ? 'btn-danger' : 'btn-secondary'} tm-toggle" data-id="${escapeHtml(s.id)}" data-running="${isRunning ? '1' : '0'}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">${isRunning ? 'â¹ Ø¥ÙŠÙ‚Ø§Ù' : 'â–¶ï¸ ØªØ´ØºÙŠÙ„'}</button>
      </div>`;
    }).join('');
  }

  if (customList) {
    if (customScripts.length === 0) {
      customList.innerHTML = '<div class="empty-state" style="padding:12px;font-size:11px;">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³ÙƒØ±ÙŠØ¨ØªØ§Øª Ù…Ø®ØµØµØ©</div>';
    } else {
      customList.innerHTML = customScripts.map((s, i) => {
        const cid = 'custom-' + i + '-' + (s.name || '').replace(/[^a-z0-9]/gi, '');
        const isRunning = tmRunning[cid]?.running;
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;background:var(--surface-2);border:1px solid ${isRunning ? 'var(--success,#2bd46f)' : 'var(--border)'};border-radius:6px;">
          <span style="font-size:14px;flex-shrink:0;">${isRunning ? 'ðŸŸ¢' : 'âšª'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:var(--text);">${escapeHtml(s.name || 'Custom')} ${isRunning ? '<span style="color:var(--success,#2bd46f);font-size:10px;">â— Ø´ØºØ§Ù„</span>' : ''}</div>
            <div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.desc || 'Script #' + (i+1))}</div>
          </div>
          <button class="btn ${isRunning ? 'btn-danger' : 'btn-secondary'} tm-run-custom" data-idx="${i}" data-cid="${cid}" data-running="${isRunning ? '1' : '0'}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">${isRunning ? 'â¹' : 'â–¶ï¸'}</button>
          <button class="btn btn-danger tm-delete" data-idx="${i}" style="flex:0 0 auto;padding:3px 8px;font-size:10px;">ðŸ—‘</button>
        </div>`;
      }).join('');
    }
  }

  // Attach toggle handlers for built-in scripts â€” use runner
  document.querySelectorAll('.tm-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isRunning = btn.dataset.running === '1';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setTmStatus('Ø§ÙØªØ­ ØµÙØ­Ø© Ø£ÙˆÙ„Ø§Ù‹', 'error'); return; }

      if (isRunning) {
        setTmStatus(`â¹ Ø¬Ø§Ø±ÙŠ Ø¥ÙŠÙ‚Ø§Ù: ${id}`, 'warn');
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'STOP_SCRIPT_NOW', scriptId: id });
        } catch (e) {}
        setTmStatus(`â¹ ØªÙ… Ø¥ÙŠÙ‚Ø§Ù: ${id}`, 'info');
      } else {
        setTmStatus(`â–¶ï¸ Ø¬Ø§Ø±ÙŠ ØªØ´ØºÙŠÙ„: ${id}`, 'warn');
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'RUN_SCRIPT_NOW', scriptId: id });
        } catch (e) {}
        setTmStatus(`âœ… ØªÙ… ØªÙ†ÙÙŠØ°: ${id}`, 'ok');
      }
      // Refresh after a short delay to get updated state from runner
      setTimeout(loadTampermonkeyScripts, 500);
    });
  });

  // Attach run handlers for custom scripts â€” use runner
  document.querySelectorAll('.tm-run-custom').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const cid = btn.dataset.cid;
      const isRunning = btn.dataset.running === '1';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setTmStatus('Ø§ÙØªØ­ ØµÙØ­Ø© Ø£ÙˆÙ„Ø§Ù‹', 'error'); return; }

      if (isRunning) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'STOP_SCRIPT_NOW', scriptId: cid });
        } catch (e) {}
        setTmStatus(`â¹ ØªÙ… Ø¥ÙŠÙ‚Ø§Ù`, 'info');
      } else {
        setTmStatus('Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªÙ†ÙÙŠØ°...', 'warn');
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'RUN_SCRIPT_NOW', scriptId: cid });
        } catch (e) {}
        setTmStatus('âœ… ØªÙ… Ø§Ù„ØªÙ†ÙÙŠØ°', 'ok');
      }
      setTimeout(loadTampermonkeyScripts, 500);
    });
  });

  // Attach delete handlers
  document.querySelectorAll('.tm-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ø³ÙƒØ±ÙŠØ¨ØªØŸ')) return;
      const idx = parseInt(btn.dataset.idx);
      customScripts.splice(idx, 1);
      try { await chrome.storage.local.set({ tampermonkeyCustomScripts: customScripts }); } catch(e) {}
      loadTampermonkeyScripts();
    });
  });

  const runningCount = Object.values(tmRunning).filter(r => r.running).length;
  setTmStatus(`${TM_BUILTIN.length} Ù…Ø¯Ù…Ø¬ (${runningCount} Ø´ØºØ§Ù„) | ${customScripts.length} Ù…Ø®ØµØµ`, 'ok');
}

// File upload for custom scripts
const tmFileInput = document.getElementById('tm-file-input');

if (tmFileInput) {
  tmFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setTmStatus('âŒ Ø§Ù„Ù…Ù„Ù ÙƒØ¨ÙŠØ± Ø¬Ø¯Ø§Ù‹ (Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ 512 KB)', 'error');
      tmFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setTmStatus('âŒ ÙØ´Ù„ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ù…Ù„Ù', 'error');
      tmFileInput.value = '';
    };
    reader.onload = async (ev) => {
      const code = ev.target.result;
      if (!code || !code.trim()) {
        setTmStatus('âŒ Ø§Ù„Ù…Ù„Ù ÙØ§Ø±Øº', 'error');
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
        setTmStatus(`âœ… ØªÙ… Ø±ÙØ¹ ${file.name} (${(code.length / 1024).toFixed(1)} KB)`, 'ok');
        loadTampermonkeyScripts();
      } catch (e) {
        console.error('[Tampermonkey Upload]', e);
        setTmStatus('âŒ ÙØ´Ù„ Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù: ' + (e.message || 'Ø®Ø·Ø£ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'), 'error');
      }
      tmFileInput.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// â”€â”€ Shortcuts button: opens Edge keyboard-shortcuts page â”€â”€
const btnShortcuts = document.getElementById('btn-shortcuts');
if (btnShortcuts) {
  btnShortcuts.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url: 'edge://extensions/shortcuts' }).catch(() => {});
    }
  });
}

// â”€â”€ Connection strip: is the active tab a portal page? â”€â”€â”€â”€
async function refreshConnStrip() {
  const dot = document.getElementById('conn-dot');
  const txt = document.getElementById('conn-text');
  if (!dot || !txt) return;
  try {
    const tab = await getActiveTab();
    if (!tab?.url) { dot.className = 'conn-dot'; txt.textContent = 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ ØªØ¨ÙˆÙŠØ¨ Ù†Ø´Ø·'; return; }
    const isPortal = /elarabyportalpfs\.powerappsportals\.com/.test(tab.url);
    const isCrm    = /elarabyiscrm2\.azurewebsites\.net/.test(tab.url);
    if (isPortal) {
      dot.className = 'conn-dot on';
      txt.textContent = 'Ø¨ÙˆØ§Ø¨Ø© PowerApps Ù…ØªØµÙ„Ø© â€” Ø§Ù„Ø§Ø®ØªØµØ§Ø±Ø§Øª Ø¬Ø§Ù‡Ø²Ø©';
    } else if (isCrm) {
      dot.className = 'conn-dot on';
      txt.textContent = 'Ø¨ÙˆØ§Ø¨Ø© CRM Ù…ØªØµÙ„Ø© â€” Ø§Ù„Ø§Ø®ØªØµØ§Ø±Ø§Øª Ø¬Ø§Ù‡Ø²Ø©';
    } else {
      dot.className = 'conn-dot off';
      txt.textContent = 'Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Ø§Ù„Ù†Ø´Ø· Ù„ÙŠØ³ Ø¨ÙˆØ§Ø¨Ø© â€” Ø§ÙØªØ­ ØµÙØ­Ø© Ø¨ÙˆØ§Ø¨Ø© Ø£ÙˆÙ„Ø§Ù‹';
    }
  } catch (e) {
    dot.className = 'conn-dot';
    txt.textContent = 'ØªØ¹Ø°Ø± Ø§Ù„ÙØ­Øµ';
  }
}
document.addEventListener('DOMContentLoaded', refreshConnStrip);
chrome.tabs.onActivated && chrome.tabs.onActivated.addListener(refreshConnStrip);
chrome.tabs.onUpdated   && chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') refreshConnStrip(); });

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SESSION CAPTURE TAB â€” Ø§Ù„Ø¬Ù„Ø³Ø© (Ù„Ù‚Ø·Ø§Øª Ø§Ù„ØµÙØ­Ø§Øª Ù„Ø­Ø¸Ø© Ø¨Ù„Ø­Ø¸Ø©)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  document.getElementById('session-stat-orders').textContent = `Ø£ÙˆØ§Ù…Ø±: ${orders.length}`;
  document.getElementById('session-stat-pages').textContent  = `Ù„Ù‚Ø·Ø§Øª ØµÙØ­Ø§Øª: ${totalPages}`;
  document.getElementById('session-stat-events').textContent = `Ø£Ø­Ø¯Ø§Ø«: ${totalEvents}`;

  if (!orders.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">ðŸ“¸</div><div>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¬Ù„Ø³Ø§Øª Ù…Ø³Ø¬Ù„Ø© Ø¨Ø¹Ø¯ â€” Ø§ÙØªØ­ ØµÙØ­Ø© Ø£Ù…Ø± Ø´ØºÙ„ (workorderreview) Ù„ØªØ³Ø¬ÙŠÙ„ Ù„Ø­Ø¸Ø§ØªÙ‡Ø§</div></div>';
    return;
  }

  const filtered = q ? orders.filter(o =>
    (o.orderId || '').toLowerCase().includes(q) ||
    (o.pages || []).some(p => (p.url || '').toLowerCase().includes(q) || (p.pageType || '').toLowerCase().includes(q))
  ) : orders;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">ðŸ”</div><div>Ù„Ø§ Ù†ØªØ§Ø¦Ø¬ Ù…Ø·Ø§Ø¨Ù‚Ø©</div></div>';
    return;
  }

  const html = filtered.map(o => {
    const pages = o.pages || [];
    const events = o.events || [];
    const first = fmtTime(o.firstSeen);
    const last  = fmtTime(o.lastSeen);
    const oid = escapeHtml(o.orderId);

    // Ø¨Ù†Ø§Ø¡ Timeline ÙˆØ§Ø­Ø¯ ÙŠØ¬Ù…Ø¹ Ø§Ù„Ù„Ù‚Ø·Ø§Øª + Ø§Ù„Ø£Ø­Ø¯Ø§Ø« Ø¨Ø§Ù„ØªØ±ØªÙŠØ¨ Ø§Ù„Ø²Ù…Ù†ÙŠ Ø§Ù„ÙØ¹Ù„ÙŠ
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
          `<li style="margin:0 0 1px 0;"><b>${escapeHtml(s.label || s.name || s.id || 'ØŸ')}</b>: <span style="color:${s.selectedValue ? '#ffb74d' : 'var(--muted)'}">${escapeHtml(s.selectedText || s.selectedValue || '(ÙØ§Ø±Øº)')}</span>${s.selectedText ? ` <span style="color:var(--muted)">[${escapeHtml(s.selectedValue)}]</span>` : ''}</li>`
        ).join('');
        const inpRows = (item.inputs || []).map(x =>
          `<li style="margin:0 0 1px 0;"><b>${escapeHtml(x.label || x.name || x.id || 'ØŸ')}</b>: <span style="color:${x.value ? '#a8c7fa' : 'var(--muted)'}">${escapeHtml(x.value || '(ÙØ§Ø±Øº)')}</span></li>`
        ).join('');
        const btnList = (item.buttons || []).map(b => b.text).join('ØŒ ');
        const pageType = escapeHtml(item.pageType || '');
        const reason = escapeHtml(item.reason || '');

        return `<details style="margin:0 0 6px 0;border-right:3px solid #64b5f6;">
          <summary style="cursor:pointer;font-size:11px;color:#64b5f6;padding:3px 6px;background:#0f1a2e;border-radius:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span style="background:#1e3a5f;color:#fff;border-radius:3px;padding:0 5px;font-weight:700;">#${seq}</span>
            <span style="color:#ffd54f;">â± +${delta}</span>
            <span>ðŸ–¼ï¸ <b>${pageType}</b></span>
            <span style="color:var(--muted);font-size:10px;">${reason}</span>
            <span style="color:var(--muted);font-size:10px;">(${(item.selects || []).length} selects / ${(item.inputs || []).length} inputs / ${(item.buttons || []).length} buttons)</span>
          </summary>
          <div style="padding:5px 6px;font-size:10px;background:#0d1b2a;border-radius:4px;line-height:1.5;">
            <div style="color:var(--muted);word-break:break-all;margin-bottom:4px;">ðŸ• ${ts} â€” ${escapeHtml(item.url || '')}</div>
            ${selRows ? `<div style="color:#ffcc80;margin-top:2px;">ðŸ”» Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ù†Ø³Ø¯Ù„Ø©:</div><ul style="margin:2px 0 0 14px;padding:0;list-style:none;">${selRows}</ul>` : ''}
            ${inpRows ? `<div style="color:#90caf9;margin-top:2px;">âœï¸ Ø§Ù„Ø­Ù‚ÙˆÙ„:</div><ul style="margin:2px 0 0 14px;padding:0;list-style:none;">${inpRows}</ul>` : ''}
            ${btnList ? `<div style="color:#a5d6a7;margin-top:2px;">ðŸ”˜ Ø§Ù„Ø£Ø²Ø±Ø§Ø±: <span style="color:var(--muted)">${escapeHtml(btnList.slice(0, 400))}</span></div>` : ''}
          </div>
        </details>`;
      }

      // event (ÙƒÙ„ÙŠÙƒ / Ø¶ØºØ·Ø©)
      const icon = item.type === 'click' ? 'ðŸ‘†' : 'âš™ï¸';
      const color = item.type === 'click' ? '#ffb74d' : '#90caf9';
      return `<div style="margin:0 0 3px 0;padding:2px 6px;font-size:10px;background:#1a1305;border-radius:4px;border-right:3px solid ${color};display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <span style="background:#5f4a1e;color:#fff;border-radius:3px;padding:0 5px;font-weight:700;">#${seq}</span>
        <span style="color:#ffd54f;">â± +${delta}</span>
        <span>${icon} <b style="color:${color};">${escapeHtml(item.tag || '')}</b> ${escapeHtml(item.text || '')}</span>
        <span style="color:var(--muted);font-size:9px;">ðŸ• ${ts}</span>
      </div>`;
    }).join('') || '<div style="color:var(--muted);padding:4px;">Ù„Ø§ Ø£Ø­Ø¯Ø§Ø« Ù…Ø³Ø¬Ù„Ø© Ø¨Ø¹Ø¯</div>';

    // Ù…Ù„Ø®Øµ Ø§Ù„Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…Ø© Ø¹Ø¨Ø± ÙƒÙ„ Ø§Ù„Ù„Ù‚Ø·Ø§Øª
    const allBtnTexts = [...new Set(
      (pages || []).flatMap(p => (p.buttons || []).map(b => b.text))
    )].slice(0, 30);

    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;margin-bottom:10px;padding:6px 8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:12px;color:#ffb74d;">ðŸ†” ${oid}</span>
        <span style="font-size:10px;color:var(--muted);">Ø£ÙˆÙ„: ${first} â€¢ Ø¢Ø®Ø±: ${last}</span>
      </div>
      <div style="font-size:10px;color:#a8c7fa;margin:2px 0 4px;">ðŸ“„ ${pages.length} Ù„Ù‚Ø·Ø© â€¢ ðŸ‘† ${events.length} ÙƒÙ„ÙŠÙƒ</div>
      ${allBtnTexts.length ? `<div style="font-size:9px;color:var(--muted);margin-bottom:4px;word-break:break-word;">ðŸ”˜ Ø£Ø²Ø±Ø§Ø± Ø§Ù„ØµÙØ­Ø©: ${allBtnTexts.map(t => escapeHtml(t)).join('ØŒ ')}</div>` : ''}
      <details open>
        <summary style="cursor:pointer;font-size:10px;font-weight:700;color:#64b5f6;padding:2px 4px;background:#0f1a2e;border-radius:4px;margin-bottom:3px;">â³ Ø§Ù„Ø®Ø· Ø§Ù„Ø²Ù…Ù†ÙŠ (Ø¨Ø§Ù„ØªØ±ØªÙŠØ¨ Ø§Ù„ÙØ¹Ù„ÙŠ + Ø§Ù„ØªÙˆÙ‚ÙŠØªØ§Øª)</summary>
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
  if (!confirm('Ù…Ø³Ø­ ÙƒÙ„ Ù„Ù‚Ø·Ø§Øª Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù…Ø³Ø¬Ù„Ø©ØŸ')) return;
  chrome.storage.local.remove(SESSION_CAPTURE_KEY).then(loadSessionCaptures);
}

document.getElementById('btn-refresh-session')?.addEventListener('click', loadSessionCaptures);
document.getElementById('btn-export-session')?.addEventListener('click', exportSessionCaptures);
document.getElementById('btn-clear-session')?.addEventListener('click', clearSessionCaptures);
document.getElementById('search-session')?.addEventListener('input', loadSessionCaptures);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SETTINGS â€” Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø¹Ø§Ù…Ø© + Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ù…Ù†Ø§Ø·Ù‚ ÙˆØ§Ù„ÙÙ†ÙŠÙŠÙ†
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ pending map held in memory while user edits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _regionTechMap = {};    // { region: techName }
let _techRoster    = [];    // string[]

function _regionTechStatus(msg, isError) {
  const el = document.getElementById('region-tech-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--ea-danger, #f87171)' : 'var(--muted)';
}

// Rebuild the rows table from _regionTechMap + _techRoster
// Rebuild the rows table from _regionTechMap + _techRoster
function _renderRegionTechRows() {
  const container = document.getElementById('region-tech-rows');
  if (!container) return;
  const entries = Object.entries(_regionTechMap);
  if (!entries.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0;">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†Ø§Ø·Ù‚ Ù…Ø³Ø¬Ù„Ø© Ø¨Ø¹Ø¯ â€” Ø³ØªØ¸Ù‡Ø± Ù‡Ù†Ø§ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¨Ù…Ø¬Ø±Ø¯ ÙØªØ­ Ø£ÙŠ Ø¨Ù„Ø§Øº Ø¹Ù„Ù‰ Ø§Ù„Ø¨ÙˆØ±ØªØ§Ù„ Ø£Ùˆ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¶Ø§ÙØªÙ‡Ø§ ÙŠØ¯ÙˆÙŠØ§Ù‹ Ø¨Ø§Ù„Ø£Ø³ÙÙ„</div>';
    return;
  }
  container.innerHTML = entries.map(([region, tech]) => `
    <div class="region-tech-row" data-region="${escapeHtml(region)}"
      style="display:flex;align-items:center;gap:6px;margin-bottom:5px;background:var(--ea-surface-2);border:1px solid var(--ea-border);border-radius:6px;padding:5px 8px;">
      <span style="flex:1;font-size:12px;font-weight:600;">${escapeHtml(region)}</span>
      <select class="rtr-tech-select" style="flex:1;padding:4px 6px;background:var(--ea-input-bg);border:1px solid var(--ea-border);border-radius:5px;color:var(--ea-text);font-family:inherit;font-size:11px;">
        <option value="" ${!tech ? 'selected' : ''}>â€” Ø§Ø®ØªØ± Ø§Ù„ÙÙ†ÙŠ â€”</option>
        ${_techRoster.map(t => `<option value="${escapeHtml(t)}" ${t === tech ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <button class="rtr-del-btn" style="background:transparent;border:none;color:#f87171;font-size:15px;cursor:pointer;padding:0 4px;" title="Ø­Ø°Ù">âœ•</button>
    </div>
  `).join('');

  // Row events
  container.querySelectorAll('.rtr-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const region = btn.closest('.region-tech-row').dataset.region;
      delete _regionTechMap[region];
      _renderRegionTechRows();
    });
  });
  container.querySelectorAll('.rtr-tech-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const region = sel.closest('.region-tech-row').dataset.region;
      _regionTechMap[region] = sel.value;
    });
  });
}

// Fill the "new technician" dropdown from roster
function _fillNewTechSelect() {
  const sel = document.getElementById('region-tech-new-tech');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">â€” Ø§Ø®ØªØ± Ø§Ù„ÙÙ†ÙŠ â€”</option>' +
    _techRoster.map(t => `<option value="${escapeHtml(t)}" ${t === prev ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

// Render the roster display box
function _renderRoster() {
  const box = document.getElementById('region-tech-roster');
  if (!box) return;
  if (!_techRoster.length) {
    box.innerHTML = '<span style="color:var(--muted);">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø¹Ø¯ â€” Ø³ÙŠØªÙ… Ø§Ù„Ø­ÙØ¸ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ÙØªØ­ Ù†Ø§ÙØ°Ø© Ø§Ù„ÙÙ†ÙŠÙŠÙ† Ø£Ùˆ ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø¶Ø§ÙØ© Ø§Ø³Ù… ÙÙ†ÙŠ Ø¨Ø§Ù„Ø£Ø³ÙÙ„</span>';
    return;
  }
  box.innerHTML = _techRoster.map(t =>
    `<span style="display:inline-block;margin:2px 3px;padding:2px 7px;background:var(--ea-surface-2);border:1px solid var(--ea-border);border-radius:12px;font-size:11px;">${escapeHtml(t)}</span>`
  ).join('');
}

// Load both roster + map from storage and refresh UI
async function _loadRegionTechData() {
  const data = await chrome.storage.local.get({ technicianRoster: [], regionTechMap: {} });
  let roster = Array.isArray(data.technicianRoster) ? data.technicianRoster : [];
  const invalidRegex = /sort\s*(ascending|descending)|full\s*name|mobile\s*phone|id\s*number/i;

  // Filter out table header artifacts
  roster = roster.filter(t => t && !invalidRegex.test(t));

  _techRoster = roster;
  _regionTechMap = (data.regionTechMap && typeof data.regionTechMap === 'object') ? { ...data.regionTechMap } : {};

  // Clean any invalid values inside regionTechMap
  let mapModified = false;
  for (const [r, t] of Object.entries(_regionTechMap)) {
    if (invalidRegex.test(t)) {
      _regionTechMap[r] = '';
      mapModified = true;
    }
  }
  if (mapModified) {
    await chrome.storage.local.set({ regionTechMap: _regionTechMap });
  }

  _renderRoster();
  _fillNewTechSelect();
  _renderRegionTechRows();
}

function initSettings() {
  // Always refresh latest data when tab is opened
  _loadRegionTechData();

  // Only bind event listeners once
  const card = document.getElementById('card-set-region-tech');
  if (card?._settingsInitDone) return;
  if (card) card._settingsInitDone = true;

  // Live storage sync
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.technicianRoster || changes.regionTechMap)) {
        _loadRegionTechData();
      }
    });
  } catch(_) {}

  // Add manual technician
  document.getElementById('btn-region-tech-add-manual-tech')?.addEventListener('click', async () => {
    const input = document.getElementById('region-tech-manual-tech');
    const name = (input?.value || '').trim();
    if (!name) { _regionTechStatus('Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø§Ù„ÙÙ†ÙŠ', true); return; }
    if (!_techRoster.includes(name)) {
      _techRoster.push(name);
      await chrome.storage.local.set({ technicianRoster: _techRoster });
      input.value = '';
      _renderRoster();
      _fillNewTechSelect();
      _renderRegionTechRows();
      _regionTechStatus(`âœ… ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„ÙÙ†ÙŠ: ${name}`, false);
    } else {
      _regionTechStatus('Ø§Ù„ÙÙ†ÙŠ Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„ÙØ¹Ù„ Ø¨Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©', true);
    }
  });

  // Clear entire region map
  document.getElementById('btn-region-tech-clear-map')?.addEventListener('click', async () => {
    if (!confirm('Ù…Ø³Ø­ Ø¬Ù…ÙŠØ¹ Ø±Ø¨Ø·Ø§Øª Ø§Ù„Ù…Ù†Ø§Ø·Ù‚ØŸ')) return;
    _regionTechMap = {};
    await chrome.storage.local.set({ regionTechMap: {} });
    _renderRegionTechRows();
    _regionTechStatus('ØªÙ… Ù…Ø³Ø­ Ø®Ø±ÙŠØ·Ø© Ø§Ù„Ù…Ù†Ø§Ø·Ù‚', false);
  });

  // Add new region mapping
  document.getElementById('btn-region-tech-add')?.addEventListener('click', () => {
    const regionInput = document.getElementById('region-tech-new-region');
    const techSel    = document.getElementById('region-tech-new-tech');
    const region = (regionInput?.value || '').trim();
    const tech   = (techSel?.value || '').trim();
    if (!region) { _regionTechStatus('Ø£Ø¯Ø®Ù„ Ø§Ø³Ù… Ø§Ù„Ù…Ù†Ø·Ù‚Ø©', true); return; }
    _regionTechMap[region] = tech || '';
    regionInput.value = '';
    techSel.value = '';
    _renderRegionTechRows();
    _regionTechStatus(`âœ… ØªÙ…Øª Ø¥Ø¶Ø§ÙØ©: ${escapeHtml(region)}${tech ? ' â†’ ' + tech : ''}`, false);
  });

  // Save map to storage
  document.getElementById('btn-region-tech-save')?.addEventListener('click', async () => {
    // Collect any live edits from selects before saving
    document.querySelectorAll('.region-tech-row').forEach(row => {
      const region = row.dataset.region;
      const sel = row.querySelector('.rtr-tech-select');
      if (region && sel) _regionTechMap[region] = sel.value || '';
    });
    await chrome.storage.local.set({ regionTechMap: _regionTechMap });
    _regionTechStatus(`âœ… ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø®Ø±ÙŠØ·Ø© (${Object.keys(_regionTechMap).length} Ù…Ù†Ø·Ù‚Ø©)`, false);
  });

  // Reload from storage
  document.getElementById('btn-region-tech-reload')?.addEventListener('click', async () => {
    await _loadRegionTechData();
    _regionTechStatus('ðŸ”„ ØªÙ… Ø§Ù„ØªØ­Ù…ÙŠÙ„ Ù…Ù† Ø§Ù„Ø°Ø§ÙƒØ±Ø©', false);
  });

  // Clear roster
  document.getElementById('btn-region-tech-clear-roster')?.addEventListener('click', async () => {
    if (!confirm('Ù…Ø³Ø­ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙÙ†ÙŠÙŠÙ† Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©ØŸ Ø³ØªÙØ¹Ø§Ø¯ ØªØ¹Ø¨Ø¦ØªÙ‡Ø§ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ÙØªØ­ Ù†Ø§ÙØ°Ø© Ø§Ù„ÙÙ†ÙŠÙŠÙ†.')) return;
    _techRoster = [];
    await chrome.storage.local.set({ technicianRoster: [] });
    _renderRoster();
    _fillNewTechSelect();
    _regionTechStatus('ØªÙ… Ù…Ø³Ø­ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙÙ†ÙŠÙŠÙ†', false);
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// END OF FILE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

