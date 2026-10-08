# Blockfront — Plan y alcance

Shooter voxel por equipos en el navegador: construyes y destruyes bloques para proteger tu bandera
mientras intentas capturar la del rival. Se juega contra bots (3 dificultades) sin registro y, en
una segunda entrega, en salas multijugador por link.

- Repo: `~/Personal/blockfront` · GitHub `JhonRiv21/Blockfront` · dominio `blockfront.riverogz.com`
- Inspiración: Blockade 3D (Unity Web Player, 2014) y la familia «Minecraft con armas».
  **Solo mecánicas**: nada de nombres, mapas, modelos, sonidos ni código de esos juegos.
- Costo recurrente objetivo: **$0** (Cloudflare Workers Free + assets CC0).

---

## 1. Decisiones cerradas

| Tema | Decisión | Motivo |
|---|---|---|
| Alcance | Entrega 1: CTF contra bots. Entrega 2: multijugador | Cada entrega es jugable y presentable por sí sola |
| Estilo | Voxel de **colores planos** (color por bloque + AO por vértice + niebla), sin texturas | Ligero, moderno y fácil de pulir |
| Render | **Three.js** (`WebGLRenderer`, WebGL2) + motor voxel propio | Menos de 1 MB de JS; Unity/Godot web arrancan con 5–10 MB y ocultan el código |
| UI | **Svelte 5 + Vite** (SPA, sin SvelteKit) + Tailwind v4 | Menús y HUD reactivos; Vite minifica (no hay ofuscación real en web) |
| Simulación | Paquete TS puro compartido (`packages/sim`) | El mismo código corre en el Worker del navegador (bots) y en el servidor (multi) |
| Servidor de juego | **Cloudflare Durable Objects** (un objeto por sala), plan Free | Sin arranque en frío de contenedor; autoritativo; $5/mes si algún día no alcanza |
| Hosting estático | El mismo Worker con *static assets* | Un solo deploy para juego y salas |
| Persistencia | **Cloudflare D1** (ranking, estadísticas) | Binding directo desde el Worker, sin claves en el cliente |
| Cuentas | **Ninguna**: apodo aleatorio editable, guardado en `localStorage` | Regla del portafolio: probarlo en 10 s sin registrarse |
| Plataforma | Desktop (teclado + ratón). Móvil fuera de alcance | Un FPS táctil es otro proyecto |

---

## 2. Arquitectura

```
                        ┌──────────────────────── navegador ────────────────────────┐
                        │  apps/client (Svelte 5 + Three.js)                         │
                        │   ├─ render: chunks, viewmodel, efectos, HUD               │
                        │   ├─ input → InputFrame                                    │
                        │   ├─ mesher workers (greedy + AO, transferables)           │
                        │   └─ Transport (interfaz)                                  │
                        │        ├─ LocalTransport ──► sim worker (packages/sim)     │  Entrega 1
                        │        └─ SocketTransport ─┐                               │  Entrega 2
                        └────────────────────────────┼───────────────────────────────┘
                                                     │ WebSocket binario
                        ┌──────────── Cloudflare ────▼───────────────────────────────┐
                        │  Worker: static assets + /api/* + upgrade WS               │
                        │   ├─ RoomDO (1 por sala): packages/sim autoritativo 30 Hz  │
                        │   ├─ LobbyDO (singleton): salas públicas + medidor de uso  │
                        │   └─ D1: partidas, ranking                                 │
                        └────────────────────────────────────────────────────────────┘
```

**La pieza clave es la interfaz `Transport`.** La partida contra bots corre la simulación en un
Web Worker del navegador (`LocalTransport`). El multijugador solo cambia el transporte por un
WebSocket hacia un `RoomDO` que corre **el mismo** `packages/sim`. Así la Entrega 2 no reescribe
el juego: agrega red, predicción e interpolación.

### Monorepo (npm workspaces)

