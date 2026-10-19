# المعرفة المشتركة — Shared Knowledge
# El Araby System — Common Patterns & Reference

> **آخر تحديث:** 2026-08-21

---

## صفرًا: الأنظمة الأساسية للإضافات / Core Extension Stack

كل عمل على إضافات Chrome في هذا المشروع يلتزم بالأنماط الاحترافية في
مهارة المشروع **`chrome-extension-mv3`** (`.opencode/skills/chrome-extension-mv3/`):

| النظام | الإلزام |
|--------|---------|
| **Manifest V3** | `service_worker` وليس `scripts`؛ لا `eval`/سكربتات ديناميكية (CSP)؛ الـ background بلا حالة دائمة |
| **Plain JS Modules** | `importScripts` في الـ background، `globalThis`/`window` للتسجيل — لا ES modules في هذه المشاريع |
| **HTML/CSS مباشرة** | `popup.html` + `styles/popup.css` — لا JSX، لا build step، RTL، tokens من `master-portal/design-system` |
| **Chrome APIs** | `runtime` (رسائل `bg()` موحدة + `return true` للقنوات غير المتزامنة)، `storage` (عبر proxy في content scripts)، `tabs`، `scripting` (world: MAIN)، `commands`، `notifications` |

القواعد التفصيلية والكود الجاهز في المهارة — لا تُكرَّر هنا.

---

## قاعدة صارمة: سيريال 2 / موديل 2 (Work Order Review)

> **مصدر القاعدة:** بلاغ حي 2026-08-16 — ثلاجة (SHARP) رُفضت: "المنتج الذي قمت بأدخاله غير متطابق مع الرقم المسلسل" لأن `ldv_serialnumber1` كان فيه "0".

- **سيريال 2 (`ldv_serialnumber1`) و موديل 2 (`ldv_actualmodel2`) مسموح بهما فقط لمنتجات مجموعة AC:**
  `تكييف`، `تكييف كونسيلد`، `PUMP CLEAN`، `مبرد هواء`، `منقى هواء`، `صيانة دورية تكييف`
- **كل المنتجات الأخرى** (ثلاجات، ديب فريزر، غسالات، بوتوجازات، سخانات، شاشات، SHA/AV/OE/PCP/TB/Watches/LIGHTING...) → **فاضي إلزاماً** مهما كانت بيانات الدخل.
- **Sharp علامة تجارية وليست نوع منتج** — لا تعامل منتجات شارب كلها كتكييف.
- التنفيذ في `content-script.js`: `isACProductType()` + `clearModel2Serial2Fields()` داخل `executePage1_Review`.

### قاعدة حماية السيريال (> 5 أحرف/أرقام إنجليزية = محمي)

> **أضيفت 2026-08-17** — سيريال حقيقي لا يُحذف ولا يُعدّل إطلاقاً إلا بتفعيل checkbox "الحقن الإجباري" (`forceOverwrite`) في الـ popup.

- **`isRealSerialValue(v)`** في `content-script.js`: القيمة تعتبر **حقيقية محمية** فقط إذا احتوت أكثر من 5 أحرف/أرقام إنجليزية (مثل `20C01#010171HA2C`).
- القيم القصيرة/الوهمية (`"0"`, `"AB"`, `"123"`, `"12345"`) → ليست حقيقية → يسمح بالكتابة فوقها (كان هذا سبب مشكلة بلاغ Sharp: `serial2 = "0"`).
- تُستخدم في: `fillAndVerifyProtected` (معامل `realValueFn`) لحقلي `Serial1`/`Serial2`، وداخل `clearModel2Serial2Fields` (سيريال 2 حقيقي لا يُمسح لغير AC إلا بـ `forceOverwrite`).

---

## صفحة Work Order Review — الصفحة الثالثة (PAGE_3) — بنية قطع الغيار

> **اكتُشفت 2026-08-17** من HTML حي + فحص DOM. الصفحة: `https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=...&stepid=...&sessionid=...`

### قيم الحقول المنسدلة (options)

**`ats_sparepartsstatus` — حالة قطع الغيار** (select، required):

| القيمة | النص | المعنى |
|--------|------|--------|
| (فاضي) | Select | — |
| `963400000` | مستعمل | القطع رُكّبت فعلاً |
| `963400001` | منتظر | القطع مطلوبة ولم تُركّب بعد |
| `963400002` | بدون قطع غيار | لا قطع |
| `963400003` | سحب | سحب قطع من العهدة |
| `963400004` | استبدال | استبدال قطعة |

**`ats_warrantystatus` — داخل/خارج الضمان** (select، required):

| القيمة | النص |
|--------|------|
| `963400000` | داخل (label: In) |
| `963400001` | خارج (label: Out) |

> ⚠️ القيم `963400xxx` هنا **مختلفة** عن `753240001` (Out warranty) المذكور في حالات البلاغ. لا تخلط بينهما.

### الـ Subgrid لقطع الغيار — مباشرة في الصفحة (ليس modal)

- **`#InventoryAdjustmentProduct_Subgrid`** — للـ non-LSC (الافتراضي).
- **`#InventoryAdjustmentProductIsLscYes_Subgrid`** — عند `ldv_islsc` = نعم/1.
- أزرار الإضافة عناوينها: `title='اضافة قطعة غيار للصيانة'` / `title='اضافة قطعة غيار للتركيبات'` (تُظهر/تُخفى حسب `ldv_workordertype`: 0=تركيبات، 1=صيانة).
- **الصفوف تُحمَّل عبر AJAX** من `/_services/entity-subgrid-data.json/{guid}` — غير موجودة في HTML المصدر. انتظر تحميل الصفوف قبل قراءتها.
- **الأعمدة** (عبر `data-attribute`): `msdyn_product` (اسم القطعة)، `ats_quantity`، `ats_availablequantity`، `ats_price`، `ats_totalprice`، `ats_inventorystatus`، `ats_warrantystatus`، `ats_plantid`.
- **الأسعار** في خلايا `[data-attribute="ats_totalprice"]` — `data-value` عبارة عن **JSON** مثل `{"Value": 1500.0}` (لا تقرأها كنص رقمي مباشر).

