# مرجع البورتال — Portal Reference
# El Araby Portal — Complete Technical Reference

> **آخر تحديث:** 2026-07-11

---

## نظرة عامة

هذا الملف يوثق كل التفاصيل التقنية للبورتال المطلوب لبناء الإضافات.

---

## أولاً: PowerApps Portal

### البنية التقنية
- **المنصة:** Microsoft PowerApps Portal (Dataverse)
- **Frontend:** React-based
- **Backend:** Azure Web App
- **CRM:** Microsoft Dynamics 365 (Xrm SDK 9.0)
- **التصديق:** Azure AD / Microsoft Identity

### URLs
| الصفحة | الرابط |
|--------|--------|
| الرئيسية (البلاغات) | `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/` |
| تسجيل الدخول | `https://elarabyportalpfs.powerappsportals.com/en-US/SignIn` |
| متابعة أمر الشغل | `https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id=...` |

### window.crmAccount
```javascript
{
  accountId: '7707e653-ef63-ea11-a812-000d3ab953dd',
  changePassword: '0',
  accountType: 963400001,
  allowCancellation: true,
  futureCases: 963400002,
  hideCustomersPhones: false,
  enableOverLapping: true,
  allowReschedule: true,
  allowInstallationCreation: true,
  allowMaintenanceCreation: true,
  allowDealerInstallation: false,
  allowOutsideInventory: true,
  showOtherMenu: true
}
```

### جدول البلاغات (Orders Table)

| Index | العمود | مثال |
|-------|--------|------|
| 0 | رقم الطلب (CAS) | `CAS2026051450930703` |
| 1 | اسم العميل | `هدير محمد محمد` |
| 2 | رقم العقار | `0` |
| 3 | العنوان | `القاهرة، شارع النصر...` |
| 4 | نوع المنتج | `ثلاجات` |
| 5 | رقم الموبايل | `01098388669` |
| 6 | رقم شخص ذو صلة | `01098388669` |
| 7 | شكوى العميل | `GR01 - لا تبرد...` |
| 8 | تاريخ الحجز | `23/05/2026` |
| 9 | ملاحظات المكتب | `163496799 **بورسعيد` |
| 10 | ملاحظات الكول سنتر | _(فارغ)_ |
| 11 | نوع الخدمة | `صيانة` |
| 12 | يوجد شكوى | `لا` |
| 13 | رقم SAP | `733093443` |
| 14 | جهة البلاغ | `متنقلة` |
| 15 | الفني المسؤول | _(فارغ)_ |
| 16 | Actions | `متابعة / ارجاع / توزيع` |

### API Endpoints
```
/_api/incidents?$top=100&$orderby=createdon desc
/_api/incidents?$filter=ticketnumber eq 'CAS...'
/_api/accounts?$top=100
/_api/accounts({customerId})
/_api/contacts({customerId})
/_api/msdyn_workorders?$top=100
```

