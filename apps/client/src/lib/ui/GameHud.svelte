<script lang="ts">
  import { PALETTE } from '@blockfront/sim/world/blocks'
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { causeLabel, displayName, itemLabel, teamLabel } from './labels.ts'

  // mm:ss of the match clock.
  const clock = $derived.by(() => {
    const total = Math.max(0, Math.ceil(hudState.timeLeft))
    const m = Math.floor(total / 60)
    const sec = total % 60
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  })

  // Crosshair gap in px from the cone half-angle (radians).
  const gap = $derived(Math.round(4 + hudState.spread * 420))

  // Reload ring around the crosshair: r = 22 px, fills clockwise as the reload advances.
  const RING_R = 22
  const RING_LEN = 2 * Math.PI * RING_R
  const reloadingHeld = $derived(
    hudState.slot === 1 ? hudState.reloading : hudState.slot === 2 && hudState.pistolReloading,
  )
  const reloadProgress = $derived(
    hudState.reloadTotal > 0 ? 1 - Math.min(1, hudState.reloadLeft / hudState.reloadTotal) : 0,
  )

  // 100 HP = 10 hearts; shown rounded up to the nearest half heart (5 HP).
  const shownHp = $derived(Math.ceil(Math.max(0, hudState.hp) / 5) * 5)
  const hearts = $derived(
    Array.from({ length: 10 }, (_, i) => {
      const value = shownHp - i * 10
      const before = Math.ceil(hudState.hpBefore / 5) * 5 - i * 10
      const fill: 'full' | 'half' | 'empty' = value >= 10 ? 'full' : value >= 5 ? 'half' : 'empty'
      const lost =
        fill !== 'full' && before >= 10 ? 'full' : fill === 'empty' && before >= 5 ? 'half' : null
      return { fill, lost }
    }),
  )
  const hurtFlash = $derived(hudState.now - hudState.hurtAt < 1000)
  const lostVisible = $derived(hudState.now - hudState.hurtAt < 600)
  const lowHp = $derived(hudState.alive && hudState.hp <= 20)
  const bubblesVisible = $derived(hudState.eyeInWater || hudState.air < 10)

  const itemNameOpacity = $derived.by(() => {
    const age = hudState.now - hudState.itemNameAt
    if (age > 2000) return 0
    return age < 1500 ? 1 : (2000 - age) / 500
  })

  const blockColorHex = $derived(
    '#' + (PALETTE[hudState.blockColor] ?? 0xffffff).toString(16).padStart(6, '0'),
  )

  // Blocks and grenades lock their slot at zero stock; the sim hands back to the primary.
  const dryFlash = $derived(hudState.now - hudState.dryFireAt < 350)
  const heldEmpty = $derived(
    hudState.slot === 1
      ? hudState.mag === 0 && hudState.reserve === 0
      : hudState.slot === 2 && hudState.pistolMag === 0 && hudState.pistolReserve === 0,
  )

  const slots = $derived([
    {
      n: 1,
      icon: 'primary',
      label: itemLabel(hudState.weapon),
      count: null as number | null,
    },
    { n: 2, icon: 'pistol', label: itemLabel('pistol'), count: null as number | null },
    { n: 3, icon: 'shovel', label: itemLabel('shovel'), count: null as number | null },
    { n: 4, icon: 'blocks', label: itemLabel('blocks'), count: hudState.blocks },
    { n: 5, icon: 'grenade', label: itemLabel('grenade'), count: hudState.grenades },
  ])
</script>

<div
  class="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-hud-panel px-4 py-1.5 text-lg font-semibold tabular-nums"
>
  <span class="text-team-blue">{hudState.scoreBlue}</span>
  <span class="text-hud-muted">:</span>
  <span class="text-team-red">{hudState.scoreRed}</span>
  <span
    class="ml-2 text-sm {hudState.matchState === 'suddenDeath'
      ? 'text-team-red'
      : 'text-hud-muted'}"
    >{hudState.matchState === 'suddenDeath' ? t('match.suddenDeath') + ' ' : ''}{clock}</span
  >
