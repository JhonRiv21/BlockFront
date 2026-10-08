import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Sprite,
  SpriteMaterial,
  type Scene,
} from 'three'

const FLASH_SECONDS = 0.05

let sharedTexture: CanvasTexture | null = null

// Soft radial glow drawn once on a canvas; no image asset needed.
function flashTexture(): CanvasTexture {
  if (sharedTexture) return sharedTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    )
    gradient.addColorStop(0, 'rgba(255, 245, 200, 1)')
    gradient.addColorStop(0.35, 'rgba(255, 190, 80, 0.9)')
    gradient.addColorStop(1, 'rgba(255, 120, 20, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  sharedTexture = new CanvasTexture(canvas)
  return sharedTexture
}

interface Flash {
  sprite: Sprite
  age: number
}

// Short-lived additive sprites at a muzzle; works in the viewmodel scene and in the world.
export class MuzzleFlashes {
  private readonly flashes: Flash[] = []
  private readonly material: SpriteMaterial

  constructor(private readonly parent: Scene | Group) {
    this.material = new SpriteMaterial({
      map: flashTexture(),
      color: new Color('#ffe2a8'),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  }

  spawn(x: number, y: number, z: number, size: number): void {
    const sprite = new Sprite(this.material)
    sprite.position.set(x, y, z)
    sprite.scale.setScalar(size * (0.8 + Math.random() * 0.5))
    sprite.material.rotation = Math.random() * Math.PI
    this.parent.add(sprite)
    this.flashes.push({ sprite, age: 0 })
  }

  update(dt: number): void {
    let write = 0
    for (const flash of this.flashes) {
      flash.age += dt
      if (flash.age >= FLASH_SECONDS) {
        this.parent.remove(flash.sprite)
        continue
      }
      this.flashes[write++] = flash
    }
    this.flashes.length = write
  }

  dispose(): void {
    for (const flash of this.flashes) this.parent.remove(flash.sprite)
    this.flashes.length = 0
    this.material.dispose()
  }
}
