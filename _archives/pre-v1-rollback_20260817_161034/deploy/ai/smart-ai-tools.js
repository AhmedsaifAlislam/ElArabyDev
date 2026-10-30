// ai/smart-ai-tools.js — أدوات AI ذكية موحدة (Tool Registry v2)
// تسجّل أدوات في الـ Tool Registry الموحد (shared/ai-client.js) لقراءة:
//   - read_smart_log            → سجل الأحداث الذكي (أخطاء/أحداث/تغييرات)
//   - read_validation_patterns  → أنماط التحقق المكررة من البورتال
//   - get_page_state            → حالة الصفحة الحالية (نوعها وحقولها)
//   - read_event_log            → آخر أحداث الإضافة (سجل n8n المحلي)
//   - emit_n8n_event            → بث حدث إلى n8n عبر ناقل الأحداث
//   - get_usage_stats           → إحصائيات استخدام الذكاء الاصطناعي
//   - list_ai_tools             → قائمة الأدوات المتاحة حالياً
// هذه الأدوات هي خامة "التعلم الذاتي": الـ AI يقرأ تاريخ الأخطاء والأنماط
// المكررة ثم يقرر أفضل سلوك للتعبئة، ويبث أحداثاً للأنظمة الخارجية (n8n).

(function(global) {
  'use strict';

  if (global.__elarabySmartAIToolsLoaded) return;
  global.__elarabySmartAIToolsLoaded = true;

  function register(name, description, run, parameters) {
    if (typeof global.aiRegisterTool !== 'function') return;
    global.aiRegisterTool(name, description, run, parameters || null);
  }

  async function storageRead(keys) {
    if (typeof global.storageGet === 'function') {
      return await global.storageGet(keys);
    }
    try {
      return await chrome.storage.local.get(keys);
    } catch (_) {
      const out = {};
      Object.keys(keys).forEach(k => { out[k] = keys[k]; });
      return out;
    }
  }

  function boot() {
    register('read_smart_log',
      'يقرأ سجل الأحداث الذكي للجلسة.',
      async (args) => {
        const kind = (args && args.kind) || 'errors';
        const limit = Math.min((args && args.limit) || 30, 50);
        const keys = { slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [], slNetwork: [] };
        const data = await storageRead(keys);
        const map = { errors: data.slErrors, events: data.slEvents, manual: data.slManualChanges, automated: data.slAutomatedChanges, network: data.slNetwork };
        const list = map[kind] || [];
        return { kind, total: list.length, recent: list.slice(-limit) };
      },
      {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['errors', 'events', 'manual', 'automated', 'network'], description: 'نوع السجل (افتراضي errors)' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'عدد العناصر (افتراضي 30)' }
        }
      });

    register('read_validation_patterns',
      'يقرأ أنماط التحقق المكررة (رسائل رفض متكررة من البورتال توضح حقولاً مشكلة).',
      async (args) => {
        const limit = Math.min((args && args.limit) || 20, 50);
        const data = await storageRead({ validationPatterns: [] });
        const list = data.validationPatterns || [];
        return { total: list.length, recent: list.slice(-limit) };
      },
      {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'عدد العناصر (افتراضي 20)' }
        }
      });

    register('get_page_state',
      'يعيد وصف الصفحة الحالية: نوعها، معلومات البلاغ المفتوح (من الرابط والعنوان)، وحقولها المرئية. بدون وسائط.',
      async () => {
        const state = { url: global.location ? global.location.href : '' };
        try {
          const url = new URL(state.url);
          state.incidentId = url.searchParams.get('id') || null;
          state.page = url.pathname.split('/').filter(Boolean)[0] || null;
        } catch (_) {}
        if (typeof global.getPageInfo === 'function') {
          try { state.pageInfo = global.getPageInfo(); } catch (_) {}
        }
        if (global.PORTAL_CONFIG && global.PORTAL_CONFIG.PAGES) {
          state.knownPages = Object.keys(global.PORTAL_CONFIG.PAGES);
        }
        if (typeof global.getSapKeywords === 'function') {
          try { state.sapKeywords = global.getSapKeywords().slice(0, 20); } catch (_) {}
        }
        const titleEl = document.querySelector('#ats_title, input[name="ats_title"], h1, .page-title');
        if (titleEl) state.title = String(titleEl.value || titleEl.innerText || '').slice(0, 150);
        return state;
      });

    register('read_event_log',
      'يقرأ آخر أحداث الإضافة (السجل المحلي لناقل الأحداث) — تصدير، حجز، أخطاء AI. مفيد لفهم ما حدث مؤخراً.',
      async (args) => {
        const limit = Math.min((args && args.limit) || 20, 50);
        if (typeof global.n8nQueueStatus === 'function') {
          const st = await global.n8nQueueStatus();
          return { total: (st.eventLog || []).length, recent: (st.eventLog || []).slice(0, limit) };
        }
        const data = await storageRead({ n8nEventLog: [] });
        const list = data.n8nEventLog || [];
        return { total: list.length, recent: list.slice(0, limit) };
      },
      {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'عدد الأحداث (افتراضي 20)' }
        }
      });

    register('emit_n8n_event',
      'يبث حدثاً إلى n8n عبر ناقل الأحداث (يُسجَّل محلياً دائماً + طابور Outbox إن كان webhook مُعدّاً).',
      async (args) => {
        const event = args && args.event;
        if (!event) return { ok: false, error: 'يجب تحديد اسم الحدث (event)' };
        if (typeof global.n8nEmit === 'function') {
          const res = await global.n8nEmit(event, (args && args.data) || {}, { source: 'ai-tool' });
          return { ok: true, event: res.event, queued: res.queued, id: res.id };
        }
        return { ok: false, error: 'ناقل الأحداث غير محمّل' };
      },
      {
        type: 'object',
        properties: {
          event: { type: 'string', description: 'اسم الحدث (مثال: ai_call, booking_done, excel_export)' },
          data: { type: 'object', description: 'بيانات الحدث (اختياري)' }
        },
        required: ['event']
      });

    register('get_usage_stats',
      'إحصائيات استخدام الذكاء الاصطناعي: عدد الطلبات، التوكنز، النجاح/الفشل، حسب النموذج. بدون وسائط.',
      async () => {
        if (typeof global.aiGetUsage === 'function') {
          const res = await global.aiGetUsage();
          return res.ok ? res.stats : { error: res.error };
        }
        return { error: 'غير متاح في هذا السياق' };
      });

    register('list_ai_tools',
      'يعيد قائمة الأدوات المسجلة حالياً في الـ AI (الأسماء + الأوصاف). بدون وسائط. مفيد لمعرفة قدرات المساعد.',
      async () => {
        if (typeof global.aiListTools === 'function') {
          return { tools: global.aiListTools() };
        }
        return { tools: [] };
      });

    console.log('[SmartAITools] ✅ سجّلت أدوات: read_smart_log, read_validation_patterns, get_page_state, read_event_log, emit_n8n_event, get_usage_stats, list_ai_tools');
  }

  if (global.SmartAI || typeof global.aiRegisterTool === 'function') {
    boot();
  } else {
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (global.SmartAI || typeof global.aiRegisterTool === 'function') {
        clearInterval(iv);
        boot();
      } else if (tries > 20) {
        clearInterval(iv);
      }
    }, 500);
  }

})(typeof globalThis !== 'undefined' ? globalThis : window);