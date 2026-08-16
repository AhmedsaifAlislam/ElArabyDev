# AGENTS.md — ElArabyDev (نسخة العمل) — El Araby System / Arabic System

> Arabic System — El Araby Portal Tools Suite
> المالك: Zain (Antigravity)

## 0. القاعدة الأساسية الإلزامية (تُقرأ كل جلسة)
- **`E:\My First Lap\MY WORKE\Apps\ElArabyDev` = نسخة العمل الوحيدة.** كل التطوير والتعديل هنا فقط.
- **`E:\My First Lap\MY WORKE\Apps\العربي سيستم` "E:\My First Lap\MY WORKE\Apps\مساعد التقفيلات"
"E:\My First Lap\MY WORKE\Apps\مساعد التقفيلات V2" = مراجع للقراءة فقط.** ممنوع نهائيًا التعديل/الحذف/إعادة التسمية فيه (مرتبط بالإضافات المثبتة).
- عند الحاجة لملف مرجعي: انسخ من الأصل إلى `ElArabyDev` ثم عدّل النسخة هنا.
- لا تلمس ملفات النسخ الاحتياطي: `backup-pre-unified-v4/`، `deploy_backup_*/`.
- **إضافة قسم "آخرى" المالية (extension):** مدمجة داخل الإضافة الموحدة كتبويب رئيسي "آخرى" (آخر تبويب):
  - واجهة التبويب: `src/unified-extension/financial-tab.js` + `src/unified-extension/popup.html` (main-panel-financial) + `styles/popup.css`.
  - محركات التحليل: `src/unified-extension/features/financial/` (page-registry.js, page-auto-filler.js, page-data-extractor.js, local-analyzer.js, ai-insights.js) — كلها محلية 100%.
  - المرجع الاسترشادي للقراءة فقط: `E:\My First Lap\MY WORKE\Apps\العربي سيستم\portal-other-section\elaraby-extension\`
  - أي تطوير يتم هنا فقط، ولا تُعدّل النسخة المرجعية في `العربي سيستم` مباشرة أبدًا.

## 1. المشروع
طقم أدوات شامل لخدمة مراكز مجموعة El Araby عبر أدوات إضافية Chrome (MV3)،
سكربتات Tampermonkey، وتطبيق Python. الأنظمة المستهدفة:
- `https://elarabyportalpfs.powerappsportals.com` — بوابة PowerApps (Dataverse)
- `https://elarabyiscrm2.azurewebsites.net` — بوابة CRM (ASP.NET Web Forms .NET 4.0)

## 2. بنية المجلدات
- `MASTER_README.md` — التوثيق الشامل لكل الأداة.
- `PORTAL_MAP.md` — مرجع الدومينات والشاشات والأقسام.
- `SHARED_KNOWLEDGE.md` — معرفة مشتركة عبر كل الأداة.
- `MASTER_ROADMAP.md` — خطة المهام الكبرى وتتبع التنفيذ (Agent Team).
- `PHASE3_UNIFIED_INTEGRATION_PLAN.md` — خطة الدمج الموحد (Unified Integration).
- `IDEAS_BACKLOG.md` — الأفكار غير المنفذة والأولويات.
- `E2E_CHECKLIST.md` — قائمة الاختبار اليدوي الشامل على البورتال الحي.
- `PROMPT_MASTER.md` — البروبت الكامل لمراحل التشغيل الموحدة.
- `KNOWN_ISSUES.md` — المشاكل المعروفة (أحدثها هنا).
- `CHANGELOG.md` — سجل التغييرات.
- `DEV_COPY.md` — دليل نسخة التطوير والبنية والنشر.
- `src/` — **المصدر الوحيد**: `src/unified-extension/` (الإضافة الموحدة MV3) + `dashboard/` + `design-system/` + `crm-content/` + `ui-components/`.
- `deploy/` — **مجلد النشر** (يُحمَّل في المتصفح) — يُبنى من المصدر عبر `tools/deploy.ps1` فقط.
- `tools/` — أدوات التشغيل: `deploy.ps1` (نشر)، `sync-shared.ps1`، `excel_autofix/` (Python).
- `legacy/` — النسخ المنفصلة القديمة (أرشيف/مرجع فقط — لا تطوير منها).
- `backups/` — كل النسخ الاحتياطية (لا تلمس).
- `docs/` — توثيق مرجعي فرعي.

> أقرأ دائمًا `AGENTS.md` داخل كل مجلد فرعي قبل التعديل عليه — لها قواعد خاصة محلية.

## 3. الوضع التلقائي الإلزامي
نفّذ هذه المراحل عند أي مهمة، ولا تتخطّها:

### المرحلة 1 — الهيكلة والهوية
فعّل مهارة `ui-ux-pro-max` لإرساء نظام تصميم موحد (ألوان، Typography،
Spacing، تراتبية). طبّق مهارة `brand` لضمان اتساق العلامة عبر كل الإضافات.
أنشئ إطارًا واحدًا مصادره في `master-portal/` وأجب عنه في كل واجهة جديدة.

### المرحلة 2 — تصميم الواجهات
عند تحسين أي شاشة (Chrome popup، صفحات مساعدة، واجهات سكربتات):
- `ui-ux-pro-max` / `design-system` → قرارات تصميمية (المسافات، الحالات، typing).
- `slides` → العرائض/الشرائح.
- `ui-styling` + `banner-design` → كل UI جديد.
حافظ على الهوية البصرية نفسها عبر كل الأدوات — ممنوع تصميم مبعثر لكل extension على حدة.

### المرحلة 3 — جودة البرمجة
طبّق `everything-claude-code-conventions` على كل كود تلقائيًا: معالجة أخطاء ثابتة،
اصطلاحات تسمية موحدة، تواقات واضحة. راجع الكود قبل تقديمه.
**السرية:** لا تضع قيود/أوصال دخول فعلية أو روابط بوابات حقيقية في الملفات
الملتزمة — اشير إليها عبر `PORTAL_MAP.md` فقط.

### المرحلة 4 — التوثيق
أي صفحة/توثيق جديد يطابق رأس "الملف" الحالي في `MASTER_README.md` و `PORTAL_MAP.md`.
لا تكرر الكلام العام؛ اشير إلى المجلدات المختصة.

### أدوات الذاكرة والتخطيط (مثبتة Global)
- **Graphify** (`/graphify .`) — يبني Knowledge Graph لكل مجلد مشروع؛ استخدمه قبل
  أي تحليل عميق أو فهم كود كبير، ثم أجب من الـ graph بدل إعادة القراءة.
- **GSD Core** (`/gsd-new-project` ثم `/gsd-*`) — نظام تخطيط وتنفيذ مراحل
  لمشاريع متعددة الخطوات؛ استخدمه للمهام الطويلة لتجنب "تآكل السياق".

## 4. قواعد أساسية (يُفضّل أن تقرأ بها قبل أي كتابة)
- لا تخمن — اقرأ الملفات الموجودة وفهم السياق أولًا.
- لا تنشئ ملفات/توثيقًا منفصلًا غير مطلوب. عدّل ما هو موجود كلما أمكن.
- لاتعيد الكتابة قم بتعديل الجزء المراد تعديلة فقط.
- الأمور التي تلمس بوابات إنتاجية حقيقية: افصلها، افحص تأثيرها، واسأل قبل التطبيق.