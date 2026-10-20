# المشاكل المعروفة — Known Issues
# El Araby System — Known Issues & Solutions

> **آخر تحديث:** 2026-10-20

---

## محلول مؤخراً — الموجة 21: كتالوج المشاكل الفعلية (2026-10-20)

### 28. قائمة الأكواد الممنوعة مكتوبة يدويًا والمسموحة غير معروفة (عالية)

**الأثر:** «المشاكل الفعلية» في الصفحة الثانية تُختار من قائمة قصيرة (9 أكواد في
`selectors.json`)، وأي كود آخر غير معروف للنظام — بينما البوابة تعرض 56/54/43/95/54 سجلًا
حسب نوع المنتج. وقائمة «الممنوع» كانت `DEFAULT_FORBIDDEN` مكتوبة في الكود.

**السبب:** لا يوجد مصدر بيانات لأكواد المشاكل؛ القائمة الوحيدة `selectors.json → problemCodes`
وهي خريطة نمط→أكواد (AC02/AC03/GS04/WM05/GR01–03/DW06/HT01 فقط).

**الحل المطبّق (موجة 21):**
- `problem-catalog.json`: 50 كودًا (GS/GR/AC/WM/HT) + `forbidden` + `families` + `recordCounts`.
- `problem-codes.js` يقرأ الممنوع والمسموح من الكتالوج، و`selectors.json` احتياطي فقط.
- `codesForDevice()` تستنتج العائلة من نص نوع المنتج (`غساله`، `تكييف`، `ثلاجات`، `سخانات مياه`، `A/C`).

**المتبقي:** الكتالوج الحالي أول صفحة من كل قائمة (10 صفوف) — باقي الصفحات تُضاف
إما يدويًا أو بأداة «تحديث الكتالوج من البوابة» (خطوة لاحقة).

**قرار (2026-10-20):** أُغلق هذا البند — الصفحة الأولى من كل قائمة كافية حاليًا،
ولا حاجة لأداة «تحديث الكتالوج من البوابة». أي كود ناقص يُضاف يدويًا لملف الكتالوج.

**إصلاح تابع (موجة 22):** `getProblemCode` لم يعد ينسخ كود الشكوى (WM82 → WM82)؛
يقبله فقط إن كان موجودًا في الكتالوج وغير ممنوع، وإلا يحل الكود من عائلة الجهاز.
وقائمة الـ AI تُبنى من الكتالوج بدل القائمة الثابتة.

**التحقق:** 199 ناجح / 0 فاشل — build `2026-10-20.15`.

---

## حرجة / Critical

### 1. خطأ ASCID في صفحات "آخرى"

**الأثر:** صفحات inprogress.aspx و inasc.aspx و Fawry.aspx و FinancialReceipt.aspx لا تعمل

**السبب:**
```
Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist
```

**الشرح:**
- الـ ASCID (رقم حساب المركز) غير موجود في الجلسة
- الكود بينادي `GetascfromAccount()` بـ GUID فاضي
- مفيش validation قبل الاستدعاء

**الحل المقترح:**
- إضافة validation قبل `GetascfromAccount()`
- التأكد من وجود ASCID في الجلسة قبل التنقل

**الأدوات المتأثرة:** portal-other-section

---

### 2. Edge Tracking Prevention

**الأثر:** `chrome.storage.local` لا يعمل في content scripts على صفحات البورتال في Edge

**السبب:**
- Edge يمنع التخزين المحلي من سكربتات المحتوى على بعض المواقع
- هذا يمنع الإضافات من حفظ البيانات

**الحل المطبق:**
- كل التخزين يمر عبر `background.js` باستخدام `chrome.runtime.sendMessage`
- لا تستخدم `chrome.storage.local` مباشرة في أي content script على البورتال

**الأدوات المتأثرة:** المساعد الذكي، مساعد التقفيلات

---

### 3. CSP على Facebook/Messenger

**الأثر:** السكريبتات لا تعمل على مواقع Facebook و Messenger

**السبب:**
- CSP (Content Security Policy) يمنع `eval()` و `<script>` tags
- هذا يمنع حقن السكريبتات المخصصة

**الحل المطبق:**
- استخدام `chrome.scripting.executeScript` مع `files` parameter
- استخدام `world: 'MAIN'` لحقن السكريبت في سياق الصفحة
- السكريبتات المخصصة تُلصق يدوياً في Console

**الأدوات المتأثرة:** مساعد التقفيلات (messenger-sender)

---

## متوسطة / Medium

### 4. كلمات السر المتعددة

**الأثر:** كل صفحة مالية لها كلمة سر مختلفة

**التفاصيل:**

| الصفحة | اسم الحقل | المطلوب |
|--------|-----------|---------|
| salaryasc2.aspx | `ContentPlaceHolder1_TextBox1` | "الرقم السرى" |
| accountMovement.aspx | `ContentPlaceHolder1_TextBox3` | "كلمة السر" |
| accountMovementSAP.aspx | `ContentPlaceHolder1_TextBox1` | "كلمة المرور" |
| billingneeded.aspx | `ContentPlaceHolder1_TextBox3` | "الرقم السرى" |

**الحل المقترح:**
- توحيد كلمة السر لكل الصفحات
- أو استخدام كلمة سر واحدة مخزنة في مكان مركزي

**الأدوات المتأثرة:** portal-other-section

---

### 5. التنقل البطيء في صفحات "آخرى"

**الأثر:** كل صفحة بتستخدم `__doPostBack` — يعني PostBack كامل للسيرفر مع كل نقرة

**السبب:**
- ASP.NET Web Forms مبني على نموذج PostBack
- لا يوجد UpdatePanel في هذه الصفحات (مفيش تحميل جزئي)

**الحل المقترح:**
- استخدام AJAX لتحميل البيانات بدون إعادة تحميل الصفحة
- أو بناء Dashboard موحد يعرض كل البيانات في صفحة واحدة

**الأدوات المتأثرة:** portal-other-section

---

### 6. PowerApps iframes

**الأثر:** الجداول والعناصر دائماً داخل iframes في البورتال

**السبب:**
- PowerApps Portal يستخدم iframes لعرض المحتوى
- البحث في `document` فقط لن يجد أي شيء

**الحل المطبق:**
- البحث في `document` + كل الـ iframes
- استخدام دالة `findTable()` للبحث في كل الأماكن

**الأدوات المتأثرة:** كل الأدوات التي تعمل على PowerApps Portal

---

## منخفضة / Low

### 7. تقييد الجدولة من السيرفر

**الأثر:** لا يمكن تجاوز قيود الجدولة برمجياً

**السبب:**
- قيود الجدولة مقفلة من جانب السيرفر (Dynamics 365 Plugin)
- لا يمكن تخطيها من المتصفح بالكامل

**الحل المطبق:**
- Smart Scheduler يتجاوز القيود العددية (عدد الأيام ومرات الجدولة)
- لكن لا يتجاوز القيود المفروضة من السيرفر

**الأدوات المتأثرة:** Rescheduling Portal

---

### 8. لا توجد نتائج في elaraby-phone-reveal

**الأثر:** استخراج الجدول لا يعمل على البورتال

**السبب:**
- التيمبر مونكي الأصلي يشتغل لكن الإضافة لأ
- يحتاج تحقيق إضافي

**الحل المقترح:**
- مراجعة آلية استخراج البيانات من الجدول
- التأكد من أن السكريبت يعمل على الصفحة الصحيحة

**الأدوات المتأثرة:** مساعد التقفيلات

---

### 9. عدم توحيد كلمات السر

**الأثر:** كلمة السر تتغير بشكل دوري

**السبب:**
- كلمة السر تُغير يدوياً من إدارة النظام
- لا يوجد نظام لتحديث كلمة السر تلقائياً

**الحل المقترح:**
- استخدام نظام إدارة كلمات مرور
- أو توحيد كلمة السر لكل الصفحات

**الأدوات المتأثرة:** portal-other-section

