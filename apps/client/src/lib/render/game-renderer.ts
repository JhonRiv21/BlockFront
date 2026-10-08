import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { TICK_SECONDS } from '@blockfront/sim/config'
import type { GameConfig, GameEvent, PlayerSnapshot, Snapshot } from '@blockfront/sim/game'
import { BUTTON, type InputFrame } from '@blockfront/sim/input'
import type { SolidTest, Vec3 } from '@blockfront/sim/physics/sweep'
import { raycastVoxels } from '@blockfront/sim/raycast/dda'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { generateWorld } from '@blockfront/sim/world/generator'
import { BLOCK } from '@blockfront/sim/world/palette'
import type { World } from '@blockfront/sim/world/world'
import {
  Color,
  DirectionalLight,
  Euler,
  Fog,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { AssetStore } from '../assets/asset-store.ts'
import { SoundBank } from '../audio/sound-bank.ts'
import { FlyCamera } from '../input/fly-camera.ts'
import { InputState } from '../input/input-state.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
import { LocalTransport } from '../net/local-transport.ts'
import type { Transport } from '../net/transport.ts'
import type { CameraMode, DamageIndicator, KillFeedEntry } from '../ui/hud-state.svelte.ts'
import { BlockHighlight } from './block-highlight.ts'
import { BlockParticles } from './block-particles.ts'
import { CameraEffects } from './camera-effects.ts'
import { MuzzleFlashes } from './muzzle-flash.ts'
import { PlayerView } from './player-view.ts'
import { Viewmodel } from './viewmodel.ts'
import { createVoxelMaterial } from './voxel-material.ts'
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
}

const SKY = new Color('#9cc7ef')
const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const LOCAL_PLAYER_ID = 1
const REACH = 5
const TICK_MS = TICK_SECONDS * 1000
const KILL_FEED_MS = 6000
const DAMAGE_INDICATOR_MS = 1200
const DEFAULT_FOV = 75
const SCOPED_FOV = 30
const FOOTSTEP_STRIDE = 2.1
const EXPLOSION_SHAKE_RANGE = 16
// Both on the flat plateau of the blue base, a few blocks past the towers.
const DUMMY_SPAWNS: [number, number][] = [
  [61, 28],
  [67, 30],
]

