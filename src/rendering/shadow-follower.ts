import * as THREE from 'three'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const AXIS_EPSILON = 1e-12

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Directional shadow ${label} must be a positive finite number`)
  }
  return value
}

export class DirectionalShadowFollower {
  private readonly offset = new THREE.Vector3()
  private readonly horizontalAxis = new THREE.Vector3()
  private readonly verticalAxis = new THREE.Vector3()
  private readonly depthAxis = new THREE.Vector3()
  private readonly desiredCenter = new THREE.Vector3()
  private readonly snappedCenter = new THREE.Vector3()
  private readonly horizontalTexelSize: number
  private readonly verticalTexelSize: number

  constructor(private readonly light: THREE.DirectionalLight) {
    this.offset.copy(light.position).sub(light.target.position)
    const offsetLengthSquared = this.offset.lengthSq()
    if (!Number.isFinite(offsetLengthSquared) || offsetLengthSquared <= AXIS_EPSILON) {
      throw new Error('Directional shadow light offset must be finite and non-zero')
    }

    this.depthAxis.copy(this.offset).normalize()
    this.horizontalAxis.crossVectors(WORLD_UP, this.depthAxis)
    const horizontalLengthSquared = this.horizontalAxis.lengthSq()
    if (!Number.isFinite(horizontalLengthSquared)
      || horizontalLengthSquared <= AXIS_EPSILON) {
      throw new Error('Directional shadow light direction must not be parallel to world up')
    }
    this.horizontalAxis.normalize()
    this.verticalAxis.crossVectors(this.depthAxis, this.horizontalAxis).normalize()

    const shadowCamera = light.shadow.camera
    const horizontalSpan = requirePositiveFinite(
      shadowCamera.right - shadowCamera.left,
      'horizontal camera span',
    )
    const verticalSpan = requirePositiveFinite(
      shadowCamera.top - shadowCamera.bottom,
      'vertical camera span',
    )
    const mapWidth = requirePositiveFinite(light.shadow.mapSize.x, 'map width')
    const mapHeight = requirePositiveFinite(light.shadow.mapSize.y, 'map height')
    this.horizontalTexelSize = horizontalSpan / mapWidth
    this.verticalTexelSize = verticalSpan / mapHeight
  }

  update(targetX: number, targetZ: number): void {
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) {
      throw new Error('Directional shadow target coordinates must be finite')
    }

    this.desiredCenter.set(targetX, 0, targetZ)
    const horizontal = Math.round(
      this.desiredCenter.dot(this.horizontalAxis) / this.horizontalTexelSize,
    ) * this.horizontalTexelSize
    const vertical = Math.round(
      this.desiredCenter.dot(this.verticalAxis) / this.verticalTexelSize,
    ) * this.verticalTexelSize
    const depth = this.desiredCenter.dot(this.depthAxis)

    this.snappedCenter
      .copy(this.horizontalAxis)
      .multiplyScalar(horizontal)
      .addScaledVector(this.verticalAxis, vertical)
      .addScaledVector(this.depthAxis, depth)
    this.light.target.position.copy(this.snappedCenter)
    this.light.position.copy(this.snappedCenter).add(this.offset)
  }
}
