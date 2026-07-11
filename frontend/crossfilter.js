// =============================================================================
//  CROSSFILTER ENGINE — Dual Crossfilter pattern, istogrammi DC.js, orchestratore
//  Estratto da level0.js per separare il motore analitico dal rendering L0.
//  Dipende da: config.js, state.js, utils.js, pcp.js, map.js, level0.js, level1.js
// =============================================================================

// ── Istogrammi DC.js (dichiarati qui perché usati da buildCrossfilter) ──────
const severityChart = new dc.BarChart('#chart-aadt');
const trafficChart  = new dc.BarChart('#chart-traffic');
const crChart       = new dc.BarChart('#chart-cr');
const crNormChart   = new dc.BarChart('#chart-cr-norm');

window._hideTail = true;

// =============================================================================
//  buildCrossfilter — Ricrea il dual crossfilter a partire dal dataset master
// =============================================================================

function buildCrossfilter(allMasterData) {
  // Salva i filtri preesistenti per non perderli durante i ricalcoli (Timeline)
  const savedFilters = [
    { chart: severityChart, filters: severityChart.filters() },
    { chart: trafficChart,  filters: trafficChart.filters()  },
    { chart: crChart,       filters: crChart.filters()       },
    { chart: crNormChart,   filters: crNormChart.filters()   },
  ];

  // Salva gli RCSTA pennellati nel PCP prima del rebuild
  let pcpBrushedSet = null;
  if (pc && pc.brushed && typeof pc.brushed === 'function') {
    const brushed = pc.brushed();
    if (brushed && brushed.length > 0 && brushed.length !== (_allPcData || []).length)
      pcpBrushedSet = new Set(brushed.map(d => d.RCSTA));
  }

  // Normalizza oneway a stringa per il PCP categorico
  allMasterData.forEach(d => {
    d.oneway = (d.oneway === 'Y' || d.oneway === '1' || d.oneway === 1 ||
                d.oneway === true || d.oneway === 'Yes') ? 'Yes' : 'No';
  });

  // Divide i segmenti nelle due popolazioni (Dual Crossfilter Pattern)
  // e applica filtro validità temporale
  const timeWin = +(document.getElementById('time-window-select')?.value || 1);
  const treatedData = allMasterData.filter(d => {
    if (d.treated != true) return false;
    if (timeWin === 2 && (d.install_year - 2 < 2015)) return false;
    if (timeWin === 3 && (d.install_year - 3 < 2015)) return false;
    return true;
  });
  const untreatedData = allMasterData.filter(d => {
    if (d.treated == true) return false;
    if (timeWin === 2 && (d.install_year - 2 < 2015)) return false;
    if (timeWin === 3 && (d.install_year - 3 < 2015)) return false;
    return true;
  });
  const ndxT = crossfilter(treatedData);
  const ndxU = crossfilter(untreatedData);

  // Dimensioni master RCSTA per orchestrare Mappa e Pulsanti
  if (scatterDimT) scatterDimT.dispose();
  if (scatterDimU) scatterDimU.dispose();
  scatterDimT = ndxT.dimension(d => d.RCSTA);
  scatterDimU = ndxU.dimension(d => d.RCSTA);

  // Dimensioni PCP
  if (_pcpDim)  { _pcpDim.dispose();  _pcpDim  = null; }
  if (_pcpDimU) { _pcpDimU.dispose(); _pcpDimU = null; }
  _pcpDim  = ndxT.dimension(d => d.RCSTA);
  _pcpDimU = ndxU.dimension(d => d.RCSTA);

  // Massimo assoluto per visualizzare la long tail
  const getMax = key => allMasterData.reduce((max, d) => {
    const v = +(d[key] ?? 0);
    return isFinite(v) && v > max ? v : max;
  }, 0);

  // Percentile 95°
  const pctArr = key => allMasterData.map(d => +(d[key] ?? 0)).filter(v => isFinite(v) && v > 0);
  const p95 = key => percentile(pctArr(key), 0.95);

  const N_BINS = 30;
  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';

  const severityField = `severity_index_pre_${activeYear}y`;
  const trafficField  = `traffic_index_pre_${activeYear}y`;
  const crField       = `crashes_pre_norm_${activeYear}y`;
  const crNormField   = `crashes_pre_norm_aadt_${activeYear}y`;

  const isTailHidden = window._hideTail === true;

  const severityMax = isTailHidden ? Math.max(1, p95(severityField)) : 5;
  const severityBin = severityMax / N_BINS;
  const trMax  = isTailHidden ? Math.max(1, p95(trafficField))  : Math.max(1, getMax(trafficField));
  const trBin  = trMax  / N_BINS;
  const crMax  = isTailHidden ? Math.max(1, p95(crField))       : Math.max(1, getMax(crField));
  const crBin  = crMax  / N_BINS;
  const crnMax = isTailHidden ? Math.max(0.01, p95(crNormField)) : 5;
  const crnBin = crnMax / N_BINS;

  const totalT = treatedData.length   || 1;
  const totalU = untreatedData.length || 1;

  // Fabbrica dimensione+gruppo normalizzato [0..1] per un istogramma
  const mkDG = (ndx, key, binFn, totalCount) => {
    const dim   = ndx.dimension(d => +(d[key] ?? 0));
    const group = dim.group(binFn);
    const initialAll = group.all();
    const totalCache = {};
    initialAll.forEach(d => { totalCache[d.key] = d.value / totalCount; });
    const normGroup = {
      all: () => group.all().map(d => ({ key: d.key, value: d.value / totalCount }))
    };
    const unselectedGroup = {
      all: () => group.all().map(d => ({
        key:   d.key,
        value: Math.max(0, (totalCache[d.key] || 0) - (d.value / totalCount))
      }))
    };
    return { dim, group: normGroup, unselectedGroup, rawGroup: group };
  };

  // Raggruppatori per la popolazione TRATTATA (blu)
  const T = {
    severity: mkDG(ndxT, severityField, v => Math.floor(v / severityBin) * severityBin, totalT),
    traffic:  mkDG(ndxT, trafficField,  v => Math.floor(v / trBin)        * trBin,       totalT),
    cr:       mkDG(ndxT, crField,       v => Math.floor(v / crBin)        * crBin,       totalT),
    crNorm:   mkDG(ndxT, crNormField,   v => Math.floor(v / crnBin)       * crnBin,      totalT),
  };

  // Raggruppatori per la popolazione di CONTROLLO (sfondo grigio)
  const U = {
    severity: mkDG(ndxU, severityField, v => Math.floor(v / severityBin) * severityBin, totalU),
    traffic:  mkDG(ndxU, trafficField,  v => Math.floor(v / trBin)        * trBin,       totalU),
    cr:       mkDG(ndxU, crField,       v => Math.floor(v / crBin)        * crBin,       totalU),
    crNorm:   mkDG(ndxU, crNormField,   v => Math.floor(v / crnBin)       * crnBin,      totalU),
  };

  // Dimensione array-based per interventi multipli (es. 'Light|Paving')
  const intDimT = ndxT.dimension(d => {
    if (!d.intervention || d.intervention === 'null' || d.intervention === 'None') return ['None'];
    if (typeof d.intervention === 'string') {
      const parts = d.intervention.split('|').map(s => s.trim()).filter(Boolean);
      const uniq  = [...new Set(parts.map(s => ABBR[s] || s))];
      return uniq.length ? uniq : ['None'];
    }
    if (Array.isArray(d.intervention)) return [...new Set(d.intervention.map(s => ABBR[s] || s))];
    return [String(d.intervention)];
  }, true);

  const intGroupT = intDimT.group();

  // Re-applica filtri intervento dopo un rebuild dovuto alla Timeline
  if (window._activeIntFilters && window._activeIntFilters.size > 0) {
    intDimT.filterFunction(d => {
      const arr = Array.isArray(d) ? d : [d];
      return arr.some(val => window._activeIntFilters.has(val));
    });
  }

  // Mappa di sincronizzazione passiva dei filtri (T→U)
  _uDims = new Map([
    [severityChart, U.severity.dim],
    [trafficChart,  U.traffic.dim ],
    [crChart,       U.cr.dim      ],
    [crNormChart,   U.crNorm.dim  ],
  ]);

  initParCoords(allMasterData);

  // Conta le frequenze dei tipi di intervento per il grafico a barre
  const intCounts = {};
  treatedData.forEach(d => {
    let keys = ['None'];
    if (d.intervention && d.intervention !== 'null' && d.intervention !== 'None') {
      const parts = typeof d.intervention === 'string'
        ? d.intervention.split('|')
        : [String(d.intervention)];
      keys = [...new Set(parts.map(p => ABBR[p.trim()] || p.trim()))];
    }
    keys.forEach(k => { intCounts[k] = (intCounts[k] || 0) + 1; });
  });

  buildInterventionBarChart(intCounts, intDimT, intGroupT);

  // ── Configura gli istogrammi DC.js ──────────────────────────────────────────
  const histW = 320, histH = 180;

  severityChart.width(histW).height(histH).useViewBoxResizing(true).transitionDuration(0)
    .dimension(T.severity.dim)
    .group(T.severity.group, 'Selected')
    .stack(T.severity.unselectedGroup, 'Unselected')
    .colors(d3.scaleOrdinal().range([COLORS_TREATED.selected, COLORS_TREATED.unselected]))
    .x(d3.scaleLinear().domain([0, severityMax + severityBin]))
    .xUnits(() => Math.max(1, Math.ceil((severityMax + severityBin) / severityBin)))
    .elasticY(true).brushOn(true).margins({ top: 10, right: 10, bottom: 30, left: 40 });
  severityChart.xAxis().ticks(5); severityChart.yAxis().ticks(3);

  trafficChart.width(histW).height(histH).useViewBoxResizing(true).transitionDuration(0)
    .dimension(T.traffic.dim)
    .group(T.traffic.group, 'Selected')
    .stack(T.traffic.unselectedGroup, 'Unselected')
    .colors(d3.scaleOrdinal().range([COLORS_TREATED.selected, COLORS_TREATED.unselected]))
    .x(d3.scaleLinear().domain([0, trMax + trBin]))
    .xUnits(() => Math.max(1, Math.ceil((trMax + trBin) / trBin)))
    .elasticY(true).brushOn(true).margins({ top: 10, right: 10, bottom: 30, left: 40 });
  trafficChart.xAxis().ticks(5); trafficChart.yAxis().ticks(3);

  crChart.width(histW).height(histH).useViewBoxResizing(true).transitionDuration(0)
    .dimension(T.cr.dim)
    .group(T.cr.group, 'Selected')
    .stack(T.cr.unselectedGroup, 'Unselected')
    .colors(d3.scaleOrdinal().range([COLORS_TREATED.selected, COLORS_TREATED.unselected]))
    .x(d3.scaleLinear().domain([0, crMax + crBin]))
    .xUnits(() => Math.max(1, Math.ceil((crMax + crBin) / crBin)))
    .elasticY(true).brushOn(true).margins({ top: 10, right: 10, bottom: 30, left: 40 });
  crChart.xAxis().ticks(5); crChart.yAxis().ticks(3);

  crNormChart.width(histW).height(histH).useViewBoxResizing(true).transitionDuration(0)
    .dimension(T.crNorm.dim)
    .group(T.crNorm.group, 'Selected')
    .stack(T.crNorm.unselectedGroup, 'Unselected')
    .colors(d3.scaleOrdinal().range([COLORS_TREATED.selected, COLORS_TREATED.unselected]))
    .x(d3.scaleLinear().domain([0, crnMax + crnBin]))
    .xUnits(() => Math.max(1, Math.ceil((crnMax + crnBin) / crnBin)))
    .elasticY(true).brushOn(true).margins({ top: 10, right: 10, bottom: 30, left: 40 });
  crNormChart.xAxis().ticks(5); crNormChart.yAxis().ticks(3);

  // Memorizza i riferimenti al binning per le sovrapposizioni hover
  severityChart._binSize = severityBin; severityChart._prop = severityField; severityChart._totalT = totalT;
  trafficChart._binSize  = trBin;       trafficChart._prop  = trafficField;  trafficChart._totalT  = totalT;
  crChart._binSize       = crBin;       crChart._prop       = crField;       crChart._totalT       = totalT;
  crNormChart._binSize   = crnBin;      crNormChart._prop   = crNormField;   crNormChart._totalT   = totalT;

  // ── Linee di media sugli istogrammi ─────────────────────────────────────────
  function drawMedianLines(chart) {
    const g = chart.select('g.chart-body');
    if (g.empty()) return;
    const xSc  = chart.x();
    const effH = chart.effectiveHeight();
    const prop = chart._prop;

    let activeRows = scatterDimT.top(Infinity);
    if (window._activeIntFilters && window._activeIntFilters.size > 0) {
      activeRows = activeRows.filter(d => {
        if (!d.intervention || d.intervention === 'null' || d.intervention === 'None') return false;
        const parts = typeof d.intervention === 'string'
          ? d.intervention.split('|').map(s => ABBR[s.trim()] || s.trim())
          : [String(d.intervention)];
        return parts.some(p => window._activeIntFilters.has(p));
      });
    }
    const validRows = activeRows.map(d => +(d[prop] ?? 0)).filter(v => isFinite(v));
    const meanT = validRows.length ? d3.mean(validRows) : null;

    g.selectAll('.median-line, .median-line-t, .median-line-u, .mean-line-t, .mean-line-u').remove();

    if (meanT !== null && isFinite(meanT)) {
      g.append('line').attr('class', 'mean-line-t')
        .attr('stroke', COLORS_TREATED.selected).attr('stroke-width', 2).style('pointer-events', 'none')
        .attr('x1', xSc(meanT)).attr('x2', xSc(meanT)).attr('y1', 0).attr('y2', effH);
      g.append('text').attr('class', 'mean-line-t')
        .attr('fill', COLORS_TREATED.selected).attr('font-size', '9px').attr('font-weight', 'bold').style('pointer-events', 'none')
        .attr('x', xSc(meanT) + 4).attr('y', 10)
        .text(meanT >= 1000 ? Math.round(meanT).toLocaleString() : meanT.toFixed(2));
    }
  }

  function drawAllMedianLines() {
    drawMedianLines(severityChart);
    drawMedianLines(trafficChart);
    drawMedianLines(crChart);
    drawMedianLines(crNormChart);
  }

  // ── Orchestratore: si attiva ad ogni cambio filtro ───────────────────────────
  let _updateDebounceTimer = null;
  function updateLinkedCharts() {
    if (_updateDebounceTimer) cancelAnimationFrame(_updateDebounceTimer);
    _updateDebounceTimer = requestAnimationFrame(() => { _updateLinkedChartsImpl(); });
  }

  function _updateLinkedChartsImpl() {
    // Sincronizza i filtri delle chart con le dimensioni dei segmenti non trattati (U)
    if (_uDims && _uDims.size > 0) {
      _uDims.forEach((uDim, chart) => {
        const filters = chart.filters();
        if (filters && filters.length > 0) {
          uDim.filterFunction(v => {
            return filters.some(f => {
              if (typeof f.isFiltered === 'function') return f.isFiltered(v);
              if (Array.isArray(f) && f.length === 2) return v >= f[0] && v < f[1];
              return v === f;
            });
          });
        } else {
          uDim.filterAll();
        }
      });
    }

    // Raccoglie le righe ancora attive dopo tutti i filtri
    let activeRows = scatterDimT.top(Infinity);
    if (window._activeIntFilters && window._activeIntFilters.size > 0) {
      activeRows = activeRows.filter(d => {
        if (!d.intervention || d.intervention === 'null' || d.intervention === 'None') return false;
        const parts = typeof d.intervention === 'string'
          ? d.intervention.split('|').map(s => ABBR[s.trim()] || s.trim())
          : [String(d.intervention)];
        return parts.some(p => window._activeIntFilters.has(p));
      });
    }
    const activeTIds = new Set(activeRows.map(d => d.RCSTA));
    let activeUIds = new Set(scatterDimU.top(Infinity).map(d => d.RCSTA));
    if (window._activeIntFilters && window._activeIntFilters.size > 0) activeUIds.clear();
    const combinedIds = new Set([...activeTIds, ...activeUIds]);

    // Aggiorna il PCP (sempre, sia in L0 che L1)
    if (pc && _allPcData) {
      const allMasterDataDedup = Array.from(new Map(allMasterData.map(d => [d.RCSTA, d])).values());
      const numTreatedDedup   = allMasterDataDedup.filter(d => d.treated).length;
      const numUntreatedDedup = allMasterDataDedup.length - numTreatedDedup;
      
      const isFiltered = (activeTIds.size > 0 && activeTIds.size !== numTreatedDedup) ||
        (activeUIds.size > 0 && activeUIds.size !== numUntreatedDedup) ||
        (window._activeIntFilters && window._activeIntFilters.size > 0);
      
      if (document.getElementById('pcp-leg-2')) {
        const actT  = isFiltered ? activeTIds.size   : numTreatedDedup;
        const inactT = numTreatedDedup   - actT;
        const actU  = isFiltered ? activeUIds.size   : numUntreatedDedup;
        const inactU = numUntreatedDedup - actU;
        const pct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;

        document.getElementById('pcp-leg-2').textContent   = `Selected treated: ${actT} (${pct(actT, numTreatedDedup)}%)`;
        document.getElementById('pcp-leg-t-in').textContent = `Unselected treated: ${inactT} (${pct(inactT, numTreatedDedup)}%)`;
        document.getElementById('pcp-leg-3').textContent   = `Selected untreated: ${actU} (${pct(actU, numUntreatedDedup)}%)`;
        document.getElementById('pcp-leg-1').textContent   = `Unselected untreated: ${inactU} (${pct(inactU, numUntreatedDedup)}%)`;
      }

      pc.color(d => {
        let r, g, b, a;
        if (d.treated == true && (!isFiltered || activeTIds.has(d.RCSTA))) {
          r = 31; g = 119; b = 180; a = 0.85;
        } else if (d.treated != true && (!isFiltered || activeUIds.has(d.RCSTA))) {
          r = 85; g = 85; b = 85; a = 0.5;
        } else if (d.treated == true) {
          r = 142; g = 177; b = 212; a = 0.25;
        } else {
          r = 199; g = 199; b = 199; a = 0.15;
        }
        if (_pcpFadeActive) { r = 180; g = 180; b = 180; a = 0.005; }
        return `rgba(${r},${g},${b},${a})`;
      }).alpha(1);
      
      if (!_isBrushingPCP) {
        const rank = d =>
          d.treated == true && (!isFiltered || activeTIds.has(d.RCSTA)) ? 3 :
          d.treated != true && (!isFiltered || activeUIds.has(d.RCSTA)) ? 2 :
          d.treated == true ? 1 : 0;
        pc.data(allMasterDataDedup.sort((a, b) => rank(a) - rank(b))).render();
      }

      // Aggiorna densità KDE e coefficienti di similarità nel PCP
      const activeTArr = activeRows;
      let activeUArr = scatterDimU.top(Infinity);
      if (window._activeIntFilters && window._activeIntFilters.size > 0) activeUArr = [];

      const activeTArrDedup   = Array.from(new Map(activeTArr.map(d => [d.RCSTA, d])).values());
      const activeUArrDedup   = Array.from(new Map(activeUArr.map(d => [d.RCSTA, d])).values());
      const treatedDataDedup  = Array.from(new Map(treatedData.map(d => [d.RCSTA, d])).values());
      const untreatedDataDedup = Array.from(new Map(untreatedData.map(d => [d.RCSTA, d])).values());

      const actTDedup = activeTArrDedup.length;
      const actUDedup = activeUArrDedup.length;

      d3.select('#legend-treated-text').html(`<strong>Treated</strong> (selected: ${actTDedup} / ${numTreatedDedup})`);
      d3.select('#legend-untreated-text').html(`<strong>Untreated</strong> (selected: ${actUDedup} / ${numUntreatedDedup})`);

      requestAnimationFrame(() => {
        drawPCPDensities(activeTArrDedup, treatedDataDedup, activeUArrDedup, untreatedDataDedup);
        drawPCPSimilarity(activeTArrDedup, activeUArrDedup);
      });
    }

    updateMap(combinedIds);
    updateAnalyzeButton(activeRows, activeTIds);
    updateSummaryStats(ndxT, treatedData, untreatedData);

    // Se L1 attivo: aggiorna il drill-down in risposta ai filtri
    if (_currentL1RCSTAs) {
      const newTIds = new Set(activeRows.map(d => d.RCSTA));
      _currentL1RCSTAs = newTIds;
      const combinedNewIds = new Set([...newTIds, ...activeUIds]);
      updateMap(combinedNewIds);
      updateAnalyzeButton(activeRows, newTIds);
      updateSummaryStats(ndxT, treatedData, untreatedData);
      if (activeRows.length > 0) {
        const pairs = [...new Set(
          activeRows.map(d => `${d.RCSTA}|${d.install_year}|${d.intervention ?? ''}`)
        )].join(',');
        clearTimeout(window._l1FetchTimeout);
        window._l1FetchTimeout = setTimeout(() => {
          fetch(`http://localhost:5000/api/level1?pairs=${pairs}`)
            .then(r => r.json())
            .then(data => { 
              computeDoI(data); 
              buildL1Scatter(data); 
              buildL1Table(data); 
              if (typeof _lockedRCSTA !== 'undefined' && _lockedRCSTA != null) {
                const stillExists = data.some(d => String(d.RCSTA) === String(_lockedRCSTA));
                if (stillExists) {
                  const rcsta = _lockedRCSTA;
                  
                  // Aggiorna la referenza _lockedExact al nuovo oggetto in 'data'
                  if (typeof _lockedExact !== 'undefined' && _lockedExact) {
                    const match = data.find(d => 
                      String(d.RCSTA) === String(rcsta) && 
                      d.install_year === _lockedExact.install_year &&
                      d.install_month === _lockedExact.install_month &&
                      d.intervention === _lockedExact.intervention
                    );
                    if (match) {
                      _lockedExact = match;
                    }
                  }

                  const exactD = _lockedExact;
                  _highlightedRCSTA = null;
                  _highlightedExact = null;
                  setTimeout(() => { if (typeof highlightRCSTA === 'function') highlightRCSTA(rcsta, exactD, true); }, 50);
                } else {
                  _lockedRCSTA = null;
                  _lockedExact = null;
                  if (typeof clearHighlight === 'function') clearHighlight();
                }
              }
            });
        }, 300);
      } else {
        buildL1Scatter([]); buildL1Table([]);
      }
      return; // blocca la propagazione a L0
    }

    updateInterventionBarChartUI();
  }

  // Aggiorna barre e label del grafico interventi quando i filtri cambiano
  function updateInterventionBarChartUI() {
    if (!window._intGroupTRef || !window._intChartScales) return;
    const { y, iH } = window._intChartScales;
    const countMap = {};
    window._intGroupTRef.all().forEach(d => { countMap[d.key] = d.value; });
    const g = d3.select('#intervention-bar-chart svg g');
    if (g.empty()) return;
    g.selectAll('.int-bar-label')
      .text(d => {
        const act = countMap[d.key] || 0;
        if (act === d.value) return d.value;
        return `${act}/${d.value} (${((act / d.value) * 100).toFixed(1)}%)`;
      })
      .attr('y', d => y(d.value) - 2);
    g.selectAll('.int-bar-rect')
      .attr('y', d => y(countMap[d.key] || 0))
      .attr('height', d => Math.max(0, iH - y(countMap[d.key] || 0)));
  }

  // Aggancia gli hook di dc.js all'orchestratore
  _updateLinkedCharts = updateLinkedCharts;
  dc.chartRegistry.list().forEach(chart => {
    chart.on('filtered',       updateLinkedCharts);
    chart.on('pretransition',  drawAllMedianLines);
  });

  // Ripristina i filtri salvati prima del rebuild
  savedFilters.forEach(({ chart, filters }) => {
    if (filters && filters.length > 0) {
      chart.filter(null);
      filters.forEach(f => chart.filter(f));
    }
  });
  if (pcpBrushedSet && _pcpDim) _pcpDim.filterFunction(d => pcpBrushedSet.has(d));

  dc.renderAll();
  updateLinkedCharts();
}

