// ai/voice-control.js — التحكم الصوتي "مساعد العربي الصوتي"
// إملاء صوتي (webkitSpeechRecognition) بتعبئة الحقل النشط في البوابة.
// الفاب #elaraby-ai-voice-fab: يظهر فقط عند تفعيله من اللوحة (unified-dock).
// إضافة Voice Context AI: أوامر مركبة سياقية ("افتح آخر بلاغ وقفل الحالة")
// تُفسَّر بالذكاء الاصطناعي حسب الصفحة الحالية، مع تأكيد قبل الإجراءات الخطرة.
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
        <button id="ea-voice-ai" style="padding:9px;border:none;border-radius:10px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">🧠 فهم وتنفيذ كأمر (AI)</button>
        <div id="ea-voice-ai-result" style="background:#0d1326;border:1px solid #134e4a;border-radius:10px;padding:8px;min-height:36px;font-size:11px;line-height:1.6;color:#99f6e4;white-space:pre-wrap;word-break:break-word;"></div>`;
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

    // ── Voice Context AI: فهم وتنفيذ الأوامر المركبة ──
    const aiResultEl = document.getElementById('ea-voice-ai-result');
    const aiBtn = document.getElementById('ea-voice-ai');

    function getPageContext() {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('id') || '';
      const page = url.pathname.split('/').filter(Boolean).pop() || '';
      return {
        page,
        incidentId: id,
        isReview: /workorderreview/i.test(url.href),
        isGrid: !!document.querySelector('table'),
        fields: Array.from(document.querySelectorAll('input[name], select[name], textarea[name]'))
          .slice(0, 15).map(el => el.name || el.id),
      };
    }

    // الإجراءات الخطرة (تتطلب تأكيداً صوتياً/نصياً قبل التنفيذ)
    const DANGEROUS_ACTIONS = ['save', 'close', 'submit', 'delete', 'schedule', 'patch', 'lock', 'cancel'];

    function speak(text) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ar-EG';
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch (_) {}
    }

    function confirmDangerous(desc) {
      return new Promise((resolve) => {
        speak('هل أنت متأكد من ' + desc + '؟');
        const ok = window.confirm('⚠️ إجراء خطير: ' + desc + '\nهل تريد المتابعة؟');
        resolve(ok);
      });
    }

    async function runVoiceCommand(commandText) {
      aiBtn.disabled = true;
      aiResultEl.textContent = '⏳ الذكاء الاصطناعي يفهم الأمر حسب الصفحة...';
      try {
        const pageCtx = getPageContext();
        const system = [
          'أنت مترجم أوامر صوتية لبوابة بلاغات. المستخدم نطق أمراً، وهو في سياق:',
          JSON.stringify(pageCtx),
          'أجب حصراً بصيغة JSON واحدة بلا شرح:',
          '{"intent":"open_incident|save|close|fill|navigate|schedule|other","target":...,"value":...,"dangerous":true/false}',
          'مثال: "افتح آخر بلاغ" → {"intent":"navigate","target":"last_incident","dangerous":false}',
          '"قفل اللحالة" → {"intent":"close","dangerous":true}',
          '"جدول لتاريخ الغد" → {"intent":"schedule","value":"غداً","dangerous":true}'
        ].join('\n');

        const res = await (window.aiChat ? window.aiChat(commandText, { system, maxTokens: 200, context: false }) : Promise.resolve(null));
        if (!res || !res.ok) { aiResultEl.textContent = '⚠️ AI غير متاح (أضف OpenCode API Key)'; return; }

        let parsed = null;
        try { parsed = JSON.parse(res.text.trim().replace(/```json|```/g, '')); } catch (_) { parsed = null; }
        if (!parsed || !parsed.intent) { aiResultEl.textContent = '🧠 ' + (res.text || ''); return; }

        aiResultEl.textContent = '🧠 فهمت: ' + (res.text || '');
        statusEl.textContent = 'تنفيذ: ' + parsed.intent;
        if (typeof window.__eaToolsLog === 'function') {
          window.__eaToolsLog({
            eventType: 'VOICE_COMMAND',
            kind: 'info',
            label: 'أمر صوتي: ' + parsed.intent,
            details: { intent: parsed.intent, value: parsed.value || '', raw: String(commandText).slice(0, 60) }
          });
        }

        // تأكيد الإجراءات الخطرة
        if (parsed.dangerous && !(await confirmDangerous(parsed.intent + (parsed.value ? ' ' + parsed.value : '')))) {
          aiResultEl.textContent = '⛔ أُلغي (رفض التأكيد)';
          return;
        }

        switch (parsed.intent) {
          case 'navigate':
            if (parsed.target === 'last_incident') {
              // العودة لقائمة الحالات (نقطة الاستئناف)
              window.location.href = window.location.pathname;
              aiResultEl.textContent = '➡️ فتحت قائمة البلاغات';
            } else {
              aiResultEl.textContent = '➡️ تنقل نحو: ' + (parsed.target || '');
            }
            break;
          case 'schedule':
            // تحويل "غداً/اليوم/بعد يومين" لتاريخ فعلي
            const dateVal = resolveDateText(parsed.value || 'غداً');
            const agent = window.__elarabyAgentEngine;
            if (agent && agent.batchSchedule) {
              const ids = extractIdsFromPage();
              if (ids.length) {
                aiResultEl.textContent = '⏳ جاري جدولة ' + ids.length + ' بلاغ لتاريخ ' + dateVal + '...';
                const r = await agent.batchSchedule(ids, dateVal);
                aiResultEl.textContent = '✅ تم: ' + r.done.length + ' · فشل: ' + r.failed.length + (r.failed.length ? ' — ' + JSON.stringify(r.failed[0]) : '');
              } else {
                aiResultEl.textContent = '⚠️ لا توجد بلاغات في الجدول للجدولة';
              }
            } else {
              aiResultEl.textContent = '⚠️ الوكيل غير متاح';
            }
            break;
          case 'fill':
            if (lastFocused) { setNativeValue(lastFocused, parsed.value || commandText); aiResultEl.textContent = '✅ تمت التعبئة'; }
            else aiResultEl.textContent = '⚠️ اضغط على الحقل أولاً';
            break;
          case 'save':
          case 'close': {
            const btns = [
              document.getElementById('NextButton'),
              document.querySelector('input[value="حفظ و اغلاق"]'),
              document.querySelector('button[value="حفظ و اغلاق"]'),
              document.querySelector('input[value="Save and Close"]')
            ].filter(Boolean);
            if (btns.length) { btns[0].click(); aiResultEl.textContent = '✅ تم تنفيذ الحفظ/الإغلاق'; }
            else aiResultEl.textContent = '⚠️ لا يوجد زر حفظ في الصفحة';
            break;
          }
          default:
            aiResultEl.textContent = '❓ أمر غير معروف: ' + parsed.intent;
        }
      } catch (e) {
        aiResultEl.textContent = '❌ ' + String(e.message || e);
      } finally {
        aiBtn.disabled = false;
      }
    }

    function resolveDateText(text) {
      const t = String(text || '').toLowerCase();
      const d = new Date();
      if (t.includes('بعد يومين') || t.includes('بعد يومان')) d.setDate(d.getDate() + 2);
      else if (t.includes('غد')) d.setDate(d.getDate() + 1);
      else if (t.includes('أمس')) d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    function extractIdsFromPage() {
      const ids = [];
      const idRe = /\(([A-Fa-f0-9\-]{36})\)/;
      document.querySelectorAll('table tbody a[href*="workorder"]').forEach(a => {
        const m = (a.getAttribute('href') || '').match(idRe);
        if (m && !ids.includes(m[1])) ids.push(m[1]);
      });
      return ids;
    }

    aiBtn.addEventListener('click', () => {
      const text = resultEl.textContent.trim();
      if (!text) { statusEl.textContent = '⚠️ تكلم أولاً ثم اضغط الفهم والتنفيذ'; return; }
      runVoiceCommand(text);
    });

    // اقتراح خفيف: لو بدأ النص بكلمة تنفيذ، يبرز زر الـ AI
    resultEl.addEventListener('DOMSubtreeModified', () => {
      const t = resultEl.textContent.trim();
      if (/^(افتح|قفل|احفظ|جدول|نفذ|افعل|اغلق|اعمل)/.test(t) && t.length < 60) {
        aiBtn.style.boxShadow = '0 0 0 2px #2dd4bf';
        setTimeout(() => { aiBtn.style.boxShadow = ''; }, 1500);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
