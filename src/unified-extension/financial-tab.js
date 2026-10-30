// ==================== تبويب آخرى — التحليلات المالية ====================
// محلية 100%: استخراج عند الطلب عبر executeScript (بدون content script دائم)
// + محلل محلي + تحليل AI محلي (Ollama). صفر تعارض مع content-script.js.

let financialPageData = null;
let financialAnalysis = null;

function fSetStatus(kind, message) {
  const el = document.getElementById('f-status');
  if (!el) return;
  el.className = 'status-msg ' + kind;
  el.textContent = message;
}

function fOverviewHTML(data) {
  return [
    '<div class="f-overview">',
    '  <div><span>النوع</span><b>' + (data.pageName || 'غير معروف') + '</b></div>',
    '  <div><span>الحساب</span><b>' + (data.accountNumber || 'غير محدد') + '</b></div>',
    '  <div><span>الاسم</span><b>' + (data.accountName || 'غير محدد') + '</b></div>',
    '  <div><span>الجداول</span><b>' + data.tableCount + '</b></div>',
    '</div>'
  ].join('');
}

function fRenderSections(result) {
  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  if (result.summary && result.summary.cards) {
    const cardsHtml = '<div class="cards-grid">' + result.summary.cards.map(card =>
      '<div class="card ' + (card.type || '') + '">' +
      '<div class="card-label">' + card.label + '</div>' +
      '<div class="card-value">' + card.value + '</div>' +
      (card.sub ? '<div class="card-sub">' + card.sub + '</div>' : '') +
      '</div>'
    ).join('') + '</div>';
    setHTML('f-summary', cardsHtml);
  }
  setHTML('f-bank-transfers', result.bankTransfers || '<div class="empty-state">لا توجد تحويلات</div>');
  setHTML('f-damaged', result.damagedParts || '<div class="empty-state">لا توجد فواتير تالف</div>');
  setHTML('f-parts', result.partsAnalysis || '<div class="empty-state">لا توجد تحليلات قطع</div>');
  setHTML('f-alerts', result.alerts || '<div class="empty-state">لا توجد تنبيهات</div>');
  setHTML('f-monthly', result.monthlyTrend || '<div class="empty-state">لا توجد إحصائيات شهرية</div>');
}

async function fLoadPageData() {
  fSetStatus('info', 'جاري قراءة بيانات الصفحة...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      fSetStatus('error', 'لا يوجد تبويب نشط');
      return;
    }

    const isCrm = tab.url && tab.url.includes('elarabyiscrm2.azurewebsites.net');
    if (!isCrm) {
      fSetStatus('warn', 'افتح صفحة مالية في بوابة CRM أولاً');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData
    });

    if (results && results[0] && results[0].result) {
      financialPageData = results[0].result;
      financialAnalysis = null;
      fSetStatus('ok', 'تم تحميل البيانات: ' + financialPageData.pageName);
      document.getElementById('f-overview').innerHTML = fOverviewHTML(financialPageData);
      document.getElementById('f-accno').value = financialPageData.accountNumber || '';
      const btn = document.getElementById('f-btn-analyze');
      if (btn) btn.disabled = false;
    } else {
      fSetStatus('error', 'فشل استخراج البيانات');
    }
  } catch (error) {
    fSetStatus('error', 'خطأ: ' + error.message);
  }
}

async function fAnalyze() {
  if (!financialPageData) {
    fSetStatus('warn', 'اضغط تحديث البيانات أولاً');
    return;
  }

  const btn = document.getElementById('f-btn-analyze');
  if (btn) btn.disabled = true;

  try {
    fSetStatus('info', 'جاري التحليل...');
    const result = analyzeLocally(financialPageData);
    financialAnalysis = result;
    fRenderSections(result);
    fSetStatus('ok', 'تم التحليل بنجاح');
  } catch (error) {
    fSetStatus('error', 'خطأ في التحليل: ' + error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function fAutoFill() {
  const acc = (document.getElementById('f-accno')?.value || '').trim();
  const pass = (document.getElementById('f-pass')?.value || '').trim();

  if (!acc && !pass) {
    fSetStatus('warn', 'أدخل رقم الحساب و/أو كلمة السر');
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      fSetStatus('error', 'لا يوجد تبويب نشط');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: financialAutoFillPage,
      args: [acc, pass]
    });

    const r = results && results[0] && results[0].result;
    const filled = (r && r.fieldsFound && r.fieldsFound.length) || 0;
    fSetStatus(filled > 0 ? 'ok' : 'warn',
      filled > 0 ? 'تم التعبئة: ' + r.fieldsFound.join(', ') : 'لم يتم العثور على حقول التعبئة');
  } catch (error) {
    fSetStatus('error', 'خطأ: ' + error.message);
  }
}

async function fAIInsights() {
  if (!financialPageData) {
    fSetStatus('warn', 'اضغط تحديث البيانات أولاً');
    return;
  }

  const btn = document.getElementById('f-btn-ai');
  if (btn) btn.disabled = true;

  try {
    const analysis = financialAnalysis || analyzeLocally(financialPageData);
    fSetStatus('info', 'جاري طلب التحليل من Ollama المحلي...');
    const text = await requestLocalAIInsights(financialPageData, analysis);
    const el = document.getElementById('f-ai-insights');
    el.innerHTML = '<div class="ai-insights-box">' +
      text.split('\n').filter(Boolean).map(line => '<div>' + line + '</div>').join('') +
      '</div>';
    fSetStatus('ok', 'تم توليد التحليل AI');
  } catch (error) {
    const el = document.getElementById('f-ai-insights');
    el.innerHTML = '<div class="empty-state">' + error.message + '</div>';
    fSetStatus('warn', error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function fCopyReport() {
  if (!financialAnalysis || !financialAnalysis.plainText) {
    fSetStatus('warn', 'اضغط تحليل أولاً');
    return;
  }
  navigator.clipboard.writeText(financialAnalysis.plainText).then(() => {
    fSetStatus('ok', 'تم نسخ التقرير');
  });
}

function fExportCSV() {
  if (!financialPageData || !financialPageData.tables || financialPageData.tables.length === 0) {
    fSetStatus('warn', 'لا توجد بيانات للتصدير');
    return;
  }
  let csv = '\uFEFF';
  financialPageData.tables.forEach(table => {
    csv += table.headers.join(',') + '\n';
    table.rows.forEach(row => {
      csv += row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',') + '\n';
    });
    csv += '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'elaraby_' + financialPageData.pageType + '_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function fExportJSON() {
  if (!financialPageData) {
    fSetStatus('warn', 'لا توجد بيانات للتصدير');
    return;
  }
  const blob = new Blob([JSON.stringify(financialPageData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'elaraby_' + financialPageData.pageType + '_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('f-btn-refresh')?.addEventListener('click', fLoadPageData);
  document.getElementById('f-btn-analyze')?.addEventListener('click', fAnalyze);
  document.getElementById('f-btn-autofill')?.addEventListener('click', fAutoFill);
  document.getElementById('f-btn-ai')?.addEventListener('click', fAIInsights);
  document.getElementById('f-btn-copy')?.addEventListener('click', fCopyReport);
  document.getElementById('f-btn-csv')?.addEventListener('click', fExportCSV);
  document.getElementById('f-btn-json')?.addEventListener('click', fExportJSON);
});