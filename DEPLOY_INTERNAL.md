# Despliegue interno protegido

Este documento describe el flujo recomendado para entregar el mapa operativo a un usuario no técnico. El jefe recibe únicamente un enlace protegido; no debe editar código, ejecutar scripts ni cargar archivos.

## Separación público / interno

- **GitHub Pages (público):** sirve `dist/` con `config.public.js`. Es una vista agregada, sin productores individuales y sin resolución de RENSPA/DNI/CUIT/CUIL.
- **Hosting interno protegido:** sirve `internal-dist/`, generado localmente. Contiene `config.js`, índice cartográfico, detalle diferido e índice de búsqueda; sólo debe quedar detrás de autenticación, VPN/intranet o un proxy institucional.

`internal-dist/`, `data/interno/` y los archivos individuales están excluidos por `.gitignore`. No se debe forzar su inclusión en el repositorio público.

## Generar el artefacto

Desde la raíz `senasa-dashboard/`, el administrador coloca la fuente original en una ubicación local ignorada y ejecuta:

```powershell
node scripts/build-producer-data.mjs "./data/interno/SENASA 09_26 agricolas ganaderos y mixtos.xlsx"
node scripts/build-internal-dist.mjs
```

El primer comando genera, sin imprimir identificadores, `data/interno/productores.json` y `data/interno/reporte_productores.json`. El segundo comando crea una carpeta separada:

```text
internal-dist/
  index.html
  analisis.html
  app.js
  config.js                 # generado desde config.internal.js
  *.css
  vendor/leaflet/
  data/senasa-corrientes.json
  data/metadata.json
  data/interno/productores.index.manifest.json
  data/interno/productores-index-0000-<hash>.json ...
  data/interno/productores.detail.manifest.json
  data/interno/productores-detail-0000-<hash>.json ...
  data/interno/search-index.json
  data/interno/reporte_productores.json
```

El generador copia sólo los datos públicos agregados y los archivos internos explícitamente autorizados. El frontend descarga al inicio únicamente los fragmentos livianos del índice; cada detalle se solicita al seleccionar un productor y se conserva en caché de sesión por fragmento. Los nombres incluyen un hash para permitir caché acotada sin servir datos de una compilación anterior. El índice de búsqueda sólo existe en este artefacto protegido y nunca se imprime en consola. No modifica `dist/config.js` ni cambia GitHub Pages.

Si los productores viven en una API interna, se puede evitar copiar el JSON y configurar la URL en el artefacto:

```powershell
node scripts/build-internal-dist.mjs `
  --data-url "https://intranet.example/api/productores" `
  --locator-endpoint "https://intranet.example/api/secure-locator"
```

El endpoint debe exigir autenticación, aplicar RBAC, auditar las consultas y devolver sólo campos operativos autorizados. No debe incluir documentos, titularidad, contactos ni coordenadas fuera del alcance del usuario.

También está disponible el alias:

```powershell
npm run build:internal
```

### No mezclar configuraciones

`build-internal-dist.mjs` toma `config.internal.js` directamente y escribe `internal-dist/config.js`. No es necesario ejecutar `node scripts/build-config.mjs internal` para producir este artefacto. Si se ejecutó ese comando por error, restaurar la configuración pública antes de publicar GitHub Pages:

```powershell
node scripts/build-config.mjs public
```

## Opción A — Vercel con protección

1. Generar `internal-dist/` en una máquina administrativa con acceso a la base.
2. Usar el proyecto existente `deaeconomiactes/senasa-ganaderia-interno`. No conectar un workflow público que publique automáticamente `dist/`.
3. Vincular la carpeta local al proyecto existente y publicar el artefacto estático:

   ```powershell
   vercel link --yes --project senasa-ganaderia-interno --cwd internal-dist --scope deaeconomiactes
   vercel --prod --cwd internal-dist --scope deaeconomiactes
   ```

   `build-internal-dist.mjs` conserva `.vercel/` y `.env.local` dentro de la carpeta ignorada para que las reconstrucciones futuras sigan apuntando al mismo proyecto.

4. En **Settings → Deployment Protection**, activar **Vercel Authentication** con alcance **All Deployments** (incluye Production) y autorizar al equipo/correos correspondientes. Verificar que una ventana sin sesión no pueda abrir `index.html`, ninguno de los manifests, `search-index.json` ni ningún fragmento `data/interno/productores-*.json`.
5. Compartir al jefe sólo el dominio protegido. No compartir tokens de despliegue ni el directorio local.

Cuando el proveedor no ofrece autenticación suficiente para el nivel de sensibilidad requerido, usar Vercel detrás de SSO, VPN o un proxy institucional; no convertir el enlace en público.

