import { CameraController } from './camera/controller'
import type { GridCoordinate } from './city/types'
import {
  BLOCK_SIZE,
  FIXED_STEP_SECONDS,
  FOG_FAR,
  MAX_FRAME_SECONDS,
  WORLD_SEED,
} from './config'
import { CityView } from './rendering/city-view'
import {
  createCloudLayer as createCloudLayerView,
  type CloudLayerController,
} from './rendering/cloud-layer'
import {
  loadAssetCatalog as loadAssets,
  TOTAL_ASSET_REQUESTS,
  type AssetCatalog,
} from './rendering/assets'
import { chooseQualityProfile } from './rendering/quality'
import { createScene as createSceneContext } from './rendering/scene'
import { DirectionalShadowFollower } from './rendering/shadow-follower'
import { TrafficView } from './rendering/traffic-view'
import { consumeFixedSteps } from './traffic/following'
import { TrafficSimulation } from './traffic/simulation'
import type { TrafficConfig } from './traffic/types'
import type { OverlayController } from './ui/overlay'
import {
  installAcceptanceHook,
  type AcceptanceSnapshot,
} from './debug/acceptance'
import type { WorldPoint } from './city/types'

export const TRAFFIC_CONFIG = Object.freeze({
  minimumGap: 3,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  emergencyBrakingFloor: 7,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  reservationLifetimeSteps: 120,
  movementCorridorHalfWidth: 2.25,
  stoppedSpeedThreshold: 0.25,
  offscreenStoppedTimeoutSteps: 720,
  protectedRadius: FOG_FAR,
  simulationRadius: FOG_FAR + BLOCK_SIZE * 2,
} satisfies TrafficConfig)

export const CONTEXT_RESTORE_TIMEOUT_MS = 10_000

export interface AppElements {
  readonly canvas: HTMLCanvasElement
  readonly overlay?: OverlayController
  readonly loading?: HTMLElement | null
  readonly loadingProgress?: HTMLElement | null
  readonly onError?: (error: unknown) => void
  readonly acceptance?: {
    readonly debug: boolean
    readonly initialLogicalCamera?: WorldPoint
  }
}

export interface AppHandle {
  pause(): void
  resume(): void
  dispose(): void
}

