# Phase 1 Plan: Fix Serial/Model2 for AC (تكييف Sharp)

> **⚠️ تحديث 2026-08-16 — قاعدة صارمة جديدة (منفذة في ElArabyDev):**
> تنفيذ 2026-08-16 استبدل النهج أدناه (الذي كان يعتمد على `isSharp` — خطأ) بالقاعدة الصارمة:
> - **سيريال 2 / موديل 2 مسموح فقط لمنتجات مجموعة AC**: تكييف، تكييف كونسيلد، PUMP CLEAN، مبرد هواء، منقى هواء، صيانة دورية تكييف
> - **كل المنتجات الأخرى → فاضي إلزاماً** (`clearModel2Serial2Fields()` تمسح من الصفحة نفسها)
> - **Sharp علامة تجارية وليست نوع منتج** — أُزيل `isSharp` نهائياً من `executePage1_Review`
> - **أُزيل "General fallback"** (كان ينسخ serial → serial2 لأي جهاز بحقل 2 في الـ DOM)
> - التحقق: `node --check` نظيف + 31 اختبار `isACProductType` + SHA256 MATCH (منشور)
> - بلاغ حي: ثلاجة SHARP رُفضت من البوابة ("المنتج غير متطابق مع الرقم المسلسل") لأن serial2 = "0" — أُصلح يدوياً + القاعدة الآن تمنع التكرار.

## Goal
Enable automatic filling of `model2` and `serial2` fields for AC units (Sharp) when user inputs two consecutive lines with same OrderId (indoor + outdoor units).

## Decisions
- **Shortcut**: `Alt+Shift+E` (opens unified sidebar)
- **Dock**: Right sidebar, collapsible
- **Scope**: Minimum — merge lines in popup.js + fallback in executePage1_Review

---

## Files to Modify

### 1. `src/unified-extension/popup.js` — Line Merging Logic
**Location**: After `parseLines()` function, before `buildTaskItems()`

**Logic (mirroring V2 popup.js:382-391):**
```javascript
function mergeConsecutiveACLines(lines) {
  const grouped = {};
  const result = [];
  
  lines.forEach(line => {
    const obj = parseLineToObject(line);
    const orderId = obj['orderid'] || obj['order'] || line.match(/\bCAS\d{10,}\b/i)?.[0];
    if (!orderId) { result.push(line); return; }
    
    if (!grouped[orderId]) grouped[orderId] = [];
    grouped[orderId].push({ line, obj });
  });
  
  Object.values(grouped).forEach(group => {
    if (group.length >= 2) {
      // Check if AC/Sharp
      const first = group[0].obj;
      const isAC = /تكييف|ac|air.?cond|split|شباك|inverter/i.test(first['reporttype'] || first['report'] || '');
      const isSharp = /sharp/i.test(first['brand'] || first['علامهتجاريه'] || '');
      
      if (isAC || isSharp) {
        let merged = group[0].line;
        const second = group[1].obj;
        const m2 = second['model'] || second['موديل'] || '';
        const s2 = second['serial'] || second['serialnumber'] || '';
        const d2 = second['date'] || second['تاريخ'] || '';
        
        if (m2 && m2.toLowerCase() !== 'null') merged += ` | Model2: ${m2}`;
        if (s2 && s2.toLowerCase() !== 'null') merged += ` | Serial2: ${s2}`;
        if (d2 && d2.toLowerCase() !== 'null') merged += ` | Date2: ${d2}`;
        
        result.push(merged);
        // Skip remaining lines in group (or merge all)
        for (let i = 2; i < group.length; i++) result.push(group[i].line);
      } else {
        group.forEach(g => result.push(g.line));
      }
    } else {
      result.push(group[0].line);
    }
  });
  
  return result;
}
```

**Integration point**: Call `mergeConsecutiveACLines(parsedLines)` in batch processing before creating tasks.

---

### 2. `src/unified-extension/content-script.js` — Fallback in `executePage1_Review`
**Location**: Inside `executePage1_Review()` after line 1163 (after reading product type)

**Logic:**
```javascript
// AC Fallback: Auto-fill model2/serial2 for Sharp AC if empty
const isAC = /تكييف|ac|air.?cond|split|شباك|inverter/i.test(data.reportType || '');
const isSharp = /sharp/i.test(data.brand || '');

if ((isAC || isSharp) && (!data.model2 || !data.serial2)) {
  try {
    // Try loading from secondVisitProfiles.json
    const r = await fetch(chrome.runtime.getURL('secondVisitProfiles.json'));
    const svConfig = await r.json();
    const acProfile = svConfig.profiles.find(p => p.name === 'تكييف');
    if (acProfile?.page1Defaults) {
      data.model2 = data.model2 || acProfile.page1Defaults.model2 || '';
      data.serial2 = data.serial2 || acProfile.page1Defaults.serial2 || '0';
      log('🔧 AC Fallback: Using profile defaults for model2/serial2');
    }
  } catch(e) {
    // Fallback: duplicate model/serial
    data.model2 = data.model2 || data.model || '';
    data.serial2 = data.serial2 || data.serial || '0';
    log('🔧 AC Fallback: Duplicated model/serial to model2/serial2');
  }
}
```

---

### 3. Verify Selectors (No changes needed — already correct)
**Files**: 
- `src/unified-extension/shared/portal-selectors.js` (lines 79-84, 117-121)
- `src/unified-extension/selectors.json` (lines 13-18, 56-60)
- `src/unified-extension/content-script.js` hardcoded defaults (lines 117, 121)

**Selectors confirmed present**:
- `serial2`: `#ldv_serialnumber1`, `[aria-label*='الرقم المسلسل 2']`
- `modelInput2`: `#ldv_actualmodel2_name`, `[aria-label*='الموديل الفعلي 2']`

---

## Testing Checklist
- [x] Input two lines with same OrderId (Sharp AC indoor + outdoor) → merged line has Model2/Serial2/Date2
- [x] Single AC line without Model2 → fallback loads Sharp defaults from profile
- [x] Non-AC lines unchanged
- [x] Page 1 fills model2/serial2 fields correctly on portal
- [x] **2026-08-16**: ثلاجة (SHARP) — serial2 فاضي إلزاماً + حالة الضمان In warranty + Next ناجح (بلاغ حي)
- [x] **2026-08-16**: `isACProductType` — 31 اختبار (6 AC → true، 25 غير AC → false)

---

## Dependencies
- `secondVisitProfiles.json` must be accessible via `chrome.runtime.getURL()`
- Manifest already includes it in web_accessible_resources (verify)

---

## Next Phases (Not in Scope)
- Phase 2: Unified Sidebar Dock (Alt+Shift+E)
- Phase 3: V2 Feature Parity (Installation, Subgrid, Page 3, etc.)