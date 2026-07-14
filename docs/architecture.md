# Architecture

Endless City separates an unbounded logical world from a small, bounded Three.js scene. Pure TypeScript modules decide what exists and how traffic moves; rendering adapters project that state around a shifting local origin.

```mermaid
flowchart LR
  I["Map controls"] --> C["Logical camera + render origin"]
  C --> W["Deterministic tile window"]
  C --> S["Fixed-step traffic simulation"]
  A["One-time asset catalog"] --> V["Pooled city + vehicle views"]
  W --> V
  S --> V
  C --> V
  V --> R["Three.js scene"]
  R --> U["Canvas + status overlay"]
```

## Coordinate model and city streaming

`src/city/types.ts` distinguishes integer `GridCoordinate` block addresses from continuous logical `WorldPoint` positions. `BLOCK_SIZE` is 60 units, matching the authored road and building assets. There is no logical board boundary.

`src/city/hash.ts` hashes the fixed world seed with signed X/Z coordinates. `src/city/layout.ts` turns that hash into a weighted building choice and a quarter-turn rotation. A salted local neighbor rule reduces obvious repetition without visitation-order state. Consequently, the same coordinate always returns the same building and rotation, including after leaving and revisiting it or approaching it from another direction.

`src/city/tile-window.ts` enumerates the fixed odd-sized neighborhood around the logical camera cell. `src/rendering/city-view.ts` owns exactly `tileDiameter²` building slots: 81 for high quality or 49 for balanced/mobile. On movement it retains still-visible assignments, releases the departed edge, and assigns those slots to entering coordinates. Ordinary travel creates no additional building slots.

The road is a single existing repeated mesh placed at a 60-unit offset. Tile positions use `coordinate × 60` plus a rotation-specific 0/20-unit plot correction. Because origin shifts are also whole 60-unit multiples, roads and plots stay aligned through recentering.

## Render-origin shifts

Unbounded logical coordinates are unsuitable as ever-growing Three.js transforms. `src/city/origin.ts` therefore tracks an unbounded logical origin and a render-local camera. Once either local X/Z axis exceeds 120 units, it moves the camera and controls target by the nearest whole-block shift and adds that shift to the origin.

All visible transforms use:

```text
render position = logical position - render origin
```

`src/camera/controller.ts` owns this conversion. City and traffic simulation coordinates are never rewritten during a shift, so camera recentering cannot change tile identity, lane gaps, reservations, or recycling decisions. Local camera coordinates remain bounded to a small neighborhood of the renderer origin.

MapControls derives a ground-plane reference when a pointer gesture starts. To keep that reference coherent, `CameraController` listens to the controls' public `start` and `end` events and defers render-origin mutation while the gesture is active. The first update after `end` applies the normal whole-block recenter, so dragging stays continuous and the local camera is bounded again immediately after the gesture. Controller disposal removes both listeners.

## Asset and view lifecycle

`src/rendering/assets.ts` requests the road, 15 building prototypes, and `cars.gltf` once. Source assets remain in `js/clusters/`; `vite.config.ts` treats `js/` as the public directory, so development and production both serve them from `/clusters/`. Building scenes are cached and cloned into tile slots. A failed building uses the existing park prototype when available, then an empty plot; the required road has no silent fallback.

Each directed root in `cars.gltf` becomes a vehicle prototype. The loader validates direction extras as one of `(1, 0)`, `(-1, 0)`, `(0, 1)`, or `(0, -1)`, measures length from its bounds, and exposes immutable metadata to the simulation. `src/rendering/traffic-view.ts` allocates one render slot per simulation slot and interpolates between the previous and current route poses. It uses shortest-angle heading interpolation through turns and rotates each model relative to its authored native direction. A recycled slot may exchange its cloned prototype, but the slot count remains fixed.

If no valid vehicle metadata is available, `src/app.ts` constructs neither `TrafficSimulation` nor `TrafficView`. The city, camera, controls, lighting, overlay, and render loop continue without a traffic pool.

## Traffic simulation

### Lanes and following

`src/traffic/lanes.ts` represents each straight road as a direction plus an integer line. Scalar progress always increases. East/south use the authored `-16` transverse offset; west/north use `-23`. Direction alone maps progress onto positive or negative X/Z, eliminating parent-transform corrections.

`src/app.ts` feeds elapsed render time to `consumeFixedSteps`. The accumulator caps long frames at 0.1 seconds and advances `TrafficSimulation` at exactly 1/60 second per step. Each lifecycle derives a driver's profile, cruise speed, acceleration, braking, time headway, and minimum gap from stateless hashes of the world seed, vehicle ID, lifecycle, and property salt. Route choices use a base distribution of 55% straight, 22.5% left, and 22.5% right. Cautious and assertive profiles move the straight share by at most 10 percentage points while keeping the remaining probability evenly divided between left and right.

`src/traffic/following.ts` groups active vehicles by directed lane and movement, orders them by route progress, and follows the nearest physical leader. Each driver computes a personal target gap from its minimum gap plus speed multiplied by time headway. Closing speed and available gap determine whether comfortable or emergency stopping-distance braking applies. A final route-progress clamp preserves bumper separation, including while a vehicle merges from a turn onto its outgoing lane.

`src/traffic/routing.ts` plans straight, left, and right movements from the arithmetic street grid. Left and right turns are smooth cubic curves whose endpoints and tangents match the authored incoming and outgoing lane centerlines. Vehicles retain their model while route position and heading interpolate through the turn, then continue on the selected outgoing lane.