interface AppEventTarget {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

export interface OwnedLoopInput {
  readonly windowTarget: AppEventTarget
  readonly documentTarget: AppEventTarget
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number
  readonly cancelAnimationFrame: (handle: number) => void
  readonly onResize: () => void
  readonly onVisibilityChange: () => void
  readonly runFrame: (timestamp: number) => void
  readonly disposeScene: () => void
  readonly disposeApplication?: () => void
  readonly onPageFreeze?: () => void
  readonly onError: (error: unknown) => void
}

export interface StartAppDependencies {
  readonly createScene: typeof createSceneContext
  readonly loadAssetCatalog: typeof loadAssets
  readonly createCloudLayer: typeof createCloudLayerView
}

const centerGridCell = (x: number, z: number): GridCoordinate => ({
  x: Math.round(x / BLOCK_SIZE),
  z: Math.round(z / BLOCK_SIZE),
})

export function completeOverlayBootstrap(
  overlay: Pick<OverlayController, 'showReady'> | undefined,
  contextLost: boolean,
): void {
  if (!contextLost) overlay?.showReady()
}

const isPersistedPageTransition = (event: Event): boolean =>
  'persisted' in event && event.persisted === true

export function startOwnedLoop(input: OwnedLoopInput): AppHandle {
  let stopped = false
  let applicationDisposed = false
  let paused = false
  let bfcacheSuspended = false
  let resumeAfterBfcache = false
  let resumeRequestedDuringBfcache = false
  let frameHandle: number | undefined

  const resizeListener: EventListener = () => input.onResize()
  const visibilityListener: EventListener = () => input.onVisibilityChange()
  const pageHideListener: EventListener = (event) => {
    if (!isPersistedPageTransition(event)) {
      handle.dispose()
      return
    }
    if (stopped || bfcacheSuspended) return
    resumeAfterBfcache = !paused
    bfcacheSuspended = true
    if (frameHandle !== undefined) {
      input.cancelAnimationFrame(frameHandle)
      frameHandle = undefined
    }
    input.onPageFreeze?.()
  }
  const pageShowListener: EventListener = (event) => {
    if (!isPersistedPageTransition(event) || stopped || !bfcacheSuspended) return
    const shouldResume =
      (resumeAfterBfcache || resumeRequestedDuringBfcache) && !paused
    bfcacheSuspended = false
    resumeAfterBfcache = false
    resumeRequestedDuringBfcache = false
    if (shouldResume) frameHandle = input.requestAnimationFrame(frame)
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true

    if (frameHandle !== undefined) {
      input.cancelAnimationFrame(frameHandle)
      frameHandle = undefined
    }
    input.windowTarget.removeEventListener('resize', resizeListener)
    input.documentTarget.removeEventListener('visibilitychange', visibilityListener)
    input.disposeScene()
  }

  const handle: AppHandle = {
    pause() {
      if (stopped || paused) return
      paused = true
      if (frameHandle !== undefined) {
        input.cancelAnimationFrame(frameHandle)
        frameHandle = undefined
      }
    },
    resume() {
      if (stopped || !paused) return
      paused = false
      if (bfcacheSuspended) {
        resumeRequestedDuringBfcache = true
        return
      }
      frameHandle = input.requestAnimationFrame(frame)
    },
    dispose() {
      stop()
      input.windowTarget.removeEventListener('pagehide', pageHideListener)
      input.windowTarget.removeEventListener('pageshow', pageShowListener)
      if (applicationDisposed) return
      applicationDisposed = true
      input.disposeApplication?.()
    },
  }

  const frame: FrameRequestCallback = (timestamp) => {
    frameHandle = undefined
    if (stopped || paused) return

    try {
      input.runFrame(timestamp)
    } catch (error) {
      stop()
      input.onError(error)
      return
    }

    if (!stopped && !paused) frameHandle = input.requestAnimationFrame(frame)
  }

  try {
    input.windowTarget.addEventListener('resize', resizeListener)
    input.documentTarget.addEventListener('visibilitychange', visibilityListener)
    input.windowTarget.addEventListener('pagehide', pageHideListener)
    input.windowTarget.addEventListener('pageshow', pageShowListener)
    frameHandle = input.requestAnimationFrame(frame)
  } catch (error) {
    stop()
    input.windowTarget.removeEventListener('pagehide', pageHideListener)
    input.windowTarget.removeEventListener('pageshow', pageShowListener)
    throw error
  }

  return handle
}

export async function startApp(
  elements: AppElements,
  dependencies: Partial<StartAppDependencies> = {},
): Promise<AppHandle> {
  elements.canvas.style.width = '100vw'
  elements.canvas.style.height = '100vh'
  elements.canvas.style.display = 'block'

  const profile = chooseQualityProfile({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
  })
  const reportError = (error: unknown): void => {
    elements.overlay?.showError(error)
    elements.onError?.(error)
  }
  let context
  try {
    context = (dependencies.createScene ?? createSceneContext)(elements.canvas, profile)
  } catch (cause) {
    const error = new Error(
      'WebGL is unavailable. Try a current browser with hardware acceleration enabled.',
      { cause },
    )
    reportError(error)
    throw error
  }
  let contextDisposed = false
  let assetsDisposed = false
  let assets: AssetCatalog | undefined
  let cloudLayer: CloudLayerController | undefined
  let bootstrapDisposed = false
  let removeAcceptanceHook: () => void = () => undefined
  let recoveryListenersRemoved = false
  const disposeContext = (): void => {
    if (contextDisposed) return
    contextDisposed = true
    context.dispose()
  }
  const disposeResources = (): void => {
    const currentCloudLayer = cloudLayer
    cloudLayer = undefined
    try {
      currentCloudLayer?.dispose()
    } finally {
      if (assets === undefined || assetsDisposed) {
        disposeContext()
        return
      }
      assetsDisposed = true
      try {
        assets.dispose()
      } finally {
        disposeContext()
      }
    }
  }
  let handle: AppHandle | undefined
  let recoveryState: 'healthy' | 'waiting' | 'terminal' = 'healthy'
  let contextLossCount = 0
  let recoveryTimer: number | undefined
  let bootstrapReady = false
  let lastLoadingProgress = { loaded: 0, total: TOTAL_ASSET_REQUESTS }
  let bootstrapBfcacheSuspended = false
  let bootstrapProgressDeferred = false
  const recoveryIsTerminal = (): boolean => recoveryState === 'terminal'
  const renderLoadingProgress = (): void => {
    elements.overlay?.showLoading(lastLoadingProgress.loaded, lastLoadingProgress.total)
    if (elements.loadingProgress !== null && elements.loadingProgress !== undefined) {
      elements.loadingProgress.textContent =
        `${lastLoadingProgress.loaded} / ${lastLoadingProgress.total}`
    }
  }

  const clearRecoveryTimer = (): void => {
    if (recoveryTimer === undefined) return
    window.clearTimeout(recoveryTimer)
    recoveryTimer = undefined
  }
  const removeRecoveryListeners = (): void => {
    if (recoveryListenersRemoved) return
    recoveryListenersRemoved = true
    clearRecoveryTimer()
    elements.canvas.removeEventListener('webglcontextlost', contextLostListener)
    elements.canvas.removeEventListener('webglcontextrestored', contextRestoredListener)
  }
  const failRecovery = (): void => {
    if (recoveryState === 'terminal') return
    recoveryState = 'terminal'
    handle?.pause()
    removeRecoveryListeners()
    reportError(new Error('WebGL context could not be restored. Reload to retry.'))
  }

  const contextLostListener: EventListener = (event) => {
    event.preventDefault()
    if (recoveryState === 'terminal') return
    contextLossCount += 1
    handle?.pause()
    if (contextLossCount > 1) {
      failRecovery()
      return
    }
    recoveryState = 'waiting'
    elements.overlay?.showContextLost()
    clearRecoveryTimer()
    recoveryTimer = window.setTimeout(failRecovery, CONTEXT_RESTORE_TIMEOUT_MS)
  }
  const contextRestoredListener: EventListener = () => {
    if (recoveryState !== 'waiting') return
    clearRecoveryTimer()
    recoveryState = 'healthy'
    if (bootstrapReady) elements.overlay?.showReady()
    else if (bootstrapBfcacheSuspended) bootstrapProgressDeferred = true
    else {
      bootstrapProgressDeferred = false
      renderLoadingProgress()
    }
    handle?.resume()
  }

  elements.canvas.addEventListener('webglcontextlost', contextLostListener)
  elements.canvas.addEventListener('webglcontextrestored', contextRestoredListener)

  const disposedHandle: AppHandle = {
    pause() {},
    resume() {},
    dispose() {},
  }
  let bootstrapResumePromise: Promise<void> | undefined
  let releaseBootstrapResume: (() => void) | undefined
  const waitForBootstrapResume = async (): Promise<void> => {
    if (!bootstrapBfcacheSuspended) return
    bootstrapResumePromise ??= new Promise<void>((resolve) => {
      releaseBootstrapResume = resolve
    })
    await bootstrapResumePromise
  }
  const resumeBootstrap = (): void => {
    if (!bootstrapBfcacheSuspended) return
    bootstrapBfcacheSuspended = false
    const release = releaseBootstrapResume
    bootstrapResumePromise = undefined
    releaseBootstrapResume = undefined
    if (bootstrapProgressDeferred && !bootstrapDisposed && recoveryState === 'healthy') {
      bootstrapProgressDeferred = false
      renderLoadingProgress()
    }
    release?.()
  }
  const removeBootstrapPageTransitionListeners = (): void => {
    window.removeEventListener('pagehide', bootstrapPageHideListener)
    window.removeEventListener('pageshow', bootstrapPageShowListener)
  }
  const bootstrapPageHideListener: EventListener = (event) => {
    if (isPersistedPageTransition(event)) {
      if (!bootstrapDisposed) bootstrapBfcacheSuspended = true
      return
    }
    if (bootstrapDisposed) return
    bootstrapDisposed = true
    removeBootstrapPageTransitionListeners()
    resumeBootstrap()
    removeRecoveryListeners()
    disposeResources()
    elements.overlay?.dispose()
  }
  const bootstrapPageShowListener: EventListener = (event) => {
    if (bootstrapDisposed || !isPersistedPageTransition(event)) return
    resumeBootstrap()
  }
  window.addEventListener('pagehide', bootstrapPageHideListener)
  window.addEventListener('pageshow', bootstrapPageShowListener)

  try {
    let loadedAssets: AssetCatalog
    try {
      loadedAssets = await (dependencies.loadAssetCatalog ?? loadAssets)(({ loaded, total }) => {
        if (bootstrapDisposed || recoveryState === 'terminal') return
        lastLoadingProgress = { loaded, total }
        if (bootstrapBfcacheSuspended) {
          bootstrapProgressDeferred = true
          return
        }
        renderLoadingProgress()
      })
    } catch (error) {
      await waitForBootstrapResume()
      throw error
    }
    await waitForBootstrapResume()
    assets = loadedAssets
    if (bootstrapDisposed) {
      disposeResources()
      return disposedHandle
    }
    const cityView = new CityView(context.scene, loadedAssets, profile)
    cloudLayer = (dependencies.createCloudLayer ?? createCloudLayerView)(context.scene)
    const activeCloudLayer = cloudLayer
    const traffic = loadedAssets.vehicleMetadata.length === 0
      ? undefined
      : new TrafficSimulation({
          count: profile.trafficCount,
          seed: WORLD_SEED,
          camera: { x: context.camera.position.x, z: context.camera.position.z },
          prototypes: loadedAssets.vehicleMetadata,
          config: TRAFFIC_CONFIG,
        })
    const trafficView = traffic === undefined
      ? undefined
      : new TrafficView(context.scene, loadedAssets, traffic.vehicles)
    const initialLogicalCamera = elements.acceptance?.initialLogicalCamera
    let initialOrigin: WorldPoint = { x: 0, z: 0 }
    if (initialLogicalCamera !== undefined) {
      const xOffset = context.camera.position.x - context.controls.target.x
      const zOffset = context.camera.position.z - context.controls.target.z
      context.camera.position.x = 0
      context.camera.position.z = 0
      context.controls.target.x = -xOffset
      context.controls.target.z = -zOffset
      initialOrigin = { ...initialLogicalCamera }
    }
    const cameraController = new CameraController(context.camera, context.controls, initialOrigin)
    let currentCameraState = {
      logicalCamera: {
        x: context.camera.position.x + initialOrigin.x,
        z: context.camera.position.z + initialOrigin.z,
      },
      origin: initialOrigin,
    }
    removeAcceptanceHook = installAcceptanceHook(
      elements.acceptance?.debug === true,
      (): AcceptanceSnapshot => {
        const city = cityView.acceptanceSnapshot()
        const activeVehicles = traffic?.vehicles.filter((vehicle) => vehicle.active) ?? []
        const activeDirections = [...new Set(
          activeVehicles.map((vehicle) => vehicle.lane.direction),
        )].sort()
        return {
          logicalCamera: currentCameraState.logicalCamera,
          renderOrigin: currentCameraState.origin,
          localCamera: {
            x: context.camera.position.x,
            z: context.camera.position.z,
          },
          buildingPoolSize: city.poolSize,
          visibleAssignments: city.visibleAssignments,
          vehicleSlotCount: traffic?.vehicles.length ?? 0,
          activeVehicleCount: activeVehicles.length,
          activeDirections,
        }
      },
    )
    const shadowFollower = new DirectionalShadowFollower(context.directionalLight)
    let accumulator = 0
    let previousTimestamp: number | undefined

    const resize = (): void => {
      context.resize({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      })
    }
    const visibilityChange = (): void => {
      if (document.hidden) previousTimestamp = undefined
    }
    const frame = (timestamp: number): void => {
      if (document.hidden) {
        previousTimestamp = undefined
        return
      }

      const frameSeconds = previousTimestamp === undefined
        ? 0
        : (timestamp - previousTimestamp) / 1_000
      previousTimestamp = timestamp
      const cameraState = cameraController.update()
      currentCameraState = cameraState
      activeCloudLayer.update(
        cameraState.logicalCamera,
        cameraState.origin,
        Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS),
      )
      cityView.update(
        centerGridCell(cameraState.logicalCamera.x, cameraState.logicalCamera.z),
        cameraState.origin,
      )

      if (traffic !== undefined && trafficView !== undefined) {
        const stepResult = consumeFixedSteps(
          accumulator,
          frameSeconds,
          FIXED_STEP_SECONDS,
          MAX_FRAME_SECONDS,
          () => traffic.step(FIXED_STEP_SECONDS, cameraState.logicalCamera),
        )
        accumulator = stepResult.accumulator
        trafficView.sync(traffic.vehicles, cameraState.origin, stepResult.alpha)
      }

      shadowFollower.update(
        context.controls.target.x,
        context.controls.target.z,
      )
      context.renderer.render(context.scene, context.camera)
    }

    removeBootstrapPageTransitionListeners()
    handle = startOwnedLoop({
      windowTarget: window,
      documentTarget: document,
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (frameId) => window.cancelAnimationFrame(frameId),
      onResize: resize,
      onVisibilityChange: visibilityChange,
      onPageFreeze: () => {
        previousTimestamp = undefined
      },
      runFrame: frame,
      disposeScene: () => {
        cameraController.dispose()
        removeRecoveryListeners()
        disposeResources()
      },
      disposeApplication: () => {
        removeAcceptanceHook()
        elements.overlay?.dispose()
      },
      onError: reportError,
    })
    if (recoveryState !== 'healthy') handle.pause()
    bootstrapReady = true
    elements.loading?.remove()
    completeOverlayBootstrap(elements.overlay, recoveryState !== 'healthy')

    return handle
  } catch (error) {
    removeBootstrapPageTransitionListeners()
    removeRecoveryListeners()
    if (handle === undefined) disposeResources()
    else handle.dispose()
    removeAcceptanceHook()
    if (!bootstrapDisposed && !recoveryIsTerminal()) reportError(error)
    throw error
  }
}