---

### 10. حد أقصى 50 صفحة في الاستخراج

**الأثر:** order-extractor.js يتوقف بعد 50 صفحة حتى لو كان هناك المزيد

**السبب:**
- حد أقصى مبرمج للتنقل بين الصفحات (50 صفحة)
- لا يوجد خيار لزيادة الحد أو الاستمرار تلقائياً

**الحل المقترح:**
- جعل الحد الأقصى قابل للتعديل (إعدادات)
- أو إضافة خيار "استمرار" بعد الوصول للحد

**الأدوات المتأثرة:** مساعد التقفيلات

---

### 11. عدم وجود retry للصفحات الفاشلة

**الأثر:** إذا فشلت صفحة أثناء الاستخراج، يتوقف التنقل

**السبب:**
- لا يوجد آلية إعادة محاولة (retry) للصفحات التي تفشل
- timeout طويل (15 ثانية) لكن بدون retry

**الحل المقترح:**
- إضافة retry mechanism (3 محاولات قبل التخطي)
- تقليل timeout وإضافة retry بدلاً منه

**الأدوات المتأثرة:** مساعد التقفيلات

**الأثر:** كلمة السر تتغير بشكل دوري

**السبب:**
- كلمة السر تُغير يدوياً من إدارة النظام
- لا يوجد نظام لتحديث كلمة السر تلقائياً

**الحل المقترح:**
- استخدام نظام إدارة كلمات مرور
- أو توحيد كلمة السر لكل الصفحات

**الأدوات المتأثرة:** portal-other-section

---

## محلول مؤخراً — Security Hardening (الموجة 1)

**التاريخ:** 2026-10-18

**التغييرات المطبقة:**

### 1. INJECT_SCRIPT_FILE Allowlist (حرجة)
**المشكلة:** معالج `INJECT_SCRIPT_FILE` في `background.js` كان يقبل أي مسار ملف من content scripts، مما يسمح بحقن ملفات عشوائية بامتدادات الإضافة.
**الحل:**
- إضافة `ALLOWED_INJECT_FILES` allowlist يحتوي على 8 ملفات مسموحة فقط
- دالة `normalizeInjectFiles()` موحّدة تُستدعى من المعالجين الاثنين (السطر 294 والسطر 576)
- تحقق من امتداد `.js`، رفض المسارات المطلقة و `..`
- تحقق `sender.id === chrome.runtime.id` قبل التنفيذ

### 2. CDN Proxy SSRF Hardening (حرجة)
**المشكلة:** دالة `isCdnUrl()` كانت تستخدم `host.endsWith(d)` مما يسمح بـ subdomain takeover (مثلاً `evil-fbcdn.net`).
**الحل:**
- مطابقة دقيقة: `host === d || host.endsWith('.' + d)`
- تحقق `protocol === 'https:'` صراحةً
- رفض أي بروتوكول غير https

### 3. XSS via innerHTML في popup.js (حرجة)
**المشكلة:** عدة مواضع في `popup.js` تُدرج بيانات من البورتال (أسماء فنيين، مناطق) عبر `innerHTML` بدون تعقيم.
**المواضع المصلحة:**
- `_renderRegionTechRows()` (السطور 1768-1773): `data-region`، `region`، `tech`، `_techRoster`
- `_fillNewTechSelect()` (السطر 1801): `_techRoster`
- `_renderRoster()` (السطر 1813): `_techRoster`
- `populateSelect()` (السطر 388): خيارات من البورتال
- `renderSearchResults()` (السطر 478): نتائج البحث
- `renderInventory()` (السطر 538): بيانات العهدة من البورتال

**الحل:** استخدام دالة `escapeHtml()` الموجودة في السطر 39 عند حدود المصدر.

### 4. تنظيف ملفات النسخ الاحتياطي
- حذف `src/unified-extension/popup.js.bak`
- إضافة `*.bak` إلى قائمة الاستثناء في `tools/deploy.ps1`

---

## محلول مؤخراً — الموجة 2: متانة التخزين والموارد (2026-10-18)

**التغييرات المطبقة:**

### 5. سقف عام للتخزين في SessionCapture (عالي)
**المشكلة:** `autofiller_sessionCaptures` كان ينمو بلا حدود — كل أمر شغل جديد يُضاف إلى القاموس بدون سقف عام، مما يهدد بتجاوز حصة 5MB من `chrome.storage.local`.
**الحل:**
- إضافة `MAX_TRACKED_ORDERS = 50` — عند تجاوز 50 أمر شغل، تُحذف الأوامر الأقدم (حسب `lastSeen`) قبل عملية `storageSet`
- إضافة `MAX_FULL_OPTION_CAPTURES = 10` — للقطات التي تزيد عن 10 لكل أمر، تُسقط `options[]` (للـ `<select>`) وتُقلص `inputs`/`buttons` لتقليل حجم اللقطة الفردية

### 6. تنظيف الموارد عند مغادرة الصفحة (عالي)
**المشكلة:** `setInterval` (التصوير الدوري كل 5ث) و `MutationObserver` (مراقبة المودال كل 2ث) لم يُمسحوا أبدًا — causando تسرب ذاكرة في التنقلات SPA.
**الحل:**
- حفظ مراجع كل `sessionCaptureInterval` و `technicianModalInterval` و `technicianModalObserver`
- دالة `cleanupSessionResources()` تُستدعى عند `pagehide` و `beforeunload` لمسحهم جميعًا
- حماية من التهيئة المزدوجة عبر `window._sessionCaptureInitialized`

---

## محلول مؤخراً — الموجة 3: توحيد الدوال المكررة (2026-10-18)

> ⚠️ **تصحيح مهم:** المحاولة الأولى للتوحيد (المُوثّقة سابقًا هنا كـ"مكتملة") كانت **معطوبة** وتم رفضها وإعادة تنفيذها بشكل صحيح. التفاصيل في البند 9 أدناه.

**التغييرات المطبقة:**

### 7. توحيد الدوال المساعدة في shared/portal-selectors.js (متوسطة)
**المشكلة:** دوال `findFirst`، `generateTaskId`، `parseDataLine`، `loadSelectors` كانت مكررة في 3-5 ملفات مع اختلافات طفيفة — ومنها **3 نسخ** من المحددات الافتراضية (`getHardcodedDefaults` / `getHardcodedDefaultsLocal`)، مما يصعب الصيانة ويزيد خطر التناقض.

**الحل النهائي:**
- **المصدر الوحيد:** `shared/portal-selectors.js` يحتوي التطبيق الفعلي للدوال الأربع + `getHardcodedDefaults()` داخليًا. لا يوجد أي تطبيق فعلي مكرر في أي ملف آخر (تم التحقق بـ grep: تعريف واحد فقط).
- **المستهلكون** يستخدمون اختصارًا رفيعًا يستدعي `window.*` عند وقت التنفيذ مع `fallback` آمن (وليس نسخًا للتطبيق، وليس التقاطًا مباشرًا قد يصبح `undefined`):
  - `modules/autofill/engine-orchestrator.js` (4 دوال) — حُذفت نسخة `getHardcodedDefaults()` المكررة
  - `content-script.js` (3 دوال) — حُذفت نسخة `getHardcodedDefaultsLocal()` المكررة و `let CFG` الميتة
  - `control-panel.js` / `modules/autofill/engine-page1.js` / `modules/autofill/autofill-client.js` / `popup.js`
- **ترتيب التحميل مضمون:** `shared/portal-selectors.js` يُحمَّل قبل كل المستهلكين في `manifest.json` (السطر 87 قبل 97/98) وفي `popup.html` (قبل `popup.js`).
- **إزالة خطر الحلقة اللانهائية:** `generateTaskId` كان يُعاد تصديره إلى `window` عبر `Object.assign` بينما هو نفسه يستدعي `window.generateTaskId` → **استدعاء ذاتي لا نهائي** بمجرد إصلاح الأخطاء النحوية. أُزيل من قائمة إعادة التصدير؛ `window.generateTaskId` يُكتب الآن في `portal-selectors.js` فقط.
- `control-panel.js`'s `let CFG` أُبقي لأنها حالة داخلية خاصة به (وليست تكرارًا).

