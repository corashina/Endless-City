import * as THREE from 'three'
import { chooseTile } from '../city/layout'
import { desiredTileWindow } from '../city/tile-window'
import {
  coordinateKey,
  type BuildingId,
  type GridCoordinate,
  type QuarterTurn,
  type WorldPoint,
} from '../city/types'
import { BLOCK_SIZE, WORLD_SEED } from '../config'
import type { AssetCatalog } from './assets'
import type { QualityProfile } from './quality'
import type { AcceptanceBuildingAssignment } from '../debug/acceptance'

export interface TileAssignmentPlan {
  readonly retainedKeys: string[]
  readonly releasedKeys: string[]
  readonly requested: GridCoordinate[]
}

export function planTileAssignments(
  currentAssignments: ReadonlyMap<string, unknown>,
  center: GridCoordinate,
  diameter: number,
): TileAssignmentPlan {
  const desiredByKey = new Map(
    desiredTileWindow(center, diameter).map((coordinate) => [coordinateKey(coordinate), coordinate]),
  )
  const retainedKeys = [...currentAssignments.keys()]
    .filter((key) => desiredByKey.has(key))
    .sort()
  const releasedKeys = [...currentAssignments.keys()]
    .filter((key) => !desiredByKey.has(key))
    .sort()
  const requested = [...desiredByKey.entries()]
    .filter(([key]) => !currentAssignments.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, coordinate]) => coordinate)

  return { retainedKeys, releasedKeys, requested }
}

interface PlotTransform {
  readonly angle: number
  readonly xOffset: number
  readonly zOffset: number
}

interface BuildingSlot {
  readonly group: THREE.Group
  coordinate?: GridCoordinate
  buildingId?: BuildingId
}

const PLOT_TRANSFORMS: Readonly<Record<QuarterTurn, PlotTransform>> = Object.freeze({
  0: { angle: 0, xOffset: 0, zOffset: 0 },
  1: { angle: Math.PI / 2, xOffset: 0, zOffset: 20 },
  2: { angle: Math.PI, xOffset: 20, zOffset: 20 },
  3: { angle: -Math.PI / 2, xOffset: 20, zOffset: 0 },
})

export class CityView {
  readonly root = new THREE.Group()

  private readonly assignments = new Map<string, BuildingSlot>()
  private readonly slots: BuildingSlot[]

  constructor(
    scene: THREE.Scene,
    private readonly assets: AssetCatalog,
    private readonly profile: QualityProfile,
    private readonly seed = WORLD_SEED,
  ) {
    assets.road.position.set(BLOCK_SIZE, 0, 0)
    scene.add(assets.road)

    this.root.name = 'building-pool'
    this.slots = Array.from(
      { length: profile.tileDiameter * profile.tileDiameter },
      (_, index) => {
        const group = new THREE.Group()
        group.name = `building-slot-${index}`
        this.root.add(group)
        return { group }
      },
    )
    scene.add(this.root)
  }

  update(centerCell: GridCoordinate, origin: WorldPoint): void {
    const plan = planTileAssignments(this.assignments, centerCell, this.profile.tileDiameter)
    const available: BuildingSlot[] = []

    for (const key of plan.releasedKeys) {
      const slot = this.assignments.get(key)
      if (slot !== undefined) available.push(slot)
      this.assignments.delete(key)
    }
    for (const slot of this.slots) {
      if (slot.coordinate === undefined) available.push(slot)
    }

    plan.requested.forEach((coordinate, index) => {
      const slot = available[index]
      if (slot === undefined) throw new Error('Building pool exhausted')
      slot.coordinate = coordinate
      slot.group.userData.coordinate = coordinate
      this.setBuilding(slot, chooseTile(coordinate, this.seed).building)
      this.assignments.set(coordinateKey(coordinate), slot)
    })

    for (const slot of this.assignments.values()) this.placeSlot(slot, origin)
  }

  acceptanceSnapshot(): {
    readonly poolSize: number
    readonly visibleAssignments: readonly AcceptanceBuildingAssignment[]
  } {
    const visibleAssignments = [...this.assignments.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, slot]) => {
        const coordinate = slot.coordinate
        const buildingId = slot.buildingId
        if (coordinate === undefined || buildingId === undefined) {
          throw new Error('Incomplete building assignment')
        }
        return {
          coordinate: { ...coordinate },
          buildingId,
          rotation: chooseTile(coordinate, this.seed).rotation,
        }
      })

    return { poolSize: this.slots.length, visibleAssignments }
  }

  private setBuilding(slot: BuildingSlot, buildingId: BuildingId): void {
    if (slot.buildingId === buildingId) return

    slot.group.clear()
    const clone = this.assets.cloneBuilding(buildingId)
    if (clone !== null) slot.group.add(clone)
    slot.buildingId = buildingId
  }

  private placeSlot(slot: BuildingSlot, origin: WorldPoint): void {
    const coordinate = slot.coordinate
    if (coordinate === undefined) return

    const { rotation } = chooseTile(coordinate, this.seed)
    const transform = PLOT_TRANSFORMS[rotation]
    slot.group.rotation.y = transform.angle
    slot.group.position.set(
      coordinate.x * BLOCK_SIZE - origin.x + transform.xOffset,
      0,
      coordinate.z * BLOCK_SIZE - origin.z + transform.zOffset,
    )
  }
}
