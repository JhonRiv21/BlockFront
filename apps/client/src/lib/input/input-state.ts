import { Latch } from './latch.ts'

const LOOK_SENSITIVITY = 0.0022
const MAX_PITCH = Math.PI / 2 - 0.01
// Chrome refuses a new lock for about 1.25 s after Esc released the previous one.
const LOCK_COOLDOWN_MS = 1300
// Mouse events bigger than this (px) are glitches, not flicks: driver hiccups, tab switches.
const FLICK_CLAMP = 300

export type LockFailure = 'rejected'

// Keyboard, mouse look and mouse buttons, all gated by pointer lock on the canvas. Presses are
// latched so a tap shorter than a sim tick is still delivered (see Latch).
export class InputState {
  yaw = 0
  pitch = 0
  // Multiplier on the mouse sensitivity (ADS lowers it with the zoom).
  lookScale = 1
  onLockFailure: (reason: LockFailure) => void = () => {}
  private readonly keys = new Latch()
  private readonly buttons = new Latch()
  private mouseDx = 0
  private mouseDy = 0
  private wheelSteps = 0
  private unlockedAt = -Infinity
  private requesting = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly element: HTMLElement,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    element.addEventListener('click', this.onClick)
    element.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('pointerlockerror', this.onPointerLockError)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element
  }

  isHeld(code: string): boolean {
    return this.keys.isHeld(code)
  }

  // True once per physical key press.
  takePressed(code: string): boolean {
    return this.keys.takePressed(code)
  }

  // True once per mouse button press (0 left, 2 right).
  takeClick(button: number): boolean {
    return this.buttons.takePressed(String(button))
  }

  isMouseHeld(button: number): boolean {
    return this.buttons.isHeld(String(button))
  }

  // The input for one sim tick has been built: taps shorter than a tick have been delivered.
  endTick(): void {
    this.keys.endTick()
    this.buttons.endTick()
  }

  // Mouse movement in px since the last call, for the weapon sway.
  takeMouseDelta(): [number, number] {
    const delta: [number, number] = [this.mouseDx, this.mouseDy]
    this.mouseDx = 0
    this.mouseDy = 0
    return delta
  }

  // Net wheel notches since the last call: positive scrolls down.
  takeWheel(): number {
    const steps = this.wheelSteps
    this.wheelSteps = 0
    return steps
  }

  axis(negative: string, positive: string): number {
    return (this.keys.isHeld(positive) ? 1 : 0) - (this.keys.isHeld(negative) ? 1 : 0)
  }

  // Ask for the lock with raw mouse deltas; fall back to the plain request where the option is
  // not supported. A click too soon after Esc is retried by itself once the browser's cooldown
  // has passed (the click's activation still counts); only a refusal after that is reported.
  requestLock(retry = true): void {
    if (this.locked || this.requesting) return
    const sinceUnlock = performance.now() - this.unlockedAt
    if (sinceUnlock < LOCK_COOLDOWN_MS) {
      this.scheduleRetry(LOCK_COOLDOWN_MS - sinceUnlock)
      return
    }
    this.requesting = true
    const plain = () => this.element.requestPointerLock()
    const withRaw = () => this.element.requestPointerLock({ unadjustedMovement: true })
    Promise.resolve()
      .then(withRaw)
      .catch(plain)
      .catch(() => {
        if (retry) this.scheduleRetry(LOCK_COOLDOWN_MS)
        else this.onLockFailure('rejected')
      })
      .finally(() => {
        this.requesting = false
      })
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.requestLock(false)
    }, delayMs + 20)
  }

  releaseLock(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer)
    this.retryTimer = null
    if (this.locked) document.exitPointerLock()
  }

  dispose(): void {
    this.element.removeEventListener('click', this.onClick)
    this.element.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('pointerlockerror', this.onPointerLockError)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.releaseLock()
  }

  private readonly onClick = (): void => {
    this.requestLock()
  }

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private readonly onPointerLockChange = (): void => {
    if (!this.locked) {
      this.unlockedAt = performance.now()
      this.keys.clear()
      this.buttons.clear()
    }
    this.onLockChange(this.locked)
  }

  private readonly onPointerLockError = (): void => {
    this.onLockFailure('rejected')
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    const dx = Math.max(-FLICK_CLAMP, Math.min(FLICK_CLAMP, event.movementX))
    const dy = Math.max(-FLICK_CLAMP, Math.min(FLICK_CLAMP, event.movementY))
    this.yaw -= dx * LOOK_SENSITIVITY * this.lookScale
    this.pitch -= dy * LOOK_SENSITIVITY * this.lookScale
    this.mouseDx += dx
    this.mouseDy += dy
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch))
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return
    this.buttons.press(String(event.button))
  }

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.buttons.release(String(event.button))
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.locked) return
    event.preventDefault()
    if (event.deltaY !== 0) this.wheelSteps += Math.sign(event.deltaY)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked) return
    if (!event.repeat) this.keys.press(event.code)
    if (event.code === 'Space' || event.code === 'Tab' || event.code === 'F3')
      event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.release(event.code)
  }

  private readonly onBlur = (): void => {
    this.keys.clear()
    this.buttons.clear()
  }
}
