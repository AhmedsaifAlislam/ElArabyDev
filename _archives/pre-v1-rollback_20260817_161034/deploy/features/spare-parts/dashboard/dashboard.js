// dashboard.js — مساعد قطع الغيار العربي v2.1

// ── Helpers ─────────────────────────────────────────────────
// bg() و logEvent() من shared/storage-proxy.js و shared/smart-log.js

function showAlert(id, msg, type = 'info') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert ${type}`;
}

function hideAlert(id) {
  document.getElementById(id).className = 'alert';
}

// ── Tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
  });
});

// ── Sync Mode Toggle (Drive vs Local) ───────────────────────
let localFileData = null;

function showSyncMode(mode) {
  const driveMode = document.getElementById('syncDriveMode');
  const localMode = document.getElementById('syncLocalMode');
  const tabDrive = document.getElementById('tabDrive');
  const tabLocal = document.getElementById('tabLocal');
  if (mode === 'local') {
    driveMode.style.display = 'none';
    localMode.style.display = 'block';
    tabDrive.classList.remove('active');
    tabLocal.classList.add('active');
  } else {
    driveMode.style.display = 'block';
    localMode.style.display = 'none';
    tabDrive.classList.add('active');
    tabLocal.classList.remove('active');
  }
}
// ── Init sync tabs ──
document.getElementById('tabDrive')?.addEventListener('click', () => showSyncMode('drive'));
document.getElementById('tabLocal')?.addEventListener('click', () => showSyncMode('local'));

// ── Local File Upload ────────────────────────────────────────
document.getElementById('localFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('localFileName').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  localFileData = file;
  document.getElementById('localFileReady').style.display = 'block';
});

document.getElementById('btnLocalImport')?.addEventListener('click', async () => {
  if (!localFileData) return;
  const btn = document.getElementById('btnLocalImport');
  btn.disabled = true;
  btn.textContent = '⏳ جاري قراءة الملف...';

  const progressWrap = document.getElementById('progressWrap');
  progressWrap.style.display = 'block';
  document.getElementById('progressFill').style.width = '10%';
  document.getElementById('progressLabel').textContent = '📂 جاري قراءة الملف...';
  hideAlert('syncAlert');

  try {
    const arrayBuffer = await localFileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    document.getElementById('progressFill').style.width = '20%';
    document.getElementById('progressLabel').textContent = '⚙️ جاري تحليل الملف محلياً...';

    // Parse in the dashboard (XLSX and Papa are loaded here)
    let rows = [];
    const isXLSX = uint8.length > 2 && uint8[0] === 0x50 && uint8[1] === 0x4B;

    if (isXLSX) {
      const workbook = XLSX.read(uint8, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      console.log(`[Dashboard] XLSX parsed: ${rows.length} rows`);
    } else {
      // Detect encoding
      let bytes = uint8;
      if (uint8.length > 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
        bytes = uint8.slice(3);
      }
      function decodeAndCount(enc) {
        try {
          const text = new TextDecoder(enc, { fatal: true }).decode(bytes);
          let arabic = 0;
          for (let i = 0; i < Math.min(text.length, 5000); i++) {
            const c = text.charCodeAt(i);
            if (c >= 0x0600 && c <= 0x06FF) arabic++;
          }
          return { text, arabic };
        } catch(e) { return null; }
      }
      let best = null;
      for (const enc of ['utf-8', 'windows-1256', 'iso-8859-6']) {
        const r = decodeAndCount(enc);
        if (r && (!best || r.arabic > best.arabic)) best = r;
      }
      const text = best?.text || new TextDecoder('utf-8').decode(bytes);
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false,
        transformHeader: h => h.trim().replace(/^\uFEFF/, '') });
      rows = parsed.data;
      console.log(`[Dashboard] CSV parsed: ${rows.length} rows`);
    }

    document.getElementById('progressFill').style.width = '50%';
    document.getElementById('progressLabel').textContent = `⚙️ جاري حفظ ${rows.length.toLocaleString('ar-EG')} سجل...`;

    // Send parsed rows in batches to background (avoids 64MB message limit)
    const BATCH = 10000;
    let totalSaved = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const isFirst = i === 0;
      const res = await bg('importLocalChunk', { rows: chunk, isFirst });
      if (res?.error) throw new Error(res.error);
      totalSaved = res?.total || totalSaved;
      const pct = 50 + Math.round((i / rows.length) * 45);
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('progressLabel').textContent = `⚙️ جاري الحفظ: ${Math.min(i + BATCH, rows.length).toLocaleString('ar-EG')} / ${rows.length.toLocaleString('ar-EG')}`;
    }

    localStorage.setItem('lastSync', new Date().toISOString());
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressLabel').textContent = `✅ اكتمل! تم حفظ ${totalSaved.toLocaleString('ar-EG')} سجل`;
    showAlert('syncAlert', `✅ تمت المزامنة بنجاح — ${totalSaved.toLocaleString('ar-EG')} سجل محفوظ`, 'success');
    logEvent('import', { fileName: localFileData?.name || 'ملف محلي', rowCount: totalSaved });

    await loadStats();
    await loadPreview();
    await loadFilters();
  } catch(err) {
    showAlert('syncAlert', `❌ فشل: ${err.message}`, 'error');
    progressWrap.style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = '⬆️ رفع واستيراد الآن';
  }
});

// ── SYNC TAB ─────────────────────────────────────────────────

function renderRows(data, tbody) {
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="no-data"><p>لا توجد نتائج</p></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td style="font-size:12px;">${r.productType || '–'}</td>
      <td><span class="text-mono">${r.modelCode || '–'}</span><br><span class="text-muted">${r.modelDescription || ''}</span></td>
      <td style="font-size:11px; max-width:180px;">${(r.defectMajor || '').substring(0,35)}</td>
      <td><span class="badge badge-orange">${r.defectCode || '–'}</span><br><span class="text-muted">${(r.defectDescription || '').substring(0,40)}</span></td>
      <td><strong class="text-mono">${r.sparePartCode || '–'}</strong></td>
      <td style="text-align:center;">${r.maxQuantity > 0 ? r.maxQuantity : '–'}</td>
    </tr>
  `).join('');
}

