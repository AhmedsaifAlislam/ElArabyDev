// ==UserScript==
// @name         El Araby Portal - Smart Scheduler (الجدولة الذكية)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  تجاوز قيود عدد الأيام ومرات الجدولة في بوابة العربي (بدون مكتبات خارجية)
// @author       Zain (AutoFiller)
// @match        https://elarabyportalpfs.powerappsportals.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. التحقق من أننا داخل صفحة البلاغ
    const url = new URL(window.location.href);
    const incidentId = url.searchParams.get('id');
    
    if (!incidentId || !window.location.href.toLowerCase().includes('workorderreview')) {
        return;
    }

    // 2. تصميم وحقن زر الجدولة العائم
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

    // 3. بناء نافذة منبثقة (Modal) أصلية بدون الاعتماد على مكتبات خارجية
    function openSchedulerModal() {
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
                    <input type="checkbox" id="force-api-mode" style="margin-left: 8px; transform: scale(1.2);">
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

        // Events
        document.getElementById('btn-cancel-schedule').onclick = () => overlay.remove();
        document.getElementById('btn-confirm-schedule').onclick = () => {
            const dateVal = document.getElementById('custom-schedule-date').value;
            const forceApi = document.getElementById('force-api-mode').checked;
            
            if (!dateVal) {
                alert('الرجاء اختيار تاريخ!');
                return;
            }
            
            overlay.remove();
            executeSchedule(dateVal, forceApi);
        };
    }

    // 4. محرك تجاوز القيود (Bypass Engine)
    async function executeSchedule(dateStr, forceApi) {
        try {
            const nativeDateField = document.getElementById('ats_schedulebookdate');
            
            // الحالة الأولى: نحن متواجدون بالفعل في الصفحة الرابعة (صفحة الكالندر) ولم نطلب God Mode
            if (nativeDateField && !forceApi) {
                
                // حقن التاريخ في الحقل المخفي
                nativeDateField.value = dateStr; 
                
                // حقن التاريخ في الحقل الظاهر للصيغة DD/MM/YYYY
                const [yyyy, mm, dd] = dateStr.split('-');
                const formattedDate = `${dd}/${mm}/${yyyy}`; 
                
                const displayField = document.getElementById('ats_schedulebookdate_datepicker_description');
                if (displayField) {
                    displayField.value = formattedDate;
                    displayField.dispatchEvent(new Event('change', {bubbles:true}));
                    displayField.dispatchEvent(new Event('input', {bubbles:true}));
                }

                // تعطيل دوال التحقق الخاصة بالبوابة لتجاوز قيد اليومين
                window.webFormClientValidate = function() { return true; };
                window.entityFormClientValidate = function() { return true; };
                if (typeof Page_ClientValidate !== 'undefined') {
                    window.Page_ClientValidate = function() { return true; };
                }
                
                // مسح أي رسائل خطأ سابقة
                const errorSummary = document.getElementById('ValidationSummaryEntityFormView');
                if(errorSummary) errorSummary.style.display = 'none';

                alert('✅ تم تعيين التاريخ وتخطي القيد. جاري إرسال الصفحة الآن.');
                const nextBtn = document.getElementById('NextButton') || document.querySelector('input[value="حفظ و اغلاق"]');
                if (nextBtn) nextBtn.click();
                
                return;
            }

            // الحالة الثانية: استخدام God Mode (تجاوز السيرفر والخطوات)
            const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
            const payload = {
                "ats_schedulebookdate": `${dateStr}T08:00:00Z` // تعيين التاريخ
            };
            
            // إرسال الطلب مباشرة لقاعدة بيانات البوابة عبر الـ Web API
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
                alert('🔥 نجاح باهر! (God Mode)\\nتمت جدولة البلاغ بنجاح في الخلفية وتجاوز كافة خطوات وقيود البوابة!');
                location.reload();
            } else {
                console.error("API Error Response:", await response.text());
                alert('⚠️ لم يستجب السيرفر للوضع المخفي.\\n\\nالـ Web API مغلق من قبل إدارة النظام.\\nالحل: يرجى الوصول لصفحة الكالندر بشكل طبيعي، ثم الضغط على "جدولة حرة" *بدون* تفعيل خيار God Mode.');
            }
        } catch (error) {
            alert('خطأ غير متوقع: ' + error.message);
        }
    }

    // 5. خدعة الصفحة الثالثة: إيقاف التحقق المانع للمرور للصفحة الرابعة
    function bypassPage3Validation() {
        const interceptor = setInterval(() => {
            if (typeof window.webFormClientValidate === 'function') {
                const originalWebFormClientValidate = window.webFormClientValidate;
                
                window.webFormClientValidate = function() {
                    const errorMsg = document.querySelector('.validation-summary');
                    if(errorMsg) errorMsg.style.display = 'none';
                    return true; 
                };
                
                if (typeof window.Page_ClientValidate === 'function') {
                     window.Page_ClientValidate = function() { return true; };
                }
                
                clearInterval(interceptor);
                console.log("[Smart Scheduler] Page 3 Validation successfully neutralized.");
            }
        }, 500);
    }

    // تشغيل الإضافات
    setTimeout(() => {
        injectButton();
        bypassPage3Validation();
    }, 1500);

})();
