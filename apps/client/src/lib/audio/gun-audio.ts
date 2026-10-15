import type { WeaponId } from '@blockfront/sim/combat/weapons'
import manifest from './gun-manifest.json'

// Own voice manager for the guns (docs/f2-6-feel.md §3): one AudioBufferSourceNode per shot,
// a panner per entity, layered own shots, round-robin takes, buses with a compressor and a
// limiter on the master, ducking, one shared reverb send driven by how enclosed the listener
// is, and voice limits that steal the quietest voice.

type Layer = 'own' | 'near' | 'mid' | 'far' | 'tail' | 'mech'
type Bus = 'own' | 'enemies' | 'impacts' | 'world' | 'ui'

interface WeaponClips {
  own: string[]
  near: string[]
  mid: string[]
  far: string[]
  tail: string[]
  mech: string[]
}

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  bus: Bus
  entity: number
  level: number
  tailKey?: string
}

interface Entity {
  panner: PannerNode
  filter: BiquadFilterNode
  distance: number
  voices: number
}

const CLIPS = manifest.weapons as Record<string, WeaponClips>
const EXTRAS = manifest.extras as Record<string, string[]>
const LIMITS = { own: 8, perEnemy: 3, global: 40 }
const LOCAL = -1
const DB = (db: number) => Math.pow(10, db / 20)
const SPEED_OF_SOUND = 343

function pick(list: string[], last: Map<string, number>, key: string): string | null {
  if (list.length === 0) return null
  if (list.length === 1) return list[0]!
  let index = Math.floor(Math.random() * list.length)
  if (index === last.get(key)) index = (index + 1) % list.length
  last.set(key, index)
  return list[index]!
}

export class GunAudio {
  readonly ready: Promise<void>
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly buses: Record<Bus, GainNode>
  private readonly sends: Record<Bus, GainNode>
  private readonly master: GainNode
  private readonly convolver: ConvolverNode
  private readonly entities = new Map<number, Entity>()
  private readonly voices = new Set<Voice>()
  private readonly tails = new Map<string, Voice>()
  private readonly lastTake = new Map<string, number>()
  private readonly lastPlay = new Map<string, number>()
  private enclosure = 0
  private format: 'webm' | 'm4a' = 'webm'
  loadedBytes = 0

  constructor(private readonly context: AudioContext) {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.ratio.value = 4
    compressor.attack.value = 0.003
    compressor.release.value = 0.15
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -1
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.05
    limiter.knee.value = 0
    this.master = context.createGain()
    // Overall level: the playtest found everything too loud.
    this.master.gain.value = DB(-7)
    this.master.connect(compressor).connect(limiter).connect(context.destination)

    const bus = () => {
      const g = context.createGain()
      g.gain.value = DB(-6)
      g.connect(this.master)
      return g
    }
    this.buses = { own: bus(), enemies: bus(), impacts: bus(), world: bus(), ui: bus() }

    // One shared reverb: pre-delay then the impulse, fed by per-bus sends.
    this.convolver = context.createConvolver()
    const preDelay = context.createDelay(0.1)
    preDelay.delayTime.value = 0.015
    preDelay.connect(this.convolver).connect(this.master)
    const send = () => {
      const g = context.createGain()
      g.gain.value = 0
      g.connect(preDelay)
      return g
    }
    this.sends = { own: send(), enemies: send(), impacts: send(), world: send(), ui: send() }
    this.ready = this.load()
  }

