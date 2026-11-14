<script lang="ts">
  import { mountGame } from './lib/render/mount-game.ts'
  import DesktopOnly from './lib/ui/DesktopOnly.svelte'
  import { isTouchOnly } from './lib/ui/device.ts'
  import Hud from './lib/ui/Hud.svelte'

  // Phones and tablets without a mouse get a static page; the renderer is never mounted.
  const touchOnly = isTouchOnly()
</script>

{#if touchOnly}
  <DesktopOnly />
{:else}
  <canvas class="fixed inset-0 block size-full" {@attach mountGame}></canvas>
  <Hud />
{/if}
