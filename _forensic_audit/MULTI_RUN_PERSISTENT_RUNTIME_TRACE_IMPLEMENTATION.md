# Multi-Run Persistent Runtime Trace Implementation

## Files Changed

| File | Changes |
|------|---------|
| `src/unified-extension/popup.js` | Added trace storage utilities, trace events for Multi Run flow, Copy/Clear Runtime Trace UI buttons |
| `src/unified-extension/popup.html` | Added "Copy Runtime Trace" and "Clear Runtime Trace" buttons in Search tab |
| `src/unified-extension/content-script.js` | Added traceEvent function, trace events throughout Multi Run execution path |
| `src/unified-extension/background.js` | Added trace events for OPEN_NEXT_TAB, TAB_CREATE_SUCCESS/ERROR, GET_MY_TAB_ID |
| `src/unified-extension/popup.html` | Added "Copy Runtime Trace" and "Clear Runtime Trace" buttons in Search tab |

---

## Trace Events Added

### POPUP Events
| Event | Trigger | Key Fields |
|-------|---------|------------|
| `MULTI_RUN_CLICK` | User clicks "تشغيل متعدد" | tabId, orderId, queueLength |
| `QUEUE_INITIALIZED` | Tasks built and stored | queueLength, taskIds |
| `START_QUEUE_SEND` | Before sending START_QUEUE | tabId, queueLength, delay |
| `START_QUEUE_RESPONSE` | After START_QUEUE response | ok, error |
| `RUN_SINGLE_SEND` | Before sending RUN_SINGLE | tabId, orderId |
| `RUN_SINGLE_RESPONSE` | After RUN_SINGLE response | ok, error |

### CONTENT SCRIPT Events
| Event | Trigger | Key Fields |
|-------|---------|------------|
| `START_QUEUE_RECEIVED` | START_QUEUE message received | tabId, queueLength |
| `QUEUE_INITIALIZED` | Queue stored in storage | queueLength |
| `START_NEXT_TASK_ENTER` | startNextTask called | queueLength, nextOrderId |
| `CURRENT_TASK_SET` | currentTask stored | taskId, orderId, queueLength |
| `OPEN_NEXT_TAB_REQUEST` | OPEN_NEXT_TAB message sent | url |
| `CONTENT_SCRIPT_LOADED` | Content script initializes | url |
| `PROCESS_QUEUE_ON_LOAD_ENTER` | processQueueOnLoad starts | url |
| `PROCESS_QUEUE_STORAGE_READ` | Storage read for currentTask | currentTaskPresent, taskId, orderId, processingTabId |
| `TAB_LOCK_CHECK` | Tab Lock check starts | myTabId, processingTabId, pageType |
| `TAB_LOCK_BLOCK` | Tab Lock hard blocks | reason, myTabId, processingTabId, pageType |
| `TAB_LOCK_CLAIM` | Tab Lock claims ownership | myTabId, pageType |
| `TAB_LOCK_MISMATCH` | Tab Lock mismatch detected | myTabId, processingTabId, pageType |
| `PAGE_TYPE_DETECTED` | Page type determined | pageType, taskId, orderId, url |
| `FIND_ORDER_START` | findOrderAndOpen starts | taskId, orderId |
| `FIND_ORDER_SUCCESS` | Order found | taskId, orderId |
| `FIND_ORDER_FAILURE` | Order not found | taskId, orderId |
| `RUN_SINGLE_RECEIVED` | RUN_SINGLE received | taskId, orderId |
| `ROUTER_START` | runSingleLineWithRouter starts | taskId, orderId |
| `FIND_ORDER_START` | findOrderAndOpen starts | taskId, orderId |
| `FIND_ORDER_SUCCESS` | Order found | taskId, orderId |
| `FIND_ORDER_FAILURE` | Order not found | taskId, orderId |
| `AUTOFILL_START` | AutoFill begins | taskId, orderId |
| `PROCESS_QUEUE_ABORT` | Early return from processQueueOnLoad | reason, url |

### BACKGROUND Events
| Event | Trigger | Key Fields |
|-------|---------|------------|
| `OPEN_NEXT_TAB_RECEIVED` | OPEN_NEXT_TAB message received | url |
| `TAB_CREATE_SUCCESS` | Tab created successfully | tabId, url |
| `TAB_CREATE_ERROR` | Tab creation failed | url, error |
| `PROCESSING_TAB_SET` | processingTabId stored | processingTabId |
| `GET_MY_TAB_ID` | Tab ID requested | tabId |

