# Progress log

## F0 — Scaffolding (2026-10-08) — done

**Done**

- npm workspaces monorepo: `packages/sim`, `apps/client`, `apps/server`. Shared `tsconfig.base.json`
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- `packages/sim`: world constants (`config.ts`) and `FixedStep`, the fixed-timestep clock
  (30 Hz, catch-up capped at 5 steps, backlog dropped after a stall, interpolation `alpha`).
  It is consumed through `exports: { "./*": "./src/*.ts" }`; there is no barrel and no build step.
- `apps/client`: Vite 8 + Svelte 5 + Tailwind v4 + Three.js r186. The placeholder scene (ground plus
  two team towers, an orbiting camera driven by `FixedStep`) has the HUD skeleton: score, crosshair,
  HP, ammo, blocks and an fps/tick readout.
- `apps/server`: Worker serving `apps/client/dist` as static assets. SPA fallback (so `/r/<code>`
  works later), `run_worker_first: ["/api/*"]`, `GET /api/health`.
- ESLint (flat, typescript-eslint, svelte) with a rule blocking `three`/`svelte`/`cloudflare:*`
  imports inside `packages/sim`. Prettier. GitHub Actions CI: format, lint, typecheck, test and
  `wrangler deploy --dry-run`.

**Measured**

| Metric                | Value                                   | Budget   |
| --------------------- | --------------------------------------- | -------- |
| Initial JS (gzip)     | 12.4 kB app + 130 kB three = **142 kB** | < 600 kB |
| CSS (gzip)            | 2.7 kB                                  | —        |
| Production build time | ~0.3 s                                  | —        |
| `sim` tests           | 5/5 (FixedStep)                         | —        |

`three` lives in its own chunk, so redeploys of game code do not invalidate it.

**Verified locally:** `wrangler dev` serves the game. `/api/health` returns 200, unknown
`/api/*` returns 404, and `/r/abc` returns the SPA. There are no console errors.

**Notes / pending**

- **TypeScript is pinned to 6.0.x.** 7.0 (the native Go compiler) is out, but typescript-eslint
  8.71 and svelte-check 4.7 still require `<6.1`. Revisit when they support it.
- **`npm audit`: 3 high issues in `sharp`.** It comes through `wrangler → miniflare` and is only
  used by the local dev server, not shipped. The suggested fix downgrades wrangler to 4.15, so it
  was not applied.
- **fps not measured yet.** The automation browser tab was hidden, so it got no frames. Measure it
  in a visible tab during F1.
- **No Cloudflare deploy yet.** The first real deploy and the `blockfront.riverogz.com` domain
  happen in F3.

**Commands**

```bash
npm run dev            # Vite dev server (client only)
npm run preview        # build + wrangler dev (Worker + assets, http://localhost:8787)
npm run typecheck && npm run lint && npm test
npm run deploy:check   # build + wrangler deploy --dry-run
```

## F1 part 1 — Visible voxel world (2026-10-08) — done

**Done**

