import { Euler, Vector3, type PerspectiveCamera } from 'three'
import type { InputState } from './input-state.ts'

const BASE_SPEED = 14
const SPRINT_MULTIPLIER = 3

// Debug free flight: WASD along the view direction, Space/C up and down, Shift to sprint.
export class FlyCamera {
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly forward = new Vector3()
  private readonly right = new Vector3()
  private readonly velocity = new Vector3()

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
  ) {}

  update(dt: number): void {
    this.euler.set(this.input.pitch, this.input.yaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)

    const speed = BASE_SPEED * (this.input.isHeld('ShiftLeft') ? SPRINT_MULTIPLIER : 1)
    this.camera.getWorldDirection(this.forward)
    this.right.crossVectors(this.forward, this.camera.up).normalize()

    this.velocity.set(0, 0, 0)
    this.velocity.addScaledVector(this.forward, this.input.axis('KeyS', 'KeyW'))
    this.velocity.addScaledVector(this.right, this.input.axis('KeyA', 'KeyD'))
    this.velocity.y += this.input.axis('KeyC', 'Space')
    if (this.velocity.lengthSq() === 0) return
    this.velocity.normalize().multiplyScalar(speed * dt)
    this.camera.position.add(this.velocity)
  }
}
