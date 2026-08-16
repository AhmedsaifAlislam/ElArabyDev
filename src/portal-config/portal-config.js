/**
 * portal-config.js — إعدادات البورتال الموحدة
 * Shared across all El Araby extensions
 * 
 * يحتوي على كل الإعدادات والمعلومات الأساسية للبورتال
 */

(function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyPortalConfigLoaded) return;
  window.__elarabyPortalConfigLoaded = true;

  /**
   * إعدادات البورتال الأساسية
   */
  const PORTAL = {
    // PowerApps Portal
    powerapps: {
      baseUrl: 'https://elarabyportalpfs.powerappsportals.com',
      ordersUrl: 'https://elarabyportalpfs.powerappsportals.com/en-US/Orders/',
      signInUrl: 'https://elarabyportalpfs.powerappsportals.com/en-US/SignIn',
      workOrderUrl: 'https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/'
    },
    
    // CRM Portal
    crm: {
      baseUrl: 'https://elarabyiscrm2.azurewebsites.net',
      mainUrl: 'https://elarabyiscrm2.azurewebsites.net/ASPPage/',
      selectReportUrl: 'https://elarabyiscrm2.azurewebsites.net/ASPPage/SelectReport.aspx',
      mainMoneyUrl: 'https://elarabyiscrm2.azurewebsites.net/ASPPage/MainMoney.aspx'
    },
    
    // بوابة ASC
    asc: {
      baseUrl: 'http://elarabyascportal.azurewebsites.net'
    }
  };

  /**
   * إعدادات window.crmAccount
   */
  const CRM_ACCOUNT = {
    accountId: '7707e653-ef63-ea11-a812-000d3ab953dd',
    changePassword: '0',
    accountType: 963400001,
    allowCancellation: true,
    futureCases: 963400002,
    hideCustomersPhones: false,
    enableOverLapping: true,
    allowReschedule: true,
    allowInstallationCreation: true,
    allowMaintenanceCreation: true,
    allowDealerInstallation: false,
    allowOutsideInventory: true,
    showOtherMenu: true
  };

  /**
   * معلومات المستخدم الحالي
   */
  const CURRENT_USER = {
    name: 'الامين-ASC-AC522',
    accountNumber: '2000043359',
    accountId: '7707e653-ef63-ea11-a812-000d3ab953dd'
  };

  /**
   * أنواع المنتجات
   */
  const PRODUCT_TYPES = {
    AC: { nameAr: 'تكييف', nameEn: 'Air Conditioner', group: 'HA' },
    WM: { nameAr: 'غسالة', nameEn: 'Washing Machine', group: 'HA' },
    RF: { nameAr: 'ثلاجة', nameEn: 'Refrigerator', group: 'HA' },
    DW: { nameAr: 'غسالة أطباق', nameEn: 'Dishwasher', group: 'HA' },
    RG: { nameAr: 'بوتجاز و مسطح و فرن', nameEn: 'Range', group: 'HA' },
    WH: { nameAr: 'سخانات مياه', nameEn: 'Water Heater', group: 'HA' },
    MR: { nameAr: 'مبرد مياه', nameEn: 'Water Cooler', group: 'HA' }
  };

  /**
   * الماركات
   */
  const BRANDS = {
    Hoover: 'هوفر',
    Candy: 'كاندي',
    Brilliance: 'بريليانس',
    'Union Air': 'يونيون اير',
    Laurant: 'لوران',
    Tornado: 'تورنيدو'
  };

  /**
   * حالات البلاغ
   */
  const TICKET_STATUSES = {
    scheduled: { ar: 'مجدول', en: 'Scheduled' },
    inProgress: { ar: 'قيد التنفيذ', en: 'In Progress' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    canceled: { ar: 'ملغي', en: 'Canceled', skip: true },
    postpone: { ar: 'مؤجل', en: 'Postpone', skip: true },
    outWarranty: { ar: 'خارج الضمان', en: 'Out Warranty', value: '753240001' }
  };

  /**
   * كلمات السر للصفحات المالية
   */
  const PASSWORDS = {
    salaryasc2: { field: 'ContentPlaceHolder1_TextBox1', label: 'الرقم السرى' },
    accountMovement: { field: 'ContentPlaceHolder1_TextBox3', label: 'كلمة السر' },
    accountMovementSAP: { field: 'ContentPlaceHolder1_TextBox1', label: 'كلمة المرور' },
    billingneeded: { field: 'ContentPlaceHolder1_TextBox3', label: 'الرقم السرى' }
  };

  /**
   * Regex Patterns
   */
  const PATTERNS = {
    phone: /01[0-9]{9}/g,
    cas: /CAS\d+/g,
    sap: /\b7[0-9]{7,9}\b/g,
    account: /\b(200\d{7})\b/g,
    accountFull: /(?:رقم\s*(?:الحساب|العميل)|Account\s*(?:No|Number|ID))[\s:]*([0-9]{6,})/gi
  };

  /**
   * إعدادات البحث
   */
  const SEARCH = {
    batchSize: 25,  // حجم الدفعة للبحث
    skipStatuses: ['canceled', 'postpone'],
    debounceMs: 350
  };

  /**
   * إعدادات التخزين
   */
  const STORAGE = {
    maxLogEntries: 500,
    maxReports: 200,
    dbName: 'ElArabyPartsDB',
    dbVersion: 2
  };

  // تصدير الإعدادات
  window.PORTAL_CONFIG = {
    PORTAL,
    CRM_ACCOUNT,
    CURRENT_USER,
    PRODUCT_TYPES,
    BRANDS,
    TICKET_STATUSES,
    PASSWORDS,
    PATTERNS,
    SEARCH,
    STORAGE
  };

  console.log('[PortalConfig] ✅ تم تحميل إعدادات البورتال بنجاح');

})();
