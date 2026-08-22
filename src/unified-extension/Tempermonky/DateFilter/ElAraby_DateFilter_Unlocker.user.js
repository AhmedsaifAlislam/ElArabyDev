// ==UserScript==
// @name         🗓️ El-Araby Date Filter Unlocker
// @namespace    elaraby.datefilter.unlocker
// @version      1.0
// @description  كاشف ومتحكم في فلتر تاريخ البلاغات - يكشف البلاغات المخفية ويتيح التحكم الكامل في نطاق التاريخ
// @author       El-Araby Tech / Antigravity
// @match        https://elarabyportalpfs.powerappsportals.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    // 🏷️ إصدار التشخيص — يظهر في التقرير للتحقق من وصول التحديث
    window.__eauVersion = 'v1.5-no-filter-apply-20260814-2030';

    // ============================================================
    //  ⚡ المرحلة 0: اعتراض window.crmAccount قبل أي شيء
    //  هذا يجب أن يحدث قبل تحميل باقي السكريبتات
    // ============================================================
    let _crmAccount = null;
    let _interceptLog = [];
    let _filterUpdateIntervals = []; // Track intervals for cleanup

    // ============================================================
    //  ⚡ وضع التوسيع التلقائي (Auto-Expand)
    //  عند تفعيله يُوسَّع أي فلتر تاريخ في الطلبات الصادرة تلقائياً
    //  — من (اليوم - 7) إلى (اليوم + N) — بدون ضغط أي زر
    // ============================================================
    try {
        // التوسيع التلقائي مفعّل افتراضياً (30 يوم مستقبلي) حتى تعمل الأداة
        //  فوراً بدون ضغط أي زر — وإذا عطّلها المستخدم يدوياً (0) تبقى معطلة
        const saved = GM_getValue('eau_auto_expand_days', null);
        window.__autoExpandDays = saved === null ? 30 : (parseInt(saved, 10) || 0);
    } catch (e) {
        window.__autoExpandDays = 30;
    }

    function setAutoExpand(days) {
        window.__autoExpandDays = days;
        try { GM_setValue('eau_auto_expand_days', String(days)); } catch (e) {}
        console.log(`%c[DateUnlocker] ⚡ وضع التوسيع التلقائي: ${days > 0 ? days + ' يوم مستقبلي' : 'معطّل'}`, 'color:#10b981;font-weight:bold;');
        showNotif(days > 0 ? `⚡ توسيع تلقائي مفعّل: +${days} يوم` : '⚡ توسيع تلقائي معطّل', 'success');
        // 🛑 لا إعادة تحميل تلقائية — الاعتراض يعدّل الطلبات الصادرة فوراً.
        //  إعادة التحميل كانت تسبب بإعادة قراءة النطاق من الـ URL وإعادة التحليل.
    }

    // ============================================================
    //  🔀 تكامل طبقة Layer0 (elaraby-phone-reveal-layer0.js)
    //  الخاصية قد تكون معرّفة مسبقاً من سكربت آخر في نفس الوضع —
    //  نلفّ على الواصف الحالي بدلاً من إعادة تعريفه كلياً
    //  حتى تعمل الطبقتان معاً على نفس الكائن
    // ============================================================
    const _existingDescriptor = Object.getOwnPropertyDescriptor(window, 'crmAccount');

    function _setCrmAccount(val) {
        _interceptLog.push({
            time: new Date().toISOString(),
            original: JSON.parse(JSON.stringify(val || {}))
        });

        // ✅ التعديل الجوهري: رفع قيود futureCases
        if (val && typeof val === 'object') {
            val.__originalFutureCases = val.futureCases;
            val.__originalAllowCancellation = val.allowCancellation;
            // futureCases: 963400002 = محدود بـ 3 أيام (أو ما تحدده الشركة)
            // نرفعها لقيمة كبيرة جداً بدل الحذف الكلي —
            // الحذف يكسر كود البورتال الذي يقرأ الخاصية (undefined => سلوك غير متوقع)
            val.futureCases = 9999999;
            val.allowCancellation = true;
        }

        _crmAccount = val;
        if (_existingDescriptor && typeof _existingDescriptor.set === 'function') {
            _existingDescriptor.set.call(window, val);
        }
        console.log('%c[DateUnlocker] ✅ crmAccount اعترضناه وعدّلناه!', 'color: #10b981; font-weight: bold;', val);
    }

    function _getCrmAccount() {
        if (_existingDescriptor && typeof _existingDescriptor.get === 'function') {
            const v = _existingDescriptor.get.call(window);
            if (v && typeof v === 'object') return v;
        }
        return _crmAccount;
    }

    Object.defineProperty(window, 'crmAccount', {
        get: _getCrmAccount,
        set: _setCrmAccount,
        configurable: true
    });

    // ============================================================
    //  ⚡ المرحلة 1: اعتراض fetch و XMLHttpRequest لمراقبة الطلبات
    // ============================================================
    const _originalFetch = window.fetch;
    const _fetchLog = [];
    const _frameLog = [];

    // 🖼️ جسر الفريمات: الـ iframes الداخلية ترسل تقارير طلباتها للصفحة الأم
    //  حتى تظهر في سجل اللوحة (سجل كل فريم مستقل بذاكرته)
    function notifyTopFrame(kind, url, modified) {
        try {
            if (window.self !== window.top && typeof window.top.postMessage === 'function') {
                window.top.postMessage({
                    eauFrameLog: true,
                    kind: kind || 'fetch',
                    url: String(url || '').slice(0, 500),
                    modified: !!modified,
                    time: new Date().toISOString()
                }, '*');
            }
        } catch (_) {}
    }

    // 🧹 منع التكرار: نفس المفتاح (URL) خلال TTL يُتجاهل — يمنع ملء السجلات بنفس الطلب
    function pushUnique(arr, entry, key, ttlMs = 10000, maxLen = 60) {
        if (!key) return false;
        const now = Date.now();
        const existing = arr.findIndex(e => e.__key === key && (now - e.__ts) < ttlMs);
        if (existing !== -1) {
            arr[existing].__count = (arr[existing].__count || 1) + 1;
            return false;
        }
        entry.__key = key;
        entry.__ts = now;
        arr.push(entry);
        if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
        return true;
    }

    // في الصفحة الأم: استقبال تقارير الـ iframes + التقاطات webRequest من الخلفية
    if (window.self === window.top) {
        window.addEventListener('message', (ev) => {
            try {
                if (ev && ev.data && ev.data.eauFrameLog) {
                    pushUnique(_frameLog, { type: 'frame', kind: ev.data.kind, url: ev.data.url, modified: ev.data.modified, time: ev.data.time }, ev.data.kind + '|' + ev.data.url, 15000, 40);
                }
                if (ev && ev.data && ev.data.type === 'EAU_GRID_CAPTURES') {
                    (ev.data.captures || []).forEach(c => {
                        if (pushUnique(window.__gridRequestDetail || (window.__gridRequestDetail = []), { ...c, time: c.time || new Date().toISOString() }, c.url + '|' + (c.body || '').slice(0, 200), 15000, 30)) {
                            console.log('%c[DateUnlocker] 📋📦 طلب الجدول (من webRequest):', 'color:#06b6d4;font-weight:bold;', c);
                        }
                    });
                }
            } catch (_) {}
        });
    }

    window.fetch = function (...args) {
        const originalUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
        const url = originalUrl;
        const urlLower = url.toLowerCase();
        const relevantUrls = ['incidents', 'cases', 'orders', 'filter', 'date', 'futureCases', 'createdon', 'findrecords', '_services', 'entity-grid-data'];

        if (relevantUrls.some(k => urlLower.includes(k))) {
            if (pushUnique(_fetchLog, { url, time: new Date().toISOString() }, url.slice(0, 300))) {
                notifyTopFrame('fetch', url, false);
                console.log('%c[DateUnlocker] 🌐 Fetch:', 'color: #f59e0b;', url);
            }
        }

        // 🔍 تسجيل تفصيلي لطلب الجدول الفعلي (entity-grid-data) — لمعرفة مكان الفلتر
        if (urlLower.includes('entity-grid-data')) {
            try {
                let detail = { url: url.slice(0, 400) };
                if (args[1] && args[1].body) {
                    detail.body = typeof args[1].body === 'string'
                        ? args[1].body.slice(0, 800)
                        : JSON.stringify(args[1].body).slice(0, 800);
                }
                if (pushUnique(window.__gridRequestDetail || (window.__gridRequestDetail = []), { ...detail, time: new Date().toISOString() }, detail.url + '|' + (detail.body || '').slice(0, 200), 15000, 30)) {
                    console.log('%c[DateUnlocker] 📋📦 طلب الجدول entity-grid-data:', 'color:#06b6d4;font-weight:bold;', detail);
                }
            } catch (_) {}
        }

        // ✅ الاعتراض الجوهري رقم 1: تعديل فلتر التاريخ في الـ URL نفسه
        //  (طلبات Dataverse تحمل createdon/$filter في الـ query string وليس الـ body)
        if (urlLower.includes('createdon') || urlLower.includes('%24filter') || urlLower.includes('$filter')) {
            try {
                const desired = getEffectiveRange();
                if (desired) {
                    const replacedUrl = replaceCreatedonRangeInUrl(url, desired);
                    if (replacedUrl !== url) {
                        console.log('%c[DateUnlocker] 🔓 تم توسيع نطاق createdon في الـ URL!', 'color: #10b981; font-weight: bold;', replacedUrl);
                        notifyTopFrame('fetch', replacedUrl, true);
                        if (args[0] instanceof Request) {
                            try {
                                args[0] = new Request(replacedUrl, args[0]);
                            } catch (e) {
                                args[0] = replacedUrl;
                            }
                        } else {
                            args[0] = replacedUrl;
                        }
                        window.__urlFilterModified = (window.__urlFilterModified || 0) + 1;
                    } else {
                        console.log('%c[DateUnlocker] ⚠️ URL فيه createdon لكن النطاق غير معروف الشكل:', 'color: #f59e0b;', url);
                    }
                }
            } catch (e) {
                console.warn('[DateUnlocker] فشل تعديل URL:', e);
            }
        }

        // تعديل الطلب إذا كان يحتوي على فلتر تاريخ في الـ body
        if (args[1] && args[1].body) {
            try {
                let bodyStr = typeof args[1].body === 'string' ? args[1].body : (
                    args[1].body instanceof URLSearchParams ? args[1].body.toString() : JSON.stringify(args[1].body)
                );

                if (bodyStr && (bodyStr.includes('createdon') || bodyStr.includes("datetime'"))) {
                    console.log('%c[DateUnlocker] 🎯 تم اكتشاف فلتر تاريخ في الطلب!', 'color: #ef4444; font-weight: bold;', bodyStr);
                    window.__dateFilterDetected = bodyStr;

                    // ✅ التعديل الجوهري: استبدال نطاق createdon بالنطاق المطلوب
                    //  (من زر التطبيق أو من وضع التوسيع التلقائي)
                    const desired = getEffectiveRange();
                    if (desired) {
                        const replaced = replaceCreatedonRange(bodyStr, desired);
                        if (replaced !== bodyStr) {
                            if (typeof args[1].body === 'string') {
                                args[1].body = replaced;
                            } else if (args[1].body instanceof URLSearchParams) {
                                args[1].body = new URLSearchParams(replaced);
                            } else {
                                try { args[1].body = JSON.parse(replaced); } catch (e) {
                                    const blob = args[1].body;
                                    if (blob && typeof blob.text === 'function') {
                                        blob.text().then(t => { args[1].body = replaceCreatedonRange(t, desired); });
                                    }
                                }
                            }
                            console.log('%c[DateUnlocker] 🔓 تم توسيع نطاق createdon في الطلب!', 'color: #10b981; font-weight: bold;', replaced);
                            window.__bodyFilterModified = (window.__bodyFilterModified || 0) + 1;
                        }
                    }
                }
            } catch (e) { /* JSON parse failed, skip */ }
        }

        return _originalFetch.apply(this, args);
    };

    // ============================================================
    //  🔀 دالة مساعدة: استبدال نطاق createdon داخل نص الطلب
    //  (يدعم صيغ Dataverse: datetime'...' أو ISO أو معاملات URL)
    // ============================================================
    const DEFAULT_AUTO_EXPAND_DAYS = 30;

    function getEffectiveRange() {
        // 1) نطاق مطلوب صراحةً (زر تطبيق)
        if (window.__desiredRange && window.__desiredRange.startDate) {
            return window.__desiredRange;
        }
        // 2) وضع التوسيع التلقائي: يوسّع الطلبات من (اليوم أو تاريخ البدء) إلى +N يوم
        if (window.__autoExpandDays && window.__autoExpandDays > 3) {
            const now = new Date();
            const start = new Date(now);
            start.setDate(now.getDate() - 7); // 7 أيام ماضية كسياق
            const end = new Date(now);
            end.setDate(now.getDate() + window.__autoExpandDays);
            return { startDate: start, endDate: end };
        }
        return null;
    }

    function replaceCreatedonRange(bodyStr, desired) {
        if (!bodyStr || !desired) return bodyStr;

        const startISO = toInputDate(desired.startDate);
        const endISO   = toInputDate(desired.endDate);

        // صيغة Dataverse: createdon ge datetime'2026-08-11T00:00:00Z'
        let out = bodyStr.replace(
            /(createdon ge datetime')([^']*)(')/i,
            `$1${startISO}T00:00:00Z$3`
        );
        out = out.replace(
            /(createdon le datetime')([^']*)(')/i,
            `$1${endISO}T23:59:59Z$3`
        );
        // صيغة ISO: "createdon ge 2026-08-11T00:00:00Z"
        if (out === bodyStr) {
            out = out.replace(
                /("?createdon ge"?:\s*")([^"]*)(")/i,
                `$1${startISO}T00:00:00Z$3`
            );
            out = out.replace(
                /("?createdon le"?:\s*")([^"]*)(")/i,
                `$1${endISO}T23:59:59Z$3`
            );
        }
        // صيغة معاملات URL: createdon%20ge%20datetime'...'
        if (out === bodyStr) {
            out = out.replace(
                /(createdon(?:\%20|%20| )ge(?:\%20|%20| )datetime')([^']*)(')/gi,
                `$1${startISO}T00:00:00Z$3`
            );
            out = out.replace(
                /(createdon(?:\%20|%20| )le(?:\%20|%20| )datetime')([^']*)(')/gi,
                `$1${endISO}T23:59:59Z$3`
            );
        }
        // صيغة JSON: "createdon": "2026-08-11T00:00:00Z" أو "Value":"..."
        if (out === bodyStr) {
            const jsonRe = /("(?:createdon|Value)"\s*:\s*")(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)(")/gi;
            let first = true;
            out = bodyStr.replace(jsonRe, (m, pre, d, post) => {
                const iso = first ? startISO + 'T00:00:00Z' : endISO + 'T23:59:59Z';
                first = false;
                return pre + iso + post;
            });
        }
        // fallback عام: أي نطاق datetime'...' في النص (أول تاريخ = بداية، آخر = نهاية)
        if (out === bodyStr && bodyStr.includes('datetime\'')) {
            const dates = bodyStr.match(/datetime'([^']*)'/gi) || [];
            if (dates.length >= 2) {
                out = bodyStr
                    .replace(dates[0], `datetime'${startISO}T00:00:00Z'`)
                    .replace(dates[dates.length - 1], `datetime'${endISO}T23:59:59Z'`);
                console.log('%c[DateUnlocker] 🔓 fallback: تم توسيع نطاق التواريخ العام في الطلب!', 'color:#10b981;');
            }
        }
        return out;
    }

    // ============================================================
    //  🔗 دالة مساعدة: استبدال نطاق createdon داخل الـ URL نفسه
    //  (طلبات Dataverse غالباً تحمل الفلتر في الـ query string:
    //   createdon%20ge%20datetime'2026-08-11T00:00:00Z' ... )
    //  تحافظ على الفواصل (%20/+) وصيغة datetime والفواصل العليا
    // ============================================================
    function replaceCreatedonRangeInUrl(urlStr, desired) {
        if (!urlStr || !desired) return urlStr;

        const startISO = toInputDate(desired.startDate);
        const endISO   = toInputDate(desired.endDate);

        // يحفظ: العملية (ge/le) + الفاصل (%20|%20|+|space) + (datetime) + ('|%27) + التاريخ + (Z-portion)
        const URL_DATE_RE = /((?:ge|le))((?:\%20|%20|\+|\s){0,3})((?:datetime)?)(('|%27)?)\d{4}-\d{2}-\d{2}(T\d{2}(?:\%3A|:)\d{2}(?:\%3A|:)\d{2}Z)?\5/gi;

        let out = urlStr.replace(URL_DATE_RE, (match, op, sep, dt, q) => {
            const iso = op.toLowerCase() === 'ge' ? startISO + 'T00:00:00Z' : endISO + 'T23:59:59Z';
            return op + sep + dt + q + iso + q;
        });

        // صيغة نصية بدون URL-encoding (body / params عادية)
        if (out === urlStr) {
            out = urlStr.replace(
                /(createdon\s+ge\s+datetime')([^']*)(')/i,
                `$1${startISO}T00:00:00Z$3`
            );
            out = out.replace(
                /(createdon\s+le\s+datetime')([^']*)(')/i,
                `$1${endISO}T23:59:59Z$3`
            );
        }
        return out;
    }
    const _origXHROpen = XMLHttpRequest.prototype.open;
    const _origXHRSend = XMLHttpRequest.prototype.send;
    const _xhrLog = [];

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        let finalUrl = url;
        // ✅ الاعتراض الجوهري: تعديل فلتر التاريخ في الـ URL قبل الإرسال
        try {
            const s = String(url);
            if (s.toLowerCase().includes('createdon') || s.toLowerCase().includes('$filter') || s.toLowerCase().includes('%24filter')) {
                const desired = getEffectiveRange();
                if (desired) {
                    const replaced = replaceCreatedonRangeInUrl(s, desired);
                    if (replaced !== s) {
                        finalUrl = replaced;
                        console.log('%c[DateUnlocker] 📡🔓 تم توسيع نطاق createdon في XHR URL!', 'color: #10b981; font-weight: bold;', replaced);
                    }
                }
            }
        } catch (e) {}
        this._url = finalUrl;
        return _origXHROpen.apply(this, [method, finalUrl, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const url = this._url || '';
        if (url && (url.includes('incident') || url.includes('order') || url.includes('createdon') || url.includes('filter'))) {
            if (pushUnique(_xhrLog, { url, body, time: new Date().toISOString() }, String(url).slice(0, 300) + '|' + String(body || '').slice(0, 100))) {
                notifyTopFrame('xhr', url, false);
                console.log('%c[DateUnlocker] 📡 XHR:', 'color: #8b5cf6;', url, body);
            }

            if (body && typeof body === 'string' && (body.includes('createdon') || body.includes("datetime'"))) {
                console.log('%c[DateUnlocker] 🎯 فلتر تاريخ في XHR!', 'color: #ef4444;', body);
                window.__dateFilterDetectedXHR = body;

                // ✅ التعديل الجوهري: توسيع نطاق createdon في طلبات XHR أيضاً
                const desired = getEffectiveRange();
                if (desired) {
                    const replaced = replaceCreatedonRange(body, desired);
                    if (replaced !== body) {
                        body = replaced;
                        window.__bodyFilterModified = (window.__bodyFilterModified || 0) + 1;
                        console.log('%c[DateUnlocker] 🔓 تم توسيع نطاق createdon في XHR!', 'color: #10b981; font-weight: bold;', body);
                    }
                }
            }
        }
        return _origXHRSend.call(this, body);
    };

    // ============================================================
    //  🖼️ حقن الاعتراض داخل الـ iframes الداخلية (same-origin)
    //  كل iframe له window.fetch الخاص به — نغلفه بنفس منطق التوسيع
    // ============================================================
    function injectIntoIframes() {
        try {
            const frames = Array.from(document.querySelectorAll('iframe'));
            for (const frame of frames) {
                const win = frame.contentWindow;
                if (!win || win.__eauInjected || win === window) continue;
                // فحص الوصول (same-origin فقط): محاولة قراءة خاصية
                try {
                    const probe = win.location.href;
                    if (!probe) continue;
                } catch (_) { continue; } // cross-origin — نتجاوز

                win.__eauInjected = true;
                const frameFetch = win.fetch;
                if (typeof frameFetch === 'function') {
                    win.fetch = function (...args) {
                        const url = args[0] instanceof Request ? args[0].url : String(args[0] || '');
                        const urlLower = url.toLowerCase();
                        if (urlLower.includes('createdon') || urlLower.includes('$filter') || urlLower.includes('%24filter') || urlLower.includes('entity-grid-data')) {
                            try {
                                const desired = getEffectiveRange();
                                if (desired) {
                                    const replaced = replaceCreatedonRangeInUrl(url, desired);
                                    if (replaced !== url) {
                                        if (args[0] instanceof Request) {
                                            try { args[0] = new Request(replaced, args[0]); } catch (e) { args[0] = replaced; }
                                        } else { args[0] = replaced; }
                                        window.__urlFilterModified = (window.__urlFilterModified || 0) + 1;
                                        notifyTopFrame('fetch', replaced, true);
                                        console.log('%c[DateUnlocker] 🖼️🔓 توسيع createdon في iframe URL!', 'color:#06b6d4;font-weight:bold;', replaced);
                                    }
                                }
                            } catch (e) {}
                        }
                        if (args[1] && args[1].body) {
                            try {
                                let bodyStr = typeof args[1].body === 'string' ? args[1].body : JSON.stringify(args[1].body);
                                if (bodyStr && (bodyStr.includes('createdon') || bodyStr.includes("datetime'"))) {
                                    const desired = getEffectiveRange();
                                    if (desired) {
                                        const replaced = replaceCreatedonRange(bodyStr, desired);
                                        if (replaced !== bodyStr) {
                                            if (typeof args[1].body === 'string') args[1].body = replaced;
                                            else {
                                                try { args[1].body = JSON.parse(replaced); } catch (e) {}
                                            }
                                            window.__bodyFilterModified = (window.__bodyFilterModified || 0) + 1;
                                            notifyTopFrame('fetch', url, true);
                                            console.log('%c[DateUnlocker] 🖼️🔓 توسيع createdon في iframe body!', 'color:#06b6d4;font-weight:bold;');
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        return frameFetch.apply(this, args);
                    };
                }

                const frameXHR = win.XMLHttpRequest;
                if (frameXHR) {
                    const origOpen = frameXHR.prototype.open;
                    const origSend = frameXHR.prototype.send;
                    frameXHR.prototype.open = function (method, url, ...rest) {
                        let finalUrl = String(url || '');
                        if (finalUrl && (finalUrl.includes('createdon') || finalUrl.includes('$filter') || finalUrl.includes('entity-grid-data'))) {
                            try {
                                const desired = getEffectiveRange();
                                if (desired) {
                                    const replaced = replaceCreatedonRangeInUrl(finalUrl, desired);
                                    if (replaced !== finalUrl) {
                                        finalUrl = replaced;
                                        window.__urlFilterModified = (window.__urlFilterModified || 0) + 1;
                                        notifyTopFrame('xhr', replaced, true);
                                        console.log('%c[DateUnlocker] 🖼️🔓 توسيع createdon في iframe XHR URL!', 'color:#06b6d4;font-weight:bold;', replaced);
                                    }
                                }
                            } catch (e) {}
                        }
                        return origOpen.apply(this, [method, finalUrl, ...rest]);
                    };
                    frameXHR.prototype.send = function (body) {
                        if (body && typeof body === 'string' && (body.includes('createdon') || body.includes("datetime'"))) {
                            try {
                                const desired = getEffectiveRange();
                                if (desired) {
                                    const replaced = replaceCreatedonRange(body, desired);
                                    if (replaced !== body) {
                                        body = replaced;
                                        window.__bodyFilterModified = (window.__bodyFilterModified || 0) + 1;
                                        notifyTopFrame('xhr', body, true);
                                        console.log('%c[DateUnlocker] 🖼️🔓 توسيع createdon في iframe XHR body!', 'color:#06b6d4;font-weight:bold;');
                                    }
                                }
                            } catch (e) {}
                        }
                        return origSend.call(this, body);
                    };
                }
                console.log('%c[DateUnlocker] 🖼️ تم حقن الاعتراض في iframe:', 'color:#06b6d4;', frame.src || '(blob)');
            }
        } catch (e) {}
    }

    // ============================================================
    //  ⚡ المرحلة 2: تشغيل الواجهة بعد تحميل الصفحة
    // ============================================================
    window.addEventListener('DOMContentLoaded', initUnlocker);
    // fallback إذا فاتنا DOMContentLoaded
    if (document.readyState !== 'loading') {
        setTimeout(initUnlocker, 500);
    }

    function initUnlocker() {
        // 🛑 الواجهة (FAB + اللوحة) تُبنى في الصفحة الأم فقط — في الـ iframes
        //  نكتفي بالاعتراض (fetch/XHR) الذي يعمل في كل الفريمات
        const isTopFrame = (window.self === window.top || window.parent === window.self);
        if (!isTopFrame) {
            console.log('%c[DateUnlocker] 🎯 iframe داخلي — الاعتراض نشط، الواجهة لن تُبنى هنا', 'color:#8b5cf6;');
            return;
        }
        // 🖼️ حقن الاعتراض في الـ iframes الداخلية (same-origin) مباشرة من الصفحة الأم —
        //  يعمل حتى لو لم يصلها content script (بغض النظر عن all_frames)
        injectIntoIframes();
        setInterval(injectIntoIframes, 5000);
        // استعادة النطاق من الـ URL (بعد إعادة تحميل من زر التطبيق)
        try {
            const url = new URL(window.location.href);
            const ds = url.searchParams.get('dtStart');
            const de = url.searchParams.get('dtEnd');
            if (ds && de) {
                const start = new Date(ds);
                const end = new Date(de);
                if (!isNaN(start) && !isNaN(end)) {
                    window.__desiredRange = { startDate: start, endDate: end, fromUrl: true };
                    console.log('%c[DateUnlocker] 📌 تم استرجاع النطاق من الـ URL:', 'color:#3b82f6;', ds, '→', de);
                }
            }
        } catch (e) {}

        // تأخير بسيط حتى تتحمل عناصر البورتال
        setTimeout(buildUI, 1500);
        // مراقبة تغييرات DOM لاكتشاف فلتر التاريخ فور ظهوره
        startDateFilterObserver();
        // 🛑 لا يوجد تطبيق تلقائي هنا — النطاق المُسترجَع من الـ URL
        //  يُفعَّل عبر اعتراض الطلبات فقط (بدون لمس التقويم الأصلي
        //  وبدون إعادة تحميل) — كان التطبيق التلقائي سبب الحلقة اللانهائية
    }

    // ============================================================
    //  🔍 مراقب DOM: يرصد عنصر dtCreateOnDateRange
    // ============================================================
    function startDateFilterObserver() {
        // 🛑 بدل مراقبة المستند كله (characterData على documentElement كان
        //  يطلق التحليل آلاف المرات لأي تغيير نصي في الصفحة) —
        //  نراقب عنصر الفلتر نفسه فقط (+ فحص دوري حتى يظهر العنصر).
        function watchFilter() {
            const rangeSpan = document.getElementById('dtCreateOnRangeValue');
            if (!rangeSpan) {
                setTimeout(watchFilter, 500);
                return;
            }
            if (!window.__dateFilterCaptured) {
                window.__dateFilterCaptured = rangeSpan.textContent.trim();
                console.log('%c[DateUnlocker] 📅 تم رصد الفلتر الحالي:', 'color:#10b981;', window.__dateFilterCaptured);
                analyzeCurrentFilter(window.__dateFilterCaptured);
                updateFilterDisplay();
            }

            // 🚫 معطّل نهائياً: لا نطبق فلتراً على الجدول أبداً (كان يمسح البلاغات!)
            //  السبب: تطبيق الفلتر (metafilter/نقر زر التطبيق) يجعل السيرفر
            //  يرجع "لا توجد سجلات" — بينما الجدول بدون تطبيق يعرض كل البلاغات.
            //  ✓ الاعتراض على مستوى الطلبات (fetch/XHR/webRequest) يكفي للتوسيع.

            const obs = new MutationObserver(() => {
                const current = rangeSpan.textContent.trim();
                if (window.__lastSeenFilter !== current) {
                    window.__lastSeenFilter = current;
                    analyzeCurrentFilter(current);
                    updateFilterDisplay();
                }
            });

            obs.observe(rangeSpan, { childList: true, characterData: true, subtree: true });
        }

        watchFilter();
    }

    // ============================================================
    //  📊 تحليل الفلتر الحالي
    // ============================================================
    function analyzeCurrentFilter(rangeText) {
        if (!rangeText) return;
        // 🛑 منع إعادة التحليل المتكرر لنفس النطاق (كان يكرر عشرات المرات)
        if (window.__lastAnalyzedRaw === rangeText) return;
        window.__lastAnalyzedRaw = rangeText;
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
        // ✅ تسجيل النطاق المطلوب أولاً — تُعدَّل به كل الطلبات الصادرة
        //  (fetch URL + fetch body + XHR URL + XHR body)
        //  🚫 لا نلمس التقويم الأصلي ولا نضغط أزرار بحث — كان ذلك سبب
        //  فتح التقويم وحلقة إعادة التحميل اللانهائية
        window.__desiredRange = { startDate, endDate, appliedAt: Date.now() };

        const rangeSpan = document.getElementById('dtCreateOnRangeValue');
        if (!rangeSpan) {
            return { success: true, reason: 'النطاق مفعّل عبر اعتراض الطلبات — الفلتر الأصلي غير موجود بعد', interceptOnly: true };
        }

        const newRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;

        // تحديث النص المعروض فقط (بدون إطلاق أي أحداث)
        rangeSpan.textContent = newRangeText;

        updateFilterDisplay();
        return { success: true, newRange: newRangeText, interceptOnly: true };
    }

    // ============================================================
    //  🎯 التطبيق الجذري: ضبط حقول فلتر الجدول (name=4/5) + إطلاق metafilter
    //  (اكتُشف من كود البورتال: زر الفلتر يسلسل حقول EntityListFilterControl
    //   ويطلق حدث metafilter على .entity-grid فيُعاد تحميل الجدول بالفلتر الجديد)
    // ============================================================
    function applyFilterControlExpansion() {
        if (window.self !== window.top) return false;
        const after  = document.getElementById('bk_fld_CreateDateAfter');
        const before = document.getElementById('bk_fld_CreateDateBefore');
        const grid   = document.querySelector('.entity-grid.entitylist');
        const ctrl   = document.getElementById('EntityListFilterControl');
        const submitBtn = document.querySelector('.btn-entitylist-filter-submit[data-serialized-query="mf"]');
        if (!after || !before || !grid || !ctrl) {
            window.__filterControlStatus = 'missing: ' + ['after','before','grid','ctrl'].filter((k, i) => ![
                after, before, grid, ctrl
            ][i]).join(',');
            return false;
        }

        const range = getEffectiveRange();
        if (!range) return false;

        after.value  = formatDate(range.startDate);
        before.value = formatDate(range.endDate);
        // تحديث النص المعروض إن وُجد (التقويم الأصلي) — بدون إطلاق أحداثه
        const rangeSpan = document.getElementById('dtCreateOnRangeValue');
        if (rangeSpan && !rangeSpan.textContent.includes(formatDate(range.startDate))) {
            rangeSpan.textContent = `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
        }

        const serialized = Array.from(ctrl.querySelectorAll('input,select'))
            .map(el => {
                const n = el.name || el.id || '';
                if (!n) return null;
                return encodeURIComponent(n) + '=' + encodeURIComponent(el.value || '');
            })
            .filter(Boolean)
            .join('&');

        let applied = false;
        // 1) الطريقة الرسمية للموقع: نقر زر "تطبيق" الفلتر (يسلسل الحقول ويطلق metafilter)
        if (submitBtn) {
            try { submitBtn.click(); applied = true; } catch (_) {}
        }
        // 2) احتياطي: إطلاق metafilter مباشرة إن لم يوجد الزر
        if (!applied) {
            try {
                if (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) {
                    window.jQuery(grid).trigger('metafilter', serialized);
                    applied = true;
                }
            } catch (_) {}
        }
        if (!applied) {
            try {
                grid.dispatchEvent(new CustomEvent('metafilter', { detail: serialized }));
                applied = true;
            } catch (_) {}
        }

        if (applied) {
            window.__eauFilterControlApplied = true;
            window.__bodyFilterModified = (window.__bodyFilterModified || 0) + 1;
            window.__filterControlStatus = 'OK: ' + serialized.slice(0, 200);
            console.log('%c[DateUnlocker] 🎯 توسيع فلتر الجدول (نقر زر التطبيق):', 'color:#22c55e;font-weight:bold;', serialized);
        } else {
            window.__filterControlStatus = 'trigger-failed';
        }
        return applied;
    }

    // ============================================================
    //  🔃 تطبيق النطاق مع إعادة تحميل اختيارية
    //  @param forceReload — true: يعيد التحميل بالـ URL params مرة واحدة
    //  (مع منع التكرار: لا يعيد التحميل إن كان نفس النطاق مطبقاً بالفعل)
    // ============================================================
    function reloadWithNewRange(startDate, endDate, forceReload) {
        // منع الحلقة: إذا كنا نعيد التحميل بنفس النطاق الذي وصل من الـ URL
        const currentUrl = new URL(window.location.href);
        const urlStart = currentUrl.searchParams.get('dtStart');
        const urlEnd = currentUrl.searchParams.get('dtEnd');
        if (urlStart && urlEnd && toInputDate(startDate) === urlStart && toInputDate(endDate) === urlEnd && currentUrl.searchParams.get('dfApply') === '1') {
            console.log('%c[DateUnlocker] 🛑 هذا النطاق مطبق بالفعل من الـ URL — لن نعيد التحميل (منع الحلقة)', 'color:#ef4444;font-weight:bold;');
            return { success: true, skipped: true, reason: 'النطاق مطبق بالفعل — لا إعادة تحميل' };
        }

        // تطبيق عبر الاعتراض أولاً
        const result = applyNewDateRange(startDate, endDate);

        if (forceReload) {
            currentUrl.searchParams.set('dtStart', toInputDate(startDate));
            currentUrl.searchParams.set('dtEnd', toInputDate(endDate));
            currentUrl.searchParams.set('dfApply', '1');
            console.log('%c[DateUnlocker] 🔄 إعادة تحميل بالنطاق الجديد:', 'color:#3b82f6;', currentUrl.toString());
            window.location.href = currentUrl.toString();
            return { ...result, reloading: true, url: currentUrl.toString() };
        }

        // بدون reload: الاعتراض يعدّل الطلبات تلقائياً من الآن
        showNotif('✅ النطاق مفعّل — الاعتراض يعدّل الطلبات، تحدّث الصفحة يدوياً إن لم تظهر النتائج', 'success');
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
                ? `<span class="eau-badge-orange">futureCases مكتشف: ${originalFuture} ← ✅ رُفع القيد إلى 9999999</span>`
                : `<span class="eau-badge-green">لا قيود futureCases</span>`;
        } else {
            crmStatusEl.innerHTML = `<span class="eau-badge-gray">لم يُحمّل بعد</span>`;
        }

        // تحديث حالة التوسيع التلقائي
        updateAutoExpandStateUI();

        // تحديث عدد الطلبات المعدّلة
        const modCountEl = document.getElementById('eau-modified-count');
        if (modCountEl) {
            const urlMods = window.__urlFilterModified || 0;
            const bodyMods = window.__bodyFilterModified || 0;
            const total = urlMods + bodyMods;
            modCountEl.textContent = `${total} (URL: ${urlMods} / body: ${bodyMods})`;
            modCountEl.className = total > 0 ? 'eau-value eau-badge-green' : 'eau-value eau-badge-orange';
        }

        // تحديث سجل الاعتراض
        updateInterceptLog();
    }

    // ============================================================
    //  📜 تحديث سجل الاعتراض
    // ============================================================
    function updateAutoExpandStateUI() {
        const stateEl = document.getElementById('eau-auto-expand-state');
        if (!stateEl) return;
        const days = window.__autoExpandDays || 0;
        const on = days > 3;
        stateEl.textContent = on ? `مفعّل (+${days} يوم)` : 'معطّل';
        stateEl.className = on ? 'eau-badge-green' : 'eau-badge-gray';
    }

    function updateInterceptLog() {
        const logEl = document.getElementById('eau-intercept-log');
        if (!logEl) return;

        const allLogs = [
            ..._interceptLog.map(l => ({ type: 'crmAccount', ...l })),
            ..._fetchLog.map(l => ({ type: 'fetch', ...l })),
            ..._xhrLog.map(l => ({ type: 'xhr', ...l })),
            ..._frameLog.map(l => ({ type: 'frame', url: `${l.kind} (iframe)`, time: l.time, modified: l.modified }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 30);

        if (allLogs.length === 0) {
            logEl.innerHTML = '<div class="eau-log-empty">لا يوجد طلبات مرصودة بعد...</div>';
            return;
        }

        logEl.innerHTML = allLogs.map(l => {
        const icons = { crmAccount: '⚙️', fetch: '🌐', xhr: '📡', frame: '🖼️' };
        const colors = { crmAccount: '#10b981', fetch: '#f59e0b', xhr: '#8b5cf6', frame: '#06b6d4' };
            const time = new Date(l.time).toLocaleTimeString('ar-EG');

            let content = '';
            if (l.type === 'crmAccount') {
                const fc = l.original.futureCases;
                content = fc ? `futureCases = <b>${fc}</b>` : 'crmAccount بدون futureCases';
            } else {
                content = l.url || '';
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
    //  📤 تجميع التشخيص الكامل (يُرسَل للمطور مباشرة)
    // ============================================================
    function collectDiagnostics() {
        const out = document.getElementById('eau-diagnose-output');
        const copyBtn = document.getElementById('eau-copy-diagnose-btn');
        const parts = [];

        parts.push('=== EL ARABY DATE UNLOCKER — DIAGNOSTICS ===');
        parts.push('Version: ' + (window.__eauVersion || '(unknown)'));
        parts.push('Time: ' + new Date().toISOString());
        parts.push('URL: ' + window.location.href);
        parts.push('');

        parts.push('-- Auto-Expand --');
        parts.push('__autoExpandDays = ' + (window.__autoExpandDays || 0));
        parts.push('__desiredRange = ' + JSON.stringify(window.__desiredRange || null));
        parts.push('__filterAnalysis = ' + JSON.stringify(window.__filterAnalysis || null));
        parts.push('__urlFilterModified = ' + (window.__urlFilterModified || 0));
        parts.push('__bodyFilterModified = ' + (window.__bodyFilterModified || 0));
        parts.push('__filterControlApplied = ' + (window.__eauFilterControlApplied || false));
        parts.push('__filterControlStatus = ' + (window.__filterControlStatus || '(no attempt)'));
        parts.push('');

        parts.push('-- Grid Requests (entity-grid-data) --');
        const grid = window.__gridRequestDetail || [];
        if (grid.length) grid.forEach(g => parts.push(JSON.stringify(g)));
        else parts.push('(none captured)');
        parts.push('');

        parts.push('-- Fetch Log --');
        if (_fetchLog.length) _fetchLog.slice(-10).forEach(l => parts.push(l.url));
        else parts.push('(empty)');
        parts.push('');

        parts.push('-- XHR Log --');
        if (_xhrLog.length) _xhrLog.slice(-10).forEach(l => parts.push(l.url));
        else parts.push('(empty)');
        parts.push('');

        parts.push('-- Frame Log (iframes) --');
        if (_frameLog.length) _frameLog.slice(-10).forEach(l => parts.push(l.kind + ' | ' + l.url + ' | modified=' + l.modified));
        else parts.push('(empty)');
        parts.push('');

        parts.push('-- Page state --');
        parts.push('has dtCreateOnRangeValue: ' + !!document.getElementById('dtCreateOnRangeValue'));
        const rs = document.getElementById('dtCreateOnRangeValue');
        if (rs) parts.push('filter shown: ' + rs.textContent.trim());
        parts.push('tables on page: ' + document.querySelectorAll('table').length);
        parts.push('iframes on page: ' + document.querySelectorAll('iframe').length);
        parts.push('-- Iframes detail --');
        try {
            const frames = Array.from(document.querySelectorAll('iframe'));
            if (frames.length) {
                frames.forEach((f, i) => {
                    let status = '?';
                    try {
                        status = f.contentWindow && f.contentWindow.location ? 'SAME-ORIGIN (accessible)' : 'no contentWindow';
                    } catch (_) { status = 'CROSS-ORIGIN (blocked)'; }
                    parts.push(i + ': ' + (f.src || '(no src)').slice(0, 150) + ' => ' + status);
                });
            } else parts.push('(none)');
        } catch (e) { parts.push('error: ' + e.message); }
        parts.push('rows in first table: ' + (document.querySelector('table tbody') ? document.querySelector('table tbody').rows.length : 'n/a'));
        parts.push('');

        out.value = parts.join('\n');
        out.style.display = 'block';
        copyBtn.style.display = 'inline-block';
        out.scrollTop = 0;
        showNotif('✅ التشخيص جاهز — اضغط نسخ وأرسله لي', 'success');
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
    //  ملاحظة: function declaration (وليست expression) حتى تُرفع hoisted
    //  وتكون متاحة لـ initUnlocker عند document-start
    // ============================================================
    function buildUI() {
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
                <div class="eau-filter-row">
                    <span class="eau-label">طلبات معدّلة:</span>
                    <span id="eau-modified-count" class="eau-value">0</span>
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
            <button id="eau-apply-reload-btn" class="eau-apply-btn" style="margin-top:8px;background:linear-gradient(135deg,#2563eb,#1d4ed8);">🔄 تطبيق النطاق + إعادة تحميل</button>
            <button id="eau-auto-expand-btn" class="eau-scan-btn" style="margin-top:8px;">⚡ وضع التوسيع التلقائي: <span id="eau-auto-expand-state" class="eau-badge-gray">معطّل</span></button>
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

        <!-- إرسال التشخيص -->
        <div class="eau-section">
            <div class="eau-section-title">📤 إرسال التشخيص</div>
            <button id="eau-diagnose-btn" class="eau-scan-btn">📤 تجميع التشخيص الكامل</button>
            <textarea id="eau-diagnose-output" class="eau-date-input" style="width:100%;height:120px;margin-top:6px;font-size:10px;display:none;direction:ltr;text-align:left;" readonly></textarea>
            <button id="eau-copy-diagnose-btn" class="eau-mini-btn" style="margin-top:6px;display:none;">📋 نسخ التشخيص</button>
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
            const result = reloadWithNewRange(startDate, endDate, false);
            showNotif(`✅ ${result.newRange || 'جاري التطبيق...'}`, 'success');
            setTimeout(updateFilterDisplay, 800);
        });

        document.getElementById('eau-apply-reload-btn').addEventListener('click', () => {
            const startVal = document.getElementById('eau-start-date').value;
            const endVal   = document.getElementById('eau-end-date').value;
            if (!startVal || !endVal) { showNotif('⚠️ اختر التواريخ أولاً!', 'warning'); return; }
            const startDate = new Date(startVal);
            const endDate   = new Date(endVal);
            if (startDate > endDate) { showNotif('⚠️ تاريخ البداية يجب أن يكون قبل النهاية!', 'error'); return; }
            reloadWithNewRange(startDate, endDate, true);
        });

        document.getElementById('eau-auto-expand-btn').addEventListener('click', () => {
            const stateEl = document.getElementById('eau-auto-expand-state');
            const currentlyOn = (window.__autoExpandDays || 0) > 3;
            const next = currentlyOn ? 0 : DEFAULT_AUTO_EXPAND_DAYS;
            setAutoExpand(next);
            // الواجهة تُحدَّث بعد إعادة التحميل — التحديث الفوري هنا للاستجابة
            updateAutoExpandStateUI();
        });

        document.getElementById('eau-refresh-log').addEventListener('click', updateInterceptLog);
        document.getElementById('eau-scan-btn').addEventListener('click', scanForHiddenCases);
        document.getElementById('eau-diagnose-btn').addEventListener('click', collectDiagnostics);
        document.getElementById('eau-copy-diagnose-btn').addEventListener('click', () => {
            const out = document.getElementById('eau-diagnose-output');
            if (!out || !out.value) return;
            out.select();
            try { document.execCommand('copy'); showNotif('✅ نُسخ التشخيص — أرسله هنا كما هو', 'success'); } catch (e) { showNotif('حدد النص وانسخه يدوياً (Ctrl+C)', 'warning'); }
        });

        // التواريخ الافتراضية
        const today = new Date();
        const ds = new Date(today); ds.setDate(today.getDate() - 7);
        const de = new Date(today); de.setDate(today.getDate() + 7);
        document.getElementById('eau-start-date').value = toInputDate(ds);
        document.getElementById('eau-end-date').value   = toInputDate(de);

        setTimeout(updateFilterDisplay, 500);
        updateAutoExpandStateUI();
        _filterUpdateIntervals.push(setInterval(updateFilterDisplay, 3000));
    };

    // Cleanup intervals on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        _filterUpdateIntervals.forEach(id => clearInterval(id));
        _filterUpdateIntervals = [];
    });

})();
