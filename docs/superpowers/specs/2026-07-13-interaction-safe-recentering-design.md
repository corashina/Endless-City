# Interaction-safe render-origin recentering

## Problem

`MapControls` ground-plane panning records a world-space ray/plane intersection when a pointer gesture starts. `CameraController` currently recenters the camera and controls target as soon as a local axis crosses 120 units. If that happens before pointer-up, the controls' private gesture reference remains in the previous render frame. The next pointer move interprets the render-origin shift as additional user motion, producing a discontinuous logical-camera jump.

## Design

`CameraController` will observe the controls' public `start` and `end` events. While an interaction is active, `update()` will continue updating controls and reporting the correct logical camera but will not mutate the render origin, camera, or target. The first update after `end` will apply the normal whole-block recentering. This keeps the controls' private gesture frame stable, preserves logical continuity, and restores bounded render-local coordinates immediately after the gesture.

The controller will expose `dispose()` to unregister both event listeners. Application scene cleanup will dispose the controller before disposing Three.js controls and renderer resources.

## Alternatives rejected

- Rebasing `MapControls._panWorldStart` and its ray plane would retain continuous bounds but couple the application to private Three.js implementation details.
- Enabling screen-space panning would avoid the ground-plane reference but change the existing map interaction semantics.

## Verification

A focused controller harness will dispatch `start`, move the camera beyond the recenter threshold, and prove no origin/camera rewrite occurs during the gesture. After `end`, it will prove the same logical coordinate is preserved while local coordinates are recentered into bounds. A cleanup assertion will prove listener removal. Existing origin, city-pool, traffic-pool, and application lifecycle tests remain unchanged, followed by typecheck, the full suite, production build, and a fresh same-session production-browser run.
