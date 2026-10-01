# Instrucciones para Codex — Ganadería SENASA

## Alcance y responsabilidad

- Trabajá como responsable técnico de una tarea claramente delimitada. El agente raíz conserva las decisiones, asigna un único responsable por tarea, integra resultados y verifica antes de finalizar.
- Delegá bajo demanda cuando una inspección acotada, investigación enfocada o revisión independiente reduzca el contexto o el riesgo. No delegues automáticamente.
- Acordá el alcance y los archivos asignados antes de editar. No asignes en paralelo a más de un agente la escritura de los mismos archivos; si hay solapamiento, trabajá en secuencia.
- Mantené el contexto raíz en decisiones y síntesis. Pedí a los agentes evidencia concreta y resúmenes breves con archivos, símbolos, supuestos y limitaciones.
- Usá `reviewer` sólo si la complejidad o el riesgo lo amerita; debe revisar de forma independiente y no editar.

## Contexto del repositorio

- Este repositorio contiene un dashboard web para existencias ganaderas de Corrientes. Revisá `README.md` y la documentación específica pertinente antes de cambios de producto o pipeline.
- La aplicación y sus componentes están en `app/`, `components/`, `hooks/` y `lib/`; los scripts de datos y build están en `scripts/`; los controles están en `tests/`; el despliegue público de GitHub Pages publica `dist/`.
- Identificá el origen y el destino de cada cambio. `dist/` contiene artefactos servidos y algunos archivos generados; no edites una salida generada como única fuente de un cambio. Actualizá artefactos sólo cuando el alcance lo requiera y usando el flujo documentado.
- `internal-dist/`, `data/interno/` y los datos individuales son locales y protegidos. No leas bases completas sin necesidad ni copies fuentes XLSX, RENSPA, documentos, contactos, nombres, domicilios o coordenadas exactas a artefactos públicos, logs o commits.
- El dashboard público debe contener datos agregados y respetar el umbral de supresión documentado. No presentes escenarios editables como resultados o precios observados.

## Implementación y verificación

- Preservá cambios preexistentes del usuario: inspeccioná `git status` antes de editar, no los reviertas ni los mezcles con el alcance asignado.
- Preferí cambios pequeños y trazables. Conservá contratos, rutas relativas y separación entre configuración pública (`config.public.js`) e interna (`config.internal.js`).
- Para cambios de código, elegí verificaciones enfocadas según archivos y riesgo; los comandos disponibles incluyen `npm run lint`, `npm run build` y `npm run build:internal`. Revisá los efectos antes de ejecutar generadores que puedan sobrescribir artefactos.
- Si agregás o cambiás comportamiento, actualizá o ejecutá controles pertinentes de `tests/` cuando corresponda. No afirmes que algo fue verificado si no lo ejecutaste.
- Antes de cerrar, el agente responsable integra hallazgos o cambios delegados, inspecciona el diff y reporta las verificaciones y límites pendientes.
