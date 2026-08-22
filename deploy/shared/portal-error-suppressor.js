// =========================================================
// portal-error-suppressor.js — Suppress repeated portal errors
// Injected in MAIN world at document-start
// =========================================================
(function () {
  'use strict';

  // Suppress: ldv_workordertype is not defined
  // This error repeats infinitely via setInterval on workorderreview pages
  const _suppressedErrors = new Set();
  const _originalError = console.error.bind(console);

  console.error = function (...args) {
    const msg = args.join(' ');
    if (msg.includes('ldv_workordertype is not defined')) {
      if (!_suppressedErrors.has('ldv_workordertype')) {
        _suppressedErrors.add('ldv_workordertype');
        _originalError('[Suppressed] Portal error: ldv_workordertype is not defined (repeating error suppressed)');
      }
      return;
    }
    _originalError.apply(console, args);
  };

  // Also suppress the Violation warning about unload
  const _originalWarn = console.warn.bind(console);
  console.warn = function (...args) {
    const msg = args.join(' ');
    if (msg.includes('unload is not allowed in this document')) {
      return;
    }
    _originalWarn.apply(console, args);
  };

  console.log('[ElAraby] Portal error suppressor loaded (MAIN world)');
})();