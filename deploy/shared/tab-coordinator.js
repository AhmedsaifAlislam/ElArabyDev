// shared/tab-coordinator.js — منسق الجلسات المتعددة (Multi-Session Tabs)
// يوزع البلاغات المتبقية من عملية حجز جماعي على تبويبات/نوافذ متعددة
// عبر تجمع مشترك في localStorage مع نظام قفل (claim) آمن بالتوقيت:
//  - initPool(ids, date, force)  → إنشاء تجمع من قائمة بلاغات
//  - claimNext()                 → يحجز بلاغاً حراً لهذا التبويب (lock)
//  - markDone(id)                → يعلن إتمامه (يُنقل من pending)
//  - markFailed(id)              → يعيد البلاغ للتجمع (إعادة محاولة لاحقة)
//  - getPool() / isPoolActive()
// يصدّر: window.__eaTabCoordinator

(function (global) {
  'use strict';

  if (global.__eaTabCoordinatorLoaded) return;
  global.__eaTabCoordinatorLoaded = true;

  const POOL_KEY = 'elaraby_batch_pool';
  const CLAIM_TIMEOUT = 90 * 1000; // قفل منتهٍ إذا مر 90 ثانية بلا تقدم

  function now() { return Date.now(); }

  function readPool() {
    try { return JSON.parse(localStorage.getItem(POOL_KEY) || 'null'); } catch (_) { return null; }
  }
  function writePool(p) {
    try { localStorage.setItem(POOL_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function isPoolActive() {
    const p = readPool();
    return !!(p && p.active);
  }

  function getPool() { return readPool(); }

  // إنشاء تجمع جديد (يستبدل أي تجمع قديم)
  function initPool(incidentIds, date, force) {
    const ids = (incidentIds || []).filter(Boolean);
    if (!ids.length || !date) return { ok: false, error: 'لا توجد بلاغات أو تاريخ' };
    const pool = {
      active: true,
      date,
      force: !!force,
      pending: ids,
      claimed: {},   // id -> { at, tab }
      done: [],
      failed: [],
      createdAt: now(),
    };
    writePool(pool);
    if (typeof global.__eaToolsLog === 'function') {
      global.__eaToolsLog({
        eventType: 'MULTI_SESSION_STARTED',
        kind: 'info',
        label: 'توزيع جلسات متعددة: ' + ids.length + ' بلاغ',
        details: { total: ids.length, date, force: !!force }
      });
    }
    return { ok: true, pool };
  }

  // إرجاع قائمة البلاغات (تُستخدم بدل pending كي نستبعد المنجز)
  function remainingIds() {
    const p = readPool();
    if (!p || !p.active) return [];
    const nowTs = now();
    // تحرير الأقفال المنتهية تلقائياً
    let changed = false;
    Object.keys(p.claimed).forEach(id => {
      if (nowTs - p.claimed[id].at > CLAIM_TIMEOUT) {
        delete p.claimed[id];
        changed = true;
      }
    });
    if (changed) writePool(p);
    return p.pending.filter(id => !p.done.includes(id));
  }

  // قفل بلاغ حر لهذا التبويب
  function claimNext(tabId) {
    const p = readPool();
    if (!p || !p.active) return { ok: false, error: 'لا يوجد تجمع نشط' };
    const nowTs = now();
    // تحرير الأقفال المنتهية
    Object.keys(p.claimed).forEach(id => {
      if (nowTs - p.claimed[id].at > CLAIM_TIMEOUT) delete p.claimed[id];
    });
    for (const id of p.pending) {
      if (p.done.includes(id)) continue;
      if (p.claimed[id] && nowTs - p.claimed[id].at <= CLAIM_TIMEOUT) continue;
      // قفله الآن
      p.claimed[id] = { at: nowTs, tab: tabId || 'unknown' };
      writePool(p);
      return { ok: true, id };
    }
    // كل البلاغات قيد العمل أو منجزة
    const remaining = p.pending.filter(id => !p.done.includes(id));
    if (!remaining.length) {
      p.active = false;
      writePool(p);
      if (typeof global.__eaToolsLog === 'function') {
        global.__eaToolsLog({
          eventType: 'MULTI_SESSION_DONE',
          kind: 'info',
          label: 'اكتمل التوزيع: ' + p.done.length + ' بلاغ',
          details: { total: p.done.length, failed: p.failed.length }
        });
        global.__eaToolsReport({ type: 'multi_session', customer: '', summary: 'اكتمل توزيع ' + p.done.length + ' بلاغ (فشل ' + p.failed.length + ')', total: p.done.length, failed: p.failed.length, at: Date.now() });
      }
      return { ok: false, done: true };
    }
    return { ok: false, busy: true };
  }

  function markDone(id) {
    const p = readPool();
    if (!p) return;
    if (!p.done.includes(id)) p.done.push(id);
    delete p.claimed[id];
    if (p.pending.every(i => p.done.includes(i))) p.active = false;
    writePool(p);
  }

  function markFailed(id) {
    const p = readPool();
    if (!p) return;
    delete p.claimed[id]; // يعود حراً لتبويب آخر أو لإعادة المحاولة
    if (!p.failed.includes(id)) p.failed.push(id);
    writePool(p);
  }

  function releaseAll(tabId) {
    const p = readPool();
    if (!p) return;
    Object.keys(p.claimed).forEach(id => {
      if (p.claimed[id].tab === tabId) delete p.claimed[id];
    });
    writePool(p);
  }

  function clearPool() {
    try { localStorage.removeItem(POOL_KEY); } catch (_) {}
  }

  global.__eaTabCoordinator = {
    initPool,
    claimNext,
    markDone,
    markFailed,
    releaseAll,
    remainingIds,
    getPool,
    isPoolActive,
    clearPool,
    CLAIM_TIMEOUT,
  };

})(typeof globalThis !== 'undefined' ? globalThis : window);
