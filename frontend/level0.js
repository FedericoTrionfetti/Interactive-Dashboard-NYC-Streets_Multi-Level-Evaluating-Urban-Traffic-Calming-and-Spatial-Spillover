// =============================================================================
//  LEVEL 0 — Grafici specifici di L0: Intervento, Timeline, Fetch iniziale
//  Dipende da: config.js, state.js, crossfilter.js, map.js
// =============================================================================

// =============================================================================
//  GRAFICO INTERVENTI
// =============================================================================

function buildInterventionBarChart(intCounts, intDimT, intGroupT) {
  _intDimTRef = intDimT;
  const container = document.getElementById('intervention-bar-chart');
  if (!container) return;
  container.innerHTML = '';
  window._activeIntFilters = window._activeIntFilters || new Set();

  const data = Object.entries(intCounts)
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);
  if (!data.length) return;

  const W = container.clientWidth || 280;
  const BAR_H = 60;
  const margin = { top: 4, right: 8, bottom: 30, left: 8 };
  const iW = W - margin.left - margin.right;
  const iH = BAR_H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', BAR_H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const x = d3.scaleBand().domain(data.map(d => d.key)).range([0, iW]).padding(0.15);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)]).range([iH, 0]);

  window._intChartScales = { y, iH };
  window._intGroupTRef   = intGroupT;

  const BG_COLOR    = '#8eb1d4';
  const BAR_COLOR   = '#1f77b4';
  const HOVER_COLOR = '#e45756';

  // Barre di sfondo (Total / Inactive)
  const bgBars = g.selectAll('.int-bar-bg').data(data).enter().append('rect')
    .attr('class', 'int-bar-bg')
    .attr('x', d => x(d.key)).attr('y', d => y(d.value))
    .attr('width', x.bandwidth()).attr('height', d => Math.max(0, iH - y(d.value)))
    .attr('fill', BG_COLOR).attr('rx', 2).style('pointer-events', 'none');

  // Barre visive di primo piano (Active)
  const bars = g.selectAll('.int-bar-rect').data(data).enter().append('rect')
    .attr('class', d => `int-bar-rect${window._activeIntFilters.has(d.key) ? ' active' : ''}`)
    .attr('x', d => x(d.key)).attr('y', d => y(d.value))
    .attr('width', x.bandwidth()).attr('height', d => Math.max(0, iH - y(d.value)))
    .attr('fill', BAR_COLOR).attr('rx', 2).style('pointer-events', 'none');

  // Etichette asse X abbreviate
  g.append('g').attr('transform', `translate(0,${iH})`)
    .selectAll('text').data(data).enter().append('text')
    .attr('x', d => x(d.key) + x.bandwidth() / 2).attr('y', 10)
    .attr('text-anchor', 'middle').style('font-size', '8px').style('fill', '#666')
    .style('pointer-events', 'none')
    .text(d => d.key.length > 10 ? d.key.slice(0, 9) + '…' : d.key);

  // Etichette conteggio sopra le barre
  g.selectAll('.int-bar-label').data(data).enter().append('text')
    .attr('class', 'int-bar-label')
    .attr('x', d => x(d.key) + x.bandwidth() / 2).attr('y', d => y(d.value) - 2)
    .attr('text-anchor', 'middle').style('font-size', '8px').style('fill', '#555')
    .style('pointer-events', 'none').text(d => d.value);

  // Hitbox trasparenti a colonna intera per click/hover
  const hitboxes = g.selectAll('.int-bar-hitbox').data(data).enter().append('rect')
    .attr('class', 'int-bar-hitbox')
    .attr('x', d => x(d.key) - 2).attr('y', -10)
    .attr('width', x.bandwidth() + 4).attr('height', iH + 20)
    .attr('fill', 'transparent').style('cursor', 'pointer');

  hitboxes
    .on('mouseover', function (event, d) {
      bgBars.filter(bd => bd.key === d.key).attr('fill', '#e59f9f');
      bars.filter(bd => bd.key === d.key).attr('fill', HOVER_COLOR);
      overlayIntTypeOnHistograms(d.key);
    })
    .on('mouseout', function (event, d) {
      bgBars.filter(bd => bd.key === d.key).attr('fill', BG_COLOR);
      bars.filter(bd => bd.key === d.key)
        .attr('fill', bd => window._activeIntFilters.has(bd.key) ? HOVER_COLOR : BAR_COLOR);
      clearIntTypeOverlay();
    })
    .on('click', function (event, d) {
      const k = d.key;
      const isActive = window._activeIntFilters.has(k);
      window._activeIntFilters[isActive ? 'delete' : 'add'](k);
      bars.filter(bd => bd.key === d.key).classed('active', !isActive);

      intDimT.filterAll();
      if (window._activeIntFilters.size > 0) {
        intDimT.filterFunction(v => {
          const arr = Array.isArray(v) ? v : [v];
          return arr.some(val => window._activeIntFilters.has(val));
        });
      }

      dc.redrawAll();
      if (_updateLinkedCharts) _updateLinkedCharts();
      overlayIntTypeOnHistograms(d.key);
    });
}

