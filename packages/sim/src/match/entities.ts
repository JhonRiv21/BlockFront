import { createWeaponState, type WeaponState } from '../combat/weapon-state.ts'
import type { InputFrame } from '../input.ts'
import { PLAYER, type PlayerState } from '../physics/player-controller.ts'
import type { Aabb, Vec3 } from '../physics/sweep.ts'
import type { AirState } from '../physics/air.ts'
import type { PlayerStats } from '../rules/ctf.ts'
import type { WeaponId } from '../combat/weapons.ts'
import type { DamageSource, PlayerConfig } from './types.ts'

export interface PlayerEntity {
  config: PlayerConfig
  state: PlayerState
  yaw: number
  pitch: number
  hp: number
  alive: boolean
  respawnTick: number
  slot: number
  weapon: WeaponState
  pistol: WeaponState
  blockColor: number
  ads: number
  shovelCooldown: number
  // Ticks until the pending shovel swing lands (-1 = none) and what it does.
  swingTicks: number
  swingColumn: boolean
  sprintUntil: number
  holdFireEdge: boolean
  placeCooldown: number
  blocks: number
  grenades: number
  cooking: number
  charge: number
  lastAttacker: number
  lastAttackedTick: number
  air: AirState
  lastButtons: number
  lastInput: InputFrame
  // Primary asked for while alive; it arrives with the next respawn.
  nextPrimary: WeaponId | ''
  protectedUntil: number
  lastRestockTick: number
  stats: PlayerStats
  dealtThisLife: number
  takenThisLife: number
  killedBy: number
  killedWith: DamageSource | ''
}

export function viewDirection(yaw: number, pitch: number): Vec3 {
  const cos = Math.cos(pitch)
  return [-Math.sin(yaw) * cos, Math.sin(pitch), -Math.cos(yaw) * cos]
}

export function eyePosition(player: PlayerEntity): Vec3 {
  const { pos } = player.state
  return [pos[0], pos[1] + player.state.eyeHeight, pos[2]]
}

export function bodyCenter(player: PlayerEntity): Vec3 {
  const { pos } = player.state
  const height = player.state.crouching ? PLAYER.crouchHeight : PLAYER.height
  return [pos[0], pos[1] + height / 2, pos[2]]
}

export function overlapsBox(box: Aabb, x: number, y: number, z: number): boolean {
  const { min, max } = box
  return (
    min[0] < x + 1 && max[0] > x && min[1] < y + 1 && max[1] > y && min[2] < z + 1 && max[2] > z
  )
}

const NO_GUN = createWeaponState('rifle')

// The gun in hand, or an idle one for the slots that hold no gun.
export function heldGun(player: PlayerEntity): WeaponState {
  if (player.slot === 1) return player.weapon
  if (player.slot === 2) return player.pistol
  return NO_GUN
}
