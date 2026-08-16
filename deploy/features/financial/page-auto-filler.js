// ==================== العربية CRM - محرك الأتمتة ====================
// ملء تلقائي للحقول والبحث في كل الصفحات المالية

function detectCurrentPage() {
  const url = window.location.href;
  const lowerUrl = url.toLowerCase();

  // كشف من URL أولاً
  for (const [id, page] of Object.entries(PAGE_REGISTRY)) {
    const pageKey = page.url.toLowerCase().replace('.aspx', '');
    if (lowerUrl.includes(pageKey)) {
      return page;
    }
  }

  // كشف من بنية الصفحة
  const headers = [];
  document.querySelectorAll('table tr th, table tr td').forEach(cell => {
    const t = cell.textContent.trim().toLowerCase();
    if (t) headers.push(t);
  });
  const headerStr = headers.join(' ');

  const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة', 'balance', 'الرصيد', 'doc. type', 'نوع المستند', 'billing. type', 'd/c', 'billing net value'];
  const sapMatches = sapKeywords.filter(kw => headerStr.includes(kw)).length;
  if (sapMatches >= 3) {
    return PAGE_REGISTRY.accountMovementSAP;
  }

  // كشف من عناصر الصفحة
  const hasPassword = document.querySelector('input[type="password"]') !== null;
  const hasDateFrom = document.getElementById('ContentPlaceHolder1_TextBox1') !== null;
  const hasSearchBtn = document.getElementById('ContentPlaceHolder1_Button1') !== null;

  if (hasPassword && hasDateFrom) {
    const passwordLabel = document.querySelector('td')?.textContent?.includes('الرقم السرى') ? 'الرقم السرى' : 'كلمة السر';
    if (passwordLabel === 'الرقم السرى') {
      return PAGE_REGISTRY.billingneeded;
    }
    return PAGE_REGISTRY.accountMovement;
  }

  if (hasDateFrom && !hasPassword) {
    const dropDown = document.getElementById('ContentPlaceHolder1_DropDownList1');
    if (dropDown) {
      const selectedValue = dropDown.value;
      if (selectedValue === 'Amal') return PAGE_REGISTRY.inprogress;
      if (selectedValue === 'ASC') return PAGE_REGISTRY.inasc;
    }
    return PAGE_REGISTRY.inprogress;
  }

  if (hasSearchBtn && !hasDateFrom && !hasPassword) {
    const hasYearSelect = document.getElementById('ContentPlaceHolder1_DropDownList3') !== null;
    if (hasYearSelect) return PAGE_REGISTRY.salaryasc2;
    return PAGE_REGISTRY.autoBuildWR;
  }

  return null;
}

function fillField(fieldId, value) {
  const el = document.getElementById(fieldId);
  if (!el) return false;

  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function fillDates(fromDate, toDate) {
  let filled = 0;

  const fromInput = document.getElementById('ContentPlaceHolder1_TextBox1');
  const toInput = document.getElementById('ContentPlaceHolder1_TextBox2');

  if (fromInput && fromInput.type === 'date') {
    fromInput.value = fromDate;
    fromInput.dispatchEvent(new Event('input', { bubbles: true }));
    fromInput.dispatchEvent(new Event('change', { bubbles: true }));
    filled++;
  }

  if (toInput && toInput.type === 'date') {
    toInput.value = toDate;
    toInput.dispatchEvent(new Event('input', { bubbles: true }));
    toInput.dispatchEvent(new Event('change', { bubbles: true }));
    filled++;
  }

  return filled;
}

function fillPassword(password) {
  const pwInput = document.querySelector('input[type="password"]');
  if (!pwInput) return false;

  pwInput.value = password;
  pwInput.dispatchEvent(new Event('input', { bubbles: true }));
  pwInput.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function clickSearchButton() {
  const buttons = document.querySelectorAll('input[type="submit"]');
  for (const btn of buttons) {
    if (btn.value === 'بحث' || btn.value.includes('بحث')) {
      btn.click();
      return true;
    }
  }
  return false;
}

function clickExtractLink() {
  const link = document.getElementById('ContentPlaceHolder1_LinkButton1');
  if (link) {
    link.click();
    return true;
  }
  return false;
}

function clickExportButton() {
  const buttons = document.querySelectorAll('input[type="submit"]');
  for (const btn of buttons) {
    if (btn.value.includes('Export') || btn.value.includes('استخراج') || btn.value.includes('Excel')) {
      btn.click();
      return true;
    }
  }
  return false;
}

function autoSearchPage(pageId, options = {}) {
  const page = PAGE_REGISTRY[pageId];
  if (!page) return { success: false, error: 'صفحة غير معروفة' };

  const {
    fromDate = getDateStr(-30),
    toDate = getDateStr(0),
    password = PASSWORDS[pageId] || '',
    clickSearch = true
  } = options;

  const results = { filled: [], errors: [] };

  if (page.hasDateFilter) {
    const filled = fillDates(fromDate, toDate);
    results.filled.push(`${filled} حقل تاريخ`);
  }

  if (page.needsPassword && password) {
    const filled = fillPassword(password);
    if (filled) results.filled.push('كلمة السر');
    else results.errors.push('لم يتم العثور على حقل كلمة السر');
  }

  if (page.fields) {
    for (const [key, field] of Object.entries(page.fields)) {
      if (field.type === 'select' && field.defaultValue) {
        const filled = fillField(field.id, field.defaultValue);
        if (filled) results.filled.push(field.label);
      }
    }
  }

  if (clickSearch) {
    const clicked = clickSearchButton();
    if (clicked) results.filled.push('زر البحث');
    else results.errors.push('لم يتم العثور على زر البحث');
  }

  return {
    success: results.errors.length === 0,
    page: page.name,
    filled: results.filled,
    errors: results.errors
  };
}

function getDateStr(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}
