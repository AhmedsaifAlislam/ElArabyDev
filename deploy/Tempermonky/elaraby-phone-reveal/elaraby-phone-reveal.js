// ==UserScript==
// @name         كشف أرقام الهواتف - بوابة العربي (v15)
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  يكشف أرقام الهواتف المخفية في جدول البلاغات ويرفعها لـ Google Sheets
// @match        *://elarabyportalpfs.powerappsportals.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// =====================================================================
// 🟢 Layer 0: Force Reveal
// =====================================================================
(function() {
    try {
        const forceScript = document.createElement('script');
        forceScript.textContent = `
            let _crmAccount = null;
            Object.defineProperty(window, 'crmAccount', {
                get: function() { return _crmAccount; },
                set: function(val) {
                    if (val && typeof val === 'object') {
                        val.hideCustomersPhones = false;
                        console.log('🤖 تم إجبار hideCustomersPhones = false');
                    }
                    _crmAccount = val;
                },
                configurable: true
            });
        `;
        document.documentElement.appendChild(forceScript);
    } catch(e) {}
})();

// =====================================================================
// 🟢 الرئيسي
// =====================================================================
(function () {
  'use strict';

  document.addEventListener("DOMContentLoaded", initSmartAssistant);

  function initSmartAssistant() {
      if (window.__ELARABY_INTERVAL) clearInterval(window.__ELARABY_INTERVAL);
      ['elaraby-fixed-box', 'elaraby-mini-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });

      // =====================================================================
      // 🟢 Cache Layer - تخزين مؤقت للـ localStorage
      // =====================================================================
      const DIR_CACHE = {
        _data: null,
        get() {
          if (this._data === null) {
            try { this._data = JSON.parse(localStorage.getItem('elaraby_phone_directory') || '{}'); } catch { this._data = {}; }
          }
          return this._data;
        },
        save() {
          try { localStorage.setItem('elaraby_phone_directory', JSON.stringify(this._data)); } catch {}
        },
        add(name, phone, phone2, sap) {
          if (!name || name === 'غير محدد' || name.includes('متابع') || (!phone && !phone2 && !sap)) return;
          const db = this.get();
          let c = db[name] || { name, phones: [], sap: [], lastUpdated: 0 };
          let changed = false;
          [phone, phone2].forEach(p => { if (p && p.length >= 10 && !c.phones.includes(p)) { c.phones.push(p); changed = true; } });
          if (sap && !c.sap.includes(sap)) { c.sap.push(sap); changed = true; }
          if (changed) { c.lastUpdated = Date.now(); db[name] = c; this.save(); }
        },
        findPhones(name) {
          if (!name || name === 'غير محدد') return [];
          return this.get()[name]?.phones || [];
        },
        findSap(name) {
          if (!name || name === 'غير محدد') return [];
          return this.get()[name]?.sap || [];
        },
        clear() { this._data = {}; this.save(); }
      };

      const SYNC_CACHE = {
        _data: null,
        get() {
          if (this._data === null) {
            try { this._data = JSON.parse(localStorage.getItem('elaraby_sync_register') || '{}'); } catch { this._data = {}; }
          }
          return this._data;
        },
        save() {
          try { localStorage.setItem('elaraby_sync_register', JSON.stringify(this._data)); } catch {}
        },
        isSynced(row) {
          if (!row.orderNo) return true;
          if (!row.phone && !row.phone2 && !row.sap) return true;
          const hash = `${row.name}|${row.phone}|${row.phone2}|${row.sap}|${row.address}`;
          return this.get()[row.orderNo] === hash;
        },
        markSynced(row) {
          if (!row.orderNo) return;
          const hash = `${row.name}|${row.phone}|${row.phone2}|${row.sap}|${row.address}`;
          this.get()[row.orderNo] = hash;
          this.save();
        },
        getCount() { return Object.keys(this.get()).length; }
      };

      // =====================================================================
      // 🟢 State - الحالة الرئيسية مع Map للأداء
      // =====================================================================
      const state = {
        rows: new Map(),       // Map<orderNo, rowData> بدل Array
        logs: [],
        activeTab: 'data',
        searchQuery: '',
        dirSearchQuery: '',
        isMinimized: true,
        scrapedPages: new Set([1]),
        totalPages: 1,
        isScraping: false,
        isFetchingMissing: false,
        isAutoPilot: false,
        autoPilotTimer: null,
        isLoading: false,
        lastSearch: '',
        isDarkMode: localStorage.getItem('elaraby_dark_mode') === 'true',
        virtualScrollTop: 0,
        virtualRowHeight: 85,
        notificationsEnabled: Notification.permission === 'granted',
        prevRowsCount: 0
      };

      // =====================================================================
      // 🟢 Log Function
      // =====================================================================
      function log(msg, type = 'info', icon = 'ℹ️') {
        const entry = { msg, type, icon, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
        state.logs.unshift(entry);
        if (state.logs.length > 100) state.logs.length = 100;
        if (type === 'error') console.error(`[v14] ${icon} ${msg}`);
        else if (type === 'success') console.log(`[v14] ${icon} ${msg}`);
      }

      // =====================================================================
      // 🟢 Google Sheets Sync
      // =====================================================================
      const GOOGLE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwlDrxzd2u4RjpZNg1EOecVwNcmip3nwe75hJIMrrPmaBnnwIZh4knxxpVUwS3V0Ui-jA/exec';

      async function syncRowToGoogle(row, force = false) {
        if (!force && SYNC_CACHE.isSynced(row)) return false;
        try {
          await fetch(GOOGLE_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderNo: row.orderNo || "",
              name: row.name || "",
              phone: row.phone || "",
              phone2: row.phone2 || "",
              sap: row.sap || "",
              address: row.address || "",
              type: row.type || "",
              service: row.service || "",
              date: row.date || ""
            })
          });
          SYNC_CACHE.markSynced(row);
          log(`☁️ تم حفظ ${row.orderNo} في جوجل شيت`, 'success', '☁️');
          updateUI(false);
          return true;
        } catch (e) {
          log(`❌ فشل الاتصال بجوجل شيت: ${row.orderNo}`, 'error', '☁️');
          return false;
        }
      }

      // =====================================================================
      // 🟢 Regex Patterns - مُعرفة مسبقاً
      // =====================================================================
      const REGEX = {
        PHONE: /01[0-9]{9}/g,
        SAP: /\b7[0-9]{7,9}\b/g,
        CAS: /CAS\d+/
      };

      // =====================================================================
      // 🟢 Layer 1: DOM Table Read
      // =====================================================================
      let COL = { CAS: 0, NAME: 1, PHONE: -1, PHONE2: -1, SAP: -1, ADDRESS: -1, TYPE: -1, DATE: -1, SERVICE: -1 };

      function detectColumns() {
          const headers = Array.from(document.querySelectorAll('table th')).map(th => th.textContent.trim());
          if (headers.length === 0) {
              const roleHeaders = Array.from(document.querySelectorAll('[role="columnheader"]')).map(th => th.textContent.trim());
              if (roleHeaders.length > 0) headers.push(...roleHeaders);
          }
          if (headers.length === 0) return false;
          headers.forEach((h, i) => {
              if (h.includes('طلب') || h.includes('CAS')) COL.CAS = i;
              else if (h === 'العميل' || h === 'اسم العميل') COL.NAME = i;
              else if (h.includes('موبايل') || h.includes('هاتف') || h.includes('Mobile')) {
                  if (COL.PHONE === -1) COL.PHONE = i; else COL.PHONE2 = i;
              }
              else if (h.includes('صلة') || h.includes('بديل')) COL.PHONE2 = i;
              else if (h.includes('SAP') || h.includes('ساب')) COL.SAP = i;
              else if (h.includes('عنوان') || h === 'العنوان' || h.toLowerCase().includes('address')) COL.ADDRESS = i;
              else if (h.includes('نوع المنتج')) COL.TYPE = i;
              else if (h.includes('تاريخ')) COL.DATE = i;
              else if (h.includes('خدمة')) COL.SERVICE = i;
          });
          return true;
      }

      function extractRow(tr, pageNum) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < 4) return null;
        const get = (i) => (i >= 0 && tds[i] ? tds[i].textContent.trim().replace(/\s+/g, ' ') : '');

        const casMatch = tr.textContent.match(REGEX.CAS);
        if (!casMatch) return null;
        const casNo = casMatch[0];

        let name = COL.NAME >= 0 ? get(COL.NAME) : 'غير محدد';
        if (name === '' || name.includes('متابع')) name = 'غير محدد';

        let phone = COL.PHONE >= 0 ? get(COL.PHONE).match(REGEX.PHONE)?.[0] || '' : '';
        let phone2 = COL.PHONE2 >= 0 ? get(COL.PHONE2).match(REGEX.PHONE)?.[0] || '' : '';
        let sap = COL.SAP >= 0 ? get(COL.SAP).match(REGEX.SAP)?.[0] || '' : '';
        let address = COL.ADDRESS >= 0 ? get(COL.ADDRESS) : '';

        if (!phone) {
            const allPhones = tr.textContent.match(REGEX.PHONE) || [];
            if (allPhones.length > 0) phone = allPhones[0];
            if (allPhones.length > 1) phone2 = allPhones[1];
        }
        if (!sap) sap = tr.textContent.match(REGEX.SAP)?.[0] || '';

        if (!phone && name !== 'غير محدد') {
            const memPhones = DIR_CACHE.findPhones(name);
            if (memPhones.length > 0) phone = memPhones[0];
            if (memPhones.length > 1) phone2 = memPhones[1];
        }
        if (!sap && name !== 'غير محدد') {
            const memSap = DIR_CACHE.findSap(name);
            if (memSap.length > 0) sap = memSap[0];
        }

        return {
            orderNo: casNo, name, phone, phone2, sap, address,
            type: COL.TYPE >= 0 ? get(COL.TYPE) : '',
            date: COL.DATE >= 0 ? get(COL.DATE) : '',
            service: COL.SERVICE >= 0 ? get(COL.SERVICE) : '',
            pageNum, fetchAttempted: false
        };
      }

      function extractFromDOM() {
        if (!detectColumns()) return false;
        const rows = document.querySelectorAll('table tbody tr');
        if (rows.length === 0) return false;

        let changed = false;
        rows.forEach(tr => {
          const data = extractRow(tr, 1);
          if (!data) return;

          const existing = state.rows.get(data.orderNo);
          if (!existing) {
            state.rows.set(data.orderNo, data);
            if (data.phone || data.phone2) log(`✅ [جدول] ${data.orderNo} | ${data.name} | ${data.phone}`, 'success', '📱');
            DIR_CACHE.add(data.name, data.phone, data.phone2, data.sap);
            syncRowToGoogle(data);
            changed = true;
          } else {
            let updated = false;
            if (!existing.phone && data.phone) { existing.phone = data.phone; updated = true; }
            if (!existing.phone2 && data.phone2) { existing.phone2 = data.phone2; updated = true; }
            if (!existing.sap && data.sap) { existing.sap = data.sap; updated = true; }
            if (existing.name === 'غير محدد' && data.name !== 'غير محدد') { existing.name = data.name; updated = true; }
            if (!existing.address && data.address) { existing.address = data.address; updated = true; }
            if (updated) {
              DIR_CACHE.add(existing.name, existing.phone, existing.phone2, existing.sap);
              syncRowToGoogle(existing);
              changed = true;
            }
          }
        });
        const pageLinks = document.querySelectorAll('.pagination li a, .pager li a, ul.pagination li a');
        let maxPage = 1;
        pageLinks.forEach(a => {
          const n = parseInt(a.textContent.trim());
          if (!isNaN(n) && n > maxPage) maxPage = n;
        });
        if (maxPage > state.totalPages) { state.totalPages = maxPage; changed = true; }

        if (changed) {
          log(`تم التحديث: ${rows.length} بلاغ | إجمالي: ${state.rows.size}`, 'info', '🔎');
          updateUI(false);
        }
        processLayer3();
        return changed;
      }

      // =====================================================================
      // 🟢 Layer 3: API Fetch - Batch Control
      // =====================================================================
      const BATCH_SIZE = 5;

      async function processLayer3() {
        if (state.isFetchingMissing) return;
        const missing = [...state.rows.values()].filter(r => !r.phone && !r.fetchAttempted && r.pageNum !== undefined);
        if (missing.length === 0) return;

        state.isFetchingMissing = true;
        state.isLoading = true;
        log(`Layer 3: جاري سحب ${missing.length} بلاغات...`, 'info', '⚡');
        updateUI(false);

        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
          const batch = missing.slice(i, i + BATCH_SIZE);
          const promises = batch.map(async (r) => {
            r.fetchAttempted = true;
            try {
              const res = await fetch(`/_api/incidents?$filter=ticketnumber eq '${r.orderNo}'`, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
              if (res.ok) {
                const data = await res.json();
                if (data?.value?.length > 0) {
                  const item = data.value[0];
                  const str = JSON.stringify(item);
                  const pMatch = str.match(REGEX.PHONE) || [];
                  const sMatch = str.match(REGEX.SAP) || [];
                  if (pMatch.length > 0) r.phone = pMatch[0];
                  if (pMatch.length > 1) r.phone2 = pMatch[1];
                  if (sMatch.length > 0) r.sap = sMatch[0];
                  if (!r.phone) {
                    const customerId = item._customerid_value;
                    const customerType = item['_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'];
                    if (customerId && customerType) {
                      const endpoint = customerType === 'account' ? 'accounts' : 'contacts';
                      const custRes = await fetch(`/_api/${endpoint}(${customerId})`, { headers: { 'Accept': 'application/json' } });
                      if (custRes.ok) {
                        const custData = await custRes.json();
                        const cStr = JSON.stringify(custData);
                        const cpMatch = cStr.match(REGEX.PHONE) || [];
                        const csMatch = cStr.match(REGEX.SAP) || [];
                        if (cpMatch.length > 0) r.phone = cpMatch[0];
                        if (csMatch.length > 0) r.sap = csMatch[0];
                      }
                    }
                  }
                  if (r.phone || r.sap) {
                    log(`✅ [API] ${r.orderNo} | ${r.phone}`, 'success', '🌐');
                    DIR_CACHE.add(r.name, r.phone, r.phone2, r.sap);
                    syncRowToGoogle(r);
                  }
                }
              }
            } catch(e) { r.fetchAttempted = false; }
          });
          await Promise.all(promises);
          updateUI(false);
        }

        state.isFetchingMissing = false;
        state.isLoading = false;
        updateUI(false);
      }

      // =====================================================================
      // 🟢 Layer 4: Deep Search
      // =====================================================================
      window.__ERP_DEEP_SEARCH = async function(e) {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (!query || query.length < 3) return;
            state.isLoading = true;
            log(`بحث عميق عن: ${query}`, 'info', '🌍');
            updateUI(false);

            const endpoints = ['incidents', 'msdyn_workorders', 'accounts'];
            for (const ep of endpoints) {
                try {
                    const res = await fetch(`/_api/${ep}?$top=250&$orderby=createdon desc`, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data?.value) {
                            data.value.forEach(item => {
                                const str = JSON.stringify(item);
                                if (str.toLowerCase().includes(query.toLowerCase())) {
                                    const casMatch = str.match(REGEX.CAS);
                                    const pMatch = str.match(REGEX.PHONE) || [];
                                    const sMatch = str.match(REGEX.SAP) || [];
                                    if (casMatch) {
                                        const casNo = casMatch[0];
                                        let existing = state.rows.get(casNo);
                                        if (!existing) {
                                            existing = { orderNo: casNo, name: 'مستخرج من البحث', phone: pMatch[0]||'', phone2: pMatch[1]||'', sap: sMatch[0]||'', address: '', type: '', date: '', service: '', fetchAttempted: true };
                                            state.rows.set(casNo, existing);
                                        } else {
                                            if (!existing.phone && pMatch[0]) existing.phone = pMatch[0];
                                            if (!existing.sap && sMatch[0]) existing.sap = sMatch[0];
                                        }
                                        DIR_CACHE.add(existing.name, existing.phone, existing.phone2, existing.sap);
                                        syncRowToGoogle(existing);
                                    }
                                }
                            });
                        }
                    }
                } catch(e) {}
            }
            state.isLoading = false;
            log('اكتمل البحث العميق!', 'success', '✨');
            updateUI(false);
        }
      };

      // =====================================================================
      // 🟢 Pagination Crawler
      // =====================================================================
      async function fetchAllPages() {
        if (state.isScraping) return;
        state.isScraping = true;
        state.isLoading = true;

        const toFetch = [];
        for (let p = 2; p <= state.totalPages; p++) {
          if (!state.scrapedPages.has(p)) toFetch.push(p);
        }
        if (toFetch.length === 0) { state.isScraping = false; state.isLoading = false; return; }
        log(`جلب ${toFetch.length} صفحات...`, 'info', '⚙️');

        for (const p of toFetch) {
          log(`جلب الصفحة ${p}...`, 'info', '⏳');
          let url = window.location.pathname + window.location.search;
          url = url.includes('page=') ? url.replace(/page=\d+/, `page=${p}`) : url + (url.includes('?') ? '&' : '?') + `page=${p}`;
          try {
            const html = await fetch(url, { credentials: 'same-origin' }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('table tbody tr').forEach(tr => {
              const data = extractRow(tr, p);
              if (data && !state.rows.has(data.orderNo)) {
                state.rows.set(data.orderNo, data);
                if (data.phone || data.phone2) log(`✅ [ص${p}] ${data.orderNo}`, 'success', '📱');
                DIR_CACHE.add(data.name, data.phone, data.phone2, data.sap);
                syncRowToGoogle(data);
              }
            });
            state.scrapedPages.add(p);
            updateUI(false);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 400));
        }
        state.isScraping = false;
        state.isLoading = false;
        log('اكتمل جلب الصفحات!', 'success', '🎉');
        processLayer3();
      }

      // =====================================================================
      // 🟢 Auto-Pilot
      // =====================================================================
      window.__ERP_TOGGLE_AUTOPILOT = () => {
        state.isAutoPilot = !state.isAutoPilot;
        if (state.isAutoPilot) {
          log('🤖 بدء التصفح التلقائي...', 'success', '🤖');
          runAutoPilotStep();
        } else {
          if (state.autoPilotTimer) clearTimeout(state.autoPilotTimer);
          log('🛑 تم إيقاف التصفح التلقائي.', 'info', '🛑');
        }
        updateUI(false);
      };

      function runAutoPilotStep() {
        if (!state.isAutoPilot) return;
        extractFromDOM();
        state.autoPilotTimer = setTimeout(() => {
          if (!state.isAutoPilot) return;
          const success = clickNextPage();
          if (success) {
            log('🤖 تم الانتقال', 'success', '➡️');
            runAutoPilotStep();
          } else {
            log('🤖 وصلنا لنهاية التقرير!', 'warning', '🏁');
            state.isAutoPilot = false;
            updateUI(false);
          }
        }, 3200);
      }

      function clickNextPage() {
        let nextBtn = document.querySelector('.pagination li.next a, .pagination a[aria-label="Next"], .pagination a[title="Next"], .pager li.next a');
        if (!nextBtn) {
          const links = Array.from(document.querySelectorAll('.pagination a, .pager a, ul.pagination li a'));
          nextBtn = links.find(a => a.textContent.includes('›') || a.textContent.toLowerCase().includes('next') || a.textContent.includes('التالي'));
        }
        if (!nextBtn) {
          const activeLi = document.querySelector('.pagination li.active, .pager li.active, ul.pagination li.active');
          if (activeLi) {
            const activePageNum = parseInt(activeLi.textContent.trim());
            if (!isNaN(activePageNum)) {
              const links = Array.from(document.querySelectorAll('.pagination a, .pager a, ul.pagination li a'));
              nextBtn = links.find(a => parseInt(a.textContent.trim()) === activePageNum + 1);
            }
          }
        }
        if (nextBtn) { nextBtn.click(); return true; }
        return false;
      }

      // =====================================================================
      // 🟢 Debounce Utility
      // =====================================================================
      function debounce(fn, ms) {
        let timer;
        return function(...args) {
          clearTimeout(timer);
          timer = setTimeout(() => fn.apply(this, args), ms);
        };
      }

      // =====================================================================
      // 🟢 Dark Mode Toggle
      // =====================================================================
      window.__ERP_TOGGLE_DARK = () => {
        state.isDarkMode = !state.isDarkMode;
        localStorage.setItem('elaraby_dark_mode', state.isDarkMode);
        updateUI(true);
        log(state.isDarkMode ? '🌙 وضع الليل' : '☀️ وضع النهار', 'info', state.isDarkMode ? '🌙' : '☀️');
      };

      // =====================================================================
      // 🟢 Browser Notifications
      // =====================================================================
      function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(p => {
            state.notificationsEnabled = p === 'granted';
            if (p === 'granted') log('🔔 الإشعارات مفعلة', 'success', '🔔');
          });
        }
      }

      function sendNotification(title, body) {
        if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
          try { new Notification(title, { body, icon: '🤖', tag: 'elaraby-' + Date.now() }); } catch(e) {}
        }
      }

      function checkNewRowsAndNotify() {
        const currentCount = state.rows.size;
        if (state.prevRowsCount > 0 && currentCount > state.prevRowsCount) {
          const newCount = currentCount - state.prevRowsCount;
          sendNotification(`📱 ${newCount} بلاغ جديد`, `تم اكتشاف ${newCount} بلاغ mới عليه تليفون`);
        }
        state.prevRowsCount = currentCount;
      }

      // =====================================================================
      // 🟢 Virtual Scroll - للصفوف الكتيرة
      // =====================================================================
      function getFilteredRows() {
        const q = state.searchQuery;
        const sorted = [...state.rows.values()].sort((a, b) => (a.pageNum||999) - (b.pageNum||999));
        if (!q) return sorted.filter(r => r.pageNum !== undefined);
        return sorted.filter(r => `${r.orderNo} ${r.name} ${r.phone} ${r.phone2} ${r.sap} ${r.address}`.toLowerCase().includes(q));
      }

      function renderVirtualRow(r, count) {
        const D = state.isDarkMode;
        const R = getR();
        const bg = r.pageNum > 1 ? `background:${D?'#0c1a3a':'#f0f9ff'};` : '';
        const pb = r.pageNum > 1 ? `<span style="font-size:8px;background:#bfdbfe;color:#1d4ed8;padding:1px 3px;border-radius:10px;margin-right:3px;">ص${r.pageNum}</span>` : '';
        const isSynced = SYNC_CACHE.isSynced(r);
        const darkText = D ? 'color:#94a3b8;' : '';
        const nameColor = D ? '#60a5fa' : '#005A9C';

        return `
          <tr style="border-bottom:1px solid ${D?'#334155':'#f3f4f6'};${bg}">
            <td style="padding:${R.rowPadding};width:${R.isMobile?'55%':'60%'};vertical-align:top;">
              <b><span style="color:${nameColor};">${count}-</span>${r.orderNo}</b>${pb}<br>
              <span style="color:${nameColor};font-weight:bold;font-size:${R.fontSize};">${r.name}</span><br>
              ${r.address ? `<small style="color:${D?'#94a3b8':'#666'};font-size:${R.isMobile?'10px':'10px'};">📍 ${r.address}</small>` : ''}
            </td>
            <td style="padding:${R.rowPadding};vertical-align:top;text-align:left;">
              ${r.phone||r.phone2 ? `<div style="color:#059669;font-weight:bold;direction:ltr;font-size:${R.fontSize};">${r.phone} ${r.phone2&&r.phone2!==r.phone?'<br>'+r.phone2:''}</div>` : `<span style="color:#f59e0b;font-size:${R.isMobile?'11px':'10px'};">⏳ بحث...</span>`}
              ${r.sap ? `<div style="color:#be185d;font-size:9px;margin-top:2px;">SAP: ${r.sap}</div>` : ''}
              <div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end;align-items:center;">
                <span title="${isSynced?'محفوظ':'بانتظار'}" style="font-size:${R.isMobile?'12px':'10px'};">${isSynced?'🟢':'⏳'}</span>
                <button onclick="window.__ERP_FORCE_SYNC_ROW('${r.orderNo}')" style="background:${D?'#334155':'#f3f4f6'};border:1px solid ${D?'#475569':'#ccc'};color:${D?'#e2e8f0':'#333'};border-radius:${R.isMobile?'6px':'4px'};padding:${R.isMobile?'4px 6px':'2px 4px'};font-size:9px;cursor:pointer;min-width:${R.isMobile?'32px':'auto'};min-height:${R.isMobile?'28px':'auto'};">☁️</button>
              </div>
            </td>
          </tr>`;
      }

      // =====================================================================
      // 🟢 Excel Export (XML-based - لا يحتاج مكتبات خارجية)
      // =====================================================================
      window.__ERP_EXPORT_EXCEL = function () {
        const sorted = [...state.rows.values()].sort((a, b) => (a.pageNum||999) - (b.pageNum||999));
        let xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>';
        xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        xml += '<Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Size="12"/><Interior ss:Color="#005A9C" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF"/></Style>';
        xml += '<Style ss:ID="num"><NumberFormat ss:Format="@"/></Style></Styles>';
        xml += '<Worksheet ss:Name="البلاغات"><Table>';
        xml += '<Row ss:StyleID="hdr"><Cell><Data ss:Type="String">#</Data></Cell><Cell><Data ss:Type="String">رقم الطلب</Data></Cell><Cell><Data ss:Type="String">اسم العميل</Data></Cell><Cell><Data ss:Type="String">رقم الموبايل</Data></Cell><Cell><Data ss:Type="String">رقم شخص صلة</Data></Cell><Cell><Data ss:Type="String">رقم SAP</Data></Cell><Cell><Data ss:Type="String">العنوان</Data></Cell><Cell><Data ss:Type="String">نوع المنتج</Data></Cell><Cell><Data ss:Type="String">نوع الخدمة</Data></Cell><Cell><Data ss:Type="String">تاريخ الحجز</Data></Cell></Row>';
        sorted.forEach((r, i) => {
          const row = [i+1, r.orderNo, r.name, r.phone, r.phone2, r.sap, r.address, r.type, r.service, r.date];
          xml += '<Row>' + row.map(c => `<Cell${!isNaN(c)&&c!==''?' ss:StyleID="num"':''}><Data ss:Type="${!isNaN(c)&&c!==''?'Number':'String'}">${String(c||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Data></Cell>`).join('') + '</Row>';
        });
        xml += '</Table></Worksheet></Workbook>';
        const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `El-Araby-Orders-${new Date().toLocaleDateString('en-CA')}.xls`;
        link.click();
        log(`تم تصدير ${sorted.length} بلاغ كـ Excel`, 'success', '📊');
      };

      // =====================================================================
      // 🟢 UI & Controls
      // =====================================================================
      window.__ERP_EXPORT = function () {
        const sorted = [...state.rows.values()].sort((a, b) => (a.pageNum||999) - (b.pageNum||999));
        const headers = ['#', 'رقم الطلب', 'اسم العميل', 'رقم الموبايل', 'رقم شخص صلة', 'رقم SAP', 'العنوان', 'نوع المنتج', 'نوع الخدمة', 'تاريخ الحجز'];
        let csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\r\n';
        sorted.forEach((r, i) => {
          const row = [i+1, r.orderNo, r.name, r.phone, r.phone2, r.sap, r.address, r.type, r.service, r.date];
          csv += row.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',') + '\r\n';
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = `El-Araby-Orders-${new Date().toLocaleDateString('en-CA')}.csv`;
        link.click();
        log(`تم تصدير ${sorted.length} بلاغ`, 'success', '📥');
      };

      window.__ERP_FORCE_SYNC_ROW = (orderNo) => {
        const row = state.rows.get(orderNo);
        if (row) {
          log(`☁️ إرسال يدوي: ${orderNo}...`, 'info', '☁️');
          syncRowToGoogle(row, true);
        }
      };

      window.__ERP_FORCE_SYNC_ALL = async () => {
        const rowsToSync = [...state.rows.values()].filter(r => r.phone || r.phone2 || r.sap);
        if (rowsToSync.length === 0) { alert('لا توجد بلاغات جاهزة للرفع.'); return; }
        state.isLoading = true;
        log(`☁️ رفع ${rowsToSync.length} بلاغات...`, 'info', '☁️');
        updateUI(false);
        let successCount = 0;
        for (const row of rowsToSync) {
          const success = await syncRowToGoogle(row, true);
          if (success) successCount++;
          await new Promise(r => setTimeout(r, 100));
        }
        state.isLoading = false;
        log(`☁️ تم رفع ${successCount} بلاغ بنجاح.`, 'success', '☁️');
        updateUI(false);
      };

      window.__ERP_FORCE_REVEAL = function() {
          log('إجبار كشف الأرقام...', 'info', '🔓');
          if (window.crmAccount) window.crmAccount.hideCustomersPhones = false;
          const searchBtn = document.querySelector('.input-group-btn button, .entity-grid .btn-default');
          if (searchBtn) searchBtn.click(); else window.location.reload();
      };

      window.__ERP_COPY_LOGS = () => navigator.clipboard.writeText(state.logs.map(l => `[${l.time}] ${l.msg}`).join('\n'));
      window.__ERP_CLEAR_DIR = () => { if(confirm('مسح الدليل؟')) { DIR_CACHE.clear(); updateUI(false); } };
      window.__ERP_TOGGLE = () => {
        state.isMinimized = !state.isMinimized;
        const box = document.getElementById('elaraby-fixed-box');
        const btn = document.getElementById('elaraby-mini-btn');
        if (box) box.style.display = state.isMinimized ? 'none' : 'flex';
        if (btn) btn.style.display = state.isMinimized ? 'flex' : 'none';
      };
      window.__ERP_TAB = (tab) => { state.activeTab = tab; updateUI(false); };

      const setSearch = debounce((val) => {
        state.searchQuery = val.toLowerCase().trim();
        updateUI(false);
      }, 300);
      window.__ERP_SEARCH = setSearch;

      window.__ERP_DIR_SEARCH = (val) => { state.dirSearchQuery = val.toLowerCase().trim(); updateUI(false); };
      window.__ERP_FETCH_ALL = () => fetchAllPages();

      function renderLogs(container) {
        let html = state.logs.map(l => {
          const color = l.type === 'success' ? '#4ade80' : l.type === 'error' ? '#f87171' : '#94a3b8';
          return `<div style="margin-bottom:5px;font-size:11px;border-bottom:1px solid #1e293b;padding-bottom:4px;display:flex;gap:5px;">
            <span>${l.icon}</span><div><span style="color:#64748b">[${l.time}]</span> <span style="color:${color}">${l.msg}</span></div></div>`;
        }).join('');
        container.innerHTML = html || '<div style="color:#64748b;text-align:center;padding:20px;">لا يوجد سجلات...</div>';
      }

      // =====================================================================
      // 🟢 Responsive Helper - أحجام متغيرة حسب الشاشة
      // =====================================================================
      function getR() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const isMobile = w <= 480;
        const isTablet = w > 480 && w <= 768;
        const isDesktop = w > 768;
        return {
          isMobile, isTablet, isDesktop,
          panelWidth: isMobile ? '100%' : isTablet ? '340px' : '380px',
          panelMaxH: isMobile ? `${h - 20}px` : '620px',
          panelBottom: isMobile ? '0' : '20px',
          panelRight: isMobile ? '0' : '20px',
          panelRadius: isMobile ? '12px 12px 0 0' : '12px',
          panelBorderTop: isMobile ? `4px solid ${'#005A9C'}` : `4px solid ${'#005A9C'}`,
          btnSize: isMobile ? '60px' : '56px',
          btnBottom: isMobile ? '16px' : '20px',
          btnRight: isMobile ? '16px' : '20px',
          fontSize: isMobile ? '13px' : '11px',
          headerSize: isMobile ? '14px' : '12px',
          btnPadding: isMobile ? '10px 6px' : '6px',
          btnMinH: isMobile ? '42px' : '32px',
          inputPadding: isMobile ? '10px 12px' : '6px 10px',
          inputFontSize: isMobile ? '14px' : '11px',
          rowPadding: isMobile ? '10px' : '8px',
          searchRowGap: isMobile ? '8px' : '4px',
        };
      }

      function updateUI(rebuild = true) {
        let box = document.getElementById('elaraby-fixed-box');
        let btn = document.getElementById('elaraby-mini-btn');
        const totalInTable = state.rows.size;
        const withPhone = [...state.rows.values()].filter(r => r.phone || r.phone2).length;
        const syncedCount = SYNC_CACHE.getCount();

        checkNewRowsAndNotify();

        const D = state.isDarkMode;
        const R = getR();
        const bgMain = D ? '#0f172a' : '#fff';
        const bgHeader = D ? '#1e293b' : '#f8fafc';
        const bgTab = D ? '#1e293b' : '#fafafa';
        const bgContent = D ? '#0f172a' : '#fff';
        const border = D ? '#334155' : '#e5e7eb';
        const textMain = D ? '#e2e8f0' : '#333';
        const textMuted = D ? '#94a3b8' : '#666';
        const accentColor = '#005A9C';

        if (rebuild) {
          if (box) box.remove(); if (btn) btn.remove();
          btn = document.createElement('div');
          btn.id = 'elaraby-mini-btn';
          btn.style.cssText = `position:fixed;bottom:${R.btnBottom};right:${R.btnRight};width:${R.btnSize};height:${R.btnSize};background:linear-gradient(135deg,#005A9C,#0078D4);color:#fff;border-radius:50%;box-shadow:0 4px 20px rgba(0,90,156,0.5);z-index:999999;display:flex;justify-content:center;align-items:center;font-size:${R.isMobile?'28px':'26px'};cursor:pointer;transition:transform 0.2s;-webkit-tap-highlight-color:transparent;`;
          btn.innerHTML = '🤖<div id="elaraby-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:#ef4444;width:13px;height:13px;border-radius:50%;border:2px solid #fff;"></div>';
          btn.onclick = window.__ERP_TOGGLE;
          document.body.appendChild(btn);
          box = document.createElement('div');
          box.id = 'elaraby-fixed-box';
          box.style.cssText = `position:fixed;bottom:${R.panelBottom};right:${R.panelRight};left:${R.isMobile?'0':'auto'};width:${R.panelWidth};max-height:${R.panelMaxH};background:${bgMain};border:none;border-top:${R.panelBorderTop};border-radius:${R.panelRadius};box-shadow:0 -4px 30px rgba(0,0,0,${D?'0.6':'0.25'});z-index:999999;font-family:'Segoe UI',sans-serif;direction:rtl;display:flex;flex-direction:column;overflow:hidden;color:${textMain};${R.isMobile?'-webkit-overflow-scrolling:touch;':''}`;
          document.body.appendChild(box);
          box.style.display = state.isMinimized ? 'none' : 'flex';
          btn.style.display = state.isMinimized ? 'flex' : 'none';
        } else {
          box = document.getElementById('elaraby-fixed-box');
          if (!box) return;
          box.style.background = bgMain;
          box.style.color = textMain;
          const badge = document.getElementById('elaraby-badge');
          if (badge && state.isMinimized && totalInTable > 0) badge.style.display = 'block';
        }

        const tabStyle = (name) => `flex:1;padding:${R.isMobile?'10px 4px':'8px 4px'};border:none;cursor:pointer;font-size:${R.fontSize};font-weight:bold;background:${state.activeTab===name?(D?'#0f172a':'#fff'):'transparent'};border-bottom:${state.activeTab===name?`3px solid ${accentColor}`:'3px solid transparent'};color:${state.activeTab===name?accentColor:(D?'#94a3b8':'#888')};-webkit-tap-highlight-color:transparent;min-height:${R.isMobile?'44px':'auto'};`;

        let html = `
          <div style="background:${bgHeader};padding:${R.isMobile?'10px 12px':'8px 10px'};border-bottom:1px solid ${border};display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:bold;color:${accentColor};font-size:${R.headerSize};">📱 كشف الأرقام v15</span>
              <div style="display:flex;gap:${R.isMobile?'6px':'4px'};align-items:center;">
                ${state.isLoading ? `<span style="font-size:${R.fontSize};color:#f59e0b;">⏳ جاري التحميل...</span>` : ''}
                <button onclick="window.__ERP_TOGGLE_DARK()" style="background:${D?'#fbbf24':'#1e293b'};color:${D?'#000':'#fff'};border:none;border-radius:${R.isMobile?'6px':'4px'};padding:${R.isMobile?'4px 8px':'2px 6px'};font-size:${R.fontSize};cursor:pointer;min-width:${R.isMobile?'36px':'auto'};min-height:${R.isMobile?'32px':'auto'};" title="تبديل الوضع">${D?'☀️':'🌙'}</button>
                <button onclick="window.__ERP_FORCE_REVEAL()" style="background:#ef4444;color:white;border:none;border-radius:${R.isMobile?'6px':'4px'};padding:${R.isMobile?'4px 8px':'2px 6px'};font-size:${R.fontSize};font-weight:bold;cursor:pointer;min-width:${R.isMobile?'36px':'auto'};min-height:${R.isMobile?'32px':'auto'};" title="إجبار كشف الأرقام">🔓 كشف</button>
                <button onclick="window.__ERP_TOGGLE()" style="background:none;border:none;cursor:pointer;font-size:${R.isMobile?'16px':'12px'};color:${D?'#94a3b8':'#aaa'};min-width:${R.isMobile?'32px':'auto'};min-height:${R.isMobile?'32px':'auto'};" title="تصغير">➖</button>
                <button onclick="document.getElementById('elaraby-fixed-box').remove();document.getElementById('elaraby-mini-btn').remove();clearInterval(window.__ELARABY_INTERVAL);" style="background:none;border:none;cursor:pointer;font-size:${R.isMobile?'16px':'12px'};color:${D?'#94a3b8':'#aaa'};min-width:${R.isMobile?'32px':'auto'};min-height:${R.isMobile?'32px':'auto'};" title="إغلاق">✕</button>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:${R.fontSize};color:${textMuted};">
              <span>📋 ${totalInTable} | 📱 ${withPhone} | 📄 ${state.scrapedPages.size}/${state.totalPages}</span>
              <span style="color:#059669;font-weight:bold;">☁️ (${syncedCount})</span>
            </div>
          </div>
          <div style="display:flex;border-bottom:1px solid ${border};background:${bgTab};">
            <button style="${tabStyle('data')}" onclick="window.__ERP_TAB('data')">📋 البلاغات</button>
            <button style="${tabStyle('directory')}" onclick="window.__ERP_TAB('directory')">📞 الدليل</button>
            <button style="${tabStyle('logs')}" onclick="window.__ERP_TAB('logs')">🛠️ السجل</button>
          </div>
          <div style="overflow-y:auto;flex:1;background:${bgContent};-webkit-overflow-scrolling:touch;">
        `;

        if (state.activeTab === 'data') {
          html += `
            <div style="padding:${R.isMobile?'10px 12px':'8px'};background:${D?'#1e293b':'#f0f4f8'};border-bottom:1px solid ${border};position:sticky;top:0;z-index:10;display:flex;flex-direction:column;gap:${R.isMobile?'8px':'6px'};">
              <input type="text" placeholder="🔍 بحث (Enter للبحث العميق)..." oninput="window.__ERP_SEARCH(this.value)" onkeydown="window.__ERP_DEEP_SEARCH(event)" value="${state.searchQuery}" style="width:100%;padding:${R.inputPadding};border:1px solid ${D?'#475569':'#ccc'};border-radius:${R.isMobile?'8px':'6px'};outline:none;font-family:inherit;font-size:${R.inputFontSize};background:${D?'#0f172a':'#fff'};color:${textMain};box-sizing:border-box;min-height:${R.isMobile?'44px':'auto'};">
              <div style="display:flex;gap:${R.searchRowGap};">
                <button onclick="window.__ERP_EXPORT_EXCEL()" style="flex:1;background:#10b981;color:#fff;border:none;padding:${R.btnPadding};border-radius:${R.isMobile?'8px':'6px'};cursor:pointer;font-weight:bold;font-size:${R.fontSize};text-align:center;min-height:${R.btnMinH};-webkit-tap-highlight-color:transparent;">📊 Excel</button>
                <button onclick="window.__ERP_EXPORT()" style="flex:1;background:#6366f1;color:#fff;border:none;padding:${R.btnPadding};border-radius:${R.isMobile?'8px':'6px'};cursor:pointer;font-weight:bold;font-size:${R.fontSize};text-align:center;min-height:${R.btnMinH};-webkit-tap-highlight-color:transparent;">📥 CSV</button>
                <button onclick="window.__ERP_FORCE_SYNC_ALL()" style="flex:1;background:#005A9C;color:#fff;border:none;padding:${R.btnPadding};border-radius:${R.isMobile?'8px':'6px'};cursor:pointer;font-weight:bold;font-size:${R.fontSize};text-align:center;min-height:${R.btnMinH};-webkit-tap-highlight-color:transparent;">☁️ رفع</button>
              </div>
            </div>
          `;
          const apColor = state.isAutoPilot ? '#ef4444' : accentColor;
          const apText = state.isAutoPilot ? '🛑 إيقاف' : '🤖 تصفح تلقائي';
          html += `
            <div style="padding:${R.isMobile?'8px 12px':'6px 8px'};background:${D?'#1e293b':'#fffbeb'};border-bottom:1px solid ${D?'#334155':'#fde68a'};">
              <button onclick="window.__ERP_TOGGLE_AUTOPILOT()" style="background:${apColor};color:white;border:none;border-radius:${R.isMobile?'8px':'6px'};padding:${R.btnPadding};font-size:${R.fontSize};font-weight:bold;cursor:pointer;width:100%;text-align:center;min-height:${R.btnMinH};-webkit-tap-highlight-color:transparent;">${apText}</button>
            </div>
          `;
          if (state.totalPages > 1 && state.scrapedPages.size < state.totalPages && !state.isAutoPilot) {
            html += `<div style="padding:${R.isMobile?'8px 12px':'6px'};background:${D?'#1e293b':'#fffbeb'};border-bottom:1px solid ${D?'#334155':'#fde68a'};display:flex;justify-content:space-between;align-items:center;"><span style="font-size:${R.fontSize};color:${D?'#fbbf24':'#92400e'};">⚠️ باقي ${state.totalPages - state.scrapedPages.size} صفحات</span><button onclick="window.__ERP_FETCH_ALL()" style="background:#f59e0b;color:#fff;border:none;padding:4px 8px;border-radius:${R.isMobile?'6px':'4px'};cursor:pointer;font-size:${R.fontSize};min-height:32px;">جلب الكل</button></div>`;
          }
          html += `<table style="width:100%;border-collapse:collapse;font-size:${R.fontSize};"><tbody>`;
          if (state.searchQuery) {
            const matches = Object.values(DIR_CACHE.get()).filter(c => `${c.name} ${c.phones.join(' ')} ${c.sap.join(' ')}`.toLowerCase().includes(state.searchQuery));
            if (matches.length > 0) {
              html += `<tr style="background:${D?'#1a2e1a':'#f0fdf4'};"><td colspan="2" style="padding:${R.rowPadding};color:#15803d;font-weight:bold;border-bottom:2px solid #bbf7d0;font-size:${R.fontSize};">🎯 من الدليل:</td></tr>`;
              matches.forEach(c => {
                html += `<tr><td style="padding:${R.rowPadding};width:60%;"><b style="color:${D?'#4ade80':'#15803d'};">📞 ${c.name}</b></td><td style="padding:${R.rowPadding};">${c.phones.map(p=>`<div>${p}</div>`).join('')}</td></tr>`;
              });
            }
          }
          const sorted = getFilteredRows();
          let count = 0;
          sorted.forEach(r => {
            count++;
            html += renderVirtualRow(r, count);
          });
          if (count === 0) html += `<tr><td colspan="2" style="padding:20px;text-align:center;">لا توجد نتائج</td></tr>`;
          html += `</tbody></table>`;
        }

        if (state.activeTab === 'directory') {
          const q = state.dirSearchQuery.toLowerCase();
          html += `<div style="padding:${R.isMobile?'10px 12px':'10px'};background:${D?'#1e293b':'#f0f4f8'};display:flex;gap:6px;"><input type="text" placeholder="🔍 بحث..." onkeyup="window.__ERP_DIR_SEARCH(this.value)" value="${state.dirSearchQuery}" style="flex:1;padding:${R.inputPadding};border:1px solid ${D?'#475569':'#ccc'};border-radius:${R.isMobile?'8px':'6px'};font-size:${R.inputFontSize};background:${D?'#0f172a':'#fff'};color:${textMain};min-height:${R.isMobile?'44px':'auto'};box-sizing:border-box;"><button onclick="window.__ERP_CLEAR_DIR()" style="background:#ef4444;color:#fff;border:none;border-radius:${R.isMobile?'8px':'6px'};padding:0 12px;font-size:${R.fontSize};min-height:${R.isMobile?'44px':'36px'};min-width:${R.isMobile?'60px':'auto'};">مسح</button></div><table style="width:100%;font-size:${R.fontSize};"><tbody>`;
          Object.values(DIR_CACHE.get()).sort((a,b)=>b.lastUpdated-a.lastUpdated).forEach(c => {
            if (q && !`${c.name} ${c.phones.join(' ')} ${c.sap.join(' ')}`.toLowerCase().includes(q)) return;
            html += `<tr style="border-bottom:1px solid ${D?'#334155':'#eee'};"><td style="padding:${R.rowPadding};"><b>${c.name}</b></td><td style="padding:${R.rowPadding};direction:ltr;">${c.phones.join('<br>')}</td></tr>`;
          });
          html += `</tbody></table>`;
        }

        if (state.activeTab === 'logs') {
          html += `<div style="background:#0f172a;color:#d4d4d4;padding:10px;min-height:300px;font-family:monospace;"><div style="margin-bottom:8px;display:flex;justify-content:space-between;"><span style="color:#4ade80;">● مراقب نشط</span><button onclick="window.__ERP_COPY_LOGS()" style="background:#005A9C;color:#fff;border:none;padding:2px 8px;border-radius:4px;font-size:11px;">نسخ</button></div><div id="erp-logs-container"></div></div>`;
        }

        html += `</div>`;
        box.innerHTML = html;
        if (state.activeTab === 'logs') renderLogs(document.getElementById('erp-logs-container'));
        const si = box.querySelector('input[type="text"]');
        if (si) { si.focus(); const v = si.value; si.value=''; si.value=v; }
      }

      // =====================================================================
      // 🟢 Keyboard Shortcuts
      // =====================================================================
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const box = document.getElementById('elaraby-fixed-box');
          if (box && box.style.display !== 'none') {
            window.__ERP_TOGGLE();
          }
        }
        if (e.ctrlKey && e.key === 'k') {
          e.preventDefault();
          const box = document.getElementById('elaraby-fixed-box');
          if (box && box.style.display === 'none') {
            window.__ERP_TOGGLE();
          }
          const searchInput = document.querySelector('#elaraby-fixed-box input[type="text"]');
          if (searchInput) searchInput.focus();
        }
      });

      // =====================================================================
      // 🟢 Observers & Network Hooks
      // =====================================================================
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(m, u, ...a) { this._url = u; return origOpen.apply(this, [m, u, ...a]); };
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(b, ...a) {
        this.addEventListener('load', () => {
          if (this._url && (this._url.includes('entitylist') || this._url.includes('filter-request') || this._url.includes('viewData'))) {
            log('تحديث الجدول (AJAX)', 'info', '🌐');
            setTimeout(() => { extractFromDOM(); }, 800);
          }
        });
        return origSend.apply(this, [b, ...a]);
      };
      document.addEventListener('click', e => {
        const a = e.target.closest('.pagination a, .pager a, ul.pagination li a');
        if (a && !isNaN(parseInt(a.textContent.trim()))) setTimeout(() => extractFromDOM(), 1000);
      });

      // =====================================================================
      // 🟢 التشغيل
      // =====================================================================
      updateUI(true);
      log('🚀 كشف الأرقام v15 يعمل...', 'success', '📱');
      requestNotificationPermission();
      extractFromDOM();
      window.__ELARABY_INTERVAL = setInterval(() => { extractFromDOM(); }, 3000);

      // Resize handler - إعادة بناء UI عند تغير حجم الشاشة
      let lastWidth = window.innerWidth;
      window.addEventListener('resize', debounce(() => {
        const newWidth = window.innerWidth;
        const crossedBreakpoint = (lastWidth <= 480 && newWidth > 480) || (lastWidth > 480 && newWidth <= 480) || (lastWidth <= 768 && newWidth > 768) || (lastWidth > 768 && newWidth <= 768);
        lastWidth = newWidth;
        if (crossedBreakpoint) updateUI(true);
      }, 300));
  }
})();