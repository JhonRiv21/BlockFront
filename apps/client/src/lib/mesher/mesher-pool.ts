import type { ChunkMesh } from '@blockfront/sim/world/mesher'
import type { MeshRequest, MeshResponse } from './messages.ts'

export interface MeshStats {
  avgMs: number
  maxMs: number
  count: number
}

interface Job {
  id: number
  chunkKey: number
  voxels: Uint8Array
  resolve: (mesh: ChunkMesh | null) => void
}

const SAMPLE_WINDOW = 64

// Runs the pure mesher in a few Web Workers. One in-flight request per chunk wins: a newer
// request for the same chunk supersedes the older one, which resolves to null.
export class MesherPool {
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly queue: Job[] = []
  private readonly running = new Map<Worker, Job>()
  private readonly latestJobByChunk = new Map<number, number>()
  private readonly samples: number[] = []
  private nextId = 1
  private maxMs = 0
  private count = 0

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./mesher.worker.ts', import.meta.url), {
        type: 'module',
        name: `mesher-${i}`,
      })
      worker.onmessage = (event: MessageEvent<MeshResponse>) => this.onResult(worker, event.data)
      worker.onerror = (event) => {
        console.error('mesher worker failed', event.message)
      }
      this.workers.push(worker)
      this.idle.push(worker)
    }
  }

  get size(): number {
    return this.workers.length
  }

  mesh(chunkKey: number, voxels: Uint8Array): Promise<ChunkMesh | null> {
    return new Promise((resolve) => {
      const id = this.nextId++
      this.latestJobByChunk.set(chunkKey, id)
      const queued = this.queue.findIndex((job) => job.chunkKey === chunkKey)
      if (queued !== -1) {
        this.queue[queued]!.resolve(null)
        this.queue.splice(queued, 1)
      }
      this.queue.push({ id, chunkKey, voxels, resolve })
      this.pump()
    })
  }

  stats(): MeshStats {
    const avgMs =
      this.samples.length === 0
        ? 0
        : this.samples.reduce((sum, ms) => sum + ms, 0) / this.samples.length
    return { avgMs, maxMs: this.maxMs, count: this.count }
  }

  resetStats(): void {
    this.samples.length = 0
    this.maxMs = 0
    this.count = 0
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate()
    for (const job of this.queue) job.resolve(null)
    for (const job of this.running.values()) job.resolve(null)
    this.workers.length = 0
    this.idle.length = 0
    this.queue.length = 0
    this.running.clear()
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!
      const job = this.queue.shift()!
      this.running.set(worker, job)
      const request: MeshRequest = { id: job.id, voxels: job.voxels }
      worker.postMessage(request, [job.voxels.buffer])
    }
  }

  private onResult(worker: Worker, response: MeshResponse): void {
    const job = this.running.get(worker)
    this.running.delete(worker)
    this.idle.push(worker)
    this.pump()
    if (!job || job.id !== response.id) return

    this.count++
    this.maxMs = Math.max(this.maxMs, response.ms)
    this.samples.push(response.ms)
    if (this.samples.length > SAMPLE_WINDOW) this.samples.shift()

    const stale = this.latestJobByChunk.get(job.chunkKey) !== job.id
    job.resolve(stale ? null : response.mesh)
  }
}
