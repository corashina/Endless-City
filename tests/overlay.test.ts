// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayController } from '../src/ui/overlay'

function createFixture(): HTMLElement {
  document.body.innerHTML = `
    <div id="city-interface">
      <header class="city-header">
        <h1>Endless City</h1>
        <button id="help-toggle" type="button" aria-controls="help-panel" aria-expanded="true">How to explore</button>
      </header>
      <aside id="help-panel">
        <label><input id="statistics-toggle" type="checkbox"> Show performance statistics</label>
      </aside>
      <output id="fps-output" hidden></output>
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
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('OverlayController', () => {
  it('updates loading progress and removes the blocking overlay when ready', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showLoading(8, 17)
    expect(root.querySelector('#loading-status')?.textContent).toBe('Loading city 8/17')

    overlay.showReady()
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(true)
  })

  it('opens and closes help while keeping aria-expanded synchronized', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)
    const button = root.querySelector<HTMLButtonElement>('#help-toggle')!
    const panel = root.querySelector<HTMLElement>('#help-panel')!

    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)

    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)

    overlay.dispose()
  })

  it('keeps diagnostics hidden until statistics are enabled', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)
    const checkbox = root.querySelector<HTMLInputElement>('#statistics-toggle')!
    const output = root.querySelector<HTMLOutputElement>('#fps-output')!

    expect(output.hidden).toBe(true)
    checkbox.click()
    expect(output.hidden).toBe(false)

    overlay.updateFps(0)
    overlay.updateFps(500)
    overlay.updateFps(1_000)
    expect(output.textContent).toBe('2 FPS')
  })

  it('shows a readable error and retries through the supplied action', () => {
    const root = createFixture()
    const retry = vi.fn()
    const overlay = new OverlayController(root, { retry })

    overlay.showError(new Error('Road models could not be loaded.'))

    expect(root.querySelector('#error-message')?.textContent)
      .toBe('Road models could not be loaded.')
    expect(root.querySelector<HTMLElement>('#error-panel')?.hidden).toBe(false)
    root.querySelector<HTMLButtonElement>('#retry-button')?.click()
    expect(retry).toHaveBeenCalledOnce()
  })

  it('shows a restoration status after the WebGL context is lost', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showContextLost()

    expect(root.querySelector('#loading-status')?.textContent).toBe('Restoring the city…')
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(false)
  })

  it('auto-dismisses initial help after six seconds unless it is hovered', () => {
    vi.useFakeTimers()
    const root = createFixture()
    const overlay = new OverlayController(root)
    const panel = root.querySelector<HTMLElement>('#help-panel')!

    panel.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(6_000)
    expect(panel.hidden).toBe(false)

    panel.dispatchEvent(new MouseEvent('mouseleave'))
    expect(panel.hidden).toBe(true)
    overlay.dispose()
  })

  it('defers auto-dismiss while the help control has keyboard focus', () => {
    vi.useFakeTimers()
    const root = createFixture()
    const overlay = new OverlayController(root)
    const button = root.querySelector<HTMLButtonElement>('#help-toggle')!
    const panel = root.querySelector<HTMLElement>('#help-panel')!

    button.focus()
    vi.advanceTimersByTime(6_000)
    expect(panel.hidden).toBe(false)

    button.blur()
    expect(panel.hidden).toBe(true)
    overlay.dispose()
  })

  it('shows diagnostics immediately in debug mode', () => {
    const root = createFixture()
    const overlay = new OverlayController(root, { debug: true })

    expect(root.querySelector<HTMLOutputElement>('#fps-output')?.hidden).toBe(false)
    overlay.dispose()
  })
})