### 8. إضافة إذن unlimitedStorage إلى manifest.json (متوسطة)
**المشكلة:** حصة `chrome.storage.local` محدودة بـ 5MB — حتى مع سقوف التخزين في الموجة 2، قد يزداد `autofiller_sessionCaptures` مع الاستخدام الطويل.
**الحل:**
- إضافة `"unlimitedStorage"` إلى `manifest.json` permissions
- هذا يسمح للتخزين بتجاوز 5MB، بالتكامل مع سقفي `MAX_TRACKED_ORDERS` و `MAX_FULL_OPTION_CAPTURES` من الموجة 2

### 9. إصلاح خرقين نحويين أدخلهما التوحيد الأول + بوابة تحقق عند النشر (حرجة)
**المشكلة (خطأ ذاتي):** محاولة التوحيد الأولى تركت ملفين بخطأ نحوي حقيقي، ووصلا إلى `deploy/` (المجلد الذي يُحمَّل فعليًا)، وهذا يعني:
- `content-script.js`: بقايا دالة `parseDataLine` القديمة (سطور يتيمة) بعد استبدال رأس الدالة فقط → `SyntaxError` يعطّل **كل** محرك الملء التلقائي.
- `dashboard/dashboard.js`: سطر `escapeHtml` كُتب بترميز HTML entities مفكوك (`"` بدل `&quot;`) → `SyntaxError`.
- **السبب الجذري:** `tools/deploy.ps1` كان ينسخ الملفات ويطبع `[OK]` دون أي تحقق نحوي — لذا مرّت الملفات المعطوبة بصمت.

**الحل:**
- حذف كتلة `parseDataLine` الميتة بالكامل من `content-script.js` (كانت غير مستخدمة أصلًا).
- إعادة كتابة سطر `escapeHtml` في `dashboard.js` بالـ entities الصحيحة.
- **بوابة نحوية إلزامية في `tools/deploy.ps1`:** تشغيل `node --check` على كل `src/**/*.js` **قبل** أي نسخ — وعند الفشل يُلغى النشر بـ `exit 1` ويُترك `deploy/` السابق سليمًا (تم التحقق باختبار سلبي). ثم تحقق ثانٍ على `deploy/**` بعد النسخ.

### 10. تعقيم dashboard.js (XSS) — تفعيل escapeHtml فعليًا (متوسطة)
**المشكلة:** `escapeHtml` كان مُعرّفًا في `dashboard/dashboard.js` لكنه **غير مستدعى إطلاقًا**، بينما توجد مواقع `innerHTML` تُدرج بيانات مصدرها Excel/Drive/البورتال (جدول البيانات الرئيسي، القوائم المنسدلة، جدول العهدة، سجل العمليات) → احتمال XSS داخل صفحة الإضافة (صلاحيات موسّعة).
**الحل:** تفعيل `escapeHtml()` عند حدود المصدر لكل القيم الديناميكية (12 استدعاء)، مع ترك القيم الرقمية والثابتة كما هي. التحقق: `node --check` ناجح، ولا يوجد أي `innerHTML` متبقٍ يُدرج قيمة غير معقّمة.

⚠️ **ملاحظة:** إضافة إذن جديد تتطلب إعادة موافقة المستخدم في المتصفح — عند تحميل الإضافة المحدثة في `edge://extensions`، سيُطلب قبول الأذونات الجديدة.

---

## جدول ملخص المشاكل

| # | المشكلة | الخطورة | الحالة | الأدوات المتأثرة |
|---|---------|---------|--------|------------------|
| 1 | خطأ ASCID | حرجة | مفتوحة | portal-other-section |
| 2 | Edge Tracking Prevention | حرجة | محلولة | المساعد الذكي، مساعد التقفيلات |
| 3 | CSP على Facebook/Messenger | حرجة | محلولة (جزئياً) | مساعد التقفيلات |
| 4 | كلمات السر المتعددة | متوسطة | مفتوحة | portal-other-section |
| 5 | التنقل البطيء | متوسطة | مفتوحة | portal-other-section |
| 6 | PowerApps iframes | متوسطة | محلولة | كل الأدوات |
| 7 | تقييد الجدولة | منخفضة | محلولة (جزئياً) | Rescheduling Portal |
| 8 | لا توجد نتائج في phone-reveal | منخفضة | مفتوحة | مساعد التقفيلات |
| 9 | عدم توحيد كلمات السر | منخفضة | مفتوحة | portal-other-section |
| 10 | حد أقصى 50 صفحة في الاستخراج | متوسطة | مفتوحة | مساعد التقفيلات |
| 11 | لا يوجد retry للصفحات الفاشلة | متوسطة | مفتوحة | مساعد التقفيلات |
| 12 | تعارض مستمعي onMessage بين content-script و order-extractor | حرجة | محلولة (Message Bus) | مساعد التقفيلات |
| 13 | فرع على البوابة كان يُعيد تحميل نفس التبويب (لا تبويب جديد لكل بلاغ) | حرجة | محلولة | الملء التلقائي |
| 14 | استيلاء content-script.js على الدوال المشتركة → RangeError يوقف الدورة | حرجة | محلولة | الملء التلقائي |
| 15 | تسجيل التتبع كان يُضيّع رسالة الخطأ | متوسطة | محلولة | الملء التلقائي |
| 16 | تاريخ الضمان يُكتب MM/DD/YYYY فترفض البوابة النموذج | حرجة | محلولة | الملء التلقائي |
| 22 | «زيارة ثانية» تُتخطّى بالكامل (تخطي الصفحة 1) فلا يُكتب تاريخ الضمان | حرجة | محلولة | الملء التلقائي |
| 23 | الحقل `ldv_warrantydate` (المخفي) يخزّن ISO datetime، لا DD/MM/YYYY | حرجة | محلولة | الملء التلقائي |

---

## محلول مؤخراً — الموجة 4: دورة الملء التلقائي (2026-10-18)

### 13. التبويب الجديد لم يُفتح — كان يُعيد تحميل نفس التبويب (حرجة)
**المشكلة:** `startNextTask()` في `engine-orchestrator.js` كان يحتوي فرعًا: «إذا كنا على البوابة → `location.href = targetUrl`». وبما أن المحرك يعمل **دائمًا** على البوابة، كان هذا الفرع يتحقق دائمًا، فلم يُرسَل `OPEN_NEXT_TAB` أبدًا ولم يُنفَّذ `chrome.tabs.create` في `background.js` (سطر 416) — فيُعاد تحميل **نفس** التبويب ويُدمَر بلاغ العميل السابق.
**الأثر:** فقدان البلاغات المفتوحة (المستخدم يكمّلها يدويًا)، وعدم تحديث `processingTabId` (آلية قفل التبويب) لأن `background.js` يضبطه عند إنشاء التبويب فقط.
**الحل:** حذف الفرع وإرسال `OPEN_NEXT_TAB` دائمًا (سلوك V1/V2 الأصلي: تبويب مستقل لكل بلاغ يُترك مفتوحًا)، مع إبقاء `location.href` كخطة بديلة عند فشل الرسالة فقط، وإبقاء `getOrdersUrl()` للحفاظ على بادئة اللغة.
**التحقق:** اختبارا 6 و7 في `tools/tests/unification-smoke.js`، وأُثبت أنهما غير شكليين (4 إخفاقات عند إرجاع الفرع).

