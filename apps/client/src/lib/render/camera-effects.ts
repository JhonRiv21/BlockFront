import type { WeaponId } from '@blockfront/sim/combat/weapons'

// Pitch kick per shot in radians, plus how fast the view settles back.
const RECOIL_KICK: Record<WeaponId, number> = {
  rifle: 0.022,
  smg: 0.009,
  shotgun: 0.05,
  sniper: 0.06,
}
const RECOIL_RECOVERY = 11
const SHAKE_DECAY = 6

// View offsets that never touch the input: recoil pitch and explosion shake.
export class CameraEffects {
  private recoil = 0
  private shake = 0
  private shakeSeed = 0
  pitchOffset = 0
  shakeX = 0
  shakeY = 0
  rollOffset = 0

  kick(weapon: WeaponId): void {
    this.recoil += RECOIL_KICK[weapon]
  }

  shakeFrom(distance: number, maxDistance: number): void {
    if (distance >= maxDistance) return
    this.shake = Math.max(this.shake, 0.35 * (1 - distance / maxDistance))
    this.shakeSeed = Math.random() * 1000
  }

  update(dt: number): void {
    this.recoil *= Math.exp(-RECOIL_RECOVERY * dt)
    this.shake *= Math.exp(-SHAKE_DECAY * dt)
    const t = performance.now() / 1000 + this.shakeSeed
    this.shakeX = Math.sin(t * 61) * this.shake * 0.12
    this.shakeY = Math.cos(t * 47) * this.shake * 0.1
    this.rollOffset = Math.sin(t * 53) * this.shake * 0.04
    this.pitchOffset = this.recoil
  }
}
