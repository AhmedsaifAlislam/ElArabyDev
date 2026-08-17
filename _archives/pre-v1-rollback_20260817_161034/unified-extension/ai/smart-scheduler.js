// ai/smart-scheduler.js — الجدولة الذكية (Port of smart-scheduler.js v1.1)
// يعمل على صفحة workorderreview: تجاوز قيود عدد الأيام وعدد مرات الجدولة.
// مصدر: "Rescheduling Portal Requests Optimization/smart-scheduler.js"
// يصدّر: window.elarabyRescheduling = { scheduleIncident, openSchedulerModal, isReviewPage }

(function(global) {
  'use strict';

  if (global.__elarabySmartSchedulerLoaded) return;
  global.__elarabySmartSchedulerLoaded = true;

  const api = global.elarabyRescheduling = {};

  // ── التحقق من الصفحة ────────────────────────────────────
  function isReviewPage() {
    const url = new URL(global.location.href);
    return !!(url.searchParams.get('id') &&
              global.location.href.toLowerCase().includes('workorderreview'));
  }
  api.isReviewPage = isReviewPage;

  // ── الزر العائم ─────────────────────────────────────────
  function injectButton() {
    if (document.getElementById('smart-schedule-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'smart-schedule-btn';
    btn.innerHTML = '📅 جدولة حرة (بدون قيود)';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      zIndex: '99999',
      padding: '12px 20px',
      background: 'linear-gradient(135deg, #1e3c72, #2a5298)',
      color: 'white',
      border: 'none',
      borderRadius: '50px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      fontFamily: 'Cairo, Tahoma, sans-serif',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'transform 0.2s',
      direction: 'rtl'
    });

    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    btn.onclick = openSchedulerModal;

    document.body.appendChild(btn);
  }

  // ── النافذة المنبثقة (Modal) ────────────────────────────
  function openSchedulerModal(forceApiDefault) {
    if (document.getElementById('smart-scheduler-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'smart-scheduler-modal';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '100000',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      fontFamily: 'Cairo, Tahoma, sans-serif', direction: 'rtl'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      background: '#fff', padding: '25px', borderRadius: '12px',
      width: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      textAlign: 'right'
    });

    modal.innerHTML = `
      <h3 style="margin-top:0; color:#1e3c72; border-bottom:2px solid #eee; padding-bottom:10px;">جدولة البلاغ - وضع تجاوز القيود</h3>
      <label style="display:block; margin-bottom:8px; font-weight:bold; color:#333;">اختر تاريخ الزيارة القادمة (مفتوح):</label>
      <input type="date" id="custom-schedule-date" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:20px; font-size:16px;">

      <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border: 1px solid #ddd; margin-bottom:20px;">
        <label style="cursor: pointer; font-weight: bold; color: #d32f2f; display:flex; align-items:center;">
          <input type="checkbox" id="force-api-mode" style="margin-left: 8px; transform: scale(1.2);" ${forceApiDefault ? 'checked' : ''}>
          🔥 استخدام وضع (God Mode)
        </label>
        <p style="margin: 8px 0 0 0; font-size: 11px; color: #666; line-height:1.4;">
          حدد هذا الخيار لجدولة البلاغ من أي صفحة وفي أي حالة دون الحاجة للمرور بالخطوات (يعتمد على صلاحيات السيرفر).
        </p>
      </div>

      <div style="display:flex; justify-content:space-between;">
        <button id="btn-cancel-schedule" style="padding:8px 15px; border:none; border-radius:6px; background:#ccc; color:#333; cursor:pointer; font-weight:bold;">إلغاء</button>
        <button id="btn-confirm-schedule" style="padding:8px 15px; border:none; border-radius:6px; background:#28a745; color:#fff; cursor:pointer; font-weight:bold;">تأكيد الحفظ</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-cancel-schedule').onclick = () => overlay.remove();
    document.getElementById('btn-confirm-schedule').onclick = () => {
      const dateVal = document.getElementById('custom-schedule-date').value;
      const forceApi = document.getElementById('force-api-mode').checked;

      if (!dateVal) {
        alert('الرجاء اختيار تاريخ!');
        return;
      }

      overlay.remove();
      scheduleIncident(getIncidentId(), dateVal, forceApi);
    };
  }
  api.openSchedulerModal = openSchedulerModal;

  function getIncidentId() {
    return new URL(global.location.href).searchParams.get('id');
  }

  // ── محرك تجاوز القيود (Bypass Engine) ──────────────────
  async function scheduleIncident(incidentId, dateStr, forceApi) {
    if (!incidentId) return { ok: false, error: 'لا يوجد incidentId في الصفحة' };
    try {
      const nativeDateField = document.getElementById('ats_schedulebookdate');

      // الحالة الأولى: في صفحة الكالندر وبدون God Mode
      if (nativeDateField && !forceApi) {
        nativeDateField.value = dateStr;

        const [yyyy, mm, dd] = dateStr.split('-');
        const formattedDate = `${dd}/${mm}/${yyyy}`;

        const displayField = document.getElementById('ats_schedulebookdate_datepicker_description');
        if (displayField) {
          displayField.value = formattedDate;
          displayField.dispatchEvent(new Event('change', { bubbles: true }));
          displayField.dispatchEvent(new Event('input', { bubbles: true }));
        }

        window.webFormClientValidate = function() { return true; };
        window.entityFormClientValidate = function() { return true; };
        if (typeof Page_ClientValidate !== 'undefined') {
          window.Page_ClientValidate = function() { return true; };
        }

        const errorSummary = document.getElementById('ValidationSummaryEntityFormView');
        if (errorSummary) errorSummary.style.display = 'none';

        const nextBtn = document.getElementById('NextButton') ||
                        document.querySelector('input[value="حفظ و اغلاق"]');
        if (nextBtn) nextBtn.click();
        return { ok: true, result: `تم تعيين التاريخ (${formattedDate}) وتخطي القيد، وجارٍ إرسال الصفحة.` };
      }

      // الحالة الثانية: God Mode (تجاوز السيرفر والخطوات)
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
      const payload = { "ats_schedulebookdate": `${dateStr}T08:00:00Z` };

      const response = await fetch(`/_api/incidents(${incidentId})`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          '__RequestVerificationToken': token,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setTimeout(() => global.location.reload(), 1200);
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
  api.scheduleIncident = scheduleIncident;

  // ── خدعة الصفحة الثالثة: إيقاف التحقق المانع ───────────
  function bypassPage3Validation() {
    const interceptor = setInterval(() => {
      if (typeof window.webFormClientValidate === 'function') {
        const originalWebFormClientValidate = window.webFormClientValidate;

        window.webFormClientValidate = function() {
          const errorMsg = document.querySelector('.validation-summary');
          if (errorMsg) errorMsg.style.display = 'none';
          return true;
        };

        if (typeof window.Page_ClientValidate === 'function') {
          window.Page_ClientValidate = function() { return true; };
        }

        clearInterval(interceptor);
        console.log('[Smart Scheduler] Page 3 Validation successfully neutralized.');
      }
    }, 500);
  }

  // ── التشغيل ─────────────────────────────────────────────
  // ملاحظة: الزر العائم أُوقف — الجدولة الحرة موحدة الآن داخل
  // سكربت أتمتة الحجز (فاب ⚡📅 من الباز/التمبر مونكي).
  // يبقى هذا الملف API فقط للمساعد الذكي (scheduler-tools.js).
  if (isReviewPage()) {
    setTimeout(() => {
      bypassPage3Validation();
    }, 1500);
  }

})(typeof globalThis !== 'undefined' ? globalThis : window);