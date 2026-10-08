import { TICK_SECONDS, WORLD_SIZE } from '@blockfront/sim/config'
import {
  createPlayer,
  playerAabb,
  stepPlayer,
  type MoveInput,
  type PlayerState,
} from '@blockfront/sim/physics/player-controller'
import type { SolidTest, Vec3 } from '@blockfront/sim/physics/sweep'
import { raycastVoxels, type VoxelHit } from '@blockfront/sim/raycast/dda'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { generateWorld } from '@blockfront/sim/world/generator'
import { BLOCK } from '@blockfront/sim/world/palette'
import type { World } from '@blockfront/sim/world/world'
import { Color, Euler, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { FlyCamera } from '../input/fly-camera.ts'
import { InputState } from '../input/input-state.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
import { BlockHighlight } from './block-highlight.ts'
import type { CameraMode } from './frame-stats.svelte.ts'
import { createVoxelMaterial } from './voxel-material.ts'
import { WorldView } from './world-view.ts'

export interface RenderStats {
  fps: number
  tick: number
  meshAvgMs: number
  meshMaxMs: number
  quads: number
}

export interface RendererCallbacks {
  onStats: (stats: RenderStats) => void
  onPointerLock: (locked: boolean) => void
  onMode: (mode: CameraMode) => void
}

const SKY = new Color('#9cc7ef')
const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const REACH = 5
const PLACE_BLOCK = BLOCK.blue
const SPAWN_XZ: [number, number] = [WORLD_SIZE.x / 2, 17]

function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, cores - 1))
}

function spawnPosition(world: World): Vec3 {
  const [x, z] = SPAWN_XZ
  for (let y = WORLD_SIZE.y - 1; y >= 0; y--) {
    if (world.getBlock(x, y, z) !== BLOCK.air) return [x + 0.5, y + 1, z + 0.5]
  }
  return [x + 0.5, 1, z + 0.5]
}

export class GameRenderer {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(75, 1, 0.1, 400)
  private readonly clock = new FixedStep(TICK_SECONDS, 5)
  private readonly resizeObserver: ResizeObserver
  private readonly pool = new MesherPool(workerCount())
  private readonly material = createVoxelMaterial()
  private readonly world: World
  private readonly worldView: WorldView
  private readonly input: InputState
  private readonly flyCamera: FlyCamera
  private readonly highlight = new BlockHighlight()
  private readonly isSolid: SolidTest
  private readonly player: PlayerState
  private readonly previousPos: Vec3
  private readonly cameraEuler = new Euler(0, 0, 0, 'YXZ')
  private readonly viewDirection = new Vector3()
  private mode: CameraMode = 'fps'
  private aimed: VoxelHit | null = null
  private tick = 0
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
    this.scene.background = SKY
    this.scene.fog = new Fog(SKY, 90, 260)
    this.scene.add(this.highlight.object)

    this.world = generateWorld(DEFAULT_SEED)
    this.isSolid = (x, y, z) => this.world.getBlock(x, y, z) !== BLOCK.air
    this.worldView = new WorldView(this.scene, this.world, this.pool, this.material)
    const buildStart = performance.now()
    void this.worldView.rebuildAll().then(() => {
      const { avgMs, maxMs, count } = this.pool.stats()
      console.info(
        `world meshed: ${count} chunks, ${this.worldView.totalQuads} quads, ` +
          `${avgMs.toFixed(2)} ms avg / ${maxMs.toFixed(2)} ms max per chunk, ` +
          `${(performance.now() - buildStart).toFixed(0)} ms wall with ${this.pool.size} workers`,
      )
    })

    this.player = createPlayer(spawnPosition(this.world))
    this.previousPos = [...this.player.pos]
    this.input = new InputState(canvas, callbacks.onPointerLock)
    // Face the enemy base (+Z); yaw 0 looks down -Z.
    this.input.yaw = Math.PI
    this.flyCamera = new FlyCamera(this.camera, this.input)
    this.placeCamera(0)

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
      info: this.renderer.info,
      player: this.player,
      renderOnce: () => this.frame(performance.now()),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.highlight.dispose()
    this.worldView.dispose()
    this.pool.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
    this.lastTime = time
    const { steps, alpha } = this.clock.advance(elapsed)
    this.tick += steps

    if (this.input.takePressed('KeyF')) this.toggleMode()

