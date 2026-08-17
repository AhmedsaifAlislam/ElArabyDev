// content/second-visit.js — Content Script مستقل لـ "زيارة تانية"
// Logic: queue → Page 1 (fake data) → Force Page 2 → Page 3 (subFault matching)
// متوافق مع secondVisitProfiles.json + popup.js (START_SECOND_VISIT_QUEUE)

(function () {
  'use strict';

  if (window.__ElArabySecondVisitLoaded) return;
  window.__ElArabySecondVisitLoaded = true;

  const MESSAGE_ACTIONS = {
    START_SECOND_VISIT_QUEUE: 'START_SECOND_VISIT_QUEUE',
    SECOND_VISIT_STATUS: 'SECOND_VISIT_STATUS',
    SECOND_VISIT_PROGRESS: 'SECOND_VISIT_PROGRESS',
    SECOND_VISIT_COMPLETE: 'SECOND_VISIT_COMPLETE',
    SECOND_VISIT_ERROR: 'SECOND_VISIT_ERROR'
  };

  const PAGE_STATES = {
    IDLE: 'idle',
    PAGE1_FAKE_DATA: 'page1_fake_data',
    PAGE2_FORCE: 'page2_force',
    PAGE3_SUBFAULT_MATCH: 'page3_subfault_match',
    COMPLETE: 'complete',
    ERROR: 'error'
  };

  let currentState = PAGE_STATES.IDLE;
  let currentQueue = [];
  let currentQueueIndex = 0;
  let isProcessing = false;

  function log(level, message, data) {
    console[level]('[SecondVisit] ' + message, data || {});
  }

  function sendToBackground(action, payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(Object.assign({ action }, payload || {}), (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response);
      });
    });
  }

  function setState(newState) {
    currentState = newState;
    log('log', 'State: ' + newState);
    sendToBackground(MESSAGE_ACTIONS.SECOND_VISIT_STATUS, { state: newState });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function loadProfiles() {
    try {
      const url = chrome.runtime.getURL('secondVisitProfiles.json');
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('profiles fetch failed');
      return await resp.json();
    } catch (e) {
      log('error', 'loadProfiles failed', e);
      return null;
    }
  }

  function getAllDocuments() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument) docs.push(iframe.contentDocument);
      } catch (e) { /* cross-origin */ }
    });
    return docs;
  }

  function findInAllFrames(selectors) {
    for (const doc of getAllDocuments()) {
      for (const selector of selectors) {
        try {
          const el = doc.querySelector(selector);
          if (el) return el;
        } catch (e) { /* invalid selector */ }
      }
    }
    return null;
  }

  function setInputValue(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function broadcastProgress(step, details) {
    sendToBackground(MESSAGE_ACTIONS.SECOND_VISIT_PROGRESS, {
      step: step,
      queueIndex: currentQueueIndex,
      total: currentQueue.length,
      details: details || {}
    });
  }

  async function clickNext() {
    const nextSelectors = [
      'button:contains("التالي")',
      'button:contains("متابعة")',
      'button:contains("Next")',
      'input[value*="التالي"]',
      'button[type="submit"]'
    ];
    const el = findInAllFrames(nextSelectors);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  async function handlePage1FakeData(profile) {
    broadcastProgress('page1_start', { profileId: profile.id });
    const fake = profile.fakeData || {
      customerName: 'عميل تجريبي',
      phoneNumber: '01000000000',
      address: 'عنوان تجريبي',
      notes: 'زيارة تانية - بيانات وهمية'
    };
    const selectors = {
      customerName: ['input[name*="customer"]', 'input[id*="customer"]'],
      phoneNumber: ['input[name*="phone"]', 'input[id*="phone"]'],
      address: ['textarea[name*="address"]', 'input[name*="address"]'],
      notes: ['textarea[name*="note"]', 'textarea[id*="note"]']
    };
    for (const field of Object.keys(selectors)) {
      const el = findInAllFrames(selectors[field]);
      if (el && fake[field]) setInputValue(el, fake[field]);
    }
    await clickNext();
    broadcastProgress('page1_done');
  }

  async function handlePage2Force() {
    broadcastProgress('page2_start');
    const forceSelectors = [
      'button:contains("Force")',
      'input[value*="Force"]',
      'label:contains("Force")',
      '[data-role*="force"]',
      'button:contains("إجبار")'
    ];
    const el = findInAllFrames(forceSelectors);
    if (el) {
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.checked = true;
      } else {
        el.click();
      }
      await sleep(300);
    }
    await clickNext();
    broadcastProgress('page2_done');
  }

  async function handlePage3SubFaultMatch(profile) {
    broadcastProgress('page3_start');
    const subFaults = profile.subFaults || [];
    if (subFaults.length) {
      const first = subFaults[0];
      const sel = findInAllFrames([
        'select[name*="subfault"]',
        'select[id*="subfault"]',
        '[data-field*="subfault"] select'
      ]);
      if (sel) setInputValue(sel, first.code || first.name || first);
    }
    const saveBtn = findInAllFrames([
      'button:contains("حفظ")',
      'button:contains("إرسال")',
      'button[type="submit"]'
    ]);
    if (saveBtn) saveBtn.click();
    broadcastProgress('page3_done');
  }

  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const profiles = await loadProfiles();
      if (!profiles || !profiles.length) {
        sendToBackground(MESSAGE_ACTIONS.SECOND_VISIT_ERROR, { error: 'لا توجد ملفات تعريف' });
        return;
      }
      currentQueue = profiles;
      for (let i = 0; i < profiles.length; i++) {
        currentQueueIndex = i;
        const profile = profiles[i];
        setState(PAGE_STATES.PAGE1_FAKE_DATA);
        await handlePage1FakeData(profile);
        await sleep(800);
        setState(PAGE_STATES.PAGE2_FORCE);
        await handlePage2Force();
        await sleep(800);
        setState(PAGE_STATES.PAGE3_SUBFAULT_MATCH);
        await handlePage3SubFaultMatch(profile);
        await sleep(500);
      }
      setState(PAGE_STATES.COMPLETE);
      sendToBackground(MESSAGE_ACTIONS.SECOND_VISIT_COMPLETE, { total: profiles.length });
    } catch (e) {
      setState(PAGE_STATES.ERROR);
      sendToBackground(MESSAGE_ACTIONS.SECOND_VISIT_ERROR, { error: e.message });
    } finally {
      isProcessing = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === MESSAGE_ACTIONS.START_SECOND_VISIT_QUEUE) {
      processQueue();
      sendResponse({ ok: true });
      return true;
    }
  });

  log('log', '✅ Second Visit content script loaded');
})();