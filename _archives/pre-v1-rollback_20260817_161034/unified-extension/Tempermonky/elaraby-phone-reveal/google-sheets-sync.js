/**
 * 🚀 كود Google Apps Script لربط بورتال العربي بجدول بيانات Google Sheets تلقائياً.
 * 
 * هذا الملف تم حفظه في جهازك كنسخة احتياطية آمنة وغير قابلة للتعديل من البورتال.
 * 
 * طريقة العمل:
 * 1. يستقبل طلبات POST من سكريبت Tampermonkey محملة ببيانات العميل (الاسم، العنوان، التليفونات، SAP، إلخ).
 * 2. يتحقق إذا كان رقم الطلب (CAS) موجوداً مسبقاً في الشيت ليقوم بتحديثه (تحديث النواقص مثل الأرقام أو SAP).
 * 3. إذا كان البلاغ جديداً، يقوم بإضافته في سطر جديد بالكامل مع تسجيل وقت الإضافة.
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 1️⃣ إعداد العناوين وتنسيق الشيت تلقائياً إذا كان فارغاً تماماً
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "رقم الطلب (CAS)", 
        "الاسم", 
        "رقم الموبايل 1", 
        "رقم الموبايل 2", 
        "رقم SAP", 
        "العنوان (السنترال)", 
        "نوع المنتج", 
        "نوع الخدمة", 
        "تاريخ البلاغ", 
        "تاريخ الإضافة للدليل"
      ]);
      
      // تنسيق احترافي للصف الأول (العناوين) باللون الأزرق العربي الرسمي
      sheet.getRange(1, 1, 1, 10)
           .setBackground("#005A9C")
           .setFontColor("#ffffff")
           .setFontWeight("bold")
           .setHorizontalAlignment("center");
           
      sheet.setFrozenRows(1); // تثبيت الصف الأول
    }
    
    // 2️⃣ استقبال وقراءة البيانات المرسلة من السكريبت
    var data = JSON.parse(e.postData.contents);
    var orderNo = data.orderNo || "";
    var name = data.name || "";
    var phone = data.phone || "";
    var phone2 = data.phone2 || "";
    var sap = data.sap || "";
    var address = data.address || "";
    var type = data.type || "";
    var service = data.service || "";
    var date = data.date || "";
    var timestamp = new Date();
    
    // إذا لم يكن هناك اسم ولا هواتف ولا SAP، نتجاهل الطلب
    if (!name && !phone && !phone2 && !sap) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ignored",
        message: "No relevant data provided."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var rows = sheet.getDataRange().getValues();
    var foundIndex = -1;
    
    // 3️⃣ البحث عن رقم الطلب (CAS) لتحديثه وتجنب التكرار
    if (orderNo) {
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === orderNo) {
          foundIndex = i + 1; // +1 لأن الترقيم في الجداول يبدأ من 1
          break;
        }
      }
    }
    
    if (foundIndex !== -1) {
      // 🔄 تحديث الصف الحالي بالبيانات المكتشفة حديثاً دون مسح البيانات القديمة
      var existingRow = rows[foundIndex - 1];
      
      var updatedName = name || existingRow[1];
      var updatedPhone = phone || existingRow[2];
      var updatedPhone2 = phone2 || existingRow[3];
      var updatedSap = sap || existingRow[4];
      var updatedAddress = address || existingRow[5];
      var updatedType = type || existingRow[6];
      var updatedService = service || existingRow[7];
      var updatedDate = date || existingRow[8];
      
      sheet.getRange(foundIndex, 1, 1, 9).setValues([[
        orderNo, 
        updatedName, 
        updatedPhone, 
        updatedPhone2, 
        updatedSap, 
        updatedAddress, 
        updatedType, 
        updatedService, 
        updatedDate
      ]]);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "updated", 
        message: "Successfully updated record for CAS: " + orderNo
      })).setMimeType(ContentService.MimeType.JSON);
      
    } else {
      // ➕ إضافة صف جديد بالكامل للبلاغ المكتشف حديثاً
      sheet.appendRow([
        orderNo,
        name,
        phone,
        phone2,
        sap,
        address,
        type,
        service,
        date,
        timestamp
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "added", 
        message: "Successfully added new record for CAS: " + orderNo
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error", 
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// دالة اختبارية للتأكد من عمل الرابط عند فتحه في المتصفح مباشرة
function doGet(e) {
  return ContentService.createTextOutput("🚀 كشف أرقام الهواتف - بوابة العربي: اتصال Google Sheets يعمل بنجاح! جاهز لاستلام البيانات.");
}
