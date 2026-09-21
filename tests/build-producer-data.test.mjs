import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("normaliza aliases de identificadores y reporta cobertura sin valores", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "senasa-identifiers-"));
  try {
    const source = path.join(directory, "fixture.csv");
    const output = path.join(directory, "productores.json");
    const report = path.join(directory, "reporte.json");
    writeFileSync(source, [
      "codigo;renspa;Nro DNI;Nro CUIT;Nro CUIL;Nro Documento;Nombre Titular;Razón Social;departamento;municipio;latitud;longitud;bovinos",
      "A-1;R-1;12345678;20123456786;;;Ana Productora;Ganadería Demo SA;Centro;Villa;-28,1;-58,1;10",
      "A-2;R-2;;;;27123456780;;;Centro;Villa;-28,2;-58,2;20",
      "A-3;R-3;;;;87654321;;;Norte;Pueblo;-28,3;-58,3;30",
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
    assert.deepEqual(payload.records[0].identifiers, { renspa: "R-1", dni: "12345678", cuit: "20123456786", cuil: "", document: "" });
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

test("el índice interno conserva multi-match y referencia el fragmento de detalle", () => {
  const directory = mkdtempSync(path.join(projectRoot, ".tmp-internal-index-"));
  try {
    const sourceDist = path.join(directory, "source-dist");
    const output = path.join(directory, "output");
    const producerData = path.join(directory, "productores.json");
    mkdirSync(path.join(sourceDist, "vendor"), { recursive: true });
    mkdirSync(path.join(sourceDist, "data"), { recursive: true });
    for (const file of ["index.html", "analisis.html", "app.js", "styles.css", "layout-fixes.css", "executive-upgrade.css", "filter-upgrade.css", "bi-upgrade.css", "operational-map.css"]) {
      writeFileSync(path.join(sourceDist, file), "fixture", "utf8");
    }
    const record = (id, detail) => ({
      id, displayId: id, renspaMasked: "**", lat: -28, lon: -58,
      departamento: "Centro", municipio: "Villa", oficinaLocal: "Oficina",
      totalExistencias: 1, especies: { bovinos: 1 }, categorias: {}, paraje: detail,
      searchKeys: { dni: "11223344", document: "11223344", internal_id: id.replace("-", "") },
    });
    writeFileSync(producerData, JSON.stringify({ records: [record("UP-1", "A"), record("UP-2", "B")] }), "utf8");
    const result = spawnSync(process.execPath, [
      path.join(projectRoot, "scripts", "build-internal-dist.mjs"),
      "--source-dir", sourceDist, "--output", output, "--producer-data", producerData,
    ], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const index = JSON.parse(readFileSync(path.join(output, "data", "interno", "search-index.json"), "utf8"));
    assert.deepEqual(Object.keys(index.indexes), ["renspa", "cuit", "cuil", "dni", "document", "cuit_cuil", "internal_id"]);
    assert.equal(index.indexes.dni["11223344"].length, 2);
    assert.deepEqual(index.indexes.dni["11223344"].map((entry) => entry.id), ["UP-1", "UP-2"]);
    assert.ok(index.indexes.dni["11223344"].every((entry) => Number.isInteger(entry.detailChunk)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
