# تحقيق حي — شورت كت «فني / مشاكل» في الصفحة الثانية (2026-10-19)

> **النطاق:** `control-panel.js::executePage2()` + مسار المحرّك المستخدم (`engine-lookups.js`, `engine-page2.js`, `engine-page3.js`).
> **الطريقة:** فحص حي على بوابة El Araby (بلاغ صيانة تجريبي — غساله TOSHIBA، منطقة فايد) عبر أتمتة المتصفح،
> ثم **تنفيذ التدفق كاملًا** (إضافة فعلية) للتحقق.
> **الأدلة الخام:** `اكواد/متابعة امر الشغل · Partner Portal صفحة 2 مودال الفني (دليل حي 2026-10-19).html`

---

## 1) الأعراض

| الاختصار | السلوك المرصود |
|----------|----------------|
| **فني فقط** | لا يُضاف فني، مع رسالة نجاح وهمية |
| **مشاكل فقط** | لا تُضاف مشكلة، مع رسالة نجاح وهمية |
| **الكل** | الاثنان يفشلان |

---

## 2) الأسباب الجذرية (كلها مُثبتة حيًا)

### 2.1 — عنصر اختيار الصف خطأ (`handleSubgridIframeModal`)
صفوف مودال «المشاكل» تُحدَّد عبر `span[role="checkbox"]` داخل
`<td data-th="Select">`، **ولا يوجد** `input[type=radio]`.
الكود كان: `if (radio) … else dispatchClickSequence(rand)` حيث `rand` = `<tr>` ⇒ **لا يُحدَّد شيء**،
ويبقى «اختر» `disabled` (تجربة: `aria-checked` فضل `false` بعد النقر على الـ tr).

### 2.2 — النقر المزدوج على عنصر «تبديل» (`fillLookupModal.clickRow`)
`dispatchClickSequence(el)` تُطلق **نقرتين**: `MouseEvent('click')` ثم `el.click()`.
وبما أن `span[role="checkbox"]` عنصر **toggle**:
- نقرة واحدة ⇒ `aria-checked=true` + «اختر» يتفعّل ✅
- نقرتان ⇒ **إلغاء التحديد** ⇒ «اختر» يبقى `disabled` ❌

وهذا يفسّر لماذا تعمل lookups الصفحة الأولى (فيها `input[type=radio]` — النقر المزدوج لا يضرّها)
ولا تعمل lookups الصفحة الثانية (span toggle).

### 2.3 — زر الحفظ الخطأ (السبب الأخطر — نجاح وهمي كامل)
```js
iframeDoc.querySelector('#InsertButton, #SubmitButton, button[type="submit"], input[type="submit"], button.btn-primary')
```
`querySelector` بقائمة محدّدات يُرجع **أول عنصر في ترتيب الـ DOM** الذي يطابق أي محدّد — وتبيّن أن
زر **«اختر» المخفي** لمودال الـ lookup يأتي **قبل** زر «حفظ»:

| الترتيب | العنصر | مرئي | النص |
|---|---|---|---|
| i=0 | `button.btn.btn-primary` | ❌ مخفي | «اختر» |
| i=1 | `input#InsertButton` (type=button) | ✅ | «حفظ» |

⇒ النقر يذهب لزر مخفي، **النموذج لا يُحفظ أبدًا**، ثم تُعاد `{ ok:true }` بعد انتهاء مهلة الانتظار.
هذا هو سبب «الإضافة مش قادرة تتعامل مع المشاكل والفنيين» رغم أن الاختيار قد ينجح.

### 2.4 — سباق توقيت على زر الـ lookup
`button.launchentitylookup` داخل الـ iframe يظهر **بعد** تحميل الـ body بثوانٍ.
الاستعلام مرة واحدة بعد `sleep(600)` كان يفشل أحيانًا ⇒ `lookup-btn-not-found` (رُصد فعليًا أثناء الاختبار).

### 2.5 — جذر مودال الاختيار
مودال الاختيار `.modal-lookup` داخل **iframe النموذج** (وليس المستند الرئيسي).
`getActiveModal(document)` يلتقط المودال الخارجي (بلا صفوف) ⇒ `no-results`.

### 2.6 — اللوحة لا تقرأ المنطقة
`executePage2` كانت تنادي `selectRandomTechnician(null)` بلا منطقة ⇒ لا يُستخدم `regionTechMap` (L2).
وحقول «المنطقة» غير موجودة في DOM لهذا البلاغ ⇒ القراءة عبر `readRegionFromPage()` (واجهة البوابة).

### 2.7 — خريطة منطقة بقيمة فارغة تمنع الاحتياطي
`content-script.js` يلتقط المنطقة تلقائيًا ويسجّلها بقيمة `''`.
`if (found)` كان يعيد `{ name: '' }` ⇒ فشل فوري ولا يُجرَّب L3 ⇒ حلقة مسدودة.

### 2.8 — فشل صامت في اللوحة
لا فحص لـ `techRes.ok` / `probRes.ok` + طباعة «✅ تم التعبئة» دائمًا.

---

## 3) الإصلاحات المطبّقة

