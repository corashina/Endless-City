# BFCache Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve ready and pending application ownership across persisted BFCache transitions while retaining final teardown for non-persisted page hides.

**Architecture:** Keep lifecycle state in the phase that already owns the resources. The ready loop records whether it was running before BFCache suspension; bootstrap defers asset settlement while suspended and removes its listeners before handing ownership to the ready loop.

**Tech Stack:** TypeScript, DOM `pagehide`/`pageshow`, Vitest with jsdom, Vite, Three.js.

## Global Constraints

- Use the public transition event `persisted` property; do not reload.
- Resume a ready loop only when it was running immediately before persisted `pagehide`.
- Preserve context-loss and any other pre-existing pause state.
- Preserve bootstrap loading, recovery, overlay, context, and asset ownership across persisted suspension.
- Final teardown is idempotent, immediately removes listeners, disposes eventual successful assets, and suppresses late UI errors.
- Preserve existing assets and scope.

## File Map

- Modify `src/app.ts`: add transition classification, ready-loop suspension, pending-bootstrap settlement deferral, and clean listener handoff.
- Modify `tests/app.test.ts`: add transition-event helpers and ready/pending BFCache regression tests.
- Modify `docs/superpowers/plans/2026-07-13-endless-city-redesign.md`: check only audited, completed Task 1-10 steps.
- Update `.superpowers/sdd/task-11-report.md`: record final evidence without tracking the ignored coordination artifact.

---

### Task 1: Ready-loop BFCache ownership

**Files:**
- Modify: `tests/app.test.ts`
- Modify: `src/app.ts:55-165`

**Interfaces:**
- Consumes: `AppHandle.pause()`, `AppHandle.resume()`, `AppHandle.dispose()`.
- Produces: `OwnedLoopInput.onPageFreeze?: () => void` and BFCache-aware page transition listeners.

- [x] **Step 1: Add a public transition-event test helper and failing ready-loop tests**

```ts
function pageTransition(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: persisted })
  return event
}

it('pauses for persisted pagehide and resumes exactly once on persisted pageshow', () => {
  const harness = createLoopHarness()
  harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))
  expect(harness.disposeScene).not.toHaveBeenCalled()
  expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
  harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))
  harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))
  expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(2)
})

it('does not resume a loop that was paused before persisted pagehide', () => {
  const harness = createLoopHarness()
  harness.handle.pause()
  harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))
  harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))
  expect(harness.requestAnimationFrame).toHaveBeenCalledOnce()
})
```

Also assert that non-persisted `pagehide` still disposes, duplicate persisted hides are idempotent, and neither lifecycle event has an effect after `handle.dispose()`.

- [x] **Step 2: Run the focused tests and verify the red state**

Run: `bun run test -- tests/app.test.ts`

Expected: FAIL because persisted `pagehide` currently disposes the scene and no `pageshow` listener resumes the loop.

- [x] **Step 3: Implement minimal ready-loop suspension**

```ts
const isPersistedPageTransition = (event: Event): boolean =>
  'persisted' in event && event.persisted === true

let bfcacheSuspended = false
let resumeAfterBfcache = false

const pageHideListener: EventListener = (event) => {
  if (!isPersistedPageTransition(event)) {
    handle.dispose()
    return
  }
  if (stopped || bfcacheSuspended) return
  resumeAfterBfcache = !paused
  bfcacheSuspended = true
  handle.pause()
  input.onPageFreeze?.()
}

const pageShowListener: EventListener = (event) => {
  if (!isPersistedPageTransition(event) || stopped || !bfcacheSuspended) return
  const shouldResume = resumeAfterBfcache
  bfcacheSuspended = false
  resumeAfterBfcache = false
  if (shouldResume) handle.resume()
}
```

Register and remove both transition listeners in normal and exceptional setup/teardown paths. Add `onPageFreeze?: () => void` to `OwnedLoopInput`; `startApp` passes `() => { previousTimestamp = undefined }` so the restored first frame has a zero delta.

- [x] **Step 4: Run focused tests and typecheck**

Run: `bun run test -- tests/app.test.ts && bun run typecheck`

Expected: all `app.test.ts` tests pass and TypeScript exits zero.

---

