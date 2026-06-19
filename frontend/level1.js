//  LEVEL 1 — DRILL-DOWN
// =============================================================================

// Calculate Degree of Interest: discrepancy between deseasoned crash variation % and risk rate variation %
function computeDoI(data) {
  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';
  const c = 100;
  const beta = 2.5;

  data.forEach(d => {
    // Use pct-scaled versions (already multiplied by 100 server-side)
    const redPct = +d[`reduction_norm_${activeYear}y_pct`] || 0;
    const redNorm = +d[`reduction_norm_aadt_${activeYear}y_pct`] || 0;

    d._zeroSeverity = false;
    
    const diff = redPct - redNorm;
    const discordi = (redPct * redNorm < 0) ? 1 : 0;
    
    d.doi = Math.tanh((diff / c) * (1 + beta * discordi));
  });
}

// Aggiorna il pulsante "Analyze group" in base al numero di interventi filtrati
function updateAnalyzeButton(activeRows, activeTIds) {
  const btn = document.getElementById('analyze-btn');
  if (!btn) return;
  const n = activeRows ? activeRows.length : 0;
  if (n > 0) {
    btn.classList.remove('disabled');
    btn.innerHTML = `Analyze group → <span id="analyze-count">${n}</span> interventions`;
  } else {
    btn.classList.add('disabled');
    btn.innerHTML = `Select interventions to analyze`;
  }
  btn._activeRows = activeRows;
  btn._activeIds = activeTIds;
}

// Aggiorna la barra riepilogo live e la barra filtri attivi
function updateSummaryStats(ndxT, treatedData, untreatedData) {
  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';
  const totalT = treatedData.length || 1;
  const allTreatedCount = (globalMasterData || []).filter(d => d.treated == true).length;
  const excludedCount = allTreatedCount - treatedData.length;

  // Applica il filtro intervento anche alla barra riepilogo
  let activeRecords = scatterDimT.top(Infinity);
  if (window._activeIntFilters && window._activeIntFilters.size > 0) {
    activeRecords = activeRecords.filter(d => {
      if (!d.intervention || d.intervention === 'null' || d.intervention === 'None') return false;
      const parts = typeof d.intervention === 'string'
        ? d.intervention.split('|').map(s => ABBR[s.trim()] || s.trim())
        : [String(d.intervention)];
      return parts.some(p => window._activeIntFilters.has(p));
    });
  }

  const activeRoads = new Set(activeRecords.map(d => d.road_name)).size;
  const allTreatedRoadsCount = new Set((globalMasterData || []).filter(d => d.treated == true).map(d => d.road_name)).size;
  document.getElementById('stats-treatments').innerHTML =
    `<b>${activeRecords.length.toLocaleString()}</b> of ${allTreatedCount.toLocaleString()} interventions`;
  document.getElementById('stats-roads').innerHTML =
    `<b>${activeRoads.toLocaleString()}</b> of ${allTreatedRoadsCount.toLocaleString()} treated roads`;

  const exclSpan = document.getElementById('stats-excluded');
  const exclSep = document.getElementById('stats-excluded-sep');
  if (exclSpan && exclSep) {
    if (excludedCount > 0) {
      exclSpan.style.display = '';
      exclSep.style.display = '';
      exclSpan.innerHTML = `<b>${excludedCount.toLocaleString()}</b> excluded (insufficient data)`;
    } else {
      exclSpan.style.display = 'none';
      exclSep.style.display = 'none';
    }
  }

  // Aggiorna la barra filtri attivi (visibile in L1)
  const filtersText = [`Time window: ${activeYear}y`];
  if (window._activeIntFilters && window._activeIntFilters.size > 0)
    filtersText.push(`Type: ${[...window._activeIntFilters].join(', ')}`);
  [severityChart, trafficChart, crChart, crNormChart].forEach(c => {
    if (c.filters().length > 0) {
      const f = c.filters()[0];
      const title = c.root().attr('id').replace('chart-', '').toUpperCase();
      filtersText.push(`${title} (${activeYear}y): [${f[0].toFixed(1)} - ${f[1].toFixed(1)}]`);
    }
  });
  if (_pcpDim && pc && pc.brushed() && pc.brushed().length > 0 && pc.brushed().length < (_allPcData || []).length)
    filtersText.push(`PCP Active`);
  const tlMin = document.getElementById('tl-slider-min')?.value;
  const tlMax = document.getElementById('tl-slider-max')?.value;
  if (tlMin && tlMax && (+tlMin > globalYearMin || +tlMax < globalYearMax))
    filtersText.push(`Years: ${tlMin}–${tlMax}`);

  const afBar = document.getElementById('active-filters-bar');
  if (afBar) {
    afBar.style.display = 'block';
    afBar.innerHTML = `<strong>Active Filters:</strong> ${filtersText.join(' &nbsp;|&nbsp; ')}`;
  }
}

