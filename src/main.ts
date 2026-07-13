import { startApp } from './app'

const canvas = document.querySelector<HTMLCanvasElement>('#city-canvas')
const loading = document.querySelector<HTMLElement>('.load')
const loadingProgress = loading?.querySelector<HTMLElement>('p')

if (canvas === null) throw new Error('Missing #city-canvas')

void startApp({ canvas, loading, loadingProgress }).catch((error: unknown) => {
  console.error(error)
  if (loadingProgress !== null && loadingProgress !== undefined) {
    loadingProgress.textContent = 'Unable to load city'
  }
})
