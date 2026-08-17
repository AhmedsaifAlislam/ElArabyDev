/**
 * data-mapper.js — تعيين الأعمدة (عربي-إنجليزي) الموحد
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، dashboard، background (service worker)
 * يوفّر:
 *   - واجهة عامة: mapColumn, mapColumns, getColumnValue, mapSAPColumns, getAvailableKeys, getAliases, COLUMN_MAP
 *   - DataMapper (normalizeHeader, findColumnValue, parseField, mapRawToMasterData, HEADERS) — لقطع الغيار
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyDataMapperLoaded) return;
  global.__elarabyDataMapperLoaded = true;

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
  global.mapColumn = function(header) {
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
  global.mapColumns = function(headers) {
    const result = {};

    headers.forEach((header, index) => {
      const key = global.mapColumn(header);
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
  global.getColumnValue = function(row, colMap, key) {
    const index = colMap[key];
    if (index === undefined || index === -1) return '';
    return row[index] || '';
  };

  /**
   * تعيين أعمدة SAP تلقائياً
   * @param {string[]} headers - رؤوس الأعمدة
   * @returns {Object} خريطة أعمدة SAP
   */
  global.mapSAPColumns = function(headers) {
    return global.mapColumns(headers);
  };

  /**
   * الحصول على كل المفاتاحات المتاحة
   * @returns {string[]} المفاتاحات
   */
  global.getAvailableKeys = function() {
    return Object.keys(COLUMN_MAP);
  };

  /**
   * الحصول على الأسماء البديلة لمفتاح
   * @param {string} key - المفتاح
   * @returns {string[]} الأسماء البديلة
   */
  global.getAliases = function(key) {
    return COLUMN_MAP[key] || [];
  };

  // ── DataMapper — تعيين أعمدة قطع الغيار ──

  /**
   * توحيد اسم العمود للمقارنة الضبابية
   * @param {string} header - اسم العمود
   * @returns {string} الاسم الموحد
   */
  function normalizeHeader(header) {
    return String(header || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  }

  /**
   * إيجاد قيمة في الصف حسب عدة أسماء محتملة للأعمدة
   * @param {Object} row - الصف
   * @param {string[]} possibleHeaders - الأسماء المحتملة
   * @returns {string|undefined} القيمة
   */
  function findColumnValue(row, possibleHeaders) {
    const rowKeys = Object.keys(row);
    // 1. مطابقة تامة أولاً
    for (const header of possibleHeaders) {
      if (row[header] !== undefined) return String(row[header]);
    }
    // 2. مطابقة ضبابية
    const normalizedPossible = possibleHeaders.map(normalizeHeader);
    const foundKey = rowKeys.find(key => normalizedPossible.includes(normalizeHeader(key)));
    return foundKey ? String(row[foundKey]) : undefined;
  }

  /**
   * تحليل الحقل (يتعامل مع "Code _ (Description)" أو "Code - (Description)" أو "Code - Description")
   * @param {string} value - القيمة
   * @returns {{code: string, description: string}} الكود والوصف
   */
  function parseField(value) {
    if (!value) return { code: '', description: '' };
    let parts = value.split(' _ ');
    if (parts.length < 2) parts = value.split(' - ');
    if (parts.length > 1) {
      return { code: parts[0].trim(), description: parts.slice(1).join(' ').replace(/[()]/g, '').trim() };
    }
    return { code: value.trim(), description: '' };
  }

  /**
   * تعريفات أعمدة قطع الغيار للتعيين المرن
   */
  const HEADERS = {
    sparePart: [
      'Spare Part', 'Spare Part Code', 'Part No', 'Part Number', 'Item Code', 'Material',
      'كود قطعة الغيار', 'كود القطعة', 'الكود', 'رقم الصنف', 'قطعة الغيار'
    ],
    model: [
      'Model', 'Model Code', 'Product', 'Device',
      'الموديل', 'الجهاز', 'موديل الجهاز'
    ],
    price: [
      'Price', 'Unit Price', 'Cost', 'List Price', 'Amount',
      'السعر', 'سعر الوحدة', 'الثمن', 'القيمة'
    ],
    productGroup: [
      'Product Group', 'Group', 'Category', 'Family',
      'Product Group (Model) (Product)',
      'مجموعة المنتج', 'الفئة', 'المجموعة'
    ],
    productType: [
      'Product Type', 'Type', 'Description',
      'Product Type (Model) (Product)',
      'نوع المنتج', 'النوع', 'الصنف'
    ],
    defect: [
      'Defect', 'Defect Code', 'Defect Code (Defect)',
      'العطل', 'كود العطل', 'المشكلة'
    ],
    defectDesc: [
      'Defect Description', 'Symptom Description',
      'Defect Description (Defect) (Defect Code)',
      'وصف العطل', 'شرح العطل'
    ],
    defectMajor: [
      'Defect Major', 'Major Defect', 'Main Defect',
      'العطل الرئيسي', 'العطل الأساسي'
    ],
    maxQuantity: [
      'Spare Part Max Quantity', 'Max Quantity', 'Quantity',
      'Spare Part Max Qty',
      'أقصى كمية', 'الكمية القصوى', 'الكمية'
    ]
  };

  /**
   * تحويل الصف الخام إلى MasterPartData
   * @param {Object} row - الصف
   * @param {number} index - رقم الصف
   * @returns {Object} بيانات القطعة
   */
  function mapRawToMasterData(row, index) {
    const rawSparePart = findColumnValue(row, HEADERS.sparePart);
    const rawModel = findColumnValue(row, HEADERS.model);
    const rawPrice = findColumnValue(row, HEADERS.price);
    const rawGroup = findColumnValue(row, HEADERS.productGroup);
    const rawType = findColumnValue(row, HEADERS.productType);
    const rawDefectDesc = findColumnValue(row, HEADERS.defectDesc);
    const rawDefectMajor = findColumnValue(row, HEADERS.defectMajor);
    const rawMaxQty = findColumnValue(row, HEADERS.maxQuantity);

    const sparePartParsed = parseField(rawSparePart);
    const modelParsed = parseField(rawModel);
    const defectDescParsed = parseField(rawDefectDesc);
    const defectMajorParsed = parseField(rawDefectMajor);

    let price = 0;
    if (rawPrice) {
      const cleanPrice = String(rawPrice).replace(/[^\d.]/g, '');
      price = parseFloat(cleanPrice);
      if (isNaN(price)) price = 0;
    }

    let maxQty = 0;
    if (rawMaxQty) {
      maxQty = parseInt(String(rawMaxQty).replace(/[^\d]/g, '')) || 0;
    }

    return {
      id: `row-${index}-${Math.random()}`,
      productGroup: rawGroup || '',
      productType: rawType || '',
      brand: '',
      defectGroup: '',
      defectCode: defectDescParsed.code || rawDefectDesc || '',
      defectDescription: defectDescParsed.description || '',
      modelCode: modelParsed.code || rawModel || '',
      modelDescription: modelParsed.description || '',
      sparePartCode: sparePartParsed.code || rawSparePart || '',
      sparePartDescription: sparePartParsed.description || '',
      defectMajor: rawDefectMajor || defectMajorParsed.code || '',
      maxQuantity: maxQty,
      createdOn: new Date().toISOString(),
      price: price,
      source: 'System'
    };
  }

  // متاح لقطع الغيار (background + content scripts)
  global.DataMapper = {
    normalizeHeader,
    findColumnValue,
    parseField,
    mapRawToMasterData,
    HEADERS
  };

  global.COLUMN_MAP = COLUMN_MAP;

  console.log('[DataMapper] تم تحميل محول البيانات بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);
