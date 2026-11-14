import { playerHitboxes, rayHitboxes } from '../combat/hitboxes.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { Rng } from '../rng.ts'
import { viewDirection } from '../match/entities.ts'
import { DEG, type BotSkill } from './difficulty.ts'

// Aim model (docs/final-scope.md §4): turn no faster than the skill allows, start each new
// target with the skill's error and shrink it while tracking.
export const AIM = {
  // Fraction of the error left after each tracked tick, and the floor it shrinks to: half the
  // starting error, at most a degree.
  decayPerTick: 0.95,
  floor: 0.5,
  floorMaxDegrees: 1,
  // Share of the target's sideways motion the aim trails by.
  lag: 0.6,
  jitter: 0.06,
  maxPitch: 1.45,
} as const

export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a <= -Math.PI) a += Math.PI * 2
  return a
}

// yaw 0 faces -Z and pitch is positive looking up, as in the input frame.
export function bearing(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

// One tick of turning: the yaw and pitch offsets move together, at most maxStep radians.
export function turnToward(
  yaw: number,
  pitch: number,
  targetYaw: number,
  targetPitch: number,
  maxStep: number,
): { yaw: number; pitch: number } {
  const dyaw = wrapAngle(targetYaw - yaw)
  const dpitch = targetPitch - pitch
  const length = Math.hypot(dyaw, dpitch)
  const k = length <= maxStep || length === 0 ? 1 : maxStep / length
  const nextPitch = Math.max(-AIM.maxPitch, Math.min(AIM.maxPitch, pitch + dpitch * k))
  return { yaw: wrapAngle(yaw + dyaw * k), pitch: nextPitch }
}

export interface AimError {
  yaw: number
  pitch: number
  // Bearing of the target on the previous tick, to trail its motion.
  lastYaw: number
  lastPitch: number
}

export function freshError(rng: Rng, skill: BotSkill, yaw: number, pitch: number): AimError {
  const angle = rng.next() * Math.PI * 2
  const size = skill.aimErrorDegrees * DEG
  return {
    yaw: Math.cos(angle) * size,
    pitch: Math.sin(angle) * size,
    lastYaw: yaw,
    lastPitch: pitch,
  }
}

// The error after one more tick on the same target, toward the floor and trailing its motion.
export function trackError(
  error: AimError,
  rng: Rng,
  skill: BotSkill,
  yaw: number,
  pitch: number,
): void {
  const size = skill.aimErrorDegrees * DEG
  const floor = Math.min(size * AIM.floor, AIM.floorMaxDegrees * DEG)
  error.yaw = error.yaw * AIM.decayPerTick + wrapAngle(error.lastYaw - yaw) * AIM.lag
  error.pitch = error.pitch * AIM.decayPerTick + (error.lastPitch - pitch) * AIM.lag
  error.yaw += (rng.next() * 2 - 1) * size * AIM.jitter
  error.pitch += (rng.next() * 2 - 1) * size * AIM.jitter
  const length = Math.hypot(error.yaw, error.pitch)
  if (length < floor && length > 0) {
    error.yaw *= floor / length
    error.pitch *= floor / length
  }
  error.lastYaw = yaw
  error.lastPitch = pitch
}

// The shot along the current view would land on the target's hitboxes.
export function onTarget(
  eye: Vec3,
  yaw: number,
  pitch: number,
  targetPos: Vec3,
  crouching: boolean,
  range: number,
): boolean {
  const dir = viewDirection(yaw, pitch)
  return rayHitboxes(eye, dir, range, playerHitboxes(targetPos, crouching)) !== null
}
