import { describe, expect, it } from 'vitest'
import { logicalCamera, logicalToRender, recenterFrame, type RenderFrame } from '../src/city/origin'
import { desiredTileWindow } from '../src/city/tile-window'

describe('render origins', () => {
  it('converts logical points into render-local coordinates', () => {
    expect(logicalToRender({ x: 731, z: -421 }, { x: 720, z: -420 })).toEqual({ x: 11, z: -1 })
  })

  it('recenters beyond the threshold in exact block multiples', () => {
    const frame: RenderFrame = {
      localCamera: { x: 131, z: -121 },
      localTarget: { x: 120, z: -110 },
      origin: { x: 600, z: -300 },
    }
    const logicalBefore = logicalCamera(frame)

    const recentered = recenterFrame(frame)

    expect(recentered).toEqual({
      localCamera: { x: 11, z: -1 },
      localTarget: { x: 0, z: 10 },
      origin: { x: 720, z: -420 },
    })
    expect(logicalCamera(recentered)).toEqual(logicalBefore)
  })

  it('does not alter axes at or inside the threshold', () => {
    const frame: RenderFrame = {
      localCamera: { x: 120, z: -120 },
      localTarget: { x: 3, z: 4 },
      origin: { x: 600, z: -300 },
    }

    expect(recenterFrame(frame)).toEqual(frame)
  })

  it('keeps repeated travel bounded without changing logical movement or tile-window size', () => {
    let frame: RenderFrame = {
      localCamera: { x: 0, z: 0 },
      localTarget: { x: 0, z: 0 },
      origin: { x: 0, z: 0 },
    }

    for (let movement = 1; movement <= 2_000; movement += 1) {
      frame = recenterFrame({
        localCamera: { x: frame.localCamera.x + 17, z: frame.localCamera.z },
        localTarget: { x: frame.localTarget.x + 17, z: frame.localTarget.z },
        origin: frame.origin,
      })

      expect(Math.abs(frame.localCamera.x)).toBeLessThanOrEqual(120)
      expect(logicalCamera(frame).x).toBe(movement * 17)
    }

    expect(desiredTileWindow({ x: 12, z: -8 }, 9)).toHaveLength(81)
  })
})