### 14. استيلاء content-script.js على الدوال المشتركة → RangeError يوقف الدورة (حرجة)
**المشكلة:** `content-script.js` ملف content script عادي (بدون IIFE)، وكان يعرّف `loadSelectors` و`findFirst` و`generateTaskId` بـ **function declarations**. هذه تُسجَّل تلقائيًا على `window` فتستولي على النسخة الوحيدة في `shared/portal-selectors.js`؛ وبما أن جسمها يفوّض إلى `window.<الاسم>` — أي إلى نفسها — ينشأ استدعاء ذاتي لا نهائي:
```
RangeError: Maximum call stack size exceeded
```
**الأثر الفعلي على البوابة:** `processQueueOnLoad` يرمي الخطأ عند `loadSelectors()` (سطر 617) — قبل `PAGE_TYPE_DETECTED` — فيتوقف كل شيء: لا بحث عن البلاغ، لا كتابة في خانة البحث، ولا ضغط لزر البحث. ويظهر في سجل التتبع كـ `PROCESS_QUEUE_ON_LOAD_ERROR` فقط.
**لماذا فات سابقًا:** إصلاح الموجة 3 التقط نفس النمط داخل `engine-orchestrator.js` (المحمي بـ IIFE فلا خطر)، لكنه فات `content-script.js`؛ كما أن الفحص الساكن كان يبحث عن `window.X =` فقط ولا يرى `function X()`.
**نفس الفخ كامن في `popup.js`:** كان يعرّف `generateTaskId` بـ function declaration على المستوى العام (`portal-selectors.js` محمَّل قبله في `popup.html:1293` قبل `popup.js:1299`) — لم يُستدعَ بعد، لكنه حُوِّل احتياطًا.
**الحل:** تحويل التعريفات الثلاثة في `content-script.js` و`generateTaskId` في `popup.js` من `function` إلى `const` (تعريف معجمي لا يُسجَّل على `window`).
**التحقق:** اختبارا 8 (runtime: المصادر محفوظة + لا RangeError) و9 (static: منع function declaration عام بهذه الأسماء)، وأُثبت أنهما غير شكليين (5 إخفاقات عند إرجاع العلّة).

### 15. تسجيل التتبع كان يُضيّع رسالة الخطأ (متوسطة)
**المشكلة:** `traceEvent()` في `content-script.js` كان يبني `entry.details = details.details || null` فيرمي كل حقل آخر — ومنه `error` و`stack` — فكان السجل يُظهر `PROCESS_QUEUE_ON_LOAD_ERROR` بلا أي سبب ظاهر.
**الحل:** استبقاء الحقول الإضافية داخل `details` (بنفس سلوك `runtime-trace.js`)، وإضافة `error`+`name`+`stack` عند التقاط خطأ `processQueueOnLoad` مع إظهار تنبيه على الصفحة لتسريع التشخيص.

### 16. تاريخ الضمان كان يُكتب شهر/يوم (MM/DD/YYYY) فترفض البوابة النموذج (حرجة)
**المشكلة:** `setPowerAppsDate()` في `engine-page1.js` كان يبني قيمة العرض:
`${pad(dObj.month)}/${pad(dObj.day)}/${dObj.year}` — أي **شهر/يوم/سنة**.
البوابة تعرض التواريخ بصيغة **يوم/شهر/سنة (DD/MM/YYYY)**، فقيمة مثل `10/17/2026` تُقرأ عندها كـ «شهر 17» → غير صالحة، فيرفض السيرفر الإرسال:
```
The form could not be submitted for the following reasons:
تاريخ الضمان must have a valid date format. Example: {1}
```

---

## محلول مؤخراً — الموجة 5: مسار «الزيارة الثانية» (2026-10-18)

### 22. «زيارة ثانية» كانت تُتخطّى بالكامل فلا يُكتب تاريخ الضمان (حرجة)
**المشكلة:** `engine-orchestrator.js` كان يتخطى الصفحة الأولى متى وُجد رقم مسلسل عليها:
```js
if (!data.forceOverwrite && isPage1AlreadyFilled(cfg)) { /* skip */ }
```
وهذا صحيح للبلاغات العادية، لكنه **خاطئ في وضع «زيارة ثانية»**: بلاغ الزيارة الثانية سبق معالجته أصلًا وفيه رقم مسلسل من الزيارة الأولى، فيُتخطّى فورًا.
**الأثر:** لا تُكتب العلامة/الموديل/المسلسل **ولا تاريخ الضمان**، وتُعلَّم المهمة «مسجل مسبقاً — تخطي» وتنتهي بلا حفظ؛ ثم يرفض السيرفر أي إرسال لاحق:
```
The form could not be submitted for the following reasons:
تاريخ الضمان must have a valid date format. Example: {1}
```
**المرجع (V2 — النسخة العاملة) كان يستثني هذا الوضع صراحةً:**
- `content-script.js:1306` → `if (isPage1AlreadyFilled(cfg) && task.mode !== 'secondVisit')`
- `content-script.js:1315-1318` → «Always fill Page 1 in secondVisit mode (even if partially filled)»
- `content-script.js:1355` → `needsPage3 = task.mode === 'secondVisit' || ...` (الزيارة الثانية تذهب دائمًا للصفحة الثالثة)

**الحل (مطابقة V2 حرفيًا):**
1. استثناء وضع الزيارة الثانية من التخطي: `if (!data.forceOverwrite && !data.secondVisitMode && page1Filled)` مع تسجيل واضح في التتبع.
2. `needsPage3 = data.secondVisitMode || ...` — كانت كامنة (كل بروفايلات الزيارة الثانية الحالية فيها `faultSearch` فيتحقق `data.faultCode`)، لكن القاعدة تُستعاد للأمان عند إضافة بروفايل بلا `faultSearch`.

**ملاحظة سلوكية (مُحدَّثة — إضافة على V2):** في وضع الزيارة الثانية يُكتب ما في البروفايل كما هو (ومنه `Serial: 0`) **فقط إذا كانت خانة المسلسل فاضية**. إن كانت تحتوي مسلسلًا حقيقيًا، يُحفظ (لا يُكتب فوقه) — ما لم يفعّل خيار «إجبار الكتابة» (`forceOverwrite`). الوضع العادي غير متأثر. هذا الحماية تمت بطلب المستخدم وليست جزءًا من V2 (الذي كان يكتب بلا شروط).

**التحقق:**
- فحصان في القسم 12 من `tools/tests/unification-smoke.js` (56 فحصًا ناجحًا)، وأُثبت أنهما غير شكليين (إخفاقان عند إرجاع العلّة).
- `tools/tests/portal-write-check.js` — 17 فحصًا (date + serial-protection) على DOM وهمي، وأُثبت 3 إخفاقات عند إزالة الحماية.
- تشغيل كود الإضافة الحقيقي على DOM وهمي (بدون بوابة) لأمر `CAS2026101754045578` بنوع «بوتوجاز»: تاريخ الضمان المكتوب = `17/10/2026` في الخانة الظاهرة (`ldv_warrantydate_datepicker_description`) والمخفية، و`2026-10-17` لو كان الحقل `type="date"` — وهو نفس ما كان يكتبه V1/V2 (`data.date` حرفيًا).
- مطابقة `src` ↔ `deploy` بعد النشر.

---

## محلول مؤخراً — الموجة 6: صيغة الحقل المخفي (2026-10-18)

### 23. الحقل `ldv_warrantydate` (المخفي) يخزّن ISO datetime، لا DD/MM/YYYY (حرجة)
**المشكلة (السبب الأعمق لرسالة «تاريخ الضمان must have a valid date format»):**
صفحة البوابة (محفوظة: `اكواد/...Partner Portal...html`) أظهرت أن:
```html
<input id="ldv_warrantydate" type="text" value="2020-07-25T00:00:00.0000000"
       style="display:none" data-type="date" data-ui="datetimepicker" ...>
<input id="ldv_warrantydate_datepicker_description" type="text"
       data-date-format="DD/MM/YYYY" placeholder="DD/MM/YYYY" ...>
```
أي أن البوابة تخزّن **ISO datetime كامل** (`YYYY-MM-DDT00:00:00.0000000`) في الحقل المخفي،
وتعرض DD/MM/YYYY في الحقل الظاهر. الإصلاح (موجة 4/5) كتب `portalDisplay` (DD/MM/YYYY) في **الحقل المخفي**
(لأن `baseEl.type === 'text'` فاختار فرع `else`)، ففسد Value («17/10/2026») ورفض السيرفر الإرسال.

