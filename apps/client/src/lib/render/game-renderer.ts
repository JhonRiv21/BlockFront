import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { TICK_SECONDS } from '@blockfront/sim/config'
import type { GameConfig, GameEvent, PlayerSnapshot, Snapshot } from '@blockfront/sim/game'
import { BUILD_COLORS, BUTTON, type InputFrame } from '@blockfront/sim/input'
import type { SolidTest, Vec3 } from '@blockfront/sim/physics/sweep'
import { raycastVoxels } from '@blockfront/sim/raycast/dda'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { generateWorld } from '@blockfront/sim/world/generator'
import { BLOCK, isLiquid, isSolid } from '@blockfront/sim/world/blocks'
import type { World } from '@blockfront/sim/world/world'
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type ShaderMaterial,
} from 'three'
import { AssetStore } from '../assets/asset-store.ts'
import { SoundBank } from '../audio/sound-bank.ts'
import { GunAudio } from '../audio/gun-audio.ts'
import { FlyCamera } from '../input/fly-camera.ts'
import { InputState } from '../input/input-state.ts'
import { SkylightTexture } from '../light/skylight-texture.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
import { LocalTransport } from '../net/local-transport.ts'
import type { Transport } from '../net/transport.ts'
import type { CameraMode, DamageIndicator, KillFeedEntry } from '../ui/hud-state.svelte.ts'
import { BlockHighlight } from './block-highlight.ts'
import { BlockParticles } from './block-particles.ts'
import { CameraEffects } from './camera-effects.ts'
import { PlayerView } from './player-view.ts'
import { Sky, SKY_HORIZON } from './sky.ts'
import { useSphericalFog } from './spherical-fog.ts'
import { isGun, Viewmodel, type Tool, type ViewmodelState } from './viewmodel.ts'
import { BlockCracks } from './block-cracks.ts'
import { ImpactMarks } from './impact-marks.ts'
import { Tracers } from './tracers.ts'
import { ShellCasings } from './shell-casings.ts'
import { ExplosionFx } from './explosion-fx.ts'
import { GrenadeArc } from './grenade-arc.ts'
import { CHARGE, throwSpeed, throwVelocity } from '@blockfront/sim/combat/grenade'
import { ADS } from '@blockfront/sim/combat/ads'
import { MuzzleFlashes } from './muzzle-flash.ts'
import { createBlockTextures } from '../textures/block-textures.ts'
import { createDecorMaterial, createVoxelMaterial } from './voxel-material.ts'
import { createWaterMaterial } from './water-material.ts'
import { WorldView } from './world-view.ts'

export interface RenderStats {
  fps: number
  tick: number
  meshAvgMs: number
  meshMaxMs: number
  simAvgMs: number
  simMaxMs: number
  quads: number
}

export interface HudUpdate {
  player: PlayerSnapshot
  hitmarker: { head: boolean } | null
  killFeed: KillFeedEntry[]
  damageIndicators: DamageIndicator[]
}

export interface RendererCallbacks {
  onStats: (stats: RenderStats) => void
  onPointerLock: (locked: boolean) => void
  onMode: (mode: CameraMode) => void
  onHitboxes: (shown: boolean) => void
  onHud: (update: HudUpdate) => void
  onView: (yaw: number) => void
  onAssetsReady: () => void
  onUnderwater: (underwater: boolean) => void
  // Item just selected, as a key the HUD translates.
  onItem: (item: string) => void
  onScope: (scoped: boolean, fade: number) => void
  onDryFire: () => void
  onBlast: (strength: number) => void
}

const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const LOCAL_PLAYER_ID = 1
const REACH = 5
const TICK_MS = TICK_SECONDS * 1000
const KILL_FEED_MS = 6000
const DAMAGE_INDICATOR_MS = 1200
const BLAST_FLASH_RANGE = 12
const DEFAULT_FOV = 75
// Scope overlay comes in from 80 % of the ADS transition with a 60 ms black fade.
const SCOPE_THRESHOLD = 0.8
const SCOPE_FADE_SECONDS = 0.06
const ADS_SENSITIVITY_ADJUST = 1
const GLINT_ANGLE = (12 * Math.PI) / 180
const DEG = Math.PI / 180
const GRENADE_FUSE = 3
const FOOTSTEP_STRIDE = 2.8
const EXPLOSION_SHAKE_RANGE = 16
const FOG_NEAR = 90
const FOG_FAR = 260
// Underwater fog: dark blue mixed with the water colour, nearly opaque on entry and clearing to
// 20 blocks over 2.5 s (Minecraft takes 30 s, too slow for a shooter).
const UNDERWATER_FOG = new Color('#050533').lerp(new Color('#3f76e4'), 0.45)
const UNDERWATER_FOG_FAR = 20
const UNDERWATER_CLEAR_SECONDS = 2.5
// Both on the flat plateau of the blue base, a few blocks past the towers.
const DUMMY_SPAWNS: [number, number][] = [
  [61, 28],
  [67, 30],
]

const TOOL_LABEL: Record<string, string> = {
  rifle: 'Fusil',
  carbine: 'Carabina',
  smg: 'Subfusil',
  shotgun: 'Escopeta',
  sniper: 'Francotirador',
  pistol: 'Pistola',
  shovel: 'Pala',
  grenade: 'Granada',
  blocks: 'Bloque',
  drowning: 'Ahogado',
  fall: 'Caída',
}

const SLOT_COUNT = 5

function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, cores - 1))
}

function matchConfig(seed: number, primary: WeaponId): GameConfig {
  return {
    seed,
    players: [
      { id: LOCAL_PLAYER_ID, team: 'blue', name: 'Tú', primary },
      ...DUMMY_SPAWNS.map((spawn, i) => ({
        id: 10 + i,
        team: 'red' as const,
        name: `Maniquí ${i + 1}`,
        dummy: true,
        spawn,
      })),
    ],
  }
}

