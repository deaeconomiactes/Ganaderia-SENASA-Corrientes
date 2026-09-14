# Dashboard SENASA · Ganadería Corrientes

Dashboard web institucional para explorar existencias ganaderas de Corrientes con filtros territoriales, estadísticas descriptivas y escenarios económicos editables. La vista pública es agregada; existe además una vista interna operativa preparada para registros georreferenciados.

La implementación operativa utiliza Leaflet 1.9.4 desde `dist/vendor/leaflet/`; no depende de un CDN externo para cargar la biblioteca del mapa. La cartografía base sigue siendo OpenStreetMap y requiere conectividad para descargar teselas.

## Dos configuraciones de despliegue

El repositorio mantiene dos plantillas separadas. GitHub Pages siempre genera `dist/config.js` desde `config.public.js` mediante `node scripts/build-config.mjs public`; el usuario final no necesita editar código. La versión interna se genera sólo en un entorno protegido con `node scripts/build-config.mjs internal` y debe recibir allí la fuente individual autorizada.

| Artefacto | Configuración | Datos | Destino |
| --- | --- | --- | --- |
| Público | `config.public.js` | JSON agregado | GitHub Pages |
| Interno | `config.internal.js` | JSON individual protegido o API autenticada | Intranet, servidor institucional, Vercel/Netlify con control de acceso |

`dist/config.js` es el archivo generado que consume `index.html`; no debe editarse manualmente como mecanismo de operación. El workflow público lo vuelve a generar en cada publicación.

## Fuente y alcance

- Fuente declarada: `Existencia Corrientes 7-9.xlsx`.
- El artefacto público es `dist/data/senasa-corrientes.json`, generado con agregación territorial.
- Niveles: provincia, departamento, municipio/oficina local y grilla aproximada de 0,12°.
- Umbral público vigente: mínimo de 5 registros por unidad publicada. Las unidades menores se suprimen durante la generación del JSON.
- Los totales/KPIs públicos se calculan sobre las unidades publicadas después de la supresión; no permiten inferir existencias suprimidas.
- La fuente no informa fecha de corte; el tablero lo muestra como advertencia y no infiere evolución temporal.
- La fecha de actualización del dashboard se mantiene explícita en `dist/config.js`, separada de la fecha de actualización de la fuente.

La auditoría interna de `Existencia Corrientes 7-9.xlsx` identificó aproximadamente 67.457 filas de unidad/UP_RENSPA, 67.351 coordenadas plausibles, 106 coordenadas inválidas, 26 departamentos, 246 municipios y 28 oficinas locales. La fuente contiene identificadores, titularidad, documentos, contactos y coordenadas; por eso no se copia al build público ni al repositorio. No contiene un campo explícito de estado que permita afirmar por sí solo qué unidad es un “productor efectivo”; el modo interno debe aplicar esa regla de negocio antes de mostrar puntos.

## Capas cartográficas y lectura del mapa

- La vista pública inicia en `Municipio · celdas agrupadas`, el nivel más ejecutivo disponible con los datos actuales. La grilla de 0,12° queda como capa secundaria para exploración detallada.
- El selector `Nivel visual` permite cambiar a `Municipio` o `Departamento`. Esas vistas agrupan los valores sobre las mismas celdas visibles para conservar trazabilidad y evitar duplicar geometrías.
- La base disponible contiene centros de grilla, no polígonos administrativos oficiales. Por eso no se inventan límites: el mapa usa celdas agregadas con intensidad de color, escala y tooltips accesibles.
- Para habilitar coropletas con límites reales, incorporar GeoJSON oficial (departamentos/municipios) en `dist/data/geo/` y conectar la ruta relativa en `dist/config.js`. La capa debe conservar el umbral de publicación y no incluir coordenadas exactas de establecimientos.

El panel **Control de calidad de datos** y sus validaciones siguen implementados para revisión interna, pero la publicación está configurada con `SHOW_INTERNAL_QUALITY_PANEL: false`. Para una revisión operativa temporal puede cambiarse a `true` en `dist/config.js`; debe volver a `false` antes de publicar.

