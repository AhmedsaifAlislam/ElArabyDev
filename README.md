# ElArabyDev — El Araby Portal Tools Suite

طقم أدوات لخدمة مراكز **مجموعة El Araby** عبر إضافة Chrome (Manifest V3) موحّدة،
بالإضافة إلى أدوات مساندة (سكربتات Tampermonkey، أدوات Excel، اختبارات).

> **نسخة عرض (Share Copy):** البيانات الشخصية مموّهة — أسماء العملاء استُبدلت بـ `عميل NN`
> وأرقام التليفونات بـ `01000000000`. الصور/الفيديوهات الملتقطة من البوابة قد تعرض بيانات
> مرئية — راجعها قبل أي نشر عام.

---

## البنية

| المسار | الوصف |
|---|---|
| `src/unified-extension/` | **المصدر الوحيد** للإضافة الموحّدة (MV3) |
| `deploy/` | **مجلد النشر** — هذا هو المجلد الذي يُحمَّل في المتصفح (يُبنى من `src/` فقط) |
| `tools/` | `deploy.ps1` (نشر) · `verify.ps1` (بوابة التحقق) · `tests/` (اختبارات) · `excel_autofix/` |
| `docs/` · `analysis/` | توثيق مرجعي وتحليل بنية البوابة |
| `_archives/` | نسخ قديمة (مرجع فقط) |

## التشغيل

```powershell
# 1) تحميل الإضافة
#    edge://extensions  →  Developer mode  →  Load unpacked  →  اختر مجلد deploy

# 2) بعد أي تعديل في src/ — انشر ثم تحقّق
powershell -ExecutionPolicy Bypass -File tools\deploy.ps1
powershell -ExecutionPolicy Bypass -File tools\verify.ps1 -CheckDeploy

# 3) اختبارات سريعة
node tools/tests/unification-smoke.js
node tools/tests/run-tests.js
```

> `verify.ps1` يفحص: صحة JS/JSON · وجود كل ملفات `manifest.json` · الاختبارات الثلاثة ·
> تطابق `src` مع `deploy` بالـ SHA256. لا ترفع نسخة غير خضراء (ALL GREEN).

## من أين تبدأ القراءة

| الملف | المحتوى |
|---|---|
| `MASTER_README.md` | التوثيق الشامل لكل الأدوات |
| `PORTAL_MAP.md` | خريطة الدومينات والشاشات والأقسام |
| `DEV_COPY.md` | دليل نسخة التطوير والبنية والنشر |
| `SHARED_KNOWLEDGE.md` | معرفة مشتركة عبر كل الأدوات |
| `CHANGELOG.md` | سجل التغييرات |
| `KNOWN_ISSUES.md` | المشاكل المعروفة وحلولها |
| `combined_docs.md` | خريطة المهام والقرارات |

## قواعد أساسية

1. **`src/` هو المصدر** — لا تُعدّل `deploy/` يدويًا؛ يُبنى عبر `tools/deploy.ps1`.
2. **لا أسرار في الريبو** — لا كلمات مرور ولا مفاتيح API ولا توكنات. الإعدادات الحساسة
   تُحفظ وقت التشغيل (localStorage/خارج الريبو) فقط.
3. **الوصول للبوابة** يتطلب حساب الشركة؛ الكود يحتوي محدّدات الحقول فقط، لا بيانات دخول.
4. **لا تُشغّل عمليات كتابة على بيانات إنتاجية** أثناء التطوير — استخدم بيئة اختبار أو
   بلاغًا تجريبيًا.
