<script lang="ts">
  import type { SpriteArt } from '../render/sprite-geometry.ts'

  // The same 16×16 pixel art the hand item is extruded from, as an SVG of one rect per pixel.
  let { art, class: className = '' }: { art: SpriteArt; class?: string } = $props()
  const hex = (color: number) => '#' + color.toString(16).padStart(6, '0')
  const pixels = $derived(
    art.rows.flatMap((row, y) =>
      [...row].flatMap((ch, x) =>
        ch === '.' ? [] : [{ x, y, fill: hex(art.palette[ch] ?? 0xff00ff) }],
      ),
    ),
  )
</script>

<svg class={className} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
  {#each pixels as pixel (pixel.x + pixel.y * 16)}
    <rect x={pixel.x} y={pixel.y} width="1" height="1" fill={pixel.fill} />
  {/each}
</svg>
