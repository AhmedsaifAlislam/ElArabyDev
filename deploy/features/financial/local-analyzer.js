// ==================== العربية CRM - محلل محاسبي متخصص ====================
// تحليل محاسبي تدقيقي لصاحب مركز خدمة صيانة

function analyzeLocally(pageData) {
  const tables = pageData.tables || [];
  const pageType = pageData.pageType;

  if (pageType === 'accountMovementSAP' || pageType === 'accountMovement') {
    return analyzeAccountMovementSAP(tables, pageData);
  }

  return analyzeGeneric(tables, pageData);
}

// ==================== تحليل حركات الحساب SAP ====================
function analyzeAccountMovementSAP(tables, pageData) {
  let mainTable = null;
  let maxRows = 0;

  tables.forEach(table => {
    if (table.rowCount > maxRows && table.colCount > 5) {
      maxRows = table.rowCount;
      mainTable = table;
    }
  });

  if (!mainTable) {
    return {
      summary: { cards: [{ label: 'الحالة', value: 'لا توجد بيانات', type: 'warning' }] },
      plainText: 'لا توجد بيانات كافية للتحليل'
    };
  }

  const headers = mainTable.headers.map(h => h.toLowerCase().trim());
  const colMap = mapColumns(headers);
  const parsedRows = parseRows(mainTable, colMap);

  const runningBalance = getRunningBalance(parsedRows);
  const bankTransfers = getBankTransfers(parsedRows);
  const damagedParts = getDamagedParts(parsedRows);
  const partsFrequency = getPartsFrequency(parsedRows);
  const priceChanges = getPriceChanges(parsedRows);
  const expensiveParts = getExpensiveParts(parsedRows);
  const docTypeStats = getDocTypeStats(parsedRows);
  const monthlyStats = getMonthlyStats(parsedRows);

  const totalTransfers = bankTransfers.reduce((sum, t) => sum + t.amount, 0);
  const totalDamaged = damagedParts.reduce((sum, p) => sum + p.amount, 0);

  const cards = [
    { label: 'الرصيد الحالي', value: formatEGP(Math.abs(runningBalance)), sub: runningBalance < 0 ? 'الشركة ليها عليك' : runningBalance > 0 ? 'أنت مدين للشركة' : 'الحساب متوازن', type: runningBalance < 0 ? 'positive' : runningBalance > 0 ? 'negative' : 'neutral' },
    { label: 'عدد الحركات', value: parsedRows.length.toString(), sub: 'حركة محاسبية', type: '' },
    { label: 'التحويلات البنكية', value: formatEGP(totalTransfers), sub: `${bankTransfers.length} تحويل من الشركة ليك`, type: 'positive' },
    { label: 'فواتير التالف', value: formatEGP(totalDamaged), sub: `${damagedParts.length} قطعة لم تُسلم`, type: 'negative' }
  ];

  const summaryHTML = `
    <div class="cards-grid">${cards.map(card => `
      <div class="card ${card.type}">
        <div class="card-label">${card.label}</div>
        <div class="card-value">${card.value}</div>
        ${card.sub ? `<div class="card-sub">${card.sub}</div>` : ''}
      </div>
    `).join('')}</div>
  `;

  const bankTransfersHTML = buildBankTransfersHTML(bankTransfers, totalTransfers);
  const damagedPartsHTML = buildDamagedPartsHTML(damagedParts, totalDamaged);
  const partsAnalysisHTML = buildPartsAnalysisHTML(partsFrequency, priceChanges, expensiveParts);
  const alertsHTML = buildAlertsHTML(damagedParts, expensiveParts, priceChanges, partsFrequency);
  const monthlyTrendHTML = buildMonthlyTrendHTML(monthlyStats);

  const plainText = buildPlainText(pageData, runningBalance, parsedRows.length, bankTransfers, totalTransfers, damagedParts, totalDamaged, partsFrequency, priceChanges, expensiveParts, docTypeStats);

  return {
    summary: { cards },
    bankTransfers: bankTransfersHTML,
    damagedParts: damagedPartsHTML,
    partsAnalysis: partsAnalysisHTML,
    alerts: alertsHTML,
    monthlyTrend: monthlyTrendHTML,
    plainText
  };
}

