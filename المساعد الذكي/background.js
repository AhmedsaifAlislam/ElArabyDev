// background.js — Service Worker
// Merged from: إضافة_كروم_قطع_الغيار/background.js + ElAraby-Chrome-Extension/background.js

importScripts('lib/papaparse.min.js', 'lib/xlsx.full.min.js', 'shared/arabic-utils.js', 'shared/data-mapper.js', 'shared/db.js', 'shared/smart-log.js');

// ── Fix double-encoded Arabic text (UTF-8 read as Windows-1256) ──
function fixDoubleEncodedText(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('\u00E2') && !text.includes('\u2122') && !text.includes('\u00A7')) return text;
  try {
    const bytes = new Uint8Array(text.length);
    let hasNonLatin = false;
    for (let i = 0; i < text.length; i++) {
      const cp = text.charCodeAt(i);
      if (cp > 255) { hasNonLatin = true; break; }
      bytes[i] = cp;
    }
    if (hasNonLatin) return text;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const arabicCount = (decoded.match(/[\u0600-\u06FF]/g) || []).length;
    const origArabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicCount >= origArabic ? decoded : text;
  } catch (e) { return text; }
}

function fixGarbledFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'string' && v.length > 2) {
      result[k] = fixDoubleEncodedText(v);
    }
  }
  return result;
}

// ── Shared File Parsing Utilities ──────────────────────────────
function decodeBytes(uint8arr, encoding) {
  try { return new TextDecoder(encoding, { fatal: true }).decode(uint8arr); }
  catch (e) { return null; }
}

function countArabic(str) {
  if (!str) return 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06FF) count++;
  }
  return count;
}

