import { Euler, Vector3, type PerspectiveCamera } from 'three'

const LOOK_SENSITIVITY = 0.0022
const MAX_PITCH = Math.PI / 2 - 0.01
const BASE_SPEED = 14
const SPRINT_MULTIPLIER = 3

// Debug free-flight camera: pointer lock on click, WASD, Space/C for up/down, Shift to sprint.
export class FlyCamera {
  private readonly held = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly forward = new Vector3()
  private readonly right = new Vector3()
  private readonly velocity = new Vector3()

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    this.euler.setFromQuaternion(camera.quaternion)
    element.addEventListener('click', this.onClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element
  }

  // True once per physical key press; used for debug actions.
  takePressed(code: string): boolean {
    return this.pressed.delete(code)
  }

  update(dt: number): void {
    const speed = BASE_SPEED * (this.held.has('ShiftLeft') ? SPRINT_MULTIPLIER : 1)
    this.camera.getWorldDirection(this.forward)
    this.right.crossVectors(this.forward, this.camera.up).normalize()

    this.velocity.set(0, 0, 0)
    if (this.held.has('KeyW')) this.velocity.add(this.forward)
    if (this.held.has('KeyS')) this.velocity.sub(this.forward)
    if (this.held.has('KeyD')) this.velocity.add(this.right)
    if (this.held.has('KeyA')) this.velocity.sub(this.right)
    if (this.held.has('Space')) this.velocity.y += 1
    if (this.held.has('KeyC')) this.velocity.y -= 1
    if (this.velocity.lengthSq() === 0) return
    this.velocity.normalize().multiplyScalar(speed * dt)
    this.camera.position.add(this.velocity)
  }

  dispose(): void {
    this.element.removeEventListener('click', this.onClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    if (this.locked) document.exitPointerLock()
  }

  private readonly onClick = (): void => {
    if (!this.locked) this.element.requestPointerLock()
  }

  private readonly onPointerLockChange = (): void => {
    if (!this.locked) this.held.clear()
    this.onLockChange(this.locked)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.euler.y -= event.movementX * LOOK_SENSITIVITY
    this.euler.x -= event.movementY * LOOK_SENSITIVITY
    this.euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.euler.x))
    this.camera.quaternion.setFromEuler(this.euler)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked) return
    if (!event.repeat) this.pressed.add(event.code)
    this.held.add(event.code)
    if (event.code === 'Space') event.preventDefault()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  private readonly onBlur = (): void => {
    this.held.clear()
  }
}
