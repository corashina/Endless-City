import { startApp } from './app'
import { OverlayController } from './ui/overlay'

const canvas = document.querySelector<HTMLCanvasElement>('#city-canvas')
const interfaceRoot = document.querySelector<HTMLElement>('#city-interface')

if (canvas === null) throw new Error('Missing #city-canvas')
if (interfaceRoot === null) throw new Error('Missing #city-interface')

const overlay = new OverlayController(interfaceRoot, {
  debug: new URLSearchParams(window.location.search).get('debug') === '1',
  retry: () => window.location.reload(),
})

void startApp({
  canvas,
  overlay,
  onError: (error) => console.error(error),
}).catch(() => undefined)
