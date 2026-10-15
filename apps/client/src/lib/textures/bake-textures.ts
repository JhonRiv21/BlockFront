import { LAYER, LAYER_COUNT } from '@blockfront/sim/world/blocks'
import { hash3 } from '@blockfront/sim/world/hash'

export const TEXEL_SIZE = 16
export const CRACK_STAGES = 10
export const TOTAL_LAYERS = LAYER_COUNT + CRACK_STAGES

// 16×16 RGBA texels per layer, baked in code: low-contrast noise per material, a one-texel
// darkened border, and alpha cut-outs for the cross blocks. Row 0 is the bottom of the texture.
export function bakeTextures(): Uint8Array {
  const data = new Uint8Array(TEXEL_SIZE * TEXEL_SIZE * 4 * TOTAL_LAYERS)
  for (let layer = LAYER_COUNT; layer < TOTAL_LAYERS; layer++)
    bakeCracks(data, layer, layer - LAYER_COUNT)
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    for (let y = 0; y < TEXEL_SIZE; y++)
      for (let x = 0; x < TEXEL_SIZE; x++) {
        const [r, g, b, a] = texel(layer, x, y)
        const edge = x === 0 || y === 0 || x === TEXEL_SIZE - 1 || y === TEXEL_SIZE - 1
        // Faint seam only; the AO already separates the blocks.
        const shade = edge && a > 0 && !isCutout(layer) && layer !== LAYER.water ? 0.91 : 1
        const offset = ((layer * TEXEL_SIZE + y) * TEXEL_SIZE + x) * 4
        data[offset] = Math.round(Math.min(255, r * shade))
        data[offset + 1] = Math.round(Math.min(255, g * shade))
        data[offset + 2] = Math.round(Math.min(255, b * shade))
        data[offset + 3] = a
      }
  }
  return data
}

function isCutout(layer: number): boolean {
  return layer === LAYER.tallGrass || layer === LAYER.flowerRed || layer === LAYER.flowerYellow
}

// Deterministic noise in [0, 1) per texel.
function noise(layer: number, x: number, y: number, salt = 0): number {
  return (hash3(x + salt * 131, y + salt * 17, layer * 977 + 7) % 1000) / 1000
}

function mix(a: number[], b: number[], t: number): number[] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
}

type Texel = [number, number, number, number]

function rgb(color: number[], alpha = 255): Texel {
  return [color[0]!, color[1]!, color[2]!, alpha]
}