// ── Filter relationship data for cascading ──
let filterRelations = { modelsByType: {}, defectMajorsByModel: {}, defectDescsByMajor: {} };
let currentFilterValues = { productType: '', model: '', defectMajor: '', defectDesc: '' };

async function loadFilters() {
  const res = await bg('getMasterDataFilters');
  if (!res) {
    console.warn('loadFilters: getMasterDataFilters returned null');
    return;
  }
  filterRelations = { modelsByType: res.modelsByType || {}, defectMajorsByModel: res.defectMajorsByModel || {}, defectDescsByMajor: res.defectDescsByMajor || {} };
  // Populate all 4 selects silently
  populateSelect('fAdvProductGroup', res.productTypes || [], 'المنتجات', true);
  const allModels = [...new Set(Object.values(filterRelations.modelsByType).flat())].sort();
  populateSelect('fAdvBrand', allModels.length ? allModels : (res.models || []), 'الموديلات', true);
  const allMajors = [...new Set(Object.values(filterRelations.defectMajorsByModel).flat())].sort();
  populateSelect('fAdvModel', allMajors.length ? allMajors : (res.defectMajors || []), 'العطل الرئيسي', true);
  const allDescs = [...new Set(Object.values(filterRelations.defectDescsByMajor).flat())].sort();
  populateSelect('fAdvDefect', allDescs.length ? allDescs : (res.defectDescs || []), 'العطل الفرعي', true);
}

