/**
 * smart-log.js — سجل العمليات المشترك
 * Shared across all El Araby extensions
 * 
 * يسجل كل العمليات (بحث، استيراد، حقن، إلخ)
 * يعمل عبر background.js (Edge Tracking Prevention)
 */

(async function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabySmartLogLoaded) return;
  window.__elarabySmartLogLoaded = true;

  const MAX_LOG_ENTRIES = 500;

  /**
   * تسجيل عملية في السجل
   * @param {string} type - نوع العملية (search, import, inject, cart_add, cart_remove, clear)
   * @param {Object} details - تفاصيل العملية
   */
  window.logEvent = async function(type, details = {}) {
    const entry = {
      type,
      details,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    try {
      // استرجاع السجل الحالي
      const data = await storageGet(['smartLog']);
      const log = data.smartLog || [];
      
      // إضافة العملية الجديدة
      log.unshift(entry);
      
      // الحد الأقصى للسجلات
      if (log.length > MAX_LOG_ENTRIES) {
        log.length = MAX_LOG_ENTRIES;
      }
      
      // حفظ السجل
      await storageSet({ smartLog: log });
      
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
  window.getLog = async function(options = {}) {
    const { filter = 'all', search = '' } = options;
    
    try {
      const data = await storageGet(['smartLog']);
      let log = data.smartLog || [];
      
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
  window.clearLog = async function() {
    try {
      await storageSet({ smartLog: [] });
      console.log('[SmartLog] Log cleared');
    } catch (error) {
      console.warn('[SmartLog] Error clearing log:', error);
    }
  };

  /**
   * تصدير السجل كملف JSON
   */
  window.exportLog = async function() {
    try {
      const log = await window.getLog({ filter: 'all' });
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

  console.log('[SmartLog] ✅ تم تحميل السجل بنجاح');

})();
