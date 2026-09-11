# Capas geográficas opcionales

Este directorio está reservado para capas oficiales que permitan dibujar límites administrativos reales (por ejemplo, GeoJSON de departamentos o municipios de Corrientes).

Condiciones para incorporarlas:

- usar rutas relativas desde `dist/`;
- documentar fuente, fecha y licencia del GeoJSON;
- mantener el umbral mínimo de registros antes de publicar una unidad territorial;
- no incluir coordenadas exactas, RENSPA, DNI, CUIT, CUIL ni datos individuales;
- actualizar la lógica de mapa para unir la geometría con las claves territoriales disponibles (`departamento`, `municipio`).

Mientras no exista una capa oficial compatible, el dashboard utiliza las celdas agregadas de 0,12° presentes en la base pública. No se generan límites administrativos artificiales.
