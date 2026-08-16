/**
 * Select Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabySelect extends HTMLElement {
  static get observedAttributes() {
    return ['placeholder', 'value', 'disabled', 'required', 'error', 'label', 'full-width', 'multiple'];
  }

  #shadow: ShadowRoot;
  #select: HTMLSelectElement;
  #label: HTMLLabelElement | null;
  #errorEl: HTMLSpanElement | null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#select = this.#shadow.querySelector('select')!;
    this.#label = this.#shadow.querySelector('label');
    this.#errorEl = this.#shadow.querySelector('.error-text');
    this.#select.addEventListener('change', (e) => this.#onChange(e));
    this.#select.addEventListener('blur', () => this.dispatchEvent(new CustomEvent('el-blur', { bubbles: true, composed: true })));
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    switch (name) {
      case 'value':
        if (this.#select.value !== value) this.#select.value = value;
        break;
      case 'disabled':
        this.#select.disabled = value !== null;
        break;
      case 'required':
        this.#select.required = value !== null;
        break;
      case 'placeholder':
        this.#updatePlaceholder(value);
        break;
      case 'error':
        this.#showError(value);
        break;
      case 'label':
        if (this.#label) this.#label.textContent = value || '';
        break;
      case 'full-width':
        this.#updateLayout();
        break;
      case 'multiple':
        this.#select.multiple = value !== null;
        break;
    }
  }

  #render() {
    const placeholder = this.getAttribute('placeholder') || 'اختر...';
    const value = this.getAttribute('value') || '';
    const disabled = this.hasAttribute('disabled');
    const required = this.hasAttribute('required');
    const error = this.getAttribute('error') || '';
    const label = this.getAttribute('label') || '';
    const fullWidth = this.hasAttribute('full-width');
    const multiple = this.hasAttribute('multiple');
    const name = this.getAttribute('name') || '';

    // Render options from child elements or options attribute
    const optionsHtml = this.#getOptionsHtml();

    this.#shadow.innerHTML = `
      <style>
        :host { display: inline-flex; flex-direction: column; gap: 6px; }
        .select-wrapper { position: relative; display: flex; flex-direction: column; gap: 4px; }
        label { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; font-size: 13px; font-weight: 600; color: var(--ea-text); }
        select {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 14px;
          padding: 10px 12px;
          border: 2px solid var(--ea-border);
          border-radius: 8px;
          background: var(--ea-surface);
          color: var(--ea-text);
          transition: all 0.15s ease;
          width: 100%;
          box-sizing: border-box;
          direction: rtl;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
          background-position: left 10px center;
          background-repeat: no-repeat;
          background-size: 16px;
          padding-left: 40px;
        }
        select:focus { outline: none; border-color: var(--ea-brand); box-shadow: var(--ea-focus-ring); }
        select:disabled { background: var(--ea-input-disabled); color: var(--ea-input-disabled-text); cursor: not-allowed; }
        select.error { border-color: var(--ea-error); }
        select.error:focus { box-shadow: 0 0 0 3px var(--ea-error-border); }
        .error-text { display: none; font-size: 12px; color: var(--ea-error); font-weight: 500; }
        .error-text.visible { display: block; }
        .full-width { width: 100%; }
      </style>
      <div class="select-wrapper ${fullWidth ? 'full-width' : ''}">
        ${label ? `<label>${label}${required ? ' <span style="color:var(--ea-error)">*</span>' : ''}</label>` : ''}
        <select ${disabled ? 'disabled' : ''} ${required ? 'required' : ''} ${multiple ? 'multiple' : ''} ${name ? `name="${name}"` : ''}>
          <option value="" disabled ${!value ? 'selected' : ''}>${placeholder}</option>
          ${optionsHtml}
        </select>
        <span class="error-text">${error}</span>
      </div>
    `;
    this.#select = this.#shadow.querySelector('select')!;
    this.#label = this.#shadow.querySelector('label');
    this.#errorEl = this.#shadow.querySelector('.error-text');
    if (value) this.#select.value = value;
  }

  #getOptionsHtml(): string {
    // Check for child option elements first
    const childOptions = Array.from(this.querySelectorAll('option'));
    if (childOptions.length > 0) {
      return childOptions.map(opt => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.textContent}</option>`).join('');
    }
    // Fallback to options attribute (JSON array)
    const optionsAttr = this.getAttribute('options');
    if (optionsAttr) {
      try {
        const opts = JSON.parse(optionsAttr);
        return opts.map((opt: any) => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>`).join('');
      } catch { return ''; }
    }
    return '';
  }

  #updatePlaceholder(placeholder: string) {
    const firstOption = this.#select.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = placeholder;
  }

  #showError(error: string) {
    if (this.#errorEl) {
      this.#errorEl.textContent = error;
      this.#errorEl.classList.toggle('visible', !!error);
    }
    this.#select.classList.toggle('error', !!error);
  }

  #onChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    this.setAttribute('value', target.value);
    this.removeAttribute('error');
    this.dispatchEvent(new CustomEvent('el-change', {
      detail: { value: target.value, values: Array.from(target.selectedOptions).map(o => o.value) },
      bubbles: true,
      composed: true
    }));
  }

  #updateLayout() {
    const wrapper = this.#shadow.querySelector('.select-wrapper');
    if (wrapper) wrapper.classList.toggle('full-width', this.hasAttribute('full-width'));
  }

  connectedCallback() {
    this.#render();
  }

  // Public API
  get value() { return this.#select.value; }
  set value(v: string) { this.setAttribute('value', v); if (this.#select) this.#select.value = v; }

  get values() { return Array.from(this.#select.selectedOptions).map(o => o.value); }

  setOptions(options: Array<{value: string, label: string}>) {
    this.#select.innerHTML = `<option value="" disabled selected>${this.getAttribute('placeholder') || 'اختر...'}</option>` + 
      options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  }

  setError(error: string) { this.setAttribute('error', error); }
  clearError() { this.removeAttribute('error'); }
  setDisabled(disabled: boolean) { if (disabled) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
}

if (!customElements.get('el-select')) {
  customElements.define('el-select', ElArabySelect);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-select': ElArabySelect;
  }
}