import { CHUNK_SIZE } from '@blockfront/sim/config'
import type { BlockId } from '@blockfront/sim/world/blocks'
import type { ChunkMesh, DecorMesh, SurfaceMesh } from '@blockfront/sim/world/mesher'
import { chunkKey, type ChunkCoord, type World } from '@blockfront/sim/world/world'
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from 'three'
import { WorkerLostError, type MesherPool } from '../mesher/mesher-pool.ts'

export interface WorldMaterials {
  opaque: Material
  liquid: Material
  decor: Material
}

interface ChunkMeshes {
  opaque: Mesh | null
  liquid: Mesh | null
  decor: Mesh | null
}

// Keeps the Three meshes of every chunk (opaque, liquid, decor) in sync with the sim World.
export class WorldView {
  private readonly meshes = new Map<number, ChunkMeshes>()
  private readonly quadsByChunk = new Map<number, number>()
  private disposed = false

  constructor(
    private readonly scene: Scene,
    private readonly world: World,
    private readonly pool: MesherPool,
    private readonly materials: WorldMaterials,
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
    for (const key of [...this.meshes.keys()]) this.removeMeshes(key)
    this.quadsByChunk.clear()
  }

  private async remesh(coord: ChunkCoord, retry = true): Promise<void> {
    const key = chunkKey(coord.cx, coord.cy, coord.cz)
    const voxels = this.world.copyPaddedChunk(coord.cx, coord.cy, coord.cz)
    let mesh: ChunkMesh | null
    try {
      mesh = await this.pool.mesh(key, voxels)
    } catch (error) {
      // The worker died with our chunk; the buffer went with it, so send a fresh copy once.
      if (error instanceof WorkerLostError && retry && !this.disposed)
        return this.remesh(coord, false)
      throw error
    }
    if (mesh === null || this.disposed) return
    this.apply(key, coord, mesh)
  }

  private removeMeshes(key: number): void {
    const existing = this.meshes.get(key)
    if (!existing) return
    for (const mesh of [existing.opaque, existing.liquid, existing.decor]) {
      if (!mesh) continue
      this.scene.remove(mesh)
      mesh.geometry.dispose()
    }
    this.meshes.delete(key)
  }

  private apply(key: number, coord: ChunkCoord, chunkMesh: ChunkMesh): void {
    this.removeMeshes(key)
    this.quadsByChunk.set(
      key,
      chunkMesh.quadCount + chunkMesh.liquid.quadCount + chunkMesh.decor.quadCount,
    )
    const entry: ChunkMeshes = {
      opaque: this.surfaceMesh(coord, chunkMesh, this.materials.opaque, 0),
      liquid: this.surfaceMesh(coord, chunkMesh.liquid, this.materials.liquid, 2),
      decor: this.decorMesh(coord, chunkMesh.decor),
    }
    this.meshes.set(key, entry)
  }

  private surfaceMesh(
    coord: ChunkCoord,
    surface: SurfaceMesh,
    material: Material,
    renderOrder: number,
  ): Mesh | null {
    if (surface.quadCount === 0) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(surface.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(surface.normals, 3))
    geometry.setAttribute('layer', new BufferAttribute(surface.layers, 1))
    geometry.setAttribute('blockId', new BufferAttribute(surface.blockIds, 1))
    geometry.setAttribute('ao', new BufferAttribute(surface.ao, 1))
    geometry.setIndex(new BufferAttribute(surface.indices, 1))
    return this.place(coord, geometry, material, renderOrder)
  }

  private decorMesh(coord: ChunkCoord, decor: DecorMesh): Mesh | null {
    if (decor.quadCount === 0) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(decor.positions, 3))
    geometry.setAttribute('uv', new BufferAttribute(decor.uvs, 2))
    geometry.setAttribute('layer', new BufferAttribute(decor.layers, 1))
    geometry.setIndex(new BufferAttribute(decor.indices, 1))
    return this.place(coord, geometry, this.materials.decor, 1)
  }

  private place(
    coord: ChunkCoord,
    geometry: BufferGeometry,
    material: Material,
    renderOrder: number,
  ): Mesh {
    geometry.computeBoundingSphere()
    const mesh = new Mesh(geometry, material)
    mesh.position.set(coord.cx * CHUNK_SIZE, coord.cy * CHUNK_SIZE, coord.cz * CHUNK_SIZE)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    mesh.renderOrder = renderOrder
    this.scene.add(mesh)
    return mesh
  }
}
