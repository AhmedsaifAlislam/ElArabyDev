# AUTO-FILL RECOVERY BASELINE (PHASE 0)
> **Lead Engineer Architecture Baseline Snapshot**  
> **Repository:** AhmedsaifAlislam/ElArabyDev  
> **Timestamp:** 2026-09-06T23:55:00+03:00  
> **Status:** Phase 0 Complete — Read-Only Inspection

---

## 1. Current Git State & Parity

| Property | Value |
|---|---|
| **Branch** | `main` (up to date with `origin/main`) |
| **Current Commit (HEAD)** | `a1a3287b4f37f813d5777d84f403a45a4dc9295b` (`a1a3287`) |
| **Working Tree Status** | Clean (`nothing to commit, working tree clean`) |
| **Source vs. Deploy Parity** | **100% Identical** (`git diff --no-index src/unified-extension deploy` returns 0 differences) |
| **Active Deployment Tool** | `tools/deploy.ps1` (backs up `deploy/` to `backups/deploy_backup_*`, cleans `deploy/`, copies fresh `src/unified-extension/`) |

---

## 2. Active Manifest Architecture & Script Registration

From `src/unified-extension/manifest.json`, the active content script pipeline on `https://elarabyportalpfs.powerappsportals.com/*` is:

```
1. document_start:
   ├── lib/xlsx.full.min.js
   ├── lib/exceljs.min.js
   ├── elaraby-phone-reveal-layer0.js (world: "MAIN")
   ├── dock-fab-hider.js
   └── Tempermonky/DateFilter/ElAraby_DateFilter_Unlocker.user.js

2. document_idle (Data Scraping & Phone Reveal):
   ├── shared/table-scraper.js
   ├── shared/sync-manager.js
   └── Tempermonky/elaraby-phone-reveal.js

3. document_idle (Auto-Fill Core Pipeline):
   ├── shared/message-bus.js
   ├── shared/storage-proxy.js
   ├── shared/smart-log.js
   ├── shared/arabic-utils.js
   ├── shared/data-mapper.js
   ├── shared/portal-selectors.js
   ├── shared/frame-walker.js
   ├── shared/table-scraper.js
   ├── shared/excel-exporter.js
   ├── shared/portal-config.js
   ├── shared/ai-client.js
   ├── shared/n8n-client.js
   └── content-script.js  <--- ★ ACTIVE AUTOFIL HOST (3,083 lines)

4. document_idle (UI Overlays):
   ├── shared/storage-proxy.js
   ├── shared/ai-client.js
   ├── control-panel.js
   └── unified-dock.js

5. document_idle (Order Extraction):
   ├── lib/exceljs.min.js
   ├── shared/message-bus.js
   ├── shared/portal-selectors.js
   └── order-extractor.js
```

### Confirmation on `src/unified-extension/core/booking/auto-filler.js`:
* **File Size:** 1,445 lines (84,955 bytes).
* **Manifest Status:** **NOT registered** in `manifest.json`.
* **Import/Require Status:** **NOT imported**, required, or fetched by any file in `src/unified-extension/`.
* **Conclusion:** It is an **orphaned / legacy snapshot** from an earlier merge experiment (August 16–22). It plays **zero active role** in current runtime execution. **It will NOT be touched, merged, or deleted during Phase 1.**

---

## 3. Active Runtime Auto-Fill Execution Path

### A. Entry Points
1. **Single Run:**
   * User clicks "بدء التشغيل" (Single) in `popup.js`.
   * `popup.js` sends `chrome.tabs.sendMessage(activeTab.id, { action: 'RUN_SINGLE', line, data: { ... } })`.
   * Message listener in `content-script.js` catches `RUN_SINGLE`.
   * Immediately responds `{ ok: true }` (recovered in `bb2f612` to prevent extension port timeouts).
   * Asynchronously calls `runSingleLineWithRouter(msg)`.

