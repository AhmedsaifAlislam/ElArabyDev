// shared/db.js — IndexedDB Layer (Unified)
// Source: background.js (إضافة_كروم) + db.ts (Dexie) + Smart_Autofill
// Uses raw IndexedDB (no Dexie dependency) for Chrome extension compatibility

const ElArabyDB = (() => {

  const DB_NAME = 'ElArabyPartsDB';
  const DB_VERSION = 2;
  const STORES = {
    masterData: 'masterData',
    inventory: 'inventory'
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // masterData store
        if (!db.objectStoreNames.contains(STORES.masterData)) {
          const store = db.createObjectStore(STORES.masterData, { autoIncrement: true });
          store.createIndex('sparePartCode', 'sparePartCode', { unique: false });
          store.createIndex('modelCode', 'modelCode', { unique: false });
          store.createIndex('defectCode', 'defectCode', { unique: false });
          store.createIndex('defectMajor', 'defectMajor', { unique: false });
          store.createIndex('productGroup', 'productGroup', { unique: false });
          store.createIndex('productType', 'productType', { unique: false });
          store.createIndex('brand', 'brand', { unique: false });
          store.createIndex('source', 'source', { unique: false });
        }

        // inventory store (compound key: sparePartCode + location)
        if (!db.objectStoreNames.contains(STORES.inventory)) {
          const invStore = db.createObjectStore(STORES.inventory, { autoIncrement: true });
          invStore.createIndex('sparePartCode', 'sparePartCode', { unique: false });
          invStore.createIndex('location', 'location', { unique: false });
          invStore.createIndex('code_location', ['sparePartCode', 'location'], { unique: true });
        }
      };
    });
  }

  // ── Count records in a store ──
  async function countDB(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Clear a store ──
  async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Batch add items ──
  async function addBatch(storeName, items) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.add(item));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Get preview (limited records) to avoid 64MB limit ──
  async function getPreview(storeName, limit = 50) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const results = [];
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) { resolve(results); return; }
        const v = cursor.value;
        if (storeName === STORES.masterData) {
          results.push({
            modelCode: v.modelCode || '',
            modelDescription: v.modelDescription || '',
            sparePartCode: v.sparePartCode || '',
            sparePartDescription: (v.sparePartDescription || '').substring(0, 200),
            defectCode: v.defectCode || '',
            defectDescription: (v.defectDescription || '').substring(0, 200),
            defectMajor: (v.defectMajor || '').substring(0, 200),
            productType: v.productType || '',
            price: v.price || 0,
            maxQuantity: v.maxQuantity || 0,
          });
        } else if (storeName === STORES.inventory) {
          results.push({
            sparePartCode: v.sparePartCode || '',
            sparePartDescription: (v.sparePartDescription || '').substring(0, 200),
            quantity: v.quantity || 0,
            location: v.location || '',
          });
        } else {
          results.push(v);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Search with Arabic normalization and synonym support ──
  async function searchDB(filters, limit = 100) {
    const db = await openDB();
    const ArabicUtils = globalThis.ArabicUtils;

    const parseFilter = (val) => {
      const v = (val || '').trim();
      if (!v) return { text: '', contains: false };
      if (v.startsWith('*')) return { text: v.slice(1).toLowerCase(), contains: true };
      return { text: v.toLowerCase(), contains: false };
    };

    const model   = parseFilter(filters.model);
    const part    = parseFilter(filters.part);
    const defect  = parseFilter(filters.defect);
    const type    = parseFilter(filters.productType);
    const defectMajor = parseFilter(filters.defectMajor);
    const defectDesc = parseFilter(filters.defectDescription);
    const keyword = parseFilter(filters.keyword);

    const matchField = (haystack, { text, contains }) => {
      if (!text) return true;
      const h = ArabicUtils ? ArabicUtils.normalizeArabicText(haystack) : (haystack || '').toLowerCase();
      const t = ArabicUtils ? ArabicUtils.normalizeArabicText(text) : text;
      if (ArabicUtils) {
        const needles = ArabicUtils.expandSearchTerms(t);
        return needles.some(term => contains ? h.includes(term) : h.startsWith(term));
      }
      return contains ? h.includes(t) : h.startsWith(t);
    };

    return new Promise((resolve, reject) => {
      const results = [];
      const req = db.transaction(STORES.masterData, 'readonly')
        .objectStore(STORES.masterData).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || results.length >= limit) { resolve(results); return; }

        const r = cursor.value;
        let match = true;

        if (model.text && !matchField((r.modelCode || '') + ' ' + (r.modelDescription || ''), model)) match = false;
        if (part.text && !matchField(r.sparePartCode || '', part)) match = false;
        if (defect.text && !matchField(r.defectCode || '', defect)) match = false;
        if (type.text && !matchField(r.productType || '', type)) match = false;
        if (defectMajor.text && !matchField(r.defectMajor || '', defectMajor)) match = false;
        if (defectDesc.text && !matchField((r.defectCode || '') + ' - ' + (r.defectDescription || ''), defectDesc)) match = false;

        if (match && keyword.text) {
          const haystack = [
            r.modelCode, r.modelDescription, r.sparePartCode,
            r.sparePartDescription, r.defectCode, r.defectDescription,
            r.defectMajor, r.productType
          ].filter(Boolean).join(' ');
          if (!matchField(haystack, keyword)) match = false;
        }

        if (match) {
          results.push({
            modelCode: r.modelCode || '',
            modelDescription: (r.modelDescription || '').substring(0, 200),
            sparePartCode: r.sparePartCode || '',
            sparePartDescription: (r.sparePartDescription || '').substring(0, 200),
            defectCode: r.defectCode || '',
            defectDescription: (r.defectDescription || '').substring(0, 200),
            defectMajor: (r.defectMajor || '').substring(0, 200),
            productType: r.productType || '',
            price: r.price || 0,
            maxQuantity: r.maxQuantity || 0,
          });
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Get prices for specific codes (avoids 64MB limit, case-insensitive, picks highest) ──
  async function getPricesForCodes(codes) {
    if (!codes || codes.length === 0) return { priceMap: {}, descMap: {} };
    const db = await openDB();
    const codesSet = new Set(codes.map(c => (c || '').trim().toLowerCase()));
    return new Promise((resolve, reject) => {
      const priceMap = {};
      const descMap = {};
      const req = db.transaction(STORES.masterData, 'readonly')
        .objectStore(STORES.masterData).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve({ priceMap, descMap }); return; }
        const r = cursor.value;
        const code = (r.sparePartCode || '').trim().toLowerCase();
        if (codesSet.has(code)) {
          if ((r.price || 0) > (priceMap[code] || 0)) priceMap[code] = r.price || 0;
          if (!descMap[code] && r.sparePartDescription) descMap[code] = r.sparePartDescription;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Check if codes exist in DB (case-insensitive, picks highest price) ──
  async function checkCodesStatus(parts, defects) {
    const db = await openDB();
    const partStatus = {};
    const defectStatus = {};

    if (parts && parts.length > 0) {
      // Build a full lookup map: lowercased code → best record (highest price)
      const partMap = await new Promise((resolve, reject) => {
        const map = {};
        const tx = db.transaction(STORES.masterData, 'readonly');
        const req = tx.objectStore(STORES.masterData).openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) { resolve(map); return; }
          const r = cursor.value;
          const key = (r.sparePartCode || '').trim().toLowerCase();
          if (key) {
            const existing = map[key];
            if (!existing || (r.price || 0) > (existing.price || 0)) {
              map[key] = r;
            }
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });

      for (const code of parts) {
        const val = partMap[(code || '').trim().toLowerCase()];
        partStatus[code] = val ? {
          exists: true,
          price: val.price || 0,
          description: val.sparePartDescription || '',
          modelCode: val.modelCode || '',
          modelDescription: val.modelDescription || '',
          defectCode: val.defectCode || '',
          defectDescription: val.defectDescription || '',
          defectMajor: val.defectMajor || '',
          productGroup: val.productGroup || '',
        } : { exists: false };
      }
    }

    if (defects && defects.length > 0) {
      const defectMap = await new Promise((resolve, reject) => {
        const map = {};
        const tx = db.transaction(STORES.masterData, 'readonly');
        const req = tx.objectStore(STORES.masterData).openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) { resolve(map); return; }
          const r = cursor.value;
          const key = (r.defectCode || '').trim().toLowerCase();
          if (key && !map[key]) map[key] = r;
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });

      for (const code of defects) {
        const val = defectMap[(code || '').trim().toLowerCase()];
        defectStatus[code] = val ? { exists: true, description: val.defectDescription || '', major: val.defectMajor || '' } : { exists: false };
      }
    }

    return { partStatus, defectStatus };
  }

  // ── Update part price (or add if not found) ──
  async function updatePartPrice(sparePartCode, price, sparePartDescription = '') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.masterData, 'readwrite');
      const store = tx.objectStore(STORES.masterData);
      const index = store.index('sparePartCode');
      const req = index.openCursor(IDBKeyRange.only(sparePartCode));

      let updatedCount = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const data = cursor.value;
          data.price = parseFloat(price) || 0;
          if (sparePartDescription && !data.sparePartDescription) {
            data.sparePartDescription = sparePartDescription;
          }
          cursor.update(data);
          updatedCount++;
          cursor.continue();
        } else {
          if (updatedCount === 0) {
            store.add({
              sparePartCode: sparePartCode,
              sparePartDescription: sparePartDescription || 'مكتشف من البورتال',
              price: parseFloat(price) || 0,
              modelCode: '', defectCode: '', defectDescription: '',
              brand: 'مساعد البورتال', productGroup: '', productType: '',
              defectGroup: '', defectMajor: '', modelDescription: '',
              source: 'Portal_Scan'
            });
          }
          resolve(true);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Update defect code (or add if not found) ──
  async function updateDefectCode(defectCode, defectDescription, defectMajor = '') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.masterData, 'readwrite');
      const store = tx.objectStore(STORES.masterData);
      const index = store.index('defectCode');
      const req = index.openCursor(IDBKeyRange.only(defectCode));

      let updatedCount = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const data = cursor.value;
          if (defectDescription && !data.defectDescription) data.defectDescription = defectDescription;
          if (defectMajor && !data.defectMajor) data.defectMajor = defectMajor;
          cursor.update(data);
          updatedCount++;
          cursor.continue();
        } else {
          if (updatedCount === 0) {
            store.add({
              defectCode: defectCode,
              defectDescription: defectDescription || 'مكتشف من البورتال',
              defectMajor: defectMajor || '',
              sparePartCode: '', sparePartDescription: '',
              price: 0, modelCode: '', brand: 'مساعد البورتال',
              productGroup: '', productType: '', defectGroup: '',
              modelDescription: '', source: 'Portal_Scan'
            });
          }
          resolve(true);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Add master data items with merge logic (highest price wins) ──
  async function addMasterDataItems(rawItems, clearFirst = true) {
    const DataMapper = globalThis.DataMapper;
    const stats = { totalRows: rawItems.length, added: 0, updated: 0, skipped: 0, errors: [] };

    // 1. Parse incoming data
    const parsedItems = [];
    rawItems.forEach((row, i) => {
      try {
        // If item is already mapped (has sparePartCode directly), skip DataMapper
        const item = (row.sparePartCode !== undefined) ? row :
                     (DataMapper ? DataMapper.mapRawToMasterData(row, i) : row);
        if (!item.sparePartCode || item.sparePartCode.length < 2) {
          if (stats.errors.length < 5) {
            stats.errors.push(`الصف ${i + 2}: كود قطعة غيار غير صالح`);
          }
          stats.skipped++;
          return;
        }
        const { id, ...rest } = item;
        parsedItems.push(rest);
      } catch (e) {
        stats.skipped++;
      }
    });

    const incomingList = parsedItems;

    // 3. Bulk import: clear store (if first batch) + add all rows in batches
    const db = await openDB();

    if (clearFirst) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.masterData, 'readwrite');
        const store = tx.objectStore(STORES.masterData);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const WRITE_BATCH = 5000;
    for (let i = 0; i < incomingList.length; i += WRITE_BATCH) {
      const chunk = incomingList.slice(i, i + WRITE_BATCH);
      await new Promise((resolve) => {
        const tx = db.transaction(STORES.masterData, 'readwrite');
        const store = tx.objectStore(STORES.masterData);
        chunk.forEach(item => store.add({ ...item, source: 'System' }));
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.error(`[ElAraby] addMasterDataItems batch error at ${i}:`, tx.error?.message);
          stats.errors.push(`خطأ في الباتش ${i}`);
          resolve();
        };
      });
    }

    stats.added = incomingList.length;
    stats.updated = 0;
    return stats;
  }

  // ── Inventory operations ──
  async function getInventory() {
    return getPreview(STORES.inventory, 5000);
  }

  async function getExistingLocations() {
    const db = await openDB();
    const locations = new Set();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORES.inventory, 'readonly')
        .objectStore(STORES.inventory).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(Array.from(locations)); return; }
        locations.add(cursor.value.location);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Get inventory with masterData cross-reference ──
  // Builds a full lookup map from masterData first (case-insensitive),
  // then joins inventory. Handles multiple records per code (picks highest price).
  async function getInventoryWithMasterData() {
    const db = await openDB();

    // Step 1: Build masterData lookup map (lowercased sparePartCode → best record)
    const masterMap = await new Promise((resolve, reject) => {
      const map = {};
      const tx = db.transaction(STORES.masterData, 'readonly');
      const req = tx.objectStore(STORES.masterData).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(map); return; }
        const md = cursor.value;
        const key = (md.sparePartCode || '').trim().toLowerCase();
        if (key) {
          const existing = map[key];
          if (!existing || (md.price || 0) > (existing.price || 0)) {
            map[key] = {
              modelCode: md.modelCode || '',
              modelDescription: md.modelDescription || '',
              defectCode: md.defectCode || '',
              defectDescription: md.defectDescription || '',
              defectMajor: md.defectMajor || '',
              price: md.price || 0,
              productGroup: md.productGroup || '',
              brand: md.brand || '',
              sparePartDescription: md.sparePartDescription || '',
            };
          }
          // Also merge defect info if this record has different defect
          if (existing && existing.defectCode !== md.defectCode && md.defectCode) {
            if (!existing._allDefects) existing._allDefects = [existing.defectCode];
            existing._allDefects.push(md.defectCode);
          }
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });

    // Step 2: Scan inventory and merge with masterData
    return new Promise((resolve, reject) => {
      const inventoryItems = [];
      const tx = db.transaction(STORES.inventory, 'readonly');
      const req = tx.objectStore(STORES.inventory).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(inventoryItems); return; }
        const inv = cursor.value;
        const code = (inv.sparePartCode || '').trim().toLowerCase();
        const md = masterMap[code] || {};
        inventoryItems.push({ ...inv, ...md });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ── Get unique filter values for inventory ──
  async function getInventoryFilters() {
    const fullData = await getInventoryWithMasterData();
    const productGroups = new Set();
    const brands = new Set();
    const models = new Set();

    for (const item of fullData) {
      if (item.productGroup) productGroups.add(item.productGroup);
      if (item.brand) brands.add(item.brand);
      if (item.modelCode) models.add(item.modelCode);
    }

    return {
      productGroups: Array.from(productGroups).sort(),
      brands: Array.from(brands).sort(),
      models: Array.from(models).sort(),
    };
  }

  async function getMasterDataFilters() {
    const db = await openDB();
    const productTypes = new Set();
    const models = new Set();
    const defectMajors = new Set();
    const defectDescs = new Set();
    const modelsByType = {};
    const defectMajorsByModel = {};
    const defectDescsByMajor = {};

    return new Promise((resolve) => {
      const req = db.transaction(STORES.masterData, 'readonly')
        .objectStore(STORES.masterData).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          const result = {
            productTypes: Array.from(productTypes).sort(),
            models: Array.from(models).sort(),
            defectMajors: Array.from(defectMajors).sort(),
            defectDescs: Array.from(defectDescs).sort(),
            modelsByType: {},
            defectMajorsByModel: {},
            defectDescsByMajor: {},
          };
          for (const [type, set] of Object.entries(modelsByType)) result.modelsByType[type] = Array.from(set).sort();
          for (const [md, set] of Object.entries(defectMajorsByModel)) result.defectMajorsByModel[md] = Array.from(set).sort();
          for (const [maj, set] of Object.entries(defectDescsByMajor)) result.defectDescsByMajor[maj] = Array.from(set).sort();
          resolve(result);
          return;
        }
        const r = cursor.value;
        if (r.productType) {
          productTypes.add(r.productType);
          if (r.modelCode) {
            if (!modelsByType[r.productType]) modelsByType[r.productType] = new Set();
            modelsByType[r.productType].add(r.modelCode);
          }
        }
        if (r.modelCode) {
          models.add(r.modelCode);
          if (r.defectMajor) {
            if (!defectMajorsByModel[r.modelCode]) defectMajorsByModel[r.modelCode] = new Set();
            defectMajorsByModel[r.modelCode].add(r.defectMajor);
          }
        }
        if (r.defectMajor) {
          defectMajors.add(r.defectMajor);
          if (r.defectCode && r.defectDescription) {
            const key = r.defectCode + ' - ' + r.defectDescription;
            if (!defectDescsByMajor[r.defectMajor]) defectDescsByMajor[r.defectMajor] = new Set();
            defectDescsByMajor[r.defectMajor].add(key);
          }
        }
        if (r.defectCode && r.defectDescription) {
          defectDescs.add(r.defectCode + ' - ' + r.defectDescription);
        }
        cursor.continue();
      };
      req.onerror = () => resolve({ productTypes: [], models: [], defectMajors: [], defectDescs: [], modelsByType: {}, defectMajorsByModel: {}, defectDescsByMajor: {} });
    });
  }

  // Public API
  return {
    openDB,
    countDB,
    clearStore,
    addBatch,
    getPreview,
    searchDB,
    getPricesForCodes,
    checkCodesStatus,
    updatePartPrice,
    updateDefectCode,
    addMasterDataItems,
    getInventory,
    getInventoryWithMasterData,
    getInventoryFilters,
    getMasterDataFilters,
    getExistingLocations,
    STORES
  };

})();

if (typeof globalThis !== 'undefined') globalThis.ElArabyDB = ElArabyDB;
