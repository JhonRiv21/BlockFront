import { ADS } from '@blockfront/sim/combat/ads'
import type { PerspectiveCamera } from 'three'
import type { SoundBank } from '../audio/sound-bank.ts'
import type { InputState } from '../input/input-state.ts'
import { isGun, type Tool } from './viewmodel.ts'

export const DEFAULT_FOV = 75
// Scope overlay comes in from 80 % of the ADS transition with a 60 ms black fade.
export const SCOPE_THRESHOLD = 0.8
const SCOPE_FADE_SECONDS = 0.06
const ADS_SENSITIVITY_ADJUST = 1
const DEG = Math.PI / 180

// Aim-down-sights on the camera: world zoom by tangents (not by dividing degrees), sensitivity
// scaled by the same ratio, the scoped sniper's sway, and the hybrid scope: past 80 % the view
// fades to black for 60 ms and the HUD overlay takes over.
export class AdsView {
  scoped = false
  scopeFade = 0
  private wasAiming = false
  private breathHeld = 0
  private swayYaw = 0
  private swayPitch = 0
  private swayPhase = 0

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
    private readonly sounds: SoundBank,
    private readonly onScope: (scoped: boolean, fade: number) => void,
  ) {}

  update(tool: Tool, ads: number, dt: number): void {
    const zoom = isGun(tool) ? ADS[tool].zoom : 1
    // easeOutCubic on the FOV (docs/f2-6-feel.md §2).
    const s = 1 - Math.pow(1 - ads, 3)
    const aiming = ads > 0.05
    if (aiming !== this.wasAiming) {
      this.sounds.play(aiming ? 'aim-in' : 'aim-out', { volume: 0.5 })
      this.wasAiming = aiming
    }
    this.updateSway(tool, ads, dt)
    const hipHalf = Math.tan((DEFAULT_FOV * Math.PI) / 360)
    const adsHalf = Math.atan(hipHalf / zoom)
    const fov = ((DEFAULT_FOV * Math.PI) / 360) * (1 - s) + adsHalf * s
    this.camera.fov = (fov * 360) / Math.PI
    this.camera.updateProjectionMatrix()
    this.input.lookScale = (Math.tan(fov) / hipHalf) * ADS_SENSITIVITY_ADJUST

    const wantScope = isGun(tool) && ADS[tool].scope && ads >= SCOPE_THRESHOLD
    if (wantScope !== this.scoped) {
      this.scoped = wantScope
      this.scopeFade = 1
    }
    this.scopeFade = Math.max(0, this.scopeFade - dt / SCOPE_FADE_SECONDS)
    this.onScope(this.scoped, this.scopeFade)
  }

  // Scoped sniper: a Lissajous sway of ±0.3° written into the aim. Shift holds the breath:
  // steady for 3 s, then twice the shake for 2 s (docs §2).
  private updateSway(tool: Tool, ads: number, dt: number): void {
    const scoped = tool === 'sniper' && ads >= SCOPE_THRESHOLD
    let amplitude = scoped ? 0.3 : 0
    if (scoped && this.input.isHeld('ShiftLeft')) {
      this.breathHeld += dt
      amplitude = this.breathHeld < 3 ? 0 : this.breathHeld < 5 ? 0.6 : 0.3
    } else {
      this.breathHeld = 0
    }
    this.swayPhase += dt * 1.1
    const targetYaw = Math.sin(this.swayPhase) * amplitude * DEG
    const targetPitch = Math.sin(this.swayPhase * 2 + 0.7) * amplitude * 0.6 * DEG
    this.input.yaw += targetYaw - this.swayYaw
    this.input.pitch += targetPitch - this.swayPitch
    this.swayYaw = targetYaw
    this.swayPitch = targetPitch
  }
}
