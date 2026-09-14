# Fuente interna de productores

Esta carpeta está reservada para una copia local o autenticada de datos operativos. Su contenido está excluido del repositorio (`.gitignore`) porque puede incluir UP/RENSPA, titularidad, documentos, contactos y coordenadas. `productores.example.json` es sólo una plantilla vacía y no contiene datos reales.

El mapa interno espera que `APP_CONFIG.INTERNAL_PRODUCER_DATA_URL` apunte a un JSON local con una lista `records` (o un array directo). Los campos mínimos son latitud y longitud, más una identificación operativa y existencias. El normalizador detecta aliases como `UP_RENSPA`, `LATITUD`, `LONGITUD`, `DEPTO`, `MUNI`, `OFICINA LOCAL`, `BOVINOS`, `BUBALINOS`, `OVINOS`, `CAPRINOS`, `PORCINOS`, `EQUINOS` y categorías ganaderas.

No copiar aquí el XLSX original ni incluir esta carpeta en GitHub Pages. Un flag JavaScript no protege datos si el archivo se publica como estático; para compartir el modo interno se requiere autenticación, una red privada o un backend seguro que devuelva sólo la información autorizada.

Para generar el archivo desde la base original use `node scripts/build-producer-data.mjs "./data/interno/base_original.xlsx"`. El script crea `productores.json` y `reporte_productores.json`; ambos están ignorados por Git.
