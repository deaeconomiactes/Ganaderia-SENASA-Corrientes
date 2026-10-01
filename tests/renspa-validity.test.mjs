import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const context = { Intl, Date, globalThis: null };
context.globalThis = context;
runInNewContext(readFileSync(new URL("../dist/renspa-validity.js", import.meta.url), "utf8"), context);
const { getRenspaValidity, referenceISO } = context.SENASA_RenspaValidity;

test("ventana inclusiva de 365 días y fechas faltantes", () => {
  const cases = [
    ["2026-10-01", "vigente", "within_window", 0],
    ["2025-10-02", "vigente", "within_window", 364],
    ["2025-10-01", "vigente", "within_window", 365],
    ["2025-09-30", "no_vigente", "expired", 366],
    ["", "no_vigente", "sin_fecha", null],
    [null, "no_vigente", "sin_fecha", null],
    [undefined, "no_vigente", "sin_fecha", null],
    ["2026-02-30", "no_vigente", "sin_fecha", null],
    ["2026-01-01T12:00:00Z", "no_vigente", "sin_fecha", null],
  ];
  for (const [date, status, reason, days] of cases) {
    const actual = getRenspaValidity({ ultimaActualizacionISO: date }, "2026-10-01");
    assert.equal(actual.status, status, date);
    assert.equal(actual.reason, reason, date);
    assert.equal(actual.daysSinceUpdate, days, date);
  }
});

test("año bisiesto por diferencia real de días", () => {
  const border = getRenspaValidity({ ultimaActualizacionISO: "2024-02-29" }, "2025-02-28");
  const expired = getRenspaValidity({ ultimaActualizacionISO: "2024-02-28" }, "2025-02-28");
  assert.equal(border.daysSinceUpdate, 365);
  assert.equal(border.status, "vigente");
  assert.equal(expired.daysSinceUpdate, 366);
  assert.equal(expired.status, "no_vigente");
});

test("fecha futura se conserva como vigente con anomalía", () => {
  assert.deepEqual({ ...getRenspaValidity({ ultimaActualizacionISO: "2026-10-02" }, "2026-10-01") }, { status: "vigente", label: "Activo vigente", daysSinceUpdate: -1, reason: "fecha_futura" });
});

test("la fecha de referencia usa el calendario de Buenos Aires", () => {
  assert.equal(referenceISO(new Date("2026-10-02T01:00:00Z")), "2026-10-01");
  assert.equal(referenceISO(new Date("2026-10-02T02:59:59Z")), "2026-10-01");
  assert.equal(referenceISO(new Date("2026-10-02T03:00:00Z")), "2026-10-02");
  assert.equal(getRenspaValidity({ ultimaActualizacionISO: "2025-10-01" }, new Date("2026-10-02T02:59:59Z")).status, "vigente");
  assert.equal(getRenspaValidity({ ultimaActualizacionISO: "2025-10-01" }, new Date("2026-10-02T03:00:00Z")).status, "no_vigente");
});
