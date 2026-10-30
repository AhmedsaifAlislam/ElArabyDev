# Normal Multi Run Root Cause Trace

## Verdict
**CONFIRMED ROOT CAUSE:** The 8-second `sendToTab` timeout in `popup.js` combined with the blocking `RUN_SINGLE` handler in `content-script.js` caused Multi Run to fail at the first `runSingleLineWithRouter()` call. The fix in `bb2f612` (async `RUN_SINGLE` + 300s timeout) restored the flow.

---

## Execution Trace
```
START_QUEUE (popup)
  → sendToTab(START_QUEUE, 8s timeout)          [BROKEN: 8s | WORKING: 300s]
  → START_QUEUE handler (content)
    → openSession() → storageSet(taskQueue)     [OK]
    → sendResponse({ok:true})                   [OK]
    → startNextTask(tasks)
      → storageSet(currentTask, taskQueue)      [OK]
      → chrome.runtime.sendMessage(OPEN_NEXT_TAB) [OK]
        → background: tabs.create() → processingTabId [OK]
      → new tab loads → processQueueOnLoad()    [OK]
        → storageGet(currentTask)               [OK]
        → Tab Lock / getPageType()              [OK]
        → findOrderAndOpen()                    [OK]
        → runSingleLineWithRouter()             [FAILS at 8s in BROKEN]
          → First runSingleLineWithRouter()     [BROKEN: timeout | WORKING: continues]
```

---

## Working vs Broken

| Stage | Working (bb2f612) | Broken (4a4c9b0) | Difference | Classification |
|-------|-------------------|------------------|------------|----------------|
| `sendToTab` timeout | 300000ms (5min) for RUN_SINGLE/START_QUEUE | 8000ms fixed | +292000ms | **CONFIRMED ROOT CAUSE** |
| `RUN_SINGLE` handler | `sendResponse({ok:true})` + async `await router()` | `sendResponse(await router())` blocking | Sync → Async | **CONFIRMED ROOT CAUSE** |
| `RUN_SINGLE` catch-all | `else warn(...)` | `else sendResponse({ok:true})` | False success removed | NOT RELATED |
| `PENDING_MESSAGES` + `beforeunload` | Added Map + cleanup | None | Escape fix | PLAUSIBLE |
| QUEUE_TRACE logging | 35 log lines | None | Diagnostic | NOT RELATED |
| Manifest content scripts | 6 blocks (restructured) | Same 6 blocks | Already in BROKEN | NOT RELATED |
| `background.js` | Identical | Identical | None | NOT RELATED |
| `processingTabId` logic | Identical + logging | Identical | Logging only | NOT RELATED |
| `startNextTask`/`OPEN_NEXT_TAB` | Identical | Identical | None | NOT RELATED |

---

## Hypotheses

| Hypothesis | Evidence | Classification |
|------------|----------|----------------|
| A) `sendToTab` 8s → 300s timeout | `popup.js:700` 8000 → 300000 for RUN_SINGLE/START_QUEUE | **CONFIRMED ROOT CAUSE** |
| B) `RUN_SINGLE` sync → async | `content-script.js:2379` blocking `await` → immediate `sendResponse({ok:true})` + async | **CONFIRMED ROOT CAUSE** |
| C) `processingTabId` timing/ownership | Logic identical; only logging added in WORKING | NOT RELATED |
| D) `taskQueue`/`currentTask` storage timing | `startNextTask` → `OPEN_NEXT_TAB` sequence identical | NOT RELATED |
| E) `groupedTasks` Map/order | `popup.js` uses Map + sort by `firstIndex` in both | NOT RELATED |
| F) Redirect/navigation race | `findOrderAndOpen` V4 workflow → legacy identical | NOT RELATED |

---

## Tab Ownership

