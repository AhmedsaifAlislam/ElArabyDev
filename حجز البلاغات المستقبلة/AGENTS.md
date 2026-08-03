# AGENTS.md — حجز البلاغات المستقبلة

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\حجز البلاغات المستقبلة`
2. **الملف الرئيسي:** `ElAraby_DateFilter_Unlocker.user.js`
3. **المتصفح:** Chrome أو Edge مع Tampermonkey
4. **البورتال:** `https://elarabyportalpfs.powerappsportals.com/*`

## أنماط مهمة

### اعتراض crmAccount
```javascript
// يعمل في document-start (قبل أي شيء)
Object.defineProperty(window, 'crmAccount', {
  get: function () { return _crmAccount; },
  set: function (val) {
    // حذف قيود futureCases
    if (val && typeof val === 'object') {
      delete val.futureCases;
    }
    _crmAccount = val;
  },
  configurable: true
});
```

### مراقبة Fetch
```javascript
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  // مراقبة الطلبات
  const response = await originalFetch.apply(this, args);
  // تعديل الاستجابة إذا لزم الأمر
  return response;
};
```

## عند ظهور مشكلة

1. حدد موقع المشكلة
2. اقرأ الكود المرتبط كاملاً
3. تحقق من أن البورتال لا يزال بنفس البنية
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## ملاحظات إضافية

- السكريبت يعمل في `document-start` (قبل أي سكريبت آخر)
- يستخدم `Object.defineProperty` لاعتراض `window.crmAccount`
- لا يغير أي بيانات في السيرفر — فقط يتعديل سلوك الواجهة
- يدعم `GM_getValue` من Tampermonkey فقط
