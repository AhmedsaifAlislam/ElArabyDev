/**
 * n8n-client.js — عميل n8n الموحد
 * Shared across content scripts / popup
 *
 * يوفّر:
 *   - n8nSend(eventName, payload)         → إرسال حدث إلى Webhook n8n عبر background (proxy)
 *   - n8nEmit(eventName, payload, opts)   → بث عبر ناقل الأحداث (سجل + طابور Outbox)
 *   - n8nFlushOutbox()                    → تفريغ طابور الأحداث
 *   - n8nQueueStatus()                    → حالة الطابور + آخر الأحداث
 *   - n8nAutoExportEnabled()              → هل تفعيل الإرسال التلقائي بعد تصدير Excel؟
 *   - n8nReady()                          → هل تم إعداد n8n؟
 *
 * الإعدادات في chrome.storage.local: { n8n: { webhookUrl, token, autoExport, autoForward, telemetryAI } }
 * الـ background ينفّذ fetch (لا قيود CORS بسبب host_permissions).
 * الأحداث عبر n8nEmit تُخزَّن في طابور Outbox — لا تضيع عند انقطاع الاتصال.
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
   * إرسال حدث إلى Webhook n8n (فوري — بدون طابور)
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
   * بث حدث عبر ناقل الأحداث (Event Bus) — سجل محلي + طابور Outbox
   * موصى به لكل الأحداث التلقائية (لا يفشل مع انقطاع الشبكة).
   * @param {string} eventName - اسم الحدث
   * @param {Object} [payload] - بيانات الحدث
   * @param {Object} [opts] - { force, source, eventId }
   * @returns {Promise<{id:string,event:string,ts:number,queued:boolean}>}
   */
  async function n8nEmit(eventName, payload, opts) {
    // التوكل على ناقل الأحداث مباشرة (تجنب الاستدعاء الذاتي — n8nEmit هنا يحمل نفس الاسم)
    if (global.N8nEventBus && typeof global.N8nEventBus.emit === 'function') {
      return await global.N8nEventBus.emit(eventName, payload || {}, opts);
    }
    // fallback: إرسال مباشر إن لم يكن الـ event bus محمّلاً
    const r = await n8nSend(eventName, payload || {});
    return { id: null, event: eventName, ts: Date.now(), queued: r.ok };
  }

  /**
   * تفريغ طابور الأحداث إلى Webhook n8n
   * @returns {Promise<{ok:boolean,flushed?:number,failed?:number,remaining?:number,error?:string}>}
   */
  async function n8nFlushOutbox() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'N8N_FLUSH' });
      if (resp && resp.ok) {
        return { ok: true, flushed: resp.flushed || 0, failed: resp.failed || 0, remaining: resp.remaining || 0 };
      }
      return { ok: false, error: resp?.error || 'فشل التفريغ' };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * حالة الطابور + آخر الأحداث (للواجهات)
   * @returns {Promise<{ok:boolean,queued?:number,eventLog?:Array,error?:string}>}
   */
  async function n8nQueueStatus() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'N8N_QUEUE_STATUS' });
      if (resp && resp.ok) {
        return { ok: true, queued: resp.queued || 0, eventLog: resp.eventLog || [] };
      }
      return { ok: false, error: resp?.error || 'فشل قراءة الحالة' };
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
  global.n8nEmit = n8nEmit;
  global.n8nFlushOutbox = n8nFlushOutbox;
  global.n8nQueueStatus = n8nQueueStatus;
  global.n8nAutoExportEnabled = n8nAutoExportEnabled;
  global.n8nReady = n8nReady;

  console.log('[N8nClient] ✅ تم تحميل عميل n8n الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);