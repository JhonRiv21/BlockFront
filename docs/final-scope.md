# Alcance final — Blockfront offline contra bots

Decidido por Jhon el 2026-11-13: **cerrar la app lo más rápido posible, sin multijugador ni nada
online**. No hay presupuesto para mantener un servidor. Esto reemplaza F3-C, F3-D, F3-E, F4 y F5 del
PLAN.

- Juego **100 % en el navegador**: la simulación corre en el worker (`LocalTransport`). Sin Durable
  Objects, sin D1, sin cuentas.
- Hosting: el Worker de Cloudflare actual sirve **solo assets estáticos** ($0, sin cuota que vigilar).
  El deploy lo ejecuta Jhon.
- Reglas de ejecución: PLAN.md §11. Código en inglés, copy ES/EN, `sim` puro, tests desde esta
  especificación y **sin commit**.

## Etapas

| Etapa                                | Contenido                                                                                      | Depende de                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| **S1. Modos, cofres y vendas** (sim) | §1, §2, §3 y la configuración de partida                                                       | —                              |
| **S2. Bots** (sim + worker)          | §4 y el harness headless                                                                       | S1                             |
| **S3. Producto** (cliente)           | §5: menú, ajustes, HUD por modo, cofres en pantalla, nombres de bots, móvil, meta tags y carga | S1 (puede ir en paralelo a S2) |
| **S4. QA y cierre**                  | QA con `?qa=1` y el harness, README bilingüe, créditos y comandos de deploy                    | S2 y S3                        |

---

## 1. Configuración de partida

```ts
type GameMode = 'ctf' | 'tdm' | 'ffa'
type Difficulty = 'recruit' | 'soldier' | 'veteran'
interface MatchSetup {
  mode: GameMode
  difficulty: Difficulty
  teamSize: 2 | 3 | 4 | 6 // ctf/tdm: jugadores por equipo, contando al humano en azul
  ffaPlayers: 4 | 6 | 8 // ffa: total, contando al humano
  primary: WeaponId
  seed: number // hoy solo 1
}
```

- **CTF y TDM:** el humano en azul con `teamSize − 1` bots aliados contra `teamSize` bots rojos.
- **FFA:** el humano contra `ffaPlayers − 1` bots, todos enemigos de todos.
- Los bots son jugadores normales del `Game` (`addPlayer`), con `bot: { difficulty }` en su config.
  **Los maniquíes de prueba solo existen en dev o QA.**

## 2. Modos

| Modo                         | Victoria                                                                             | Tiempo                                             | Respawn                                                                           | Bases                                             |
| ---------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| **CTF**                      | 3 capturas (reglas actuales)                                                         | 10 min + muerte súbita                             | Oleadas de 8 s en la base                                                         | Como hoy (recarga, protección, D3)                |
| **TDM** (equipos)            | El primer equipo a **10 bajas por jugador** (2v2 = 20, 3v3 = 30, 4v4 = 40, 6v6 = 60) | 8 min; gana quien lleve más, y el empate es empate | Individual a los **4 s** en la base propia                                        | Recarga y protección en la base; sin banderas     |
| **FFA** (todos contra todos) | El primero a **15 bajas**                                                            | 8 min; gana quien lleve más, y el empate es empate | Individual a los **4 s** en el punto de aparición más lejano a los enemigos vivos | Sin bases ni banderas; se recarga solo con cofres |

- En FFA, D3 no aplica: cualquiera rompe cualquier bloque colocado. Las estructuras de las bases
  generadas se vuelven neutrales. Hacen falta **12 puntos de aparición FFA** deterministas por
  semilla, sobre suelo seco y lejos del agua.
- El suicidio y la muerte por caída o ahogo restan 1 a la puntuación propia en FFA y TDM (la
  convención). En TDM no suma al rival.
- `matchEnd` con ganador: un equipo, un jugador (FFA) o empate. Un MVP por modo: CTF usa capturas,
  luego bajas; TDM y FFA usan bajas, luego menos muertes.
- La pala propia **sí recoge la TNT propia** antes de que explote: devuelve 1 al stock y no explota.
  Excepción a D3 (decidido el 2026-11-13).

## 3. Cofres de botín y vendas

- **Cofres:** **10** por mapa, deterministas por semilla y en espejo (5 por mitad), sobre suelo seco,
  fuera de las bases (≥ 12 bloques de cada bandera) y separados ≥ 10 bloques entre sí. En FFA se
  usan los mismos.
