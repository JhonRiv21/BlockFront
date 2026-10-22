import { sweepAabb, type Aabb, type SolidTest, type Vec3 } from './sweep.ts'
import { FALL } from './fall.ts'
import { pointInWater, submergedRatio, type LiquidTest } from './water.ts'

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
  // Swimming (Minecraft figures are per 20 Hz tick; converted with the dt at use).
  swimSpeedSurface: 2.2,
  swimSpeedSubmerged: 2.0,
  // Sprint-swimming (Minecraft 1.13): hold sprint and forward to glide along the look direction.
  swimSprintSpeed: 5.6,
  swimSprintAccel: 10,
  // Body share under water a surface swimmer settles at, and how hard it is held there.
  swimSurfaceDepth: 0.62,
  swimSurfaceGain: 4,
  waterDrag: 0.8,
  waterGravity: 2.8,
  swimUpAccel: 6.4,
  crouchSinkAccel: 2.5,
  waterExitSpeed: 6,
  waterAccel: 8,
} as const

export interface MoveInput {
  forward: number
  strafe: number
  yaw: number
  // Look pitch, used only to steer sprint-swimming (0 when absent).
  pitch?: number
  jump: boolean
  crouch: boolean
  sprint: boolean
  // Weapon weight and aiming (1 = normal).
  speedMultiplier?: number
}

// pos is the feet position (box bottom center).
export interface PlayerState {
  pos: Vec3
  vel: Vec3
  onGround: boolean
  crouching: boolean
  eyeHeight: number
  inWater: boolean
  submerged: number
  eyeInWater: boolean
  // Highest point since the feet left the ground, and the height of the fall on the tick the
  // player lands (0 on every other tick). Water resets both.
  peakY: number
  landedFrom: number
}

export function createPlayer(pos: Vec3): PlayerState {
  return {
    pos: [pos[0], pos[1], pos[2]],
    vel: [0, 0, 0],
    onGround: false,
    crouching: false,
    eyeHeight: PLAYER.eyeHeight,
    inWater: false,
    submerged: 0,
    eyeInWater: false,
    peakY: pos[1],
    landedFrom: 0,
  }
}

function boxAt(pos: Vec3, height: number): Aabb {
  const half = PLAYER.width / 2
  return {
    min: [pos[0] - half, pos[1], pos[2] - half],
    max: [pos[0] + half, pos[1] + height, pos[2] + half],
  }
}

function overlapsSolid(isSolid: SolidTest, box: Aabb): boolean {
  for (let x = Math.floor(box.min[0]); x < Math.ceil(box.max[0]); x++)
    for (let y = Math.floor(box.min[1]); y < Math.ceil(box.max[1]); y++)
      for (let z = Math.floor(box.min[2]); z < Math.ceil(box.max[2]); z++)
        if (isSolid(x, y, z)) return true
  return false
}

export function playerAabb(state: PlayerState): Aabb {
  return boxAt(state.pos, state.crouching ? PLAYER.crouchHeight : PLAYER.height)
}

const NO_LIQUID: LiquidTest = () => false

export function stepPlayer(
  state: PlayerState,
  input: MoveInput,
  isSolid: SolidTest,
  dt: number,
  isLiquid: LiquidTest = NO_LIQUID,
): void {
  // Both heights fit under the same whole-block ceilings, so standing up needs no headroom check.
  state.crouching = input.crouch
  state.eyeHeight = state.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight

  state.submerged = submergedRatio(playerAabb(state), isLiquid)
  state.inWater = state.submerged > 0.1
  state.landedFrom = 0
  if (state.inWater) {
    swim(state, input, isSolid, isLiquid, dt)
    // Touching water forgives the fall.
    state.peakY = state.pos[1]
    return
  }

  const speed =
    (state.crouching ? PLAYER.crouchSpeed : input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) *
    (input.speedMultiplier ?? 1)
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
  const wasOnGround = state.onGround
  if (!wasOnGround) state.peakY = Math.max(state.peakY, state.pos[1])
  else state.peakY = state.pos[1]
  let dx = state.vel[0] * dt
  let dz = state.vel[2] * dt
  // Sneaking: the box may not leave an edge with a drop of more than half a block. Each axis is
  // trimmed on its own, like Minecraft.
  if (state.crouching && wasOnGround) {
    dx = sneakClamp(isSolid, box, dx, 0)
    dz = sneakClamp(isSolid, box, 0, dz)
  }
  const hit = sweepAabb(isSolid, box, [dx, state.vel[1] * dt, dz])
  // Safety net: if anything ever left the box inside a block, lift it to the first free spot.
  for (let lift = 0; lift < 3 && overlapsSolid(isSolid, box); lift++) {
    box.min[1] = Math.floor(box.min[1]) + 1
    box.max[1] = box.min[1] + (state.crouching ? PLAYER.crouchHeight : PLAYER.height)
    state.vel[1] = Math.max(0, state.vel[1])
  }
  state.pos[0] = (box.min[0] + box.max[0]) / 2
  state.pos[1] = box.min[1]
  state.pos[2] = (box.min[2] + box.max[2]) / 2

  state.onGround = hit.y === -1
  if (hit.x !== 0) state.vel[0] = 0
  if (hit.y !== 0) state.vel[1] = 0
  if (hit.z !== 0) state.vel[2] = 0
  if (state.onGround && !wasOnGround) {
    state.landedFrom = Math.max(0, state.peakY - state.pos[1])
    if (state.landedFrom > FALL.hardBlocks) {
      state.vel[0] *= 0.5
      state.vel[2] *= 0.5
    }
    state.peakY = state.pos[1]
  }
  state.eyeInWater = pointInWater(
    state.pos[0],
    state.pos[1] + state.eyeHeight,
    state.pos[2],
    isLiquid,
  )
}

