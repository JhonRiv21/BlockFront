import { generateWorld } from '@blockfront/sim/world/generator'
import { computeSkylight } from '@blockfront/sim/world/skylight'

const scope = self as unknown as DedicatedWorkerGlobalScope

export interface LightRequest {
  seed: number
}

export interface LightResponse {
  light: Uint8Array
  generateMs: number
  lightMs: number
}

// The first flood fill of the whole map; edits are re-flooded on the main thread afterwards.
scope.onmessage = (event: MessageEvent<LightRequest>) => {
  const t0 = performance.now()
  const world = generateWorld(event.data.seed)
  const t1 = performance.now()
  const light = computeSkylight(world)
  const response: LightResponse = { light, generateMs: t1 - t0, lightMs: performance.now() - t1 }
  scope.postMessage(response, [light.buffer])
}
