<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'

  // Strip under the score: a marker per flag, pinned to the edge when behind the player.
</script>

<div class="absolute top-16 left-1/2 h-7 w-[min(60vw,32rem)] -translate-x-1/2">
  <div class="absolute inset-x-0 top-1/2 h-px bg-hud/30"></div>
  <div class="absolute top-0 left-1/2 h-2 w-px -translate-x-1/2 bg-hud/60"></div>
  {#each hudState.compass as marker (marker.team)}
    <div
      class="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style="left: {50 + marker.offset * 48}%"
    >
      <svg class="size-5" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="#f4f6fb" d="M3 1h2v14H3z" />
        <path fill={marker.team === 'blue' ? '#2f6fe4' : '#e03a3a'} d="M5 1h9v6H5z" />
        {#if marker.state !== 'base'}
          <path fill="rgba(255,255,255,0.9)" d="M5 7h9v1H5z" />
        {/if}
      </svg>
      <span class="text-[10px] leading-none text-hud-muted tabular-nums"
        >{Math.round(marker.distance)} m{marker.state === 'base'
          ? ''
          : ` · ${t(`flag.${marker.state}`)}`}</span
      >
    </div>
  {/each}
</div>
