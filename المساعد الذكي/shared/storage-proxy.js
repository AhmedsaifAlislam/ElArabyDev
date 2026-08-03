/**
 * storage-proxy.js — الوسيط بين content ↔ background
 * Shared across all El Araby extensions
 * 
 * يحل مشكلة Edge Tracking Prevention
 * كل عمليات التخزين تمر عبر background.js
 */

(async function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyStorageProxyLoaded) return;
  window.__elarabyStorageProxyLoaded = true;

  /**
   * استرجاع بيانات من chrome.storage.local عبر background.js
   * @param {string|string[]} keys - المفاتيح المطلوبة
   * @returns {Promise<Object>} البيانات المسترجعة
   */
  window.storageGet = async function(keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: keyArray }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StorageProxy] storageGet error:', chrome.runtime.lastError.message);
          resolve({});
          return;
        }
        resolve(res?.data || {});
      });
    });
  };

  /**
   * حفظ بيانات في chrome.storage.local عبر background.js
   * @param {Object} data - البيانات المطلوب حفظها
   * @returns {Promise<void>}
   */
  window.storageSet = async function(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'STORAGE_SET', data }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StorageProxy] storageSet error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  };

  /**
   * حذف مفاتيح من chrome.storage.local عبر background.js
   * @param {string[]} keys - المفاتيح المطلوب حذفها
   * @returns {Promise<void>}
   */
  window.storageRemove = async function(keys) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'STORAGE_REMOVE', keys }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StorageProxy] storageRemove error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  };

  /**
   * إرسال رسالة عامة لـ background.js
   * @param {string} action - اسم الإجراء
   * @param {Object} extra - بيانات إضافية
   * @returns {Promise<any>}
   */
  window.bg = function(action, extra = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, ...extra }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[StorageProxy] bg error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(res);
      });
    });
  };

  console.log('[StorageProxy] ✅ تم تحميل الوسيط بنجاح');

})();
