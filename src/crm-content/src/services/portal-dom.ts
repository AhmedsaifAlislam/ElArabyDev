/**
 * CRM Portal DOM Service — Selectors and DOM interaction for CRM Portal
 * Uses PORTAL_CONFIG.PORTAL.crm for configuration
 */

import { PORTAL_CONFIG } from '../../../portal-config/portal-config';

export interface CRMTableRow {
  crm: string;
  status: string;
  report: string;
  rowIndex: number;
}

export interface CRMTableData {
  rows: CRMTableRow[];
  columns: { crmCol: number; reportCol: number; statusCol: number; headers: string[] };
  hasNextPage: boolean;
  nextPageLink: HTMLAnchorElement | null;
}

export class CRMPortalDOM {
  private static readonly SELECTORS = {
    // CRM Portal SelectReport.aspx
    textbox: '#ContentPlaceHolder1_TextBox1',
    dropdown: '#ContentPlaceHolder1_DropDownList2',
    searchBtn: '#ContentPlaceHolder1_Button1',
    grid: '#ContentPlaceHolder1_GridView1',
    // Pagination
    pager: 'tr.pager, .pager, .grid-pager',
    nextPage: 'a:contains("التالي"), a:contains("Next"), a[href*="Page$"]',
  } as const;

  /**
   * Check if we're on the correct CRM page
   */
  static isOnSelectReportPage(): boolean {
    return window.location.href.includes('SelectReport.aspx');
  }

  /**
   * Get DOM elements for the search form
   */
  static getSearchElements() {
    const textbox = document.querySelector<HTMLInputElement>(this.SELECTORS.textbox);
    const dropdown = document.querySelector<HTMLSelectElement>(this.SELECTORS.dropdown);
    const searchBtn = document.querySelector<HTMLButtonElement | HTMLInputElement>(this.SELECTORS.searchBtn);
    const grid = document.querySelector<HTMLTableElement>(this.SELECTORS.grid);

    return { textbox, dropdown, searchBtn, grid };
  }

  /**
   * Set CRM numbers in the textbox and trigger search
   */
  static async searchCRMNumbers(crmNumbers: string[]): Promise<void> {
    const { textbox, dropdown, searchBtn } = this.getSearchElements();
    if (!textbox || !searchBtn) throw new Error('Search elements not found');

    // Set dropdown to CRM if not already
    const dd = document.querySelector<HTMLSelectElement>(this.SELECTORS.dropdown);
    if (dd && dd.value !== 'CRM') {
      dd.value = 'CRM';
      dd.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    // Set textbox value
    textbox.value = crmNumbers.join('\n');
    textbox.dispatchEvent(new Event('input', { bubbles: true }));
    textbox.dispatchEvent(new Event('change', { bubbles: true }));

    // Click search
    searchBtn.click();
  }

  /**
   * Extract table data from the grid
   */
  static extractTableData(): CRMTableData | null {
    const grid = document.querySelector<HTMLTableElement>(this.SELECTORS.grid);
    if (!grid) return null;

    const cols = this.#detectColumns(grid);
    if (cols.crmCol < 0) return null;

    const rows: CRMTableRow[] = [];
    const dataRows = grid.querySelectorAll('tbody tr, tr:not(:first-child)');

    dataRows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;

      // Find CRM in any cell (fallback to detected column)
      let crm = '';
      for (let i = 0; i < cells.length; i++) {
        const val = cells[i].textContent?.trim() || '';
        if (/^CAS\d/i.test(val) || /^CRM\d/i.test(val)) {
          crm = val;
          break;
        }
      }
      if (!crm && cells[cols.crmCol]) {
        crm = cells[cols.crmCol].textContent?.trim() || '';
      }

      const status = cols.statusCol >= 0 && cells[cols.statusCol]
        ? cells[cols.statusCol].textContent?.trim() || ''
        : '';
      const report = cols.reportCol >= 0 && cells[cols.reportCol]
        ? cells[cols.reportCol].textContent?.trim() || ''
        : '';

      if (crm) rows.push({ crm, status, report, rowIndex });
    });

    // Pagination detection
    const { hasNextPage, nextPageLink } = this.#detectNextPage(grid);

    return { rows, columns: cols, hasNextPage, nextPageLink };
  }

  static #detectColumns(grid: HTMLTableElement) {
    const headerRow = grid.querySelector('thead tr, tr:first-child');
    if (!headerRow) return { crmCol: 0, reportCol: -1, statusCol: -1, headers: [] };

    const ths = headerRow.querySelectorAll('th, td');
    const cols = { crmCol: 0, reportCol: -1, statusCol: -1, headers: [] as string[] };

    ths.forEach((th, i) => {
      const text = th.textContent?.trim() || '';
      cols.headers.push(text);
      if (/^(بلاغ|رقم البلاغ|CAS|CRM)/i.test(text)) cols.crmCol = i;
      if (text.indexOf('تقرير') >= 0) cols.reportCol = i;
      if (text.indexOf('حالة المركز') >= 0) cols.statusCol = i;
    });

    return cols;
  }

  static #detectNextPage(grid: HTMLTableElement): { hasNextPage: boolean; nextPageLink: HTMLAnchorElement | null } {
    const lastRow = grid.querySelector('tr:last-child');
    if (!lastRow) return { hasNextPage: false, nextPageLink: null };

    const cell = lastRow.querySelector('td[colspan]');
    if (!cell) return { hasNextPage: false, nextPageLink: null };

    const span = cell.querySelector('span');
    if (!span) return { hasNextPage: false, nextPageLink: null };

    const cur = parseInt(span.textContent || '');
    if (isNaN(cur)) return { hasNextPage: false, nextPageLink: null };

    const links = cell.querySelectorAll('a');
    for (const link of links) {
      const linkText = parseInt(link.textContent || '');
      if (linkText === cur + 1) {
        return { hasNextPage: true, nextPageLink: link as HTMLAnchorElement };
      }
    }
    return { hasNextPage: false, nextPageLink: null };
  }

  /**
   * Click next page link
   */
  static async clickNextPage(): Promise<boolean> {
    const data = this.extractTableData();
    if (!data?.hasNextPage || !data.nextPageLink) return false;

    data.nextPageLink.click();
    await new Promise(r => setTimeout(r, 1500)); // Wait for page load
    return true;
  }

  /**
   * Wait for table to appear after search
   */
  static async waitForTable(timeout = 10000): Promise<HTMLTableElement | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const grid = document.querySelector<HTMLTableElement>(this.SELECTORS.grid);
      if (grid && grid.querySelectorAll('tr').length > 1) return grid;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  /**
   * Get CRM account info from window.crmAccount
   */
  static getCRMAccount() {
    return (window as any).crmAccount || null;
  }
}