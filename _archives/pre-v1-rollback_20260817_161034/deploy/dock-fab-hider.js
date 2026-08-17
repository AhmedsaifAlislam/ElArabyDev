// dock-fab-hider.js — منع "وميض" الفابز: تخفي كل الفابز المعروفة فور تحميل الصفحة
// قبل إنشائها أصلاً، ثم unified-dock.js يُظهر المفعّل منها فقط (display: flex !important).
// يُحمّل عند document_start في عالم معزول — لا يلمس أي منطق للسكربتات نفسها.
(function () {
  'use strict';
  try {
    var FAB_IDS = [
      'elaraby-ba-fab',
      'elaraby-control-panel-mini',
      'msq-fab',
      'elaraby-ai-fab',
      'elaraby-agent-fab',
      'elaraby-duplicate-radar-fab',
      'elaraby-digest-fab',
      'elaraby-command-fab',
      'rp-fab',
      'elaraby-mini-btn',
      'elaraby-fixed-box',
      'elaraby-ai-voice-fab'
    ];
    var style = document.createElement('style');
    style.id = 'ea-fab-hider';
    style.textContent = FAB_IDS.map(function (id) {
      return '#' + id + '{display:none !important;visibility:hidden !important;}';
    }).join('');
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* لا شيء يمنع تشغيل باقي الإضافة */ }
})();
