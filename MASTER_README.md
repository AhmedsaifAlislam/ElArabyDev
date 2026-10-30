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
| 7 | excel_autofix | Excel Auto Formatter | Python Desktop App + Local HTTP Service | — | v1.1 |
| 8 | El Araby Unified System | النظام العربي الموحد | Chrome Extension (MV3) — موحّدة لكل الميزات | PowerApps + CRM | v4.0 |

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
ElArabyDev/                           ← نسخة العمل (العربي سيستم = مرجع للقراءة فقط)
├── MASTER_README.md              ← هذا الملف
├── PORTAL_MAP.md                 ← خريطة البورتال الكاملة
├── SHARED_KNOWLEDGE.md           ← المعرفة المشتركة بين الأدوات
├── MASTER_ROADMAP.md             ← خطة المهام الكبرى (Agent Team)
├── PHASE3_UNIFIED_INTEGRATION_PLAN.md ← خطة الدمج الموحد
├── IDEAS_BACKLOG.md              ← الأفكار غير المنفذة (Roadmap)
├── E2E_CHECKLIST.md              ← قائمة الاختبارات اليدوية الشاملة
├── PROMPT_MASTER.md              ← البروبت الكامل لمراحل التشغيل
├── CHANGELOG.md                  ← سجل التغييرات
├── KNOWN_ISSUES.md               ← المشاكل المعروفة
├── DEV_COPY.md                   ← دليل نسخة التطوير + النشر
│
├── src/                          ← ★ المصدر (كل التطوير هنا)
│   ├── unified-extension/        ← الإضافة الموحدة MV3 (جميع الميزات)
│   │   ├── manifest.json / background.js / content-script.js
│   │   ├── content/              ← content scripts (booking, crm, financial, rescheduling)
│   │   ├── shared/               ← 13 مكتبة مشتركة (مصدر الحقيقة)
│   │   ├── Tempermonky/          ← سكريبتات Tampermonkey المدمجة + DateFilter
│   │   ├── popup.html/js         ← البوبأب الموحد (4 تبويبات)
│   │   └── styles/ lib/ dashboard/
│   ├── dashboard/                ← لوحة التحكم (Vite)
│   ├── crm-content/              ← سكريبت CRM (TypeScript)
│   ├── design-system/            ← نظام التصميم الموحد (tokens.css)
│   ├── ui-components/ templates/ portal-config/
│   └── docs/                     ← PORTAL_REFERENCE.md, SHARED_API.md
│
├── deploy/                       ← ★ المجلد المحمَّل في المتصفح (نظيف من src/ عبر deploy.ps1)
├── tools/                        ← أدوات التشغيل
│   ├── deploy.ps1                ← نشر: src/unified-extension → deploy
│   ├── sync-shared.ps1           ← مزامنة المكتبات المشتركة
│   └── excel_autofix/            ← أداة تنسيق Excel (له AGENTS.md خاص)
│
├── legacy/                       ← النسخ المنفصلة القديمة (أرشيف/مرجع)
│   ├── مساعد التقفيلات (نشر قديم)/
│   ├── المساعد الذكي/ البحث عن بلاغ/ حجز البلاغات المستقبلة/
│   ├── portal-other-section/     ← التحليلات المالية القديمة
│   ├── Rescheduling Portal Requests Optimization/
│   └── اكواد/                    ← صفحات HTML محفوظة من البورتال
│
├── backups/                      ← كل النسخ الاحتياطية (لا تلمس)
└── .git/                         ← تاريخ التوحيد (يتتبع ElArabyDev فقط)
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

**الخدمة المحلية (للإضافة الموحدة):** شغّل `service.bat` → تبدأ على `http://127.0.0.1:8765`،
ثم من الإضافة: **الأدوات ← 📊 Excel Autofix** (رفع الملف + معالجة + تنزيل).

### لربط n8n (أتمتة خارجية):
1. في n8n: أنشئ **Webhook node** (POST) وانسخ الـ URL
2. من الإضافة: **الأدوات ← 🔗 n8n** ← الصق الـ URL + احفظ ← "إرسال اختبار"
3. الأحداث: `excel_export` (تلقائي عند تفعيل "بعد كل تصدير")، `session_log`، `telemetry_summary`، `test`

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
| `MASTER_ROADMAP.md` | خطة المهام الكبرى + تتبع تنفيذها (47+ مهمة، Agent Team) |
| `PHASE3_UNIFIED_INTEGRATION_PLAN.md` | خطة الدمج الموحد (Unified Integration) + AI End-to-End |
| `IDEAS_BACKLOG.md` | الأفكار المقترحة وغير المنفذة مع الأولويات |
| `E2E_CHECKLIST.md` | قائمة الاختبار اليدوي الشامل على البورتال الحي |
| `PROMPT_MASTER.md` | البروبت الكامل لمراحل التشغيل الموحدة |
| `CHANGELOG.md` | سجل التغييرات لكل الأدوات |
| `KNOWN_ISSUES.md` | المشاكل المعروفة والحلول المقترحة |
| `docs/AI_N8N_FOUNDATION.md` | أساس الذكاء الاصطناعي + ناقل أحداث n8n (Outbox/Retry/Registry) |

---

## حقوق النشر / License

هذا المشروع خاص بشركة العربي للإلكترونيات — مراكز خدمة الصيانة.
This project is proprietary to El Araby Group — Service Maintenance Centers.
