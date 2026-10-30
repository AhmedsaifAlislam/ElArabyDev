// P0-B.1 + P0-B.2 functional validation — executes the REAL patched functions
// extracted verbatim from src/unified-extension/content-script.js (no reimplementation).
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'unified-extension', 'content-script.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? '  -> ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); }
}
function extract(fnName, startMark, endMark) {
  const s = SRC.indexOf(startMark);
  const e = SRC.indexOf(endMark, s);
  if (s < 0 || e < 0) throw new Error(`extract failed for ${fnName}`);
  return SRC.slice(s, e);
}
function build(fnName, fnSrc, stubs) {
  const names = Object.keys(stubs).join(',');
  // eslint-disable-next-line no-new-func
  const factory = new Function(names, `'use strict';\n${fnSrc}\n; return ${fnName};`);
  return factory(...Object.keys(stubs).map(k => stubs[k]));
}

console.log('=== Extracting real patched functions from source ===');
const parseDataLineSrc = extract('parseDataLine', 'function parseDataLine(line)', '// ── Check if Page 1 fields');
const fillLookupModalSrc = extract('fillLookupModal', 'async function fillLookupModal(', '// ── Modal guard');
const handlePage2ModalSrc = extract('handlePage2Modal', 'async function handlePage2Modal(', 'async function fillPowerAppsLookup');
const selectTechSrc = extract('selectRandomTechnician', 'async function selectRandomTechnician(', 'function getProblemCode');

// Status-fill inner closure (P0-B.2 site) extracted from executePage1_Review
const stStart = SRC.indexOf("FR.status = await fillAndVerify('Status'");
const innerStart = SRC.indexOf('async () => {', stStart) + 'async () => {'.length;
const innerEnd = SRC.indexOf(', createInputVerifier', innerStart);
let statusBody = SRC.slice(innerStart, innerEnd).trim();
if (statusBody.endsWith('}')) statusBody = statusBody.slice(0, -1); // drop closure brace
const statusFillFactory = new Function('data', 'cfg', 'ctx', `
  'use strict';
  const { findFirst, findFieldByLabel, emulateUserInput } = ctx;
  return (async () => { ${statusBody} \n})();`);
console.log(`extracted: parseDataLine(${parseDataLineSrc.length}B), fillLookupModal(${fillLookupModalSrc.length}B), handlePage2Modal(${handlePage2ModalSrc.length}B), selectRandomTechnician(${selectTechSrc.length}B), statusFill(${statusBody.length}B)\n`);

const baseStubs = {
  log: () => {}, warn: () => {}, err: () => {}, sysLog: () => {},
  sleep: async () => {}, CFG: { lookupModalItem: ['.row-x'], lookupSearchInput: ['.search-x'] },
  document: { querySelector: () => null, querySelectorAll: () => [], body: { contains: () => false } },
};

