# Despliegue interno operativo

Este artefacto está pensado para un entorno protegido. GitHub Pages sólo debe servir la configuración pública agregada.

## Opción archivo privado

1. Copiar el proyecto a un entorno institucional o privado.
2. Colocar la base original en `data/interno/base_original.xlsx` o `.csv`.
3. Generar la fuente operativa con:

```powershell
node scripts/build-producer-data.mjs "./data/interno/base_original.xlsx"
```

4. Ejecutar:

```powershell
node scripts/build-config.mjs internal
python -m http.server 8000 --directory dist
```

El modo interno aplica por defecto el filtro `totalExistencias > 0` y selecciona
Bovinos. En los controles del mapa se puede activar “Incluir productores con
total cero” para auditar registros sin existencias. Para diagnosticar una carga
  que no muestre puntos, editar temporalmente `config.internal.js` y cambiar
`DEBUG_MAP` a `true`; luego revisar la consola del navegador por el resumen
“Fuente interna normalizada”, “Filtrado operativo por etapas” y “Marcadores
  operativos renderizados”. Los conteos se informan sin identificadores.

La vista interna oculta “Vista pública” y prioriza los slicers de especie
ganadera, departamento, municipio y oficina local. Categoría, mínimo de
existencias e inclusión de ceros están dentro de “Filtros avanzados” (cerrado
por defecto). “Limpiar filtros” restaura todo el estado y la vista provincial.
Los clusters se pueden abrir en el panel lateral para seleccionar una unidad.

El pipeline agrega `searchKeys` normalizadas sólo al JSON interno ignorado.
El localizador acepta RENSPA, DNI, CUIT/CUIL e ID interno; el RENSPA se busca
sin espacios, puntos, guiones ni barras y se muestra siempre enmascarado. No
habilitar esta resolución en un build público.

Para producción, reemplazar el servidor de prueba por un servidor institucional con autenticación, intranet o proxy de acceso.

## Opción API protegida

```powershell
node scripts/build-config.mjs internal `
  --data-url https://dominio-interno/api/productores `
  --locator-endpoint https://dominio-interno/api/secure-locator
```

La API debe autenticar al usuario, registrar auditoría y devolver sólo los campos operativos autorizados. No debe devolver titularidad, documentos, contactos ni datos individuales fuera del alcance del usuario.

## Verificación previa

- Confirmar que el dominio exige login o está dentro de la intranet.
- Confirmar que `dist/config.js` indica `APP_MODE: "internal"`.
- Confirmar que aparece “Modo interno operativo” y “Datos internos cargados”.
- Con `DEBUG_MAP: true`, confirmar que `final` del filtrado operativo es mayor
  que cero para el corte esperado y que `markerGroups` también es mayor que cero.
- Si `final` es cero, el mapa muestra “No hay productores visibles para los
  filtros seleccionados.” y los conteos por etapa permiten identificar si el
  recorte ocurrió por especie, territorio, categoría o mínimo de existencias.
- Confirmar que la fuente individual no está en el repositorio público.
- No reutilizar el artefacto interno en el workflow de GitHub Pages.
