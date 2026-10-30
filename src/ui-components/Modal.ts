/**
 * Modal Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabyModal extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'title', 'size', 'closable'];
  }

  #shadow: ShadowRoot;
  #overlay: HTMLDivElement;
  #container: HTMLDivElement;
  #closeBtn: HTMLButtonElement;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#overlay = this.#shadow.querySelector('.modal-overlay')!;
    this.#container = this.#shadow.querySelector('.modal-container')!;
    this.#closeBtn = this.#shadow.querySelector('.modal-close')!;
    this.#bindEvents();
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === 'open') {
      this.#toggle(value !== null);
    } else if (name === 'title') {
      const titleEl = this.#shadow.querySelector('.modal-title');
      if (titleEl) titleEl.textContent = value || '';
    } else if (name === 'size') {
      this.#container.className = `modal-container size-${value}`;
    } else if (name === 'closable') {
      this.#closeBtn.style.display = value === null ? 'none' : 'flex';
    }
  }

  #render() {
    const title = this.getAttribute('title') || '';
    const size = this.getAttribute('size') || 'md';
    const closable = !this.hasAttribute('closable');
    const open = this.hasAttribute('open');

    this.#shadow.innerHTML = `
      <style>
        :host { display: contents; }
        .modal-overlay {
          position: fixed; inset: 0; background: var(--ea-modal);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; opacity: 0; visibility: hidden; transition: all 0.2s ease;
          padding: 20px; direction: rtl;
        }
        .modal-overlay.open { opacity: 1; visibility: visible; }
        .modal-container {
          background: var(--ea-surface); border-radius: 16px; box-shadow: var(--ea-shadow-2);
          max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
          transform: scale(0.95); transition: transform 0.2s ease;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        }
        .modal-overlay.open .modal-container { transform: scale(1); }
        .size-sm { width: 100%; max-width: 400px; }
        .size-md { width: 100%; max-width: 560px; }
        .size-lg { width: 100%; max-width: 800px; }
        .size-xl { width: 100%; max-width: 1000px; }
        .size-full { width: 100%; max-width: 100%; height: 100%; max-height: 100vh; }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid var(--ea-border);
        }
        .modal-title { font-size: 16px; font-weight: 700; color: var(--ea-text); margin: 0; }
        .modal-close {
          width: 32px; height: 32px; border: none; background: transparent;
          border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: var(--ea-muted); transition: all 0.15s;
        }
        .modal-close:hover { background: var(--ea-faint-2); color: var(--ea-text); }
        .modal-body { padding: 20px; overflow-y: auto; flex: 1; }
        .modal-footer {
          display: flex; justify-content: flex-end; gap: 10px;
          padding: 16px 20px; border-top: 1px solid var(--ea-border);
          background: var(--ea-faint); border-radius: 0 0 16px 16px;
        }
        @media (max-width: 480px) {
          .modal-container { border-radius: 16px 16px 0 0; max-height: 100%; }
          .modal-overlay { align-items: flex-end; padding: 0; }
        }
      </style>
      <div class="modal-overlay ${this.hasAttribute('open') ? 'open' : ''}">
        <div class="modal-container size-${this.getAttribute('size') || 'md'}">
          <div class="modal-header">
            <h3 class="modal-title">${this.getAttribute('title') || ''}</h3>
            <button class="modal-close" aria-label="إغلاق" style="${this.hasAttribute('closable') ? 'display:none' : ''}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body"><slot></slot></div>
          <div class="modal-footer"><slot name="footer"></slot></div>
        </div>
      </div>
    `;

    this.#overlay = this.#shadow.querySelector('.modal-overlay')!;
    this.#container = this.#shadow.querySelector('.modal-container')!;
    this.#closeBtn = this.#shadow.querySelector('.modal-close')!;
    this.#bindEvents();
  }

  #bindEvents() {
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) this.close();
    });
    this.#closeBtn.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
    });
  }

  #toggle(open: boolean) {
    if (open) {
      this.setAttribute('open', '');
      requestAnimationFrame(() => this.#overlay.classList.add('open'));
      this.dispatchEvent(new CustomEvent('el-modal-open', { bubbles: true, composed: true }));
    } else {
      this.#overlay.classList.remove('open');
      setTimeout(() => this.removeAttribute('open'), 200);
      this.dispatchEvent(new CustomEvent('el-modal-close', { bubbles: true, composed: true }));
    }
  }

  // Public API
  open() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); }
  toggle() { this.hasAttribute('open') ? this.close() : this.open(); }

  connectedCallback() {
    if (!this.#shadow.querySelector('.modal-overlay')) this.#render();
  }
}

if (!customElements.get('el-modal')) {
  customElements.define('el-modal', ElArabyModal);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-modal': ElArabyModal;
  }
}