### حقول التكلفة والتعليق (كلها في نفس الصفحة)

| الحقل | id / data-logical-name | النوع | ملاحظات |
|-------|------------------------|-------|---------|
| تكلفة قطع الغيار المستخدمة | `ldv_originaltotalusedsparepartscost` | money readonly | يُحسب تلقائياً بـ `calculateTotalSparePartsPrice()` **فقط** لو الحالة = `963400000` (مستعمل) |
| المبلغ المحصل | `ldv_actualcollectedamount` | money | للمدفوعات/التحصيل |
| التكلفة الإجمالية | `ldv_originaltotalvisitcost` | money readonly | visit + spare parts |
| **آخر تعليق** | `ldv_resourcelastcomment` | text (maxlength 2000) | **required** — حقل التعليق في PAGE_3 |

### دالة حساب التكلفة في البورتال

```javascript
// من HTML الصفحة — تفهم كيف يُحسب السعر تلقائياً
function calculateTotalSparePartsPrice() {
  if (ats_sparepartsstatus != null && ats_sparepartsstatus.value != 963400000) {
    $('#ldv_originaltotalusedsparepartscost').val(0);
    return;
  }
  // subgrid = InventoryAdjustmentProduct_Subgrid أو ...IsLscYes_Subgrid حسب ldv_islsc
  var sparePartPrice = subgrid.querySelectorAll('[data-attribute="ats_totalprice"]');
  var total = 0;
  for (i = 0; i < sparePartPrice.length; i++) {
    total += parseFloat(JSON.parse(sparePartPrice[i].dataset.value).Value);
  }
  $('#ldv_originaltotalusedsparepartscost').val(total);
}
```

### الكيان Dataverse والعلاقة

- الكيان: `msdyn_inventoryadjustmentproduct` — المفتاح: `msdyn_inventoryadjustmentproductid`.
- العلاقة بالبلاغ: `ats_incident_msdyn_inventoryadjustmentproduct_Caseid` (المرجع `ats_caseid`).
- الفلاتر في fetch XML: `ats_spareturn = 1` و `ats_islsc` حسب الحالة.

### التنفيذ في content-script.js (ميزة التعليق التلقائي لقطع الغيار)

دوال جديدة (2026-08-17): `handleSparePartsComment` + `waitForSparePartsGrid` + `extractSparePartRows` + `readSparePartsTotalFromField` + `readCollectedAmount` + `findCommentField` + `readIsLscFromPage`.

المنطق: حسب `ats_sparepartsstatus` + `ats_warrantystatus` يُكتب تعليق في `ldv_resourcelastcomment`:

| حالة القطع | حالة الضمان | التعليق |
|------------|-------------|---------|
| منتظر (963400001) | أي | `يحتاج [القطع] بالتكلفة [السعر]` |
| مستعمل (963400000) | داخل | `تم تغير [القطع]` — بدون أسعار |
| مستعمل (963400000) | خارج | `تم تغير [القطع] بالتكلفة وتم تحصيل [المبلغ] جنية` |
| بدون/سحب/استبدال | — | لا تعليق |

أسماء القطع تُفصل بـ "و". المبالغ بلا فاصلة آلاف (`formatMoney` → `useGrouping: false`).

---

## تسجيل الجلسة لحظة بلحظة (Session Capture Recorder)

أُضيف 2026-08-17 في `content-script.js` (آخر الملف) لالتقاط حالة صفحات أمر الشغل
مرتبطة بمعرّف الأمر، لتتبع البيانات قبل أي انتقال/تحديث بين الصفحات:

- **المفتاح:** `autofiller_sessionCaptures` في storage (عبر `storageGet`/`storageSet` — Edge Tracking Prevention).
- **البنية:** `byOrder[orderId] = { orderId, firstSeen, lastSeen, pages[], events[] }`.
- **اللقطات (`capturePageState`):** عند التحميل (1500ms) + كل 5 ثوانٍ (لو الصفحة visible).
  كل لقطة = `{ ts, iso, seq, delta, url, orderId, stepId, pageType, reason, selects[], inputs[], buttons[], title }`.
  الحقول تُجمع من `document` + كل الـ iframes (`collectAllDocs`) — حد 60 لقطة/أمر.
- **الأحداث (`hookCaptureClicks`):** capture-phase على الكليكات المهمة (أزرار/روابط تنقل/selects)
  → `{ ts, iso, seq, delta, type:'click', tag, id, text, url }` — حد 200/أمر.
- **`seq`:** رقم تسلسلي شامل داخل الأمر (لقطات + أحداث معاً). **`delta`:** مللي ثانية منذ `firstSeen` — لترتيب الأحداث كما حدثت فعلياً.
- **`getOrderIdFromUrl`:** من `?id=` في query string. **`getStepIdFromUrl`:** من `?stepid=`.
- يعمل فقط على `/workorderreview|followup|review/` في الـ URL.
- **العرض:** تبويب "📸 الجلسة" في `popup.html`/`popup.js` (`loadSessionCaptures`/`renderSessionCaptures`) —
  **"الخط الزمني بالترتيب الفعلي + التوقيتات"**: يجمع اللقطات + الأحداث في Timeline واحد مرتّب بـ `ts`، كل عنصر بعلامة `#seq` و `+delta` (صيغة `2m5s`) ونوع (🖼️ لقطة صفحة / 👆 كليك) — داخل كل لقطة تُعرض selects/inputs/buttons.
  بحث بمعرّف الأمر، تصدير JSON (`btn-export-session`)، مسح (`btn-clear-session`).

---

## صفحة Work Order Review — أزرار الإضافة (مشاكل/فنيين/أكواد أعطال) — اكتشاف حي 2026-08-19

