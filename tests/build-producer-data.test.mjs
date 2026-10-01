import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runInNewContext } from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const helperContext = { Intl, Date };
runInNewContext(readFileSync(path.join(projectRoot, "dist/renspa-validity.js"), "utf8"), helperContext);
const { getRenspaValidity } = helperContext.SENASA_RenspaValidity;

test("clasifica tres hojas por origen aunque Mixto declare n/a y conserva Agrícola sin ganado", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "senasa-types-"));
  try {
    const source = path.join(directory, "source.xlsx");
    const output = path.join(directory, "productores.json");
    const report = path.join(directory, "reporte.json");
    const createWorkbook = spawnSync("python", ["-c", `
import openpyxl, sys
from datetime import date, datetime
w = openpyxl.Workbook()
w.remove(w.active)
headers = ["UP_RENSPA", "PARTIDO", "LOCALIDAD", "OFICINA LOCAL", "LATITUD", "LONGITUD", "BOVINOS", "TIPO_EXPLOTACION_ACTUAL", "Ultima Actualizacion"]
for name, renspa, stock, declared, updated in [("Agricola", "A-1", 0, "A", date(2026, 1, 1)), ("Ganadero", "G-1", 10, "G", datetime(2026, 1, 2, 12, 30)), ("Mixto", "M-1", 0, "n/a", 46024)]:
    sheet = w.create_sheet(name)
    sheet.append(headers)
    sheet.append([renspa, "Centro", "Villa", "Oficina", -28.1, -58.1, stock, declared, updated])
    if name == "Mixto":
        sheet.cell(row=6, column=1).number_format = "@"
w.save(sys.argv[1])
`, source], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(createWorkbook.status, 0, createWorkbook.stderr);
    const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "build-producer-data.mjs"), source, "--output", output, "--report", report], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const records = JSON.parse(readFileSync(output, "utf8")).records;
    assert.deepEqual(records.map((row) => row.tipoRenspa), ["agricola", "ganadero", "mixto"]);
    assert.deepEqual(records.map((row) => row.tipoRenspaLabel), ["Agrícola", "Ganadero", "Mixto"]);
    assert.equal(records[0].totalExistencias, 0);
    assert.equal(records[2].totalExistencias, 0);
    assert.deepEqual(records.map((row) => row.ultimaActualizacionISO), ["2026-01-01", "2026-01-02", "2026-01-02"]);
    assert.deepEqual(JSON.parse(readFileSync(report, "utf8")).renspaTypeCoverage, { agricola: 1, ganadero: 1, mixto: 1, total: 3 });
    assert.equal(JSON.parse(readFileSync(report, "utf8")).rowsRead, 3, "Las filas vacías con estilo no son productores");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("normaliza aliases de identificadores y reporta cobertura sin valores", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "senasa-identifiers-"));
  try {
    const source = path.join(directory, "fixture.csv");
    const output = path.join(directory, "productores.json");
    const report = path.join(directory, "reporte.json");
    writeFileSync(source, [
      "codigo;renspa;Nro DNI;Nro CUIT;Nro CUIL;Nro Documento;Nombre Titular;Razón Social;departamento;municipio;latitud;longitud;bovinos;Ultima Actualizacion",
      "A-1;R-1;12345678;20123456786;;;Ana Productora;Ganadería Demo SA;Centro;Villa;-28,1;-58,1;10;2026-01-01",
      "A-2;R-2;;;;27123456780;;;Centro;Villa;-28,2;-58,2;20;2026-01-01",
      "A-3;R-3;;;;87654321;;;Norte;Pueblo;-28,3;-58,3;30;2026-01-01",
    ].join("\n"), "utf8");
    const result = spawnSync(process.execPath, [
      path.join(projectRoot, "scripts", "build-producer-data.mjs"),
      source, "--output", output, "--report", report,
    ], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(payload.records[0].searchKeys.dni, "12345678");
    assert.equal(payload.records[0].searchKeys.cuit, "20123456786");
    assert.equal(payload.records[0].searchKeys.cuit_cuil, "20123456786");
    assert.deepEqual(payload.records[0].identifiers, { renspa: "R-1", dni: "12345678", cuit: "20123456786", cuil: "", cuitCuil: "", document: "" });
    assert.deepEqual(payload.records[0].person, { name: "Ana Productora", legalName: "Ganadería Demo SA", displayName: "Ana Productora" });
    assert.equal(payload.records[1].searchKeys.document, "27123456780");
    assert.equal(payload.records[1].searchKeys.cuit_cuil, "27123456780");
    assert.equal(payload.records[2].searchKeys.document, "87654321");
    assert.equal(payload.records[2].searchKeys.dni, "87654321");

    const diagnostics = JSON.parse(readFileSync(report, "utf8"));
    assert.equal(diagnostics.identifierCoverage.document.sourceRows, 2);
    assert.equal(diagnostics.identifierCoverage.document.outputRows, 2);
    assert.equal(diagnostics.identifierCoverage.cuit_cuil.distinctValues, 2);
    const serializedReport = JSON.stringify(diagnostics);
    for (const sensitive of ["12345678", "20123456786", "27123456780", "87654321"]) {
      assert.equal(serializedReport.includes(sensitive), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("normaliza fechas y reporta vigencia de calendario con borde inclusivo y bisiesto", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "senasa-validity-"));
  try {
    const source = path.join(directory, "fixture.csv");
    const output = path.join(directory, "productores.json");
    const reportPath = path.join(directory, "reporte.json");
    const dates = ["2026-10-01 12:00:00", "2025-10-02", "2025-10-01", "2025-09-30", "", "fecha imposible", "2026-10-02", "2026-01-01", "31/02/2026", "29/02/2024", "28/02/2024"];
    const excelSerial = (Date.parse("2026-01-01T00:00:00Z") - Date.parse("1899-12-30T00:00:00Z")) / 86400000;
    dates[7] = String(excelSerial);
    writeFileSync(source, [
      "codigo;departamento;municipio;latitud;longitud;bovinos;Ultima Actualizacion",
      ...dates.map((date, index) => `ID-${index + 1};Centro;Villa;-28;-58;1;${date}`),
    ].join("\n"), "utf8");
    const build = (referenceDate) => {
      const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "build-producer-data.mjs"), source, "--output", output, "--report", reportPath, "--reference-date", referenceDate], { cwd: projectRoot, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return { records: JSON.parse(readFileSync(output, "utf8")).records, report: JSON.parse(readFileSync(reportPath, "utf8")) };
    };
    const { records, report } = build("2026-10-01");
    assert.deepEqual(records.map((row) => row.ultimaActualizacionISO), ["2026-10-01", "2025-10-02", "2025-10-01", "2025-09-30", null, null, "2026-10-02", "2026-01-01", null, "2024-02-29", "2024-02-28"]);
    assert.deepEqual(report.validityCoverage, { total: 11, vigente: 5, noVigente: 6, sinFecha: 3, fechaFutura: 1 });
    assert.equal(report.validityCutoffDate, "2025-10-01");
    assert.equal(report.ultimaActualizacionMin, "2024-02-28");
    assert.equal(report.ultimaActualizacionMax, "2026-10-02");
    assert.equal(JSON.stringify(report).includes("ID-"), false);
    assert.equal(build("2024-03-01").report.validityCutoffDate, "2023-03-02");
    for (const referenceDate of ["2026-10-01", "2025-02-28", "2024-03-01"]) {
      const result = build(referenceDate);
      const coverage = { total: result.records.length, vigente: 0, noVigente: 0, sinFecha: 0, fechaFutura: 0 };
      for (const record of result.records) {
        const validity = getRenspaValidity(record, referenceDate);
        coverage[validity.status === "vigente" ? "vigente" : "noVigente"] += 1;
        if (validity.reason === "sin_fecha") coverage.sinFecha += 1;
        if (validity.reason === "fecha_futura") coverage.fechaFutura += 1;
      }
      assert.deepEqual(result.report.validityCoverage, coverage, `Pipeline y frontend al ${referenceDate}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("el índice interno conserva multi-match y referencia el fragmento de detalle", () => {
  const directory = mkdtempSync(path.join(projectRoot, ".tmp-internal-index-"));
  try {
    const sourceDist = path.join(directory, "source-dist");
    const output = path.join(directory, "output");
    const producerData = path.join(directory, "productores.json");
    const producerReport = path.join(directory, "reporte.json");
    writeFileSync(producerReport, "{}");
    mkdirSync(path.join(sourceDist, "vendor"), { recursive: true });
    mkdirSync(path.join(sourceDist, "data"), { recursive: true });
    for (const file of ["index.html", "analisis.html", "app.js", "renspa-validity.js", "styles.css", "layout-fixes.css", "executive-upgrade.css", "filter-upgrade.css", "bi-upgrade.css", "operational-map.css"]) {
      writeFileSync(path.join(sourceDist, file), "fixture", "utf8");
    }
    const record = (id, detail) => ({
      id, displayId: id, renspaMasked: "**", lat: -28, lon: -58,
      ultimaActualizacionISO: "2026-06-15",
      departamento: "Centro", municipio: "Villa", oficinaLocal: "Oficina",
      totalExistencias: 3, especies: { bovinos: 3 }, categorias: { vacas: 2, toros: 0 }, paraje: detail,
      searchKeys: { dni: "11223344", document: "11223344", internal_id: id.replace("-", "") },
    });
    writeFileSync(producerData, JSON.stringify({ records: [record("UP-1", "A"), record("UP-2", "B")] }), "utf8");
    const result = spawnSync(process.execPath, [
      path.join(projectRoot, "scripts", "build-internal-dist.mjs"),
      "--source-dir", sourceDist, "--output", output, "--producer-data", producerData, "--producer-report", producerReport,
    ], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const index = JSON.parse(readFileSync(path.join(output, "data", "interno", "search-index.json"), "utf8"));
    assert.deepEqual(Object.keys(index.indexes), ["renspa", "cuit", "cuil", "dni", "document", "cuit_cuil", "internal_id", "name"]);
    assert.equal(index.indexes.dni["11223344"].length, 2);
    assert.deepEqual(index.indexes.dni["11223344"], ["UP-1", "UP-2"]);
    assert.equal(index.typesById["UP-1"], "ganadero");
    const manifest = JSON.parse(readFileSync(path.join(output, "data", "interno", "productores.index.manifest.json"), "utf8"));
    const mapIndex = JSON.parse(readFileSync(path.join(output, manifest.chunks[0].url), "utf8"));
    assert.ok(mapIndex.every((entry) => Number.isInteger(entry.x)));
    assert.deepEqual(mapIndex.map((entry) => entry.u), ["2026-06-15", "2026-06-15"]);
    assert.deepEqual(mapIndex.map((entry) => entry.v), [{ vacas: 2 }, { vacas: 2 }]);
    const detailManifest = JSON.parse(readFileSync(path.join(output, "data", "interno", "productores.detail.manifest.json"), "utf8"));
    const details = JSON.parse(readFileSync(path.join(output, detailManifest.chunks[0].url), "utf8"));
    assert.ok(details.every((entry) => entry.ultimaActualizacionISO === "2026-06-15"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