// ==================== تحليل عام ====================
function analyzeGeneric(tables, pageData) {
  let totalRows = 0;
  tables.forEach(table => { totalRows += table.rowCount; });

  return {
    summary: {
      cards: [
        { label: 'النوع', value: pageData.pageName || 'غير معروف', type: '' },
        { label: 'الحساب', value: pageData.accountNumber || 'غير محدد', type: '' },
        { label: 'الجداول', value: tables.length.toString(), type: '' },
        { label: 'الصفوف', value: totalRows.toString(), type: '' }
      ]
    },
    bankTransfers: '<div class="empty-state">لا توجد تحويلات في هذه الصفحة</div>',
    damagedParts: '<div class="empty-state">لا توجد فواتير تالف في هذه الصفحة</div>',
    partsAnalysis: '<div class="empty-state">لا توجد تحليلات قطع في هذه الصفحة</div>',
    alerts: '<div class="empty-state">لا توجد تنبيهات في هذه الصفحة</div>',
    monthlyTrend: '<div class="empty-state">لا توجد إحصائيات شهرية في هذه الصفحة</div>',
    plainText: `=== ${pageData.pageName || 'صفحة غير معروفة'} ===\nالحساب: ${pageData.accountNumber || 'غير محدد'}\nالجداول: ${tables.length}\nالصفوف: ${totalRows}`
  };
}

// ═══════════════════════════════════════════════════
// دوال التحليل
// ═══════════════════════════════════════════════════

function mapColumns(headers) {
  const map = {
    date: -1, postingDate: -1, docDate: -1,
    accountingDoc: -1, assignment: -1, text: -1,
    billingDoc: -1, billingItem: -1, material: -1,
    billedQuan: -1, dcInd: -1, billingNetValue: -1,
    amountDoc: -1, balanceDoc: -1, docCurr: -1,
    amountLoc: -1, balanceLoc: -1, localCurrency: -1,
    docType: -1, docTDesc: -1, billingType: -1,
    billingTDesc: -1, delivery: -1, salesOrder: -1,
    orderNo: -1, customerNo: -1, poNo: -1,
    customerName: -1, companyCode: -1, fiscalYear: -1,
    materialDesc: -1, netValue: -1
  };

  const keyMap = {
    'posting date': 'postingDate', 'تاريخ الترحيل': 'postingDate',
    'document date': 'docDate', 'تاريخ المستند': 'docDate',
    'accounting doc': 'accountingDoc', 'مستند محاسبي': 'accountingDoc',
    'assignment number': 'assignment', 'رقم التعيين': 'assignment',
    'text': 'text', 'النص': 'text',
    'billing doc': 'billingDoc', 'مستند الفوترة': 'billingDoc',
    'billing item': 'billingItem', 'بند الفوترة': 'billingItem',
    'material': 'material', 'المادة': 'material',
    'billed quan': 'billedQuan', 'الكمية': 'billedQuan',
    'd/c': 'dcInd', 'dc ind': 'dcInd', 'd/c ind': 'dcInd',
    'billing net value': 'billingNetValue', 'صافي قيمة الفوترة': 'billingNetValue',
    'amount doc': 'amountDoc', 'المبلغ بالعملة': 'amountDoc',
    'balance in doc': 'balanceDoc', 'الرصيد بالعملة': 'balanceDoc',
    'doc.curr': 'docCurr', 'عملة المستند': 'docCurr',
    'amount loc': 'amountLoc', 'المبلغ بالعملة المحلية': 'amountLoc',
    'balance in loc': 'balanceLoc', 'الرصيد بالعملة المحلية': 'balanceLoc',
    'local currency': 'localCurrency', 'العملة المحلية': 'localCurrency',
    'doc. type': 'docType', 'نوع المستند': 'docType',
    'doc.t desc': 'docTDesc', 'وصف نوع المستند': 'docTDesc',
    'billing. type': 'billingType', 'نوع الفوترة': 'billingType',
    'billing t desc': 'billingTDesc', 'وصف نوع الفوترة': 'billingTDesc',
    'delivery': 'delivery', 'التسليم': 'delivery',
    'sales order': 'salesOrder', 'طلب المبيعات': 'salesOrder',
    'order no': 'orderNo', 'رقم الطلب': 'orderNo',
    'customer no': 'customerNo', 'رقم العميل': 'customerNo',
    'po no': 'poNo', 'رقم أمر الشراء': 'poNo',
    'customer name': 'customerName', 'اسم العميل': 'customerName',
    'company code': 'companyCode', 'رمز الشركة': 'companyCode',
    'fiscal year': 'fiscalYear', 'السنة المالية': 'fiscalYear',
    'material description': 'materialDesc', 'وصف المادة': 'materialDesc',
    'net value': 'netValue', 'صافي القيمة': 'netValue'
  };

  headers.forEach((h, i) => {
    const normalized = h.toLowerCase().trim();
    for (const [key, field] of Object.entries(keyMap)) {
      if (normalized.includes(key) && map[field] === -1) {
        map[field] = i;
        break;
      }
    }
  });

  return map;
}