- `packages/sim/src/world`: `Chunk` (32³ in a `Uint8Array`, index `x + y*S + z*S*S`), `World`
  (global get/set, dirty marks that include the neighbours when a border voxel changes, padded
  34³ copies with bedrock below `y = 0` so the floor's underside is never meshed), 64-colour
  palette (16 named blocks plus a hue ramp; 0 is air, 1 is indestructible bedrock), seeded noise
  (mulberry32 + value noise + fBm, no `Math.random`), generator (mirrored over Z with blue/red
  swapped, river valley with a sand ford in the middle, hills, flattened plateau per base with a
  U-wall open toward the enemy, two corner towers and a flag platform) and the pure mesher
  (greedy + per-vertex AO, faces merge only with the same colour and AO pattern, diagonal flipped
  toward the brighter pair, faces owned by the padding are skipped so chunks never draw twice).
- `apps/client`: mesher worker + `MesherPool` (2–4 workers, transferables both ways, per-job ms
  measured inside the worker, newest request per chunk wins), `ShaderMaterial` (palette uniform,
  hemispheric + directional light, three's fog chunks, per-voxel tint hashed from
  `floor(worldPos - normal * 0.5)` so merged quads still read as blocks), `WorldView` (one mesh per
  chunk; `setBlock` + `flushDirty` remesh only the dirty chunks), `FlyCamera` (pointer lock,
  WASD, Shift sprint, Space/C up/down), HUD with mesh avg/max ms and quad count, and a debug dig
  key. In dev, `window.blockfront` exposes `pool.stats()`, `worldView` and `renderOnce()`.
- Tests (vitest, written from the spec): chunk indexing and edges, world borders and dirty marks,
  generator determinism and mirror symmetry, greedy quad counts (cube, slab, split colours,
  touching chunks, hidden bottom, AO splits, winding vs normal). 30/30.

**Measured** (seed 1, 128×64×192 = 48 chunks, 24 of them non-empty; Apple Silicon)

| Metric                                        | Value                                                     | Budget   |
| --------------------------------------------- | --------------------------------------------------------- | -------- |
| Map quads                                     | 26 822 quads (53 644 triangles, 24 draw calls)            | —        |
| Remesh per chunk, Chrome worker, warm         | **2.8 ms avg / 3.7 ms max** (all 48, full rebuild)        | < 5 ms   |
| Remesh after a dig (non-empty chunks only)    | 3.6–4.0 ms avg / 4.0 ms max; 6–8 ms wall for 1–4          | < 5 ms   |
| Remesh per chunk, Chrome worker, cold (first) | 7.8 ms avg / 14.9 ms max; 347 ms wall, 4 workers          | —        |
| Remesh per chunk, Node 22 (reference)         | 1.5 ms avg / 1.9 ms max                                   | —        |
| World generation                              | ~20 ms                                                    | —        |
| `renderer.render` CPU                         | 0.5 ms (first frame 5.8 ms incl. shader compile)          | —        |
| Initial JS (gzip)                             | 19.0 kB app + 1.6 kB worker + 129.7 kB three = **150 kB** | < 600 kB |
| CSS (gzip)                                    | 2.9 kB                                                    | —        |

Worker timings were read in the dev server (unminified) through `window.blockfront.pool.stats()`.
The cold numbers are the JIT warming up on the first job of each worker; the budget holds once warm.

**fps not measured.** The automation tab is hidden and gets no frames; the frame was forced once
to compile the shader and capture the canvas (terrain, river, towers and AO render correctly).

**Notes / pending**

- Water is a plain opaque block for now (no transparency, no physics).
- With seed 1 the terrain tops out below `y = 32`, so the upper 24 chunks are empty.
- If cold meshing at match start matters, warm each worker with a dummy chunk before the game.
- Part 2: FPS controller with swept AABB physics, DDA raycast, pick/place with face highlight.

**Debug keys** (click the canvas to lock the pointer, Esc releases it): `WASD` move, `Shift`
sprint, `Space` / `C` up / down, `X` dig a sphere in front of the camera.

## F1 part 2 — Movement, raycast and block editing (2026-10-08) — F1 closed

**Done**

- `packages/sim/src/physics`: `sweep.ts`, a swept AABB through the voxel grid in the style of
  fenomas/voxel-aabb-sweep (the leading faces visit voxel boundaries in time order, the slice
  about to be entered is tested before entering it, the box snaps onto the boundary on a hit and
  slides by dropping that component, at most one collision per axis), and
  `player-controller.ts` (0.6 × 1.8 box, crouch 1.2, eye 1.62 / 1.05, walk 4.3 / sprint 6.5 /
  crouch 2 m/s, jump 8.4 m/s against 28 m/s² so the peak is ~1.26 blocks: one block only with a
  jump, no auto-step; ground and air acceleration; `MoveInput` with yaw 0 facing −Z).
- `packages/sim/src/raycast/dda.ts`: Amanatides–Woo traversal returning the block, the outward
  normal of the face entered and the distance; a zero normal when the origin is inside a solid.
- `apps/client`: `InputState` (pointer lock, keys by `code`, yaw/pitch, click edges, context menu
  blocked). FPS by default: the sim steps at 30 Hz through `FixedStep`, the camera position is
  interpolated with `alpha`, the look direction is applied without delay. A raycast every frame
  with 5 blocks of reach drives `BlockHighlight` (block outline plus a translucent quad on the
  aimed face). Left click digs (bedrock is protected), right click places a blue block on the aimed
  face unless it would overlap the player. `F` toggles the free camera as a debug mode; coming back
  drops the player where the camera was. Spawn on the blue base, facing the enemy.
- Tests written from the spec: sweep (11: floor, walls on both sides, no tunnelling at 500
  blocks per step, sliding, ceiling, gaps narrower than the box, corner clip, no auto-step,
  resting contact), player controller (9: gravity, walk/sprint/strafe directions, jump height
  between 1 and 2 blocks, no air jump, step only with a jump, head bump, crouch, wall slide) and
  DDA (9: faces, diagonal entry, both chunk borders, origin on a boundary, unnormalised direction
  with range, origin inside a solid). 59/59 in `sim`.

**Measured** (hidden automation tab, dev server; seed 1)

| Metric                                       | Value                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| Frame loop CPU (sim step + raycast + render) | ~1.4 ms/frame (1 058 forced frames in 1.5 s)                 |
| Triangles on screen from spawn               | 49 484 of 53 644 (frustum culled), 24 draw calls             |
| Dig → remesh → geometry swapped, 1 chunk     | 5.6–12 ms wall (worker 3.9–11 ms); first after idle 23–29 ms |
| Initial JS (gzip)                            | 21.6 kB app + 1.6 kB worker + 130.8 kB three = **154 kB**    |
| CSS (gzip)                                   | 3.0 kB                                                       |

**F1 done criteria (PLAN.md §5)**

| Criterion                                   | Status                                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk the whole map at a stable 60 fps       | **Not measured**: the automation tab gets no frames. CPU side is ~1.4 ms/frame with 24 draw calls, so the GPU decides. Measure in a visible tab.                                                |
| Remesh of a chunk < 5 ms                    | **Met when warm**: 2.8 ms avg / 3.7 ms max on a full rebuild, 3.9 ms for a single chunk back to back. After the workers sit idle the first job spikes (7–29 ms in the hidden tab); see pending. |
| Dig or place visible < 1 frame after remesh | **Met by construction**: the geometry is swapped in the worker's reply handler and the next render draws it.                                                                                    |

**Notes / pending**

- **Cold worker spikes.** After idling, the first remesh of a worker is 2–7× slower (JIT tier-down
  or background-tab deprioritisation; the hidden tab makes this hard to tell apart). Verify in a
  visible tab with `blockfront.pool.stats()`; if it holds, keep the workers warm or pre-warm them
  at match start.
- Crouch (1.2) and standing (1.8) fit under the same whole-block ceilings, so there is no headroom
  check when standing up. Crouching puts the eye at 1.05, just over a one-block wall; it does not
  allow 1-block tunnels (that would need a crouch height below 1).
- Water is solid for physics as well as rendering (you walk on the river).
- Digging and placing have no cadence, block HP or inventory yet; that is F2.

**Keys** (click the canvas to lock the pointer, `Esc` releases it): `WASD` move, `Space` jump,
`Ctrl` / `C` crouch, `Shift` sprint, left click dig, right click place, `F` free camera (then
`Space` / `C` up / down, `Shift` fast, `F` back to the player).

## F2 part A — Simulation and combat (2026-10-08) — done

**Done**

- `packages/sim/src/game.ts`: `Game.step(inputs) → events` at 30 Hz with a serialisable state
  (`serialize()` / `Game.restore()`: config, tick, RNG state, players, grenades, block changes
  since generation and block health). Players move with the F1 controller, switch slots (1
  weapon, 2 shovel, 3 blocks, 4 grenade), die at 0 HP and respawn after 5 s with full resources.
  Dummies are players that never receive input. Friendly fire is off; own grenades do hurt.
- `packages/sim/src/input.ts`: `InputFrame` (seq, forward/strafe, yaw/pitch, button bitmask
  jump/crouch/sprint/fire/alt/reload, slot). One per tick per player.
- `packages/sim/src/combat/weapons.ts`: the whole balance table in one file, numbers exactly as
  PLAN.md §3 (damage per zone, interval, magazine/reserve, pellets, block damage, grenade and
  shovel values). Decisions the table left open: shotgun falloff 100% to 8 blocks then linear to
  25% at 20; SMG linear from 20 to 45 blocks and flat beyond; spreads in degrees per weapon with
  heat that grows per shot and decays per second; crouching multiplies spread by 0.6; sniper
  spread 0.05° while aiming (right click, FOV 30 on the client) and 4° from the hip.
- `damage.ts` (zone × falloff), `weapon-state.ts` (cooldown with carry so the SMG really fires
  10/s, semi-auto on press, magazine and reserve, reload; the shotgun loads one shell per 0.5 s
  and firing cancels it, other weapons cannot fire mid-reload), `hitboxes.ts` (head, torso and
  limbs as AABBs scaled when crouching; slab ray test), `blocks.ts` (sparse `BlockHealth`, 100 HP,
  bedrock immune; `explodeBlocks` breaks every block whose center is within radius 2 = 33 blocks
  in open rock), `grenade.ts` (gravity, bounce 0.45, ground friction, swept with the F1 AABB).
- Hitscan: nearest of the first solid voxel (DDA) and enemy hitboxes; pellets scatter inside the
  spread cone with the match RNG. Shovel: 60 melee within 2.5 blocks, else 55 to the aimed block
  within 5; right click hits the aimed block plus the ones above and below. Blocks: placing while
  holding the button every 0.2 s on the aimed face (so a drag lays a line), never inside a player,
  max 50; a block broken with the shovel gives +1 (capped at 50). Grenade: press starts the 3 s
  fuse (cooking), release throws at 16 m/s plus the player velocity, 100 damage at the center to 0
  at 4 blocks with a line-of-sight check after the blocks are removed; cooking past the fuse
  explodes in hand.
- Client: `Transport` interface and `LocalTransport`, which runs `Game` in `sim.worker.ts` at
  30 Hz. The main thread only sends one `InputFrame` per tick (its own `FixedStep`) and receives
  snapshot + events. Block events are applied to the client `World` and remeshed through the F1
  API. The camera position interpolates between the last two snapshots; the look is instant.
  Other players are team-coloured boxes with a head (`H` shows the sim hitboxes as wireframes),
  grenades are spheres, the block highlight only shows for shovel and blocks.
- HUD: HP, magazine / reserve with reload notice, blocks and grenades, slot bar (keys 1–4 and
  wheel), crosshair gap driven by the current spread, hitmarker (red on head), kill feed (6 s),
  death overlay with respawn countdown, cooking timer, sim and mesh timings.
- Crouch height 1.2 / eye 1.05 (already applied at the end of F1).
- Tests written from the spec: damage per zone and distance for every weapon (5), fire interval,
  magazine, reserve, reload and shell-by-shell shotgun reload (12), block health, +1 on dig and
  grenade radius (7 + 3 in `game.test.ts`), plus Game spawn, grounding, placement rules and
  serialisation round trip. 92/92 in `sim`.

**Measured**

| Metric                                      | Value                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Game.step`, 2 dummies, Node 22 (900 ticks) | idle 0.008 ms avg · walking 0.008 ms · SMG auto 0.006 ms avg, 0.65 ms max                          |
| `Game.step` in the sim worker (hidden tab)  | 0.17 ms avg right after start; 1.6 ms avg / 80 ms max later, inflated by background-tab throttling |
| `snapshot()`                                | 0.14 ms, 938 bytes as JSON (3 players)                                                             |
| Initial JS (gzip)                           | 25.9 kB app + 8.5 kB sim worker + 1.6 kB mesher worker + 130.0 kB three = **166 kB**               |
| CSS (gzip)                                  | 3.2 kB                                                                                             |

Combat verified end to end from the console in the hidden tab: two rifle shots sent as
`InputFrame`s through `blockfront.transport` took a dummy from 100 to 50 to dead, it respawned at
100 after 5 s, and the magazine went 8 → 6.

**Notes / pending**

- Input → visible latency is roughly one tick (33 ms) plus one interpolation window (33 ms)
  because the client renders behind the worker. Prediction is an F4 item; if it bothers on a
  visible tab, the F1 local controller can be revived as prediction earlier.
- Sim timings in the hidden automation tab spike (80 ms) because Chrome deprioritises background
  workers; the Node numbers are the reliable ones. Measure in a visible tab with
  `blockfront.transport.stepStats()`.
- No audio, viewmodel, player models, recoil, particles, damage direction or screen shake yet
  (part B). Dummies are boxes. Score is still 0 : 0 (CTF is F3).
- Blocks broken by bullets or grenades give nothing back; only the shovel does.

**Keys** (click the canvas to lock the pointer, `Esc` releases it): `WASD` move, `Space` jump,
`Ctrl` / `C` crouch, `Shift` sprint, `R` reload, `1`–`4` or wheel to switch slot, left click
fire / dig / place / cook grenade (release to throw), right click aim (sniper) / shovel column,
`F` free camera, `H` hitboxes.

## F2 part B — Assets and game feel (2026-10-08) — F2 closed

**Done**

- **Assets, all CC0 from Kenney** (license re-checked on each pack page and in each pack's
  `License.txt`; listed in `assets/CREDITS.md`): Blocky Characters 2.0 (`character-a`, with its
  idle / walk / sprint / die clips), Blaster Kit 2.1 (`blaster-g` rifle, `blaster-n` SMG,
  `blaster-q` shotgun, `blaster-f` sniper, `grenade-a`), Impact Sounds 1.0 and Sci-Fi Sounds 1.0.
  Quaternius Ultimate Guns is CC0 too but only ships through a Google Drive folder, so the Blaster
  Kit was used for a reproducible download and a matching blocky look.
- **Pipeline**: `gltf-transform optimize --compress quantize --texture-compress webp
--texture-size 512|256 --simplify false` (the character keeps `--join false --flatten false`
  so the per-part animations survive); audio re-encoded with ffmpeg to mono AAC 22 kHz at 40 kb/s
  (`.m4a`, which Safari also decodes; Homebrew's ffmpeg has no libvorbis). Served from
  `apps/client/public/{models,audio}` and loaded once by `AssetStore` (GLTFLoader + AudioLoader).
- **Player models**: other players are the Kenney character tinted per team (material colour
  multiplied), scaled 1.8 / 2.7, squashed when crouching, playing idle / walk / sprint from the
  snapshot speed and `die` (clamped) on death, with the primary weapon cloned into the
  `arm-right` node. A team-coloured box stands in until the assets arrive.
- **Viewmodel**: the held tool renders in a second scene on top of the world (`clearDepth`
  between passes): Blaster Kit models for the four weapons and the grenade, a procedural shovel
  and a team-coloured cube for blocks. Bobbing with movement, kick back and up per shot
  (per-weapon amount), centred while aiming.
- **Game feel**: camera recoil (pitch kick per weapon, exponential recovery, never written to the
  input), hitmarker with sound (glass tick, heavier on headshots), block particles (instanced
  cubes coloured from the palette: 14 on break, 4 on damage), light screen shake on explosions
  within 16 blocks scaled by distance, damage direction indicator (red arc on the HUD rotated
  toward the attacker, 1.2 s), positional audio for other players' shots, shovel swings, block
  hits / breaks / placements, grenade throws, explosions, deaths and footsteps (`PositionalAudio`,
  inverse rolloff), 2D audio for the local player (shots, hurt, death, reload on the reloading
  edge, own footsteps every 2.1 blocks on the ground). The AudioContext resumes on pointer lock.
- Dummies moved to the flat plateau past the towers so both stand on open ground.

**Measured**

| Metric                                    | Value                                                                         | Budget   |
| ----------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Models (6 glTF, quantized + WebP)         | 163 KB (character 53 KB, weapons 18–30 KB, grenade 10 KB)                     | —        |
| Audio (22 clips, mono AAC 22 kHz)         | 89 KB                                                                         | —        |
| Initial JS (gzip)                         | 30.3 kB app + 8.5 kB sim worker + 1.6 kB mesher + 159.5 kB three = **200 kB** | < 600 kB |
| First match total (JS + CSS + assets)     | ≈ **0.5 MB**                                                                  | < 5 MB   |
| Frame CPU with viewmodel pass + particles | 0.3 ms (300 forced frames, hidden tab)                                        | —        |
| `Game.step` in the worker (hidden tab)    | 0.02 ms avg / 0.10 ms max over the last 3 s                                   | —        |

Three's chunk grew from 131 to 160 kB gzip because GLTFLoader, the animation system and audio
are now bundled.

**F2 done criteria (PLAN.md §5)**

| Criterion                                                      | Status                                                                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two static dummies take the right damage per zone and distance | **Met**: `damage.test.ts` covers every weapon, zone and falloff point; the dummies are hit through the same hitscan (verified from the console: rifle 100 → 50 → dead → respawn).                         |
| Game feel of §3 complete                                       | **Met**: shot and impact sounds, camera and weapon recoil, hitmarker with sound, block particles, grenade screen shake, damage direction indicator, kill feed. The optional damage numbers were left out. |

**Notes / pending**

- Not measured in a visible tab: fps, audio mix levels and recoil feel. Tune the constants in
  `camera-effects.ts`, `viewmodel.ts` and the volumes in `game-renderer.ts` by ear.
- Grenade bounces have no sound (the sim emits no bounce event); the `grenade-bounce` clip is
  shipped for when it does.
- The held weapon on other players is placed by hand on the `arm-right` pivot; it sits at hip
  height. The dummies use the rifle until a weapon choice exists per player.
- Block particles ignore collisions (they fall through the ground and fade in 0.9 s).

**Verified in the hidden tab**: all 6 models and 22 sounds load, the AudioContext is running,
a shovel dig broke a block (quads 26 822 → 26 827, blocks stayed capped at 50) and no console
errors appeared while shots, particles and sounds fired.

**Adjustments after the first playtest (2026-10-08)**

- Block particles rotated around their world position as if it were a unit axis, so every shot
  or shovel hit filled the view with giant palette-coloured cubes. Each particle now spins around
  its own unit axis.
- The Blaster Kit rifle looked too sci-fi: the rifle is now a procedural low-poly model
  (`rifle-model.ts`, wood stock and grip, metal receiver, barrel and magazine) used both as the
  viewmodel and in other players' hands; `rifle.glb` was dropped. SMG, shotgun and sniper keep
  the blasters for now.
- Muzzle flash: additive radial sprite at the muzzle for 50 ms, on the viewmodel and at other
  players' barrels (`muzzle-flash.ts`).
- The rifle shot is a synthesized gunshot (noise crack + 70 Hz thump over Kenney's
  `impactPlate_heavy`) instead of a laser.
- An empty magazine reloads by itself when the reserve allows; the spec test was updated.
- Health bar above other players (camera-facing sprites, only shown below 100 HP, green to red).
- Sounds reworked to read as firearms (the reference is a conventional voxel shooter, not
  lasers): every shot, the reload (two mechanical clacks), the explosion and the grenade throw
  are synthesized with ffmpeg from filtered noise and sine thumps layered over Kenney impact
  clips. No audio from any other game. The SMG, shotgun and sniper are procedural models too,
  so the three blaster glTFs were dropped; only `character.glb` and `grenade.glb` remain.

## F2.5 part A — Visual world (2026-10-08) — done

Spec: `docs/f2-5-polish.md` §1. Tests written from that section before the implementation.

**Done**

- **Block registry** (`packages/sim/src/world/blocks.ts`, noa-style): `BlockDef` with per-face
  layers, `render` kind (cube / cross / liquid / none), solid, opaque, liquid and tint, compiled
  into `FACE_LAYER` (`Uint8Array(256 * 6)`) and `FLAGS` (`Uint8Array(256)`, bits solid / opaque /
  liquid / cross / cube). Grass is `grass_top` / `grass_side` / `dirt`, logs are rings and bark.
  New blocks: log, leaves (opaque), tall grass, red and yellow flowers (cross), water (liquid, not
  solid, lets light through). Player blocks are the plain layer times a palette tint. The old
  `palette.ts` is gone; `PALETTE` (particle colours) now comes from the registry.
- **Baked textures**: 18 layers of 16×16 RGBA generated in code (`bake-textures.ts`: grain,
  veins, rings, bark grooves, mottled leaves with painted holes, sand, gravel, grass blades, a
  green fringe on `grass_side`, a one-texel darkened border, alpha cut-outs for the plants) and
  uploaded as a `DataArrayTexture` in sRGB with mipmaps and `NearestMipmapLinear`. **Deviation
  from the spec:** the bake runs on the main thread, not in a worker: 4.6 k texels take 3–6 ms,
  less than the message round trip would cost, and the world cannot draw before it anyway.
- **Mesher**: merge key is now (block, AO) with the layer taken from the face, so a grass slab is
  still 6 quads; faces are visible when the neighbour is not opaque, water gets its own pass (no
  water-water faces, tops at 8/9) and cross blocks go to a `decor` mesh with explicit UVs outside
  the greedy pass. Per-vertex attributes: position, normal, layer, blockId, AO.
- **Shaders** (`voxel-material.ts`, GLSL3): `sampler2DArray` with the UV derived from position
  and normal (one repeat per block, no UV attribute), per-voxel hash tint kept, tint table from
  the registry, `sampler3D` skylight sampled at `worldPos + normal * 0.5` with linear filtering,
  hemisphere + sun scaled by the skylight, spherical fog (`length(mvPosition)`), ACES tone mapping
  and sRGB output. Decor shader: alpha discard, double sided, wind sway on the top vertices.
  Liquid: same shader with opacity 0.72, transparent, no depth write (a stand-in until part B).
- **Trees and plants** (`generator.ts`): jittered 7×7 grid, integer `hash3` (no `Math.random`),
  biome value noise for density, never within the base radius + 3 nor in the ±6 corridor between
  the flags, mirrored like everything else. Trunks of 4–6 logs, three canopy shapes (sphere r2,
  squashed sphere r3, cube without corners) trimmed at the rim by hash. Tall grass 7 %, flowers
  2 % on open grass with two blocks of air above. The sim deletes a plant when the block under it
  breaks (`clearDecorAbove`), and plants never block movement, bullets or placing.
- **Skylight** (`skylight.ts`, Seeds of Andromeda): sun columns at 15 straight down, BFS with −1
  per step, removal BFS on placed blocks and re-seeding on removed ones; `updateSkylight` keeps
  the array identical to a fresh `computeSkylight` (tested). The first fill runs in
  `light.worker.ts` from the seed; edits re-flood on the main thread and the `Data3DTexture`
  (R8, 128×64×192, 1.5 MB) re-uploads with an 80 ms throttle. `skyIntensity` uniform left for a
  day/night cycle.
- **Sky**: gradient dome (zenith `#3f7fd9` → horizon `#b9d7f2`) with a sun disc, following the
  camera; the fog uses the horizon colour. Spherical fog also patched into the standard materials
  of players, held weapons, grenades and particles through `onBeforeCompile`.
- Tests: registry tables (10), skylight (10), vegetation (6), mesher with the registry (5), Game
  vegetation rules (2). 125/125 in `sim`.

**Measured**

| Metric                                           | Value                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Map quads (seed 1, with trees, plants and water) | 48 675 opaque quads in Node; 51 658 total in the client incl. liquid and decor                |
| Mesher per chunk, Node 22 warm                   | 2.83 ms avg / 4.62 ms max (38 of 48 chunks non-empty)                                         |
| Mesher per chunk, Chrome worker, hidden tab      | cold 17 ms avg / 51 ms max; warm 6.7 ms avg / 11.7 ms max (throttled tab)                     |
| Skylight, first fill of the whole map            | 85 ms in Node; 294–324 ms in the worker of the hidden tab                                     |
| Skylight per edit (main thread)                  | 0.05 ms avg / 0.3 ms max                                                                      |
| Texture bake (18 layers)                         | 3.2–6.3 ms                                                                                    |
| Initial JS (gzip)                                | 36.8 kB app + 9.9 kB sim + 2.8 kB mesher + 4.2 kB light workers + 158.8 kB three = **213 kB** |

The spec estimated 20–60 ms [I] for the first skylight fill; the real figure is 85 ms in Node and
three to four times that in a throttled background tab. It runs in a worker, so nothing blocks,
but the world is unlit for that long after load (shadows appear a moment after the terrain).

**Starting values I changed, and why**

- Tone mapping: ACES Filmic. Neutral kept the sky too flat; AgX was never tried (the spec warns
  it desaturates). Exposure 1.0.
- Sky colours brighter than the previous flat `#9cc7ef` so the horizon survives the tone curve.
- Tint strength lowered from 0.14 to 0.12: with textures the per-voxel hash was too noisy.
- Ambient floor under full shadow is 6 %, so tunnels read as dark but not black.

**Pending**

- Water is rendered with the cube shader at 0.72 alpha, no waves or Fresnel, and the player walks
  on the river bed: part B.
- The mesher budget (< 5 ms) holds in Node but not in the throttled hidden tab; confirm in a
  visible tab with `blockfront.pool.stats()` after a second `rebuildAll()`.
- Clouds (optional in the spec) were skipped.

**Adjustments after Jhon's first look (2026-10-08)**

- Shadows were near black up close: the shade floor went from 6 % to 30 % of full light, and
  the decor shader got a 15 % lift so grass and flowers read in the shade.
- Water showed the block grid: the water layer skips the darkened texel border, uses only
  low-frequency ripple noise, and the liquid material has no per-voxel tint and almost no AO
  (opacity 0.62).
- Underwater: when the eye is inside a water block the fog turns blue (`#1d4fb0`, 1–18 blocks)
  and the HUD draws a blue tint with a vignette. Part B replaces this with the real water shader.
- The world came up black after a reload once, and later looked uniformly dim on Jhon's
  machine while it was lit in my tab: the skylight texture was reaching the GPU as zeros there.
  Rather than update the `Data3DTexture` in place (`texSubImage3D`), `SkylightTexture` now
  publishes a brand-new texture object on the first fill and after every edit (throttled to
  120 ms, 1.5 MB upload each time) and the three voxel materials rebind their `skylight`
  uniform. It also falls back to the main thread if the worker errors or takes more than 3 s,
  and logs `skylight ready: <ms>, sample 15/15` on the console.
- Brightness settled after two rounds: exposure 0.92, sun 0.95, sky ambient 0.6, ground
  ambient 0.45, shade floor 30 %, AO 0.5 (the brighter values tried while the texture was
  broken washed the scene out once the light worked); the texel seam between blocks went from
  18 % to 9 % darker.

## F2.5 part B — Water and swimming (2026-10-08) — done

Spec: `docs/f2-5-polish.md` §2 (and the air of §3.2, which lives in the sim).

**Done**

- **Static water**: the generator's river is the only source; nothing flows. One-step fill in
  the sim: a block broken at or below the sea level with water beside or above it turns into
  water (`fillWithWater`, after shovel breaks and explosions), and the new water never triggers
  further fills. Water is not solid: bullets and the DDA pass through it and blocks can replace
  it.
- **Swimming** (`physics/water.ts`, `player-controller.ts`): submerged ratio from the box's
  centre column with the 8/9 surface, `inWater` above 10 %, `eyeInWater` from the eye voxel.
  Drag `0.8^(dt·20)` scaled by `1 − (1 − ratio)²`, gravity 2.8 (a tenth of land), jump adds
  lift while in water so holding it bobs at the surface, crouch sinks faster, 2.2 / 2.0 blocks/s
  at the surface / submerged with no sprint, and a 6 blocks/s hop out when pushing against a
  bank with the box free 0.6 higher. The shovel swings at half speed and the sniper cannot aim
  in water.
- **Air** (`physics/air.ts`): 15 s = 10 bubbles of 1.5 s, 1 s of grace at zero, then 10 HP/s as
  `hit` / `death` events with the `drowning` source; refills in 2 s out of the water. The
  snapshot carries `air`, `inWater` and `eyeInWater` for the HUD (part C draws the bubbles).
- **Render**: the liquid pass now uses `water-material.ts`: two scrolling value-noise layers
  bend the normal, Fresnel toward the sky colour, sun glint, skylight darkening, base `#3F76E4`,
  alpha 0.66 (+0.2 at grazing angles), double sided, no depth write, drawn after the opaque
  pass. Under water the fog is `#050533` mixed 45 % with the water colour, starts at 3 blocks
  and clears to 20 over 2.5 s with an ease-in; the HUD keeps the blue tint and vignette.
- Tests from the spec: submerged ratio (surface, fully under, chunk border), sinking without
  input, rising and bobbing with jump, swim speed without sprint, climbing a one-block bank,
  crouch sinking, eye detection at the 8/9 surface, air timing / grace / damage / refill, the
  one-step fill, no fill above the sea level, drowning through `Game.step`. 143/143 in `sim`.

**Pending**

- The sand ford stays above the water, so you can still cross without swimming; that is by
  design (the generator's ford), not a water bug.
- No swim pose or splash sounds yet.

## F2.5 part C — Minecraft-style HUD (2026-10-08) — done

Spec: `docs/f2-5-polish.md` §3.

**Done**

- **Hotbar of five slots** in Counter-Strike order: 1 primary, 2 pistol (always present, §4.4
  numbers: 30 / 80 / 20, 0.18 s, 12 / 48, 1.4 s reload, 100 % to 15 blocks → 70 % at 40), 3
  shovel, 4 blocks, 5 grenade. Wheel cycles, `Q` returns to the previous slot, `G` throws a
  grenade from any slot without switching (one per press). Square slots with pixel-art SVG icons,
  a thick frame on the selected one, the count bottom-right (hidden when it is 1) and the item
  name over the bar for 2 s with a fade in the last 0.5 s (ES · EN). Ammo stays bottom-right.
- **Block colour**: one block slot with eight colours (`BUILD_COLORS`: both team blues and reds
  plus yellow, green, cyan and violet from the ramp), team colour by default. `4` again on the
  block slot or the wheel while holding `4` cycles; the middle click copies the aimed block's
  colour. The sim validates the colour and places it; the hand cube and the slot icon follow.
- **Hearts**: 10 hearts of 10 HP drawn as a 9×9 pixel-art SVG symbol (own design), half hearts
  at 5 HP, value rounded up to a multiple of 5, shaking at ≤ 20 HP. On damage: white glow on the
  bar for 1 s, the hearts just lost shown pale for 0.6 s, a red vignette, and a small camera roll
  away from the attacker (`CameraEffects.hurtFrom`). No invulnerability frames. The HP number is
  off by default (`hudState.showHpNumber`).
- **Air bubbles**: 10 bubbles above the hearts, visible only with the eye under water or while
  the air is not full; each lost bubble pops with a rising pitch; empty bubbles shake while
  drowning. The air itself comes from the sim (part B).
- Tests from the spec (`hotbar.test.ts`): slot order and tools, quick throw with `G` that keeps
  the slot and does not repeat while held, colour selection restricted to the eight allowed, team
  colour by default; pistol numbers in `weapon-state.test.ts` and `damage.test.ts`. 148/148.

**Pending**

- No sound asset for the bubble pop; the glass tick is reused with a rising rate.
- The hotbar icons are flat SVGs, not renders of the 3D models.

## F2.5 part D — ADS, sights and new weapons (2026-10-08) — done

Spec: `docs/f2-5-polish.md` §4.

**Done**

- **ADS in the sim** (`combat/ads.ts`): per-weapon time and zoom from the table (rifle 260 ms
  1.4×, carbine 220 ms 1.25×, SMG 170 ms 1.15×, shotgun 150 ms 1.1×, pistol 140 ms 1.15×, sniper
  350 ms 4× with scope). The transition is a linear 0..1 held per player; the spread uses the ADS
  minimum only from 90 % (no quickscope), movement is 75 % while aiming and 50 % with the scope,
  the carbine walks at 95 % and the pistol at 100 %. Snapshots carry `ads`.
- **New weapons** (`weapons.ts`, exact §4.4 numbers): carbine 28 / 70 / 20 at 0.12 s automatic,
  30 / 90, 2.2 s, 100 % to 35 → 75 % at 70; pistol 30 / 80 / 20 at 0.18 s, 12 / 48, 1.4 s,
  100 % to 15 → 70 % at 40. Cooldowns now carry their remainder across shots so the SMG fires
  exactly 10/s and the carbine 4 shots in 0.36 s.
- **Sights** (`weapon-models.ts`): procedural, one geometry group per gun with the sight centre
  exactly on `SIGHT[weapon]`: peep ring and post with an emissive dot (rifle), red dot frame with
  12 % glass and an emissive `#ff2a2a` dot (carbine), holographic hood with a 64² nearest
  `CanvasTexture` reticle (SMG), bead (shotgun), two-post rear and front post (pistol), tube,
  bells, mounts, turrets and blue-black lens (sniper).
- **Viewmodel** gets its own camera: vertical FOV 70 (60 in ADS), near 0.01, aspect copied from
  the world camera. ADS pose is `−sight + (0, 0, −0.3)` blended with smoothstep; bob drops to
  15 % while aiming. World zoom by tangents (`fovAds = 2·atan(tan(fov/2)/zoom)`), mouse
  sensitivity scaled by `tan(fovAds/2) / tan(fovHip/2)` (user adjust 1.0), crosshair fades with
  `1 − t`.
- **Hybrid scope**: from 80 % of the transition the view fades to black for 60 ms, the viewmodel
  hides and a 2D overlay (circular black vignette + thin reticle + red dot) takes over. Lens
  glint: an additive sprite at the eye of an enemy sniper who is scoped and pointing within 12°
  of me, scaled by distance, at most one per 120 ms.
- **Recoil per weapon** (`camera-effects.ts`, §4.5): vertical kick and ±horizontal random per
  shot, split into a recovering part (damper, half-life 0.12 s, 0.08 s for the pistol) and a
  permanent part written to the aim. Carbine: 0.5° for the first five shots, then 0.7° with a
  sideways drift whose sign is random per burst (bursts reset after 0.3 s). Shotgun and sniper
  have "—" in the table; they recover 50 % here so a single shot does not throw the aim off the
  screen.
- Tests from the spec: ADS table, progress in and out, the 90 % threshold, movement
  multipliers; carbine and pistol numbers and cadence. 154/154 in `sim`.

**Pending**

- No weapon selection yet: the primary is the rifle until the F3 loadout menu; switch it with
  `primary` in `matchConfig` to try the others.
- The glint uses the muzzle flash sprite; a bluer texture would read better.

## F2.5 part E — First person and shot feedback (2026-10-08) — F2.5 closed

Spec: `docs/f2-5-polish.md` §5 and §6.

**Done — §5 first person**

- `packages/sim/src/physics/spring.ts`: damper, exact critically damped spring and an exact
  underdamped spring (Holden), with tests for step-size independence, no overshoot and the
  single bounce at ζ 0.5 / ω 25.
- `first-person.ts` (`WeaponMotion`): recoil impulses per shot on four underdamped springs
  (back 0.03–0.08, pitch 3–8°, yaw ±1°, roll ±2°, counter-push on long bursts), mouse sway
  (0.02°/px clamped ±4°, half-life 0.07 s, 0.015 of shift, 30 % in ADS), Lissajous 1:2 bob (A
  0.012, B 0.008, roll 1.5°, 1.9 steps/s walking and 2.6 sprinting, ×1.8 sprint, ×0.15 in ADS,
  proportional to speed), sprint pose (yaw 30°, roll −12°, drop 0.05), lateral lean (−0.8°/m/s,
  max 3.5°), landing impulse from the fall speed.
- Reload timeline from the sim's `reloading` flag and the weapon's reload time: 0–0.2 lower and
  roll 25°, 0.2–0.45 the `magazine` part falls, 0.45–0.7 the new one rises, 0.7–0.8 slap
  impulse, 0.8–1 back; bolt pull at 0.85–0.95 when the magazine was empty; shotgun tilts and
  pushes once per shell. Weapon switch: holster 0.2 s (down 0.3, pitch −40°), draw 0.45 s with
  easeOutBack. Shovel swing with the Minecraft curve `f = sin(√p·π)` over 350 ms, hit stop of
  45 ms and a 0.5° camera jolt when the hit lands; block placing is the same swing at 60 % in
  200 ms. The shovel was remodelled (wooden handle, steel neck, bevelled blade).
- Block arms: sleeve 0.10×0.10×0.45 with a team-coloured cuff and a 0.10³ skin hand, shoulders
  fixed in camera space at (±0.28, −0.38, +0.05), hands riding on each gun's grip and fore grip
  (`GRIPS`), the box arm placed and scaled with a two-point IK (`BlockArm.aim`), so the arms
  follow recoil, reload and ADS for free. Pistol: both arms converge in a V; shovel and blocks:
  right arm only, Minecraft pose (block low right, turned 45°).
- Sim: the shovel hit lands 0.14 s into a 0.35 s swing (the PLAN table said 0.25 s per swing;
  the polish doc wins), guns cannot fire for 0.15 s after sprinting and a held trigger counts as
  a press once ready, `blockDamaged` events carry the face normal.

**Done — §6 feedback**

- Cracks: ten crack stages baked as extra layers of the block array texture and drawn as an
  instanced shell over damaged blocks (GLSL3 shader, stage from the HP). Cleared when the block
  changes.
- Impact marks: ring buffer of 256 instanced 0.12 quads with polygon offset (−1, −4), one draw
  call, hidden when their block changes. The sim sends the face, not the exact point, so the mark
  lands somewhere on that face.
- Tracers: additive stretched boxes (2.5 m, 80 ms, 60 m/s) on every shot, one in three for the
  automatics. Shell casings: 48 instanced brass boxes ejected right (1.5–2.5 m/s) and up
  (1–2 m/s), stopped by the voxel floor only, gone after 1.3 s. Muzzle light: one permanent
  `PointLight` in the world and one in the viewmodel scene whose intensity flashes and decays
  (lights are never added or removed, so no shader recompiles). The voxel shader lights itself,
  so the world light only reaches players and props.
- Sound by distance: positional shots get a low-pass from 20 kHz near to 1.5 kHz past 100
  blocks and arrive late at 343 m/s; panning is the panner's equal-power default. No far "tail"
  samples exist yet, so there is no near/far crossfade.
- Tests: springs (4), swing timing and face normals (2), sprint readiness (1). 161/161 in `sim`.

**Measured**

| Metric            | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Initial JS (gzip) | 48.3 kB app + 11.7 kB sim + 2.7 kB mesher + 4.2 kB light workers + 159.4 kB three = **226 kB** |
| `sim` tests       | 161 in 20 files                                                                                |

**Pending**

- The right arm is hidden behind the block cube in the block pose; a better grip point is a
  matter of taste in a visible tab.
- Scoped sensitivity and ADS poses need a feel pass in a visible tab (constants in
  `viewmodel.ts`, `first-person.ts` and `camera-effects.ts`).
- The bubble pop, splash and swim sounds are still missing.

## F2.6 part A — Hip vs ADS, fall damage, sneaking and the charged grenade (2026-10-09) — done

Spec: `docs/f2-6-feel.md` §2, §4 and §5. Tests written from those sections first.

**Done — §2 hip against sights**

- `combat/spread.ts` holds the new table (hip base / max / per shot, ADS base / max / per
  shot, recoil factor in ADS, zoom, ADS time, movement) and replaces the spread fields of
  `weapons.ts` and the F2.5 table of `ads.ts`, which now reads times, zoom and movement from it.
- `computeSpread` applies the modifiers: moving ×1.5 hip / ×1.25 ADS (+1.5° for the sniper),
  airborne +3° / +1.5°, crouched ×0.8, bloom in shots with a linear recovery of 6–10 °/s, and
  the interpolation from hip to ADS during the transition that only snaps to the ADS value from
  90 % (no quickscope). The sim evaluates it per shot from the shooter's real state (speed,
  ground, water, crouch) and the snapshot `spread` drives the crosshair.
- Shot distribution: `scatterRadius(u, blend)` is uniform over the disk from the hip (`√u`,
  mean radius 2/3) and centred in ADS (`u`, mean 1/2), interpolated by the same blend. A
  20 000-sample test with a fixed seed checks both means.
- Client: zoom and FOV from the table with easeOutCubic, recoil scaled by the ADS factor, bob
  at 20 % and sway at 30 % in ADS, a `radial-gradient` vignette from 0 to 0.3 with the
  transition, a 70 ms rustle when entering and leaving ADS, and for the scoped sniper a
  Lissajous sway of ±0.3° written into the aim with `Shift` holding the breath (steady 3 s, then
  double shake for 2 s).

**Done — §5 fall damage**

- `physics/fall.ts`: `5 × floor(fall − 3)` HP (4 blocks = 5, 7 = 20, 10 = 35, 15 = 60, death
  from ~23). The controller tracks the peak height from the moment the feet leave the ground
  and reports `landedFrom` on the landing tick; touching water resets the peak. Landings above
  4 blocks halve the horizontal speed.
- `Game` emits `landed` (height ≥ 1) and applies the damage as a `hit` / `death` with the `fall`
  source; if an enemy hurt the player in the last 5 s the fall is credited to them (kill feed
  "X [Caída] Y").
- Sneaking: while crouched and on the ground each horizontal axis is trimmed in 0.05 steps
  until the box, lowered by half a block, still rests on something, so the box can hang over an
  edge but never leaves the block (Minecraft rule). Not crouching walks off as before.
- Client: camera dip and tilt scaled by the height, thud from 4 blocks and crunch from 8, also
  positional for others.

**Done — §4 charged grenade**

- Press: fuse starts (3 s, a tick every 0.5 s rising in pitch) and the power charges for
  0.8 s with the bow curve `p = (f² + 2f) / 3`, `v = lerp(9, 24, p)`; after that it only cooks
  and explodes in hand at 3 s as before. Release: `dir · v + player velocity` with +8° of pitch;
  right click while holding lobs it underhand at 7 m/s. `G` throws at the speed of a 0.4 s
  charge (about the old 16 m/s). The snapshot carries `charge`.
- Predicted arc (`grenade-arc.ts`): `predictArc` runs the sim's own `stepGrenade` at the fixed
  tick (up to the fuse or 180 steps) and the client draws it as 40 fading dots plus a ring of
  the damage radius at the end, white on the ground and red if it would go off in the air;
  cooking shortens it on its own. Only the thrower sees it.
- Tests: power at 0, 0.4 and 0.8 s and beyond, velocity inheritance and the 8° tilt, the
  underhand speed, the arc equal to the stepped trajectory point by point, air vs ground.

**Measured**

| Metric      | Value                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| `sim` tests | 186 in 23 files                                                              |
| Audio       | 27 clips, 113 KB (five new synthesized: aim in/out, thud, crunch, fuse tick) |

**Pending**

- The sniper breath has no sound and no HUD cue.
- The sneaking test for "stepping down half a block" cannot exist on a whole-block grid; the
  rule allows drops up to 0.5 and refuses a drop of 1.
- No grenade power bar on the HUD: the arc is the gauge.

## F2.6 part B — Minecraft-style hand items and real gun audio (2026-10-09) — done

Spec: `docs/f2-6-feel.md` §1 and §3. Plus the playtest fixes at the top of the day.

**Playtest fixes (before part B)**

- Hip spread toned down about 35 % against the §2 table (rifle 1.6°, carbine 1.4°, SMG 0.9°,
  pistol 0.8°, shotgun 4.5°, sniper 4°), moving ×1.3 instead of ×1.5 and +2° in the air
  instead of +3°. ADS values untouched. Spread tests updated to the new numbers.
- Knockback: every hit shoves the victim along the shot (1.5 to 6 m/s by damage, 1.2 m/s up)
  and blasts push radially up to 9 m/s, so shots can throw people off ledges (test added).
- `P` cycles the primary weapon (rifle → carbine → SMG → shotgun → sniper) through a new
  `primary` field of the input, until the F3 loadout menu.

**§1 Hand-held sprites**

- `sprite-geometry.ts`: pure extrusion of a 16×16 sprite into a front, a back and 1-texel side
  faces only where an opaque pixel touches a transparent one, 1/16 thick, with darkened vertex
  colours on the sides. Tests (client vitest, node): one pixel → 4 sides, a 3-px line → 8, a full
  sprite → 64, no faces between neighbours, darkened colours, and the art rules.
- `SpriteItem`: `CanvasTexture` with nearest filter and alpha test for the faces, the extruded
  sides as a `BufferGeometry`. The shovel and the grenade are drawn in code as 16-row strings
  (`SHOVEL_ART`, `GRENADE_ART`): diagonal wooden handle with a knob, 1-px neck, teardrop blade
  with outline and highlight; a dark green grenade with a steel spoon and pin.
- Held with Minecraft's `handheld.json` first-person transform (rotation [0, −90, 25], translation
  [1.13, 3.2, 1.13] px, scale 0.68) at the hand anchor (+0.56, −0.52, −0.72), no arms. Swing with
  Minecraft's renderer values (rotY 45 + sin(√s·π)·−20, rotZ sin(√s·π)·−20, rotX sin(s·π)·−80);
  the equip dip reuses the holster/draw animation. Guns keep their 3D models (decision E3).