```
blockfront/
├─ packages/
│  └─ sim/              TS puro: SIN DOM, SIN Three.js, SIN APIs de navegador ni de Workers
│     ├─ world/         Chunk, World, paleta, generador de mapas por semilla
│     ├─ physics/       AABB swept contra la grilla, controlador de jugador
│     ├─ raycast/       DDA (Amanatides–Woo) sobre voxels + rayo contra hitboxes
│     ├─ combat/        armas, daño, caída, granadas, munición
│     ├─ rules/         CTF: equipos, banderas, capturas, oleadas de respawn, recarga en base
│     ├─ bots/          percepción, pathfinding, roles, behavior trees, dificultad
│     ├─ protocol/      codificación binaria de inputs, snapshots y deltas de bloques
│     └─ game.ts        Game: step(inputs) → eventos; estado serializable
├─ apps/
│  ├─ client/           Vite + Svelte 5 + Tailwind v4 + Three.js
│  │  └─ src/lib/{render,mesher,audio,input,net,ui,i18n,assets}
│  └─ server/           Cloudflare Worker + Durable Objects + D1 (Entrega 2)
├─ assets/              fuentes de assets CC0 + CREDITS.md
└─ .github/workflows/   typecheck + build + tests
```

### Modelo de simulación

- Tick fijo de **30 Hz** en `packages/sim`; el render interpola entre ticks a la tasa de la pantalla.
- El cliente nunca toca el estado: produce `InputFrame` (`seq`, ejes de movimiento, yaw/pitch,
  botones, slot) y consume snapshots y eventos (disparo, impacto, muerte, bloque, captura).
- Los bots viven dentro de `sim` y generan sus propios `InputFrame`: un bot y un humano pasan por
  exactamente las mismas reglas (cadencia, munición, física). **Un bot nunca lee estado que un
  humano no vería.**
- No se exige determinismo bit a bit entre máquinas: la reconciliación corrige la deriva.

---

## 3. Diseño del juego (Entrega 1)

### Partida
- CTF, 2 equipos (Azul/Rojo), de 1v1 a 8v8; los bots rellenan los cupos.
- Gana quien capture **3 banderas** o lleve ventaja a los **10 min** (empate → muerte súbita 2 min).
- Respawn en **oleadas cada 8 s** en la base propia.
- Para capturar, tu bandera debe estar en su base. Bandera caída: vuelve a su base a los 20 s o
  si la toca un aliado.
- Fuego amigo apagado; destruir bloques de la base propia está bloqueado (anti-grief).

### Mapa
- 128 (ancho) × 192 (largo) × 64 (alto) voxels; chunks de **32³** → 4 × 6 × 2 = 48 chunks.
- Bloque = `Uint8` → índice a una **paleta de 64 colores** (tierra, pasto, piedra, arena, madera,
  bloque azul, bloque rojo, roca indestructible del fondo…). Variación de tono por hash de la
  posición para que no se vea plano.
- **Generador procedural por semilla, simétrico en espejo** entre bases: terreno con ruido, un río
  o valle en el centro, colinas, una estructura defensiva por base. La semilla viaja en vez del
  mapa: cliente y servidor regeneran lo mismo.
- 2–3 semillas curadas a mano como «mapas oficiales» con nombre.

### Recursos del jugador
- 100 de vida, sin regeneración.
- **50 bloques**, se recargan tocando la base (máximo cada 15 s); romper un bloque devuelve +1.
- 3 granadas por vida.
- Los bloques tienen 100 de vida; la pala hace 55.

### Arsenal (Entrega 1)