function parseRows(table, colMap) {
  const rows = [];
  const today = new Date();

  table.rows.forEach(row => {
    const amount = parseAmount(row[colMap.amountDoc]);
    const balance = parseAmount(row[colMap.balanceDoc]);
    const dc = colMap.dcInd >= 0 ? row[colMap.dcInd].trim().toUpperCase() : '';
    const docType = colMap.docType >= 0 ? row[colMap.docType].trim() : '';
    const docTDesc = colMap.docTDesc >= 0 ? row[colMap.docTDesc].trim() : '';
    const billingType = colMap.billingType >= 0 ? row[colMap.billingType].trim() : '';
    const billingTDesc = colMap.billingTDesc >= 0 ? row[colMap.billingTDesc].trim() : '';
    const postingDate = colMap.postingDate >= 0 ? row[colMap.postingDate].trim() : '';
    const docDate = colMap.docDate >= 0 ? row[colMap.docDate].trim() : '';
    const accountingDoc = colMap.accountingDoc >= 0 ? row[colMap.accountingDoc].trim() : '';
    const assignment = colMap.assignment >= 0 ? row[colMap.assignment].trim() : '';
    const text = colMap.text >= 0 ? row[colMap.text].trim() : '';
    const material = colMap.material >= 0 ? row[colMap.material].trim() : '';
    const materialDesc = colMap.materialDesc >= 0 ? row[colMap.materialDesc].trim() : '';
    const billedQuan = colMap.billedQuan >= 0 ? row[colMap.billedQuan].trim() : '';

    const dateStr = postingDate || docDate;
    const invDate = parseDate(dateStr);
    const daysDiff = invDate ? Math.floor((today - invDate) / (1000 * 60 * 60 * 24)) : 0;

    rows.push({
      amount, balance, dc, docType, docTDesc, billingType, billingTDesc,
      postingDate, docDate, accountingDoc, assignment, text,
      material, materialDesc, billedQuan, dateStr, invDate, daysDiff
    });
  });

  return rows;
}

function getRunningBalance(parsedRows) {
  if (parsedRows.length === 0) return 0;
  const lastRow = parsedRows[parsedRows.length - 1];
  return lastRow.balance !== null ? lastRow.balance : 0;
}

function getBankTransfers(parsedRows) {
  return parsedRows.filter(row => {
    if (row.docType === 'SU' || row.docType === 'su') {
      const desc = (row.text + ' ' + row.assignment + ' ' + row.docTDesc).toLowerCase();
      if (desc.includes('تحويل بنكي') || desc.includes('تحويل') || desc.includes('bank')) return true;
    }
    if (row.billingTDesc && (row.billingTDesc.includes('تحويل بنكي') || row.billingTDesc.includes('تحويل'))) return true;
    return false;
  }).map(row => ({
    date: row.postingDate || row.docDate,
    amount: Math.abs(row.amount || 0),
    doc: row.accountingDoc,
    desc: row.text || row.assignment || row.docTDesc || 'تحويل بنكي',
    type: row.docType
  }));
}

