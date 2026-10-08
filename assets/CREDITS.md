# Asset credits

Every third-party asset shipped with Blockfront is CC0 (public domain). Each entry records where it
came from so the license can be re-checked. Files are converted for the web (glTF quantized with
WebP textures through `gltf-transform`, audio re-encoded to mono AAC 22 kHz with `ffmpeg`); the
originals are not committed.

| Asset                                     | Author                 | Source                                                                                | License | Used as                                                                                                                                                                     |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocky Characters 2.0 (`character-a.glb`) | Kenney                 | https://kenney.nl/assets/blocky-characters                                            | CC0 1.0 | `apps/client/public/models/character.glb`, tinted per team, clips idle / walk / sprint / die                                                                                |
| Blaster Kit 2.1 (`grenade-a`)             | Kenney                 | https://kenney.nl/assets/blaster-kit                                                  | CC0 1.0 | `models/grenade.glb`. The four guns are procedural boxes (`weapon-models.ts`), no asset                                                                                     |
| Impact Sounds 1.0                         | Kenney                 | https://kenney.nl/assets/impact-sounds                                                | CC0 1.0 | `audio/footstep-*`, `block-break-*`, `block-hit`, `block-place`, `hit`, `hit-head`, `hurt`, `death`, `shovel`, `grenade-bounce`; layers inside the synthesized sounds below |
| Sci-Fi Sounds 1.0                         | Kenney                 | https://kenney.nl/assets/sci-fi-sounds                                                | CC0 1.0 | `explosionCrunch` and `lowFrequency_explosion` as layers inside `audio/explosion`                                                                                           |
| Synthesized sounds                        | Blockfront (this repo) | `ffmpeg` filters (`anoisesrc`, `sine`, fades, EQ) layered over the Kenney clips above | CC0 1.0 | `audio/shot-rifle`, `shot-smg`, `shot-shotgun`, `shot-sniper`, `reload`, `explosion`, `grenade-throw`                                                                       |

License text as shipped in each Kenney pack: "License: (Creative Commons Zero, CC0)" with the note
that written permission is not required and crediting is voluntary. Pages checked on 2026-10-08.

Not used: Quaternius Ultimate Guns (CC0) is only distributed through a Google Drive folder, and the
Blaster Kit guns looked too futuristic next to the voxel world, so the guns are modelled in code.