function parseFileContent(uint8) {
  const isXLSX = uint8.length > 2 && uint8[0] === 0x50 && uint8[1] === 0x4B;
  if (isXLSX) {
    const workbook = XLSX.read(uint8, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log(`[ElAraby] XLSX parsed: ${rows.length} rows from sheet "${sheetName}"`);
    return rows;
  }

  let bytes = uint8;
  if (uint8.length > 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    bytes = uint8.slice(3);
  }
  const encodings = ['utf-8', 'windows-1256', 'iso-8859-6'];
  let bestText = null, bestCount = 0;
  for (const enc of encodings) {
    const text = decodeBytes(bytes, enc);
    if (text) {
      const count = countArabic(text);
      console.log(`[ElAraby] Encoding ${enc}: ${count} Arabic chars`);
      if (count > bestCount) { bestCount = count; bestText = text; }
    }
  }
  const text = bestText || new TextDecoder('utf-8').decode(bytes);
  console.log(`[ElAraby] Best encoding has ${bestCount} Arabic chars`);

  const parsed = Papa.parse(text, {
    header: true, skipEmptyLines: true, dynamicTyping: false,
    transformHeader: h => h.trim().replace(/^\uFEFF/, ''),
  });
  const rows = parsed.data;
  console.log(`[ElAraby] CSV parsed: ${rows.length} rows`);
  return rows;
}

// ── Parse rows into master data format ──────────────────────

function parseRowsToMasterData(rows, tabId, clearFirst = true) {
  const BATCH_SIZE = 5000;
  let batch = [];
  let total = 0;
  let errors = 0;

  function extractFromFormat(raw) {
    if (!raw) return { code: '', description: '' };
    const s = String(raw).trim();
    const m = s.match(/^(\S+)\s+_\s+\((.+)\)\s*$/);
    if (m) return { code: m[1], description: m[2] };
    const m2 = s.match(/^(\S+)\s*-\s*\((.+)\)\s*$/);
    if (m2) return { code: m2[1], description: m2[2] };
    const m3 = s.match(/^(\S+)\s*-\s*(.+)$/);
    if (m3) return { code: m3[1], description: m3[2].trim() };
    return { code: s, description: '' };
  }

  const extractRows = async () => {
    if (clearFirst) await ElArabyDB.clearStore(ElArabyDB.STORES.masterData);

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const row = fixGarbledFields(raw);
      const keys = Object.keys(row);
      const find = (search) => {
        const k = keys.find(k => k.toLowerCase().includes(search.toLowerCase()));
        return k ? String(row[k] || '').trim() : '';
      };

      // Try mapping by exact key names (lowercase, alphanumeric only)
      const norm = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '')] = String(v || '').trim();
      }

      // Use DataMapper for intelligent column matching (supports Arabic/English headers)
      const dm = globalThis.DataMapper;
      const dmVal = (headers) => dm ? dm.findColumnValue(row, headers) : undefined;

      const modelRaw      = dmVal(dm.HEADERS.model) || find('Model') || norm.model || '';
      const spareRaw      = dmVal(dm.HEADERS.sparePart) || find('Spare Part') || norm.sparepart || norm.sparepartcode || '';
      const defectDescRaw = dmVal(dm.HEADERS.defectDesc) || find('Defect Description') || find('Defect') || norm.defect || norm.defectcode || '';
      const rawDefectMajor = dmVal(dm.HEADERS.defectMajor) || find('Defect Major') || norm.defectmajor || '';
      const rawMaxQty     = dmVal(dm.HEADERS.maxQuantity) || find('Quantity') || find('Max Quantity') || norm.maxquantity || norm.quantity || '';
      const priceRaw      = dmVal(dm.HEADERS.price) || find('Price') || norm.price || '';
      const groupRaw      = dmVal(dm.HEADERS.productGroup) || find('Product Group') || norm.productgroup || '';
      const typeRaw       = dmVal(dm.HEADERS.productType) || find('Product Type') || norm.producttype || '';

      const model = extractFromFormat(modelRaw);
      const spare = extractFromFormat(spareRaw);
      const defectDesc = extractFromFormat(defectDescRaw);
      const defectMajorParsed = extractFromFormat(rawDefectMajor);

      let maxQty = 0;
      if (rawMaxQty) maxQty = parseInt(String(rawMaxQty).replace(/[^\d]/g, '')) || 0;

      const item = {
        productGroup: groupRaw || typeRaw || '',
        productType: typeRaw || groupRaw || '',
        brand: '',
        defectGroup: '',
        defectCode: defectDesc.code || norm.defect || norm.defectcode || '',
        defectDescription: defectDesc.description || norm.defectdescription || '',
        modelCode: model.code || norm.model || norm.modelcode || '',
        modelDescription: model.description || norm.modeldescription || '',
        sparePartCode: spare.code || norm.sparepart || norm.sparepartcode || '',
        sparePartDescription: spare.description || norm.sparepartdescription || '',
        defectMajor: rawDefectMajor || defectMajorParsed.code || '',
        price: parseFloat(priceRaw.replace ? priceRaw.replace(/[^\d.]/g, '') : priceRaw) || 0,
        maxQuantity: maxQty,
        source: 'System'
      };

      if (!item.modelCode && !item.sparePartCode) continue;
      batch.push(item);
      total++;

      if (batch.length >= BATCH_SIZE) {
        try {
          await ElArabyDB.addBatch(ElArabyDB.STORES.masterData, batch);
        } catch (batchErr) {
          console.error(`[ElAraby] Batch failed at row ${i}:`, batchErr.message);
          errors += batch.length;
        }
        batch = [];
        if (tabId) {
          const pct = 55 + Math.round((i / rows.length) * 45);
          chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'parse', pct, count: total }).catch(() => {});
        }
      }
    }

    if (batch.length > 0) {
      try {
        await ElArabyDB.addBatch(ElArabyDB.STORES.masterData, batch);
      } catch (batchErr) {
        console.error(`[ElAraby] Final batch failed:`, batchErr.message);
        errors += batch.length;
      }
    }

    console.log(`[ElAraby] Import complete: ${total} parsed, ${errors} errors`);
  };

  return extractRows().then(() => total);
}

// ── Google Drive CSV/XLSX Import ────────────────────────────

