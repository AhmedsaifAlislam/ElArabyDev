// ai/voice-control.js — التحكم الصوتي "مساعد العربي الصوتي"
// إملاء صوتي (webkitSpeechRecognition) بتعبئة الحقل النشط في البوابة.
// الأيقونة (الفاب) تُنسَّق مركزياً من fabs-controller، لكنه لا ينشئها — ننشئها هنا.
(function () {
  'use strict';

  const FAB_ID = 'elaraby-ai-voice-fab';
  const PANEL_ID = 'ea-voice-panel';
  const OPEN_EVENT = 'ea-voice-open';

  // حارس تكرار الحقن: لا نضيف مستمعات document مرتين على نفس الصفحة
  if (window.__eaVoiceControlLoaded) return;
  window.__eaVoiceControlLoaded = true;

  let panelVisible = false;

  function getPanel() {
    try { return document.getElementById(PANEL_ID); } catch (_) { return null; }
  }

  // إظهار/إخفاء موحّد — يغلب أي display مضمّن آخر (مهم: زر الإغلاق)
  function setPanelVisible(show) {
    buildUI();
    const panel = getPanel();
    if (!panel) return;
    panelVisible = !!show;
    panel.style.setProperty('display', panelVisible ? 'block' : 'none', 'important');
  }

  // الأيقونة: fabs-controller يرصّها ويظهرها/يخفيها حسب التفعيل
  function ensureFab() {
    let fab = null;
    try { fab = document.getElementById(FAB_ID); } catch (_) {}
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.title = 'التحكم الصوتي — إملاء وتعبئة بالصوت';
    fab.textContent = '🎙️';
    // شكل مؤقت حتى يلتقطه fabs-controller (scanAndApply كل 1.5s) ويطبّق شكله
    Object.assign(fab.style, {
      position: 'fixed', bottom: '70px', right: '16px', zIndex: '2147483640',
      width: '32px', height: '32px', borderRadius: '50%',
      border: '1px solid #4c1d95', background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      color: '#c4b5fd', fontSize: '16px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1'
    });
    fab.addEventListener('click', () => setPanelVisible(!panelVisible));
    document.documentElement.appendChild(fab);
    return fab;
  }

  function buildUI() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText =
      'position:fixed;bottom:78px;right:76px;z-index:999992;width:280px;max-height:70vh;overflow-y:auto;' +
      'background:linear-gradient(180deg,#11152e,#0b1020);border:1px solid #2a2d4e;border-radius:14px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.6);direction:rtl;font-family:"Segoe UI",Tahoma,Arial,sans-serif;' +
      'font-size:12px;color:#dbe2f0;display:none;user-select:none;';
    panel.innerHTML = `
      <div style="padding:10px 12px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #2a2d4e;position:sticky;top:0;">
        <span style="font-weight:700;font-size:12px;color:#c4b5fd;">🎙️ التحكم الصوتي</span>
        <button id="ea-voice-close" style="background:none;border:none;color:#7d97b8;font-size:15px;cursor:pointer;padding:2px 5px;" title="إغلاق">✕</button>
      </div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:10px;color:#7d97b8;">اللغة:</label>
        <select id="ea-voice-lang" style="background:#132b4e;color:#dbe2f0;border:1px solid #2a2d4e;border-radius:8px;padding:6px;font-size:11px;">
          <option value="ar-EG">العربية (مصر)</option>
          <option value="ar">العربية (عام)</option>
          <option value="en-US">English (US)</option>
        </select>
        <button id="ea-voice-mic" style="padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">🎙️ اضغط للتحدث</button>
        <div style="display:flex;gap:6px;">
          <button id="ea-voice-fill" style="flex:1;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#059669,#047857);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">📝 تعبئة في الحقل</button>
          <button id="ea-voice-copy" style="flex:1;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">📋 نسخ</button>
        </div>
        <div id="ea-voice-status" style="font-size:10px;color:#7d97b8;min-height:18px;"></div>
        <div id="ea-voice-transcript" style="font-size:11px;color:#c4b5fd;min-height:18px;background:#1e1b4b;padding:8px;border-radius:8px;"></div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#ea-voice-close').addEventListener('click', () => { setPanelVisible(false); });

    // ── التعرف الصوتي ──
    const langSel = document.getElementById('ea-voice-lang');
    const micBtn = document.getElementById('ea-voice-mic');
    const statusEl = document.getElementById('ea-voice-status');
    const resultEl = document.getElementById('ea-voice-transcript');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      statusEl.textContent = '⚠️ متصفحك لا يدعم التعرف الصوتي (استخدم Edge/Chrome).';
      micBtn.disabled = true;
      return;
    }

    let rec = null;
    let listening = false;

    function stopRec() {
      try { if (rec) rec.stop(); } catch (e) {}
      listening = false;
      micBtn.textContent = '🎙️ اضغط للتحدث';
      micBtn.style.background = 'linear-gradient(135deg,#4f46e5,#7c3aed)';
      statusEl.textContent = 'جاهز';
    }

    micBtn.addEventListener('click', () => {
      if (listening) { stopRec(); return; }
      rec = new SR();
      rec.lang = langSel.value;
      rec.interimResults = true;
      rec.continuous = false;
      rec.onstart = () => {
        listening = true;
        micBtn.textContent = '⏹️ جاري الاستماع...';
        micBtn.style.background = 'linear-gradient(135deg,#b91c1c,#dc2626)';
        statusEl.textContent = '🎤 استمع الآن...';
      };
      rec.onresult = (ev) => {
        let text = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          text += ev.results[i][0].transcript;
        }
        resultEl.textContent = text.trim();
      };
      rec.onerror = (ev) => {
        statusEl.textContent = '⚠️ خطأ: ' + (ev.error || 'غير معروف');
        stopRec();
      };
      rec.onend = () => { if (listening) stopRec(); };
      try { rec.start(); } catch (e) { statusEl.textContent = '⚠️ لا يمكن البدء الآن'; }
    });

    // تعبئة في الحقل النشط (آخر input/textarea/select حصل focus على الصفحة)
    let lastFocused = null;
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) lastFocused = t;
    }, true);

    function setNativeValue(el, value) {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    panel.querySelector('#ea-voice-fill').addEventListener('click', () => {
      const text = resultEl.textContent.trim();
      if (!text) { statusEl.textContent = '⚠️ لا يوجد نص للتعبئة'; return; }
      if (!lastFocused || !document.contains(lastFocused)) { statusEl.textContent = '⚠️ اضغط أولاً على الحقل الذي تريد تعبئته في الصفحة'; return; }
      try {
        setNativeValue(lastFocused, text);
        statusEl.textContent = '✅ تمت التعبئة في الحقل النشط';
        resultEl.textContent = '';
      } catch (e) {
        statusEl.textContent = '⚠️ فشلت التعبئة: ' + e.message;
      }
    });

    panel.querySelector('#ea-voice-copy').addEventListener('click', () => {
      const text = resultEl.textContent.trim();
      if (!text) { statusEl.textContent = '⚠️ لا يوجد نص للنسخ'; return; }
      navigator.clipboard?.writeText(text).then(() => { statusEl.textContent = '✅ تم النسخ'; });
    });
  }

  // الأيقونة + جسر الفتح من لوحة 🧰 (الربط المركزي لا ينشئ العناصر)
  ensureFab();
  document.addEventListener(OPEN_EVENT, () => setPanelVisible(true));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
