import { Audio, AudioListener, Object3D, PositionalAudio, type Scene } from 'three'
import type { AssetStore } from '../assets/asset-store.ts'
import type { SoundName } from '../assets/manifest.ts'

export interface PlayOptions {
  volume?: number
  rate?: number
  refDistance?: number
}

const MAX_VOICES = 24

// 2D sounds for the local player and positional ones for everything else. Browsers keep the
// AudioContext suspended until a gesture, so resume() is called on pointer lock.
export class SoundBank {
  readonly listener = new AudioListener()
  private readonly voices = new Set<Object3D>()
  private muted = false

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetStore,
  ) {}

  resume(): void {
    const context = this.listener.context
    if (context.state === 'suspended') void context.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.listener.setMasterVolume(muted ? 0 : 1)
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    const buffer = this.assets.sound(name)
    if (!buffer || this.muted) return
    const sound = new Audio(this.listener)
    sound.setBuffer(buffer)
    sound.setVolume(options.volume ?? 1)
    sound.setPlaybackRate(options.rate ?? 1)
    this.start(sound, null)
  }

  playAt(name: SoundName, x: number, y: number, z: number, options: PlayOptions = {}): void {
    const buffer = this.assets.sound(name)
    if (!buffer || this.muted || this.voices.size >= MAX_VOICES) return
    const anchor = new Object3D()
    anchor.position.set(x, y, z)
    const sound = new PositionalAudio(this.listener)
    sound.setBuffer(buffer)
    sound.setVolume(options.volume ?? 1)
    sound.setPlaybackRate(options.rate ?? 1)
    sound.setRefDistance(options.refDistance ?? 6)
    sound.setRolloffFactor(1.5)
    sound.setDistanceModel('inverse')
    anchor.add(sound)
    this.scene.add(anchor)
    this.start(sound, anchor)
  }

  // Picks one of the numbered variants so repeated sounds do not sound identical.
  playVariant(prefix: 'footstep' | 'block-break', count: number, options: PlayOptions = {}): void {
    const index = Math.floor(Math.random() * count)
    this.play(`${prefix}-${index}` as SoundName, options)
  }

  playVariantAt(
    prefix: 'footstep' | 'block-break',
    count: number,
    x: number,
    y: number,
    z: number,
    options: PlayOptions = {},
  ): void {
    const index = Math.floor(Math.random() * count)
    this.playAt(`${prefix}-${index}` as SoundName, x, y, z, options)
  }

  dispose(): void {
    for (const anchor of this.voices) this.scene.remove(anchor)
    this.voices.clear()
  }

  private start(sound: Audio | PositionalAudio, anchor: Object3D | null): void {
    if (anchor) this.voices.add(anchor)
    sound.onEnded = () => {
      sound.disconnect()
      if (anchor) {
        this.scene.remove(anchor)
        this.voices.delete(anchor)
      }
    }
    sound.play()
  }
}