// Listener pulsante "Analyze group"
document.getElementById('analyze-btn').addEventListener('click', () => {
  if (!scatterDimT) return;
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
  if (!activeRows.length) return;
  enterL1(activeRows, new Set(activeRows.map(d => d.RCSTA)));
});

// Listener pulsante "← Back to network"
document.getElementById('back-btn').addEventListener('click', exitL1);

// Entra nel Livello 1: nasconde L0, mostra scatter+tabella, riadatta mappa e PCP
function enterL1(activeRows, rcstaSet) {
  _currentL1RCSTAs = rcstaSet;
  document.getElementById('l0-panel').style.display = 'none';
  document.getElementById('l1-panel').style.display = 'flex';
  document.getElementById('analyze-btn').style.display = 'none';
  document.getElementById('l1-actions').style.display = 'flex';
  greyOutMapExcept(rcstaSet);

  if (pc && _allPcData) {
    // Disabilita i brush (perché in L1 il PCP è solo per visualizzazione)
    d3.selectAll('#pcp-container .brush').style('display', 'none');
  }

  const ov = document.getElementById('l1-loading-overlay');
  if (ov) ov.style.display = 'flex';

  const pairs = [...new Set(
    activeRows.map(d => `${d.RCSTA}|${d.install_year}|${d.intervention ?? ''}`)
  )].join(',');
  fetch(`http://localhost:5000/api/level1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs: pairs })
  })
    .then(r => r.json())
    .then(data => { 
      computeDoI(data); buildL1Scatter(data); buildL1Table(data); 
      if (ov) ov.style.display = 'none';
    })
    .catch(err => {
      console.error(err);
      if (ov) ov.style.display = 'none';
    });
}

// Esce dal Livello 1 e ripristina il Livello 0
function exitL1() {
  _lockedRCSTA = null; _lockedExact = null;
  clearHighlight();
  _currentL1RCSTAs = null;
  document.getElementById('l1-panel').style.display = 'none';
  document.getElementById('l0-panel').style.display = 'flex';
  document.getElementById('l1-actions').style.display = 'none';

  dc.filterAll();
  if (window._activeIntFilters) window._activeIntFilters.clear();
  if (typeof _intDimTRef !== 'undefined' && _intDimTRef) _intDimTRef.filterAll();
  d3.selectAll('.int-bar-rect').classed('active', false).attr('fill', '#1f77b4');
  if (_pcpDim) _pcpDim.filterAll();
  if (_pcpDimU) _pcpDimU.filterAll();
  if (pc) pc.brushExtents({});
  dc.redrawAll();

  const btn = document.getElementById('analyze-btn');
  if (btn) btn.style.display = '';

  updateMap(lastActiveIds);

  // Ripristina interattività PCP
  if (pc && _allPcData) {
    d3.selectAll('#pcp-container .brush').style('display', null);
    if (_updateLinkedCharts) _updateLinkedCharts();
  }
  d3.select('#l1-scatter').selectAll('*').remove();
  document.getElementById('l1-tbody').innerHTML = '';
}

// Evidenzia sulla mappa solo il gruppo L1, agganciando i listener per il cross-highlight
function greyOutMapExcept(rcstaSet) {
  if (selOutlineLayer) map.removeLayer(selOutlineLayer);
  if (selColorLayer) map.removeLayer(selColorLayer);
  _l1LayerIndex.clear();
  if (!allGeoJsonData) return;

  const cfg = VAR_CONFIG[activeVarIdx];
  const breaks = computeBreaks(allGeoJsonData.features, cfg.field);

  // Ordiniamo in modo che i segmenti L1 (in rcstaSet) vengano disegnati per ultimi (sopra a tutti)
  const featuresToDraw = allGeoJsonData.features.slice().sort((a, b) => {
    const aIn = rcstaSet.has(a.properties.RCSTA);
    const bIn = rcstaSet.has(b.properties.RCSTA);
    if (aIn !== bIn) return aIn ? 1 : -1;
    return 0;
  });

  selOutlineLayer = L.geoJSON(null, {
    style: { color: '#ffffff', weight: 10, opacity: 0.9, fillOpacity: 0 },
    renderer: canvasRenderer
  }).addTo(map);

  selColorLayer = L.geoJSON({ type: 'FeatureCollection', features: featuresToDraw }, {
    style: feature => {
      const inL1 = rcstaSet.has(feature.properties.RCSTA);

      if (!inL1 && !bgLayerVisible) {
        return { opacity: 0, weight: 0, fillOpacity: 0, color: 'transparent' };
      }

      if (mapColorByGroup) {
        if (inL1) return { color: GROUP_COLORS.AT, weight: 4, opacity: 1, fillOpacity: 0 };

        // Se non è in L1 ma bgLayerVisible è true, usa i colori del Livello 0!
        const isActiveL0 = !lastActiveIds || lastActiveIds.has(feature.properties.RCSTA);
        const isTreated = feature.properties.treated == true;
        let color;
        if (isTreated) color = isActiveL0 ? GROUP_COLORS.AT : GROUP_COLORS.IT;
        else color = isActiveL0 ? GROUP_COLORS.AU : GROUP_COLORS.IU;

        // Disegna il resto del network sbiadito (opacità ridotta) per far risaltare il gruppo L1
        const weight = isActiveL0 ? 2 : 1.5;
        const opacity = isActiveL0 ? 0.3 : 0.15;
        return { color, weight, opacity, fillOpacity: 0 };
      } else {
        const val = getNumericValue(feature, cfg.field);
        const col = breaks ? getColor(val, breaks, cfg.palette) : '#ccc';
        if (inL1) return { color: col, weight: 4, opacity: 1, fillOpacity: 0 };
        return { color: col, weight: 2, opacity: 0.3, fillOpacity: 0 };
      }
    },
    onEachFeature: (feature, layer) => {
      // Aggiungiamo i listener SOLO per i segmenti nel gruppo L1
      if (rcstaSet.has(feature.properties.RCSTA)) {
        layer.on({
          mouseover: () => { if (_lockedRCSTA == null) highlightRCSTA(feature.properties.RCSTA); },
          mouseout: () => { if (_lockedRCSTA == null) clearHighlight(); },
          click: (e) => { 
            window._justClickedMapFeature = true;
            setTimeout(() => { window._justClickedMapFeature = false; }, 50);
            
            const rcsta = feature.properties.RCSTA;
            const rows = _rowIndex.get(rcsta) || [];
            const exactD = rows.length > 0 ? rows[0]._d : null;
            toggleLockRCSTA(rcsta, exactD); 
          },
        });
      }
    },
    renderer: canvasRenderer
  }).addTo(map);

  // Popola l'indice rapido RCSTA → layer Leaflet
  selColorLayer.eachLayer(layer => {
    const rcsta = layer.feature && layer.feature.properties && layer.feature.properties.RCSTA;
    if (rcsta != null && rcstaSet.has(rcsta)) _l1LayerIndex.set(String(rcsta), layer);
  });
}

// =============================================================================
//  SCATTER PLOT L1
// =============================================================================

function buildL1Scatter(data) {
  _l1Data = data;
  d3.select('#l1-scatter').selectAll('*').remove();

  const container = document.getElementById('l1-scatter');
  const W = container.clientWidth || 320;
  const H = 210;
  const M = { top: 14, right: 20, bottom: 38, left: 50 };
  const iW = W - M.left - M.right;
  const iH = H - M.top - M.bottom;

  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';
  const xField = `reduction_norm_${activeYear}y_pct`;
  const yField = `reduction_norm_aadt_${activeYear}y_pct`;
  const xVals = data.map(d => d[xField] != null ? -(+d[xField]) : null).filter(v => v != null && isFinite(v));
  const yVals = data.map(d => d[yField] != null ? -(+d[yField]) : null).filter(v => v != null && isFinite(v));

  const xScale = d3.scaleLinear()
    .domain([Math.min(0, d3.min(xVals) || 0) * 1.1, Math.max(0, d3.max(xVals) || 0) * 1.1]).range([0, iW]).nice();
  const yScale = d3.scaleLinear()
    .domain([Math.min(0, d3.min(yVals) || 0) * 1.1, Math.max(0, d3.max(yVals) || 0) * 1.1]).range([iH, 0]).nice();

  const svg = d3.select('#l1-scatter').append('svg').attr('width', W).attr('height', H).style('cursor', 'default');
  _scatterSvg = svg;

  const clipId = 'sc-clip-' + (Date.now() & 0xffff);
  svg.append('defs').append('clipPath').attr('id', clipId)
    .append('rect').attr('width', iW).attr('height', iH);

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);
  const xFmt = d3.format('.1f');
  const yFmt = v => v.toFixed(1);

  const xAxisG = g.append('g').attr('transform', `translate(0,${iH})`);
  const yAxisG = g.append('g');
  xAxisG.call(d3.axisBottom(xScale).ticks(5).tickFormat(xFmt)).selectAll('text').style('font-size', '9px').style('fill', '#666');
  yAxisG.call(d3.axisLeft(yScale).ticks(5).tickFormat(yFmt)).selectAll('text').style('font-size', '9px').style('fill', '#666');

  g.append('text').attr('x', iW / 2).attr('y', iH + 32).attr('text-anchor', 'middle')
    .style('font-size', '9px').style('fill', '#999').text(`Crash variation deseasoned (${activeYear}y)`);
  g.append('text').attr('transform', 'rotate(-90)').attr('x', -iH / 2).attr('y', -40).attr('text-anchor', 'middle')
    .style('font-size', '9px').style('fill', '#999').text(`Risk Rate Variation % (${activeYear}y)`)
    .append('title').text('Deseasoned crash variation normalised per 1000 vehicles (AADT).');

  const plotArea = g.append('g').attr('clip-path', `url(#${clipId})`);
  plotArea.append('rect').attr('width', iW).attr('height', iH).attr('fill', 'none').attr('pointer-events', 'all')
    .on('click', () => {
      if (typeof _lockedRCSTA !== 'undefined' && _lockedRCSTA != null) {
        _lockedRCSTA = null; 
        _lockedExact = null;
        if (typeof clearHighlight === 'function') clearHighlight();
      }
    });

  // Linee di riferimento (Y=0, X=0, bisettrice)
  let zeroLine = null, xZeroLine = null;
  if (yScale.domain()[0] < 0 && yScale.domain()[1] > 0)
    zeroLine = plotArea.append('line').attr('x1', 0).attr('x2', iW)
      .attr('y1', yScale(0)).attr('y2', yScale(0)).attr('stroke', '#ddd').attr('stroke-dasharray', '4,3').attr('stroke-width', 1);
  if (xScale.domain()[0] < 0 && xScale.domain()[1] > 0)
    xZeroLine = plotArea.append('line').attr('x1', xScale(0)).attr('x2', xScale(0))
      .attr('y1', 0).attr('y2', iH).attr('stroke', '#ddd').attr('stroke-dasharray', '4,3').attr('stroke-width', 1);
  const diagLine = plotArea.append('line')
    .attr('x1', xScale(Math.max(xScale.domain()[0], yScale.domain()[0])))
    .attr('x2', xScale(Math.min(xScale.domain()[1], yScale.domain()[1])))
    .attr('y1', yScale(Math.max(xScale.domain()[0], yScale.domain()[0])))
    .attr('y2', yScale(Math.min(xScale.domain()[1], yScale.domain()[1])))
    .attr('stroke', '#bbb').attr('stroke-dasharray', '4,3').attr('stroke-width', 1);

  // Tooltip fluttuante
  let tooltip = document.querySelector('.scatter-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'scatter-tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.style.opacity = '0';

  // Punti scatter colorati per DoI
  const maxDoiAbs = d3.max(data, d => Math.abs(d.doi || 0)) || 1;
  const doiColorScale = d3.scaleDiverging(t => d3.interpolateRdYlGn(1 - t)).domain([-maxDoiAbs, 0, maxDoiAbs]);

  const plotData = data.filter(d =>
    d[xField] != null && isFinite(+d[xField]) &&
    d[yField] != null && isFinite(+d[yField]) &&
    !d._zeroSeverity
  );

  const distFromDiag = d => {
    const xVal = +d[xField];
    const yVal = +d[yField];
    if (!isFinite(xVal) || !isFinite(yVal)) return 0;
    return Math.abs(yVal - xVal) / Math.sqrt(2);
  };
  const maxDist = d3.max(plotData, distFromDiag) || 1;

  _scatterDots = plotArea.selectAll('.scatter-dot').data(plotData).enter().append('circle')
    .attr('class', 'scatter-dot')
    .attr('cx', d => xScale(-(+d[xField])))
    .attr('cy', d => yScale(-(+d[yField])))
    .attr('r', 5)
    .attr('fill', d => d.doi != null ? doiColorScale(d.doi) : '#1f77b4')
    .attr('stroke', '#fff').attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .on('mouseover', function (event, d) {
      tooltip.style.opacity = '1';
      tooltip.innerHTML = `
        <strong>RCSTA ${d.RCSTA}</strong>
        <span class="tt-row" style="color:#fff; font-weight:600; margin-bottom:4px; display:block;">${d.road_name || 'Unknown road'}</span>
        <div style="display:grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size:10.5px; color:#ddd;">
          <span>Type:</span> <span style="color:#fff;text-align:right;">${d.intervention || '-'}</span>
          <span>Date:</span> <span style="color:#fff;text-align:right;">${d.install_month || '-'}/${d.install_year || '-'}</span>
          <span style="grid-column: 1 / -1; height: 1px; background: #555; margin: 2px 0;"></span>
          <span>Crash Var.:</span> <span style="color:${-(+d[xField]) < 0 ? '#4ade80' : (-(+d[xField]) > 0 ? '#f87171' : '#fff')};text-align:right;font-weight:bold;">${d[xField] != null ? (-(+d[xField]) > 0 ? '+' : '') + (-(+d[xField])).toFixed(1) + '%' : '-'}</span>
          <span>Risk Rate Var.:</span> <span style="color:${-(+d[yField]) < 0 ? '#4ade80' : (-(+d[yField]) > 0 ? '#f87171' : '#fff')};text-align:right;font-weight:bold;">${d[yField] != null ? (-(+d[yField]) > 0 ? '+' : '') + (-(+d[yField])).toFixed(2) + '%' : '-'}</span>
        </div>
      `;
      const ttWidth = tooltip.offsetWidth || 200;
      let leftPos = event.clientX + 14;
      if (leftPos + ttWidth > window.innerWidth - 10) leftPos = event.clientX - ttWidth - 14;
      tooltip.style.left = leftPos + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
      if (_lockedRCSTA == null) highlightRCSTA(d.RCSTA, d);
    })
    .on('mousemove', function (event) {
      const ttWidth = tooltip.offsetWidth || 200;
      let leftPos = event.clientX + 14;
      if (leftPos + ttWidth > window.innerWidth - 10) leftPos = event.clientX - ttWidth - 14;
      tooltip.style.left = leftPos + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
    })
    .on('mouseout', function () { tooltip.style.opacity = '0'; if (_lockedRCSTA == null) clearHighlight(); })
    .on('click', function (event, d) { toggleLockRCSTA(d.RCSTA, d); });

  // Popola l'indice RCSTA → elementi SVG per il cross-highlight
  _dotIndex.clear();
  _scatterDots.each(function (d) {
    if (!_dotIndex.has(d.RCSTA)) _dotIndex.set(d.RCSTA, []);
    _dotIndex.get(d.RCSTA).push(this);
  });

  // Zoom interattivo (scroll / drag)
  const zoom = d3.zoom().scaleExtent([0.4, 40]).extent([[0, 0], [iW, iH]])
    .on('zoom', event => {
      const t = event.transform;
      const nX = t.rescaleX(xScale);
      const nY = t.rescaleY(yScale);
      xAxisG.call(d3.axisBottom(nX).ticks(5).tickFormat(xFmt)).selectAll('text').style('font-size', '9px').style('fill', '#666');
      yAxisG.call(d3.axisLeft(nY).ticks(5).tickFormat(yFmt)).selectAll('text').style('font-size', '9px').style('fill', '#666');
      plotArea.selectAll('.scatter-dot')
        .attr('cx', d => nX(-(+d[xField])))
        .attr('cy', d => nY(-(+d[yField])));
      if (zeroLine) zeroLine.attr('y1', nY(0)).attr('y2', nY(0));
      if (xZeroLine) xZeroLine.attr('x1', nX(0)).attr('x2', nX(0));
      diagLine
        .attr('x1', nX(Math.max(nX.domain()[0], nY.domain()[0])))
        .attr('x2', nX(Math.min(nX.domain()[1], nY.domain()[1])))
        .attr('y1', nY(Math.max(nX.domain()[0], nY.domain()[0])))
        .attr('y2', nY(Math.min(nX.domain()[1], nY.domain()[1])));
    });
  svg.call(zoom);
  svg.on('dblclick.zoom', () => svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity));

  // Pulsanti zoom +/−/reset
  const scatterWrap = document.getElementById('l1-scatter');
  scatterWrap.querySelectorAll('.scatter-controls').forEach(el => el.remove());
  const ctrl = document.createElement('div');
  ctrl.className = 'scatter-controls';
  ctrl.innerHTML = `
    <button class="scatter-ctrl-btn" title="Zoom in">+</button>
    <button class="scatter-ctrl-btn" title="Zoom out">−</button>
    <button class="scatter-ctrl-btn" title="Reset view">◎</button>
  `;
  const [btnIn, btnOut, btnReset] = ctrl.querySelectorAll('.scatter-ctrl-btn');
  btnIn.addEventListener('click', () => svg.transition().duration(300).call(zoom.scaleBy, 2));
  btnOut.addEventListener('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.5));
  btnReset.addEventListener('click', () => svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity));
  scatterWrap.appendChild(ctrl);
}

// =============================================================================
//  TABELLA L1 — DETTAGLIO SEGMENTI
// =============================================================================

function buildL1Table(data) {
  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';
  _NUM_COLS = ['install_year', `reduction_norm_${activeYear}y_pct`, `reduction_norm_aadt_${activeYear}y_pct`, `crashes_pre_${activeYear}y`, `traffic_variation_${activeYear}y`, 'doi'];

  // Update column headers for current time window
  const thRed = document.getElementById('th-reduction_pct');
  const thAadt = document.getElementById('th-reduction_aadt');
  const thCrPre = document.getElementById('th-cr_pre');
  const thAbs = document.getElementById('th-reduction_abs');

  if (thRed) { thRed.dataset.col = `reduction_norm_${activeYear}y_pct`; thRed.textContent = 'Crash Var. %'; }
  if (thAadt) { thAadt.dataset.col = `reduction_norm_aadt_${activeYear}y_pct`; thAadt.textContent = 'Risk Rate Var. %'; }
  if (thCrPre) {
    thCrPre.dataset.col = `crashes_pre_${activeYear}y`;
    thCrPre.textContent = `Raw Pre Crashes`;
  }
  if (thAbs) {
    thAbs.dataset.col = `traffic_variation_${activeYear}y`;
    thAbs.textContent = `Traffic Variation`;
  }

  _l1Data = data;
  _tableSortCol = 'doi';
  _tableSortAsc = false;
  renderTable(data);

  // Header cliccabili per ordinamento
  document.querySelectorAll('#l1-table thead th').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.col;
      if (_tableSortCol === col) _tableSortAsc = !_tableSortAsc;
      else { _tableSortCol = col; _tableSortAsc = !_NUM_COLS.includes(col); }
      renderTable(_l1Data);
    };
  });
}

