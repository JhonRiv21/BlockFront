# Asset credits

Every third-party asset shipped with Blockfront is CC0 (public domain). Each entry records where it
came from so the license can be re-checked. Files are converted for the web (glTF quantized with
WebP textures through `gltf-transform`, audio re-encoded to mono AAC 22 kHz with `ffmpeg`); the
originals are not committed.

| Asset                                                                                                                                                         | Author              | Source                                     | License | Used as                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blocky Characters 2.0 (`character-a.glb`)                                                                                                                     | Kenney              | https://kenney.nl/assets/blocky-characters | CC0 1.0 | `apps/client/public/models/character.glb`, tinted per team, clips idle / walk / sprint / die                                                     |
| Blaster Kit 2.1 (`blaster-n`, `blaster-q`, `blaster-f`, `grenade-a`)                                                                                          | Kenney              | https://kenney.nl/assets/blaster-kit       | CC0 1.0 | `models/smg.glb`, `shotgun.glb`, `sniper.glb`, `grenade.glb` (viewmodel and held weapons); the rifle is procedural (`rifle-model.ts`)            |
| Impact Sounds 1.0                                                                                                                                             | Kenney              | https://kenney.nl/assets/impact-sounds     | CC0 1.0 | `audio/footstep-*`, `block-break-*`, `block-hit`, `block-place`, `hit`, `hit-head`, `hurt`, `death`, `shovel`, `grenade-throw`, `grenade-bounce` |
| Synthesized rifle shot (`audio/shot-rifle`): white-noise crack + 70 Hz thump generated with ffmpeg, layered over Kenney Impact Sounds `impactPlate_heavy_000` | Blockfront / Kenney | this repo                                  | CC0 1.0 | `audio/shot-rifle`                                                                                                                               |
| Sci-Fi Sounds 1.0                                                                                                                                             | Kenney              | https://kenney.nl/assets/sci-fi-sounds     | CC0 1.0 | `audio/shot-smg`, `shot-shotgun`, `shot-sniper` (laser variants), `reload` (door), `explosion`                                                   |

License text as shipped in each pack: "License: (Creative Commons Zero, CC0)" with the note that
written permission is not required and crediting is voluntary. Pages checked on 2026-10-08.

Not used: Quaternius Ultimate Guns (CC0) is only distributed through a Google Drive folder, so the
Blaster Kit was chosen for a direct, reproducible download and a matching blocky style.
