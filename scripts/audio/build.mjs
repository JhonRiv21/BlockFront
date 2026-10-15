// Reproducible gun audio pipeline (docs/f2-6-feel.md §3). Downloads only the files listed in
// sources.mjs, cuts each shot at its transient, splits body and tail, normalises and encodes
// Opus (WebM) plus AAC (M4A). Usage: node scripts/audio/build.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FFSL_RAW, FREESOUND, SOURCES } from './sources.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const cache = join(here, 'cache')
const outDir = join(root, 'apps', 'client', 'public', 'audio', 'guns')
mkdirSync(cache, { recursive: true })
mkdirSync(outDir, { recursive: true })

const RATE = 48000
const BODY_SECONDS = 0.25
const TAIL_START = 0.2
const TAIL_SECONDS = 1.3
const PRE_ROLL = 0.002

function download(url, file) {
  if (existsSync(file) && statSync(file).size > 10000) return
  console.log('download', url)
  execFileSync('curl', ['-sL', '--fail', '-o', file, url])
}

// Mono float PCM at RATE, high-passed at 35 Hz.
function decode(file) {
  const out = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-ac',
      '1',
      '-ar',
      String(RATE),
      '-af',
      'highpass=f=35',
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  )
  if (out.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${out.stderr}`)
  return new Float32Array(out.stdout.buffer, out.stdout.byteOffset, out.stdout.length / 4)
}

// Sample indices where a shot starts: envelope over a 1 ms window crossing 20 % of the peak,
// with at least 120 ms between shots, then backed up to the first sample above 2 % of the peak.
function onsets(pcm, minGap = 0.12) {
  let peak = 0
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]))
  const threshold = peak * 0.2
  const floor = peak * 0.02
  const gap = Math.floor(minGap * RATE)
  const result = []
  let last = -gap
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) < threshold || i - last < gap) continue
    let start = i
    while (start > 0 && i - start < RATE * 0.01 && Math.abs(pcm[start]) > floor) start--
    result.push(Math.max(0, start - Math.floor(PRE_ROLL * RATE)))
    last = i
  }
  return result
}

function slice(pcm, start, seconds, fadeIn = 0, fadeOut = 0.03) {
  const length = Math.min(pcm.length - start, Math.floor(seconds * RATE))
  const out = new Float32Array(Math.max(0, length))
  for (let i = 0; i < length; i++) out[i] = pcm[start + i]
  const inSamples = Math.floor(fadeIn * RATE)
  for (let i = 0; i < inSamples && i < length; i++) out[i] *= i / inSamples
  const outSamples = Math.floor(fadeOut * RATE)
  for (let i = 0; i < outSamples && i < length; i++) out[length - 1 - i] *= i / outSamples
  return out
}

function normalise(pcm, dbfs = -1) {
  let peak = 0
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]))
  if (peak === 0) return pcm
  const gain = Math.pow(10, dbfs / 20) / peak
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain
  return pcm
}

function wav(pcm) {
  const bytes = pcm.length * 2
  const buffer = Buffer.alloc(44 + bytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + bytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(RATE, 24)
  buffer.writeUInt32LE(RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(bytes, 40)
  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2)
  }
  return buffer
}

const sizes = {}

function encode(name, pcm, kbps) {
  const tmp = join(cache, `${name}.wav`)
  writeFileSync(tmp, wav(pcm))
  const webm = join(outDir, `${name}.webm`)
  const m4a = join(outDir, `${name}.m4a`)
  execFileSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    tmp,
    '-c:a',
    'libopus',
    '-b:a',
    `${kbps}k`,
    '-application',
    'audio',
    '-f',
    'webm',
    webm,
  ])
  execFileSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    tmp,
    '-c:a',
    'aac',
    '-b:a',
    `${Math.round(kbps * 1.3)}k`,
    m4a,
  ])
  sizes[name] = { webm: statSync(webm).size, m4a: statSync(m4a).size }
}

const manifest = { weapons: {}, extras: {} }

for (const source of SOURCES) {
  const file = join(cache, source.path.replaceAll('/', '__').replaceAll(' ', '_'))
  download(FFSL_RAW + encodeURI(source.path), file)
  const pcm = decode(file)
  const starts = onsets(pcm).slice(source.skip ?? 0, (source.skip ?? 0) + source.takes)
  const kbps = source.layer === 'own' ? 96 : 64
  const entry = (manifest.weapons[source.weapon] ??= {
    own: [],
    near: [],
    mid: [],
    far: [],
    tail: [],
    mech: [],
  })
  starts.forEach((start, index) => {
    if (source.layer === 'mech') {
      const name = `${source.id}`
      encode(name, normalise(slice(pcm, start, source.hold ?? 0.8, 0, 0.05)), kbps)
      entry.mech.push(name)
      return
    }
    const body = `${source.id}-${index}`
    encode(body, normalise(slice(pcm, start, BODY_SECONDS)), kbps)
    entry[source.layer].push(body)
    // One tail per weapon from the near or mid takes; the own body reuses it.
    if (
      (source.layer === 'near' || source.layer === 'mid') &&
      entry.tail.length < 2 &&
      index === 0
    ) {
      const tail = `${source.weapon}-tail-${entry.tail.length}`
      encode(
        tail,
        normalise(slice(pcm, start + Math.floor(TAIL_START * RATE), TAIL_SECONDS, 0.02, 0.25), -6),
        64,
      )
      entry.tail.push(tail)
    }
  })
}

for (const extra of FREESOUND) {
  const file = join(cache, `${extra.id}.mp3`)
  download(extra.preview, file)
  const pcm = decode(file)
  if (extra.impulse) {
    // Impulse response: from its own transient, held for `hold` seconds, normalised lower.
    const start = onsets(pcm)[0] ?? 0
    encode(extra.id, normalise(slice(pcm, start, extra.hold, 0, 0.2), -6), 64)
    manifest.extras[extra.id] = [extra.id]
    continue
  }
  const starts = onsets(pcm, 0.4).slice(0, extra.takes)
  manifest.extras[extra.id] = starts.map((start, index) => {
    const name = extra.takes === 1 ? extra.id : `${extra.id}-${index}`
    encode(name, normalise(slice(pcm, start, extra.hold, 0, 0.08)), 64)
    return name
  })
}

const total = Object.values(sizes).reduce((sum, s) => sum + s.webm, 0)
const totalAac = Object.values(sizes).reduce((sum, s) => sum + s.m4a, 0)
manifest.bytes = { webm: total, m4a: totalAac }
writeFileSync(
  join(root, 'apps', 'client', 'src', 'lib', 'audio', 'gun-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest, null, 1))
console.log(
  `webm total ${(total / 1024).toFixed(0)} KB, m4a total ${(totalAac / 1024).toFixed(0)} KB`,
)
