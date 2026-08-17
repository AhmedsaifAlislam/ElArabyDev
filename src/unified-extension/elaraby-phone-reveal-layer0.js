// elaraby-phone-reveal-layer0.js — Force crmAccount.hideCustomersPhones = false
// Injected at document_start via manifest.json, BEFORE portal JS runs
'use strict';
(function() {
    try {
        // Respect toggle from localStorage (set by tampermonkey-runner on toggle)
        if (localStorage.getItem('elaraby_phone_reveal_disabled') === '1') return;

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
