/**
 * storage-proxy.js — الوسيط بين content ↔ background
 * Shared across all El Araby extensions
 *
 * الحل الجذري: Persistent Port Connection
 * يفتح Port دائمة للـ Background -> يبقي Service Worker حي طول ما Content Script شغال
 * يحل مشكلة Edge Tracking Prevention + Service Worker Sleep + Callback Timing
 *
 * Fix 1: إصلاح protocol mismatch — storageSet يُغلّف في {data}، storageRemove في {keys}
 * Fix 3: iframe يستعير دوال window.top بدل فتح port جديد
 */

(async function() {
  'use strict';

  if (window.__elarabyStorageProxyLoaded) return;

  // Fix 3: في iframe — لا نفتح port جديد، نستعير الدوال من window.top إن أمكن
  if (window !== window.top) {
    try {
      const topWin = window.top;
      if (typeof topWin.storageGet === 'function') {
        window.storageGet    = topWin.storageGet.bind(topWin);
        window.storageSet    = topWin.storageSet.bind(topWin);
        window.storageRemove = topWin.storageRemove.bind(topWin);
        window.bg            = topWin.bg ? topWin.bg.bind(topWin) : undefined;
        window.__elarabyStorageProxyLoaded = true;
        console.log('[StorageProxy] iframe — reusing parent port functions');
        return;
      }
    } catch (_) {
      // cross-origin iframe — نكمل بفتح port خاص بها
    }
  }

  window.__elarabyStorageProxyLoaded = true;

  let bgPort = null;
  let requestId = 0;
  const pendingRequests = new Map();

  /**
   * يفتح Port للـ Background ويحافظ عليه مفتوح
   */
  function connectToBackground() {
    if (bgPort) return bgPort;

    try {
      bgPort = chrome.runtime.connect({ name: 'storage-proxy' });

      bgPort.onMessage.addListener((msg) => {
        const { requestId: id, ...response } = msg;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          pending.resolve(response);
        }
      });

      bgPort.onDisconnect.addListener(() => {
        console.warn('[StorageProxy] Port disconnected, reconnecting...');
        bgPort = null;
        pendingRequests.forEach((pending) => pending.reject(new Error('Port disconnected')));
        pendingRequests.clear();
        // Reconnect after short delay
        setTimeout(connectToBackground, 1000);
      });

      console.log('[StorageProxy] \u2705 Port connected to background');
    } catch (e) {
      console.error('[StorageProxy] Failed to connect port:', e);
    }

    return bgPort;
  }

  function ensurePort() {
    if (!bgPort || bgPort.error) {
      connectToBackground();
    }
    return bgPort;
  }

  function sendRequest(type, payload) {
    const port = ensurePort();
    if (!port) {
      return Promise.reject(new Error('No background port'));
    }

    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      port.postMessage({ type, payload, requestId: id });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  /**
   * استرجاع بيانات من chrome.storage.local عبر background.js
   * payload = { keys: [...] }  →  background: chrome.storage.local.get(payload.keys)
   */
  window.storageGet = async function(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try { return await chrome.storage.local.get(keys); } catch(_) {}
    }
    const keyArray = Array.isArray(keys) ? keys : (typeof keys === 'object' && keys !== null ? keys : [keys]);
    try {
      const res = await sendRequest('STORAGE_GET', { keys: keyArray });
      return res?.data || {};
    } catch (e) {
      return {};
    }
  };

  window.storageSet = async function(data) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.set(data);
        return { ok: true };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    }
    try {
      const res = await sendRequest('STORAGE_SET', { data });
      return res || { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  window.storageRemove = async function(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.remove(keys);
        return { ok: true };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    }
    try {
      const res = await sendRequest('STORAGE_REMOVE', { keys });
      return res || { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  window.bg = function(action, extra) {
    return sendRequest(action, extra || {}).catch(e => {
      console.warn('[StorageProxy] bg error:', e.message);
      return null;
    });
  };

  // Connect immediately on load
  connectToBackground();
  console.log('[StorageProxy] \u2705 Port-based proxy loaded - Service Worker stays alive!');

})();