// One language at a time. English is the fallback; keys are shared across languages.
export const en = {
  'item.rifle': 'Rifle',
  'item.carbine': 'Carbine',
  'item.smg': 'SMG',
  'item.shotgun': 'Shotgun',
  'item.sniper': 'Sniper',
  'item.pistol': 'Pistol',
  'item.shovel': 'Shovel',
  'item.blocks': 'Blocks',
  'item.grenade': 'Grenade',
  'cause.drowning': 'Drowned',
  'cause.fall': 'Fall',
  'cause.blocks': 'Block',
  'player.you': 'You',
  'player.dummy': 'Dummy {n}',
  'hud.reloading': 'Reloading',
  'hud.noAmmo': 'No ammo',
  'hud.died': 'You died',
  'hud.respawnIn': 'Respawn in {s} s',
  'hud.loadingAssets': 'Loading assets',
  'hud.primaryWeapon': 'Primary weapon',
  'hud.clickToPlay': 'Click to play',
  'hint.move': 'WASD move · Space jump/swim · C crouch · Shift sprint · R reload',
  'hint.slots':
    '1 weapon · 2 pistol · 3 shovel · 4 blocks (4 again or wheel: colour) · 5 grenade · G throw · Q last',
  'hint.mouse':
    'Left click use · Right click aim / column · Middle click pick colour · Esc or P pause · F3 stats',
  'hint.dev': 'Dev: F free camera · H hitboxes',
  'hint.fly': 'WASD move · Space/C up/down · Shift fast · F back to the player',
  'menu.subtitle': 'Voxel capture the flag. Practice match against dummies.',
  'menu.play': 'Play',
  'pause.title': 'Paused',
  'pause.resume': 'Click to resume',
  'pause.quit': 'Quit to menu',
  'error.webgl': 'The graphics context was lost. Waiting for the browser to restore it…',
  'error.sim': 'The simulation stopped working.',
  'error.mesher': 'The mesh workers keep failing.',
  'error.reload': 'Reload',
  'lock.rejected': 'The browser did not allow mouse capture. Click again.',
} as const

export type StringKey = keyof typeof en

export const es: Record<StringKey, string> = {
  'item.rifle': 'Fusil',
  'item.carbine': 'Carabina',
  'item.smg': 'Subfusil',
  'item.shotgun': 'Escopeta',
  'item.sniper': 'Francotirador',
  'item.pistol': 'Pistola',
  'item.shovel': 'Pala',
  'item.blocks': 'Bloques',
  'item.grenade': 'Granada',
  'cause.drowning': 'Ahogado',
  'cause.fall': 'Caída',
  'cause.blocks': 'Bloque',
  'player.you': 'Tú',
  'player.dummy': 'Maniquí {n}',
  'hud.reloading': 'Recargando',
  'hud.noAmmo': 'Sin munición',
  'hud.died': 'Has muerto',
  'hud.respawnIn': 'Reapareces en {s} s',
  'hud.loadingAssets': 'Cargando assets',
  'hud.primaryWeapon': 'Arma primaria',
  'hud.clickToPlay': 'Clic para jugar',
  'hint.move': 'WASD mover · Espacio saltar/nadar · C agacharse · Shift correr · R recargar',
  'hint.slots':
    '1 arma · 2 pistola · 3 pala · 4 bloques (4 de nuevo o rueda: color) · 5 granada · G lanzar · Q anterior',
  'hint.mouse':
    'Clic izq. usar · Clic der. mira / columna · Clic medio copiar color · Esc o P pausa · F3 estadísticas',
  'hint.dev': 'Dev: F cámara libre · H hitboxes',
  'hint.fly': 'WASD mover · Espacio/C subir/bajar · Shift rápido · F volver al jugador',
  'menu.subtitle': 'Captura la bandera voxel. Partida de práctica contra maniquíes.',
  'menu.play': 'Jugar',
  'pause.title': 'Pausa',
  'pause.resume': 'Clic para continuar',
  'pause.quit': 'Salir al menú',
  'error.webgl': 'Se perdió el contexto gráfico. Esperando a que el navegador lo restaure…',
  'error.sim': 'La simulación dejó de funcionar.',
  'error.mesher': 'Los workers de mallado siguen fallando.',
  'error.reload': 'Recargar',
  'lock.rejected': 'El navegador no permitió capturar el ratón. Haz clic de nuevo.',
}

export const LOCALES = { en, es } as const
export type Locale = keyof typeof LOCALES

// First browser language we have a dictionary for; English when none matches.
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (base && base in LOCALES) return base as Locale
  }
  return 'en'
}