function getDamagedParts(parsedRows) {
  return parsedRows.filter(row => {
    const desc = (row.text + ' ' + row.assignment + ' ' + row.materialDesc + ' ' + row.docTDesc + ' ' + row.billingTDesc).toLowerCase();
    if (desc.includes('تالف') || desc.includes('لم يسلم') || desc.includes('لم يتم التسليم') || desc.includes('تالفه')) return true;
    if (row.billingType === 'L2' && desc.includes('تالف')) return true;
    if (row.docType === 'RV' && row.billingType === 'L2') {
      const text = (row.text + ' ' + row.materialDesc).toLowerCase();
      if (text.includes('تالف') || text.includes('لم يسلم') || text.includes('تايمر') || text.includes('مكثف') || text.includes('ثرموستات') || text.includes('سويلويد') || text.includes('بوردة') || text.includes('ريلاى') || text.includes('حساس') || text.includes('جوان') || text.includes('هيتر') || text.includes('فواني') || text.includes('خرطوم')) return true;
    }
    return false;
  }).map(row => ({
    date: row.postingDate || row.docDate,
    amount: Math.abs(row.amount || 0),
    doc: row.accountingDoc,
    material: row.material,
    desc: row.materialDesc || row.text || row.assignment || '',
    type: row.billingType || row.docType
  }));
}

function getPartsFrequency(parsedRows) {
  const freq = {};
  parsedRows.forEach(row => {
    if (row.material && row.material !== '000000' && row.material !== '') {
      const key = row.material;
      if (!freq[key]) {
        freq[key] = { material: row.material, desc: row.materialDesc || row.text || '', count: 0, totalAmount: 0, prices: new Set() };
      }
      freq[key].count++;
      freq[key].totalAmount += Math.abs(row.amount || 0);
      if (row.amount) freq[key].prices.add(Math.abs(row.amount));
    }
  });
  return Object.values(freq).sort((a, b) => b.count - a.count);
}

function getPriceChanges(parsedRows) {
  const priceMap = {};
  parsedRows.forEach(row => {
    if (row.material && row.material !== '000000' && row.material !== '' && row.amount) {
      const key = row.material;
      const price = Math.abs(row.amount);
      if (price <= 0) return;
      if (!priceMap[key]) {
        priceMap[key] = { material: row.material, desc: row.materialDesc || row.text || '', prices: {} };
      }
      priceMap[key].prices[price] = (priceMap[key].prices[price] || 0) + 1;
    }
  });
  return Object.values(priceMap).filter(item => Object.keys(item.prices).length > 1);
}

