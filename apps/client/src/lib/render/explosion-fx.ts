import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  NormalBlending,
  PointLight,
  Sprite,
  SpriteMaterial,
  type Scene,
} from 'three'

type Kind = 'flash' | 'fire' | 'smoke'

interface Puff {
  sprite: Sprite
  kind: Kind
  age: number
  life: number
  vx: number
  vy: number
  vz: number
  size: number
  grow: number
}

const MAX_PUFFS = 160
const FLASH_LIFE = 0.16
const LIGHT_INTENSITY = 90
const LIGHT_DECAY = 11

const FIRE_START = new Color('#fff3c4')
const FIRE_END = new Color('#ff4a0a')

let fireTexture: CanvasTexture | null = null
let smokeTexture: CanvasTexture | null = null

// Radial gradient drawn once on a canvas; no image asset needed.
function radial(stops: [number, string][]): CanvasTexture {
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const half = size / 2
    const gradient = context.createRadialGradient(half, half, 0, half, half, half)
    for (const [offset, color] of stops) gradient.addColorStop(offset, color)
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new CanvasTexture(canvas)
}

function textures(): { fire: CanvasTexture; smoke: CanvasTexture } {
  fireTexture ??= radial([
    [0, 'rgba(255, 255, 255, 1)'],
    [0.25, 'rgba(255, 220, 120, 0.95)'],
    [0.6, 'rgba(255, 110, 30, 0.45)'],
    [1, 'rgba(255, 60, 0, 0)'],
  ])
  smokeTexture ??= radial([
    [0, 'rgba(70, 64, 58, 0.85)'],
    [0.5, 'rgba(55, 50, 46, 0.45)'],
    [1, 'rgba(45, 42, 40, 0)'],
  ])
  return { fire: fireTexture, smoke: smokeTexture }
}

// Grenade blast: a white flash that balloons for a few frames, a fireball of additive puffs
// that fly out, cool from yellow to red and die, dark smoke that lingers and rises, and an
// orange point light that decays. Block debris comes from the block events, not from here.
export class ExplosionFx {
  private readonly puffs: Puff[] = []
  private readonly light = new PointLight('#ff9a3c', 0, 18, 2)
  private readonly color = new Color()

  constructor(
    private readonly scene: Scene,
    private readonly random: () => number = Math.random,
  ) {
    scene.add(this.light)
  }

  burst(x: number, y: number, z: number): void {
    const { fire, smoke } = textures()
    this.add(fire, AdditiveBlending, 'flash', x, y, z, 0, 0, 0, 3, 9, FLASH_LIFE)
    for (let i = 0; i < 14; i++) {
      const [dx, dy, dz] = this.direction()
      const speed = 3 + this.random() * 4
      this.add(
        fire,
        AdditiveBlending,
        'fire',
        x + dx * 0.3,
        y + dy * 0.3,
        z + dz * 0.3,
        dx * speed,
        dy * speed + 1.5,
        dz * speed,
        1 + this.random() * 0.9,
        1.6,
        0.4 + this.random() * 0.3,
      )
    }
    for (let i = 0; i < 9; i++) {
      const [dx, dy, dz] = this.direction()
      const speed = 1 + this.random() * 1.6
      this.add(
        smoke,
        NormalBlending,
        'smoke',
        x + dx * 0.6,
        y + Math.abs(dy) * 0.6,
        z + dz * 0.6,
        dx * speed,
        Math.abs(dy) * speed + 1.8,
        dz * speed,
        1.3 + this.random() * 0.8,
        2.2,
        1.1 + this.random() * 0.6,
      )
    }
    this.light.position.set(x, y + 0.5, z)
    this.light.intensity = LIGHT_INTENSITY
  }

  update(dt: number): void {
    this.light.intensity *= Math.exp(-LIGHT_DECAY * dt)
    const drag = Math.exp(-3.2 * dt)
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]!
      puff.age += dt
      const t = puff.age / puff.life
      if (t >= 1) {
        this.remove(i)
        continue
      }
      if (puff.kind !== 'flash') {
        puff.vx *= drag
        puff.vz *= drag
        puff.vy = puff.kind === 'smoke' ? puff.vy * drag + 1.2 * dt : puff.vy * drag
        puff.sprite.position.x += puff.vx * dt
        puff.sprite.position.y += puff.vy * dt
        puff.sprite.position.z += puff.vz * dt
      }
      const scale = puff.size + puff.grow * (puff.kind === 'flash' ? Math.sqrt(t) : t)
      puff.sprite.scale.setScalar(scale)
      const material = puff.sprite.material
      if (puff.kind === 'flash') {
        material.opacity = 1 - t
      } else if (puff.kind === 'fire') {
        material.opacity = Math.pow(1 - t, 1.6)
        material.color.copy(this.color.lerpColors(FIRE_START, FIRE_END, Math.min(1, t * 1.4)))
      } else {
        material.opacity = Math.sin(t * Math.PI) * 0.75
      }
    }
  }

  dispose(): void {
    while (this.puffs.length) this.remove(this.puffs.length - 1)
    this.scene.remove(this.light)
  }

  private add(
    map: CanvasTexture,
    blending: typeof AdditiveBlending | typeof NormalBlending,
    kind: Kind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    grow: number,
    life: number,
  ): void {
    if (this.puffs.length >= MAX_PUFFS) this.remove(0)
    const material = new SpriteMaterial({
      map,
      blending,
      transparent: true,
      depthWrite: false,
      fog: false,
      rotation: this.random() * Math.PI * 2,
    })
    const sprite = new Sprite(material)
    sprite.position.set(x, y, z)
    sprite.scale.setScalar(size)
    sprite.renderOrder = kind === 'smoke' ? 1 : 2
    this.scene.add(sprite)
    this.puffs.push({ sprite, kind, age: 0, life, vx, vy, vz, size, grow })
  }

  private remove(index: number): void {
    const puff = this.puffs[index]!
    this.scene.remove(puff.sprite)
    puff.sprite.material.dispose()
    this.puffs.splice(index, 1)
  }

  private direction(): [number, number, number] {
    const u = this.random() * 2 - 1
    const phi = this.random() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    return [r * Math.cos(phi), u, r * Math.sin(phi)]
  }
}
