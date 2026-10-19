# تحقيق حي — شورت كت «فني / مشاكل» في الصفحة الثانية (2026-10-19)

> **النطاق:** `control-panel.js::executePage2()` — أزرار «فني فقط» / «مشاكل فقط» / «الكل».
> **الطريقة:** فحص حي على بوابة El Araby (بلاغ صيانة تجريبي — غساله TOSHIBA، منطقة فايد) عبر أتمتة المتصفح.
> **الأمان:** لم يُحفظ أي تغيير على البلاغ (فتح مودالات ثم إغلاقها فقط).
> **الأدلة الخام:** `اكواد/متابعة امر الشغل · Partner Portal صفحة 2 مودال الفني (دليل حي 2026-10-19).html`

---

## 1) الأعراض

| الاختصار | السلوك المرصود |
|----------|----------------|
| **فني فقط** | لا يُضاف فني (أو يُضاف فني غير صحيح) — وأحيانًا بلا أي رسالة خطأ |
| **مشاكل فقط** | يُبلّغ «تم التعبئة» بغض النظر عن النتيجة الفعلية |
| **الكل** | نفس المشكلتين مجتمعتين |

> ملاحظة المستخدم: «فني/مشاكل ص2 مش شغالة بكفائة».

---

## 2) الأسباب الجذرية (مُثبتة حيًا أو بالقراءة)

### 2.1 — قيد PointerEvent (السبب الأهم) — **مُثبت حيًا**
`engine-lookups.js::dispatchClickSequence()` كان يُرسل `new MouseEvent('pointerdown' / 'pointerup')`.
البوابة تربط اختيار صفوف الـ lookup (`span[role="checkbox"]`) بـ **`PointerEvent` حقيقي**، فالمعالج لا يُفعَّل ⇒
`aria-checked` يبقى `false` ⇒ زر **«اختر» (Select) يبقى `disabled`** ⇒ لا يمكن إتمام اختيار الفني.

مصفوفة التجربة العملية (مودال الفنيين، صف `AC522 & حسام محمد عبدالمنعم`):

| الأسلوب | aria-checked | زر «اختر» |
|---------|--------------|-----------|
| `MouseEvent('pointerdown')` (السلوك القديم) | `false` | `disabled=true` ❌ |
| `PointerEvent('pointerdown')` حقيقي | `true` | `disabled=false` ✅ |
| `keydown/keyup ' '` على الـ span | `true` | `disabled=false` ✅ |
| `jQuery(span).trigger('click')` | `true` | `disabled=false` ✅ |

هذا هو القيد الذي كان مكتوبًا في `SHARED_KNOWLEDGE.md` («زر Select يبقى disabled؛ يلزم تعامل خاص») — وقد تم تفسيره.

**بعد الإصلاح (تجربة حية):** نقر «اختر» ملأ:
```
ats_contact_name       = "AC522 & حسام محمد عبدالمنعم"
ats_contact            = "eae70e16-4563-f111-a826-70a8a57bf2b2"
ats_contact_entityname = "contact"
```

### 2.2 — التقاط مودال الاختيار الخاطئ — **مُثبت حيًا (بنية DOM)**
مودال «إضافة فني» = مودال خارجي في المستند الرئيسي يحتوي **iframe** (`_portal/modal-form-template-path/…`)،
ومودال الاختيار `.modal-lookup` يوجد **داخل الـ iframe** — وليس في المستند الرئيسي.

`fillLookupModal()` كان يبدأ بـ `docsToSearch = [rootDoc, btn.ownerDocument, document]` (أي المستند الرئيسي أولًا)،
و`getActiveModal(document)` يلتقط المودال الخارجي (بلا صفوف) ⇒ `visibleItems.length === 0` ⇒
`{ ok:false, reason:'no-results' }`.

### 2.3 — اللوحة لا تقرأ «المنطقة»
`executePage2()` كانت تنادي `selectRandomTechnician(null)` (بلا منطقة) — بينما المحرّك ينادي
`selectRandomTechnician(targetTech, targetRegion)`.
⇒ لا يُستخدم `regionTechMap` (L2) ⇒ سقوط إلى L3 (فني عشوائي من `technicianRoster`) أو فشل.

