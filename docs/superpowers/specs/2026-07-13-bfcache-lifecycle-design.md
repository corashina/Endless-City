# BFCache Lifecycle Design

**Date:** 2026-07-13

## Goal

Make the application safe across back-forward cache transitions without reloading or surrendering resource ownership. A persisted `pagehide` pauses a ready application or suspends a pending bootstrap; a matching persisted `pageshow` resumes only the work that was active before suspension. A non-persisted `pagehide` remains final teardown.

## Constraints

- Use public `pagehide` and `pageshow` semantics through the event's `persisted` property.
- Preserve the existing ownership split: bootstrap owns resources until the ready loop takes over.
- Never dispose the catalog, renderer context, overlay, or recovery state merely because the page entered BFCache.
- Never resume a ready loop that was already paused before the persisted `pagehide`.
- Preserve context-loss and other pre-existing pause state.
- Make repeated lifecycle events and disposal idempotent.
- Suppress all UI reporting after final teardown.
- Preserve existing assets and application scope.

## Chosen Approach

Extend the two existing lifecycle owners with small, explicit BFCache state instead of introducing a shared lifecycle controller.

This keeps responsibility local:

- the pending bootstrap decides whether asynchronous asset settlement may advance to application startup;
- the ready-loop handle decides whether its animation loop should restart;
- final teardown remains owned by the phase active when the non-persisted transition occurs.

A shared controller would centralize the events, but it would also require a broad refactor of bootstrap, recovery, and ready-loop ownership. Reloading on `pageshow` would discard state and would not satisfy the pause/resume requirement.

## Ready Application Lifecycle

The ready loop installs both `pagehide` and `pageshow` listeners.

On the first persisted `pagehide`:

1. Record whether the animation loop was running immediately before the event.
2. Mark the loop as BFCache-suspended.
3. Pause it and cancel the outstanding animation frame without disposing application resources.
4. Clear the prior-frame timestamp so the first restored frame cannot receive a BFCache-sized delta.

On a persisted `pageshow` while BFCache-suspended:

1. Clear the suspension marker.
2. Resume only if the loop was recorded as running before suspension.
3. Leave the loop paused when it was already paused because of context loss, a manual pause, or another pre-existing condition.

Repeated persisted hides while suspended and repeated shows after restoration are no-ops. Non-persisted `pagehide` invokes the existing final disposal path. Final disposal removes both transition listeners.

## Pending Bootstrap Lifecycle

Bootstrap installs its own `pagehide` and `pageshow` listeners while it owns loading, recovery, context, and overlay resources.

On persisted `pagehide`:

1. Mark bootstrap as BFCache-suspended.
2. Keep all resource ownership and loading state intact.
3. If the asset promise settles while suspended, hold both successful and failed settlement until a matching persisted `pageshow`.

On persisted `pageshow`:

1. Clear the suspension marker.
2. Release any deferred settlement.
3. Continue normal bootstrap, producing a usable ready application after successful loading or reporting a still-current loading failure.

On non-persisted `pagehide`:

1. Mark bootstrap as finally disposed.
2. Remove both bootstrap transition listeners immediately.
3. Release any suspended settlement so the asynchronous operation can reach its disposed branch.
4. Remove recovery listeners and dispose the renderer context and overlay.
5. Dispose the eventual asset catalog if loading later resolves.
6. Suppress error reporting if loading later rejects because no UI remains owned by bootstrap.

Immediately before handing resources to the ready application, bootstrap removes its transition listeners. The ready loop then installs its own pair, so exactly one phase owns page transitions at a time.

## Error and Recovery Semantics

BFCache suspension does not reset context-recovery state. A loop waiting for WebGL recovery stays paused after `pageshow`; restoration of the page is not treated as restoration of the WebGL context.

Loading progress and failures are still current across a persisted transition, but they may advance the UI only after `pageshow`. After non-persisted final teardown, progress and failures are ignored, and any late successful assets are disposed exactly once.

## Verification Strategy

Write failing tests before production changes for:

- ready-loop persisted pause, restore, timestamp reset, and exact-once resume;
- a previously paused ready loop remaining paused after restore;
- non-persisted ready teardown;
- repeated lifecycle events and removal of both listeners on disposal;
- pending bootstrap remaining owned and not starting a loop while persisted-suspended;
- pending successful loading producing a usable application after persisted `pageshow`;
- pending final teardown disposing eventual assets;
- pending final teardown immediately removing listeners;
- pending late rejection producing no overlay report;
- repeated pending transitions and final teardown remaining idempotent.

After focused tests pass, audit the original Endless City implementation plan and check only its actually completed boxes. Run the full typecheck, test, build, generated-output diff, and production smoke gates before committing the implementation.
