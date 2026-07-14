import {
  laneProgressAtPoint,
  nextIntersection,
  positionOnLane,
} from './lanes'
import type {
  Direction,
  Lane,
  Maneuver,
  PlannedMovement,
  VehiclePose,
  VehicleState,
} from './types'

const CURVE_SEGMENTS = 64
const INTERSECTION_APPROACH_DISTANCE = 10
const RIGHT_TURN_HANDLE_SCALE = 0.25
const FULL_TURN = Math.PI * 2

const TRANSITIONS: Readonly<Record<Direction, Readonly<Record<Maneuver, Direction>>>> = {
  east: { straight: 'east', left: 'north', right: 'south' },
  west: { straight: 'west', left: 'south', right: 'north' },
  north: { straight: 'north', left: 'west', right: 'east' },
  south: { straight: 'south', left: 'east', right: 'west' },
}

interface DirectionVector {
  readonly x: number
  readonly z: number
}

const vectorForDirection = (direction: Direction): DirectionVector => {
  switch (direction) {
    case 'east': return { x: 1, z: 0 }
    case 'west': return { x: -1, z: 0 }
    case 'north': return { x: 0, z: 1 }
    case 'south': return { x: 0, z: -1 }
  }
}

export const headingForDirection = (direction: Direction): number => {
  switch (direction) {
    case 'east': return 0
    case 'west': return Math.PI
    case 'north': return Math.PI / 2
    case 'south': return -Math.PI / 2
  }
}

export const outgoingDirection = (
  incoming: Direction,
  maneuver: Maneuver,
): Direction => TRANSITIONS[incoming][maneuver]

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI
}

const outgoingLaneAt = (
  direction: Direction,
  xIndex: number,
  zIndex: number,
): Lane => ({
  direction,
  line: direction === 'east' || direction === 'west' ? zIndex : xIndex,
})

const cubicCoordinate = (
  start: number,
  firstControl: number,
  secondControl: number,
  end: number,
  parameter: number,
): number => {
  const inverse = 1 - parameter
  return inverse ** 3 * start
    + 3 * inverse ** 2 * parameter * firstControl
    + 3 * inverse * parameter ** 2 * secondControl
    + parameter ** 3 * end
}

const cubicDerivative = (
  start: number,
  firstControl: number,
  secondControl: number,
  end: number,
  parameter: number,
): number => {
  const inverse = 1 - parameter
  return 3 * inverse ** 2 * (firstControl - start)
    + 6 * inverse * parameter * (secondControl - firstControl)
    + 3 * parameter ** 2 * (end - secondControl)
}

