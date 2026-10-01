#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./sites-env.mjs";

const SPECIES = ["bovinos", "bubalinos", "ovinos", "caprinos", "porcinos", "equinos"];
const CATEGORY_SCHEMA = {
  bovinos: { vacas: ["vacas", "vaca"], vaquillonas: ["vaquillonas", "vaquillona"], novillos: ["novillos", "novillo"], novillitos: ["novillitos", "novillito"], terneros: ["terneros", "ternero"], terneras: ["terneras", "ternera"], toros: ["toros", "toro"], bueyes: ["bueyes", "buey"], toritos_mej: ["toritosmej"] },
  bubalinos: { vacas_bub: ["vacasbub"], toros_bub: ["torosbub"], bueyes_bub: ["bueyesbub"], novillos_bub: ["novillosbub"], novillitos_bub: ["novillitosbub"], vaquillonas_bub: ["vaquillonasbub"], toritos_mej_bub: ["toritosmejbub"], terneros_bub: ["ternerosbub"], terneras_bub: ["ternerasbub"] },
  ovinos: { carneros: ["carneros", "carnero"], borregos_as: ["borregosas"], capones_ov: ["caponesov"], corderos_as: ["corderosas"] },
  caprinos: { chivos: ["chivos", "chivo"], cabrillas_chivitos: ["cabrillaschivitos"], cabritos: ["cabritos", "cabrito"], capones_capr: ["caponescapr"] },
  porcinos: { cerdas: ["cerdas", "cerda"], lechones: ["lechones", "lechon"], capones_po_hembras_sin_servicio: ["caponespohembrassinservicio"], padrillos_po: ["padrillospo"] },
  equinos: { yeguas: ["yeguas", "yegua"], asnos: ["asnos", "asno"], burros: ["burros", "burro"], mulas: ["mulas", "mula"], padrillos_eq: ["padrilloseq"], potrillos_as: ["potrillosas"], equinos: ["equinos"] },
};
const CATEGORY_ALIASES = Object.assign({}, ...Object.values(CATEGORY_SCHEMA));
const TYPE_BY_SHEET = { agricola: "agricola", ganadero: "ganadero", mixto: "mixto" };
const args = process.argv.slice(2);
const sourceArg = args.find((arg) => !arg.startsWith("--"));
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const outputArg = option("--output") || "data/interno/productores.json";
const reportArg = option("--report") || "data/interno/reporte_productores.json";
const referenceDate = option("--reference-date") || (() => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
})();
if (!isCalendarDate(referenceDate)) fail("--reference-date debe tener formato YYYY-MM-DD y ser una fecha válida.");
const cutoffDate = shiftCalendarDate(referenceDate, -365);

if (!sourceArg || args.includes("--help")) {
  console.log("Uso: node scripts/build-producer-data.mjs RUTA_FUENTE [--output RUTA] [--report RUTA] [--reference-date YYYY-MM-DD]");
  console.log('Ejemplo: node scripts/build-producer-data.mjs "./data/interno/SENASA_Ctes.xlsx"');
  process.exit(sourceArg ? 0 : 2);
}

const source = path.resolve(process.cwd(), sourceArg);
const output = path.resolve(process.cwd(), outputArg);
const reportPath = path.resolve(process.cwd(), reportArg);
if (!existsSync(source)) fail(`No existe la fuente indicada: ${sourceArg}`);

const rows = loadRows(source);
if (!rows.length) fail("La fuente no contiene filas de datos.");
const headers = Object.keys(rows[0]).filter((header) => header !== "__sourceSheet");
const fields = detectFields(headers);
const required = ["idOrRenspa", "departamento", "municipio", "lat", "lon", "ultimaActualizacion"];
const missing = required.filter((field) => !fields[field]);
if (missing.length) fail(`Faltan columnas críticas: ${missing.join(", ")}. Revise las cabeceras reales de la base.`);
if (!Object.keys(fields.species).length && !Object.keys(fields.categories).length) fail("No se detectó ninguna columna de especie o categoría ganadera. La base no puede alimentar el mapa operativo.");

