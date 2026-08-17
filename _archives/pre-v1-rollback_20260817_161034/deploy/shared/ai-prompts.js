/**
 * ai-prompts.js — سجل قوالب البرومبت المركزية (Prompt Templates)
 * Shared across content scripts / popup / background
 *
 * الهدف: مصدر واحد لكل system prompts وسيناريوهات الاستخدام —
 * بدلاً من نصوص مبعثرة في كل واجهة.
 *
 * يوفر:
 *   - ELARABY_PROMPTS.get(name)          → قالب كامل { system, model, maxTokens, temperature }
 *   - ELARABY_PROMPTS.build(name, vars)  → بناء system prompt مع حقن متغيرات
 *   - ELARABY_PROMPTS.register(name, tpl) → تسجيل قالب مخصص
 */

(function(global) {
  'use strict';

  if (global.__elarabyAIPromptsLoaded) return;
  global.__elarabyAIPromptsLoaded = true;

  const TEMPLATES = {
    // محادثة عامة (popup)
    general: {
      system: 'أنت المساعد الذكي لموظف خدمة مركز العربي (El Araby Group). أجب بالعربية، بشكل موجز وعملي، دون مقدمات طويلة.',
      model: 'deepseek-v4-flash-free',
      maxTokens: 700,
      temperature: 0.4
    },

    // محادثة على صفحة البورتال (أدوات حقيقية)
    portal: {
      system: 'أنت المساعد الذكي لموظف خدمة مركز العربي. أنت تتصفح بورتال العربي حالياً — أنجز طلب المستخدم فوراً باستخدام الأدوات المتاحة، وكن موجزاً وواضحاً بالعربية.',
      model: 'deepseek-v4-flash-free',
      maxTokens: 700,
      temperature: 0.3
    },

    // الجدولة الذكية
    scheduler: {
      system: 'أنت مساعد الجدولة الذكية في بورتال العربي. مهمتك جدولة البلاغات عبر الأدوات المتاحة (get_current_incident, schedule_current_incident, open_scheduler_modal). استخرج التاريخ من كلام المستخدم ثم نفّذ الجدولة فوراً.',
      model: 'deepseek-v4-flash-free',
      maxTokens: 600,
      temperature: 0.2
    },

    // تعبئة البلاغات
    booking: {
      system: 'أنت خبير تعبئة أوامر العمل في بورتال العربي. ساعد في تعبئة الحقول الصحيحة من بيانات البلاغ، وراجع سجل الأخطاء (read_smart_log) لفهم رسائل الرفض المتكررة قبل الاقتراح.',
      model: 'deepseek-v4-flash-free',
      maxTokens: 700,
      temperature: 0.2
    },

    // التحليلات المالية
    financial: {
      system: 'أنت محلل مالي لمراكز خدمة العربي. حلّل البيانات المالية المستخرجة من بوابة CRM وقدم ملخصات واضحة بالعربية مع أرقام دقيقة.',
      model: 'nemotron-3-ultra-free',
      maxTokens: 900,
      temperature: 0.2
    },

    // استخراج البيانات
    extraction: {
      system: 'أنت خبير استخراج بيانات من جداول بورتال العربي. اقرأ الجداول بدقة عبر الأدوات (read_table/scrapeTable) وأجب بالعربية مع تنظيم النتائج.',
      model: 'north-mini-code-free',
      maxTokens: 800,
      temperature: 0.1
    },

    // مراجعة جودة / QA
    qa: {
      system: 'أنت مدقق جودة لعمليات مركز خدمة العربي. راجع البيانات والخطوات، وحدد الأخطاء والتحسينات بوضوح وبالعربية.',
      model: 'ling-3.0-tiny-free',
      maxTokens: 500,
      temperature: 0.1
    },

    // تلخيص
    summary: {
      system: 'لخّص النص التالي بالعربية بشكل موجز ومنظم (نقاط). حافظ على الأرقام والتواريخ بدقة.',
      model: 'mimo-v2.5-free',
      maxTokens: 400,
      temperature: 0.2
    }
  };

  /**
   * الحصول على قالب
   * @param {string} name
   * @returns {Object} قالب كامل (أو general إن لم يوجد)
   */
  function get(name) {
    return TEMPLATES[name] || TEMPLATES.general;
  }

  /**
   * بناء system prompt مع حقن متغيرات
   * مثال: build('portal', { page: 'New Incident' })
   * @param {string} name
   * @param {Object} [vars] - متغيرات تُحقن كـ {{key}}
   * @returns {string}
   */
  function build(name, vars) {
    let sys = get(name).system;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        sys = sys.split('{{' + k + '}}').join(v === null || v === undefined ? '' : String(v));
      }
    }
    return sys;
  }

  /**
   * تسجيل قالب مخصص
   * @param {string} name
   * @param {Object} tpl - { system, model?, maxTokens?, temperature? }
   */
  function register(name, tpl) {
    if (!name || !tpl || !tpl.system) return;
    TEMPLATES[String(name)] = {
      system: tpl.system,
      model: tpl.model || TEMPLATES.general.model,
      maxTokens: tpl.maxTokens || TEMPLATES.general.maxTokens,
      temperature: typeof tpl.temperature === 'number' ? tpl.temperature : 0.3
    };
  }

  global.ELARABY_PROMPTS = {
    get,
    build,
    register,
    list: () => Object.keys(TEMPLATES)
  };

  console.log('[AIPrompts] ✅ تم تحميل قوالب البرومبت المركزية (' + Object.keys(TEMPLATES).length + ' قالب)');

})(typeof globalThis !== 'undefined' ? globalThis : window);