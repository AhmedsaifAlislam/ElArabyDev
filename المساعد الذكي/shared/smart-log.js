// shared/smart-log.js — Session-based activity logger
// Uses chrome.storage.local via background proxy

const SmartLog = (() => {
  const STORAGE_KEY = 'smartLog';
  const MAX_ENTRIES = 10000;

  const ICONS = {
    search: '\uD83D\uDD0D',
    import: '\uD83D\uDCC2',
    scrape_inventory: '\uD83D\uDCE5',
    cart_add: '\uD83D\uDED2',
    cart_remove: '\uD83D\uDDD1\uFE0F',
    inject: '\uD83D\uDC89',
    clear_db: '\uD83D\uDDF1\uFE0F',
  };

  const LABELS = {
    search: '\u0628\u062D\u062B',
    import: '\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0628\u064A\u0627\u0646\u0627\u062A',
    scrape_inventory: '\u0633\u062D\u0628 \u0639\u0647\u062F\u0629',
    cart_add: '\u0625\u0636\u0627\u0641\u0629 \u0644\u0644\u0633\u0644\u0629',
    cart_remove: '\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0633\u0644\u0629',
    inject: '\u062D\u0642\u0646 \u0641\u064A \u0627\u0644\u0628\u0648\u0631\u062A\u0627\u0644',
    clear_db: '\u0645\u0633\u062D \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A',
  };

  async function getStore() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || { version: 1, entries: [] };
  }

  async function saveStore(store) {
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  async function addEntry(action, details = {}) {
    const store = await getStore();
    store.entries.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      details: { ...details }
    });
    if (store.entries.length > MAX_ENTRIES) {
      store.entries = store.entries.slice(-MAX_ENTRIES);
    }
    await saveStore(store);
    return true;
  }

  async function getEntries(limit = 500) {
    const store = await getStore();
    return store.entries.slice(-limit).reverse();
  }

  async function clearAll() {
    await chrome.storage.local.remove(STORAGE_KEY);
    return true;
  }

  return { addEntry, getEntries, clearAll };
})();

if (typeof globalThis !== 'undefined') globalThis.SmartLog = SmartLog;