const report = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(source),
  outputFile: path.relative(process.cwd(), output),
  rowsRead: rows.length,
  renspaTypeCoverage: { agricola: 0, ganadero: 0, mixto: 0, total: 0 },
  validityCoverage: { total: 0, vigente: 0, noVigente: 0, sinFecha: 0, fechaFutura: 0 },
  validityReferenceDate: referenceDate,
  validityWindowDays: 365,
  validityCutoffDate: cutoffDate,
  ultimaActualizacionMin: null,
  ultimaActualizacionMax: null,
  sourceSheets: {},
  validProducers: 0,
  withValidCoordinates: 0,
  withoutCoordinates: 0,
  negativeExistenceRows: 0,
  totalZeroRows: 0,
  duplicateSourceIdentifierRows: 0,
  missingIdentifierRows: 0,
  missingAdministrativeRows: 0,
  identifierCoverage: Object.fromEntries(
    ["renspa", "dni", "cuit", "cuil", "document", "cuit_cuil", "internal_id"].map((type) => [type, {
      sourceRows: 0,
      validRows: 0,
      outputRows: 0,
      distinctValues: 0,
      duplicateRows: 0,
    }]),
  ),
  departments: {},
  recognizedFields: summarizeFields(fields),
  unrecognizedFields: headers.filter((header) => !fields.recognized.has(canonical(header))),
  missingColumns: [],
  warnings: [],
};

const seenIdentifiers = new Set();
const seenSearchKeys = Object.fromEntries(Object.keys(report.identifierCoverage).map((type) => [type, new Set()]));
const records = [];
rows.forEach((row, index) => {
  const sourceSheet = cleanValue(row.__sourceSheet);
  const typeEntry = TYPE_BY_SHEET[canonical(sourceSheet)];
  if (sourceSheet && !typeEntry) fail(`Hoja de origen no reconocida: ${sourceSheet}`);
  const tipoRenspa = typeEntry || "ganadero";
  const tipoRenspaLabel = tipoRenspa === "agricola" ? "Agrícola" : tipoRenspa === "mixto" ? "Mixto" : "Ganadero";
  const sheetReport = report.sourceSheets[sourceSheet || "Fuente"] ||= { rows: 0, validProducers: 0, coordinateRows: 0, uniqueRenspa: new Set(), duplicateRenspaRows: 0, speciesExistences: Object.fromEntries(SPECIES.map((key) => [key, 0])) };
  sheetReport.rows += 1;
  const sourceIdentifier = cleanValue(valueAt(row, fields.idOrRenspa));
  const renspa = cleanValue(valueAt(row, fields.renspa));
  if (renspa && sheetReport.uniqueRenspa.has(renspa)) sheetReport.duplicateRenspaRows += 1;
  else if (renspa) sheetReport.uniqueRenspa.add(renspa);
  const identifiers = { renspa, dni: cleanValue(valueAt(row, fields.dni)), cuit: cleanValue(valueAt(row, fields.cuit)), cuil: cleanValue(valueAt(row, fields.cuil)), cuitCuil: cleanValue(valueAt(row, fields.cuitCuil)), document: cleanValue(valueAt(row, fields.document)) };
  const name = cleanValue(valueAt(row, fields.name));
  const legalName = cleanValue(valueAt(row, fields.legalName));
  const person = { name, legalName, displayName: name || legalName };
  const searchKeys = buildSearchKeys(row, fields, { renspa, sourceIdentifier });
  updateIdentifierCoverage(report.identifierCoverage, searchKeys, seenSearchKeys, false);
  if (sourceIdentifier && seenIdentifiers.has(sourceIdentifier)) report.duplicateSourceIdentifierRows += 1;
  if (sourceIdentifier) seenIdentifiers.add(sourceIdentifier);
  const lat = parseCoordinate(valueAt(row, fields.lat), "lat");
  const lon = parseCoordinate(valueAt(row, fields.lon), "lon");
  const coordinatesValid = Number.isFinite(lat) && Number.isFinite(lon);
  if (!coordinatesValid) report.withoutCoordinates += 1;
  else report.withValidCoordinates += 1;
  if (coordinatesValid) sheetReport.coordinateRows += 1;
  const rawNumericValues = [...SPECIES.map((species) => parseNumeric(valueAt(row, fields.species[species]))), ...Object.values(fields.categories).map((field) => parseNumeric(valueAt(row, field)))];
  if (rawNumericValues.some((value) => Number.isFinite(value) && value < 0)) { report.negativeExistenceRows += 1; return; }
  const values = {
    especies: Object.fromEntries(SPECIES.map((species) => [species, positiveNumber(valueAt(row, fields.species[species]))])),
    categorias: Object.fromEntries(Object.entries(fields.categories).map(([category, field]) => [category, positiveNumber(valueAt(row, field))])),
  };
  SPECIES.forEach((species) => { sheetReport.speciesExistences[species] += values.especies[species]; });
  const totalExistencias = sum(Object.values(values.especies)) || sum(Object.values(values.categorias));
  if (totalExistencias === 0) report.totalZeroRows += 1;
  const departamento = cleanValue(valueAt(row, fields.departamento));
  const municipio = cleanValue(valueAt(row, fields.municipio));
  if (!sourceIdentifier) { report.missingIdentifierRows += 1; return; }
  if (!departamento || !municipio) { report.missingAdministrativeRows += 1; return; }
  report.validProducers += 1;
  sheetReport.validProducers += 1;
  report.departments[departamento] = (report.departments[departamento] || 0) + 1;
  const ultimaActualizacionISO = parseUpdateDate(valueAt(row, fields.ultimaActualizacion));
  report.validityCoverage.total += 1;
  if (!ultimaActualizacionISO) {
    report.validityCoverage.noVigente += 1;
    report.validityCoverage.sinFecha += 1;
  } else {
    if (!report.ultimaActualizacionMin || ultimaActualizacionISO < report.ultimaActualizacionMin) report.ultimaActualizacionMin = ultimaActualizacionISO;
    if (!report.ultimaActualizacionMax || ultimaActualizacionISO > report.ultimaActualizacionMax) report.ultimaActualizacionMax = ultimaActualizacionISO;
    if (ultimaActualizacionISO > referenceDate) report.validityCoverage.fechaFutura += 1;
    if (ultimaActualizacionISO >= cutoffDate) report.validityCoverage.vigente += 1;
    else report.validityCoverage.noVigente += 1;
  }
  const sequence = String(index + 1).padStart(6, "0");
  updateIdentifierCoverage(report.identifierCoverage, searchKeys, seenSearchKeys, true);
  records.push({
    id: `UP-${sequence}`,
    tipoRenspa,
    tipoRenspaLabel,
    ultimaActualizacionISO,
    displayId: renspa ? `RENSPA ${maskIdentifier(renspa)}` : `Unidad operativa ${sequence}`,
    renspaMasked: renspa ? maskIdentifier(renspa) : "",
    searchKeys,
    identifiers,
    person,
    establecimiento: cleanValue(valueAt(row, fields.establecimiento)),
    otherData: Object.fromEntries(report.unrecognizedFields.map((field) => [field, cleanValue(row[field])]).filter(([, value]) => value)),
    lat, lon, departamento, municipio,
    oficinaLocal: cleanValue(valueAt(row, fields.oficina)),
    paraje: cleanValue(valueAt(row, fields.paraje)),
    totalExistencias,
    especies: values.especies,
    categorias: values.categorias,
  });
});

