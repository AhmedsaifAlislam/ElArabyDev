/**
 * n8n-event-bus.js — ناقل الأحداث الموحد + طابور الإرسال (Outbox) لـ n8n
 * Shared across content scripts / popup / background
 *
 * يوفّر:
 *   - n8nRegisterEvent(name, spec)        → تسجيل حدث في السجل الرسمي
 *   - n8nEmit(eventName, data, opts)      → بث حدث: سجل محلي + طابور Outbox (إن فُعّل)
 *   - n8nFlushOutbox()                    → تفريغ الطابور إلى Webhook n8n (retry + backoff)
 *   - n8nQueueStatus()                    → حالة الطابور + آخر الأحداث
 *
 * مفاهيم:
 *   - Outbox (chrome.storage.local): أحداث تنتظر الإرسال — لا تضيع إذا انقطع الاتصال.
 *   - Event Log (chrome.storage.local): سجل آخر الأحداث محلياً (حتى بدون n8n).
 *   - كل حدث له معرّف فريد (eventId) → الـ webhook في n8n يكشف التكرار.
 *   - الحد الأقصى: 100 حدث في الطابور / 200 حدث في السجل / 5 محاولات لكل حدث.
 *
 * يعمل في أي سياق: content scripts عبر storageGet/storageSet proxy،
 * popup و background عبر chrome.storage المباشر.
 */

