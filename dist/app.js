(() => {
  const SPECIES = [
    ["bovinos", "Bovinos", "#35d5c1"],
    ["bubalinos", "Bubalinos", "#f2a45c"],
    ["equinos", "Equinos", "#5b9cf2"],
    ["porcinos", "Porcinos", "#e07f94"],
    ["caprinos", "Caprinos", "#b694ef"],
    ["ovinos", "Ovinos", "#8dcf72"],
  ];
  const formatNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const formatMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const $ = (selector) => document.querySelector(selector);
  const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const value = (item, key) => Number(item?.[key] || 0);

  fetch("./data/senasa-corrientes.json")
    .then((response) => { if (!response.ok) throw new Error("No se pudo leer la base agregada."); return response.json(); })
    .then(init)
    .catch((error) => {
      document.querySelectorAll(".panel").forEach((panel) => panel.insertAdjacentHTML("beforeend", `<p class="error-state">${error.message}</p>`));
      console.error(error);
    });

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
    setText("#metricRecords", formatNumber.format(totals.registros));
    setText("#metricMapped", `${formatNumber.format(totals.registros_georreferenciados)} georreferenciados`);
    setText("#metricConcentration", `${totals.concentracion_top5_bovinos.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);
    setText("#metricGrids", formatNumber.format(data.grillas.length));
    setText("#sourceInfo", `${data.metadata.alcance} ${data.metadata.privacidad} ${data.metadata.geometria}`);
    const dialog = $("#infoDialog");
    $("#infoButton")?.addEventListener("click", () => dialog.showModal());
    $(".dialog-close")?.addEventListener("click", () => dialog.close());

    const speciesSelect = $("#speciesSelect");
    const deptSelect = $("#departmentSelect");
    speciesSelect.innerHTML = SPECIES.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    deptSelect.innerHTML = `<option value="all">Toda la provincia</option>${data.departamentos.map((item) => `<option value="${escapeHtml(item.nombre)}">${escapeHtml(titleCase(item.nombre))}</option>`).join("")}`;
    const render = () => renderTerritory(data, speciesSelect.value, deptSelect.value);
    speciesSelect.addEventListener("change", render);
    deptSelect.addEventListener("change", render);
    render();
    registerModelTool({
      name: "set_territorial_filter",
      title: "Filtrar mapa territorial",
      description: "Actualiza el mapa de Corrientes por especie y, opcionalmente, por departamento.",
      inputSchema: {
        type: "object",
        properties: {
          especie: { type: "string", enum: SPECIES.map(([key]) => key) },
          departamento: { type: "string" },
        },
        required: ["especie"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || !SPECIES.some(([key]) => key === input.especie)) throw new Error("Especie no válida.");
        const requestedDepartment = input.departamento || "all";
        if (![...deptSelect.options].some((option) => option.value === requestedDepartment)) throw new Error("Departamento no válido.");
        speciesSelect.value = input.especie;
        deptSelect.value = requestedDepartment;
        render();
        return { especie: input.especie, departamento: requestedDepartment, grillas_visibles: data.grillas.filter((item) => requestedDepartment === "all" || item.departamento === requestedDepartment).length };
      },
    });
  }

  function renderTerritory(data, species, department) {
    const grids = data.grillas.filter((item) => department === "all" || item.departamento === department);
    const municipalities = data.municipios.filter((item) => department === "all" || item.departamento === department);
    const label = SPECIES.find(([key]) => key === species)[1];
    renderMap(data, grids, species);
    renderFocus(grids, species, label);
    renderMunicipalities(municipalities);
    const localTotal = grids.reduce((sum, item) => sum + value(item, species), 0);
    setText("#selectedSummary", `${formatNumber.format(localTotal)} ${label.toLowerCase()}`);
    setText("#tableSummary", `${formatNumber.format(municipalities.length)} unidades territoriales`);
  }

  function renderMap(data, grids, species) {
    const svg = $("#territoryMap");
    const pointsGroup = $("#mapPoints");
    const gridGroup = $("#mapGrid");
    const provincePath = $("#provinceShape");
    const tooltip = $("#mapTooltip");
    const allCoords = flattenCoords(data.limite_corrientes || { type: "", coordinates: [] });
    const fallback = grids.flatMap((item) => [[item.lon, item.lat]]);
    const coords = allCoords.length ? allCoords : fallback;
    const xs = coords.map((point) => point[0]); const ys = coords.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = 800, height = 620, padding = 48;
    const ratioX = (width - padding * 2) / (maxX - minX || 1);
    const ratioY = (height - padding * 2) / (maxY - minY || 1);
    const scale = Math.min(ratioX, ratioY);
    const project = ([lon, lat]) => [padding + (lon - minX) * scale, height - padding - (lat - minY) * scale];
    gridGroup.innerHTML = Array.from({ length: 8 }, (_, index) => {
      const x = padding + index * ((width - padding * 2) / 7);
      const y = padding + index * ((height - padding * 2) / 7);
      return `<path class="map-grid-line" d="M${x} ${padding}V${height - padding}M${padding} ${y}H${width - padding}"/>`;
    }).join("");
    if (allCoords.length) {
      provincePath.setAttribute("d", geometryPath(data.limite_corrientes, project));
      provincePath.setAttribute("class", "province-path");
    } else {
      provincePath.setAttribute("d", "");
    }
    const maxValue = Math.max(...grids.map((item) => value(item, species)), 1);
    pointsGroup.innerHTML = grids.map((item, index) => {
      const [x, y] = project([item.lon, item.lat]);
      const radius = 3 + Math.sqrt(value(item, species) / maxValue) * 18;
      return `<circle class="map-point" data-index="${index}" tabindex="0" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}"><title>${escapeHtml(titleCase(item.municipio))}: ${formatNumber.format(value(item, species))} ${species}</title></circle>`;
    }).join("");
    pointsGroup.querySelectorAll(".map-point").forEach((circle) => {
      const item = grids[Number(circle.dataset.index)];
      const show = (event) => {
        tooltip.hidden = false;
        tooltip.innerHTML = `<strong>${escapeHtml(titleCase(item.municipio))}</strong><span>${escapeHtml(titleCase(item.departamento))} · ${formatNumber.format(item.registros)} registros</span><br><b>${formatNumber.format(value(item, species))}</b> ${species.toLowerCase()}`;
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

  function renderFocus(grids, species, label) {
    const top = [...grids].sort((a, b) => value(b, species) - value(a, species)).slice(0, 7);
    $("#focusList").innerHTML = top.map((item, index) => `<div class="focus-item"><span class="rank">0${index + 1}</span><div><strong>${escapeHtml(titleCase(item.municipio))}</strong><span>${escapeHtml(titleCase(item.departamento))} · ${formatNumber.format(item.registros)} registros</span></div><div class="focus-value">${formatNumber.format(value(item, species))}<span>${label}</span></div></div>`).join("") || '<p class="loading">Sin datos para el filtro seleccionado.</p>';
  }

  function renderMunicipalities(items) {
    $("#municipalityRows").innerHTML = [...items].sort((a, b) => b.bovinos - a.bovinos).slice(0, 35).map((item) => `<tr><td>${escapeHtml(titleCase(item.nombre))}</td><td>${escapeHtml(titleCase(item.departamento))}</td><td>${escapeHtml(titleCase(item.oficina))}</td><td>${formatNumber.format(item.registros)}</td><td class="numeric">${formatNumber.format(item.bovinos)}</td><td class="numeric">${formatNumber.format(item.bubalinos)}</td><td class="numeric">${formatNumber.format(item.ovinos)}</td></tr>`).join("");
  }

  function initAnalysis(data) {
    const totals = data.totales;
    setText("#metricAnimals", formatNumber.format(totals.animales));
    setText("#metricBovineShare", `${(totals.bovinos / totals.animales * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% de las existencias`);
    setText("#metricCoverage", `${(totals.registros_georreferenciados / totals.registros * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);
    renderSpecies(data); renderBars(data.departamentos); renderScatter(data.departamentos); setupScenario(totals.bovinos); renderInsight(data);
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

  function setupScenario(bovines) {
    const price = $("#priceInput"), cost = $("#costInput");
    const update = () => { const p = Number(price.value), c = Number(cost.value); const hasPrice = price.value.trim() !== "" && p >= 0; const hasCost = cost.value.trim() !== "" && c >= 0; setText("#grossValue", hasPrice ? formatMoney.format(bovines * p) : "Ingrese un supuesto"); setText("#costValue", hasCost ? formatMoney.format(bovines * c) : "Ingrese un supuesto"); setText("#netValue", hasPrice && hasCost ? formatMoney.format(bovines * (p - c)) : "—"); };
    price.addEventListener("input", update); cost.addEventListener("input", update); update();
    registerModelTool({
      name: "set_economic_scenario",
      title: "Definir escenario económico",
      description: "Actualiza el escenario visible con un valor y costo estimado por bovino en pesos argentinos.",
      inputSchema: {
        type: "object",
        properties: { valor_por_bovino: { type: "number", minimum: 0 }, costo_por_bovino: { type: "number", minimum: 0 } },
        required: ["valor_por_bovino", "costo_por_bovino"],
        additionalProperties: false,
      },
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

  function registerModelTool(tool) {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    try { void Promise.resolve(context.registerTool(tool)).catch((error) => console.warn("No se pudo registrar la herramienta del sitio", error)); } catch (error) { console.warn("No se pudo registrar la herramienta del sitio", error); }
  }

  function flattenCoords(geometry) { const collect = (value) => Array.isArray(value?.[0]) ? value.flatMap(collect) : [value]; return geometry?.coordinates ? collect(geometry.coordinates).filter((point) => Array.isArray(point) && Number.isFinite(point[0])) : []; }
  function geometryPath(geometry, project) { const rings = []; const draw = (coords) => { if (Array.isArray(coords?.[0]?.[0])) coords.forEach(draw); else if (Array.isArray(coords?.[0])) rings.push(`M${coords.map((point) => project(point).map((v) => v.toFixed(1)).join(",")).join("L")}Z`); }; draw(geometry.coordinates); return rings.join(" "); }
  function titleCase(text) { return String(text || "").toLowerCase().replace(/\b\p{L}/gu, (char) => char.toUpperCase()); }
  function escapeHtml(text) { return String(text ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
})();
