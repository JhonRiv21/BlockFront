import { AudioLoader, type AnimationClip, type Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MODELS, SOUNDS, type ModelName, type SoundName } from './manifest.ts'

export interface LoadedModel {
  scene: Group
  animations: AnimationClip[]
}

// Loads every asset of the manifest once; views clone what they need.
export class AssetStore {
  readonly models = new Map<ModelName, LoadedModel>()
  readonly sounds = new Map<SoundName, AudioBuffer>()
  readonly ready: Promise<void>
  loadedBytes = 0

  constructor() {
    this.ready = this.loadAll()
  }

  model(name: ModelName): LoadedModel | null {
    return this.models.get(name) ?? null
  }

  sound(name: SoundName): AudioBuffer | null {
    return this.sounds.get(name) ?? null
  }

  private async loadAll(): Promise<void> {
    const gltf = new GLTFLoader()
    const audio = new AudioLoader()
    const modelJobs = (Object.keys(MODELS) as ModelName[]).map(async (name) => {
      const result = await gltf.loadAsync(MODELS[name])
      this.models.set(name, { scene: result.scene, animations: result.animations })
    })
    const soundJobs = (Object.keys(SOUNDS) as SoundName[]).map(async (name) => {
      this.sounds.set(name, await audio.loadAsync(SOUNDS[name]))
    })
    const results = await Promise.allSettled([...modelJobs, ...soundJobs])
    for (const result of results) {
      if (result.status === 'rejected') console.error('asset failed to load', result.reason)
    }
  }
}
