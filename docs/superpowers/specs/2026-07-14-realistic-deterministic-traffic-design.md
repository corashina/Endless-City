# Realistic Deterministic Traffic Design

## Summary

Endless City will keep its fixed-step, seeded traffic simulation and bounded render pool. The traffic model will add per-vehicle driving traits, balanced spawning, deterministic route choices, smooth turns, movement-aware intersection control, stronger collision prediction, and long-run density guarantees.

The implementation will extend the current lane model. The regular infinite street grid does not need a general-purpose navigation graph.

## Current failure

A stationary-camera diagnostic ran the current 49-car high-quality simulation for 216,000 fixed steps, equal to one hour. All 49 slots stayed active, but the number of cars inside the 300-unit protected radius fell from 27 to 6 and reached a minimum of 4. Most remaining cars had speed zero in queues outside the fog boundary.

The current reservation system grants one car exclusive ownership of an entire intersection before that car enters it. A holder can stop behind a downstream queue while retaining its reservation. Perpendicular queues then stop, and those queues can block other reservation holders at adjacent intersections. The resulting gridlock spreads through the simulated area. Since stopped off-screen cars remain within the 420-unit simulation radius, recycling never replaces them. Pool length therefore masks the visible traffic collapse.

The current recycler also accepts lanes whose closest point to the camera lies outside the protected radius. Cars on those lanes can complete an off-screen lifecycle without becoming visible.

## Goals

- Preserve deterministic results for a given world seed, camera path, quality profile, and fixed-step sequence.
- Raise pool sizes to 72 cars on high, 48 on balanced, and 28 on mobile.
- Maintain traffic from all four directions without enforcing an exact four-way split.
- Give cars distinct speeds, acceleration, braking, spacing, and route behavior.
- Support straight, left-turn, and right-turn movements at each intersection.
- Prevent rear-end, crossing-path, and merge collisions.
- Prevent reservation deadlocks, intersection blocking, and direction starvation.
- Keep meaningful visible and moving traffic during long stationary and moving camera runs.
- Preserve bounded simulation and rendering costs.

## Non-goals

- Destination-based trip planning across the city.
- Traffic lights, pedestrians, parked cars, lane changes, overtaking, or U-turns.
- Vehicle damage or rigid-body physics.
- New vehicle art or runtime material mutation.

## Deterministic randomness

The simulation will derive each random value from the world seed, vehicle ID, lifecycle number, decision number, and a property-specific salt. Code will not consume a shared mutable random stream. Adding a new randomized property will therefore leave existing property values unchanged.

Each spawn assigns one of three driving profiles:

| Profile | Weight | Cruise speed | Headway | Minimum gap |
| --- | ---: | ---: | ---: | ---: |
| Cautious | 25% | 7.5-10 units/s | 1.4-1.8 s | 3.5-4.5 units |
| Normal | 55% | 9-13 units/s | 1.0-1.5 s | 2.5-4 units |
| Assertive | 20% | 11.5-15 units/s | 0.8-1.2 s | 2-3 units |

The same seeded traits set maximum acceleration from 1.4 to 3 units/s², comfortable braking from 3 to 5.5 units/s², and emergency braking from 7 to 10 units/s². A spawned car starts between 35% and 85% of its cruise speed when the available gap permits that speed.

Route decisions use a base distribution of 55% straight, 22.5% left, and 22.5% right. Driving profiles can move the straight probability by at most 10 percentage points while keeping left and right choices balanced across a long run. The simulation records a route-decision index on each car so each intersection produces a new stable choice.

## Vehicle and route state

`VehicleState` will keep identity, prototype, dimensions, speed, lifecycle state, and driving traits. Route state will identify:

- The current directed lane.
- The next intersection and selected maneuver.
- The current path phase: approach, intersection movement, or departure.
- Distance along the active path and the previous-step distance for interpolation.
- The outgoing lane selected by the maneuver.
- Reservation request age, entry state, and owned conflict-zone keys.
- Off-screen stopped time for defensive recycling.

A route helper will convert lane state and path distance into a world position plus heading. Straight paths retain the current scalar lane mapping. Left and right turns use cubic quarter-turn curves whose endpoints sit on the authored incoming and outgoing lane centerlines. Endpoint tangents match both roads. Cars switch to the outgoing lane after their rear bumper clears the curve.

The infinite grid supplies outgoing lanes through arithmetic on the intersection indices. A turn does not require stored road nodes or a growing route graph.

## Spawning and recycling

The quality profiles will allocate fixed pools of 72, 48, and 28 vehicle slots. Initial spawning and recycling will share collision, lane, and route validation while using placement rules suited to each lifecycle stage.

The spawner will maintain a soft direction target. It will prefer underrepresented directions, then apply a seeded choice among directions within one car of the target. This keeps all four directions present while allowing small count differences.

Candidate lanes must have a closest approach inside the protected radius with enough margin for the vehicle length. Initial candidates will fill safe positions across the protected region and its approach boundary, giving the first rendered frame a representative traffic distribution. Recycled candidates will start outside the protected radius on the approach side of their route, so moving cars enter the visible region before reaching the far recycling boundary. The spawner will vary lane, longitudinal position, model, profile, starting speed, and first maneuver.

Candidate validation will reject:

- Bumper gaps below both cars' required spawn gaps.
- Occupied intersection movement corridors.
- Paths that cannot cross the protected region.
- An outgoing lane without enough receiving space when the candidate begins near an intersection.

Cars recycle after leaving the simulation radius. The simulation will also recycle a car that stays outside the protected radius below 0.25 units/s for 12 seconds. The timeout derives from fixed steps and resets as soon as the car moves or enters the protected region. Recycling never teleports a visible car.

