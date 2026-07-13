import type * as THREE from 'three'
import { logicalCamera, recenterFrame, type RenderFrame } from '../city/origin'
import type { WorldPoint } from '../city/types'

export interface MapControlsAdapter {
  readonly target: THREE.Vector3
  update(): boolean | void
}

export interface CameraState {
  readonly logicalCamera: WorldPoint
  readonly origin: WorldPoint
}

export class CameraController {
  private currentOrigin: WorldPoint

  constructor(
    private readonly camera: THREE.Camera,
    private readonly controls: MapControlsAdapter,
    initialOrigin: WorldPoint = { x: 0, z: 0 },
  ) {
    this.currentOrigin = { ...initialOrigin }
  }

  update(): CameraState {
    this.controls.update()
    const frame: RenderFrame = {
      localCamera: { x: this.camera.position.x, z: this.camera.position.z },
      localTarget: { x: this.controls.target.x, z: this.controls.target.z },
      origin: this.currentOrigin,
    }
    const recentered = recenterFrame(frame)
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
}
