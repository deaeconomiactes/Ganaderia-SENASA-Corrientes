(() => {
  const SPECIES = [
    ["bovinos", "Bovinos", "#35d5c1"],
    ["bubalinos", "Bubalinos", "#f2a45c"],
    ["equinos", "Equinos", "#5b9cf2"],
    ["porcinos", "Porcinos", "#e07f94"],
    ["caprinos", "Caprinos", "#b694ef"],
    ["ovinos", "Ovinos", "#8dcf72"],
  ];
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
  const mapDebug = (...args) => { if (APP_CONFIG.DEBUG_MAP === true) console.info("[SENASA mapa]", ...args); };
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
      setText("#locatorStatus", "Consultando el servicio protegido…");
      setText("#locatorResult", "");
      dialog?.showModal?.();
      try {
        const result = await fetchLocator(identifierType, identifier);
        if (result.found && result.area) {
          const area = result.area;
          setText("#locatorStatus", result.message || "Coincidencia encontrada en zona agregada.");
          const fields = [["Departamento", area.departamento], ["Municipio", area.municipio], ["Oficina local", area.oficinaLocal], ["Celda/grilla", area.gridId]].filter(([, field]) => field);
          const target = $("#locatorResult");
          if (target) target.innerHTML = `<div class="locator-area-result"><strong>Coincidencia encontrada en zona agregada</strong>${fields.map(([label, field]) => `<span><b>${label}:</b> ${escapeHtml(field)}</span>`).join("")}</div>`;
        } else setText("#locatorStatus", result.message || "No se encontró coincidencia o no cuenta con permisos para consultar este identificador.");
      } catch (_error) {
        setText("#locatorStatus", "No se pudo consultar el servicio protegido. Intente nuevamente o contacte a la DEA.");
      }
    });
    document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  }

  async function fetchLocator(identifierType, identifier) {
    if (APP_CONFIG.ENABLE_SECURE_LOCATOR === false) return { found: false, message: "El localizador está deshabilitado en esta configuración." };
    const endpoint = SECURE_LOCATOR_ENDPOINT;
    if (!endpoint && isInternalOperationalMode() && internalProducerLookup.length) {
      const normalized = normalizeIdentifier(identifier);
      const match = internalProducerLookup.find((item) => item.searchTokens.includes(normalized));
      return match ? { found: true, area: { departamento: match.departamento, municipio: match.municipio, oficinaLocal: match.oficinaLocal, gridId: "Zona operativa interna" }, message: "Coincidencia encontrada en zona agregada. No se muestran datos individuales." } : { found: false, message: "No se encontró coincidencia o no cuenta con permisos para consultar este identificador." };
    }
    if (!endpoint) return { found: false, message: "La búsqueda por identificador requiere un servicio seguro autenticado. Esta versión pública sólo permite análisis agregado." };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifierType, identifier }) });
    if (!response.ok) throw new Error("Servicio protegido no disponible.");
    return response.json();
  }

  function normalizeIdentifier(raw) {
    return String(raw || "").trim().replace(/[\s-]/g, "").toUpperCase().slice(0, 64);
  }

  function setupCommon(data) {
    const totals = data.totales;
    const qualityPanel = $("#qualityPanel");
    if (qualityPanel) qualityPanel.hidden = APP_CONFIG.SHOW_INTERNAL_QUALITY_PANEL !== true;
    setText("#sidebarRecords", formatNumber.format(totals.registros));
    const now = new Date(data.metadata.actualizado);
    setText("#updateText", Number.isNaN(now.valueOf()) ? "Base cargada correctamente" : `Base cargada correctamente · actualizada ${now.toLocaleDateString("es-AR")}`);
    setText("#metricBovinos", formatNumber.format(totals.bovinos));
    setText("#metricDensity", `${Number(totals.bovinos_por_registro || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}`);
    renderTraceabilityBand(data);
    renderQualitySummary(data, defaultFilters(), data.municipios || []);
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
      const normalized = normalizeProducerData(await response.json());
      internalProducerLookup = normalized;
      const mapped = normalized.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.lat >= -90 && item.lat <= 90 && item.lon >= -180 && item.lon <= 180);
      mapDebug("Productores cargados:", normalized.length, "con coordenadas válidas:", mapped.length);
      return { records: mapped, allRecords: normalized, message: mapped.length ? "Datos internos cargados." : "No se pudo cargar la fuente interna. Contacte al administrador del dashboard." };
    } catch (_error) {
      internalProducerLookup = [];
      mapDebug("No se pudo cargar la fuente interna.");
      return { records: [], message: "No se pudo cargar la fuente interna. Contacte al administrador del dashboard." };
    }
  }

  function normalizeProducerData(rawData) {
    const rows = Array.isArray(rawData) ? rawData : (rawData?.records || rawData?.rows || rawData?.data || []);
    if (!Array.isArray(rows)) return [];
    const fields = detectLivestockFields(rows);
    return rows.map((row, index) => {
      const get = (name) => row?.[fields[name]];
      const species = Object.fromEntries(Object.entries(fields.species).map(([key, field]) => [key, positiveNumber(row?.[field])]).filter(([, value]) => value > 0));
      const categories = Object.fromEntries(Object.entries(fields.categories).map(([key, field]) => [key, positiveNumber(row?.[field])]).filter(([, value]) => value > 0));
      const totalFromParts = Object.values(species).reduce((total, value) => total + value, 0) || Object.values(categories).reduce((total, value) => total + value, 0);
      const id = safeOperationalId(get("id"), index);
      const rawRenspa = get("renspa");
      return {
        id,
        displayId: rawRenspa ? `RENSPA ${maskIdentifier(rawRenspa)}` : `Unidad ${id}`,
        renspaMasked: rawRenspa ? maskIdentifier(rawRenspa) : "",
        lat: parseCoordinate(get("lat")), lon: parseCoordinate(get("lon")),
        departamento: safeText(get("departamento")), municipio: safeText(get("municipio")), oficinaLocal: safeText(get("oficina")),
        totalExistencias: positiveNumber(get("total")) || totalFromParts,
        especies: species, categorias: categories, rawSafe: {},
        searchTokens: [get("id"), rawRenspa, get("internalId")].filter(Boolean).map(normalizeIdentifier),
      };
    });
  }

  function detectLivestockFields(rows) {
    const keys = [...new Set(rows.slice(0, 30).flatMap((row) => Object.keys(row || {})))];
    const find = (aliases) => keys.find((key) => aliases.includes(canonicalKey(key)));
    const speciesAliases = { bovinos: ["bovinos", "bovino", "bov"], bubalinos: ["bubalinos", "bubalino", "bufalos", "bufalo"], ovinos: ["ovinos", "ovino", "ovejas"], caprinos: ["caprinos", "caprino", "cabras"], porcinos: ["porcinos", "porcino", "cerdos"], equinos: ["equinos", "equino", "caballos"] };
    const categoryAliases = { vacas: ["vacas", "vaca"], vaquillonas: ["vaquillonas", "vaquillona"], novillos: ["novillos", "novillo"], novillitos: ["novillitos", "novillito"], terneros: ["terneros", "ternero"], terneras: ["terneras", "ternera"], toros: ["toros", "toro"], bueyes: ["bueyes", "buey"], bufalas: ["bufalas", "bufala"] };
    return {
      id: find(["idproductor", "productorid", "idunidad", "unidadid", "idregistro", "registroid", "codigooperativo", "codigo", "id"]),
      internalId: find(["idinterno", "internoid", "codigooperativo"]), renspa: find(["renspa", "renspanro", "renspanumero", "uprenspa"]),
      lat: find(["lat", "latitud", "latitude"]), lon: find(["lon", "lng", "longitud", "longitude"]),
      departamento: find(["departamento", "depto", "depto" ]), municipio: find(["municipio", "muni", "localidad", "paraje"]), oficina: find(["oficinalocal", "oficina", "oficinasenasa"]),
      total: find(["totalexistencias", "existenciastotales", "totalanimales", "totalcabezas", "existencias"]),
      species: Object.fromEntries(Object.entries(speciesAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field)),
      categories: Object.fromEntries(Object.entries(categoryAliases).map(([key, aliases]) => [key, find(aliases)]).filter(([, field]) => field)),
    };
  }

  function canonicalKey(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function positiveNumber(value) { const number = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? number : 0; }
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
    $("#mapLevelControl").hidden = true; $("#producerCategoryControl").hidden = false; $("#producerRangeControl").hidden = false;
    setText("#metricRecordsLabel", "UNIDADES PRODUCTIVAS"); setText("#metricMapUnitLabel", "PRODUCTORES GEOREFERENCIADOS"); setText("#metricMapUnitNote", "Uso interno · según filtros");
    setText("#mapLayerContext", "Puntos operativos sobre mapa base · uso interno autorizado");
    setText("#mapFooterNotice", "Puntos operativos con coordenadas de la fuente interna; validar precisión y no publicar.");
    setText("#traceGrain", "Unidad productiva · punto georreferenciado"); setText("#tracePrivacy", "Modo interno autorizado. No publicar identificadores, contactos ni coordenadas sin control de acceso.");
    document.querySelector(".senasa-nav-note")?.replaceChildren(Object.assign(document.createElement("span"), { className: "status-dot" }), document.createTextNode("Modo interno operativo"));
    const notice = $("#internalModeNotice"); notice.hidden = false; notice.innerHTML = source.records?.length ? "<strong>Modo interno operativo</strong> · Datos internos cargados. No publicar sin autenticación ni control de acceso." : "<strong>Modo interno operativo</strong> · No se pudo cargar la fuente interna. Contacte al administrador del dashboard.";
    const state = { data, filters: readGlobalFilters(), category: "", minStock: 0, selected: null, records: source.records || [], map: null, markerLayer: null, boundaryLayer: null };
    const controls = { species: $("#speciesSelect"), department: $("#departmentSelect"), municipality: $("#municipalitySelect"), office: $("#officeSelect") };
    syncLocationControls(data, state.filters, controls);
    bindLocationControls(data, state.filters, controls, () => { state.selected = null; renderOperationalTerritory(data, state); });
    populateOperationalCategories(state.records);
    $("#producerCategorySelect")?.addEventListener("change", (event) => { state.category = event.target.value; state.selected = null; renderOperationalTerritory(data, state); });
    $("#producerMinStock")?.addEventListener("input", (event) => { state.minStock = positiveNumber(event.target.value); state.selected = null; renderOperationalTerritory(data, state); });
    $("#resetMapViewButton")?.addEventListener("click", () => { state.selected = null; const bounds = state.boundaryLayer?.getBounds?.(); if (bounds?.isValid?.()) state.map.fitBounds(bounds, { padding: [26, 26] }); renderOperationalTerritory(data, state); });
    $("#closeProducerDetailButton")?.addEventListener("click", () => { state.selected = null; renderOperationalTerritory(data, state); });
    if (!window.L) { mapDebug("Leaflet no disponible."); showOperationalEmpty("Leaflet no está disponible o falló la inicialización."); return; }
    mapDebug("Leaflet disponible; creando instancia.");
    state.map = L.map(producerMap, { zoomControl: true, preferCanvas: true, attributionControl: true }).setView([-28.9, -57.9], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(state.map);
    if (data.limite_corrientes) state.boundaryLayer = L.geoJSON(data.limite_corrientes, { style: { color: "#3d7478", weight: 1.4, fillColor: "#8db8b7", fillOpacity: .10 } }).addTo(state.map);
    state.markerLayer = L.layerGroup().addTo(state.map);
    state.boundaryLayer?.getBounds?.().isValid() && state.map.fitBounds(state.boundaryLayer.getBounds(), { padding: [26, 26] });
    state.map.on("zoomend", () => renderOperationalMarkers(state));
    const invalidate = () => state.map?.invalidateSize?.({ pan: false });
    requestAnimationFrame(() => requestAnimationFrame(invalidate));
    window.addEventListener("resize", invalidate, { passive: true });
    state.map.whenReady(() => { invalidate(); mapDebug("Mapa Leaflet inicializado."); });
    if (!state.records.length) showOperationalEmpty(source.message);
    renderOperationalTerritory(data, state);
  }

  function initPublicTerritory(data) {
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
    setText("#sourceInfo", `${data.metadata.alcance} ${data.metadata.privacidad} ${data.metadata.geometria}`);
    const dialog = $("#infoDialog");
    $("#infoButton")?.addEventListener("click", () => dialog.showModal());
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

  function populateOperationalCategories(records) {
    const select = $("#producerCategorySelect");
    if (!select) return;
    const categories = [...new Set(records.flatMap((item) => Object.keys(item.categorias || {})))].sort();
    select.innerHTML = `<option value="">Todas las categorías</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(titleCase(item))}</option>`).join("")}`;
    $("#producerCategoryControl").hidden = !categories.length;
  }

  function operationalRows(state) {
    const filters = state.filters;
    return state.records.filter((item) => {
      const speciesOk = !filters.species || filters.species === "all" || positiveNumber(item.especies?.[filters.species]) > 0;
      const departmentOk = filters.department === "all" || !filters.department || item.departamento === filters.department;
      const municipalityOk = !filters.municipality || item.municipio === filters.municipality;
      const officeOk = !filters.office || item.oficinaLocal === filters.office;
      const categoryOk = !state.category || positiveNumber(item.categorias?.[state.category]) > 0;
      return speciesOk && departmentOk && municipalityOk && officeOk && categoryOk && item.totalExistencias >= state.minStock;
    });
  }

  function renderOperationalTerritory(data, state) {
    const rows = operationalRows(state);
    if (state.selected && !rows.some((item) => item.id === state.selected.id)) state.selected = null;
    state.visible = rows;
    renderOperationalMarkers(state);
    renderOperationalMetrics(rows, state);
    renderOperationalPanel(rows, state);
    renderOperationalFilterChips(state, rows.length);
    setText("#selectionStatus", state.selected ? `Unidad seleccionada · ${state.selected.displayId}` : `${formatNumber.format(rows.length)} productores georreferenciados visibles · seleccione un punto para ver el detalle.`);
    setText("#selectedSummary", `${formatNumber.format(rows.length)} puntos visibles`);
    setText("#tableSummary", state.records.length ? "La tabla pública conserva el resumen agregado." : "Sin fuente individual georreferenciada.");
    const sourceData = data || state.data || {};
    renderQualitySummary(sourceData, state.filters, filterRows(sourceData.municipios || [], state.filters));
  }

  function renderOperationalMetrics(rows, state) {
    const species = state.filters.species && state.filters.species !== "all" ? state.filters.species : "bovinos";
    const total = rows.reduce((sumValue, item) => sumValue + item.totalExistencias, 0);
    const selectedSpecies = rows.reduce((sumValue, item) => sumValue + positiveNumber(item.especies?.[species]), 0);
    const top = [...rows].sort((a, b) => b.totalExistencias - a.totalExistencias).slice(0, 5).reduce((sumValue, item) => sumValue + item.totalExistencias, 0);
    setText("#metricRecords", formatNumber.format(rows.length));
    setText("#metricBovinos", formatNumber.format(selectedSpecies || total));
    setText("#territorySpeciesLabel", selectedSpecies ? speciesLabel(species).toUpperCase() : "EXISTENCIAS TOTALES");
    setText("#metricDensity", rows.length ? `${(total / rows.length).toLocaleString("es-AR", { maximumFractionDigits: 1 })} cabezas / unidad` : "Sin unidades visibles");
    setText("#metricConcentration", total ? `${Math.round((top / total) * 100)}%` : "—");
    setText("#metricGrids", formatNumber.format(rows.length));
    setText("#metricMapped", `${formatNumber.format(rows.length)} georreferenciados · Según filtros activos`);
  }

  function renderOperationalMarkers(state) {
    if (!state.markerLayer || !state.map) return;
    state.markerLayer.clearLayers();
    const rows = state.visible || [];
    const limit = Number(APP_CONFIG.INTERNAL_MAX_MARKERS || 800);
    const shouldCluster = rows.length > limit;
    const groups = shouldCluster ? makeOperationalClusters(rows, state.map.getZoom()) : rows.map((item) => ({ items: [item], lat: item.lat, lon: item.lon }));
    groups.forEach((group) => {
      if (group.items.length > 1) {
        const marker = L.marker([group.lat, group.lon], { icon: L.divIcon({ className: "", html: `<span class="producer-cluster">${formatNumber.format(group.items.length)}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] }) });
        marker.bindTooltip(`${formatNumber.format(group.items.length)} productores agrupados`, { direction: "top" });
        marker.on("click", () => { const bounds = L.latLngBounds(group.items.map((item) => [item.lat, item.lon])); state.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 }); });
        state.markerLayer.addLayer(marker);
        return;
      }
      const item = group.items[0]; const selected = state.selected?.id === item.id; const radius = markerRadius(item.totalExistencias, rows);
      const markerColor = selected ? "#c98336" : speciesColor(dominantProducerSpecies(item));
      const marker = L.marker([item.lat, item.lon], { icon: L.divIcon({ className: "", html: `<span class="producer-marker${selected ? " is-selected" : ""}" style="width:${radius}px;height:${radius}px;background:${markerColor}"></span>`, iconSize: [radius, radius], iconAnchor: [radius / 2, radius / 2] }) });
      marker.bindTooltip(producerTooltip(item), { direction: "top", opacity: .96 });
      marker.on("click", () => selectOperationalProducer(item, state));
      state.markerLayer.addLayer(marker);
    });
  }

  function makeOperationalClusters(rows, zoom) {
    const step = zoom < 8 ? .45 : zoom < 10 ? .16 : .06;
    const groups = new Map();
    rows.forEach((item) => { const key = `${Math.round(item.lat / step)}:${Math.round(item.lon / step)}`; const group = groups.get(key) || { items: [] }; group.items.push(item); groups.set(key, group); });
    return [...groups.values()].map((group) => ({ ...group, lat: group.items.reduce((sumValue, item) => sumValue + item.lat, 0) / group.items.length, lon: group.items.reduce((sumValue, item) => sumValue + item.lon, 0) / group.items.length }));
  }

  function markerRadius(value, rows) { const max = Math.max(...rows.map((item) => item.totalExistencias), 1); return Math.round(10 + Math.min(12, Math.sqrt(Math.max(0, value) / max) * 12)); }
  function speciesColor(species) { return ({ bovinos: "#2e8d89", bubalinos: "#b17841", ovinos: "#6d91ad", caprinos: "#8b72a5", porcinos: "#9c6472", equinos: "#597d92" })[species] || "#2e8d89"; }
  function producerTooltip(item) { return `<div class="producer-popup"><strong>${escapeHtml(item.displayId)}</strong><span>${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación administrativa no informada")}</span><span><b>${formatNumber.format(item.totalExistencias)}</b> existencias · ${escapeHtml(titleCase(dominantProducerSpecies(item)))}</span></div>`; }
  function dominantProducerSpecies(item) { return Object.entries(item.especies || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "sin especie informada"; }

  function selectOperationalProducer(item, state) {
    state.selected = item;
    state.map?.setView([item.lat, item.lon], Math.max(state.map.getZoom(), 12), { animate: true });
    renderOperationalTerritory(state.data, state);
  }

  function renderOperationalPanel(rows, state) {
    const list = $("#focusList"), detail = $("#producerDetail"), close = $("#closeProducerDetailButton");
    if (state.selected && APP_CONFIG.ENABLE_PRODUCER_DETAIL !== false) {
      list.hidden = true; detail.hidden = false; close.hidden = false;
      detail.innerHTML = producerDetailMarkup(state.selected);
      setText("#focusEyebrow", "FICHA OPERATIVA"); setText("#focusTitle", "Detalle de unidad"); setText("#focusFootnote", "Información interna desagregada. No compartir ni publicar sin autorización.");
      return;
    }
    if (state.selected) {
      list.hidden = false; detail.hidden = true; close.hidden = true;
      list.innerHTML = "<p class=\"empty-panel-message\">El detalle individual está deshabilitado en esta configuración.</p>";
      return;
    }
    detail.hidden = true; list.hidden = false; close.hidden = true;
    setText("#focusEyebrow", "RANKING OPERATIVO"); setText("#focusTitle", "Unidades destacadas"); setText("#focusFootnote", "Seleccione un productor en el mapa para consultar su ficha operativa.");
    list.innerHTML = rows.length ? [...rows].sort((a, b) => b.totalExistencias - a.totalExistencias).slice(0, 7).map((item, index) => `<button class="focus-row operational-focus-row" type="button" data-producer-id="${escapeHtml(item.id)}"><span class="focus-rank">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(item.displayId)}</strong><small>${escapeHtml([item.departamento, item.municipio].filter(Boolean).join(" · ") || "Ubicación no informada")}</small></span><b>${formatNumber.format(item.totalExistencias)}<em>cabezas</em></b></button>`).join("") : "<p class=\"empty-panel-message\">No hay productores georreferenciados para los filtros seleccionados.</p>";
    list.querySelectorAll("[data-producer-id]").forEach((button) => button.addEventListener("click", () => { const item = rows.find((row) => row.id === button.dataset.producerId); if (item) selectOperationalProducer(item, state); }));
  }

  function producerDetailMarkup(item) {
    const total = item.totalExistencias || 1;
    const bars = (collection) => Object.entries(collection || {}).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<div class="producer-bar"><span>${escapeHtml(titleCase(key))}</span><i style="--share:${Math.min(100, value / total * 100)}%"></i><b>${formatNumber.format(value)}</b></div>`).join("") || "<p class=\"empty-panel-message\">No se informaron valores desagregados.</p>";
    const categoryRows = Object.entries(item.categorias || {}).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<tr><td>${escapeHtml(titleCase(key))}</td><td>${formatNumber.format(value)}</td></tr>`).join("") || "<tr><td colspan=\"2\">Sin categorías informadas.</td></tr>";
    return `<div class="producer-detail-header"><h3>${escapeHtml(item.displayId)}</h3><p>${escapeHtml([item.departamento, item.municipio, item.oficinaLocal].filter(Boolean).join(" · ") || "Ubicación administrativa no informada")}</p></div><div class="producer-kpis"><div><span>Existencias</span><strong>${formatNumber.format(item.totalExistencias)}</strong></div><div><span>Especie dominante</span><strong>${escapeHtml(titleCase(dominantProducerSpecies(item)))}</strong></div></div><section class="producer-detail-section"><h4>Existencias por especie</h4><div class="producer-bars">${bars(item.especies)}</div></section><section class="producer-detail-section"><h4>Categorías ganaderas</h4><table class="producer-detail-table"><tbody>${categoryRows}</tbody></table></section>`;
  }

  function renderOperationalFilterChips(state, count) {
    const target = $("#territoryFilterChips"); if (!target) return;
    const labels = [["Especie", state.filters.species && state.filters.species !== "all" ? speciesLabel(state.filters.species) : "Todas"], ["Departamento", state.filters.department !== "all" ? state.filters.department : "Toda la provincia"], ["Municipio", state.filters.municipality], ["Oficina", state.filters.office], ["Categoría", state.category], ["Mínimo", state.minStock ? `${formatNumber.format(state.minStock)} cabezas` : ""]].filter(([, value]) => value);
    target.innerHTML = `<span class="filter-count">${formatNumber.format(count)} visibles</span>${labels.map(([label, value]) => `<span class="operational-filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join("")}`;
  }

  function showOperationalEmpty(message) {
    const empty = $("#producerMapEmpty"); if (!empty) return;
    const text = message || "No se encontró la fuente interna de productores. Contacte al administrador del dashboard.";
    const failed = /Leaflet|inicializaci[oó]n|cargar el mapa/i.test(text);
    empty.hidden = false; empty.innerHTML = `<div><h3>${failed ? "No se pudo cargar el mapa" : "Modo interno preparado"}</h3><p>${escapeHtml(text)}</p></div>`;
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
      return { ...defaultFilters(), ...stored, species: SPECIES.some(([key]) => key === stored.species) ? stored.species : "bovinos" };
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
