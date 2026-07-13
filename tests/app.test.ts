// @vitest-environment jsdom

import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { completeOverlayBootstrap, startApp, startOwnedLoop } from '../src/app'
import type { AssetCatalog } from '../src/rendering/assets'
import type { SceneContext } from '../src/rendering/scene'
import type { OverlayController } from '../src/ui/overlay'

function createOverlayHarness() {
  return {
    showLoading: vi.fn(),
    showReady: vi.fn(),
    showError: vi.fn(),
    showContextLost: vi.fn(),
    updateFps: vi.fn(),
    dispose: vi.fn(),
  }
}

function createRunnableCatalog(): AssetCatalog {
  const vehicleMetadata = (['east', 'west', 'north', 'south'] as const).map((direction) => ({
    id: direction,
    direction,
    length: 4,
  }))
  return {
    road: new THREE.Group(),
    buildings: new Map(),
    vehiclePrototypes: [],
    vehicleMetadata,
    vehiclesByDirection: new Map(),
    cloneBuilding: () => null,
    cloneVehicle: () => null,
  }
}

function createRunnableScene() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(10, 100, 10)
  const directionalLight = new THREE.DirectionalLight()
  scene.add(directionalLight, directionalLight.target)
  const dispose = vi.fn()
  const resize = vi.fn()
  return {
    dispose,
    resize,
    context: {
      scene,
      camera,
      directionalLight,
      hemisphereLight: new THREE.HemisphereLight(),
      controls: { target: new THREE.Vector3(), update: vi.fn() },
      renderer: { render: vi.fn() },
      resize,
      dispose,
    } as unknown as SceneContext,
  }
}

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
  const disposeApplication = vi.fn()
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
    disposeApplication,
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
    disposeApplication,
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
    harness.windowTarget.dispatchEvent(new Event('pagehide'))

    expect(harness.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.disposeScene).toHaveBeenCalledOnce()
    expect(harness.disposeApplication).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledWith(frameError)
  })

  it('pauses and resumes rendering without disposing the scene', () => {
    const harness = createLoopHarness()

    harness.handle.pause()
    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
    expect(harness.disposeScene).not.toHaveBeenCalled()

    harness.handle.resume()
    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(2)
    harness.handle.dispose()
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

  it('returns to loading when WebGL is restored before assets are ready', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const dispose = vi.fn()
    const context = { dispose } as unknown as SceneContext
    const setupError = new Error('stop pending setup')
    let rejectAssets: (error: Error) => void = () => undefined

    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => context,
      loadAssetCatalog: (onProgress) => {
        onProgress?.({ loaded: 8, total: 17, url: '/asset.glb' })
        return new Promise((_, reject) => { rejectAssets = reject })
      },
    })

    const lostEvent = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(lostEvent)
    canvas.dispatchEvent(new Event('webglcontextrestored'))

    expect(lostEvent.defaultPrevented).toBe(true)
    expect(overlay.showContextLost).toHaveBeenCalledOnce()
    expect(overlay.showLoading).toHaveBeenLastCalledWith(8, 17)
    expect(overlay.showLoading).toHaveBeenCalledTimes(2)
    expect(overlay.showReady).not.toHaveBeenCalled()

    rejectAssets(setupError)
    await expect(appPromise).rejects.toBe(setupError)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('uses outer application disposal for pagehide exactly once', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 91)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event('resize'))
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))

    expect(requestAnimationFrame).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(91)
    expect(scene.dispose).toHaveBeenCalledOnce()
    expect(scene.resize).not.toHaveBeenCalled()
    expect(overlay.showContextLost).not.toHaveBeenCalled()
    expect(overlay.dispose).toHaveBeenCalledOnce()

    handle.dispose()
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(scene.dispose).toHaveBeenCalledOnce()
    expect(overlay.dispose).toHaveBeenCalledOnce()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })
})

describe('overlay bootstrap recovery', () => {
  it('does not hide restoration status when context is lost during loading', () => {
    const overlay = { showReady: vi.fn() }

    completeOverlayBootstrap(overlay, true)

    expect(overlay.showReady).not.toHaveBeenCalled()
  })

  it('dismisses loading after bootstrap when the context is healthy', () => {
    const overlay = { showReady: vi.fn() }

    completeOverlayBootstrap(overlay, false)

    expect(overlay.showReady).toHaveBeenCalledOnce()
  })
})