function populateSelect(id, items, label, silent) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = `<option value="">${label}</option>` + items.map(v => `<option value="${v}">${v}</option>`).join('');
  sel.value = items.includes(currentVal) ? currentVal : '';
  if (!silent) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function cascadeModels(silent) {
  const type = document.getElementById('fAdvProductGroup')?.value || '';
  currentFilterValues.productType = type;
  currentFilterValues.model = '';
  currentFilterValues.defectMajor = '';
  currentFilterValues.defectDesc = '';
  const models = type ? (filterRelations.modelsByType[type] || []) : [...new Set(Object.values(filterRelations.modelsByType).flat())].sort();
  populateSelect('fAdvBrand', models, 'الموديلات', silent);
}

function cascadeMajors() {
  const md = document.getElementById('fAdvBrand')?.value || '';
  currentFilterValues.model = md;
  currentFilterValues.defectMajor = '';
  currentFilterValues.defectDesc = '';
  const majors = md ? (filterRelations.defectMajorsByModel[md] || []) : [...new Set(Object.values(filterRelations.defectMajorsByModel).flat())].sort();
  populateSelect('fAdvModel', majors, 'العطل الرئيسي');
}

function cascadeDefects(silent) {
  const maj = document.getElementById('fAdvModel')?.value || '';
  currentFilterValues.defectMajor = maj;
  currentFilterValues.defectDesc = '';
  const descs = maj ? (filterRelations.defectDescsByMajor[maj] || []) : [...new Set(Object.values(filterRelations.defectDescsByMajor).flat())].sort();
  populateSelect('fAdvDefect', descs, 'العطل الفرعي', silent);
}

// ── Searchable Dropdown Widget ──
// Converts a <select> into a searchable input + dropdown overlay
function enhanceSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select || select.dataset.enhanced) return;
  select.dataset.enhanced = '1';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative; flex:1; min-width:0;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = select.options[0]?.textContent || 'اختر...';
  input.style.cssText = 'width:100%; padding:9px 30px 9px 12px; border:1.5px solid #e2e8f0; border-radius:9px; font-family:\'Cairo\',sans-serif; font-size:13px; background:#fff; outline:none; cursor:pointer; box-sizing:border-box;';
  input.autocomplete = 'off';

  const arrow = document.createElement('span');
  arrow.textContent = '▼';
  arrow.style.cssText = 'position:absolute; left:8px; top:50%; transform:translateY(-50%); font-size:10px; color:#94a3b8; pointer-events:none; transition:transform 0.2s;';

  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'position:absolute; top:100%; left:0; right:0; max-height:250px; overflow-y:auto; background:#fff; border:1px solid #e2e8f0; border-radius:9px; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:1000; display:none; margin-top:2px;';

  select.style.display = 'none';
  select.insertAdjacentElement('afterend', wrapper);
  wrapper.appendChild(input);
  wrapper.appendChild(arrow);
  wrapper.appendChild(dropdown);

  let isOpen = false;
  let allOptions = [];

  function getOptions() {
    return Array.from(select.options).slice(1).map(o => ({ value: o.value, label: o.textContent }));
  }

  function renderDropdown(filter = '') {
    const f = filter.toLowerCase();
    allOptions = getOptions();
    const filtered = f ? allOptions.filter(o => o.label.toLowerCase().includes(f)) : allOptions;
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8; font-size:12px;">لا توجد نتائج</div>';
      return;
    }
    dropdown.innerHTML = filtered.map((o, i) =>
      `<div data-idx="${i}" style="padding:8px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid #f1f5f9; transition:background 0.1s;${o.value === select.value ? ' background:#eff6ff; font-weight:700;' : ''}">${o.label}</div>`
    ).join('');
    dropdown.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = '#f8fafc');
      el.addEventListener('mouseleave', () => el.style.background = '');
      el.addEventListener('click', () => {
        const opt = filtered[parseInt(el.dataset.idx)];
        select.value = opt.value;
        input.value = opt.label;
        input.style.color = '#1e293b';
        closeDropdown();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  function openDropdown() {
    if (!isOpen) {
      isOpen = true;
      dropdown.style.display = 'block';
      arrow.style.transform = 'translateY(-50%) rotate(180deg)';
      renderDropdown(input.value);
    }
  }

  function closeDropdown() {
    isOpen = false;
    dropdown.style.display = 'none';
    arrow.style.transform = 'translateY(-50%) rotate(0deg)';
  }

  function syncFromSelect() {
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) {
      input.value = opt.textContent;
      input.style.color = '#1e293b';
    } else {
      input.value = '';
      input.style.color = '#94a3b8';
    }
    if (select.value) input.placeholder = opt?.textContent || select.options[0]?.textContent || 'اختر...';
  }

  input.addEventListener('focus', () => { openDropdown(); });
  input.addEventListener('blur', () => setTimeout(closeDropdown, 200));
  input.addEventListener('input', () => {
    if (isOpen) renderDropdown(input.value);
    else openDropdown();
  });
  input.addEventListener('click', () => { if (!isOpen) openDropdown(); else closeDropdown(); });

  // Sync when select changes (from cascading)
  select.addEventListener('change', syncFromSelect);

  syncFromSelect();
}

