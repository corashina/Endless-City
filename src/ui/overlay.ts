export interface OverlayOptions {
  readonly retry?: () => void
}

const requiredElement = <ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType => {
  const element = root.querySelector<ElementType>(selector)
  if (element === null) throw new Error(`Missing overlay element: ${selector}`)
  return element
}

const errorText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== '') return error.message
  if (typeof error === 'string' && error.trim() !== '') return error
  return 'The city could not be loaded.'
}

export class OverlayController {
  private readonly blockingOverlay: HTMLElement
  private readonly loadingStatus: HTMLElement
  private readonly errorPanel: HTMLElement
  private readonly errorMessage: HTMLElement
  private readonly retryButton: HTMLButtonElement
  private readonly retry: () => void
  private disposed = false

  constructor(private readonly root: HTMLElement, options: OverlayOptions = {}) {
    this.blockingOverlay = requiredElement(root, '#blocking-overlay')
    this.loadingStatus = requiredElement(root, '#loading-status')
    this.errorPanel = requiredElement(root, '#error-panel')
    this.errorMessage = requiredElement(root, '#error-message')
    this.retryButton = requiredElement(root, '#retry-button')
    this.retry = options.retry ?? (() => window.location.reload())
    this.retryButton.addEventListener('click', this.retry)
  }

  showLoading(loaded: number, total: number): void {
    this.loadingStatus.textContent = `Loading city ${loaded}/${total}`
    this.loadingStatus.hidden = false
    this.errorPanel.hidden = true
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'loading'
  }

  showReady(): void {
    this.blockingOverlay.hidden = true
    this.root.dataset.state = 'ready'
  }

  showError(error: unknown): void {
    this.errorMessage.textContent = errorText(error)
    this.loadingStatus.hidden = true
    this.errorPanel.hidden = false
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'error'
    this.retryButton.focus()
  }

  showContextLost(): void {
    this.loadingStatus.textContent = 'Restoring the city…'
    this.loadingStatus.hidden = false
    this.errorPanel.hidden = true
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'restoring'
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.retryButton.removeEventListener('click', this.retry)
  }
}
