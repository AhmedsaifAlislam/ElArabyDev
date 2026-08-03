# تحليل حقيقي وعميق لبوابة العربي CRM - قسم "آخرى"

> **ملاحظة:** هذا التحليل مبني على فتح حقيقي للبورتال وجلب HTML الفعلي لكل صفحة.
> آخر تحديث: 2026-06-24

---

## البنية التقنية

| العنصر | التفاصيل |
|--------|----------|
| المنصة | ASP.NET Web Forms (.NET Framework 4.0) |
| Backend | Azure Web App (`elarabyiscrm2.azurewebsites.net`) |
| CRM | Microsoft Dynamics 365 (Xrm SDK 9.0) |
| مصدر الكود | `D:\a\1\s\IG ASC Portal\` (Azure DevOps Pipeline) |
| نموذج التصديق | Azure AD / Microsoft Identity |

---

## تدفق العمل الكامل بعد تقفيل البلاغة

```
1. بلاغ خدمة جديد
   ↓
2. تنفيذ أمر العمل (Fey Tech يروح يصلح)
   ↓
3. تقفيل البلاغة (إنهاء أمر العمل)
   ↓
4. هل البلاغة محتاجة فاتورة؟
   ├── نعم → billingneeded.aspx (الفواتير المطلوبة)
   │         ↓
   │         AutoBuildWR.aspx (إصدار فاتورة)
   │         ↓
   │         inprogress.aspx (جاري مراجعتها)
   │         ↓
   │         ├── مراجعة ناجحة → accountMovement.aspx (حركات CRM)
   │         │                   ↓
   │         │                   accountMovementSAP.aspx (حركات SAP)
   │         │                   ↓
   │         │                   salaryasc2.aspx (مستحقات المراكز)
   │         │                   ↓
   │         │                   Fawry.aspx (طلبات المدفوعات)
   │         │                   ↓
   │         │                   FinancialReceipt.aspx (ايصالات)
   │         │
   │         └── مراجعة فاشلة → inasc.aspx (متوقف احتسابها)
   │
   └── لا → inasc.aspx (متوقف احتسابها)
   
5. لو البلاغة من Call-Center خارج الضمان:
   └── SalaryASC.aspx (Call-Center خارج الضمان)
       ↓
       accountMovement.aspx

6. حوافز الفنيين (تلقائي):
   └── mscreport.aspx (حوافز الفنيين)
```

---

## تحليل تفصيلي لكل صفحة (بيانات حقيقية من HTML)

### 1. MainMoney.aspx - الصفحة الرئيسية للنواحي المالية

**URL:** `/ASPPage/MainMoney.aspx`

**HTML الفعلي:**
```html
<div class="page-header pageHeaderNoBar">
    <ul class="nav navbar-nav">
        <li><a id="LinkButton7" href="javascript:__doPostBack('ctl00$LinkButton7','')">اصدار فاتورة</a></li>
        <li><a id="LinkButton1" href="javascript:__doPostBack('ctl00$LinkButton1','')"> جاري مراجعتها</a></li>
        <li><a id="LinkButton2" href="javascript:__doPostBack('ctl00$LinkButton2','')">  متوقف احتسابها  </a></li>
        <li><a id="LinkButton5" href="javascript:__doPostBack('ctl00$LinkButton5','')">مستحقات المراكز</a></li>
        <li><a id="LinkButton8" href="javascript:__doPostBack('ctl00$LinkButton8','')">Call-Center خارج الضمان</a></li>
        <li><a id="LinkButton9" href="javascript:__doPostBack('ctl00$LinkButton9','')"> حوافز الفنيين </a></li>
        <li><a id="LinkButton3" href="javascript:__doPostBack('ctl00$LinkButton3','')">حركات الحسابSAP</a></li>
        <li><a id="LinkButton4" href="javascript:__doPostBack('ctl00$LinkButton4','')">حركات الحساب </a></li>
        <li><a id="LinkButton6" href="javascript:__doPostBack('ctl00$LinkButton6','')">الفواتير المطلوبة</a></li>
        <li><a id="LinkButton10" href="javascript:__doPostBack('ctl00$LinkButton10','')">طلبات المدفوعات</a></li>
        <li><a id="LinkButton12" href="javascript:__doPostBack('ctl00$LinkButton12','')">ايصالات المدفوعات</a></li>
    </ul>
