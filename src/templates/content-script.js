/**
 * content-script.js — قالب Content Script
 * Template for El Araby Extensions
 * 
 * يعمل على صفحات البورتال ويتفاعل مع DOM
 */

(async function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyContentScriptLoaded) return;
  window.__elarabyContentScriptLoaded = true;

  console.log('[ContentScript] ✅ تم التحميل على:', window.location.href);

  // ═══════════════════════════════════════════════════
  // الإعدادات
  // ═══════════════════════════════════════════════════

  const CONFIG = {
    // يمكن تخصيصه حسب الإضافة
    enabled: true,
    debug: true
  };

  // ═══════════════════════════════════════════════════
  // التهيئة
  // ═══════════════════════════════════════════════════

  async function init() {
    if (!CONFIG.enabled) {
      console.log('[ContentScript] Disabled');
      return;
    }

    // انتظار تحميل DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  function onReady() {
    console.log('[ContentScript] DOM ready');
    
    // إضافة واجهة المستخدم
    injectUI();
    
    // إعداد المراقبين
    setupObservers();
    
    // ربط الأحداث
    bindEvents();
  }

  // ═══════════════════════════════════════════════════
  // واجهة المستخدم
  // ═══════════════════════════════════════════════════

  function injectUI() {
    // يمكن تخصيصه حسب الإضافة
    console.log('[ContentScript] Injecting UI...');
    
    // مثال: إضافة زر عائم
    /*
    const btn = document.createElement('button');
    btn.id = 'elaraby-fab';
    btn.innerHTML = '🚀';
    btn.onclick = handleClick;
    document.body.appendChild(btn);
    */
  }

  // ═══════════════════════════════════════════════════
  // المراقبون
  // ═══════════════════════════════════════════════════

  function setupObservers() {
    // مراقبة تغييرات DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          handleDOMChange(mutation);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function handleDOMChange(mutation) {
    // يمكن تخصيصه حسب الإضافة
    if (CONFIG.debug) {
      console.log('[ContentScript] DOM changed:', mutation.type);
    }
  }

  // ═══════════════════════════════════════════════════
  // الأحداث
  // ═══════════════════════════════════════════════════

  function bindEvents() {
    // يمكن تخصيصه حسب الإضافة
    console.log('[ContentScript] Events bound');
  }

  function handleClick() {
    // يمكن تخصيصه حسب الإضافة
    console.log('[ContentScript] Button clicked');
  }

  // ═══════════════════════════════════════════════════
  // دوال مساعدة
  // ═══════════════════════════════════════════════════

  /**
   * البحث عن عنصر في document + iframes
   */
  function findElement(selector, doc = document) {
    let element = doc.querySelector(selector);
    if (element) return element;

    const iframes = doc.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        element = findElement(selector, iDoc);
        if (element) return element;
      } catch (e) {
        // cross-origin
      }
    }

    return null;
  }

  /**
   * إرسال رسالة لـ background.js
   */
  function sendMessage(type, data = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ContentScript] Send message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // البدء
  // ═══════════════════════════════════════════════════

  init();

})();
