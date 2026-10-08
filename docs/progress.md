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