function distance(a: Vec3, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z)
}

export class GameRenderer {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 400)
  private readonly inputClock = new FixedStep(TICK_SECONDS, 5)
  private readonly resizeObserver: ResizeObserver
  private readonly pool = new MesherPool(workerCount())
  private readonly materials: {
    opaque: ShaderMaterial
    liquid: ShaderMaterial
    decor: ShaderMaterial
  }
  private readonly skylight: SkylightTexture
  private readonly sky: Sky
  readonly bakeMs: number
  private readonly world: World
  private readonly worldView: WorldView
  private readonly input: InputState
  private readonly flyCamera: FlyCamera
  private readonly highlight = new BlockHighlight()
  private readonly isSolid: SolidTest
  private readonly transport: LocalTransport
  private readonly assets = new AssetStore()
  private readonly sounds: SoundBank
  private readonly guns: GunAudio
  private enclosureAt = 0
  private readonly rayDir = new Vector3()
  private readonly particles: BlockParticles
  private readonly explosions: ExplosionFx
  private readonly effects = new CameraEffects()
  private readonly worldFlashes: MuzzleFlashes
  private readonly worldFlashLight = new PointLight('#ffb366', 0, 8, 2)
  private readonly cracks: BlockCracks
  private readonly marks: ImpactMarks
  private readonly tracers: Tracers
  private readonly casings: ShellCasings
  private readonly right = new Vector3()
  private readonly upVector = new Vector3()
  private lastOnGround = true
  private lastVy = 0
  private lastShovelSwingAt = -1
  private autoShots = 0
  private readonly grenadeArc: GrenadeArc
  private wasAiming = false
  private lastTickAt = -1
  private breathHeld = 0
  private swayYaw = 0
  private swayPitch = 0
  private swayPhase = 0
  private readonly viewmodel: Viewmodel
  private readonly players = new Map<number, PlayerView>()
  private readonly grenadeMeshes = new Map<number, Mesh>()
  private readonly cameraEuler = new Euler(0, 0, 0, 'YXZ')
  private readonly viewDirection = new Vector3()
  private readonly strideByPlayer = new Map<number, number>()
  private previous: Snapshot | null = null
  private latest: Snapshot | null = null
  private latestAt = 0
  private mode: CameraMode = 'fps'
  private showHitboxes = false
  private slot = 1
  private previousSlot = 2
  private blockColor = BUILD_COLORS[0]!
  private primaryRequest: WeaponId | '' = ''
  private aimedBlockId = 0
  private lastAir = 10
  private scoped = false
  private scopeFade = 0
  private readonly glints = new Map<number, number>()
  private seq = 0
  private killFeed: KillFeedEntry[] = []
  private damageIndicators: DamageIndicator[] = []
  private nextFeedId = 1
  private tick = 0
  private lastTime: number | null = null
  private framesInSample = 0
  private sampleStart: number | null = null
  private pendingHitmarker: { head: boolean } | null = null
  private wasReloading = false
  private underwater = false
  private underwaterSeconds = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: RendererCallbacks,
    primary: WeaponId = 'rifle',
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.autoClear = false
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    // Spherical fog in the horizon colour; the sky dome draws behind everything.
    this.scene.fog = new Fog(SKY_HORIZON.clone(), FOG_NEAR, FOG_FAR)
    this.sky = new Sky(this.scene)
    this.scene.add(this.highlight.object)
    // The voxel shader lights itself; these only reach the standard materials (players, grenades).
    this.scene.add(new HemisphereLight('#cfe3ff', '#5b4a36', 1.2))
    const sun = new DirectionalLight('#fff1d6', 1.4)
    sun.position.set(45, 80, 35)
    this.scene.add(sun)

    // The client keeps its own copy of the map for rendering and aim preview; the sim owns it.
    this.world = generateWorld(DEFAULT_SEED)
    this.isSolid = (x, y, z) => isSolid(this.world.getBlock(x, y, z))
    const textures = createBlockTextures()
    this.bakeMs = textures.bakeMs
    this.skylight = new SkylightTexture(this.world, DEFAULT_SEED)
    const options = { blockTextures: textures.texture, skylight: this.skylight.texture }
    this.materials = {
      opaque: createVoxelMaterial(options),
      liquid: createWaterMaterial(this.skylight.texture),
      decor: createDecorMaterial(options),
    }
    this.worldView = new WorldView(this.scene, this.world, this.pool, this.materials)
    void this.worldView.rebuildAll()
    this.skylight.onTexture((texture) => {
      for (const material of Object.values(this.materials))
        material.uniforms.skylight!.value = texture
    })

    this.sounds = new SoundBank(this.scene, this.assets)
    this.camera.add(this.sounds.listener)
    this.guns = new GunAudio(this.sounds.listener.context)
    this.particles = new BlockParticles(this.scene)
    this.explosions = new ExplosionFx(this.scene)
    useSphericalFog(this.particles.material)
    this.worldFlashes = new MuzzleFlashes(this.scene)
    // One permanent light whose intensity flashes: adding lights would recompile the shaders.
    this.scene.add(this.worldFlashLight)
    this.cracks = new BlockCracks(this.scene, textures.texture)
    this.marks = new ImpactMarks(this.scene)
    this.tracers = new Tracers(this.scene)
    this.casings = new ShellCasings(this.scene, this.isSolid)
    this.grenadeArc = new GrenadeArc(this.scene, this.isSolid)
    this.viewmodel = new Viewmodel(this.assets, 'blue')
    void this.assets.ready.then(() => callbacks.onAssetsReady())

    this.input = new InputState(canvas, (locked) => {
      if (locked) this.sounds.resume()
      callbacks.onPointerLock(locked)
    })
    this.input.yaw = Math.PI
    this.flyCamera = new FlyCamera(this.camera, this.input)

    this.transport = new LocalTransport()
    this.transport.onUpdate((snapshot, events) => this.onUpdate(snapshot, events))
    this.transport.start(matchConfig(DEFAULT_SEED, primary), LOCAL_PLAYER_ID)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame)
  }

  // Loadout: one primary at a time, chosen from the HUD panel. Applies immediately for now;
  // with bots and maps it will only apply after a death.
  setPrimary(weapon: WeaponId): void {
    this.primaryRequest = weapon
    this.callbacks.onItem(weapon)
  }

  // Debug hooks for measuring from the console (see mount-game.ts).
  get debug() {
    return {
      worldView: this.worldView,
      pool: this.pool,
      transport: this.transport as Transport,
      assets: this.assets,
      sounds: this.sounds,
      guns: this.guns,
      info: this.renderer.info,
      snapshot: () => this.latest,
      skylight: this.skylight,
      viewmodel: this.viewmodel,
      input: this.input,
      bakeMs: this.bakeMs,
      camera: this.camera,
      setMode: (mode: CameraMode) => {
        if (mode !== this.mode) this.toggleMode()
      },
      setSlot: (slot: number) => this.selectSlot(slot),
      renderOnce: () => this.frame(performance.now()),
      explosions: this.explosions,
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.transport.dispose()
    this.highlight.dispose()
    this.particles.dispose()
    this.explosions.dispose()
    this.worldFlashes.dispose()
    this.cracks.dispose()
    this.marks.dispose()
    this.tracers.dispose()
    this.casings.dispose()
    this.grenadeArc.dispose()
    this.viewmodel.dispose()
    this.sounds.dispose()
    this.guns.dispose()
    for (const view of this.players.values()) view.dispose()
    for (const mesh of this.grenadeMeshes.values()) this.scene.remove(mesh)
    this.worldView.dispose()
    this.pool.dispose()
    this.sky.dispose()
    this.skylight.dispose()
    for (const material of Object.values(this.materials)) material.dispose()
    this.renderer.dispose()
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
    this.lastTime = time
    const dt = Math.min(elapsed, 0.1)

    if (this.input.takePressed('KeyF')) this.toggleMode()
    if (this.input.takePressed('KeyH')) {
      this.showHitboxes = !this.showHitboxes
      this.callbacks.onHitboxes(this.showHitboxes)
    }
    this.readSlot()

    const { steps } = this.inputClock.advance(elapsed)
    for (let i = 0; i < steps; i++) this.transport.sendInput(this.buildInput())

    const alpha = Math.min(1, (performance.now() - this.latestAt) / TICK_MS)
    this.effects.update(dt)
    if (this.mode === 'fps') this.placeCamera(alpha)
    else this.flyCamera.update(dt)
    this.updateOthers(alpha, dt)
    this.updateAimPreview()
    this.updateGrenadeArc()
    this.particles.update(dt)
    this.explosions.update(dt)
    this.worldFlashes.update(dt)
    this.tracers.update(dt)
    this.casings.update(dt)
    this.cracks.update()
    this.worldFlashLight.intensity *= Math.exp(-40 * dt)
    this.skylight.flush()
    this.sky.update(this.camera)
    this.updateAudioListener(time)
    this.updateUnderwater()
    this.materials.decor.uniforms.time!.value = time / 1000
    this.materials.liquid.uniforms.time!.value = time / 1000
    this.updateUnderwaterFog(dt)
    this.callbacks.onView(this.input.yaw)

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    const me = this.localPlayer()
    if (this.mode === 'fps' && me?.alive) {
      const tool: Tool =
        me.slot === 1
          ? me.weapon
          : me.slot === 2
            ? 'pistol'
            : me.slot === 3
              ? 'shovel'
              : me.slot === 4
                ? 'blocks'
                : 'grenade'
      this.applyAds(tool, me.ads, dt)
      const [mouseDx, mouseDy] = this.input.takeMouseDelta()
      const vy = this.verticalSpeedOf(me.id)
      const landingSpeed = me.onGround && !this.lastOnGround && this.lastVy < -3 ? -this.lastVy : 0
      this.lastOnGround = me.onGround
      this.lastVy = vy
      const moving = this.input.axis('KeyS', 'KeyW') !== 0 || this.input.axis('KeyA', 'KeyD') !== 0
      const state: ViewmodelState = {
        tool,
        speed: this.speedOf(me.id),
        lateral: this.lateralSpeedOf(me.id),
        onGround: me.onGround,
        landingSpeed,
        sprinting: this.input.isHeld('ShiftLeft') && moving && me.onGround && !me.inWater,
        ads: me.ads,
        reloading: me.slot === 2 ? me.pistolReloading : me.slot === 1 && me.reloading,
        magEmpty: me.slot === 2 ? me.pistolMag === 0 : me.mag === 0,
        windup: me.cooking >= 0 ? Math.min(1, me.charge / CHARGE.seconds) : 0,
        mouseDx,
        mouseDy,
      }
      this.viewmodel.update(this.camera, state, dt)
      this.viewmodel.setVisible(!this.scoped)
      this.renderer.clearDepth()
      this.renderer.render(this.viewmodel.scene, this.viewmodel.camera)
    } else {
      this.applyAds('shovel', 0, dt)
    }
    this.sampleFps(time)
  }

  // Listener pose for the gun voices, and every 250 ms how enclosed the eye is: the share of
  // 12 short DDA rays that hit a block within 12 blocks feeds the reverb send.
  private updateAudioListener(time: number): void {
    const { x, y, z } = this.camera.position
    this.camera.getWorldDirection(this.viewDirection)
    this.guns.updateListener(
      x,
      y,
      z,
      this.viewDirection.x,
      this.viewDirection.y,
      this.viewDirection.z,
    )
    if (time - this.enclosureAt < 250) return
    this.enclosureAt = time
    let hits = 0
    const rays = 12
    for (let i = 0; i < rays; i++) {
      const angle = (i / 8) * Math.PI * 2
      if (i < 8) this.rayDir.set(Math.cos(angle), 0.15, Math.sin(angle))
      else if (i < 10) this.rayDir.set(i === 8 ? 0.4 : -0.4, 0.9, 0)
      else this.rayDir.set(0, i === 10 ? 1 : -1, i === 10 ? 0 : 0.2)
      this.rayDir.normalize()
      const hit = raycastVoxels(
        this.isSolid,
        [x, y, z],
        [this.rayDir.x, this.rayDir.y, this.rayDir.z],
        12,
      )
      if (hit) hits++
    }
    this.guns.setEnclosure(hits / rays)
  }

  // Eye inside a water block (below the 8/9 surface): blue fog and the HUD tint.
  private updateUnderwater(): void {
    const { x, y, z } = this.camera.position
    const cell = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
    const above = this.world.getBlock(Math.floor(x), Math.floor(y) + 1, Math.floor(z))
    const underwater = isLiquid(cell) && (isLiquid(above) || y < Math.floor(y) + 8 / 9)
    if (underwater === this.underwater) return
    this.underwater = underwater
    this.underwaterSeconds = 0
    const fog = this.scene.fog as Fog
    // The sky dome ignores fog, so under water it is hidden and the clear colour takes over.
    this.sky.mesh.visible = !underwater
    if (underwater) {
      fog.color.copy(UNDERWATER_FOG)
      fog.near = 0.5
      fog.far = 3
      this.renderer.setClearColor(UNDERWATER_FOG)
    } else {
      fog.color.copy(SKY_HORIZON)
      fog.near = FOG_NEAR
      fog.far = FOG_FAR
      this.renderer.setClearColor(SKY_HORIZON)
    }
    this.callbacks.onUnderwater(underwater)
  }

  private updateUnderwaterFog(dt: number): void {
    if (!this.underwater) return
    this.underwaterSeconds += dt
    const t = Math.min(1, this.underwaterSeconds / UNDERWATER_CLEAR_SECONDS)
    const fog = this.scene.fog as Fog
    fog.far = 3 + (UNDERWATER_FOG_FAR - 3) * t * t
  }

  // World zoom by tangents (not by dividing degrees), sensitivity scaled by the same ratio,
  // and the hybrid scope: past 80 % the view fades to black for 60 ms and the overlay takes over.
  private applyAds(tool: Tool, ads: number, dt: number): void {
    const zoom = isGun(tool) ? ADS[tool].zoom : 1
    // easeOutCubic on the FOV (docs/f2-6-feel.md §2).
    const s = 1 - Math.pow(1 - ads, 3)
    const aiming = ads > 0.05
    if (aiming !== this.wasAiming) {
      this.sounds.play(aiming ? 'aim-in' : 'aim-out', { volume: 0.5 })
      this.wasAiming = aiming
    }
    this.updateScopeSway(tool, ads, dt)
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
    this.callbacks.onScope(this.scoped, this.scopeFade)
  }

  // Scoped sniper: a Lissajous sway of ±0.3° written into the aim. Shift holds the breath:
  // steady for 3 s, then twice the shake for 2 s (docs §2).
  private updateScopeSway(tool: Tool, ads: number, dt: number): void {
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

  // Lens glint on an enemy sniper that is scoped and pointing within 12° of me.
  private updateGlints(snapshot: Snapshot): void {
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    for (const other of snapshot.players) {
      if (!me || other.id === me.id || other.team === me.team || !other.alive) continue
      const scoped = other.slot === 1 && other.weapon === 'sniper' && other.ads >= SCOPE_THRESHOLD
      if (!scoped) continue
      const dx = me.pos[0] - other.pos[0]
      const dy = me.pos[1] + me.eyeHeight - (other.pos[1] + other.eyeHeight)
      const dz = me.pos[2] - other.pos[2]
      const len = Math.hypot(dx, dy, dz)
      const cp = Math.cos(other.pitch)
      const aim = [-Math.sin(other.yaw) * cp, Math.sin(other.pitch), -Math.cos(other.yaw) * cp]
      const cos = (dx * aim[0]! + dy * aim[1]! + dz * aim[2]!) / len
      if (cos < Math.cos(GLINT_ANGLE)) continue
      const last = this.glints.get(other.id) ?? 0
      if (performance.now() - last < 120) continue
      this.glints.set(other.id, performance.now())
      const size = Math.min(2.5, 0.4 + len * 0.03)
      this.worldFlashes.spawn(other.pos[0], other.pos[1] + other.eyeHeight, other.pos[2], size)
    }
  }

  private localPlayer(): PlayerSnapshot | null {
    return this.latest?.players.find((p) => p.id === LOCAL_PLAYER_ID) ?? null
  }

  private verticalSpeedOf(id: number): number {
    const current = this.latest?.players.find((p) => p.id === id)
    const before = this.previous?.players.find((p) => p.id === id)
    if (!current || !before) return 0
    return (current.pos[1] - before.pos[1]) / TICK_SECONDS
  }

  // Sideways speed along the view's right axis, positive to the right.
  private lateralSpeedOf(id: number): number {
    const current = this.latest?.players.find((p) => p.id === id)
    const before = this.previous?.players.find((p) => p.id === id)
    if (!current || !before) return 0
    const vx = (current.pos[0] - before.pos[0]) / TICK_SECONDS
    const vz = (current.pos[2] - before.pos[2]) / TICK_SECONDS
    return vx * Math.cos(this.input.yaw) - vz * Math.sin(this.input.yaw)
  }

  // Horizontal speed from the last two snapshots, in blocks per second.
  private speedOf(id: number): number {
    const current = this.latest?.players.find((p) => p.id === id)
    const before = this.previous?.players.find((p) => p.id === id)
    if (!current || !before) return 0
    const dx = current.pos[0] - before.pos[0]
    const dz = current.pos[2] - before.pos[2]
    return Math.hypot(dx, dz) / TICK_SECONDS
  }

  // 1–5 and the wheel pick a slot, Q returns to the previous one. On the block slot, 4 again or
  // the wheel while holding 4 cycles the colour, and the middle click copies the aimed block.
  private readSlot(): void {
    const wheel = this.input.takeWheel()
    const holding4 = this.input.isHeld('Digit4')
    for (let i = 1; i <= SLOT_COUNT; i++) {
      if (!this.input.takePressed(`Digit${i}`)) continue
      if (i === 4 && this.slot === 4) this.cycleBlockColor(1)
      else this.selectSlot(i)
    }
    if (this.input.takePressed('KeyQ')) this.selectSlot(this.previousSlot)

    if (wheel !== 0) {
      if (holding4 && this.slot === 4) this.cycleBlockColor(wheel)
      else {
        // The wheel steps over locked slots.
        let next = this.slot
        for (let i = 0; i < SLOT_COUNT - 1; i++) {
          next = ((((next - 1 + wheel) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT) + 1
          if (this.slotInStock(next)) break
        }
        this.selectSlot(next)
      }
    }
    if (this.input.takeClick(1) && BUILD_COLORS.includes(this.aimedBlockId)) {
      this.blockColor = this.aimedBlockId
      this.viewmodel.setBlockColor(this.blockColor)
    }
  }

  // Blocks and grenades lock their slot while the stock is empty; weapons never lock.
  private slotInStock(slot: number): boolean {
    const me = this.localPlayer()
    if (!me) return true
    if (slot === 4) return me.blocks > 0
    if (slot === 5) return me.grenades > 0
    return true
  }

  private selectSlot(slot: number): void {
    if (slot === this.slot || !this.slotInStock(slot)) return
    this.previousSlot = this.slot
    this.slot = slot
    const me = this.localPlayer()
    const key =
      slot === 1
        ? (me?.weapon ?? 'rifle')
        : slot === 2
          ? 'pistol'
          : slot === 3
            ? 'shovel'
            : slot === 4
              ? 'blocks'
              : 'grenade'
    this.callbacks.onItem(key)
  }

  private cycleBlockColor(step: number): void {
    const index = BUILD_COLORS.indexOf(this.blockColor)
    const next =
      (((index + step) % BUILD_COLORS.length) + BUILD_COLORS.length) % BUILD_COLORS.length
    this.blockColor = BUILD_COLORS[next]!
    this.viewmodel.setBlockColor(this.blockColor)
  }

  private buildInput(): InputFrame {
    const fly = this.mode === 'fly'
    let buttons = 0
    if (!fly) {
      if (this.input.isHeld('Space')) buttons |= BUTTON.jump
      if (this.input.isHeld('ControlLeft') || this.input.isHeld('KeyC')) buttons |= BUTTON.crouch
      if (this.input.isHeld('ShiftLeft')) buttons |= BUTTON.sprint
      if (this.input.isMouseHeld(0)) buttons |= BUTTON.fire
      if (this.input.isMouseHeld(2)) buttons |= BUTTON.alt
      if (this.input.isHeld('KeyR')) buttons |= BUTTON.reload
      if (this.input.isHeld('KeyG')) buttons |= BUTTON.grenade
    }
    return {
      seq: this.seq++,
      forward: fly ? 0 : this.input.axis('KeyS', 'KeyW'),
      strafe: fly ? 0 : this.input.axis('KeyA', 'KeyD'),
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      buttons,
      slot: this.slot,
      blockColor: this.blockColor,
      primary: this.primaryRequest,
    }
  }

  private onUpdate(snapshot: Snapshot, events: GameEvent[]): void {
    this.previous = this.latest
    this.latest = snapshot
    this.latestAt = performance.now()
    this.tick = snapshot.tick

    let blocksChanged = false
    for (const event of events) {
      if (event.type === 'block') blocksChanged = true
      this.handleEvent(snapshot, event)
    }
    if (blocksChanged) void this.worldView.flushDirty()
    this.playFootsteps(snapshot)
    this.updateGlints(snapshot)

    const now = performance.now()
    this.killFeed = this.killFeed.filter((entry) => entry.until > now)
    this.damageIndicators = this.damageIndicators.filter((entry) => entry.until > now)
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    if (me) {
      // The sim hands the player back to the primary when blocks or grenades run out.
      if (me.slot === 1 && this.slot !== 1 && !this.slotInStock(this.slot)) {
        this.previousSlot = this.slot
        this.slot = 1
        this.callbacks.onItem(me.weapon)
      }
      const reloading = me.slot === 2 ? me.pistolReloading : me.reloading
      if (reloading && !this.wasReloading)
        this.guns.mech(me.slot === 2 ? 'pistol' : me.weapon, LOCAL_PLAYER_ID)
      this.wasReloading = reloading
      // Each bubble pops a little higher than the last.
      if (me.air < this.lastAir && me.eyeInWater) {
        this.sounds.play('hit', { volume: 0.35, rate: 1 + (10 - me.air) * 0.08 })
      }
      this.lastAir = me.air
      this.callbacks.onHud({
        player: me,
        hitmarker: this.pendingHitmarker,
        killFeed: this.killFeed,
        damageIndicators: this.damageIndicators,
      })
      this.pendingHitmarker = null
    }
  }

  private handleEvent(snapshot: Snapshot, event: GameEvent): void {
    const eye: Vec3 = [this.camera.position.x, this.camera.position.y, this.camera.position.z]
    switch (event.type) {
      case 'shot': {
        const local = event.player === LOCAL_PLAYER_ID
        if (event.tool === 'shovel') {
          if (local) {
            this.sounds.play('shovel', { volume: 0.6 })
            this.viewmodel.onShot('shovel')
            this.lastShovelSwingAt = performance.now()
          } else this.sounds.playAt('shovel', ...event.origin, { volume: 0.6 })
          break
        }
        if (event.tool === 'blocks' || event.tool === 'grenade') break
        // Tracers on every shot, one in three for the automatics.
        const automatic = event.tool === 'smg' || event.tool === 'carbine'
        this.autoShots++
        if (!automatic || this.autoShots % 3 === 0) this.tracers.spawn(event.origin, event.dir)
        if (local) {
          this.guns.shotOwn(event.tool)
          this.scheduleMech(event.tool, LOCAL_PLAYER_ID, null, 0)
          const stays = this.effects.kick(
            event.tool,
            performance.now() / 1000,
            this.localPlayer()?.ads ?? 0,
          )
          this.input.pitch = Math.min(Math.PI / 2 - 0.01, this.input.pitch + stays.pitch)
          this.input.yaw += stays.yaw
          this.viewmodel.onShot(event.tool)
          this.ejectCasing(this.camera.position, 0.35)
          this.guns.casing(eye[0], eye[1] - 1.4, eye[2], 0, LOCAL_PLAYER_ID)
        } else {
          const [ox, oy, oz] = event.origin
          const shooterDistance = distance(eye, { x: ox, y: oy, z: oz })
          this.guns.shotAt(event.tool, event.player, ox, oy, oz, shooterDistance)
          this.scheduleMech(event.tool, event.player, event.origin, shooterDistance)
          this.guns.casing(ox, oy - 1.4, oz, shooterDistance, event.player)
          this.whizIfClose(event.origin, event.dir)
          this.worldFlashLight.position.set(
            ox + event.dir[0],
            oy + event.dir[1] - 0.2,
            oz + event.dir[2],
          )
          this.worldFlashLight.intensity = 10
          this.ejectCasing(new Vector3(ox, oy, oz), 0.2)
          const [dx, dy, dz] = event.dir
          this.worldFlashes.spawn(ox + dx * 0.9, oy + dy * 0.9 - 0.25, oz + dz * 0.9, 0.5)
        }
        break
      }
      case 'hit':
        if (event.attacker === LOCAL_PLAYER_ID && event.victim !== LOCAL_PLAYER_ID) {
          this.pendingHitmarker = { head: event.zone === 'head' }
          this.guns.hitmarker(event.zone === 'head')
        }
        if (event.victim === LOCAL_PLAYER_ID) {
          this.sounds.play('hurt', { volume: 0.7 })
          this.pushDamageIndicator(snapshot, event.attacker)
          this.effects.hurtFrom(this.attackerSide(snapshot, event.attacker))
        }
        break
      case 'landed': {
        if (event.player === LOCAL_PLAYER_ID) {
          this.effects.land(event.height)
          if (event.height >= 8) this.sounds.play('land-crunch', { volume: 0.8 })
          else if (event.height >= 4) this.sounds.play('land-thud', { volume: 0.6 })
        } else {
          const who = snapshot.players.find((p) => p.id === event.player)
          if (who && event.height >= 4)
            this.sounds.playAt(event.height >= 8 ? 'land-crunch' : 'land-thud', ...who.pos, {
              volume: 0.7,
            })
        }
        break
      }
      case 'death': {
        this.pushKillFeed(snapshot, event.attacker, event.victim, event.tool)
        const victim = snapshot.players.find((p) => p.id === event.victim)
        if (event.victim === LOCAL_PLAYER_ID) this.sounds.play('death')
        else if (victim) this.sounds.playAt('death', ...victim.pos, { volume: 0.8 })
        break
      }
      case 'block': {
        const previousId = this.world.getBlock(event.x, event.y, event.z)
        this.worldView.setBlock(event.x, event.y, event.z, event.id)
        this.skylight.onBlockChanged(event.x, event.y, event.z)
        this.cracks.clear(event.x, event.y, event.z)
        this.marks.clearBlock(event.x, event.y, event.z)
        if (event.id !== BLOCK.air && this.slot === 4 && previousId === BLOCK.air) {
          this.viewmodel.onBlockPlaced()
        }
        if (event.id === BLOCK.air) {
          this.particles.burst(event.x, event.y, event.z, previousId, 14)
          this.sounds.playVariantAt('block-break', 3, event.x + 0.5, event.y + 0.5, event.z + 0.5)
        } else {
          this.sounds.playAt('block-place', event.x + 0.5, event.y + 0.5, event.z + 0.5, {
            volume: 0.7,
          })
        }
        break
      }
      case 'blockDamaged': {
        this.particles.burst(
          event.x,
          event.y,
          event.z,
          this.world.getBlock(event.x, event.y, event.z),
          4,
        )
        this.sounds.playAt('block-hit', event.x + 0.5, event.y + 0.5, event.z + 0.5, {
          volume: 0.5,
        })
        this.cracks.damage(event.x, event.y, event.z, event.hp)
        const [nx, ny, nz] = event.normal
        // Mark somewhere on the face that was hit (the sim does not send the exact point).
        const jx = nx === 0 ? (Math.random() - 0.5) * 0.6 : 0
        const jy = ny === 0 ? (Math.random() - 0.5) * 0.6 : 0
        const jz = nz === 0 ? (Math.random() - 0.5) * 0.6 : 0
        this.marks.add(
          event.x,
          event.y,
          event.z,
          event.normal,
          event.x + 0.5 + nx * 0.5 + jx,
          event.y + 0.5 + ny * 0.5 + jy,
          event.z + 0.5 + nz * 0.5 + jz,
        )
        if (performance.now() - this.lastShovelSwingAt < 300) {
          this.viewmodel.onShovelHit()
          this.effects.jolt((0.5 * Math.PI) / 180)
          this.lastShovelSwingAt = -1
        }
        break
      }
      case 'grenade': {
        const thrower = snapshot.players.find((p) => p.id === event.player)
        if (thrower) this.sounds.playAt('grenade-throw', ...thrower.pos, { volume: 0.6 })
        break
      }
      case 'dryfire':
        if (event.player === LOCAL_PLAYER_ID) {
          this.guns.dryFire()
          this.callbacks.onDryFire()
        }
        break
      case 'explosion': {
        const away = distance(eye, event)
        this.explosions.burst(event.x, event.y, event.z)
        this.guns.explosion(-3, event.x, event.y, event.z, away)
        this.effects.shakeFrom(away, EXPLOSION_SHAKE_RANGE)
        // Close blasts whiten the screen for a moment.
        if (away < BLAST_FLASH_RANGE) this.callbacks.onBlast(1 - away / BLAST_FLASH_RANGE)
        break
      }
    }
  }

  // One step every FOOTSTEP_STRIDE blocks walked on the ground, for every player.
  private playFootsteps(snapshot: Snapshot): void {
    for (const player of snapshot.players) {
      const speed = this.speedOf(player.id)
      if (!player.alive || !player.onGround || speed < 1) continue
      const stride = (this.strideByPlayer.get(player.id) ?? 0) + speed * TICK_SECONDS
      if (stride < FOOTSTEP_STRIDE) {
        this.strideByPlayer.set(player.id, stride)
        continue
      }
      this.strideByPlayer.set(player.id, 0)
      // Own steps stay well under everything else; they annoyed in the playtest.
      if (player.id === LOCAL_PLAYER_ID)
        this.sounds.playVariant('footstep', 4, { volume: 0.08, rate: 0.9 })
      else this.sounds.playVariantAt('footstep', 4, ...player.pos, { volume: 0.35 })
    }
  }

  private pushKillFeed(snapshot: Snapshot, attacker: number, victim: number, tool: string): void {
    const name = (id: number) => snapshot.players.find((p) => p.id === id)?.name ?? `#${id}`
    this.killFeed.push({
      id: this.nextFeedId++,
      attacker: name(attacker),
      victim: name(victim),
      tool: TOOL_LABEL[tool] ?? tool,
      until: performance.now() + KILL_FEED_MS,
    })
    if (this.killFeed.length > 5) this.killFeed.shift()
  }

  // Pump after a shotgun shot (~300 ms) and bolt after a sniper shot (~600 ms), own or at the
  // shooter; other guns only click on reload.
  private scheduleMech(
    weapon: WeaponId,
    entity: number,
    origin: Vec3 | null,
    shooterDistance: number,
  ): void {
    const delay = weapon === 'shotgun' ? 300 : weapon === 'sniper' ? 600 : 0
    if (delay === 0) return
    setTimeout(() => {
      if (entity === LOCAL_PLAYER_ID) this.guns.mech(weapon, LOCAL_PLAYER_ID)
      else if (origin) this.guns.mech(weapon, entity, origin, shooterDistance)
    }, delay)
  }

  // An enemy bullet passing within 2 blocks of the eye, in front of the muzzle: a flyby.
  private whizIfClose(origin: Vec3, dir: Vec3): void {
    const { x, y, z } = this.camera.position
    const rx = x - origin[0]
    const ry = y - origin[1]
    const rz = z - origin[2]
    const t = rx * dir[0] + ry * dir[1] + rz * dir[2]
    if (t <= 1) return
    const cx = origin[0] + dir[0] * t
    const cy = origin[1] + dir[1] * t
    const cz = origin[2] + dir[2] * t
    const miss = Math.hypot(cx - x, cy - y, cz - z)
    if (miss > 2 || miss < 0.3) return
    this.guns.whiz(cx, cy, cz, miss)
  }

  // Brass leaves to the shooter's right and up from a point near the receiver.
  private ejectCasing(eye: Vector3, forwardOffset: number): void {
    this.camera.getWorldDirection(this.viewDirection)
    this.right.crossVectors(this.viewDirection, this.camera.up).normalize()
    this.upVector.copy(this.camera.up)
    const origin = eye
      .clone()
      .addScaledVector(this.viewDirection, forwardOffset)
      .addScaledVector(this.right, 0.2)
      .addScaledVector(this.upVector, -0.15)
    this.casings.eject(origin, this.right, this.upVector)
  }

  // Negative when the attacker is to the left of the view, positive to the right, 0 if unknown.
  private attackerSide(snapshot: Snapshot, attackerId: number): number {
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    const attacker = snapshot.players.find((p) => p.id === attackerId)
    if (!me || !attacker || attacker.id === me.id) return 0
    const dx = attacker.pos[0] - me.pos[0]
    const dz = attacker.pos[2] - me.pos[2]
    const rightX = Math.cos(this.input.yaw)
    const rightZ = -Math.sin(this.input.yaw)
    return dx * rightX + dz * rightZ
  }

  private pushDamageIndicator(snapshot: Snapshot, attackerId: number): void {
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    const attacker = snapshot.players.find((p) => p.id === attackerId)
    if (!me || !attacker || attacker.id === me.id) return
    const dx = attacker.pos[0] - me.pos[0]
    const dz = attacker.pos[2] - me.pos[2]
    // Yaw that would face the attacker; the HUD subtracts the current view yaw.
    this.damageIndicators.push({
      id: this.nextFeedId++,
      angle: Math.atan2(-dx, -dz),
      until: performance.now() + DAMAGE_INDICATOR_MS,
    })
  }

  private interpolated(id: number, alpha: number): [PlayerSnapshot, Vec3] | null {
    const current = this.latest?.players.find((p) => p.id === id)
    if (!current) return null
    const before = this.previous?.players.find((p) => p.id === id)
    if (!before || !before.alive || !current.alive) return [current, current.pos]
    return [
      current,
      [
        before.pos[0] + (current.pos[0] - before.pos[0]) * alpha,
        before.pos[1] + (current.pos[1] - before.pos[1]) * alpha,
        before.pos[2] + (current.pos[2] - before.pos[2]) * alpha,
      ],
    ]
  }

  // Own position interpolated between the last two snapshots; the look is applied without delay,
  // then recoil and shake are layered on top.
  private placeCamera(alpha: number): void {
    const own = this.interpolated(LOCAL_PLAYER_ID, alpha)
    if (own) {
      const [me, pos] = own
      this.camera.position.set(
        pos[0] + this.effects.shakeX,
        pos[1] + me.eyeHeight + this.effects.shakeY,
        pos[2],
      )
    }
    this.cameraEuler.set(
      this.input.pitch + this.effects.pitchOffset,
      this.input.yaw + this.effects.yawOffset,
      this.effects.rollOffset,
    )
    this.camera.quaternion.setFromEuler(this.cameraEuler)
  }

  private updateOthers(alpha: number, dt: number): void {
    if (!this.latest) return
    for (const player of this.latest.players) {
      if (player.id === LOCAL_PLAYER_ID) continue
      let view = this.players.get(player.id)
      if (!view) {
        view = new PlayerView(this.scene, player.team, this.assets)
        this.players.set(player.id, view)
      }
      const data = this.interpolated(player.id, alpha)
      if (data) {
        view.update(
          player,
          data[1][0],
          data[1][1],
          data[1][2],
          this.speedOf(player.id),
          dt,
          this.showHitboxes,
        )
      }
    }

    const seen = new Set<number>()
    const grenadeModel = this.assets.model('grenade')
    for (const grenade of this.latest.grenades) {
      seen.add(grenade.id)
      let mesh = this.grenadeMeshes.get(grenade.id)
      if (!mesh && grenadeModel) {
        const clone = grenadeModel.scene.clone(true)
        clone.traverse((child) => {
          if (child instanceof Mesh) useSphericalFog(child.material as Material)
        })
        mesh = new Mesh()
        mesh.add(clone)
        this.scene.add(mesh)
        this.grenadeMeshes.set(grenade.id, mesh)
      }
      if (mesh) {
        mesh.position.set(grenade.pos[0], grenade.pos[1] - 0.12, grenade.pos[2])
        mesh.rotation.y += dt * 6
      }
    }
    for (const [id, mesh] of this.grenadeMeshes) {
      if (seen.has(id)) continue
      this.scene.remove(mesh)
      this.grenadeMeshes.delete(id)
    }
  }

  // While the grenade is held: the arc it would fly if released now, and a tick every 0.5 s.
  private updateGrenadeArc(): void {
    const me = this.localPlayer()
    if (!me || !me.alive || me.cooking < 0 || this.mode !== 'fps') {
      this.grenadeArc.hide()
      this.lastTickAt = -1
      return
    }
    const tickIndex = Math.floor((GRENADE_FUSE - me.cooking) / 0.5)
    if (tickIndex !== this.lastTickAt) {
      this.sounds.play('grenade-tick', { volume: 0.5, rate: 1 + tickIndex * 0.05 })
      this.lastTickAt = tickIndex
    }
    const underhand = this.input.isMouseHeld(2)
    const vel = throwVelocity(
      this.input.yaw,
      this.input.pitch,
      throwSpeed(me.charge),
      [0, 0, 0],
      underhand,
    )
    const { x, y, z } = this.camera.position
    this.grenadeArc.show({ id: 0, owner: LOCAL_PLAYER_ID, pos: [x, y, z], vel, fuse: me.cooking })
  }

  // Client-side preview of the block the shovel or the block tool will act on.
  private updateAimPreview(): void {
    if (this.mode === 'fps' && this.slot !== 3 && this.slot !== 4) {
      this.highlight.hide()
      this.aimedBlockId = 0
      return
    }
    this.camera.getWorldDirection(this.viewDirection)
    const { x, y, z } = this.camera.position
    const hit = raycastVoxels(
      this.isSolid,
      [x, y, z],
      [this.viewDirection.x, this.viewDirection.y, this.viewDirection.z],
      REACH,
    )
    this.aimedBlockId = hit ? this.world.getBlock(hit.x, hit.y, hit.z) : 0
    if (hit) this.highlight.show(hit)
    else this.highlight.hide()
  }

  private toggleMode(): void {
    this.mode = this.mode === 'fps' ? 'fly' : 'fps'
    this.callbacks.onMode(this.mode)
  }

  private sampleFps(time: number): void {
    if (this.sampleStart === null) {
      this.sampleStart = time
      return
    }
    this.framesInSample++
    const span = time - this.sampleStart
    if (span < FPS_SAMPLE_MS) return
    const mesh = this.pool.stats()
    const sim = this.transport.stepStats()
    this.callbacks.onStats({
      fps: Math.round((this.framesInSample * 1000) / span),
      tick: this.tick,
      meshAvgMs: mesh.avgMs,
      meshMaxMs: mesh.maxMs,
      simAvgMs: sim.avgMs,
      simMaxMs: sim.maxMs,
      quads: this.worldView.totalQuads,
    })
    this.framesInSample = 0
    this.sampleStart = time
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas
    if (clientWidth === 0 || clientHeight === 0) return
    this.renderer.setSize(clientWidth, clientHeight, false)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
