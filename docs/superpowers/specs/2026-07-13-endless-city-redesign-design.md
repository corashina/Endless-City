# Endless City Redesign

**Date:** 2026-07-13
**Status:** Approved design
**Branch:** `codex/endless-city-redesign`

## Purpose

Modernize the eight-year-old Endless City demo while preserving its low-poly visual identity and every existing visual asset. The redesigned application must provide a convincing endless city, deterministic building placement, reliable traffic, mobile support, bounded resource use, clear controls, and maintainable documentation.

The code and toolchain may be replaced. No new 3D models, images, icons, textures, or other visual assets will be introduced.

## Existing project audit

The original application has a strong visual concept but combines loading, rendering, world movement, traffic simulation, and collision detection in one global script. Its apparent infinity comes from a fixed 8 by 8 building board and camera teleports.

The reported car failures have concrete causes:

- The vertical wrap conditions mutate `car.position.x` instead of `car.position.z`. Once a northbound or southbound car crosses a vertical limit, it is displaced sideways by 480 units every frame and rapidly disappears.
- Vehicle transforms are local to the loaded `cars.gltf` scene, but collision-ray origins apply a hard-coded `x + 58` correction. This only approximates the current parent offset and mixes local and world coordinate spaces.
- Each car raycasts against every car hierarchy, with no explicit exclusion of its own model and no representation of lanes or a leading vehicle.
- Movement, acceleration, and braking are frame based. Behavior therefore changes with frame rate.
- Camera wrapping, car wrapping, and asset placement each use separate magic limits and offsets.
- Direction handling contains unreachable branches because every defined direction is caught by the first truthy check. A dormant north-facing branch also refers to an undefined variable.
- Cars are disabled entirely when `screen.width` is 768 pixels or less.
- Building models are loaded and parsed repeatedly even when the same prototype is used many times.
- The application has no recoverable loading error state and relies on obsolete Three.js gamma settings.

The asset audit establishes two useful spatial contracts:

- City blocks use a 60-unit spacing.
- `road.glb` contains an approximately 500 by 500 road surface whose lane pattern repeats on that spacing.
- `cars.gltf` contains 49 reusable vehicle roots with one of four axis-aligned direction vectors in node extras.
- The authored car transforms demonstrate two opposing lanes on each road.

## Considered approaches

### 1. Streamed deterministic tile pool — selected

Render only a reusable neighborhood around the camera. Map unbounded logical grid coordinates to existing building prototypes with a seeded hash. Keep traffic in logical coordinates and use a fixed-step lane simulation.

This approach offers genuine unbounded movement, deterministic revisiting, bounded memory, mobile scalability, and isolated, testable rules.

### 2. Modernized toroidal board

Keep the fixed board and formalize all camera and car wrapping. This would be a smaller change, but repetition would remain obvious and all moving systems would still depend on artificial board boundaries.

### 3. Chunked district simulation

Load and persist larger districts with independent traffic simulations. This provides room for richer future behavior but adds unnecessary lifecycle, persistence, and cross-chunk traffic complexity.

## Technical foundation

The application will use:

- Vite for local development and static production builds.
- TypeScript with strict checking.
- A current Three.js release and its maintained `MapControls` and `GLTFLoader` modules.
- Vitest for deterministic unit tests.
- Plain HTML and CSS for the overlay; no component framework is required.

The existing GLTF and GLB files remain the source of all visible city and vehicle content. The external Google Fonts dependency will be removed in favor of a system font stack.

## Architecture

The central architectural rule is that simulation state never depends on Three.js object positions. Logical world coordinates and render-local coordinates are separate types and cross a small, explicit adapter boundary.

Suggested module boundaries:

- `src/city/coordinates.ts`: grid coordinates, block size, logical-to-render conversion, and origin shifts.
- `src/city/layout.ts`: seeded coordinate hashing, weighted building selection, rotations, and neighbor constraints.
- `src/city/tile-window.ts`: desired visible coordinates and tile-view reassignment.
- `src/traffic/lanes.ts`: axis-aligned lane identities, positions, directions, and intersections.
- `src/traffic/simulation.ts`: fixed-step vehicle updates, following, braking, and intersection reservations.
- `src/traffic/spawning.ts`: deterministic vehicle selection, density, minimum gaps, and off-screen recycling.
- `src/rendering/assets.ts`: one-time asset loading, prototype extraction, cloning, and fallbacks.
- `src/rendering/city-view.ts`: road surface and pooled building views.
- `src/rendering/traffic-view.ts`: pooled vehicle views and interpolated transforms.
- `src/rendering/scene.ts`: renderer, camera, lighting, fog, shadows, resize, and context lifecycle.
- `src/camera/controller.ts`: map controls, logical camera tracking, and render-origin recentering.
- `src/ui/overlay.ts`: loading, help, diagnostics, and recoverable error states.
- `src/app.ts`: bootstrap, lifecycle coordination, fixed-step accumulator, and rendering.