2. **Multi Run (Queue):**
   * User pastes lines into `popup.html` and clicks "تشغيل متعدد".
   * `popup.js` generates task array with `generateTaskId()`.
   * `popup.js` sends `chrome.tabs.sendMessage(activeTab.id, { action: 'START_QUEUE', tasks, delay })`.
   * Message listener in `content-script.js` catches `START_QUEUE`:
     - Initializes `openSession(batchId, tasks)`.
     - Sets `taskQueue = tasks.slice(1)`, `processingTabId = msg.tabId`.
     - Responds `{ ok: true }`.
     - Calls `startNextTask(tasks)`.
     - `startNextTask` sets `currentTask = tasks[0]` and messages `background.js` to open `ORDERS_URL` in a dedicated execution tab.
   * New tab loads `ORDERS_URL` -> triggers `content-script.js` -> invokes `processQueueOnLoad()`.

### B. Routing & Page Progression
```
processQueueOnLoad()
  ├── Storage Guard: read currentTask, processingTabId
  ├── Tab Lock Check: compare myTabId vs processingTabId (race retry 1500ms)
  ├── Page Type Detection: p = getPageType()
  │
  ├── IF p === 'ORDERS':
  │     ├── findOrderAndOpen(currentTask.orderId, cfg)
  │     │     - Searches table/input for order number
  │     │     - Clicks order link -> navigates to workorderreview
  │     └── Status update -> 'navigating'
  │
  └── IF p === 'WORK_ORDER_REVIEW':  <--- [BROKEN IN HEAD, TO BE RESTORED]
        ├── runSingleLineWithRouter(currentTask)
        │     ├── parseDataLine(task.line)
        │     ├── Check Second Visit (task.data.secondVisitMode)
        │     ├── Check Installation (isInstallationReport())
        │     ├── Page 1: executePage1_Review()
        │     │     ├── Check isPage1AlreadyFilled()
        │     │     ├── Fill & Verify: Brand, Model1, Serial1, Model2, Serial2, Status, Date
        │     │     └── Click NextButton -> poll for Page 2
        │     ├── Page 2: executePage2_FollowUp()
        │     │     ├── Problem/Complaint Lookup Modal
        │     │     ├── Technician Lookup Modal (selectRandomTechnician)
        │     │     └── Transition decision -> Page 3 or Finalize
        │     └── Page 3: executePage3_Finalize() (Out of current validation scope)
        │
        └── Advance Queue:
              ├── finalizeOrderInSession()
              ├── clearCurrentTask()
              └── startNextTask(taskQueue)
```

---

## 4. Authoritative Historical Baselines

| Commit | Date | Key Architectural Facts | Role in Recovery |
|---|---|---|---|
| **`bb2f612`** | 2026-08-29 | **Last known fully stable Multi Run baseline.**<br>• Intact `processQueueOnLoad()` with clean `ORDERS` and `WORK_ORDER_REVIEW` branches.<br>• Async `RUN_SINGLE` with immediate ACK.<br>• Stable queue progression and session finalization. | **Primary Recovery Source** for queue lifecycle & routing. |
| **`4a4c9b0`** | 2026-08-24 | **Strict Technician Matching Baseline (P0-B.1).**<br>• `opts.strictExact` in `fillLookupModal`.<br>• Rejection of arbitrary first-row / random technician fallback.<br>• Strict status matching in `executePage1_Review` (P0-B.2). | **Authority on Technician Matching Policy.** |
| **`a19223b`** | 2026-08-27 | **Tab Lock Diagnostic Baseline.**<br>• Added `GET_MY_TAB_ID` messaging handshake.<br>• Added 1500ms wait-and-retry for tab lock.<br>• Added extensive `[QUEUE_TRACE]` logs. | **Reference for Tab Affinity** (to be refined in Phase 5). |
| **`6fd59bd`** | 2026-08-31 | **UI Pollution Injection.**<br>• Added `ea-clear-device-fab` and `showFABClearDialog` directly into `content-script.js` (~200 lines). | **Target for Isolation** into `device-clear-ui.js` in Phase 4. |
| **`8cf7b5a`** | 2026-09-05 | **Catastrophic Regression Point.**<br>• Added `traceEvent` telemetry.<br>• Accidentally deleted `else if (p === 'WORK_ORDER_REVIEW')` branch.<br>• Introduced Temporal Dead Zone `ReferenceError` on variable `p`. | **Root Cause to Reverse** in Phase 1. |

---

## 5. Confirmed Regressions in Current HEAD (`content-script.js`)

