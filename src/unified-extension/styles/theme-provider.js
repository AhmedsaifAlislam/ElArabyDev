/* ============================================================
   theme-provider.js — El Araby Unified Theme (Dark/Light)
   - يطبق الثيم مبكراً (FOUC-free) قبل رسم الواجهة
   - الأولوية: localStorage > system preference > dark (افتراضي)
   - يفعّل زر التبديل .theme-btn في الهيدر
   - متوافق MV3 (لا eval، لا inline، صفر صلاحيات إضافية)
   ============================================================ */
(() => {
  const STORAGE_KEY = 'ea_theme';
  const ROOT = document.documentElement;

  const getSystemTheme = () =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';

  const getStoredTheme = () => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) { return null; }
  };

  const resolveTheme = () => getStoredTheme() || getSystemTheme() || 'dark';

  const applyTheme = (theme, persist) => {
    ROOT.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    }
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.setAttribute('aria-label', theme === 'light' ? 'الوضع الليلي' : 'الوضع النهاري');
      btn.title = theme === 'light' ? 'تبديل إلى الوضع الليلي' : 'تبديل إلى الوضع النهاري';
    }
  };

  const toggleTheme = () => {
    const next = ROOT.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
  };

  /* تطبيق فوري قبل أي رسم */
  applyTheme(resolveTheme(), false);

  /* ربط الزر بعد جاهزية DOM */
  const wire = () => {
    const btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', toggleTheme);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();