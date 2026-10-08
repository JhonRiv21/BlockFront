const LOOK_SENSITIVITY = 0.0022
const MAX_PITCH = Math.PI / 2 - 0.01

// Keyboard, mouse look and mouse buttons, all gated by pointer lock on the canvas.
export class InputState {
  yaw = 0
  pitch = 0
  private readonly held = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly clicked = new Set<number>()
  private readonly mouseHeld = new Set<number>()
  private wheelSteps = 0

  constructor(
    private readonly element: HTMLElement,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    element.addEventListener('click', this.onClick)
    element.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
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
    return this.held.has(code)
  }

  // True once per physical key press.
  takePressed(code: string): boolean {
    return this.pressed.delete(code)
  }

  // True once per mouse button press (0 left, 2 right).
  takeClick(button: number): boolean {
    return this.clicked.delete(button)
  }

  isMouseHeld(button: number): boolean {
    return this.mouseHeld.has(button)
  }

  // Net wheel notches since the last call: positive scrolls down.
  takeWheel(): number {
    const steps = this.wheelSteps
    this.wheelSteps = 0
    return steps
  }

  axis(negative: string, positive: string): number {
    return (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0)
  }

  dispose(): void {
    this.element.removeEventListener('click', this.onClick)
    this.element.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    if (this.locked) document.exitPointerLock()
  }

  private readonly onClick = (): void => {
    if (!this.locked) this.element.requestPointerLock()
  }

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private readonly onPointerLockChange = (): void => {
    if (!this.locked) {
      this.held.clear()
      this.pressed.clear()
      this.clicked.clear()
      this.mouseHeld.clear()
    }
    this.onLockChange(this.locked)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.yaw -= event.movementX * LOOK_SENSITIVITY
    this.pitch -= event.movementY * LOOK_SENSITIVITY
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch))
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return
    this.clicked.add(event.button)
    this.mouseHeld.add(event.button)
  }

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.mouseHeld.delete(event.button)
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.locked) return
    event.preventDefault()
    if (event.deltaY !== 0) this.wheelSteps += Math.sign(event.deltaY)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked) return
    if (!event.repeat) this.pressed.add(event.code)
    this.held.add(event.code)
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  private readonly onBlur = (): void => {
    this.held.clear()
    this.mouseHeld.clear()
  }
}
