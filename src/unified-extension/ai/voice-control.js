// ai/voice-control.js — التحكم الصوتي "مساعد العربي الصوتي"
// إملاء صوتي (webkitSpeechRecognition) بتعبئة الحقل النشط في البوابة.
// الفاب #elaraby-ai-voice-fab: يظهر فقط عند تفعيله من اللوحة (unified-dock).
(function () {
  'use strict';

  const FAB_ID = 'elaraby-ai-voice-fab';
  const PANEL_ID = 'ea-voice-panel';

  function buildUI() {
    if (document.getElementById(FAB_ID)) return;

    // ── الفاب 🎙️ (الحجم الموحد 48×48 كباقي الفابز) ──
    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.title = 'التحكم الصوتي — إملاء وتعبئة بالصوت';
    fab.textContent = '🎙️';
    fab.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:999990;width:48px;height:48px;' +
      'border-radius:50%;border:2px solid #a78bfa;background:linear-gradient(135deg,#1e1b4b,#312e81);' +
      'color:#c4b5fd;font-size:20px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45);' +
      'display:flex;align-items:center;justify-content:center;line-height:1;user-select:none;' +
      'transition:transform .12s ease,box-shadow .12s ease;';
    fab.addEventListener('click', () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    document.body.appendChild(fab);

    // ── اللوحة ──
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText =
      'position:fixed;bottom:78px;right:16px;z-index:999992;width:280px;max-height:70vh;overflow-y:auto;' +
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
        <div id="ea-voice-status" style="font-size:10px;color:#7d97b8;text-align:center;min-height:14px;">جاهز — اضغط الزر وتكلم</div>
        <div id="ea-voice-result" style="background:#0d1326;border:1px solid #2a2d4e;border-radius:10px;padding:8px;min-height:48px;font-size:12px;line-height:1.6;color:#e2eaf5;white-space:pre-wrap;word-break:break-word;"></div>
        <div style="display:flex;gap:6px;">
          <button id="ea-voice-fill" style="flex:1;padding:8px;border:none;border-radius:8px;background:#14532d;color:#4ade80;font-weight:700;font-size:11px;cursor:pointer;">⬇️ تعبئة في الحقل النشط</button>
          <button id="ea-voice-copy" style="flex:1;padding:8px;border:none;border-radius:8px;background:#132b4e;color:#9db4d0;font-weight:600;font-size:11px;cursor:pointer;">📋 نسخ</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#ea-voice-close').addEventListener('click', () => { panel.style.display = 'none'; });

    // ── التعرف الصوتي ──
    const langSel = document.getElementById('ea-voice-lang');
    const micBtn = document.getElementById('ea-voice-mic');
    const statusEl = document.getElementById('ea-voice-status');
    const resultEl = document.getElementById('ea-voice-result');

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
