'use strict';
/**
 * unification-smoke.js — اختبار انحدار وقت-تشغيل مصغّر
 * ------------------------------------------------------------------
 * يهدف لإثبات عقد «الموجة 3» (التوحيد) فعليًا وقت التشغيل — وليس النحو فقط:
 *   1) shared/portal-selectors.js هو المصدر الوحيد ويُصدّر الدوال الأربع.
 *   2) سلوك الدوال صحيح (findFirst / generateTaskId / parseDataLine / loadSelectors).
 *   3) تحميل المُستهلك (engine-orchestrator.js) لا يُلغي window.generateTaskId
 *      ولا يُنتج حلقة ذاتية لا نهائية (الخلل الذي أُصلح).
 *   4) لا يوجد تصدير ذاتي للدوال المشتركة إلى window في الملفات المستهلكة.
 *
 * يُشغّل الملفات الحقيقية من src/unified-extension داخل vm مع محاكاة chrome/DOM.
 * التشغيل:  node tools/tests/unification-smoke.js
 * exit code: 0 = كل الفحوصات نجحت.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..', '..', 'src', 'unified-extension');
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; failures.push(label); console.log('  [FAIL] ' + label); }
}

// ── Minimal browser mocks ────────────────────────────────────────────────────
class HTMLElement {}

function makeEnv() {
  const registry = new Map(); // selector -> element
  const el = (sel) => { const e = new HTMLElement(); registry.set(sel, e); return e; };

  const documentStub = {
    querySelector(sel) { return registry.get(sel) || null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
    createElement() { return new HTMLElement(); }
  };

  const localStorageStub = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };

  const chromeStub = {
    runtime: {
      id: 'test-extension-id',
      getURL: (p) => 'chrome-extension://test-extension-id/' + p,
      onMessage: { addListener() {} },
      sendMessage: async () => ({})
    },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener() {} }
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    HTMLElement,
    document: documentStub,
    localStorage: localStorageStub,
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { href: 'https://example.test/orders' },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'test' },
    chrome: chromeStub,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    // needed by content-script.js (classic script, no IIFE)
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    Event: class Event { constructor(t) { this.type = t; } },
    CustomEvent: class CustomEvent { constructor(t, o) { Object.assign(this, o || {}); this.type = t; } },
    KeyboardEvent: class KeyboardEvent { constructor(t, o) { Object.assign(this, o || {}); this.type = t; } },
    MouseEvent: class MouseEvent { constructor(t, o) { Object.assign(this, o || {}); this.type = t; } },
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLSelectElement: class HTMLSelectElement {},
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    fetch: async () => { throw new Error('no-network-in-test'); }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, registry, el };
}

function load(sandbox, file) {
  vm.runInContext(read(file), sandbox, { filename: file });
}

// ── Run ──────────────────────────────────────────────────────────────────────
(async function main() {
  console.log('\n=== Unification runtime smoke test ===\n');
  const { sandbox, registry, el } = makeEnv();

  // pre-register one DOM element to exercise findFirst()
  el('#ldv_serialnumber');

  console.log('-- 1) portal-selectors.js exports --');
  load(sandbox, 'shared/portal-selectors.js');
  ok(sandbox.window.__elarabyPortalSelectorsLoaded === true, 'load guard flag set');
  for (const fn of ['findFirst', 'generateTaskId', 'parseDataLine', 'loadSelectors']) {
    ok(typeof sandbox.window[fn] === 'function', 'window.' + fn + ' is a function');
  }
  const refGenerate = sandbox.window.generateTaskId;
  const refFindFirst = sandbox.window.findFirst;

  console.log('-- 2) behaviour --');
  const id1 = sandbox.window.generateTaskId();
  const id2 = sandbox.window.generateTaskId();
  ok(typeof id1 === 'string' && id1.startsWith('task-'), 'generateTaskId() -> task-...');
  ok(id1 !== id2, 'generateTaskId() yields unique ids');

  ok(sandbox.window.findFirst(['#does-not-exist', '#ldv_serialnumber']) === registry.get('#ldv_serialnumber'),
    'findFirst() returns first matching element');
  ok(sandbox.window.findFirst(['#nope']) === null, 'findFirst() -> null when nothing matches');

  const parsed = sandbox.window.parseDataLine('orderid:CAS1234567890|model:AC-500|serial:SN-9');
  ok(parsed.orderId === 'CAS1234567890', 'parseDataLine() orderId (' + parsed.orderId + ')');
  ok(parsed.model === 'AC-500', 'parseDataLine() model (' + parsed.model + ')');
  ok(parsed.serial === 'SN-9', 'parseDataLine() serial (' + parsed.serial + ')');
  ok(Object.keys(sandbox.window.parseDataLine('')).length === 0, 'parseDataLine() -> {} on empty input');

  const cfg = await sandbox.window.loadSelectors();
  ok(!!cfg && Array.isArray(cfg.serial) && cfg.serial.length > 0, 'loadSelectors() -> defaults with serial[]');
  ok(Array.isArray(cfg.nextBtn), 'loadSelectors() -> nextBtn[]');
  ok(sandbox.window._CFG === cfg, 'loadSelectors() caches into window._CFG');

  console.log('-- 3) consumer load does not clobber the single source --');
  load(sandbox, 'modules/autofill/engine-orchestrator.js');
  ok(!!(sandbox.window.AutoFillEngine && sandbox.window.AutoFillEngine.Orchestrator), 'Orchestrator registered');
  ok(sandbox.window.generateTaskId === refGenerate, 'window.generateTaskId NOT overwritten by orchestrator');
  ok(sandbox.window.findFirst === refFindFirst, 'window.findFirst NOT overwritten by orchestrator');

  console.log('-- 4) recursion guard (the real bug) --');
  let recId = null, recErr = null;
  try { recId = sandbox.window.AutoFillEngine.Orchestrator.generateTaskId(); }
  catch (e) { recErr = e; }
  ok(!recErr && typeof recId === 'string' && recId.startsWith('task-'),
    'Orchestrator.generateTaskId() returns without infinite recursion' + (recErr ? ' [' + recErr.message + ']' : ''));

  console.log('-- 5) static: no self-re-export of shared fns --');
  const targets = [
    'content-script.js',
    'modules/autofill/engine-orchestrator.js',
    'modules/autofill/engine-page1.js',
    'modules/autofill/autofill-client.js',
    'control-panel.js',
    'popup.js'
  ];
  const selfExport = /window\.(findFirst|loadSelectors|parseDataLine|generateTaskId)\s*=(?!=)/;
  for (const f of targets) {
    ok(!selfExport.test(read(f)), f + ': does not self-assign window.<shared fn>');
  }

  console.log('-- 6) regression: كل بلاغ = تبويب جديد (لا اختطاف للتبويب الحالي) --');
  const sentMessages = [];
  sandbox.chrome.runtime.sendMessage = async (m) => { sentMessages.push(m); return { ok: true }; };
  // نحاكي أننا واقفون على البوابة — وهو الشرط الذي كان يختطف التبويب الحالي
  sandbox.location.href = 'https://elarabyportalpfs.powerappsportals.com/en-US/WorkOrderReview/case-1';
  const hrefBefore = sandbox.location.href;

  await sandbox.window.AutoFillEngine.Orchestrator.startNextTask([
    { taskId: 'task-smoke-1', orderId: 'CAS0000001' }
  ]);
  const openTab = sentMessages.find((m) => m && m.type === 'OPEN_NEXT_TAB');
  ok(!!openTab, 'startNextTask() يُرسل OPEN_NEXT_TAB (يمنع علّة "لا تبويب جديد")');
  ok(!!openTab && /\/Orders\/?$/.test(openTab.url), 'OPEN_NEXT_TAB.url ينتهي بـ /Orders/ (' + (openTab && openTab.url) + ')');
  ok(sandbox.location.href === hrefBefore, 'startNextTask() لا يُغيّر التبويب الحالي (يبقى البلاغ مفتوحًا)');

  sentMessages.length = 0;
  await sandbox.window.AutoFillEngine.Orchestrator.startNextTask([]);
  ok(!sentMessages.some((m) => m && m.type === 'OPEN_NEXT_TAB'), 'startNextTask([]) لا يفتح تبويبًا');
  ok(sentMessages.some((m) => m && m.type === 'BATCH_DONE_STORAGE'), 'startNextTask([]) يُعلن BATCH_DONE_STORAGE');

  console.log('-- 7) static: لا يوجد فرع يختطف التبويب على البوابة --');
  ok(!/location\.href\.includes\(\s*['"]\.powerappsportals\.com['"]\s*\)/.test(read('modules/autofill/engine-orchestrator.js')),
    'engine-orchestrator.js: لا يوجد فرع (على البوابة) يعيد تحميل نفس التبويب');

  console.log('-- 8) regression: content-script.js لا يستولي على الدوال المشتركة --');
  // العلّة الحقيقية: function declaration في ملف عادي (بدون IIFE) تُسجَّل على window
  // فتستولي على نسخة portal-selectors.js → استدعاء ذاتي لا نهائي (RangeError).
  const refLS = sandbox.window.loadSelectors;
  const refFF = sandbox.window.findFirst;
  const refGT = sandbox.window.generateTaskId;
  const refPD = sandbox.window.parsePortalDate;

  for (const f of [
    'shared/message-bus.js', 'shared/storage-proxy.js', 'modules/autofill/runtime-trace.js',
    'shared/smart-log.js', 'shared/arabic-utils.js', 'shared/data-mapper.js',
    'shared/frame-walker.js', 'shared/excel-exporter.js', 'shared/portal-config.js',
    'shared/ai-client.js', 'shared/n8n-client.js',
    'modules/autofill/engine-lookups.js', 'modules/autofill/engine-page1.js',
    'modules/autofill/engine-page2.js', 'modules/autofill/engine-page3.js',
    'content-script.js'
  ]) {
    try { load(sandbox, f); } catch (_) { /* بعض الملفات تتطلب DOM كامل — التعريفات مُثبَّتة على أي حال */ }
  }

  ok(sandbox.window.loadSelectors === refLS, 'content-script.js: لم يستولِ على window.loadSelectors');
  ok(sandbox.window.findFirst === refFF, 'content-script.js: لم يستولِ على window.findFirst');
  ok(sandbox.window.generateTaskId === refGT, 'content-script.js: لم يستولِ على window.generateTaskId');
  ok(sandbox.window.parsePortalDate === refPD, 'content-script.js: لم يستولِ على window.parsePortalDate');

  let recErrLS = null, recErrFF = null, recErrGT = null;
  try { await sandbox.window.loadSelectors(); } catch (e) { recErrLS = e; }
  try { sandbox.window.findFirst(['#ldv_serialnumber']); } catch (e) { recErrFF = e; }
  try { sandbox.window.generateTaskId(); } catch (e) { recErrGT = e; }
  ok(!recErrLS, 'window.loadSelectors() يعمل بلا RangeError' + (recErrLS ? ' [' + recErrLS.message + ']' : ''));
  ok(!recErrFF, 'window.findFirst() يعمل بلا RangeError' + (recErrFF ? ' [' + recErrFF.message + ']' : ''));
  ok(!recErrGT, 'window.generateTaskId() يعمل بلا RangeError' + (recErrGT ? ' [' + recErrGT.message + ']' : ''));

  console.log('-- 9) static: لا تعريف عام بنفس أسماء الدوال المشتركة --');
  const SHARED_NAMES = ['findFirst', 'loadSelectors', 'parseDataLine', 'generateTaskId', 'parsePortalDate'];
  const topLevelDecl = new RegExp('^(?:async\\s+)?function\\s+(?:' + SHARED_NAMES.join('|') + ')\\s*\\(');
  for (const f of ['content-script.js', 'popup.js', 'control-panel.js',
                   'modules/autofill/engine-page1.js', 'modules/autofill/engine-page2.js',
                   'modules/autofill/engine-page3.js', 'modules/autofill/autofill-client.js']) {
    const bad = read(f).split(/\r?\n/).find((l) => topLevelDecl.test(l));
    ok(!bad, f + ': لا يوجد function declaration عام لدوال مشتركة' + (bad ? ' -> ' + bad.trim() : ''));
  }

  console.log('-- 10) regression: صيغة تاريخ البوابة يوم/شهر/سنة (DD/MM/YYYY) --');
  // العلّة: كتابة MM/DD/YYYY جعلت السيرفر يرفض النموذج:
  // «تاريخ الضمان must have a valid date format. Example: {1}»
  const dtA = sandbox.window.parsePortalDate('17/10/2026');
  ok(!!dtA && dtA.display === '17/10/2026', 'parsePortalDate("17/10/2026").display = 17/10/2026 (يوم أولاً) -> ' + (dtA && dtA.display));
  ok(!!dtA && dtA.iso === '2026-10-17', 'parsePortalDate("17/10/2026").iso = 2026-10-17 -> ' + (dtA && dtA.iso));
  const dtB = sandbox.window.parsePortalDate('2026-10-17');
  ok(!!dtB && dtB.display === '17/10/2026', 'parsePortalDate("2026-10-17").display = 17/10/2026 -> ' + (dtB && dtB.display));
  const dtC = sandbox.window.parsePortalDate('04/10/2023');
  ok(!!dtC && dtC.display === '04/10/2023', 'parsePortalDate("04/10/2023") بلا تبديل شهر/يوم -> ' + (dtC && dtC.display));
  ok(sandbox.window.parsePortalDate('17/13/2026') === null, 'parsePortalDate يرفض شهرًا غير صالح (17/13/2026)');
  ok(sandbox.window.parsePortalDate('') === null, 'parsePortalDate("") = null');

  console.log('-- 11) static: engine-page1 لا يبني تاريخًا بصيغة شهر/يوم --');
  const p1src = read('modules/autofill/engine-page1.js');
  ok(!/\$\{pad\(dObj\.month\)\}/.test(p1src), 'engine-page1.js: لا يوجد بناء MM/DD/YYYY');
  ok(/window\.parsePortalDate/.test(p1src), 'engine-page1.js: يستخدم المصدر الوحيد window.parsePortalDate');

  console.log('-- 12) static: قواعد «الزيارة الثانية» في الموجِّه مطابقة لـ V2 --');
  // العلّة: تخطّي الصفحة 1 في وضع الزيارة الثانية يمنع كتابة تاريخ الضمان كليًّا،
  // ثم يرفض السيرفر الحفظ برسالة صيغة التاريخ. V2 كان يستثني هذا الوضع صراحةً:
  //   content-script.js L1306: `if (isPage1AlreadyFilled(cfg) && task.mode !== 'secondVisit')`
  //   content-script.js L1355: `needsPage3 = task.mode === 'secondVisit' || ...`
  const orchLines = read('modules/autofill/engine-orchestrator.js').split(/\r?\n/);
  const filledCallIdx = orchLines.findIndex((l) => /isPage1AlreadyFilled\(cfg\)/.test(l));
  let page1SkipLine = null;
  for (let i = filledCallIdx; filledCallIdx >= 0 && i < orchLines.length; i++) {
    if (/\bif\s*\(/.test(orchLines[i]) && /data\.forceOverwrite/.test(orchLines[i])) { page1SkipLine = orchLines[i]; break; }
  }
  ok(!!page1SkipLine && /!data\.secondVisitMode/.test(page1SkipLine),
     'engine-orchestrator: تخطي الصفحة 1 يستثني وضع الزيارة الثانية' + (page1SkipLine ? ' -> ' + page1SkipLine.trim() : ' [لم يُعثر على شرط التخطي]'));
  const needsPage3Line = orchLines.find((l) => /\bneedsPage3\s*=/.test(l));
  ok(!!needsPage3Line && /data\.secondVisitMode/.test(needsPage3Line),
     'engine-orchestrator: needsPage3 يشمل وضع الزيارة الثانية' + (needsPage3Line ? ' -> ' + needsPage3Line.trim().slice(0, 90) : ' [لم يُعثر على needsPage3]'));

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail > 0) {
    console.log('Failures:');
    failures.forEach((x) => console.log('  - ' + x));
  }
  process.exit(fail === 0 ? 0 : 1);
})();
