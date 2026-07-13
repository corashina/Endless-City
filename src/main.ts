import { startApp } from './app'
import { OverlayController } from './ui/overlay'
import { parseAcceptanceConfiguration } from './debug/acceptance'

const canvas = document.querySelector<HTMLCanvasElement>('#city-canvas')
const interfaceRoot = document.querySelector<HTMLElement>('#city-interface')

if (canvas === null) throw new Error('Missing #city-canvas')
if (interfaceRoot === null) throw new Error('Missing #city-interface')

const acceptance = parseAcceptanceConfiguration(window.location.search)

const overlay = new OverlayController(interfaceRoot, {
  debug: acceptance.debug,
  retry: () => window.location.reload(),
})

void startApp({
  canvas,
  overlay,
  acceptance,
  onError: (error) => console.error(error),
}).catch(() => undefined)