### قاعدة iframes
```javascript
// ⚠️ الجداول دائماً داخل iframes
function findTableInDoc(doc) {
  return doc.querySelector('table.entity-grid') || doc.querySelector('table');
}

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

## ثانياً: CRM Portal (آخرى)

### البنية التقنية
- **المنصة:** ASP.NET Web Forms (.NET Framework 4.0)
- **Backend:** Azure Web App (`elarabyiscrm2.azurewebsites.net`)
- **CRM:** Microsoft Dynamics 365 (Xrm SDK 9.0)
- **التنقل:** `__doPostBack` فقط (لا يوجد AJAX)

### URLs
| الصفحة | الرابط |
|--------|--------|
| الرئيسية | `/ASPPage/{GUID}.aspx` |
| النواحي المالية | `/ASPPage/MainMoney.aspx` |
| اصدار فاتورة | `/ASPPage/AutoBuildWR.aspx` |
| جاري مراجعتها | `/ASPPage/inprogress.aspx` |
| متوقف احتسابها | `/ASPPage/inasc.aspx` |
| مستحقات المراكز | `/ASPPage/salaryasc2.aspx` |
| حركات CRM | `/ASPPage/accountMovement.aspx` |
| حركات SAP | `/ASPPage/accountMovementSAP.aspx` |
| الفواتير المطلوبة | `/ASPPage/billingneeded.aspx` |
| طلبات المدفوعات | `/ASPPage/Fawry.aspx` |
| ايصالات المدفوعات | `/ASPPage/FinancialReceipt.aspx` |

### محددات صفحات "آخرى"

#### inprogress.aspx / inprogress.aspx
```javascript
{
  dateFrom: 'ContentPlaceHolder1_TextBox1',
  dateTo: 'ContentPlaceHolder1_TextBox2',
  status: 'ContentPlaceHolder1_DropDownList1',  // Amal / ASC
  searchBtn: 'ContentPlaceHolder1_Button1',
  exportBtn: 'ContentPlaceHolder1_Button2'
}
```

#### accountMovement.aspx / billingneeded.aspx
```javascript
{
  accountLabel: 'ContentPlaceHolder1_Label1',
  dateFrom: 'ContentPlaceHolder1_TextBox1',
  dateTo: 'ContentPlaceHolder1_TextBox2',
  password: 'ContentPlaceHolder1_TextBox3',
  searchBtn: 'ContentPlaceHolder1_Button1',
  extractLink: 'ContentPlaceHolder1_LinkButton1'
}
```

#### salaryasc2.aspx
```javascript
{
  centerName: 'ContentPlaceHolder1_lblnameasc',
  accountNo: 'ContentPlaceHolder1_lblaccount',
  year: 'ContentPlaceHolder1_DropDownList3',
  month: 'ContentPlaceHolder1_DropDownList4',
  password: 'ContentPlaceHolder1_TextBox1',
  searchBtn: 'ContentPlaceHolder1_Button1',
  exportBtn: 'ContentPlaceHolder1_Button2'
}
```

### كلمات السر
| الصفحة | المطلوب |
|--------|---------|
| salaryasc2.aspx | "الرقم السرى" |
| accountMovement.aspx | "كلمة السر" |
| accountMovementSAP.aspx | "كلمة المرور" |
| billingneeded.aspx | "الرقم السرى" |

### معرفات الروابط في MainMoney.aspx
| الرابط | ID |
|--------|-----|
| اصدار فاتورة | `LinkButton7` |
| جاري مراجعتها | `LinkButton1` |
| متوقف احتسابها | `LinkButton2` |
| مستحقات المراكز | `LinkButton5` |
| Call-Center خارج الضمان | `LinkButton8` |
| حوافز الفنيين | `LinkButton9` |
| حركات SAP | `LinkButton3` |
| حركات CRM | `LinkButton4` |
| الفواتير المطلوبة | `LinkButton6` |
| طلبات المدفوعات | `LinkButton10` |
| ايصالات المدفوعات | `LinkButton12` |

### أعمدة التقرير (28 عمود)
| # | القيمة |
|---|--------|
| 1 | `ticketnumber` |
| 2 | `ldv_sapordernumber` |
| 3 | `ldv_customername` |
| 4 | `ldv_address` |
| 5 | `ldv_problem` |
| 6 | `ldv_centraltelephone` |
| 7 | `ldv_producttype` |
| 8 | `ldv_brand` |
| 9 | `ldv_modelnumber` |
| 10 | `ldv_actualmodel` |
| 11 | `ldv_productbarcode` |
| 12 | `ldv_productbarcodeatlsc` |
| 13 | `ldv_resourcelastcomment` |
| 14 | `ldv_productbarcodeatlsc` |
| 15 | `ldv_scheduledservicestartdate` |
| 16 | `createdon` |
| 17 | `ldv_warrantydate` |
| 18 | `statuscode` |
| 19 | `new_queue` |
| 20 | `ldv_createdfrom` |
| 21 | `ldv_callcenternotes` |
| 22 | `ldv_technicalsupportnotes` |
| 23 | `ldv_planningteamnotes` |
| 24 | `ldv_backofficenotes` |
| 25 | `ldv_technicalsupportreplacementapproval` |
| 26 | `ldv_technicalsupportlscapproval` |
| 27 | `ldv_sparepartsshortage` |
| 28 | `ldv_sparepartsavailability` |

---

## ثالثاً: أنواع المنتجات

| الرمز | المنتج بالعربي | المنتج بالإنجليزي |
|-------|---------------|-------------------|
| AC | تكييف | Air Conditioner |
| WM | غسالة | Washing Machine |
| RF | ثلاجة | Refrigerator |
| DW | غسالة أطباق | Dishwasher |
| RG | بوتجاز و مسطح و فرن | Range |
| WH | سخانات مياه | Water Heater |
| MR | مبرد مياه | Water Cooler |

---

## رابعاً: حالات البلاغ

| الحالة | القيمة | ملاحظات |
|--------|--------|---------|
| مجدول | Scheduled | — |
| قيد التنفيذ | In Progress | — |
| مكتمل | Completed | — |
| ملغي | Canceled | يتم تجاهله |
| مؤجل | Postpone | يتم تجاهله |
| خارج الضمان | Out Warranty | `753240001` |

---

## خامساً: Regex Patterns

| الهدف | Pattern |
|-------|---------|
| رقم موبايل مصري | `/01[0-9]{9}/g` |
| رقم CAS | `/CAS\d+/g` |
| رقم SAP | `/\b7[0-9]{7,9}\b/g` |
| رقم حساب | `/\b(200\d{7})\b/g` |

---

## سادساً: CSS Selectors الشائعة

```javascript
// الروابط
'a[href*="doPostBack"]'
'a.sameframe'
'a[href*="MainMoney"]'

// الجداول
'table.entity-grid'
'table.table'
'table.table-striped.table-hover'

// الحقول
'input[type="submit"]'
'input[type="date"]'
'input[type="password"]'
'select[id*="DropDownList"]'

// رسائل الخطأ
'span:contains("Does Not Exist")'
'span:contains("Entity")'
```
