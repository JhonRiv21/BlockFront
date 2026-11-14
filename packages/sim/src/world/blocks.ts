// Block registry (noa-style): one definition per id, compiled into flat tables the mesher and the
// lighting read without touching objects.

// flat: one quad against the wall the block hangs on (ladders).
export type RenderKind = 'cube' | 'cross' | 'liquid' | 'flat' | 'none'

export interface BlockDef {
  id: number
  name: string
  faces: { top: number; bottom: number; side: number }
  render: RenderKind
  solid: boolean
  opaque: boolean
  liquid: boolean
  // Multiplier applied to the face layer; player blocks are the plain layer times a colour.
  tint?: number
  // Representative colour for particles and the minimap.
  color: number
}

// Texture layers of the baked array texture, in upload order.
export const LAYER = {
  plain: 0,
  bedrock: 1,
  stone: 2,
  dirt: 3,
  grassTop: 4,
  grassSide: 5,
  sand: 6,
  gravel: 7,
  bark: 8,
  logRings: 9,
  leaves: 10,
  water: 11,
  tallGrass: 12,
  flowerRed: 13,
  flowerYellow: 14,
  snow: 15,
  clay: 16,
  planks: 17,
  tntSide: 18,
  tntTop: 19,
  ladder: 20,
} as const

export const LAYER_COUNT = 21

// Face order used by FACE_LAYER: +x, -x, +y, -y, +z, -z.
export const FACE = { east: 0, west: 1, top: 2, bottom: 3, south: 4, north: 5 } as const

export const FLAG = { solid: 1, opaque: 2, liquid: 4, cross: 8, cube: 16, flat: 32 } as const

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
  log: 16,
  tallGrass: 17,
  flower: 18,
  flowerYellow: 19,
  // Items of F3-B, above the colour ramp (20–63). A ladder keeps the wall it hangs on in its
  // id: the suffix is the outward normal of that wall.
  tnt: 64,
  ladderEast: 65,
  ladderWest: 66,
  ladderSouth: 67,
  ladderNorth: 68,
} as const

export const LADDER_NORMAL: Record<number, [number, number, number]> = {
  [BLOCK.ladderEast]: [1, 0, 0],
  [BLOCK.ladderWest]: [-1, 0, 0],
  [BLOCK.ladderSouth]: [0, 0, 1],
  [BLOCK.ladderNorth]: [0, 0, -1],
}

export function ladderFor(normal: [number, number, number]): BlockId {
  if (normal[0] === 1) return BLOCK.ladderEast
  if (normal[0] === -1) return BLOCK.ladderWest
  if (normal[2] === 1) return BLOCK.ladderSouth
  return BLOCK.ladderNorth
}

export type BlockId = number

export const PALETTE_SIZE = 64
const FIRST_RAMP_ID = 20

function cube(
  id: number,
  name: string,
  layer: number | { top: number; bottom: number; side: number },
  color: number,
  extra: Partial<BlockDef> = {},
): BlockDef {
  const faces = typeof layer === 'number' ? { top: layer, bottom: layer, side: layer } : layer
  return {
    id,
    name,
    faces,
    render: 'cube',
    solid: true,
    opaque: true,
    liquid: false,
    color,
    ...extra,
  }
}

function cross(id: number, name: string, layer: number, color: number): BlockDef {
  return {
    id,
    name,
    faces: { top: layer, bottom: layer, side: layer },
    render: 'cross',
    solid: false,
    opaque: false,
    liquid: false,
    color,
  }
}

// Non-solid, climbable: one quad on the wall it hangs on.
function flat(id: number, name: string, layer: number, color: number): BlockDef {
  return { ...cross(id, name, layer, color), render: 'flat' }
}

function tinted(id: number, name: string, color: number): BlockDef {
  return cube(id, name, LAYER.plain, color, { tint: color })
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to255 = (v: number) => Math.round(v * 255)
  return (to255(f(0)) << 16) | (to255(f(8)) << 8) | to255(f(4))
}

