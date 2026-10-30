/**
 * Toast Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 * Toast container manages multiple toasts
 */

export interface ToastOptions {
  title?: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  duration?: number; // ms, 0 = persistent
  closable?: boolean;
  action?: { label: string; callback: () => void };
}

export class ElArabyToastContainer extends HTMLElement {
  #shadow: ShadowRoot;
  #toasts: Map<string, HTMLElement> = new Map();

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
  }

  #render() {
    this.#shadow.innerHTML = `
      <style>
        :host { position: fixed; bottom: 20px; left: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
        .toast {
          pointer-events: auto;
          min-width: 280px; max-width: 420px;
          background: var(--ea-surface); border-radius: 12px; box-shadow: var(--ea-shadow-2);
          border-left: 4px solid var(--ea-brand); overflow: hidden;
          animation: slideIn 0.3s ease;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .toast.removing { animation: slideOut 0.3s ease forwards; }
        @keyframes slideOut { to { transform: translateX(100%); opacity: 0; } }
        .toast-content { padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; }
        .toast-icon { width: 24px; height: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .toast-body { flex: 1; min-width: 0; }
        .toast-title { font-weight: 700; font-size: 14px; color: var(--ea-text); margin-bottom: 2px; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toast-message { font-size: 13px; color: var(--ea-text-strong); line-height: 1.5; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .toast-close { width: 28px; height: 28px; border: none; background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ea-icon-fill); flex-shrink: 0; transition: all 0.15s; }
        .toast-close:hover { background: var(--ea-faint-2); color: var(--ea-text); }
        .toast-action { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ea-border); display: flex; justify-content: flex-end; }
        .toast-action-btn { padding: 6px 12px; font-size: 12px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; }
        .variant-info { border-left-color: var(--ea-info); }
        .variant-success { border-left-color: var(--ea-success); }
        .toast-icon.success { color: var(--ea-success); }
        .variant-warning { border-left-color: var(--ea-warn); }
        .toast-icon.warning { color: var(--ea-warn); }
        .variant-danger { border-left-color: var(--ea-error); }
        .toast-icon.danger { color: var(--ea-error); }
        .toast-icon.info { color: var(--ea-info); }
      </style>
      <div id="toast-root"></div>
    `;
  }

  show(options: ToastOptions): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const variant = options.variant || 'info';
    const duration = options.duration ?? 5000;
    const closable = options.closable !== false;

    const toastEl = document.createElement('div');
    toastEl.className = `toast variant-${variant}`;
    toastEl.dataset.id = id;

    const iconSvg = this.#getIcon(variant);
    const actionHtml = options.action ? `
      <div class="toast-action">
        <button class="toast-action-btn" style="background: var(--action-bg, var(--ea-brand)); color: var(--ea-on-brand); border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;">
          ${options.action.label}
        </button>
      </div>
    ` : '';

    toastEl.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon ${variant}">${this.#getIcon(variant)}</div>
        <div class="toast-body">
          ${options.title ? `<div class="toast-title">${options.title}</div>` : ''}
          <div class="toast-message">${options.message}</div>
          ${actionHtml}
        </div>
        ${closable ? `<button class="toast-close" aria-label="إغلاق"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>` : ''}
      </div>
    `;

    const root = this.#shadow.getElementById('toast-root')!;
    root.appendChild(toastEl);
    this.#toasts.set(id, toastEl);

    // Bind close
    const closeBtn = toastEl.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => this.remove(id));

    // Bind action
    const actionBtn = toastEl.querySelector('.toast-action-btn');
    if (actionBtn && options.action) {
      actionBtn.addEventListener('click', () => {
        options.action!.callback();
        if (duration > 0) this.remove(id);
      });
    }

    // Auto-remove
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  remove(id: string) {
    const toast = this.#toasts.get(id);
    if (!toast) return;
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
      this.#toasts.delete(id);
    }, 300);
  }

  clear() {
    this.#toasts.forEach((_, id) => this.remove(id));
  }

  #getIcon(variant: string): string {
    switch (variant) {
      case 'success': return `<svg class="success" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      case 'warning': return `<svg class="warning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      case 'danger': return `<svg class="danger" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      default: return `<svg class="info" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
  }

  connectedCallback() {
    this.#render();
  }

  // Static helper for easy use
  static show(options: ToastOptions): string {
    let container = document.querySelector('el-toast-container') as ElArabyToastContainer;
    if (!container) {
      container = document.createElement('el-toast-container');
      document.body.appendChild(container);
    }
    return container.show(options);
  }
}

if (!customElements.get('el-toast-container')) {
  customElements.define('el-toast-container', ElArabyToastContainer);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-toast-container': ElArabyToastContainer;
  }
}