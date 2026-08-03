// shared/data-mapper.js — Data Mapping & Parsing Utilities
// Source: dataService.ts (direct port, zero dependencies)

const DataMapper = (() => {

  // ── Normalize string for fuzzy matching ──
  function normalizeHeader(header) {
    return header.trim().toLowerCase().replace(/[\s_-]/g, '');
  }

  // ── Find value in row based on multiple possible column headers ──
  function findColumnValue(row, possibleHeaders) {
    const rowKeys = Object.keys(row);
    // 1. Try Exact Match first
    for (const header of possibleHeaders) {
      if (row[header] !== undefined) return String(row[header]);
    }
    // 2. Try Fuzzy Match
    const normalizedPossible = possibleHeaders.map(normalizeHeader);
    const foundKey = rowKeys.find(key => normalizedPossible.includes(normalizeHeader(key)));
    return foundKey ? String(row[foundKey]) : undefined;
  }

  // ── Parse fields (handling "Code _ (Description)", "Code - (Description)", or "Code - Description") ──
  function parseField(value) {
    if (!value) return { code: '', description: '' };
    let parts = value.split(' _ ');
    if (parts.length < 2) parts = value.split(' - ');
    if (parts.length > 1) {
      return { code: parts[0].trim(), description: parts.slice(1).join(' ').replace(/[()]/g, '').trim() };
    }
    return { code: value.trim(), description: '' };
  }

  // ── Column header definitions for flexible mapping ──
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

  // ── Map raw row to MasterPartData ──
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
      const cleanPrice = rawPrice.replace(/[^\d.]/g, '');
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

  // Public API
  return {
    normalizeHeader,
    findColumnValue,
    parseField,
    mapRawToMasterData,
    HEADERS
  };

})();

if (typeof globalThis !== 'undefined') globalThis.DataMapper = DataMapper;
