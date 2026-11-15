import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { createGameConfig, type MatchSetup } from '@blockfront/sim/match/setup'
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
  ChestMarker,
  CompassMarker,
  DamageIndicator,
  FatalKind,
  KillFeedEntry,
  LoadStage,
  Phase,
  ScoreRow,
} from '../ui/hud-state.svelte.ts'
import type { Settings } from '../settings/settings.ts'
import { PRIMARIES } from '../settings/match-setup.ts'
import { sortRows } from '../ui/standings.ts'
import { ChestsView } from './chests-view.ts'
import type { LootGain } from './loot.ts'
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
import { TntFuses } from './tnt-fuse.ts'
import { ITEMS } from '@blockfront/sim/combat/weapons'
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
  chests: ChestMarker[]
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
  // Start-up progress 0..1; the menu waits for 'done'.
  onLoading: (stage: LoadStage, progress: number) => void
  onLoot: (gain: LootGain) => void
  // Primary for the next life, chosen with a number key on the death screen.
  onPrimary: (weapon: WeaponId) => void
}

const FPS_SAMPLE_MS = 500
// Past this many restored voxels a full skylight pass is cheaper than local re-floods.
const SKYLIGHT_LOCAL_EDITS = 400
// Number keys that pick the next primary on the death screen, in PRIMARIES order.
const PRIMARY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']
const DEFAULT_SEED = 1
const LOCAL_PLAYER_ID = 1
const REACH = 5
const GRENADE_FUSE = 3
// Full chests show on the compass within this many blocks.
const CHEST_COMPASS_RANGE = 40
// Share of the loading bar taken by meshing the world; the assets fill the rest.
const TERRAIN_SHARE = 0.85
// Reduce-motion setting: no camera shake, a quarter of the weapon bob.
const REDUCED_BOB = 0.25 // Where the camera sits while the menu is up: above the river, looking at the blue base.
const MENU_EYE = new Vector3(48, 42, 92)
const MENU_LOOK = new Vector3(48, 18, 34)

function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, cores - 1))
}

