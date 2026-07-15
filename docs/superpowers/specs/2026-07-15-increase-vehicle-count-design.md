# Increase Vehicle Count Design

## Goal

Increase each quality profile's fixed traffic pool by 50% while preserving the existing profile selection rules and deterministic traffic behavior.

| Profile | Current count | New count |
| --- | ---: | ---: |
| High | 72 | 108 |
| Balanced | 48 | 72 |
| Mobile | 28 | 42 |

## Scope

Update the `trafficCount` values and literal types in `src/rendering/quality.ts`. The application will continue to pass the selected count to `TrafficSimulation` and `TrafficView`, so both systems will allocate matching fixed-size pools.

Keep the viewport and device-pixel-ratio thresholds unchanged. Do not change spawning, routing, vehicle spacing, recycling, model selection, or rendering behavior.

Update the README and architecture guide so their profile tables and traffic descriptions report the new counts. Keep the existing long-run visible and moving traffic floors. Those floors protect against density regressions without turning this capacity change into a traffic-model retuning effort.

## Testing

Change the quality-profile tests before production code so they expect 108, 72, and 42 vehicles. Update the application integration assertion that currently expects 72 high-profile slots. Run the focused tests and confirm that they fail because the old counts remain in production code.

After updating production code, run the focused quality and application tests, the full Vitest suite, TypeScript checking, and the production build. Existing traffic tests must continue to pass with no changes to simulation behavior.

## Acceptance Criteria

- High, balanced, and mobile profiles expose fixed traffic counts of 108, 72, and 42.
- Profile selection thresholds and all other quality settings remain unchanged.
- The application creates matching simulation and render pools from the selected profile.
- Documentation reports the new counts.
- The full test, typecheck, and production build commands pass.
