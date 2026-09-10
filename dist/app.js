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

  setupNavigation();
  fetch("./data/senasa-corrientes.json")
    .then((response) => { if (!response.ok) throw new Error("No se pudo leer la base agregada."); return response.json(); })
    .then(init)
    .catch((error) => {
      document.querySelectorAll(".panel").forEach((panel) => panel.insertAdjacentHTML("beforeend", `<p class="error-state">${error.message}</p>`));
      console.error(error);
    });

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

  function init(data) {
    setupCommon(data);
    if (document.body.dataset.view === "territorio") initTerritory(data);
    if (document.body.dataset.view === "analisis") initAnalysis(data);
  }

  function setupCommon(data) {
    const totals = data.totales;
    setText("#sidebarRecords", formatNumber.format(totals.registros));
    const now = new Date(data.metadata.actualizado);
    setText("#updateText", `Base actualizada ${now.toLocaleDateString("es-AR")}`);
    setText("#metricBovinos", formatNumber.format(totals.bovinos));
    setText("#metricDensity", `${totals.bovinos_por_registro.toLocaleString("es-AR", { maximumFractionDigits: 1 })}`);
  }

  function initTerritory(data) {
    const totals = data.totales;
    const speciesSelect = $("#speciesSelect");
    const deptSelect = $("#departmentSelect");
    const map = $("#territoryMap");
    const state = { species: "bovinos", department: "all", mode: "browse", vertices: [], selected: [], activeGrids: [], projection: null, zoom: false };
    setText("#metricRecords", formatNumber.format(totals.registros));
    setText("#metricMapped", `${formatNumber.format(totals.registros_georreferenciados)} georreferenciados`);
    setText("#metricConcentration", `${totals.concentracion_top5_bovinos.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);
    setText("#metricGrids", formatNumber.format(data.grillas.length));
    setText("#sourceInfo", `${data.metadata.alcance} ${data.metadata.privacidad} ${data.metadata.geometria}`);
    const dialog = $("#infoDialog");
    $("#infoButton")?.addEventListener("click", () => dialog.showModal());
    $(".dialog-close")?.addEventListener("click", () => dialog.close());

    speciesSelect.innerHTML = SPECIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    deptSelect.innerHTML = `<option value="all">Toda la provincia</option>${data.departamentos.map((item) => `<option value="${escapeHtml(item.nombre)}">${escapeHtml(titleCase(item.nombre))}</option>`).join("")}`;
    const redraw = () => {
      state.species = speciesSelect.value;
      state.department = deptSelect.value;
      state.mode = "browse";
      state.vertices = [];
      state.selected = [];
      state.zoom = false;
      renderTerritory(data, state);
    };
    speciesSelect.addEventListener("change", redraw);
    deptSelect.addEventListener("change", redraw);

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
    renderTerritory(data, state);
    registerModelTool({
      name: "set_territorial_filter",
      title: "Filtrar mapa territorial",
      description: "Actualiza el mapa de Corrientes por especie y, opcionalmente, por departamento.",
      inputSchema: { type: "object", properties: { especie: { type: "string", enum: SPECIES.map(([key]) => key) }, departamento: { type: "string" } }, required: ["especie"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || !SPECIES.some(([key]) => key === input.especie)) throw new Error("Especie no válida.");
        const requestedDepartment = input.departamento || "all";
        if (![...deptSelect.options].some((option) => option.value === requestedDepartment)) throw new Error("Departamento no válido.");
        speciesSelect.value = input.especie;
        deptSelect.value = requestedDepartment;
        redraw();
        return { especie: input.especie, departamento: requestedDepartment, grillas_visibles: state.activeGrids.length };
      },
    });
  }

  function renderTerritory(data, state) {
    const grids = data.grillas.filter((item) => state.department === "all" || item.departamento === state.department);
    const municipalities = data.municipios.filter((item) => state.department === "all" || item.departamento === state.department);
    const label = speciesLabel(state.species);
    state.activeGrids = grids;
    renderMap(data, grids, state);
    const selected = state.mode === "selected" ? state.selected : null;
    renderFocus(selected || grids, state.species, label);
    renderMunicipalities(municipalities);
    const localTotal = sum(grids, state.species);
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
    svg.setAttribute("viewBox", state.zoom && state.vertices.length > 2 ? selectionViewBox(state.vertices) : MAP_VIEW);
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
    const maxValue = Math.max(...grids.map((item) => value(item, state.species)), 1);
    pointsGroup.innerHTML = grids.map((item, index) => {
      const [x, y] = projection.project([item.lon, item.lat]);
      const radius = 3 + Math.sqrt(value(item, state.species) / maxValue) * 18;
      const classes = ["map-point", hasSelection && selectedKeys.has(gridKey(item)) ? "is-selected" : "", hasSelection && !selectedKeys.has(gridKey(item)) ? "is-dimmed" : ""].filter(Boolean).join(" ");
      return `<circle class="${classes}" data-index="${index}" tabindex="0" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}"><title>${escapeHtml(titleCase(item.municipio))}: ${formatNumber.format(value(item, state.species))} ${state.species}</title></circle>`;
    }).join("");
    pointsGroup.querySelectorAll(".map-point").forEach((circle) => {
      const item = grids[Number(circle.dataset.index)];
      const show = (event) => {
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>${escapeHtml(titleCase(item.municipio))}</strong><span>${escapeHtml(titleCase(item.departamento))} · ${formatNumber.format(item.registros)} registros</span><br><b>${formatNumber.format(value(item, state.species))}</b> ${state.species.toLowerCase()}`;
        const box = svg.getBoundingClientRect();
        const x = event.clientX ? event.clientX - box.left + 14 : Number(circle.getAttribute("cx")) / 800 * box.width + 15;
        const y = event.clientY ? event.clientY - box.top - 10 : Number(circle.getAttribute("cy")) / 620 * box.height;
        tooltip.style.left = `${Math.min(Math.max(10, x), box.width - 220)}px`;
        tooltip.style.top = `${Math.min(Math.max(10, y), box.height - 95)}px`;
      };
      circle.addEventListener("pointerenter", show); circle.addEventListener("pointermove", show); circle.addEventListener("focus", show);
      circle.addEventListener("pointerleave", () => tooltip.hidden = true); circle.addEventListener("blur", () => tooltip.hidden = true);
    });
  }

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
    $("#municipalityRows").innerHTML = [...items].sort((a, b) => b.bovinos - a.bovinos).slice(0, 35).map((item) => `<tr><td>${escapeHtml(titleCase(item.nombre))}</td><td>${escapeHtml(titleCase(item.departamento))}</td><td>${escapeHtml(titleCase(item.oficina))}</td><td>${formatNumber.format(item.registros)}</td><td class="numeric">${formatNumber.format(item.bovinos)}</td><td class="numeric">${formatNumber.format(item.bubalinos)}</td><td class="numeric">${formatNumber.format(item.ovinos)}</td></tr>`).join("");
  }

  function initAnalysis(data) {
    const totals = data.totales;
    setText("#metricAnimals", formatNumber.format(totals.animales));
    setText("#metricBovineShare", `${(totals.bovinos / totals.animales * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% de las existencias`);
    setText("#metricCoverage", `${(totals.registros_georreferenciados / totals.registros * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);
    renderSpecies(data); renderBars(data.departamentos); renderScatter(data.departamentos); renderSpatialStatistics(data); setupScenario(totals.bovinos); renderInsight(data); renderTraceability(data);
  }

  function renderSpecies(data) {
    const total = data.totales.animales;
    let offset = 0;
    const segments = SPECIES.map(([key, , color]) => { const portion = value(data.totales, key) / total * 100; const result = `${color} ${offset}% ${offset + portion}%`; offset += portion; return result; });
    $("#speciesDonut").style.background = `conic-gradient(${segments.join(",")})`;
    setText("#donutTotal", formatNumber.format(total));
    $("#speciesLegend").innerHTML = SPECIES.map(([key, label, color]) => `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span class="legend-name">${label}</span><span class="legend-value">${formatNumber.format(value(data.totales, key))}</span></div>`).join("");
  }

  function renderBars(departments) {
    const top = departments.slice(0, 8); const max = top[0]?.bovinos || 1;
    $("#departmentBars").innerHTML = top.map((item) => `<div class="bar-row"><span class="bar-label">${escapeHtml(titleCase(item.nombre))}</span><div class="bar-track"><div class="bar-fill" style="width:${item.bovinos / max * 100}%"></div></div><strong class="bar-value">${formatNumber.format(item.bovinos)}</strong></div>`).join("");
  }

  function renderScatter(departments) {
    const maxRecords = Math.max(...departments.map((item) => item.registros), 1); const maxBovines = Math.max(...departments.map((item) => item.bovinos), 1);
    $("#scatterPoints").innerHTML = departments.map((item) => { const density = item.bovinos / Math.max(item.registros, 1); const size = 8 + Math.min(18, Math.sqrt(density) / 2); return `<span class="scatter-point" title="${escapeHtml(titleCase(item.nombre))}: ${formatNumber.format(item.registros)} registros · ${formatNumber.format(item.bovinos)} bovinos" style="left:${item.registros / maxRecords * 92 + 3}%;bottom:${item.bovinos / maxBovines * 88 + 3}%;width:${size}px;height:${size}px"></span>`; }).join("");
  }

  function renderSpatialStatistics(data) {
    const stats = calculateSpatialStats(data);
    setText("#statMedianGrid", formatNumber.format(stats.median));
    setText("#statP90Grid", formatNumber.format(stats.p90));
    setText("#statSpatialCV", `${formatDecimal.format(stats.cv)}%`);
    setText("#statGini", stats.gini.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
    setText("#statHHI", formatNumber.format(stats.hhi));
    setText("#statisticalNarrative", `La mediana es de ${formatNumber.format(stats.median)} bovinos por grilla, mientras que el 10% superior supera ${formatNumber.format(stats.p90)}. La dispersión relativa (CV) es ${formatDecimal.format(stats.cv)}%; los índices de Gini e IHH describen concentración territorial y no productividad ni rentabilidad.`);
  }

  function calculateSpatialStats(data) {
    const values = data.grillas.map((item) => value(item, "bovinos"));
    const total = sum(values);
    const mean = total / Math.max(values.length, 1);
    const deviation = Math.sqrt(sum(values.map((item) => (item - mean) ** 2)) / Math.max(values.length, 1));
    const ordered = [...values].sort((a, b) => a - b);
    const hhi = sum(data.departamentos.map((item) => (value(item, "bovinos") / data.totales.bovinos) ** 2)) * 10000;
    const weightedRank = ordered.reduce((acc, item, index) => acc + (index + 1) * item, 0);
    const gini = total ? (2 * weightedRank) / (ordered.length * total) - (ordered.length + 1) / ordered.length : 0;
    return { median: quantile(ordered, .5), p90: quantile(ordered, .9), cv: mean ? deviation / mean * 100 : 0, hhi, gini };
  }

  function quantile(sorted, percentile) {
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index); const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  function setupScenario(bovines) {
    const price = $("#priceInput"), cost = $("#costInput"), trace = $("#scenarioTrace");
    const update = () => {
      const p = Number(price.value), c = Number(cost.value);
      const hasPrice = price.value.trim() !== "" && Number.isFinite(p) && p >= 0;
      const hasCost = cost.value.trim() !== "" && Number.isFinite(c) && c >= 0;
      setText("#grossValue", hasPrice ? formatMoney.format(bovines * p) : "Ingrese un supuesto");
      setText("#costValue", hasCost ? formatMoney.format(bovines * c) : "Ingrese un supuesto");
      setText("#netValue", hasPrice && hasCost ? formatMoney.format(bovines * (p - c)) : "—");
      if (trace) trace.textContent = hasPrice && hasCost ? `Escenario de esta sesión: ${formatMoney.format(p)} de valor y ${formatMoney.format(c)} de costo por bovino × ${formatNumber.format(bovines)} bovinos. Margen unitario supuesto: ${formatMoney.format(p - c)}.` : "Defina ambos supuestos para documentar el escenario de consulta.";
    };
    price.addEventListener("input", update); cost.addEventListener("input", update); update();
    registerModelTool({
      name: "set_economic_scenario",
      title: "Definir escenario económico",
      description: "Actualiza el escenario visible con un valor y costo estimado por bovino en pesos argentinos.",
      inputSchema: { type: "object", properties: { valor_por_bovino: { type: "number", minimum: 0 }, costo_por_bovino: { type: "number", minimum: 0 } }, required: ["valor_por_bovino", "costo_por_bovino"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !Number.isFinite(input.valor_por_bovino) || !Number.isFinite(input.costo_por_bovino) || input.valor_por_bovino < 0 || input.costo_por_bovino < 0) throw new Error("Los supuestos deben ser números no negativos.");
        price.value = String(input.valor_por_bovino);
        cost.value = String(input.costo_por_bovino);
        update();
        return { bovinos: bovines, valor_bruto_estimado: bovines * input.valor_por_bovino, costo_estimado: bovines * input.costo_por_bovino, margen_referencia: bovines * (input.valor_por_bovino - input.costo_por_bovino) };
      },
    });
  }

  function renderInsight(data) {
    const first = data.departamentos[0]; const share = first.bovinos / data.totales.bovinos * 100;
    setText("#insightTitle", `${titleCase(first.nombre)} concentra el mayor stock bovino`);
    setText("#insightText", `Con ${formatNumber.format(first.bovinos)} bovinos, representa ${share.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% del stock provincial. La concentración de los cinco departamentos principales alcanza ${data.totales.concentracion_top5_bovinos.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%.`);
  }

  function renderTraceability(data) {
    const target = $("#sourceTraceability");
    if (!target) return;
    const date = new Date(data.metadata.actualizado).toLocaleDateString("es-AR");
    target.innerHTML = `<ul class="trace-list"><li><span>Fuente</span><strong>${escapeHtml(data.metadata.fuente)}</strong></li><li><span>Actualización</span><strong>${date}</strong></li><li><span>Unidad</span><strong>Registro, municipio, departamento y grilla territorial agregada.</strong></li><li><span>Privacidad</span><strong>No contiene titulares, identificadores, contactos ni coordenadas exactas.</strong></li><li><span>Límite</span><strong>${escapeHtml(data.metadata.alcance)}</strong></li></ul>`;
  }

  function registerModelTool(tool) {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    try { void Promise.resolve(context.registerTool(tool)).catch((error) => console.warn("No se pudo registrar la herramienta del sitio", error)); } catch (error) { console.warn("No se pudo registrar la herramienta del sitio", error); }
  }

  function flattenCoords(geometry) { const collect = (entry) => Array.isArray(entry?.[0]) ? entry.flatMap(collect) : [entry]; return geometry?.coordinates ? collect(geometry.coordinates).filter((point) => Array.isArray(point) && Number.isFinite(point[0])) : []; }
  function geometryPath(geometry, project) { const rings = []; const draw = (coords) => { if (Array.isArray(coords?.[0]?.[0])) coords.forEach(draw); else if (Array.isArray(coords?.[0])) rings.push(`M${coords.map((point) => project(point).map((v) => v.toFixed(1)).join(",")).join("L")}Z`); }; draw(geometry.coordinates); return rings.join(" "); }
  function titleCase(text) { return String(text || "").toLowerCase().replace(/\b\p{L}/gu, (char) => char.toUpperCase()); }
  function escapeHtml(text) { return String(text ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
})();
