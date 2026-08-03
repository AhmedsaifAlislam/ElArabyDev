// shared/arabic-utils.js — Arabic Text Normalization & Synonym Search
// Source: dataService.ts + Smart_Autofill.user.js (merged & deduplicated)

const ArabicUtils = (() => {

  // ── Arabic Text Normalization ──
  // Unifies common Arabic spelling variants before comparison
  // "تايمر" matches "تيمر", "ه" matches "ة", "أ/إ/آ" match "ا"
  function normalizeArabicText(text) {
    if (!text) return '';
    return String(text)
      .trim()
      .toLowerCase()
      // Remove diacritics (Tashkeel)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // Normalize Alef variants → ا
      .replace(/[أإآٱ]/g, 'ا')
      // Normalize Taa Marbouta ة → ه
      .replace(/ة/g, 'ه')
      // Normalize Yaa variants ى → ي
      .replace(/ى/g, 'ي')
      // Normalize Waw with Hamza
      .replace(/ؤ/g, 'و')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ');
  }

  // ── Synonyms Dictionary ──
  const SYNONYMS_MAP = {
    "تايمر": ["تايمر", "تيمر", "مؤقت"],
    "موتور": ["موتور", "ماتور", "محرك"],
    "كارته": ["كارته", "كارتة", "بوردة", "لوحة", "pcb", "كارت"],
    "كومبريسور": ["كومبريسور", "كباس", "ضاغط", "كمبروسر"],
    "هيتر": ["هيتر", "سخان"],
    "ثرموستات": ["ثرموستات", "ترموستات"]
  };

  // ── Expand Search Terms ──
  // Creates an array of all possible normalized search needles based on synonyms
  function expandSearchTerms(needle) {
    const normalized = normalizeArabicText(needle);
    let expanded = new Set();
    expanded.add(normalized);

    for (const [key, synonyms] of Object.entries(SYNONYMS_MAP)) {
      const group = [key, ...synonyms].map(normalizeArabicText);
      if (group.some(s => normalized.includes(s) || s.includes(normalized))) {
        group.forEach(s => expanded.add(s));
      }
    }
    return Array.from(expanded);
  }

  // ── Field Matcher ──
  // Public API
  return {
    normalizeArabicText,
    SYNONYMS_MAP,
    expandSearchTerms,
  };
})();

// Make available in content scripts and background (via importScripts)
if (typeof globalThis !== 'undefined') globalThis.ArabicUtils = ArabicUtils;