- **Abrirlo** es tocarlo (alcance como el de la bandera) estando vivo. Da:
  - Munición: la reserva de la primaria y la de la pistola vuelven a su máximo (el cargador no
    cambia).
  - **+1 venda** (tope 3).
  - **+1 granada** (tope 3).
- Un cofre abierto queda **vacío 30 s** y reaparece lleno. Evento `loot { player, chest }` y evento
  `chestRefill { chest }`.
- El estado de los cofres viaja en el snapshot: id, posición y lleno o vacío.
- **Vendas** (reemplazan al botiquín, misma ranura 8 y la misma canalización de 1 s):
  - Curan **+40 HP** (tope 100).
  - Se lleva un máximo de 3 y se empieza con 1.
  - El portador de la bandera no puede usarlas (como hoy).
  - Textos: «Vendas» / «Bandages».
- Tests desde esta especificación:
  - Generación determinista, en espejo y con las distancias mínimas.
  - Abrir un cofre: lo que da, los topes y el estado vacío.
  - Reaparición a los 30 s.
  - Las vendas: +40, el tope, la canalización y la restricción del portador.
  - Los tres modos: victoria por puntuación, por tiempo y empate.
  - Respawn de 4 s y punto de aparición FFA lejos del enemigo.
  - Penalización por suicidio.
  - La pala propia recoge la TNT propia.

## 4. Bots

**Principio:** un bot genera su `InputFrame` cada tick desde lo que **percibe**, nunca desde el
estado completo. Pasa por las mismas reglas que el humano.

### Dificultad

| Parámetro                                                 | Recluta | Soldado | Veterano |
| --------------------------------------------------------- | ------- | ------- | -------- |
| Tiempo de reacción                                        | 450 ms  | 300 ms  | 180 ms   |
| Campo de visión                                           | 90°     | 110°    | 120°     |
| Giro máximo                                               | 180°/s  | 300°/s  | 450°/s   |
| Error de puntería inicial (se reduce siguiendo al blanco) | 6°      | 3,5°    | 1,5°     |
| Apunta a la cabeza                                        | 0 %     | 25 %    | 60 %     |
| Memoria de la última posición vista                       | 2 s     | 4 s     | 6 s      |
| Usa ADS a más de 15 bloques                               | no      | sí      | sí       |
| Lanza granadas                                            | no      | a veces | sí       |

### Percepción

- **Visión:** raycast DDA desde el ojo hasta la cabeza y el torso del objetivo, dentro del campo de
  visión y hasta 70 bloques.
- **Oído:** disparos a ≤ 30 bloques; pasos y excavación a ≤ 8. Dan una posición aproximada (±3
  bloques).
- **Equipo:** la posición del portador de la bandera y de los aliados.
- **Ítems:** conoce dónde están los cofres (siempre fijos), pero solo sabe si están llenos si los ve.

### Navegación

- A* sobre la grilla de voxels con movimientos de caminar, saltar 1 bloque, caer hasta 3 y nadar
  (el agua cuesta más).
- Presupuesto de nodos por tick compartido entre los bots: ≤ 2.000 nodos por tick en total.
- La ruta se reconstruye si cambia un bloque que cruza o si se atasca.
- **Atascos:** sin avanzar 1 bloque en 2 s → saltar; en 3 s → excavar el bloque de enfrente con la
  pala; en 5 s → nueva ruta a otro destino.
- Seguir la ruta produce inputs reales: yaw hacia el siguiente nodo, adelante, salto y nado.
- Los bots **no construyen ni colocan TNT** (fuera de alcance).

### Decisión

Puntaje de utilidad por tick para elegir la meta actual:

1. **Combate** con un enemigo visible: girar con el límite de giro y disparar cuando el error
   proyectado cae dentro del blanco; ADS según la dificultad. Recarga cuando no ve enemigos o con el
   cargador en 0. Strafe lateral aleatorio en Soldado y Veterano.
2. **Buscar** la última posición conocida (dentro de la memoria).
3. **Sobrevivir:** con HP < 50 y sin enemigo visible, usar venda; sin vendas, ir al cofre lleno
   conocido más cercano o a la base (CTF/TDM).
