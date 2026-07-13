import type * as THREE from 'three'
import type { MapControls } from 'three/addons/controls/MapControls.js'
import { logicalCamera, recenterFrame, type RenderFrame } from '../city/origin'
import type { WorldPoint } from '../city/types'

export interface MapControlsAdapter extends Pick<
  MapControls,
  'target' | 'addEventListener' | 'removeEventListener'
> {
  readonly target: THREE.Vector3
  update(): boolean | void
}

export interface CameraState {
  readonly logicalCamera: WorldPoint
  readonly origin: WorldPoint
}

export class CameraController {
  private currentOrigin: WorldPoint
  private interactionActive = false
  private readonly handleInteractionStart = (): void => {
    this.interactionActive = true
  }
  private readonly handleInteractionEnd = (): void => {
    this.interactionActive = false
  }

  constructor(
    private readonly camera: THREE.Camera,
    private readonly controls: MapControlsAdapter,
    initialOrigin: WorldPoint = { x: 0, z: 0 },
  ) {
    this.currentOrigin = { ...initialOrigin }
    this.controls.addEventListener('start', this.handleInteractionStart)
    this.controls.addEventListener('end', this.handleInteractionEnd)
  }

  update(): CameraState {
    this.controls.update()
    const frame: RenderFrame = {
      localCamera: { x: this.camera.position.x, z: this.camera.position.z },
      localTarget: { x: this.controls.target.x, z: this.controls.target.z },
      origin: this.currentOrigin,
    }
    const recentered = this.interactionActive ? frame : recenterFrame(frame)
    const originChanged = recentered.origin.x !== this.currentOrigin.x
      || recentered.origin.z !== this.currentOrigin.z

    if (originChanged) {
      this.camera.position.set(
        recentered.localCamera.x,
        this.camera.position.y,
        recentered.localCamera.z,
      )
      this.controls.target.set(
        recentered.localTarget.x,
        this.controls.target.y,
        recentered.localTarget.z,
      )
    }
    this.currentOrigin = recentered.origin

    return {
      logicalCamera: logicalCamera(recentered),
      origin: { ...this.currentOrigin },
    }
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.handleInteractionStart)
    this.controls.removeEventListener('end', this.handleInteractionEnd)
  }
}
