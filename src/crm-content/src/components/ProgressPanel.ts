/**
 * ProgressPanel Component — Shows extraction progress with live feed
 */

import { ElArabyProgress } from '../../../ui-components/Progress';
import { ElArabyBadge } from '../../../ui-components/Badge';

export interface ProgressPanelState {
  total: number;
  done: number;
  pct: number;
  currentBatch: number;
  totalBatches: number;
  latestExtracts: Array<{ crm: string; count: number; first: string }>;
}

export class CRMProgressPanel extends HTMLElement {
  #shadow: ShadowRoot;
  #progressEl: any;
  #pctEl: HTMLElement;
  #infoEl: HTMLElement;
  #liveFeedEl: HTMLElement;
  #summaryEl: HTMLElement;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#progressEl = this.#shadow.querySelector('el-progress');
    this.#pctEl = this.#shadow.getElementById('pct')!;
    this.#infoEl = this.#shadow.getElementById('info')!;
    this.#liveFeedEl = this.#shadow.getElementById('liveFeed')!;
    this.#summaryEl = this.#shadow.getElementById('summary')!;
  }

  #render() {
    this.#shadow.innerHTML = `
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .panel { background: var(--ea-surface); border: 1px solid var(--ea-border); border-radius: 12px; overflow: hidden; }
        .section { padding: 16px; border-bottom: 1px solid var(--ea-border); }
        .section:last-child { border-bottom: none; }
        .section-title { font-size: 13px; font-weight: 700; color: var(--ea-text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .running-dot { width: 8px; height: 8px; background: var(--ea-success); border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .progress-wrap { margin-top: 8px; }
        .progress-info { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; }
        .live-feed { max-height: 200px; overflow-y: auto; }
        .live-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px; margin-bottom: 4px; }
        .live-item.ok { background: var(--ea-badge-success-bg); color: var(--ea-badge-success-text); }
        .live-item.empty { background: var(--ea-badge-danger-bg); color: var(--ea-badge-danger-text); }
        .live-crm { font-family: monospace; font-size: 11px; font-weight: 600; }
        .live-badge { font-size: 11px; padding: 2px 6px; border-radius: 9999px; }
        .summary { display: flex; gap: 16px; }
        .summary-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .summary-label { font-size: 11px; color: var(--ea-muted); }
        .summary-value { font-size: 18px; font-weight: 700; color: var(--ea-text); }
        .summary-value.success { color: var(--ea-success); }
        .summary-value.danger { color: var(--ea-error); }
      </style>
      <div class="panel">
        <div class="section">
          <div class="section-title"><span class="running-dot"></span> جاري البحث...</div>
          <div class="progress-wrap">
            <div class="progress-info">
              <span id="info">0 / 0 بلاغ</span>
              <span>دفعة <span id="currentBatch">1</span> من <span id="totalBatches">1</span></span>
            </div>
            <el-progress id="progress" value="0" max="100" label="التقدم" show-percent size="md" color="primary" striped animated></el-progress>
          </div>
        </div>
        <div class="section">
          <div class="section-title">📡 آخر المستخرجات</div>
          <div class="live-feed" id="liveFeed">لا توجد مستخرجات بعد</div>
        </div>
        <div class="section">
          <div class="section-title">📊 ملخص</div>
          <div class="summary" id="summary">
            <div class="summary-item"><span class="summary-label">تم البحث</span><span class="summary-value" id="sumDone">0</span></div>
            <div class="summary-item"><span class="summary-label">بها تقارير</span><span class="summary-value success" id="sumFound">0</span></div>
            <div class="summary-item"><span class="summary-label">بدون تقارير</span><span class="summary-value danger" id="sumEmpty">0</span></div>
          </div>
        </div>
      </div>
    `;

    this.#pctEl = this.#shadow.getElementById('pct')!;
    this.#infoEl = this.#shadow.getElementById('info')!;
    this.#liveFeedEl = this.#shadow.getElementById('liveFeed')!;
    this.#summaryEl = this.#shadow.getElementById('summary')!;
  }

  setState(state: any) {
    // Progress
    const progressEl = this.#shadow.querySelector('el-progress') as any;
    if (progressEl) {
      progressEl.setAttribute('value', String(state.pct));
    }
    this.#infoEl.textContent = `${state.done} / ${state.total} بلاغ`;
    (this.#shadow.getElementById('currentBatch') as HTMLElement).textContent = String(state.currentBatch);
    (this.#shadow.getElementById('totalBatches') as HTMLElement).textContent = String(state.totalBatches);

    // Live feed
    if (state.latestExtracts && state.latestExtracts.length > 0) {
      this.#liveFeedEl.innerHTML = state.latestExtracts
        .slice()
        .reverse()
        .map((ex: any) => `
          <div class="live-item ${ex.count > 0 ? 'ok' : 'empty'}">
            <span class="live-crm">${ex.crm.substring(0, 20)}</span>
            <span class="live-badge ${ex.count > 0 ? 'variant-success' : 'variant-danger'}">
              ${ex.count > 0 ? '✅ ' + ex.count : '❌'}
            </span>
          </div>
        `).join('');
    } else {
      this.#liveFeedEl.innerHTML = 'لا توجد مستخرجات بعد';
    }

    // Summary
    if (state.summary) {
      (this.#shadow.getElementById('sumDone') as HTMLElement).textContent = String(state.summary.done || state.done);
      (this.#shadow.getElementById('sumFound') as HTMLElement).textContent = String(state.summary.found || state.found);
      (this.#shadow.getElementById('sumEmpty') as HTMLElement).textContent = String(state.summary.empty || state.empty);
    }
  }
}

if (!customElements.get('crm-progress-panel')) {
  customElements.define('crm-progress-panel', CRMProgressPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    'crm-progress-panel': CRMProgressPanel;
  }
}