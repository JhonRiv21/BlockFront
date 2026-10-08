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
