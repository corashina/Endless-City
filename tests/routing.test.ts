import { describe, expect, it } from 'vitest'
import { createDriverTraits } from '../src/traffic/random'
import {
  headingForDirection,
  movementPoseAt,
  outgoingDirection,
  planMovement,
  poseForVehicle,
  shortestAngleDelta,
} from '../src/traffic/routing'
import type { Direction, Maneuver, VehicleState } from '../src/traffic/types'

const transitions: readonly [Direction, Maneuver, Direction][] = [
  ['east', 'straight', 'east'], ['east', 'left', 'north'], ['east', 'right', 'south'],
  ['west', 'straight', 'west'], ['west', 'left', 'south'], ['west', 'right', 'north'],
  ['north', 'straight', 'north'], ['north', 'left', 'west'], ['north', 'right', 'east'],
  ['south', 'straight', 'south'], ['south', 'left', 'east'], ['south', 'right', 'west'],
]

describe('intersection routing', () => {
  it.each(transitions)('routes %s %s to %s', (incoming, maneuver, outgoing) => {
    const movement = planMovement({ direction: incoming, line: 0 }, -31, maneuver, 5)
    expect(movement.outgoingLane.direction).toBe(outgoing)
    expect(movement.outgoingLane.line).toBe(0)
  })

  it.each(['left', 'right'] as const)('matches lane endpoints and tangents for an east %s', maneuver => {
    const movement = planMovement({ direction: 'east', line: 0 }, -31, maneuver, 5)
    const start = movementPoseAt(movement, 0)
    const end = movementPoseAt(movement, movement.length)
    expect(start.heading).toBeCloseTo(headingForDirection('east'), 6)
    expect(end.heading).toBeCloseTo(headingForDirection(movement.outgoingLane.direction), 6)
    expect(start.z).toBeCloseTo(-16, 6)
    if (movement.outgoingLane.direction === 'north') expect(end.x).toBeCloseTo(-23, 6)
    else expect(end.x).toBeCloseTo(-16, 6)
  })

  it('produces finite smooth poses across a complete turn', () => {
    const movement = planMovement({ direction: 'north', line: 2 }, 89, 'left', 5)
    const poses = Array.from({ length: 65 }, (_, index) =>
      movementPoseAt(movement, movement.length * index / 64))
    expect(poses.flatMap(pose => [pose.x, pose.z, pose.heading]).every(Number.isFinite)).toBe(true)
    for (let index = 1; index < poses.length; index += 1) {
      const previous = poses[index - 1]!
      const current = poses[index]!
      expect(Math.hypot(current.x - previous.x, current.z - previous.z)).toBeGreaterThan(0)
    }
  })

  it('stores a straight movement as two lane-aligned samples', () => {
    const movement = planMovement({ direction: 'east', line: 0 }, -31, 'straight', 5)

    expect(movement.samples).toHaveLength(2)
    expect(movement.sampleDistances).toEqual([0, movement.length])
    expect(movementPoseAt(movement, -1)).toEqual(movement.samples[0])
    expect(movementPoseAt(movement, movement.length + 1)).toEqual(movement.samples[1])
  })

  it('places movement endpoints ten units from the crossing center', () => {
    const movement = planMovement({ direction: 'east', line: 0 }, -31, 'straight', 3)

    expect(movement.entryProgress).toBe(-30)
    expect(movement.exitProgress).toBe(-10)
    expect(movement.length).toBe(20)
  })

  it('uses the declared transition table through outgoingDirection', () => {
    for (const [incoming, maneuver, outgoing] of transitions) {
      expect(outgoingDirection(incoming, maneuver)).toBe(outgoing)
    }
  })

  it('interpolates headings over the shortest angular delta', () => {
    expect(shortestAngleDelta(Math.PI * 0.75, -Math.PI * 0.75)).toBeCloseTo(Math.PI / 2)
    expect(shortestAngleDelta(-Math.PI * 0.75, Math.PI * 0.75)).toBeCloseTo(-Math.PI / 2)
  })

  it('uses lane pose unless the vehicle is turning', () => {
    const movement = planMovement({ direction: 'east', line: 0 }, -31, 'left', 5)
    const vehicle: VehicleState = {
      id: 1,
      prototypeId: 'car',
      length: 4,
      lane: { direction: 'east', line: 0 },
      nativeDirection: 'east',
      previousProgress: -31,
      progress: -31,
      speed: 0,
      desiredSpeed: 8,
      active: true,
      reservationKey: null,
      lifecycle: 0,
      traits: createDriverTraits(1, 1, 0),
      routeDecisionIndex: 0,
      offscreenStoppedSteps: 0,
      plannedMovement: movement,
      turn: null,
      previousPose: { x: -31, z: -16, heading: headingForDirection('east') },
    }

    expect(poseForVehicle(vehicle)).toEqual(vehicle.previousPose)

    vehicle.turn = { movement, distance: movement.length / 2 }
    expect(poseForVehicle(vehicle)).toEqual(movementPoseAt(movement, movement.length / 2))
  })
})
