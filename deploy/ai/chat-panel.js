// ai/chat-panel.js — محادثة ذكية عائمة مع Tool Calling حقيقي
// يعمل على كل صفحات بورتال العربي: FAB + نافذة محادثة عبر aiChatWithTools.
// الأدوات (الجدولة...) تُسجَّل تلقائياً من scheduler-tools.js عند توفرها.

(function(global) {
  'use strict';

  if (global.__elarabyAIChatPanelLoaded) return;
  global.__elarabyAIChatPanelLoaded = true;

  const CSS = `
    #elaraby-ai-panel {
      position: fixed; bottom: 80px; right: 76px; z-index: 2147483000;
      width: 350px; max-width: calc(100vw - 90px); height: 470px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 14px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.4);
      display: none; flex-direction: column;
      font-family: 'Cairo', Tahoma, sans-serif; direction: rtl;
    }
    #elaraby-ai-panel.open { display: flex; }
    #elaraby-ai-head {
      background: linear-gradient(135deg, #1e3c72, #2a5298); color: #fff;
      padding: 12px 16px; font-weight: 700; font-size: 14px;
      display: flex; justify-content: space-between; align-items: center;
    }
    #elaraby-ai-close, #elaraby-ai-min { background: none; border: none; color: #fff; font-size: 16px; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 6px; }
    #elaraby-ai-close:hover, #elaraby-ai-min:hover { background: rgba(255,255,255,0.18); }
    #elaraby-ai-actions { display: inline-flex; align-items: center; gap: 4px; }
    #elaraby-ai-messages {
      flex: 1; overflow-y: auto; padding: 12px; background: #f5f6fa;
      display: flex; flex-direction: column; gap: 8px;
    }
    .elaraby-ai-msg {
      max-width: 85%; padding: 8px 12px; border-radius: 10px;
      font-size: 12.5px; line-height: 1.7; white-space: pre-wrap;
      word-break: break-word;
    }
    .elaraby-ai-msg.user { align-self: flex-start; background: #1e3c72; color: #fff; }
    .elaraby-ai-msg.ai { align-self: flex-end; background: #e9edf5; color: #222; }
    .elaraby-ai-msg.tool { align-self: flex-end; background: #fff3cd; color: #856404; font-size: 11px; }
    .elaraby-ai-msg.err { align-self: flex-end; background: #f8d7da; color: #721c24; }
    .elaraby-ai-msg.busy { align-self: flex-end; background: #e9edf5; color: #666; font-size: 12px; display: flex; align-items: center; gap: 8px; }
    .elaraby-ai-spinner {
      width: 13px; height: 13px; border: 2px solid #b8c6d9; border-top-color: #1e3c72;
      border-radius: 50%; display: inline-block;
      animation: elaraby-ai-spin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes elaraby-ai-spin { to { transform: rotate(360deg); } }
    .elaraby-ai-msg.streaming { border: 1px dashed #1e3c72; }
    #elaraby-ai-input-row { display: flex; gap: 8px; padding: 10px; background: #fff; border-top: 1px solid #e3e6ea; }
    #elaraby-ai-input {
      flex: 1; border: 1px solid #ccd0d5; border-radius: 8px;
      padding: 8px 11px; font-family: 'Cairo', Tahoma, sans-serif;
      font-size: 13px; outline: none;
    }
    #elaraby-ai-send {
      border: none; border-radius: 8px; padding: 0 16px;
      background: #28a745; color: #fff; font-weight: 700; cursor: pointer;
      font-family: 'Cairo', Tahoma, sans-serif; font-size: 13px;
    }
    #elaraby-ai-send:disabled { background: #9cc3a8; cursor: not-allowed; }
    #elaraby-ai-head .badge { font-size: 10px; background: rgba(255,255,255,0.22); padding: 2px 8px; border-radius: 20px; }
  `;

  let root = null;
  let sessionHistory = [];
  let panelVisible = false;
  let busy = false;   // يمنع الإرسال المزدوج (Enter + زر)

  function getPanel() {
    try { return document.getElementById('elaraby-ai-panel'); } catch (_) { return null; }
  }

  // إظهار/إخفاء عبر class .open فقط — بلا display مضمّن يتعارض مع الإغلاق
  function setPanelVisible(show) {
    inject();
    const panel = getPanel();
    if (!panel) return;
    panelVisible = !!show;
    panel.classList.toggle('open', panelVisible);
    if (panelVisible) {
      const input = document.getElementById('elaraby-ai-input');
      if (input) setTimeout(() => input.focus(), 30);
    }
  }

  // الأيقونة: الربط المركزي يرصّها ويظهرها/يخفيها، لكنه لا ينشئها — ننشئها هنا
  function ensureFab() {
    let fab = null;
    try { fab = document.getElementById('elaraby-ai-fab'); } catch (_) {}
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = 'elaraby-ai-fab';
    fab.type = 'button';
    fab.title = 'المساعد الذكي';
    fab.textContent = '💬';
    Object.assign(fab.style, {
      position: 'fixed', bottom: '150px', right: '16px', zIndex: '2147483640',
      width: '32px', height: '32px', borderRadius: '50%',
      border: '1px solid #4c1d95', background: 'linear-gradient(135deg,#2e1065,#4c1d95)',
      color: '#ddd6fe', fontSize: '16px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1'
    });
    fab.addEventListener('click', () => setPanelVisible(!panelVisible));
    document.documentElement.appendChild(fab);
    return fab;
  }

  function inject() {
    if (document.getElementById('elaraby-ai-panel')) return;

    if (!document.querySelector('link[href*="Cairo"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap';
      document.head.appendChild(link);
    }

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // اللوحة (الأيقونة تُنشأ في ensureFab — الربط المركزي يرصّها فقط)
    const panel = document.createElement('div');
    panel.id = 'elaraby-ai-panel';
    panel.innerHTML = `
      <div id="elaraby-ai-head">
        <span>💬 المساعد الذكي <span class="badge" id="elaraby-ai-tools-badge"></span></span>
        <span id="elaraby-ai-actions">
          <button id="elaraby-ai-min" title="تصغير">—</button>
          <button id="elaraby-ai-close" title="خروج">✕</button>
        </span>
      </div>
      <div id="elaraby-ai-messages"></div>
      <div id="elaraby-ai-input-row">
        <input id="elaraby-ai-input" type="text" placeholder="اكتب أمرك... مثال: جدول البلاغ 2026-08-15">
        <button id="elaraby-ai-send">إرسال</button>
      </div>
    `;

    document.body.appendChild(panel);
    root = {
      panel,
      messages: panel.querySelector('#elaraby-ai-messages'),
      input: panel.querySelector('#elaraby-ai-input'),
      send: panel.querySelector('#elaraby-ai-send'),
      close: panel.querySelector('#elaraby-ai-close'),
      min: panel.querySelector('#elaraby-ai-min'),
      badge: panel.querySelector('#elaraby-ai-tools-badge')
    };

    // تصغير/خروج: إخفاء اللوحة (الجلسة محفوظة، وتُفتح من الأيقونة أو 🧰)
    root.min.onclick = () => setPanelVisible(false);
    root.close.onclick = () => setPanelVisible(false);
    root.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') send();
    });
    root.send.onclick = send;

    refreshToolsBadge();
  }

  function refreshToolsBadge() {
    const tools = typeof global.aiListTools === 'function' ? global.aiListTools() : [];
    if (root && tools.length) {
      root.badge.textContent = tools.length + ' أداة';
    } else if (root) {
      root.badge.textContent = '';
    }
  }

  function addMsg(kind, text) {
    const m = document.createElement('div');
    m.className = 'elaraby-ai-msg ' + kind;
    m.textContent = text;
    root.messages.appendChild(m);
    root.messages.scrollTop = root.messages.scrollHeight;
    return m;
  }

  function addBusy() {
    const m = document.createElement('div');
    m.className = 'elaraby-ai-msg busy';
    const sp = document.createElement('span');
    sp.className = 'elaraby-ai-spinner';
    m.appendChild(sp);
    m.appendChild(document.createTextNode('⏳ جاري التفكير...'));
    root.messages.appendChild(m);
    root.messages.scrollTop = root.messages.scrollHeight;
    return m;
  }

  async function send() {
    if (busy) return;   // حارس: يمنع الإرسال المزدوج من Enter + الزر
    const text = root.input.value.trim();
    if (!text || typeof global.aiChatWithTools !== 'function') {
      if (typeof global.aiChatWithTools !== 'function') {
        addMsg('err', 'عميل الذكاء الاصطناعي غير جاهز بعد — أعد فتح الصفحة.');
      }
      return;
    }
    busy = true;
    root.input.value = '';
    root.send.disabled = true;
    addMsg('user', text);
    sessionHistory.push({ role: 'user', content: text });

    let system = 'أنت المساعد الذكي لموظف خدمة مركز العربي. أنجز طلب المستخدم فوراً باستخدام الأدوات المتاحة (الجدولة وغيرها)، وكن موجزاً وواضحاً بالعربية.';
    if (!root.messages.querySelector('.elaraby-ai-msg.ai')) {
      system += '\nأنت تتصفح بورتال العربي حالياً — البيانات تُجلب من الصفحة تلقائياً.';
    }

    const busyEl = addBusy();
    let streamEl = null;

    try {
      const res = await global.aiChatWithTools(text, {
        system,
        model: 'general',
        maxTokens: 700,
        // آخر 10 رسائل سابقة فقط — الرسالة الحالية تُمرَّر في prompt (منع التكرار)
        history: sessionHistory.slice(-10, -1),
        onChunk: (fullText) => {
          if (!streamEl) {
            busyEl.remove();
            streamEl = addMsg('ai', fullText);
            streamEl.classList.add('streaming');
          } else {
            streamEl.textContent = fullText;
            root.messages.scrollTop = root.messages.scrollHeight;
          }
        }
      });

      if (Array.isArray(res.toolCalls) && res.toolCalls.length) {
        addMsg('tool', '⚙️ تم تنفيذ: ' + res.toolCalls.map(t => t.name).filter(Boolean).join('، '));
      }

      if (res.ok) {
        const finalText = res.text || '';
        if (streamEl) {
          streamEl.classList.remove('streaming');
          if (!finalText.trim()) streamEl.textContent = '⚠️ رد فارغ — حاول مرة أخرى أو غيّر النموذج';
          else streamEl.textContent = finalText;
        } else {
          busyEl.remove();
          addMsg('ai', finalText || '⚠️ رد فارغ — حاول مرة أخرى أو غيّر النموذج');
        }
        if (finalText.trim()) sessionHistory.push({ role: 'assistant', content: finalText });
      } else {
        if (streamEl) {
          streamEl.classList.remove('streaming');
          streamEl.className = 'elaraby-ai-msg err';
          streamEl.textContent = '❌ ' + (res.message || res.error || 'فشل الاستجابة');
        } else {
          busyEl.remove();
          addMsg('err', '❌ ' + (res.message || res.error || 'فشل الاستجابة'));
        }
      }
    } catch (e) {
      if (streamEl) { streamEl.remove(); streamEl = null; }
      busyEl.remove();
      addMsg('err', 'خطأ: ' + (e?.message || e));
    } finally {
      busy = false;
      root.send.disabled = false;
      refreshToolsBadge();
    }
  }

  function boot() {
    ensureFab();
    inject();
    if (global.SmartAI && typeof global.aiListTools === 'function') {
      refreshToolsBadge();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // فتح المحادثة من اللوحة 🧰 (جسر اختياري — الأداة تعمل بأيقونتها أيضًا)
  document.addEventListener('ea-ai-open', () => setPanelVisible(true));

  // تحديث شارة الأدوات عند تسجيل أدوات لاحقاً (استقصاء محدود — لا يبقى للأبد)
  {
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (typeof global.aiListTools === 'function' || tries > 10) {
        clearInterval(t);
        refreshToolsBadge();
      }
    }, 800);
  }

  // فتح المحادثة من الـ popup
  if (global.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'SHOW_AI_CHAT') {
        try {
          ensureFab();
          setPanelVisible(true);
          sendResponse({ ok: !!getPanel() });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        return true;
      }
    });
  }

})(typeof globalThis !== 'undefined' ? globalThis : window);