(function(global) {
  'use strict';

  if (global.__elarabyN8nEventBusLoaded) return;
  global.__elarabyN8nEventBusLoaded = true;

  const OUTBOX_KEY = 'n8nOutbox';
  const EVENT_LOG_KEY = 'n8nEventLog';
  const QUEUE_META_KEY = 'n8nQueueMeta';
  const OUTBOX_MAX = 100;
  const EVENT_LOG_MAX = 200;
  const MAX_ATTEMPTS = 5;

  // ── سجل الأحداث الرسمي (Event Registry) ──
  // spec: { autoForward: bool (هل يُرسل تلقائياً إن وُجد webhook؟), description }
  const EVENT_REGISTRY = {};

  function n8nRegisterEvent(name, spec) {
    if (!name) return;
    EVENT_REGISTRY[String(name)] = {
      autoForward: !(spec && spec.autoForward === false),
      description: (spec && spec.description) || ''
    };
  }

  // أحداث افتراضية موثقة — قابلة للتوسع من أي وحدة
  const DEFAULT_EVENTS = [
    ['excel_export', 'تصدير ملف Excel (xlsx/csv) من أي صفحة'],
    ['session_log', 'سجل الجلسات الذكي'],
    ['telemetry_summary', 'ملخص تحليل السلوك'],
    ['test', 'اختبار اتصال يدوي من الإضافة'],
    ['ai_call', 'طلب ذكاء اصطناعي ناجح'],
    ['ai_failed', 'طلب ذكاء اصطناعي فاشل'],
    ['booking_done', 'اكتمال حجز/تعبئة بلاغ'],
    ['report_saved', 'حفظ تقرير تلقائي'],
    ['order_extracted', 'استخراج أمر عمل'],
    ['smart_log_event', 'حدث من اللوج الذكي (تعديل/خطأ/شبكة)'],
    ['smart_log_batch', 'دفعة أحداث اللوج الذكي (ملخص دوري)']
  ];
  DEFAULT_EVENTS.forEach(([name, desc]) => n8nRegisterEvent(name, { autoForward: true, description: desc }));

  // ── طبقة التخزين (تتأقلم مع السياق) ──
  async function read(key, def) {
    if (typeof global.storageGet === 'function') {
      try {
        const d = await global.storageGet({ [key]: def });
        return (d && key in d) ? d[key] : def;
      } catch (_) {}
    }
    try {
      const d = await chrome.storage.local.get({ [key]: def });
      return (d && key in d) ? d[key] : def;
    } catch (_) {}
    return def;
  }

  async function write(key, val) {
    if (typeof global.storageSet === 'function') {
      try { await global.storageSet({ [key]: val }); return; } catch (_) {}
    }
    try { await chrome.storage.local.set({ [key]: val }); } catch (_) {}
  }

  async function getN8nConfig() {
    const d = await read('n8n', {});
    return d || {};
  }

  function makeEventId() {
    return 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * بث حدث: يسجله محلياً دائماً + يضيفه للطابور إن كان webhook مُعدّاً
   * @param {string} eventName - اسم الحدث (من السجل الرسمي أو مخصص)
   * @param {Object} [data] - بيانات الحدث
   * @param {Object} [opts] - { force: bool (إرسال حتى لو autoForward=false), eventId, source }
   * @returns {Promise<{id:string,event:string,ts:number,queued:boolean}>}
   */
  async function n8nEmit(eventName, data, opts = {}) {
    const evt = {
      id: opts.eventId || makeEventId(),
      event: String(eventName || 'unknown'),
      data: data || {},
      ts: Date.now(),
      source: opts.source || 'unified-extension',
      attempts: 0
    };

    // 1) السجل المحلي — يُسجَّل دائماً (مرجع للتدقيق حتى بدون n8n)
    try {
      const log = await read(EVENT_LOG_KEY, []);
      log.unshift({ id: evt.id, event: evt.event, ts: evt.ts });
      if (log.length > EVENT_LOG_MAX) log.length = EVENT_LOG_MAX;
      await write(EVENT_LOG_KEY, log);
    } catch (_) {}

    // 2) الطابور — فقط إن كان webhook مُعدّاً + الحدث يسمح بالإرسال
    const spec = EVENT_REGISTRY[evt.event] || { autoForward: true };
    const cfg = await getN8nConfig();
    const allowAuto = (cfg.autoForward !== false);
    if (cfg.webhookUrl && spec.autoForward !== false && allowAuto && !opts._noQueue) {
      try {
        const outbox = await read(OUTBOX_KEY, []);
        if (!outbox.some(e => e.id === evt.id)) {
          outbox.push(evt);
          if (outbox.length > OUTBOX_MAX) outbox.splice(0, outbox.length - OUTBOX_MAX);
          await write(OUTBOX_KEY, outbox);
        }
      } catch (_) {}
    }

    return { id: evt.id, event: evt.event, ts: evt.ts, queued: !!cfg.webhookUrl };
  }

  /**
   * تفريغ طابور الأحداث إلى Webhook n8n (كل حدث عبر background N8N_SEND)
   * - النجاح: يُحذف من الطابور
   * - الفشل: يزداد عدد المحاولات (إلى 5) ثم يُتخلى عنه بعد ذلك
   * @returns {Promise<{flushed:number,failed:number,remaining:number,reason?:string}>}
   */
  async function n8nFlushOutbox() {
    const cfg = await getN8nConfig();
    if (!cfg.webhookUrl) return { flushed: 0, failed: 0, remaining: 0, reason: 'no-webhook' };

    const outbox = await read(OUTBOX_KEY, []);
    if (!outbox.length) {
      await write(QUEUE_META_KEY, { lastFlush: Date.now(), flushed: 0, failed: 0 });
      return { flushed: 0, failed: 0, remaining: 0 };
    }

    const kept = [];
    let flushed = 0;
    let failed = 0;
    for (const evt of outbox) {
      let res = null;
      try {
        res = await chrome.runtime.sendMessage({
          type: 'N8N_SEND',
          payload: { event: evt.event, data: evt.data, ts: evt.ts, eventId: evt.id }
        });
      } catch (e) {
        res = { ok: false, error: 'NO_BACKGROUND' };
      }
      if (res && res.ok) { flushed++; continue; }
      evt.attempts = (evt.attempts || 0) + 1;
      if (evt.attempts < MAX_ATTEMPTS) kept.push(evt);
      else failed++;
    }

    await write(OUTBOX_KEY, kept);
    await write(QUEUE_META_KEY, { lastFlush: Date.now(), flushed, failed, remaining: kept.length });
    return { flushed, failed, remaining: kept.length };
  }

  /**
   * حالة الطابور + آخر الأحداث (للواجهات)
   * @returns {Promise<{queued:number,lastFlush:number|null,eventLog:Array,attempts:Object}>}
   */
  async function n8nQueueStatus() {
    const [outbox, meta, log] = await Promise.all([
      read(OUTBOX_KEY, []),
      read(QUEUE_META_KEY, {}),
      read(EVENT_LOG_KEY, [])
    ]);
    const attempts = {};
    (outbox || []).forEach(e => { attempts[e.event] = (attempts[e.event] || 0) + 1; });
    return {
      queued: (outbox || []).length,
      lastFlush: (meta && meta.lastFlush) || null,
      eventLog: (log || []).slice(0, 30)
    };
  }

  // واجهة عامة
  global.n8nRegisterEvent = n8nRegisterEvent;
  global.n8nEmit = n8nEmit;
  global.n8nFlushOutbox = n8nFlushOutbox;
  global.n8nQueueStatus = n8nQueueStatus;

  global.N8nEventBus = {
    register: n8nRegisterEvent,
    emit: n8nEmit,
    flush: n8nFlushOutbox,
    status: n8nQueueStatus,
    REGISTRY: EVENT_REGISTRY
  };

  console.log('[N8nEventBus] ✅ تم تحميل ناقل الأحداث + طابور n8n بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);
