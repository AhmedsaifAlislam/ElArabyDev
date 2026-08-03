# AGENTS.md — مساعد التقفيلات

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير. إذا كنت تحتاج تعديل ملف بالكامل، اطلب إذن من المستخدم مع تقرير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\مساعد التقفيلات`
2. **مجلد النسخة الاحتياطية:** `E:\My First Lap\MY WORKE\Apps\مساعد التقفيلات` — **لا تعدّل عليه**
3. **لا تلمس كود تبويب "بحث وتعبئة"** — المستخدم طلب عدم تعديله
4. **المتصفح هو Microsoft Edge** (ليس Chrome) — يُستخدم Edge Tracking Prevention
5. **الذكاء الاصطناعي مجاني** — Ollama مع `qwen2.2-coder:14b` على `localhost:11434`
6. **⚠️ قاعدة iframes على PowerApps:** البورتال يعمل على PowerApps — **الجداول والعناصر دائماً داخل iframes**. عند البحث عن أي عنصر DOM (جدول، زر، رابط)، **يجب دائماً البحث في `document` + كل الـ iframes**. لا تكتفي بالبحث في `document` فقط — لن تجد شيء.
7. **⚠️ قاعدة حقن السكريبتات:** على مواقع CSP صارم (Messenger, Facebook) — **لا تستخدم `eval()` أبداً**. الحل الوحيد هو `chrome.scripting.executeScript` مع `files` parameter. السكريبتات المخصصة (المُرفوعة كملفات) لا يمكن حقنها عبر `files` على مواقع CSP — المستخدم يلصقها يدوياً.

## أنماط مهمة

### Edge Tracking Prevention
- **يمنع `chrome.storage.local` من سكربتات المحتوى** على صفحات البورتال
- الحل: **وجّه كل عمليات التخزين عبر `background.js`** باستخدام رسالة `STORAGE_GET` / `STORAGE_SET`
- لا تستخدم `chrome.storage.local` مباشرة في أي content script على البورتال

### CSP (Content Security Policy) على Facebook/Messenger
- **يمنع `<script>` tags و `eval()` و `new Function()`**
- الحل للسكربتات المدمجة: استخدم `chrome.scripting.executeScript` مع `files` parameter
  - حقن Chrome Extension API بيتخطى CSP تلقائياً
  - `world: 'MAIN'` عشان السكريبت يشتغل في سياق الصفحة
- السكريبتات المخصصة (المُرفوعة) مش هتشتغل على مواقع CSP صارم (مثل Messenger)
  - الحل: المستخدم ينسخ الكود والصقه يدوياً في Console (F12)
- **لا تستخدم `eval()` أو `document.createElement('script')`** — CSP بيحظروا

### بنية التبويبات (6 تبويبات)
1. `🔍 بحث وتعبئة` — لا تلمسه
2. `⚡ زيارة تانية` — إغلاق سريع
3. `📥 الاستخراج` — `order-extractor.js` مستقل عن `content-script.js`
4. `📋 التقارير` — جلسات محفوظة
5. `🤖 مساعد AI` — مدمج مع اللوج الذكي
6. `🐵 سكريبتات` — طريقتين:
   - **`chrome.scripting.executeScript`** من البوبداب (للسكريبتات المخصصة المرفوعة)
   - **`tampermonkey-runner.js`** (للسكريبتات المدمجة: elaraby-phone-reveal, messenger-sender) — content script يحقن `<script>` tags في MAIN world

### حقن السكريبتات على البورتال
- `tampermonkey-runner.js` يعمل على البورتال + Facebook + Messenger (تمت الإضافة)
- السكريبتات المدمجة معطّلة افتراضياً (`enabled: false`)
- **elaraby-phone-reveal** (`Tempermonky/elaraby-phone-reveal.js`): يُحقن بـ `<script>` tag في MAIN world بواسطة `tampermonkey-runner.js` عند `document-end`
  - التوجل من **🐵 سكريبتات** يضبط `localStorage.setItem('elaraby_phone_reveal_disabled', ...)` للتحكم في layer0
  - `elaraby-phone-reveal-layer0.js` يقرأ `elaraby_phone_reveal_disabled` من localStorage قبل اعتراض `crmAccount`
  - افتراضيًا: `enabled: false` → `elaraby_phone_reveal_disabled = '1'` → الأرقام مخفية
  - عند التشغيل: `enabled: true` → `elaraby_phone_reveal_disabled = ''` → layer0 يعترض ويكشف الأرقام
  - **بعد التوجيل، لازم Refresh الصفحة عشان التغيير ياخد مفعوله** (زي تيمبر مونكي الأصلي)
- **messenger-sender**: يعمل فقط على Facebook/Messenger (لم يتغير)

### مشاكل معروفة
- **"لا توجد نتائج" في elaraby-phone-reveal**: استخراج الجدول لا يعمل على البورتال — التيمبر مونكي الأصلي يشتغل لكن الإضافة لأ. يحتاج تحقيق إضافي
- **Edge Tracking Prevention**: لا يمنع `localStorage` في MAIN world، لكن يمنع `chrome.storage.local` في ISOLATED world

### نموذج الرسائل (Message Pattern)
```js
// من content script → background (Storage Proxy)
const data = await storageGet({ key: defaultValue });  // helper function
await storageSet({ key: value });                      // helper function
await storageRemove(['key']);                          // helper function

