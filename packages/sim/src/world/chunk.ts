import { CHUNK_SIZE } from '../config.ts'

export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE
export const CHUNK_SHIFT = Math.log2(CHUNK_SIZE)
export const CHUNK_MASK = CHUNK_SIZE - 1

export function chunkIndex(x: number, y: number, z: number): number {
  return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE
}

export class Chunk {
  readonly data = new Uint8Array(CHUNK_VOLUME)

  get(x: number, y: number, z: number): number {
    return this.data[chunkIndex(x, y, z)] ?? 0
  }

  set(x: number, y: number, z: number, id: number): void {
    this.data[chunkIndex(x, y, z)] = id
  }
}
