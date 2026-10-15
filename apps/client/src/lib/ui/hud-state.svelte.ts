import type { WeaponId } from '@blockfront/sim/combat/weapons'

export interface KillFeedEntry {
  id: number
  // Empty when the victim did it to themselves.
  attacker: string
  victim: string
  // Weapon id or cause (drowning, fall); the HUD translates it.
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
  underwater = $state(false)

  hp = $state(100)
  // Hearts the player had before the last hit, shown pale for a moment.
  hpBefore = $state(100)
  hurtAt = $state(0)
  alive = $state(true)
  respawnIn = $state(0)
  air = $state(10)
  eyeInWater = $state(false)
  slot = $state(1)
  weapon = $state<WeaponId>('rifle')
  mag = $state(0)
  reserve = $state(0)
  reloading = $state(false)
  pistolMag = $state(12)
  pistolReserve = $state(48)
  pistolReloading = $state(false)
  // Reload of the gun in hand: seconds left and total, for the ring in the crosshair.
  reloadLeft = $state(0)
  reloadTotal = $state(0)
  blocks = $state(50)
  blockColor = $state(11)
  grenades = $state(3)
  cooking = $state(-1)
  // Cone half-angle in radians; drives the crosshair gap.
  spread = $state(0)
  // ADS transition 0..1; the crosshair fades with it. scoped shows the scope overlay.
  ads = $state(0)
  scoped = $state(false)
  scopeFade = $state(0)
  hitmarker = $state(false)
  hitmarkerHead = $state(false)
  killFeed = $state<KillFeedEntry[]>([])
  damageIndicators = $state<DamageIndicator[]>([])
  // Current view yaw, so damage indicators can be drawn relative to the view.
  yaw = $state(0)
  scoreBlue = $state(0)
  scoreRed = $state(0)
  // Key of the item just selected (rifle, pistol, shovel, blocks, grenade...), shown over the
  // hotbar for 2 s.
  itemName = $state('')
  itemNameAt = $state(0)
  // Last trigger pull on an empty magazine; the ammo counter flashes red.
  dryFireAt = $state(-1e9)
  // Nearby explosion: screen flash strength 0..1 and when it happened.
  blastAt = $state(-1e9)
  blastStrength = $state(0)
  now = $state(0)
  showHpNumber = $state(false)
  // Set by the mount: asks the game for a different primary weapon.
  selectPrimary: (weapon: WeaponId) => void = () => {}
}

export const hudState = new HudState()
