// @vitest-environment jsdom

import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  completeOverlayBootstrap,
  CONTEXT_RESTORE_TIMEOUT_MS,
  startApp,
  startOwnedLoop,
  type StartAppDependencies,
} from '../src/app'
import * as appModule from '../src/app'
import { TOTAL_ASSET_REQUESTS, type AssetCatalog } from '../src/rendering/assets'
import type { SceneContext } from '../src/rendering/scene'
import type { OverlayController } from '../src/ui/overlay'

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as unknown as { __ENDLESS_CITY_ACCEPTANCE__?: unknown })
    .__ENDLESS_CITY_ACCEPTANCE__
})

function createOverlayHarness() {
  return {
    showLoading: vi.fn(),
    showReady: vi.fn(),
    showError: vi.fn(),
    showContextLost: vi.fn(),
    dispose: vi.fn(),
  }
}

function createRunnableCatalog(
  onDispose: () => void = () => undefined,
  cloneBuilding: AssetCatalog['cloneBuilding'] = () => null,
): AssetCatalog {
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
    cloneBuilding,
    cloneVehicle: () => null,
    dispose: vi.fn(onDispose),
  }
}

function createRunnableScene() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(10, 100, 10)
  const directionalLight = new THREE.DirectionalLight()
  directionalLight.position.set(-300, 750, -300)
  directionalLight.shadow.camera.left = -180
  directionalLight.shadow.camera.right = 180
  directionalLight.shadow.camera.top = 180
  directionalLight.shadow.camera.bottom = -180
  directionalLight.shadow.mapSize.set(1024, 1024)
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
      controls: Object.assign(new THREE.EventDispatcher(), {
        target: new THREE.Vector3(),
        update: vi.fn(),
      }),
      renderer: { render: vi.fn() },
      resize,
      dispose,
    } as unknown as SceneContext,
  }
}

function pageTransition(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: persisted })
  return event
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
  const onPageFreeze = vi.fn()
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
    onPageFreeze,
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
    onPageFreeze,
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

    harness.windowTarget.dispatchEvent(pageTransition('pagehide', false))

    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
    expect(harness.disposeScene).toHaveBeenCalledOnce()
  })

  it('pauses for persisted pagehide and resumes exactly once on persisted pageshow', () => {
    const harness = createLoopHarness()

    harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))
    harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))

    expect(harness.cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.cancelAnimationFrame).toHaveBeenCalledWith(17)
    expect(harness.onPageFreeze).toHaveBeenCalledOnce()
    expect(harness.disposeScene).not.toHaveBeenCalled()
    expect(harness.disposeApplication).not.toHaveBeenCalled()

    harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))
    harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))

    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(2)
    expect(harness.disposeScene).not.toHaveBeenCalled()
    harness.handle.dispose()
  })

  it('does not resume a loop that was paused before persisted pagehide', () => {
    const harness = createLoopHarness()

    harness.handle.pause()
    harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))
    harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))

    expect(harness.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.onPageFreeze).toHaveBeenCalledOnce()
    expect(harness.disposeScene).not.toHaveBeenCalled()
    harness.handle.dispose()
  })

  it('removes both page transition listeners when disposed', () => {
    const harness = createLoopHarness()

    harness.handle.dispose()
    harness.windowTarget.dispatchEvent(pageTransition('pagehide', true))
    harness.windowTarget.dispatchEvent(pageTransition('pageshow', true))

    expect(harness.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(harness.onPageFreeze).not.toHaveBeenCalled()
    expect(harness.disposeScene).toHaveBeenCalledOnce()
    expect(harness.disposeApplication).toHaveBeenCalledOnce()
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

  it('updates clouds from camera state and disposes them exactly once', async () => {
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    const cloudLayer = { update: vi.fn(), dispose: vi.fn() }
    const createCloudLayer = vi.fn(() => cloudLayer)
    let frame: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frame = callback
        return 101
      })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const handle = await startApp({ canvas }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
      createCloudLayer,
    })
    frame?.(0)

    expect(createCloudLayer).toHaveBeenCalledWith(scene.context.scene)
    expect(cloudLayer.update).toHaveBeenLastCalledWith(
      { x: 10, z: 10 },
      { x: 0, z: 0 },
      0,
    )

    frame?.(1_000)
    expect(cloudLayer.update).toHaveBeenLastCalledWith(
      { x: 10, z: 10 },
      { x: 0, z: 0 },
      0.1,
    )

    handle.dispose()
    handle.dispose()
    expect(cloudLayer.dispose).toHaveBeenCalledOnce()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })
})