| Slot | Arma | Torso / cabeza / extremidades | Cadencia | Cargador / reserva | Caída de daño | Dispersión | Daño a bloque |
|---|---|---|---|---|---|---|---|
| 1 | Fusil semiautomático | 50 / 100 / 34 | 0,5 s | 8 / 48 | ninguna | muy baja | 50 |
| 1 | Subfusil | 25 / 60 / 18 | 0,1 s | 30 / 120 | 100 % hasta 20 bloques, 60 % a 45 | media, crece al disparar seguido | 25 |
| 1 | Escopeta (8 perdigones) | 14 / 20 / 9 por perdigón | 0,9 s | 6 / 36 (recarga cartucho a cartucho) | fuerte desde 8 bloques | alta | 15 por perdigón |
| 1 | Francotirador de cerrojo | 90 / 150 / 60 | 1,3 s | 5 / 25 | ninguna | casi nula con mira | 100 |
| 2 | Pala | 60 cuerpo a cuerpo | 0,25 s | — | — | — | 55 (el clic derecho rompe 3 en vertical) |
| 3 | Bloques | — | 0,2 s por bloque | 50 | — | — | colocar en línea arrastrando |
| 4 | Granada | 100 en el centro, 0 a 4 bloques | mecha de 3 s que se puede cocinar | 3 | — | — | rompe una esfera de radio 2 |

El arma primaria se elige en el menú de respawn. Todo el balance va en **un solo archivo de datos**
(`packages/sim/combat/weapons.ts`) para iterarlo sin tocar lógica.

Game feel obligatorio (es lo que separa un demo de un juego): sonido por disparo e impacto,
retroceso de cámara y del modelo del arma, hitmarker y sonido de impacto, número de daño opcional,
partículas de bloque al romper, *screen shake* leve por granada, indicador de dirección del daño,
kill feed.

### Bots

**Dificultades** (ninguna hace trampa; solo cambian parámetros humanos):

| Parámetro | Recluta | Soldado | Veterano |
|---|---|---|---|
| Tiempo de reacción | 450 ms | 300 ms | 180 ms |
| Campo de visión | 90° | 110° | 120° |
| Giro máximo | 180°/s | 300°/s | 450°/s |
| Error de puntería inicial | alto | medio | bajo |
| Prioriza la cabeza | nunca | a veces | casi siempre |
| Memoria de la última posición vista | 2 s | 4 s | 6 s |
| Construye y excava | no | defensas básicas | túneles y defensas |

- **Percepción**: visión por raycast DDA dentro del campo de visión; oído (disparos, excavación,
  pasos) dentro de un radio; información del equipo (portador de bandera visible para todos).
- **Puntería**: ruido suave que se reduce mientras siguen al blanco; al girar de golpe se pasan o
  se quedan cortos y luego se asientan. Más reacción si el enemigo aparece por la periferia.
- **Pathfinding**: A* sobre la grilla con movimientos tipados: caminar, saltar 1 bloque, caer
  hasta 3, **excavar** (cuesta tiempo) y **colocar bloque** (escalera o puente, cuesta
  inventario). La ruta se repara cuando cambia un bloque de un chunk que cruza. Se calcula
  repartido en varios ticks (presupuesto de nodos por tick) para no frenar la simulación.
- **Decisión**:
  - Un «comandante» por equipo, con utility AI, reparte roles: atacar, defender, escoltar al
    portador, recuperar la bandera.
  - Cada rol es un behavior tree.
  - El combate es una FSM pequeña (buscar, enfrentar, cubrirse, recargar).
- **Construcción**: los defensores usan plantillas (muro en U, torre) alrededor de su bandera. Los
  atacantes usan excavar y colocar bloques como un movimiento más del A*.

---

## 4. Netcode (Entrega 2)

- **Servidor autoritativo**: `RoomDO` simula a 30 Hz con `packages/sim` y envía snapshots a
  **20 Hz** (salida gratis en DO).
- **Inputs del cliente agrupados**: 2 `InputFrame` por mensaje a 15 Hz. La entrada es lo que
  consume la cuota gratis (100k requests/día, mensajes WS entrantes a razón de 20:1).
- **Predicción en el cliente con reconciliación** por `seq`: el cliente corre el mismo controlador
  de `sim` para su propio jugador y reaplica los inputs no confirmados.