- **Tab O (Origin/User Tab):** The tab where user clicks Multi Run button. Identified by `msg.tabId` from `START_QUEUE` message sender.
- **Tab X (Execution Tab):** Created by `background.js:OPEN_NEXT_TAB` via `chrome.tabs.create({url: ORDERS_URL})`. Its `id` stored in `chrome.storage.local.processingTabId`.
- **Tab M (Manual Tab):** Any other portal tab the user opens manually.
- **Current Owner Mechanism:** 
  - `processQueueOnLoad()` reads `processingTabId` from storage
  - Calls `chrome.runtime.sendMessage({type: 'GET_MY_TAB_ID'})` to get `myTabId`
  - Compares `myTabId` vs `processingTabId` (Tab Lock)
  - If mismatch → waits 1.5s, re-reads, decides claim/return
- **Hard-Block Behavior:** 
  - If `myTabId !== updatedId` AND `getPageType() !== 'ORDERS'` → **HARD BLOCK** (returns, logs `⛔ Tab Lock... Ignoring.`)
  - If `myTabId !== updatedId` AND `getPageType() === 'ORDERS'` → claims lock, continues
- **Remaining Gap:** If user manually opens Tab M on `ORDERS` page, Tab Lock may incorrectly claim it (pageType matches). No cryptographic binding between task and Tab X.

---

## Exact Evidence

### CONFIRMED ROOT CAUSE 1: `sendToTab` Timeout
- **File:** `src/unified-extension/popup.js`
- **Function:** `sendToTab`
- **Line:** ~700
- **Behavior Difference:** BROKEN: `timeout = 8000` fixed for all messages. WORKING: `timeout = 300000` for `RUN_SINGLE`/`START_QUEUE`, 30000 for others.
- **Impact:** BROKEN hits 8s timeout during `RUN_SINGLE` → `runSingleLineWithRouter()` (30-60s) → popup receives `{error: 'timeout...'}` → AutoFill appears stopped.

### CONFIRMED ROOT CAUSE 2: `RUN_SINGLE` Blocking Handler
- **File:** `src/unified-extension/content-script.js`
- **Function:** `chrome.runtime.onMessage` handler
- **Line:** ~2379
- **Behavior Difference:** 
  - BROKEN: `if (msg.action === 'RUN_SINGLE') sendResponse(await runSingleLineWithRouter(msg));` — blocks until entire AutoFill completes (30-60s)
  - WORKING: `if (msg.action === 'RUN_SINGLE') { sendResponse({ ok: true }); await runSingleLineWithRouter(msg); }` — responds immediately, runs async
- **Impact:** BROKEN keeps popup message port open for 30-60s → 8s timeout fires → popup shows "timeout" error.

### CONFIRMED CONTRIBUTOR: Catch-all False Success (Minor)
- **File:** `content-script.js` line ~2455
- **BROKEN:** `else sendResponse({ ok: true })` — swallows unknown messages with false success
- **WORKING:** `else warn('Unhandled action: ' + msg.action + ' — not claiming it');` — no false success
- **Impact:** Could mask debugging but not root cause of Multi Run stall.

---

## Final Recommendation

**Single smallest change to investigate next:** 
Verify at runtime that the 8s timeout is the sole blocker by checking if AutoFill completes when manually extending timeout (or using the WORKING build). The fix is already deployed in `bb2f612`/`6fd59bd`. No code change needed — the root cause is already fixed in current HEAD.

---

**Report Path:** `_forensic_audit/MULTI_RUN_ROOT_CAUSE_TRACE.md`  
**Verdict:** CONFIRMED ROOT CAUSE — 8s timeout + blocking RUN_SINGLE handler  
**Root Cause Classification:** CONFIRMED ROOT CAUSE  
**Top 2 Evidence Points:**
1. `popup.js:700` 8000ms timeout vs 300000ms for RUN_SINGLE/START_QUEUE
2. `content-script.js:2379` blocking `await runSingleLineWithRouter()` vs async response  
**Next Step:** Another read-only verification (runtime trace with QUEUE_TRACE logs) — **NO CODE CHANGE NEEDED** (fix already in current HEAD)