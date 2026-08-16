/**
 * Dashboard Storage Service — Uses chrome.storage.local directly
 * Works in dashboard (extension page context)
 */

declare const chrome: any;

export interface StorageGetResult<T = any> {
  [key: string]: T;
}

export async function storageGet<T = any>(keys: string | string[]): Promise<StorageGetResult<T>> {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  return new Promise((resolve) => {
    chrome.storage.local.get(keyArray, (result) => resolve(result as StorageGetResult<T>));
  });
}

export async function storageSet(data: Record<string, any>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

export async function storageRemove(keys: string | string[]): Promise<void> {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  return new Promise((resolve) => chrome.storage.local.remove(keyArray, resolve));
}

export const smartLog = {
  addEntry: async (actionType: string, details: Record<string, any> = {}) => {
    try {
      await chrome.runtime.sendMessage({ type: 'SMART_LOG_ADD', actionType, details });
    } catch { /* ignore */ }
  },
  getEntries: async (limit = 500) => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'SMART_LOG_GET', limit });
      return resp?.data || [];
    } catch {
      return [];
    }
  },
  clearAll: async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SMART_LOG_CLEAR' });
    } catch { /* ignore */ }
  }
};