- **Interpolación** de los demás jugadores unos 100 ms en el pasado.
- **Compensación de lag para hitscan**: el servidor guarda ~1 s de historial de hitboxes y
  rebobina a `ahora − RTT/2 − interpolación` para validar cada disparo.
- **Bloques**: al entrar, semilla + lista de cambios desde el inicio; en partida, deltas por
  chunk por el canal ordenado. El cliente predice su propio bloque y el servidor confirma o
  revierte.
- **Interés por visibilidad**: no se envían a un cliente las posiciones de enemigos fuera de su
  línea de visión y radio de oído (anti-wallhack básico).
- **Protocolo binario** propio con `DataView` (sin JSON en el bucle). Sin dependencias.
- **Salas**:
  - «Crear sala» genera un link `/r/<código>` para compartir.
  - «Partida rápida» entra a una sala pública con cupo.
  - Los bots rellenan los cupos vacíos y se retiran cuando entra un humano.
  - Si no quedan humanos, la sala se cierra; nunca hay salas solo de bots en el servidor (además,
    sin mensajes entrantes se agotaría el límite de CPU del DO).
- **Medidor de uso**: cada `RoomDO` reporta sus mensajes entrantes al `LobbyDO` cada 60 s. Cerca
  de 85k requests del día (el corte es a las 00:00 UTC = 19:00 Colombia), el lobby deja de crear
  salas y el menú ofrece jugar contra bots. **Nunca debe caerse una partida a medias por cuota.**
- **Ranking** en D1 al terminar cada partida: apodo, kills, capturas, precisión.
- Latencia esperada desde Colombia: ~70–90 ms (los DO no se crean en Sudamérica). Es aceptable
  con predicción y lag compensation.

---

## 5. Fases

Cada fase termina en algo jugable. Al cerrar cada fase: `npm run typecheck && npm run build` en
verde y una nota en `docs/progress.md` (qué se hizo, números medidos, pendientes).

### F0 — Andamiaje
- Monorepo con npm workspaces, TS `strict`, ESLint, Prettier.
- `apps/client` con Vite 8 + Svelte 5 + Tailwind v4 + Three.js, servido por un Worker con
  *static assets* (`wrangler`).
- CI en GitHub Actions: typecheck, build, tests de `sim`.
- **Hecho cuando**: `npm run dev` abre una escena vacía con el HUD; `wrangler deploy --dry-run`
  pasa.

### F1 — Mundo y movimiento
- `Chunk`/`World`, generador simétrico por semilla y paleta.
- Mesher en Web Workers: greedy meshing con AO por vértice. Solo se fusionan caras con el mismo
  AO y el mismo color, y el resultado se devuelve como transferables.
- `ShaderMaterial` propio: color de la paleta + AO + luz direccional + hemisférica + niebla.
- Controlador FPS (pointer lock, WASD, salto, agacharse, correr) con física AABB swept de `sim`.
- Raycast DDA: picar y colocar bloques con resaltado de la cara apuntada.
- **Hecho cuando**:
  - Se camina el mapa completo a **60 fps estables** en un portátil medio.
  - Rehacer el mesh de un chunk tarda **< 5 ms**.
  - Picar o colocar un bloque se ve en < 1 frame tras el remesh.

### F2 — Combate
- Armas de la tabla, hitscan con hitboxes (cabeza/torso/extremidades), granadas con física
  simple, daño a bloques, munición y recarga.
- La simulación pasa a correr en el *sim worker* a través de `LocalTransport`.
- Modelos de jugador (Kenney Blocky Characters) con animación simple; *viewmodel* del arma.
- Audio (Kenney/OGA CC0) con posicionamiento 3D. HUD: vida, munición, bloques, mira, hitmarker,
  kill feed.
- **Hecho cuando**: dos maniquíes estáticos reciben daño correcto según zona y distancia, y el
  game feel de la sección 3 está completo.

