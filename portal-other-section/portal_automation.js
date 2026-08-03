/**
 * =====================================================
 * بوابة العربي CRM - أتمتة الصفحات المالية
 * =====================================================
 * 
 * طريقة الاستخدام:
 * 1. افتح بوابة العربي CRM وسجل دخول
 * 2. افتح Console المتصفح (F12 → Console)
 * 3. انسخ الكود ده والصقه في Console
 * 4. اكتب: startFinancialAutomation()
 * 
 * ملاحظة مهمة:
 * السكريبت ده بيشتغل من داخل البروتال عن طريق الضغط على الروابط
 * من المنيو (PostBack) — مش بيدخل على URLs مباشرة
 * عشان كده لازم تفتح البروتال تسجل دخول الأول
 */

// ==================== الإعدادات ====================
const CONFIG = {
    // كلمة السر للمالية — يرجى الإدخال يدوياً عند التشغيل
    PASSWORD: '',
    
    // تاريخ البداية والنهاية (افتراضي: آخر 30 يوم)
    DATE_FROM: getDateStr(-30),
    DATE_TO: getDateStr(0),
    
    // روابط الصفحات في المنيو (LinkButton IDs)
    MENU_LINKS: {
        // الصفحة الرئيسية للنواحي المالية
        // ملاحظة: "النواحى المالية" في المنيو العلوي مش LinkButton
        // استخدم findLinkByText('النواحى المالية') للتنقل للصفحة الرئيسية
        mainMoney: null,
        
        // الصفحات المالية (داخل MainMoney.aspx)
        autoBuildWR: 'LinkButton7',      // اصدار فاتورة
        inprogress: 'LinkButton1',        // جاري مراجعتها
        inasc: 'LinkButton2',             // متوقف احتسابها
        salaryasc2: 'LinkButton5',        // مستحقات المراكز
        salaryASC: 'LinkButton8',         // Call-Center خارج الضمان
        mscreport: 'LinkButton9',         // حوافز الفنيين
        accountMovementSAP: 'LinkButton3', // حركات الحسابSAP
        accountMovement: 'LinkButton4',   // حركات الحساب
        billingneeded: 'LinkButton6',     // الفواتير المطلوبة
        fawry: 'LinkButton10',            // طلبات المدفوعات
        financialReceipt: 'LinkButton12'  // ايصالات المدفوعات
    },
    
    // الصفحات اللي محتاجة كلمة سر
    PAGES_WITH_PASSWORD: ['salaryasc2', 'salaryASC', 'mscreport', 'accountMovementSAP', 'accountMovement', 'billingneeded'],
    
    // الصفحات اللي مش محتاجة كلمة سر
    PAGES_WITHOUT_PASSWORD: ['autoBuildWR', 'inprogress', 'inasc'],
    
    // ألوان الـ Console
    COLORS: {
        success: '#00ff00',
        error: '#ff0000',
        warning: '#ffaa00',
        info: '#00aaff',
        header: '#ff6600'
    }
};

// ==================== دوال مساعدة ====================

function getDateStr(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
}

function log(message, color = CONFIG.COLORS.info) {
    console.log(`%c${message}`, `color: ${color}; font-weight: bold; font-size: 14px;`);
}

function logError(message) {
    console.error(`❌ ${message}`);
}

function logSuccess(message) {
    console.log(`%c✅ ${message}`, `color: ${CONFIG.COLORS.success}; font-weight: bold;`);
}

