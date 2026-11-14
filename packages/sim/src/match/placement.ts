import { CHEST } from '../combat/weapons.ts'
import { WORLD_SIZE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { Rng } from '../rng.ts'
import { BLOCK, isLiquid, isSolid, type BlockId } from '../world/blocks.ts'
import { TERRAIN } from '../world/generator.ts'
import type { World } from '../world/world.ts'

// Where loot chests and FFA spawn points go (docs/final-scope.md §2 and §3). Both are picked
// from the freshly generated world with best-candidate sampling: of several valid random spots,
// the one farthest from those already taken, so the same seed always gives the same spread.

const NATURAL_GROUND = new Set<BlockId>([
  BLOCK.grass,
  BLOCK.dirt,
  BLOCK.stone,
  BLOCK.gravel,
  BLOCK.snow,
  BLOCK.clay,
])
// Chests keep off the map edge, where nobody passes by.
const CHEST_EDGE_MARGIN = 8
const FFA_EDGE_MARGIN = 4
const CANDIDATES_PER_PICK = 40
const MAX_SAMPLES = 20000
const CHEST_WATER_RADIUS = 2
const FFA_WATER_RADIUS = 4
export const FFA_SPAWN_COUNT = 12

export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

// Water in the fresh world is static and fills every low column up to the sea level.
function hasWater(world: World, x: number, z: number): boolean {
  return isLiquid(world.getBlock(x, TERRAIN.seaLevel, z))
}

// Foot position on natural, dry ground with no water within `waterRadius` columns.
function dryGround(world: World, x: number, z: number, waterRadius: number): Vec3 | null {
  let y = WORLD_SIZE.y - 1
  while (y > 0 && !isSolid(world.getBlock(x, y, z))) y--
  if (y <= TERRAIN.seaLevel + 1 || y + 2 >= WORLD_SIZE.y) return null
  if (!NATURAL_GROUND.has(world.getBlock(x, y, z))) return null
  for (let dz = -waterRadius; dz <= waterRadius; dz++)
    for (let dx = -waterRadius; dx <= waterRadius; dx++) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= WORLD_SIZE.x || nz >= WORLD_SIZE.z) return null
      if (hasWater(world, nx, nz)) return null
    }
  return [x + 0.5, y + 1, z + 0.5]
}

function mirror(pos: Vec3): Vec3 {
  return [pos[0], pos[1], WORLD_SIZE.z - pos[2]]
}

// Picks `count` spots; `spacing` gives a candidate's distance to what is already taken (or a
// negative number to reject it).
function pickSpread(
  rng: Rng,
  count: number,
  margin: number,
  zLimit: number,
  sample: (x: number, z: number) => Vec3 | null,
  spacing: (pos: Vec3, taken: Vec3[]) => number,
): Vec3[] {
  const taken: Vec3[] = []
  let samples = 0
  while (taken.length < count && samples < MAX_SAMPLES) {
    let best: Vec3 | null = null
    let bestScore = -1
    for (let valid = 0; valid < CANDIDATES_PER_PICK && samples < MAX_SAMPLES; samples++) {
      const x = margin + Math.floor(rng.next() * (WORLD_SIZE.x - 2 * margin))
      const z = margin + Math.floor(rng.next() * (zLimit - margin))
      const pos = sample(x, z)
      if (!pos) continue
      valid++
      const score = spacing(pos, taken)
      if (score > bestScore) {
        best = pos
        bestScore = score
      }
    }
    if (!best) break
    taken.push(best)
  }
  if (taken.length < count) throw new Error(`room for ${taken.length} of ${count} spots`)
  return taken
}

const nearest = (pos: Vec3, others: Vec3[]) =>
  others.reduce((min, other) => Math.min(min, horizontalDistance(pos, other)), Infinity)

// Ten chests: five in the blue half and their mirrors over Z (ids 1–5, then 6–10 mirroring
// them), at least CHEST.minFlagDistance from each flag and CHEST.minSpacing from each other.
export function chestSpots(world: World, seed: number, flagHomes: Vec3[]): Vec3[] {
  const rng = new Rng(seed ^ 0x2c1b3c6d)
  const half = pickSpread(
    rng,
    CHEST.count / 2,
    CHEST_EDGE_MARGIN,
    WORLD_SIZE.z / 2,
    (x, z) => dryGround(world, x, z, CHEST_WATER_RADIUS),
    (pos, taken) => {
      if (flagHomes.some((home) => horizontalDistance(pos, home) < CHEST.minFlagDistance)) return -1
      const others = [...taken, ...taken.map(mirror), mirror(pos)]
      const gap = nearest(pos, others)
      return gap < CHEST.minSpacing ? -1 : gap
    },
  )
  return [...half, ...half.map(mirror)]
}

// Twelve FFA spawn points over the whole map, on dry ground well away from the water.
export function ffaSpawnPoints(world: World, seed: number): Vec3[] {
  const rng = new Rng(seed ^ 0x5f356495)
  return pickSpread(
    rng,
    FFA_SPAWN_COUNT,
    FFA_EDGE_MARGIN,
    WORLD_SIZE.z - FFA_EDGE_MARGIN,
    (x, z) => dryGround(world, x, z, FFA_WATER_RADIUS),
    (pos, taken) => (taken.length === 0 ? 0 : nearest(pos, taken)),
  )
}

// The point whose nearest living enemy is farthest; the first one when nobody is alive.
export function farthestSpawn(points: Vec3[], enemies: Vec3[]): Vec3 {
  let best = points[0]!
  let bestScore = -1
  for (const point of points) {
    const score = nearest(point, enemies)
    if (score > bestScore) {
      best = point
      bestScore = score
    }
  }
  return best
}