**§3 Real gun audio**

- `scripts/audio/build.mjs` + `sources.mjs`: downloads only the listed files from the GitHub
  mirror of the Free Firearm Sound Library (CC0) and the four CC0 Freesound previews, decodes to
  48 kHz mono with a 35 Hz high-pass, finds each shot's transient, cuts the takes with 2 ms of
  pre-roll, splits body (250 ms) and tail (0.2–1.5 s), normalises to −1 dBFS and encodes Opus in
  WebM (96 kbps own bodies, 64 the rest) plus AAC M4A. Output: 77 clips, **387 KB Opus / 512 KB
  AAC**, the client downloads one format; manifest in `gun-manifest.json`.
- `GunAudio` (Web Audio, replaces `PositionalAudio` for the guns): one `AudioBufferSourceNode`
  per shot, a `PannerNode` + low-pass per entity (HRTF for the four nearest, equal-power for the
  rest), voice limits 8 own / 3 per enemy / 40 global stealing the quietest, −60 dB cut-off, no
  same clip twice within 25 ms on an entity; buses own / enemies / impacts / world / UI at −6 dB,
  master compressor (−12 dB, 4:1, 3 ms, 150 ms) then limiter (−1 dB, 20:1); ducking of enemies
  and world by 3.5 dB on own shots (5 ms in, ~200 ms out); one shared `ConvolverNode` with the
  garage impulse (0.8 s, 15 ms pre-delay) fed by per-bus sends scaled by the listener's
  enclosure (12 short DDA rays, re-evaluated every 250 ms); round-robin takes without repeats,
  pitch ±3–4 %, volume ±1.2 dB; one tail per weapon and entity, the previous fading in 30 ms.
