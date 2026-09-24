// ==================== Multi Uploader — رفع مرفقات متعددة ====================
// Unified ElAraby Portal Assistant — features/attachments/multi-uploader.js
// يرفع عدة ملفات كملاحظات (Note) مستقلة بالتسلسل عبر نفس خدمة البورتال الأصلية
// يعمل كـ content script (الإضافة) وكـ Tampermonkey script بنفس المنطق

(function () {
  'use strict';

  var CFG = { maxFiles: 25, maxFileSizeMB: 20, pollMs: 500, maxPoll: 120 };

  var S = {
    notesEl: null,
    urlAdd: '',
    target: null,
    attachmentSettings: '',
    acceptTypes: '*',
    addEnabled: false,
    isRTE: false,
    isRequired: '',
    escapeText: false,
    files: [],
    results: [],
    busy: false,
    started: false
  };

  var STYLE_ID = 'mu-style';
  var MODAL_ID = 'mu-modal';

  // ==================== CSS ====================
  var MU_CSS = '' +
    '.mu-btn{margin-right:8px;background:#dc2626;color:#fff;border-color:#c41d1d;}' +
    '.mu-btn:hover,.mu-btn:focus,.mu-btn:focus-visible{background:#b91c1c;color:#fff;border-color:#991b1b;}' +
    '#mu-modal{position:fixed;inset:0;z-index:999998;display:none;}' +
    '#mu-modal.mu-open{display:block;}' +
    '#mu-modal .mu-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
    '#mu-modal .mu-box{position:relative;background:#101827;border:1px solid #1e293b;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;font-family:"Cairo",Segoe UI,Tahoma,sans-serif;direction:rtl;color:#e2e8f0;box-shadow:0 25px 60px rgba(0,0,0,.55);}' +
    '#mu-modal .mu-head{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#17334c,#0f1f30);padding:14px 18px;border-bottom:1px solid #1e293b;}' +
    '#mu-modal .mu-title{margin:0;font-size:15px;font-weight:800;color:#fff;}' +
    '#mu-modal .mu-x{background:transparent;border:0;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:6px;}' +
    '#mu-modal .mu-x:hover{color:#fff;background:#1e293b;}' +
    '#mu-modal .mu-body{padding:16px 18px;overflow-y:auto;}' +
    '#mu-modal .mu-label{display:block;font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:6px;}' +
    '#mu-modal .mu-note{width:100%;box-sizing:border-box;background:#0b1220;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:13px;padding:8px 10px;resize:vertical;min-height:52px;outline:none;}' +
    '#mu-modal .mu-note:focus{border-color:#dc2626;}' +
    '#mu-modal .mu-drop{margin-top:12px;border:2px dashed #334155;border-radius:10px;padding:18px 12px;text-align:center;color:#64748b;font-size:13px;cursor:pointer;transition:.2s;}' +
    '#mu-modal .mu-drop:hover,#mu-modal .mu-drop.mu-over{border-color:#dc2626;color:#f87171;background:rgba(220,38,38,.06);}' +
    '#mu-modal .mu-queue{margin-top:12px;max-height:230px;overflow-y:auto;border:1px solid #1e293b;border-radius:10px;padding:8px;min-height:72px;}' +
    '#mu-modal .mu-empty{text-align:center;color:#475569;font-size:12px;padding:18px 0;}' +
    '#mu-modal .mu-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0b1220;border:1px solid #1e293b;border-right:3px solid #334155;border-radius:8px;margin-bottom:6px;font-size:12px;}' +
    '#mu-modal .mu-item.mu-up{border-right-color:#f59e0b;}' +
    '#mu-modal .mu-item.mu-ok{border-right-color:#34d399;}' +
    '#mu-modal .mu-item.mu-err{border-right-color:#f87171;}' +
    '#mu-modal .mu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0;font-weight:700;}' +
    '#mu-modal .mu-size{color:#64748b;font-size:11px;white-space:nowrap;}' +
    '#mu-modal .mu-st{white-space:nowrap;font-size:11px;max-width:42%;overflow:hidden;text-overflow:ellipsis;}' +
    '#mu-modal .mu-st.mu-st-up{color:#f59e0b;}' +
    '#mu-modal .mu-st.mu-st-ok{color:#34d399;}' +
    '#mu-modal .mu-st.mu-st-err{color:#f87171;}' +
    '#mu-modal .mu-progress{margin-top:14px;height:8px;background:#0b1220;border:1px solid #1e293b;border-radius:99px;overflow:hidden;}' +
    '#mu-modal .mu-fill{height:100%;width:0;background:linear-gradient(90deg,#dc2626,#f59e0b);transition:width .3s;border-radius:99px;}' +
    '#mu-modal .mu-meta{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#64748b;}' +
    '#mu-modal .mu-sum{font-weight:700;}' +
    '#mu-modal .mu-sum.mu-good{color:#34d399;}' +
    '#mu-modal .mu-sum.mu-bad{color:#f87171;}' +
    '#mu-modal #mu-counter{direction:ltr;unicode-bidi:isolate;}' +
    '#mu-modal .mu-actions{display:flex;gap:8px;margin-top:14px;}' +
    '#mu-modal .mu-start{flex:1;padding:10px 14px;border:0;border-radius:8px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;}' +
    '#mu-modal .mu-start:hover{background:linear-gradient(135deg,#b91c1c,#991b1b);}' +
    '#mu-modal .mu-start:disabled{opacity:.55;cursor:not-allowed;}' +
    '#mu-modal .mu-cancel{padding:10px 16px;border:1px solid #334155;border-radius:8px;background:transparent;color:#94a3b8;font-family:inherit;font-size:13px;cursor:pointer;}' +
    '#mu-modal .mu-cancel:hover{background:#1e293b;color:#e2e8f0;}' +
    '#mu-modal .mu-cancel:disabled{opacity:.5;cursor:not-allowed;}' +
    '#mu-finput{display:none;}' +
    '.mu-toast{position:fixed;bottom:20px;right:20px;z-index:999999;padding:12px 20px;border-radius:8px;font-family:"Cairo",sans-serif;font-size:14px;font-weight:700;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:opacity .3s;direction:rtl;}' +
    '.mu-toast.mu-t-success{background:#17334c;}' +
    '.mu-toast.mu-t-error{background:#b91c1c;}' +
    '.mu-toast.mu-t-warn{background:#b45309;}' +
    '.mu-toast.mu-t-info{background:#1e293b;border:1px solid #334155;}' +
    '.mu-fieldset-over{outline:2px dashed #dc2626!important;outline-offset:-4px;background:rgba(220,38,38,.05)!important;}';

  // ==================== أدوات مساعدة ====================
  function $(sel, root) { return (root || document).querySelector(sel); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = MU_CSS;
    document.head.appendChild(st);
  }

  function fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function toast(msg, type) {
    var old = document.querySelector('.mu-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'mu-toast mu-t-' + (type || 'info');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 320);
    }, 3200);
  }

  // ==================== قراءة إعدادات كنترول المرفقات الأصلي ====================
  function findNotesEl() {
    return document.querySelector('.entity-notes[data-url-add]') ||
           document.querySelector('[data-url-add]') ||
           document.querySelector('#notescontrol .entity-notes');
  }

  function parseTarget(raw) {
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && o.Id) return o;
    } catch (e) {}
    var id = (raw.match(/["']?Id["']?\s*:\s*["']([a-f0-9-]{36})["']/i) || [])[1];
    var ln = (raw.match(/["']?LogicalName["']?\s*:\s*["']([A-Za-z0-9_]+)["']/) || [])[1];
    return id ? { Id: id, LogicalName: ln || 'incident' } : null;
  }

  function readConfig(el) {
    S.notesEl = el;
    S.urlAdd = el.getAttribute('data-url-add') || '';
    S.attachmentSettings = el.getAttribute('data-attachmentsettings') || '';
    S.acceptTypes = el.getAttribute('data-add-accept-types') || '*';
    S.addEnabled = (el.getAttribute('data-add-enabled') || '') === 'True';
    S.isRTE = (el.getAttribute('data-rte-enabled') || '') === 'True';
    S.isRequired = el.getAttribute('is-required') || '';
    S.escapeText = (el.getAttribute('disable-validation') || '') === 'true';
    S.target = parseTarget(el.getAttribute('data-target') || '');
  }

  // ==================== رمز الحماية والجلسة (نفس منطق shell الأصلي) ====================
  function getToken() {
    var inp = document.querySelector('#antiforgerytoken input[name="__RequestVerificationToken"]');
    return inp ? inp.value : '';
  }

  function refreshToken() {
    var holder = document.querySelector('#antiforgerytoken');
    if (!holder) return Promise.resolve(getToken());
    var url = holder.getAttribute('data-url');
    if (!url) return Promise.resolve(getToken());
    return fetch(url, { method: 'GET', cache: 'no-store', credentials: 'include' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        holder.innerHTML = html;
        var fresh = holder.querySelector('input[name="__RequestVerificationToken"]');
        var val = fresh ? fresh.value : '';
        if (val) {
          var all = document.querySelectorAll('input[name="__RequestVerificationToken"]');
          for (var i = 0; i < all.length; i++) {
            if (all[i] !== fresh) all[i].value = val;
          }
        }
        return val;
      })
      .catch(function () { return getToken(); });
  }

  function sessionAlive(resp) {
    var h = null;
    try { h = resp.headers.get('x-responded-json'); } catch (e) {}
    if (h) {
      try {
        var j = JSON.parse(h);
        if (j && (j.status === 401 || j.status === 403)) return false;
      } catch (e) {}
    }
    if (resp.status === 401 || resp.status === 403) return false;
    if (resp.redirected && /SignIn|Login/i.test(resp.url)) return false;
    return true;
  }

  function gotoLogin() {
    try {
      location.replace(location.origin + '/SignIn?returnUrl=' + encodeURIComponent(location.href));
    } catch (e) {}
  }

  function serverError(resp) {
    var ct = '';
    try { ct = resp.headers.get('content-type') || ''; } catch (e) {}
    if (ct.indexOf('json') > -1) {
      return resp.json()
        .then(function (j) { return (j && j.Message) || ('فشل الرفع (كود ' + resp.status + ')'); })
        .catch(function () { return 'فشل الرفع (كود ' + resp.status + ')'; });
    }
    return Promise.resolve(resp.statusText || ('فشل الرفع (كود ' + resp.status + ')'));
  }

  // ==================== بناء طلب الرفع (مطابق لـ addNote الأصلي) ====================
  function buildFormData(file, noteText) {
    var text = noteText || '';
    if (S.isRTE) {
      var rte = document.getElementById('pcf_notescontrol');
      if (rte && typeof rte.value === 'string') text = rte.value;
    }
    if (S.escapeText) text = escapeHtml(text);

    var fd = new FormData();
    fd.append('regardingEntityLogicalName', (S.target && S.target.LogicalName) || 'incident');
    fd.append('regardingEntityId', (S.target && S.target.Id) || '');
    fd.append('text', text);
    fd.append('isRequired', S.isRequired || '');
    fd.append('isPrivate', 'false');
    fd.append('attachmentSettings', S.attachmentSettings || '');
    if (S.isRTE) fd.append('isRTEEnabled', 'true');
    fd.append('file', file, file.name);
    return fd;
  }

  function uploadTimeoutMs(f) {
    var mb = Math.ceil(((f && f.size) || 0) / 1048576);
    var ms = 45000 + mb * 12000;
    return ms > 300000 ? 300000 : ms;
  }

  function uploadOne(file, noteText) {
    if (!S.urlAdd || !S.target || !S.target.Id) {
      return Promise.reject(new Error('إعدادات المرفقات غير متوفرة'));
    }
    var fd = buildFormData(file, noteText);
    var attempts = 0;

    function trySend() {
      attempts++;
      var token = '';
      try { token = getToken(); } catch (e0) {}
      if (token) fd.set('__RequestVerificationToken', token);

      var opts = { method: 'POST', body: fd, credentials: 'include' };
      var timer = null;
      if (typeof AbortController !== 'undefined') {
        var ctrl = new AbortController();
        opts.signal = ctrl.signal;
        timer = setTimeout(function () { try { ctrl.abort(); } catch (e1) {} }, uploadTimeoutMs(file));
      }

      function done() { if (timer) { clearTimeout(timer); timer = null; } }

      return fetch(S.urlAdd, opts).then(function (resp) {
        done();
        if (!sessionAlive(resp)) {
          gotoLogin();
          throw new Error('انتهت الجلسة');
        }
        if (resp.ok) return true;
        if ((resp.status === 400 || resp.status === 403) && attempts < 2) {
          return refreshToken().then(trySend);
        }
        return serverError(resp).then(function (msg) { throw new Error(msg); });
      }).catch(function (err) {
        done();
        if (err && err.name === 'AbortError') throw new Error('انتهت مهلة الرفع — تحقق من الاتصال ثم أعد المحاولة');
        if (err instanceof TypeError) throw new Error('تعذر الاتصال بالخادم');
        throw err;
      });
    }

    return trySend();
  }

  function triggerNotesRefresh() {
    if (!S.notesEl) return;
    try {
      S.notesEl.dispatchEvent(new CustomEvent('refresh', { bubbles: true }));
    } catch (e) {}
  }

  // ==================== واجهة النافذة ====================
  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    var m = document.createElement('div');
    m.id = MODAL_ID;
    m.innerHTML =
      '<div class="mu-overlay">' +
        '<div class="mu-box" role="dialog" aria-modal="true" aria-label="رفع مرفقات متعددة">' +
          '<div class="mu-head">' +
            '<h3 class="mu-title">رفع مرفقات متعددة</h3>' +
            '<button type="button" class="mu-x" aria-label="إغلاق">✕</button>' +
          '</div>' +
          '<div class="mu-body">' +
            '<label class="mu-label" for="mu-note">نص الملاحظة (اختياري — يُستخدم مع كل الملفات)</label>' +
            '<textarea id="mu-note" class="mu-note" rows="2" placeholder="اتركه فارغًا لرفع المرفقات فقط"></textarea>' +
            '<div class="mu-drop" id="mu-drop">اسحب الملفات هنا أو <u>اختر من الجهاز</u></div>' +
            '<div class="mu-queue" id="mu-queue"></div>' +
            '<div class="mu-progress"><div class="mu-fill" id="mu-fill"></div></div>' +
            '<div class="mu-meta">' +
              '<span id="mu-counter">0 / 0</span>' +
              '<span class="mu-sum" id="mu-sum"></span>' +
            '</div>' +
            '<div class="mu-actions">' +
              '<button type="button" class="mu-start" id="mu-start">ابدأ الرفع</button>' +
              '<button type="button" class="mu-cancel" id="mu-cancel">إلغاء</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    $('.mu-x', m).addEventListener('click', function () { closeModal(); });
    $('#mu-cancel', m).addEventListener('click', function () { closeModal(); });
    $('#mu-start', m).addEventListener('click', function () { startUpload(); });
    $('#mu-drop', m).addEventListener('click', function () { openPicker(); });

    var drop = $('#mu-drop', m);
    drop.addEventListener('dragover', function (e) {
      e.preventDefault();
      drop.classList.add('mu-over');
    });
    drop.addEventListener('dragleave', function () { drop.classList.remove('mu-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('mu-over');
      addFiles(Array.prototype.slice.call(e.dataTransfer.files || []));
      openModal();
    });

    m.addEventListener('mousedown', function (e) {
      if (e.target === $('.mu-overlay', m)) closeModal();
    });
  }

  function ensureFileInput() {
    var inp = document.getElementById('mu-finput');
    if (inp) return inp;
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'mu-finput';
    inp.multiple = true;
    if (S.acceptTypes && S.acceptTypes !== '*') inp.accept = S.acceptTypes;
    inp.addEventListener('change', function () {
      replaceFiles(Array.prototype.slice.call(inp.files || []));
      inp.value = '';
      openModal();
    });
    document.body.appendChild(inp);
    return inp;
  }

  function openPicker() {
    if (S.busy) { toast('جاري الرفع حاليًا', 'warn'); return; }
    ensureFileInput().click();
  }

  function openModal() {
    ensureModal();
    document.getElementById(MODAL_ID).classList.add('mu-open');
  }

  function closeModal() {
    if (S.busy) { toast('انتظر انتهاء الرفع أولًا', 'warn'); return; }
    var m = document.getElementById(MODAL_ID);
    if (m) m.classList.remove('mu-open');
    S.files = [];
    S.results = [];
    S.started = false;
    renderQueue();
    updateProgress(0, 0);
    var sum = $('#mu-sum');
    if (sum) { sum.textContent = ''; sum.className = 'mu-sum'; }
    updateStartLabel();
  }

  // ==================== إدارة قائمة الملفات ====================
  function validFile(f) {
    if (!f) return false;
    if (f.size > CFG.maxFileSizeMB * 1048576) {
      toast('الملف «' + f.name + '» أكبر من ' + CFG.maxFileSizeMB + 'MB', 'error');
      return false;
    }
    return true;
  }

  function replaceFiles(list) {
    S.files = list.filter(validFile).slice(0, CFG.maxFiles);
    S.results = [];
    renderQueue();
  }

  function addFiles(list) {
    var merged = S.files.slice();
    list.forEach(function (f) {
      if (!validFile(f)) return;
      if (merged.length >= CFG.maxFiles) return;
      var dup = merged.some(function (x) { return x.name === f.name && x.size === f.size; });
      if (!dup) merged.push(f);
    });
    S.files = merged;
    renderQueue();
  }

  function renderQueue() {
    var box = $('#mu-queue');
    if (!box) return;
    box.innerHTML = '';
    if (!S.files.length) {
      box.innerHTML = '<div class="mu-empty">لا توجد ملفات مختارة</div>';
      updateProgress(0, 0);
      return;
    }
    S.files.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'mu-item' + statusClass(i);
      row.id = 'mu-item-' + i;

      var name = document.createElement('span');
      name.className = 'mu-name';
      name.textContent = f.name;
      name.title = f.name;

      var size = document.createElement('span');
      size.className = 'mu-size';
      size.textContent = fmtSize(f.size);

      var st = document.createElement('span');
      st.className = 'mu-st' + statusTextClass(i);
      st.textContent = statusText(i);

      row.appendChild(name);
      row.appendChild(size);
      row.appendChild(st);
      box.appendChild(row);
    });
    updateProgress(doneCount(), S.files.length);
    updateStartLabel();
  }

  function statusClass(i) {
    var r = S.results[i];
    return r === 'ok' ? ' mu-ok' : r === 'err' ? ' mu-err' : '';
  }

  function statusTextClass(i) {
    var r = S.results[i];
    return r === 'ok' ? ' mu-st-ok' : r === 'err' ? ' mu-st-err' : '';
  }

  function statusText(i) {
    var r = S.results[i];
    if (r === 'ok') return '✓ تم';
    if (r === 'err') return '✗ فشل';
    if (r === 'up') return 'جارٍ الرفع…';
    return 'بانتظار';
  }

  function setItemState(i, state, msg) {
    S.results[i] = state;
    var row = document.getElementById('mu-item-' + i);
    if (!row) return;
    row.className = 'mu-item' + statusClass(i);
    var st = row.querySelector('.mu-st');
    if (st) {
      st.className = 'mu-st' + statusTextClass(i);
      st.textContent = state === 'err' && msg ? '✗ ' + msg : statusText(i);
      st.title = state === 'err' && msg ? msg : '';
    }
  }

  function doneCount() {
    var n = 0;
    for (var i = 0; i < S.files.length; i++) {
      if (S.results[i] === 'ok' || S.results[i] === 'err') n++;
    }
    return n;
  }

  function pendingEntries() {
    var out = [];
    for (var i = 0; i < S.files.length; i++) {
      if (S.results[i] !== 'ok') out.push(i);
    }
    return out;
  }

  function updateProgress(done, total) {
    var fill = $('#mu-fill');
    var counter = $('#mu-counter');
    if (fill) fill.style.width = total > 0 ? Math.round((done / total) * 100) + '%' : '0%';
    if (counter) counter.textContent = done + ' / ' + total;
  }

  function updateStartLabel() {
    var btn = $('#mu-start');
    if (!btn) return;
    if (S.started && failedCount() > 0) {
      var n = pendingEntries().length;
      btn.textContent = n > 0 ? 'إعادة الفاشل (' + n + ')' : 'ابدأ الرفع';
    } else {
      btn.textContent = 'ابدأ الرفع';
    }
  }

  function failedCount() {
    var n = 0;
    for (var i = 0; i < S.results.length; i++) {
      if (S.results[i] === 'err') n++;
    }
    return n;
  }

  function setBusyUI(busy) {
    S.busy = busy;
    var start = $('#mu-start');
    var cancel = $('#mu-cancel');
    var x = $('#mu-modal .mu-x');
    var note = $('#mu-note');
    if (start) start.disabled = busy;
    if (cancel) cancel.disabled = busy;
    if (x) x.disabled = busy;
    if (note) note.disabled = busy;
    if (start && busy) start.textContent = 'جارٍ الرفع…';
  }

  // ==================== تشغيل الرفع التسلسلي ====================
  function startUpload() {
    if (S.busy) return;
    var entries = pendingEntries();
    if (!entries.length) {
      toast('لا توجد ملفات للرفع', 'warn');
      return;
    }
    if (!S.urlAdd || !S.target) {
      toast('إعدادات المرفقات غير متوفرة في الصفحة', 'error');
      return;
    }
    runUpload(entries);
  }

  function runUpload(entries) {
    ensureModal();
    S.started = true;
    setBusyUI(true);

    var noteEl = $('#mu-note');
    var noteText = noteEl ? noteEl.value : '';
    var total = entries.length;
    var ok = 0;
    var fail = 0;
    var sum = $('#mu-sum');
    if (sum) { sum.textContent = ''; sum.className = 'mu-sum'; }
    updateProgress(0, total);

    var k = 0;

    function next() {
      if (k >= total) return finish();
      var idx = entries[k];
      setItemState(idx, 'up');

      var p;
      try {
        p = uploadOne(S.files[idx], noteText);
      } catch (ex) {
        p = Promise.reject(ex instanceof Error ? ex : new Error('فشل'));
      }
      p.then(function () {
        setItemState(idx, 'ok');
        ok++;
      }, function (err) {
        setItemState(idx, 'err', err && err.message ? err.message : 'فشل');
        fail++;
      }).then(function () {
        k++;
        updateProgress(k, total);
        next();
      });
    }

    function finish() {
      triggerNotesRefresh();
      setBusyUI(false);

      var s = $('#mu-sum');
      if (s) {
        s.textContent = 'نجح ' + ok + ' • فشل ' + fail;
        s.className = 'mu-sum ' + (fail ? 'mu-bad' : 'mu-good');
      }

      toast('تم الرفع: ' + ok + ' نجح' + (fail ? ' • ' + fail + ' فشل' : ''),
        fail ? (ok ? 'warn' : 'error') : 'success');

      updateStartLabel();

      if (!fail) {
        setTimeout(function () {
          if (!S.busy) closeModal();
        }, 1600);
      }
    }

    next();
  }

  // ==================== حقن الزر ومنطقة السحب على المرفقات ====================
  function injectButton() {
    if (!S.addEnabled) return;
    var anchor = document.querySelector('.note-actions .addnote');
    if (!anchor) return;
    if (document.querySelector('.mu-btn')) return;

    var btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'btn btn-default mu-btn';
    btn.setAttribute('role', 'button');
    btn.textContent = 'رفع متعدد';
    btn.title = 'رفع أكثر من ملف في مرة واحدة (كل ملف كملاحظة مستقلة)';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal();
    });
    anchor.insertAdjacentElement('afterend', btn);
  }

  function bindFieldsetDrop() {
    var zone = (S.notesEl && S.notesEl.closest('fieldset')) ||
               document.querySelector('[data-name="tab_4_section_7"]') ||
               S.notesEl;
    if (!zone || zone.dataset.muDropBound === '1') return;
    zone.dataset.muDropBound = '1';

    zone.addEventListener('dragover', function (e) {
      if (S.busy) return;
      e.preventDefault();
      zone.classList.add('mu-fieldset-over');
    });
    zone.addEventListener('dragleave', function (e) {
      if (zone.contains(e.target)) return;
      zone.classList.remove('mu-fieldset-over');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('mu-fieldset-over');
      if (S.busy) { toast('جاري الرفع حاليًا', 'warn'); return; }
      var list = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (!list.length) return;
      addFiles(list);
      openModal();
    });
  }

  // ==================== الإقلاع ====================
  function init() {
    ensureStyle();
    ensureFileInput();

    var attempts = 0;
    (function poll() {
      var el = findNotesEl();
      if (el) {
        readConfig(el);
        if (S.urlAdd && S.target) {
          ensureModal();
          injectButton();
          bindFieldsetDrop();
          return;
        }
      }
      attempts++;
      if (attempts < CFG.maxPoll) setTimeout(poll, CFG.pollMs);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();