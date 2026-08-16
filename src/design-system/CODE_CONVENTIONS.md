# El Araby Code Conventions — اصطلاحات كود العربي الموحد
# Arabic System — Unified Code Conventions v1.0

> **تاريخ الإنشاء:** 2026-08-08
> **آخر تحديث:** 2026-08-08
> **النطاق:** كل الكود في `master-portal/` وكل الإضافات المتفرعة منه.
> **العقد:** DHYDR (Don't Hardcode, You Don't Repeat) + BABE
> (BeAtomic, BeExplicit, BeEnglish-safe-clean).

---

## المبادئ / Principles

1. **خطأ موحد:** كل رد فعل من content/popup/background يُرجع `{ ok, error, data }`.
   - النجاح: `{ ok: true, data }`
   - الفشل: `{ ok: false, error: 'رسالة واضحة' }`
   - لا تُرجع `undefined` ولا تخفي الأخطاء خلف `console.log` فقط.
2. **اهم عن جميع نفس** عبر `messageBus.on(...)` — ملكية action واحدة لكل handler
   (انظر `KNOWN_ISSUES.md` بند 12).
3. **أسماء واضحة:** `<فعل><كائن>` (runSingleLine, openSession, startDeviceDataExtraction) — لا اختصارات غامضة.
4. **Approach بالتوقيت:** الرد يُرسل قبل أي خطوة قد تدمر السياق
   (التنقل، إعادة تحميل) — قاعدة "Respond BEFORE navigation".
5. **اصطلاحات:** async/await للاستدعاءات المتسلسلة، `.then/.catch` للمتسامحة.
   كل async مع `try/catch` يرجع `{ok:false, error:err.message}`.
6. **لا كروية:** الألوان من `design-system/tokens.css`، الممرات الثابتة من `PORTAL_MAP.md`،
   بيانات البوابة لا تُكتب حرفياً في الكود.

---

## أنماط يجب / مُحرَّم

| يجب | حرَّم |
|-----|------|
| `return { ok: true, data }` | `return true` بلا سياق رد |
| `catch (e) { return { ok:false, error: e.message } }` | `catch {}` فارغ صامت |
| `messageBus.on(action, handler)` | `chrome.runtime.onMessage.addListener` في كل ملف |
| `sendResponse` قبل التنقل | `await navigation` قبل الرد |
| `async function` + `await` واضح | callbacks متسلسلة غير واضحة |
| ثوابت الأفعال في بداية الملف | نصوص مجهولة داخل body |

---

## أمثلة / Examples

### مسجّل خلال messageBus (نمط موحّد):
```js
messageBus.on('GET_ORDERS', async (msg, sendResponse) => {
  try {
    const rows = await loadOrders(msg.dateFrom, msg.dateTo);
    sendResponse({ ok: true, count: rows.length, rows });
  } catch (e) {
    sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});
```

### خطأ موحّد (helper مشترك):
```js
const fail = (sendResponse, e) =>
  sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
...
try { ... } catch (e) { fail(sendResponse, e); }
```

---

## Generic response contract

- `{ ok: true }` — عملية بلا بيانات.
- `{ ok: true, data }` — نجاح + بيانات (device، parts، report…).
- `{ ok: true, pending: true, error: 'محتجيز' }` — نجاح جزئي/انتقال سيتم لاحقاً
  (مثل EXTRACT_DEVICE_DATA من Reportdetail).
- `{ ok: false, error: 'لم يتم العثور على...' }` — فشل معلوم.

---

## مرجع / Reference Files
- `master-portal/shared/message-bus.js` — الموزّع الموحّد (يجب استخدامه).
- `master-portal/design-system/tokens.css` — التوكنز.
- `PORTAL_MAP.md` — الدومينات والشاشات (مرجع فقط، لا تُنسخ).
- `KNOWN_ISSUES.md` — بند 12 يوثق قرار الـ dispatcher.