(async () => {
  console.log('--- P0-B.1a: parseDataLine extracts technician fields ---');
  const pdl = build('parseDataLine', parseDataLineSrc, baseStubs);
  const r1 = pdl('orderid: CAS123456789 | brand: Samsung | technician: Ahmed Ali | TechnicianName: Ahmed Ali Mahmoud | status: Inside');
  check('EN keys parsed', r1.technician === 'Ahmed Ali' && r1.technicianName === 'Ahmed Ali Mahmoud',
    `tech="${r1.technician}" techName="${r1.technicianName}"`);
  const r2 = pdl('الموديل: نوفستر | الفني: محمود سمير | اسم الفنى: محمود سمير علي');
  check('AR aliases parsed', r2.technician === 'محمود سمير' && r2.technicianName === 'محمود سمير علي',
    `tech="${r2.technician}" techName="${r2.technicianName}"`);
  const r3 = pdl('orderid: CAS999 | model: X');
  check('absent => empty strings (not crash)', r3.technician === '' && r3.technicianName === '');
  const r4 = pdl('orderid: CAS888 | model2: Y | date: 01/02/2024 | date2: 05/02/2024 | technician: F1');
  check('existing fields untouched (regression)', r4.orderId === 'CAS888' && r4.model2 === 'Y' && r4.date === '05/02/2024' && r4.technician === 'F1');

  console.log('\n--- P0-B.2: Page1 warranty selection ---');
  const fakeSel = () => ({
    tagName: 'SELECT', value: '', selectedIndex: -1,
    options: [
      { value: '753240000', text: 'داخل الضمان' },
      { value: '753240001', text: 'خارج الضمان' },
      { value: '753240002', text: 'تمديد الضمان' },
    ],
  });
  const mkCtx = (sel) => ({ findFirst: () => sel, findFieldByLabel: () => sel, emulateUserInput: async (el, v) => { el.value = v; return true; } });

  let sel = fakeSel();
  let rs = await statusFillFactory({ status: 'داخل الضمان' }, {}, mkCtx(sel));
  check('exact valid mapping works', rs.ok === true && sel.value === '753240000', `selected="${rs.selected}"`);

  sel = fakeSel();
  rs = await statusFillFactory({ status: 'خارج' }, {}, mkCtx(sel));
  check('partial valid mapping preserved', rs.ok === true && sel.value === '753240001', `selected="${rs.selected}"`);

  sel = fakeSel();
  rs = await statusFillFactory({ status: 'صيانة دورية' }, {}, mkCtx(sel));
  check('invalid status => explicit failure, NOTHING selected', rs && rs.ok === false && sel.value === '', `value="${sel.value}"`);

  console.log('\n--- P0-B.1b: selectRandomTechnician deterministic guard ---');
  const h2mCalls = [];
  const techStubs = (labOpts) => ({
    ...baseStubs,
    hasExistingSubgridRow: async () => false,
    handlePage2Modal: async (re, sv, opts) => { h2mCalls.push({ sv, opts }); return { ok: false, reason: 'stub-no-modal' }; },
    findFieldByLabel: () => (labOpts ? { tagName: 'SELECT', value: '', options: labOpts.map(t => ({ value: 'V_' + t, text: t })) } : null),
    findSafeLookupButton: () => null,
    emulateUserInput: async (el, v) => { el.value = v; return true; },
  });
  let st = build('selectRandomTechnician', selectTechSrc, techStubs(null));
  let rt = await st(null);
  check('null target => explicit fail, modal never opened', rt.ok === false && rt.reason === 'technician-not-specified' && h2mCalls.length === 0);

  h2mCalls.length = 0;
  st = build('selectRandomTechnician', selectTechSrc, techStubs(['  محمد  علي  ', 'سيد إبراهيم']));
  rt = await st('محمد علي');
  check('strictExact flag forwarded to handlePage2Modal', h2mCalls.length === 1 && h2mCalls[0].sv === 'محمد علي' && h2mCalls[0].opts && h2mCalls[0].opts.strictExact === true);
  check('SELECT exact (whitespace-normalized) selects ONLY that option', rt.ok === true && rt.name === '  محمد  علي  ');

  h2mCalls.length = 0;
  st = build('selectRandomTechnician', selectTechSrc, techStubs(['محمد علي أحمد']));
  rt = await st('محمد علي');
  check('partial name does NOT match any option (was: silent wrong pick)', rt.ok === false && rt.reason === 'technician-not-found');

  console.log('\n--- P0-B.1c: opts passthrough handlePage2Modal -> fillLookupModal ---');
  {
    const captured = [];
    const docStub = {
      querySelector: () => ({ offsetParent: {}, querySelector: () => null }),           // modal
      querySelectorAll: () => [{ offsetParent: {}, innerText: 'إضافة فني' }],           // add button
      body: { contains: () => false },
    };
    const hmStubs = {
      ...baseStubs, document: docStub,
      waitForModalCloseIfOpen: async () => true,
      safeClick: () => {},
      waitForModalIframe: async () => ({ iframe: {}, iframeDoc: { getElementById: () => ({ click() {} }), querySelector: () => ({ offsetParent: {} }) } }),
      fillLookupModal: async (btn, sv, rd, opts) => { captured.push(opts); return { ok: true, selected: 'Y' }; },
    };
    const hm = build('handlePage2Modal', handlePage2ModalSrc, hmStubs);
    const rh = await hm(/إضافة فني|Add.*Tech/i, 'TECH_A');
    if (!(rh.ok === true)) console.log('  [diag] handlePage2Modal returned:', JSON.stringify(rh));
    check('opts reaches fillLookupModal (default {} harmless)', rh.ok === true && captured.length === 1 && captured[0] && typeof captured[0] === 'object' && !('strictExact' in captured[0]));
  }

  console.log('\n--- P0-B.1d: fillLookupModal strictExact semantics (real picker) ---');
  const row = (txt) => ({ offsetParent: {}, innerText: txt, querySelector: () => null });
  const flmStubs = (rows) => ({
    ...baseStubs,
    waitForModalStable: async () => true,
    dispatchClickSequence: async () => {},
    emulateUserInput: async () => {},
    document: baseStubs.document,
  });
  const mkFlm = (rows, rootRows) => build('fillLookupModal', fillLookupModalSrc, {
    ...flmStubs(rows),
    // rootDoc.querySelectorAll drives both item discovery and search inputs
  });
  const rootDocFor = (rows) => ({ querySelectorAll: (selp) => (selp.includes('input') ? [] : rows) });

  // exact-only environment
  let flm = build('fillLookupModal', fillLookupModalSrc, flmStubs());
  let rf = await flm({ click() {} }, 'Ahmed Ali', rootDocFor([row('AHMED ALI _ senior tech')]), { strictExact: true });
  check('strictExact: exact row picked', rf.ok === true && /AHMED ALI/.test(rf.selected || ''), `picked="${(rf.selected || '').slice(0, 30)}"`);

  rf = await flm({ click() {} }, 'Ahmed Ali', rootDocFor([row('AHMED ALI MAHMOUD _ tech')]), { strictExact: true });
  check('strictExact: starts-with lookalike REJECTED (was: silent wrong pick)', rf.ok === false && rf.reason === 'no-exact-match');

  rf = await flm({ click() {} }, 'AHMED ALI-2', rootDocFor([row('AHMED ALI-2 EXT')]), {});
  check('legacy callers unaffected: starts-with still accepted without opts', rf.ok === true, `picked="${(rf.selected || '').slice(0, 30)}"`);

  console.log(`\n================ RESULT: ${pass} PASS / ${fail} FAIL ================`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
