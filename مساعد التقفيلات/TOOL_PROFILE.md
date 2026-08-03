# بطاقة تعريف الأداة — مساعد التقفيلات
# Tool Profile — Portal AutoFiller

> **آخر تحديث:** 2026-08-03

---

## معلومات أساسية / Basic Info

| البند | القيمة |
|-------|--------|
| **الاسم بالعربي** | مساعد التقفيلات — تعبئة أوامر العمل |
| **الاسم بالإنجليزي** | Portal AutoFiller |
| **الإصدار** | v1.1.0 |
| **النوع** | Chrome Extension (Manifest V3) |
| **البورتال المستهدف** | PowerApps Portal (`elarabyportalpfs.powerappsportals.com`) |
| **اللغة** | JavaScript (ES2022) |
| **تاريخ الإنشاء** | 2026-07 |
| **آخر تحديث** | 2026-07-14 |
| **المطور** | Zain (Antigravity) |

---

## الغرض الرئيسي / Purpose

> إضافة متصفح شاملة (MV3) لملء تلقائي لحقول صفحة Work Order Review في بوابة العربي. تحتوي على 6 تبويبات, دعم Batch, تقارير محفوظة, مساعد AI (Ollama), وكشف أرقام الهواتف.

---

## الهيكل / Directory Structure

```
مساعد التقفيلات/
├── manifest.json              ← Manifest V3 — إعدادات الإضافة
├── popup.html                 ← واجهة البوبداب (6 تبويبات)
├── popup.js                   ← منطق البوبداب بالكامل
├── content-script.js          ← منطق تعبئة الحقول على البورتال
├── background.js              ← Service Worker — تخزين, Ollama proxy, إشعارات
├── order-extractor.js         ← استخراج البلاغات (مستقل)
├── control-panel.js           ← لوحة التحكم
├── smart-log.js               ← سجل حركات المستخدم
├── elaraby-phone-reveal-layer0.js ← كشف أرقام الهواتف
├── tampermonkey-runner.js     ← محقن سكريبتات Tampermonkey
├── selectors.json             ← محددات DOM للبورتال
├── secondVisitProfiles.json   ← ملفات تعريف الزيارة الثانية
├── travel-costs.json          ← بدلات الانتقال حسب المناطق
├── products-db.json           ← قاعدة بيانات المنتجات
├── products.ts                ← ملف المنتجات (الأصل)
├── AGENTS.md                  ← تعليمات للذكاء الاصطناعي
├── README.md                  ← دليل الاستخدام
├── README_Dev.md              ← دليل المطور
│
├── shared/                    ← مكتبات مشتركة (مزامنة من master-portal — لا تعدل هنا مباشرة)
│   ├── storage-proxy.js       ← وسيط التخزين (storageGet/Set/Remove/bg)
│   ├── smart-log.js           ← سجل العمليات الموحد (logEvent/getLog/SmartLog)
│   ├── arabic-utils.js        ← أدوات النص العربي (+ ArabicUtils)
│   ├── data-mapper.js         ← تعيين الأعمدة (+ DataMapper)
│   └── portal-selectors.js    ← محددات DOM (POWERAPPS.fields — 20 حقلاً)
│
├── lib/                       ← مكتبات
│   ├── xlsx.full.min.js       ← SheetJS
│   └── exceljs.min.js         ← ExcelJS
│
├── icons/                     ← أيقونات الإضافة
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── styles/                    ← أنماط
│   └── popup.css              ← أنماط البوبداب
│
└── Tempermonky/               ← سكريبتات Tampermonkey المدمجة
    ├── elaraby-phone-reveal.js
    ├── messenger-sender.js
    ├── report-processor.js
    ├── services.json
    └── tips.json
```

---

## البنية التقنية / Architecture