// Names are ids the HUD translates ('you', 'bot-2'); the config carries no localized text.
// Only seed 1 for now: the world is generated once at mount.
function matchConfig(setup: MatchSetup): GameConfig {
  return {
    ...createGameConfig({ ...setup, seed: DEFAULT_SEED }),
    // The pause panel's weapon selector applies at once only while developing.
    instantLoadout: import.meta.env.DEV,
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
  // The map as generated: every match starts from it, in the sim and here.
  private readonly pristineWorld: Uint8Array[]
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
  private readonly tntFuses: TntFuses
  private readonly effects = new CameraEffects()
  private readonly worldFlashes: MuzzleFlashes
  private readonly worldFlashLight = new PointLight('#ffb366', 0, 8, 2)
  private readonly cracks: BlockCracks
  private readonly marks: ImpactMarks
  private readonly tracers: Tracers
  private readonly casings: ShellCasings
  private readonly grenadeArc: GrenadeArc
  private readonly chests: ChestsView
  private terrainReady = false
  private assetsReady = false
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
  // The sim worker is stopped: paused, before the first lock of a match, on a hidden tab or after
  // a fatal error. Dead or on the result screen the match keeps running with the pointer free.
  private frozen = false
  private wasAlive = true
  private lastSetup: MatchSetup | null = null
  private scoreboardShown = false
  private aimedBlockId = 0
  private lastTime: number | null = null
  private framesInSample = 0
  private sampleStart: number | null = null

  // QA mode (dev builds, ?qa=1): no pointer lock needed, no pause on a hidden tab, and the
  // last events are kept for the QA API.
  private readonly qa: boolean
  private readonly recentEvents: { tick: number; event: GameEvent }[] = []
  // Counts matches on this renderer, so QA can tell one match's events from the next.
  private matchId = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: RendererCallbacks,
    settings: { qa?: boolean } = {},
  ) {
    this.qa = settings.qa === true
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
    this.pristineWorld = this.world.saveChunks()
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
    // The first full mesh also warms the mesher workers up; the menu waits for it.
    void this.worldView
      .rebuildAll((done, total) => {
        if (!this.terrainReady) callbacks.onLoading('terrain', (done / total) * TERRAIN_SHARE)
      })
      .then(() => {
        this.terrainReady = true
        this.reportLoading()
      })
    this.skylight.onTexture((texture) => {
      for (const material of Object.values(this.materials))
        material.uniforms.skylight!.value = texture
    })

    this.sounds = new SoundBank(this.scene, this.assets)
    this.camera.add(this.sounds.listener)
    this.guns = new GunAudio(this.sounds.listener.context)
    this.particles = new BlockParticles(this.scene)
    this.explosions = new ExplosionFx(this.scene)
    this.tntFuses = new TntFuses(this.scene, ITEMS.tnt.fuseSeconds)
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
    this.chests = new ChestsView(this.scene)
    void this.assets.ready.then(() => {
      this.assetsReady = true
      callbacks.onAssetsReady()
      this.reportLoading()
    })

    this.input = new InputState(canvas, (locked) => {
      if (locked) this.sounds.resume()
      callbacks.onPointerLock(locked)
      // Getting the lock resumes; losing it pauses, except while dead or after the match, when
      // the pointer is freed on purpose for the death and result screens.
      if (locked && this.phase === 'paused') this.resume()
      else if (!locked && this.phase === 'playing' && !this.pointerFree()) this.pause()
    })
    this.input.onLockFailure = (reason) => callbacks.onLockFailure(reason)
    this.input.onFreeKey = (code) => {
      if (code === 'KeyP' && this.phase === 'paused') this.continueFromPause()
      const index = PRIMARY_KEYS.indexOf(code)
      const weapon = PRIMARIES[index]
      if (weapon && this.phase === 'playing' && this.localDead()) {
        this.setPrimary(weapon)
        callbacks.onPrimary(weapon)
      }
    }
    // A click on the canvas resumes; while dead there is no lock to take back.
    this.input.onFreeClick = () => {
      if (this.phase === 'paused') this.continueFromPause()
    }
    this.input.qa = this.qa
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
      tntFuses: this.tntFuses,
      cracks: this.cracks,
      marks: this.marks,
      currentSlot: () => this.controls.slot,
      onDryFire: callbacks.onDryFire,
      onBlast: callbacks.onBlast,
      onLoot: callbacks.onLoot,
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

  private reportLoading(): void {
    if (this.terrainReady && this.assetsReady) this.callbacks.onLoading('done', 1)
    else if (this.terrainReady) this.callbacks.onLoading('assets', TERRAIN_SHARE)
  }

  // Player settings from the panel: look, FOV, audio levels and camera motion.
  applySettings(settings: Settings): void {
    this.input.sensitivity = settings.sensitivity
    this.input.invertY = settings.invertY
    this.ads.baseFov = settings.fov
    this.ads.adsSensitivity = settings.adsSensitivity
    this.guns.setVolumes(settings.volumeMaster, settings.volumeWeapons, settings.volumeWorld)
    this.sounds.setVolume(settings.volumeMaster * settings.volumeWorld)
    this.effects.motionScale = settings.reduceMotion ? 0 : 1
    this.viewmodel.setBobScale(settings.reduceMotion ? REDUCED_BOB : 1)
  }

  // Match lifecycle. The sim worker starts frozen and the pointer lock, which the Play click
  // requests, starts it. Esc, P, a lost lock, a hidden tab or a fatal error freeze it again: a
  // single-player pause stops the whole match.
  startMatch(setup: MatchSetup): void {
    this.lastSetup = setup
    this.matchId++
    this.resetMatchState()
    this.restoreWorld()
    this.transport.start(matchConfig(setup), LOCAL_PLAYER_ID)
    this.transport.pause()
    this.frozen = true
    this.setPhase('paused')
    this.input.requestLock()
  }

  // Same setup, fresh match; the result screen may change the primary.
  restartMatch(primary?: WeaponId): void {
    if (!this.lastSetup) return
    this.transport.stop()
    this.setPhase('menu')
    this.startMatch(primary ? { ...this.lastSetup, primary } : this.lastSetup)
  }

  endMatch(): void {
    if (this.phase === 'menu') return
    this.transport.stop()
    this.frozen = false
    this.setPhase('menu')
    this.input.releaseLock()
    this.resetMatchState()
  }

  pause(): void {
    if (this.phase !== 'playing' || this.matchEnded()) return
    this.freeze()
  }

  private freeze(): void {
    if (this.phase === 'menu') return
    if (!this.frozen) this.transport.pause()
    this.frozen = true
    if (this.phase === 'playing') {
      this.setPhase('paused')
      this.input.releaseLock()
    }
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.input.clearAll()
    if (this.frozen) {
      this.transport.resume()
      this.frozen = false
      this.inputClock.reset()
    }
    this.setPhase('playing')
  }

  // Dead or the match over: resume without the lock, the screens need the pointer.
  private continueFromPause(): void {
    if (this.pointerFree()) this.resume()
    else this.input.requestLock()
  }

  private localDead(): boolean {
    return this.buffer.player(LOCAL_PLAYER_ID)?.alive === false
  }

  private matchEnded(): boolean {
    return this.buffer.latest?.match.state === 'ended'
  }

  private pointerFree(): boolean {
    return this.localDead() || this.matchEnded()
  }

  private setPhase(phase: Phase): void {
    this.phase = phase
    this.updateLockOnClick()
    this.callbacks.onPhase(phase)
  }

  // A canvas click takes the lock while a match is up, but not on the death or result screens.
  private updateLockOnClick(): void {
    this.input.lockOnClick = this.phase !== 'menu' && !this.pointerFree()
  }

  // The sim builds a fresh map for every match, so the edits of the last one (dug holes, placed
  // blocks, craters) are undone here too; otherwise they linger as invisible blocks or ghost
  // ones. Few edits re-flood the light locally; a crater-strewn map recomputes it whole.
  private restoreWorld(): void {
    const diff = this.world.diffFrom(this.pristineWorld)
    if (diff.length === 0) return
    const local = diff.length <= SKYLIGHT_LOCAL_EDITS
    for (const [x, y, z, id] of diff) {
      this.worldView.setBlock(x, y, z, id)
      if (local) this.skylight.onBlockChanged(x, y, z)
    }
    if (!local) this.skylight.recompute()
    void this.worldView.flushDirty()
  }

  private resetMatchState(): void {
    this.recentEvents.length = 0
    this.input.clearAll()
    this.buffer.clear()
    this.entities.clear()
    this.chests.clear()
    this.cracks.clearAll()
    this.marks.clearAll()
    this.tntFuses.clearAll()
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
    this.wasAlive = true
  }

  private fatal(kind: FatalKind, message: string): void {
    console.error(kind, message)
    this.freeze()
    this.callbacks.onFatal({ kind, message })
  }

  // The GPU took the context (driver reset, too many tabs): stop drawing until it comes back.
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    this.renderer.setAnimationLoop(null)
    this.freeze()
    this.callbacks.onFatal({ kind: 'webgl', message: '' })
  }

  private readonly onContextRestored = (): void => {
    this.lastTime = null
    this.renderer.setAnimationLoop(this.frame)
    this.callbacks.onFatal(null)
  }

  private readonly onVisibility = (): void => {
    if (document.hidden && !this.qa) this.freeze()
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
      startMatch: (setup: MatchSetup) => this.startMatch(setup),
      restartMatch: () => this.restartMatch(),
      controls: this.controls,
      world: this.world,
      buffer: this.buffer,
      recentEvents: this.recentEvents,
      phase: () => this.phase,
      chests: this.chests,
      matchId: () => this.matchId,
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
    this.tntFuses.dispose()
    this.worldFlashes.dispose()
    this.cracks.dispose()
    this.marks.dispose()
    this.tracers.dispose()
    this.casings.dispose()
    this.grenadeArc.dispose()
    this.chests.dispose()
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
    this.chests.update(this.buffer.latest?.chests ?? [], dt, time)
    this.updateAimPreview()
    this.updateGrenadeArc()
    this.particles.update(dt)
    this.explosions.update(dt)
    this.tntFuses.update(dt)
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
    const bySlot: Record<number, Tool> = {
      2: 'pistol',
      3: 'shovel',
      4: 'blocks',
      5: 'grenade',
      6: 'tnt',
      7: 'ladder',
      8: 'bandage',
    }
    return me.slot === 1 ? me.weapon : (bySlot[me.slot] ?? 'grenade')
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
      if (this.qa) {
        this.recentEvents.push({ tick: snapshot.tick, event })
        if (this.recentEvents.length > 400) this.recentEvents.shift()
      }
    }
    if (blocksChanged) void this.worldView.flushDirty()
    const me = snapshot.players.find((p) => p.id === LOCAL_PLAYER_ID) ?? null
    this.feedback.afterSnapshot(snapshot, me)
    this.entities.updateGlints(snapshot)
    // Death and the end of the match free the pointer for their screens' buttons.
    if (snapshot.match.state === 'ended' && this.buffer.previous?.match.state !== 'ended')
      this.input.releaseLock()
    if (me && !me.alive && this.wasAlive) this.input.releaseLock()
    if (me) this.wasAlive = me.alive
    this.updateLockOnClick()
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
    const chests: ChestMarker[] = []
    for (const chest of snapshot.chests) {
      const distance = Math.hypot(chest.pos[0] - eye[0], chest.pos[2] - eye[2])
      if (!chest.full || distance > CHEST_COMPASS_RANGE) continue
      chests.push({ id: chest.id, offset: compassOffset(this.input.yaw, eye, chest.pos), distance })
    }
    const rows: ScoreRow[] = snapshot.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths,
      captures: p.captures,
      returns: p.returns,
      score: p.score,
      damage: p.damageDealt,
      alive: p.alive,
    }))
    const ownFlag = snapshot.flags.find((f) => f.team === me.team)?.state ?? 'base'
    return {
      match: snapshot.match,
      ownFlag,
      compass,
      chests,
      rows: sortRows(rows, snapshot.match.mode),
    }
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
    const aims = slot === 3 || slot === 4 || slot === 6 || slot === 7
    if (this.mode === 'fps' && !aims) {
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