  private async load(): Promise<void> {
    // Opus in WebM when the browser decodes it, AAC otherwise: probe with the smallest clip.
    try {
      const probe = await fetch('/audio/guns/bullet-whiz.webm').then((r) => r.arrayBuffer())
      await this.context.decodeAudioData(probe.slice(0))
      this.format = 'webm'
    } catch {
      this.format = 'm4a'
    }
    const names = new Set<string>()
    for (const clips of Object.values(CLIPS))
      for (const list of Object.values(clips)) for (const n of list) names.add(n)
    for (const list of Object.values(EXTRAS)) for (const n of list) names.add(n)
    await Promise.all(
      [...names].map(async (name) => {
        try {
          const data = await fetch(`/audio/guns/${name}.${this.format}`).then((r) =>
            r.arrayBuffer(),
          )
          this.loadedBytes += data.byteLength
          this.buffers.set(name, await this.context.decodeAudioData(data))
        } catch (error) {
          console.error('gun clip failed', name, error)
        }
      }),
    )
    const ir = this.buffers.get('ir-garage')
    if (ir) this.convolver.buffer = ir
  }

  // 0 = open field, 1 = fully enclosed; drives the reverb send.
  setEnclosure(ratio: number): void {
    this.enclosure = ratio
    const now = this.context.currentTime
    this.sends.own.gain.setTargetAtTime(0.45 * ratio, now, 0.1)
    this.sends.enemies.gain.setTargetAtTime(0.35 * ratio, now, 0.1)
    this.sends.impacts.gain.setTargetAtTime(0.25 * ratio, now, 0.1)
  }

