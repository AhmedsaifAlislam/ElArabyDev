# ElAraby Portal Analysis - For Extension Development

## Overview
This document captures the complete analysis of the ElAraby Partner Portal structure, UI elements, and navigation flow to inform the extension's autofill implementation.

---

## 1. Portal URLs & Navigation Flow

### Key URLs
- **Orders List**: `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/`
- **Work Order Review (Page 1)**: `https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id={guid}`
- **Follow-up Page (Page 2)**: Same URL, navigates via "Next" button
- **Page 3**: Navigation from Page 2 via Next/Save

### Navigation Path
```
Orders List (search by OrderId) 
  → Click action menu (⋮) on row 
  → Click "متابعة" (Follow up)
  → Work Order Review Page 1 (Product Info)
  → Click "Next" 
  → Page 2 (Actual Problems & Technicians)
  → Click "Next/Save" 
  → Page 3 (if needed: Drain Cleaning / Installation)
```

---

## 2. Orders List Page Structure

### Search Filters
| Filter | Selector | Notes |
|--------|----------|-------|
| Order Number | `textbox "Filter: رقم الطلب"` | Primary search field |
| Landline | `textbox "Filter: الرقم الأرضي"` | |
| Mobile | `textbox "Filter: رقم الموبايل"` | |
| Office Notes | `textbox "Filter ملاحظات المكتب:"` | |
| Account Number | `textbox "Filter: رقم الحساب"` | |
| Booking Date | Date picker | |
| Search Button | `button "بحث"` | |

