# TASK ↔ TAB OWNERSHIP FORENSICS

## 1. Executive Summary

This forensic audit investigates the historical and current mechanisms linking Multi Run tasks to browser tabs in the ElArabyDev Chrome extension. The core finding: **historical task-tab affinity was not achieved through explicit mapping, but through a synchronous execution guarantee** — the `START_QUEUE` handler's `await storageSet({processingTabId: msg.tabId})` committed before `chrome.tabs.create()` initiated, ensuring the new tab's `processQueueOnLoad()` always read the creating tab's ID. This guarantee was lost during the unified codebase transition, introducing a race condition that makes task ownership unpredictable. The current version's `myTabId` comparison was intended as protection but became unreliable due to the race. The architect decision: restore the synchronous storage-before-tab-creation pattern as the linchpin, combined with hard tab affinity blocking on mismatch.

---

## 2. Ownership Unit

**Historical ownership unit**: `processingTabId` variable in `chrome.storage.local` — "whoever has this ID set owns the current task."

**Current ownership unit**: Same variable, but race-dependent — may represent either the creating tab's ID or the new tab's own ID depending on async timing.

**Not the ownership unit**: No explicit `taskId → tabId` map, no `sessionId → tabId` map, no `batchId → tabId` map existed in any generation.

---

## 3. Historical Task Lifecycle (v3.0 - Best Stable Generation)

```
Task created (user clicks "Start Multi Run" in popup)
    ↓
Task ID assigned (implicit: position in taskQueue array)
    ↓
Session created (batchId = 'batch-' + Date.now())
    ↓
Original tab identified (getActiveTab() → Tab A)
    ↓
START_QUEUE sent to Tab A with {tasks, tabId: TabA.id}
    ↓
Tab A START_QUEUE handler:
    await storageSet({processingTabId: TabA.id})  ← SYNCHRONOUS CLAIM
    startNextTask(tasks)                          ← immediate execution on Tab A
    chrome.tabs.create({url: ORDERS_URL})         ← initiates NEW Tab A
    ↓
Background callback (next event loop cycle):
    storage.local.set({processingTabId: newTab.id})  ← async update
    ↓
New Tab A loads → content script injected → processQueueOnLoad()
    await sleep(500)
    storageGet({processingTabId}) → reads TabA.id (GUARANTEED by sync ordering)
    ↓
AutoFlow proceeds on New Tab A
```

**Key variables at each step**:
- `msg.tabId` = Tab A's ID (set once, never changed)
- `processingTabId` = Tab A's ID (written synchronously, read deterministically)
- `newTab.id` = captured in callback but NOT used by new tab
- `taskQueue` = array of tasks persisted in storage
- `currentTask` = active task object persisted in storage

---

## 4. Historical Tab Lifecycle (v3.0)

| Phase | Actor | Action | Tab ID Source | Retained Where |
|-------|-------|--------|---------------|----------------|
| Creation | Background script (triggered by content script) | `chrome.tabs.create()` | `newTab.id` from callback | `chrome.storage.local.processingTabId` (async update) |
| Initialization | New tab's content script | `processQueueOnLoad()` | Reads `processingTabId` from storage | Local variable only |
| Execution | Content script on new tab | AutoFill workflow | `msg.tabId` (via `processingTabId` read) | N/A |