// Helper functions معرّفة في أعلى content-script.js:
async function storageGet(keys) {
  const resp = await chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys });
  return resp?.data || {};
}
async function storageSet(data) {
  await chrome.runtime.sendMessage({ type: 'STORAGE_SET', data });
}
async function storageRemove(keys) {
  await chrome.runtime.sendMessage({ type: 'STORAGE_REMOVE', keys });
}

// من popup → content script
chrome.tabs.sendMessage(tabId, { action: 'ACTION_NAME', ... })
```

### نموذج البحث في iframes (PowerApps)
```js
// ❌ غلط — لن يجد الجدول على البورتال
const table = document.querySelector('table');

// ✅ صحيح — يبحث في main + كل الـ iframes
function findTableInDoc(doc) {
  return doc.querySelector('table.entity-grid') || doc.querySelector('table');
}
function findTable() {
  let result = findTableInDoc(document);
  if (result) return { table: result, doc: document };
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      result = findTableInDoc(iDoc);
      if (result) return { table: result, doc: iDoc, iframe };
    } catch (e) { /* cross-origin */ }
  }
  return null;
}
```

### بنية الملفات الرئيسية
| الملف | الوظيفة |
|-------|---------|
| `manifest.json` | إعدادات الإضافة، content_scripts، الصلاحيات |
| `popup.html` | واجهة البوبداب (6 تبويبات) |
| `popup.js` | منطق البوبداب بالكامل |
| `content-script.js` | منطق تعبئة الحقول على البورتال |
| `order-extractor.js` | استخراج البلاغات (مستقل) |
| `background.js` | service worker — تخزين، Ollama proxy، إشعارات |
| `ai-service.js` | طبقة AI (MAIN world) |
| `elaraby-phone-reveal-layer0.js` | اعتراض `crmAccount` في MAIN world عند `document_start` (يتحكم فيه localStorage toggle) |
| `smart-log.js` | سجل حركات المستخدم |
| `selectors.json` | محددات DOM للبورتال |
| `secondVisitProfiles.json` | ملفات تعريف الزيارة الثانية |
| `lib/xlsx.full.min.js` | SheetJS لتصدير Excel |
| `Tempermonky/` | سكريبتات Tampermonkey المدمجة |

### بيانات البورتال
- **رابط البلاغات:** `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/`
- **الحقل `Warranty Status`:** `753240001` = Out warranty (للكل)
- **التاريخ:** دائماً أمس (ديناميكي)
- **AC:** موديلين + سيريالين، باقي المنتجات: موديل + سيريال واحد

### اختبار بعد التعديل
- شغّل `npm run lint` أو `npm run typecheck` إذا وُجدت
- اختبر على البورتال فعلياً — لا تعتمد على الاختبار النظري
- تحقق من console المتصفح (F12) لأي أخطاء
