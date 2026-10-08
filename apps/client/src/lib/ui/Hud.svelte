<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'

  const WEAPON_LABEL: Record<string, string> = {
    rifle: 'Fusil · Rifle',
    smg: 'Subfusil · SMG',
    shotgun: 'Escopeta · Shotgun',
    sniper: 'Francotirador · Sniper',
  }

  // Crosshair gap in px from the cone half-angle (radians).
  const gap = $derived(Math.round(4 + hudState.spread * 420))
  const slots = $derived([
    { n: 1, label: WEAPON_LABEL[hudState.weapon] ?? hudState.weapon, count: null },
    { n: 2, label: 'Pala · Shovel', count: null },
    { n: 3, label: 'Bloques · Blocks', count: hudState.blocks },
    { n: 4, label: 'Granadas · Grenades', count: hudState.grenades },
  ])
</script>

<div class="pointer-events-none fixed inset-0 font-hud text-hud select-none">
  <div
    class="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-hud-panel px-4 py-1.5 text-lg font-semibold tabular-nums"
  >
    <span class="text-team-blue">{hudState.scoreBlue}</span>
    <span class="text-hud-muted">:</span>
    <span class="text-team-red">{hudState.scoreRed}</span>
  </div>

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

  <div class="absolute top-14 right-4 flex flex-col items-end gap-1 text-sm">
    {#each hudState.killFeed as entry (entry.id)}
      <div class="rounded bg-hud-panel px-3 py-1">
        <span class="font-semibold">{entry.attacker}</span>
        <span class="text-hud-muted"> [{entry.tool}] </span>
        <span class="font-semibold">{entry.victim}</span>
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

  {#if hudState.alive}
    <div class="absolute top-1/2 left-1/2 size-0">
      <span class="absolute h-0.5 w-2 -translate-y-1/2 bg-hud/90" style="left: {gap}px"></span>
      <span class="absolute h-0.5 w-2 -translate-y-1/2 bg-hud/90" style="right: {gap}px"></span>
      <span class="absolute h-2 w-0.5 -translate-x-1/2 bg-hud/90" style="top: {gap}px"></span>
      <span class="absolute h-2 w-0.5 -translate-x-1/2 bg-hud/90" style="bottom: {gap}px"></span>
      {#if hudState.hitmarker}
        <span
          class="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rotate-45 text-xl leading-none font-bold {hudState.hitmarkerHead
            ? 'text-team-red'
            : 'text-hud'}">+</span
        >
      {/if}
    </div>
  {/if}

  {#if !hudState.alive}
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-hud-panel px-6 py-4 text-center"
    >
      <p class="text-2xl font-bold text-team-red">Has muerto · You died</p>
      <p class="text-hud-muted">
        Reapareces en {Math.ceil(hudState.respawnIn)} s · Respawn in {Math.ceil(hudState.respawnIn)} s
      </p>
    </div>
  {/if}

  {#if !hudState.assetsReady}
    <div
      class="absolute top-16 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-3 py-1 text-xs text-hud-muted"
    >
      Cargando assets · Loading assets
    </div>
  {/if}

  {#if !hudState.pointerLocked}
    <div
      class="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-4 py-2 text-center text-sm text-hud-muted"
    >
      <p class="font-semibold text-hud">Clic para jugar · Click to play</p>
      {#if hudState.mode === 'fps'}
        <p>WASD mover · Espacio saltar · Ctrl/C agacharse · Shift correr · R recargar</p>
        <p>1-4 o rueda: arma, pala, bloques, granada · Clic izq. usar · Clic der. mira / columna</p>
        <p>F cámara libre · H hitboxes · Esc soltar el ratón</p>
        <p class="mt-1">WASD move · Space jump · Ctrl/C crouch · Shift sprint · R reload</p>
        <p>
          1-4 or wheel: weapon, shovel, blocks, grenade · Left click use · Right click aim / column
        </p>
        <p>F free camera · H hitboxes · Esc release the mouse</p>
      {:else}
        <p>WASD mover · Espacio/C subir/bajar · Shift rápido · F volver al jugador</p>
        <p>WASD move · Space/C up/down · Shift fast · F back to the player</p>
      {/if}
    </div>
  {/if}

  <div class="absolute bottom-6 left-6 flex items-baseline gap-2 rounded-md bg-hud-panel px-4 py-2">
    <span class="text-3xl font-bold text-health tabular-nums">{hudState.hp}</span>
    <span class="text-xs text-hud-muted">HP</span>
  </div>

  <div
    class="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs tabular-nums"
  >
    {#each slots as slot (slot.n)}
      <div
        class="rounded-md px-3 py-1.5 {slot.n === hudState.slot
          ? 'bg-hud/90 font-semibold text-hud-ink'
          : 'bg-hud-panel text-hud-muted'}"
      >
        <span class="mr-1 opacity-70">{slot.n}</span>{slot.label}{slot.count === null
          ? ''
          : ` ×${slot.count}`}
      </div>
    {/each}
  </div>

  <div
    class="absolute right-6 bottom-6 flex items-baseline gap-4 rounded-md bg-hud-panel px-4 py-2 tabular-nums"
  >
    {#if hudState.slot === 1}
      <span class="text-3xl font-bold"
        >{hudState.mag}<span class="text-base text-hud-muted"> / {hudState.reserve}</span></span
      >
      {#if hudState.reloading}
        <span class="text-sm text-hud-muted">Recargando · Reloading</span>
      {/if}
    {:else if hudState.slot === 3}
      <span class="text-3xl font-bold">▣ {hudState.blocks}</span>
    {:else if hudState.slot === 4}
      <span class="text-3xl font-bold">◉ {hudState.grenades}</span>
      {#if hudState.cooking >= 0}
        <span class="text-sm text-team-red">{hudState.cooking.toFixed(1)} s</span>
      {/if}
    {:else}
      <span class="text-3xl font-bold">Pala · Shovel</span>
    {/if}
  </div>
</div>