</div>
```

**الملاحظات:**
- كل الروابط بتستخدم `__doPostBack` — مش روابط عادية
- التنقل بين الصفحات بيعمل PostBack كامل للسيرفر
- مفيش AJAX أو تحميل جزئي

---

### 2. AutoBuildWR.aspx - إصدار فاتورة

**URL:** `/ASPPage/AutoBuildWR.aspx`

**HTML الفعلي:**
```html
<!-- القسم الأول: رقم البلاغ لانشاء فاتورة -->
<div class="col-md-12 data-section printEnhance">
    <div class="col-md-3 data-section-label">
        <i class="fa fa-user"></i>&nbsp; رقم البلاغ لانشاء فاتورة  
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">اسم المركز : </label>
        <div class="col-md-9">
            <span id="ContentPlaceHolder1_lblnameasc">.</span>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">رقم حساب المركز : </label>
        <div class="col-md-9">
            <span id="ContentPlaceHolder1_lblaccount">.</span>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">رقم الحالة</label>
        <div class="col-md-9">
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="text" 
                   id="ContentPlaceHolder1_TextBox1" />
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <div class="col-md-9">
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" 
                   class="btn btn-default modalSearchBtnSpare" />
        </div>
    </div>
    
    <div id="ContentPlaceHolder1_Panel1" style="height:100%;width:950px;overflow-y:scroll;">
        <span id="ContentPlaceHolder1_Label1"></span>
        <span id="ContentPlaceHolder1_lblsapno" style="color:Red;font-size:Large;"></span>
    </div>
</div>

<!-- القسم الثاني: تحديد قطع الغيار لاصدار فاتورة -->
<div class="col-md-12 data-section printEnhance">
    <div class="col-md-3 data-section-label">
        <i class="fa fa-user"></i>&nbsp; حدد قطع الغيار لاصدار فاتورة    
    </div>
    
    <div id="ContentPlaceHolder1_Panel2" style="height:100%;width:950px;overflow-y:scroll;">
        <input type="submit" name="ctl00$ContentPlaceHolder1$Button2" 
               value="اصدر فاتورة" id="ContentPlaceHolder1_Button2" 
               class="btn btn-default modalSearchBtnSpare" />
    </div>
</div>
```

**الحقول الحقيقية:**

| العنصر | ID | النوع | الوظيفة |
|--------|-----|-------|---------|
| اسم المركز | `ContentPlaceHolder1_lblnameasc` | Span (ثابت) | يظهر تلقائياً |
| رقم حساب المركز | `ContentPlaceHolder1_lblaccount` | Span (ثابت) | يظهر تلقائياً |
| رقم الحالة | `ContentPlaceHolder1_TextBox1` | TextBox | إدخال رقم البلاغ |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit Button | تنفيذ البحث |
| لوحة النتائج | `ContentPlaceHolder1_Panel1` | Panel | عرض النتائج |
| رقم الساب | `ContentPlaceHolder1_lblsapno` | Span (أحمر) | رقم SAP |
| زر اصدر فاتورة | `ContentPlaceHolder1_Button2` | Submit Button | إصدار الفاتورة |
| لوحة قطع الغيار | `ContentPlaceHolder1_Panel2` | Panel | عرض قطع الغيار |

**العملية:**
1. المستخدم يدخل رقم البلاغ (رقم الحالة)
2. يضغط "بحث"
3. النظام يعرض تفاصيل البلاغ + قطع الغيار
4. المستخدم يحدد قطع الغيار
5. يضغط "اصدر فاتورة"
6. الفاتورة بتتحول لـ `inprogress.aspx`

---

### 3. inprogress.aspx - جاري مراجعتها

**URL:** `/ASPPage/inprogress.aspx`

**HTML الفعلي:**
```html
<table class="table table-striped table-hover table-responsive">
    <tr>
        <td colspan="4" style="font-size: large; text-align: center;">
            <span id="ContentPlaceHolder1_Label1">
                Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist
            </span>
        </td>
    </tr>
    <tr>
        <td>من :</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="date" 
                   id="ContentPlaceHolder1_TextBox1" class="datepicker form-control" />
        </td>
        <td>الى :</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox2" type="date" 
                   id="ContentPlaceHolder1_TextBox2" class="datepicker form-control" />
        </td>
    </tr>
    <tr>
        <td>الحالة :</td>
        <td>
            <select name="ctl00$ContentPlaceHolder1$DropDownList1" 
                    id="ContentPlaceHolder1_DropDownList1" class="col-md-9 noPrint">
                <option value="Amal">بلاغات جاري مراجعتها ماليا من العربى</option>
            </select>
        </td>
        <td>&nbsp;</td>
        <td>
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" />
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button2" 
                   value="استخراج الي شيت اكسل" id="ContentPlaceHolder1_Button2" />
        </td>
    </tr>
