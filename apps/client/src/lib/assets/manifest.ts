// Everything the first match downloads. Models are glTF (quantized, WebP) and sounds are
// mono AAC at 22 kHz; sources and licenses are listed in assets/CREDITS.md.
export const MODELS = {
  character: '/models/character.glb',
  grenade: '/models/grenade.glb',
} as const

export type ModelName = keyof typeof MODELS

export const SOUNDS = {
  hit: '/audio/hit.m4a',
  'hit-head': '/audio/hit-head.m4a',
  hurt: '/audio/hurt.m4a',
  death: '/audio/death.m4a',
  shovel: '/audio/shovel.m4a',
  'grenade-throw': '/audio/grenade-throw.m4a',
  'grenade-bounce': '/audio/grenade-bounce.m4a',
  'footstep-0': '/audio/footstep-0.m4a',
  'footstep-1': '/audio/footstep-1.m4a',
  'footstep-2': '/audio/footstep-2.m4a',
  'footstep-3': '/audio/footstep-3.m4a',
  'block-break-0': '/audio/block-break-0.m4a',
  'block-break-1': '/audio/block-break-1.m4a',
  'block-break-2': '/audio/block-break-2.m4a',
  'block-hit': '/audio/block-hit.m4a',
  'block-place': '/audio/block-place.m4a',
  'aim-in': '/audio/aim-in.m4a',
  'aim-out': '/audio/aim-out.m4a',
  'land-thud': '/audio/land-thud.m4a',
  'land-crunch': '/audio/land-crunch.m4a',
  'grenade-tick': '/audio/grenade-tick.m4a',
} as const

export type SoundName = keyof typeof SOUNDS
