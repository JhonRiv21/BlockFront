<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'

  // Strip under the score: a marker per flag (with its distance and state) and an icon per full
  // chest within 40 blocks, pinned to the edge when behind the player. Flags draw on top.
  const left = (offset: number) => 50 + offset * 48
</script>

<div class="absolute top-16 left-1/2 h-10 w-[min(60vw,32rem)] -translate-x-1/2">
  <div class="absolute inset-x-0 top-3 h-px bg-hud/40"></div>
  <div class="absolute top-0 left-1/2 h-2 w-px -translate-x-1/2 bg-hud/70"></div>
  {#each hudState.chestMarkers as marker (marker.id)}
    <div
      class="absolute top-0 flex -translate-x-1/2 flex-col items-center"
      style="left: {left(marker.offset)}%"
    >
      <svg
        class="size-6 drop-shadow-[0_1px_0_#000]"
        viewBox="0 0 16 16"
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        <path fill="#6b4423" d="M2 4h12v10H2z" />
        <path fill="#9a6a3a" d="M3 5h10v3H3zM3 9h10v4H3z" />
        <path fill="#4b5058" d="M2 8h12v1H2z" />
        <path fill="#e7b552" d="M7 7h2v3H7z" />
      </svg>
    </div>
  {/each}
  {#each hudState.compass as marker (marker.team)}
    <div
      class="absolute top-0 flex -translate-x-1/2 flex-col items-center"
      style="left: {left(marker.offset)}%"
    >
      <svg class="size-5" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="#f4f6fb" d="M3 1h2v14H3z" />
        <path fill={marker.team === 'blue' ? '#2f6fe4' : '#e03a3a'} d="M5 1h9v6H5z" />
        {#if marker.state !== 'base'}
          <path fill="rgba(255,255,255,0.9)" d="M5 7h9v1H5z" />
        {/if}
      </svg>
      <span
        class="text-sm leading-none whitespace-nowrap text-hud tabular-nums drop-shadow-[0_1px_0_#000]"
        >{Math.round(marker.distance)} m{marker.state === 'base'
          ? ''
          : ` · ${t(`flag.${marker.state}`)}`}</span
      >
    </div>
  {/each}
</div>
