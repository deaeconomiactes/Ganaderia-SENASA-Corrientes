#!/usr/bin/env node

/**
 * Builds an internal-only static artifact without changing dist/config.js.
 *
 * The output folder is intentionally ignored by git. It may contain
 * individual producer data and must only be uploaded to a protected host.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (args.includes("--help")) {
  console.log("Uso: node scripts/build-internal-dist.mjs [opciones]");
  console.log("  --source-dir RUTA       Dist público ya construido (default: dist)");
  console.log("  --output RUTA           Carpeta de salida (default: internal-dist)");
  console.log("  --producer-data RUTA   JSON interno (default: dist/data/interno/productores.json)");
  console.log("  --producer-report RUTA  Reporte local (opcional)");
  console.log("  --data-url URL          Endpoint interno de productores, si corresponde");
  console.log("  --locator-endpoint URL  Endpoint seguro del localizador, si corresponde");
  process.exit(0);
}

const sourceDist = resolveFromProject(option("--source-dir") || "dist");
const outputDir = resolveFromProject(option("--output") || "internal-dist");
const producerData = resolveFromProject(option("--producer-data") || "dist/data/interno/productores.json");
const reportCandidate = option("--producer-report")
  ? resolveFromProject(option("--producer-report"))
  : resolveFromProject("dist/data/interno/reporte_productores.json");
const dataUrl = option("--data-url");
const locatorEndpoint = option("--locator-endpoint");
const internalConfigPath = path.join(projectRoot, "config.internal.js");

assertDirectory(sourceDist, "el directorio dist de origen");
assertFile(internalConfigPath, "la plantilla config.internal.js");
if (!dataUrl) assertFile(producerData, "data/interno/productores.json");
assertSafeOutput(outputDir);

const sourceConfig = readFileSync(internalConfigPath, "utf8");
validateInternalConfig(sourceConfig);

// Keep Vercel's local project link and token files across rebuilds. The
// artifact itself is disposable, but deleting `.vercel` here makes the next
// `vercel --prod --cwd internal-dist` silently create a different project.
cleanOutputDirectory();
mkdirSync(outputDir, { recursive: true });

const copied = [];
const requiredFiles = [
  "index.html",
  "analisis.html",
  "app.js",
  "styles.css",
  "layout-fixes.css",
  "executive-upgrade.css",
  "filter-upgrade.css",
  "bi-upgrade.css",
  "operational-map.css",
];
for (const relativeFile of requiredFiles) copyFile(relativeFile);

for (const optionalFile of [".nojekyll", "favicon.ico", "robots.txt"]) {
  if (existsSync(path.join(sourceDist, optionalFile))) copyFile(optionalFile);
}

copyDirectory("vendor");
copyDirectory("data", (relative) => relative !== "interno");
for (const optionalDirectory of ["assets", "css", "js"]) {
  if (existsSync(path.join(sourceDist, optionalDirectory))) copyDirectory(optionalDirectory);
}

if (dataUrl) {
  console.log("Fuente de productores: endpoint interno (no se copia JSON individual).");
} else {
  const internalDataDir = path.join(outputDir, "data", "interno");
  mkdirSync(internalDataDir, { recursive: true });
  const sourcePayload = JSON.parse(readFileSync(producerData, "utf8"));
  const records = Array.isArray(sourcePayload) ? sourcePayload : sourcePayload?.records;
  if (!Array.isArray(records)) throw new Error("La fuente interna debe contener un array de registros.");
  const maxChunkBytes = 5_000_000;
  const chunks = [];
  let current = [];
  let currentBytes = 2;
  for (const record of records) {
    const serialized = JSON.stringify(record);
    const recordBytes = Buffer.byteLength(serialized, "utf8") + (current.length ? 1 : 0);
    if (current.length && currentBytes + recordBytes > maxChunkBytes) {
      const name = `productores-${String(chunks.length).padStart(4, "0")}.json`;
      writeFileSync(path.join(internalDataDir, name), JSON.stringify(current), "utf8");
      copied.push(toRelative(path.join(internalDataDir, name)));
      chunks.push({ url: `./data/interno/${name}`, records: current.length });
      current = [];
      currentBytes = 2;
    }
    current.push(record);
    currentBytes += recordBytes;
  }
  const name = `productores-${String(chunks.length).padStart(4, "0")}.json`;
  writeFileSync(path.join(internalDataDir, name), JSON.stringify(current), "utf8");
  copied.push(toRelative(path.join(internalDataDir, name)));
  chunks.push({ url: `./data/interno/${name}`, records: current.length });
  const manifestPath = path.join(internalDataDir, "productores.manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ format: "senasa-producers-chunks-v1", records: records.length, report: sourcePayload?.report || sourcePayload?._report || null, chunks }), "utf8");
  copied.push(toRelative(manifestPath));

  if (existsSync(reportCandidate)) {
    const reportTarget = path.join(outputDir, "data", "interno", "reporte_productores.json");
    cpSync(reportCandidate, reportTarget);
    copied.push(toRelative(reportTarget));
  } else {
    console.warn("Advertencia: no se encontró reporte_productores.json; se continúa sin el reporte local.");
  }
}

let config = sourceConfig;
if (dataUrl) config = replaceConfigValue(config, "INTERNAL_PRODUCER_DATA_URL", dataUrl);
if (locatorEndpoint) config = replaceConfigValue(config, "SECURE_LOCATOR_ENDPOINT", locatorEndpoint);
writeFileSync(path.join(outputDir, "config.js"), config, "utf8");
copied.push("config.js");

writeFileSync(
  path.join(outputDir, "INTERNAL_BUILD.txt"),
  [
    "Dashboard SENASA · Ganadería Corrientes · artefacto interno",
    "",
    "Este directorio contiene datos individuales y sólo debe publicarse detrás de autenticación, VPN/intranet o un proxy institucional.",
    "No copiar este directorio al repositorio público ni habilitar un hosting anónimo.",
    `Generado: ${new Date().toISOString()}`,
  ].join("\n"),
  "utf8",
);

verifyOutput();
console.log(`Artefacto interno generado en ${toRelative(outputDir)}`);
console.log(`Archivos copiados: ${copied.length}`);
console.log("Configuración interna: APP_MODE internal · PUBLIC_SAFE_MODE false");
console.log("El artefacto contiene datos internos; desplegar sólo con control de acceso.");

function copyFile(relativeFile) {
  const source = path.join(sourceDist, relativeFile);
  if (!existsSync(source)) throw new Error(`Falta un archivo requerido en dist: ${relativeFile}`);
  const target = path.join(outputDir, relativeFile);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
  copied.push(relativeFile.replaceAll("\\", "/"));
}

function cleanOutputDirectory() {
  mkdirSync(outputDir, { recursive: true });
  const preserved = new Set([".vercel", ".env.local", ".gitignore"]);
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (preserved.has(entry.name)) continue;
    rmSync(path.join(outputDir, entry.name), { recursive: true, force: true });
  }
}

function copyDirectory(relativeDirectory, include = () => true) {
  const source = path.join(sourceDist, relativeDirectory);
  if (!existsSync(source)) throw new Error(`Falta un directorio requerido en dist: ${relativeDirectory}`);
  copyTree(source, path.join(outputDir, relativeDirectory), "", include);
}

function copyTree(source, target, relative, include) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    // The public data tree is copied without its sensitive interno subtree.
    if (path.basename(childRelative) === "interno" && path.dirname(childRelative) === ".") continue;
    if (!include(childRelative.replaceAll("\\", "/"))) continue;
    const childSource = path.join(source, entry.name);
    const childTarget = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(childSource, childTarget, childRelative, include);
    else if (entry.isFile()) {
      mkdirSync(path.dirname(childTarget), { recursive: true });
      cpSync(childSource, childTarget);
      copied.push(path.relative(outputDir, childTarget).replaceAll("\\", "/"));
    }
  }
}

function replaceConfigValue(contents, property, value) {
  const expression = new RegExp(`(${property}\\s*:\\s*)(null|["'][^"']*["'])`);
  if (!expression.test(contents)) throw new Error(`No se encontró ${property} en config.internal.js`);
  return contents.replace(expression, (_match, prefix) => `${prefix}${JSON.stringify(value)}`);
}

function validateInternalConfig(contents) {
  const required = [
    [/APP_MODE\s*:\s*["']internal["']/, "APP_MODE internal"],
    [/PUBLIC_SAFE_MODE\s*:\s*false/, "PUBLIC_SAFE_MODE false"],
    [/INTERNAL_MODE\s*:\s*true/, "INTERNAL_MODE true"],
    [/SHOW_PRODUCER_POINTS\s*:\s*true/, "SHOW_PRODUCER_POINTS true"],
    [/INTERNAL_PRODUCER_DATA_URL\s*:/, "INTERNAL_PRODUCER_DATA_URL"],
  ];
  const missing = required.filter(([pattern]) => !pattern.test(contents)).map(([, label]) => label);
  if (missing.length) throw new Error(`config.internal.js no cumple el contrato interno: ${missing.join(", ")}`);
}

function verifyOutput() {
  assertFile(path.join(outputDir, "index.html"), "internal-dist/index.html");
  assertFile(path.join(outputDir, "config.js"), "internal-dist/config.js");
  if (!dataUrl) assertFile(path.join(outputDir, "data", "interno", "productores.manifest.json"), "internal-dist/data/interno/productores.manifest.json");
  const generatedConfig = readFileSync(path.join(outputDir, "config.js"), "utf8");
  validateInternalConfig(generatedConfig);
}

function resolveFromProject(value) {
  return path.resolve(projectRoot, value);
}

function assertDirectory(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`No existe ${label}: ${toRelative(filePath)}`);
}

function assertFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`No existe ${label}: ${toRelative(filePath)}. Genere primero la base interna o revise la ruta.`);
  }
}

function assertSafeOutput(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("La carpeta de salida debe estar dentro del proyecto y no puede ser la raíz del proyecto.");
  }
}

function toRelative(filePath) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}