</table>

<!-- أعمدة التقرير -->
<table id="ContentPlaceHolder1_CheckBoxList1">
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_0" type="checkbox" checked value="ticketnumber" /><label>البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_1" type="checkbox" checked value="ldv_sapordernumber" /><label>رقم الساب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_2" type="checkbox" checked value="ldv_customername" /><label>اسم العميل</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_3" type="checkbox" value="ldv_address" /><label>العنوان</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_4" type="checkbox" checked value="ldv_problem" /><label>مشكلة الجهاز</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_5" type="checkbox" checked value="ldv_centraltelephone" /><label>السنترال</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_6" type="checkbox" checked value="ldv_producttype" /><label>المنتج</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_7" type="checkbox" value="ldv_brand" /><label>الماركة</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_8" type="checkbox" checked value="ldv_modelnumber" /><label>الموديل</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_9" type="checkbox" checked value="ldv_actualmodel" /><label>الموديل الفعلى</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_10" type="checkbox" value="ldv_productbarcode" /><label>سيريال1</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_11" type="checkbox" value="ldv_productbarcodeatlsc" /><label>السيريال2</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_12" type="checkbox" value="ldv_resourcelastcomment" /><label>التقرير</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_13" type="checkbox" value="ldv_productbarcodeatlsc" /><label>سيريال محلية</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_14" type="checkbox" value="ldv_scheduledservicestartdate" /><label>تاريخ الحجز</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_15" type="checkbox" value="createdon" /><label>تاريخ انشاء البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_16" type="checkbox" value="ldv_warrantydate" /><label>تارخ الضمان</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_17" type="checkbox" checked value="statuscode" /><label>حالة البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_18" type="checkbox" checked value="new_queue" /><label>قائمة الانتظار</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_19" type="checkbox" checked value="ldv_createdfrom" /><label>جهة الانشاء</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_20" type="checkbox" value="ldv_callcenternotes" /><label>ملاحظات الكول سنتر</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_21" type="checkbox" value="ldv_technicalsupportnotes" /><label>ملاحظات الدعم الفنى</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_22" type="checkbox" value="ldv_planningteamnotes" /><label>ملاحظات التخطيط</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_23" type="checkbox" value="ldv_backofficenotes" /><label>ملاحظات المكتب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_24" type="checkbox" value="ldv_technicalsupportreplacementapproval" /><label>حالة الاستبدال</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_25" type="checkbox" value="ldv_technicalsupportlscapproval" /><label>حالة السحب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_26" type="checkbox" value="ldv_sparepartsshortage" /><label>حالة قطع الغيار BO</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_27" type="checkbox" value="ldv_sparepartsavailability" /><label>حالة قطع الغيار PL</label></td></tr>
</table>

