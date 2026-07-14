// @vitest-environment jsdom

import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  configureLockedLegacyCamera,
  LOCKED_CAMERA_AZIMUTH_ANGLE,
  LOCKED_CAMERA_POLAR_ANGLE,
} from '../src/rendering/scene'

const controlsToDispose: MapControls[] = []

const createControls = (): { camera: THREE.PerspectiveCamera; controls: MapControls } => {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 500)
  camera.position.set(10, 100, 10)
  const controls = new MapControls(camera, document.createElement('canvas'))
  controlsToDispose.push(controls)
  return { camera, controls }
}

afterEach(() => {
  while (controlsToDispose.length > 0) controlsToDispose.pop()?.dispose()
})

describe('configureLockedLegacyCamera', () => {
  it('applies the exact legacy angle, distance, input, and touch constraints', () => {
    const { controls } = createControls()

    configureLockedLegacyCamera(controls)

    expect(controls.minPolarAngle).toBe(LOCKED_CAMERA_POLAR_ANGLE)
    expect(controls.maxPolarAngle).toBe(LOCKED_CAMERA_POLAR_ANGLE)
    expect(controls.minAzimuthAngle).toBe(LOCKED_CAMERA_AZIMUTH_ANGLE)
    expect(controls.maxAzimuthAngle).toBe(LOCKED_CAMERA_AZIMUTH_ANGLE)
    expect(controls.minDistance).toBe(100)
    expect(controls.maxDistance).toBe(125)
    expect(controls.enableRotate).toBe(false)
    expect(controls.enablePan).toBe(true)
    expect(controls.enableZoom).toBe(true)
    expect(controls.touches).toEqual({
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    })
  })

  it('snaps to the legacy composition and preserves it through pan and distance clamps', () => {
    const { camera, controls } = createControls()
    configureLockedLegacyCamera(controls)

    expect(controls.getPolarAngle()).toBeCloseTo(Math.PI / 5, 10)
    expect(controls.getAzimuthalAngle()).toBeCloseTo(Math.PI / 4, 10)

    const pan = new THREE.Vector3(30, 0, -20)
    camera.position.add(pan)
    controls.target.add(pan)
    controls.update()
    expect(controls.getPolarAngle()).toBeCloseTo(Math.PI / 5, 10)
    expect(controls.getAzimuthalAngle()).toBeCloseTo(Math.PI / 4, 10)

    const viewDirection = camera.position.clone().sub(controls.target).normalize()
    camera.position.copy(controls.target).addScaledVector(viewDirection, 200)
    controls.update()
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(125, 10)

    camera.position.copy(controls.target).addScaledVector(viewDirection, 50)
    controls.update()
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(100, 10)
  })
})