for (const [sheetName, sheet] of Object.entries(report.sourceSheets)) {
  const uniqueRenspa = sheet.uniqueRenspa.size;
  report.renspaTypeCoverage[canonical(sheetName)] = uniqueRenspa;
  sheet.uniqueRenspa = uniqueRenspa;
}
report.renspaTypeCoverage.total = ["agricola", "ganadero", "mixto"].reduce((total, type) => total + report.renspaTypeCoverage[type], 0);

for (const [type, values] of Object.entries(seenSearchKeys)) report.identifierCoverage[type].distinctValues = values.size;

if (!records.length) report.warnings.push("No se generaron productores con ubicación administrativa e identificador.");
if (report.withoutCoordinates) report.warnings.push(`${report.withoutCoordinates} filas se conservaron para búsqueda y ficha, pero no pueden mostrarse como puntos por coordenadas inválidas o ausentes.`);
if (report.negativeExistenceRows) report.warnings.push(`${report.negativeExistenceRows} filas quedaron fuera por existencias negativas.`);
if (report.totalZeroRows) report.warnings.push(`${report.totalZeroRows} productores válidos tienen existencias totales iguales a cero.`);
if (report.missingIdentifierRows) report.warnings.push(`${report.missingIdentifierRows} filas con coordenadas no tienen identificador o RENSPA.`);
if (report.missingAdministrativeRows) report.warnings.push(`${report.missingAdministrativeRows} filas con coordenadas no tienen departamento y/o municipio.`);
if (report.unrecognizedFields.length) report.warnings.push("Hay columnas no reconocidas; revisar el reporte local antes de usar la fuente.");
if (report.validityCoverage.sinFecha) report.warnings.push(`${report.validityCoverage.sinFecha} productores no tienen una fecha de actualización válida; se clasifican como no vigentes.`);
if (report.validityCoverage.fechaFutura) report.warnings.push(`${report.validityCoverage.fechaFutura} productores tienen fecha de actualización futura respecto de ${referenceDate}; se conservan como vigentes y requieren revisión.`);

