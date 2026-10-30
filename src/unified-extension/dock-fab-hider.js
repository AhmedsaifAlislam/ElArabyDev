// dock-fab-hider.js — منع "وميض" الفابز: تخفي الفابز المعروفة فور تحميل الصفحة
// قبل إنشائها أصلاً، ثم fabs-controller.js يُظهر المفعّل منها فقط (display: flex !important).
// يُحمّل عند document_start في عالم معزول — لا يلمس أي منطق للسكربتات نفسها.
(function () {
  'use strict';
  try {
    // الفابز التي يتحكم بها fabs-controller فقط (السكربتات الداخلية)
    var FAB_IDS = [
      'elaraby-control-panel-mini',
      'elaraby-ai-fab',
      'elaraby-unified-host',
      'elaraby-ai-voice-fab'
    ];
    var style = document.createElement('style');
    style.id = 'ea-fab-hider';
    // display:none فقط — بدون visibility:hidden للسماح بالانتقالات السلسة
    style.textContent = FAB_IDS.map(function (id) {
      return '#' + id + '{display:none !important;}';
    }).join('');
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* لا شيء يمنع تشغيل باقي الإضافة */ }
})();