<a id="ContentPlaceHolder1_LinkButton1" href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$LinkButton1','')">ExcelSheet</a>
```

**الحقول الحقيقية:**

| العنصر | ID | النوع |
|--------|-----|-------|
| تاريخ من | `ContentPlaceHolder1_TextBox1` | Date Input |
| تاريخ الى | `ContentPlaceHolder1_TextBox2` | Date Input |
| الحالة | `ContentPlaceHolder1_DropDownList1` | DropDownList |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit Button |
| استخراج اكسل | `ContentPlaceHolder1_Button2` | Submit Button |
| رابط ExcelSheet | `ContentPlaceHolder1_LinkButton1` | LinkButton |

**أعمدة التقرير المتاحة (28 عمود):**

| # | الاسم | القيمة | محدد مسبقاً |
|---|-------|--------|------------|
| 1 | البلاغ | `ticketnumber` | نعم |
| 2 | رقم الساب | `ldv_sapordernumber` | نعم |
| 3 | اسم العميل | `ldv_customername` | نعم |
| 4 | العنوان | `ldv_address` | لا |
| 5 | مشكلة الجهاز | `ldv_problem` | نعم |
| 6 | السنترال | `ldv_centraltelephone` | نعم |
| 7 | المنتج | `ldv_producttype` | نعم |
| 8 | الماركة | `ldv_brand` | لا |
| 9 | الموديل | `ldv_modelnumber` | نعم |
| 10 | الموديل الفعلى | `ldv_actualmodel` | نعم |
| 11 | سيريال1 | `ldv_productbarcode` | لا |
| 12 | السيريال2 | `ldv_productbarcodeatlsc` | لا |
| 13 | التقرير | `ldv_resourcelastcomment` | لا |
| 14 | سيريال محلية | `ldv_productbarcodeatlsc` | لا |
| 15 | تاريخ الحجز | `ldv_scheduledservicestartdate` | لا |
| 16 | تاريخ انشاء البلاغ | `createdon` | لا |
| 17 | تارخ الضمان | `ldv_warrantydate` | لا |
| 18 | حالة البلاغ | `statuscode` | نعم |
| 19 | قائمة الانتظار | `new_queue` | نعم |
| 20 | جهة الانشاء | `ldv_createdfrom` | نعم |
| 21 | ملاحظات الكول سنتر | `ldv_callcenternotes` | لا |
| 22 | ملاحظات الدعم الفنى | `ldv_technicalsupportnotes` | لا |
| 23 | ملاحظات التخطيط | `ldv_planningteamnotes` | لا |
| 24 | ملاحظات المكتب | `ldv_backofficenotes` | لا |
| 25 | حالة الاستبدال | `ldv_technicalsupportreplacementapproval` | لا |
| 26 | حالة السحب | `ldv_technicalsupportlscapproval` | لا |
| 27 | حالة قطع الغيار BO | `ldv_sparepartsshortage` | لا |
| 28 | حالة قطع الغيار PL | `ldv_sparepartsavailability` | لا |

**ملاحظة مهمة:** الصفحة بتبين خطأ `Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist` — ده معناه إن الـ ASCID مش موجود في الجلسة.

---

### 4. inasc.aspx - متوقف احتسابها (الأهم)

**URL:** `/ASPPage/inasc.aspx`

**HTML الفعلي:**
```html
<table class="table table-striped table-hover table-responsive">
    <tr>
        <td colspan="4" style="font-size: large; text-align: center;">
            <span id="ContentPlaceHolder1_Label1">
                Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist
            </span>
        </td>
    </tr>
    <tr>
        <td>من :</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="date" 
                   id="ContentPlaceHolder1_TextBox1" class="datepicker form-control" />
        </td>
        <td>الى :</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox2" type="date" 
                   id="ContentPlaceHolder1_TextBox2" class="datepicker form-control" />
        </td>
    </tr>
    <tr>
        <td>الحالة :</td>
        <td>
            <select name="ctl00$ContentPlaceHolder1$DropDownList1" 
                    id="ContentPlaceHolder1_DropDownList1" class="col-md-9 noPrint">
                <option value="ASC">بلاغات منتظر مراجعتها من المركز</option>
            </select>
        </td>
        <td>&nbsp;</td>
        <td>
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" />
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button2" 
                   value="استخراج الي شيت اكسل" id="ContentPlaceHolder1_Button2" />
        </td>
    </tr>
</table>

<!-- أعمدة التقرير -->
<table id="ContentPlaceHolder1_CheckBoxList1">
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_0" type="checkbox" checked value="ticketnumber" /><label>البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_1" type="checkbox" checked value="ldv_sapordernumber" /><label>رقم الساب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_2" type="checkbox" checked value="ldv_customername" /><label>اسم العميل</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_3" type="checkbox" checked value="ldv_landline" /><label>رقم الارضي</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_4" type="checkbox" value="ldv_address" /><label>العنوان</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_5" type="checkbox" checked value="ldv_problem" /><label>مشكلة الجهاز</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_6" type="checkbox" checked value="ldv_centraltelephone" /><label>السنترال</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_7" type="checkbox" checked value="ldv_producttype" /><label>المنتج</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_8" type="checkbox" value="ldv_brand" /><label>الماركة</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_9" type="checkbox" checked value="ldv_modelnumber" /><label>الموديل</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_10" type="checkbox" checked value="ldv_actualmodel" /><label>الموديل الفعلى</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_11" type="checkbox" value="ldv_productbarcode" /><label>سيريال1</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_12" type="checkbox" value="ldv_productbarcodeatlsc" /><label>السيريال2</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_13" type="checkbox" value="ldv_resourcelastcomment" /><label>التقرير</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_14" type="checkbox" value="ldv_productbarcodeatlsc" /><label>سيريال محلية</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_15" type="checkbox" value="ldv_scheduledservicestartdate" /><label>تاريخ الحجز</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_16" type="checkbox" value="createdon" /><label>تاريخ انشاء البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_17" type="checkbox" value="ldv_warrantydate" /><label>تارخ الضمان</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_18" type="checkbox" checked value="statuscode" /><label>حالة البلاغ</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_19" type="checkbox" checked value="new_queue" /><label>قائمة الانتظار</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_20" type="checkbox" checked value="ldv_createdfrom" /><label>جهة الانشاء</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_21" type="checkbox" value="ldv_callcenternotes" /><label>ملاحظات الكول سنتر</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_22" type="checkbox" value="ldv_technicalsupportnotes" /><label>ملاحظات الدعم الفنى</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_23" type="checkbox" value="ldv_planningteamnotes" /><label>ملاحظات التخطيط</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_24" type="checkbox" value="ldv_backofficenotes" /><label>ملاحظات المكتب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_25" type="checkbox" value="ldv_technicalsupportreplacementapproval" /><label>حالة الاستبدال</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_26" type="checkbox" value="ldv_technicalsupportlscapproval" /><label>حالة السحب</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_27" type="checkbox" value="ldv_sparepartsshortage" /><label>حالة قطع الغيار BO</label></td></tr>
    <tr><td><input id="ContentPlaceHolder1_CheckBoxList1_28" type="checkbox" value="ldv_sparepartsavailability" /><label>حالة قطع الغيار PL</label></td></tr>
