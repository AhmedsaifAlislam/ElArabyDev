# Runtime Test Instructions — Multi Run Tab Ownership Verification

---

## Exact Test Procedure

**Prerequisites:**
- Edge/Chrome with ElArabyDev extension loaded (current HEAD `6fd59bd` / deploy `deploy_backup_20260831_105900`)
- Active ElAraby portal session (authenticated, on `https://elarabyportalpfs.powerappsportals.com`)
- Extension popup accessible

**Step-by-Step:**

1. **Open DevTools on the portal tab (Tab O)**
   - Press `F12` → Console tab
   - Filter: type `[QUEUE_TRACE]` in filter box
   - Keep DevTools open for the entire test

2. **Start Normal Multi Run**
   - Open extension popup → Search tab
   - Paste 2 order IDs (e.g., `CAS2026082553172366`, `CAS2026081552971241`)
   - Click **"تشغيل متعدد" / Multi Run**
   - Wait for new tab to open (Tab X)

3. **Identify Tab X**
   - New tab opens → note its **tabId** (DevTools title bar or `chrome.tabs.query` in Console)
   - In Console: `[QUEUE_TRACE]` logs should show:
     - `phase=start_queue` (on Tab O)
     - `phase=startNextTask` (on Tab O)
     - `phase=processQueueOnLoad` (on Tab X)
     - `phase=page_type result="ORDERS"` (on Tab X)
     - `phase=workflow action=findOrderAndOpen` (on Tab X)

4. **Wait for AutoFill to begin on Tab X**
   - Confirm `[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter` appears on Tab X
   - AutoFill is now active on Tab X

4. **Open Tab M (Manual ORDERS tab)**
   - While Tab X is still processing (AutoFill active):
   - In same browser window: `Ctrl+T` → paste `https://elarabyportalpfs.powerappsportals.com/en-US/Orders/`
   - **DO NOT** open extension popup in Tab M
   - **DO NOT** click any extension buttons in Tab M
   - Just let the page load fully

5. **Observe Both Tabs**
   - Watch Console on **Tab X** (keep DevTools open)
   - Open DevTools on **Tab M** (`F12`) → Console → filter `[QUEUE_TRACE]`
   - Wait 10-15 seconds after Tab M fully loads

6. **Capture Logs**
   - **Tab X Console:** Right-click → "Save as..." → save as `tabx_logs.txt`
   - **Tab M Console:** Right-click → "Save as..." → save as `tabm_logs.txt`
   - **Tab O Console (optional):** Save as `tabo_logs.txt`

7. **Send Logs**
   - Send all three log files (or paste relevant `[QUEUE_TRACE]` sections)

---

## What To Capture

**Copy exactly these log patterns (filter `[QUEUE_TRACE]`):**

```
[QUEUE_TRACE] phase=processQueueOnLoad url="..." 
[QUEUE_TRACE] phase=storage currentTask=yes taskId="..." orderId="..." processingTabId="..."
[QUEUE_TRACE] phase=tab_lock myTabId="..." processingTabId="..." pageType="..." url="..."
[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="..." processingTabId="..." pageType="..."
[QUEUE_TRACE] phase=tab_lock result=decision pCheck="ORDERS" myTabId="..." updatedId="..."
[QUEUE_TRACE] phase=tab_lock result=claim myTabId="..."
[QUEUE_TRACE] phase=page_type result="ORDERS" url="..." orderId="..." taskId="..."
[QUEUE_TRACE] phase=workflow action=findOrderAndOpen taskId="..." orderId="..."
[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="..." orderId="..."
[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="..." processingTabId="..." pageType="..."
[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="..." processingTabId="..." pageType="..."
[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="..." processingTabId="..." pageType="..."
```

**Also capture from Console (if any):**
- `⚠️ Tab Lock race on ORDERS: claiming lock for tab ...`
- `⛔ Tab Lock: This tab (...) is not the active processing tab (...). Ignoring.`

---

## Expected Successful Trace (Placeholders)

```
# Tab O (origin)
[QUEUE_TRACE] phase=start_queue tasks=2 order="1:CAS...|2:CAS..."
[QUEUE_TRACE] phase=startNextTask current="CAS..." remaining=1 queue="CAS...|CAS..."

# Tab X (extension-created)
[QUEUE_TRACE] phase=processQueueOnLoad url="https://elarabyportalpfs.powerappsportals.com/en-US/Orders/"
[QUEUE_TRACE] phase=storage currentTask=yes taskId="task-..." orderId="CAS..." processingTabId="12345"
[QUEUE_TRACE] phase=tab_lock myTabId="pending" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock myTabId="12345" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock result=claim myTabId="12345"
[QUEUE_TRACE] phase=page_type result="ORDERS" url="..." orderId="CAS..." taskId="task-..."
[QUEUE_TRACE] phase=workflow action=findOrderAndOpen taskId="task-..." orderId="CAS..."
[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="task-..." orderId="CAS..."

# Tab M (manual ORDERS) — SAFE pattern (hard blocked)
[QUEUE_TRACE] phase=processQueueOnLoad url="https://elarabyportalpfs.powerappsportals.com/en-US/Orders/"
[QUEUE_TRACE] phase=storage currentTask=yes taskId="task-..." orderId="CAS..." processingTabId="12345"
[QUEUE_TRACE] phase=tab_lock myTabId="pending" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock myTabId="67890" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="67890" processingTabId="12345" pageType="ORDERS"
[QUEUE_TRACE] phase=tab_lock result=decision pCheck="ORDERS" myTabId="67890" updatedId="12345"
[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="67890" processingTabId="12345" pageType="ORDERS"
→ Tab M exits, Tab X continues
```

