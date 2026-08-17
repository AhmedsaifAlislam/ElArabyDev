/**
 * sync-manager.js — مدير المزامنة الموحد (Queue + Retry + Dedup)
 * Shared across all El Araby extensions
 *
 * يعمل في أي عالم (MAIN/ISOLATED): يعتمد على localStorage + fetch فقط
 * يوفّر:
 *   - window.ElArabySyncManager.enqueue(row) — إضافة صف للمزامنة مع تجاهل المكرر
 *   - window.ElArabySyncManager.flush() — محاولة فورية للإرسال
 *   - حلقة خلفية كل 30 ثانية مع Retry تصاعدي (حتى 5 محاولات)
 */

(function(global) {
  'use strict';

  if (global.__elarabySyncManagerLoaded) return;
  global.__elarabySyncManagerLoaded = true;

  const QUEUE_KEY = 'googleSheetsSyncQueue';
  const MAX_RETRIES = 5;
  const LOOP_MS = 30000;

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; }
  }

  function saveQueue(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, 500))); } catch (_) {}
  }

  /**
   * إضافة صف للمزامنة — يتجاهل المكرر حسب رقم الطلب
   * @param {Object} row - { orderNo, name, phone, ... }
   * @returns {boolean} true إذا أُضيف فعلاً
   */
  function enqueue(row) {
    if (!row || !row.orderNo) return false;
    const queue = loadQueue();
    if (queue.some(x => x.orderNo === row.orderNo)) return false;
    queue.push({ orderNo: row.orderNo, data: row, attempts: 0, nextAt: 0 });
    saveQueue(queue);
    return true;
  }

  /**
   * محاولة إرسال كل عناصر الطابور إلى Google WebApp
   * @returns {Promise<number>} عدد العناصر المرسلة بنجاح
   */
  async function flush() {
    const url = global.__ELARABY_WEBAPP_URL || '';
    if (!url) return 0;
    const queue = loadQueue();
    if (!queue.length) return 0;

    let sent = 0;
    let changed = false;
    for (const item of queue) {
      if (item.nextAt > Date.now()) continue;
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        queue.splice(queue.indexOf(item), 1);
        sent++;
        changed = true;
      } catch (_) {
        item.attempts++;
        item.nextAt = Date.now() + Math.min(60000, 5000 * item.attempts);
        if (item.attempts >= MAX_RETRIES) {
          queue.splice(queue.indexOf(item), 1);
        }
        changed = true;
      }
    }
    if (changed) saveQueue(queue);
    return sent;
  }

  // الحلقة الخلفية — كل 30 ثانية
  if (global.__elarabySyncTimer) clearInterval(global.__elarabySyncTimer);
  global.__elarabySyncTimer = setInterval(() => { flush(); }, LOOP_MS);

  global.ElArabySyncManager = {
    enqueue,
    flush,
    getQueueLength: () => loadQueue().length,
    MAX_RETRIES,
    LOOP_MS
  };

  console.log('[SyncManager] ✅ تم تحميل مدير المزامنة الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);
