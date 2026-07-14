export type QualityProfileId = 'high' | 'balanced' | 'mobile'

export interface QualityProfile {
  readonly id: QualityProfileId
  readonly tileDiameter: 9 | 7
  readonly trafficCount: 72 | 48 | 28
  readonly maxPixelRatio: 1.5 | 1.25 | 1
  readonly shadowMapSize: 2048 | 1024
}

export interface QualityProfileInput {
  readonly width: number
  readonly devicePixelRatio: number
}

const HIGH = Object.freeze({
  id: 'high',
  tileDiameter: 9,
  trafficCount: 72,
  maxPixelRatio: 1.5,
  shadowMapSize: 2048,
} as const satisfies QualityProfile)

const BALANCED = Object.freeze({
  id: 'balanced',
  tileDiameter: 7,
  trafficCount: 48,
  maxPixelRatio: 1.25,
  shadowMapSize: 1024,
} as const satisfies QualityProfile)

const MOBILE = Object.freeze({
  id: 'mobile',
  tileDiameter: 7,
  trafficCount: 28,
  maxPixelRatio: 1,
  shadowMapSize: 1024,
} as const satisfies QualityProfile)

export function chooseQualityProfile(input: QualityProfileInput): QualityProfile {
  if (input.width < 768) return MOBILE
  if (input.width < 1200 || input.devicePixelRatio > 2) return BALANCED
  return HIGH
}
