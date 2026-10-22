import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { TICK_SECONDS } from '@blockfront/sim/config'
import type {
  GameConfig,
  GameEvent,
  MatchSnapshot,
  PlayerSnapshot,
  Snapshot,
} from '@blockfront/sim/game'
import type { SolidTest } from '@blockfront/sim/physics/sweep'
import { raycastVoxels } from '@blockfront/sim/raycast/dda'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { generateWorld } from '@blockfront/sim/world/generator'
import { isSolid } from '@blockfront/sim/world/blocks'
import type { World } from '@blockfront/sim/world/world'
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Euler,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
  type ShaderMaterial,
} from 'three'
import { AssetStore } from '../assets/asset-store.ts'
import { SoundBank } from '../audio/sound-bank.ts'
import { GunAudio } from '../audio/gun-audio.ts'
import { Controls } from '../input/controls.ts'
import { FlyCamera } from '../input/fly-camera.ts'
import { InputState, type LockFailure } from '../input/input-state.ts'
import { SkylightTexture } from '../light/skylight-texture.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
import { LocalTransport } from '../net/local-transport.ts'
import type { Transport } from '../net/transport.ts'
import type {
  CameraMode,
  CompassMarker,
  DamageIndicator,
  FatalKind,
  KillFeedEntry,
  Phase,
  ScoreRow,
} from '../ui/hud-state.svelte.ts'
import { AdsView, DEFAULT_FOV } from './ads-view.ts'
import { BlockHighlight } from './block-highlight.ts'
import { BlockParticles } from './block-particles.ts'
import { CameraEffects } from './camera-effects.ts'
import { EntitiesView } from './entities-view.ts'
import { EventFeedback } from './event-feedback.ts'
import { Sky, SKY_HORIZON } from './sky.ts'
import { SnapshotBuffer } from './snapshot-buffer.ts'
import { useSphericalFog } from './spherical-fog.ts'
import { FOG_FAR, FOG_NEAR, UnderwaterView } from './underwater.ts'
import { Viewmodel, type Tool, type ViewmodelState } from './viewmodel.ts'
import { BlockCracks } from './block-cracks.ts'
import { ImpactMarks } from './impact-marks.ts'
import { Tracers } from './tracers.ts'
import { ShellCasings } from './shell-casings.ts'
import { displayName } from '../ui/labels.ts'
import { compassOffset } from './compass.ts'
import { ExplosionFx } from './explosion-fx.ts'
import { GrenadeArc } from './grenade-arc.ts'
import { CHARGE, throwSpeed, throwVelocity } from '@blockfront/sim/combat/grenade'
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

export interface MatchUpdate {
  match: MatchSnapshot
  ownFlag: CompassMarker['state']
  compass: CompassMarker[]
  rows: ScoreRow[]
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
  onPhase: (phase: Phase) => void
  onShowStats: (shown: boolean) => void
  onLockFailure: (reason: LockFailure) => void
  // null once a lost WebGL context comes back.
  onFatal: (fatal: { kind: FatalKind; message: string } | null) => void
  onMatch: (update: MatchUpdate) => void
  onScoreboard: (shown: boolean) => void
}

const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const LOCAL_PLAYER_ID = 1
const REACH = 5
const GRENADE_FUSE = 3
// Where the camera sits while the menu is up: above the river, looking at the blue base.
const MENU_EYE = new Vector3(48, 42, 92)
const MENU_LOOK = new Vector3(48, 18, 34)
// Both on the flat plateau of the blue base, a few blocks past the towers.
const DUMMY_SPAWNS: [number, number][] = [
  [45, 28],
  [51, 30],
]

function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, cores - 1))
}

// Names are ids the HUD translates ('you', 'dummy-1'); the config carries no localized text.
// One blue dummy stands in the base so allied nameplates can be seen.
function matchConfig(seed: number, primary: WeaponId): GameConfig {
  return {
    seed,
    // The pause panel's weapon selector applies at once only while developing.
    instantLoadout: import.meta.env.DEV,
    players: [
      { id: LOCAL_PLAYER_ID, team: 'blue', name: 'you', primary },
      ...DUMMY_SPAWNS.map((spawn, i) => ({
        id: 10 + i,
        team: 'red' as const,
        name: `dummy-${i + 1}`,
        dummy: true,
        spawn,
      })),
      { id: 20, team: 'blue', name: 'dummy-3', dummy: true, spawn: [45, 18] },
    ],
  }
}

