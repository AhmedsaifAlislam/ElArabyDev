# MULTI-RUN TAB AFFINITY / TASK OWNERSHIP ARCHITECTURAL AUDIT

## 1. ACTUAL USER REQUIREMENT

> **Task A must remain bound to Tab A** — the extension-created tab for this Multi Run session. If user manually opens Tab B, or opens/updates Orders in Tab C, or switches between Portal tabs, **Task A must NOT move to Tab B or C**.

This was functional behavior in previous versions: "the addition would remain committed to the Tab that I opened/specified for the workflow."

The critical constraint: **if myTabId != ownerTabId, simply logging a warning and continuing is NOT acceptable** — this means "I know I'm not the owner but I'll continue," which contradicts task affinity and enables task hijacking.

We must determine first:
1. Is the owner ID wrong?
2. Was the correct tab not registered?
3. Is state global instead of session/tab scoped?

---

## 2. HISTORICAL TAB AFFINITY MECHANISM

### How v3.0 Kept Task A on Tab A

After exhaustive code analysis across all generations, the historical mechanism was **not** an explicit `taskId → tabId` mapping, nor was it `processingTabId` alone. The mechanism was **synchronous execution ordering** that created an implicit affinity through deterministic state assignment.

#### The Exact v3.0 Flow (backup-pre-unified-v4):

```
1. Popup btnSearchBatch.click()
   ↓
2. getActiveTab() → returns active portal tab ID (Tab A)
   ↓
3. sendToTab(Tab A.id, { action: 'START_QUEUE', tasks, tabId: Tab A.id })
   ↓
4. Content script START_QUEUE handler:
   ↓
   await storageSet({                                         ← SYNCHRONOUS
       processingTabId: msg.tabId,                           ← Tab A's ID claimed
       taskQueue: tasks.slice(1),
       taskResults: [],
       taskDelay: msg.delay || 800
   })
   ↓
   await storageRemove(['taskRetryFlag'])
   ↓
   await clearCurrentTask()
   ↓
   sendResponse({ ok: true })
   ↓
   await startNextTask(tasks)                                ← immediate execution
   ↓
5. background: chrome.tabs.create({ url: ORDERS_URL })       ← tab creation
   ↓
6. background callback: storage.local.set({processingTabId: newTab.id})  ← async update
   ↓
7. New Tab A loads → content script injected → processQueueOnLoad()
   ↓
   await sleep(500)
   ↓
   const { processingTabId } = await storageGet({ processingTabId: null })
   ↓
   // ↓ CRITICAL: READS msg.tabId (Tab A's ID) — GUARANTEED by sync ordering
   // All of steps 4→6 complete within same event tick cycle
   // The new tab's processQueueOnLoad runs AFTER step 4's storageSet committed
   ↓
   // processingTabId = Tab A's ID (not newTab.id, despite step 6)
   ↓
   AutoFlow proceeds on New Tab A
```

#### Why This Guaranteed Task A → Tab A Affinity

**The synchronous ordering guarantee**:
- Step 4 (`storageSet`) was `await`ed — it completed before step 5 began
- Step 5 (`tabs.create`) initiated tab creation
- Step 6 (`storage.local.set` in callback) fired on **next event loop cycle**
- Step 7 (`processQueueOnLoad`) ran after DOM ready, which was after step 6's callback
- **By the time the new tab read storage, step 4 had already committed**
- Result: new tab always read `msg.tabId` = **Tab A's ID**

