const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const dir = path.resolve(__dirname, '..');
const allFiles = fs.readdirSync(dir);
// Exclude merged output files from input
const xlsxFiles = allFiles.filter(f => f.endsWith('.xlsx') && !f.startsWith('~') && !f.includes('merged'));

console.log('Found xlsx files:');
xlsxFiles.forEach(f => console.log(`  ${f}`));

function extractFromFormat(raw) {
  if (!raw) return { code: '', description: '' };
  const s = String(raw).trim();
  // "CODE _ (Description)"
  const m = s.match(/^(\S+)\s+_\s+\((.+)\)\s*$/);
  if (m) return { code: m[1], description: m[2] };
  // "CODE - (Description)"
  const m2 = s.match(/^(\S+)\s*-\s*\((.+)\)\s*$/);
  if (m2) return { code: m2[1], description: m2[2] };
  return { code: s, description: '' };
}

function mapRow(row) {
  // Exact column name mapping for the known XLSX format
  const COL = {
    productGroup: 'Product Group (Model) (Product)',
    productType: 'Product Type (Model) (Product)',
    defectGroup: 'Defect Group (Defect) (Defect Code)',
    defect: 'Defect',
    defectDesc: 'Defect Description (Defect) (Defect Code)',
    model: 'Model',
    sparePart: 'Spare Part',
    defectMajor: 'Defect Major',
  };

  const get = (colName) => {
    // Try exact match first
    if (row[colName] !== undefined) return String(row[colName] || '').trim();
    // Fallback: find by partial match but prefer exact
    const keys = Object.keys(row);
    const k = keys.find(k => k === colName);
    if (k) return String(row[k] || '').trim();
    return '';
  };

  const modelRaw = get(COL.model);
  const spareRaw = get(COL.sparePart);
  const defectDescRaw = get(COL.defectDesc);
  const defectMajorRaw = get(COL.defectMajor);
  const defectRaw = get(COL.defect);

  const model = extractFromFormat(modelRaw);
  const spare = extractFromFormat(spareRaw);
  const defectDesc = extractFromFormat(defectDescRaw);
  const defectMajor = extractFromFormat(defectMajorRaw);

  return {
    ProductGroup:     get(COL.productGroup),
    ProductType:      get(COL.productType),
    Brand:            '',
    DefectGroup:      get(COL.defectGroup),
    DefectCode:       defectRaw || defectDesc.code,
    DefectDescription: defectDesc.description,
    ModelCode:        model.code,
    ModelDescription: model.description,
    SparePartCode:    spare.code,
    SparePartDescription: spare.description,
    DefectMajor:      defectMajor.code ? `${defectMajor.code} - (${defectMajor.description})` : defectMajorRaw,
    Price:            0,
  };
}

const allRows = [];
const seen = new Set();

for (const file of xlsxFiles) {
  const filePath = path.join(dir, file);
  console.log(`\nReading: ${file}`);
  const wb = XLSX.readFile(filePath, { type: 'file' });

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'hiddenSheet') continue;
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log(`  Sheet "${sheetName}": ${rawRows.length} rows`);

    for (const raw of rawRows) {
      const row = mapRow(raw);
      if (!row.ModelCode && !row.SparePartCode) continue;

      const key = `${row.ModelCode}|${row.SparePartCode}|${row.DefectCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
    }
  }
}

console.log(`\nTotal unique rows: ${allRows.length}`);
console.log(`Sample rows:`);
allRows.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. Model: ${r.ModelCode} | Part: ${r.SparePartCode} | Defect: ${r.DefectCode}`);
  console.log(`     ModelDesc: ${r.ModelDescription.substring(0, 60)}`);
  console.log(`     PartDesc: ${r.SparePartDescription.substring(0, 60)}`);
  console.log(`     DefectMajor: ${r.DefectMajor.substring(0, 60)}`);
});

// Write CSV with UTF-8 BOM
const ws = XLSX.utils.json_to_sheet(allRows);
const csv = XLSX.utils.sheet_to_csv(ws);
const BOM = '\uFEFF';
const outputPath = path.join(dir, 'master_data_merged.csv');
fs.writeFileSync(outputPath, BOM + csv, 'utf-8');
console.log(`\nWritten CSV: ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB)`);

// Also write XLSX
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws, 'MasterData');
const xlsxPath = path.join(dir, 'master_data_merged.xlsx');
XLSX.writeFile(wb2, xlsxPath);
console.log(`Written XLSX: ${xlsxPath} (${(fs.statSync(xlsxPath).size / 1024 / 1024).toFixed(1)} MB)`);