function logWarning(message) {
    console.warn(`⚠️ ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== التنقل عبر المنيو (PostBack) ====================

/**
 * الضغط على رابط في المنيو عن طريق __doPostBack
 * ده الطريقة الصحيحة للتنقل في البروتال
 */
function clickMenuLink(linkId, openInNewTab = false) {
    log(`🔗 الضغط على الرابط: ${linkId}...`);
    
    // البحث عن الرابط
    const link = document.getElementById(linkId);
    
    if (link) {
        logSuccess(`تم العثور على الرابط: ${link.textContent.trim()}`);
        
        if (openInNewTab) {
            // فتح في تاب جديد
            const newTab = window.open('', '_blank');
            
            // نسخ الفورم
            const form = document.querySelector('form');
            if (form && newTab) {
                // إنشاء HTML كامل في التاب الجديد
                newTab.document.write(`
                    <html>
                    <head><title>جاري التحميل...</title></head>
                    <body>
                        <h2>جاري فتح الصفحة في التاب الأصلي...</h2>
                        <p>إذا لم تفتح الصفحة تلقائياً، اضغط على الزر:</p>
                        <button id="manualOpen">فتح الصفحة يدوياً</button>
                        <script>
                            document.getElementById('manualOpen').onclick = function() {
                                window.close();
                            };
                        </script>
                    </body>
                    </html>
                `);
                newTab.document.close();
            }
            
            // الضغط على الرابط في الصفحة الأصلية
            link.click();
            
            logSuccess('تم الضغط على الرابط (سيفتح في تاب جديد)');
            return true;
        }
        
        // الضغط على الرابط في نفس الصفحة
        link.click();
        
        logSuccess('تم الضغط على الرابط بنجاح');
        return true;
    }
    
    // بديل: البحث عن أي رابط فيه النص
    logWarning(`لم يتم العثور على الرابط ${linkId}، جارٍ البحث عن روابط مشابهة...`);
    
    const allLinks = document.querySelectorAll('a[href*="doPostBack"]');
    let found = false;
    
    allLinks.forEach(a => {
        if (a.id.includes(linkId) || a.textContent.trim().includes(linkId)) {
            logSuccess(`تم العثور على رابط مشابه: ${a.textContent.trim()}`);
            
            if (openInNewTab) {
                // فتح في تاب جديد
                a.target = '_blank';
            }
            
            a.click();
            found = true;
        }
    });
    
    if (!found) {
        logError(`لم يتم العثور على أي رابط بـ ID: ${linkId}`);
        log('الروابط المتاحة:', CONFIG.COLORS.info);
        console.table(Array.from(allLinks).map(a => ({
            id: a.id,
            text: a.textContent.trim(),
            href: a.href
        })));
    }
    
    return found;
}

/**
 * البحث عن رابط بنص محدد
 */
function findLinkByText(text) {
    const allLinks = document.querySelectorAll('a[href*="doPostBack"], a.sameframe');
    
    for (const link of allLinks) {
        if (link.textContent.trim().includes(text)) {
            return link;
        }
    }
    
    return null;
}

/**
 * الضغط على رابط بنص محدد
 */
function clickLinkByText(text) {
    log(`🔗 البحث عن رابط فيه: "${text}"...`);
    
    const link = findLinkByText(text);
    
    if (link) {
        logSuccess(`تم العثور على: ${link.textContent.trim()}`);
        link.click();
        return true;
    }
    
    logError(`لم يتم العثور على رابط فيه: "${text}"`);
    return false;
}

// ==================== تحليل الصفحة ====================

function analyzeCurrentPage() {
    log('🔍 تحليل الصفحة الحالية...', CONFIG.COLORS.header);
    
    const analysis = {
        url: window.location.href,
        title: document.title,
        form: null,
        inputs: [],
        buttons: [],
        links: [],
        selects: [],
        dateInputs: [],
        passwordInputs: [],
        errorMessages: []
    };
    
    // تحليل الفورم
    const form = document.querySelector('form');
    if (form) {
        analysis.form = {
            action: form.action,
            method: form.method,
            id: form.id
        };
    }
    
    // تحليل كل الحقول
    document.querySelectorAll('input').forEach(input => {
        const info = {
            id: input.id,
            name: input.name,
            type: input.type,
            value: input.value,
            placeholder: input.placeholder
        };
        
        analysis.inputs.push(info);
        
        if (input.type === 'date') {
            analysis.dateInputs.push(info);
        }
        if (input.type === 'password') {
            analysis.passwordInputs.push(info);
        }
    });
    
    // تحليل الأزرار
    document.querySelectorAll('input[type="submit"], button[type="submit"]').forEach(btn => {
        analysis.buttons.push({
            id: btn.id,
            name: btn.name,
            value: btn.value || btn.textContent,
            type: btn.type
        });
    });
    
    // تحليل القوائم المنسدلة
    document.querySelectorAll('select').forEach(select => {
        const options = [];
        select.querySelectorAll('option').forEach(opt => {
            options.push({
                value: opt.value,
                text: opt.textContent,
                selected: opt.selected
            });
        });
        
        analysis.selects.push({
            id: select.id,
            name: select.name,
            options: options
        });
    });
    
    // تحليل الروابط
    document.querySelectorAll('a[href*="doPostBack"]').forEach(link => {
        analysis.links.push({
            id: link.id,
            text: link.textContent.trim(),
            href: link.href
        });
    });
    
    // تحليل أخطاء الـ Entity
    document.querySelectorAll('span').forEach(span => {
        if (span.textContent.includes('Entity') && span.textContent.includes('Does Not Exist')) {
            analysis.errorMessages.push(span.textContent.trim());
        }
    });
    
    // طباعة التحليل
    log('📊 نتائج التحليل:', CONFIG.COLORS.info);
    
    if (analysis.inputs.filter(i => i.type !== 'hidden').length > 0) {
        console.table(analysis.inputs.filter(i => i.type !== 'hidden'));
    }
    
    if (analysis.buttons.length > 0) {
        console.table(analysis.buttons);
    }
    
    if (analysis.selects.length > 0) {
        console.table(analysis.selects.map(s => ({ id: s.id, name: s.name, optionsCount: s.options.length })));
    }
    
    if (analysis.dateInputs.length > 0) {
        logSuccess(`تاريخ من: ${analysis.dateInputs[0]?.id}`);
        if (analysis.dateInputs[1]) {
            logSuccess(`تاريخ الى: ${analysis.dateInputs[1]?.id}`);
        }
    }
    
    if (analysis.passwordInputs.length > 0) {
        logSuccess(`كلمة السر: ${analysis.passwordInputs[0]?.id}`);
    }
    
    if (analysis.errorMessages.length > 0) {
        logError(`خطأ الـ Entity: ${analysis.errorMessages[0]}`);
    }
    
    if (analysis.links.length > 0) {
        log('الروابط المالية المتاحة:', CONFIG.COLORS.info);
        console.table(analysis.links);
    }
    
    return analysis;
}

// ==================== ملء حقول التاريخ ====================

function fillDateFields(fromDate, toDate) {
    log(`📅 ملء حقول التاريخ: ${fromDate} إلى ${toDate}`);
    
    const dateInputs = document.querySelectorAll('input[type="date"]');
    
    if (dateInputs.length >= 2) {
        // حقل التاريخ من
        const fromInput = dateInputs[0];
        fromInput.value = fromDate;
        fromInput.dispatchEvent(new Event('input', { bubbles: true }));
        fromInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // حقل التاريخ الى
        const toInput = dateInputs[1];
        toInput.value = toDate;
        toInput.dispatchEvent(new Event('input', { bubbles: true }));
        toInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        logSuccess('تم ملء حقول التاريخ بنجاح');
        return true;
    }
    
    logWarning('لم يتم العثور على حقول تاريخ');
    return false;
}

// ==================== إدخال كلمة السر ====================

function fillPassword(password) {
    log('🔑 إدخال كلمة السر...');
    
    const passwordInput = document.querySelector('input[type="password"]');
    
    if (passwordInput) {
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        logSuccess('تم إدخال كلمة السر بنجاح');
        return true;
    }
    
    logWarning('لم يتم العثور على حقل كلمة السر');
    return false;
}

// ==================== الضغط على زر البحث ====================

function clickSearchButton() {
    log('🔍 الضغط على زر البحث...');
    
    // البحث عن زر بحث
    const buttons = document.querySelectorAll('input[type="submit"]');
    let searchBtn = null;
    
    buttons.forEach(btn => {
        if (btn.value === 'بحث' || btn.value.includes('بحث')) {
            searchBtn = btn;
        }
    });
    
    if (searchBtn) {
        searchBtn.click();
        logSuccess('تم الضغط على زر البحث');
        return true;
    }
    
    logWarning('لم يتم العثور على زر البحث');
    return false;
}

// ==================== استخراج البيانات ====================

function extractTableData() {
    log('📊 استخراج بيانات الجدول...');
    
    const tables = document.querySelectorAll('table.table');
    const data = [];
    
    tables.forEach((table, tableIndex) => {
        const headers = [];
        const rows = [];
        
        // استخراج العناوين
        table.querySelectorAll('th').forEach(th => {
            headers.push(th.textContent.trim());
        });
        
        // استخراج الصفوف
        table.querySelectorAll('tr').forEach((tr, rowIndex) => {
            if (rowIndex === 0 && headers.length > 0) return; // تخطي صف العناوين
            
            const row = {};
            tr.querySelectorAll('td').forEach((td, colIndex) => {
                const key = headers[colIndex] || `Column_${colIndex}`;
                row[key] = td.textContent.trim();
            });
            
            if (Object.keys(row).length > 0) {
                rows.push(row);
            }
        });
        
        if (rows.length > 0) {
            data.push({
                tableIndex: tableIndex,
                headers: headers,
                rows: rows,
                rowCount: rows.length
            });
        }
    });
    
    if (data.length > 0) {
        logSuccess(`تم استخراج ${data.length} جدول`);
        data.forEach(d => {
            log(`جدول ${d.tableIndex}: ${d.rowCount} صف`, CONFIG.COLORS.info);
            console.table(d.rows.slice(0, 5)); // عرض أول 5 صفوف
        });
    } else {
        logWarning('لم يتم العثور على بيانات في الجداول');
    }
    
    return data;
}

// ==================== تصدير البيانات لـ Excel ====================

function exportToExcel(data, filename) {
    log('📥 تصدير البيانات لـ Excel...');
    
    if (!data || data.length === 0) {
        logWarning('لا توجد بيانات للتصدير');
        return;
    }
    
    // إنشاء محتوى CSV
    let csvContent = '';
    
    data.forEach(table => {
        // إضافة العناوين
        csvContent += table.headers.join(',') + '\n';
        
        // إضافة الصفوف
        table.rows.forEach(row => {
            const values = table.headers.map(header => {
                const value = row[header] || '';
                // تغليف القيم اللي فيها فواصل
                return `"${value.replace(/"/g, '""')}"`;
            });
            csvContent += values.join(',') + '\n';
        });
        
        csvContent += '\n';
    });
    
    // إنشاء ملف وتحميله
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || `export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    logSuccess('تم التصدير بنجاح');
}

// ==================== الانتقال لصفحة مالية ====================

/**
 * الانتقال لصفحة مالية عن طريق الضغط على الرابط في المنيو
 * بدل ما ندخل على URL مباشرة
 */
async function navigateToFinancialPage(pageName, openInNewTab = false) {
    log(`🚀 الانتقال لصفحة: ${pageName}...`, CONFIG.COLORS.header);
    
    const linkId = CONFIG.MENU_LINKS[pageName];
    
    // Handle null entries (e.g., mainMoney which is in the top nav, not the sub-menu)
    if (!linkId) {
        log(`البحث عن "${pageName}" بالنص في المنيو...`);
        const textMap = { mainMoney: 'النواحى المالية' };
        const searchText = textMap[pageName];
        if (searchText) {
            const navLink = findLinkByText(searchText);
            if (navLink) {
                navLink.click();
                await delay(3000);
                logSuccess(`تم الانتقال لصفحة ${pageName}`);
                return true;
            }
        }
        logError(`لم يتم العثور على رابط للصفحة: ${pageName}`);
        return false;
    }
    
    // الضغط على الرابط
    const success = clickMenuLink(linkId, openInNewTab);
    
    if (success) {
        // انتظار تحميل الصفحة
        await delay(3000);
        logSuccess(`تم الانتقال لصفحة ${pageName}`);
        return true;
    }
    
    return false;
}

/**
 * فتح صفحة مالية في تاب جديد
 * بدل ما ن navigate من الصفحة الحالية
 */
async function openPageInNewTab(pageName) {
    log(`🆕 فتح صفحة ${pageName} في تاب جديد...`, CONFIG.COLORS.header);
    
    const linkId = CONFIG.MENU_LINKS[pageName];
    
    if (!linkId) {
        logError(`لم يتم العثور على رابط للصفحة: ${pageName}`);
        return false;
    }
    
    // البحث عن الرابط
    const link = document.getElementById(linkId);
    
    if (!link) {
        logError(`لم يتم العثور على الرابط: ${linkId}`);
        return false;
    }
    
    // نسخ الرابط وفتحه في تاب جديد
    const newLink = link.cloneNode(true);
    newLink.id = link.id + '_newtab';
    newLink.target = '_blank';
    newLink.style.display = 'none';
    document.body.appendChild(newLink);
    newLink.click();
    document.body.removeChild(newLink);
    
    logSuccess(`تم فتح صفحة ${pageName} في تاب جديد`);
    return true;
}

// ==================== بحث تلقائي في صفحة ====================

async function autoSearchPage(pageName, options = {}) {
    const {
        fromDate = CONFIG.DATE_FROM,
        toDate = CONFIG.DATE_TO,
        password = CONFIG.PASSWORD,
        exportData = true,
        openInNewTab = false
    } = options;
    
    log(`\n${'='.repeat(50)}`, CONFIG.COLORS.header);
    log(`🚀 بدء البحث التلقائي في ${pageName}...`, CONFIG.COLORS.header);
    log('='.repeat(50), CONFIG.COLORS.header);
    
    // الانتقال للصفحة
    const navigated = await navigateToFinancialPage(pageName, openInNewTab);
    
    if (!navigated) {
        logError(`فشل الانتقال لصفحة ${pageName}`);
        return false;
    }
    
    // تحليل الصفحة
    const analysis = analyzeCurrentPage();
    
    // ملء حقول التاريخ
    if (analysis.dateInputs.length >= 2) {
        fillDateFields(fromDate, toDate);
    }
    
    // إدخال كلمة السر
    if (analysis.passwordInputs.length > 0 && CONFIG.PAGES_WITH_PASSWORD.includes(pageName)) {
        fillPassword(password);
    }
    
    // الضغط على زر البحث
    await delay(500);
    clickSearchButton();
    
    // انتظار النتائج
    await delay(3000);
    
    // استخراج البيانات
    if (exportData) {
        const data = extractTableData();
        if (data.length > 0) {
            exportToExcel(data, `${pageName}_${new Date().toISOString().split('T')[0]}.csv`);
        }
    }
    
    logSuccess(`تم الانتهاء من البحث في ${pageName}`);
    return true;
}

// ==================== بحث تلقائي في كل الصفحات ====================

async function searchAllPages() {
    log('🚀 بدء البحث التلقائي في كل الصفحات...', CONFIG.COLORS.header);
    
    const pages = [
        'billingneeded',
        'autoBuildWR',
        'inprogress',
        'inasc',
        'salaryasc2',
        'accountMovement',
        'accountMovementSAP'
    ];
    
    for (const page of pages) {
        try {
            await autoSearchPage(page, { exportData: true });
            await delay(2000);
        } catch (error) {
            logError(`خطأ في الصفحة ${page}: ${error.message}`);
        }
    }
    
    logSuccess('تم الانتهاء من البحث في كل الصفحات');
}

// ==================== مقارنة CRM مع SAP ====================

async function compareCRMvsSAP() {
    log('🔄 مقارنة حركات CRM مع SAP...', CONFIG.COLORS.header);
    
    // استخراج بيانات CRM
    await navigateToFinancialPage('accountMovement');
    fillDateFields(CONFIG.DATE_FROM, CONFIG.DATE_TO);
    fillPassword(CONFIG.PASSWORD);
    await delay(500);
    clickSearchButton();
    await delay(3000);
    
    const crmData = extractTableData();
    
    // استخراج بيانات SAP
    await navigateToFinancialPage('accountMovementSAP');
    fillDateFields(CONFIG.DATE_FROM, CONFIG.DATE_TO);
    fillPassword(CONFIG.PASSWORD);
    await delay(500);
    clickSearchButton();
    await delay(3000);
    
    const sapData = extractTableData();
    
    // المقارنة
    log('📊 نتائج المقارنة:', CONFIG.COLORS.info);
    log(`بيانات CRM: ${crmData.length > 0 ? crmData[0].rowCount : 0} صف`);
    log(`بيانات SAP: ${sapData.length > 0 ? sapData[0].rowCount : 0} صف`);
    
    // تصدير النتائج
    const comparisonData = [
        {
            headers: ['النوع', 'العدد'],
            rows: [
                { 'النوع': 'حركات CRM', 'العدد': crmData.length > 0 ? crmData[0].rowCount : 0 },
                { 'النوع': 'حركات SAP', 'العدد': sapData.length > 0 ? sapData[0].rowCount : 0 }
            ]
        }
    ];
    
    exportToExcel(comparisonData, `CRM_vs_SAP_${new Date().toISOString().split('T')[0]}.csv`);
    
    return { crm: crmData, sap: sapData };
}

// ==================== تحليل شامل لكل الصفحات ====================

async function analyzeAllPages() {
    log('🔍 بدء التحليل الشامل لكل الصفحات...', CONFIG.COLORS.header);
    
    const results = {};
    
    for (const [pageName, linkId] of Object.entries(CONFIG.MENU_LINKS)) {
        if (!linkId) {
            log(`\n📄 تخطي ${pageName} — لا يوجد LinkButton ID (يُستخدم findLinkByText)`, CONFIG.COLORS.warning);
            continue;
        }
        try {
            log(`\n📄 تحليل ${pageName}...`, CONFIG.COLORS.header);
            
            await navigateToFinancialPage(pageName);
            
            results[pageName] = analyzeCurrentPage();
            
        } catch (error) {
            logError(`خطأ في تحليل ${pageName}: ${error.message}`);
            results[pageName] = { error: error.message };
        }
    }
    
    // طباعة ملخص التحليل
    log('\n📊 ملخص التحليل الشامل:', CONFIG.COLORS.header);
    console.table(Object.entries(results).map(([name, data]) => ({
        'اسم الصفحة': name,
        'الحالة': data.error ? '❌ خطأ' : '✅ شغالة',
        'حقول التاريخ': data.dateInputs?.length || 0,
        'حقول كلمة السر': data.passwordInputs?.length || 0,
        'الأزرار': data.buttons?.length || 0,
        'القوائم': data.selects?.length || 0,
        'الروابط': data.links?.length || 0,
        'الأخطاء': data.errorMessages?.length || 0
    })));
    
    return results;
}

// ==================== فتح كل الصفحات في تابات جديدة ====================

async function openAllPagesInNewTabs() {
    log('🆕 فتح كل الصفحات المالية في تابات جديدة...', CONFIG.COLORS.header);
    
    const pages = [
        'billingneeded',
        'autoBuildWR',
        'inprogress',
        'inasc',
        'salaryasc2',
        'salaryASC',
        'mscreport',
        'accountMovement',
        'accountMovementSAP',
        'fawry',
        'financialReceipt'
    ];
    
    for (const pageName of pages) {
        try {
            await openPageInNewTab(pageName);
            await delay(1000);
        } catch (error) {
            logError(`خطأ في فتح ${pageName}: ${error.message}`);
        }
    }
    
    logSuccess('تم فتح كل الصفحات في تابات جديدة');
}

// ==================== الدالة الرئيسية ====================

async function startFinancialAutomation() {
    log('🏭 بوابة العربي CRM - أتمتة العمليات المالية', CONFIG.COLORS.header);
    log('================================================', CONFIG.COLORS.header);
    log(`الصفحة الحالية: ${window.location.href}`, CONFIG.COLORS.info);
    log(`تاريخ البداية: ${CONFIG.DATE_FROM}`, CONFIG.COLORS.info);
    log(`تاريخ النهاية: ${CONFIG.DATE_TO}`, CONFIG.COLORS.info);
    log(`كلمة السر: ${CONFIG.PASSWORD}`, CONFIG.COLORS.info);
    log('================================================', CONFIG.COLORS.header);
    
    // التحقق من الصفحة الحالية
    const currentUrl = window.location.href;
    
    if (currentUrl.includes('MainMoney.aspx')) {
        logSuccess('أنت في الصفحة الرئيسية للنواحي المالية ✓');
    } else if (currentUrl.includes('ASPPage')) {
        logWarning('أنت في صفحة مالية - تأكد إنك في الصفحة الرئيسية أولاً');
    } else {
        logWarning('أنت مش في البروتال - افتح البروتال وسجل دخول أولاً');
        return;
    }
    
    // اختيار العمليات
    const action = prompt(`
