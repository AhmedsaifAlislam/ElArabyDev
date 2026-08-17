/**
 * Message Bus — Unified communication between content scripts, popup, background
 * Plain-JS port of shared/message-bus.ts for the unified-extension (no build step).
 *
 * IMPORTANT (double-load guard):
 * Both content-script.js and order-extractor.js are injected on the SAME portal domain
 * but from SEPARATE manifest entries, so this file may be evaluated twice in the same
 * isolated world. We keep a single bus on self.__MessageDispatcher and no-op on reload.
 * Only ONE root chrome.runtime.onMessage listener is ever attached.
 *
 * The bus dispatches by message.action. Handlers receive the full message object
 * ({ action, ...fields }) to stay compatible with popup.js which sends flat fields.
 * Handlers MUST respond via the provided sendResponse callback — the bus keeps the
 * channel open (returns true) until the callback is invoked.
 */

(function (global) {
  'use strict';

  if (global.__MessageDispatcher) return;

  class MessageBus {
    constructor() {
      this.handlers = new Map();
      this.fallbackHandler = null;
      this.fallbackActions = [];
      this._init();
    }

    _run(handler, message, sendResponse) {
      try {
        handler(message, (response) => {
          try { sendResponse(response); } catch (e) { /* channel already closed */ }
        });
      } catch (err) {
        try {
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
        } catch (e) { /* ignore */ }
      }
      // Always keep channel open: handlers call sendResponse asynchronously (await).
      return true;
    }

    _init() {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || !message.action) return false;

        const handler = this.handlers.get(message.action);
        if (handler) return this._run(handler, message, sendResponse);

        // Fallback: only claim actions listed in fallbackActions (never steal others')
        if (this.fallbackHandler && this.fallbackActions.indexOf(message.action) !== -1) {
          return this._run(this.fallbackHandler, message, sendResponse);
        }
        return false; // not our action -> do not claim, allow other listeners
      });

      // Long-lived port (popup <-> content)
      if (chrome.runtime.onConnect) {
        chrome.runtime.onConnect.addListener((port) => {
          port.onMessage.addListener((message) => {
            if (!message || !message.action) return;
            const handler = this.handlers.get(message.action);
            if (handler) {
              handler(message, (resp) => {
                try { port.postMessage({ ...resp, requestId: message.requestId }); } catch (e) {}
              });
              return;
            }
            if (this.fallbackHandler && this.fallbackActions.indexOf(message.action) !== -1) {
              this.fallbackHandler(message, (resp) => {
                try { port.postMessage({ ...resp, requestId: message.requestId }); } catch (e) {}
              });
            }
          });
        });
      }
    }

    /**
     * Register a handler for a single action.
     * @returns unsubscribe function
     */
    on(action, handler) {
      this.handlers.set(action, handler);
      return () => this.handlers.delete(action);
    }

    /**
     * Register a fallback for a guarded list of actions (never steals unknown ones).
     * @returns unsubscribe function
     */
    fallback(actionList, handler) {
      this.fallbackActions = Array.isArray(actionList) ? actionList.slice() : [];
      this.fallbackHandler = handler;
      return () => { this.fallbackHandler = null; this.fallbackActions = []; };
    }

    /** Action ownership check — true if a handler (or [failed] fallback) owns it. */
    owns(action) {
      return this.handlers.has(action);
    }
  }

  const instance = new MessageBus();

  // Attach to the shared global so re-evaluation is a no-op and both content scripts see it.
  global.__MessageDispatcher = instance;
  global.messageBus = instance;
})(typeof self !== 'undefined' ? self : this);