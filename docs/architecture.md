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

Each directed root in `cars.gltf` becomes a vehicle prototype. The loader validates direction extras as one of `(1, 0)`, `(-1, 0)`, `(0, 1)`, or `(0, -1)`, measures length from its bounds, and exposes immutable metadata to the simulation. `src/rendering/traffic-view.ts` allocates one render slot per simulation slot and interpolates between previous/current progress. A recycled slot may exchange its cloned prototype, but the slot count remains fixed.

If no valid vehicle metadata is available, `src/app.ts` constructs neither `TrafficSimulation` nor `TrafficView`. The city, camera, controls, lighting, overlay, and render loop continue without a traffic pool.

## Traffic simulation

### Lanes and following

`src/traffic/lanes.ts` represents each straight road as a direction plus an integer line. Scalar progress always increases. East/south use the authored `-16` transverse offset; west/north use `-23`. Direction alone maps progress onto positive or negative X/Z, eliminating parent-transform corrections.

`src/app.ts` feeds elapsed render time to `consumeFixedSteps`. The accumulator caps long frames at 0.1 seconds and advances `TrafficSimulation` at exactly 1/60 second per step. `src/traffic/following.ts` groups active vehicles by lane, orders them by progress, applies minimum-gap/time-headway acceleration and braking, and clamps progress so a follower cannot cross its leader. Rendering interpolation affects presentation only.

### Intersection reservations

Crossing centers repeat every 60 units with the road asset’s `-20` offset. `src/traffic/intersections.ts` gives each conflict zone at most one reservation. Approaching vehicles are ordered by distance to the stop line, then stable vehicle ID; the winner holds the reservation until its rear bumper leaves the zone. A loser treats the stop line as a zero-speed logical leader. Perpendicular traffic therefore cannot occupy the same conflict zone.

### Hidden recycling

`src/traffic/spawning.ts` keeps the simulation centered around the logical camera. Production uses the 300-unit fog-far distance as the protected radius and a 420-unit simulation radius, adding a two-block buffer. An active vehicle is not removed until it is beyond 420 units. Deterministic replacement candidates must be farther than 300 units, outside all visible fog, and are accepted only when front/rear gaps and intersection occupancy are safe. If no candidate is safe, the slot becomes inactive and retries later. Recycling cannot be visible and never changes the number of simulation or render slots.

## Quality profiles

`src/rendering/quality.ts` selects one profile at startup so resizing does not cause visible density oscillation.

| Profile | Selection | Tile window | Vehicle slots | Pixel-ratio cap | Shadow map |
| --- | --- | ---: | ---: | ---: | ---: |
| High | width ≥ 1200 and DPR ≤ 2 | 9×9 | 49 | 1.5 | 2048 |
| Balanced | width 768–1199 or DPR > 2 | 7×7 | 32 | 1.25 | 1024 |
| Mobile | width < 768 | 7×7 | 20 | 1 | 1024 |

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

- Turning vehicles, pedestrians, traffic lights, and public-transport behavior.
- Saved worlds, user-generated layouts, multiplayer, or server persistence.
- Procedural geometry or new visual assets.
- Day/night cycles, weather, interiors, or free-flight controls.
- A physically realistic traffic model; the goal is deterministic, visually safe ambient motion.
