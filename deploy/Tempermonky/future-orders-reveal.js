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
  async function fetchFutureOrdersApi() {
    const threeDaysIso = getThreeDaysLaterIso();
    const thresholdMs = new Date(threeDaysIso).getTime();
    log(`جاري جلب البلاغات المحجوزة بعد تاريخ: ${threeDaysIso}`);

    // Filter: appointment date or scheduled service start date > 3 days from now
    // And statecode eq 0 (Active cases)
    const selectFields = [
      'incidentid',
      'ticketnumber',
      'title',
      'ldv_scheduledservicestartdate',
      'ldv_appointmentdate',
      'ldv_address',
      'ldv_mobilenumber',
      'ldv_sapordernumber',
      '_ldv_producttype_value',
      '_ldv_problem_value',
      '_ats_territories_value',
      '_customerid_value',
      'statuscode'
    ].join(',');

    const filter = `statecode eq 0 and (ldv_scheduledservicestartdate gt ${threeDaysIso} or ldv_appointmentdate gt ${threeDaysIso})`;
    const url = `/_api/incidents?$filter=${encodeURIComponent(filter)}&$select=${selectFields}&$orderby=ldv_scheduledservicestartdate asc`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`API returned HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const list = (data.value || []).filter(x => isFutureBeyond(x, thresholdMs));
      log(`تم جلب ${list.length} بلاغ مستقبلي بنجاح`, 'success');
      return list;
    } catch (e) {
      log(`فشل استعلام البلاغات المستقبلية: ${e.message}`, 'error');
      // Fallback query without appointment date in filter in case of schema difference
      try {
        const fallbackFilter = `statecode eq 0 and ldv_scheduledservicestartdate gt ${threeDaysIso}`;
        const fallbackUrl = `/_api/incidents?$filter=${encodeURIComponent(fallbackFilter)}&$select=${selectFields}&$orderby=ldv_scheduledservicestartdate asc`;
        const resp2 = await fetch(fallbackUrl);
        if (resp2.ok) {
          const data2 = await resp2.json();
          return (data2.value || []).filter(x => isFutureBeyond(x, thresholdMs));
        }
      } catch (err2) {
        log(`فشل الاستعلام الاحتياطي: ${err2.message}`, 'error');
      }
      return [];
    }
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
  function injectOrdersIntoTable(orders) {
    const table = document.querySelector('.entity-grid table, table.table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Remove any previously injected future rows
    document.querySelectorAll(`.${ROW_CLASS}`).forEach(r => r.remove());

    if (!orders || !orders.length) return;

    // Check existing CAS to avoid duplicates
    const existingCas = new Set();
    tbody.querySelectorAll('tr').forEach(r => {
      const txt = r.textContent || '';
      const m = txt.match(/CAS\d+/);
      if (m) existingCas.add(m[0]);
    });

    let injectedCount = 0;

    orders.forEach(o => {
      if (existingCas.has(o.ticketnumber)) return;

      const row = document.createElement('tr');
      row.className = ROW_CLASS;
      row.setAttribute('data-id', o.incidentid);
      row.setAttribute('data-name', o.ticketnumber);
      row.setAttribute('data-future-order', 'true');

      const dateStr = formatDateDisplay(o.ldv_scheduledservicestartdate || o.ldv_appointmentdate);
      const product = o['_ldv_producttype_value@OData.Community.Display.V1.FormattedValue'] || 'غير محدد';
      const complaint = o['_ldv_problem_value@OData.Community.Display.V1.FormattedValue'] || 'صيانة';
      const customer = o['_customerid_value@OData.Community.Display.V1.FormattedValue'] || o.title || '';
      const address = o.ldv_address || '';
      const sap = o.ldv_sapordernumber || '';
      const area = o['_ats_territories_value@OData.Community.Display.V1.FormattedValue'] || '';

      const reviewUrl = `https://elarabyportalpfs.powerappsportals.com/workorderreview/?id=${o.incidentid}`;

      // Build row cells mimicking portal structure
      row.innerHTML = `
        <td data-th="رقم الطلب">
          <a href="${reviewUrl}" target="_blank" style="font-weight:bold;color:#0284c7;text-decoration:none;">
            ${o.ticketnumber}
          </a>
          <span class="ea-future-badge" title="بلاغ مستقبلي محجوز بعد أكثر من 3 أيام">
            📅 مستقبلي
          </span>
        </td>
        <td data-th="اسم العميل">${customer}</td>
        <td data-th="رقم العقار">0</td>
        <td data-th="العنوان" title="${address}">${address}</td>
        <td data-th="نوع المنتج">${product}</td>
        <td data-th="شكوى العميل">${complaint}</td>
        <td data-th="تاريخ الحجز" style="font-weight:bold;color:#b45309;">
          ${dateStr} ⏳
        </td>
        <td data-th="نوع الخدمة">صيانة</td>
        <td data-th="يوجد شكوى">لا</td>
        <td data-th="SAPرقم ال">${sap}</td>
        <td data-th="جهة البلاغ">${area}</td>
        <td data-th="الفنى المسؤول">متنقلة</td>
      `;

      tbody.appendChild(row);
      injectedCount++;
    });

    log(`تم دمج ${injectedCount} بلاغ مستقبلي في جدول الصفحة بنجاح`, 'success');
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
  function renderPanelList(orders) {
    const listEl = document.getElementById('ea-fo-list');
    const countEl = document.getElementById('ea-fo-count');
    if (countEl) countEl.textContent = orders.length;

    if (!listEl) return;
    if (!orders.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;">لا توجد بلاغات محجوزة بعد أكثر من 3 أيام حالياً.</div>';
      return;
    }

    listEl.innerHTML = orders.map(o => {
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
      log(e.message, 'error');
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
  function init() {
    injectStyles();
    buildPanel();

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
