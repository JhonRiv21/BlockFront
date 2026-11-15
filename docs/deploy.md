# Deploy — Cloudflare Pages (blockfront.riverogz.com)

Pasos para publicar el juego en Cloudflare Pages. Los ejecuta Jhon; ningún agente hace deploy, commit
ni push.

El juego es 100 % estático: la simulación y los bots corren en el navegador del jugador. Pages sirve
`apps/client/dist` tal cual, sin código de servidor. El archivo `apps/client/public/_headers` (Vite lo
copia a `dist/`) define las cabeceras de seguridad, la caché y el `noindex` de las previews.

## 0. Antes de empezar

- Node 22.12 o superior (`.nvmrc` dice 22).
- La zona `riverogz.com` debe estar en la misma cuenta de Cloudflare donde se crea el proyecto.
- Verificaciones completas en local:

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run check:qa-absent   # compila y falla si un hook de QA llega a dist
npm run preview           # build + wrangler pages dev en http://localhost:8788, con _headers aplicado
```

## 1. Crear el proyecto de Pages

Elegir **una** de las dos opciones. Un proyecto creado por subida directa (opción B) **no** se puede
conectar a Git después; si se quiere la A, hay que empezar por la A.

### Opción A (recomendada): conectado a GitHub

Cada push a `main` publica producción, y cada otra rama o PR recibe su propia URL de preview
(`<rama>.blockfront.pages.dev`). No hay tokens que guardar.

1. Hacer push del repo a `JhonRiv21/Blockfront`.
2. Cloudflare → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
3. Autorizar GitHub y elegir `JhonRiv21/Blockfront`.
4. Configuración de build:

   | Campo                  | Valor                     |
   | ---------------------- | ------------------------- |
   | Project name           | `blockfront`              |
   | Production branch      | `main`                    |
   | Framework preset       | None                      |
   | Build command          | `npm run build`           |
   | Build output directory | `apps/client/dist`        |
   | Root directory         | (vacío, la raíz del repo) |
   | Variable de entorno    | `NODE_VERSION` = `22`     |

   Pages instala las dependencias solo con `npm ci` porque existe `package-lock.json`. La variable
   `NODE_VERSION` es redundante con `.nvmrc`, pero deja la versión fija aunque cambie la imagen de
   build.

5. **Save and Deploy**. Queda en `https://blockfront.pages.dev` (si el nombre está tomado, Cloudflare
   le agrega un sufijo; la URL real aparece en el panel).

Opcional: en **Settings** → **Builds** → **Branch control** se puede limitar qué ramas generan
preview.

### Opción B: subida directa desde la máquina

Sin conectar GitHub; se publica lo que haya en local.

```bash
npx wrangler login
npx wrangler whoami        # confirmar que es la cuenta que tiene la zona riverogz.com
npm run deploy:preview     # check:qa-absent + subida a la rama "preview"
npm run deploy             # check:qa-absent + subida a producción (rama main)
```

La primera vez, wrangler pregunta si crea el proyecto `blockfront`: responder que sí, con `main` como
rama de producción. La preview queda en `https://preview.blockfront.pages.dev`.

## 2. Dominio personalizado `blockfront.riverogz.com`

1. Proyecto `blockfront` → **Custom domains** → **Set up a custom domain**.
2. Escribir `blockfront.riverogz.com` y confirmar. Como la zona está en la misma cuenta, Cloudflare
   crea el CNAME y el certificado solo.
3. No crear el CNAME a mano antes: si el dominio no está asociado al proyecto desde este panel, Pages
   responde con error 522. Si ya existe un registro `blockfront` en la zona, borrarlo primero.

`index.html` ya apunta `canonical`, `og:url` y `og:image` a este dominio.

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
      `Content-Security-Policy` en la consola significa que hay que ajustar `_headers`.

## 5. Costo esperado: $0

- Plan **Free** de Pages: sitios estáticos con peticiones y ancho de banda ilimitados.
- Límites que importan: 500 builds al mes (opción A), 20.000 archivos y 25 MiB por archivo. El build
  pesa ~2,5 MB en 186 archivos.
- Sin Functions, Workers, Durable Objects, D1 ni KV: no hay nada que facture.
