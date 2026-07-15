import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DirectionalShadowFollower } from '../src/rendering/shadow-follower'

const SHADOW_RADIUS = 180
const SHADOW_SPAN = SHADOW_RADIUS * 2
const WORLD_UP = new THREE.Vector3(0, 1, 0)

function createLight(mapSize: 1024 | 2048 = 1024): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight()
  light.position.set(-300, 750, -300)
  light.target.position.set(0, 0, 0)
  light.shadow.camera.left = -SHADOW_RADIUS
  light.shadow.camera.right = SHADOW_RADIUS
  light.shadow.camera.top = SHADOW_RADIUS
  light.shadow.camera.bottom = -SHADOW_RADIUS
  light.shadow.mapSize.set(mapSize, mapSize)
  return light
}

function lightSpaceAxes(light: THREE.DirectionalLight): {
  horizontal: THREE.Vector3
  vertical: THREE.Vector3
} {
  const depth = light.position.clone().sub(light.target.position).normalize()
  const horizontal = new THREE.Vector3().crossVectors(WORLD_UP, depth).normalize()
  const vertical = new THREE.Vector3().crossVectors(depth, horizontal).normalize()
  return { horizontal, vertical }
}

describe('DirectionalShadowFollower', () => {
  it('holds both projected axes steady during sub-texel movement', () => {
    const light = createLight(1024)
    const { horizontal, vertical } = lightSpaceAxes(light)
    const texelSize = SHADOW_SPAN / 1024
    const movement = horizontal.clone().multiplyScalar(texelSize * 0.49)
    const follower = new DirectionalShadowFollower(light)

    follower.update(movement.x, movement.z)

    expect(light.target.position.dot(horizontal)).toBeCloseTo(0, 10)
    expect(light.target.position.dot(vertical)).toBeCloseTo(0, 10)
  })

  it.each([1024, 2048] as const)(
    'advances by one projected texel on a %i map',
    (mapSize) => {
      const light = createLight(mapSize)
      const { horizontal } = lightSpaceAxes(light)
      const texelSize = SHADOW_SPAN / mapSize
      const movement = horizontal.clone().multiplyScalar(texelSize * 0.51)
      const follower = new DirectionalShadowFollower(light)

      follower.update(movement.x, movement.z)

      expect(light.target.position.dot(horizontal)).toBeCloseTo(texelSize, 10)
    },
  )

  it('snaps diagonal movement on both projected axes', () => {
    const light = createLight(1024)
    const { horizontal, vertical } = lightSpaceAxes(light)
    const desired = new THREE.Vector3(12.5, 0, -8.25)
    const texelSize = SHADOW_SPAN / 1024
    const follower = new DirectionalShadowFollower(light)

    follower.update(desired.x, desired.z)

    const expectedHorizontal = Math.round(desired.dot(horizontal) / texelSize) * texelSize
    const expectedVertical = Math.round(desired.dot(vertical) / texelSize) * texelSize
    expect(light.target.position.dot(horizontal)).toBeCloseTo(expectedHorizontal, 10)
    expect(light.target.position.dot(vertical)).toBeCloseTo(expectedVertical, 10)
  })

  it('preserves the light offset through a render-origin-sized jump', () => {
    const light = createLight(1024)
    const { horizontal, vertical } = lightSpaceAxes(light)
    const originalOffset = light.position.clone().sub(light.target.position)
    const texelSize = SHADOW_SPAN / 1024
    const follower = new DirectionalShadowFollower(light)

    follower.update(120, -60)

    const updatedOffset = light.position.clone().sub(light.target.position)
    expect(updatedOffset.distanceTo(originalOffset)).toBeLessThan(1e-10)
    expect(light.position.toArray().every(Number.isFinite)).toBe(true)
    expect(light.target.position.toArray().every(Number.isFinite)).toBe(true)
    const horizontalSteps = light.target.position.dot(horizontal) / texelSize
    const verticalSteps = light.target.position.dot(vertical) / texelSize
    expect(horizontalSteps).toBeCloseTo(Math.round(horizontalSteps), 10)
    expect(verticalSteps).toBeCloseTo(Math.round(verticalSteps), 10)
  })

  it('rejects a zero or world-up-parallel light offset', () => {
    const zeroOffset = createLight()
    zeroOffset.position.copy(zeroOffset.target.position)
    expect(() => new DirectionalShadowFollower(zeroOffset)).toThrow(/finite and non-zero/)

    const parallelOffset = createLight()
    parallelOffset.position.set(0, 10, 0)
    expect(() => new DirectionalShadowFollower(parallelOffset)).toThrow(/parallel to world up/)
  })

  it.each([
    ['horizontal span', (light: THREE.DirectionalLight) => {
      light.shadow.camera.right = light.shadow.camera.left
    }],
    ['vertical span', (light: THREE.DirectionalLight) => {
      light.shadow.camera.top = Number.POSITIVE_INFINITY
    }],
    ['map width', (light: THREE.DirectionalLight) => {
      light.shadow.mapSize.x = 0
    }],
    ['map height', (light: THREE.DirectionalLight) => {
      light.shadow.mapSize.y = Number.NaN
    }],
  ] as const)('rejects an invalid %s', (_label, invalidate) => {
    const light = createLight()
    invalidate(light)
    expect(() => new DirectionalShadowFollower(light)).toThrow(/positive finite number/)
  })

  it('rejects non-finite update coordinates', () => {
    const follower = new DirectionalShadowFollower(createLight())

    expect(() => follower.update(Number.NaN, 0)).toThrow(/target coordinates must be finite/)
    expect(() => follower.update(0, Number.POSITIVE_INFINITY)).toThrow(
      /target coordinates must be finite/,
    )
  })
})
