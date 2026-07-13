// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { startApp, startOwnedLoop } from '../src/app'
import type { SceneContext } from '../src/rendering/scene'

function createLoopHarness(runFrame: (timestamp: number) => void = () => undefined) {
  const windowTarget = new EventTarget()
  const documentTarget = new EventTarget()
  let frameCallback: FrameRequestCallback | undefined
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    frameCallback = callback
    return 17
  })
  const cancelAnimationFrame = vi.fn()
  const onResize = vi.fn()
  const onVisibilityChange = vi.fn()
  const disposeScene = vi.fn()
  const onError = vi.fn()
  const handle = startOwnedLoop({
    windowTarget,
    documentTarget,
    requestAnimationFrame,
    cancelAnimationFrame,
    onResize,
    onVisibilityChange,
    runFrame,
    disposeScene,
    onError,
  })

  return {
    windowTarget,
    documentTarget,
    requestAnimationFrame,
    cancelAnimationFrame,
    onResize,
    onVisibilityChange,
    disposeScene,
    onError,
    handle,
    invokeFrame(timestamp = 0) {
      if (frameCallback === undefined) throw new Error('No frame scheduled')
      frameCallback(timestamp)
    },
  }
}

describe('owned application lifecycle', () => {
  it('cancels the active frame and disposes the scene exactly once', () => {
    const harness = createLoopHarness()

    harness.handle.dispose()
    harness.handle.dispose()

    expect(harness.cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
    expect(harness.disposeScene).toHaveBeenCalledOnce()
  })

  it('removes resize and visibility listeners on disposal', () => {
    const harness = createLoopHarness()

    harness.windowTarget.dispatchEvent(new Event('resize'))
    harness.documentTarget.dispatchEvent(new Event('visibilitychange'))
    harness.handle.dispose()
    harness.windowTarget.dispatchEvent(new Event('resize'))
    harness.documentTarget.dispatchEvent(new Event('visibilitychange'))

    expect(harness.onResize).toHaveBeenCalledOnce()
    expect(harness.onVisibilityChange).toHaveBeenCalledOnce()
  })

  it('uses the same disposal path on page teardown', () => {
    const harness = createLoopHarness()

    harness.windowTarget.dispatchEvent(new Event('pagehide'))

    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
    expect(harness.disposeScene).toHaveBeenCalledOnce()
  })

  it('stops once and reports one error when a frame fails', () => {
    const frameError = new Error('render failed')
    const harness = createLoopHarness(() => {
      throw frameError
    })

    harness.invokeFrame(100)
    harness.handle.dispose()

    expect(harness.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.disposeScene).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledWith(frameError)
  })
})

describe('startApp setup cleanup', () => {
  it('disposes the scene before propagating an asset setup failure', async () => {
    const setupError = new Error('asset setup failed')
    const dispose = vi.fn()
    const context = { dispose } as unknown as SceneContext
    const canvas = document.createElement('canvas')

    await expect(startApp({ canvas }, {
      createScene: () => context,
      loadAssetCatalog: async () => { throw setupError },
    })).rejects.toBe(setupError)

    expect(dispose).toHaveBeenCalledOnce()
  })
})
