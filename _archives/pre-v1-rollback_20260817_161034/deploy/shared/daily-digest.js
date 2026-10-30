// shared/daily-digest.js — التقرير اليومي التلقائي (Daily Digest)
// يجمع أحداث اليوم (بلاغات محجوزة، مقفلة، ناقص داتا، جداول مسحها الوكيل)
// من سجل محلي مشترك، يلخصها الذكاء الاصطناعي بالعربية، ويعرضها في لوحة
// مع إمكانية تصدير CSV/JSON.
//  - أي أداة تسجّل الحدث عبر window.__eaDailyDigest.record(type, payload)
//  - أداة AI: daily_digest → يقرأ أحداث اليوم ويلخصها
// يصدّر: window.__eaDailyDigest = { record, getToday, getSince, clearToday, open }

(function (global) {
  'use strict';

  if (global.__eaDailyDigestLoaded) return;
  global.__eaDailyDigestLoaded = true;

  const EVENTS_KEY = 'elaraby_daily_events';
  const PANEL_ID = 'elaraby-digest-panel';
  const FAB_ID = 'elaraby-digest-fab';

  // ── السجل المحلي ──
  function loadEvents() {
    try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveEvents(evts) {
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(evts.slice(-600))); } catch (_) {}
  }

  function record(type, payload) {
    const evt = {
      type: String(type || 'event'),
      ...(payload || {}),
      at: Date.now(),
    };
    saveEvents([...loadEvents(), evt]);
    return evt;
  }

  function dayKey(ts) {
    const d = new Date(ts || Date.now());
    return d.toISOString().slice(0, 10);
  }

  function getToday() {
    const today = dayKey();
    return loadEvents().filter(e => dayKey(e.at) === today);
  }

  function getSince(ms) {
    const cutoff = Date.now() - (ms || 86400000);
    return loadEvents().filter(e => e.at >= cutoff);
  }

  function clearToday() {
    const today = dayKey();
    saveEvents(loadEvents().filter(e => dayKey(e.at) !== today));
  }

  // ── إحصائيات يومية ──
  function summarize(events) {
    const byType = {};
    events.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
    return {
      total: events.length,
      byType,
      scheduled: events.filter(e => e.type === 'scheduled'),
      closed: events.filter(e => e.type === 'closed'),
      scanned: events.filter(e => e.type === 'grid_scanned'),
    };
  }

  // ── تلخيص بالذكاء الاصطناعي ──
  async function aiSummary() {
    const events = getToday();
    const stats = summarize(events);
    if (!events.length) return { ok: true, text: 'لا توجد أحداث مسجلة اليوم بعد — اعمل على البلاغات ثم عُد لتوليد التقرير.' };
    try {
      const res = await global.aiChat(
        'لخّص يوم العمل هذا تقريراً بالعربية منظم (نقاط): كم بلاغاً حُجز، كم قُفل، كم ناقص داتا، ملاحظات. كن دقيقاً بالأرقام.',
        {
          system: 'أنت مساعد تقارير. بيانات اليوم: ' + JSON.stringify({ events: events.slice(-200), stats }),
          maxTokens: 500, context: false
        }
      );
      return { ok: res.ok !== false, text: res.text || 'لا يوجد رد', stats };
    } catch (e) {
      return { ok: false, error: String(e.message || e), stats };
    }
  }

  // ── تصدير CSV ──
  function exportCSV(events) {
    const lines = [['الوقت', 'النوع', 'التفاصيل']];
    events.forEach(e => {
      const t = new Date(e.at).toLocaleString('ar-EG');
      const payload = Object.entries(e)
        .filter(([k]) => !['at', 'type'].includes(k))
        .map(([k, v]) => k + '=' + String(v).slice(0, 80))
        .join(' | ');
      lines.push([t, e.type, payload]);
    });
    return lines.map(row => row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  function download(name, content, mime) {
    try {
      const blob = new Blob([content], { type: mime || 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (_) {}
  }

  // ── اللوحة ──
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    if (document.getElementById(FAB_ID)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${FAB_ID} {
        position: fixed; bottom: 20px; left: 144px; z-index: 999988;
        width: 52px; height: 52px; border-radius: 50%; border: none;
        background: linear-gradient(135deg, #0d9488, #0f766e); color: #fff;
        font-size: 20px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center;
      }
      #${FAB_ID}:hover { transform: scale(1.08); }
      #${PANEL_ID} {
        display: none; flex-direction: column; position: fixed;
        bottom: 80px; left: 16px; width: 340px; max-height: 70vh;
        background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45);
        z-index: 999989; font-family: Cairo, Tahoma, sans-serif; direction: rtl;
        font-size: 12px; color: #222; overflow: hidden;
      }
      #${PANEL_ID}.open { display: flex; }
      #${PANEL_ID} .dg-header {
        padding: 10px 14px; background: linear-gradient(135deg, #0d9488, #0f766e);
        color: #fff; font-weight: 700; display: flex; justify-content: space-between; align-items: center;
      }
      #${PANEL_ID} .dg-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
      #${PANEL_ID} .dg-btn {
        padding: 8px; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;
        font-family: inherit; font-size: 12px;
      }
      #${PANEL_ID} .dg-summary { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 8px; font-size: 11px; line-height: 1.8; }
      #${PANEL_ID} .dg-log {
        background: #f5f6fa; border-radius: 8px; padding: 8px; font-size: 11px;
        line-height: 1.8; max-height: 240px; overflow-y: auto; white-space: pre-wrap;
      }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.innerHTML = '📊';
    fab.title = 'التقرير اليومي';
    fab.onclick = () => panel.classList.toggle('open');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="dg-header">
        <span>📊 التقرير اليومي</span>
        <button style="background:none;border:none;color:#fff;font-size:15px;cursor:pointer;" id="${PANEL_ID}-close">✕</button>
      </div>
      <div class="dg-body">
        <div class="dg-summary" id="${PANEL_ID}-stats">جاري تحميل الإحصائيات...</div>
        <button class="dg-btn" id="${PANEL_ID}-ai" style="background:#0d9488;color:#fff;">🧠 توليد ملخص بالذكاء الاصطناعي</button>
        <div class="dg-log" id="${PANEL_ID}-log"></div>
        <div style="display:flex;gap:6px;">
          <button class="dg-btn" id="${PANEL_ID}-csv" style="flex:1;background:#e2e8f0;color:#334155;">⬇ CSV</button>
          <button class="dg-btn" id="${PANEL_ID}-clear" style="flex:1;background:#fecaca;color:#7f1d1d;">🗑 مسح اليوم</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(`#${PANEL_ID}-close`).onclick = () => panel.classList.remove('open');
    panel.querySelector(`#${PANEL_ID}-clear`).onclick = () => {
      clearToday();
      refreshStats();
      panel.querySelector(`#${PANEL_ID}-log`).textContent = 'تم مسح أحداث اليوم.';
    };
    panel.querySelector(`#${PANEL_ID}-csv`).onclick = () => {
      const evts = getToday();
      if (!evts.length) { panel.querySelector(`#${PANEL_ID}-log`).textContent = 'لا أحداث للتصدير اليوم.'; return; }
      download('elaraby-daily-' + dayKey() + '.csv', exportCSV(evts));
      if (typeof global.__eaToolsLog === 'function') {
        global.__eaToolsLog({
          eventType: 'DIGEST_EXPORT',
          kind: 'info',
          label: 'تصدير التقرير اليومي',
          details: { count: evts.length, day: dayKey() }
        });
        global.__eaToolsReport({ type: 'daily_digest', customer: '', summary: 'تصدير يومي: ' + evts.length + ' حدث', day: dayKey(), count: evts.length, at: Date.now() });
      }
      panel.querySelector(`#${PANEL_ID}-log`).textContent = '⬇ تم تصدير CSV (' + evts.length + ' حدث).';
    };
    panel.querySelector(`#${PANEL_ID}-ai`).onclick = async () => {
      const btn = panel.querySelector(`#${PANEL_ID}-ai`);
      const log = panel.querySelector(`#${PANEL_ID}-log`);
      btn.disabled = true;
      btn.textContent = '⏳ جاري التوليد...';
      log.textContent = '';
      const res = await aiSummary();
      if (res.ok) {
        log.textContent = (res.stats ? 'إحصائيات اليوم: ' + res.stats.total + ' حدث (حجز ' + (res.stats.byType.scheduled || 0) + '، قفل ' + (res.stats.byType.closed || 0) + ')\n\n' : '') + res.text;
      } else {
        log.textContent = '❌ ' + (res.error || 'فشل التوليد');
      }
      btn.disabled = false;
      btn.textContent = '🧠 توليد ملخص بالذكاء الاصطناعي';
    };

    function refreshStats() {
      const stats = summarize(getToday());
      const el = panel.querySelector(`#${PANEL_ID}-stats`);
      if (el) {
        el.textContent = 'أحداث اليوم: ' + stats.total +
          ' · حجز: ' + (stats.byType.scheduled || 0) +
          ' · قفل: ' + (stats.byType.closed || 0) +
          ' · مسح جدول: ' + (stats.byType.grid_scanned || 0);
      }
    }
    refreshStats();
  }

  // أداة AI
  function registerTools() {
    const registerFn = global.aiRegisterTool;
    if (typeof registerFn !== 'function') return;
    registerFn('daily_digest',
      'يجمع أحداث اليوم (حجوزات، إغلاقات، مسح جداول) ويقدم تقريراً ملخصاً بالعربية مع إحصائيات. بدون وسائط.',
      async () => {
        const events = getToday();
        const stats = summarize(events);
        const res = await aiSummary();
        return { ok: true, stats, text: res.text, events: events.slice(-50) };
      });
  }

  global.__eaDailyDigest = {
    record,
    getToday,
    getSince,
    clearToday,
    summarize,
    aiSummary,
    exportCSV,
    open: () => {
      if (!document.getElementById(PANEL_ID)) buildPanel();
      const p = document.getElementById(PANEL_ID);
      if (p) p.classList.add('open');
    },
  };

  function boot() { buildPanel(); registerTools(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  else setTimeout(boot, 800);

  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    if (global.SmartAI) { clearInterval(iv); registerTools(); }
    else if (tries > 30) clearInterval(iv);
  }, 500);

})(typeof globalThis !== 'undefined' ? globalThis : window);
