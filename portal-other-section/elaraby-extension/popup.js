// ==================== العربية CRM - Popup Script ====================

let currentPageData = null;
let currentAnalysisResult = null;

// ==================== التهيئة ====================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initButtons();
  loadPageData();
});

// ==================== التبويبات ====================
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ==================== الأزرار ====================
function initButtons() {
  document.getElementById('btn-refresh').addEventListener('click', loadPageData);
  document.getElementById('btn-analyze').addEventListener('click', analyzeData);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-copy-report').addEventListener('click', copyReport);
}

// ==================== تحميل بيانات الصفحة ====================
async function loadPageData() {
  showStatus('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showStatus('error', 'لا يوجد تبويب نشط');
      return;
    }

    console.log('[Elaraby] Active tab URL:', tab.url);

    const isPortal = tab.url && (
      tab.url.includes('elarabyiscrm2.azurewebsites.net') ||
      tab.url.includes('elarabyportalpfs.powerappsportals.com')
    );

    if (!isPortal) {
      showStatus('warning', 'الصفحة ليست بوابة العربية');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData
    });

    console.log('[Elaraby] executeScript results:', results);

    if (results && results[0] && results[0].result) {
      currentPageData = results[0].result;
      console.log('[Elaraby] Page data loaded:', {
        pageType: currentPageData.pageType,
        accountNumber: currentPageData.accountNumber,
        tables: currentPageData.tableCount
      });
      showStatus('success', 'تم تحميل البيانات');
      updateOverviewUI(currentPageData);
    } else {
      showStatus('error', 'فشل في استخراج البيانات');
    }

  } catch (error) {
    console.error('[Elaraby] Error:', error);
    showStatus('error', 'خطأ: ' + error.message);
  }
}

