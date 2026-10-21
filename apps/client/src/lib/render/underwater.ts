import { isLiquid } from '@blockfront/sim/world/blocks'
import type { World } from '@blockfront/sim/world/world'
import { Color, type Fog, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three'
import { SKY_HORIZON, type Sky } from './sky.ts'

export const FOG_NEAR = 90
export const FOG_FAR = 260
// Underwater fog: dark blue mixed with the water colour. The entry haze clears from 8 to 26
// blocks in 1.2 s (Minecraft takes 30 s, too slow for a shooter).
const UNDERWATER_FOG = new Color('#050533').lerp(new Color('#3f76e4'), 0.45)
const UNDERWATER_FOG_ENTRY = 8
const UNDERWATER_FOG_FAR = 26
const UNDERWATER_CLEAR_SECONDS = 1.2

// Eye inside a water block (below the 8/9 surface): blue fog, no sky dome, and the HUD tint.
export class UnderwaterView {
  underwater = false
  private seconds = 0

  constructor(
    private readonly scene: Scene,
    private readonly sky: Sky,
    private readonly renderer: WebGLRenderer,
    private readonly world: World,
    private readonly onChange: (underwater: boolean) => void,
  ) {}

  update(camera: PerspectiveCamera, dt: number): void {
    const { x, y, z } = camera.position
    const cell = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
    const above = this.world.getBlock(Math.floor(x), Math.floor(y) + 1, Math.floor(z))
    const underwater = isLiquid(cell) && (isLiquid(above) || y < Math.floor(y) + 8 / 9)
    if (underwater !== this.underwater) this.enter(underwater)
    if (!this.underwater) return
    this.seconds += dt
    const t = Math.min(1, this.seconds / UNDERWATER_CLEAR_SECONDS)
    const fog = this.scene.fog as Fog
    fog.far = UNDERWATER_FOG_ENTRY + (UNDERWATER_FOG_FAR - UNDERWATER_FOG_ENTRY) * t * t
  }

  private enter(underwater: boolean): void {
    this.underwater = underwater
    this.seconds = 0
    const fog = this.scene.fog as Fog
    // The sky dome ignores fog, so under water it is hidden and the clear colour takes over.
    this.sky.mesh.visible = !underwater
    if (underwater) {
      fog.color.copy(UNDERWATER_FOG)
      fog.near = 0.5
      fog.far = UNDERWATER_FOG_ENTRY
      this.renderer.setClearColor(UNDERWATER_FOG)
    } else {
      fog.color.copy(SKY_HORIZON)
      fog.near = FOG_NEAR
      fog.far = FOG_FAR
      this.renderer.setClearColor(SKY_HORIZON)
    }
    this.onChange(underwater)
  }
}
