// ==UserScript==
// @name         📨 مساعد إرسال الماسنجر
// @namespace    https://github.com/local/messenger-sender
// @version      2.2.0
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
// @resource     svcData services.json
// @resource     tipsData tips.json
// @grant        GM_getResourceURL
// ==/UserScript==

(function () {
  'use strict';

  const isMessagingSite = /facebook\.com|messenger\.com|instagram\.com|whatsapp\.com/i.test(location.hostname);

  let SERVICES = [];
  let TIPS = [];

  // ══════════════════════════════════════════════════════════════════
  //  تحميل البيانات من ملفات JSON
  // ══════════════════════════════════════════════════════════════════
  async function loadData() {
    try {
      const svcUrl = GM_getResourceURL('svcData');
      const tipsUrl = GM_getResourceURL('tipsData');
      const [svcRes, tipsRes] = await Promise.all([
        fetch(svcUrl).then(r => r.json()),
        fetch(tipsUrl).then(r => r.json())
      ]);
      SERVICES = svcRes.services;
      TIPS = tipsRes.tips;
    } catch (e) {
      console.error('فشل تحميل البيانات:', e);
      SERVICES = [
        { id: 'svc-1', label: '-prem', text: 'تم عمل صيانه وتنظيف الوحده الداخليه والوحده الخارجيه وغسيل بمكنه الغسيل وتنظيف حوض الصرف // خدمة بريميوم كير Premium Care\nوتحصيل 450' },
        { id: 'svc-2', label: 'صيانة', text: 'تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف' },
        { id: 'svc-3', label: 'صيانة وشحن', text: 'تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون\nتم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف' },
        { id: 'svc-4', label: 'تعليمات توالف', text: 'يتم تصوير فيديو لجميع القطع عند وضعها في الكارتونة وتقفيل الكارتونة وارسال الفيديو علي صفحة المراجعة ..\n- يتم ارسال بيان بموقف التوالف سواء بوجود نواقص او بالتمام' },
        { id: 'svc-5', label: 'فوري', text: 'لو العميل دافع فوري بنصور الفاتورة وبنخصمها من التكلفة الاجمالية' },
        { id: 'svc-6', label: 'يحتاج كباس', text: 'يحتاج كباس وفلتر وريلاي واوفرلود' },
        { id: 'svc-7', label: 'تغيير كباس', text: 'تم تغيير كباس وفلتر\nوتم تنظيف الدائرة وعمل فاكيوم وشحن فريون\nوريلاي واوفرلود' },
        { id: 'svc-8', label: 'صرف وجوان', text: 'وتنظيف الصرف وضبط الجوانات' }
      ];
      TIPS = [
        'لا يوجد تحصلات الا طلبات الصيانه الدورية للتكييف .. بتكلفة 450 لأول جهاز .. واللي بعد كده بـ 300 ////// لو الاجهزة حاجه الضمان كل الاجهزرة علي 450',
        'في حالة شحن التكييف يتم ارفاق صورة العداد بجانب بنسه الأمبير و توضيح القرائتين بجانب السيريال قبل و بعد العمليه فى صوره واحده و ليس صورتين منفصلين مع تصوير توصيله طلمبه الفاكيوم بالجهاز بعد أكتمال الفاكيوم',
        'البلاغات التركيب يتم تصوير الفاكيوم ويتم ملئ الضمان والفاتورة وارفاقهم وكتابة تاريخ الإنتاج علي الضمان',
        'القطع الغالية يتم فتحها بعناااية ويتم تصوير فيديو لفتح الكرتونة',
        'في حال لو السريال ممسوح او القطعة الخارجية بعيدة .. يتم تصوير مكان السريال وهو ممسوح او القطعه وهي بعيده',
        'يجب إرفاق صورة الضمان ويكون مكتوب فيه رقم التليفون هام جدا',
        'يجب تصوير الفاتورة ان وجدت.. خاصة لو مبرد هواء او مياة بتم اعتماد الضمان منها مطلوبة بشدة',
        'صورة أو فيديو يوضح حالة الجهاز عامة خاصة اذا كان هناك سوء استخدام او نمل او صراصير',
        'يتم ذكر سبب التحصيل في حال كان الجهاز داخل الضمان',
        'نبدا ببلاغات التركيب الاول — بعد الساعه 6 لازم نكلم العميل كل ساعتين في حال اتاخرنا عن كده',
        'في حال أي شئ له علاقة بالاستبدال او العميل يرفض الصيانة ويريد الاستبدال يتم تصوير فيديو بمواصفات كل منتج مع تصوير الضمان والفاتورة — الفاتورة لازم سجل تجاري وبطاقة ضريبية وعليها عنوان ورقم التاجر',
        'فاتورة العربي عند التركيب يتم التأكد ان الموديلات الموجود عند العميل هي اللي في الفاتورة ويتم كتابة السرايل الداخلية والخارجية والتاريخ ورقم البلاغ علي الفاتورة — في حالة عدم وضوح الفاتورة يتم تصوير الفاتورة علي 3 أجزاء',
        'استقبال — مواعيد العمل: التزم بمواعيد وأيام العمل الرسمية للمركز. التأخير أو الغياب غير المبرر = إنذار ثم 300 ثم 600 جنيه',
        'استقبال — المظهر والزي: التزم بالزي الموحد ومهمات الوقاية داخل المركز وأمام العميل — المظهر غير اللائق = إنذار ثم 150 ثم 200 جنيه',
        'استقبال — تخزين واستقبال: راعِ تخزين الأجهزة والتوالف بشكل سليم — سوء التخزين أو الاستقبال = إنذار + قيمة القطعة ثم 150+ ثم 200+ جنيه',
        'زيارات — معدات أساسية: تأكد من توافر كل معدات الصيانة قبل الزيارة. استخدام أدوات العميل = إنذار ثم 250 ثم 350 جنيه',
        'زيارات — سلوك الزيارة: لا تتحدث في الهاتف أثناء الزيارة إلا مع الدعم الفني/الإدارة/العميل، ونظّف الجهاز والمكان بعد الصيانة — المخالفة = 100 ثم 200 ثم 300 جنيه',
        'زيارات — مواعيد والتنسيق: التزم بمواعيد الاتصال والتنسيق مع العملاء — المخالفة = 100 ثم 200 ثم 300 جنيه',
        'زيارات — لائحة الأسعار: التزم باللائحة المالية المعتمدة لأسعار القطع والمصنعية. أي زيادة على العميل = رد الفرق + خصم نفس القيمة',
        'زيارات — كشف أجهزة أخرى: لا ترفض الكشف على جهاز آخر للعميل وتسجيل بلاغ له إلا بتوجيه رسمي — الرفض = إنذار ثم 150 ثم 300 جنيه',
        'زيارات — نموذج المعاينة: املأ نموذج المعاينة على البرنامج بشكل صحيح وكامل في نفس الزيارة — بيانات ناقصة/خاطئة = 100 ثم 200 ثم 300 جنيه',
        'زيارات — توالف خارج الضمان: سلّم التالف للعميل فوراً في بلاغات خارج الضمان، ولا تحتفظ بتوالف بالمركز — المخالفة = 200 ثم 300 ثم 500 جنيه',
        'سلوك — أسلوب لائق: تعامل مع العميل بأسلوب محترم دائماً. لا تأخذ إكراميات، لا تدخن في الزيارة، لا تهزأ بالعميل — المخالفة = 250 ثم 500 ثم 750 جنيه + إيقاف',
        'سلوك — بلاغات وهمية: لا تسجل بلاغات وهمية للربح أو زيادة الإنتاجية — المخالفة = رد القطع + ضعف قيمة الزيارة ثم إيقاف وفسخ تعاقد',
        'سلوك — بلاغ أرضي: افتح بلاغاً أرضياً للعميل دائماً عند الإصلاح، حتى لو كان تحت الضمان — عدم الفتح = 250 ثم 500 ثم 750 جنيه + إيقاف',
        'سلوك — لا تنتقص الشركة: لا تتحدث بسوء عن الشركة أو منتجاتها أو وكلائها — المخالفة = 250 ثم 500 ثم 1000 جنيه',
        'سلوك — تواصل خارج النظام: لا تعطِ رقمك أو رقم المركز للعميل، ولا تأخذ أرقام العملاء — المخالفة = 250 ثم 500 ثم 750 جنيه + إيقاف',
        'سلوك — قطع غير أصلية: لا تركب أو تسجل قطعاً غير أصلية/غير تابعة للعربي/مستعملة — المخالفة = ضعف القطعة + 750 ثم 1000 جنيه + إيقاف وفسخ',
        'سلوك — تغيير حالة الضمان: لا تغيّر حالة الضمان (داخل/خارج) عمداً — المخالفة = ضعف القطعة + 500 ثم 1000 جنيه + إيقاف',
        'سلوك — زيارات غير مسجلة: لا تنفذ زيارات غير موجودة على صفحة المركز — المخالفة = 500 + إنذار ثم إيقاف وفسخ',
        'سلوك — فني غير مسجل: لا تنفذ زيارات بفني غير مسجل على قوة المركز — المخالفة = 500 + إنذار ثم 1000 + إيقاف',
        'سلوك — صيانة خارجية: لا تعرض صيانة خارجية على العملاء — المخالفة = فصل الفني + قائمة سوداء، أو 1000 جنيه + إيقاف المركز',
        'سلوك — تسويق بالبيانات: لا تسوّق على الإنترنت ببيانات المركز كأنها صيانة رسمية للعربي — المخالفة = إيقاف وفسخ تعاقد فوري',
        'سلوك — إقناع بالتنازل: لا تتواصل مع العميل خارج النظام لإقناعه بالتنازل عن شكوى — المخالفة = 1000 جنيه + تحويل قانوني + فسخ',
        'سلوك — رفض المراجعة: لا ترفض المراجعة الميدانية أو أي إجراء منها — المخالفة = تحويل قانوني + إيقاف',
        'سلوك — تلاعب بالتالف: لا تتلاعب بالتالف المسلم لأمين المخزن — المخالفة = ضعف القطعة + عدم احتساب البلاغ ثم إيقاف',
        'سلوك — زي منافس: لا ترتدي زي شركة منافسة أثناء الزيارة أو في المركز — المخالفة = إنذار ثم 500 ثم 750 جنيه',
        'سلوك — منتجات غير تابعة: لا تصلح منتجات غير تابعة للعربي وأنت مركز حصري/مميز — المخالفة = تحويل قانوني + إيقاف فوري',
        'سلوك — مكالمات البريدج: لا تغلق بلاغات بدون زيارة حقيقية، ولا تتلاعب بمكالمات البريدج — المخالفة = 300 ثم 500 ثم 700 جنيه ثم تحويل قانوني',
        'سلوك — توالف غير أصلية: لا ترجع قطعاً غير أصلية في التوالف بقصد التحايل — المخالفة = قيمة القطعة + تحويل قانوني + إيقاف وفسخ',
        'تقفيل — تنسيق واتصال: حدّث البلاغ بالحالة الحقيقية المتفق عليها مع العميل — المخالفة = 50 ثم 100 جنيه لكل حالة',
        'تقفيل — إغلاق وهمي: لا تغلق بلاغاً والزيارة لم تتم فعلياً — المخالفة = 125 ثم 250 ثم 350 جنيه ثم تحويل قانوني',
        'تقفيل — حالة خاطئة: لا تسجل حالة بلاغ مخالفة للواقع — المخالفة = 25% ثم 50% ثم 100% من قيمة الزيارة. عشان كده ضروري ننقل كل اللي بيحصل اثناء الزيارة بالصور والفيديو والبيانات الصحيحة',
        'تقفيل — طلب قطع متكرر: لا تطلب نفس القطعة أكثر من مرة انتظار بعد التأكد من وصولها — المخالفة = 150 جنيه',
        'تقفيل — بيانات العميل: سجّل بيانات العميل صحيحة في البلاغات الأرضية — المخالفة = 100 جنيه',
        'تقفيل — بلاغ بورتال 24 ساعة: افتح بلاغ بورتال للجهاز خلال 24 ساعة — المخالفة = 200 جنيه + عدم احتساب الزيارة',
        'تقفيل — تحديث نفس اليوم: حدّث حالة البلاغ في نفس يوم الزيارة — المخالفة = 50 جنيه لكل حالة',
        'تقفيل — بيانات أمر شغل: راجع بيانات أمر الشغل والسيريال وقطع الغيار وأكواد الأعطال — بيانات خاطئة = 50 جنيه لكل حالة',
        'تقفيل — ترصيد التوالف: ورّص قطعة الغيار على البلاغ عند استخدامها، سلّم التالف — المخالفة = 40 جنيه لكل حالة',
        'تقفيل — مطابقة مخزون الساب: طابق كميات القطع على الأرض مع رصيد الساب — المخالفة = 15% من قيمة القطعة ثم تحويل لنقدي',
        'فني — اتبع التعليمات: التزم بنشرات الدعم الفني وإجراءات الإصلاح — المخالفة = 250 جنيه + قيمة التلفيات',
        'فني — شاشات أوبن سيل: ارفع صورة أعطال الأوبن سيل صحيحة — التلاعب = تكلفة الأوبن سيل على المركز + تحويل قانوني',
        'فني — توالف سليمة: لا ترجع قطع غيار سليمة في التوالف — المخالفة = قيمة القطعة + 15%',
        'فني — سحب خاطئ: لا تسحب جهازاً للورشة بتشخيص خاطئ — المخالفة = 300 ثم 500 جنيه',
        'فني — معايرة أجهزة: عاير أجهزة القياس في مواعيدها — عدم المعايرة = 300 جنيه/زيارة ثم إيقاف المركز',
        'فني — قطع داخل الضمان: لا تغيّر قطعة تحت الضمان وهي تالفة بسوء استخدام من العميل — المخالفة = قيمة القطعة + قيمة البلاغ',
        'عام — تعليمات التشغيل: التزم بتعليمات التشغيل والإجراءات الموثقة — المخالفة = 250 ثم 350 ثم 500 جنيه',
        'عام — استبدال غير مطابق: في إعادة بيع الجهاز يتحمل المركز فرق الدرجة + تغليف + نقل + عمالة',
        'عام — تكرار المخالفة: تكرار المخالفة بعد الحد الأقصى = إيقاف عن عمل + تحقيق + فصل/فسخ تعاقد',
        'عام — دورية المخالفة: تنتهي المخالفة بعد 6 أشهر من تاريخ توقيع الجزاء ما عدا التحايل',
        'عام — تكييف المخالفات: أي مخالفة غير منصوص عليها تُكيّف لأقرب بند في اللائحة'
      ];
    }
    initUI();
  }

  // ══════════════════════════════════════════════════════════════════
  //  بناء الواجهة
  // ══════════════════════════════════════════════════════════════════
  function initUI() {
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
      .msq-btn-split { background: #00a693 !important; color: #fff !important; }
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

    const fab = el('button', { id: 'msq-fab', title: 'فتح مساعد الإرسال', textContent: '📨' });
    const h = el('div', { id: 'msq-header' }, [
      el('span', { id: 'msq-title', textContent: 'مساعد الإرسال' }),
      el('button', { id: 'msq-close', title: 'إغلاق', textContent: '✕' })
    ]);

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

    const sep1 = el('hr', { className: 'msq-sep' });
    const fileInput = el('input', { type: 'file', id: 'msq-file', accept: '.csv,.txt' });
    const dropZone = el('div', { id: 'msq-drop', textContent: '📁 اسحب ملف CSV هنا أو اضغط' }, [fileInput]);
    const pasteArea = el('textarea', { id: 'msq-paste', placeholder: 'أو الصق البيانات هنا...' });

    const delaySlider = el('input', { type: 'range', id: 'msq-delay', min: '1000', max: '10000', step: '500', value: '2500' });
    const delayLabel = el('span', { className: 'msq-val', id: 'msq-delay-label', textContent: '2.5 ث' });
    const delayRow = el('div', { className: 'msq-row' }, [el('label', { textContent: '⏱:' }), delaySlider, delayLabel]);

    const startBtn = el('button', { className: 'msq-btn msq-btn-start', id: 'msq-start', textContent: '▶ إرسال' });
    const splitBtn = el('button', { className: 'msq-btn msq-btn-split', id: 'msq-split', textContent: '🎲 تعليمة' });
    const like10Btn = el('button', { className: 'msq-btn msq-btn-like', id: 'msq-like-10', textContent: '👍 10' });
    const stopBtn = el('button', { className: 'msq-btn msq-btn-stop', id: 'msq-stop', disabled: 'disabled', textContent: '⛔ إيقاف' });
    const btns = el('div', { className: 'msq-btns' }, [startBtn, splitBtn, like10Btn, stopBtn]);

    const instrBtn = el('button', { className: 'msq-btn msq-btn-instr', id: 'msq-send-instr', textContent: '📋 إرسال كل النصائح' });
    const instrRow = el('div', { className: 'msq-btns', style: 'margin-top: 4px;' }, [instrBtn]);

    const statusEl = el('div', { id: 'msq-status', textContent: 'جاهز' });
    const progressB = el('div', { id: 'msq-progress-bar' });
    const progressW = el('div', { id: 'msq-progress-wrap' }, [progressB]);
    const counterEl = el('div', { id: 'msq-counter' });

    const sentLog = el('div', { className: 'msq-log-box', id: 'msq-sent-log' }, [el('div', { className: 'msq-empty', textContent: 'لا رسائل مرسلة' })]);
    const errLog = el('div', { className: 'msq-log-box', id: 'msq-err-log' }, [el('div', { className: 'msq-empty', textContent: 'لا أخطاء' })]);
    const sentBadge = el('span', { className: 'msq-badge', id: 'msq-sent-badge', textContent: '0' });
    const errBadge = el('span', { className: 'msq-badge', id: 'msq-err-badge', textContent: '0' });
    const sentSection = el('div', {}, [el('div', { className: 'msq-log-header', style: 'color:#2bd46f;' }, ['✓ رسائل مرسلة ', sentBadge]), sentLog]);
    const errSection = el('div', {}, [el('div', { className: 'msq-log-header', style: 'color:#ff6b6b;' }, ['❌ أخطاء ', errBadge]), errLog]);

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

    function findInputBoxInDoc(doc) {
      for (const s of ['div[aria-label="Message"]', 'div[aria-label="رسالة"]', 'div[aria-label="Aa"]', 'div[aria-label="Type a message"]', 'div[aria-label="اكتب رسالة"]', 'div[role="textbox"]']) {
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
      box.focus(); box.click(); await sleep(400);

      let textInserted = false;
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(600);
        textInserted = (box.textContent || box.innerText || '').trim().length > 0;
      } catch (e) { /* fallback below */ }

      if (!textInserted) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.length > 0) {
            document.execCommand('insertText', false, line);
            await sleep(80);
          }
          if (i < lines.length - 1) {
            box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
            box.dispatchEvent(new InputEvent('input', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
            box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
            await sleep(80);
          }
        }
        await sleep(400);
      }

      let sendBtn = null;
      for (let attempt = 0; attempt < 4 && !sendBtn; attempt++) {
        for (const s of ['[aria-label="Send"]', '[aria-label="إرسال"]', '[aria-label="Press Enter to send"]', 'button[type="submit"]', '[data-testid="send"]', '[role="button"][aria-label="Send"]', '[role="button"][aria-label="إرسال"]']) {
          sendBtn = document.querySelector(s);
          if (sendBtn) break;
        }
        if (!sendBtn) await sleep(400);
      }
      if (sendBtn) {
        (sendBtn.closest('[role="button"]') || sendBtn.closest('button') || sendBtn).click();
      } else {
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
      await sleep(900);
    }

    async function sendService(svcIndex) {
      if (isRunning) return;
      const svc = SERVICES[svcIndex];
      isRunning = true;
      startBtn.disabled = true; splitBtn.disabled = true;
      svcBtns.forEach(b => b.classList.add('disabled'));
      instrBtn.disabled = true; stopBtn.removeAttribute('disabled');
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
      startBtn.removeAttribute('disabled'); splitBtn.removeAttribute('disabled');
      svcBtns.forEach(b => b.classList.remove('disabled'));
      instrBtn.disabled = false; stopBtn.setAttribute('disabled', 'disabled');
    }

    async function runSend() {
      isRunning = true; stopReq = false;
      startBtn.disabled = true; splitBtn.disabled = true; like10Btn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
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
      isRunning = false; startBtn.removeAttribute('disabled'); splitBtn.removeAttribute('disabled'); like10Btn.removeAttribute('disabled'); instrBtn.disabled = false; svcBtns.forEach(b => b.classList.remove('disabled'));
      stopBtn.setAttribute('disabled', 'disabled');
      if (stopReq) setStatus(`⚠️ تم الإيقاف — أُرسل: ${sent} | أخطاء: ${errs}`, 'warn');
      else if (errs > 0) setStatus(`اكتمل — ✔ ${sent} | ❌ ${errs} خطأ`, 'warn');
      else setStatus(`✅ اكتمل (${sent})`, 'ok');
    }

    async function runSendOneRandom() {
      if (isRunning) return;
      if (TIPS.length === 0) { setStatus('النصائح فارغة!', 'error'); return; }
      const line = 'ℹ️ معلومة مهمة:\n' + TIPS[Math.floor(Math.random() * TIPS.length)];
      isRunning = true;
      startBtn.disabled = true; splitBtn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
      instrBtn.disabled = true; stopBtn.removeAttribute('disabled');
      setStatus(`⏳ إرسال تعليمة عشوائية...`, 'warn');
      try {
        await sendMessage(line);
        addSent(1, line.substring(0, 50));
        setStatus(`✅ تم: ${line.substring(0, 60)}`, 'ok');
      } catch (e) {
        addErr(1, line.substring(0, 50), e.message);
        setStatus(`❌ ${e.message}`, 'error');
      }
      isRunning = false;
      startBtn.removeAttribute('disabled'); splitBtn.removeAttribute('disabled'); svcBtns.forEach(b => b.classList.remove('disabled'));
      instrBtn.disabled = false; stopBtn.setAttribute('disabled', 'disabled');
    }

    async function sendAllTips() {
      if (isRunning) return;
      if (TIPS.length === 0) { setStatus('النصائح فارغة!', 'error'); return; }
      isRunning = true; stopReq = false;
      startBtn.disabled = true; splitBtn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
      instrBtn.disabled = true; stopBtn.removeAttribute('disabled');
      progressW.style.display = 'block'; sentLog.textContent = ''; errLog.textContent = '';
      sentBadge.textContent = '0'; errBadge.textContent = '0';
      const total = TIPS.length; let sent = 0, errs = 0;
      for (let i = 0; i < total; i++) {
        if (stopReq) break;
        const num = i + 1; const text = 'ℹ️ معلومة مهمة:\n' + TIPS[i];
        counterEl.textContent = `${num} / ${total}`; progressB.style.width = `${(num / total) * 100}%`;
        setStatus(`⏳ جاري إرسال النصيحة ${num}...`, 'warn');
        try { await sendMessage(text); addSent(num, TIPS[i].substring(0, 50)); sent++; }
        catch (e) { addErr(num, TIPS[i].substring(0, 50), e.message); errs++; }
        if (i < total - 1 && !stopReq) await sleep(parseInt(delaySlider.value, 10));
      }
      isRunning = false;
      startBtn.removeAttribute('disabled'); splitBtn.removeAttribute('disabled'); svcBtns.forEach(b => b.classList.remove('disabled'));
      instrBtn.disabled = false; stopBtn.setAttribute('disabled', 'disabled');
      progressW.style.display = 'none';
      if (stopReq) setStatus(`⚠️ تم الإيقاف — أُرسل: ${sent} | أخطاء: ${errs}`, 'warn');
      else if (errs > 0) setStatus(`اكتمل — ✔ ${sent} | ❌ ${errs} خطأ`, 'warn');
      else setStatus(`✅ تم إرسال ${sent} نصيحة`, 'ok');
    }

    async function runSend10Likes() {
      if (isRunning) return;
      isRunning = true; stopReq = false;
      startBtn.disabled = true; splitBtn.disabled = true; like10Btn.disabled = true; instrBtn.disabled = true; svcBtns.forEach(b => b.classList.add('disabled'));
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
      isRunning = false; startBtn.removeAttribute('disabled'); splitBtn.removeAttribute('disabled'); like10Btn.removeAttribute('disabled'); instrBtn.disabled = false; svcBtns.forEach(b => b.classList.remove('disabled'));
      stopBtn.setAttribute('disabled', 'disabled');
      if (successCount === 10) setStatus('✅ تم 10 لايكات', 'ok');
      else setStatus(`⚠️ ${successCount} لايكات من 10`, 'warn');
    }

    // مستمعات الأحداث
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
        if (val.includes('رقم الطلب') || val.includes('اسم العميل')) {
          msgLines = parseCSV(val);
        } else {
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
    splitBtn.addEventListener('click', () => { if (!isRunning) runSendOneRandom(); });
    like10Btn.addEventListener('click', () => { if (!isRunning) runSend10Likes(); });
    instrBtn.addEventListener('click', () => { if (!isRunning) sendAllTips(); });
    stopBtn.addEventListener('click', () => { stopReq = true; stopBtn.setAttribute('disabled', 'disabled'); });

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
  }

  loadData();
})();
