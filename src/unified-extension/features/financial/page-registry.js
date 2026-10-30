// ==================== صفحة التسجيل المالي — كشف نوع الصفحة ====================
// محلية 100% — تُحقن داخل صفحة CRM للكشف عن نوع الصفحة المالية.

const FINANCIAL_PAGE_CHECKS = [
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

const SAP_KEYWORDS = [
  'posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة',
  'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type',
  'd/c', 'billing net value'
];

const SAP_TABLE_KEYWORDS = [
  'posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة',
  'material', 'المادة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند',
  'billing. type', 'd/c', 'billing net value', 'صافي'
];

function detectPageTypeFromURL(url) {
  const lowerUrl = String(url || '').toLowerCase();
  let detected = null;
  for (const check of FINANCIAL_PAGE_CHECKS) {
    for (const kw of check.keywords) {
      if (lowerUrl.includes(kw)) {
        detected = { type: check.type, name: check.name };
        break;
      }
    }
    if (detected) break;
  }

  if (detected && detected.type === 'accountMovement') {
    if (isSAPTablePresent()) {
      return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
    }
  }

  if (detected) return detected;

  return detectPageTypeFromTable();
}

function isSAPTablePresent() {
  const allHeaders = [];
  document.querySelectorAll('table tr th, table tr td').forEach(cell => {
    const t = cell.textContent.trim().toLowerCase();
    if (t) allHeaders.push(t);
  });
  const headerStr = allHeaders.join(' ');
  const matches = SAP_KEYWORDS.filter(kw => headerStr.includes(kw)).length;
  return matches >= 3;
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
  const sapMatches = SAP_TABLE_KEYWORDS.filter(kw => headerStr.includes(kw)).length;

  if (sapMatches >= 4) {
    return { type: 'accountMovementSAP', name: 'حركات الحساب SAP' };
  }

  return { type: 'unknown', name: 'صفحة غير معروفة' };
}