// ── Setup filters after load ──
function setupFilterEvents() {
  document.getElementById('fAdvProductGroup')?.addEventListener('change', () => {
    cascadeModels();
    doSearch();
  });
  document.getElementById('fAdvBrand')?.addEventListener('change', () => {
    cascadeMajors();
    doSearch();
  });
  document.getElementById('fAdvModel')?.addEventListener('change', () => {
    cascadeDefects();
    doSearch();
  });
  document.getElementById('fAdvDefect')?.addEventListener('change', () => {
    doSearch();
  });
}

async function loadStats() {
  const res = await bg('getDBCount');
  const count = res?.count || 0;
  document.getElementById('statCount').textContent = count.toLocaleString('ar-EG');

  if (count > 0) {
    document.getElementById('statStatus').textContent = '✅ جاهزة';
    document.getElementById('statStatusSub').textContent = 'قاعدة البيانات مكتملة';
  } else {
    document.getElementById('statStatus').textContent = '⚠️ فارغة';
    document.getElementById('statStatusSub').textContent = 'قم بالمزامنة أولاً';
  }

  const lastSync = localStorage.getItem('lastSync');
  document.getElementById('statLastSync').textContent = lastSync
    ? new Date(lastSync).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'لم تتم بعد';
}

async function loadPreview() {
  const res = await bg('getPreview', { limit: 50 });
  const data = res?.data || [];

  document.getElementById('tableTitle').style.display = '';
  document.getElementById('tableControls').style.display = 'none';

  if (data.length === 0) {
    document.getElementById('dataBody').innerHTML = `<tr><td colspan="6" class="no-data"><p>قاعدة البيانات فارغة</p><span>قم بمزامنة البيانات أولاً</span></td></tr>`;
    return;
  }

  renderRows(data, document.getElementById('dataBody'));
}

// Listen for progress messages from background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'syncProgress') {
    const fill  = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    if (!fill || !label) return;
    fill.style.width = msg.pct + '%';
    if (msg.phase === 'download') {
      label.textContent = `📥 جاري التنزيل: ${msg.pct}%`;
    } else {
      label.textContent = `⚙️ جاري المعالجة: ${msg.pct}% — ${(msg.count || 0).toLocaleString('ar-EG')} سجل`;
    }
  }
});