</table>

<a id="ContentPlaceHolder1_LinkButton1" href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$LinkButton1','')">ExcelSheet</a>
```

**الفرق عن inprogress.aspx:**

| العنصر | inprogress.aspx | inasc.aspx |
|--------|----------------|------------|
| قيمةDropDownList | `Amal` (بلاغات جاري مراجعتها ماليا من العربى) | `ASC` (بلاغات منتظر مراجعتها من المركز) |
| عمود رقم الارضي | لا يوجد | يوجد (`ldv_landline`) |
| عدد الأعمدة | 28 | 29 |

**المشكلة:** الصفحة بتبين نفس الخطأ — `Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist`

---

### 5. salaryasc2.aspx - مستحقات المراكز

**URL:** `/ASPPage/salaryasc2.aspx`

**HTML الفعلي:**
```html
<div class="col-md-12 data-section printEnhance">
    <div class="col-md-3 data-section-label">
        <i class="fa fa-user"></i>&nbsp; مستحقات مراكز الخدمة
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">اسم المركز : </label>
        <div class="col-md-9">
            <span id="ContentPlaceHolder1_lblnameasc">.</span>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">رقم حساب المركز : </label>
        <div class="col-md-9">
            <span id="ContentPlaceHolder1_lblaccount">.</span>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">السنة : </label>
        <div class="col-md-9">
            <select name="ctl00$ContentPlaceHolder1$DropDownList3" 
                    id="ContentPlaceHolder1_DropDownList3">
                <option selected value="2019">2019</option>
                <option value="2020">2020</option>
                <option value="2021">2021</option>
                <option value="2022">2022</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2030">2030</option>
            </select>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">الشهر : </label>
        <div class="col-md-9">
            <select name="ctl00$ContentPlaceHolder1$DropDownList4" 
                    id="ContentPlaceHolder1_DropDownList4">
                <option value="-01-01 00:00:00.000">يناير</option>
                <option value="-02-01 00:00:00.000">فبراير</option>
                <option value="-03-01 00:00:00.000">مارس</option>
                <option value="-04-01 00:00:00.000">ابريل</option>
                <option value="-05-01 00:00:00.000">مايو</option>
                <option value="-06-01 00:00:00.000">يونيو</option>
                <option value="-07-01 00:00:00.000">يوليو</option>
                <option value="-08-01 00:00:00.000">اغسطس</option>
                <option value="-09-01 00:00:00.000">سبتمبر</option>
                <option value="-10-01 00:00:00.000">اكتوبر</option>
                <option value="-11-01 00:00:00.000">نوفمبر</option>
                <option value="-12-01 00:00:00.000">ديسمبر</option>
            </select>
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <label class="control-label col-md-3">الرقم السرى : </label>
        <div class="col-md-9">
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="password" 
                   id="ContentPlaceHolder1_TextBox1" />
        </div>
    </div>
    
    <div class="form-group col-md-12">
        <div class="col-md-9">
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" />
        </div>
    </div>
</div>

<!-- تفاصيل امر الشغل -->
<div class="col-md-12 data-section printEnhance">
    <div class="col-md-3 data-section-label">
        <i class="fa fa-user"></i>&nbsp; تفاصيل امر الشغل
    </div>
    
    <div id="ContentPlaceHolder1_Panel2" style="height:100%;width:950px;overflow-y:scroll;">
        <input type="submit" name="ctl00$ContentPlaceHolder1$Button2" 
               value="Export To Excel" id="ContentPlaceHolder1_Button2" />
    </div>