### Regression 1: Temporal Dead Zone (TDZ) ReferenceError
* **Location:** `src/unified-extension/content-script.js:2346-2347`
* **Defect:**
  ```javascript
  2346: traceEvent('PAGE_TYPE_DETECTED', { pageType: p, url: location.href, taskId: currentTask?.taskId, orderId: currentTask?.orderId });
  2347: const p = getPageType(); const cfg = await loadSelectors();
  ```
  `p` is referenced inside the object on line 2346 *before* its `const` initialization on line 2347. In V8 (Chrome/Edge), this throws an immediate runtime `ReferenceError: Cannot access 'p' before initialization`.

### Regression 2: Accidental Deletion of `WORK_ORDER_REVIEW` Branch
* **Location:** `src/unified-extension/content-script.js:2352-2434`
* **Defect:**
  In commit `8cf7b5a`, the lines:
  ```javascript
  notifyStatus(currentTask.taskId, 'navigating', 'جارٍ الانتقال...');
  } else if (p === 'WORK_ORDER_REVIEW') {
     log('[QUEUE_TRACE] phase=workflow action=runSingleLineWithRouter taskId="' + currentTask.taskId + '" orderId="' + currentTask.orderId + '"');
     notifyStatus(currentTask.taskId, 'filling', `جاري التفريغ لـ: ${currentTask.orderId}`);
  ```
  were accidentally replaced with duplicate `findOrderAndOpen` log calls.
* **Consequence:**  
  When navigating from `ORDERS` to `WORK_ORDER_REVIEW`, `processQueueOnLoad()` evaluates `if (p === 'ORDERS')` as false, skips Auto-Fill entirely, and hits:
  ```javascript
  } else {
     log('[QUEUE_TRACE] phase=page_type result=redirect target="ORDERS_URL" ...');
     location.href = ORDERS_URL;
  }
  ```
  **This traps Multi Run in an infinite redirect loop.**

---

## 6. Proposed Change Sequence

```
[Phase 0: Baseline Snapshot] <--- WE ARE HERE (STOP POINT)
       │
       ▼
[Phase 1: Surgical Recovery]
       ├── 1. Fix TDZ order in processQueueOnLoad()
       ├── 2. Restore "} else if (p === 'WORK_ORDER_REVIEW') {" branch from bb2f612
       ├── 3. Deploy via tools/deploy.ps1 and verify parity
       └── 4. Validate Single Run & Multi Run (Page 1 -> Page 2)
       │
       ▼
[Phase 2: Historical Difference Matrix]
       └── Compare all 15 subsystems against historical baselines
       │
       ▼
[Phase 3: Module Boundaries Definition]
       └── Specify precise boundaries, interfaces, and file paths
       │
       ▼
[Phase 4: Modularize In Place (Incremental)]
       ├── Step 4.1: Extract content/device-clear-ui.js
       ├── Step 4.2: Extract content/dom-waiter.js
       ├── Step 4.3: Extract content/lookup-adapter.js
       ├── Step 4.4: Extract content/page1-engine.js
       ├── Step 4.5: Extract content/page2-engine.js
       └── Step 4.6: Streamline content/autofill-orchestrator.js
       │
       ▼
[Phase 5: Tab Affinity Isolation & Hard Lock]
       └── Enforce invariant: origin/manual tabs NEVER claim processingTabId
       │
       ▼
[Phase 6: Architecture Contract & Final Handover]
       └── Produce AUTO_FILL_ARCHITECTURE_CONTRACT.md and final report
```

---

## 7. Protected Areas: Files and Logic That Will NOT Be Touched

To prevent architectural regression and protect battle-tested rules:

1. **`shared/storage-proxy.js`:** Must remain untouched. Required for Edge Tracking Prevention.
2. **`shared/message-bus.js`:** Must remain untouched. Essential for dispatching between content scripts.
3. **`shared/portal-selectors.js` / `selectors.json`:** Must remain untouched.
4. **AC Serial Rules (`isACProductType`, `clearModel2Serial2Fields`, `isRealSerialValue`):** Must remain identical.
5. **Second Visit Semantics (`task.data.secondVisitMode`):** Must remain transparent and unchanged.
6. **Technician Exact Matching (`opts.strictExact` from `4a4c9b0`):** No random/first fallback.
7. **Save / Submit / Finalize:** Must NOT be tested or altered against the live portal.
8. **`core/booking/auto-filler.js`:** Will NOT be modified, merged, or deleted.

---
*End of Phase 0 Baseline Snapshot.*
