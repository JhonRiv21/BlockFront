import { TICK_SECONDS } from '../config.ts'
import { sweepAabb, type Aabb, type SolidTest, type Vec3 } from '../physics/sweep.ts'
import { GRENADE } from './weapons.ts'

export interface GrenadeEntity {
  id: number
  owner: number
  pos: Vec3
  vel: Vec3
  fuse: number
}

// Gravity, bounce off whatever it hits and ground friction. Returns true when the fuse ran out.
export function stepGrenade(grenade: GrenadeEntity, isSolid: SolidTest, dt: number): boolean {
  grenade.fuse -= dt
  grenade.vel[1] -= GRENADE.gravity * dt
  const half = GRENADE.size / 2
  const box: Aabb = {
    min: [grenade.pos[0] - half, grenade.pos[1] - half, grenade.pos[2] - half],
    max: [grenade.pos[0] + half, grenade.pos[1] + half, grenade.pos[2] + half],
  }
  const hit = sweepAabb(isSolid, box, [
    grenade.vel[0] * dt,
    grenade.vel[1] * dt,
    grenade.vel[2] * dt,
  ])
  grenade.pos[0] = box.min[0] + half
  grenade.pos[1] = box.min[1] + half
  grenade.pos[2] = box.min[2] + half
  if (hit.x !== 0) grenade.vel[0] *= -GRENADE.bounce
  if (hit.z !== 0) grenade.vel[2] *= -GRENADE.bounce
  if (hit.y !== 0) {
    grenade.vel[1] *= -GRENADE.bounce
    if (hit.y === -1) {
      grenade.vel[0] *= GRENADE.groundFriction
      grenade.vel[2] *= GRENADE.groundFriction
      if (Math.abs(grenade.vel[1]) < 1) grenade.vel[1] = 0
    }
  }
  return grenade.fuse <= 0
}

// docs/f2-6-feel.md §4: one key, charge then cook. Minecraft's bow curve for the power.
export const CHARGE = {
  seconds: 0.8,
  minSpeed: 9,
  maxSpeed: 24,
  underhandSpeed: 7,
  upwardDegrees: 8,
  velocityInheritance: 1.0,
} as const

export function chargePower(heldSeconds: number): number {
  const f = Math.min(1, Math.max(0, heldSeconds) / CHARGE.seconds)
  return (f * f + 2 * f) / 3
}

export function throwSpeed(heldSeconds: number): number {
  return CHARGE.minSpeed + (CHARGE.maxSpeed - CHARGE.minSpeed) * chargePower(heldSeconds)
}

// Release velocity: the look direction tilted 8° up at the charged speed plus the player's own
// velocity; underhand lobs go out slow along the look direction.
export function throwVelocity(
  yaw: number,
  pitch: number,
  speed: number,
  playerVel: Vec3,
  underhand: boolean,
): Vec3 {
  const tilt = underhand ? pitch : pitch + (CHARGE.upwardDegrees * Math.PI) / 180
  const cos = Math.cos(tilt)
  const dir: Vec3 = [-Math.sin(yaw) * cos, Math.sin(tilt), -Math.cos(yaw) * cos]
  const v = underhand ? CHARGE.underhandSpeed : speed
  return [
    dir[0] * v + playerVel[0] * CHARGE.velocityInheritance,
    dir[1] * v + playerVel[1] * CHARGE.velocityInheritance,
    dir[2] * v + playerVel[2] * CHARGE.velocityInheritance,
  ]
}

export interface ArcPrediction {
  points: Vec3[]
  // True when the fuse runs out before the grenade comes to rest on something.
  inAir: boolean
}

// Runs the very same step the sim uses, so the drawn arc is the real trajectory.
export function predictArc(
  grenade: GrenadeEntity,
  isSolid: SolidTest,
  maxSteps: number,
): ArcPrediction {
  const twin: GrenadeEntity = {
    id: grenade.id,
    owner: grenade.owner,
    pos: [grenade.pos[0], grenade.pos[1], grenade.pos[2]],
    vel: [grenade.vel[0], grenade.vel[1], grenade.vel[2]],
    fuse: grenade.fuse,
  }
  const points: Vec3[] = []
  let exploded = false
  for (let i = 0; i < maxSteps && !exploded; i++) {
    exploded = stepGrenade(twin, isSolid, TICK_SECONDS)
    points.push([twin.pos[0], twin.pos[1], twin.pos[2]])
  }
  const half = GRENADE.size / 2
  const supported = isSolid(
    Math.floor(twin.pos[0]),
    Math.floor(twin.pos[1] - half - 0.01),
    Math.floor(twin.pos[2]),
  )
  return { points, inAir: !supported || Math.abs(twin.vel[1]) > 0.5 }
}
