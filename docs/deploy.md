# Deploy — blockfront.riverogz.com

Pasos para publicar el juego en Cloudflare. Los ejecuta Jhon; ningún agente hace deploy, commit ni
push.

El Worker `blockfront` (`apps/server`) sirve el build de `apps/client/dist` como _static assets_ y
solo ejecuta código propio en `/api/*` (`run_worker_first`), donde existe `GET /api/health`. Todo lo
demás, incluido el fallback de SPA, lo resuelve la capa de assets sin invocar el Worker.

## 0. Antes de empezar

- Node 22.12 o superior (`.nvmrc` dice 22).
- La zona `riverogz.com` debe estar en la misma cuenta de Cloudflare donde se crea el Worker.
- Esperar a que no haya trabajo en curso en el árbol (otro agente puede estar tocando
  `packages/sim`) y correr las verificaciones completas:

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run check:qa-absent   # compila y falla si un hook de QA llega a dist
npm run deploy:check      # build + wrangler deploy --dry-run
```

## 1. Build

```bash
npm ci && npm run build
```

`npm run build` genera `apps/client/dist`, que es lo que sube el deploy. El script de deploy **no**
compila: si se salta este paso se publica lo que haya en `dist`.

## 2. Login en Cloudflare

```bash
npx wrangler login
npx wrangler whoami   # confirmar que es la cuenta que tiene la zona riverogz.com
```

## 3. Deploy

```bash
npm run deploy -w @blockfront/server
```

El script está en `apps/server/package.json` (`"deploy": "wrangler deploy"`) y usa
`apps/server/wrangler.jsonc`: nombre `blockfront`, `main: src/index.ts`, assets en
`../client/dist`. La primera vez queda publicado en `https://blockfront.<subdominio>.workers.dev`.

## 4. Dominio personalizado `blockfront.riverogz.com`

Elegir **una** de las dos opciones y mantenerla. No están aplicadas: `wrangler.jsonc` hoy no tiene
`routes`.

### Opción A: desde el panel

1. Cloudflare → **Workers & Pages** → `blockfront` → **Settings** → **Domains & Routes** →
   **Add** → **Custom domain**.
2. Escribir `blockfront.riverogz.com` y confirmar.
3. Cloudflare crea el registro DNS y el certificado. Si ya existe un registro `blockfront` en la
   zona (un CNAME viejo, por ejemplo), hay que borrarlo antes o el alta falla.

### Opción B: en `apps/server/wrangler.jsonc`

Agregar al objeto raíz y volver a correr el paso 3:

```jsonc
{
  // ...el resto de la configuración actual
  "routes": [{ "pattern": "blockfront.riverogz.com", "custom_domain": true }],
}
```

Con esta opción el dominio queda versionado y se recrea en cada `wrangler deploy`. Es la más
reproducible; la A es más rápida para probar. Opcional en ambos casos: `"workers_dev": false` apaga
la URL `*.workers.dev` para que el juego solo viva en el dominio propio.

## 5. Ajustes de la zona `riverogz.com`

En Cloudflare → `riverogz.com` → **SSL/TLS** → **Edge Certificates**:

- **Always Use HTTPS**: activado.
- **Minimum TLS Version**: TLS 1.2.

Son ajustes de toda la zona: también aplican al museo y al resto de subdominios.

## 6. Checklist después del deploy

- [ ] `https://blockfront.riverogz.com` abre, muestra la pantalla de carga y luego el menú.
- [ ] «Jugar» entra a una partida (TDM 4v4 Soldado por defecto) y los bots se mueven y disparan.
- [ ] `/api/health` responde `{"ok":true}`:

  ```bash
  curl -s https://blockfront.riverogz.com/api/health
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

- [ ] La vista previa social usa `og.png`: `https://blockfront.riverogz.com/og.png` carga, y
      `index.html` ya apunta `og:image` y `og:url` a este dominio.
- [ ] Sin errores en la consola al cargar ni al jugar una partida.

## 7. Costo esperado: $0

- El Worker corre en el plan **Free**. Las peticiones a assets estáticos son gratis e ilimitadas, y
  el juego entero es estático: la simulación y los bots corren en el navegador del jugador.
- Solo `/api/*` invoca el Worker. Hoy eso es `/api/health`, que entra holgado en la cuota diaria de
  peticiones del plan Free; en ese plan, pasarse de la cuota da errores, no cobros.
- `observability.enabled` está activo en `wrangler.jsonc`; en el plan Free los logs tienen su propio
  tope diario y tampoco generan cobro.
- Sin Durable Objects, sin D1, sin KV: no hay nada más que facture.
