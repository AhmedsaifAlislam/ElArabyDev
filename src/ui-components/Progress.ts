/**
 * Progress Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabyProgress extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'max', 'label', 'show-percent', 'color', 'size', 'striped', 'animated'];
  }

  #shadow: ShadowRoot;
  #bar: HTMLDivElement;
  #label: HTMLSpanElement | null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#bar = this.#shadow.querySelector('.progress-bar')!;
    this.#label = this.#shadow.querySelector('.progress-label');
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    switch (name) {
      case 'value':
      case 'max':
        this.#updateProgress();
        break;
      case 'label':
        if (this.#label) this.#label.textContent = value || '';
        break;
      case 'color':
      case 'size':
      case 'striped':
      case 'animated':
        this.#updateStyles();
        break;
      case 'show-percent':
        this.#updateProgress();
        break;
    }
  }

  #render() {
    const value = parseFloat(this.getAttribute('value') || '0');
    const max = parseFloat(this.getAttribute('max') || '100');
    const label = this.getAttribute('label') || '';
    const showPercent = this.hasAttribute('show-percent');
    const color = this.getAttribute('color') || 'primary';
    const size = this.getAttribute('size') || 'md';
    const striped = this.hasAttribute('striped');
    const animated = this.hasAttribute('animated');

    const percent = Math.min(100, Math.max(0, (value / max) * 100));

    this.#shadow.innerHTML = `
      <style>
        :host { display: inline-flex; flex-direction: column; gap: 6px; width: 100%; }
        .progress-wrapper { width: 100%; }
        .progress-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .progress-track {
          width: 100%; background: var(--ea-track); border-radius: 9999px; overflow: hidden;
        }
        .progress-bar {
          height: 100%; border-radius: 9999px; transition: width 0.3s ease;
          background: var(--ea-brand);
        }
        .size-xs .progress-track { height: 4px; }
        .size-sm .progress-track { height: 6px; }
        .size-md .progress-track { height: 8px; }
        .size-lg .progress-track { height: 12px; }
        .color-primary .progress-bar { background: var(--ea-brand); }
        .color-success .progress-bar { background: var(--ea-success); }
        .color-warning .progress-bar { background: var(--ea-warn); }
        .color-danger .progress-bar { background: var(--ea-error); }
        .color-info .progress-bar { background: var(--ea-info); }
        .striped .progress-bar { background-image: linear-gradient(45deg, var(--ea-stripe) 25%, transparent 25%, transparent 50%, var(--ea-stripe) 50%, var(--ea-stripe) 75%, transparent 75%, transparent); background-size: 1rem 1rem; }
        .animated .progress-bar { animation: progress-stripe 1s linear infinite; }
        @keyframes progress-stripe { 0% { background-position: 1rem 0; } 100% { background-position: 0 0; } }
      </style>
      <div class="progress-wrapper size-${this.getAttribute('size') || 'md'} ${this.hasAttribute('striped') ? 'striped' : ''} ${this.hasAttribute('animated') ? 'animated' : ''} color-${this.getAttribute('color') || 'primary'}">
        ${this.getAttribute('label') ? `<div class="progress-label"><span>${this.getAttribute('label')}</span><span class="progress-value">${this.#getPercent()}</span></div>` : ''}
        <div class="progress-track">
          <div class="progress-bar" style="width: ${this.#getPercent()}%"></div>
        </div>
      </div>
    `;
  }

  #getPercent(): string {
    const value = parseFloat(this.getAttribute('value') || '0');
    const max = parseFloat(this.getAttribute('max') || '100');
    const percent = Math.min(100, Math.max(0, (value / max) * 100));
    return this.hasAttribute('show-percent') ? `${Math.round(percent)}%` : '';
  }

  #updateProgress() {
    const wrapper = this.#shadow.querySelector('.progress-wrapper');
    const bar = this.#shadow.querySelector('.progress-bar') as HTMLDivElement;
    const label = this.#shadow.querySelector('.progress-value');
    if (bar) bar.style.width = this.#getPercent();
    if (label) label.textContent = this.#getPercent();
  }

  #updateStyles() {
    // Styles are handled via CSS classes on wrapper
  }

  connectedCallback() {
    this.#render();
  }

  // Public API
  setValue(value: number) { this.setAttribute('value', String(value)); }
  setMax(max: number) { this.setAttribute('max', String(max)); }
  setLabel(label: string) { this.setAttribute('label', label); }
}

if (!customElements.get('el-progress')) {
  customElements.define('el-progress', ElArabyProgress);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-progress': ElArabyProgress;
  }
}