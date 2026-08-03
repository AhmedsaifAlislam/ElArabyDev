# AGENTS.md — Rescheduling Portal

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\Rescheduling Portal Requests Optimization`
2. **الملف الرئيسي:** `smart-scheduler.js`
3. **المتصفح:** Chrome أو Edge مع Tampermonkey
4. **البورتال:** `https://elarabyportalpfs.powerappsportals.com/*`
5. **الصفحة المستهدفة:** `workorderreview` فقط

## أنماط مهمة

### التحقق من الصفحة
```javascript
// يعمل فقط على workorderreview مع وجود incidentId
const url = new URL(window.location.href);
const incidentId = url.searchParams.get('id');

if (!incidentId || !window.location.href.toLowerCase().includes('workorderreview')) {
    return;
}
```

### حقن الزر العائم
```javascript
function injectButton() {
    if (document.getElementById('smart-schedule-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'smart-schedule-btn';
    btn.innerHTML = '📅 جدولة حرة (بدون قيود)';
    // ... styling ...
    btn.onclick = openSchedulerModal;
    
    document.body.appendChild(btn);
}
```

## عند ظهور مشكلة

1. حدد موقع المشكلة
2. اقرأ الكود المرتبط كاملاً
3. تحقق من أن البورتال لا يزال بنفس البنية
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## ملاحظات إضافية

- السكريبت يعمل في `document-end` (بعد تحميل الصفحة)
- يحقن زراً عائماً في الصفحة
- النافذة المنبثقة تستخدم DOM عربي (RTL)
- لا يستخدم أي مكتبات خارجية