### F3 — CTF + bots → **Entrega 1 (presentable)**
- Reglas de CTF, banderas, oleadas, recarga en base y marcador.
- Bots completos: percepción, A* con excavar y construir, roles, behavior trees y 3 dificultades.
- Menú:
  - Jugar contra bots: tamaño de equipo, dificultad y mapa.
  - Selección de arma.
  - Ajustes: sensibilidad, FOV, volumen, invertir Y.
  - Pantalla de controles.
- i18n ES/EN con selector y `localStorage` (mismo patrón que el museo).
- Deploy a `blockfront.riverogz.com` (Cloudflare, Always Use HTTPS, TLS ≥ 1.2).
- **Hecho cuando**:
  - Un 4v4 de bots Veterano juega solo una partida completa y alguien captura.
  - Un humano promedio le gana a Recluta y pierde con frecuencia ante Veterano.
  - Desde un enlace en frío se está jugando en **< 5 s**.

### F4 — Multijugador → **Entrega 2**
- `apps/server`: `RoomDO`, `LobbyDO`, D1 y protocolo binario.
- `SocketTransport`, predicción, reconciliación, interpolación y lag compensation.
- Salas por link, partida rápida, relleno con bots, medidor de uso y ranking.
- **Hecho cuando**:
  - Dos navegadores en redes distintas juegan un CTF completo.
  - Con 150 ms de latencia simulada el movimiento propio no se siente tarde y los disparos
    registran donde se apuntó.
  - Un test de carga con 8 clientes simulados confirma el consumo de requests por hora calculado.

### F5 — Vitrina
- README bilingüe (EN + ES) con GIF, arquitectura y decisiones técnicas.
- `CREDITS.md` de assets y página «Acerca de» dentro del juego.
- Video corto para el portafolio y Lighthouse.
- Afinar el balance con partidas reales.

---

## 6. Presupuestos de rendimiento

| Métrica | Objetivo |
|---|---|
| JS inicial (gzip) | < 600 KB |
| Peso total de la primera partida | < 5 MB |
| Tiempo hasta jugar (enlace en frío, banda ancha) | < 5 s |
| FPS en un portátil medio | 60 estables |
| Remesh de un chunk | < 5 ms (en worker) |
| Tick de `sim` con 16 entidades + bots | < 8 ms (cabe en 33 ms) |

---

## 7. Calidad y pruebas

- Lo que más rinde: `typecheck` y `build` en CI.
- Unitarias **solo en lógica pura con riesgo real**:
  - Raycast DDA (caras y bordes de chunk).
  - AABB sweep (esquinas, escalones, techo).
  - Greedy meshing (conteo de caras en casos conocidos y bordes entre chunks).
  - Daño con caída por distancia.
  - Codificación y decodificación del protocolo (ida y vuelta).
  - Reglas de CTF (captura válida solo con la bandera propia en base).
- **Prueba de repetición**: la misma semilla y la misma secuencia de inputs producen el mismo
  estado final en la misma máquina.
- Smoke E2E con Playwright: carga la página, entra a una partida contra bots y verifica que el
  canvas renderiza y que el HUD aparece.
- **Los tests se escriben desde la especificación de este plan, no leyendo la implementación.**
  Si la implementación ya está en contexto, decirlo explícitamente.

---

## 8. Fuera de alcance (v1)

Controles táctiles y móvil, cuentas y login, editor de mapas, más modos (TDM, territorios),
skins y cosméticos, chat de voz o texto, WebTransport y anti-trampas más allá del servidor
autoritativo con interés por visibilidad.

Candidatos naturales después de v1: editor de mapas compartibles por link, modo Territorios,
carabina, ametralladora ligera y pistola.

---

## 9. Costos y límites (verificado 2026-10-08)