**الحل:**
- `setPowerAppsDate()` يختار قيمة الحقل المخفي حسب طبيعته:
  - `type="date"` → `YYYY-MM-DD`
  - حقل datetime مخفي (`data-type="date"` / `data-ui="datetimepicker"` / `display:none`) → `YYYY-MM-DDT00:00:00.0000000`
  - غير ذلك → DD/MM/YYYY (fallback V1/V2)
- الحقل الظاهر (datepicker_description) يبقى DD/MM/YYYY (كما V1/V2).
- `tools/tests/portal-write-check.js` (17 فحصًا) على DOM وهمي (بشكل البوابة الفعلي)،
  وأُثبت 2 إخفاقات عند إرجاع العلّة.

**التحقق:**
- `node tools/tests/portal-write-check.js` → 17 passed, 0 failed.
- مطابقة `src` ↔ `deploy` (SHA256) بعد النشر.

---

## محلول مؤخراً — الموجة 7: شورت كت الصفحة 2 «الفني / المشاكل» (2026-10-19)

### 24. «فني فقط» لا يُضيف فنيًا — قيد PointerEvent + جذر مودال خاطئ (حرجة)

**الأعراض:** شورت كت «فني» في الصفحة الثانية لا يُضيف فنيًا (أو يُضيف فنيًا غير صحيح)، و«مشاكل» تُبلّغ نجاحًا دون التحقق من النتيجة.

**الأدلة الحية:** `اكواد/متابعة امر الشغل · Partner Portal صفحة 2 مودال الفني (دليل حي 2026-10-19).html`
+ `analysis/page2-technician-shortcut-investigation-2026-10-19.md`.

**الأسباب الجذرية (مُثبتة حيًا على البوابة):**
1. **عنصر الاختيار الخطأ:** صفوف الـ lookup في صفحة 2 تُحدَّد عبر `span[role="checkbox"]`
   (لا توجد `input[type=radio]`) — و`handleSubgridIframeModal` كان ينقر **`<tr>`** نفسه ⇒ لا يُحدَّد أي شيء.
2. **النقر المزدوج على عنصر تبديل:** `fillLookupModal.clickRow` كان ينقر الـ span **مرتين**
   (`dispatchClickSequence` تُطلق `MouseEvent('click')` ثم `el.click()`) — و`span[role="checkbox"]`
   **عنصر toggle**: نقرة = تحديد، نقرتان = **إلغاء التحديد** ⇒ «اختر» يبقى `disabled`.
3. **زر الحفظ الخطأ:** `iframeDoc.querySelector('#InsertButton, …, button.btn-primary')` يُرجع **أول عنصر في
   ترتيب الـ DOM** — وهو زر **«اختر» المخفي** لمودال الـ lookup (قبل «حفظ») ⇒ يُضغط زر مخفي
   ⇒ **النموذج لا يُحفظ أبدًا**، ومع ذلك تُعاد `{ok:true}`.
4. **سباق توقيت:** `button.launchentitylookup` داخل الـ iframe يظهر متأخرًا؛ الاستعلام مرة واحدة يفشل
   ⇒ `lookup-btn-not-found`.
5. **جذر المودال:** مودال الاختيار `.modal-lookup` موجود **داخل iframe النموذج** — و`getActiveModal(document)`
   كان يلتقط المودال الخارجي (بلا صفوف) ⇒ `{ ok:false, reason:'no-results' }`.
6. **اللوحة لا تقرأ المنطقة:** `selectRandomTechnician(null)` بلا منطقة ⇒ لا يُستخدم `regionTechMap` (L2)
   ⇒ سقوط إلى L3 (فني عشوائي) أو فشل.
7. **خريطة منطقة فارغة:** `regionTechMap[region] = ''` (منطقة مُلتقطة تلقائيًا) كانت تُعامَل كنجاح باسم فارغ
   ⇒ تمنع الرجوع إلى L3 (حلقة مسدودة: لا فني ⇒ لا تحديث للخريطة ⇒ لا فني).
8. **فشل صامت:** اللوحة كانت تطبع «✅ تم التعبئة» دائمًا بلا فحص `techRes.ok` / `probRes.ok`.
9. **نقر مزدوج على زر «اضافة المشاكل الفعلية المستخدمة»** ⇒ المودال يُفتح ويُغلق فورًا.
10. **`handleSubgridIframeModal` كان يمسح كل جداول المستند الرئيسي** بحثًا عن نتائج الاختيار ⇒ يلتقط صفوف
    شبكات الصفحة (فنيين/مشاكل) ويظنها نتائج بحث، ويكمل بصف خاطئ ثم يفشل.
11. **الإغلاق عبر** `[...doc.querySelectorAll('[data-dismiss="modal"]')].reverse()[0]` ⇒ قد يكون زر إغلاق
    **النموذج** فيُقفل النافذة الأولى (وهو ما رصده المستخدم: «يفتح ويُقفل، ويقفل النافذة الأولى»).
12. **الكود المطلوب غير موجود في قائمة البوابة:** `getSmartProblemCode` كان يمرّر رد الـ AI كما هو ⇒ الـ AI أرجع
    `WM30` (خارج القائمة المسموحة أصلًا) ⇒ `no-match`. وبعد فلترة نوع المنتج «غساله» لا تعرض البوابة إلا
    **5 مشاكل تركيبية**: `GI00 / SR00 / SR01 / WM01 / WMK0`، ولا وجود لأكواد الصيانة `WM02…WM05` في هذه القائمة —
    ولا حتى بالبحث داخلها. لذلك «مشاكل فقط» لا يمكنها إضافة `WM05` على هذه الأوامر أصلًا.

**الحل:**
- `modules/autofill/engine-lookups.js` — إضافة `clickOnce()` و`selectLookupRow()` و`isLookupRowSelected()`
  و`findModalSaveButton()`؛ اختيار الصف = **نقرة واحدة** على `span[role="checkbox"]` (أو الـ td) **مع التحقق**
  من `aria-checked`، ورفض المتابعة عند الفشل (`row-not-selected`).
- `modules/autofill/engine-lookups.js` — `handlePage2Modal`: انتظار زر الـ lookup في حلقة، الحفظ عبر
  `getElementById('InsertButton')` أولًا، و**تأكيد إغلاق المودال** بعد الحفظ (`save-not-confirmed` عند الفشل).
- `modules/autofill/engine-lookups.js` — `fillLookupModal`: تفضيل أي `.modal-lookup` مفتوح فعليًا (في أي مستند/iframe).
- `modules/autofill/engine-lookups.js` — `handleSubgridIframeModal`: اختيار الصف عبر `selectLookupRow`،
  اختيار زر «اختر» **مرئي وغير معطّل** فقط، وتأكيد إغلاق المودال بعد الحفظ.
- `modules/autofill/engine-lookups.js` — `handleSubgridIframeModal`: نقرة واحدة على زر الإضافة، اختيار iframe
  مودال النموذج، **انتظار فتح مودال الاختيار فعليًا**، قراءة الصفوف **منه فقط**، اختيار الصف عبر
  `selectLookupRow`، «اختر» مرئي وغير معطّل فقط، التحقق أن الحقل امتلأ (`field-not-filled`)، وتأكيد الحفظ.
- `modules/autofill/engine-lookups.js` — `closeLookupModalOnly()` / `closeFormModal()` بدل الإغلاق العشوائي
  بـ `[data-dismiss]` المعكوس؛ و`getVisibleItems` يقرأ من مودال الاختيار أولًا.
