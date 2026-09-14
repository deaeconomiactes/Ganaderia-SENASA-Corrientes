#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./sites-env.mjs";

const SPECIES = ["bovinos", "bubalinos", "ovinos", "caprinos", "porcinos", "equinos"];
const CATEGORIES = ["vacas", "vaquillonas", "novillos", "novillitos", "terneros", "terneras", "toros"];
const args = process.argv.slice(2);
const sourceArg = args.find((arg) => !arg.startsWith("--"));
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const outputArg = option("--output") || "dist/data/interno/productores.json";
const reportArg = option("--report") || "dist/data/interno/reporte_productores.json";

if (!sourceArg || args.includes("--help")) {
  console.log("Uso: node scripts/build-producer-data.mjs RUTA_FUENTE [--output RUTA] [--report RUTA]");
  console.log("Ejemplo: node scripts/build-producer-data.mjs ./data/interno/base_original.xlsx");
  process.exit(sourceArg ? 0 : 2);
}

const source = path.resolve(process.cwd(), sourceArg);
const output = path.resolve(process.cwd(), outputArg);
const reportPath = path.resolve(process.cwd(), reportArg);
if (!existsSync(source)) fail(`No existe la fuente indicada: ${sourceArg}`);

const rows = loadRows(source);
if (!rows.length) fail("La fuente no contiene filas de datos.");
const headers = Object.keys(rows[0]);
const fields = detectFields(headers);
const required = ["idOrRenspa", "departamento", "municipio", "lat", "lon"];
const missing = required.filter((field) => !fields[field]);
if (missing.length) fail(`Faltan columnas críticas: ${missing.join(", ")}. Revise las cabeceras reales de la base.`);
if (!Object.keys(fields.species).length && !Object.keys(fields.categories).length) fail("No se detectó ninguna columna de especie o categoría ganadera. La base no puede alimentar el mapa operativo.");

const report = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(source),
  outputFile: path.relative(process.cwd(), output),
  rowsRead: rows.length,
  validProducers: 0,
  withValidCoordinates: 0,
  withoutCoordinates: 0,
  negativeExistenceRows: 0,
  totalZeroRows: 0,
  duplicateSourceIdentifierRows: 0,
  missingIdentifierRows: 0,
  missingAdministrativeRows: 0,
  departments: {},
  recognizedFields: summarizeFields(fields),
  unrecognizedFields: headers.filter((header) => !fields.recognized.has(canonical(header))),
  missingColumns: [],
  warnings: [],
};

const seenIdentifiers = new Set();
const records = [];
rows.forEach((row, index) => {
  const sourceIdentifier = cleanValue(valueAt(row, fields.idOrRenspa));
  const renspa = cleanValue(valueAt(row, fields.renspa));
  if (sourceIdentifier && seenIdentifiers.has(sourceIdentifier)) report.duplicateSourceIdentifierRows += 1;
  if (sourceIdentifier) seenIdentifiers.add(sourceIdentifier);
  const lat = parseCoordinate(valueAt(row, fields.lat), "lat");
  const lon = parseCoordinate(valueAt(row, fields.lon), "lon");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { report.withoutCoordinates += 1; return; }
  report.withValidCoordinates += 1;
  const rawNumericValues = [...SPECIES.map((species) => parseNumeric(valueAt(row, fields.species[species]))), ...CATEGORIES.map((category) => parseNumeric(valueAt(row, fields.categories[category])))];
  if (rawNumericValues.some((value) => Number.isFinite(value) && value < 0)) { report.negativeExistenceRows += 1; return; }
  const values = {
    especies: Object.fromEntries(SPECIES.map((species) => [species, positiveNumber(valueAt(row, fields.species[species]))])),
    categorias: Object.fromEntries(CATEGORIES.map((category) => [category, positiveNumber(valueAt(row, fields.categories[category]))])),
  };
  const totalExistencias = sum(Object.values(values.especies)) || sum(Object.values(values.categorias));
  if (totalExistencias === 0) report.totalZeroRows += 1;
  const departamento = cleanValue(valueAt(row, fields.departamento));
  const municipio = cleanValue(valueAt(row, fields.municipio));
  if (!sourceIdentifier) { report.missingIdentifierRows += 1; return; }
  if (!departamento || !municipio) { report.missingAdministrativeRows += 1; return; }
  report.validProducers += 1;
  report.departments[departamento] = (report.departments[departamento] || 0) + 1;
  const sequence = String(index + 1).padStart(6, "0");
  records.push({
    id: `UP-${sequence}`,
    displayId: renspa ? `RENSPA ${maskIdentifier(renspa)}` : `Unidad operativa ${sequence}`,
    renspaMasked: renspa ? maskIdentifier(renspa) : "",
    lat, lon, departamento, municipio,
    oficinaLocal: cleanValue(valueAt(row, fields.oficina)),
    paraje: cleanValue(valueAt(row, fields.paraje)),
    totalExistencias,
    especies: values.especies,
    categorias: values.categorias,
  });
});

