import type { ChunkMesh } from '@blockfront/sim/world/mesher'

export interface MeshRequest {
  id: number
  voxels: Uint8Array
}

export interface MeshResponse {
  id: number
  mesh: ChunkMesh
  ms: number
}
