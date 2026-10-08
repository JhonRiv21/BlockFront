import { TICK_SECONDS, WORLD_SIZE } from '@blockfront/sim/config'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { generateWorld } from '@blockfront/sim/world/generator'
import { BLOCK } from '@blockfront/sim/world/palette'
import { Color, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { FlyCamera } from '../input/fly-camera.ts'
import { MesherPool } from '../mesher/mesher-pool.ts'
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
}

const SKY = new Color('#9cc7ef')
const FPS_SAMPLE_MS = 500
const DEFAULT_SEED = 1
const DIG_DISTANCE = 6
const DIG_RADIUS = 2.5

function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 4
  return Math.max(2, Math.min(4, cores - 1))
}

export class GameRenderer {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(75, 1, 0.1, 400)
  private readonly clock = new FixedStep(TICK_SECONDS, 5)
  private readonly resizeObserver: ResizeObserver
  private readonly pool = new MesherPool(workerCount())
  private readonly material = createVoxelMaterial()
  private readonly worldView: WorldView
  private readonly flyCamera: FlyCamera
  private readonly digTarget = new Vector3()
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

    const world = generateWorld(DEFAULT_SEED)
    this.worldView = new WorldView(this.scene, world, this.pool, this.material)
    const buildStart = performance.now()
    void this.worldView.rebuildAll().then(() => {
      const { avgMs, maxMs, count } = this.pool.stats()
      console.info(
        `world meshed: ${count} chunks, ${this.worldView.totalQuads} quads, ` +
          `${avgMs.toFixed(2)} ms avg / ${maxMs.toFixed(2)} ms max per chunk, ` +
          `${(performance.now() - buildStart).toFixed(0)} ms wall with ${this.pool.size} workers`,
      )
    })

    this.camera.position.set(WORLD_SIZE.x / 2, 40, 6)
    this.camera.lookAt(WORLD_SIZE.x / 2, 22, WORLD_SIZE.z / 2)
    this.flyCamera = new FlyCamera(this.camera, canvas, callbacks.onPointerLock)

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
      renderOnce: () => this.frame(performance.now()),
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.flyCamera.dispose()
    this.worldView.dispose()
    this.pool.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
    this.lastTime = time
    const { steps } = this.clock.advance(elapsed)
    this.tick += steps

    this.flyCamera.update(Math.min(elapsed, 0.1))
    if (this.flyCamera.takePressed('KeyX')) this.digAhead()

    this.renderer.render(this.scene, this.camera)
    this.sampleFps(time)
  }

  // Debug: carve a sphere in front of the camera; part 2 replaces this with real block picking.
  private digAhead(): void {
    this.camera.getWorldDirection(this.digTarget)
    this.digTarget.multiplyScalar(DIG_DISTANCE).add(this.camera.position)
    const cx = Math.floor(this.digTarget.x)
    const cy = Math.floor(this.digTarget.y)
    const cz = Math.floor(this.digTarget.z)
    const r = Math.ceil(DIG_RADIUS)
    for (let z = cz - r; z <= cz + r; z++)
      for (let y = Math.max(1, cy - r); y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          const dx = x + 0.5 - this.digTarget.x
          const dy = y + 0.5 - this.digTarget.y
          const dz = z + 0.5 - this.digTarget.z
          if (dx * dx + dy * dy + dz * dz > DIG_RADIUS * DIG_RADIUS) continue
          this.worldView.setBlock(x, y, z, BLOCK.air)
        }
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