### Task 2: Pending-bootstrap BFCache ownership

**Files:**
- Modify: `tests/app.test.ts`
- Modify: `src/app.ts:175-450`

**Interfaces:**
- Consumes: `isPersistedPageTransition(event)`, bootstrap resource disposal helpers, asset loader promise.
- Produces: a deferred bootstrap-resume barrier and exact bootstrap-to-ready transition-listener handoff.

- [x] **Step 1: Write failing pending-bootstrap tests**

```ts
it('preserves pending bootstrap across BFCache and starts after pageshow', async () => {
  const canvas = document.createElement('canvas')
  const overlay = createOverlayHarness()
  const scene = createRunnableScene()
  const catalog = createRunnableCatalog()
  let resolveAssets: (catalog: AssetCatalog) => void = () => undefined
  const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
    .mockImplementation(() => 93)
  const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => undefined)
  const appPromise = startApp({ canvas, overlay: overlay as unknown as OverlayController }, {
    createScene: () => scene.context,
    loadAssetCatalog: () => new Promise((resolve) => { resolveAssets = resolve }),
  })
  let settled = false
  void appPromise.then(() => { settled = true })

  window.dispatchEvent(pageTransition('pagehide', true))
  resolveAssets(catalog)
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  expect(scene.dispose).not.toHaveBeenCalled()
  expect(catalog.dispose).not.toHaveBeenCalled()

  window.dispatchEvent(pageTransition('pageshow', true))
  const handle = await appPromise
  expect(requestAnimationFrame).toHaveBeenCalledOnce()
  handle.dispose()
  requestAnimationFrame.mockRestore()
  cancelAnimationFrame.mockRestore()
})

it('suppresses a pending asset rejection after final pagehide', async () => {
  const canvas = document.createElement('canvas')
  const overlay = createOverlayHarness()
  const scene = createRunnableScene()
  const onError = vi.fn()
  const loadError = new Error('late load failure')
  let rejectAssets: (error: Error) => void = () => undefined
  const appPromise = startApp({
    canvas,
    overlay: overlay as unknown as OverlayController,
    onError,
  }, {
    createScene: () => scene.context,
    loadAssetCatalog: () => new Promise((_, reject) => { rejectAssets = reject }),
  })

  window.dispatchEvent(pageTransition('pagehide', false))
  rejectAssets(loadError)
  await expect(appPromise).rejects.toBe(loadError)
  expect(overlay.showError).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
  expect(scene.dispose).toHaveBeenCalledOnce()
  expect(overlay.dispose).toHaveBeenCalledOnce()
})
```

Instrument `window.addEventListener`/`removeEventListener` in the final-teardown test to assert the bootstrap `pagehide` and `pageshow` listeners are removed synchronously, then assert late resolution disposes the catalog once. Add a repeated persisted hide/show test and verify bootstrap listeners have handed off before the ready listeners own subsequent events.

- [x] **Step 2: Run the focused tests and verify the red state**

Run: `bun run test -- tests/app.test.ts`

Expected: FAIL because pending persisted `pagehide` currently performs final disposal, loading settlement is not deferred, and late rejection still reports to the disposed overlay.

- [x] **Step 3: Implement the bootstrap suspension barrier**

```ts
let bootstrapBfcacheSuspended = false
let bootstrapResumePromise: Promise<void> | undefined
let releaseBootstrapResume: (() => void) | undefined

const waitForBootstrapResume = async (): Promise<void> => {
  if (!bootstrapBfcacheSuspended) return
  bootstrapResumePromise ??= new Promise<void>((resolve) => {
    releaseBootstrapResume = resolve
  })
  await bootstrapResumePromise
}

const resumeBootstrap = (): void => {
  if (!bootstrapBfcacheSuspended) return
  bootstrapBfcacheSuspended = false
  const release = releaseBootstrapResume
  bootstrapResumePromise = undefined
  releaseBootstrapResume = undefined
  release?.()
}
```

Use persisted `pagehide` only to set the suspension flag. Use persisted `pageshow` to call `resumeBootstrap()`. For non-persisted `pagehide`, set `bootstrapDisposed`, immediately remove both transition listeners, release the barrier, remove recovery listeners, dispose resources, and dispose the overlay.