  // Listener pose every frame; HRTF only for the four nearest entities.
  updateListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.context.listener
    const now = this.context.currentTime
    if (l.positionX) {
      l.positionX.setValueAtTime(x, now)
      l.positionY.setValueAtTime(y, now)
      l.positionZ.setValueAtTime(z, now)
      l.forwardX.setValueAtTime(fx, now)
      l.forwardY.setValueAtTime(fy, now)
      l.forwardZ.setValueAtTime(fz, now)
      l.upX.setValueAtTime(0, now)
      l.upY.setValueAtTime(1, now)
      l.upZ.setValueAtTime(0, now)
    }
    const sorted = [...this.entities.values()].sort((a, b) => a.distance - b.distance)
    sorted.forEach((entity, index) => {
      const model = index < 4 ? 'HRTF' : 'equalpower'
      if (entity.panner.panningModel !== model) entity.panner.panningModel = model
    })
  }

  // First-person shot: mechanical click, the "behind the shooter" body, a synthetic thump and
  // the tail, staggered by a few milliseconds so the peaks do not stack.
  shotOwn(weapon: WeaponId): void {
    const clips = CLIPS[weapon]
    if (!clips) return
    const now = this.context.currentTime
    this.duck()
    const body = pick(clips.own, this.lastTake, `${weapon}-own`)
    if (body) this.play(body, 'own', LOCAL, { at: now, volume: 1, pitch: 0.04 })
    this.thump(now + 0.004, weapon === 'shotgun' || weapon === 'sniper' ? 55 : 60)
    const tail = pick(clips.tail, this.lastTake, `${weapon}-tail`)
    if (tail)
      this.play(tail, 'own', LOCAL, {
        at: now + 0.008,
        volume: 0.55,
        pitch: 0.03,
        tailKey: `${weapon}-${LOCAL}`,
      })
  }

  // Enemy shot at a world position: body by distance, tail, low-pass and delay by distance.
  shotAt(
    weapon: WeaponId,
    entity: number,
    x: number,
    y: number,
    z: number,
    distance: number,
  ): void {
    const clips = CLIPS[weapon]
    if (!clips) return
    const e = this.entity(entity, x, y, z, distance)
    const near = distance < 25
    const far = distance > 60 && clips.far.length > 0
    const layer: Layer = near ? 'near' : far ? 'far' : 'mid'
    const body = pick(clips[layer], this.lastTake, `${weapon}-${layer}`)
    const at = this.context.currentTime + distance / SPEED_OF_SOUND
    if (body) this.play(body, 'enemies', entity, { at, volume: 1, pitch: 0.04, panner: e })
    const tail = pick(clips.tail, this.lastTake, `${weapon}-tail`)
    if (tail)
      this.play(tail, 'enemies', entity, {
        at: at + 0.006,
        volume: near ? 0.5 : 0.8,
        pitch: 0.03,
        panner: e,
        tailKey: `${weapon}-${entity}`,
      })
  }

  // Bolt, pump, slide: the weapon's mechanical clip, own or positional.
  mech(weapon: WeaponId, entity: number, position?: [number, number, number], distance = 0): void {
    const clips = CLIPS[weapon]
    const clip = clips?.mech[0]
    if (!clip) return
    if (entity === LOCAL || !position) {
      this.play(clip, 'own', LOCAL, { at: this.context.currentTime, volume: 0.8, pitch: 0.02 })
      return
    }
    if (distance > 40) return
    const e = this.entity(entity, ...position, distance)
    this.play(clip, 'enemies', entity, {
      at: this.context.currentTime + distance / SPEED_OF_SOUND,
      volume: 0.7,
      pitch: 0.02,
      panner: e,
    })
  }

  explosion(entity: number, x: number, y: number, z: number, distance: number): void {
    const clip = EXTRAS['grenade-blast']?.[0]
    const now = this.context.currentTime + distance / SPEED_OF_SOUND
    if (clip) {
      if (distance < 3) this.play(clip, 'impacts', LOCAL, { at: now, volume: 1, pitch: 0.03 })
      else
        this.play(clip, 'impacts', entity, {
          at: now,
          volume: 1,
          pitch: 0.03,
          panner: this.entity(entity, x, y, z, distance),
        })
    }
    this.thump(now, 45, 0.5, Math.max(0.2, 1 - distance / 30))
    this.duck()
  }

  casing(x: number, y: number, z: number, distance: number, entity: number): void {
    const clip = pick(EXTRAS.casing ?? [], this.lastTake, 'casing')
    if (!clip || distance > 20) return
    const at = this.context.currentTime + 0.35 + Math.random() * 0.25
    if (distance < 2) this.play(clip, 'world', LOCAL, { at, volume: 0.35, pitch: 0.06 })
    else
      this.play(clip, 'world', entity, {
        at,
        volume: 0.4,
        pitch: 0.06,
        panner: this.entity(entity, x, y, z, distance),
      })
  }

  // A bullet passing close: a short flyby from the point of the ray nearest to the listener.
  whiz(x: number, y: number, z: number, distance: number): void {
    const clip = EXTRAS['bullet-whiz']?.[0]
    if (!clip) return
    const e = this.entity(-2, x, y, z, distance)
    this.play(clip, 'world', -2, {
      at: this.context.currentTime,
      volume: 0.9,
      pitch: 0.08,
      panner: e,
    })
  }

  // Short click at 2–4 kHz; the headshot adds a second, higher one.
  // Trigger on an empty magazine: a dry hammer click, short and dull, heard only by the shooter.
  dryFire(): void {
    const now = this.context.currentTime
    this.click(now, 1100, 0.018, 0.55)
    this.click(now + 0.035, 650, 0.03, 0.4)
  }

  hitmarker(head: boolean): void {
    const now = this.context.currentTime
    this.click(now, head ? 2600 : 3000, 0.025, 0.5)
    if (head) this.click(now + 0.04, 4200, 0.03, 0.6)
  }

  dispose(): void {
    for (const voice of this.voices) voice.source.stop()
    this.voices.clear()
    this.master.disconnect()
  }

  private entity(id: number, x: number, y: number, z: number, distance: number): Entity {
    let e = this.entities.get(id)
    if (!e) {
      const panner = this.context.createPanner()
      panner.panningModel = 'equalpower'
      panner.distanceModel = 'inverse'
      panner.refDistance = 8
      panner.rolloffFactor = 1.2
      panner.maxDistance = 400
      const filter = this.context.createBiquadFilter()
      filter.type = 'lowpass'
      panner.connect(filter)
      e = { panner, filter, distance, voices: 0 }
      this.entities.set(id, e)
    }
    const now = this.context.currentTime
    e.panner.positionX.setValueAtTime(x, now)
    e.panner.positionY.setValueAtTime(y, now)
    e.panner.positionZ.setValueAtTime(z, now)
    e.distance = distance
    // 20 kHz near down to 1.5 kHz past 100 blocks.
    const t = Math.min(1, distance / 100)
    e.filter.frequency.setValueAtTime(20000 * Math.pow(1500 / 20000, t), now)
    return e
  }

  private play(
    name: string,
    bus: Bus,
    entity: number,
    options: { at: number; volume: number; pitch: number; panner?: Entity; tailKey?: string },
  ): void {
    const buffer = this.buffers.get(name)
    if (!buffer) return
    // No same sample twice within 25 ms on the same entity.
    const key = `${entity}:${name}`
    const last = this.lastPlay.get(key) ?? -1
    if (options.at - last < 0.025) return
    this.lastPlay.set(key, options.at)
    const e = options.panner
    const level = options.volume / (1 + (e ? e.distance / 8 : 0))
    if (20 * Math.log10(level) < -60) return
    if (!this.makeRoom(bus, entity, level)) return

    if (options.tailKey) {
      const previous = this.tails.get(options.tailKey)
      if (previous) {
        previous.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01)
        previous.source.stop(this.context.currentTime + 0.04)
      }
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * options.pitch
    const gain = this.context.createGain()
    gain.gain.value = options.volume * DB((Math.random() * 2 - 1) * 1.2)
    source.connect(gain)
    if (e) {
      gain.connect(e.panner)
      e.filter.connect(this.buses[bus])
      e.filter.connect(this.sends[bus])
      e.voices++
    } else {
      gain.connect(this.buses[bus])
      gain.connect(this.sends[bus])
    }
    const voice: Voice = { source, gain, bus, entity, level }
    if (options.tailKey) {
      voice.tailKey = options.tailKey
      this.tails.set(options.tailKey, voice)
    }
    this.voices.add(voice)
    source.onended = () => {
      this.voices.delete(voice)
      if (e) e.voices--
      if (voice.tailKey && this.tails.get(voice.tailKey) === voice) this.tails.delete(voice.tailKey)
      source.disconnect()
      gain.disconnect()
    }
    source.start(Math.max(options.at, this.context.currentTime))
  }

  // Own weapon 8, each enemy 3, 40 in total: the quietest voice goes first.
  private makeRoom(bus: Bus, entity: number, level: number): boolean {
    const own = entity === LOCAL
    const limit = own ? LIMITS.own : LIMITS.perEnemy
    const mine = [...this.voices].filter((v) => v.entity === entity)
    if (mine.length >= limit) this.steal(mine, level)
    if (this.voices.size >= LIMITS.global) return this.steal([...this.voices], level)
    void bus
    return true
  }

  private steal(candidates: Voice[], level: number): boolean {
    let quietest: Voice | null = null
    for (const v of candidates) if (!quietest || v.level < quietest.level) quietest = v
    if (!quietest || quietest.level > level) return false
    quietest.source.stop()
    this.voices.delete(quietest)
    return true
  }

  // Own shots push enemies and the world down 3.5 dB for a moment.
  private duck(): void {
    const now = this.context.currentTime
    for (const bus of [this.buses.enemies, this.buses.world]) {
      bus.gain.cancelScheduledValues(now)
      bus.gain.setTargetAtTime(DB(-6) * DB(-3.5), now, 0.005)
      bus.gain.setTargetAtTime(DB(-6), now + 0.06, 0.07)
    }
  }

  // Synthetic low end under every shot and blast: a short sine with a fast decay.
  private thump(at: number, hz: number, seconds = 0.1, volume = 0.7): void {
    const osc = this.context.createOscillator()
    osc.frequency.value = hz
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds)
    osc.connect(gain).connect(this.buses.own)
    osc.start(at)
    osc.stop(at + seconds + 0.02)
  }

  private click(at: number, hz: number, seconds: number, volume: number): void {
    const osc = this.context.createOscillator()
    osc.type = 'square'
    osc.frequency.value = hz
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds)
    osc.connect(gain).connect(this.buses.ui)
    osc.start(at)
    osc.stop(at + seconds + 0.01)
  }
}
