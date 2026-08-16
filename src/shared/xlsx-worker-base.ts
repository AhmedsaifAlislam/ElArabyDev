/**
 * XLSX Web Worker Base — Shared SheetJS worker module
 * Provides parsing/reading Excel files in a Web Worker to avoid blocking main thread
 */

export interface XLSXParseOptions {
  headerRow?: number; // 0-indexed row to use as headers
  defval?: string;
}

export interface XLSXParseResult {
  headers: string[];
  rows: Record<string, any>[];
  sheetName: string;
}

export interface XLSXWriteOptions {
  bookType?: 'xlsx' | 'xls' | 'csv';
  sheetName?: string;
}

export interface WorkerMessage<TPayload = any> {
  id: string;
  action: 'parse' | 'write' | 'merge';
  payload: TPayload;
}

export interface WorkerResponse<TData = any> {
  id: string;
  success: boolean;
  data?: TData;
  error?: string;
}

/**
 * Creates the worker code as a string (for Blob URL)
 * This is the code that runs INSIDE the Web Worker
 */
export function createXLSXWorkerCode(wasmUrl?: string): string {
  return `
/* XLSX Web Worker for El Araby Extensions */
const XLSX_URL = "${chrome.runtime.getURL('lib/xlsx.full.min.js')}";
const WASM_URL = ${wasmUrl ? `"${wasmUrl}"` : 'null'};

let XLSX: any = null;

async function loadXLSX() {
  if (XLSX) return XLSX;

  // Load XLSX library from the extension (Web Workers use importScripts)
  importScripts(XLSX_URL);

  // Wait for XLSX to be available on self
  let attempts = 0;
  while (!self.XLSX && attempts < 50) {
    importScripts(XLSX_URL);
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  XLSX = self.XLSX;
  return XLSX;
}

function parseArrayBuffer(buffer: ArrayBuffer, options: any = {}): { headers: string[]; rows: any[]; sheetName: string } {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true, ...options });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON with header row
  const json = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: options.defval || '',
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!json.length) return { headers: [], rows: [], sheetName };

  const headerRow = options.headerRow ?? 0;
  const headers = (json[headerRow] || []).map((h: any) => String(h || '').trim());
  const rows = json.slice(headerRow + 1).map((row: any[]) => {
    const obj: Record<string, any> = {};
    headers.forEach((h: string, i: number) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  return { headers, rows, sheetName };
}

function writeWorkbook(data: any[], options: any = {}): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data, { header: Object.keys(data[0] || {}), ...options });
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');
  return XLSX.write(workbook, { type: 'array', bookType: options.bookType || 'xlsx' });
}

/**
 * Merge CRM extraction results into the ORIGINAL workbook preserving formatting.
 * Reads the original buffer with cellStyles:true, appends report/time columns to
 * the right of the existing range, fills them per-row by SAP match, and writes
 * back with cellStyles:true so every original cell keeps its styles/widths.
 */
function mergeCRMResults(buffer: ArrayBuffer, options: any = {}): ArrayBuffer {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: true });
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('Sheet not found: ' + sheetName);

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const results = options.results || [];
  const bySap = new Map<string, any>();
  results.forEach((r: any) => bySap.set(String(r.sap || '').trim().toUpperCase(), r));

  const sapCol = options.sapColumnIndex != null ? options.sapColumnIndex : 0;

  // Determine max report count across results (for header row)
  let maxReports = 0;
  results.forEach((r: any) => {
    const n = (r.reports || []).length;
    if (n > maxReports) maxReports = n;
  });

  // New columns start right after the current last column
  const startCol = range.e.c + 1;
  const timeCol = startCol + maxReports;

  // Header cells for appended columns
  for (let hi = 0; hi < maxReports; hi++) {
    worksheet[XLSX.utils.encode_cell({ r: 0, c: startCol + hi })] = {
      t: 's', v: (options.reportLabel || 'رقم التقرير') + ' ' + (hi + 1)
    };
  }
  worksheet[XLSX.utils.encode_cell({ r: 0, c: timeCol })] = {
    t: 's', v: options.timeLabel || 'وقت الاستخراج'
  };

  // Fill per data row by matching the SAP cell value
  for (let R = 1; R <= range.e.R; R++) {
    const sapCell = worksheet[XLSX.utils.encode_cell({ r: R, c: sapCol })];
    if (!sapCell) continue;
    const raw = sapCell.v != null ? sapCell.v : sapCell.w;
    if (raw == null) continue;
    const sapVal = String(raw).trim().toUpperCase();
    if (!sapVal) continue;
    const rr = bySap.get(sapVal);
    if (!rr) continue;

    const reports = rr.reports || [];
    for (let c = 0; c < reports.length && c < maxReports; c++) {
      worksheet[XLSX.utils.encode_cell({ r: R, c: startCol + c })] = { t: 's', v: String(reports[c]) };
    }
    if (rr.extractedAt) {
      worksheet[XLSX.utils.encode_cell({ r: R, c: timeCol })] = { t: 's', v: String(rr.extractedAt) };
    }
  }

  // Extend the reference range to cover the new columns
  range.e.c = Math.max(range.e.c, timeCol);
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  return XLSX.write(workbook, { type: 'array', bookType: options.bookType || 'xlsx', cellStyles: true });
}

self.onmessage = async function(e) {
  const { id, action, payload } = e.data;

  try {
    await loadXLSX();

    let result: any;
    if (action === 'parse') {
      result = parseArrayBuffer(payload.buffer, payload.options);
    } else if (action === 'write') {
      result = writeWorkbook(payload.data, payload.options);
    } else if (action === 'merge') {
      result = mergeCRMResults(payload.buffer, payload.options);
    } else {
      throw new Error('Unknown action: ' + action);
    }

    self.postMessage({ id, success: true, data: result });
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message });
  }
};
`;
}