---

## Hijack Evidence (What Proves Tab M Hijack)

**If you see THIS pattern on Tab M, hijack occurred:**

```
# Tab M claims ownership (hijack)
[QUEUE_TRACE] phase=processQueueOnLoad url="https://elarabyportalpfs.powerappsportals.com/en-US/Orders/"
[QUEUE_TRACE] phase=storage currentTask=yes taskId="task-..." orderId="CAS..." processingTabId="12345"
[QUEUE_TRACE] phase=tab_lock myTabId="pending" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock myTabId="67890" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="67890" processingTabId="12345" pageType="ORDERS"
[QUEUE_TRACE] phase=tab_lock result=decision pCheck="ORDERS" myTabId="67890" updatedId="12345"
[QUEUE_TRACE] phase=tab_lock result=claim myTabId="67890"           ← HJACK: Tab M claims ownership
[QUEUE_TRACE] phase=page_type result="ORDERS" url="..." orderId="CAS..." taskId="task-..."
[QUEUE_TRACE] phase=workflow action=findOrderAndOpen taskId="task-..." orderId="CAS..."   ← Tab M proceeds to AutoFill
```

**Corresponding Tab X stall (if hijack):**
```
# Tab X next cycle sees ownership changed
[QUEUE_TRACE] phase=processQueueOnLoad url="..."
[QUEUE_TRACE] phase=storage currentTask=yes taskId="task-..." orderId="CAS..." processingTabId="67890"  ← changed!
[QUEUE_TRACE] phase=tab_lock myTabId="12345" processingTabId="67890" pageType="..." url="..."
[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="12345" processingTabId="67890" pageType="..."
→ Tab X hard-blocked, stops
```

---

## Safe Evidence (What Proves Tab M Was Blocked)

**If you see THIS pattern on Tab M, it was safely blocked:**

```
[QUEUE_TRACE] phase=processQueueOnLoad url="https://elarabyportalpfs.powerappsportals.com/en-US/Orders/"
[QUEUE_TRACE] phase=storage currentTask=yes taskId="task-..." orderId="CAS..." processingTabId="12345"
[QUEUE_TRACE] phase=tab_lock myTabId="pending" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock myTabId="67890" processingTabId="12345" pageType="ORDERS" url="..."
[QUEUE_TRACE] phase=tab_lock result=retry_or_return reason=processing_tab_mismatch myTabId="67890" processingTabId="12345" pageType="ORDERS"
[QUEUE_TRACE] phase=tab_lock result=decision pCheck="ORDERS" myTabId="67890" updatedId="12345"
[QUEUE_TRACE] phase=tab_lock result=return reason=tab_lock_mismatch_not_orders myTabId="67890" processingTabId="12345" pageType="ORDERS"
→ Tab M exits (returns), NO claim, NO AutoFill
```

**Tab X continues uninterrupted:**
```
[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="task-..." orderId="CAS..."
[QUEUE_TRACE] phase=workflow action=findOrderAndOpen taskId="task-..." orderId="CAS..."
[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="task-..." orderId="CAS..."
```

---

## Failure/Inconclusive Conditions

The test is **INCONCLUSIVE** if:

1. **No `[QUEUE_TRACE]` logs appear** — Diagnostic build not loaded (verify `edge://extensions` → Reload)
2. **Tab X never opens** — `OPEN_NEXT_TAB` failed (check `background.js` errors in service worker console)
3. **Tab M never triggers `processQueueOnLoad`** — Content script not injected (check manifest matches)
3. **Logs truncated** — Console cleared or filtered; must keep DevTools open from step 1
4. **Tab X finishes before Tab M opens** — Must open Tab M **while Tab X is actively processing** (during `findOrderAndOpen` or `runSingleLineWithRouter`)
5. **Only one tab's logs captured** — Must capture both Tab X and Tab M simultaneously
6. **Tab M opened on non-ORDERS page** — Test requires Tab M on `/en-US/Orders/` specifically

---

## REQUIRED USER ACTION

> **Run one Normal Multi Run, keep the browser open, reproduce the Tab M scenario (open second ORDERS tab while first is processing), then send the complete relevant console output from BOTH Tab X and Tab M (filtered `[QUEUE_TRACE]`).**