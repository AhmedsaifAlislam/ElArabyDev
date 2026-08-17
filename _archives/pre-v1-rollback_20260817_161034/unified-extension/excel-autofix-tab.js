// =========================================================
// excel-autofix-tab.js — Excel Autofix tab (local service)
// =========================================================
'use strict';

const EXCEL_AUTOFIX_BASE = 'http://127.0.0.1:8765';

// ── State ─────────────────────────────────────────────────
let excelAutofixInited   = false;
let excelAutofixReady    = false;
let excelAutofixFile     = null;
let excelAutofixDownload = null; // { url, name }

// ── Init (called on tab open) ─────────────────────────────
function initExcelAutofixTab() {
  if (excelAutofixInited) { checkExcelAutofixService(); return; }
  excelAutofixInited = true;

  const fileInput = document.getElementById('excel-autofix-file');
  const btnProcess = document.getElementById('btn-excel-autofix-process');
  const btnRescan = document.getElementById('btn-excel-autofix-rescan');

  fileInput.addEventListener('change', () => {
    excelAutofixFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    btnProcess.disabled = !(excelAutofixReady && excelAutofixFile);
  });
  btnProcess.addEventListener('click', processExcelAutofixFile);
  btnRescan.addEventListener('click', () => checkExcelAutofixService(true));
  document.getElementById('btn-excel-autofix-download')
    .addEventListener('click', downloadExcelAutofixResult);

  checkExcelAutofixService();
}

// ── Service health check ──────────────────────────────────
async function checkExcelAutofixService(force) {
  const dot = document.getElementById('excel-autofix-dot');
  const text = document.getElementById('excel-autofix-status-text');
  const btnProcess = document.getElementById('btn-excel-autofix-process');
  dot.style.background = '#f5a623';
  text.textContent = force ? 'جارٍ إعادة الفحص...' : 'جارٍ فحص الخدمة المحلية...';
  try {
    const res = await fetch(EXCEL_AUTOFIX_BASE + '/api/health', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    excelAutofixReady = data && data.status === 'ok';
  } catch (e) {
    excelAutofixReady = false;
  }
  if (excelAutofixReady) {
    dot.style.background = '#2ecc71';
    text.textContent = 'الخدمة المحلية تعمل (Excel Autofix v1.0)';
  } else {
    dot.style.background = '#e74c3c';
    text.textContent = 'الخدمة غير مفعلة — شغّل service.bat ثم أعد الفحص';
  }
  btnProcess.disabled = !(excelAutofixReady && excelAutofixFile);
}

// ── Process uploaded file ─────────────────────────────────
async function processExcelAutofixFile() {
  const btnProcess = document.getElementById('btn-excel-autofix-process');
  const resultBox = document.getElementById('excel-autofix-result');
  const resultText = document.getElementById('excel-autofix-result-text');
  const btnDownload = document.getElementById('btn-excel-autofix-download');
  if (!excelAutofixFile || !excelAutofixReady) return;

  btnProcess.disabled = true;
  btnProcess.textContent = '⏳ جاري المعالجة...';
  resultBox.style.display = 'none';

  try {
    const fd = new FormData();
    fd.append('file', excelAutofixFile, excelAutofixFile.name);
    const title = (document.getElementById('excel-autofix-title').value || '').trim();
    if (title) fd.append('title', title);

    const res = await fetch(EXCEL_AUTOFIX_BASE + '/api/process', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data || !data.ok) {
      throw new Error((data && data.error) || 'فشلت المعالجة');
    }
    excelAutofixDownload = { url: EXCEL_AUTOFIX_BASE + data.download_url, name: data.filename };
    resultText.textContent = `✅ تمت معالجة ${data.row_count} صف\n📁 ${data.filename}`;
    btnDownload.style.display = 'block';
    resultBox.style.display = 'block';
  } catch (e) {
    resultText.textContent = '❌ ' + e.message;
    btnDownload.style.display = 'none';
    resultBox.style.display = 'block';
  } finally {
    btnProcess.disabled = false;
    btnProcess.textContent = '⚡ معالجة وتحميل';
  }
}

// ── Download processed file ───────────────────────────────
async function downloadExcelAutofixResult() {
  if (!excelAutofixDownload) return;
  try {
    const res = await fetch(excelAutofixDownload.url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = excelAutofixDownload.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    alert('فشل التنزيل: ' + e.message);
  }
}
