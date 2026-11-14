<script lang="ts">
  import type { Snippet } from 'svelte'

  // One option of a group (mode, size, weapon, on/off): filled when chosen.
  let {
    selected,
    onclick,
    children,
    class: className = '',
  }: { selected: boolean; onclick: () => void; children: Snippet; class?: string } = $props()
</script>

<button
  type="button"
  aria-pressed={selected}
  class="pointer-events-auto rounded-md border-2 px-3 py-1.5 text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud {selected
    ? 'border-hud bg-hud font-semibold text-hud-ink'
    : 'border-hud-muted/40 bg-hud-solid/60 text-hud hover:border-hud'} {className}"
  {onclick}>{@render children()}</button
>