// Disegna overlay proporzionali nelle barre degli istogrammi all'hover di un tipo di intervento
function overlayIntTypeOnHistograms(hovType) {
  if (!scatterDimT) return;
  const targetRecords = scatterDimT.top(Infinity).filter(d => {
    if (!d.intervention || d.intervention === 'null' || d.intervention === 'None') return hovType === 'None';
    const parts = typeof d.intervention === 'string' ? d.intervention.split('|') : [String(d.intervention)];
    return parts.some(p => (ABBR[p.trim()] || p.trim()) === hovType);
  });

  if (typeof highlightPCP === 'function') highlightPCP(targetRecords);
  if (typeof highlightMapFeatures === 'function' && allGeoJsonData) {
    const hovRcstas = new Set(targetRecords.map(d => d.RCSTA));
    const features  = allGeoJsonData.features.filter(f => hovRcstas.has(f.properties.RCSTA));
    highlightMapFeatures(features);
  }

  [severityChart, trafficChart, crChart, crNormChart].forEach(chart => {
    const g = chart.select('g.chart-body');
    if (g.empty()) return;
    g.selectAll('.int-overlay-rect').remove();
    const effH    = chart.effectiveHeight();
    const binSize = chart._binSize;
    const prop    = chart._prop;
    const totalT  = chart._totalT || 1;
    if (!binSize || !prop) return;

    const binCounts = new Map();
    targetRecords.forEach(d => {
      const v = +d[prop];
      if (!isFinite(v)) return;
      const bKey = Math.floor(v / binSize) * binSize;
      binCounts.set(bKey, (binCounts.get(bKey) || 0) + 1);
    });

    g.selectAll('rect.bar').each(function (d) {
      const bKey       = d.data ? d.data.key : d.x;
      const countInBin = binCounts.get(bKey) || 0;
      if (countInBin === 0) return;
      const blueRect = d3.select(this);
      if (blueRect.classed('deselected')) return;
      const bx = parseFloat(blueRect.attr('x'));
      const bw = parseFloat(blueRect.attr('width'));
      const by = parseFloat(blueRect.attr('y'));
      if (isNaN(bx) || isNaN(bw) || isNaN(by)) return;
      const barH = effH - by;
      if (barH <= 0) return;
      const valNorm      = d.data ? d.data.value : d.y;
      const countTotalInBin = Math.round(valNorm * totalT);
      if (countTotalInBin <= 0) return;
      const overlayH = barH * Math.min(1, countInBin / countTotalInBin);
      g.append('rect').attr('class', 'int-overlay-rect')
        .attr('x', bx).attr('y', effH - overlayH)
        .attr('width', bw).attr('height', overlayH)
        .attr('fill', '#e45756').attr('rx', 1);
    });
  });
}

function clearIntTypeOverlay() {
  [severityChart, trafficChart, crChart, crNormChart].forEach(chart => {
    chart.select('g.chart-body').selectAll('.int-overlay-rect').remove();
  });
  if (typeof clearPCPHighlight === 'function') clearPCPHighlight();
  if (typeof clearMapHighlight === 'function')  clearMapHighlight();
}

// =============================================================================
//  TIMELINE SLIDER
// =============================================================================

function initTimeline(yearMin, yearMax) {
  globalYearMin = yearMin;
  globalYearMax = yearMax;
  const slMin   = document.getElementById('tl-slider-min');
  const slMax   = document.getElementById('tl-slider-max');
  const fill    = document.getElementById('timeline-fill');
  const labelMin = document.getElementById('tl-year-min-label');
  const labelMax = document.getElementById('tl-year-max-label');
  const badge   = document.getElementById('timeline-badge');
  [slMin, slMax].forEach(sl => { sl.min = yearMin; sl.max = yearMax; sl.value = yearMin; });
  slMax.value = yearMax;

  function updateFill() {
    const range = globalYearMax - globalYearMin;
    fill.style.left  = ((+slMin.value - globalYearMin) / range * 100);
    fill.style.right = ((globalYearMax - +slMax.value) / range * 100);
    labelMin.textContent = slMin.value;
    labelMax.textContent = slMax.value;
    badge.textContent = (+slMin.value === globalYearMin && +slMax.value === globalYearMax)
      ? 'All years' : `${slMin.value} – ${slMax.value}`;
  }

  let debounce = null;
  function onSliderChange() {
    if (+slMin.value > +slMax.value) slMin.value = slMax.value;
    updateFill();
    currentYearMin = +slMin.value;
    currentYearMax = +slMax.value;
    updateTimelineMiniChart();
    clearTimeout(debounce);
    debounce = setTimeout(() => fetchMasterAndRebuild(currentYearMin, currentYearMax), 150);
  }

  slMin.addEventListener('input', onSliderChange);
  slMax.addEventListener('input', onSliderChange);
  updateFill();
}

