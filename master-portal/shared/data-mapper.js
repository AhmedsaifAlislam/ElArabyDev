/**
 * data-mapper.js — تعيين الأعمدة (عرب-إنجليزي)
 * Shared across all El Araby extensions
 * 
 * يحوّل أسماء الأعمدة العربية إلى إنجليزية والعكس
 */

(function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyDataMapperLoaded) return;
  window.__elarabyDataMapperLoaded = true;

  /**
   * خريطة الأعمدة — عربي ↔ إنجليزي
   */
  const COLUMN_MAP = {
    // أسماء المنتجات
    'productType': ['producttype', 'نوع المنتج', 'المنتج', 'product type', 'product_group'],
    'productGroup': ['product group', 'مجموعة المنتج', 'product_group'],
    
    // أسماء الموديلات
    'modelCode': ['model', 'modelcode', 'الموديل', 'كود الموديل', 'model number', 'ldv_modelnumber'],
    'modelDescription': ['modeldescription', 'وصف الموديل', 'الموديل الفعلي', 'ldv_actualmodel'],
    
    // أسماء العيوب
    'defectCode': ['defect', 'defectcode', 'كود العطل', 'العطل', 'defect major'],
    'defectDescription': ['defectdescription', 'وصف العطل', 'مشكلة الجهاز', 'ldv_problem'],
    'defectMajor': ['defect major', 'العطل الرئيسي', 'defect_major'],
    
    // أسماء قطع الغيار
    'sparePartCode': ['sparepart', 'sparepartcode', 'كود القطعة', 'رقم القطعة', 'spare part', 'material'],
    'sparePartDescription': ['sparepartdescription', 'وصف القطعة', 'اسم القطعة', 'spare part description', 'material description'],
    
    // الأسعار والكميات
    'price': ['price', 'السعر', 'cost', 'التكلفة', 'billing net value', 'net value'],
    'maxQuantity': ['maxquantity', 'الحد الأقصى', 'كمية', 'quantity', 'billed quan'],
    
    // معلومات البلاغ
    'caseNumber': ['casenumber', 'cas', 'رقم البلاغ', 'رقم الطلب', 'ticketnumber', 'order no'],
    'sapOrderNumber': ['sapordernumber', 'رقم الساب', 'رقم sap', 'ldv_sapordernumber'],
    'customerName': ['customername', 'اسم العميل', 'ldv_customername'],
    'customerPhone': ['customerphone', 'رقم التليفون', 'الموبايل', 'ldv_centraltelephone'],
    'customerAddress': ['customeraddress', 'العنوان', 'ldv_address'],
    
    // حالات البلاغ
    'statusCode': ['statuscode', 'حالة البلاغ', 'status', 'حالة'],
    'queue': ['queue', 'قائمة الانتظار', 'new_queue'],
    'createdFrom': ['createdfrom', 'جهة الانشاء', 'ldv_createdfrom'],
    
    // التواريخ
    'scheduledDate': ['scheduleddate', 'تاريخ الحجز', 'ldv_scheduledservicestartdate'],
    'createdOn': ['createdon', 'تاريخ الانشاء', 'createdon'],
    'warrantyDate': ['warrantydate', 'تاريخ الضمان', 'ldv_warrantydate'],
    
    // معلومات حركات الحساب
    'postingDate': ['posting date', 'تاريخ الترحيل'],
    'documentDate': ['document date', 'تاريخ المستند'],
    'accountingDoc': ['accounting doc', 'مستند محاسبي'],
    'assignment': ['assignment number', 'رقم التعيين'],
    'text': ['text', 'النص'],
    'billingDoc': ['billing doc', 'مستند الفوترة'],
    'billingItem': ['billing item', 'بند الفوترة'],
    'billedQuan': ['billed quan', 'الكمية'],
    'dcInd': ['d/c', 'dc ind', 'd/c ind'],
    'billingNetValue': ['billing net value', 'صافي قيمة الفوترة'],
    'amountDoc': ['amount doc', 'المبلغ بالعملة'],
    'balanceDoc': ['balance in doc', 'الرصيد بالعملة'],
    'docType': ['doc. type', 'نوع المستند'],
    'docTDesc': ['doc.t desc', 'وصف نوع المستند'],
    'billingType': ['billing. type', 'نوع الفوكرة'],
    'billingTDesc': ['billing t desc', 'وصف نوع الفوكرة'],
    'delivery': ['delivery', 'التسليم'],
    'salesOrder': ['sales order', 'طلب المبيعات'],
    'customerNo': ['customer no', 'رقم العميل'],
    'poNo': ['po no', 'رقم أمر الشراء'],
    'companyCode': ['company code', 'رمز الشركة'],
    'fiscalYear': ['fiscal year', 'السنة المالية']
  };

  /**
   * تعيين رأس العمود بمفتاح داخلي
   * @param {string} header - رأس العمود
   * @returns {string|null} المفتاح الداخلي أو null
   */
  window.mapColumn = function(header) {
    if (!header) return null;
    
    const normalized = header.toLowerCase().trim();
    
    for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
      for (const alias of aliases) {
        if (normalized.includes(alias.toLowerCase())) {
          return key;
        }
      }
    }
    
    return null;
  };

  /**
   * تعيين مجموعة أعمدة
   * @param {string[]} headers - مصفوفة رؤوس الأعمدة
   * @returns {Object} خريطة الأعمدة { columnIndex: internalKey }
   */
  window.mapColumns = function(headers) {
    const result = {};
    
    headers.forEach((header, index) => {
      const key = window.mapColumn(header);
      if (key && !result[key]) {
        result[key] = index;
      }
    });
    
    return result;
  };

  /**
   * استخراج قيمة من صف حسب تعيين الأعمدة
   * @param {string[]} row - صف البيانات
   * @param {Object} colMap - خريطة الأعمدة
   * @param {string} key - المفتاح الداخلي
   * @returns {string} القيمة
   */
  window.getColumnValue = function(row, colMap, key) {
    const index = colMap[key];
    if (index === undefined || index === -1) return '';
    return row[index] || '';
  };

  /**
   * تعيين أعمدة SAP تلقائياً
   * @param {string[]} headers - رؤوس الأعمدة
   * @returns {Object} خريطة أعمدة SAP
   */
  window.mapSAPColumns = function(headers) {
    return window.mapColumns(headers);
  };

  /**
   * الحصول على كل المفاتاحات المتاحة
   * @returns {string[]} المفاتاحات
   */
  window.getAvailableKeys = function() {
    return Object.keys(COLUMN_MAP);
  };

  /**
   * الحصول على الأسماء البديلة لمفتاح
   * @param {string} key - المفتاح
   * @returns {string[]} الأسماء البديلة
   */
  window.getAliases = function(key) {
    return COLUMN_MAP[key] || [];
  };

  console.log('[DataMapper] ✅ تم تحميل محول البيانات بنجاح');

})();
