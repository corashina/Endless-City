import { laneKey, positionOnLane } from './lanes'
import { headingForDirection, movementPoseAt, poseForVehicle } from './routing'
import type { PlannedMovement, TrafficConfig, VehiclePose, VehicleState } from './types'

interface LeaderState {
  readonly routePosition: number
  readonly length: number
  readonly speed: number
  readonly vehicle?: VehicleState
}

export interface IncomingLaneLeader {
  readonly vehicle: VehicleState
  readonly progress: number
}

interface RouteState {
  readonly movement: PlannedMovement
  readonly position: number
}

export interface FixedStepResult {
  readonly steps: number
  readonly alpha: number
  readonly accumulator: number
}

const routeStateFor = (vehicle: VehicleState): RouteState | undefined => {
  const movement = vehicle.turn?.movement ?? vehicle.plannedMovement
  if (movement === null) return undefined

  return {
    movement,
    position: vehicle.turn?.distance ?? vehicle.progress - movement.entryProgress,
  }
}

const sameLane = (
  left: VehicleState['lane'],
  right: VehicleState['lane'],
): boolean => laneKey(left) === laneKey(right)

const incomingApproachProgress = (vehicle: VehicleState): number | undefined => {
  if (vehicle.turn === null) return vehicle.progress
  if (vehicle.turn.distance - vehicle.length / 2 > 0) return undefined
  return vehicle.turn.movement.entryProgress + vehicle.turn.distance
}

export const incomingLaneLeaderLookup = (
  vehicles: readonly VehicleState[],
): ReadonlyMap<number, IncomingLaneLeader> => {
  const vehiclesByIncomingLane = new Map<
    string,
    { readonly vehicle: VehicleState, readonly progress: number }[]
  >()

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue
    const progress = incomingApproachProgress(vehicle)
    if (progress === undefined) continue
    const incomingLane = vehicle.turn?.movement.incomingLane ?? vehicle.lane
    const key = laneKey(incomingLane)
    const laneVehicles = vehiclesByIncomingLane.get(key)
    const entry = { vehicle, progress }
    if (laneVehicles === undefined) vehiclesByIncomingLane.set(key, [entry])
    else laneVehicles.push(entry)
  }

  const leaders = new Map<number, IncomingLaneLeader>()
  for (const laneVehicles of vehiclesByIncomingLane.values()) {
    laneVehicles.sort((left, right) => left.progress - right.progress
      || left.vehicle.id - right.vehicle.id)
    for (let index = 0; index + 1 < laneVehicles.length; index += 1) {
      const follower = laneVehicles[index]!
      const leader = laneVehicles[index + 1]!
      leaders.set(follower.vehicle.id, {
        vehicle: leader.vehicle,
        progress: leader.progress,
      })
    }
  }
  return leaders
}

const projectOnMovement = (
  vehicle: VehicleState,
  movement: PlannedMovement,
): number | undefined => {
  if (vehicle.turn?.movement.key === movement.key) return vehicle.turn.distance
  if (vehicle.plannedMovement?.key === movement.key) {
    return vehicle.progress - movement.entryProgress
  }
  if (vehicle.turn !== null) return undefined

  if (sameLane(vehicle.lane, movement.outgoingLane)) {
    return movement.length + vehicle.progress - movement.exitProgress
  }
  if (sameLane(vehicle.lane, movement.incomingLane)) {
    return vehicle.progress - movement.entryProgress
  }
  return undefined
}

const routePoseAt = (movement: PlannedMovement, routePosition: number): VehiclePose => {
  if (routePosition < 0) {
    return {
      ...positionOnLane(movement.incomingLane, movement.entryProgress + routePosition),
      heading: headingForDirection(movement.incomingLane.direction),
    }
  }
  if (routePosition <= movement.length) return movementPoseAt(movement, routePosition)
  return {
    ...positionOnLane(
      movement.outgoingLane,
      movement.exitProgress + routePosition - movement.length,
    ),
    heading: headingForDirection(movement.outgoingLane.direction),
  }
}

