const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Replicating logic from dataService.ts for consistency
const normalizeHeader = (header) => {
    return header.trim().toLowerCase().replace(/[\s_-]/g, '');
};

const findColumnValue = (row, possibleHeaders) => {
    const rowKeys = Object.keys(row);
    for (const header of possibleHeaders) {
        if (row[header] !== undefined) return String(row[header]);
    }
    const normalizedPossible = possibleHeaders.map(normalizeHeader);
    const foundKey = rowKeys.find(key => normalizedPossible.includes(normalizeHeader(key)));
    return foundKey ? String(row[foundKey]) : undefined;
};

const parseField = (value) => {
    if (!value) return { code: '', description: '' };
    let parts = value.split(' _ ');
    if (parts.length < 2) parts = value.split(' - ');
    if (parts.length > 1) {
        return { code: parts[0].trim(), description: parts.slice(1).join(' ').trim() };
    }
    return { code: value.trim(), description: '' };
};

const extractBrand = (text) => {
    if (!text) return 'غير محدد';
    const knownBrands = ['sharp', 'hoover', 'tornado', 'toshiba', 'sony', 'lg', 'samsung'];
    const lowerText = text.toLowerCase();
    for (const brand of knownBrands) {
        if (lowerText.includes(brand)) {
            return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
    }
    const match = text.match(/\(([^-\s)]+)/);
    if (match && match[1]) {
        return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    }
    return 'غير محدد';
};

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
        'مجموعة المنتج', 'الفئة', 'المجموعة', 'Product Group (Model) (Product)'
    ],
    productType: [
        'Product Type', 'Type', 'Description',
        'نوع المنتج', 'النوع', 'الصنف', 'Product Type (Model) (Product)'
    ],
    defect: [
        'Defect', 'Defect Code', 'Symptom',
        'العطل', 'كود العطل', 'المشكلة'
    ],
    defectDesc: [
        'Defect Description', 'Symptom Description',
        'وصف العطل', 'شرح العطل', 'Defect Description (Defect) (Defect Code)'
    ]
};

const mapRow = (row, index) => {
    const rawSparePart = findColumnValue(row, HEADERS.sparePart);
    const rawModel = findColumnValue(row, HEADERS.model);
    const rawPrice = findColumnValue(row, HEADERS.price);
    const rawGroup = findColumnValue(row, HEADERS.productGroup);
    const rawType = findColumnValue(row, HEADERS.productType);
    const rawDefect = findColumnValue(row, HEADERS.defect);
    const rawDefectDesc = findColumnValue(row, HEADERS.defectDesc);

    const sparePartParsed = parseField(rawSparePart);
    const modelParsed = parseField(rawModel);
    const brand = extractBrand(rawModel || rawType || '');

    let price = 0;
    if (rawPrice) {
        const cleanPrice = String(rawPrice).replace(/[^\d.]/g, '');
        price = parseFloat(cleanPrice);
        if (isNaN(price)) price = 0;
    }

    return {
        productGroup: rawGroup || 'General',
        productType: rawType || '',
        brand: brand,
        defectGroup: row['Defect Group (Defect) (Defect Code)'] || '',
        defectCode: rawDefect || '',
        defectDescription: rawDefectDesc || '',
        modelCode: modelParsed.code || rawModel || '',
        modelDescription: modelParsed.description || '',
        sparePartCode: sparePartParsed.code,
        sparePartDescription: sparePartParsed.description || '',
        defectMajor: row['Defect Major'] || '',
        maxQuantity: parseFloat(row['Spare Part Max Quantity']) || 0,
        createdOn: row['Created On'] || new Date().toISOString(),
        price: price
    };
};

const files = [
    'أكواد قطع الغيار تكييف Active Model_Defect_SP 24-09-2023 10-47-34 ص.xlsx',
    'أكوادمنزليهActive Model_Defect_SP 01-10-2023 02-41-48 م (1).xlsx'
];

let allData = [];

console.log('Processing files...');

files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${file}`);
        return;
    }
    console.log(`Reading ${file}...`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Mapping ${json.length} rows from ${file}...`);
    const mapped = json.map((row, i) => mapRow(row, i)).filter(item => item.sparePartCode);
    allData = allData.concat(mapped);
    console.log(`Total records so far: ${allData.length}`);
});

console.log('Writing to public/masterData.json...');
fs.writeFileSync(path.join(process.cwd(), 'public', 'masterData.json'), JSON.stringify(allData));
console.log('Successfully generated public/masterData.json');
