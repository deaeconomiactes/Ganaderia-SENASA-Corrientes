import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
const extract = (name) => {
  const singleLine = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[^\\n]*\\}$`, "m"));
  if (singleLine) return singleLine[0];
  const match = source.match(new RegExp(`  (?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(match, `No se encontró ${name}`);
  return match[0];
};
const projectRoot = path.resolve(import.meta.dirname, "..");
const now = "2026-10-01T15:00:00.000Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}

function harness() {
  let blob;
  let filename;
  const elements = new Map();
  const context = {
    Blob, Date: FixedDate, Intl, Set, Map,
    APP_CONFIG: {}, validityReference: "2026-10-01",
    formatNumber: new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }),
    formatDecimal: new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }),
    speciesLabel: (key) => key === "all" ? "Todas las especies" : "Bovinos",
    producerTypeLabel: (key) => ({ ganadero: "Ganadero", mixto: "Mixto", agricola: "Agrícola" })[key],
    validityFilterLabel: (key) => ({ all: "Todos", vigente: "Vigentes", no_vigente: "No vigentes" })[key],
    titleCase: (text) => text,
    escapeHtml: (text) => text,
    canShowFullIdentifiers: () => false, formatIdentifier: (value) => value,
    missingRenspaKeyWarningShown: false,
    performance: { now: () => 0 }, perfLog() {}, mapDebug() {},
    sum: (rows, key) => rows.reduce((total, item) => total + Number(item[key] || 0), 0),
    setTimeout: (callback) => callback(),
    URL: { createObjectURL: (value) => { blob = value; return "blob:test"; }, revokeObjectURL() {} },
    document: { body: { append() {} }, createElement: () => ({ setAttribute() {}, click() { filename = this.download; }, remove() {} }) },
    $: (selector) => {
      if (!elements.has(selector)) elements.set(selector, { value: selector === "#analysisLevelSelect" || selector === "#analysisValidityLevel" ? "department" : "", addEventListener(event, callback) { this[event] = callback; } });
      return elements.get(selector);
    },
  };
  // Execute the production date helper, normalizer, indexes and filtering. Only UI rendering is mocked.
  runInNewContext(readFileSync(new URL("../dist/renspa-validity.js", import.meta.url), "utf8"), context);
  context.validityHelper = context.SENASA_RenspaValidity;
  const validity = source.match(/^  const getRenspaValidity = (.+);$/m)[1];
  runInNewContext(`globalThis.getRenspaValidity = ${validity};`, context);
  const schemas = source.slice(source.indexOf("  const SPECIES"), source.indexOf("  const MAP_VIEW"));
  const functions = ["speciesLabel", "canonicalKey", "normalizeSpeciesKey", "numericValue", "positiveNumber", "speciesValue", "normalizeProducerType", "producerTypeLabel", "validCoordinatePair", "pointInPolygon", "typeEligibleRecords", "getCategoriesForSpecies", "operationalRows", "buildOperationalIndexes", "normalizeProducerData", "detectLivestockFields", "readLivestockValue", "parseCoordinate", "safeText", "safeOperationalId", "normalizeIdentifier", "maskIdentifier", "sumSpecies"].map(extract).join("\n");
  runInNewContext(`${schemas}\n${functions}`, context);
  const formatter = source.match(/  function filterSummary\([^\n]+/)[0];
  runInNewContext(`${formatter}\n${extract("downloadSummary")}`, context);
  return { context, elements, csv: async () => { assert.equal(blob.type, "text/csv;charset=utf-8"); assert.equal(filename, "resumen-agregado-corrientes-2026-10-01.csv"); return blob.text(); } };
}

function setupInternal(context, records, scope, filters) {
  Object.assign(context, {
    readOperationalScope: () => scope,
    readGlobalFilters: () => ({ ...filters }),
    loadInternalProducerSource: async () => ({ allRecords: records, summary: { sourceFile: "fuente-sintetica.xlsx" } }),
    aggregateUnits: () => [], aggregateInternalGrids: () => [],
    setupScenario: () => [], readScenarioSnapshot: () => [], debounce: (callback) => callback,
  });
  for (const name of ["setText", "syncOperationalLocationControls", "renderAnalysisCards", "renderSpecies", "renderBars", "renderScatter", "renderSpatialStatistics", "renderAnalysisDetail", "updateScenario", "renderInsight", "renderInternalValidityComparison", "saveGlobalFilters", "saveOperationalScope", "bindOperationalLocationControls"]) context[name] = () => {};
  runInNewContext(extract("initInternalAnalysis"), context);
}