const nearestOutgoingVehicle = (
  vehicle: VehicleState,
  movement: PlannedMovement,
  routePosition: number,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleState[]>,
): VehicleState | undefined => {
  const outgoing = vehiclesByLane.get(laneKey(movement.outgoingLane)) ?? []
  const distinctOutgoingLane = !sameLane(movement.incomingLane, movement.outgoingLane)
  return outgoing.find((candidate) =>
    candidate.id !== vehicle.id
    && (!distinctOutgoingLane || candidate.progress >= movement.exitProgress)
    && movement.length + candidate.progress - movement.exitProgress >= routePosition)
}

const nearestLeader = (
  vehicle: VehicleState,
  laneLeaderById: ReadonlyMap<number, IncomingLaneLeader>,
  movementLeaderById: ReadonlyMap<number, VehicleState>,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleState[]>,
  stopProgressByVehicle: ReadonlyMap<number, number> | undefined,
): LeaderState | undefined => {
  const route = routeStateFor(vehicle)
  const candidates: LeaderState[] = []
  const seenVehicleIds = new Set<number>()

  const addVehicle = (
    candidate: VehicleState | undefined,
    explicitRoutePosition?: number,
  ): void => {
    if (candidate === undefined || seenVehicleIds.has(candidate.id)) return
    const routePosition = explicitRoutePosition ?? (route === undefined
      ? candidate.progress
      : projectOnMovement(candidate, route.movement))
    const currentPosition = route?.position ?? vehicle.progress
    if (routePosition === undefined || routePosition < currentPosition) return

    seenVehicleIds.add(candidate.id)
    candidates.push({
      routePosition,
      length: candidate.length,
      speed: candidate.speed,
      vehicle: candidate,
    })
  }

  const incomingLeader = laneLeaderById.get(vehicle.id)
  if (vehicle.turn === null && incomingLeader !== undefined) {
    addVehicle(
      incomingLeader.vehicle,
      route === undefined
        ? incomingLeader.progress
        : incomingLeader.progress - route.movement.entryProgress,
    )
  }
  if (route !== undefined) {
    addVehicle(movementLeaderById.get(vehicle.id))
    addVehicle(nearestOutgoingVehicle(
      vehicle,
      route.movement,
      route.position,
      vehiclesByLane,
    ))
  }

  const stopProgress = stopProgressByVehicle?.get(vehicle.id)
  if (stopProgress !== undefined) {
    candidates.push({
      routePosition: route === undefined
        ? stopProgress
        : stopProgress - route.movement.entryProgress,
      length: 0,
      speed: 0,
    })
  }

  const currentPosition = route?.position ?? vehicle.progress
  return candidates.reduce<LeaderState | undefined>((nearest, candidate) => {
    const candidateDistance = candidate.routePosition - currentPosition
    const nearestDistance = nearest === undefined
      ? Number.POSITIVE_INFINITY
      : nearest.routePosition - currentPosition
    return candidateDistance < nearestDistance ? candidate : nearest
  }, undefined)
}

const nextSpeed = (
  vehicle: VehicleState,
  leader: LeaderState | undefined,
  routePosition: number,
  deltaSeconds: number,
  config: TrafficConfig,
): number => {
  const gap = leader === undefined
    ? Number.POSITIVE_INFINITY
    : leader.routePosition - routePosition - (leader.length + vehicle.length) / 2
  const desiredGap = vehicle.traits.minimumGap + vehicle.speed * vehicle.traits.timeHeadway
  const leaderSpeed = leader?.speed ?? vehicle.speed
  const closingSpeed = Math.max(0, vehicle.speed - leaderSpeed)
  const availableGap = Math.max(0, gap - vehicle.traits.minimumGap)
  const requiredDeceleration = closingSpeed === 0
    ? 0
    : closingSpeed * closingSpeed / (2 * Math.max(availableGap, Number.EPSILON))
  const braking = requiredDeceleration > vehicle.traits.comfortableBraking
    ? Math.max(vehicle.traits.emergencyBraking, config.emergencyBrakingFloor)
    : vehicle.traits.comfortableBraking

  if (gap < desiredGap || requiredDeceleration > vehicle.traits.comfortableBraking) {
    return Math.max(0, vehicle.speed - braking * deltaSeconds)
  }
  if (vehicle.speed > vehicle.traits.cruiseSpeed) {
    return Math.max(
      vehicle.traits.cruiseSpeed,
      vehicle.speed - vehicle.traits.comfortableBraking * deltaSeconds,
    )
  }
  return Math.min(
    vehicle.traits.cruiseSpeed,
    vehicle.speed + vehicle.traits.maximumAcceleration * deltaSeconds,
  )
}

