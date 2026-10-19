// =========================================================
// order-extractor.js — Order Table Extractor Module
// Independent content script for extracting orders from
// the El Araby Partner Portal orders table
// =========================================================
'use strict';

(function () {
  const PORTAL_URL = 'elarabyportalpfs.powerappsportals.com';
  if (!window.location.href.includes(PORTAL_URL)) return;

  // ── Constants — matches portal export column order ──
  const DEFAULT_COLUMNS = [
    { id: 'orderNo',     label: 'رقم الطلب',          hidden: false },
    { id: 'customer',    label: 'اسم العميل',          hidden: false },
    { id: 'area',        label: 'المنطقة',              hidden: false },
    { id: 'address',     label: 'العنوان',             hidden: false },
    { id: 'product',     label: 'نوع المنتج',          hidden: false },
    { id: 'phone',       label: 'رقم الموبايل',        hidden: true  },
    { id: 'phone2',      label: 'رقم شخص ذو صله',     hidden: true  },
    { id: 'phoneSource', label: 'مصدر الرقم',          hidden: true  },
    { id: 'complaint',   label: 'شكوى العميل',        hidden: false },
    { id: 'bookingDate', label: 'تاريخ الحجز',         hidden: false },
    { id: 'officeNotes', label: 'ملاحظات المكتب',      hidden: false },
    { id: 'callNotes',   label: 'ملاحظات الكول سنتر', hidden: false },
    { id: 'serviceType', label: 'نوع الخدمة',          hidden: false },
    { id: 'hasComplaint',label: 'يوجد شكوى',          hidden: false },
    { id: 'sap',         label: 'رقم الـ SAP',         hidden: false },
    { id: 'technician',  label: 'الفنى المسؤول',       hidden: false },
  ];

  const HEADER_MAP = {
    'رقم الطلب': 'orderNo', 'طلب': 'orderNo', 'order': 'orderNo', 'cas': 'orderNo',
    'اسم العميل': 'customer', 'العميل': 'customer', 'customer': 'customer',
    'رقم العقار': 'building', 'العقار': 'building', 'building': 'building',
    'العنوان': 'address', 'عنوان': 'address', 'address': 'address',
    'نوع المنتج': 'product', 'المنتج': 'product', 'product': 'product',
    'رقم الموبايل': 'phone', 'mobile': 'phone', 'هاتف': 'phone', 'موبايل': 'phone',
    'رقم شخص ذو صله': 'phone2', 'شخص ذو صله': 'phone2', 'رقم شخص ذي صلة': 'phone2',
    'شكوى العميل': 'complaint', 'شكوى': 'complaint', 'complaint': 'complaint',
    'تاريخ الحجز': 'bookingDate', 'التاريخ': 'bookingDate', 'تاريخ': 'bookingDate', 'date': 'bookingDate', 'booking': 'bookingDate',
    'ملاحظات المكتب': 'officeNotes', 'المكتب': 'officeNotes', 'office': 'officeNotes',
    'ملاحظات الكول سنتر': 'callNotes', 'الكول سنتر': 'callNotes', 'call': 'callNotes',
    'نوع الخدمة': 'serviceType', 'الخدمة': 'serviceType', 'service': 'serviceType',
    'يوجد شكوى': 'hasComplaint', 'has complaint': 'hasComplaint',
    'رقم الـ SAP': 'sap', 'SAPرقم ال': 'sap', 'SAP': 'sap', 'sap': 'sap', 'sapsap': 'sap',
    'المنطقة': 'area', 'area': 'area',
    'الفنى المسؤول': 'technician', 'الفني': 'technician', 'technician': 'technician',
  };

  // ── State ──
  let selectedColumns = [];
  let isExtracting = false;
  let stopRequested = false;
  let fetchReportsEnabled = false;
  let reportFetchQueue = [];
  let reportFetchResults = [];

  // ── Storage (routed through background.js to bypass Edge Tracking Prevention) ──
  async function storageGet(keys) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys });
      return resp?.ok ? resp.data : {};
    } catch (e) {
      console.warn('[OrderExtractor] Storage GET failed:', e.message);
      return {};
    }
  }

  async function storageSet(data) {
    try {
      await chrome.runtime.sendMessage({ type: 'STORAGE_SET', data });
    } catch (e) {
      console.warn('[OrderExtractor] Storage SET failed:', e.message);
    }
  }

  // ── Customer Area API ──
  let customerAreaCache = new Map();
  let customerIdCache = new Map();

  async function fetchCustomerId(incidentId) {
    if (customerIdCache.has(incidentId)) return customerIdCache.get(incidentId);
    try {
      const resp = await fetch('/_api/incidents(' + incidentId + ')?$select=_customerid_value,ldv_mobilenumber,ldv_referencecontact');
      const data = await resp.json();
      const id = data._customerid_value || null;
      customerIdCache.set(incidentId, id);
      // أثر جانبي: خزّن الهاتفين من نفس النداء لتفادي نداء إضافي لاحقًا (S4)
      if (!incidentPhoneCache.has(incidentId)) {
        incidentPhoneCache.set(incidentId, {
          mobile: normalizePhone(data.ldv_mobilenumber),
          related: normalizePhone(data.ldv_referencecontact),
        });
      }
      return id;
    } catch (e) {
      customerIdCache.set(incidentId, null);
      return null;
    }
  }

  async function fetchArea(customerId) {
    if (customerAreaCache.has(customerId)) return customerAreaCache.get(customerId);
    try {
      const resp = await fetch('/_api/accounts(' + customerId + ')?$select=accountid,_ldv_area_value');
      const data = await resp.json();
      const area = data['_ldv_area_value@OData.Community.Display.V1.FormattedValue']
        || data['_ldv_centraltelephone_value@OData.Community.Display.V1.FormattedValue']
        || '';
      customerAreaCache.set(customerId, area);
      return area;
    } catch (e) {
      customerAreaCache.set(customerId, '');
      return '';
    }
  }

  // =========================================================
  // أرقام الهواتف (S3/S4)
  // الشبكة (بورتال Orders) لا تعرض عمود هاتف إطلاقًا، لذا نملأ
  // «رقم الموبايل» و«رقم شخص ذو صله» من ثلاثة مصادر بالترتيب:
  //   1) خلايا الشبكة — لو كان العرض يحتوي أعمدة هاتف فعلاً
  //   2) ذاكرة أداة «كشف الأرقام» في localStorage
  //   3) الـ Web API مباشرة (ldv_mobilenumber / ldv_referencecontact)
  // ونُوسم كل صف بمصدره ليظهر في عمود «مصدر الرقم» (اختياري).
  // =========================================================
  const incidentPhoneCache = new Map(); // incidentId -> { mobile, related }

  const PHONE_SOURCE_LABELS = {
    company:   'البوابة (الشركة)',
    extension: 'الإضافة (كشف)',
    api:       'الإضافة (API)',
  };

  function normalizePhone(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || s.includes('*')) return '';
    const m = s.match(/01[0-9]{9}/);
    if (m) return m[0];
    const digits = s.replace(/[^\d]/g, '');
    return digits.length >= 7 ? digits : '';
  }

  function phoneSourceLabel(src) {
    return PHONE_SOURCE_LABELS[src] || '';
  }

  // قيمة خلية الشبكة: نرفض الأقنعة (*****) والفراغ
  function cleanGridPhone(v) {
    const s = String(v == null ? '' : v).trim();
    return (!s || s.indexOf('*') !== -1) ? '' : s;
  }

  function getPortalPhoneSource() {
    try {
      const el = document.documentElement;
      const s = el && el.getAttribute('data-ea-phones-source');
      if (s === 'company' || s === 'extension') return s;
    } catch (_) {}
    return 'unknown';
  }

  function isPhoneColumnEnabled() {
    return selectedColumns.some(c => (c.id === 'phone' || c.id === 'phone2' || c.id === 'phoneSource') && !c.hidden);
  }

  function readRevealDirectory() {
    try { return JSON.parse(localStorage.getItem('elaraby_phone_directory') || '{}'); } catch (_) { return {}; }
  }

  async function fetchIncidentPhones(incidentId) {
    if (!incidentId) return { mobile: '', related: '' };
    if (incidentPhoneCache.has(incidentId)) return incidentPhoneCache.get(incidentId);
    let out = { mobile: '', related: '' };
    try {
      const resp = await fetch('/_api/incidents(' + incidentId + ')?$select=ldv_mobilenumber,ldv_referencecontact');
      if (resp.ok) {
        const d = await resp.json();
        out = { mobile: normalizePhone(d.ldv_mobilenumber), related: normalizePhone(d.ldv_referencecontact) };
      }
    } catch (e) {
      console.warn('[OrderExtractor] fetchIncidentPhones failed:', e.message);
    }
    incidentPhoneCache.set(incidentId, out);
    return out;
  }

  async function enrichOrdersWithPhones(orders, portalHeaders) {
    if (!isPhoneColumnEnabled()) return;
    if (!Array.isArray(orders) || !orders.length) return;

    const headerMap = mapPortalHeaders(portalHeaders || []);
    const phoneHdr = headerMap['phone'];
    const phone2Hdr = headerMap['phone2'];
    const custHdr = headerMap['customer'];
    const portalSource = getPortalPhoneSource();

    // صفوف وصلت بأرقام جاهزة (تقارير/استخراج سابق) وبلا وسم مصدر
    for (const o of orders) {
      if ((o._phone || o._phone2) && !o._phoneSource) {
        o._phoneSource = (portalSource === 'company') ? 'company' : 'extension';
      }
    }

    // 1) خلايا الشبكة (لو كان العرض يحتوي أعمدة هاتف فعلاً)
    for (const o of orders) {
      if (o._phone || o._phone2) continue;
      const gPhone = phoneHdr ? normalizePhone(o[phoneHdr]) : '';
      const gPhone2 = phone2Hdr ? normalizePhone(o[phone2Hdr]) : '';
      if (gPhone || gPhone2) {
        o._phone = gPhone;
        o._phone2 = gPhone2;
        o._phoneSource = (portalSource === 'company') ? 'company' : 'extension';
      }
    }

    // 2) ذاكرة أداة «كشف الأرقام» (مفتاحها اسم العميل)
    const dir = readRevealDirectory();
    for (const o of orders) {
      if (o._phone || o._phone2) continue;
      const name = custHdr ? String(o[custHdr] || '').trim() : '';
      const entry = name ? dir[name] : null;
      if (entry && Array.isArray(entry.phones) && entry.phones.length) {
        o._phone = normalizePhone(entry.phones[0]);
        o._phone2 = normalizePhone(entry.phones[1]);
        if (o._phone || o._phone2) o._phoneSource = 'extension';
      }
    }

    // 3) الـ Web API (المصدر الدقيق: ldv_mobilenumber / ldv_referencecontact)
    const apiNeed = orders.filter(o => !o._phone && !o._phone2 && o._orderId);
    if (!apiNeed.length) return;
    const BATCH = 8;
    for (let i = 0; i < apiNeed.length; i += BATCH) {
      if (stopRequested) break;
      const batch = apiNeed.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (o) => {
        const p = await fetchIncidentPhones(o._orderId);
        if (p.mobile) o._phone = p.mobile;
        if (p.related) o._phone2 = p.related;
        if (o._phone || o._phone2) o._phoneSource = 'api';
      }));
      setStatus(`⏳ جاري جلب أرقام الهواتف... ${Math.min(i + BATCH, apiNeed.length)}/${apiNeed.length}`, 'warn');
      await new Promise(r => setTimeout(r, 120));
    }
  }

  // ── Save new regions to regionTechMap ──
  async function saveAreasToRegionMap(orders) {
    const newAreas = [...new Set(orders.map(o => (o.area || '').trim()).filter(a => a && a !== 'غير محدد'))];
    if (!newAreas.length) return;
    try {
      const data = await storageGet({ regionTechMap: {} });
      const map = data.regionTechMap || {};
      let added = 0;
      for (const area of newAreas) {
        if (!(area in map)) {
          map[area] = '';
          added++;
        }
      }
      if (added > 0) {
        await storageSet({ regionTechMap: map });
        console.log(`[OrderExtractor] Added ${added} new region(s) to regionTechMap`);
      }
    } catch (e) {
      console.warn('[OrderExtractor] saveAreasToRegionMap failed:', e.message);
    }
  }

  async function enrichOrdersWithArea(orders) {
    const uniqueIds = [...new Set(orders.map(o => o._orderId).filter(Boolean))];
    if (!uniqueIds.length) return;

    const customerIds = new Set();
    const orderCustomerMap = new Map();
    const BATCH = 10;

    // Resolve customer IDs in batches
    for (let i = 0; i < uniqueIds.length; i += BATCH) {
      const batch = uniqueIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(id => fetchCustomerId(id)));
      results.forEach((r, idx) => {
        const orderId = batch[idx];
        if (r.status === 'fulfilled' && r.value) {
          customerIds.add(r.value);
          orderCustomerMap.set(orderId, r.value);
        }
      });
    }

    // Fetch areas in batches
    const custArray = [...customerIds];
    for (let i = 0; i < custArray.length; i += BATCH) {
      const batch = custArray.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(id => fetchArea(id)));
    }

    // Map back to orders
    for (const order of orders) {
      const custId = orderCustomerMap.get(order._orderId);
      if (custId && customerAreaCache.has(custId)) {
        order.area = customerAreaCache.get(custId);
      } else {
        order.area = '';
      }
    }
  }

  // ── Travel Costs ──
  async function loadTravelCosts() {
    try {
      const url = chrome.runtime.getURL('travel-costs.json');
      const resp = await fetch(url);
      if (!resp.ok) return {};
      const data = await resp.json();
      const out = {};
      for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('_')) continue;
        if (typeof v === 'number') out[k] = v;
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function calcAreaBreakdown(orders, travelCosts) {
    const map = new Map();
    for (const o of orders) {
      const area = (o.area || '').trim() || 'غير محدد';
      if (!map.has(area)) map.set(area, { count: 0 });
      map.get(area).count++;
    }
    return map;
  }

  function calcTravelCost(areaMap, travelCosts) {
    let total = 0;
    for (const [area] of areaMap) {
      if (area === 'غير محدد') continue;
      total += (travelCosts[area] || 0);
    }
    return total;
  }

  async function loadSettings() {
    const data = await storageGet({ extractorColumns: null });
    if (data.extractorColumns && Array.isArray(data.extractorColumns)) {
      selectedColumns = data.extractorColumns;
    } else {
      selectedColumns = DEFAULT_COLUMNS.map(c => ({ ...c }));
    }
    // ترحيل: أضف أي عمود جديد لم يكن محفوظًا في إعدادات المستخدم (مثل «مصدر الرقم»)
    DEFAULT_COLUMNS.forEach(def => {
      if (!selectedColumns.some(c => c.id === def.id)) selectedColumns.push({ ...def });
    });
    // Force all non-phone columns to be visible — only phones (and المصدر) can be toggled
    selectedColumns.forEach(c => {
      if (c.id !== 'phone' && c.id !== 'phone2' && c.id !== 'phoneSource') c.hidden = false;
    });
  }

  async function saveSettings() {
    await storageSet({ extractorColumns: selectedColumns });
  }

  // ── UI Injection ──
  function injectPanel() {
    if (document.getElementById('oe-panel')) return;

    // Find the search buttons bar to inject after it
    const searchBar = document.querySelector('.entity-quickfind') ||
                      document.querySelector('[class*="quickfind"]') ||
                      document.querySelector('.entity-form-header')?.closest('div');

    const panel = document.createElement('div');
    panel.id = 'oe-panel';
    panel.innerHTML = `
      <style>
        #oe-panel {
          background: #1a1d27;
          border: 1px solid #2a2d3e;
          border-radius: 8px;
          padding: 8px 10px;
          margin: 6px 12px;
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          direction: rtl;
          color: #c8d0e0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        #oe-panel h3 {
          margin: 0 0 6px 0;
          font-size: 12px;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        #oe-options {
          margin-bottom: 6px;
          font-size: 10px;
          color: #8899bb;
        }
        #oe-options label {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        #oe-buttons {
          display: flex;
          gap: 6px;
          margin-bottom: 4px;
        }
        #oe-buttons button {
          flex: 1;
          padding: 5px 8px;
          border: none;
          border-radius: 6px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .oe-btn-primary { background: #0a7cff; color: #fff; }
        .oe-btn-primary:hover { background: #0890e8; }
        .oe-btn-secondary { background: #1e2340; color: #c8d0e0; border: 1px solid #2a2d3e; }
        .oe-btn-secondary:hover { background: #252a45; border-color: #0a7cff; }
        .oe-btn-danger { background: #c0392b; color: #fff; }
        .oe-btn-danger:hover { background: #a93226; }
        #oe-buttons button:disabled { opacity: 0.4; cursor: not-allowed; }
        #oe-progress-wrap {
          height: 3px;
          background: #1e2340;
          border-radius: 3px;
          margin-bottom: 4px;
          display: none;
        }
        #oe-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #0a7cff, #00b4ff);
          border-radius: 3px;
          transition: width 0.3s;
          width: 0%;
        }
        #oe-status {
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          background: #12162a;
          color: #7a9cc8;
          border: 1px solid #1e2340;
          min-height: 22px;
          display: flex;
          align-items: center;
        }
        #oe-status.ok { background:#0d2b1c; color:#2bd46f; border-color:#1a4a2a; }
        #oe-status.error { background:#2a0808; color:#ff6b6b; border-color:#4a1a1a; }
        #oe-status.warn { background:#2a2008; color:#f0b429; border-color:#4a3a1a; }
        #oe-phone-source {
          display: none;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          padding: 5px 8px;
          border-radius: 4px;
          margin-top: 5px;
          border: 1px solid #1e2340;
          background: #12162a;
          color: #7a9cc8;
          cursor: help;
        }
        #oe-phone-source.visible { display: flex; }
        #oe-phone-source.company { background:#0d2b1c; color:#2bd46f; border-color:#1a4a2a; }
        #oe-phone-source.extension { background:#2a2008; color:#f0b429; border-color:#4a3a1a; }
        #oe-phone-source.unknown { background:#1a1a2a; color:#8899bb; border-color:#2a2a40; }
      </style>

      <h3>📥 استخراج البلاغات</h3>

      <div id="oe-options">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#c8d0e0;">
          <input type="checkbox" id="oe-include-phones" style="accent-color:#0a7cff;" />
          إضافة أرقام الموبايل
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#8899bb;margin-top:3px;margin-inline-start:16px;">
          <input type="checkbox" id="oe-include-phone-source" style="accent-color:#0a7cff;" />
          إظهار عمود «مصدر الرقم»
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#38bdf8;margin-top:3px;">
          <input type="checkbox" id="oe-include-future" checked style="accent-color:#0284c7;" />
          📅 تضمين وتظليل البلاغات المستقبلية (+3 أيام)
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#8899bb;margin-top:3px;">
          <input type="checkbox" id="oe-fetch-reports" style="accent-color:#0a7cff;" />
          سحب تقارير البلاغات (أبطأ لكن أكمل)
        </label>
      </div>

      <div id="oe-phone-source"></div>

      <div id="oe-buttons">
        <button class="oe-btn-primary" id="oe-extract-all">▶️ استخراج كل الصفحات</button>
        <button class="oe-btn-secondary" id="oe-extract-current">📄 الصفحة الحالية</button>
        <button class="oe-btn-danger" id="oe-stop" disabled>⛔</button>
      </div>

      <div id="oe-progress-wrap">
        <div id="oe-progress-bar"></div>
      </div>
      <div id="oe-status">جاهز — حدد الأعمدة واضغط استخراج</div>
    `;

    // Find insertion point
    const searchBtns = document.querySelector('.entity-quickfind')?.closest('.row') ||
                       document.querySelector('[class*="quickfind"]')?.parentElement;
    if (searchBtns) {
      searchBtns.parentNode.insertBefore(panel, searchBtns.nextSibling);
    } else {
      // Fallback: insert after the main header area
      const main = document.querySelector('.entity-grid')?.closest('.container') ||
                   document.querySelector('.main-content') ||
                   document.querySelector('[role="main"]') ||
                   document.body;
      main.insertBefore(panel, main.firstChild);
    }

    renderCheckboxes();
    setupEventListeners();
    watchPhoneSource();
  }

  // ── Phone source badge (S1) — يقرأ إعداد البوابة الأصلي من عنصر <html> ──
  function getPhoneSource() {
    try {
      const el = document.documentElement;
      const src = el && el.getAttribute('data-ea-phones-source');
      const forced = el ? el.getAttribute('data-ea-phones-forced') === 'true' : false;
      const portalHide = el ? el.getAttribute('data-ea-phones-portal-hide') : null;
      if (src === 'company' || src === 'extension' || src === 'unknown') {
        return { source: src, forced: forced, portalHide: portalHide };
      }
    } catch (_) {}
    return { source: 'unknown', forced: false, portalHide: null };
  }

  function updatePhoneSourceBadge() {
    const el = document.getElementById('oe-phone-source');
    if (!el) return;
    const info = getPhoneSource();
    let icon, text, tip;
    if (info.source === 'company') {
      icon = '🏢';
      text = 'الأرقام معروضة من البوابة/الشركة';
      tip = 'إعداد البوابة (hideCustomersPhones) = false؛ الأرقام ظاهرة من جهة الشركة نفسها — لا دخل لأداة كشف الأرقام في إظهارها.';
    } else if (info.source === 'extension') {
      icon = '📱';
      text = 'الأرقام مكشوفة بواسطة الإضافة';
      tip = 'إعداد البوابة (hideCustomersPhones) = true؛ البوابة تخفي الأرقام وأداة كشف الأرقام بالمضافة هي التي أظهرتها.';
    } else {
      icon = '❓';
      text = 'مصدر الأرقام غير معروف بعد';
      tip = 'لم يُرصد إعداد البوابة بعد. فعّل أداة كشف الأرقام وحدّث صفحة Orders ليظهر المصدر بدقة.';
    }
    el.className = 'visible ' + info.source;
    el.title = tip;
    el.innerHTML = '<span>' + icon + '</span><span>' + text + '</span>';
  }

  function watchPhoneSource() {
    updatePhoneSourceBadge();
    try {
      const obs = new MutationObserver(() => updatePhoneSourceBadge());
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ea-phones-source'] });
    } catch (_) {
      setInterval(updatePhoneSourceBadge, 2000);
    }
  }

  function renderCheckboxes() {
    const phoneCb = document.getElementById('oe-include-phones');
    const sourceCb = document.getElementById('oe-include-phone-source');
    const phoneCol = selectedColumns.find(c => c.id === 'phone');
    const phone2Col = selectedColumns.find(c => c.id === 'phone2');
    const sourceCol = selectedColumns.find(c => c.id === 'phoneSource');

    function syncSourceEnabled() {
      if (!sourceCb) return;
      const on = phoneCb ? phoneCb.checked : false;
      sourceCb.disabled = !on;
      if (sourceCb.parentElement) sourceCb.parentElement.style.opacity = on ? '1' : '0.45';
      if (!on) {
        sourceCb.checked = false;
        if (sourceCol) sourceCol.hidden = true;
      }
    }

    if (phoneCb) {
      phoneCb.checked = phoneCol ? !phoneCol.hidden : false;
      phoneCb.addEventListener('change', () => {
        if (phoneCol) phoneCol.hidden = !phoneCb.checked;
        if (phone2Col) phone2Col.hidden = !phoneCb.checked;
        syncSourceEnabled();
        saveSettings();
      });
      syncSourceEnabled();
    }
    if (sourceCb) {
      sourceCb.checked = sourceCol ? !sourceCol.hidden : false;
      sourceCb.addEventListener('change', () => {
        if (sourceCol) sourceCol.hidden = !sourceCb.checked;
        saveSettings();
      });
    }
  }

  function setStatus(text, type = '') {
    const el = document.getElementById('oe-status');
    if (el) {
      el.className = type;
      el.textContent = text;
    }
  }

  function setProgress(pct) {
    const wrap = document.getElementById('oe-progress-wrap');
    const bar = document.getElementById('oe-progress-bar');
    if (wrap) wrap.style.display = pct > 0 ? 'block' : 'none';
    if (bar) bar.style.width = pct + '%';
  }

  // ── Table Scraping ──
  const TABLE_SELECTORS = [
    'table.entity-grid',
    'table[class*="entitylist"]',
    '.grid-content table',
    'table[class*="grid"]',
    'table[role="grid"]',
    '.entitylist table',
    '#grid_openorders',
    '.view-grid table',
    'table',
  ];

  function findTableInDoc(doc) {
    for (const sel of TABLE_SELECTORS) {
      try {
        const t = doc.querySelector(sel);
        if (t && t.rows && t.rows.length > 0) return t;
      } catch (_) {}
    }
    const allTables = doc.querySelectorAll('table');
    for (const t of allTables) {
      if (t.rows && t.rows.length > 1 && t.offsetParent !== null) return t;
    }
    return null;
  }

  function clickSearchButton() {
    const sel = 'button[title="Search Results"], button[aria-label="Search Results"]';
    let btn = document.querySelector(sel);
    if (btn) { console.log('[OrderExtractor] Clicking search button in main doc'); btn.click(); return true; }
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        btn = iDoc.querySelector(sel);
        if (btn) { console.log('[OrderExtractor] Clicking search button in iframe'); btn.click(); return true; }
      } catch (_) {}
    }
    return false;
  }

  function findTable() {
    // Search main document first
    let table = findTableInDoc(document);
    if (table) {
      console.log('[OrderExtractor] Table found in main document');
      activeDoc = document;
      return { table, doc: document };
    }
    // Search iframes (PowerApps often renders content in iframes)
    const iframes = document.querySelectorAll('iframe');
    console.log('[OrderExtractor] Searching iframes:', iframes.length);
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        table = findTableInDoc(iframeDoc);
        if (table) {
          console.log('[OrderExtractor] Table found in iframe:', iframe.src || iframe.id);
          activeDoc = iframeDoc;
          return { table, doc: iframeDoc, iframe };
        }
      } catch (e) {
        console.log('[OrderExtractor] Cannot access iframe (cross-origin?):', iframe.src, e.message);
      }
    }
    console.log('[OrderExtractor] No table found. Tables on page:', document.querySelectorAll('table').length);
    return null;
  }

  async function waitForTable(maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const result = findTable();
      if (result) {
        // Wait for at least 2 rows (header + 1 data row)
        const rowCount = result.table.querySelectorAll('tbody tr, tr').length;
        if (rowCount >= 2) return result;
      }
      await new Promise(r => setTimeout(r, 800));
    }
    return findTable(); // final attempt
  }

  function getTableHeaders(result) {
    if (!result) result = findTable();
    if (!result) return null;
    const headerCells = result.table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
    return Array.from(headerCells).map(th => th.innerText.trim());
  }

  // ── Detail Page Scraping ──
  function scrapeDetailPage() {
    const data = {};
    const bodyText = document.body?.innerText || '';

    // Phone: regex on raw text
    const phoneMatch = bodyText.match(/01[0-9]{9}/);
    if (phoneMatch) data._phone = phoneMatch[0];

    // Phone2: second distinct phone in text
    const allPhones = bodyText.match(/01[0-9]{9}/g);
    if (allPhones && allPhones.length > 1) data._phone2 = allPhones[1];

    // Form inputs
    document.querySelectorAll('input:not([type="hidden"])').forEach(el => {
      const id = (el.id || '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const lbl = (el.closest('div')?.querySelector('label, span')?.innerText || '').toLowerCase();
      const val = (el.value || '').trim();
      if (!val) return;
      if (val.length > 2 && val.length < 30 && (id.includes('phone') || id.includes('mobile') || name.includes('phone') ||
          name.includes('mobile') || id.includes('هاتف') || id.includes('موبايل') || lbl.includes('هاتف') || lbl.includes('موبايل'))) {
        data._phone = val;
      }
      if (val.length > 5 && (id.includes('address') || id.includes('عنوان') || name.includes('address') || lbl.includes('عنوان'))) {
        data._fullAddress = val;
      }
      if (val.length > 5 && (id.includes('complaint') || id.includes('شكوى') || name.includes('complaint') || name.includes('شكوى') || lbl.includes('شكوى'))) {
        data._complaintDetail = val;
      }
    });

    // Label-value pairs in tables or detail views
    document.querySelectorAll('td, th, label, .field-label, .form-label, .ms-BasePicker-text').forEach(el => {
      const t = el.innerText.trim().toLowerCase();
      if (!t) return;
      let next = el.nextElementSibling;
      if (!next || !next.innerText || next.innerText.trim().length < 2) next = el.closest('tr')?.querySelector('td:last-child');
      if (!next || !next.innerText) return;
      const v = next.innerText.trim();
      if (!v || v.length > 100) return;
      if ((t.includes('mobile') || t.includes('phone') || t.includes('هاتف') || t.includes('موبايل')) && !data._phone && /01[0-9]{9}/.test(v)) data._phone = v;
      if ((t.includes('address') || t.includes('عنوان')) && !data._fullAddress) data._fullAddress = v;
      if ((t.includes('complaint') || t.includes('شكوى')) && !data._complaintDetail) data._complaintDetail = v;
    });

    return data;
  }

  // ── Report Fetching Queue ──
  async function startReportFetching(allOrders, allHeaders) {
    const ordersWithIds = allOrders.filter(o => o._orderId);
    if (!ordersWithIds.length) {
      exportXLSX(allOrders, allHeaders);
      return;
    }
    reportFetchQueue = ordersWithIds.map(o => o._orderId);
    reportFetchResults = [];
    await storageSet({
      reportFetchQueue,
      reportFetchResults: [],
      reportFetchHeaders: allHeaders,
      reportFetchOrders: allOrders,
      reportFetchInProgress: true,
      reportFetchListingUrl: window.location.href,
      reportFetchStartTime: Date.now(),
    });
    navigateToNextReport();
  }

  function navigateToNextReport() {
    if (stopRequested || !reportFetchQueue.length) {
      finalizeReportFetching();
      return;
    }
    const orderId = reportFetchQueue.shift();
    chrome.runtime.sendMessage({ type: 'STORAGE_SET', data: { reportFetchQueue } }).catch(() => {});
    const base = window.location.href.split('/Orders')[0] || window.location.href.match(/^https?:\/\/[^/]+/)?.[0] || '';
    window.location.href = `${base}/Reportdetail/?id=${orderId}`;
  }

  async function finalizeReportFetching() {
    const stored = await storageGet({
      reportFetchOrders: [], reportFetchHeaders: null, reportFetchResults: [],
    });
    const orders = stored.reportFetchOrders || [];
    const headers = stored.reportFetchHeaders;
    const results = stored.reportFetchResults || [];

    results.forEach(r => {
      const order = orders.find(o => o._orderId === r._orderId);
      if (order) Object.assign(order, r);
    });

    await storageSet({
      reportFetchQueue: [], reportFetchResults: [], reportFetchOrders: [],
      reportFetchHeaders: null, reportFetchInProgress: false, reportFetchListingUrl: null,
    });
    reportFetchQueue = []; reportFetchResults = [];

    if (orders.length && headers) {
      exportXLSX(orders, headers);
      setProgress(100);
      setStatus(`✅ تم تحميل ${orders.length} بلاغ شامل التقارير`, 'ok');
    }
  }

  async function processReportQueueOnListing() {
    const stored = await storageGet({
      reportFetchInProgress: false, reportFetchQueue: [], reportFetchResults: [],
      reportFetchHeaders: null, reportFetchOrders: [], reportFetchStartTime: 0,
    });
    if (!stored.reportFetchInProgress) return;

    // Stale data: clear if more than 10 minutes old
    if (Date.now() - (stored.reportFetchStartTime || 0) > 10 * 60 * 1000) {
      console.log('[OrderExtractor] Clearing stale report fetch data');
      await storageSet({
        reportFetchInProgress: false, reportFetchQueue: [], reportFetchResults: [],
        reportFetchHeaders: null, reportFetchOrders: [], reportFetchListingUrl: null,
      });
      setStatus('✅ تم تنظيف بيانات جلسة سابقة', 'ok');
      return;
    }

    reportFetchQueue = stored.reportFetchQueue || [];
    reportFetchResults = stored.reportFetchResults || [];
    const qLen = reportFetchQueue.length;
    setStatus(`🔍 جاري سحب التقارير... متبقي ${qLen} بلاغ`, 'warn');
    await new Promise(r => setTimeout(r, 500));
    navigateToNextReport();
  }

  async function handleDetailPageAutoExtract() {
    const stored = await storageGet({ reportFetchInProgress: false, reportFetchQueue: [], reportFetchResults: [], reportFetchHeaders: null, reportFetchOrders: [], reportFetchListingUrl: null, });
    if (!stored.reportFetchInProgress) return;
    const idMatch = window.location.href.match(/id=([^&]+)/);
    if (!idMatch) { setStatus('⚠️ لم يتم العثور على رقم البلاغ، جاري العودة...', 'warn'); setTimeout(() => { if (stored.reportFetchListingUrl) window.location.href = stored.reportFetchListingUrl; else history.back(); }, 500); return; }
    const orderId = idMatch[1];
    const reportData = scrapeDetailPage();
    reportData._orderId = orderId;
    const results = stored.reportFetchResults || [];
    results.push(reportData);
    const remaining = (stored.reportFetchQueue || []).length;
    await storageSet({ reportFetchResults: results });
    setStatus(`✅ تم سحب تقرير ${orderId} — متبقي ${remaining} بلاغ`, 'ok');
    setTimeout(() => {
      if (stored.reportFetchListingUrl) window.location.href = stored.reportFetchListingUrl;
      else history.back();
    }, 500);
  }

  // ── Future Orders Web API Fetcher (+3 Days) ──
  async function fetchFutureOrdersForExtraction(portalHeaders) {
    try {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(23, 59, 59, 999);
      const threeDaysIso = d.toISOString();

      const selectFields = [
        'incidentid', 'ticketnumber', 'title',
        'ldv_scheduledservicestartdate', 'ldv_appointmentdate',
        'ldv_address', 'ldv_mobilenumber', 'ldv_referencecontact', 'ldv_sapordernumber',
        '_ldv_producttype_value', '_ldv_problem_value',
        '_ats_territories_value', '_customerid_value', 'statuscode'
      ].join(',');

      // نداء واسع (OR) لجمع المرشّحين، ثم تصفية دقيقة أدناه
      const filter = `statecode eq 0 and (ldv_scheduledservicestartdate gt ${threeDaysIso} or ldv_appointmentdate gt ${threeDaysIso})`;
      const url = `/_api/incidents?$filter=${encodeURIComponent(filter)}&$select=${selectFields}&$orderby=ldv_scheduledservicestartdate asc`;

      let list = [];
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        list = data.value || [];
      } else {
        // احتياطي: بعض مخططات Dataverse لا تقبل OR بين حقلَي تاريخ
        const fbFilter = `statecode eq 0 and ldv_scheduledservicestartdate gt ${threeDaysIso}`;
        const fbUrl = `/_api/incidents?$filter=${encodeURIComponent(fbFilter)}&$select=${selectFields}&$orderby=ldv_scheduledservicestartdate asc`;
        const fbResp = await fetch(fbUrl);
        if (fbResp.ok) {
          const fbData = await fbResp.json();
          list = fbData.value || [];
        }
      }

      // تصفية دقيقة (S5): «مستقبلي» = التاريخ الفعلي (المجدول وإلا الموعد) بعد الحد.
      // يمنع الحالة الخاطئة: بلاغ مجدول اليوم لكن حقل «موعد» آخر بعيد — الذي
      // كان يُدرج بالخطأ بسبب OR بين الحقلين في الاستعلام.
      const thresholdMs = new Date(threeDaysIso).getTime();
      list = list.filter(item => {
        const eff = item.ldv_scheduledservicestartdate || item.ldv_appointmentdate;
        if (!eff) return false;
        const ms = new Date(eff).getTime();
        return !isNaN(ms) && ms > thresholdMs;
      });

      const headerMap = mapPortalHeaders(portalHeaders);
      const mappedOrders = list.map(item => {
        const dateVal = item.ldv_scheduledservicestartdate || item.ldv_appointmentdate || '';
        let dateFormatted = '';
        if (dateVal) {
          try {
            const dt = new Date(dateVal);
            dateFormatted = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
          } catch (_) { dateFormatted = dateVal; }
        }

        const o = {
          _orderId: item.incidentid,
          _isFuture: true
        };

        if (headerMap['orderNo']) o[headerMap['orderNo']] = item.ticketnumber || '';
        if (headerMap['customer']) o[headerMap['customer']] = item['_customerid_value@OData.Community.Display.V1.FormattedValue'] || item.title || '';
        if (headerMap['product']) o[headerMap['product']] = item['_ldv_producttype_value@OData.Community.Display.V1.FormattedValue'] || '';
        if (headerMap['complaint']) o[headerMap['complaint']] = item['_ldv_problem_value@OData.Community.Display.V1.FormattedValue'] || 'صيانة';
        if (headerMap['bookingDate']) o[headerMap['bookingDate']] = dateFormatted;
        if (headerMap['address']) o[headerMap['address']] = item.ldv_address || '';
        if (headerMap['sap']) o[headerMap['sap']] = item.ldv_sapordernumber || '';
        if (headerMap['area']) o[headerMap['area']] = item['_ats_territories_value@OData.Community.Display.V1.FormattedValue'] || '';
        // أرقام الهواتف: من الـ API مباشرة — مصدرها الإضافة دائمًا
        o._phone = normalizePhone(item.ldv_mobilenumber);
        o._phone2 = normalizePhone(item.ldv_referencecontact);
        if (o._phone || o._phone2) o._phoneSource = 'api';
        if (headerMap['phone'] && o._phone) o[headerMap['phone']] = o._phone;
        if (headerMap['serviceType']) o[headerMap['serviceType']] = 'صيانة';
        if (headerMap['hasComplaint']) o[headerMap['hasComplaint']] = 'لا';
        if (headerMap['technician']) o[headerMap['technician']] = 'متنقلة';

        return o;
      });

      return mappedOrders;
    } catch (err) {
      console.warn('[OrderExtractor] fetchFutureOrdersForExtraction failed:', err);
      return [];
    }
  }

  // ── Table Scraping ──
  function scrapeCurrentPage() {
    const result = findTable();
    if (!result) return { ok: false, error: 'لم يتم العثور على جدول البلاغات — تأكد أن صفحة Orders مفتوحة والجدول ظاهر' };

    const { table } = result;
    const headers = getTableHeaders(result);
    if (!headers || !headers.length) return { ok: false, error: 'لم يتم العثور على رؤوس الأعمدة' };

    const rows = table.querySelectorAll('tbody tr');
    const orders = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;

      const order = {};
      cells.forEach((cell, i) => {
        const headerText = headers[i] || `col_${i}`;
        const link = cell.querySelector('a');
        const orderId = link ? (link.href.match(/id=([^&]+)/)?.[1] || link.innerText.trim()) : '';
        order[headerText] = cell.innerText.trim();
        if (orderId && !order._orderId) order._orderId = orderId;
      });

      // Fix: PowerApps portal sometimes merges adjacent cell values with " | "
      // Detect and split merged customer/complaint values
      const customerHeader = headers[1];
      const complaintHeader = headers.find(h => h.includes('شكوى العميل'));
      const hasComplaintHeader = headers.find(h => h.includes('يوجد شكوى'));
      if (customerHeader && order[customerHeader] && order[customerHeader].includes(' | ')) {
        const parts = order[customerHeader].split(' | ');
        order[customerHeader] = parts[0].trim();
        if (complaintHeader && parts[1]) {
          order[complaintHeader] = parts[1].trim();
        }
      }
      if (complaintHeader && order[complaintHeader] && order[complaintHeader].includes(' | ')) {
        const parts = order[complaintHeader].split(' | ');
        order[complaintHeader] = parts[0].trim();
        if (hasComplaintHeader && parts[1]) {
          order[hasComplaintHeader] = parts[1].trim();
        }
      }

      if (Object.values(order).some(v => v && v.trim())) {
        orders.push(order);
      }
    });

    if (!orders.length) return { ok: false, error: `الجدول فاضي — الصفوف: ${rows.length}, الأعمدة: ${headers.length}` };

    return { ok: true, orders, count: orders.length, headers };
  }

  // ── Column Mapping ──
  function mapPortalHeaders(portalHeaders) {
    const map = {};
    portalHeaders.forEach(h => {
      const hl = h.toLowerCase().trim();
      // First pass: exact match
      for (const [arabic, fieldId] of Object.entries(HEADER_MAP)) {
        if (hl === arabic.toLowerCase()) {
          if (!map[fieldId]) map[fieldId] = h.trim();
          return;
        }
      }
      // Second pass: starts-with match
      for (const [arabic, fieldId] of Object.entries(HEADER_MAP)) {
        if (hl.startsWith(arabic.toLowerCase()) || arabic.toLowerCase().startsWith(hl)) {
          if (!map[fieldId]) map[fieldId] = h.trim();
          return;
        }
      }
      // Third pass: includes match
      for (const [arabic, fieldId] of Object.entries(HEADER_MAP)) {
        if (hl.includes(arabic.toLowerCase())) {
          if (!map[fieldId]) map[fieldId] = h.trim();
          return;
        }
      }
    });
    return map;
  }

  function getSelectedFieldIds() {
    return selectedColumns.filter(c => !c.hidden).map(c => c.id);
  }

  // ── Pagination ──
  let activeDoc = document;

  function hasNextPage() {
    const nextBtn = activeDoc.querySelector('a.entity-pager-next-link:not([aria-disabled="true"])');
    if (!nextBtn) return false;
    const nextLi = nextBtn.closest('li');
    if (!nextLi || nextLi.classList.contains('disabled')) return false;
    return true;
  }

  function clickNextPage() {
    const nextBtn = activeDoc.querySelector('a.entity-pager-next-link:not([aria-disabled="true"])');
    if (nextBtn) {
      nextBtn.click();
      return true;
    }
    return false;
  }

  // ── Helpers ──
  function colLetter(n) {
    let s = '';
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }

  // ── Export — uses ExcelJS (full styling, conditional formatting, formulas) ──
  async function exportXLSX(allOrders, portalHeaders) {
    console.log('[OrderExtractor] exportXLSX called. Orders:', allOrders.length);
    console.log('[OrderExtractor] ExcelJS available:', typeof ExcelJS !== 'undefined');

    // ── S3/S4: املأ أرقام الهواتف (شبكة → ذاكرة الأداة → API) مع وسم المصدر ──
    try { await enrichOrdersWithPhones(allOrders, portalHeaders); }
    catch (e) { console.warn('[OrderExtractor] phone enrichment failed:', e.message); }

    // Fallback to SheetJS if ExcelJS not loaded
    if (typeof ExcelJS === 'undefined') {
      console.log('[OrderExtractor] ExcelJS not available, falling back to SheetJS');
      if (typeof XLSX === 'undefined') { setStatus('❌ مكتبات Excel غير متوفرة', 'error'); return; }
      exportLegacyXLSX(allOrders, portalHeaders);
      return;
    }

    const fieldIds = getSelectedFieldIds();
    const headerMap = mapPortalHeaders(portalHeaders);

    const outputHeaders = fieldIds.map(id => {
      const col = selectedColumns.find(c => c.id === id);
      return col ? col.label : id;
    });

    // Detect duplicate order numbers (two-pass: count → mark)
    const orderNoHeader = headerMap['orderNo'];
    if (orderNoHeader) {
      const countMap = new Map();
      allOrders.forEach(o => {
        const v = (o[orderNoHeader] || '').toString().trim();
        countMap.set(v, (countMap.get(v) || 0) + 1);
      });
      allOrders.forEach(o => {
        const v = (o[orderNoHeader] || '').toString().trim();
        o._dup = (countMap.get(v) || 0) > 1;
      });
    }

    // Build workbook
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet('بلاغات');

    // RTL + Freeze header row
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activePane: 'bottomLeft', rightToLeft: true }];

    // Column widths
    const COL_WIDTHS = {
      'orderNo': 17.61, 'customer': 14.33, 'area': 8.4, 'address': 8.4,
      'product': 8.4, 'complaint': 8.4, 'bookingDate': 9.11, 'officeNotes': 8.4,
      'callNotes': 8.4, 'serviceType': 4.44, 'hasComplaint': 4.44, 'sap': 8.4,
      'technician': 8.4, 'phone': 8.4, 'phone2': 8.4, 'phoneSource': 14,
    };
    fieldIds.forEach((id, idx) => {
      const col = ws.getColumn(idx + 1);
      col.width = COL_WIDTHS[id] || 8.4;
    });

    // Default sort: bookingDate desc → customer asc → officeNotes asc
    const hdr = (id) => headerMap[id];
    const dateHdr = hdr('bookingDate');
    const custHdr = hdr('customer');
    const noteHdr = hdr('officeNotes');
    const sortKey = (v) => {
      const s = (v||'').trim();
      const md = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (md) return md[3] + md[2].padStart(2,'0') + md[1].padStart(2,'0');
      const my = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (my) return my[1] + my[2].padStart(2,'0') + my[3].padStart(2,'0');
      return s;
    };
    allOrders.sort((a, b) => {
      const c = sortKey(b[dateHdr]).localeCompare(sortKey(a[dateHdr]));
      if (c) return c;
      const c2 = (a[custHdr]||'').trim().localeCompare((b[custHdr]||'').trim());
      if (c2) return c2;
      return (a[noteHdr]||'').trim().localeCompare((b[noteHdr]||'').trim());
    });

    // Split: today's orders vs past orders (for separator + highlighting)
    const todayStr = new Date().toLocaleDateString('en-GB').split('/').map(n => n.padStart(2,'0')).join('/');
    const pastOrders = [];
    const todayOrders = [];
    allOrders.forEach(o => {
      if ((o[dateHdr]||'').trim() === todayStr) todayOrders.push(o);
      else pastOrders.push(o);
    });

    // Header row — blue dark bg + white bold font + borders
    const headerRow = ws.addRow(outputHeaders);
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };
    headerRow.eachCell(c => {
      c.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });

    // Data rows with styling
    const orderNoIdx = fieldIds.indexOf('orderNo');
    const complaintHdr = hdr('hasComplaint');
    const rowFill = (clr) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: clr } });
    const lastColLetter = colLetter(fieldIds.length);

    // Helper: add a styled data row from an order object
    function addDataRow(order) {
      const row = outputHeaders.map(h => {
        const col = selectedColumns.find(c => c.label === h);
        const srcFieldId = col ? col.id : null;
        const srcHeader = srcFieldId ? headerMap[srcFieldId] : null;
        let val = '';
        if (srcFieldId === 'area' && order.area) {
          val = order.area;
        } else if (srcFieldId === 'phone') {
          val = order._phone || cleanGridPhone(srcHeader ? order[srcHeader] : '');
        } else if (srcFieldId === 'phone2') {
          val = order._phone2 || cleanGridPhone(srcHeader ? order[srcHeader] : '');
        } else if (srcFieldId === 'phoneSource') {
          val = phoneSourceLabel(order._phoneSource);
        } else if (srcHeader) {
          val = order[srcHeader] || '';
        }
        return val.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      });
      const added = ws.addRow(row);
      added.alignment = { horizontal: 'right', vertical: 'center' };

      const isDuplicate = order._dup === true;
      const isFuture = order._isFuture === true;
      const hasComplaint = complaintHdr && /^(yes|نعم|y)$/i.test((order[complaintHdr]||'').trim());

      if (hasComplaint) {
        added.fill = rowFill('FFCC0000');
        added.font = { name: 'Calibri', size: 11, color: { argb: 'FFFFFF00' }, bold: true };
      } else if (isFuture) {
        // تظليل بلون لبني ناعم (Soft Cyan / Light Blue) للبلاغات المستقبلية
        added.fill = rowFill('FFD9E1F2');
        added.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F497D' }, bold: true };
      } else {
        added.font = { name: 'Calibri', size: 11 };
      }

      added.eachCell(c => {
        c.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
      });

      if (isDuplicate && orderNoIdx >= 0) {
        const cell = added.getCell(orderNoIdx + 1);
        cell.fill = rowFill('FFFFCCCC');
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFCC0000' }, bold: true };
        cell.alignment = { horizontal: 'right', vertical: 'center' };
      }
    }

    // Build data rows: today first, blank separator, then past
    const rowData = [...todayOrders, null, ...pastOrders];
    rowData.forEach(order => {
      if (order === null) { ws.addRow([]); return; }
      addDataRow(order);
    });

    // AutoFilter on header + all data rows
    ws.autoFilter = { from: 'A1', to: `${lastColLetter}${1 + allOrders.length}` };

    // ── Summary rows (side by side) ──
    const servHdr = hdr('serviceType');
    const stats = (orders) => ({
      count: orders.length,
      complaints: complaintHdr ? orders.filter(o => /^(yes|نعم|y)$/i.test((o[complaintHdr]||'').trim())).length : 0,
      dupFaults: orders.filter(o => { const ch = hdr('complaint'); return ch && (o[ch]||'').includes('تكرار أعطال'); }).length,
      maintenance: servHdr ? orders.filter(o => (o[servHdr]||'').includes('صيانة')).length : 0,
      installation: servHdr ? orders.filter(o => (o[servHdr]||'').includes('تركيب')).length : 0,
      inspection: servHdr ? orders.filter(o => (o[servHdr]||'').includes('معاينة')).length : 0,
    });
    const tStats = stats(todayOrders);
    const pStats = stats(pastOrders);
    const totStats = stats(allOrders);
    // Build row of 8 cells: [todayL, todayV, '', pastL, pastV, '', totalL, totalV]
    const sbRow = (tl, tv, pl, pv, tl2, tv2, isHead) => {
      const r = ws.addRow([tl ?? '', tv ?? '', '', pl ?? '', pv ?? '', '', tl2 ?? '', tv2 ?? '']);
      if (isHead) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
        r.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      } else {
        r.font = { name: 'Calibri', size: 11 };
      }
      r.alignment = { horizontal: 'right', vertical: 'center' };
      if (!isHead) {
        r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } }, }; });
      }
      return r;
    };
    // Column widths for summary area
    ws.addRow([]);
    ws.addRow([]);
    const hRow = sbRow('بلاغات اليوم', null, 'باقي البلاغات', null, 'الإجمالي', null, true);
    ws.mergeCells(`A${hRow.number}:B${hRow.number}`);
    ws.mergeCells(`D${hRow.number}:E${hRow.number}`);
    ws.mergeCells(`G${hRow.number}:H${hRow.number}`);

    ws.getColumn(3).width = 2;
    ws.getColumn(6).width = 2;
    ws.getColumn(9).width = 10.5;

    sbRow('عدد البلاغات', tStats.count, 'عدد البلاغات', pStats.count, 'الإجمالي', totStats.count);
    sbRow('عدد الشكاوى', tStats.complaints, 'عدد الشكاوى', pStats.complaints, 'عدد الشكاوى', totStats.complaints);
    sbRow('تكرار أعطال', tStats.dupFaults, 'تكرار أعطال', pStats.dupFaults, 'تكرار أعطال', totStats.dupFaults);
    sbRow('صيانة', tStats.maintenance, 'صيانة', pStats.maintenance, 'صيانة', totStats.maintenance);
    sbRow('تركيب', tStats.installation, 'تركيب', pStats.installation, 'تركيب', totStats.installation);
    sbRow('معاينة', tStats.inspection, 'معاينة', pStats.inspection, 'معاينة', totStats.inspection);

    // ── Area breakdown + travel costs ──
    const travelCosts = await loadTravelCosts();
    const tAreaMap = calcAreaBreakdown(todayOrders, travelCosts);
    const pAreaMap = calcAreaBreakdown(pastOrders, travelCosts);
    const totAreaMap = calcAreaBreakdown(allOrders, travelCosts);
    const allAreas = [...new Set([...tAreaMap.keys(), ...pAreaMap.keys()])].sort();

    if (allAreas.length) {
      ws.addRow([]);
      const areaH = ws.addRow(['المنطقة', 'عدد', 'بدل', '', 'عدد', 'بدل', '', 'عدد', 'بدل']);
      areaH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
      areaH.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      areaH.alignment = { horizontal: 'center', vertical: 'center' };
      ws.mergeCells(`A${areaH.number}:A${areaH.number}`);

      for (const area of allAreas) {
        const tc = tAreaMap.get(area)?.count || 0;
        const pc = pAreaMap.get(area)?.count || 0;
        const ac = totAreaMap.get(area)?.count || 0;
        const cost = travelCosts[area] || 0;
        const r = ws.addRow([area, tc, cost, '', pc, cost, '', ac, cost]);
        r.font = { name: 'Calibri', size: 11 };
        r.alignment = { horizontal: 'right', vertical: 'center' };
        r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } }, }; });
      }

      const tCost = calcTravelCost(tAreaMap, travelCosts);
      const pCost = calcTravelCost(pAreaMap, travelCosts);
      const aCost = calcTravelCost(totAreaMap, travelCosts);
      const costRow = ws.addRow(['إجمالي بدل الانتقال', tCost, '', '', pCost, '', '', aCost, '']);
      costRow.font = { name: 'Calibri', size: 11, bold: true };
      costRow.alignment = { horizontal: 'right', vertical: 'center' };
      costRow.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } }, }; });
    }

    sbRow(null, null, null, null, 'تاريخ التقرير', new Date().toLocaleDateString('ar-EG'));

    // Write buffer → Blob → download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `بلاغات_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ── Legacy export (SheetJS fallback) — preserves backward compat ──
  function exportLegacyXLSX(allOrders, portalHeaders) {
    const fieldIds = getSelectedFieldIds();
    const headerMap = mapPortalHeaders(portalHeaders);

    const outputHeaders = fieldIds.map(id => {
      const col = selectedColumns.find(c => c.id === id);
      return col ? col.label : id;
    });

    const wsData = [outputHeaders];
    allOrders.forEach(order => {
      const row = outputHeaders.map(h => {
        const col = selectedColumns.find(c => c.label === h);
        const srcFieldId = col ? col.id : null;
        const srcHeader = srcFieldId ? headerMap[srcFieldId] : null;
        let val = '';
        if (srcFieldId === 'area' && order.area) val = order.area;
        else if (srcFieldId === 'phone') val = order._phone || cleanGridPhone(srcHeader ? order[srcHeader] : '');
        else if (srcFieldId === 'phone2') val = order._phone2 || cleanGridPhone(srcHeader ? order[srcHeader] : '');
        else if (srcFieldId === 'phoneSource') val = phoneSourceLabel(order._phoneSource);
        else if (srcHeader) val = order[srcHeader] || '';
        return val.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      });
      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const COL_WIDTHS = {
      'orderNo': 17.61, 'customer': 14.33, 'area': 8.4, 'address': 8.4,
      'product': 8.4, 'complaint': 8.4, 'bookingDate': 9.11, 'officeNotes': 8.4,
      'callNotes': 8.4, 'serviceType': 4.44, 'hasComplaint': 4.44, 'sap': 8.4,
      'technician': 8.4, 'phone': 8.4, 'phone2': 8.4, 'phoneSource': 14,
    };
    ws['!cols'] = fieldIds.map(id => ({ wch: COL_WIDTHS[id] || 8.4 }));
    ws['!rtl'] = true;
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'بلاغات');
    XLSX.writeFile(wb, `بلاغات_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // ── Extract All Pages ──
  async function extractAllPages() {
    console.log('[OrderExtractor] extractAllPages called');
    if (isExtracting) { console.log('[OrderExtractor] Already extracting'); return; }
    isExtracting = true;
    stopRequested = false;

    const extractAllBtn = document.getElementById('oe-extract-all');
    const extractCurrentBtn = document.getElementById('oe-extract-current');
    const stopBtn = document.getElementById('oe-stop');
    if (extractAllBtn) extractAllBtn.disabled = true;
    if (extractCurrentBtn) extractCurrentBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    let allOrders = [];
    let firstHeaders = null;
    let pageNum = 1;

    try {
      setStatus('جاري انتظار تحميل الجدول...', 'warn');
      setProgress(5);

      let tableResult = await waitForTable(8000);

      // If table not found, try clicking the search button first
      if (!tableResult) {
        console.log('[OrderExtractor] Table not found, trying search button');
        setStatus('🔍 الجدول فاضي — جاري الضغط على زر البحث...', 'warn');
        if (clickSearchButton()) {
          await new Promise(r => setTimeout(r, 2000));
          tableResult = await waitForTable(12000);
        }
      }

      if (!tableResult) {
        setStatus('❌ لم يتم العثور على جدول البلاغات — تأكد أن صفحة Orders مفتوحة', 'error');
        isExtracting = false;
        if (extractAllBtn) extractAllBtn.disabled = false;
        if (extractCurrentBtn) extractCurrentBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        return;
      }

      let searchRetried = false;
      while (!stopRequested) {
        const result = scrapeCurrentPage();
        if (!result.ok) {
          // Retry on first page: table shell exists but no data rows — click search
          if (!searchRetried) {
            searchRetried = true;
            console.log('[OrderExtractor] Empty table, clicking search button');
            setStatus('🔍 الجدول فاضي — جاري الضغط على زر البحث...', 'warn');
            if (clickSearchButton()) {
              await new Promise(r => setTimeout(r, 2000));
              await waitForTable(12000);
              continue;
            }
          }
          console.log('[OrderExtractor] Scrape failed:', result.error);
          setStatus(result.error, 'error');
          break;
        }

        console.log(`[OrderExtractor] Page ${pageNum}: ${result.count} orders`);
        allOrders = allOrders.concat(result.orders);
        if (!firstHeaders) firstHeaders = result.headers;
        setStatus(`تم سحب ${allOrders.length} بلاغ من ${pageNum} صفحة...`, 'warn');
        setProgress(Math.min(90, (pageNum * 10)));

        if (!hasNextPage() || stopRequested) break;

        clickNextPage();
        pageNum++;

        if (pageNum > 50) {
          setStatus('تم الوصول للحد الأقصى (50 صفحة)', 'warn');
          break;
        }

        // Small delay for page transition, then wait for table
        await new Promise(r => setTimeout(r, 800));
        const nextTable = await waitForTable(12000);
        if (!nextTable) {
          setStatus('❌ فشل تحميل الصفحة التالية', 'error');
          break;
        }
      }

      console.log(`[OrderExtractor] Done. Total: ${allOrders.length}, stopped: ${stopRequested}`);

      // Check if user requested including future orders (+3 days)
      const includeFuture = document.getElementById('oe-include-future')?.checked || false;
      if (includeFuture && !stopRequested && firstHeaders) {
        setStatus('📅 جاري فحص وسحب البلاغات المستقبلية (+3 أيام)...', 'warn');
        try {
          const futureList = await fetchFutureOrdersForExtraction(firstHeaders);
          if (futureList && futureList.length > 0) {
            // Avoid duplicate CAS
            const existingOrderNos = new Set();
            const orderNoHdr = mapPortalHeaders(firstHeaders)['orderNo'];
            if (orderNoHdr) {
              allOrders.forEach(o => {
                const num = (o[orderNoHdr] || '').toString().trim();
                if (num) existingOrderNos.add(num);
              });
            }
            let addedCount = 0;
            futureList.forEach(fo => {
              const num = orderNoHdr ? (fo[orderNoHdr] || '').toString().trim() : '';
              if (!existingOrderNos.has(num)) {
                allOrders.push(fo);
                addedCount++;
              }
            });
            console.log(`[OrderExtractor] Added ${addedCount} future orders to extraction list`);
          }
        } catch (fErr) {
          console.warn('[OrderExtractor] Failed to include future orders:', fErr);
        }
      }

      if (!stopRequested && allOrders.length > 0) {
        const fetchReports = document.getElementById('oe-fetch-reports')?.checked || false;
        console.log('[OrderExtractor] Fetch reports:', fetchReports);
        if (fetchReports) {
          setStatus(`🔍 جاري بدء سحب التقارير لـ ${allOrders.length} بلاغ...`, 'warn');
          await startReportFetching(allOrders, firstHeaders);
        } else {
          setStatus(`⏳ جاري سحب بيانات المناطق...`, 'warn');
          await enrichOrdersWithArea(allOrders);
          await saveAreasToRegionMap(allOrders);
          setStatus(`⏳ جاري تحميل ملف Excel...`, 'warn');
          exportXLSX(allOrders, firstHeaders);
          setStatus(`✅ تم تحميل ${allOrders.length} بلاغ (${pageNum} صفحة) كملف Excel`, 'ok');
          setProgress(100);
        }
      } else if (stopRequested) {
        setStatus('⚠️ تم الإيقاف', 'warn');
      } else {
        setStatus('لا توجد بلاغات', 'error');
      }
    } catch (e) {
      setStatus('خطأ: ' + e.message, 'error');
    }

    isExtracting = false;
    if (extractAllBtn) extractAllBtn.disabled = false;
    if (extractCurrentBtn) extractCurrentBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  // ── Extract Current Page ──
  async function extractCurrentPage() {
    let table = await waitForTable(8000);
    if (!table) {
      console.log('[OrderExtractor] Table not found for current page, trying search');
      setStatus('🔍 جاري الضغط على زر البحث...', 'warn');
      if (clickSearchButton()) {
        await new Promise(r => setTimeout(r, 2000));
        table = await waitForTable(12000);
      }
    }
    if (!table) {
      setStatus('❌ لم يتم العثور على جدول البلاغات', 'error');
      return;
    }
    let result = scrapeCurrentPage();
    if (!result.ok) {
      console.log('[OrderExtractor] Empty table on current page, clicking search');
      setStatus('🔍 الجدول فاضي — جاري الضغط على زر البحث...', 'warn');
      if (clickSearchButton()) {
        await new Promise(r => setTimeout(r, 2000));
        table = await waitForTable(12000);
        if (table) result = scrapeCurrentPage();
      }
    }
    if (!result.ok) {
      setStatus(result.error, 'error');
      return;
    }

    // Check if user requested including future orders (+3 days)
    const includeFuture = document.getElementById('oe-include-future')?.checked || false;
    if (includeFuture && result.headers) {
      setStatus('📅 جاري فحص وسحب البلاغات المستقبلية (+3 أيام)...', 'warn');
      try {
        const futureList = await fetchFutureOrdersForExtraction(result.headers);
        if (futureList && futureList.length > 0) {
          const existingOrderNos = new Set();
          const orderNoHdr = mapPortalHeaders(result.headers)['orderNo'];
          if (orderNoHdr) {
            result.orders.forEach(o => {
              const num = (o[orderNoHdr] || '').toString().trim();
              if (num) existingOrderNos.add(num);
            });
          }
          futureList.forEach(fo => {
            const num = orderNoHdr ? (fo[orderNoHdr] || '').toString().trim() : '';
            if (!existingOrderNos.has(num)) {
              result.orders.push(fo);
            }
          });
        }
      } catch (fErr) {
        console.warn('[OrderExtractor] Failed to include future orders:', fErr);
      }
    }

    const fetchReports = document.getElementById('oe-fetch-reports')?.checked || false;
    if (fetchReports) {
      setStatus(`🔍 جاري بدء سحب التقارير لـ ${result.orders.length} بلاغ...`, 'warn');
      await startReportFetching(result.orders, result.headers);
    } else {
      await enrichOrdersWithArea(result.orders);
      await saveAreasToRegionMap(result.orders);
      exportXLSX(result.orders, result.headers);
      setStatus(`✅ تم تحميل ${result.orders.length} بلاغ من الصفحة الحالية كملف Excel`, 'ok');
    }
  }

  // ── Event Listeners ──
  function setupEventListeners() {
    document.getElementById('oe-extract-all')?.addEventListener('click', extractAllPages);
    document.getElementById('oe-extract-current')?.addEventListener('click', extractCurrentPage);
    document.getElementById('oe-stop')?.addEventListener('click', () => {
      stopRequested = true;
      if (reportFetchQueue.length) {
        reportFetchQueue = [];
        storageSet({ reportFetchQueue: [] }).then(() => finalizeReportFetching());
      }
    });
    document.getElementById('oe-fetch-reports')?.addEventListener('change', (e) => {
      fetchReportsEnabled = e.target.checked;
    });
  }

  // ── Message Handler ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;

    if (msg.action === 'EXTRACT_CURRENT_PAGE') {
      (async () => {
        let table = await waitForTable(8000);
        if (!table) {
          setStatus('🔍 جاري الضغط على زر البحث...', 'warn');
          if (clickSearchButton()) {
            await new Promise(r => setTimeout(r, 2000));
            table = await waitForTable(12000);
          }
        }
        if (!table) {
          sendResponse({ ok: false, error: 'لم يتم العثور على جدول البلاغات' });
          return;
        }
        let result = scrapeCurrentPage();
        if (!result.ok) {
          if (clickSearchButton()) {
            await new Promise(r => setTimeout(r, 2000));
            table = await waitForTable(12000);
            if (table) result = scrapeCurrentPage();
          }
        }
        if (!result.ok) {
          sendResponse({ ok: false, error: result.error });
          return;
        }
        await enrichOrdersWithArea(result.orders);
        await saveAreasToRegionMap(result.orders);
        exportXLSX(result.orders, result.headers);
        sendResponse({ ok: true, count: result.count });
      })();
      return true;
    }

    if (msg.action === 'EXTRACT_ALL_PAGES') {
      extractAllPages().then(() => {
        const statusEl = document.getElementById('oe-status');
        const statusText = statusEl ? statusEl.textContent : '';
        const isError = statusEl ? statusEl.classList.contains('error') : false;
        sendResponse({ ok: !isError, error: isError ? statusText : undefined });
      }).catch(e => {
        sendResponse({ ok: false, error: e.message });
      });
      return true;
    }

    if (msg.action === 'GET_EXTRACTOR_COLUMNS') {
      sendResponse({ columns: selectedColumns });
      return;
    }

    if (msg.action === 'UPDATE_EXTRACTOR_COLUMNS') {
      selectedColumns = msg.columns || DEFAULT_COLUMNS.map(c => ({ ...c }));
      saveSettings();
      renderCheckboxes();
      sendResponse({ ok: true });
      return;
    }

    if (msg.action === 'EXTRACT_ORDER_REPORT') {
      // Open order detail page and extract report data
      const orderId = msg.orderId;
      if (!orderId) {
        sendResponse({ ok: false, error: 'لم يتم تحديد رقم البلاغ' });
        return;
      }
      // Find the order link in the table
      const links = activeDoc.querySelectorAll('table.entity-grid a[href*="id="]');
      let targetLink = null;
      links.forEach(link => {
        if (link.href.includes(orderId) || link.textContent.trim() === orderId) {
          targetLink = link;
        }
      });
      if (targetLink) {
        targetLink.click();
        sendResponse({ ok: true, navigating: true });
      } else {
        sendResponse({ ok: false, error: 'لم يتم العثور على البلاغ في الجدول' });
      }
      return;
    }
  });

  // ── Init ──
  async function init() {
    console.log('[OrderExtractor] Init on:', window.location.href);
    await loadSettings();
    const href = window.location.href;
    const isOrdersListing = href.includes('/Orders') && !href.includes('id=');
    const isDetailPage = href.includes('id=') && (href.includes('/Reportdetail') || href.includes('/technicalreviewdetails') || href.includes('/workorderreview'));

    console.log('[OrderExtractor] Listing:', isOrdersListing, 'Detail:', isDetailPage);

    if (isOrdersListing) {
      injectPanel();
      await processReportQueueOnListing();
    } else if (isDetailPage) {
      await handleDetailPageAutoExtract();
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
