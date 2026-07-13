import * as THREE from 'three'
import { CameraController } from './camera/controller'
import type { GridCoordinate } from './city/types'
import {
  BLOCK_SIZE,
  FIXED_STEP_SECONDS,
  MAX_FRAME_SECONDS,
  WORLD_SEED,
} from './config'
import { CityView } from './rendering/city-view'
import { loadAssetCatalog as loadAssets } from './rendering/assets'
import { chooseQualityProfile } from './rendering/quality'
import { createScene as createSceneContext } from './rendering/scene'
import { TrafficView } from './rendering/traffic-view'
import { consumeFixedSteps } from './traffic/following'
import { TrafficSimulation } from './traffic/simulation'
import type { TrafficConfig } from './traffic/types'
import type { OverlayController } from './ui/overlay'

const TRAFFIC_CONFIG = Object.freeze({
  minimumGap: 3,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  protectedRadius: 120,
  simulationRadius: 220,
} satisfies TrafficConfig)

export interface AppElements {
  readonly canvas: HTMLCanvasElement
  readonly overlay?: OverlayController
  readonly loading?: HTMLElement | null
  readonly loadingProgress?: HTMLElement | null
  readonly onError?: (error: unknown) => void
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
  readonly onError: (error: unknown) => void
}

export interface StartAppDependencies {
  readonly createScene: typeof createSceneContext
  readonly loadAssetCatalog: typeof loadAssets
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

export function startOwnedLoop(input: OwnedLoopInput): AppHandle {
  let stopped = false
  let applicationDisposed = false
  let paused = false
  let frameHandle: number | undefined

  const resizeListener: EventListener = () => input.onResize()
  const visibilityListener: EventListener = () => input.onVisibilityChange()
  const pageHideListener: EventListener = () => handle.dispose()

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
      frameHandle = input.requestAnimationFrame(frame)
    },
    dispose() {
      stop()
      input.windowTarget.removeEventListener('pagehide', pageHideListener)
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
    frameHandle = input.requestAnimationFrame(frame)
  } catch (error) {
    stop()
    input.windowTarget.removeEventListener('pagehide', pageHideListener)
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
  let recoveryListenersRemoved = false
  const disposeContext = (): void => {
    if (contextDisposed) return
    contextDisposed = true
    context.dispose()
  }
  let handle: AppHandle | undefined
  let contextLost = false
  let bootstrapReady = false
  let lastLoadingProgress = { loaded: 0, total: 17 }

  const contextLostListener: EventListener = (event) => {
    event.preventDefault()
    contextLost = true
    handle?.pause()
    elements.overlay?.showContextLost()
  }
  const contextRestoredListener: EventListener = () => {
    contextLost = false
    if (bootstrapReady) elements.overlay?.showReady()
    else elements.overlay?.showLoading(lastLoadingProgress.loaded, lastLoadingProgress.total)
    handle?.resume()
  }
  const removeRecoveryListeners = (): void => {
    if (recoveryListenersRemoved) return
    recoveryListenersRemoved = true
    elements.canvas.removeEventListener('webglcontextlost', contextLostListener)
    elements.canvas.removeEventListener('webglcontextrestored', contextRestoredListener)
  }

  elements.canvas.addEventListener('webglcontextlost', contextLostListener)
  elements.canvas.addEventListener('webglcontextrestored', contextRestoredListener)

  try {
    const assets = await (dependencies.loadAssetCatalog ?? loadAssets)(({ loaded, total }) => {
      lastLoadingProgress = { loaded, total }
      elements.overlay?.showLoading(loaded, total)
      if (elements.loadingProgress !== null && elements.loadingProgress !== undefined) {
        elements.loadingProgress.textContent = `${loaded} / ${total}`
      }
    })
    const cityView = new CityView(context.scene, assets, profile)
    const traffic = new TrafficSimulation({
      count: profile.trafficCount,
      seed: WORLD_SEED,
      camera: { x: context.camera.position.x, z: context.camera.position.z },
      prototypes: assets.vehicleMetadata,
      config: TRAFFIC_CONFIG,
    })
    const trafficView = new TrafficView(context.scene, assets, traffic.vehicles)
    const cameraController = new CameraController(context.camera, context.controls)
    const shadowOffset = context.directionalLight.position.clone()
      .sub(context.directionalLight.target.position)
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

      const cameraState = cameraController.update()
      cityView.update(
        centerGridCell(cameraState.logicalCamera.x, cameraState.logicalCamera.z),
        cameraState.origin,
      )

      const frameSeconds = previousTimestamp === undefined
        ? 0
        : (timestamp - previousTimestamp) / 1_000
      previousTimestamp = timestamp
      const stepResult = consumeFixedSteps(
        accumulator,
        frameSeconds,
        FIXED_STEP_SECONDS,
        MAX_FRAME_SECONDS,
        () => traffic.step(FIXED_STEP_SECONDS, cameraState.logicalCamera),
      )
      accumulator = stepResult.accumulator
      trafficView.sync(traffic.vehicles, cameraState.origin, stepResult.alpha)

      const shadowTarget = new THREE.Vector3(
        context.controls.target.x,
        0,
        context.controls.target.z,
      )
      context.directionalLight.target.position.copy(shadowTarget)
      context.directionalLight.position.copy(shadowTarget).add(shadowOffset)
      context.renderer.render(context.scene, context.camera)
      elements.overlay?.updateFps(timestamp)
    }

    handle = startOwnedLoop({
      windowTarget: window,
      documentTarget: document,
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (frameId) => window.cancelAnimationFrame(frameId),
      onResize: resize,
      onVisibilityChange: visibilityChange,
      runFrame: frame,
      disposeScene: () => {
        removeRecoveryListeners()
        disposeContext()
      },
      disposeApplication: () => elements.overlay?.dispose(),
      onError: reportError,
    })
    if (contextLost) handle.pause()
    bootstrapReady = true
    elements.loading?.remove()
    completeOverlayBootstrap(elements.overlay, contextLost)

    return handle
  } catch (error) {
    removeRecoveryListeners()
    if (handle === undefined) disposeContext()
    else handle.dispose()
    reportError(error)
    throw error
  }
}
