// ==================== التعبئة التلقائية للصفحات المالية ====================
// محلية 100% — تُحقن دالة قائمة بذاتها عبر chrome.scripting.executeScript
// مع تمرير القيم عبر الوسائط (args). لا تُخزَّن أي كلمة سر — تُمرَّر في كل مرة.

function financialAutoFillPage(accountNumber, password) {
  function setValue(el, value) {
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const results = { accountFilled: false, passwordFilled: false, fieldsFound: [] };

  const accSelectors = [
    '#ctl00_ContentPlaceHolder1_txtAccountNo',
    '#ctl00_ContentPlaceHolder1_txtaccno',
    'input[id*="AccountNo"]', 'input[id*="accountNo"]', 'input[id*="accno"]',
    'input[id*="txtAccNo"]', 'input[name*="AccountNo"]'
  ];

  if (accountNumber) {
    for (const sel of accSelectors) {
      const el = document.querySelector(sel);
      if (el && setValue(el, String(accountNumber))) {
        results.accountFilled = true;
        results.fieldsFound.push(sel);
        break;
      }
    }
  }

  if (password) {
    const passEl = document.querySelector('input[type="password"]');
    if (passEl && setValue(passEl, String(password))) {
      results.passwordFilled = true;
      results.fieldsFound.push('input[type="password"]');
    }
  }

  return results;
}