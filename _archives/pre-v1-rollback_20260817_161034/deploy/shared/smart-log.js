/**
 * smart-log.js — سجل العمليات المشترك الموحد
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، dashboard، background (service worker)
 * التخزين عبر storage-proxy (messages) إن وُجد، وإلا chrome.storage مباشرة (SW/صفحات الإضافة)
 * يوفّر:
 *   - واجهة عامة: logEvent, getLog, clearLog, exportLog
 *   - SmartLog (addEntry, getEntries, clearAll) — لقطع الغيار
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabySmartLogLoaded) return;
  global.__elarabySmartLogLoaded = true;

  const MAX_LOG_ENTRIES = 500;

  // ── طبقة التخزين: storage-proxy (content) أو chrome.storage مباشرة (SW/صفحات) ──
  async function readLog() {
    if (typeof global.storageGet === 'function') {
      const data = await global.storageGet(['smartLog']);
      return data.smartLog || [];
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return await new Promise((resolve) => {
        chrome.storage.local.get({ smartLog: [] }, (data) => resolve(data.smartLog || []));
      });
    }
    return [];
  }

  async function writeLog(log) {
    if (typeof global.storageSet === 'function') {
      await global.storageSet({ smartLog: log });
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => chrome.storage.local.set({ smartLog: log }, resolve));
    }
  }

  function makeEntry(type, details) {
    return {
      type,
      action: type,
      details,
      timestamp: new Date().toISOString(),
      url: (typeof location !== 'undefined' && location.href) ? location.href : ''
    };
  }

  /**
   * تسجيل عملية في السجل
   * @param {string} type - نوع العملية (search, import, inject, cart_add, cart_remove, clear, ...)
   * @param {Object} details - تفاصيل العملية
   */
  global.logEvent = async function(type, details = {}) {
    const entry = makeEntry(type, details);

    try {
      const log = await readLog();
      log.unshift(entry);
      if (log.length > MAX_LOG_ENTRIES) {
        log.length = MAX_LOG_ENTRIES;
      }
      await writeLog(log);
      console.log(`[SmartLog] ${type}:`, details);
    } catch (error) {
      console.warn('[SmartLog] Error logging event:', error);
    }
  };

  /**
   * استرجاع السجل
   * @param {Object} options - خيارات التصفية
   * @param {string} options.filter - نوع التصفية (all, search, import, inject)
   * @param {string} options.search - نص البحث
   * @returns {Promise<Array>} السجلات
   */
  global.getLog = async function(options = {}) {
    const { filter = 'all', search = '' } = options;

    try {
      let log = await readLog();

      // التصفية حسب النوع
      if (filter !== 'all') {
        log = log.filter(entry => entry.type === filter);
      }

      // التصفية حسب النص
      if (search) {
        const searchLower = search.toLowerCase();
        log = log.filter(entry => {
          const detailsStr = JSON.stringify(entry.details).toLowerCase();
          return detailsStr.includes(searchLower);
        });
      }

      return log;
    } catch (error) {
      console.warn('[SmartLog] Error getting log:', error);
      return [];
    }
  };

  /**
   * مسح السجل بالكامل
   */
  global.clearLog = async function() {
    try {
      await writeLog([]);
      console.log('[SmartLog] Log cleared');
    } catch (error) {
      console.warn('[SmartLog] Error clearing log:', error);
    }
  };

  /**
   * تصدير السجل كملف JSON (صفحات فقط)
   */
  global.exportLog = async function() {
    try {
      const log = await global.getLog({ filter: 'all' });
      if (typeof document === 'undefined') return;
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elaraby_log_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('[SmartLog] Error exporting log:', error);
    }
  };

  // ── SmartLog — واجهة قطع الغيار (background + dashboard) ──
  global.SmartLog = {
    addEntry: async function(actionType, details = {}) {
      await global.logEvent(actionType, details);
    },
    getEntries: async function(limit = 500) {
      const log = await global.getLog({ filter: 'all' });
      return log.slice(0, limit);
    },
    clearAll: async function() {
      await global.clearLog();
    }
  };

  console.log('[SmartLog] تم تحميل السجل بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);
