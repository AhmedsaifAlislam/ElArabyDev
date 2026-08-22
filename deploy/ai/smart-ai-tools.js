// ai/smart-ai-tools.js — أدوات AI ذكية موحدة (Tool Registry)
// تسجّل أدوات في الـ Tool Registry الموحد (shared/ai-client.js) لقراءة:
//   - read_smart_log            → سجل الأحداث الذكي (أخطاء/أحداث/تغييرات)
//   - read_validation_patterns  → أنماط التحقق المكررة من البورتال
//   - get_page_state            → حالة الصفحة الحالية (نوعها وحقولها)
// هذه الأدوات هي خامة "التعلم الذاتي": الـ AI يقرأ تاريخ الأخطاء والأنماط
// المكررة ثم يقرر أفضل سلوك للتعبئة.

(function(global) {
  'use strict';

  if (global.__elarabySmartAIToolsLoaded) return;
  global.__elarabySmartAIToolsLoaded = true;

  function register(name, description, run) {
    if (typeof global.aiRegisterTool !== 'function') return;
    global.aiRegisterTool(name, description, run);
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
      'يقرأ سجل الأحداث الذكي للجلسة. الوسائط: { kind: "errors"|"events"|"manual"|"automated" (افتراضي "errors")، limit: 1-50 (افتراضي 30) }. يوضح الأخطاء الأخيرة في تعبئة البلاغات (رسائل رفض، فشل شبكة) ويستخدم لفهم أسباب المشاكل قبل اقتراح الحل.',
      async (args) => {
        const kind = (args && args.kind) || 'errors';
        const limit = Math.min((args && args.limit) || 30, 50);
        const keys = { slManualChanges: [], slAutomatedChanges: [], slErrors: [], slEvents: [] };
        const data = await storageRead(keys);
        const map = { errors: data.slErrors, events: data.slEvents, manual: data.slManualChanges, automated: data.slAutomatedChanges };
        const list = map[kind] || [];
        return { kind, total: list.length, recent: list.slice(-limit) };
      });

    register('read_validation_patterns',
      'يقرأ أنماط التحقق المكررة (رسائل رفض متكررة من البورتال توضح حقولاً مشكلة). الوسائط: { limit: 1-50 (افتراضي 20) }. مفيد لاقتراح تحسينات قبل التعبئة.',
      async (args) => {
        const limit = Math.min((args && args.limit) || 20, 50);
        const data = await storageRead({ validationPatterns: [] });
        const list = data.validationPatterns || [];
        return { total: list.length, recent: list.slice(-limit) };
      });

    register('get_page_state',
      'يعيد وصف الصفحة الحالية: نوعها، معلومات البلاغ المفتوح (من الرابط والعنوان)، وحقولها المرئية. بدون وسائط. يمنح الـ AI سياقاً حقيقياً قبل أي إجراء.',
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

    console.log('[SmartAITools] ✅ سجّلت أدوات: read_smart_log, read_validation_patterns, get_page_state');
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
