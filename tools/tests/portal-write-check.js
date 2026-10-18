// =========================================================
// portal-write-check.js — فحص القيم المكتوبة فعليًا في خانات البوابة
// =========================================================
// يشغّل كود الإضافة الحقيقي (نفس ملفات المصدر) على DOM وهمي — بدون بوابة ولا حساب —
// ويؤكد القيم الحرفية التي تُكتب في خانات النموذج، ويطبع جدولًا بها.
//
// لماذا: عطل «تاريخ الضمان must have a valid date format» لم يكن ممكنًا إثباته
// ولا نفيه بالقراءة وحدها (صيغة التاريخ + تخطي الصفحة الأولى في الزيارة الثانية).
//
// التشغيل:  node tools/tests/portal-write-check.js            (يفحص src/unified-extension)
//           node tools/tests/portal-write-check.js --deploy    (يفحص مجلد النشر deploy)
// =========================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..', '..');
const ROOT = process.argv.includes('--deploy')
  ? path.join(REPO, 'deploy')
  : path.join(REPO, 'src', 'unified-extension');

const SV_ORDER = 'CAS2026101754045578'; // بلاغ اختبار: زيارة ثانية / بوتوجاز
const SV_TYPE = 'بوتوجاز';

let pass = 0;
let fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; failures.push(label); console.log('  [FAIL] ' + label); }
}

// ── DOM وهمي يسجّل كل كتابة على العناصر ────────────────────────────────────────
function makeElement(id, type, initial) {
  const el = {
    id, type: type || 'text', tagName: 'INPUT', name: id,
    value: initial === undefined ? '' : initial,
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
    dispatchEvent() { return true; },
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] === undefined ? null : this[k]; },
    removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    offsetParent: {}, innerText: '', textContent: '',
    appendChild() {}, removeChild() {}, remove() {}, contains() { return false; },
    options: [], selectedIndex: -1,
    getBoundingClientRect() { return { top: 0, left: 0, width: 10, height: 10 }; }
  };
  let current = el.value;
  Object.defineProperty(el, 'value', {
    get() { return current; },
    set(v) {
      current = v;
      el.__writes.push({ value: String(v) });
    }
  });
  el.__writes = [];
  return el;
}

