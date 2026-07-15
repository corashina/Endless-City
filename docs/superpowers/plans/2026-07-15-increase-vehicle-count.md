# Increase Vehicle Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the high, balanced, and mobile traffic pools by 50% to 108, 72, and 42 vehicles.

**Architecture:** Keep quality-profile selection as the single source of production traffic capacity. Change the three fixed counts and their literal type, then update profile-level tests and documentation without changing simulation, routing, spacing, recycling, or rendering logic.

**Tech Stack:** TypeScript 7, Vitest 4, Three.js, Vite 8, Bun

## Global Constraints

- High, balanced, and mobile traffic counts must equal 108, 72, and 42.
- Keep the existing viewport and device-pixel-ratio selection thresholds.
- Keep tile diameter, pixel-ratio cap, and shadow-map settings unchanged.
- Keep spawning, routing, vehicle spacing, recycling, model selection, and rendering behavior unchanged.
- Keep the existing long-run visible and moving traffic floors.
- Add no dependencies.
- Preserve the user's unrelated `.gitignore` change and exclude it from all commits.

---

### Task 1: Increase Every Quality Profile's Traffic Pool

**Files:**
- Modify: `tests/quality.test.ts:5-34`
- Modify: `tests/app.test.ts:403-411`
- Modify: `tests/spawning.test.ts:114-116`
- Modify: `tests/city-view.test.ts:58-64`
- Modify: `src/rendering/quality.ts:3-37`
- Modify: `README.md:15-17`
- Modify: `docs/architecture.md:76-88`

**Interfaces:**
- Consumes: `chooseQualityProfile(input: QualityProfileInput): QualityProfile`
- Produces: `QualityProfile.trafficCount` as the literal union `108 | 72 | 42`
- Produces: high, balanced, and mobile profiles with `trafficCount` values `108`, `72`, and `42`

- [ ] **Step 1: Change profile-level tests to the new counts**

In `tests/quality.test.ts`, replace the three `trafficCount` expectations:

```ts
trafficCount: 108,
```

```ts
trafficCount: 72,
```

```ts
trafficCount: 42,
```

In the debug acceptance snapshot assertion in `tests/app.test.ts`, update both traffic counts:

```ts
vehicleSlotCount: 108,
activeVehicleCount: 108,
```

In `tests/spawning.test.ts`, make the profile-size matrix match production:

```ts
it.each([108, 72, 42])('creates %i varied cars with balanced directions', (count) => {
```

In the high-quality fixture in `tests/city-view.test.ts`, keep its profile data consistent:

```ts
trafficCount: 108,
```

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run:

```powershell
bun run test -- tests/quality.test.ts tests/app.test.ts tests/spawning.test.ts tests/city-view.test.ts
```

Expected: FAIL. The three quality tests still receive `72`, `48`, and `28` from production. The application acceptance assertion still receives 72 high-profile vehicle slots and active vehicles. The spawning and city-view tests may pass because they consume their fixture counts directly.

- [ ] **Step 3: Update the quality-profile type and fixed values**

In `src/rendering/quality.ts`, change the traffic count type:

```ts
readonly trafficCount: 108 | 72 | 42
```

Set each profile's count:

```ts
const HIGH = Object.freeze({
  id: 'high',
  tileDiameter: 9,
  trafficCount: 108,
  maxPixelRatio: 1.5,
  shadowMapSize: 2048,
} as const satisfies QualityProfile)

const BALANCED = Object.freeze({
  id: 'balanced',
  tileDiameter: 7,
  trafficCount: 72,
  maxPixelRatio: 1.25,
  shadowMapSize: 1024,
} as const satisfies QualityProfile)

const MOBILE = Object.freeze({
  id: 'mobile',
  tileDiameter: 7,
  trafficCount: 42,
  maxPixelRatio: 1,
  shadowMapSize: 1024,
} as const satisfies QualityProfile)
```

Do not change `chooseQualityProfile`.

- [ ] **Step 4: Run the focused tests and confirm the green state**

Run:

```powershell
bun run test -- tests/quality.test.ts tests/app.test.ts tests/spawning.test.ts tests/city-view.test.ts
```

Expected: PASS for all four test files.

- [ ] **Step 5: Update the user-facing traffic count description**

Replace the traffic profile sentence in `README.md` with:

```markdown
Traffic adapts once at startup to the viewport. High quality uses 108 vehicle slots, balanced uses 72, and viewports narrower than 768 CSS pixels use 42. Every profile retains eastbound, westbound, northbound, and southbound traffic.
```

Replace the acceptance wording in the next paragraph so it does not identify the 72-vehicle regression fixture as the high-quality profile:

```markdown
Each vehicle receives stateless, seed-derived driver traits for cruise speed, acceleration, braking, headway, and minimum gap. Route decisions start from a 55% straight, 22.5% left, and 22.5% right distribution, with a bounded profile adjustment to the straight share. Turns follow smooth curves between the authored incoming and outgoing lane centerlines. A car counts as protected while its conservative radial extent (`center distance - half length`) reaches the protected radius. The stationary-camera regression retains all 72 of its test slots and, after warm-up, at least 18 protected cars with at least 11 of those moving. The moving-camera regression also requires at least 18 visible cars and all four visible directions in every one-minute window.
```

- [ ] **Step 6: Update the maintainer documentation**

In `docs/architecture.md`, describe the unchanged long-run test as a fixture instead of a production profile:

```markdown
Deterministic replacement candidates start with their complete conservative extent outside the protected radius on an approach route that crosses it, and are accepted only when personal front/rear gaps and intersection occupancy are safe. If no candidate is safe, the slot remains inactive and retries later. Stationary-camera coverage runs a 72-vehicle regression fixture for 216,000 fixed steps. Its acceptance floors require every 3,600-step sample after an 18,000-step warm-up to retain all 72 active slots, at least 18 visible cars, and at least 11 visible cars moving faster than 0.25 units per second. The 36,000-step moving-camera regression requires at least 18 visible cars at each one-minute sample and all four visible directions in every one-minute window.
```

Update the quality table counts:

```markdown
| Profile | Selection | Tile window | Vehicle slots | Pixel-ratio cap | Shadow map |
| --- | --- | ---: | ---: | ---: | ---: |
| High | width ≥ 1200 and DPR ≤ 2 | 9×9 | 108 | 1.5 | 2048 |
| Balanced | width 768–1199 or DPR > 2 | 7×7 | 72 | 1.25 | 1024 |
| Mobile | width < 768 | 7×7 | 42 | 1 | 1024 |
```

- [ ] **Step 7: Check the patch for stale production counts and formatting errors**

Run:

```powershell
rg -n 'uses 72 vehicle slots|balanced uses 48|pixels use 28|\| 48 \||\| 28 \||trafficCount: 48|trafficCount: 28' src tests README.md docs/architecture.md
git diff --check
```

Expected: `rg` returns no matches. `git diff --check` exits with no errors. References to 72 in generic test fixtures and the documented long-run regression remain valid.

- [ ] **Step 8: Run the complete verification sequence**

Run:

```powershell
bun run test
bun run typecheck
bun run build
```

Expected: Vitest reports all tests passing. TypeScript exits with code 0. Vite produces the production bundle and exits with code 0.

- [ ] **Step 9: Commit the implementation**

Run:

```powershell
git add -- src/rendering/quality.ts tests/quality.test.ts tests/app.test.ts tests/spawning.test.ts tests/city-view.test.ts README.md docs/architecture.md
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: increase vehicle count"
```

Expected: the staged file list contains only the seven files above. The commit succeeds, and `.gitignore` remains unstaged.