    if (this.mode === 'fps') {
      const move = this.readMoveInput()
      for (let i = 0; i < steps; i++) {
        this.previousPos[0] = this.player.pos[0]
        this.previousPos[1] = this.player.pos[1]
        this.previousPos[2] = this.player.pos[2]
        stepPlayer(this.player, move, this.isSolid, TICK_SECONDS)
      }
      this.placeCamera(alpha)
    } else {
      this.flyCamera.update(Math.min(elapsed, 0.1))
    }

    this.updateAim()
    if (this.input.takeClick(0)) this.dig()
    if (this.input.takeClick(2)) this.place()

    this.renderer.render(this.scene, this.camera)
    this.sampleFps(time)
  }

  private readMoveInput(): MoveInput {
    return {
      forward: this.input.axis('KeyS', 'KeyW'),
      strafe: this.input.axis('KeyA', 'KeyD'),
      yaw: this.input.yaw,
      jump: this.input.isHeld('Space'),
      crouch: this.input.isHeld('ControlLeft') || this.input.isHeld('KeyC'),
      sprint: this.input.isHeld('ShiftLeft'),
    }
  }

  // Render between the last two ticks; the look direction is applied without delay.
  private placeCamera(alpha: number): void {
    const { pos } = this.player
    this.camera.position.set(
      this.previousPos[0] + (pos[0] - this.previousPos[0]) * alpha,
      this.previousPos[1] + (pos[1] - this.previousPos[1]) * alpha + this.player.eyeHeight,
      this.previousPos[2] + (pos[2] - this.previousPos[2]) * alpha,
    )
    this.cameraEuler.set(this.input.pitch, this.input.yaw, 0)
    this.camera.quaternion.setFromEuler(this.cameraEuler)
  }

  private toggleMode(): void {
    if (this.mode === 'fps') {
      this.mode = 'fly'
    } else {
      // Drop the player where the free camera was, feet below the eye.
      this.mode = 'fps'
      this.player.pos[0] = this.camera.position.x
      this.player.pos[1] = this.camera.position.y - this.player.eyeHeight
      this.player.pos[2] = this.camera.position.z
      this.player.vel[0] = 0
      this.player.vel[1] = 0
      this.player.vel[2] = 0
      this.previousPos[0] = this.player.pos[0]
      this.previousPos[1] = this.player.pos[1]
      this.previousPos[2] = this.player.pos[2]
    }
    this.callbacks.onMode(this.mode)
  }

  private updateAim(): void {
    this.camera.getWorldDirection(this.viewDirection)
    const { x, y, z } = this.camera.position
    this.aimed = raycastVoxels(
      this.isSolid,
      [x, y, z],
      [this.viewDirection.x, this.viewDirection.y, this.viewDirection.z],
      REACH,
    )
    if (this.aimed) this.highlight.show(this.aimed)
    else this.highlight.hide()
  }

  private dig(): void {
    const hit = this.aimed
    if (!hit || this.world.getBlock(hit.x, hit.y, hit.z) === BLOCK.bedrock) return
    this.worldView.setBlock(hit.x, hit.y, hit.z, BLOCK.air)
    void this.worldView.flushDirty()
  }

  private place(): void {
    const hit = this.aimed
    if (!hit) return
    const [nx, ny, nz] = hit.normal
    if (nx === 0 && ny === 0 && nz === 0) return
    const x = hit.x + nx
    const y = hit.y + ny
    const z = hit.z + nz
    if (!this.world.inBounds(x, y, z) || this.isSolid(x, y, z)) return
    if (this.mode === 'fps' && overlapsPlayer(this.player, x, y, z)) return
    this.worldView.setBlock(x, y, z, PLACE_BLOCK)
    void this.worldView.flushDirty()
  }

  private sampleFps(time: number): void {
    if (this.sampleStart === null) {
      this.sampleStart = time
      return
    }
    this.framesInSample++
    const span = time - this.sampleStart
    if (span < FPS_SAMPLE_MS) return
    const { avgMs, maxMs } = this.pool.stats()
    this.callbacks.onStats({
      fps: Math.round((this.framesInSample * 1000) / span),
      tick: this.tick,
      meshAvgMs: avgMs,
      meshMaxMs: maxMs,
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

function overlapsPlayer(player: PlayerState, x: number, y: number, z: number): boolean {
  const { min, max } = playerAabb(player)
  return (
    min[0] < x + 1 && max[0] > x && min[1] < y + 1 && max[1] > y && min[2] < z + 1 && max[2] > z
  )
}