Each unit exposes data-oriented interfaces and can be understood without inspecting Three.js internals. City and traffic modules remain usable in tests without a DOM or WebGL context.

## Logical coordinates and render origin

The logical city is an unbounded integer grid. A `GridCoordinate` identifies a city block. One block equals 60 world units.

The camera controller tracks both:

- A logical camera position that can grow without a board boundary.
- A render-local camera position kept close to the origin.

When the local camera crosses a recenter threshold, the controller shifts it and its control target by a whole number of 60-unit blocks and increments the logical render origin by the same amount. Visible object positions are then derived from `logical position - logical render origin`.

Origin shifting is never implemented by mutating traffic simulation coordinates. This invariant prevents camera travel from changing traffic gaps, lane identities, or recycling decisions.

## Deterministic city streaming

The high quality profile uses a 9 by 9 visible tile window. Balanced and mobile profiles use 7 by 7. The selected size remains fixed for the session and does not grow while travelling.

When the camera enters another grid cell:

1. Calculate the complete desired coordinate set around the logical camera cell.
2. Retain tile views already assigned to desired coordinates.
3. Collect views whose coordinates left the window.
4. Assign those views to newly visible coordinates.
5. Select the appropriate cached building prototype and rotation.
6. Place the view relative to the current render origin.

No building view is created or destroyed during ordinary travel after the pool is initialized.

The layout function accepts a fixed seed and a grid coordinate. It produces a stable weighted building category and a compatible rotation. The result is independent of travel direction and generation order. A deterministic local neighbor rule reduces immediate identical neighbors without requiring stored world state.

All unique existing building models participate in the weighted catalog. Parks and ordinary residential/commercial buildings have higher weights; visually dominant landmarks have lower weights. The exact weights will be constants documented alongside the catalog and covered by distribution sanity tests.

The existing road mesh stays centered beneath the render window. Recenter operations occur only in complete block increments, preserving alignment with its repeated 60-unit road pattern. Its outer boundary remains beyond the active building window and is concealed by fog. The implementation will verify this relationship at each quality profile rather than relying on the original camera limits.

## Asset lifecycle

All required assets are requested once during bootstrap. Building scenes are cached as prototypes and cloned with shared immutable geometry and material resources.

The vehicle loader treats each directed root in `cars.gltf` as a vehicle prototype. Direction extras are validated as exactly one of `(1, 0)`, `(-1, 0)`, `(0, 1)`, or `(0, -1)`. Approximate vehicle length is derived from model bounds and stored with the prototype.

The asset layer owns disposal. Shared geometry and materials are never disposed when an individual pooled view is reassigned. They are disposed only when the whole application is torn down.

## Traffic model

Traffic is a bounded simulation centered on the logical camera and surrounded by a buffer larger than the visible/fogged area.

Each vehicle contains only simulation data:

- Stable pool identifier.
- Vehicle prototype identifier and length.
- Lane identifier and one of four directions.
- Scalar progress along the lane.
- Previous and current logical positions.
- Current speed and deterministic desired speed.
- Acceleration/braking state.

Lanes are mathematical, axis-aligned paths on the 60-unit road grid. Their opposing offsets are derived from the existing road and vehicle placement rather than from a parent-scene correction. Cars do not turn in this iteration.

### Fixed-step update

Rendering supplies elapsed time to an accumulator. Traffic advances in fixed 1/60-second steps. Elapsed time is capped after inactive tabs or long stalls to avoid a large catch-up burst. Render transforms interpolate between the previous and current simulation states.

### Safe following

Vehicles are grouped by lane and direction and ordered by scalar progress. For each vehicle, the simulation calculates bumper-to-bumper distance to the vehicle ahead. A time-headway rule determines a desired gap from current speed plus a fixed minimum gap.

The vehicle accelerates toward its deterministic desired speed when clear and brakes smoothly when the gap falls below the desired value. Emergency clamping prevents a step from crossing the leading vehicle even after an unusually large correction.

No raycasts are used for traffic movement or collision avoidance.

### Intersection conflicts

Every crossing has a small logical conflict zone. A vehicle approaching that zone requests a reservation. A request succeeds when the zone is empty and no earlier conflicting request has priority. Arrival step and stable vehicle identifier provide deterministic tie-breaking.

