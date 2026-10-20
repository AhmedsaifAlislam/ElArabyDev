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

  console.log('-- 13) regression: مؤشر «مصدر الأرقام» (البوابة أم الإضافة) --');
  // العلّة: المستخدم لا يعرف هل الأرقام الظاهرة أظهرتها الشركة/البوابة أصلاً
  // أم أن أداة كشف الأرقام بالمضافة هي التي كشفتها. البوابة تتحكم بذلك عبر
  // window.crmAccount.hideCustomersPhones، والـ Layer0 يفرضها false.
  function envWithHtml() {
    const e = makeEnv();
    e.sandbox.document.documentElement = {
      _a: {},
      setAttribute(k, v) { this._a[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._a, k) ? this._a[k] : null; }
    };
    return e;
  }

  const env2 = envWithHtml();
  load(env2.sandbox, 'elaraby-phone-reveal-layer0.js');
  ok(!!env2.sandbox.__eaPhoneSource && env2.sandbox.__eaPhoneSource.source === 'unknown',
    'Layer0: ينشر unknown قبل رصد إعداد البوابة');

  env2.sandbox.crmAccount = { hideCustomersPhones: true };
  ok(!!env2.sandbox.__eaPhoneSource && env2.sandbox.__eaPhoneSource.source === 'extension',
    'Layer0: البوابة تخفي الأرقام -> المصدر = extension');
  ok(!!env2.sandbox.__eaPhoneSource && env2.sandbox.__eaPhoneSource.portalHideCustomersPhones === true,
    'Layer0: القيمة الأصلية للبوابة (true) محفوظة');
  ok(env2.sandbox.crmAccount.hideCustomersPhones === false,
    'Layer0: يستمر في فرض hideCustomersPhones = false');
  ok(env2.sandbox.document.documentElement.getAttribute('data-ea-phones-source') === 'extension',
    'Layer0: يضبط <html data-ea-phones-source="extension">');

  const env3 = envWithHtml();
  load(env3.sandbox, 'elaraby-phone-reveal-layer0.js');
  env3.sandbox.crmAccount = { hideCustomersPhones: false };
  ok(!!env3.sandbox.__eaPhoneSource && env3.sandbox.__eaPhoneSource.source === 'company',
    'Layer0: البوابة تعرض الأرقام أصلاً -> المصدر = company');
  ok(env3.sandbox.document.documentElement.getAttribute('data-ea-phones-source') === 'company',
    'Layer0: يضبط <html data-ea-phones-source="company">');

  const l0src = read('elaraby-phone-reveal-layer0.js');
  ok(/eaNoteOriginal/.test(l0src) && /data-ea-phones-source/.test(l0src),
    'Layer0: يحتوي مسبر المصدر (eaNoteOriginal + data-ea-phones-source)');
  const oesrc = read('order-extractor.js');
  ok(/data-ea-phones-source/.test(oesrc), 'order-extractor: يقرأ data-ea-phones-source');
  ok(/id="oe-phone-source"/.test(oesrc) && /updatePhoneSourceBadge/.test(oesrc),
    'order-extractor: يحتوي شارة مصدر الأرقام في نافذة الاستخراج');

  console.log('-- 14) static: أعمدة الهواتف ووسم المصدر في الاستخراج (S3/S4) --');
  // العلّة: نافذة «استخراج البلاغات» كانت تُنتج عمودي هاتف فارغين لأن شبكة
  // بوابة Orders لا تعرض عمود هاتف إطلاقًا. الحل: ملؤهما من
  // (خلايا الشبكة ← ذاكرة أداة الكشف ← Web API) مع وسم المصدر لكل صف.
  ok(/id: 'phoneSource',\s*label: 'مصدر الرقم'/.test(oesrc),
    'order-extractor: عمود «مصدر الرقم» مُعرّف في DEFAULT_COLUMNS');
  ok(/function enrichOrdersWithPhones\(orders, portalHeaders\)/.test(oesrc),
    'order-extractor: دالة enrichOrdersWithPhones موجودة');
  ok(/await enrichOrdersWithPhones\(allOrders, portalHeaders\)/.test(oesrc),
    'order-extractor: الإثراء يُستدعى داخل exportXLSX (نقطة التصدير الوحيدة)');
  ok(/srcFieldId === 'phone'[\s\S]{0,90}order\._phone/.test(oesrc),
    'order-extractor: addDataRow يقرأ _phone كبديل لعمود الشبكة');
  ok(/srcFieldId === 'phone2'[\s\S]{0,90}order\._phone2/.test(oesrc),
    'order-extractor: addDataRow يقرأ _phone2 كبديل لعمود الشبكة');
  ok(/'ldv_mobilenumber', 'ldv_referencecontact'/.test(oesrc),
    'order-extractor: يجلب ldv_referencecontact (رقم شخص ذو صلة)');
  ok(/\$select=_customerid_value,ldv_mobilenumber,ldv_referencecontact/.test(oesrc),
    'order-extractor: يجلب الهاتفين مع نداء العميل نفسه (بلا نداء إضافي)');
  ok(/PHONE_SOURCE_LABELS/.test(oesrc) && /company:/.test(oesrc) && /api:/.test(oesrc),
    'order-extractor: وسوم المصدر (البوابة/الإضافة) مُعرّفة');
  ok(/oe-include-phone-source/.test(oesrc),
    'order-extractor: مربع اختيار «إظهار عمود مصدر الرقم» موجود');
  ok(/readRevealDirectory/.test(oesrc) && /elaraby_phone_directory/.test(oesrc),
    'order-extractor: يقرأ ذاكرة أداة كشف الأرقام (elaraby_phone_directory)');

  console.log('-- 15) regression: دقّة فلتر «أكتر من 3 أيام» (S5) --');
  // العلّة: OR بين حقلَي تاريخ كان يُدرج بلاغًا مجدولًا اليوم لمجرد أن حقل
  // «موعد» آخر بعيد. القاعدة الصحيحة: التاريخ الفعلي = المجدول وإلا الموعد.
  {
    const fsrc = read('Tempermonky/future-orders-reveal.js');
    const m = fsrc.match(/function isFutureBeyond\([\s\S]*?\n  \}/);
    ok(!!m, 'future-orders-reveal: دالة isFutureBeyond موجودة');
    if (m) {
      const f = vm.runInNewContext(m[0] + '\nisFutureBeyond;', {});
      const X = new Date('2026-10-22T23:59:59.999').getTime();
      const far = new Date('2026-10-25T00:00:00').toISOString();
      const near = new Date('2026-10-20T09:00:00').toISOString();
      ok(f({ ldv_scheduledservicestartdate: far }, X) === true,
        'S5: مجدول بعد الحد -> مستقبلي');
      ok(f({ ldv_scheduledservicestartdate: near }, X) === false,
        'S5: مجدول قبل الحد -> ليس مستقبلي');
      ok(f({ ldv_scheduledservicestartdate: near, ldv_appointmentdate: far }, X) === false,
        'S5: مجدول اليوم + موعد بعيد -> يُرفض (العلّة المُصلَحة)');
      ok(f({ ldv_appointmentdate: far }, X) === true,
        'S5: بلا تاريخ مجدول + موعد بعيد -> مستقبلي');
      ok(f({}, X) === false, 'S5: بلا أي تاريخ -> يُرفض');
    }
    ok(/thresholdMs/.test(oesrc) && /\.filter\(item =>/.test(oesrc),
      'order-extractor: تصفية دقيقة للمستقبلي (thresholdMs + filter)');
    ok(/const eff = item\.ldv_scheduledservicestartdate \|\| item\.ldv_appointmentdate;/.test(oesrc),
      'order-extractor: التاريخ الفعلي = المجدول وإلا الموعد');
    ok(/FUTURE_PROBE_ORDER/.test(oesrc) && /localStorage\.setItem\(FUTURE_PROBE_KEY/.test(oesrc),
      'order-extractor: سلّم استعلامات بديل عن fbFilter (يُخزَّن الشكل الناجح)');
    ok(/isFutureBeyond/.test(fsrc) && /isFutureBeyond\(x, thresholdMs\)/.test(fsrc),
      'future-orders-reveal: التصفية مطبّقة على النتائج');
  }

  console.log('-- 16) regression: نسخ الموديل 2 عبر lookup حقيقي (لا حقن نصي) --');
  // العلّة (2026-10-19): control-panel كان يمرر عنصر DOM مكان الـ selector إلى
  // fillPowerAppsLookup → استثناء مبلوع → حقن نص في <field>_name فقط → GUID فارغ
  // → البوابة ترفض: «الموديل الفعلى 2 اجبارى».
  const cpsrc = read('control-panel.js');
  ok(!/fillPowerAppsLookup\(\s*inputEl\s*,/.test(cpsrc),
     'control-panel.js: لا يمرر inputEl كأول معامل لـ fillPowerAppsLookup');
  ok(/function findLookupGuidField\s*\(/.test(cpsrc), 'control-panel.js: يحدد حقل الـ GUID المخفي');
  ok(/lookupModalFn\(lookupBtn, val, doc/.test(cpsrc), 'control-panel.js: fillLookupField يفتح مودال البحث ويختار');
  ok(/lookup-not-committed/.test(cpsrc), 'control-panel.js: يفشل صريحًا لو الـ GUID بقي فارغًا');
  ok(/dupOk === false/.test(cpsrc), 'control-panel.js: لا يضغط Next بعد فشل ربط الموديل 2');
  ok(/CFG\.modelBtn2/.test(cpsrc), 'control-panel.js: يستخدم زر البحث الخاص بالموديل 2');

  console.log('-- 17) shared problem-code registry + dynamic problem→tech timing --');
  // العلّة: محرّك الاوتو فيلينج كان يقرأ window.CFG (غير مُعرَّف) → فرع problemCodes
  // ميت → لا تدوير بين المسموح، ولا استبعاد للممنوع، وانتظار ثابت 2s قبل الفنيين.
  {
    const pbsrc = read('shared/problem-codes.js');
    ok(/DEFAULT_FORBIDDEN/.test(pbsrc) && /'GI00'/.test(pbsrc) && /'WM04'/.test(pbsrc),
      'problem-codes: قائمة الممنوع الاحتياطية معرّفة (GI00…WM04)');
    ok(/function isForbidden/.test(pbsrc) && /function filterAllowed/.test(pbsrc) && /function pickAllowed/.test(pbsrc),
      'problem-codes: isForbidden/filterAllowed/pickAllowed موجودة');
    ok(/function requestUserPick/.test(pbsrc) && /function resolveUserPick/.test(pbsrc),
      'problem-codes: بوابة اختيار المستخدم موجودة');

    const envP = makeEnv();
    envP.sandbox._CFG = JSON.parse(read('selectors.json'));
    envP.sandbox.loadSelectors = async () => envP.sandbox._CFG;
    load(envP.sandbox, 'shared/problem-codes.js');
    const PC = envP.sandbox.ProblemCodes;
    ok(!!PC, 'problem-codes: window.ProblemCodes متاح');
    await PC.loadRules();
    ok(PC.isForbidden('GI00 - (ترصيد بلاغ أرضى)'), 'problem-codes: GI00 ممنوع');
    ok(PC.isForbidden('SR00 - (مبيعات الحالة الفنية للجهاز)'), 'problem-codes: SR00 ممنوع');
    ok(PC.isForbidden('GR05 - (التبريد ضعيف بدرج الخضار)'), 'problem-codes: GR05 ممنوع');
    ok(!PC.isForbidden('AC02 - (التبريد ضعيف)'), 'problem-codes: AC02 مسموح');
    ok(!PC.isForbidden('GS01 - (تسريب غاز)'), 'problem-codes: GS01 مسموح');
    const allowed = PC.filterAllowed([
      'GI00 - (ترصيد بلاغ أرضى)',
      'GS04 - (الاشعال الذاتى لا يعمل باحد العيون)',
      'WM04 - (الاكره مكسوره)'
    ]);
    ok(allowed.length === 1 && /GS04/.test(allowed[0]),
      'problem-codes: filterAllowed يستبعد الممنوع ويُبقي المسموح فقط');
    ok(PC.codeOf('WM05 - (التجفيف لا يعمل)') === 'WM05',
      'problem-codes: codeOf يستخرج الكود من نص الصف');
    const picks = new Set();
    for (let i = 0; i < 40; i++) {
      const p = PC.pickAllowed(['AC02 - (التبريد ضعيف)', 'AC03 - (التبريد منعدم)']);
      if (p) picks.add(PC.codeOf(p));
    }
    ok(picks.has('AC02') && picks.has('AC03'),
      'problem-codes: pickAllowed يدوّر بين المسموح (AC02/AC03)');
  }

  {
    const selJson = JSON.parse(read('selectors.json'));
    ok(!!(selJson.problemCodeRules && Array.isArray(selJson.problemCodeRules.forbiddenKeywords))
      && selJson.problemCodeRules.forbiddenKeywords.includes('GI00')
      && selJson.problemCodeRules.forbiddenKeywords.includes('WM04'),
      'selectors.json: problemCodeRules.forbiddenKeywords معرّفة');
    ok(selJson.problemPickTimeoutMs === 30000,
      'selectors.json: problemPickTimeoutMs = 30000');

    const p2src = read('modules/autofill/engine-page2.js');
    ok(/window\._CFG \|\| window\.CFG/.test(p2src),
      'engine-page2: يقرأ window._CFG (إصلاح فرع problemCodes الميت)');
    ok(/async function resolveActualProblem/.test(p2src),
      'engine-page2: resolveActualProblem موجودة');
    ok(/async function waitForProblemToTechReady/.test(p2src),
      'engine-page2: waitForProblemToTechReady موجودة (توقيت ديناميكي)');
    ok(!/Waiting 2s for problem modal cleanup/.test(p2src),
      'engine-page2: أُزيل الانتظار الثابت 2s قبل الفنيين');
    ok(/const readyForTech = await waitForProblemToTechReady/.test(p2src),
      'engine-page2: يستخدم الانتظار الديناميكي قبل الفنيين');

    ok(/P2\.resolveActualProblem\(probCode/.test(cpsrc),
      'control-panel: يستخدم نفس دالة حل المشكلة الموحّدة');
    ok(/P2\.waitForProblemToTechReady/.test(cpsrc),
      'control-panel: يستخدم نفس التوقيت الديناميكي');
    ok(/ProblemCodes/.test(cpsrc) && /PICK_EVENT/.test(cpsrc),
      'control-panel: يربط بوابة اختيار المشكلة المشتركة');

    ok(/"shared\/problem-codes\.js"/.test(read('manifest.json')),
      'manifest: shared/problem-codes.js مُسجَّل كـ content script');
  }

  console.log('-- 17) regression: منع تراكم ستائر Bootstrap (الشاشة السوداء) --');
  // العلّة (2026-10-20): كل .modal-backdrop = أسود بعتامة .5؛ عند إغلاق المودال
  // بغير طريق Bootstrap تبقى الستارة فتتراكم (1=50%، 2=75%، 3=87.5% …).
  ok(/function clearOrphanBackdrops\s*\(/.test(cpsrc), 'control-panel.js: clearOrphanBackdrops موجودة');
  ok(/function closeModalSafely\s*\(/.test(cpsrc), 'control-panel.js: closeModalSafely موجودة');
  ok(/function resetModalsBeforeStep\s*\(/.test(cpsrc), 'control-panel.js: resetModalsBeforeStep موجودة');
  ok(/clickOnceSafe\(addBtn\)/.test(cpsrc), 'control-panel.js: زر الإضافة يُنقر مرة واحدة');
  ok(!/ev\.click\[0\]\.handler/.test(cpsrc), 'control-panel.js: أُزيل الاستدعاء المباشر لـ jQuery handler');
  ok(!/addBtn\.click\(\)/.test(cpsrc), 'control-panel.js: أُزيلت النقرة الثانية على زر الإضافة');
  ok(/if \(!hasVisibleModal\(\)\) clearOrphanBackdrops\('فحص دوري'\)/.test(cpsrc),
     'control-panel.js: شبكة أمان دورية تزيل الستائر اليتيمة');
  ok(/بانتظار اختيار «تمت الصيانة»/.test(cpsrc),
     'control-panel.js: ينتظر إغلاق نافذة الحالة قبل فتح مودال الأكواد');

  console.log('-- 18) regression: الصفحة الثالثة — مطابقة دقيقة + حزمة v2 + قطع شائعة --');
  ok(!/\|\|\s*rows\[0\]/.test(cpsrc), 'control-panel.js: أُزيل اختيار «أول صف» الأعمى');
  ok(/function scoreLookupRow\s*\(/.test(cpsrc), 'control-panel.js: scoreLookupRow (مطابقة بالنقاط)');
  ok(/reason:\s*'no-match'/.test(cpsrc), 'control-panel.js: يرجع no-match بدل اختيار خاطئ');
  ok(/function fillLookupWithPick\s*\(/.test(cpsrc), 'control-panel.js: fillLookupWithPick (اختيار يدوي)');
  ok(/function parsePartName\s*\(/.test(cpsrc), 'control-panel.js: parsePartName يفكك "CODE _ (NAME)"');
  ok(/tr\[data-entity="msdyn_inventoryadjustmentproduct"\]/.test(cpsrc), 'control-panel.js: يقرأ صفوف القطع بالمخطط الفعلي');
  ok(/version:\s*2/.test(cpsrc), 'control-panel.js: حزمة ELARABY_CODES_BUNDLE v2');
  ok(/حزمة قديمة/.test(cpsrc), 'control-panel.js: يرفض حزمة v1 القديمة');
  ok(/function showPartsReview\s*\(/.test(cpsrc), 'control-panel.js: لوحة مراجعة القطع قبل اللصق');
  ok(/ats_warrantystatus/.test(cpsrc), 'control-panel.js: يقرأ/يضبط ضمان صف القطعة');
  ok(/elaraby_fav_parts/.test(cpsrc), 'control-panel.js: القطع الشائعة محفوظة محليًا');
  ok(/lookup-not-committed/.test(cpsrc), 'control-panel.js: تحقق GUID بعد اختيار lookup');
  ok(/id="cp-fav-parts"/.test(cpsrc), 'control-panel.js: واجهة القطع الشائعة في التبويب');

  console.log('-- 19) البلاغات المستقبلية: سلّم استعلامات + تشخيص + استخراج مستقل عن الجدول --');
  // العلّة: $select كان يطلب ldv_appointmentdate و _ats_territories_value (غير مؤكدين)،
  // وحقل واحد خاطئ يجعل Dataverse يرفض الاستعلام كله بـ400، والاحتياطي يستخدم نفس
  // الـ$select فيفشل أيضًا → قائمة فاضية دائمًا وبلا أي رسالة خطأ.
  {
    const fsrc2 = read('Tempermonky/future-orders-reveal.js');

    ok(/const PROBE_ORDER = \['full', 'safe', 'scheduled', 'active', 'raw'\]/.test(fsrc2),
      'reveal: سلّم استعلامات خماسي (من الأضيق للأوسع)');
    ok(/async function fetchShape\(/.test(fsrc2) && /function buildQuery\(/.test(fsrc2),
      'reveal: buildQuery + fetchShape مفصولتان');
    ok(/'Prefer':\s*'odata\.include-annotations="\*"'/.test(fsrc2),
      'reveal: يرسل Prefer include-annotations (أسماء العميل/المنتج)');
    ok(/@odata\.nextLink/.test(fsrc2),
      'reveal: يتبع @odata.nextLink (تعدد الصفحات)');
    ok(/function apiErrorMessage\(/.test(fsrc2) && /HTTP \$\{/.test(fsrc2),
      'reveal: يعرض HTTP status + رسالة Dataverse');
    ok(/function diagnosticHtml\(/.test(fsrc2) && /فشل الاستعلام/.test(fsrc2),
      'reveal: لوحة التشخيص تعرض سبب الفشل بدل الصمت');
    ok(/localStorage\.setItem\(PROBE_KEY/.test(fsrc2),
      'reveal: يحفظ الشكل الناجح في localStorage');
    ok(/function candidateDocs\(/.test(fsrc2) && /contentDocument/.test(fsrc2),
      'reveal: البحث عن الجدول داخل iframes أيضًا');
    ok(/ea-future-orders-refresh/.test(fsrc2),
      'reveal: يستمع لحدث الفتح من الفاب (MAIN world)');

    const fabsrc = read('fabs-controller.js');
    ok(/ea-future-orders-refresh/.test(fabsrc) && /future-orders-fab/.test(fabsrc),
      'fabs-controller: يطلق حدث الفتح عند فتح أداة البلاغات المستقبلية');

    ok(/const FUTURE_FALLBACK_HEADERS/.test(fsrc2) === false && /const FUTURE_FALLBACK_HEADERS/.test(oesrc),
      'order-extractor: أعمدة احتياطية عند فراغ الجدول');
    ok(/async function extractFutureOnly\(/.test(oesrc),
      'order-extractor: مسار مستقل للسحب المستقبلي عند فراغ الجدول');
    ok(!/includeFuture && !stopRequested && firstHeaders/.test(oesrc),
      'order-extractor: لم يعد مشروطًا بنجاح قراءة الجدول (firstHeaders)');
    ok(!/includeFuture && result\.headers/.test(oesrc),
      'order-extractor: extractCurrentPage لم يعد مشروطًا بـresult.headers');
    ok(/@odata\.nextLink/.test(oesrc) && /Prefer/.test(oesrc),
      'order-extractor: nextLink + Prefer في جالب المستقبلي');
  }

  console.log('-- 20) البطء بعد بحث «لا توجد سجلات» (أمر غير موجود) --');
  // العلّة: كل أمر مفقود كان يكلّف ~25–28 ثانية: 2000ms انتظار ثابت + 12s في
  // خطوة wait + 12s في click_row + بحث ثانٍ في المسار القديم + 2000ms + 8s.
  {
    const esrc = read('modules/autofill/engine-orchestrator.js');

    ok(/function ordersGridShowsNoRecords\s*\(/.test(esrc),
      'orchestrator: ordersGridShowsNoRecords موجودة');
    ok(/no records to display/.test(esrc) && /لا توجد سجلات/.test(esrc),
      'orchestrator: يتعرّف على رسالة «لا توجد سجلات» (EN/AR)');
    ok(/async function waitForOrdersSearchReady\s*\(/.test(esrc),
      'orchestrator: انتظار جاهزية حقل البحث بدل تأخير ثابت');
    ok(!/_ordersSearchWait/.test(esrc),
      'orchestrator: أُزيل التأخير الثابت _ordersSearchWait (2000ms)');
    ok(/step\.timeout \|\| 4000/.test(esrc),
      'orchestrator: مهلة click_row الافتراضية 4s بدل 12s');
    ok(!/step\.timeout \|\| 12000/.test(esrc),
      'orchestrator: لا توجد مهلة 12s في محرّك الـ workflow');
    ok(/Date\.now\(\) - start < 3000/.test(esrc),
      'orchestrator: حلقة المسار القديم 3s بدل 8s');
    ok(/let workflowSearched = false/.test(esrc) && /workflowSearched \? null : findFirst/.test(esrc),
      'orchestrator: لا يعيد البحث لو الـ workflow بحث فعلًا');
    ok(/Math\.min\(td1, 250\)/.test(esrc),
      'orchestrator: مسار not-found لا ينتظر تأخير المهمة الكامل');
    const waitAction = esrc.match(/if \(step\.action === 'wait'\)[\s\S]*?if \(!found\)/);
    ok(!!waitAction && /ordersGridShowsNoRecords\(\)/.test(waitAction[0]),
      'orchestrator: خطوة wait تخرج فورًا عند «لا توجد سجلات»');
    const clickRow = esrc.match(/else if \(step\.action === 'click_row'\)[\s\S]*?if \(!rowFound\)/);
    ok(!!clickRow && /noRecordsHits/.test(clickRow[0]) && />= 2/.test(clickRow[0]),
      'orchestrator: click_row يخرج بعد تأكيدين متتاليين (حماية من الوميض)');
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail > 0) {
    console.log('Failures:');
    failures.forEach((x) => console.log('  - ' + x));
  }
  process.exit(fail === 0 ? 0 : 1);
})();