function parse(csv) {
  return Object.fromEntries(csv.replace(/^\ufeff/, "").split("\n").map((row) => row.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)"$/).slice(1).map((value) => value.replaceAll('""', '"'))));
}

test("el snapshot interno exporta filtros completos, referencia y KPIs sin filas ni geometría", async () => {
  const { context, elements, csv } = harness();
  const polygon = [[-27.123456, -58.654321], [-27.234567, -58.765432], [-27.345678, -58.876543]];
  const privateFields = { titular: "TITULAR_PRIVADO", lat: polygon[0][0], lon: polygon[0][1], departamento: "Capital", municipio: "Corrientes", oficinaLocal: 'Oficina "Centro"' };
  const records = [
    { ...privateFields, id: "IDENTIFICADOR_PRIVADO-1", tipoRenspa: "ganadero", ultimaActualizacionISO: "2025-09-30", especies: { bovinos: 8 }, categorias: { vacas: 6 }, totalExistencias: 8 },
    { ...privateFields, id: "IDENTIFICADOR_PRIVADO-2", tipoRenspa: "mixto", ultimaActualizacionISO: "2025-09-29", especies: { bovinos: 6 }, categorias: { vacas: 5 }, totalExistencias: 6 },
    { ...privateFields, id: "IDENTIFICADOR_PRIVADO-3", tipoRenspa: "ganadero", ultimaActualizacionISO: "2026-09-30", especies: { bovinos: 7 }, categorias: { vacas: 7 }, totalExistencias: 7 },
    { ...privateFields, id: "IDENTIFICADOR_PRIVADO-4", tipoRenspa: "ganadero", ultimaActualizacionISO: "2025-09-28", especies: { bovinos: 20 }, categorias: { vacas: 20 }, totalExistencias: 20 },
  ];
  setupInternal(context, records, { types: ["ganadero", "mixto"], validity: "no_vigente", category: "vacas", minStock: 5, maxStock: 10, polygon }, { species: "bovinos", department: "Capital", municipality: "Corrientes", office: 'Oficina "Centro"' });
  // The internal source has no declared cutoff. A public metadata date must not leak into its description.
  await context.initInternalAnalysis({ metadata: { fecha_corte: "2024-01-01" } });
  elements.get("#downloadSummaryButton").click();
  const result = await csv();
  const fields = parse(result);
  for (const [key, expected] of Object.entries({
    "Tipo RENSPA": "Ganadero + Mixto", "Vigencia": "No vigentes", "Especie": "Bovinos",
    "Departamento": "Capital", "Municipio": "Corrientes", "Oficina local": 'Oficina "Centro"',
    "Categoría": "Vacas", "Rango de existencias": "5–10", "Rango aplicado a": "Vacas", "Polígono": "Activo",
    "Fuente interna": "fuente-sintetica.xlsx", "RENSPA en la fuente interna": "4", "RENSPA filtrados": "2",
    "RENSPA vigentes filtrados": "0", "RENSPA no vigentes filtrados": "2", "Porcentaje de RENSPA vigentes filtrados": "0",
    "Fecha de referencia de vigencia": "2026-10-01", "Ventana de vigencia (días, inclusiva)": "365",
    "Zona horaria de vigencia": "America/Argentina/Buenos_Aires", "Existencias totales filtradas": "14",
    "Fecha de corte": "Fecha de corte no informada",
  })) {
    assert.equal(fields[key], expected, key);
  }
  assert.match(fields["Filtros activos"], /Vigencia: No vigentes/);
  assert.match(fields["Filtros activos"], /Polígono: Activo · 2 RENSPA filtrados$/);
  assert.doesNotMatch(result, /IDENTIFICADOR_PRIVADO|TITULAR_PRIVADO|-27\.123456|-58\.654321|2024-01-01|agregados municipio/);
});

test("el CSV público conserva sus campos, orden y valores", async () => {
  const { context, csv } = harness();
  context.downloadSummary({ data: { metadata: { fecha_corte: "2026-09-01" } }, filters: { species: "bovinos", department: "all", municipality: "", office: "" }, rows: [{}], species: "bovinos", totalSpecies: 10, totalAnimals: 12, records: 2, quality: { label: "Verificado", controls: [{ status: "warning", detail: 'Dato "estimado"' }] }, scenarios: [{ escenario: "Base", valorPorCabeza: 3, costoPorCabeza: 1, valorTotal: 30, costoTotal: 10, resultadoNeto: 20 }] });
  const expectedRows = [
    ["Campo", "Valor"], ["Filtros activos", "Bovinos · Toda la provincia · 1 agregados municipio–oficina · 2 registros"],
    ["Fecha de corte", "2026-09-01"], ["Fecha de descarga", now], ["Existencias totales filtradas", 12],
    ["Existencias Bovinos", 10], ["Registros productivos", 2], ["Cabezas por registro", 5],
    ["Estado de calidad", "Verificado"], ["Advertencias", 'Dato "estimado"'],
    ["Escenario Base · valor por cabeza", 3], ["Escenario Base · costo por cabeza", 1], ["Escenario Base · margen", 2],
    ["Escenario Base · valor total", 30], ["Escenario Base · costo total", 10], ["Escenario Base · resultado neto", 20],
  ];
  const expected = expectedRows.map((row) => row.map((entry) => `"${String(entry).replaceAll('"', '""')}"`).join(",")).join("\n");
  assert.equal(await csv(), expected);
});

test("el porcentaje interno usa la población filtrada y admite cero coincidencias", async () => {
  const { context, csv } = harness();
  const snapshot = { filters: { species: "all", department: "all", municipality: "", office: "" }, rows: [], species: "all", records: 0, totalSpecies: 0, totalAnimals: 0, validity: { total: 0, vigente: 0, noVigente: 0 }, internalScope: { types: ["agricola"], validityFilter: "vigente", category: "", minStock: null, maxStock: null, polygonActive: false, sourceFile: "sintetica.xlsx", sourceRecords: 4, referenceDate: "2026-10-01", validityDays: 365, validityTimezone: "America/Argentina/Buenos_Aires" } };
  context.downloadSummary(snapshot);
  const fields = parse(await csv());
  assert.equal(fields["Porcentaje de RENSPA vigentes filtrados"], "0");
  assert.equal(fields["Tipo RENSPA"], "Agrícola");
  assert.equal(fields["Categoría"], "Todas");
  assert.equal(fields["Rango de existencias"], "0–∞");
  assert.equal(fields["Rango aplicado a"], "Todas las especies");
  assert.equal(fields["Polígono"], "Ninguno");
  assert.equal(fields["RENSPA en la fuente interna"], "4");
  snapshot.records = 2;
  snapshot.validity = { total: 2, vigente: 1, noVigente: 1 };
  snapshot.internalScope.validityFilter = "all";
  context.downloadSummary(snapshot);
  const mixed = parse(await csv());
  assert.equal(mixed["Porcentaje de RENSPA vigentes filtrados"], "50");
  assert.equal(mixed["RENSPA vigentes filtrados"], "1");
  assert.equal(mixed["RENSPA no vigentes filtrados"], "1");
});

test("pipeline, índice interno, helper y CSV coinciden en fechas frontera y filtros combinados", async () => {
  const directory = mkdtempSync(path.join(projectRoot, ".tmp-validity-integration-"));
  try {
    const input = path.join(directory, "fixture.csv");
    const producerData = path.join(directory, "productores.json");
    const reportPath = path.join(directory, "reporte.json");
    const dates = ["2026-10-01", "2025-10-02", "2025-10-01", "2025-09-30", "", "31/02/2026", "2026-10-02", "2024-02-29"];
    const sheets = ["Ganadero", "Mixto", "Agricola", "Ganadero", "Mixto", "Agricola", "Ganadero", "Mixto"];
    const fixture = dates.map((date, index) => ({ sheet: sheets[index], date, department: "Centro", municipality: "Villa", office: "Oficina", lat: -28, lon: -58, bovinos: sheets[index] === "Agricola" ? 0 : 8, ovinos: 0, vacas: sheets[index] === "Agricola" ? 0 : 6 }));
    const base = { ...fixture[0] };
    fixture.push({ ...base, department: "Norte" }, { ...base, lat: -29 }, { ...base, date: "2025-09-30", vacas: 2 }, { ...base, municipality: "Otro" }, { ...base, office: "Otra" }, { ...base, bovinos: 20, vacas: 20 }, { ...base, bovinos: 0, ovinos: 3, vacas: 0 });
    writeFileSync(input, ["__sourceSheet;codigo;departamento;municipio;oficina;latitud;longitud;bovinos;ovinos;vacas;Ultima Actualizacion", ...fixture.map((row, index) => `${row.sheet};SINTETICO-${index};${row.department};${row.municipality};${row.office};${row.lat};${row.lon};${row.bovinos};${row.ovinos};${row.vacas};${row.date}`)].join("\n"));
    const pipeline = spawnSync(process.execPath, [path.join(projectRoot, "scripts/build-producer-data.mjs"), input, "--output", producerData, "--report", reportPath, "--reference-date", "2026-10-01"], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(pipeline.status, 0, pipeline.stderr);
    const payload = JSON.parse(readFileSync(producerData, "utf8"));
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.deepEqual(report.validityCoverage, { total: 15, vigente: 10, noVigente: 5, sinFecha: 2, fechaFutura: 1 });
    const sourceDist = path.join(directory, "source-dist");
    const output = path.join(directory, "output");
    mkdirSync(path.join(sourceDist, "vendor"), { recursive: true });
    mkdirSync(path.join(sourceDist, "data"), { recursive: true });
    for (const file of ["index.html", "analisis.html", "app.js", "renspa-validity.js", "styles.css", "layout-fixes.css", "executive-upgrade.css", "filter-upgrade.css", "bi-upgrade.css", "operational-map.css"]) writeFileSync(path.join(sourceDist, file), "fixture");
    const build = spawnSync(process.execPath, [path.join(projectRoot, "scripts/build-internal-dist.mjs"), "--source-dir", sourceDist, "--output", output, "--producer-data", producerData, "--producer-report", reportPath], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
    const manifest = JSON.parse(readFileSync(path.join(output, "data/interno/productores.index.manifest.json"), "utf8"));
    const wireRows = manifest.chunks.flatMap((chunk) => JSON.parse(readFileSync(path.join(output, chunk.url), "utf8")));
    const { context, elements, csv } = harness();
    const records = context.normalizeProducerData({ records: wireRows, _wireSpecies: manifest.species, _detailChunks: manifest.detailChunks });
    assert.deepEqual(Array.from(records, (record) => record.ultimaActualizacionISO || null), payload.records.map((record) => record.ultimaActualizacionISO));
    assert.deepEqual(Array.from(records, (record) => record.tipoRenspa), payload.records.map((record) => record.tipoRenspa));
    const validities = records.map((record) => context.getRenspaValidity(record));
    assert.deepEqual(Array.from(validities.slice(0, 8), (entry) => entry.status), ["vigente", "vigente", "vigente", "no_vigente", "no_vigente", "no_vigente", "vigente", "no_vigente"]);
    assert.deepEqual(Array.from(validities.slice(0, 4), (entry) => entry.daysSinceUpdate), [0, 364, 365, 366]);
    assert.equal(validities[6].reason, "fecha_futura");
    const scope = { types: ["ganadero", "mixto", "agricola"], validity: "all", category: "", minStock: null, maxStock: null, polygon: null };
    const filters = { species: "all", department: "all", municipality: "", office: "" };
    setupInternal(context, records, scope, filters);
    const exportScope = async () => {
      await context.initInternalAnalysis({ metadata: {} });
      elements.get("#downloadSummaryButton").click();
      return parse(await csv());
    };
    let fields = await exportScope();
    assert.equal(fields["RENSPA filtrados"], "15");
    assert.equal(Number(fields["RENSPA vigentes filtrados"]), report.validityCoverage.vigente);
    assert.equal(Number(fields["RENSPA no vigentes filtrados"]), report.validityCoverage.noVigente);
    scope.types = ["agricola"];
    fields = await exportScope();
    assert.equal(fields["RENSPA filtrados"], "2");
    assert.equal(fields["RENSPA vigentes filtrados"], "1");
    assert.equal(fields["RENSPA no vigentes filtrados"], "1");
    assert.equal(fields["Existencias totales filtradas"], "0");
    Object.assign(scope, { types: ["ganadero", "mixto"], category: "vacas", minStock: 5, maxStock: 10, polygon: [[-28.5, -58.5], [-28.5, -57.5], [-27.5, -57.5], [-27.5, -58.5]] });
    Object.assign(filters, { species: "bovinos", department: "Centro", municipality: "Villa", office: "Oficina" });
    for (const [validity, total, valid, expired] of [["all", 6, 3, 3], ["vigente", 3, 3, 0], ["no_vigente", 3, 0, 3]]) {
      scope.validity = validity;
      fields = await exportScope();
      assert.equal(Number(fields["RENSPA filtrados"]), total, validity);
      assert.equal(Number(fields["RENSPA vigentes filtrados"]), valid, validity);
      assert.equal(Number(fields["RENSPA no vigentes filtrados"]), expired, validity);
      assert.equal(Number(fields["Existencias Bovinos"]), total * 8, validity);
      assert.equal(fields["RENSPA en la fuente interna"], "15");
    }
    assert.doesNotMatch(await csv(), /SINTETICO-|UP-\d+|-28\.5|-58\.5/);
  } finally {
    assert.ok(directory.startsWith(path.join(projectRoot, ".tmp-validity-integration-")));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Análisis y Territorio preservan especie, categoría y alcance durante carga e hidratación", async () => {
  const { context, elements, csv } = harness();
  const storage = new Map();
  context.sessionStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const filters = { species: "ovinos", department: "Centro", municipality: "Villa", office: "Oficina" };
  const polygon = [[-28.5, -58.5], [-28.5, -57.5], [-27.5, -57.5], [-27.5, -58.5]];
  const scope = { types: ["mixto"], validity: "no_vigente", category: "corderos_as", minStock: 5, maxStock: 10, polygon };
  const records = [{ id: "SINTETICO-1", tipoRenspa: "mixto", ultimaActualizacionISO: "2025-09-30", departamento: "Centro", municipio: "Villa", oficinaLocal: "Oficina", lat: -28, lon: -58, especies: { ovinos: 30 }, categorias: { corderos_as: 8 }, totalExistencias: 30 }];
  setupInternal(context, records, scope, filters);
  const persistence = ["defaultFilters", "readGlobalFilters", "saveGlobalFilters", "readOperationalScope", "saveOperationalScope", "syncOperationalLocationControls", "locationValue", "updateCategoryOptions"].map(extract).join("\n");
  runInNewContext(persistence, context);
  context.saveGlobalFilters(filters);
  storage.set("senasa-internal-scope-v1", JSON.stringify(scope));
  await context.initInternalAnalysis({ metadata: {} });
  elements.get("#downloadSummaryButton").click();
  assert.equal(parse(await csv())["Rango aplicado a"], "Corderos/as");
  const before = new Map(storage);
  Object.assign(context.document.body, { classList: { add() {} } });
  context.document.querySelector = () => null;
  context.document.createTextNode = (text) => text;
  context.window = {};
  context.ensureInternalSearchIndex = async () => {};
  for (const name of ["initProducerTypeFilter", "initRenspaValidityFilter", "setOperationalControlsDisabled", "bindOperationalAreaTools", "renderOperationalArea", "setOperationalLoadingStatus"]) context[name] = () => {};
  context.initProducerMap = (state) => (state.map = {});
  context.renderOperationalTerritory = (_data, state) => { state.visible = context.operationalRows(state); if (!state.loading) context.saveOperationalScope(state); };
  runInNewContext(`${extract("initOperationalTerritory")}\n${extract("hydrateOperationalSource")}`, context);
  const state = context.initOperationalTerritory({ municipios: [] }, { records: [], loading: true });
  assert.equal(state.filters.species, "ovinos");
  assert.deepEqual({ ...state.filters }, filters);
  assert.equal(state.category, "corderos_as");
  assert.equal(state.minStock, 5);
  assert.equal(state.maxStock, 10);
  assert.equal(JSON.stringify(state.activePolygon), JSON.stringify(polygon));
  assert.equal(elements.get("#producerCategorySelect").disabled, true);
  assert.deepEqual(storage, before);
  elements.get("#producerCategoryControl").classList = { toggle() {} };
  context.hydrateOperationalSource(state, { records, allRecords: records, summary: {} });
  assert.equal(state.category, "corderos_as");
  assert.equal(state.visible.length, 1, "El rango debe aplicar a 8 corderos, no a los 30 ovinos");
  assert.equal(elements.get("#producerCategorySelect").value, "corderos_as");
  assert.equal(elements.get("#producerMinStock").value, "5");
  assert.equal(elements.get("#producerMaxStock").value, "10");
  assert.deepEqual({ ...state.filters }, filters);
  await context.initInternalAnalysis({ metadata: {} });
  elements.get("#downloadSummaryButton").click();
  assert.equal(parse(await csv())["RENSPA filtrados"], "1");
  storage.set("senasa-internal-scope-v1", JSON.stringify({ ...scope, category: "categoria_inexistente" }));
  const invalid = context.initOperationalTerritory({ municipios: [] }, { records: [], loading: true });
  assert.equal(invalid.category, "categoria_inexistente", "Se conserva hasta conocer la fuente");
  context.hydrateOperationalSource(invalid, { records, allRecords: records, summary: {} });
  assert.equal(invalid.category, "", "Una categoría ausente realmente se limpia tras hidratar");
  assert.equal(invalid.visible.length, 0, "El rango vuelve a aplicar a la especie al limpiar una categoría inválida");
});
