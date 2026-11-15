# Deploy — Cloudflare (blockfront.riverogz.com)

Pasos para publicar el juego en Cloudflare. Los ejecuta Jhon; ningún agente hace deploy, commit ni
push.

El juego es 100 % estático: la simulación y los bots corren en el navegador del jugador. El
`wrangler.jsonc` de la raíz declara solo **static assets** (`apps/client/dist`), sin `main`. No corre
código de Worker y cada petición es una petición de asset, gratis e ilimitada. El archivo
`apps/client/public/_headers` (Vite lo copia a `dist/`) define las cabeceras de seguridad, la caché y
el `noindex` de `*.workers.dev`.

Es el sucesor que Cloudflare recomienda para Pages, y lo que crea hoy el panel con **Workers & Pages
→ Create → Import a repository**.

## 0. Antes de empezar

- Node 22.12 o superior (`.nvmrc` dice 22).
- La zona `riverogz.com` debe estar en la misma cuenta de Cloudflare.
- Verificaciones en local:

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run check:qa-absent   # compila y falla si un hook de QA llega a dist
npm run deploy:check      # build + wrangler deploy --dry-run
npm run preview           # build + wrangler dev en http://localhost:8788, con _headers aplicado
```

## 1. Proyecto conectado a GitHub (Workers Builds)

Cada push a `main` publica producción. Las otras ramas suben una versión con su propia URL de
preview, sin tocar producción.

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → `JhonRiv21/Blockfront`.
2. Configuración (si el proyecto ya existe: **Settings** → **Build**):

   | Campo                                | Valor                          |
   | ------------------------------------ | ------------------------------ |
   | Project / Worker name                | `blockfront`                   |
   | Build command                        | `npm run build`                |
   | Deploy command                       | `npx wrangler deploy`          |
   | Non-production branch deploy command | `npx wrangler versions upload` |
   | Root directory / Path                | `/` (la raíz del repo)         |
   | Variable de build                    | `NODE_VERSION` = `22`          |

   El nombre del Worker en el panel **debe** ser `blockfront`, igual que `name` en `wrangler.jsonc`;
   si no coinciden, el build falla. Las dependencias se instalan solas con `npm ci` porque existe
   `package-lock.json`.

3. Guardar y lanzar el build (o hacer push). Queda en `https://blockfront.<subdominio>.workers.dev`.

### Error conocido

Sin el `wrangler.jsonc` de la raíz, `npx wrangler deploy` falla con: «The Cloudflare application
detection logic has been run in the root of a workspace instead of targeting a specific project».
El archivo ya está en el repo; si reaparece, revisar que el push lo incluya.

### Alternativa: subir desde la máquina

```bash
npx wrangler login
npx wrangler whoami   # confirmar que es la cuenta que tiene la zona riverogz.com
npm run deploy        # check:qa-absent + wrangler deploy
```

## 2. Dominio personalizado `blockfront.riverogz.com`

1. Worker `blockfront` → **Settings** → **Domains & Routes** → **Add** → **Custom domain**.
2. Escribir `blockfront.riverogz.com` y confirmar. Cloudflare crea el registro DNS y el
   certificado. Si ya existe un registro `blockfront` en la zona, hay que borrarlo antes.

`index.html` ya apunta `canonical`, `og:url` y `og:image` a este dominio. Las URLs `*.workers.dev`
llevan `noindex` para que los buscadores solo indexen el dominio propio.

## 3. Ajustes de la zona `riverogz.com`

En Cloudflare → `riverogz.com` → **SSL/TLS** → **Edge Certificates**:

- **Always Use HTTPS**: activado.
- **Minimum TLS Version**: TLS 1.2.

Son ajustes de toda la zona: también aplican al museo y al resto de subdominios.

## 4. Checklist después del deploy

- [ ] `https://blockfront.riverogz.com` abre, muestra la pantalla de carga y luego el menú.
- [ ] «Jugar» entra a una partida (TDM 4v4 Soldado por defecto) y los bots se mueven y disparan.
- [ ] Cabeceras aplicadas:

  ```bash
  curl -sI https://blockfront.riverogz.com | grep -iE 'content-security|x-frame|nosniff'
  curl -sI https://blockfront.riverogz.com/audio/guns/bullet-whiz.webm | grep -i cache-control
  ```

- [ ] `http://` redirige a `https://`:

  ```bash
  curl -sI http://blockfront.riverogz.com | head -3   # 301 con Location https://
  ```

- [ ] TLS 1.1 rechazado:

  ```bash
  curl -s --tlsv1.1 --tls-max 1.1 https://blockfront.riverogz.com -o /dev/null && echo FALLA || echo ok
  ```

- [ ] `window.blockfront` **no** existe en producción. En la consola de DevTools:

  ```js
  typeof window.blockfront // debe dar "undefined", también con ?qa=1
  ```

- [ ] `https://blockfront.riverogz.com/og.png` carga.
- [ ] Sin errores en la consola al cargar ni al jugar una partida. Un error de
      `Content-Security-Policy` significa que hay que ajustar `_headers`.

## 5. Costo esperado: $0

- Plan **Free**. Las peticiones a static assets son gratis e ilimitadas y no consumen la cuota de
  peticiones del Worker, porque no hay código de Worker (`wrangler.jsonc` no tiene `main`).
- Workers Builds en el plan Free: un build a la vez, con un tope mensual de minutos de build. Este
  build tarda ~1 s más la instalación de dependencias.
- Sin Durable Objects, D1, KV ni R2: no hay nada que facture.
