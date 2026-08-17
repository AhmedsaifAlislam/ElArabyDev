// shared/preferences-memory.js — ذاكرة تفضيلات المستخدم (User Preferences Memory)
// يسجّل عادات المستخدم أثناء العمل ويطبقها تلقائياً في الأدوات:
//  - آخر تاريخ حجز مفضل (من أتمتة الحجز) → يعبأ افتراضياً في كل مرة
//  - استخدام God Mode → يتذكر أنه يفضله
//  - تفضيلات يومية/فنية تتعلمها الأدوات عبر record()
// التخزين: localStorage (لحظي) + chrome.storage عبر storage-proxy (ثابت عبر الجلسات)
// يصدّر: window.__eaPrefsMemory = { record, get, getStat, getAll, applyToForm, resetPref }

(function (global) {
  'use strict';

  if (global.__eaPrefsMemoryLoaded) return;
  global.__eaPrefsMemoryLoaded = true;

  const LOCAL_KEY = 'elaraby_prefs_memory';
  const STORAGE_KEY = 'eaPrefsMemory';

  const DEFAULTS = {
    bookingDate: null,        // آخر تاريخ زيارة مفضل YYYY-MM-DD
    useGodMode: false,        // هل يفضّل الإرسال المباشر عبر Web API
    lastTool: null,           // آخر أداة استخدمها
    dailyCount: {},           // عدد مرات استخدام كل تفضيل (للتعلم)
  };

  let memory = { ...DEFAULTS, ...(loadLocal() || {}) };

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (_) { return null; }
  }

  function persistLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(memory)); } catch (_) {}
  }

  function persistRemote() {
    try {
      if (typeof global.storageSet === 'function') {
        global.storageSet({ [STORAGE_KEY]: memory }).catch(() => {});
      }
    } catch (_) {}
  }

  function bumpDaily(pref) {
    try {
      const key = 'pref_' + pref;
      memory.dailyCount[key] = (memory.dailyCount[key] || 0) + 1;
    } catch (_) {}
  }

  function record(pref, value) {
    if (!pref) return;
    memory[pref] = value;
    bumpDaily(pref);
    persistLocal();
    persistRemote();
  }

  function get(pref) {
    return memory[pref];
  }

  function getStat(pref) {
    const key = 'pref_' + pref;
    return memory.dailyCount[key] || 0;
  }

  function getAll() {
    return { ...memory };
  }

  function resetPref(pref) {
    if (pref && pref in DEFAULTS) memory[pref] = DEFAULTS[pref];
    persistLocal();
    persistRemote();
  }

  // تطبيق التاريخ المفضل على حقل إدخال تاريخ (عنصر <input type="date">)
  function applyToForm(inputEl, prefs) {
    if (!inputEl) return null;
    const date = (prefs && prefs.bookingDate) || memory.bookingDate;
    if (date && !inputEl.value) {
      inputEl.value = date;
      return date;
    }
    return null;
  }

  // استرجاع من التخزين الثابت عند التحميل المبكر (document_start)
  try {
    if (typeof global.storageGet === 'function') {
      global.storageGet({ [STORAGE_KEY]: null }).then((d) => {
        const remote = d && d[STORAGE_KEY];
        if (remote && remote.bookingDate) {
          memory = { ...DEFAULTS, ...remote, ...loadLocal() };
        }
      }).catch(() => {});
    }
  } catch (_) {}

  global.__eaPrefsMemory = {
    record,
    get,
    getStat,
    getAll,
    applyToForm,
    resetPref,
    KEY: LOCAL_KEY,
  };

})(typeof globalThis !== 'undefined' ? globalThis : window);
