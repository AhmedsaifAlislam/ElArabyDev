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
  ok(/\$select=[^"'&]*_customerid_value,ldv_mobilenumber,ldv_referencecontact/.test(oesrc),
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
    ok(/step\.timeout \|\| 8000/.test(esrc),
      'orchestrator: مهلة click_row 8s (تنتظر نتيجة البحث قبل الحكم)');
    ok(!/step\.timeout \|\| 12000/.test(esrc),
      'orchestrator: لا توجد مهلة 12s في محرّك الـ workflow');
    ok(/Date\.now\(\) - start < 8000/.test(esrc),
      'orchestrator: حلقة المسار القديم 8s لتنتظر نتائج البحث');
    ok(/if \(!workflowSearched\)/.test(esrc),
      'orchestrator: لا يعيد البحث لو الـ workflow بحث فعلًا');
    ok(/Math\.min\(td1, 250\)/.test(esrc),
      'orchestrator: مسار not-found لا ينتظر تأخير المهمة الكامل');
    const waitAction = esrc.match(/if \(step\.action === 'wait'\)[\s\S]*?if \(!found\)/);
    ok(!!waitAction && /ordersGridShowsNoRecords\(\)/.test(waitAction[0]),
      'orchestrator: خطوة wait تخرج عند «لا توجد سجلات» (بعد تأكيد)');
    const clickRow = esrc.match(/else if \(step\.action === 'click_row'\)[\s\S]*?if \(!rowFound\)/);
    ok(!!clickRow && /noRecordsHits/.test(clickRow[0]) && />= 3/.test(clickRow[0]),
      'orchestrator: click_row يخرج بعد 3 تأكيدات متتالية (حماية من الوميض)');

    // ── الموجة 31: البحث لا يُلغى + فتح التفاصيل ──
    ok(!/document\.querySelectorAll\('tr, \.entitylist-items > li/.test(esrc) && /function collectOrderRows/.test(esrc),
      'بحث الأوامر: يجمع الصفوف من المستند + iframes');
    ok(/document\.readyState !== 'complete'/.test(esrc) && /stableHits >= 2/.test(esrc),
      'بحث الأوامر: ينتظر اكتمال الصفحة واستقرار صفوف الشبكة قبل الكتابة');
    ok(/Search value was reset/.test(esrc) && /attempt <= 3/.test(esrc),
      'بحث الأوامر: يتحقق أن الرقم ثبت في الحقل ويعيد الكتابة عند مسحه');
    const typeAction = esrc.match(/else if \(step\.action === 'type'\)[\s\S]*?else if \(step\.action === 'click'\)/);
    ok(!!typeAction && !/(keydown|keypress|keyup)/.test(typeAction[0]),
      'بحث الأوامر: خطوة type لا تضغط Enter (منع البحث المزدوج)');
    ok(/function rowReviewHref/.test(esrc) && /workorderreview\|followup/.test(esrc),
      'فتح التفاصيل: رابط workorderreview/followup مباشرة بدل أول رابط في الصف');
    ok(/findOrderAndOpen\(orderId, cfg, true\)/.test(esrc),
      'فتح التفاصيل: إعادة محاولة واحدة قبل الحكم بـ«غير موجود»');
    ok(/let _queueOnLoadRunning = false/.test(esrc) && /PROCESS_QUEUE_SKIP_DUPLICATE/.test(esrc),
      'orchestrator: حارس يمنع بدء processQueueOnLoad مرتين متوازيين في نفس التاب');
    const csrc = read('content-script.js');
    const sc = csrc.match(/function safeClick\([\s\S]*?\n\}/);
    ok(!!sc && /element\.click\(\)/.test(sc[0]) && /else element\.dispatchEvent\(new Event\('click'/.test(sc[0])
      && (sc[0].match(/dispatchEvent\(new Event\('click'/g) || []).length === 1,
      'safeClick: نقرة واحدة فقط (كانت تُنفّذ الحدث مرتين فيلغي البحث نفسه)');
    const selJson = JSON.parse(read('selectors.json'));
    ok(Array.isArray(selJson.ordersViewLink) && selJson.ordersViewLink.some(s => /workorderreview/.test(s)),
      'selectors.json: ordersViewLink معرّف (كان مفقودًا)');
    ok(Array.isArray(selJson.ordersSearchBtn) && !selJson.ordersSearchBtn.some(s => /has-text|button\[type='submit'\]/.test(s)),
      'selectors.json: زر البحث الحقيقي فقط (بلا :has-text وبلا submit عام)');
  }

  console.log('-- 21) معالج البلاغات (report-processor) — كان معطّلًا بالكامل --');
  // العلّة: مراجع `fab` بقيت بعد نقل الفاب إلى fabs-controller ⇒ ReferenceError
  // عند التحميل يقتل الـ IIFE. ولا جسر يفتح الإعدادات من اللوحة الموحّدة.
  {
    const rsrc = read('Tempermonky/report-processor.js');
    const fabsrc2 = read('fabs-controller.js');

    ok(!/\bfab\.(classList|addEventListener)/.test(rsrc),
      'report-processor: لا مراجع مباشرة لـfab (كانت ReferenceError)');
    ok(/function getFab\s*\(/.test(rsrc) && /function setFabHidden\s*\(/.test(rsrc),
      'report-processor: getFab/setFabHidden بدل المرجع المباشر');
    ok(/__eaReportProcessorInited/.test(rsrc),
      'report-processor: حارس تكرار الحقن');
    ok(/ea-report-processor-open/.test(rsrc),
      'report-processor: يستمع لحدث الفتح من اللوحة');
    ok(/ea-report-processor-open/.test(fabsrc2) && /tool\.id === 'rp-fab'/.test(fabsrc2),
      'fabs-controller: يطلق حدث فتح معالج البلاغات');
    ok(/async function showSettingsInner\s*\(/.test(rsrc) && /_settingsBusy/.test(rsrc),
      'report-processor: حارس إعادة دخول للحصاد الكامل');
    ok(!/_status:\s*'—'/.test(rsrc),
      'report-processor: التصدير لم يعد يمحو حالة المعالجة');
    ok(/if \(!state\.stopRequested\) \{\s*clearResumeState\(\)/.test(rsrc),
      'report-processor: الإيقاف اليدوي لا يمحو جلسة الاستئناف');
    ok(/_listRendered/.test(rsrc),
      'report-processor: إعادة الرسم لا تلغي تحديد المستخدم');
    ok(/function waitForTableChange\s*\(/.test(rsrc) && /firstRowSignature\(\)/.test(rsrc),
      'report-processor: ينتظر تبدّل الشبكة فعليًا قبل قراءة الصفحة التالية');
    // الأيقونة: الربط المركزي لا ينشئ العنصر — كان يُحذف مع بقاء المراجع
    ok(/function ensureFab\s*\(/.test(rsrc) && /f\.id = 'rp-fab'/.test(rsrc) && /ensureFab\(\);/.test(rsrc),
      'report-processor: ينشئ أيقونة #rp-fab بنفسه (الربط المركزي لا ينشئها)');
    const msqsrc = read('Tempermonky/messenger-sender.js');
    ok(/id: 'msq-fab'/.test(msqsrc) && /let fab = document\.getElementById\('msq-fab'\)/.test(msqsrc),
      'messenger-sender: ينشئ أيقونة #msq-fab بنفسه');
    ok(/__eaMsqInited/.test(msqsrc),
      'messenger-sender: حارس تكرار الحقن (كان يضاعف مستمع الأيقونة فتتجاهل الضغط)');
    ok(!/fabMoved/.test(msqsrc) && !/fabDragging/.test(msqsrc),
      'messenger-sender: لا سحب محلي للأيقونة (كان يقتلها بعد أول سحب) — تبقى في موضعها');
    ok(/const closeBtn = document\.getElementById\('msq-close'\)[\s\S]{0,150}if \(closeBtn\)/.test(msqsrc),
      'messenger-sender: زر الإغلاق محمي من null');
    ok(/panel\.style\.setProperty\('left',[\s\S]{0,90}'important'\)/.test(msqsrc),
      'messenger-sender: سحب اللوحة يغلب CSS !important (كانت لا تتحرك)');
    const msqTool = (fabsrc2.match(/\{\s*id: 'msq-fab'[\s\S]*?\n    \}/) || [''])[0];
    ok(msqTool && !/\bpanel:/.test(msqTool),
      'fabs-controller: msq غير مقيد بلوحة 🧰 — السكربت يدير لوحته بنفسه');
    ok(/openEvent: 'msq-open'/.test(msqTool) && /addEventListener\('msq-open'/.test(msqsrc),
      'messenger-sender: جسر فتح اختياري من 🧰 (يعمل بدونه عبر الأيقونة)');

    // ── النطاق (scope): كل أداة تعمل في موقعها فقط ──
    ok(/\/\\\/Orders\(\\\/\|\$\|\[\?#\]\)\/i\.test\(location\.pathname\)/.test(rsrc),
      'report-processor: حارس نطاق — صفحة \/Orders\/ فقط');
    ok(/if \(!isMessagingSite\) \{/.test(msqsrc),
      'messenger-sender: حارس نطاق — مواقع المحادثة فقط');
    const runnerSrc = read('tampermonkey-runner.js');
    const rpMatch = (runnerSrc.match(/'report-processor':\s*\{[\s\S]*?match:\s*'([^']+)'/) || [])[1] || '';
    ok(/\/en-US\/Orders\/\*/.test(rpMatch) && !/powerappsportals\.com\/\*'/.test(rpMatch),
      'runner: معالج البلاغات لا يُحقن تلقائيًا خارج صفحة أوامر الشغل');
    const manifest = JSON.parse(read('manifest.json'));
    const runnerCs = (manifest.content_scripts || []).find(c => (c.js || []).includes('tampermonkey-runner.js'));
    const rm = (runnerCs && runnerCs.matches) || [];
    ok(rm.some(u => /facebook\.com/.test(u)) && rm.some(u => /whatsapp\.com/.test(u)) && rm.some(u => /instagram\.com/.test(u)),
      'manifest: الـ runner موجود على فيسبوك/واتساب/إنستجرام (وإلا تعذّر حقن مرسل الماسنجر)');
    ok(/tool\.homeMatch && !tool\.homeMatch\.test\(window\.location\.href\)/.test(fabsrc2)
      && /homeMatch: \/\\\/Orders/.test(fabsrc2)
      && /homeMatch: \/\(\^\|\\\.\)\(facebook/.test(fabsrc2),
      'fabs-controller: لا يحقن أداة في موقع خارج نطاقها (يفتح موقعها بدلًا من ذلك)');
    ok(/ENABLE_SCRIPT/.test(fabsrc2) && /msg\.action === 'ENABLE_SCRIPT'/.test(runnerSrc)
      && /'ENABLE_SCRIPT'/.test(read('background.js')),
      'ENABLE_SCRIPT: تفعيل بدون حقن عند فتح الأداة في موقعها الصحيح');

    // ── التحكم الصوتي: مراجعة كاملة ──
    const vcsrc = read('ai/voice-control.js');
    ok(/getElementById\('ea-voice-transcript'\)/.test(vcsrc) && !/getElementById\('ea-voice-result'\)/.test(vcsrc),
      'voice-control: يقرأ عنصر النص الموجود فعلاً (ea-voice-transcript) — كان null فيرمي TypeError');
    ok(/document\.createElement\('button'\)/.test(vcsrc) && /fab\.id = FAB_ID/.test(vcsrc),
      'voice-control: ينشئ أيقونته #elaraby-ai-voice-fab بنفسه (الربط المركزي لا ينشئ)');
    ok(/OPEN_EVENT/.test(vcsrc) && /addEventListener\(OPEN_EVENT/.test(vcsrc),
      'voice-control: يستمع لحدث الفتح ea-voice-open من اللوحة');
    ok(/openEvent: 'ea-voice-open'/.test(fabsrc2) && /tool\.panel && !tool\.openEvent/.test(fabsrc2)
      && /new CustomEvent\(tool\.openEvent\)/.test(fabsrc2),
      'fabs-controller: openEvent عام — يفتح اللوحة بالسكربت ولا يفرض display يعطّل الإغلاق');
    ok(/__eaVoiceControlLoaded/.test(vcsrc),
      'voice-control: حارس تكرار الحقن (لا مستمعات مكررة)');
    ok(/setPanelVisible\(false\)/.test(vcsrc) && /setProperty\('display'/.test(vcsrc),
      'voice-control: الإغلاق يغلب أي display مضمّن (كان لا يعمل بعد الفتح من اللوحة)');
    ok(/rec\.continuous = true/.test(vcsrc) && !/rec\.continuous = false/.test(vcsrc),
      'voice-control: استماع مستمر (كان يقطع بعد أول سكتة فيحتاج إعادة الكلام)');
    ok(/rec\.onend[\s\S]{0,900}setTimeout\(startSession/.test(vcsrc),
      'voice-control: إعادة تشغيل تلقائية بعد السكوت بدل مطالبة المستخدم بالضغط');
    ok(/maxAlternatives = 1/.test(vcsrc) && /sessionFinal/.test(vcsrc) && /commitSession/.test(vcsrc),
      'voice-control: يجمّع النص النهائي بين الجلسات (لا يضيع الكلام السابق)');
    ok(/getUserMedia\(\{[\s\S]{0,200}autoGainControl: true/.test(vcsrc) && /analyser|createAnalyser/i.test(vcsrc),
      'voice-control: يضبط AGC/عزل الضوضاء + مؤشر مستوى الميكروفون');
    ok(/ea-voice-level/.test(vcsrc) && /SILENCE_MS = 5000/.test(vcsrc) && /armSilence\(\)/.test(vcsrc),
      'voice-control: مؤشر مستوى + إيقاف تلقائي بعد 5 ثوانٍ صمت (يُعاد تسليحه مع كل نتيجة)');
  }

  console.log('-- 21.5) كل عنصر بنطاقنا نقرأه بـgetElementById يجب أن يُنشأ فعلاً --');
  // العلّة: عناصر وُعدت بها الواجهة (ea-voice-result) لم تُنشأ إطلاقًا،
  // فالمتغيرات تساوي null وأول استخدام يرمي TypeError أو يقتل السكربت.
  {
    // تُضاف كل أداة هنا بعد مراجعتها وإصلاحها (المراجعة تجري أداة أداة).
    // المتبقي بالمراجعة: elaraby-phone-reveal.js (سيُصلح لاحقًا: elaraby-mini-btn/badge).
    const scopeFiles = [
      'ai/chat-panel.js', 'ai/voice-control.js', 'core/booking/shadow-panel.js',
      'features/attachments/multi-uploader.js',
      'Tempermonky/report-processor.js', 'Tempermonky/messenger-sender.js',
      'Tempermonky/future-orders-reveal.js',
      'control-panel.js', 'fabs-controller.js', 'content/defect-scanner/defect-scanner.js'
    ];
    const OWN = /^(ea-|elaraby-|rp-|msq-|mu-|ds-|cp-|__bs-)/;
    const missing = [];
    for (const rel of scopeFiles) {
      const src = read(rel);
      const re = /getElementById\(\s*'([^']+)'\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const id = m[1];
        if (!OWN.test(id)) continue;
        // مسموح: العنصر يُنشأ في ملف آخر بنفس النطاق (لوحة تحكم/مستضيف ظل)
        const declaredHere = (src.match(new RegExp("['\"]" + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]", 'g')) || []).length >= 2;
        const declaredElsewhere = scopeFiles.some(f => f !== rel && new RegExp("['\"]" + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]").test(read(f)));
        if (!declaredHere && !declaredElsewhere) missing.push(rel + ' → #' + id);
      }
    }
    ok(missing.length === 0, 'كل عناصرنا المطلوبة موجودة فعلًا' + (missing.length ? ' — ناقص: ' + missing.join(' | ') : ''));
  }

  console.log('-- 22) كتالوج المشاكل الفعلية (problem-catalog.json) --');
  // العلّة: قائمة «الممنوع» كانت مكتوبة يدويًا داخل الكود، والأكواد المسموحة
  // (GS01، AC01، HT01…) لم تكن معروفة للنظام أصلًا. الكتالوج صار المصدر.
  {
    const cat = JSON.parse(read('problem-catalog.json'));
    ok(Array.isArray(cat.codes) && cat.codes.length >= 50,
      'problem-catalog: الكتالوج موجود وفيه 50+ كودًا');
    const byCode = new Map(cat.codes.map(c => [String(c.code).toUpperCase(), c]));
    ok(['GI00', 'GS08', 'GR05', 'SR00', 'SR01', 'WM04'].every(c => byCode.get(c) && byCode.get(c).forbidden === true),
      'problem-catalog: الأكواد الستة الممنوعة معلّمة forbidden=true');
    ok(['GS01', 'GS04', 'AC02', 'GR01', 'WM05', 'HT01'].every(c => byCode.get(c) && byCode.get(c).forbidden !== true),
      'problem-catalog: الأكواد المسموحة غير معلّمة');
    ok(!!(cat.families && cat.families.GS && cat.families.GR && cat.families.AC
      && cat.families.WM && cat.families.HT),
      'problem-catalog: عائلات المنتجات معرّفة');
    ok(JSON.stringify(cat).indexOf('AC001') === -1,
      'problem-catalog: لا يحتوي أي كود عطل (AC001…) — الكتالوجان منفصلان');

    const manifest = JSON.parse(read('manifest.json'));
    const war = (manifest.web_accessible_resources || []).flatMap(r => r.resources || []);
    ok(war.includes('problem-catalog.json'),
      'manifest: problem-catalog.json في web_accessible_resources');

    const envC = makeEnv();
    envC.sandbox._CFG = JSON.parse(read('selectors.json'));
    envC.sandbox.loadSelectors = async () => envC.sandbox._CFG;
    envC.sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => cat });
    load(envC.sandbox, 'shared/problem-codes.js');
    const PC2 = envC.sandbox.ProblemCodes;
    const loaded = await PC2.loadCatalog();
    ok(loaded.codes.length === cat.codes.length,
      'problem-codes: loadCatalog يقرأ الكتالوج كاملًا');
    await PC2.loadRules();
    ok(PC2.isForbidden('GI00 - (ترصيد بلاغ أرضى)') && PC2.isForbidden('WM04 - (الاكره مكسوره)'),
      'problem-codes: الممنوع يُقرأ من الكتالوج لا من الكود');
    ok(!PC2.isForbidden('AC01 - (البلازما لا تعمل)') && !PC2.isForbidden('HT01 - (لا يسخن)'),
      'problem-codes: الأكواد الجديدة (AC01/HT01) مسموحة');
    const wm = PC2.codesForDevice('غساله');
    ok(wm.includes('WM05') && wm.includes('WM15') && !wm.includes('WM04') && !wm.includes('SR00'),
      'problem-codes: codesForDevice(غساله) يستبعد الممنوع ويُبقي المسموح');
    ok(PC2.codesForDevice('تكييف').includes('AC02')
      && PC2.codesForDevice('ثلاجات').includes('GR01')
      && PC2.codesForDevice('سخانات مياه').includes('HT08'),
      'problem-codes: تعرف عائلة الجهاز (تكييف/ثلاجات/سخانات)');
    ok(PC2.familyOf('A/C Outdoor Unit') === 'AC',
      'problem-codes: عائلة AC تُستنتج من نص البوابة A/C');
  }

  console.log('-- 23) كود المشكلة المبدئية لا يُنسخ — الكتالوج هو الحكم --');
  // العلّة: أي شكوى بشكل XX99 كانت تُنسخ كما هي (WM82 → WM82) ثم يفشل البحث.
  // والـ AI كانت تُقيَّد بقائمة ثابتة من 9 أكواد بدل الكتالوج.
  {
    const p2 = read('modules/autofill/engine-page2.js');
    ok(!/Using complaint code as problem search/.test(p2),
      'engine-page2: أُزيل نسخ كود الشكوى كما هو (WM82 → WM82)');
    ok(/async function getProblemCode/.test(p2) && /PC\.isKnownCode\(bare\)/.test(p2),
      'engine-page2: getProblemCode يتحقق من الكتالوج قبل استخدام كود الشكوى');
    ok(/PC\.allowedCodesForDevice\(deviceName, null, \{[\s\S]{0,80}service: isInstallRow \? 'install' : 'maintenance'/.test(p2),
      'engine-page2: يختار من أكواد الكتالوج حسب العائلة ونوع الخدمة');
    ok(/function allowedCodesForAI/.test(p2) && /PC\.codesForDevice\(deviceName\)/.test(p2),
      'engine-page2: قائمة الـ AI تُبنى من الكتالوج لا من ثابت');
    ok(/await getProblemCode\(deviceName, isInstall\)/.test(p2),
      'engine-page2: executePage2_FollowUp ينتظر getProblemCode');
    ok(/await getProblemCode\(device, isInstall\)/.test(read('control-panel.js')),
      'control-panel: ينتظر getProblemCode بعد جعله async');
    ok(/PC\.loadRules\(\)/.test(p2) && /is not in problem-catalog/.test(p2),
      'engine-page2: resolveActualProblem يحمّل القواعد ويحذّر من كود خارج الكتالوج');
  }

  console.log('-- 24) فصل كتالوج الأعطال (صفحة 3) عن كتالوج المشاكل (صفحة 2) --');
  {
    const def = JSON.parse(read('defect-catalog.json'));
    ok(!!(def.families && def.families.AC && Array.isArray(def.families.AC.codes)),
      'defect-catalog: عائلة AC موجودة');
    ok(def.families.AC.codes.length === 6,
      'defect-catalog: 6 أكواد أعطال AC معروفة');
    ok(def.families.AC.codes.every(c => /^AC\d{3}$/.test(c.major) && /^[A-Z0-9]{3,4}$/.test(c.sub) && c.full),
      'defect-catalog: كل كود بصيغة major/sub/full');
    ok(!/"WM05"|"GS01"|"HT01"/.test(JSON.stringify(def)),
      'defect-catalog: لا يحتوي أي كود مشكلة (WM05/GS01/HT01)');
    ok(!JSON.stringify(JSON.parse(read('problem-catalog.json'))).includes('AC001'),
      'problem-catalog: لا يحتوي أي كود عطل (AC001)');

    const cp = read('control-panel.js');
    ok(!/value="AC001,0005/.test(cp),
      'control-panel: أُزيلت أكواد الأعطال المكتوبة HTML');
    ok(/loadDefectCatalog/.test(cp) && /defectCodesFor\(/.test(cp) && /renderDefectCodes/.test(cp),
      'control-panel: يعرض أكواد الأعطال من الكتالوج');
    ok(/defectFamilyOf/.test(cp) && /PC\.familyOf/.test(cp),
      'control-panel: يستنتج عائلة الجهاز من كتالوج المشاكل');
    ok(/"defect-catalog\.json"/.test(read('manifest.json')),
      'manifest: defect-catalog.json في web_accessible_resources');
  }

  console.log('-- 25) الصفحة 2: «التالي» اختياري + قياس زمن المشكلة→الفني --');
  {
    const cp = read('control-panel.js');
    ok(/<input type="checkbox" id="chk-next2">/.test(cp),
      'control-panel: «التالي» في الصفحة 2 غير مفعّل افتراضيًا (لا checked)');
    ok(/function bindAutoNext2/.test(cp) && /cp_auto_next2/.test(cp),
      'control-panel: اختيار «التالي» يُحفظ في localStorage');
    ok(/function autoNext2Enabled/.test(cp),
      'control-panel: بوابة autoNext2Enabled موجودة');
    ok(/if \(autoNext2Enabled\(shadow\)\) \{\s*await doNext\(shadow\);/.test(cp),
      'control-panel: doNext لا يُنفّذ إلا عند تفعيل الخيار');
    ok(!/\/\/ 3\. التالي\s*\n\s*await doNext\(shadow\);/.test(cp),
      'control-panel: أُزيل الانتقال التلقائي غير المشروط');
    ok(/recordPage2Timing/.test(cp) && /cp_timings/.test(cp) && /'TIMING'/.test(cp),
      'control-panel: قياسات الصفحة 2 تُخزَّن وتُسجَّل');
    ok(/timing\.problemMs/.test(cp) && /timing\.waitMs/.test(cp) && /timing\.techMs/.test(cp),
      'control-panel: قياس مراحل (مشكلة / انتظار / فني)');
    ok(/if \(!ready && probOk\)/.test(cp),
      'control-panel: توقف صريح لو زر الفنيين لم يظهر بعد حفظ المشكلة');
  }

  console.log('-- 26) ملاحظات الموديل: إضافة/حذف/تصدير بدون تعديل ملفات الإضافة --');
  {
    const cp = read('control-panel.js');
    ok(/id="btn-note-edit"/.test(cp) && /id="cp-note-editor"/.test(cp) && /id="cp-note-text"/.test(cp),
      'control-panel: محرر ملاحظة الموديل موجود في تبويب الصفحة 1');
    ok(/id="btn-note-save"/.test(cp) && /id="btn-note-delete"/.test(cp) && /id="btn-note-export"/.test(cp),
      'control-panel: حفظ/حذف/تصدير متاحة');
    ok(/LS_MODEL_NOTES_USER = 'model_notes_user'/.test(cp) && /chrome\.storage\.local\.set/.test(cp),
      'control-panel: الملاحظات الشخصية تُحفظ في chrome.storage.local');
    ok(/function matchesModelNote/.test(cp) && /=== 'prefix'/.test(cp) && /=== 'regex'/.test(cp),
      'control-panel: مطابقة exact/prefix/regex مدعومة');
    ok(/\.\.\.user\.filter\(e => matchesModelNote/.test(cp),
      'control-panel: ملاحظات المستخدم تظهر قبل ملف الإضافة');
    ok(/renderModelNote\(PANEL_SHADOW, true\)/.test(cp),
      'control-panel: تحديث فوري بعد الحفظ (تجاوز الكاش)');
    ok(/bindModelNoteEditor\(shadow\)/.test(cp),
      'control-panel: المحرر مربوط في bindEvents');
    ok(/note-info/.test(cp) && /note-danger/.test(cp),
      'control-panel: ألوان الملاحظة حسب النوع (info/warning/danger)');
  }

  console.log('-- 27) إصلاحات P0 المتبقية في اللوحة (حزمة/مهلة/إيقاف/شورت كت) --');
  {
    const cp = read('control-panel.js');

    // P0-2: حزمة أكواد فقط بلا version لم تعد تُرفض
    ok(/const partsLackIds/.test(cp) && /bundleVersion < 2 \|\| partsLackIds/.test(cp),
      'P0-2: رفض الحزمة القديمة مشروط بقطع غيار بلا معرّفات (لا أكواد فقط)');
    ok(!/if \(bundle && Number\(bundle\.version \|\| 0\) < 2\)/.test(cp),
      'P0-2: أُزيل الرفض الأعمى لكل حزمة بلا version');

    // P0-6: مصدر/عمر الحزمة قبل اللصق
    ok(/bundleSource = 'clipboard'/.test(cp) && /bundleSource = 'localStorage'/.test(cp) && /bundleSource = 'manual'/.test(cp),
      'P0-6: مصدر الحزمة يُحدَّد (حافظة/localStorage/يدوي)');
    ok(/ageText/.test(cp) && /bundle\.copiedAt \|\| bundle\.createdAt/.test(cp),
      'P0-6: عمر الحزمة يُحسب من copiedAt ويُعرض');

    // P0-3: مهلة 5 دقائق + زر إيقاف
    ok(/const EXEC_TIMEOUT_MS = 5 \* 60 \* 1000/.test(cp),
      'P0-3: مهلة التنفيذ 5 دقائق');
    ok(/function cancelExecution/.test(cp) && /resetModalsBeforeStep\('إيقاف يدوي'\)/.test(cp),
      'P0-3: الإيقاف يغلق المودالات بأمان');
    ok(/id="cp-stop"/.test(cp) && /cancelExecution\(shadow, 'user'\)/.test(cp),
      'P0-3: زر «إيقاف» مربوط');
    ok(/function assertNotCancelled/.test(cp) && /cancelled-by-user/.test(cp),
      'P0-3: إلغاء تعاوني بين خطوات التنفيذ');
    ok((cp.match(/assertNotCancelled\(\);/g) || []).length >= 4,
      'P0-3: assertNotCancelled في الصفحات 1/2/3 وحلقة الأعطال');

    // P0-4 + P0-5
    ok(/async function runShortcut/.test(cp) && /visibleShortcuts\(family\)/.test(cp)
      && /shortcutCodes\(def, services\)/.test(cp) && !/type === 'refuse'/.test(cp),
      'P0-4: الشورت كت من الكتالوج فقط — «يرفض الدفع» مؤجّل (يُضاف لاحقًا بـ ⭐ لكل عائلة)');
    ok(!/cb\.value\.startsWith\('AC00/.test(cp) && /appendShortcutNote\(def\.noteText\)/.test(cp),
      'P0-4: لا أكواد مثبّتة داخل الشورت كت + التعليق الحر يُكتب في الملاحظات');
    ok(/if \(codes\.length === 0\) \{/.test(cp) && /لم يطابق أي كود/.test(cp),
      'P0-5: لا «✅ (0 كود)» — توقف برسالة عند عدم المطابقة');
    ok(/const ok = await runShortcut\(shadow, id\)/.test(cp)
      || /const ok = await runShortcut\(shadow, btn\.dataset\.sc\)/.test(cp),
      'P0-5: تنفيذ الصفحة 3 لا يبدأ إذا لم يُحدَّد أي كود');
  }

  console.log('-- 28) إدارة أكواد الأعطال: إضافة/تعديل/حذف (الحالية والمستقبلية) --');
  {
    const cp = read('control-panel.js');
    ok(/id="cp-defect-edit-btn"/.test(cp) && /id="cp-defect-editor"/.test(cp) && /id="cp-defect-list"/.test(cp),
      'اللوحة: زر ونافذة إدارة أكواد الأعطال موجودان');
    ok(/id="cp-defect-major"/.test(cp) && /id="cp-defect-sub"/.test(cp) && /id="cp-defect-desc"/.test(cp),
      'اللوحة: حقول إضافة كود (رئيسي/فرعي/وصف)');
    ok(/LS_DEFECT_USER = 'defect_catalog_user'/.test(cp) && /chrome\.storage\.local\.set/.test(cp),
      'التعديلات تُحفظ في chrome.storage.local (ملف الإضافة للقراءة فقط)');
    ok(/function defectKey/.test(cp) && /function mergedDefectCodes/.test(cp),
      'دمج الرسمي + تعديلات المستخدم بمفتاح family|major|sub');
    ok(/if \(c\.removed\) \{ map\.delete\(k\); return; \}/.test(cp),
      'الحذف يُخزَّن كتجاوز (removed) لا يُعيد الكود الرسمي');
    ok(/function deleteDefectCode/.test(cp) && /_defectDeleteArmed/.test(cp),
      'الحذف بتأكيد مزدوج (لا حذف بنقرة واحدة)');
    ok(/function saveDefectUser/.test(cp) && /codes\.push\(\{/.test(cp),
      'الإضافة/التعديل يُحفظان ويُعاد رسم القائمة');
    ok(/id="cp-defect-export"/.test(cp) && /id="cp-defect-reset"/.test(cp),
      'تصدير JSON للنشر الدائم + استعادة الأصل');
    ok(/return mergedDefectCodes\(fam\);/.test(cp) && !/_defectCatalog\.families\[fam\]\.codes/.test(cp),
      'قائمة checkboxes تقرأ من الدمج لا من الملف الرسمي مباشرة');
    ok(/bindDefectEditor\(shadow\)/.test(cp),
      'محرر الأعطال مربوط في bindEvents');
  }

  console.log('-- 29) تحصين اللوحة ضد تجمّد الصفحة عند التحرير --');
  {
    const cp = read('control-panel.js');
    ok(/function safeBind\(shadow, name, fn\)/.test(cp) && /safeBind\(shadow, 'محرر أكواد الأعطال'/.test(cp),
      'ربط آمن: خطأ في ميزة لا يوقف بقية أزرار اللوحة (bindEvents)');
    ok(/function hookPanelErrors\(shadow\)/.test(cp) && /unhandledrejection/.test(cp),
      'التقاط أخطاء JS غير المعالجة وتسجيلها (بدل تجمّد صامت)');
    ok(/let _updatingCodes = false/.test(cp) && /if \(_updatingCodes\) return;/.test(cp),
      'حارس إعادة دخول في updateDeviceCodes (يمنع حلقات الرسم)');
    ok(/let _defectUserPromise = null/.test(cp) && /if \(_defectUserPromise && !force\) return _defectUserPromise;/.test(cp),
      'قراءة تعديلات الأعطال مرة واحدة (cache للوعد)');
    ok(/stopPropagation\(\)/.test(cp) && /'keydown', 'keypress', 'keyup', 'input', 'click'/.test(cp),
      'عزل أحداث المحرر عن مستمعات البوابة العامة (keydown/click)');
    ok(/إعادة الرسم مؤجّلة/.test(cp) && /setTimeout\(\(\) => \{[\s\S]{0,120}renderDefectEditor\(sh\)/.test(cp),
      'إعادة الرسم بعد الحفظ مؤجّلة خارج دورة الحدث');
    ok(/btn\.onclick = \(\) => \{[\s\S]{0,400}renderDefectEditor\(shadow\);[\s\S]{0,400}Promise\.all/.test(cp),
      'فتح المحرر فوري بلا انتظار (لا تجمّد بصري)');
  }

  console.log('-- 30) المساعد الذكي: الخلفية + المفتاح + اللوحة + الأدوات --');
  {
    const bg = read('background.js');
    ok(/case 'AI_CHAT':/.test(bg) && /async function handleAIChat/.test(bg),
      'AI: الخلفية تستجيب لرسالة AI_CHAT (بدل "Unknown message type")');
    ok(/port\.name !== 'elaraby-ai-stream'/.test(bg) || /name === 'elaraby-ai-stream'/.test(bg),
      'AI: منفذ البث elaraby-ai-stream مفتوح (لا انتظار 95 ثانية)');
    ok(/type: 'chunk'/.test(bg) && /type: 'done'/.test(bg) && /type: 'error'/.test(bg),
      'AI: البث يرسل chunk/done/error بالعقد المتفق عليه');
    ok(/role: 'system'/.test(bg),
      'AI: تعليمات النظام (system) تُرسل فعلياً إلى النموذج');
    ok(/replace\(\/\^opencode\\\//.test(bg),
      'AI: بادئة المزود opencode/ تُزال (Zen الحالي يرفضها)');

    const mf = read('manifest.json');
    ok(/"https:\/\/opencode\.ai\/\*"/.test(mf),
      'AI: صلاحية المضيف opencode.ai موجودة (وإلا فشل الطلب)');
    ok(/shared\/ai-client\.js",\s*"ai\/smart-ai-tools\.js"/.test(mf),
      'AI: smart-ai-tools محمّل بعد ai-client (تسجيل الأدوات)');

    const chat = read('ai/chat-panel.js');
    ok(/function ensureFab\(\)/.test(chat) && /fab\.id = 'elaraby-ai-fab'/.test(chat),
      'AI: الأيقونة تُنشأ داخل السكربت نفسه (ensureFab)');
    ok(/addEventListener\('ea-ai-open'/.test(chat),
      'AI: جسر الفتح من لوحة 🧰 (ea-ai-open) موجود');
    ok(/if \(busy\) return;/.test(chat) && /busy = false;/.test(chat),
      'AI: حارس الإرسال المزدوج (Enter + الزر)');
    ok(/history: sessionHistory\.slice\(-10, -1\)/.test(chat),
      'AI: الرسالة الحالية لا تُكرَّر في history (prompt فقط)');
    ok(/res\.toolCalls/.test(chat) && !/res\.tool\b/.test(chat),
      'AI: عرض نتائج الأدوات يقرأ toolCalls (لا الحقل القديم tool)');
    ok(/const t = setInterval\(/.test(chat) && /tries > 10/.test(chat),
      'AI: استقصاء الأدوات محدود (لا حلقة لا نهائية)');

    const fc = read('fabs-controller.js');
    ok(/id: 'elaraby-ai-fab'[\s\S]{0,420}openEvent: 'ea-ai-open'/.test(fc),
      'AI: الأداة تفتح لوحتها بنفسها (openEvent — لا display مضمّن)');
    ok(/id: 'elaraby-ai-fab'[\s\S]{0,500}homeMatch: \/elarabyportalpfs/.test(fc),
      'AI: الأداة مقيّدة ببورتال العربي');

    const popup = read('popup.html');
    ok(/id="ai-key-input"/.test(popup) && /id="btn-ai-key-save"/.test(popup),
      'AI: حقل إدخال مفتاح API وزر حفظ في الإعدادات');
    ok(/<script src="shared\/ai-client\.js"><\/script>\s*<script src="ai-panel-tab\.js"><\/script>\s*<script src="popup\.js"><\/script>/.test(popup),
      'AI: الـ popup يحمّل ai-client + ai-panel-tab قبل popup.js');
    ok(/function initAI\(\)/.test(read('popup.js')),
      'AI: initAI معرّفة (كانت تُستدعى بلا تعريف ⇒ تعطُّل تبويب المساعد)');

    const tab = read('ai-panel-tab.js');
    ok(/async function saveAIKey/.test(tab) && /aiConfig\.apiKey = key/.test(tab),
      'AI: حفظ المفتاح في chrome.storage.local (لا في الملفات)');
    ok(!/اذهب إلى الإعدادات وأدخل/.test(tab),
      'AI: رسالة "لا يوجد مفتاح" تشير للحقل الموجود فعلاً');

    function allFiles(dir, out) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) allFiles(p, out);
        else if (/\.(js|json|html|css)$/.test(e.name)) out.push(p);
      }
      return out;
    }
    const leaked = allFiles(EXT, []).filter(p => /oc_sk_[A-Za-z0-9]{6,}/.test(fs.readFileSync(p, 'utf8')));
    ok(leaked.length === 0,
      'AI: لا يوجد مفتاح API مكتوب في أي ملف من ملفات الإضافة (السرية)');
  }

  console.log('-- 30) اللوحة تبقى موجودة بعد إعادة بناء صفحة البوابة (SPA) --');
  {
    const cp = read('control-panel.js');
    ok(/function panelIsBuilt\(\)/.test(cp) && /function injectPanel\(\) \{\r?\n\s*if \(panelIsBuilt\(\)\) return;/.test(cp),
      'injectPanel: لا حقن مزدوج + رفض المضيف الفارغ (بقايا سكربت ميت)');
    ok(/elaraby_cp_reset_build/.test(cp) && /isMinimized = false;/.test(cp),
      'ترحيل لكل build: إلغاء الإرساء المحفوظ وفتح اللوحة عائمة');
    ok(/if \(window\.__cpHeartbeat\) return;/.test(cp),
      'نبضة واحدة فقط مهما تكرّر init (لا مؤقّتات مكرّرة)');
    ok(/if \(!panelIsBuilt\(\)\) \{[\s\S]{0,260}injectPanel\(\)/.test(cp),
      'النبضة تعيد حقن اللوحة لو حذفتها البوابة (SPA)');
    ok(/catch \(e\) \{\r?\n\s*\/\/ نبضة واحدة فاشلة/.test(cp),
      'خطأ في نبضة واحدة لا يوقف بقية الفحوص');
    ok(/showBootErrorChip/.test(cp) && /لم تُبنَ اللوحة/.test(cp),
      'شارة تشخيص عند 3 ثوانٍ لو لم تُبنَ اللوحة (بدل صمت تام)');
    ok(/offsetParent !== null/.test(cp) && /لا حاوية إرساء ظاهرة/.test(cp),
      'الإرساء لا يحبس اللوحة داخل حاوية مخفية');
    ok(/!el\.closest\('\.navbar'\)/.test(cp) && /form\.parentNode\.insertBefore\(host, form\)/.test(cp),
      'الإرساء يفضّل مكان الفورم ويتجنب حاوية النافبار (أول .container في البوابة)');
    ok(/function showBootErrorChip/.test(cp) && /catch \(e\) \{[\s\S]{0,320}showBootErrorChip\(msg\)/.test(cp),
      'فشل تحميل اللوحة يظهر كشريحة خطأ مرئية بدل الاختفاء الصامت');
    ok(/elaraby_cp_boot/.test(cp),
      'أثر بدء التشغيل (build + time) في localStorage للتشخيص');

    // كل ملف مذكور في web_accessible_resources يجب أن يكون موجودًا فعليًا
    const mf = JSON.parse(read('manifest.json').replace(/^\uFEFF/, ''));
    const missing = [];
    (mf.web_accessible_resources || []).forEach(w => (w.resources || []).forEach(r => {
      if (!fs.existsSync(path.join(EXT, r))) missing.push(r);
    }));
    ok(missing.length === 0,
      'manifest: كل ملفات web_accessible_resources موجودة' + (missing.length ? ' — ناقص: ' + missing.join(', ') : ''));
  }

  console.log('-- 31) كشف أرقام العملاء: أيقونة الحافة + تصغير + عدم لمس اللوحة --');
  {
    const fc = read('fabs-controller.js');
    const findFabIdx = fc.indexOf('function findFab');
    const findFabBody = fc.slice(findFabIdx, findFabIdx + 300);
    ok(/getElementById\(tool\.id\)/.test(findFabBody) && !/elaraby-fixed-box/.test(findFabBody),
      'كشف الأرقام: الأيقونة فقط — اللوحة لم تعد تُعامل كفاب (كانت تصبح 24px)');
    const phoneIdx = fc.indexOf("id: 'elaraby-mini-btn'");
    const phoneEntry = fc.slice(phoneIdx, phoneIdx + 420);
    ok(/openEvent: 'ea-phone-open'/.test(phoneEntry),
      'كشف الأرقام: openEvent — لا فرض display على اللوحة');
    ok(!/ea-suppressor-tool/.test(fc) && !/portal-error-suppressor/.test(fc),
      'حُذفت الأداة الشبح «كتم أخطاء البورتال» من 🧰 (سكربتها غير مسجّل)');

    const ph = read('Tempermonky/elaraby-phone-reveal.js');
    ok(/createElement\('button'\)/.test(ph) && /fab\.id = 'elaraby-mini-btn'/.test(ph),
      'كشف الأرقام: الأيقونة 📞 تُنشأ داخل السكربت نفسه');
    ok(/id="elaraby-badge"/.test(ph) && /function updateFabBadge/.test(ph),
      'كشف الأرقام: شارة عدد السجلات موجودة وتتحدث');
    ok(/addEventListener\('ea-phone-open'/.test(ph) && /window\.__ERP_OPEN =/.test(ph),
      'كشف الأرقام: الفتح من 🧰 يعمل عبر ea-phone-open');
    const closeIdx = ph.indexOf('window.__ERP_CLOSE_ALL');
    const closeBody = ph.slice(closeIdx, closeIdx + 450);
    ok(/state\.isMinimized = true/.test(closeBody) && !/\.remove\(\)/.test(closeBody),
      'كشف الأرقام: ✕ تصغير فقط — لا يحذف اللوحة ولا يوقف المسح');
    ok(/__ERP_BOOTED/.test(ph),
      'كشف الأرقام: حارس إعادة الدخول (لا تكرار مستمعين وفقدان بيانات)');
    ok(/z-index:2147483000/.test(ph),
      'كشف الأرقام: اللوحة فوق لوحة 🧰 (كانت 999999)');
  }

  console.log('\n-- 31) لا اختيار تلقائي لكود المشكلة بعد انتهاء المهلة --');
  {
    const e2 = read('modules/autofill/engine-page2.js');
    ok(!/auto-random/.test(e2) && /reason: 'pick-timeout'/.test(e2),
      'engine-page2: انتهاء مهلة الاختيار ⇒ pick-timeout (بلا اختيار عشوائي)');
    ok(!/allowed\[Math\.floor\(Math\.random\(\) \* allowed\.length\)\]/.test(e2),
      'engine-page2: لا يوجد أي مسار عشوائي بديل عند فشل الاختيار');
    const cp = read('control-panel.js');
    ok(/لن يُختار تلقائيًا/.test(cp) && /انتهت المهلة — اختر من القائمة/.test(cp),
      'اللوحة: العدّاد يوضح أن الاختيار يدوي وليس تلقائيًا');
    ok(/probReason === 'pick-timeout'/.test(cp),
      'اللوحة: رسالة واضحة عند انتهاء المهلة بدون اختيار');
  }

  console.log('\n-- 32) نموذج البيانات الموحّد: عائلات + ملاحظات + شورت كت --');
  {
    const cat = JSON.parse(read('defect-catalog.json'));
    const fams = cat.families || {};
    ok(cat.version === 2, 'defect-catalog: الإصدار 2 (notes/shortcuts/noFaultCode)');
    ok(Object.keys(fams).length >= 6, 'defect-catalog: ست عائلات معرّفة');

    let shapeOk = true;
    for (const f of Object.keys(fams)) {
      const e = fams[f] || {};
      if (!e.label || !Array.isArray(e.codes) || !Array.isArray(e.notes) || !Array.isArray(e.shortcuts)) shapeOk = false;
    }
    ok(shapeOk, 'defect-catalog: كل عائلة فيها codes + notes + shortcuts (حتى الفارغة)');

    // كل كود في شورت كت لازم يكون موجودًا فعلًا في أكواد عائلته
    let codesOk = true;
    let noteOk = true;
    const problems = [];
    for (const f of Object.keys(fams)) {
      const e = fams[f];
      const have = new Set((e.codes || []).map(c => String(c.major || '').toUpperCase()));
      // دقة «رئيسي|فرعي»: الكود الدقيق لازم يكون موجودًا فعليًا (لا يكفي الرئيسي)
      const haveFull = new Set((e.codes || []).map(c => String(c.major || '').toUpperCase()
        + (c.sub ? '|' + String(c.sub).toUpperCase() : '')));
      const noteIds = new Set((e.notes || []).map(n => n && n.id));
      for (const sc of (e.shortcuts || [])) {
        for (const c of (sc.codes || [])) {
          const w = String(c).toUpperCase();
          const okCode = w.includes('|') ? haveFull.has(w) : have.has(w);
          if (!okCode) { codesOk = false; problems.push(`${f}/${sc.id}:${c}`); }
        }
        for (const n of (sc.noteIds || [])) {
          if (!noteIds.has(n)) { noteOk = false; problems.push(`${f}/${sc.id}:note=${n}`); }
        }
        if (e.noFaultCode && sc.codeFrom === 'noFaultCode' && !have.has(String(e.noFaultCode).toUpperCase())) codesOk = false;
      }
      if (e.noFaultCode && !have.has(String(e.noFaultCode).toUpperCase())) codesOk = false;
    }
    ok(codesOk, 'defect-catalog: كل كود في شورت كت موجود في أكواد عائلته' + (problems.length ? ' [' + problems.join(', ') + ']' : ''));
    ok(noteOk, 'defect-catalog: كل noteId في شورت كت موجود في ملاحظات عائلته');

    // لا تكرار ids داخل العائلة
    let dupOk = true;
    for (const f of Object.keys(fams)) {
      const ids = (fams[f].shortcuts || []).map(s => s.id);
      if (new Set(ids).size !== ids.length) dupOk = false;
      const nIds = (fams[f].notes || []).map(n => n.id);
      if (new Set(nIds).size !== nIds.length) dupOk = false;
    }
    ok(dupOk, 'defect-catalog: لا تكرار في معرفات الشورت كت أو الملاحظات');

    const shared = cat.sharedShortcuts || [];
    ok(shared.length >= 1 && shared.every(s => s.id && s.name), 'defect-catalog: أزرار مشتركة معرّفة (عدم توافر)');
    ok(shared.some(s => s.codeFrom === 'noFaultCode'), 'defect-catalog: الشورت المشترك يستخدم كود «لا يوجد عطل» للعائلة');

    const ac = fams.AC || {};
    ok((ac.shortcuts || []).length === 4, 'AC: أربعة أزرار شورت كت');
    const pm = (ac.shortcuts || []).find(s => s.id === 'pm');
    ok(pm && JSON.stringify(pm.codes) === JSON.stringify(['AC001', 'AC004']), 'AC/صيانة دورية = AC001 + AC004');
    const pull = (ac.shortcuts || []).find(s => s.id === 'pull');
    ok(pull && pull.codes.length === 4 && pull.codes.includes('AC006'), 'AC/سحب وإرجاع = 4 أكواد رئيسية (منها AC006)');
    ok((ac.notes || []).length === 6 && (ac.notes || []).every(n => n.id && n.text), 'AC: ست ملاحظات معرّفة بمعرفات مستقرة');

    const pb = JSON.parse(read('problem-catalog.json'));
    const pbCodes = new Set((pb.codes || []).map(c => String(c.code).toUpperCase()));
    const leak = (ac.codes || []).map(c => c.major).filter(c => pbCodes.has(String(c).toUpperCase()));
    ok(leak.length === 0, 'لا تسريب: أكواد الأعطال ليست أكواد مشاكل [' + leak.join(',') + ']');
  }

  console.log('\n-- 33) محمّل الخدمات: شورت كت + ملاحظات لكل عائلة --');
  {
    const cat = JSON.parse(read('defect-catalog.json'));
    const src = read('control-panel.js');
    const s0 = src.indexOf('function familyServices(');
    const s1 = src.indexOf('function renderDefectEditor(');
    ok(s0 > 0 && s1 > s0, 'خدمات: دوال familyServices/shortcutCodes/visibleShortcuts موجودة');

    const block = src.slice(s0, s1);
    const api = new Function('_defectCatalog', block + '\nreturn { familyServices, shortcutCodes, visibleShortcuts };')(cat);

    const ac = api.familyServices('AC');
    ok(ac.shortcuts.length === 4 && ac.notes.length === 6 && ac.noFaultCode === 'AC005',
      'خدمات/AC: 4 أزرار + 6 ملاحظات + كود عدم العطل AC005');

    const vis = api.visibleShortcuts('AC');
    const shared = vis.list.find(s => s.id === 'unavailable');
    ok(vis.list.length === 5 && shared && shared._scope === 'shared',
      'خدمات/AC: أزرار العائلة + الزر المشترك (5)');

    ok(JSON.stringify(api.shortcutCodes(shared, vis.services)) === '["AC005"]',
      'خدمات: codeFrom=noFaultCode يُحلّ إلى كود العائلة');

    const pm = vis.list.find(s => s.id === 'pm');
    ok(JSON.stringify(api.shortcutCodes(pm, vis.services)) === '["AC001","AC004"]',
      'خدمات: أكواد «صيانة دورية» من JSON');

    const gs = api.familyServices('GS');
    ok(gs.shortcuts.length === 0 && gs.noFaultCode === '' && api.visibleShortcuts('GS').list.length === 1,
      'خدمات/GS: لا أزرار عائلة ويظهر المشترك فقط');
  }

  console.log('\n-- 34) الشورت كت والملاحظات مرسومة من الكتالوج --');
  {
    const cp = read('control-panel.js');
    ok(/id="cp-shortcut-buttons"/.test(cp) && !/data-sc="pm"/.test(cp) && !/data-sc="refuse"/.test(cp),
      'الواجهة: حاوية شورت كت ديناميكية (لا أزرار مثبّتة في HTML)');
    ok(/function renderShortcuts\(shadow\)/.test(cp) && /renderShortcuts\(shadow\);/.test(cp),
      'الرسم: renderShortcuts تُستدعى مع تحديث أكواد الجهاز');
    ok(/_scope === 'shared'/.test(cp) && /cp-badge">مشترك/.test(cp),
      'الرسم: الزر المشترك يظهر بشارة «مشترك»');
    ok(/shortcutBox\.addEventListener\('click'/.test(cp) && /e\.target\.closest\('\.cp-shortcut-btn'\)/.test(cp),
      'الربط: تفويض على الحاوية (يعمل مع الأزرار المتغيّرة)');
    ok(/data-note-text="\$\{escapeHtml\(n\.text\)\}"/.test(cp) && /data-note-id="\$\{escapeHtml\(n\.id\)\}"/.test(cp),
      'الملاحظات: كل ملاحظة تحمل معرّفها ونصها (لا فهرس ثابت)');
    ok(/cb\.dataset\.noteText/.test(cp) && /if \(cb\.dataset\.noteText\) return cb\.dataset\.noteText;/.test(cp),
      'التنفيذ: نص الملاحظة يُقرأ من العنصر لا من قائمة ثابتة');
    ok(/const \{ notes \} = familyServices\(family\)/.test(cp),
      'الملاحظات: تُعرض ملاحظات عائلة الجهاز');
  }

  console.log('\n-- 35) زر قطع الغيار: بناء النص + قاعدة المبلغ --');
  {
    const src = read('control-panel.js');
    const p0 = src.indexOf('const NOTES_MAX = 2000;');
    const p1 = src.indexOf('// كتابة نص في «آخر تعليق»');
    ok(p0 > 0 && p1 > p0, 'قطع الغيار: كتلة buildPartsNote موجودة');
    const api = new Function(src.slice(p0, p1) + '\nreturn { buildPartsNote, PARTS_STATUS };')();
    const BP = api.buildPartsNote;
    const S = api.PARTS_STATUS;

    const usedIn = BP({ parts: [{ code: 'AC001', name: 'صيانة دورية', price: 0, qty: 1, total: 0 }], partsStatus: S.USED, officialTotal: 0, secondaryDescriptions: [] });
    ok(usedIn.text === 'تم تغيير : [ AC001 (صيانة دورية) ]' && usedIn.eligibleTotal === 0,
      'مستعمل/داخل الضمان: بدون أسعار وبدون «والتكلفة»');

    const mix = BP({
      parts: [
        { code: 'AC001', name: 'صيانة', price: 0, qty: 1, total: 0 },
        { code: 'AC006', name: 'كباس', price: 350, qty: 1, total: 350 }
      ], partsStatus: S.USED, officialTotal: 350, secondaryDescriptions: []
    });
    ok(mix.text === 'تم تغيير : [ AC001 (صيانة) ] [ AC006 (كباس) 350 ] // والتكلفة [ 350 ] ج.م' && mix.eligibleTotal === 350,
      'مستعمل/خليط: السعر للقطع خارج الضمان فقط + إجمالي في الآخر');

    const qty = BP({ parts: [{ code: 'X', name: 'Y', price: 100, qty: 2, total: 200 }], partsStatus: S.USED, officialTotal: 200, secondaryDescriptions: [] });
    ok(/\[ X \(Y\) 200 \]/.test(qty.text), 'الكمية > ١: يُستخدم إجمالي القطعة لا سعر الوحدة');

    const qtyFallback = BP({ parts: [{ code: 'X', name: 'Y', price: 100, qty: 2, total: 0 }], partsStatus: S.USED, officialTotal: 0, secondaryDescriptions: [] });
    ok(/\[ X \(Y\) 200 \]/.test(qtyFallback.text), 'إجمالي ناقص: يُحسب price × qty');

    const wait = BP({ parts: [{ code: 'AC003', name: 'فريون', price: 250, qty: 1, total: 250 }], partsStatus: S.WAITING, officialTotal: 0, secondaryDescriptions: [] });
    ok(wait.text === 'يحتاج : [ AC003 (فريون) 250 ] // الإجمالي [ 250 ] ج.م' && wait.eligibleTotal === 0,
      'منتظر: «يحتاج» مرة واحدة + الإجمالي في الآخر');

    const waitMany = BP({
      parts: [
        { code: 'A1', name: 'شمعه', price: 375, qty: 1, total: 375 },
        { code: 'A2', name: 'حساس', price: 85, qty: 1, total: 85 }
      ], partsStatus: S.WAITING, officialTotal: 0, secondaryDescriptions: []
    });
    ok((waitMany.text.match(/يحتاج/g) || []).length === 1
      && (waitMany.text.match(/بالتكلفة/g) || []).length === 0
      && !/قطعة/.test(waitMany.text)
      && /^يحتاج : \[/.test(waitMany.text)
      && / \/\/ الإجمالي \[ 460 \] ج\.م$/.test(waitMany.text),
      'منتظر: لا تكرار «يحتاج/بالتكلفة» ولا عدد قطع + إجمالي مجمّع');

    const wait0 = BP({ parts: [{ code: 'AC003', name: 'فريون', price: 0, qty: 1, total: 0 }], partsStatus: S.WAITING, officialTotal: 0, secondaryDescriptions: [] });
    ok(wait0.text === 'يحتاج : [ AC003 (فريون) ]', 'منتظر بدون سعر: لا «بالتكلفة 0» ولا إجمالي');

    ok(!wait.text.includes('\n') && !mix.text.includes('\n'),
      'النص سطر واحد آمن (الحقل <input> يحذف \\n)');

    ok(BP({ parts: [{ code: 'A', name: 'B' }], partsStatus: S.WITHDRAW }).action === 'skip'
      && BP({ parts: [{ code: 'A', name: 'B' }], partsStatus: S.EXCHANGE }).action === 'skip',
      'سحب/استبدال: لا تعليق');

    const none = BP({ parts: [], partsStatus: S.NONE, officialTotal: 0, secondaryDescriptions: ['صيانة دورية', 'ضبط حوض الصرف'] });
    ok(none.text === 'تم صيانة دورية وضبط حوض الصرف', 'بدون قطع غيار: «تم» + أوصاف الأكواد المعلّمة');
    ok(BP({ parts: [], partsStatus: S.NONE, secondaryDescriptions: [] }).text === 'تم', 'بدون قطع غيار وبدون أكواد: «تم» فقط');

    ok(BP({ parts: [], partsStatus: '' }).action === 'need-status', 'حالة فاضية: توقف (لا افتراض «منتظر»)');
    ok(BP({ parts: [], partsStatus: S.USED }).action === 'conflict', 'مستعمل/منتظر بجدول فاضي: تناقض ⇒ لا كتابة');

    // قاعدة المبلغ المحصل
    const a0 = src.indexOf('function applyCollectedAmount(');
    const a1 = src.indexOf('// أوصاف الأكواد المعلّمة');
    ok(a0 > 0 && a1 > a0, 'قاعدة المبلغ: applyCollectedAmount موجودة');
    const applyFn = new Function(src.slice(a0, a1) + '\nreturn applyCollectedAmount;')();
    const fake = (v) => ({ getElementById: () => ({ value: v }) });
    ok(applyFn(fake('0'), 350).applied === true && applyFn(fake(''), 350).applied === true,
      'المبلغ: يُملأ لو الحقل فاضي أو صفر وفيه تكلفة');
    const keep = applyFn(fake('500'), 350);
    ok(keep.applied === false && keep.reason === 'keep-manual', 'المبلغ: لا ينقص قيمة كتبها الفني');
    ok(applyFn(fake('0'), 0).applied === false, 'المبلغ: لا يُكتب صفر فوق قيمة موجودة');
    ok(/const amt = applyCollectedAmount\(shadow, plan\.eligibleTotal\)/.test(src)
      && !/amtEl\.value = officialTotal/.test(src),
      'قطع الغيار: لم يعد يضبط المبلغ المحصل بالإجمالي الرسمي مباشرة');

    // الكاتب الموحّد + انتظار التحميل + حد ٢٠٠٠
    ok(/async function appendNotesText/.test(src) && /await appendNotesText\(plan\.text\)/.test(src)
      && /await appendShortcutNote\(def\.noteText\)/.test(src),
      'كاتب ملاحظات موحّد للشورت كت وقطع الغيار');
    {
      const q0 = src.indexOf('function notesSeparator(');
      const q1 = src.indexOf('async function appendNotesText(');
      ok(q0 > 0 && q1 > q0, 'فاصل الملاحظات: notesSeparator موجودة');
      const sepFn = new Function(src.slice(q0, q1) + '; return notesSeparator;')();
      ok(sepFn({ tagName: 'INPUT' }) === ' | ' && sepFn({ tagName: 'TEXTAREA' }) === '\n',
        'فاصل الملاحظات: « | » للـinput (يحذف \\n) و«سطر جديد» للـtextarea');
    }
    ok(/NOTES_MAX = 2000/.test(src) && /reason: 'too-long'/.test(src), 'حد ٢٠٠٠ حرف محمي');
    ok(/async function waitForPartsRows/.test(src) && /await waitForPartsRows\(3000\)/.test(src),
      'انتظار تحميل صفوف القطع قبل الحكم «لا توجد قطع»');
    ok(!/setStatus\(shadow, `.✅ .*الإجمالي المعتمد/.test(src), 'لا نجاح كاذب بعد فشل الكتابة');
  }

  console.log('\n-- 36) المحرر الموحّد: تبويبات + دمج تعديلات المستخدم --');
  {
    const cat = JSON.parse(read('defect-catalog.json'));
    const cp = read('control-panel.js');

    // (أ) الواجهة: تبويبات ونماذج التحرير
    ok(/id="cp-edef-tabs"/.test(cp) && /data-etab="codes"/.test(cp)
      && /data-etab="shortcuts"/.test(cp) && /data-etab="notes"/.test(cp),
      'المحرر: تبويبات أكواد / شورت كت / ملاحظات');
    ok(/id="cp-edef-pane-codes"/.test(cp) && /id="cp-edef-pane-shortcuts"/.test(cp)
      && /id="cp-edef-pane-notes"/.test(cp),
      'المحرر: ثلاثة ألواح منفصلة');
    ok(/<option value="\*">/.test(cp), 'المحرر: نطاق «مشترك لكل العائلات» في قائمة العائلات');
    ok(/id="cp-sc-list"/.test(cp) && /id="cp-sc-save"/.test(cp) && /id="cp-sc-codes"/.test(cp)
      && /id="cp-sc-notes"/.test(cp) && /id="cp-sc-note-text"/.test(cp),
      'المحرر: نموذج الشورت كت (أكواد + ملاحظات + تعليق + مبلغ)');
    ok(/id="cp-nt-list"/.test(cp) && /id="cp-nt-save"/.test(cp) && /id="cp-nt-text"/.test(cp),
      'المحرر: نموذج الملاحظات');

    // (ب) المخزن الموحّد: ترقية آمنة للأكواد/الملاحظات/الشورت كت
    {
      const n0 = cp.indexOf('function normalizeDefectUser(');
      const n1 = cp.indexOf('async function saveDefectUser(');
      ok(n0 > 0 && n1 > n0, 'المخزن: normalizeDefectUser موجودة');
      const norm = new Function(cp.slice(n0, n1) + '; return normalizeDefectUser;')();
      const z = norm({ codes: [{ major: 'AC001' }] });
      ok(z.version === 2 && Array.isArray(z.notes) && Array.isArray(z.shortcuts) && z.codes.length === 1,
        'المخزن: ترقية v1 → v2 تُضيف notes/shortcuts بلا فقدان الأكواد');
      const z2 = norm(null || { codes: 'x' });
      ok(Array.isArray(z2.codes) && z2.codes.length === 0, 'المخزن: قيم تالفة تُستبدل بمصفوفات فاضية');
    }

    // (ج) الدمج فوق الكتالوج الرسمي
    const s0 = cp.indexOf('function familyServices(');
    const s1 = cp.indexOf('function renderDefectEditor(');
    ok(s0 > 0 && s1 > s0, 'الدمج: كتلة الخدمات موجودة قبل المحرر');
    const mk = (user) => new Function('_defectCatalog', '_defectUser',
      cp.slice(s0, s1) + '\nreturn { familyServices, shortcutCodes, visibleShortcuts, mergedNotesFor, mergedShortcutsFor, mergedSharedShortcuts, catalogOverrides };'
    )(cat, user);

    const base = mk(null);
    ok(base.familyServices('AC').notes.length === 6 && base.familyServices('AC').shortcuts.length === 4,
      'الدمج: بلا تعديلات ⇒ الكتالوج الرسمي كما هو');

    const withNotes = mk({
      version: 2, codes: [],
      notes: [
        { family: 'AC', id: 'ac-note-3', text: 'نص معدَّل' },
        { family: 'AC', id: 'un1', text: 'ملاحظة جديدة' },
        { family: 'AC', id: 'ac-note-1', removed: true }
      ],
      shortcuts: []
    });
    const acNotes = withNotes.familyServices('AC').notes;
    ok(acNotes.length === 6 && acNotes.find(n => n.id === 'ac-note-3').text === 'نص معدَّل',
      'الدمج: تعديل ملاحظة رسمية يستبدل نصها بلا تكرار');
    ok(!!acNotes.find(n => n.id === 'un1') && !acNotes.find(n => n.id === 'ac-note-1'),
      'الدمج: إضافة ملاحظة جديدة وحذف رسمية');
    ok(withNotes.catalogOverrides('notes', 'AC').length === 3
      && withNotes.catalogOverrides('notes', 'GS').length === 0,
      'الدمج: التعديلات لا تتسرّب بين العائلات');

    const withShortcuts = mk({
      version: 2, codes: [], notes: [],
      shortcuts: [
        { family: 'AC', id: 'u-test', name: 'زر تجريبي', icon: '🧪', codes: ['ac001', 'AC001'], noteIds: ['ac-note-1'], noteText: '', codeFrom: '', amount: '150' },
        { family: '*', id: 'shared-test', name: 'زر مشترك', icon: '🌐', codeFrom: 'noFaultCode', amount: 0 }
      ]
    });
    const acS = withShortcuts.familyServices('AC');
    const uTest = acS.shortcuts.find(s => s.id === 'u-test');
    ok(acS.shortcuts.length === 5 && uTest && uTest.amount === 150 && uTest.codes.length === 1,
      'الدمج: زر جديد يُضاف ويُطبَّع (سعر رقمي + أكواد بلا تكرار)');
    ok(uTest._scope === 'family' && uTest._src === 'user', 'الدمج: الزر الجديد معلَّم كتعديل مستخدم');
    ok(JSON.stringify(withShortcuts.shortcutCodes(uTest, acS)) === '["AC001"]',
      'الدمج: أكواد الزر الجديد تُقرأ في التنفيذ');
    const sharedNew = withShortcuts.visibleShortcuts('AC').list.find(s => s.id === 'shared-test');
    ok(sharedNew && sharedNew._scope === 'shared'
      && JSON.stringify(withShortcuts.shortcutCodes(sharedNew, acS)) === '["AC005"]',
      'الدمج: زر مشترك جديد يظهر لكل عائلة ويُحلّ إلى كود «لا يوجد عطل»');

    const removedShared = mk({
      version: 2, codes: [], notes: [],
      shortcuts: [{ family: '*', id: 'unavailable', removed: true }]
    });
    ok(removedShared.visibleShortcuts('GS').list.length === 0,
      'الدمج: حذف زر مشترك رسمي يخفيه عن كل العائلات');

    // (د) الحذف بتأكيد مزدوج + تصدير كامل
    ok(/_scDeleteArmed/.test(cp) && /_ntDeleteArmed/.test(cp)
      && /async function deleteShortcutDef/.test(cp) && /async function deleteNoteDef/.test(cp),
      'الحذف: تأكيد مزدوج لأزرار الشورت كت والملاحظات');
    ok(/out\.sharedShortcuts = mergedSharedShortcuts\(\)/.test(cp)
      && /notes: mergedNotesFor\(f\)/.test(cp) && /shortcuts: mergedShortcutsFor\(f\)/.test(cp),
      'التصدير: JSON واحد يشمل الأكواد + الملاحظات + الشورت كت + المشترك');
    ok(/الملاحظات لكل عائلة — اختر عائلة محددة/.test(cp),
      'الحماية: لا ملاحظات في النطاق المشترك');
    ok(/notes: \[\], shortcuts: \[\]/.test(cp) || /codes: \[\], notes: \[\], shortcuts: \[\]/.test(cp),
      'الاستعادة: تُلغي كل تعديلات المستخدم معًا');

    // (هـ) الحذف الفعلي: الرسمي ⇒ «removed»، وتعديل المستخدم ⇒ إزالة نهائية
    {
      const d0 = cp.indexOf('async function deleteShortcutDef(');
      const d1 = cp.indexOf('function bindDefectEditor(shadow) {');
      ok(d0 > 0 && d1 > d0, 'الحذف: كتلة deleteShortcutDef/deleteNoteDef موجودة');
      let saved = null;
      const api = new Function('loadDefectUser', 'saveDefectUser', 'setStatus', 'logEvent', '_defectCatalog',
        cp.slice(d0, d1) + '\nreturn { deleteShortcutDef, deleteNoteDef };')(
        async () => ({ version: 2, codes: [], notes: [], shortcuts: [] }),
        async (d) => { saved = d; },
        () => {}, () => {}, cat
      );
      try {
        await api.deleteShortcutDef({}, 'AC', 'pm');
        const row1 = (saved.shortcuts || []).find(x => x.id === 'pm');
        ok(row1 && row1.removed === true && row1.family === 'AC', 'الحذف: زر رسمي ⇒ تعديل «removed»');

        saved = null;
        await api.deleteShortcutDef({}, 'AC', 'u-self');
        ok((saved.shortcuts || []).length === 0, 'الحذف: زر مستخدم ⇒ إزالة نهائية بلا «removed»');

        saved = null;
        await api.deleteNoteDef({}, 'AC', 'ac-note-2');
        const row2 = (saved.notes || []).find(x => x.id === 'ac-note-2');
        ok(row2 && row2.removed === true, 'الحذف: ملاحظة رسمية ⇒ تعديل «removed»');
      } catch (e) {
        ok(false, 'الحذف: خطأ غير متوقع — ' + (e.message || e));
      }
    }
  }

  console.log('\n-- 37) ⭐ القطع الشائعة: خدمة كاملة (مخزن v2 + ترحيل + تحرير) --');
  {
    const cp = read('control-panel.js');

    // (أ) الواجهة: تبويب رابع + نموذج + زر إدارة + كليك يمين للتعديل
    ok(/data-etab="favorites"/.test(cp) && /id="cp-edef-pane-favorites"/.test(cp),
      '⭐ الواجهة: تبويب «قطع» ولوح مستقل داخل المحرر الموحّد');
    ok(/id="cp-fav-list"/.test(cp) && /id="cp-fav-save"/.test(cp) && /id="cp-fav-code"/.test(cp)
      && /id="cp-fav-family"/.test(cp) && /id="cp-fav-warranty"/.test(cp)
      && /id="cp-fav-qty"/.test(cp) && /id="cp-fav-price"/.test(cp) && /id="cp-fav-comment"/.test(cp),
      '⭐ الواجهة: نموذج (كود + اسم + عائلة + ضمان + كمية + سعر + تعليق)');
    ok(/id="cp-fav-manage"/.test(cp) && /id="cp-fav-export"/.test(cp) && /id="cp-fav-reset"/.test(cp),
      '⭐ الواجهة: إدارة + تصدير + استعادة');
    ok(/b\.oncontextmenu = \(ev\) =>/.test(cp) && /openFavEditor\(sh, k\)/.test(cp),
      '⭐ الواجهة: كليك يمين على الشريحة يفتح تعديلها');

    // (ب) طبقة التطبيع والمخزن (تشغيل حقيقي)
    const b0 = cp.indexOf("const FAV_PARTS_KEY = 'elaraby_fav_parts';");
    const b1 = cp.indexOf('function showPartsReview(');
    ok(b0 > 0 && b1 > b0, '⭐ المخزن: كتلة الخدمة كاملة قبل لوحة المراجعة');

    const makeStore = (opts = {}) => {
      const lsData = { ...(opts.ls || {}) };
      const csData = { ...(opts.cs || {}) };
      const ls = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(lsData, k) ? lsData[k] : null),
        setItem: (k, v) => { lsData[k] = String(v); },
        removeItem: (k) => { delete lsData[k]; }
      };
      const chromeStub = opts.noChrome ? undefined : {
        storage: { local: {
          get: async (defaults) => {
            const out = {};
            Object.keys(defaults).forEach(k => {
              out[k] = Object.prototype.hasOwnProperty.call(csData, k) ? csData[k] : defaults[k];
            });
            return out;
          },
          set: async (obj) => { Object.assign(csData, obj); }
        } }
      };
      const api = new Function(
        'chrome', 'localStorage', 'safeParseJSON', 'logEvent', 'defectFamilyOf',
        'readDeviceHint', 'escapeHtml', 'setStatus', 'runExclusive', 'addSparePartPage3', 'navigator',
        cp.slice(b0, b1) + '\nreturn { favNormalizeItem, favNormalizeStore, favStorageAvailable, loadFavStore,'
        + ' saveFavStore, loadFavParts, favKeyOf, favItemFromPart, toggleFavPart, bumpFavUsage, isFavPart,'
        + ' favFindMatch, favFindItem, favMetaText, saveFavEntry, deleteFavEntry, exportFavoritesJson };'
      )(
        chromeStub, ls,
        (raw, def) => { try { return raw ? JSON.parse(raw) : def; } catch (_) { return def; } },
        () => {}, () => 'AC', () => 'AY-AP12YHE', (s) => String(s == null ? '' : s),
        (sh, msg) => { (opts.status || []).push(msg); },
        async (sh, label, fn) => fn(), async () => ({ ok: true }),
        opts.nav || { clipboard: { writeText: async () => {} } }
      );
      return { api, lsData, csData };
    };

    {
      const { api } = makeStore();
      const it = api.favNormalizeItem({ key: 'k1', code: ' ac003 ', family: 'ac', warranty: 'nope', qty: -5, price: '250', comment: 'x'.repeat(600) });
      ok(it.code === 'ac003' && it.family === 'AC' && it.warranty === '',
        '⭐ التطبيع: الكود يُقلَّم والعائلة تُكبَّر والضمان غير الصالح يُفرَّغ');
      ok(it.qty === 1 && it.price === 250 && it.comment.length === 500,
        '⭐ التطبيع: الكمية ≥ 1 والسعر رقمي والتعليق ≤ 500');
      ok(api.favNormalizeItem({}) === null && api.favNormalizeItem(null) === null,
        '⭐ التطبيع: القطعة بلا معرّف تُرفض');
      const st = api.favNormalizeStore({ items: [{ key: 'a', code: 'A1' }, { key: 'a', code: 'A2' }, { key: 'b' }] });
      ok(st.version === 2 && st.items.length === 2 && st.items[0].code === 'A1',
        '⭐ المخزن: إزالة التكرار بالمعرّف مع إبقاء أول ظهور');
      ok(JSON.stringify(api.favNormalizeStore(null)) === '{"version":2,"items":[]}',
        '⭐ المخزن: قيمة تالفة ⇒ مخزن فاضي v2');
    }

    // (ج) الترحيل من v1 ثم عدم إحياء المحذوف
    {
      const legacy = {
        elaraby_fav_parts: JSON.stringify({
          P1: { code: 'AC003', name: 'موتور مروحة', productId: 'P1', count: 3, warranty: 'out', majorCode: 'ac001', subCode: '0005', at: 111 },
          AC009: { code: 'AC009', name: 'كباس', count: 1, at: 222 }
        })
      };
      const { api, lsData, csData } = makeStore({ ls: legacy });
      const store = await api.loadFavStore();
      ok(store.items.length === 2, '⭐ الترحيل: قطعتا v1 انتقلتا إلى v2');
      const p1 = store.items.find(x => x.key === 'P1');
      ok(p1 && p1.count === 3 && p1.warranty === 'out' && p1.majorCode === 'AC001',
        '⭐ الترحيل: العدّاد/الضمان/كود العطل محفوظة');
      ok(!!csData.fav_parts_v2 && csData.fav_parts_v2.items.length === 2,
        '⭐ الترحيل: v2 مكتوب في chrome.storage.local');
      ok(!Object.prototype.hasOwnProperty.call(lsData, 'elaraby_fav_parts')
        && lsData.elaraby_fav_parts_migrated === '1',
        '⭐ الترحيل: v1 يُحذف بعد نجاح الكتابة مع علامة ترحيل');

      await api.saveFavStore({ version: 2, items: [] });
      lsData.elaraby_fav_parts = legacy.elaraby_fav_parts; // v1 «قديم» ما زال موجودًا
      const again = await api.loadFavStore(true);
      ok(again.items.length === 0, '⭐ الترحيل: لا إحياء لقطع حُذفت بعد الترحيل');
    }

    // (د) بدون chrome.storage ⇒ fallback محلي كامل الوظائف
    {
      const { api, lsData } = makeStore({ noChrome: true });
      ok(api.favStorageAvailable() === false, '⭐ fallback: غياب chrome.storage يُكتشف');
      const on = await api.toggleFavPart({ code: 'GS001', name: 'شواية', warranty: 'in', price: 120, qty: 2 });
      ok(on === true, '⭐ fallback: الإضافة تعمل بلا chrome.storage');
      ok(!!lsData.elaraby_fav_parts_v2 && api.favKeyOf({ code: 'GS001' }) === 'GS001',
        '⭐ fallback: الحفظ في localStorage v2');
      ok(api.isFavPart({ code: 'GS001' }) === true, '⭐ fallback: isFavPart يقرأ الذاكرة');
      const off = await api.toggleFavPart({ code: 'GS001' });
      ok(off === false && Object.keys(api.loadFavParts()).length === 0,
        '⭐ fallback: التبديل الثاني يحذف القطعة');
    }

    // (د٢) chrome.storage موجود لكنه فاضي (تثبيت جديد) ⇒ النسخة المحلية v2
    {
      const { api } = makeStore({
        ls: {
          elaraby_fav_parts_v2: JSON.stringify({
            version: 2, items: [{ key: 'L1', code: 'WM001', name: 'حوض', family: 'WM' }]
          })
        }
      });
      const store = await api.loadFavStore();
      ok(store.items.length === 1 && store.items[0].family === 'WM',
        '⭐ الاستعادة: مخزن chrome الفاضي لا يُخفي النسخة المحلية v2');
    }

    // (هـ) الاستخدام + التعديل + الحذف + التصدير
    {
      const status = [];
      const nav = { clipboard: { writeText: async (t) => { nav.text = t; } } };
      const { api, csData } = makeStore({ nav, status });

      const on = await api.toggleFavPart({
        code: 'AC003', name: 'موتور', productId: 'prod-1',
        warranty: 'out', price: 250, qty: 2, majorCode: 'ac001', subCode: '0005'
      });
      const item = api.loadFavParts()['prod-1'];
      ok(on === true && item && item.price === 250 && item.qty === 2
        && item.family === 'AC' && item.warranty === 'out',
        '⭐ الخدمة: ★ يخزّن العائلة + السعر + الكمية + الضمان + كود العطل');
      ok(item.count === 0 && api.isFavPart({ productId: 'prod-1' }) === true,
        '⭐ الخدمة: القطعة تبدأ بعدّاد صفر وتُعرف بمعرّف المنتج');

      await api.bumpFavUsage({ productId: 'prod-1', warranty: 'in', majorCode: 'ac002', subCode: '0007' });
      const bumped = api.loadFavParts()['prod-1'];
      ok(bumped.count === 1 && bumped.warranty === 'in'
        && bumped.majorCode === 'AC002' && bumped.subCode === '0007',
        '⭐ الخدمة: الاستخدام يزيد العدّاد ويحدّث الضمان/كود العطل');

      const vals = {
        'cp-fav-code': { value: 'AC010' }, 'cp-fav-name': { value: 'ريلاي' },
        'cp-fav-family': { value: 'AC' }, 'cp-fav-warranty': { value: 'in' },
        'cp-fav-qty': { value: '3' }, 'cp-fav-price': { value: '75' },
        'cp-fav-comment': { value: 'يُطلب غالبًا' },
        'cp-fav-save': { textContent: '' }, 'cp-fav-cancel': { style: {} }
      };
      const shadow = { getElementById: (id) => vals[id] || null };
      const saved = await api.saveFavEntry(shadow);
      ok(saved && saved.code === 'AC010' && saved.qty === 3 && saved.price === 75
        && saved.comment === 'يُطلب غالبًا',
        '⭐ التحرير: إضافة من النموذج تحفظ كل الحقول');
      const clash = await api.saveFavEntry(shadow);
      ok(clash === null, '⭐ التحرير: كود مكرر يُرفض بلا كتابة');

      ok(api.favFindMatch(Object.values(api.loadFavParts()), { productId: 'prod-x', code: 'AC010' }) >= 0
        && api.favFindItem({ code: 'ac010' }) !== null,
        '⭐ المطابقة: نفس الكود بمعرّف مختلف لا يُنشئ قطعة مكررة');
      const offDup = await api.toggleFavPart({ productId: 'prod-x', code: 'AC010' });
      ok(offDup === false && !api.favFindItem({ code: 'AC010' }),
        '⭐ المطابقة: ★ الثاني يحذف القطعة نفسها لا نسخة أخرى');

      vals['cp-fav-code'].value = 'AC010';
      vals['cp-fav-name'].value = 'ريلاي';
      vals['cp-fav-qty'].value = '3';
      vals['cp-fav-price'].value = '75';
      vals['cp-fav-comment'].value = 'يُطلب غالبًا';
      await api.saveFavEntry(shadow);
      ok(!!api.loadFavParts()['AC010'], '⭐ التحرير: إعادة الإضافة بعد الحذف تعمل');

      const meta = api.favMetaText(saved);
      ok(/عائلة AC/.test(meta) && /داخل الضمان/.test(meta) && /×3/.test(meta)
        && /75 ج\.م/.test(meta) && /يُطلب غالبًا/.test(meta) && /استُخدمت 0/.test(meta),
        '⭐ العرض: سطر الوصف يجمع العائلة + الضمان + الكمية + السعر + التعليق + الاستخدام');

      await api.exportFavoritesJson(shadow);
      const exported = JSON.parse(nav.text);
      ok(exported.version === 2 && exported.items.some(x => x.code === 'AC010')
        && exported.items.some(x => x.code === 'AC003'),
        '⭐ التصدير: JSON v2 يشمل كل القطع');

      await api.deleteFavEntry(shadow, 'AC010');
      ok(!api.loadFavParts()['AC010'] && Object.keys(api.loadFavParts()).length === 1,
        '⭐ الحذف: القطعة تُزال من المخزن');
      ok(!!csData.fav_parts_v2, '⭐ الحفظ: chrome.storage.local هو المصدر');
    }

    // (و) الحمايات المرتبطة باللوحة
    {
      ok(/fav\.family && devFam && fav\.family !== devFam/.test(cp),
        '⭐ الحماية: منع إضافة قطعة عائلة أخرى لجهاز مختلف');
      ok(/async function toggleFavPart/.test(cp) && /const on = await toggleFavPart\(/.test(cp)
        && /family: favFamilyFor\(it\.sparePart\)/.test(cp),
        '⭐ لوحة المراجعة: ★ يحفظ العائلة/الضمان/السعر ويتعامل مع الحفظ غير المتزامن');
      ok(/majorCode: linked\.majorCode \|\| it\.sparePart\.majorCode/.test(cp),
        '⭐ لوحة المراجعة: ★ يربط القطعة بكود العطل المختار في الصف');
      ok(/out\.favorites = \(_favStore/.test(cp),
        '⭐ التصدير الموحّد: كتالوج الخدمات يشمل قطع ⭐');
      ok(/loadFavStore\(\)[\s\S]{0,160}renderFavParts\(shadow\)/.test(cp),
        '⭐ الإقلاع: تحميل المخزن ثم إعادة رسم الشرائح');
      ok(/const FAV_STORE_KEY = 'fav_parts_v2'/.test(cp)
        && !/saveFavParts\(/.test(cp),
        '⭐ المخزن: مفتاح v2 واحد ولا كتابة مباشرة في v1');
    }
  }

  console.log('-- 38) ملاءمة الكود: العائلة + نوع الخدمة + حداثة البلاغ --');
  {
    const cat38 = JSON.parse(read('problem-catalog.json'));
    ok(!!(cat38.families.DW && cat38.families.DW.some(l => /أطباق/.test(l))),
      'problem-catalog: عائلة DW معرّفة (غسالة أطباق لا تُصنّف WM)');
    ok(Array.isArray(cat38.families.HT) && cat38.families.HT.includes('WH'),
      'problem-catalog: alias WH يُصنّف سخانات مياه');

    const env38 = makeEnv();
    env38.sandbox._CFG = JSON.parse(read('selectors.json'));
    env38.sandbox.loadSelectors = async () => env38.sandbox._CFG;
    env38.sandbox.fetch = async () => ({ ok: true, status: 200, json: async () => cat38 });
    load(env38.sandbox, 'shared/problem-codes.js');
    const PC38 = env38.sandbox.ProblemCodes;
    await PC38.loadCatalog();
    await PC38.loadRules();

    const LBL = 'HT34 - ( صيانة - سخانات مياه - خارج الضمان )';
    const info38 = PC38.parseProblemLabel(LBL);
    ok(info38.code === 'HT34' && info38.service === 'maintenance'
      && info38.family === 'HT' && info38.warranty === 'out',
      'problem-codes: تفكيك صف البوابة (كود/خدمة/عائلة/ضمان)');
    ok(PC38.parseProblemLabel('GS34 - ( تركيب - بوتاجاز - داخل الضمان )').service === 'install',
      'problem-codes: صف التركيب يُقرأ install');
    const plain38 = PC38.parseProblemLabel('HT01 - لا يسخن');
    ok(plain38.parsed === true && plain38.service === '' && plain38.family === 'HT',
      'problem-codes: صف بلا قوس يبقى بلا خدمة (fail-open)');

    ok(PC38.familyOf('سخانات مياه') === 'HT' && PC38.familyOf('غسالة أطباق') === 'DW'
      && PC38.familyOf('WH') === 'HT' && PC38.familyOf('Whirlpool fridge') === 'GR',
      'problem-codes: familyOf بأطول تطابق وبحدود كلمة');
    ok(PC38.familyOfCode('HT34') === 'HT' && PC38.familyOfCode('*تركيب') === '',
      'problem-codes: عائلة الكود من البادئة (HT34 معروف) والتركيب بلا عائلة');

    const f38 = PC38.filterCompatible(
      [LBL, 'GS34 - ( صيانة - بوتاجاز - خارج الضمان )', 'HT07 - ( تركيب - سخانات مياه - داخل الضمان )'],
      { device: 'سخانات مياه', service: 'maintenance' }
    );
    ok(f38.list.length === 1 && f38.list[0] === LBL
      && f38.stats.family === 1 && f38.stats.service === 1,
      'problem-codes: فلتر الملاءمة يستبعد عائلة أخرى ونوع خدمة آخر');
    ok(PC38.filterCompatible(['HT01 - لا يسخن'], { device: '', service: 'maintenance' }).list.length === 1,
      'problem-codes: جهاز مجهول ⇒ لا استبعاد (fail-open)');
    ok(PC38.filterCompatible(['GS08 - ( صيانة - بوتاجاز )'], { device: 'بوتاجاز' }).list.length === 0,
      'problem-codes: الممنوع يبقى مستبعدًا داخل فلتر الملاءمة');

    // التعلّم: لا يوسّع الاختيار العشوائي، يُصفّى بالعائلة/الخدمة، ويُحذف عند الفشل
    const pool38 = PC38.allowedCodesForDevice('سخانات مياه');
    PC38.recordOutcome('HT34', 'سخانات مياه', true, { service: 'maintenance' });
    const pool38b = PC38.allowedCodesForDevice('سخانات مياه');
    ok(pool38.length === pool38b.length && !pool38b.includes('HT34'),
      'problem-codes: الكود المتعلَّم لا يدخل مجموعة الاختيار العشوائي');
    ok(PC38.learnedCodes('سخانات مياه').includes('HT34'),
      'problem-codes: المتعلَّم يظهر اقتراحًا للجهاز نفسه');
    ok(PC38.learnedCodes('سخانات مياه', { service: 'install' }).length === 0,
      'problem-codes: الاقتراح يُصفّى بنوع الخدمة');
    ok(PC38.learnedCodes('ثلاجة').length === 0,
      'problem-codes: الاقتراح لا يتسرّب لجهاز آخر');
    PC38.recordOutcome('HT34', 'سخانات مياه', false, { service: 'maintenance' });
    ok(PC38.learnedCodes('سخانات مياه').length === 0,
      'problem-codes: فشل الكود يحذفه من الاقتراحات');

    const p2_38 = read('modules/autofill/engine-page2.js');
    ok(/let requestedCompatible = !!requestedCode/.test(p2_38)
      && /كود من عائلة أخرى/.test(p2_38) && /كود لنوع خدمة مختلف/.test(p2_38),
      'engine-page2: بوابة الملاءمة ترفض الكود غير المطابق قبل إرساله');
    ok(/PC\.filterCompatible\(available, \{ device, family, service \}\)/.test(p2_38),
      'engine-page2: available تُصفّى بالعائلة والخدمة لا بالممنوع فقط');
    ok(/service: isInstallRow \? 'install' : 'maintenance'/.test(p2_38)
      && /service,\s*\n\s*priority: priorityActualProblem/.test(p2_38),
      'engine-page2: نوع الخدمة يُمرَّر صريحًا مع الكود');
    ok(/fromCatalog = true/.test(p2_38) && /stats: compat\.stats/.test(p2_38)
      && /fromCatalog, stats: compat\.stats/.test(p2_38),
      'engine-page2: بديل الكتالوج موسوم ويُعاد مع النتيجة');
    ok(/_familyMatches\(candidate, deviceName\)/.test(p2_38),
      'engine-page2: كود الـ AI يُرفض لو من عائلة أخرى');

    const lk38 = read('modules/autofill/engine-lookups.js');
    ok(/\.slice\(0, 120\)/.test(lk38) && /\.slice\(0, 50\)/.test(lk38),
      'engine-lookups: قائمة المتاح 50 صفًا / 120 حرفًا (لا 12/70)');

    const cp38 = read('control-panel.js');
    const svcFn = cp38.slice(cp38.indexOf('function readServiceType'), cp38.indexOf('function resolveIsInstall'));
    ok(svcFn.length > 0 && svcFn.indexOf('#ats_workordertype_name') !== -1
      && svcFn.indexOf('#ats_workordertype_name') < svcFn.indexOf('#ldv_workordertype'),
      'control-panel: نوع الخدمة يُقرأ من الحقل الصريح قبل ldv');
    ok(!/if \(detectInstallation\(\)\) return true/.test(cp38),
      'control-panel: detectInstallation لم يعد يسبق الحقل الصريح');
    ok(/return 'unknown';/.test(cp38) && /service === 'unknown'/.test(cp38),
      'control-panel: الجهالة حالة مستقلة لا تُعتبر صيانة');
    ok(/function incidentKey\(\)/.test(cp38) && /PROBLEM_OPTIONS_KEY \+ ':' \+ id/.test(cp38),
      'control-panel: قائمة الاختيار مرتبطة برقم البلاغ');
    ok(/localStorage\.removeItem\(PROBLEM_OPTIONS_KEY\)/.test(cp38),
      'control-panel: المفتاح القديم غير المرتبط ببلاغ يُنظَّف');
    ok(/if \(o\.persist === true\) saveProblemOptions\(list\)/.test(cp38),
      'control-panel: الاسترجاع لا يُجدّد صلاحية القائمة');
    ok(/id="cp-problem-context"/.test(cp38) && /id="cp-problem-service"/.test(cp38),
      'control-panel: صندوق الاختيار يعرض السياق وأزرار نوع الخدمة');
    ok(/من عائلة أخرى \(\$\{codeFam\}\)/.test(cp38),
      'control-panel: حارس أخير يمنع إضافة كود عائلة أخرى');
  }

  console.log('-- 40) نسخ/لصق الأكواد: بلا تخمين + بوابة الحقول + ذاكرة الاقتران --');
  {
    const cp40 = read('control-panel.js');

    // (١) صيغ البحث: الكود كما هو أولًا ثم *كود*، والنص العربي بالعكس
    const varFn40 = cp40.slice(cp40.indexOf('function lookupSearchVariants'), cp40.indexOf('async function fillIframeLookup'));
    ok(varFn40.length > 0
      && /isCode \? \[bare, '\*' \+ bare \+ '\*'\] : \['\*' \+ bare \+ '\*', bare\]/.test(varFn40),
      'control-panel: صيغ البحث — الكود كما هو ثم بالنجمة، والنص العربي بالعكس');
    ok(/const readRows = \(\) => Array\.from\(lookupModal\.querySelectorAll\('table tbody tr'\)\)/.test(cp40),
      'control-panel: صفوف النتائج تُقرأ من نافذة البحث داخل الـ iframe');
    ok(/searchInput\.dispatchEvent\(new view\.Event\('input'/.test(cp40)
      && /const view = iframeDoc\.defaultView \|\| window/.test(cp40),
      'control-panel: أحداث البحث تُطلق من عالم الـ iframe نفسه');

    // (٢) «عرض كل الخيارات» ممنوع في الحقول المرتبطة (قائمة الفرعي غير مقيّدة بالرئيسي)
    ok(/rows\.length === 0 && searchInput && searchBtn && !opts\.noShowAll/.test(cp40),
      'control-panel: «عرض الكل» معطّل عند noShowAll');
    const subLookupLines40 = cp40.split('\n');
    const subLookupCalls40 = subLookupLines40
      .map((l, i) => (l.includes("'ats_defectcodedefectmajor_name', subSearch")
        ? subLookupLines40.slice(i, i + 4).join('\n')
        : null))
      .filter(Boolean);
    ok(subLookupCalls40.length === 2 && subLookupCalls40.every(b => b.includes('noShowAll: true')),
      'control-panel: حقلا الكود الفرعي (قطعة/عطل) يبحثان بلا «عرض الكل»');
    ok(/if \(!Array\.isArray\(res\.available\) \|\| res\.available\.length === 0\)/.test(cp40),
      'control-panel: لا قائمة اختيار بديلة عند غياب بدائل موثوقة');

    // (٣) بوابة الحقول المطلوبة قبل نقر الحفظ
    ok(/IFRAME_REQUIRED_LABELS/.test(cp40)
      && /doc\.querySelectorAll\('\[aria-required="true"\]'\)/.test(cp40),
      'control-panel: الحقول المطلوبة تُقرأ من aria-required');
    ok(/doc\.getElementById\(id \+ '_name'\) \|\| el/.test(cp40) && /isElementVisible\(disp\)/.test(cp40),
      'control-panel: قيمة الحقل المرجعي تُقرأ من <id>_name والمخفي يُتخطّى');
    ok(/reason: 'required-empty', missing/.test(cp40)
      && /saveRes\.reason === 'required-empty'/.test(cp40)
      && /البوابة تطلب/.test(cp40),
      'control-panel: الحفظ يتوقف ويسمّي الحقل الناقص بدل الرفض الصامت');

    // (٤) الاقتران اقتراح معلن قابل للمراجعة (قرار المالك 2026-10-26):
    //     ⭐/ذاكرة ← كلمات الوصف ← احتياطي. لا اقتران خفي بلا وسم ولا مراجعة.
    ok(/function pickCodeForPart\(part, codes, opts\)/.test(cp40)
      && /source: 'keywords'/.test(cp40)
      && /source: 'fallback'/.test(cp40)
      && !/pairedFaultIndices/.test(cp40),
      'control-panel: الاقتران اقتراح موسوم (كلمات/احتياطي) لا تخمين خفي');
    ok(/const usedCodeKeys = new Set\(\)/.test(cp40)
      && /if \(explicitMajor && explicitSub\)/.test(cp40),
      'control-panel: اقتران الحزمة يبقى من بيانات القطعة (majorCode/subCode)');
    ok(/const finalPairedKeys = new Set\(/.test(cp40)
      && /standaloneFaultCodes = rawFaultCodes\.filter/.test(cp40),
      'control-panel: الأكواد المستقلة تُعاد حسابتها بعد المراجعة');

    // (٥) لوحة المراجعة: لا تنفيذ بقطعة بلا كود
    ok(/emptyOpt\.textContent = '— اختر كود العطل —'/.test(cp40)
      && /sel\.value = ''/.test(cp40),
      'control-panel: القائمة تبدأ بخيار فارغ لا بأول كود');
    ok(/const missing = state\.filter\(s => !s\.faultCode\)/.test(cp40)
      && /لا توجد أكواد أعطال في الحزمة/.test(cp40),
      'control-panel: المراجعة تمنع التنفيذ بقطعة بلا كود عطل');

    // (٦) ذاكرة اقتران مُثبتة بالتجربة (تُسجَّل بعد حفظ ناجح فقط)
    ok(/const PART_PAIRING_KEY = 'elaraby_part_pairing_v1'/.test(cp40)
      && /function recordPartPairing\(/.test(cp40)
      && /function lookupPartPairing\(/.test(cp40),
      'control-panel: ذاكرة اقتران القطعة ← كود العطل موجودة بمفتاح v1');
    ok(/recordPartPairing\(spObj, majorPicked, subPicked\)/.test(cp40),
      'control-panel: الاقتران يُسجَّل بعد حفظ ناجح لا قبل');
    ok(/lookupPartPairing\(part\)/.test(cp40) && /pickCodeForPart\(it\.sparePart, codes/.test(cp40),
      'control-panel: المراجعة تقترح الاقتران المحفوظ تجريبيًا');
    ok(/function codeTokenOf\(/.test(cp40) && /codeTokenOf\(r\.text/.test(cp40),
      'control-panel: الكود المستخلص من نص الصف يُسجَّل لا النص الكامل');

    // (٧) رفض النماذج التي لا تحفظ شيئًا
    ok(/reason: 'no-fault-code'/.test(cp40)
      && /reason: 'need-major-and-sub'/.test(cp40),
      'control-panel: النموذجان يرفضان العمل بلا رئيسي+فرعي');

    // (٨) التوثيق المرجعي للموجة
    const chg40 = read('../../CHANGELOG.md');
    ok(/الموجة 40/.test(chg40) || /الموجة ٤٠/.test(chg40),
      'CHANGELOG: الموجة 40 موثّقة');
  }

  console.log('-- 41) صفحة ٣: لوحة سحب أكواد الأعطال على القطع + تبديل --');
  {
    const cp41 = read('control-panel.js');
    const board41 = cp41.slice(cp41.indexOf('function showPartsReview'), cp41.indexOf('// ── صيغ البحث في نافذة lookup'));

    // وحدة السحب = زوج (رئيسي|فرعي) — الفرعيان المختلفان لا يُدمجان
    ok(/const codeKey = \(c\) => String\(\(c && c\.majorCode\) \|\| ''\)\.trim\(\) \+ '\|' \+ String\(\(c && c\.defectCode\) \|\| ''\)\.trim\(\)/.test(board41),
      'control-panel: مفتاح الزوج = رئيسي|فرعي (لا دمج بالوصف)');
    ok(/cp-code-pool/.test(board41) && /cp-code-chip/.test(board41) && /chip\.draggable = true/.test(board41),
      'control-panel: أكواد الأعطال chips قابلة للسحب في قائمة الحزمة');
    ok(/cp-part-slot/.test(board41) && /slot\.addEventListener\('drop'/.test(board41),
      'control-panel: كل قطعة هدف إفلات مستقل');

    // النقل/التبديل: الإفلات من قطعة أخرى يفكّ ربط المصدر
    ok(/const assign = \(index, code, src, moveFrom\) => \{[\s\S]{0,220}state\[moveFrom\]\.faultCode = null/.test(board41),
      'control-panel: السحب من قطعة إلى أخرى يبدّل ويحرّر القديمة');
    ok(/pool\.addEventListener\('drop'[\s\S]{0,300}unassign\(from\)/.test(board41),
      'control-panel: الإفلات على القائمة يفكّ الربط');
    ok(/const unassign = \(index\) => \{[\s\S]{0,200}refreshAll\(\);[\s\S]{0,60}\};/.test(board41),
      'control-panel: زر ✕ يزيل الربط');

    // بديل بلا سحب (نقر للتحديد ثم نقر على القطعة)
    ok(/let armed = null/.test(board41) && /if \(!armed\) return/.test(board41),
      'control-panel: بديل النقر — تلتقط كودًا ثم تنقره على القطعة');

    // مصدر الاقتران ظاهر لكل صف
    ok(/SOURCE_LABEL = \{[\s\S]{0,240}bundle: \['📋'[\s\S]{0,120}fav: \['⭐'/.test(board41)
      && /memory: \['🧠'/.test(board41) && /manual: \['✋'/.test(board41),
      'control-panel: مصدر كل اقتران ظاهر (📋 ⭐ 🧠 ✋)');

    // الأكواد بلا قطعة تُعدّ وتُوجَّه لزر كود العطل
    ok(/const unlinked = codes\.filter\(c => usageOf\(codeKey\(c\)\) === 0\)\.length/.test(board41)
      && /بلا قطعة/.test(board41),
      'control-panel: عدّاد «بلا قطعة» (تُضاف من زر كود العطل)');

    // القائمة المنسدلة تبقى كبديل
    ok(/if \(codes\.length\) \{[\s\S]{0,200}document\.createElement\('select'\)/.test(board41),
      'control-panel: القائمة المنسدلة بديل للسحب');

    // التحقق يعلّم الخانة الناقصة
    ok(/slots\.forEach\(\(s, idx\) => \{ if \(!state\[idx\]\.faultCode\) s\.classList\.add\('missing'\)/.test(board41),
      'control-panel: التحقق يعلّم القطعة بلا كود عند التنفيذ');

    // الأنماط
    const css41 = cp41.slice(cp41.indexOf('.cp-code-pool{'), cp41.indexOf('.cp-fav-parts{'));
    ok(/\.cp-code-pool\{/.test(css41) && /\.cp-part-slot\.filled\{/.test(css41)
      && /\.cp-part-slot\.drag-over\{/.test(css41) && /\.cp-code-chip\.dragging\{/.test(css41),
      'control-panel: أنماط اللوحة (خانة ممتلئة/سحب/إفلات)');
  }

  console.log('-- 42) صفحة ٣: التحقق البعدي من الشبكة (لا يكفي إغلاق النموذج) --');
  {
    const cp42 = read('control-panel.js');

    ok(/function verifyPartRow\(partCode\)/.test(cp42)
      && /function verifyDefectPair\(majorCode, subCode\)/.test(cp42)
      && /function readSubgridRows\(ids\)/.test(cp42),
      'control-panel: دوال تحقق تقرأ الشبكة فعليًا');
    ok(/const PARTS_GRID_IDS = \[[^\]]*InventoryAdjustmentProduct_Subgrid/.test(cp42)
      && /const DEFECT_GRID_IDS = \[[^\]]*WorkOrder_defect/.test(cp42),
      'control-panel: معرّفات شبكات القطع والأعطال مركزية');
    ok(/td\[data-attribute="' \+ attr \+ '"\]/.test(cp42)
      && /gridCellOf\(r, 'ats_defectmajor'\)/.test(cp42)
      && /gridCellOf\(r, 'ldv_defect'\)/.test(cp42),
      'control-panel: مطابقة الزوج من خلايا ats_defectmajor + ldv_defect');

    // يُستدعى بعد الحفظ الناجح لا قبله
    const save42 = cp42.slice(cp42.indexOf("const saveRes = await saveIframeForm(iframeDoc, modal, 'قطعة الغيار')"), cp42.indexOf('async function addSingleFaultCode'));
    ok(/if \(saveRes\.ok\) \{[\s\S]{0,400}verifyPartRow\(/.test(save42)
      && /verifyDefectPair\(majorPicked, subPicked\)/.test(save42),
      'control-panel: القطعة تُتحقق بعد الحفظ (قطعة + صف العطل)');
    ok(/verified, verify: \{ part: vPart, defect: vDefect \}/.test(cp42),
      'control-panel: نتيجة التحقق تُعاد للمنادي');

    const code42 = cp42.slice(cp42.indexOf('async function addSingleFaultCode'), cp42.indexOf('async function pasteCodesAction'));
    ok(/if \(saveRes\.ok\) \{[\s\S]{0,300}verifyDefectPair\(mainSearch, subSearch\)/.test(code42)
      && /verified: vDefect\.ok/.test(code42),
      'control-panel: كود العطل يُتحقق بعد الحفظ');

    ok(/const unverified = \[\]/.test(cp42)
      && /if \(res\.verified === false\) unverified\.push/.test(cp42)
      && /بلا تحقق فعلي/.test(cp42),
      'control-panel: الأكواد/القطع غير المتحققة تُعدّ وتُعرض للمستخدم');
  }

  console.log('-- 43) Task 1.1: قراءة كل الصفحات + لوحة النسخ + منتج واحد --');
  {
    const cp43 = read('control-panel.js');
    const grid43 = cp43.slice(cp43.indexOf('const GRID_PAGE_WAIT_MS'), cp43.indexOf('function readPartsFromGrid()'));

    // ١.١.أ — قراءة كل صفحات الشبكة
    ok(/const GRID_PAGE_WAIT_MS = 7000/.test(grid43) && /const GRID_MAX_PAGES = 15/.test(grid43),
      'control-panel: حدود انتظار/صفحات صريحة لقراءة الشبكة');
    ok(/const declared = parseInt\(pager\.getAttribute\('data-pages'\)[\s\S]{0,260}const maxLink = nums\.length \? Math\.max\(\.\.\.nums\) : 0;[\s\S]{0,80}Math\.max\(1, declared, maxLink\)/.test(grid43),
      'control-panel: عدد الصفحات = الأكبر بين data-pages وروابط data-page (البوابة تكتب data-pages="1" مع وجود صفحة ٢)');
    ok(/pager\.querySelector\('a\[data-page="' \+ page \+ '"\]'\)/.test(grid43)
      && /link\.click\(\)/.test(grid43)
      && /gridCurrentPage\(root\) !== beforePage \|\| nowSig !== beforeSig/.test(grid43),
      'control-panel: الانتقال لصفحة عبر a[data-page] وانتظار تغيّر فعلي (لا sleep أعمى)');
    ok(/const totalPages = Math\.min\(gridPageCount\(root\), o\.maxPages \|\| GRID_MAX_PAGES\)/.test(grid43)
      && /for \(let p = 2; p <= totalPages; p\+\+\)/.test(grid43)
      && /if \(gridCurrentPage\(root\) !== 1\) await gotoGridPage\(root, 1, rowSelector\)/.test(grid43),
      'control-panel: يقرأ ٢..N ثم يُرجع الشبكة للصفحة ١');
    ok(/async function readPartsFromGridAllPages\(\)/.test(grid43)
      && /const key = p\.rowId \|\| `\$\{p\.code \|\| ''\}\|\$\{p\.fullName \|\| ''\}\|\$\{p\.qty\}`/.test(grid43)
      && /if \(seen\.has\(key\)\) return;/.test(grid43),
      'control-panel: قطع الغيار من كل الصفحات بلا تكرار (rowId)');

    const defect43 = cp43.slice(cp43.indexOf('function extractDefectCodesOnce'), cp43.indexOf('async function copyCodesAction'));
    ok(!/shadow/.test(cp43.slice(cp43.indexOf('function extractDefectCodesOnce'), cp43.indexOf('async function extractFaultCodesFromPage'))),
      'control-panel: استخراج الأعطال منفصل عن اللوحة (قابل للتكرار لكل صفحة)');
    ok(/async function extractFaultCodesFromPage\(shadow\)/.test(defect43)
      && /forEachGridPage\(defectRoot\.root, 'table tbody tr', \(\) => extractDefectCodesOnce\(\)\)/.test(defect43)
      && /await readPartsFromGridAllPages\(\)/.test(defect43),
      'control-panel: الحزمة تقرأ كل صفحات الأعطال وكل صفحات القطع');
    ok(/const bundle = await extractFaultCodesFromPage\(shadow\)/.test(cp43),
      'control-panel: زر النسخ ينتظر انتهاء القراءة (async)');
    ok(/gridPages: \{[\s\S]{0,200}defectsTotal/.test(defect43),
      'control-panel: عدد الصفحات المقروءة يُسجَّل في الحزمة');

    // ١.١.ج — منتج واحد من الصفحة/الموديل
    ok(/function readProductContext\(\)/.test(cp43)
      && /readLookup\('#ats_modelid_name, #ats_modelid'\)/.test(cp43)
      && /readLookup\('#ats_actualmodel_name, #ats_actualmodel'\)/.test(cp43)
      && /defectFamilyOf\(modelName \|\| device \|\| ''\)/.test(cp43),
      'control-panel: سياق المنتج من الموديل/الصفحة (لا تخمين)');
    ok(/product: readProductContext\(\),/.test(cp43),
      'control-panel: الحزمة تحمل product \{ model, family, ... \}');

    // ١.١.ب — لوحة النسخ بالسحب والإفلات
    const board43 = cp43.slice(cp43.indexOf('function renderCopyBoard'), cp43.indexOf('async function copyCodesAction'));
    ok(/<div id="cp-copy-board" class="cp-copy-board"/.test(cp43),
      'control-panel: حاوية لوحة النسخ في الصفحة ٣');
    ok(/function renderCopyBoard\(shadow, bundleIn\)/.test(board43)
      && /safeParseJSON\(localStorage\.getItem\('elaraby_copied_codes_bundle'\), null\)/.test(board43),
      'control-panel: اللوحة تُستعاد من الحزمة المنسوخة عند فتح الصفحة');
    ok(/p\.majorCode = String\(code\.majorCode \|\| ''\)\.trim\(\);[\s\S]{0,120}p\.subCode = String\(code\.defectCode \|\| ''\)\.trim\(\);/.test(board43),
      'control-panel: السحب يكتب الزوج الصحيح (majorCode/subCode) على القطعة');
    ok(/localStorage\.setItem\('elaraby_copied_codes_bundle', JSON\.stringify\(bundle\)\)/.test(board43),
      'control-panel: الاقتران يُحفظ في الحزمة فورًا');
    ok(/const on = await toggleFavPart\(\{[\s\S]{0,300}majorCode: String\(p\.majorCode \|\| ''\)\.trim\(\),[\s\S]{0,120}subCode: String\(p\.subCode \|\| ''\)\.trim\(\)/.test(board43),
      'control-panel: ⭐ من شاشة النسخ يُحفظ بالاقتران (لا بلا اقتران)');
    ok(/\.filter\(\(\[, v\]\) => !fam \|\| !v\.family \|\| String\(v\.family\)\.toUpperCase\(\) === fam\)/.test(board43),
      'control-panel: ⭐ المعروضة = الخاصة بعائلة هذا المنتج فقط');
    ok(/const fam = String\(product\.family \|\| ''\)\.toUpperCase\(\)/.test(board43),
      'control-panel: عائلة المنتج موحّدة الحالة (UPPER) للمقارنة');
    ok(/if \(from >= 0 && from !== i && parts\[from\]\) \{[\s\S]{0,160}parts\[from\]\.majorCode = ''/.test(board43),
      'control-panel: السحب من قطعة لأخرى يحرّر القديمة (تبديل لا نسخ)');
    ok(/pool\.addEventListener\('drop'[\s\S]{0,260}parts\[from\]\.majorCode = ''/.test(board43),
      'control-panel: الإفلات على القائمة يفكّ الربط');
    ok(/parts\.some\(p => favKeyOf\(p\) === k\)/.test(board43) && /fromFav: true/.test(board43),
      'control-panel: إضافة ⭐ إلى الحزمة بلا تكرار');

    const cssStart43 = cp43.indexOf('.cp-copy-board{');
    const css43 = cp43.slice(cssStart43, cssStart43 + 700);
    ok(/\.cp-copy-board\{/.test(css43) && /\.cp-copy-head\{/.test(css43) && /\.cp-copy-part\{/.test(css43),
      'control-panel: أنماط لوحة النسخ');
  }

  console.log('-- 44) Task 2.ب/ج: البحث بكلمة من الوصف (نجمة) + مسح متسلسل بالكود --');
  {
    const cp44 = read('control-panel.js');
    const words44 = cp44.slice(cp44.indexOf('const DESC_STOP_WORDS'), cp44.indexOf('async function fillIframeLookup'));
    const tier44 = cp44.slice(cp44.indexOf('const targetIsCode'), cp44.indexOf('// ── مطابقة مرتّبة بالنقاط'));

    // استخراج كلمات الوصف
    ok(/function lookupDescriptionWords\(description, max\)/.test(words44)
      && /\.replace\(\/\^\[A-Za-z\]\{2\}\\s\?\\d\{3,4\}\\s\*\[-–—_\]\\s\*\/, ''\)/.test(words44),
      'control-panel: كلمات الوصف تُستخرج بعد إزالة كود البداية');
    ok(/if \(t\.length < 3\) return;/.test(words44)
      && /if \(\/\^\\d\+\$\/\.test\(t\)\) return;/.test(words44)
      && /DESC_STOP_WORDS\.test\(t\)/.test(words44)
      && /return out\.slice\(0, max \|\| 4\);/.test(words44),
      'control-panel: تجاهل القصير/الأرقام/كلمات الوقف + حد ٤ كلمات');

    // قراءة الكود من الصف حرفيًا (لا بالوصف)
    ok(/const ROW_CODE_RE = \/\(\?<!\[A-Za-z0-9\]\)/.test(words44)
      && /\(\[A-Za-z\]\{2\}\)\\s\?\(\\d\{3,4\}\)/.test(words44),
      'control-panel: الكود يُقرأ من نص الصف (يتحمّل "RF 1102")');
    ok(/function rowMatchesCode\(text, code\)[\s\S]{0,220}codesInRowText\(text\)\.includes\(want\)/.test(words44),
      'control-panel: المطابقة حرفية بالكود لا بالوصف');

    // الدور الثالث لا يعمل إلا عند فشل الكود
    ok(/const targetIsCode = \/\^\[A-Za-z\]\{2\}\\s\?\\d\{3,4\}/.test(tier44)
      && /if \(targetIsCode && !rows\.some\(r => rowMatchesCode\(r\.innerText \|\| '', target\)\)\) \{/.test(tier44),
      'control-panel: الدور الثالث مشروط بغياب الكود من كل الصفوف');
    ok(/const variant = '\*' \+ word \+ '\*';/.test(tier44),
      'control-panel: كلمة الوصف تُبحث بالنجمة *كلمة*');

    // مسح متسلسل: أول صف كوده == المطلوب، وغيره يُرفض
    ok(/const hit = cand\.find\(r => rowMatchesCode\(r\.innerText \|\| '', target\)\);/.test(tier44)
      && /rows = \[hit\];/.test(tier44),
      'control-panel: مسح متسلسل — أول صف يحمل الكود المطلوب');
    ok(/أرجعت \$\{cand\.length\} صفًا بلا الكود \$\{target\}/.test(tier44)
      && /codesInRowText\(r\.innerText \|\| ''\)/.test(tier44),
      'control-panel: الأكواد المرفوضة تُسجَّل في اللوج');

    // لا اختيار تلقائي عند نفاد الصفوف — تُعرض كبدائل فقط
    ok(/if \(!rows\.some\(r => rowMatchesCode\(r\.innerText \|\| '', target\)\) && descRows\.length\) \{[\s\S]{0,120}rows = descRows;/.test(tier44)
      && /لا اختيار تلقائي/.test(tier44),
      'control-panel: نفاد الصفوف ⇒ بدائل للعرض فقط (لا اختيار تلقائي)');

    // التمرير من fillLookupWithPick والمواضع الثلاثة
    ok(/const descriptionWords = Array\.isArray\(opts\.descriptionWords\)[\s\S]{0,120}lookupDescriptionWords\(opts\.description \|\| '', 4\)/.test(cp44)
      && /const runOpts = \{ \.\.\.opts, descriptionWords \};/.test(cp44),
      'control-panel: كلمات الوصف تُحسب مرة واحدة وتُمرَّر للبحث');
    ok(/description: faultCodeObj\?\.description \|\| faultCodeObj\?\.fullCode \|\| subSearch/.test(cp44)
      && /description: faultCodeObj\?\.majorName \|\| majorSearch/.test(cp44)
      && /description: spObj\.name \|\| spObj\.fullName \|\| ''/.test(cp44),
      'control-panel: الرئيسي/الفرعي/القطعة تُمرّر وصفها للبحث الاحتياطي');
  }

  console.log('-- 45) Task 2.أ: بوابة الاتساق الفوري قبل الحفظ --');
  {
    const cp45 = read('control-panel.js');
    const add45 = cp45.slice(cp45.indexOf('async function addSparePartPage3'), cp45.indexOf('async function addSingleFaultCode'));

    ok(/function sameCode\(a, b\)[\s\S]{0,200}return !!A && !!B && A === B;/.test(cp45),
      'control-panel: مقارنة الكود تتجاوز المسافات والحالة (RF 1102 = RF1102)');

    // الرئيسي: المختار = المطلوب
    ok(/const expectedMajor = codeTokenOf\(faultCodeObj\?\.majorCode \|\| majorSearch\) \|\| majorSearch;/.test(add45)
      && /if \(!sameCode\(majorPicked, expectedMajor\)\)[\s\S]{0,300}reason: 'major-mismatch', picked: majorPicked, expected: expectedMajor/.test(add45),
      'control-panel: بوابة الرئيسي — توقّف لو المختار ≠ المطلوب');

    // الفرعي: المختار = المطلوب (يقبل defectCode/fullCode)
    ok(/const expectedSubs = \[subSearch, faultCodeObj\?\.defectCode, faultCodeObj\?\.fullCode\]/.test(add45)
      && /if \(!expectedSubs\.some\(e => sameCode\(e, subPicked\)\)\)[\s\S]{0,300}reason: 'sub-mismatch'/.test(add45),
      'control-panel: بوابة الفرعي — توقّف لو المختار ≠ المطلوب');

    // القطعة: صفر نتائج ⇒ زوج غير متسق، ولا حفظ
    ok(/const inconsistent = r\.reason === 'no-match' \|\| r\.reason === 'user-skipped';/.test(add45)
      && /reason: inconsistent \? 'pair-inconsistent' : `part-\$\{r\.reason \|\| 'failed'\}`/.test(add45)
      && /pair,\s*\n\s*part: partCodeOnly \|\| partSearch/.test(add45),
      'control-panel: القطعة غير موجودة في الفرعي ⇒ pair-inconsistent مع الزوج والقطعة');
    ok(/await closeModalSafely\(modal, 'قطعة غير موجودة في قائمة الكود الفرعي'\)/.test(add45),
      'control-panel: تُغلق النافذة بلا محاولة حفظ عند الزوج غير المتسق');

    // أسباب مقروءة + تجميع الفشل في التقرير
    ok(/function partFailureReason\(res\)/.test(cp45)
      && /'pair-inconsistent'[\s\S]{0,160}غير متسق/.test(cp45)
      && /'sub-mismatch'[\s\S]{0,120}≠ المطلوب/.test(cp45),
      'control-panel: أسباب الفشل تُترجم إلى رسائل مفهومة');
    ok(/const failedParts = \[\];/.test(cp45)
      && /failedParts\.push\(`\$\{label\} — \$\{why\}`\)/.test(cp45)
      && /failedParts\.push\(`\$\{title\} — \$\{why\}`\)/.test(cp45)
      && /لم تُضف \(\$\{failedParts\.length\}\)/.test(cp45),
      'control-panel: العناصر غير المضافة تُجمع وتُعرض في التقرير');
  }

  console.log('-- 46) Task 2.د/هـ: 🪙 فلتر التكلفة + ذاكرة رفض الأزواج --');
  {
    const cp46 = read('control-panel.js');
    const cost46 = cp46.slice(cp46.indexOf('const COST_TRIGGER_WORDS'), cp46.indexOf('function showPartsReview'));

    // (١) كلمات التكلفة: تُطبَّع عربيًا قبل المطابقة (ة/ه، التشكيل)
    ok(/const COST_TRIGGER_WORDS = \['بتكلفة', 'بالتكلفة'\];/.test(cost46)
      && /function hasCostTrigger\(text\)[\s\S]{0,160}normalizeAr\(text\)[\s\S]{0,160}COST_TRIGGER_WORDS\.some\(w => t\.includes\(normalizeAr\(w\)\)\)/.test(cost46),
      'control-panel: كلمات التكلفة تُطابَق بعد التطبيع العربي');
    ok(/function markCostCode\(code\)[\s\S]{0,200}code\.cost = hasCostTrigger\(codeTextOf\(code\)\);/.test(cost46)
      && /function isCostCode\(code\)[\s\S]{0,200}if \(code\.cost === true\) return true;/.test(cost46),
      'control-panel: وسم 🪙 يُحسب من نص الكود ويُقرأ لاحقًا');

    // اختبار وظيفي مباشر للدوال النقية
    try {
      const normalizeAr46 = (x) => String(x || '').toLowerCase()
        .replace(/[\u064B-\u0652\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[_\u2012\u2013\u2014()\[\]:,،.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const docStub46 = { createElement: () => ({ classList: { add() {} }, textContent: '', title: '' }) };
      const api46 = new Function('normalizeAr', 'document',
        cost46 + '\nreturn { hasCostTrigger, isCostCode, markCostCode };')(normalizeAr46, docStub46);
      ok(api46.hasCostTrigger('RF1102 - كباس بتكلفة') === true
        && api46.hasCostTrigger('RF1102 - كباس بالتكلفه') === true
        && api46.hasCostTrigger('RF1102 - كباس أوفرلود') === false
        && api46.hasCostTrigger('') === false,
        'control-panel: hasCostTrigger يلتقط «بتكلفة/بالتكلفة» ولا ينذر كذبًا');
      const marked46 = api46.markCostCode({ defectCode: 'RF1102', description: 'RF1102 - كباس بتكلفة' });
      ok(marked46.cost === true && api46.isCostCode({ description: 'كباس' }) === false,
        'control-panel: markCostCode يوسم الكود المكلِّف فقط');
    } catch (e) {
      ok(false, 'control-panel: تشغيل دوال 🪙 فشل — ' + (e && e.message));
    }

    // (٢) الوسم يُحسب مرة واحدة عند الاستخراج (كل المسارات)
    ok((cp46.match(/return faultCodes\.map\(markCostCode\);/g) || []).length === 1
      && /faultCodes: faultCodes\.map\(markCostCode\),/.test(cp46),
      'control-panel: أكواد الحزمة تُوسم بـ 🪙 عند الاستخراج');

    // (٣) الشارة تظهر في لوحة المراجعة ولوحة النسخ والقائمة
    ok((cp46.match(/chip\.classList\.add\('cost'\)/g) || []).length === 2
      && (cp46.match(/chip\.appendChild\(costBadge\(code\)\);/g) || []).length === 2,
      'control-panel: شارة 🪙 على رقاقة الكود في لوحتي المراجعة والنسخ');
    ok(/\? ' 🪙' : ''\)/.test(cp46)
      && /opt\.textContent = o\.cost \? '🪙 ' \+ label : label;/.test(cp46)
      && /const text = String\(isObj \? \(o\.text \|\| ''\) : \(o \|\| ''\)\)\.trim\(\);/.test(cp46),
      'control-panel: 🪙 يظهر في قائمة الاختيار اليدوي (وقيمة الخيار تبقى نصًا نظيفًا)');

    // (٤) لا اختيار تلقائي لكود مكلِّف — الاختيار اليدوي هو التأكيد
    ok(/if \(!opts\.allowCost && hasCostTrigger\(best\.text\)\)/.test(cp46)
      && /reason: 'cost-confirm', searched: target, available, cost: true/.test(cp46),
      'control-panel: البحث لا يختار كودًا مكلِّفًا تلقائيًا');
    ok(/res\.reason === 'no-match' \|\| res\.reason === 'cost-confirm'/.test(cp46)
      && /exactText: pick, allowCost: true/.test(cp46),
      'control-panel: الاختيار اليدوي المكلِّف يمرّ مرة واحدة بلا حلقة');
    ok(/const costConfirmed = !!\(faultCodeObj && faultCodeObj\.costConfirmed\);/.test(cp46)
      && (cp46.match(/allowCost: costConfirmed/g) || []).length === 2,
      'control-panel: تأكيد لوحة المراجعة ينتقل للرئيسي والفرعي بلا تكرار');

    // (٥) تأكيد صريح في لوحة المراجعة (نقرتان)
    ok(/const costCodes = state\.filter\(s => isCostCode\(s\.faultCode\)\);/.test(cp46)
      && /okBtn\.textContent = `🪙 تأكيد التكلفة والتنفيذ \(\$\{costCodes\.length\}\)`;/.test(cp46)
      && /if \(costCodes\.length && !costArmed\)/.test(cp46)
      && /costConfirmed: true/.test(cp46),
      'control-panel: لوحة المراجعة تطلب تأكيدًا صريحًا للكود المكلِّف');

    // (٦) ذاكرة رفض الأزواج
    ok(/function recordPartPairingFailure\(sp, majorCode, subCode, reason\)/.test(cp46)
      && /failed: true/.test(cp46)
      && /reason: String\(reason \|\| 'failed'\)\.slice\(0, 120\)/.test(cp46),
      'control-panel: الزوج الفاشل يُسجَّل مع السبب');
    ok(/return \(rec && rec\.majorCode && rec\.subCode && !rec\.failed\) \? rec : null;/.test(cp46),
      'control-panel: الاقتران الفاشل لا يُقترح من الذاكرة');
    ok(/function pairFailureOf\(sp, majorCode, subCode\)/.test(cp46)
      && /if \(pairFailureOf\(part, major, sub\)\) continue;/.test(cp46),
      'control-panel: ⭐ لا تُقترح إن كان زوجها نفسه مسجَّلًا فاشلًا');
    ok(/recordPartPairingFailure\(job\.sparePart, fc\.majorCode, fc\.defectCode, why\);/.test(cp46),
      'control-panel: فشل الحفظ الفعلي هو ما يسجّل الزوج الفاشل');
  }

  console.log('-- 47) إصلاح الاستخراج: جداول leaf + فلاتر نظافة + إغلاق المودال + بوابة خطأ البوابة --');
  {
    const cp47 = read('control-panel.js');

    // (١) مساعدات الجداول: الجدول الـleaf فقط + رؤوس/صفوف الجدول نفسه (:scope)
    ok(/function isLeafTable\(tbl\)[\s\S]{0,140}return !tbl\.querySelector\('table'\);/.test(cp47),
      'control-panel: isLeafTable ترفض جدول التخطيط الخارجي (يحوي جداول متداخلة)');
    ok(/function ownHeaderCells\(tbl\)[\s\S]{0,220}:scope > thead > tr > th/.test(cp47),
      'control-panel: ownHeaderCells تقرأ رؤوس الجدول نفسه فقط');
    ok(/function ownBodyRows\(tbl\)[\s\S]{0,160}:scope > tbody > tr/.test(cp47),
      'control-panel: ownBodyRows تقرأ صفوف الجدول نفسه فقط');
    ok(/function isHeaderRow\(tr\)[\s\S]{0,200}tr\.querySelector\('th'\)[\s\S]{0,200}td\[data-attribute\][\s\S]{0,220}كود\\s\*العطل\\s\*الرئيسي/.test(cp47),
      'control-panel: isHeaderRow ترفض صف الرؤوس المرسوم داخل tbody');

    // (٢) الفحص العام لم يعد يقرأ جدول التخطيط ولا صف الرؤوس ولا مدخلًا بلا كود
    ok(/if \(!isLeafTable\(table\)\) return;/.test(cp47)
      && /const ths = ownHeaderCells\(table\)\.map/.test(cp47)
      && /ownBodyRows\(table\)\.forEach\(tr => \{[\s\S]{0,120}if \(isHeaderRow\(tr\)\) return;/.test(cp47)
      && /if \(!isValidDefectEntry\(entry\)\) return;/.test(cp47),
      'control-panel: الفحص العام يقرأ leaf فقط ويُسقط الرؤوس والمدخلات غير الصالحة');
    ok(!/querySelectorAll\('thead th, tr:first-child th'\)/.test(cp47),
      'control-panel: لا يوجد أي استخدام متبقٍ لمحدد الرؤوس المتشعّب');

    // (٣) فلتر القطع: الجداول الـleaf + رؤوس/صفوف الجدول نفسه
    ok(/const tables = Array\.from\(doc\.querySelectorAll\('div\.view-grid table, table'\)\)\.filter\(isLeafTable\);/.test(cp47)
      && /const ths = ownHeaderCells\(tbl\)\.map/.test(cp47)
      && /rows = ownBodyRows\(tbl\);/.test(cp47),
      'control-panel: بديل قطع الغيار العام يقرأ الجدول الـleaf نفسه فقط');

    // (٤) دوال الفلترة — اختبار وظيفي مباشر
    try {
      const start = cp47.indexOf('const DEFECT_CODE_RE');
      const end = cp47.indexOf('// حزمة قديمة مخزَّنة');
      ok(start > 0 && end > start, 'control-panel: مقطع دوال الفلترة موجود وقابل للاستخراج');
      const api47 = new Function(cp47.slice(start, end)
        + '\nreturn { isValidDefectCode, isValidDefectEntry, isValidPartCode };')();
      ok(api47.isValidDefectCode('RF1102') === true
        && api47.isValidDefectCode('VH0101') === true
        && api47.isValidDefectCode('VH0101 - كابينة') === false
        && api47.isValidDefectCode('1.000') === false
        && api47.isValidDefectCode('كود العطل الرئيسي') === false
        && api47.isValidDefectCode('') === false,
        'control-panel: نمط كود العطل = بادئة حرفين + ٣–٤ أرقام (ويرفض الأثاث/الأسعار)');
      ok(api47.isValidDefectEntry({ majorCode: 'RF3600', defectCode: 'RF3607' }) === true
        && api47.isValidDefectEntry({ fullCode: '1.000' }) === false
        && api47.isValidDefectEntry(null) === false,
        'control-panel: المدخل يُقبل فقط لو حمل كودًا حقيقيًا في أحد حقوله');
      ok(api47.isValidPartCode('WM-TH-BRAK-WIRE-G') === true
        && api47.isValidPartCode('EG-W6226000701') === true
        && api47.isValidPartCode('RF-T-O-LODCOM75-4') === true
        && api47.isValidPartCode('1.000') === false
        && api47.isValidPartCode('قطعة غيار') === false,
        'control-panel: كود القطعة يقبل النمط المشرّط ويرفض الأسعار/النصوص');
    } catch (e) {
      ok(false, 'control-panel: تشغيل دوال الفلترة فشل — ' + (e && e.message));
    }

    // (٥) الفلاتر مطبَّقة فعليًا في مسار الاستخراج
    ok(/if \(!isValidDefectEntry\(c\)\) \{[\s\S]{0,220}rejected\.push\(label\);/.test(cp47)
      && /if \(rejected\.length\) \{[\s\S]{0,160}🧹 رُفض/.test(cp47),
      'control-panel: pushAll يرفض المدخلات غير الصالحة ويسجّلها');
    ok(/if \(code && !isValidPartCode\(code\)\) \{[\s\S]{0,160}code = '';/.test(cp47),
      'control-panel: كود القطعة غير الصالح يُسقَط ويُبقى الاسم');

    // (٦) تنظيف الحزمة القديمة المخزَّنة عند كل قراءة
    ok(/function sanitizeStoredBundle\(bundle\)/.test(cp47)
      && (cp47.match(/sanitizeStoredBundle\(safeParseJSON\(/g) || []).length === 2
      && /if \(bundle\) sanitizeStoredBundle\(bundle\);/.test(cp47)
      && /bundle = sanitizeStoredBundle\(bundle\);/.test(cp47),
      'control-panel: الحزمة المخزَّنة تُنظَّف عند العرض واللصق ولوحة النسخ');

    // (٧) إغلاق المودال قبل النسخ (وإلا قراءة ناقصة)
    const iClose = cp47.indexOf("await closeModalSafely(m, 'نسخ الأكواد')");
    const iExtract = cp47.indexOf('const bundle = await extractFaultCodesFromPage(shadow);');
    ok(iClose > 0 && iExtract > iClose
      && /const openModals = \[\];/.test(cp47)
      && /clearOrphanBackdrops\('نسخ الأكواد'\)/.test(cp47),
      'control-panel: نسخ الأكواد يُغلق أي مودال مفتوح قبل الاستخراج');

    // (٨) بوابة خطأ البورتال أثناء الترقيم
    ok(/function gridErrorTextVisible\(\)/.test(cp47)
      && /error\\s\*completing\\s\*request/i.test(cp47)
      && /const errText = gridErrorTextVisible\(\);[\s\S]{0,260}aborted = true;[\s\S]{0,60}break;/.test(cp47)
      && /return \{ pages, totalPages, aborted \};/.test(cp47),
      'control-panel: خطأ «Error completing request» يوقف الترقيم ويعتمد ما قُرئ');
    ok(/aborted: \(gridAborted === true\) \|\| \(partsRes\?\.aborted === true\)/.test(cp47)
      && /if \(bundle\.aborted\) \{/.test(cp47),
      'control-panel: الحزمة تحمل aborted ويُعرض تنبيه للمستخدم');
  }

  console.log('-- 48) محرّك الاقتران التلقائي: ⭐/ذاكرة ← كلمات الوصف ← احتياطي (لا قطعة بلا كود) --');
  {
    const cp48 = read('control-panel.js');

    // (١) البنية والترتيب
    ok(/const PAIR_SRC = \{[\s\S]{0,320}keywords: \{ icon: '🔑'[\s\S]{0,160}fallback: \{ icon: '🤖'/.test(cp48),
      'control-panel: مصادر الاقتران معرَّفة (🔑 كلمات / 🤖 احتياطي)');
    const iFav = cp48.indexOf("// (١) ⭐ ثم الذاكرة المُثبتة");
    const iKw = cp48.indexOf('// (٢) مطابقة كلمات الوصف');
    const iFb = cp48.indexOf('// (٣) احتياطي');
    ok(iFav > 0 && iKw > iFav && iFb > iKw,
      'control-panel: ترتيب الاقتران ⭐/ذاكرة ← كلمات الوصف ← احتياطي');
    ok(/function matchWordsOf\(text, max\)/.test(cp48)
      && /function partWordsOf\(part\)/.test(cp48)
      && /function keywordScoreOf\(partWords, code\)/.test(cp48),
      'control-panel: كلمات الوصف تُستخرج وتُقيَّم مقابل وصف الكود');
    ok(/if \(o\.allowFallback === false\) return null;/.test(cp48)
      && /const unused = safe\.find\(c => !used\.has\(keyOf\(c\)\)\);/.test(cp48),
      'control-panel: الاحتياطي يفضّل كودًا غير مستخدم ويمكن تعطيله');

    // (٢) لوحتا النسخ واللصق تستخدمان المحرّك نفسه
    ok(/const pick = pickCodeForPart\(it\.sparePart, codes, \{ usedKeys, loadOf \}\);/.test(cp48),
      'control-panel: لوحة المراجعة تعبّئ كل قطعة عبر المحرّك');
    ok(/if \(!bundle\.autoPaired\) \{[\s\S]{0,400}autoPairParts\(parts, codes, \{ usedKeys, loadOf \}\);/.test(cp48),
      'control-panel: لوحة النسخ تعبّئ مرة واحدة لكل حزمة (لا تُعيد ربط ما فكّه المستخدم)');
    ok(/p\.pairSource = 'manual';/.test(cp48) && (cp48.match(/p\.pairSource = '';/g) || []).length >= 1,
      'control-panel: تغيير الاقتران يدويًا يُحدّث/يمسح وسم المصدر');

    // (٣) اختبار وظيفي مباشر للمحرّك
    try {
      const s48 = cp48.indexOf('const PAIR_SRC');
      const e48 = cp48.indexOf('// أكواد العطل المكتوبة داخل نص الصف');
      ok(s48 > 0 && e48 > s48, 'control-panel: مقطع محرّك الاقتران قابل للاستخراج');
      const engine48 = cp48.slice(s48, e48);
      const normalizeAr48 = (x) => String(x || '').toLowerCase()
        .replace(/[\u064B-\u0652\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[_\u2012\u2013\u2014()\[\]:,،.]/g, ' ').replace(/\s+/g, ' ').trim();
      const parsePartName48 = (raw) => {
        const s = String(raw || '').trim();
        const m = s.match(/^(.+?)\s+_\s+\((.*)\)\s*$/);
        return m ? { code: m[1].trim(), name: m[2].trim(), fullName: s } : { code: '', name: s, fullName: s };
      };
      const keyOf48 = (c) => String((c && c.majorCode) || '').trim() + '|' + String((c && c.defectCode) || '').trim();

      const makeApi = (over) => new Function(
        'copyBoardCodeKey', 'favFindItem', 'lookupPartPairing', 'pairFailureOf',
        'parsePartName', 'normalizeAr', 'DESC_STOP_WORDS',
        engine48 + '\nreturn { pickCodeForPart, autoPairParts, matchWordsOf, partWordsOf, keywordScoreOf };'
      )(
        keyOf48,
        over.fav || (() => null),
        over.mem || (() => null),
        over.failed || (() => null),
        parsePartName48,
        normalizeAr48,
        /^(تم|في|من|على|الى|او|و|مع|غير|بدون|كود|عطل|العطل)$/i
      );

      const codes48 = [
        { majorCode: 'RF1100', defectCode: 'RF1102', fullCode: 'RF1102', description: 'RF1102 - كباس' },
        { majorCode: 'RF1100', defectCode: 'RF1104', fullCode: 'RF1104', description: 'RF1104 - ترموستات' },
        { majorCode: 'RF2400', defectCode: 'RF2408', fullCode: 'RF2408', description: 'RF2408 - مروحة' }
      ];
      const api48 = makeApi({});

      const part48 = { code: 'RF-SH-COMP', name: 'كباس', fullName: 'RF-SH-COMP _ (كباس)' };
      const pickKw = api48.pickCodeForPart(part48, codes48, {});
      ok(pickKw && pickKw.source === 'keywords' && pickKw.code.defectCode === 'RF1102',
        'control-panel: مطابقة كلمات الوصف تربط «كباس» بكودها');

      const pickFb = api48.pickCodeForPart({ code: 'X1', name: 'شيء غامض' }, codes48, {});
      ok(pickFb && pickFb.source === 'fallback' && pickFb.code.defectCode === 'RF1102',
        'control-panel: بلا مطابقة ⇒ احتياطي بأول كود غير مستخدم');

      const used48 = new Set(['RF1100|RF1102']);
      const pickFb2 = api48.pickCodeForPart({ code: 'X1', name: 'شيء غامض' }, codes48, { usedKeys: used48 });
      ok(pickFb2 && pickFb2.source === 'fallback' && pickFb2.code.defectCode === 'RF1104',
        'control-panel: الاحتياطي يتجنّب الأكواد المستخدمة');

      const apiMem = makeApi({ mem: () => ({ majorCode: 'RF2400', subCode: 'RF2408' }) });
      const pickMem = apiMem.pickCodeForPart(part48, codes48, {});
      ok(pickMem && pickMem.source === 'memory' && pickMem.code.defectCode === 'RF2408',
        'control-panel: الذاكرة المُثبتة تُقدَّم على مطابقة الكلمات');

      const apiFail = makeApi({ failed: (p, m, s) => (m === 'RF1100' && s === 'RF1102' ? { failed: true, majorCode: m, subCode: s } : null) });
      const pickFail = apiFail.pickCodeForPart(part48, codes48, {});
      ok(pickFail && pickFail.code.defectCode !== 'RF1102',
        'control-panel: الزوج الفاشل لا يُقترح مرة أخرى (ولا حتى بالكلمات)');

      const parts48 = [{ code: 'A', name: 'كباس' }, { code: 'B', name: 'مجهول تمامًا' }];
      const filled48 = api48.autoPairParts(parts48, codes48, {});
      ok(filled48 === 2 && parts48.every(p => p.majorCode && p.subCode),
        'control-panel: تعبئة كل القطع — لا قطعة بلا كود عطل');
      ok(api48.autoPairParts([{ code: 'C', name: 'كباس', majorCode: 'RF1100', subCode: 'RF1102' }], codes48, {}) === 0,
        'control-panel: القطعة المقترنة مسبقًا لا تُعاد تعبئتها');
    } catch (e) {
      ok(false, 'control-panel: تشغيل محرّك الاقتران فشل — ' + (e && e.message));
    }
  }

  console.log('-- 49) كتالوج الأعطال: شحن+صيانة AC · جوانات وصرف GR · دقة الكود الفرعي --');
  {
    const cp49 = read('control-panel.js');
    const cat49 = JSON.parse(read('defect-catalog.json'));
    const ac49 = cat49.families.AC || {};
    const gr49 = cat49.families.GR || {};

    // (١) عائلة AC: كود شحن واحد جديد + زر الشحن المدمج
    ok((ac49.codes || []).some(c => c.major === 'AC003' && c.sub === 'L24B' && c.full === 'AC9000L24B'),
      'defect-catalog: AC003/L24B = AC9000L24B في عائلة التكييف');
    ok(!(ac49.codes || []).some(c => String(c.sub).toUpperCase() === 'L02B'),
      'defect-catalog: L02B استُبدل بكود الشحن الجديد (كود شحن واحد فقط)');
    const charge49 = (ac49.shortcuts || []).find(s => s.id === 'charge');
    ok(charge49 && String(charge49.name).includes('صيانة')
      && charge49.codes.includes('AC001') && charge49.codes.includes('AC004')
      && charge49.codes.includes('AC003|L24B')
      && (charge49.noteIds || []).includes('ac-note-2'),
      'defect-catalog: زر «شحن + صيانة» بالأكواد الثلاثة وكومنت ac-note-2');
    ok((ac49.notes || []).some(n => n.id === 'ac-note-2'
      && n.text === 'تم عمل فلير وربط المواسير و تنظيف الدائرة وعمل فاكيوم وشحن غاز فريون تم عمل صيانة دورية غسيل الفلاتر وتنظيف الوحدة الخارجية بالبلاور وتنظيف الصرف'),
      'defect-catalog: نص الكومنت المطلوب مطابق حرفيًا');
    const pull49 = (ac49.shortcuts || []).find(s => s.id === 'pull');
    ok(pull49 && pull49.codes.includes('AC003|L24B'),
      'defect-catalog: مسار السحب والارجاع يستخدم كود الشحن الجديد');

    // (٢) عائلة GR: أكواد الصرف والجوانات + الملاحظة + الزر
    ok((gr49.codes || []).length === 3
      && gr49.codes.some(c => c.major === 'RF2000' && c.sub === '2006' && c.full === 'RF2006')
      && gr49.codes.some(c => c.major === 'RF3600' && c.sub === '3606' && c.full === 'RF3606')
      && gr49.codes.some(c => c.major === 'RF3600' && c.sub === '3607' && c.full === 'RF3607'),
      'defect-catalog: ثلاجات GR تحمل أكواد الصرف والجوانات الثلاثة');
    const grSc49 = (gr49.shortcuts || []).find(s => s.id === 'gaskets-drain');
    ok(grSc49 && grSc49.name === 'جوانات وصرف' && grSc49.codes.length === 3
      && grSc49.codes.includes('RF2000|2006')
      && grSc49.codes.includes('RF3600|3606') && grSc49.codes.includes('RF3600|3607')
      && (grSc49.noteIds || []).includes('gr-note-1'),
      'defect-catalog: زر «جوانات وصرف» بالثلاثة أكواد وملاحظته');
    ok((gr49.notes || []).some(n => n.id === 'gr-note-1' && n.text === 'تم ضبط الجوانات وتنظيف الصرف'),
      'defect-catalog: كومنت الثلاجات «تم ضبط الجوانات وتنظيف الصرف»');

    // (٣) تكامل: كل كود زر وملاحظة يشير لعنصر قائم في عائلته
    const bad49 = [];
    Object.keys(cat49.families).forEach(fam => {
      const f = cat49.families[fam] || {};
      const full49 = new Set((f.codes || []).map(c => String(c.major).toUpperCase() + (c.sub ? '|' + String(c.sub).toUpperCase() : '')));
      const majors49 = new Set((f.codes || []).map(c => String(c.major).toUpperCase()));
      const notes49 = new Set((f.notes || []).map(n => n.id));
      (f.shortcuts || []).forEach(sc => {
        (sc.codes || []).forEach(code => {
          const w = String(code).toUpperCase();
          if (!full49.has(w) && !majors49.has(w.split('|')[0])) bad49.push(`${fam}/${sc.id}:${code}`);
        });
        (sc.noteIds || []).forEach(id => { if (!notes49.has(id)) bad49.push(`${fam}/${sc.id}:note ${id}`); });
      });
    });
    ok(bad49.length === 0,
      'defect-catalog: كل أكواد الأزرار وملاحظاتها تشير لعناصر قائمة' + (bad49.length ? ' — ' + bad49.join(', ') : ''));

    // (٤) دقة الكود الفرعي — اختبار وظيفي للدالة المستخدمة في runShortcut
    const s49 = cp49.indexOf('function shortcutCodeMatches');
    ok(s49 > 0 && cp49.indexOf('shortcutCodeMatches(entry, code)') > 0 && cp49.indexOf('shortcutCodeMatches(entry, code)') < s49,
      'control-panel: runShortcut يطابق أكواد الزر بدقة «رئيسي|فرعي»');
    try {
      const body49 = cp49.slice(s49, cp49.indexOf('\n  }', s49) + 4);
      const fn49 = new Function(body49 + '\nreturn shortcutCodeMatches;')();
      ok(fn49('AC003|L24B', 'AC003|L24B') === true && fn49('AC003|L02B', 'AC003|L24B') === false,
        'control-panel: «رئيسي|فرعي» يحدد الكود الفرعي وحده');
      ok(fn49('RF3600|3606', 'RF3600') === true && fn49('RF3600|3607', 'RF3600') === true,
        'control-panel: «رئيسي» فقط يحدد كل فروعه (داعم للخلف)');
      ok(fn49('RF2000|2006', 'RF3600|3606') === false && fn49('', 'AC001') === false,
        'control-panel: الرئيسي المختلف أو الفراغ لا يطابق');
    } catch (e) {
      ok(false, 'control-panel: اختبار دقة الكود الفرعي فشل — ' + (e && e.message));
    }

    // (٥) المحرر يعرض كل كود فرعي ويستعيد الدقة عند التعديل
    ok(/const val = sub \? major \+ '\|' \+ sub : major;/.test(cp49)
      && /\.some\(w => shortcutCodeMatches\(cb\.value, w\)\)/.test(cp49),
      'control-panel: محرر الشورت كت يحفظ دقة الكود الفرعي');

    // (٦) المحرك التلقائي يستخدم كود الشحن الجديد
    const eng49 = read('modules/autofill/engine-page3.js');
    ok(/addFaultCodePage3\('AC003', 'AC9000L24B'/.test(eng49) && !/AC9000L02B/.test(eng49),
      'engine-page3: محرك الصيانة الدورية يستخدم AC9000L24B');
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail > 0) {
    console.log('Failures:');
    failures.forEach((x) => console.log('  - ' + x));
  }
  process.exit(fail === 0 ? 0 : 1);
})();
