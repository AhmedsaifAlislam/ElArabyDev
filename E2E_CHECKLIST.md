# E2E_CHECKLIST.md — قائمة التحقق الشامل (Phase 4.5 — Integration & Hardening)

> **الإصدار:** 2.0 — 2026-08-14
> **الغرض:** فحص يدوي E2E على البورتال الحي لميزات Phase 4 (حقن defect chain، سلة متعددة، سلوك الحفظ، الحماية، التكامل) — استبدال كامل لإصدار Phase 3.8.
> **المراجع:** روابط الدخول والشاشات عبر `PORTAL_MAP.md` فقط (لا تُكتب بوابات حقيقية في هذا الملف).
> **الأدوات:** سجلات التشغيل بادئة `[Booking AutoFiller]` — Console + Network مفتوحان طوال الفحص.

## 0. التحضير (مرة واحدة)
- [ ] تحميل نظيف للإضافة: `chrome://extensions` ← Developer mode ← Load unpacked ← `deploy/` (يُبنى من `src/unified-extension` عبر `tools/deploy.ps1`)
- [ ] `Errors = 0` في صفحة الإضافات، الأيقونة تظهر، الـ popup يفتح بتبويباته
- [ ] تأكيد أن `selectors.json` المدمج (Phase 4.4) موجود في مجلد الإضافة: مفاتيح `lookupClearBtn`, `technicianSelect`, `sparePartsStatus`, `subgridRow`, `deviceType`, `phone`, `address` ظاهرة
- [ ] تجهيز بيانات تجريبية:
  - سطر CSV كامل: سيريال، براند، موديل، نوع منتج (جهاز)، كود شكوى، هاتف، عنوان
  - أمر شغل **غير معالج** للاختبار (Page 1 خالية)
  - أمر شغل **معالج مسبقًا** لاختبار الحماية
  - أمر شغل نوعه **تركيب** لاختبار Installation
- [ ] تسجيل الدخول على البورتال والوصول لصفحة /Orders (عبر PORTAL_MAP.md)

## 1. بلاغ تركيب (Installation Report)
- [ ] فتح أمر شغل نوعه "تركيب / تركيب وتشغيل" — يُكتشف تلقائيًا (`isInstallationReport`) عبر: `#ats_workordertype_name` / `#ats_servicetype_name` / `#ldv_workordertype` (قيمة 0) / نص الشكوى
- [ ] تشغيل التعبئة → يبدأ مسار `performInstallationAndCommissioning` (log `【 INSTALLATION 】`)
- [ ] تعبئة **نوع الخدمة/نوع البلاغ** = "تركيب وتشغيل" (من `serviceLabels`) ✅
- [ ] تعبئة **الملاحظات** (من `notes` / `notesLabels`) ✅
- [ ] تعيين **فني** (select `#ats_technician_name` أو lookup فني أو subgrid إضافة فني) ✅
- [ ] **لا يُلمس حقل الموديل** — `modelInput` / `modelInput2` تبقى فارغة أو بدون تغيير ✅
- [ ] **لا تُفتح lookup modals** لحقول العطل/قطع الغيار (defectMajor / defectCode / sparePart) ✅
- [ ] الحفظ: ضغط Next/Save ثم `waitForSaveComplete` يعود بنجاح خلال 15 ثانية ✅
- [ ] إعادة فتح البلاغ: القيم المحفوظة ظاهرة (سيريال/براند/فني) ✅

