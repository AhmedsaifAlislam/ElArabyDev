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
  let onPanelHide = null;   // يُسند من buildUI لإيقاف المايك عند إخفاء اللوحة

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
    if (!panelVisible && typeof onPanelHide === 'function') {
      try { onPanelHide(); } catch (_) {}
    }
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
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:7px;background:#0d1326;border:1px solid #2a2d4e;border-radius:6px;overflow:hidden;">
            <div id="ea-voice-level" style="height:100%;width:0%;background:linear-gradient(90deg,#4ade80,#fbbf24,#ef4444);transition:width .08s linear;"></div>
          </div>
          <span style="font-size:9px;color:#64748b;">🎚️</span>
        </div>
        <div style="font-size:9px;color:#64748b;line-height:1.5;">المؤشر يتحرك مع صوتك. لو واقف: الميكروفون مقفول أو جهاز الإدخال غلط في ويندوز.</div>
        <div style="display:flex;gap:6px;">
          <button id="ea-voice-fill" style="flex:1;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#059669,#047857);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">📝 تعبئة في الحقل</button>
          <button id="ea-voice-copy" style="flex:1;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">📋 نسخ</button>
        </div>
        <div id="ea-voice-status" style="font-size:10px;color:#7d97b8;min-height:18px;"></div>
        <div id="ea-voice-transcript" style="font-size:11px;color:#c4b5fd;min-height:18px;background:#1e1b4b;padding:8px;border-radius:8px;"></div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#ea-voice-close').addEventListener('click', () => { setPanelVisible(false); });

    // ── عناصر اللوحة ──
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

    // ════════════════════════════════════════════════════════════════
    //  التعرف الصوتي — استماع مستمر + إعادة تشغيل تلقائية
    //  (continuous=false كان يقطع بعد أول سكتة → «لازم أعيد الكلام»)
    // ════════════════════════════════════════════════════════════════
    let rec = null;
    let wantListening = false;
    let committed = '';        // نص مؤكد من الجلسات السابقة
    let sessionFinal = '';     // نص نهائي داخل الجلسة الحالية
    let restartTimer = null;
    let lastResultAt = 0;

    function paint(text) {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      resultEl.textContent = t;
      resultEl.scrollTop = resultEl.scrollHeight;
    }

    function uiListening(on) {
      micBtn.textContent = on ? '⏹️ إيقاف الاستماع' : '🎙️ اضغط للتحدث';
      micBtn.style.background = on
        ? 'linear-gradient(135deg,#b91c1c,#dc2626)'
        : 'linear-gradient(135deg,#4f46e5,#7c3aed)';
      if (on) statusEl.textContent = '🎤 استمع الآن… (استماع مستمر — مش محتاج تضغط بعد كل جملة)';
    }

    function commitSession() {
      committed = (committed + ' ' + sessionFinal).replace(/\s+/g, ' ').trim();
      sessionFinal = '';
      paint(committed);
    }

    function startSession() {
      if (!wantListening) return;
      try { if (rec) { rec.onend = null; rec.onerror = null; try { rec.abort(); } catch (_) {} } } catch (_) {}

      rec = new SR();
      rec.lang = langSel.value;
      rec.continuous = true;      // لا يقطع بعد أول جملة
      rec.interimResults = true;  // نعرض النص أثناء الكلام
      rec.maxAlternatives = 1;

      rec.onstart = () => uiListening(true);

      rec.onresult = (ev) => {
        lastResultAt = Date.now();
        let finals = '';
        let interim = '';
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          const txt = (r[0] && r[0].transcript) ? r[0].transcript : '';
          if (r.isFinal) finals += txt + ' ';
          else interim += txt;
        }
        sessionFinal = finals;
        paint((committed + ' ' + finals + interim).trim());
      };

      rec.onerror = (ev) => {
        const err = (ev && ev.error) || '';
        // السكوت/الإجهاض ليس خطأً — onend سيعيد التشغيل تلقائيًا
        if (err === 'no-speech' || err === 'aborted') return;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          wantListening = false;
          uiListening(false);
          statusEl.textContent = '⚠️ المتصفح رفض الميكروفون — اسمح بالوصول من أيقونة القفل في شريط العنوان';
          stopMeter();
          return;
        }
        if (err === 'network') {
          statusEl.textContent = '⚠️ خدمة التعرف تحتاج إنترنت — تحقق من الاتصال';
          return;
        }
        statusEl.textContent = '⚠️ ' + err;
      };

      rec.onend = () => {
        commitSession();
        if (!wantListening) { uiListening(false); statusEl.textContent = 'جاهز'; return; }
        // توقف تلقائي بعد 90 ثانية بلا أي كلام → نقفل المايك (خصوصية)
        if (Date.now() - lastResultAt > 90000) {
          wantListening = false;
          uiListening(false);
          statusEl.textContent = '⏹️ توقف تلقائيًا لعدم وجود كلام — اضغط للتحدث من جديد';
          stopMeter();
          return;
        }
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startSession, 300);
      };

      try { rec.start(); } catch (e) { /* Already started */ }
    }

    function stopRec() {
      wantListening = false;
      clearTimeout(restartTimer);
      try { if (rec) rec.stop(); } catch (_) {}
      commitSession();
      uiListening(false);
      statusEl.textContent = 'جاهز';
      stopMeter();
    }

    function startListening() {
      wantListening = true;
      committed = resultEl.textContent.trim();
      sessionFinal = '';
      lastResultAt = Date.now();
      uiListening(true);
      startMeter();
      startSession();
    }

    // ── مؤشر مستوى الميكروفون + طلب أعلى جودة التقاط ممكنة ──
    let meterStream = null, meterCtx = null, meterRAF = 0;

    async function startMeter() {
      if (meterStream) return;
      try {
        meterStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        });
      } catch (e) {
        meterStream = null;
        statusEl.textContent = '⚠️ لم يُسمح بالميكروفون — اسمح بالوصول من أيقونة القفل ثم أعد المحاولة';
        return;
      }
      try {
        meterCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = meterCtx.createMediaStreamSource(meterStream);
        const an = meterCtx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.7;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          if (!meterStream) return;
          const levelEl = document.getElementById('ea-voice-level');
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const rms = Math.sqrt(sum / buf.length);
          // تضخيم بصري: الصوت الهادي يبان؛ لو المؤشر واقف عند 0 فالمايك لا يلتقط
          const pct = Math.min(100, Math.round(rms * 340));
          if (levelEl) levelEl.style.width = pct + '%';
          meterRAF = requestAnimationFrame(tick);
        };
        tick();
      } catch (_) { /* المتصفح لا يدعم Web Audio — نتجاهل المؤشر */ }
    }

    function stopMeter() {
      try { cancelAnimationFrame(meterRAF); } catch (_) {}
      meterRAF = 0;
      try { if (meterStream) meterStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      meterStream = null;
      try { if (meterCtx) meterCtx.close(); } catch (_) {}
      meterCtx = null;
      const levelEl = document.getElementById('ea-voice-level');
      if (levelEl) levelEl.style.width = '0%';
    }

    // إخفاء اللوحة أثناء الاستماع = إيقاف المايك (مافيش تسجيل في الخلفية)
    onPanelHide = () => { if (wantListening) stopRec(); };

    micBtn.addEventListener('click', () => {
      if (wantListening) stopRec();
      else startListening();
    });

    // تغيير اللغة أثناء الاستماع → نعيد الجلسة باللغة الجديدة
    langSel.addEventListener('change', () => {
      if (wantListening) { try { rec.stop(); } catch (_) {} }
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
        committed = '';
        sessionFinal = '';
        paint('');
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