// ==================== الدالة المحقنة لاستخراج البيانات ====================
function extractPageData() {
  const url = window.location.href;
  const lowerUrl = url.toLowerCase();

  console.log('[Elaraby Extension] URL:', url);

  // ─── 1) كشف نوع الصفحة ───
  function detectPageType() {
    const pageChecks = [
      { keywords: ['accountmentsap', 'accountment-sap', 'accountment_sap', 'accountmovement_sap'], type: 'accountMovementSAP', name: 'حركات الحساب SAP' },
      { keywords: ['accountment', 'account-ment', 'account_movement', 'accountmovement'], type: 'accountMovement', name: 'حركات الحساب' },
      { keywords: ['mainmoney', 'main-money', 'main_menu', 'mainmenu'], type: 'mainMenu', name: 'القائمة الرئيسية' },
      { keywords: ['inprogress', 'in-progress', 'in_progress'], type: 'inProgress', name: 'جاري مراجعتها' },
      { keywords: ['inasc', 'in-asc'], type: 'inASC', name: 'متوقف احتسابها' },
      { keywords: ['salaryasc2', 'salary-asc2', 'salary_asc2'], type: 'salaryASC2', name: 'مستحقات المراكز' },
      { keywords: ['salaryasc', 'salary-asc', 'salary_asc'], type: 'salaryASC', name: 'Call-Center خارج الضمان' },
      { keywords: ['mscreport', 'msc-report', 'msc_report'], type: 'mscReport', name: 'حوافز الفنيين' },
      { keywords: ['billingneeded', 'billing-needed', 'billing_needed'], type: 'billingNeeded', name: 'الفواتير المطلوبة' },
      { keywords: ['autobuildwr', 'auto-build-wr', 'auto_buildwr'], type: 'autoBuildWR', name: 'إصدار فاتورة' },
      { keywords: ['fawry'], type: 'fawry', name: 'طلبات المدفوعات' },
      { keywords: ['financialreceipt', 'financial-receipt', 'financial_receipt'], type: 'financialReceipt', name: 'ايصالات المدفوعات' }
    ];

    let detected = null;
    for (const check of pageChecks) {
      for (const kw of check.keywords) {
        if (lowerUrl.includes(kw)) {
          detected = { type: check.type, name: check.name };
          console.log('[Elaraby] Page type detected from URL:', check.type);
          break;
        }
      }
      if (detected) break;
    }

    if (detected && detected.type === 'accountMovement') {
      if (isSAPTable()) {
        console.log('[Elaraby] accountMovement upgraded to accountMovementSAP (SAP columns found)');
        return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
      }
    }

    if (detected) return detected;

    console.log('[Elaraby] No URL match, trying table-based detection...');
    return detectPageTypeFromTable();
  }

  // ─── 1ب) فحص إذا الجدول يحتوي أعمدة SAP ───
  function isSAPTable() {
    const allHeaders = [];
    document.querySelectorAll('table tr th, table tr td').forEach(cell => {
      const t = cell.textContent.trim().toLowerCase();
      if (t) allHeaders.push(t);
    });
    const headerStr = allHeaders.join(' ');
    const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type', 'd/c', 'billing net value'];
    const matches = sapKeywords.filter(kw => headerStr.includes(kw)).length;
    console.log('[Elaraby] SAP column check:', matches, 'matches out of', sapKeywords.length);
    return matches >= 3;
  }

  // ─── 1ب) كشف نوع الصفحة من بنية الجدول (خطة بديلة) ───
  function detectPageTypeFromTable() {
    const allHeaders = [];
    document.querySelectorAll('table tr').forEach(tr => {
      tr.querySelectorAll('th, td').forEach(cell => {
        const t = cell.textContent.trim().toLowerCase();
        if (t) allHeaders.push(t);
      });
    });

    const headerStr = allHeaders.join(' | ');
    console.log('[Elaraby] Table headers sample:', headerStr.substring(0, 300));

    const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة', 'material', 'المادة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type', 'd/c', 'billing net value', 'صافي'];
    const sapMatches = sapKeywords.filter(kw => headerStr.includes(kw)).length;

    if (sapMatches >= 4) {
      console.log('[Elaraby] Page type detected from table structure: accountMovementSAP (' + sapMatches + ' matches)');
      return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
    }

    return { type: 'unknown', name: 'صفحة غير معروفة' };
  }

  const pageInfo = detectPageType();

  // ─── 2) استخراج رقم واسم الحساب ───
  let accountNumber = '';
  let accountName = '';

  const inputSelectors = [
    '#ctl00_ContentPlaceHolder1_txtAccountNo',
    '#ctl00_ContentPlaceHolder1_txtAccountName',
    '#ctl00_ContentPlaceHolder1_txtaccno',
    '#ctl00_ContentPlaceHolder1_txtaccname',
    'input[id*="AccountNo"]', 'input[id*="accountNo"]', 'input[id*="accno"]',
    'input[id*="AccountName"]', 'input[id*="accountName"]', 'input[id*="accname"]',
    'input[name*="Account"]', 'input[name*="account"]',
    'input[id*="txtAcc"]', 'input[name*="txtAcc"]',
    'input[id*="AccNo"]', 'input[id*="AccName"]'
  ];

  inputSelectors.forEach(sel => {
    try {
      const el = document.querySelector(sel);
      if (el && el.value && el.value.trim() && el.value.trim() !== 'Edit' && el.value.trim().length > 2) {
        const val = el.value.trim();
        const selLower = sel.toLowerCase();
        if (selLower.includes('name') || selLower.includes('accname')) {
          if (!accountName) accountName = val;
        } else {
          if (!accountNumber) accountNumber = val;
        }
      }
    } catch (e) {}
  });

  document.querySelectorAll('table tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim().toLowerCase();
      const value = cells[1].textContent.trim();
      if (value === 'Edit' || value.length < 2) return;

      if ((label.includes('account') || label.includes('حساب')) && (label.includes('no') || label.includes('number') || label.includes('رقم'))) {
        if (!accountNumber && value) accountNumber = value;
      }
      if ((label.includes('account') || label.includes('حساب')) && label.includes('name')) {
        if (!accountName && value) accountName = value;
      }
      if ((label.includes('اسم') || label.includes('name')) && !label.includes('account') && value && value !== 'Edit') {
        if (!accountName) accountName = value;
      }
      if ((label.includes('رقم') || label.includes('no')) && !label.includes('اسم') && value && value.length >= 6) {
        if (!accountNumber) accountNumber = value;
      }
    }
  });

  if (!accountNumber) {
    const allText = document.body.innerText;
    const accMatch = allText.match(/(?:رقم\s*(?:الحساب|العميل)|Account\s*(?:No|Number|ID))[\s:]*([0-9]{6,})/i);
    if (accMatch) accountNumber = accMatch[1];
  }

  if (!accountNumber) {
    const allText = document.body.innerText;
    const accMatch2 = allText.match(/\b(200\d{7})\b/);
    if (accMatch2) accountNumber = accMatch2[1];
  }

  console.log('[Elaraby] Account:', accountNumber, '| Name:', accountName);

  // ─── 3) استخراج الجداول ───
  const tables = [];
  document.querySelectorAll('table').forEach((table, index) => {
    if (table.rows.length < 2) return;

    const headers = [];
    const headerRow = table.querySelector('tr');
    if (headerRow) {
      headerRow.querySelectorAll('th, td').forEach(cell => {
        const text = cell.textContent.trim();
        if (text && text.length > 1 && text.length < 50 && text !== 'Edit') {
          headers.push(text);
        }
      });
    }

    const rows = [];
    table.querySelectorAll('tr').forEach((tr, rowIndex) => {
      if (rowIndex === 0) return;
      const cells = [];
      tr.querySelectorAll('td').forEach(td => {
        cells.push(td.textContent.trim());
      });
      if (cells.length > 0 && cells.some(c => c !== '' && c !== 'Edit')) {
        rows.push(cells);
      }
    });

    if (rows.length > 0) {
      tables.push({
        index: index,
        id: table.id || '',
        className: table.className || '',
        headers: headers,
        rows: rows,
        rowCount: rows.length,
        colCount: headers.length
      });
    }
  });

  console.log('[Elaraby] Tables found:', tables.length, tables.map(t => `${t.colCount}cols×${t.rowCount}rows`));

  const buttons = {
    totalButtons: document.querySelectorAll('button, input[type="submit"], input[type="button"]').length,
    totalLinks: document.querySelectorAll('a').length,
    totalInputs: document.querySelectorAll('input:not([type="hidden"]), select, textarea').length
  };

  return {
    url: url,
    title: document.title,
    pageType: pageInfo.type,
    pageName: pageInfo.name,
    accountNumber: accountNumber,
    accountName: accountName,
    tables: tables,
    tableCount: tables.length,
    buttonCount: buttons.totalButtons,
    linkCount: buttons.totalLinks,
    inputCount: buttons.totalInputs,
    timestamp: new Date().toISOString()
  };
}