## 2. صفحة Work Order Review (Page 1) — سلسلة defectMajor → defectCode → sparePart
- [ ] فتح أمر غير معالج → كشف `WORK_ORDER_REVIEW` (URL أو نص "مراجعة أمر الشغل") ✅
- [ ] تعبئة السيريال/البراند/الموديل — كل lookup يفتح modal ويختار الكود الصحيح (أولوية مطابقة الكود ثم starts-with ثم includes) ✅
- [ ] حقن **defectMajor** عبر lookup modal (زر `button.launchentitylookup` / `lookupBtn`) ✅
- [ ] بعد الاختيار: **Clear Button** يظهر (`lookupClearBtn`: `button[aria-label*='Clear']`, `[data-action='clear']`...) — دليل اعتماد القيمة ✅
- [ ] حقن **defectCode** (تابع لـ defectMajor عبر `#ats_defectcodedefectmajor_name`) — نفس آلية lookup ✅
- [ ] حقن **sparePart** (عبر `#ats_modeldefectspid_name`) — نفس آلية lookup ✅
- [ ] التحقق بالـ Clear Button بعد **كل** حقن (`verifyLookupWithClearButton` / `createLookupVerifier`) ✅
- [ ] زر lookup الآمن (`findSafeLookupButton`) يتجاهل أزرار المسح/الحذف (`_lookupBtnExcludePattern`) — لا نقر خاطئ ✅
- [ ] البحث داخل المودال عند عدم ظهور النتائج: كتابة الكود + Enter + زر بحث المودال (`lookupModalSearchBtn`) ✅
- [ ] حالة الضمان والتاريخ يُملآن (select/date) بدون أخطاء ✅
- [ ] أزرار إغلاق المودال عند عدم وجود نتائج تعمل (`lookupModalCloseBtn`) ✅

## 3. صفحة FollowUp (Page 2)
- [ ] الضغط Next من Page 1 → الانتقال لـ Page 2 ✅
- [ ] تعيين **حالة قطع الغيار = "بدون قطع غيار"** — من select `#ats_sparepartsstatus` أو `findFieldByLabel(['حالة قطع الغيار','Spare Parts'])` ✅
- [ ] إن لم يوجد الخيار: تحذير `⚠️ "بدون قطع غيار" option not found` (لا انهيار) ✅
- [ ] subgrid **المشاكل الفعلية**: زر "إضافة مشاكل فعلية" يفتح modal (`_subgridAddPatterns.problems`) ✅
- [ ] اختيار كود المشكلة الصحيح من النتائج (من `getProblemCode` / خريطة `problemCodes`) ✅
- [ ] استبعاد القيم الخاطئة من النتائج (`_excludeProblemPatterns`: ترصيد/أرضي/بلاغ) ✅
- [ ] أولوية Premium Care / تركيب وتشغيل عند وجودها (`_priorityProblemPatterns`) ✅
- [ ] إضافة **فني** (subgrid "إضافة فني" أو inline `#ats_technician_name`) + إعادة محاولة واحدة عند الفشل ✅
- [ ] لو subgrid الفنيين فيه صفوف مسبقًا → تخطي إضافة الفني (`hasExistingSubgridRow`) ✅
- [ ] حفظ Page 2 → `waitForSaveComplete` ينجح، أو التنقل لـ Page 3 ✅

## 4. حقن سلة (injectCart) متعددة العناصر
- [ ] بيانات أمر فيها عطل + **قطعتا غيار على الأقل** ✅
- [ ] الحقن بالترتيب: defectMajor → defectCode → sparePart #1 → الكمية #1 → sparePart #2 → الكمية #2 ✅
- [ ] كل قطعة تُحقن عبر lookup modal مع ظهور Clear Button بعدها ✅
- [ ] السلة (cart) تجمع العناصر بالترتيب الصحيح دون تداخل ✅
- [ ] عند حقن عنصر جديد لا يُفقد عنصر سابق (لا إعادة فتح/إفراغ للسلة) ✅
- [ ] الكميات (quantity) تُكتب بعد كل قطعة في الحقل الصحيح (label `fieldDefinitions.quantity`) ✅
- [ ] لا تكرار لأي عنصر في السلة (كل حقنة مرة واحدة فقط) ✅
- [ ] مراجعة السلة قبل الحفظ: عدد العناصر = المتوقع (1 عطل + N قطع) ✅
- [ ] الحفظ النهائي ينجح وتُحفظ كل السلة ✅

