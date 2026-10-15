import {
  damper,
  springCritical,
  springUnderdamped,
  type SpringState,
} from '@blockfront/sim/physics/spring'
import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { Group, Vector3 } from 'three'

const DEG = Math.PI / 180

// docs/f2-5-polish.md §5.1: every motion of the first-person weapon is a spring or a damper,
// so it never depends on the frame rate. Outputs are offsets applied on top of the ADS pose.
export interface MotionInput {
  dt: number
  speed: number
  lateral: number
  onGround: boolean
  landingSpeed: number
  sprinting: boolean
  ads: number
  mouseDx: number
  mouseDy: number
}

export interface MotionOutput {
  position: Vector3
  rotation: Vector3
}

const SWAY_PER_PX = 0.02 * DEG
const SWAY_MAX = 4 * DEG
const SWAY_HALF_LIFE = 0.07
const SWAY_SHIFT = 0.015
const BOB_A = 0.012
const BOB_B = 0.008
const BOB_ROLL = 1.5 * DEG
const STEPS_WALK = 1.9
const STEPS_SPRINT = 2.6
const SPRINT_YAW = 30 * DEG
const SPRINT_ROLL = -12 * DEG
const SPRINT_DROP = 0.05
const SPRINT_HALF_LIFE = 0.06
const LEAN_PER_SPEED = 0.8 * DEG
const LEAN_MAX = 3.5 * DEG

export class WeaponMotion {
  private readonly recoilZ: SpringState = { x: 0, v: 0 }
  private readonly recoilPitch: SpringState = { x: 0, v: 0 }
  private readonly recoilYaw: SpringState = { x: 0, v: 0 }
  private readonly recoilRoll: SpringState = { x: 0, v: 0 }
  private readonly land: SpringState = { x: 0, v: 0 }
  private swayYaw = 0
  private swayPitch = 0
  private bobPhase = 0
  private sprintBlend = 0
  private lean = 0
  private counterPush = 0
  readonly out: MotionOutput = { position: new Vector3(), rotation: new Vector3() }

  // Recoil impulses: back 0.03–0.08, pitch 3–8°, yaw ±1°, roll ±2°. Long bursts push less.
  shot(weapon: WeaponId): void {
    const heavy = weapon === 'shotgun' || weapon === 'sniper'
    const light = weapon === 'smg' || weapon === 'carbine'
    const scale = Math.max(0.45, 1 - this.counterPush * 0.08)
    this.counterPush = Math.min(8, this.counterPush + 1)
    this.recoilZ.v += (heavy ? 0.08 : light ? 0.03 : 0.05) * 25 * scale
    this.recoilPitch.v += (heavy ? 8 : light ? 3 : 5) * DEG * 25 * scale
    this.recoilYaw.v += (Math.random() * 2 - 1) * 1 * DEG * 25
    this.recoilRoll.v += (Math.random() * 2 - 1) * 2 * DEG * 25
  }

  // Slap of a magazine, a bolt pull, a landing: any extra kick in the same springs.
  impulse(z: number, pitch: number): void {
    this.recoilZ.v += z * 25
    this.recoilPitch.v += pitch * 25
  }

