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
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { FlyCamera } from '../input/fly-camera.ts'
import { InputState } from '../input/input-state.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
import { LocalTransport } from '../net/local-transport.ts'
import type { Transport } from '../net/transport.ts'
import type { CameraMode, KillFeedEntry } from '../ui/hud-state.svelte.ts'
import { BlockHighlight } from './block-highlight.ts'
import { PlayerView } from './player-view.ts'
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
}

export interface RendererCallbacks {
  onStats: (stats: RenderStats) => void
  onPointerLock: (locked: boolean) => void
  onMode: (mode: CameraMode) => void
  onHitboxes: (shown: boolean) => void
  onHud: (update: HudUpdate) => void
}

const SKY = new Color('#9cc7ef')
const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const LOCAL_PLAYER_ID = 1
const REACH = 5
const TICK_MS = TICK_SECONDS * 1000
const KILL_FEED_MS = 6000
const DEFAULT_FOV = 75
const SCOPED_FOV = 30
const DUMMY_SPAWNS: [number, number][] = [
  [61, 28],
  [67, 32],
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
  private readonly players = new Map<number, PlayerView>()
  private readonly grenadeMeshes = new Map<number, Mesh>()
  private readonly grenadeGeometry = new SphereGeometry(0.15, 10, 8)
  private readonly grenadeMaterial = new MeshLambertMaterial({ color: '#2a2f2a' })
  private readonly cameraEuler = new Euler(0, 0, 0, 'YXZ')
  private readonly viewDirection = new Vector3()
  private previous: Snapshot | null = null
  private latest: Snapshot | null = null
  private latestAt = 0
  private mode: CameraMode = 'fps'
  private showHitboxes = false
  private slot = 1
  private seq = 0
  private killFeed: KillFeedEntry[] = []
  private nextFeedId = 1
  private tick = 0
  private lastTime: number | null = null
  private framesInSample = 0
  private sampleStart: number | null = null
  private pendingHitmarker: { head: boolean } | null = null

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

    this.input = new InputState(canvas, callbacks.onPointerLock)
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
      info: this.renderer.info,
      snapshot: () => this.latest,
      renderOnce: () => this.frame(performance.now()),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.transport.dispose()
    this.highlight.dispose()
    for (const view of this.players.values()) view.dispose()
    for (const mesh of this.grenadeMeshes.values()) this.scene.remove(mesh)
    this.grenadeGeometry.dispose()
    this.grenadeMaterial.dispose()
    this.worldView.dispose()
    this.pool.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
    this.lastTime = time

    if (this.input.takePressed('KeyF')) this.toggleMode()
    if (this.input.takePressed('KeyH')) {
      this.showHitboxes = !this.showHitboxes
      this.callbacks.onHitboxes(this.showHitboxes)
    }
    this.readSlot()

    const { steps } = this.inputClock.advance(elapsed)
    for (let i = 0; i < steps; i++) this.transport.sendInput(this.buildInput())

    const alpha = Math.min(1, (performance.now() - this.latestAt) / TICK_MS)
    if (this.mode === 'fps') this.placeCamera(alpha)
    else this.flyCamera.update(Math.min(elapsed, 0.1))
    this.updateOthers(alpha)
    this.updateAimPreview()

    this.renderer.render(this.scene, this.camera)
    this.sampleFps(time)
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
      switch (event.type) {
        case 'block':
          this.worldView.setBlock(event.x, event.y, event.z, event.id)
          blocksChanged = true
          break
        case 'hit':
          if (event.attacker === LOCAL_PLAYER_ID && event.victim !== LOCAL_PLAYER_ID)
            this.pendingHitmarker = { head: event.zone === 'head' }
          break
        case 'death':
          this.pushKillFeed(snapshot, event.attacker, event.victim, event.tool)
          break
      }
    }
    if (blocksChanged) void this.worldView.flushDirty()

    const now = performance.now()
    this.killFeed = this.killFeed.filter((entry) => entry.until > now)
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID)
    if (me) {
      this.callbacks.onHud({
        player: me,
        hitmarker: this.pendingHitmarker,
        killFeed: this.killFeed,
      })
      this.pendingHitmarker = null
    }
    this.camera.fov =
      me && me.slot === 1 && me.weapon === 'sniper' && this.input.isMouseHeld(2)
        ? SCOPED_FOV
        : DEFAULT_FOV
    this.camera.updateProjectionMatrix()
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

  // Own position interpolated between the last two snapshots; the look is applied without delay.
  private placeCamera(alpha: number): void {
    const own = this.interpolated(LOCAL_PLAYER_ID, alpha)
    if (own) {
      const [me, pos] = own
      this.camera.position.set(pos[0], pos[1] + me.eyeHeight, pos[2])
    }
    this.cameraEuler.set(this.input.pitch, this.input.yaw, 0)
    this.camera.quaternion.setFromEuler(this.cameraEuler)
  }

  private updateOthers(alpha: number): void {
    if (!this.latest) return
    for (const player of this.latest.players) {
      if (player.id === LOCAL_PLAYER_ID) continue
      let view = this.players.get(player.id)
      if (!view) {
        view = new PlayerView(this.scene, player.team)
        this.players.set(player.id, view)
      }
      const data = this.interpolated(player.id, alpha)
      if (data) view.update(player, data[1][0], data[1][1], data[1][2], this.showHitboxes)
    }

    const seen = new Set<number>()
    for (const grenade of this.latest.grenades) {
      seen.add(grenade.id)
      let mesh = this.grenadeMeshes.get(grenade.id)
      if (!mesh) {
        mesh = new Mesh(this.grenadeGeometry, this.grenadeMaterial)
        this.scene.add(mesh)
        this.grenadeMeshes.set(grenade.id, mesh)
      }
      mesh.position.set(grenade.pos[0], grenade.pos[1], grenade.pos[2])
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
