/**
 * frame-walker.js — المشي في الإطارات (iframes) الموحد
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup
 * يوفّر:
 *   - واجهة عامة: walkFrames, findInFrames, findAllInFrames, getAccessibleDocs
 *   - FrameWalker (getDocs, findElement, findAll, querySelector, querySelectorAll) — واجهة OOP
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyFrameWalkerLoaded) return;
  global.__elarabyFrameWalkerLoaded = true;

  /**
   * جمع كل المستندات القابلة للوصول (document + iframes متداخلة)
   * @param {Document} doc - المستند الجذر (اختياري)
   * @returns {Document[]} المستندات المتاحة
   */
  function getAccessibleDocs(doc = document) {
    const docs = [doc];
    const walk = (current) => {
      const iframes = current.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iDoc) {
            docs.push(iDoc);
            walk(iDoc);
          }
        } catch (_) { /* cross-origin */ }
      }
    };
    walk(doc);
    return docs;
  }

  /**
   * التنقل عبر كل الإطارات مع استدعاء callback لكل مستند
   * @param {Function} callback - (doc, iframe, depth) => void
   * @param {Document} root - المستند الجذر (اختياري)
   */
  function walkFrames(callback, root = document) {
    const walk = (current, iframe, depth) => {
      callback(current, iframe, depth);
      const iframes = current.querySelectorAll('iframe');
      for (const f of iframes) {
        try {
          const iDoc = f.contentDocument || f.contentWindow?.document;
          if (iDoc) walk(iDoc, f, depth + 1);
        } catch (_) { /* cross-origin */ }
      }
    };
    walk(root, null, 0);
  }

  /**
   * البحث عن عنصر واحد عبر كل المستندات
   * @param {string} selector - محدد CSS
   * @param {Document} doc - المستند الجذر (اختياري)
   * @returns {Element|null} العنصر الموجود أو null
   */
  function findInFrames(selector, doc = document) {
    let found = null;
    walkFrames((current) => {
      if (found) return;
      const el = current.querySelector(selector);
      if (el) found = el;
    }, doc);
    return found;
  }

  /**
   * البحث عن كل العناصر المطابقة عبر كل المستندات
   * @param {string} selector - محدد CSS
   * @param {Document} doc - المستند الجذر (اختياري)
   * @returns {Element[]} العناصر المطابقة
   */
  function findAllInFrames(selector, doc = document) {
    const results = [];
    walkFrames((current) => {
      results.push(...current.querySelectorAll(selector));
    }, doc);
    return results;
  }

  /**
   * البحث في مستند محدد + إطارات (حسب العمق)
   * @param {string|string[]} selectors - محدد CSS أو قائمة محددات
   * @param {Object} opts - { root, iframeScope }
   * @returns {Element|null}
   */
  function findElement(selectors, opts = {}) {
    const root = opts.root || document;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      const el = findInFrames(sel, root);
      if (el) return el;
    }
    return null;
  }

  /**
   * جمع كل المستندات (للاستخدام في بناء النصوص/التحليل)
   * @param {Document} doc - المستند الجذر (اختياري)
   * @returns {Document[]}
   */
  global.walkFrames = walkFrames;
  global.getAccessibleDocs = getAccessibleDocs;
  global.findInFrames = findInFrames;
  global.findAllInFrames = findAllInFrames;

  global.FrameWalker = {
    getDocs: getAccessibleDocs,
    findElement,
    findAll: findAllInFrames,
    querySelector: (selector, doc) => findInFrames(selector, doc),
    querySelectorAll: (selector, doc) => findAllInFrames(selector, doc)
  };

  console.log('[FrameWalker] ✅ تم تحميل مشي الإطارات الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);