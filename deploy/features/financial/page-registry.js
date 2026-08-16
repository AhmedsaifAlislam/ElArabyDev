// ==================== العربية CRM - سجل الصفحات الموحد ====================
// دليل مركزي لكل الصفحات المالية في قسم "آخرى" من بوابة العربي

const PAGE_REGISTRY = {

  // ─── الصفحة الرئيسية ───
  mainMoney: {
    id: 'mainMoney',
    name: 'النواحي المالية',
    nameEn: 'Main Money',
    url: 'MainMoney.aspx',
    linkButton: null, // في المنيو العلوي مش في الـ sub-menu
    linkText: 'النواحى المالية',
    type: 'main',
    needsPassword: false,
    hasDateFilter: false,
    hasTable: false,
    description: 'الصفحة الرئيسية للنواحي المالية - تحتوي على روابط كل الصفحات الفرعية'
  },

  // ─── إصدار فاتورة ───
  autoBuildWR: {
    id: 'autoBuildWR',
    name: 'إصدار فاتورة',
    nameEn: 'Auto Build WR',
    url: 'AutoBuildWR.aspx',
    linkButton: 'LinkButton7',
    type: 'action',
    needsPassword: false,
    hasDateFilter: false,
    hasTable: false,
    fields: {
      reportNumber: { id: 'ContentPlaceHolder1_TextBox1', label: 'رقم البلاغ', type: 'text' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      buildBtn: { id: 'ContentPlaceHolder1_Button2', label: 'إصدار فاتورة', type: 'submit' },
      centerName: { id: 'ContentPlaceHolder1_lblnameasc', label: 'اسم المركز', type: 'span' },
      accountNumber: { id: 'ContentPlaceHolder1_lblaccount', label: 'رقم حساب المركز', type: 'span' },
      sapNumber: { id: 'ContentPlaceHolder1_lblsapno', label: 'رقم الساب', type: 'span' }
    },
    description: 'إصدار فاتورة لبلاغ خدمة - يحتاج رقم البلاغ'
  },

  // ─── جاري مراجعتها ───
  inprogress: {
    id: 'inprogress',
    name: 'جاري مراجعتها',
    nameEn: 'In Progress',
    url: 'inprogress.aspx',
    linkButton: 'LinkButton1',
    type: 'list',
    needsPassword: false,
    hasDateFilter: true,
    hasTable: true,
    fields: {
      dateFrom: { id: 'ContentPlaceHolder1_TextBox1', label: 'من', type: 'date' },
      dateTo: { id: 'ContentPlaceHolder1_TextBox2', label: 'الى', type: 'date' },
      status: { id: 'ContentPlaceHolder1_DropDownList1', label: 'الحالة', type: 'select', defaultValue: 'Amal' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      exportBtn: { id: 'ContentPlaceHolder1_Button2', label: 'استخراج الي شيت اكسل', type: 'submit' },
      excelLink: { id: 'ContentPlaceHolder1_LinkButton1', label: 'ExcelSheet', type: 'link' }
    },
    columns: 28,
    description: 'بلاغات جاري مراجعتها ماليا من العربى',
    hasAscidError: true // يظهر خطأ Entity 'account' With Id = 0000...
  },

  // ─── متوقف احتسابها ───
  inasc: {
    id: 'inasc',
    name: 'متوقف احتسابها',
    nameEn: 'In ASC',
    url: 'inasc.aspx',
    linkButton: 'LinkButton2',
    type: 'list',
    needsPassword: false,
    hasDateFilter: true,
    hasTable: true,
    fields: {
      dateFrom: { id: 'ContentPlaceHolder1_TextBox1', label: 'من', type: 'date' },
      dateTo: { id: 'ContentPlaceHolder1_TextBox2', label: 'الى', type: 'date' },
      status: { id: 'ContentPlaceHolder1_DropDownList1', label: 'الحالة', type: 'select', defaultValue: 'ASC' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      exportBtn: { id: 'ContentPlaceHolder1_Button2', label: 'استخراج الي شيت اكسل', type: 'submit' },
      excelLink: { id: 'ContentPlaceHolder1_LinkButton1', label: 'ExcelSheet', type: 'link' }
    },
    columns: 29,
    description: 'بلاغات منتظر مراجعتها من المركز',
    hasAscidError: true
  },

  // ─── مستحقات المراكز ───
  salaryasc2: {
    id: 'salaryasc2',
    name: 'مستحقات المراكز',
    nameEn: 'Salary ASC2',
    url: 'salaryasc2.aspx',
    linkButton: 'LinkButton5',
    type: 'salary',
    needsPassword: true,
    passwordField: 'ContentPlaceHolder1_TextBox1',
    passwordLabel: 'الرقم السرى',
    hasDateFilter: false,
    hasTable: true,
    fields: {
      centerName: { id: 'ContentPlaceHolder1_lblnameasc', label: 'اسم المركز', type: 'span' },
      accountNumber: { id: 'ContentPlaceHolder1_lblaccount', label: 'رقم حساب المركز', type: 'span' },
      year: { id: 'ContentPlaceHolder1_DropDownList3', label: 'السنة', type: 'select', defaultValue: '2026' },
      month: { id: 'ContentPlaceHolder1_DropDownList4', label: 'الشهر', type: 'select' },
      password: { id: 'ContentPlaceHolder1_TextBox1', label: 'الرقم السرى', type: 'password' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      exportBtn: { id: 'ContentPlaceHolder1_Button2', label: 'Export To Excel', type: 'submit' }
    },
    description: 'مستحقات مراكز الخدمة - يعرض الفواتير والمستحقات'
  },

  // ─── Call-Center خارج الضمان ───
  salaryASC: {
    id: 'salaryASC',
    name: 'Call-Center خارج الضمان',
    nameEn: 'Salary ASC',
    url: 'SalaryASC.aspx',
    linkButton: 'LinkButton8',
    type: 'salary',
    needsPassword: true,
    hasDateFilter: false,
    hasTable: true,
    description: 'فواتير Call-Center خارج الضمان'
  },

  // ─── حوافز الفنيين ───
  mscreport: {
    id: 'mscreport',
    name: 'حوافز الفنيين',
    nameEn: 'MSC Report',
    url: 'mscreport.aspx',
    linkButton: 'LinkButton9',
    type: 'report',
    needsPassword: true,
    hasDateFilter: false,
    hasTable: true,
    description: 'تقرير حوافز الفنيين'
  },

  // ─── حركات الحساب SAP ───
  accountMovementSAP: {
    id: 'accountMovementSAP',
    name: 'حركات الحساب SAP',
    nameEn: 'Account Movement SAP',
    url: 'accountMovementSAP.aspx',
    linkButton: 'LinkButton3',
    type: 'movement',
    needsPassword: true,
    passwordField: 'ContentPlaceHolder1_TextBox3',
    passwordLabel: 'كلمة السر',
    hasDateFilter: true,
    hasTable: true,
    fields: {
      accountLabel: { id: 'ContentPlaceHolder1_Label1', label: 'رقم حساب المركز', type: 'span' },
      dateFrom: { id: 'ContentPlaceHolder1_TextBox1', label: 'من', type: 'date' },
      dateTo: { id: 'ContentPlaceHolder1_TextBox2', label: 'الى', type: 'date' },
      password: { id: 'ContentPlaceHolder1_TextBox3', label: 'كلمة السر', type: 'password' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      extractLink: { id: 'ContentPlaceHolder1_LinkButton1', label: 'Extract All Data', type: 'link' }
    },
    sapColumns: [
      'posting date', 'document date', 'accounting doc', 'assignment number', 'text',
      'billing doc', 'billing item', 'material', 'billed quan', 'd/c',
      'billing net value', 'amount doc', 'balance in doc', 'doc.curr',
      'amount loc', 'balance in loc', 'local currency', 'doc. type', 'doc.t desc',
      'billing. type', 'billing t desc', 'delivery', 'sales order', 'order no',
      'customer no', 'po no', 'customer name', 'company code', 'fiscal year',
      'material description', 'net value'
    ],
    description: 'حركات الحساب من نظام SAP - التحليل المحاسبي الرئيسي'
  },

  // ─── حركات الحساب CRM ───
  accountMovement: {
    id: 'accountMovement',
    name: 'حركات الحساب',
    nameEn: 'Account Movement',
    url: 'accountMovement.aspx',
    linkButton: 'LinkButton4',
    type: 'movement',
    needsPassword: true,
    passwordField: 'ContentPlaceHolder1_TextBox3',
    passwordLabel: 'كلمة السر',
    hasDateFilter: true,
    hasTable: true,
    fields: {
      accountLabel: { id: 'ContentPlaceHolder1_Label1', label: 'رقم حساب المركز', type: 'span' },
      dateFrom: { id: 'ContentPlaceHolder1_TextBox1', label: 'من', type: 'date' },
      dateTo: { id: 'ContentPlaceHolder1_TextBox2', label: 'الى', type: 'date' },
      password: { id: 'ContentPlaceHolder1_TextBox3', label: 'كلمة السر', type: 'password' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      extractLink: { id: 'ContentPlaceHolder1_LinkButton1', label: 'Extract All Data', type: 'link' }
    },
    description: 'حركات الحساب من نظام CRM'
  },

  // ─── الفواتير المطلوبة ───
  billingneeded: {
    id: 'billingneeded',
    name: 'الفواتير المطلوبة',
    nameEn: 'Billing Needed',
    url: 'billingneeded.aspx',
    linkButton: 'LinkButton6',
    type: 'billing',
    needsPassword: true,
    passwordField: 'ContentPlaceHolder1_TextBox3',
    passwordLabel: 'الرقم السرى',
    hasDateFilter: true,
    hasTable: true,
    fields: {
      accountLabel: { id: 'ContentPlaceHolder1_Label1', label: 'رقم حساب المركز', type: 'span' },
      dateFrom: { id: 'ContentPlaceHolder1_TextBox1', label: 'من', type: 'date' },
      dateTo: { id: 'ContentPlaceHolder1_TextBox2', label: 'الى', type: 'date' },
      password: { id: 'ContentPlaceHolder1_TextBox3', label: 'الرقم السرى', type: 'password' },
      searchBtn: { id: 'ContentPlaceHolder1_Button1', label: 'بحث', type: 'submit' },
      extractLink: { id: 'ContentPlaceHolder1_LinkButton1', label: 'Extract All Data', type: 'link' }
    },
    description: 'الفواتير المطلوبة إصدارها'
  },

  // ─── طلبات المدفوعات ───
  fawry: {
    id: 'fawry',
    name: 'طلبات المدفوعات',
    nameEn: 'Fawry',
    url: 'Fawry.aspx',
    linkButton: 'LinkButton10',
    type: 'payment',
    needsPassword: true,
    hasDateFilter: true,
    hasTable: true,
    description: 'طلبات المدفوعات (Fawry)',
    hasAscidError: true
  },

  // ─── ايصالات المدفوعات ───
  financialReceipt: {
    id: 'financialReceipt',
    name: 'ايصالات المدفوعات',
    nameEn: 'Financial Receipt',
    url: 'FinancialReceipt.aspx',
    linkButton: 'LinkButton12',
    type: 'receipt',
    needsPassword: true,
    hasDateFilter: true,
    hasTable: true,
    description: 'ايصالات المدفوعات',
    hasAscidError: true
  }
};

// ─── تصنيف الصفحات ───
const PAGE_CATEGORIES = {
  main: { name: 'الرئيسية', icon: '🏠', color: '#1a237e' },
  action: { name: 'إجراءات', icon: '⚡', color: '#e65100' },
  list: { name: 'قوائم', icon: '📋', color: '#1565c0' },
  salary: { name: 'مستحقات', icon: '💰', color: '#2e7d32' },
  report: { name: 'تقارير', icon: '📊', color: '#6a1b9a' },
  movement: { name: 'حركات', icon: '🔄', color: '#00695c' },
  billing: { name: 'فواتير', icon: '🧾', color: '#bf360c' },
  payment: { name: 'مدفوعات', icon: '💳', color: '#283593' },
  receipt: { name: 'ايصالات', icon: '🧾', color: '#4e342e' }
};

// ─── كلمات السر (يُدخلها المستخدم) ───
const PASSWORDS = {
  salaryasc2: '',
  salaryASC: '',
  mscreport: '',
  accountMovementSAP: '',
  accountMovement: '',
  billingneeded: '',
  fawry: '',
  financialReceipt: ''
};

// ─── دوال مساعدة ───

function getPageById(id) {
  return PAGE_REGISTRY[id] || null;
}

function getPageByLinkButton(linkButton) {
  return Object.values(PAGE_REGISTRY).find(p => p.linkButton === linkButton) || null;
}

function getPageByUrl(url) {
  const lower = url.toLowerCase();
  for (const [id, page] of Object.entries(PAGE_REGISTRY)) {
    if (lower.includes(page.url.toLowerCase().replace('.aspx', ''))) {
      return page;
    }
  }
  return null;
}

function getAllPages() {
  return Object.values(PAGE_REGISTRY);
}

function getPagesByType(type) {
  return Object.values(PAGE_REGISTRY).filter(p => p.type === type);
}

function getPagesNeedingPassword() {
  return Object.values(PAGE_REGISTRY).filter(p => p.needsPassword);
}

function getPageCategory(pageId) {
  const page = PAGE_REGISTRY[pageId];
  if (!page) return null;
  return PAGE_CATEGORIES[page.type] || PAGE_CATEGORIES.list;
}