// =============================================================================
//  MINI-CHART TIMELINE
// =============================================================================

function computeMonthlyBins(masterData, yMin, yMax) {
  const bins = {};
  for (let y = yMin; y <= yMax; y++) {
    for (let m = 1; m <= 12; m++) {
      bins[`${y}-${String(m).padStart(2, '0')}`] = 0;
    }
  }
  masterData.filter(d => d.treated && d.install_year).forEach(d => {
    const month = d.install_month ? String(d.install_month).padStart(2, '0') : '06';
    const key   = `${Math.floor(d.install_year)}-${month}`;
    if (bins[key] !== undefined) bins[key]++;
  });
  return Object.entries(bins)
    .map(([k, v]) => ({ key: k, year: +k.split('-')[0], value: v }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildTimelineMiniChart(monthlyData) {
  const container = document.getElementById('timeline-mini-chart');
  if (!container) return;
  container.innerHTML = '';

  const W = container.clientWidth || 300;
  const H = 44;
  const margin = { top: 2, right: 0, bottom: 2, left: 0 };
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(monthlyData.map(d => d.key)).range([0, iW]).padding(0.05);
  const y = d3.scaleLinear().domain([0, d3.max(monthlyData, d => d.value)]).range([iH, 0]);

  g.selectAll('.tl-bar-bg').data(monthlyData).enter().append('rect')
    .attr('class', 'tl-bar-bg')
    .attr('x', d => x(d.key)).attr('y', d => y(d.value))
    .attr('width', Math.max(1, x.bandwidth()))
    .attr('height', d => iH - y(d.value)).attr('fill', '#aec7e8');

  g.selectAll('.tl-bar-active').data(monthlyData).enter().append('rect')
    .attr('class', 'tl-bar-active')
    .attr('x', d => x(d.key)).attr('y', d => y(d.value))
    .attr('width', Math.max(1, x.bandwidth()))
    .attr('height', d => iH - y(d.value)).attr('fill', '#1f77b4');

  const januaryData = monthlyData.filter(d => d.key.endsWith('-01'));
  g.selectAll('.tl-year-sep').data(januaryData).enter().append('line')
    .attr('class', 'tl-year-sep')
    .attr('x1', d => x(d.key) - (x.step() * x.paddingInner()) / 2)
    .attr('x2', d => x(d.key) - (x.step() * x.paddingInner()) / 2)
    .attr('y1', 0).attr('y2', iH)
    .attr('stroke', '#666').attr('stroke-width', 1).attr('stroke-dasharray', '2,2');

  window._timelineMonthlyData = monthlyData;
  window._timelineChartG      = g;
  window._timelineY           = y;
  updateTimelineMiniChart();
}

function updateTimelineMiniChart() {
  if (!window._timelineChartG || !window._timelineMonthlyData) return;
  const minY = currentYearMin || globalYearMin;
  const maxY = currentYearMax || globalYearMax;
  const iH   = window._timelineY.range()[0];
  window._timelineChartG.selectAll('.tl-bar-active')
    .attr('height', d => d.year >= minY && d.year <= maxY ? iH - window._timelineY(d.value) : 0)
    .attr('y',      d => d.year >= minY && d.year <= maxY ? window._timelineY(d.value) : window._timelineY(0));
}

// =============================================================================
//  CARICAMENTO DATI INIZIALE
// =============================================================================

Promise.all([
  fetch('http://localhost:5000/api/segments').then(r => r.json()),
  fetch('http://localhost:5000/api/master').then(r => r.json()),
  fetch('http://localhost:5000/api/segments/meta').then(r => r.json()),
])
  .then(([geodata, { data: masterData }, meta]) => {
    globalMasterData = masterData;
    allGeoProps      = geodata.features;
    buildMap(geodata);
    const yearMin = meta.install_year ? Math.floor(meta.install_year.min) : 2015;
    const yearMax = meta.install_year ? Math.ceil(meta.install_year.max)  : 2022;
    currentYearMin = yearMin;
    currentYearMax = yearMax;
    initTimeline(yearMin, yearMax);
    buildTimelineMiniChart(computeMonthlyBins(masterData, yearMin, yearMax));
    requestAnimationFrame(() => buildCrossfilter(masterData));
  })
  .catch(console.error);

// Ricarica il dataset master per un intervallo temporale e ricostruisce i grafici
function fetchMasterAndRebuild(yearMin, yearMax) {
  fetch(`http://localhost:5000/api/master?year_min=${yearMin}&year_max=${yearMax}`)
    .then(r => r.json())
    .then(({ data: masterData }) => {
      globalMasterData = masterData;
      requestAnimationFrame(() => buildCrossfilter(masterData));
    })
    .catch(console.error);
}
