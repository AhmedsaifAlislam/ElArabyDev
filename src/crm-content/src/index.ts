/**
 * CRM Content Script Entry Point — Main orchestrator
 * Registers Custom Elements, initializes services, handles messages
 */

import '../../shared/storage'; // Ensures storage proxy types
import '../../shared/message-bus'; // Ensures message bus types

// ── Force-register el-* UI components ──
// The CRM components reference these only in HTML template strings, so the
// named imports would be tree-shaken and their customElements.define side
// effects never run. Side-effect imports below guarantee registration.
import '../../ui-components/Table';
import '../../ui-components/Button';
import '../../ui-components/Badge';
import '../../ui-components/Input';
import '../../ui-components/Select';
import '../../ui-components/Progress';
import '../../ui-components/Toast';
import { CRMPortalDOM } from './services/portal-dom';
import { CRMBatchController } from './components/BatchController';
import { CRMStorage, CRMState, CRMExtractionResult } from './services/storage';
import { CRMContentMessenger, CRMActions, onCRMMessage } from './services/message-bus';
import { writeCRMResults } from './services/xlsx-worker';
import { smartLog } from '../../shared/storage';

// Import components (auto-register)
import './components/FileUploader';
import './components/ProgressPanel';
import './components/ResultsTable';
import './components/BatchController';

declare global {
  interface Window {
    crmExtractor: CRMBatchController | null;
  }
}

// Prevent double initialization
if (document.getElementById('__crm-extractor-root')) {
  console.log('[CRM Extractor] Already loaded');
} else {
  console.log('[CRM Extractor] v2.0 loading...');
  init();
}