/**
 * Client-side wrapper to communicate with the XLSX worker
 */
export class XLSXWorker {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private requestId = 0;

  constructor(wasmUrl?: string) {
    this.#initWorker(wasmUrl);
  }

  #initWorker(wasmUrl?: string) {
    const code = createXLSXWorkerCode(wasmUrl);
    const blob = new Blob([code], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, success, data, error } = e.data;
      const pending = this.pending.get(id);
      if (!pending) return;
      if (success) pending.resolve(data);
      else pending.reject(new Error(error));
      this.pending.delete(id);
    };

    this.worker.onerror = (err) => {
      console.error('[XLSXWorker] Worker error:', err);
      this.pending.forEach(({ reject }) => reject(new Error('Worker error: ' + err.message)));
      this.pending.clear();
    };
  }

  async parse(buffer: ArrayBuffer, options: any = {}): Promise<{ headers: string[]; rows: any[]; sheetName: string }> {
    if (!this.worker) throw new Error('Worker not initialized');
    const id = `parse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, action: 'parse', payload: { buffer, options } }, [buffer]);
    });
  }

  async write(data: any[], options: any = {}): Promise<ArrayBuffer> {
    if (!this.worker) throw new Error('Worker not initialized');
    const id = `write_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, action: 'write', payload: { data, options } });
    });
  }

  async merge(buffer: ArrayBuffer, options: any = {}): Promise<ArrayBuffer> {
    if (!this.worker) throw new Error('Worker not initialized');
    const id = `merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, action: 'merge', payload: { buffer, options } }, [buffer]);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

// Singleton instance
let xlsxWorkerInstance: XLSXWorker | null = null;

export function getXLSXWorker(wasmUrl?: string): XLSXWorker {
  if (!xlsxWorkerInstance) {
    xlsxWorkerInstance = new XLSXWorker(wasmUrl);
  }
  return xlsxWorkerInstance;
}

export function terminateXLSXWorker() {
  xlsxWorkerInstance?.terminate();
  xlsxWorkerInstance = null;
}