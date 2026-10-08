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
