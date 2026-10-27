# Instrucciones para Codex — Ganadería SENASA

## Alcance y responsabilidad

- El agente raíz define alcance, riesgos, criterios de aceptación y plan de verificación; conserva las decisiones, integra entregas y comunica el resultado. Resuelve directamente tareas pequeñas y bien acotadas.
- Delegá bajo demanda sólo cuando una inspección acotada, investigación enfocada, análisis autorizado o revisión independiente reduzca contexto o riesgo. No delegues automáticamente.
- Por defecto, no delegues. Si hace falta, usá como máximo un subagente activo y una sola ronda de delegación por tarea. No pidas a agentes distintos que repitan el mismo análisis; asigná un único responsable por archivo y fijá objetivo, alcance, restricciones y resultado esperado.
- Antes de delegar, asigná objetivo, fuentes autorizadas, preguntas, archivos bajo responsabilidad, límites, entregables y formato de síntesis. Asigná un único responsable de edición por archivo; si hay dependencias o solapamiento, trabajá en secuencia.
- Usá `explorer` para búsquedas acotadas de código y contexto sin perfilar datos; `researcher` para una pregunta concreta en documentación oficial; `analyst` con Luna para calidad o cálculos acotados sobre datos autorizados; `worker` con Luna para una implementación independiente y bien delimitada.
- Escalá a `sol_specialist` con GPT-6.1 Sol Medium sólo para decisiones arquitectónicas, cambios transversales, pipelines complejos, análisis persistentes o debugging que Terra no resuelva satisfactoriamente. No uses Sol como paso obligatorio.
- No invoques `reviewer` con Astra automáticamente. Reservalo para una petición manual del usuario o un problema excepcionalmente complejo que siga sin resolverse después de Sol.
- Dejá las inspecciones extensas y cálculos en manos del perfil especializado cuando aporten valor. Pedí evidencia trazable y síntesis breve, no volcados de datos crudos. Revisá críticamente hallazgos y supuestos antes de convertirlos en cambios o recomendaciones.
- Los subagentes heredan los permisos y el modo de aprobación de la sesión principal. Las instrucciones de un perfil no crean un entorno aislado ni garantizan sólo lectura; elegí los permisos de la sesión antes de delegar.
- `.codex/config.toml` define el modelo predeterminado del proyecto y los valores iniciales de subagentes; los perfiles personalizados pueden fijar su propio modelo. Si el usuario selecciona manualmente otro modelo en Codex, respetá esa selección y no intentes volver al predeterminado.
- Conservá el contexto: no leas el repositorio ni los datasets completos sin una razón concreta; localizá primero los archivos relevantes y devolvé síntesis breves. Al delegar, pasá sólo objetivo, fuentes autorizadas, archivos, estado, restricciones, hallazgos y pregunta específica necesarios.
- Ajustá la verificación al riesgo: cambios pequeños requieren comprobaciones específicas; cambios transversales o sensibles, una revisión más amplia. No ejecutes un reviewer independiente en cada modificación.

## Contexto del repositorio

- Este repositorio contiene un dashboard web para existencias ganaderas de Corrientes. Revisá `README.md` y la documentación específica pertinente antes de cambios de producto o pipeline.
- La aplicación y sus componentes están en `app/`, `components/`, `hooks/` y `lib/`; los scripts de datos y build están en `scripts/`; los controles están en `tests/`; el despliegue público de GitHub Pages publica `dist/`.
- Identificá el origen y el destino de cada cambio. `dist/` contiene artefactos servidos y algunos archivos generados; no edites una salida generada como única fuente de un cambio. Actualizá artefactos sólo cuando el alcance lo requiera y usando el flujo documentado.
- `internal-dist/`, `data/interno/` y los datos individuales son locales y protegidos. No leas bases completas sin necesidad ni copies fuentes XLSX, RENSPA, documentos, contactos, nombres, domicilios o coordenadas exactas a artefactos públicos, logs o commits.
- El workspace SENASA puede contener fuentes individuales fuera de este repositorio. No recorras ni abras planillas completas desde el agente raíz; delegá sólo la extracción o el análisis mínimo autorizado y devolvé agregados, cobertura y limitaciones sin exponer registros.
- El dashboard público debe contener datos agregados y respetar el umbral de supresión documentado. No presentes escenarios editables como resultados o precios observados.

## Implementación y verificación

- Preservá cambios preexistentes del usuario: inspeccioná `git status` antes de editar, no los reviertas ni los mezcles con el alcance asignado.
- Preferí cambios pequeños y trazables. Conservá contratos, rutas relativas y separación entre configuración pública (`config.public.js`) e interna (`config.internal.js`).
- Para cambios de código, elegí verificaciones enfocadas según archivos y riesgo; los comandos disponibles incluyen `npm run lint`, `npm run build` y `npm run build:internal`. Revisá los efectos antes de ejecutar generadores que puedan sobrescribir artefactos.
- Si agregás o cambiás comportamiento, actualizá o ejecutá controles pertinentes de `tests/` cuando corresponda. No afirmes que algo fue verificado si no lo ejecutaste.
- Antes de cerrar, el agente responsable integra hallazgos o cambios delegados, inspecciona el diff y reporta las verificaciones y límites pendientes.

## Política de modelos y eficiencia

- Modelo principal predeterminado: GPT-6.1 Terra Medium para el trabajo cotidiano del repositorio.
- Luna es la opción habitual para búsquedas, triage, documentación, análisis autorizado acotado y cambios mecánicos.
- Sol es un escalamiento selectivo para las tareas complejas descritas arriba; Astra no se inicia automáticamente.
- Esta política busca reducir consumo innecesario, pero no garantiza una duración fija de sesión: los límites de uso dependen de la cuenta y del consumo acumulado en todos sus proyectos.
