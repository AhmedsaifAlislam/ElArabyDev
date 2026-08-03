# PROJECT STATUS — المساعد الذكي لقطع غيار العربي

> آخر تحديث: 2026-08-03  
> الإصدار: v2.2 (توحيد المكتبات في ElArabyDev)

---

## 1. ✅ المنجز

### البنية التحتية
- [x] هيكل المجلدات مرتب (content/, dashboard/, shared/, scripts/)
- [x] Manifest V3 جاهز
- [x] قاعدة بيانات IndexedDB (`ElArabyPartsDB` v2) بمخزني `masterData` و `inventory`
- [x] آلية اتصال بين content script و background.js عبر `chrome.runtime.sendMessage`
- [x] 4 تبويبات في لوحة التحكم: الرئيسية، جرد العهدة، إدارة البيانات، سجل

### المزامنة والبيانات
- [x] مزامنة من Google Drive (تحميل CSV/XLSX عبر URL)
- [x] رفع ملف محلي (CSV/XLSX)
- [x] دمج 4 ملفات Excel في `master_data_merged.csv` (416,815 صف)
- [x] معالجة الترميز (UTF-8, Win-1256, ISO-8859-6) وتصحيح النصوص المشوّهة
- [x] تعيين الأعمدة تلقائياً (PK column auto-detection)

### البحث
- [x] بحث موحد بنمط `*text` (contains) و `text` (startsWith)
- [x] فلترة متتالية (Cascading): ProductType → Model → DefectMajor → DefectDescription
- [x] قوائم منسدلة مع بحث (Searchable Dropdowns) مثل Excel
- [x] زر بحث يدوي + مؤشر تحميل "جاري البحث..."
- [x] تصدير نتائج البحث إلى Excel (6 أعمدة)

### حقن البيانات في البورتال
- [x] حقن قطعة واحدة في نموذج البورتال
- [x] حقن متعدد (Multi-Inject) — حقن قطع متتالية بفاصل 1.5 ثانية
- [x] عربة التسوق (Cart) — إضافة/إزالة/مسح/حقن من اللوحة المنبثقة

### السجل (Smart Log)
- [x] تسجيل العمليات (بحث، استيراد، مسح، إضافة/إزالة من السلة، حقن)
- [x] عرض/تصفية/بحث/مسح السجل من لوحة التحكم
- [x] تخزين عبر `chrome.storage.local` (وساطة background.js)

### لوحة التحكم (Dashboard)
- [x] عرض حالة قاعدة البيانات (عدد السجلات، آخر مزامنة)
- [x] معاينة أول 50 سجل
- [x] تبويب جرد العهدة مع فلترة
- [x] تبويب إدارة البيانات (إضافة يدوية)
- [x] علامة تبويب سجل العمليات

### اللوحة المنبثقة في البورتال (Shadow Panel)
- [x] دائرة عائمة قابلة للسحب (موضعها محفوظ في localStorage)
- [x] علامة تبويب بحث
- [x] علامة تبويب كشف الأسعار
- [x] علامة تبويب السلة
- [x] علامة تبويب الجرد
- [x] بحث في Shadow DOM مع فلترة
- [x] زر حقن + إضافة إلى السلة لكل نتيجة

### معالجة البيانات
- [x] DataMapper لتعيين الأعمدة عرب-إنجليزي (مرن: يدعم أسماء متعددة للعامود)
- [x] `parseRowsToMasterData()` مع دمج DataMapper و `extractFromFormat()` لتحليل `KODE - (وصف)`
- [x] `parseFileContent()` — محلل مشترك للـ CSV/XLSX (كشف الترميز، إزالة BOM، Papa.parse)
- [x] الاحتفاظ بأعلى سعر عند تكرار كود القطعة
- [x] `decodeBytes()` + `countArabic()` — معرفين مرة وحدة فقط

---

## 2. 🔄 قيد التطوير

- [ ] لا شيء حالياً

---