describe('startApp setup cleanup', () => {
  it('keeps production traffic beyond the 300-unit fog boundary before recycling', () => {
    const trafficConfig = (appModule as unknown as {
      TRAFFIC_CONFIG?: {
        emergencyBrakingFloor: number
        reservationLifetimeSteps: number
        movementCorridorHalfWidth: number
        stoppedSpeedThreshold: number
        offscreenStoppedTimeoutSteps: number
        protectedRadius: number
        simulationRadius: number
      }
    }).TRAFFIC_CONFIG

    expect(trafficConfig).toEqual(expect.objectContaining({
      emergencyBrakingFloor: 7,
      reservationLifetimeSteps: 120,
      movementCorridorHalfWidth: 2.25,
      stoppedSpeedThreshold: 0.25,
      offscreenStoppedTimeoutSteps: 720,
      protectedRadius: 300,
      simulationRadius: 420,
    }))
  })

  it('does not expose acceptance state in default mode', async () => {
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 91)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({ canvas }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    expect(window.__ENDLESS_CITY_ACCEPTANCE__).toBeUndefined()
    handle.dispose()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('renders the city without constructing traffic when vehicle metadata is empty', async () => {
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    let frameCallback: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallback = callback
        return 91
      })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const catalog = { ...createRunnableCatalog(), vehicleMetadata: [] }
    const handle = await startApp({ canvas }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => catalog,
    })

    try {
      frameCallback?.(1_000)
      expect(scene.context.scene.getObjectByName('building-pool')).toBeDefined()
      expect(scene.context.scene.getObjectByName('traffic-pool')).toBeUndefined()
      expect(scene.context.renderer.render).toHaveBeenCalledOnce()
    } finally {
      handle.dispose()
    }
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('renders with a texel-aligned directional shadow transform', async () => {
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    const originalOffset = scene.context.directionalLight.position.clone()
      .sub(scene.context.directionalLight.target.position)
    const depthAxis = originalOffset.clone().normalize()
    const horizontalAxis = new THREE.Vector3(0, 1, 0).cross(depthAxis).normalize()
    const verticalAxis = depthAxis.clone().cross(horizontalAxis).normalize()
    const texelSize = 360 / 1024
    let targetAtRender: THREE.Vector3 | undefined
    let lightAtRender: THREE.Vector3 | undefined
    let frameCallback: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallback = callback
        return 91
      })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({ canvas }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })
    const render = vi.mocked(scene.context.renderer.render)
    render.mockImplementation(() => {
      targetAtRender = scene.context.directionalLight.target.position.clone()
      lightAtRender = scene.context.directionalLight.position.clone()
    })

    try {
      scene.context.controls.target.set(12.5, 0, -8.25)
      frameCallback?.(1_000)

      expect(render).toHaveBeenCalledOnce()
      expect(targetAtRender).toBeDefined()
      expect(lightAtRender).toBeDefined()
      const horizontalSteps = targetAtRender!.dot(horizontalAxis) / texelSize
      const verticalSteps = targetAtRender!.dot(verticalAxis) / texelSize
      expect(horizontalSteps).toBeCloseTo(Math.round(horizontalSteps), 10)
      expect(verticalSteps).toBeCloseTo(Math.round(verticalSteps), 10)
      expect(lightAtRender!.clone().sub(targetAtRender!).distanceTo(originalOffset))
        .toBeLessThan(1e-10)
    } finally {
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    }
  })

  it('installs a frozen debug acceptance snapshot at an exact startup coordinate and removes it on dispose', async () => {
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1_280)
    let frameCallback: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallback = callback
        return 91
      })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({
      canvas,
      acceptance: {
        debug: true,
        initialLogicalCamera: { x: 6_000, z: -6_000 },
      },
    } as Parameters<typeof startApp>[0], {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    frameCallback?.(1_000)
    const acceptanceWindow = window as unknown as {
      __ENDLESS_CITY_ACCEPTANCE__?: () => Record<string, unknown>
    }
    const hook = acceptanceWindow.__ENDLESS_CITY_ACCEPTANCE__

    try {
      expect(hook).toBeTypeOf('function')
      const snapshot = hook!() as {
      logicalCamera: { x: number; z: number }
      renderOrigin: { x: number; z: number }
      localCamera: { x: number; z: number }
      buildingPoolSize: number
      visibleAssignments: Array<{
        coordinate: { x: number; z: number }
        buildingId: string
        rotation: number
      }>
      vehicleSlotCount: number
      activeVehicleCount: number
      activeDirections: string[]
      }
      expect(snapshot).toMatchObject({
        logicalCamera: { x: 6_000, z: -6_000 },
        renderOrigin: { x: 6_000, z: -6_000 },
        localCamera: { x: 0, z: 0 },
        buildingPoolSize: 81,
        vehicleSlotCount: 108,
        activeVehicleCount: 108,
        activeDirections: ['east', 'north', 'south', 'west'],
      })
      expect(snapshot.visibleAssignments).toHaveLength(81)
      expect(snapshot.visibleAssignments[0]).toEqual({
        coordinate: expect.objectContaining({ x: expect.any(Number), z: expect.any(Number) }),
        buildingId: expect.any(String),
        rotation: expect.any(Number),
      })
      expect(Object.isFrozen(snapshot)).toBe(true)
      expect(Object.isFrozen(snapshot.visibleAssignments)).toBe(true)
    } finally {
      handle.dispose()
    }
    expect(acceptanceWindow.__ENDLESS_CITY_ACCEPTANCE__).toBeUndefined()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

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

  it('owns pagehide while assets are still loading and disposes eventual assets', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const catalog = createRunnableCatalog()
    let resolveAssets: (catalog: AssetCatalog) => void = () => undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 79)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: () => new Promise((resolve) => { resolveAssets = resolve }),
    })
    const bootstrapPageHideListener = addEventListener.mock.calls
      .find(([type]) => type === 'pagehide')?.[1]
    const bootstrapPageShowListener = addEventListener.mock.calls
      .find(([type]) => type === 'pageshow')?.[1]

    window.dispatchEvent(pageTransition('pagehide', true))
    window.dispatchEvent(pageTransition('pagehide', false))
    expect(removeEventListener).toHaveBeenCalledWith('pagehide', bootstrapPageHideListener)
    expect(removeEventListener).toHaveBeenCalledWith('pageshow', bootstrapPageShowListener)
    resolveAssets(catalog)
    await Promise.resolve()
    await Promise.resolve()
    expect(catalog.dispose).toHaveBeenCalledOnce()
    const handle = await appPromise
    try {
      expect(scene.dispose).toHaveBeenCalledOnce()
      expect(catalog.dispose).toHaveBeenCalledOnce()
      expect(overlay.dispose).toHaveBeenCalledOnce()
      expect(requestAnimationFrame).not.toHaveBeenCalled()
    } finally {
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
      addEventListener.mockRestore()
      removeEventListener.mockRestore()
    }
  })

  it('preserves pending bootstrap across BFCache and starts after pageshow', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const catalog = createRunnableCatalog()
    let resolveAssets: (catalog: AssetCatalog) => void = () => undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 93)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: () => new Promise((resolve) => { resolveAssets = resolve }),
    })
    let settled = false
    void appPromise.then(() => { settled = true })

    window.dispatchEvent(pageTransition('pagehide', true))
    window.dispatchEvent(pageTransition('pagehide', true))
    resolveAssets(catalog)
    await Promise.resolve()
    await Promise.resolve()

    expect(settled).toBe(false)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(scene.dispose).not.toHaveBeenCalled()
    expect(catalog.dispose).not.toHaveBeenCalled()
    expect(overlay.dispose).not.toHaveBeenCalled()

    window.dispatchEvent(pageTransition('pageshow', true))
    window.dispatchEvent(pageTransition('pageshow', true))
    const handle = await appPromise

    expect(requestAnimationFrame).toHaveBeenCalledOnce()
    expect(overlay.showReady).toHaveBeenCalledOnce()
    handle.dispose()
    expect(scene.dispose).toHaveBeenCalledOnce()
    expect(catalog.dispose).toHaveBeenCalledOnce()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('defers a pending asset rejection until BFCache restoration', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const loadError = new Error('load failed while suspended')
    let rejectAssets: (error: Error) => void = () => undefined
    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: () => new Promise((_, reject) => { rejectAssets = reject }),
    })
    let rejected = false
    void appPromise.catch(() => { rejected = true })

    window.dispatchEvent(pageTransition('pagehide', true))
    rejectAssets(loadError)
    await Promise.resolve()
    await Promise.resolve()

    expect(rejected).toBe(false)
    expect(overlay.showError).not.toHaveBeenCalled()
    expect(scene.dispose).not.toHaveBeenCalled()
    expect(overlay.dispose).not.toHaveBeenCalled()

    window.dispatchEvent(pageTransition('pageshow', true))
    await expect(appPromise).rejects.toBe(loadError)
    expect(overlay.showError).toHaveBeenCalledOnce()
    expect(overlay.showError).toHaveBeenCalledWith(loadError)
    expect(scene.dispose).toHaveBeenCalledOnce()
  })

  it('suppresses a pending asset rejection after final pagehide', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const onError = vi.fn()
    const loadError = new Error('late load failure')
    let rejectAssets: (error: Error) => void = () => undefined
    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
      onError,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: () => new Promise((_, reject) => { rejectAssets = reject }),
    })

    window.dispatchEvent(pageTransition('pagehide', false))
    window.dispatchEvent(pageTransition('pagehide', false))
    rejectAssets(loadError)

    await expect(appPromise).rejects.toBe(loadError)
    expect(overlay.showError).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(scene.dispose).toHaveBeenCalledOnce()
    expect(overlay.dispose).toHaveBeenCalledOnce()
  })

  it('restores the catalog-derived initial loading total before the first asset event', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const stop = new Error('stop pending asset load')
    let rejectAssets: (error: Error) => void = () => undefined
    const appPromise = startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: () => new Promise((_, reject) => { rejectAssets = reject }),
    })

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(overlay.showLoading).toHaveBeenCalledWith(0, TOTAL_ASSET_REQUESTS)

    rejectAssets(stop)
    await expect(appPromise).rejects.toBe(stop)
  })

  it('defers loading progress UI until pending bootstrap returns from BFCache', async () => {
    const canvas = document.createElement('canvas')
    const loadingProgress = document.createElement('span')
    loadingProgress.textContent = '0 / 17'
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    let reportProgress: Parameters<StartAppDependencies['loadAssetCatalog']>[0] = () => undefined
    let resolveAssets: (catalog: AssetCatalog) => void = () => undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 94)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const appPromise = startApp({
      canvas,
      loadingProgress,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: (onProgress) => {
        reportProgress = onProgress
        return new Promise((resolve) => { resolveAssets = resolve })
      },
    })
    overlay.showLoading.mockClear()

    window.dispatchEvent(pageTransition('pagehide', true))
    reportProgress?.({ loaded: 8, total: 17, url: '/suspended.glb' })

    expect(overlay.showLoading).not.toHaveBeenCalled()
    expect(loadingProgress.textContent).toBe('0 / 17')

    window.dispatchEvent(pageTransition('pageshow', true))
    expect(overlay.showLoading).toHaveBeenCalledOnce()
    expect(overlay.showLoading).toHaveBeenCalledWith(8, 17)
    expect(loadingProgress.textContent).toBe('8 / 17')

    resolveAssets(createRunnableCatalog())
    const handle = await appPromise
    handle.dispose()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('removes the acceptance hook when owned-loop setup throws', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const setupError = new Error('requestAnimationFrame unavailable')
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => { throw setupError })

    await expect(startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
      acceptance: { debug: true },
    }, {
      createScene: () => createRunnableScene().context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })).rejects.toBe(setupError)

    expect((window as unknown as { __ENDLESS_CITY_ACCEPTANCE__?: unknown })
      .__ENDLESS_CITY_ACCEPTANCE__).toBeUndefined()
    expect(overlay.showError).toHaveBeenCalledWith(setupError)
    requestAnimationFrame.mockRestore()
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

  it('escalates an unrestored first context loss after ten seconds and stays terminal', async () => {
    vi.useFakeTimers()
    try {
      const canvas = document.createElement('canvas')
      const overlay = createOverlayHarness()
      const scene = createRunnableScene()
      const catalog = createRunnableCatalog()
      let reportProgress: Parameters<StartAppDependencies['loadAssetCatalog']>[0] = () => undefined
      const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
        .mockImplementation(() => 81)
      const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined)
      const handle = await startApp({
        canvas,
        overlay: overlay as unknown as OverlayController,
      }, {
        createScene: () => scene.context,
        loadAssetCatalog: async (onProgress) => {
          reportProgress = onProgress
          return catalog
        },
      })

      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(CONTEXT_RESTORE_TIMEOUT_MS).toBe(10_000)
      await vi.advanceTimersByTimeAsync(CONTEXT_RESTORE_TIMEOUT_MS - 1)
      expect(overlay.showError).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(overlay.showError).toHaveBeenCalledOnce()
      expect(overlay.showError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'WebGL context could not be restored. Reload to retry.',
      }))

      canvas.dispatchEvent(new Event('webglcontextrestored'))
      reportProgress?.({ loaded: 17, total: 17, url: '/late.glb' })
      expect(overlay.showReady).toHaveBeenCalledOnce()
      expect(overlay.showLoading).not.toHaveBeenCalled()
      expect(requestAnimationFrame).toHaveBeenCalledOnce()

      handle.dispose()
      expect(vi.getTimerCount()).toBe(0)
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('escalates a second context loss immediately and ignores a late restore', async () => {
    vi.useFakeTimers()
    try {
      const canvas = document.createElement('canvas')
      const overlay = createOverlayHarness()
      const scene = createRunnableScene()
      const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
        .mockImplementation(() => 82)
      const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined)
      const handle = await startApp({
        canvas,
        overlay: overlay as unknown as OverlayController,
      }, {
        createScene: () => scene.context,
        loadAssetCatalog: async () => createRunnableCatalog(),
      })

      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      await vi.advanceTimersByTimeAsync(1_000)
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(overlay.showReady).toHaveBeenCalledTimes(2)
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(overlay.showError).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)

      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(overlay.showReady).toHaveBeenCalledTimes(2)
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

      handle.dispose()
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(overlay.showError).toHaveBeenCalledOnce()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let pageshow override a context loss that began while BFCache-suspended', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 95)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    try {
      window.dispatchEvent(pageTransition('pagehide', true))
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      window.dispatchEvent(pageTransition('pageshow', true))

      expect(requestAnimationFrame).toHaveBeenCalledOnce()
      expect(overlay.showContextLost).toHaveBeenCalledOnce()

      canvas.dispatchEvent(new Event('webglcontextrestored'))
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    } finally {
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    }
  })

  it('does not schedule recovery frames before BFCache pageshow', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 96)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    try {
      window.dispatchEvent(pageTransition('pagehide', true))
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      canvas.dispatchEvent(new Event('webglcontextrestored'))

      expect(requestAnimationFrame).toHaveBeenCalledOnce()

      window.dispatchEvent(pageTransition('pageshow', true))
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    } finally {
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    }
  })

  it('honors context restoration requested during BFCache after a pre-existing loss', async () => {
    const canvas = document.createElement('canvas')
    const overlay = createOverlayHarness()
    const scene = createRunnableScene()
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 97)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const handle = await startApp({
      canvas,
      overlay: overlay as unknown as OverlayController,
    }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => createRunnableCatalog(),
    })

    try {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      window.dispatchEvent(pageTransition('pagehide', true))
      canvas.dispatchEvent(new Event('webglcontextrestored'))

      expect(requestAnimationFrame).toHaveBeenCalledOnce()

      window.dispatchEvent(pageTransition('pageshow', true))
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    } finally {
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    }
  })

  it('clears waiting recovery state when the application is disposed', async () => {
    vi.useFakeTimers()
    try {
      const canvas = document.createElement('canvas')
      const overlay = createOverlayHarness()
      const scene = createRunnableScene()
      const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
        .mockImplementation(() => 83)
      const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined)
      const handle = await startApp({
        canvas,
        overlay: overlay as unknown as OverlayController,
      }, {
        createScene: () => scene.context,
        loadAssetCatalog: async () => createRunnableCatalog(),
      })

      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(vi.getTimerCount()).toBe(1)
      handle.dispose()
      expect(vi.getTimerCount()).toBe(0)

      canvas.dispatchEvent(new Event('webglcontextrestored'))
      await vi.advanceTimersByTimeAsync(CONTEXT_RESTORE_TIMEOUT_MS)
      expect(overlay.showReady).toHaveBeenCalledOnce()
      expect(overlay.showError).not.toHaveBeenCalled()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps timeout escalation terminal when pending bootstrap later completes', async () => {
    vi.useFakeTimers()
    try {
      const canvas = document.createElement('canvas')
      const overlay = createOverlayHarness()
      const scene = createRunnableScene()
      let resolveAssets: (catalog: AssetCatalog) => void = () => undefined
      const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
        .mockImplementation(() => 84)
      const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
        .mockImplementation(() => undefined)
      const appPromise = startApp({
        canvas,
        overlay: overlay as unknown as OverlayController,
      }, {
        createScene: () => scene.context,
        loadAssetCatalog: () => new Promise((resolve) => { resolveAssets = resolve }),
      })

      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      await vi.advanceTimersByTimeAsync(CONTEXT_RESTORE_TIMEOUT_MS)
      expect(overlay.showError).toHaveBeenCalledOnce()

      resolveAssets(createRunnableCatalog())
      const handle = await appPromise
      canvas.dispatchEvent(new Event('webglcontextrestored'))

      expect(overlay.showReady).not.toHaveBeenCalled()
      expect(overlay.showLoading).not.toHaveBeenCalled()
      expect(requestAnimationFrame).toHaveBeenCalledOnce()
      expect(cancelAnimationFrame).toHaveBeenCalledOnce()
      handle.dispose()
      requestAnimationFrame.mockRestore()
      cancelAnimationFrame.mockRestore()
    } finally {
      vi.useRealTimers()
    }
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

  it('disposes app-owned assets before the scene context exactly once', async () => {
    const order: string[] = []
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    scene.dispose.mockImplementation(() => { order.push('scene') })
    const catalog = createRunnableCatalog(() => { order.push('assets') })
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 71)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const handle = await startApp({ canvas }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => catalog,
    })
    handle.dispose()
    handle.dispose()

    expect(order).toEqual(['assets', 'scene'])
    expect(catalog.dispose).toHaveBeenCalledOnce()
    expect(scene.dispose).toHaveBeenCalledOnce()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('disposes app-owned assets before the scene after a frame setup failure', async () => {
    const order: string[] = []
    const canvas = document.createElement('canvas')
    const scene = createRunnableScene()
    scene.dispose.mockImplementation(() => { order.push('scene') })
    const setupError = new Error('building clone failed')
    const catalog = createRunnableCatalog(
      () => { order.push('assets') },
      () => { throw setupError },
    )
    let frame: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frame = callback
        return 72
      })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const onError = vi.fn()

    await startApp({ canvas, onError }, {
      createScene: () => scene.context,
      loadAssetCatalog: async () => catalog,
    })
    frame?.(0)

    expect(onError).toHaveBeenCalledWith(setupError)
    expect(order).toEqual(['assets', 'scene'])
    expect(catalog.dispose).toHaveBeenCalledOnce()
    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('loads a fresh catalog for a restarted application', async () => {
    const canvas = document.createElement('canvas')
    const catalogs = [createRunnableCatalog(), createRunnableCatalog()]
    const loadAssetCatalog = vi.fn()
      .mockResolvedValueOnce(catalogs[0])
      .mockResolvedValueOnce(catalogs[1])
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 73)
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const first = await startApp({ canvas }, {
      createScene: () => createRunnableScene().context,
      loadAssetCatalog,
    })
    first.dispose()
    const second = await startApp({ canvas }, {
      createScene: () => createRunnableScene().context,
      loadAssetCatalog,
    })
    second.dispose()

    expect(loadAssetCatalog).toHaveBeenCalledTimes(2)
    expect(catalogs[0]!.dispose).toHaveBeenCalledOnce()
    expect(catalogs[1]!.dispose).toHaveBeenCalledOnce()
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
