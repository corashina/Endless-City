# Scene Atmosphere and Controls Design

**Date:** 2026-07-14

## Goal

Make Endless City present as an uninterrupted scene, give camera movement a short natural coast after input ends, brighten the daylight, and add a sparse layer of small clouds without compromising the endless-world or bounded-resource guarantees.

## Approved behavior

- The normal interface is removed. The title, help panel, help toggle, statistics toggle, and FPS display no longer exist in the document or runtime bootstrap.
- Loading, WebGL recovery, fatal-error text, and Retry remain visible only while the scene is unavailable. Once ready, the canvas is the only visible element.
- Pointer and touch panning, wheel zoom, and pinch zoom use moderate damping. Releasing input preserves a short decaying motion instead of stopping immediately.
- The existing 36-degree polar angle, 45-degree azimuth, 100–125 distance limits, disabled rotation, and touch mappings remain unchanged.
- The scene uses a light blue-grey daylight background and matching fog instead of black.
- Sunlight becomes warmer and brighter, while hemisphere fill light is strengthened modestly so building faces and roads remain readable without flattening the shadows.
- Exactly five small low-poly cloud groups are available at runtime. They stay dispersed around the view, avoid a permanent central cluster, and recycle around the logical camera during travel.

## Architecture

### Scene-only interface

`index.html` retains the canvas and a reduced blocking-status subtree. `src/ui/overlay.ts` is narrowed to loading, recovery, error, and retry behavior; all help and FPS responsibilities are removed. `src/main.ts` continues to construct this reduced controller so startup and WebGL failures remain understandable.

The debug acceptance hook remains programmatic. It does not restore visible statistics or ordinary interface chrome.

### Damped controls

`configureLockedLegacyCamera()` remains the single owner of MapControls configuration. It enables `enableDamping` and sets `dampingFactor` to `0.08`, in addition to the existing fixed-angle, distance, pan, zoom, and touch constraints.

`CameraController.update()` already runs `controls.update()` every animation frame, which is required for damping. Floating-origin recentering remains deferred during an active pointer gesture. After the controls emit `end`, the next update may recenter before the remaining damping has fully decayed; because camera and target are shifted together, the stored pan delta continues in the bounded local frame without changing the locked view angle.

### Daylight and sun

`createSceneGraph()` owns the atmospheric palette:

- background and fog: `0xd7e5ee`;
- directional light: warm `0xfff1cf`, intensity `1.6`;
- hemisphere light: sky `0xe7f2ff`, ground `0xb9aa8f`, intensity `1.25`.

The existing directional-light position, target-following behavior, shadow radius, map sizes, and soft-shadow setup remain unchanged. No post-processing pipeline or additional light is introduced.

### Bounded cloud layer

A focused rendering module owns `CloudLayer`. It creates five reusable cloud groups. Each cloud consists of three or four low-detail rounded lobes made from shared geometry and one shared off-white material. Lobe scale and offsets create the existing low-poly visual language without adding external models or textures.

Clouds sit between 42 and 58 world units above the city. Initial logical X/Z positions use a fixed dispersed pattern, and every cloud starts at least 70 horizontal world units from the camera target. On each frame, `CloudLayer.update(logicalCamera, origin)`:

1. measures each cloud against the logical camera;
2. wraps a cloud that leaves the 210-unit outer radius to the opposite outer edge;
3. applies a deterministic perpendicular offset derived from that cloud's stable index;
4. converts its logical position to render-local coordinates by subtracting the current origin.

This moves at most the clouds that leave the outer boundary, preserves visible parallax, survives render-origin shifts, and keeps the cloud and mesh counts constant. Clouds neither cast nor receive shadows, so they do not darken the city or add shadow-map cost. The shared geometry and material are disposed with the layer.

`src/app.ts` creates the cloud layer after scene setup, updates it from the same camera state used by the city and traffic, and disposes it with the other app-owned views.

## Data flow

Each animation frame follows the existing order:

1. MapControls applies one damped input step.
2. CameraController returns the logical camera and current render origin.
3. City and traffic update from that camera state.
4. CloudLayer wraps only out-of-range clouds and projects all five into render-local coordinates.
5. The directional-light shadow target follows the local camera and the renderer draws the scene.

Clouds are presentation-only. They do not enter tile selection, traffic simulation, acceptance snapshots, or world determinism contracts.

## Error handling and lifecycle

Removing ordinary UI must not weaken startup or recovery behavior. Asset-loading progress, WebGL context loss, terminal restoration timeout, and frame errors continue to use the reduced blocking overlay. Retry still reloads the page.

Cloud construction uses only in-memory Three.js primitives and cannot trigger network failure. Disposal removes cloud groups from the scene and disposes their shared geometry and material exactly once. Existing app cleanup remains idempotent.

## Verification

Automated tests must prove:

- the document contains no title/help/statistics/FPS controls but retains the blocking status and Retry elements;
- the reduced overlay supports loading, ready, recovery, error, retry, and disposal paths;
- locked camera controls enable damping with factor `0.08` while preserving all existing angle, distance, and input constraints;
- the scene graph uses the approved background, fog, and light colors/intensities while preserving shadow bounds;
- CloudLayer owns exactly five cloud groups, shares resources, starts outside the 70-unit protected central radius, wraps out-of-range clouds, converts through the render origin, and disposes once;
- app lifecycle tests cover cloud update and cleanup without changing traffic or city behavior;
- type checking, the full test suite, production build, and `git diff --check` pass.

A production browser smoke check verifies that the ready state is scene-only, camera motion decays smoothly, daylight remains readable without washed-out shadows, five clouds are visible but sparse, long-distance panning recycles clouds without obvious central popping, and the console remains free of errors.

## Non-goals

- Removing loading, recovery, or fatal-error feedback.
- Adding a settings panel or runtime quality controls.
- Unlocking camera rotation or changing the approved view composition.
- Cloud shadows, volumetric clouds, weather, wind simulation, or a day/night cycle.
- New image files, textures, downloaded models, post-processing, or dependencies.