- Own shot = behind-the-shooter body + synthetic 55–60 Hz thump + tail, staggered 4–8 ms.
  Enemy shot = near / mid / far body by distance + tail, low-passed and delayed by distance.
  Pump 300 ms after a shotgun shot and bolt 600 ms after a sniper shot; slide/clip clips on
  reload. Hitmarker is a 3 kHz click, headshot adds a 4.2 kHz one. Enemy bullets passing within
  2 blocks of the eye play the flyby. Casings land with the Freesound clip 0.35–0.6 s later.
  Grenade blast uses the unfa recording plus a 45 Hz thump. The old synthesized shot, reload and
  explosion clips were removed.

**Measured**

| Metric                 | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Audio on disk          | guns 387 KB (webm) + 512 KB (m4a) + 113 KB other clips |
| Downloaded by a client | about 500 KB (one gun format + the small clips)        |
| Tests                  | 187 in `sim`, 7 in the client                          |

**Pending / to tune by ear**

- Mix levels of the layers, the thump and the ducking amount (constants in `gun-audio.ts`).
- The sprite shovel size and anchor; the arm was removed on purpose for sprite items.
- The enemy "far" layer exists only for the carbine and the sniper; the other guns fall back to
  the mid take beyond 60 blocks.

**Follow-up after the second playtest (2026-10-09)**

