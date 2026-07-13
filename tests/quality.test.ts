import { describe, expect, it } from 'vitest'
import { chooseQualityProfile } from '../src/rendering/quality'

describe('chooseQualityProfile', () => {
  it('selects the high profile for a wide standard-density viewport', () => {
    expect(chooseQualityProfile({ width: 1440, devicePixelRatio: 1 })).toMatchObject({
      id: 'high',
      tileDiameter: 9,
      trafficCount: 49,
      maxPixelRatio: 1.5,
      shadowMapSize: 2048,
    })
  })

  it('selects the balanced profile for a medium viewport', () => {
    expect(chooseQualityProfile({ width: 900, devicePixelRatio: 2 })).toMatchObject({
      id: 'balanced',
      tileDiameter: 7,
      trafficCount: 32,
      maxPixelRatio: 1.25,
      shadowMapSize: 1024,
    })
  })

  it('selects the mobile profile below 768 CSS pixels', () => {
    expect(chooseQualityProfile({ width: 390, devicePixelRatio: 3 })).toMatchObject({
      id: 'mobile',
      tileDiameter: 7,
      trafficCount: 20,
      maxPixelRatio: 1,
      shadowMapSize: 1024,
    })
  })

  it('uses balanced for wide devices above two times pixel density', () => {
    expect(chooseQualityProfile({ width: 1440, devicePixelRatio: 2.01 }).id).toBe('balanced')
  })
})
