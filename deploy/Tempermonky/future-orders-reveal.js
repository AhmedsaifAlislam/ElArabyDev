// ==UserScript==
// @name         كشف البلاغات المستقبلية - بوابة العربي
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  يكشف البلاغات المحجوزة بعد أكثر من 3 أيام عبر Dataverse Web API ويدمجها في جدول أوامر الشغل مع تمييز وأيقونة
// @author       Zain (ElArabyDev)
// @match        *://elarabyportalpfs.powerappsportals.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_ID = 'future-orders-reveal';
  const PANEL_ID = 'ea-future-orders-panel';
  const ROW_CLASS = 'ea-future-order-row';

  // State
  let isRunning = false;
  let futureOrders = [];
  let isFetching = false;
  // آخر نتيجة تشخيصية — تُعرض في اللوحة بدل الصمت
  let lastProbeError = '';
  let lastProbeShape = '';

  // Helpers
  function log(msg, type = 'info') {
    const symbol = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[FutureOrders] ${symbol} ${msg}`);
  }

  function getTodayIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function getThreeDaysLaterIso() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  // «مستقبلي» فعلاً = التاريخ الفعلي (المجدول وإلا الموعد) بعد الحد (S5).
  // يمنع إدراج بلاغ مجدول اليوم لمجرد أن حقل «موعد» آخر بعيد.
  function isFutureBeyond(item, thresholdMs) {
    const eff = item.ldv_scheduledservicestartdate || item.ldv_appointmentdate;
    if (!eff) return false;
    const ms = new Date(eff).getTime();
    return !isNaN(ms) && ms > thresholdMs;
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return 'غير محدد';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  }

  // ── Fetch Future Orders from Dataverse Web API ──
  // ملاحظة مهمة (سبب العطل السابق): كان الاستعلام يطلب حقولًا غير مؤكدة
  // (ldv_appointmentdate / _ats_territories_value). حقل واحد خاطئ في $select
  // يجعل Dataverse يرفض الاستعلام كله بـ 400 — والاستعلام الاحتياطي كان يستخدم
  // نفس الـ $select فيفشل أيضًا => قائمة فاضية دائمًا.
  // الحل: سلّم استعلامات من الأضيق للأوسع + عرض رسالة الخطأ الحقيقية + حفظ الشكل الناجح.
  const PROBE_KEY = 'ea_future_orders_shape';
  const PROBE_ORDER = ['full', 'safe', 'scheduled', 'active', 'raw'];

  function readProbeShape() {
    try { return localStorage.getItem(PROBE_KEY) || ''; } catch (_) { return ''; }
  }

  function saveProbeShape(shape) {
    try { localStorage.setItem(PROBE_KEY, shape); } catch (_) {}
  }

  function buildQuery(shape, iso) {
    const base = [
      'incidentid', 'ticketnumber', 'title', 'statuscode',
      'ldv_scheduledservicestartdate', 'ldv_address', 'ldv_mobilenumber', 'ldv_referencecontact',
      'ldv_sapordernumber', '_customerid_value'
    ];
    let select = base.slice();
    let filter = '';
    let orderby = 'ldv_scheduledservicestartdate asc';
    let top = 100;

    if (shape === 'full') {
      select.push('ldv_appointmentdate', '_ldv_producttype_value', '_ldv_problem_value', '_ats_territories_value');
      filter = `statecode eq 0 and (ldv_scheduledservicestartdate gt ${iso} or ldv_appointmentdate gt ${iso})`;
    } else if (shape === 'safe') {
      select.push('_ldv_producttype_value', '_ldv_problem_value');
      filter = `statecode eq 0 and ldv_scheduledservicestartdate gt ${iso}`;
    } else if (shape === 'scheduled') {
      select = ['incidentid', 'ticketnumber', 'ldv_scheduledservicestartdate'];
      filter = `statecode eq 0 and ldv_scheduledservicestartdate gt ${iso}`;
    } else if (shape === 'active') {
      select = ['incidentid', 'ticketnumber', 'ldv_scheduledservicestartdate', 'createdon', 'statuscode'];
      filter = 'statecode eq 0';
      orderby = 'createdon desc';
      top = 200;
    } else { // raw — بدون أي فلتر، ثم فلترة محلية
      select = ['incidentid', 'ticketnumber', 'ldv_scheduledservicestartdate', 'createdon', 'statuscode'];
      orderby = 'createdon desc';
      top = 100;
    }

    let url = `/_api/incidents?$top=${top}&$select=${select.join(',')}&$orderby=${encodeURIComponent(orderby)}`;
    if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
    return url;
  }

  async function fetchJson(url) {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        // بدونه لا ترجع Dataverse الحقول المنسّقة (اسم العميل/المنتج/الشكوى)
        'Prefer': 'odata.include-annotations="*"'
      },
      credentials: 'same-origin'
    });
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    return { ok: resp.ok, status: resp.status, data, text };
  }

  function apiErrorMessage(r) {
    const d = r && r.data;
    const msg = (d && d.error && (d.error.message || d.error.code)) ||
      (r && r.text ? String(r.text).replace(/\s+/g, ' ').slice(0, 180) : '');
    return `HTTP ${r ? r.status : '?'}${msg ? ' — ' + msg : ''}`;
  }

  // يجمع الصفحات عبر @odata.nextLink (البوابة تحدّ حجم الصفحة)
  async function fetchShape(shape, iso, maxPages = 4) {
    let url = buildQuery(shape, iso);
    const items = [];
    let pages = 0;
    let last = null;
    while (url && pages < maxPages) {
      const r = await fetchJson(url);
      last = r;
      if (!r.ok) return { ok: false, error: apiErrorMessage(r), items: [] };
      const rows = (r.data && r.data.value) || [];
      for (const row of rows) items.push(row);
      url = (r.data && r.data['@odata.nextLink']) || '';
      pages++;
      if (!rows.length) break;
    }
    return { ok: true, items, status: last ? last.status : 0 };
  }

  async function fetchFutureOrdersApi() {
    const iso = getThreeDaysLaterIso();
    const thresholdMs = new Date(iso).getTime();
    const cached = readProbeShape();
    const order = cached && PROBE_ORDER.indexOf(cached) !== -1
      ? [cached].concat(PROBE_ORDER.filter(s => s !== cached))
      : PROBE_ORDER.slice();
    lastProbeError = '';
    lastProbeShape = '';
    let firstError = '';

    log(`جاري جلب البلاغات المستقبلية بعد: ${iso}`);

    for (const shape of order) {
      let res;
      try {
        res = await fetchShape(shape, iso);
      } catch (e) {
        res = { ok: false, error: 'شبكة: ' + (e && e.message ? e.message : e), items: [] };
      }

      if (!res.ok) {
        log(`الشكل «${shape}» فشل: ${res.error}`, 'error');
        if (!firstError) firstError = `${shape} → ${res.error}`;
        continue;
      }

      const list = (res.items || []).filter(x => isFutureBeyond(x, thresholdMs));
      log(`«${shape}» نجح: ${list.length} مستقبلي من ${res.items.length} صف`, 'success');

      if (shape !== cached) saveProbeShape(shape);
      lastProbeShape = shape;

      // لو في نتائج خلاص — رجّعها. لو مفيش، جرّب الشكل الأوسع اللي بعده
      // لنتأكد إن «صفر» ده حقيقي مش بسبب فلتر ضيّق.
      if (list.length) return list;
      if (shape === 'raw') return [];
    }

    lastProbeError = firstError || 'لم ينجح أي استعلام';
    log('فشلت كل أشكال الاستعلام: ' + lastProbeError, 'error');
    return [];
  }

  // ── Inject Styles ──
  function injectStyles() {
    if (document.getElementById('ea-future-orders-styles')) return;
    const style = document.createElement('style');
    style.id = 'ea-future-orders-styles';
    style.textContent = `
      .${ROW_CLASS} {
        background-color: #f0f7ff !important;
        border-right: 4px solid #0284c7 !important;
        transition: background-color 0.2s ease;
      }
      .${ROW_CLASS}:hover {
        background-color: #e0f2fe !important;
      }
      .ea-future-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: linear-gradient(135deg, #0284c7, #0369a1);
        color: #ffffff !important;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 12px;
        margin-right: 4px;
        box-shadow: 0 1px 3px rgba(2, 132, 199, 0.3);
        vertical-align: middle;
      }
      .ea-future-badge svg {
        width: 11px;
        height: 11px;
        fill: currentColor;
      }
      #${PANEL_ID} {
        position: fixed;
        bottom: 80px;
        left: 20px;
        width: 320px;
        background: #111827;
        color: #f3f4f6;
        border: 1px solid #1f2937;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        z-index: 999999;
        direction: rtl;
        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
        font-size: 12px;
        overflow: hidden;
        display: none;
      }
      #${PANEL_ID}.visible {
        display: block;
      }
      .ea-fo-header {
        background: linear-gradient(135deg, #0284c7, #0369a1);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 700;
      }
      .ea-fo-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
      }
      .ea-fo-body {
        padding: 12px;
        max-height: 380px;
        overflow-y: auto;
      }
      .ea-fo-stat {
        background: #1f2937;
        padding: 8px 10px;
        border-radius: 8px;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ea-fo-item {
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .ea-fo-item:hover {
        border-color: #38bdf8;
      }
      .ea-fo-item-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .ea-fo-item-cas {
        font-weight: 700;
        color: #38bdf8;
      }
      .ea-fo-item-date {
        color: #fbbf24;
        font-size: 11px;
      }
      .ea-fo-item-desc {
        color: #9ca3af;
        font-size: 11px;
        line-height: 1.4;
      }
      .ea-fo-btn {
        width: 100%;
        background: #0284c7;
        color: #fff;
        border: none;
        padding: 8px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 6px;
      }
      .ea-fo-btn:hover {
        background: #0369a1;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Render Orders into Page Table ──
  // الجدول ممكن يكون في الصفحة نفسها أو جوّه iframe — الـ extractor نفسه بيدوّر
  // جوّه iframes، ولذلك المحدد القديم ('.entity-grid table') كان يفشل بصمت.
  const GRID_SELECTORS = [
    '#grid_openorders',
    '.entity-grid table',
    'table.entity-grid',
    '.entitylist table',
    'table[class*="entitylist"]',
    '.grid-content table',
    'table[role="grid"]',
    'table.table'
  ];

  function candidateDocs() {
    const docs = [document];
    try {
      document.querySelectorAll('iframe').forEach(f => {
        try {
          const d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
          if (d) docs.push(d);
        } catch (_) {}
      });
    } catch (_) {}
    return docs;
  }

  function findOrdersTable() {
    const docs = candidateDocs();
    for (const d of docs) {
      for (const sel of GRID_SELECTORS) {
        try {
          const t = d.querySelector(sel);
          if (t && t.querySelector('th')) return { table: t, doc: d };
        } catch (_) {}
      }
    }
    // احتياطي: أول جدول ظاهر فيه صف رؤوس
    for (const d of docs) {
      let tables = [];
      try { tables = Array.from(d.querySelectorAll('table')); } catch (_) {}
      for (const t of tables) {
        try {
          if (t.offsetParent !== null && t.querySelector('th')) return { table: t, doc: d };
        } catch (_) {}
      }
    }
    return null;
  }

  function headerTexts(table) {
    try {
      return Array.from(table.querySelectorAll('thead th')).map(th => (th.innerText || '').trim());
    } catch (_) { return []; }
  }

  // null = خلية «رقم الطلب» الخاصة (رابط + شارة)
  function cellValueForHeader(h, v) {
    const t = String(h || '').replace(/\s+/g, ' ').trim();
    const has = (...k) => k.some(x => t.indexOf(x) !== -1);
    if (has('يوجد')) return 'لا';
    if (has('شكوى', 'Complaint')) return v.complaint;
    if (has('طلب', 'Order', 'CAS')) return null;
    if (has('عميل', 'Customer')) return v.customer;
    if (has('عقار', 'Building')) return '0';
    if (has('عنوان', 'Address')) return v.address;
    if (has('منتج', 'Product')) return v.product;
    if (has('تاريخ', 'Date')) return v.dateStr;
    if (has('خدمة', 'Service')) return 'صيانة';
    if (has('SAP', 'sap')) return v.sap;
    if (has('جهة', 'منطقة', 'Area')) return v.area;
    if (has('فن', 'Tech')) return 'متنقلة';
    return '';
  }

  function buildFutureRow(doc, o, headers) {
    const row = doc.createElement('tr');
    row.className = ROW_CLASS;
    row.setAttribute('data-id', o.incidentid || '');
    row.setAttribute('data-name', o.ticketnumber || '');
    row.setAttribute('data-future-order', 'true');

    const v = {
      dateStr: formatDateDisplay(o.ldv_scheduledservicestartdate || o.ldv_appointmentdate),
      product: o['_ldv_producttype_value@OData.Community.Display.V1.FormattedValue'] || 'غير محدد',
      complaint: o['_ldv_problem_value@OData.Community.Display.V1.FormattedValue'] || 'صيانة',
      customer: o['_customerid_value@OData.Community.Display.V1.FormattedValue'] || o.title || '',
      address: o.ldv_address || '',
      sap: o.ldv_sapordernumber || '',
      area: o['_ats_territories_value@OData.Community.Display.V1.FormattedValue'] || ''
    };

    const reviewUrl = `https://elarabyportalpfs.powerappsportals.com/workorderreview/?id=${o.incidentid}`;
    const orderCell = `<a href="${reviewUrl}" target="_blank" style="font-weight:bold;color:#0284c7;text-decoration:none;">${o.ticketnumber || ''}</a>` +
      `<span class="ea-future-badge" title="بلاغ مستقبلي محجوز بعد أكثر من 3 أيام">📅 مستقبلي</span>`;

    // لو الجدول فيه رؤوس: نبني خلية لكل عمود فعلي (يرفع مشكلة اختلاف ترتيب الأعمدة)
    if (headers && headers.length) {
      headers.forEach(h => {
        const td = doc.createElement('td');
        const val = cellValueForHeader(h, v);
        if (val === null) td.innerHTML = orderCell;
        else td.textContent = val;
        row.appendChild(td);
      });
      return row;
    }

    // لا رؤوس؟ الشكل الثابت القديم (12 عمود)
    row.innerHTML = `
      <td data-th="رقم الطلب">${orderCell}</td>
      <td data-th="اسم العميل">${v.customer}</td>
      <td data-th="رقم العقار">0</td>
      <td data-th="العنوان" title="${v.address}">${v.address}</td>
      <td data-th="نوع المنتج">${v.product}</td>
      <td data-th="شكوى العميل">${v.complaint}</td>
      <td data-th="تاريخ الحجز" style="font-weight:bold;color:#b45309;">${v.dateStr} ⏳</td>
      <td data-th="نوع الخدمة">صيانة</td>
      <td data-th="يوجد شكوى">لا</td>
      <td data-th="SAPرقم ال">${v.sap}</td>
      <td data-th="جهة البلاغ">${v.area}</td>
      <td data-th="الفنى المسؤول">متنقلة</td>
    `;
    return row;
  }

  function injectOrdersIntoTable(orders) {
    const found = findOrdersTable();
    if (!found) {
      log('لم يتم العثور على جدول البلاغات — البيانات ظاهرة في اللوحة فقط', 'error');
      return;
    }

    const table = found.table;
    const doc = found.doc;
    const tbody = (table.tBodies && table.tBodies[0]) || table.querySelector('tbody');
    if (!tbody) return;

    // إزالة أي صفوف مستقبلية قديمة
    try { doc.querySelectorAll('.' + ROW_CLASS).forEach(r => r.remove()); } catch (_) {}
    try { document.querySelectorAll('.' + ROW_CLASS).forEach(r => r.remove()); } catch (_) {}

    if (!orders || !orders.length) return;

    const headers = headerTexts(table);

    // منع التكرار مع الصفوف الموجودة أصلًا
    const existingCas = new Set();
    tbody.querySelectorAll('tr').forEach(r => {
      const m = (r.textContent || '').match(/CAS\d+/);
      if (m) existingCas.add(m[0]);
    });

    let injectedCount = 0;
    orders.forEach(o => {
      if (!o || !o.ticketnumber || existingCas.has(o.ticketnumber)) return;
      existingCas.add(o.ticketnumber);
      tbody.appendChild(buildFutureRow(doc, o, headers));
      injectedCount++;
    });

    log(`تم دمج ${injectedCount} بلاغ مستقبلي في جدول الصفحة`, 'success');
  }

  // ── Build Floating Panel UI ──
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ea-fo-header">
        <span>📅 البلاغات المستقبلية (+3 أيام)</span>
        <button class="ea-fo-close" id="ea-fo-close-btn">✕</button>
      </div>
      <div class="ea-fo-body">
        <div class="ea-fo-stat">
          <span>البلاغات المكتشفة:</span>
          <b id="ea-fo-count" style="color:#38bdf8;font-size:14px;">0</b>
        </div>
        <div id="ea-fo-list">
          <div style="text-align:center;padding:20px;color:#9ca3af;">اضغط فحص لبدء البحث...</div>
        </div>
        <button class="ea-fo-btn" id="ea-fo-refresh-btn">🔄 فحص وتحديث الآن</button>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('ea-fo-close-btn')?.addEventListener('click', () => {
      panel.classList.remove('visible');
    });

    document.getElementById('ea-fo-refresh-btn')?.addEventListener('click', runDiscovery);
  }

  // ── Render list inside Panel ──
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function diagnosticHtml() {
    if (lastProbeError) {
      return `<div style="background:#7f1d1d;color:#fecaca;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;line-height:1.5;">
        ⚠️ فشل الاستعلام: ${escHtml(lastProbeError)}
      </div>`;
    }
    if (lastProbeShape) {
      return `<div style="color:#64748b;font-size:10px;margin-bottom:6px;">الشكل المستخدم: ${escHtml(lastProbeShape)}</div>`;
    }
    return '';
  }

  function renderPanelList(orders) {
    const listEl = document.getElementById('ea-fo-list');
    const countEl = document.getElementById('ea-fo-count');
    if (countEl) countEl.textContent = orders.length;

    if (!listEl) return;
    const diag = diagnosticHtml();
    if (!orders.length) {
      listEl.innerHTML = diag + '<div style="text-align:center;padding:20px;color:#9ca3af;">لا توجد بلاغات محجوزة بعد أكثر من 3 أيام حالياً.</div>';
      return;
    }

    listEl.innerHTML = diag + orders.map(o => {
      const dateStr = formatDateDisplay(o.ldv_scheduledservicestartdate || o.ldv_appointmentdate);
      const product = o['_ldv_producttype_value@OData.Community.Display.V1.FormattedValue'] || 'منتج غير محدد';
      const cust = o['_customerid_value@OData.Community.Display.V1.FormattedValue'] || o.title || '';
      const url = `https://elarabyportalpfs.powerappsportals.com/workorderreview/?id=${o.incidentid}`;

      return `
        <div class="ea-fo-item" onclick="window.open('${url}', '_blank')">
          <div class="ea-fo-item-top">
            <span class="ea-fo-item-cas">${o.ticketnumber}</span>
            <span class="ea-fo-item-date">📅 ${dateStr}</span>
          </div>
          <div class="ea-fo-item-desc">
            <div><b>${cust}</b></div>
            <div>${product}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Main Discovery Execution ──
  async function runDiscovery() {
    if (isFetching) return;
    isFetching = true;

    const listEl = document.getElementById('ea-fo-list');
    if (listEl) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#38bdf8;">⏳ جاري فحص Dataverse Web API...</div>';
    }

    try {
      futureOrders = await fetchFutureOrdersApi();
      renderPanelList(futureOrders);
      injectOrdersIntoTable(futureOrders);
    } catch (e) {
      lastProbeError = (e && e.message) ? e.message : String(e);
      log(lastProbeError, 'error');
      renderPanelList(futureOrders || []);
    } finally {
      isFetching = false;
    }
  }

  // ── Public Toggle / Trigger ──
  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible') && (!futureOrders || !futureOrders.length)) {
      runDiscovery();
    }
  }

  // ── Init ──
  let _inited = false;

  function init() {
    if (_inited) return;
    _inited = true;

    injectStyles();
    buildPanel();

    // فتح الأداة من الفاب (الكنترولر في world منفصل) يرسل حدث DOM — لأن
    // window.__eaFutureOrders غير مرئي من الـ world المعزول.
    document.addEventListener('ea-future-orders-refresh', () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.classList.add('visible');
      runDiscovery();
    });

    // Auto-discover once on page load if on orders page
    if (location.href.includes('/Orders/')) {
      runDiscovery();
    }

    // Expose globally for Fabs Controller and Tampermonkey Runner
    window.__eaFutureOrders = {
      toggle: togglePanel,
      refresh: runDiscovery,
      getOrders: () => futureOrders
    };

    log('تم تحميل أداة كشف البلاغات المستقبلية بنجاح', 'success');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
