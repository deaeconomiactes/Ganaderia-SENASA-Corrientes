(() => {
  const SPECIES = [
    ["bovinos", "Bovinos", "#35d5c1"],
    ["bubalinos", "Bubalinos", "#f2a45c"],
    ["equinos", "Equinos", "#5b9cf2"],
    ["porcinos", "Porcinos", "#e07f94"],
    ["caprinos", "Caprinos", "#b694ef"],
    ["ovinos", "Ovinos", "#8dcf72"],
  ];
  const PRODUCER_CATEGORY_SCHEMA = {
    bovinos: [
      ["vacas", "Vacas", ["vacas", "vaca"]], ["vaquillonas", "Vaquillonas", ["vaquillonas", "vaquillona"]],
      ["novillos", "Novillos", ["novillos", "novillo"]], ["novillitos", "Novillitos", ["novillitos", "novillito"]],
      ["terneros", "Terneros", ["terneros", "ternero"]], ["terneras", "Terneras", ["terneras", "ternera"]],
      ["toros", "Toros", ["toros", "toro"]], ["bueyes", "Bueyes", ["bueyes", "buey"]],
      ["toritos_mej", "Toritos/MEJ", ["toritosmej"]],
    ],
    bubalinos: [
      ["vacas_bub", "Vacas bubalinas", ["vacasbub"]], ["toros_bub", "Toros bubalinos", ["torosbub"]],
      ["bueyes_bub", "Bueyes bubalinos", ["bueyesbub"]], ["novillos_bub", "Novillos bubalinos", ["novillosbub"]],
      ["novillitos_bub", "Novillitos bubalinos", ["novillitosbub"]], ["vaquillonas_bub", "Vaquillonas bubalinas", ["vaquillonasbub"]],
      ["toritos_mej_bub", "Toritos/MEJ bubalinos", ["toritosmejbub"]], ["terneros_bub", "Terneros bubalinos", ["ternerosbub"]],
      ["terneras_bub", "Terneras bubalinas", ["ternerasbub"]],
    ],
    ovinos: [
      ["carneros", "Carneros", ["carneros", "carnero"]], ["borregos_as", "Borregos/as", ["borregosas"]],
      ["capones_ov", "Capones ovinos", ["caponesov"]], ["corderos_as", "Corderos/as", ["corderosas"]],
    ],
    caprinos: [
      ["chivos", "Chivos", ["chivos", "chivo"]], ["cabrillas_chivitos", "Cabrillas/chivitos", ["cabrillaschivitos"]],
      ["cabritos", "Cabritos", ["cabritos", "cabrito"]], ["capones_capr", "Capones caprinos", ["caponescapr"]],
    ],
    porcinos: [
      ["cerdas", "Cerdas", ["cerdas", "cerda"]], ["lechones", "Lechones", ["lechones", "lechon"]],
      ["capones_po_hembras_sin_servicio", "Capones / hembras sin servicio", ["caponespohembrassinservicio"]],
      ["padrillos_po", "Padrillos porcinos", ["padrillospo"]],
    ],
    equinos: [
      ["yeguas", "Yeguas", ["yeguas", "yegua"]], ["asnos", "Asnos", ["asnos", "asno"]],
      ["burros", "Burros", ["burros", "burro"]], ["mulas", "Mulas", ["mulas", "mula"]],
      ["padrillos_eq", "Padrillos equinos", ["padrilloseq"]], ["potrillos_as", "Potrillos/as", ["potrillosas"]],
      ["equinos", "Equinos", ["equinos"]],
    ],
  };
  const PRODUCER_CATEGORY_LABELS = Object.fromEntries(Object.values(PRODUCER_CATEGORY_SCHEMA).flat().map(([key, label]) => [key, label]));
  const MAP_VIEW = "0 0 800 620";
  const formatNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const formatDecimal = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const formatMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const $ = (selector) => document.querySelector(selector);
  const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const value = (item, key) => Number(item?.[key] || 0);
  const sum = (items, key) => items.reduce((total, item) => total + (key ? value(item, key) : Number(item || 0)), 0);

  const APP_CONFIG = window.APP_CONFIG || {};
  const SECURE_LOCATOR_ENDPOINT = window.APP_CONFIG?.SECURE_LOCATOR_ENDPOINT || null;
  let internalProducerLookup = [];
  let activeOperationalState = null;
  let missingRenspaKeyWarningShown = false;
  const mapDebug = (...args) => {
    if (APP_CONFIG.DEBUG_MAP !== true) return;
    const safeArgs = args.map((item) => item && typeof item === "object" ? JSON.stringify(item) : String(item));
    console.info(`[SENASA mapa] ${safeArgs.join(" ")}`);
  };
  setupNavigation();
  loadData();

  async function loadData() {
    const dataUrl = APP_CONFIG.DATA_URL || "./data/senasa-corrientes.json";
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} al leer la base agregada.`);
      const data = await response.json();
      let metadata = data.metadata || {};
      if (APP_CONFIG.METADATA_URL) {
        try {
          const metadataResponse = await fetch(APP_CONFIG.METADATA_URL);
          if (metadataResponse.ok) metadata = { ...metadata, ...(await metadataResponse.json()) };
        } catch (_metadataError) { /* Se conserva la metadata incluida en la base agregada. */ }
      }
      data.metadata = metadata;
      await init(data);
    } catch (error) {
      showDataError(dataUrl, error);
    }
  }

  function setupNavigation() {
    const sidebar = $("#sidebar");
    const toggle = $(".sidebar-toggle");
    if (!sidebar || !toggle) return;
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "senasa-sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Cerrar menú de navegación");
    backdrop.hidden = true;
    document.body.append(backdrop);
    const setOpen = (open) => {
      sidebar.classList.toggle("senasa-sidebar-open", open);
      sidebar.inert = !open;
      sidebar.setAttribute("aria-hidden", String(!open));
      toggle.setAttribute("aria-expanded", String(open));
      backdrop.hidden = !open;
      document.body.classList.toggle("senasa-nav-open", open);
    };
    const close = () => setOpen(false);
    toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("senasa-sidebar-open")));
    backdrop.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    setOpen(false);
  }

  async function init(data) {
    try {
      setupCommon(data);
      setupProtectedLocator();
      if (document.body.dataset.view === "territorio") await initTerritory(data);
      if (document.body.dataset.view === "analisis") initAnalysis(data);
    } catch (error) {
      showDataError(APP_CONFIG.DATA_URL || "./data/senasa-corrientes.json", error);
    }
  }

  function showDataError(dataUrl, error) {
    const filename = String(dataUrl).split("/").pop() || "base de datos";
    document.querySelectorAll(".panel").forEach((panel) => {
      if (panel.querySelector(".data-error-state")) return;
      panel.insertAdjacentHTML("beforeend", `<div class="data-error-state" role="alert"><strong>No se pudo cargar la base</strong><span>Archivo: ${escapeHtml(filename)}</span><span>Mensaje: ${escapeHtml(error?.message || "Error desconocido")}</span><small>Sugerencia: revise la ruta relativa, el nombre del archivo o la configuración de GitHub Pages.</small></div>`);
    });
    setText("#updateText", "No se pudo cargar la base");
    setQualityState("red", "Base no cargada o con errores críticos", [{ label: "Carga de datos", status: "critical", detail: "Verifique la ruta relativa y vuelva a publicar." }]);
  }

  function setupProtectedLocator() {
    const form = $("#locatorForm");
    const input = $("#locatorInput");
    const type = $("#locatorType");
    const dialog = $("#locatorDialog");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const identifier = normalizeIdentifier(input?.value);
      const identifierType = type?.value || "auto";
      if (!identifier) {
        setText("#locatorStatus", "Ingrese un identificador para consultar el servicio protegido.");
        setText("#locatorResult", "");
        dialog?.showModal?.();
        return;
      }
      if (input) input.value = "";
      setText("#locatorStatus", isInternalOperationalMode() ? "Buscando productor…" : "Consultando el servicio protegido…");
      setText("#locatorResult", "");
      dialog?.showModal?.();
      try {
        const result = await fetchLocator(identifierType, identifier);
        if (result.found && Array.isArray(result.matches) && isInternalOperationalMode() && activeOperationalState) {
          dialog?.close?.();
          if (result.matches.length === 1) {
            selectProducer(result.matches[0], { state: activeOperationalState, source: "search", ensureVisible: true });
            setText("#selectionStatus", "Productor localizado · se muestra la ficha operativa protegida.");
          } else {
            activeOperationalState.locatorMatches = result.matches;
            activeOperationalState.selected = null;
            activeOperationalState.clusterSelection = null;
            renderOperationalTerritory(activeOperationalState.data, activeOperationalState);
            setText("#selectionStatus", `${formatNumber.format(result.matches.length)} coincidencias localizadas · seleccione una ficha en el panel.`);
          }
          return;
        }
        if (result.found && result.area) {
          const area = result.area;
          setText("#locatorStatus", result.message || "Coincidencia encontrada en zona agregada.");
          const fields = [["Departamento", area.departamento], ["Municipio", area.municipio], ["Oficina local", area.oficinaLocal], ["Celda/grilla", area.gridId]].filter(([, field]) => field);
          const target = $("#locatorResult");
          if (target) target.innerHTML = `<div class="locator-area-result"><strong>Coincidencia encontrada en zona agregada</strong>${fields.map(([label, field]) => `<span><b>${label}:</b> ${escapeHtml(field)}</span>`).join("")}</div>`;
        } else setText("#locatorStatus", result.message || "No se encontró coincidencia o no cuenta con permisos para consultar este identificador.");
      } catch (_error) {
        setText("#locatorStatus", "No se pudo realizar la búsqueda. Contacte al administrador.");
      }
    });
    document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  }

  async function fetchLocator(identifierType, identifier) {
    if (APP_CONFIG.ENABLE_SECURE_LOCATOR === false) return { found: false, message: "El localizador está deshabilitado en esta configuración." };
    const endpoint = SECURE_LOCATOR_ENDPOINT;
    if (!endpoint && isInternalOperationalMode() && internalProducerLookup.length) {
      const normalized = normalizeIdentifier(identifier);
      const matches = internalProducerLookup.filter((item) => identifierMatches(item, identifierType, normalized));
      const noMatchMessage = identifierType === "renspa" || identifierType === "auto" ? "No se encontró un productor con ese RENSPA." : "No se encontró un productor con ese identificador.";
      return matches.length ? { found: true, matches, message: "Productor localizado en la fuente interna. Los identificadores completos no se muestran." } : { found: false, message: noMatchMessage };
    }
    if (!endpoint) return { found: false, message: "La búsqueda por identificador requiere un servicio seguro autenticado. Esta versión pública sólo permite análisis agregado." };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifierType, identifier }) });
    if (!response.ok) throw new Error("Servicio protegido no disponible.");
    return response.json();
  }

  function normalizeIdentifier(raw) {
    return String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
  }

  function identifierMatches(item, identifierType, normalized) {
    const keys = item?.searchKeys || {};
    if (identifierType === "renspa") return Boolean(keys.renspa && keys.renspa === normalized);
    if (identifierType === "dni") return Boolean(keys.dni && keys.dni === normalized);
    if (identifierType === "cuit_cuil") return Boolean(keys.cuit_cuil && keys.cuit_cuil === normalized);
    if (identifierType === "internal_id") return Boolean(keys.internal_id && keys.internal_id === normalized);
    return (item?.searchTokens || []).includes(normalized);
  }

  function setupCommon(data) {
    const totals = data.totales;
    const qualityPanel = $("#qualityPanel");
    if (qualityPanel) {
      qualityPanel.hidden = true;
      qualityPanel.setAttribute("aria-hidden", "true");
    }
    setText("#sidebarRecords", formatNumber.format(totals.registros));
    const now = new Date(data.metadata.actualizado);
    setText("#updateText", Number.isNaN(now.valueOf()) ? "Base cargada correctamente" : `Base cargada correctamente · actualizada ${now.toLocaleDateString("es-AR")}`);
    setText("#metricBovinos", formatNumber.format(totals.bovinos));
    setText("#metricDensity", `${Number(totals.bovinos_por_registro || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}`);
    renderTraceabilityBand(data);
    renderQualitySummary(data, defaultFilters(), data.municipios || []);
    setText("#sourceInfo", `${data.metadata.alcance || ""} ${data.metadata.privacidad || ""} ${data.metadata.geometria || ""}`.trim());
    const infoDialog = $("#infoDialog");
    $("#infoButton")?.addEventListener("click", () => infoDialog?.showModal?.());
  }

  // Controles separados para que la validación sea auditable y extensible.
  function controlCarga(data) {
    const shapeOk = Boolean(data && data.totales && Array.isArray(data.departamentos) && Array.isArray(data.municipios) && Array.isArray(data.grillas));
    const nonEmpty = shapeOk && (data.departamentos.length + data.municipios.length + data.grillas.length > 0);
    return { id: "carga", label: "Base cargada, no vacía y con estructura esperada", status: shapeOk && nonEmpty ? "pass" : "critical", detail: shapeOk && nonEmpty ? "JSON agregado disponible." : "Faltan niveles territoriales o la base está vacía." };
  }

  function controlMetadata(metadata) {
    const cutoff = metadata?.fecha_corte || metadata?.fechaCorte || metadata?.corte || metadata?.periodo;
    return { id: "metadata", label: "Fecha de corte y metadata", status: cutoff ? "pass" : "warning", detail: cutoff ? `Corte informado: ${cutoff}.` : "Fecha de corte no informada." };
  }

  function controlValoresNegativos(data) {
    const collections = [data?.departamentos, data?.municipios, data?.grillas];
    const negative = collections.flatMap((items) => (items || []).flatMap((item) => ["registros", ...SPECIES.map(([key]) => key)].filter((key) => Number(item?.[key]) < 0)));
    return { id: "negativos", label: "Existencias y registros no negativos", status: negative.length ? "critical" : "pass", detail: negative.length ? `${negative.length} valores negativos detectados.` : "No se detectaron valores negativos." };
  }

  function controlCamposGeograficos(data) {
    const departmentsOk = (data?.departamentos || []).every((item) => String(item?.nombre || "").trim());
    const rowsOk = (data?.municipios || []).every((item) => String(item?.departamento || "").trim());
    return { id: "geografia", label: "Departamentos y unidades territoriales completos", status: departmentsOk && rowsOk ? "pass" : "warning", detail: departmentsOk && rowsOk ? "Cobertura territorial identificada." : "Existen nombres territoriales vacíos." };
  }

  function controlEspecies(data) {
    const all = [...(data?.departamentos || []), ...(data?.municipios || []), ...(data?.grillas || [])];
    const ok = all.every((item) => SPECIES.every(([key]) => Object.prototype.hasOwnProperty.call(item, key)));
    return { id: "especies", label: "Especies dentro del catálogo esperado", status: ok ? "pass" : "warning", detail: ok ? `${SPECIES.length} especies validadas.` : "Faltan columnas de una o más especies." };
  }

  function controlPrivacidad(data) {
    const forbidden = /renspa|dni|cuit|cuil|titular|productor|telefono|tel[eé]fono|correo|email|direccion|establecimiento/i;
    const keys = new Set();
    const walk = (node) => { if (!node || typeof node !== "object") return; Object.entries(node).forEach(([key, child]) => { if (forbidden.test(key)) keys.add(key); walk(child); }); };
    walk(data);
    const exact = Boolean(data?.metadata?.coordenadas_exactas || data?.metadata?.exactCoordinates);
    if (exact) keys.add("coordenadas_exactas");
    return { id: "privacidad", label: "Campos sensibles y coordenadas exactas no expuestos", status: keys.size ? "critical" : "pass", detail: keys.size ? `Revisar campos públicos: ${[...keys].join(", ")}.` : "Sólo agregados territoriales; lat/lon corresponden a centros de grilla." };
  }

  function controlMinRecords(data) {
    const threshold = Number(APP_CONFIG.MIN_RECORDS_PUBLIC_CELL || 5);
    const collections = [data?.departamentos, data?.municipios, data?.grillas];
    const below = collections.reduce((count, items) => count + (items || []).filter((item) => Number(item?.registros || 0) > 0 && Number(item?.registros || 0) < threshold).length, 0);
    return { id: "umbral", label: `Agregaciones territoriales con mínimo de ${threshold} registros`, status: below ? "warning" : "pass", detail: below ? `${below} unidades requieren supresión o agrupación antes de publicar.` : "Todas las unidades cumplen el umbral público." };
  }

  function controlTotales(data, filtrosActivos) {
    const rows = filterRows(data?.municipios || [], filtrosActivos || defaultFilters());
    const finite = rows.length > 0 && Number.isFinite(sum(rows, "registros")) && SPECIES.every(([key]) => Number.isFinite(sum(rows, key)));
    const base = filtrosActivos || defaultFilters();
    const allRows = filterRows(data?.municipios || [], defaultFilters());
    const comparable = base.department === "all" && !base.municipality && !base.office;
    const match = !comparable || !data?.totales || Math.abs(sum(allRows, "registros") - Number(data.totales.registros || 0)) < 0.5 && SPECIES.every(([key]) => Math.abs(sum(allRows, key) - Number(data.totales[key] || 0)) < 0.5);
    const valid = finite && match;
    return { id: "totales", label: "KPIs, tablas y gráficos con totales consistentes", status: valid ? "pass" : "warning", detail: !finite ? "No hay datos para los filtros seleccionados." : match ? `${rows.length} unidades recalculadas desde el mismo corte.` : "Los totales públicos deben coincidir con las unidades visibles." };
  }

  function generarResumenControl(controles) {
    const list = controles || [];
    const critical = list.some((item) => item.status === "critical");
    const warning = list.some((item) => item.status === "warning");
    return { status: critical ? "red" : warning ? "amber" : "green", label: critical ? "Base no cargada o con errores críticos" : warning ? "Base cargada, pero contiene advertencias" : "Base cargada y validada" };
  }

  function setQualityState(status, label, controls) {
    const statusEl = $("#qualityStatus");
    if (!statusEl) return;
    statusEl.className = `quality-status ${status}`;
    statusEl.querySelector(".quality-light")?.setAttribute("aria-label", label);
    setText("#qualityStatusText", label);
    setText("#qualitySummary", status === "green" ? "Los controles básicos de calidad y privacidad están conformes." : status === "amber" ? "La base puede consultarse, pero revise las advertencias antes de publicar." : "La publicación debe detenerse hasta corregir los errores críticos.");
    const target = $("#qualityChecks");
    if (target) target.innerHTML = (controls || []).map((item) => `<li class="quality-check ${item.status}"><span aria-hidden="true">${item.status === "pass" ? "✓" : item.status === "warning" ? "!" : "×"}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div></li>`).join("");
  }

  function renderQualitySummary(data, filters, rows) {
    const controls = [controlCarga(data), controlMetadata(data?.metadata), controlValoresNegativos(data), controlCamposGeograficos(data), controlEspecies(data), controlPrivacidad(data), controlMinRecords(data), controlTotales(data, filters)];
    const summary = generarResumenControl(controls);
    setQualityState(summary.status, summary.label, controls);
    return { ...summary, controls };
  }

  function renderTraceabilityBand(data) {
    const metadata = data?.metadata || {};
    const updated = APP_CONFIG.DASHBOARD_UPDATED ? new Date(APP_CONFIG.DASHBOARD_UPDATED) : metadata.actualizado ? new Date(metadata.actualizado) : null;
    setText("#traceSource", metadata.fuente || "Fuente no informada");
    setText("#traceProvince", APP_CONFIG.PROVINCE || "Corrientes");
    const cutoff = metadata.fecha_corte || metadata.fechaCorte || metadata.corte || metadata.periodo || "Fecha de corte no informada";
    setText("#traceCutoff", cutoff);
    $("#traceCutoff")?.classList.toggle("warning-text", !metadata.fecha_corte && !metadata.fechaCorte && !metadata.corte && !metadata.periodo);
    setText("#traceUpdated", updated && !Number.isNaN(updated.valueOf()) ? updated.toLocaleString("es-AR") : "No informada");
    setText("#traceGrain", "Provincia · departamento · municipio/oficina · grilla agregada");
    setText("#tracePrivacy", "Datos agregados. No se muestran datos personales, coordenadas exactas ni información individual de productores.");
  }

  async function initTerritory(data) {
    if (isInternalOperationalMode()) {
      mapDebug("Modo interno activo; iniciando fuente individual.");
      const source = await loadInternalProducerSource();
      try { initOperationalTerritory(data, source); } catch (_error) {
        mapDebug("Error controlado durante la inicialización del mapa operativo.");
        showOperationalEmpty("Leaflet no está disponible o falló la inicialización.");
      }
      return;
    }
    mapDebug("Modo público seguro activo; se conserva la capa agregada.");
    initPublicTerritory(data);
  }

  function isInternalOperationalMode() {
    const configuredInternal = APP_CONFIG.APP_MODE === "internal" || (!APP_CONFIG.APP_MODE && APP_CONFIG.INTERNAL_MODE === true);
    return configuredInternal && APP_CONFIG.PUBLIC_SAFE_MODE !== true && APP_CONFIG.SHOW_PRODUCER_POINTS === true;
  }

  async function loadInternalProducerSource() {
    const url = APP_CONFIG.INTERNAL_PRODUCER_DATA_URL;
    if (!url) {
      mapDebug("No hay INTERNAL_PRODUCER_DATA_URL configurado.");
      return { records: [], message: "No se encontró la fuente interna de productores. Contacte al administrador del dashboard." };
    }
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let payload = await response.json();
      if (payload?.format === "senasa-producers-chunks-v1" && Array.isArray(payload.chunks)) {
        const chunkPayloads = await Promise.all(payload.chunks.map(async (chunk) => {
          const chunkResponse = await fetch(new URL(chunk.url, response.url), { cache: "no-store" });
          if (!chunkResponse.ok) throw new Error(`HTTP ${chunkResponse.status} al leer un fragmento de la fuente interna.`);
          return chunkResponse.json();
        }));
        payload = { records: chunkPayloads.flat(), report: payload.report || undefined };
      }
      missingRenspaKeyWarningShown = false;
      const normalized = normalizeProducerData(payload);
      // The localizer only returns points that can be safely located on the
      // operational map; records without valid coordinates remain in the
      // diagnostics count but are not selectable.
      internalProducerLookup = normalized.filter((item) => validCoordinatePair(item.lat, item.lon));
      let sourceReport = payload?.report || payload?._report || {};
      const reportUrl = APP_CONFIG.INTERNAL_PRODUCER_REPORT_URL;
      if (reportUrl) {
        try {
          const reportResponse = await fetch(reportUrl, { cache: "no-store" });
          if (reportResponse.ok) sourceReport = { ...sourceReport, ...(await reportResponse.json()) };
        } catch (_reportError) { /* El reporte es opcional; la fuente sigue siendo utilizable. */ }
      }
      const withCoordinates = normalized.filter((item) => validCoordinatePair(item.lat, item.lon));
      const outsideCorrientes = withCoordinates.filter((item) => !isCorrientesCoordinate(item.lat, item.lon)).length;
      // A coordinate can be valid even when it falls outside the provincial
      // envelope (for example, a neighboring-office record). Keep it for the
      // operational view and expose the count as a diagnostic instead of
      // silently dropping producers.
      const mapped = withCoordinates;
      const effective = normalized.filter((item) => item.totalExistencias > 0).length;
      const zeroTotal = normalized.filter((item) => item.totalExistencias === 0).length;
      const summary = {
        rawRows: Number(sourceReport.rowsRead ?? normalized.length),
        normalizedRows: Number(sourceReport.validProducers ?? normalized.length),
        coordinateRows: Number(sourceReport.withValidCoordinates ?? mapped.length),
        coordinateRowsOutsideProvince: outsideCorrientes,
        missingCoordinates: Number(sourceReport.withoutCoordinates ?? (normalized.length - withCoordinates.length)),
        effectiveRows: effective,
        zeroTotalRows: zeroTotal,
        negativeTotalRows: normalized.filter((item) => item.totalExistencias < 0).length,
        departments: countValues(normalized, "departamento"),
        renspaSearchKeys: normalized.filter((item) => Boolean(item.searchKeys?.renspa)).length,
        speciesRows: Object.fromEntries(SPECIES.map(([key]) => [key, normalized.filter((item) => speciesValue(item, key) > 0).length])),
      };
      mapDebug("Fuente interna normalizada", summary);
      return { records: mapped, allRecords: normalized, summary, message: mapped.length ? "Datos internos cargados." : "No se pudo cargar la fuente interna. Contacte al administrador del dashboard." };
    } catch (error) {
      internalProducerLookup = [];
      mapDebug("No se pudo cargar la fuente interna.", { message: error?.message || "Error desconocido" });
      return { records: [], allRecords: [], summary: { rawRows: 0, normalizedRows: 0, coordinateRows: 0 }, message: "No se pudo cargar la fuente interna. Contacte al administrador del dashboard." };
    }
  }

  function validCoordinatePair(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
  function isCorrientesCoordinate(lat, lon) { return validCoordinatePair(lat, lon) && lat >= -31.5 && lat <= -26 && lon >= -60.8 && lon <= -55; }
  function countValues(rows, key) { return new Set(rows.map((item) => safeText(item?.[key])).filter(Boolean)).size; }
  function speciesValue(item, key) { const normalized = normalizeSpeciesKey(key); return positiveNumber(item?.especies?.[normalized || key]); }

  function normalizeProducerData(rawData) {
    const rows = Array.isArray(rawData) ? rawData : (rawData?.records || rawData?.rows || rawData?.data || []);
    if (!Array.isArray(rows)) return [];
    const fields = detectLivestockFields(rows);
    const nestedCategoryKeys = new Set();
    rows.forEach((row) => Object.keys(row?.categorias && typeof row.categorias === "object" ? row.categorias : {}).forEach((key) => nestedCategoryKeys.add(canonicalKey(key))));
    const categoryKeys = Object.keys(PRODUCER_CATEGORY_LABELS).filter((key) => fields.categories[key] || nestedCategoryKeys.has(canonicalKey(key)));
    return rows.map((row, index) => {
      const get = (name) => row?.[fields[name]];
      // Always emit the canonical keys. The internal pipeline already writes
      // normalized keys, while older exports may use accents, spaces or
      // singular labels. Keeping zeros explicit prevents a missing key from
      // being interpreted as a missing species during filtering.
      const species = Object.fromEntries(SPECIES.map(([key]) => [key, positiveNumber(readLivestockValue(row, "especies", key, fields.species[key]))]));
      const categories = Object.fromEntries(categoryKeys.map((key) => [key, positiveNumber(readLivestockValue(row, "categorias", key, fields.categories[key]))]));
      const totalFromSpecies = Object.values(species).reduce((total, current) => total + current, 0);
      const totalFromCategories = Object.values(categories).reduce((total, current) => total + current, 0);
      const totalFromParts = totalFromSpecies || totalFromCategories;
      const id = safeOperationalId(get("id"), index);
      const rawRenspa = get("renspa");
      const maskedRenspa = safeText(row?.renspaMasked);
      const sourceSearchKeys = row?.searchKeys && typeof row.searchKeys === "object" ? row.searchKeys : {};
      const fallbackRenspa = sourceSearchKeys.renspa || row?.renspaSearchKey || row?.renspaOriginal || row?.up_renspa || row?.UP_RENSPA || rawRenspa;
      const searchKeys = {
        renspa: normalizeIdentifier(fallbackRenspa),
        dni: normalizeIdentifier(sourceSearchKeys.dni || get("dni")),
        cuit_cuil: normalizeIdentifier(sourceSearchKeys.cuit_cuil || get("cuitCuil")),
        internal_id: normalizeIdentifier(sourceSearchKeys.internal_id || get("internalId") || get("id")),
      };
      Object.keys(searchKeys).forEach((key) => { if (!searchKeys[key]) delete searchKeys[key]; });
      if (maskedRenspa && !searchKeys.renspa && !missingRenspaKeyWarningShown) { missingRenspaKeyWarningShown = true; mapDebug("No existe clave RENSPA completa para búsqueda exacta. Regenerar productores.json."); }
      const declaredTotal = numericValue(get("total"));
      const totalExistencias = declaredTotal > 0 ? declaredTotal : totalFromParts;
      const existingDisplayId = safeText(row?.displayId);
      return {
        id,
        displayId: rawRenspa ? `RENSPA ${maskIdentifier(rawRenspa)}` : existingDisplayId || (maskedRenspa ? `RENSPA ${maskedRenspa}` : `Unidad ${id}`),
        renspaMasked: rawRenspa ? maskIdentifier(rawRenspa) : maskedRenspa,
        lat: parseCoordinate(get("lat")), lon: parseCoordinate(get("lon")),
        departamento: safeText(get("departamento")), municipio: safeText(get("municipio")), oficinaLocal: safeText(get("oficina")),
        totalExistencias,
        especies: species, categorias: categories, rawSafe: {}, searchKeys,
        searchTokens: [...Object.values(searchKeys), normalizeIdentifier(get("id"))].filter(Boolean),
      };
    });
  }

  function readLivestockValue(row, collectionName, canonical, flatField) {
    const collection = row?.[collectionName];
    if (collection && typeof collection === "object" && !Array.isArray(collection)) {
      if (Object.prototype.hasOwnProperty.call(collection, canonical)) return collection[canonical];
      const key = Object.keys(collection).find((candidate) => canonicalKey(candidate) === canonicalKey(canonical));
      if (key !== undefined) return collection[key];
    }
    return flatField ? row?.[flatField] : undefined;
  }

  function detectLivestockFields(rows) {
    const keys = [...new Set(rows.slice(0, 30).flatMap((row) => Object.keys(row || {})))];
    const find = (aliases) => keys.find((key) => aliases.includes(canonicalKey(key)));
    const speciesAliases = { bovinos: ["bovinos", "bovino", "bov"], bubalinos: ["bubalinos", "bubalino", "bufalos", "bufalo"], ovinos: ["ovinos", "ovino", "ovejas"], caprinos: ["caprinos", "caprino", "cabras"], porcinos: ["porcinos", "porcino", "cerdos"], equinos: ["equinos", "equino", "caballos"] };
    const categoryAliases = Object.fromEntries(Object.values(PRODUCER_CATEGORY_SCHEMA).flat().map(([key, , aliases]) => [key, aliases]));
    return {
      id: find(["idproductor", "productorid", "idunidad", "unidadid", "idregistro", "registroid", "codigooperativo", "codigo", "id"]),
      internalId: find(["idinterno", "internoid", "codigooperativo"]), renspa: find(["renspa", "renspanro", "renspanumero", "uprenspa"]),
      dni: find(["dni", "documento", "documentonro", "documentonumero"]), cuitCuil: find(["cuit", "cuil", "cuitcuil", "cuitcuilnro"]),
      lat: find(["lat", "latitud", "latitude"]), lon: find(["lon", "lng", "longitud", "longitude"]),
      departamento: find(["departamento", "depto", "depto" ]), municipio: find(["municipio", "muni", "localidad", "paraje"]), oficina: find(["oficinalocal", "oficina", "oficinasenasa"]),
      total: find(["totalexistencias", "existenciastotales", "totalanimales", "totalcabezas", "existencias"]),
      species: Object.fromEntries(Object.entries(speciesAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field)),
      categories: Object.fromEntries(Object.entries(categoryAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field)),
    };
  }

  function canonicalKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function normalizeSpeciesKey(value) {
    const key = canonicalKey(value);
    const aliases = {
      bovinos: ["bovinos", "bovino", "bov", "bovine"],
      bubalinos: ["bubalinos", "bubalino", "bufalos", "bufalo", "bufalas", "bufala", "buffalo"],
      equinos: ["equinos", "equino", "caballos", "caballo", "equine"],
      porcinos: ["porcinos", "porcino", "cerdos", "cerdo", "swine"],
      caprinos: ["caprinos", "caprino", "cabras", "cabra", "goat"],
      ovinos: ["ovinos", "ovino", "ovejas", "oveja", "sheep"],
    };
    return Object.entries(aliases).find(([, values]) => values.includes(key))?.[0] || "";
  }
  function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const text = String(value ?? "").trim();
    if (!text) return NaN;
    const number = Number(text.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    return Number.isFinite(number) ? number : NaN;
  }
  function positiveNumber(value) { const number = numericValue(value); return Number.isFinite(number) && number > 0 ? number : 0; }
  function parseCoordinate(value) { const number = Number(String(value ?? "").trim().replace(",", ".")); return Number.isFinite(number) && Math.abs(number) > 0.01 && Math.abs(number) <= 180 ? number : NaN; }
  function safeText(value) { return String(value || "").trim().slice(0, 120); }
  function safeOperationalId(value, index) { const id = safeText(value).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32); return id || `OP-${String(index + 1).padStart(5, "0")}`; }
  function maskIdentifier(value) { const text = normalizeIdentifier(value); return text.length > 4 ? `${text.slice(0, 2)}••••${text.slice(-2)}` : "••••"; }

  function initOperationalTerritory(data, source) {
    document.body.classList.add("operational-active");
    const producerMap = $("#producerMap");
    if (!producerMap) { mapDebug("Contenedor #producerMap no encontrado."); throw new Error("Contenedor de mapa operativo ausente."); }
    producerMap.hidden = false;
    if (producerMap.offsetHeight < 1) producerMap.style.minHeight = "620px";
    mapDebug("Contenedor #producerMap encontrado; alto:", producerMap.offsetHeight || "pendiente");
    $("#territoryMap").hidden = true; $("#mapLegend").hidden = true; $("#selectionInsight").hidden = true;
    $("#mapLevelControl").hidden = true;
    const advanced = $("#producerAdvancedFilters");
    if (advanced) { advanced.hidden = false; advanced.open = false; }
    $("#producerCategoryControl").hidden = false; $("#producerRangeControl").hidden = false; $("#includeZeroStockControl").hidden = false;
    ["#drawAreaButton", "#finishAreaButton", "#clearAreaButton"].forEach((selector) => { const button = $(selector); if (button) button.hidden = true; });
    const clearFiltersButton = $("#clearOperationalFiltersButton"); if (clearFiltersButton) clearFiltersButton.hidden = false;
    setText("#metricRecordsLabel", "UNIDADES PRODUCTIVAS"); setText("#metricMapUnitLabel", "PRODUCTORES GEOREFERENCIADOS"); setText("#metricMapUnitNote", "Uso interno · según filtros");
    setText("#mapLayerContext", "Productores georreferenciados con información ganadera desagregada · uso interno autorizado");
    setText("#mapFooterNotice", "Puntos operativos con coordenadas de la fuente interna; validar precisión y no publicar.");
    setText("#traceGrain", "Unidad productiva · punto georreferenciado"); setText("#tracePrivacy", "Modo interno autorizado. No publicar identificadores, contactos ni coordenadas sin control de acceso.");
    document.querySelector(".senasa-nav-note")?.replaceChildren(Object.assign(document.createElement("span"), { className: "status-dot" }), document.createTextNode("Modo interno operativo"));
    const modeBadge = document.querySelector(".senasa-public-badge"); if (modeBadge) modeBadge.innerHTML = '<span class="status-dot"></span>Modo interno operativo';
    const notice = $("#internalModeNotice"); notice.hidden = false; notice.innerHTML = source.records?.length ? "<strong>Modo interno operativo</strong> · Datos internos cargados. No publicar sin autenticación ni control de acceso." : "<strong>Modo interno operativo</strong> · No se pudo cargar la fuente interna. Contacte al administrador del dashboard.";
    const state = { data, filters: readGlobalFilters(), category: "", minStock: 0, includeZeroStock: false, selected: null, selectedProducer: null, clusterSelection: null, locatorMatches: null, selectionSource: "", records: source.records || [], allRecords: source.allRecords || source.records || [], sourceSummary: source.summary || {}, map: null, markerLayer: null, selectedProducerLayer: null, selectedMarker: null, boundaryLayer: null, diagnostics: null, speciesWarning: "" };
    activeOperationalState = state;
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncOperationalLocationControls(state.records, state.filters, controls);
    bindOperationalLocationControls(state.records, state.filters, controls, () => { clearOperationalSelection(state); renderOperationalTerritory(data, state); }, () => {
      state.category = "";
      updateCategoryOptions(state.filters.species, state);
    });
    updateCategoryOptions(state.filters.species, state);
    $("#producerCategorySelect")?.addEventListener("change", (event) => { state.category = event.target.value; clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    $("#producerMinStock")?.addEventListener("input", (event) => { state.minStock = positiveNumber(event.target.value); clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    $("#includeZeroStock")?.addEventListener("change", (event) => { state.includeZeroStock = Boolean(event.target.checked); clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    $("#clearOperationalFiltersButton")?.addEventListener("click", () => resetOperationalFilters(state, controls));
    $("#resetMapViewButton")?.addEventListener("click", () => { clearOperationalSelection(state); resetOperationalView(state); renderOperationalTerritory(data, state); });
    $("#closeProducerDetailButton")?.addEventListener("click", () => { clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    const map = initProducerMap(state, producerMap, data);
    if (!map) return;
    if (!state.records.length) showOperationalEmpty(source.message);
    renderOperationalTerritory(data, state);
  }

  function resetOperationalView(state) {
    const bounds = state.boundaryLayer?.getBounds?.();
    if (bounds?.isValid?.()) state.map?.fitBounds(bounds, { padding: [26, 26], animate: true });
    else if (state.visible?.length) state.map?.fitBounds(L.latLngBounds(state.visible.map((item) => [item.lat, item.lon])), { padding: [26, 26], maxZoom: 9, animate: true });
  }

  function clearOperationalSelection(state) {
    state.selected = null;
    state.selectedProducer = null;
    state.clusterSelection = null;
    state.locatorMatches = null;
    state.selectionSource = "";
    state.selectedMarker = null;
    state.selectedProducerLayer?.clearLayers?.();
  }

  function resetOperationalFilters(state, controls) {
    Object.assign(state.filters, defaultFilters());
    state.category = "";
    state.minStock = 0;
    state.includeZeroStock = false;
    clearOperationalSelection(state);
    const advanced = $("#producerAdvancedFilters");
    if (advanced) advanced.open = false;
    const category = $("#producerCategorySelect"); if (category) category.value = "";
    const minStock = $("#producerMinStock"); if (minStock) minStock.value = "";
    const includeZero = $("#includeZeroStock"); if (includeZero) includeZero.checked = false;
    const locatorInput = $("#locatorInput"); if (locatorInput) locatorInput.value = "";
    syncOperationalLocationControls(state.records, state.filters, controls);
    updateCategoryOptions(state.filters.species, state);
    saveGlobalFilters(state.filters);
    resetOperationalView(state);
    renderOperationalTerritory(state.data, state);
  }

  function initProducerMap(state, producerMap, data) {
    const selector = "#producerMap";
    mapDebug("Leaflet disponible:", Boolean(window.L), "selector:", selector, "container encontrado:", Boolean(producerMap));
    if (!window.L || !producerMap) {
      showOperationalEmpty("No se pudo inicializar el mapa operativo. Revise la carga de Leaflet y el contenedor.");
      return null;
    }
    if (state.map) {
      state.map.remove();
      state.map = null;
    }
    // Leaflet protects containers with an internal id. Clear a stale id only
    // when this controlled state is being re-initialized.
    if (producerMap._leaflet_id) {
      producerMap.replaceChildren();
      delete producerMap._leaflet_id;
    }
    producerMap.hidden = false;
    const before = producerMap.getBoundingClientRect();
    mapDebug("Contenedor antes de init", { width: Math.round(before.width), height: Math.round(before.height), children: producerMap.children.length });
    const map = L.map(producerMap, { zoomControl: true, preferCanvas: true, attributionControl: true }).setView([-28.8, -57.7], 7);
    state.map = map;
    state.container = producerMap;
    mapDebug("Instancia Leaflet creada:", Boolean(state.map));

    const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" });
    state.tileLayer = tileLayer;
    let tileErrorReported = false;
    tileLayer.on("load", () => mapDebug("Tile layer cargado: true"));
    tileLayer.on("tileerror", () => {
      if (tileErrorReported) return;
      tileErrorReported = true;
      mapDebug("Tile layer cargado: false");
      setText("#mapFooterNotice", "El mapa base no pudo cargar algunos tiles. Revise la conectividad del entorno interno.");
    });
    tileLayer.addTo(map);
    mapDebug("Tile layer agregado: true");

    if (data.limite_corrientes) state.boundaryLayer = L.geoJSON(data.limite_corrientes, { style: { color: "#3d7478", weight: 1.4, fillColor: "#8db8b7", fillOpacity: .10 } }).addTo(map);
    state.markerLayer = L.layerGroup().addTo(map);
    state.selectedProducerLayer = L.layerGroup().addTo(map);
    const bounds = state.boundaryLayer?.getBounds?.();
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [26, 26] });
    mapDebug("Bounds calculados", bounds?.isValid?.() ? boundsSummary(bounds) : null);
    map.on("zoomend", () => renderOperationalMarkers(state));
    if (APP_CONFIG.DEBUG_MAP === true) {
      state.debugMarker = L.circleMarker([-28.8, -57.7], { radius: 8, color: "#d06b3c", weight: 2, fillColor: "#f0a25a", fillOpacity: .95 }).addTo(map);
      state.debugMarker.bindTooltip("Marcador de diagnóstico", { direction: "top" });
      mapDebug("Marcador fijo de diagnóstico agregado: true");
    }
    const invalidate = () => {
      if (!state.map) return;
      state.map.invalidateSize({ pan: false });
      reportMapVisualState(state, "Después de invalidateSize");
    };
    requestAnimationFrame(() => requestAnimationFrame(invalidate));
    setTimeout(invalidate, 100);
    window.addEventListener("resize", invalidate, { passive: true });
    map.whenReady(() => { invalidate(); mapDebug("Mapa Leaflet inicializado: true"); });
    reportMapVisualState(state, "Después de init");
    return map;
  }

  function boundsSummary(bounds) {
    if (!bounds?.isValid?.()) return null;
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    return { south: Number(southWest.lat.toFixed(4)), west: Number(southWest.lng.toFixed(4)), north: Number(northEast.lat.toFixed(4)), east: Number(northEast.lng.toFixed(4)) };
  }

  function reportMapVisualState(state, stage) {
    const container = state.container;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mapDebug(stage, {
      selector: "#producerMap",
      containerFound: true,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      children: container.children.length,
      mapInstance: Boolean(state.map),
      tileLayer: Boolean(state.tileLayer),
      markers: state.markerLayer?.getLayers?.().length || 0,
      visibleProducers: state.visible?.length || 0,
    });
  }

  function initPublicTerritory(data) {
    $("#mapLevelControl").hidden = false;
    $("#producerAdvancedFilters").hidden = true;
    $("#clearOperationalFiltersButton").hidden = true;
    ["#drawAreaButton", "#finishAreaButton", "#clearAreaButton"].forEach((selector) => { const button = $(selector); if (button) button.hidden = selector !== "#finishAreaButton" && selector !== "#clearAreaButton" ? false : true; });
    const totals = data.totales;
    const speciesSelect = $("#speciesSelect");
    const deptSelect = $("#departmentSelect");
    const municipalitySelect = $("#municipalitySelect");
    const officeSelect = $("#officeSelect");
    const mapLevelSelect = $("#mapLevelSelect");
    const map = $("#territoryMap");
    const filters = readGlobalFilters();
    const preferredLayer = APP_CONFIG.MAP_PREFERRED_LAYER === "highest_available_aggregation" ? "grid" : (APP_CONFIG.MAP_PREFERRED_LAYER || "grid");
    const state = { filters, species: filters.species, department: filters.department, mapLevel: preferredLayer, mode: "browse", vertices: [], selected: [], activeGrids: [], projection: null, zoom: false };
    const redraw = (resetLocation = false) => {
      if (resetLocation) {
        state.vertices = [];
        state.selected = [];
        state.zoom = false;
      }
      syncLocationControls(data, state.filters, { species: speciesSelect, department: deptSelect, municipality: municipalitySelect, office: officeSelect });
      if (mapLevelSelect) mapLevelSelect.value = state.mapLevel;
      state.species = state.filters.species;
      state.department = state.filters.department;
      state.mode = "browse";
      saveGlobalFilters(state.filters);
      renderTerritory(data, state);
    };
    bindLocationControls(data, state.filters, { species: speciesSelect, department: deptSelect, municipality: municipalitySelect, office: officeSelect }, () => redraw(true));
    mapLevelSelect?.addEventListener("change", () => { state.mapLevel = mapLevelSelect.value; state.vertices = []; state.selected = []; state.zoom = false; renderTerritory(data, state); });

    $("#drawAreaButton")?.addEventListener("click", () => {
      state.mode = "drawing";
      state.vertices = [];
      state.selected = [];
      state.zoom = false;
      renderTerritory(data, state);
    });
    $("#finishAreaButton")?.addEventListener("click", () => finishSelection(data, state));
    $("#clearAreaButton")?.addEventListener("click", () => {
      state.mode = "browse";
      state.vertices = [];
      state.selected = [];
      state.zoom = false;
      renderTerritory(data, state);
    });
    $("#resetMapViewButton")?.addEventListener("click", () => {
      state.zoom = false;
      renderTerritory(data, state);
    });
    map?.addEventListener("click", (event) => {
      if (state.mode !== "drawing") return;
      const point = clientToSvgPoint(event, map);
      state.vertices.push(point);
      renderTerritory(data, state);
    });
    map?.addEventListener("keydown", (event) => {
      if (state.mode === "drawing" && event.key === "Enter") finishSelection(data, state);
    });
    redraw(true);
    registerModelTool({
      name: "set_territorial_filter",
      title: "Filtrar mapa territorial",
      description: "Actualiza el mapa de Corrientes por especie y filtro territorial agregado.",
      inputSchema: { type: "object", properties: { especie: { type: "string", enum: SPECIES.map(([key]) => key) }, departamento: { type: "string" }, municipio: { type: "string" }, oficina: { type: "string" } }, required: ["especie"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || !SPECIES.some(([key]) => key === input.especie)) throw new Error("Especie no válida.");
        const requestedDepartment = input.departamento || "all";
        if (![...deptSelect.options].some((option) => option.value === requestedDepartment)) throw new Error("Departamento no válido.");
        state.filters.species = input.especie;
        state.filters.department = requestedDepartment;
        state.filters.municipality = input.municipio || "";
        state.filters.office = input.oficina || "";
        redraw(true);
        return { especie: input.especie, departamento: requestedDepartment, municipio: state.filters.municipality || null, oficina: state.filters.office || null, grillas_visibles: state.activeGrids.length };
      },
    });
  }

  function getCategoriesForSpecies(speciesKey, producers) {
    const normalizedSpecies = normalizeSpeciesKey(speciesKey);
    const definitions = PRODUCER_CATEGORY_SCHEMA[normalizedSpecies] || [];
    if (!definitions.length) return [];
    const allowed = new Set(definitions.map(([key]) => key));
    const present = new Set();
    for (const item of producers || []) {
      Object.keys(item.categorias || {}).forEach((key) => { if (allowed.has(key)) present.add(key); });
      if (present.size === allowed.size) break;
    }
    return definitions.filter(([key]) => present.has(key)).map(([key, label]) => ({ key, label }));
  }

  function updateCategoryOptions(speciesKey, state) {
    const select = $("#producerCategorySelect");
    if (!select) return [];
    const categories = getCategoriesForSpecies(speciesKey, state?.records || []);
    const allowed = new Set(categories.map((item) => item.key));
    if (state?.category && !allowed.has(state.category)) state.category = "";
    select.disabled = !categories.length;
    select.innerHTML = categories.length
      ? `<option value="">Todas las categorías</option>${categories.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")}`
      : '<option value="">Sin categorías disponibles para esta especie</option>';
    select.value = state?.category || "";
    const control = $("#producerCategoryControl");
    if (control) { control.hidden = false; control.classList.toggle("is-disabled", !categories.length); }
    const hint = $("#producerCategoryHint");
    if (hint) hint.textContent = categories.length ? `Categorías disponibles para ${speciesLabel(normalizeSpeciesKey(speciesKey))}.` : "Sin categorías disponibles para esta especie";
    if (state) state.availableCategories = categories.map((item) => item.key);
    return categories;
  }

  function operationalRows(state) {
    const filters = state.filters || defaultFilters();
    filters.species = normalizeSpeciesKey(filters.species) || "bovinos";
    const all = state.records || [];
    const effective = state.includeZeroStock ? all : all.filter((item) => Number(item.totalExistencias) > 0);
    const selectedSpecies = filters.species === "all" ? "" : normalizeSpeciesKey(filters.species);
    const compatibleCategories = state.availableCategories || getCategoriesForSpecies(selectedSpecies, state.records || []).map((item) => item.key);
    if (state.category && !compatibleCategories.includes(state.category)) {
      state.category = "";
      const categorySelect = $("#producerCategorySelect");
      if (categorySelect) categorySelect.value = "";
    }
    const speciesAvailable = !selectedSpecies || effective.some((item) => speciesValue(item, selectedSpecies) > 0);
    state.speciesWarning = selectedSpecies && !speciesAvailable ? `La fuente interna no contiene valores positivos para ${speciesLabel(selectedSpecies)}.` : "";
    const bySpecies = !selectedSpecies || !speciesAvailable ? effective : effective.filter((item) => speciesValue(item, selectedSpecies) > 0 || (state.includeZeroStock && Number(item.totalExistencias) === 0));
    const byDepartment = bySpecies.filter((item) => filters.department === "all" || !filters.department || item.departamento === filters.department);
    const byMunicipality = byDepartment.filter((item) => !filters.municipality || item.municipio === filters.municipality);
    const byOffice = byMunicipality.filter((item) => !filters.office || item.oficinaLocal === filters.office);
    const byCategory = byOffice.filter((item) => !state.category || positiveNumber(item.categorias?.[state.category]) > 0);
    const rows = byCategory.filter((item) => Number(item.totalExistencias) >= Number(state.minStock || 0));
    state.diagnostics = {
      raw: Number(state.sourceSummary?.rawRows ?? state.allRecords?.length ?? all.length),
      normalized: Number(state.sourceSummary?.normalizedRows ?? state.allRecords?.length ?? all.length),
      coordinates: Number(state.sourceSummary?.coordinateRows ?? all.length),
      effective: effective.length,
      species: bySpecies.length,
      department: byDepartment.length,
      municipality: byMunicipality.length,
      office: byOffice.length,
      category: byCategory.length,
      final: rows.length,
      selectedSpecies: selectedSpecies || "all",
      includeZeroStock: Boolean(state.includeZeroStock),
      minStock: Number(state.minStock || 0),
    };
    mapDebug("Filtrado operativo por etapas", state.diagnostics);
    return rows;
  }

  function renderOperationalTerritory(data, state) {
    const rows = operationalRows(state);
    let selectedProducer = state.selectedProducer || state.selected;
    if (selectedProducer && !rows.some((item) => item.id === selectedProducer.id)) { clearOperationalSelection(state); selectedProducer = null; }
    state.visible = rows;
    renderOperationalMarkers(state);
    renderOperationalMetrics(rows, state);
    renderOperationalPanel(rows, state);
    renderOperationalFilterChips(state, rows.length);
    setText("#selectionStatus", selectedProducer ? `Unidad seleccionada · ${selectedProducer.displayId}` : `${formatNumber.format(rows.length)} productores georreferenciados visibles · seleccione un punto para ver el detalle.`);
    const warning = $("#internalFilterWarning");
    if (warning) { warning.hidden = !state.speciesWarning; warning.textContent = state.speciesWarning; }
    setText("#selectedSummary", `${formatNumber.format(rows.length)} puntos visibles`);
    setText("#tableSummary", state.records.length ? "La tabla pública conserva el resumen agregado." : "Sin fuente individual georreferenciada.");
    updateOperationalEmptyState(state, rows.length);
    const sourceData = data || state.data || {};
    renderQualitySummary(sourceData, state.filters, filterRows(sourceData.municipios || [], state.filters));
  }

  function updateOperationalEmptyState(state, visibleCount) {
    const empty = $("#producerMapEmpty");
    if (!empty || !state.map) return;
    if (!state.records.length) {
      showOperationalEmpty("No se pudo cargar la fuente interna. Contacte al administrador del dashboard.");
      return;
    }
    if (!visibleCount) {
      showOperationalEmpty("No hay productores visibles para los filtros seleccionados.");
      return;
    }
    empty.hidden = true;
  }

  function renderOperationalMetrics(rows, state) {
    const species = state.filters.species && state.filters.species !== "all" ? state.filters.species : "bovinos";
    const total = rows.reduce((sumValue, item) => sumValue + item.totalExistencias, 0);
    const selectedSpecies = rows.reduce((sumValue, item) => sumValue + positiveNumber(item.especies?.[species]), 0);
    const top = [...rows].sort((a, b) => speciesValue(b, species) - speciesValue(a, species)).slice(0, 5).reduce((sumValue, item) => sumValue + speciesValue(item, species), 0);
    setText("#metricRecords", formatNumber.format(rows.length));
    setText("#metricBovinos", formatNumber.format(selectedSpecies || total));
    setText("#territorySpeciesLabel", selectedSpecies ? speciesLabel(species).toUpperCase() : "EXISTENCIAS TOTALES");
    setText("#metricDensity", rows.length ? `${(selectedSpecies / rows.length).toLocaleString("es-AR", { maximumFractionDigits: 1 })} cabezas / unidad` : "Sin unidades visibles");
    setText("#metricConcentration", selectedSpecies ? `${Math.round((top / selectedSpecies) * 100)}%` : "—");
    setText("#metricGrids", formatNumber.format(rows.length));
    setText("#metricMapped", `${formatNumber.format(rows.length)} georreferenciados · Según filtros activos`);
  }

  function renderOperationalMarkers(state) {
    if (!state.markerLayer || !state.map) return;
    state.markerLayer.clearLayers();
    state.selectedProducerLayer?.clearLayers?.();
    const rows = state.visible || [];
    const limit = Number(APP_CONFIG.INTERNAL_MAX_MARKERS || 800);
    const shouldCluster = rows.length > limit;
    const groups = shouldCluster ? makeOperationalClusters(rows, state.map.getZoom()) : rows.map((item) => ({ items: [item], lat: item.lat, lon: item.lon }));
    mapDebug("Marcadores operativos renderizados", { visibleRows: rows.length, markerGroups: groups.length, clustered: shouldCluster, zoom: state.map.getZoom() });
    groups.forEach((group) => {
      if (group.items.length > 1) {
        const marker = L.marker([group.lat, group.lon], { icon: L.divIcon({ className: "producer-cluster-icon", html: `<span class="producer-cluster">${formatNumber.format(group.items.length)}</span>`, iconSize: [46, 46], iconAnchor: [23, 23] }), zIndexOffset: 500, riseOnHover: true });
        marker.bindTooltip(`${formatNumber.format(group.items.length)} productores agrupados`, { direction: "top" });
        marker.on("click", () => {
          clearOperationalSelection(state);
          state.clusterSelection = group.items;
          state.selectionSource = "cluster";
          const bounds = L.latLngBounds(group.items.map((item) => [item.lat, item.lon]));
          state.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12, animate: true });
          renderOperationalTerritory(state.data, state);
        });
        state.markerLayer.addLayer(marker);
        return;
      }
      const item = group.items[0];
      if ((state.selectedProducer || state.selected)?.id === item.id) return;
      const radius = markerRadius(speciesValue(item, state.filters.species), rows, state.filters.species);
      const markerColor = speciesColor(dominantProducerSpecies(item));
      const marker = L.marker([item.lat, item.lon], { icon: L.divIcon({ className: "producer-marker-icon", html: `<span class="producer-marker" style="--marker-color:${markerColor};width:${radius}px;height:${radius}px"></span>`, iconSize: [radius + 8, radius + 8], iconAnchor: [(radius + 8) / 2, (radius + 8) / 2] }), zIndexOffset: 100, riseOnHover: true });
      marker.bindTooltip(producerTooltip(item, state), { direction: "top", opacity: .96 });
      marker.on("click", () => selectProducer(item, { state, source: "map" }));
      state.markerLayer.addLayer(marker);
    });
    renderSelectedProducerLayer(state);
    reportMapVisualState(state, "Después de agregar productores");
  }

  function makeOperationalClusters(rows, zoom) {
    const step = zoom < 8 ? .45 : zoom < 10 ? .16 : .06;
    const groups = new Map();
    rows.forEach((item) => { const key = `${Math.round(item.lat / step)}:${Math.round(item.lon / step)}`; const group = groups.get(key) || { items: [] }; group.items.push(item); groups.set(key, group); });
    return [...groups.values()].map(clusterGroup);
  }

  function clusterGroup(group) {
    return { ...group, lat: group.items.reduce((sumValue, item) => sumValue + item.lat, 0) / group.items.length, lon: group.items.reduce((sumValue, item) => sumValue + item.lon, 0) / group.items.length };
  }

  function markerRadius(value, rows, species) { const max = Math.max(...rows.map((item) => speciesValue(item, species)), 1); return Math.round(10 + Math.min(12, Math.sqrt(Math.max(0, value) / max) * 12)); }
  function speciesColor(species) { return ({ bovinos: "#2e8d89", bubalinos: "#b17841", ovinos: "#6d91ad", caprinos: "#8b72a5", porcinos: "#9c6472", equinos: "#597d92" })[species] || "#2e8d89"; }
  function sameCoordinateCount(item, records) { return (records || []).filter((candidate) => candidate.lat === item.lat && candidate.lon === item.lon).length; }
  function producerTooltip(item, state) {
    const sharedCount = sameCoordinateCount(item, state?.records);
    const shared = sharedCount > 1 ? `<span class="producer-shared-note">Ubicación compartida por ${formatNumber.format(sharedCount)} productores.</span>` : "";
    const selectedSpecies = normalizeSpeciesKey(state?.filters?.species) || "bovinos";
    return `<div class="producer-popup"><strong>${escapeHtml(item.displayId)}</strong><span>${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación administrativa no informada")}</span><span><b>${formatNumber.format(speciesValue(item, selectedSpecies))}</b> ${escapeHtml(speciesLabel(selectedSpecies).toLowerCase())} · ${formatNumber.format(item.totalExistencias)} total</span>${shared}</div>`;
  }
  function dominantProducerSpecies(item) {
    const dominant = Object.entries(item.especies || {}).sort((a, b) => b[1] - a[1])[0];
    return dominant && Number(dominant[1]) > 0 ? dominant[0] : "sin especie informada";
  }

  function selectProducer(item, options = {}) {
    const state = options.state || activeOperationalState;
    if (!state || !item || !validCoordinatePair(item.lat, item.lon)) {
      mapDebug("Selección rechazada", { producerId: Boolean(item?.id), latLonValid: validCoordinatePair(item?.lat, item?.lon) });
      return false;
    }
    if (options.ensureVisible) ensureOperationalItemVisible(item, state);
    clearOperationalSelection(state);
    state.selected = item;
    state.selectedProducer = item;
    state.selectionSource = options.source || "map";
    state.map?.setView([item.lat, item.lon], Math.max(state.map.getZoom(), 15), { animate: true });
    state.map?.invalidateSize?.({ pan: false });
    renderOperationalTerritory(state.data, state);
    mapDebug("Productor seleccionado", { source: state.selectionSource, producerId: Boolean(item.id), latLonValid: true, highlightedMarkerCreated: Boolean(state.selectedMarker), panelUpdated: Boolean($("#producerDetail") && !$("#producerDetail").hidden) });
    return true;
  }

  function renderSelectedProducerLayer(state) {
    const layer = state.selectedProducerLayer;
    const item = state.selectedProducer || state.selected;
    if (!layer || !state.map || !item || !validCoordinatePair(item.lat, item.lon)) return;
    const sharedCount = sameCoordinateCount(item, state.records);
    const selectedSpecies = normalizeSpeciesKey(state.filters.species) || "bovinos";
    const marker = L.marker([item.lat, item.lon], { icon: L.divIcon({ className: "selected-producer-icon", html: `<span class="selected-producer-marker" aria-hidden="true"></span>`, iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: 5000, riseOnHover: true });
    marker.bindPopup(`<div class="producer-popup"><strong>Productor localizado</strong><span>${escapeHtml(item.displayId)}</span><span>${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación administrativa no informada")}</span><span><b>${formatNumber.format(speciesValue(item, selectedSpecies))}</b> ${escapeHtml(speciesLabel(selectedSpecies).toLowerCase())} · ${formatNumber.format(item.totalExistencias)} total</span>${sharedCount > 1 ? `<span class="producer-shared-note">Ubicación compartida por ${formatNumber.format(sharedCount)} productores.</span>` : ""}</div>`, { closeButton: true, autoPan: true });
    layer.addLayer(marker);
    state.selectedMarker = marker;
    marker.openPopup();
  }

  function ensureOperationalItemVisible(item, state) {
    const filters = state.filters;
    if (filters.species !== "all" && speciesValue(item, filters.species) <= 0) {
      const candidate = dominantProducerSpecies(item);
      if (candidate !== "sin especie informada") filters.species = candidate;
    }
    filters.department = item.departamento || "all";
    filters.municipality = item.municipio || "";
    filters.office = item.oficinaLocal || "";
    state.category = "";
    state.minStock = 0;
    state.includeZeroStock = true;
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncOperationalLocationControls(state.records, filters, controls);
    updateCategoryOptions(filters.species, state);
    const includeZero = $("#includeZeroStock"); if (includeZero) includeZero.checked = true;
    const advanced = $("#producerAdvancedFilters"); if (advanced) advanced.open = false;
    saveGlobalFilters(filters);
  }

  function renderOperationalPanel(rows, state) {
    const list = $("#focusList"), detail = $("#producerDetail"), close = $("#closeProducerDetailButton");
    const selectedProducer = state.selectedProducer || state.selected;
    if (selectedProducer && APP_CONFIG.ENABLE_PRODUCER_DETAIL !== false) {
      list.hidden = true; detail.hidden = false; close.hidden = false;
      detail.innerHTML = producerDetailMarkup(selectedProducer, { sharedCount: sameCoordinateCount(selectedProducer, state.records), species: state.filters.species, categories: state.availableCategories || [] });
      setText("#focusEyebrow", String(state.selectionSource || "").startsWith("search") ? "PRODUCTOR LOCALIZADO" : "FICHA OPERATIVA"); setText("#focusTitle", "Detalle de unidad"); setText("#focusFootnote", "Información interna desagregada. No compartir ni publicar sin autorización.");
      return;
    }
    if (selectedProducer) {
      list.hidden = false; detail.hidden = true; close.hidden = true;
      list.innerHTML = "<p class=\"empty-panel-message\">El detalle individual está deshabilitado en esta configuración.</p>";
      return;
    }
    detail.hidden = true; list.hidden = false; close.hidden = true;
    if ((state.clusterSelection && state.clusterSelection.length) || (state.locatorMatches && state.locatorMatches.length)) {
      const matches = state.locatorMatches || state.clusterSelection;
      const isSearch = Boolean(state.locatorMatches);
      close.hidden = false;
      setText("#focusEyebrow", isSearch ? "RESULTADOS DEL LOCALIZADOR" : "CLUSTER OPERATIVO");
      setText("#focusTitle", isSearch ? "Productores localizados" : "Productores agrupados");
      setText("#focusFootnote", "Seleccione una fila para centrar el mapa y abrir la ficha desagregada.");
      list.innerHTML = `<p class="cluster-summary">${isSearch ? "Coincidencias encontradas en la fuente interna." : "El mapa agrupa puntos coincidentes para mantener la legibilidad."}</p>${matches.slice(0, 20).map((item, index) => `<button class="ranking-item operational-focus-row cluster-list-item" type="button" data-producer-id="${escapeHtml(item.id)}"><span class="ranking-index focus-rank">${String(index + 1).padStart(2, "0")}</span><span class="ranking-main"><strong class="ranking-title">${escapeHtml(item.displayId)}</strong><small class="ranking-location">${escapeHtml([item.departamento, item.municipio, item.oficinaLocal].filter(Boolean).join(" · ") || "Ubicación no informada")}</small></span><span class="ranking-value"><b>${formatNumber.format(speciesValue(item, state.filters.species))}</b><em class="ranking-unit">${escapeHtml(speciesLabel(state.filters.species).toLowerCase())}</em></span></button>`).join("")}${matches.length > 20 ? `<p class="cluster-summary">Se muestran las primeras 20 de ${formatNumber.format(matches.length)} coincidencias.</p>` : ""}`;
      list.querySelectorAll("[data-producer-id]").forEach((button) => button.addEventListener("click", () => { const item = matches.find((row) => row.id === button.dataset.producerId); if (item) selectProducer(item, { state, source: isSearch ? "search-result-list" : "cluster-list", ensureVisible: isSearch }); }));
      return;
    }
    setText("#focusEyebrow", "RANKING OPERATIVO"); setText("#focusTitle", "Unidades destacadas"); setText("#focusFootnote", "Seleccione un productor en el mapa para consultar su ficha operativa.");
    list.innerHTML = rows.length ? [...rows].sort((a, b) => speciesValue(b, state.filters.species) - speciesValue(a, state.filters.species)).slice(0, 7).map((item, index) => `<button class="ranking-item operational-focus-row" type="button" data-producer-id="${escapeHtml(item.id)}"><span class="ranking-index focus-rank">${String(index + 1).padStart(2, "0")}</span><span class="ranking-main"><strong class="ranking-title">${escapeHtml(item.displayId)}</strong><small class="ranking-location">${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación no informada")}</small></span><span class="ranking-value"><b>${formatNumber.format(speciesValue(item, state.filters.species))}</b><em class="ranking-unit">${escapeHtml(speciesLabel(state.filters.species).toLowerCase())}</em></span></button>`).join("") : "<p class=\"empty-panel-message\">No hay productores visibles para los filtros seleccionados.</p>";
    list.querySelectorAll("[data-producer-id]").forEach((button) => button.addEventListener("click", () => { const item = rows.find((row) => row.id === button.dataset.producerId); if (item) selectProducer(item, { state, source: "ranking" }); }));
  }

  function producerDetailMarkup(item, options = {}) {
    const total = item.totalExistencias || 1;
    const selectedSpecies = normalizeSpeciesKey(options.species) || "bovinos";
    const selectedSpeciesValue = speciesValue(item, selectedSpecies);
    const orderedSpecies = Object.entries(item.especies || {}).sort((a, b) => a[0] === selectedSpecies ? -1 : b[0] === selectedSpecies ? 1 : b[1] - a[1]);
    const bars = orderedSpecies.map(([key, value]) => `<div class="producer-bar${key === selectedSpecies ? " is-priority" : ""}"><span>${escapeHtml(speciesLabel(key))}</span><i style="--share:${Math.min(100, value / total * 100)}%"></i><b>${formatNumber.format(value)}</b></div>`).join("") || "<p class=\"empty-panel-message\">No se informaron valores desagregados.</p>";
    const compatible = new Set(options.categories || []);
    const categoryRows = Object.entries(item.categorias || {}).filter(([key, value]) => compatible.has(key) && positiveNumber(value) > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<tr><td>${escapeHtml(PRODUCER_CATEGORY_LABELS[key] || titleCase(key.replaceAll("_", " ")))}</td><td>${formatNumber.format(value)}</td></tr>`).join("") || `<tr><td colspan="2">Sin categorías de ${escapeHtml(speciesLabel(selectedSpecies).toLowerCase())} informadas.</td></tr>`;
    const location = [item.departamento, item.municipio, item.oficinaLocal, item.paraje].filter(Boolean).join(" · ") || "Ubicación administrativa no informada";
    const sharedNotice = Number(options.sharedCount || 0) > 1 ? `<p class="producer-shared-note">Ubicación compartida por ${formatNumber.format(options.sharedCount)} productores.</p>` : "";
    return `<div class="producer-detail-header"><h3>${escapeHtml(item.displayId)}</h3><p>${escapeHtml(location)}</p><small class="producer-detail-id">ID operativo: ${escapeHtml(item.id)}${item.renspaMasked ? ` · RENSPA: ${escapeHtml(item.renspaMasked)}` : ""}</small>${sharedNotice}</div><div class="producer-kpis"><div class="is-priority"><span>${escapeHtml(speciesLabel(selectedSpecies))}</span><strong>${formatNumber.format(selectedSpeciesValue)}</strong></div><div><span>Total general</span><strong>${formatNumber.format(item.totalExistencias)}</strong></div></div><section class="producer-detail-section"><h4>Existencias por especie</h4><div class="producer-bars">${bars}</div></section><section class="producer-detail-section"><h4>Categorías de ${escapeHtml(speciesLabel(selectedSpecies))}</h4><table class="producer-detail-table"><tbody>${categoryRows}</tbody></table></section>`;
  }

  function renderOperationalFilterChips(state, count) {
    const target = $("#territoryFilterChips"); if (!target) return;
    const labels = [
      ["Especie ganadera", state.filters.species && state.filters.species !== "all" ? speciesLabel(state.filters.species) : "Todas"],
      ["Departamento", state.filters.department !== "all" ? titleCase(state.filters.department) : "Todos"],
      ["Municipio", state.filters.municipality ? titleCase(state.filters.municipality) : "Todos"],
      ["Oficina local", state.filters.office ? titleCase(state.filters.office) : "Todas"],
      ["Categoría", state.category ? (PRODUCER_CATEGORY_LABELS[state.category] || titleCase(state.category.replaceAll("_", " "))) : state.availableCategories?.length ? "Todas" : "Sin categorías disponibles"],
      ["Mínimo", state.minStock ? `${formatNumber.format(state.minStock)} cabezas` : "Sin mínimo"],
      ["Cero", state.includeZeroStock ? "Incluidos" : "Excluidos"],
    ];
    target.innerHTML = `<span class="filter-count">${formatNumber.format(count)} visibles</span>${labels.map(([label, value]) => `<span class="operational-filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join("")}`;
  }

  function showOperationalEmpty(message) {
    const empty = $("#producerMapEmpty"); if (!empty) return;
    const text = message || "No se encontró la fuente interna de productores. Contacte al administrador del dashboard.";
    const failed = /Leaflet|inicializaci[oó]n|cargar el mapa/i.test(text);
    const noVisible = /No hay productores visibles/i.test(text);
    empty.hidden = false; empty.innerHTML = `<div><h3>${failed ? "No se pudo cargar el mapa" : noVisible ? "Sin productores visibles" : "Modo interno preparado"}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function renderTerritory(data, state) {
    const grids = filterGrids(data.grillas, state.filters);
    const municipalities = filterRows(data.municipios, state.filters);
    const label = speciesLabel(state.species);
    state.activeGrids = grids;
    renderMap(data, grids, state);
    const selected = state.mode === "selected" ? state.selected : null;
    renderFocus(selected || grids, state.species, label);
    renderMunicipalities(municipalities);
    const localTotal = sum(municipalities, state.species);
    updateTerritoryMetrics(data, state.filters, municipalities, grids);
    renderQualitySummary(data, state.filters, municipalities);
    setText("#selectedSummary", state.mode === "selected" ? `${formatNumber.format(sum(state.selected, state.species))} ${label.toLowerCase()} en el área` : `${formatNumber.format(localTotal)} ${label.toLowerCase()}`);
    setText("#tableSummary", state.mode === "selected" ? "Detalle municipal según los filtros activos" : `${formatNumber.format(municipalities.length)} unidades territoriales`);
    updateSelectionPresentation(state, label, localTotal);
  }

  function finishSelection(data, state) {
    if (state.vertices.length < 3) {
      setText("#selectionStatus", "Marque al menos tres vértices para cerrar el polígono.");
      return;
    }
    if (!state.projection) return;
    state.selected = state.activeGrids.filter((item) => pointInPolygon(state.projection.project([item.lon, item.lat]), state.vertices));
    state.mode = "selected";
    state.zoom = true;
    renderTerritory(data, state);
  }

  function updateSelectionPresentation(state, label, localTotal) {
    const draw = $("#drawAreaButton");
    const finish = $("#finishAreaButton");
    const clear = $("#clearAreaButton");
    const status = $("#selectionStatus");
    const insight = $("#selectionInsight");
    const wrap = $(".map-canvas-wrap");
    wrap?.classList.toggle("selection-mode", state.mode === "drawing");
    if (draw) draw.textContent = state.mode === "drawing" ? "Dibujando…" : "Dibujar área";
    if (finish) finish.hidden = state.mode !== "drawing";
    if (clear) clear.hidden = state.mode === "browse";
    if (state.mode === "drawing") {
      setText("#selectionStatus", `${state.vertices.length} vértice${state.vertices.length === 1 ? "" : "s"} · haga clic para continuar y Finalizar área para calcular.`);
      if (insight) insight.innerHTML = `<div><p class="eyebrow">ÁREA DE CONSULTA</p><h3>Delimite un polígono sobre el mapa</h3><p>La selección se calcula sobre centros de grillas territoriales agregadas.</p></div>`;
      return;
    }
    if (state.mode === "selected") {
      const selectedSpecies = sum(state.selected, state.species);
      const selectedRecords = sum(state.selected, "registros");
      const share = localTotal ? selectedSpecies / localTotal * 100 : 0;
      const density = selectedRecords ? selectedSpecies / selectedRecords : 0;
      setText("#selectionStatus", `Área activa · ${formatNumber.format(state.selected.length)} grillas · zoom ajustado al polígono.`);
      if (insight) insight.innerHTML = `<div><p class="eyebrow">ÁREA SELECCIONADA</p><h3>${state.selected.length ? "Resultados de la zona delimitada" : "No se identificaron grillas dentro del polígono"}</h3><p>${state.selected.length ? "Los valores representan agregados de grillas cuyo centro cae dentro del área." : "Amplíe o desplace el polígono para incluir una zona de cobertura."}</p></div><div class="selection-metrics"><div><span>${escapeHtml(label)}</span><strong>${formatNumber.format(selectedSpecies)}</strong></div><div><span>Registros</span><strong>${formatNumber.format(selectedRecords)}</strong></div><div><span>Participación</span><strong>${formatDecimal.format(share)}%</strong></div><div><span>Cabezas/registro</span><strong>${formatDecimal.format(density)}</strong></div></div>`;
      return;
    }
    setText("#selectionStatus", "Modo consulta · active la selección para delimitar un área.");
    if (insight) insight.innerHTML = `<div><p class="eyebrow">ÁREA DE CONSULTA</p><h3>Delimite un polígono sobre el mapa</h3><p>Los resultados se calculan sobre grillas territoriales agregadas, no sobre ubicaciones exactas de establecimientos.</p></div>`;
  }

  function renderMap(data, grids, state) {
    const svg = $("#territoryMap");
    const pointsGroup = $("#mapPoints");
    const gridGroup = $("#mapGrid");
    const selectionLayer = $("#selectionLayer");
    const provincePath = $("#provinceShape");
    const tooltip = $("#mapTooltip");
    const projection = createMapProjection(data, grids);
    state.projection = projection;
    const defaultView = APP_CONFIG.MAP_DEFAULT_VIEW && APP_CONFIG.MAP_DEFAULT_VIEW !== "auto" ? APP_CONFIG.MAP_DEFAULT_VIEW : MAP_VIEW;
    svg.setAttribute("viewBox", state.zoom && state.vertices.length > 2 ? selectionViewBox(state.vertices) : defaultView);
    gridGroup.innerHTML = Array.from({ length: 8 }, (_, index) => {
      const x = projection.padding + index * ((projection.width - projection.padding * 2) / 7);
      const y = projection.padding + index * ((projection.height - projection.padding * 2) / 7);
      return `<path class="map-grid-line" d="M${x} ${projection.padding}V${projection.height - projection.padding}M${projection.padding} ${y}H${projection.width - projection.padding}"/>`;
    }).join("");
    if (projection.allCoords.length) {
      provincePath.setAttribute("d", geometryPath(data.limite_corrientes, projection.project));
      provincePath.setAttribute("class", "province-path");
    } else provincePath.setAttribute("d", "");
    selectionLayer.innerHTML = drawSelection(state.vertices, state.mode === "selected");
    const selectedKeys = new Set(state.selected.map(gridKey));
    const hasSelection = state.mode === "selected";
    const cells = mapDisplayItems(grids, state);
    const maxValue = Math.max(...cells.map((item) => item.mapValue), 1);
    pointsGroup.innerHTML = cells.map((item, index) => {
      const [x, y] = projection.project([item.lon, item.lat]);
      const [xLeft] = projection.project([item.lon - Number(APP_CONFIG.GRID_SIZE || 0.12) / 2, item.lat]);
      const [xRight] = projection.project([item.lon + Number(APP_CONFIG.GRID_SIZE || 0.12) / 2, item.lat]);
      const [, yTop] = projection.project([item.lon, item.lat + Number(APP_CONFIG.GRID_SIZE || 0.12) / 2]);
      const [, yBottom] = projection.project([item.lon, item.lat - Number(APP_CONFIG.GRID_SIZE || 0.12) / 2]);
      const width = Math.max(3, Math.abs(xRight - xLeft) - 1);
      const height = Math.max(3, Math.abs(yBottom - yTop) - 1);
      const classes = ["map-cell", hasSelection && selectedKeys.has(gridKey(item)) ? "is-selected" : "", hasSelection && !selectedKeys.has(gridKey(item)) ? "is-dimmed" : ""].filter(Boolean).join(" ");
      const intensity = Math.max(.12, Math.sqrt(item.mapValue / maxValue));
      return `<rect class="${classes}" data-index="${index}" tabindex="0" x="${(x - width / 2).toFixed(1)}" y="${(y - height / 2).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" style="--cell-intensity:${intensity.toFixed(3)}"><title>${escapeHtml(item.mapLabel)}: ${formatNumber.format(item.mapValue)} ${escapeHtml(speciesLabel(state.species).toLowerCase())} · ${formatNumber.format(item.mapRecords)} registros</title></rect>`;
    }).join("");
    pointsGroup.querySelectorAll(".map-cell").forEach((cell) => {
      const item = cells[Number(cell.dataset.index)];
      const show = (event) => {
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>${escapeHtml(item.mapLabel)}</strong><span>${escapeHtml(item.mapUnit)} · ${formatNumber.format(item.mapRecords)} registros</span><br><b>${formatNumber.format(item.mapValue)}</b> ${escapeHtml(speciesLabel(state.species).toLowerCase())}`;
        const box = svg.getBoundingClientRect();
        const x = event.clientX ? event.clientX - box.left + 14 : Number(cell.getAttribute("x")) / 800 * box.width + 15;
        const y = event.clientY ? event.clientY - box.top - 10 : Number(cell.getAttribute("y")) / 620 * box.height;
        tooltip.style.left = `${Math.min(Math.max(10, x), box.width - 220)}px`;
        tooltip.style.top = `${Math.min(Math.max(10, y), box.height - 95)}px`;
      };
      cell.addEventListener("pointerenter", show); cell.addEventListener("pointermove", show); cell.addEventListener("focus", show);
      cell.addEventListener("pointerleave", () => tooltip.hidden = true); cell.addEventListener("blur", () => tooltip.hidden = true);
    });
    setText("#mapLayerContext", `Capa: ${mapLevelLabel(state.mapLevel)} · ${formatNumber.format(cells.length)} celdas visibles`);
  }

  function mapDisplayItems(grids, state) {
    const level = state.mapLevel || "grid";
    if (level === "grid") return grids.map((item) => ({ ...item, mapValue: value(item, state.species), mapRecords: value(item, "registros"), mapLabel: titleCase(item.municipio || "Zona agregada"), mapUnit: "Grilla agregada" }));
    const key = level === "department" ? "departamento" : "municipio";
    const groups = new Map();
    grids.forEach((item) => {
      const groupName = item[key] || "Zona agregada";
      const current = groups.get(groupName) || { stock: 0, records: 0 };
      current.stock += value(item, state.species); current.records += value(item, "registros"); groups.set(groupName, current);
    });
    return grids.map((item) => { const group = groups.get(item[key] || "Zona agregada") || { stock: 0, records: 0 }; return { ...item, mapValue: group.stock, mapRecords: group.records, mapLabel: titleCase(item[key] || "Zona agregada"), mapUnit: `${mapLevelLabel(level)} · celdas agrupadas` }; });
  }

  function mapLevelLabel(level) { return ({ grid: "Grilla", municipality: "Municipio", department: "Departamento" })[level] || "Grilla"; }

  function createMapProjection(data, grids) {
    const allCoords = flattenCoords(data.limite_corrientes || { type: "", coordinates: [] });
    const fallback = grids.flatMap((item) => [[item.lon, item.lat]]);
    const coords = allCoords.length ? allCoords : fallback;
    const xs = coords.map((point) => point[0]); const ys = coords.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = 800, height = 620, padding = 48;
    const ratioX = (width - padding * 2) / (maxX - minX || 1);
    const ratioY = (height - padding * 2) / (maxY - minY || 1);
    const scale = Math.min(ratioX, ratioY);
    return { allCoords, width, height, padding, project: ([lon, lat]) => [padding + (lon - minX) * scale, height - padding - (lat - minY) * scale] };
  }

  function drawSelection(vertices, closed) {
    if (!vertices.length) return "";
    const points = vertices.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const shape = closed ? `<polygon class="selection-polygon" points="${points}"/>` : `<polyline class="selection-line" points="${points}"/>`;
    return `${shape}${vertices.map(([x, y]) => `<circle class="selection-vertex" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2"/>`).join("")}`;
  }

  function selectionViewBox(vertices) {
    const xs = vertices.map(([x]) => x), ys = vertices.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    let width = Math.max(110, maxX - minX + 90);
    let height = Math.max(90, maxY - minY + 90);
    const targetRatio = 800 / 620;
    if (width / height < targetRatio) width = height * targetRatio; else height = width / targetRatio;
    const x = Math.max(0, Math.min(800 - width, (minX + maxX - width) / 2));
    const y = Math.max(0, Math.min(620 - height, (minY + maxY - height) / 2));
    return `${x.toFixed(1)} ${y.toFixed(1)} ${Math.min(width, 800).toFixed(1)} ${Math.min(height, 620).toFixed(1)}`;
  }

  function clientToSvgPoint(event, svg) {
    const rect = svg.getBoundingClientRect();
    const values = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return [values[0] + (event.clientX - rect.left) / rect.width * values[2], values[1] + (event.clientY - rect.top) / rect.height * values[3]];
  }

  function pointInPolygon([x, y], vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i]; const [xj, yj] = vertices[j];
      const intersects = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function gridKey(item) { return `${item.lon}|${item.lat}`; }
  function speciesLabel(key) { return SPECIES.find(([species]) => species === key)?.[1] || key; }

  function renderFocus(grids, species, label) {
    const top = [...grids].sort((a, b) => value(b, species) - value(a, species)).slice(0, 7);
    $("#focusList").innerHTML = top.map((item, index) => `<div class="focus-item"><span class="rank">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(titleCase(item.municipio))}</strong><span>${escapeHtml(titleCase(item.departamento))} · ${formatNumber.format(item.registros)} registros</span></div><div class="focus-value">${formatNumber.format(value(item, species))}<span>${label}</span></div></div>`).join("") || '<p class="loading">Sin grillas para el área seleccionada.</p>';
  }

  function renderMunicipalities(items) {
    $("#municipalityRows").innerHTML = [...items].sort((a, b) => b.bovinos - a.bovinos).slice(0, 35).map((item) => `<tr><td>${escapeHtml(titleCase(item.nombre))}</td><td>${escapeHtml(titleCase(item.departamento))}</td><td>${escapeHtml(titleCase(item.oficina))}</td><td>${formatNumber.format(item.registros)}</td><td class="numeric">${formatNumber.format(item.bovinos)}</td><td class="numeric">${formatNumber.format(item.bubalinos)}</td><td class="numeric">${formatNumber.format(item.ovinos)}</td></tr>`).join("") || '<tr><td colspan="7">No hay datos para los filtros seleccionados.</td></tr>';
  }

  function initAnalysis(data) {
    const controls = {
      species: $("#analysisSpeciesSelect"), department: $("#analysisDepartmentSelect"), municipality: $("#analysisMunicipalitySelect"), office: $("#analysisOfficeSelect"),
      level: $("#analysisLevelSelect"), metric: $("#analysisMetricSelect"), detailSearch: $("#analysisDetailSearch"),
    };
    const state = { filters: readGlobalFilters(), level: "department", metric: "stock", detailSearch: "", scenarios: null, snapshot: null };
    const render = () => {
      syncLocationControls(data, state.filters, controls);
      const rows = filterRows(data.municipios, state.filters);
      const species = state.filters.species;
      const totalSpecies = sum(rows, species);
      const totalAnimals = sumSpecies(rows);
      const records = sum(rows, "registros");
      const units = aggregateUnits(rows, state.level);
      renderAnalysisCards(totalAnimals, totalSpecies, records, species);
      renderSpecies(rows, totalAnimals);
      renderBars(units, species, state.metric, totalSpecies, state.level);
      renderScatter(units, species, state.level);
      renderSpatialStatistics(data, state.filters, species);
      renderAnalysisDetail(units, species, totalSpecies, state.level, state.detailSearch);
      updateScenario(totalSpecies, species);
      renderInsight(units, species, totalSpecies, state.level);
      renderTraceability(data, rows, state.filters);
      renderActiveFilterChips(state.filters, rows.length, records);
      const quality = renderQualitySummary(data, state.filters, rows);
      state.snapshot = { data, filters: { ...state.filters }, rows, species, totalSpecies, totalAnimals, records, quality, scenarios: state.scenarios ? readScenarioSnapshot(state.scenarios, totalSpecies) : [] };
      saveGlobalFilters(state.filters);
    };
    bindLocationControls(data, state.filters, controls, render);
    controls.level.addEventListener("change", () => { state.level = controls.level.value; render(); });
    controls.metric.addEventListener("change", () => { state.metric = controls.metric.value; render(); });
    controls.detailSearch.addEventListener("input", () => { state.detailSearch = controls.detailSearch.value; renderAnalysisDetail(aggregateUnits(filterRows(data.municipios, state.filters), state.level), state.filters.species, sum(filterRows(data.municipios, state.filters), state.filters.species), state.level, state.detailSearch); });
    $("#resetAnalysisFilters")?.addEventListener("click", () => {
      state.filters = defaultFilters(); state.level = "department"; state.metric = "stock"; state.detailSearch = "";
      controls.level.value = state.level; controls.metric.value = state.metric; controls.detailSearch.value = ""; render();
    });
    state.scenarios = setupScenario(() => { if (state.snapshot) state.snapshot.scenarios = readScenarioSnapshot(state.scenarios, state.snapshot.totalSpecies); });
    $("#downloadSummaryButton")?.addEventListener("click", () => downloadSummary(state.snapshot));
    render();
    registerModelTool({
      name: "set_analysis_filter",
      title: "Filtrar análisis ganadero",
      description: "Actualiza el análisis por especie y filtro territorial agregado.",
      inputSchema: { type: "object", properties: { especie: { type: "string", enum: SPECIES.map(([key]) => key) }, departamento: { type: "string" }, municipio: { type: "string" }, oficina: { type: "string" } }, required: ["especie"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || !SPECIES.some(([key]) => key === input.especie)) throw new Error("Especie no válida.");
        state.filters.species = input.especie;
        state.filters.department = input.departamento || "all";
        state.filters.municipality = input.municipio || "";
        state.filters.office = input.oficina || "";
        render();
        return { especie: state.filters.species, departamento: state.filters.department, municipio: state.filters.municipality || null, oficina: state.filters.office || null };
      },
    });
  }

  function renderAnalysisCards(totalAnimals, totalSpecies, records, species) {
    const label = speciesLabel(species);
    setText("#metricAnimals", formatNumber.format(totalAnimals));
    setText("#metricSpeciesLabel", label.toUpperCase());
    setText("#metricBovinos", formatNumber.format(totalSpecies));
    setText("#metricBovineShare", `${formatDecimal.format(totalAnimals ? totalSpecies / totalAnimals * 100 : 0)}% de las existencias · Datos agregados`);
    setText("#metricRecordsAnalysis", formatNumber.format(records));
    setText("#metricDensity", formatDecimal.format(records ? totalSpecies / records : 0));
    setText("#metricDensityLabel", `${label.toLowerCase()} por registro · No representa productividad individual`);
  }

  function renderActiveFilterChips(filters, rows, records) {
    const target = $("#activeFilterSummary");
    if (!target) return;
    const parts = [["Especie", speciesLabel(filters.species)], ["Departamento", filters.department === "all" ? "Toda la provincia" : titleCase(filters.department)], ["Municipio", filters.municipality ? titleCase(filters.municipality) : "Todos"], ["Oficina local", filters.office ? titleCase(filters.office) : "Todas"]];
    target.innerHTML = `${parts.map(([label, text]) => `<span class="filter-chip" role="listitem"><b>${label}:</b> ${escapeHtml(text)}</span>`).join("")}<span class="filter-summary-count">${formatNumber.format(rows)} unidades · ${formatNumber.format(records)} registros</span>`;
  }

  function renderSpecies(rows, total) {
    let offset = 0;
    const segments = SPECIES.map(([key, , color]) => { const portion = total ? sum(rows, key) / total * 100 : 0; const result = `${color} ${offset}% ${offset + portion}%`; offset += portion; return result; });
    $("#speciesDonut").style.background = `conic-gradient(${segments.join(",")})`;
    setText("#donutTotal", formatNumber.format(total));
    $("#speciesLegend").innerHTML = SPECIES.map(([key, label, color]) => `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span class="legend-name">${label}</span><span class="legend-value">${formatNumber.format(sum(rows, key))}</span></div>`).join("");
  }

  function renderBars(units, species, metric, totalSpecies, level) {
    const ordered = [...units].sort((a, b) => metricValue(b, species, metric, totalSpecies) - metricValue(a, species, metric, totalSpecies)).slice(0, 10);
    const max = Math.max(...ordered.map((item) => metricValue(item, species, metric, totalSpecies)), 1);
    const metricLabel = { stock: `mayores existencias de ${speciesLabel(species).toLowerCase()}`, records: "más registros", density: `mayor intensidad de ${speciesLabel(species).toLowerCase()}`, share: "mayor participación" }[metric];
    setText("#rankingTitle", `${levelLabel(level)} con ${metricLabel}`);
    $("#departmentBars").innerHTML = ordered.map((item) => `<div class="bar-row"><span class="bar-label">${escapeHtml(titleCase(item.nombre))}</span><div class="bar-track"><div class="bar-fill" style="width:${metricValue(item, species, metric, totalSpecies) / max * 100}%"></div></div><strong class="bar-value">${formatMetric(metricValue(item, species, metric, totalSpecies), metric)}</strong></div>`).join("") || '<p class="loading">Sin unidades para el filtro seleccionado.</p>';
  }

  function renderScatter(units, species, level) {
    const maxRecords = Math.max(...units.map((item) => item.registros), 1); const maxStock = Math.max(...units.map((item) => value(item, species)), 1);
    setText("#scatterTitle", `Registros vs. ${speciesLabel(species).toLowerCase()}`);
    setText("#scatterAxisY", speciesLabel(species));
    setText("#scatterFootnote", `Cada punto representa ${level === "department" ? "un" : "una"} ${levelLabel(level).toLowerCase()}; el tamaño expresa ${speciesLabel(species).toLowerCase()} por registro.`);
    $("#scatterPoints").innerHTML = units.map((item) => { const density = value(item, species) / Math.max(item.registros, 1); const size = 8 + Math.min(18, Math.sqrt(density) / 2); return `<span class="scatter-point" title="${escapeHtml(titleCase(item.nombre))}: ${formatNumber.format(item.registros)} registros · ${formatNumber.format(value(item, species))} ${speciesLabel(species).toLowerCase()}" style="left:${item.registros / maxRecords * 92 + 3}%;bottom:${value(item, species) / maxStock * 88 + 3}%;width:${size}px;height:${size}px"></span>`; }).join("");
  }

  function renderSpatialStatistics(data, filters, species) {
    const grids = filterGrids(data.grillas, filters);
    const unavailableAtOffice = Boolean(filters.office);
    const stats = unavailableAtOffice ? null : calculateSpatialStats(grids, species);
    setText("#spatialStatsTitle", `Dispersión y concentración espacial de ${speciesLabel(species).toLowerCase()}`);
    setText("#spatialGridContext", unavailableAtOffice ? "No disponible por oficina local" : `${formatNumber.format(grids.length)} grillas agregadas`);
    if (!stats || !grids.length) {
      ["#statMedianGrid", "#statP90Grid", "#statSpatialCV", "#statGini", "#statHHI"].forEach((selector) => setText(selector, "—"));
      setText("#statisticalNarrative", unavailableAtOffice ? "Las grillas territoriales no incluyen oficina local; mantenga el filtro hasta municipio o departamento para consultar estadística espacial." : "No hay grillas agregadas comparables para el filtro seleccionado.");
      return;
    }
    setText("#statMedianGrid", formatNumber.format(stats.median));
    setText("#statP90Grid", formatNumber.format(stats.p90));
    setText("#statSpatialCV", `${formatDecimal.format(stats.cv)}%`);
    setText("#statGini", stats.gini.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
    setText("#statHHI", formatNumber.format(stats.hhi));
    setText("#statisticalNarrative", `La mediana es de ${formatNumber.format(stats.median)} ${speciesLabel(species).toLowerCase()} por grilla, mientras que el 10% superior supera ${formatNumber.format(stats.p90)}. La dispersión relativa (CV) es ${formatDecimal.format(stats.cv)}%; los índices de Gini e IHH describen concentración territorial y no productividad ni rentabilidad.`);
  }

  function calculateSpatialStats(grids, species) {
    const values = grids.map((item) => value(item, species));
    const total = sum(values);
    const mean = total / Math.max(values.length, 1);
    const deviation = Math.sqrt(sum(values.map((item) => (item - mean) ** 2)) / Math.max(values.length, 1));
    const ordered = [...values].sort((a, b) => a - b);
    const byDepartment = aggregateUnits(grids.map((item) => ({ ...item, nombre: item.municipio, oficina: "" })), "department");
    const hhi = sum(byDepartment.map((item) => (value(item, species) / Math.max(total, 1)) ** 2)) * 10000;
    const weightedRank = ordered.reduce((acc, item, index) => acc + (index + 1) * item, 0);
    const gini = total ? (2 * weightedRank) / (ordered.length * total) - (ordered.length + 1) / ordered.length : 0;
    return { median: quantile(ordered, .5), p90: quantile(ordered, .9), cv: mean ? deviation / mean * 100 : 0, hhi, gini };
  }

  function quantile(sorted, percentile) {
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index); const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  function setupScenario(onChange) {
    const cards = [...document.querySelectorAll(".scenario-card")];
    const state = cards.map((card) => ({ name: card.dataset.scenario, card }));
    const updateCard = (entry, stock, species) => {
      const price = entry.card.querySelector('[data-role="price"]');
      const cost = entry.card.querySelector('[data-role="cost"]');
      const p = Number(price?.value), c = Number(cost?.value);
      const hasPrice = Boolean(price?.value.trim()) && Number.isFinite(p) && p >= 0;
      const hasCost = Boolean(cost?.value.trim()) && Number.isFinite(c) && c >= 0;
      const set = (role, content) => { const target = entry.card.querySelector(`[data-role="${role}"]`); if (target) target.textContent = content; };
      set("margin", hasPrice && hasCost ? formatMoney.format(p - c) : "—");
      set("gross", hasPrice ? formatMoney.format(stock * p) : "Ingrese un supuesto");
      set("totalCost", hasCost ? formatMoney.format(stock * c) : "Ingrese un supuesto");
      set("net", hasPrice && hasCost ? formatMoney.format(stock * (p - c)) : "—");
      entry.stock = stock; entry.species = species; entry.price = hasPrice ? p : null; entry.cost = hasCost ? c : null;
    };
    state.forEach((entry) => entry.card.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => { updateCard(entry, entry.stock || 0, entry.species || "bovinos"); onChange?.(); })));
    state.update = (stock, species) => { state.forEach((entry) => updateCard(entry, stock, species)); setText("#scenarioIntro", "El escenario económico usa supuestos ingresados por el usuario. No representa precios oficiales, facturación real, rentabilidad individual ni flujo de caja."); setText("#scenarioTrace", `Simulación para ${formatNumber.format(stock)} ${speciesLabel(species).toLowerCase()} filtrados. Edite cada escenario para documentar supuestos.`); };
    cards[0]?.parentElement && (cards[0].parentElement._scenarioState = state);
    return state;
  }

  function updateScenario(stock, species) {
    const scenarios = document.querySelectorAll(".scenario-card");
    if (!scenarios.length) return;
    if (scenarios[0].parentElement?._scenarioState?.update) scenarios[0].parentElement._scenarioState.update(stock, species);
    else setText("#scenarioIntro", "El escenario económico usa supuestos ingresados por el usuario. No representa precios oficiales, facturación real, rentabilidad individual ni flujo de caja.");
  }

  function readScenarioSnapshot(state, stock) {
    return (state || []).map((entry) => ({ escenario: entry.name, valorPorCabeza: entry.price, costoPorCabeza: entry.cost, existencias: stock, valorTotal: entry.price == null ? null : stock * entry.price, costoTotal: entry.cost == null ? null : stock * entry.cost, resultadoNeto: entry.price == null || entry.cost == null ? null : stock * (entry.price - entry.cost) }));
  }

  function downloadSummary(snapshot) {
    if (!snapshot) return;
    const metadata = snapshot.data?.metadata || {};
    const rows = [
      ["Campo", "Valor"],
      ["Filtros activos", filterSummary(snapshot.filters, snapshot.rows.length, snapshot.records)],
      ["Fecha de corte", metadata.fecha_corte || metadata.fechaCorte || metadata.corte || metadata.periodo || "Fecha de corte no informada"],
      ["Fecha de descarga", new Date().toISOString()],
      ["Existencias totales filtradas", snapshot.totalAnimals],
      [`Existencias ${speciesLabel(snapshot.species)}`, snapshot.totalSpecies],
      ["Registros productivos", snapshot.records],
      ["Cabezas por registro", snapshot.records ? snapshot.totalSpecies / snapshot.records : 0],
      ["Estado de calidad", snapshot.quality?.label || "No disponible"],
      ["Advertencias", (snapshot.quality?.controls || []).filter((item) => item.status !== "pass").map((item) => item.detail).join(" | ") || "Ninguna"],
      ...((snapshot.scenarios || []).flatMap((item) => [[`Escenario ${item.escenario} · valor por cabeza`, item.valorPorCabeza ?? ""], [`Escenario ${item.escenario} · costo por cabeza`, item.costoPorCabeza ?? ""], [`Escenario ${item.escenario} · margen`, item.valorPorCabeza != null && item.costoPorCabeza != null ? item.valorPorCabeza - item.costoPorCabeza : ""], [`Escenario ${item.escenario} · valor total`, item.valorTotal ?? ""], [`Escenario ${item.escenario} · costo total`, item.costoTotal ?? ""], [`Escenario ${item.escenario} · resultado neto`, item.resultadoNeto ?? ""]])),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `resumen-agregado-corrientes-${new Date().toISOString().slice(0, 10)}.csv`; link.setAttribute("aria-hidden", "true"); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderAnalysisDetail(units, species, totalSpecies, level, search) {
    const query = String(search || "").trim().toLocaleLowerCase("es-AR");
    const shown = [...units].filter((item) => !query || [item.nombre, item.departamento, item.oficina].some((text) => String(text || "").toLocaleLowerCase("es-AR").includes(query))).sort((a, b) => value(b, species) - value(a, species));
    setText("#detailTitle", `Detalle por ${levelLabel(level).toLowerCase()}`);
    setText("#detailPrimaryHeader", levelLabel(level));
    setText("#detailScopeHeader", level === "department" ? "Cobertura filtrada" : "Departamento");
    $("#analysisDetailRows").innerHTML = shown.map((item) => `<tr><td>${escapeHtml(titleCase(item.nombre))}</td><td>${escapeHtml(titleCase(item.departamento || "—"))}</td><td>${escapeHtml(titleCase(item.oficina || "—"))}</td><td class="numeric">${formatNumber.format(item.registros)}</td><td class="numeric">${formatNumber.format(value(item, species))}</td><td class="numeric">${formatDecimal.format(item.registros ? value(item, species) / item.registros : 0)}</td><td class="numeric">${formatDecimal.format(totalSpecies ? value(item, species) / totalSpecies * 100 : 0)}%</td></tr>`).join("") || '<tr><td colspan="7">Sin unidades para el filtro seleccionado.</td></tr>';
    setText("#detailFootnote", `${formatNumber.format(shown.length)} unidades agregadas · El detalle no contiene RENSPA, titulares ni ubicaciones exactas.`);
  }

  function renderInsight(units, species, totalSpecies, level) {
    const first = [...units].sort((a, b) => value(b, species) - value(a, species))[0];
    if (!first) { setText("#insightTitle", "No hay unidades para el corte seleccionado"); setText("#insightText", "Restablezca o amplíe los filtros para recuperar la población de análisis."); return; }
    const share = value(first, species) / Math.max(totalSpecies, 1) * 100;
    setText("#insightTitle", `${titleCase(first.nombre)} lidera el corte seleccionado`);
    setText("#insightText", `Con ${formatNumber.format(value(first, species))} ${speciesLabel(species).toLowerCase()}, representa ${formatDecimal.format(share)}% del stock de la especie en el nivel ${levelLabel(level).toLowerCase()}.`);
  }

  function renderTraceability(data, rows, filters) {
    const target = $("#sourceTraceability");
    if (!target) return;
    const date = new Date(data.metadata.actualizado).toLocaleDateString("es-AR");
    const cutoff = data.metadata.fecha_corte || data.metadata.fechaCorte || data.metadata.corte || data.metadata.periodo || "Fecha de corte no informada";
    target.innerHTML = `<ul class="trace-list"><li><span>Fuente</span><strong>${escapeHtml(data.metadata.fuente)}</strong></li><li><span>Fecha de corte</span><strong class="${cutoff === "Fecha de corte no informada" ? "warning-text" : ""}">${escapeHtml(cutoff)}</strong></li><li><span>Actualización</span><strong>${date}</strong></li><li><span>Corte activo</span><strong>${escapeHtml(filterSummary(filters, rows.length, sum(rows, "registros")))}</strong></li><li><span>Unidad</span><strong>Registro, municipio, departamento, oficina local y grilla territorial agregada.</strong></li><li><span>Privacidad</span><strong>No contiene RENSPA, titulares, contactos ni coordenadas exactas.</strong></li><li><span>Límite</span><strong>${escapeHtml(data.metadata.alcance)}</strong></li></ul>`;
  }

  function defaultFilters() { return { species: "bovinos", department: "all", municipality: "", office: "" }; }

  function readGlobalFilters() {
    try {
      const stored = JSON.parse(sessionStorage.getItem("senasa-corrientes-filters-v1") || "{}");
      return { ...defaultFilters(), ...stored, species: normalizeSpeciesKey(stored.species) || "bovinos" };
    } catch { return defaultFilters(); }
  }

  function saveGlobalFilters(filters) {
    try { sessionStorage.setItem("senasa-corrientes-filters-v1", JSON.stringify({ species: filters.species, department: filters.department, municipality: filters.municipality, office: filters.office })); } catch { /* La consulta sigue funcionando sin persistencia local. */ }
  }

  function syncLocationControls(data, filters, controls) {
    const departments = data.departamentos.map((item) => item.nombre);
    if (!departments.includes(filters.department)) { filters.department = "all"; filters.municipality = ""; filters.office = ""; }
    const departmentRows = data.municipios.filter((item) => filters.department === "all" || item.departamento === filters.department);
    if (filters.municipality && !departmentRows.some((item) => item.nombre === filters.municipality)) { filters.municipality = ""; filters.office = ""; }
    const municipalityRows = departmentRows.filter((item) => !filters.municipality || item.nombre === filters.municipality);
    if (filters.office && !municipalityRows.some((item) => item.oficina === filters.office)) filters.office = "";
    if (controls.species) controls.species.innerHTML = SPECIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    if (controls.department) controls.department.innerHTML = `<option value="all">Toda la provincia</option>${departments.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(titleCase(name))}</option>`).join("")}`;
    if (controls.municipality) {
      const locations = uniqueBy(departmentRows, (item) => `${item.departamento}|${item.nombre}`);
      controls.municipality.innerHTML = `<option value="">Todos los municipios</option>${locations.map((item) => `<option value="${locationValue([item.departamento, item.nombre])}">${escapeHtml(titleCase(item.nombre))}${filters.department === "all" ? ` · ${escapeHtml(titleCase(item.departamento))}` : ""}</option>`).join("")}`;
    }
    if (controls.office) {
      const locations = uniqueBy(municipalityRows, (item) => `${item.departamento}|${item.nombre}|${item.oficina}`);
      controls.office.innerHTML = `<option value="">Todas las oficinas</option>${locations.map((item) => `<option value="${locationValue([item.departamento, item.nombre, item.oficina])}">${escapeHtml(titleCase(item.oficina))} · ${escapeHtml(titleCase(item.nombre))}</option>`).join("")}`;
    }
    if (controls.species) controls.species.value = filters.species;
    if (controls.department) controls.department.value = filters.department;
    if (controls.municipality) controls.municipality.value = filters.municipality ? locationValue([filters.department, filters.municipality]) : "";
    if (controls.office) controls.office.value = filters.office ? locationValue([filters.department, filters.municipality, filters.office]) : "";
  }

  function bindLocationControls(data, filters, controls, onChange) {
    const update = () => { syncLocationControls(data, filters, controls); onChange(); };
    controls.species?.addEventListener("change", () => { filters.species = controls.species.value; update(); });
    controls.department?.addEventListener("change", () => { filters.department = controls.department.value; filters.municipality = ""; filters.office = ""; update(); });
    controls.municipality?.addEventListener("change", () => {
      if (!controls.municipality.value) { filters.municipality = ""; filters.office = ""; update(); return; }
      const [department, municipality] = parseLocationValue(controls.municipality.value);
      filters.department = department; filters.municipality = municipality; filters.office = ""; update();
    });
    controls.office?.addEventListener("change", () => {
      if (!controls.office.value) { filters.office = ""; update(); return; }
      const [department, municipality, office] = parseLocationValue(controls.office.value);
      filters.department = department; filters.municipality = municipality; filters.office = office; update();
    });
  }

  // The internal producer feed has a different grain from the public
  // municipality aggregate. Build its slicers from the same records that are
  // rendered on the map, so a public-only value cannot hide every marker.
  function syncOperationalLocationControls(records, filters, controls) {
    const rows = records || [];
    const departments = [...new Set(rows.map((item) => item.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    if (filters.department !== "all" && !departments.includes(filters.department)) { filters.department = "all"; filters.municipality = ""; filters.office = ""; }
    const departmentRows = rows.filter((item) => filters.department === "all" || item.departamento === filters.department);
    const municipalities = [...new Set(departmentRows.map((item) => item.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    if (filters.municipality && !municipalities.includes(filters.municipality)) { filters.municipality = ""; filters.office = ""; }
    const municipalityRows = departmentRows.filter((item) => !filters.municipality || item.municipio === filters.municipality);
    const offices = [...new Set(municipalityRows.map((item) => item.oficinaLocal).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    if (filters.office && !offices.includes(filters.office)) filters.office = "";
    if (controls.species) controls.species.innerHTML = SPECIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    if (controls.department) controls.department.innerHTML = `<option value="all">Toda la provincia</option>${departments.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(titleCase(name))}</option>`).join("")}`;
    if (controls.municipality) controls.municipality.innerHTML = `<option value="">Todos los municipios</option>${municipalities.map((name) => `<option value="${locationValue([filters.department, name])}">${escapeHtml(titleCase(name))}${filters.department === "all" ? "" : ""}</option>`).join("")}`;
    if (controls.office) controls.office.innerHTML = `<option value="">Todas las oficinas</option>${offices.map((name) => `<option value="${locationValue([filters.department, filters.municipality, name])}">${escapeHtml(titleCase(name))}</option>`).join("")}`;
    if (controls.species) controls.species.value = normalizeSpeciesKey(filters.species) || "bovinos";
    if (controls.department) controls.department.value = filters.department;
    if (controls.municipality) controls.municipality.value = filters.municipality ? locationValue([filters.department, filters.municipality]) : "";
    if (controls.office) controls.office.value = filters.office ? locationValue([filters.department, filters.municipality, filters.office]) : "";
  }

  function bindOperationalLocationControls(records, filters, controls, onChange, onSpeciesChange) {
    const update = () => { syncOperationalLocationControls(records, filters, controls); saveGlobalFilters(filters); onChange(); };
    controls.species?.addEventListener("change", () => { filters.species = normalizeSpeciesKey(controls.species.value) || "bovinos"; onSpeciesChange?.(); update(); });
    controls.department?.addEventListener("change", () => { filters.department = controls.department.value; filters.municipality = ""; filters.office = ""; update(); });
    controls.municipality?.addEventListener("change", () => {
      if (!controls.municipality.value) { filters.municipality = ""; filters.office = ""; update(); return; }
      const [, municipality] = parseLocationValue(controls.municipality.value);
      filters.municipality = municipality; filters.office = ""; update();
    });
    controls.office?.addEventListener("change", () => {
      if (!controls.office.value) { filters.office = ""; update(); return; }
      const [, , office] = parseLocationValue(controls.office.value);
      filters.office = office; update();
    });
  }

  function locationValue(parts) { return parts.map((part) => encodeURIComponent(part || "")).join("::"); }
  function parseLocationValue(value) { return String(value).split("::").map((part) => decodeURIComponent(part)); }
  function uniqueBy(items, key) { const seen = new Set(); return items.filter((item) => { const current = key(item); if (seen.has(current)) return false; seen.add(current); return true; }); }
  function filterRows(rows, filters) { return rows.filter((item) => (filters.department === "all" || item.departamento === filters.department) && (!filters.municipality || item.nombre === filters.municipality) && (!filters.office || item.oficina === filters.office)); }
  function filterGrids(grids, filters) { return grids.filter((item) => (filters.department === "all" || item.departamento === filters.department) && (!filters.municipality || item.municipio === filters.municipality)); }
  function sumSpecies(rows) { return SPECIES.reduce((total, [key]) => total + sum(rows, key), 0); }

  function aggregateUnits(rows, level) {
    const groups = new Map();
    rows.forEach((row) => {
      const municipality = row.municipio || row.nombre || "Sin municipio";
      const office = row.oficina || "Sin oficina";
      const key = level === "department" ? row.departamento : level === "municipality" ? `${row.departamento}|${municipality}` : `${row.departamento}|${municipality}|${office}`;
      if (!groups.has(key)) groups.set(key, { nombre: level === "department" ? row.departamento : level === "municipality" ? municipality : office, departamento: row.departamento || "", municipio: municipality, oficina: level === "office" ? office : "", registros: 0, bovinos: 0, bubalinos: 0, equinos: 0, porcinos: 0, caprinos: 0, ovinos: 0 });
      const target = groups.get(key); target.registros += value(row, "registros"); SPECIES.forEach(([species]) => { target[species] += value(row, species); });
    });
    return [...groups.values()];
  }

  function metricValue(item, species, metric, totalSpecies) {
    if (metric === "records") return value(item, "registros");
    if (metric === "density") return value(item, species) / Math.max(value(item, "registros"), 1);
    if (metric === "share") return value(item, species) / Math.max(totalSpecies, 1) * 100;
    return value(item, species);
  }
  function formatMetric(metric, kind) { return kind === "share" ? `${formatDecimal.format(metric)}%` : kind === "density" ? formatDecimal.format(metric) : formatNumber.format(metric); }
  function levelLabel(level) { return ({ department: "Departamento", municipality: "Municipio", office: "Oficina local" })[level] || "Unidad"; }
  function filterSummary(filters, rows, records) { const parts = [speciesLabel(filters.species), filters.department === "all" ? "Toda la provincia" : titleCase(filters.department), filters.municipality ? titleCase(filters.municipality) : "", filters.office ? titleCase(filters.office) : ""].filter(Boolean); return `${parts.join(" · ")} · ${formatNumber.format(rows)} agregados municipio–oficina · ${formatNumber.format(records)} registros`; }

  function updateTerritoryMetrics(data, filters, rows, grids) {
    const species = filters.species; const records = sum(rows, "registros"); const stock = sum(rows, species); const sorted = [...grids].sort((a, b) => value(b, species) - value(a, species)); const topFive = sum(sorted.slice(0, 5), species);
    setText("#territorySpeciesLabel", speciesLabel(species).toUpperCase());
    setText("#metricRecords", formatNumber.format(records));
    setText("#metricMapped", `${formatNumber.format(grids.length)} grillas agregadas`);
    setText("#metricBovinos", formatNumber.format(stock));
    setText("#metricDensity", `${formatDecimal.format(records ? stock / records : 0)} cabezas / registro`);
    setText("#metricConcentration", `${formatDecimal.format(stock ? topFive / stock * 100 : 0)}%`);
    setText("#metricGrids", formatNumber.format(grids.length));
  }

  function registerModelTool(tool) {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    try { void Promise.resolve(context.registerTool(tool)).catch((error) => console.warn("No se pudo registrar la herramienta del sitio", error)); } catch (error) { console.warn("No se pudo registrar la herramienta del sitio", error); }
  }

  function flattenCoords(geometry) { const collect = (entry) => Array.isArray(entry?.[0]) ? entry.flatMap(collect) : [entry]; return geometry?.coordinates ? collect(geometry.coordinates).filter((point) => Array.isArray(point) && Number.isFinite(point[0])) : []; }
  function geometryPath(geometry, project) { const rings = []; const draw = (coords) => { if (Array.isArray(coords?.[0]?.[0])) coords.forEach(draw); else if (Array.isArray(coords?.[0])) rings.push(`M${coords.map((point) => project(point).map((v) => v.toFixed(1)).join(",")).join("L")}Z`); }; draw(geometry.coordinates); return rings.join(" "); }
  function titleCase(text) { return String(text || "").toLocaleLowerCase("es-AR").replace(/(^|[\s\-.(])(\p{L})/gu, (_match, prefix, char) => `${prefix}${char.toLocaleUpperCase("es-AR")}`); }
  function escapeHtml(text) { return String(text ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
})();
