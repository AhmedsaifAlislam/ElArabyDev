/**
 * CRM Storage Service — Wrapper for unified storage (storage-proxy + smart-log)
 * Specific to CRM content script needs
 */

import { storageGet, storageSet, storageRemove, smartLog } from '../../../shared/storage';

const CRM_STORAGE_KEY = 'crmExtractorState';

export interface CRMState {
  sapList: string[];
  results: CRMExtractionResult[];
  batchCurrent: number;
  batchSaps: string[];
  pageRows: CRMTableRow[];
  running: boolean;
  logs: CRMLogEntry[];
  latestExtracts: CRMExtractLog[];
  panelOpen?: boolean;
}

export interface CRMExtractionResult {
  sap: string;
  reports: string[];
  status: 'found' | 'empty' | 'error';
  extractedAt: string;
  error?: string;
}

export interface CRMTableRow {
  crm: string;
  status: string;
  report: string;
  rowIndex: number;
}

export interface CRMLogEntry {
  t: string;
  m: string;
  c: 'info' | 'ok' | 'error' | 'warn';
}

export interface CRMExtractLog {
  crm: string;
  count: number;
  first: string;
}

const DEFAULT_STATE: CRMState = {
  sapList: [],
  results: [],
  batchCurrent: 0,
  batchSaps: [],
  pageRows: [],
  running: false,
  logs: [],
  latestExtracts: [],
  panelOpen: false,
};

const BATCH_SIZE = 25;
const SKIP_STATUSES = ['canceled', 'postpone'];

export class CRMStorage {
  static async getState(): Promise<CRMState> {
    const result = await storageGet(CRM_STORAGE_KEY);
    return { ...DEFAULT_STATE, ...(result[CRM_STORAGE_KEY] || {}) };
  }

  static async saveState(state: Partial<CRMState>): Promise<void> {
    const current = await this.getState();
    const merged = { ...current, ...state };
    await storageSet({ [CRM_STORAGE_KEY]: merged });
  }

  static async clearState(): Promise<void> {
    await storageRemove(CRM_STORAGE_KEY);
  }

  static addLog(state: CRMState, message: string, type: CRMLogEntry['c'] = 'info') {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    state.logs.push({ t: ts, m: message, c: type });
    if (state.logs.length > 200) state.logs.shift();
  }

  static async logSmartLog(actionType: string, details: Record<string, any>) {
    await smartLog.addEntry(actionType, details);
  }

  // Batch processing helpers
  static getNextBatch(state: CRMState): string[] {
    const start = state.batchCurrent * BATCH_SIZE;
    return state.sapList.slice(start, start + BATCH_SIZE);
  }

  static processBatchResults(state: CRMState, pageRows: CRMTableRow[]): CRMExtractionResult[] {
    const recs: Record<string, { reports: string[] }> = {};

    for (const row of pageRows) {
      const stat = (row.status || '').toLowerCase();
      if (SKIP_STATUSES.some(s => stat.includes(s))) continue;

      if (!recs[row.crm]) recs[row.crm] = { reports: [] };
      if (row.report) recs[row.crm].reports.push(row.report);
    }

    const now = new Date();
    const ts = now.toISOString();
    const batchResults: CRMExtractionResult[] = [];

    for (const sap of state.batchSaps) {
      const r = recs[sap] || { reports: [] };
      const reports = r.reports.filter(Boolean);
      batchResults.push({
        sap,
        reports,
        status: reports.length ? 'found' : 'empty',
        extractedAt: new Date().toISOString()
      });

      if (reports.length > 0) {
        this.addLog(state, `✅ ${sap} : ${reports.length} تقرير`, 'ok');
      } else {
        this.addLog(state, `❌ ${sap} : لا توجد تقارير`, 'error');
      }
    }

    return batchResults;
  }

  static getProgress(state: CRMState) {
    const total = state.sapList.length;
    const done = state.results.length;
    const batches = Math.ceil(total / BATCH_SIZE);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, pct, currentBatch: state.batchCurrent + 1, totalBatches: batches };
  }

  static getSummary(state: CRMState) {
    const withReports = state.results.filter(r => r.reports && r.reports.length > 0).length;
    return { withReports, withoutReports: state.results.length - withReports };
  }
}