// ==UserScript==
// @name         🗓️ El-Araby Date Filter Unlocker
// @namespace    elaraby.datefilter.unlocker
// @version      1.0
// @description  كاشف ومتحكم في فلتر تاريخ البلاغات - يكشف البلاغات المخفية ويتيح التحكم الكامل في نطاق التاريخ
// @author       El-Araby Tech / Antigravity
// @match        https://elarabyportalpfs.powerappsportals.com/*
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    //  ⚡ المرحلة 0: اعتراض window.crmAccount قبل أي شيء
    //  هذا يجب أن يحدث قبل تحميل باقي السكريبتات
    // ============================================================
    let _crmAccount = null;
    let _interceptLog = [];
    let _filterUpdateIntervals = []; // Track intervals for cleanup

    Object.defineProperty(window, 'crmAccount', {
        get: function () {
            return _crmAccount;
        },
        set: function (val) {
            _interceptLog.push({
                time: new Date().toISOString(),
                original: JSON.parse(JSON.stringify(val || {}))
            });

            // ✅ التعديل الجوهري: إزالة قيود futureCases
            if (val && typeof val === 'object') {
                val.__originalFutureCases = val.futureCases;
                val.__originalAllowCancellation = val.allowCancellation;
                // futureCases: 963400002 = محدود بـ 3 أيام (أو ما تحدده الشركة)
                // نغيرها لقيمة تعني "بلا حدود" أو نزيلها
                delete val.futureCases; // حذف القيد كلياً
            }

            _crmAccount = val;
            console.log('%c[DateUnlocker] ✅ crmAccount اعترضناه وعدّلناه!', 'color: #10b981; font-weight: bold;', val);
        },
        configurable: true
    });

    // ============================================================
    //  ⚡ المرحلة 1: اعتراض fetch و XMLHttpRequest لمراقبة الطلبات
    // ============================================================
    const _originalFetch = window.fetch;
    const _fetchLog = [];

    window.fetch = function (...args) {
        const url = args[0] instanceof Request ? args[0].url : String(args[0]);
        const relevantUrls = ['incidents', 'cases', 'orders', 'filter', 'date', 'futureCases', 'createdon'];

        if (relevantUrls.some(k => url.toLowerCase().includes(k))) {
            _fetchLog.push({ url, time: new Date().toISOString() });
            console.log('%c[DateUnlocker] 🌐 Fetch:', 'color: #f59e0b;', url);
        }

        // تعديل الطلب إذا كان يحتوي على فلتر تاريخ
        if (args[1] && args[1].body) {
            try {
                const body = JSON.parse(args[1].body);
                if (body && body.filter && typeof body.filter === 'string' && body.filter.includes('createdon')) {
                    console.log('%c[DateUnlocker] 🎯 تم اكتشاف فلتر تاريخ في الطلب!', 'color: #ef4444; font-weight: bold;', body.filter);
                    window.__dateFilterDetected = body.filter;
                }
            } catch (e) { /* JSON parse failed, skip */ }
        }

        return _originalFetch.apply(this, args);
    };

    // اعتراض XHR
    const _origXHROpen = XMLHttpRequest.prototype.open;
    const _origXHRSend = XMLHttpRequest.prototype.send;
    const _xhrLog = [];

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._url = url;
        return _origXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const url = this._url || '';
        if (url && (url.includes('incident') || url.includes('order') || url.includes('createdon') || url.includes('filter'))) {
            _xhrLog.push({ url, body, time: new Date().toISOString() });
            console.log('%c[DateUnlocker] 📡 XHR:', 'color: #8b5cf6;', url, body);

            if (body && typeof body === 'string' && body.includes('createdon')) {
                console.log('%c[DateUnlocker] 🎯 فلتر تاريخ في XHR!', 'color: #ef4444;', body);
                window.__dateFilterDetectedXHR = body;
            }
        }
        return _origXHRSend.apply(this, arguments);
    };

    // ============================================================
    //  ⚡ المرحلة 2: تشغيل الواجهة بعد تحميل الصفحة
    // ============================================================
    window.addEventListener('DOMContentLoaded', initUnlocker);
    // fallback إذا فاتنا DOMContentLoaded
    if (document.readyState !== 'loading') {
        setTimeout(initUnlocker, 500);
    }

    function initUnlocker() {
        // تأخير بسيط حتى تتحمل عناصر البورتال
        setTimeout(buildUI, 1500);
        // مراقبة تغييرات DOM لاكتشاف فلتر التاريخ فور ظهوره
        startDateFilterObserver();
    }

    // ============================================================
    //  🔍 مراقب DOM: يرصد عنصر dtCreateOnDateRange
    // ============================================================
    function startDateFilterObserver() {
        const obs = new MutationObserver(() => {
            const rangeSpan = document.getElementById('dtCreateOnRangeValue');
            if (rangeSpan && !window.__dateFilterCaptured) {
                window.__dateFilterCaptured = rangeSpan.textContent.trim();
                console.log('%c[DateUnlocker] 📅 تم رصد الفلتر الحالي:', 'color:#10b981;', window.__dateFilterCaptured);
                analyzeCurrentFilter(window.__dateFilterCaptured);
                updateFilterDisplay();
            }

            // مراقبة التغيير في الفلتر
            if (rangeSpan) {
                const current = rangeSpan.textContent.trim();
                if (window.__lastSeenFilter !== current) {
                    window.__lastSeenFilter = current;
                    analyzeCurrentFilter(current);
                    updateFilterDisplay();
                }
            }
        });

        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    // ============================================================
    //  📊 تحليل الفلتر الحالي
    // ============================================================
    function analyzeCurrentFilter(rangeText) {
        if (!rangeText) return;
        const parts = rangeText.split(' - ');
        if (parts.length !== 2) return;

        const startDate = parseFilterDate(parts[0].trim());
        const endDate   = parseFilterDate(parts[1].trim());

        if (!startDate || !endDate) return;

        const diffDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
        const today    = new Date();
        const futureDays = Math.round((endDate - today) / (1000 * 60 * 60 * 24));

        window.__filterAnalysis = {
            raw: rangeText,
            startDate, endDate,
            totalDays: diffDays + 1,
            futureDays: futureDays >= 0 ? futureDays : 0,
            pastDays: futureDays < 0 ? Math.abs(futureDays) : diffDays - futureDays
        };

        console.log('%c[DateUnlocker] 📊 تحليل الفلتر:', 'color:#3b82f6;', window.__filterAnalysis);
    }

    function parseFilterDate(str) {
        // صيغة: MM/DD/YYYY
        const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!m) return null;
        return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
    }

    function formatDate(date) {
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }

    // ============================================================
    //  🎛️ تطبيق فلتر تاريخ جديد على صفحة البورتال
    // ============================================================
    function applyNewDateRange(startDate, endDate) {
        const rangeSpan = document.getElementById('dtCreateOnRangeValue');
        const dateRangeDiv = document.getElementById('dtCreateOnDateRange');

        if (!rangeSpan || !dateRangeDiv) {
            return { success: false, reason: 'لم يتم العثور على عنصر الفلتر' };
        }

        const newRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;

        // تحديث النص المعروض
        rangeSpan.textContent = newRangeText;

        // محاولة 1: إطلاق الأحداث مباشرة على عنصر الفلتر
        const events = ['change', 'input', 'click', 'mousedown', 'mouseup'];
        events.forEach(ev => {
            dateRangeDiv.dispatchEvent(new Event(ev, { bubbles: true }));
        });

        // محاولة 2: البحث عن الـ jQuery daterangepicker وتحديثه
        if (window.jQuery || window.$) {
            const jq = window.jQuery || window.$;
            try {
                const $picker = jq('#dtCreateOnDateRange');
                if ($picker.data && $picker.data('daterangepicker')) {
                    const picker = $picker.data('daterangepicker');
                    picker.setStartDate(startDate);
                    picker.setEndDate(endDate);
                    picker.updateElement();
                    $picker.trigger('apply.daterangepicker', [picker]);
                    console.log('%c[DateUnlocker] ✅ DateRangePicker تم تحديثه!', 'color: #10b981;');
                }
            } catch (e) {
                console.warn('[DateUnlocker] jQuery DateRangePicker error:', e);
            }

            // محاولة 3: تحديث عبر events jQuery
            try {
                jq('#dtCreateOnDateRange').trigger('change');
                jq('#dtCreateOnDateRange').trigger('apply');
            } catch (e) {}
        }

        // محاولة 4: البحث عن زر "بحث" / "تطبيق" وضغطه تلقائياً
        const applyBtns = document.querySelectorAll(
            'button[id*="apply"], button[id*="search"], button[id*="filter"], ' +
            'a[id*="apply"], input[type="submit"], ' +
            'button.btn-primary, .applyBtn, .btn-search'
        );
        applyBtns.forEach(btn => {
            if (btn && !btn.disabled) {
                setTimeout(() => btn.click(), 300);
            }
        });

        // محاولة 5: reload الصفحة مع الفلتر الجديد في الـ URL
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('dtStart', formatDate(startDate));
        currentUrl.searchParams.set('dtEnd', formatDate(endDate));

        return { success: true, newRange: newRangeText, url: currentUrl.toString() };
    }

    // ============================================================
    //  🔃 تحديث الصفحة مع فلتر جديد
    // ============================================================
    function reloadWithNewRange(startDate, endDate) {
        // محاولة التطبيق بدون reload أولاً
        const result = applyNewDateRange(startDate, endDate);
        updateFilterDisplay();
        return result;
    }

    // ============================================================
    //  🔄 تحديث معلومات الفلتر في الواجهة
    // ============================================================
    function updateFilterDisplay() {
        const rangeTextEl   = document.getElementById('eau-range-text');
        const totalDaysEl   = document.getElementById('eau-total-days');
        const futureDaysEl  = document.getElementById('eau-future-days');
        const crmStatusEl   = document.getElementById('eau-crm-status');

        if (!rangeTextEl) return;

        // قراءة الفلتر الحالي من الصفحة مباشرة
        const rangeSpan = document.getElementById('dtCreateOnRangeValue');
        if (rangeSpan) {
            const currentRange = rangeSpan.textContent.trim();
            rangeTextEl.textContent = currentRange || 'غير محدد';
            analyzeCurrentFilter(currentRange);
        } else {
            rangeTextEl.textContent = 'لم يتم العثور على الفلتر';
        }

        // تحليل الفلتر
        if (window.__filterAnalysis) {
            const fa = window.__filterAnalysis;
            totalDaysEl.textContent  = `${fa.totalDays} يوم`;
            futureDaysEl.textContent = `${fa.futureDays} يوم مستقبلي`;
            futureDaysEl.className   = `eau-value ${fa.futureDays > 3 ? 'eau-badge-green' : 'eau-badge-orange'}`;
        }

        // حالة crmAccount
        if (_crmAccount) {
            const originalFuture = _crmAccount.__originalFutureCases;
            const hasFutureCases = originalFuture !== undefined;
            crmStatusEl.innerHTML = hasFutureCases
                ? `<span class="eau-badge-orange">futureCases مكتشف: ${originalFuture} ← ✅ تم حذف القيد</span>`
                : `<span class="eau-badge-green">لا قيود futureCases</span>`;
        } else {
            crmStatusEl.innerHTML = `<span class="eau-badge-gray">لم يُحمّل بعد</span>`;
        }

        // تحديث سجل الاعتراض
        updateInterceptLog();
    }

    // ============================================================
    //  📜 تحديث سجل الاعتراض
    // ============================================================
    function updateInterceptLog() {
        const logEl = document.getElementById('eau-intercept-log');
        if (!logEl) return;

        const allLogs = [
            ..._interceptLog.map(l => ({ type: 'crmAccount', ...l })),
            ..._fetchLog.map(l => ({ type: 'fetch', ...l })),
            ..._xhrLog.map(l => ({ type: 'xhr', ...l }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 20);

        if (allLogs.length === 0) {
            logEl.innerHTML = '<div class="eau-log-empty">لا يوجد طلبات مرصودة بعد...</div>';
            return;
        }

        logEl.innerHTML = allLogs.map(l => {
            const icons = { crmAccount: '⚙️', fetch: '🌐', xhr: '📡' };
            const colors = { crmAccount: '#10b981', fetch: '#f59e0b', xhr: '#8b5cf6' };
            const time = new Date(l.time).toLocaleTimeString('ar-EG');

            let content = '';
            if (l.type === 'crmAccount') {
                const fc = l.original.futureCases;
                content = fc ? `futureCases = <b>${fc}</b>` : 'crmAccount بدون futureCases';
            } else {
                const url = (l.url || '').split('?')[0].split('/').slice(-3).join('/');
                content = url;
            }

            return `<div class="eau-log-entry" style="border-right: 3px solid ${colors[l.type]};">
                <span class="eau-log-icon">${icons[l.type]}</span>
                <div class="eau-log-content">
                    <span class="eau-log-type">${l.type}</span>
                    <span class="eau-log-text">${content}</span>
                </div>
                <span class="eau-log-time">${time}</span>
            </div>`;
        }).join('');
    }

    // ============================================================
    //  🔎 فحص البلاغات المخفية في الجدول الحالي
    // ============================================================
    async function scanForHiddenCases() {
        const btn = document.getElementById('eau-scan-btn');
        const infoEl = document.getElementById('eau-hidden-info');
        const resultsSection = document.getElementById('eau-results-section');
        const resultsList = document.getElementById('eau-results-list');

        btn.disabled = true;
        btn.textContent = '⏳ جاري الفحص...';
        infoEl.innerHTML = 'جاري فحص جدول البلاغات في الصفحة الحالية...';

        await new Promise(r => setTimeout(r, 500));

        try {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const today = new Date(); today.setHours(0, 0, 0, 0);

            const allCases = [];
            const hiddenFuture = [];
            const hiddenPast = [];

            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 9) return;

                const casNo  = (tds[0]?.textContent || '').trim().match(/CAS\d+/)?.[0] || '';
                const name   = (tds[1]?.textContent || '').trim();
                const type   = (tds[4]?.textContent || '').trim();
                const phone  = (tds[5]?.textContent || '').trim().match(/01[0-9]{9}/)?.[0] || '';
                const dateStr = (tds[8]?.textContent || '').trim();

                if (!casNo) return;

                let caseDate = null;
                if (dateStr) {
                    const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    if (m) caseDate = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
                }

                const caseInfo = { casNo, name, type, phone, dateStr, caseDate };
                allCases.push(caseInfo);

                if (caseDate) {
                    if (caseDate > today) hiddenFuture.push(caseInfo);
                }
            });

            // عرض النتائج
            infoEl.innerHTML = `
                <div class="eau-stat-row">
                    <span>📋 إجمالي البلاغات المرئية:</span>
                    <span class="eau-badge-blue">${allCases.length}</span>
                </div>
                <div class="eau-stat-row">
                    <span>🔮 بلاغات مستقبلية:</span>
                    <span class="eau-badge-green">${hiddenFuture.length}</span>
                </div>
            `;
            infoEl.className = 'eau-info-box eau-info-success';

            if (allCases.length > 0) {
                resultsSection.style.display = 'block';
                resultsList.innerHTML = allCases.map(c => {
                    const isFuture = c.caseDate && c.caseDate > today;
                    return `
                    <div class="eau-case-card ${isFuture ? 'eau-case-future' : ''}">
                        <div class="eau-case-header">
                            <span class="eau-case-no">${c.casNo}</span>
                            ${isFuture ? '<span class="eau-future-badge">🔮 مستقبلي</span>' : ''}
                        </div>
                        <div class="eau-case-body">
                            <div class="eau-case-row"><span>👤</span> ${c.name || 'بدون اسم'}</div>
                            <div class="eau-case-row"><span>📱</span> ${c.phone || 'بدون رقم'}</div>
                            <div class="eau-case-row"><span>📅</span> ${c.dateStr || 'بدون تاريخ'}</div>
                            <div class="eau-case-row"><span>🏷️</span> ${c.type || 'غير محدد'}</div>
                        </div>
                    </div>
                    `;
                }).join('');
            } else {
                resultsSection.style.display = 'none';
                infoEl.innerHTML = '⚠️ لم يتم العثور على بلاغات في الجدول الحالي. تأكد من أنك في صفحة البلاغات وحاول تطبيق نطاق تاريخ أوسع.';
                infoEl.className = 'eau-info-box eau-info-warning';
            }

        } catch (e) {
            infoEl.innerHTML = `❌ خطأ أثناء الفحص: ${e.message}`;
            infoEl.className = 'eau-info-box eau-info-error';
        } finally {
            btn.disabled = false;
            btn.textContent = '🔎 فحص البلاغات الآن';
        }
    }

    // ============================================================
    //  🔔 إشعارات
    // ============================================================
    function showNotif(msg, type = 'info') {
        const old = document.getElementById('eau-notif');
        if (old) old.remove();

        const colors = {
            success: { bg: '#10b981', text: '#fff' },
            warning: { bg: '#f59e0b', text: '#fff' },
            error:   { bg: '#ef4444', text: '#fff' },
            info:    { bg: '#3b82f6', text: '#fff' }
        };
        const c = colors[type] || colors.info;

        const notif = document.createElement('div');
        notif.id = 'eau-notif';
        notif.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: ${c.bg}; color: ${c.text};
            padding: 10px 20px; border-radius: 30px;
            font-size: 13px; font-weight: bold;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 9999999; direction: rtl;
            animation: eau-fadeIn 0.3s ease;
        `;
        notif.textContent = msg;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }

    // ============================================================
    //  🛠️ دوال مساعدة
    // ============================================================
    function toInputDate(date) {
        const yyyy = date.getFullYear();
        const mm   = String(date.getMonth() + 1).padStart(2, '0');
        const dd   = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // ============================================================
    //  🎨 الأنماط
    // ============================================================
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'eau-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');

            @keyframes eau-fadeIn {
                from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes eau-slideIn {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes eau-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                50%       { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
            }

            #ea-date-unlocker-fab {
                position: fixed;
                bottom: 100px;
                left: 20px;
                width: 54px;
                height: 54px;
                border-radius: 50%;
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                cursor: pointer;
                z-index: 9999997;
                transition: all 0.3s ease;
                animation: eau-pulse 3s infinite;
                user-select: none;
            }
            #ea-date-unlocker-fab:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 25px rgba(220, 38, 38, 0.6);
            }

            #ea-date-unlocker-panel {
                position: fixed;
                bottom: 20px;
                left: 20px;
                width: 380px;
                max-height: 90vh;
                display: none;
                flex-direction: column;
                border-radius: 16px;
                background: #0f172a;
                border: 1px solid #1e293b;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
                z-index: 9999998;
                font-family: 'Cairo', system-ui, sans-serif;
                direction: rtl;
                overflow: hidden;
                animation: eau-slideIn 0.3s ease;
                color: #e2e8f0;
            }

            .eau-header {
                background: linear-gradient(135deg, #dc2626, #991b1b);
                padding: 14px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
            }
            .eau-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .eau-icon { font-size: 24px; }
            .eau-title {
                font-size: 14px;
                font-weight: 900;
                color: #fff;
                line-height: 1.2;
            }
            .eau-subtitle {
                font-size: 10px;
                color: rgba(255,255,255,0.7);
            }
            .eau-close-btn {
                color: rgba(255,255,255,0.8);
                cursor: pointer;
                font-size: 16px;
                transition: 0.2s;
                padding: 4px;
            }
            .eau-close-btn:hover { color: #fff; }

            /* Scrollable Body */
            #ea-date-unlocker-panel > *:not(.eau-header) {
                overflow-y: auto;
            }
            #ea-date-unlocker-panel {
                display: none;
            }
            #ea-date-unlocker-panel.eau-open {
                display: flex;
            }

            /* sections wrapper */
            .eau-body-scroll {
                overflow-y: auto;
                flex: 1;
                padding: 0;
            }

            .eau-section {
                padding: 14px 16px;
                border-bottom: 1px solid #1e293b;
            }
            .eau-section:last-child { border-bottom: 0; }

            .eau-section-title {
                font-size: 11px;
                font-weight: 700;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 10px;
            }

            .eau-filter-display {
                background: #1e293b;
                border-radius: 10px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .eau-filter-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .eau-label {
                font-size: 11px;
                color: #64748b;
                white-space: nowrap;
            }
            .eau-value {
                font-size: 11px;
                font-weight: 700;
                color: #e2e8f0;
                text-align: left;
                direction: ltr;
            }

            .eau-badge-blue   { color: #60a5fa; }
            .eau-badge-green  { color: #34d399; }
            .eau-badge-orange { color: #fbbf24; }
            .eau-badge-gray   { color: #94a3b8; }

            .eau-quick-btns {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
                margin-bottom: 12px;
            }
            .eau-quick-btn {
                padding: 7px 4px;
                border-radius: 8px;
                border: 1px solid #334155;
                background: #1e293b;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Cairo', sans-serif;
                text-align: center;
            }
            .eau-quick-btn:hover,
            .eau-quick-btn.eau-quick-btn-active {
                background: #dc2626;
                border-color: #dc2626;
                color: #fff;
            }
            .eau-quick-btn-highlight {
                border-color: #dc2626;
                color: #f87171;
            }

            .eau-custom-range {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 10px;
            }
            .eau-input-group {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .eau-input-label {
                font-size: 10px;
                color: #64748b;
                font-weight: 600;
            }
            .eau-date-input {
                padding: 7px 10px;
                border-radius: 8px;
                border: 1px solid #334155;
                background: #1e293b;
                color: #e2e8f0;
                font-size: 12px;
                outline: none;
                transition: 0.2s;
                direction: ltr;
                font-family: monospace;
            }
            .eau-date-input:focus {
                border-color: #dc2626;
                box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
            }

            .eau-apply-btn {
                width: 100%;
                padding: 10px;
                border-radius: 10px;
                border: 0;
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                color: #fff;
                font-size: 13px;
                font-weight: 900;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Cairo', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .eau-apply-btn:hover {
                background: linear-gradient(135deg, #b91c1c, #991b1b);
                transform: translateY(-1px);
                box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3);
            }

            .eau-log-box {
                background: #0a0f1a;
                border-radius: 8px;
                padding: 8px;
                max-height: 120px;
                overflow-y: auto;
                border: 1px solid #1e293b;
            }
            .eau-log-empty {
                font-size: 11px;
                color: #475569;
                text-align: center;
                padding: 10px;
            }
            .eau-log-entry {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 5px 8px;
                border-radius: 4px;
                margin-bottom: 3px;
                background: #0f172a;
            }
            .eau-log-icon { font-size: 12px; }
            .eau-log-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            .eau-log-type {
                font-size: 9px;
                color: #64748b;
                text-transform: uppercase;
                font-weight: 700;
            }
            .eau-log-text {
                font-size: 10px;
                color: #94a3b8;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                direction: ltr;
            }
            .eau-log-time {
                font-size: 9px;
                color: #475569;
                white-space: nowrap;
            }

            .eau-mini-btn {
                background: #1e293b;
                border: 1px solid #334155;
                color: #94a3b8;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 10px;
                cursor: pointer;
                font-family: 'Cairo', sans-serif;
                transition: 0.2s;
            }
            .eau-mini-btn:hover { background: #334155; }

            .eau-info-box {
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 11px;
                line-height: 1.6;
                margin-bottom: 10px;
            }
            .eau-info-warning { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; }
            .eau-info-success { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; }
            .eau-info-error   { background: rgba(239, 68, 68, 0.1);  border: 1px solid rgba(239, 68, 68, 0.3);  color: #f87171; }

            .eau-stat-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 3px 0;
            }

            .eau-scan-btn {
                width: 100%;
                padding: 9px;
                border-radius: 8px;
                border: 1px solid #334155;
                background: #1e293b;
                color: #e2e8f0;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                font-family: 'Cairo', sans-serif;
                transition: all 0.2s;
            }
            .eau-scan-btn:hover {
                background: #334155;
                border-color: #475569;
            }
            .eau-scan-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .eau-results-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
                max-height: 300px;
                overflow-y: auto;
            }
            .eau-case-card {
                background: #1e293b;
                border-radius: 8px;
                padding: 10px 12px;
                border: 1px solid #334155;
            }
            .eau-case-future {
                border-color: #dc2626;
                background: rgba(220, 38, 38, 0.05);
            }
            .eau-case-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 6px;
            }
            .eau-case-no {
                font-size: 11px;
                font-weight: 900;
                color: #60a5fa;
                direction: ltr;
            }
            .eau-future-badge {
                font-size: 10px;
                background: rgba(220, 38, 38, 0.2);
                color: #f87171;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 700;
            }
            .eau-case-body {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 4px;
            }
            .eau-case-row {
                font-size: 10px;
                color: #94a3b8;
                display: flex;
                align-items: center;
                gap: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    //  🏗️ بناء واجهة المستخدم
    // ============================================================
    buildUI = function () {
        const old = document.getElementById('ea-date-unlocker-panel');
        if (old) old.remove();
        const oldBtn = document.getElementById('ea-date-unlocker-fab');
        if (oldBtn) oldBtn.remove();

        injectStyles();

        const fab = document.createElement('div');
        fab.id = 'ea-date-unlocker-fab';
        fab.innerHTML = `🗓️`;
        fab.title = 'كاشف ومتحكم فلتر التاريخ';
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ea-date-unlocker-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'eau-header';
        header.innerHTML = `
            <div class="eau-header-left">
                <span class="eau-icon">🗓️</span>
                <div>
                    <div class="eau-title">كاشف فلتر التاريخ</div>
                    <div class="eau-subtitle">El-Araby Date Unlocker v1.0</div>
                </div>
            </div>
            <span id="eau-close" class="eau-close-btn">✕</span>
        `;
        panel.appendChild(header);

        // Scrollable body
        const scrollBody = document.createElement('div');
        scrollBody.className = 'eau-body-scroll';
        scrollBody.style.cssText = 'overflow-y:auto; flex:1;';
        scrollBody.innerHTML = `
        <!-- الفلتر الحالي -->
        <div class="eau-section">
            <div class="eau-section-title">📊 الفلتر الحالي المكتشف</div>
            <div class="eau-filter-display">
                <div class="eau-filter-row">
                    <span class="eau-label">نطاق التاريخ:</span>
                    <span id="eau-range-text" class="eau-value eau-badge-blue">جاري الرصد...</span>
                </div>
                <div class="eau-filter-row">
                    <span class="eau-label">إجمالي الأيام:</span>
                    <span id="eau-total-days" class="eau-value">-</span>
                </div>
                <div class="eau-filter-row">
                    <span class="eau-label">أيام مستقبلية:</span>
                    <span id="eau-future-days" class="eau-value">-</span>
                </div>
                <div class="eau-filter-row">
                    <span class="eau-label">حالة crmAccount:</span>
                    <span id="eau-crm-status" class="eau-value">جاري الفحص...</span>
                </div>
            </div>
        </div>

        <!-- التحكم في النطاق -->
        <div class="eau-section">
            <div class="eau-section-title">🎛️ التحكم في نطاق التاريخ</div>
            <div class="eau-quick-btns">
                <button class="eau-quick-btn" data-days="7" data-future="3">7 أيام</button>
                <button class="eau-quick-btn" data-days="14" data-future="7">14 يوم</button>
                <button class="eau-quick-btn eau-quick-btn-highlight" data-days="30" data-future="14">30 يوم</button>
                <button class="eau-quick-btn" data-days="60" data-future="30">60 يوم</button>
            </div>
            <div class="eau-custom-range">
                <div class="eau-input-group">
                    <label class="eau-input-label">من تاريخ</label>
                    <input type="date" id="eau-start-date" class="eau-date-input">
                </div>
                <div class="eau-input-group">
                    <label class="eau-input-label">إلى تاريخ</label>
                    <input type="date" id="eau-end-date" class="eau-date-input">
                </div>
            </div>
            <button id="eau-apply-btn" class="eau-apply-btn">⚡ تطبيق النطاق الجديد</button>
        </div>

        <!-- سجل الاعتراض -->
        <div class="eau-section">
            <div class="eau-section-title" style="display:flex;align-items:center;justify-content:space-between;">
                <span>🔍 سجل الاعتراض</span>
                <button id="eau-refresh-log" class="eau-mini-btn">تحديث</button>
            </div>
            <div id="eau-intercept-log" class="eau-log-box">
                <div class="eau-log-empty">لا يوجد طلبات مرصودة بعد...</div>
            </div>
        </div>

        <!-- فحص البلاغات -->
        <div class="eau-section">
            <div class="eau-section-title">🚨 البلاغات المخفية</div>
            <div id="eau-hidden-info" class="eau-info-box eau-info-warning">
                اضغط "فحص البلاغات" لمعرفة البلاغات المستقبلية الظاهرة في الجدول.
            </div>
            <button id="eau-scan-btn" class="eau-scan-btn">🔎 فحص البلاغات الآن</button>
        </div>

        <!-- نتائج الفحص -->
        <div id="eau-results-section" class="eau-section" style="display:none;">
            <div class="eau-section-title">📋 نتائج الفحص</div>
            <div id="eau-results-list" class="eau-results-container"></div>
        </div>
        `;

        panel.appendChild(scrollBody);
        document.body.appendChild(panel);

        // ربط الأحداث
        fab.addEventListener('click', () => {
            const isOpen = panel.style.display === 'flex';
            panel.style.display = isOpen ? 'none' : 'flex';
            if (!isOpen) updateFilterDisplay();
        });

        document.getElementById('eau-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        scrollBody.querySelectorAll('.eau-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const totalDays  = parseInt(btn.dataset.days);
                const futureDays = parseInt(btn.dataset.future);
                const pastDays   = totalDays - futureDays;
                const today = new Date();
                const start = new Date(today); start.setDate(today.getDate() - pastDays);
                const end   = new Date(today); end.setDate(today.getDate() + futureDays);
                document.getElementById('eau-start-date').value = toInputDate(start);
                document.getElementById('eau-end-date').value   = toInputDate(end);
                scrollBody.querySelectorAll('.eau-quick-btn').forEach(b => b.classList.remove('eau-quick-btn-active'));
                btn.classList.add('eau-quick-btn-active');
            });
        });

        document.getElementById('eau-apply-btn').addEventListener('click', () => {
            const startVal = document.getElementById('eau-start-date').value;
            const endVal   = document.getElementById('eau-end-date').value;
            if (!startVal || !endVal) { showNotif('⚠️ اختر التواريخ أولاً!', 'warning'); return; }
            const startDate = new Date(startVal);
            const endDate   = new Date(endVal);
            if (startDate > endDate) { showNotif('⚠️ تاريخ البداية يجب أن يكون قبل النهاية!', 'error'); return; }
            const result = reloadWithNewRange(startDate, endDate);
            showNotif(`✅ ${result.newRange || 'جاري التطبيق...'}`, 'success');
            setTimeout(updateFilterDisplay, 800);
        });

        document.getElementById('eau-refresh-log').addEventListener('click', updateInterceptLog);
        document.getElementById('eau-scan-btn').addEventListener('click', scanForHiddenCases);

        // التواريخ الافتراضية
        const today = new Date();
        const ds = new Date(today); ds.setDate(today.getDate() - 7);
        const de = new Date(today); de.setDate(today.getDate() + 7);
        document.getElementById('eau-start-date').value = toInputDate(ds);
        document.getElementById('eau-end-date').value   = toInputDate(de);

        setTimeout(updateFilterDisplay, 500);
        _filterUpdateIntervals.push(setInterval(updateFilterDisplay, 3000));
    };

    // Cleanup intervals on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        _filterUpdateIntervals.forEach(id => clearInterval(id));
        _filterUpdateIntervals = [];
    });

})();
