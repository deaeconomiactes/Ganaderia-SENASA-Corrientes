# Fuente interna de productores

Esta carpeta del artefacto público sólo contiene documentación y una plantilla vacía. Los datos operativos se generan en `data/interno/` y el empaquetador los copia exclusivamente a `internal-dist/`, que debe estar protegido. No coloque archivos reales aquí.

El mapa interno usa un manifest protegido con fragmentos de índice cartográfico, detalle y búsqueda. El pipeline reconoce `UP_RENSPA`, `PARTIDO`, `LOCALIDAD`, `OFICINA LOCAL`, coordenadas, seis totales por especie y categorías ganaderas.

No copiar aquí el XLSX original ni incluir esta carpeta en GitHub Pages. Un flag JavaScript no protege datos si el archivo se publica como estático; para compartir el modo interno se requiere autenticación, una red privada o un backend seguro que devuelva sólo la información autorizada.

Para generar la base interna use `node scripts/build-producer-data.mjs "./data/interno/SENASA 09_26 agricolas ganaderos y mixtos.xlsx"`. El script crea `data/interno/productores.json` y `data/interno/reporte_productores.json`; ambos están ignorados por Git.
