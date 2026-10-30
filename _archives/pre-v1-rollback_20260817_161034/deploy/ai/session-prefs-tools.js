// ai/session-prefs-tools.js — أدوات AI للحالة والتفضيلات
// يسجّل في Tool Registry الموحد:
//   - session_status → حالة جلسة البورتال + نقطة الاستئناف (Session Guardian)
//   - prefs_get      → تفضيلات المستخدم المتعلمة (Preferences Memory)
//   - prefs_set      → ضبط تفضيل (يُطبق في الأدوات تلقائياً)

(function (global) {
  'use strict';

  if (global.__elarabySessionPrefsToolsLoaded) return;
  global.__elarabySessionPrefsToolsLoaded = true;

  function register(ai, name, description, run) {
    const registerFn = ai.aiRegisterTool || ai.registerTool;
    if (typeof registerFn !== 'function') return;
    registerFn(name, description, run);
  }

  function getGuardian() {
    try { return global.__eaSessionGuardian || null; } catch (_) { return null; }
  }

  function getPrefs() {
    try { return global.__eaPrefsMemory || null; } catch (_) { return null; }
  }

  function boot() {
    const ai = global.SmartAI || global;
    if (!ai) return;

    register(ai, 'session_status',
      'يعيد حالة جلسة البورتال الحالية (حية/منتهية) ونقطة استئناف آخر عملية حجز متوقفة (آخر بلاغ مكتمل). بدون وسائط.',
      async () => {
        const g = getGuardian();
        if (!g) return { ok: false, error: 'Session Guardian غير متاح في هذه الصفحة' };
        return {
          alive: g.isAlive(),
          resumePoint: g.getResumePoint(),
        };
      });

    register(ai, 'prefs_get',
      'يعيد تفضيلات المستخدم المتعلمة: آخر تاريخ حجز مفضل (bookingDate)، تفضيل God Mode (useGodMode)، وعدّادات الاستخدام. بدون وسائط.',
      async () => {
        const p = getPrefs();
        if (!p) return { ok: false, error: 'Preferences Memory غير متاح في هذه الصفحة' };
        return p.getAll();
      });

    register(ai, 'prefs_set',
      'يضبط تفضيل مستخدم. الوسائط: { pref: "bookingDate"|"useGodMode", value: أي }. يُطبق تلقائياً في أدوات الحجز لاحقاً.',
      async (args) => {
        const p = getPrefs();
        if (!p) return { ok: false, error: 'Preferences Memory غير متاح' };
        const pref = args && args.pref;
        if (!pref) return { ok: false, error: 'pref مطلوب' };
        p.record(pref, args.value);
        return { ok: true, prefs: p.getAll() };
      });

    console.log('[SessionPrefsTools] ✅ تم تسجيل أدوات الحالة والتفضيلات');
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
