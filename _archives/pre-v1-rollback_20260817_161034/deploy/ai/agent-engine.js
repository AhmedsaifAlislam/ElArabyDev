// ai/agent-engine.js — وكيل البلاغات الذكي (AI Agent Engine)
// فاب واحد يتحدث معك بالعربية: "جدول البلاغات اللي ناقصها داتا" →
// الوكيل يركّب سلسلة أوامر (مسح الجدول → تحليل → جدولة جماعية → تقرير)
// وينفذها متسلسلة مع تقرير خطوات في اللوحة.
//
// يسجّل أدوات AI:
//   - grid_scan             → مسح جدول الحالات الحالي (من الصفحة/الإطارات)
//   - agent_batch_schedule  → جدولة جماعية عبر Web API مباشرة (بدون فتح كل بلاغ)
//   - agent_run_task        → المهمة الأم: خطط + نفذ متسلسلاً + تقرير
// يصدّر: window.__elarabyAgentEngine = { runTask }

(function (global) {
  'use strict';

  if (global.__elarabyAgentEngineLoaded) return;
  global.__elarabyAgentEngineLoaded = true;

  const PANEL_ID = 'elaraby-agent-panel';
  const FAB_ID = 'elaraby-agent-fab';

  // ── أدوات الوكيل ──────────────────────────────────────

  // مسح جدول الحالات: يعيد صفوفاً بها معرّف البلاغ وبيانات الأعمدة
  function scanGrid() {
    try {
      const doc = document;
      let table = null;
      if (typeof global.detectTable === 'function') {
        table = global.detectTable(doc);
      }
      if (!table && typeof global.scrapeTable === 'function') {
        const r = global.scrapeTable(doc, { includeFrames: true });
        if (r && r.rows) table = { headers: r.headers, rows: r.rows };
      }
      if (!table || !table.headers || !table.rows) {
        // fallback: أي أول جدول ظاهر
        const t = doc.querySelector('table');
        if (!t) return { ok: false, error: 'لم أجد جدولاً في الصفحة — افتح صفحة جدول الحالات' };
        const headers = Array.from(t.querySelectorAll('th')).map(th => th.textContent.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr')).map(tr =>
          Array.from(tr.cells).map(c => c.textContent.trim())
        );
        return { ok: true, headers, rows: rows.slice(0, 200) };
      }
      return { ok: true, headers: table.headers, rows: table.rows.slice(0, 200) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  // استخراج معرّفات البلاغات من صفوف الجدول (بحثاً عن روابط workorder)
  function extractIncidentIds(rows) {
    const ids = [];
    const idRe = /\(([A-Fa-f0-9\-]{36})\)/;
    rows.forEach(row => {
      let joined = '';
      if (Array.isArray(row)) joined = row.join(' ');
      else if (typeof row === 'object' && row) joined = JSON.stringify(row);
      const m = joined.match(idRe);
      if (m && !ids.includes(m[1])) ids.push(m[1]);
    });
    return ids;
  }

  // جدولة جماعية: PATCH مباشر عبر Web API لكل بلاغ (God Mode بدون فتح)
  async function batchSchedule(incidentIds, dateStr) {
    if (!incidentIds || !incidentIds.length) return { ok: false, error: 'لا توجد بلاغات' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' };
    const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    if (!token) return { ok: false, error: 'لا يوجد توكن تحقق في الصفحة (الجلسة قد تكون منتهية)' };

    const done = [];
    const failed = [];
    for (const id of incidentIds) {
      try {
        const res = await fetch(`/_api/incidents(${id})`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            '__RequestVerificationToken': token,
            'Accept': 'application/json'
          },
          body: JSON.stringify({ "ats_schedulebookdate": `${dateStr}T08:00:00Z` })
        });
        if (res.ok) done.push(id);
        else failed.push({ id, status: res.status, error: (await res.text()).slice(0, 100) });
      } catch (e) {
        failed.push({ id, error: String(e.message || e) });
      }
    }
    return { ok: true, done, failed, total: incidentIds.length };
  }

  // ── التسجيل في Tool Registry ──────────────────────────
  function register(ai, name, description, run) {
    const registerFn = ai.aiRegisterTool || ai.registerTool;
    if (typeof registerFn !== 'function') return false;
    registerFn(name, description, run);
    return true;
  }

  function bootTools() {
    const ai = global.SmartAI || global;
    if (!ai) return false;

    register(ai, 'grid_scan',
      'يمسح جدول الحالات الحالي ويعيد رؤوس الأعمدة وكل الصفوف (حتى 200). بدون وسائط. استخدمه أولاً لفهم ما في الجدول.',
      async () => scanGrid());

    register(ai, 'agent_batch_schedule',
      'جدولة جماعية لبلاغات متعددة في تاريخ واحد مباشرة عبر Web API (بدون فتح كل بلاغ). الوسائط: { incident_ids: [أرقام البلاغات], date: "YYYY-MM-DD" }.',
      async (args) => {
        const ids = Array.isArray(args && args.incident_ids) ? args.incident_ids : [];
        return batchSchedule(ids, args && args.date);
      });

    register(ai, 'agent_run_task',
      'مهمة الوكيل الأم: ينفذ طلب المستخدم بالعربية متسلسلاً (مسح الجدول، تحليل، جدولة، تقرير). الوسائط: { task: "النص بالعربية" }.',
      async (args) => {
        const task = args && args.task;
        if (!task) return { ok: false, error: 'task مطلوب' };
        return runTask(task);
      });

    return true;
  }

  // ── محرك التنفيذ: التخطيط + التنفيذ المتسلسل + التقرير ──
  async function runTask(taskText) {
    const log = [];
    const step = (msg) => { log.push(msg); emitLog(msg); };

    step('🔍 [1/4] مسح جدول الحالات...');
    const grid = scanGrid();
    if (!grid.ok) { step('⚠️ ' + grid.error); return { ok: false, error: grid.error, log }; }
    // تسجيل حدث مسح الجدول في التقرير اليومي
    try {
      const d = global.__eaDailyDigest;
      if (d && typeof d.record === 'function') d.record('grid_scanned', { rows: (grid.rows || []).length });
    } catch (_) {}
    const headers = grid.headers || [];
    const rows = grid.rows || [];
    const ids = extractIncidentIds(rows);
    step(`✅ الجدول: ${rows.length} صف — رؤوس: ${headers.slice(0, 6).join(', ')}${headers.length > 6 ? '...' : ''}`);
    step(`🔢 بلاغات مكتشفة في الجدول: ${ids.length}`);

    step('🧠 [2/4] الذكاء الاصطناعي يحلل الطلب ويقرر الخطة...');
    const ai = global.SmartAI || global;
    if (!ai || typeof global.aiChatWithTools !== 'function') {
      step('⚠️ عميل الذكاء الاصطناعي غير متاح (أضف OpenCode API Key من الإعدادات)');
      return { ok: false, error: 'AI غير متاح', log };
    }

    const system = [
      'أنت وكيل ذكي لأتمتة بلاغات بورتال العربي (PowerApps).',
      'لديك أدوات: grid_scan (مسح الجدول)، agent_batch_schedule (جدولة جماعية عبر Web API)،',
      'schedule_current_incident (جدولة البلاغ المفتوح)، open_scheduler_modal (نافذة جدولة حرة)،',
      'session_status (حالة الجلسة)، prefs_get (تفضيلات المستخدم).',
      'نفّذ طلب المستخدم باستخدام الأدوات المتاحة. اعمل خطوة بخطوة، واذكر في ردّك النهائي:',
      '1) ما تم تنفيذه بالضبط  2) النتائج (أرقام/إحصائيات)  3) أي بلاغات فشلت مع السبب  4) الخطوة التالية المقترحة.',
      'إذا طلب المستخدم "اللي ناقصها داتا" فحلل أعمدة الجدول وحدد الصفوف ذات الخلايا الفارغة المهمة.',
      'التزم بالصيغة: خطوة واحدة لكل استدعاء أداة، ثم واصل حتى الاكتمال.'
    ].join('\n');

    try {
      const res = await global.aiChatWithTools(taskText, {
        system,
        maxTokens: 900,
        context: true,
      });
      if (!res.ok) {
        step('❌ ' + (res.error || 'فشل الاتصال بالذكاء الاصطناعي'));
        return { ok: false, error: res.error, log };
      }
      step('✅ [3/4] تم تنفيذ خطة الوكيل بنجاح');
      step('📋 [4/4] التقرير النهائي:');
      step(res.text || '(لا يوجد نص رد)');
      if (typeof global.__eaToolsLog === 'function') {
        global.__eaToolsLog({
          eventType: 'AGENT_TASK',
          kind: 'info',
          label: 'مهمة وكيل: ' + String(taskText).slice(0, 40),
          details: { task: taskText, ok: true, steps: log.length }
        });
        global.__eaToolsReport({ type: 'agent_task', customer: '', summary: res.text || '', task: taskText, at: Date.now() });
      }
      return { ok: true, text: res.text, log };
    } catch (e) {
      step('❌ ' + String(e.message || e));
      return { ok: false, error: String(e.message || e), log };
    }
  }

  // ── اللوحة ────────────────────────────────────────────
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    if (document.getElementById(FAB_ID)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${FAB_ID} {
        position: fixed; bottom: 20px; left: 84px; z-index: 999989;
        width: 52px; height: 52px; border-radius: 50%; border: none;
        background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff;
        font-size: 22px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center;
      }
      #${FAB_ID}:hover { transform: scale(1.08); }
      #${PANEL_ID} {
        display: none; flex-direction: column; position: fixed;
        bottom: 80px; left: 16px; width: 340px; max-height: 70vh;
        background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45);
        z-index: 999990; font-family: Cairo, Tahoma, sans-serif; direction: rtl;
        font-size: 12px; color: #222; overflow: hidden;
      }
      #${PANEL_ID}.open { display: flex; }
      #${PANEL_ID} .ag-header {
        padding: 10px 14px; background: linear-gradient(135deg, #7c3aed, #4f46e5);
        color: #fff; font-weight: 700; display: flex; justify-content: space-between; align-items: center;
      }
      #${PANEL_ID} .ag-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
      #${PANEL_ID} textarea {
        width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px;
        padding: 8px; font-family: inherit; font-size: 12px; resize: vertical; min-height: 54px;
      }
      #${PANEL_ID} .ag-run {
        padding: 8px; border: none; border-radius: 8px; background: #4f46e5; color: #fff;
        font-weight: 700; cursor: pointer;
      }
      #${PANEL_ID} .ag-run:disabled { opacity: .55; cursor: not-allowed; }
      #${PANEL_ID} .ag-log {
        background: #f5f6fa; border-radius: 8px; padding: 8px; font-size: 11px;
        line-height: 1.8; max-height: 260px; overflow-y: auto; white-space: pre-wrap;
      }
      #${PANEL_ID} .ag-copy {
        padding: 5px; border: 1px solid #ddd; border-radius: 6px; background: #fff;
        cursor: pointer; font-size: 11px;
      }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.innerHTML = '🤖';
    fab.title = 'وكيل البلاغات الذكي';
    fab.onclick = () => panel.classList.toggle('open');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ag-header">
        <span>🤖 وكيل البلاغات الذكي</span>
        <span style="display:flex;gap:6px;">
          <button class="ag-copy" id="${PANEL_ID}-copy" title="نسخ التقرير">📋 نسخ</button>
          <button style="background:none;border:none;color:#fff;font-size:15px;cursor:pointer;" id="${PANEL_ID}-close">✕</button>
        </span>
      </div>
      <div class="ag-body">
        <textarea id="${PANEL_ID}-task" placeholder="مثال: جدول البلاغات اللي ناقصها داتا واعملها جدولة لتاريخ الغد"></textarea>
        <button class="ag-run" id="${PANEL_ID}-run">▶ تنفيذ المهمة</button>
        <div class="ag-log" id="${PANEL_ID}-log">جاهز — اكتب مهمتك بالعربية واضغط تنفيذ.</div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(`#${PANEL_ID}-close`).onclick = () => panel.classList.remove('open');
    panel.querySelector(`#${PANEL_ID}-copy`).onclick = () => {
      try {
        const txt = panel.querySelector(`#${PANEL_ID}-log`).textContent;
        navigator.clipboard.writeText(txt);
        const btn = panel.querySelector(`#${PANEL_ID}-copy`);
        btn.textContent = '✅ نُسخ';
        setTimeout(() => { btn.textContent = '📋 نسخ'; }, 1500);
      } catch (_) {}
    };

    panel.querySelector(`#${PANEL_ID}-run`).onclick = async () => {
      const task = panel.querySelector(`#${PANEL_ID}-task`).value.trim();
      if (!task) return;
      const runBtn = panel.querySelector(`#${PANEL_ID}-run`);
      const logEl = panel.querySelector(`#${PANEL_ID}-log`);
      runBtn.disabled = true;
      logEl.textContent = '';
      emitLog = (msg) => {
        logEl.textContent += msg + '\n';
        logEl.scrollTop = logEl.scrollHeight;
      };
      await runTask(task);
      runBtn.disabled = false;
    };
  }

  let emitLog = (msg) => { try { console.log('[Agent]', msg); } catch (_) {} };

  global.__elarabyAgentEngine = {
    runTask,
    scanGrid,
    batchSchedule,
    open: () => {
      if (!document.getElementById(PANEL_ID)) buildPanel();
      const p = document.getElementById(PANEL_ID);
      if (p) p.classList.add('open');
    },
  };

  // التشغيل: بناء اللوحة بعد تحميل الصفحة
  function boot() {
    buildPanel();
    bootTools();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  } else {
    setTimeout(boot, 800);
  }

  // إعادة تسجيل الأدوات عند جاهزية SmartAI (قد يأتي لاحقاً)
  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    if (global.SmartAI) { clearInterval(iv); bootTools(); }
    else if (tries > 30) clearInterval(iv);
  }, 500);

})(typeof globalThis !== 'undefined' ? globalThis : window);
