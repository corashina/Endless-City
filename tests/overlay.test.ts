// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayController } from '../src/ui/overlay'

function createFixture(): HTMLElement {
  document.body.innerHTML = `
    <div id="city-interface" data-state="loading">
      <section id="blocking-overlay">
        <p id="loading-status" role="status"></p>
        <div id="error-panel" hidden>
          <p id="error-message"></p>
          <button id="retry-button" type="button">Retry</button>
        </div>
      </section>
    </div>`
  return document.querySelector<HTMLElement>('#city-interface')!
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('OverlayController', () => {
  it('updates loading progress and hides the blocking overlay when ready', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showLoading(8, 17)
    expect(root.querySelector('#loading-status')?.textContent).toBe('Loading city 8/17')
    expect(root.dataset.state).toBe('loading')

    overlay.showReady()
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(true)
    expect(root.dataset.state).toBe('ready')
  })

  it('shows a readable error and retries through the supplied action', () => {
    const root = createFixture()
    const retry = vi.fn()
    const overlay = new OverlayController(root, { retry })

    overlay.showError(new Error('Road models could not be loaded.'))

    expect(root.querySelector('#error-message')?.textContent)
      .toBe('Road models could not be loaded.')
    expect(root.querySelector<HTMLElement>('#error-panel')?.hidden).toBe(false)
    expect(root.dataset.state).toBe('error')
    root.querySelector<HTMLButtonElement>('#retry-button')?.click()
    expect(retry).toHaveBeenCalledOnce()
  })

  it('falls back to a generic error message', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showError('   ')

    expect(root.querySelector('#error-message')?.textContent)
      .toBe('The city could not be loaded.')
  })

  it('shows restoration status after WebGL context loss', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showContextLost()

    expect(root.querySelector('#loading-status')?.textContent).toBe('Restoring the city…')
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(false)
    expect(root.dataset.state).toBe('restoring')
  })

  it('removes the retry listener exactly once', () => {
    const root = createFixture()
    const retry = vi.fn()
    const overlay = new OverlayController(root, { retry })

    overlay.dispose()
    overlay.dispose()
    root.querySelector<HTMLButtonElement>('#retry-button')?.click()

    expect(retry).not.toHaveBeenCalled()
  })
})
