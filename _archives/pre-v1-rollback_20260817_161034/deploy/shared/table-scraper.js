/**
 * table-scraper.js — استخراج الجداول الموحد
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts
 * يوفّر:
 *   - واجهة عامة: scrapeTable, scrapeTableInFrames, extractHeaders, extractRows, detectTable
 *   - TableScraper (findTable, scrap, toJSON, toCSV) — واجهة OOP
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyTableScraperLoaded) return;
  global.__elarabyTableScraperLoaded = true;

  /**
   * محددات الجداول الموحدة — من portal-selectors مع fallback محلي
   */
  function getTableSelectors() {
    const shared = global.PORTAL_SELECTORS?.POWERAPPS?.table;
    const base = shared ? [shared.entityGrid, shared.tableStriped, shared.tableClass].filter(Boolean) : [];
    return [...base,
      'table.entity-grid',
      'table[class*="entitylist"]',
      'table[class*="grid"]',
      'table[role="grid"]',
      '.grid-content table',
      '.entitylist table',
      '#grid_openorders',
      '.view-grid table',
      'table'
    ].filter(Boolean);
  }

  /**
   * إيجاد أول جدول له صفوف في مستند
   * @param {Document} doc - المستند
   * @param {string[]} selectors - محددات مخصصة (اختياري)
   * @returns {HTMLTableElement|null}
   */
  function detectTable(doc = document, selectors) {
    const sels = selectors || getTableSelectors();
    for (const sel of sels) {
      try {
        const t = doc.querySelector(sel);
        if (t && t.rows && t.rows.length > 0) return t;
      } catch (_) {}
    }
    const allTables = doc.querySelectorAll('table');
    for (const t of allTables) {
      if (t.rows && t.rows.length > 1 && t.offsetParent !== null) return t;
    }
    return null;
  }

  /**
   * استخراج رؤوس الجدول
   * @param {HTMLTableElement} table - الجدول
   * @returns {string[]}
   */
  function extractHeaders(table) {
    const headRow = table.querySelector('thead tr, tr:first-child');
    if (!headRow) return [];
    return [...headRow.querySelectorAll('th, td')].map(c => (c.innerText || '').trim());
  }

  /**
   * استخراج صفوف البيانات
   * @param {HTMLTableElement} table - الجدول
   * @param {number} headerOffset - عدد صفوف الرأس (افتراضي 1)
   * @returns {Array<Object>} صفوف ككائنات بمفاتيح الرؤوس
   */
  function extractRows(table, headerOffset = 1) {
    const headers = extractHeaders(table);
    const rowsEls = table.querySelectorAll('tbody tr');
    const rows = [];

    const srcRows = rowsEls.length ? rowsEls : [...table.querySelectorAll('tr')].slice(headerOffset);
    srcRows.forEach(rowEl => {
      const cells = [...rowEl.querySelectorAll('td')];
      if (cells.length < 2) return;
      const obj = {};
      cells.forEach((cell, i) => {
        const key = headers[i] && headers[i].length ? headers[i] : `col_${i + 1}`;
        obj[key] = (cell.innerText || '').trim();
      });
      rows.push(obj);
    });
    return rows;
  }

  /**
   * استخراج جدول في مستند — مع إمكانية البحث عبر الإطارات
   * @param {Document} doc - المستند (اختياري)
   * @param {Object} opts - { includeFrames: boolean, selectors: string[] }
   * @returns {Object|null} { table, doc, headers, rows }
   */
  function scrapeTable(doc = document, opts = {}) {
    const { includeFrames = true, selectors } = opts || {};

    const tryDoc = (d) => {
      const table = detectTable(d, selectors);
      if (!table) return null;
      const headers = extractHeaders(table);
      const rows = extractRows(table);
      return { table, doc: d, headers, rows, rowCount: rows.length };
    };

    let result = tryDoc(doc);
    if (result || !includeFrames) return result;

    // البحث في الإطارات
    const iframes = doc.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iDoc) continue;
        result = scrapeTable(iDoc, { includeFrames: true, selectors });
        if (result) return result;
      } catch (_) {}
    }
    return null;
  }

  /**
   * استخراج عبر كل الإطارات دفعة واحدة (كل الجداول المطابقة)
   * @param {Document} doc - المستند (اختياري)
   * @param {Object} opts
   * @returns {Array<Object>} قائمة نتائج
   */
  function scrapeTableInFrames(doc = document, opts = {}) {
    const results = [];
    const { selectors } = opts || {};

    const walk = (current) => {
      const sels = selectors || getTableSelectors();
      for (const sel of sels) {
        const tables = current.querySelectorAll(sel);
        for (const t of tables) {
          if (!t.rows || t.rows.length < 2) continue;
          results.push({
            table: t,
            doc: current,
            headers: extractHeaders(t),
            rows: extractRows(t),
            rowCount: t.rows.length
          });
        }
      }
      const iframes = current.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iDoc) walk(iDoc);
        } catch (_) {}
      }
    };

    walk(doc);
    return results;
  }

  /**
   * تحويل النتائج إلى CSV
   * @param {string[]} headers - الرؤوس
   * @param {Array<Object>} rows - الصفوف
   * @returns {string}
   */
  function toCSV(headers, rows) {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => esc(row[h])).join(','));
    }
    return lines.join('\n');
  }

  // واجهة عامة
  global.scrapeTable = scrapeTable;
  global.scrapeTableInFrames = scrapeTableInFrames;
  global.detectTable = detectTable;
  global.extractHeaders = extractHeaders;
  global.extractRows = extractRows;

  global.TableScraper = {
    findTable: detectTable,
    scrap: scrapeTable,
    scrapAll: scrapeTableInFrames,
    toJSON: (table) => {
      const headers = extractHeaders(table);
      return { headers, rows: extractRows(table) };
    },
    toCSV,
    extractHeaders,
    extractRows
  };

  console.log('[TableScraper] ✅ تم تحميل استخراج الجداول الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);