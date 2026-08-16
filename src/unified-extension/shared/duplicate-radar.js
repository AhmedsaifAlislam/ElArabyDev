// shared/duplicate-radar.js — مؤشر ازدواج البلاغات (Duplicate Radar)
// يسجّل كل بلاغ يُفتح في سجل محلي (بصمة: عميل + عنوان + حقول مهمة) ثم عند
// فتح بلاغ جديد يقارنه بالسجل ويعرض تنبيهاً: "قد يكون مكرراً مع #12345 (تطابق 87%)".
//  - تسجيل تلقائي من صفحة مراجعة البلاغ (workorderreview?id=...)
//  - خوارزمية تشابه محلية (بدون AI) + أداة AI duplicate_check تعطي نسبة بذكاء
// يصدّر: window.__eaDuplicateRadar = { checkCurrent, recordCurrent, getHistory, clearHistory }

(function (global) {
  'use strict';

  if (global.__eaDuplicateRadarLoaded) return;
  global.__eaDuplicateRadarLoaded = true;

  const HISTORY_KEY = 'elaraby_incidents_history';
  const MAX_HISTORY = 400;

  // ── السجل المحلي ──
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (_) {}
  }
  function getHistory() { return loadHistory(); }
  function clearHistory() { saveHistory([]); }

  // ── استخراج بيانات البلاغ من الصفحة ──
  function collectIncidentData() {
    const url = new URL(global.location.href);
    const incidentId = url.searchParams.get('id') || '';
    if (!incidentId) return null;

    const data = { incidentId, title: '', customer: '', fields: {} };
    // العنوان
    const titleEl = document.querySelector('#ats_title, input[name="ats_title"]');
    if (titleEl) data.title = String(titleEl.value || titleEl.textContent || '').trim().slice(0, 150);
    // اسم العميل: البحث عن حقول شائعة
    const customerSelectors = ['#ats_customername', 'input[name="ats_customername"]',
      '#ats_name', '#ats_accountid_name', '#ats_contactid_name'];
    for (const sel of customerSelectors) {
      const el = document.querySelector(sel);
      if (el && (el.value || el.textContent)) {
        data.customer = String(el.value || el.textContent).trim().slice(0, 150);
        break;
      }
    }
    if (!data.customer) {
      // fallback: أي حقل قيمته نصية طويلة نسبياً ومسماه يحتوي customer/account/contact
      try {
        document.querySelectorAll('input[type="text"], input:not([type])').forEach(inp => {
          const name = (inp.name || inp.id || '').toLowerCase();
          if (!data.customer && /customer|account|contact|name/.test(name) && inp.value) {
            data.customer = inp.value.trim().slice(0, 150);
          }
        });
      } catch (_) {}
    }
    // كل الحقول النصية كبصمة
    try {
      document.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach(inp => {
        const name = inp.name || inp.id || '';
        if (name && inp.value) data.fields[name] = String(inp.value).trim().slice(0, 200);
      });
    } catch (_) {}
    data.at = Date.now();
    return data;
  }

  // ── تشابه بصمات: Jaccard على الكلمات (دون AI) ──
  function tokenize(str) {
    return new Set(String(str || '').toLowerCase()
      .replace(/[\u0600-\u06FF\w]/gi, (m) => m)
      .match(/[\u0600-\u06FF]{2,}|[a-z0-9]{3,}/gi) || []);
  }
  function similarity(a, b) {
    const A = tokenize(a), B = tokenize(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(w => { if (B.has(w)) inter++; });
    return inter / Math.min(A.size, B.size);
  }

  // ── فحص البلاغ المفتوح ضد السجل ──
  function checkCurrent() {
    const current = collectIncidentData();
    if (!current) return { ok: false, error: 'لا يوجد بلاغ مفتوح في الصفحة' };
    const history = loadHistory();
    const candidates = [];

    for (const rec of history) {
      if (rec.incidentId === current.incidentId) continue; // نفس البلاغ
      if (Date.now() - (rec.at || 0) > 30 * 86400000) continue; // آخر 30 يوم فقط
      let score = 0;
      if (current.customer && rec.customer) {
        score = Math.max(score, similarity(current.customer, rec.customer) * 0.6);
      }
      if (current.title && rec.title) {
        score += similarity(current.title, rec.title) * 0.4;
      }
      if (score >= 0.45) {
        candidates.push({ incidentId: rec.incidentId, title: rec.title, customer: rec.customer, score: Math.round(score * 100), at: rec.at });
      }
    }
    candidates.sort((x, y) => y.score - x.score);
    if (candidates.length && typeof global.__eaToolsLog === 'function') {
      global.__eaToolsLog({
        eventType: 'DUPLICATE_DETECTED',
        kind: 'warning',
        label: 'ازدواج محتمل: ' + current.incidentId.slice(0, 8),
        details: { incidentId: current.incidentId, match: candidates[0].incidentId, score: candidates[0].score, customer: current.customer }
      });
    }
    return { ok: true, current, candidates: candidates.slice(0, 3) };
  }

  // ── تسجيل البلاغ الحالي في السجل ──
  function recordCurrent() {
    const data = collectIncidentData();
    if (!data) return null;
    const history = loadHistory();
    const idx = history.findIndex(r => r.incidentId === data.incidentId);
    const rec = {
      incidentId: data.incidentId,
      title: data.title,
      customer: data.customer,
      fields: data.fields,
      at: data.at,
    };
    if (idx >= 0) history[idx] = rec; else history.push(rec);
    saveHistory(history);
    return rec;
  }

  // ── شريط التنبيه ──
  function showBanner(candidates, current) {
    if (document.getElementById('ea-duplicate-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'ea-duplicate-banner';
    Object.assign(banner.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '2147483646', background: '#fff3cd', color: '#664d03',
      border: '1px solid #ffc107', borderRadius: '10px', padding: '10px 16px',
      fontFamily: 'Cairo, Tahoma, sans-serif', fontSize: '13px', direction: 'rtl',
      boxShadow: '0 6px 20px rgba(0,0,0,.25)', maxWidth: '90vw', display: 'flex',
      alignItems: 'center', gap: '10px'
    });
    const top = candidates[0];
    banner.innerHTML = `
      <span style="font-size:18px">🔁</span>
      <div>
        <b>قد يكون هذا البلاغ مكرراً!</b> الأقرب: <b>#${top.incidentId.slice(0, 8)}</b>
        (تطابق ${top.score}%)${top.customer ? ' — ' + top.customer : ''}
        <div style="font-size:11px;color:#856404;margin-top:2px;">
          ${candidates.slice(1).map(c => `#${c.incidentId.slice(0, 8)} (${c.score}%)`).join('، ') || 'لا توجد تطابقات أخرى'}
        </div>
      </div>
      <button id="ea-duplicate-banner-close" style="background:#ffc107;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:700;color:#664d03;">حسناً</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('ea-duplicate-banner-close').onclick = () => banner.remove();
    setTimeout(() => { try { banner.remove(); } catch (_) {} }, 20000);
  }

  // ── أداة AI: فحص ذكي عبر الذكاء الاصطناعي ──
  async function aiCheck() {
    const local = checkCurrent();
    if (!local.ok) return local;
    if (!local.candidates.length) return { ok: true, duplicated: false, message: 'لا توجد تطابقات محتملة في آخر 30 يوماً.', local };
    try {
      const res = await global.aiChat(
        'قارن البلاغ الحالي مع المرشحين كازدواج محتمل وأجب بالعربية باختصار: هل هو مكرر فعلاً؟ ما النسبة النهائية؟',
        {
          system: 'أنت خبير فحص ازدواج بلاغات. البلاغ الحالي: ' + JSON.stringify(local.current) +
            '\nالمرشحون: ' + JSON.stringify(local.candidates),
          maxTokens: 300, context: false
        }
      );
      return { ok: true, duplicated: local.candidates.length > 0, message: res.text, local };
    } catch (e) {
      return { ok: true, duplicated: true, message: local.candidates[0] ? 'تطابق محلي ' + local.candidates[0].score + '%' : 'لا يوجد', local };
    }
  }

  function registerTools() {
    const registerFn = global.aiRegisterTool;
    if (typeof registerFn !== 'function') return;
    registerFn('duplicate_check',
      'يفحص البلاغ المفتوح حالياً ضد سجل البلاغات (آخر 30 يوم) ويكتشف الازدواج بنسبة تطابق، مع توصية. بدون وسائط.',
      async () => aiCheck());
    registerFn('duplicate_history',
      'يعيد سجل البلاغات المحفوظ (حتى 400) مع بياناتها. بدون وسائط.',
      async () => ({ ok: true, history: loadHistory() }));
  }

  global.__eaDuplicateRadar = {
    checkCurrent,
    recordCurrent,
    getHistory,
    clearHistory,
    aiCheck,
    collectIncidentData,
  };

  // ── فاب الفحص الفوري (يُفتح من اللوحة عبر dock) ──
  function buildFab() {
    if (document.getElementById('elaraby-duplicate-radar-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'elaraby-duplicate-radar-fab';
    fab.innerHTML = '🔁';
    fab.title = 'فحص ازدواج البلاغ المفتوح';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '84px', left: '144px', zIndex: '999988',
      width: '52px', height: '52px', borderRadius: '50%', border: 'none',
      background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
      fontSize: '20px', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    fab.onclick = () => {
      const res = checkCurrent();
      if (!res.ok) {
        alert('⚠️ ' + res.error);
        return;
      }
      if (res.candidates.length) showBanner(res.candidates, res.current);
      else alert('✅ لا توجد تطابقات مكررة محتملة لهذا البلاغ في آخر 30 يوماً.');
    };
    document.body.appendChild(fab);
  }

  // ── التشغيل التلقائي: تسجيل + فحص عند فتح بلاغ ──
  function boot() {
    buildFab();
    if (!/workorderreview/i.test(global.location.href)) return;
    setTimeout(() => {
      try {
        const data = collectIncidentData();
        if (!data) return;
        recordCurrent();
        const res = checkCurrent();
        if (res.ok && res.candidates.length) {
          showBanner(res.candidates, res.current);
        }
      } catch (e) { /* silent */ }
    }, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 500);

  // تسجيل أدوات AI عند جاهزية العميل
  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    if (global.SmartAI) { clearInterval(iv); registerTools(); }
    else if (tries > 30) clearInterval(iv);
  }, 500);

})(typeof globalThis !== 'undefined' ? globalThis : window);
