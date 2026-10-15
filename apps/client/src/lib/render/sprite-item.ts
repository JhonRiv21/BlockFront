import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  PlaneGeometry,
} from 'three'
import { buildSides, rasterize, sideFaces, type SpriteArt } from './sprite-geometry.ts'

const THICKNESS = 1 / 16

// A 16×16 pixel-art item extruded like Minecraft's item/generated: front and back faces with
// the texture (nearest, alpha test) and side quads only on opaque/transparent edges.
export class SpriteItem {
  readonly object = new Group()
  private readonly texture: CanvasTexture
  private readonly materials: MeshLambertMaterial[] = []

  constructor(art: SpriteArt) {
    const { alpha, colors, width, height } = rasterize(art)
    this.texture = paintTexture(art, width, height)
    const front = new MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, transparent: false })
    const back = new MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, color: 0xb0b0b0 })
    const plane = new PlaneGeometry(1, 1)
    plane.translate(0.5, 0.5, 0)
    const frontMesh = new Mesh(plane, front)
    frontMesh.position.z = THICKNESS / 2
    const backMesh = new Mesh(plane, back)
    backMesh.position.z = -THICKNESS / 2
    backMesh.rotation.y = Math.PI
    backMesh.position.x = 1
    const sides = buildSides(sideFaces(alpha, width, height), colors, width, height, THICKNESS, 0.7)
    const sideGeometry = new BufferGeometry()
    sideGeometry.setAttribute('position', new BufferAttribute(sides.positions, 3))
    sideGeometry.setAttribute('normal', new BufferAttribute(sides.normals, 3))
    sideGeometry.setAttribute('color', new BufferAttribute(sides.colors, 3))
    sideGeometry.setIndex(new BufferAttribute(sides.indices, 1))
    const sideMaterial = new MeshLambertMaterial({ vertexColors: true })
    this.materials.push(front, back, sideMaterial)
    this.object.add(frontMesh, backMesh, new Mesh(sideGeometry, sideMaterial))
  }

  dispose(): void {
    this.texture.dispose()
    for (const m of this.materials) m.dispose()
    this.object.traverse((child) => {
      if (child instanceof Mesh) child.geometry.dispose()
    })
  }
}

function paintTexture(art: SpriteArt, width: number, height: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    art.rows.forEach((row, y) => {
      for (let x = 0; x < width; x++) {
        const ch = row[x] ?? '.'
        if (ch === '.') continue
        ctx.fillStyle = '#' + (art.palette[ch] ?? 0xff00ff).toString(16).padStart(6, '0')
        ctx.fillRect(x, y, 1, 1)
      }
    })
  }
  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = 'srgb'
  return texture
}
