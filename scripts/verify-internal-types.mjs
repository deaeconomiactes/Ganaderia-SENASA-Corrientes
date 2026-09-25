#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

const root = path.join(projectRoot, "internal-dist", "data", "interno");
const load = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const manifest = load("productores.index.manifest.json");
const report = load("reporte_productores.json");
const rows = manifest.chunks.flatMap((chunk) => load(path.basename(chunk.url)));
const byType = new Map(["agricola", "ganadero", "mixto"].map((type) => [type, new Set()]));
for (const row of rows) {
  assert.ok(byType.has(row.y), "Hay un tipo desconocido en el índice cartográfico.");
}
const mapped = rows.filter((row) => Number.isFinite(row.a) && Number.isFinite(row.o));
for (const row of mapped) byType.get(row.y).add(row.i);
assert.equal(mapped.length, report.withValidCoordinates);
assert.equal(manifest.records, report.rowsRead);
for (const [type, sheet] of [["agricola", "Agricola"], ["ganadero", "Ganadero"], ["mixto", "Mixto"]]) {
  assert.equal(byType.get(type).size, report.sourceSheets[sheet].coordinateRows);
}
const cases = [
  ["Ganadero", ["ganadero"]], ["Mixto", ["mixto"]], ["Agrícola", ["agricola"]],
  ["Ganadero + Mixto", ["ganadero", "mixto"]], ["Agrícola + Mixto", ["agricola", "mixto"]],
  ["Todos", ["ganadero", "mixto", "agricola"]],
];
for (const [label, types] of cases) {
  const selected = new Set(types);
  const filtered = mapped.filter((row) => selected.has(row.y));
  const expected = types.reduce((total, type) => total + byType.get(type).size, 0);
  assert.equal(filtered.length, expected);
  console.log(`${label}: ${filtered.length} puntos`);
}
assert.ok(mapped.filter((row) => row.y === "agricola" && row.e.every((value) => value === 0)).length > 0, "Falta el universo agrícola sin ganado.");
const search = load("search-index.json");
assert.equal(Object.keys(search.typesById || {}).length, report.rowsRead);
for (const row of rows) assert.equal(search.typesById[row.i], row.y);
for (const type of byType.keys()) {
  assert.ok(Object.values(search.indexes.renspa).some((entry) => (Array.isArray(entry) ? entry : [entry]).some((id) => byType.get(type).has(id))), `No hay búsqueda RENSPA para ${type}.`);
}
for (const key of ["dni", "document", "cuit_cuil", "name"]) assert.ok(Object.keys(search.indexes[key] || {}).length, `Falta índice ${key}.`);
assert.ok(!existsSync(path.join(projectRoot, "dist", "data", "interno", "productores.json")));
assert.match(readFileSync(path.join(projectRoot, "dist", "config.js"), "utf8"), /PUBLIC_SAFE_MODE\s*:\s*true/);
console.log("Cobertura, búsqueda protegida y separación pública verificadas.");