async function fetchAndImportCSV(driveUrl, tabId) {
  let downloadUrl = driveUrl;

  const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const fileId = match[1];
    const warningRes = await fetch(
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      { credentials: 'omit' }
    );
    const html = await warningRes.text();
    const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/);
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
    if (confirmMatch) {
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}`;
      if (uuidMatch) downloadUrl += `&uuid=${uuidMatch[1]}`;
    } else {
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    }
  }

  const response = await fetch(downloadUrl, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: فشل تنزيل الملف`);

  const contentType = response.headers.get('Content-Type') || '';
  console.log(`[ElAraby] Download Content-Type: ${contentType}, URL: ${downloadUrl.substring(0, 80)}...`);

  const contentLength = response.headers.get('Content-Length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  let loadedBytes = 0;
  const chunks = [];

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.length;
    if (totalBytes > 0 && tabId) {
      const pct = Math.round((loadedBytes / totalBytes) * 50);
      chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'download', pct }).catch(() => {});
    }
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  if (tabId) chrome.tabs.sendMessage(tabId, { action: 'syncProgress', phase: 'parse', pct: 55, count: 0 }).catch(() => {});

  const rows = parseFileContent(merged);

  if (rows.length > 0) {
    console.log(`[ElAraby] Columns: ${Object.keys(rows[0]).join(', ')}`);
    console.log(`[ElAraby] First row sample:`, JSON.stringify(rows[0]).substring(0, 500));
  }

  const total = await parseRowsToMasterData(rows, tabId);
  console.log(`[ElAraby] Import done: ${total} records`);
  return total;
}

// ── Local File Import (bypasses Drive download) ──────────────
async function importFileData(uint8, fileName) {
  console.log(`[ElAraby] Local import: ${fileName} (${uint8.length} bytes)`);

  const rows = parseFileContent(uint8);

  if (rows.length > 0) {
    console.log(`[ElAraby] Columns: ${Object.keys(rows[0]).join(', ')}`);
  }

  const total = await parseRowsToMasterData(rows, null);
  console.log(`[ElAraby] Local import done: ${total} records`);
  return total;
}

// ── Inventory Scraper ──────────────────────────────────────