function texel(layer: number, x: number, y: number): Texel {
  const n = noise(layer, x, y)
  const n2 = noise(layer, x, y, 1)
  switch (layer) {
    case LAYER.plain:
      return rgb(mix([255, 255, 255], [236, 236, 236], n * 0.5))
    case LAYER.bedrock:
      return rgb(mix([40, 40, 46], [62, 62, 70], n))
    case LAYER.stone: {
      // Veins: a few darker diagonal streaks over grey grain.
      const vein = (x + y * 2 + Math.floor(n2 * 3)) % 7 === 0 ? 0.85 : 1
      return rgb(mix([128, 133, 140], [150, 155, 162], n).map((c) => c * vein))
    }
    case LAYER.dirt:
      return rgb(mix([120, 80, 50], [146, 100, 64], n))
    case LAYER.grassTop: {
      // Blades: short vertical streaks a bit darker than the base.
      const blade = noise(layer, x, Math.floor(y / 2), 2) < 0.25 ? 0.88 : 1
      return rgb(mix([98, 170, 68], [120, 190, 84], n).map((c) => c * blade))
    }
    case LAYER.grassSide: {
      // Dirt with a green fringe baked on the top rows (high y = top of the block).
      const fringe = y >= 12 || (y === 11 && n2 > 0.4) || (y === 10 && n2 > 0.8)
      return fringe
        ? rgb(mix([98, 170, 68], [120, 190, 84], n))
        : rgb(mix([120, 80, 50], [146, 100, 64], n))
    }
    case LAYER.sand:
      return rgb(mix([222, 205, 140], [236, 222, 162], n))
    case LAYER.gravel: {
      const pebble = n2 > 0.72 ? 1.12 : n2 < 0.18 ? 0.86 : 1
      return rgb(mix([110, 114, 120], [128, 132, 138], n).map((c) => c * pebble))
    }
    case LAYER.bark: {
      // Vertical grooves.
      const groove = (x + Math.floor(n2 * 2)) % 4 === 0 ? 0.8 : 1
      return rgb(mix([96, 66, 38], [120, 86, 50], n).map((c) => c * groove))
    }
    case LAYER.logRings: {
      const dx = x - 7.5
      const dy = y - 7.5
      const ring = Math.floor(Math.sqrt(dx * dx + dy * dy)) % 2 === 0 ? 0.88 : 1
      const heart = Math.sqrt(dx * dx + dy * dy) > 7 ? [96, 66, 38] : [190, 150, 96]
      return rgb(
        mix(
          heart,
          heart.map((c) => c * 1.08),
          n,
        ).map((c) => c * ring),
      )
    }
    case LAYER.leaves: {
      // Mottled green with painted dark holes.
      const hole = n2 < 0.12 ? 0.55 : 1
      return rgb(mix([52, 128, 46], [84, 160, 62], n).map((c) => c * hole))
    }
    case LAYER.water:
      // Soft ripple from low-frequency noise only; the block grid must not show.
      return rgb(mix([66, 122, 230], [84, 142, 242], noise(layer, x >> 2, y >> 2) * 0.6 + n * 0.2))
    case LAYER.tallGrass: {
      // Three to four blades, each a column that thins toward the top.
      const blades = [2, 6, 9, 13]
      let alpha = 0
      for (const bx of blades) {
        const sway = Math.round(Math.sin(y * 0.6 + bx) * 1.2)
        const width = y < 4 ? 2 : y < 10 ? 1 : 1
        const dx = x - (bx + sway)
        const top = 11 + (bx % 3) * 1.5
        if (dx >= 0 && dx < width && y <= top) alpha = 255
      }
      return alpha ? rgb(mix([78, 150, 54], [104, 176, 70], n), 255) : [0, 0, 0, 0]
    }
    case LAYER.flowerRed:
    case LAYER.flowerYellow: {
      const stem = x === 7 && y <= 8
      const leaf = (x === 6 && y === 4) || (x === 8 && y === 6)
      const dx = x - 7.5
      const dy = y - 11
      const head = dx * dx + dy * dy <= 6
      const center = dx * dx + dy * dy <= 1
      if (center) return rgb([250, 230, 110])
      if (head)
        return rgb(
          layer === LAYER.flowerRed
            ? mix([225, 60, 60], [240, 90, 80], n)
            : mix([240, 205, 60], [250, 225, 90], n),
        )
      if (stem || leaf) return rgb(mix([70, 140, 50], [90, 160, 60], n))
      return [0, 0, 0, 0]
    }
    case LAYER.snow:
      return rgb(mix([236, 240, 245], [250, 252, 255], n))
    case LAYER.clay:
      return rgb(mix([176, 112, 86], [196, 128, 100], n))
    case LAYER.planks: {
      const seam = y % 4 === 0 ? 0.8 : 1
      return rgb(mix([150, 112, 68], [172, 132, 82], n).map((c) => c * seam))
    }
    default:
      return rgb([255, 0, 255])
  }
}

// Crack stage: a few jagged lines from the centre whose count and length grow with the stage.
function bakeCracks(data: Uint8Array, layer: number, stage: number): void {
  const lines = 2 + Math.floor(stage * 0.7)
  const reach = 3 + stage * 0.6
  for (let l = 0; l < lines; l++) {
    const angle = (l / lines) * Math.PI * 2 + (hash3(l, stage, 3) % 100) / 100
    let x = 7.5
    let y = 7.5
    for (let step = 0; step < reach; step++) {
      const wobble = ((hash3(step, l, stage + 11) % 100) / 100 - 0.5) * 1.2
      x += Math.cos(angle + wobble)
      y += Math.sin(angle + wobble)
      const px = Math.round(x)
      const py = Math.round(y)
      if (px < 0 || py < 0 || px >= TEXEL_SIZE || py >= TEXEL_SIZE) break
      const offset = ((layer * TEXEL_SIZE + py) * TEXEL_SIZE + px) * 4
      data[offset + 3] = 255
    }
  }
}
