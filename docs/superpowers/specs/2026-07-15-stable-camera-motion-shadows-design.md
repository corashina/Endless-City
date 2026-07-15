# Stable Camera-Motion Shadows Design

## Goal

Remove the ripple or swimming visible on static building shadows while the camera pans or eases to a stop. Preserve the current soft daylight appearance, shadow coverage, quality profiles, and GPU budget on desktop and mobile.

## Cause

The animation loop centers the directional light and its orthographic shadow camera on the damped camera target each frame. That continuous movement shifts static geometry across the discrete shadow-map texel grid. `PCFSoftShadowMap` filters the changing samples, which makes shadow edges appear wavy during camera motion.

The current shadow camera spans 360 world units. A texel covers about 0.176 world units on the 2048 map and 0.352 world units on the 1024 map. Raising the map resolution would reduce the artifact at a GPU and memory cost, but the projection would still move between texels.

## Chosen Approach

Snap the shadow camera center to its light-space texel grid. Keep the directional light centered near the camera, but move the light and its target only in whole shadow-texel increments along the shadow camera's horizontal and vertical axes.

This approach retains `PCFSoftShadowMap`, the existing map sizes, the fixed light direction, and the 360-unit orthographic bounds. The renderer continues to update the shadow map each frame, so vehicle shadows keep moving with their vehicles.

## Component Design

Add `src/rendering/shadow-follower.ts` with a `DirectionalShadowFollower` class. The class owns shadow-center stabilization and exposes one operation:

```ts
update(targetX: number, targetZ: number): void
```

The constructor receives the scene's directional light and caches:

- the offset from the target to the light;
- the shadow camera's light-space horizontal, vertical, and depth axes;
- the horizontal and vertical world-space texel sizes.

The class has no animation-loop, camera-control, asset, or quality-selection responsibilities.

## Snapping Algorithm

The constructor derives an orthonormal basis from the fixed light offset and world up:

1. Normalize the light offset to obtain the shadow depth axis.
2. Cross world up with the depth axis to obtain the horizontal axis.
3. Cross the depth axis with the horizontal axis to obtain the vertical axis.

It derives texel dimensions from the active shadow configuration:

```text
horizontal texel = (camera.right - camera.left) / map width
vertical texel   = (camera.top - camera.bottom) / map height
```

For each update, the follower constructs the desired render-local center `(targetX, 0, targetZ)`. It projects that point onto the three cached axes, rounds the horizontal and vertical coordinates to the nearest texel, and preserves the depth coordinate. It reconstructs the snapped center from those coordinates, assigns it to the light target, and places the light at `snapped center + original offset`.

Snapping in light space aligns the shadow projection with its texel grid even though the light points diagonally across the world. Preserving the depth coordinate avoids an unrelated restriction on light movement along its viewing direction.

## Application Integration

Create one follower after scene and asset startup, where `src/app.ts` now captures `shadowOffset`. Replace the per-frame target allocation and the two manual light-position copies with:

```ts
shadowFollower.update(context.controls.target.x, context.controls.target.z)
```

The frame order remains:

1. Update camera controls and render-origin state.
2. Update clouds, city tiles, and traffic.
3. Update the snapped shadow center from the render-local camera target.
4. Render the scene.

Render-origin recentering requires no special path. The camera target and city objects shift in the same frame, and the follower consumes the new render-local target before rendering.

## Validation and Error Handling

The constructor throws a descriptive error if any required value would make the basis or texel grid invalid:

- a zero-length light offset;
- a light direction parallel to world up;
- non-finite or non-positive orthographic spans;
- non-finite or non-positive shadow-map dimensions.

The existing application error handling catches startup failures and reports them through the scene-unavailable overlay. `update` rejects non-finite target coordinates so a broken camera state cannot write `NaN` transforms into the scene graph.

## Testing

Add focused unit tests for `DirectionalShadowFollower`:

- sub-texel target movement keeps the light-space horizontal and vertical center fixed;
- crossing a boundary moves the projected center by one light-space texel;
- diagonal movement snaps on both light-space axes;
- 2048 and 1024 maps produce their configured texel steps;
- the light-to-target offset stays unchanged after updates;
- a render-origin-sized target jump keeps finite, aligned transforms;
- invalid offsets, bounds, map dimensions, and update coordinates throw clear errors.

Keep the existing scene, camera, quality, application, traffic, and rendering tests unchanged unless an assertion needs to observe the new follower boundary. Run these project gates after implementation:

```powershell
bun run typecheck
bun run test
bun run build
```

Pan and zoom the local scene after the automated gates pass. Static building shadows should keep stable edges through drag and damping. Vehicle shadows should continue to move, the soft edge style should match the current scene, and no shadow clipping should appear near the viewport edges.

## Out of Scope

This change does not add cascaded shadows, larger maps, extra render passes, contact shadows, new quality settings, or new UI. It does not change the light color, intensity, direction, shadow radius, camera controls, fog, models, or materials.
