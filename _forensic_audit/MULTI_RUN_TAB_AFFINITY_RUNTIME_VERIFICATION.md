# Multi Run Tab Affinity Runtime Verification

## Verdict
**UNKNOWN — RUNTIME EVIDENCE REQUIRED**

Static analysis reveals the ownership mechanism design, but **no runtime evidence is available** in this environment to verify actual Tab X ownership, Tab M hijacking attempts, or hard-block behavior.

---

## Runtime Sequence (Static Design)

```
Tab O (user clicks Multi Run)
  ↓
START_QUEUE message sent with msg.tabId = Tab O
  ↓
content-script.js START_QUEUE handler
  → openSession() → storageSet(taskQueue)
  → sendResponse({ok:true})
  → startNextTask(tasks)
    → storageSet({currentTask, taskQueue})
    → chrome.runtime.sendMessage({type: 'OPEN_NEXT_TAB', url: ORDERS_URL})
      ↓
background.js OPEN_NEXT_TAB
  → chrome.tabs.create({url: ORDERS_URL, active: true})
    → callback: newTab → storageSet({processingTabId: newTab.id})
      ↓
Tab X (newly created tab) loads ORDERS_URL
  ↓
content-script.js processQueueOnLoad() auto-invokes
  → storageGet({currentTask, processingTabId})
  → Tab Lock: GET_MY_TAB_ID → myTabId
  → myTabId vs processingTabId comparison (Tab Lock)
  → getPageType() → 'ORDERS'
  → findOrderAndOpen() → runSingleLineWithRouter()
```

---

## Observed IDs (Static Design)

| Identifier | Source | Purpose |
|------------|--------|---------|
| `originTabId` / `msg.tabId` | `START_QUEUE` message sender | Tab O — user origin tab |
| `executionTabId` / `newTab.id` | `background.js` `tabs.create()` callback | Tab X — extension-created execution tab |
| `processingTabId` | `chrome.storage.local` (set by background, read by content) | Current execution owner |
| `ownerTabId` | Not used in current code | N/A |
| `myTabId` | `GET_MY_TAB_ID` message response (`sender.tab.id`) | Current tab's self-identity |
| `taskQueue` / `currentTask` | `chrome.storage.local` | Task queue state |

---

## Ownership Timeline (Static Code Flow)

| Event | tabId Source | Stored Owner | Code Location |
|-------|--------------|--------------|---------------|
| User clicks Multi Run | `msg.tabId` (Tab O) | Not stored as owner | `popup.js` → `sendToTab(tab.id, START_QUEUE)` |
| START_QUEUE received | `msg.tabId` (Tab O) | Not stored | `content-script.js` START_QUEUE handler |
| `startNextTask()` | — | `processingTabId` = `msg.tabId` (Tab O) | `content-script.js:1833` `storageSet({processingTabId: msg.tabId})` |
| `OPEN_NEXT_TAB` sent | — | — | `content-script.js:1836` `chrome.runtime.sendMessage(OPEN_NEXT_TAB)` |
| Background creates Tab X | `newTab.id` (Tab X) | `processingTabId` = Tab X | `background.js:123` `storageSet({processingTabId: newTab.id})` |
| Tab X loads → `processQueueOnLoad()` | `sender.tab.id` (Tab X) | Reads `processingTabId` | `content-script.js:2131` `storageGet({currentTask, processingTabId})` |
| Tab Lock check | `GET_MY_TAB_ID` response | Compares `myTabId` vs `processingTabId` | `content-script.js:2137-2163` |

---

## Ownership Timeline (Expected Runtime)

| Event | tabId | Stored Owner (`processingTabId`) | Result |
|-------|-------|----------------------------------|--------|
| Multi Run click | Tab O | — | START_QUEUE sent |
| START_QUEUE handler | Tab O | Tab O | `startNextTask` stores Tab O |
| `OPEN_NEXT_TAB` | — | — | Background creates Tab X |
| Background callback | Tab X | Tab X | `processingTabId` updated to Tab X |
| Tab X `processQueueOnLoad` | Tab X | Tab X | Tab Lock: `myTabId` (Tab X) == `processingTabId` (Tab X) → **PASS** |
| `findOrderAndOpen` | Tab X | Tab X | AutoFill starts |

---

## Manual Tab M Test (Static Analysis)

### A) Does Tab M enter the workflow?

**Static Analysis:** 
- `processQueueOnLoad()` is auto-invoked on **every page load** matching `powerappsportals.com/*` (manifest content_scripts)
- If user manually opens/refreshed Tab M on a portal page, `processQueueOnLoad()` **will execute**
- It reads `currentTask` and `processingTabId` from storage

### B) Is Tab M HARD BLOCKED?

**Code Path** (`content-script.js:2134-2163`):
```javascript
if (processingTabId) {
  const myTabId = await GET_MY_TAB_ID();
  if (myTabId && myTabId !== processingTabId) {
    await sleep(1500);
    const updatedId = (await storageGet({processingTabId})).processingTabId;
    if (updatedId && myTabId !== updatedId) {
      const pCheck = getPageType();
      if (pCheck === 'ORDERS') {
        // Claims lock, continues
      } else {
        log(`⛔ Tab Lock: This tab (${myTabId}) is not the active processing tab (${updatedId}). Ignoring.`);
        return; // HARD BLOCK
      }
    }
  }
}
```