- `modules/autofill/engine-page3.js` — نفس تصحيح زر الحفظ (موضعان) + تأكيد الإغلاق.
- `modules/autofill/engine-page2.js` — `resolveTechnician`: `if (found && found[1])` لتفعيل الرجوع إلى L3.
- `control-panel.js` — `executePage2`: قراءة المنطقة + `registerRegion` + تمريرها + حفظ الـ roster
  + احتياطي أخير (أول فني متاح `'*'`) + **إبلاغ صادق** بنتيجة كل بند.
- `modules/autofill/engine-page2.js` — `getSmartProblemCode`: رفض أي كود من الـ AI خارج `ALLOWED_PROBLEM_CODES`
  والرجوع لخريطة الجهاز.
- `modules/autofill/engine-lookups.js` — `searchInLookupModal()` (بحث داخل مودال الاختيار لمعالجة ترقيم الصفحات)
  + إرجاع `available` مع `no-match` + بثّ `priorityPattern` فقط في تقارير التركيب.
- `control-panel.js` — عرض الأكواد المتاحة في الـ log وحالة اللوحة، وعدم كتابة «تم التنفيذ بنجاح» عند الفشل.

**التحقق (حي على البوابة — بلاغ تجريبي):**
- **الفني:** 3 صفوف ⇒ تحديد ⇒ `ats_contact_name` + `ats_contact` (GUID) ⇒ «حفظ» ⇒ **ظهر في شبكة الفنيين**
  (`AC522 & حسام محمد عبدالمنعم`).
- **المشكلة:** 8 صفوف بعد استبعاد الترصيد/المبيعات ⇒ `WM05 - (التجفيف لا يعمل)` ⇒ **ظهرت في شبكة المشاكل الفعلية**.
- `node --check` + `tools/deploy.ps1` + مطابقة `src ↔ deploy` (SHA256) + `unification-smoke` → **86/0**.

**ملاحظات لم تُعالَج (منخفضة):** `getProblemCode()` يقرأ `window.CFG.problemCodes` بينما المحمّل يضع `window._CFG`
(القائمة المضمّنة تطابق `selectors.json` حاليًا فالنتيجة متطابقة، لكن الربط مكسور).

---

## محلول مؤخراً — الموجة 11: «الموديل الفعلى 2 اجبارى» في الصفحة الأولى (2026-10-19)

### 25. نسخ الموديل 1 → الموديل 2 كان يحقن نصًا فقط بلا GUID (حرجة)

**الأعراض:** بعد «تنفيذ» الصفحة الأولى والانتقال للثانية، ترفض البوابة النموذج:
```
The form could not be submitted for the following reasons:
الموديل الفعلى 2 اجبارى
```
رغم أن خانة «الموديل الفعلي 2» تظهر مملوءة بالاسم.

**السبب الجذري (توقيع دالة خاطئ — لا علاقة له بالبوابة):**
`fillLookupField` في `control-panel.js` كانت تنادي:
```js
window.fillPowerAppsLookup(inputEl, inputEl.id || 'Lookup', val, btnSel);
```
بينما التوقيع الحقيقي في `engine-lookups.js`:
```js
fillPowerAppsLookup(inputSelector, searchValue, opts = {})
```
⇒ العنصر يمرَّر مكان الـ selector (فيرمي `querySelector` استثناءً)، والـ id يمرَّر مكان قيمة البحث،
و`opts` نص بدل كائن، و`btnSel` (المعامل الرابع) **متجاهَل تمامًا**. والاستثناء مبلوع في
`catch (_) {}` مرتين ⇒ يسقط التنفيذ على `emulateUserInput` الذي يكتب نصًا في `ldv_actualmodel2_name`
فقط، ولا يلمس `input[type=hidden]#ldv_actualmodel2` (الـ GUID).

**الأثر:** حقل الـ lookup يظهر «ممتلئًا» لكن البوابة تراه فارغًا. ونفس العيب أصاب ٣ مواضع أخرى:
العلامة التجارية (1568) والموديل 1 (1580) والموديل 2 في «البيانات الافتراضية» (1593، وكانت تستخدم
`modelBtn` الخاص بالموديل 1). و`doDuplicate` كانت تتجاهل القيمة المرجعة وتضع «نجاح»،
و`executePage1` تضغط Next دائمًا وتطبع «✅ تم التنفيذ بنجاح».

**الحل:**
- `fillLookupField` أُعيدت كتابتها: `findSafeLookupButton` + `fillLookupModal` (مودال البحث الحقيقي)،
  وتُرجع `{ ok, selected, reason }`.
- `findLookupGuidField()`: يحدد `<field>` المخفي المقابل لـ `<field>_name`، و`clearLookupField()`
  يفرّغ النص القديم قبل البحث (لأن `fillLookupModal` تتخطى الفتح إذا «طابقت» القيمة الظاهرة).
- التحقق بعد الاختيار: GUID فارغ ⇒ `lookup-not-committed` (فشل صريح، لا نجاح كاذب).
- `doDuplicate`: «مربوط» = GUID موجود (لا نص فقط)، وتُرجع `false` عند الفشل.
- `executePage1`: لا تضغط Next عند فشل ربط الموديل 2، وتعرض السبب.
- `modelBtn2` أُضيف إلى `getFallbackCfg` واستُخدم في كل مواضع الموديل 2.
- «البيانات الافتراضية»: عدّاد فشل + تحذير بدل نجاح صامت.

**التحقق:**
- `node --check src/unified-extension/control-panel.js` ✅
- `node tools/tests/unification-smoke.js` → **92 passed, 0 failed** (منها 6 فحوصات انحدار جديدة).
- تجربة حية: `PANEL_BUILD = 2026-10-19.12` — يظهر `LOOKUP_FILL: ldv_actualmodel2_name: نجح — "AY-A12NSE …"`.

---

## محلول مؤخراً — الموجة 14: تحليل وإصلاح الصفحة الثالثة (2026-10-20)

### 27. اختيار قطعة غيار خاطئة + اقتران عشوائي + حزمة ناقصة (حرجة)

**الأعراض:** عند «لصق الأكواد» تُضاف قطعة غيار **غير التي اخترتها** في البلاغ المصدر،
أو تُربط القطعة بكود عطل لا علاقة له.

**السبب الأول — اختيار أعمى:**
```js
// control-panel.js (قديم)
const matchRow = rows.find(r => r.innerText.toLowerCase().includes(targetLower)) || rows[0];
```
لو لم يطابق البحث شيئًا ⇒ **أول صف**. ولأن البحث كان يُبنى على اسم يحتوي الكود كله
(`"CODE _ (NAME)"`) بدل الكود وحده، كانت المطابقة تفشل كثيرًا.
**دليل حي:** البحث عن `WM-TTL-FRNT-LEG8KG` اختار `WM-TTL-BODY-8KG`.

**السبب الثاني — قراءة جدول خاطئة:** `readPartsFromGrid` لم تكن تعرف المخطط الفعلي،
فكانت `code = ''` و`name` يحمل `"CODE _ (NAME)"` كاملًا، دون `productId` ولا ضمان.

**السبب الثالث — اقتران تعسفي:** 18 كلمة مفتاحية عربية فقط، وإلا **«أول كود غير مستخدم»**.
وصف القطعة في الشبكة **لا يحتوي** على `ats_defectmajor` أصلًا، فالاقتران الحقيقي غير متاح للقراءة.

**الحل:**
- `scoreLookupRow` + `no-match` + اختيار سريع `fillLookupWithPick` (لا اختيار أعمى).
- تحقق GUID بعد الاختيار (`lookup-not-committed`).
- `parsePartName` + المخطط الفعلي: `tr[data-entity="msdyn_inventoryadjustmentproduct"]`.
- **حزمة v2** تحمل `productId`, `rowId`, `warranty`, `fullName` + رفض v1.
- **لوحة مراجعة قبل اللصق**: كود العطل + الضمان (داخل/خارج) + ⭐ لكل قطعة.
- **القطع الشائعة**: `localStorage['elaraby_fav_parts']` + أزرار في التبويب.
- **الكمية** عبر `emulateUserInput` + تحقق.

