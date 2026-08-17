/**
 * financial/scraper.js — مستخرج بيانات الصفحات المالية (CRM)
 * منقول من portal-other-section/elaraby-extension/popup.js (extractPageData)
 * يعمل في content scripts على elarabyiscrm2.azurewebsites.net/ASPPage/*
 * يوفّر: FinanceScraper.extract() -> pageData
 */
(function(global) {
  'use strict';
  if (global.__elarabyFinanceScraperLoaded) return;
  global.__elarabyFinanceScraperLoaded = true;

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

    const url = window.location.href;
    const lowerUrl = url.toLowerCase();
    let detected = null;
    for (const check of pageChecks) {
      for (const kw of check.keywords) {
        if (lowerUrl.includes(kw)) {
          detected = { type: check.type, name: check.name };
          break;
        }
      }
      if (detected) break;
    }

    if (detected && detected.type === 'accountMovement') {
      if (isSAPTable()) {
        return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
      }
    }

    if (detected) return detected;
    return detectPageTypeFromTable();
  }

  function isSAPTable() {
    const allHeaders = [];
    document.querySelectorAll('table tr th, table tr td').forEach(cell => {
      const t = cell.textContent.trim().toLowerCase();
      if (t) allHeaders.push(t);
    });
    const headerStr = allHeaders.join(' ');
    const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type', 'd/c', 'billing net value'];
    return sapKeywords.filter(kw => headerStr.includes(kw)).length >= 3;
  }

  function detectPageTypeFromTable() {
    const allHeaders = [];
    document.querySelectorAll('table tr').forEach(tr => {
      tr.querySelectorAll('th, td').forEach(cell => {
        const t = cell.textContent.trim().toLowerCase();
        if (t) allHeaders.push(t);
      });
    });
    const headerStr = allHeaders.join(' | ');
    const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة', 'material', 'المادة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type', 'd/c', 'billing net value', 'صافي'];
    if (sapKeywords.filter(kw => headerStr.includes(kw)).length >= 4) {
      return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
    }
    return { type: 'unknown', name: 'صفحة غير معروفة' };
  }

  function extract() {
    const url = window.location.href;
    const pageInfo = detectPageType();

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

    const tables = [];
    document.querySelectorAll('table').forEach((table, index) => {
      if (table.rows.length < 2) return;
      const headers = [];
      const headerRow = table.querySelector('tr');
      if (headerRow) {
        headerRow.querySelectorAll('th, td').forEach(cell => {
          const text = cell.textContent.trim();
          if (text && text.length > 1 && text.length < 50 && text !== 'Edit') headers.push(text);
        });
      }
      const rows = [];
      table.querySelectorAll('tr').forEach((tr, rowIndex) => {
        if (rowIndex === 0) return;
        const cells = [];
        tr.querySelectorAll('td').forEach(td => {
          cells.push(td.textContent.trim());
        });
        if (cells.length > 0 && cells.some(c => c !== '' && c !== 'Edit')) rows.push(cells);
      });
      if (rows.length > 0) {
        tables.push({
          index,
          id: table.id || '',
          className: table.className || '',
          headers,
          rows,
          rowCount: rows.length,
          colCount: headers.length
        });
      }
    });

    const buttons = {
      totalButtons: document.querySelectorAll('button, input[type="submit"], input[type="button"]').length,
      totalLinks: document.querySelectorAll('a').length,
      totalInputs: document.querySelectorAll('input:not([type="hidden"]), select, textarea').length
    };

    return {
      url,
      title: document.title,
      pageType: pageInfo.type,
      pageName: pageInfo.name,
      accountNumber,
      accountName,
      tables,
      tableCount: tables.length,
      buttonCount: buttons.totalButtons,
      linkCount: buttons.totalLinks,
      inputCount: buttons.totalInputs,
      timestamp: new Date().toISOString()
    };
  }

  global.FinanceScraper = { extract };
  console.log('[FinanceScraper] ✅ جاهز');

})(typeof globalThis !== 'undefined' ? globalThis : window);