// elaraby-phone-reveal-layer0.js — Force crmAccount.hideCustomersPhones = false
// Injected at document_start via manifest.json, BEFORE portal JS runs
'use strict';
(function() {
    try {
        // Respect toggle from localStorage (set by tampermonkey-runner on toggle)
        if (localStorage.getItem('elaraby_phone_reveal_disabled') === '1') return;
        // بروتوكول الإيقاف الدائم: tm_running_<id> = '0' يوقف الكشف حتى بعد تحديث الصفحة
        if (localStorage.getItem('tm_running_elaraby-phone-reveal') === '0') return;

        let _crmAccount = null;
        Object.defineProperty(window, 'crmAccount', {
            get: function() {
                if (!_crmAccount) return { hideCustomersPhones: false };
                return _crmAccount;
            },
            set: function(val) {
                if (val && typeof val === 'object') {
                    val.hideCustomersPhones = false;
                    console.log('[Phone Reveal] 📱 crmAccount.hideCustomersPhones = false');
                }
                _crmAccount = val;
            },
            configurable: true
        });

        // ─────────────────────────────────────────────────────────────
        // 🛡️ LOOKUP WIPE SHIELD (MAIN world — يرى كل الكود بما فيه البوابة)
        // البوابة (jQuery preform bundle) تمسح حقول lookup عند التحميل ثم تعيد ملأها؛
        // أحياناً تفشل إعادة الملء فتبقى الحقول فاضية رغم أن القيم محفوظة في البلاغ.
        // الحماية: خلال أول 10 ثوانٍ من التحميل، منع مسح قيمة حقيقية إلى فارغة.
        // بعد 10 ثوانٍ نسمح (المستخدم قد يريد المسح اليدوي).
        // ─────────────────────────────────────────────────────────────
        const WATCH_IDS = ['ats_producttypebrand_name', 'ldv_actualmodel_name', 'ldv_serialnumber', 'ldv_serialnumber1', 'ldv_actualmodel2_name', 'ldv_producttype_name', 'ldv_warrantystatus'];
        // hidden lookup GUID inputs (بدون _name) — نراقبها للتشخيص
        const WATCH_HIDDEN = ['ats_producttypebrand', 'ldv_actualmodel', 'ldv_actualmodel2', 'ldv_producttype', 'ldv_warrantystatus'];
        const SHIELD_WINDOW_MS = 10000;
        const bootTime = Date.now();
        let active = false, blocked = 0, allowedSets = 0;
        try {
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            const origSet = desc && desc.set;
            const origGet = desc && desc.get;
            if (origSet && origGet) {
                Object.defineProperty(HTMLInputElement.prototype, 'value', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return origGet.call(this); },
                    set: function(v) {
                        try {
                            if (this && this.id && (WATCH_IDS.includes(this.id) || WATCH_HIDDEN.includes(this.id))) {
                                const old = origGet.call(this);
                                const nv = String(v == null ? '' : v).trim();
                                const ov = String(old == null ? '' : old).trim();
                                const shielded = (Date.now() - bootTime) < SHIELD_WINDOW_MS;
                                if (ov.length > 0 && nv.length === 0) {
                                    const stack = new Error().stack || '';
                                    const src = (stack.split('\n')[2] || '').trim() || '(unknown)';
                                    if (shielded) {
                                        blocked++;
                                        console.warn('[WIPE-SHIELD] 🛡️ BLOCKED clear on #' + this.id + ' (was "' + ov.slice(0, 60) + '") within ' + SHIELD_WINDOW_MS + 'ms window | from: ' + src);
                                        if (blocked <= 3) console.warn('[WIPE-SHIELD] 📜 stack:', stack.split('\n').slice(0, 6).join('\n'));
                                        return; // امنع المسح
                                    } else {
                                        console.warn('[WIPE-SHIELD] 🕓 clear allowed after window on #' + this.id + ' (was "' + ov.slice(0, 60) + '") | from: ' + src);
                                    }
                                } else if (ov !== nv) {
                                    allowedSets++;
                                    const stack = new Error().stack || '';
                                    const src = (stack.split('\n')[2] || '').trim() || '(unknown)';
                                    if (allowedSets <= 20) console.log('[WIPE-SHIELD] ✏️ SET #' + this.id + ' → "' + nv.slice(0, 60) + '" | from: ' + src);
                                }
                            }
                        } catch (_) {}
                        return origSet.call(this, v);
                    }
                });
                active = true;
                console.log('[WIPE-SHIELD] 🟢 shield active on critical fields (window ' + SHIELD_WINDOW_MS + 'ms)');
            }
        } catch (e) {
            console.error('[WIPE-SHIELD] ❌ failed to install:', e);
        }
        window.__WIPE_SHIELD = { active, watchIds: WATCH_IDS, watchHidden: WATCH_HIDDEN, windowMs: SHIELD_WINDOW_MS, blocked, allowedSets };
    } catch(e) {
        console.error('[Phone Reveal] Layer 0 failed:', e);
    }
})();