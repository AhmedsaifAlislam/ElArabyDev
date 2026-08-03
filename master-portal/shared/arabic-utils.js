/**
 * arabic-utils.js — أدوات النص العربي المشترك
 * Shared across all El Araby extensions
 * 
 * يوفر دوال لمعالجة النصوص العربية والترميز
 */

(function() {
  'use strict';

  // منع التحميل المزدوج
  if (window.__elarabyArabicUtilsLoaded) return;
  window.__elarabyArabicUtilsLoaded = true;

  /**
   * كشف ترميز النص
   * @param {Uint8Array} bytes - البيانات الخام
   * @returns {string} اسم الترميز المكتشف
   */
  window.detectEncoding = function(bytes) {
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
    if (arabicCount / totalChars > 0.1) {
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
  window.decodeBytes = function(bytes, encoding) {
    if (!encoding) {
      encoding = window.detectEncoding(bytes);
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
  window.removeBOM = function(text) {
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
  window.countArabic = function(text) {
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
  window.cleanArabicText = function(text) {
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
  window.hasArabic = function(text) {
    return window.countArabic(text) > 0;
  };

  /**
   * تحويل الأرقام العربية إلى إنجليزية
   * @param {string} text - النص
   * @returns {string} النص بالأرقام الإنجليزية
   */
  window.toEnglishNumbers = function(text) {
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
  window.toArabicNumbers = function(text) {
    const arabicNums = '٠١٢٣٤٥٦٧٨٩';
    const englishNums = '0123456789';
    
    return text.split('').map(char => {
      const index = englishNums.indexOf(char);
      return index >= 0 ? arabicNums[index] : char;
    }).join('');
  };

  console.log('[ArabicUtils] ✅ تم تحميل أدوات العربية بنجاح');

})();
