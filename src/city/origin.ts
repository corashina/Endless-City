import { BLOCK_SIZE } from '../config'
import type { WorldPoint } from './types'

const RECENTER_THRESHOLD = 120

export interface RenderFrame {
  readonly localCamera: WorldPoint
  readonly localTarget: WorldPoint
  readonly origin: WorldPoint
}

export const logicalToRender = (point: WorldPoint, origin: WorldPoint): WorldPoint => ({
  x: point.x - origin.x,
  z: point.z - origin.z,
})

export const logicalCamera = (frame: RenderFrame): WorldPoint => ({
  x: frame.localCamera.x + frame.origin.x,
  z: frame.localCamera.z + frame.origin.z,
})

function axisShift(local: number): number {
  return Math.abs(local) > RECENTER_THRESHOLD
    ? Math.round(local / BLOCK_SIZE) * BLOCK_SIZE
    : 0
}

export function recenterFrame(frame: RenderFrame): RenderFrame {
  const xShift = axisShift(frame.localCamera.x)
  const zShift = axisShift(frame.localCamera.z)

  return {
    localCamera: {
      x: frame.localCamera.x - xShift,
      z: frame.localCamera.z - zShift,
    },
    localTarget: {
      x: frame.localTarget.x - xShift,
      z: frame.localTarget.z - zShift,
    },
    origin: {
      x: frame.origin.x + xShift,
      z: frame.origin.z + zShift,
    },
  }
}
