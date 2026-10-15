import { SPREAD } from '@blockfront/sim/combat/spread'
import type { WeaponId } from '@blockfront/sim/combat/weapons'

// docs/f2-5-polish.md §4.5: vertical kick per shot in degrees, horizontal random range, and the
// share of the kick the camera recovers by itself; the rest stays as aim the player corrects.
interface RecoilSpec {
  vertical: number
  horizontal: number
  recover: number
  halfLife: number
}

const DEG = Math.PI / 180
const RECOIL: Record<WeaponId, RecoilSpec> = {
  rifle: { vertical: 1.4, horizontal: 0.3, recover: 0.85, halfLife: 0.12 },
  smg: { vertical: 0.35, horizontal: 0.35, recover: 0.6, halfLife: 0.12 },
  carbine: { vertical: 0.5, horizontal: 0.25, recover: 0.7, halfLife: 0.12 },
  pistol: { vertical: 1.2, horizontal: 0.4, recover: 0.9, halfLife: 0.08 },
  // The table leaves these without recovery: the whole kick is handed to the player to correct.
  shotgun: { vertical: 3, horizontal: 0.6, recover: 0.5, halfLife: 0.12 },
  sniper: { vertical: 4, horizontal: 0.5, recover: 0.5, halfLife: 0.12 },
}
const CARBINE_LATE_VERTICAL = 0.7
const BURST_RESET_SECONDS = 0.3
const SHAKE_DECAY = 6
const HURT_ROLL = 0.035

export interface AimKick {
  pitch: number
  yaw: number
}

// View offsets the player does not control: the recovering part of the recoil, explosion shake
// and the hurt roll. The permanent part of the recoil is returned to the caller for the input.
export class CameraEffects {
  private recoilPitch = 0
  private recoilYaw = 0
  private halfLife = 0.12
  private shake = 0
  private shakeSeed = 0
  private hurtRoll = 0
  private landDip = 0
  private landTilt = 0
  private burstShots = 0
  private lastShotAt = -1
  private driftSign = 1
  pitchOffset = 0
  yawOffset = 0
  shakeX = 0
  shakeY = 0
  rollOffset = 0

  // Returns the share of the kick that stays in the aim.
  // ads scales the whole kick down by the weapon's ADS recoil factor (docs/f2-6-feel.md §2).
  kick(weapon: WeaponId, now: number, ads = 0, random: () => number = Math.random): AimKick {
    const spec = RECOIL[weapon]
    const adsScale = 1 + (SPREAD[weapon].recoilAds - 1) * ads
    if (now - this.lastShotAt > BURST_RESET_SECONDS) {
      this.burstShots = 0
      this.driftSign = random() < 0.5 ? -1 : 1
    }
    this.lastShotAt = now
    this.burstShots++
    let vertical = spec.vertical
    let horizontal = (random() * 2 - 1) * spec.horizontal
    if (weapon === 'carbine' && this.burstShots > 5) {
      vertical = CARBINE_LATE_VERTICAL
      horizontal += this.driftSign * 0.35
    }
    vertical *= adsScale
    horizontal *= adsScale
    this.halfLife = spec.halfLife
    this.recoilPitch += vertical * DEG * spec.recover
    this.recoilYaw += horizontal * DEG * spec.recover
    return {
      pitch: vertical * DEG * (1 - spec.recover),
      yaw: horizontal * DEG * (1 - spec.recover),
    }
  }

  // Landing: the camera dips with the height of the fall and tilts a little.
  land(height: number): void {
    const amount = Math.min(1, height / 12)
    this.landDip = Math.max(this.landDip, 0.25 * amount)
    this.landTilt = (Math.random() < 0.5 ? -1 : 1) * 0.04 * amount
  }

  // A tiny pitch jolt that recovers, e.g. the shovel connecting.
  jolt(radians: number): void {
    this.recoilPitch += radians
  }

  // Small roll away from the attacker: positive when hit from the right.
  hurtFrom(side: number): void {
    this.hurtRoll = HURT_ROLL * Math.sign(side || 1)
  }

  shakeFrom(distance: number, maxDistance: number): void {
    if (distance >= maxDistance) return
    this.shake = Math.max(this.shake, 0.35 * (1 - distance / maxDistance))
    this.shakeSeed = Math.random() * 1000
  }

  update(dt: number): void {
    // Damper with the recoil half-life: x -> 0.
    const damper = Math.exp((-0.693 * dt) / this.halfLife)
    this.recoilPitch *= damper
    this.recoilYaw *= damper
    this.shake *= Math.exp(-SHAKE_DECAY * dt)
    this.hurtRoll *= Math.exp(-7 * dt)
    this.landDip *= Math.exp(-9 * dt)
    this.landTilt *= Math.exp(-6 * dt)
    const t = performance.now() / 1000 + this.shakeSeed
    this.shakeX = Math.sin(t * 61) * this.shake * 0.12
    this.shakeY = Math.cos(t * 47) * this.shake * 0.1 - this.landDip
    this.rollOffset = Math.sin(t * 53) * this.shake * 0.04 + this.hurtRoll + this.landTilt
    this.pitchOffset = this.recoilPitch
    this.yawOffset = this.recoilYaw
  }
}
