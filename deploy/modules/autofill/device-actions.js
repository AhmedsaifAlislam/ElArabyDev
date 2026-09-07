// =========================================================
// device-actions.js — Device Inspection & Maintenance Actions
// Component: Device Actions Subsystem
// =========================================================
'use strict';

(() => {
  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    const colors = { info: '#17334c', success: '#10b981', error: '#ef4444', warn: '#f59e0b' };
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999,
      padding: '12px 20px', borderRadius: '8px', background: colors[type] || '#17334c',
      color: '#fff', fontFamily: 'Cairo, sans-serif', fontSize: '13px',
      fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transition: 'opacity 0.3s', direction: 'rtl'
    });
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function notifyStatus(msg, type = 'info') {
    if (typeof window.setSearchStatus === 'function') {
      window.setSearchStatus(msg, type);
    }
  }

  async function extractDeviceData() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { notifyStatus('افتح صفحة البلاغ أولاً', 'warn'); return; }
    const url = tab.url || '';
    if (!url.includes('workorderreview') && !url.includes('Reportdetail') && !url.includes('technicalreviewdetails')) {
      notifyStatus('افتح صفحة workorderreview أو Reportdetail أو technicalreviewdetails أولاً', 'warn');
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_DEVICE_DATA' });
      window.close();
    } catch (e) {
      notifyStatus('فشل إرسال الأمر: ' + e.message, 'error');
    }
  }

  async function openTechnicalArchive() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      if (!tab.url?.includes('powerappsportals.com')) {
        alert('افتح أي صفحة في البوابة أولاً');
        return;
      }
      const orderIdMatch = tab.url.match(/id=([^&]+)/);
      if (!orderIdMatch) {
        alert('لم يتم العثور على رقم البلاغ في الرابط');
        return;
      }
      const orderId = orderIdMatch[1];
      const archiveUrl = `https://elarabyportalpfs.powerappsportals.com/en-US/technicalreviewdetails/?id=${orderId}`;
      chrome.tabs.update(tab.id, { url: archiveUrl });
      window.close();
    } catch(e) {
      console.error('Error opening archive', e);
    }
  }

  function showClearDeviceDialog() {
    return new Promise(resolve => {
      const existing = document.getElementById('ea-clear-device-dialog');
      if (existing) existing.remove();
      
      const dialog = document.createElement('div');
      dialog.id = 'ea-clear-device-dialog';
      Object.assign(dialog.style, {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1000000, direction: 'rtl', fontFamily: 'Cairo, sans-serif',
        background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
        padding: '20px', minWidth: '320px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      });
      
      dialog.innerHTML = `
        <div style="font-size:14px; font-weight:700; color:#e2e8f0; margin-bottom:8px;">
          ⚠️ مسح بيانات الجهاز
        </div>
        <div style="font-size:12px; color:#94a3b8; margin-bottom:16px; line-height:1.6;">
          اختر نوع المسح:<br>
          <span style="color:#60a5fa;"><strong>نعم</strong></span> — مسح كل شيء (المرئي + المخفي)<br>
          <span style="color:#fbbf24;"><strong>الحقول المخفية فقط</strong></span> — مسح GUIDs/EntityNames فقط، الإبقاء على القيم المرئية<br>
          <span style="color:#f87171;"><strong>لا</strong></span> — إلغاء
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button id="ea-clear-all" class="btn btn-danger" style="flex:1;">🗑️ نعم — مسح الكل</button>
          <button id="ea-clear-hidden" class="btn btn-warning" style="flex:1;">🔧 الحقول المخفية فقط</button>
          <button id="ea-clear-cancel" class="btn btn-secondary" style="flex:1;">❌ لا</button>
        </div>
      `;
      
      document.body.appendChild(dialog);
      
      document.getElementById('ea-clear-all').onclick = () => { dialog.remove(); resolve('all'); };
      document.getElementById('ea-clear-hidden').onclick = () => { dialog.remove(); resolve('hidden-only'); };
      document.getElementById('ea-clear-cancel').onclick = () => { dialog.remove(); resolve('cancel'); };
      
      dialog.addEventListener('click', (e) => { if (e.target === dialog) { dialog.remove(); resolve('cancel'); } });
      const escHandler = (e) => { if (e.key === 'Escape') { dialog.remove(); resolve('cancel'); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);
    });
  }

  async function handleClearDeviceData(sourceBtnId = 'btn-clear-device-data') {
    const choice = await showClearDeviceDialog();
    if (!choice || choice === 'cancel') return;
    
    const btn = document.getElementById(sourceBtnId);
    const oldText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ جاري المسح...';
    }
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const resp = await chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_DEVICE_DATA', mode: choice });
        if (resp?.ok) {
          showToast(`✅ تم المسح (${choice === 'all' ? 'الكل' : 'الحقول المخفية فقط'})`, 'success');
          notifyStatus(`تم مسح بيانات الجهاز: ${resp.cleared?.length || 0} حقل`, 'ok');
        } else {
          showToast('⚠️ لم يتم العثور على حقول للمسح', 'warn');
          notifyStatus('لم يتم العثور على حقول للمسح', 'warn');
        }
      } else {
        showToast('❌ لا يوجد تبويب نشط على البورتال', 'error');
        notifyStatus('لا يوجد تبويب نشط على البورتال', 'error');
      }
    } catch (e) {
      showToast('❌ خطأ: ' + e.message, 'error');
      notifyStatus('خطأ: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || '🗑️ مسح بيانات الجهاز';
      }
    }
  }

  function initDeviceActions() {
    document.getElementById('btn-extract-device')?.addEventListener('click', extractDeviceData);
    document.getElementById('btn-technical-archive')?.addEventListener('click', openTechnicalArchive);
    document.getElementById('btn-clear-device-data')?.addEventListener('click', () => handleClearDeviceData('btn-clear-device-data'));
    document.getElementById('btn-settings-clear-device')?.addEventListener('click', () => handleClearDeviceData('btn-settings-clear-device'));
  }

  window.DeviceActions = {
    init: initDeviceActions,
    extractDeviceData,
    openTechnicalArchive,
    showClearDeviceDialog,
    handleClearDeviceData
  };
})();
