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
  reject: (error: Error) => void
}

const SAMPLE_WINDOW = 64
// A worker that throws is replaced; after this many replacements the pool gives up and reports.
const MAX_REPLACEMENTS = 3

export class WorkerLostError extends Error {
  constructor() {
    super('mesher worker lost')
  }
}

// Runs the pure mesher in a few Web Workers. One in-flight request per chunk wins: a newer
// request for the same chunk supersedes the older one, which resolves to null. A worker that
// dies is replaced and its job rejects with WorkerLostError so the caller can resend the chunk.
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
  private replacements = 0
  private spawned = 0
  onFatal: (message: string) => void = () => {}

  constructor(size: number) {
    for (let i = 0; i < size; i++) this.spawn()
  }

  private spawn(): void {
    const worker = new Worker(new URL('./mesher.worker.ts', import.meta.url), {
      type: 'module',
      name: `mesher-${this.spawned++}`,
    })
    worker.onmessage = (event: MessageEvent<MeshResponse>) => this.onResult(worker, event.data)
    worker.onerror = (event) => this.onWorkerError(worker, event.message)
    this.workers.push(worker)
    this.idle.push(worker)
  }

  private onWorkerError(worker: Worker, message: string): void {
    console.error('mesher worker failed', message)
    worker.terminate()
    this.workers.splice(this.workers.indexOf(worker), 1)
    const idleAt = this.idle.indexOf(worker)
    if (idleAt !== -1) this.idle.splice(idleAt, 1)
    const job = this.running.get(worker)
    this.running.delete(worker)
    job?.reject(new WorkerLostError())
    if (this.replacements < MAX_REPLACEMENTS) {
      this.replacements++
      this.spawn()
      this.pump()
    } else if (this.workers.length === 0) {
      this.onFatal(message || 'mesher workers keep failing')
    }
  }

  get size(): number {
    return this.workers.length
  }

  mesh(chunkKey: number, voxels: Uint8Array): Promise<ChunkMesh | null> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.latestJobByChunk.set(chunkKey, id)
      const queued = this.queue.findIndex((job) => job.chunkKey === chunkKey)
      if (queued !== -1) {
        this.queue[queued]!.resolve(null)
        this.queue.splice(queued, 1)
      }
      this.queue.push({ id, chunkKey, voxels, resolve, reject })
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