async function scrapeInventoryFromPortal() {
  const tabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
  if (tabs.length === 0) throw new Error('NO_PORTAL_TAB');

  const tabId = tabs[0].id;

  // Navigate to the inventory page
  const currentUrl = tabs[0].url || '';
  if (!currentUrl.includes('ProductInventoryList')) {
    await chrome.tabs.update(tabId, { url: 'https://elarabyportalpfs.powerappsportals.com/en-US/ProductInventoryList/' });
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Wait for table to load
  await new Promise(resolve => setTimeout(resolve, 2000));

  const allData = [];
  const seenCodes = new Set();
  let pageNum = 1;
  const maxPages = 50;

  while (pageNum <= maxPages) {
    console.log(`[ElAraby] Scraping inventory page ${pageNum}...`);

    const pageResult = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: () => {
        const data = [];

        // Find the main inventory table — look for table with header containing "كود قطع الغيار" or "part"
        function findMainTable() {
          const allTables = document.querySelectorAll('table');
          for (const table of allTables) {
            const headerRow = table.querySelector('thead tr, tr:first-child');
            if (!headerRow) continue;
            const headerText = headerRow.innerText.toLowerCase();
            if (headerText.includes('كود') || headerText.includes('part') || headerText.includes('قطع الغيار')) {
              return table;
            }
          }
          return null;
        }

        const mainTable = findMainTable();
        if (mainTable) {
          // Find column indices from headers
          const headerRow = mainTable.querySelector('thead tr, tr:first-child');
          const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.innerText.trim().toLowerCase());

          let codeIdx = headers.findIndex(h => h.includes('كود قطع الغيار') || h.includes('كود'));
          let descIdx = headers.findIndex(h => h.includes('وصف'));
          let locIdx = headers.findIndex(h => h.includes('مخزن') || h.includes('المخزن'));
          let qtyIdx = headers.findIndex(h => h.includes('كمية') || h.includes('الكمية'));

          // Fallback: positional (code=last, desc=2nd-to-last, loc=2nd, qty=1st)
          if (codeIdx < 0 && headers.length >= 4) {
            codeIdx = headers.length - 1;
            descIdx = headers.length - 2;
            locIdx = 1;
            qtyIdx = 0;
          }

          const bodyRows = mainTable.querySelectorAll('tbody tr');
          bodyRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            const code = (codeIdx >= 0 && cells[codeIdx]) ? cells[codeIdx].innerText.trim() : '';
            const description = (descIdx >= 0 && cells[descIdx]) ? cells[descIdx].innerText.trim() : '';
            const quantity = (qtyIdx >= 0 && cells[qtyIdx]) ? cells[qtyIdx].innerText.trim() : '0';
            const location = (locIdx >= 0 && cells[locIdx]) ? cells[locIdx].innerText.trim() : '';
            if (code && code.length > 1) data.push({ code, description, quantity, location });
          });
        }

        // Detect pagination — find current page and next page
        let nextExists = false;

        const allLinks = document.querySelectorAll('a, button, li, span');
        let currentPageNum = 0;

        // Method A: Look for active/selected numbered page
        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          const isActive = (el.classList && (el.classList.contains('active') || el.classList.contains('selected'))) ||
            (el.parentElement && el.parentElement.classList && (el.parentElement.classList.contains('active') || el.parentElement.classList.contains('selected'))) ||
            (el.getAttribute && el.getAttribute('aria-current') === 'page') ||
            (el.style && el.style.fontWeight === 'bold');
          if (isActive && /^\d+$/.test(text)) {
            currentPageNum = parseInt(text);
            break;
          }
        }

        // Method A2: Look for li.active with a number inside
        if (currentPageNum === 0) {
          const activeLi = document.querySelector('li.active, li.selected, .pagination .active, .page-item.active');
          if (activeLi) {
            const num = parseInt(activeLi.innerText.trim());
            if (num > 0) currentPageNum = num;
          }
        }

        // Method A3: Look for current page in URL hash or query
        if (currentPageNum === 0) {
          const urlMatch = window.location.search.match(/[?&]page=(\d+)/i);
          if (urlMatch) currentPageNum = parseInt(urlMatch[1]);
        }

        // Find a link with page number = currentPage + 1
        if (currentPageNum > 0) {
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            if (text === String(currentPageNum + 1)) {
              nextExists = true;
              break;
            }
          }
        }

        // Method B: Look for ">" or "التالي" or "Next" arrow
        if (!nextExists) {
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            const parent = el.parentElement;
            const isNext = text === '>' || text === '›' || text === '›' || text === 'التالي' || text === 'Next' || text === '›' ||
              (parent && parent.classList && parent.classList.contains('next'));
            const isDisabled = el.classList.contains('disabled') || el.disabled ||
              (parent && parent && parent.classList && parent.classList.contains('disabled'));
            if (isNext && !isDisabled) {
              nextExists = true;
              break;
            }
          }
        }

        // Method C: Check if there are more than current page number links
        if (!nextExists) {
          const pageNums = [];
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            if (/^\d+$/.test(text)) pageNums.push(parseInt(text));
          }
          const maxPage = Math.max(...pageNums, 0);
          if (maxPage > currentPageNum) nextExists = true;
        }

        // Method D: If table has > 10 rows, likely has more pages
        if (!nextExists && result && result.rowCount >= 10) {
          const paginationNav = document.querySelector('nav, .pagination, ul.pagination, [role="navigation"]');
          if (paginationNav) nextExists = true;
        }

        return { data, nextExists, rowCount: data.length, currentPage: currentPageNum };
      }
    });

    const result = pageResult[0]?.result || { data: [], nextExists: false, rowCount: 0, currentPage: 0 };

    // Add unique items
    for (const item of result.data) {
      if (!seenCodes.has(item.code)) {
        seenCodes.add(item.code);
        allData.push(item);
      }
    }

    console.log(`[ElAraby] Page ${pageNum} (portal page ${result.currentPage}): ${result.data.length} rows scraped, total unique: ${allData.length}, nextExists: ${result.nextExists}`);

    if (!result.nextExists || result.rowCount === 0) break;

    // Click next page — click the link for currentPage + 1
    const clicked = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: (currentPage) => {
        const allLinks = document.querySelectorAll('a, button, li');

        // First try: click the exact page number link
        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          if (text === String(currentPage + 1) && el.tagName !== 'LI') {
            el.click();
            return true;
          }
        }

        // Second try: click ">" or next arrow
        for (const el of allLinks) {
          const text = (el.innerText || '').trim();
          const parent = el.parentElement;
          const isNext = text === '>' || text === '›' || text === 'التالي' || text === 'Next' ||
            (parent && parent.classList && parent.classList.contains('next'));
          const isDisabled = el.classList.contains('disabled') || el.disabled ||
            (parent && parent && parent.classList && parent.classList.contains('disabled'));
          if (isNext && !isDisabled) {
            el.click();
            return true;
          }
        }

        // Third try: click li.next or .next-page
        const nextEl = document.querySelector('li.next:not(.disabled), .next-page:not(.disabled), a[rel="next"]');
        if (nextEl) { nextEl.click(); return true; }

        return false;
      },
      args: [result.currentPage || pageNum]
    });

    const didClick = clicked[0]?.result || false;
    if (!didClick) {
      console.log(`[ElAraby] Could not click next page, stopping.`);
      break;
    }

    // Wait for page to load — check if table content actually changed
    const prevFirstCode = result.data[0]?.code || '';
    let waitAttempts = 0;
    while (waitAttempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitAttempts++;

      const check = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: () => {
          const allTables = document.querySelectorAll('table');
          for (const table of allTables) {
            const headerRow = table.querySelector('thead tr, tr:first-child');
            if (!headerRow) continue;
            const headerText = headerRow.innerText.toLowerCase();
            if (headerText.includes('كود') || headerText.includes('part')) {
              const firstRow = table.querySelector('tbody tr');
              if (!firstRow) return '';
              const cells = firstRow.querySelectorAll('td');
              return cells[cells.length - 1]?.innerText?.trim() || '';
            }
          }
          return '';
        }
      });
      const newFirstCode = check[0]?.result || '';
      if (newFirstCode && newFirstCode !== prevFirstCode) {
        console.log(`[ElAraby] Page loaded, new first code: ${newFirstCode}`);
        break;
      }
    }

    pageNum++;
  }

  // Store results in IndexedDB instead of returning via message
  await ElArabyDB.clearStore(ElArabyDB.STORES.inventory);
  const BATCH_SIZE = 500;
  let batch = [];
  let stored = 0;
  for (const item of allData) {
    batch.push({
      sparePartCode: item.code,
      sparePartDescription: item.description || '',
      quantity: parseFloat(item.quantity) || 0,
      location: item.location || '',
    });
    if (batch.length >= BATCH_SIZE) {
      await ElArabyDB.addBatch(ElArabyDB.STORES.inventory, batch);
      batch = [];
    }
  }
  if (batch.length > 0) await ElArabyDB.addBatch(ElArabyDB.STORES.inventory, batch);
  stored = allData.length;

  console.log(`[ElAraby] Total inventory items scraped: ${stored}`);
  return { count: stored };
}