</div>
{#if hudState.carrying}
  <div
    class="absolute top-24 left-1/2 -translate-x-1/2 rounded-md bg-team-blue/80 px-4 py-1 text-sm font-semibold"
  >
    {t('match.carrying')}
  </div>
{:else if hudState.protected}
  <div
    class="absolute top-24 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-3 py-1 text-xs text-hud-muted"
  >
    {t('match.protected')}
  </div>
{/if}

{#if hudState.showStats}
  <div
    class="absolute top-4 right-4 rounded-md bg-hud-panel px-2 py-1 text-xs text-hud-muted tabular-nums"
  >
    {hudState.fps} fps · t{hudState.tick} · mesh {hudState.meshAvgMs.toFixed(
      1,
    )}/{hudState.meshMaxMs.toFixed(1)} ms · sim {hudState.simAvgMs.toFixed(
      2,
    )}/{hudState.simMaxMs.toFixed(2)} ms · {hudState.quads}
    quads · {hudState.mode === 'fps' ? 'FPS' : 'FLY'}{hudState.showHitboxes ? ' · hitboxes' : ''}
  </div>
{/if}

<div class="absolute top-14 right-4 flex flex-col items-end gap-1 text-sm">
  {#each hudState.killFeed as entry (entry.id)}
    <div class="rounded bg-hud-panel px-3 py-1">
      {#if entry.flag}
        {#if entry.flag.action === 'autoReturned'}
          <span class={entry.flag.team === 'blue' ? 'text-team-blue' : 'text-team-red'}
            >{t('feed.flag.autoReturned', { team: teamLabel(entry.flag.team) })}</span
          >
        {:else}
          <span class="font-semibold">{displayName(entry.flag.name)}</span>
          <span class={entry.flag.team === 'blue' ? 'text-team-blue' : 'text-team-red'}>
            {t(`feed.flag.${entry.flag.action}`, { team: teamLabel(entry.flag.team) })}</span
          >
        {/if}
      {:else}
        {#if entry.attacker}<span class="font-semibold">{displayName(entry.attacker)}</span>{/if}
        <span class="text-hud-muted"> [{causeLabel(entry.tool)}] </span>
        <span class="font-semibold">{displayName(entry.victim)}</span>
      {/if}
    </div>
  {/each}
</div>

{#each hudState.damageIndicators as indicator (indicator.id)}
  <div
    class="absolute top-1/2 left-1/2 size-0"
    style="transform: rotate({(-(indicator.angle - hudState.yaw) * 180) / Math.PI}deg)"
  >
    <span
      class="absolute left-1/2 h-3 w-20 -translate-x-1/2 -translate-y-24 rounded-full bg-team-red/80"
    ></span>
  </div>
{/each}

{#if hudState.alive && !hudState.scoped}
  <div class="absolute top-1/2 left-1/2 size-0" style="opacity: {1 - hudState.ads}">
    {#if reloadingHeld}
      <!-- Reload: the crosshair gives way to a ring that fills, with the seconds left inside. -->
      <svg
        class="absolute -translate-x-1/2 -translate-y-1/2"
        width={RING_R * 2 + 6}
        height={RING_R * 2 + 6}
        viewBox="-{RING_R + 3} -{RING_R + 3} {RING_R * 2 + 6} {RING_R * 2 + 6}"
      >
        <circle r={RING_R} fill="rgba(0, 0, 0, 0.35)" class="stroke-hud/25" stroke-width="3" />
        <circle
          r={RING_R}
          fill="none"
          class="stroke-hud"
          stroke-width="3"
          stroke-linecap="round"
          transform="rotate(-90)"
          stroke-dasharray={RING_LEN}
          stroke-dashoffset={RING_LEN * (1 - reloadProgress)}
        />
        <g
          class="animate-reload-spin stroke-hud"
          fill="none"
          stroke-width="1.6"
          stroke-linecap="round"
        >
          <path d="M -6 -1.5 A 6 6 0 0 1 4.5 -4" />
          <path d="M 6 1.5 A 6 6 0 0 1 -4.5 4" />
          <path d="M 4.5 -7 L 4.5 -4 L 1.5 -4" />
          <path d="M -4.5 7 L -4.5 4 L -1.5 4" />
        </g>
        <text
          y={RING_R - 7}
          text-anchor="middle"
          class="fill-hud text-[11px] font-semibold tabular-nums"
        >
          {hudState.reloadLeft.toFixed(1)}
        </text>
      </svg>
    {:else}
      <span class="absolute h-0.5 w-2 -translate-y-1/2 bg-hud/90" style="left: {gap}px"></span>
      <span class="absolute h-0.5 w-2 -translate-y-1/2 bg-hud/90" style="right: {gap}px"></span>
      <span class="absolute h-2 w-0.5 -translate-x-1/2 bg-hud/90" style="top: {gap}px"></span>
      <span class="absolute h-2 w-0.5 -translate-x-1/2 bg-hud/90" style="bottom: {gap}px"></span>
    {/if}
    {#if hudState.hitmarker}
      <span
        class="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rotate-45 text-xl leading-none font-bold {hudState.hitmarkerHead
          ? 'text-team-red'
          : 'text-hud'}">+</span
      >
    {/if}
  </div>
{/if}

<!-- Health and air -->
<div class="absolute bottom-6 left-6 flex flex-col gap-1.5">
  {#if bubblesVisible}
    <div class="flex gap-0.5">
      {#each Array.from({ length: 10 }, (_, i) => i) as i (i)}
        <svg
          class="size-5 drop-shadow-[0_1px_0_rgba(0,0,0,0.5)] {i < hudState.air
            ? 'text-[#bfe6ff]'
            : 'text-[#bfe6ff]/25'}"
          viewBox="0 0 9 9"
          shape-rendering="crispEdges"
        >
          <use href="#bubble" />
        </svg>
      {/each}
    </div>
  {/if}
  <div class="flex items-end gap-2">
    <div class="flex gap-0.5 {lowHp ? 'animate-shake' : ''}">
      {#each hearts as heart, i (i)}
        <span class="relative size-5 {hurtFlash ? 'drop-shadow-[0_0_2px_#fff]' : ''}">
          <svg class="absolute inset-0 text-hud-ink/60" viewBox="0 0 9 9">
            <use href="#heart" />
          </svg>
          {#if lostVisible && heart.lost}
            <svg
              class="absolute inset-0 text-rose-200/70"
              viewBox="0 0 9 9"
              style={heart.lost === 'half' ? 'clip-path: inset(0 50% 0 0)' : ''}
            >
              <use href="#heart" />
            </svg>
          {/if}
          {#if heart.fill !== 'empty'}
            <svg
              class="absolute inset-0 text-health-heart"
              viewBox="0 0 9 9"
              style={heart.fill === 'half' ? 'clip-path: inset(0 50% 0 0)' : ''}
            >
              <use href="#heart" />
            </svg>
          {/if}
        </span>
      {/each}
    </div>
    {#if hudState.showHpNumber}
      <span class="text-xs text-hud-muted tabular-nums">{Math.ceil(hudState.hp)}</span>
    {/if}
  </div>
</div>

<!-- Hotbar -->
<div class="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
  {#if itemNameOpacity > 0}
    <span class="text-sm font-semibold drop-shadow" style="opacity: {itemNameOpacity}"
      >{hudState.itemName ? itemLabel(hudState.itemName) : ''}</span
    >
  {/if}
  <div class="flex gap-1.5">
    {#each slots as slot (slot.n)}
      <div
        class="relative size-14 rounded-md border-2 bg-hud-panel {slot.n === hudState.slot
          ? 'border-hud shadow-[0_0_0_2px_rgba(255,255,255,0.35)]'
          : slot.count === 0
            ? 'border-team-red/50 opacity-60 grayscale'
            : 'border-hud-muted/30'}"
      >
        {#if slot.count === 0}
          <svg class="absolute inset-0 size-full" viewBox="0 0 56 56" aria-hidden="true">
            <line x1="10" y1="46" x2="46" y2="10" class="stroke-team-red" stroke-width="3" />
          </svg>
        {/if}
        <span class="absolute top-0.5 left-1 text-[10px] text-hud-muted">{slot.n}</span>
        <svg class="absolute inset-0 m-auto size-9" viewBox="0 0 16 16" aria-hidden="true">
          {#if slot.icon === 'primary'}
            <path fill="#8d949c" d="M2 8h11v2H2z" />
            <path fill="#3a3f46" d="M4 7h6v3H4zM4 10h2v3H4zM1 8h2v2H1z" />
            <path fill="#7a4a24" d="M9 9h5v2H9zM11 11h3v1h-3z" />
          {:else if slot.icon === 'pistol'}
            <path fill="#3a3f46" d="M3 5h10v3H3z" />
            <path fill="#8d949c" d="M3 6h9v1H3z" />
            <path fill="#5d3719" d="M9 8h3v5H9z" />
            <path fill="#3a3f46" d="M7 8h2v2H7z" />
          {:else if slot.icon === 'shovel'}
            <path fill="#7a4a24" d="M9 2h2v7H9z" />
            <path fill="#8d949c" d="M7 9h6v3H7zM8 12h4v2H8z" />
          {:else if slot.icon === 'blocks'}
            <path fill={blockColorHex} d="M3 3h10v10H3z" />
            <path fill="rgba(0,0,0,0.25)" d="M3 3h10v1H3zM3 3h1v10H3z" />
            <path fill="rgba(255,255,255,0.25)" d="M12 4h1v9h-1zM4 12h9v1H4z" />
          {:else}
            <path fill="#2a2f2a" d="M5 5h6v8H5z" />
            <path fill="#444" d="M6 6h4v6H6z" />
            <path fill="#8d949c" d="M7 3h2v2H7z" />
          {/if}
        </svg>
        {#if slot.count !== null && slot.count !== 1}
          <span
            class="absolute right-1 bottom-0.5 text-xs font-semibold text-hud drop-shadow-[0_1px_0_#000] tabular-nums"
            >{slot.count}</span
          >
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- Ammo -->
<div
  class="absolute right-6 bottom-6 flex items-baseline gap-4 rounded-md bg-hud-panel px-4 py-2 tabular-nums"
>
  {#if hudState.slot === 1}
    <span class="text-3xl font-bold {heldEmpty || dryFlash ? 'text-team-red' : ''}"
      >{hudState.mag}<span class="text-base text-hud-muted"> / {hudState.reserve}</span></span
    >
    {#if heldEmpty}<span class="text-sm font-semibold text-team-red">{t('hud.noAmmo')}</span>{/if}
    {#if hudState.reloading}<span class="animate-pulse text-sm font-semibold text-hud"
        >{t('hud.reloading')}</span
      >{/if}
  {:else if hudState.slot === 2}
    <span class="text-3xl font-bold {heldEmpty || dryFlash ? 'text-team-red' : ''}"
      >{hudState.pistolMag}<span class="text-base text-hud-muted">
        / {hudState.pistolReserve}</span
      ></span
    >
    {#if heldEmpty}<span class="text-sm font-semibold text-team-red">{t('hud.noAmmo')}</span>{/if}
    {#if hudState.pistolReloading}<span class="animate-pulse text-sm font-semibold text-hud"
        >{t('hud.reloading')}</span
      >{/if}
  {:else if hudState.slot === 4}
    <span class="text-3xl font-bold">▣ {hudState.blocks}</span>
  {:else if hudState.slot === 5}
    <span class="text-3xl font-bold">◉ {hudState.grenades}</span>
    {#if hudState.cooking >= 0}<span class="text-sm text-team-red"
        >{hudState.cooking.toFixed(1)} s</span
      >{/if}
  {:else}
    <span class="text-3xl font-bold">{itemLabel('shovel')}</span>
  {/if}
</div>
