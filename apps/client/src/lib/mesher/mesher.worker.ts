import { meshChunk } from '@blockfront/sim/world/mesher'
import type { MeshRequest, MeshResponse } from './messages.ts'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<MeshRequest>) => {
  const { id, voxels } = event.data
  const start = performance.now()
  const mesh = meshChunk(voxels)
  const ms = performance.now() - start
  const response: MeshResponse = { id, mesh, ms }
  scope.postMessage(response, [
    mesh.positions.buffer,
    mesh.normals.buffer,
    mesh.blockIds.buffer,
    mesh.ao.buffer,
    mesh.indices.buffer,
  ])
}
