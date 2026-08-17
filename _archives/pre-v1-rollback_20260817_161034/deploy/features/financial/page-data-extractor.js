// ==================== العربية CRM - مستخرج البيانات الموحد ====================
// استخراج البيانات من أي صفحة مالية

function extractAllPageData() {
  const page = detectCurrentPage();

  const data = {
    url: window.location.href,
    title: document.title,
    page: page ? { id: page.id, name: page.name, type: page.type } : null,
    accountNumber: extractAccountNumber(),
    accountName: extractAccountName(),
    tables: extractTables(),
    inputs: extractInputs(),
    buttons: extractButtons(),
    selects: extractSelects(),
    errors: extractErrors(),
    timestamp: new Date().toISOString()
  };

  return data;
}

function extractAccountNumber() {
  const selectors = [
    '#ctl00_ContentPlaceHolder1_txtAccountNo',
    '#ctl00_ContentPlaceHolder1_txtaccno',
    '#ContentPlaceHolder1_lblaccount',
    '#ContentPlaceHolder1_Label1',
    'input[id*="AccountNo"]', 'input[id*="accountNo"]', 'input[id*="accno"]',
    'input[id*="Account"]', 'input[name*="Account"]'
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const val = (el.value || el.textContent || '').trim();
        if (val && val !== 'Edit' && val !== '.' && val.length > 2) {
          return val;
        }
      }
    } catch (e) {}
  }

  const allText = document.body.innerText;
  const accMatch = allText.match(/(?:رقم\s*(?:الحساب|العميل|حساب المركز)|Account\s*(?:No|Number|ID))[\s:]*([0-9]{6,})/i);
  if (accMatch) return accMatch[1];

  const accMatch2 = allText.match(/\b(200\d{7})\b/);
  return accMatch2 ? accMatch2[1] : '';
}

function extractAccountName() {
  const selectors = [
    '#ctl00_ContentPlaceHolder1_txtAccountName',
    '#ctl00_ContentPlaceHolder1_txtaccname',
    '#ContentPlaceHolder1_lblnameasc',
    'input[id*="AccountName"]', 'input[id*="accountName"]', 'input[id*="accname"]',
    'input[id*="Name"]', 'input[name*="Name"]'
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const val = (el.value || el.textContent || '').trim();
        if (val && val !== 'Edit' && val !== '.' && val.length > 2) {
          return val;
        }
      }
    } catch (e) {}
  }

  const allText = document.body.innerText;
  const nameMatch = allText.match(/(?:اسم\s*(?:الحساب|العميل|مركز))[\s:]*([^\n]+)/i);
  return nameMatch ? nameMatch[1].trim() : '';
}

function extractTables() {
  const tables = [];

  document.querySelectorAll('table').forEach((table, index) => {
    if (table.rows.length < 2) return;

    const headers = [];
    const headerRow = table.querySelector('tr');
    if (headerRow) {
      headerRow.querySelectorAll('th, td').forEach(cell => {
        const text = cell.textContent.trim();
        if (text && text.length > 1 && text.length < 80 && text !== 'Edit') {
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

  return tables;
}

function extractInputs() {
  const inputs = [];
  document.querySelectorAll('input:not([type="hidden"])').forEach(el => {
    inputs.push({
      id: el.id,
      name: el.name,
      type: el.type,
      value: el.value,
      placeholder: el.placeholder || ''
    });
  });
  return inputs;
}

function extractButtons() {
  const buttons = [];
  document.querySelectorAll('input[type="submit"], input[type="button"], button[type="submit"]').forEach(btn => {
    buttons.push({
      id: btn.id,
      name: btn.name,
      value: btn.value || btn.textContent.trim(),
      type: btn.type
    });
  });
  return buttons;
}

function extractSelects() {
  const selects = [];
  document.querySelectorAll('select').forEach(sel => {
    const options = [];
    sel.querySelectorAll('option').forEach(opt => {
      options.push({ value: opt.value, text: opt.textContent.trim(), selected: opt.selected });
    });
    selects.push({
      id: sel.id,
      name: sel.name,
      options: options
    });
  });
  return selects;
}

function extractErrors() {
  const errors = [];
  document.querySelectorAll('span').forEach(span => {
    const text = span.textContent.trim();
    if (text.includes('Does Not Exist') || text.includes('Error') || text.includes('Entity')) {
      errors.push(text);
    }
  });
  return errors;
}

function getMainTable() {
  const tables = extractTables();
  let mainTable = null;
  let maxRows = 0;

  tables.forEach(table => {
    if (table.rowCount > maxRows && table.colCount > 5) {
      maxRows = table.rowCount;
      mainTable = table;
    }
  });

  return mainTable;
}

function getTableInfo() {
  const tables = extractTables();
  return tables.map(t => ({
    index: t.index,
    id: t.id,
    headers: t.headers,
    rowCount: t.rowCount,
    colCount: t.colCount,
    sampleRow: t.rows[0] || []
  }));
}