### Manifest V3
```json
{
  "manifest_version": 3,
  "name": "Portal AutoFiller — مساعد التقفيلات",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab", "scripting", "tabs", "clipboardWrite"],
  "host_permissions": [
    "https://elarabyportalpfs.powerappsportals.com/*",
    "https://elarabyiscrm2.azurewebsites.net/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["https://elarabyportalpfs.powerappsportals.com/*"],
      "js": ["content-script.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### بنية التبويبات (6 تبويبات)
1. `🔍 بحث وتعبئة` — لا تلمسه (الأساسي)
2. `⚡ زيارة تانية` — إغلاق سريع
3. `📥 الاستخراج` — `order-extractor.js` مستقل
4. `📋 التقارير` — جلسات محفوظة
5. `🤖 مساعد AI` — مدمج مع اللوج الذكي
6. `🐵 سكريبتات` — طريقتين للحقن

---

## التبعيات / Dependencies

### مكتبات خارجية
| المكتبة | الغرض |
|---------|-------|
| SheetJS (xlsx) | قراءة/كتابة Excel |
| ExcelJS | إنشاء Excel غني (تلوين، حدود، RTL) |
| Ollama (localhost:11434) | مساعد AI محلي |
| Moment.js + Timezone | معالجة التاريخ والوقت |
| daterangepicker | محدد التاريخ في واجهات المستخدم |
| Choices.js | قوائم متعددة الاختيار |
| Signature/Ink Control | التوقيع الرقمي في صفحات المعاينة |

### الذكاء الاصطناعي
- **Ollama** مع نموذج `qwen2.2-coder:14b`
- يعمل على `localhost:11434`
- مجاني تماماً

---

## الميزات / Features

### التبويبات
- [x] بحث وتعبئة — ملء تلقائي للحقول
- [x] زيارة تانية — إغلاق سريع
- [x] الاستخراج — استخراج البلاغات
- [x] التقارير — جلسات محفوظة
- [x] مساعد AI — مساعد ذكي
- [x] سكريبتات — حقن سكريبتات Tampermonkey

### استخراج البلاغات (order-extractor.js)
- [x] استخراج 15 حقل: رقم الطلب، العميل، المنطقة، العنوان، المنتج، الهاتف، الشكوى، تاريخ الحجز...
- [x] جلب المناطق من API (`/incidents(id)` → `/accounts(id)` → `_ldv_area_value`)
- [x] تصدير Excel غني بـ ExcelJS (تلوين، حدود، RTL، إحصائيات، فصل اليوم عن الأيام السابقة)
- [x] سحب التقارير لكل بلاغ على حدة (`/Reportdetail/?id=`)
- [x] حفظ التقدم عبر `background.js` (لتجاوز Edge Tracking Prevention)
- [x] دعم 50 صفحة كحد أقصى للتنقل
- [x] 3 مستويات مطابقة للأعمدة (حرفية، starts-with، includes) + أسماء عربية وإنجليزية

### كشف أرقام الهواتف
- [x] اعتراض `window.crmAccount` في MAIN world
- [x] التحكم عبر `localStorage` toggle
- [x] كشف الأرقام تلقائياً

### دعم Batch
- [x] معالجة متعددة للبلاغات
- [x] تأخير قابل للتعديل بين المعالجات
- [x] إيقاف في أي وقت

---

## نقاط القوة / Strengths

1. **6 تبويبات** — تغطي كل الاحتياجات
2. **مساعد AI مجاني** — Ollama محلي
3. **كشف أرقام الهواتف** — عبر `crmAccount`
4. **دعم Batch** — معالجة متعددة
5. **تقارير محفوظة** — تاريخ المعالجات
6. **سكريبتات مدمجة** — Tampermonkey جاهز
7. **استخراج متقدم** — 15 حقل، 9 محددات جداول، تصدير Excel غني
8. **سحب التقارير** — تنقل لكل بلاغ على حدة لسحب التقرير
9. **إحصائيات التصدير** — تصنيف حسب النوع (شكاوى، صيانة، تركيب، معاينة)
10. **استخراج المناطق من API** — جلب بيانات المنطقة تلقائياً

---

## المشاكل المعروفة / Known Issues

1. **Edge Tracking Prevention** — `chrome.storage.local` لا يعمل في content scripts
   - **الحل:** كل التخزين يمر عبر `background.js`

2. **CSP على Facebook/Messenger** — يمنع `eval()` و `<script>` tags
   - **الحل:** `chrome.scripting.executeScript` مع `files` parameter

3. **PowerApps iframes** — الجداول دائماً داخل iframes
   - **الحل:** البحث في `document` + كل الـ iframes

4. **"لا توجد نتائج" في phone-reveal** — استخراج الجدول لا يعمل على البورتال
   - **الحالة:** يحتاج تحقيق إضافي

5. **حد أقصى 50 صفحة في الاستخراج** — order-extractor.js يتوقف بعد 50 صفحة
   - **الحل المقترح:** جعل الحد قابل للتعديل في الإعدادات

6. **لا يوجد retry للصفحات الفاشلة** — إذا فشلت صفحة، يتوقف التنقل
   - **الحل المقترح:** إضافة retry mechanism (3 محاولات قبل التخطي)

---

## الخطوات القادمة / Roadmap

- [ ] إصلاح مشكلة phone-reveal على البورتال
- [ ] إضافة مزيد من سكريبتات Tampermonkey
- [ ] تحسين أداء Batch
- [ ] إضافة تقارير متقدمة
- [ ] جعل الحد الأقصى للاستخراج قابل للتعديل
- [ ] إضافة retry mechanism للصفحات الفاشلة
- [ ] إضافة دعم استخراج المناطق من API

---

## أوامر مفيدة / Useful Commands

```bash
# تشغيل Ollama (للمساعد AI)
ollama serve
ollama pull qwen2.2-coder:14b

# فحص الكود
npx tsc --noEmit
```

---

## الملفات المرتبطة / Related Files

| الملف | الوصف |
|-------|-------|
| `AGENTS.md` | تعليمات للذكاء الاصطناعي عند العمل على الكود |
| `README.md` | دليل التثبيت والاستخدام |
| `README_Dev.md` | دليل المطور |

---

*هذا الملف يُحدّث بعد كل إصدار أو تغيير كبير.*