const clampToPhysicalSeparation = (
  vehicle: VehicleState,
  movement: PlannedMovement,
  currentPosition: number,
  proposedPosition: number,
  leader: VehicleState,
): number => {
  const leaderPose = poseForVehicle(leader)
  const minimumDistance = (vehicle.length + leader.length) / 2
  const isSeparated = (routePosition: number): boolean => {
    const pose = routePoseAt(movement, routePosition)
    return Math.hypot(leaderPose.x - pose.x, leaderPose.z - pose.z) >= minimumDistance
  }

  if (isSeparated(proposedPosition)) return proposedPosition
  if (!isSeparated(currentPosition)) return currentPosition

  let separated = currentPosition
  let overlapping = proposedPosition
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (separated + overlapping) / 2
    if (isSeparated(midpoint)) separated = midpoint
    else overlapping = midpoint
  }
  return separated
}

const advanceVehicle = (
  vehicle: VehicleState,
  speed: number,
  deltaSeconds: number,
  leader: LeaderState | undefined,
): void => {
  const route = routeStateFor(vehicle)

  if (route === undefined) {
    const proposedProgress = vehicle.progress + speed * deltaSeconds
    const maximumProgress = leader === undefined
      ? Number.POSITIVE_INFINITY
      : leader.vehicle?.turn === null && sameLane(vehicle.lane, leader.vehicle.lane)
        ? leader.vehicle.progress - (leader.vehicle.length + vehicle.length) / 2
        : leader.routePosition - (leader.length + vehicle.length) / 2
    vehicle.progress = Math.max(vehicle.progress, Math.min(proposedProgress, maximumProgress))
    return
  }

  const { movement } = route
  if (
    vehicle.turn === null
    && vehicle.ownedZoneKeys.length === 0
    && route.position >= -vehicle.length / 2
  ) return

  let proposedPosition = route.position + speed * deltaSeconds
  if (vehicle.turn === null && vehicle.ownedZoneKeys.length === 0) {
    proposedPosition = Math.max(
      route.position,
      Math.min(proposedPosition, -vehicle.length / 2),
    )
  }
  if (leader !== undefined) {
    proposedPosition = Math.max(
      route.position,
      Math.min(
        proposedPosition,
        leader.routePosition - (leader.length + vehicle.length) / 2,
      ),
    )
    if (leader.vehicle !== undefined) {
      proposedPosition = clampToPhysicalSeparation(
        vehicle,
        movement,
        route.position,
        proposedPosition,
        leader.vehicle,
      )
    }
  }

  if (
    vehicle.ownedZoneKeys.length > 0
    && proposedPosition + vehicle.length / 2 >= 0
  ) {
    if (!vehicle.movementEntered) vehicle.requestAgeSteps = 0
    vehicle.movementEntered = true
  }

  if (proposedPosition < 0) {
    vehicle.lane = movement.incomingLane
    vehicle.progress = movement.entryProgress + proposedPosition
    vehicle.turn = null
    return
  }
  if (proposedPosition < movement.length) {
    vehicle.lane = movement.incomingLane
    vehicle.progress = movement.entryProgress
    vehicle.turn = { movement, distance: proposedPosition }
    return
  }

  vehicle.lane = movement.outgoingLane
  vehicle.progress = movement.exitProgress + proposedPosition - movement.length
  vehicle.turn = null
  vehicle.plannedMovement = null
  vehicle.clearingMovement = movement
  vehicle.routeDecisionIndex += 1
}

