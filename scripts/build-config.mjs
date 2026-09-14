import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

const mode = process.argv[2] || "public";
if (!['public', 'internal'].includes(mode)) {
  console.error("Uso: node scripts/build-config.mjs public|internal");
  process.exit(2);
}

const source = path.join(projectRoot, `config.${mode}.js`);
const target = path.join(projectRoot, "dist", "config.js");
if (!existsSync(source)) throw new Error(`No existe la plantilla ${source}`);
let contents = readFileSync(source, "utf8");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
if (mode === "internal") {
  const dataUrl = option("--data-url");
  const locatorEndpoint = option("--locator-endpoint");
  if (dataUrl) contents = contents.replace(/INTERNAL_PRODUCER_DATA_URL:\s*"[^"]*"/, `INTERNAL_PRODUCER_DATA_URL: ${JSON.stringify(dataUrl)}`);
  if (locatorEndpoint) contents = contents.replace(/SECURE_LOCATOR_ENDPOINT:\s*null/, `SECURE_LOCATOR_ENDPOINT: ${JSON.stringify(locatorEndpoint)}`);
}
writeFileSync(target, contents);
console.log(`Configuración ${mode} generada en dist/config.js.`);
if (mode === "internal") {
  console.warn("ADVERTENCIA: este artefacto sólo debe desplegarse detrás de autenticación, intranet o un proxy seguro.");
}