function buildSandbox(elementsByld) {
  const writes = [];
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  for (const k of ['Date', 'Math', 'JSON', 'Promise', 'Object', 'Array', 'String', 'Number',
                   'Boolean', 'Error', 'RegExp', 'Map', 'Set', 'Symbol', 'parseInt',
                   'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent']) {
    sandbox[k] = global[k];
  }
  sandbox.setTimeout = (fn) => setTimeout(fn, 0);
  sandbox.clearTimeout = (id) => clearTimeout(id);
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.sleep = () => new Promise((r) => setTimeout(r, 0));
  sandbox.HTMLInputElement = class HTMLInputElement {};
  sandbox.HTMLElement = class HTMLElement {};
  sandbox.Event = class Event { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
  sandbox.MouseEvent = sandbox.Event;
  sandbox.KeyboardEvent = sandbox.Event;
  sandbox.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  sandbox.getComputedStyle = () => ({ display: 'block', visibility: 'visible', getPropertyValue: () => '' });
  sandbox.alert = () => {};
  sandbox.location = {
    href: 'https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=' + SV_ORDER,
    search: '', pathname: '/en-US/workorderreview/',
    origin: 'https://elarabyportalpfs.powerappsportals.com'
  };
  sandbox.navigator = { userAgent: 'portal-write-check' };
  sandbox.chrome = {
    storage: {
      local: { get: async (d) => Object.assign({}, d, {}), set: async () => {}, remove: async () => {} },
      session: { get: async (d) => Object.assign({}, d, {}), set: async () => {} }
    },
    runtime: {
      getURL: (p) => 'chrome-extension://check/' + p,
      sendMessage: async () => ({ ok: true }),
      onMessage: { addListener() {} }, lastError: null
    },
    tabs: { query: async () => [], sendMessage: async () => ({}) }
  };
  sandbox.fetch = async (url) => {
    const name = String(url).split('/').pop().split('?')[0];
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
  };
  sandbox.document = {
    getElementById: (id) => elementsByld[id] || null,
    querySelector: (sel) => {
      if (/ats_producttypebrand_name/.test(sel)) return elementsByld['ats_producttypebrand_name'] || null;
      if (/datepicker/.test(sel)) return elementsByld['ldv_warrantydate_datepicker_description'] || null;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (t) => makeElement('created-' + t, 'text'),
    body: { dataset: {}, appendChild() {}, removeChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } },
    documentElement: { dataset: {}, style: {}, classList: { add() {}, remove() {} } },
    addEventListener() {}, readyState: 'complete', title: 'check', hidden: false
  };
  sandbox.AutoFillEngine = {
    Lookups: {
      fillPowerAppsLookup: async () => ({ ok: false, reason: 'STUBBED in check' }),
      waitForModalCloseIfOpen: async () => {}
    }
  };
  vm.createContext(sandbox);
  for (const f of ['shared/portal-selectors.js', 'modules/autofill/fill-options.js', 'modules/autofill/engine-page1.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, writes };
}

function yesterdayParts() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    year: d.getFullYear()
  };
}

/**
 * يشغّل المسار الحقيقي: createTask → دمج normalizeTaskData → executePage1_Review
 * على DOM وهمي، ويعيد القيم المكتوبة في خانات الفورم.
 */
async function runScenario({ label, secondVisit, forceOverwrite, baseType, existingSerial, existingSerial2, baseLine }) {
  const elementsByld = {
    'ats_producttypebrand_name': makeElement('ats_producttypebrand_name', 'text'),
    'ldv_serialnumber': makeElement('ldv_serialnumber', 'text', existingSerial || ''),
    'ldv_serialnumber1': existingSerial2 === undefined ? null : makeElement('ldv_serialnumber1', 'text', existingSerial2),
    'ldv_warrantydate': makeElement('ldv_warrantydate', baseType || 'hidden'),
    'ldv_warrantydate_datepicker_description': makeElement('ldv_warrantydate_datepicker_description', 'text')
  };
  const { sandbox } = buildSandbox(elementsByld);
  const profiles = await sandbox.FillOptions.loadSvProfiles();
  const task = sandbox.FillOptions.createTask({
    orderId: SV_ORDER,
    baseLine: baseLine || SV_ORDER,
    options: secondVisit
      ? { isSecondVisit: true, productType: SV_TYPE, forceOverwrite: !!forceOverwrite }
      : { forceOverwrite: !!forceOverwrite },
    profiles
  });
  // نفس منطق engine-orchestrator.normalizeTaskData: سطر < data < payload
  const data = Object.assign({}, sandbox.parseDataLine(task.line), task.data, task.payload);
  const cfg = await sandbox.loadSelectors();
  let thrown = null;
  let result = null;
  try {
    result = await sandbox.AutoFillEngine.Page1.executePage1_Review(data, cfg);
  } catch (e) {
    thrown = e;
  }
  return {
    label,
    task,
    data,
    thrown,
    fr: (result && result.report && result.report.fieldResults) || {},
    dom: elementsByld,
    writes: elementsByld['ldv_warrantydate'].__writes.map((w) => w.value),
    pickerWrites: elementsByld['ldv_warrantydate_datepicker_description'].__writes.map((w) => w.value),
    serialWrites: elementsByld['ldv_serialnumber'].__writes.map((w) => w.value),
    serialFinal: elementsByld['ldv_serialnumber'].value
  };
}

(async () => {
  console.log('=== فحص القيم المكتوبة في البوابة (كود الإضافة الحقيقي على DOM وهمي) ===');
  console.log('    المصدر: ' + ROOT);
  const y = yesterdayParts();
  const display = `${y.day}/${y.month}/${y.year}`;
  const iso = `${y.year}-${y.month}-${y.day}`;

  // ── 1) زيارة ثانية / بوتوجاز: تاريخ الضمان ──────────────────────────────────
  console.log('\n-- 1) زيارة ثانية / ' + SV_TYPE + ' — تاريخ الضمان --');
  const a = await runScenario({ label: 'زيارة ثانية', secondVisit: true, baseType: 'hidden' });
  console.log('    السطر المُولَّد: ' + a.task.line);
  ok(a.task.mode === 'second_visit', 'mode = second_visit -> ' + a.task.mode);
  ok(a.task.payload && a.task.payload.date === display,
     'payload.date = يوم/شهر/سنة -> ' + (a.task.payload && a.task.payload.date));
  ok(a.data.secondVisitMode === true, 'secondVisitMode يصل للموجِّه -> ' + a.data.secondVisitMode);
  ok(!a.thrown, 'executePage1_Review اكتمل بلا خطأ' + (a.thrown ? ' [' + a.thrown.message + ']' : ''));
  ok(a.writes.length === 1 && a.writes[0] === display,
     'الخانة المخفية ldv_warrantydate <= ' + JSON.stringify(a.writes));
  ok(a.pickerWrites.length === 1 && a.pickerWrites[0] === display,
     'الخانة الظاهرة ldv_warrantydate_datepicker_description <= ' + JSON.stringify(a.pickerWrites));
  ok(a.fr.warrantyDate && a.fr.warrantyDate.ok === true,
     'FR.warrantyDate.ok = true -> ' + JSON.stringify(a.fr.warrantyDate));

  // نفي الصيغة القديمة صراحةً: القيمة ليست شهر/يوم (إلا لو تساوى الشهر واليوم فعلًا)
  if (y.day !== y.month) {
    ok(a.pickerWrites[0] !== `${y.month}/${y.day}/${y.year}`,
       'ليست بصيغة شهر/يوم (' + `${y.month}/${y.day}/${y.year}` + ')');
  }

  // ── 2) نفس السيناريو لو كان الحقل type="date" ───────────────────────────────
  console.log('\n-- 2) نفس السيناريو لو كان الحقل type="date" --');
  const b = await runScenario({ label: 'زيارة ثانية/date', secondVisit: true, baseType: 'date' });
  ok(b.writes.length === 1 && b.writes[0] === iso,
     'حقل type="date" يأخذ ISO -> ' + JSON.stringify(b.writes) + ' (المتوقع ' + iso + ')');
  ok(b.pickerWrites[0] === display,
     'الخانة الظاهرة تبقى يوم/شهر/سنة -> ' + JSON.stringify(b.pickerWrites));

  // ── 3) حماية المسلسل في الزيارة الثانية ─────────────────────────────────────
  console.log('\n-- 3) حماية المسلسل الحقيقي في وضع الزيارة الثانية --');
  const realSerial = 'REAL-SN-9931';
  const c = await runScenario({ label: 'زيارة ثانية + مسلسل موجود', secondVisit: true, baseType: 'hidden', existingSerial: realSerial });
  ok(c.serialWrites.length === 0, 'لم تُكتب قيمة فوق المسلسل الحقيقي (عدد الكتابات = ' + c.serialWrites.length + ')');
  ok(c.serialFinal === realSerial, 'المسلسل الحقيقي بقي كما هو -> ' + JSON.stringify(c.serialFinal));
  ok(c.fr.serial && c.fr.serial.kept === true, 'FR.serial.kept = true -> ' + JSON.stringify(c.fr.serial));

  const d = await runScenario({ label: 'زيارة ثانية + حقل فاضي', secondVisit: true, baseType: 'hidden' });
  ok(d.serialWrites.length === 1 && d.serialWrites[0] === '0',
     'حقل المسلسل الفاضي يُملأ بقيمة البروفايل -> ' + JSON.stringify(d.serialWrites));

  const e = await runScenario({ label: 'زيارة ثانية + إجبار الكتابة', secondVisit: true, forceOverwrite: true, baseType: 'hidden', existingSerial: realSerial });
  ok(e.serialWrites.length === 1 && e.serialWrites[0] === '0',
     'خيار «إجبار الكتابة» يتجاوز الحماية -> ' + JSON.stringify(e.serialWrites));

  // ── 4) الوضع العادي غير متأثر بالحماية ──────────────────────────────────────
  console.log('\n-- 4) الوضع العادي (ليس زيارة ثانية) — لا حماية، السلوك كما كان --');
  const f = await runScenario({ label: 'عادي + مسلسل موجود', secondVisit: false, baseType: 'hidden', existingSerial: realSerial, baseLine: SV_ORDER + ' | Serial: 0' });
  ok(f.serialWrites.length === 1 && f.serialWrites[0] === '0',
     'الوضع العادي يكتب قيمة السطر فوق الموجود -> ' + JSON.stringify(f.serialWrites));
  ok(!f.fr.serial || f.fr.serial.kept !== true, 'الوضع العادي لا يعلّم kept');

  // ── الجدول ─────────────────────────────────────────────────────────────────
  console.log('\n=== جدول القيم المكتوبة (زيارة ثانية / ' + SV_TYPE + ' — ' + SV_ORDER + ') ===');
  console.log('  الأمس = ' + display + '   (ISO: ' + iso + ')');
  console.log('  +------------------------------------------+------------------------+');
  console.log('  | الخانة                                   | القيمة المكتوبة        |');
  console.log('  +------------------------------------------+------------------------+');
  const rows = [
    ['ldv_warrantydate (hidden)', JSON.stringify(a.writes[0])],
    ['ldv_warrantydate_datepicker_description', JSON.stringify(a.pickerWrites[0])],
    ['ldv_warrantydate (type=date)', JSON.stringify(b.writes[0])],
    ['ldv_serialnumber (مسلسل حقيقي موجود)', JSON.stringify(c.serialFinal) + ' — بلا كتابة'],
    ['ldv_serialnumber (فاضي)', JSON.stringify(d.serialWrites[0])]
  ];
  for (const [k, v] of rows) {
    console.log('  | ' + k.padEnd(40) + ' | ' + String(v).padEnd(22) + ' |');
  }
  console.log('  +------------------------------------------+------------------------+');

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail > 0) {
    console.log('Failures:');
    failures.forEach((x) => console.log('  - ' + x));
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.log('\n[FATAL] ' + err.name + ': ' + err.message);
  console.log(err.stack);
  process.exit(1);
});
