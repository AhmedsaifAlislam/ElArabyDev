# AGENTS.md — البحث عن بلاغ

## القاعدة الذهبية
**لا تعيد كتابة ملفات كاملة.** عدّل فقط الكود الذي يحتاج تغيير.

## القواعد الأساسية

1. **مجلد العمل الأساسي:** `E:\My First Lap\MY WORKE\Apps\العربي سيستم\البحث عن بلاغ`
2. **الملف الرئيسي:** `content.js` (~415 سطر)
3. **المتصفح:** Chrome أو Edge
4. **البورتال:** `https://elarabyiscrm2.azurewebsites.net/ASPPage/SelectReport.aspx*`

## أنماط مهمة

### كشف الأعمدة تلقائياً
```javascript
// السكريبت يبحث عن عمود يحتوي على:
const CRM_KEYWORDS = ['بلاغ', 'CAS', 'CRM', 'رقم'];
const REPORT_KEYWORDS = ['تقرير', 'Report', 'ملاحظات'];

// إذا لم يُوجد عمود التقرير، يبحث عن عمود يحتوي:
const REPORT_KEYWORDS_ALT = ['حالة', 'status'];
```

### حجم الدفعة
```javascript
const BATCH = 25;  // عدد الأرقام في كل دفعة
```

### الحالات المفلترة
```javascript
const SKIP = ['canceled', 'postpone'];  // يتم تجاهل هذه الحالات
```

### نموذج الرسائل
```javascript
// حفظ الحالة في chrome.storage.local
chrome.storage.local.set({ extState: state });

// استرجاع الحالة
chrome.storage.local.get(['extState'], (data) => { ... });
```

## عند ظهور مشكلة

1. حدد موقع المشكلة (content.js)
2. اقرأ الكود المرتبط كاملاً
3. تحقق من أن الملف يحتوي الأعمدة المطلوبة
4. لا تفترض — اقرأ وتحقق قبل التعديل
5. اشرح المشكلة والحل بالعربية

## محددات DOM المستخدمة

| المحدد | الوصف |
|--------|-------|
| `#ContentPlaceHolder1_TextBox1` | حقل الإدخال |
| `#ContentPlaceHolder1_DropDownList2` | قائمة طريقة البحث |
| `#ContentPlaceHolder1_Button1` | زر البحث |
| `#ContentPlaceHolder1_GridView1` | جدول النتائج |
| `tr:last-child td[colspan]` | صف الترقيم |
| `td[colspan] span` | رقم الصفحة الحالية |
| `td[colspan] a` | روابط الصفحات |

## ملاحظات إضافية

- `content.js` يعمل كـ content script على `SelectReport.aspx` فقط
- يعتمد على `xlsx.full.min.js` لمعالجة ملفات Excel
- يستخدم `chrome.storage.local` لحفظ الحالة بين العمليات
- لا يحتاج صلاحيات خاصة помимо `storage` و `host_permissions`
