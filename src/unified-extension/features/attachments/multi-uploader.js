// ==================== Multi Uploader — رفع مرفقات متعددة ====================
// Unified ElAraby Portal Assistant — features/attachments/multi-uploader.js
// يرفع عدة ملفات كملاحظات (Note) مستقلة بالتسلسل عبر نفس خدمة البورتال الأصلية
// يعمل كـ content script (الإضافة) وكـ Tampermonkey script بنفس المنطق

(function () {
  'use strict';

  var CFG = { 
    maxFiles: 25, 
    maxFileSizeMB: 20, 
    pollMs: 500, 
    maxPoll: 120,
    portalMaxMB: 5,           // حد البورتال الفعلي
    uploadTimeoutBaseMs: 45000,
    uploadTimeoutPerMB: 12000,
    uploadTimeoutCapMs: 300000
  };

  var S = {
    notesEl: null,
    urlAdd: '',
    urlGet: '',
    urlGetAttachments: '',
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
    started: false,
    mode: 'local', // 'local' | 'url' | 'copy'
    copySourceId: '',
    copyAttachments: [],
    copySelected: [],
    fileNotes: [],      // ملاحظة لكل ملف
    fileProgress: [],   // تقدم لكل ملف (0-100)
    fileXhr: []         // XMLHttpRequest لكل ملف للإلغاء/التقدم
  };

  var STYLE_ID = 'mu-style';
  var MODAL_ID = 'mu-modal';

  // ==================== CSS ====================
  var MU_CSS = '' +
    '#mu-modal{position:fixed;inset:0;z-index:999998;display:none;}' +
    '#mu-modal.mu-open{display:block;}' +
    '#mu-modal .mu-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
    '#mu-modal .mu-box{position:relative;background:#101827;border:1px solid #1e293b;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;font-family:"Cairo",Segoe UI,Tahoma,sans-serif;direction:rtl;color:#e2e8f0;box-shadow:0 25px 60px rgba(0,0,0,.55);}' +
    '#mu-modal .mu-head{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#17334c,#0f1f30);padding:14px 18px;border-bottom:1px solid #1e293b;}' +
    '#mu-modal .mu-title{margin:0;font-size:15px;font-weight:800;color:#fff;}' +
    '#mu-modal .mu-x{background:transparent;border:0;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:6px;}' +
    '#mu-modal .mu-x:hover{color:#fff;background:#1e293b;}' +
    '#mu-modal .mu-tabs{display:flex;gap:4px;padding:8px 12px 0;background:#101827;border-bottom:1px solid #1e293b;}' +
    '#mu-modal .mu-tab{flex:1;padding:8px 12px;border:0;border-radius:6px 6px 0 0;background:transparent;color:#94a3b8;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:.2s;}' +
    '#mu-modal .mu-tab:hover{color:#e2e8f0;background:#1e293b;}' +
    '#mu-modal .mu-tab.active{color:#fff;background:#1e293b;}' +
    '#mu-modal .mu-body{padding:16px 18px;overflow-y:auto;}' +
    '#mu-modal .mu-panel{display:none;}' +
    '#mu-modal .mu-panel.active{display:block;}' +
    '#mu-modal .mu-label{display:block;font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:6px;}' +
    '#mu-modal .mu-note{width:100%;box-sizing:border-box;background:#0b1220;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:13px;padding:8px 10px;resize:vertical;min-height:52px;outline:none;}' +
    '#mu-modal .mu-note:focus{border-color:#dc2626;}' +
    '#mu-modal .mu-drop{margin-top:12px;border:2px dashed #334155;border-radius:10px;padding:18px 12px;text-align:center;color:#64748b;font-size:13px;cursor:pointer;transition:.2s;}' +
    '#mu-modal .mu-drop:hover,#mu-modal .mu-drop.mu-over{border-color:#dc2626;color:#f87171;background:rgba(220,38,38,.06);}' +
    '#mu-modal .mu-url-input{width:100%;box-sizing:border-box;background:#0b1220;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:13px;padding:8px 10px;resize:vertical;min-height:80px;outline:none;margin-bottom:8px;}' +
    '#mu-modal .mu-url-input:focus{border-color:#dc2626;}' +
    '#mu-modal .mu-fetch-btn{width:100%;padding:10px 14px;border:0;border-radius:8px;background:linear-gradient(135deg,#0a7cff,#00b4ff);color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;margin-bottom:12px;}' +
    '#mu-modal .mu-fetch-btn:hover{background:linear-gradient(135deg,#0069d9,#0090cc);}' +
    '#mu-modal .mu-fetch-btn:disabled{opacity:.55;cursor:not-allowed;}' +
    '#mu-modal .mu-copy-source{display:flex;gap:8px;margin-bottom:12px;}' +
    '#mu-modal .mu-copy-source-input{flex:1;padding:10px 12px;background:#0b1220;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-family:inherit;font-size:13px;outline:none;direction:ltr;}' +
    '#mu-modal .mu-copy-source-input:focus{border-color:#dc2626;}' +
    '#mu-modal .mu-copy-fetch-btn{padding:10px 16px;border:0;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;}' +
    '#mu-modal .mu-copy-fetch-btn:hover{background:linear-gradient(135deg,#d97706,#b45309);}' +
    '#mu-modal .mu-copy-fetch-btn:disabled{opacity:.55;cursor:not-allowed;}' +
    '#mu-modal .mu-copy-list{margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid #1e293b;border-radius:8px;padding:8px;}' +
    '#mu-modal .mu-copy-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#0b1220;border:1px solid #1e293b;border-radius:6px;margin-bottom:4px;font-size:12px;}' +
    '#mu-modal .mu-copy-item input{width:16px;height:16px;accent-color:#dc2626;cursor:pointer;}' +
    '#mu-modal .mu-copy-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0;}' +
    '#mu-modal .mu-copy-size{color:#64748b;font-size:11px;white-space:nowrap;}' +
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
    '.mu-fieldset-over{outline:2px dashed #dc2626!important;outline-offset:-4px;background:rgba(220,38,38,.05)!important;}' +
    '#mu-modal .mu-item{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 10px;background:#0b1220;border:1px solid #1e293b;border-right:3px solid #334155;border-radius:8px;margin-bottom:6px;font-size:12px;}' +
    '#mu-modal .mu-item.mu-up{border-right-color:#f59e0b;}' +
    '#mu-modal .mu-item.mu-ok{border-right-color:#34d399;}' +
    '#mu-modal .mu-item.mu-err{border-right-color:#f87171;}' +
    '#mu-modal .mu-item-header{display:flex;justify-content:space-between;align-items:center;}' +
    '#mu-modal .mu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0;font-weight:700;}' +
    '#mu-modal .mu-size{color:#64748b;font-size:11px;white-space:nowrap;}' +
    '#mu-modal .mu-file-note{width:100%;box-sizing:border-box;background:#0b1220;border:1px solid #1e293b;border-radius:6px;color:#e2e8f0;font-family:inherit;font-size:12px;padding:6px 8px;margin-top:4px;outline:none;}' +
    '#mu-modal .mu-file-note:focus{border-color:#dc2626;}' +
    '#mu-modal .mu-file-progress-wrap{display:flex;gap:8px;align-items:center;height:6px;margin-top:4px;}' +
    '#mu-modal .mu-file-progress{flex:1;height:6px;border-radius:3px;background:#0b1220;accent-color:#dc2626;}' +
    '#mu-modal .mu-file-progress-text{font-size:10px;color:#64748b;min-width:32px;white-space:nowrap;}' +
    '#mu-modal .mu-st{white-space:nowrap;font-size:11px;max-width:42%;overflow:hidden;text-overflow:ellipsis;margin-top:4px;}' +
    '#mu-modal .mu-st.mu-st-up{color:#f59e0b;}' +
    '#mu-modal .mu-st.mu-st-ok{color:#34d399;}' +
    '#mu-modal .mu-st.mu-st-err{color:#f87171;}';

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

  // ==================== خريطة MIME -> امتداد ====================
  var MIME_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'video/mpeg': '.mpeg',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/json': '.json',
    'application/xml': '.xml',
    'application/octet-stream': '.bin'
  };

  function parseContentDisposition(header) {
    if (!header) return null;
    // filename*=UTF-8''encoded
    var m = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (m) return decodeURIComponent(m[1]);
    // filename="..."
    m = header.match(/filename\s*=\s*"([^"]+)"/i);
    if (m) return m[1];
    // filename=...
    m = header.match(/filename\s*=\s*([^;]+)/i);
    if (m) return m[1].trim();
    return null;
  }

  function extractNameHintFromHtml(html) {
    if (!html) return null;
    // <a href="...">name (size)</a>
    var m = html.match(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    if (m) return { url: m[1], name: m[2].replace(/\s*\([^)]+\)\s*$/, '').trim() };
    return null;
  }

  // CDN domains that need background proxy (CORS bypass)
  var CDN_DOMAINS = ['fbcdn.net', 'fna.fbcdn.net', 'cdninstagram.com'];

  function isCdnUrl(url) {
    try {
      var host = new URL(url).hostname;
      return CDN_DOMAINS.some(function(d) { return host.endsWith(d); });
    } catch (e) { return false; }
  }

  function fetchViaProxy(url) {
    return new Promise(function(resolve, reject) {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Extension context not available'));
        return;
      }
      chrome.runtime.sendMessage({ type: 'FETCH_PROXY', url: url }, function(resp) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error((resp && resp.error) || 'Proxy fetch failed'));
          return;
        }
        resolve({ data: resp.data, type: resp.type });
      });
    });
  }

  function urlToFile(url, nameHint) {
    // Use background proxy for CDN URLs to bypass CORS
    if (isCdnUrl(url)) {
      return fetchViaProxy(url)
        .then(function(result) {
          var fname = nameHint || 'attachment_' + Date.now();
          var ext = MIME_EXT[result.type.split(';')[0].trim()] || '';
          if (ext && !fname.endsWith(ext)) fname += ext;
          return new File([new Uint8Array(result.data)], fname, { type: result.type });
        })
        .catch(function(err) {
          console.warn('CDN proxy failed, falling back to direct fetch:', err);
          // Fallback to direct fetch (may fail due to CORS)
          return fetchDirect(url, nameHint);
        });
    }
    return fetchDirect(url, nameHint);
  }

  function fetchDirect(url, nameHint) {
    return fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var ct = resp.headers.get('content-type') || '';
        if (ct.indexOf('text/html') > -1) throw new Error('جلسة منتهية — أعد تسجيل الدخول');
        var cd = resp.headers.get('content-disposition');
        var fname = parseContentDisposition(cd);
        return resp.blob().then(function(blob) {
          if (!fname) {
            var ext = MIME_EXT[ct.split(';')[0].trim()] || '';
            if (!ext && nameHint) {
              var dot = nameHint.lastIndexOf('.');
              if (dot > 0) ext = nameHint.slice(dot);
            }
            fname = nameHint || 'attachment_' + Date.now();
            if (ext && !fname.endsWith(ext)) fname += ext;
          }
          return new File([blob], fname, { type: blob.type || ct || 'application/octet-stream' });
        });
      });
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
    S.urlGet = el.getAttribute('data-url-get') || '';
    S.urlGetAttachments = el.getAttribute('data-url-get-attachments') || '';
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

  // ==================== Error Mapper — رسائل خطأ واضحة ====================
  function mapUploadError(resp, err) {
    if (resp && resp.status === 413) {
      return 'حجم الملف يتجاوز حد البورتال (' + CFG.portalMaxMB + 'MB). '
        + 'خيارات: ضغط الفيديو محليًا، أو رفعه على OneDrive/SharePoint ولصق الرابط في الملاحظة.';
    }
    if (resp && resp.status === 400) {
      return 'طلب غير صالح — قد يكون التنسيق غير مدعوم أو الجلسة منتهية.';
    }
    if (resp && (resp.status === 401 || resp.status === 403)) {
      return 'انتهت الجلسة — سجّل الدخول مجددًا.';
    }
    if (err && err.name === 'AbortError') {
      return 'انتهت مهلة الرفع (الملف كبير أو الاتصال بطيء).';
    }
    if (err instanceof TypeError) {
      return 'تعذر الاتصال بالخادم — تحقق من الإنترنت.';
    }
    return err && err.message ? err.message : ('فشل الرفع (كود ' + (resp && resp.status ? resp.status : 'غير معروف') + ')');
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
    var ms = CFG.uploadTimeoutBaseMs + mb * CFG.uploadTimeoutPerMB;
    return ms > CFG.uploadTimeoutCapMs ? CFG.uploadTimeoutCapMs : ms;
  }

  function uploadOne(file, noteText, idx) {
    return new Promise(function(resolve, reject) {
      if (file._muError) return reject(new Error(file._muError));
      if (!S.urlAdd || !S.target || !S.target.Id) {
        return reject(new Error('إعدادات المرفقات غير متوفرة'));
      }

      var fd = buildFormData(file, noteText);
      var attempts = 0;
      var xhr = new XMLHttpRequest();

      // Store XHR for potential cancellation
      if (typeof idx === 'number') S.fileXhr[idx] = xhr;

      function attempt() {
        attempts++;
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable && typeof idx === 'number') {
            var pct = Math.round((e.loaded / e.total) * 100);
            S.fileProgress[idx] = pct;
            updateFileProgress(idx, pct);
          }
        };

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
            return;
          }
          // Create a response-like object for error mapping
          var resp = { status: xhr.status };
          if (xhr.status === 413 || xhr.status === 400) {
            // Try refresh token on 400/403
            if (attempts < 2) {
              refreshToken().then(function() { attempt(); }).catch(reject);
              return;
            }
          }
          reject(new Error(mapUploadError(resp, null)));
        };

        xhr.onerror = function() {
          reject(new Error('تعذر الاتصال بالخادم'));
        };

        xhr.ontimeout = function() {
          reject(new Error('انتهت مهلة الرفع — تحقق من الاتصال ثم أعد المحاولة'));
        };

        xhr.timeout = uploadTimeoutMs(file);
        xhr.open('POST', S.urlAdd, true);
        xhr.withCredentials = true;
        
        // Add token if available
        var token = getToken();
        if (token) {
          fd.set('__RequestVerificationToken', token);
        }
        
        xhr.send(fd);
      }

      attempt();
    });
  }

  function updateFileProgress(idx, pct) {
    var row = document.getElementById('mu-item-' + idx);
    if (!row) return;
    var prog = row.querySelector('.mu-file-progress');
    var txt = row.querySelector('.mu-file-progress-text');
    if (prog) prog.value = pct;
    if (txt) txt.textContent = pct + '%';
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
          '<div class="mu-tabs">' +
            '<button type="button" class="mu-tab active" data-mode="local">📁 ملفات محلية</button>' +
            '<button type="button" class="mu-tab" data-mode="url">🔗 من روابط</button>' +
            '<button type="button" class="mu-tab" data-mode="copy">📋 نسخ من بلاغ</button>' +
          '</div>' +
          '<div class="mu-body">' +
            '<label class="mu-label" for="mu-note">نص الملاحظة (اختياري — يُستخدم مع كل الملفات)</label>' +
            '<textarea id="mu-note" class="mu-note" rows="2" placeholder="اتركه فارغًا لرفع المرفقات فقط"></textarea>' +
            '<div class="mu-panel active" data-panel="local">' +
              '<div class="mu-drop" id="mu-drop">اسحب الملفات هنا أو <u>اختر من الجهاز</u></div>' +
            '</div>' +
            '<div class="mu-panel" data-panel="url">' +
              '<textarea id="mu-url-input" class="mu-url-input" placeholder="أدخل الروابط (رابط واحد في كل سطر)&#10;مثال: https://elarabyportalpfs.powerappsportals.com/_entity/annotation/.../...?t=..."></textarea>' +
              '<button type="button" class="mu-fetch-btn" id="mu-fetch-urls">جلب الملفات من الروابط</button>' +
            '</div>' +
            '<div class="mu-panel" data-panel="copy">' +
              '<div class="mu-copy-source">' +
                '<input type="text" id="mu-copy-source-input" class="mu-copy-source-input" placeholder="معرف البلاغ المصدر (CAS... أو GUID)" title="أدخل رقم البلاغ أو المعرف الفريد">' +
                '<button type="button" class="mu-copy-fetch-btn" id="mu-copy-fetch">جلب المرفقات</button>' +
              '</div>' +
              '<div class="mu-copy-list" id="mu-copy-list"></div>' +
            '</div>' +
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
    $('#mu-start', m).addEventListener('click', onStartClick);
    $('#mu-drop', m).addEventListener('click', function () { openPicker(); });

    m.querySelectorAll('.mu-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchMode(tab.dataset.mode);
      });
    });

    $('#mu-fetch-urls', m).addEventListener('click', function () { fetchFromUrls(); });
    $('#mu-copy-fetch', m).addEventListener('click', function () { fetchCopyAttachments(); });

    var drop = $('#mu-drop', m);
    drop.addEventListener('dragover', function (e) {
      e.preventDefault();
      drop.classList.add('mu-over');
    });
    drop.addEventListener('dragleave', function () { drop.classList.remove('mu-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('mu-over');
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (!files.length) {
        // Try text/uri-list or text/html (dragging links/images from portal)
        var uriList = e.dataTransfer.getData('text/uri-list');
        var html = e.dataTransfer.getData('text/html');
        if (uriList) {
          var u = uriList.trim().split('\n')[0].trim();
          if (u) { urlToFile(u).then(function(f){ addFiles([f]); openModal(); }).catch(function(err){ toast('فشل: ' + err.message, 'warn'); }); return; }
        }
        if (html) {
          var hint = extractNameHintFromHtml(html);
          if (hint) { urlToFile(hint.url, hint.name).then(function(f){ addFiles([f]); openModal(); }).catch(function(err){ toast('فشل: ' + err.message, 'warn'); }); return; }
        }
        return;
      }
      addFiles(files);
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
    S.fileNotes = [];
    S.fileProgress = [];
    S.fileXhr = [];
    S.started = false;
    S.mode = 'local';
    S.copySourceId = '';
    S.copyAttachments = [];
    S.copySelected = [];
    renderQueue();
    updateProgress(0, 0);
    var sum = $('#mu-sum');
    if (sum) { sum.textContent = ''; sum.className = 'mu-sum'; }
    updateStartLabel();
    // Reset tabs
    document.querySelectorAll('.mu-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelector('.mu-tab[data-mode="local"]').classList.add('active');
    document.querySelectorAll('.mu-panel').forEach(function(p){ p.classList.remove('active'); });
    document.querySelector('.mu-panel[data-panel="local"]').classList.add('active');
  }

  function switchMode(mode) {
    S.mode = mode;
    document.querySelectorAll('.mu-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelector('.mu-tab[data-mode="' + mode + '"]').classList.add('active');
    document.querySelectorAll('.mu-panel').forEach(function(p){ p.classList.remove('active'); });
    document.querySelector('.mu-panel[data-panel="' + mode + '"]').classList.add('active');
  }

  // ==================== جلب الملفات من روابط ====================
  function fetchFromUrls() {
    if (S.busy) { toast('جاري الرفع حاليًا', 'warn'); return; }
    var input = $('#mu-url-input');
    if (!input || !input.value.trim()) { toast('أدخل رابطًا واحدًا على الأقل', 'warn'); return; }
    var urls = input.value.trim().split('\n').map(function(u){ return u.trim(); }).filter(function(u){ return u; });
    if (!urls.length) { toast('لا توجد روابط صالحة', 'warn'); return; }

    var btn = $('#mu-fetch-urls');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الجلب...'; }

    var fetched = 0;
    var total = urls.length;

    function fetchNext(i) {
      if (i >= total) {
        if (btn) { btn.disabled = false; btn.textContent = 'جلب الملفات من الروابط'; }
        input.value = '';
        toast('تم جلب ' + fetched + ' من ' + total + ' ملف', fetched === total ? 'success' : 'warn');
        return;
      }
      var url = urls[i];
      // Extract name hint from pasted HTML/text (e.g., <a href="...">name (2.5 MB)</a>)
      var nameHint = null;
      try {
        var hint = extractNameHintFromHtml(url);
        if (hint) { url = hint.url; nameHint = hint.name; }
      } catch(e) {}

      urlToFile(url, nameHint)
        .then(function(file) {
          if (file.size > CFG.maxFileSizeMB * 1048576) {
            throw new Error('حجم الملف يتجاوز ' + CFG.maxFileSizeMB + 'MB');
          }
          addFiles([file]);
          fetched++;
        })
        .catch(function(err) {
          console.warn('Failed to fetch:', url, err);
          toast('فشل: ' + err.message, 'warn');
        })
        .then(function() {
          fetchNext(i + 1);
        });
    }

    fetchNext(0);
  }

  // ==================== نسخ المرفقات من بلاغ آخر ====================
  function fetchCopyAttachments() {
    if (S.busy) { toast('جاري الرفع حاليًا', 'warn'); return; }
    var input = $('#mu-copy-source-input');
    if (!input || !input.value.trim()) { toast('أدخل رابط البلاغ أو المعرف', 'warn'); return; }
    var sourceId = input.value.trim();
    S.copySourceId = sourceId;

    var btn = $('#mu-copy-fetch');
    var listEl = $('#mu-copy-list');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الجلب...'; }
    if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;">جاري جلب المرفقات...</div>';

    // Resolve sourceId to incident GUID
    resolveIncidentId(sourceId).then(function(incidentGuid) {
      if (!incidentGuid) {
        if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#f87171;padding:20px;">تعذر العثور على البلاغ: ' + sourceId + '</div>';
        if (btn) { btn.disabled = false; btn.textContent = 'جلب المرفقات'; }
        return;
      }

      // Prepare request body (matches portal's EntityNotes.getData)
      var ordersAttr = S.notesEl.getAttribute('data-orders') || '[]';
      var orders = [];
      try { orders = JSON.parse(ordersAttr); } catch(e) {}
      var regarding = { Id: incidentGuid, LogicalName: 'incident', Name: null, KeyAttributes: [], RowVersion: null };
      var body = JSON.stringify({ regarding: regarding, orders: orders, page: 1, pageSize: 100 });

      // Target endpoint
      var url = S.urlGet || S.urlGetAttachments;
      if (!url) {
        var base = S.urlAdd.replace(/\/entity-form-addnote\/.*/, '');
        url = base + '/entity-notes/' + S.notesEl.getAttribute('data-attachmentsettings').split('/').pop();
      }

      // Token from antiforgery input
      var token = getToken();

      // Try direct fetch with token header first
      function tryFetchWithToken(authHeaderName) {
        var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (token) h[authHeaderName] = token;
        return fetch(url, { method: 'POST', credentials: 'include', headers: h, body: body })
          .then(function(resp) {
            if (resp.ok) return resp.json();
            if (resp.status === 400 || resp.status === 403) throw new Error('TOKEN_REJECTED');
            throw new Error('HTTP ' + resp.status);
          });
      }

      // MAIN world bridge using shell.ajaxSafePost (injects script into page context)
      function tryShellBridge() {
        return new Promise(function(resolve, reject) {
          var handler = function(e) {
            if (e.detail && e.detail.type === 'mu-notes-result') {
              window.removeEventListener('mu-notes-result', handler);
              if (e.detail.ok) resolve(e.detail.data);
              else reject(new Error(e.detail.error || 'Shell bridge failed'));
            }
          };
          window.addEventListener('mu-notes-result', handler);
          var script = document.createElement('script');
          script.textContent = '(' + function(u, b) {
            try {
              if (window.shell && window.shell.ajaxSafePost) {
                window.shell.ajaxSafePost({
                  type: 'POST',
                  contentType: 'application/json',
                  url: u,
                  data: b,
                  global: false
                }).done(function(r) {
                  window.dispatchEvent(new CustomEvent('mu-notes-result', { detail: { type: 'mu-notes-result', ok: true, data: r } }));
                }).fail(function(xhr) {
                  window.dispatchEvent(new CustomEvent('mu-notes-result', { detail: { type: 'mu-notes-result', ok: false, error: xhr.statusText || 'Failed' } }));
                });
              } else {
                window.dispatchEvent(new CustomEvent('mu-notes-result', { detail: { type: 'mu-notes-result', ok: false, error: 'shell.ajaxSafePost not available' } }));
              }
            } catch (ex) {
              window.dispatchEvent(new CustomEvent('mu-notes-result', { detail: { type: 'mu-notes-result', ok: false, error: ex.message } }));
            }
          }.toString() + ')("' + url.replace(/"/g, '\\"') + '", ' + JSON.stringify(body).replace(/"/g, '\\"') + ');';
          document.documentElement.appendChild(script);
          script.remove();
          setTimeout(function() {
            window.removeEventListener('mu-notes-result', handler);
            reject(new Error('Shell bridge timeout'));
          }, 10000);
        });
      }

      tryFetchWithToken('RequestVerificationToken')
        .catch(function(e) {
          if (e.message === 'TOKEN_REJECTED') return tryFetchWithToken('__RequestVerificationToken');
          throw e;
        })
        .catch(function(e) {
          if (e.message === 'TOKEN_REJECTED') return tryShellBridge();
          throw e;
        })
        .then(function(data) {
          var records = data && data.Records ? data.Records : (Array.isArray(data) ? data : []);
          S.copyAttachments = records.filter(function(r) { return r.HasAttachment; });
          renderCopyList();
        })
        .catch(function(err) {
          console.error('Copy fetch error:', err);
          if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#f87171;padding:20px;">خطأ: ' + err.message + '</div>';
        })
        .then(function() {
          if (btn) { btn.disabled = false; btn.textContent = 'جلب المرفقات'; }
        });
    }).catch(function(err) {
      if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#f87171;padding:20px;">خطأ: ' + err.message + '</div>';
      if (btn) { btn.disabled = false; btn.textContent = 'جلب المرفقات'; }
    });
  }

  function resolveIncidentId(input) {
    // 1. Full URL with ?id=GUID
    try {
      var u = new URL(input);
      var id = u.searchParams.get('id');
      if (id && /^[a-f0-9-]{36}$/i.test(id)) return Promise.resolve(id);
    } catch(e) {}
    // 2. Bare GUID
    if (/^[a-f0-9-]{36}$/i.test(input)) return Promise.resolve(input);
    // 3. CAS number via _api
    if (/^CAS\d+/i.test(input)) {
      return fetch('/_api/incidents?$filter=ticketnumber eq \'' + input + '\'&$select=incidentid', { credentials: 'include', headers: { 'Accept': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.value && d.value.length) return d.value[0].incidentid;
          return null;
        })
        .catch(function() { return null; });
    }
    return Promise.resolve(null);
  }

  function renderCopyList() {
    var listEl = $('#mu-copy-list');
    if (!listEl) return;
    if (!S.copyAttachments.length) {
      listEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;">لا توجد مرفقات في هذا البلاغ</div>';
      return;
    }
    listEl.innerHTML = '';
    S.copyAttachments.forEach(function(att, i) {
      var row = document.createElement('div');
      row.className = 'mu-copy-item';
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.dataset.idx = i;
      chk.addEventListener('change', function() {
        if (chk.checked) S.copySelected.push(i);
        else S.copySelected = S.copySelected.filter(function(x){ return x !== i; });
      });
      var name = document.createElement('span');
      name.className = 'mu-copy-name';
      name.textContent = att.AttachmentFileName || 'مرفق';
      name.title = att.AttachmentFileName || '';
      var size = document.createElement('span');
      size.className = 'mu-copy-size';
      size.textContent = att.AttachmentSizeDisplay || '';
      row.appendChild(chk);
      row.appendChild(name);
      row.appendChild(size);
      listEl.appendChild(row);
    });
  }

  // ==================== معالجة زر البدء (يوجّه حسب الوضع) ====================
  function onStartClick() {
    if (S.mode === 'copy') startCopyUpload();
    else startUpload();
  }

  function startCopyUpload() {
    if (S.busy) return;
    if (!S.copySelected.length) { toast('اختر مرفقًا واحدًا على الأقل للنسخ', 'warn'); return; }
    if (!S.urlAdd || !S.target) { toast('إعدادات المرفقات غير متوفرة', 'error'); return; }

    var noteEl = $('#mu-note');
    var noteText = noteEl ? noteEl.value : '';
    var indices = S.copySelected.slice();
    var total = indices.length;

    // Download selected attachments into S.files first, then use standard upload flow
    function downloadNext(k) {
      if (k >= total) {
        // All downloads attempted; now run standard upload on S.files
        renderQueue();
        startUpload();
        return;
      }
      var idx = indices[k];
      var att = S.copyAttachments[idx];
      // Use AttachmentUrlWithTimeStamp from the record (correct URL with controlId + token)
      var downloadUrl = att.AttachmentUrlWithTimeStamp || '/_entity/annotation/' + att.Id + '?t=' + Date.now();
      fetch(downloadUrl, { method: 'GET', credentials: 'include', cache: 'no-store' })
        .then(function(resp) {
          if (!resp.ok) throw new Error('فشل تحميل المرفق: HTTP ' + resp.status);
          return resp.blob();
        })
        .then(function(blob) {
          var file = new File([blob], att.AttachmentFileName, { type: blob.type || 'application/octet-stream' });
          addFiles([file]);
        })
        .catch(function(err) {
          // Add a placeholder file with error state so it appears in queue
          var errFile = new File([new Blob()], att.AttachmentFileName || 'attachment', { type: 'application/octet-stream' });
          errFile._muError = err.message || 'فشل التحميل';
          addFiles([errFile]);
        })
        .then(function() {
          downloadNext(k + 1);
        });
    }

    downloadNext(0);
  }

  // ==================== إدارة قائمة الملفات ====================
  function validFile(f) {
    if (!f) return false;
    // حد البورتال الفعلي 5MB
    if (f.size > CFG.portalMaxMB * 1048576) {
      toast('الملف «' + f.name + '» (' + fmtSize(f.size) + ') يتجاوز حد البورتال (' + CFG.portalMaxMB + 'MB). '
        + 'جرب: [ضغط الفيديو] أو [رفع خارجي + لصق رابط]', 'warn');
      return false;
    }
    // حد الأداة الأقصى (20MB) — للتحقق الإضافي
    if (f.size > CFG.maxFileSizeMB * 1048576) {
      toast('الملف «' + f.name + '» أكبر من الحد الأقصى للأداة (' + CFG.maxFileSizeMB + 'MB)', 'error');
      return false;
    }
    return true;
  }

  function replaceFiles(list) {
    S.files = list.filter(validFile).slice(0, CFG.maxFiles);
    S.results = [];
    S.fileNotes = [];
    S.fileProgress = [];
    S.fileXhr = [];
    renderQueue();
  }

  function addFiles(list) {
    var merged = S.files.slice();
    var startIdx = merged.length;
    list.forEach(function (f) {
      if (!validFile(f)) return;
      if (merged.length >= CFG.maxFiles) return;
      var dup = merged.some(function (x) { return x.name === f.name && x.size === f.size; });
      if (!dup) merged.push(f);
    });
    S.files = merged;
    // Initialize per-file arrays for new files
    while (S.fileNotes.length < S.files.length) S.fileNotes.push('');
    while (S.fileProgress.length < S.files.length) S.fileProgress.push(0);
    while (S.fileXhr.length < S.files.length) S.fileXhr.push(null);
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
    // Ensure arrays are initialized
    if (!S.fileNotes) S.fileNotes = [];
    if (!S.fileProgress) S.fileProgress = [];
    if (!S.fileXhr) S.fileXhr = [];

    S.files.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'mu-item' + statusClass(i);
      row.id = 'mu-item-' + i;

      // Header: name + size
      var header = document.createElement('div');
      header.className = 'mu-item-header';

      var name = document.createElement('span');
      name.className = 'mu-name';
      name.textContent = f.name;
      name.title = f.name;

      var size = document.createElement('span');
      size.className = 'mu-size';
      size.textContent = fmtSize(f.size);

      header.appendChild(name);
      header.appendChild(size);
      row.appendChild(header);

      // Per-file note input
      var noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'mu-file-note';
      noteInput.placeholder = 'ملاحظة لهذا المرفق (اختياري)';
      noteInput.value = S.fileNotes[i] || '';
      noteInput.dataset.idx = i;
      noteInput.addEventListener('input', function() {
        S.fileNotes[i] = this.value;
      });
      row.appendChild(noteInput);

      // Per-file progress bar
      var progWrap = document.createElement('div');
      progWrap.className = 'mu-file-progress-wrap';
      var prog = document.createElement('progress');
      prog.className = 'mu-file-progress';
      prog.value = S.fileProgress[i] || 0;
      prog.max = 100;
      var progText = document.createElement('span');
      progText.className = 'mu-file-progress-text';
      progText.textContent = (S.fileProgress[i] || 0) + '%';
      progWrap.appendChild(prog);
      progWrap.appendChild(progText);
      row.appendChild(progWrap);

      // Status text
      var st = document.createElement('span');
      st.className = 'mu-st' + statusTextClass(i);
      st.textContent = statusText(i);
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
    var generalNoteText = noteEl ? noteEl.value : '';
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
      // Per-file note takes priority, fallback to general note
      var fileNoteText = (S.fileNotes && S.fileNotes[idx]) ? S.fileNotes[idx] : generalNoteText;

      var p;
      try {
        p = uploadOne(S.files[idx], fileNoteText, idx);
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
    if (document.querySelector('.mu-multi-btn')) return;

    var container = anchor.parentElement;
    if (!container) return;

    var btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'btn btn-default mu-multi-btn';
    btn.setAttribute('role', 'button');
    btn.textContent = 'رفع متعدد';
    btn.title = 'رفع أكثر من ملف في مرة واحدة (كل ملف كملاحظة مستقلة)';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal();
    });
    container.appendChild(btn);
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
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (!files.length) {
        // Try text/uri-list or text/html (dragging links/images from portal)
        var uriList = e.dataTransfer.getData('text/uri-list');
        var html = e.dataTransfer.getData('text/html');
        if (uriList) {
          var u = uriList.trim().split('\n')[0].trim();
          if (u) { urlToFile(u).then(function(f){ addFiles([f]); openModal(); }).catch(function(err){ toast('فشل: ' + err.message, 'warn'); }); return; }
        }
        if (html) {
          var hint = extractNameHintFromHtml(html);
          if (hint) { urlToFile(hint.url, hint.name).then(function(f){ addFiles([f]); openModal(); }).catch(function(err){ toast('فشل: ' + err.message, 'warn'); }); return; }
        }
        return;
      }
      addFiles(files);
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