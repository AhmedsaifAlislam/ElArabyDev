// ==================== تبويب بحث بلاغات — CRM SelectReport ====================
// لوحة حالة فقط: تقرأ chrome.storage.local (bsearchState) وتفتح صفحة البحث.
// العملية الفعلية تعمل داخل content script معزول على SelectReport.aspx (port).

document.addEventListener('DOMContentLoaded', () => {
  const statusCard = document.getElementById('sr-status-card');
  const statusIcon = document.getElementById('sr-status-icon');
  const statusText = document.getElementById('sr-status-text');
  const statusDetail = document.getElementById('sr-status-detail');
  const openPageBtn = document.getElementById('sr-open-page');
  const resetBtn = document.getElementById('sr-reset-btn');

  const PORTAL_URL = 'https://elarabyiscrm2.azurewebsites.net/ASPPage/SelectReport.aspx';

  if (!statusCard) return;

  chrome.storage.local.get('bsearchState', ({ bsearchState: state }) => {
    if (!state) {
      statusIcon.textContent = '⏳';
      statusText.textContent = 'جاهز';
      statusDetail.textContent = 'افتح صفحة البورتال وارفع ملف Excel';
      return;
    }

    const total = state.sapList ? state.sapList.length : 0;
    const done = state.results ? state.results.length : 0;
    let found = 0;
    if (state.results) {
      state.results.forEach(r => {
        if (r.reports && r.reports.length > 0) found++;
      });
    }

    if (state.running) {
      statusCard.classList.add('pulse');
      statusCard.dataset.status = 'running';
      statusIcon.textContent = '🔄';
      statusText.textContent = 'جاري البحث';
      statusDetail.textContent = done + ' من ' + total + ' بلاغ';
      return;
    }

    if (state.done) {
      statusCard.dataset.status = 'done';
      statusIcon.textContent = '✅';
      statusText.textContent = 'اكتمل';
      statusDetail.textContent = found + ' تقرير من ' + total + ' بلاغ';
      if (resetBtn) resetBtn.style.display = 'block';
    }
  });

  openPageBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: PORTAL_URL });
  });

  resetBtn?.addEventListener('click', () => {
    chrome.storage.local.remove(
      ['bsearchState', 'extWb', 'extSi', 'extRi'],
      () => window.location.reload()
    );
  });
});