اختر العملية:
1. تحليل الصفحة الحالية فقط
2. بحث تلقائي في كل الصفحات (في نفس الصفحة)
3. مقارنة CRM مع SAP
4. تحليل شامل لكل الصفحات
5. تصدير البيانات من الصفحة الحالية
6. فتح صفحة محددة (في نفس الصفحة)
7. فتح كل الصفحات في تابات جديدة
8. فتح صفحة محددة في تاب جديد

أدخل رقم العملية (1-8):`);
    
    switch(action) {
        case '1':
            analyzeCurrentPage();
            break;
        case '2':
            await searchAllPages();
            break;
        case '3':
            await compareCRMvsSAP();
            break;
        case '4':
            await analyzeAllPages();
            break;
        case '5':
            const data = extractTableData();
            if (data.length > 0) {
                exportToExcel(data, `export_${new Date().toISOString().split('T')[0]}.csv`);
            }
            break;
        case '6':
            const pageName6 = prompt(`
اختر الصفحة:
- autoBuildWR (اصدار فاتورة)
- inprogress (جاري مراجعتها)
- inasc (متوقف احتسابها)
- salaryasc2 (مستحقات المراكز)
- salaryASC (Call-Center خارج الضمان)
- mscreport (حوافز الفنيين)
- accountMovementSAP (حركات SAP)
- accountMovement (حركات CRM)
- billingneeded (الفواتير المطلوبة)
- fawry (طلبات المدفوعات)
- financialReceipt (ايصالات المدفوعات)

