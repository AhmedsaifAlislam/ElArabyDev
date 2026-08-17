// ==UserScript==
// @name         El Araby Portal - Booking Automation (أتمتة حجز البلاغات)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  حجز جماعي للبلاغات: تعبئة تاريخ الزيارة وحفظ كل بلاغ تباعاً من جدول الحالات (يعمل داخل El Araby Unified System أو Tampermonkey)
// @author       Zain (AutoFiller)
// @match        https://elarabyportalpfs.powerappsportals.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  if (window.__elarabyBookingAutomationLoaded) return;
  window.__elarabyBookingAutomationLoaded = true;

  const STORE_KEY = 'elaraby_booking_automation';

  // ── مساعدات الجدول (GridView) ───────────────────────────
  function findGridRows() {
    // السجلات غالباً في جدول بامتدادات anchor على أرقام البلاغات (CaseNumber)
    const links = [];
    document.querySelectorAll('table tbody a[href*="workorder"]').forEach(a => {
      const m = a.getAttribute('href').match(/\(([A-Fa-f0-9\-]{36})\)/);
      const id = m ? m[1] : null;
      if (!id) return;
      links.push({ id, label: a.textContent.trim() || id.slice(0, 8), href: a.getAttribute('href') });
    });
    return links;
  }

  function parseIncidentIdFromUrl() {
    const u = new URL(window.location.href);
    return {
      incidentId: u.searchParams.get('id') || '',
      page: u.pathname.split('/').pop() || ''
    };
  }

  // ── تعبئة تاريخ الجدولة في صفحة البلاغ ─────────────────
  function fillScheduleDate(dateStr) {
    const nativeDateField = document.getElementById('ats_schedulebookdate');
    if (!nativeDateField) return { changed: false, reason: 'no_date_field' };

    nativeDateField.value = dateStr;
    nativeDateField.dispatchEvent(new Event('change', { bubbles: true }));
    nativeDateField.dispatchEvent(new Event('input', { bubbles: true }));

    const [yyyy, mm, dd] = dateStr.split('-');
    const displayField = document.getElementById('ats_schedulebookdate_datepicker_description');
    if (displayField) {
      displayField.value = `${dd}/${mm}/${yyyy}`;
      displayField.dispatchEvent(new Event('change', { bubbles: true }));
      displayField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { changed: true, reason: 'filled' };
  }

  function neutraliseValidation() {
    try {
      window.webFormClientValidate = function() { return true; };
      window.entityFormClientValidate = function() { return true; };
      if (typeof window.Page_ClientValidate !== 'undefined') {
        window.Page_ClientValidate = function() { return true; };
      }
      const errSum = document.getElementById('ValidationSummaryEntityFormView');
      if (errSum) errSum.style.display = 'none';
    } catch (_) {}
  }

  function clickSave() {
    const btns = [
      document.getElementById('NextButton'),
      document.querySelector('input[value="حفظ و اغلاق"]'),
      document.querySelector('button[value="حفظ و اغلاق"]'),
      document.querySelector('input[value="Save and Close"]')
    ].filter(Boolean);
    if (btns.length) {
      btns[0].click();
      return true;
    }
    return false;
  }

  function requestVerificationToken() {
    const el = document.querySelector('input[name="__RequestVerificationToken"]');
    return el ? el.value : '';
  }

  // ── تدفق حجز بلاغ واحد (PATCH عبر Web API — God Mode) ──
  async function scheduleViaApi(incidentId, dateStr) {
    const token = requestVerificationToken();
    if (!token) return { ok: false, error: 'لا يوجد توكن تحقق في الصفحة' };
    const res = await fetch(`/_api/incidents(${incidentId})`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        '__RequestVerificationToken': token,
        'Accept': 'application/json'
      },
      body: JSON.stringify({ "ats_schedulebookdate": `${dateStr}T08:00:00Z` })
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: 'HTTP ' + res.status + ': ' + (await res.text()).slice(0, 120) };
  }

  // ── الجدولة الحرة (تجاوز القيود) للبلاغ المفتوح ────────
  // مدمجة من ai/smart-scheduler.js — تعمل من صفحة المراجعة أو أي صفحة
  // بها بلاغ مفتوح: إما عبر النموذج (كسر التحقق) أو Web API (God Mode).
  async function scheduleIncidentFree(incidentId, dateStr, forceApi) {
    if (!incidentId) return { ok: false, error: 'لا يوجد incidentId في الصفحة' };
    try {
      const nativeDateField = document.getElementById('ats_schedulebookdate');

      // 1) في صفحة الكالندر وبدون God Mode: تعبئة + كسر التحقق + حفظ
      if (nativeDateField && !forceApi) {
        nativeDateField.value = dateStr;
        nativeDateField.dispatchEvent(new Event('change', { bubbles: true }));
        nativeDateField.dispatchEvent(new Event('input', { bubbles: true }));

        const [yyyy, mm, dd] = dateStr.split('-');
        const formattedDate = `${dd}/${mm}/${yyyy}`;
        const displayField = document.getElementById('ats_schedulebookdate_datepicker_description');
        if (displayField) {
          displayField.value = formattedDate;
          displayField.dispatchEvent(new Event('change', { bubbles: true }));
          displayField.dispatchEvent(new Event('input', { bubbles: true }));
        }

        neutraliseValidation();

        const nextBtn = document.getElementById('NextButton') ||
                        document.querySelector('input[value="حفظ و اغلاق"]');
        if (nextBtn) nextBtn.click();
        return { ok: true, result: `تم تعيين التاريخ (${formattedDate}) وتخطي القيد، وجارٍ إرسال الصفحة.` };
      }

      // 2) God Mode: PATCH مباشر عبر Web API (يعمل من أي صفحة)
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
      const response = await fetch(`/_api/incidents(${incidentId})`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          '__RequestVerificationToken': token,
          'Accept': 'application/json'
        },
        body: JSON.stringify({ "ats_schedulebookdate": `${dateStr}T08:00:00Z` })
      });

      if (response.ok) {
        setTimeout(() => window.location.reload(), 1200);
        return { ok: true, result: `تمت جدولة البلاغ ${incidentId} بنجاح (God Mode) لتاريخ ${dateStr}.` };
      }
      const errText = await response.text();
      return {
        ok: false,
        error: 'لم يستجب السيرفر لوضع God Mode (قد يكون الـ Web API مغلقاً). ' +
               'الحل: الوصول لصفحة الكالندر ثم الجدولة بدون God Mode. تفاصيل: ' + errText.slice(0, 200)
      };
    } catch (error) {
      return { ok: false, error: 'خطأ غير متوقع: ' + (error.message || error) };
    }
  }

  // ── اللوحة العائمة الموحدة ─────────────────────────────
  function buildUI() {
    if (document.getElementById('elaraby-booking-automation')) return;

    const wrap = document.createElement('div');
    wrap.id = 'elaraby-booking-automation';
    wrap.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:999990;width:320px;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:14px;font-family:Cairo,Tahoma,sans-serif;direction:rtl;font-size:12px;color:#222;display:none;';

    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e3c72;padding-bottom:8px;margin-bottom:10px;">
        <b style="color:#1e3c72;">⚡📅 الحجز والجدولة الحرة</b>
        <button id="elaraby-ba-close" style="border:none;background:none;font-size:15px;cursor:pointer;">✕</button>
      </div>
      <label style="display:block;font-weight:700;margin-bottom:4px;">تاريخ الزيارة:</label>
      <input type="date" id="elaraby-ba-date" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:11px;color:#666;">
        <input type="checkbox" id="elaraby-ba-force"> إرسال مباشر عبر Web API (God Mode)
      </label>
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:11px;color:#666;">
        <input type="checkbox" id="elaraby-ba-multi"> 🔀 توزيع على التبويبات (جلسات متعددة)
      </label>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button id="elaraby-ba-single" style="flex:1;padding:8px;border:none;border-radius:6px;background:#1e3c72;color:#fff;font-weight:700;cursor:pointer;">📅 جدولة البلاغ المفتوح</button>
      </div>
      <p style="margin:2px 0 8px;font-size:10px;color:#888;line-height:1.5;">جدولة حرة للبلاغ المفتوح حالياً في الصفحة — يتجاوز قيود عدد الأيام وعدد مرات الجدولة (يعتمد على صلاحيات السيرفر).</p>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <button id="elaraby-ba-start" style="flex:1;padding:8px;border:none;border-radius:6px;background:#28a745;color:#fff;font-weight:700;cursor:pointer;">▶ حجز جماعي (الجدول كله)</button>
        <button id="elaraby-ba-stop" style="flex:1;padding:8px;border:none;border-radius:6px;background:#b71c1c;color:#fff;font-weight:700;cursor:pointer;" disabled>⏹ إيقاف</button>
      </div>
      <div id="elaraby-ba-status" style="background:#f5f6fa;border-radius:6px;padding:8px;font-size:11px;line-height:1.8;max-height:150px;overflow-y:auto;white-space:pre-wrap;">جاهز.</div>
    `;

    const fab = document.createElement('button');
    fab.id = 'elaraby-ba-fab';
    fab.innerHTML = '⚡📅';
    fab.title = 'الحجز والجدولة الحرة';
    fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999991;width:52px;height:52px;border-radius:50%;border:none;background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;font-size:18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
    fab.onclick = () => { wrap.style.display = wrap.style.display === 'block' ? 'none' : 'block'; };

    wrap.querySelector('#elaraby-ba-close').onclick = () => wrap.style.display = 'none';
    document.body.appendChild(fab);

    // تفضيلات المستخدم: التاريخ المفضل يُعبأ تلقائياً
    const dateInput = document.getElementById('elaraby-ba-date');
    applyPreferredDate(dateInput);
    document.body.appendChild(wrap);

    let running = false;
    let stopped = false;
    const status = document.getElementById('elaraby-ba-status');
    const setStatus = line => {
      status.textContent = line + '\n' + document.getElementById('elaraby-ba-date').dataset.lastNote || line;
      status.textContent = line;
    };

    function persist(state) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
    }
    function loadState() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (_) { return {}; }
    }

    async function runBatch(dateStr, forceApi) {
      if (!sessionAlive()) {
        setStatus('⛔ الجلسة منتهية — سجّل الدخول في البورتال ثم اضغط ▶ للاستئناف');
        document.getElementById('elaraby-ba-start').disabled = false;
        document.getElementById('elaraby-ba-stop').disabled = true;
        return;
      }
      const multiMode = document.getElementById('elaraby-ba-multi').checked;
      const coordinator = window.__eaTabCoordinator;
      const info = parseIncidentIdFromUrl();

      // ── وضع التوزيع على التبويبات: صفحة بلاغ مفتوحة ──
      if (multiMode && info.incidentId && coordinator) {
        // حجز البلاغ المفتوح (المطالب به من تبويب آخر) ثم أعلن إتمامه
        const pool = coordinator.getPool();
        if (pool && pool.active && pool.date === dateStr) {
          setStatus('⏳ [🔀] حجز البلاغ: ' + info.incidentId + ' → ' + dateStr);
          let res;
          if (forceApi) res = await scheduleViaApi(info.incidentId, dateStr);
          else {
            const fill = fillScheduleDate(dateStr);
            if (!fill.changed) { setStatus('⚠️ لا يوجد حقل تاريخ — إيقاف.'); stopped = true; return; }
            neutraliseValidation();
            clickSave();
            res = { ok: true, mode: 'form' };
          }
          if (res.ok) {
            coordinator.markDone(info.incidentId);
            digestRecord('scheduled', { incidentId: info.incidentId, date: dateStr, mode: forceApi ? 'api' : 'form', multi: true });
            toolsLog('INCIDENT_SCHEDULED', { incidentId: info.incidentId, date: dateStr, mode: forceApi ? 'api' : 'form', multi: true });
            setStatus('✅ [🔀] تم حجز ' + info.incidentId + ' — العودة للتجمع...');
            setTimeout(() => { window.location.href = window.location.pathname; }, 1200);
          } else {
            coordinator.markFailed(info.incidentId);
            setStatus('❌ فشل ' + info.incidentId + ': ' + (res.error || ''));
          }
          return;
        }
      }

      // 1) صفحة بلاغ (workorderreview مع id): احجز ثم عد للقائمة
      if (info.incidentId && info.page === 'workorderreview') {
        setStatus('⏳ حجز البلاغ: ' + info.incidentId + ' → ' + dateStr);
        let res;
        if (forceApi) {
          res = await scheduleViaApi(info.incidentId, dateStr);
        } else {
          const fill = fillScheduleDate(dateStr);
          if (!fill.changed) { setStatus('⚠️ هذا البلاغ لا يحتوي حقل تاريخ الجدولة — إيقاف.'); stopped = true; return; }
          neutraliseValidation();
          clickSave();
          res = { ok: true, mode: 'form' };
        }
        if (!res.ok) {
          setStatus('❌ فشل حجز ' + info.incidentId + ': ' + (res.error || ''));
          return;
        }
        setStatus('✅ تم حجز ' + info.incidentId);
        digestRecord('scheduled', { incidentId: info.incidentId, date: dateStr, mode: forceApi ? 'api' : 'form' });
        toolsLog('INCIDENT_SCHEDULED', { incidentId: info.incidentId, date: dateStr, mode: forceApi ? 'api' : 'form' });
        persist({ date: dateStr, force: forceApi, done: [...(loadState().done || []), info.incidentId], running: true });
        // نقطة استئناف لحارس الجلسة: آخر بلاغ مكتمل
        try {
          const g = window.__eaSessionGuardian;
          if (g && typeof g.clearResume === 'function') g.clearResume();
        } catch (_) {}
        // عودة لقائمة الحالات (قد تكون القائمة هي نفسها بالفلتر — يحمل الصفحة الأصلية)
        setTimeout(() => { window.location.href = window.location.pathname; }, 1200);
        return;
      }

      // 2) صفحة القائمة (جدول): التقط الروابط وتنقل بلاغاً بلاغاً
      const rows = findGridRows();

      // ── وضع التوزيع: أنشئ التجمع أو طالب ببلاغ حر ──
      if (multiMode && coordinator) {
        if (!coordinator.isPoolActive()) {
          const ids = rows.map(r => r.id).filter(Boolean);
          coordinator.initPool(ids, dateStr, forceApi);
          setStatus('🔀 أنشأتُ تجمعاً من ' + ids.length + ' بلاغ — وزّع على تبويباتك الآن');
          persist({ ...loadState(), date: dateStr, force: forceApi, running: true, multi: true });
          return;
        }
        const claim = coordinator.claimNext();
        if (!claim.ok) {
          if (claim.done) {
            setStatus('✅ [🔀] انتهى التجمع — كل البلاغات محجوزة');
            persist({ ...loadState(), running: false, multi: true });
            return;
          }
          setStatus('⏳ [🔀] بلاغات أخرى قيد العمل حالياً — أستأنف بعد ثوانٍ...');
          setTimeout(() => runBatch(dateStr, forceApi), 4000);
          return;
        }
        const row = rows.find(r => r.id === claim.id);
        setStatus('🔄 [🔀] بلاغ ' + (row ? row.label : claim.id.slice(0, 8)) + ' — تم قفله لي');
        persist({ ...loadState(), date: dateStr, force: forceApi, running: true, multi: true });
        if (row && row.href) { window.location.href = row.href; return; }
        coordinator.markFailed(claim.id);
        setStatus('❌ لا رابط للبلاغ ' + claim.id.slice(0, 8) + ' — أتابع...');
        setTimeout(() => runBatch(dateStr, forceApi), 1500);
        return;
      }

      const state = loadState();
      const remaining = rows.filter(r => !(state.done || []).includes(r.id));
      if (!rows.length) {
        setStatus('⚠️ لم أجد روابط بلاغات في الجدول (ابحث عن أعمدة CaseNumber بروابط workorder).');
        return;
      }
      if (!remaining.length) {
        setStatus('✅ انتهى الحجز — كل ' + rows.length + ' بلاغ محجوز.');
        persist({ ...state, running: false });
        return;
      }
      const next = remaining[0];
      setStatus('🔄 بلاغ ' + next.label + ' (' + remaining.length + ' متبقي)');
      if (!next.href) {
        setStatus('❌ لا يوجد رابط للبلاغ ' + next.label);
        return;
      }
      persist({ ...state, date: dateStr, force: forceApi, running: true });
      window.location.href = next.href;
    }

    document.getElementById('elaraby-ba-single').onclick = async () => {
      const dateStr = document.getElementById('elaraby-ba-date').value;
      const forceApi = document.getElementById('elaraby-ba-force').checked;
      if (!dateStr) { setStatus('⚠️ اختر تاريخاً أولاً'); return; }
      if (!sessionAlive()) {
        setStatus('⛔ الجلسة منتهية — سجّل الدخول في البورتال أولاً ثم أعد المحاولة');
        return;
      }
      recordPref('bookingDate', dateStr);
      recordPref('useGodMode', forceApi);
      const info = parseIncidentIdFromUrl();
      if (!info.incidentId) {
        setStatus('⚠️ لا يوجد بلاغ مفتوح في الصفحة — افتح بلاغاً أولاً (صفحة المراجعة)');
        return;
      }
      setStatus('⏳ جدولة البلاغ ' + info.incidentId + ' → ' + dateStr + (forceApi ? ' (God Mode)' : ''));
      const res = await scheduleIncidentFree(info.incidentId, dateStr, forceApi);
      if (res.ok) { setStatus('✅ ' + (res.result || 'تمت الجدولة')); }
      else {
        setStatus('❌ ' + (res.error || 'فشل'));
        if (String(res.error).includes('401') || String(res.error).includes('403')) {
          stopByGuardian();
          setStatus('⛔ الجلسة منتهية — سجّل الدخول ثم استأنف من نقطة التوقف');
        }
      }
    };
    document.getElementById('elaraby-ba-start').onclick = () => {
      const dateStr = document.getElementById('elaraby-ba-date').value;
      const forceApi = document.getElementById('elaraby-ba-force').checked;
      if (!dateStr) { setStatus('⚠️ اختر تاريخاً أولاً'); return; }
      if (!sessionAlive()) {
        setStatus('⛔ الجلسة منتهية — سجّل الدخول في البورتال أولاً ثم أعد المحاولة');
        return;
      }
      recordPref('bookingDate', dateStr);
      recordPref('useGodMode', forceApi);
      stopped = false;
      document.getElementById('elaraby-ba-start').disabled = true;
      document.getElementById('elaraby-ba-stop').disabled = false;
      setStatus('▶ بدء التشغيل...');
      runBatch(dateStr, forceApi);
    };
    document.getElementById('elaraby-ba-stop').onclick = () => {
      stopped = true;
      document.getElementById('elaraby-ba-start').disabled = false;
      document.getElementById('elaraby-ba-stop').disabled = true;
      setStatus('⏹ تم الإيقاف');
      // تحرير أقفال هذا التبويب من تجمع التوزيع
      try {
        const c = window.__eaTabCoordinator;
        if (c && typeof c.releaseAll === 'function') c.releaseAll();
      } catch (_) {}
      persist({ ...loadState(), running: false });
    };

    // استئناف تلقائي بعد إعادة التحميل (انتقال بلاغ ← قائمة)
    const st = loadState();
    if (st.running && st.date) {
      document.getElementById('elaraby-ba-date').value = st.date;
      document.getElementById('elaraby-ba-force').checked = !!st.force;
      const multiEl = document.getElementById('elaraby-ba-multi');
      if (multiEl) multiEl.checked = !!st.multi;
      wrap.style.display = 'block';
      fab.remove();
      if (!sessionAlive()) {
        setStatus('⛔ الجلسة منتهية أثناء الحجز — سجّل الدخول في البورتال ثم اضغط ▶ للاستئناف');
        persist({ ...st, running: false });
        return;
      }
      setTimeout(() => runBatch(st.date, st.force), 800);
    }
  }

  // ── التشغيل ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    setTimeout(buildUI, 1200);
  }

  // ── فحص الجلسة قبل كل حجز (Session Guardian) ──
  function sessionAlive() {
    try {
      const g = window.__eaSessionGuardian;
      if (g && typeof g.isAlive === 'function') return g.isAlive();
      return true;
    } catch (_) { return true; }
  }

  function stopByGuardian() {
    try {
      const g = window.__eaSessionGuardian;
      if (g && typeof g.stopWork === 'function') g.stopWork();
    } catch (_) {}
  }

  // ── تسجيل/استرجاع تفضيلات المستخدم ──
  function prefsMemory() {
    try { return window.__eaPrefsMemory || null; } catch (_) { return null; }
  }

  function applyPreferredDate(inputEl) {
    const p = prefsMemory();
    if (p && typeof p.applyToForm === 'function') return p.applyToForm(inputEl);
    return null;
  }

  function recordPref(pref, value) {
    const p = prefsMemory();
    if (p && typeof p.record === 'function') p.record(pref, value);
  }

  // تسجيل حدث في التقرير اليومي (Daily Digest)
  function digestRecord(type, payload) {
    try {
      const d = window.__eaDailyDigest;
      if (d && typeof d.record === 'function') d.record(type, payload);
    } catch (_) {}
  }

  // تسجيل في اللوج الذكي عبر الجسر (tools-bridge)
  function toolsLog(eventType, details) {
    try {
      const t = window.__eaToolsLog;
      if (t && typeof t === 'function') t({ eventType, kind: 'info', label: eventType, details });
    } catch (_) {}
  }

  // فتح مباشر من الفابز/اللوحة عبر الـ runner (يتجاوز الفاب المخفي وتأخير البناء)
  window.__elarabyBookingOpen = function() {
    if (!document.getElementById('elaraby-booking-automation')) buildUI();
    const w = document.getElementById('elaraby-booking-automation');
    if (w) w.style.display = 'block';
  };

})();