document.getElementById('btnSync').addEventListener('click', async () => {
  const url = document.getElementById('driveUrl').value.trim();
  if (!url) { showAlert('syncAlert', 'يرجى إدخال رابط Google Drive', 'error'); return; }

  const btn = document.getElementById('btnSync');
  btn.disabled = true;
  btn.textContent = '⏳ جاري المزامنة...';

  const progressWrap = document.getElementById('progressWrap');
  progressWrap.style.display = 'block';
  document.getElementById('progressFill').style.width = '3%';
  document.getElementById('progressLabel').textContent = '🔗 جاري الاتصال بـ Google Drive...';
  hideAlert('syncAlert');

  try {
    const res = await bg('syncDrive', { url });

    if (res?.error) throw new Error(res.error);

    const total = res?.total || 0;
    localStorage.setItem('lastSync', new Date().toISOString());
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressLabel').textContent = `✅ اكتمل! تم حفظ ${total.toLocaleString('ar-EG')} سجل`;
    showAlert('syncAlert', `✅ تمت المزامنة بنجاح — ${total.toLocaleString('ar-EG')} سجل محفوظ`, 'success');
    logEvent('import', { fileName: url.substring(0, 60), rowCount: total });

    await loadStats();
    await loadPreview();
    await loadFilters();

  } catch(err) {
    showAlert('syncAlert', `❌ فشل: ${err.message}`, 'error');
    const pw = document.getElementById('progressWrap');
    if (pw) pw.style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇️ مزامنة الآن';
  }
});

// ── SEARCH TAB ───────────────────────────────────────────────

// ── SEARCH (Unified *pattern) ───────────────────────────────

let searchResults = [];
let searchDebounce = null;

async function doSearch() {
  const keyword = document.getElementById('fAdvKeyword')?.value.trim() || '';
  if (!keyword) { loadPreview(); return; }

  document.getElementById('searchSpinner').style.display = 'flex';
  document.getElementById('btnSearch').disabled = true;

  const type = document.getElementById('fAdvProductGroup')?.value || '';
  const model = document.getElementById('fAdvBrand')?.value || '';
  const defectMajor = document.getElementById('fAdvModel')?.value || '';
  const defectDesc = document.getElementById('fAdvDefect')?.value || '';

  try {
    const res = await bg('searchDB', { productType: type, model: model, part: keyword, defectMajor: defectMajor, defectDescription: defectDesc, keyword: keyword });
    searchResults = res?.data || [];
  } catch(e) {
    searchResults = [];
  }

  document.getElementById('searchSpinner').style.display = 'none';
  document.getElementById('btnSearch').disabled = false;

  showSearchResults();
  if (keyword) logEvent('search', { query: keyword, resultsCount: searchResults.length });
}

function showSearchResults() {
  document.getElementById('tableTitle').style.display = 'none';
  document.getElementById('tableControls').style.display = 'flex';
  document.getElementById('advResultCount').textContent = searchResults.length;
  renderRows(searchResults.slice(0, 300), document.getElementById('dataBody'));
}

function resetToPreview() {
  document.getElementById('tableTitle').style.display = '';
  document.getElementById('tableControls').style.display = 'none';
  document.getElementById('advResultCount').textContent = '0';
  searchResults = [];
  loadPreview();
}

document.getElementById('fAdvKeyword')?.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(doSearch, 350);
});
document.getElementById('btnSearch')?.addEventListener('click', doSearch);

setupFilterEvents();

document.getElementById('btnClearSearch')?.addEventListener('click', () => {
  document.getElementById('fAdvKeyword').value = '';
  document.getElementById('fAdvProductGroup').selectedIndex = 0;
  document.getElementById('fAdvProductGroup').dispatchEvent(new Event('change', { bubbles: true }));
  resetToPreview();
});

document.getElementById('btnExportSearch')?.addEventListener('click', () => {
  if (!searchResults.length) return;
  exportToExcel(searchResults.map(r => ({
    'المنتج':        r.productType || '',
    'الموديل':       r.modelCode || '',
    'العطل الرئيسي': r.defectMajor || '',
    'كود العطل':     r.defectCode || '',
    'وصف العطل':     r.defectDescription || '',
    'قطعة الغيار':    r.sparePartCode || '',
    'أقصى كمية':     r.maxQuantity || 0,
  })), 'بحث_قطع_الغيار.xlsx');
});

// ── INVENTORY TAB ─────────────────────────────────────────────

let inventoryData = [];