The reservation remains held until the vehicle leaves the conflict zone. A vehicle without a reservation treats the stop line as its temporary leader. This prevents perpendicular overlap without implementing turns or visible traffic signals.

### Spawning and recycling

The high quality profile uses 49 active vehicle slots, matching the original collection. The balanced profile uses 32 and the mobile profile uses 20. Every profile retains all four directions.

Vehicles leaving the buffered simulation area are eligible for recycling. A candidate lane and spawn progress are derived deterministically, validated against minimum front and rear gaps, and placed beyond the fog. If no safe candidate exists, the vehicle remains inactive and retries on a later simulation step.

A vehicle inside the visible or fog-transition region is never recycled. Recycling changes simulation identity and render assignment only while hidden.

## Rendering and quality profiles

The visual direction remains the original elevated low-poly map:

- Existing models and colors.
- Dark scene background and distance fog.
- Directional sunlight, hemisphere fill light, and contact-defining shadows.
- Map-style pan, zoom, and rotation controls.

Modern Three.js color-space configuration replaces obsolete gamma flags. The renderer sets a capped device pixel ratio. Shadow resolution, tile-window size, traffic count, and pixel-ratio cap come from a small quality profile chosen from viewport and device capability. The quality profile remains stable during a session to avoid visible oscillation.

The directional shadow camera follows the active camera area so shadow-map precision is concentrated where it is visible. Built-in frustum culling remains enabled, while pooling and shared resources control CPU and memory costs.

The animation loop pauses simulation accumulation while the document is hidden. Resize and device-pixel-ratio changes update the camera and renderer without resetting logical state.

## User interface

The interface is deliberately minimal:

- A compact “Endless City” identity.
- A help control and dismissible panel.
- Mouse guidance for pan, zoom, and rotation.
- Equivalent touch guidance.
- Loading progress tied to completed asset requests.
- An optional performance-statistics display, disabled by default.

The initial help panel dismisses automatically after a short readable interval but is always recoverable. Controls are keyboard-focusable, have accessible names, and respect reduced-motion preferences for overlay transitions.

## Error handling

- If a building model fails, the existing park prototype substitutes for that catalog entry. If the park also fails, that block remains empty while its road surface remains visible.
- If the vehicle collection fails or contains no valid directed prototypes, the city remains usable with traffic disabled.
- Loading failures produce a concise visible error panel with a retry action rather than leaving the spinner indefinitely.
- A missing WebGL capability produces a readable unsupported-browser message.
- WebGL context loss pauses the loop and shows a restoration state; successful restoration resumes, while repeated failure offers a reload action.
- Debug diagnostics are enabled explicitly and are absent from the default presentation.

## Testing strategy

Pure Vitest suites will verify:

- Coordinate conversion and origin-shift invariants.
- Stable hashes for positive and negative grid coordinates.
- Layout independence from travel order.
- Neighbor-rule determinism and weighted-distribution sanity.
- Tile windows with no duplicates, omissions, or growth after repeated travel.
- Fixed-step equivalence across different render-frame sequences.
- Safe following, acceleration, braking, and non-overlap.
- Deterministic intersection reservations and release.
- Recycling only outside the protected visible/fog region.
- Spawn minimum gaps and four-direction coverage.
- Validation of the existing asset files and vehicle direction metadata.

Integration verification will run strict TypeScript checking, all unit tests, and a production build. Browser checks will cover long-distance travel in each direction, repeated origin shifts, desktop and mobile viewports, help/loading/error UI states, and sustained traffic observation.

## Documentation deliverables

- Rewrite the root README with the concept, controls, development commands, testing, building, and deployment.
- Add a legacy audit with the original failure causes and their replacements.
- Add an architecture guide for logical coordinates, streaming, asset reuse, traffic, and quality profiles.
- Retain this approved design specification.
- Add a detailed implementation plan before code changes.

## Acceptance criteria

- The camera can travel hundreds of blocks in every direction without an edge, visible discontinuity, or increasing pool size.
- Returning to a logical coordinate produces the same building and rotation.
- Buildings remain aligned to the existing road grid through every origin shift.
- Cars remain lane-aligned in all four directions.
- Following vehicles do not overlap, and perpendicular vehicles do not share an intersection conflict zone.
- Cars are never visibly recycled or displaced onto the wrong axis.
- Traffic remains present on mobile at reduced density.
- Object counts remain bounded during extended travel.
- Loading and WebGL failures have readable, recoverable states.
- Type checking, automated tests, production build, and browser verification pass.
- No new visual assets are added.

## Non-goals

This iteration does not include turning vehicles, visible traffic lights, pedestrians, saved worlds, multiplayer, new models, procedural geometry, or a day/night cycle.
