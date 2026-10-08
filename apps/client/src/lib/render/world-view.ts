import { CHUNK_SIZE } from '@blockfront/sim/config'
import type { ChunkMesh } from '@blockfront/sim/world/mesher'
import type { BlockId } from '@blockfront/sim/world/palette'
import { chunkKey, type ChunkCoord, type World } from '@blockfront/sim/world/world'
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from 'three'
import type { MesherPool } from '../mesher/mesher-pool.ts'

// Keeps one Three mesh per chunk in sync with the sim World through the mesher pool.
export class WorldView {
  private readonly meshes = new Map<number, Mesh>()
  private readonly quadsByChunk = new Map<number, number>()
  private disposed = false

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly pool: MesherPool,
    private readonly material: Material,
  ) {}

  get totalQuads(): number {
    let total = 0
    for (const quads of this.quadsByChunk.values()) total += quads
    return total
  }

  rebuildAll(): Promise<void> {
    const jobs: Promise<void>[] = []
    for (let cz = 0; cz < this.world.chunksZ; cz++)
      for (let cy = 0; cy < this.world.chunksY; cy++)
        for (let cx = 0; cx < this.world.chunksX; cx++) jobs.push(this.remesh({ cx, cy, cz }))
    return Promise.all(jobs).then(() => undefined)
  }

  setBlock(x: number, y: number, z: number, id: BlockId): void {
    this.world.setBlock(x, y, z, id)
  }

  // Remeshes only the chunks the World marked dirty (the edited one and the touched neighbours).
  flushDirty(): Promise<void> {
    const dirty = this.world.takeDirtyChunks()
    return Promise.all(dirty.map((coord) => this.remesh(coord))).then(() => undefined)
  }

  dispose(): void {
    this.disposed = true
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    }
    this.meshes.clear()
    this.quadsByChunk.clear()
  }

  private async remesh(coord: ChunkCoord): Promise<void> {
    const key = chunkKey(coord.cx, coord.cy, coord.cz)
    const voxels = this.world.copyPaddedChunk(coord.cx, coord.cy, coord.cz)
    const mesh = await this.pool.mesh(key, voxels)
    if (mesh === null || this.disposed) return
    this.apply(key, coord, mesh)
  }

  private apply(key: number, coord: ChunkCoord, chunkMesh: ChunkMesh): void {
    const previous = this.meshes.get(key)
    if (previous) {
      this.scene.remove(previous)
      previous.geometry.dispose()
      this.meshes.delete(key)
    }
    this.quadsByChunk.set(key, chunkMesh.quadCount)
    if (chunkMesh.quadCount === 0) return

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(chunkMesh.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(chunkMesh.normals, 3))
    geometry.setAttribute('blockId', new BufferAttribute(chunkMesh.blockIds, 1))
    geometry.setAttribute('ao', new BufferAttribute(chunkMesh.ao, 1))
    geometry.setIndex(new BufferAttribute(chunkMesh.indices, 1))
    geometry.computeBoundingSphere()

    const mesh = new Mesh(geometry, this.material)
    mesh.position.set(coord.cx * CHUNK_SIZE, coord.cy * CHUNK_SIZE, coord.cz * CHUNK_SIZE)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    this.scene.add(mesh)
    this.meshes.set(key, mesh)
  }
}
