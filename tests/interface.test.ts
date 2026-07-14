import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('scene-only document', () => {
  it('keeps only the canvas and exceptional status controls', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('id="city-canvas"')
    expect(html).toContain('id="blocking-overlay"')
    expect(html).toContain('id="loading-status"')
    expect(html).toContain('id="error-panel"')
    expect(html).toContain('id="retry-button"')
    expect(html).not.toMatch(/id="(?:help-toggle|help-panel|statistics-toggle|fps-output)"/)
    expect(html).not.toMatch(/<header\b|<aside\b|<output\b/)
  })
})
