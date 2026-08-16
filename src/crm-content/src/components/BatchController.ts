/**
 * BatchController — Manages CRM extraction batches, pagination, and coordination
 */

import { CRMPortalDOM } from '../services/portal-dom';
import { CRMStorage, CRMState, CRMExtractionResult, CRMTableRow } from '../services/storage';
import { CRMActions, CRMContentMessenger, sendToBackground } from '../services/message-bus';
import { smartLog } from '../../../shared/storage';

const BATCH_SIZE = 25;
const SKIP_STATUSES = ['canceled', 'postpone'];
const PAGE_LOAD_TIMEOUT = 12000;
const SEARCH_DELAY = 500;

export class CRMBatchController {
  private state: CRMState;
  private isRunning = false;
  private shouldStop = false;
  private abortController: AbortController | null = null;
  private onUpdate?: (snapshot: any) => void;

  constructor(initialState?: Partial<CRMState>, onUpdate?: (snapshot: any) => void) {
    this.state = {
      sapList: [],
      results: [],
      batchCurrent: 0,
      batchSaps: [],
      pageRows: [],
      running: false,
      logs: [],
      latestExtracts: [],
      ...initialState,
    };
    this.onUpdate = onUpdate;
  }

  async start(sapNumbers: string[]): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.shouldStop = false;
    this.abortController = new AbortController();

    // Initialize state
    this.state.sapList = [...new Set(sapNumbers)]; // dedupe
    this.state.results = [];
    this.state.batchCurrent = 0;
    this.state.running = true;
    this.state.logs = [];
    this.state.latestExtracts = [];

    await CRMStorage.saveState(this.state);
    await this.#notifyPopup('started', { total: this.state.sapList.length });

    CRMStorage.addLog(this.state, `🚀 بدء استخراج ${this.state.sapList.length} بلاغ`, 'info');
    await smartLog.addEntry('crm_extraction_start', { total: this.state.sapList.length });

