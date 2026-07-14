# Traffic Turn Orientation Design

## Problem

Some south-authored police cars and buses face backward after turning east or west. Their paths, speeds, and collision state remain correct. The defect is limited to the rendered model orientation.

## Root cause

Several roots in `js/clusters/cars.gltf` encode a 180-degree yaw with an equivalent Euler decomposition of approximately `x = -pi`, `y = 0`, and `z = -pi`. `TrafficView` stores only `object.rotation.y` as `baseRotationY`. During a turn it replaces that Y component while leaving the authored X and Z components in place.

That component-wise edit does not represent a relative world yaw. A diagnostic that reconstructed the asset transforms found 20 south-authored east/west cases whose rendered nose vector had a dot product of `-1` against the route direction. Route sampling and simulation traces showed no reversed movement or heading jumps.

## Design

`VehicleSlot` will store the clone's complete authored quaternion instead of one Euler component. For each visible vehicle, `TrafficView.sync` will:

1. Interpolate the current route pose as it does now.
2. Compute `shortestAngleDelta(pose.heading, headingForDirection(vehicle.nativeDirection))`. In Three.js yaw convention, this bounded angle maps the native nose direction to the route heading.
3. Build a quaternion around the world Y axis for that yaw.
4. Pre-multiply the authored quaternion by the yaw quaternion and assign the result to the clone.

Pre-multiplication applies the route adjustment in world space while preserving the model's authored orientation. The view will reuse scratch quaternion objects to avoid per-frame allocation.

## Scope

The change affects `src/rendering/traffic-view.ts` and its tests. It does not change route geometry, simulation state, speeds, spawning, reservations, or collision behavior. It does not rewrite or normalize the source assets.

## Tests

The regression test will create a south-authored object with the same full orientation found in the affected assets. It will render eastbound and westbound route poses, derive the model's world-space nose vector, and assert that the nose aligns with the route.

Existing east-authored to northbound coverage will remain. Table-driven coverage will check all 16 native and route direction combinations without reading production asset metadata. Turn sampling will verify that the rendered nose stays aligned with the movement tangent throughout all eight left and right movements.

## Acceptance criteria

- Affected south-authored vehicles face east after an eastbound turn and west after a westbound turn.
- Vehicle orientation changes smoothly with the interpolated route heading.
- The renderer preserves each clone's complete authored orientation.
- Traffic simulation results remain unchanged.
- Focused tests, the full test suite, type checking, and the production build pass.
