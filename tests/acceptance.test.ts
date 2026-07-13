// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import * as acceptanceModule from '../src/debug/acceptance'

type AcceptanceConfiguration = {
  readonly debug: boolean
  readonly initialLogicalCamera?: { readonly x: number; readonly z: number }
}

const parser = (acceptanceModule as unknown as {
  parseAcceptanceConfiguration?: (search: string) => AcceptanceConfiguration
}).parseAcceptanceConfiguration

describe('debug acceptance configuration', () => {
  it('reads an exact block-aligned startup coordinate only in debug mode', () => {
    expect(parser).toBeTypeOf('function')
    expect(parser!('?debug=1&acceptanceX=6000&acceptanceZ=-6000')).toEqual({
      debug: true,
      initialLogicalCamera: { x: 6_000, z: -6_000 },
    })
  })

  it('does not enable acceptance state without the debug flag', () => {
    expect(parser!('?acceptanceX=6000&acceptanceZ=-6000')).toEqual({ debug: false })
  })

  it('ignores coordinates that are not finite whole blocks', () => {
    expect(parser!('?debug=1&acceptanceX=61&acceptanceZ=0')).toEqual({ debug: true })
    expect(parser!('?debug=1&acceptanceX=Infinity&acceptanceZ=0')).toEqual({ debug: true })
  })

  it('publishes the current debug snapshot through the DOM request bridge and cleans it up', () => {
    const installHook = (acceptanceModule as unknown as {
      installAcceptanceHook: (enabled: boolean, snapshot: () => unknown) => () => void
    }).installAcceptanceHook
    const snapshot = {
      logicalCamera: { x: 6_000, z: 0 },
      renderOrigin: { x: 6_000, z: 0 },
      localCamera: { x: 0, z: 0 },
      buildingPoolSize: 100,
      visibleAssignments: [],
      vehicleSlotCount: 20,
      activeVehicleCount: 20,
      activeDirections: ['north'],
    }
    const cleanup = installHook(true, () => snapshot)

    const bridge = document.querySelector<HTMLButtonElement>('[data-testid="acceptance-snapshot"]')
    bridge?.click()

    expect(bridge).not.toBeNull()
    expect(document.documentElement.dataset.endlessCityAcceptance).toBe(JSON.stringify(snapshot))
    cleanup()
    expect(document.documentElement.dataset.endlessCityAcceptance).toBeUndefined()
    expect(document.querySelector('[data-testid="acceptance-snapshot"]')).toBeNull()
  })
})
