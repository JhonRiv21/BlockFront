import { sweepAabb, type Aabb, type SolidTest, type Vec3 } from './sweep.ts'

export const PLAYER = {
  width: 0.6,
  height: 1.8,
  crouchHeight: 1.2,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.05,
  walkSpeed: 4.3,
  sprintSpeed: 6.5,
  crouchSpeed: 2,
  // 8.4 m/s against 28 m/s^2 peaks at ~1.26 blocks: clears one block, never two.
  jumpSpeed: 8.4,
  gravity: 28,
  maxFallSpeed: 50,
  groundAccel: 14,
  airAccel: 3,
} as const

export interface MoveInput {
  forward: number
  strafe: number
  yaw: number
  jump: boolean
  crouch: boolean
  sprint: boolean
}

// pos is the feet position (box bottom center).
export interface PlayerState {
  pos: Vec3
  vel: Vec3
  onGround: boolean
  crouching: boolean
  eyeHeight: number
}

export function createPlayer(pos: Vec3): PlayerState {
  return {
    pos: [pos[0], pos[1], pos[2]],
    vel: [0, 0, 0],
    onGround: false,
    crouching: false,
    eyeHeight: PLAYER.eyeHeight,
  }
}

function boxAt(pos: Vec3, height: number): Aabb {
  const half = PLAYER.width / 2
  return {
    min: [pos[0] - half, pos[1], pos[2] - half],
    max: [pos[0] + half, pos[1] + height, pos[2] + half],
  }
}

export function playerAabb(state: PlayerState): Aabb {
  return boxAt(state.pos, state.crouching ? PLAYER.crouchHeight : PLAYER.height)
}

export function stepPlayer(
  state: PlayerState,
  input: MoveInput,
  isSolid: SolidTest,
  dt: number,
): void {
  // Both heights fit under the same whole-block ceilings, so standing up needs no headroom check.
  state.crouching = input.crouch
  state.eyeHeight = state.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight

  const speed = state.crouching
    ? PLAYER.crouchSpeed
    : input.sprint
      ? PLAYER.sprintSpeed
      : PLAYER.walkSpeed
  const sin = Math.sin(input.yaw)
  const cos = Math.cos(input.yaw)
  // yaw 0 faces -Z, matching the renderer camera.
  let moveX = -sin * input.forward + cos * input.strafe
  let moveZ = -cos * input.forward - sin * input.strafe
  const length = Math.hypot(moveX, moveZ)
  if (length > 1) {
    moveX /= length
    moveZ /= length
  }
  const accel = state.onGround ? PLAYER.groundAccel : PLAYER.airAccel
  const blend = 1 - Math.exp(-accel * dt)
  state.vel[0] += (moveX * speed - state.vel[0]) * blend
  state.vel[2] += (moveZ * speed - state.vel[2]) * blend

  if (input.jump && state.onGround) {
    state.vel[1] = PLAYER.jumpSpeed
    state.onGround = false
  }
  state.vel[1] = Math.max(state.vel[1] - PLAYER.gravity * dt, -PLAYER.maxFallSpeed)

  const box = playerAabb(state)
  const hit = sweepAabb(isSolid, box, [state.vel[0] * dt, state.vel[1] * dt, state.vel[2] * dt])
  state.pos[0] = (box.min[0] + box.max[0]) / 2
  state.pos[1] = box.min[1]
  state.pos[2] = (box.min[2] + box.max[2]) / 2

  state.onGround = hit.y === -1
  if (hit.x !== 0) state.vel[0] = 0
  if (hit.y !== 0) state.vel[1] = 0
  if (hit.z !== 0) state.vel[2] = 0
}
