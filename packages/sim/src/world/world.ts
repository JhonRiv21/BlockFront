import { CHUNK_SIZE, WORLD_SIZE } from '../config.ts'
import { Chunk, CHUNK_MASK, CHUNK_SHIFT } from './chunk.ts'
import { BLOCK, type BlockId } from './palette.ts'

export interface ChunkCoord {
  cx: number
  cy: number
  cz: number
}

export const PADDED_CHUNK_SIZE = CHUNK_SIZE + 2

export function chunkKey(cx: number, cy: number, cz: number): number {
  return cx + cy * 64 + cz * 64 * 64
}

export class World {
  readonly chunksX = WORLD_SIZE.x / CHUNK_SIZE
  readonly chunksY = WORLD_SIZE.y / CHUNK_SIZE
  readonly chunksZ = WORLD_SIZE.z / CHUNK_SIZE
  readonly chunks: Chunk[]
  private readonly dirty = new Map<number, ChunkCoord>()

  constructor() {
    const count = this.chunksX * this.chunksY * this.chunksZ
    this.chunks = Array.from({ length: count }, () => new Chunk())
  }

  getChunk(cx: number, cy: number, cz: number): Chunk {
    const chunk = this.chunks[cx + cy * this.chunksX + cz * this.chunksX * this.chunksY]
    if (!chunk) throw new RangeError(`Chunk out of range: ${cx},${cy},${cz}`)
    return chunk
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < WORLD_SIZE.x && y < WORLD_SIZE.y && z < WORLD_SIZE.z
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (!this.inBounds(x, y, z)) return BLOCK.air
    return this.getChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT).get(
      x & CHUNK_MASK,
      y & CHUNK_MASK,
      z & CHUNK_MASK,
    )
  }

  setBlock(x: number, y: number, z: number, id: BlockId): void {
    if (!this.inBounds(x, y, z)) return
    const cx = x >> CHUNK_SHIFT
    const cy = y >> CHUNK_SHIFT
    const cz = z >> CHUNK_SHIFT
    const chunk = this.getChunk(cx, cy, cz)
    const lx = x & CHUNK_MASK
    const ly = y & CHUNK_MASK
    const lz = z & CHUNK_MASK
    if (chunk.get(lx, ly, lz) === id) return
    chunk.set(lx, ly, lz, id)
    this.markDirty(cx, cy, cz)
    // A border voxel changes the neighbour's visible faces and AO too.
    if (lx === 0) this.markDirty(cx - 1, cy, cz)
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cy, cz)
    if (ly === 0) this.markDirty(cx, cy - 1, cz)
    if (ly === CHUNK_SIZE - 1) this.markDirty(cx, cy + 1, cz)
    if (lz === 0) this.markDirty(cx, cy, cz - 1)
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cy, cz + 1)
  }

  // Writes without dirty tracking; used by the generator before anything is meshed.
  fillBlock(x: number, y: number, z: number, id: BlockId): void {
    if (!this.inBounds(x, y, z)) return
    this.getChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT).set(
      x & CHUNK_MASK,
      y & CHUNK_MASK,
      z & CHUNK_MASK,
      id,
    )
  }

  markDirty(cx: number, cy: number, cz: number): void {
    if (
      cx < 0 ||
      cy < 0 ||
      cz < 0 ||
      cx >= this.chunksX ||
      cy >= this.chunksY ||
      cz >= this.chunksZ
    )
      return
    this.dirty.set(chunkKey(cx, cy, cz), { cx, cy, cz })
  }

  takeDirtyChunks(): ChunkCoord[] {
    const list = [...this.dirty.values()]
    this.dirty.clear()
    return list
  }

  // Chunk voxels plus a one-voxel border from the neighbours, laid out for the mesher.
  // Below the world is reported as bedrock so the floor's underside is never meshed.
  copyPaddedChunk(cx: number, cy: number, cz: number): Uint8Array {
    const P = PADDED_CHUNK_SIZE
    const out = new Uint8Array(P * P * P)
    const ox = cx * CHUNK_SIZE
    const oy = cy * CHUNK_SIZE
    const oz = cz * CHUNK_SIZE
    for (let z = -1; z <= CHUNK_SIZE; z++)
      for (let y = -1; y <= CHUNK_SIZE; y++) {
        const row = (y + 1) * P + (z + 1) * P * P
        const wy = oy + y
        for (let x = -1; x <= CHUNK_SIZE; x++) {
          out[x + 1 + row] = wy < 0 ? BLOCK.bedrock : this.getBlock(ox + x, wy, oz + z)
        }
      }
    return out
  }
}