if (!records.length) report.warnings.push("No se generaron productores válidos con coordenadas, ubicación administrativa e identificador.");
if (report.withoutCoordinates) report.warnings.push(`${report.withoutCoordinates} filas quedaron fuera por coordenadas inválidas o ausentes.`);
if (report.negativeExistenceRows) report.warnings.push(`${report.negativeExistenceRows} filas quedaron fuera por existencias negativas.`);
if (report.totalZeroRows) report.warnings.push(`${report.totalZeroRows} productores válidos tienen existencias totales iguales a cero.`);
if (report.missingIdentifierRows) report.warnings.push(`${report.missingIdentifierRows} filas con coordenadas no tienen identificador o RENSPA.`);
if (report.missingAdministrativeRows) report.warnings.push(`${report.missingAdministrativeRows} filas con coordenadas no tienen departamento y/o municipio.`);
if (report.unrecognizedFields.length) report.warnings.push("Hay columnas no reconocidas; revisar el reporte local antes de usar la fuente.");

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
  const find = (aliases) => headers.find((header) => aliases.includes(canonical(header)));
  const speciesAliases = { bovinos: ["bovinos", "bovino", "bov"], bubalinos: ["bubalinos", "bubalino", "bufalos", "bufalo"], ovinos: ["ovinos", "ovino", "ovejas"], caprinos: ["caprinos", "caprino", "cabras"], porcinos: ["porcinos", "porcino", "cerdos"], equinos: ["equinos", "equino", "caballos"] };
  const categoryAliases = { vacas: ["vacas", "vaca"], vaquillonas: ["vaquillonas", "vaquillona"], novillos: ["novillos", "novillo"], novillitos: ["novillitos", "novillito"], terneros: ["terneros", "ternero"], terneras: ["terneras", "ternera"], toros: ["toros", "toro"] };
  const id = find(["idproductor", "productorid", "idunidad", "unidadid", "idregistro", "registroid", "codigooperativo", "codigo", "id"]);
  const renspa = find(["renspa", "renspanro", "renspanumero", "uprenspa"]);
  const recognized = new Set([id, renspa].filter(Boolean).map(canonical));
  const species = Object.fromEntries(Object.entries(speciesAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field));
  const categories = Object.fromEntries(Object.entries(categoryAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field));
  const fields = { idOrRenspa: id || renspa, renspa, departamento: find(["departamento", "depto", "dep"]), municipio: find(["municipio", "muni", "localidad"]), oficina: find(["oficinalocal", "oficina", "oficinasenasa"]), paraje: find(["paraje", "localidad", "localidadparaje"]), lat: find(["lat", "latitud", "latitude"]), lon: find(["lon", "lng", "longitud", "longitude"]), species, categories, recognized };
  [fields.departamento, fields.municipio, fields.oficina, fields.paraje, fields.lat, fields.lon, ...Object.values(species), ...Object.values(categories)].filter(Boolean).forEach((field) => recognized.add(canonical(field)));
  return fields;
}
function summarizeFields(fields) { return { idOrRenspa: fields.idOrRenspa || null, renspa: fields.renspa || null, departamento: fields.departamento || null, municipio: fields.municipio || null, oficina: fields.oficina || null, paraje: fields.paraje || null, lat: fields.lat || null, lon: fields.lon || null, species: fields.species, categories: fields.categories }; }
function canonical(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function valueAt(row, field) { return field ? row[field] : ""; }
function cleanValue(value) { return String(value ?? "").trim().slice(0, 160); }
function parseCoordinate(value, axis) { const number = Number(String(value ?? "").trim().replace(/\s/g, "").replace(",", ".")); const max = axis === "lat" ? 90 : 180; return Number.isFinite(number) && Math.abs(number) > 0.01 && Math.abs(number) <= max ? number : NaN; }
function positiveNumber(value) { const number = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? number : 0; }
function parseNumeric(value) { const number = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(number) ? number : NaN; }
function sum(values) { return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0); }
function maskIdentifier(value) { const parts = String(value).trim().split(/[.\-/\s]+/).filter(Boolean); if (parts.length >= 2) return `${parts.slice(0, -1).join(".")}.****`; const text = parts[0] || ""; return text.length > 4 ? `${text.slice(0, 2)}****` : "****"; }
function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
