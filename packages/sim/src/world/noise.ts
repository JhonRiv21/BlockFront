// mulberry32: small seeded PRNG, good enough for terrain and deterministic across engines.
export function createPrng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Noise2D {
  (x: number, y: number): number
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// Seeded 2D value noise in [0, 1].
export function createValueNoise2D(prng: () => number): Noise2D {
  const size = 256
  const values = new Float32Array(size * size)
  for (let i = 0; i < values.length; i++) values[i] = prng()
  const at = (x: number, y: number) => values[(x & (size - 1)) + (y & (size - 1)) * size] ?? 0
  return (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = fade(x - x0)
    const ty = fade(y - y0)
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx
    return top + (bottom - top) * ty
  }
}

// Fractal sum of octaves, normalised back to [0, 1].
export function fbm2D(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, y * frequency) * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return sum / norm
}
