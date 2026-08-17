// =========================================================
// financial-tab.js — التحليل المالي (Financial Dashboard)
// Merged from: features/financial-extension (standalone v4.0)
// Runs 100% local — no internet, no external AI APIs.
// =========================================================
'use strict';

// ── State ────────────────────────────────────────────────
let financialTabInited = false;
let finPageData        = null;
let finAnalysis        = null;
let finDetectedPage    = null;

const FIN_SCRIPT_FILES = [
  'features/financial/page-registry.js',
  'features/financial/page-auto-filler.js',
  'features/financial/page-data-extractor.js'
];

// ── Init (called on tab open) ───────────────────────────
function initFinancialTab() {
  if (financialTabInited) { loadFinancialPageData(); return; }
  financialTabInited = true;

  const ids = [
    'btn-fin-refresh', 'btn-fin-analyze', 'btn-fin-auto-fill', 'btn-fin-auto-search',
    'btn-fin-copy-report', 'btn-fin-export-csv', 'btn-fin-export-json', 'btn-fin-copy-ai-report'
  ];
  const handlers = {
    'btn-fin-refresh':       loadFinancialPageData,
    'btn-fin-analyze':       analyzeFinancialData,
    'btn-fin-auto-fill':     autoFillFinancialFields,
    'btn-fin-auto-search':   autoSearchFinancial,
    'btn-fin-copy-report':   copyFinancialReport,
    'btn-fin-export-csv':    exportFinancialCSV,
    'btn-fin-export-json':   exportFinancialJSON,
    'btn-fin-copy-ai-report': copyFinancialAIReport
  };
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && handlers[id]) el.addEventListener('click', handlers[id]);
  });

  loadFinancialPageData();
}

// ── Status helper (unified .status-msg classes) ─────────
function finShowStatus(status, message) {
  const el = document.getElementById('fin-connection-status');
  if (!el) return;
  el.className = 'status-msg ' + (status || 'info');
  if (status === 'loading') {
    el.innerHTML = '<span class="spinner"></span> جاري الاتصال...';
  } else if (status === 'success') {
    el.innerHTML = '✅ ' + message;
  } else if (status === 'warning') {
    el.innerHTML = '⚠️ ' + message;
  } else if (status === 'error') {
    el.innerHTML = '❌ ' + message;
  } else {
    el.innerHTML = message;
  }
}

// ── Load page data from the active portal tab ───────────
async function loadFinancialPageData() {
  finShowStatus('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { finShowStatus('error', 'لا يوجد تبويب نشط'); return; }

    const isPortal = tab.url && (
      tab.url.includes('elarabyiscrm2.azurewebsites.net') ||
      tab.url.includes('elarabyportalpfs.powerappsportals.com')
    );
    if (!isPortal) { finShowStatus('warning', 'الصفحة ليست بوابة العربية — افتح صفحة مالية في البورتال'); return; }

    // Inject engine scripts into the portal page first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: FIN_SCRIPT_FILES
    });

    // Now call detection + extraction in page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const page = detectCurrentPage();
        const data = extractAllPageData();
        return { page, data };
      }
    });

    if (results && results[0] && results[0].result) {
      const { page, data } = results[0].result;
      finDetectedPage = page;
      finPageData = data;

      finShowStatus('success', page ? `تم التعرف على: ${page.name}` : 'تم تحميل البيانات');
      updateFinancialOverview(data, page);
      showFinancialAutomation(page);
      renderFinancialPagesList();
    } else {
      finShowStatus('error', 'فشل في استخراج البيانات');
    }
  } catch (error) {
    console.error('[Elaraby-Fin] Error:', error);
    finShowStatus('error', 'خطأ: ' + (error.message || 'غير معروف'));
  }
}

// ── Overview UI ─────────────────────────────────────────
function updateFinancialOverview(data, page) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('fin-info-page-type', page ? page.name : 'غير معروف');
  set('fin-info-page-category', page ? (getPageCategory(page.id)?.name || '-') : '-');
  set('fin-info-account', data.accountNumber || 'غير محدد');
  set('fin-info-name', data.accountName || 'غير محدد');
  set('fin-info-tables', `${data.tables.length} جدول`);
  set('fin-info-rows', `${data.tables.reduce((s, t) => s + t.rowCount, 0)} صف`);
}

// ── Automation section visibility ───────────────────────
function showFinancialAutomation(page) {
  const section = document.getElementById('fin-section-automation');
  const passwordRow = document.getElementById('fin-password-row');
  if (!section) return;

  if (page && (page.hasDateFilter || page.needsPassword)) {
    section.style.display = 'block';
    if (page.needsPassword) {
      passwordRow.style.display = 'block';
      document.getElementById('fin-auto-password').value = PASSWORDS[page.id] || '';
    } else {
      passwordRow.style.display = 'none';
    }
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('fin-auto-date-from').value = monthAgo;
    document.getElementById('fin-auto-date-to').value = today;
  } else {
    section.style.display = 'none';
  }
}