**تصحيح مهم:** `ldv_originaltotalusedsparepartscosts = 0` عندما تكون القطعة **داخل الضمان** —
لا علاقة له بحالة القطع (`ats_sparepartsstatus` تُحدَّد للكل من الصفحة ٢).

**ملفات:** `CHANGELOG.md` الموجة 14، `SHARED_KNOWLEDGE.md` (مخطط صف القطعة).

---

## محلول مؤخراً — الموجة 13: الشاشة السوداء المتراكمة في «تنفيذ الكل» (2026-10-20)

### 26. ستائر Bootstrap (`.modal-backdrop`) تتراكم بعد تنفيذ الصفحة الثالثة (حرجة)

**الأعراض:** بعد «تنفيذ الكل» تغطي الشاشة مساحة سوداء، وكل فترة **تغمق أكثر** حتى تصبح الشاشة شبه سوداء،
مع بقاء أدوات البوابة تعمل في الخلفية.

**السبب الجذري (مؤكد من CSS البوابة نفسها في `اكواد/`):**
```css
.modal-backdrop{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1040;background-color:#000}
.modal-backdrop.in{opacity:.5}
```
كل ستارة = أسود 50% يغطي الشاشة. Bootstrap 3 يُنشئ ستارة عند `modal('show')` ويحذفها فقط عند
`hidden.bs.modal`. إغلاق المودال بأي طريق آخر (زر `form-close`، أو مسار فشل، أو إخفاء يدوي)
**يترك الستارة**، فتتراكم: 1=50%، 2=75%، 3=87.5%، 4=94%، 5=97%.

**المولّدات في الكود (كلها كانت موجودة):**
1. **`executePage3`:** خطوة «تمت الصيانة» تفتح نافذة الحالة **وتتركها مفتوحة**، ثم تُكمل مباشرة
   بحقن الأكواد ⇒ مودال فوق مودال ⇒ ستارتان في كل تشغيل (`chk-done` مُحدد افتراضيًا!).
2. **نقر ثلاثي:** `addSparePartPage3` و`addSingleFaultCode` كانت:
   ```js
   ev.click[0].handler({...});   // 1
   await safeClick(addBtn);      // 2 (يطلق 5 أحداث منها click)
   addBtn.click();               // 3
   ```
   كل نقرة قد تفتح نسخة مودال جديدة ⇒ ستارة لكل نسخة.
3. **زر الحفظ** كان يُنقر مرتين (`safeClick` + `.click()`).
4. **مسارات الفشل** (`iframe-not-found` / `save-not-confirmed` / `modal-not-found`) كانت ترجع
   دون إغلاق المودال أو تنظيف الستارة، والعنصر التالي يفتح مودالًا جديدًا فوقها.
5. **لا يوجد أي كود تنظيف** لـ `.modal-backdrop` في المشروع كله (بحث `src/` ⇒ صفر).

**الحل:**
- `clearOrphanBackdrops()` — تحذف الستائر اليتيمة **فقط** لو لا يوجد مودال ظاهر، وتزيل `body.modal-open`
  و`padding-right`.
- `closeModalSafely()` — `$(m).modal('hide')` ثم زر إغلاق واحد ثم إخفاء قسري + تنظيف.
- `resetModalsBeforeStep()` — قبل فتح أي مودال في الصفحة 3 يُغلق أي مودال عالق من الخطوة السابقة.
- `clickOnceSafe()` — نقرة واحدة على زر الإضافة/الحفظ.
- **انتظار «تمت الصيانة»:** لا يُفتح مودال الأكواد حتى يغلق المستخدم نافذة الحالة (حتى دقيقتين)،
  وإلا يتوقف التنفيذ برسالة صريحة بدل تكديس الستائر.
- **شبكة أمان دورية** كل ~10 ثوانٍ في `observePageChanges` تُزيل أي ستارة يتيمة.
- **صدق النتيجة:** عدم إغلاق النموذج بعد الحفظ ⇒ `save-not-confirmed` (فشل)، لا نجاح وهمي.

**الحل الفوري للمستخدم قبل التحديث (من Console):**
```js
document.querySelectorAll('.modal-backdrop').forEach(e => e.remove());
document.body.classList.remove('modal-open');
```

**التحقق:**
- `node --check src/unified-extension/control-panel.js` ✅
- `node tools/tests/unification-smoke.js` → **123 passed, 0 failed** (8 فحوصات انحدار جديدة).
- `PANEL_BUILD = 2026-10-20.13`، ولوج `OVERLAY:` يثبت التنظيف.

---

## محلول مؤخراً — الموجة 4 (فرعية): تقوية control-panel.js (2026-10-18)

### 17. تعقيم XSS في control-panel.js — escapeHtml محلي (متوسطة)
**المشكلة:** وجود موقعين لـ `innerHTML` مع قيم ديناميكية غير معقمة:
- سطر 1209: اسم الجهاز من `readDeviceHint()` (قد يحتوي أحرف خاصة من البورتال)
- سطر 1952: ملخص الأكواد من الحافظة/التخزين المحلي (`codesSummary`)

