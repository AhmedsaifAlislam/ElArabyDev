# El Araby Design System — نظام تصميم العربي الموحد
# Arabic System — Unified Design System v1.0

> **تاريخ الإنشاء:** 2026-08-08
> **آخر تحديث:** 2026-08-08
> **مصدر الحقيقة:** `master-portal/design-system/tokens.css`
> **المتطلب:** أي واجهة أو شاشة جديدة في أي أداة تستخدم هذه التوكنز فقط — ممنوع الألوان المباشرة.

---

## المبادئ / Principles

1. **مصدر واحد:** ألوان و Typography و Spacing و Radius تأتي حصراً من `tokens.css` (متـvns profile لتوكل أداة).
2. **Dark mode افتراضي** مع `[data-theme="light"]` جاهز.
3. **RTL عربي** بأساس سريع، خط Cairo.
4. **حالة صريحة:** كل تفاعل له حالة (normal / hover / active / disabled / loading / error).
5. **ايدنتية موحدة:** كل الإضافات السبعة تشترك بنفس هوية El Araby.

---

## التوكنز / Tokens

| المجموعة | التوكن | القيمة الافتراضية | الاستخدام |
|---------|--------|------------------|-----------|
| Brand | `--ea-brand` | `#1f8feb` | العناصر الأساسية، النشطة، الروابط |
| Brand | `--ea-brand-dark` | `#1472cc` | Hover للعناصر الأساسية |
| Brand | `--ea-indigo` | `#7c3aed` | Gradients / مزيج مع azure |
| Surface | `--ea-bg` | `#0b1220` | خلفية الصفحة |
| Surface | `--ea-surface` | `#101c2e` | ألواح ثابتة |
| Surface | `--ea-surface-2` | `#152236` | عناصر ثانوية |
| Border | `--ea-border` | `#1e3450` | حدود عامة |
| Status | `--ea-success` / `--ea-error` / `--ea-warn` | `#22c55e` / `#ef4444` / `#f59e0b` | الحالات |
| Text | `--ea-text` / `--ea-muted` | `#e2eaf5` / `#6b84a3` | نصوص / نصوص ثانوية |
| Typography | `--ea-fs-xs..xl` | `10.5..16px` | مقياس خط |
| Spacing | `--ea-space-1..6` | `4..24px` (شبكة 4px) | تباعد موحد |
| Radius | `--ea-radius-sm/md/full` | `6/8/20px` | زوايا |
| Focus | `--ea-focus-ring` | glow 3px | حالة تركيز الألواح |

---

## التثبيت / Usage

### في إضافة Chrome (CSS مباشر):
```css
@import url('tokens.css');
```
(`tokens.css` يُنسخ ضمن `styles/tokens.css` في مجلد التوزيع.)

### في مكوّنات UI (Shadow DOM):
```css
@import url('../../../design-system/tokens.css');
```
ثم قراءة المتغيرات عبر `var(--ea-brand)`.

### التوافق مع الأسماء القديمة:
التوكنز القديمة (`--bg`, `--surface`, `--accent`, `--text`, `--radius`...) بقيت كواسمات في `tokens.css` لضمان عدم كسر الشاشات الحالية حتى اكتمال الهجرة.

---

## التكوين / Configuration
- **Theme:** أضف `data-theme="light"` على `<html>` أو `<body>` لتفعيل الوضع الفاتح (اختياري لكل أداة).
- **Line-height/font-family:** لا داعي لإضافة خط غير Cairo إلا عند الحاجة (ثم اضبطه في التوكنز، لا في CSS مبعثر).

---

## المراجع / Reference Files
- `master-portal/design-system/tokens.css` — القيم الفعلية (Single Source of Truth).
- `master-portal/ui-components/` — مكوّنات متوافقة (Custom Elements + Shadow DOM).
- `master-portal/unified-extension/styles/tokens.css` — النسخة المنسوخة داخل الإضافة.

---

## لاحقاً / Roadmap
- **Phase 2 (اكتمل):** تطبيق التوكنز على الشاشات — popup (0 ألوان مباشرة) + control-panel (CP_THEME) + CRM extractor (src + ui-components صفر ألوان خام). التالي: أي شاشة جديدة.
- **Phase 3:** اصطلاحات الكود (خطأ موحد، naming، تواقيع) تُطبق على كل كود جديد.

### نطاق التوكنز لمناطق الشادو (Shadow DOM):
- التوكنز تُقرأ من `tokens.css` المحقون على الصفحة (manifest css) أو من قيم
  `:host` المحلية — لا تعتمد على `@import` داخل مكوّنات الإضافة (manifest
  يتضمّن `styles/tokens.css` لإدخال CRM).