<script lang="ts">
  import { frameStats } from '../render/frame-stats.svelte.ts'
</script>

<div class="pointer-events-none fixed inset-0 font-hud text-hud select-none">
  <div
    class="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-hud-panel px-4 py-1.5 text-lg font-semibold tabular-nums"
  >
    <span class="text-team-blue">0</span>
    <span class="text-hud-muted">:</span>
    <span class="text-team-red">0</span>
  </div>

  <div
    class="absolute top-4 right-4 rounded-md bg-hud-panel px-2 py-1 text-xs text-hud-muted tabular-nums"
  >
    {frameStats.fps} fps · t{frameStats.tick}
  </div>

  <div class="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2">
    <span class="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-hud/90"></span>
    <span class="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-hud/90"></span>
  </div>

  <div class="absolute bottom-6 left-6 flex items-baseline gap-2 rounded-md bg-hud-panel px-4 py-2">
    <span class="text-3xl font-bold text-health tabular-nums">100</span>
    <span class="text-xs text-hud-muted">HP</span>
  </div>

  <div
    class="absolute right-6 bottom-6 flex items-baseline gap-4 rounded-md bg-hud-panel px-4 py-2 tabular-nums"
  >
    <span class="text-3xl font-bold">8<span class="text-base text-hud-muted"> / 48</span></span>
    <span class="text-sm text-hud-muted">▣ 50</span>
  </div>
</div>