async function init() {
  // Check if we're on the correct page
  if (!CRMPortalDOM.isOnSelectReportPage()) {
    console.log('[CRM Extractor] Not on SelectReport.aspx, exiting');
    return;
  }

  // Wait for DOM elements
  const elements = CRMPortalDOM.getSearchElements();
  if (!elements.textbox) {
    console.log('[CRM Extractor] Required elements not found, exiting');
    return;
  }

  console.log('[CRM Extractor] Page detected, initializing...');

  try {
    // Load saved state (graceful fallback if storage proxy is unavailable)
    let savedState: CRMState = await CRMStorage.getState();
    if (!savedState || typeof savedState !== 'object') savedState = {} as CRMState;

    // Create root container for Shadow DOM UI
  const root = document.createElement('div');
  root.id = '__crm-extractor-root';
  root.setAttribute('data-theme', 'light');
  root.style.cssText = [
    'position:fixed;top:20px;right:20px;z-index:999999;direction:rtl;',
    'width:420px;max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);',
    'overflow:auto;background:var(--ea-surface,#ffffff);border:1px solid var(--ea-border,#d5e0ee);',
    'border-radius:14px;box-shadow:0 12px 40px rgba(11,18,32,.28);padding:16px;',
    'font-family:Cairo,Segoe UI,Tahoma,sans-serif;',
  ].join('');
  root.style.display = 'none';
  document.body.appendChild(root);

  const panelHeader = document.createElement('div');
  panelHeader.style.cssText = [
    'display:flex;align-items:center;justify-content:space-between;',
    'margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--ea-border,#d5e0ee);',
  ].join('');
  panelHeader.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--ea-text,#1a2a44);">
      <span style="font-size:16px;">📄</span> البحث عن بلاغ — استخراج التقارير
    </div>
    <button id="crmPanelClose" type="button" aria-label="إغلاق"
      style="width:28px;height:28px;border:none;border-radius:8px;background:var(--ea-faint,#eef3f9);color:var(--ea-muted,#5b7394);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">✕</button>
  `;
  root.appendChild(panelHeader);
  panelHeader.querySelector('#crmPanelClose')!.addEventListener('click', () => setPanelVisible(false));

  // Create the بحث عن بلاغ FAB (primary entry point on the CRM page)
  const fab = createFab();
  setPanelVisible(Boolean(savedState.panelOpen));

  // Create UI container
  const uiContainer = document.createElement('div');
  uiContainer.id = '__crm-extractor-ui';
  uiContainer.innerHTML = `
    <crm-file-uploader></crm-file-uploader>
    <crm-progress-panel style="display:none; margin-top: 16px;"></crm-progress-panel>
    <crm-results-table style="display:none; margin-top: 16px;"></crm-results-table>
  `;
  root.appendChild(uiContainer);

  const progressPanel = uiContainer.querySelector('crm-progress-panel') as any;
  const resultsTable = uiContainer.querySelector('crm-results-table') as any;

  // Create batch controller — wired to the in-page panels (not just popup)
  const controller = new CRMBatchController(savedState, (snap) => {
    if (progressPanel) progressPanel.setState(snap);
    if (snap.results && resultsTable) resultsTable.setData(snap.results);
    if (snap.running !== true && snap.total > 0 && snap.results?.length >= snap.total) {
      showResultsPanel();
    }
  });
  window.crmExtractor = controller;

  // ── In-page panel events (FAB → panel flow, no popup needed) ──
  let lastFile: File | null = null;
  let lastParseResult: any = null;

  root.addEventListener('crm-start', async (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const saps = (detail.parseResult?.sapNumbers || []).map(String);
    if (!saps.length) {
      showToast('لا توجد أرقام بلاغ في الملف', 'warning');
      return;
    }
    lastFile = detail.file || null;
    lastParseResult = detail.parseResult || null;
    showProgressPanel();
    await controller.start(saps);
  });

  root.addEventListener('crm-export', async (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const data = detail.data || controller.getResults();
    if (!data || data.length === 0) {
      showToast('لا توجد نتائج للتصدير', 'warning');
      return;
    }
    try {
      if (lastFile && lastParseResult) {
        const blob = await writeCRMResults(lastFile, data, lastParseResult.headers, lastParseResult.sapColumnIndex);
        downloadBlob(blob, `crm-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('تم تصدير Excel بنفس التنسيق الأصلي', 'success');
      } else {
        exportResultsCSV(data);
      }
    } catch (err: any) {
      console.error('[CRM Extractor] Export failed:', err);
      showToast('فشل تصدير Excel، تم التصدير كـ CSV', 'warning');
      exportResultsCSV(data);
    }
  });

  // Register actions through the unified message bus (one shared runtime listener).
  // popup → content via chrome.tabs.sendMessage with { action, payload } works because
  // the bus dispatches on message.action.
  onCRMMessage(CRMActions.START_EXTRACTION, async (payload, sendResponse) => {
    showUI();
    // Fire-and-forget: start extraction in background, respond immediately
    controller.start((payload.sapNumbers || []).map(String)).catch(() => {});
    sendResponse({ success: true, data: { ok: true } });
  });

  onCRMMessage(CRMActions.STOP_EXTRACTION, async (_payload, sendResponse) => {
    showUI();
    controller.stop();
    sendResponse({ success: true, data: { ok: true } });
  });

  onCRMMessage(CRMActions.GET_STATUS, async (_payload, sendResponse) => {
    showUI();
    sendResponse({ success: true, data: controller.getState() });
  });

  onCRMMessage(CRMActions.EXPORT_RESULTS, async (_payload, sendResponse) => {
    showUI();
    sendResponse({ success: true, data: { results: controller.getResults() } });
  });

  console.log('[CRM Extractor] Ready');
  } catch (err: any) {
    console.error('[CRM Extractor] Init failed:', err);
    // Show the FAB even if init fails partway so the user can still open the panel
    if (document.getElementById('__crm-extractor-root')) {
      setPanelVisible(true);
    }
  }
}

function showUI() {
  setPanelVisible(true);
  const ui = document.getElementById('__crm-extractor-ui');
  if (ui) {
    const panels = ui.querySelectorAll('crm-progress-panel, crm-results-table');
    panels.forEach((p) => { (p as HTMLElement).style.display = 'block'; });
  }
}

