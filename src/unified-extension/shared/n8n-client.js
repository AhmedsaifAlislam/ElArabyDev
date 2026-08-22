/**
 * n8n-client.js — عميل n8n الموحد
 * Shared across content scripts / popup
 *
 * يوفّر:
 *   - n8nSend(eventName, payload)         → إرسال حدث إلى Webhook n8n عبر background (proxy)
 *   - n8nAutoExportEnabled()              → هل تفعيل الإرسال التلقائي بعد تصدير Excel؟
 *
 * الإعدادات في chrome.storage.local: { n8n: { webhookUrl, token, autoExport } }
 * الـ background ينفّذ fetch (لا قيود CORS بسبب host_permissions).
 */

(function(global) {
  'use strict';

  if (global.__elarabyN8nClientLoaded) return;
  global.__elarabyN8nClientLoaded = true;

  async function getConfig() {
    try {
      const { n8n = {} } = await chrome.storage.local.get({ n8n: {} });
      return n8n;
    } catch (_) {
      return {};
    }
  }

  /**
   * إرسال حدث إلى Webhook n8n
   * @param {string} eventName - اسم الحدث (excel_export, session_log, telemetry_summary, test...)
   * @param {Object} [payload] - بيانات الحدث
   * @returns {Promise<{ok:boolean,status?:number,error?:string}>}
   */
  async function n8nSend(eventName, payload) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'N8N_SEND',
        payload: { event: eventName, data: payload || {}, ts: Date.now() }
      });
      if (resp && resp.ok) return { ok: true, status: resp.status };
      return { ok: false, error: resp?.error || resp?.message || 'فشل الإرسال' };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * هل الإرسال التلقائي بعد التصدير مفعّل؟
   * @returns {Promise<boolean>}
   */
  async function n8nAutoExportEnabled() {
    const cfg = await getConfig();
    return !!(cfg.webhookUrl && cfg.autoExport);
  }

  /**
   * هل تم إعداد n8n؟
   * @returns {Promise<boolean>}
   */
  async function n8nReady() {
    const cfg = await getConfig();
    return !!cfg.webhookUrl;
  }

  // واجهة عامة
  global.n8nSend = n8nSend;
  global.n8nAutoExportEnabled = n8nAutoExportEnabled;
  global.n8nReady = n8nReady;

  console.log('[N8nClient] ✅ تم تحميل عميل n8n الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);