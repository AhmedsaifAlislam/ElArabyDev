/**
 * excel-exporter.js — تصدير Excel/CSV الموحد
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، dashboard
 * يوفّر:
 *   - واجهة عامة: exportExcel, exportCSV, downloadBlob, exportRows
 *   - ExcelExporter (toWorkbook, export, sheetFromRows) — واجهة OOP
 *
 * يدعم ExcelJS (إن وُجد في `window.ExcelJS` أو `window.exceljs`) + fallback لـ CSV
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyExcelExporterLoaded) return;
  global.__elarabyExcelExporterLoaded = true;

  /**
   * تحميل ملف عبر Blob
   * @param {Blob} blob - ملف
   * @param {string} filename - اسم الملف
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * تنسيق قيمة كسلسلة
   */
  function fmt(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  /**
   * تصدير CSV
   * @param {Array<Object>|string[][]} rows - صفوف (كائنات أو مصفوفات)
   * @param {string[]|null} headers - الرؤوس (اختياري — يُستنتج من أول كائن)
   * @param {string} filename - اسم الملف
   */
  function exportCSV(rows, headers, filename) {
    let hdr = headers;
    let data = rows;

    if (!Array.isArray(hdr) && data.length && typeof data[0] === 'object') {
      hdr = Object.keys(data[0]);
    }

    const esc = (v) => {
      const s = fmt(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const lines = [];
    if (hdr && hdr.length) lines.push(hdr.map(esc).join(','));
    for (const row of data) {
      if (Array.isArray(row)) {
        lines.push(row.map(esc).join(','));
      } else {
        lines.push(hdr.map(h => esc(row[h])).join(','));
      }
    }

    // BOM لدعم العربية في Excel
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename || 'export.csv');
    return true;
  }

  /**
   * الحصول على كائن ExcelJS المتاح
   */
  function getExcelJS() {
    if (global.ExcelJS) return global.ExcelJS;
    if (global.exceljs) return global.exceljs;
    return null;
  }

  /**
   * تصدير Excel عبر ExcelJS (إن توفر) — وإلا CSV
   * @param {Array<Object>} rows - الصفوف
   * @param {Object} opts - { headers, sheetName, filename, columnWidths }
   * @returns {boolean} نجح
   */
  async function exportExcel(rows, opts = {}) {
    const ExcelJS = getExcelJS();
    const headers = opts.headers || (rows.length && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []);
    const sheetName = opts.sheetName || 'Sheet1';
    const filename = opts.filename || 'export.xlsx';

    if (ExcelJS) {
      try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(sheetName);

        // رأس عريض
        ws.views = [{ rightToLeft: true }];

        // كتابة الرأس
        if (headers.length) {
          const headerRow = ws.addRow(headers);
          headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5394' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          });
        }

        // كتابة البيانات
        for (const row of rows) {
          if (Array.isArray(row)) {
            ws.addRow(row);
          } else {
            ws.addRow(headers.map(h => row[h]));
          }
        }

        // عرض الأعمدة
        if (opts.columnWidths) {
          ws.columns = opts.columnWidths.map((w, i) => ({ width: w }));
        } else if (headers.length) {
          ws.columns = headers.map(() => ({ width: 18 }));
        }

        // صفوف التجميد
        if (headers.length) ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
        notifyExportEvent(filename, rows.length, 'xlsx');
        return true;
      } catch (e) {
        console.warn('[ExcelExporter] ExcelJS failed, falling back to CSV:', e.message);
      }
    }

    exportCSV(rows, headers, filename.replace(/\.xlsx$/i, '.csv'));
    notifyExportEvent(filename, rows.length, 'csv');
    return true;
  }

  // خطاف n8n: إرسال تلقائي بعد أي تصدير (إن كان مفعلاً في الإعدادات)
  function notifyExportEvent(filename, rowCount, format) {
    try {
      if (typeof global.n8nAutoExportEnabled !== 'function') return;
      global.n8nAutoExportEnabled().then(active => {
        if (!active) return;
        if (typeof global.n8nSend === 'function') {
          global.n8nSend('excel_export', {
            filename, rowCount, format,
            page: (typeof global.getPageInfo === 'function' && global.getPageInfo()) || null
          });
        }
      }).catch(() => {});
    } catch (_) { /* auto-export is best effort */ }
  }

  /**
   * تحويل Object إلى مصفوفة صفوف جاهزة
   * @param {Array<Object>} rows - الصفوف
   * @param {string[]|null} headers - الرؤوس
   * @returns {Array<Array<string>>}
   */
  function toMatrix(rows, headers) {
    const hdr = headers || (rows.length && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []);
    const matrix = [hdr];
    for (const row of rows) {
      matrix.push(Array.isArray(row) ? row.map(fmt) : hdr.map(h => fmt(row[h])));
    }
    return matrix;
  }

  // واجهة عامة
  global.exportExcel = exportExcel;
  global.exportCSV = exportCSV;
  global.downloadBlob = downloadBlob;

  global.ExcelExporter = {
    export: exportExcel,
    exportCSV,
    toMatrix,
    getExcelJS
  };

  console.log('[ExcelExporter] ✅ تم تحميل مصدر Excel الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);