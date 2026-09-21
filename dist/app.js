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
  const canShowFullIdentifiers = () => APP_CONFIG.PUBLIC_SAFE_MODE !== true && APP_CONFIG.INTERNAL_MODE === true && APP_CONFIG.SHOW_FULL_IDENTIFIERS === true;
  function formatIdentifier(value, type, options = {}) {
    const text = String(value ?? "").trim();
    if (!text) return "No informado";
    if (options.full === true || canShowFullIdentifiers()) return text;
    return maskIdentifier(text);
  }
  const SECURE_LOCATOR_ENDPOINT = window.APP_CONFIG?.SECURE_LOCATOR_ENDPOINT || null;
  const PERF_START = performance.now();
  let internalProducerLookup = new Map();
  let internalSearchIndexPromise = null;
  let activeOperationalState = null;
  let missingRenspaKeyWarningShown = false;
  const DEBUG_SENSITIVE_KEYS = /^(lat|lon|latitude|longitude|south|west|north|east|renspa|dni|cuit|cuil|nombre|name|domicilio|direccion|coordinatesExact)$/i;
  function sanitizeMapDebug(value, key = "") {
    if (DEBUG_SENSITIVE_KEYS.test(key)) return "[omitido]";
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMapDebug(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([childKey, childValue]) => [childKey, sanitizeMapDebug(childValue, childKey)]));
    if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 237)}…` : value;
    return value;
  }
  const mapDebug = (...args) => {
    if (APP_CONFIG.DEBUG_MAP !== true) return;
    const safeArgs = args.map((item) => item && typeof item === "object" ? JSON.stringify(sanitizeMapDebug(item)) : String(item));
    console.info(`[SENASA mapa] ${safeArgs.join(" ")}`);
  };
  const perfLog = (label, startedAt, extra = "") => {
    if (APP_CONFIG.DEBUG_PERF !== true) return performance.now() - startedAt;
    const duration = Math.round(performance.now() - startedAt);
    console.info(`[PERF] ${label}: ${duration} ms${extra ? ` · ${extra}` : ""}`);
    return duration;
  };
  const perfMeasureMarks = (label, startMark, endMark) => {
    if (APP_CONFIG.DEBUG_PERF !== true) return;
    const start = performance.getEntriesByName(startMark).at(-1);
    const end = performance.getEntriesByName(endMark).at(-1);
    if (start && end) console.info(`[PERF] ${label}: ${Math.round(end.startTime - start.startTime)} ms`);
  };
  setupNavigation();
  perfMeasureMarks("config", "senasa-config-start", "senasa-config-end");
  loadData();

  async function loadData() {
    const dataUrl = APP_CONFIG.DATA_URL || "./data/senasa-corrientes.json";
    try {
      const fetchStarted = performance.now();
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} al leer la base agregada.`);
      const text = await response.text();
      perfLog("base agregada download", fetchStarted);
      const parseStarted = performance.now();
      const data = JSON.parse(text);
      perfLog("base agregada parse", parseStarted);
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
    if (!endpoint && isInternalOperationalMode() && activeOperationalState) {
      const normalized = normalizeIdentifier(identifier);
      const searchIndex = await ensureInternalSearchIndex();
      const types = searchTypesFor(identifierType, normalized);
      const availableTypes = types.filter((type) => Object.keys(searchIndex?.indexes?.[type] || {}).length > 0);
      if (identifierType !== "auto" && !availableTypes.length) return { found: false, message: "La fuente interna actual no contiene ese identificador." };
      const references = types.flatMap((type) => {
        const found = searchIndex?.indexes?.[type]?.[normalized];
        return (found ? (Array.isArray(found) ? found : [found]) : []).map((entry) => ({ entry, type }));
      });
      const matchTypesById = new Map();
      references.forEach(({ entry, type }) => {
        const id = typeof entry === "string" ? entry : entry?.id;
        if (id) matchTypesById.set(id, [...new Set([...(matchTypesById.get(id) || []), type])]);
      });
      const matches = [...matchTypesById.entries()].map(([id, matchTypes]) => {
        const item = internalProducerLookup.get(id);
        return item ? { ...item, locatorMatchTypes: matchTypes, locatorMaskedIdentifier: maskSearchIdentifier(normalized, matchTypes[0]) } : null;
      }).filter(Boolean);
      const noMatchMessage = identifierType === "renspa" ? "No se encontró productor para ese RENSPA." : "No se encontró productor para ese identificador.";
      return matches.length ? { found: true, matches, message: "Productor localizado en la fuente interna. Los identificadores completos no se muestran." } : { found: false, message: noMatchMessage };
    }
    if (!endpoint) return { found: false, message: "La búsqueda por identificador requiere un servicio seguro autenticado. Esta versión pública sólo permite análisis agregado." };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifierType, identifier }) });
    if (!response.ok) throw new Error("Servicio protegido no disponible.");
    return response.json();
  }

  async function ensureInternalSearchIndex() {
    if (internalSearchIndexPromise) return internalSearchIndexPromise;
    const url = activeOperationalState?.searchIndexUrl || APP_CONFIG.INTERNAL_SEARCH_INDEX_URL;
    if (!url) return null;
    internalSearchIndexPromise = (async () => {
      const started = performance.now();
      const response = await fetch(absoluteInternalUrl(url), { cache: "no-store" });
      if (!response.ok) throw new Error("Índice protegido no disponible.");
      const payload = JSON.parse(await response.text());
      if (payload?.format !== "senasa-search-index-v1") throw new Error("Índice protegido inválido.");
      perfLog("search index", started);
      return payload;
    })().catch((error) => { internalSearchIndexPromise = null; throw error; });
    return internalSearchIndexPromise;
  }

  function normalizeIdentifier(raw) {
    return String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);
  }

  function searchTypesFor(identifierType, normalized) {
    if (identifierType === "renspa") return ["renspa"];
    if (identifierType === "dni") return ["dni", "document"];
    if (identifierType === "cuit_cuil") return ["cuit", "cuil", "cuit_cuil", "document"];
    if (identifierType === "internal_id") return ["internal_id"];
    if (/^\d{11}$/.test(normalized)) return ["renspa", "cuit", "cuil", "cuit_cuil", "document", "internal_id"];
    if (/^\d{7,9}$/.test(normalized)) return ["renspa", "dni", "document", "internal_id"];
    return ["renspa", "cuit", "cuil", "cuit_cuil", "dni", "document", "internal_id"];
  }

  function maskSearchIdentifier(value, type) {
    const digits = String(value || "").replace(/\D/g, "");
    if (type === "dni" || type === "document") return digits ? `DNI **${digits.slice(-4)}` : "DNI enmascarado";
    if (["cuit", "cuil", "cuit_cuil"].includes(type)) return digits.length >= 3 ? `CUIT/CUIL ${digits.slice(0, 2)}-********-${digits.slice(-1)}` : "CUIT/CUIL enmascarado";
    return "Identificador enmascarado";
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
      mapDebug("Modo interno activo; iniciando mapa antes de la fuente individual.");
      let state;
      try { state = initOperationalTerritory(data, { records: [], loading: true, message: "Cargando productores…" }); } catch (_error) {
        mapDebug("Error controlado durante la inicialización del mapa operativo.");
        showOperationalEmpty("Leaflet no está disponible o falló la inicialización.");
        return;
      }
      const source = await loadInternalProducerSource();
      hydrateOperationalSource(state, source);
      return;
    }
    mapDebug("Modo público seguro activo; se conserva la capa agregada.");
    initPublicTerritory(data);
  }

  function isInternalOperationalMode() {
    const configuredInternal = APP_CONFIG.APP_MODE === "internal" || (!APP_CONFIG.APP_MODE && APP_CONFIG.INTERNAL_MODE === true);
    return configuredInternal && APP_CONFIG.PUBLIC_SAFE_MODE !== true && APP_CONFIG.SHOW_PRODUCER_POINTS === true;
  }

  function internalLoadError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function absoluteInternalUrl(resourceUrl, baseUrl = window.location.href) {
    const raw = String(resourceUrl || "").trim();
    if (!raw) throw internalLoadError("manifest-invalid", "El manifest interno no contiene una ruta válida.");
    const pageBase = new URL(baseUrl, window.location.href);
    // Chunk URLs are intentionally rooted at the site (the manifest stores
    // ./data/interno/...). Resolving them against the manifest directory would
    // incorrectly produce /data/interno/data/interno/....
    if (/^\.?\/data\//i.test(raw) || /^data\//i.test(raw)) return new URL(raw.replace(/^\.\//, ""), `${pageBase.origin}/`).toString();
    return new URL(raw, pageBase).toString();
  }

  function debugResourceLabel(resourceUrl) {
    try {
      const pathname = new URL(resourceUrl, window.location.href).pathname;
      return pathname.split("/").filter(Boolean).slice(-2).join("/") || pathname;
    } catch (_error) {
      return "recurso interno";
    }
  }

  function chunkRecords(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") throw internalLoadError("chunk-invalid", "El fragmento interno no es un objeto JSON válido.");
    for (const key of ["records", "data", "rows", "producers"]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    throw internalLoadError("chunk-invalid", "El fragmento interno no contiene un array de productores.");
  }

  function internalLoadMessage(error) {
    if (error?.code === "manifest-http") return `No se encontró el manifest interno (HTTP ${error.status || "desconocido"}). Revise la ruta y los permisos del despliegue.`;
    if (error?.code === "manifest-network") return "No se pudo solicitar el manifest interno. Revise la conectividad y la protección del despliegue.";
    if (error?.code === "manifest-invalid") return "El manifest interno no tiene el formato esperado. Revise format y chunks.";
    if (error?.code === "chunks-unavailable") return "No se pudieron cargar los fragmentos internos. Revise rutas, permisos y estados HTTP en Network.";
    if (error?.code === "chunks-invalid") return "Los fragmentos internos no tienen un formato válido. Revise que cada archivo contenga un array de productores.";
    if (error?.code === "no-coordinates") return "Productores cargados pero sin coordenadas válidas. Revise la base interna.";
    return "No se pudo cargar la fuente interna. Contacte al administrador del dashboard.";
  }

  async function loadInternalProducerSource() {
    const url = APP_CONFIG.INTERNAL_PRODUCER_DATA_URL;
    if (!url) {
      mapDebug("No hay INTERNAL_PRODUCER_DATA_URL configurado.");
      return { records: [], message: "No se encontró la fuente interna de productores. Contacte al administrador del dashboard." };
    }
    let manifestUrl;
    try {
      manifestUrl = absoluteInternalUrl(url);
      mapDebug("Manifest interno solicitado", { url: manifestUrl });
      let response;
      const manifestStarted = performance.now();
      try {
        response = await fetch(manifestUrl, { cache: "no-store" });
      } catch (error) {
        throw internalLoadError("manifest-network", error?.message || "Error de red al solicitar el manifest.");
      }
      mapDebug("Respuesta del manifest interno", { status: response.status, ok: response.ok });
      if (!response.ok) throw internalLoadError("manifest-http", `HTTP ${response.status}`, { status: response.status });
      let payload;
      try {
        payload = JSON.parse(await response.text());
        perfLog("manifest", manifestStarted);
      } catch (error) {
        throw internalLoadError("manifest-invalid", error?.message || "JSON inválido en el manifest interno.");
      }
      const hasChunkList = Array.isArray(payload?.chunks) || Array.isArray(payload?.files) || Array.isArray(payload?.fragments);
      const supportedManifest = ["senasa-producers-chunks-v1", "senasa-producers-index-v2"].includes(payload?.format);
      if (hasChunkList && !supportedManifest) throw internalLoadError("manifest-invalid", "El manifest declara fragmentos, pero no usa un formato soportado.");
      const isChunkManifest = supportedManifest;
      if (isChunkManifest) {
        const manifestChunks = Array.isArray(payload.chunks) ? payload.chunks : (Array.isArray(payload.files) ? payload.files : (Array.isArray(payload.fragments) ? payload.fragments : null));
        if (!manifestChunks?.length) throw internalLoadError("manifest-invalid", "El manifest no contiene chunks.");
        mapDebug("Manifest interno válido", { chunksTotal: manifestChunks.length, recordsDeclared: Number(payload.records) || 0 });
        setOperationalLoadingStatus(`Cargando productores 0/${manifestChunks.length}…`);
        const chunksStarted = performance.now();
        let chunksLoadedCount = 0;
        let parseDuration = 0;
        const chunkResults = await Promise.allSettled(manifestChunks.map(async (chunk, index) => {
          const chunkResource = chunk?.url || chunk?.path || chunk?.href;
          const chunkUrl = absoluteInternalUrl(chunkResource, manifestUrl);
          let chunkResponse;
          try {
            chunkResponse = await fetch(chunkUrl, { cache: "no-store" });
          } catch (error) {
            throw internalLoadError("chunk-network", error?.message || "Error de red al solicitar el fragmento.", { index, chunkUrl });
          }
          if (!chunkResponse.ok) throw internalLoadError("chunk-http", `HTTP ${chunkResponse.status}`, { index, chunkUrl, status: chunkResponse.status });
          let chunkPayload;
          try {
            const chunkText = await chunkResponse.text();
            const parseStarted = performance.now();
            chunkPayload = JSON.parse(chunkText);
            parseDuration += performance.now() - parseStarted;
          } catch (error) {
            throw internalLoadError("chunk-invalid", error?.message || "JSON inválido en el fragmento.", { index, chunkUrl });
          }
          const records = chunkRecords(chunkPayload);
          chunksLoadedCount += 1;
          setOperationalLoadingStatus(`Cargando productores ${chunksLoadedCount}/${manifestChunks.length}…`);
          return { index, chunkUrl, records };
        }));
        perfLog("chunks download", chunksStarted, `${chunksLoadedCount}/${manifestChunks.length} fragmentos`);
        if (APP_CONFIG.DEBUG_PERF === true) console.info(`[PERF] parse producers: ${Math.round(parseDuration)} ms`);
        const loadedChunks = [];
        const failedChunks = [];
        chunkResults.forEach((result, index) => {
          if (result.status === "fulfilled") loadedChunks.push(result.value);
          else {
            const reason = result.reason || {};
            failedChunks.push({ index, status: reason.status || null, code: reason.code || "chunk-error", resource: debugResourceLabel(reason.chunkUrl || manifestChunks[index]?.url || manifestChunks[index]?.path || manifestChunks[index]?.href) });
          }
        });
        mapDebug("Carga de fragmentos internos", { chunksTotal: manifestChunks.length, chunksLoaded: loadedChunks.length, chunksFailed: failedChunks.length, failed: failedChunks });
        if (!loadedChunks.length) throw internalLoadError(failedChunks.some((item) => item.code === "chunk-invalid") ? "chunks-invalid" : "chunks-unavailable", "No se pudo cargar ningún fragmento.", { failedChunks });
        const combinedRecords = loadedChunks.flatMap((item) => item.records);
        if (!failedChunks.length && Number(payload.records) !== combinedRecords.length) throw internalLoadError("chunks-invalid", "La cantidad de productores no coincide con el manifest.");
        mapDebug("Productores combinados desde fragmentos", { chunksLoaded: loadedChunks.length, recordsCombined: combinedRecords.length });
        payload = { records: combinedRecords, report: payload.report || undefined, searchIndex: payload.searchIndex, detailManifest: payload.detailManifest, _wireSpecies: payload.species, _detailChunks: payload.detailChunks };
        payload._fragmentSummary = { chunksTotal: manifestChunks.length, chunksLoaded: loadedChunks.length, chunksFailed: failedChunks.length, partial: failedChunks.length > 0 };
      }
      missingRenspaKeyWarningShown = false;
      setOperationalLoadingStatus("Preparando filtros…");
      const normalizeStarted = performance.now();
      const normalized = normalizeProducerData(payload);
      perfLog("normalización de productores", normalizeStarted);
      // The localizer only returns points that can be safely located on the
      // operational map; records without valid coordinates remain in the
      // diagnostics count but are not selectable.
      internalProducerLookup = new Map(normalized.filter((item) => validCoordinatePair(item.lat, item.lon)).map((item) => [item.id, item]));
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
      const fragmentSummary = payload?._fragmentSummary || {};
      const summary = {
        rawRows: Number(sourceReport.rowsRead ?? normalized.length),
        normalizedRows: Number(sourceReport.validProducers ?? normalized.length),
        coordinateRows: mapped.length,
        coordinateRowsOutsideProvince: outsideCorrientes,
        missingCoordinates: normalized.length - withCoordinates.length,
        effectiveRows: effective,
        zeroTotalRows: zeroTotal,
        negativeTotalRows: normalized.filter((item) => item.totalExistencias < 0).length,
        departments: countValues(normalized, "departamento"),
        renspaSearchKeys: normalized.filter((item) => Boolean(item.searchKeys?.renspa)).length,
        identifiersCoverage: Object.fromEntries(Object.entries(sourceReport.identifierCoverage || {}).map(([type, coverage]) => [type, Number(coverage?.outputRows || 0)])),
        speciesRows: Object.fromEntries(SPECIES.map(([key]) => [key, normalized.filter((item) => speciesValue(item, key) > 0).length])),
        ...fragmentSummary,
      };
      mapDebug("Fuente interna normalizada", summary);
      if (normalized.length && !mapped.length) {
        summary.loadError = "no-coordinates";
        return { records: [], allRecords: normalized, summary, message: internalLoadMessage(internalLoadError("no-coordinates")) };
      }
      const message = summary.partial ? `Datos internos cargados parcialmente (${summary.chunksLoaded}/${summary.chunksTotal} fragmentos). Revise el estado de los fragmentos.` : "Datos internos cargados.";
      return { records: mapped, allRecords: normalized, summary, message, searchIndexUrl: payload?.searchIndex || APP_CONFIG.INTERNAL_SEARCH_INDEX_URL, detailManifestUrl: payload?.detailManifest || APP_CONFIG.INTERNAL_PRODUCER_DETAIL_MANIFEST_URL };
    } catch (error) {
      internalProducerLookup = new Map();
      const message = internalLoadMessage(error);
      mapDebug("Carga interna fallida", { code: error?.code || "internal-load", status: error?.status || null, message, manifest: manifestUrl ? debugResourceLabel(manifestUrl) : null });
      return { records: [], allRecords: [], summary: { rawRows: 0, normalizedRows: 0, coordinateRows: 0, loadError: error?.code || "internal-load" }, message };
    }
  }

  function setOperationalLoadingStatus(message) {
    setText("#selectionStatus", message);
    setText("#mapLayerContext", message);
    const notice = $("#internalModeNotice");
    if (notice) { notice.hidden = false; notice.innerHTML = `<strong>Modo interno operativo</strong> · ${escapeHtml(message)}`; }
  }

  function validCoordinatePair(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
  function isCorrientesCoordinate(lat, lon) { return validCoordinatePair(lat, lon) && lat >= -31.5 && lat <= -26 && lon >= -60.8 && lon <= -55; }
  function countValues(rows, key) { return new Set(rows.map((item) => safeText(item?.[key])).filter(Boolean)).size; }
  function speciesValue(item, key) { const normalized = normalizeSpeciesKey(key); return positiveNumber(item?.especies?.[normalized || key]); }

  function normalizeProducerData(rawData) {
    const rows = Array.isArray(rawData) ? rawData : (rawData?.records || rawData?.rows || rawData?.data || []);
    if (!Array.isArray(rows)) return [];
    if (rows.length && Object.prototype.hasOwnProperty.call(rows[0], "i")) {
      const wireSpecies = Array.isArray(rawData?._wireSpecies) ? rawData._wireSpecies : ["bovinos", "bubalinos", "ovinos", "caprinos", "porcinos", "equinos"];
      const detailChunks = Array.isArray(rawData?._detailChunks) ? rawData._detailChunks : [];
      return rows.map((row) => ({
        id: safeOperationalId(row.i, 0),
        displayId: canShowFullIdentifiers() && (row.n?.displayName || row.n?.name || row.n?.legalName) ? safeText(row.n.displayName || row.n.name || row.n.legalName) : (safeText(row.d) || `Unidad ${safeText(row.i)}`),
        renspaMasked: safeText(row.r),
        lat: parseCoordinate(row.a), lon: parseCoordinate(row.o),
        departamento: safeText(row.p), municipio: safeText(row.m), oficinaLocal: safeText(row.f),
        totalExistencias: positiveNumber(row.t),
        especies: Object.fromEntries(wireSpecies.map((key, index) => [key, positiveNumber(row.e?.[index])])),
        categorias: {}, categoryKeys: Array.isArray(row.c) ? row.c.map(safeText).filter(Boolean) : [],
        detailChunk: detailChunks[Number(row.x)] || "", rawSafe: {}, searchKeys: {}, searchTokens: [], identifiers: row.h && typeof row.h === "object" ? row.h : {}, person: row.n && typeof row.n === "object" ? row.n : {},
      }));
    }
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
      const identifiers = row?.identifiers && typeof row.identifiers === "object" ? row.identifiers : { renspa: rawRenspa || "", dni: get("dni") || "", cuit: get("cuit") || "", cuil: get("cuil") || "", document: get("document") || "" };
      const person = row?.person && typeof row.person === "object" ? row.person : {};
      const fullRenspa = formatIdentifier(identifiers.renspa || rawRenspa, "renspa");
      const categoryKeys = Array.isArray(row?.categoryKeys) ? row.categoryKeys.map(safeText).filter(Boolean) : Object.keys(categories).filter((key) => positiveNumber(categories[key]) > 0);
      return {
        id,
        displayId: canShowFullIdentifiers() && (person.displayName || person.name || person.legalName) ? safeText(person.displayName || person.name || person.legalName) : rawRenspa ? `RENSPA ${fullRenspa}` : existingDisplayId || (maskedRenspa ? `RENSPA ${maskedRenspa}` : `Unidad ${id}`),
        renspaMasked: rawRenspa ? maskIdentifier(rawRenspa) : maskedRenspa,
        lat: parseCoordinate(get("lat")), lon: parseCoordinate(get("lon")),
        departamento: safeText(get("departamento")), municipio: safeText(get("municipio")), oficinaLocal: safeText(get("oficina")),
        totalExistencias,
        especies: species, categorias: categories, categoryKeys, detailChunk: safeText(row?.detailChunk), rawSafe: {}, searchKeys, identifiers, person,
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
    $("#producerCategoryControl").hidden = false; $("#producerRangeControl").hidden = false; $("#producerMinStockControl").hidden = false; $("#producerMaxStockControl").hidden = false; $("#includeZeroStockControl").hidden = false;
    ["#drawAreaButton", "#finishAreaButton", "#cancelAreaButton", "#clearAreaButton"].forEach((selector) => { const button = $(selector); if (button) button.hidden = selector !== "#drawAreaButton"; });
    const clearFiltersButton = $("#clearOperationalFiltersButton"); if (clearFiltersButton) clearFiltersButton.hidden = false;
    setText("#metricRecordsLabel", "UNIDADES PRODUCTIVAS"); setText("#metricMapUnitLabel", "PRODUCTORES GEOREFERENCIADOS"); setText("#metricMapUnitNote", "Uso interno · según filtros");
    setText("#mapLayerContext", "Productores georreferenciados con información ganadera desagregada · uso interno autorizado");
    setText("#mapFooterNotice", "Puntos operativos con coordenadas de la fuente interna; validar precisión y no publicar.");
    setText("#traceGrain", "Unidad productiva · punto georreferenciado"); setText("#tracePrivacy", "Modo interno autorizado. No publicar identificadores, contactos ni coordenadas sin control de acceso.");
    document.querySelector(".senasa-nav-note")?.replaceChildren(Object.assign(document.createElement("span"), { className: "status-dot" }), document.createTextNode("Modo interno operativo"));
    const modeBadge = document.querySelector(".senasa-public-badge"); if (modeBadge) modeBadge.innerHTML = '<span class="status-dot"></span>Modo interno operativo';
    const notice = $("#internalModeNotice"); notice.hidden = false; notice.innerHTML = source.loading ? "<strong>Modo interno operativo</strong> · Cargando productores…" : source.records?.length ? `<strong>Modo interno operativo</strong> · ${escapeHtml(source.message || "Datos internos cargados.")} No publicar sin autenticación ni control de acceso.` : `<strong>Modo interno operativo</strong> · ${escapeHtml(source.message || "No se pudo cargar la fuente interna. Contacte al administrador del dashboard.")}`;
    const state = { data, loading: Boolean(source.loading), filters: readGlobalFilters(), category: "", minStock: null, maxStock: null, includeZeroStock: false, selected: null, selectedProducer: null, clusterSelection: null, expandedCluster: null, locatorMatches: null, selectionSource: "", records: source.records || [], allRecords: source.allRecords || source.records || [], sourceSummary: source.summary || {}, sourceMessage: source.message || "", searchIndexUrl: source.searchIndexUrl || "", detailManifestUrl: source.detailManifestUrl || "", indexes: null, filterMemo: new Map(), detailChunkCache: new Map(), map: null, markerLayer: null, expandedClusterLayer: null, selectedProducerLayer: null, selectedMarker: null, boundaryLayer: null, diagnostics: null, speciesWarning: "", areaMode: "browse", drawingVertices: [], activePolygon: null, areaLayer: null, areaDraftLayer: null, areaVertexLayer: null };
    activeOperationalState = state;
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    setOperationalControlsDisabled(controls, state.loading);
    syncOperationalLocationControls(state.records, state.filters, controls);
    bindOperationalLocationControls(state, state.filters, controls, () => { clearOperationalSelection(state); renderOperationalTerritory(data, state); }, () => {
      state.category = "";
      updateCategoryOptions(state.filters.species, state);
    });
    updateCategoryOptions(state.filters.species, state);
    $("#producerCategorySelect")?.addEventListener("change", (event) => { state.category = event.target.value; clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    const applyStockRange = debounce(() => {
      const range = readOperationalStockRange();
      if (!range.valid) { showOperationalRangeWarning(range.message); return; }
      showOperationalRangeWarning("");
      state.minStock = range.min;
      state.maxStock = range.max;
      clearOperationalSelection(state);
      renderOperationalTerritory(data, state);
    }, 200);
    $("#producerMinStock")?.addEventListener("input", applyStockRange);
    $("#producerMaxStock")?.addEventListener("input", applyStockRange);
    $("#includeZeroStock")?.addEventListener("change", (event) => { state.includeZeroStock = Boolean(event.target.checked); clearOperationalSelection(state); renderOperationalTerritory(data, state); });
    $("#clearOperationalFiltersButton")?.addEventListener("click", () => resetOperationalFilters(state, controls));
    $("#resetMapViewButton")?.addEventListener("click", () => { clearOperationalSelection(state); resetOperationalView(state); renderOperationalTerritory(data, state); });
    $("#closeProducerDetailButton")?.addEventListener("click", () => {
      if ((state.selectedProducer || state.selected) && state.expandedCluster) clearOperationalSelection(state, { preserveExpandedCluster: true, preserveClusterSelection: true });
      else clearOperationalSelection(state);
      renderOperationalTerritory(data, state);
    });
    const map = initProducerMap(state, producerMap, data);
    if (!map) return;
    bindOperationalAreaTools(state);
    if (!state.records.length && !state.loading) showOperationalEmpty(source.message);
    renderOperationalTerritory(data, state);
    return state;
  }

  function hydrateOperationalSource(state, source) {
    if (!state) return;
    state.loading = false;
    state.records = source.records || [];
    state.allRecords = source.allRecords || state.records;
    state.sourceSummary = source.summary || {};
    state.sourceMessage = source.message || "";
    state.searchIndexUrl = source.searchIndexUrl || APP_CONFIG.INTERNAL_SEARCH_INDEX_URL || "";
    state.detailManifestUrl = source.detailManifestUrl || APP_CONFIG.INTERNAL_PRODUCER_DETAIL_MANIFEST_URL || "";
    const indexStarted = performance.now();
    state.indexes = buildOperationalIndexes(state.records);
    state.filterMemo.clear();
    perfLog("build indexes", indexStarted);
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncOperationalLocationControls(state.records, state.filters, controls);
    setOperationalControlsDisabled(controls, false);
    updateCategoryOptions(state.filters.species, state);
    const notice = $("#internalModeNotice");
    if (notice) notice.innerHTML = state.records.length ? `<strong>Modo interno operativo</strong> · ${escapeHtml(state.sourceMessage || "Datos internos cargados.")} No publicar sin autenticación ni control de acceso.` : `<strong>Modo interno operativo</strong> · ${escapeHtml(state.sourceMessage || "No se pudo cargar la fuente interna.")}`;
    setOperationalLoadingStatus("Dibujando puntos…");
    renderOperationalTerritory(state.data, state);
    if (state.records.length) {
      const warmSearch = () => ensureInternalSearchIndex().catch(() => {});
      if ("requestIdleCallback" in window) window.requestIdleCallback(warmSearch, { timeout: 2500 }); else setTimeout(warmSearch, 500);
    }
  }

  function setOperationalControlsDisabled(controls, disabled) {
    Object.values(controls || {}).forEach((control) => { if (control) control.disabled = disabled; });
    ["#producerCategorySelect", "#producerMinStock", "#producerMaxStock", "#includeZeroStock", "#clearOperationalFiltersButton", "#locatorInput", "#locatorType"].forEach((selector) => { const control = $(selector); if (control) control.disabled = disabled; });
  }

  function resetOperationalView(state) {
    const bounds = state.boundaryLayer?.getBounds?.();
    if (bounds?.isValid?.()) state.map?.fitBounds(bounds, { padding: [26, 26], animate: true });
    else if (state.visible?.length) state.map?.fitBounds(L.latLngBounds(state.visible.map((item) => [item.lat, item.lon])), { padding: [26, 26], maxZoom: 9, animate: true });
  }

  function clearOperationalSelection(state, options = {}) {
    state.selected = null;
    state.selectedProducer = null;
    if (!options.preserveClusterSelection) state.clusterSelection = null;
    state.locatorMatches = null;
    state.selectionSource = "";
    state.detailLoadingId = "";
    state.detailErrorId = "";
    state.selectedMarker = null;
    state.selectedProducerLayer?.clearLayers?.();
    if (!options.preserveExpandedCluster) clearExpandedCluster(state);
  }

  function clearExpandedCluster(state) {
    state.expandedCluster = null;
    state.expandedClusterLayer?.clearLayers?.();
  }

  function readOperationalStockRange() {
    const parse = (selector, label) => {
      const input = $(selector);
      const raw = String(input?.value ?? "").trim();
      if (!raw) return { value: null };
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return { error: `${label} debe ser un número entero no negativo.` };
      return { value };
    };
    const min = parse("#producerMinStock", "El mínimo");
    const max = parse("#producerMaxStock", "El máximo");
    if (min.error || max.error) return { valid: false, message: min.error || max.error };
    if (min.value !== null && max.value !== null && min.value > max.value) return { valid: false, message: "El mínimo no puede ser mayor que el máximo." };
    return { valid: true, min: min.value, max: max.value };
  }

  function showOperationalRangeWarning(message) {
    const warning = $("#producerRangeWarning");
    if (!warning) return;
    warning.textContent = message || "";
    warning.hidden = !message;
    ["#producerMinStock", "#producerMaxStock"].forEach((selector) => $(selector)?.setAttribute("aria-invalid", message ? "true" : "false"));
  }

  function resetOperationalFilters(state, controls) {
    Object.assign(state.filters, defaultFilters());
    state.category = "";
    state.minStock = null;
    state.maxStock = null;
    state.includeZeroStock = false;
    state.clearArea?.();
    clearOperationalSelection(state);
    const advanced = $("#producerAdvancedFilters");
    if (advanced) advanced.open = false;
    const category = $("#producerCategorySelect"); if (category) category.value = "";
    const minStock = $("#producerMinStock"); if (minStock) minStock.value = "";
    const maxStock = $("#producerMaxStock"); if (maxStock) maxStock.value = "";
    showOperationalRangeWarning("");
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
    state.expandedClusterLayer = L.layerGroup().addTo(map);
    state.selectedProducerLayer = L.layerGroup().addTo(map);
    const bounds = state.boundaryLayer?.getBounds?.();
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [26, 26] });
    mapDebug("Bounds calculados", bounds?.isValid?.() ? boundsSummary(bounds) : null);
    const refreshViewportMarkers = debounce(() => {
      renderOperationalMarkers(state);
      renderExpandedClusterLayer(state);
    }, 90);
    map.on("zoomend moveend", refreshViewportMarkers);
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

  function bindOperationalAreaTools(state) {
    const map = state.map;
    if (!map) return;
    const redraw = () => renderOperationalArea(state);
    const start = () => {
      state.areaMode = "drawing";
      state.drawingVertices = [];
      state.activePolygon = null;
      state.filterMemo?.clear();
      map.doubleClickZoom.disable();
      redraw();
      setText("#selectionStatus", "0 vértices · haga clic en el mapa y use Finalizar área.");
    };
    const cancel = () => {
      state.areaMode = "browse";
      state.drawingVertices = [];
      map.doubleClickZoom.enable();
      redraw();
      renderOperationalTerritory(state.data, state);
    };
    const finish = () => {
      if (state.drawingVertices.length < 3) { setText("#selectionStatus", "Se requieren al menos 3 vértices para finalizar el área."); return; }
      state.activePolygon = state.drawingVertices.slice();
      state.areaMode = "active";
      state.drawingVertices = [];
      state.filterMemo?.clear();
      map.doubleClickZoom.enable();
      redraw();
      const bounds = L.latLngBounds(state.activePolygon);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14, animate: true });
      renderOperationalTerritory(state.data, state);
    };
    const clear = () => {
      state.areaMode = "browse";
      state.drawingVertices = [];
      state.activePolygon = null;
      state.filterMemo?.clear();
      map.doubleClickZoom.enable();
      redraw();
      renderOperationalTerritory(state.data, state);
    };
    $("#drawAreaButton")?.addEventListener("click", start);
    $("#finishAreaButton")?.addEventListener("click", finish);
    $("#cancelAreaButton")?.addEventListener("click", cancel);
    $("#clearAreaButton")?.addEventListener("click", clear);
    state.clearArea = clear;
    map.on("click", (event) => {
      if (state.areaMode !== "drawing") return;
      state.drawingVertices.push([event.latlng.lat, event.latlng.lng]);
      redraw();
      setText("#selectionStatus", `${state.drawingVertices.length} vértices · haga clic para continuar o Finalizar área.`);
    });
    map.on("dblclick", (event) => { if (state.areaMode === "drawing") { L.DomEvent.stop(event); finish(); } });
  }

  function renderOperationalArea(state) {
    const map = state.map;
    if (!map) return;
    ["areaLayer", "areaDraftLayer", "areaVertexLayer"].forEach((key) => { state[key]?.remove?.(); state[key] = null; });
    const polygon = state.activePolygon || [];
    const drawing = state.drawingVertices || [];
    if (polygon.length >= 3) state.areaLayer = L.polygon(polygon, { className: "leaflet-area-polygon", color: "#42d7c4", weight: 2.5, fillColor: "#26baa9", fillOpacity: .22, interactive: false }).addTo(map);
    if (state.areaMode === "drawing" && drawing.length) state.areaDraftLayer = L.polyline(drawing, { className: "leaflet-area-draft", color: "#74f0df", weight: 2.5, interactive: false }).addTo(map);
    const vertices = polygon.length ? polygon : drawing;
    if (vertices.length) state.areaVertexLayer = L.layerGroup(vertices.map((point) => L.circleMarker(point, { className: "leaflet-area-vertex", radius: 5, color: "#d8fffa", weight: 2, fillColor: "#1eaaa0", fillOpacity: 1, interactive: false }))).addTo(map);
    const draw = $("#drawAreaButton"), finish = $("#finishAreaButton"), cancel = $("#cancelAreaButton"), clear = $("#clearAreaButton");
    if (draw) draw.hidden = state.areaMode === "drawing";
    if (finish) finish.hidden = state.areaMode !== "drawing";
    if (cancel) cancel.hidden = state.areaMode !== "drawing";
    if (clear) clear.hidden = !polygon.length && state.areaMode !== "drawing";
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
      (item.categoryKeys || []).forEach((key) => { if (allowed.has(key)) present.add(key); });
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
    const selectedSpecies = filters.species === "all" ? "" : normalizeSpeciesKey(filters.species);
    const compatibleCategories = state.availableCategories || getCategoriesForSpecies(selectedSpecies, state.records || []).map((item) => item.key);
    if (state.category && !compatibleCategories.includes(state.category)) {
      state.category = "";
      const categorySelect = $("#producerCategorySelect");
      if (categorySelect) categorySelect.value = "";
    }
    const effectiveCount = state.includeZeroStock ? all.length : (state.indexes?.positiveTotal?.size ?? all.filter((item) => Number(item.totalExistencias) > 0).length);
    const speciesAvailable = !selectedSpecies || Boolean(state.indexes?.species?.get(selectedSpecies)?.size ?? all.some((item) => speciesValue(item, selectedSpecies) > 0));
    state.speciesWarning = selectedSpecies && !speciesAvailable ? `La fuente interna no contiene valores positivos para ${speciesLabel(selectedSpecies)}.` : "";
    const areaKey = state.activePolygon?.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join(";") || "";
    const memoKey = [selectedSpecies || "all", filters.department || "all", filters.municipality || "", filters.office || "", state.category || "", state.minStock ?? "", state.maxStock ?? "", state.includeZeroStock ? 1 : 0, areaKey].join("|");
    if (state.filterMemo?.has(memoKey)) return state.filterMemo.get(memoKey);
    const filterStarted = performance.now();
    let candidates = state.includeZeroStock ? new Set(all.map((item) => item.id)) : new Set(state.indexes?.positiveTotal || all.filter((item) => Number(item.totalExistencias) > 0).map((item) => item.id));
    const intersect = (set) => { if (!set) { candidates.clear(); return; } candidates.forEach((id) => { if (!set.has(id)) candidates.delete(id); }); };
    if (selectedSpecies && speciesAvailable) intersect(state.indexes?.species?.get(selectedSpecies));
    if (filters.department !== "all" && filters.department) intersect(state.indexes?.department?.get(filters.department));
    if (filters.municipality) intersect(state.indexes?.municipality?.get(filters.municipality));
    if (filters.office) intersect(state.indexes?.office?.get(filters.office));
    if (state.category) intersect(state.indexes?.category?.get(state.category));
    const stockValue = (item) => state.category ? positiveNumber(item?.categorias?.[state.category]) : selectedSpecies ? speciesValue(item, selectedSpecies) : positiveNumber(item.totalExistencias);
    const rows = [...candidates].map((id) => state.indexes?.byId?.get(id)).filter((item) => {
      if (!item) return false;
      const value = stockValue(item);
      return (state.minStock === null || value >= state.minStock) && (state.maxStock === null || value <= state.maxStock) && (!state.activePolygon?.length || pointInPolygon([item.lat, item.lon], state.activePolygon));
    });
    state.filterMemo?.set(memoKey, rows);
    if (state.filterMemo?.size > 30) state.filterMemo.delete(state.filterMemo.keys().next().value);
    perfLog("aplicación de filtros", filterStarted, `${rows.length} visibles`);
    state.diagnostics = {
      raw: Number(state.sourceSummary?.rawRows ?? state.allRecords?.length ?? all.length),
      normalized: Number(state.sourceSummary?.normalizedRows ?? state.allRecords?.length ?? all.length),
      coordinates: Number(state.sourceSummary?.coordinateRows ?? all.length),
      effective: effectiveCount,
      species: selectedSpecies && speciesAvailable ? state.indexes?.species?.get(selectedSpecies)?.size || 0 : effectiveCount,
      department: filters.department !== "all" ? state.indexes?.department?.get(filters.department)?.size || 0 : effectiveCount,
      municipality: filters.municipality ? state.indexes?.municipality?.get(filters.municipality)?.size || 0 : effectiveCount,
      office: filters.office ? state.indexes?.office?.get(filters.office)?.size || 0 : effectiveCount,
      category: state.category ? state.indexes?.category?.get(state.category)?.size || 0 : effectiveCount,
      area: state.activePolygon?.length ? rows.length : null,
      final: rows.length,
      selectedSpecies: selectedSpecies || "all",
      includeZeroStock: Boolean(state.includeZeroStock),
      minStock: state.minStock,
      maxStock: state.maxStock,
    };
    mapDebug("Filtrado operativo por etapas", state.diagnostics);
    return rows;
  }

  function buildOperationalIndexes(records) {
    const indexes = { byId: new Map(), species: new Map(), department: new Map(), municipality: new Map(), office: new Map(), category: new Map(), coordinateCounts: new Map(), positiveTotal: new Set() };
    const add = (map, key, id) => { if (!key) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); };
    for (const item of records || []) {
      indexes.byId.set(item.id, item);
      if (Number(item.totalExistencias) > 0) indexes.positiveTotal.add(item.id);
      Object.keys(item.especies || {}).forEach((key) => { if (speciesValue(item, key) > 0) add(indexes.species, key, item.id); });
      add(indexes.department, item.departamento, item.id);
      add(indexes.municipality, item.municipio, item.id);
      add(indexes.office, item.oficinaLocal, item.id);
      (item.categoryKeys || Object.keys(item.categorias || {})).forEach((key) => add(indexes.category, key, item.id));
      const coordinateKey = `${item.lat}|${item.lon}`;
      indexes.coordinateCounts.set(coordinateKey, (indexes.coordinateCounts.get(coordinateKey) || 0) + 1);
    }
    return indexes;
  }

  function renderOperationalTerritory(data, state) {
    const rows = operationalRows(state);
    let selectedProducer = state.selectedProducer || state.selected;
    if (selectedProducer && !rows.some((item) => item.id === selectedProducer.id)) { clearOperationalSelection(state); selectedProducer = null; }
    state.visible = rows;
    renderOperationalMarkers(state);
    renderOperationalMetrics(rows, state);
    renderOperationalPanel(rows, state);
    renderInternalTerritorialSummary(rows, state);
    renderOperationalFilterChips(state, rows.length);
    mapDebug("Productores visibles tras filtros", { visible: rows.length });
    setText("#selectionStatus", state.loading ? "Cargando productores…" : selectedProducer ? `Unidad seleccionada · ${selectedProducer.displayId}` : `${formatNumber.format(rows.length)} productores georreferenciados visibles · seleccione un punto para ver el detalle.`);
    const warning = $("#internalFilterWarning");
    if (warning) { warning.hidden = !state.speciesWarning; warning.textContent = state.speciesWarning; }
    setText("#selectedSummary", `${formatNumber.format(rows.length)} puntos visibles`);
    updateOperationalEmptyState(state, rows.length);
    const sourceData = data || state.data || {};
    renderQualitySummary(sourceData, state.filters, filterRows(sourceData.municipios || [], state.filters));
  }

  function updateOperationalEmptyState(state, visibleCount) {
    const empty = $("#producerMapEmpty");
    if (!empty || !state.map) return;
    if (state.loading) { empty.hidden = true; return; }
    if (!state.records.length) {
      showOperationalEmpty(state.sourceMessage || "No se pudo cargar la fuente interna. Contacte al administrador del dashboard.");
      return;
    }
    if (!visibleCount) {
      showOperationalEmpty(state.activePolygon?.length ? "No hay productores dentro del área seleccionada." : "No hay productores visibles para los filtros seleccionados.");
      return;
    }
    empty.hidden = true;
  }

  function renderOperationalMetrics(rows, state) {
    const species = state.filters.species && state.filters.species !== "all" ? state.filters.species : "bovinos";
    const total = rows.reduce((sumValue, item) => sumValue + item.totalExistencias, 0);
    const selectedSpecies = rows.reduce((sumValue, item) => sumValue + positiveNumber(item.especies?.[species]), 0);
    const top = topProducers(rows, 5, species).reduce((sumValue, item) => sumValue + speciesValue(item, species), 0);
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
    const renderStarted = performance.now();
    state.markerRenderGeneration = (state.markerRenderGeneration || 0) + 1;
    const generation = state.markerRenderGeneration;
    state.markerLayer.clearLayers();
    state.selectedProducerLayer?.clearLayers?.();
    const rows = state.visible || [];
    const limit = Number(APP_CONFIG.INTERNAL_MAX_MARKERS || 800);
    const shouldCluster = rows.length > limit;
    const paddedBounds = state.map.getBounds()?.pad?.(.18);
    const viewportRows = paddedBounds && state.map.getZoom() >= 10 ? rows.filter((item) => paddedBounds.contains([item.lat, item.lon])) : rows;
    const expandedIds = new Set((state.expandedCluster?.items || []).map((item) => item.id));
    const visualRows = expandedIds.size ? viewportRows.filter((item) => !expandedIds.has(item.id)) : viewportRows;
    const groups = shouldCluster ? makeOperationalClusters(visualRows, state.map.getZoom()) : visualRows.map((item) => ({ items: [item], lat: item.lat, lon: item.lon }));
    const maxSpeciesValue = Math.max(...visualRows.map((item) => speciesValue(item, state.filters.species)), 1);
    mapDebug("Marcadores operativos renderizados", { visibleRows: rows.length, markerGroups: groups.length, clustered: shouldCluster, zoom: state.map.getZoom() });
    let cursor = 0;
    const addBatch = () => {
      if (generation !== state.markerRenderGeneration) return;
      const end = Math.min(cursor + 120, groups.length);
      for (; cursor < end; cursor += 1) {
        const group = groups[cursor];
      if (group.items.length > 1) {
        const marker = L.marker([group.lat, group.lon], { icon: L.divIcon({ className: "producer-cluster-icon", html: `<span class="producer-cluster">${formatNumber.format(group.items.length)}</span>`, iconSize: [46, 46], iconAnchor: [23, 23] }), zIndexOffset: 500, riseOnHover: true });
        marker.bindTooltip(`${formatNumber.format(group.items.length)} productores agrupados`, { direction: "top" });
        marker.on("click", () => {
          clearOperationalSelection(state);
          state.clusterSelection = group.items;
          state.expandedCluster = { items: group.items.slice(), lat: group.lat, lon: group.lon };
          state.selectionSource = "cluster";
          const bounds = L.latLngBounds(group.items.map((item) => [item.lat, item.lon]));
          state.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12, animate: true });
          renderOperationalTerritory(state.data, state);
          renderExpandedClusterLayer(state);
        });
        state.markerLayer.addLayer(marker);
        continue;
      }
      const item = group.items[0];
      if ((state.selectedProducer || state.selected)?.id === item.id) continue;
      const radius = markerRadius(speciesValue(item, state.filters.species), maxSpeciesValue);
      const markerColor = speciesColor(dominantProducerSpecies(item));
      const marker = L.marker([item.lat, item.lon], { icon: L.divIcon({ className: "producer-marker-icon", html: `<span class="producer-marker" style="--marker-color:${markerColor};width:${radius}px;height:${radius}px"></span>`, iconSize: [radius + 8, radius + 8], iconAnchor: [(radius + 8) / 2, (radius + 8) / 2] }), zIndexOffset: 100, riseOnHover: true });
      marker.bindTooltip(producerTooltip(item, state), { direction: "top", opacity: .96 });
      marker.on("click", () => selectProducer(item, { state, source: "map" }));
      state.markerLayer.addLayer(marker);
      }
      if (cursor < groups.length) { requestAnimationFrame(addBatch); return; }
      renderSelectedProducerLayer(state);
      renderExpandedClusterLayer(state);
      reportMapVisualState(state, "Después de agregar productores");
      perfLog("render de clusters", renderStarted, `${groups.length} grupos`);
      if (!state.readyLogged && state.records.length) {
        state.readyLogged = true;
        perfLog("total ready", PERF_START);
        setText("#mapLayerContext", "Productores georreferenciados con información ganadera desagregada · uso interno autorizado");
        const notice = $("#internalModeNotice");
        if (notice) notice.innerHTML = `<strong>Modo interno operativo</strong> · ${escapeHtml(state.sourceMessage || "Datos internos cargados.")} No publicar sin autenticación ni control de acceso.`;
      }
    };
    requestAnimationFrame(addBatch);
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

  function spiderfyExpandedPositions(items, map) {
    const collisionSize = 24;
    const buckets = new Map();
    (items || []).forEach((item) => {
      const realLatLng = L.latLng(item.lat, item.lon);
      const realPoint = map.latLngToLayerPoint(realLatLng);
      const key = `${Math.round(realPoint.x / collisionSize)}:${Math.round(realPoint.y / collisionSize)}`;
      const bucket = buckets.get(key) || [];
      bucket.push({ item, realLatLng, realPoint });
      buckets.set(key, bucket);
    });
    const positions = [];
    buckets.forEach((bucket) => {
      if (bucket.length === 1) {
        positions.push({ ...bucket[0], visualLatLng: bucket[0].realLatLng, displaced: false });
        return;
      }
      const center = bucket.reduce((point, entry) => point.add(entry.realPoint), L.point(0, 0)).divideBy(bucket.length);
      bucket.forEach((entry, index) => {
        const ring = Math.floor(index / 12);
        const ringStart = ring * 12;
        const ringCount = Math.min(12, bucket.length - ringStart);
        const radius = 30 + ring * 22;
        const angle = -Math.PI / 2 + ((index - ringStart) / ringCount) * Math.PI * 2;
        const visualPoint = center.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius));
        positions.push({ ...entry, visualLatLng: map.layerPointToLatLng(visualPoint), displaced: true });
      });
    });
    return positions;
  }

  function renderExpandedClusterLayer(state) {
    const layer = state.expandedClusterLayer;
    const expanded = state.expandedCluster;
    if (!layer || !state.map) return;
    layer.clearLayers();
    if (!expanded?.items?.length) return;
    const selectedSpecies = normalizeSpeciesKey(state.filters.species) || "bovinos";
    spiderfyExpandedPositions(expanded.items, state.map).forEach(({ item, realLatLng, visualLatLng, displaced }) => {
      if (displaced) L.polyline([realLatLng, visualLatLng], { className: "expanded-cluster-leg", color: "#567985", weight: 1, opacity: .58, interactive: false }).addTo(layer);
      const color = speciesColor(dominantProducerSpecies(item));
      const marker = L.marker(visualLatLng, { icon: L.divIcon({ className: "expanded-cluster-marker-icon", html: `<span class="expanded-producer-marker" style="--marker-color:${color}"></span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), zIndexOffset: 1200, riseOnHover: true, keyboard: true });
      marker.bindTooltip(`<div class="expanded-producer-tooltip"><strong>${escapeHtml(item.displayId)}</strong><span>${escapeHtml(speciesLabel(selectedSpecies))}: ${formatNumber.format(speciesValue(item, selectedSpecies))}</span></div>`, { direction: "top", opacity: .96 });
      marker.on("click", () => selectProducer(item, { state, source: "expanded-cluster", preserveExpandedCluster: true }));
      marker.addTo(layer);
    });
  }

  function markerRadius(value, max) { return Math.round(10 + Math.min(12, Math.sqrt(Math.max(0, value) / Math.max(max, 1)) * 12)); }
  function speciesColor(species) { return ({ bovinos: "#2e8d89", bubalinos: "#b17841", ovinos: "#6d91ad", caprinos: "#8b72a5", porcinos: "#9c6472", equinos: "#597d92" })[species] || "#2e8d89"; }
  function sameCoordinateCount(item, state) { return state?.indexes?.coordinateCounts?.get(`${item.lat}|${item.lon}`) || (state?.records || []).filter((candidate) => candidate.lat === item.lat && candidate.lon === item.lon).length; }
  function producerTooltip(item, state) {
    const sharedCount = sameCoordinateCount(item, state);
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
    if (state.activePolygon?.length && !pointInPolygon([item.lat, item.lon], state.activePolygon)) {
      clearOperationalSelection(state);
      setText("#selectionStatus", "El productor seleccionado queda fuera del área dibujada.");
      renderOperationalTerritory(state.data, state);
      return false;
    }
    if (options.ensureVisible) ensureOperationalItemVisible(item, state);
    const preserveExpandedCluster = Boolean(options.preserveExpandedCluster || (state.expandedCluster && ["expanded-cluster", "cluster-list"].includes(options.source)));
    clearOperationalSelection(state, { preserveExpandedCluster, preserveClusterSelection: preserveExpandedCluster });
    state.selected = item;
    state.selectedProducer = item;
    state.selectionSource = options.source || "map";
    state.detailLoadingId = item.detailChunk && !item.detailLoaded ? item.id : "";
    state.detailErrorId = "";
    state.map?.setView([item.lat, item.lon], Math.max(state.map.getZoom(), 15), { animate: true });
    state.map?.invalidateSize?.({ pan: false });
    state.selectedProducerLayer?.clearLayers?.();
    renderSelectedProducerLayer(state);
    const panelStarted = performance.now();
    renderOperationalPanel(state.visible || state.records, state);
    perfLog("actualización de ficha lateral", panelStarted);
    setText("#selectionStatus", `Unidad seleccionada · ${item.displayId}`);
    if (state.detailLoadingId) loadProducerDetail(item, state);
    mapDebug("Productor seleccionado", { source: state.selectionSource, producerId: Boolean(item.id), latLonValid: true, highlightedMarkerCreated: Boolean(state.selectedMarker), panelUpdated: Boolean($("#producerDetail") && !$("#producerDetail").hidden) });
    return true;
  }

  async function loadProducerDetail(item, state) {
    const chunkResource = item.detailChunk;
    if (!chunkResource) { state.detailLoadingId = ""; return; }
    const started = performance.now();
    try {
      const chunkUrl = absoluteInternalUrl(chunkResource);
      let promise = state.detailChunkCache.get(chunkUrl);
      if (!promise) {
        promise = fetch(chunkUrl).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return chunkRecords(JSON.parse(await response.text()));
        });
        state.detailChunkCache.set(chunkUrl, promise);
      }
      const records = await promise;
      const detail = records.find((record) => record?.id === item.id);
      if (!detail) throw new Error("Detalle no encontrado en el fragmento.");
      item.paraje = safeText(detail.paraje);
      item.identifiers = detail.identifiers && typeof detail.identifiers === "object" ? detail.identifiers : item.identifiers || {};
      item.person = detail.person && typeof detail.person === "object" ? detail.person : item.person || {};
      item.categorias = detail.categorias && typeof detail.categorias === "object" ? detail.categorias : {};
      item.categoryKeys = Object.keys(item.categorias).filter((key) => positiveNumber(item.categorias[key]) > 0);
      item.detailLoaded = true;
      if (state.detailLoadingId === item.id) state.detailLoadingId = "";
      perfLog("detalle de productor", started);
      if ((state.selectedProducer || state.selected)?.id === item.id) renderOperationalPanel(state.visible || state.records, state);
    } catch (_error) {
      state.detailChunkCache.delete(absoluteInternalUrl(chunkResource));
      if (state.detailLoadingId === item.id) state.detailLoadingId = "";
      if ((state.selectedProducer || state.selected)?.id === item.id) state.detailErrorId = item.id;
      if ((state.selectedProducer || state.selected)?.id === item.id) renderOperationalPanel(state.visible || state.records, state);
    }
  }

  function renderSelectedProducerLayer(state) {
    const layer = state.selectedProducerLayer;
    const item = state.selectedProducer || state.selected;
    if (!layer || !state.map || !item || !validCoordinatePair(item.lat, item.lon)) return;
    const sharedCount = sameCoordinateCount(item, state);
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
    state.minStock = null;
    state.maxStock = null;
    state.includeZeroStock = true;
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncOperationalLocationControls(state.records, filters, controls);
    updateCategoryOptions(filters.species, state);
    const includeZero = $("#includeZeroStock"); if (includeZero) includeZero.checked = true;
    const minStock = $("#producerMinStock"); if (minStock) minStock.value = "";
    const maxStock = $("#producerMaxStock"); if (maxStock) maxStock.value = "";
    showOperationalRangeWarning("");
    const advanced = $("#producerAdvancedFilters"); if (advanced) advanced.open = false;
    saveGlobalFilters(filters);
  }

  function renderOperationalPanel(rows, state) {
    const list = $("#focusList"), detail = $("#producerDetail"), close = $("#closeProducerDetailButton");
    const selectedProducer = state.selectedProducer || state.selected;
    if (selectedProducer && APP_CONFIG.ENABLE_PRODUCER_DETAIL !== false) {
      list.hidden = true; detail.hidden = false; close.hidden = false;
      close.textContent = state.expandedCluster ? "Volver al grupo" : "Volver al resumen";
      detail.innerHTML = producerDetailMarkup(selectedProducer, { sharedCount: sameCoordinateCount(selectedProducer, state), species: state.filters.species, categories: state.availableCategories || [], loading: state.detailLoadingId === selectedProducer.id, error: state.detailErrorId === selectedProducer.id });
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
      close.textContent = isSearch ? "Volver al resumen" : "Cerrar grupo";
      setText("#focusEyebrow", isSearch ? "RESULTADOS DEL LOCALIZADOR" : `${formatNumber.format(matches.length)} PRODUCTORES AGRUPADOS`);
      setText("#focusTitle", isSearch ? "Productores localizados" : "Grupo de productores");
      setText("#focusFootnote", "Seleccione una fila para centrar el mapa y abrir la ficha desagregada.");
      list.innerHTML = `<p class="cluster-summary">${isSearch ? `Coincidencias encontradas en la fuente interna. ${formatNumber.format(matches.length)} resultado(s).` : `Grupo expandido: ${formatNumber.format(matches.length)} productores en esta ubicación o zona cercana. Seleccione un productor para ver su ficha desagregada.`}</p>${matches.slice(0, 20).map((item, index) => `<button class="ranking-item operational-focus-row cluster-list-item" type="button" data-producer-id="${escapeHtml(item.id)}"><span class="ranking-index focus-rank">${String(index + 1).padStart(2, "0")}</span><span class="ranking-main"><strong class="ranking-title">${escapeHtml(item.displayId)}</strong><small class="ranking-location">${escapeHtml([item.departamento, item.municipio, item.oficinaLocal].filter(Boolean).join(" · ") || "Ubicación no informada")}</small><small class="ranking-species">${isSearch && item.locatorMatchTypes?.length ? `${escapeHtml(item.locatorMatchTypes.map((value) => ({ dni: "DNI", cuit: "CUIT", cuil: "CUIL", cuit_cuil: "CUIT/CUIL", document: "DOCUMENTO" })[value] || value).join(" / "))} · ${escapeHtml(item.locatorMaskedIdentifier || "Identificador enmascarado")}` : escapeHtml(speciesLabel(dominantProducerSpecies(item)))}</small></span><span class="ranking-value"><b>${formatNumber.format(speciesValue(item, state.filters.species))}</b><em class="ranking-unit">${escapeHtml(speciesLabel(state.filters.species).toLowerCase())}</em><small class="ranking-total">${formatNumber.format(item.totalExistencias)} total</small></span></button>`).join("")}${matches.length > 20 ? `<p class="cluster-summary">Se muestran las primeras 20 de ${formatNumber.format(matches.length)} coincidencias.</p>` : ""}`;
      list.querySelectorAll("[data-producer-id]").forEach((button) => button.addEventListener("click", () => { const item = matches.find((row) => row.id === button.dataset.producerId); if (item) selectProducer(item, { state, source: isSearch ? "search-result-list" : "cluster-list", ensureVisible: isSearch }); }));
      return;
    }
    setText("#focusEyebrow", "RANKING OPERATIVO"); setText("#focusTitle", "Unidades destacadas"); setText("#focusFootnote", "Seleccione un productor en el mapa para consultar su ficha operativa.");
    const rankingStarted = performance.now();
    const ranked = topProducers(rows, 10, state.filters.species);
    list.innerHTML = ranked.length ? ranked.map((item, index) => `<button class="ranking-item operational-focus-row" type="button" data-producer-id="${escapeHtml(item.id)}"><span class="ranking-index focus-rank">${String(index + 1).padStart(2, "0")}</span><span class="ranking-main"><strong class="ranking-title">${escapeHtml(item.displayId)}</strong><small class="ranking-location">${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación no informada")}</small></span><span class="ranking-value"><b>${formatNumber.format(speciesValue(item, state.filters.species))}</b><em class="ranking-unit">${escapeHtml(speciesLabel(state.filters.species).toLowerCase())}</em></span></button>`).join("") : "<p class=\"empty-panel-message\">No hay productores visibles para los filtros seleccionados.</p>";
    perfLog("render de ranking", rankingStarted, `${ranked.length} filas`);
    list.querySelectorAll("[data-producer-id]").forEach((button) => button.addEventListener("click", () => { const item = rows.find((row) => row.id === button.dataset.producerId); if (item) selectProducer(item, { state, source: "ranking" }); }));
  }

  function topProducers(rows, limit, species) {
    const top = [];
    for (const item of rows || []) {
      const current = speciesValue(item, species);
      let index = top.findIndex((candidate) => current > speciesValue(candidate, species));
      if (index < 0) index = top.length;
      if (index < limit) top.splice(index, 0, item);
      if (top.length > limit) top.pop();
    }
    return top;
  }

  function producerDetailMarkup(item, options = {}) {
    const total = item.totalExistencias || 1;
    const selectedSpecies = normalizeSpeciesKey(options.species) || "bovinos";
    const selectedSpeciesValue = speciesValue(item, selectedSpecies);
    const orderedSpecies = Object.entries(item.especies || {}).sort((a, b) => a[0] === selectedSpecies ? -1 : b[0] === selectedSpecies ? 1 : b[1] - a[1]);
    const bars = orderedSpecies.map(([key, value]) => `<div class="producer-bar${key === selectedSpecies ? " is-priority" : ""}"><span>${escapeHtml(speciesLabel(key))}</span><i style="--share:${Math.min(100, value / total * 100)}%"></i><b>${formatNumber.format(value)}</b></div>`).join("") || "<p class=\"empty-panel-message\">No se informaron valores desagregados.</p>";
    const compatible = new Set(options.categories || []);
    const categoryRows = options.loading
      ? '<tr><td colspan="2"><span class="producer-detail-loading" role="status">Cargando detalle…</span></td></tr>'
      : options.error
        ? '<tr><td colspan="2">No se pudo cargar el detalle. Intente seleccionar nuevamente.</td></tr>'
        : Object.entries(item.categorias || {}).filter(([key, value]) => compatible.has(key) && positiveNumber(value) > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<tr><td>${escapeHtml(PRODUCER_CATEGORY_LABELS[key] || titleCase(key.replaceAll("_", " ")))}</td><td>${formatNumber.format(value)}</td></tr>`).join("") || `<tr><td colspan="2">Sin categorías de ${escapeHtml(speciesLabel(selectedSpecies).toLowerCase())} informadas.</td></tr>`;
    const location = [item.departamento, item.municipio, item.oficinaLocal, item.paraje].filter(Boolean).join(" · ") || "Ubicación administrativa no informada";
    const sharedNotice = Number(options.sharedCount || 0) > 1 ? `<p class="producer-shared-note">Ubicación compartida por ${formatNumber.format(options.sharedCount)} productores.</p>` : "";
    const identifiers = item.identifiers || {};
    const person = item.person || {};
    const identityRows = canShowFullIdentifiers() ? [["Nombre / titular", person.displayName || person.name], ["Razón social", person.legalName], ["RENSPA", identifiers.renspa], ["DNI", identifiers.dni], ["CUIT", identifiers.cuit], ["CUIL", identifiers.cuil], ["Documento", identifiers.document]].filter(([, current]) => String(current || "").trim()).map(([label, current]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(formatIdentifier(current, label))}</td></tr>`).join("") : "";
    return `<div class="producer-detail-header"><h3>${escapeHtml(item.displayId)}</h3><p>${escapeHtml(location)}</p><small class="producer-detail-id">ID operativo: ${escapeHtml(item.id)}${item.renspaMasked ? ` · RENSPA: ${escapeHtml(formatIdentifier(identifiers.renspa || item.renspaMasked, "renspa"))}` : ""}</small>${sharedNotice}</div>${identityRows ? `<section class="producer-detail-section"><h4>Identificación</h4><table class="producer-detail-table"><tbody>${identityRows}</tbody></table></section>` : ""}<div class="producer-kpis"><div class="is-priority"><span>${escapeHtml(speciesLabel(selectedSpecies))}</span><strong>${formatNumber.format(selectedSpeciesValue)}</strong></div><div><span>Total general</span><strong>${formatNumber.format(item.totalExistencias)}</strong></div></div><section class="producer-detail-section"><h4>Existencias por especie</h4><div class="producer-bars">${bars}</div></section><section class="producer-detail-section"><h4>Categorías de ${escapeHtml(speciesLabel(selectedSpecies))}</h4><table class="producer-detail-table"><tbody>${categoryRows}</tbody></table></section>`;
  }

  function renderOperationalFilterChips(state, count) {
    const target = $("#territoryFilterChips"); if (!target) return;
    const labels = [
      ["Especie ganadera", state.filters.species && state.filters.species !== "all" ? speciesLabel(state.filters.species) : "Todas"],
      ["Departamento", state.filters.department !== "all" ? titleCase(state.filters.department) : "Todos"],
      ["Municipio", state.filters.municipality ? titleCase(state.filters.municipality) : "Todos"],
      ["Oficina local", state.filters.office ? titleCase(state.filters.office) : "Todas"],
      ["Categoría", state.category ? (PRODUCER_CATEGORY_LABELS[state.category] || titleCase(state.category.replaceAll("_", " "))) : state.availableCategories?.length ? "Todas" : "Sin categorías disponibles"],
      ["Cero", state.includeZeroStock ? "Incluidos" : "Excluidos"],
    ];
    if (state.minStock !== null || state.maxStock !== null) {
      const range = state.minStock !== null && state.maxStock !== null
        ? `${formatNumber.format(state.minStock)} a ${formatNumber.format(state.maxStock)}`
        : state.minStock !== null ? `desde ${formatNumber.format(state.minStock)}` : `hasta ${formatNumber.format(state.maxStock)}`;
      labels.splice(labels.length - 1, 0, ["Rango", `${range} cabezas`]);
    }
    if (state.activePolygon?.length) labels.push(["Área dibujada", "Activa"]);
    target.innerHTML = `<span class="filter-count">${formatNumber.format(count)} visibles${state.activePolygon?.length ? ` · ${formatNumber.format(count)} productores dentro del área` : ""}</span>${labels.map(([label, value]) => `<span class="operational-filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join("")}`;
  }

  function showOperationalEmpty(message) {
    const empty = $("#producerMapEmpty"); if (!empty) return;
    const text = message || "No se encontró la fuente interna de productores. Contacte al administrador del dashboard.";
    const failed = /Leaflet|inicializaci[oó]n|cargar el mapa/i.test(text);
    const noVisible = /No hay productores visibles/i.test(text);
    const loading = /Cargando productores|Preparando filtros|Dibujando puntos/i.test(text);
    empty.hidden = false; empty.innerHTML = `<div><h3>${failed ? "No se pudo cargar el mapa" : noVisible ? "Sin productores visibles" : loading ? "Cargando productores…" : "Modo interno preparado"}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function setMunicipalityTableHead(mode, speciesKey = "bovinos") {
    const head = $("#municipalityTableHead");
    if (!head) return;
    if (mode === "internal") {
      const stockLabel = speciesKey === "all" ? "Existencias totales" : `Existencias de ${speciesLabel(speciesKey)}`;
      head.innerHTML = `<tr><th>Departamento</th><th>Municipio</th><th>Oficina local</th><th class="numeric">Productores visibles</th><th class="numeric">${escapeHtml(stockLabel)}</th><th class="numeric">Promedio por productor</th><th class="numeric">Participación</th></tr>`;
      return;
    }
    head.innerHTML = "<tr><th>Municipio</th><th>Departamento</th><th>Oficina local</th><th>Registros</th><th class=\"numeric\">Bovinos</th><th class=\"numeric\">Bubalinos</th><th class=\"numeric\">Ovinos</th></tr>";
  }

  function summarizeVisibleTerritory(rows, state) {
    const selectedSpecies = normalizeSpeciesKey(state.filters?.species) || "bovinos";
    const useTotal = selectedSpecies === "all";
    const stockOf = (item) => useTotal ? positiveNumber(item.totalExistencias) : speciesValue(item, selectedSpecies);
    const groups = new Map();
    (rows || []).forEach((item) => {
      const departamento = item.departamento || "Sin departamento";
      const municipio = item.municipio || "Sin municipio";
      const oficina = item.oficinaLocal || "Sin oficina local";
      const key = `${departamento}\u001f${municipio}\u001f${oficina}`;
      if (!groups.has(key)) groups.set(key, { departamento, municipio, oficina, producers: 0, stock: 0, items: [] });
      const group = groups.get(key);
      group.producers += 1;
      group.stock += stockOf(item);
      group.items.push(item);
    });
    return { selectedSpecies, totalStock: (rows || []).reduce((total, item) => total + stockOf(item), 0), groups: [...groups.values()].sort((a, b) => b.stock - a.stock || b.producers - a.producers || a.departamento.localeCompare(b.departamento, "es")) };
  }

  function renderInternalTerritorialSummary(rows, state) {
    const target = $("#municipalityRows");
    if (!target) return;
    const summary = summarizeVisibleTerritory(rows, state);
    const groups = summary.groups;
    const renderedGroups = groups.slice(0, 100);
    state.territorialSummaryGroups = groups;
    setMunicipalityTableHead("internal", summary.selectedSpecies);
    if (!groups.length) {
      target.innerHTML = '<tr class="territory-summary-empty"><td colspan="7">No hay productores visibles para los filtros seleccionados.</td></tr>';
      setText("#tableSummary", "Sin productores visibles · Según filtros activos");
      return;
    }
    target.innerHTML = renderedGroups.map((group, index) => {
      const share = summary.totalStock > 0 ? group.stock / summary.totalStock * 100 : 0;
      const average = group.producers ? group.stock / group.producers : 0;
      const accessibleLabel = `${group.departamento}, ${group.municipio}, ${group.oficina}: ${formatNumber.format(group.producers)} productores visibles`;
      return `<tr class="territory-summary-row" data-territory-index="${index}" tabindex="0" role="button" aria-label="${escapeHtml(accessibleLabel)}"><td>${escapeHtml(titleCase(group.departamento))}</td><td>${escapeHtml(titleCase(group.municipio))}</td><td>${escapeHtml(titleCase(group.oficina))}</td><td class="numeric">${formatNumber.format(group.producers)}</td><td class="numeric">${formatNumber.format(group.stock)}</td><td class="numeric">${formatDecimal.format(average)}</td><td class="numeric">${formatDecimal.format(share)}%</td></tr>`;
    }).join("");
    setText("#tableSummary", `${formatNumber.format(groups.length)} agrupaciones · ${formatNumber.format(rows.length)} productores · ${groups.length > renderedGroups.length ? `Mostrando top ${renderedGroups.length}` : "Según filtros activos"}`);
    target.querySelectorAll(".territory-summary-row").forEach((row) => {
      const activate = () => focusTerritorySummaryGroup(Number(row.dataset.territoryIndex), state);
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    });
  }

  function focusTerritorySummaryGroup(index, state) {
    const group = state.territorialSummaryGroups?.[index];
    if (!group) return;
    state.filters.department = group.departamento === "Sin departamento" ? "all" : group.departamento;
    state.filters.municipality = group.municipio === "Sin municipio" ? "" : group.municipio;
    state.filters.office = group.oficina === "Sin oficina local" ? "" : group.oficina;
    clearOperationalSelection(state);
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncOperationalLocationControls(state.records, state.filters, controls);
    saveGlobalFilters(state.filters);
    renderOperationalTerritory(state.data, state);
    if (state.visible?.length && state.map) state.map.fitBounds(L.latLngBounds(state.visible.map((item) => [item.lat, item.lon])), { padding: [34, 34], maxZoom: 12, animate: true });
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
    if (!Array.isArray(vertices) || vertices.length < 3 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i]; const [xj, yj] = vertices[j];
      // Boundary points are included; this avoids surprising omissions for a
      // producer whose coordinate falls exactly on a drawn edge or vertex.
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      const onSegment = Math.abs(cross) < 1e-10 && x >= Math.min(xi, xj) - 1e-10 && x <= Math.max(xi, xj) + 1e-10 && y >= Math.min(yi, yj) - 1e-10 && y <= Math.max(yi, yj) + 1e-10;
      if (onSegment) return true;
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
    setMunicipalityTableHead("public");
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

  function bindOperationalLocationControls(state, filters, controls, onChange, onSpeciesChange) {
    const renderDebounced = debounce(onChange, 180);
    const update = () => { syncOperationalLocationControls(state.records, filters, controls); saveGlobalFilters(filters); renderDebounced(); };
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

  function debounce(callback, delay = 180) {
    let timer = 0;
    return (...args) => { clearTimeout(timer); timer = window.setTimeout(() => callback(...args), delay); };
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