> هذا القسم يوثّق بنية النوافذ والأكواد التي اكتُشفت بجلسة حية على البوابة — **مطلوب لأتمتة**
> "المشاكل الفعلية" و"الفنيين" في AutoFiller ولوحة التحكم (control-panel). البيانات أصلية من البوابة.

### المنتجات (فئات) — من النظام

| الرمز | المنتج | ملاحظات |
|-------|--------|---------|
| AC | تكييف | صيانة / تركيب |
| WM | غسالة | |
| RF | ثلاجة | |
| DW | غسالة أطباق | |
| RG | بوتجاز ومسطح وفرن | |
| WH | سخانات مياه | |
| MR | مبرد مياه | |

### أكواد المشاكل الفعلية — فئة AC (تكييف) — (مثال موثّق لصيانة SHARP 12K)

| الكود | الوصف | الكود | الوصف |
|-------|-------|-------|-------|
| AC01 | البلازما لا تعمل | AC20 | رائحة كريهه |
| AC02 | التبريد ضعيف | AC21 | صوت زنه |
| AC03 | التبريد منعدم | AC22 | صوت عالى من الوحدة الخارجية |
| AC04 | التسخين ضعيف | AC23 | صوت عالى من الوحدة الداخليه |
| AC05 | الجهاز لا يعمل | AC24 | Premium care |
| AC06 | الجهاز يفصل بعد فتره | AC25 | يفصل تلقائيا |
| AC07 | الريموت كنترول لا يعمل | AC26 | يلزم تغيير الفلاتر |
| AC08 | المروحة لا تعمل | AC33 | توريد غطاء خارجى - صيانة دورية |
| AC09 | المروحة لا تفصل | AC34 | صيانة - تكييف - خارج الضمان |
| AC10 | الموجهات الأفقيه لا تعمل | AC35 | اجزاء مكسورة |
| AC11 | الموجهات الرأسيه لا تعمل | AC37 | Premium care |
| AC12 | الوضع البارد لا يعمل | AC99 | تكرار أعطال |
| AC13 | الوضع الجاف لا يعمل | ACIC | صيانة شركات شقيقة |
| AC14 | الوضع الساخن لا يعمل | ACK0 | دفع خزنة |
| AC16 | تسريب فريون | ACPC | صيانة شركات شقيقة |
| AC17 | تسريب مياه من الوحدة الخارجية | ACX0 | عقود صيانة |
| AC18 | تسريب مياه من الوحدة الداخليه | ACZ0 | صيانة خدمة تجار |
| AC19 | رائحة تراب | | |

> **ملاحظة:** الفجوات في التسلسل (AC15, AC27–32, AC36) أكواد محذوفة/مخلّفة في النظام — ليست خطأ.
> أكواد `AF01–05` (قلاية هوائية بدون زيت)، `AL01–04` (تلف الوحدة الخارجية: بصمة/لوحة لمس/قارئ كارت/بوردة) تظهر في القائمة الكاملة.
> **مهم:** أكواد "صيانة" غالباً تبدأ بـ `AC` مباشرة، بينما كود توريد مثل `AC33` يشير لصيانة دورية.

### بنية "إضافة المشاكل الفعلية المستخدمة" (نموذج Create)

- الزر في subgrid الصفحة: `a[title="اضافة المشاكل الفعلية للصيانة"]` (أو نص `اضافة المشاكل الفعلية المستخدمة`).
- يفتح **نموذج إضافة (Create)** عبر `window.open` إلى مسار Modal Form Template:
  ```
  /_portal/modal-form-template-path/{modalFormId}
    ?entityformid={entityFormId}
    &languagecode=1033
    &refentity=incident
    &refid={orderId}
    &refrel={relationship}
  ```
- العلاقات المكتشفة: المشاكل = `ldv_incident_ldv_case_problem_workorder` | الفنيين = `ats_incident_ats_caseresource_Case`.
- حقول النموذج (الاسم الكامل يبدأ بـ `ctl00$ContentContainer$MainContent$EntityFormControl$EntityFormControl_EntityFormView$`):
  - **نوع المنتج:** `ldv_producttype_name` (lookup)
  - **المشاكل الفعلية المستخدمة:** lookup بزر "Launch lookup modal"
  - زر الحفظ: `#InsertButton` (نصه "حفظ").