const SNEAK_DROP = 0.5
const SNEAK_STEP = 0.05

// Shrinks a horizontal move until the box, dropped by half a block, still rests on something.
function sneakClamp(isSolid: SolidTest, box: Aabb, dx: number, dz: number): number {
  const move = dx !== 0 ? dx : dz
  if (move === 0) return 0
  const probe: Aabb = { min: [0, 0, 0], max: [0, 0, 0] }
  let amount = move
  for (;;) {
    const ox = dx !== 0 ? amount : 0
    const oz = dz !== 0 ? amount : 0
    probe.min[0] = box.min[0] + ox
    probe.max[0] = box.max[0] + ox
    probe.min[2] = box.min[2] + oz
    probe.max[2] = box.max[2] + oz
    probe.min[1] = box.min[1] - SNEAK_DROP
    probe.max[1] = box.min[1]
    if (overlapsSolid(isSolid, probe)) return amount
    if (Math.abs(amount) <= SNEAK_STEP) return 0
    amount -= Math.sign(amount) * SNEAK_STEP
  }
}

// Water: heavy drag, a tenth of the gravity, jump to rise (only while the head is wet, so the
// player bobs at the surface), crouch to sink, and a hop out when pushing against a bank.
function swim(
  state: PlayerState,
  input: MoveInput,
  isSolid: SolidTest,
  isLiquid: LiquidTest,
  dt: number,
): void {
  const sin = Math.sin(input.yaw)
  const cos = Math.cos(input.yaw)
  let moveX = -sin * input.forward + cos * input.strafe
  let moveZ = -cos * input.forward - sin * input.strafe
  const length = Math.hypot(moveX, moveZ)
  if (length > 1) {
    moveX /= length
    moveZ /= length
  }
  // Sprint-swimming: sprint + forward with the body mostly under water. The player glides
  // along the look direction, so looking down dives and looking up surfaces; at the surface a
  // level gaze holds the line instead of sinking.
  const swimming = input.sprint && input.forward > 0 && state.submerged >= 0.5
  if (swimming) {
    const pitch = input.pitch ?? 0
    const cosPitch = Math.cos(pitch)
    const blend = 1 - Math.exp(-PLAYER.swimSprintAccel * dt)
    const targetX = moveX * cosPitch * PLAYER.swimSprintSpeed
    const targetZ = moveZ * cosPitch * PLAYER.swimSprintSpeed
    let targetY = Math.sin(pitch) * PLAYER.swimSprintSpeed * Math.min(1, length)
    if (input.jump) targetY = Math.max(targetY, PLAYER.swimSprintSpeed * 0.5)
    else if (input.crouch) targetY = Math.min(targetY, -PLAYER.swimSprintSpeed * 0.5)
    else if (pitch > -0.2 && state.submerged < 0.98)
      targetY = Math.max(
        targetY,
        (state.submerged - PLAYER.swimSurfaceDepth) * PLAYER.swimSurfaceGain,
      )
    state.vel[0] += (targetX - state.vel[0]) * blend
    state.vel[2] += (targetZ - state.vel[2]) * blend
    state.vel[1] += (targetY - state.vel[1]) * blend
  } else {
    const speed = state.submerged > 0.9 ? PLAYER.swimSpeedSubmerged : PLAYER.swimSpeedSurface
    const blend = 1 - Math.exp(-PLAYER.waterAccel * dt)
    state.vel[0] += (moveX * speed - state.vel[0]) * blend
    state.vel[2] += (moveZ * speed - state.vel[2]) * blend

    state.vel[1] -= PLAYER.waterGravity * dt
    // Holding jump keeps lifting; once the box leaves the water, land gravity brings it back,
    // which is the bobbing at the surface.
    if (input.jump) state.vel[1] += PLAYER.swimUpAccel * dt * 2
    if (input.crouch) state.vel[1] -= PLAYER.crouchSinkAccel * dt
  }
  // Drag scaled by how much of the body is under water (1 - (1 - ratio)^2); the sprint swim
  // already blends toward its target speed.
  if (!swimming) {
    const dragScale = 1 - (1 - state.submerged) * (1 - state.submerged)
    const drag = Math.pow(PLAYER.waterDrag, dt * 20 * dragScale)
    state.vel[1] *= drag
  }

  const box = playerAabb(state)
  const hit = sweepAabb(isSolid, box, [state.vel[0] * dt, state.vel[1] * dt, state.vel[2] * dt])
  state.pos[0] = (box.min[0] + box.max[0]) / 2
  state.pos[1] = box.min[1]
  state.pos[2] = (box.min[2] + box.max[2]) / 2
  state.onGround = hit.y === -1

  const pushing = (hit.x !== 0 || hit.z !== 0) && (input.forward !== 0 || input.strafe !== 0)
  if (pushing) {
    const lifted: Aabb = {
      min: [box.min[0] + moveX * 0.3, box.min[1] + 0.6, box.min[2] + moveZ * 0.3],
      max: [box.max[0] + moveX * 0.3, box.max[1] + 0.6, box.max[2] + moveZ * 0.3],
    }
    if (!overlapsSolid(isSolid, lifted)) state.vel[1] = PLAYER.waterExitSpeed
    else state.vel[0] = state.vel[2] = 0
  } else {
    if (hit.x !== 0) state.vel[0] = 0
    if (hit.z !== 0) state.vel[2] = 0
  }
  if (hit.y !== 0 && !pushing) state.vel[1] = 0
  state.eyeInWater = pointInWater(
    state.pos[0],
    state.pos[1] + state.eyeHeight,
    state.pos[2],
    isLiquid,
  )
}
