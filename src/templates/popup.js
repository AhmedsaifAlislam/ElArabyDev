/**
 * popup.js — قالب واجهة البوبداب
 * Template for El Araby Extensions
 */

(async function() {
  'use strict';

  // ═══════════════════════════════════════════════════
  // التهيئة
  // ═══════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    initButtons();
    loadStatus();
  });

  // ═══════════════════════════════════════════════════
  // الأزرار
  // ═══════════════════════════════════════════════════

  function initButtons() {
    document.getElementById('btn-action').addEventListener('click', handleAction);
    document.getElementById('btn-settings').addEventListener('click', handleSettings);
  }

  // ═══════════════════════════════════════════════════
  // الحالة
  // ═══════════════════════════════════════════════════

  async function loadStatus() {
    const statusEl = document.getElementById('status');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('error', 'لا يوجد تبويب نشط');
        return;
      }
      
      const isPortal = tab.url && (
        tab.url.includes('elarabyportalpfs.powerappsportals.com') ||
        tab.url.includes('elarabyiscrm2.azurewebsites.net')
      );
      
      if (!isPortal) {
        showStatus('warning', 'الصفحة ليست بوابة العربية');
        return;
      }
      
      showStatus('success', 'متصل بالبورتال');
      
    } catch (error) {
      showStatus('error', 'خطأ: ' + error.message);
    }
  }

  function showStatus(type, message) {
    const statusEl = document.getElementById('status');
    statusEl.className = `status status-${type}`;
    statusEl.textContent = message;
  }

  // ═══════════════════════════════════════════════════
  // الأحداث
  // ═══════════════════════════════════════════════════

  async function handleAction() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('error', 'لا يوجد تبويب نشط');
        return;
      }
      
      // يمكن تخصيصه حسب الإضافة
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // الكود المُنفذ في الصفحة
          return { success: true, message: 'تم التنفيذ بنجاح' };
        }
      });
      
      if (results && results[0] && results[0].result) {
        showStatus('success', results[0].result.message);
      } else {
        showStatus('error', 'فشل في التنفيذ');
      }
      
    } catch (error) {
      showStatus('error', 'خطأ: ' + error.message);
    }
  }

  function handleSettings() {
    // يمكن تخصيصه حسب الإضافة
    showStatus('warning', 'الإعدادات قيد التطوير');
  }

})();