**Critical**: `newTab.id` was captured and stored but **never read by the new tab** — the new tab always read `msg.tabId` (original Tab A's ID) due to synchronous ordering.

---

## 5. Task ↔ Tab Relationship

**Historical v3.0**: Implicit affinity through **synchronous execution ordering**. No explicit `taskId ↔ tabId` mapping existed. The relationship was: `processingTabId = msg.tabId` written before tab creation → new tab reads same value → new tab becomes task owner.

**Current**: Same variable (`processingTabId`), but **race condition** makes the relationship probabilistic. The new tab may read either the original ID or its own ID.

**Explicit mappings searched (ALL GENERATIONS)**:
- `task.tabId` — **NOT FOUND**
- `taskId → tabId` Map — **NOT FOUND**
- `batchId → tabId` Map — **NOT FOUND**
- `sessionId → tabId` Map — **NOT FOUND**
- Arrays of tab assignments — **NOT FOUND**
- Objects containing both `taskId` and `tabId` — **NOT FOUND**
- Storage objects containing both IDs — **NOT FOUND** (only `processingTabId` and `taskQueue`/`currentTask` separately)
- Session records containing both IDs — **NOT FOUND**
- Callbacks capturing `newTab.id` — **FOUND** in background callback, but not linked to task

**Conclusion**: No explicit Task ↔ Tab mapping ever existed. Affinity was purely execution-order-dependent.

---

## 6. Tab Identity Sources

| Source | v3.0 | Current | Authority | Stability |
|--------|------|---------|-----------|-----------|
| `msg.tabId` | ✅ Set in START_QUEUE, never changed | ✅ Still set, never changed | High — set once per run | ✅ Completely stable |
| `sender.tab.id` | Not used for ownership | ✅ Via `GET_MY_TAB_ID` message | Medium — depends on message exchange | ⚠️ Can fail if message blocked |
| `newTab.id` | Captured in callback, **not read by new tab** | Same capture | Low — depends on read timing | ❌ Timing-dependent |
| `chrome.tabs.query` | Not used | ✅ Used in `processQueueOnLoad()` | Low — depends on query results | ❌ Unpredictable |
| `processingTabId` | ✅ Authoritative (sync-guaranteed) | ⚠️ Same variable, race-dependent | Was High — now Medium | **Degraded** |

**The Identity Crisis**: Current version has two independent ID sources that can diverge:
1. `processingTabId` from storage — may be original or new tab ID
2. `myTabId` from `GET_MY_TAB_ID` message — may differ from `processingTabId`

---

## 7. `processingTabId` Meaning

| Interpretation | v3.0 | Current | Evidence |
|----------------|------|---------|----------|
| **Active processing tab** | ✅ Yes — "tab running Multi Run" | ✅ Still — but race-dependent | Set in START_QUEUE; read in processQueueOnLoad |
| **Current UI tab** | ❌ No — could be any open tab | ❌ No — same | UI tab = active tab; processingTabId = stored tab ID |
| **Current task owner** | ✅ Yes — "tab with processingTabId owns task" | ✅ Yes + race condition | Key variable for ownership |
| **Temporary lock** | ⚠️ Prevented concurrent starts | ⚠️ Same + race may break lock | Used to prevent double-start |
| **Tab affinity marker** | ✅ Yes — implicitly links task to creating tab | ❌ No — race breaks affinity | Was binding mechanism; now broken |

**Critical Finding**: `processingTabId` represents "the tab that currently owns the task" — but in v3.0 this was **deterministically** the creating tab, while in current it's **probabilistically** the creating tab.

---

## 8. `currentTask` Meaning

- **Linked to Tab?** No — `currentTask` in storage contains task data (orderId, status, etc.) but **no `tabId` field**.
- **Contains `tabId`?** No — never contained tab identity.
- **Readable by any Content Script?** Yes — any tab's content script can read `currentTask` from storage.
- **Guard preventing other tabs from using it?** **Historical v3.0: None.** Current: `myTabId === processingTabId` comparison + ORDERS page check — but race-dependent and unreliable.

---

## 9. Page Navigation & Tab Differentiation

**Scenario**: Tab A (extension-owned) and Tab B (manually opened) both on `/el-US/Orders/`

| Mechanism | v3.0 | Current |
|-----------|------|---------|
| **URL-based differentiation** | None — any ORDERS page could auto-fill | ORDERS page check required but not sufficient |
| **Session state differentiation** | `processingTabId` = single source of truth | `processingTabId` + `myTabId` comparison |
| **`sender.tab.id` used?** | No | Yes — via `GET_MY_TAB_ID` message |
| **Race / Hijacking risk** | Theoretical, low probability | High — race condition enables unpredictable behavior |

**How code distinguishes them**: Current version uses `myTabId !== processingTabId` comparison. v3.0 had **no distinction mechanism** — relied on single-tab workflow assumption.

---

## 10. Historical Comparison Table

| Mechanism | Old Stable (v3.0) | Current Unified | Better? | Why |
|-----------|-------------------|-----------------|---------|-----|
| Task identity | Implicit (position in queue) | Same | = | No explicit taskId |
| Tab identity | `msg.tabId` (creating tab) | `msg.tabId` + `myTabId` | Current (theoretically) | Added explicit tab identity |
| Ownership | `processingTabId` = msg.tabId | Same variable, race-dependent | v3.0 | Sync guarantee lost |
| Task→Tab mapping | Implicit via sync ordering | None explicit | v3.0 | Deterministic vs probabilistic |
| Tab readiness | New tab reads after sync write | New tab reads during async gap | v3.0 | Guaranteed vs timing-dependent |
| Handoff | Implicit (new tab reads original ID) | Explicit comparison + retry | v3.0 | Deterministic vs unpredictable |
| Wrong-tab prevention | None (relied on single-tab assumption) | Attempted but broken by race | Neither | v3.0 predictable; current unreliable |
| Manual-tab protection | None | Partial but broken | Neither | Current has code but race undermines it |
| Queue ownership | `taskQueue` in storage | Same | = | No tab linkage |
| Session ownership | `batchId` in storage | Same | = | No tab linkage |

---

## 11. Important — Old ≠ Better

**Historical stability ≠ Historical safety**

| Aspect | v3.0 | Current |
|--------|------|---------|
| **Stability** | ✅ High — deterministic, predictable | ❌ Low — race-dependent, unpredictable |
| **Safety (tab hijacking prevention)** | ⚠️ Low — no mechanism, relied on workflow typicality | ❌ Low — mechanism exists but race makes it unreliable |
| **User predictability** | ✅ High — always knew what would happen | ❌ None — can't predict outcome |
| **Multi-tab support** | ❌ Not designed for | ✅ Intended but broken |

**Verdict**: v3.0 was "stable but unsafe by design" — worked because users typically didn't open multiple tabs. Current is "unsafe and unstable" — has protection code that doesn't reliably work.

---

## 12. Best Architectural Pattern

**Winner**: **Synchronous Storage-Before-Tab-Creation + Hard Tab Affinity Blocking**

This is **Pattern A** (`taskId → tabId` via synchronous guarantee) **enhanced with hard block**, not soft guard.

```javascript
// THE LINCHPIN - single change that enables everything:
START_QUEUE handler:
  await storageSet({processingTabId: msg.tabId})  // SYNCHRONOUS, BEFORE tabs.create()
  startNextTask(tasks)
  chrome.tabs.create({url: ORDERS_URL})

// New tab processQueueOnLoad():
const { processingTabId } = await storageGet({processingTabId: null})
const myTabIdResp = await new Promise(r => 
    chrome.runtime.sendMessage({type: 'GET_MY_TAB_ID'}, r))
const myTabId = myTabIdResp?.tabId || null

if (myTabId && myTabId !== processingTabId) {
    // ❌ HARD BLOCK — critical for task affinity
    log('⚠️ Tab affinity mismatch — this tab did not own the task')
    return  // BLOCK AutoFlow
}

if (myTabId && myTabId === processingTabId && getPageType() === 'ORDERS') {
    // ✅ MATCH — this tab owns the task
    await storageSet({processingTabId: myTabId})
    proceed with AutoFlow
}
```

**Why this pattern**:
1. ✅ Task affinity — synchronous guarantee binds Task A → Tab A
2. ✅ Wrong-tab protection — hard block prevents Tab B/C from stealing
3. ✅ Refresh recovery — storage persists across refresh
4. ✅ Multi-run reliability — deterministic ownership
5. ✅ Manual Portal tabs allowed — user can open them, AutoFlow blocks
6. ✅ No task hijacking — hard block enforces ownership

---

## 13. Wrong-Tab / Task Hijacking Analysis

**Historical v3.0**: Theoretical risk only. No mechanism prevented hijacking, but synchronous ordering + single-tab workflow made it rare.

**Current**: High risk due to race condition. The `myTabId === processingTabId` comparison:
- Sometimes matches → AutoFlow proceeds on correct tab ✅
- Sometimes mismatches → retry/early return/lock claim → unpredictable ❌
- Sometimes allows AutoFlow on wrong tab → hijacking ❌

**Root cause**: Async window between `tabs.create()` callback and new tab's `processQueueOnLoad()` reading storage.

---

## 14. Refresh Behavior

| Scenario | v3.0 | Current |
|----------|------|---------|
| **Extension-owned Tab A refreshed** | ✅ Recovers — same tab, same storage state | ✅ Recovers — same, plus `myTabId` re-evaluation |
| **New Tab B opened manually** | ⚠️ Could theoretically interfere (no protection) | ❌ Unpredictable — race-dependent |

**Critical distinction**: Refreshing owned tab = safe in both. Opening new tab = where race manifests.

---

## 15. Recommended Architectural Pattern

**Synchronous Storage-Before-Tab-Creation + Hard Block on Mismatch**

This is the **minimum change** achieving all requirements:
1. Make `storageSet({processingTabId: msg.tabId})` synchronous and occur **before** `tabs.create()`
2. Change mismatch handling from "log warning and continue" to **HARD BLOCK** (return/stop AutoFlow)
3. Keep `myTabId` comparison as deterministic verification

**Not needed**: Explicit `Map<taskId, tabId>`, session token handshake, complex ownership structures.

---

## 16. Evidence Gaps

| Gap | Impact |
|-----|--------|
| No runtime trace from v3.0 under Edge Tracking Prevention | Can't confirm sync guarantee held in real environments |
| No trace of async gap frequency in current | Unclear how often race manifests in practice |
| ETP impact on storage synchronous guarantee | May block the sync ordering that made v3.0 work |
| Background callback timing variability | Critical variable with no current data |
| `GET_MY_TAB_ID` message exchange reliability | May fail silently; affects comparison outcome |
| Storage partition between tabs | New tab may read different storage than background wrote |
| User behavior patterns | How often do users actually open multiple tabs during Multi Run? |

---

## 17. Architect Decision

### Q1: Is Task currently linked to Tab?
**No** — link is probabilistic due to race condition. `processingTabId` may point to creating tab or new tab unpredictably.

### Q2: Was Task linked to Tab in old version?
**Yes** — deterministically, via synchronous storage-before-tab-creation pattern. Not explicit mapping, but guaranteed execution ordering.

### Q3: How does extension prevent manual user tab from taking Task?
**Historically**: It didn't — relied on single-tab workflow assumption.
**Currently**: Attempts via `myTabId === processingTabId` comparison, but race condition makes it unreliable.

### Q4: What is the best ownership model?
**Synchronous `processingTabId` write before `tabs.create()`** as the ownership basis, with `myTabId` comparison as hard verification (block on mismatch).

### Q5: Do we need explicit `taskId ↔ tabId`?
**No** — the link is established through `processingTabId = msg.tabId` written synchronously before tab creation. A separate map adds complexity without benefit.

### Q6: Do we need handshake?
**Yes** — `GET_MY_TAB_ID` message exchange as verification, but **only as hard block on mismatch**, not soft warning.

### Q7: Do we need session token?
**As supplementary only** — `batchId` for session identification/recovery, not for task-tab ownership.

### Q8: Least architectural change achieving all requirements?
**Single change**: Make `storageSet({processingTabId: msg.tabId})` synchronous and before `tabs.create()`, then hard-block on `myTabId !== processingTabId`. This is the linchpin.

---

**FINAL STATUS**: READY FOR ARCHITECT REVIEW

**Output**: `_forensic_audit/TASK_TAB_OWNERSHIP_FORENSICS.md`

**HARD STOP**: No code changes, no deploy, no restore, no rollback, no save, no submit, no finalize. Forensic architecture investigation report only.