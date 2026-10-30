/**
 * Table Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 * Features: sorting, pagination, row selection, custom renderers
 */

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: any, index: number) => string | HTMLElement;
}

export interface TableConfig {
  columns: TableColumn[];
  data: any[];
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  selectable?: boolean;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
}

export class ElArabyTable extends HTMLElement {
  static get observedAttributes() {
    return ['config'];
  }

  #shadow: ShadowRoot;
  #config: TableConfig = { columns: [], data: [], pagination: true, pageSize: 10 };
  #currentPage = 1;
  #sortColumn: string | null = null;
  #sortDirection: 'asc' | 'desc' = 'asc';
  #selectedRows = new Set<number>();

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === 'config') {
      try {
        this.#config = JSON.parse(value);
        this.#currentPage = 1;
        this.#render();
      } catch (e) {
        console.error('[el-table] Invalid config JSON:', e);
      }
    }
  }

  #render() {
    const { columns, data, pagination, pageSize = 10, selectable, emptyMessage = 'لا توجد بيانات', striped = true, hoverable = true } = this.#config;
    const totalPages = pagination ? Math.ceil(data.length / pageSize) : 1;
    const start = pagination ? (this.#currentPage - 1) * pageSize : 0;
    const end = pagination ? start + pageSize : data.length;
    const pageData = data.slice(start, end);

    const hasSelection = selectable && this.#selectedRows.size > 0;

    this.#shadow.innerHTML = `
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .table-container { overflow-x: auto; border: 1px solid var(--ea-border); border-radius: 8px; background: var(--ea-surface); }
        table { width: 100%; border-collapse: collapse; font-family: inherit; font-size: 13px; direction: rtl; }
        thead { background: var(--ea-faint); }
        th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--ea-border); white-space: nowrap; }
        th { font-weight: 700; color: var(--ea-text); cursor: pointer; user-select: none; position: sticky; top: 0; background: var(--ea-faint); z-index: 1; }
        th.sortable:hover { background: var(--ea-faint-2); }
        th .sort-icon { display: inline-flex; margin-right: 6px; width: 14px; height: 14px; }
        tr:hover td { background: var(--ea-faint); }
        tbody tr.selected { background: var(--ea-row-selected) !important; }
        td { color: var(--ea-text); }
        .cell-center { text-align: center; }
        .cell-left { text-align: left; }
        .cell-right { text-align: right; }
        .empty-row td { text-align: center; padding: 40px 20px; color: var(--ea-icon-fill); font-size: 14px; }
        .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-top: 1px solid var(--ea-border); background: var(--ea-faint); }
        .page-btn { padding: 6px 12px; border: 1px solid var(--ea-border); border-radius: 6px; background: var(--ea-surface); color: var(--ea-text); cursor: pointer; font-size: 13px; transition: all 0.15s; }
        .page-btn:hover:not(:disabled) { background: var(--ea-brand); color: var(--ea-on-brand); border-color: var(--ea-brand); }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-btn.active { background: var(--ea-brand); color: var(--ea-on-brand); border-color: var(--ea-brand); }
        .page-info { font-size: 13px; color: var(--ea-muted); }
        .select-all { width: 16px; height: 16px; cursor: pointer; }
        .sort-icon { transition: transform 0.15s; }
        .sort-icon.asc { transform: rotate(180deg); }
      </style>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              ${selectable ? '<th style="width:40px"><input type="checkbox" class="select-all" id="select-all"></th>' : ''}
              ${columns.map((col, i) => `
                <th class="${col.sortable !== false ? 'sortable' : ''}" data-key="${col.key}" style="${col.width ? `width:${col.width};` : ''}">
                  ${col.label}
                  ${col.sortable !== false ? '<span class="sort-icon" data-key="${col.key}">▼</span>' : ''}
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${pageData.length === 0 ? `
              <tr class="empty-row"><td colspan="${columns.length + (selectable ? 1 : 0)}">${emptyMessage}</td></tr>
            ` : pageData.map((row, idx) => {
              const globalIndex = start + idx;
              const isSelected = this.#selectedRows.has(globalIndex);
              return `
                <tr data-index="${globalIndex}" class="${isSelected ? 'selected' : ''} ${striped && idx % 2 === 1 ? 'striped' : ''}">
                  ${selectable ? `<td><input type="checkbox" class="row-checkbox" value="${globalIndex}" ${isSelected ? 'checked' : ''}></td>` : ''}
                  ${columns.map(col => {
                    const value = row[col.key];
                    const alignClass = col.align === 'left' ? 'cell-left' : col.align === 'center' ? 'cell-center' : 'cell-right';
                    let displayValue = value;
                    if (col.render) {
                      const rendered = col.render(value, row, globalIndex);
                      if (rendered instanceof HTMLElement) {
                        // Can't render HTMLElement in string template, use placeholder
                        displayValue = `[rendered]`;
                      } else {
                        displayValue = rendered;
                      }
                    } else if (value === null || value === undefined) {
                      displayValue = '—';
                    }
                    return `<td class="${alignClass}" data-key="${col.key}">${displayValue}</td>`;
                  }).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${pagination && totalPages > 1 ? `
          <div class="pagination">
            <button class="page-btn" data-page="prev" ${this.#currentPage === 1 ? 'disabled' : ''}>السابق</button>
            <span class="page-info">صفحة ${this.#currentPage} من ${totalPages}</span>
            <button class="page-btn" data-page="next" ${this.#currentPage === totalPages ? 'disabled' : ''}>التالي</button>
          </div>
        ` : ''}
      </div>
    `;

    this.#bindEvents();
  }

  #bindEvents() {
    // Sort
    this.#shadow.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', (e) => {
        const key = th.getAttribute('data-key')!;
        if (this.#sortColumn === key) {
          this.#sortDirection = this.#sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.#sortColumn = key;
          this.#sortDirection = 'asc';
        }
        this.#sortData();
        this.#render();
      });
    });

    // Select all
    const selectAll = this.#shadow.querySelector('#select-all') as HTMLInputElement;
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.#shadow.querySelectorAll('.row-checkbox').forEach(cb => {
          (cb as HTMLInputElement).checked = checked;
          const idx = parseInt((cb as HTMLInputElement).value);
          if (checked) this.#selectedRows.add(idx); else this.#selectedRows.delete(idx);
        });
        this.#fireSelectionChange();
      });
    }

    // Row checkboxes
    this.#shadow.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).value);
        if ((e.target as HTMLInputElement).checked) this.#selectedRows.add(idx); else this.#selectedRows.delete(idx);
        this.#fireSelectionChange();
      });
    });

    // Pagination
    this.#shadow.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-page');
        if (page === 'prev' && this.#currentPage > 1) this.#currentPage--;
        else if (page === 'next') this.#currentPage++;
        this.#render();
      });
    });

    // Row click (for non-selectable or as additional action)
    if (!this.#config.selectable) {
      this.#shadow.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('click', () => {
          const idx = parseInt(tr.getAttribute('data-index')!);
          this.dispatchEvent(new CustomEvent('el-row-click', {
            detail: { index: idx, data: this.#config.data[idx] },
            bubbles: true,
            composed: true
          }));
        });
      });
    }
  }

  #sortData() {
    if (!this.#sortColumn) return;
    const col = this.#config.columns.find(c => c.key === this.#sortColumn);
    if (!col || col.sortable === false) return;

    this.#config.data.sort((a, b) => {
      const av = a[this.#sortColumn!];
      const bv = b[this.#sortColumn!];
      if (av < bv) return this.#sortDirection === 'asc' ? -1 : 1;
      if (av > bv) return this.#sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  #fireSelectionChange() {
    const selectedData = Array.from(this.#selectedRows).map(i => this.#config.data[i]);
    this.dispatchEvent(new CustomEvent('el-selection-change', {
      detail: { indices: Array.from(this.#selectedRows), data: selectedData },
      bubbles: true,
      composed: true
    }));
  }

  // Public API
  setData(data: any[]) { this.#config.data = data; this.#currentPage = 1; this.#selectedRows.clear(); this.#render(); }
  setConfig(config: Partial<TableConfig>) { this.#config = { ...this.#config, ...config }; this.#currentPage = 1; this.#selectedRows.clear(); this.#render(); }
  getSelectedData() { return Array.from(this.#selectedRows).map(i => this.#config.data[i]); }
  getSelectedIndices() { return Array.from(this.#selectedRows); }
  clearSelection() { this.#selectedRows.clear(); this.#render(); }
  setPage(page: number) { this.#currentPage = page; this.#render(); }
}

if (!customElements.get('el-table')) {
  customElements.define('el-table', ElArabyTable);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-table': ElArabyTable;
  }
}