### Early Returns Tracked (PROCESS_QUEUE_ABORT)
- `no_current_task` - No currentTask in storage
- `no_lock_yet` / `processing_tab_mismatch` - Tab Lock checks
- `tab_lock_mismatch_not_orders` - Wrong page type for Tab Lock claim
- `no_current_task` - Guard at start of processQueueOnLoad

---

## UI Added

**Search Tab (panel-search):**
- "نسخ التتبع" (Copy Runtime Trace) button - copies formatted trace to clipboard
- "مسح التتبع" (Clear Runtime Trace) button - clears the trace storage

**Clipboard Format:**
```
MULTI RUN RUNTIME TRACE

[12:01:02.120] event=MULTI_RUN_CLICK tabId=123 orderId=CAS... queueLength=2
[12:01:02.450] event=QUEUE_INITIALIZED queueLength=2
[12:01:02.050] event=TAB_CREATE_SUCCESS tabId=456
[12:01:03.900] event=PROCESS_QUEUE_ON_LOAD_ENTER tabId=456
[12:01:04.000] event=PROCESS_QUEUE_ABORT reason=processingTabId_mismatch tabId=456 processingTabId=123
```

---

## Early Returns Covered

| Function | Early Return | Trace Event |
|----------|--------------|-------------|
| `processQueueOnLoad` | `!currentTask` | `PROCESS_QUEUE_ABORT: no_current_task` |
| `processQueueOnLoad` | Tab Lock mismatch + not ORDERS | `TAB_LOCK_BLOCK` / `PROCESS_QUEUE_ABORT` |
| `startNextTask` | Empty queue | `BATCH_DONE` (existing) |
| `runSingleLineWithRouter` | Router already running | `ROUTER_START` with `skipped: true` |
| `findOrderAndOpen` | Order not found | `FIND_ORDER_FAILURE` |

---

## Confirmation Business Logic Was Not Changed

| Protected Feature | Status |
|-------------------|--------|
| Async RUN_SINGLE (immediate response + async execution) | ✅ PRESERVED |
| Extended messaging timeout (300s for RUN_SINGLE/START_QUEUE) | ✅ PRESERVED |
| PENDING_MESSAGES + beforeunload cleanup (Escape fix) | ✅ PRESERVED |
| Catch-all false success removed | ✅ PRESERVED |
| Second Visit workflow | ✅ UNTOUCHED |
| Save/Submit/Finalize logic | ✅ UNTOUCHED |
| Technician fallback / warranty behavior | ✅ UNTOUCHED |
| Second Visit profiles/defaults | ✅ UNTOUCHED |

---

## Validation

| Check | Result | Details |
|-------|--------|---------|
| Syntax check (popup.js) | ✅ PASS | `node --check` passes |
| Syntax check (content-script.js) | ✅ PASS | `node --check` passes |
| Syntax check (background.js) | ✅ PASS | `node --check` passes |
| START_QUEUE initializes queue | ✅ CODE CONFIRMED | traceEvent at queue initialization |
| OPEN_NEXT_TAB creates execution tab | ✅ CODE CONFIRMED | traceEvent at tab creation |
| New tab enters processQueueOnLoad | ✅ CODE CONFIRMED | traceEvent at entry |
| Execution reaches findOrderAndOpen | ✅ CODE CONFIRMED | traceEvent at start |
| RUN_SINGLE uses async pattern | ✅ CODE CONFIRMED | traceEvent at receive + router start |
| No Save/Submit/Finalize triggered | ✅ CONFIRMED | Not in execution path |
| Second Visit code unmodified | ✅ CONFIRMED | No changes to Second Visit code |
| src/deploy parity | ✅ VERIFIED | Deploy script synced all files |

---

## Files Changed Summary

| File | Lines Added | Nature |
|------|-------------|--------|
| `src/unified-extension/popup.js` | ~120 | Trace storage, trace events, Copy/Clear buttons |
| `src/unified-extension/popup.html` | ~15 | Copy/Clear Runtime Trace buttons |
| `src/unified-extension/content-script.js` | ~100 | TraceEvent function, events throughout execution path |
| `src/unified-extension/background.js` | ~20 | Tab creation, GET_MY_TAB_ID trace events |
| `src/unified-extension/popup.html` | ~15 | Copy/Clear Runtime Trace buttons |

**Deploy:** Synced to `deploy/` via `tools/deploy.ps1` (backup: `deploy_backup_20260904_042454`)

---

## Next Step for User

> **Run one Normal Multi Run, keep the browser open, reproduce the Tab M scenario (open second ORDERS tab while first is processing), then send the complete relevant console output from BOTH Tab X and Tab M (filtered `[QUEUE_TRACE]`).**