</div>
```

**الحقول الحقيقية:**

| العنصر | ID | النوع |
|--------|-----|-------|
| اسم المركز | `ContentPlaceHolder1_lblnameasc` | Span (ثابت) |
| رقم حساب المركز | `ContentPlaceHolder1_lblaccount` | Span (ثابت) |
| السنة | `ContentPlaceHolder1_DropDownList3` | DropDownList (2019-2030) |
| الشهر | `ContentPlaceHolder1_DropDownList4` | DropDownList (12 شهر) |
| الرقم السرى | `ContentPlaceHolder1_TextBox1` | Password Input |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit Button |
| Export To Excel | `ContentPlaceHolder1_Button2` | Submit Button |

**ملاحظة مهمة:** الصفحة دي **مش بتبين خطأ** — يعني شغالة من غير ASCID. ده معناه إنها مش محتاجة ASCID في الـ Session.

---

### 6. accountMovement.aspx - حركات الحساب

**URL:** `/ASPPage/accountMovement.aspx`

**HTML الفعلي:**
```html
<table class="table table-striped table-hover table-responsive">
    <tr>
        <td colspan="4" style="font-size: large; text-align: center; color: #0000FF; font-family: Andalus;">
            رقم حساب المركز :
            <span id="ContentPlaceHolder1_Label1">.</span>
        </td>
    </tr>
    <tr>
        <td colspan="4" style="font-size: large; text-align: center; color: #0000FF; font-family: Andalus;">
            حركة حسابات مركز الخدمة
        </td>
    </tr>
    <tr>
        <td colspan="4">تاريخ انهاء البلاغ :-</td>
    </tr>
    <tr>
        <td style="width: 69px">من :</td>
        <td style="width: 249px">
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="date" 
                   id="ContentPlaceHolder1_TextBox1" />
        </td>
        <td style="width: 48px">كلمة السر</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox3" type="password" 
                   id="ContentPlaceHolder1_TextBox3" />
        </td>
    </tr>
    <tr>
        <td style="height: 34px; width: 69px">الى :</td>
        <td style="height: 34px; width: 249px">
            <input name="ctl00$ContentPlaceHolder1$TextBox2" type="date" 
                   id="ContentPlaceHolder1_TextBox2" />
        </td>
        <td style="height: 34px; width: 48px">
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" />
        </td>
        <td style="height: 34px">&nbsp;</td>
    </tr>
</table>

<div id="ContentPlaceHolder1_Panel1" style="height:100%;width:950px;overflow-y:scroll;">
    <a id="ContentPlaceHolder1_LinkButton1" 
       href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$LinkButton1','')">Extract All Data</a>
    <br />
    التقـــــــــــــــــــــــــرير<br />
</div>
```

**الحقول الحقيقية:**

| العنصر | ID | النوع |
|--------|-----|-------|
| رقم حساب المركز | `ContentPlaceHolder1_Label1` | Span (ثابت) |
| تاريخ من | `ContentPlaceHolder1_TextBox1` | Date Input |
| تاريخ الى | `ContentPlaceHolder1_TextBox2` | Date Input |
| كلمة السر | `ContentPlaceHolder1_TextBox3` | Password Input |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit Button |
| Extract All Data | `ContentPlaceHolder1_LinkButton1` | LinkButton |

---

### 7. billingneeded.aspx - الفواتير المطلوبة

**URL:** `/ASPPage/billingneeded.aspx`

**HTML الفعلي:**
```html
<table class="table table-striped table-hover table-responsive">
    <tr>
        <td colspan="4" style="font-size: large; text-align: center; color: #0000FF; font-family: Andalus;">
            رقم حساب المركز :
            <span id="ContentPlaceHolder1_Label1">.</span>
        </td>
    </tr>
    <tr>
        <td colspan="4" style="font-size: large; text-align: center; color: #0000FF; font-family: Andalus;">
            الفواتير المطلوبة
        </td>
    </tr>
    <tr>
        <td colspan="4">تاريخ انهاء البلاغ :-</td>
    </tr>
    <tr>
        <td style="width: 69px">من :</td>
        <td style="width: 249px">
            <input name="ctl00$ContentPlaceHolder1$TextBox1" type="date" 
                   id="ContentPlaceHolder1_TextBox1" />
        </td>
        <td style="width: 48px">الى :</td>
        <td>
            <input name="ctl00$ContentPlaceHolder1$TextBox2" type="date" 
                   id="ContentPlaceHolder1_TextBox2" />
        </td>
    </tr>
    <tr>
        <td style="height: 34px; width: 69px">الرقم السرى :</td>
        <td style="height: 34px; width: 249px">
            <input name="ctl00$ContentPlaceHolder1$TextBox3" type="password" 
                   id="ContentPlaceHolder1_TextBox3" />
        </td>
        <td style="height: 34px; width: 48px">&nbsp;</td>
        <td style="height: 34px">
            <input type="submit" name="ctl00$ContentPlaceHolder1$Button1" 
                   value="بحث" id="ContentPlaceHolder1_Button1" />
        </td>
    </tr>