| Recurso | Free | Uso esperado |
|---|---|---|
| Workers static assets | Las peticiones a assets estáticos son gratis | Toda la Entrega 1 |
| Durable Objects | 100k requests/día (WS entrante 20:1), 13.000 GB-s/día, errores (no cobro) al exceder | ~4,6 h/día de partidas 8 humanos con inputs a 15 Hz agrupados de a 2 |
| D1 | 5M lecturas / 100k escrituras al día, 5 GB | Una escritura por jugador por partida |
| Workers Paid (si hace falta) | $5/mes | ~$0,01 por hora extra de partida de 8 jugadores |

La partida contra bots no consume nada del servidor.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Alcance grande | Fases jugables; la Entrega 1 no depende de red |
| Bots que se atascan o se ven tontos | Pathfinding con excavar y colocar bloques; probar con bots contra bots y registrar atascos |
| La cuota de DO se agota a mitad de partida | Medidor de uso en `LobbyDO` que cierra salas nuevas antes de 85k |
| Latencia desde Colombia (~80 ms) | Predicción, interpolación y lag compensation desde el diseño |
| Rendimiento en equipos débiles | Chunks de 32³, greedy meshing, sin sombras en tiempo real (el AO da la profundidad), FOV y distancia de niebla ajustables |
| Licencias de assets | Solo CC0, con fuente registrada en `CREDITS.md` |

---

## 11. Reglas para quien ejecute el plan

- **Código en inglés**: identificadores, archivos y comentarios. El copy visible va en ES y EN.
- Comentarios mínimos: solo donde el código no se explica solo.
- Sin barrels, sin emojis en código, sin `catch` vacíos, sin abusar de `$effect`.
- `packages/sim` no importa nada de DOM, Three.js, Svelte ni Workers. Si algo lo necesita, va en
  `apps/*`.
- La lógica de juego no va en componentes `.svelte`: los componentes leen estado y emiten
  intenciones.
- **No hacer `git commit` ni `git push`**: Jhon los ejecuta, al hacer un cambio muy importante o al finalizar una fase.
- Antes de usar una API de Three.js, Svelte, Vite o Wrangler, verificar en `node_modules` la
  versión instalada; no fiarse de la memoria.
- Assets solo CC0, registrados en `assets/CREDITS.md`. Nunca usar los nombres «Blockade»,
  «Ace of Spades» ni assets de esos juegos.
- Al cerrar cada fase, actualizar `docs/progress.md` con números medidos (fps, ms de meshing,
  peso del bundle, tiempo hasta jugar).

---

## 12. Referencias

- Meshing voxel: https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/ · AO:
  https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/ · bitmask greedy:
  https://github.com/cgerikj/binary-greedy-meshing
- Física voxel: https://github.com/fenomas/voxel-aabb-sweep ·
  https://github.com/fenomas/voxel-physics-engine
- Arquitectura de referencia (cliente TS + Three, física AABB): https://github.com/voxelize/voxelize
- Netcode: https://www.gabrielgambetta.com/client-server-game-architecture.html (y sus capítulos de
  predicción, interpolación y lag compensation) · https://gafferongames.com
- Bots:
  - Reacción: http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter05_Agent_Reaction_Time_How_Fast_Should_An_AI_React.pdf
  - Puntería y dificultad: http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter33_Using_Your_Combat_AI_Accuracy_to_Balance_Difficulty.pdf
  - Utility AI: http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf
  - Behavior trees: http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter06_The_Behavior_Tree_Starter_Kit.pdf
  - Pathfinding voxel en JS (MIT): https://github.com/PrismarineJS/mineflayer-pathfinder
- Durable Objects: https://developers.cloudflare.com/durable-objects/platform/pricing/ ·
  https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- Assets CC0: https://kenney.nl/assets/blocky-characters · https://kenney.nl/assets/blaster-kit ·
  https://quaternius.com/packs/ultimategun.html · https://kenney.nl/assets/impact-sounds ·
  https://kenney.nl/assets/sci-fi-sounds
