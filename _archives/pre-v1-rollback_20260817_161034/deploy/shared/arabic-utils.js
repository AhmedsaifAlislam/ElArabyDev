/**
 * arabic-utils.js — أدوات النص العربي المشتركة
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، dashboard، background (service worker)
 * يوفّر:
 *   - واجهة عامة: detectEncoding, decodeBytes, removeBOM, countArabic, cleanArabicText, hasArabic, toEnglishNumbers, toArabicNumbers
 *   - ArabicUtils (normalizeArabicText, SYNONYMS_MAP, expandSearchTerms) — لقطع الغيار
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyArabicUtilsLoaded) return;
  global.__elarabyArabicUtilsLoaded = true;

  /**
   * كشف ترميز النص
   * @param {Uint8Array} bytes - البيانات الخام
   * @returns {string} اسم الترميز المكتشف
   */
  global.detectEncoding = function(bytes) {
    // UTF-8 BOM
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'utf-8';
    }

    // UTF-16 LE BOM
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'utf-16le';
    }

    // UTF-16 BE BOM
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'utf-16be';
    }

    // كشف العربية
    let arabicCount = 0;
    let totalChars = 0;

    for (let i = 0; i < bytes.length - 1; i++) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];

      // Arabic range: 0x0600 - 0x06FF
      if (b1 >= 0x06 && b1 <= 0x06 && b2 >= 0x00) {
        arabicCount++;
      }

      totalChars++;
    }

    // إذا كانت نسبة العربية كبيرة، فـ Windows-1256
    if (totalChars > 0 && arabicCount / totalChars > 0.1) {
      return 'windows-1256';
    }

    // الافتراضي
    return 'utf-8';
  };

  /**
   * فك ترميز النص
   * @param {Uint8Array} bytes - البيانات الخام
   * @param {string} encoding - الترميز (اختياري، يتم كشفه تلقائياً)
   * @returns {string} النص المفكوك
   */
  global.decodeBytes = function(bytes, encoding) {
    if (!encoding) {
      encoding = global.detectEncoding(bytes);
    }

    try {
      const decoder = new TextDecoder(encoding);
      return decoder.decode(bytes);
    } catch (error) {
      console.warn('[ArabicUtils] Decode error, trying UTF-8:', error);
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(bytes);
    }
  };

  /**
   * إزالة BOM من النص
   * @param {string} text - النص
   * @returns {string} النص بدون BOM
   */
  global.removeBOM = function(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
      return text.slice(1);
    }
    return text;
  };

  /**
   * عدّ الأحرف العربية في النص
   * @param {string} text - النص
   * @returns {number} عدد الأحرف العربية
   */
  global.countArabic = function(text) {
    if (!text) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0x0600 && code <= 0x06FF) {
        count++;
      }
    }
    return count;
  };

  /**
   * تنظيف النص العربي (إزالة المسافات الزائدة)
   * @param {string} text - النص
   * @returns {string} النص النظيف
   */
  global.cleanArabicText = function(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')  // مسافات متعددة → مسافة واحدة
      .replace(/^\s+|\s+$/g, '')  // إزالة المسافات من البداية والنهاية
      .replace(/[\u200B-\u200D\uFEFF]/g, '');  // إزالة الأحرف غير المرئية
  };

  /**
   * كشف ما إذا كان النص يحتوي على عربية
   * @param {string} text - النص
   * @returns {boolean} true إذا كان يحتوي على عربية
   */
  global.hasArabic = function(text) {
    return global.countArabic(text) > 0;
  };

  /**
   * تحويل الأرقام العربية إلى إنجليزية
   * @param {string} text - النص
   * @returns {string} النص بالأرقام الإنجليزية
   */
  global.toEnglishNumbers = function(text) {
    const arabicNums = '٠١٢٣٤٥٦٧٨٩';
    const englishNums = '0123456789';

    return text.split('').map(char => {
      const index = arabicNums.indexOf(char);
      return index >= 0 ? englishNums[index] : char;
    }).join('');
  };

  /**
   * تحويل الأرقام الإنجليزية إلى عربية
   * @param {string} text - النص
   * @returns {string} النص بالأرقام العربية
   */
  global.toArabicNumbers = function(text) {
    const arabicNums = '٠١٢٣٤٥٦٧٨٩';
    const englishNums = '0123456789';

    return text.split('').map(char => {
      const index = englishNums.indexOf(char);
      return index >= 0 ? arabicNums[index] : char;
    }).join('');
  };

  // ── ArabicUtils — تطبيع النص العربي والمرادفات (قطع الغيار) ──

  /**
   * توحيد أشكال الكلمات العربية قبل المقارنة
   * "تايبر" تطابق "تيبر"، "ه" تطابق "ة"، "أ/إ/آ" تطابق "ا"
   */
  function normalizeArabicText(text) {
    if (!text) return '';
    return String(text)
      .trim()
      .toLowerCase()
      // إزالة التشكيل
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // توحيد ألف
      .replace(/[أإآٱ]/g, 'ا')
      // توحيد تاء مربوطة → هـ
      .replace(/ة/g, 'ه')
      // توحيد ياء
      .replace(/ى/g, 'ي')
      // توحيد واو الهمزة
      .replace(/ؤ/g, 'و')
      // ضغط المسافات المتعددة
      .replace(/\s+/g, ' ');
  }

  // قاموس المرادفات
  const SYNONYMS_MAP = {
    "تايبر": ["تايبر", "تيبر", "موقت"],
    "موتور": ["موتور", "ماتور", "محرك"],
    "كارته": ["كارته", "كارته", "بورده", "لوحه", "pcb", "كارت"],
    "كومبريسور": ["كومبريسور", "كباس", "ضاغط", "كمبروسر"],
    "هيتر": ["هيتر", "سخان"],
    "ثرموستات": ["ثرموستات", "ترموستات"]
  };

  /**
   * توسيع مصطلحات البحث بالمرادفات
   * @param {string} needle - نص البحث
   * @returns {string[]} كل الأشكال الممكنة للبحث
   */
  function expandSearchTerms(needle) {
    const normalized = normalizeArabicText(needle);
    const expanded = new Set();
    expanded.add(normalized);

    for (const [key, synonyms] of Object.entries(SYNONYMS_MAP)) {
      const group = [key, ...synonyms].map(normalizeArabicText);
      if (group.some(s => normalized.includes(s) || s.includes(normalized))) {
        group.forEach(s => expanded.add(s));
      }
    }
    return Array.from(expanded);
  }

  // متاح لقطع الغيار (background + content scripts عبر importScripts)
  global.ArabicUtils = {
    normalizeArabicText,
    SYNONYMS_MAP,
    expandSearchTerms
  };

  console.log('[ArabicUtils] تم تحميل أدوات العربية بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);