- **lookup المشاكل/الفنيين ("Lookup records"):**
  - حقل البحث: `input` داخل `.modal-body` (placeholder="Search"، يدعم wildcard `*`).
  - النتائج: `table tr` داخل `.modal-body` (نص الصف = `CODE - (الوصف)`).
  - أزرار: `.modal-footer` → Close / Select / Cancel. زر الاختيار `aria-label="Select"`، الإلغاء `aria-label="Cancel"`.
  - ترقيم: `li` (`1 2 3 … 120`) أو `a[data-page="N"][aria-label="page N"]`.
  - طريقة الاختيار: نقر الصف ثم زر Select. **(محلول — 2026-10-19:** صفوف مودالات الصفحة الثانية تستخدم `span[role="checkbox"]` وهو **عنصر تبديل (toggle)**: **نقرة واحدة** تُحدده، و**نقرتان متتاليتان تُلغي التحديد** ⇒ يبقى زر «اختر» `disabled`. القواعد: (1) انقر **مرة واحدة** على الـ `span` (أو `<td data-th="Select">`) — **لا** على `<tr>`؛ (2) **لا تستخدم `dispatchClickSequence()`** لاختيار الصفوف لأنها تُطلق نوعين من النقر (`MouseEvent('click')` + `el.click()`) — استخدم `clickOnce()` / `selectLookupRow()` في `engine-lookups.js`؛ (3) تحقّق من `aria-checked="true"` قبل المتابعة.**
- **قيد مهم:** CSS/`browser_query` لا تخترق iframe — للفحص الآلي يفتح الـ URL في تبويب أو يقرأ من `collectAllDocs`.
- **التحقق من الفلترة:** القائمة تعرض **كل** أكواد المشاكل (كل الفئات، ~1200 كود/120 صفحة) مرتبة أبجديًا — **ليست مفلترة حسب المنتج**. الأكواد تبدأ بـ `AC*` ثم `AF*` ثم `AL*`.

### مودال «إضافة فني» (الصفحة الثانية) — اكتشاف حي 2026-10-19

- **زر الفتح:** `اضافة فنى` (في المستند الرئيسي).
- **البنية:** مودال خارجي (`section.modal.modal-form.modal-form-insert`) ← بداخله **iframe**
  (`/_portal/modal-form-template-path/…?refentity=incident&refrel=ats_incident_ats_caseresource_Case`).
- **حقول الـ iframe:** `#ats_contact_name` (نص، مطلوب) + `#ats_contact` (hidden, GUID) + `#ats_contact_entityname` (hidden)
  + زر `button.launchentitylookup` («Launch lookup modal») + زر الحفظ `input.submit-btn.btn-primary` («حفظ»).
- **مهم:** مودال الاختيار (`.modal-lookup`) موجود **داخل الـ iframe نفسه** — ليس في المستند الرئيسي —
  ويُعرض **فورًا بلا بحث** (مثال: «3 records found»).
- **صف الفني:** `<tr data-id="<GUID>" data-entity="contact" data-name="…">` والاختيار عبر
  `span[role="checkbox"][aria-checked]` — **لا يوجد** `input[type=radio]` ولا `input[type=checkbox]`.
- **الاختيار الصحيح:** **نقرة واحدة** على الـ `span[role="checkbox"]` ⇒ `aria-checked=true` ⇒ زر «اختر»
  (`aria-label="Select"`) يُفعَّل ⇒ النقر يملأ `ats_contact_name` + `ats_contact` (GUID) + `ats_contact_entityname="contact"`.
  ⚠️ نقرتان = إلغاء التحديد (انظر قاعدة الـ toggle أعلاه).
- **زر الحفظ (مصيدة مهمة):** الحفظ هو `input#InsertButton` (type=button، نصه «حفظ»، مرئي). زر «اختر»
  (`button.btn-primary`، **مخفي**) يأتي **قبله في ترتيب الـ DOM** — لذلك
  `iframeDoc.querySelector('#InsertButton, …, button.btn-primary')` يُرجع «اختر» المخفي ولا يُحفظ النموذج أبدًا.
  **القاعدة:** ابحث بالـ id أولًا (`getElementById('InsertButton')`) أو استخدم `findModalSaveButton(doc)`.
- **سباق توقيت:** `button.launchentitylookup` قد يظهر بعد تحميل الـ iframe بعدة ثوانٍ — يجب **انتظاره في حلقة**
  (حتى ~10 ثوانٍ) بدل الاستعلام مرة واحدة.
- **حقل «المنطقة» غير موجود في DOM** لهذا البلاغ (`#ldv_area_name`/`#ldv_area`/`input[aria-label*="منطقة"]` = لا شيء) —
  المنطقة تُقرأ عبر واجهة البوابة (`readRegionFromPage` → `_api/incidents` → `_api/accounts._ldv_area_value`).

### مودال «إضافة المشاكل الفعلية المستخدمة» (الصفحة الثانية) — تحقق حي 2026-10-19

- نفس البنية تمامًا: مودال خارجي ← iframe (`entityformid=4b0af62b-…`, الكيان `ldv_case_problem`).
- الحقول: `#ldv_producttype_name` («غساله» — تُملأ تلقائيًا) + `#ats_producttypeproblem_name` (النتيجة) + زر
  `button.launchentitylookup` («المشاكل الفعلية المستخدمة Launch lookup modal») + `input#InsertButton` («حفظ»).
- الـ lookup يُعرض **10 صفوف** فورًا: `GI00` (ترصيد بلاغ أرضى) و`SR00/SR01` (مبيعات) و`WM02…WM05` وأخرى.
  **لا تنسَ استبعاد** `/ترصيد|ارضي|أرضي|بلاغ/`.
- صف المشكلة: `<tr data-id="…" data-entity="ldv_productproblem" data-name="WM05 - (…)" data-th="Select">`
  والاختيار عبر `span[role="checkbox"]` — **`handleSubgridIframeModal` كان ينقر الـ `<tr>`** (لا يُحدد شيئًا).
  **القاعدة:** استخدم `selectLookupRow(row)`.

### قسم "أكواد الأعطال" (يظهر في أوامر معينة — subgrid في الصفحة)

- زر: `اضافة كود عطل`. صفوف مثل `RF1800 - (مروحة)` / `RF1804` مع عمودي "كود العطل الرئيسي" + "وصف كود العطل".
- يتم التحميل عبر AJAX من `/_services/entity-subgrid-data.json/...` (مثل بقية الـ subgrids).

### أخطاء معروفة (رسائل حرفية)

- **خطأ السيريال (PAGE_1):** `الرقم المسلسل رقم 1 الذي قمت بأدخاله غير صحيح برجاء التأكد من صحته و اعادة المحاوله مره اخري` — تظهر أعلى الصفحة عند إدخال سيريال غير صحيح في Serial1.

### مثال بيانات حية (أمر صيانة)

- نوع البلاغ: **صيانة** | فئة المنتج: **AC** | العلامة: **SHARP** | الموديل: `AH-AP12ZHE`/`AU-A12ZHE` (SHARP A/C 12K) | السيريال: `25G120027408AHA2ZH` | البلاغ المبدئي: `AC22 - (صوت عالى من الوحدة الخارجية)` | العميل: ندي محمد احمد محمد (حساب 2012550696، الإسماعيلية).

---

## Lookup Modal على PAGE_1 (العلامة التجارية / الموديلات) — اكتشاف حي 2026-08-21

> **نتيجة جلسة حية:** الإضافة القديمة المثبتة نجحت في تعبئة بلاغين كاملين تلقائيًا (PAGE 1 + PAGE 2 لكل بلاغ) بدون أي تدخل. هذا يؤكد أن منطق الـ AutoFiller سليم وأن أي تطوير جديد يجب أن يستند إليه.

### بنية lookup modal (العلامة التجارية/الموديل الفعلي)

- **زر الفتح:** `button[aria-label*="Launch lookup modal"]` بجانب كل حقل lookup (العلامة التجاريه + الموديل الفعلي 1 + الموديل الفعلي 2 = 3 أزرار على PAGE 1).
- **رسالة المودال:** `Choose one record and click Select to continue` — الاختيار يتم بنقر صف ثم زر الاختيار.
- **الجدول:** أعمدة `Select | Brand | Product Type | Name` (للموديلات: `Select | Model | ...`). الصفوف نصها `CODE - (الوصف)` أو `CODE _ (الوصف)`.
- **حقل البحث:** `input` داخل `.modal-body` (class `query` / placeholder `Search`). **البحث يفلتر بعد النقر على زر Search** (زر `button[aria-label*="Search"]`/زر "Search Results" في رأس المودال) أو بعد Enter — الكتابة وحدها قد لا تفلتر.
- **أزرار التذييل (من الشكل الظاهر):** `اختر | إلغاء | إزالة القيمة` — زر الاختيار الفعلي هو **"اختر"** (يظهر كـ `aria-label="اختر"`).
- **الأزرار المضللة:** `button[aria-label*="Select"]` في رأس الجدول = **أزرار فرز الأعمدة** وليست زر التأكيد — لا تُنقر أبدًا.
- **طريقة الاختيار الصحيحة (من الكود `fillLookupModal`):**
  1. إن وُجد زر مسح `Clear` → انقر (لتفريغ القيمة القديمة) وانتظر 500ms.
  2. انقر زر الفتح (`Launch lookup modal`) وانتظر ~1800ms.
  3. **direct pick أولًا:** اجمع `.modal table tbody tr` الظاهرة (فلتر: `offsetParent !== null`, نص غير فارغ, بلا `norecords`). طابق الكود: `getRowCode` = أول جزء قبل ` _ ` أو `(`. تطابق Exact → `code===target` أو `normalize===target`؛ ثم starts-with بحدود؛ ثم includes.
  4. **انقر الصف المطابق** (أو radio/checkbox داخله إن وجد) وانتظر ~600ms.
  5. **زر التأكيد:** `selBtnList = .modal button.primary, button[aria-label*="Select"], button[aria-label*="تحديد"], button[aria-label*="اختر"]` ثم **`reverse().find(b => b.offsetParent !== null)`** — أي **آخر زر "اختر" ظاهر** (الترتيب مهم: مع وجود 6 مودالات متراكمة في DOM، القائمة تشمل مخفيًا وظاهرًا).
  6. انقر الزر + `dispatchEvent(new Event('click',{bubbles:true}))` وانتظر ~1000ms.
- **إن لم يوجد تطابق في القائمة المباشرة → البحث:** اكتب `modelCodeOnly` (الكود قبل ` _ `/`(`) في حقل البحث (selector: `[role='dialog'] input[type='search']`, `input[type='text']`, `.modal input`, `.modal input.query`)، ثم انقر زر البحث المجاور (أو أرسل Enter: keydown/keypress/keyup), وانتظر حتى 12 ثانية لظهور صف مطابق.
- **العلامة التجارية:** قائمة قصيرة (Hisense / SHARP / TORNADO) → اختيار مباشر بدون بحث.
- **الموديلات:** قائمة طويلة (~1200 كود / 13+ صفًا ظاهرة) → **بحث بالكود مطلوب** (مثال: `AH-XP18UHE` → 5 نتائج، الصف الأول مطابق).
- **الترتيب الإلزامي:** العلامة التجارية **قبل** الموديلات — lookup الموديل يعتمد على العلامة المختارة.

### قيد مهم: الحقول تظهر "—" حتى بعد التعبئة عبر بعض الأدوات

- استعلامات `:not([value=''])` على حقول lookup **مضللة** — قد تعيد موجودًا رغم أن الحقل ظاهريًا `—` (فارغ).
- **القاعدة: الاعتماد على الشكل الظاهر للمستخدم (snapshot / page_text) وليس استعلامات DOM الداخلية.**
- النموذج يرفض الإرسال برسائل: `العلامة التجاريه is a required field.` / `الموديل الفعلي 1 is a required field.` / `حالة الضمان is a required field.` / `رقم مسلسل 2 اجبارى` / `الموديل الفعلى 2 اجبارى` — كلها تظهر عند محاولة Next وحقولها فارغة فعلاً.
- **تراكم المودالات:** بعد عدة فتح/إغلاق تبقى مودالات مخفية في DOM (رُصدت 6 مودالات دفعة واحدة) — أي استعلام `.modal ...` يشمل المخفي؛ لذلك فلتر بـ `[style*='display: block']` أو `offsetParent !== null`.

### درس الجلسة (2026-08-21)

- المحاكاة اليدوية عبر أدوات تحكم المتصفح **بطيئة ولا تواكب** إضافة تعمل تلقائيًا — التطوير يجب أن يُبنى من الكود (الذي أثبت نجاحه) ثم يُختبر بجلسة حية واحدة مراقبة، لا بمحاكاة متكررة.
- بلاغ حي مثالي للتجربة: `CAS2026081953071553` (أحمد عبد الكريم محمد — تكييف، شكوى مبدئية `AC05 - (الجهاز لا يعمل)`)، البيانات: SHARP | `AH-XP18UHE`/`AU-X18UHE` | سيريال `21G070045955HX8UH` + `21G120045162UX8UH` | داخل الضمان.

---

---

## أولًا: أنماط الاستهداف المشتركة / Common Selectors

### البحث عن العناصر في iframes (PowerApps Portal)

```javascript
// ⚠️ البورتال يعمل على PowerApps — الجداول دائماً داخل iframes
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

### البحث في صفحات ASP.NET (CRM Portal)

```javascript
// البحث عن جدول النتائج
const table = document.getElementById('ContentPlaceHolder1_GridView1');

// البحث عن حقول الإدخال
const textBox = document.getElementById('ContentPlaceHolder1_TextBox1');
const dropDown = document.getElementById('ContentPlaceHolder1_DropDownList1');
const button = document.getElementById('ContentPlaceHolder1_Button1');

// البحث عن روابط PostBack
const links = document.querySelectorAll('a[href*="doPostBack"]');
const sameframeLinks = document.querySelectorAll('a.sameframe');
```

---

## ثانيًا: أنماط التخزين / Storage Patterns

### Edge Tracking Prevention

> **بعد التوحيد (2026-08-03):** استخدم مكتبة `shared/storage-proxy.js` (مصدرها `master-portal\shared\`) بدل تعريف الدوال يدويًا.
> توفّر: `window.storageGet(keys)` / `window.storageSet(data)` / `window.storageRemove(keys)` / `window.bg(action, extra)`.

```javascript
// من content script → background (عبر storage-proxy):
const data = await window.storageGet(['smartLog']);
await window.storageSet({ smartLog: [...] });
await window.storageRemove(['key']);

// إرسال رسالة عامة:
const res = await window.bg('searchDB', { query: 'test' });
```

> **الشرط:** background يجب أن يعالج رسائل `STORAGE_GET` / `STORAGE_SET` / `STORAGE_REMOVE`
> (متوفرة في background.js الخاص بمساعد التقفيلات والمساعد الذكي بعد Phase 2/3).

### نموذج الاتصال بـ background.js (يدوي — بدون storage-proxy)

```javascript
function bg(action, extra = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...extra }, (res) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res);
    });
  });
}

