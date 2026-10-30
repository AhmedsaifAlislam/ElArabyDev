/**
 * background.js — قالب Service Worker
 * Template for El Araby Extensions
 * 
 * يعالج الرسائل من content scripts ويدير التخزين
 */

// ═══════════════════════════════════════════════════
// التهيئة
// ═══════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed');
});

// ═══════════════════════════════════════════════════
// معالجة الرسائل
// ═══════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;
  
  switch (type) {
    // ─── التخزين ───
    case 'STORAGE_GET':
      handleStorageGet(message, sendResponse);
      return true;
    
    case 'STORAGE_SET':
      handleStorageSet(message, sendResponse);
      return true;
    
    case 'STORAGE_REMOVE':
      handleStorageRemove(message, sendResponse);
      return true;
    
    // ─── سجل العمليات ───
    case 'LOG_EVENT':
      handleLogEvent(message, sendResponse);
      return true;
    
    case 'GET_LOG':
      handleGetLog(message, sendResponse);
      return true;
    
    case 'CLEAR_LOG':
      handleClearLog(message, sendResponse);
      return true;
    
    // ─── أحداث أخرى ───
    default:
      console.log('[Background] Unknown message type:', type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// ═══════════════════════════════════════════════════
// دوال التخزين
// ═══════════════════════════════════════════════════

async function handleStorageGet(message, sendResponse) {
  try {
    const { keys } = message;
    const result = await chrome.storage.local.get(keys);
    sendResponse({ data: result });
  } catch (error) {
    console.error('[Background] Storage GET error:', error);
    sendResponse({ error: error.message });
  }
}

async function handleStorageSet(message, sendResponse) {
  try {
    const { data } = message;
    await chrome.storage.local.set(data);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Storage SET error:', error);
    sendResponse({ error: error.message });
  }
}

async function handleStorageRemove(message, sendResponse) {
  try {
    const { keys } = message;
    await chrome.storage.local.remove(keys);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Storage REMOVE error:', error);
    sendResponse({ error: error.message });
  }
}

// ═══════════════════════════════════════════════════
// دوال السجل
// ═══════════════════════════════════════════════════

const MAX_LOG_ENTRIES = 500;

async function handleLogEvent(message, sendResponse) {
  try {
    const { logType, details } = message;
    const entry = {
      type: logType,
      details,
      timestamp: new Date().toISOString()
    };
    
    const data = await chrome.storage.local.get(['smartLog']);
    const log = data.smartLog || [];
    
    log.unshift(entry);
    
    if (log.length > MAX_LOG_ENTRIES) {
      log.length = MAX_LOG_ENTRIES;
    }
    
    await chrome.storage.local.set({ smartLog: log });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Log event error:', error);
    sendResponse({ error: error.message });
  }
}

async function handleGetLog(message, sendResponse) {
  try {
    const { filter = 'all', search = '' } = message;
    const data = await chrome.storage.local.get(['smartLog']);
    let log = data.smartLog || [];
    
    if (filter !== 'all') {
      log = log.filter(entry => entry.type === filter);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      log = log.filter(entry => {
        const detailsStr = JSON.stringify(entry.details).toLowerCase();
        return detailsStr.includes(searchLower);
      });
    }
    
    sendResponse({ data: log });
  } catch (error) {
    console.error('[Background] Get log error:', error);
    sendResponse({ error: error.message });
  }
}

async function handleClearLog(message, sendResponse) {
  try {
    await chrome.storage.local.set({ smartLog: [] });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Clear log error:', error);
    sendResponse({ error: error.message });
  }
}

// ═══════════════════════════════════════════════════
// أحداث الحياة
// ═══════════════════════════════════════════════════

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension started');
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('[Background] Extension suspended');
});
