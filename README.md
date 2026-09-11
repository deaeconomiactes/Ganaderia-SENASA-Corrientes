# Dashboard SENASA · Ganadería Corrientes

Dashboard web institucional para explorar existencias ganaderas de Corrientes con filtros territoriales, mapa de grillas agregadas, estadísticas descriptivas y escenarios económicos editables.

## Fuente y alcance

- Fuente declarada: `Existencia Corrientes 7-9.xlsx`.
- El artefacto público es `dist/data/senasa-corrientes.json`, generado con agregación territorial.
- Niveles: provincia, departamento, municipio/oficina local y grilla aproximada de 0,12°.
- Umbral público vigente: mínimo de 5 registros por unidad publicada. Las unidades menores se suprimen durante la generación del JSON.
- Los totales/KPIs públicos se calculan sobre las unidades publicadas después de la supresión; no permiten inferir existencias suprimidas.
- La fuente no informa fecha de corte; el tablero lo muestra como advertencia y no infiere evolución temporal.
- La fecha de actualización del dashboard se mantiene explícita en `dist/config.js`, separada de la fecha de actualización de la fuente.

## Capas cartográficas y lectura del mapa

- La vista pública inicia en `Municipio · celdas agrupadas`, el nivel más ejecutivo disponible con los datos actuales. La grilla de 0,12° queda como capa secundaria para exploración detallada.
- El selector `Nivel visual` permite cambiar a `Municipio` o `Departamento`. Esas vistas agrupan los valores sobre las mismas celdas visibles para conservar trazabilidad y evitar duplicar geometrías.
- La base disponible contiene centros de grilla, no polígonos administrativos oficiales. Por eso no se inventan límites: el mapa usa celdas agregadas con intensidad de color, escala y tooltips accesibles.
- Para habilitar coropletas con límites reales, incorporar GeoJSON oficial (departamentos/municipios) en `dist/data/geo/` y conectar la ruta relativa en `dist/config.js`. La capa debe conservar el umbral de publicación y no incluir coordenadas exactas de establecimientos.

El panel **Control de calidad de datos** y sus validaciones siguen implementados para revisión interna, pero la publicación está configurada con `SHOW_INTERNAL_QUALITY_PANEL: false`. Para una revisión operativa temporal puede cambiarse a `true` en `dist/config.js`; debe volver a `false` antes de publicar.

## Privacidad y seguridad

Este dashboard está diseñado para publicar únicamente información agregada. La búsqueda por RENSPA, DNI, CUIT o CUIL no debe resolverse desde archivos públicos del frontend. Para habilitar esa función se requiere un servicio seguro, autenticado y auditado, que devuelva únicamente zonas agregadas y nunca datos personales ni productivos individuales.

El repositorio y GitHub Pages no deben contener el XLSX original, RENSPA, DNI, CUIT, CUIL, hashes, nombres de productores, domicilios, coordenadas exactas ni datos individuales. El localizador público funciona en modo restringido cuando `SECURE_LOCATOR_ENDPOINT` es `null`.

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

## Localizador protegido

La interfaz permite elegir RENSPA, DNI, CUIT/CUIL o autodetección, pero no almacena el valor ni lo resuelve desde el frontend estático. Para Modo B, configurar `SECURE_LOCATOR_ENDPOINT` en `dist/config.js` y conectar un endpoint HTTPS autenticado que responda únicamente departamento, municipio, oficina local, grilla agregada y un mensaje de autorización. El servicio debe aplicar RBAC, rate limiting, auditoría y minimización de logs.

## Escenarios económicos

Conservador, Base y Alto son simulaciones con supuestos ingresados por el usuario. No representan precios oficiales, facturación real, rentabilidad individual ni flujo de caja.

## Estructura

`dist/index.html` · mapa territorial<br>
`dist/analisis.html` · análisis y escenarios<br>
`dist/app.js` · lógica interactiva y controles de calidad<br>
`dist/config.js` · rutas, provincia, umbral y endpoint seguro<br>
`dist/data/` · metadata y base agregada pública<br>
`dist/data/geo/` · lugar reservado para GeoJSON oficial opcional<br>
`dist/assets/`, `dist/css/`, `dist/js/` · reservados para extensiones del artefacto estático<br>
`CONTROL_DE_CALIDAD.md` · checklist de publicación
