# حالة المشروع — مساعد التقفيلات
# Project Status — Portal AutoFiller

> **آخر تحديث:** 2026-08-03
> **الإصدار:** v1.1.0 (توحيد المكتبات في ElArabyDev)

---

## 1. ✅ المنجز

### البنية التحتية
- [x] هيكل المجلدات مرتب (lib/, icons/, styles/, Tempermonky/)
- [x] Manifest V3 جاهز
- [x] 6 تبويبات في البوبداب
- [x] Service Worker للخلفية

### التبويبات
- [x] `🔍 بحث وتعبئة` — ملء تلقائي للحقول
- [x] `⚡ زيارة تانية` — إغلاق سريع
- [x] `📥 الاستخراج` — استخراج البلاغات
- [x] `📋 التقارير` — جلسات محفوظة
- [x] `🤖 مساعد AI` — مساعد ذكي (Ollama)
- [x] `🐵 سكريبتات` — حقن سكريبتات Tampermonkey

### كشف أرقام الهواتف
- [x] `elaraby-phone-reveal-layer0.js` — اعتراض `crmAccount` في MAIN world
- [x] التحكم عبر `localStorage` toggle
- [x] `tampermonkey-runner.js` — محقن السكريبتات

### دعم Batch
- [x] معالجة متعددة للبلاغات
- [x] تأخير قابل للتعديل
- [x] إيقاف في أي وقت

### سكريبتات Tampermonkey المدمجة
- [x] `elaraby-phone-reveal.js` — كشف أرقام الهواتف
- [x] `messenger-sender.js` — إرسال رسائل الماسنجر
- [x] `report-processor.js` — معالج التقارير

### البيانات
- [x] `selectors.json` — محددات DOM للبورتال
- [x] `secondVisitProfiles.json` — ملفات تعريف الزيارة الثانية
- [x] `products-db.json` — قاعدة بيانات المنتجات
- [x] `services.json` — قوالب خدمات الصيانة
- [x] `tips.json` — نصائح وقوانين مراكز الصيانة

---

## 2. 🔄 قيد التطوير

- لا شيء حالياً

---

## 3. 🐛 المشاكل المعروفة

### محلولة
- ~~**Edge Tracking Prevention**~~ — كل التخزين يمر عبر `background.js` ✅
- ~~**CSP على Facebook/Messenger**~~ — استخدام `chrome.scripting.executeScript` ✅
- ~~**PowerApps iframes**~~ — البحث في `document` + كل الـ iframes ✅

### مفتوحة
- **"لا توجد نتائج" في elaraby-phone-reveal** — استخراج الجدول لا يعمل على البورتال
  - **الحالة:** يحتاج تحقيق إضافي
  - **السبب المحتمل:** بنية الجدول على البورتال مختلفة عن المتوقع

---

## 4. 📋 المعمارية

### تدفق البيانات
```
popup.js → content-script.js → portal form
popup.js → background.js → chrome.storage.local
popup.js → order-extractor.js → استخراج البلاغات
tampermonkey-runner.js → <script> tags → MAIN world
elaraby-phone-reveal-layer0.js → window.crmAccount → كشف الأرقام
```

### نموذج الرسائل
```javascript
// من popup → content script
chrome.tabs.sendMessage(tabId, { action: 'ACTION_NAME', ... });

// من content script → background (Storage Proxy)
const data = await storageGet({ key: defaultValue });
await storageSet({ key: value });
await storageRemove(['key']);
```

### قاعدة iframes على PowerApps
```javascript
// ⚠️ البورتال يعمل على PowerApps — الجداول دائماً داخل iframes
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

---

## 5. 🔮 الخطوات القادمة المقترحة

- [ ] إصلاح مشكلة phone-reveal على البورتال
- [ ] إضافة مزيد من سكريبتات Tampermonkey
- [ ] تحسين أداء Batch
- [ ] إضافة تقارير متقدمة
- [ ] تحسين واجهة المستخدم

---

## 6. ⚙️ أوامر مفيدة

```bash
# تشغيل Ollama (للمساعد AI)
ollama serve
ollama pull qwen2.2-coder:14b

# فحص الكود
npx tsc --noEmit
```

---

## 7. 📊 معلومات البورتال

- **رابط البلاغات:** `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/`
- **حقل Warranty Status:** `753240001` = Out warranty (للكل)
- **التاريخ:** دائماً أمس (ديناميكي)
- **AC:** موديلين + سيريالين، باقي المنتجات: موديل + سيريال واحد

---

*هذا الملف يُحدّث يدوياً بعد كل جلسة عمل.*
