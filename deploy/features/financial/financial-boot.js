/**
 * financial/financial-boot.js — مُنسِّق التحليلات المالية الموحد
 * يعمل فقط على صفحات الأقسام المالية في CRM (ASPPage/*)
 * 1) استخراج تلقائي للبيانات (FinanceScraper)
 * 2) تحليل محلي فوري (FinanceAnalyzer) + حفظ في chrome.storage.local
 * 3) تحليل ذكي عبر AI (aiChat — shared/ai-client.js)
 * 4) تصدير Excel/CSV (excel-exporter)
 * 5) لوحة تعليق مصغّرة مع أزرار
 */
(function () {
  'use strict';
  if (document.getElementById('__fin-boot')) return;

  const STORE = { scan: 'financeScan', analysis: 'financeAnalysis', ai: 'financeAI' };

  const pageData = (typeof FinanceScraper === 'object' && FinanceScraper) ? FinanceScraper.extract() : null;
  if (!pageData || pageData.pageType === 'unknown') {
    console.log('[Finance] ليست صفحة مالية — خروج صامت');
    return;
  }

  let latestAnalysis = null;

  function save(key, value) {
    const obj = {};
    obj[key] = value;
    return chrome.storage.local.set(obj);
  }

  async function runExtract() {
    const data = FinanceScraper.extract();
    await save(STORE.scan, data);
    return data;
  }

  async function runAnalyze() {
    const data = FinanceScraper.extract();
    const result = FinanceAnalyzer.analyze(data);
    latestAnalysis = result;
    await save(STORE.analysis, result);
    await save(STORE.scan, data);
    return result;
  }

  async function runAI(forceText) {
    const stored = await chrome.storage.local.get([STORE.analysis, STORE.scan]);
    const analysis = forceText || stored[STORE.analysis];
    const scan = stored[STORE.scan] || pageData;
    if (!analysis) return { ok: false, error: 'لا يوجد تحليل محلي بعد' };

    const st = analysis.stats || {};
    const prompt = [
      'أنت محلل مالي متخصص لحساب مركز خدمة صيانة أجهزة كهربائية (شركة العربي).',
      'صفحة: ' + (scan.pageName || '-') + ' — حساب: ' + (scan.accountNumber || '-') + ' — ' + (scan.accountName || '-'),
      'الرصيد الحالي: ' + st.runningBalance + ' ج.م',
      'تحويلات بنكية: ' + (st.bankTransferCount || 0) + ' بإجمالي ' + st.totalTransfers + ' ج.م',
      'فواتير تالف: ' + (st.damagedPartsCount || 0) + ' قطعة بإجمالي ' + st.totalDamaged + ' ج.م',
      'قطع غالية: ' + (st.expensiveParts || []).map(p => p.desc + ' (' + p.amount + ' ج.م)').join('، ') || 'لا يوجد',
      'أكثر القطع تكراراً: ' + (st.topParts || []).map(p => p.desc + ' ×' + p.count).join('، ') || 'لا يوجد',
      'قطع تغير سعرها: ' + (st.priceChangedParts || 0),
      'أجب بثلاثة أقسام قصيرة: (1) تقييم عام للحساب، (2) أهم 5 ملاحظات ومخاطر، (3) توصيات عملية واضحة.'
    ].join('\n');

    const resp = await aiChat(prompt, { system: 'أنت مساعد مالي محترف بالعربية. كن دقيقاً وموجزاً.', model: 'general', maxTokens: 900 });
    if (!resp.ok) return resp;
    const out = { text: resp.text, ts: new Date().toISOString() };
    await save(STORE.ai, out);
    return { ok: true, data: out };
  }

  async function runExport() {
    const stored = await chrome.storage.local.get(STORE.scan);
    const scan = stored[STORE.scan] || pageData;
    if (!scan || !scan.tables || !scan.tables.length) return { ok: false, error: 'لا توجد جداول' };
    let exported = 0;
    for (const t of scan.tables) {
      const rows = t.rows.map(r => {
        const o = {};
        t.headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
        return o;
      });
      await exportExcel(rows, {
        headers: t.headers,
        sheetName: 'Sheet' + (t.index + 1),
        filename: 'finance_' + scan.pageType + '_' + new Date().toISOString().slice(0, 10) + '.xlsx'
      });
      exported++;
    }
    return { ok: true, exported };
  }

  // ══════════ اللوحة المصغرة ══════════
  function buildUI() {
    const host = document.createElement('div');
    host.id = '__fin-boot';
    host.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99990;font-family:Cairo,Segoe UI,Tahoma,sans-serif;direction:rtl;';
    host.innerHTML = `
      <div style="background:#ffffff;border:1px solid #d0d7de;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.15);padding:8px;display:flex;gap:6px;align-items:center;">
        <span style="font-size:12px;font-weight:700;color:#0b5394;margin-inline-end:4px;">📊 مالية</span>
        <button data-act="analyze" style="border:0;background:#0b5394;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;">تحليل</button>
        <button data-act="ai" style="border:0;background:#6d28d9;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;">🤖 AI</button>
        <button data-act="export" style="border:0;background:#059669;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;">⬇️ تصدير</button>
        <button data-act="close" style="border:0;background:transparent;color:#6b7280;border-radius:8px;padding:6px 8px;font-size:14px;cursor:pointer;" title="إغلاق">✕</button>
      </div>
      <div id="__fin-result" style="display:none;margin-top:6px;background:#fff;border:1px solid #d0d7de;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.15);max-width:480px;max-height:55vh;overflow:auto;padding:10px;font-size:12.5px;color:#1f2328;white-space:pre-wrap;"></div>
    `;
    document.body.appendChild(host);

    const resultBox = host.querySelector('#__fin-result');
    function setBusy(btn, busyText) {
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = busyText || '⏳...';
      return () => { btn.disabled = false; btn.textContent = old; };
    }
    function show(text, isHtml) {
      resultBox.style.display = 'block';
      resultBox.innerHTML = isHtml ? text : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    host.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') { host.remove(); return; }
      const done = setBusy(btn);
      try {
        if (act === 'analyze') {
          const r = await runAnalyze();
          show(r.plainText || 'لا يوجد تحليل', false);
        } else if (act === 'ai') {
          const result = await runAI();
          show(result.ok ? result.data.text : ('⚠️ ' + (result.error || 'تعذر الاتصال بالذكاء الاصطناعي')));
        } else if (act === 'export') {
          const r = await runExport();
          show(r.ok ? ('✅ تم تصدير ' + r.exported + ' جدول') : ('⚠️ ' + r.error));
        }
      } catch (err) {
        show('❌ ' + String(err && err.message || err));
      } finally {
        done();
      }
    });
  }

  // تحليل تلقائي عند التمهيد (حفظ فقط)
  runAnalyze().then(() => {
    console.log('[Finance] ✅ تحليل تلقائي محفوظ — ' + pageData.pageName);
  }).catch(e => console.warn('[Finance] تحليل تلقائي فشل:', e));

  buildUI();

})();