أدخل اسم الصفحة:`);
            
            if (pageName6 && CONFIG.MENU_LINKS[pageName6]) {
                await autoSearchPage(pageName6, { openInNewTab: false });
            } else {
                logError('اسم الصفحة غير صحيح');
            }
            break;
        case '7':
            await openAllPagesInNewTabs();
            break;
        case '8':
            const pageName8 = prompt(`
اختر الصفحة:
- autoBuildWR (اصدار فاتورة)
- inprogress (جاري مراجعتها)
- inasc (متوقف احتسابها)
- salaryasc2 (مستحقات المراكز)
- salaryASC (Call-Center خارج الضمان)
- mscreport (حوافز الفنيين)
- accountMovementSAP (حركات SAP)
- accountMovement (حركات CRM)
- billingneeded (الفواتير المطلوبة)
- fawry (طلبات المدفوعات)
- financialReceipt (ايصالات المدفوعات)

أدخل اسم الصفحة:`);
            
            if (pageName8 && CONFIG.MENU_LINKS[pageName8]) {
                await openPageInNewTab(pageName8);
            } else {
                logError('اسم الصفحة غير صحيح');
            }
            break;
        default:
            logWarning('رقم غير صحيح');
    }
    
    logSuccess('تم الانتهاء من العمليات');
}

// ==================== تصدير الدوال ====================

// جعل الدوال متاحة عالمياً
window.startFinancialAutomation = startFinancialAutomation;
window.analyzeCurrentPage = analyzeCurrentPage;
window.analyzeAllPages = analyzeAllPages;
window.autoSearchPage = autoSearchPage;
window.searchAllPages = searchAllPages;
window.compareCRMvsSAP = compareCRMvsSAP;
window.fillDateFields = fillDateFields;
window.fillPassword = fillPassword;
window.clickSearchButton = clickSearchButton;
window.extractTableData = extractTableData;
window.exportToExcel = exportToExcel;
window.navigateToFinancialPage = navigateToFinancialPage;
window.clickMenuLink = clickMenuLink;
window.clickLinkByText = clickLinkByText;
window.openPageInNewTab = openPageInNewTab;
window.openAllPagesInNewTabs = openAllPagesInNewTabs;
window.CONFIG = CONFIG;

// طباعة تعليمات الاستخدام
log('🏭 بوابة العربي CRM - أتمتة العمليات المالية', CONFIG.COLORS.header);
log('================================================', CONFIG.COLORS.header);
log('⚠️ تأكد إنك في البروتال ومسجل دخول', CONFIG.COLORS.warning);
log('الدالات المتاحة:', CONFIG.COLORS.info);
log('  • startFinancialAutomation() → القائمة الرئيسية', CONFIG.COLORS.info);
log('  • analyzeCurrentPage() → تحليل الصفحة الحالية', CONFIG.COLORS.info);
log('  • navigateToFinancialPage("pageName") → الانتقال لصفحة', CONFIG.COLORS.info);
log('  • openPageInNewTab("pageName") → فتح صفحة في تاب جديد', CONFIG.COLORS.info);
log('  • openAllPagesInNewTabs() → فتح كل الصفحات في تابات جديدة', CONFIG.COLORS.info);
log('  • autoSearchPage("pageName") → بحث تلقائي في صفحة', CONFIG.COLORS.info);
log('  • searchAllPages() → بحث تلقائي في كل الصفحات', CONFIG.COLORS.info);
log('  • compareCRMvsSAP() → مقارنة CRM مع SAP', CONFIG.COLORS.info);
log('  • extractTableData() → استخراج بيانات الجدول', CONFIG.COLORS.info);
log('  • exportToExcel(data, filename) → تصدير لـ Excel', CONFIG.COLORS.info);
log('  • clickLinkByText("نص") → الضغط على رابط بنص', CONFIG.COLORS.info);
log('================================================', CONFIG.COLORS.header);
log('ابدأ بكتابة: startFinancialAutomation()', CONFIG.COLORS.success);