### Table Structure
- **Table selector**: `table.entity-grid` or generic `table`
- **Rows**: `tbody tr` (each row = one work order)
- **Columns** (in order):
  1. رقم الطلب (Order ID)
  2. اسم العميل (Customer Name)
  3. رقم العقار (Building #)
  4. العنوان (Address)
  5. نوع المنتج (Product Type)
  6. شكوى العميل (Customer Complaint)
  7. تاريخ الحجز (Booking Date)
  8. ملاحظات المكتب (Office Notes)
  9. ملاحظات الكول سنتر (Call Center Notes)
  10. نوع الخدمة (Service Type)
  11. يوجد شكوى (Has Complaint)
  12. SAP رقم الـ (SAP Number)
  13. جهة البلاغ (Report Source)
  14. الفنى المسؤول (Responsible Technician)
  15. Actions (action menu ⋮)

### Action Menu (⋮)
Click the action menu button on a row to reveal:
- **متابعة** (Follow up) → Navigates to Work Order Review Page 1
- **ارجاع** (Return)
- **توزيع البلاغ** (Distribute Report)

---

## 3. Work Order Review - Page 1 (Product Information)

### URL Pattern
`https://elarabyportalpfs.powerappsportals.com/en-US/workorderreview/?id={guid}`

### Form Sections

#### Product Information Group ("بيانات المنتج")
| Field | Selector | Type | Required | Notes |
|-------|----------|------|----------|-------|
| Product Category | `textbox "فئة المنتج is a required field."` | Read-only? | Yes | Value: "HA" |
| Product Type | `textbox "نوع المنتج is a required field."` | Read-only? | Yes | Value: "ثلاجات" |
| **Brand (العلامة التجاريه)** | `textbox "العلامة التجاريه is a required field."` + lookup button | **Lookup** | Yes | Target: SHARP |
| **Model 1 (الموديل الفعلي 1)** | `textbox "الموديل الفعلي 1 is a required field."` + lookup button | **Lookup** | Yes | Target: SJ-GV58A(BK) |
| Serial Number | `textbox "الرقم المسلسل"` | Text input | No | Value: 20D29#040475HG4C |
| Warranty Status | `combobox "حالة الضمان *"` | Select | Yes | Options: Select / In warranty / Out warranty |

#### Lookup Buttons
- **Brand lookup**: `button "العلامة التجاريه Launch lookup modal"` (aria-label contains "Launch lookup modal")
- **Model 1 lookup**: `button "الموديل الفعلي 1 Launch lookup modal"` (aria-label contains "Launch lookup modal")

#### Navigation
- **Next Button**: `button "Next"` - Navigates to Page 2

#### Validation Errors (shown when clicking Next without required fields)
- "العلامة التجاريه is a required field."
- "الموديل الفعلي 1 is a required field."
- "حالة الضمان is a required field."

---

## 4. Brand Lookup Modal Structure

### Trigger
Click `button "العلامة التجاريه Launch lookup modal"` (has aria-label "Launch lookup modal")

### Modal Structure
- **Modal container**: `section.modal.modal-lookup.in` or `.modal.show` or `div[role="dialog"]`
- **Search input**: `input.query.form-control`, `input.form-control[type="text"]`, `input[type="search"]`, or `input[placeholder*="Search"]`
- **Search button**: Button inside modal (`.modal button`, `.modal button.btn-hg`, or `button[aria-label*="Search"]`)
- **Results table**: `section.modal.modal-lookup .modal table tbody tr` or `.modal table tbody tr`
- **Row selection**: Radio button (`input[type="radio"]`), checkbox (`input[type="checkbox"]`), or span with `role="checkbox"`
- **Select/اختر button**: `.modal button.primary`, `.modal button[aria-label*="Select"]`, `.modal button[aria-label*="تحديد"]`, `.modal button[aria-label*="اختر"]`

### Lookup Flow (PowerApps Pattern)
1. Click lookup button → modal opens
2. Modal may pre-load all items (Brand modal) OR require search
3. **If pre-loaded**: Direct pick from visible items
4. **If search needed**: Type in search input → click search → wait for results
5. Click radio/checkbox on matching row
6. Click "اختر" (Select) button
7. Modal closes, field populated

---

## 5. Work Order Review - Page 2 (Follow-up)

### URL
Same as Page 1, navigated via "Next" button

### Form Sections

#### Spare Parts Status
- **Field**: `ats_sparepartsstatus` (select dropdown)
- **Default for maintenance**: "بدون قطع غيار" (No spare parts)

#### Actual Problems (المشاكل الفعلية)
- **Lookup**: "اضافة المشاكل الفعلية" (Add Actual Problems) button
- **Opens**: Subgrid iframe modal
- **Search**: Inside iframe, click lookup button (magnifying glass) → search modal
- **Filters**: 
  - Exclude: ترصيد, ارضي, أرضي, بلاغ
  - Priority: Premium care, بريميم كير, تركيب وتشغيل

#### Technicians (الفنيين)
- **Lookup**: "اضافة الفنيين" (Add Technicians) button
- **Opens**: Subgrid iframe modal
- **Search**: Inside iframe, click lookup button → search modal
- **Selection**: Radio button → click "اختر" → Save

### Navigation
- **Next/Save**: Button with text "Next", "التالي", "Save", "حفظ", or "Submit"
- Clicking Next on Page 2:
  - If Page 3 not needed → Saves and completes
  - If Page 3 needed → Navigates to Page 3

---

## 6. Key Selectors for Extension Implementation

### Page 1 (Product Info)
```javascript
// Brand lookup
const brandInput = '#ats_producttypebrand_name';
const brandLookupBtn = 'button[aria-label*="Launch lookup modal"]'; // Near brand input

// Model 1 lookup  
const modelInput = '#ldv_actualmodel_name';
const modelLookupBtn = 'button[aria-label*="Launch lookup modal"]'; // Near model input

// Serial
const serialInput = '#ldv_serialnumber';

// Warranty Status
const warrantySelect = '#ldv_warrantystatus';

// Next button
const nextBtn = 'button:has-text("Next")';
```

### Lookup Modal
```javascript
// Modal detection
const modalSelectors = [
  'section.modal.modal-lookup.in',
  '.modal.show',
  '.modal.in',
  'div[role="dialog"]'
];

// Search input in modal
const searchInputSelectors = [
  'input.query.form-control',
  'input.form-control[type="text"]',
  'input[type="search"]',
  'input[placeholder*="Search"]',
  'input[placeholder*="بحث"]'
];

// Search button
const searchBtnSelectors = [
  '.modal button.btn-hg',
  'button[aria-label*="Search"]',
  'button[aria-label*="بحث"]',
  '.modal button'
];

// Result rows
const rowSelectors = [
  'section.modal.modal-lookup .modal table tbody tr',
  '.modal table tbody tr',
  '.modal [role="row"]'
];

// Row selection
const rowSelectionSelectors = [
  'input[type="radio"]',
  'input[type="checkbox"]',
  'span[role="checkbox"]',
  'span.fa'
];

// Select/اختر button
const selectBtnSelectors = [
  '.modal button.primary',
  '.modal button[aria-label*="Select"]',
  '.modal button[aria-label*="تحديد"]',
  '.modal button[aria-label*="اختر"]',
  '.modal input[value="اختر"]',
  '.modal input[value="Select"]'
];
```

### Page 2
```javascript
// Spare Parts Status
const sparePartsSelect = '#ats_sparepartsstatus';

// Add Actual Problems button
const addProblemsBtn = 'a, button, input[type="button"]' matching /اضاف[ةه]\s*المشاكل\s*الفعلي[ةه]|Add.*Problem/i

// Add Technicians button
const addTechBtn = 'a, button, input[type="button"]' matching /اضاف[ةه]\s*الفني[ةي]|Add.*Technician/i

// Next/Save button on Page 2
const nextBtn = 'button[type="submit"], input[type="submit"], button.btn-primary' matching /next|التالي|save|حفظ|submit/i
```

---

## 7. Portal Console Errors (Known Issues)

### Common 404s (Non-blocking)
- `/resource/powerappsportal/dist/preform.bundle-c7915b3e06.css`
- `/_odata/ats_portalwarningmessage`
- `/_odata/ascnews`

### JavaScript Errors (Non-blocking for our automation)
- `ReferenceError: ldv_workordertype is not defined` - Portal's own JS, doesn't affect form interaction
- `JQMIGRATE: Migrate is installed, version 3.4.0`
- React version mismatch warning: `Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)`

### Portal Logs
- "الجدول اتحدث.. جاري تلوين الصفوف..." - Table rendering
- "Some icons were re-registered" - Fluent UI icons

---

## 8. Data Mapping for Test Order

| Field | Value | Page |
|-------|-------|------|
| Order ID | CAS2026092653733593 | Search / All pages |
| Serial | 20D29#040475HG4C | Page 1 |
| Brand | SHARP | Page 1 (Lookup) |
| Model | SJ-GV58A(BK) | Page 1 (Lookup) |
| Status | In Warranty | Page 1 (Select) |
| Date | 29/04/2020 | Order metadata |
| Product Type | ثلاجات (Refrigerators) | Page 1 |
| Service Type | Maintenance (صيانة) | Page 2 |

---

## 9. Extension Implementation Notes

### Timing Considerations
- **Modal open wait**: 1800ms after clicking lookup button
- **Search results wait**: Up to 12000ms
- **Page navigation wait**: Up to 10000ms for Page 2 load
- **Iframe load wait**: Up to 15000ms for modal iframes

### Critical Selectors (Verified Working)
| Element | Selector |
|---------|----------|
| Orders search input | `textbox "Filter: رقم الطلب"` |
| Search button | `button "بحث"` |
| Action menu | `button "action menu"` |
| Follow up menu item | `menuitem "متابعة"` |
| Brand lookup button | `button[aria-label*="Launch lookup modal"]` (first) |
| Model lookup button | `button[aria-label*="Launch lookup modal"]` (second) |
| Next button | `button "Next"` |
| Warranty status select | `combobox "حالة الضمان *"` |

### Iframe Handling
- PowerApps renders lookup modals in iframes
- Use `iframe.contentDocument` or `iframe.contentWindow.document` to access modal DOM
- Wait for `iframe.contentDocument.readyState === 'complete'`

---

## 10. Files to Reference/Update

### Core Extension Files
- `src/unified-extension/modules/autofill/engine-orchestrator.js` - Main router
- `src/unified-extension/modules/autofill/engine-page1.js` - Page 1 logic
- `src/unified-extension/modules/autofill/engine-page2.js` - Page 2 logic
- `src/unified-extension/modules/autofill/engine-lookups.js` - Lookup automation
- `src/unified-extension/modules/autofill/engine-page3.js` - Page 3 logic

### Selectors Config
- `src/unified-extension/selectors.json` - Update with verified selectors

### Snapshots Saved
- `analysis/snapshots/orders_list.yml` - Orders list page
- `analysis/snapshots/action_menu.yml` - Action menu dropdown
- `analysis/snapshots/workorderreview_page1.yml` - Page 1 (Product Info)
- `analysis/snapshots/workorderreview_page2.yml` - Page 2 (Follow-up)
- `analysis/snapshots/brand_lookup_modal.yml` - Brand lookup modal