function buildRegistry(): (BlockDef | undefined)[] {
  const defs: BlockDef[] = [
    {
      id: BLOCK.air,
      name: 'air',
      faces: { top: 0, bottom: 0, side: 0 },
      render: 'none',
      solid: false,
      opaque: false,
      liquid: false,
      color: 0x000000,
    },
    cube(BLOCK.bedrock, 'bedrock', LAYER.bedrock, 0x2b2b30),
    cube(BLOCK.stone, 'stone', LAYER.stone, 0x8a8f96),
    cube(BLOCK.dirt, 'dirt', LAYER.dirt, 0x8b5e3c),
    cube(
      BLOCK.grass,
      'grass',
      { top: LAYER.grassTop, bottom: LAYER.dirt, side: LAYER.grassSide },
      0x6cb04a,
    ),
    cube(BLOCK.sand, 'sand', LAYER.sand, 0xe2cf8a),
    cube(BLOCK.wood, 'planks', LAYER.planks, 0x9a7446),
    cube(BLOCK.leaves, 'leaves', LAYER.leaves, 0x3f8f3a),
    {
      id: BLOCK.water,
      name: 'water',
      faces: { top: LAYER.water, bottom: LAYER.water, side: LAYER.water },
      render: 'liquid',
      solid: false,
      opaque: false,
      liquid: true,
      color: 0x3f76e4,
    },
    cube(BLOCK.gravel, 'gravel', LAYER.gravel, 0x6f7378),
    cube(BLOCK.snow, 'snow', LAYER.snow, 0xf2f5f8),
    tinted(BLOCK.blue, 'blue block', 0x2f6fe4),
    tinted(BLOCK.red, 'red block', 0xe03a3a),
    tinted(BLOCK.blueLight, 'light blue block', 0x7fb0ff),
    tinted(BLOCK.redLight, 'light red block', 0xff8a7a),
    cube(BLOCK.clay, 'clay', LAYER.clay, 0xb9775a),
    cube(
      BLOCK.log,
      'log',
      { top: LAYER.logRings, bottom: LAYER.logRings, side: LAYER.bark },
      0x6b4a2b,
    ),
    cross(BLOCK.tallGrass, 'tall grass', LAYER.tallGrass, 0x5fa33f),
    cross(BLOCK.flower, 'red flower', LAYER.flowerRed, 0xe84a4a),
    cross(BLOCK.flowerYellow, 'yellow flower', LAYER.flowerYellow, 0xf2d24a),
  ]
  // The rest of the palette is a hue ramp of player-buildable colours.
  for (let id = FIRST_RAMP_ID; id < PALETTE_SIZE; id++) {
    const slot = id - FIRST_RAMP_ID
    const row = Math.floor(slot / 22)
    const hue = ((slot % 22) * 360) / 22
    defs.push(tinted(id, `colour ${slot}`, hslToHex(hue, 0.6, row === 0 ? 0.55 : 0.35)))
  }
  defs.push(
    cube(
      BLOCK.tnt,
      'tnt',
      { top: LAYER.tntTop, bottom: LAYER.tntTop, side: LAYER.tntSide },
      0xc8372d,
    ),
    ...[BLOCK.ladderEast, BLOCK.ladderWest, BLOCK.ladderSouth, BLOCK.ladderNorth].map((id) =>
      flat(id, 'ladder', LAYER.ladder, 0xa3743f),
    ),
  )
  const table: (BlockDef | undefined)[] = new Array<BlockDef | undefined>(256).fill(undefined)
  for (const def of defs) table[def.id] = def
  return table
}

export const BLOCKS: readonly (BlockDef | undefined)[] = buildRegistry()

function compileTables(): { faceLayer: Uint8Array; flags: Uint8Array; palette: number[] } {
  const faceLayer = new Uint8Array(256 * 6)
  const flags = new Uint8Array(256)
  const palette: number[] = []
  for (let id = 0; id < 256; id++) {
    const def = BLOCKS[id]
    palette.push(def?.color ?? 0)
    if (!def) continue
    const { top, bottom, side } = def.faces
    faceLayer.set([side, side, top, bottom, side, side], id * 6)
    flags[id] =
      (def.solid ? FLAG.solid : 0) |
      (def.opaque ? FLAG.opaque : 0) |
      (def.liquid ? FLAG.liquid : 0) |
      (def.render === 'cross' ? FLAG.cross : 0) |
      (def.render === 'flat' ? FLAG.flat : 0) |
      (def.render === 'cube' ? FLAG.cube : 0)
  }
  return { faceLayer, flags, palette }
}

const TABLES = compileTables()

// Layer per (block id * 6 + face).
export const FACE_LAYER: Uint8Array = TABLES.faceLayer
export const FLAGS: Uint8Array = TABLES.flags
// sRGB hex per block id, representative colour (tint for player blocks).
export const PALETTE: readonly number[] = TABLES.palette

export function isSolid(id: BlockId): boolean {
  return ((FLAGS[id] ?? 0) & FLAG.solid) !== 0
}

export function isOpaque(id: BlockId): boolean {
  return ((FLAGS[id] ?? 0) & FLAG.opaque) !== 0
}

export function isLiquid(id: BlockId): boolean {
  return ((FLAGS[id] ?? 0) & FLAG.liquid) !== 0
}

export function isCross(id: BlockId): boolean {
  return ((FLAGS[id] ?? 0) & FLAG.cross) !== 0
}

export function isLadder(id: BlockId): boolean {
  return ((FLAGS[id] ?? 0) & FLAG.flat) !== 0
}

export function renderKind(id: BlockId): RenderKind {
  return BLOCKS[id]?.render ?? 'none'
}

export function blockTint(id: BlockId): number {
  return BLOCKS[id]?.tint ?? 0xffffff
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