  update(input: MotionInput): void {
    const { dt } = input
    this.counterPush = damper(this.counterPush, 0, 0.35, dt)
    for (const s of [this.recoilZ, this.recoilPitch, this.recoilYaw, this.recoilRoll]) {
      springUnderdamped(s, 0, 0.5, 25, dt)
    }

    // Sway follows the mouse with a short half-life, reduced to 30 % while aiming.
    const swayScale = 1 - 0.7 * input.ads
    const targetYaw = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, -input.mouseDx * SWAY_PER_PX))
    const targetPitch = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, -input.mouseDy * SWAY_PER_PX))
    this.swayYaw = damper(this.swayYaw, targetYaw * swayScale, SWAY_HALF_LIFE, dt)
    this.swayPitch = damper(this.swayPitch, targetPitch * swayScale, SWAY_HALF_LIFE, dt)

    // Lissajous 1:2 bob proportional to speed; one cycle is two steps.
    const moving = input.onGround && input.speed > 0.4
    const rate = input.sprinting ? STEPS_SPRINT : STEPS_WALK
    if (moving) this.bobPhase += dt * Math.PI * rate * Math.min(1.2, input.speed / 4.3)
    const amount = moving ? Math.min(1, input.speed / 4.3) * (input.sprinting ? 1.8 : 1) : 0
    const bobScale = amount * (1 - 0.8 * input.ads)
    const bobX = BOB_A * Math.sin(this.bobPhase) * bobScale
    const bobY = BOB_B * Math.sin(this.bobPhase * 2) * bobScale
    const bobRoll = BOB_ROLL * Math.sin(this.bobPhase) * bobScale

    this.sprintBlend = damper(
      this.sprintBlend,
      input.sprinting && moving ? 1 : 0,
      SPRINT_HALF_LIFE,
      dt,
    )
    const leanTarget = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, -input.lateral * LEAN_PER_SPEED))
    this.lean = damper(this.lean, leanTarget, 0.1, dt)
    if (input.landingSpeed > 0) this.land.v -= Math.min(1, input.landingSpeed / 10) * 0.6 * 12
    springCritical(this.land, 0, 0.09, dt)

    const p = this.out.position
    const r = this.out.rotation
    p.set(
      bobX + this.swayYaw * (SWAY_SHIFT / SWAY_MAX) * -1,
      bobY +
        this.swayPitch * (SWAY_SHIFT / SWAY_MAX) -
        SPRINT_DROP * this.sprintBlend +
        this.land.x,
      this.recoilZ.x,
    )
    r.set(
      this.recoilPitch.x + this.swayPitch,
      this.recoilYaw.x + this.swayYaw + SPRINT_YAW * this.sprintBlend,
      this.recoilRoll.x + bobRoll + SPRINT_ROLL * this.sprintBlend + this.lean,
    )
  }
}

// Timeline of a reload (docs §5.1), as offsets for the weapon and the magazine mesh.
export interface ReloadPose {
  drop: number
  roll: number
  magazineY: number
  magazineVisible: boolean
  slap: boolean
  bolt: boolean
}

export function reloadPose(progress: number, emptyMag: boolean, perShell: boolean): ReloadPose {
  const p = Math.max(0, Math.min(1, progress))
  if (perShell) {
    // Shell by shell: the gun tilts and gets a push on each shell.
    const cycle = (p * 6) % 1
    return {
      drop: 0.06,
      roll: 15 * DEG,
      magazineY: 0,
      magazineVisible: true,
      slap: cycle < 0.08,
      bolt: false,
    }
  }
  const lower = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1
  let magazineY = 0
  let magazineVisible = true
  if (p >= 0.2 && p < 0.45) {
    const t = (p - 0.2) / 0.25
    magazineY = -0.5 * t * t
  } else if (p >= 0.45 && p < 0.7) {
    const t = (p - 0.45) / 0.25
    magazineY = -0.4 * (1 - t)
  }
  if (p >= 0.3 && p < 0.45) magazineVisible = false
  const slap = p >= 0.7 && p < 0.8
  const bolt = emptyMag && p >= 0.85 && p < 0.95
  return { drop: 0.12 * lower, roll: 25 * DEG * lower, magazineY, magazineVisible, slap, bolt }
}

// Minecraft swing curve (docs §5.3): f = sin(sqrt(p)·π).
export interface SwingPose {
  rotX: number
  x: number
  y: number
}

export function swingPose(p: number, amplitude = 1): SwingPose {
  const t = Math.max(0, Math.min(1, p))
  const f = Math.sin(Math.sqrt(t) * Math.PI) * amplitude
  return {
    rotX: -80 * DEG * f,
    x: -0.4 * f * 0.5,
    y: 0.2 * Math.sin(Math.sqrt(t) * 2 * Math.PI) * amplitude * 0.5,
  }
}

// easeOutBack for the draw of a weapon.
export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// Two-point "IK": a box arm from a fixed shoulder to a hand that rides on the weapon.
export class BlockArm {
  readonly object = new Group()
  private readonly direction = new Vector3()
  private readonly up = new Vector3(0, 1, 0)

  constructor(
    readonly shoulder: Vector3,
    private readonly sleeveLength: number,
  ) {}

  // handLocal is in the arm's parent space (the camera rig); handWorld is the same point in
  // world space, which is what Object3D.lookAt expects.
  aim(handLocal: Vector3, handWorld: Vector3): void {
    this.object.position.copy(this.shoulder)
    this.direction.subVectors(handLocal, this.shoulder)
    const length = Math.max(0.05, this.direction.length())
    this.object.lookAt(handWorld.x, handWorld.y, handWorld.z)
    this.object.scale.set(1, 1, length / this.sleeveLength)
  }

  get upVector(): Vector3 {
    return this.up
  }
}