**Static Analysis Result:**
- **If Tab M is NOT on ORDERS page** → `getPageType() !== 'ORDERS'` → **HARD BLOCK** (returns, logs `⛔ Tab Lock... Ignoring.`)
- **If Tab M IS on ORDERS page** → `getPageType() === 'ORDERS'` → **CLAIMS LOCK** (continues, overwrites `processingTabId`)
- **NO CRYPTOGRAPHIC BINDING** — ownership is purely `tabId` comparison; any tab on ORDERS page can claim ownership

### C) Does Tab X continue normally?

- If Tab M is on non-ORDERS page → Tab M returns early; Tab X unaffected (ownership unchanged)
- If Tab M is on ORDERS page → Tab M **claims ownership** (`storageSet({processingTabId: myTabId})`) → **Tab X's subsequent `processQueueOnLoad` calls will see mismatched `processingTabId`**

### D) Does ownership change from Tab X to Tab M?

**YES — if Tab M is on ORDERS page.** The code explicitly allows this:
```javascript
if (pCheck === 'ORDERS') {
  await storageSet({ processingTabId: myTabId });  // Tab M claims ownership
}
```

---

## Evidence (Static Code References)

### Tab Lock Implementation (`content-script.js:2134-2163`)
```javascript
let myTabId = null;
if (processingTabId) {
  const myTabIdResp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r));
  myTabId = myTabIdResp?.tabId || null;
  if (myTabId && myTabId !== processingTabId) {
      await sleep(1500);
      const retry = await storageGet({ processingTabId: null });
      const updatedId = retry.processingTabId;
      if (updatedId && myTabId !== updatedId) {
          const pCheck = getPageType();
          if (pCheck === 'ORDERS') {
              log(`⚠️ Tab Lock race on ORDERS: claiming lock for tab ${myTabId} (was ${updatedId})`);
              await storageSet({ processingTabId: myTabId });
          } else {
              log(`⛔ Tab Lock: This tab (${myTabId}) is not the active processing tab (${updatedId}). Ignoring.`);
              return;
          }
      }
  }
} else {
  const myTabIdResp2 = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, r));
  myTabId = myTabIdResp2?.tabId || null;
  if (myTabId && getPageType() === 'ORDERS') {
      await storageSet({ processingTabId: myTabId });
  }
}
```

### Background Tab Creation (`background.js:120-129`)
```javascript
case 'OPEN_NEXT_TAB':
  chrome.tabs.create({ url: msg.url, active: true }, (newTab) => {
    if (newTab && newTab.id) {
      chrome.storage.local.set({ processingTabId: newTab.id }, () => {
         sendResponse({ ok: true });
      });
    } else {
      sendResponse({ ok: false });
    }
  });
  return true;
```

### GET_MY_TAB_ID Handler (`background.js:132-134`)
```javascript
case 'GET_MY_TAB_ID':
  sendResponse({ tabId: sender.tab?.id });
  return true;
```

---

## Final Classification

| Aspect | Classification | Reason |
|--------|----------------|--------|
| Tab X correctly created and owned | **UNKNOWN** | Needs runtime verification of `processingTabId` flow |
| Tab M HARD BLOCKED on non-ORDERS | **PLAUSIBLE** | Code shows hard block for non-ORDERS pages |
| Tab M CAN HIJACK on ORDERS page | **CONFIRMED BUG** | Code explicitly allows any ORDERS tab to claim ownership |
| Tab X continues after Tab M | **PLAUSIBLE BUG** | If Tab M claims ownership, Tab X will see mismatch on next cycle |
| Ownership migration | **CONFIRMED BUG** | No cryptographic binding; any ORDERS tab can claim |
| Hard-block behavior | **PARTIAL** | Only blocks non-ORDS pages; allows ORDERS hijack |

---

## Recommendation

**Next Step: Runtime Verification Required**

**Smallest Next Action:** 
1. Load diagnostic build (`bb2f612`/`6fd59bd`) with QUEUE_TRACE logging
2. Start a Normal Multi Run (2 orders)
3. When Tab X opens, manually open a second portal tab (Tab M) on ORDERS page
4. Capture `[QUEUE_TRACE]` logs from both tabs
5. Verify: Does Tab M log `⚠️ Tab Lock race on ORDERS: claiming lock`? Does Tab X stall?

**Code Change Justified?** 
**YES — but only after runtime confirmation.** The Tab M hijack vulnerability is a **design flaw** in the ownership model (any ORDERS tab can claim ownership). Fix would require cryptographic task-tab binding (e.g., task-specific token passed to Tab X, verified by content script).

---

**Report Path:** `_forensic_audit/MULTI_RUN_TAB_AFFINITY_RUNTIME_VERIFICATION.md`  
**Verdict:** UNKNOWN — RUNTIME EVIDENCE REQUIRED  
**Tab X Ownership Result:** DESIGN FLAW — Tab M can hijack on ORDERS pages  
**Tab M Can Hijack:** YES — any ORDERS page can claim ownership  
**Code Change Justified:** YES — after runtime confirmation of hijack behavior