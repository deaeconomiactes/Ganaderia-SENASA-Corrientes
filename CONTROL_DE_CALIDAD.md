# Checklist de calidad y publicación

- [ ] Base agregada cargada correctamente
- [ ] No hay datos personales en archivos públicos
- [ ] No hay RENSPA/DNI/CUIT/CUIL en archivos públicos
- [ ] No hay coordenadas exactas visibles
- [ ] Fecha de corte visible (o advertencia “Fecha de corte no informada”)
- [ ] Fuente visible
- [ ] KPIs coinciden con tablas y gráficos
- [ ] Filtros recalculan mapa, KPIs y gráficos
- [ ] Umbral público mínimo aplicado durante la generación de datos
- [ ] El localizador protegido no funciona sin endpoint seguro
- [ ] La exportación no incluye datos sensibles
- [ ] El sitio usa rutas relativas
- [ ] README completo
- [ ] Publicación lista para GitHub Pages
- [ ] Workflow público genera `dist/config.js` desde `config.public.js`
- [ ] No se incluyeron `config.internal.js` ni datos individuales en el artefacto público
- [ ] `productores.json` y `reporte_productores.json` están ignorados por Git
- [ ] El pipeline local reporta filas leídas, coordenadas, negativos, ceros y campos no reconocidos
- [ ] Revisar artefacto final de Actions y archivos inesperados antes de anunciarlo
- [ ] Panel interno de calidad oculto en publicación (`SHOW_INTERNAL_QUALITY_PANEL: false`)
- [ ] Mapa público usa celdas agregadas y no puntos con coordenadas de establecimientos
- [ ] El nivel seleccionado del mapa (grilla/municipio/departamento) mantiene trazabilidad de la agregación
- [ ] No se inventaron polígonos administrativos; GeoJSON oficial pendiente documentado si se requiere coropleta real

## Modo interno (antes de habilitarlo localmente)

- [ ] La fuente individual se encuentra fuera de GitHub Pages y del repositorio
- [ ] `INTERNAL_MODE` sólo está activo en una copia autenticada/local
- [ ] Se validaron origen y precisión de latitud/longitud
- [ ] Se excluyeron coordenadas inválidas (incluido 0,0) y se habilitó clustering
- [ ] Se verificó que no se renderizan titularidad, documentos, contactos ni domicilio
- [ ] Se comprobó que la ficha muestra sólo el identificador operativo enmascarado
- [ ] La copia pública vuelve a `PUBLIC_SAFE_MODE: true` antes de cualquier push
- [ ] Leaflet se carga desde `dist/vendor/leaflet/` y no desde un CDN
- [ ] El contenedor operativo tiene `height` y `min-height` de 620 px en escritorio
- [ ] `map.invalidateSize()` se ejecuta después de hacer visible el contenedor
- [ ] La falla de Leaflet o la ausencia de la base individual muestran un estado visible
- [ ] En modo interno no aparece el selector de “Vista pública”
- [ ] Los filtros primarios muestran especie ganadera, departamento, municipio y oficina local
- [ ] “Filtros avanzados” inicia cerrado y “Limpiar filtros” restaura especie, ubicación, categoría, rango, ceros, selección y vista
- [ ] Cada cluster se puede inspeccionar desde el panel lateral y permite seleccionar una unidad
- [ ] El localizador interno normaliza RENSPA/DNI/CUIT/CUIL sin imprimir ni mostrar el valor completo
- [ ] `searchKeys` sólo existe en la salida interna ignorada y nunca en JSON agregado público