## 5. سلوك الحفظ (waitForSaveComplete)
### نجاح
- [ ] بعد Save يظهر توست نجاح (`.notification.toast-success` / `.ms-MessageBar--success` / `.alert-success`) → `waitForSaveComplete` يرجع `true` خلال `saveTimeoutMs` (15 ثانية) ✅
- [ ] تغيّر URL لصفحة تالية (غير `stepid=`) يُعتبر نجاحًا (حفظ ضمني) ✅
- [ ] الـ MutationObserver يرصد مؤشرات النجاح أثناء الانتظار (لا انتظار أعمى) ✅
### فشل
- [ ] ظهور `.alert-danger` / `.validation-summary-errors` → لا يُحسب نجاحًا، وتُسجَّل رسالة فشل وتظهر حالة `save-failed` في الواجهة ✅
- [ ] لا إعادة محاولة تلقائية على فشل التحقق من الحفظ (المهمة تنتهي بحالة واضحة) ✅
### مهلة
- [ ] عند غياب أي مؤشر 15 ثانية → `⚠️ Save wait timeout` في السجل والمهمة تُعلَّم `save-failed` (لا تعليق للأبد) ✅
- [ ] عند مهلة على Page 1 → لا استمرار لحقن Page 2 (وقف آمن) ✅

## 6. الحماية (عدم مسح قيم حقيقية)
- [ ] أمر معالج مسبقًا: `isPage1AlreadyFilled` يكتشف السيريال/البراند المملوء → تخطي كامل بدون لمس (log `🔁 Page 1 already has Serial filled`) ✅
- [ ] حقن lookup لا يكتب فوق قيمة موجودة حقيقية (قراءة `readFieldValue` + `isRealValue` أولًا) ✅
- [ ] قيم مثل "لا يوجد" / "n/a" / "0" / "undefined" لا تُعتبر حقيقية ولا تمنع التعبئة ✅
- [ ] **Clear Button لا يُضغط أبدًا لمسح قيمة** — يُستخدم للتحقق فقط ✅
- [ ] التعديلات اليدوية تُكتشف وتُسجَّل: `detectManualAdditions` يضيف `manuallyModified` للتقرير (خريطة `fieldLabels`) ✅
- [ ] تشغيل الإضافة مرتين على نفس الأمر → لا ازدواج حقن (لا قيم مكررة ولا lookup مكرر) ✅
- [ ] بعد أي فشل/إلغاء: القيم الأصلية للمستخدم كما هي (لا مسح جزئي) ✅

## 7. الجودة العامة (Console / Toast / MV3)
- [ ] Console نظيفة: صفر `errors` و صفر `uncaught exceptions` أثناء كامل السيناريوهات ✅
- [ ] لا `warnings` إلا المخطط لها (timeout / no-match / option not found) ✅
- [ ] التوست (Toast) يظهر بصيغة **RTL** صحيحة (اتجاه النص، ألوان النجاح أخضر/الخطأ أحمر، اختفاء تلقائي) ✅
- [ ] `chrome://extensions` ← Errors = 0 طوال الفحص، لا أخطاء MV3 (لا استخدام واجهات محظورة، service worker مستقر) ✅
- [ ] لا تكرار حقن من manifest content script: سكربتات `manifestInjected` لا تُشغَّل يدويًا مرة ثانية ✅
- [ ] لا حلقات لا نهائية: كل الانتظارات بمهلات محددة (`saveTimeoutMs` / `_lookupTimeout` / `_nextWaitTimeout`) ✅
- [ ] الأداء: تعبئة أمر واحد لا يتجاوز ~60 ثانية إجمالًا (مع فترات الانتظار المخطط لها) ✅

## معايير إغلاق Phase 4.5
- [ ] اجتياز **100%** من البنود الحرجة (1–6) بدون أي فشل
- [ ] القسم 7 (الجودة) نظيف: لا أخطاء console ولا MV3
- [ ] `selectors.json` المدمج مثبت ولا يحتاج تعديلات أثناء الفحص
- [ ] كتابة تقرير النتائج النهائي في `MASTER_README.md` (قسم Phase 4) مع أي ملاحظات
- [ ] إغلاق Phase 4.5 بعد اعتماد التقرير