const TOOL_LABEL: Record<string, string> = {
  rifle: 'Fusil',
  smg: 'Subfusil',
  shotgun: 'Escopeta',
  sniper: 'Francotirador',
  shovel: 'Pala',
  grenade: 'Granada',
  blocks: 'Bloque',
}

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
  private readonly material = createVoxelMaterial()
  private readonly world: World
  private readonly worldView: WorldView
  private readonly input: InputState
  private readonly flyCamera: FlyCamera
  private readonly highlight = new BlockHighlight()
  private readonly isSolid: SolidTest
  private readonly transport: LocalTransport
  private readonly assets = new AssetStore()
  private readonly sounds: SoundBank
  private readonly particles: BlockParticles
  private readonly effects = new CameraEffects()
  private readonly worldFlashes: MuzzleFlashes
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
    this.scene.background = SKY
    this.scene.fog = new Fog(SKY, 90, 260)
    this.scene.add(this.highlight.object)
    // The voxel shader lights itself; these only reach the standard materials (players, grenades).
    this.scene.add(new HemisphereLight('#cfe3ff', '#5b4a36', 1.2))
    const sun = new DirectionalLight('#fff1d6', 1.4)
    sun.position.set(45, 80, 35)
    this.scene.add(sun)

    // The client keeps its own copy of the map for rendering and aim preview; the sim owns it.
    this.world = generateWorld(DEFAULT_SEED)
    this.isSolid = (x, y, z) => this.world.getBlock(x, y, z) !== BLOCK.air
    this.worldView = new WorldView(this.scene, this.world, this.pool, this.material)
    void this.worldView.rebuildAll()

    this.sounds = new SoundBank(this.scene, this.assets)
    this.camera.add(this.sounds.listener)
    this.particles = new BlockParticles(this.scene)
    this.worldFlashes = new MuzzleFlashes(this.scene)
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

  // Debug hooks for measuring from the console (see mount-game.ts).
  get debug() {
    return {
      worldView: this.worldView,
      pool: this.pool,
      transport: this.transport as Transport,
      assets: this.assets,
      sounds: this.sounds,
      info: this.renderer.info,
      snapshot: () => this.latest,
      camera: this.camera,
      setMode: (mode: CameraMode) => {
        if (mode !== this.mode) this.toggleMode()
      },
      renderOnce: () => this.frame(performance.now()),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.transport.dispose()
    this.highlight.dispose()
    this.particles.dispose()
    this.worldFlashes.dispose()
    this.viewmodel.dispose()
    this.sounds.dispose()
    for (const view of this.players.values()) view.dispose()
    for (const mesh of this.grenadeMeshes.values()) this.scene.remove(mesh)
    this.worldView.dispose()
    this.pool.dispose()
    this.material.dispose()
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
    this.particles.update(dt)
    this.worldFlashes.update(dt)
    this.callbacks.onView(this.input.yaw)

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    const me = this.localPlayer()
    if (this.mode === 'fps' && me?.alive) {
      const tool =
        me.slot === 1 ? me.weapon : me.slot === 2 ? 'shovel' : me.slot === 3 ? 'blocks' : 'grenade'
      const aiming = me.slot === 1 && this.input.isMouseHeld(2)
      this.viewmodel.update(this.camera, tool, this.speedOf(me.id), me.onGround, aiming, dt)
      this.renderer.clearDepth()
      this.renderer.render(this.viewmodel.scene, this.camera)
    }
    this.sampleFps(time)
  }

  private localPlayer(): PlayerSnapshot | null {
    return this.latest?.players.find((p) => p.id === LOCAL_PLAYER_ID) ?? null
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

  private readSlot(): void {
    for (let i = 1; i <= 4; i++) if (this.input.takePressed(`Digit${i}`)) this.slot = i
    const wheel = this.input.takeWheel()
    if (wheel !== 0) this.slot = ((((this.slot - 1 + wheel) % 4) + 4) % 4) + 1
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
    }
    return {
      seq: this.seq++,
      forward: fly ? 0 : this.input.axis('KeyS', 'KeyW'),
      strafe: fly ? 0 : this.input.axis('KeyA', 'KeyD'),
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      buttons,
      slot: this.slot,
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

    const now = performance.now()
    this.killFeed = this.killFeed.filter((entry) => entry.until > now)
    this.damageIndicators = this.damageIndicators.filter((entry) => entry.until > now)
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    if (me) {
      if (me.reloading && !this.wasReloading) this.sounds.play('reload', { volume: 0.7 })
      this.wasReloading = me.reloading
      this.callbacks.onHud({
        player: me,
        hitmarker: this.pendingHitmarker,
        killFeed: this.killFeed,
        damageIndicators: this.damageIndicators,
      })
      this.pendingHitmarker = null
    }
    this.camera.fov =
      me && me.slot === 1 && me.weapon === 'sniper' && this.input.isMouseHeld(2)
        ? SCOPED_FOV
        : DEFAULT_FOV
    this.camera.updateProjectionMatrix()
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
          } else this.sounds.playAt('shovel', ...event.origin, { volume: 0.6 })
          break
        }
        if (event.tool === 'blocks' || event.tool === 'grenade') break
        const sound = `shot-${event.tool}` as const
        if (local) {
          this.sounds.play(sound, { volume: 0.8 })
          this.effects.kick(event.tool)
          this.viewmodel.onShot(event.tool)
        } else {
          this.sounds.playAt(sound, ...event.origin, { refDistance: 12 })
          const [ox, oy, oz] = event.origin
          const [dx, dy, dz] = event.dir
          this.worldFlashes.spawn(ox + dx * 0.9, oy + dy * 0.9 - 0.25, oz + dz * 0.9, 0.5)
        }
        break
      }
      case 'hit':
        if (event.attacker === LOCAL_PLAYER_ID && event.victim !== LOCAL_PLAYER_ID) {
          this.pendingHitmarker = { head: event.zone === 'head' }
          this.sounds.play(event.zone === 'head' ? 'hit-head' : 'hit', { volume: 0.55 })
        }
        if (event.victim === LOCAL_PLAYER_ID) {
          this.sounds.play('hurt', { volume: 0.7 })
          this.pushDamageIndicator(snapshot, event.attacker)
        }
        break
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
      case 'blockDamaged':
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
        break
      case 'grenade': {
        const thrower = snapshot.players.find((p) => p.id === event.player)
        if (thrower) this.sounds.playAt('grenade-throw', ...thrower.pos, { volume: 0.6 })
        break
      }
      case 'explosion': {
        this.sounds.playAt('explosion', event.x, event.y, event.z, { refDistance: 14 })
        this.effects.shakeFrom(distance(eye, event), EXPLOSION_SHAKE_RANGE)
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
      if (player.id === LOCAL_PLAYER_ID) this.sounds.playVariant('footstep', 4, { volume: 0.3 })
      else this.sounds.playVariantAt('footstep', 4, ...player.pos, { volume: 0.5 })
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
      this.input.yaw,
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

  // Client-side preview of the block the shovel or the block tool will act on.
  private updateAimPreview(): void {
    if (this.mode === 'fps' && this.slot !== 2 && this.slot !== 3) {
      this.highlight.hide()
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