كما أن حقول «المنطقة» **غير موجودة في DOM** للبلاغ (تم التحقق: `#ldv_area_name` / `#ldv_area` /
`input[aria-label*="منطقة"]` = لا شيء) — فالمنطقة تُقرأ عبر واجهة البوابة
(`/_api/incidents(...)` → `/_api/accounts(...) → _ldv_area_value`) أي عبر `readRegionFromPage()`.

### 2.4 — خريطة منطقة بقيمة فارغة تمنع الاحتياطي — **مُثبت بالقراءة**
`content-script.js` يلتقط المنطقة تلقائيًا عند التحميل ويسجّلها بـ `regionTechMap[reg] = ''`.
وفي `resolveTechnician()` كان الشرط `if (found)` ⇒ يعيد `{ name: '' }` ⇒ `selectRandomTechnician` يرى اسمًا فارغًا
⇒ `{ ok:false }` ⇒ **لا يُجرَّب L3 إطلاقًا** (حلقة مسدودة: لا فني ⇒ لا تحديث للخريطة ⇒ لا فني أبدًا).

### 2.5 — فشل صامت في اللوحة
لم تكن اللوحة تفحص `probRes.ok` ولا `techRes.ok`، وكانت تطبع `✅ تم التعبئة` دائمًا ⇒ المستخدم يظن أن الفني أُضيف.

---

## 3) الإصلاحات المطبّقة

| # | الملف | التغيير |
|---|-------|---------|
| A | `modules/autofill/engine-lookups.js` | `dispatchClickSequence`: استخدام `PointerEvent` حقيقي لأحداث `pointerdown/pointerup` (مع الرجوع إلى `MouseEvent` عند عدم التوفر) |
| B | `modules/autofill/engine-page2.js` | `resolveTechnician`: تجاهل قيمة الخريطة الفارغة والمتابعة إلى L3 (`if (found && found[1])`) |
| C | `control-panel.js` | `executePage2`: قراءة المنطقة + `registerRegion` + تمريرها لـ `selectRandomTechnician` + حفظ الاسم في `technicianRoster` + **احتياطي أخير** بفتح مودال الفني واختيار أول متاح (`'*'`) + **إبلاغ صادق** بالنتيجة (نجاح/فشل لكل بند) |
| D | `modules/autofill/engine-lookups.js` | `fillLookupModal`: تفضيل أي `.modal-lookup` مفتوح فعليًا (في أي مستند/iframe) قبل الرجوع إلى أي مودال عام |

---

## 4) التحقق المنفَّذ

- `node --check` نظيف على الملفات الثلاثة ✅
- `tools/tests/unification-smoke.js` → **86 passed / 0 failed** ✅
- `tools/deploy.ps1` ناجح + تطابق `src ↔ deploy` (SHA256) ✅
- **الأدلة الحية أعلاه** (بنية المودال + مصفوفة PointerEvent + ملء الحقول) ✅

## 5) التحقق المتبقّي (يحتاج متصفح الإضافة)

الإضافة غير مثبتة في متصفح الأتمتة المستخدم للفحص، لذا **لم يُشغَّل شورت كت اللوحة نفسه**.
يلزم: تفعيل التحديث في `edge://extensions` ثم تجربة «فني فقط» على بلاغ ص2 ومتابعة سطر اللوج:
```
EXEC_PAGE2: نتيجة الفني: ok=true name=... source=...
```

## 6) نقاط لم تُعالَج (تحتاج قرارًا)

1. **زر الحفظ داخل الـ iframe:** `handlePage2Modal` يبحث بـ `#InsertButton, #SubmitButton, button[type=submit], input[type=submit], button.btn-primary` — وقد يطابق زر «اختر» للمودال المخفي قبل «حفظ». يحتاج تحققًا حيًا بعد تفعيل الإضافة.
2. **`window.CFG` ميت:** `getProblemCode()` يقرأ `window.CFG.problemCodes` بينما المحمّل يضع `window._CFG` — القائمة المضمّنة في `engine-page2.js` تطابق `selectors.json` حاليًا، فالنتيجة متطابقة، لكن الربط مكسور.
3. **ارتفاع نسبة أسماء الفنيين الوسخة في الـ roster:** `extractAndSaveTechnicians` قد تخزّن نص الصف كاملًا (مع الهاتف/الرقم) إذا لم يوجد رابط/خلية عربية نظيفة.