function getExpensiveParts(parsedRows) {
  const expensive = [];
  const seen = new Map();
  parsedRows.forEach(row => {
    if (row.amount && Math.abs(row.amount) >= 1000) {
      const key = `${row.material}_${row.amount}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        expensive.push({
          date: row.postingDate || row.docDate,
          amount: Math.abs(row.amount),
          material: row.material,
          desc: row.materialDesc || row.text || row.assignment || '',
          type: row.docType
        });
      }
    }
  });
  return expensive.sort((a, b) => b.amount - a.amount);
}

function getDocTypeStats(parsedRows) {
  const stats = {};
  parsedRows.forEach(row => {
    const type = row.docType || 'غير محدد';
    if (!stats[type]) stats[type] = { count: 0, total: 0, desc: row.docTDesc || '' };
    stats[type].count++;
    stats[type].total += Math.abs(row.amount || 0);
  });
  return stats;
}

function getMonthlyStats(parsedRows) {
  const stats = {};
  parsedRows.forEach(row => {
    const match = row.dateStr.match(/(\d{4})[-/](\d{2})/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      if (!stats[key]) stats[key] = { count: 0, total: 0 };
      stats[key].count++;
      stats[key].total += Math.abs(row.amount || 0);
    }
  });
  return stats;
}

// ═══════════════════════════════════════════════════
// دوال بناء HTML
// ═══════════════════════════════════════════════════

function buildBankTransfersHTML(transfers, total) {
  if (transfers.length === 0) {
    return '<div class="empty-state">لا توجد تحويلات بنكية</div>';
  }

  let html = `<div class="summary-bar">إجمالي التحويلات: <strong>${formatEGP(total)}</strong> | العدد: <strong>${transfers.length}</strong></div>`;
  html += '<table class="data-table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الوصف</th></tr></thead><tbody>';
  transfers.forEach(t => {
    html += `<tr><td>${t.date}</td><td class="amount">${formatEGP(t.amount)}</td><td>${t.desc}</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function buildDamagedPartsHTML(parts, total) {
  if (parts.length === 0) {
    return '<div class="empty-state">لا توجد فواتير تالف</div>';
  }

  let html = `<div class="summary-bar negative">إجمالي التالف: <strong>${formatEGP(total)}</strong> | العدد: <strong>${parts.length}</strong> قطعة</div>`;
  html += '<table class="data-table"><thead><tr><th>التاريخ</th><th>المادة</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>';
  parts.forEach(p => {
    html += `<tr><td>${p.date}</td><td>${p.material}</td><td>${p.desc}</td><td class="amount negative">${formatEGP(p.amount)}</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function buildPartsAnalysisHTML(frequency, priceChanges, expensive) {
  let html = '';

  if (frequency.length > 0) {
    html += '<h4>القطع الأكثر تكراراً</h4>';
    html += '<table class="data-table"><thead><tr><th>المادة</th><th>الوصف</th><th>العدد</th><th>الإجمالي</th></tr></thead><tbody>';
    frequency.filter(p => p.count >= 3).slice(0, 15).forEach(p => {
      html += `<tr><td>${p.material}</td><td>${p.desc}</td><td class="count">${p.count}</td><td>${formatEGP(p.totalAmount)}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  if (priceChanges.length > 0) {
    html += '<h4>تغير أسعار القطع</h4>';
    html += '<table class="data-table"><thead><tr><th>المادة</th><th>الوصف</th><th>الأسعار</th></tr></thead><tbody>';
    priceChanges.slice(0, 10).forEach(p => {
      const prices = Object.keys(p.prices).sort((a, b) => a - b);
      html += `<tr><td>${p.material}</td><td>${p.desc}</td><td class="price-change">${prices.map(pr => formatEGP(parseFloat(pr))).join(' ← ')}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  if (expensive.length > 0) {
    html += '<h4>القطع الغالية (>1000 ج.م)</h4>';
    html += '<table class="data-table"><thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>';
    expensive.slice(0, 10).forEach(p => {
      html += `<tr><td>${p.date}</td><td>${p.desc}</td><td class="amount">${formatEGP(p.amount)}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  if (!html) {
    html = '<div class="empty-state">لا توجد تحليلات قطع</div>';
  }

  return html;
}

function buildAlertsHTML(damagedParts, expensiveParts, priceChanges, frequency) {
  let html = '';

  if (damagedParts.length > 0) {
    const totalDamaged = damagedParts.reduce((sum, p) => sum + p.amount, 0);
    html += `<div class="alert alert-danger"><strong>فواتير التالف:</strong> ${damagedParts.length} قطعة بقيمة ${formatEGP(totalDamaged)} - يجب متابعة إرجاع القطع التالفة</div>`;
  }

  const veryExpensive = expensiveParts.filter(p => p.amount >= 5000);
  if (veryExpensive.length > 0) {
    html += `<div class="alert alert-warning"><strong>قطع غالية جداً:</strong> ${veryExpensive.length} قطعة بقيمة فوق 5000 ج.م - تأكد من تركيبها صح</div>`;
  }

  if (priceChanges.length > 0) {
    html += `<div class="alert alert-info"><strong>تغير أسعار:</strong> ${priceChanges.length} قطعة غير سعرها - راجع الشركة</div>`;
  }

  const highFreq = frequency.filter(p => p.count >= 5);
  if (highFreq.length > 0) {
    html += `<div class="alert alert-warning"><strong>تكرار عالي:</strong> ${highFreq.length} قطعة بتتكرر 5+ مرات - فكر في مخزون استراتيجي</div>`;
  }

  if (!html) {
    html = '<div class="alert alert-success">لا توجد تنبيهات حالياً</div>';
  }

  return html;
}

function buildMonthlyTrendHTML(monthlyStats) {
  const months = Object.entries(monthlyStats).sort().slice(-6);
  if (months.length === 0) {
    return '<div class="empty-state">لا توجد إحصائيات شهرية</div>';
  }

  let html = '<table class="data-table"><thead><tr><th>الشهر</th><th>الحركات</th><th>الإجمالي</th></tr></thead><tbody>';
  months.forEach(([month, stats]) => {
    html += `<tr><td>${getMonthName(month)}</td><td>${stats.count}</td><td>${formatEGP(stats.total)}</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

// ═══════════════════════════════════════════════════
// بناء التقرير النصي
// ═══════════════════════════════════════════════════

function buildPlainText(pageData, balance, totalRows, transfers, totalTransfers, damagedParts, totalDamaged, frequency, priceChanges, expensiveParts, docTypeStats) {
  let text = '';
  text += '╔══════════════════════════════════════╗\n';
  text += '║   مركز الخدمة: ' + (pageData.accountName || pageData.accountNumber || 'غير محدد') + '\n';
  text += '║   شركة العربي للصناعات والتوريدات\n';
  text += '╚══════════════════════════════════════╝\n\n';

  text += '💰 الرصيد الحالي: ' + formatEGP(Math.abs(balance)) + '\n';
  text += '   ' + (balance < 0 ? 'الشركة ليها عليك' : balance > 0 ? 'أنت مدين لل-company' : 'الحساب متوازن') + '\n\n';

  text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  text += '📊 ملخص الحساب:\n';
  text += '• إجمالي الحركات: ' + totalRows + '\n';
  text += '• آخر رصيد: ' + formatEGP(Math.abs(balance)) + '\n\n';

  if (transfers.length > 0) {
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '🏦 التحويلات البنكية (' + transfers.length + ' تحويل من الشركة ليك):\n';
    transfers.forEach(t => {
      text += '• ' + t.date + ': ' + formatEGP(t.amount) + '\n';
    });
    text += 'إجمالي التحويلات: ' + formatEGP(totalTransfers) + '\n\n';
  }

  if (damagedParts.length > 0) {
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '⚠️ فواتير التالف (لم يُسلم):\n';
    damagedParts.forEach(p => {
      text += '• ' + p.desc + ': ' + formatEGP(p.amount) + '\n';
    });
    text += 'إجمالي التالف: ' + formatEGP(totalDamaged) + '\n\n';
  }

  if (priceChanges.length > 0) {
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '🔄 تغير أسعار القطع:\n';
    priceChanges.slice(0, 8).forEach(p => {
      const prices = Object.keys(p.prices).sort((a, b) => a - b);
      text += '• ' + p.desc + ': ' + prices.map(pr => formatEGP(parseFloat(pr))).join(' ← ') + '\n';
    });
    text += '\n';
  }

  const highFreq = frequency.filter(p => p.count >= 3);
  if (highFreq.length > 0) {
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '📈 القطع الأكثر تكراراً (>3 مرات):\n';
    highFreq.slice(0, 10).forEach(p => {
      text += '• ' + p.desc + ': ' + p.count + ' مرة\n';
    });
    text += '\n';
  }

  if (expensiveParts.length > 0) {
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += '🔴 القطع الغالية (>1000 ج.م):\n';
    expensiveParts.slice(0, 8).forEach(p => {
      text += '• ' + p.desc + ': ' + formatEGP(p.amount) + '\n';
    });
    text += '\n';
  }

  return text;
}

// ═══════════════════════════════════════════════════
// دوال مساعدة
// ═══════════════════════════════════════════════════

function parseAmount(str) {
  if (!str) return null;
  let cleaned = str.replace(/,/g, '').trim();
  cleaned = cleaned.replace(/[-]$/, '');
  cleaned = cleaned.replace(/[^\d.\-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  if (str.trim().endsWith('-')) return -num;
  return num;
}

function parseDate(str) {
  if (!str) return null;
  const formats = [
    /(\d{4})[-/](\d{2})[-/](\d{2})/,
    /(\d{2})[-/](\d{2})[-/](\d{4})/,
  ];
  for (const format of formats) {
    const match = str.match(format);
    if (match) {
      let year, month, day;
      if (match[1].length === 4) {
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else {
        year = parseInt(match[3]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[1]);
      }
      return new Date(year, month, day);
    }
  }
  return null;
}

function formatEGP(amount) {
  const rounded = Math.round(amount);
  return rounded.toLocaleString('ar-EG') + ' ج.م';
}

function getMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const months = {
    '01': 'يناير', '02': 'فبراير', '03': 'مارس',
    '04': 'أبريل', '05': 'مايو', '06': 'يونيو',
    '07': 'يوليو', '08': 'أغسطس', '09': 'سبتمبر',
    '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر'
  };
  return `${months[month] || month} ${year}`;
}