document.getElementById('btnScrape').addEventListener('click', async () => {
  const btn = document.getElementById('btnScrape');
  btn.textContent = '⏳ جاري السحب...';
  btn.disabled = true;
  hideAlert('invAlert');

  try {
    const res = await bg('scrapeInventory');

    if (res?.error === 'NO_PORTAL_TAB') {
      throw new Error('لم يتم العثور على تبويب البورتال. افتح صفحة العهدة في بورتال العربي (Partner Portal) في أي تبويب أولاً.');
    }

    const scrapedCount = res?.count || 0;

    if (scrapedCount === 0) {
      throw new Error('لم يتم العثور على جدول بيانات في صفحة البورتال. تأكد أنك في صفحة "العهدة المتاحة" وأن الجدول ظاهر على الشاشة.');
    }

    showAlert('invAlert', `⏳ تم سحب ${scrapedCount} صنف — جاري جلب الأسعار من قاعدة البيانات...`, 'info');

    // Read inventory from IndexedDB
    const invRes = await bg('getInventory');
    const invData = invRes?.data || [];

    // Get prices from master data
    const codes = invData.map(i => i.sparePartCode);
    const pricesRes = await bg('getPricesForCodes', { codes });
    const { priceMap = {}, descMap = {} } = pricesRes || {};

    inventoryData = invData.map(item => {
      const key = (item.sparePartCode || '').trim().toLowerCase();
      const price = priceMap[key] || 0;
      const qty = item.quantity || 0;
      return {
        code: item.sparePartCode,
        description: item.description || descMap[key] || '–',
        quantity: qty,
        location: item.location || '–',
        price,
        total: price * qty,
      };
    });

    const totalQty   = inventoryData.reduce((s, r) => s + r.quantity, 0);
    const totalValue = inventoryData.reduce((s, r) => s + r.total, 0);

    document.getElementById('invCount').textContent = inventoryData.length.toLocaleString('ar-EG');
    document.getElementById('invQty').textContent   = totalQty.toLocaleString('ar-EG');
    document.getElementById('invValue').textContent = totalValue.toLocaleString('ar-EG') + ' ج.م';

    document.getElementById('invStats').style.display = 'grid';
    renderInventory(inventoryData);
    document.getElementById('btnExportInv').disabled = false;
    showAlert('invAlert', `✅ تم سحب ${inventoryData.length} صنف بنجاح!`, 'success');
    logEvent('scrape_inventory', { count: inventoryData.length });

  } catch(err) {
    showAlert('invAlert', '❌ ' + err.message, 'error');
  } finally {
    btn.textContent = '📥 سحب العهدة من البورتال';
    btn.disabled = false;
  }
});

