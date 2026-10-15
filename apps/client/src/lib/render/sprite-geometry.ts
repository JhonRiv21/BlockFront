// Minecraft's item/generated model, in code: a 16×16 sprite becomes a front and a back face
// plus 1-texel side faces only where an opaque pixel touches a transparent one, 1/16 thick.
// Pure data so it can be tested; the Three mesh is built in sprite-item.ts.

export interface SideFace {
  x: number
  y: number
  // Which edge of the pixel is exposed: -x, +x, -y (bottom), +y (top).
  dir: 'left' | 'right' | 'bottom' | 'top'
}

export function sideFaces(alpha: ArrayLike<number>, width: number, height: number): SideFace[] {
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && (alpha[x + y * width] ?? 0) > 0
  const faces: SideFace[] = []
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue
      if (!opaque(x - 1, y)) faces.push({ x, y, dir: 'left' })
      if (!opaque(x + 1, y)) faces.push({ x, y, dir: 'right' })
      if (!opaque(x, y - 1)) faces.push({ x, y, dir: 'bottom' })
      if (!opaque(x, y + 1)) faces.push({ x, y, dir: 'top' })
    }
  return faces
}

export interface SpriteGeometry {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint16Array
}

// Side quads in model space: the sprite spans x 0..1, y 0..1 (row 0 at the bottom) and the
// thickness is centred on z = 0. Colours are the pixel colour darkened by `shade`.
export function buildSides(
  faces: SideFace[],
  colors: ArrayLike<number>,
  width: number,
  height: number,
  thickness: number,
  shade: number,
): SpriteGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const vertexColors: number[] = []
  const indices: number[] = []
  const px = 1 / width
  const py = 1 / height
  const h = thickness / 2
  for (const face of faces) {
    const rgb = colors[face.x + face.y * width] ?? 0xffffff
    const r = (((rgb >> 16) & 255) / 255) * shade
    const g = (((rgb >> 8) & 255) / 255) * shade
    const b = ((rgb & 255) / 255) * shade
    const x0 = face.x * px
    const x1 = x0 + px
    const y0 = face.y * py
    const y1 = y0 + py
    let quad: number[][]
    let normal: number[]
    switch (face.dir) {
      case 'left':
        quad = [
          [x0, y0, h],
          [x0, y0, -h],
          [x0, y1, -h],
          [x0, y1, h],
        ]
        normal = [-1, 0, 0]
        break
      case 'right':
        quad = [
          [x1, y0, -h],
          [x1, y0, h],
          [x1, y1, h],
          [x1, y1, -h],
        ]
        normal = [1, 0, 0]
        break
      case 'bottom':
        quad = [
          [x0, y0, -h],
          [x0, y0, h],
          [x1, y0, h],
          [x1, y0, -h],
        ]
        normal = [0, -1, 0]
        break
      default:
        quad = [
          [x0, y1, h],
          [x0, y1, -h],
          [x1, y1, -h],
          [x1, y1, h],
        ]
        normal = [0, 1, 0]
    }
    const base = positions.length / 3
    for (const v of quad) {
      positions.push(v[0]!, v[1]!, v[2]!)
      normals.push(normal[0]!, normal[1]!, normal[2]!)
      vertexColors.push(r, g, b)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(vertexColors),
    indices: Uint16Array.from(indices),
  }
}

// Pixel-art sprites as 16 rows of 16 characters, row 0 at the TOP as drawn; '.' is transparent.
export interface SpriteArt {
  rows: string[]
  palette: Record<string, number>
}

export function rasterize(art: SpriteArt): {
  alpha: Uint8Array
  colors: Uint32Array
  width: number
  height: number
} {
  const height = art.rows.length
  const width = art.rows[0]?.length ?? 0
  const alpha = new Uint8Array(width * height)
  const colors = new Uint32Array(width * height)
  art.rows.forEach((row, rowIndex) => {
    // Flip so y = 0 is the bottom, as the geometry expects.
    const y = height - 1 - rowIndex
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.'
      if (ch === '.') continue
      alpha[x + y * width] = 1
      colors[x + y * width] = art.palette[ch] ?? 0xff00ff
    }
  })
  return { alpha, colors, width, height }
}

// Diagonal shovel, bottom-left to top-right: wooden handle with a knob, 1 px neck, teardrop
// blade with a dark outline and a highlight on the upper-left edge, 1–2 px of margin.
export const SHOVEL_ART: SpriteArt = {
  rows: [
    '................',
    '..........ooo...',
    '.........ohhho..',
    '........ohhhhho.',
    '........ohhhhho.',
    '........ohhhho..',
    '.........ohho...',
    '........on.o....',
    '.......ow.......',
    '......oww.......',
    '.....oww........',
    '....oww.........',
    '...oww..........',
    '..okw...........',
    '..okk...........',
    '...o............',
  ],
  palette: { o: 0x2b1d12, h: 0xb8bec6, n: 0x6b7178, w: 0x8a5a2b, k: 0xa0683a },
}

export const GRENADE_ART: SpriteArt = {
  rows: [
    '................',
    '......ss........',
    '.....sxxs.......',
    '......ss.m......',
    '.....ooo........',
    '....ogggo.......',
    '...ogdgdgo......',
    '...ogggggo......',
    '...ogdgdgo......',
    '...ogggggo......',
    '...ogdgdgo......',
    '....ogggo.......',
    '.....ooo........',
    '................',
    '................',
    '................',
  ],
  palette: { o: 0x1b2416, g: 0x4a6b3a, d: 0x3a5530, s: 0x8d949c, x: 0xb8bec6, m: 0xd9d4a8 },
}