// Owns the WebGL renderer, the scene and the frame loop, and wires the sim transport to the
// views. Reactions to events live in EventFeedback; slots and buttons in Controls.
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
  private readonly controls: Controls
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
  private readonly grenadeArc: GrenadeArc
  private readonly viewmodel: Viewmodel
  private readonly buffer = new SnapshotBuffer()
  private readonly entities: EntitiesView
  private readonly feedback: EventFeedback
  private readonly ads: AdsView
  private readonly underwater: UnderwaterView
  private readonly cameraEuler = new Euler(0, 0, 0, 'YXZ')
  private readonly viewDirection = new Vector3()
  private lastOnGround = true
  private lastVy = 0
  private lastTickAt = -1
  private mode: CameraMode = 'fps'
  private showHitboxes = false
  private showStats = false
  private phase: Phase = 'menu'
  private lastPrimary: WeaponId = 'rifle'
  private scoreboardShown = false
  private aimedBlockId = 0
  private lastTime: number | null = null
  private framesInSample = 0
  private sampleStart: number | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: RendererCallbacks,
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
      // The lock is the match's run switch: losing it pauses, getting it back resumes.
      if (locked && this.phase === 'paused') this.resume()
      else if (!locked && this.phase === 'playing') this.pause()
    })
    this.input.onLockFailure = (reason) => callbacks.onLockFailure(reason)
    this.pool.onFatal = (message) => this.fatal('mesher', message)
    this.input.yaw = Math.PI
    this.flyCamera = new FlyCamera(this.camera, this.input)
    this.controls = new Controls(this.input, {
      onItem: (item) => callbacks.onItem(item),
      onBlockColor: (color) => this.viewmodel.setBlockColor(color),
      localPlayer: () => this.buffer.player(LOCAL_PLAYER_ID),
      aimedBlockId: () => this.aimedBlockId,
    })
    this.entities = new EntitiesView(
      this.scene,
      this.assets,
      this.worldFlashes,
      this.buffer,
      LOCAL_PLAYER_ID,
      displayName,
    )
    this.ads = new AdsView(this.camera, this.input, this.sounds, callbacks.onScope)
    this.underwater = new UnderwaterView(
      this.scene,
      this.sky,
      this.renderer,
      this.world,
      callbacks.onUnderwater,
    )
    this.feedback = new EventFeedback({
      localId: LOCAL_PLAYER_ID,
      camera: this.camera,
      input: this.input,
      buffer: this.buffer,
      world: this.world,
      worldView: this.worldView,
      skylight: this.skylight,
      sounds: this.sounds,
      guns: this.guns,
      viewmodel: this.viewmodel,
      effects: this.effects,
      tracers: this.tracers,
      casings: this.casings,
      worldFlashes: this.worldFlashes,
      worldFlashLight: this.worldFlashLight,
      particles: this.particles,
      explosions: this.explosions,
      cracks: this.cracks,
      marks: this.marks,
      currentSlot: () => this.controls.slot,
      onDryFire: callbacks.onDryFire,
      onBlast: callbacks.onBlast,
    })

    this.transport = new LocalTransport()
    this.transport.onUpdate((snapshot, events) => this.onUpdate(snapshot, events))
    this.transport.onError((message) => this.fatal('sim', message))

    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame)
  }

  // Match lifecycle. The sim worker starts paused and the pointer lock, which the Play click
  // requests, flips it to running; Esc, P, a hidden tab or a lost lock pause it again.
  startMatch(primary: WeaponId): void {
    this.lastPrimary = primary
    this.resetMatchState()
    this.transport.start(matchConfig(DEFAULT_SEED, primary), LOCAL_PLAYER_ID)
    this.transport.pause()
    this.setPhase('paused')
    this.input.requestLock()
  }

  // Same loadout, fresh match.
  restartMatch(): void {
    this.transport.stop()
    this.setPhase('menu')
    this.startMatch(this.lastPrimary)
  }

  endMatch(): void {
    if (this.phase === 'menu') return
    this.transport.stop()
    this.setPhase('menu')
    this.input.releaseLock()
    this.resetMatchState()
  }

  pause(): void {
    if (this.phase !== 'playing') return
    this.transport.pause()
    this.setPhase('paused')
    this.input.releaseLock()
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.transport.resume()
    this.inputClock.reset()
    this.setPhase('playing')
  }

  private setPhase(phase: Phase): void {
    this.phase = phase
    this.callbacks.onPhase(phase)
  }

  private resetMatchState(): void {
    this.buffer.clear()
    this.entities.clear()
    this.feedback.reset()
    this.controls.reset()
    this.grenadeArc.hide()
    this.highlight.hide()
    this.input.yaw = Math.PI
    this.input.pitch = 0
    this.inputClock.reset()
    this.lastOnGround = true
    this.lastVy = 0
    this.lastTickAt = -1
  }

  private fatal(kind: FatalKind, message: string): void {
    console.error(kind, message)
    if (this.phase === 'playing') this.pause()
    this.callbacks.onFatal({ kind, message })
  }

  // The GPU took the context (driver reset, too many tabs): stop drawing until it comes back.
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    this.renderer.setAnimationLoop(null)
    if (this.phase === 'playing') this.pause()
    this.callbacks.onFatal({ kind: 'webgl', message: '' })
  }

  private readonly onContextRestored = (): void => {
    this.lastTime = null
    this.renderer.setAnimationLoop(this.frame)
    this.callbacks.onFatal(null)
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause()
  }

  // Loadout: one primary at a time, chosen from the HUD panel. Applies immediately for now;
  // with bots and maps it will only apply after a death.
  setPrimary(weapon: WeaponId): void {
    this.controls.setPrimary(weapon)
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
      snapshot: () => this.buffer.latest,
      skylight: this.skylight,
      viewmodel: this.viewmodel,
      input: this.input,
      bakeMs: this.bakeMs,
      camera: this.camera,
      setMode: (mode: CameraMode) => {
        if (mode !== this.mode) this.toggleMode()
      },
      setSlot: (slot: number) => this.controls.selectSlot(slot),
      renderOnce: () => this.frame(performance.now()),
      explosions: this.explosions,
      startMatch: (primary: WeaponId) => this.startMatch(primary),
      restartMatch: () => this.restartMatch(),
      endMatch: () => this.endMatch(),
      pause: () => this.pause(),
      resume: () => this.resume(),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    document.removeEventListener('visibilitychange', this.onVisibility)
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
    this.entities.dispose()
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

    if (this.input.takePressed('F3')) {
      this.showStats = !this.showStats
      this.callbacks.onShowStats(this.showStats)
    }
    if (import.meta.env.DEV) {
      if (this.input.takePressed('KeyF')) this.toggleMode()
      if (this.input.takePressed('KeyH')) {
        this.showHitboxes = !this.showHitboxes
        this.callbacks.onHitboxes(this.showHitboxes)
      }
    }
    const scoreboard = this.phase === 'playing' && this.input.isHeld('Tab')
    if (scoreboard !== this.scoreboardShown) {
      this.scoreboardShown = scoreboard
      this.callbacks.onScoreboard(scoreboard)
    }
    if (this.phase === 'playing') {
      if (this.input.takePressed('KeyP')) this.pause()
      this.controls.readSlot()
      const { steps } = this.inputClock.advance(elapsed)
      for (let i = 0; i < steps; i++) {
        this.transport.sendInput(this.controls.buildInput(this.mode === 'fly'))
        this.input.endTick()
      }
    }

    const alpha = this.buffer.alpha(performance.now())
    this.effects.update(dt)
    if (this.phase === 'menu') this.placeMenuCamera(time)
    else if (this.mode === 'fps') this.placeCamera(alpha)
    else this.flyCamera.update(dt)
    this.entities.update(alpha, dt, this.showHitboxes, time)
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
    this.underwater.update(this.camera, dt)
    this.materials.decor.uniforms.time!.value = time / 1000
    this.materials.liquid.uniforms.time!.value = time / 1000
    this.callbacks.onView(this.input.yaw)

    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    const me = this.buffer.player(LOCAL_PLAYER_ID)
    if (this.mode === 'fps' && me?.alive) {
      const tool = this.heldTool(me)
      this.ads.update(tool, me.ads, dt)
      this.viewmodel.update(this.camera, this.viewmodelState(me, tool), dt)
      this.viewmodel.setVisible(!this.ads.scoped)
      this.renderer.clearDepth()
      this.renderer.render(this.viewmodel.scene, this.viewmodel.camera)
    } else {
      this.ads.update('shovel', 0, dt)
    }
    this.sampleFps(time)
  }

  private heldTool(me: PlayerSnapshot): Tool {
    return me.slot === 1
      ? me.weapon
      : me.slot === 2
        ? 'pistol'
        : me.slot === 3
          ? 'shovel'
          : me.slot === 4
            ? 'blocks'
            : 'grenade'
  }

  private viewmodelState(me: PlayerSnapshot, tool: Tool): ViewmodelState {
    const [mouseDx, mouseDy] = this.input.takeMouseDelta()
    const vy = this.buffer.verticalSpeedOf(me.id)
    const landingSpeed = me.onGround && !this.lastOnGround && this.lastVy < -3 ? -this.lastVy : 0
    this.lastOnGround = me.onGround
    this.lastVy = vy
    const moving = this.input.axis('KeyS', 'KeyW') !== 0 || this.input.axis('KeyA', 'KeyD') !== 0
    return {
      tool,
      speed: this.buffer.speedOf(me.id),
      lateral: this.buffer.lateralSpeedOf(me.id, this.input.yaw),
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

  private onUpdate(snapshot: Snapshot, events: GameEvent[]): void {
    this.buffer.push(snapshot, performance.now())

    let blocksChanged = false
    for (const event of events) {
      if (event.type === 'block') blocksChanged = true
      this.feedback.handle(snapshot, event)
    }
    if (blocksChanged) void this.worldView.flushDirty()
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID) ?? null
    this.feedback.afterSnapshot(snapshot, me)
    this.entities.updateGlints(snapshot)
    if (!me) return
    this.controls.followSim(me)
    this.callbacks.onHud({
      player: me,
      hitmarker: this.feedback.takeHitmarker(),
      killFeed: this.feedback.killFeed,
      damageIndicators: this.feedback.damageIndicators,
    })
    this.callbacks.onMatch(this.matchUpdate(snapshot, me))
  }

  // Score, clock, compass markers toward both flags and the scoreboard rows.
  private matchUpdate(snapshot: Snapshot, me: PlayerSnapshot): MatchUpdate {
    const eye: [number, number, number] = [me.pos[0], me.pos[1] + me.eyeHeight, me.pos[2]]
    const compass: CompassMarker[] = snapshot.flags.map((flag) => ({
      team: flag.team,
      state: flag.state,
      offset: compassOffset(this.input.yaw, eye, flag.pos),
      distance: Math.hypot(flag.pos[0] - eye[0], flag.pos[2] - eye[2]),
    }))
    const rows: ScoreRow[] = snapshot.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      captures: p.captures,
      returns: p.returns,
      damage: p.damageDealt,
      alive: p.alive,
    }))
    rows.sort((a, b) => b.captures - a.captures || b.kills - a.kills || a.id - b.id)
    const ownFlag = snapshot.flags.find((f) => f.team === me.team)?.state ?? 'base'
    return { match: snapshot.match, ownFlag, compass, rows }
  }

  // Menu backdrop: a fixed vantage over the map with a slow drift.
  private placeMenuCamera(time: number): void {
    const drift = Math.sin(time / 9000) * 6
    this.camera.position.set(MENU_EYE.x + drift, MENU_EYE.y, MENU_EYE.z)
    this.camera.lookAt(MENU_LOOK)
  }

  // Own position interpolated between the last two snapshots; the look is applied without delay,
  // then recoil and shake are layered on top.
  private placeCamera(alpha: number): void {
    const own = this.buffer.interpolated(LOCAL_PLAYER_ID, alpha)
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

  // While the grenade is held: the arc it would fly if released now, and a tick every 0.5 s.
  private updateGrenadeArc(): void {
    const me = this.buffer.player(LOCAL_PLAYER_ID)
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
    const slot = this.controls.slot
    if (this.mode === 'fps' && slot !== 3 && slot !== 4) {
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
      tick: this.buffer.tick,
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