function renderInventory(data) {
  const card  = document.getElementById('invTableCard');
  const tbody = document.getElementById('invBody');
  const count = document.getElementById('invTableCount');

  card.style.display = 'block';
  count.textContent = `${data.length.toLocaleString('ar-EG')} صنف`;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="no-data"><p>لا توجد بيانات</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong class="text-mono">${r.code}</strong></td>
      <td style="font-size:12px;">${r.description}</td>
      <td><span class="badge badge-blue">${r.location}</span></td>
      <td><span class="badge badge-green">${r.quantity}</span></td>
      <td class="${r.price > 0 ? 'text-price' : 'text-muted'}">${r.price > 0 ? r.price.toLocaleString('ar-EG') + ' ج.م' : 'غير مسعر'}</td>
      <td class="text-total">${r.total > 0 ? r.total.toLocaleString('ar-EG') + ' ج.م' : '–'}</td>
    </tr>
  `).join('');
}

document.getElementById('invSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderInventory(q ? inventoryData.filter(r =>
    r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)
  ) : inventoryData);
});

document.getElementById('btnExportInv').addEventListener('click', () => {
  if (!inventoryData.length) return;
  exportToExcel(inventoryData.map(r => ({
    'كود القطعة':   r.code,
    'الوصف':        r.description,
    'المخزن':       r.location,
    'الكمية':       r.quantity,
    'السعر للوحدة': r.price,
    'الإجمالي':     r.total,
  })), 'كشف_العهدة_المسعر.xlsx');
});

// ── DATA MANAGEMENT TAB ───────────────────────────────────────

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    showAlert('dataAlert', '❌ تنسيق الملف غير مدعوم. يرجى استخدام CSV أو XLSX', 'error');
    return;
  }

  showAlert('dataAlert', `⏳ جاري قراءة الملف: ${file.name}...`, 'info');

  try {
    let rows = [];

    if (ext === 'csv') {
      const text = await file.text();
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });
      rows = parsed.data;
    } else {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    if (rows.length === 0) {
      throw new Error('الملف فارغ أو لا يحتوي على بيانات صحيحة');
    }

    showAlert('dataAlert', `⏳ تم قراءة ${rows.length.toLocaleString('ar-EG')} سجل — جاري الاستيراد...`, 'info');

    // Send raw rows in chunks to background (uses parseRowsToMasterData → addBatch — proven reliable)
    const BATCH = 10000;
    let totalSaved = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const isFirst = i === 0;
      const res = await bg('importLocalChunk', { rows: chunk, isFirst });
      if (res?.error) throw new Error(res.error);
      totalSaved = res?.total || totalSaved;
      showAlert('dataAlert', `⏳ جاري الاستيراد: ${Math.min(i + BATCH, rows.length).toLocaleString('ar-EG')} / ${rows.length.toLocaleString('ar-EG')} — السجلات: ${totalSaved.toLocaleString('ar-EG')}`, 'info');
    }

    showAlert('dataAlert', `✅ تمت العملية — ${totalSaved.toLocaleString('ar-EG')} سجل محفوظ`, 'success');
    logEvent('import', { fileName: file.name, rowCount: totalSaved });

    await loadStats();
    await loadPreview();
    await loadFilters();

  } catch(err) {
    showAlert('dataAlert', `❌ فشل: ${err.message}`, 'error');
  }
}

// ── Clear DB ─────────────────────────────────────────────────

document.getElementById('btnClearDB').addEventListener('click', async () => {
  if (!confirm('هل أنت متأكد من حذف جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء.')) return;

  try {
    await bg('clearDB');
    showAlert('clearAlert', '✅ تم مسح جميع البيانات بنجاح', 'success');
    logEvent('clear_db');
    await loadStats();
    await loadPreview();
  } catch(err) {
    showAlert('clearAlert', `❌ فشل: ${err.message}`, 'error');
  }
});

// ── Excel Export ─────────────────────────────────────────────

function exportToExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

// ── Smart Log ─────────────────────────────────────────────────

const LOG_ICONS = { search: '\uD83D\uDD0D', import: '\uD83D\uDCC2', scrape_inventory: '\uD83D\uDCE5', cart_add: '\uD83D\uDED2', cart_remove: '\uD83D\uDDD1\uFE0F', inject: '\uD83D\uDC89', clear_db: '\uD83D\uDDF1\uFE0F' };

async function loadLog() {
  const filter = document.getElementById('logFilter')?.value || '';
  const query  = document.getElementById('logSearch')?.value?.trim().toLowerCase() || '';
  const res = await bg('GET_LOG', { limit: 1000 });
  if (!res?.entries) { document.getElementById('logContainer').innerHTML = '<div class="no-data"><p>لا توجد أحداث مسجلة</p></div>'; return; }
  let entries = res.entries;
  if (filter) entries = entries.filter(e => e.action === filter);
  if (query) entries = entries.filter(e => JSON.stringify(e).toLowerCase().includes(query));
  renderLog(entries);
}

function renderLog(entries) {
  const container = document.getElementById('logContainer');
  document.getElementById('logTotal').textContent = entries.length > 0 ? `\u0625\u062C\u0645\u0627\u0644\u064A: ${entries.length.toLocaleString('ar-EG')}` : '';
  if (entries.length === 0) { container.innerHTML = '<div class="no-data"><p>\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B</p><span>\u062C\u0631\u0628 \u062A\u063A\u064A\u064A\u0631 \u0641\u0644\u062A\u0631 \u0627\u0644\u0628\u062D\u062B</span></div>'; return; }

  const groups = {};
  for (const e of entries) {
    const d = new Date(e.timestamp);
    const key = d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  let html = '';
  for (const [date, dayEntries] of Object.entries(groups)) {
    html += `<div style="font-size:13px; font-weight:900; color:var(--gray-800); margin:16px 0 8px; padding-bottom:6px; border-bottom:2px solid var(--gray-200);">${date}</div>`;
    for (const e of dayEntries) {
      const t = new Date(e.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const icon = LOG_ICONS[e.action] || '\uD83D\uDD35';
      const label = getActionLabel(e.action);
      const detail = formatLogDetail(e);
      html += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:8px; transition:background 0.15s;" class="log-item">
        <span style="font-size:16px; line-height:1.4;">${icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:12px; font-weight:700;">${label}</span>
            <span style="font-size:11px; color:var(--gray-400);">${t}</span>
          </div>
          <div style="font-size:12px; color:var(--gray-600); margin-top:2px; word-break:break-word;">${detail}</div>
        </div>
      </div>`;
    }
  }
  container.innerHTML = html;
}

