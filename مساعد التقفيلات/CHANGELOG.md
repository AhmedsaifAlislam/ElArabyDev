# CHANGELOG — مساعد التقفيلات

## 2026-08-01 — إصلاح إكمال الصفحة الثانية عبر iframes المتداخلة

### الهدف
إكمال دورة الـ AutoFiller بعد الصفحة الأولى: بعد أن يتم ملء PAGE_1 (السيريالان) والضغط على Next، كان المستخدم يواجه "عملت كل حاجة في الصفحة الأولى لكن لم تنتقل إلى الصفحة الثانية".

### السبب الجذري
بعد الضغط على Next يقوم المتصفح بـ **full reload** للصفحة التالية. عند إعادة التحميل:
- `processQueueOnLoad()` يقرأ `currentTask` ويعيد تشغيل `runSingleLineWithRouter()`.
- `getActivePageFeature()` كانت تفحص `document` فقط فلم تكتشف PAGE_2 (لأن أزرار "اضافة مشاكل فعلية"/"اضافة فني" موجودة داخل iframes متداخلة في PowerApps).
- كل توابع التنفيذ (`findFirst`, `findFieldByLabel`, مكتشفو الأزرار, `handlePage2Modal`, `selectRandomTechnician`, `hasExistingSubgridRow`, `waitForSaveComplete`, `addFaultCodePage3`, `handleSubgridIframeModal`) كانت تبحث في `document` فقط — مخالفة للقاعدة الذهبية في AGENTS.md (العناصر دائماً داخل iframes).

### التعديلات في `content-script.js`
1. **`collectAllDocs(root)` أصبح recursive** — يجمع main document + كل الـ iframes المتداخلة (بأي عمق) مع حماية من الـ cycles.
2. **`findFirst()`** يبحث الآن في كل المستندات (`collectAllDocs(document)`) وليس `document` فقط.
3. **`findFieldByLabel()`** يكرر البحث عن اللابل في كل المستندات.
4. **إضافة `findButtonByText(regex, rootDoc)`** — يبحث عن أي زر/رابط مطابق في كل الـ iframes.
5. **استبدال مكتشفو الأزرار في الراوتر** (`clickNextAndWaitForSave`, أزرار Next في PAGE_1، أزرار Save/Next في PAGE_2) بـ `findButtonByText`.
6. **`handlePage2Modal`** — البحث عن زر الإضافة + المودال أصبح عبر كل المستندات.
7. **`waitForModalIframe`** — بحث recursive عن iframe المحمّل داخل المودال (يدعم iframes متداخلة).
8. **`waitForModalCloseIfOpen`** — يفحص كل المستندات.
9. **`hasExistingSubgridRow`** — يستخدم `collectAllDocs`.
10. **`readDeviceTypeFromPage`, `readComplaintCodeFromPage`, `fillPowerAppsLookup`** — البحث عن الحقول في كل المستندات.
11. **`selectRandomTechnician`, `addFaultCodePage3`, `handleSubgridIframeModal`** — مكتشفو الأزرار والـ iframes في كل المستندات.
12. **`getActivePageFeature`** (من التعديل السابق) أصبح يفحص كل الـ iframes عبر `collectAllDocs`.

### ملاحظة
كل هذه التوابع function declarations في نفس النطاق — الـ hoisting يعمل، فلا يوجد خطأ عند استدعاء `collectAllDocs` من `findFirst` رغم تعريفه لاحقاً في الملف.