## Privacidad y seguridad

Este dashboard está diseñado para publicar únicamente información agregada. La búsqueda por RENSPA, DNI, CUIT o CUIL no debe resolverse desde archivos públicos del frontend. Para habilitar esa función se requiere un servicio seguro, autenticado y auditado, que devuelva únicamente zonas agregadas y nunca datos personales ni productivos individuales.

El repositorio y GitHub Pages no deben contener el XLSX original, RENSPA, DNI, CUIT, CUIL, hashes, nombres de productores, domicilios, coordenadas exactas ni datos individuales. El localizador público funciona en modo restringido cuando `SECURE_LOCATOR_ENDPOINT` es `null`.

## Modo interno operativo

El mapa operativo usa Leaflet/OpenStreetMap y representa unidades productivas como puntos, con clusters inspectables, filtros primarios por especie ganadera/departamento/municipio/oficina y un bloque avanzado (categoría, existencias mínimas e inclusión de ceros). El ranking, el localizador interno y los puntos del mapa comparten la misma selección: al seleccionar una fila se centra el mapa, se resalta el marcador y se abre la ficha desagregada. La base pública no contiene esos registros; el artefacto interno se configura una sola vez por el administrador y el jefe sólo recibe el enlace protegido.

Para probar una copia local controlada, el administrador ejecuta `node scripts/build-config.mjs internal`, coloca la fuente protegida en `dist/data/interno/productores.json` o configura un endpoint seguro, y sirve `dist/`. Esto no debe hacerse sobre el artefacto que se subirá a GitHub Pages. Las coordenadas co-localizadas deben validarse y agruparse antes de uso operativo; no se afirma que sean precisión predial sin metadata de origen.

Si la fuente interna no está configurada, el mapa muestra la base cartográfica de Corrientes con el aviso “Modo interno preparado” y el mensaje “No se encontró la fuente interna de productores. Contacte al administrador del dashboard.” Si Leaflet falla, el contenedor muestra “No se pudo cargar el mapa” en lugar de quedar blanco. Para diagnóstico temporal puede activarse `DEBUG_MAP: true`; los logs sólo informan estado, conteos y cantidad de coordenadas válidas, nunca identificadores. En modo interno no se muestra el selector “Vista pública”: la vista prioriza especie ganadera y ubicación administrativa, mientras que “Filtros avanzados” permanece cerrado hasta que se necesite.

El contrato de normalización acepta un array o `{ "records": [...] }` y detecta aliases como `UP_RENSPA`, `LATITUD`, `LONGITUD`, `DEPTO`, `MUNI`, `OFICINA LOCAL`, totales por especie y categorías ganaderas. El identificador se muestra enmascarado; nunca se renderiza titularidad, DNI, CUIT/CUIL, contacto o dirección.

## Pipeline local de productores

La base original debe colocarse en una ruta local ignorada, por ejemplo `data/interno/base_original.xlsx` o `data/interno/base_original.csv`. El transformador no imprime filas ni identificadores; genera el archivo que consume el artefacto interno y un reporte local:

```powershell
node scripts/build-producer-data.mjs "./data/interno/base_original.xlsx"
```

Salidas predeterminadas:

- `dist/data/interno/productores.json`: registros operativos normalizados para el mapa.
- `dist/data/interno/reporte_productores.json`: conteos, campos detectados, departamentos, advertencias y exclusiones.

También se admite `--output` y `--report`. Para XLSX se usa el lector local `scripts/read-xlsx-json.py` y `openpyxl`; para CSV/TSV se utiliza el parser incluido, sin instalar dependencias de frontend. Las columnas críticas son identificador o RENSPA, departamento, municipio, latitud y longitud, además de al menos una especie o categoría ganadera. No se inventan columnas ni coordenadas.

El pipeline descarta filas sin coordenadas válidas, con existencias negativas o sin identificación/ubicación administrativa. Conserva los ceros como advertencia, enmascara RENSPA y nunca copia DNI, CUIT, CUIL, titularidad o contactos al JSON de salida. La fuente original, `productores.json` y el reporte no deben subirse al repositorio público.