export const stepFollowing = (
  vehicles: readonly VehicleState[],
  deltaSeconds: number,
  config: TrafficConfig,
  stopProgressByVehicle?: ReadonlyMap<number, number>,
): void => {
  const vehiclesByLane = new Map<string, VehicleState[]>()
  const vehiclesByMovement = new Map<string, VehicleState[]>()

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue

    if (vehicle.turn === null) {
      const key = laneKey(vehicle.lane)
      const laneVehicles = vehiclesByLane.get(key)
      if (laneVehicles === undefined) vehiclesByLane.set(key, [vehicle])
      else laneVehicles.push(vehicle)
    }

    const route = routeStateFor(vehicle)
    if (route !== undefined) {
      const movementVehicles = vehiclesByMovement.get(route.movement.key)
      if (movementVehicles === undefined) vehiclesByMovement.set(route.movement.key, [vehicle])
      else movementVehicles.push(vehicle)
    }
  }

  for (const laneVehicles of vehiclesByLane.values()) {
    laneVehicles.sort((left, right) => left.progress - right.progress || left.id - right.id)
  }

  const laneLeaderById = incomingLaneLeaderLookup(vehicles)

  const movementLeaderById = new Map<number, VehicleState>()
  for (const movementVehicles of vehiclesByMovement.values()) {
    movementVehicles.sort((left, right) => {
      const leftPosition = routeStateFor(left)?.position ?? Number.NEGATIVE_INFINITY
      const rightPosition = routeStateFor(right)?.position ?? Number.NEGATIVE_INFINITY
      return leftPosition - rightPosition || left.id - right.id
    })
    for (let index = 0; index + 1 < movementVehicles.length; index += 1) {
      movementLeaderById.set(movementVehicles[index]!.id, movementVehicles[index + 1]!)
    }
  }

  const processed = new Set<number>()
  const processVehicle = (vehicle: VehicleState): void => {
    if (processed.has(vehicle.id)) return
    processed.add(vehicle.id)
    const routePosition = routeStateFor(vehicle)?.position ?? vehicle.progress
    const leader = nearestLeader(
      vehicle,
      laneLeaderById,
      movementLeaderById,
      vehiclesByLane,
      stopProgressByVehicle,
    )
    const speed = nextSpeed(vehicle, leader, routePosition, deltaSeconds, config)
    vehicle.speed = speed
    advanceVehicle(vehicle, speed, deltaSeconds, leader)
  }

  for (const key of [...vehiclesByLane.keys()].sort()) {
    const laneVehicles = vehiclesByLane.get(key)!
    for (let index = laneVehicles.length - 1; index >= 0; index -= 1) {
      processVehicle(laneVehicles[index]!)
    }
  }
  for (const key of [...vehiclesByMovement.keys()].sort()) {
    const movementVehicles = vehiclesByMovement.get(key)!
    for (let index = movementVehicles.length - 1; index >= 0; index -= 1) {
      processVehicle(movementVehicles[index]!)
    }
  }
}

export const consumeFixedSteps = (
  accumulator: number,
  frameSeconds: number,
  stepSeconds: number,
  maximumFrameSeconds: number,
  step: () => void,
): FixedStepResult => {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('stepSeconds must be a finite positive number')
  }
  const clampedFrameSeconds = Math.min(Math.max(frameSeconds, 0), maximumFrameSeconds)
  const totalSeconds = accumulator + clampedFrameSeconds
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(totalSeconds / stepSeconds))
  const steps = Math.floor(totalSeconds / stepSeconds + tolerance)

  for (let index = 0; index < steps; index += 1) step()

  const remainder = totalSeconds - steps * stepSeconds
  const nextAccumulator = Math.abs(remainder) <= Number.EPSILON ? 0 : remainder

  return {
    steps,
    alpha: nextAccumulator / stepSeconds,
    accumulator: nextAccumulator,
  }
}
