// ai/command-palette.js — مركز الأوامر السريع (Command Palette AI)
// Ctrl+K (أو Alt+K) أو الفاب من اللوحة: اكتب ما تريد بالعربية
// "god mode ليوم الاثنين" / "قفل الكل" / "افتح الماسنجر" →
//  - مطابقة محلية فورية للأوامر المعروفة (فتح أداة، إظهار/إخفاء)
//  - غير المعروفة تُفسَّر بالذكاء الاصطناعي وتُنفذ عبر الوكيل
// يصدّر: window.__eaCommandPalette = { open, close, execute }

(function (global) {
  'use strict';

  if (global.__eaCommandPaletteLoaded) return;
  global.__eaCommandPaletteLoaded = true;

  const PALETTE_ID = 'ea-command-palette';
  const FAB_ID = 'elaraby-command-fab';

  // ── الأوامر المحلية المعروفة (توزع على الـ dock عبر CustomEvent) ──
  const LOCAL_COMMANDS = [
    { k: ['الحجز', 'جدولة', 'god mode', 'godmode', 'حجز', 'مواعيد', 'زيارة'], tool: 'booking', label: '⚡📅 الحجز والجدولة الحرة' },
    { k: ['ماسنجر', 'رسائل', 'واتس'], tool: 'messenger', label: '📨 مرسل الماسنجر' },
    { k: ['معالج', 'بلاغات', 'ريبورت'], tool: 'reports', label: '📄 معالج البلاغات' },
    { k: ['هاتف', 'أرقام', 'كشف'], tool: 'phone', label: '📱 كشف أرقام العملاء' },
    { k: ['وكيل', 'ذكاء اصطناعي', 'مهمة'], tool: 'agent', label: '🧠 وكيل البلاغات الذكي' },
    { k: ['مساعد', 'شات', 'اسأل'], tool: 'ai', label: '🤖 المساعد الذكي' },
    { k: ['صوت', 'تحدث'], tool: 'voice', label: '🎙️ التحكم الصوتي' },
    { k: ['تقرير', 'ديجست', 'digest', 'ملخص'], tool: 'digest', label: '📊 التقرير اليومي' },
    { k: ['ازدواج', 'مكرر', 'تكرار'], tool: 'radar', label: '🔁 مؤشر الازدواج' },
    { k: ['لوحة', 'تحكم', 'إعدادات'], tool: 'panel', label: '⚙️ لوحة التحكم' },
    { k: ['قطع غيار', 'عربي'], tool: 'spare', label: '🛍️ مساعد العربي' },
    { k: ['اختفاء', 'إخفاء', 'اخفاء'], tool: '__toggle_master', label: '🎛️ إخفاء/إظهار الكل' },
  ];

  function matchLocal(text) {
    const t = String(text || '').toLowerCase();
    for (const cmd of LOCAL_COMMANDS) {
      if (cmd.k.some(kw => t.includes(kw))) return cmd;
    }
    return null;
  }

  function execute(text) {
    const cmd = matchLocal(text);
    if (typeof global.__eaToolsLog === 'function') {
      global.__eaToolsLog({
        eventType: 'COMMAND_RUN',
        kind: 'info',
        label: 'أمر: ' + String(text).slice(0, 40),
        details: { command: text, via: cmd ? 'local:' + cmd.tool : 'agent' }
      });
    }
    if (cmd) {
      dispatchTool(cmd.tool);
      return { ok: true, via: 'local', label: cmd.label };
    }
    // فشل المطابقة المحلية → تفويض للوكيل الذكي (AI)
    if (global.__elarabyAgentEngine && typeof global.__elarabyAgentEngine.runTask === 'function') {
      return { ok: true, via: 'agent', label: '🧠 أوكلت للوكيل الذكي: ' + text };
    }
    return { ok: false, error: 'لا يوجد تطابق محلي والوكيل غير متاح' };
  }

  function dispatchTool(tool) {
    try {
      global.dispatchEvent(new CustomEvent('ea-command', { detail: { tool } }));
    } catch (_) {}
  }

  // ── اللوحة ──
  function buildUI() {
    if (document.getElementById(PALETTE_ID)) return;
    if (document.getElementById(FAB_ID)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${FAB_ID} {
        position: fixed; bottom: 20px; left: 204px; z-index: 999987;
        width: 52px; height: 52px; border-radius: 50%; border: none;
        background: linear-gradient(135deg, #1e293b, #0f172a); color: #fff;
        font-size: 20px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.35);
        display: flex; align-items: center; justify-content: center;
      }
      #${FAB_ID}:hover { transform: scale(1.08); }
      #${PALETTE_ID} {
        position: fixed; top: 8vh; right: 0; left: auto; transform: none;
        width: min(400px, 92vw); height: 84vh; z-index: 2147483647; background: #fff;
        border-radius: 16px 0 0 16px; box-shadow: 0 20px 60px rgba(0,0,0,.5);
        font-family: Cairo, Tahoma, sans-serif; direction: rtl; overflow: hidden;
        display: none;
      }
      #${PALETTE_ID}.open { display: block; }
      #${PALETTE_ID} input {
        width: 100%; box-sizing: border-box; border: none; outline: none;
        padding: 14px 16px; font-family: inherit; font-size: 14px;
        border-bottom: 2px solid #6366f1; color: #111827;
      }
      #${PALETTE_ID} .cp-results { max-height: 40vh; overflow-y: auto; padding: 6px; }
      #${PALETTE_ID} .cp-item {
        padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
        color: #374151; display: flex; align-items: center; gap: 8px;
      }
      #${PALETTE_ID} .cp-item:hover, #${PALETTE_ID} .cp-item.sel { background: #eef2ff; }
      #${PALETTE_ID} .cp-hint {
        padding: 6px 12px; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6;
      }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.innerHTML = '⌨️';
    fab.title = 'مركز الأوامر (Ctrl+K)';
    fab.onclick = () => openPalette();

    const palette = document.createElement('div');
    palette.id = PALETTE_ID;
    palette.innerHTML = `
      <input id="${PALETTE_ID}-input" placeholder="اكتب أمراً بالعربية... (مثال: افتح الماسنجر، god mode ليوم الاثنين)" autocomplete="off">
      <div class="cp-results" id="${PALETTE_ID}-results"></div>
      <div class="cp-hint">Ctrl+K للفتح · Enter للتنفيذ · Esc للإغلاق · أي شيء غامض يُرسل للوكيل الذكي 🤖</div>
    `;
    document.body.appendChild(palette);

    const input = palette.querySelector(`#${PALETTE_ID}-input`);
    const results = palette.querySelector(`#${PALETTE_ID}-results`);
    let selIdx = -1;

    function render(matches) {
      results.innerHTML = '';
      selIdx = matches.length ? 0 : -1;
      matches.forEach((m, i) => {
        const item = document.createElement('div');
        item.className = 'cp-item' + (i === 0 ? ' sel' : '');
        item.textContent = m.label;
        item.onclick = () => { runMatch(m); };
        item.onmouseenter = () => {
          results.querySelectorAll('.cp-item').forEach((el, j) => el.classList.toggle('sel', j === i));
          selIdx = i;
        };
        results.appendChild(item);
      });
    }

    function currentMatches() {
      const t = input.value.trim();
      if (!t) return LOCAL_COMMANDS.map(c => ({ label: c.label, cmd: c }));
      const m = matchLocal(t);
      if (m) return [{ label: m.label, cmd: m }];
      return [{ label: '🧠 ' + t + ' — (أرسل للوكيل الذكي)', cmd: null, raw: t }];
    }

    function runMatch(m) {
      closePalette();
      if (m.cmd) {
        const r = execute(m.cmd.k[0]);
        showToast(r.label || 'تم التنفيذ');
      } else if (m.raw && global.__elarabyAgentEngine) {
        const agent = global.__elarabyAgentEngine;
        if (typeof agent.open === 'function') agent.open();
        showToast('أرسلت للوكيل: ' + m.raw);
        const ta = document.querySelector('#elaraby-agent-panel-task');
        if (ta) ta.value = m.raw;
      } else {
        showToast('⚠️ الوكيل غير متاح (أضف OpenCode API Key)');
      }
    }

    input.addEventListener('input', () => render(currentMatches()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const matches = currentMatches();
        const m = matches[Math.max(selIdx, 0)];
        if (m) runMatch(m);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = results.querySelectorAll('.cp-item');
        selIdx = Math.min(selIdx + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('sel', i === selIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = results.querySelectorAll('.cp-item');
        selIdx = Math.max(selIdx - 1, 0);
        items.forEach((el, i) => el.classList.toggle('sel', i === selIdx));
      } else if (e.key === 'Escape') {
        closePalette();
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        if (palette.classList.contains('open')) closePalette();
        else openPalette();
      }
    }, true);

    document.addEventListener('click', (e) => {
      if (palette.classList.contains('open') && !palette.contains(e.target) && e.target.id !== FAB_ID) closePalette();
    }, true);

    function openPalette() {
      palette.classList.add('open');
      render(currentMatches());
      setTimeout(() => input.focus(), 30);
    }
    function closePalette() {
      palette.classList.remove('open');
      input.value = '';
      results.innerHTML = '';
    }

    let toast = null;
    function showToast(msg) {
      if (!toast) {
        toast = document.createElement('div');
        Object.assign(toast.style, {
          position: 'fixed', bottom: '84px', right: '0', left: '', transform: 'none',
          background: '#111827', color: '#fff', padding: '8px 16px', borderRadius: '8px',
          fontSize: '12px', zIndex: '2147483646', fontFamily: 'Cairo, Tahoma, sans-serif',
          direction: 'rtl', boxShadow: '0 6px 20px rgba(0,0,0,.3)'
        });
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.opacity = '1';
      setTimeout(() => { toast.style.opacity = '0'; }, 2500);
    }

    document.body.appendChild(fab);

    global.__eaCommandPalette = {
      open: openPalette,
      close: closePalette,
      execute,
      matchLocal,
    };
  }

  function boot() { buildUI(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 700));
  else setTimeout(boot, 700);

})(typeof globalThis !== 'undefined' ? globalThis : window);