4. **Munición:** con la reserva < 30 %, ir a un cofre o a la base.
5. **Objetivo del modo:**
   - **CTF:** un comandante por equipo reparte los roles (con 2 por equipo, 1 ataca y 1 equilibra;
     con más, ~50 % ataca, ~25 % defiende y el resto escolta o recupera):
     - _Atacar:_ ir a la bandera enemiga y, con ella, volver a la propia.
     - _Defender:_ patrullar alrededor de la propia.
     - _Recuperar:_ ir hacia la bandera propia caída.
     - _Escoltar:_ seguir al portador aliado.
   - **TDM/FFA:** recorrer _hotspots_ (centro, puentes, alturas) y moverse hacia el último ruido
     oído.

- El arma primaria se elige al aparecer: rifle y carabina más frecuentes; escopeta en defensores;
  francotirador solo en Veterano (≤ 1 por equipo).

### Harness headless (Node, sin navegador)

- `npm run bots:bench -- --mode ctf --size 4 --difficulty veteran --matches 10` corre partidas solo de
  bots (el humano sustituido por un bot) a máxima velocidad.
- Reporta por partida:
  - Duración, ganador, capturas y bajas.
  - Precisión por dificultad.
  - **Tiempo atascado por bot**.
  - ms por tick de `Game.step`: promedio y p99.
- **Hecho cuando:**
  - CTF 4v4 Veterano: ≥ 80 % de las partidas tiene al menos 1 captura antes de los 10 min.
  - TDM y FFA terminan por puntuación en ≥ 70 % de las partidas.
  - Atascado < 5 % del tiempo por bot.
  - `Game.step` con 12 bots: promedio < 4 ms y p99 < 12 ms en Node.
  - Veterano gana a Recluta en ≥ 80 % de un TDM 4v4 mixto (un equipo de cada dificultad, vía flag
    del harness).

## 5. Producto (cliente)

- **Menú principal:**
  - Modo (3 tarjetas con una línea de descripción).
  - Tamaño (CTF/TDM: 2v2, 3v3, 4v4, 6v6; FFA: 4, 6, 8).
  - Dificultad.
  - Arma primaria.
  - «Jugar» a un clic, con valores por defecto **TDM 4v4 Soldado**.
- **Ajustes** (panel desde el menú y la pausa), guardados en `localStorage` con try/catch:
  - Sensibilidad y sensibilidad ADS.
  - FOV (70–100).
  - Volumen general, armas y mundo.
  - Invertir Y.
  - Mostrar FPS.
  - Reducir el movimiento de cámara (sacudida y bob).
  - Idioma ES/EN; por defecto, el del navegador.
- **HUD por modo:**
  - **Arriba:** en CTF, capturas y reloj; en TDM, bajas por equipo, la meta y el reloj; en FFA,
    tu posición y bajas, las bajas del líder, la meta 15 y el reloj.
  - **Tab:** en CTF y TDM, como hoy; en FFA, una sola tabla ordenada por bajas.
  - **Pantalla final** según el modo, con «Jugar otra vez» (misma configuración) y «Menú».
- **Bots:** nombres de una lista divertida (30 o más, sin personas reales), nameplates solo de aliados
  (en FFA ninguno) y el nombre en el feed.
- **Cofres:**
  - Modelo voxel procedural de madera con herrajes; con la tapa abierta y sin brillo cuando está
    vacío.
  - Brillo suave o partícula cuando está lleno.
  - Sonido al abrir.
  - Aviso «+munición +1 venda +1 granada».
  - Ícono en la brújula para los cofres llenos a ≤ 40 bloques.
- **Móvil:** con `(pointer: coarse)` y sin ratón, una pantalla «Solo escritorio» con una captura del
  juego.
- **Meta tags:** `lang`, description ES/EN, Open Graph con imagen (una captura del juego en
  `public/og.png`), Twitter card y `theme-color`.
- **Carga:** pantalla con progreso que precalienta los workers de malla y oculta el menú hasta que el
  mundo esté mallado.
- **Fuera de producción:** el selector de primaria de la pausa, las teclas F y H, y `qa`.

## 6. Cierre (S4)

- QA end-to-end con `?qa=1`, los tres modos, las tres dificultades y los cofres.
- README bilingüe (EN + ES): GIF o capturas, cómo jugar, arquitectura (sim en worker, voxel,
  bots), decisiones y cifras.
- `assets/CREDITS.md` completo y una sección de créditos dentro del juego.
- `npm run check:qa-absent`, typecheck, lint, tests y build en verde.
- Comandos de deploy para Jhon:
  - `wrangler deploy` con solo assets.
  - Dominio `blockfront.riverogz.com` con Always Use HTTPS y TLS ≥ 1.2.
