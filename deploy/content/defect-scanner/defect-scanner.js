/* ==============================================================
   defect-scanner.js — Defect Code & Report Audit Scanner
   محرك فحص أكواد الأعطال والتقارير في صفحة التقارير
   يعمل حصرياً في: /en-US/ReportList/
   ============================================================== */
(function () {
  'use strict';

  // ── Guard: فقط في صفحة التقارير ──
  if (!location.pathname.includes('/ReportList')) return;

  const SLEEP = ms => new Promise(r => setTimeout(r, ms));
  const BASE = 'https://elarabyportalpfs.powerappsportals.com';
  const STORAGE_KEY = 'ds_results_v1';

  // ── نمط الفحص الصارم المعتمد ──
  const KEYWORD_REGEX = /(تم\s+تغيير|تم\s+التغيير)/;

  // ── حالة النظام ──
  const state = {
    running: false,
    stop: false,
    results: [],
    total: 0,
    checked: 0,
    targets: 0,
    skipped: 0,
    periodDays: 30,        // 30, 90, 7, -1 (الكل), 0 (مخصص)
    scope: 'all',          // 'all' = كل الصفحات, 'current' = الصفحة الحالية فقط
  };

  /* ================================================================
     1. حقن CSS
     ================================================================ */
  function injectCSS() {
    if (document.getElementById('ds-style')) return;
    const link = document.createElement('link');
    link.id = 'ds-style';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/defect-scanner/defect-scanner.css');
    document.head.appendChild(link);
  }

  /* ================================================================
     2. بناء واجهة التحكم (UI)
     ================================================================ */
  function buildUI() {
    if (document.getElementById('ds-fab')) return;

    // الزر العائم
    const fab = document.createElement('button');
    fab.id = 'ds-fab';
    fab.type = 'button';
    fab.innerHTML = '<span class="ds-fab-icon">🛠️</span><span>فحص الأعطال</span>';
    fab.title = 'فحص تقارير البلاغات وأكواد الأعطال';
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
    document.body.appendChild(fab);

    // لوحة التحكم
    const panel = document.createElement('div');
    panel.id = 'ds-panel';
    panel.innerHTML = `
      <div class="ds-panel-header" id="ds-drag-handle">
        <span class="ds-panel-title">🛠️ فحص أكواد الأعطال</span>
        <button class="ds-panel-close" id="ds-panel-close" type="button">✕</button>
      </div>
      <div class="ds-panel-body">

        <div class="ds-section-title">📅 الفترة الزمنية</div>
        <div class="ds-period-grid">
          <button class="ds-period-btn ds-selected" type="button" data-days="30">آخر 30 يوم</button>
          <button class="ds-period-btn" type="button" data-days="90">آخر 90 يوم</button>
          <button class="ds-period-btn" type="button" data-days="-1">♾️ الكل بدون تصفية</button>
          <button class="ds-period-btn" type="button" data-days="0">📆 مخصص</button>
        </div>
        <div class="ds-custom-range" id="ds-custom-range">
          <input class="ds-date-input" type="date" id="ds-from-date" placeholder="من تاريخ">
          <input class="ds-date-input" type="date" id="ds-to-date" placeholder="إلى تاريخ">
        </div>

        <div class="ds-section-title">🔍 نطاق الصفحات</div>
        <div class="ds-period-grid" style="margin-bottom:8px;">
          <button class="ds-period-btn ds-selected" type="button" id="ds-scope-all">🌐 كل الصفحات</button>
          <button class="ds-period-btn" type="button" id="ds-scope-cur">📄 الصفحة الحالية</button>
        </div>

        <div class="ds-section-title">📊 الإحصائيات الحية</div>
        <div style="font-size:10px; color:#94a3b8; margin-bottom:6px;" id="ds-progress-label">جاهز للفحص</div>
        <div class="ds-progress-wrap">
          <div class="ds-progress-fill" id="ds-progress-fill"></div>
        </div>
        <div class="ds-stats">
          <div class="ds-stat">
            <span class="ds-stat-num" id="ds-stat-total">0</span>
            <span class="ds-stat-label">المطابق للفترة</span>
          </div>
          <div class="ds-stat">
            <span class="ds-stat-num red" id="ds-stat-targets">0</span>
            <span class="ds-stat-label">⚠️ حرج</span>
          </div>
          <div class="ds-stat">
            <span class="ds-stat-num green" id="ds-stat-checked">0</span>
            <span class="ds-stat-label">تم فحصه</span>
          </div>
        </div>

        <div class="ds-btn-row">
          <button class="ds-btn ds-btn-start" type="button" id="ds-btn-start">▶ بدء الفحص</button>
          <button class="ds-btn ds-btn-stop" type="button" id="ds-btn-stop" style="display:none;">⏹ إيقاف</button>
          <button class="ds-btn ds-btn-export" type="button" id="ds-btn-export" disabled>⬇️ Excel</button>
        </div>

        <div class="ds-section-title">📋 السجل اللحظي</div>
        <div id="ds-log"></div>
      </div>
    `;
    document.body.appendChild(panel);

    // Toast إشعار النسخ
    const toast = document.createElement('div');
    toast.id = 'ds-toast';
    toast.textContent = '✅ تم نسخ بيانات البلاغ بنجاح!';
    document.body.appendChild(toast);

    // Tooltip معاينة
    const tip = document.createElement('div');
    tip.id = 'ds-tooltip';
    tip.className = 'ds-tooltip';
    document.body.appendChild(tip);

    makeDraggable(panel, document.getElementById('ds-drag-handle'));
    bindEvents();
  }

  function togglePanel() {
    const panel = document.getElementById('ds-panel');
    panel.classList.toggle('ds-visible');
  }

  function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = function (e) {
      if (e.target.id === 'ds-panel-close') return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = function () {
        document.onmouseup = null;
        document.onmousemove = null;
      };
      document.onmousemove = function (e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
        el.style.bottom = 'auto';
        el.style.right = 'auto';
      };
    };
  }

  function bindEvents() {
    document.getElementById('ds-panel-close').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('ds-panel').classList.remove('ds-visible');
    });

    // أزرار الفترة الزمنية
    document.querySelectorAll('.ds-period-btn[data-days]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.ds-period-btn[data-days]').forEach(b => b.classList.remove('ds-selected'));
        btn.classList.add('ds-selected');
        const days = parseInt(btn.dataset.days);
        state.periodDays = days;
        const customRange = document.getElementById('ds-custom-range');
        if (days === 0) {
          customRange.classList.add('ds-visible');
        } else {
          customRange.classList.remove('ds-visible');
        }
      });
    });

    // نطاق الفحص (كل الصفحات vs الحالية)
    const btnAll = document.getElementById('ds-scope-all');
    const btnCur = document.getElementById('ds-scope-cur');
    btnAll.addEventListener('click', (e) => {
      e.preventDefault();
      state.scope = 'all';
      btnAll.classList.add('ds-selected');
      btnCur.classList.remove('ds-selected');
    });
    btnCur.addEventListener('click', (e) => {
      e.preventDefault();
      state.scope = 'current';
      btnCur.classList.add('ds-selected');
      btnAll.classList.remove('ds-selected');
    });

    document.getElementById('ds-btn-start').addEventListener('click', (e) => {
      e.preventDefault();
      startScan();
    });
    document.getElementById('ds-btn-stop').addEventListener('click', (e) => {
      e.preventDefault();
      state.stop = true;
    });
    document.getElementById('ds-btn-export').addEventListener('click', (e) => {
      e.preventDefault();
      exportExcel();
    });
  }

  /* ================================================================
     3. تجميع البلاغات والتنقل الذكي الموثوق بين الصفحات
     ================================================================ */
  async function collectAllReports() {
    const reports = [];
    const seenCas = new Set();
    const maxPages = 400;

    // ── العودة للصفحة الأولى دائماً قبل بدء فحص "كل الصفحات" ──
    if (state.scope === 'all') {
      const activePageNum = document.querySelector('.pagination li.active a')?.getAttribute('data-page') ||
                            document.querySelector('.pagination li.active')?.textContent.trim();
      if (activePageNum && activePageNum !== '1') {
        addLog(`العودة للصفحة 1 من الصفحة ${activePageNum}...`, 'info');
        const firstPageLink = document.querySelector('.pagination a[data-page="1"]') ||
                              document.querySelector('.pagination a[aria-label="page 1"]');
        if (firstPageLink) {
          firstPageLink.click();
          await waitPageChanged(activePageNum, null);
        }
      }
    }

    addLog('جاري فحص جدول البلاغات...', 'info');

    let consecutiveOldPages = 0; // عداد الصفحات المتتالية الأقدم من الفترة

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (state.stop) break;

      const curActivePage = document.querySelector('.pagination li.active a')?.getAttribute('data-page') ||
                            document.querySelector('.pagination li.active')?.textContent.trim() ||
                            String(pageNum);

      const rows = document.querySelectorAll('table.table tbody tr');
      let pageNewCount = 0;
      let pageOlderCount = 0;

      rows.forEach(row => {
        const cas = getCellByAttr(row, 'ticketnumber');
        if (!cas || !cas.startsWith('CAS') || seenCas.has(cas)) return;

        // استخدم تاريخ الحجز (ldv_scheduledservicestartdate) لأن الجدول مرتب تنازلياً به
        const bookDate = getCellByAttr(row, 'ldv_scheduledservicestartdate');
        const maintenanceDate = getCellByAttr(row, 'createdon');
        const customerName = getCellByAttr(row, 'customerid');
        const status = getCellByAttr(row, 'statuscode');

        const detailLink = row.querySelector('a[href*="Reportdetail"]');
        if (!detailLink) return;
        const guid = (detailLink.href.match(/id=([a-f0-9\-]+)/i) || [])[1];
        if (!guid) return;

        seenCas.add(cas);

        // نقارن مع تاريخ الحجز أو تاريخ الصيانة (المتاح منهما)
        const dateToFilter = bookDate || maintenanceDate;
        if (isInPeriod(dateToFilter)) {
          pageNewCount++;
          reports.push({
            cas,
            name: customerName || '',
            maintenanceDate: maintenanceDate || '',
            bookDate: bookDate || '',
            status: status || '',
            guid,
            reportUrl: `${BASE}/en-US/Reportdetail/?id=${guid}`,
            techUrl: `${BASE}/en-US/technicalreviewdetails/?id=${guid}`,
            model1: '', model2: '',
            serial1: '', serial2: '',
            comment: '',
            hasDefects: null,
            isTarget: false,
          });
        } else {
          pageOlderCount++;
        }
      });

      addLog(`صفحة ${curActivePage}: تم جمع ${pageNewCount} بلاغ يطابق الفترة (المجموع: ${reports.length})`, 'info');

      // إذا اختار المستخدم الصفحة الحالية فقط
      if (state.scope === 'current') break;

      // ── التوقف الذكي: إذا استمرت صفحتان كاملتان في جلب بلاغات أقدم من الفترة ──
      if (state.periodDays > 0) {
        if (pageNewCount === 0 && pageOlderCount > 0) {
          consecutiveOldPages++;
          if (consecutiveOldPages >= 2) {
            addLog(`تم الوصول للبلاغات الأقدم من الفترة (${state.periodDays} يوم). اكتمال التجميع.`, 'ok');
            break;
          }
        } else if (pageNewCount > 0) {
          consecutiveOldPages = 0;
        }
      }

      // فحص رابط الصفحة التالية
      const aNext = document.querySelector('a.entity-pager-next-link');
      const isNextDisabled = aNext && aNext.parentElement.classList.contains('disabled');
      if (!aNext || isNextDisabled) {
        addLog('تم الوصول لآخر صفحة في الجدول', 'info');
        break;
      }

      // الضغط على الصفحة التالية وانتظار تجدد الجدول
      const currentFirstCas = document.querySelector('table.table tbody tr td[data-attribute="ticketnumber"]')?.textContent.trim();
      aNext.click();

      const changed = await waitPageChanged(curActivePage, currentFirstCas);
      if (!changed) {
        addLog('توقف تقليب الصفحات (لم تتجدد البيانات)', 'info');
        break;
      }

      await SLEEP(250);
    }

    return reports;
  }

  // انتظار موثوق لتجدد الجدول إما بتغير رقم الصفحة أو بتغير أول CAS
  async function waitPageChanged(prevPage, prevFirstCas) {
    for (let w = 0; w < 35; w++) {
      await SLEEP(200);
      const newPage = document.querySelector('.pagination li.active a')?.getAttribute('data-page') ||
                      document.querySelector('.pagination li.active')?.textContent.trim();
      const newFirstCas = document.querySelector('table.table tbody tr td[data-attribute="ticketnumber"]')?.textContent.trim();

      if (prevPage && newPage && newPage !== prevPage) return true;
      if (prevFirstCas && newFirstCas && newFirstCas !== prevFirstCas) return true;
    }
    return false;
  }

  function getCellByAttr(row, attr) {
    const td = row.querySelector(`td[data-attribute="${attr}"]`);
    if (!td) return null;
    try {
      const raw = td.getAttribute('data-value');
      if (raw) {
        if (raw.startsWith('/Date(')) {
          const ms = parseInt(raw.replace(/[^0-9]/g, ''));
          if (!isNaN(ms)) {
            const d = new Date(ms);
            return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
          }
        }
        const parsed = JSON.parse(raw);
        if (parsed.Name) return parsed.Name;
      }
    } catch (e) {}
    return td.getAttribute('aria-label') || td.textContent.trim() || null;
  }

  /* ── فلترة التاريخ الصارمة ── */
  function isInPeriod(dateStr) {
    if (state.periodDays === -1) return true; // فحص الكل بدون تصفية
    if (!dateStr) return false;
    try {
      let d = null;
      if (typeof dateStr === 'string' && dateStr.startsWith('/Date(')) {
        const ms = parseInt(dateStr.replace(/[^0-9]/g, ''));
        if (!isNaN(ms)) d = new Date(ms);
      } else {
        const parts = dateStr.split(/[\s\/]/);
        if (parts.length >= 3) {
          if (parts[0].length === 4) {
            d = new Date(dateStr);
          } else {
            d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        }
      }
      if (!d || isNaN(d.getTime())) return true;

      if (state.periodDays === 0) {
        // مخصص
        const from = document.getElementById('ds-from-date')?.value;
        const to = document.getElementById('ds-to-date')?.value;
        if (from && d < new Date(from)) return false;
        if (to && d > new Date(to + 'T23:59:59')) return false;
        return true;
      } else {
        const cutoff = new Date(Date.now() - state.periodDays * 86400000);
        return d >= cutoff;
      }
    } catch (e) { return true; }
  }

  /* ================================================================
     4. فحص كل بلاغ (عبر Hidden Iframe معزول لضمان تشغيل PowerApps Subgrid)
     ================================================================ */
  function inspectViaIframe(report) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '10px';
      iframe.style.height = '10px';
      iframe.style.visibility = 'hidden';
      iframe.src = report.reportUrl;
      document.body.appendChild(iframe);

      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { iframe.remove(); } catch(e){}
          resolve({ error: 'timeout' });
        }
      }, 7000);

      iframe.onload = async () => {
        for (let attempt = 0; attempt < 20; attempt++) {
          if (settled) break;
          await SLEEP(200);

          try {
            const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iDoc) continue;

            const defectGrid = iDoc.getElementById('WorkOrder_defect');
            const commentEl = iDoc.getElementById('ldv_resourcelastcomment');
            if (!defectGrid || !commentEl) continue;

            const comment = commentEl.value || commentEl.textContent.trim() || '';
            const trs = Array.from(defectGrid.querySelectorAll('tbody tr') || []);
            const dataRows = trs.filter(tr => tr.querySelectorAll('td').length > 0 && !tr.querySelector('.empty-message'));
            const hasEmptyMsg = !!defectGrid.querySelector('.empty-message') ||
              (defectGrid.innerText.includes('There are no records to display') && dataRows.length === 0);

            if (dataRows.length > 0 || hasEmptyMsg) {
              settled = true;
              clearTimeout(timer);

              const hasDefects = dataRows.length > 0;
              const isTarget = hasEmptyMsg && KEYWORD_REGEX.test(comment);

              try { iframe.remove(); } catch(e){}
              resolve({
                hasDefects,
                comment,
                isTarget,
                dataRowsCount: dataRows.length
              });
              return;
            }
          } catch(err) {}
        }

        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { iframe.remove(); } catch(e){}
          resolve({ error: 'subgrid not loaded in time' });
        }
      };
    });
  }

  async function inspectReport(report) {
    try {
      const res = await inspectViaIframe(report);

      if (res.error) {
        addLog(`⚠️ ${report.cas} - تعذر جلب الـ Subgrid بالكامل`, 'skip');
        return false;
      }

      report.hasDefects = res.hasDefects;
      report.comment = res.comment;
      report.isTarget = res.isTarget;

      const keywordMatch = KEYWORD_REGEX.test(res.comment);

      if (res.hasDefects) {
        state.skipped++;
        // لو فيه أكواد وكمان فيه "تم التغيير" → أخضر (بيانات مكتملة)
        if (keywordMatch) {
          report.isSafeChange = true;
          addLog(`✅ ${report.cas} - به أكواد أعطال + تم التغيير (${res.dataRowsCount} كود)`, 'ok');
        } else {
          report.isSafeChange = false;
          addLog(`✓ ${report.cas} - به أكواد أعطال مسجلة (${res.dataRowsCount})`, 'ok');
        }
        return false;
      }

      if (!keywordMatch) {
        // خالي ولكن بدون "تم التغيير" → تجاهل (لا تلوين)
        report.isSafeChange = false;
        addLog(`— ${report.cas} - خالي ولكن بدون تغيير`, 'skip');
        return false;
      }

      // ⚠️ هدف حرج حقيقي! (خالي من الأكواد + تم التغيير)
      await enrichFromTechPage(report);

      state.targets++;
      addLog(`🚨 ${report.cas} - تم التغيير بدون كود عطل!`, 'warn');
      return true;

    } catch (e) {
      addLog(`❌ ${report.cas} - خطأ: ${e.message}`, 'warn');
      return false;
    }
  }

  /* ── استخراج الموديل والمسلسل من صفحة المراجعة الفنية ── */
  async function enrichFromTechPage(report) {
    try {
      const techResp = await fetch(report.techUrl, { credentials: 'include' });
      if (!techResp.ok) return;
      const techHtml = await techResp.text();
      const techDoc = new DOMParser().parseFromString(techHtml, 'text/html');

      report.model1 = techDoc.getElementById('ldv_model_name')?.value || '';
      report.model2 = techDoc.getElementById('ldv_secondtechmodel_name')?.value || '';
      report.serial1 = techDoc.getElementById('ldv_technicalserialnumber')?.value || '';
      report.serial2 = techDoc.getElementById('ldv_secondtechnicalserial')?.value || '';
    } catch (e) {}
  }

  /* ================================================================
     5. محرك الفحص الرئيسي
     ================================================================ */
  async function startScan() {
    if (state.running) return;

    state.running = true;
    state.stop = false;
    state.results = [];
    state.total = 0;
    state.checked = 0;
    state.targets = 0;
    state.skipped = 0;

    document.getElementById('ds-btn-start').style.display = 'none';
    document.getElementById('ds-btn-stop').style.display = '';
    document.getElementById('ds-btn-export').disabled = true;
    document.getElementById('ds-log').innerHTML = '';
    setProgress(0, 'جاري تجميع البلاغات...');

    try {
      const reports = await collectAllReports();
      state.total = reports.length;
      updateStats();

      if (reports.length === 0) {
        addLog('لم يتم العثور على بلاغات مطابقة للفترة', 'info');
        setProgress(100, 'لا توجد بلاغات');
        finishScan();
        return;
      }

      addLog(`تم تجميع ${reports.length} بلاغ يطابق الفترة. بدء فحص الأكواد والتقارير...`, 'info');

      for (let i = 0; i < reports.length; i++) {
        if (state.stop) {
          addLog('تم إيقاف الفحص يدوياً', 'info');
          break;
        }

        const report = reports[i];
        await inspectReport(report);
        state.results.push(report);
        state.checked++;

        updateStats();
        const pct = Math.round((state.checked / state.total) * 100);
        setProgress(pct, `فحص ${state.checked} من ${state.total} (${pct}%)`);

        // تلوين الصف في الصفحة الحالية
        markRowInTable(report);

        await SLEEP(150);
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.results));
      } catch (e) {}

      addLog(`✅ اكتمل الفحص: رصد ${state.targets} بلاغ حرج من أصل ${state.checked}`, 'ok');
      setProgress(100, `اكتمل! رصد ${state.targets} بلاغ يحتاج مراجعة`);

    } catch (e) {
      addLog('خطأ: ' + e.message, 'warn');
    } finally {
      finishScan();
    }
  }

  function finishScan() {
    state.running = false;
    document.getElementById('ds-btn-start').style.display = '';
    document.getElementById('ds-btn-stop').style.display = 'none';
    if (state.results.length > 0) {
      document.getElementById('ds-btn-export').disabled = false;
    }
  }

  /* ================================================================
     6. تلوين صفوف الجدول وإضافة شارة ⚠️
     ================================================================ */
  function markRowInTable(report) {
    const rows = document.querySelectorAll('table.table tbody tr');
    rows.forEach(row => {
      const casCell = row.querySelector('td[data-attribute="ticketnumber"]');
      if (!casCell) return;
      const cas = casCell.getAttribute('aria-label') || casCell.textContent.trim();
      if (cas !== report.cas) return;

      // أحمر ⚠️: خالي من الأكواد + تم التغيير = حرج
      if (report.isTarget) {
        row.classList.add('ds-row-critical');
        row.classList.remove('ds-row-safe');

        if (!row.querySelector('.ds-alert-badge')) {
          const badge = document.createElement('button');
          badge.type = 'button';
          badge.className = 'ds-alert-badge';
          badge.title = 'بلاغ بدون كود عطل وبه تم التغيير — اضغط لنسخ البيانات';
          badge.textContent = '⚠️';
          badge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTooltip(report, badge);
          });
          casCell.prepend(badge);
        }
      // أخضر ✅: فيه أكواد + تم التغيير = بيانات مكتملة وصحيحة
      } else if (report.isSafeChange) {
        row.classList.add('ds-row-safe');
        row.classList.remove('ds-row-critical');
        const oldBadge = row.querySelector('.ds-alert-badge');
        if (oldBadge) oldBadge.remove();

        if (!row.querySelector('.ds-safe-badge')) {
          const badge = document.createElement('span');
          badge.className = 'ds-safe-badge';
          badge.title = 'يوجد أكواد أعطال + تم التغيير (مكتمل)';
          badge.textContent = '✅';
          casCell.prepend(badge);
        }
      // فيه أكواد بدون تغيير أو خالي بدون تغيير = بدون تلوين
      } else if (report.hasDefects !== null) {
        row.classList.remove('ds-row-critical', 'ds-row-safe');
        const oldBadge = row.querySelector('.ds-alert-badge');
        if (oldBadge) oldBadge.remove();
        const oldSafe = row.querySelector('.ds-safe-badge');
        if (oldSafe) oldSafe.remove();
      }
    });
  }

  /* ================================================================
     7. Tooltip المعاينة والنسخ السريع الآمن (منع Reload)
     ================================================================ */
  function showTooltip(report, anchor) {
    const tip = document.getElementById('ds-tooltip');
    const copyText = buildCopyText(report);

    tip.innerHTML = `
      <button class="ds-tooltip-close" id="ds-tip-close" type="button">✕</button>
      <div class="ds-tooltip-title">⚠️ بلاغ بدون كود عطل (تم التغيير)</div>
      <div class="ds-tooltip-row"><span class="ds-tooltip-label">رقم البلاغ:</span><span class="ds-tooltip-val">${report.cas}</span></div>
      <div class="ds-tooltip-row"><span class="ds-tooltip-label">العميل:</span><span class="ds-tooltip-val">${report.name}</span></div>
      <div class="ds-tooltip-row"><span class="ds-tooltip-label">تاريخ الصيانة:</span><span class="ds-tooltip-val">${report.maintenanceDate}</span></div>
      <div class="ds-tooltip-row"><span class="ds-tooltip-label">الحالة:</span><span class="ds-tooltip-val">${report.status}</span></div>
      ${report.model1 ? `<div class="ds-tooltip-row"><span class="ds-tooltip-label">موديل 1:</span><span class="ds-tooltip-val">${report.model1}</span></div>` : ''}
      ${report.model2 ? `<div class="ds-tooltip-row"><span class="ds-tooltip-label">موديل 2:</span><span class="ds-tooltip-val">${report.model2}</span></div>` : ''}
      ${report.serial1 ? `<div class="ds-tooltip-row"><span class="ds-tooltip-label">مسلسل 1:</span><span class="ds-tooltip-val">${report.serial1}</span></div>` : ''}
      ${report.serial2 ? `<div class="ds-tooltip-row"><span class="ds-tooltip-label">مسلسل 2:</span><span class="ds-tooltip-val">${report.serial2}</span></div>` : ''}
      <div class="ds-tooltip-comment">💬 ${report.comment || '—'}</div>
      <div class="ds-tooltip-links">
        <a class="ds-tooltip-link" href="${report.reportUrl}" target="_blank">📄 صفحة التقرير</a>
        <a class="ds-tooltip-link" href="${report.techUrl}" target="_blank">🔧 المراجعة الفنية</a>
      </div>
      <div style="margin-top:8px;">
        <button class="ds-btn ds-btn-export" style="width:100%; padding:7px; justify-content:center;" id="ds-tip-copy" type="button">📋 نسخ بيانات البلاغ</button>
      </div>
    `;

    const rect = anchor.getBoundingClientRect();
    tip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 340)}px`;
    tip.style.left = `${Math.max(rect.left - 320 + anchor.offsetWidth, 10)}px`;
    tip.classList.add('ds-show');

    document.getElementById('ds-tip-close').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tip.classList.remove('ds-show');
    });

    document.getElementById('ds-tip-copy').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // نسخ آمن مع منع أي submit للـ form
      const safeCopy = () => {
        const ta = document.createElement('textarea');
        ta.value = copyText;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch(ex) {}
        document.body.removeChild(ta);
        showToast();
        tip.classList.remove('ds-show');
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(copyText).then(() => {
          showToast();
          tip.classList.remove('ds-show');
        }).catch(safeCopy);
      } else {
        safeCopy();
      }
      return false;
    });

    setTimeout(() => {
      document.addEventListener('click', function closeHandler(e) {
        if (!tip.contains(e.target) && e.target !== anchor) {
          tip.classList.remove('ds-show');
          document.removeEventListener('click', closeHandler);
        }
      });
    }, 100);
  }

  function buildCopyText(r) {
    return [
      `📌 بلاغ بدون كود عطل (تم التغيير):`,
      `• رقم البلاغ: ${r.cas}`,
      `• اسم العميل: ${r.name}`,
      `• تاريخ الصيانة: ${r.maintenanceDate}`,
      `• تاريخ الحجز: ${r.bookDate}`,
      `• حالة البلاغ: ${r.status}`,
      r.model1 ? `• موديل 1: ${r.model1}` : null,
      r.model2 ? `• موديل 2: ${r.model2}` : null,
      r.serial1 ? `• مسلسل 1: ${r.serial1}` : null,
      r.serial2 ? `• مسلسل 2: ${r.serial2}` : null,
      `• التقرير / التعليق: "${r.comment}"`,
      `• رابط التقرير: ${r.reportUrl}`,
      `• رابط المراجعة الفنية: ${r.techUrl}`,
    ].filter(Boolean).join('\n');
  }

  function showToast() {
    const t = document.getElementById('ds-toast');
    t.classList.add('ds-show');
    setTimeout(() => t.classList.remove('ds-show'), 2500);
  }

  /* ================================================================
     8. تصدير Excel
     ================================================================ */
  async function exportExcel() {
    const data = state.results;

    if (typeof XLSX !== 'undefined') {
      const headers = [
        'م', 'رقم البلاغ (CAS)', 'اسم العميل', 'تاريخ الصيانة', 'تاريخ الحجز',
        'حالة البلاغ', 'الموديل الفعلي 1', 'الموديل الفعلي 2',
        'الرقم المسلسل 1', 'الرقم المسلسل 2',
        'حالة كود العطل', 'تقرير الفني / التعليق الكامل',
        'الملاحظة / الإجراء المطلوب',
        'رابط صفحة التقرير', 'رابط صفحة المراجعة الفنية'
      ];

      const rows = data.map((r, i) => [
        i + 1, r.cas, r.name, r.maintenanceDate, r.bookDate, r.status,
        r.model1, r.model2, r.serial1, r.serial2,
        r.hasDefects ? 'يوجد أكواد أعطال' : 'خالي من الأكواد',
        r.comment,
        r.isTarget ? '⚠️ تم التغيير بدون تسجيل كود عطل' : '',
        r.reportUrl, r.techUrl,
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        {wch:4},{wch:22},{wch:24},{wch:18},{wch:18},
        {wch:18},{wch:35},{wch:35},{wch:22},{wch:22},
        {wch:18},{wch:40},{wch:30},{wch:55},{wch:55}
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'نتائج الفحص');
      XLSX.writeFile(wb, `فحص_الأعطال_${Date.now()}.xlsx`);
      addLog(`✅ تم تصدير ${data.length} بلاغ إلى Excel`, 'ok');
    } else {
      const headers = ['م','رقم البلاغ','اسم العميل','تاريخ الصيانة','تاريخ الحجز','الحالة','موديل 1','موديل 2','مسلسل 1','مسلسل 2','كود العطل','التعليق','الملاحظة','رابط التقرير','رابط المراجعة'].join(',');
      const rows = data.map((r, i) => [
        i+1, r.cas, `"${r.name}"`, r.maintenanceDate, r.bookDate, r.status,
        `"${r.model1}"`, `"${r.model2}"`, r.serial1, r.serial2,
        r.hasDefects ? 'يوجد' : 'خالي',
        `"${(r.comment||'').replace(/"/g,'""')}"`,
        r.isTarget ? 'تم التغيير بدون كود' : '',
        r.reportUrl, r.techUrl
      ].join(','));
      const csv = '\uFEFF' + [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `فحص_الأعطال_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      addLog(`✅ تم تصدير ${data.length} بلاغ إلى CSV`, 'ok');
    }
  }

  /* ================================================================
     9. مساعدات الواجهة
     ================================================================ */
  function setProgress(pct, label) {
    const fill = document.getElementById('ds-progress-fill');
    const lbl = document.getElementById('ds-progress-label');
    if (fill) fill.style.width = `${pct}%`;
    if (lbl) lbl.textContent = label;
  }

  function updateStats() {
    const el = id => document.getElementById(id);
    if (el('ds-stat-total')) el('ds-stat-total').textContent = state.total;
    if (el('ds-stat-checked')) el('ds-stat-checked').textContent = state.checked;
    if (el('ds-stat-targets')) el('ds-stat-targets').textContent = state.targets;
  }

  function addLog(msg, type = 'info') {
    const log = document.getElementById('ds-log');
    if (!log) return;
    const item = document.createElement('div');
    item.className = `ds-log-item ds-log-${type}`;
    item.textContent = msg;
    log.prepend(item);
    while (log.children.length > 50) log.removeChild(log.lastChild);
  }

  /* ================================================================
     10. تهيئة الأداة ومراقبة تجدد الجدول
     ================================================================ */
  function init() {
    if (!location.pathname.includes('/ReportList')) return;
    injectCSS();
    buildUI();

    const observer = new MutationObserver(() => {
      if (state.results.length > 0) {
        state.results.forEach(r => markRowInTable(r));
      }
    });
    const tableWrap = document.querySelector('.view-grid, .entity-grid, table.table');
    if (tableWrap) {
      observer.observe(tableWrap, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }

})();
