// ==UserScript==
// @name         📨 مساعد إرسال الماسنجر
// @namespace    https://github.com/local/messenger-sender
// @version      2.0.0
// @description  إرسال رسائل مجمّعة من ملف CSV أو اللصق المباشر مع أزرار خدمات سريعة
// @author       Portal AutoFiller
// @match        *://*.facebook.com/*
// @match        *://facebook.com/*
// @match        *://*.messenger.com/*
// @match        *://messenger.com/*
// @match        *://*.instagram.com/*
// @match        *://instagram.com/*
// @match        *://*.whatsapp.com/*
// @match        *://whatsapp.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const isMessagingSite = /facebook\.com|messenger\.com|instagram\.com|whatsapp\.com/i.test(location.hostname);

  const SERVICES = [
    { id: 'svc-1', label: '-prem', text: 'تم عمل صيانه وتنظيف الوحده الداخليه والوحده الخارجيه وغسيل بمكنه الغسيل وتنظيف حوض الصرف // خدمة بريميوم كير Premium Care\nوتحصيل 450' },
    { id: 'svc-2', label: 'صيانة', text: 'تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف' },
    { id: 'svc-3', label: 'صيانة وشحن', text: 'تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون\nتم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف' },
    { id: 'svc-4', label: 'تعليمات توالف', text: 'يتم تصوير فيديو لـ جميع القطع عند وضعها في الكارتونة وتقفيل الكارتونة وارسال الفيديو علي صفحة المراجعة ..\n- يتم ارسال بيان بموقف التوالف سواء بوجود نواقص او بالتمام' },
    { id: 'svc-5', label: 'فوري', text: 'لو العميل دافع فوري بنصور الفاتورة وبنخصمها من التكلفة الاجمالية' },
    { id: 'svc-6', label: 'يحتاج كباس', text: 'يحتاج كباس وفلتر وريلاي واوفرلود' },
    { id: 'svc-7', label: 'تغيير كباس', text: 'تم تغيير كباس وفلتر\nوتم تنظيف الدائرة وعمل فاكيوم وشحن فريون\nوريلاي واوفرلود' },
    { id: 'svc-8', label: 'صرف وجوان', text: 'وتنظيف الصرف وضبط الجوانات' },
    { id: 'svc-9', label: 'inst', text: `⚠️ - تقرأها كويس لأنها مهمة جدا ..❌❌❌

- لا يوجد تحصلات الا طلبات الصيانه دورية للتكييف .. بتكلفة 450 لأول جهاز .. واللي بعد كده بـ 300  ////// لو الاجهزة حاجه الضمان كل الاجهزرة علي 450

- في حالة شحن التكييف يتم ارفاق صورة العداد بجانب بنسه الأمبير و توضيح القرائتين بجانب السيريال قبل و بعد العمليه فى صوره واحده و ليس صورتين منفصلين مع تصوير توصيله طلمبه الفاكيوم بالجهاز بعد أكتمال الفاكيوم

⦁\tالبلاغات التركيب يتم تصوير الفاكيوم ويتم ملئ الضمان والفاتورة وارفاقهم وكتابة تاريخ الإنتاج  علي الضمان

-القطع الغالية يتم فتحها بعناااية ويتم تصوير فيديو لفتح الكرتونة

- في حال لو  السريال ممسوح او " القطعة الخارجية " بعيدة .. يتم تصوير مكان السريال وهو ممسوح او القطعه وهي بعيده..

-يجب إرفاق صورة الضمان ويكون مكتوب فيه رقم التليفون هام جدا .
- يجب تصوير  الفاتورة ان وجدت.. خاصة لو مبرد هواء او مياة بتم اعتماد الضمان منها مطلوبة بشدة ..

- صورة أو فيديو يوضح حالة الجهاز عامة خاصة اذا كان هناك سوء استخدام او نمل او صراصير ..

- يتم ذكر سبب التحصيل في حال كان الجهاز داخل الضمان .

=== نبداء ببلاغات التركيب الاول ===
بعد الساعه 6 لازم نكلم العميل كل ساعتين في حال اتاخرنا عن كده ..
- في حال أي شئ له علاقة بالاستبدال او العميل يرفض الصيانة ويريد الاستبدال يتم تصوير فيديو بمواصفات كل منتج مع تصوير الضمان والفاتورة " الفاتورة لازم سجل تجاري وبطاقة ضريبية وعليها عنوان ورقم التاجر "

- فاتورة العربي عند التركيب يتم التأكد ان الموديلات الموجود عند العميل هي اللي في الفاتورة ويتم كتابة السرايل الداخلية والخارجية والتاريخ ورقم البلاغ علي الفاتورة .. في حالة عدم وضوح الفاتورة يتم تصوير الفاتورة علي 3 أجزاء ..` }
  ];

  // ══════════════════════════════════════════════════════════════════
  //  STYLES
  // ══════════════════════════════════════════════════════════════════
  const CSS = `
    #msq-fab { position: fixed !important; bottom: 20px !important; left: 20px !important; width: 42px !important; height: 42px !important; border-radius: 50% !important; background: linear-gradient(135deg, #0a7cff 0%, #0055cc 100%) !important; color: #fff !important; border: none !important; cursor: grab !important; z-index: 2147483646 !important; font-size: 18px !important; box-shadow: 0 4px 15px rgba(0,0,0,.4) !important; display: flex !important; align-items: center !important; justify-content: center !important; transition: box-shadow .2s !important; user-select: none !important; line-height: 1 !important; text-align: center !important; padding: 0 !important; }
    #msq-fab:active { cursor: grabbing !important; box-shadow: 0 6px 20px rgba(0,0,0,.6) !important; }
    #msq-fab.hidden { display: none !important; }

    #msq-panel { position: fixed !important; bottom: 70px !important; left: 20px !important; width: 320px !important; max-height: 80vh !important; background: #1a1d27 !important; border: 1px solid #2a2d3e !important; border-radius: 14px !important; box-shadow: 0 20px 60px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.04) !important; font-family: 'Segoe UI', Tahoma, Arial, sans-serif !important; font-size: 13px !important; color: #c8d0e0 !important; z-index: 2147483647 !important; direction: rtl !important; user-select: none !important; overflow: hidden !important; display: none !important; }
    #msq-panel.visible { display: block !important; }
    #msq-panel.dragging { box-shadow: 0 30px 80px rgba(0,0,0,.9) !important; opacity: .95 !important; }

    #msq-header { background: linear-gradient(135deg, #0a7cff 0%, #0055cc 100%) !important; padding: 8px 12px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; cursor: grab !important; }
    #msq-header:active { cursor: grabbing !important; }
    #msq-title { font-weight: 700 !important; font-size: 12px !important; color: #fff !important; }
    #msq-close { background: rgba(255,255,255,.2) !important; border: none !important; border-radius: 50% !important; color: #fff !important; cursor: pointer !important; width: 22px !important; height: 22px !important; font-size: 14px !important; display: flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; }

    #msq-body { padding: 10px !important; display: flex !important; flex-direction: column !important; gap: 6px !important; max-height: calc(80vh - 40px) !important; overflow-y: auto !important; }
    #msq-body::-webkit-scrollbar { width: 4px !important; }
    #msq-body::-webkit-scrollbar-thumb { background: #2a3050 !important; border-radius: 2px !important; }

    .msq-svc-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 4px !important; }
    .msq-svc-wrap { display: flex !important; align-items: center !important; gap: 2px !important; }
    .msq-svc-btn { flex: 1 !important; padding: 5px 3px !important; border: 1px solid #2a4a7a !important; border-radius: 6px !important; background: rgba(10,124,255,.08) !important; color: #a8c7fa !important; font-size: 10px !important; font-weight: 600 !important; cursor: pointer !important; text-align: center !important; transition: all .15s !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
    .msq-svc-btn:hover { background: rgba(10,124,255,.2) !important; border-color: #0a7cff !important; color: #fff !important; }
    .msq-svc-btn:active { transform: scale(.95) !important; }
    .msq-svc-btn.disabled { opacity: .4 !important; cursor: not-allowed !important; }
    .msq-cpy-btn { width: 20px !important; height: 20px !important; border: 1px solid #2a4a7a !important; border-radius: 4px !important; background: rgba(10,124,255,.08) !important; color: #7a9cc8 !important; cursor: pointer !important; font-size: 10px !important; display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important; transition: all .15s !important; line-height: 1 !important; padding: 0 !important; }
    .msq-cpy-btn:hover { background: rgba(10,124,255,.25) !important; color: #fff !important; border-color: #0a7cff !important; }
    .msq-cpy-btn.copied { background: #0d2b1c !important; color: #2bd46f !important; border-color: #1a4a2a !important; }

    .msq-sep { border: none !important; border-top: 1px solid #2a2d3e !important; margin: 2px 0 !important; }

    #msq-drop { border: 2px dashed #2a4a7a !important; border-radius: 8px !important; padding: 8px !important; text-align: center !important; cursor: pointer !important; background: rgba(10,124,255,.05) !important; color: #7a9cc8 !important; font-size: 11px !important; position: relative !important; overflow: hidden !important; }
    #msq-drop input[type=file] { position: absolute !important; inset: 0 !important; opacity: 0 !important; cursor: pointer !important; width: 100% !important; height: 100% !important; }
    #msq-paste { width:100% !important; height:50px !important; background:rgba(10,124,255,.05) !important; border:1px solid #2a4a7a !important; border-radius:6px !important; color:#c8d0e0 !important; padding:6px !important; font-family:inherit !important; font-size:11px !important; resize:vertical !important; box-sizing:border-box !important; }
    #msq-paste:focus { outline: none !important; border-color: #0a7cff !important; }

    .msq-row { display: flex !important; align-items: center !important; gap: 6px !important; font-size: 11px !important; color: #8899bb !important; }
    .msq-row input[type=range] { flex: 1 !important; accent-color: #0a7cff !important; cursor: pointer !important; }
    .msq-row .msq-val { min-width: 30px !important; text-align: center !important; color: #a8c7fa !important; font-weight: 600 !important; }

    .msq-btns { display: flex !important; gap: 6px !important; }
    .msq-btn { flex: 1 !important; padding: 7px 4px !important; border: none !important; border-radius: 6px !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; transition: opacity .15s !important; }
    .msq-btn:disabled { opacity: .4 !important; cursor: not-allowed !important; }
    .msq-btn-start { background: #0a7cff !important; color: #fff !important; }
    .msq-btn-stop { background: #c0392b !important; color: #fff !important; }
    .msq-btn-like { background: #0084ff !important; color: #fff !important; }
    .msq-btn-instr { background: #f0b429 !important; color: #1a1d27 !important; }

    #msq-status { padding: 6px 10px !important; border-radius: 6px !important; font-size: 11px !important; font-weight: 500 !important; background: #12162a !important; color: #7a9cc8 !important; border: 1px solid #1e2340 !important; min-height: 28px !important; display: flex !important; align-items: center !important; }
    #msq-status.ok { background:#0d2b1c !important; color:#2bd46f !important; border-color:#1a4a2a !important; }
    #msq-status.error { background:#2a0808 !important; color:#ff6b6b !important; border-color:#4a1a1a !important; }
    #msq-status.warn { background:#2a2008 !important; color:#f0b429 !important; border-color:#4a3a1a !important; }

    #msq-progress-wrap { height: 3px !important; background: #1e2340 !important; border-radius: 3px !important; display: none; }
    #msq-progress-bar { height: 100% !important; background: linear-gradient(90deg,#0a7cff,#00b4ff) !important; width: 0% !important; border-radius: 3px !important; transition: width .3s !important; }
    #msq-counter { text-align: center !important; font-size: 10px !important; color: #5577aa !important; }

    .msq-log-header { display: flex !important; align-items: center !important; gap: 4px !important; font-size: 10px !important; font-weight: 700 !important; margin-bottom: 3px !important; }
    .msq-badge { background: rgba(255,255,255,.08) !important; border-radius: 8px !important; padding: 1px 5px !important; font-size: 9px !important; color: #8899bb !important; }
    .msq-log-box { max-height: 80px !important; overflow-y: auto !important; border-radius: 6px !important; padding: 3px !important; border: 1px solid #1e2340 !important; }
    .msq-log-box::-webkit-scrollbar { width: 3px !important; }
    .msq-log-box::-webkit-scrollbar-thumb { background:#2a3050 !important; border-radius:2px !important; }
    .msq-sent-item { padding: 4px 6px !important; margin-bottom: 2px !important; border-left: 3px solid #2bd46f !important; background: #0d2010 !important; border-radius: 3px !important; font-size: 10px !important; color: #a8f5c4 !important; }
    .msq-err-item { padding: 5px 7px !important; margin-bottom: 3px !important; border-left: 3px solid #ff4444 !important; background: #1a0606 !important; border-radius: 3px !important; font-size: 10px !important; }
    .msq-err-title { color:#ff6b6b !important; font-weight:700 !important; margin-bottom:1px !important; }
    .msq-err-detail { color: #ff8888 !important; background: #200808 !important; padding: 3px 5px !important; border-radius: 2px !important; font-size: 9px !important; font-family: monospace !important; word-break: break-all !important; white-space: pre-wrap !important; }
    .msq-empty { text-align:center !important; color:#334466 !important; padding:8px !important; font-size:10px !important; }
  `;

  if (!document.getElementById('msq-style')) {
    const style = document.createElement('style');
    style.id = 'msq-style';
    style.textContent = CSS;
    document.documentElement.appendChild(style);
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else if (k === 'textContent') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c instanceof Node) e.appendChild(c);
    }
    return e;
  }

  // FAB زر عائم صغير
  const fab = el('button', { id: 'msq-fab', title: 'فتح مساعد الإرسال', textContent: '📨' });

  // الهيدر
  const h = el('div', { id: 'msq-header' }, [
    el('span', { id: 'msq-title', textContent: 'مساعد الإرسال' }),
    el('button', { id: 'msq-close', title: 'إغلاق', textContent: '✕' })
  ]);

  // أزرار الخدمات مع أزرار النسخ
  const svcBtns = [];
  const svcElements = SERVICES.map((s, i) => {
    const wrap = el('div', { className: 'msq-svc-wrap' });
    const btn = el('button', { className: 'msq-svc-btn', id: s.id, title: s.label, textContent: s.label });
    const cpy = el('button', { className: 'msq-cpy-btn', title: 'نسخ المحتوى', textContent: '📋' });
    cpy.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(s.text).then(() => {
        cpy.textContent = '✓'; cpy.classList.add('copied');
        setTimeout(() => { cpy.textContent = '📋'; cpy.classList.remove('copied'); }, 1200);
      });
    });
    btn.addEventListener('click', () => { if (!isRunning) sendService(i); });
    wrap.appendChild(btn); wrap.appendChild(cpy);
    svcBtns.push(btn);
    return wrap;
  });
  const svcGrid = el('div', { className: 'msq-svc-grid' }, svcElements);

  // فاصل
  const sep1 = el('hr', { className: 'msq-sep' });

  // رفع ملف CSV
  const fileInput = el('input', { type: 'file', id: 'msq-file', accept: '.csv,.txt' });
  const dropZone = el('div', { id: 'msq-drop', textContent: '📁 اسحب ملف CSV هنا أو اضغط' }, [fileInput]);

  // منطقة اللصق
  const pasteArea = el('textarea', { id: 'msq-paste', placeholder: 'أو الصق البيانات هنا...' });

  // شريط التأخير
  const delaySlider = el('input', { type: 'range', id: 'msq-delay', min: '1000', max: '10000', step: '500', value: '2500' });
  const delayLabel = el('span', { className: 'msq-val', id: 'msq-delay-label', textContent: '2.5 ث' });
  const delayRow = el('div', { className: 'msq-row' }, [el('label', { textContent: '⏱:' }), delaySlider, delayLabel]);

  // أزرار التحكم
  const startBtn = el('button', { className: 'msq-btn msq-btn-start', id: 'msq-start', textContent: '▶ إرسال' });
  const like10Btn = el('button', { className: 'msq-btn msq-btn-like', id: 'msq-like-10', textContent: '👍 10' });
  const stopBtn = el('button', { className: 'msq-btn msq-btn-stop', id: 'msq-stop', disabled: 'disabled', textContent: '⛔ إيقاف' });
  const btns = el('div', { className: 'msq-btns' }, [startBtn, like10Btn, stopBtn]);

  // زر إرسال التعليمات العامة (منفصل)
  const instrBtn = el('button', { className: 'msq-btn msq-btn-instr', id: 'msq-send-instr', textContent: '📋 إرسال التعليمات العامة' });
  const instrRow = el('div', { className: 'msq-btns', style: 'margin-top: 4px;' }, [instrBtn]);

  // الحالة والتقدم
  const statusEl = el('div', { id: 'msq-status', textContent: 'جاهز' });
  const progressB = el('div', { id: 'msq-progress-bar' });
  const progressW = el('div', { id: 'msq-progress-wrap' }, [progressB]);
  const counterEl = el('div', { id: 'msq-counter' });

  // اللوجات
  const sentLog = el('div', { className: 'msq-log-box', id: 'msq-sent-log' }, [el('div', { className: 'msq-empty', textContent: 'لا رسائل مرسلة' })]);
  const errLog = el('div', { className: 'msq-log-box', id: 'msq-err-log' }, [el('div', { className: 'msq-empty', textContent: 'لا أخطاء' })]);
  const sentBadge = el('span', { className: 'msq-badge', id: 'msq-sent-badge', textContent: '0' });
  const errBadge = el('span', { className: 'msq-badge', id: 'msq-err-badge', textContent: '0' });
  const sentSection = el('div', {}, [el('div', { className: 'msq-log-header', style: 'color:#2bd46f;' }, ['✅ المرسلة ', sentBadge]), sentLog]);
  const errSection = el('div', {}, [el('div', { className: 'msq-log-header', style: 'color:#ff6b6b;' }, ['❌ الأخطاء ', errBadge]), errLog]);

  // تجميع الـ body
  const body = el('div', { id: 'msq-body' }, [svcGrid, sep1, dropZone, pasteArea, delayRow, btns, instrRow, statusEl, progressW, counterEl, sentSection, errSection]);
  const panel = el('div', { id: 'msq-panel' }, [h, body]);

  function injectPanel() {
    if (!document.getElementById('msq-fab')) document.documentElement.appendChild(fab);
    if (!document.getElementById('msq-panel')) document.documentElement.appendChild(panel);
  }
  injectPanel();
  setInterval(injectPanel, 2000);

  let msgLines = [], isRunning = false, stopReq = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setStatus(text, type = '') { statusEl.className = type; statusEl.textContent = text; }

  function addSent(num, preview) {
    const empty = sentLog.querySelector('.msq-empty'); if (empty) empty.remove();
    const d = el('div', { className: 'msq-sent-item', textContent: '#' + num + ' - ' + preview.substring(0, 60) });
    sentLog.prepend(d); sentBadge.textContent = sentLog.children.length;
  }

  function addErr(num, preview, detail) {
    const empty = errLog.querySelector('.msq-empty'); if (empty) empty.remove();
    const d = el('div', { className: 'msq-err-item' }, [
      el('div', { className: 'msq-err-title', textContent: '❌ #' + num }),
      el('div', { className: 'msq-err-detail', textContent: detail })
    ]);
    errLog.prepend(d); errBadge.textContent = errLog.children.length;
  }

  // ══════════════════════════════════════════════════════════════════
  //  CSV Parser
  // ══════════════════════════════════════════════════════════════════
  function parseCSV(rawText) {
    const firstLine = rawText.split(/\r?\n/)[0] || '';
    const tabsCount = firstLine.split('\t').length;
    const semiCount = firstLine.split(';').length;
    const commaCount = firstLine.split(',').length;
    let delim = ',';
    if (tabsCount > semiCount && tabsCount > commaCount) delim = '\t';
    else if (semiCount > commaCount) delim = ';';

    function parseRow(line) {
      const cols = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === delim && !inQ) { cols.push(cur.replace(/[\r\n]+/g, ' ').trim()); cur = ''; continue; }
        cur += c;
      }
      cols.push(cur.replace(/[\r\n]+/g, ' ').trim());
      return cols;
    }

    let rawLines = []; let cur = ''; let inQ = false;
    for (let i = 0; i < rawText.length; i++) {
      const c = rawText[i];
      if (c === '"') inQ = !inQ;
      if ((c === '\n' || c === '\r') && !inQ) {
        if (c === '\r' && rawText[i + 1] === '\n') i++;
        if (cur.trim()) rawLines.push(cur);
        cur = '';
      } else cur += c;
    }
    if (cur.trim()) rawLines.push(cur);

    let headerRow = null;
    if (rawLines.length > 0 && (rawLines[0].includes('رقم الطلب') || rawLines[0].includes('اسم العميل'))) {
      headerRow = parseRow(rawLines.shift());
    }

    const findCol = name => headerRow ? headerRow.findIndex(h => h.includes(name)) : -1;
    const iSAP = findCol('SAP') !== -1 ? findCol('SAP') : 11;
    const iOffice = findCol('ملاحظات المكتب') !== -1 ? findCol('ملاحظات المكتب') : 7;
    const iNotes2 = iOffice + 1;

    return rawLines.map(raw => {
      const cols = parseRow(raw);
      const parts = []; let firstAfterSAP = true;
      for (let i = 0; i < cols.length; i++) {
        const val = cols[i].replace(/;/g, ' ').trim();
        if (!val || val === '0') continue;
        if (i > iSAP) { parts.push(firstAfterSAP ? '\n\n\n' + val : '\n' + val); firstAfterSAP = false; }
        else { parts.push(val); }
      }
      let msg = parts.join(' ').replace(/ \n/g, '\n').replace(/[ \t]+/g, ' ').trim();
      const notesText = [(cols[iOffice] || ''), (cols[iNotes2] || '')].join(' ');
      if (notesText.includes('اسماعيل')) msg += '\nالقطع موجودة في المحلية';
      return msg;
    }).filter(Boolean);
  }

  // ══════════════════════════════════════════════════════════════════
  //  إرسال رسالة
  // ══════════════════════════════════════════════════════════════════
  function findInputBoxInDoc(doc) {
    for (const s of ['div[aria-label="Message"]', 'div[aria-label="رسالة"]', 'div[aria-label="Aa"]']) {
      const e = doc.querySelector(s); if (e) return e;
    }
    const lex = doc.querySelector('[data-lexical-editor]'); if (lex) return lex;
    for (const e of doc.querySelectorAll('*')) {
      const ce = e.contentEditable; if (ce === 'true' || ce === 'plaintext-only') return e;
    }
    function walkShadow(root) {
      for (const e of root.querySelectorAll('*')) {
        const ce = e.contentEditable; if (ce === 'true' || ce === 'plaintext-only') return e;
        if (e.shadowRoot) { const f = walkShadow(e.shadowRoot); if (f) return f; }
      }
      return null;
    }
    return walkShadow(doc.body);
  }

  function findInputBox() {
    let box = findInputBoxInDoc(document);
    if (box) return box;
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const iDoc = iframe.contentDocument || iframe.contentWindow.document;
        box = findInputBoxInDoc(iDoc) || iDoc.querySelector('textarea') || iDoc.querySelector('input[type="text"]');
        if (box) return box;
      } catch (e) { /* cross-origin */ }
    }
    return null;
  }

  async function pasteOnly(text) {
    let box = null;
    for (let i = 0; i < 5; i++) { box = findInputBox(); if (box) break; await sleep(400); }
    if (!box) throw new Error('لم يُعثر على مربع الكتابة');
    box.focus(); box.click(); await sleep(300);

    const isTextarea = box.tagName === 'TEXTAREA' || box.tagName === 'INPUT';

    if (isTextarea) {
      const lines = text.split('\n');
      const currentVal = box.value || '';
      const newVal = currentVal ? currentVal + '\n' + text : text;
      box.value = newVal;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
          const typed = document.execCommand('insertText', false, line);
          if (!typed) {
            const dt = new DataTransfer(); dt.setData('text/plain', line);
            box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          }
          await sleep(80);
        }
        if (i < lines.length - 1) {
          box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
          box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
          await sleep(80);
        }
      }
    }
    await sleep(300);
  }

  async function sendMessage(text) {
    if (!isMessagingSite) { await pasteOnly(text); return; }
    let box = null;
    for (let i = 0; i < 5; i++) { box = findInputBox(); if (box) break; await sleep(400); }
    if (!box) throw new Error('لم يُعثر على مربع الكتابة');
    box.focus(); box.click(); await sleep(300);

    // كتابة النص سطر سطر مع fallback للـ ClipboardEvent
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0) {
        const typed = document.execCommand('insertText', false, line);
        if (!typed) {
          const dt = new DataTransfer(); dt.setData('text/plain', line);
          box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }
        await sleep(80);
      }
      if (i < lines.length - 1) {
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
        box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
        await sleep(80);
      }
    }
    await sleep(400);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await sleep(300);

    for (const s of ['[aria-label="Send"]', '[aria-label="إرسال"]', '[aria-label="Press Enter to send"]', 'button[type="submit"]']) {
      const btn = document.querySelector(s);
      if (btn) { (btn.closest('[role="button"]') || btn.closest('button') || btn).click(); break; }
    }
    await sleep(900);
  }

  // ══════════════════════════════════════════════════════════════════
  //  إرسال خدمة واحدة (مع فصل الأرقام إذا فيها أكتر من بند)
  // ══════════════════════════════════════════════════════════════════
  async function sendService(svcIndex) {
    if (isRunning) return;
    const svc = SERVICES[svcIndex];
    isRunning = true;
    svcBtns.forEach(b => b.classList.add('disabled'));
    instrBtn.disabled = true;
    stopBtn.removeAttribute('disabled');
    setStatus(`⏳ جاري إرسال: ${svc.label}...`, 'warn');

    try {
      await sendMessage(svc.text);
      addSent(1, svc.label);
      setStatus(`✅ تم إرسال: ${svc.label}`, 'ok');
    } catch (e) {
      addErr(1, svc.label, e.message);
      setStatus(`❌ خطأ: ${e.message}`, 'error');
    }

    isRunning = false;
    svcBtns.forEach(b => b.classList.remove('disabled'));
    instrBtn.disabled = false;
    stopBtn.setAttribute('disabled', 'disabled');
  }

  // ══════════════════════════════════════════════════════════════════
  //  إرسال CSV
  // ══════════════════════════════════════════════════════════════════
  async function runSend() {
    isRunning = true; stopReq = false;
    startBtn.disabled = true; like10Btn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
    stopBtn.removeAttribute('disabled');
    progressW.style.display = 'block'; sentLog.textContent = ''; errLog.textContent = '';
    sentBadge.textContent = '0'; errBadge.textContent = '0';
    const total = msgLines.length; let sent = 0, errs = 0;

    for (let i = 0; i < total; i++) {
      if (stopReq) break;
      const num = i + 1; const text = msgLines[i];
      counterEl.textContent = `${num} / ${total}`; progressB.style.width = `${(num / total) * 100}%`;
      setStatus(`⏳ جاري إرسال رسالة ${num}...`, 'warn');
      try { await sendMessage(text); addSent(num, text); sent++; }
      catch (e) { addErr(num, text, e.message); errs++; }
      if (i < total - 1 && !stopReq) await sleep(parseInt(delaySlider.value, 10));
    }
    isRunning = false; startBtn.removeAttribute('disabled'); like10Btn.removeAttribute('disabled'); instrBtn.disabled = false; svcBtns.forEach(b => b.classList.remove('disabled'));
    stopBtn.setAttribute('disabled', 'disabled');
    if (stopReq) setStatus(`⚠️ تم الإيقاف — أُرسل: ${sent} | أخطاء: ${errs}`, 'warn');
    else if (errs > 0) setStatus(`اكتمل — ✔ ${sent} | ❌ ${errs} خطأ`, 'warn');
    else setStatus(`✅ اكتمل (${sent})`, 'ok');
  }

  async function runSend10Likes() {
    if (isRunning) return;
    isRunning = true; stopReq = false;
    startBtn.disabled = true; like10Btn.disabled = true; instrBtn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
    stopBtn.removeAttribute('disabled');
    setStatus('⏳ جاري إرسال 10 لايكات...', 'warn');
    let successCount = 0;
    const likeSelectors = ['[aria-label="Like"]', '[aria-label="إعجاب"]', '[aria-label="Send a Like"]', '[aria-label="إرسال إعجاب"]'];

    for (let i = 0; i < 10; i++) {
      if (stopReq) break;
      let sent = false;
      let btn = null;
      for (const s of likeSelectors) { btn = document.querySelector(s); if (btn) break; }
      if (btn) { (btn.closest('[role="button"]') || btn.closest('button') || btn).click(); sent = true; }
      else { try { await sendMessage("👍"); sent = true; } catch (e) { /* skip */ } }
      if (sent) successCount++;
      setStatus(`⏳ (${successCount} / 10)...`, 'warn');
      await sleep(800);
    }
    isRunning = false; startBtn.removeAttribute('disabled'); like10Btn.removeAttribute('disabled'); instrBtn.disabled = false; svcBtns.forEach(b => b.classList.remove('disabled'));
    stopBtn.setAttribute('disabled', 'disabled');
    if (successCount === 10) setStatus('✅ تم 10 لايكات', 'ok');
    else setStatus(`⚠️ ${successCount} لايكات من 10`, 'warn');
  }

  // ══════════════════════════════════════════════════════════════════
  //  مستمعات الأحداث
  // ══════════════════════════════════════════════════════════════════
  fab.addEventListener('click', () => {
    if (fabMoved) return;
    panel.classList.toggle('visible');
    fab.classList.toggle('hidden', panel.classList.contains('visible'));
  });

  document.getElementById('msq-close').addEventListener('click', () => {
    panel.classList.remove('visible');
    fab.classList.remove('hidden');
  });

  delaySlider.addEventListener('input', () => delayLabel.textContent = (delaySlider.value / 1000).toFixed(1) + ' ث');

  pasteArea.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (!val) { msgLines = []; setStatus('جاهز', ''); return; }
    try {
      // لو النص فيه هيدرات عربية → استخدم CSV parser
      if (val.includes('رقم الطلب') || val.includes('اسم العميل')) {
        msgLines = parseCSV(val);
      } else {
        // تقسيم يحترم علامات التنصيص (خلية ممكن فيها \n داخلي)
        const lines = [];
        let cur = ''; let inQ = false;
        for (let i = 0; i < val.length; i++) {
          const c = val[i];
          if (c === '"') { inQ = !inQ; continue; }
          if ((c === '\n' || c === '\r') && !inQ) {
            if (c === '\r' && val[i + 1] === '\n') i++;
            if (cur.trim()) lines.push(cur);
            cur = '';
          } else cur += c;
        }
        if (cur.trim()) lines.push(cur);
        msgLines = lines.map(l => l.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim()).filter(Boolean);
      }
      if (msgLines.length === 0) setStatus('النص فارغ!', 'error');
      else setStatus(`📋 ${msgLines.length} رسالة`, '');
    } catch (err) { setStatus(`خطأ: ${err.message}`, 'error'); }
  });

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        msgLines = parseCSV(ev.target.result);
        if (msgLines.length === 0) setStatus('الملف فارغ!', 'error');
        else {
          dropZone.textContent = ''; dropZone.appendChild(document.createTextNode(`✅ ${file.name}`));
          pasteArea.value = '';
          const newInp = el('input', { type: 'file', accept: '.csv,.txt', style: 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;' });
          newInp.addEventListener('change', e => handleFile(e.target.files[0]));
          dropZone.appendChild(newInp); setStatus(`📋 ${msgLines.length} رسالة`, '');
        }
      } catch (err) { setStatus(`خطأ: ${err.message}`, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  }

  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  startBtn.addEventListener('click', () => { if (!isRunning && msgLines.length) runSend(); });
  like10Btn.addEventListener('click', () => { if (!isRunning) runSend10Likes(); });
  instrBtn.addEventListener('click', () => { if (!isRunning) sendService(8); });
  stopBtn.addEventListener('click', () => { stopReq = true; stopBtn.setAttribute('disabled', 'disabled'); });

  // ══════════════════════════════════════════════════════════════════
  //  سحب FAB
  // ══════════════════════════════════════════════════════════════════
  let fabDragging = false, fabMoved = false, fabStartX = 0, fabStartY = 0, fabOrigX = 0, fabOrigY = 0;
  fab.addEventListener('mousedown', e => {
    fabDragging = true; fabMoved = false;
    fabStartX = e.clientX; fabStartY = e.clientY;
    fabOrigX = fab.offsetLeft; fabOrigY = fab.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!fabDragging) return;
    const dx = e.clientX - fabStartX, dy = e.clientY - fabStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fabMoved = true;
    fab.style.left = (fabOrigX + dx) + 'px'; fab.style.top = (fabOrigY + dy) + 'px';
    fab.style.bottom = 'auto'; fab.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { fabDragging = false; });

  // ══════════════════════════════════════════════════════════════════
  //  سحب اللوحة
  // ══════════════════════════════════════════════════════════════════
  let dragX = 0, dragY = 0, dragging = false;
  h.addEventListener('mousedown', e => {
    if (e.target === document.getElementById('msq-close')) return;
    dragging = true; dragX = e.clientX - panel.offsetLeft; dragY = e.clientY - panel.offsetTop;
    panel.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dragX) + 'px'; panel.style.top = (e.clientY - dragY) + 'px';
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; panel.classList.remove('dragging'); });

})();
