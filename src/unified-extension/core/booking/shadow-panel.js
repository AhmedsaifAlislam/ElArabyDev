// content/ui/shadow-panel.js — Unified Shadow DOM Panel (merged with popup)

(function() {
  'use strict';

  const FONT_URL = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap';
  const POS_KEY = 'elaraby-panel-pos';

  let shadowHost = null;
  let shadowRoot = null;
  let panelContainer = null;
  let triggerBtn = null;
  let isOpen = false;
  let isPortal = false;

  // bg() من shared/storage-proxy.js

  async function injectCartItems(items) {
    const res = await bg('injectCart', { items });
    if (!res) return 'NO_PORTAL_TAB';
    if (res.status === 'success') return 'success';
    if (res.error === 'NO_PORTAL_TAB') return 'NO_PORTAL_TAB';
    return res.message || res.error || 'فشل';
  }

  // ── Init ──
  function initUI() {
    if (document.getElementById('elaraby-unified-host')) return;

    isPortal = location.hostname.includes('elarabyportalpfs');

    if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_URL;
      document.head.appendChild(link);
    }

    shadowHost = document.createElement('div');
    shadowHost.id = 'elaraby-unified-host';
    shadowHost.style.cssText = 'position:fixed;z-index:999999;direction:rtl;';
    restorePosition();
    document.body.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadowRoot.appendChild(style);

    triggerBtn = document.createElement('div');
    triggerBtn.className = 'trigger-btn';
    triggerBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-8 8a2 2 0 110-4 2 2 0 010 4zM4 5h16a1 1 0 000-2H4a1 1 0 000 2z"/></svg>
      <div class="notification-badge" style="display:none;">0</div>
    `;
    shadowRoot.appendChild(triggerBtn);

    panelContainer = document.createElement('div');
    panelContainer.className = 'panel';
    panelContainer.innerHTML = PANEL_HTML;
    shadowRoot.appendChild(panelContainer);

    makeDraggable(triggerBtn);
    makeDraggable(shadowRoot.querySelector('.panel-header'));

    triggerBtn.addEventListener('click', (e) => {
      if (e.target.closest('.trigger-btn') && triggerBtn._dragging) return;
      openPanel();
    });

    shadowRoot.getElementById('closePanelBtn').addEventListener('click', closePanel);

    setupTabs();
    setupSearch();
    setupButtons();
    setupInventoryFilters();

    // Listen for toggle from background (icon click)
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'togglePanel') {
        isOpen ? closePanel() : openPanel();
      }
    });
  }

  // ── Draggable ──
  function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let moved = false;

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isDragging = true;
      moved = false;
      const rect = shadowHost.getBoundingClientRect();
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      startLeft = rect.left;
      startTop = rect.top;
      el.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = cx - startX;
      const dy = cy - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

      const w = window.innerWidth;
      const h = window.innerHeight;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      newLeft = Math.max(0, Math.min(w - 60, newLeft));
      newTop = Math.max(0, Math.min(h - 60, newTop));
      shadowHost.style.left = newLeft + 'px';
      shadowHost.style.top = newTop + 'px';
      shadowHost.style.right = 'auto';
      shadowHost.style.bottom = 'auto';
    };

    const onPointerUp = () => {
      isDragging = false;
      el.style.cursor = '';
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
      if (moved) {
        triggerBtn._dragging = true;
        setTimeout(() => { triggerBtn._dragging = false; }, 50);
        savePosition();
      }
    };

    el.addEventListener('mousedown', onPointerDown);
    el.addEventListener('touchstart', onPointerDown, { passive: false });
  }

  function savePosition() {
    const r = shadowHost.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch(e) {}
  }

  function restorePosition() {
    try {
      const s = localStorage.getItem(POS_KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p.left !== undefined && p.top !== undefined) {
          shadowHost.style.left = p.left + 'px';
          shadowHost.style.top = p.top + 'px';
          shadowHost.style.right = 'auto';
          shadowHost.style.bottom = 'auto';
          return;
        }
      }
    } catch(e) {}
    shadowHost.style.bottom = '20px';
    shadowHost.style.right = '20px';
  }

  // ── Open / Close ──
  function openPanel() {
    isOpen = true;
    triggerBtn.style.display = 'none';
    panelContainer.style.display = 'flex';
    updateDBStatus();
    updateModeBadge();
    cartRender();
    if (isPortal && globalThis.Scanner) globalThis.Scanner.setPanelOpen(true);
  }

  function closePanel() {
    isOpen = false;
    panelContainer.style.display = 'none';
    triggerBtn.style.display = 'flex';
    if (isPortal && globalThis.Scanner) globalThis.Scanner.setPanelOpen(false);
  }

  // ── DB Status ──
  async function updateDBStatus() {
    const res = await bg('getDBCount');
    const dot = shadowRoot.getElementById('dbDot');
    const text = shadowRoot.getElementById('dbStatusText');
    if (res && res.count > 0) {
      dot.className = 'db-dot ok';
      text.textContent = `${res.count.toLocaleString('ar-EG')} سجل`;
    } else {
      dot.className = 'db-dot warn';
      text.textContent = 'فارغة — افتح الداشبورد';
    }
  }

  // ── Mode Badge ──
  function updateModeBadge() {
    const badge = shadowRoot.getElementById('modeBadge');
    if (isPortal) {
      badge.className = 'mode-badge portal';
      badge.textContent = 'بوابة العربي';
    } else {
      badge.className = 'mode-badge other';
      badge.textContent = 'صفحة عادية';
    }
  }

  // ── Tabs ──
  function setupTabs() {
    shadowRoot.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        shadowRoot.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        shadowRoot.querySelectorAll('.panel-tab-content').forEach(c => c.style.display = 'none');
        const content = shadowRoot.querySelector(`[data-content="${name}"]`);
        if (content) content.style.display = 'block';
        if (name === 'detected') updateDetected();
        if (name === 'inventory') loadInventory();
      });
    });
  }

  // ── Cart ──
  let cartItems = [];

  function loadCart() {
    try {
      const s = localStorage.getItem('elaraby-cart');
      cartItems = s ? JSON.parse(s) : [];
    } catch(e) { cartItems = []; }
  }
  function saveCart() {
    try { localStorage.setItem('elaraby-cart', JSON.stringify(cartItems)); } catch(e) {}
    cartRender();
  }
  function cartAdd(code, description, price, defectCode, modelCode) {
    if (cartItems.some(c => c.code === code)) return;
    cartItems.push({ code, description: (description || '').substring(0, 80), price: price || 0, defectCode: defectCode || '', modelCode: modelCode || '', qty: 1 });
    saveCart();
    bg('LOG_EVENT', { actionType: 'cart_add', details: { code, price } }).catch(() => {});
  }
  function cartRemove(code) {
    cartItems = cartItems.filter(c => c.code !== code);
    saveCart();
    bg('LOG_EVENT', { actionType: 'cart_remove', details: { code } }).catch(() => {});
  }
  function cartClear() {
    const count = cartItems.length;
    cartItems = [];
    saveCart();
    bg('LOG_EVENT', { actionType: 'cart_remove', details: { count, action: 'clear_all' } }).catch(() => {});
  }
  function cartRender() {
    if (!shadowRoot) return;
    const section = shadowRoot.getElementById('cartSection');
    const itemsEl = shadowRoot.getElementById('cartItems');
    const statusEl = shadowRoot.getElementById('cartStatus');
    const injectBtn = shadowRoot.getElementById('btnInjectCart');
    const clearBtn = shadowRoot.getElementById('btnClearCart');
    if (!section) return;
    if (cartItems.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    const total = cartItems.reduce((s, c) => s + c.price, 0);
    statusEl.textContent = `${cartItems.length} قطعة — ${total.toLocaleString('ar-EG')} ج.م`;
    injectBtn.disabled = false;
    clearBtn.disabled = false;
    itemsEl.innerHTML = cartItems.map(c => `
      <div style="display:flex; align-items:center; gap:6px; padding:5px 6px; margin-bottom:3px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0;">
        <span style="flex:1; min-width:0;">
          <span style="font-size:10px; font-weight:900; color:#1e293b; font-family:monospace; display:block;">${c.code}</span>
          <span style="font-size:9px; color:#64748b; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.description}</span>
        </span>
        <span style="font-size:10px; font-weight:700; color:#166534; white-space:nowrap;">${c.price.toLocaleString('ar-EG')} ج.م</span>
        <button class="cart-rm-btn" data-code="${c.code}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px; padding:2px; line-height:1;">✕</button>
      </div>
    `).join('');
    itemsEl.querySelectorAll('.cart-rm-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); cartRemove(btn.dataset.code); });
    });
  }
  loadCart();
  cartRender();

  // ── Search ──
  let lastSearchData = [];
  let spFilterRelations = { modelsByType: {} };
  let spFiltersRes = null;

  async function setupSearch() {
    const input = shadowRoot.getElementById('panelSearchInput');
    const typeSelect = shadowRoot.getElementById('searchFilterProductGroup');
    const modelSelect = shadowRoot.getElementById('searchFilterBrand');

    spFiltersRes = await bg('getMasterDataFilters');
    spFilterRelations = { modelsByType: spFiltersRes?.modelsByType || {} };

    function popSel(sel, items, label) {
      const v = sel.value;
      sel.innerHTML = '<option value="">' + label + '</option>' + items.map(x => '<option value="' + x + '">' + x + '</option>').join('');
      sel.value = items.includes(v) ? v : '';
    }

    function cascadeModels() {
      const type = typeSelect.value;
      const models = type ? (spFilterRelations.modelsByType[type] || []) : (spFiltersRes?.models || []);
      popSel(modelSelect, models, 'الموديلات');
    }

    if (spFiltersRes?.productTypes) {
      typeSelect.innerHTML = '<option value="">المنتجات</option>' + spFiltersRes.productTypes.map(v => '<option value="' + v + '">' + v + '</option>').join('');
    }
    cascadeModels();

    let debounce = null;
    const doSearch = async () => {
      const q = input.value.trim();
      if (q.length < 1) {
        shadowRoot.getElementById('panelSearchResults').innerHTML = '<div class="no-data">اكتب شيئاً للبحث...</div>';
        shadowRoot.getElementById('searchCount').textContent = '0';
        lastSearchData = [];
        return;
      }
      const res = await bg('searchDB', { query: q });
      let data = res?.data || [];
      const type = typeSelect.value;
      const model = modelSelect.value;
      if (type) data = data.filter(r => (r.productType || '') === type);
      if (model) data = data.filter(r => r.modelCode === model || r.modelCode.startsWith(model));
      lastSearchData = data;
      shadowRoot.getElementById('searchCount').textContent = data.length;
      renderSearchResults(data);
    };

    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(doSearch, 280); });
    typeSelect.addEventListener('change', () => { cascadeModels(); doSearch(); });
    modelSelect.addEventListener('change', doSearch);
  }

  function renderSearchResults(data) {
    const container = shadowRoot.getElementById('panelSearchResults');
    // Reset selection buttons
    shadowRoot.getElementById('btnInjectFromPanel').disabled = true;
    shadowRoot.getElementById('btnInjectFromPanel').dataset.item = '';
    shadowRoot.getElementById('btnAddToCart').disabled = true;
    shadowRoot.getElementById('btnAddToCart').dataset.item = '';
    if (data.length === 0) {
      container.innerHTML = '<div class="no-data">لم يتم العثور على نتائج</div>';
      return;
    }
    container.innerHTML = data.slice(0, 30).map((item, i) => {
      const maxQty = item.maxQuantity > 0 ? item.maxQuantity.toLocaleString('ar-EG') : '—';
      const inCart = cartItems.some(c => c.code === item.sparePartCode);
      return `
        <div class="search-item" data-idx="${i}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <div class="si-model">${item.productType || ''} — ${item.modelCode || ''}</div>
              <div class="si-code">${item.sparePartCode || ''}</div>
              <div class="si-meta">
                <span class="si-tag defect">${item.defectMajor || ''}</span>
                <span class="si-tag defect">${item.defectDescription || item.defectCode || ''}</span>
                <span class="si-tag price">أقصى كمية: ${maxQty}</span>
              </div>
            </div>
            <button class="cart-add-btn" data-idx="${i}" title="${inCart ? 'إزالة من السلة' : 'إضافة للسلة'}">${inCart ? '✓' : '+'}</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.cart-add-btn')) return;
        container.querySelectorAll('.search-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        const itemData = data[parseInt(el.dataset.idx)];
        const itemStr = JSON.stringify(itemData);
        shadowRoot.getElementById('btnInjectFromPanel').disabled = false;
        shadowRoot.getElementById('btnInjectFromPanel').dataset.item = itemStr;
        shadowRoot.getElementById('btnAddToCart').disabled = false;
        shadowRoot.getElementById('btnAddToCart').dataset.item = itemStr;
      });
    });

    container.querySelectorAll('.cart-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const item = data[idx];
        const code = item.sparePartCode;
        if (cartItems.some(c => c.code === code)) {
          cartRemove(code);
        } else {
          cartAdd(code, item.sparePartDescription || '', item.price || 0, item.defectCode || '', item.modelCode || '');
        }
        renderSearchResults(data);
      });
    });
  }

  // ── Buttons ──
  function setupButtons() {
    shadowRoot.getElementById('btnInjectFromPanel').addEventListener('click', async () => {
      const btn = shadowRoot.getElementById('btnInjectFromPanel');
      const item = JSON.parse(btn.dataset.item || '{}');
      if (!item.sparePartCode) return;

      const res = await injectCartItems([item]);
      if (res === 'success') {
        showToast('تم حقن القطعة في البورتال');
        bg('LOG_EVENT', { actionType: 'inject', details: { count: 1, code: item.sparePartCode, status: 'success' } }).catch(() => {});
      } else if (res === 'NO_PORTAL_TAB') showToast('افتح صفحة البورتال أولاً');
      else showToast(res || 'فشل الحقن');
    });

    shadowRoot.getElementById('btnInjectCart').addEventListener('click', async () => {
      if (cartItems.length === 0) return;
      const btn = shadowRoot.getElementById('btnInjectCart');
      btn.disabled = true;
      btn.textContent = '⏳ جاري الحقن...';
      const items = cartItems.map(c => ({
        sparePartCode: c.code,
        sparePartDescription: c.description,
        price: c.price,
        defectCode: c.defectCode,
        modelCode: c.modelCode
      }));
      const res = await injectCartItems(items);
      btn.disabled = false;
      btn.textContent = '💉 حقن الكل';
      if (res === 'success') {
        showToast(`تم حقن ${items.length} قطع في البورتال`);
        bg('LOG_EVENT', { actionType: 'inject', details: { count: items.length, status: 'success' } }).catch(() => {});
      } else if (res === 'NO_PORTAL_TAB') showToast('افتح صفحة البورتال أولاً');
      else showToast(res || 'فشل الحقن');
    });

    shadowRoot.getElementById('btnAddToCart').addEventListener('click', () => {
      const btn = shadowRoot.getElementById('btnAddToCart');
      const item = JSON.parse(btn.dataset.item || '{}');
      if (!item.sparePartCode) return;
      cartAdd(item.sparePartCode, item.sparePartDescription || '', item.price || 0, item.defectCode || '', item.modelCode || '');
      showToast('تمت الإضافة للسلة');
      // Refresh search item buttons
      const input = shadowRoot.getElementById('panelSearchInput');
      if (input.value.trim()) { const ev = new Event('input', { bubbles: true }); input.dispatchEvent(ev); }
    });

    shadowRoot.getElementById('btnClearCart').addEventListener('click', () => {
      cartClear();
      // Re-render search results to update +/✓ buttons
      const input = shadowRoot.getElementById('panelSearchInput');
      if (input.value.trim()) {
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
      }
    });

    shadowRoot.getElementById('btnForceSync').addEventListener('click', async () => {
      if (isPortal && globalThis.Scanner) globalThis.Scanner.forceScan();
      else showToast('افتح صفحة البورتال للمزامنة');
    });

    shadowRoot.getElementById('btnOpenDashboard').addEventListener('click', () => {
      try { chrome.runtime.sendMessage({ action: 'openDashboard' }); } catch(e) {}
    });

    shadowRoot.getElementById('btnScrape').addEventListener('click', async () => {
      showToast('جاري سحب العهدة من البورتال...');
      const btn = shadowRoot.getElementById('btnScrape');
      btn.disabled = true;
      btn.textContent = 'جاري السحب...';
      try {
        const res = await bg('scrapeInventory');
        if (res && res.count !== undefined) {
          showToast(`تم سحب ${res.count} صنف بنجاح!`);
          loadInventory();
        } else if (res && res.error === 'NO_PORTAL_TAB') {
          showToast('افتح صفحة العهدة في البورتال أولاً');
        } else if (res && res.error) {
          showToast('خطأ: ' + res.error);
        }
      } catch(e) {
        showToast('فشل السحب — تأكد من فتح صفحة البورتال');
      }
      btn.disabled = false;
      btn.textContent = 'سحب العهدة';
    });
  }

  // ── Inventory Filters ──
  function setupInventoryFilters() {
    const filterIds = ['filterProductGroup', 'filterBrand', 'filterModel'];
    filterIds.forEach(id => {
      shadowRoot.getElementById(id)?.addEventListener('change', filterInventory);
    });
    shadowRoot.getElementById('inventorySearchInput')?.addEventListener('input', filterInventory);
  }

  // ── Detected Parts ──
  function updateDetected() {
    const container = shadowRoot.getElementById('detectedContent');
    if (!isPortal || !globalThis.Scanner) {
      container.innerHTML = '<div class="no-data">الميزة متاحة فقط في صفحة البورتال</div>';
      return;
    }
    const parts = globalThis.Scanner.getDetectedParts();
    const status = globalThis.Scanner.getDbStatus();

    if (parts.length === 0) {
      container.innerHTML = '<div class="no-data">لم يتم اكتشاف قطع غيار في الصفحة</div>';
      return;
    }

    container.innerHTML = parts.map(p => {
      const st = status.parts?.[p.code] || {};
      let badges = '';
      if (st.exists) {
        badges = st.price !== p.price
          ? '<span class="status-badge mismatch">سعر مختلف</span>'
          : '<span class="status-badge synced">متطابق</span>';
      } else {
        badges = '<span class="status-badge new">جديد</span>';
      }
      const price = (st.price > 0) ? st.price.toLocaleString('ar-EG') + ' ج.م' : (p.price > 0 ? p.price.toLocaleString('ar-EG') + ' ج.م' : '');
      const model = st.modelCode || '';
      const defect = st.defectCode || '';
      const defectMajor = st.defectMajor || '';
      return `
        <div class="data-card">
          <div class="dc-row">
            <span class="dc-code">${p.code}</span>
            ${badges}
          </div>
          <div class="dc-desc">${p.description || st.description || ''}</div>
          <div class="si-meta">
            ${model ? `<span class="si-tag model">${model}</span>` : ''}
            ${defect ? `<span class="si-tag defect">${defect}</span>` : ''}
            ${defectMajor ? `<span class="si-tag defect">${defectMajor.substring(0, 25)}</span>` : ''}
            ${price ? `<span class="si-tag price">${price}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Inventory Tab ──
  let inventoryData = [];
  let inventoryFilters = { productGroups: [], brands: [], models: [] };

  // ── Unified search pattern: *text = contains, text = startsWith ──
  function searchPattern(text, query) {
    if (!text || !query) return true;
    const t = text.toLowerCase();
    const q = query.trim();
    if (!q) return true;
    if (q.startsWith('*')) return t.includes(q.slice(1).toLowerCase());
    return t.startsWith(q.toLowerCase());
  }

  async function loadInventory() {
    const [fullRes, filtersRes] = await Promise.all([
      bg('getInventoryFull'),
      bg('getInventoryFilters')
    ]);

    inventoryData = fullRes?.data || [];
    inventoryFilters = filtersRes || { productGroups: [], brands: [], models: [] };

    populateFilters();
    filterInventory();
  }

  function populateFilters() {
    const pgSelect = shadowRoot.getElementById('filterProductGroup');
    const brandSelect = shadowRoot.getElementById('filterBrand');
    const modelSelect = shadowRoot.getElementById('filterModel');

    function fillSelect(el, items, placeholder) {
      el.innerHTML = `<option value="">${placeholder} (${items.length})</option>` +
        items.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    fillSelect(pgSelect, inventoryFilters.productGroups, 'كل الأنواع');
    fillSelect(brandSelect, inventoryFilters.brands, 'كل الماركات');
    fillSelect(modelSelect, inventoryFilters.models, 'كل الموديلات');
  }

  function filterInventory() {
    const pg = shadowRoot.getElementById('filterProductGroup')?.value || '';
    const brand = shadowRoot.getElementById('filterBrand')?.value || '';
    const model = shadowRoot.getElementById('filterModel')?.value || '';
    const query = shadowRoot.getElementById('inventorySearchInput')?.value || '';

    let filtered = inventoryData;

    if (pg) filtered = filtered.filter(i => i.productGroup === pg);
    if (brand) filtered = filtered.filter(i => i.brand === brand);
    if (model) filtered = filtered.filter(i => i.modelCode === model);
    if (query) filtered = filtered.filter(i =>
      searchPattern(i.sparePartCode, query) ||
      searchPattern(i.sparePartDescription, query) ||
      searchPattern(i.modelCode, query) ||
      searchPattern(i.defectCode, query) ||
      searchPattern(i.defectMajor, query) ||
      searchPattern(i.location, query)
    );

    renderInventoryTable(filtered);
  }

  function renderInventoryTable(data) {
    const container = shadowRoot.getElementById('inventoryTableBody');
    const countEl = shadowRoot.getElementById('inventoryCount');
    if (countEl) countEl.textContent = data.length;

    if (data.length === 0) {
      container.innerHTML = '<tr><td colspan="8" class="no-data">لا توجد نتائج مطابقة</td></tr>';
      return;
    }

    container.innerHTML = data.map((item, i) => {
      const price = item.price > 0 ? item.price.toLocaleString('ar-EG') : '-';
      return `
        <tr>
          <td class="inv-num">${i + 1}</td>
          <td class="inv-code">${item.sparePartCode || ''}</td>
          <td class="inv-desc">${item.sparePartDescription || ''}</td>
          <td class="inv-model">${item.modelCode || ''}</td>
          <td class="inv-defect">${item.defectCode || ''}</td>
          <td class="inv-price">${price}</td>
          <td class="inv-qty">${item.quantity || 0}</td>
          <td class="inv-loc">${item.location || ''}</td>
        </tr>
      `;
    }).join('');
  }

  // ── Badge ──
  function updateBadge(count) {
    if (!shadowRoot) return;
    const badge = shadowRoot.querySelector('.notification-badge');
    if (!badge) return;
    if (count > 0 && !isOpen) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Toast ──
  function showToast(msg) {
    if (!shadowRoot) return;
    const banner = shadowRoot.getElementById('syncBanner');
    if (!banner) return;
    banner.textContent = msg;
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, 3500);
  }

  // ── Panel HTML ──
  const PANEL_HTML = `
    <div class="panel-header" style="cursor:grab;">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-8 8a2 2 0 110-4 2 2 0 010 4zM4 5h16a1 1 0 000-2H4a1 1 0 000 2z"/></svg>
        مساعد العربي
      </div>
      <button class="close-btn" id="closePanelBtn">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
    <div class="db-status">
      <div class="db-dot" id="dbDot"></div>
      <span id="dbStatusText">جاري الفحص...</span>
      <span style="margin-right:auto;"></span>
      <span class="mode-badge" id="modeBadge">...</span>
    </div>
    <div class="panel-tabs">
      <div class="panel-tab active" data-tab="search">بحث</div>
      <div class="panel-tab" data-tab="detected">مكتشف</div>
      <div class="panel-tab" data-tab="inventory">عهدة</div>
    </div>
    <div class="panel-content">
      <div class="panel-tab-content" data-content="search">
        <div class="inv-filters">
          <select class="inv-select" id="searchFilterProductGroup"><option>كل المنتجات</option></select>
          <select class="inv-select" id="searchFilterBrand"><option>كل الماركات</option></select>
        </div>
        <div class="inv-search-wrap">
          <input type="text" class="panel-search-input" id="panelSearchInput" placeholder="ابحث* في المحتوى، 2021 للبداية..">
          <span class="inv-count" id="searchCount">0</span>
        </div>
        <div id="panelSearchResults" class="data-list">
          <div class="no-data">اكتب شيئاً للبحث...</div>
        </div>
        <div style="display:flex; gap:4px; margin-top:8px;">
          <button class="btn btn-inject" id="btnInjectFromPanel" disabled style="flex:1;">💉 حقن المحدد</button>
          <button class="btn btn-scrape" id="btnAddToCart" disabled style="flex:1;">➕ إضافة للسلة</button>
        </div>
        <div id="cartSection" style="display:none; margin-top:8px; border-top:1px solid #e2e8f0; padding-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:11px; font-weight:700; color:#1e293b;">🛒 السلة</span>
            <span style="font-size:10px; color:#64748b;" id="cartStatus"></span>
          </div>
          <div id="cartItems"></div>
          <div style="display:flex; gap:4px; margin-top:6px;">
            <button class="btn btn-inject" id="btnInjectCart" disabled style="flex:2;padding:8px;font-size:11px;">💉 حقن الكل</button>
            <button class="btn btn-scrape" id="btnClearCart" disabled style="flex:1;padding:8px;font-size:11px;">🧹 تفريغ</button>
          </div>
        </div>
      </div>
      <div class="panel-tab-content" data-content="detected" style="display:none;">
        <div id="detectedContent"></div>
      </div>
      <div class="panel-tab-content" data-content="inventory" style="display:none;">
        <div class="inv-filters">
          <select class="inv-select" id="filterProductGroup"><option>جاري التحميل...</option></select>
          <select class="inv-select" id="filterBrand"><option>جاري التحميل...</option></select>
          <select class="inv-select" id="filterModel"><option>جاري التحميل...</option></select>
        </div>
        <div class="inv-search-wrap">
          <input type="text" class="panel-search-input" id="inventorySearchInput" placeholder="ابحث: *3201 للبحث في المحتوى، 3201 للبداية...">
          <span class="inv-count" id="inventoryCount">0</span>
        </div>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>الكود</th>
                <th>الوصف</th>
                <th>الموديل</th>
                <th>العطل</th>
                <th>السعر</th>
                <th>الكمية</th>
                <th>المخزن</th>
              </tr>
            </thead>
            <tbody id="inventoryTableBody">
              <tr><td colspan="8" class="no-data">جاري التحميل...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="sync-banner" id="syncBanner"></div>
    <div class="panel-footer">
      <button class="btn btn-sync" id="btnForceSync">مزامنة</button>
      <button class="btn btn-scrape" id="btnScrape">سحب العهدة</button>
      <button class="btn btn-dash" id="btnOpenDashboard">داشبورد</button>
    </div>
  `;

  // ── Styles ──
  const STYLES = `
    @import url('${FONT_URL}');
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }

    .trigger-btn {
      background: linear-gradient(135deg, #0056b3 0%, #002d62 100%);
      color: #ffffff;
      border: 2px solid rgba(255,255,255,0.2);
      width: 48px; height: 48px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: grab;
      box-shadow: 0 8px 32px rgba(0,86,179,0.4), 0 0 15px rgba(0,86,179,0.2);
      transition: transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275), box-shadow 0.3s;
      position: relative;
      user-select: none;
      -webkit-user-select: none;
    }
    .trigger-btn:active { cursor: grabbing; }
    .trigger-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 10px 40px rgba(0,86,179,0.5), 0 0 25px rgba(0,86,179,0.4);
    }
    .trigger-btn svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; }

    .notification-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ef4444; color: white; border-radius: 50%;
      width: 20px; height: 20px; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #fff;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }

    .panel {
      width: 420px;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
      display: none; flex-direction: column; overflow: hidden;
      animation: slideIn 0.25s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(15px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .panel-header {
      background: linear-gradient(135deg, #0056b3 0%, #003366 100%);
      color: #fff; padding: 12px 14px;
      display: flex; align-items: center; justify-content: space-between;
      cursor: grab; user-select: none;
    }
    .panel-header:active { cursor: grabbing; }
    .panel-title { font-size: 13px; font-weight: 900; display: flex; align-items: center; gap: 8px; }
    .close-btn { background: none; border: none; color: #fff; cursor: pointer; opacity: 0.8; padding: 4px; }
    .close-btn:hover { opacity: 1; }

    .db-status {
      background: #fff; border-bottom: 1px solid #e2e8f0;
      padding: 6px 12px; display: flex; align-items: center; gap: 6px;
      font-size: 10px; color: #64748b;
    }
    .db-dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; flex-shrink: 0; }
    .db-dot.ok { background: #22c55e; }
    .db-dot.warn { background: #f59e0b; }

    .mode-badge {
      padding: 2px 8px; border-radius: 20px; font-weight: 700; font-size: 9px;
    }
    .mode-badge.portal { background: #dcfce7; color: #166534; }
    .mode-badge.other { background: #fef3c7; color: #92400e; }

    .panel-tabs { display: flex; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
    .panel-tab {
      flex: 1; padding: 9px; text-align: center; font-size: 11px; font-weight: 700;
      color: #6b7280; cursor: pointer; transition: 0.2s; border-bottom: 2px solid transparent;
    }
    .panel-tab.active { color: #0056b3; border-bottom-color: #0056b3; background: #fff; }
    .panel-tab:hover:not(.active) { background: #f3f4f6; }

    .panel-content { max-height: 340px; overflow-y: auto; padding: 10px; }
    .panel-content::-webkit-scrollbar { width: 4px; }
    .panel-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }

    .panel-search-input {
      width: 100%; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 10px;
      font-size: 12px; font-family: 'Cairo', sans-serif; outline: none; margin-bottom: 8px;
    }
    .panel-search-input:focus { border-color: #0056b3; box-shadow: 0 0 0 3px rgba(0,86,179,0.1); }

    .search-item {
      padding: 8px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 3px;
      border: 1.5px solid transparent; transition: all 0.15s;
    }
    .search-item:hover { background: #f0f7ff; border-color: #bfdbfe; }
    .search-item.selected { background: #eff6ff; border-color: #0056b3; }
    .si-model { font-size: 9px; color: #94a3b8; font-weight: 600; }
    .si-code { font-size: 12px; font-weight: 900; color: #1e293b; font-family: monospace; }
    .si-desc { font-size: 10px; color: #64748b; margin: 1px 0; line-height: 1.3; }
    .si-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
    .si-tag { font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
    .si-tag.model { background: #e0f2fe; color: #0369a1; }
    .si-tag.defect { background: #fee2e2; color: #b91c1c; }
    .si-tag.price { background: #dcfce7; color: #166534; }

    .data-list { display: flex; flex-direction: column; gap: 4px; }
    .data-card {
      background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);
      border-radius: 8px; padding: 7px 8px; transition: transform 0.2s;
    }
    .data-card:hover { transform: translateY(-1px); border-color: rgba(0,86,179,0.2); }
    .dc-row { display: flex; justify-content: space-between; align-items: center; }
    .dc-code { font-size: 11px; font-weight: 900; color: #1e293b; font-family: monospace; }
    .dc-desc { font-size: 9px; color: #64748b; }

    .status-badge { font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px; }
    .status-badge.new { background: #dbeafe; color: #1e40af; }
    .status-badge.mismatch { background: #fef3c7; color: #92400e; }
    .status-badge.synced { background: #dcfce7; color: #166534; }

    .panel-footer {
      padding: 8px 12px; background: rgba(248,250,252,0.9);
      border-top: 1px solid rgba(0,0,0,0.05); display: flex; gap: 6px;
    }
    .btn {
      flex: 1; padding: 7px 4px; border: none; border-radius: 8px;
      font-size: 10px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 3px;
      transition: all 0.2s; font-family: 'Cairo', sans-serif;
    }
    .btn-sync { background: linear-gradient(135deg, #22c55e, #15803d); color: #fff; }
    .btn-sync:hover { transform: translateY(-1px); }
    .btn-inject { background: linear-gradient(135deg, #0056b3, #003d82); color: #fff; width: 100%; margin-top: 6px; padding: 9px; font-size: 11px; }
    .btn-inject:hover { transform: translateY(-1px); }
    .btn-inject:disabled { background: #cbd5e1; color: #64748b; cursor: not-allowed; transform: none; }
    .btn-scrape { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .btn-scrape:hover { background: #e2e8f0; }
    .btn-dash { background: #fff; color: #334155; border: 1px solid #e2e8f0; }
    .btn-dash:hover { background: #f1f5f9; }

    .cart-add-btn {
      background: #0056b3; color: #fff; border: none; border-radius: 50%;
      width: 24px; height: 24px; font-size: 14px; font-weight: 900;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; line-height: 1; transition: transform 0.15s;
    }
    .cart-add-btn:hover { transform: scale(1.15); }
    .cart-add-btn[title*="إزالة"] { background: #64748b; font-size: 11px; }
    .cart-rm-btn:hover { transform: scale(1.2); }

    .sync-banner {
      background: #dcfce7; color: #15803d; padding: 5px 10px;
      font-size: 10px; font-weight: 700; text-align: center;
      border-top: 1px solid rgba(0,0,0,0.05); display: none;
    }
    .no-data { color: #94a3b8; font-size: 11px; text-align: center; padding: 12px; }

    .inv-filters { display: flex; gap: 4px; margin-bottom: 6px; }
    .inv-select {
      flex: 1; padding: 6px 4px; border: 1px solid #e2e8f0; border-radius: 6px;
      font-size: 10px; font-family: 'Cairo', sans-serif; background: #fff;
      color: #334155; outline: none; cursor: pointer;
    }
    .inv-select:focus { border-color: #0056b3; }

    .inv-search-wrap { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .inv-search-wrap .panel-search-input { flex: 1; margin-bottom: 0; }
    .inv-count {
      background: rgba(0,86,179,0.1); color: #0056b3;
      padding: 4px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
      white-space: nowrap;
    }

    .inv-table-wrap { max-height: 300px; overflow-y: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
    .inv-table-wrap::-webkit-scrollbar { width: 4px; }
    .inv-table-wrap::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }

    .inv-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .inv-table th {
      background: #f1f5f9; padding: 6px 5px; text-align: right;
      font-weight: 700; color: #475569; position: sticky; top: 0; z-index: 1;
      border-bottom: 2px solid #e2e8f0; white-space: nowrap;
    }
    .inv-table td { padding: 5px 5px; border-bottom: 1px solid #f1f5f9; }
    .inv-table tr:hover td { background: #f0f7ff; }

    .inv-num { color: #94a3b8; font-weight: 700; text-align: center; width: 28px; }
    .inv-code { font-weight: 900; color: #1e293b; font-family: monospace; white-space: nowrap; }
    .inv-desc { color: #475569; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .inv-model { color: #0369a1; font-weight: 700; white-space: nowrap; }
    .inv-defect { color: #b91c1c; font-size: 9px; white-space: nowrap; }
    .inv-price { color: #166534; font-weight: 700; white-space: nowrap; }
    .inv-qty { text-align: center; font-weight: 900; }
    .inv-loc { color: #0056b3; font-size: 9px; white-space: nowrap; }
  `;

  // ── Public API ──
  globalThis.ShadowPanel = {
    initUI,
    updateBadge,
    showToast,
    updateData: () => { if (isOpen) updateDetected(); }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initUI, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 500));
  }

})();
