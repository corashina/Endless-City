export interface OverlayOptions {
  readonly debug?: boolean
  readonly retry?: () => void
  readonly autoDismissMs?: number
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
  private readonly helpButton: HTMLButtonElement
  private readonly helpPanel: HTMLElement
  private readonly statisticsToggle: HTMLInputElement
  private readonly fpsOutput: HTMLOutputElement
  private readonly blockingOverlay: HTMLElement
  private readonly loadingStatus: HTMLElement
  private readonly errorPanel: HTMLElement
  private readonly errorMessage: HTMLElement
  private readonly retryButton: HTMLButtonElement
  private readonly debug: boolean
  private readonly retry: () => void
  private readonly autoDismissTimer: ReturnType<typeof setTimeout>
  private helpHovered = false
  private dismissPending = false
  private sampleStart: number | undefined
  private sampleFrames = 0
  private disposed = false

  constructor(private readonly root: HTMLElement, options: OverlayOptions = {}) {
    this.helpButton = requiredElement(root, '#help-toggle')
    this.helpPanel = requiredElement(root, '#help-panel')
    this.statisticsToggle = requiredElement(root, '#statistics-toggle')
    this.fpsOutput = requiredElement(root, '#fps-output')
    this.blockingOverlay = requiredElement(root, '#blocking-overlay')
    this.loadingStatus = requiredElement(root, '#loading-status')
    this.errorPanel = requiredElement(root, '#error-panel')
    this.errorMessage = requiredElement(root, '#error-message')
    this.retryButton = requiredElement(root, '#retry-button')
    this.debug = options.debug ?? false
    this.retry = options.retry ?? (() => window.location.reload())

    this.helpButton.addEventListener('click', this.toggleHelp)
    this.helpButton.addEventListener('focus', this.enterHelp)
    this.helpButton.addEventListener('blur', this.leaveHelp)
    this.helpPanel.addEventListener('mouseenter', this.enterHelp)
    this.helpPanel.addEventListener('mouseleave', this.leaveHelp)
    this.helpPanel.addEventListener('focusin', this.enterHelp)
    this.helpPanel.addEventListener('focusout', this.leaveHelp)
    this.statisticsToggle.addEventListener('change', this.updateDiagnosticsVisibility)
    this.retryButton.addEventListener('click', this.retry)

    this.updateDiagnosticsVisibility()
    this.autoDismissTimer = setTimeout(
      this.autoDismissHelp,
      options.autoDismissMs ?? 6_000,
    )
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

  updateFps(timestamp: number): void {
    if (this.sampleStart === undefined) {
      this.sampleStart = timestamp
      this.sampleFrames = 0
      return
    }

    this.sampleFrames += 1
    const elapsed = timestamp - this.sampleStart
    if (elapsed < 1_000) return

    this.fpsOutput.textContent = `${Math.round(this.sampleFrames * 1_000 / elapsed)} FPS`
    this.sampleStart = timestamp
    this.sampleFrames = 0
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.autoDismissTimer)
    this.helpButton.removeEventListener('click', this.toggleHelp)
    this.helpButton.removeEventListener('focus', this.enterHelp)
    this.helpButton.removeEventListener('blur', this.leaveHelp)
    this.helpPanel.removeEventListener('mouseenter', this.enterHelp)
    this.helpPanel.removeEventListener('mouseleave', this.leaveHelp)
    this.helpPanel.removeEventListener('focusin', this.enterHelp)
    this.helpPanel.removeEventListener('focusout', this.leaveHelp)
    this.statisticsToggle.removeEventListener('change', this.updateDiagnosticsVisibility)
    this.retryButton.removeEventListener('click', this.retry)
  }

  private readonly setHelpOpen = (open: boolean): void => {
    this.helpPanel.hidden = !open
    this.helpButton.setAttribute('aria-expanded', String(open))
  }

  private readonly toggleHelp = (): void => {
    this.setHelpOpen(this.helpButton.getAttribute('aria-expanded') !== 'true')
  }

  private readonly enterHelp = (): void => {
    this.helpHovered = true
  }

  private readonly leaveHelp = (): void => {
    this.helpHovered = this.helpPanel.matches(':hover')
      || this.helpPanel.contains(document.activeElement)
      || this.helpButton === document.activeElement
    if (this.dismissPending && !this.helpHovered) this.setHelpOpen(false)
  }

  private readonly autoDismissHelp = (): void => {
    if (
      this.helpHovered
      || this.helpPanel.contains(document.activeElement)
      || this.helpButton === document.activeElement
    ) {
      this.dismissPending = true
      return
    }
    this.setHelpOpen(false)
  }

  private readonly updateDiagnosticsVisibility = (): void => {
    this.fpsOutput.hidden = !(this.debug || this.statisticsToggle.checked)
  }
}