- [x] **Step 4: Defer both successful and failed asset settlement and suppress final errors**

```ts
const loadCatalog = dependencies.loadAssetCatalog ?? loadAssets
let loadedAssets: AssetCatalog
try {
  loadedAssets = await loadCatalog(({ loaded, total }) => {
    if (bootstrapDisposed || recoveryState === 'terminal') return
    lastLoadingProgress = { loaded, total }
    elements.overlay?.showLoading(loaded, total)
  })
} catch (error) {
  await waitForBootstrapResume()
  throw error
}
await waitForBootstrapResume()
assets = loadedAssets
```

Before ready-loop construction, remove both bootstrap transition listeners. In the outer catch, report only while bootstrap still owns UI:

```ts
if (!bootstrapDisposed && !recoveryIsTerminal()) reportError(error)
```

- [x] **Step 5: Run focused tests and typecheck**

Run: `bun run test -- tests/app.test.ts && bun run typecheck`

Expected: all focused tests pass, including ready context-loss tests, and TypeScript exits zero.

---

### Task 3: Audit original implementation-plan completion

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-endless-city-redesign.md`

**Interfaces:**
- Consumes: repository source, tests, documentation, and commit history as completion evidence.
- Produces: accurate checkbox state for the original plan.

- [x] **Step 1: Inventory all unchecked task steps**

Run:

```powershell
$steps = Select-String -Path docs/superpowers/plans/2026-07-13-endless-city-redesign.md -Pattern '^- \[ \]'
$steps.Count
$steps | Select-Object LineNumber, Line
```

Expected: 55 actual unchecked task-step lines. The apparent 56th textual `[ ]` occurrence is the header's checkbox-syntax example and must not be edited.

- [x] **Step 2: Audit each Task 1-10 deliverable before checking it**

Use `rg --files src tests docs` and the complete automated suite to confirm the implemented layout, world window, traffic geometry/safety/reservations/pool, quality/assets, rendering, app loop, overlay, responsive styles, historical red/green verification, and commits. Leave any unmet step unchecked and report it instead of inferring completion.

- [x] **Step 3: Mark only verified task steps complete**

Replace `- [ ]` with `- [x]` only on verified Task 1-10 step headings. Re-run the inventory command and expect zero actual unchecked task-step lines if all 55 are evidenced.

- [x] **Step 4: Check documentation diff hygiene**

Run: `git diff --check && git diff -- docs/superpowers/plans/2026-07-13-endless-city-redesign.md`

Expected: no whitespace errors; only checkbox markers change.

---

### Task 4: Full verification, production smoke, and commit

**Files:**
- Update: `.superpowers/sdd/task-11-report.md` (ignored coordination report)
- Verify all tracked files changed in Tasks 1-3.

**Interfaces:**
- Consumes: completed implementation and documentation audit.
- Produces: final reproducible evidence and one focused implementation commit.

- [x] **Step 1: Run the full automated gate**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: typecheck exits zero; every test file/test passes; production build succeeds with only the established chunk-size advisory; diff check is clean.

- [x] **Step 2: Run production smoke**

Start the built application using the existing local production-preview workflow. In the browser verify the loading overlay reaches Ready, rendering is visible, the FPS display remains hidden outside debug mode, and the console contains no application errors or warnings. If the browser permits synthetic public page-transition events, verify persisted hide/show does not destroy rendering; otherwise record that BFCache lifecycle semantics are covered by jsdom integration tests.

- [x] **Step 3: Review the final diff and update the ignored evidence report**

Run: `git status --short && git diff --stat && git diff`

Record the focused/full gate counts, smoke observations, checkbox audit count, and final commit hash in `.superpowers/sdd/task-11-report.md`. Preserve ignored build output and existing assets.

- [x] **Step 4: Commit the focused implementation**

```powershell
git add -- src/app.ts tests/app.test.ts docs/superpowers/plans/2026-07-13-endless-city-redesign.md
git commit -m "fix: preserve app state across bfcache"
```

- [x] **Step 5: Re-run final repository checks**

Run: `git status --short && git log -2 --oneline`

Expected: tracked worktree clean and the design plus implementation commits are at the branch tip.