### Intersection movement grants

Crossing centers repeat every 60 units with the road asset's `-20` offset. `src/traffic/movements.ts` samples each movement's literal swept corridor at half-unit intervals and maps the vehicle-width offsets into fixed two-unit conflict-zone cells. The allocator grants every zone required by a movement atomically, so compatible movements may proceed together while movements with any shared zone serialize.

A request is eligible inside the 20-unit look-ahead only when all required zones are free and the outgoing lane has clearance for the vehicle plus its personal minimum gap. Eligible requests sort by longest accumulated wait, then distance to entry, then stable vehicle ID. This wait-based fairness prevents a repeatedly blocked direction from starving. A pre-entry grant expires unused after 120 fixed steps, equal to two seconds; an entered vehicle retains its zones until its rear bumper clears the swept movement. A blocked or losing vehicle treats the entry line as a zero-speed logical leader.

### Hidden recycling

`src/traffic/spawning.ts` keeps the simulation centered around the logical camera. Production uses the 300-unit fog-far distance as the protected radius and a 420-unit simulation radius, adding a two-block buffer. An active vehicle is normally removed only after it passes 420 units. As a deadlock safeguard, an off-screen vehicle below 0.25 units per second for 720 fixed steps, equal to 12 seconds, is also recycled. Entering the protected radius or resuming motion resets that timer, so a visible car never recycles or teleports.

Deterministic replacement candidates start outside the protected radius on an approach route that crosses it, and are accepted only when personal front/rear gaps and intersection occupancy are safe. If no candidate is safe, the slot remains inactive and retries later. Stationary-camera coverage runs the 72-car profile for 216,000 fixed steps. Its acceptance floors require every 3,600-step sample after an 18,000-step warm-up to retain all 72 active slots, at least 18 visible cars, and at least 11 visible cars moving faster than 0.25 units per second. The verified run stayed above those floors, with observed sample minima of 72 active, 35 visible, and 30 moving-visible cars. The 36,000-step moving-camera regression requires at least 18 visible cars at each one-minute sample and all four visible directions in every one-minute window.

## Quality profiles

`src/rendering/quality.ts` selects one profile at startup so resizing does not cause visible density oscillation.

| Profile | Selection | Tile window | Vehicle slots | Pixel-ratio cap | Shadow map |
| --- | --- | ---: | ---: | ---: | ---: |
| High | width ≥ 1200 and DPR ≤ 2 | 9×9 | 72 | 1.5 | 2048 |
| Balanced | width 768–1199 or DPR > 2 | 7×7 | 48 | 1.25 | 1024 |
| Mobile | width < 768 | 7×7 | 28 | 1 | 1024 |

Every traffic profile includes all four directions. `src/rendering/scene.ts` uses modern sRGB output, capped pixel ratio, fog, and profile-sized soft shadows.

## Bounded atmosphere

`src/rendering/cloud-layer.ts` owns exactly five low-poly cloud groups. All lobes share one geometry and one material and do not participate in shadow maps. Each cloud keeps a logical X/Z position; the layer wraps clouds beyond 210 units to the opposite 190-unit edge and projects them with `logical - render origin`. Long-distance travel therefore retains sparse parallax clouds without unbounded allocation or floating-point growth.

`src/rendering/scene.ts` configures a shared blue-grey background/fog palette, warm directional sunlight, stronger hemisphere fill, and MapControls damping. The fixed 36-degree polar angle, 45-degree azimuth, input mappings, and distance limits remain unchanged.

## Error and application lifecycle

`src/app.ts` owns startup, the animation frame, visibility/resize listeners, pause/resume, and disposal. Loading progress flows from the asset catalog to `src/ui/overlay.ts`. Optional asset failures degrade to existing fallbacks; required road failure, WebGL creation failure, or a frame exception stops the owned loop and shows a concise error with retry. WebGL context loss pauses the loop and exposes a restoring state; restoration resumes the existing application. Loading progress, WebGL recovery, and fatal errors use the blocking status overlay. The title, help, and visible performance controls are absent, so the ready state contains only the canvas; `?debug=1` keeps its programmatic acceptance hook without adding ordinary UI.

## Acceptance diagnostics

Production acceptance state is absent by default. With `?debug=1`, the application exposes a read-only `window.__ENDLESS_CITY_ACCEPTANCE__()` function. Each call returns a fresh frozen snapshot of logical/render-local camera state, render origin, deterministic visible building assignments, fixed pool sizes, active vehicle count, and active directions. The hook is deleted when the application is disposed.

The same debug-only snapshot can be published to a temporary `data-endless-city-acceptance` attribute by activating the inert `acceptance-snapshot` test bridge. This exists only so restricted browser-automation execution contexts can read the hook's result; it exposes no setter and is removed with the hook.

Debug-only `acceptanceX` and `acceptanceZ` query parameters select an exact startup logical camera coordinate when both values are finite multiples of 60, for example `?debug=1&acceptanceX=6000&acceptanceZ=-6000`. They are ignored without debug mode and provide no runtime mutation API.

## Non-goals

- Pedestrians, traffic lights, and public-transport behavior.
- Saved worlds, user-generated layouts, multiplayer, or server persistence.
- Procedural geometry or new visual assets.
- Day/night cycles, weather, interiors, or free-flight controls.
- A physically realistic traffic model; the goal is deterministic, visually safe ambient motion.
