// shared/session-guardian.js — حارس الجلسة (Session Guardian)
// يراقب صلاحية جلسة البورتال أثناء العمليات الطويلة (حجز جماعي، تقفيل متسلسل):
//  - يكتشف انتهاء الجلسة (401/403) من أي طلب شبكة
//  - يوقف العملية الجارية تلقائياً (booking-automation وغيره)
//  - يحفظ نقطة الاستئناف (آخر بلاغ مكتمل) لاستكماله بعد تسجيل الدخول
//  - يرسل إشعاراً فورياً عبر background
// يصدّر: window.__eaSessionGuardian = { isAlive, stopWork, getResumePoint, clearResume, checkAlive, hook }

(function (global) {
  'use strict';

  if (global.__eaSessionGuardianLoaded) return;
  global.__eaSessionGuardianLoaded = true;

  const ALIVE_KEY = 'elaraby_session_alive';
  const RESUME_KEY = 'elaraby_session_guardian';
  // مفاتيح الحالة للعمليات التي يجب إيقافها عند انتهاء الجلسة
  const WORK_STORE_KEYS = ['elaraby_booking_automation'];

  const state = {
    alive: true,
    lastCheck: null,
    resume: null,
  };

  function readResume() {
    try { return JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (_) { return null; }
  }

  function writeResume(resume) {
    state.resume = resume;
    try { localStorage.setItem(RESUME_KEY, JSON.stringify(resume)); } catch (_) {}
  }

  function notify(title, message) {
    try {
      chrome.runtime.sendMessage({ type: 'EA_NOTIFY', title, message }).catch(() => {});
    } catch (_) {}
  }

  // ── إيقاف أي عملية جارية وحفظ نقطة الاستئناف ──
  function stopWork() {
    WORK_STORE_KEYS.forEach((key) => {
      try {
        const st = JSON.parse(localStorage.getItem(key) || '{}');
        if (!st || !st.running) return;
        st.running = false;
        st.sessionGuardStop = true;
        st.stoppedAt = Date.now();
        localStorage.setItem(key, JSON.stringify(st));

        const done = Array.isArray(st.done) ? st.done : [];
        const lastId = done.length ? done[done.length - 1] : null;
        writeResume({
          script: key === 'elaraby_booking_automation' ? 'booking-automation' : key,
          lastId,
          date: st.date || null,
          force: !!st.force,
          at: Date.now(),
        });
        notify('🚨 انتهت الجلسة أثناء العملية',
          'تم إيقاف العملية تلقائياً عند البلاغ ' + (lastId || '').slice(0, 8) +
          ' — سجّل الدخول ثم استأنف من نقطة التوقف.');
      } catch (_) {}
    });
  }

  // ── كشف انتهاء الجلسة ──
  function markSessionEnded() {
    if (!state.alive) return;
    state.alive = false;
    state.lastCheck = Date.now();
    try { localStorage.setItem(ALIVE_KEY, '0'); } catch (_) {}
    if (typeof global.__eaToolsLog === 'function') {
      global.__eaToolsLog({
        eventType: 'SESSION_EXPIRED',
        kind: 'error',
        label: 'انتهت الجلسة — إيقاف تلقائي',
        details: { resume: state.resume, at: Date.now() }
      });
    }
    stopWork();
  }

  function hookFetch() {
    const orig = global.fetch;
    if (!orig || orig.__eaGuardianHooked) return;
    const hooked = async function (...args) {
      let res;
      try { res = await orig.apply(this, args); } catch (e) { throw e; }
      if (res && (res.status === 401 || res.status === 403)) {
        markSessionEnded();
      }
      return res;
    };
    hooked.__eaGuardianHooked = true;
    global.fetch = hooked;
  }

  function hookXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    if (origOpen.__eaGuardianHooked) return;
    const patched = function (method, url, ...rest) {
      this.__eaGuardianUrl = String(url);
      return origOpen.apply(this, [method, url, ...rest]);
    };
    patched.__eaGuardianHooked = true;
    XMLHttpRequest.prototype.open = patched;

    const origSend = XMLHttpRequest.prototype.send;
    if (!origSend.__eaGuardianHooked) {
      const patchedSend = function (...args) {
        this.addEventListener('load', function () {
          if (this.status === 401 || this.status === 403) markSessionEnded();
        });
        return origSend.apply(this, args);
      };
      patchedSend.__eaGuardianHooked = true;
      XMLHttpRequest.prototype.send = patchedSend;
    }
  }

  function checkAlive() {
    try { state.alive = localStorage.getItem(ALIVE_KEY) !== '0'; } catch (_) {}
    return state.alive;
  }

  function isAlive() {
    return checkAlive();
  }

  // دورة فحص دورية: لو الجلسة ماتت، أبقِ العلم محدثاً (حتى لو لم يمر طلب شبكة)
  setInterval(() => {
    try {
      if (localStorage.getItem(ALIVE_KEY) === '0') {
        state.alive = false;
        stopWork();
      }
    } catch (_) {}
  }, 15000);

  global.__eaSessionGuardian = {
    isAlive,
    markSessionEnded,
    stopWork,
    getResumePoint: readResume,
    clearResume: () => { writeResume(null); },
    checkAlive,
    hook() {
      hookFetch();
      hookXHR();
      checkAlive();
    },
  };

  // الحقن الذاتي (document_start)
  global.__eaSessionGuardian.hook();

})(typeof globalThis !== 'undefined' ? globalThis : window);
