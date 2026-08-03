# El Araby System — منظومة أدوات بوابة العربي
# Arabic System — El Araby Portal Tools Suite

> **تاريخ الإنشاء:** 2026-07-11
> **آخر تحديث:** 2026-07-11
> **المطور:** Zain (Antigravity)

---

## نظرة عامة / Overview

منظومة متكاملة من الأدوات والإضافات المخصصة لإدارة وخدمة مراكز صيانة شركة العربي للإلكترونيات (El Araby Group). تشمل البحث عن قطع الغيار، تعبئة البلاغات، استخراج التقارير، أتمتة الصفحات المالية، والمساعدة الذكية.

A comprehensive suite of tools and extensions designed for managing and servicing El Araby Group service centers. Covers spare parts search, report extraction, portal automation, and smart assistance.

---

## الأدوات / Tools

| # | الأداة | Tool | النوع | البورتال | الإصدار |
|---|--------|------|-------|----------|--------|
| 1 | المساعد الذكي | Smart Parts Assistant | Chrome Extension (MV3) | PowerApps Portal | v2.2 |
| 2 | مساعد التقفيلات | Portal AutoFiller | Chrome Extension (MV3) | PowerApps Portal | v1.0 |
| 3 | البحث عن بلاغ | Report Extractor | Chrome Extension (MV3) | CRM Portal (Azure) | v5.0 |
| 4 | portal-other-section | Financial Analytics | Chrome Extension + Scripts | CRM Portal (Azure) | v3.0 |
| 5 | حجز البلاغات المستقبلة | Date Filter Unlocker | Tampermonkey Script | PowerApps Portal | v1.0 |
| 6 | Rescheduling Portal | Smart Scheduler | Tampermonkey Script | PowerApps Portal | v1.1 |
| 7 | excel_autofix | Excel Auto Formatter | Python Desktop App | — | — |

---

## البورتالات المستهدفة / Target Portals

### 1. PowerApps Portal — بوابة شركاء العربي
- **الرابط:** `https://elarabyportalpfs.powerappsportals.com`
- **الغرض:** إدارة البلاغات وأوامر العمل
- **الأدوات:** المساعد الذكي، مساعد التقفيلات، حجز البلاغات، الجدولة الذكية

### 2. CRM Portal — بوابة CRM العربي
- **الرابط:** `https://elarabyiscrm2.azurewebsites.net`
- **الغرض:** التقارير والصفحات المالية
- **الأدوات:** البحث عن بلاغ، portal-other-section

### 3. لا يعمل على البورتال
- **الغرض:** تنسيق ملفات Excel للطباعة
- **الأداة:** excel_autofix

---

## هيكل المجلدات / Directory Structure

```
العربي سيستم/
├── MASTER_README.md              ← هذا الملف
├── PORTAL_MAP.md                 ← خريطة البورتال الكاملة
├── SHARED_KNOWLEDGE.md           ← المعرفة المشتركة بين الأدوات
├── CHANGELOG.md                  ← سجل التغييرات
├── KNOWN_ISSUES.md               ← المشاكل المعروفة
│
├── المساعد الذكي/                ← إضافة إدارة قطع الغيار
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── مساعد التقفيلات/              ← إضافة تعبئة أوامر العمل
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── البحث عن بلاغ/                ← إضافة استخراج التقارير
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── portal-other-section/         ← أدوات الصفحات المالية
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── حجز البلاغات المستقبلة/       ← سكريبت فتح فلتر التاريخ
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── Rescheduling Portal Requests Optimization/  ← سكريبت الجدولة الذكية
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
├── excel_autofix/                ← أداة تنسيق Excel
│   ├── TOOL_PROFILE.md
│   ├── PROJECT_STATUS.md
│   ├── AGENTS.md
│   └── README.md
│
└── اكواد/                       ← صفحات HTML محفوظة من البورتال
    ├── اوامر الشغل · Partner Portal_files/
    ├── متابعة امر الشغل · Partner Portal صفحة 1.html
    ├── متابعة امر الشغل · Partner Portal صفحة 2.html
    ├── متابعة امر الشغل · Partner Portal صفحة 3.html
    ├── العهد المتاحة · Partner Portal.html
    ├── تغير كلمة المرور · Partner Portal.html
    └── ...
```

---

## البدء السريع / Quick Start

### للتثبيت:
1. افتح `edge://extensions` أو `chrome://extensions`
2. فعّل **Developer mode**
3. اضغط **Load unpacked**
4. اختر مجلد الإضافة المطلوبة

### للcroft scripts:
1. ثبّت Tampermonkey من https://www.tampermonkey.net/
2. افتح السكريبت المطلوب
3. انسخ محتواه والصقه في Tampermonkey
4. احفظ بـ `Ctrl + S`

### لأداة Python:
```bash
cd excel_autofix
pip install customtkinter openpyxl
python excel_app.py
```

---

## سير العمل الموحد / Unified Workflow

```
1. بلاغ يدخل من الكول سنتر
   ↓
2. البحث عن قطعة الغيار (المساعد الذكي)
   ↓
3. تعبئة أوامر العمل (مساعد التقفيلات)
   ↓
4. جدولة الزيارة (Smart Scheduler)
   ↓
5. تنفيذ أمر العمل (الفني)
   ↓
6. تقفيل البلاغة
   ↓
7. استخراج التقارير (البحث عن بلاغ)
   ↓
8. المراجعة المالية (portal-other-section)
   ↓
9. إصدار الفاتورة
   ↓
10. التحويل للحساب
```

---

## ملاحظات تقنية مهمة / Technical Notes

- **Edge Tracking Prevention** — `chrome.storage.local` لا يعمل في content scripts على Edge. كل التخزين يمر عبر `background.js`
- **CSP على Facebook/Messenger** — يمنع `eval()` و `<script>` tags. الحل: `chrome.scripting.executeScript` مع `files` parameter
- **PowerApps Portal** — الجداول دائماً داخل iframes. يجب البحث في `document` + كل الـ iframes
- **ASP.NET Web Forms** — التنقل يتم عبر `__doPostBack` فقط. لا يوجد AJAX في صفحات "آخرى"

---

## الملفات المرجعية / Reference Files

| الملف | الوصف |
|-------|-------|
| `PORTAL_MAP.md` | خريطة كل صفحات البورتال مع روابطها وعلاقاتها |
| `SHARED_KNOWLEDGE.md` | أنماط الاستهداف، كلمات السر، POSTBack، أنواع المنتجات |
| `CHANGELOG.md` | سجل التغييرات لكل الأدوات |
| `KNOWN_ISSUES.md` | المشاكل المعروفة والحلول المقترحة |

---

## حقوق النشر / License

هذا المشروع خاص بشركة العربي للإلكترونيات — مراكز خدمة الصيانة.
This project is proprietary to El Araby Group — Service Maintenance Centers.