Referencias: [Deployment Protection de Vercel](https://vercel.com/docs/deployment-protection) y [CLI de Vercel](https://vercel.com/docs/cli/deploy).

## Opción B — Netlify con protección

1. Generar `internal-dist/` y conservarlo fuera del repositorio público.
2. Crear un sitio privado en Netlify y desplegar sólo esa carpeta:

   ```powershell
   npx netlify deploy --dir=internal-dist --prod
   ```

3. Activar la protección disponible para el equipo (password protection, Netlify Identity/SSO o un proxy/VPN institucional, según el plan). Comprobar que los archivos de datos no puedan descargarse sin autenticación.
4. Compartir al jefe el enlace protegido. El sitio ya contiene el `config.js` interno; el usuario no necesita conocer el pipeline.

Si el plan de Netlify no permite una barrera de acceso adecuada, no publicar allí como sitio anónimo: usar intranet o un proxy con autenticación.

Referencia: [despliegues manuales con Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).

## Opción C — servidor institucional / intranet

1. Copiar `internal-dist/` al directorio privado del servidor web (IIS, Nginx, Caddy o equivalente). No copiar el XLSX original ni el repositorio completo.
2. Servir por HTTPS, deshabilitar listados de directorio y exigir SSO, VPN o autenticación institucional antes de cualquier recurso estático.
3. Configurar cabeceras de caché y registro sin incluir query strings ni identificadores completos. Limitar el acceso a los roles autorizados.
4. Entregar al jefe la URL interna. Para retirar el acceso, revocar el rol o retirar el sitio, sin modificar el código del usuario final.

## Qué verá el usuario final

Con la fuente interna válida, verá el mapa operativo de productores, clusters, filtros territoriales, búsqueda interna autorizada y ficha desagregada. La interfaz muestra la etiqueta **Modo interno operativo** y la advertencia de uso interno. Los documentos completos, titulares y contactos no se renderizan.

Si la fuente no está disponible, el sitio muestra un estado vacío explicativo; no inventa coordenadas ni productores. Si la base fue generada sin coordenadas válidas, el reporte local permite corregir la fuente antes de desplegar.

## Verificación antes de compartir el enlace

### Artefacto interno

- Confirmar que existe `internal-dist/config.js` y contiene `APP_MODE: "internal"`, `PUBLIC_SAFE_MODE: false`, `SHOW_PRODUCER_POINTS: true` e `INTERNAL_PRODUCER_DATA_URL` apuntando al origen correcto.
- Confirmar que los manifests `productores.index.manifest.json` y `productores.detail.manifest.json`, `search-index.json` y sus fragmentos existen sólo en la máquina o hosting protegido.
- Abrir el enlace en una ventana sin sesión y comprobar que la protección bloquea `index.html` y la carpeta `data/interno/`.
- Probar filtros, clusters, selección de punto, ranking y cierre de ficha sin exponer identificadores completos.
- Revisar `reporte_productores.json` y resolver advertencias críticas antes de desplegar.

### GitHub Pages público

Después de cualquier trabajo local, dejar explícitamente el build público:

```powershell
node scripts/build-config.mjs public
```

Comprobar:

```powershell
Select-String -Path dist/config.js -Pattern 'APP_MODE|PUBLIC_SAFE_MODE|SHOW_PRODUCER_POINTS|INTERNAL_PRODUCER_DATA_URL'
git status --short --ignored
```

La configuración pública debe indicar `APP_MODE: "public"`, `PUBLIC_SAFE_MODE: true`, `SHOW_PRODUCER_POINTS: false` e `INTERNAL_PRODUCER_DATA_URL: null`. `git status` debe mostrar `internal-dist/` y `data/interno/` como ignorados, nunca como archivos listos para commit. El workflow de Pages sólo debe publicar `dist/`; el manifest y los fragmentos internos no deben aparecer bajo `dist/` versionado.

## Riesgos pendientes

- Un hosting protegido mal configurado puede hacer descargable el JSON interno aunque la UI oculte campos. La seguridad debe comprobarse en el servidor, no sólo en JavaScript.
- Las coordenadas corresponden a la precisión disponible en la fuente; no deben interpretarse como precisión predial sin metadata de origen.
- El localizador interno por claves en memoria es apropiado sólo para un artefacto bajo control de acceso. Para un entorno de mayor riesgo, usar `SECURE_LOCATOR_ENDPOINT` autenticado y no distribuir claves en el frontend.
- OpenStreetMap requiere conectividad para descargar teselas; la intranet debe permitir ese tráfico o configurar un proveedor cartográfico institucional.
- Mantener copias protegidas y rotación de accesos según la política de la DEA.
