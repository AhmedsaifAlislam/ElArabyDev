/**
 * ResultsTable Component — Sortable, filterable table for CRM results
 */

import { ElArabyTable } from '../../../ui-components/Table';
import { ElArabyButton } from '../../../ui-components/Button';
import { ElArabyBadge } from '../../../ui-components/Badge';
import { ElArabyInput } from '../../../ui-components/Input';

export interface CRMResultRow {
  sap: string;
  reports: string[];
  status: 'found' | 'empty' | 'error';
  extractedAt: string;
  error?: string;
}

export class CRMResultsTable extends HTMLElement {
  #shadow: ShadowRoot;
  #tableEl: any;
  #filterInput: HTMLInputElement;
  #statusFilter: HTMLSelectElement;
  #exportBtn: any;
  #data: CRMResultRow[] = [];

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#tableEl = this.#shadow.querySelector('el-table');
    this.#filterInput = this.#shadow.getElementById('filterInput') as HTMLInputElement;
    this.#statusFilter = this.#shadow.getElementById('statusFilter') as HTMLSelectElement;
    this.#exportBtn = this.#shadow.getElementById('exportBtn');
    this.#bindEvents();
  }

  #render() {
    this.#shadow.innerHTML = `
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toolbar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
        .toolbar-group { display: flex; gap: 8px; align-items: center; }
        .filter-wrapper { position: relative; flex: 1; min-width: 200px; max-width: 400px; }
        .filter-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--ea-icon-fill); pointer-events: none; }
        .table-container { border: 1px solid var(--ea-border); border-radius: 8px; overflow: hidden; background: var(--ea-surface); }
        .empty-state { text-align: center; padding: 40px 20px; color: var(--ea-icon-fill); }
        .export-btn { background: var(--ea-brand); color: var(--ea-on-brand); }
      </style>
      <div class="toolbar">
        <div class="toolbar-group filter-wrapper">
          <svg class="filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 3 6 3 2 9 2 15 6 21 22 21 18 15 12 9 14 3"/></svg>
          <el-input id="filterInput" placeholder="🔍 بحث باسم البلاغ أو SAP..." full-width size="sm"></el-input>
        </div>
        <el-select id="statusFilter" placeholder="كل الحالات" size="sm">
          <option value="">كل الحالات</option>
          <option value="found">✅ بها تقارير</option>
          <option value="empty">❌ بدون تقارير</option>
          <option value="error">⚠️ خطأ</option>
        </el-select>
        <el-button id="exportBtn" variant="primary" size="sm" label="💾 تصدير Excel"></el-button>
      </div>
      <div class="table-container">
        <el-table id="resultsTable"></el-table>
      </div>
    `;

    this.#tableEl = this.#shadow.querySelector('el-table');
    this.#filterInput = this.#shadow.getElementById('filterInput') as HTMLInputElement;
    this.#statusFilter = this.#shadow.getElementById('statusFilter') as HTMLSelectElement;
    this.#exportBtn = this.#shadow.getElementById('exportBtn');
  }

  #bindEvents() {
    this.#filterInput.addEventListener('el-input', () => this.#filter());
    this.#statusFilter.addEventListener('el-change', () => this.#filter());
    this.#exportBtn.addEventListener('el-button-click', () => this.#export());
  }

  setData(data: CRMResultRow[]) {
    this.#data = data;
    this.#renderTable();
  }

  #renderTable() {
    const columns = [
      { key: 'sap', label: 'رقم البلاغ', sortable: true, width: '180px' },
      { key: 'status', label: 'الحالة', sortable: true, width: '120px', render: this.#renderStatus },
      { key: 'reports', label: 'التقارير', sortable: false, width: '250px', render: this.#renderReports },
      { key: 'extractedAt', label: 'وقت الاستخراج', sortable: true, width: '180px' },
    ];

    this.#tableEl.setAttribute('config', JSON.stringify({
      columns,
      data: this.#data,
      sortable: true,
      pagination: true,
      pageSize: 20,
      striped: true,
      hoverable: true,
      emptyMessage: 'لا توجد نتائج'
    }));
  }

  #renderStatus = (value: string, row: CRMResultRow) => {
    const badges: Record<string, { variant: string; label: string }> = {
      found: { variant: 'success', label: '✅ بها تقارير' },
      empty: { variant: 'warning', label: '❌ بدون تقارير' },
      error: { variant: 'danger', label: '⚠️ خطأ' },
    };
    const b = badges[row.status] || { variant: 'default', label: row.status };
    return `<el-badge variant="${b.variant}" size="sm" label="${b.label}"></el-badge>`;
  };

  #renderReports = (value: string[], row: CRMResultRow) => {
    if (!row.reports || row.reports.length === 0) return '<span style="color:var(--ea-icon-fill)">—</span>';
    return row.reports.slice(0, 3).map(r => `<el-badge variant="info" size="xs" label="${r}"></el-badge>`).join(' ') +
      (row.reports.length > 3 ? `<el-badge variant="default" size="xs" label="+${row.reports.length - 3} أخرى"></el-badge>` : '');
  };

  #filter() {
    const search = this.#filterInput.value.toLowerCase().trim();
    const status = this.#statusFilter.value;

    const filtered = this.#data.filter(row => {
      if (search && !row.sap.toLowerCase().includes(search) && !JSON.stringify(row.reports).toLowerCase().includes(search)) return false;
      if (status && row.status !== status) return false;
      return true;
    });

    this.#tableEl.setAttribute('config', JSON.stringify({
      columns: [
        { key: 'sap', label: 'رقم البلاغ', sortable: true, width: '180px' },
        { key: 'status', label: 'الحالة', sortable: true, width: '120px', render: this.#renderStatus },
        { key: 'reports', label: 'التقارير', sortable: false, width: '250px', render: this.#renderReports },
        { key: 'extractedAt', label: 'وقت الاستخراج', sortable: true, width: '180px' },
      ],
      data: filtered,
      sortable: true,
      pagination: true,
      pageSize: 20,
      striped: true,
      hoverable: true,
      emptyMessage: 'لا توجد نتائج مطابقة'
    }));
  }

  #export() {
    // Dispatch export event for parent to handle
    this.dispatchEvent(new CustomEvent('crm-export', {
      detail: { data: this.#data },
      bubbles: true,
      composed: true
    }));
  }

  clear() {
    this.#data = [];
    this.#renderTable();
  }
}

if (!customElements.get('crm-results-table')) {
  customElements.define('crm-results-table', CRMResultsTable);
}

declare global {
  interface HTMLElementTagNameMap {
    'crm-results-table': CRMResultsTable;
  }
}