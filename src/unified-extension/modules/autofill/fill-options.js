// =========================================================
// fill-options.js — Task Formulation & Profile Selection
// Component: Auto-Fill Options & Conditional Inputs Subsystem
// =========================================================
'use strict';

(() => {
  let svProfiles = null;

  function getElements() {
    return {
      chkDrain: document.getElementById('chk-force-drain-cleaning'),
      chkOverwrite: document.getElementById('chk-force-overwrite'),
      chkSecondVisit: document.getElementById('chk-second-visit'),
      chkMasaha: document.getElementById('chk-masaha'),
      chkShahn: document.getElementById('chk-shahn'),
      svProductType: document.getElementById('sv-product-type'),
      masahaProductType: document.getElementById('masaha-product-type'),
      wrapShahn: document.getElementById('wrap-shahn'),
      wrapSvProductType: document.getElementById('wrap-sv-product-type'),
      wrapMasahaProductType: document.getElementById('wrap-masaha-product-type')
    };
  }

  function syncConditionalInputs() {
    const el = getElements();
    const svActive = el.chkSecondVisit?.checked || false;
    if (el.wrapSvProductType) el.wrapSvProductType.style.display = svActive ? 'flex' : 'none';
    if (el.svProductType) el.svProductType.style.display = svActive ? '' : 'none';
    if (!svActive && el.svProductType) el.svProductType.value = '';

    const masahaActive = el.chkMasaha?.checked || false;
    if (el.wrapMasahaProductType) el.wrapMasahaProductType.style.display = masahaActive ? 'flex' : 'none';
    if (el.masahaProductType) el.masahaProductType.style.display = masahaActive ? '' : 'none';
    if (!masahaActive && el.masahaProductType) el.masahaProductType.value = '';

    const drainActive = el.chkDrain?.checked || false;
    if (el.wrapShahn) el.wrapShahn.style.display = drainActive ? 'flex' : 'none';
    if (!drainActive && el.chkShahn) {
      el.chkShahn.value = 'no';
    }
  }

  async function loadSvProfiles() {
    if (svProfiles) return svProfiles;
    try {
      const resp = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
      svProfiles = await resp.json();
      return svProfiles;
    } catch(e) {
      console.error('Failed to load secondVisitProfiles.json', e);
      return null;
    }
  }

  function generateSecondVisitLine(orderId, productType, profiles) {
    if (!profiles || !productType) return `OrderId: ${orderId}`;
    const profile = profiles.profiles?.find(p => p.name === productType);
    if (!profile) return `OrderId: ${orderId}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = String(yesterday.getDate()).padStart(2, '0');
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const year = yesterday.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const p1 = profile.page1Defaults || {};
    const parts = [`OrderId: ${orderId}`];
    if (p1.brand) parts.push(`Brand: ${p1.brand}`);
    if (p1.model1) parts.push(`Model: ${p1.model1}`);
    if (p1.model2) parts.push(`Model2: ${p1.model2}`);
    parts.push(`Serial: ${p1.serial || '0'}`);
    if (p1.model2) parts.push(`Serial2: ${p1.serial2 || '0'}`);
    parts.push(`Status: ${profiles.defaultStatus || 'Out warranty'}`);
    if (profile.problemCode) parts.push(`ProblemCode: ${profile.problemCode}`);
    if (profile.faultSearch) parts.push(`FaultCode: ${profile.faultSearch}`);
    if (profile.subFault && profile.subFault !== 'first') parts.push(`SubFault: ${profile.subFault}`);
    parts.push(`Notes: ${profiles.defaultComment || 'زيارة ثانية قطع غيار'}`);
    parts.push(`Date: ${dateStr}`);
    return parts.join(' | ');
  }

  function generateMasahaLine(orderId, productType, profiles) {
    if (!profiles || !productType) return `OrderId: ${orderId}`;
    const profile = profiles.masahaProfiles?.find(p => p.name === productType);
    if (!profile) return `OrderId: ${orderId}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = String(yesterday.getDate()).padStart(2, '0');
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const year = yesterday.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const p1 = profile.page1Defaults || {};
    const parts = [`OrderId: ${orderId}`];
    if (p1.brand) parts.push(`Brand: ${p1.brand}`);
    if (p1.model1) parts.push(`Model: ${p1.model1}`);
    if (p1.model2) parts.push(`Model2: ${p1.model2}`);
    parts.push(`Serial: ${p1.serial || '0'}`);
    if (p1.model2) parts.push(`Serial2: ${p1.serial2 || '0'}`);
    parts.push(`Status: ${profiles.defaultStatus || 'Out warranty'}`);
    if (profile.problemCode) parts.push(`ProblemCode: ${profile.problemCode}`);
    if (profile.faultSearch) parts.push(`FaultCode: ${profile.faultSearch}`);
    if (profile.subFaultCode) parts.push(`SubFault: ${profile.subFaultCode}`);
    parts.push(`Notes: مساحة`);
    parts.push(`Date: ${dateStr}`);
    return parts.join(' | ');
  }

  function getOptionsState() {
    const el = getElements();
    return {
      forceDrainCleaning: el.chkDrain?.checked || false,
      shahnEnabled: el.chkShahn?.value === 'yes',
      forceOverwrite: el.chkOverwrite?.checked || false,
      isSecondVisit: el.chkSecondVisit?.checked || false,
      isMasaha: el.chkMasaha?.checked || false,
      productType: el.svProductType?.value || '',
      masahaProdType: el.masahaProductType?.value || ''
    };
  }

  function initFillOptions() {
    const el = getElements();

    // Mutual exclusion between Second Visit and Masaha
    el.chkSecondVisit?.addEventListener('change', () => {
      if (el.chkSecondVisit.checked && el.chkMasaha?.checked) {
        el.chkMasaha.checked = false;
      }
      syncConditionalInputs();
    });

    el.chkMasaha?.addEventListener('change', () => {
      if (el.chkMasaha.checked && el.chkSecondVisit?.checked) {
        el.chkSecondVisit.checked = false;
      }
      syncConditionalInputs();
    });

    el.chkDrain?.addEventListener('change', () => {
      syncConditionalInputs();
    });

    // Initial sync
    syncConditionalInputs();
  }

  function createTask({ orderId, baseLine = '', options = {}, profiles = null, taskId = null }) {
    taskId = taskId || ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
    const mode = options.isMasaha ? 'masaha' : (options.isSecondVisit ? 'second_visit' : 'normal');

    let finalLine = baseLine || `OrderId: ${orderId}`;
    let structuredPayload = null;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = String(yesterday.getDate()).padStart(2, '0');
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const year = yesterday.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    if (mode === 'second_visit') {
      const p = profiles?.profiles?.find(item => item.name === options.productType);
      if (p) {
        finalLine = generateSecondVisitLine(orderId, options.productType, profiles);
        structuredPayload = {
          orderId,
          brand: p.page1Defaults?.brand || '',
          model: p.page1Defaults?.model1 || '',
          model2: p.page1Defaults?.model2 || '',
          serial: p.page1Defaults?.serial || '0',
          serial2: p.page1Defaults?.serial2 || '0',
          status: profiles.defaultStatus || 'Out warranty',
          date: dateStr,
          problemCode: p.problemCode || '',
          faultCode: p.faultSearch || '',
          subFaultCode: (p.subFault && p.subFault !== 'first') ? p.subFault : null,
          notes: profiles.defaultComment || 'زيارة ثانية قطع غيار'
        };
      }
    } else if (mode === 'masaha') {
      const p = profiles?.masahaProfiles?.find(item => item.name === options.masahaProdType);
      if (p) {
        finalLine = generateMasahaLine(orderId, options.masahaProdType, profiles);
        structuredPayload = {
          orderId,
          brand: p.page1Defaults?.brand || '',
          model: p.page1Defaults?.model1 || '',
          model2: p.page1Defaults?.model2 || '',
          serial: p.page1Defaults?.serial || '0',
          serial2: p.page1Defaults?.serial2 || '0',
          status: profiles.defaultStatus || 'Out warranty',
          date: dateStr,
          problemCode: p.problemCode || '',
          faultCode: p.faultSearch || '',
          subFaultCode: p.subFaultCode || null,
          notes: 'مساحة'
        };
      }
    }

    return {
      taskId,
      orderId,
      mode,
      productType: options.productType || options.masahaProdType || '',
      line: finalLine,
      data: {
        forceDrainCleaning: !!options.forceDrainCleaning,
        shahnEnabled: !!options.shahnEnabled,
        forceOverwrite: !!options.forceOverwrite,
        secondVisitMode: mode === 'second_visit',
        masahaMode: mode === 'masaha'
      },
      payload: structuredPayload
    };
  }

  window.FillOptions = {
    init: initFillOptions,
    syncConditionalInputs,
    getOptionsState,
    loadSvProfiles,
    generateSecondVisitLine,
    generateMasahaLine,
    createTask
  };
})();