function renderTable(data) {
  const col = _tableSortCol;
  const asc = _tableSortAsc;
  const sorted = [...data].sort((a, b) => {
    let va = a[col], vb = b[col];

    // Sort logic special for install_year: combines year + month
    if (col === 'install_year') {
      va = (a.install_year || 0) + (a.install_month || 0) / 12;
      vb = (b.install_year || 0) + (b.install_month || 0) / 12;
    } else if (_NUM_COLS.includes(col)) {
      va = +va; vb = +vb;
    }

    if (va == null) return 1;
    if (vb == null) return -1;
    return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const prettyCol = document.querySelector(`#l1-table th[data-col="${col}"]`)?.textContent?.trim().replace(/[↑↓]/, '') || col;
  document.getElementById('l1-badge').textContent = `${data.length} segments, sorted by ${prettyCol} ${asc ? '↑' : '↓'}`;

  document.querySelectorAll('#l1-table thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === col) th.classList.add(asc ? 'sort-asc' : 'sort-desc');
  });

  const tbody = document.getElementById('l1-tbody');
  tbody.innerHTML = '';
  _rowIndex.clear();
  let _rowHoverTimer = null;

  const activeYear = (document.getElementById('time-window-select') || {}).value || '1';

  const xFieldT = `reduction_norm_${activeYear}y_pct`;
  const yFieldT = `reduction_norm_aadt_${activeYear}y_pct`;
  const preFieldT = `crashes_pre_${activeYear}y`;
  const absRedFieldT = `traffic_variation_${activeYear}y`;
  let maxPosRed = 0, maxNegRed = 0;
  let maxPosRedAadt = 0, maxNegRedAadt = 0;
  sorted.forEach(d => {
    const r = -(+d[xFieldT]);
    if (isFinite(r)) {
      if (r > maxPosRed) maxPosRed = r;
      if (r < maxNegRed) maxNegRed = r;
    }
    const ra = -(+d[yFieldT]);
    if (isFinite(ra)) {
      if (ra > maxPosRedAadt) maxPosRedAadt = ra;
      if (ra < maxNegRedAadt) maxNegRedAadt = ra;
    }
  });

  const maxDoiTbl = d3.max(sorted, d => Math.abs(d.doi || 0)) || 1;

  // Barra colore inline per valori percentuali, normalizzata rispetto al maxPos/maxNeg
  const colorBar = (val, maxP, maxN) => {
    if (!isFinite(val)) return '—';
    let norm = 0;
    if (val > 0) {
      norm = maxP > 0 ? val / maxP : 0;
    } else if (val < 0) {
      norm = maxN < 0 ? -(val / maxN) : 0;
    }
    const pctFill = Math.min(100, Math.abs(norm) * 100);
    const color = d3.interpolateRdYlGn(0.5 - 0.5 * norm);

    return `<div style="display:flex;align-items:center;gap:4px;">
      <span style="width:34px;text-align:right;">${val > 0 ? '+' : ''}${val.toFixed(1)}%</span>
      <div style="width:26px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
        <div style="width:${pctFill}%;height:100%;background:${color};border-radius:3px;"></div>
      </div></div>`;
  };

  sorted.forEach(d => {
    const tr = document.createElement('tr');
    tr.dataset.rcsta = String(d.RCSTA);
    const yearLabel = (d.install_year && d.install_month)
      ? `${d.install_month}/${d.install_year}`
      : (d.install_year ?? '—');
    const rName = d.road_name && d.road_name.trim() !== '' ? d.road_name.trim() : 'Unknown';
    let intAbbr = '—';
    if (d.intervention && d.intervention !== 'null' && d.intervention !== 'None') {
      const parts = typeof d.intervention === 'string'
        ? d.intervention.split('|').map(s => ABBR[s.trim()] || s.trim())
        : [String(d.intervention)];
      intAbbr = parts.map(s => s.substring(0, 3)).join('/');
    }

    tr.innerHTML = `
      <td title="${rName}">${rName}</td>
      <td title="${d.intervention || ''}">${intAbbr}</td>
      <td>${yearLabel}</td>
      <td>${d[xFieldT] != null ? colorBar(-(+d[xFieldT]), maxPosRed, maxNegRed) : '—'}</td>
      <td>${d[yFieldT] != null ? colorBar(-(+d[yFieldT]), maxPosRedAadt, maxNegRedAadt) : '—'}</td>
      <td>${isFinite(+d[preFieldT]) ? (+d[preFieldT]).toFixed(0) : '—'}</td>
      <td>${isFinite(+d[absRedFieldT]) ? (+d[absRedFieldT]).toFixed(0) : '—'}</td>
      <td onmouseover="showGlobalDoiTooltip(event, '${d.doi != null ? (d.doi > 0 ? '+' : '') + d.doi.toFixed(2) : '—'}')" onmouseout="hideGlobalDoiTooltip()" onmousemove="moveGlobalDoiTooltip(event)">
        <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
          <div style="width:40px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
            <div style="width:${d.doi != null ? Math.min(100, (Math.abs(d.doi) / maxDoiTbl) * 100) : 0}%;height:100%;
                        background:${d.doi != null ? d3.interpolateRdYlGn(1 - ((d.doi + maxDoiTbl) / (2 * maxDoiTbl))) : '#ccc'};
                        border-radius:3px;"></div>
          </div>
        </div>
      </td>
    `;
    tr.addEventListener('mouseover', () => {
      if (_lockedRCSTA != null) return;
      clearTimeout(_rowHoverTimer);
      _rowHoverTimer = setTimeout(() => highlightRCSTA(d.RCSTA, d), 40);
    });
    tr.addEventListener('mouseout', () => {
      if (_lockedRCSTA != null) return;
      clearTimeout(_rowHoverTimer);
      _rowHoverTimer = setTimeout(() => clearHighlight(), 40);
    });
    tr.addEventListener('click', () => { clearTimeout(_rowHoverTimer); toggleLockRCSTA(d.RCSTA, d); });
    tr._d = d;

    if (!_rowIndex.has(d.RCSTA)) _rowIndex.set(d.RCSTA, []);
    _rowIndex.get(d.RCSTA).push(tr);
    tbody.appendChild(tr);
  });
}

// =============================================================================
//  SISTEMA DI HIGHLIGHT BIDIREZIONALE
// =============================================================================

// Restituisce lo stile di default di un layer Leaflet
function _defaultLayerStyle(layer) {
  if (mapColorByGroup) {
    return { color: GROUP_COLORS.AT, weight: 4, opacity: 1, fillOpacity: 0 };
  }
  const cfg = VAR_CONFIG[activeVarIdx];
  const breaks = _breakCache[cfg.field];
  const val = getNumericValue(layer.feature, cfg.field);
  return { color: breaks ? getColor(val, breaks, cfg.palette) : '#ccc', weight: 4, opacity: 1, fillOpacity: 0 };
}

// Toggle click: fissa o rilascia l'highlight
function toggleLockRCSTA(rcsta, exactD = null) {
  if (_inL2) return;  // in L2 non si possono selezionare segmenti L1
  if (_lockedRCSTA === rcsta && _lockedExact === exactD) {
    _lockedRCSTA = null; _lockedExact = null;
    clearHighlight();
  } else {
    if (_highlightedRCSTA != null) clearHighlight();
    _lockedRCSTA = rcsta; _lockedExact = exactD;
    highlightRCSTA(rcsta, exactD);

    // Scorre la tabella per centrare la riga esatta cliccata
    if (exactD != null) {
      const rows = _rowIndex.get(rcsta) || [];
      const exactRow = rows.find(r => r._d === exactD);
      if (exactRow) {
        exactRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
  _updateSpilloverBtn();
}

// Accende scatter + tabella + mappa + PCP per un dato RCSTA
function highlightRCSTA(rcsta, exactD = null) {
  if (_highlightedRCSTA === rcsta && _highlightedExact === exactD) return;
  const prev = _highlightedRCSTA;
  _highlightedRCSTA = rcsta;
  _highlightedExact = exactD;
  const hlColor = _currentL1RCSTAs ? HIGHLIGHT_L1 : HIGHLIGHT_L0;

  // Reset scatter precedente
  if (prev != null) {
    (_dotIndex.get(prev) || []).forEach(el => {
      el.classList.remove('dot-exact-highlight');
      el.setAttribute('r', DOT_DEFAULT.r);
      el.setAttribute('opacity', DOT_DEFAULT.opacity);
      el.setAttribute('stroke', DOT_DEFAULT.stroke);
      el.setAttribute('stroke-width', DOT_DEFAULT.sw);
    });
  }
  // Accende scatter nuovo portando in primo piano i punti
  const exactDots = [];
  const otherDots = [];
  (_dotIndex.get(rcsta) || []).forEach(el => {
    if (exactD != null && el.__data__ === exactD) exactDots.push(el);
    else otherDots.push(el);
  });

  otherDots.forEach(el => {
    el.classList.remove('dot-exact-highlight');
    el.setAttribute('r', DOT_ACTIVE.r);
    el.setAttribute('opacity', DOT_ACTIVE.opacity);
    el.setAttribute('stroke', hlColor);
    el.setAttribute('stroke-width', DOT_ACTIVE.sw);
    if (el.parentNode) el.parentNode.appendChild(el);
  });

  exactDots.forEach(el => {
    el.classList.add('dot-exact-highlight');
    el.setAttribute('r', DOT_ACTIVE.r); // Non ingrandire
    el.setAttribute('opacity', 1);
    if (el.parentNode) el.parentNode.appendChild(el);
  });

  // Reset tabella precedente
  if (prev != null)
    (_rowIndex.get(prev) || []).forEach(r => r.classList.remove('row-highlighted', 'row-exact-highlight'));
  // Accende tabella nuova
  (_rowIndex.get(rcsta) || []).forEach(r => {
    if (exactD != null && r._d === exactD) {
      r.classList.remove('row-highlighted');
      r.classList.add('row-exact-highlight');
    } else {
      r.classList.remove('row-exact-highlight');
      r.classList.add('row-highlighted');
    }
  });

  // Reset mappa precedente
  if (prev != null) {
    const pl = _l1LayerIndex.get(String(prev));
    if (pl) pl.setStyle(_defaultLayerStyle(pl));
  }
  // Accende mappa nuova
  const ml = _l1LayerIndex.get(String(rcsta));
  if (ml) {
    if (selOutlineLayer) {
      selOutlineLayer.clearLayers();
      if (ml.feature) selOutlineLayer.addData(ml.feature);
      selOutlineLayer.bringToFront();
    }
    const mapHlColor = exactD != null ? '#f59e0b' : hlColor;
    ml.setStyle({ color: mapHlColor, weight: 6, opacity: 1 });
    if (ml.bringToFront) ml.bringToFront();
  }

  // Evidenzia nel PCP
  if (_currentL1RCSTAs && pc && _allPcData) {
    const highlightData = _allPcData.filter(d => d.RCSTA === rcsta);
    if (highlightData.length) {
      const oldColor = pc.color();
      const oldAlpha = pc.alpha();
      pc.color(d => d.RCSTA === rcsta ? hlColor : oldColor(d));
      pc.alpha(1);
      pc.highlight(highlightData);
      pc.color(oldColor);
      pc.alpha(oldAlpha);
    }
  }
}

// Spegne tutti gli highlight
function clearHighlight() {
  if (_highlightedRCSTA == null) return;
  const prev = _highlightedRCSTA;
  _highlightedRCSTA = null;
  _highlightedExact = null;

  (_dotIndex.get(prev) || []).forEach(el => {
    el.classList.remove('dot-exact-highlight');
    el.setAttribute('r', DOT_DEFAULT.r);
    el.setAttribute('opacity', DOT_DEFAULT.opacity);
    el.setAttribute('stroke', DOT_DEFAULT.stroke);
    el.setAttribute('stroke-width', DOT_DEFAULT.sw);
  });
  (_rowIndex.get(prev) || []).forEach(r => r.classList.remove('row-highlighted', 'row-exact-highlight'));
  const ml = _l1LayerIndex.get(String(prev));
  if (ml) ml.setStyle(_defaultLayerStyle(ml));
  if (selOutlineLayer) selOutlineLayer.clearLayers();
  if (_currentL1RCSTAs && pc) pc.unhighlight();
  _updateSpilloverBtn();
}

// =============================================================================

window.showGlobalDoiTooltip = function(event, text) {
  let tt = document.getElementById('global-doi-tooltip');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'global-doi-tooltip';
    tt.style.cssText = 'position:fixed; background:rgba(20,20,30,0.92); color:#fff; padding:4px 8px; border-radius:4px; font-size:11px; white-space:nowrap; z-index:10000; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.2); transition:opacity 0.1s;';
    document.body.appendChild(tt);
  }
  tt.textContent = text;
  tt.style.display = 'block';
  tt.style.left = (event.clientX + 10) + 'px';
  tt.style.top = (event.clientY - 20) + 'px';
};

window.moveGlobalDoiTooltip = function(event) {
  const tt = document.getElementById('global-doi-tooltip');
  if (tt && tt.style.display !== 'none') {
    tt.style.left = (event.clientX + 10) + 'px';
    tt.style.top = (event.clientY - 20) + 'px';
  }
};

window.hideGlobalDoiTooltip = function() {
  const tt = document.getElementById('global-doi-tooltip');
  if (tt) {
    tt.style.display = 'none';
  }
};
