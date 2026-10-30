/**
 * portal-selectors.js — محددات DOM للبورتال الموحدة
 * Shared across all El Araby extensions
 * 
 * يجمع كل محددات DOM المستخدمة في البورتال في مكان واحد
 */

(function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyPortalSelectorsLoaded) return;
  window.__elarabyPortalSelectorsLoaded = true;

  /**
   * محددات PowerApps Portal
   */
  const POWERAPPS = {
    // الجداول (دائماً داخل iframes)
    table: {
      entityGrid: 'table.entity-grid',
      tableClass: 'table',
      tableStriped: 'table.table-striped.table-hover',
      headerRow: 'tr th',
      dataRows: 'tbody tr',
      cells: 'td'
    },
    
    // حقول الإدخال
    inputs: {
      textarea: '#ContentPlaceHolder1_TextBox1',
      dateFrom: '#ContentPlaceHolder1_TextBox1',
      dateTo: '#ContentPlaceHolder1_TextBox2',
      password: '#ContentPlaceHolder1_TextBox1',
      searchInput: '#ContentPlaceHolder1_TextBox1'
    },
    
    // القوائم المنسدلة
    selects: {
      reportType: '#ContentPlaceHolder1_DropDownList1',
      searchMethod: '#ContentPlaceHolder1_DropDownList2',
      year: '#ContentPlaceHolder1_DropDownList3',
      month: '#ContentPlaceHolder1_DropDownList4',
      status: '#ContentPlaceHolder1_DropDownList1'
    },
    
    // الأزرار
    buttons: {
      search: '#ContentPlaceHolder1_Button1',
      export: '#ContentPlaceHolder1_Button2',
      extract: '#ContentPlaceHolder1_Button2'
    },
    
    // الروابط
    links: {
      excelSheet: '#ContentPlaceHolder1_LinkButton1',
      extractAll: '#ContentPlaceHolder1_LinkButton1'
    },
    
    // عرض النتائج
    display: {
      panel: '#ContentPlaceHolder1_Panel1',
      gridView: '#ContentPlaceHolder1_GridView1',
      label: '#ContentPlaceHolder1_Label1',
      sapNo: '#ContentPlaceHolder1_lblsapno',
      userName: '#ContentPlaceHolder1_Label1'
    },

    // حقول Work Order Review (PowerApps) — المصدر: مساعد التقفيلات selectors.json
    fields: {
      serial: [
        '#ldv_serialnumber',
        '#ldv_technicalserialnumber',
        "[aria-label*='الرقم المسلسل']",
        "[aria-label*='مسلسل']",
        "[name*='serial']",
        "input[id*='serial']"
      ],
      serial2: [
        '#ldv_serialnumber1',
        "[aria-label*='الرقم المسلسل 2']",
        "[aria-label*='مسلسل 2']",
        "[name*='serialnumber1']"
      ],
      brandInput: [
        '#ats_producttypebrand_name',
        "input[aria-label='العلامة التجاريه']",
        "input[aria-label*='العلامة التجاريه']",
        "input[aria-label*='العلامة التجارية']",
        "input[aria-label*='العلامة']",
        "input[id*='brand']",
        "input[name*='brand']",
        "input[id*='Brand']"
      ],
      brandBtn: [
        "button[aria-label*='العلامة التجاريه Launch lookup modal']",
        "button[aria-label*='العلامة التجارية Launch lookup modal']",
        '.launchentitylookup',
        "button[aria-label*='Brand']",
        '.lookup-brand button'
      ],
      modelBtn: [
        "button[aria-label*='الموديل الفعلي Launch lookup modal']",
        "button[aria-label*='الموديل الفعلي 1 Launch lookup modal']",
        '.launchentitylookup',
        "button[aria-label*='Model']",
        '.lookup-model button'
      ],
      modelInput: [
        '#ldv_actualmodel_name',
        "input[aria-label='الموديل الفعلي 1']",
        "input[aria-label*='الموديل الفعلي']",
        "[name*='actualmodel']",
        "[name*='model']",
        "[id*='actualModel']"
      ],
      modelInput2: [
        '#ldv_actualmodel2_name',
        "input[aria-label='الموديل الفعلي 2']",
        "input[aria-label*='الموديل الفعلي 2']"
      ],
      statusSelect: [
        '#ldv_warrantystatus',
        "select[name*='warranty']",
        "select[aria-label*='Warranty']",
        "select[id*='warranty']",
        "select[aria-label*='Warranty Status']",
        "select[aria-label*='حالة الضمان']",
        "select[name*='status']"
      ],
      dateInput: [
        '#ldv_warrantydate_datepicker_description',
        "input[aria-label*='Warranty Date']",
        "input[aria-label*='تاريخ الضمان']",
        "[name*='warrantyDate']",
        "[id*='warrantyDate']",
        "[id*='warrantydate']",
        "input[type='date']"
      ],
      notes: [
        "textarea[aria-label*='Notes']",
        "textarea[name*='notes']",
        "textarea[id*='notes']",
        "textarea[aria-label*='ملاحظات']"
      ],
      nextBtn: [
        '#NextButton',
        "input[type='button'][value='Next']",
        "input[type='button'][value='التالي']",
        "button[aria-label='Next']",
        "button[aria-label='التالي']",
        "button[type='submit']"
      ],
      lookupModalItem: [
        "[role='dialog'] li",
        "[role='listbox'] [role='option']",
        '.lookup-modal .result-item',
        '.modal .result-item',
        '.entitylist-items li',
        '.lookup-results li'
      ],
      lookupSearchInput: [
        "[role='dialog'] input[type='search']",
        "[role='dialog'] input[type='text']",
        '.lookup-modal input'
      ],
      successIndicator: [
        '.save-success',
        '.alert-success',
        '.notification-success',
        "[class*='success']",
        '.toast-success'
      ],
      customer: [
        '.customer-name',
        "[class*='customer-name']",
        "[data-id*='customer']"
      ],
      orderNumber: [
        '.order-number',
        "[class*='order-id']",
        "[class*='workorder-id']"
      ],
      ordersSearchInput: [
        "input[aria-label*='Search']",
        "input[placeholder*='Search']",
        "input[placeholder*='بحث']",
        '#searchOrders',
        "input[type='search']",
        '.search-input input',
        "[name*='search']"
      ],
      ordersSearchBtn: [
        "button[type='submit']",
        "button[aria-label*='Search']",
        "button[aria-label*='بحث']",
        '.search-btn',
        "button[class*='search']"
      ],
      ordersTableRow: [
        'table tbody tr',
        "[role='row']",
        '.entitylist-items > li',
        '.order-row',
        '.grid-row',
        '.list-item'
      ],
      ordersViewLink: [
        "a[href*='workorderreview']",
        "a[href*='followup']",
        "a[href*='review']",
        "button[aria-label*='View']",
        "button[aria-label*='Open']",
        "button[aria-label*='متابعة']",
        "a[aria-label*='View']",
        'td:last-child a',
        '.view-btn'
      ]
    }
  };

  /**
   * محددات صفحات "آخرى" المالية
   */
  const FINANCIAL = {
    // روابط التنقل في MainMoney.aspx
    menuLinks: {
      autoBuildWR: 'LinkButton7',      // اصدار فاتورة
      inprogress: 'LinkButton1',       // جاري مراجعتها
      inasc: 'LinkButton2',            // متوقف احتسابها
      salaryasc2: 'LinkButton5',       // مستحقات المراكز
      salaryASC: 'LinkButton8',        // Call-Center خارج الضمان
      mscreport: 'LinkButton9',        // حوافز الفنيين
      accountMovementSAP: 'LinkButton3', // حركات SAP
      accountMovement: 'LinkButton4',  // حركات CRM
      billingneeded: 'LinkButton6',    // الفواتير المطلوبة
      fawry: 'LinkButton10',           // طلبات المدفوعات
      financialReceipt: 'LinkButton12' // ايصالات المدفوعات
    },
    
    // حقول البحث
    searchFields: {
      dateFrom: 'ContentPlaceHolder1_TextBox1',
      dateTo: 'ContentPlaceHolder1_TextBox2',
      password: 'ContentPlaceHolder1_TextBox3',
      secretKey: 'ContentPlaceHolder1_TextBox1'
    },
    
    // أزرار البحث
    searchButtons: {
      search: 'ContentPlaceHolder1_Button1',
      export: 'ContentPlaceHolder1_Button2'
    },
    
    // معلومات المركز
    centerInfo: {
      name: 'ContentPlaceHolder1_lblnameasc',
      account: 'ContentPlaceHolder1_lblaccount',
      accountLabel: 'ContentPlaceHolder1_Label1'
    },
    
    // أعمدة التقرير
    reportColumns: {
      ticketnumber: 'ticketnumber',
      sapOrder: 'ldv_sapordernumber',
      customerName: 'ldv_customername',
      address: 'ldv_address',
      problem: 'ldv_problem',
      centralPhone: 'ldv_centraltelephone',
      productType: 'ldv_producttype',
      brand: 'ldv_brand',
      modelNumber: 'ldv_modelnumber',
      actualModel: 'ldv_actualmodel',
      barcode1: 'ldv_productbarcode',
      barcode2: 'ldv_productbarcodeatlsc',
      report: 'ldv_resourcelastcomment',
      scheduledDate: 'ldv_scheduledservicestartdate',
      createdOn: 'createdon',
      warrantyDate: 'ldv_warrantydate',
      statusCode: 'statuscode',
      queue: 'new_queue',
      createdFrom: 'ldv_createdfrom',
      callCenterNotes: 'ldv_callcenternotes',
      technicalNotes: 'ldv_technicalsupportnotes',
      planningNotes: 'ldv_planningteamnotes',
      backOfficeNotes: 'ldv_backofficenotes',
      replacementStatus: 'ldv_technicalsupportreplacementapproval',
      pullStatus: 'ldv_technicalsupportlscapproval',
      sparePartsBO: 'ldv_sparepartsshortage',
      sparePartsPL: 'ldv_sparepartsavailability'
    }
  };

  /**
   * محددات CRM Portal
   */
  const CRM = {
    // صفحة التقارير
    selectReport: {
      searchBox: '#ContentPlaceHolder1_TextBox1',
      reportType: '#ContentPlaceHolder1_DropDownList1',
      searchMethod: '#ContentPlaceHolder1_DropDownList2',
      searchButton: '#ContentPlaceHolder1_Button1',
      gridView: '#ContentPlaceHolder1_GridView1',
      panel: '#ContentPlaceHolder1_Panel1',
      userName: '#ContentPlaceHolder1_Label1'
    },
    
    // أنماط البحث
    searchPatterns: {
      crm: ['بلاغ', 'CAS', 'CRM', 'رقم'],
      report: ['تقرير', 'Report', 'ملاحظات'],
      sap: ['SAP', 'رقم الساب'],
      customer: ['اسم العميل', 'Customer'],
      phone: ['تليفون', 'Phone', 'الموبايل']
    },
    
    // حالات البلاغ
    skipStatuses: ['canceled', 'postpone']
  };

  /**
   * محددات عامة
   */
  const COMMON = {
    // الروابط
    links: {
      postBack: 'a[href*="doPostBack"]',
      sameframe: 'a.sameframe',
      mainMoney: 'a[href*="MainMoney"]'
    },
    
    // الحقول
    inputs: {
      hidden: 'input[type="hidden"]',
      visible: 'input:not([type="hidden"])',
      submit: 'input[type="submit"]',
      button: 'input[type="button"]',
      date: 'input[type="date"]',
      password: 'input[type="password"]',
      text: 'input[type="text"]'
    },
    
    // عناصر أخرى
    selects: 'select',
    buttons: 'button',
    tables: 'table',
    spans: 'span',
    
    // رسائل الخطأ
    errors: {
      entityNotFound: 'Does Not Exist',
      accountError: 'Entity \'account\'',
      genericError: 'Error'
    }
  };

  /**
   * البحث عن عنصر في document + iframes
   * @param {string} selector - محدد CSS
   * @param {Document} doc - المستند (اختياري)
   * @returns {Element|null} العنصر الموجود
   */
  window.findElement = function(selector, doc = document) {
    // البحث في المستند الرئيسي
    let element = doc.querySelector(selector);
    if (element) return element;
    
    // البحث في iframes
    const iframes = doc.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        element = window.findElement(selector, iDoc);
        if (element) return element;
      } catch (e) {
        // cross-origin
      }
    }
    
    return null;
  };

  /**
   * البحث عن كل العناصر في document + iframes
   * @param {string} selector - محدد CSS
   * @param {Document} doc - المستند (اختياري)
   * @returns {Element[]} العناصر الموجودة
   */
  window.findAllElements = function(selector, doc = document) {
    const results = [...doc.querySelectorAll(selector)];
    
    const iframes = doc.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        results.push(...window.findAllElements(selector, iDoc));
      } catch (e) {
        // cross-origin
      }
    }
    
    return results;
  };

  // ════════════════════════════════════════════════════════════════════════════════════
  // دوال مساعدة مشتركة موحدة — تُستدعى من كل ملفات الإضافة عبر window.*
  // لمنع تكرار التعريف نفسه في 3+ ملفات (findFirst, generateTaskId, parseDataLine, loadSelectors)
  // ════════════════════════════════════════════════════════════════════════════════════

  /**
   * البحث عن أول عنصر يطابق أحد المحددات في documento + iframes
   * @param {string|string[]|HTMLElement} list - محدد أو قائمة محددات أو عنصر DOM
   * @param {Document} [doc=document] - المستند للبحث فيه (افتراضي: المستند الحالي)
   * @returns {HTMLElement|null} العنصر الأول المطابق أو null
   */
  window.findFirst = function (list, doc) {
    if (!list) return null;
    const rootDoc = doc || document;
    const arr = Array.isArray(list) ? list : [list];
    for (const s of arr) {
      if (!s) continue;
      if (s instanceof HTMLElement) return s;
      if (typeof s === 'string') {
        try {
          const el = rootDoc.querySelector(s);
          if (el) return el;
          // البحث داخل iframes (مثل PowerApps)
          const iframes = rootDoc.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iDoc = iframe.contentDocument || iframe.contentWindow.document;
              const found = window.findFirst(s, iDoc);
              if (found) return found;
            } catch (_) { /* cross-origin iframe */ }
          }
        } catch (_) {}
      }
    }
    return null;
  };

  /**
   * إنشاء معرف مهمة فريد
   * @returns {string}
   */
  window.generateTaskId = function () {
    return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  };

  /**
   * تحليل سطر بيانات إلى كائن منظم (صيغة key:val مفصولة بـ | أو ,)
   * @param {string} line - سطر البيانات
   * @returns {object}
   */
  window.parseDataLine = function (line) {
    if (!line || typeof line !== 'string') return {};
    const obj = {};
    const parts = line.includes('|') ? line.split('|') : line.split(',');
    parts.forEach(function (p) {
      const i = p.indexOf(':');
      if (i < 0) return;
      obj[p.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')] = p.slice(i + 1).trim();
    });
    const parsed = {
      orderId: obj['orderid'] || obj['order'] || line.match(/\bCAS\d{10,}\b/i)?.[0] || '',
      brand: obj['brand'] || obj['علامهتجاريه'] || '',
      product: obj['product'] || obj['نوعالمنتج'] || obj['المنتج'] || '',
      model: obj['model'] || obj['موديل'] || '',
      serial: obj['serial'] || obj['serialnumber'] || '',
      model2: obj['model2'] || '',
      serial2: obj['serial2'] || '',
      status: obj['status'] || obj['حالة'] || '',
      date: obj['date'] || obj['تاريخ'] || '',
      reportType: obj['reporttype'] || obj['report'] || '',
      date2: obj['date2'] || '',
      problemCode: obj['problemcode'] || obj['problem'] || '',
      faultCode: obj['faultcode'] || obj['fault'] || '',
      subFaultCode: obj['subfault'] || null,
      notes: obj['notes'] || obj['ملاحظات'] || '',
      technician: obj['technician'] || obj['الفني'] || obj['الفنى'] || '',
      technicianName: obj['technicianname'] || obj['اسمالفني'] || obj['اسمالفنى'] || ''
    };
    // إذا وجد تاريخان والثاني أحدث، اعتمده
    if (parsed.model2 && parsed.date && parsed.date2) {
      try {
        const toDate = function (d) {
          const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          return m ? new Date(m[3], m[2] - 1, m[1]) : new Date(d);
        };
        const d1 = toDate(parsed.date);
        const d2 = toDate(parsed.date2);
        if (d2 > d1) parsed.date = parsed.date2;
      } catch (_) {}
    }
    return parsed;
  };

  /**
   * تحويل تاريخ إلى صيغة البوابة: يوم/شهر/سنة (DD/MM/YYYY) + ISO لحقول type="date"
   *
   * ⚠️ البوابة تعرض التواريخ بصيغة DD/MM/YYYY — وهي الصيغة الموثّقة في SHARED_KNOWLEDGE.md
   *    (daterangepicker: locale.format = 'DD/MM/YYYY')، ونفس ما كان يعمل في V1 و V2
   *    (كانا يكتبان data.date كما هو = DD/MM/YYYY).
   *    كتابة شهر/يوم (MM/DD/YYYY) يجعل السيرفر يرفض النموذج بالرسالة:
   *    «تاريخ الضمان must have a valid date format. Example: {1}»
   *    لأن المكوّن الثاني (اليوم) يتجاوز 12.
   *
   * @param {string} rawDate - تاريخ بصيغة DD/MM/YYYY أو YYYY-MM-DD
   * @returns {{day:number, month:number, year:number, iso:string, display:string}|null}
   */
  window.parsePortalDate = function (rawDate) {
    if (!rawDate || typeof rawDate !== 'string') return null;
    const s = rawDate.trim();
    let day = null, month = null, year = null;
    const mDmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    const mYmd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (mDmy) {
      day = parseInt(mDmy[1], 10); month = parseInt(mDmy[2], 10); year = parseInt(mDmy[3], 10);
    } else if (mYmd) {
      year = parseInt(mYmd[1], 10); month = parseInt(mYmd[2], 10); day = parseInt(mYmd[3], 10);
    } else {
      const parsed = new Date(s);
      if (isNaN(parsed.getTime())) return null;
      year = parsed.getFullYear(); month = parsed.getMonth() + 1; day = parsed.getDate();
    }
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31) || !(year > 1900)) return null;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return {
      day: day,
      month: month,
      year: year,
      iso: year + '-' + pad(month) + '-' + pad(day),
      display: pad(day) + '/' + pad(month) + '/' + year
    };
  };

  // محددات افتراضية في حال تعذر تحميل selectors.json
  function getHardcodedDefaults() {
    return {
      serial: ["#ldv_serialnumber", "#ldv_technicalserialnumber", "[aria-label*='الرقم المسلسل']", "[name*='serial']", "input[id*='serial']"],
      serial2: ["#ldv_serialnumber1", "[aria-label*='الرقم المسلسل 2']", "[name*='serialnumber1']"],
      brandInput: ["#ats_producttypebrand_name", "input[aria-label='العلامة التجاريه']", "input[aria-label*='العلامة التجاريه']", "input[id*='brand']", "input[name*='brand']"],
      brandBtn: ["button[aria-label*='العلامة التجاريه Launch lookup modal']", ".launchentitylookup", "button[aria-label*='Brand']", ".lookup-brand button"],
      modelInput: ["#ldv_actualmodel_name", "input[aria-label='الموديل الفعلي 1']", "input[aria-label*='الموديل الفعلي']", "input[name*='actualmodel']", "input[name*='model']", "input[id*='actualModel']"],
      modelInput2: ["#ldv_actualmodel2_name", "input[aria-label='الموديل الفعلي 2']", "input[aria-label*='الموديل الفعلي 2']"],
      modelBtn: ["button[aria-label*='الموديل الفعلي Launch lookup modal']", ".launchentitylookup", "button[aria-label*='Model']", ".lookup-model button"],
      statusSelect: ["#ldv_warrantystatus", "select[name*='warranty']", "select[aria-label*='Warranty']", "select[id*='warranty']", "select[name*='status']"],
      dateInput: ["#ldv_warrantydate_datepicker_description", "input[aria-label*='Warranty Date']", "input[aria-label*='تاريخ الضمان']", "input[name*='warrantyDate']", "input[id*='warrantydate']", "input[type='date']"],
      notes: ["textarea[aria-label*='Notes']", "textarea[name*='notes']", "textarea[id*='notes']"],
      nextBtn: ["#NextButton", "input[type='button'][value='Next']", "input[type='button'][value='التالي']", "button[aria-label='Next']", "button[aria-label='التالي']", "button[type='submit']"],
      lookupModalItem: ["[role='dialog'] li", "[role='listbox'] [role='option']", ".lookup-modal .result-item", ".modal .result-item", "table tbody tr", ".entitylist-items li"],
      lookupSearchInput: ["[role='dialog'] input[type='search']", "[role='dialog'] input[type='text']", ".modal input"],
      successIndicator: [".save-success", ".alert-success", "[class*='success']"],
      customer: [".customer-name", "[class*='customer-name']"],
      orderNumber: [".order-number", "[class*='order-id']", "[class*='workorder-id']"],
      ordersSearchInput: ["input[aria-label*='Search']", "input[placeholder*='Search']", "input[placeholder*='بحث']", "#searchOrders", "input[type='search']"],
      ordersSearchBtn: ["button[type='submit'][aria-label*='Search']", "button[aria-label*='Search']", "button[aria-label*='بحث']"],
      ordersTableRow: ["table tbody tr", "[role='row']", ".entitylist-items > li", ".order-row"],
      ordersViewLink: ["a[href*='workorderreview']", "a[href*='followup']", "a[href*='review']", "button[aria-label*='View']", "button[aria-label*='متابعة']"],
      _batchDelay: 1200, _nextWaitTimeout: 10000, _lookupTimeout: 6000, _ordersSearchWait: 2000, _retryCount: 3
    };
  }

  /**
   * تحميل محددات البورتال من التخزين المحلي أو selectors.json
   * @returns {Promise<object>}
   */
  window.loadSelectors = async function () {
    if (window._CFG) return window._CFG;
    try {
      const lsVal = localStorage.getItem('autofiller_selectors');
      if (lsVal) { window._CFG = JSON.parse(lsVal); return window._CFG; }
    } catch (_) {}
    try {
      window._CFG = await (await fetch(chrome.runtime.getURL('selectors.json'))).json();
      return window._CFG;
    } catch (_) {
      window._CFG = getHardcodedDefaults();
      return window._CFG;
    }
  };

  // ── كشف «مجموعة منتجات التكييف» — المصدر الوحيد لكل الواجهات ──────────────
  // القاعدة المعتمدة (موثّقة في .planning/PHASE1_AC_SERIAL_MODEL2_FIX.md):
  //   الموديل 2 / السيريال 2 مسموحان فقط لمنتجات مجموعة AC (داخلي + خارجي).
  //   أي منتج آخر = أمر شغل بسطر بيانات واحد.
  // النصوص: تكييف، تكييف كونسيلد، PUMP CLEAN، مبرد هواء، منقى هواء، صيانة دورية تكييف.
  const AC_PRODUCT_TEXT = /تكييف|كونسيلد|pump\s*clean|مبرد\s*هواء|منقى\s*هواء|صيانة\s*دورية\s*تكييف|a\s*\/\s*c\b|air\s*cond|\bsplit\b|\binverter\b/i;
  const NON_AC_PRODUCT_TEXT = /ثلاج|فريزر|غسال|بوتوجاز|بوتاجاز|سخان|ميكروويف|تلفزيون|شفاط|مبرد\s*مياه|ديفر|تكييف\s*سيارات/i;

  /**
   * هل النص يوصف منتجًا من مجموعة التكييف؟
   * @param {string} text
   * @returns {boolean}
   */
  window.isACProductType = function (text) {
    const t = String(text || '').trim();
    if (!t) return false;
    return AC_PRODUCT_TEXT.test(t);
  };

  /**
   * هل النص يوصف منتجًا معروفًا بأنه ليس تكييفًا؟ (لتمييز «المؤكد» عن «المجهول»)
   * @param {string} text
   * @returns {boolean}
   */
  window.isNonACProductType = function (text) {
    const t = String(text || '').trim();
    if (!t) return false;
    return !AC_PRODUCT_TEXT.test(t) && NON_AC_PRODUCT_TEXT.test(t);
  };

  // قاعدة الموديلات (products-db.json) — تُحمَّل مرة واحدة وتُخزَّن
  let _productDbPromise = null;
  window.loadProductDb = function () {
    if (_productDbPromise) return _productDbPromise;
    _productDbPromise = (async function () {
      try {
        const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('products-db.json')
          : 'products-db.json';
        const res = await fetch(url);
        const db = await res.json();
        return Array.isArray(db) ? db : (db && Array.isArray(db.products) ? db.products : []);
      } catch (_) {
        return [];
      }
    })();
    return _productDbPromise;
  };

  /**
   * نوع المنتج من كود الموديل (قاعدة الموديلات) — '' إذا لم يُعثر عليه.
   * يطابق أيضًا الموديلات المطوّلة مثل "AY-AP12UHEA _ (Sharp A/C Indoor Unit...)".
   * @param {string} model
   * @returns {Promise<string>}
   */
  window.findProductTypeByModel = async function (model) {
    const code = String(model || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (code.length < 3) return '';
    const db = await window.loadProductDb();
    const norm = (m) => String(m || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const exact = db.find((p) => norm(p.model) === code);
    if (exact) return String(exact.productType || '');
    const near = db.find((p) => {
      const m = norm(p.model);
      if (m.length < 5) return false;
      return code.startsWith(m) || m.startsWith(code);
    });
    return near ? String(near.productType || '') : '';
  };

  /**
   * كشف نوع المنتج لمهمة/سطر:
   *   true  = تكييف (مؤكد)      → يُسمح بالجهاز الثاني
   *   false = غير تكييف (مؤكد)  → سطر بيانات واحد فقط
   *   null  = غير معروف         → نحافظ على السلوك السابق (دمج) ولا نفقد بيانات
   * @param {object|string} data - كائنTask/البيانات أو نص نوع المنتج
   * @returns {Promise<{isAC: boolean|null, source: string, productType?: string}>}
   */
  window.detectACProduct = async function (data) {
    const d = (data && typeof data === 'object') ? data : { product: data };
    const explicit = String(d.product || d.productType || d.reportType || '').trim();

    if (explicit) {
      if (window.isACProductType(explicit)) return { isAC: true, source: 'product-type', productType: explicit };
      if (window.isNonACProductType(explicit)) return { isAC: false, source: 'product-type', productType: explicit };
    }

    const m1 = String(d.model || '').trim();
    if (m1) {
      const pt = await window.findProductTypeByModel(m1);
      if (pt) return { isAC: window.isACProductType(pt), source: 'model-db', productType: pt };
      if (/a\s*\/\s*c|indoor|outdoor/i.test(m1)) return { isAC: true, source: 'model-text' };
    }

    const m2 = String(d.model2 || '').trim();
    if (m2) {
      const pt2 = await window.findProductTypeByModel(m2);
      if (pt2) return { isAC: window.isACProductType(pt2), source: 'model-db-2', productType: pt2 };
    }

    return { isAC: null, source: 'unknown' };
  };

  // تصدير المحددات
  window.PORTAL_SELECTORS = {
    POWERAPPS,
    FINANCIAL,
    CRM,
    COMMON
  };

  console.log('[PortalSelectors] ✅ تم تحميل محددات البورتال بنجاح');

})();