// ── بحث عن بلاغ FAB ──────────────────────────────────────────
// Fixed round button on the CRM page that toggles the extraction panel.
const FAB_ID = '__crm-extractor-fab';

function createFab(): HTMLButtonElement {
  const existing = document.getElementById(FAB_ID) as HTMLButtonElement | null;
  if (existing) return existing;

  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.title = 'البحث عن بلاغ — استخراج تقارير CRM';
  fab.setAttribute('aria-label', 'البحث عن بلاغ');
  fab.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  fab.style.cssText = [
    'position:fixed;bottom:24px;right:24px;z-index:999998;width:52px;height:52px;',
    'border-radius:50%;border:2px solid var(--ea-brand,#0e7490);cursor:pointer;',
    'background:linear-gradient(135deg,#0e7490,#155e75);color:#e0f2fe;',
    'display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(14,116,144,.45);',
    'transition:transform .15s ease,box-shadow .15s ease;',
  ].join('');
  fab.addEventListener('click', () => {
    const root = document.getElementById('__crm-extractor-root');
    if (!root) return;
    const next = root.style.display !== 'block';
    setPanelVisible(next);
  });
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.08)';
    fab.style.boxShadow = '0 10px 28px rgba(14,116,144,.6)';
  });
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 8px 24px rgba(14,116,144,.45)';
  });

  document.body.appendChild(fab);
  return fab;
}

function setPanelVisible(visible: boolean) {
  const root = document.getElementById('__crm-extractor-root');
  if (root) root.style.display = visible ? 'block' : 'none';
  const fab = document.getElementById(FAB_ID);
  if (fab) {
    fab.style.background = visible
      ? 'linear-gradient(135deg,#0f766e,#0d9488)'
      : 'linear-gradient(135deg,#0e7490,#155e75)';
    fab.title = visible ? 'البحث عن بلاغ — إخفاء اللوحة' : 'البحث عن بلاغ — استخراج تقارير CRM';
  }
  CRMStorage.saveState({ panelOpen: visible }).catch(() => {});
}

// ── Panel helpers ────────────────────────────────────────────
function showProgressPanel() {
  const ui = document.getElementById('__crm-extractor-ui');
  if (!ui) return;
  const uploader = ui.querySelector('crm-file-uploader');
  const progress = ui.querySelector('crm-progress-panel');
  const results = ui.querySelector('crm-results-table');
  if (uploader) (uploader as HTMLElement).style.display = 'none';
  if (progress) (progress as HTMLElement).style.display = 'block';
  if (results) (results as HTMLElement).style.display = 'none';
}

function showResultsPanel() {
  const ui = document.getElementById('__crm-extractor-ui');
  if (!ui) return;
  const uploader = ui.querySelector('crm-file-uploader');
  const progress = ui.querySelector('crm-progress-panel');
  const results = ui.querySelector('crm-results-table');
  if (uploader) (uploader as HTMLElement).style.display = 'none';
  if (progress) (progress as HTMLElement).style.display = 'none';
  if (results) (results as HTMLElement).style.display = 'block';
}

function showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' = 'info') {
  const container = document.createElement('el-toast-container');
  document.body.appendChild(container);
  (container as any).show({ message, variant });
  setTimeout(() => container.remove(), 5500);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function exportResultsCSV(data: CRMExtractionResult[]) {
  if (!data || data.length === 0) {
    showToast('لا توجد نتائج للتصدير', 'warning');
    return;
  }
  const rows = data.map((r) => [
    r.sap,
    r.status === 'found' ? 'بها تقارير' : r.status === 'empty' ? 'بدون تقارير' : 'خطأ',
    (r.reports || []).join(' | '),
    r.extractedAt,
  ]);
  const header = ['رقم البلاغ', 'الحالة', 'التقارير', 'وقت الاستخراج'];
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crm-results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Export for debugging
export { CRMBatchController };