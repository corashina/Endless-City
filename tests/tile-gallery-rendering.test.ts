// @vitest-environment jsdom

import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rendererFactory: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  loadAsync: vi.fn(),
  drawImage: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof THREE>()
  return {
    ...original,
    WebGLRenderer: vi.fn(function WebGLRenderer(
      options: { canvas: HTMLCanvasElement },
    ) {
      mocks.rendererFactory(options.canvas)
      return {
        domElement: options.canvas,
        outputColorSpace: original.LinearSRGBColorSpace,
        shadowMap: { enabled: false, type: original.BasicShadowMap },
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        render: mocks.render,
        dispose: mocks.dispose,
      }
    }),
  }
})

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string) {
      return mocks.loadAsync(url)
    }
  },
}))

describe('remix tile gallery rendering', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = '<main id="gallery"></main>'
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: mocks.drawImage,
    } as unknown as CanvasRenderingContext2D)
    mocks.loadAsync.mockImplementation(async (url: string) => {
      if (url.endsWith('remix-commercial-market.glb')) {
        throw new Error('fixture load failure')
      }
      return { scene: new THREE.Group() }
    })
  })

  it('reuses one renderer for 12 card canvases and keeps item errors local', async () => {
    await import('../tools/tiles/gallery')

    await vi.waitFor(() => {
      expect(document.querySelectorAll('#gallery article')).toHaveLength(12)
      expect(document.querySelectorAll('#gallery canvas')).toHaveLength(12)
      expect(document.querySelectorAll('#gallery article[data-state="error"]')).toHaveLength(1)
    })

    expect(mocks.rendererFactory).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-state="error"] p')?.textContent)
      .toBe('fixture load failure')
    expect(mocks.render).toHaveBeenCalledTimes(11)
    expect(mocks.drawImage).toHaveBeenCalledTimes(11)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
  })
})
