/**
 * سكريبت واحد بسيط — الصقه في Console وهو هيعمل كل حاجة
 * 
 * الخطوات:
 * 1. افتح البروتال وسجل دخول
 * 2. افتح Console (F12)
 * 3. الصق الكود ده كله
 * 4. اضغط Enter
 * 5. استنى لحد ما يطلعلك ملف JSON — بعتهولي
 */

(async function() {
    const ALL_DATA = {};
    const DELAY = ms => new Promise(r => setTimeout(r, ms));
    
    function log(msg) { console.log('🔗 ' + msg); }
    
    // استخراج معلومات الصفحة الحالية
    function getPageInfo() {
        const info = {
            url: location.href,
            title: document.title,
            inputs: [],
            buttons: [],
            selects: [],
            links: [],
            tables: [],
            errors: []
        };
        
        document.querySelectorAll('input:not([type="hidden"])').forEach(el => {
            info.inputs.push({
                id: el.id, name: el.name, type: el.type,
                value: el.value, placeholder: el.placeholder || ''
            });
        });
        
        document.querySelectorAll('input[type="submit"], input[type="button"], button').forEach(el => {
            info.buttons.push({
                id: el.id, value: el.value || el.textContent.trim(),
                type: el.type
            });
        });
        
        document.querySelectorAll('select').forEach(sel => {
            const opts = [];
            sel.querySelectorAll('option').forEach(o => {
                opts.push({ value: o.value, text: o.textContent.trim(), selected: o.selected });
            });
            info.selects.push({ id: sel.id, name: sel.name, options: opts });
        });
        
        document.querySelectorAll('a[href*="doPostBack"], a.sameframe').forEach(a => {
            info.links.push({
                id: a.id, text: a.textContent.trim(),
                href: a.href, target: a.target || ''
            });
        });
        
        document.querySelectorAll('table.table').forEach((table, idx) => {
            const headers = [];
            const rows = [];
            table.querySelectorAll('th').forEach(th => headers.push(th.textContent.trim()));
            table.querySelectorAll('tbody tr').forEach(tr => {
                const row = {};
                tr.querySelectorAll('td').forEach((td, ci) => {
                    row[headers[ci] || 'col' + ci] = td.textContent.trim();
                });
                if (Object.keys(row).length) rows.push(row);
            });
            if (rows.length) info.tables.push({ index: idx, headers, rows: rows.slice(0, 50) });
        });
        
        document.querySelectorAll('span').forEach(s => {
            if (s.textContent.includes('Does Not Exist') || s.textContent.includes('Error')) {
                info.errors.push(s.textContent.trim());
            }
        });
        
        return info;
    }
    
    // فتح صفحة عن طريق PostBack
    async function openPage(linkId) {
        const link = document.getElementById(linkId);
        if (!link) return null;
        link.click();
        await DELAY(4000);
        return getPageInfo();
    }
    
    // ==================== المرحلة 1: الصفحة الرئيسية ====================
    log('المرحلة 1: الصفحة الرئيسية');
    ALL_DATA.mainPage = getPageInfo();
    
    // ==================== المرحلة 2: كل صفحة مالية ====================
    const pages = [
        { name: 'inprogress', link: 'LinkButton1', desc: 'جاري مراجعتها' },
        { name: 'inasc', link: 'LinkButton2', desc: 'متوقف احتسابها' },
        { name: 'autoBuildWR', link: 'LinkButton7', desc: 'اصدار فاتورة' },
        { name: 'salaryasc2', link: 'LinkButton5', desc: 'مستحقات المراكز', needsPassword: true },
        { name: 'salaryASC', link: 'LinkButton8', desc: 'Call-Center خارج الضمان', needsPassword: true },
        { name: 'mscreport', link: 'LinkButton9', desc: 'حوافز الفنيين', needsPassword: true },
        { name: 'accountMovementSAP', link: 'LinkButton3', desc: 'حركات SAP', needsPassword: true },
        { name: 'accountMovement', link: 'LinkButton4', desc: 'حركات CRM', needsPassword: true },
        { name: 'billingneeded', link: 'LinkButton6', desc: 'الفواتير المطلوبة', needsPassword: true },
        { name: 'fawry', link: 'LinkButton10', desc: 'طلبات المدفوعات', needsPassword: true },
        { name: 'financialReceipt', link: 'LinkButton12', desc: 'ايصالات المدفوعات', needsPassword: true }
    ];
    
    for (const page of pages) {
        log(`المرحلة 2: ${page.desc}`);
        try {
            // رجوع للصفحة الرئيسية أولاً
            const mainLink = document.querySelector('a[href*="MainMoney"]') || document.querySelector('a.sameframe[href*="MainMoney"]');
            if (mainLink) {
                mainLink.click();
                await DELAY(3000);
            }
            
            const info = await openPage(page.link);
            if (info) {
                ALL_DATA[page.name] = info;
                log(`✓ ${page.desc} — تم`);
            } else {
                ALL_DATA[page.name] = { error: 'Link not found' };
                log(`✗ ${page.desc} — الرابط مش موجود`);
            }
        } catch(e) {
            ALL_DATA[page.name] = { error: e.message };
            log(`✗ ${page.desc} — خطأ: ${e.message}`);
        }
    }
    
    // ==================== المرحلة 3: حفظ الملف ====================
    log('المرحلة 3: حفظ الملف...');
    
    const blob = new Blob([JSON.stringify(ALL_DATA, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'portal_analysis_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    
    log('تم! الملف اتحفظ — بعتهولي وأنا هحللك كل حاجة');
    console.log(ALL_DATA);
})();