export function planMovement(
  incomingLane: Lane,
  progress: number,
  maneuver: Maneuver,
  intersectionHalfExtent: number,
): PlannedMovement {
  void intersectionHalfExtent
  const intersection = nextIntersection(incomingLane, progress)
  const direction = outgoingDirection(incomingLane.direction, maneuver)
  const [xIndexText, zIndexText] = intersection.key.split(':')
  const xIndex = Number(xIndexText)
  const zIndex = Number(zIndexText)
  const resolvedOutgoingLane = outgoingLaneAt(direction, xIndex, zIndex)
  const entryProgress = intersection.progress - INTERSECTION_APPROACH_DISTANCE
  const outgoingIntersectionProgress = laneProgressAtPoint(
    resolvedOutgoingLane,
    intersection.point,
  )
  const exitProgress = outgoingIntersectionProgress + INTERSECTION_APPROACH_DISTANCE
  const startPoint = positionOnLane(incomingLane, entryProgress)
  const endPoint = positionOnLane(resolvedOutgoingLane, exitProgress)
  const samples: VehiclePose[] = []

  if (maneuver === 'straight') {
    const heading = headingForDirection(incomingLane.direction)
    samples.push(
      { ...startPoint, heading },
      { ...endPoint, heading },
    )
  } else {
    const incomingVector = vectorForDirection(incomingLane.direction)
    const outgoingVector = vectorForDirection(direction)
    const chordLength = Math.hypot(endPoint.x - startPoint.x, endPoint.z - startPoint.z)
    const handleLength = chordLength / 2
    const incomingLaneOffset = RIGHT_TURN_HANDLE_SCALE * Math.abs(incomingVector.x === 0
      ? startPoint.x - intersection.point.x
      : startPoint.z - intersection.point.z)
    const outgoingLaneOffset = RIGHT_TURN_HANDLE_SCALE * Math.abs(outgoingVector.x === 0
      ? endPoint.x - intersection.point.x
      : endPoint.z - intersection.point.z)
    const firstControl = maneuver === 'right'
      ? {
          x: startPoint.x + incomingVector.x * incomingLaneOffset,
          z: startPoint.z + incomingVector.z * incomingLaneOffset,
        }
      : {
          x: startPoint.x + incomingVector.x * handleLength,
          z: startPoint.z + incomingVector.z * handleLength,
        }
    const secondControl = maneuver === 'right'
      ? {
          x: endPoint.x - outgoingVector.x * outgoingLaneOffset,
          z: endPoint.z - outgoingVector.z * outgoingLaneOffset,
        }
      : {
          x: endPoint.x - outgoingVector.x * handleLength,
          z: endPoint.z - outgoingVector.z * handleLength,
        }

    for (let index = 0; index <= CURVE_SEGMENTS; index += 1) {
      const parameter = index / CURVE_SEGMENTS
      const x = cubicCoordinate(
        startPoint.x,
        firstControl.x,
        secondControl.x,
        endPoint.x,
        parameter,
      )
      const z = cubicCoordinate(
        startPoint.z,
        firstControl.z,
        secondControl.z,
        endPoint.z,
        parameter,
      )
      const tangentX = cubicDerivative(
        startPoint.x,
        firstControl.x,
        secondControl.x,
        endPoint.x,
        parameter,
      )
      const tangentZ = cubicDerivative(
        startPoint.z,
        firstControl.z,
        secondControl.z,
        endPoint.z,
        parameter,
      )
      samples.push({ x, z, heading: Math.atan2(tangentZ, tangentX) })
    }
  }

  const sampleDistances: number[] = [0]
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!
    const current = samples[index]!
    sampleDistances.push(
      sampleDistances[index - 1]!
        + Math.hypot(current.x - previous.x, current.z - previous.z),
    )
  }
  const length = sampleDistances[sampleDistances.length - 1] ?? 0

  return {
    key: `${intersection.key}:${incomingLane.direction}:${maneuver}`,
    intersectionKey: intersection.key,
    xIndex,
    zIndex,
    maneuver,
    incomingLane,
    outgoingLane: resolvedOutgoingLane,
    entryProgress,
    exitProgress,
    length,
    samples,
    sampleDistances,
  }
}

export function movementPoseAt(movement: PlannedMovement, distance: number): VehiclePose {
  const first = movement.samples[0]
  const last = movement.samples[movement.samples.length - 1]
  if (first === undefined || last === undefined) {
    throw new Error(`Movement ${movement.key} has no pose samples`)
  }

  const clampedDistance = Math.min(movement.length, Math.max(0, distance))
  if (clampedDistance === 0 || movement.samples.length === 1) return first
  if (clampedDistance === movement.length) return last

  let lower = 0
  let upper = movement.sampleDistances.length - 1
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (movement.sampleDistances[middle]! <= clampedDistance) lower = middle
    else upper = middle
  }

  const from = movement.samples[lower]!
  const to = movement.samples[upper]!
  const fromDistance = movement.sampleDistances[lower]!
  const toDistance = movement.sampleDistances[upper]!
  const span = toDistance - fromDistance
  const alpha = span === 0 ? 0 : (clampedDistance - fromDistance) / span

  return {
    x: from.x + (to.x - from.x) * alpha,
    z: from.z + (to.z - from.z) * alpha,
    heading: from.heading + shortestAngleDelta(from.heading, to.heading) * alpha,
  }
}

export function poseForVehicle(vehicle: VehicleState): VehiclePose {
  if (vehicle.turn !== null) {
    return movementPoseAt(vehicle.turn.movement, vehicle.turn.distance)
  }

  return {
    ...positionOnLane(vehicle.lane, vehicle.progress),
    heading: headingForDirection(vehicle.lane.direction),
  }
}
