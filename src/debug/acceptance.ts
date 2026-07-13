import type { GridCoordinate, QuarterTurn, WorldPoint } from '../city/types'
import type { BuildingId } from '../city/types'
import type { Direction } from '../traffic/types'
import { BLOCK_SIZE } from '../config'

export interface AcceptanceBuildingAssignment {
  readonly coordinate: GridCoordinate
  readonly buildingId: BuildingId
  readonly rotation: QuarterTurn
}

export interface AcceptanceSnapshot {
  readonly logicalCamera: WorldPoint
  readonly renderOrigin: WorldPoint
  readonly localCamera: WorldPoint
  readonly buildingPoolSize: number
  readonly visibleAssignments: readonly AcceptanceBuildingAssignment[]
  readonly vehicleSlotCount: number
  readonly activeVehicleCount: number
  readonly activeDirections: readonly Direction[]
}

export interface AcceptanceConfiguration {
  readonly debug: boolean
  readonly initialLogicalCamera?: WorldPoint
}

export function parseAcceptanceConfiguration(search: string): AcceptanceConfiguration {
  const parameters = new URLSearchParams(search)
  const debug = parameters.get('debug') === '1'
  if (!debug) return { debug: false }

  const rawX = parameters.get('acceptanceX')
  const rawZ = parameters.get('acceptanceZ')
  if (rawX === null || rawZ === null) return { debug: true }

  const x = Number(rawX)
  const z = Number(rawZ)
  if (
    !Number.isFinite(x)
    || !Number.isFinite(z)
    || x % BLOCK_SIZE !== 0
    || z % BLOCK_SIZE !== 0
  ) {
    return { debug: true }
  }

  return { debug: true, initialLogicalCamera: { x, z } }
}

declare global {
  interface Window {
    __ENDLESS_CITY_ACCEPTANCE__?: () => AcceptanceSnapshot
  }
}

const freezePoint = (point: WorldPoint): WorldPoint => Object.freeze({ ...point })

export function freezeAcceptanceSnapshot(snapshot: AcceptanceSnapshot): AcceptanceSnapshot {
  const visibleAssignments = Object.freeze(snapshot.visibleAssignments.map((assignment) =>
    Object.freeze({
      ...assignment,
      coordinate: Object.freeze({ ...assignment.coordinate }),
    }),
  ))

  return Object.freeze({
    ...snapshot,
    logicalCamera: freezePoint(snapshot.logicalCamera),
    renderOrigin: freezePoint(snapshot.renderOrigin),
    localCamera: freezePoint(snapshot.localCamera),
    visibleAssignments,
    activeDirections: Object.freeze([...snapshot.activeDirections]),
  })
}

export function installAcceptanceHook(
  enabled: boolean,
  snapshot: () => AcceptanceSnapshot,
): () => void {
  if (!enabled) return () => undefined

  const hook = (): AcceptanceSnapshot => freezeAcceptanceSnapshot(snapshot())
  const publishSnapshot = (): void => {
    document.documentElement.dataset.endlessCityAcceptance = JSON.stringify(hook())
  }
  const bridge = document.createElement('button')
  bridge.type = 'button'
  bridge.tabIndex = -1
  bridge.setAttribute('aria-hidden', 'true')
  bridge.setAttribute('data-testid', 'acceptance-snapshot')
  bridge.style.cssText = 'position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;z-index:2147483647'
  bridge.addEventListener('click', publishSnapshot)
  window.__ENDLESS_CITY_ACCEPTANCE__ = hook
  document.body.append(bridge)

  return () => {
    bridge.removeEventListener('click', publishSnapshot)
    bridge.remove()
    if (window.__ENDLESS_CITY_ACCEPTANCE__ === hook) {
      delete window.__ENDLESS_CITY_ACCEPTANCE__
      delete document.documentElement.dataset.endlessCityAcceptance
    }
  }
}