// ==================== تحديث واجهة نظرة عامة ====================
function updateOverviewUI(data) {
  document.getElementById('info-page-type').textContent = data.pageName;
  document.getElementById('info-account').textContent = data.accountNumber || 'غير محدد';
  document.getElementById('info-name').textContent = data.accountName || 'غير محدد';
  document.getElementById('info-tables').textContent = `${data.tableCount} جدول (${data.tables.reduce((s,t) => s + t.rowCount, 0)} صف)`;

  if (data.pageType === 'unknown') {
    const debugInfo = `URL: ${data.url}\nTables: ${data.tableCount}\n` +
      data.tables.map(t => `Table ${t.index}: ${t.colCount} cols, ${t.rowCount} rows | Headers: ${t.headers.slice(0, 5).join(', ')}`).join('\n');
    console.log('[Elaraby] DEBUG - Unknown page type. Data:', debugInfo);

    const overviewTab = document.getElementById('tab-overview');
    let debugDiv = document.getElementById('debug-info');
    if (!debugDiv) {
      debugDiv = document.createElement('div');
      debugDiv.id = 'debug-info';
      debugDiv.className = 'section';
      debugDiv.style.cssText = 'background:#fff3e0;border:1px solid #ff9800;margin-top:10px;font-size:11px;white-space:pre-wrap;direction:ltr;text-align:left;';
      overviewTab.appendChild(debugDiv);
    }
    debugDiv.innerHTML = '<strong>Debug Info:</strong>\n' + debugInfo;
  }
}

