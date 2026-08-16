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
    } catch(e) {
        console.error('[Phone Reveal] Layer 0 failed:', e);
    }
})();
