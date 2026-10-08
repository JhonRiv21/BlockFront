// Everything the first match downloads. Models are glTF (quantized, WebP) and sounds are
// mono AAC at 22 kHz; sources and licenses are listed in assets/CREDITS.md.
export const MODELS = {
  character: '/models/character.glb',
  smg: '/models/smg.glb',
  shotgun: '/models/shotgun.glb',
  sniper: '/models/sniper.glb',
  grenade: '/models/grenade.glb',
} as const

export type ModelName = keyof typeof MODELS

export const SOUNDS = {
  'shot-rifle': '/audio/shot-rifle.m4a',
  'shot-smg': '/audio/shot-smg.m4a',
  'shot-shotgun': '/audio/shot-shotgun.m4a',
  'shot-sniper': '/audio/shot-sniper.m4a',
  hit: '/audio/hit.m4a',
  'hit-head': '/audio/hit-head.m4a',
  hurt: '/audio/hurt.m4a',
  death: '/audio/death.m4a',
  reload: '/audio/reload.m4a',
  shovel: '/audio/shovel.m4a',
  'grenade-throw': '/audio/grenade-throw.m4a',
  'grenade-bounce': '/audio/grenade-bounce.m4a',
  explosion: '/audio/explosion.m4a',
  'footstep-0': '/audio/footstep-0.m4a',
  'footstep-1': '/audio/footstep-1.m4a',
  'footstep-2': '/audio/footstep-2.m4a',
  'footstep-3': '/audio/footstep-3.m4a',
  'block-break-0': '/audio/block-break-0.m4a',
  'block-break-1': '/audio/block-break-1.m4a',
  'block-break-2': '/audio/block-break-2.m4a',
  'block-hit': '/audio/block-hit.m4a',
  'block-place': '/audio/block-place.m4a',
} as const

export type SoundName = keyof typeof SOUNDS