// ── Listeners pulsanti Toggle Tail e Reset Filters ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const toggleTailBtn = document.getElementById('toggle-tail-btn');
  if (toggleTailBtn) {
    toggleTailBtn.addEventListener('click', () => {
      window._hideTail = !window._hideTail;
      toggleTailBtn.textContent = window._hideTail ? 'Show Tail (5%)' : 'Hide Tail (5%)';
      if (globalMasterData) requestAnimationFrame(() => buildCrossfilter(globalMasterData));
    });
  }

  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (window._activeIntFilters) window._activeIntFilters.clear();
    if (typeof _intDimTRef !== 'undefined' && _intDimTRef) _intDimTRef.filterAll();
    d3.selectAll('.int-bar-rect').classed('active', false).attr('fill', COLORS_TREATED.selected);

    let needsRebuild = false;
    const tw = document.getElementById('time-window-select');
    if (tw && tw.value !== '1') { tw.value = '1'; needsRebuild = true; }

    if (pc && pc.brushReset) pc.brushReset();
    dc.filterAll();

    const slMin = document.getElementById('tl-slider-min');
    const slMax = document.getElementById('tl-slider-max');
    if (slMin && slMax && (+slMin.value !== globalYearMin || +slMax.value !== globalYearMax)) {
      slMin.value = globalYearMin;
      slMax.value = globalYearMax;
      slMin.dispatchEvent(new Event('input'));
    } else {
      if (needsRebuild && globalMasterData) {
        requestAnimationFrame(() => buildCrossfilter(globalMasterData));
      } else {
        dc.redrawAll();
        if (_updateLinkedCharts) _updateLinkedCharts();
      }
    }
  });
});