- Levels: gun master at −7 dB, Three audio master at 0.6, own footsteps at 0.08 (were 0.3) every
  2.8 blocks (were 2.1), others' at 0.35.
- The `P` key is gone. The unlocked overlay now has a loadout panel with the five primaries
  (one at a time); the choice applies immediately for now.
- **Agreed for F3 (bots and maps)**: a suicide key that must be held to confirm, and the
  primary can only be changed after dying (the panel stays open on the death screen and the new
  weapon arrives with the respawn).
- Reload feedback (2026-10-14): the crosshair is replaced by a 22 px ring that fills clockwise
  with the reload, a spinning reload glyph and the seconds left inside. The sim now reports
  `reloadLeft` / `reloadTotal` for the gun in hand (`reloadRemaining` counts every shotgun shell
  still to load). The ammo box label pulses instead of sitting muted. 4 new sim tests (191).
- Grenade and stock (2026-10-14): damage 150 at the centre fading to 0 at 4.5 blocks (lethal
  inside 1.5, 50 at 3); cooking through the fuse kills the holder; the viewmodel winds the
  grenade back and up with the charge. Slots 4 and 5 lock at zero stock (crossed out in the
  hotbar, wheel skips them) and the sim hands back to the primary; weapons never lock. Trigger on
  an empty magazine emits `dryfire`: synthesized hammer click, counter flashes red, and with no
  reserve left the ammo box says so. 5 new sim tests (196).
- Explosion visuals (2026-10-14): `ExplosionFx` draws a white flash that balloons for 160 ms,
  14 additive fire puffs that fly out and cool from yellow to red over ~0.5 s, 9 smoke puffs that
  rise for ~1.4 s, and an orange point light (90, decay 11/s). Within 12 blocks the HUD adds a
  short warm screen flash scaled by distance. Textures are canvas gradients, no assets.
- Language (2026-10-14): one language at a time. `lib/i18n/strings.ts` holds the `en` and `es`
  dictionaries and `detectLocale` (first browser language with a dictionary, English otherwise);
  `locale.svelte.ts` keeps the current locale as reactive state and exposes `t()`, so the start
  panel's selector can switch it live later. The renderer now emits item keys and the HUD
  translates them. 4 client tests (11).
