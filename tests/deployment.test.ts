import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import viteConfig from '../vite.config'

describe('GitHub Pages deployment', () => {
  it('builds URLs below the Endless-City project path', () => {
    expect(viteConfig).toMatchObject({
      base: '/Endless-City/',
      publicDir: 'js',
    })
  })

  it('emits production entry assets below the Endless-City project path', async () => {
    const result = await build({ build: { write: false } })
    const outputs = (Array.isArray(result) ? result : [result])
      .flatMap((buildResult) => 'output' in buildResult ? buildResult.output : [])
    const indexHtml = outputs.find(({ fileName }) => fileName === 'index.html')

    expect(indexHtml?.type).toBe('asset')
    if (indexHtml?.type !== 'asset') return

    const html = String(indexHtml.source)
    expect(html).toMatch(/src="\/Endless-City\/assets\/[^"/]+\.js"/)
    expect(html).toMatch(/href="\/Endless-City\/assets\/[^"/]+\.css"/)
    expect(html).toMatch(/href="\/Endless-City\/assets\/[^"/]+\.ico"/)
    expect(html).not.toContain('src="/src/main.ts"')
    expect(html).not.toContain('href="/style.css"')
  })

  it('builds and publishes the Vite distribution through GitHub Actions', () => {
    const workflowPath = resolve(process.cwd(), '.github', 'workflows', 'deploy.yml')

    expect(existsSync(workflowPath)).toBe(true)
    if (!existsSync(workflowPath)) return

    const workflow = readFileSync(workflowPath, 'utf8')
    expect(workflow).toContain("branches: ['master']")
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('pages: write')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('actions/checkout@v7')
    expect(workflow).toContain('bun run test tests/deployment.test.ts tests/assets.test.ts')
    expect(workflow).toContain('bun run build')
    expect(workflow).toContain('actions/configure-pages@v6')
    expect(workflow).toContain('actions/upload-pages-artifact@v5')
    expect(workflow).toContain("path: './dist'")
    expect(workflow).toContain('actions/deploy-pages@v5')
  })
})
