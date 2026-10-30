/**
 * portal-config.js — إعدادات البورتال المركزية
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، background (كل بيئات الإضافة)
 * يوفّر:
 *   - واجهة عامة: getPortalConfig, getPageInfo, isPortalPage, isCRMPage, getSapKeywords
 *   - PORTAL: PAGES، SELECTORS، SAP_KEYWORDS، DOMAINS — كمرجع واحد
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyPortalConfigLoaded) return;
  global.__elarabyPortalConfigLoaded = true;

  /**
   * دومينات البورتالات الرسمية
   */
  const DOMAINS = {
    portal: 'elarabyportalpfs.powerappsportals.com',
    crm: 'elarabyiscrm2.azurewebsites.net'
  };

  /**
   * صفحات البورتال الرئيسية (أسماء الشاشات)
   */
  const PAGES = {
    home: '/',
    workOrderEntry: 'WorkOrderEntry',
    workOrderReview: 'WorkOrderReview',
    followUp: 'FollowUp',
    technicalReview: 'TechnicalReview',
    partsSearch: 'PartsSearch',
    reportSearch: 'ReportSearch',
    financial: 'MainMoney.aspx',
    booking: 'Booking'
  };

  /**
   * كلمات SAP المفتاحية (في أسماء الأعمدة/الرؤوس)
   */
  const SAP_KEYWORDS = {
    number: ['SAP', 'رقم الساب', 'sapordernumber', 'ldv_sapordernumber'],
    order: ['الطلب', 'order no', 'ticketnumber', 'بلاغ'],
    customer: ['العميل', 'customer', 'ldv_customername'],
    phone: ['التليفون', 'الموبايل', 'telephone', 'phone'],
    address: ['العنوان', 'address', 'ldv_address'],
    product: ['المنتج', 'product', 'ldv_producttype'],
    brand: ['العلامة', 'brand', 'ldv_brand'],
    model: ['الموديل', 'model', 'ldv_modelnumber', 'ldv_actualmodel'],
    barcode: ['الباركود', 'barcode', 'ldv_productbarcode'],
    date: ['التاريخ', 'date', 'createdon', 'scheduleddate']
  };

  /**
   * معرفة نوع الصفحة الحالية
   * @param {string} url - الرابط (اختياري — افتراضياً location.href)
   * @returns {'portal'|'crm'|'other'}
   */
  function getPageType(url) {
    const u = String(url || (typeof location !== 'undefined' ? location.href : '')).toLowerCase();
    if (u.includes(DOMAINS.portal)) return 'portal';
    if (u.includes(DOMAINS.crm)) return 'crm';
    return 'other';
  }

  /**
   * هل نحن على البورتال؟
   */
  function isPortalPage(url) {
    return getPageType(url) === 'portal';
  }

  /**
   * هل نحن على الـ CRM؟
   */
  function isCRMPage(url) {
    return getPageType(url) === 'crm';
  }

  /**
   * استخراج اسم الشاشة من الرابط
   * @param {string} url - الرابط (اختياري)
   * @returns {string}
   */
  function getPageName(url) {
    const u = String(url || (typeof location !== 'undefined' ? location.href : ''));
    const m = u.match(/(?:pageName|pagename)=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    const path = u.split('?')[0];
    const last = path.split('/').pop();
    return last || '/';
  }

  /**
   * معلومات صفحة كاملة
   */
  function getPageInfo(url) {
    return {
      type: getPageType(url),
      name: getPageName(url),
      isPortal: isPortalPage(url),
      isCRM: isCRMPage(url)
    };
  }

  /**
   * كلمات SAP المفتاحية (مجموعة أو كلها)
   * @param {string} [group] - مجموعة محددة
   * @returns {string[]}
   */
  function getSapKeywords(group) {
    if (group) return SAP_KEYWORDS[group] || [];
    return Object.values(SAP_KEYWORDS).flat();
  }

  /**
   * إعدادات البورتال كاملة
   */
  function getPortalConfig() {
    return {
      domains: DOMAINS,
      pages: PAGES,
      sapKeywords: SAP_KEYWORDS,
      selectors: global.PORTAL_SELECTORS || null
    };
  }

  // واجهة عامة
  global.PORTAL_CONFIG = {
    DOMAINS,
    PAGES,
    SAP_KEYWORDS
  };

  global.getPortalConfig = getPortalConfig;
  global.getPageInfo = getPageInfo;
  global.getPageType = getPageType;
  global.isPortalPage = isPortalPage;
  global.isCRMPage = isCRMPage;
  global.getPageName = getPageName;
  global.getSapKeywords = getSapKeywords;

  console.log('[PortalConfig] ✅ تم تحميل إعدادات البورتال المركزية بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);