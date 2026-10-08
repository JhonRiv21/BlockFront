import { WORLD_SIZE } from '../config.ts'
import { createPrng, createValueNoise2D, fbm2D } from './noise.ts'
import { BLOCK, mirrorBlock, type BlockId } from './palette.ts'
import { World } from './world.ts'

export interface TerrainParams {
  seaLevel: number
  baseHeight: number
  hillAmplitude: number
  riverHalfWidth: number
  riverBedHeight: number
  fordHalfWidth: number
  baseCenterZ: number
  baseRadius: number
}

export const TERRAIN: TerrainParams = {
  seaLevel: 16,
  baseHeight: 20,
  hillAmplitude: 14,
  riverHalfWidth: 12,
  riverBedHeight: 13,
  fordHalfWidth: 4,
  baseCenterZ: 20,
  baseRadius: 14,
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Terrain height for the blue half; the red half mirrors it over Z.
function createHeightmap(seed: number, params: TerrainParams): (x: number, z: number) => number {
  const noise = createValueNoise2D(createPrng(seed))
  const midZ = WORLD_SIZE.z / 2 - 0.5
  const midX = WORLD_SIZE.x / 2 - 0.5
  const baseX = WORLD_SIZE.x / 2
  return (x, z) => {
    const hills = fbm2D(noise, x / 28 + 7.3, z / 28 + 3.1, 4)
    let height = params.baseHeight + (hills - 0.5) * 2 * params.hillAmplitude

    // The river valley runs along X through the middle, with a shallow ford at the center.
    const distToRiver = Math.abs(z - midZ)
    const valley = smoothstep(0, params.riverHalfWidth, distToRiver)
    const fordLift =
      params.fordHalfWidth > 0 ? 1 - smoothstep(0, params.fordHalfWidth + 2, Math.abs(x - midX)) : 0
    const bed = params.riverBedHeight + fordLift * (params.seaLevel + 1 - params.riverBedHeight)
    height = bed + (height - bed) * valley

    // Flatten a plateau for each base so the structure always sits on solid ground.
    const dx = x - baseX + 0.5
    const dz = z - params.baseCenterZ
    const distToBase = Math.sqrt(dx * dx + dz * dz)
    const plateau = params.baseHeight + 2
    const blend = smoothstep(params.baseRadius * 0.6, params.baseRadius, distToBase)
    height = plateau + (height - plateau) * blend

    return Math.max(2, Math.min(WORLD_SIZE.y - 8, Math.round(height)))
  }
}

function columnBlock(y: number, height: number, params: TerrainParams): BlockId {
  if (y === 0) return BLOCK.bedrock
  if (y > height) return y <= params.seaLevel ? BLOCK.water : BLOCK.air
  if (y === height) {
    if (height <= params.seaLevel + 1) return BLOCK.sand
    return BLOCK.grass
  }
  if (y >= height - 3) return height <= params.seaLevel + 1 ? BLOCK.sand : BLOCK.dirt
  return BLOCK.stone
}

// Blue base: a flag platform inside a U-shaped wall open toward the enemy, with two corner towers.
function buildBase(
  place: (x: number, y: number, z: number, id: BlockId) => void,
  floorY: number,
  params: TerrainParams,
): void {
  const cx = WORLD_SIZE.x / 2
  const cz = params.baseCenterZ
  const half = 6
  const wallHeight = 3
  const towerHeight = 6

  for (let x = cx - 2; x <= cx + 2; x++)
    for (let z = cz - 2; z <= cz + 2; z++) place(x, floorY, z, BLOCK.blueLight)
  place(cx, floorY + 1, cz, BLOCK.blue)
  place(cx, floorY + 2, cz, BLOCK.blue)

  for (let y = floorY + 1; y <= floorY + wallHeight; y++) {
    for (let x = cx - half; x <= cx + half; x++) place(x, y, cz - half, BLOCK.blue)
    for (let z = cz - half; z <= cz + half - 3; z++) {
      place(cx - half, y, z, BLOCK.blue)
      place(cx + half, y, z, BLOCK.blue)
    }
  }

  for (const tx of [cx - half, cx + half]) {
    for (let y = floorY + 1; y <= floorY + towerHeight; y++)
      for (let x = tx - 1; x <= tx + 1; x++)
        for (let z = cz + half - 3; z <= cz + half - 1; z++) {
          const edge = x === tx - 1 || x === tx + 1 || z === cz + half - 3 || z === cz + half - 1
          if (y === floorY + towerHeight) place(x, y, z, edge ? BLOCK.blue : BLOCK.blueLight)
          else if (edge) place(x, y, z, BLOCK.blue)
        }
  }
}

export function generateWorld(seed: number, params: TerrainParams = TERRAIN): World {
  const world = new World()
  const heightAt = createHeightmap(seed, params)
  const halfZ = WORLD_SIZE.z / 2

  const heights = new Uint8Array(WORLD_SIZE.x * halfZ)
  for (let z = 0; z < halfZ; z++)
    for (let x = 0; x < WORLD_SIZE.x; x++) heights[x + z * WORLD_SIZE.x] = heightAt(x, z)

  // Only the blue half is generated; writes are mirrored into the red half with team colors swapped.
  const place = (x: number, y: number, z: number, id: BlockId) => {
    world.fillBlock(x, y, z, id)
    world.fillBlock(x, y, WORLD_SIZE.z - 1 - z, mirrorBlock(id))
  }

  for (let z = 0; z < halfZ; z++)
    for (let x = 0; x < WORLD_SIZE.x; x++) {
      const height = heights[x + z * WORLD_SIZE.x] ?? 0
      const top = Math.max(height, params.seaLevel)
      for (let y = 0; y <= top; y++) place(x, y, z, columnBlock(y, height, params))
    }

  const baseFloor =
    heights[WORLD_SIZE.x / 2 + params.baseCenterZ * WORLD_SIZE.x] ?? params.baseHeight
  buildBase(place, baseFloor, params)

  return world
}
