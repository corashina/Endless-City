# Locked Legacy Camera Design

**Date:** 2026-07-14

## Goal

Restore the original project's fixed isometric-like camera composition while preserving the redesigned endless-world panning, responsive rendering, and useful zoom controls.

## Approved behavior

The camera uses the legacy framing values:

- polar angle: `Math.PI / 5` (36 degrees from vertical);
- azimuth angle: `Math.PI / 4` (45-degree diagonal view);
- camera-to-target distance: 100 to 125 world units;
- rotation: disabled;
- panning: enabled;
- zooming: enabled within the distance range.

Mouse or pointer panning and wheel zoom remain available. On touch devices, one finger pans and two fingers combine pan with pinch zoom. No input can rotate or tilt the camera away from the approved composition.

## Architecture

The constraints belong in `src/rendering/scene.ts`, immediately after `MapControls` construction and before its first `update()`. This lets MapControls establish the legacy spherical orientation itself and keeps the camera/target offset coherent with panning, zooming, interaction-safe recentering, and render-origin shifts.

The configuration is exposed through a small exported helper that accepts a narrow controls adapter. `createScene()` applies the helper to the real MapControls instance. Tests use a lightweight adapter and the scene graph to verify the exact values and resulting orientation without creating WebGL.

The camera controller remains unchanged. It continues to own logical/render coordinate conversion and post-gesture recentering; it does not own view composition.

## Interaction details

- Left-button drag continues to pan the city.
- Mouse wheel and the existing dolly gesture zoom only between distances 100 and 125.
- Rotation input is disabled rather than corrected after the fact.
- One-finger touch is explicitly mapped to pan so disabling rotation does not make primary touch input inert.
- Two-finger touch remains dolly-and-pan.
- The fixed angle survives window resize, floating-origin recentering, BFCache suspension, and WebGL recovery because those paths do not recreate or mutate the camera's spherical relationship to its target.

## Verification

Tests must prove:

- exact polar, azimuth, minimum-distance, and maximum-distance settings;
- rotation disabled while pan and zoom remain enabled;
- one-finger pan and two-finger dolly-pan mappings;
- the first controls update places the perspective camera at the legacy polar and azimuth angles;
- panning changes camera and target together without changing their relative angle;
- zoom remains clamped to the approved range;
- existing camera-controller, lifecycle, traffic, and endless-world tests remain green.

A production browser smoke verifies the fixed diagonal composition visually, confirms pan and zoom still work, and checks for console errors or warnings.

## Non-goals

- Switching to an orthographic camera.
- Adding a camera-mode selector.
- Restoring legacy damping, pan-speed, keyboard, or disabled-zoom behavior.
- Changing floating-origin thresholds, traffic simulation, fog, lighting, or visual assets.
