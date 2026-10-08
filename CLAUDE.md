# Blockfront

Voxel team shooter for the browser (CTF vs bots, then multiplayer rooms). Portfolio project.

**Source of truth: [`PLAN.md`](PLAN.md)** — scope, architecture, phases, done criteria and rules.
Progress log: `docs/progress.md` (update at the end of every phase with measured numbers).

Non-negotiables (details in PLAN.md §11):

- Code, file names and comments in English; user-facing copy in ES + EN.
- `packages/sim` is pure TypeScript: no DOM, Three.js, Svelte or Workers imports.
- No game logic in `.svelte` components.
- Never `git commit` or `git push`; leave the tree ready.
- CC0 assets only, listed in `assets/CREDITS.md`.
