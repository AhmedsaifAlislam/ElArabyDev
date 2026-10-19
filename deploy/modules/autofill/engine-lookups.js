// ============================================================================
// AutoFill Engine — Lookups & Modal Interaction Subsystem
// File: modules/autofill/engine-lookups.js
// Responsibilities:
// - PowerApps lookup modal automation
// - Iframe traversal and nested modal document collection
// - Subgrid iframe modal handling (problems, technicians, defect codes)
// - Deterministic matching (strictExact support for P0-B.1)
// ============================================================================

window.AutoFillEngine = window.AutoFillEngine || {};

(function(window) {
  'use strict';

  function log(...args) { if (typeof window.log === 'function') window.log(...args); else console.log('[Lookups]', ...args); }
  function warn(...args) { if (typeof window.warn === 'function') window.warn(...args); else console.warn('[Lookups]', ...args); }
  function sleep(ms) { return (typeof window.sleep === 'function') ? window.sleep(ms) : new Promise(r => setTimeout(r, ms)); }

  async function extractAndSaveTechnicians(rows) {
    try {
      if (!rows || !rows.length) return [];
      const names = [];
      const invalidRegex = /sort\s*(ascending|descending)|full\s*name|mobile\s*phone|id\s*number|search\s*results|اختر|select|إلغاء|حفظ|delete|clear/i;
      for (const r of rows) {
        if (!r) continue;
        if (r.tagName === 'TH' || (typeof r.closest === 'function' && r.closest('thead'))) continue;
        const text = (r.innerText || '').trim();
        if (!text || /norecords|لاتوجد|no\s*records|لا\s*توجد/i.test(text.replace(/\s/g, ''))) continue;

        let name = '';
        const link = (typeof r.querySelector === 'function') ? r.querySelector('a') : null;
        if (link && link.innerText && /[\u0600-\u06FF]{3,}/.test(link.innerText) && !invalidRegex.test(link.innerText)) {
          name = link.innerText.trim();
        } else if (typeof r.querySelectorAll === 'function') {
          const tds = Array.from(r.querySelectorAll('td')).filter(td => !td.querySelector('input[type="radio"], input[type="checkbox"]'));
          const arabicCell = tds.find(c => /[\u0600-\u06FF]{3,}/.test(c.innerText) && !invalidRegex.test(c.innerText));
          if (arabicCell) {
            name = arabicCell.innerText.trim();
          }
        }
        if (!name && /[\u0600-\u06FF]{3,}/.test(text) && !invalidRegex.test(text)) {
          name = text.split(/[\t\n]/)[0].trim();
        }

        name = name.replace(/\s+/g, ' ').trim();
        if (name && name.length >= 3 && /[\u0600-\u06FF]/.test(name) && !invalidRegex.test(name)) {
          names.push(name);
        }
      }
      if (names.length) {
        const { technicianRoster: existing = [] } = await chrome.storage.local.get({ technicianRoster: [] });
        const cleanExisting = existing.filter(t => t && !invalidRegex.test(t));
        const merged = [...new Set([...cleanExisting, ...names])];
        if (merged.length !== existing.length || cleanExisting.length !== existing.length) {
          await chrome.storage.local.set({ technicianRoster: merged });
          log(`[TECH-ROSTER] Auto-saved ${merged.length} valid technicians:`, merged);
        }
      }
      return names;
    } catch(e) {
      warn('[TECH-ROSTER] Storage save failed:', e.message);
      return [];
    }
  }

  const BRAND_SYNONYMS = {
    sharp: ['شارب', 'sharp'],
    toshiba: ['توشيبا', 'toshiba'],
    tornado: ['تورنيدو', 'tornado'],
    hoover: ['هوفر', 'hoover'],
    sony: ['سوني', 'sony'],
    candy: ['كاندي', 'candy'],
    hitachi: ['هيتاشي', 'hitachi'],
    beko: ['بيكو', 'beko'],
    lagermania: ['لاجيرمانيا', 'جيرمانيا', 'la germania', 'germania']
  };

  function matchBrand(text, brandQuery) {
    if (!text || !brandQuery) return false;
    const t = text.toLowerCase().trim();
    const q = brandQuery.toLowerCase().trim();
    if (t === q || t.includes(q) || q.includes(t)) return true;
    for (const group of Object.values(BRAND_SYNONYMS)) {
      if (group.some(g => q.includes(g) || g.includes(q))) {
        if (group.some(g => t.includes(g))) return true;
      }
    }
    return false;
  }

  function findSafeLookupButton(input, extraSelectors = []) {
    if (!input) return null;

    // 1. Exact ID matching (PowerApps convention: input_lookupmodalbutton)
    if (input.id) {
      const baseId = input.id.replace(/_name$/, '');
      const directCandidates = [
        document.getElementById(input.id + '_lookupmodalbutton'),
        document.getElementById(baseId + '_lookupmodalbutton'),
        document.querySelector(`button[id*="${baseId}"][id*="lookup"]`),
        document.querySelector(`button[id*="${input.id}"][id*="lookup"]`)
      ];
      for (const btn of directCandidates) {
        if (btn && !/clear|مسح|remove|delete/i.test(btn.className + (btn.getAttribute('aria-label') || '') + (btn.title || ''))) {
          return btn;
        }
      }
    }

    // 2. Container-scoped search: strictly within the input's own container
    const container = input.closest('.input-group') || input.closest('.control') || input.closest('td') || input.parentElement;
    if (container) {
      const launcherBtn = container.querySelector('button.launchentitylookup, button[aria-label*="Launch lookup"], button[title*="Launch lookup"], .input-group-btn button:not(.clearlookupfield)');
      if (launcherBtn && !/clear|مسح|remove|delete/i.test(launcherBtn.className + (launcherBtn.getAttribute('aria-label') || '') + (launcherBtn.title || ''))) {
        return launcherBtn;
      }
      const btn = Array.from(container.querySelectorAll('button, a.btn')).find(b =>
        !/clear|مسح|remove|delete/i.test(b.className + (b.getAttribute('aria-label') || '') + (b.title || ''))
      );
      if (btn) return btn;
    }

    // 3. ExtraSelectors: strictly allow ONLY field-scoped selectors, NEVER generic global selectors
    for (const sel of extraSelectors) {
      if (!sel) continue;
      if (container) {
        try {
          const el = container.querySelector(sel);
          if (el) return el;
        } catch (_) {}
      }
      // Only permit global query if selector contains field ID or specific scope (prevent Brand/Model collision)
      if (sel.includes('#') || sel.includes('id*=') || sel.includes('aria-label*=') || sel.includes('.lookup-')) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (_) {}
      }
    }
    return null;
  }

  async function dispatchClickSequence(el) {
    if (!el) return false;
    const doc = el.ownerDocument || document;
    const view = doc.defaultView || window;
    try { el.focus(); } catch(_) {}
    try { el.dispatchEvent(new Event('focus', { bubbles: true })); } catch(_) {}
    for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        // إرسال أحداث حقيقية (PointerEvent للمؤشرات) لمطابقة سلوك المستخدم الفعلي.
        // ⚠️ تنبيه: هذه الدالة تُطلق نقرة **مرتين** (MouseEvent('click') + el.click()).
        // لا تستخدمها لعناصر «التبديل» (span[role="checkbox"]) — استخدم clickOnce/selectLookupRow.
        // (تحقق حي 2026-10-19)
        const isPointer = ev.startsWith('pointer');
        const Ctor = (isPointer && typeof view.PointerEvent === 'function') ? view.PointerEvent : MouseEvent;
        const init = { bubbles: true, cancelable: true, view };
        if (Ctor === view.PointerEvent) {
          init.pointerId = 1;
          init.pointerType = 'mouse';
          init.isPrimary = true;
          init.button = 0;
          init.buttons = ev === 'pointerdown' ? 1 : 0;
        }
        el.dispatchEvent(new Ctor(ev, init));
      } catch(_) {}
    }
    try {
      if (typeof el.click === 'function') el.click();
    } catch(_) {}
    try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch(_) {}
    return true;
  }

  // ── نقر واحد فقط (بلا تكرار) ──
  // صفوف lookup في الصفحة الثانية تستخدم span[role="checkbox"] وهو عنصر «تبديل»:
  // أي نقرتين متتاليتين تُلغي التحديد ⇒ يبقى زر «اختر» disabled.
  // تحقق حي على البوابة 2026-10-19 (مودال المشاكل + مودال الفنيين).
  function clickOnce(el) {
    if (!el) return false;
    try { el.focus(); } catch(_) {}
    try {
      if (typeof el.click === 'function') {
        el.click();
      } else {
        const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
      }
    } catch(_) {}
    return true;
  }

  // حالة تحديد الصف: true / false / null (نمط غير معروف)
  function isLookupRowSelected(row) {
    if (!row) return null;
    const span = row.querySelector('span[role="checkbox"]');
    if (span && span.hasAttribute('aria-checked')) return span.getAttribute('aria-checked') === 'true';
    const radio = row.querySelector('input[type="radio"]');
    if (radio) return !!radio.checked;
    const chk = row.querySelector('input[type="checkbox"]');
    if (chk) return !!chk.checked;
    return null;
  }

  // اختيار صف داخل مودال lookup: نقرة واحدة على عنصر التحديد الصحيح + التحقق.
  // يرجع false إذا لم يُحدَّد الصف فعلًا (بدل الاستمرار بنجاح وهمي).
  async function selectLookupRow(row) {
    if (!row) return false;
    const radio = row.querySelector('input[type="radio"]');
    const chk = row.querySelector('input[type="checkbox"]');
    if (radio || chk) {
      const el = radio || chk;
      clickOnce(el);
      try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      return true;
    }
    const spanChk = row.querySelector('span[role="checkbox"]');
    const td = spanChk ? spanChk.closest('td') : null;
    for (const el of [spanChk, td, row]) {
      if (!el) continue;
      if (isLookupRowSelected(row) === true) return true;
      clickOnce(el);
      await sleep(350);
    }
    const state = isLookupRowSelected(row);
    return state === null ? true : state === true;
  }

  // إيجاد زر «حفظ» داخل iframe نموذج.
  // ⚠️ لا تستخدم querySelector('#InsertButton, …, button.btn-primary') — قائمة المحدّدات
  // ترجع أول عنصر في ترتيب الـ DOM، وزر «اختر» المخفي لمودال lookup يسبق «حفظ»
  // فيُضغط زر مخفي ولا يُحفظ النموذج. (تحقق حي 2026-10-19)
  function findModalSaveButton(doc) {
    if (!doc) return null;
    const byId = doc.getElementById('InsertButton') || doc.getElementById('SubmitButton');
    if (byId) return byId;
    const cands = Array.from(doc.querySelectorAll('input[type="submit"], button[type="submit"], button.btn-primary, input[type="button"]'));
    return cands.find(b => b.offsetParent !== null && !b.disabled &&
      /save|submit|حفظ|insert/i.test((b.innerText || b.value || b.title || '').trim())) || null;
  }

  // Checks if a modal element is currently "open/visible" on screen.
  // NOTE: Portal modals use position:fixed.
  //       DO NOT check document.body.classList.contains('modal-open') because that is true for ALL modals once any modal opens!
  //       A modal is open if it has class 'in' or 'show', or its computed display is 'block'/'flex' and not 'none',
  //       and aria-hidden is not 'true'.
  function isModalOpen(modal) {
    if (!modal) return false;
    if (modal.classList.contains('modal-error')) return false;
    if (modal.getAttribute('aria-hidden') === 'true') return false;
    if (modal.classList.contains('in') || modal.classList.contains('show')) return true;
    try {
      const style = window.getComputedStyle(modal);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        return true;
      }
    } catch (_) {}
    return modal.style.display === 'block';
  }

  function getActiveModal(doc = document) {
    const candidates = Array.from(doc.querySelectorAll('section.modal.modal-lookup, section.modal, .modal.show, .modal.in, .modal-lookup, div[role="dialog"]'));
    // Find the visible active modal (last in DOM or with .in/.show and computed display !== 'none')
    const active = candidates.filter(m => isModalOpen(m));
    return active[active.length - 1] || null;
  }

  async function waitForModalCloseIfOpen() {
    const openModals = () => Array.from(document.querySelectorAll('.modal.show, .modal.in, div[role="dialog"]'))
      .filter(m => isModalOpen(m));
    if (openModals().length === 0) return true;
    log('Waiting for open modal to close before clicking...');
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const active = openModals();
      if (active.length === 0) { log('Prior modal closed.'); return true; }
      const closeBtn = active[0].querySelector('[data-dismiss="modal"], .modal-header .close, button[aria-label="Close"], button[aria-label="إغلاق"]');
      if (closeBtn && Date.now() - start > 3000) {
        log('Attempting to dismiss lingering modal...');
        await dispatchClickSequence(closeBtn);
      }
      await sleep(400);
    }
    warn('Prior modal did not close within timeout, proceeding anyway.');
    return false;
  }

  async function waitForModalIframe(modal, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const iframe = modal.querySelector('iframe');
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && (doc.readyState === 'complete' || doc.readyState === 'interactive')) {
            const hasContent = doc.body && doc.body.children.length > 0;
            if (hasContent) return doc;
          }
        } catch (_) {}
      }
      await sleep(300);
    }
    return null;
  }

  async function fillLookupModal(btn, searchValue, rootDoc, opts = {}) {
    if (!btn || !searchValue) return { ok: false };
    if (!rootDoc) rootDoc = btn.ownerDocument || document;

    // If target input already has the matching value, don't clear or reopen
    const parentContainer = btn.closest('.input-group') || btn.parentElement;
    const targetInput = parentContainer ? parentContainer.querySelector('input') : null;
    if (targetInput) {
      const cur = (targetInput.value || targetInput.getAttribute('value') || '').trim();
      const normCur = cur.replace(/[\s\-_/()\[\]#*]/g, '').toLowerCase();
      const normVal = searchValue.replace(/[\s\-_/()\[\]#*]/g, '').toLowerCase();
      if (cur && (cur === searchValue || (normVal.length >= 3 && normCur.includes(normVal)))) {
        log(`Lookup already populated with matching value "${cur}" — skipping modal.`);
        return { ok: true, selected: cur };
      }
    }

    const clearBtn = btn.parentElement?.querySelector('button[aria-label*="Clear"], button[aria-label*="مسح"]');
    if (clearBtn) {
      await dispatchClickSequence(clearBtn);
      try { clearBtn.click(); } catch(_) {}
      await sleep(500);
    }
    log('Opening Modal for:', searchValue);
    await dispatchClickSequence(btn);
    try { btn.click(); } catch(_) {}
    await sleep(1800);

    // Wait for modal to appear — search across rootDoc, btn.ownerDocument, and top document
    let modal = null;
    const docsToSearch = [...new Set([rootDoc, btn.ownerDocument, document].filter(Boolean))];
    // مودال الـ lookup قد يكون داخل iframe الخاص بنموذج (مثل «اضافة فنى»)، بينما
    // getActiveModal على المستند الرئيسي يلتقط المودال الخارجي (بلا صفوف).
    // لذا نُفضّل أي `.modal-lookup` مفتوح فعليًا قبل الرجوع لأي مودال عام (2026-10-19).
    const findOpenLookup = (d) => {
      try {
        const list = Array.from(d.querySelectorAll('.modal-lookup, section.modal.modal-lookup'));
        const open = list.filter(m => isModalOpen(m));
        return open[open.length - 1] || null;
      } catch (_) { return null; }
    };
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      for (const d of docsToSearch) {
        const lm = findOpenLookup(d);
        if (lm) { modal = lm; rootDoc = d; break; }
      }
      if (modal) break;
      for (const d of docsToSearch) {
        const m = getActiveModal(d);
        if (m) { modal = m; rootDoc = d; break; }
      }
      if (modal) break;
      await sleep(300);
    }
    if (!modal) {
      warn('Lookup modal did not open for:', searchValue);
      return { ok: false, reason: 'modal-not-found' };
    }

    // Check if modal uses an iframe immediately (without blocking for 10 seconds)
    const existingIframe = modal.querySelector('iframe');
    if (existingIframe) {
      try {
        const doc = existingIframe.contentDocument || existingIframe.contentWindow?.document;
        if (doc && doc.body && doc.body.children.length > 0) {
          log('Iframe detected in modal, using iframe document');
          rootDoc = doc;
        }
      } catch(_) {}
    }

    // Extract model code (before " _ " or "(") for search — mirrors backup logic
    const modelCodeOnly = (searchValue || '').split(/\s*[_–—]\s*/)[0].split('(')[0].trim();
    const searchFor = modelCodeOnly || searchValue;

    // ── Try direct pick first (Brand modal shows all items on open) ──
    const getVisibleItems = () => {
      const selectors = ['section.modal.modal-lookup table tbody tr', '.modal table tbody tr', '[role="dialog"] table tbody tr', '.modal [role="row"]', '[role="dialog"] [role="option"]'];
      const readFrom = (root) => {
        if (!root) return [];
        const out = [];
        for (const sel of selectors) {
          try {
            out.push(...Array.from(root.querySelectorAll(sel)).filter(r =>
              r.offsetParent !== null &&
              r.innerText.trim().length > 0 &&
              !/norecords|لاتوجد|no\s*records|لا\s*توجد/i.test(r.innerText.replace(/\s/g, ''))
            ));
          } catch (_) {}
        }
        return out;
      };
      // مودال الاختيار أولًا: إن وُجدت صفوف بداخله فهي المصدر الوحيد للنتائج.
      // (ضمّ المستند الرئيسي كان يُدخل صفوف شبكات الصفحة كأنها نتائج بحث — 2026-10-19)
      const fromModal = readFrom(modal);
      if (fromModal.length) return [...new Set(fromModal)];
      const fromRoot = (rootDoc && rootDoc !== modal) ? readFrom(rootDoc) : [];
      if (fromRoot.length) return [...new Set(fromRoot)];
      return [...new Set(readFrom(document !== rootDoc ? document : null))];
    };

    // Wait briefly for items to appear without searching
    let visibleItems = [];
    for (let w = 0; w < 6; w++) {
      visibleItems = getVisibleItems();
      if (visibleItems.length > 0) break;
      await sleep(400);
    }

    // Auto-capture technician names if this is a technician modal
    const isTechModal = opts.isTechnician || (modal && /Full\s*Name|الفن|Technician|Mobile\s*Phone/i.test(modal.innerText));
    if (isTechModal && visibleItems.length > 0) {
      extractAndSaveTechnicians(visibleItems);
    }

    const normalize = s => (s || '').replace(/[\s\-_/()\[\]#*]/g, '').toLowerCase();
    const target = normalize(searchValue);
    const targetCode = normalize(modelCodeOnly);
    const rawTarget = (searchValue || '').replace(/[\s()\[\]_#*]/g, '').toLowerCase();
    const rawTargetCode = modelCodeOnly.replace(/[\s()\[\]_#*]/g, '').toLowerCase();

    const getRowCode = row => {
      const txt = row.innerText.trim();
      // Model code is typically the first segment before " _ " or before Arabic description
      const codePart = txt.split(/\s*[_–—]\s*/)[0].trim();
      return codePart;
    };

    // اختيار الصف: نقرة واحدة فقط (span[role="checkbox"] عنصر تبديل — نقرتان تُلغي التحديد).
    const clickRow = async (row) => selectLookupRow(row);

    const pickAndConfirm = async (items) => {
      let match;
      if (searchValue === '*') {
        match = items[0];
        if (!match) return { ok: false, reason: 'no-match' };
        log('Wildcard * — picking first available item');
      } else {
        if (opts && opts.isBrand) {
          const brandMatch = items.find(i => matchBrand(i.innerText, searchValue));
          if (brandMatch) {
            log(`Brand match found in list: "${brandMatch.innerText.trim()}" for "${searchValue}"`);
            match = brandMatch;
          }
        }

        if (!match) {
          // Exact match: raw code or normalized code
          const exactMatch = items.find(i => {
            const code = getRowCode(i).toLowerCase();
            return code === rawTarget || normalize(code) === target ||
                   code === rawTargetCode || normalize(code) === targetCode;
          });
          // Starts-with + boundary
          const startsMatch = !exactMatch ? items.find(i => {
            const norm = normalize(getRowCode(i));
            const searchTarget = targetCode.length > target.length / 2 ? targetCode : target;
            return norm.startsWith(searchTarget) && (norm.length === searchTarget.length || !/[a-z0-9]/.test(norm[searchTarget.length]));
          }) : null;
          // Code-part includes match (NOT full row text — prevents Arabic description false positives)
          const includesMatch = (!exactMatch && !startsMatch) ? items.find(i => {
            const code = normalize(getRowCode(i));
            return code.includes(targetCode) || code.includes(target);
          }) : null;

          match = exactMatch || startsMatch || includesMatch || null;
          if (opts && opts.strictExact) {
            match = exactMatch || null;
            log(`Strict deterministic pick — exactMatch only: ${!!exactMatch}`);
            if (!match) return { ok: false, reason: 'no-exact-match' };
          }
          log(`Lookup pick — exact:${!!exactMatch} starts:${!!startsMatch} includes:${!!includesMatch} → "${match?.innerText?.trim().slice(0,60)}"`);
        }
        if (!match) return { ok: false, reason: 'no-match' };
      }

      const rowSelected = await clickRow(match);
      await sleep(1000);
      if (rowSelected === false) {
        warn('Lookup row did not get selected — aborting (avoid false success)');
        return { ok: false, reason: 'row-not-selected' };
      }

      // Select button — prioritize button inside the active modal!
      const modalBtns = Array.from(modal.querySelectorAll('button, input[type="button"], input[type="submit"]'));
      let selectBtn = modalBtns.find(b => /^(اختر|select|تحديد)$/i.test((b.innerText || b.value || b.getAttribute('aria-label') || '').trim()) && !b.disabled) ||
                      modalBtns.find(b => /اختر|select|تحديد/i.test((b.innerText || b.value || b.getAttribute('aria-label') || '').trim()) && !/إلغاء|cancel|clear|إزالة/i.test((b.innerText || b.value || '').trim()) && !b.disabled);
      
      if (!selectBtn) {
        const selectRoots = [rootDoc, document].filter(Boolean);
        for (const root of selectRoots) {
          try {
            const candidates = Array.from(root.querySelectorAll(
              '.modal button.primary, .modal button[aria-label*="Select"], .modal button[aria-label*="اختر"], button[aria-label*="Select"]'
            ));
            selectBtn = candidates.find(b => /اختر|select|تحديد/i.test((b.innerText || b.value || '').trim()) && !/إلغاء|cancel|clear|إزالة/i.test((b.innerText || b.value || '').trim()) && !b.disabled);
            if (selectBtn) break;
          } catch(_) {}
        }
      }

      if (selectBtn) {
        log(`Clicking modal select button: "${(selectBtn.innerText || selectBtn.value || '').trim()}"`);
        try { selectBtn.focus(); } catch(_) {}
        await dispatchClickSequence(selectBtn);
        try { selectBtn.click(); } catch(_) {}
        // Wait for modal to close after selection
        const closeDeadline = Date.now() + 8000;
        while (Date.now() < closeDeadline) {
          if (!modal || !isModalOpen(modal)) break;
          await sleep(250);
        }
        await sleep(500);
      } else if (rowSelected === true) {
        log('No enabled select button — row already selected (assuming auto-confirm).');
      } else {
        warn('Modal select button (اختر / Select) not found or disabled!');
        return { ok: false, reason: 'select-btn-not-found' };
      }
      return { ok: true, selected: match.innerText?.trim() };
    };

    // Direct pick attempt (works for Brand modal which pre-lists all brands)
    if (visibleItems.length > 0 && !opts.isModel) {
      log(`Direct pick mode: found ${visibleItems.length} items without searching.`);
      const res = await pickAndConfirm(visibleItems);
      if (res.ok) return res;
      log('No match in direct list, falling back to search...');
    }

    // ── Fallback: search mode (essential for Model modal) ──
    const searchSelectors = [
      'input.query',
      'input[type="search"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="بحث"]',
      '.entitylist-search input',
      '.input-group input.form-control'
    ];
    let searchInput = null;
    const searchRoots = [modal, rootDoc, document].filter(Boolean);
    for (const r of searchRoots) {
      const inputs = Array.from(r.querySelectorAll(searchSelectors.join(',')));
      searchInput = inputs.find(el => el.offsetParent !== null || window.getComputedStyle(el).display !== 'none');
      if (searchInput) break;
    }
    if (!searchInput && modal) {
      searchInput = modal.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
    }

    if (searchInput) {
      log(`Typing search query: "${searchFor}" in modal search input`);
      try { searchInput.focus(); } catch(_) {}
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(searchInput), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (descriptor && descriptor.set) {
        try { descriptor.set.call(searchInput, searchFor); } catch(_) { searchInput.value = searchFor; }
      } else {
        searchInput.value = searchFor;
      }
      try { searchInput.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
      try { searchInput.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
      await sleep(300);

      const searchBtn = searchInput.parentElement?.querySelector('button, .btn-hg') ||
        modal.querySelector('.input-group-btn button, button[aria-label*="Search"], button[aria-label*="بحث"], button.btn-hg');
      if (searchBtn) {
        log('Clicking modal search button (magnifying glass)...');
        await dispatchClickSequence(searchBtn);
        try { searchBtn.click(); } catch(_) {}
      }
      ['keydown', 'keypress', 'keyup'].forEach(ev => {
        try { searchInput.dispatchEvent(new KeyboardEvent(ev, { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); } catch(_) {}
      });

      log(`⏳ Waiting for search results for: "${searchFor}"...`);
      const startWait = Date.now();
      while (Date.now() - startWait < 10000) {
        visibleItems = getVisibleItems();
        const matchFound = visibleItems.some(i => {
          const code = getRowCode(i).toLowerCase();
          return code === rawTargetCode || normalize(code) === targetCode ||
                 code.includes(targetCode) || normalize(i.innerText).includes(targetCode);
        });
        if (matchFound) {
          log(`Search result appeared for "${searchFor}"`);
          break;
        }
        await sleep(400);
      }
    } else {
      warn('Could not locate search input inside active modal!');
    }

    visibleItems = getVisibleItems();
    if (!visibleItems.length) {
      log('No search results found in modal.');
      const closeBtn = modal.querySelector('[data-dismiss="modal"], button.close, button[aria-label*="Close"], button[aria-label*="إغلاق"]');
      if (closeBtn) await dispatchClickSequence(closeBtn);
      return { ok: false, reason: 'no-results' };
    }

    return await pickAndConfirm(visibleItems) || { ok: false };
  }

  async function handlePage2Modal(btnRegex, searchValue, opts = {}) {
    await waitForModalCloseIfOpen();

    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => b.offsetParent !== null)
      .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) {
      warn(`handlePage2Modal: Add button not found matching ${btnRegex}`);
      return { ok: false, reason: 'add-btn-not-found' };
    }

    log(`Clicking add button: "${(addBtn.innerText || addBtn.title || addBtn.value || '').trim().slice(0,30)}"`);
    await dispatchClickSequence(addBtn);
    await sleep(1000);

    let modal = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      modal = document.querySelector('section.modal.modal-lookup.in, .modal.show, .modal.in, div[role="dialog"]');
      if (modal && isModalOpen(modal)) break;
      modal = null;
      await sleep(400);
    }
    if (!modal) {
      warn('handlePage2Modal: Outer modal did not appear');
      return { ok: false, reason: 'outer-modal-not-found' };
    }

    const iframeDoc = await waitForModalIframe(modal, 12000);
    if (!iframeDoc) {
      warn('handlePage2Modal: Iframe inside modal did not load');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) await dispatchClickSequence(closeBtn);
      return { ok: false, reason: 'iframe-not-loaded' };
    }

    await sleep(600);
    // الزر قد يظهر متأخرًا بعد تحميل الـ iframe (سباق توقيت حقيقي) — ننتظره بدل الفشل الفوري.
    // (رُصد حيًا 2026-10-19 أثناء الاختبار)
    let lookupBtn = null;
    const lbDeadline = Date.now() + 10000;
    while (Date.now() < lbDeadline) {
      lookupBtn = iframeDoc.querySelector('button.launchentitylookup, button.lookup-btn, .input-group-btn button:not(.clearlookupfield)');
      if (lookupBtn) break;
      await sleep(400);
    }
    if (!lookupBtn) {
      warn('handlePage2Modal: Lookup button not found inside iframe');
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) await dispatchClickSequence(closeBtn);
      return { ok: false, reason: 'lookup-btn-not-found' };
    }
    await sleep(1500);

    const isTech = /فن|tech/i.test(btnRegex.source);
    const result = await fillLookupModal(lookupBtn, searchValue, document, { ...opts, isTechnician: isTech });
    if (!result || !result.ok) {
      warn(`handlePage2Modal: Lookup failed: ${result?.reason || 'unknown'}`);
      const closeBtn = modal.querySelector('[data-dismiss="modal"]');
      if (closeBtn) await dispatchClickSequence(closeBtn);
      return result;
    }

    if (isTech && result.selected) {
      extractAndSaveTechnicians([{ innerText: result.selected }]);
    }

    await sleep(1000);
    // ⚠️ مهم جدًا (تحقق حي 2026-10-19): querySelector بقائمة محدّدات يرجع **أول عنصر
    // في ترتيب الـ DOM** — وزر «اختر» المخفي لمودال lookup يأتي قبل «حفظ»، فكان
    // الحفظ يضغط زرًا مخفيًا ولا يُحفظ النموذج أبدًا (ثم يُبلَّغ بنجاح وهمي).
    // الحل: البحث بالـ id أولًا (#InsertButton/#SubmitButton) ثم أزرار مرئية نصّها حفظ/Submit.
    const saveBtn = iframeDoc.getElementById('InsertButton')
      || iframeDoc.getElementById('SubmitButton')
      || Array.from(iframeDoc.querySelectorAll('input[type="submit"], button[type="submit"], button.btn-primary, input[type="button"]'))
        .find(b => b.offsetParent !== null && !b.disabled && /save|submit|حفظ|insert/i.test((b.innerText || b.value || b.title || '').trim()));
    if (saveBtn) {
      log(`Clicking Save/Submit inside iframe modal: "${(saveBtn.value || saveBtn.innerText || '').trim()}"`);
      clickOnce(saveBtn);
      const saveDeadline = Date.now() + 12000;
      let closed = false;
      while (Date.now() < saveDeadline) {
        if (!isModalOpen(modal) || !document.body.contains(modal)) { closed = true; break; }
        await sleep(400);
      }
      await sleep(1000);
      if (!closed) {
        warn('handlePage2Modal: Save clicked but modal did not close — treating as failure');
        return { ok: false, reason: 'save-not-confirmed', selected: result.selected };
      }
      return { ok: true, selected: result.selected };
    } else {
      warn('handlePage2Modal: Save button not found inside iframe modal');
      return { ok: false, reason: 'save-btn-not-found' };
    }
  }

  async function fillPowerAppsLookup(inputSelector, searchValue, opts = {}) {
    if (!inputSelector || !searchValue) return { ok: false };
    const selectors = Array.isArray(inputSelector) ? inputSelector : [inputSelector];
    let input = null;
    for (const sel of selectors) {
      input = document.querySelector(sel);
      if (input) break;
    }
    if (!input) {
      warn(`fillPowerAppsLookup: input ${JSON.stringify(inputSelector)} not found`);
      return { ok: false, reason: 'input-not-found' };
    }

    const cur = (input.value || input.getAttribute('value') || '').trim();
    if (opts.isBrand) {
      if (cur && matchBrand(cur, searchValue)) {
        log(`fillPowerAppsLookup: Brand already matches "${cur}" — skipping modal.`);
        return { ok: true, selected: cur };
      }
      if (cur && !opts.forceOverwrite) {
        log(`fillPowerAppsLookup: Brand already populated with "${cur}" (preserve without forceOverwrite) — skipping.`);
        return { ok: true, selected: cur };
      }
    } else {
      const normCur = cur.replace(/[\s\-_/()\[\]#*]/g, '').toLowerCase();
      const normVal = searchValue.replace(/[\s\-_/()\[\]#*]/g, '').toLowerCase();
      if (cur && (cur === searchValue || (normVal.length >= 3 && normCur.includes(normVal)))) {
        log(`fillPowerAppsLookup: input already contains matching value "${cur}" — skipping.`);
        return { ok: true, selected: cur };
      }
    }

    const extraButtons = opts.fallbackButtons || [];
    const lookupBtn = findSafeLookupButton(input, extraButtons);
    if (!lookupBtn) {
      warn(`fillPowerAppsLookup: lookup button for ${JSON.stringify(inputSelector)} not found`);
      return { ok: false, reason: 'lookup-btn-not-found' };
    }
    return await fillLookupModal(lookupBtn, searchValue, document, opts);
  }

  async function waitForModalStable(timeoutMs = 5000) {
    const start = Date.now();
    let stableCount = 0;
    let prevRowCount = -1;
    while (Date.now() - start < timeoutMs) {
      const modal = document.querySelector('section.modal.modal-lookup.in, .modal.show, .modal.in, div[role="dialog"]');
      if (!modal || !isModalOpen(modal)) { await sleep(200); continue; }
      // Stability check via row count (doesn't rely on offsetHeight which may be 0 for position:fixed)
      const rowCount = modal.querySelectorAll('table tbody tr').length;
      if (rowCount > 0 && rowCount === prevRowCount) {
        stableCount++;
        if (stableCount >= 2) return modal;
      } else {
        stableCount = 0;
        prevRowCount = rowCount;
      }
      await sleep(250);
    }
    return document.querySelector('section.modal.modal-lookup.in, .modal.show, .modal.in, div[role="dialog"]') || null;
  }

  // ── أدوات مودال الاختيار داخل iframe النموذج ──
  // ترجع آخر مودال اختيار مفتوح فعليًا (وليس أي مودال عام).
  function findOpenLookupModal(rootDoc) {
    if (!rootDoc) return null;
    try {
      const list = Array.from(rootDoc.querySelectorAll('.modal-lookup, section.modal.modal-lookup, .modal.modal-lookup'));
      const open = list.filter(m => isModalOpen(m));
      return open[open.length - 1] || null;
    } catch (_) { return null; }
  }

  // إغلاق مودال الاختيار **وحده** — لا تلمس مودال النموذج.
  // (الاعتماد على آخر [data-dismiss="modal"] كان يضغط زر إغلاق النموذج نفسه
  //  فيقفل النافذة الأولى بالخطأ — رُصد حيًا 2026-10-19.)
  function closeLookupModalOnly(rootDoc) {
    const lm = findOpenLookupModal(rootDoc);
    if (!lm) return false;
    const btn = lm.querySelector('button.form-close, .cancel, [data-dismiss="modal"]');
    if (btn) { clickOnce(btn); return true; }
    return false;
  }

  // إغلاق مودال النموذج عبر زر إغلاقه في رأس المودال فقط.
  function closeFormModal(formModal) {
    if (!formModal || !document.body.contains(formModal)) return false;
    const btn = formModal.querySelector('button.form-close, .modal-header .close, .modal-header [data-dismiss="modal"]');
    if (btn) { clickOnce(btn); return true; }
    return false;
  }

  // بحث داخل مودال الاختيار الحالي (يخدم حالة وجود ترقيم صفحات: الكود المطلوب
  // قد يكون في صفحة تالية). يرجع true لو أمكن تنفيذ البحث.
  async function searchInLookupModal(lookupModal, term) {
    if (!lookupModal || !term) return false;
    const docs = [lookupModal];
    lookupModal.querySelectorAll('iframe').forEach(f => {
      try { const d = f.contentDocument; if (d) docs.push(d); } catch(_) {}
    });
    let input = null;
    for (const d of docs) {
      const candidates = Array.from(d.querySelectorAll('input[placeholder*="Search"], input[type="search"], .entitylist-search input'));
      input = candidates.find(i => i.offsetParent !== null) || null;
      if (input) break;
    }
    if (!input) return false;
    const clean = String(term).replace(/\*/g, '');
    try { input.focus(); } catch(_) {}
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    try { desc.set.call(input, clean); } catch(_) { input.value = clean; }
    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
    try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
    await sleep(300);
    const btn = input.closest('.input-group')?.querySelector('button')
      || input.parentElement?.parentElement?.querySelector('button');
    if (btn) clickOnce(btn);
    ['keydown', 'keypress', 'keyup'].forEach(ev => {
      try { input.dispatchEvent(new KeyboardEvent(ev, { key: 'Enter', keyCode: 13, which: 13, bubbles: true })); } catch(_) {}
    });
    await sleep(1500);
    return true;
  }

  async function handleSubgridIframeModal(btnRegex, targetName, pickRandomIfTargetMissing = true, excludePattern = null, priorityPattern = null) {
    log('[subgrid build 2026-10-19.10] search-in-lookup fallback + available list on no-match');
    const addBtn = Array.from(document.querySelectorAll('a, button, input[type="button"]'))
      .filter(b => b.offsetParent !== null)
      .find(b => btnRegex.test((b.innerText || b.title || b.value || '').trim()));

    if (!addBtn) return { ok: false, reason: 'add-btn-not-found' };

    log(`Opening subgrid modal for: ${btnRegex.source}...`);
    // نقرة واحدة فقط: النقر المزدوج على زر الإضافة قد يفتح/يغلق النموذج فورًا.
    clickOnce(addBtn);

    // انتظر **مودال النموذج** ثم الـ iframe الذي بداخله تحديدًا.
    // (الاعتماد على أول iframe مرئي في الصفحة كان يلتقط iframe آخر عند وجود أكثر من واحد.)
    let formModal = null, iframeDoc = null, targetIframe = null, lookupBtn = null;

    for (let i = 0; i < 40; i++) {
      await sleep(400);
      formModal = Array.from(document.querySelectorAll('.modal.in, section.modal.in')).find(m => m.querySelector('iframe'));
      if (!formModal) continue;
      targetIframe = formModal.querySelector('iframe');
      if (!targetIframe) continue;
      try { iframeDoc = targetIframe.contentDocument || targetIframe.contentWindow?.document; } catch(_) { iframeDoc = null; }
      if (!iframeDoc || !iframeDoc.body) continue;
      lookupBtn = iframeDoc.querySelector('button.launchentitylookup');
      const selectEl = iframeDoc.querySelector('select:not([disabled])');
      if ((lookupBtn && lookupBtn.offsetParent !== null) || (selectEl && selectEl.offsetParent !== null)) break;
    }

    if (!iframeDoc) {
      warn('handleSubgridIframeModal: form iframe not found');
      closeFormModal(formModal);
      return { ok: false, reason: 'form-modal-not-found' };
    }
    
    let selectedName = targetName || 'Selected Item';
    const cleanTarget = targetName ? targetName.replace(/\*/g, '') : null;
    
    if (lookupBtn && lookupBtn.offsetParent !== null) {
      log('Waiting 3s for iframe events to bind...');
      await sleep(3000);
      if (targetIframe && targetIframe.contentDocument) {
        iframeDoc = targetIframe.contentDocument;
        lookupBtn = iframeDoc.querySelector('button.launchentitylookup') || lookupBtn;
      }
      
      function collectDocs(root) {
        const docs = [root];
        root.querySelectorAll('iframe').forEach(f => {
          try { const d = f.contentDocument || f.contentWindow?.document; if (d) docs.push(d); } catch(_) {}
        });
        return docs;
      }
      function getRowsFromDocs(docs) {
        const results = [];
        docs.forEach(doc => {
          if (!doc) return;
          const rws = doc.querySelectorAll('table tbody tr, div[role="grid"] tr');
          rws.forEach(r => {
            if (r.offsetParent !== null && r.innerText.trim() && !/norecords|لا توجد/i.test(r.innerText.replace(/\s/g,''))) results.push(r);
          });
        });
        return [...new Set(results)];
      }

      // ── افتح مودال الاختيار بنقرة **واحدة** وانتظر ظهوره فعليًا ──
      // (النقر المزدوج كان يفتحه ثم يغلقه، فيبدو للمستخدم أنه «يفتح ويُقفل» فورًا)
      let lookupModal = null;
      for (let attempt = 0; attempt < 3 && !lookupModal; attempt++) {
        if (attempt > 0) {
          log(`Retry #${attempt}: opening lookup again...`);
          closeLookupModalOnly(iframeDoc);
          await sleep(800);
          lookupBtn = iframeDoc.querySelector('button.launchentitylookup') || lookupBtn;
        }
        try { lookupBtn.focus(); } catch(_) {}
        clickOnce(lookupBtn);
        const openDeadline = Date.now() + 8000;
        while (Date.now() < openDeadline) {
          lookupModal = findOpenLookupModal(iframeDoc);
          if (lookupModal) break;
          await sleep(300);
        }
      }

      if (!lookupModal) {
        warn('Lookup modal did not open — aborting');
        closeFormModal(formModal);
        return { ok: false, reason: 'lookup-not-opened' };
      }
      log('Lookup modal opened.');

      // ── الصفوف من مودال الاختيار **فقط** ──
      // (كان يمسح كل جداول الصفحة الرئيسية أيضًا فيلتقط صفوف الشبكات ويظنها نتائج بحث)
      let items = [];
      for (let j = 0; j < 20; j++) {
        items = getRowsFromDocs(collectDocs(lookupModal));
        if (items.length > 0) break;
        await sleep(300);
      }
      // قائمة ما تعرضه البوابة فعلًا (قبل استبعاد أي صفوف) — تُعاد للمستخدم عند الفشل
      const rawItems = items.slice();

      // Filter out excluded patterns (e.g. ترصيد for problems)
      if (excludePattern && items.length) {
        const before = items.length;
        items = items.filter(i => !excludePattern.test(i.innerText));
        if (items.length < before) log(`Filtered out ${before - items.length} items matching exclude pattern`);
      }
      log(`Found ${items.length} usable items after lookup.`);
      
      if (items.length) {
        let priorityMatch = null;
        if (priorityPattern) {
          priorityMatch = items.find(i => priorityPattern.test(i.innerText));
          if (priorityMatch) log('Priority match found: "' + priorityMatch.innerText.trim().slice(0,60) + '"');
        }

        let exactMatch = priorityMatch;
        if (!exactMatch && cleanTarget) {
          if (/تركيب/.test(cleanTarget)) {
            exactMatch = items.find(i => /تركيب وتشغيل/i.test(i.innerText)) || items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
          } else {
            exactMatch = items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase()));
          }
        }

        // الكود غير موجود في الصفحة الحالية من النتائج → ابحث به داخل المودال
        // (يعالج ترقيم الصفحات: الصف المطلوب قد يكون في صفحة تالية)
        if (!exactMatch && cleanTarget) {
          log(`"${cleanTarget}" not in current page of results — searching inside the lookup...`);
          const searched = await searchInLookupModal(lookupModal, cleanTarget);
          if (searched) {
            let after = [];
            for (let k = 0; k < 15; k++) {
              after = getRowsFromDocs(collectDocs(lookupModal));
              if (after.length) break;
              await sleep(400);
            }
            if (excludePattern && after.length) after = after.filter(i => !excludePattern.test(i.innerText));
            if (after.length) {
              items = after;
              exactMatch = items.find(i => i.innerText.toLowerCase().includes(cleanTarget.toLowerCase())) || null;
              log(`After search: ${items.length} rows, match=${!!exactMatch}`);
            }
          }
        }
        
        const rand = exactMatch || (pickRandomIfTargetMissing ? items[Math.floor(Math.random() * items.length)] : null);
        
        if (!rand) {
          log('No match for "' + cleanTarget + '" in ' + items.length + ' items — skipping');
          const available = rawItems
            .map(i => (i.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70))
            .filter(Boolean)
            .slice(0, 12);
          closeLookupModalOnly(iframeDoc);
          await sleep(600);
          closeFormModal(formModal);
          return { ok: false, reason: 'no-match', available };
        }
        
        selectedName = rand.innerText.trim();
        const rowSelected = await selectLookupRow(rand);
        await sleep(600);
        if (rowSelected === false) {
          log('Subgrid row did not get selected — aborting (avoid false success)');
          closeLookupModalOnly(iframeDoc);
          await sleep(600);
          closeFormModal(formModal);
          return { ok: false, reason: 'row-not-selected' };
        }
        
        log(`Selected: ${selectedName.slice(0, 50)}, clicking اختر...`);
        // زر «اختر» يُبحث عنه داخل مودال الاختيار فقط (لا في الصفحة الرئيسية)
        const lookupDocs = [...new Set([...collectDocs(lookupModal), iframeDoc])];
        let selBtn = null;
        for (const d of lookupDocs) {
          if (!d) continue;
          const found = Array.from(d.querySelectorAll('button.btn-primary, input.btn-primary, input[value="اختر"], input[value="Select"], button[aria-label="Select"], button[aria-label*="اختر"]')).filter(b => b.offsetParent !== null && !b.disabled);
          if (found.length) { selBtn = found[found.length - 1]; break; }
        }
        if (!selBtn) {
          for (const d of lookupDocs) {
            if (!d) continue;
            const modalClose = Array.from(d.querySelectorAll('[data-dismiss="modal"]')).find(b => b.offsetParent !== null && !b.disabled && /اختر|select/i.test(b.innerText));
            if (modalClose) { selBtn = modalClose; break; }
          }
        }
        if (selBtn) {
          try { selBtn.focus(); } catch(_) {}
          clickOnce(selBtn);
        } else {
          log('Select button not found/disabled after row selection — aborting (avoid false success)');
          closeLookupModalOnly(iframeDoc);
          await sleep(600);
          closeFormModal(formModal);
          return { ok: false, reason: 'select-btn-not-found' };
        }
        await sleep(1500);

        // تحقق أن الحقل المستهدف امتلأ فعلًا بعد «اختر» (بدل افتراض النجاح)
        let targetInput = null;
        try { targetInput = lookupBtn.closest('.input-group')?.querySelector('input') || null; } catch(_) {}
        const filled = targetInput ? (targetInput.value || '').trim() : '';
        log(`Lookup target value after Select: "${filled}"`);
        if (targetInput && !filled) {
          warn('Target field still empty after Select — aborting');
          closeLookupModalOnly(iframeDoc);
          await sleep(600);
          closeFormModal(formModal);
          return { ok: false, reason: 'field-not-filled' };
        }
      } else {
        log('No items found in lookup — closing lookup modal only.');
        closeLookupModalOnly(iframeDoc);
        await sleep(600);
        closeFormModal(formModal);
        return { ok: false, reason: 'no-items' };
      }
    } else {
      const selectEl = iframeDoc.querySelector('select');
      if (selectEl && selectEl.offsetParent !== null) {
        const opts = Array.from(selectEl.options).filter(o => o.value);
        const exactMatch = cleanTarget ? opts.find(o => o.text.includes(cleanTarget)) : null;
        const rand = exactMatch || (pickRandomIfTargetMissing ? opts[Math.floor(Math.random() * opts.length)] : opts[0]);
        if (rand) { selectEl.value = rand.value; selectedName = rand.text; try { selectEl.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
      }
    }
    
    log('Clicking Save on primary modal...');
    const subBtn = iframeDoc.getElementById('InsertButton') || iframeDoc.getElementById('SubmitButton') || Array.from(iframeDoc.querySelectorAll('input[type="submit"], button.btn-primary, input[type="button"]')).find(b => b.offsetParent !== null && !b.disabled && /save|submit|حفظ|insert/i.test(b.innerText || b.value || b.title));
    if (subBtn) {
      clickOnce(subBtn);
      log('Waiting for primary modal to close...');
      let closed = false;
      const startClose = Date.now();
      while (Date.now() - startClose < 15000) {
        if ((targetIframe && targetIframe.offsetParent === null) || !document.body.contains(targetIframe)) { closed = true; log('Primary modal closed.'); break; }
        await sleep(500);
      }
      await sleep(1500);
      if (!closed) {
        warn('Subgrid save did not close the modal — treating as failure');
        return { ok: false, reason: 'save-not-confirmed', name: selectedName };
      }
      return { ok: true, name: selectedName };
    }
    return { ok: false, reason: 'save-btn-not-found' };
  }

  // Export to namespace and global scope for 100% backward compatibility
  const Lookups = {
    findSafeLookupButton,
    dispatchClickSequence,
    clickOnce,
    selectLookupRow,
    findModalSaveButton,
    waitForModalCloseIfOpen,
    waitForModalIframe,
    fillLookupModal,
    handlePage2Modal,
    fillPowerAppsLookup,
    waitForModalStable,
    handleSubgridIframeModal,
    extractAndSaveTechnicians
  };

  window.AutoFillEngine.Lookups = Lookups;
  Object.assign(window, Lookups);

})(window);
