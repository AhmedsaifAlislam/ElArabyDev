# AGENTS.md — portal-other-section

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\portal-other-section`
2. **الملفات الرئيسية:**
   - `get_all_data.js` — سكريبت Console لاستخراج البيانات
   - `portal_automation.js` — سكريبت أتمتة الصفحات المالية
   - `elaraby-extension/` — إضافة Chrome

## أنماط مهمة

### POSTBack
```javascript
// كل الصفحات تستخدم __doPostBack للتنقل
// لا يوجد AJAX — كل عملية PostBack كاملة
const link = document.getElementById('LinkButton1');
link.click();  // يستدعي __doPostBack تلقائياً
```

### كلمات السر
```javascript
// كل صفحة لها كلمة سر مختلفة
const PASSWORDS = {
  salaryasc2: 'الرقم السرى',
  accountMovement: 'كلمة السر',
  accountMovementSAP: 'كلمة المرور',
  billingneeded: 'الرقم السرى'
};
```

### كشف نوع الصفحة
```javascript
// من URL
url.includes('accountmentsap')    → accountMovementSAP
url.includes('accountment')       → accountMovement
url.includes('mainmoney')         → mainMenu
url.includes('inprogress')        → inProgress
url.includes('inasc')             → inASC

// من بنية الجدول (خطة بديلة)
const sapKeywords = ['posting date', 'تاريخ الترحيل', 'billing doc', 'مستند الفوترة'];
if (matches >= 3) → accountMovementSAP
```

## عند ظهور مشكلة

1. حدد موقع المشكلة (get_all_data.js, portal_automation.js,popup.js, local-analyzer.js)
2. اقرأ الكود المرتبط كاملاً
3. تحقق من أن البورتال لا يزال بنفس البنية
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## محددات DOM المستخدمة

| المحدد | الوصف |
|--------|-------|
| `a[href*="doPostBack"]` | روابط PostBack |
| `a.sameframe` | روابط sameframe |
| `input[type="submit"]` | أزرار الإرسال |
| `input[type="date"]` | حقول التاريخ |
| `input[type="password"]` | حقول كلمة السر |
| `select` | القوائم المنسدلة |
| `table.table` | الجداول |
| `th` / `tbody tr` / `td` | أعمدة وصفوف الجداول |

## ملاحظات إضافية

- `portal_automation.js` يحتاج كلمة السر يدوياً (`CONFIG.PASSWORD`)
- `get_all_data.js` لا يحتاج كلمة السر
- `local-analyzer.js` يعمل في إضافة Chrome فقط
- لا تستخدم `eval()` على أي صفحة