### الاختبار المطلوب
- إعادة تحميل الإضافة (Edge → chrome://extensions → Reload).
- تشغيل Batch على تكييف مكوَّن من سيريالين والتأكد من: PAGE_1 (سيريالان) → PAGE_2 (مشاكل + فني) → رفع الصورتين تلقائياً.

---

## 2026-08-01 — رفع المرفقات تلقائيًا ضمن دورة الـ FILLING

### الهدف
جعل رفع صور السيريالات (مخرجات الـ AI) جزءًا من دورة الـ AutoFiller بدون أي تدخل يدوي.

### المشكلة الأصلية
- رابط صفحة العمل الحقيقي هو GUID وليس CAS:
  `https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=94d5cdbe-...&stepid=...&sessionid=...`
- لذلك كانت `readTicketFromPage()` ترجع فارغًا → اللوج يعرض:
  - `0 للبلاغ الحالي (غير معروف)`
  - `⚠️ لم أجد رقم البلاغ في الصفحة`
- رغم أن رقم CAS موجود في الصفحة داخل حقل input اسمه `ticketnumber`
  (اسمه الكامل: `...$EntityFormView$ticketnumber` بقيمة مثل `CAS2026042050506420`)
  وموثّق في `Automating Portal Work Order Entry.md` سطر 5824.

### التعديلات

#### 1. `control-panel.js` — إصلاح `readTicketFromPage()` (سطر ~1371)
أصبح يبحث عن رقم البلاغ بالترتيب:
1. من رابط الصفحة (`CAS\d+` في URL)
2. من حقل `#ticketnumber` (input) → `input[name*="ticketnumber"]` / `input[id*="ticketnumber"]`
3. من حقل `#ats_name` → `input[name*="ats_name"]` / `input[id*="ats_name"]`
4. من نص الصفحة (body innerText) كاحتياط أخير
- الفحص يتم داخل `collectDocs()` فيشمل main document + كل الـ iframes (قاعدة PowerApps).

#### 2. `control-panel.js` — دعم `ticketOverride` في `handleUploadImages()` (سطر ~1565)
- توقيع جديد: `handleUploadImages(shadow, imagesOverride, ticketOverride)`
- عند وجود `ticketOverride` يُستخدم مباشرة بدل `readTicketFromPage()`.

#### 3. `control-panel.js` — مستمع أمر الرفع من AutoFiller (سطر ~1818)
```js
document.addEventListener('elaraby:upload-images', (e) => {
  const detail = e.detail || {};
  const host = document.getElementById(PANEL_ID);
  const shadow = host && host.shadowRoot ? host.shadowRoot : null;
  if (!shadow) return;
  handleUploadImages(shadow, null, detail.orderId).catch(() => {});
});
```

#### 4. `content-script.js` — بث أمر الرفع بعد إتمام البلاغ (سطر ~1908)
- داخل مسار `WORK_ORDER_REVIEW`، بعد `finalizeOrderInSession` وبعد نجاح الحفظ (`ok === true`):
```js
if (ok) {
  try { document.dispatchEvent(new CustomEvent('elaraby:upload-images', { detail: { orderId: currentTask.orderId } })); ... } catch(e) { ... }
}
```
- يُرسل قبل `storageRemove(['taskRetryFlag'])` وقبل الانتقال للبلاغ التالي.

### تدفق العمل الآن (Filling Cycle)
1. المستخدم يلصق مخرجات الـ AI في اللوحة ويضغط "تحليل" مرة واحدة → الصور تُحفظ في localStorage
   (مفاتيح: `elaraby_cp_images_data` / `elaraby_cp_images_done`).
2. الـ AutoFiller يبدأ Batch.
3. عند إتمام كل بلاغ وحفظه بنجاح → يبث حدث `elaraby:upload-images` مع `orderId`.
4. اللوحة تستقبل الحدث وترفع صور البلاغ عبر:
   - Web API `POST /_api/annotations` + CSRF (الأساسي)
   - أو حقن `input[type="file"]` عبر `DataTransfer` مع `clickAddNoteButton()` (fallback)
5. البلاغ يُعلَّم كـ "تم رفعه" (منع التكرار).

### متبقي/ملاحظات
- لا يزال طلب تعديل كود البوتوجاز `GS0800, 0819, GS0819` في `updateDeviceCodes()` معلّقًا.
- خطأ غير متعلق بالإضافة على الموقع: `shadow-panel.js:271 TypeError ... getElementById` (من الموقع نفسه).

### الاختبار المطلوب
- إعادة تحميل الإضافة (Edge → chrome://extensions → Reload).
- تشغيل Batch فعلي على البورتال والتأكد من رفع الصور تلقائيًا داخل الدورة.
