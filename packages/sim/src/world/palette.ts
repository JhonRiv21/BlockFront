export const PALETTE_SIZE = 64

export const BLOCK = {
  air: 0,
  bedrock: 1,
  stone: 2,
  dirt: 3,
  grass: 4,
  sand: 5,
  wood: 6,
  leaves: 7,
  water: 8,
  gravel: 9,
  snow: 10,
  blue: 11,
  red: 12,
  blueLight: 13,
  redLight: 14,
  clay: 15,
} as const

export type BlockId = number

const NAMED_COLORS: Record<number, number> = {
  [BLOCK.air]: 0x000000,
  [BLOCK.bedrock]: 0x2b2b30,
  [BLOCK.stone]: 0x8a8f96,
  [BLOCK.dirt]: 0x8b5e3c,
  [BLOCK.grass]: 0x6cb04a,
  [BLOCK.sand]: 0xe2cf8a,
  [BLOCK.wood]: 0x7a5230,
  [BLOCK.leaves]: 0x3f8f3a,
  [BLOCK.water]: 0x3b8fd6,
  [BLOCK.gravel]: 0x6f7378,
  [BLOCK.snow]: 0xf2f5f8,
  [BLOCK.blue]: 0x2f6fe4,
  [BLOCK.red]: 0xe03a3a,
  [BLOCK.blueLight]: 0x7fb0ff,
  [BLOCK.redLight]: 0xff8a7a,
  [BLOCK.clay]: 0xb9775a,
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to255 = (v: number) => Math.round(v * 255)
  return (to255(f(0)) << 16) | (to255(f(8)) << 8) | to255(f(4))
}

// Slots after the named blocks form a hue ramp (two lightness rows) for player builds.
function buildPalette(): readonly number[] {
  const colors: number[] = []
  const namedCount = Object.keys(NAMED_COLORS).length
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const named = NAMED_COLORS[i]
    if (named !== undefined) {
      colors.push(named)
      continue
    }
    const slot = i - namedCount
    const row = Math.floor(slot / 24)
    const hue = ((slot % 24) * 360) / 24
    colors.push(hslToHex(hue, 0.6, row === 0 ? 0.55 : 0.35))
  }
  return colors
}

// sRGB hex per block id; index 0 (air) is never rendered.
export const PALETTE: readonly number[] = buildPalette()

export function isSolid(id: BlockId): boolean {
  return id !== BLOCK.air
}

export function mirrorBlock(id: BlockId): BlockId {
  switch (id) {
    case BLOCK.blue:
      return BLOCK.red
    case BLOCK.red:
      return BLOCK.blue
    case BLOCK.blueLight:
      return BLOCK.redLight
    case BLOCK.redLight:
      return BLOCK.blueLight
    default:
      return id
  }
}
