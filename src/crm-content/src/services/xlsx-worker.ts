/**
 * CRM XLSX Worker — Reads Excel files in Web Worker
 * Extracts CRM/CAS numbers from uploaded files
 */

import { getXLSXWorker, XLSXParseResult } from '../../../shared/xlsx-worker-base';

export interface CRMExcelRow {
  sap: string;
  notes?: string;
}

export interface CRMExcelParseResult {
  sapNumbers: string[];
  headers: string[];
  sapColumnIndex: number;
  notesColumnIndex: number;
  totalRows: number;
}

const SAP_PATTERNS = [
  /^CAS\d+/i,
  /^CRM\d+/i,
  /^\d{10,}$/,
];

const SAP_HEADER_KEYWORDS = ['بلاغ', 'crm', 'cas', 'رقم', 'sap'];
const NOTES_HEADER_KEYWORDS = ['ملاحظات', 'notes', 'وصف', 'description', 'تفاصيل'];

/**
 * Parse Excel file and extract CRM numbers
 */
export async function parseCRMExcel(file: File): Promise<CRMExcelParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const worker = getXLSXWorker();

  const result = await worker.parse(arrayBuffer, {
    headerRow: 0,
    defval: ''
  });

  const { headers, rows } = result;

  // Find SAP column
  let sapColIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (SAP_HEADER_KEYWORDS.some(k => h.includes(k))) {
      sapColIndex = i;
      break;
    }
  }

  // Fallback: find column with CAS/CRM pattern
  if (sapColIndex < 0 && rows.length > 0) {
    for (let i = 0; i < headers.length; i++) {
      const sample = rows.slice(0, 10).map(r => String(r[headers[i]] || '')).join(' ');
      if (SAP_PATTERNS.some(p => p.test(sample))) {
        sapColIndex = i;
        break;
      }
    }
  }

  // Find notes column
  let notesColIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (NOTES_HEADER_KEYWORDS.some(k => h.includes(k))) {
      notesColIndex = i;
      break;
    }
  }

  // Extract SAP numbers — skip empty rows entirely, keep scanning later rows
  const sapNumbers: string[] = [];
  const seen = new Set<string>();
  let totalRows = 0;

  for (const row of rows) {
    const sapVal = String(row[headers[sapColIndex]] || '').trim();
    if (!sapVal) continue;
    totalRows++;

    // Normalize
    const normalized = sapVal.replace(/[^\dA-Z]/gi, '').toUpperCase();
    if (!normalized) continue;

    // Check if matches CAS/CRM pattern
    if (SAP_PATTERNS.some(p => p.test(normalized))) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        sapNumbers.push(normalized);
      }
    }
  }

  return {
    sapNumbers,
    headers,
    sapColumnIndex: sapColIndex,
    notesColumnIndex: notesColIndex,
    totalRows: totalRows || rows.length
  };
}

/**
 * Write results back to Excel
 * Merges extraction results INTO the ORIGINAL workbook preserving all formatting:
 * reads the original file with cellStyles:true, appends report/time columns to the
 * right of existing data, fills them per-row by SAP match, and writes back as xlsx.
 */
export async function writeCRMResults(
  originalFile: File,
  results: Array<{ sap: string; reports: string[]; status: string; extractedAt: string }>,
  originalHeaders: string[],
  sapColIndex: number
): Promise<Blob> {
  const arrayBuffer = await originalFile.arrayBuffer();
  const worker = getXLSXWorker();

  const merged = await worker.merge(arrayBuffer, {
    results,
    sapColumnIndex: sapColIndex,
    reportLabel: 'رقم التقرير',
    timeLabel: 'وقت الاستخراج',
    bookType: 'xlsx'
  });

  return new Blob([merged], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}