mkdirSync(path.dirname(output), { recursive: true });
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(output, JSON.stringify({ records }, null, 2), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Filas leídas: ${report.rowsRead}`);
console.log(`Productores válidos generados: ${report.validProducers}`);
console.log(`Con coordenadas válidas: ${report.withValidCoordinates}`);
console.log(`Sin coordenadas: ${report.withoutCoordinates}`);
console.log(`Filas con existencias negativas: ${report.negativeExistenceRows}`);
console.log(`Productores con total cero: ${report.totalZeroRows}`);
console.log(`Vigencia al ${referenceDate}: ${report.validityCoverage.vigente} vigentes, ${report.validityCoverage.noVigente} no vigentes, ${report.validityCoverage.sinFecha} sin fecha y ${report.validityCoverage.fechaFutura} fechas futuras.`);
console.log(`Salida: ${path.relative(process.cwd(), output)}`);
console.log(`Reporte: ${path.relative(process.cwd(), reportPath)}`);

function loadRows(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".csv" || extension === ".tsv") return parseCsv(readFileSync(file, "utf8"), extension === ".tsv" ? "\t" : undefined);
  if (extension === ".xlsx") {
    const helper = path.join(projectRoot, "scripts", "read-xlsx-json.py");
    const python = process.platform === "win32" ? "python" : "python3";
    const result = spawnSync(python, [helper, file], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
    if (result.error || result.status !== 0) fail(result.stderr?.trim() || "No se pudo leer el XLSX. Verifique Python y openpyxl.");
    try { return JSON.parse(result.stdout); } catch { fail("El lector XLSX devolvió un resultado inválido."); }
  }
  fail("Formato no soportado. Use .xlsx, .csv o .tsv.");
}

function parseCsv(text, explicitDelimiter) {
  const input = text.replace(/^\uFEFF/, "");
  const delimiter = explicitDelimiter || detectDelimiter(input);
  const table = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]; const next = input[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell); if (row.some((value) => value.trim())) table.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); table.push(row); }
  const headers = (table.shift() || []).map((header) => header.trim());
  return table.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function detectDelimiter(text) { const firstLine = text.split(/\r?\n/, 1)[0]; return [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]; }
function detectFields(headers) {
  const find = (aliases) => aliases.map((alias) => headers.find((header) => canonical(header) === alias)).find(Boolean);
  const speciesAliases = { bovinos: ["bovinos", "bovino", "bov"], bubalinos: ["bubalinos", "bubalino", "bufalos", "bufalo"], ovinos: ["ovinos", "ovino", "ovejas"], caprinos: ["caprinos", "caprino", "cabras"], porcinos: ["porcinos", "porcino", "cerdos"], equinos: ["equinos", "equino", "caballos"] };
  const id = find(["idproductor", "productorid", "idunidad", "unidadid", "idregistro", "registroid", "codigooperativo", "codigo", "id"]);
  const renspa = find(["renspa", "renspanro", "renspanumero", "uprenspa"]);
  const dni = find(["dni", "nrodni", "dninro", "numerodni", "documentoidentidad"]);
  const cuit = find(["cuit", "nrocuit", "cuitnro", "numerocuit"]);
  const cuil = find(["cuil", "nrocuil", "cuilnro", "numerocuil"]);
  const cuitCuil = find(["cuitcuil", "cuitocuil", "cuitcuilnro", "nrocuitcuil", "numerocuitcuil", "cuitltitularup"]);
  const document = find(["documento", "documentonro", "documentonumero", "nrodocumento", "numerodocumento", "nrodoc", "numdoc", "titulardocumento", "docproductor"]);
  const name = find(["nombre", "productor", "titular", "nombreproductor", "apellidonombre", "nombreapellido", "nombretitular", "titularproductor", "propietario"]);
  const legalName = find(["razonsocial"]);
  const recognized = new Set([id, renspa, dni, cuit, cuil, cuitCuil, document, name, legalName].filter(Boolean).map(canonical));
  const species = Object.fromEntries(Object.entries(speciesAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field));
  const categories = Object.fromEntries(Object.entries(CATEGORY_ALIASES).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field));
  const fields = { idOrRenspa: id || renspa, id, renspa, dni, cuit, cuil, cuitCuil, document, name, legalName, ultimaActualizacion: find(["ultimaactualizacion"]), establecimiento: find(["establecimiento", "nombreestablecimiento"]), departamento: find(["departamento", "depto", "dep", "partido"]), municipio: find(["municipio", "muni", "localidad"]), oficina: find(["oficinalocal", "oficina", "oficinasenasa"]), paraje: find(["paraje", "localidad", "localidadparaje"]), lat: find(["lat", "latitud", "latitude"]), lon: find(["lon", "lng", "longitud", "longitude"]), species, categories, recognized };
  [fields.ultimaActualizacion, fields.establecimiento, fields.departamento, fields.municipio, fields.oficina, fields.paraje, fields.lat, fields.lon, ...Object.values(species), ...Object.values(categories)].filter(Boolean).forEach((field) => recognized.add(canonical(field)));
  return fields;
}
function summarizeFields(fields) { return { idOrRenspa: fields.idOrRenspa || null, id: fields.id || null, renspa: fields.renspa || null, dni: fields.dni || null, cuit: fields.cuit || null, cuil: fields.cuil || null, cuitCuil: fields.cuitCuil || null, document: fields.document || null, name: fields.name || null, legalName: fields.legalName || null, ultimaActualizacion: fields.ultimaActualizacion || null, establecimiento: fields.establecimiento || null, departamento: fields.departamento || null, municipio: fields.municipio || null, oficina: fields.oficina || null, paraje: fields.paraje || null, lat: fields.lat || null, lon: fields.lon || null, species: fields.species, categories: fields.categories, categoriesBySpecies: Object.fromEntries(Object.entries(CATEGORY_SCHEMA).map(([species, definitions]) => [species, Object.keys(definitions).filter((key) => Boolean(fields.categories[key]))])) }; }
function buildSearchKeys(row, fields, { renspa, sourceIdentifier }) {
  const raw = {
    renspa,
    dni: cleanValue(valueAt(row, fields.dni)),
    cuit: cleanValue(valueAt(row, fields.cuit)),
    cuil: cleanValue(valueAt(row, fields.cuil)),
    document: cleanValue(valueAt(row, fields.document)),
    cuit_cuil: cleanValue(valueAt(row, fields.cuitCuil)),
    internal_id: sourceIdentifier,
  };
  const normalized = Object.fromEntries(Object.entries(raw).map(([type, value]) => [type, normalizeIdentifier(value)]));
  // A generic document can be classified without guessing only by its normalized length.
  if (!normalized.dni && /^\d{7,9}$/.test(normalized.document)) normalized.dni = normalized.document;
  if (!normalized.cuit_cuil && /^\d{11}$/.test(normalized.document)) normalized.cuit_cuil = normalized.document;
  if (!normalized.cuit_cuil) normalized.cuit_cuil = normalized.cuit || normalized.cuil;
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value));
}
function updateIdentifierCoverage(coverage, searchKeys, seen, output) {
  for (const [type, stats] of Object.entries(coverage)) {
    const value = searchKeys[type];
    if (!value) continue;
    if (output) { stats.outputRows += 1; continue; }
    stats.sourceRows += 1;
    stats.validRows += 1;
    if (seen[type].has(value)) stats.duplicateRows += 1;
    else seen[type].add(value);
  }
}
function canonical(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function shiftCalendarDate(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function parseUpdateDate(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if ((typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^\d{5,7}(?:\.\d+)?$/.test(value.trim()))) {
    // Excel's 1900 date system uses 1899-12-30 as the serial epoch.
    const serial = Number(value);
    if (serial < 1 || serial > 2958465) return null;
    return shiftCalendarDate("1899-12-30", Math.floor(serial));
  }
  const text = String(value).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  if (iso) return isCalendarDate(iso[1]) && validTime(iso[2], iso[3], iso[4]) ? iso[1] : null;
  const local = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!local) return null;
  const date = `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  return isCalendarDate(date) && validTime(local[4], local[5], local[6]) ? date : null;
}
function validTime(hour, minute, second) { return hour === undefined || (Number(hour) <= 23 && Number(minute) <= 59 && (second === undefined || Number(second) <= 59)); }
function valueAt(row, field) { return field ? row[field] : ""; }
function cleanValue(value) { return String(value ?? "").trim().slice(0, 160); }
function parseCoordinate(value, axis) { const number = Number(String(value ?? "").trim().replace(/\s/g, "").replace(",", ".")); const max = axis === "lat" ? 90 : 180; return Number.isFinite(number) && Math.abs(number) > 0.01 && Math.abs(number) <= max ? number : NaN; }
function positiveNumber(value) { const number = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? number : 0; }
function parseNumeric(value) { const number = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(number) ? number : NaN; }
function sum(values) { return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0); }
function maskIdentifier(value) { const parts = String(value).trim().split(/[.\-/\s]+/).filter(Boolean); if (parts.length >= 2) return `${parts.slice(0, -1).join(".")}.****`; const text = parts[0] || ""; return text.length > 4 ? `${text.slice(0, 2)}****` : "****"; }
function normalizeIdentifier(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64); }
function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
