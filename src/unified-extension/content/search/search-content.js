/* ══════════════════════════════════════════════════════════════════
   مساعد البحث عن بلاغ — Content Script v7.0
   ──────────────────────────────────────────────────────────────────
   • يحقن لوحة تحكم (Dashboard) عصرية داخل الصفحة
   • يقرأ ملف Excel ويستخرج أرقام البلاغات
   • يبحث عن كل بلاغ بنظام الدفعات (Batches)
   • يستخرج تقرير الإصلاح ويحفظه في ملف Excel جديد
   ══════════════════════════════════════════════════════════════════ */
(async function () {
  'use strict';

  // ══════════════ منع التشغيل المزدوج ══════════════
  if (document.getElementById('__bs-panel')) return;
  console.log('[BSearch] v7.0 loaded');

  // ══════════════ الثوابت ══════════════
  var ST = 'bsearchState';
  var BATCH = 25;
  var SKIP = ['canceled', 'postpone'];

  // ══════════════ مراجع DOM للموقع ══════════════
  var tb = document.getElementById('ContentPlaceHolder1_TextBox1');
  if (!tb) { console.log('[BSearch] TextBox not found — exiting'); return; }
  var dd = document.getElementById('ContentPlaceHolder1_DropDownList2');
  var searchBtn = document.getElementById('ContentPlaceHolder1_Button1');
  var grid = document.getElementById('ContentPlaceHolder1_GridView1');
  var hasData = grid && grid.querySelectorAll('tr').length > 1;

  // ══════════════ متغيرات ══════════════
  var worker = null;
  var popupPort = null;

  // ══════════════════════════════════════════════════
  //  أدوات مساعدة
  // ══════════════════════════════════════════════════
  function ts() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function addLog(state, msg, type) {
    if (!state.logs) state.logs = [];
    state.logs.push({ t: ts(), m: msg, c: type || 'info' });
  }

  // ══════════════════════════════════════════════════
  //  اتصال بالـ Popup
  // ══════════════════════════════════════════════════
  chrome.runtime.onConnect.addListener(function (p) {
    if (p.name !== 'ext_channel') return;
    popupPort = p;
    p.onMessage.addListener(async function (msg) {
      if (msg.action === 'getStatus') await sendPopupStatus();
      else if (msg.action === 'stop') {
        var stored = await chrome.storage.local.get(ST);
        var s = stored[ST];
        if (s) { s.running = false; var sv = {}; sv[ST] = s; await chrome.storage.local.set(sv); }
      }
    });
    p.onDisconnect.addListener(function () { popupPort = null; });
  });

  function notifyPopup(type, data) {
    if (popupPort) { try { popupPort.postMessage({ action: type, data: data }); } catch (e) {} }
  }

  async function sendPopupStatus() {
    var stored = await chrome.storage.local.get(ST);
    var s = stored[ST];
    if (!s) return;
    var total = s.sapList.length;
    var done = s.results.length;
    var batches = Math.ceil(total / BATCH);
    notifyPopup('progress', { current: done, total: total, batch: s.batchCurrent + 1, totalBatches: batches });
    notifyPopup('results', s.results);
    notifyPopup('logs', s.logs);
    if (s.done) {
      var found = s.results.filter(function (r) { return r.reports && r.reports.length > 0; }).length;
      notifyPopup('done', { found: found, total: done, totalBatches: batches, results: s.results, logs: s.logs });
    }
  }

  // ══════════════════════════════════════════════════
  //  XLSX Web Worker
  // ══════════════════════════════════════════════════
  function getWorker() {
    if (worker) return worker;
    var url = chrome.runtime.getURL('lib/xlsx.full.min.js');
    var code = "importScripts('" + url + "');"
      + "self.onmessage=function(e){var m=e.data;try{"
      + "if(m.a==='P'){"
      +   "var b=atob(m.d.split(',')[1]||m.d),a=new Uint8Array(b.length);"
      +   "for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);"
      +   "var w=XLSX.read(a,{type:'array'}),s=w.Sheets[w.SheetNames[0]],j=XLSX.utils.sheet_to_json(s,{header:1});"
      +   "if(!j.length){self.postMessage({id:m.id,er:'الملف فارغ'});return}"
      +   "var h=[];for(var ci=0;ci<j[0].length;ci++){h.push(String(j[0][ci]||''));}"
      +   "var si=h.findIndex(function(c){return c.indexOf('بلاغ')>=0||c.indexOf('CAS')>=0||c.indexOf('CRM')>=0});"
      +   "if(si<0)si=h.findIndex(function(c){return c.indexOf('SAP')>=0||c.indexOf('رقم')>=0});"
      +   "if(si<0){self.postMessage({id:m.id,er:'لم يتم العثور على عمود أرقام البلاغات'});return}"
      +   "var ri=h.findIndex(function(c){return c.indexOf('تقرير')>=0||c.indexOf('Report')>=0});"
      +   "var ni=h.findIndex(function(c){return c.indexOf('ملاحظات')>=0});"
      +   "var rowsData=j.slice(1).map(function(r){return { s:String(r[si]||'').trim(), n:ni>=0?String(r[ni]||'').trim():'' };});"
      +   "rowsData=rowsData.filter(function(x){return /^CAS/i.test(x.s);});"
      +   "rowsData.sort(function(a,b){ var aHas=a.n.length>0; var bHas=b.n.length>0; if(aHas&&!bHas) return -1; if(!aHas&&bHas) return 1; return 0; });"
      +   "var l=rowsData.map(function(x){return x.s;});"
      +   "var wo=XLSX.write(w,{bookType:'xlsx',type:'array'}),by=new Uint8Array(wo),bb='';"
      +   "for(var i=0;i<by.length;i++)bb+=String.fromCharCode(by[i]);"
      +   "self.postMessage({id:m.id,l:l,si:si,ri:ri,wb:btoa(bb)})"
      + "}else if(m.a==='W'){"
      +   "var rb=atob(m.wb),ra=new Uint8Array(rb.length);"
      +   "for(var i=0;i<rb.length;i++)ra[i]=rb.charCodeAt(i);"
      +   "var w2=XLSX.read(ra,{type:'array',cellStyles:true}),s2=w2.Sheets[w2.SheetNames[0]];"
      +   "var range=XLSX.utils.decode_range(s2['!ref']);"
      +   "var ri2=range.e.c+1;"
      +   "var tim=ri2+1;"
      +   "var mx=0; m.rs.forEach(function(r){if(r.reports&&r.reports.length>mx)mx=r.reports.length;});"
      +   "for(var hi=0;hi<mx;hi++){ var c_addr=XLSX.utils.encode_cell({r:0,c:ri2+hi}); s2[c_addr]={t:'s',v:'تقرير '+(hi+1)}; }"
      +   "s2[XLSX.utils.encode_cell({r:0,c:tim})]={t:'s',v:'وقت الاستخراج'};"
      +   "for(var R=1;R<=range.e.R;R++){"
      +     "var sapCell=s2[XLSX.utils.encode_cell({r:R,c:m.si})];"
      +     "if(!sapCell) continue;"
      +     "var sapVal=String(sapCell.v||'').trim();"
      +     "var rr=null;"
      +     "for(var k=0;k<m.rs.length;k++){ if(m.rs[k].sap===sapVal){rr=m.rs[k];break;} }"
      +     "if(rr&&rr.reports){"
      +       "for(var c=0;c<rr.reports.length;c++){"
      +         "var cell_addr=XLSX.utils.encode_cell({r:R,c:ri2+c});"
      +         "s2[cell_addr]={t:'s',v:rr.reports[c]};"
      +       "}"
      +     "}"
      +     "if(rr){"
      +       "var timAddr=XLSX.utils.encode_cell({r:R,c:tim});"
      +       "s2[timAddr]={t:'s',v:rr.extractedAt||'-'};"
      +     "}"
      +   "}"
      +   "range.e.c = Math.max(range.e.c, tim);"
      +   "s2['!ref'] = XLSX.utils.encode_range(range);"
      +   "var out=XLSX.write(w2,{bookType:'xlsx',type:'array',bookSST:false}),b2=new Uint8Array(out),bb2='';"
      +   "for(var i=0;i<b2.length;i++)bb2+=String.fromCharCode(b2[i]);"
      +   "self.postMessage({id:m.id,b64:btoa(bb2)})"
      + "}}catch(e){self.postMessage({id:m.id,er:e.message})}};";
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
    return worker;
  }

  function xlsxCall(action, data) {
    return new Promise(function (resolve) {
      var id = Date.now() + Math.random();
      var w = getWorker();
      function handler(e) { if (e.data.id === id) { w.removeEventListener('message', handler); resolve(e.data); } }
      w.addEventListener('message', handler);
      var msg = { id: id, a: action };
      for (var k in data) if (data.hasOwnProperty(k)) msg[k] = data[k];
      w.postMessage(msg);
    });
  }

  // ══════════════════════════════════════════════════
  //  أدوات DOM — قراءة الجدول
  // ══════════════════════════════════════════════════
  function getColumns(g) {
    var ths = g.querySelectorAll('tr:first-child th');
    var cols = { crmCol: 0, reportCol: -1, statusCol: -1, allHeaders: [] };
    for (var i = 0; i < ths.length; i++) {
      var t = ths[i].textContent.trim();
      cols.allHeaders.push(t);
      if (t.indexOf('تقرير') >= 0) cols.reportCol = i;
      if (t.indexOf('حالة المركز') >= 0) cols.statusCol = i;
      if (/^(بلاغ|رقم البلاغ|CAS|CRM)/i.test(t)) cols.crmCol = i;
    }
    // fallback: لو ملاقاش عمود تقرير، جرب 'ملاحظات' أو 'Report' أو 'حالة'
    if (cols.reportCol < 0) {
      for (var i = 0; i < ths.length; i++) {
        var t = ths[i].textContent.trim();
        if (t.indexOf('ملاحظات') >= 0 || t.indexOf('Report') >= 0 || t.indexOf('حالة') >= 0) {
          cols.reportCol = i;
          break;
        }
      }
    }
    // debug log لرؤية الأعمدة
    console.log('[BSearch] Detected columns:', JSON.stringify(cols));
    return cols;
  }

  function extractPageRows(g) {
    var rows = g.querySelectorAll('tr');
    if (rows.length < 2) return [];
    var cols = getColumns(g);
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (!cells.length || (cells.length === 1 && cells[0].getAttribute('colspan'))) continue;
      if (cells.length < 2) continue;

      // ابحث عن رقم CAS/CRM في أي خلية من الصف
      var crm = '';
      for (var ci = 0; ci < cells.length; ci++) {
        var val = cells[ci] ? cells[ci].textContent.trim() : '';
        if (/^CAS\d/i.test(val) || /^CRM\d/i.test(val)) {
          crm = val;
          break;
        }
      }
      // fallback: استخدم العمود المكتشف
      if (!crm && cells[cols.crmCol]) {
        crm = cells[cols.crmCol].textContent.trim();
      }

      var status = cols.statusCol >= 0 && cells[cols.statusCol] ? cells[cols.statusCol].textContent.trim() : '';
      var report = cols.reportCol >= 0 && cells[cols.reportCol] ? cells[cols.reportCol].textContent.trim() : '';
      if (crm) result.push({ crm: crm, status: status, report: report });
    }
    return result;
  }

  function findNextPage(g) {
    var lastRow = g.querySelector('tr:last-child');
    if (!lastRow) return null;
    var cell = lastRow.querySelector('td[colspan]');
    if (!cell) return null;
    var span = cell.querySelector('span');
    if (!span) return null;
    var cur = parseInt(span.textContent);
    if (isNaN(cur)) return null;
    var links = cell.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (parseInt(links[i].textContent) === cur + 1) return links[i];
    }
    return null;
  }

  // ══════════════════════════════════════════════════
  //  المنطق الأساسي — معالجة الدفعات
  // ══════════════════════════════════════════════════
  function processBatch(state) {
    var recs = {};
    for (var i = 0; i < (state.pageRows || []).length; i++) {
      var row = state.pageRows[i];
      var stat = (row.status || '').toLowerCase();
      
      // Ignore if status contains canceled or postpone
      if (stat.indexOf('cancel') >= 0 || stat.indexOf('postpone') >= 0) continue;
      
      if (!recs[row.crm]) recs[row.crm] = { reports: [] };
      if (row.report) recs[row.crm].reports.push(row.report);
    }

    var batchLogs = [];
    var now = new Date();
    var ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    for (var j = 0; j < state.batchSaps.length; j++) {
      var crm = state.batchSaps[j];
      var r = recs[crm] || { reports: [] };
      var reports = r.reports.filter(Boolean);
      state.results.push({ sap: crm, reports: reports, status: reports.length ? 'found' : 'empty', extractedAt: ts });
      if (reports.length > 0) {
        addLog(state, '✅ ' + crm + ' : ' + reports.length + ' تقرير', 'ok');
        batchLogs.push({ crm: crm, count: reports.length, first: reports[0].substring(0, 25) });
      } else {
        addLog(state, '❌ ' + crm + ' : لا توجد تقارير', 'error');
        batchLogs.push({ crm: crm, count: 0, first: '-' });
      }
    }
    // حفظ آخر المستخرجات للعرض المباشر
    state.latestExtracts = batchLogs.slice(-5);

    var total = state.sapList.length;
    var done = state.results.length;
    var batches = Math.ceil(total / BATCH);
    notifyPopup('progress', { current: done, total: total, batch: state.batchCurrent + 1, totalBatches: batches });
    notifyPopup('results', state.results);
    notifyPopup('logs', state.logs);
  }

  async function startBatch(state) {
    var start = state.batchCurrent * BATCH;
    var batch = state.sapList.slice(start, start + BATCH);
    state.batchSaps = batch;
    state.waitingSearch = true;
    state.pageRows = [];
    var batches = Math.ceil(state.sapList.length / BATCH);
    addLog(state, 'بدء الدفعة ' + (state.batchCurrent + 1) + '/' + batches + ' (' + batch.length + ' بلاغ)', 'info');
    var save = {}; save[ST] = state;
    await chrome.storage.local.set(save);

    notifyPopup('progress', { current: state.results.length, total: state.sapList.length, batch: state.batchCurrent + 1, totalBatches: batches });
    notifyPopup('logs', state.logs);

    if (dd && dd.value !== 'CRM') { 
      dd.value = 'CRM'; 
      dd.dispatchEvent(new Event('change', { bubbles: true })); 
    }
    if (tb) tb.value = batch.join('\n');
    
    // Add a slight delay before clicking search to allow UI to settle
    setTimeout(function() {
      if (searchBtn) searchBtn.click();
    }, 500);
  }

  // ══════════════════════════════════════════════════
  //  بناء الواجهة — HTML
  // ══════════════════════════════════════════════════
  function buildPanelHTML(mode, state) {
    var h = '';

    // ── Header
    h += '<div class="__bs-header">';
    h += '  <div class="__bs-title"><span class="__bs-title-icon">🔍</span> مساعد البحث عن بلاغ</div>';
    
    h += '  <div class="__bs-header-actions">';
    if (mode === 'running' || mode === 'done') {
      var total = state.sapList.length;
      var doneCount = state.results.length;
      h += '  <span class="__bs-badge">' + doneCount + '/' + total + '</span>';
    }
    
    if (mode === 'running') {
      h += '  <button class="__bs-btn-icon __bs-btn-header" id="__bs-reset-run" title="إيقاف وبحث جديد">🛑</button>';
    } else if (mode === 'done') {
      h += '  <button class="__bs-btn-icon __bs-btn-header __bs-btn-success" id="__bs-download" title="تحميل ملف Excel المحدث">💾</button>';
      h += '  <button class="__bs-btn-icon __bs-btn-header" id="__bs-reset-done" title="بحث جديد">🔄</button>';
    }
    h += '  <button class="__bs-toggle" id="__bs-toggle" title="طي/فتح">▲</button>';
    h += '  </div>';
    h += '</div>';

    // ── Body
    h += '<div id="__bs-body" class="__bs-body ' + (mode === 'idle' ? '' : '__bs-body-grid') + '">';

    if (mode === 'idle') {
      // ─ رفع الملف
      h += '<div class="__bs-section">';
      h += '  <div class="__bs-section-title">📁 رفع ملف Excel</div>';
      h += '  <div class="__bs-dropzone" id="__bs-dropzone">';
      h += '    <input type="file" accept=".xlsx,.xls" class="__bs-file-input" id="__bs-file">';
      h += '    <span class="__bs-dropzone-icon">📂</span>';
      h += '    <div class="__bs-dropzone-text">اسحب الملف هنا<br>أو <strong>اضغط للاختيار</strong></div>';
      h += '  </div>';
      h += '  <div class="__bs-info" id="__bs-file-info"></div>';
      h += '</div>';
      // ─ زر البدء
      h += '<div class="__bs-actions">';
      h += '  <button class="__bs-btn __bs-btn-primary __bs-btn-block" id="__bs-start" disabled>🚀 بدء البحث</button>';
      h += '</div>';

    } else if (mode === 'running') {
      var total = state.sapList.length;
      var doneCount = state.results.length;
      var pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      var batches = Math.ceil(total / BATCH);

      h += '<div class="__bs-left-col">';
      // ─ التقدم
      h += '<div class="__bs-section">';
      h += '  <div class="__bs-section-title"><span class="__bs-running-dot"></span> جاري البحث...</div>';
      h += '  <div class="__bs-progress-wrap">';
      h += '    <div class="__bs-progress-pct">' + pct + '%</div>';
      h += '    <div class="__bs-progress-bar"><div class="__bs-progress-fill" style="width:' + pct + '%"></div></div>';
      h += '    <div class="__bs-progress-info">';
      h += '      <span>' + doneCount + ' / ' + total + ' بلاغ</span>';
      h += '      <span>دفعة ' + (state.batchCurrent + 1) + ' من ' + batches + '</span>';
      h += '    </div>';
      h += '  </div>';
      h += '</div>';

      // ─ بث مباشر لآخر المستخرجات
      var extracts = state.latestExtracts || [];
      if (extracts.length > 0) {
        h += '<div class="__bs-section">';
        h += '  <div class="__bs-section-title __bs-section-title-sm">📡 آخر المستخرجات</div>';
        h += '  <div class="__bs-live-feed">';
        for (var ei = extracts.length - 1; ei >= 0; ei--) {
          var ex = extracts[ei];
          if (ex.count > 0) {
            h += '    <div class="__bs-live-item __bs-live-ok"><span class="__bs-live-crm">' + ex.crm.substring(0, 20) + '</span> <span class="__bs-live-badge">✅ ' + ex.count + '</span></div>';
          } else {
            h += '    <div class="__bs-live-item __bs-live-empty"><span class="__bs-live-crm">' + ex.crm.substring(0, 20) + '</span> <span class="__bs-live-badge">❌</span></div>';
          }
        }
        h += '  </div>';
        h += '</div>';
      }

      // ─ ملخص
      h += '<div class="__bs-section">';
      h += '  <div class="__bs-section-title __bs-section-title-sm">📊 ملخص</div>';
      h += '  <div class="__bs-summary">';
      h += '    <div class="__bs-summary-item"><span class="__bs-summary-label">تم البحث</span><span class="__bs-summary-value">' + doneCount + '</span></div>';
      h += '    <div class="__bs-summary-item"><span class="__bs-summary-label">بها تقارير</span><span class="__bs-summary-value" style="color:#3fb950">' + (state.results.filter(function(r){return r.reports&&r.reports.length>0}).length) + '</span></div>';
      h += '    <div class="__bs-summary-item"><span class="__bs-summary-label">بدون تقارير</span><span class="__bs-summary-value" style="color:#f85149">' + (state.results.filter(function(r){return !r.reports||r.reports.length===0}).length) + '</span></div>';
      h += '  </div>';
      h += '</div>';

      h += '</div>'; // end left col

      h += '<div class="__bs-right-col">';
      // ─ النتائج
      h += buildResultsHTML(state.results);
      h += '</div>'; // end right col

    } else if (mode === 'done') {
      var total = state.sapList.length;
      var doneCount = state.results.length;
      var found = 0;
      for (var fi = 0; fi < state.results.length; fi++) {
        if (state.results[fi].reports && state.results[fi].reports.length > 0) found++;
      }
      var batches = Math.ceil(total / BATCH);

      h += '<div class="__bs-left-col">';
      // ─ التقدم (مكتمل)
      h += '<div class="__bs-section">';
      h += '  <div class="__bs-section-title">✅ اكتمل البحث</div>';
      h += '  <div class="__bs-progress-wrap __bs-progress-done">';
      h += '    <div class="__bs-progress-pct">100%</div>';
      h += '    <div class="__bs-progress-bar"><div class="__bs-progress-fill" style="width:100%"></div></div>';
      h += '    <div class="__bs-progress-info">';
      h += '      <span>' + found + ' تقرير من ' + doneCount + ' بلاغ</span>';
      h += '      <span>' + batches + ' دفعة</span>';
      h += '    </div>';
      h += '  </div>';
      h += '</div>';

      h += '</div>'; // end left col
      
      h += '<div class="__bs-right-col">';
      // ─ النتائج
      h += buildResultsHTML(state.results);

      // ─ السجل مخفي في هذا العرض المصغر
      // h += buildLogsHTML(state.logs);

      h += '</div>'; // end right col
    }

    h += '</div>'; // __bs-body
    h += '<div class="__bs-resize-handle __bs-resize-se" data-edge="se"></div>';
    h += '<div class="__bs-resize-handle __bs-resize-sw" data-edge="sw"></div>';
    return h;
  }

  function buildResultsHTML(results) {
    var h = '';
    var validResults = results.filter(function(r) { return r.reports && r.reports.length > 0; });

    // أقصى عدد تقارير عند أي بلاغ
    var maxReps = 0;
    for (var ri = 0; ri < validResults.length; ri++) {
      if (validResults[ri].reports.length > maxReps) maxReps = validResults[ri].reports.length;
    }

    h += '<div class="__bs-section __bs-section-table">';
    h += '  <div class="__bs-section-title">📊 النتائج (' + validResults.length + ')</div>';
    h += '  <div class="__bs-table-wrap">';
    h += '    <table class="__bs-table"><thead><tr>';
    h += '      <th class="__bs-th-num">#</th>';
    h += '      <th class="__bs-th-sap">رقم البلاغ</th>';
    h += '      <th class="__bs-th-status">الحالة</th>';
    h += '      <th class="__bs-th-time">وقت الاستخراج</th>';
    for (var ti = 0; ti < maxReps; ti++) {
      h += '      <th class="__bs-th-report">تقرير ' + (ti + 1) + '</th>';
    }
    h += '    </tr></thead><tbody>';
    for (var i = 0; i < validResults.length; i++) {
      var r = validResults[i];
      h += '<tr>';
      h += '  <td class="__bs-td-center">' + (i + 1) + '</td>';
      h += '  <td class="__bs-td-sap">' + r.sap + '</td>';
      h += '  <td class="__bs-td-center"><span class="__bs-status-ok">✅ ' + r.reports.length + '</span></td>';
      h += '  <td class="__bs-td-time" dir="ltr">' + (r.extractedAt || '-') + '</td>';
      for (var ci = 0; ci < maxReps; ci++) {
        var repText = ci < r.reports.length ? r.reports[ci] : '';
        h += '  <td class="__bs-td-report">' + repText + '</td>';
      }
      h += '</tr>';
    }
    if (validResults.length === 0) {
      h += '<tr><td colspan="' + (4 + maxReps) + '" style="text-align:center;padding:10px;font-size:12px;color:#8b949e">لا يوجد تقارير مستخرجة بعد</td></tr>';
    }
    h += '</tbody></table></div></div>';
    return h;
  }

  function buildLogsHTML(logs) {
    if (!logs || !logs.length) return '';
    var colors = { ok: '__bs-log-ok', error: '__bs-log-error', warn: '__bs-log-warn', info: '__bs-log-info' };
    var h = '';
    h += '<div class="__bs-section">';
    h += '  <div class="__bs-section-title">📝 سجل التشغيل</div>';
    h += '  <div class="__bs-logs" id="__bs-logs">';
    for (var i = 0; i < logs.length; i++) {
      var l = logs[i];
      h += '<div class="__bs-log-entry ' + (colors[l.c] || '') + '"><span class="__bs-log-time">[' + l.t + ']</span> ' + l.m + '</div>';
    }
    h += '</div></div>';
    return h;
  }

  // ══════════════════════════════════════════════════
  //  حقن الواجهة في الصفحة
  // ══════════════════════════════════════════════════
  var panel = document.createElement('div');
  panel.id = '__bs-panel';
  panel.className = '__bs-panel';
  panel.style.position = 'fixed';
  panel.style.zIndex = '99999';
  panel.style.width = '420px';
  panel.style.minWidth = '300px';
  panel.style.minHeight = '160px';
  panel.style.maxHeight = '95vh';
  panel.style.overflow = 'visible';
  document.body.appendChild(panel);

  // ── استعادة الموقع والحجم من التخزين ──
  chrome.storage.local.get('panelConfig', function (pcfg) {
    var c = pcfg.panelConfig || {};
    panel.style.top = (c.top || 10) + 'px';
    panel.style.left = (c.left || 10) + 'px';
    panel.style.width = (c.width || 420) + 'px';
    panel.style.height = (c.height || 300) + 'px';
  });

  function renderUI(mode, state) {
    panel.innerHTML = buildPanelHTML(mode, state || {});
    bindEvents(mode, state);
    enableDragResize();
    // Scroll logs to bottom
    var logsEl = document.getElementById('__bs-logs');
    if (logsEl) logsEl.scrollTop = logsEl.scrollHeight;
  }

  function bindEvents(mode, state) {
    // ─ Toggle collapse
    var toggleBtn = document.getElementById('__bs-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = function () {
        var isCollapsed = panel.classList.toggle('__bs-collapsed');
        toggleBtn.textContent = isCollapsed ? '▼' : '▲';
      };
    }

    if (mode === 'idle') {
      var dropzone = document.getElementById('__bs-dropzone');
      var fileInput = document.getElementById('__bs-file');
      var startBtn2 = document.getElementById('__bs-start');
      var fileInfo = document.getElementById('__bs-file-info');

      if (dropzone && fileInput) {
        dropzone.onclick = function () { fileInput.click(); };
        dropzone.ondragover = function (e) { e.preventDefault(); dropzone.classList.add('__bs-dropzone-active'); };
        dropzone.ondragleave = function () { dropzone.classList.remove('__bs-dropzone-active'); };
        dropzone.ondrop = function (e) {
          e.preventDefault();
          dropzone.classList.remove('__bs-dropzone-active');
          if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
          }
        };
        fileInput.onchange = function (e) {
          if (e.target.files[0]) handleFile(e.target.files[0]);
        };
      }

      function handleFile(file) {
        if (!fileInfo) return;
        fileInfo.className = '__bs-info';
        fileInfo.innerHTML = '<span class="__bs-spinner"></span> جاري قراءة الملف...';
        var fr = new FileReader();
        fr.onload = async function () {
          var r = await xlsxCall('P', { d: fr.result });
          if (r && r.l) {
            window.__bsData = r;
            if (startBtn2) { startBtn2.disabled = false; }
            fileInfo.className = '__bs-info __bs-info-success';
            fileInfo.innerHTML = '✅ <b>' + r.l.length + '</b> رقم بلاغ جاهز للبحث';
          } else {
            fileInfo.className = '__bs-info __bs-info-error';
            fileInfo.innerHTML = '❌ ' + (r ? r.er : 'خطأ في القراءة');
          }
        };
        fr.readAsDataURL(file);
      }

      if (startBtn2) {
        startBtn2.onclick = async function () {
          var data = window.__bsData;
          if (!data || !data.l || !data.l.length) return;
          startBtn2.disabled = true;
          startBtn2.innerHTML = '<span class="__bs-spinner"></span> جاري التحضير...';
          var newState = {
            running: true, done: false,
            sapList: data.l, results: [],
            batchCurrent: 0, batchSaps: [],
            waitingSearch: false, pageRows: [],
            latestExtracts: [],
            logs: [{ t: ts(), m: 'تم تحميل ' + data.l.length + ' رقم بلاغ من الملف', c: 'info' }]
          };
          var save = {}; save[ST] = newState; save.extWb = data.wb; save.extSi = data.si; save.extRi = data.ri;
          await chrome.storage.local.set(save);
          location.reload();
        };
      }

    } else if (mode === 'running') {
      var rstRun = document.getElementById('__bs-reset-run');
      if (rstRun) {
        rstRun.onclick = async function () {
          await chrome.storage.local.remove([ST, 'extWb', 'extSi', 'extRi']);
          location.reload();
        };
      }
    } else if (mode === 'done') {
      var dlBtn = document.getElementById('__bs-download');
      var resetBtn2 = document.getElementById('__bs-reset-done');

      if (dlBtn) {
        dlBtn.onclick = async function () { await handleDownload(state, dlBtn); };
      }
      if (resetBtn2) {
        resetBtn2.onclick = async function () {
          await chrome.storage.local.remove([ST, 'extWb', 'extSi', 'extRi']);
          location.reload();
        };
      }
    }
  }

  // ══════════════════════════════════════════════════
  //  تحميل الملف النهائي
  // ══════════════════════════════════════════════════
  async function handleDownload(state, btn) {
    var s = await chrome.storage.local.get([ST, 'extWb', 'extSi', 'extRi']);
    if (!s.extWb) { if (btn) btn.textContent = '❌ لا يوجد بيانات'; return; }
    if (btn) btn.innerHTML = '<span class="__bs-spinner"></span> جاري التجهيز...';
    var r = await xlsxCall('W', { wb: s.extWb, si: s.extSi, ri: s.extRi, rs: (s[ST] ? s[ST].results : []) || [] });
    if (r && r.b64) {
      var bin = atob(r.b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'التقارير_محدث_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      if (btn) btn.textContent = '✅ تم التحميل';
    } else {
      if (btn) btn.textContent = '❌ فشل التجهيز';
    }
  }

  // ══════════════════════════════════════════════════
  //  السحب والتحجيم
  // ══════════════════════════════════════════════════
  function enableDragResize() {
    var header = panel.querySelector('.__bs-header');
    if (!header) return;
    header.style.cursor = 'grab';
    header.onmousedown = function (e) {
      if (e.target.closest('button, .__bs-header-actions, .__bs-toggle')) return;
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var st = parseInt(panel.style.top) || 10;
      var sl = parseInt(panel.style.left) || 10;
      function onMove(e2) {
        panel.style.top = (st + e2.clientY - startY) + 'px';
        panel.style.left = (sl + e2.clientX - startX) + 'px';
        header.style.cursor = 'grabbing';
      }
      function onUp() {
        header.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        savePanelConfig();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    panel.querySelectorAll('.__bs-resize-handle').forEach(function (h) {
      h.onmousedown = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sw = panel.offsetWidth, sh = panel.offsetHeight;
        var st = parseInt(panel.style.top) || 10;
        var sl = parseInt(panel.style.left) || 10;
        var startX = e.clientX, startY = e.clientY;
        var edge = h.dataset.edge || 'se';
        function onMove(e2) {
          var dx = e2.clientX - startX, dy = e2.clientY - startY;
          var nw = sw, nh = sh, nt = st, nl = sl;
          if (edge.indexOf('e') >= 0) nw = Math.max(300, sw + dx);
          if (edge.indexOf('w') >= 0) { nw = Math.max(300, sw - dx); nl = sl + (sw - nw); }
          if (edge.indexOf('s') >= 0) nh = Math.max(160, sh + dy);
          if (edge.indexOf('n') >= 0) { nh = Math.max(160, sh - dy); nt = st + (sh - nh); }
          panel.style.width = nw + 'px';
          panel.style.height = nh + 'px';
          panel.style.top = nt + 'px';
          panel.style.left = nl + 'px';
          panel.style.maxHeight = 'none';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          savePanelConfig();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
    });
  }

  function savePanelConfig() {
    chrome.storage.local.set({
      panelConfig: {
        top: parseInt(panel.style.top) || 10,
        left: parseInt(panel.style.left) || 10,
        width: panel.offsetWidth || 420,
        height: panel.offsetHeight || 300
      }
    });
  }

  function refreshAutoUI(state) {
    renderUI('running', state);
  }

  // ══════════════════════════════════════════════════
  //  المنطق الرئيسي — بدء التشغيل
  // ══════════════════════════════════════════════════
  var stored = await chrome.storage.local.get(ST);
  var extState = stored[ST];

  // ── وضع الأتمتة
  if (extState && extState.running) {
    console.log('[BSearch] Automation mode');
    renderUI('running', extState);

    if (extState.waitingSearch) {
      // انتظر ظهور الجدول (قد يكون UpdatePanel تأخر)
      var gridWait = 0;
      var currentGrid, hasData;
      while (gridWait < 6) {
        currentGrid = document.getElementById('ContentPlaceHolder1_GridView1');
        hasData = currentGrid && currentGrid.querySelectorAll('tr').length > 1;
        if (hasData) break;
        gridWait++;
        await new Promise(function(r){ setTimeout(r, 500); });
      }

      if (hasData) {
        // ─ استخراج البيانات من الجدول
        var pageRows = extractPageRows(currentGrid);
        extState.pageRows = (extState.pageRows || []).concat(pageRows);
        addLog(extState, 'تم استخراج ' + pageRows.length + ' سجل من الصفحة', 'info');

        // ─ هل يوجد صفحة تالية؟
        var nextPage = findNextPage(currentGrid);
        if (nextPage) {
          var save1 = {}; save1[ST] = extState;
          await chrome.storage.local.set(save1);
          refreshAutoUI(extState);
          
          setTimeout(function() {
            nextPage.click();
          }, 300);
          return;
        }
      } else {
        addLog(extState, 'لم يتم العثور على نتائج في هذه الصفحة/الدفعة', 'warn');
      }

      // ─ معالجة الدفعة الحالية (سواء كان هناك بيانات أو لا)
      processBatch(extState);
      extState.waitingSearch = false;
      extState.pageRows = [];
      extState.batchCurrent++;

      var batchFound = 0;
      for (var bi = extState.results.length - extState.batchSaps.length; bi < extState.results.length; bi++) {
        if (extState.results[bi] && extState.results[bi].reports && extState.results[bi].reports.length > 0) batchFound++;
      }
      addLog(extState, 'اكتملت الدفعة: ' + batchFound + ' تقرير من ' + extState.batchSaps.length + ' بلاغ', batchFound > 0 ? 'ok' : 'warn');
      refreshAutoUI(extState);

      // ─ هل انتهت كل الدفعات؟
      if (extState.batchCurrent * BATCH >= extState.sapList.length) {
        extState.running = false;
        extState.done = true;
        var totalFound = 0;
        for (var ti = 0; ti < extState.results.length; ti++) {
          if (extState.results[ti].reports && extState.results[ti].reports.length > 0) totalFound++;
        }
        addLog(extState, '✅ اكتمل البحث — ' + totalFound + ' تقرير من أصل ' + extState.sapList.length + ' بلاغ', 'ok');
        var save2 = {}; save2[ST] = extState;
        await chrome.storage.local.set(save2);
        notifyPopup('done', { found: totalFound, total: extState.results.length, totalBatches: Math.ceil(extState.sapList.length / BATCH), results: extState.results, logs: extState.logs });
        // Reload the page so the content script re-reads the saved done state fresh
        location.reload();
        return;
      }

      // ─ حفظ والانتقال للدفعة التالية
      var save3 = {}; save3[ST] = extState;
      await chrome.storage.local.set(save3);
    }

    // ─ بدء الدفعة التالية
    if (!extState.waitingSearch) {
      setTimeout(function() {
        startBatch(extState);
      }, 800); // تأخير بسيط لعدم إرهاق السيرفر
    }
    return;
  }

  // ── وضع الانتهاء
  if (extState && extState.done) {
    console.log('[BSearch] Done mode');
    renderUI('done', extState);
    return;
  }

  // ── وضع الخمول
  console.log('[BSearch] Idle mode');
  renderUI('idle', null);

})();
