document.addEventListener('DOMContentLoaded', () => {
  const statusCard = document.getElementById('statusCard');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const statusDetail = document.getElementById('statusDetail');
  const openPageBtn = document.getElementById('openPage');
  const resetBtn = document.getElementById('resetBtn');

  const PORTAL_URL =
    'https://elarabyiscrm2.azurewebsites.net/ASPPage/SelectReport.aspx';

  // ── Read state and update UI ──────────────────────────────
  chrome.storage.local.get('bsearchState', ({ bsearchState: state }) => {
    if (!state) {
      // No state – idle / ready
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
      // Currently searching
      statusCard.classList.add('pulse');
      statusCard.dataset.status = 'running';
      statusIcon.textContent = '🔄';
      statusText.textContent = 'جاري البحث';
      statusDetail.textContent = `${done} من ${total} بلاغ`;
      return;
    }

    if (state.done) {
      // Finished
      statusCard.dataset.status = 'done';
      statusIcon.textContent = '✅';
      statusText.textContent = 'اكتمل';
      statusDetail.textContent = `${found} تقرير من ${total} بلاغ`;
      resetBtn.style.display = 'block';
    }
  });


  // ── Open portal page ──────────────────────────────────────
  openPageBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: PORTAL_URL });
  });

  // ── Reset state ───────────────────────────────────────────
  resetBtn.addEventListener('click', () => {
    chrome.storage.local.remove(
      ['bsearchState', 'extWb', 'extSi', 'extRi'],
      () => window.location.reload()
    );
  });
});
