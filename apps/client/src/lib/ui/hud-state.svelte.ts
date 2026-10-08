import type { WeaponId } from '@blockfront/sim/combat/weapons'

export interface KillFeedEntry {
  id: number
  attacker: string
  victim: string
  tool: string
  until: number
}

export interface DamageIndicator {
  id: number
  // World yaw toward the attacker, radians.
  angle: number
  until: number
}

export type CameraMode = 'fps' | 'fly'

class HudState {
  fps = $state(0)
  tick = $state(0)
  meshAvgMs = $state(0)
  meshMaxMs = $state(0)
  simAvgMs = $state(0)
  simMaxMs = $state(0)
  quads = $state(0)
  pointerLocked = $state(false)
  mode = $state<CameraMode>('fps')
  showHitboxes = $state(false)
  assetsReady = $state(false)

  hp = $state(100)
  alive = $state(true)
  respawnIn = $state(0)
  slot = $state(1)
  weapon = $state<WeaponId>('rifle')
  mag = $state(0)
  reserve = $state(0)
  reloading = $state(false)
  blocks = $state(50)
  grenades = $state(3)
  cooking = $state(-1)
  // Cone half-angle in radians; drives the crosshair gap.
  spread = $state(0)
  hitmarker = $state(false)
  hitmarkerHead = $state(false)
  killFeed = $state<KillFeedEntry[]>([])
  damageIndicators = $state<DamageIndicator[]>([])
  // Current view yaw, so damage indicators can be drawn relative to the view.
  yaw = $state(0)
  scoreBlue = $state(0)
  scoreRed = $state(0)
}

export const hudState = new HudState()