// الاستخدام:
const data = await bg('searchDB', { query: 'test' });
```

---

## ثالثًا: أنماط POSTBack / POSTBack Patterns

### كيف يعمل __doPostBack

```html
<!-- شكل الرابط في HTML -->
<a id="LinkButton1" href="javascript:__doPostBack('ctl00$LinkButton1','')">
    جاري مراجعتها
</a>
```

```javascript
// آلية العمل:
// 1. المستخدم يضغط على الرابط
// 2. __doPostBack تملأ حقولاً مخفية:
//    - __EVENTTARGET = 'ctl00$LinkButton1'
//    - __EVENTARGUMENT = ''
// 3. الفورم يُرسل بالكامل (POST)
// 4. السيرفر يعالج الطلب ويعيد الصفحة الجديدة
// 5. لا يوجد AJAX — كل عملية PostBack كاملة

// الطريقة الصحيحة للتنقل:
const link = document.getElementById('LinkButton1');
link.click();  // يستدعي __doPostBack تلقائياً

// ❌ لا تستخدم:
// window.location.href = 'inprogress.aspx'  ← لن يعمل لأنه بدون session
// fetch('/ASPPage/inprogress.aspx')  ← لن يعمل لأنه يحتاج PostBack كامل
```

---

## رابعًا: أنماط حقن السكريبتات / Script Injection Patterns

### على مواقع CSP صارم (Facebook, Messenger)

```javascript
// ❌ لا تستخدم eval() أبداً — CSP بيحظروا
eval(someCode);
document.createElement('script').textContent = someCode;

