export const BUTTON = {
  jump: 1,
  crouch: 2,
  sprint: 4,
  fire: 8,
  alt: 16,
  reload: 32,
} as const

// One per tick from each client. yaw 0 faces -Z; pitch is positive looking up. slot is 1..4.
export interface InputFrame {
  seq: number
  forward: number
  strafe: number
  yaw: number
  pitch: number
  buttons: number
  slot: number
}

export function createInputFrame(): InputFrame {
  return { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, slot: 1 }
}

export function hasButton(frame: InputFrame, bit: number): boolean {
  return (frame.buttons & bit) !== 0
}
