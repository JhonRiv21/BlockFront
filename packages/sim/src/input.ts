import type { WeaponId } from './combat/weapons.ts'

export const BUTTON = {
  jump: 1,
  crouch: 2,
  sprint: 4,
  fire: 8,
  alt: 16,
  reload: 32,
  // Quick grenade throw (G) without changing slot.
  grenade: 64,
} as const

// The eight block colours a player can build with; the team colour is the default.
export const BUILD_COLORS: readonly number[] = [11, 12, 13, 14, 23, 27, 31, 36]

// One per tick from each client. yaw 0 faces -Z; pitch is positive looking up.
// slot: 1 primary, 2 pistol, 3 shovel, 4 blocks, 5 grenade. blockColor is a palette id.
export interface InputFrame {
  seq: number
  forward: number
  strafe: number
  yaw: number
  pitch: number
  buttons: number
  slot: number
  blockColor: number
  // Primary weapon request; empty keeps the current one. Until the F3 loadout menu.
  primary: WeaponId | ''
}

export function createInputFrame(): InputFrame {
  return {
    seq: 0,
    forward: 0,
    strafe: 0,
    yaw: 0,
    pitch: 0,
    buttons: 0,
    slot: 1,
    blockColor: 0,
    primary: '',
  }
}

export function hasButton(frame: InputFrame, bit: number): boolean {
  return (frame.buttons & bit) !== 0
}
