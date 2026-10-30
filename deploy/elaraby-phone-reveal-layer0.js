// elaraby-phone-reveal-layer0.js — Force crmAccount.hideCustomersPhones = false
// Injected at document_start via manifest.json, BEFORE portal JS runs
'use strict';
(function() {
    try {
        // Respect toggle from localStorage (set by tampermonkey-runner on toggle)
        // Check both old flag and new unified flag
        function isDisabled() {
            return localStorage.getItem('elaraby_phone_reveal_disabled') === '1' ||
                   localStorage.getItem('tm_running_elaraby-phone-reveal') === '0';
        }
        
        if (isDisabled()) {
            console.log('[Phone Reveal L0] Disabled via localStorage — waiting for enable signal');
            // تفعيل فوري عند تشغيل السكربت من اللوحة/البوبأب (بدون إعادة تحميل الصفحة)
            window.addEventListener('ea-script-state', function onEnable(e) {
                const d = e && e.detail;
                if (!d || d.scriptId !== 'elaraby-phone-reveal' || !d.running) return;
                window.removeEventListener('ea-script-state', onEnable);
                try { localStorage.setItem('elaraby_phone_reveal_disabled', ''); } catch (_) {}
                console.log('[Phone Reveal L0] Enabled at runtime — activating Layer 0');
                start();
            });
            return;
        }
        start();

        function start() {
        let _crmAccount = null;
        let observerAttached = false;
        let checkInterval = null;
        let iframeObserver = null;

        // ── Source probe (S1) ─────────────────────────────────────
        // نسجّل قيمة البوابة الأصلية لإعداد hideCustomersPhones *قبل* أن نفرضها
        // false، حتى تعرف أدوات أخرى (نافذة استخراج البلاغات) هل الأرقام معروضة
        // من البوابة/الشركة نفسها أم كشفتها هذه الإضافة.
        //   company   = البوابة تعرض الأرقام أصلاً (hideCustomersPhones === false)
        //   extension = البوابة تخفيها وكشفتها الإضافة (true ثم فرضناها false)
        //   unknown   = لم نرَ الإعداد (البوابة لم تصرّح به)
        let _eaOriginalHide = null;
        let _eaForcedByExtension = false;

        function eaPublishSource() {
            try {
                let source = 'unknown';
                if (_eaOriginalHide === false) source = 'company';
                else if (_eaOriginalHide === true || _eaForcedByExtension) source = 'extension';
                const payload = {
                    source: source,
                    portalHideCustomersPhones: _eaOriginalHide,
                    forcedByExtension: _eaForcedByExtension,
                    ts: Date.now()
                };
                window.__eaPhoneSource = payload;
                const el = document.documentElement;
                if (el) {
                    el.setAttribute('data-ea-phones-source', source);
                    el.setAttribute('data-ea-phones-portal-hide', String(_eaOriginalHide));
                    el.setAttribute('data-ea-phones-forced', String(_eaForcedByExtension));
                }
                try { window.dispatchEvent(new CustomEvent('ea-phones-source', { detail: payload })); } catch (_) {}
            } catch (_) {}
        }

        function eaNoteOriginal(value, where) {
            if (_eaOriginalHide !== null || typeof value !== 'boolean') return;
            _eaOriginalHide = value;
            if (value === true) _eaForcedByExtension = true;
            console.log('[Phone Reveal L0] 🔎 Source probe: portal hideCustomersPhones = ' + value + ' (' + where + ')');
            eaPublishSource();
        }

        function forceHidePhones(obj, source = 'unknown') {
            if (obj && typeof obj === 'object' && typeof obj.hideCustomersPhones === 'boolean') {
                eaNoteOriginal(obj.hideCustomersPhones, 'forceHidePhones:' + source);
            }
            if (obj && typeof obj === 'object' && obj.hideCustomersPhones === true) {
                obj.hideCustomersPhones = false;
                console.log('[Phone Reveal L0] 📱 Forced hideCustomersPhones = false (source: ' + source + ')');
                return true;
            }
            return false;
        }

        // Use Proxy to intercept ALL property access on crmAccount
        function createCrmAccountProxy(target) {
            return new Proxy(target, {
                set: function(obj, prop, value) {
                    if (prop === 'hideCustomersPhones') eaNoteOriginal(value, 'proxy-set');
                    if (prop === 'hideCustomersPhones' && value === true) {
                        console.log('[Phone Reveal L0] 🚫 Blocked attempt to set hideCustomersPhones = true');
                        obj[prop] = false;
                        return true;
                    }
                    obj[prop] = value;
                    return true;
                },
                get: function(obj, prop) {
                    if (prop === 'hideCustomersPhones') {
                        return false; // Always return false
                    }
                    return obj[prop];
                }
            });
        }

        // Override property on window with Proxy
        Object.defineProperty(window, 'crmAccount', {
            get: function() {
                if (!_crmAccount) {
                    const defaultObj = { hideCustomersPhones: false };
                    _crmAccount = createCrmAccountProxy(defaultObj);
                }
                return _crmAccount;
            },
            set: function(val) {
                if (val && typeof val === 'object') {
                    forceHidePhones(val, 'direct-set');
                    _crmAccount = createCrmAccountProxy(val);
                } else {
                    _crmAccount = val;
                }
            },
            configurable: true
        });

        // Also protect common alternative names
        const altNames = ['Xrm', 'Xrm.Page'];
        altNames.forEach(name => {
            let _alt = null;
            Object.defineProperty(window, name, {
                get: function() {
                    if (!_alt) {
                        _alt = { hideCustomersPhones: false };
                        _alt = createCrmAccountProxy(_alt);
                    }
                    return _alt;
                },
                set: function(val) {
                    if (val && typeof val === 'object') {
                        forceHidePhones(val, 'alt-set:' + name);
                        _alt = createCrmAccountProxy(val);
                    } else {
                        _alt = val;
                    }
                },
                configurable: true
            });
        });

        // MutationObserver to catch dynamic crmAccount creation
        function setupObserver() {
            if (observerAttached) return;
            observerAttached = true;
            
            const observer = new MutationObserver(() => {
                // Check window.crmAccount
                if (window.crmAccount && window.crmAccount.hideCustomersPhones === true) {
                    window.crmAccount.hideCustomersPhones = false;
                    console.log('[Phone Reveal L0] 📱 MutationObserver caught crmAccount, forced false');
                }
                // Check alternative names
                altNames.forEach(name => {
                    if (window[name] && window[name].hideCustomersPhones === true) {
                        window[name].hideCustomersPhones = false;
                        console.log('[Phone Reveal L0] 📱 MutationObserver caught ' + name + ', forced false');
                    }
                });
            });
            
            // Observe document for any script/style additions that might create crmAccount
            observer.observe(document.documentElement || document, { 
                childList: true, 
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'data-src']
            });
            
            console.log('[Phone Reveal L0] MutationObserver attached');
        }

        // Monitor iframes for crmAccount creation (PowerApps renders in iframes)
        function setupIframeMonitoring() {
            // Check existing iframes
            document.querySelectorAll('iframe').forEach(monitorIframe);
            
            // Watch for new iframes
            iframeObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'IFRAME') {
                            monitorIframe(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('iframe').forEach(monitorIframe);
                        }
                    });
                });
            });
            
            iframeObserver.observe(document.documentElement || document, {
                childList: true,
                subtree: true
            });
        }
        
        function monitorIframe(iframe) {
            // Try to access iframe contentWindow (may fail due to CORS)
            try {
                if (iframe.contentWindow) {
                    // If same origin, we can directly manipulate
                    if (iframe.contentWindow.document) {
                        setupIframeProxy(iframe.contentWindow);
                    }
                }
                // Listen for load event
                iframe.addEventListener('load', () => {
                    try {
                        if (iframe.contentWindow && iframe.contentWindow.document) {
                            setupIframeProxy(iframe.contentWindow);
                        }
                    } catch(e) {
                        // Cross-origin, try postMessage
                        try {
                            iframe.contentWindow.postMessage({ type: 'ELARABY_PHONE_REVEAL_CHECK' }, '*');
                        } catch(e2) {}
                    }
                });
            } catch(e) {
                // Cross-origin iframe - will try postMessage on load
            }
        }
        
        function setupIframeProxy(win) {
            try {
                if (win.crmAccount) {
                    forceHidePhones(win.crmAccount, 'iframe-crmAccount');
                }
                // Define property on iframe window
                Object.defineProperty(win, 'crmAccount', {
                    get: function() {
                        return win._elarabyCrmAccount || { hideCustomersPhones: false };
                    },
                    set: function(val) {
                        if (val && typeof val === 'object') {
                            forceHidePhones(val, 'iframe-set');
                        }
                        win._elarabyCrmAccount = val;
                    },
                    configurable: true
                });
            } catch(e) {
                // Cross-origin, ignore
            }
        }

        // Periodic check as fallback - every 500ms for faster response
        function startPeriodicCheck() {
            if (checkInterval) return;
            checkInterval = setInterval(() => {
                // Check main window
                if (window.crmAccount && window.crmAccount.hideCustomersPhones === true) {
                    window.crmAccount.hideCustomersPhones = false;
                    console.log('[Phone Reveal L0] Periodic check: forced main window crmAccount false');
                }
                // Check alternative names on main window
                altNames.forEach(name => {
                    if (window[name] && typeof window[name] === 'object' && window[name].hideCustomersPhones === true) {
                        window[name].hideCustomersPhones = false;
                        console.log('[Phone Reveal L0] Periodic check: forced ' + name + ' false');
                    }
                });
                // Check parent and top windows (for nested iframes)
                try {
                    if (window.parent && window.parent !== window) {
                        if (window.parent.crmAccount && window.parent.crmAccount.hideCustomersPhones === true) {
                            window.parent.crmAccount.hideCustomersPhones = false;
                            console.log('[Phone Reveal L0] Periodic check: forced parent crmAccount false');
                        }
                    }
                    if (window.top && window.top !== window) {
                        if (window.top.crmAccount && window.top.crmAccount.hideCustomersPhones === true) {
                            window.top.crmAccount.hideCustomersPhones = false;
                            console.log('[Phone Reveal L0] Periodic check: forced top crmAccount false');
                        }
                    }
                } catch(e) {
                    // Cross-origin, ignore
                }
            }, 500); // Faster: 500ms instead of 2000ms
        }

        // Listen for storage changes (when user toggles from popup/dock)
        function setupStorageListener() {
            window.addEventListener('storage', (e) => {
                if (e.key === 'elaraby_phone_reveal_disabled' || e.key === 'tm_running_elaraby-phone-reveal') {
                    console.log('[Phone Reveal L0] Storage changed:', e.key, '->', e.newValue);
                    if (!isDisabled()) {
                        // Re-enabled: re-apply force immediately
                        console.log('[Phone Reveal L0] Re-enabled via storage, re-applying force...');
                        forceHidePhones(window.crmAccount, 'storage-reenable');
                        altNames.forEach(name => forceHidePhones(window[name], 'storage-reenable:' + name));
                    }
                }
            });
        }

        // Listen for postMessage from Layer 1 (UI script)
        function setupMessageListener() {
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'ELARABY_PHONE_REVEAL_FORCE') {
                    console.log('[Phone Reveal L0] Received force message from Layer 1');
                    forceHidePhones(window.crmAccount, 'layer1-message');
                    altNames.forEach(name => forceHidePhones(window[name], 'layer1-message:' + name));
                    // Also check iframes
                    document.querySelectorAll('iframe').forEach(iframe => {
                        try {
                            iframe.contentWindow.postMessage({ type: 'ELARABY_PHONE_REVEAL_FORCE' }, '*');
                        } catch(err) {}
                    });
                }
            });
        }

        // Start when DOM is ready
        function init() {
            setupObserver();
            setupIframeMonitoring();
            startPeriodicCheck();
            setupStorageListener();
            setupMessageListener();
            eaPublishSource();
            console.log('[Phone Reveal L0] ✅ Layer 0 initialized with Proxy + Observer + Iframe monitoring + Storage listener + Message listener + Source probe');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
        }

    } catch(e) {
        console.error('[Phone Reveal L0] Failed:', e);
    }
})();