// ── Message Router ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const handle = async () => {
    switch (msg.action) {

      case 'openDashboard':
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
        return { ok: true };

      case 'getDBCount':
        return { count: await ElArabyDB.countDB(ElArabyDB.STORES.masterData) };

      case 'getPreview':
        return { data: await ElArabyDB.getPreview(ElArabyDB.STORES.masterData, msg.limit || 50) };

      case 'searchDB': {
        let filters;
        if (typeof msg.query === 'string') {
          const q = msg.query.trim();
          const forceKeyword = q.startsWith('*');
          if (forceKeyword) {
            filters = { model: '', part: '', defect: '', keyword: q };
          } else {
            const looksLikePartCode = /^[A-Z0-9]{2,}[.\-_]/i.test(q);
            const looksLikeModel = /^[A-Z]{2}\d/i.test(q) && q.length < 20;
            filters = {
              model: looksLikeModel ? q : '',
              part: looksLikePartCode ? q : '',
              defect: '',
              keyword: (!looksLikeModel && !looksLikePartCode) ? q : '',
            };
          }
        } else {
          filters = msg.query || { model: msg.model || '', part: msg.part || '', defect: msg.defect || '', keyword: msg.keyword || '', productType: msg.productType || '', defectMajor: msg.defectMajor || '', defectDescription: msg.defectDescription || '' };
        }
        return { data: await ElArabyDB.searchDB(filters, 100) };
      }

      case 'getPricesForCodes':
        return await ElArabyDB.getPricesForCodes(msg.codes || []);

      case 'clearDB':
        await ElArabyDB.clearStore(ElArabyDB.STORES.masterData);
        return { ok: true };

      case 'syncDrive': {
        const total = await fetchAndImportCSV(msg.url, msg.tabId);
        return { total };
      }

      case 'importLocalFile': {
        const uint8 = new Uint8Array(msg.fileData);
        const fileName = msg.fileName || '';
        const total = await importFileData(uint8, fileName);
        return { total };
      }

      case 'importLocalChunk': {
        const rows = msg.rows || [];
        const isFirst = msg.isFirst || false;
        if (rows.length > 0) {
          const batchTotal = await parseRowsToMasterData(rows, null, isFirst);
          console.log(`[ElAraby] Chunk imported: ${batchTotal} records`);
        }
        const count = await ElArabyDB.countDB(ElArabyDB.STORES.masterData);
        return { total: count };
      }

      case 'scrapeInventory':
        return await scrapeInventoryFromPortal();

      case 'injectData': {
        const tabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
        if (tabs.length === 0) return { error: 'NO_PORTAL_TAB' };
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'injectData', data: msg.data }, (res) => {
            if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
            else resolve(res || { error: 'NO_RESPONSE' });
          });
        });
      }

      case 'injectCart': {
        const portalTabs = await chrome.tabs.query({ url: 'https://elarabyportalpfs.powerappsportals.com/*' });
        if (portalTabs.length === 0) return { error: 'NO_PORTAL_TAB' };
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(portalTabs[0].id, { action: 'injectCart', items: msg.items || [] }, (res) => {
            if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
            else resolve(res || { error: 'NO_RESPONSE' });
          });
        });
      }

      case 'checkCodesStatus':
        return await ElArabyDB.checkCodesStatus(msg.parts, msg.defects);

      case 'updatePartPrice':
        return { ok: await ElArabyDB.updatePartPrice(msg.code, msg.price, msg.description) };

      case 'updateDefectCode':
        return { ok: await ElArabyDB.updateDefectCode(msg.code, msg.description, msg.major) };

      case 'importMasterData': {
        const stats = await ElArabyDB.addMasterDataItems(msg.items || [], msg.isFirst !== false);
        return stats;
      }

      case 'getInventory':
        return { data: await ElArabyDB.getInventory() };

      case 'getInventoryFull':
        return { data: await ElArabyDB.getInventoryWithMasterData() };

      case 'getInventoryFilters':
        return await ElArabyDB.getInventoryFilters();

      case 'getMasterDataFilters':
        return await ElArabyDB.getMasterDataFilters();

      case 'getLocations':
        return { data: await ElArabyDB.getExistingLocations() };

      case 'LOG_EVENT':
        await SmartLog.addEntry(msg.actionType, msg.details || {});
        return { ok: true };

      case 'GET_LOG':
        return { entries: await SmartLog.getEntries(msg.limit || 500) };

      case 'CLEAR_LOG':
        await SmartLog.clearAll();
        return { ok: true };

      default:
        return { error: 'unknown action: ' + msg.action };
    }
  };

  handle().then(respond).catch(err => {
    console.error('[ElAraby] Error in', msg.action, err);
    respond({ error: err.message });
  });
  return true;
});

// ── Periodic sync alarm ──
chrome.alarms.create('elaraby-sync', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'elaraby-sync') {
    console.log('[ElAraby] Periodic sync alarm fired');
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ElAraby] Extension installed v1.0.0');
});

// ── Icon click → toggle panel on active tab ──
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) return;
  chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }).catch(() => {});
});
