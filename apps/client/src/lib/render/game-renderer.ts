import { TICK_SECONDS, WORLD_SIZE } from '@blockfront/sim/config'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three'

export interface RenderStats {
  fps: number
  tick: number
}

const SKY = new Color('#9cc7ef')
const FPS_SAMPLE_MS = 500
const ORBIT_RADIANS_PER_SECOND = 0.05

export class GameRenderer {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(75, 1, 0.1, 400)
  private readonly clock = new FixedStep(TICK_SECONDS, 5)
  private readonly resizeObserver: ResizeObserver
  private tick = 0
  private lastTime: number | null = null
  private framesInSample = 0
  private sampleStart: number | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStats: (stats: RenderStats) => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = SKY
    this.scene.fog = new Fog(SKY, 60, 220)
    this.buildPlaceholderWorld()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      }
    })
    this.renderer.dispose()
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000
    this.lastTime = time
    const { steps, alpha } = this.clock.advance(elapsed)
    this.tick += steps

    const angle = (this.tick + alpha) * TICK_SECONDS * ORBIT_RADIANS_PER_SECOND
    this.camera.position.set(Math.cos(angle) * 110, 55, Math.sin(angle) * 110)
    this.camera.lookAt(0, 0, 0)
    this.renderer.render(this.scene, this.camera)
    this.sampleFps(time)
  }

  private sampleFps(time: number): void {
    if (this.sampleStart === null) {
      this.sampleStart = time
      return
    }
    this.framesInSample++
    const span = time - this.sampleStart
    if (span < FPS_SAMPLE_MS) return
    this.onStats({ fps: Math.round((this.framesInSample * 1000) / span), tick: this.tick })
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

  // Stand-in terrain until the voxel world lands in F1.
  private buildPlaceholderWorld(): void {
    this.scene.add(new HemisphereLight('#dbeafe', '#3f5f2f', 1.4))
    const sun = new DirectionalLight('#fff4e0', 1.6)
    sun.position.set(60, 120, 40)
    this.scene.add(sun)

    const ground = new Mesh(
      new PlaneGeometry(WORLD_SIZE.x, WORLD_SIZE.z),
      new MeshLambertMaterial({ color: '#6aa84f' }),
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    const baseOffset = WORLD_SIZE.z / 2 - 16
    this.scene.add(createTower('#3b82f6', -baseOffset))
    this.scene.add(createTower('#ef4444', baseOffset))
  }
}

function createTower(color: string, z: number): InstancedMesh {
  const footprint = 4
  const height = 6
  const count = footprint * footprint * height
  const tower = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color }),
    count,
  )
  const matrix = new Matrix4()
  let index = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < footprint; x++) {
      for (let dz = 0; dz < footprint; dz++) {
        matrix.makeTranslation(x - footprint / 2 + 0.5, y + 0.5, z + dz - footprint / 2 + 0.5)
        tower.setMatrixAt(index++, matrix)
      }
    }
  }
  return tower
}
