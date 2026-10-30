/**
 * Badge Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabyBadge extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'size', 'dot', 'removable', 'icon'];
  }

  #shadow: ShadowRoot;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    this.#render();
  }

  #render() {
    const variant = this.getAttribute('variant') || 'default';
    const size = this.getAttribute('size') || 'md';
    const dot = this.hasAttribute('dot');
    const removable = this.hasAttribute('removable');
    const icon = this.getAttribute('icon') || '';
    const label = this.textContent || this.getAttribute('label') || '';

    this.#shadow.innerHTML = `
      <style>
        :host { display: inline-flex; align-items: center; gap: 4px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 9999px; font-weight: 600; white-space: nowrap; }
        .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .badge-icon { display: inline-flex; flex-shrink: 0; }
        .badge-label { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .badge-remove { width: 16px; height: 16px; border: none; background: transparent; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: inherit; opacity: 0.7; transition: opacity 0.15s; margin-right: -4px; padding: 0; }
        .badge-remove:hover { opacity: 1; background: rgba(0,0,0,0.1); border-radius: 50%; }
        .size-xs { padding: 2px 8px; font-size: 10px; gap: 3px; }
        .size-sm { padding: 3px 10px; font-size: 11px; gap: 4px; }
        .size-md { padding: 4px 12px; font-size: 12px; gap: 5px; }
        .size-lg { padding: 6px 16px; font-size: 13px; gap: 6px; }
        .variant-default { background: var(--ea-badge-default-bg); color: var(--ea-badge-default-text); }
        .variant-primary { background: var(--ea-badge-primary-bg); color: var(--ea-badge-primary-text); }
        .variant-success { background: var(--ea-badge-success-bg); color: var(--ea-badge-success-text); }
        .variant-warning { background: var(--ea-badge-warn-bg); color: var(--ea-badge-warn-text); }
        .variant-danger { background: var(--ea-badge-danger-bg); color: var(--ea-badge-danger-text); }
        .variant-info { background: var(--ea-badge-info-bg); color: var(--ea-badge-info-text); }
      </style>
      <span class="badge variant-${this.getAttribute('variant') || 'default'} size-${this.getAttribute('size') || 'md'}">
        ${this.hasAttribute('dot') ? '<span class="badge-dot"></span>' : ''}
        ${this.getAttribute('icon') ? `<span class="badge-icon">${this.getAttribute('icon')}</span>` : ''}
        <span class="badge-label">${this.textContent || this.getAttribute('label') || ''}</span>
        ${this.hasAttribute('removable') ? '<button class="badge-remove" aria-label="إزالة">×</button>' : ''}
      </span>
    `;

    if (removable) {
      const removeBtn = this.#shadow.querySelector('.badge-remove');
      removeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('el-badge-remove', { bubbles: true, composed: true }));
        this.remove();
      });
    }
  }

  connectedCallback() {
    this.#render();
  }

  // Public API
  setVariant(variant: string) { this.setAttribute('variant', variant); }
  setSize(size: string) { this.setAttribute('size', size); }
}

if (!customElements.get('el-badge')) {
  customElements.define('el-badge', ElArabyBadge);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-badge': ElArabyBadge;
  }
}