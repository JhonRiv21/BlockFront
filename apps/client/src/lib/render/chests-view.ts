import type { ChestSnapshot } from '@blockfront/sim/game'
import { WORLD_SIZE } from '@blockfront/sim/config'
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  Sprite,
  SpriteMaterial,
  type Material,
  type Scene,
} from 'three'
import { useSphericalFog } from './spherical-fog.ts'

// Model units are sixteenths of a block, like the item sprites.
const PX = 1 / 16
const BODY = { w: 14, h: 10, d: 14 }
const LID_H = 4
const OPEN_ANGLE = -1.9
const LID_HALF_LIFE = 0.08
const WOOD = { base: '#9a6a3a', dark: '#6b4423', light: '#b17e48' }

interface ChestView {
  group: Group
  lid: Group
  glow: Sprite
  latch: MeshLambertMaterial
  angle: number
}

// 16×16 planks: three boards with dark seams and a little grain, drawn once.
function woodTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = WOOD.base
    ctx.fillRect(0, 0, 16, 16)
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = random() < 0.5 ? WOOD.dark : WOOD.light
      ctx.globalAlpha = 0.35
      ctx.fillRect(
        Math.floor(random() * 16),
        Math.floor(random() * 16),
        2 + Math.floor(random() * 3),
        1,
      )
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = WOOD.dark
    for (const y of [0, 5, 10, 15]) ctx.fillRect(0, y, 16, 1)
  }
  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = 'srgb'
  return texture
}

function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 226, 150, 0.9)')
    gradient.addColorStop(0.4, 'rgba(255, 200, 90, 0.35)')
    gradient.addColorStop(1, 'rgba(255, 180, 60, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(canvas)
}

// Box in pixel units with its minimum corner at (x, y, z).
function box(w: number, h: number, d: number, x: number, y: number, z: number): BoxGeometry {
  const geometry = new BoxGeometry(w * PX, h * PX, d * PX)
  geometry.translate((x + w / 2) * PX, (y + h / 2) * PX, (z + d / 2) * PX)
  return geometry
}

// Loot chests: a voxel wooden chest with iron bands and a brass latch. Full: closed, with a
// soft pulsing glow; empty: lid open and no glow. The front faces the middle of the map.
export class ChestsView {
  private readonly views = new Map<number, ChestView>()
  private readonly woodMap = woodTexture()
  private readonly glowMap = glowTexture()
  private readonly wood: Material[]
  private readonly lidWood: Material[]
  private readonly iron = new MeshLambertMaterial({ color: '#4b5058' })
  private readonly geometries: Record<string, BoxGeometry>

  constructor(private readonly scene: Scene) {
    const plank = new MeshLambertMaterial({ map: this.woodMap })
    const inside = new MeshLambertMaterial({ color: '#2c1b0d' })
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The body's top and the lid's underside
    // are the dark inside, seen when the lid is up.
    this.wood = [plank, plank, inside, plank, plank, plank]
    this.lidWood = [plank, plank, plank, inside, plank, plank]
    for (const material of [plank, inside, this.iron]) useSphericalFog(material)
    const hw = BODY.w / 2
    const hd = BODY.d / 2
    this.geometries = {
      body: box(BODY.w, BODY.h, BODY.d, -hw, 0, -hd),
      bandBottom: box(BODY.w + 0.4, 1, BODY.d + 0.4, -hw - 0.2, 0, -hd - 0.2),
      bandTop: box(BODY.w + 0.4, 1, BODY.d + 0.4, -hw - 0.2, BODY.h - 1, -hd - 0.2),
      post: box(1.2, BODY.h, 1.2, -0.6, 0, -0.6),
      // Lid parts are relative to the hinge on the back top edge.
      lid: box(BODY.w, LID_H, BODY.d, -hw, 0, 0),
      lidBand: box(BODY.w + 0.4, 1, BODY.d + 0.4, -hw - 0.2, 0, -0.2),
      lidStrap: box(1.4, LID_H + 0.3, BODY.d + 0.4, -0.7, 0, -0.2),
      latch: box(2.4, 3.2, 1, -1.2, -1.6, BODY.d + 0.2),
    }
  }

  update(chests: ChestSnapshot[], dt: number, time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time / 420)
    for (const chest of chests) {
      let view = this.views.get(chest.id)
      if (!view) {
        view = this.build(chest)
        this.views.set(chest.id, view)
      }
      const target = chest.full ? 0 : OPEN_ANGLE
      view.angle = target + (view.angle - target) * Math.pow(0.5, dt / LID_HALF_LIFE)
      view.lid.rotation.x = view.angle
      view.glow.visible = chest.full
      if (chest.full) {
        view.glow.material.opacity = 0.55 + 0.35 * pulse
        view.latch.emissive.setRGB(0.35 * pulse, 0.22 * pulse, 0.05 * pulse)
      } else view.latch.emissive.setRGB(0, 0, 0)
    }
  }

  // Drop every chest, for a new match on the same renderer.
  clear(): void {
    for (const view of this.views.values()) {
      this.scene.remove(view.group)
      view.latch.dispose()
      view.glow.material.dispose()
    }
    this.views.clear()
  }

  dispose(): void {
    this.clear()
    for (const geometry of Object.values(this.geometries)) geometry.dispose()
    for (const material of new Set([...this.wood, ...this.lidWood, this.iron])) material.dispose()
    this.woodMap.dispose()
    this.glowMap.dispose()
  }

  private build(chest: ChestSnapshot): ChestView {
    const g = this.geometries
    const group = new Group()
    group.position.set(chest.pos[0], chest.pos[1], chest.pos[2])
    group.rotation.y = chest.pos[2] < WORLD_SIZE.z / 2 ? 0 : Math.PI
    group.add(new Mesh(g.body, this.wood))
    group.add(new Mesh(g.bandBottom, this.iron), new Mesh(g.bandTop, this.iron))
    const hw = (BODY.w / 2) * PX
    const hd = (BODY.d / 2) * PX
    for (const [x, z] of [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
    ] as const) {
      const post = new Mesh(g.post, this.iron)
      post.position.set(x, 0, z)
      group.add(post)
    }
    const lid = new Group()
    lid.position.set(0, BODY.h * PX, -hd)
    const latch = new MeshLambertMaterial({ color: '#d9a441' })
    useSphericalFog(latch)
    lid.add(
      new Mesh(g.lid, this.lidWood),
      new Mesh(g.lidBand, this.iron),
      new Mesh(g.lidStrap, this.iron),
      new Mesh(g.latch, latch),
    )
    group.add(lid)
    const glow = new Sprite(
      new SpriteMaterial({
        map: this.glowMap,
        color: '#ffd27a',
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    glow.scale.set(2, 2, 1)
    glow.position.y = 0.55
    group.add(glow)
    this.scene.add(group)
    return { group, lid, glow, latch, angle: chest.full ? 0 : OPEN_ANGLE }
  }
}