// ==================== حالة الاتصال ====================
function showStatus(status, message) {
  const el = document.getElementById('connection-status');
  el.className = `status-${status}`;
  if (status === 'loading') {
    el.innerHTML = '<span class="spinner"></span> جاري الاتصال...';
  } else if (status === 'success') {
    el.innerHTML = `✅ ${message}`;
  } else if (status === 'warning') {
    el.innerHTML = `⚠️ ${message}`;
  } else if (status === 'error') {
    el.innerHTML = `❌ ${message}`;
  }
}

// ==================== التحليل ====================
function analyzeData() {
  if (!currentPageData) {
    alert('لا توجد بيانات. اضغط تحديث أولاً');
    return;
  }

  console.log('[Elaraby] analyzeData called. pageType:', currentPageData.pageType, 'tables:', currentPageData.tableCount);

  document.getElementById('btn-analyze').disabled = true;
  document.getElementById('btn-analyze').innerHTML = '<span class="spinner"></span> جاري التحليل...';

  try {
    const result = analyzeLocally(currentPageData);
    console.log('[Elaraby] Analysis result:', result ? 'OK' : 'NULL', result ? Object.keys(result) : 'none');
    currentAnalysisResult = result;
    displayDashboard(result);
    document.querySelectorAll('.tab')[1].click();
  } catch (error) {
    console.error('[Elaraby] Analysis error:', error);
    alert('خطأ في التحليل: ' + error.message);
  } finally {
    document.getElementById('btn-analyze').disabled = false;
    document.getElementById('btn-analyze').innerHTML = '🔍 تحليل البيانات';
  }
}

// ==================== عرض الداشبورد ====================
function displayDashboard(result) {
  console.log('[Elaraby] displayDashboard called:', result ? Object.keys(result) : 'null');

  if (result.summary && result.summary.cards) {
    const cardsHtml = result.summary.cards.map(card => `
      <div class="card ${card.type || ''}">
        <div class="card-label">${card.label}</div>
        <div class="card-value">${card.value}</div>
        ${card.sub ? `<div class="card-sub">${card.sub}</div>` : ''}
      </div>
    `).join('');
    console.log('[Elaraby] Rendering', result.summary.cards.length, 'cards');
    document.getElementById('summary-cards').innerHTML = cardsHtml;
  }

  if (result.bankTransfers) {
    document.getElementById('bank-transfers-content').innerHTML = result.bankTransfers;
  }

  if (result.damagedParts) {
    document.getElementById('damaged-parts-content').innerHTML = result.damagedParts;
  }

  if (result.partsAnalysis) {
    document.getElementById('parts-analysis-content').innerHTML = result.partsAnalysis;
  }

  if (result.alerts) {
    document.getElementById('alerts-content').innerHTML = result.alerts;
  }

  if (result.monthlyTrend) {
    document.getElementById('monthly-trend-content').innerHTML = result.monthlyTrend;
  }
}

// ==================== نسخ التقرير ====================
function copyReport() {
  if (!currentAnalysisResult || !currentAnalysisResult.plainText) {
    alert('لا توجد نتيجة تحليل. اضغط تحليل أولاً');
    return;
  }
  navigator.clipboard.writeText(currentAnalysisResult.plainText).then(() => {
    alert('تم نسخ التقرير!');
  });
}

// ==================== تصدير CSV ====================
function exportCSV() {
  if (!currentPageData || !currentPageData.tables || currentPageData.tables.length === 0) {
    alert('لا توجد بيانات للتصدير');
    return;
  }

  let csv = '\uFEFF';
  currentPageData.tables.forEach(table => {
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
  a.download = `elaraby_${currentPageData.pageType}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== تصدير JSON ====================
function exportJSON() {
  if (!currentPageData) {
    alert('لا توجد بيانات للتصدير');
    return;
  }

  const blob = new Blob([JSON.stringify(currentPageData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elaraby_${currentPageData.pageType}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
