// ai/scheduler-tools.js — أدوات الجدولة في Tool Registry الموحد
// يسجّل أدوات AI قابلة للاستدعاء من محادثة aiChatWithTools:
//   - get_current_incident       → معلومات البلاغ الحالي
//   - schedule_current_incident  → جدولة البلاغ لتاريخ {date: "YYYY-MM-DD", god_mode?: bool}
//   - open_scheduler_modal       → فتح نافذة الجدولة التفاعلية

(function(global) {
  'use strict';

  if (global.__elarabySchedulerToolsLoaded) return;
  global.__elarabySchedulerToolsLoaded = true;

  const sched = global.elarabyRescheduling;

  function register(ai, name, description, run, parameters) {
    const registerFn = ai.aiRegisterTool || ai.registerTool;
    if (typeof registerFn !== 'function') return;
    registerFn(name, description, run, parameters || null);
  }

  function collectIncidentInfo() {
    const url = new URL(global.location.href);
    const incidentId = url.searchParams.get('id');
    const info = { incidentId, page: url.pathname.split('/')[1] || '' };

    const nativeDate = document.getElementById('ats_schedulebookdate');
    if (nativeDate && nativeDate.value) info.currentScheduleDate = nativeDate.value;

    const titleEl = document.querySelector('#ats_title, input[name="ats_title"]');
    if (titleEl && titleEl.value) info.title = String(titleEl.value).slice(0, 120);

    const priEl = document.querySelector('select[name="ats_priority"], #ats_priority');
    if (priEl && priEl.value !== undefined) info.priority = priEl.value;

    const row = document.querySelector('.ats_grid td .entityname, [data-name]');
    return info;
  }

  function boot() {
    const ai = global.SmartAI || global;
    if (!ai) return;

    register(ai, 'get_current_incident',
      'يجلب معلومات البلاغ المفتوح حالياً في الصفحة (incidentId، عنوان، أولوية، تاريخ الجدولة الحالي). بدون وسائط.',
      async () => collectIncidentInfo());

    register(ai, 'schedule_current_incident',
      'جدولة البلاغ المفتوح حالياً لتاريخ معين.',
      async (args) => {
        const date = args && args.date;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { ok: false, error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' };
        }
        const info = collectIncidentInfo();
        if (!info.incidentId) {
          return { ok: false, error: 'لا يوجد بلاغ مفتوح في الصفحة الحالية' };
        }
        const forceApi = !!(args.god_mode);
        return sched.scheduleIncident(info.incidentId, date, forceApi);
      },
      {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'التاريخ المطلوب بصيغة YYYY-MM-DD' },
          god_mode: { type: 'boolean', description: 'true يرسل مباشرة عبر Web API متجاوزاً القيود' }
        },
        required: ['date']
      });

    register(ai, 'open_scheduler_modal',
      'يفتح نافذة الجدولة الحرة التفاعلية (تجاوز القيود) أمام المستخدم.',
      async (args) => {
        sched.openSchedulerModal(!!(args && args.god_mode));
        return { ok: true, result: 'تم فتح نافذة الجدولة' };
      },
      {
        type: 'object',
        properties: {
          god_mode: { type: 'boolean', description: 'true يفتح النافذة بوضع تجاوز القيود' }
        }
      });

    const listToolsFn = ai.listTools || global.aiListTools;
    console.log('[SchedulerTools] ✅ تم تسجيل أدوات الجدولة:', (typeof listToolsFn === 'function' ? listToolsFn() : []));
  }

  // انتظار توفر ai-client (قد يُحقن في نفس الدفعة لاحقاً)
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