function getActionLabel(action) {
  const map = { search: '\u0628\u062D\u062B', import: '\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0628\u064A\u0627\u0646\u0627\u062A', scrape_inventory: '\u0633\u062D\u0628 \u0639\u0647\u062F\u0629', cart_add: '\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0633\u0644\u0629', cart_remove: '\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0633\u0644\u0629', inject: '\u062D\u0642\u0646 \u0641\u064A \u0627\u0644\u0628\u0648\u0631\u062A\u0627\u0644', clear_db: '\u0645\u0633\u062D \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A' };
  return map[action] || action;
}

function formatLogDetail(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case 'search': return `\u0628\u062D\u062B "${d.query || ''}" \u2192 ${d.resultsCount || 0} \u0646\u062A\u064A\u062C\u0629`;
    case 'import': return `${d.fileName || '\u0645\u0644\u0641'} \u2192 ${(d.rowCount || 0).toLocaleString('ar-EG')} \u0633\u062C\u0644`;
    case 'scrape_inventory': return `${(d.count || 0).toLocaleString('ar-EG')} \u0642\u0637\u0639\u0629`;
    case 'clear_db': return '\u062A\u0645 \u0645\u0633\u062D \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A';
    case 'cart_add': return `${d.code || ''} — ${d.price || 0} \u062C.\u0645`;
    case 'inject': return `${(d.count || 0)} \u0642\u0637\u0639\u0629 \u2192 ${d.status || ''}`;
    default: return JSON.stringify(d).substring(0, 100);
  }
}

document.getElementById('logFilter')?.addEventListener('change', loadLog);
document.getElementById('logSearch')?.addEventListener('input', () => { clearTimeout(window._logDebounce); window._logDebounce = setTimeout(loadLog, 300); });
document.getElementById('btnClearLog')?.addEventListener('click', async () => {
  if (!confirm('\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u0633\u062D \u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A\u061F')) return;
  await bg('CLEAR_LOG');
  loadLog();
});

// Switch to log tab → auto-load
document.querySelector('.nav-tab[data-panel="log"]')?.addEventListener('click', () => setTimeout(loadLog, 100));

// ── Init ─────────────────────────────────────────────────────
loadStats();
loadPreview();
loadFilters().then(() => {
  try {
    ['fAdvProductGroup','fAdvBrand','fAdvModel','fAdvDefect'].forEach(id => enhanceSelect(id));
  } catch(e) { console.warn('enhanceSelect error:', e); }
});
loadLog();

// Check if popup requested auto-scrape
if (localStorage.getItem('autoScrape') === '1') {
  localStorage.removeItem('autoScrape');
  document.querySelector('.nav-tab[data-panel="inventory"]').click();
  setTimeout(() => {
    document.getElementById('btnScrape').click();
  }, 300);
}
