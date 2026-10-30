/**
 * Storage Service — Unified wrapper for window.storageGet/Set/Remove
 * Works in content scripts, popup, dashboard, background
 */

// Type definitions
export interface StorageGetResult<T = any> {
  [key: string]: T;
}

export interface StorageProxy {
  storageGet: <T = any>(keys: string | string[]) => Promise<StorageGetResult<T>>;
  storageSet: (data: Record<string, any>) => Promise<void>;
  storageRemove: (keys: string | string[]) => Promise<void>;
  bg: <T = any>(action: string, extra?: Record<string, any>) => Promise<T>;
}

// Global storage proxy (injected by storage-proxy.js)
declare global {
  interface Window {
    storageGet: <T = any>(keys: string | string[]) => Promise<StorageGetResult<T>>;
    storageSet: (data: Record<string, any>) => Promise<void>;
    storageRemove: (keys: string | string[]) => Promise<void>;
    bg: <T = any>(action: string, extra?: Record<string, any>) => Promise<T>;
    SmartLog: {
      addEntry: (actionType: string, details: Record<string, any>) => Promise<void>;
      getEntries: (limit?: number) => Promise<any[]>;
      clearAll: () => Promise<void>;
    };
  }
}

/**
 * Check if storage proxy is available
 */
export function hasStorageProxy(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.storageGet === 'function' &&
    typeof window.storageSet === 'function';
}

/**
 * Get value(s) from storage
 * Uses storage-proxy in content scripts, falls back to chrome.storage in extension pages
 */
export async function storageGet<T = any>(keys: string | string[]): Promise<StorageGetResult<T>> {
  const keyArray = Array.isArray(keys) ? keys : [keys];

  if (hasStorageProxy()) {
    return window.storageGet(keyArray) as Promise<StorageGetResult<T>>;
  }

  // Fallback: direct chrome.storage (popup, dashboard, background)
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keyArray, (result) => resolve(result as StorageGetResult<T>));
    });
  }

  return {} as StorageGetResult<T>;
}

/**
 * Set value(s) in storage
 */
export async function storageSet(data: Record<string, any>): Promise<void> {
  if (hasStorageProxy()) {
    await window.storageSet(data);
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => chrome.storage.local.set(data, resolve));
  }
}

/**
 * Remove key(s) from storage
 */
export async function storageRemove(keys: string | string[]): Promise<void> {
  const keyArray = Array.isArray(keys) ? keys : [keys];

  if (hasStorageProxy()) {
    await window.storageRemove(keyArray);
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve) => chrome.storage.local.remove(keyArray, resolve));
  }
}

/**
 * Send message to background via storage-proxy's bg() or direct chrome.runtime
 */
export async function sendToBackground<T = any>(action: string, extra: Record<string, any> = {}): Promise<T> {
  if (typeof window !== 'undefined' && typeof window.bg === 'function') {
    return window.bg(action, extra) as Promise<T>;
  }

  // Direct chrome.runtime fallback
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action, ...extra }, (res) => resolve(res as T));
    } else {
      resolve(null as T);
    }
  });
}

/**
 * SmartLog helper — unified logging
 */
export const smartLog = {
  addEntry: async (actionType: string, details: Record<string, any> = {}) => {
    if (typeof window !== 'undefined' && window.SmartLog?.addEntry) {
      await window.SmartLog.addEntry(actionType, details);
    } else if (typeof window !== 'undefined' && window.logEvent) {
      await window.logEvent(actionType, details);
    }
  },

  getEntries: async (limit = 500) => {
    if (typeof window !== 'undefined' && window.SmartLog?.getEntries) {
      return window.SmartLog.getEntries(limit);
    }
    if (typeof window !== 'undefined' && window.getLog) {
      return window.getLog({ filter: 'all' });
    }
    return [];
  },

  clearAll: async () => {
    if (typeof window !== 'undefined' && window.SmartLog?.clearAll) {
      await window.SmartLog.clearAll();
    } else if (typeof window !== 'undefined' && window.clearLog) {
      await window.clearLog();
    }
  }
};

/**
 * Message bus for content ↔ popup/background communication
 */
export class MessageBus {
  private static listeners = new Map<string, Set<(data: any) => void>>();
  private static port: chrome.runtime.Port | null = null;

  static connect(portName = 'el_channel') {
    if (this.port) return this.port;
    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      this.port = chrome.runtime.connect({ name: portName });
      this.port.onMessage.addListener((msg) => this.#dispatch(msg.action, msg.data));
      this.port.onDisconnect.addListener(() => { this.port = null; });
    }
    return this.port;
  }

  static send(action: string, data: any) {
    if (this.port) {
      this.port.postMessage({ action, data });
    } else {
      // Fallback to sendMessage
      chrome.runtime.sendMessage({ action, data });
    }
  }

  static on(action: string, handler: (data: any) => void) {
    if (!this.listeners.has(action)) this.listeners.set(action, new Set());
    this.listeners.get(action)!.add(handler);
    return () => this.off(action, handler);
  }

  static off(action: string, handler: (data: any) => void) {
    this.listeners.get(action)?.delete(handler);
  }

  static #dispatch(action: string, data: any) {
    this.listeners.get(action)?.forEach(h => h(data));
  }

  static disconnect() {
    this.port?.disconnect();
    this.port = null;
    this.listeners.clear();
  }
}