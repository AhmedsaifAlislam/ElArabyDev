/**
 * Button Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabyButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'disabled', 'loading', 'size', 'full-width'];
  }

  #shadow: ShadowRoot;
  #button: HTMLButtonElement;
  #spinner: HTMLSpanElement;
  #text: HTMLSpanElement;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#button = this.#shadow.querySelector('button')!;
    this.#spinner = this.#shadow.querySelector('.spinner')!;
    this.#text = this.#shadow.querySelector('.btn-text')!;
    this.#button.addEventListener('click', (e) => this.#onClick(e));
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    switch (name) {
      case 'disabled':
        this.#button.disabled = value !== null;
        break;
      case 'loading':
        this.#setLoading(value !== null);
        break;
      case 'variant':
      case 'size':
      case 'full-width':
        this.#updateStyles();
        break;
    }
  }

  #render() {
    const variant = this.getAttribute('variant') || 'primary';
    const size = this.getAttribute('size') || 'md';
    const fullWidth = this.hasAttribute('full-width');
    const disabled = this.hasAttribute('disabled');
    const loading = this.hasAttribute('loading');
    const label = this.getAttribute('label') || this.textContent || 'Button';

    this.#shadow.innerHTML = `
      <style>
        :host {
          display: inline-flex;
        }
        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 8px;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          text-decoration: none;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .spinner {
          display: none;
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        .btn-text {
          display: inline;
        }
        button.loading .spinner { display: block; }
        button.loading .btn-text { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Variants */
        .variant-primary { background: var(--ea-brand); color: var(--ea-on-brand); }
        .variant-primary:hover:not(:disabled) { background: var(--ea-brand-dark); }
        .variant-secondary { background: var(--ea-neutral); color: var(--ea-on-brand); }
        .variant-secondary:hover:not(:disabled) { background: var(--ea-neutral-2); }
        .variant-success { background: var(--ea-success); color: var(--ea-on-brand); }
        .variant-success:hover:not(:disabled) { background: var(--ea-success-strong); }
        .variant-danger { background: var(--ea-error); color: var(--ea-on-brand); }
        .variant-danger:hover:not(:disabled) { background: var(--ea-error-strong); }
        .variant-outline { background: transparent; border: 2px solid var(--ea-brand); color: var(--ea-brand); }
        .variant-outline:hover:not(:disabled) { background: var(--ea-brand); color: var(--ea-on-brand); }
        .variant-ghost { background: transparent; color: var(--ea-brand); }
        .variant-ghost:hover:not(:disabled) { background: var(--ea-brand-bg); }

        /* Sizes */
        .size-sm { padding: 6px 12px; font-size: 12px; min-height: 32px; }
        .size-md { padding: 10px 20px; font-size: 14px; min-height: 40px; }
        .size-lg { padding: 14px 28px; font-size: 16px; min-height: 48px; }

        /* Full width */
        .full-width { width: 100%; }
      </style>
      <button
        class="variant-${variant} size-${size} ${fullWidth ? 'full-width' : ''} ${loading ? 'loading' : ''}"
        ${disabled ? 'disabled' : ''}
        type="button"
      >
        <span class="spinner" aria-hidden="true"></span>
        <span class="btn-text">${label}</span>
      </button>
    `;
  }

  #setLoading(loading: boolean) {
    this.#button.classList.toggle('loading', loading);
    this.#button.disabled = loading || this.hasAttribute('disabled');
  }

  #updateStyles() {
    const variant = this.getAttribute('variant') || 'primary';
    const size = this.getAttribute('size') || 'md';
    const fullWidth = this.hasAttribute('full-width');

    this.#button.className = `variant-${variant} size-${size} ${fullWidth ? 'full-width' : ''}`;
  }

  #onClick(e: MouseEvent) {
    if (this.hasAttribute('disabled') || this.hasAttribute('loading')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    this.dispatchEvent(new CustomEvent('el-button-click', {
      detail: { originalEvent: e },
      bubbles: true,
      composed: true
    }));
  }

  // Public API
  setLoading(loading: boolean) {
    if (loading) this.setAttribute('loading', '');
    else this.removeAttribute('loading');
  }

  setDisabled(disabled: boolean) {
    if (disabled) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }
}

// Auto-register
if (!customElements.get('el-button')) {
  customElements.define('el-button', ElArabyButton);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-button': ElArabyButton;
  }
}