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

  // عائلة الجهاز من نص نوع المنتج/الموديل (GS / GR / AC / WM / HT / DW)
  // بادئات الموديلات (مأخوذة من products-db.json) — تلزم لأن حقل «نوع المنتج»
  // في بعض البلاغات يعطي كود مجموعة (مثل HA) لا اسمًا، فيُحسم الجهاز من الموديل.
  // ⚠️ لا تُضاف بادئة AC: 38 موديل ثلاجة يبدأ بـ AC بلا شرطة (تم التحقق).
  const FAMILY_PATTERNS = {
    GS: /بوتجاز|بوتاجاز|مسطح|فرن|cooker|oven|stove/i,
    GR: /ثلاج|مبرد|فريزر|^GR-|^SJ-|^RF-|^GF-|^FJ-|fridge|refrigerat/i,
    AC: /تكييف|شباك|سبليت|\ba\/?c\b|air.?cond|split|inverter/i,
    WM: /غسال|washer|washing/i,
    HT: /سخان|heater/i,
    DW: /اطباق|أطباق|dish/i
  };

  // تطابق الليبل: العربي بالمطابقة النصية، واللاتيني بحدود كلمة
  // (حتى لا يطابق «WH» داخل «WHIRLPOOL» أو «AC» داخل «ACCESS»).
  function _labelHits(text, label) {
    const t = String(text || '');
    const lb = String(label || '').trim();
    if (!t || !lb) return false;
    if (/[A-Za-z]/.test(lb)) {
      const esc = lb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { return new RegExp('(^|[^A-Za-z0-9])' + esc + '([^A-Za-z0-9]|$)', 'i').test(t); }
      catch (_) { return false; }
    }
    return t.indexOf(lb) !== -1;
  }

  // الأطول يفوز: «غسالة أطباق» → DW لا WM، و«سخانات مياه» → HT.
  function familyOf(deviceName) {
    const s = String(deviceName || '').trim();
    if (!s) return '';
    const fams = (_catalog && _catalog.families) || {};
    let best = '', bestLen = 0;
    for (const key of Object.keys(fams)) {
      const entry = fams[key];
      const labels = Array.isArray(entry) ? entry : ((entry && entry.labels) || []);
      for (const lb of labels) {
        const raw = String(lb || '').trim();
        if (!raw) continue;
        if (_labelHits(s, raw) && raw.length > bestLen) {
          best = String(key).toUpperCase();
          bestLen = raw.length;
        }
      }
    }
    if (best) return best;
    let patBest = '', patLen = 0;
    for (const key of Object.keys(FAMILY_PATTERNS)) {
      const m = s.match(FAMILY_PATTERNS[key]);
      if (m && m[0].length > patLen) { patBest = key; patLen = m[0].length; }
    }
    return patBest;
  }

  // ── نوع الخدمة: تركيب / صيانة (موحّد من نصوص البوابة المتعددة) ─────────
  function normalizeService(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    if (/تركيب|installation|^install$/i.test(s)) return 'install';
    if (/صيان|maintenance|^maint/i.test(s)) return 'maintenance';
    return '';
  }

  function bareCode(code) { return String(code || '').replace(/^\*+/, '').trim().toUpperCase(); }

  // عائلة الكود: الكتالوج أولًا ثم البادئة (HT34 → HT حتى لو غير موجود في الكتالوج)
  const CODE_PREFIX_FAMILY = { GS: 'GS', GR: 'GR', AC: 'AC', WM: 'WM', HT: 'HT', DW: 'DW', GI: '*', SR: '*' };
  function familyOfCode(code) {
    const bare = bareCode(code);
    if (!bare || /تركيب/i.test(bare)) return '';
    const info = codeInfo(bare);
    if (info) return info.family || '';
    const m = bare.match(/^([A-Z]{2})\d/);
    return (m && CODE_PREFIX_FAMILY[m[1]]) || '';
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

  // ── تفكيك صف المشكلة كما تعرضه البوابة ──────────────────────────────
  // "HT34 - ( صيانة - سخانات مياه - خارج الضمان )" →
  //   { code:'HT34', service:'maintenance', product:'سخانات مياه', family:'HT', warranty:'out' }
  // أي صف لا يُفهم يبقى parsed:false (لا يُستبعد أبدًا — fail-open).
  const WARRANTY_IN = /داخل\s*الضمان|تحت\s*الضمان/;
  const WARRANTY_OUT = /خارج\s*الضمان|بدون\s*ضمان|غير\s*مضمون/;

  function parseProblemLabel(label) {
    const raw = String(label || '').replace(/\s+/g, ' ').trim();
    const code = codeOf(raw);
    const out = { raw, code, service: '', product: '', family: '', warranty: '', parsed: false };
    if (!raw) return out;

    // ① الجزء داخل الأقواس (الشكل الرسمي) — ② وإلا ما بعد الكود
    const paren = raw.match(/\(([^)]*)\)/);
    let parts = [];
    if (paren) {
      parts = paren[1].split(/[-–]/).map(p => p.trim()).filter(Boolean);
    } else {
      const rest = raw.slice(code.length).replace(/^[\s\-–(]+/, '').replace(/[)\s]+$/, '');
      parts = rest.split(/[-–]/).map(p => p.trim()).filter(Boolean);
    }

    for (const part of parts) {
      const svc = normalizeService(part);
      if (!out.service && svc) { out.service = svc; continue; }
      if (!out.warranty && (WARRANTY_IN.test(part) || WARRANTY_OUT.test(part))) {
        out.warranty = WARRANTY_IN.test(part) ? 'in' : 'out';
        continue;
      }
      if (!out.product) out.product = part;
    }

    if (!out.family && out.product) out.family = familyOf(out.product);
    if (!out.family) out.family = familyOfCode(code);
    if (!out.service) out.service = normalizeService(raw);
    out.parsed = !!(out.service || out.product || out.family || out.warranty);
    return out;
  }

  // ── فلتر الملاءمة: العائلة + نوع الخدمة (فوق فلتر الممنوع) ─────────────
  // fail-open مقصود: أي صف مجهول العائلة/الخدمة يبقى حتى لا نحجب الصحيح،
  // والاستبعاد يحدث فقط عند تعارض مؤكد.
  function filterCompatible(list, opts) {
    const o = opts || {};
    const r = o.rules || _rulesSync();
    const fam = String(o.family || familyOf(o.device) || '').trim().toUpperCase();
    const svc = normalizeService(o.service);
    const stats = { total: 0, kept: 0, family: 0, service: 0, forbidden: 0, unparsed: 0 };
    const kept = [];

    for (const item of (list || [])) {
      if (item == null || !String(item).trim()) continue;
      stats.total++;
      if (isForbidden(item, r)) { stats.forbidden++; continue; }
      const info = parseProblemLabel(item);
      if (!info.parsed) stats.unparsed++;
      if (fam && info.family && info.family !== '*' && info.family !== fam) { stats.family++; continue; }
      if (svc && info.service && info.service !== svc) { stats.service++; continue; }
      kept.push(item);
    }
    stats.kept = kept.length;
    return { list: kept, stats, family: fam, service: svc };
  }

  // الأكواد المسموحة لجهاز معيّن: الكتالوج أولًا (بلا الممنوع).
  // التعلّم لم يعد يوسّع مجموعة الاختيار العشوائي — يُستخدم اقتراحًا فقط
  // (learnedCodes) أو احتياطيًا لو الكتالوج لا يعرف الجهاز إطلاقًا.
  function allowedCodesForDevice(deviceName, rules, opts) {
    const o = opts || {};
    const r = rules || _rulesSync();
    const fromCatalog = codesForDevice(deviceName);
    if (fromCatalog.length) {
      return fromCatalog.filter(c => !isForbidden(c, r));
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
    if (o.includeLearned !== false) {
      out.push(...learnedCodes(deviceName, { rules: r, service: o.service }));
    }

    const clean = out.map(c => String(c).trim()).filter(Boolean);
    const uniq = Array.from(new Set(clean));
    return uniq.filter(c => !isForbidden(c, r));
  }

  // ── تسجيل النتائج (localStorage override) — ببيانات وصفية وصلاحية ─────
  const LEARNED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

  function _normalizeLearned(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
      if (typeof e === 'string') return { code: bareCode(e), family: familyOfCode(e), service: '', ts: 0 };
      if (e && e.code) {
        const code = bareCode(e.code);
        return {
          code,
          family: String(e.family || familyOfCode(code) || '').toUpperCase(),
          service: normalizeService(e.service),
          ts: Number(e.ts) || 0
        };
      }
      return null;
    }).filter(x => x && x.code);
  }

  function recordOutcome(code, deviceName, ok, meta) {
    const c = bareCode(codeOf(code));
    if (!c) return;
    const m = meta || {};
    const store = _readLS() || {};
    store.allowed = store.allowed || {};
    const dev = String(deviceName || '').trim() || 'عام';
    const arr = _normalizeLearned(store.allowed[dev]);
    const idx = arr.findIndex(x => x.code === c);

    if (ok) {
      const entry = {
        code: c,
        family: String(m.family || familyOfCode(c) || '').toUpperCase(),
        service: normalizeService(m.service),
        ts: Date.now()
      };
      if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    } else if (idx >= 0) {
      arr.splice(idx, 1); // اختيار فشل — لا معنى للاحتفاظ به كاقتراح
    }

    store.allowed[dev] = arr;
    store.ts = Date.now();
    _writeLS(store);
    if (_rules) _rules.learnedAllowed = store.allowed;
  }

  // اقتراحات من التعلّم: حديثة + مسموحة + مطابقة للعائلة/الخدمة فقط.
  // تُعرض في القائمة موسومة «سابق» ولا تُضاف تلقائيًا أبدًا.
  function learnedCodes(deviceName, opts) {
    const o = opts || {};
    const r = o.rules || _rulesSync();
    const dev = String(deviceName || '').trim();
    const arr = _normalizeLearned((r.learnedAllowed || {})[dev]);
    if (!arr.length) return [];
    const fam = String(o.family || familyOf(deviceName) || '').toUpperCase();
    const svc = normalizeService(o.service);
    const now = Date.now();
    return arr
      .filter(e => e.ts > 0 && (now - e.ts) <= LEARNED_MAX_AGE_MS)
      .filter(e => !isForbidden(e.code, r))
      .filter(e => !fam || !e.family || e.family === '*' || e.family === fam)
      .filter(e => !svc || !e.service || e.service === svc)
      .sort((a, b) => b.ts - a.ts)
      .map(e => e.code);
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
            requestedCode: opts.requestedCode || '',
            service: opts.service || '',
            family: opts.family || ''
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
    familyOfCode,
    codesForDevice,
    codeInfo,
    isKnownCode,
    isForbidden,
    filterAllowed,
    filterCompatible,
    parseProblemLabel,
    normalizeService,
    bareCode,
    codeOf,
    pickAllowed,
    allowedCodesForDevice,
    learnedCodes,
    recordOutcome,
    exportRules,
    requestUserPick,
    resolveUserPick,
    hasPendingPick,
    pendingPickList,
    PICK_EVENT,
    LS_RULES_KEY,
    CATALOG_FILE,
    LEARNED_MAX_AGE_MS,
    DEFAULT_FORBIDDEN
  };

  if (typeof window.log === 'function') window.log('[ProblemCodes] ✅ تم تحميل سجل أكواد المشاكل المشترك');
  else console.log('[ProblemCodes] ✅ loaded');
})(window, document);
