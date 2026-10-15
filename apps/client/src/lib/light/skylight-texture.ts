import { WORLD_SIZE } from '@blockfront/sim/config'
import { computeSkylight, updateSkylight } from '@blockfront/sim/world/skylight'
import type { World } from '@blockfront/sim/world/world'
import { Data3DTexture, LinearFilter, RedFormat, UnsignedByteType } from 'three'
import type { LightRequest, LightResponse } from './light.worker.ts'

const UPLOAD_THROTTLE_MS = 120
const FALLBACK_MS = 3000

// Skylight for the whole map in an R8 3D texture (1.5 MB). The first fill arrives from a worker;
// edits are re-flooded here in well under a millisecond. Every change is published as a brand
// new texture object (throttled) instead of updating the old one in place: a fresh upload works
// on every driver, while in-place texSubImage3D updates did not light the map on one machine.
export class SkylightTexture {
  texture: Data3DTexture
  ready = false
  initialMs = 0
  private readonly light: Uint8Array
  private dirty = false
  private lastUpload = 0
  private editSamples: number[] = []
  private pendingEdits = 0
  private fallbackTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners: ((texture: Data3DTexture) => void)[] = []

  constructor(
    private readonly world: World,
    seed: number,
  ) {
    this.light = new Uint8Array(WORLD_SIZE.x * WORLD_SIZE.y * WORLD_SIZE.z)
    this.texture = this.createTexture()

    const worker = new Worker(new URL('./light.worker.ts', import.meta.url), {
      type: 'module',
      name: 'skylight',
    })
    worker.onmessage = (event: MessageEvent<LightResponse>) => {
      this.adopt(event.data.light, event.data.lightMs)
      worker.terminate()
    }
    worker.onerror = (event) => {
      console.error('skylight worker failed, computing on the main thread', event.message)
      this.adopt(computeSkylight(this.world), 0)
      worker.terminate()
    }
    const request: LightRequest = { seed }
    worker.postMessage(request)
    // If the worker dies or stalls, light the map here rather than leave it dark.
    this.fallbackTimer = setTimeout(() => {
      if (this.ready) return
      console.warn('skylight worker took too long; computing on the main thread')
      this.adopt(computeSkylight(this.world), 0)
      worker.terminate()
    }, FALLBACK_MS)
  }

  // Called with every new texture object; materials rebind their uniform here.
  onTexture(listener: (texture: Data3DTexture) => void): void {
    this.listeners.push(listener)
    listener(this.texture)
  }

  // A few open-sky cells, for checking the upload from the console.
  sample(x: number, y: number, z: number): number {
    return this.light[x + y * WORLD_SIZE.x + z * WORLD_SIZE.x * WORLD_SIZE.y] ?? -1
  }

  // Call after the world copy already holds the new block.
  onBlockChanged(x: number, y: number, z: number): void {
    if (!this.ready) {
      this.pendingEdits++
      return
    }
    const start = performance.now()
    updateSkylight(this.world, this.light, x, y, z)
    this.editSamples.push(performance.now() - start)
    if (this.editSamples.length > 64) this.editSamples.shift()
    this.dirty = true
  }

  // Publishes a fresh texture at most every UPLOAD_THROTTLE_MS.
  flush(): void {
    if (!this.dirty) return
    const now = performance.now()
    if (now - this.lastUpload < UPLOAD_THROTTLE_MS) return
    this.publish()
    this.lastUpload = now
    this.dirty = false
  }

  editStats(): { avgMs: number; maxMs: number } {
    if (this.editSamples.length === 0) return { avgMs: 0, maxMs: 0 }
    const avgMs = this.editSamples.reduce((a, b) => a + b, 0) / this.editSamples.length
    return { avgMs, maxMs: Math.max(...this.editSamples) }
  }

  dispose(): void {
    clearTimeout(this.fallbackTimer)
    this.texture.dispose()
  }

  private adopt(light: Uint8Array, lightMs: number): void {
    if (this.ready) return
    clearTimeout(this.fallbackTimer)
    this.initialMs = lightMs
    // Edits that happened while the worker ran are replayed by recomputing from this world.
    this.light.set(this.pendingEdits > 0 ? computeSkylight(this.world) : light)
    this.ready = true
    this.publish()
    console.info(`skylight ready: ${lightMs.toFixed(0)} ms, sample ${this.sample(64, 60, 17)}/15`)
  }

  private createTexture(): Data3DTexture {
    // The texture gets its own copy so a later edit cannot race the upload.
    const texture = new Data3DTexture(this.light.slice(), WORLD_SIZE.x, WORLD_SIZE.y, WORLD_SIZE.z)
    texture.format = RedFormat
    texture.type = UnsignedByteType
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.unpackAlignment = 1
    texture.needsUpdate = true
    return texture
  }

  private publish(): void {
    const old = this.texture
    this.texture = this.createTexture()
    for (const listener of this.listeners) listener(this.texture)
    old.dispose()
  }
}