**الحل:**
- إضافة دالة `escapeHtml` محلية مطابقة للنسخة في `popup.js`/`dashboard.js` (كيانات HTML قياسية: `&`, `<`, `>`, `"`, `'`, `` ` ``)
- تغليف القيم الديناميكية في الموقعين المذكورين
- التحقق: `node --check` ناجح، لا `innerHTML` بقيم غير معقمة

### 18. حماية `localStorage` — safeParseJSON (منخفضة)
**المشكلة:** قراءة `localStorage` بـ `JSON.parse` بدون تحقق شكل الكائن — قيمة تالفة تُسقط البيانات بتعافٍ صامت.
**الحل:** دالة `safeParseJSON(raw, fallback)` محلية تُستخدم في `loadState()` و `refreshCopiedCodesPreview()` مع fallback آمن.

### 19. استبدال `window.prompt` بحقل داخل اللوحة (متوسطة)
**المشكلة:** المسار الاحتياطي لـ "لصق JSON يدويًا" كان يستخدم `window.prompt()` — غير متوافق مع CSP، تجربة سيئة.
**الحل:** إضافة حقل `textarea#cp-manual-json` مخفي في تبويب PAGE_3 مع أزرار "تطبيق/إلغاء"، يظهر فقط عند الحاجة، ويعالج الإدخال بـ `safeParseJSON`.

### 20. دمج 4 مؤقتات في نبضة واحدة + مراقبة مُعدلة (أداء — عالية)
**المشكلة:** أربعة `setInterval` منفصلين (4ث، 1.2ث، 1.5ث، 10ث) + `MutationObserver` على `body/subtree` يعالج كل mutation فوريًا → استهلاك CPU عالٍ.
**الحل:**
- دمج المؤقتات في **نبضة واحدة 1.2ث** مع عدادات: كشف الصفحة (كل نبضة)، حقول المراقبة (كل نبضة ثانية)، حالة الصفحة (كل 8 نبضات ≈ 10ث)
- إلغاء حارس إعادة الحقن الدوري (4ث) — الاعتماد على `MutationObserver` الموجود الذي يكتشف إزالة اللوحة ويعيد حقنها فورًا
- إضافة buffer للـ `MutationObserver` logs (تفريغ مع النبضة) لتقليل استدعاءات `logPage`

### 21. توحيد عبور الـ iframes عبر `shared/frame-walker.js` (صيانة — متوسطة)
**المشكلة:** 19 موضع عبور `iframe` يدوي مكرر (`contentDocument || contentWindow?.document` داخل `try/catch`) — خطر التناقض وصعوبة الصيانة.
**الحل:**
- دوال موحدة: `getShallowDocs()` (سلوك حالي: main + iframes مستوى أول فقط)، `findFirstInFrames()` (تعاقبي عبر `window.findInFrames` من frame-walker، مع رجوع سطحي تلقائي عند غيابه)
- استبدال الـ 19 موضعًا بدعوات الدوال الموحدة
- إضافة `shared/frame-walker.js` إلى كتلة `control-panel.js` في `manifest.json` (اعتماد صريح — المكتبة محمية بتحميل مزدوج `__elarabyFrameWalkerLoaded`)
  > تحديث (2026-10-19): `getAllDocs()` و `findAllInFrames()` أُزيلا لأنهما لم يُستخدما إطلاقًا (كود ميّت). التفاصيل في `CHANGELOG.md`.
**السبب الجذري (استنتاج خاطئ من مثال متماثل):** تعليق سابق في الملف استند إلى رسالة البوابة
«Example: **10**/10/2026» واستنتج MM/DD/YYYY — لكن `10/10` تاريخ **متماثل** لا يفرّق بين الصيغتين، فكان الاستنتاج بلا دليل.
**أدلة الصيغة الصحيحة (4 مصادر متطابقة):**
1. `SHARED_KNOWLEDGE.md` — `daterangepicker: locale.format = 'DD/MM/YYYY'` و `moment(...).format('DD/MM/YYYY')`.
2. `Tempermonky/report-processor.js` — «Portal dates might be in various formats, normalize to **DD/MM/YYYY**».
3. المرجع الحيّ V1 و V2 (`مساعد التقفيلات`) — `FR.date` يكتب `data.date` كما هو من البحث، وهو `DD/MM/YYYY` (ولم يتضمنا أي معالجة datepicker خاصة).
4. `fill-options.js` — يولّد `dateStr` بصيغة `DD/MM/YYYY` (أمس).
**الحل:**
- إضافة المصدر الوحيد `window.parsePortalDate(rawDate)` في `shared/portal-selectors.js` (يعيد `{day, month, year, iso, display}` مع `display = DD/MM/YYYY` و`iso = YYYY-MM-DD`، ويرفض شهرًا غير صالح).
- `engine-page1.js` يستخدمه بدل التحليل المحلي (وأُزيل الكود الميت الذي كان فيه فرعان متطابقان).
- حقول `type="date"` تبقى تأخذ ISO، والباقي يأخذ `DD/MM/YYYY`.
**التحقق:** اختبارا 10 (runtime: `17/10/2026` ← `17/10/2026` وليس `10/17/2026`، ورفض `17/13/2026`) و11 (static: لا يوجد بناء MM/DD في `engine-page1.js`)، وأُثبت أنهما غير شكليين (4 إخفاقات عند إرجاع العلّة).

---

## محلول مؤخراً — تعارض مستمعي onMessage (Message Bus موحّد)

**الأثر (قبل الحل):** أوامر الموجودات كانت تصل أحياناً لمستمع خاطئ
(EXTRACT_DEVICE_DATA، PARTS_SEARCH، REPORT_DETAIL/BATCH، START_SECOND_VISIT_QUEUE)
لأن `content-script.js` و `order-extractor.js` كلاهما محقونان على نفس الدومين
وكلاهما يضيف `chrome.runtime.onMessage.addListener`؛ أول من يردّ يكسب في Chrome.

**الحل المطبّق (المرحلة A+B):**
- إنشاؤ نسخة `message-bus.js` plain-JS في
  `master-portal/shared/message-bus.js` (وحُرّك template في
  `unified-extension/shared/message-bus.js`)، بموزّع أحاد يملك action لكل handler.
- تسجيل أفعال content-script (9 أفعال) و order-extractor (7 أفعال) عبر
  `messageBus.on(...)` بدلاً من المستمع الخام؛ إزالة قوائم `OWN_ACTIONS` اليدوية.
- إصلاح `EXTRACT_DEVICE_DATA`: الرد يُرسل قبل بدء التنقل من Reportdetail
  (قاعدة "Respond BEFORE navigation") لتفادي ضياع الرد في تمزق السياق.
- إزالة كتل fallback الميتة.
- `manifest.json`: استيراد `shared/message-bus.js` قبل content-script و
  مع order-extractor.
- مراجعة كود (موامين) + متابعة خطة (عزازي): 9/9 بنود PASS، node --check سليم،
  النشر في مجلد مساعد التقفيلات مؤكد.

**ملاحظة للمراحل التالية (خارج نطاق A+B):** مستمعات خام ما زالت في
background.js / popup.js / tampermonkey-runner.js / smart-log.js —
ستُحوَّل إلى الموزّع الموحّد في مراحل لاحقة.

---

## محلول مؤخراً — CRM Extractor (tokens + Message Bus)

**الأثر (قبل الحل):** ألوان مبعثرة ثابتة في `crm-content` و `ui-components`،
و`crm-content.js` كان يضيف مستمع `chrome.runtime.onMessage` خام فيتعارض مع
الموزّع الموحّد.

**الحل المطبّق:**
- توكنايز كامل لـ `master-portal/crm-content/src` (FileUploader / ProgressPanel /
  ResultsTable / styles/main.css) و `master-portal/ui-components` (9 ملفات) عبر
  `var(--ea-*)` فقط؛ صفر ألوان خام في الـ src (الوحيد الباقي المقصود: hover
  `rgba(0,0,0,0.1)` في Badge و SVG chevron في Select).
- توسيع `design-system/tokens.css` (المصدر الموحّد) بأقسام dark + light:
  `--ea-neutral(-2)` / `--ea-faint(-2)` / `--ea-input-disabled(+text)` /
  `--ea-icon-fill` / `--ea-track` / `--ea-stripe` / `--ea-modal` /
  `--ea-row-selected` / `--ea-scroll-*` / `--ea-badge-*-bg|text` + `--ea-info`.
- `crm-content/src/index.ts`: استبدال المستمع الخام بـ `onCRMMessage(...)` عبر
  الموزّع الموحّد (START/STOP/GET_STATUS/EXPORT_RESULTS) + `data-theme="light"`
  على جذر الواجهة.
- `manifest.json` (unified + النشر): إضافة `"css": ["styles/tokens.css"]`
  لإدخال CRM ليصل Theme للألوان.
- إعادة بناء prod وإعادة مزامنة 3 نسخ من `crm-content.js` (dist /
  unified-extension / مجلد النشر) بنفس SHA256
  `A25FA11220AA94DECFA5C3BE89728E7DA5BFED91571C1470124A4F2DDA2A43FB`؛
  و 3 نسخ من `tokens.css` بنفس SHA256
  `E2C16A5FF5917D3ECD31CDBB948367E56B53345DC1CE363305A3AE8218E58C58`.
- إضافة سكربت `build:deploy` في `crm-content/package.json` يعيد البناء و ينقل
  الناتج إلى `unified-extension/content/crm/`.
- مراجعة كود (سلطane) + تتبع (عزازي): كل الرموز المستخدمة معرّفة، node --check
  سليم على النسخ الثلاث، JSON صالح والعربية سليمة.

**ملاحظة:** `master-portal/crm-content/src/styles/main.css` غير مُستورد
(dead) — توكنايزه احتياطي؛ الألوان الفعلية تأتي من `tokens.css` عبر الوراثة.

---

## خطوات الحلول المقترحة

### لإصلاح خطأ ASCID:
1. التأكد من أن المستخدم سجل دخوله بشكل صحيح
2. التحقق من وجود `window.crmAccount.accountId` في الصفحة
3. إضافة validation قبل استدعاء `GetascfromAccount()`
4. استخدام `try-catch` لmanipulation الأخطاء

### لتوحيد كلمات السر:
1. إنشاء ملف إعدادات مركزي لكلمات السر
2. ربط كل صفحة بكلمة السر الصحيحة
3. تحديث `portal_automation.js` لاستخدام الإعدادات المركزية

### لتحسين التنقل:
1. بناء Dashboard موحد يعرض كل البيانات في صفحة واحدة
2. استخدام AJAX لتحميل البيانات بدون إعادة تحميل الصفحة
3. إضافة caching للبيانات المحملة

---

*هذا الملف يُحدّث عند اكتشاف مشاكل جديدة أو حل مشاكل موجودة.*