| # | الملف | التغيير |
|---|-------|---------|
| 1 | `engine-lookups.js` | `clickOnce()` — نقرة واحدة فقط (بلا تكرار) |
| 2 | `engine-lookups.js` | `isLookupRowSelected()` + `selectLookupRow()` — نقرة واحدة على `span[role=checkbox]`/td + التحقق من `aria-checked`، وإرجاع `false` عند الفشل |
| 3 | `engine-lookups.js` | `findModalSaveButton()` — البحث بالـ id أولًا ثم أزرار مرئية نصّها حفظ/Submit |
| 4 | `engine-lookups.js` | `handlePage2Modal`: انتظار زر الـ lookup (حتى 10s) + حفظ صحيح + **تأكيد إغلاق المودال** (`save-not-confirmed`) |
| 5 | `engine-lookups.js` | `fillLookupModal`: تفضيل أي `.modal-lookup` مفتوح فعليًا + `selectLookupRow` + رفض المتابعة عند `row-not-selected` / `select-btn-not-found` |
| 6 | `engine-lookups.js` | `handleSubgridIframeModal`: `selectLookupRow` + زر «اختر» مرئي وغير معطّل فقط + تأكيد الحفظ |
| 7 | `engine-page3.js` | نفس تصحيح زر الحفظ (موضعان) + تأكيد الإغلاق |
| 8 | `engine-page2.js` | `resolveTechnician`: `if (found && found[1])` — الرجوع إلى L3 عند خريطة فارغة |
| 9 | `control-panel.js` | `executePage2`: قراءة المنطقة + `registerRegion` + تمريرها + حفظ الـ roster + احتياطي (أول فني `'*'`) + **إبلاغ صادق** بكل بند |

---

## 4) التحقق الحي الكامل (End-to-End — إضافة فعلية)

### الفني
```
1.add ✅ → 2.modal ✅ → 3.lookup-btn ✅ → 4.lookup-clicked ✅ → 5.lookup-open ✅
6.rows=3 → 7.selected aria=true → 8.confirmed name="AC522 & حسام محمد عبدالمنعم"
9.save=InsertButton (نصه «حفظ») → 10.closed=true
شبكة الفنيين: AC522 & حسام محمد عبدالمنعم  ✅
```

### المشكلة
```
1.add ✅ → 3.lookup-btn ✅ → 5.lookup-open ✅ → 6.items=8 (بعد استبعاد ترصيد/مبيعات)
7.match="WM05 - (التجفيف لا يعمل)" → 8.selected ✅ → 9.field="WM05 - (التجفيف لا يعمل)"
10.save=InsertButton → 11.closed=true
شبكة المشاكل الفعلية: WM05 - (التجفيف لا يعمل)  ✅
```

> **ملاحظة:** تمت الإضافة على البلاغ التجريبي فعليًا (سجل مشكلة + سجل فني) لإثبات أن التدفق يعمل.

---

## 5) التحقق الآلي

- `node --check` نظيف على كل الملفات المعدّلة ✅
- `tools/deploy.ps1` ناجح + تطابق `src ↔ deploy` (SHA256) ✅
- `tools/tests/unification-smoke.js` → **86 passed / 0 failed** ✅

## 6) ملاحظات متبقّية (منخفضة)

1. `getProblemCode()` يقرأ `window.CFG.problemCodes` بينما المحمّل يضع `window._CFG`
   (القائمة المضمّنة تطابق `selectors.json` حاليًا فالنتيجة متطابقة، لكن الربط مكسور).
2. `extractAndSaveTechnicians` قد يحفظ نص الصف كاملًا (مع الهاتف/الرقم) إذا لم يوجد رابط/خلية عربية نظيفة.
3. مودال الفني يعرض 3 فنيين فقط حاليًا (مُرشّحين من البوابة) — سلوك البوابة لا الكود.

---

## 7) جولة ثانية (الموجة 9) — «مشاكل فقط»: المودال يُفتح ويُقفل فورًا

**العَرَض من المستخدم:** بعد إضافة الفني بنجاح، «مشاكل فقط» يفشل: يُضغط زر الإضافة، ثم العدسة،
فيُفتح مودال الاختيار ويُقفل فورًا — وتُقفل معه نافذة النموذج الأولى.

**السبب الحقيقي ليس PointerEvent ولا نقرة مزدوجة على العدسة** (اختُبر حيًا: نقرة واحدة تفتح،
والنقرة التالية على نفس العدسة **لا تُغلقه**). الأسباب الثلاثة الفعلية:

| # | السبب | الأثر |
|---|-------|-------|
| 1 | `dispatchClickSequence(addBtn)` = نقرتان على زر الإضافة | فتح/إغلاق غير مستقر |
| 2 | `getRowsFromDocs(allDocs)` يمسح **كل** جداول المستند الرئيسي | يلتقط صفوف شبكات الصفحة كأنها نتائج بحث ⇒ يكمل بصف خاطئ ⇒ فشل |
| 3 | الإغلاق بـ `[data-dismiss="modal"]` **المعكوس** | يضغط زر إغلاق **النموذج** ⇒ تُقفل النافذة الأولى |

**الإصلاح:**
- `clickOnce(addBtn)` — نقرة واحدة.
- اختيار iframe **مودال النموذج** (`.modal.in` الذي يحتوي iframe) بدل أول iframe مرئي.
- `clickOnce(lookupBtn)` + **انتظار `.modal-lookup.in` فعليًا** (حلقة 8 ثوانٍ، 3 محاولات).
- الصفوف **من مودال الاختيار فقط**: `getRowsFromDocs(collectDocs(lookupModal))`.
- `closeLookupModalOnly(doc)` + `closeFormModal(modal)` بدل الإغلاق العشوائي.
- `clickOnce(selBtn)` + التحقق أن الحقل المستهدف امتلأ (`field-not-filled`).

**التحقق الحي (بدون حفظ — الحفظ مُثبت في الموجة 8):**
```
1.add-clicked → 2.form-iframe ok → 3.lookup OPENED and stayed open → 4.items(raw)=10
5.items(filtered)=8 → 6.match=WM05 - (التجفيف لا يعمل) → 7.aria=true
8.field="WM05 - (التجفيف لا يعمل)" → 9.cleaned openModals=0
```
**مسار الفني لم يتأثر:** 3 صفوف فقط، `subgridNoise = []` (لا صفوف دخيلة من الشبكة).