## 3. 🐛 المشاكل المعروفة

### محلولة
- ~~**نتائج البحث لا تظهر** — `populateSelect` كان يطلق `change` events أثناء `loadFilters()` مما يسبب سباقاً مع `loadPreview()`. ~~ **الحل**: `loadFilters()` الآن تملأ القوائم بصمت (`silent=true`) بدون إطلاق أحداث. ✅
- ~~**Infinite recursion في `enhanceSelect`** — `Object.defineProperty` على `HTMLSelectElement.prototype.value` كان يسبب recursion لا نهائي. ~~ **الحل**: أزيل `Object.defineProperty` بالكامل، والآن التزامن يتم عبر `change` event listener. ✅
- ~~**64MiB quota error في IndexedDB** — بسبب حجم البيانات الكبير (416K سجل). ~~ **الحل**: تقطيع `sparePartDescription` إلى 200 حرف. ✅
- ~~**Edge Tracking Prevention** — `chrome.storage.local` لا يعمل في content scripts على Edge. ~~ **الحل**: كل التخزين يمر عبر background.js. ✅

### مفتوحة
- لا توجد مشاكل معروفة حالياً

---

## 4. 📋 المعمارية

### تدفق البيانات
```
Excel/CSV → parseFileContent() → parseRowsToMasterData() → addBatch() → IndexedDB (masterData)
Dashboard → searchDB() → IndexedDB → showSearchResults()
Shadow Panel → bg('searchDB') → background.js → searchDB() → render
حقن → bg('injectData') → background.js → content.js → auto-filler.js → portal form
```

### الفلاتر المتتالية
```
getMasterDataFilters() → {
  productTypes: ['Air Conditioner', 'Washing Machine', ...],
  modelsByType: { 'Air Conditioner': ['AC-001', 'AC-002', ...] },
  defectMajorsByModel: { 'AC-001': ['Electrical', 'Mechanical', ...] },
  defectDescsByMajor: { 'Electrical': ['E1 - (وصف)', 'E2 - (وصف)', ...] }
}
```

### قاعدة بيانات IndexedDB
- **الاسم**: `ElArabyPartsDB`
- **الإصدار**: 2
- **masterData**: `{ ++id, modelCode, modelDescription, sparePartCode, sparePartDescription, defectCode, defectDescription, defectMajor, productType, productGroup, maxQuantity, price, source }`
- **inventory**: `{ ++id, sparePartCode, sparePartDescription, quantity, location }`

### قواعد البحث
- البحث غير حساس لحالة الأحرف (case-insensitive)
- `*text` → يحتوي على (includes)
- `text` → يبدأ بـ (startsWith)
- عند استخدام البحث من Dashboard: يتم تطبيق فلتر `part` (على sparePartCode) + فلتر `keyword` (على كل الحقول) — كلاهما بنفس القيمة

---

## 5. 🔮 الخطوات القادمة المقترحة

- [ ] إضافة تحميل متعدد للملفات المحلية
- [ ] دعم XML من البورتال
- [ ] إحصائيات متقدمة (أكثر القطع بحثاً، أكثر الماركات طلباً...)
- [ ] تقارير PDF للجرد
- [ ] مزامنة تلقائية مع Google Drive (polling)
- [ ] وضع أوفلاین (offline mode) كامل
- [ ] ترجمة إنجليزية للواجهة مع تبديل لغة
- [ ] نسخ احتياطي لقاعدة البيانات (export IndexedDB)

---

## 6. ⚙️ أوامر مفيدة

```bash
# تشغيل خادم التطوير (للمساعد الذكي)
npm run dev

# بناء للإنتاج
npm run build

# فحص الكود
npx tsc --noEmit
```

### ملفات CSV
`master_data_merged.csv` — 416,841 صف، 416,816 فريد (Model+SparePart+Defect)، 12,103 كود قطعة فريد

---

*هذا الملف يُحدّث يدوياً بعد كل جلسة عمل.*
