// shared/tools-bridge.js — جسر الأدوات الذكية ↔ اللوج الذكي والتقارير
// يعمل في MAIN world (document_start) ويرسل عبر CustomEvents إلى الـ dock (isolated)
// الذي يعيد التوجيه للـ background:
//  - __eaToolsLog(event)        → ea-smart-log   → SMART_LOG_EVENT (slEvents/slErrors/...)
//  - __eaToolsReport(report)    → ea-save-report → SAVE_REPORT     (autoReports)
// يصدّر: window.__eaToolsLog , window.__eaToolsReport , window.__eaToolsBridge

(function (global) {
  'use strict';

  if (global.__eaToolsBridgeLoaded) return;
  global.__eaToolsBridgeLoaded = true;

  function emit(name, detail) {
    try { global.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  /**
   * تسجيل حدث في اللوج الذكي
   * @param {Object} evt - { eventType, kind, label, details, ... }
   */
  global.__eaToolsLog = function (evt = {}) {
    const entry = {
      eventType: evt.eventType || 'TOOL_EVENT',
      kind: evt.kind || 'info',
      label: evt.label || evt.eventType || 'أداة',
      field: evt.field || '',
      isAutomated: true,
      page: evt.page || (typeof location !== 'undefined' ? (location.pathname.split('/').pop() || '') : ''),
      url: typeof location !== 'undefined' ? location.href : '',
      timestamp: new Date().toISOString(),
      details: evt.details || {},
      ...evt
    };
    emit('ea-smart-log', entry);
    return entry;
  };

  /**
   * حفظ تقرير في سجل التقارير (autoReports)
   * @param {Object} report - { type, customer, summary, data, ... }
   */
  global.__eaToolsReport = function (report = {}) {
    const entry = {
      type: report.type || 'tool',
      source: report.source || 'elaraby-tools',
      savedAt: Date.now(),
      ...report
    };
    emit('ea-save-report', entry);
    return entry;
  };

  global.__eaToolsBridge = { log: global.__eaToolsLog, report: global.__eaToolsReport };

})(typeof globalThis !== 'undefined' ? globalThis : window);