// ✅ الحل: chrome.scripting.executeScript مع files parameter
chrome.scripting.executeScript({
  target: { tabId: tabId },
  files: ['script.js'],
  world: 'MAIN'  // عشان السكريبت يشتغل في سياق الصفحة
});

// ⚠️ السكريبتات المخصصة (المُرفوعة كملفات) لا يمكن حقنها عبر files على مواقع CSP
// الحل: المستخدم ينسخ الكود والصقه يدوياً في Console (F12)
```

### حقن السكريبتات في البورتال

```javascript
// على PowerApps Portal — يمكن حقن السكريبتات عبر content scripts
// الملفات المدعومة في manifest.json:
{
  "content_scripts": [{
    "matches": ["https://elarabyportalpfs.powerappsportals.com/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }]
}
```

---

## خامسًا: أنماط قاعدة البيانات / Database Patterns

### IndexedDB (ممنوع استخدام Dexie)

```javascript
// الفتح
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ElArabyPartsDB', 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('masterData')) {
        const store = db.createObjectStore('masterData', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sparePartCode', 'sparePartCode', { unique: false });
        store.createIndex('modelCode', 'modelCode', { unique: false });
        store.createIndex('defectCode', 'defectCode', { unique: false });
      }
      if (!db.objectStoreNames.contains('inventory')) {
        const store = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
        store.createIndex('sparePartCode', 'sparePartCode', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// البحث
async function searchDB(query) {
  const db = await openDB();
  const tx = db.transaction('masterData', 'readonly');
  const store = tx.objectStore('masterData');
  const results = [];
  
  return new Promise((resolve) => {
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const row = cursor.value;
        if (row.sparePartCode.includes(query) || row.modelCode.includes(query)) {
          results.push(row);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}
```

---

## سادسًا: أنماط البحث / Search Patterns

```javascript
// البحث غير حساس لحالة الأحرف
const query = 'test';
const isContains = query.startsWith('*');
const searchText = isContains ? query.slice(1) : query;

// *text → بحث بالاحتوائية (contains)
// text → بحث بالبداية (startsWith)

if (isContains) {
  return value.toLowerCase().includes(searchText.toLowerCase());
} else {
  return value.toLowerCase().startsWith(searchText.toLowerCase());
}
```

---

## سابعًا: أنماط تصدير البيانات / Export Patterns

### تصدير CSV

```javascript
function exportToCSV(data, filename) {
  let csv = '\uFEFF';  // BOM for UTF-8
  csv += data.headers.join(',') + '\n';
  data.rows.forEach(row => {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### تصدير Excel (عبر SheetJS)

```javascript
function exportToExcel(data, filename) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}
```

---

## ثامنًا: Regex Patterns الشائعة

| الهدف | Pattern | مثال |
|-------|---------|------|
| رقم موبايل مصري | `/01[0-9]{9}/` | `01098388669` |
| رقم CAS | `/CAS\d+/` | `CAS2026051450930703` |
| رقم SAP | `/\b7[0-9]{7,9}\b/` | `733093443` |
| رقم حساب (يبدأ بـ 200) | `/\b(200\d{7})\b/` | `2000043359` |
| رقم حساب عام | `/(?:رقم\s*(?:الحساب|العميل)|Account\s*(?:No|Number|ID))[\s:]*([0-9]{6,})/i` | — |

---

## تاسعًا: أنواع المنتجات والماركات

### المنتجات

| الرمز | المنتج بالعربي | المنتج بالإنجليزي |
|-------|---------------|-------------------|
| AC | تكييف | Air Conditioner |
| WM | غسالة | Washing Machine |
| RF | ثلاجة | Refrigerator |
| DW | غسالة أطباق | Dishwasher |
| RG | بوتجاز و مسطح و فرن | Range |
| WH | سخانات مياه | Water Heater |
| MR | مبرد مياه | Water Cooler |

### الماركات

| الماركة | الاسم بالإنجليزي |
|---------|-------------------|
| هوفر | Hoover |
| كاندي | Candy |
| بريليانس | Brilliance |
| يونيون اير | Union Air |
| لوران | Laurant |
| تورنيدو | Tornado |

---

## عاشراً: حالات البلاغ

| الحالة بالعربي | الحالة بالإنجليزي | القيمة | ملاحظات |
|---------------|-------------------|--------|---------|
| مجدول | Scheduled | — | تم الجدولة |
| قيد التنفيذ | In Progress | — | الفني ذهب يصلح |
| مكتمل | Completed | — | تم الانتهاء |
| ملغي | Canceled | — | يتم تجاهله في الاستخراج |
| مؤجل | Postpone | — | يتم تجاهله في الاستخراج |
| خارج الضمان | Out Warranty | `753240001` | No Info |

---

## الحادي عشر: قواعد iframes على PowerApps

```javascript
// البورتال يعمل على PowerApps — الجداول والعناصر دائماً داخل iframes
// ⚠️ عند البحث عن أي عنصر DOM (جدول، زر، رابط):
// يجب دائماً البحث في document + كل الـ iframes

// لا تكتفي بالبحث في document فقط — لن تجد شيء!

function findAllElements(selector, doc = document) {
  const results = [...doc.querySelectorAll(selector)];
  
  for (const iframe of doc.querySelectorAll('iframe')) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow.document;
      results.push(...findAllElements(selector, iDoc));
    } catch (e) { /* cross-origin */ }
  }
  
  return results;
}
```

---

## الثاني عشر: قواعد CSP على Facebook/Messenger

```javascript
// ⚠️ على مواقع CSP صارم (Messenger, Facebook):
// - يمنع <script> tags
// - يمنع eval()
// - يمنع new Function()

// ❌ غلط:
eval(code);
document.createElement('script').textContent = code;
new Function(code)();

// ✅ الحل: chrome.scripting.executeScript مع files parameter
// حقن Chrome Extension API بيتخطى CSP تلقائياً

// للسكريبتات المخصصة (المُرفوعة كملفات):
// لا يمكن حقنها عبر files على مواقع CSP
// الحل: المستخدم ينسخ الكود والصقه يدوياً في Console (F12)
```

---

## الثالث عشر: أنماط السجل (Smart Log)

> **بعد التوحيد (2026-08-03):** مكتبة `shared/smart-log.js` موحدة تعمل في كل البيئات (content scripts، popup، dashboard، background).
> المصدر: `master-portal\shared\smart-log.js` — ينسخ عبر `sync-shared.ps1`.

```javascript
// في الصفحات (content scripts / popup / dashboard):
await window.logEvent('search', { query: 'test', resultsCount: 5 });
const entries = await window.getLog({ filter: 'all', search: '' });
await window.clearLog();

// في background (وكل البيئات عبر globalThis):
await SmartLog.addEntry('inject', { count: 1 });
const entries = await SmartLog.getEntries(500);
await SmartLog.clearAll();

// التخزين تلقائي:
//   - يوجد storageGet/Set (content scripts): عبر رسائل STORAGE_GET/SET إلى background
//   - وإلا (SW / صفحات الإضافة): chrome.storage.local مباشرة
// المفتاح: 'smartLog' — أقصى 500 سجل (الأحدث أولاً)

// هيكل السجل:
{
  type: 'search' | 'import' | 'clear' | 'inject' | 'cart_add' | 'cart_remove' | 'scrape_inventory' | 'clear_db',
  action: 'search',   // نفس type (لتوافق dashboard القديم)
  details: { query, resultsCount, fileName, partCode, quantity },
  timestamp: '2026-07-11T10:30:00.000Z',
  url: 'https://...'
}
```

> **الخلفية:** في المساعد الذكي كان background يستورد smart-log عبر importScripts ويفشل (مرجع `window` في service worker) — المكتبة الموحدة تستخدم `globalThis`. معالجات الرسائل: `LOG_EVENT` / `GET_LOG` / `CLEAR_LOG` (ذكي) + `STORAGE_GET/SET/REMOVE` (تقفيلات وذكي).

---

## الرابع عشر: أنماط IndexedDB المشتركة

### المخازن

```javascript
// masterData — بيانات قطع الغيار
{
  id: auto-increment,
  modelCode: 'AC-001',
  modelDescription: 'تكييف هيونداي 1.5 حصان',
  sparePartCode: 'SP001',
  sparePartDescription: 'كمبروسور',
  defectCode: 'FW0200',
  defectDescription: 'عطل في الموتور',
  defectMajor: 'Electrical',
  productType: 'Air Conditioner',
  productGroup: 'HA',
  maxQuantity: 1,
  price: 1500,
  source: 'master_data'
}

// inventory — جرد العهدة
{
  id: auto-increment,
  sparePartCode: 'SP001',
  sparePartDescription: 'كمبروسور',
  quantity: 5,
  location: 'المخزن الرئيسي'
}
```

---

## السادس عشر: مكتبات إضافية مكتشفة

### Signature/Ink Control

مكتبة التوقيع الرقمي المستخدمة في صفحة `inspection-case-without-PhoneNumbers`:

```javascript
// تعمل كـ<input type="text"> عادي لكن تعرض توقيع رقمي
// التواقيع تُرسل كـ base64 encoded strings
// تُستخدم في فحص البلاغات (معاينة الحالة)
```

### Choices.js

مكتبة القوائم المتعددة المستخدمة في واجهات التقارير:

```html
<select class="form-control" multiple="multiple">
  <!-- Choices.js يحولها لقوائم متعددة الاختيار -->
</select>
```

```javascript
const choices = new Choices(element, {
  removeItemButton: true,
  searchEnabled: true,
  placeholder: true,
  noResultsText: 'لا توجد نتائج'
});
```

### daterangepicker

محدد النطاق الزمني المستخدم في صفحات `technicalreviewdetails`:

```javascript
$(element).daterangepicker({
  locale: { format: 'DD/MM/YYYY', direction: 'rtl' },
  autoUpdateInput: true
});
```

### Moment.js + Timezone

معالجة التاريخ والوقت في `order-extractor.js`:

```javascript
moment(scheduledDate).format('DD/MM/YYYY');
moment.tz(date, 'Africa/Cairo').format('YYYY-MM-DD');
```

---

## السابع عشر: أوامر مفيدة

```bash
# تشغيل خادم التطوير
npm run dev

# بناء للإنتاج
npm run build

# فحص الكود
npx tsc --noEmit

# تنظيف node_modules
rm -rf node_modules && npm install

# تشغيل أداة Python
pip install customtkinter openpyxl
python excel_app.py
```

---

## الثامن عشر: دورة عهدة قطع الغيار وسقوط البلاغات في المراجعة الفنية (Spare Parts Inventory & Technical Review Drop Cycle)

> **المصدر:** تحليل واقعي لمراكز خدمة مجموعة العربي (اكتُشفت 2026-10-11) — أزمة العهدة المعلقة والبلاغات الراجعة.

### 1. دورة العمل الواقعية والمشكلة (The Real-World Business Problem)
1. **صرف القطعة:** يستلم الفني قطع الغيار الجديدة من مخزن المركز وتُسجل في عهدة المركز/الفني.
2. **التركيب والإثبات:** يتوجه الفني للعميل ويقوم بتركيب القطع الجديدة ويسحب القطع التالفة، ويكتب في التعليق (مثل: `تم تغيير...`).
3. **الارتجاع للمراجعة الفنية (Technical Review Return):** عند وجود أي نقص إداري أو بياني في البلاغ (سيريال غير مطابق، صورة عطل غير واضحة، إلخ)، يرجع البلاغ في مسار "مراجعة فنية".
4. **أثر نظام الـ ERP / Dataverse على العهدة:**
   - بمجرد عودة البلاغ للمراجعة، يقوم النظام **دفترياً** بإلغاء خصم القطع من عهدة المركز وإرجاعها للرصيد الدفتري للمركز!
   - **الواقع الميداني:** القطعة رُكبت بالفعل لدى العميل وأصبحت تالفة مسترجعة وليست قطعة جديدة في الرف.
   - **الخلل:** إذا أهمل الفني/المركز إعادة إثبات القطع في جدول المراجعة الفنية (`TechnicalReviewDetails` / Subgrid) واكتفى بتصحيح السيريال فقط أو تُرِك البلاغ معلقاً، تظل القطع **مسجلة في عهدة المركز كقطع سليمة**، مما يسبب عجزاً وتضارباً في الجرد السنوي ومسؤولية مالية وقانونية على أمين المخزن ومدير المركز.

### 2. معايير الكشف الذكي عن البلاغات المسقطة (Detection Heuristics)
لاكتشاف هذه البلاغات واستخراجها لأغراض التسوية أو الالتماس (Petition)، يُعتمد على المنطق الثلاثي:
1. **مؤشر التعليق (Comment Keyword Match):**
   - التعليق يحتوي على كلمات دلالية: `تغيير`, `تغير`, `تم تغير`, `تم تغيير`, `تركيب`, `تم تركيب`, `قطع غيار`, `شحن`, `استبدال`.
2. **مؤشر التكلفة مقابل الجدول (Cost vs Grid Discrepancy):**
   - حقل `تكلفة قطع الغيار` في `ReportDetail` يحتوي على قيمة أكبر من الصفر (`Parts Cost > 0`).
   - بينما جدول قطع الغيار في شاشة المراجعة الفنية (`#InventoryAdjustmentProduct_Subgrid`) خالي من البنود (`0 Items`).
3. **مؤشر حالة القطع:**
   - الحقل `ats_sparepartsstatus = 963400000` (مستعمل) ولكن عدد السجلات في الـ Subgrid يساوي 0.

### 3. إجراءات المعالجة (Remediation Workflow)
- **إذا كان البلاغ لا يزال مفتوحاً / قيد المراجعة:** الدخول على شاشة المراجعة الفنية وإعادة إدراج بنود القطع وحفظ البلاغ لاعتماد الخصم النظامي من العهدة.
- **إذا كان البلاغ مغلقاً نهائياً:** تصدير كشف مفصل معتمد (رقم CAS، التاريخ، اسم الفني، العميل، التعليق، القطع المذكورة، التكلفة) وتقديمه في مذكرة التماس للشركة لإسقاطها من عهدة المركز دفترياً أو إثباتها كتوالف صيانة.

---

*هذا الملف يُحدّث عند اكتشاف أنماط جديدة مشتركة بين الأدوات.*

