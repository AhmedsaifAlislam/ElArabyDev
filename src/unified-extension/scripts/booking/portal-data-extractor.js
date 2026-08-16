// =============================================================
// 🔧 سكريبت سحب بيانات العملاء من بورتال العربي
// =============================================================
// ⚠️ مهم: لا تحدث الصفحة! شغّل السكريبت ده في Console المتصفح
// الطريقة: F12 → Console → الصق الكود → Enter
// =============================================================

(function ElarabyPortalDataExtractor() {
  'use strict';

  console.log('%c🔍 بدء سحب البيانات من بورتال العربي...', 'color: #00bcd4; font-size: 16px; font-weight: bold;');

  // ============================================
  // الطريقة 1: سحب البيانات من جدول HTML الظاهر
  // ============================================
  function extractFromTable() {
    // البحث عن جداول الصفحة
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) {
      console.warn('⚠️ لم يتم العثور على جداول في الصفحة');
      return null;
    }

    const results = [];

    tables.forEach((table, tableIndex) => {
      // سحب الهيدر
      const headers = [];
      const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td');
      headerCells.forEach(cell => {
        headers.push(cell.innerText.trim());
      });

      // لو مفيش هيدر، نجرب أول صف
      if (headers.length === 0) {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          firstRow.querySelectorAll('td, th').forEach(cell => {
            headers.push(cell.innerText.trim());
          });
        }
      }

      console.log(`📋 جدول ${tableIndex + 1} — عدد الأعمدة: ${headers.length}`);
      console.log('📌 أسماء الأعمدة:', headers);

      // سحب الصفوف
      const rows = table.querySelectorAll('tbody tr, tr');
      let dataRows = [];

      rows.forEach((row, rowIndex) => {
        // تخطي صف الهيدر
        if (rowIndex === 0 && row.querySelector('th')) return;

        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        const rowData = {};
        cells.forEach((cell, cellIndex) => {
          const headerName = headers[cellIndex] || `عمود_${cellIndex + 1}`;
          rowData[headerName] = cell.innerText.trim();
        });

        // البحث عن أي حقل يحتوي على رقم هاتف أو رقم عميل
        const fullRowText = row.innerText;
        const phoneNumbers = fullRowText.match(/01[0-9]{9}/g) || [];
        const sapNumbers = fullRowText.match(/7[0-9]{8}/g) || [];
        const casNumbers = fullRowText.match(/CAS\d+/g) || [];

        if (phoneNumbers.length > 0) rowData['__أرقام_هاتف_مكتشفة'] = phoneNumbers.join(', ');
        if (sapNumbers.length > 0) rowData['__أرقام_SAP_مكتشفة'] = sapNumbers.join(', ');
        if (casNumbers.length > 0) rowData['__رقم_الطلب'] = casNumbers.join(', ');

        dataRows.push(rowData);
      });

      if (dataRows.length > 0) {
        results.push({
          tableIndex: tableIndex + 1,
          headers: headers,
          data: dataRows,
          rowCount: dataRows.length
        });
      }
    });

    return results;
  }

  // ============================================
  // الطريقة 2: البحث في كل عناصر الصفحة عن أرقام
  // ============================================
  function deepSearchForNumbers() {
    console.log('%c🔎 بحث عميق عن أرقام العملاء في كل عناصر الصفحة...', 'color: #ff9800; font-size: 14px;');

    const allElements = document.querySelectorAll('*');
    const phoneNumbers = new Set();
    const sapNumbers = new Set();
    const customerData = [];

    allElements.forEach(el => {
      // فحص النصوص المباشرة فقط (بدون الأطفال)
      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ');

      if (!directText) return;

      // أرقام موبايل مصرية
      const phones = directText.match(/01[0-9]{9}/g);
      if (phones) phones.forEach(p => phoneNumbers.add(p));

      // أرقام SAP (عادة 9 أرقام تبدأ بـ 7)
      const saps = directText.match(/\b7[0-9]{8}\b/g);
      if (saps) saps.forEach(s => sapNumbers.add(s));
    });

    return {
      phoneNumbers: Array.from(phoneNumbers),
      sapNumbers: Array.from(sapNumbers),
      totalPhones: phoneNumbers.size,
      totalSAP: sapNumbers.size
    };
  }

  // ============================================
  // الطريقة 3: فحص الـ DOM المخفي (overflow/scroll)
  // ============================================
  function findHiddenColumns() {
    console.log('%c📐 البحث عن أعمدة مخفية بالسكرول...', 'color: #9c27b0; font-size: 14px;');

    const scrollContainers = [];
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
          style.overflowX === 'hidden' || el.scrollWidth > el.clientWidth) {
        if (el.scrollWidth > el.clientWidth + 10) { // فرق أكبر من 10px
          scrollContainers.push({
            element: el,
            tagName: el.tagName,
            className: el.className,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            hiddenWidth: el.scrollWidth - el.clientWidth
          });
        }
      }
    });

    // محاولة سكرول كل container لكشف المحتوى المخفي
    scrollContainers.forEach(container => {
      console.log(`📦 عنصر مخفي: ${container.tagName}.${container.className} — محتوى مخفي: ${container.hiddenWidth}px`);

      // حفظ موقع السكرول الحالي
      const originalScroll = container.element.scrollLeft;

      // سكرول لأقصى اليسار (للعربي = يمين) لكشف الأعمدة المخفية
      container.element.scrollLeft = container.element.scrollWidth;

      // قراءة المحتوى بعد السكرول
      const hiddenData = container.element.innerText;
      const phones = hiddenData.match(/01[0-9]{9}/g) || [];
      const saps = hiddenData.match(/\b7[0-9]{8}\b/g) || [];

      if (phones.length > 0 || saps.length > 0) {
        console.log(`  ✅ أرقام هاتف مكتشفة: ${phones.length}, أرقام SAP: ${saps.length}`);
      }

      // إرجاع السكرول لمكانه الأصلي
      container.element.scrollLeft = originalScroll;
    });

    return scrollContainers;
  }

  // ============================================
  // الطريقة 4: فحص طلبات الشبكة المُخزنة (XHR/Fetch)
  // ============================================
  function checkNetworkCache() {
    console.log('%c🌐 فحص بيانات الشبكة المُخزنة...', 'color: #2196f3; font-size: 14px;');

    // فحص performance entries للـ API calls
    const entries = performance.getEntriesByType('resource');
    const apiCalls = entries.filter(e =>
      e.name.includes('api') ||
      e.name.includes('data') ||
      e.name.includes('odata') ||
      e.name.includes('_api') ||
      e.name.includes('webapi')
    );

    console.log(`📡 طلبات API مكتشفة: ${apiCalls.length}`);
    apiCalls.forEach(call => {
      console.log(`  → ${call.name.substring(0, 120)}...`);
    });

    return apiCalls;
  }

  // ============================================
  // الطريقة 5: فحص Power Apps specific data
  // ============================================
  function checkPowerAppsData() {
    console.log('%c⚡ فحص بيانات Power Apps...', 'color: #e91e63; font-size: 14px;');

    const paData = {};

    // فحص المتغيرات العامة التي قد تحتوي على بيانات
    if (window.Microsoft && window.Microsoft.Dynamic365) {
      paData.dynamics365 = 'موجود';
    }

    // فحص shell object
    if (window.shell) {
      paData.shell = typeof window.shell;
    }

    // فحص AJAX requests cache
    if (window.jQuery && window.jQuery.ajaxSettings) {
      paData.jqueryAjax = 'موجود';
    }

    // فحص الـ data attributes على عناصر الجدول
    const dataElements = document.querySelectorAll('[data-entity], [data-id], [data-name], [data-value]');
    const entityData = [];
    dataElements.forEach(el => {
      entityData.push({
        entity: el.getAttribute('data-entity'),
        id: el.getAttribute('data-id'),
        name: el.getAttribute('data-name'),
        value: el.getAttribute('data-value'),
        text: el.innerText.substring(0, 100)
      });
    });

    paData.entityElements = entityData;

    // فحص Liquid/Web API endpoints
    const links = document.querySelectorAll('a[href*="api"], a[href*="odata"]');
    paData.apiLinks = Array.from(links).map(l => l.href);

    return paData;
  }

  // ============================================
  // تحويل البيانات لـ CSV
  // ============================================
  function convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      // BOM for Arabic support in Excel
      '\uFEFF' + headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          let val = (row[h] || '').toString();
          // Escape quotes and commas
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  // ============================================
  // تحميل CSV
  // ============================================
  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`✅ تم تحميل الملف: ${filename}`);
  }

  // ============================================
  // عرض النتائج في جدول Console
  // ============================================
  function displayResults(tableData, deepSearch) {
    console.log('\n%c' + '═'.repeat(60), 'color: #4caf50;');
    console.log('%c📊 نتائج السحب', 'color: #4caf50; font-size: 18px; font-weight: bold;');
    console.log('%c' + '═'.repeat(60), 'color: #4caf50;');

    if (tableData && tableData.length > 0) {
      tableData.forEach(table => {
        console.log(`\n%c📋 جدول ${table.tableIndex} — ${table.rowCount} صف`, 'color: #2196f3; font-size: 14px;');
        console.table(table.data);
      });
    }

    console.log('\n%c🔢 ملخص الأرقام المكتشفة:', 'color: #ff9800; font-size: 14px;');
    console.log(`  📱 أرقام هاتف: ${deepSearch.totalPhones}`, deepSearch.phoneNumbers);
    console.log(`  🏷️ أرقام SAP: ${deepSearch.totalSAP}`, deepSearch.sapNumbers);
  }

  // ============================================
  // التشغيل الرئيسي
  // ============================================
  try {
    // 1. سحب من الجدول
    const tableData = extractFromTable();

    // 2. بحث عميق
    const deepSearch = deepSearchForNumbers();

    // 3. كشف الأعمدة المخفية
    const hiddenCols = findHiddenColumns();

    // 4. فحص الشبكة
    const networkData = checkNetworkCache();

    // 5. فحص Power Apps
    const paData = checkPowerAppsData();

    // عرض النتائج
    displayResults(tableData, deepSearch);

    // حفظ النتائج في متغير عام للوصول السهل
    window.__ELARABY_DATA = {
      tables: tableData,
      deepSearch: deepSearch,
      hiddenColumns: hiddenCols,
      networkCalls: networkData,
      powerAppsData: paData,
      timestamp: new Date().toISOString()
    };

    console.log('\n%c💾 البيانات محفوظة في: window.__ELARABY_DATA', 'color: #4caf50; font-size: 14px;');
    console.log('%c   يمكنك الوصول إليها في Console بكتابة: __ELARABY_DATA', 'color: #888;');

    // تصدير CSV تلقائي لو فيه بيانات
    if (tableData && tableData.length > 0 && tableData[0].data.length > 0) {
      const csvData = convertToCSV(tableData[0].data);
      // لا نحمل تلقائيا — المستخدم يختار
      window.__ELARABY_DOWNLOAD_CSV = function() {
        downloadCSV(csvData, `elaraby_data_${new Date().toISOString().slice(0,10)}.csv`);
      };
      console.log('%c📥 لتحميل CSV اكتب: __ELARABY_DOWNLOAD_CSV()', 'color: #e91e63; font-size: 14px;');
    }

    console.log('\n%c' + '═'.repeat(60), 'color: #4caf50;');
    console.log('%c✅ اكتمل السحب بنجاح!', 'color: #4caf50; font-size: 16px; font-weight: bold;');
    console.log('%c' + '═'.repeat(60), 'color: #4caf50;');

  } catch (error) {
    console.error('❌ خطأ أثناء السحب:', error);
  }

})();
