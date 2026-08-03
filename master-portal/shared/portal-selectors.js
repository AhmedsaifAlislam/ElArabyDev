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

  // تصدير المحددات
  window.PORTAL_SELECTORS = {
    POWERAPPS,
    FINANCIAL,
    CRM,
    COMMON
  };

  console.log('[PortalSelectors] ✅ تم تحميل محددات البورتال بنجاح');

})();