The recycler will try enough deterministic candidates to refill a slot in the same step under ordinary density. A slot that has no safe candidate remains inactive and retries on the next step. Long-run tests will enforce active, visible, and moving counts so inactive retries cannot hide a density regression.

## Following and collision prediction

The simulation will group approach and departure cars by directed lane and order them by distance along that lane. Each follower uses the nearest physical leader on its path.

The desired bumper gap equals the driver's minimum gap plus speed multiplied by personal headway. The car uses comfortable braking when the predicted gap falls below this target. It uses emergency braking when its stopping distance exceeds the available gap after accounting for the leader's speed. A final progress clamp prevents bumper overlap under large closing speeds or unusual fixed-step inputs.

Queued cars selecting the same intersection movement remain ordered on their approach lane. Cars on conflicting corridors rely on conflict-zone ownership. Cars merging onto the same outgoing lane also treat the nearest receiving-lane car as a leader before entering the curve.

## Intersection movements

Each intersection supports 12 directed movements: straight, left, and right from four approaches. A movement maps to a small, fixed set of conflict-zone keys covering its swept corridor. Two movements conflict when their zone sets overlap. Compatible movements can proceed at the same time.

A car can receive all zones for its movement only when:

- No other car owns a required zone.
- The car reaches the request look-ahead distance.
- The outgoing lane contains enough clear space for the car plus its minimum gap.

The allocator grants each movement atomically. It sorts eligible requests by accumulated wait, distance to entry, and vehicle ID. Accumulated wait prevents starvation; vehicle ID resolves exact ties. A request retains its age when it loses and resets after entry or route change.

A granted car has 120 fixed steps, equal to two seconds, to enter its first conflict zone. The allocator releases an unused grant after that deadline and lets the car request again. A car that enters on time retains its zones until its rear bumper clears the last owned zone. The allocator does not expire an occupied movement.

The outgoing-space check prevents a car from stopping across the intersection. This check, short pre-entry grant lifetime, and wait-based priority remove the reservation cycle that causes the current long-run gridlock.

## Rendering

The route helper will expose previous and current position and heading. `TrafficView` will interpolate both values. Heading interpolation will use the shortest angular difference so a turn cannot rotate the model through the long direction.

Each vehicle prototype keeps its authored native direction. The view will rotate the clone by the difference between the native direction and interpolated route heading. A car can therefore keep the same model through several turns. Recycling can select another prototype and replace the pooled clone through the existing slot mechanism.

## Performance bounds

The simulation will avoid all-pairs vehicle checks. It will build lane buckets, intersection request buckets, and receiving-lane lookups once per fixed step. Sorting remains local to each bucket. Conflict-zone sets have constant size, and the number of pooled cars has a profile-specific fixed bound.

The renderer will keep one object slot per vehicle slot. Turns add position and heading arithmetic but create no objects during a normal frame.

## Configuration

`TrafficConfig` will replace global following constants with bounds and intersection rules that the seeded driver traits consume. Production configuration will specify:

- Trait ranges listed in this document.
- Turn weights of 55%, 22.5%, and 22.5% before profile adjustment.
- A 20-unit reservation look-ahead.
- A 120-step unused reservation lifetime.
- A 12-second off-screen stopped timeout.
- The existing 300-unit protected radius and 420-unit simulation radius.

Tests can provide smaller radii and timeouts while exercising the same rules.

## Testing

Unit tests will cover seeded scalar generation, driver profiles, direction balancing, turn selection, lane transitions, turn endpoints, curve tangents, and heading interpolation.

Following tests will cover different driver gaps, closing-speed emergency braking, stopped leaders, receiving-lane leaders, and a hard no-overlap invariant. Intersection tests will enumerate all movement pairs and verify that compatible pairs can enter together while conflicting pairs cannot. They will also cover atomic zone acquisition, blocked exits, grant expiry, occupied-grant retention, stable tie-breaking, and wait-based fairness.

Spawning tests will verify all three pool sizes, direction diversity, trait diversity, starting-speed diversity, minimum gaps, protected-region crossings, safe recycling, and deterministic reproduction.

The long-run stationary-camera regression will run the 72-car profile for 216,000 fixed steps. After a five-minute warm-up, each one-minute sample must contain at least 18 cars inside the protected radius and at least 11 visible cars moving above 0.25 units/s. The test will continue checking finite state, bumper separation, intersection conflicts, active slot recovery, and deterministic equality with a duplicate simulation.

A moving-camera regression will use the existing 36,000-step camera path with the 72-car pool. It will verify bounded distance, active density, visible direction diversity, collision safety, and deterministic equality. Render tests will cover straight interpolation, both turn directions, native model rotation, origin subtraction, recycling, and hidden slots.

The final verification sequence will run the focused traffic tests, the full Vitest suite, TypeScript checking, and the production Vite build.

## Documentation changes

The implementation will update `README.md` and `docs/architecture.md` with the new pool sizes, seeded driver traits, turns, movement conflict zones, density guarantees, and defensive off-screen recycling. `docs/architecture.md` will remove turning vehicles from its out-of-scope list.

## Acceptance criteria

- The same seed and camera path reproduce complete traffic state across repeated runs.
- High, balanced, and mobile profiles allocate 72, 48, and 28 slots.
- Each populated profile contains all four directions and more than one cruise speed.
- Cars complete straight, left, and right movements and align with their outgoing lanes.
- Tests observe no bumper overlap or shared conflicting movement zone.
- A blocked outgoing lane prevents intersection entry.
- Wait-based priority serves persistent requests without direction starvation.
- The stationary long-run test maintains the documented visible and moving thresholds.
- Visible cars never recycle or teleport.
- The full test suite, typecheck, and production build pass.
