/**
 * FileUploader Component — Drag & drop file upload for CRM Excel
 */

import { ElArabyInput } from '../../../ui-components/Input';
import { ElArabyButton } from '../../../ui-components/Button';
import { ElArabyProgress } from '../../../ui-components/Progress';
import { ElArabyBadge } from '../../../ui-components/Badge';
import { ElArabyToastContainer } from '../../../ui-components/Toast';
import { parseCRMExcel } from '../services/xlsx-worker';

export class CRMFileUploader extends HTMLElement {
  #shadow: ShadowRoot;
  #fileInput: HTMLInputElement;
  #dropzone: HTMLDivElement;
  #fileInfo: HTMLDivElement;
  #startBtn: HTMLButtonElement;
  #progress: HTMLDivElement;
  #badgesContainer: HTMLDivElement;
  #toast: ElArabyToastContainer;

  #file: File | null = null;
  #parseResult: any = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#render();
    this.#bindEvents();
    this.#toast = new ElArabyToastContainer();
    this.#shadow.appendChild(this.#toast);
  }

  #render() {
    this.#shadow.innerHTML = `
      <style>
        :host { display: block; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 14px; font-weight: 700; color: var(--ea-text); margin-bottom: 8px; }
        .dropzone {
          border: 2px dashed var(--ea-border-strong); border-radius: 12px; padding: 24px;
          text-align: center; cursor: pointer; transition: all 0.2s;
          background: var(--ea-faint); position: relative;
        }
        .dropzone:hover, .dropzone.drag-over { border-color: var(--ea-brand); background: var(--ea-brand-bg); }
        .dropzone-icon { font-size: 32px; margin-bottom: 8px; display: block; }
        .dropzone-text { color: var(--ea-muted); font-size: 14px; }
        .dropzone-text strong { color: var(--ea-brand); }
        .file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .file-info { margin-top: 12px; padding: 12px; background: var(--ea-brand-bg); border-radius: 8px; display: none; }
        .file-info.visible { display: block; }
        .file-info-row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
        .file-info-label { color: var(--ea-muted); }
        .file-info-value { font-weight: 600; color: var(--ea-text); }
        .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .progress-section { margin-top: 16px; display: none; }
        .progress-section.visible { display: block; }
        .progress-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--ea-muted); margin-bottom: 4px; }
        .actions { display: flex; gap: 10px; margin-top: 16px; }
        .btn-primary { background: var(--ea-brand); color: var(--ea-on-brand); }
        .btn-primary:hover:not(:disabled) { background: var(--ea-brand-dark); }
        .btn-secondary { background: var(--ea-neutral); color: var(--ea-on-brand); }
      </style>
      <div class="section">
        <div class="section-title">📁 رفع ملف Excel</div>
        <div class="dropzone" id="dropzone">
          <span class="dropzone-icon">📂</span>
          <div class="dropzone-text">اسحب الملف هنا<br>أو <strong>اضغط للاختيار</strong></div>
          <input type="file" class="file-input" id="fileInput" accept=".xlsx,.xls">
        </div>
        <div class="file-info" id="fileInfo">
          <div class="file-info-row"><span class="file-info-label">الملف:</span><span class="file-info-value" id="infoName">-</span></div>
          <div class="file-info-row"><span class="file-info-label">الحجم:</span><span class="file-info-value" id="infoSize">-</span></div>
          <div class="file-info-row"><span class="file-info-label">الصفوف:</span><span class="file-info-value" id="infoRows">-</span></div>
          <div class="file-info-row"><span class="file-info-label">أرقام CRM:</span><span class="file-info-value" id="infoCount">-</span></div>
          <div class="badges" id="badges"></div>
        </div>
      </div>
      <div class="progress-section" id="progressSection">
        <div class="section-title">⏳ جاري قراءة الملف...</div>
        <el-progress id="parseProgress" value="0" max="100" label="قراءة الملف" show-percent size="md" color="primary" striped animated></el-progress>
      </div>
      <div class="actions">
        <el-button id="startBtn" variant="primary" size="md" full-width disabled label="🚀 بدء البحث"></el-button>
        <el-button id="resetBtn" variant="secondary" size="md" label="🔄 إعادة تعيين" style="display:none"></el-button>
      </div>
    `;

    this.#fileInput = this.#shadow.getElementById('fileInput') as HTMLInputElement;
    this.#dropzone = this.#shadow.getElementById('dropzone') as HTMLDivElement;
    this.#fileInfo = this.#shadow.getElementById('fileInfo') as HTMLDivElement;
    this.#startBtn = this.#shadow.getElementById('startBtn') as HTMLButtonElement;
    this.#progress = this.#shadow.getElementById('progressSection') as HTMLDivElement;
    this.#badgesContainer = this.#shadow.getElementById('badges') as HTMLDivElement;
    this.#toast = this.#shadow.querySelector('el-toast-container') as ElArabyToastContainer;
  }

  #bindEvents() {
    // Dropzone events
    this.#dropzone.addEventListener('click', () => this.#fileInput.click());
    this.#dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.#dropzone.classList.add('drag-over'); });
    this.#dropzone.addEventListener('dragleave', () => this.#dropzone.classList.remove('drag-over'));
    this.#dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.#dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.#handleFile(file);
    });

    this.#fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.#handleFile(file);
    });

    // Start button
    this.#startBtn.addEventListener('el-button-click', () => this.dispatchEvent(new CustomEvent('crm-start', {
      detail: { file: this.#file, parseResult: this.#parseResult },
      bubbles: true,
      composed: true
    })));

    // Reset button
    const resetBtn = this.#shadow.getElementById('resetBtn') as HTMLButtonElement;
    resetBtn?.addEventListener('el-button-click', () => this.#reset());
  }

  async #handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      this.#toast.show({ message: 'يرجى اختيار ملف Excel (.xlsx أو .xls)', variant: 'warning' });
      return;
    }

    this.#file = file;
    this.#fileInfo.classList.add('visible');
    this.#dropzone.style.display = 'none';

    // Show file info
    (this.#shadow.getElementById('infoName') as HTMLElement).textContent = file.name;
    (this.#shadow.getElementById('infoSize') as HTMLElement).textContent = this.#formatSize(file.size);

    // Show progress
    this.#progress.classList.add('visible');
    const progressEl = this.#shadow.querySelector('el-progress') as any;

    try {
      // Parse file
      progressEl.setAttribute('label', 'جاري قراءة الملف...');
      const result = await this.#parseFileWithProgress(file);
      this.#parseResult = result;

      // Update UI
      (this.#shadow.getElementById('infoRows') as HTMLElement).textContent = result.totalRows.toLocaleString('ar-EG');
      (this.#shadow.getElementById('infoCount') as HTMLElement).textContent = result.sapNumbers.length.toLocaleString('ar-EG');

      // Show badges
      this.#badgesContainer.innerHTML = `
        <el-badge variant="primary" label="عمود CRM: ${result.sapColumnIndex >= 0 ? 'مكتشف' : 'غير مكتشف'}"></el-badge>
        <el-badge variant="${result.notesColumnIndex >= 0 ? 'success' : 'warning'}" label="عمود ملاحظات: ${result.notesColumnIndex >= 0 ? 'مكتشف' : 'غير مكتشف'}"></el-badge>
      `;

      // Enable start button
      this.#startBtn.removeAttribute('disabled');
      this.#startBtn.setAttribute('label', '🚀 بدء البحث');
      const resetBtn = this.#shadow.getElementById('resetBtn') as any;
      resetBtn.style.display = 'inline-flex';

      this.#toast.show({ message: `تم قراءة الملف: ${result.sapNumbers.length} رقم CRM`, variant: 'success' });

    } catch (err: any) {
      this.#toast.show({ message: `خطأ في قراءة الملف: ${err.message}`, variant: 'danger' });
      this.#reset();
    }
  }

  async #parseFileWithProgress(file: File) {
    // Use the existing parseCRMExcel but with progress simulation
    const { parseCRMExcel } = await import('../services/xlsx-worker');
    return parseCRMExcel(file);
  }

  #reset() {
    this.#file = null;
    this.#parseResult = null;
    this.#fileInfo.classList.remove('visible');
    this.#progress.classList.remove('visible');
    this.#dropzone.style.display = 'block';
    this.#fileInput.value = '';
    this.#startBtn.setAttribute('disabled', '');
    this.#startBtn.setAttribute('label', '🚀 بدء البحث');
    const resetBtn = this.#shadow.getElementById('resetBtn') as any;
    if (resetBtn) resetBtn.style.display = 'none';
    this.#badgesContainer.innerHTML = '';
    (this.#shadow.getElementById('fileInput') as HTMLInputElement).value = '';
  }

  #formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' بايت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Public API
  getFile() { return this.#file; }
  getParseResult() { return this.#parseResult; }
  isReady() { return this.#file !== null && this.#parseResult !== null; }
}

if (!customElements.get('crm-file-uploader')) {
  customElements.define('crm-file-uploader', CRMFileUploader);
}

declare global {
  interface HTMLElementTagNameMap {
    'crm-file-uploader': CRMFileUploader;
  }
}