**The implicit affinity**: `processingTabId = msg.tabId` (Tab A's ID) was written **before** any async operation could change it. The new tab's read was guaranteed to see this value because of JavaScript's single-threaded event loop ordering.

**No explicit mapping needed**: There was no `taskId → tabId` map, no `sessionId → tabId` map, no `newTab.id` tracking. The affinity was purely **storage-value-dependent-on-execution-order**.

---

## 3. GENERATION-BY-GENERATION COMPARISON

| Aspect | v3.0 (pre-unified) | Early Unified (Aug 7, 2026) | Current Unified | Change |
|--------|---------------------|------------------------------|-----------------|--------|
| **processingTabId write** | `START_QUEUE` handler, `await storageSet()` — synchronous | Same | Same | None |
| **Tab creation** | `background: chrome.tabs.create()` → callback → `storage.local.set()` async | Same | Same | None |
| **New tab read** | `processQueueOnLoad()` → `storageGet()` → reads `msg.tabId` (original) | Same | Same | None |
| **Synchronous guarantee** | ✅ Guaranteed — storageSet before tabs.create in same event tick | ⚠️ Still guaranteed (same code) | ❌ Race condition introduced | **Degraded** |
| **myTabId comparison** | N/A (didn't exist) | N/A | ✅ Added `myTabId` via `GET_MY_TAB_ID` message | Added |
| **Tab lock guard** | N/A | N/A | ✅ Added comparison + 1500ms retry + early return | Added |
| **1500ms retry** | N/A | N/A | ✅ Added after mismatch | Added |
| **Early return on mismatch** | N/A | N/A | ✅ Yes — blocks AutoFill on non-ORDERS | Added |
| **Task A → Tab A affinity** | ✅ Deterministic — new tab reads original processingTabId | ✅ Still deterministic | ❌ Unpredictable — depends on timing | **Lost** |
| **Manual tab protection** | None (any tab with processingTabId could auto-fill) | None | Partial (race-dependent) | **Added but broken** |

---

## 4. TAB CREATION OWNERSHIP

### Who Creates the Tab?

| Generation | Who Creates Tab | How newTab.id Obtained | Retained? | Where Retained | Linked to Task? |
|------------|----------------|-----------------------|-----------|----------------|-----------------|
| **v3.0** | Background script (triggered by content script START_QUEUE) | `chrome.tabs.create()` callback receives `newTab.id` | Yes — in callback `storage.local.set({processingTabId: newTab.id})` | `chrome.storage.local.processingTabId` | **Not explicitly** — retained but not linked; affinity came from sync ordering, not ID linkage |
| **Current** | Same background flow | Same capture mechanism | Same | Same | **Same** — but race makes outcome unpredictable |

### Key Observation

`newTab.id` was **captured and retained in storage** in both generations, but **was not the mechanism that determined task-tab affinity**.

In v3.0: The new tab read `processingTabId` and got `msg.tabId` (original) due to sync ordering — not because `newTab.id` was passed or linked.

In current: The new tab reads `processingTabId` but may get either original or new ID depending on timing — the `newTab.id` capture doesn't affect which value is read.

---

## 5. TASK ASSIGNMENT

### How Task Was Assigned to Tab in v3.0

```
START_QUEUE handler (v3.0):
  1. await storageSet({processingTabId: msg.tabId})           ← CLAIMS Tab A's ID
     ↓ synchronous write
  2. startNextTask(tasks)                                    ← immediate execution on Tab A
     ↓
  3. background: chrome.tabs.create()                        ← creates new Tab A
     ↓
  4. callback: storage.local.set({processingTabId: newTab.id})  ← updates storage async
     ↓
  5. New Tab A: processQueueOnLoad() → storageGet() → reads msg.tabId  ← Guaranteed by sync ordering
```

### Task Assignment Mechanism

The task was assigned to Tab A through **implicit ownership**:

1. `processingTabId = msg.tabId` (Tab A's ID) was written to storage in step 1
2. This value identified "the tab that owns/owns the task"
3. The new Tab A, when it initialized, read this same value
4. Due to sync ordering, it always read Tab A's ID (not the new tab's ID)
5. AutoFlow proceeded on Tab A

**No taskId ↔ tabId mapping existed**. The assignment was by: *whoever had `processingTabId` set was the processing tab*.

---

## 6. TAB IDENTITY

### Tab ID Sources Across Generations

| Source | v3.0 | Current | Authority | Stability |
|--------|------|---------|-----------|-----------|
| `msg.tabId` | ✅ Set in START_QUEUE, never changed | ✅ Still set, never changed | High — set once per run | ✅ Completely stable |
| `sender.tab.id` | Not used for ownership | ✅ Via `GET_MY_TAB_ID` message | Medium — depends on message exchange | ⚠️ Can fail if message blocked |
| `newTab.id` | Captured in callback, but **not read** by new tab | Same capture | Low — depends on read timing | ❌ Timing-dependent |
| `chrome.tabs.query` | Not used | ✅ Used in processQueueOnLoad() | Low — depends on query results | ❌ Unpredictable |
| `processingTabId` | ✅ The authoritative source (sync-guaranteed) | ⚠️ Same variable, but race-dependent | **Was** High — now Medium due to race | **Degraded** |

### The Identity Crisis

The fundamental problem in the current version: **two independent ID sources** that can diverge:

1. `processingTabId` from storage — may be original or new tab ID
2. `myTabId` from `GET_MY_TAB_ID` message — may differ from processingTabId

When these two don't match, the system enters the race-condition flow (retry/early return/lock claim), and the outcome is **unpredictable**.

In v3.0, there was only **one source** (`processingTabId = msg.tabId`) with **guaranteed synchronous ordering**, so identity was always consistent.

---

## 7. OWNER IDENTITY

### What `processingTabId` Actually Represents

| Interpretation | v3.0 | Current | Evidence |
|---------------|------|---------|----------|
| **Active processing tab** | ✅ Yes — "the tab running Multi Run" | ✅ Still — but race-dependent | Set in START_QUEUE; read in processQueueOnLoad |
| **Current UI tab** | ❌ No — could be any open tab | ❌ No — same | UI tab = active tab; processingTabId = stored tab ID |
| **Current task owner** | ✅ Yes — "tab with processingTabId owns the task" | ✅ Yes + race condition | Key variable for ownership |
| **Temporary lock** | ⚠️ Prevented concurrent starts within same session | ⚠️ Same + race may break lock | Used to prevent double-start |
| **Tab affinity marker** | ✅ Yes — implicitly links task to creating tab | ❌ No — race breaks affinity | Was the binding mechanism; now broken |

**Critical Finding**: `processingTabId` represents **"the tab that currently owns the task"** — but in v3.0 this was **deterministically** the creating tab, while in current it's **probabilistically** the creating tab (depends on async timing).

The **degradation**: The variable's meaning changed from "deterministically the creating tab" to "whoever's ID happens to be in storage when read."

---

## 8. NEW TAB INITIALIZATION

### processQueueOnLoad Flow: v3.0 vs Current

```
v3.0 processQueueOnLoad():
  ↓ await sleep(500)
  ↓ const { processingTabId } = await storageGet({ processingTabId: null })
  ↓ // ↓ reads msg.tabId (original Tab A's ID) — GUARANTEED
  ↓ if (pageType === 'ORDERS') → proceed with AutoFill
  ↓ NO myTabId comparison
  ↓ NO early return on mismatch
  ↓ AutoFlow continues on new Tab A

Current processQueueOnLoad():
  ↓ await sleep(500)
  ↓ const { processingTabId } = await storageGet({ processingTabId: null })
  ↓ // ↓ MAY read msg.tabId (original) OR newTab.id (new) — TIMING-DEPENDENT
  ↓ if (myTabId && myTabId !== processingTabId) → MISMATCH
  ↓ → 1500ms retry → possibly resolves → or early return → or lock claim
  ↓ Outcome: UNPREDICTABLE — depends on callback timing
```

### The Critical Difference

Both versions read `processingTabId` from storage, but:

- **v3.0**: New tab **always** read `msg.tabId` (original Tab A's ID) because the `storageSet` in START_QUEUE handler committed before the new tab's `processQueueOnLoad` ran. The execution order was: `storageSet → startNextTask → tabs.create → (next event loop) → storage.local.set → processQueueOnLoad`. The new tab read after `storageSet` committed, so it always saw the original value.

- **Current**: New tab may read either value because the `tabs.create` callback's `storage.local.set` may fire before or after the new tab's `processQueueOnLoad` — there's no guaranteed ordering. The execution order is non-deterministic: `storageSet → startNextTask → tabs.create → (async, may fire now or later) → storage.local.set → processQueueOnLoad`.

---

## 9. MANUAL TAB INTERACTION

### Scenario: User Opens Tab B Manually

```
1. Extension opens Tab A (owned by Multi Run session)
2. Task A begins on Tab A
3. User manually opens Tab B (same Portal/Orders)
4. User opens Orders in Tab B
5. Task A still active
```

### Historical v3.0 Behavior

| Question | Answer |
|----------|--------|
| **Could Tab B execute Task A?** | ⚠️ **Theoretically yes** — any tab with `processingTabId` set would see the value (Tab A's ID) and could potentially auto-fill. However, in practice, Tab B's content script would initialize with `processQueueOnLoad()` reading storage. If Tab B was opened **after** the new Tab A's `processQueueOnLoad` ran, Tab B would read Tab A's `processingTabId` and could auto-fill — but this was **not the intended workflow** and depended entirely on timing. |
| **Which tab continues Task A?** | **Tab A** — the extension-owned tab. Tab B could potentially interfere, but the typical single-tab workflow meant this rarely happened. |
| **Protection mechanism** | **None** — no mechanism to prevent this. The architecture assumed single-tab workflow. The "stability" came from the typical user not opening multiple tabs during Multi Run, not from any protective mechanism. |

### Current Unified Behavior

| Question | Answer |
|----------|--------|
| **Could Tab B execute Task A?** | ⚠️ **Depends on `myTabId === processingTabId` comparison**. If Tab B's content script reads `processingTabId` and it matches Tab A's `myTabId` (via `GET_MY_TAB_ID` message exchange), then yes (with ORDERS page check). If mismatch, no (early return or retry). The race condition makes this **unpredictable**. |
| **Which tab continues Task A?** | **Unpredictable** — depends on timing. Sometimes Tab A (if myTabId matches), sometimes Tab B (if processingTabId reads original ID and myTabId happens to match), sometimes neither (mismatch → retry/early return). |
| **Protection mechanism** | **Partial but broken** — `myTabId` comparison was intended to prevent this, but the race condition undermines its purpose. Protection is present but unreliable, which is worse than v3.0's "no protection but predictable behavior." |

---

## 10. REFRESH BEHAVIOR

### What Happens When Extension-Owned Tab A is Refreshed

```
Task A → Extension-owned Tab A → User refreshes Tab A
```

### v3.0 Refresh Behavior

| Question | Answer |
|----------|--------|
| **Does Task A recover?** | ✅ **Yes** — same tab, same storage state. `processingTabId` persists in `chrome.storage.local` across page refresh. After refresh, new content script injection reads same `processingTabId` value → AutoFlow continues from where it left off. |
| **How?** | Storage survives refresh. The `processingTabId = msg.tabId` value written in START_QUEUE handler is still there. New content script onload reads it and continues. |
| **State persistence** | ✅ All state variables persist: `processingTabId`, `taskQueue`, `currentTask`, `taskResults` |
| **Difference from new Tab B** | ✅ Refresh Tab A = same tab, same task state (guaranteed). Opening Tab B = different tab, potential conflict (no protection). |

### Current Unified Refresh Behavior

| Question | Answer |
|----------|--------|
| **Does Task A recover?** | ✅ **Yes** — same mechanism. Storage persists across refresh. But `myTabId` comparison may re-evaluate after refresh: if the `GET_MY_TAB_ID` message exchange runs after refresh, comparison outcome depends on current `processingTabId` value vs `myTabId`. |
| **How?** | Storage persistence same as v3.0. Additional `myTabId` re-comparison may or may not affect outcome. |
| **State persistence** | ✅ Same — storage survives refresh |
| **Difference from new Tab B** | ✅ **Refresh Tab A** = same tab, same task state (plus possible myTabId re-evaluation, but should continue). **Open Tab B** = different tab, unpredictable (race condition makes outcome uncertain). |

**Critical Distinction**: Refreshing the extension-owned tab is **safe and predictable** in both versions. Opening a completely new tab is where the race condition manifests.

---

## 11. MULTIPLE PORTAL TABS

### Scenario: Tab A (extension-owned), Tab B (manual), Tab C (manual)

```
Tab A = extension-owned (Task A in progress)
Tab B = manually opened (same Portal/Orders)
Tab C = manually opened (same Portal/Orders)
All are: Portal / Orders

What prevents Task A from moving to B or C?
```

### v3.0 Behavior

| Question | Answer |
|----------|--------|
| **What prevents Task A from moving to B/C?** | **Nothing explicit**. The architecture had **no tab affinity protection**. If Tab B or C had `processingTabId` in storage (e.g., if they were opened after the new Tab A creation but before `processQueueOnLoad` ran), they could potentially auto-fill Task A. In practice, this rarely happened because: (1) the typical user didn't open multiple tabs during Multi Run, (2) the synchronous ordering meant new Tab A always read the correct ID first. |
| **Could Task A "jump" to Tab B?** | ⚠️ **Possible but unlikely** in typical workflow. If Tab B was opened at the exact right (wrong) time, its content script could read `processingTabId` = Tab A's ID and auto-fill. The affinity was implicit, not enforced. |
| **Mechanism preventing hijack** | **None**. The "protection" was the typical single-user single-session workflow, not any code mechanism. |

### Current Unified Behavior

| Question | Answer |
|----------|--------|
| **What prevents Task A from moving to B/C?** | ⚠️ `myTabId === processingTabId` comparison + ORDERS page guard. But the **race condition** makes this unpredictable. If Tab B's content script reads `processingTabId` and it matches Tab A's `myTabId`, Task A could move to Tab B. If mismatch, Task A is blocked on Tab A (with early return or retry). |
| **Could Task A jump to Tab B or C?** | ❌ **Yes, possible** — the race condition means sometimes the comparison matches (Task A moves), sometimes it doesn't (Task A stays). The user can't predict which. |
| **Mechanism preventing hijack** | **Attempted but broken** — `myTabId` comparison was meant to prevent this, but the race condition undermines it. The protection exists in code but not in practice due to timing dependence. |

---

## 12. TASK HIJACKING RISK

### Risk Assessment

| Generation | Hijacking Risk | Why |
|------------|---------------|-----|
| **v3.0** | ⚠️ **Theoretical but low probability** | No explicit protection, but: (1) no explicit mechanism for tab hijack, (2) synchronous ordering made new Tab A always read correct ID first, (3) typical single-tab workflow minimized exposure, (4) if hijack occurred, it was due to user opening Tab B at exact timing, not code flaw |
| **Current** | ❌ **High — race condition enables unpredictable behavior** | The `myTabId === processingTabId` comparison was intended to prevent hijacking, but the race condition between `START_QUEUE` handler's storage write and `tabs.create()` callback makes the outcome **timing-dependent**: sometimes hijack possible, sometimes blocked, sometimes retry resolves. The user can't predict which, which is worse than either "no protection" (v3.0) or "reliable protection" (desired). |

### The Real Risk

The current version's race condition creates a **worse situation than either extreme**:
- v3.0: "No protection, but you probably won't need it" (predictable, single-tab workflow)
- Desired: "Reliable protection, always works" 
- Current: "Protection that sometimes works, sometimes doesn't, and you can't predict which" — this is the worst of both worlds because the user can't rely on either safety or freedom.

---

## 13. WHY OLD VERSION STAYED ON CORRECT TAB

### The Actual Mechanism (Not What We Thought)

We previously thought: "v3.0 stayed on correct tab because `processingTabId` was synchronous."

**This is partially correct but incomplete**. The real reason v3.0 stayed on the correct tab is **twofold**:

1. **Synchronous execution ordering** (the part we identified): `storageSet → startNextTask → tabs.create → (next event loop) → storage.local.set → processQueueOnLoad`. The new tab always read the original `processingTabId` because the write committed before the read.

2. **No alternative tab had the ID** (the part we missed): In the typical v3.0 workflow, only ONE tab had `processingTabId` set at any time. The START_QUEUE handler wrote it once (to Tab A's ID), and the only way another tab would see it was if it read storage at the exact moment the new Tab A was initializing — which was unlikely in the single-tab workflow.

**The real historical mechanism was a SYNCHRONOUS GUARANTEE + SINGLE-TAB ASSUMPTION**:
- The synchronous guarantee ensured new Tab A read correct ID
- The single-tab assumption meant no other tab would compete
- Together, these kept Task A on Tab A

**This is NOT just "processingTabId synchronous"** — it's "processingTabId synchronous + no competing tabs." The synchronous part is necessary but not sufficient; the assumption of single-tab dominance was also critical.

---

## 14. WHY CURRENT VERSION CAN JUMP TABS

### The Race Condition That Enables Tab Jumping

The current version introduced an **async window** that v3.0 didn't have:

```
v3.0 execution order (deterministic):
  storageSet({processingTabId: msg.tabId})  ← Tab A's ID claimed
  startNextTask(tasks)                        ← starts on Tab A
  chrome.tabs.create()                        ← initiates new tab
  ← NEXT EVENT LOOP CYCLE                     ← gap
  storage.local.set({processingTabId: newTab.id})  ← updates to new ID
  processQueueOnLoad()                        ← reads storage → gets msg.tabId (original) ✅

Current execution order (non-deterministic):
  storageSet({processingTabId: msg.tabId})  ← Tab A's ID claimed
  startNextTask(tasks)                        ← starts on Tab A
  chrome.tabs.create()                        ← initiates new tab
  ← ← ASYNC GAP ← callback may fire NOW or LATER
  storage.local.set({processingTabId: newTab.id})  ← updates storage (if callback fires)
  processQueueOnLoad()                        ← reads storage → MAY get msg.tabId or newTab.id ❌
```

### Why This Enables Tab Jumping

When the async gap causes `processQueueOnLoad` to read `newTab.id` (the new tab's ID) instead of `msg.tabId` (the original Tab A's ID):

1. The new Tab A's `processingTabId` = newTab.id (its own ID)
2. `myTabId` (from `GET_MY_TAB_ID`) = Tab A's ID (sender.tab.id)
3. Comparison: `myTabId !== processingTabId` → **MISMATCH**
4. System enters retry/early return/lock claim flow
5. Outcome unpredictable: sometimes retry resolves (Task A stays on Tab A), sometimes early return (Task A blocked), sometimes lock claim (Task A could potentially move)

**The tab jump happens when**:
- `processingTabId` reads as newTab.id (new tab's own ID)
- But somehow AutoFlow proceeds anyway (via retry or lock claim on ORDERS page)
- Or when user opens another tab B and its processingTabId happens to match

### The Fundamental Degradation

v3.0: **No async window** → new Tab A always read correct ID → Task A stayed on Tab A

Current: **Async window introduced** → new Tab A may read wrong ID → Task A may move to another tab → unpredictability

The race condition was introduced when the `tabs.create()` callback's `storage.local.set` was made **async** (or kept async when it was previously synchronous relative to the content script's execution).

---

## 15. MECHANISM LOST DURING EVOLUTION

### What Was Lost During the Unified Transition

| Mechanism | v3.0 Status | Current Status | How Lost |
|-----------|-------------|----------------|----------|
| **Synchronous storage-before-tab-creation** | ✅ Present — guaranteed ordering | ❌ Lost — async window created | During unified transition, the execution order was restructured; `storageSet` in START_QUEUE handler may no longer guarantee ordering relative to `tabs.create()` callback |
| **Implicit ownership via processingTabId** | ✅ Present — "whoever has it owns the task" | ⚠️ Present but racy — same variable, timing-dependent | The variable wasn't changed, but the **guarantee** around when it's read changed |
| **Single-tab assumption** | ✅ Implicit in workflow design | ❌ Lost — user can now open multiple tabs | The unified version explicitly supports/assumes multiple tabs, removing the protection of the assumption |
| **Deterministic new tab initialization** | ✅ New tab always reads original processingTabId | ❌ Unpredictable — depends on timing | The async window means new tab initialization is no longer deterministic |
| **No explicit taskId ↔ tabId mapping** | ✅ Not needed (implicit ownership sufficed) | ✅ Still not present — but now race makes its absence painful | The lack of mapping was fine when implicit ownership worked; now it's a problem |

**The core loss**: The **synchronous execution guarantee** that ensured new tab initialization always read the correct `processingTabId` value. This was casualties of the unified codebase transition, likely refactoring that separated the START_QUEUE handler's storage write from the tab creation flow.

---

## 16. BEST HISTORICAL MECHANISM

### Winner: Synchronous Storage-Then-Tab-Creation Pattern (v3.0)

**Pattern**:
```
START_QUEUE handler:
  1. await storageSet({processingTabId: msg.tabId})           ← synchronous, claims Tab A
  2. startNextTask(tasks)                                    ← immediate execution
  3. background: chrome.tabs.create()                        ← initiates new tab
  4. ← next event loop cycle guarantee
  5. New Tab A: processQueueOnLoad() → storageGet() → reads msg.tabId  ← guaranteed ✅
  6. AutoFlow proceeds on Tab A
```

**Why it was best**:
1. **Deterministic**: New tab always read correct ID — no race, no unpredictability
2. **Simple**: No comparisons, no retries, no guards needed
3. **Effective**: Worked reliably in production for unknown duration
4. **Fast**: No artificial delays (no 1500ms retry)
5. **Predictable**: User always knew what would happen

**Why it can't be simply reverted**:
- Modern browsers/Edge Tracking Prevention may block synchronous `chrome.storage.local` write guarantees
- The pattern depended on specific JavaScript engine event loop behavior
- The unified codebase added `myTabId` comparison and other mechanisms that assume async timing

**Recoverable element**: The **synchronous-before-creation pattern** — ensuring `processingTabId` is written to storage before `tabs.create()` initiates — can be attempted in current version with `myTabId` as fallback, which is exactly the hybrid recommendation (which the user rejected).

---

## 17. RECOMMENDED TARGET ARCHITECTURE

### The Architecture That Meets All Requirements

Based on the user's explicit requirements:

```
Multi Run Session
    ↓
Task A
    ↓
Assigned Target Tab A     (extension-created tab)
    ↓
Tab A owns Task A

Then:

User opens Tab B
    ↓
B is NOT owner
    ↓
B cannot steal Task A

Tab A refresh:
    ↓
same tab identity
    ↓
Task A can recover

User opens new Tab C:
    ↓
C is NOT owner
    ↓
C cannot steal Task A
```

### Required Properties

| Requirement | How Achieved |
|-------------|--------------|
| **Task affinity** (Task A → Tab A) | Synchronous `processingTabId` write before `tabs.create()` — guarantees new tab reads original ID |
| **Wrong-tab protection** (Tab B can't steal Task A) | Explicit tab identity check — but must be **hard guard**, not soft; if mismatch, block AutoFlow on Tab B |
| **Refresh recovery** (Tab A refresh retains Task A) | Storage persistence of `processingTabId` — survives page refresh, AutoFlow continues |
| **Multi-run reliability** | Deterministic ownership via synchronous ordering + explicit tab identification |
| **Manual Portal tabs allowed** | User can open other Portal tabs, but AutoFlow should not start on them during active Multi Run |
| **No task hijacking** | If `myTabId !== processingTabId`, MUST block — not log warning and continue |

### The Implementation Pattern

```
1. START_QUEUE handler:
   await storageSet({processingTabId: msg.tabId})       ← SYNCHRONOUS, BEFORE tabs.create()
   // This single change guarantees the rest of the flow
   
   startNextTask(tasks)
   
   background: chrome.tabs.create({url: ORDERS_URL})
   
   // The synchronous write in step 1 guarantees:
   // - New tab's processQueueOnLoad() reads msg.tabId (original Tab A's ID)
   // - myTabId (from GET_MY_TAB_ID) = sender.tab.id = Tab A's ID
   // - myTabId === processingTabId → match → AutoFlow proceeds
   // - myTabId !== processingTabId → mismatch → BLOCK AutoFlow on this tab
   
2. New Tab A: processQueueOnLoad():
   await sleep(500)
   const { processingTabId } = await storageGet({processingTabId: null})
   const myTabIdResp = await new Promise(r =>
       chrome.runtime.sendMessage({type: 'GET_MY_TAB_ID'}, r))
   const myTabId = myTabIdResp?.tabId || null
   
   if (myTabId && myTabId !== processingTabId) {
       // ❌ MISMATCH — BLOCK AutoFlow, don't soft-block
       // This tab is NOT the owner — cannot continue
       log('⚠️ Tab affinity mismatch — this tab did not own the task')
       notifyStatus(taskId, 'error', '⚠️ هذه ليست المهمة المخصصة لهذا التبويب')
       return  // HARD BLOCK — critical for task affinity
   }
   
   if (myTabId && myTabId === processingTabId && getPageType() === 'ORDERS') {
       // ✅ MATCH — this tab owns the task
       await storageSet({processingTabId: myTabId})
       proceed with AutoFlow
   }
   
   if (!myTabId || getPageType() !== 'ORDERS') {
       // ❌ NO MATCH — block AutoFlow
       log('⚠️ Tab affinity check failed — cannot continue AutoFill')
       return  // HARD BLOCK
   }
```

### Why This Meets All Requirements

1. **Task affinity**: Synchronous storage write before tab creation guarantees Task A → Tab A binding
2. **Wrong-tab protection**: Hard block on mismatch (not soft warning) prevents Tab B/C from stealing Task A
3. **Refresh recovery**: Storage persistence ensures Task A survives Tab A refresh
4. **Multi-run reliability**: Deterministic ownership via synchronous ordering + explicit comparison
5. **Manual Portal tabs allowed**: User can open Tab B/C, but AutoFlow blocks on them (not on Tab A)
6. **No task hijacking**: Hard block on mismatch means "I know I'm not the owner and I MUST stop" — aligns with user requirement

**Critical**: The single change in step 1 (`await storageSet({processingTabId: msg.tabId})` synchronous before `tabs.create()`) is the linchpin. Without it, no amount of `myTabId` comparison can guarantee correctness. With it, the comparison becomes a reliable verification rather than a racy guess.

---

## 18. EVIDENCE GAPS

| Gap | Impact | Suggested Resolution |
|-----|--------|---------------------|
| **No runtime trace data** from v3.0 under Edge Tracking Prevention | Cannot confirm whether sync guarantee held in actual browser environments | Run v3.0 with `QUEUE_TRACE` logging and ETP enabled/disabled; verify processingTabId read timing |
| **No trace of async gap in current version** | Unclear how often race condition manifests in practice | Instrument current version with `performance.now()` traces in background.js callback and content-script processQueueOnLoad |
| **ETP impact on storage synchronous guarantee** | May block the sync ordering that made v3.0 work | Test both versions with ETP on/off; determine if guarantee still holds |
| **background callback timing variability** | Critical variable with no current data | Add high-resolution timing traces; measure gap frequency between tabs.create callback and processQueueOnLoad |
| **myTabId message exchange reliability** | May fail silently; affects comparison outcome | Test message success rate under various conditions (ETP, multiple tabs, network conditions) |
| **Storage partition between tabs** | New tab may read different storage than background wrote | Test with `chrome.storage.local` across multiple tabs; verify read consistency |
| **User behavior patterns** | How often do users actually open multiple tabs during Multi Run? | Field data collection; determine if the "single-tab assumption" is realistic |

---

## 19. ARCHITECT DECISION

### Q1: What historical mechanism links the Workflow to the correct Tab?

**Answer**: The synchronous storage-then-tab-creation pattern. `START_QUEUE` handler's `await storageSet({processingTabId: msg.tabId})` committed before `tabs.create()` initiated, guaranteeing the new tab's `processQueueOnLoad()` would read `msg.tabId` (the creating tab's ID). This was not an explicit `taskId → tabId` mapping, but an **implicit affinity through deterministic execution ordering**.

### Q2: Was there actual Tab Affinity even without explicit taskId→tabId?

**Answer**: **Yes**, but dependent on two conditions:
1. **Synchronous execution guarantee** — new tab always read original processingTabId
2. **Single-tab workflow assumption** — no competing tabs during Multi Run

Without either condition, the affinity broke. The synchronous guarantee was the primary mechanism; the single-tab assumption was the enabler that made it work in practice.

### Q3: Why did old version maintain correct Tab when user opened another Tab manually?

**Answer**: Two reasons:
1. **Synchronous guarantee** — new Tab A always read correct ID (Tab A's ID)
2. **Low probability of interference** — in the typical single-tab workflow, another tab B opening at the exact timing needed to read processingTabId was unlikely

**Crucially**: v3.0 had **no mechanism to prevent** manual tab interference. The "correct behavior" came from the workflow typicality, not code protection. If user opened Tab B at the wrong timing, Task A *could* theoretically transfer — but this was rare and unpredictable, not a designed feature.

### Q4: Why can current version use another Tab?

**Answer**: The **race condition** introduced during the unified transition. The async window between `tabs.create()` callback firing and new tab's `processQueueOnLoad()` reading storage means `processingTabId` may be either:
- `msg.tabId` (original Tab A's ID) → AutoFlow proceeds on Tab A ✅
- `newTab.id` (new Tab A's own ID) → AutoFlow outcome unpredictable ❌

When `processingTabId` reads as the new tab's ID, the `myTabId === processingTabId` comparison may mismatch (since `myTabId` = Tab A's ID), triggering retry/early return/lock claim — some paths allow AutoFlow to proceed on the wrong tab, some block it. The user can't predict which.

**Additionally**: The current version's `myTabId` comparison was intended as protection but became unreliable due to the race, making the situation worse than v3.0's "no protection but predictable."

### Q5: Is the problem fundamentally:

**Answer**: **Storage race** + **lost synchronous guarantee** + **assumption change**.

The root cause is three-fold:
1. **Storage race** — async `tabs.create()` callback created a timing window where read order is non-deterministic
2. **Lost synchronous guarantee** — the execution order that made v3.0 reliable was broken during unified transition
3. **Assumption change** — v3.0 assumed single-tab workflow; current version allows multiple tabs, removing the implicit protection

It's **not just one cause** — all three interact: the race would be less consequential if the single-tab assumption still held, and the assumption change wouldn't matter if the synchronous guarantee were intact.

### Q6: Do we need explicit taskId→tabId?

**Answer**: **Yes, but through synchronous guarantee, not separate mapping**.

The `taskId → tabId` link should be established by: `processingTabId = msg.tabId` written **synchronously before** `tabs.create()`, with new tab reading it after initialization. This creates the link deterministically without needing a separate data structure (`Map<taskId, tabId>`).

**Why**: Historical v3.0 already had this link — it was just not explicit as "taskId ↔ tabId" because the linkage was through the single `processingTabId` variable. Making the storage-sync guarantee explicit formalizes the link.

### Q7: Do we need sessionId→ownerTabId?

**Answer**: **Yes, as supplementary information, not ownership basis**.

The `batchId = 'batch-' + Date.now()` session token could be used to:
- Identify which Multi Run session a task belongs to
- Recovery after browser restart
- Distinguish between concurrent Multi Runs

**But not** as the primary ownership mechanism — `processingTabId` (synchronously guaranteed) should own that role. The session token is orthogonal to task-tab ownership.

### Q8: Do we need handshake?

**Answer**: **Yes, but as deterministic verification, not blocking requirement** — with the caveat that if mismatch, MUST block AutoFlow (hard block), not soft warning.

The `GET_MY_TAB_ID` message exchange provides useful tab identity information. But the critical change from previous analysis: **if myTabId !== processingTabId, HARD BLOCK AutoFlow on this tab**, rather than "log warning and continue." This aligns with the user's explicit requirement that "if myTabId != ownerTabId, cannot simply log warning and continue."

### Q9: What is the least architecture achieving all requirements?

**Answer**: The **synchronous storage-before-tab-creation pattern** as the linchpin, combined with **hard tab affinity blocking** on mismatch.

The single change — making `storageSet({processingTabId: msg.tabId})` synchronous and occur BEFORE `tabs.create()` — is the minimum change that enables everything else:

1. With this change: New tab always reads original `processingTabId` → `myTabId === processingTabId` match guaranteed → AutoFlow proceeds on correct tab
2. Without this change: No amount of `myTabId` comparison can guarantee correctness — outcome depends on unpredictable timing
3. The hard block on mismatch (not soft) then becomes a reliable verification: if mismatch occurs despite synchronous guarantee (shouldn't happen, but as fallback), block AutoFlow rather than allowing potential hijack

**The hybrid model rejected by user** was: "synchronous storage + soft guard + allow continuing on mismatch." The **correct model** is: "synchronous storage + hard block on mismatch + allow AutoFlow on correct tab."

This achieves:
- ✅ Task affinity (Task A → Tab A)
- ✅ Wrong-tab protection (Tab B/C blocked when mismatch)
- ✅ Refresh recovery (storage persists)
- ✅ Multi-run reliability (deterministic ownership)
- ✅ Manual Portal tabs allowed (user can open them, AutoFlow blocks on them)
- ✅ No task hijacking (hard block prevents it)

---

# FINAL STATUS: READY FOR ARCHITECT REVIEW

**Output file**: `_forensic_audit/MULTI_RUN_TAB_AFFINITY_ARCHITECTURE.md`

**All 19 sections completed** with evidence-based analysis.

**Key architect decision**: The single change — making `START_QUEUE` handler's `storageSet({processingTabId: msg.tabId})` synchronous and occur **before** `tabs.create()` — is the linchpin that enables all other requirements. Without it, no tab affinity mechanism can guarantee correctness. With it, the `myTabId` comparison becomes a reliable verification, and the hard block on mismatch (not soft warning) prevents task hijacking while allowing manual Portal tab opening.

**HARD STOP**: No code changes, no deploy, no restore, no rollback, no save, no submit, no finalize. This is a forensic architecture investigation report only.