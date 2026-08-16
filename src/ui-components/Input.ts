/**
 * Input Component — El Araby UI Components
 * Vanilla Custom Element + Shadow DOM
 */

export class ElArabyInput extends HTMLElement {
  static get observedAttributes() {
    return ['type', 'placeholder', 'value', 'disabled', 'required', 'readonly', 'error', 'label', 'full-width'];
  }

  #shadow: ShadowRoot;
  #input: HTMLInputElement;
  #label: HTMLLabelElement | null;
  #errorEl: HTMLSpanElement | null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#input = this.#shadow.querySelector('input')!;
    this.#label = this.#shadow.querySelector('label');
    this.#errorEl = this.#shadow.querySelector('.error-text');
    this.#input.addEventListener('input', (e) => this.#onInput(e));
    this.#input.addEventListener('blur', (e) => this.#onBlur(e));
    this.#input.addEventListener('focus', (e) => this.#onFocus(e));
  }

  connectedCallback() {
    this.#syncValue();
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    switch (name) {
      case 'value':
        this.#syncValue();
        break;
      case 'disabled':
        this.#input.disabled = value !== null;
        break;
      case 'required':
        this.#input.required = value !== null;
        break;
      case 'readonly':
        this.#input.readOnly = value !== null;
        break;
      case 'placeholder':
        this.#input.placeholder = value || '';
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
      case 'type':
        this.#input.type = value || 'text';
        break;
    }
  }

  #render() {
    const type = this.getAttribute('type') || 'text';
    const placeholder = this.getAttribute('placeholder') || '';
    const value = this.getAttribute('value') || '';
    const disabled = this.hasAttribute('disabled');
    const required = this.hasAttribute('required');
    const readonly = this.hasAttribute('readonly');
    const error = this.getAttribute('error') || '';
    const label = this.getAttribute('label') || '';
    const fullWidth = this.hasAttribute('full-width');
    const name = this.getAttribute('name') || '';

    this.#shadow.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        label {
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--ea-text);
        }
        input {
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
        }
        input:focus {
          outline: none;
          border-color: var(--ea-brand);
          box-shadow: var(--ea-focus-ring);
        }
        input:disabled {
          background: var(--ea-input-disabled);
          color: var(--ea-input-disabled-text);
          cursor: not-allowed;
        }
        input[readonly] {
          background: var(--ea-faint);
        }
        input.error {
          border-color: var(--ea-error);
        }
        input.error:focus {
          box-shadow: 0 0 0 3px var(--ea-error-border);
        }
        .error-text {
          display: none;
          font-size: 12px;
          color: var(--ea-error);
          font-weight: 500;
        }
        .error-text.visible { display: block; }
        .full-width { width: 100%; }
      </style>
      <div class="input-wrapper ${fullWidth ? 'full-width' : ''}">
        ${label ? `<label>${label}${required ? ' <span style="color:var(--ea-error)">*</span>' : ''}</label>` : ''}
        <input
          type="${type}"
          placeholder="${placeholder}"
          value="${value}"
          ${disabled ? 'disabled' : ''}
          ${required ? 'required' : ''}
          ${readonly ? 'readonly' : ''}
          ${name ? `name="${name}"` : ''}
          autocomplete="off"
        />
        <span class="error-text">${error}</span>
      </div>
    `;
  }

  #syncValue() {
    if (this.#input && this.#input.value !== this.getAttribute('value')) {
      this.#input.value = this.getAttribute('value') || '';
    }
  }

  #showError(error: string) {
    if (this.#errorEl) {
      this.#errorEl.textContent = error;
      this.#errorEl.classList.toggle('visible', !!error);
    }
    this.#input.classList.toggle('error', !!error);
  }

  #onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    this.setAttribute('value', target.value);
    this.removeAttribute('error');
    this.dispatchEvent(new CustomEvent('el-input', {
      detail: { value: target.value },
      bubbles: true,
      composed: true
    }));
  }

  #onBlur(_e: FocusEvent) {
    this.dispatchEvent(new CustomEvent('el-blur', {
      bubbles: true,
      composed: true
    }));
  }

  #onFocus(_e: FocusEvent) {
    this.dispatchEvent(new CustomEvent('el-focus', {
      bubbles: true,
      composed: true
    }));
  }

  #updateLayout() {
    const wrapper = this.#shadow.querySelector('.input-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('full-width', this.hasAttribute('full-width'));
    }
  }

  // Public API
  get value() { return this.#input.value; }
  set value(v: string) { this.setAttribute('value', v); this.#syncValue(); }

  setError(error: string) { this.setAttribute('error', error); }
  clearError() { this.removeAttribute('error'); }

  setDisabled(disabled: boolean) {
    if (disabled) this.setAttribute('disabled', ''); else this.removeAttribute('disabled');
  }
}

if (!customElements.get('el-input')) {
  customElements.define('el-input', ElArabyInput);
}

declare global {
  interface HTMLElementTagNameMap {
    'el-input': ElArabyInput;
  }
}