// ── Pages list ──────────────────────────────────────────
function renderFinancialPagesList() {
  const container = document.getElementById('fin-pages-list');
  if (!container) return;
  const pages = getAllPages();

  const grouped = {};
  pages.forEach(page => {
    const cat = PAGE_CATEGORIES[page.type];
    const catName = cat ? cat.name : 'أخرى';
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName].push(page);
  });

  let html = '';
  for (const [catName, catPages] of Object.entries(grouped)) {
    html += '<div class="fin-pages-group">';
    html += `<div class="fin-pages-group-title">${catName}</div>`;
    catPages.forEach(page => {
      const isCurrent = finDetectedPage && finDetectedPage.id === page.id;
      const hasError = page.hasAscidError;
      html += `
        <div class="fin-page-item ${isCurrent ? 'current' : ''} ${hasError ? 'has-error' : ''}">
          <span class="fin-page-name">${page.name}</span>
          <span class="fin-page-meta">${page.url}</span>
          ${isCurrent ? '<span class="fin-page-badge current">الحالية</span>' : ''}
          ${page.needsPassword ? '<span class="fin-page-badge">🔑</span>' : ''}
          ${hasError ? '<span class="fin-page-badge error">⚠️</span>' : ''}
        </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

// ── Auto-fill fields ────────────────────────────────────
async function autoFillFinancialFields() {
  if (!finDetectedPage) { alert('لم يتم التعرف على الصفحة'); return; }

  const fromDate = document.getElementById('fin-auto-date-from').value;
  const toDate = document.getElementById('fin-auto-date-to').value;
  const password = document.getElementById('fin-auto-password').value;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['features/financial/page-registry.js', 'features/financial/page-auto-filler.js']
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (pageId, from, to, pw) => {
      PASSWORDS[pageId] = pw;
      return autoSearchPage(pageId, { fromDate: from, toDate: to, password: pw, clickSearch: false });
    },
    args: [finDetectedPage.id, fromDate, toDate, password]
  });

  alert('تم ملء الحقول بنجاح');
}

// ── Auto search ─────────────────────────────────────────
async function autoSearchFinancial() {
  if (!finDetectedPage) { alert('لم يتم التعرف على الصفحة'); return; }

  const fromDate = document.getElementById('fin-auto-date-from').value;
  const toDate = document.getElementById('fin-auto-date-to').value;
  const password = document.getElementById('fin-auto-password').value;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['features/financial/page-registry.js', 'features/financial/page-auto-filler.js']
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (pageId, from, to, pw) => {
      PASSWORDS[pageId] = pw;
      return autoSearchPage(pageId, { fromDate: from, toDate: to, password: pw, clickSearch: true });
    },
    args: [finDetectedPage.id, fromDate, toDate, password]
  });

  if (results && results[0] && results[0].result) {
    const result = results[0].result;
    alert(`تم البحث في: ${result.page}\nتم ملء: ${result.filled.join(', ')}`);
  }
}

// ── Analysis (local + AI) ───────────────────────────────
function analyzeFinancialData() {
  if (!finPageData) { alert('لا توجد بيانات. اضغط تحديث أولاً'); return; }

  const btn = document.getElementById('btn-fin-analyze');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> جاري التحليل...';
  }

  try {
    const result = analyzeLocally(finPageData);
    finAnalysis = result;
    displayFinancialDashboard(result);
    if (result._aiData) displayFinancialAIResults(result._aiData);
    switchFinancialSubTab('fin-analysis');
  } catch (error) {
    console.error('[Elaraby-Fin] Analysis error:', error);
    alert('خطأ في التحليل: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔍 تحليل البيانات';
    }
  }
}

// ── Dashboard render ────────────────────────────────────
function displayFinancialDashboard(result) {
  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  if (result.summary && result.summary.cards) {
    setHTML('fin-summary-cards', result.summary.cards.map(card => `
      <div class="fin-card ${card.type || ''}">
        <div class="fin-card-label">${card.label}</div>
        <div class="fin-card-value">${card.value}</div>
        ${card.sub ? `<div class="fin-card-sub">${card.sub}</div>` : ''}
      </div>`).join(''));
  }
  if (result.bankTransfers) setHTML('fin-bank-transfers-content', result.bankTransfers);
  if (result.partsAnalysis) setHTML('fin-parts-analysis-content', result.partsAnalysis);
  if (result.alerts) setHTML('fin-alerts-content', result.alerts);
  if (result.monthlyTrend) setHTML('fin-monthly-trend-content', result.monthlyTrend);
}

// ── AI results render ───────────────────────────────────
function displayFinancialAIResults(aiData) {
  if (!aiData) return;
  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  if (aiData.score) {
    const s = aiData.score;
    setHTML('fin-ai-score-content', `
      <div class="fin-ai-score-ring" style="--score-color: ${s.color}">
        <div class="fin-ai-score-value">${s.score}</div>
        <div class="fin-ai-score-grade">صفة ${s.grade}</div>
      </div>
      <div class="fin-ai-score-details">
        ${s.details.map(d => `
          <div class="fin-ai-detail-item">
            <span>${d.item}</span>
            <span class="negative">${d.impact > 0 ? '+' : ''}${Math.round(d.impact)}</span>
            <span class="fin-ai-detail-reason">${d.reason}</span>
          </div>`).join('')}
      </div>`);
  }

  if (aiData.insights) {
    setHTML('fin-ai-insights-content', aiData.insights.map(i => `
      <div class="fin-ai-insight-card fin-ai-insight-${i.type}">
        <div class="fin-ai-insight-header">${i.icon} ${i.title}</div>
        <div class="fin-ai-insight-message">${i.message}</div>
        <div class="fin-ai-insight-action">💡 ${i.action}</div>
      </div>`).join(''));
  }

  if (aiData.prediction) {
    const p = aiData.prediction;
    setHTML('fin-ai-prediction-content', `
      <div class="fin-ai-prediction-card">
        <div class="fin-ai-prediction-row"><span>الرصيد الحالي:</span><span>${formatEGP(Math.abs(p.currentBalance))}</span></div>
        <div class="fin-ai-prediction-row"><span>الرصيد المتوقع:</span><span class="${p.predictedBalance < p.currentBalance ? 'negative' : 'positive'}">${formatEGP(Math.abs(p.predictedBalance))}</span></div>
        <div class="fin-ai-prediction-row"><span>متوسط التدفق الشهري:</span><span>${formatEGP(Math.abs(p.avgMonthlyFlow))}</span></div>
        <div class="fin-ai-prediction-row"><span>الاتجاه:</span><span>${p.trend}</span></div>
        <div class="fin-ai-prediction-row"><span>الثقة:</span><span>${p.confidence}</span></div>
      </div>`);
  }

  if (aiData.risks) {
    setHTML('fin-ai-risks-content', aiData.risks.map(r => `
      <div class="fin-ai-risk-card" style="border-right-color: ${r.color}">
        <div class="fin-ai-risk-level" style="color: ${r.color}">[${r.level}]</div>
        <div class="fin-ai-risk-title">${r.title}</div>
        <div class="fin-ai-risk-desc">${r.description}</div>
        <div class="fin-ai-risk-action">💡 ${r.recommendation}</div>
      </div>`).join(''));
  }

  if (aiData.categories) {
    let catHTML = '';
    for (const [key, cat] of Object.entries(aiData.categories)) {
      if (cat.rows.length > 0) {
        catHTML += `<div class="fin-ai-cat-row"><span class="fin-ai-cat-name">${cat.name}</span><span class="fin-ai-cat-count">${cat.rows.length} حركة</span><span class="fin-ai-cat-total">${formatEGP(cat.total)}</span></div>`;
      }
    }
    setHTML('fin-ai-categories-content', catHTML || '<div class="empty-state">لا توجد تصنيفات</div>');
  }

  if (aiData.comparison && aiData.comparison.comparisons) {
    const c = aiData.comparison;
    setHTML('fin-ai-comparison-content', `
      <div class="fin-ai-comparison-header">${c.prevMonth} ← ${c.currMonth}</div>
      ${c.comparisons.map(item => {
        const change = item.prev > 0 ? ((item.curr - item.prev) / item.prev * 100).toFixed(1) : 0;
        const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
        return `<div class="fin-ai-comparison-row">
          <span>${item.label}</span>
          <span>${item.format ? formatEGP(item.prev) : item.prev}</span>
          <span>→</span>
          <span>${item.format ? formatEGP(item.curr) : item.curr}</span>
          <span class="${changeClass}">${change > 0 ? '+' : ''}${change}%</span>
        </div>`;
      }).join('')}`);
  }
}

// ── Sub-tab switch helper ───────────────────────────────
function switchFinancialSubTab(tabId) {
  const btn = document.getElementById('sub-tab-' + tabId);
  if (btn) btn.click();
}

// ── Copy / Export ───────────────────────────────────────
function copyFinancialReport() {
  if (!finAnalysis || !finAnalysis.plainText) { alert('لا توجد نتيجة تحليل. اضغط تحليل أولاً'); return; }
  navigator.clipboard.writeText(finAnalysis.plainText).then(() => alert('تم نسخ التقرير!'));
}

function copyFinancialAIReport() {
  if (!finAnalysis || !finAnalysis.aiReport) { alert('لا توجد نتيجة تحليل. اضغط تحليل أولاً'); return; }
  navigator.clipboard.writeText(finAnalysis.aiReport).then(() => alert('تم نسخ التقرير الكامل!'));
}

function exportFinancialCSV() {
  if (!finPageData || !finPageData.tables || finPageData.tables.length === 0) {
    alert('لا توجد بيانات للتصدير'); return;
  }
  let csv = '\uFEFF';
  finPageData.tables.forEach(table => {
    csv += table.headers.join(',') + '\n';
    table.rows.forEach(row => {
      csv += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });
    csv += '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elaraby_${finPageData.page?.id || 'unknown'}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportFinancialJSON() {
  if (!finPageData) { alert('لا توجد بيانات للتصدير'); return; }
  const blob = new Blob([JSON.stringify(finPageData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elaraby_${finPageData.page?.id || 'unknown'}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}