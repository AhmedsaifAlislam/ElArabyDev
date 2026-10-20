// =========================================================
// problem-codes.js — Shared Problem-Code Registry & User-Pick Gate
// السجل المشترك لأكواد المشاكل (مسموح / ممنوع) + بوابة اختيار المستخدم
// مصدر الحقيقة الواحد الذي يستخدمه: الاوتو فيلينج + الكنترول بانل (نفس السلوك).
// المصادر (بالترتيب):
//   ① problem-catalog.json — كتالوج المشاكل الفعلية (الكود + الوصف + العائلة + ممنوع)
//   ② selectors.json (problemCodeRules / problemPickTimeoutMs) — احتياطي للكلمات المفتاحية
//   ③ تجاوز محلي (localStorage) لتسجيل ما يتعلّمه النظام وقت التشغيل.
// ملاحظة: أكواد المشاكل (صفحة 2) ≠ أكواد الأعطال (صفحة 3) — لكلٍّ كتالوجه.
// =========================================================
'use strict';

(function (window, document) {
  if (window.ProblemCodes) return; // idempotent: آمن لو حُمّل مرتين

  const LS_RULES_KEY = 'autofiller_problem_rules';
  const PICK_EVENT = 'ea-problem-pick-request';
  const CATALOG_FILE = 'problem-catalog.json';

  // احتياطي فقط — المصدر الرسمي أصبح problem-catalog.json.
  // يبقى للطوارئ لو تعذّر تحميل الكتالوج (حتى لا يُختار كود ممنوع أبدًا).
  const DEFAULT_FORBIDDEN = [
    'GI00', 'GS08', 'GR05', 'SR00', 'SR01', 'WM04',   // أكواد ممنوعة
    'ترصيد', 'تجار', 'ارضي', 'أرضي', 'بلاغ'            // كلمات مفتاحية ممنوعة
  ];
  const DEFAULT_TIMEOUT_MS = 30000;

  let _rules = null;
  let _pending = null; // { resolve, list, timeoutMs }
  let _catalog = null;
  let _catalogPromise = null;

  // ── كتالوج المشاكل الفعلية (problem-catalog.json) ────────────────────
  function _normCatalog(raw) {
    const codes = (raw && Array.isArray(raw.codes)) ? raw.codes : [];
    const families = (raw && raw.families && typeof raw.families === 'object') ? raw.families : {};
    return {
      version: Number(raw && raw.version) || 0,
      source: (raw && raw.source) || '',
      updatedAt: (raw && raw.updatedAt) || '',
      note: (raw && raw.note) || '',
      recordCounts: (raw && raw.recordCounts) || {},
      forbiddenKeywords: (raw && Array.isArray(raw.forbiddenKeywords)) ? raw.forbiddenKeywords.slice() : [],
      families,
      codes: codes
        .filter(c => c && c.code)
        .map(c => ({
          code: String(c.code).trim().toUpperCase(),
          desc: String(c.desc || '').trim(),
          family: String(c.family || '*').trim().toUpperCase() || '*',
          forbidden: c.forbidden === true,
          note: c.note || ''
        })),
      error: ''
    };
  }

  async function loadCatalog(force) {
    if (_catalog && !_catalog.error && !force) return _catalog;
    if (_catalogPromise && !force) return _catalogPromise;

    _catalogPromise = (async () => {
      try {
        const base = (window.chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function')
          ? chrome.runtime.getURL(CATALOG_FILE)
          : CATALOG_FILE;
        const res = await fetch(base, { cache: 'no-store' });
        if (!res || res.ok === false) throw new Error('http ' + ((res && res.status) || '?'));
        _catalog = _normCatalog(await res.json());
      } catch (e) {
        _catalog = _normCatalog({ codes: [], families: {} });
        _catalog.error = String((e && e.message) || e || 'catalog-unavailable');
      }
      _catalogPromise = null; // اسمح بإعادة المحاولة لاحقًا (نجاح أو فشل)
      return _catalog;
    })();
    return _catalogPromise;
  }

  function catalogSync() { return _catalog; }

  // عائلة الجهاز من نص نوع المنتج/الموديل (GS / GR / AC / WM / HT)
  const FAMILY_PATTERNS = {
    GS: /بوتجاز|بوتاجاز|مسطح|فرن|cooker|oven|stove/i,
    GR: /ثلاج|مبرد|فريزر|fridge|refrigerat/i,
    AC: /تكييف|شباك|سبليت|\ba\/?c\b|air.?cond|split|inverter/i,
    WM: /غسال|washer|washing/i,
    HT: /سخان|heater/i
  };

  function familyOf(deviceName) {
    const s = String(deviceName || '').trim();
    if (!s) return '';
    const fams = (_catalog && _catalog.families) || {};
    for (const key of Object.keys(fams)) {
      const entry = fams[key];
      const labels = Array.isArray(entry) ? entry : ((entry && entry.labels) || []);
      for (const lb of labels) {
        if (lb && s.indexOf(String(lb)) !== -1) return String(key).toUpperCase();
      }
    }
    for (const key of Object.keys(FAMILY_PATTERNS)) {
      if (FAMILY_PATTERNS[key].test(s)) return key;
    }
    return '';
  }

  // أكواد الكتالوج للجهاز (بلا الممنوع افتراضيًا)
  function codesForDevice(deviceName, opts = {}) {
    if (!_catalog || !_catalog.codes.length) return [];
    const fam = familyOf(deviceName);
    const includeForbidden = !!opts.includeForbidden;
    return _catalog.codes
      .filter(c => c.family === '*' || (fam && c.family === fam))
      .filter(c => includeForbidden || !c.forbidden)
      .map(c => c.code);
  }

  function codeInfo(code) {
    if (!_catalog) return null;
    const want = String(code || '').trim().toUpperCase();
    return _catalog.codes.find(c => c.code === want) || null;
  }

  function isKnownCode(code) { return !!codeInfo(code); }


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
    const cat = await loadCatalog();
    const catCodes = (cat && cat.codes) || [];
    const catForbiddenCodes = catCodes.filter(c => c.forbidden).map(c => c.code);
    const catKeywords = (cat && cat.forbiddenKeywords) || [];
    const srcKeywords = (Array.isArray(srcRules.forbiddenKeywords) && srcRules.forbiddenKeywords.length)
      ? srcRules.forbiddenKeywords.slice()
      : [];

    // ① الممنوع من الكتالوج (أكواد + كلمات)، ثم كلمات selectors، ثم الاحتياطي.
    let forbidden;
    if (catForbiddenCodes.length || catKeywords.length) {
      forbidden = Array.from(new Set([...catForbiddenCodes, ...catKeywords, ...srcKeywords]));
    } else {
      forbidden = srcKeywords.length ? srcKeywords : DEFAULT_FORBIDDEN.slice();
    }
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
    if (_rules) return _rules;
    // لو الكتالوج محمَّل، استخدم ممنوعاته فورًا حتى قبل loadRules()
    if (_catalog && _catalog.codes.length) {
      const forbidden = Array.from(new Set([
        ..._catalog.codes.filter(c => c.forbidden).map(c => c.code),
        ...(_catalog.forbiddenKeywords || []),
        ...DEFAULT_FORBIDDEN
      ]));
      return { forbidden, timeoutMs: DEFAULT_TIMEOUT_MS, learnedAllowed: {} };
    }
    return { forbidden: DEFAULT_FORBIDDEN.slice(), timeoutMs: DEFAULT_TIMEOUT_MS, learnedAllowed: {} };
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

  // الأكواد المسموحة لجهاز معيّن: الكتالوج أولًا ثم selectors.json + المسجَّل تعلّمًا، بلا الممنوع.
  function allowedCodesForDevice(deviceName, rules) {
    const r = rules || _rulesSync();
    const learned = r.learnedAllowed && r.learnedAllowed[String(deviceName || '').trim()];
    const learnedList = Array.isArray(learned) ? learned : [];

    const fromCatalog = codesForDevice(deviceName);
    if (fromCatalog.length) {
      return Array.from(new Set([...fromCatalog, ...learnedList]))
        .filter(c => !isForbidden(c, r));
    }

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
    if (learnedList.length) out.push(...learnedList);

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
    loadCatalog,
    catalogSync,
    familyOf,
    codesForDevice,
    codeInfo,
    isKnownCode,
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
    CATALOG_FILE,
    DEFAULT_FORBIDDEN
  };

  if (typeof window.log === 'function') window.log('[ProblemCodes] ✅ تم تحميل سجل أكواد المشاكل المشترك');
  else console.log('[ProblemCodes] ✅ loaded');
})(window, document);