</table>

<div id="ContentPlaceHolder1_Panel1" style="height:100%;width:950px;overflow-y:scroll;">
    <a id="ContentPlaceHolder1_LinkButton1" 
       href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$LinkButton1','')">Extract All Data</a>
    <br />
    التقـــــــــــــــــــــــــرير<br />
</div>
```

**الحقول الحقيقية:**

| العنصر | ID | النوع |
|--------|-----|-------|
| رقم حساب المركز | `ContentPlaceHolder1_Label1` | Span (ثابت) |
| تاريخ من | `ContentPlaceHolder1_TextBox1` | Date Input |
| تاريخ الى | `ContentPlaceHolder1_TextBox2` | Date Input |
| الرقم السرى | `ContentPlaceHolder1_TextBox3` | Password Input |
| زر بحث | `ContentPlaceHolder1_Button1` | Submit Button |
| Extract All Data | `ContentPlaceHolder1_LinkButton1` | LinkButton |

**ملاحظة:** الصفحة دي بتستخدم **"الرقم السرى"** بدلاً من **"كلمة السر"** المستخدمة في accountMovement.aspx

---

## مقارنة بين الصفحات

### أنماط الحقول

| الصفحة | حقول التاريخ | كلمة السر | زر بحث | Extract | أعمدة |
|--------|-------------|-----------|--------|---------|-------|
| AutoBuildWR | لا يوجد | لا يوجد | نعم | لا | لا يوجد |
| inprogress | من/الى (date) | لا يوجد | نعم | استخراج اكسل | 28 عمود |
| inasc | من/الى (date) | لا يوجد | نعم | استخراج اكسل | 29 عمود |
| salaryasc2 | سنة/شهر (dropdown) | الرقم السرى | نعم | Export To Excel | لا يوجد |
| accountMovement | من/الى (date) | كلمة السر | نعم | Extract All Data | لا يوجد |
| billingneeded | من/الى (date) | الرقم السرى | نعم | Extract All Data | لا يوجد |

### أخطاء الـ Entity

| الصفحة | تباني الخطأ |
|--------|------------|
| inprogress.aspx | نعم - `Entity 'account' With Id = 00000000...` |
| inasc.aspx | نعم - نفس الخطأ |
| salaryasc2.aspx | لا - شغالة عادي |
| accountMovement.aspx | لا - شغالة (بس محتاجة كلمة سر) |
| billingneeded.aspx | لا - شغالة (بس محتاجة الرقم السرى) |
| AutoBuildWR.aspx | لا - شغالة |

---

## أكبر المشاكل الحقيقية

### 1. مشكلة ASCID في inprogress و inasc

الصفحتين بتبينوا:
```
Entity 'account' With Id = 00000000-0000-0000-0000-000000000000 Does Not Exist
```

ده معناه:
- الـ **ASCID** (رقم حساب المركز) مش موجود في الجلسة
- الكود بينادي `GetascfromAccount()` بـ **GUID فاضي**
- مفيش **validation** قبل الاستدعاء

### 2. كلمات السر المتعددة

| الصفحة | اسم الحقل | القيمة المطلوبة |
|--------|-----------|----------------|
| salaryasc2.aspx | `ContentPlaceHolder1_TextBox1` | "الرقم السرى" |
| accountMovement.aspx | `ContentPlaceHolder1_TextBox3` | "كلمة السر" |
| billingneeded.aspx | `ContentPlaceHolder1_TextBox3` | "الرقم السرى" |

### 3. لا توجد أتمتة

كل الصفحات **يدوية بالكامل** — مفيش أي أتمتة لأي صفحة.

### 4. التنقل البطيء

كل صفحة بتستخدم `__doPostBack` — يعني PostBack كامل للسيرفر مع كل نقرة.

---

## فرص الأتمتة

### بناءً على الـ IDs الحقيقية:

**1. ملء تواريخ البحث تلقائياً:**
```javascript
// مثال لـ accountMovement.aspx
document.getElementById('ContentPlaceHolder1_TextBox1').value = '2026-01-01';
document.getElementById('ContentPlaceHolder1_TextBox2').value = '2026-06-24';
```

**2. إدخال كلمات السر تلقائياً:**
```javascript
// مثال لـ salaryasc2.aspx
document.getElementById('ContentPlaceHolder1_TextBox1').value = 'الرقم السري';
```

**3. الضغط على زر البحث:**
```javascript
// مثال لـ accountMovement.aspx
document.getElementById('ContentPlaceHolder1_Button1').click();
```

**4. استخراج البيانات:**
```javascript
// مثال لـ accountMovement.aspx
document.getElementById('ContentPlaceHolder1_LinkButton1').click();
```

**5. اختيار أعمدة التقرير:**
```javascript
// مثال لـ inprogress.aspx - تحديد كل الأعمدة
for (let i = 0; i <= 27; i++) {
    document.getElementById(`ContentPlaceHolder1_CheckBoxList1_${i}`).checked = true;
}
```

---

## خريطة URLs كاملة

| الصفحة | URL | الحالة |
|--------|-----|--------|
| القائمة الرئيسية | `/ASPPage/guid.aspx` | تحتاج تسجيل دخول |
| النواحي المالية | `/ASPPage/MainMoney.aspx` | شغالة |
| اصدار فاتورة | `/ASPPage/AutoBuildWR.aspx` | شغالة |
| جاري مراجعتها | `/ASPPage/inprogress.aspx` | خطأ ASCID |
| متوقف احتسابها | `/ASPPage/inasc.aspx` | خطأ ASCID |
| مستحقات المراكز | `/ASPPage/salaryasc2.aspx` | شغالة |
| حركات الحساب | `/ASPPage/accountMovement.aspx` | شغالة |
| الفواتير المطلوبة | `/ASPPage/billingneeded.aspx` | شغالة |
| طلبات المدفوعات | `/ASPPage/Fawry.aspx` | خطأ ASCID |
| ايصالات المدفوعات | `/ASPPage/FinancialReceipt.aspx` | خطأ ASCID |

---

## أداة الأتمتة (Console Script)

تم إنشاء سكريبت JavaScript لأتمتة كل الصفحات المالية. الملف: `portal_automation.js`

### طريقة الاستخدام:
1. افتح بوابة العربي CRM وسجل دخول
2. افتح Console المتصفح (F12 → Console)
3. انسخ محتوى `portal_automation.js` والصقه في Console
4. اكتب: `startFinancialAutomation()`

### الدوال المتاحة:

| الدالة | الوظيفة |
|--------|---------|
| `startFinancialAutomation()` | القائمة الرئيسية (تختار العملية) |
| `analyzeCurrentPage()` | تحليل الصفحة الحالية |
| `analyzeAllPages()` | تحليل كل الصفحات |
| `searchAllPages()` | بحث تلقائي في كل الصفحات |
| `compareCRMvsSAP()` | مقارنة حركات CRM مع SAP |
| `extractTableData()` | استخراج بيانات الجدول |
| `exportToExcel(data, filename)` | تصدير لـ Excel |

### إعدادات الكلمة السر:

الكلمة السر مخزنة في السكريبت:
```javascript
CONFIG.PASSWORD = '4000086735'
```

**ملاحظة أمنية:** لا تشارك كلمة السر مع أي شخص. الكلمة السر بتتغير بشكل دوري.

---

## ملخص المشاكل والأولويات

### المشاكل الحرجة (ต้อง إصلاح فوراً):

1. **خطأ ASCID في inprogress.aspx و inasc.aspx** — الصفحات مش شغالة بسبب GUID فاضي
2. **خطأ ASCID في Fawry.aspx و FinancialReceipt.aspx** — صفحات الدفع مش شغالة
3. **لا توجد أتمتة** — كل العمليات يدوية

### المشاكل المتوسطة:

4. **كلمات السر المتعددة** — كل صفحة لها كلمة سر مختلفة
5. **التنقل البطيء** — كل صفحة بتستخدم PostBack كامل
6. **لا يوجد Dashboard** — مفيش صفحة بتوضح كل الحالات

### الحلول المقترحة:

1. **إصلاح مشكلة ASCID** — إضافة validation قبل `GetascfromAccount()`
2. **بناء Dashboard موحد** — صفحة توضح كل البلاغات في كل مرحلة
3. **أتمتة الصفحات المالية** — استخدام `portal_automation.js`
4. **توحيد كلمات السر** — كلمة سر واحدة لكل الصفحات