    try {
      await this.#processAllBatches();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        CRMStorage.addLog(this.state, '🛑 تم إيقاف الاستخراج', 'warn');
      } else {
        CRMStorage.addLog(this.state, `❌ خطأ: ${err.message}`, 'error');
        await this.#notifyPopup('error', { error: err.message });
      }
    } finally {
      this.isRunning = false;
      this.state.running = false;
      await CRMStorage.saveState(this.state);
      await this.#notifyPopup('completed', { results: this.state.results });
    }
  }

  stop() {
    this.shouldStop = true;
    this.abortController?.abort();
  }

  async #processAllBatches(): Promise<void> {
    const totalBatches = Math.ceil(this.state.sapList.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (this.shouldStop) throw new DOMException('Aborted', 'AbortError');

      this.state.batchCurrent = batchIdx;
      this.state.batchSaps = this.state.sapList.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);

      CRMStorage.addLog(this.state, `📦 الدفعة ${batchIdx + 1}/${Math.ceil(this.state.sapList.length / BATCH_SIZE)} (${this.state.batchSaps.length} بلاغ)`, 'info');
      await this.#saveAndNotify();

      await this.#processBatch(this.state.batchSaps);
    }
  }

  async #processBatch(batch: string[]): Promise<void> {
    // Set dropdown to CRM and search
    await this.#searchBatch(batch);

    // Wait for table
    const table = await CRMPortalDOM.waitForTable(PAGE_LOAD_TIMEOUT);
    if (!table) throw new Error('لم يتم العثور على جدول النتائج');

    // Extract all pages for this batch
    let hasMorePages = true;
    let pageCount = 0;
    const maxPages = 50;

    while (hasMorePages && pageCount < maxPages && !this.shouldStop) {
      pageCount++;
      const pageData = CRMPortalDOM.extractTableData();
      if (!pageData || pageData.rows.length === 0) break;

      this.state.pageRows = pageData.rows;
      await this.#processPageResults(pageData.rows);

      hasMorePages = pageData.hasNextPage;
      if (hasMorePages) {
        const clicked = await CRMPortalDOM.clickNextPage();
        if (!clicked) break;
        await new Promise(r => setTimeout(r, 1000)); // Wait for page load
      }
    }

    // If we still have SAPs in this batch that weren't found, mark as empty
    const foundSaps = new Set(this.state.pageRows.map(r => r.crm));
    for (const sap of this.state.batchSaps) {
      if (!foundSaps.has(sap) && !this.state.results.some(r => r.sap === sap)) {
        const now = new Date().toISOString();
        this.state.results.push({ sap, reports: [], status: 'empty', extractedAt: now });
        CRMStorage.addLog(this.state, `❌ ${sap} : لا توجد تقارير`, 'error');
      }
    }

    await this.#saveAndNotify();
  }

  async #searchBatch(batch: string[]): Promise<void> {
    const { dropdown, searchBtn, textbox } = CRMPortalDOM.getSearchElements();
    if (!textbox || !searchBtn) throw new Error('عناصر البحث غير موجودة');

    // Set dropdown to CRM
    const dd = document.querySelector<HTMLSelectElement>('#ContentPlaceHolder1_DropDownList2');
    if (dd && dd.value !== 'CRM') {
      dd.value = 'CRM';
      dd.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    textbox.value = batch.join('\n');
    textbox.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise(r => setTimeout(r, SEARCH_DELAY));
    searchBtn.click();
  }

  async #processPageResults(rows: CRMTableRow[]): Promise<void> {
    const recs: Record<string, { reports: string[] }> = {};

    for (const row of rows) {
      const stat = (row.status || '').toLowerCase();
      if (SKIP_STATUSES.some(s => stat.includes(s))) continue;

      if (!recs[row.crm]) recs[row.crm] = { reports: [] };
      if (row.report) recs[row.crm].reports.push(row.report);
    }

    const now = new Date().toISOString();
    const batchExtracts: Array<{ crm: string; count: number; first: string }> = [];

    for (const sap of this.state.batchSaps) {
      const r = recs[sap] || { reports: [] };
      const reports = r.reports.filter(Boolean);
      const status = reports.length ? 'found' : 'empty';

      this.state.results.push({ sap, reports, status, extractedAt: now });

      if (reports.length > 0) {
        CRMStorage.addLog(this.state, `✅ ${sap} : ${reports.length} تقرير`, 'ok');
        batchExtracts.push({ crm: sap, count: reports.length, first: reports[0].substring(0, 25) });
      } else {
        CRMStorage.addLog(this.state, `❌ ${sap} : لا توجد تقارير`, 'error');
        batchExtracts.push({ crm: sap, count: 0, first: '-' });
      }
    }

    this.state.latestExtracts = batchExtracts.slice(-5);
    await this.#saveAndNotify();
  }

  async #saveAndNotify(): Promise<void> {
    await CRMStorage.saveState(this.state);
    const snapshot = {
      running: this.state.running,
      total: this.state.sapList.length,
      done: this.state.results.length,
      pct: this.state.sapList.length > 0
        ? Math.round((this.state.results.length / this.state.sapList.length) * 100)
        : 0,
      currentBatch: this.state.batchCurrent + 1,
      totalBatches: Math.ceil(this.state.sapList.length / BATCH_SIZE),
      latestExtracts: this.state.latestExtracts,
      summary: {
        done: this.state.results.length,
        found: this.state.results.filter(r => r.status === 'found').length,
        empty: this.state.results.filter(r => r.status === 'empty').length,
      },
      results: [...this.state.results],
    };
    this.onUpdate?.(snapshot);
    await this.#notifyPopup('progress', snapshot);
  }

  async #notifyPopup(action: string, data: any) {
    try {
      await sendToBackground(`crm:${action}`, data);
    } catch { /* ignore */ }
  }

  // Public API
  getState() { return { ...this.state }; }
  getResults() { return this.state.results; }
  isActive() { return this.isRunning; }
}