## Ejecución local

Desde `senasa-dashboard/`:

```powershell
python -m http.server 5176 --directory dist
```

Abrir <http://127.0.0.1:5176/>. No usar `file://`: la carga JSON necesita un servidor HTTP.

## Publicación en GitHub Pages

1. Subir este contenido al repositorio DEA `deaeconomiactes/Ganaderia-SENASA-Corrientes`.
2. En GitHub abrir **Settings → Pages** y elegir **GitHub Actions** como fuente de publicación.
3. El workflow `.github/workflows/pages.yml` publica únicamente `dist/` en cada push a `main`.
4. Revisar el artefacto de Actions antes de anunciar el enlace público y confirmar la política de visibilidad del repositorio.

Todas las rutas del sitio son relativas (`./data`, `./config.js`, `./app.js`), por lo que no dependen de ChatGPT Sites ni de un dominio fijo.

## Despliegue interno protegido

1. Crear un proyecto privado en Vercel, Netlify, un servidor institucional o una intranet con autenticación/RBAC.
2. Construir en ese entorno con `node scripts/build-config.mjs internal`. Si la fuente es una API, el administrador puede pasarla sin editar el frontend: `node scripts/build-config.mjs internal --data-url https://dominio-interno/api/productores --locator-endpoint https://dominio-interno/api/secure-locator`.
3. Si la fuente es un archivo, inyectar `dist/data/interno/productores.json` desde almacenamiento privado; si es remota, usar `INTERNAL_PRODUCER_DATA_URL` hacia una API autenticada.
4. Publicar sólo detrás del control de acceso institucional y verificar que el artefacto no quede indexado ni accesible sin login.

El administrador realiza estos pasos una vez. El jefe recibe el enlace interno y sólo ve “Modo interno operativo” y “Datos internos cargados”; no modifica configuraciones ni levanta servidores.

El workflow de GitHub Pages nunca ejecuta el modo interno y siempre regenera la configuración pública antes de subir el artefacto.

## Localizador protegido

La interfaz permite elegir RENSPA, DNI, CUIT/CUIL, ID interno o autodetección. En un build interno sin endpoint, el transformador conserva claves de búsqueda sólo en `data/interno/productores.json` (archivo ignorado) y la UI resuelve la coincidencia en memoria; el RENSPA se normaliza quitando espacios, puntos, guiones y barras, pero se muestra siempre enmascarado. En modo público el formulario nunca resuelve identificadores y sólo muestra el mensaje de función restringida. Para Modo B, configurar `SECURE_LOCATOR_ENDPOINT` en `dist/config.js` y conectar un endpoint HTTPS autenticado que responda únicamente departamento, municipio, oficina local, grilla agregada y un mensaje de autorización. El servicio debe aplicar RBAC, rate limiting, auditoría y minimización de logs.

## Escenarios económicos

Conservador, Base y Alto son simulaciones con supuestos ingresados por el usuario. No representan precios oficiales, facturación real, rentabilidad individual ni flujo de caja.

## Estructura

`dist/index.html` · mapa territorial<br>
`dist/analisis.html` · análisis y escenarios<br>
`dist/app.js` · lógica interactiva y controles de calidad<br>
`dist/config.js` · rutas, provincia, umbral y endpoint seguro<br>
`config.public.js` · plantilla segura usada por GitHub Pages<br>
`config.internal.js` · plantilla para despliegue protegido<br>
`scripts/build-config.mjs` · genera `dist/config.js` para el modo elegido<br>
`dist/data/` · metadata y base agregada pública<br>
`dist/data/geo/` · lugar reservado para GeoJSON oficial opcional<br>
`dist/vendor/leaflet/` · Leaflet local y recursos con licencia BSD-2-Clause<br>
`dist/assets/`, `dist/css/`, `dist/js/` · reservados para extensiones del artefacto estático<br>
`CONTROL_DE_CALIDAD.md` · checklist de publicación
