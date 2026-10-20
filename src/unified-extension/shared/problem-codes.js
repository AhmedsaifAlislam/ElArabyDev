// =========================================================
// problem-codes.js — Shared Problem-Code Registry & User-Pick Gate
// السجل المشترك لأكواد المشاكل (مسموح / ممنوع) + بوابة اختيار المستخدم
// مصدر الحقيقة الواحد الذي يستخدمه: الاوتو فيلينج + الكنترول بانل (نفس السلوك).
// المصدر: selectors.json (problemCodeRules / problemPickTimeoutMs)
//         + تجاوز محلي (localStorage) لتسجيل ما يتعلّمه النظام وقت التشغيل.
// =========================================================
'use strict';

(function (window, document) {
  if (window.ProblemCodes) return; // idempotent: آمن لو حُمّل مرتين

  const LS_RULES_KEY = 'autofiller_problem_rules';
  const PICK_EVENT = 'ea-problem-pick-request';

  // التصنيف الاحتياطي من تصنيف المشغّل (الأكواد المكتوب جانبها «ممنوع»).
  const DEFAULT_FORBIDDEN = [
    'GI00', 'GS08', 'GR05', 'SR00', 'SR01', 'WM04',   // أكواد ممنوعة
    'ترصيد', 'تجار', 'ارضي', 'أرضي', 'بلاغ'            // كلمات مفتاحية ممنوعة
  ];
  const DEFAULT_TIMEOUT_MS = 30000;

  let _rules = null;
  let _pending = null; // { resolve, list, timeoutMs }

  // ── تخزين التعلّم المحلي ─────────────────────────────────────────────
  function _readLS() {
    try {
      const raw = localStorage.getItem(LS_RULES_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (_) { return null; }
  }
  function _writeLS(obj) {
    try { localStorage.setItem(LS_RULES_KEY, JSON.stringify(obj || {})); } catch (_) {}
  }

  // ── تحميل القواعد الموحّدة (مسموح/ممنوع + المهلة) ───────────────────
  async function loadRules(force) {
    if (_rules && !force) return _rules;

    let cfg = {};
    try {
      if (typeof window.loadSelectors === 'function') cfg = (await window.loadSelectors()) || {};
      else cfg = window._CFG || window.CFG || {};
    } catch (_) { cfg = window._CFG || window.CFG || {}; }

    const srcRules = (cfg && cfg.problemCodeRules) || {};
    let forbidden = (Array.isArray(srcRules.forbiddenKeywords) && srcRules.forbiddenKeywords.length)
      ? srcRules.forbiddenKeywords.slice()
      : DEFAULT_FORBIDDEN.slice();
    let timeoutMs = Number(cfg && cfg.problemPickTimeoutMs) || DEFAULT_TIMEOUT_MS;

    // تجاوز التعلم المحلي (ما تم تسجيله وقت التشغيل)
    const learned = _readLS();
    if (learned) {
      if (Array.isArray(learned.forbiddenKeywords) && learned.forbiddenKeywords.length) {
        forbidden = Array.from(new Set([...forbidden, ...learned.forbiddenKeywords]));
      }
      if (Number(learned.timeoutMs)) timeoutMs = Number(learned.timeoutMs);
    }

    _rules = { forbidden, timeoutMs, learnedAllowed: (learned && learned.allowed) || {} };
    return _rules;
  }

  function _rulesSync() {
    return _rules || { forbidden: DEFAULT_FORBIDDEN.slice(), timeoutMs: DEFAULT_TIMEOUT_MS, learnedAllowed: {} };
  }

  // ── تصنيف الأكواد ────────────────────────────────────────────────────
  function isForbidden(label, rules) {
    if (label == null) return false;
    const list = (rules && rules.forbidden) || _rulesSync().forbidden;
    const s = String(label);
    return list.some(k => k && s.indexOf(String(k)) !== -1);
  }

  function filterAllowed(list, rules) {
    return (list || []).filter(x => x != null && String(x).trim() && !isForbidden(x, rules));
  }

  // استخراج الكود من نص الصف: "WM05 - (التجفيف لا يعمل)"  →  "WM05"
  function codeOf(label) {
    const s = String(label || '').trim();
    const head = s.split(/\s+[-–]\s+/)[0] || s;
    return head.trim() || s;
  }

  // تدوير/عشوائية بين المسموح فقط
  function pickAllowed(list, rules) {
    const allowed = filterAllowed(list, rules);
    if (!allowed.length) return null;
    return allowed[Math.floor(Math.random() * allowed.length)];
  }

  // الأكواد المسموحة لجهاز معيّن: من selectors.json + المسجَّل تعلّمًا، بلا الممنوع.
  function allowedCodesForDevice(deviceName, rules) {
    const r = rules || _rulesSync();
    const out = [];
    const text = String(deviceName || '').toLowerCase();
    const cfg = window._CFG || window.CFG || {};
    const map = cfg && cfg.problemCodes;
    if (Array.isArray(map)) {
      for (const entry of map) {
        try {
          if (new RegExp(entry.pattern, 'i').test(text) && Array.isArray(entry.codes)) {
            out.push(...entry.codes);
          }
        } catch (_) {}
      }
    }
    const learned = r.learnedAllowed && r.learnedAllowed[String(deviceName || '').trim()];
    if (Array.isArray(learned)) out.push(...learned);

    const clean = out.map(c => String(c).trim()).filter(Boolean);
    const uniq = Array.from(new Set(clean));
    return uniq.filter(c => !isForbidden(c, r));
  }

  // ── تسجيل النتائج في الملفات المشتركة (localStorage override) ───────
  function recordOutcome(code, deviceName, ok) {
    const c = codeOf(code);
    if (!c) return;
    const store = _readLS() || {};
    store.allowed = store.allowed || {};
    const dev = String(deviceName || '').trim() || 'عام';
    const cur = new Set(store.allowed[dev] || []);
    if (ok) { cur.add(c); }
    store.allowed[dev] = Array.from(cur);
    store.ts = Date.now();
    _writeLS(store);
    if (_rules) _rules.learnedAllowed = store.allowed;
  }

  function exportRules() {
    return _readLS() || {};
  }

  // ── بوابة اختيار المستخدم (يرفعها الكنترول بانل) ────────────────────
  // ترجع نص الصف المختار أو null عند انتهاء المهلة.
  async function requestUserPick(list, opts = {}) {
    const r = (opts && opts.rules) || (await loadRules());
    const timeoutMs = Number(opts && opts.timeoutMs) || r.timeoutMs;
    const allowed = filterAllowed(list, r);
    if (!allowed.length) return null;

    return new Promise(resolve => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (_pending && _pending.resolve === finish) _pending = null;
        resolve(val || null);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      _pending = { resolve: finish, list: allowed, timeoutMs };

      try {
        document.dispatchEvent(new CustomEvent(PICK_EVENT, {
          detail: {
            list: allowed,
            timeoutMs,
            device: opts.device || '',
            requestedCode: opts.requestedCode || ''
          }
        }));
      } catch (_) {}
    });
  }

  function resolveUserPick(label) {
    if (_pending && typeof _pending.resolve === 'function') {
      _pending.resolve(label || null);
      return true;
    }
    return false;
  }

  function hasPendingPick() { return !!_pending; }
  function pendingPickList() { return _pending ? _pending.list.slice() : []; }

  window.ProblemCodes = {
    loadRules,
    isForbidden,
    filterAllowed,
    codeOf,
    pickAllowed,
    allowedCodesForDevice,
    recordOutcome,
    exportRules,
    requestUserPick,
    resolveUserPick,
    hasPendingPick,
    pendingPickList,
    PICK_EVENT,
    LS_RULES_KEY,
    DEFAULT_FORBIDDEN
  };

  if (typeof window.log === 'function') window.log('[ProblemCodes] ✅ تم تحميل سجل أكواد المشاكل المشترك');
  else console.log('[ProblemCodes] ✅ loaded');
})(window, document);
