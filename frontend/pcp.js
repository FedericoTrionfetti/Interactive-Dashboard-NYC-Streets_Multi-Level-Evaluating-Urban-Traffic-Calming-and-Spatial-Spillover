// =============================================================================
//  PCP — Parallel Coordinates Plot, KDE Densità e Similarity
//  (rinominato da charts.js per chiarezza semantica)
//  Dipende da: config.js, state.js, utils.js
// =============================================================================

// Inizializza o aggiorna il grafico a coordinate parallele
function initParCoords(data) {
  _allPcData = data;
  const el = document.getElementById('pcp-container');
  if (!el || typeof ParCoords === 'undefined') return;
  if (pc) { 
    pc.data(data).render(); 
    _bindPcpTooltips();
    return; 
  }

  pc = ParCoords()('#pcp-container')
    .data(data)
    .margin({ top: 40, left: 40, bottom: 10, right: 50 })
    .nullValueSeparator('bottom')
    .dimensions({
      length_m:    { title: 'Length (m)',  type: 'number' },
      speed_limit: { title: 'Speed (mph)', type: 'number' },
      total_lanes: { title: 'Lanes',       type: 'number' },
      density:     { title: 'Density',     type: 'number' },
      MHI:         { title: 'MHI',         type: 'number' },
    })
    .render()
    .brushMode('1D-axes')
    .alphaOnBrushed(1);

  // Propaga il brush del PCP al crossfilter
  pc.on('brush', function (brushedData) {
    if (!_pcpDim) return;
    _isBrushingPCP = true;
    const allLen = (_allPcData || []).length;
    const isClear = !brushedData || brushedData.length === 0 || brushedData.length === allLen;
    const brushedSet = isClear ? null : new Set(brushedData.map(d => d.RCSTA));
    if (brushedSet) {
      _pcpDim.filterFunction(d => brushedSet.has(d));
      if (_pcpDimU) _pcpDimU.filterFunction(d => brushedSet.has(d));
    } else {
      _pcpDim.filterAll();
      if (_pcpDimU) _pcpDimU.filterAll();
    }
    dc.redrawAll();
    if (_updateLinkedCharts) _updateLinkedCharts();
    _isBrushingPCP = false;
  });

  _bindPcpTooltips();
}

// -----------------------------------------------------------------------------
// HIGHLIGHT HOVER per PCP
// -----------------------------------------------------------------------------
window.highlightPCP = function(targetRecords) {
  if (!pc) return;
  const svg = d3.select('#pcp-container svg');
  if (svg.empty()) return;
  
  const targetDedup = Array.from(new Map(targetRecords.map(d => [d.RCSTA, d])).values());

  window.clearPCPHighlight();
  if (!targetDedup || targetDedup.length === 0) return;

  const dims = pc.dimensions();
  const activeDims = Object.keys(dims).filter(k => dims[k].type === 'number');

  if (_pcpFadeActive && window._dimDensities && window._pcpMaxHalf) {
    // Density Mode: aggiunge curve KDE rosse come subset proporzionale
    const maxHalf = window._pcpMaxHalf;
    const dimPos = _getDimPositions();
    const pcpRootG = svg.select('g');
    const overlayG = (pcpRootG.empty() ? svg : pcpRootG).append('g').attr('class', 'pcp-hover-highlight-group');
    
    activeDims.forEach(key => {
      const dimData = window._dimDensities[key];
      if (!dimData) return;

      const xPos = dimPos[key] || 0;
      const clipId = `kde-clip-${key}`;
      const pathG = overlayG.append('g').attr('transform', `translate(${xPos},0)`).attr('clip-path', `url(#${clipId})`);

      const { yScale, densAllT, densAllU, kdeAllT_obj, kdeAllU_obj } = dimData;
      const maxDensR = d3.max(densAllT, d => d.d) || 0;
      const maxDensL = d3.max(densAllU, d => d.d) || 0;
      const maxDens = Math.max(maxDensR, maxDensL) || 1;
      const dSc = d3.scaleLinear().domain([0, maxDens]).range([0, maxHalf]);

      const tVals = targetDedup.filter(d => d.treated).map(d => +d[key]).filter(v => isFinite(v));
      const uVals = targetDedup.filter(d => !d.treated).map(d => +d[key]).filter(v => isFinite(v));

      const baseDensT = dimData.densActT || densAllT;
      const baseDensU = dimData.densActU || densAllU;

      if (tVals.length > 0 && baseDensT) {
        const kdeFn = gaussianKDE(tVals, kdeAllT_obj.bw).fn;
        const count = tVals.length;
        const dens = baseDensT.map(base => ({ v: base.v, d: Math.min(kdeFn(base.v) * count, base.d) }));
        const areaR = d3.area().x0(0).x1(d => dSc(d.d)).y(d => yScale(d.v)).curve(d3.curveLinear);
        pathG.append('path').datum(dens).attr('class', 'pcp-hover-highlight')
          .attr('d', areaR).attr('fill', '#ef4444').attr('stroke', '#dc2626')
          .attr('stroke-width', 2).attr('opacity', 1).style('pointer-events', 'none');
      }

      if (uVals.length > 0 && baseDensU) {
        const kdeFn = gaussianKDE(uVals, kdeAllU_obj.bw).fn;
        const count = uVals.length;
        const dens = baseDensU.map(base => ({ v: base.v, d: Math.min(kdeFn(base.v) * count, base.d) }));
        const areaL = d3.area().x0(0).x1(d => -dSc(d.d)).y(d => yScale(d.v)).curve(d3.curveLinear);
        pathG.append('path').datum(dens).attr('class', 'pcp-hover-highlight')
          .attr('d', areaL).attr('fill', '#ef4444').attr('stroke', '#dc2626')
          .attr('stroke-width', 2).attr('opacity', 1).style('pointer-events', 'none');
      }
    });
  } else {
    // Lines Mode: aggiunge path rossi
    const dimPos = _getDimPositions();
    const dimScales = {};
    activeDims.forEach(p => {
      const dimGroup = svg.selectAll('.dimension').filter(function (k) { return k === p; });
      const allVals = (_allPcData || []).map(d => +d[p]).filter(v => isFinite(v));
      const [dMin, dMax] = d3.extent(allVals);
      dimScales[p] = _getAxisYScale(dimGroup, dMin, dMax);
    });

    const lineGen = d3.line()
      .x(d => dimPos[d.p] || 0)
      .y(d => dimScales[d.p] ? dimScales[d.p](d.v) : 0);
    
    const pcpRootG = svg.select('g');
    const overlayG = (pcpRootG.empty() ? svg : pcpRootG).append('g').attr('class', 'pcp-hover-highlight-group');

    targetRecords.forEach(row => {
      const pts = activeDims.map(p => ({ p, v: row[p] })).filter(d => isFinite(d.v));
      if (pts.length < 2) return;
      overlayG.append('path').datum(pts).attr('class', 'pcp-hover-highlight')
        .attr('d', lineGen).attr('fill', 'none')
        .attr('stroke', '#ef4444').attr('stroke-width', 2.5)
        .attr('opacity', 0.9).style('pointer-events', 'none');
    });
  }
};

window.clearPCPHighlight = function() {
  const svg = d3.select('#pcp-container svg');
  svg.selectAll('.pcp-hover-highlight').remove();
  svg.selectAll('.pcp-hover-highlight-group').remove();
};

function _bindPcpTooltips() {
  setTimeout(() => {
    const dims = d3.select('#pcp-container').selectAll('.dimension');
    
    // Area invisibile più larga per facilitare l'hover (utile in L1)
    dims.each(function() {
      const g = d3.select(this);
      if (g.select('.fat-hover').empty()) {
        const svgH = +d3.select('#pcp-container svg').attr('height') || 210;
        g.insert('rect', ':first-child')
          .attr('class', 'fat-hover')
          .attr('x', -20).attr('y', -20)
          .attr('width', 40).attr('height', svgH + 40)
          .attr('fill', 'transparent');
      }
    });

    dims.on('mouseenter', function (event, dimName) {
        if (!_allPcData || !dimName || typeof dimName !== 'string') return;
        const tooltip = document.getElementById('pcp-axis-tooltip');
        if (!tooltip) return;

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

        const numTreated = _allPcData.filter(d => d.treated).length;
        const numUntreated = _allPcData.length - numTreated;
        const isFiltered = (activeTIds.size > 0 && activeTIds.size !== numTreated) ||
                           (activeUIds.size > 0 && activeUIds.size !== numUntreated) ||
                           (window._activeIntFilters && window._activeIntFilters.size > 0);

        const groups = [
          { name: 'Treated Selected',   color: '#1f77b4', data: [] },
          { name: 'Treated Unselected', color: '#8eb1d4', data: [] },
          { name: 'Untreated Selected',   color: '#555555', data: [] },
          { name: 'Untreated Unselected', color: '#c7c7c7', data: [] }
        ];

        _allPcData.forEach(d => {
          let v = +d[dimName];
          if (isNaN(v)) return;
          if (d.treated) {
            if (!isFiltered || activeTIds.has(d.RCSTA)) groups[0].data.push(v);
            else groups[1].data.push(v);
          } else {
            if (!isFiltered || activeUIds.has(d.RCSTA)) groups[2].data.push(v);
            else groups[3].data.push(v);
          }
        });

        let html = `<div style="font-weight:700; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Axis: ${dimName}</div>`;
        html += `<table style="width:100%; border-collapse:collapse; text-align:right; font-size:10px;">
          <tr style="border-bottom:1px solid #f0f0f0; color:#64748b; font-size:9.5px;">
            <th style="text-align:left; padding-right:12px; padding-bottom:4px;">Group</th>
            <th style="padding:0 6px; padding-bottom:4px;">Mean</th>
            <th style="padding-left:6px; padding-bottom:4px;">Range</th>
          </tr>`;

        let treatedRendered = false;
        let untreatedBorderDone = false;

        groups.forEach((g, idx) => {
          const n = g.data.length;
          if (n === 0) return;
          if (idx < 2) treatedRendered = true;

          g.data.sort((a, b) => a - b);
          const mean = (d3.mean(g.data)).toFixed(1);
          const range = `${d3.min(g.data).toFixed(1)} – ${d3.max(g.data).toFixed(1)}`;
          
          let trStyle = 'border-bottom:1px solid #f8fafc;';
          let pt = '3px'; let pb = '3px';
          if (idx >= 2 && treatedRendered && !untreatedBorderDone) {
            trStyle = 'border-top:1px solid #e2e8f0; border-bottom:1px solid #f8fafc;';
            pt = '5px';
            untreatedBorderDone = true;
          }

          html += `<tr style="${trStyle}">
            <td style="text-align:left; padding-right:12px; white-space:nowrap; color:#334155; font-weight:600; padding-top:${pt}; padding-bottom:${pb};">
              <div style="display:inline-block; width:8px; height:8px; background:${g.color}; margin-right:6px; border-radius:1px;"></div>
              ${g.name}
            </td>
            <td style="padding:0 6px; color:#1e293b; font-weight:700; padding-top:${pt}; padding-bottom:${pb};">${mean}</td>
            <td style="padding-left:6px; color:#64748b; padding-top:${pt}; padding-bottom:${pb};">${range}</td>
          </tr>`;
        });
        html += '</table>';

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
      })
      .on('mousemove', function (event) {
        const tooltip = document.getElementById('pcp-axis-tooltip');
        if (tooltip) {
          let left = event.pageX + 15;
          let top  = event.pageY + 15;
          if (left + 240 > window.innerWidth)  left = event.pageX - 250;
          if (top  + 160 > window.innerHeight) top  = event.pageY - 170;
          tooltip.style.left = left + 'px';
          tooltip.style.top  = top  + 'px';
        }
      })
      .on('mouseleave', function () {
        const tooltip = document.getElementById('pcp-axis-tooltip');
        if (tooltip) tooltip.style.display = 'none';
      });
  }, 100);
}

// Listener per il pulsante "Density Curves" e il selettore finestra temporale
window.addEventListener('load', () => {
  const fadeBtn = document.getElementById('pcp-fade-btn');
  if (fadeBtn) {
    fadeBtn.addEventListener('click', () => {
      _pcpFadeActive = !_pcpFadeActive;
      fadeBtn.classList.toggle('active', _pcpFadeActive);
      if (_updateLinkedCharts) _updateLinkedCharts();
      else if (pc) pc.render();
    });
  }
  const timeSelect = document.getElementById('time-window-select');
  if (timeSelect) {
    timeSelect.addEventListener('change', () => {
      if (globalMasterData) requestAnimationFrame(() => buildCrossfilter(globalMasterData));
    });
  }
});

// =============================================================================
//  KDE — Gaussian Kernel Density Estimation
// =============================================================================

// KDE gaussiana con larghezza di banda di Silverman
function gaussianKDE(values, forceBw = null) {
  const n = values.length;
  if (!n) return { fn: () => 0, bw: 1 };
  
  let bw;
  if (forceBw != null) {
    bw = forceBw;
  } else {
    const std = d3.deviation(values) || 1;
    bw = 1.06 * std * Math.pow(n, -0.2);
    const rng = d3.max(values) - d3.min(values);
    if (rng > 0) {
      const minBw = rng / 15;
      if (bw < minBw) bw = minBw;
    } else {
      bw = 1;
    }
  }

  return {
    fn: x => {
      let s = 0;
      for (const v of values) { const z = (x - v) / bw; s += Math.exp(-0.5 * z * z); }
      return s / (n * bw * Math.sqrt(2 * Math.PI));
    },
    bw
  };
}

// Ricostruisce la y-scale per un asse leggendo i tick SVG già renderizzati
function _getAxisYScale(dimGroup, dataMin, dataMax) {
  const svgH = +d3.select('#pcp-container svg').attr('height') || 210;
  const ticks = [];
  dimGroup.selectAll('.tick text').each(function () {
    const txt = d3.select(this).text().replace(/,/g, '');
    const val = +txt;
    const ty = d3.select(this.parentNode).attr('transform') || '';
    const m = ty.match(/translate\([^,]*,([^)]+)\)/);
    if (!isNaN(val) && m) ticks.push({ val, py: +m[1] });
  });
  if (ticks.length >= 2) {
    const sorted = ticks.sort((a, b) => a.val - b.val);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (lo.val !== hi.val)
      return d3.scaleLinear().domain([lo.val, hi.val]).range([lo.py, hi.py]);
  }
  return d3.scaleLinear().domain([dataMin, dataMax]).range([svgH - 28, 28]);
}

// Legge la posizione x di ogni asse dal transform SVG del gruppo .dimension
function _getDimPositions() {
  const pos = {};
  d3.select('#pcp-container svg g').selectAll('.dimension').each(function (key) {
    const t = d3.select(this).attr('transform') || '';
    const m = t.match(/translate\(([^,)]+)/);
    if (m) pos[key] = +m[1];
  });
  return pos;
}

// Disegna curve KDE split-violin su ogni asse del PCP (solo se _pcpFadeActive)
function drawPCPDensities(activeTreated, allTreated, activeUntreated, allUntreated) {
  if (!pc) return;
  const svg = d3.select('#pcp-container svg');
  if (svg.empty()) return;
  svg.selectAll('.pcp-kde-group').remove();
  if (!_pcpFadeActive) return;

  const isFiltered = activeTreated.length !== allTreated.length || activeUntreated.length !== allUntreated.length;

  const KDE_W = 75;
  const dimPos = _getDimPositions();
  const dimKeys = Object.keys(pc.dimensions());
  const xVals = dimKeys.map(k => dimPos[k]).filter(v => v != null).sort((a, b) => a - b);
  const minGap = xVals.length > 1 ? d3.min(xVals.slice(1).map((x, i) => x - xVals[i])) : 80;
  const maxHalf = Math.min(KDE_W, Math.floor(minGap * 0.48));
  window._pcpMaxHalf = maxHalf;
  
  const dimDensities = {};
  window._dimDensities = dimDensities;

  const nonNegativeKeys = new Set(['length_m', 'density', 'MHI', 'total_lanes', 'speed_limit']);
  const clampPositive = (densArr) => densArr.map(d => ({ v: d.v, d: d.v < 0 ? 0 : d.d }));

  dimKeys.forEach(key => {
    const dimGroup = d3.select('#pcp-container svg').selectAll('.dimension').filter(function (k) { return k === key; });
    const allTVals = allTreated.map(d => +d[key]).filter(v => isFinite(v));
    const allUVals = allUntreated.map(d => +d[key]).filter(v => isFinite(v));
    const actTVals = activeTreated.map(d => +d[key]).filter(v => isFinite(v));
    const actUVals = activeUntreated.map(d => +d[key]).filter(v => isFinite(v));

    if (!allTVals.length && !allUVals.length) return;
    const [dataMin, dataMax] = d3.extent([...allTVals, ...allUVals]);
    if (dataMin === dataMax) return;

    const yScale = _getAxisYScale(dimGroup, dataMin, dataMax);
    const svgH = +d3.select('#pcp-container svg').attr('height') || 210;
    const innerH = svgH - 50;
    const yMin = Math.min(yScale.invert(innerH + 10), yScale.invert(-10));
    const yMax = Math.max(yScale.invert(innerH + 10), yScale.invert(-10));
    
    const N = 100;
    const samps = Array.from({ length: N }, (_, i) => yMin + i * (yMax - yMin) / (N - 1));

    const countT = allTVals.length;
    const countU = allUVals.length;
    const kdeAllT_obj = gaussianKDE(allTVals), kdeAllU_obj = gaussianKDE(allUVals);
    const kdeAllT = kdeAllT_obj.fn, kdeAllU = kdeAllU_obj.fn;
    let densAllT = samps.map(v => ({ v, d: kdeAllT(v) * countT }));
    let densAllU = samps.map(v => ({ v, d: kdeAllU(v) * countU }));

    let densActT = null, densActU = null;
    if (isFiltered) {
      const kdeActT = gaussianKDE(actTVals, kdeAllT_obj.bw).fn;
      const kdeActU = gaussianKDE(actUVals, kdeAllU_obj.bw).fn;
      const countActT = actTVals.length;
      const countActU = actUVals.length;
      densActT = samps.map((v, i) => ({ v, d: Math.min(kdeActT(v) * countActT, densAllT[i].d) }));
      densActU = samps.map((v, i) => ({ v, d: Math.min(kdeActU(v) * countActU, densAllU[i].d) }));
    }

    if (nonNegativeKeys.has(key)) {
      densAllT = clampPositive(densAllT);
      densAllU = clampPositive(densAllU);
      if (densActT) densActT = clampPositive(densActT);
      if (densActU) densActU = clampPositive(densActU);
    }

    dimDensities[key] = {
      yScale, densAllT, densAllU, densActT, densActU,
      allTVals, allUVals, actTVals, actUVals,
      kdeAllT_obj, kdeAllU_obj
    };
  });

  dimKeys.forEach(key => {
    const xPos = dimPos[key];
    if (xPos == null || !dimDensities[key]) return;
    const { yScale, densAllT, densAllU, densActT, densActU, allTVals, allUVals } = dimDensities[key];

    const maxDensR = d3.max(densAllT, d => d.d) || 0;
    const maxDensL = d3.max(densAllU, d => d.d) || 0;
    const maxDens  = Math.max(maxDensR, maxDensL) || 1;
    const dSc = d3.scaleLinear().domain([0, maxDens]).range([0, maxHalf]);

    const areaR = d3.area().x0(0).x1(d => dSc(d.d)).y(d => yScale(d.v)).curve(d3.curveLinear);
    const areaL = d3.area().x0(0).x1(d => -dSc(d.d)).y(d => yScale(d.v)).curve(d3.curveLinear);

    const clipId = `kde-clip-${key}`;
    const svgEl = d3.select('#pcp-container svg');
    svgEl.select(`#${clipId}`).remove();
    if (svgEl.select('defs').empty()) svgEl.insert('defs', ':first-child');
    const svgH = +svgEl.attr('height') || 210;
    svgEl.select('defs').append('clipPath').attr('id', clipId).append('rect')
      .attr('x', -maxHalf - 1).attr('y', 0).attr('width', maxHalf * 2 + 2).attr('height', svgH);

    const g = svgEl.select('g').append('g')
      .attr('class', 'pcp-kde-group')
      .attr('transform', `translate(${xPos},0)`)
      .attr('clip-path', `url(#${clipId})`)
      .style('pointer-events', 'none');

    if (isFiltered) {
      if (allUVals.length) g.append('path').datum(densAllU).attr('d', areaL)
        .attr('fill', 'rgba(199,199,199,0.50)').attr('stroke', '#969696').attr('stroke-width', 1.5);
      if (allTVals.length) g.append('path').datum(densAllT).attr('d', areaR)
        .attr('fill', 'rgba(142,177,212,0.55)').attr('stroke', '#8eb1d4').attr('stroke-width', 1.5);
    }

    const activeDensU = isFiltered ? densActU : densAllU;
    const activeDensT = isFiltered ? densActT : densAllT;

    if (activeDensU && activeDensU.length)
      g.append('path').datum(activeDensU).attr('d', areaL)
        .attr('fill', 'rgba(85,85,85,0.85)').attr('stroke', '#555555').attr('stroke-width', 1.5);
    if (activeDensT && activeDensT.length)
      g.append('path').datum(activeDensT).attr('d', areaR)
        .attr('fill', 'rgba(31,119,180,0.90)').attr('stroke', '#1f77b4').attr('stroke-width', 1.5);
  });
}

// Calcola l'Overlap Coefficient tra due distribuzioni KDE (0=diverse, 1=identiche)
function computeDistributionOverlap(tVals, uVals) {
  if (!tVals.length || !uVals.length) return null;
  const allV = [...tVals, ...uVals];
  const mn = d3.min(allV), mx = d3.max(allV);
  if (mn === mx) return 1;
  const N = 50;
  const samps = Array.from({ length: N }, (_, i) => mn + (i + 0.5) * (mx - mn) / N);
  const kT = gaussianKDE(tVals).fn, kU = gaussianKDE(uVals).fn;
  const pT = samps.map(v => kT(v)), pU = samps.map(v => kU(v));
  const sT = d3.sum(pT) || 1, sU = d3.sum(pU) || 1;
  return Math.max(0, Math.min(1, d3.sum(samps.map((_, i) => Math.min(pT[i] / sT, pU[i] / sU)))));
}

// Disegna i coefficienti di similarità sopra gli assi del PCP (barre viola + valore)
function drawPCPSimilarity(treatedData, untreatedData) {
  if (!pc) return;
  const svg = d3.select('#pcp-container svg');
  if (svg.empty()) return;
  svg.selectAll('.pcp-sim-label').remove();
  const dimPos = _getDimPositions();
  const purples = ['#fcfbfd','#efedf5','#dadaeb','#bcbddc','#9e9ac8','#807dba','#6a51a3','#54278f','#3f007d'];
  const simColorScale = d3.scaleQuantize().domain([0, 1]).range(purples);

  Object.keys(pc.dimensions()).forEach(key => {
    const xPos = dimPos[key];
    if (xPos == null) return;
    const tVals = treatedData.map(d => +d[key]).filter(v => isFinite(v));
    const uVals = untreatedData.map(d => +d[key]).filter(v => isFinite(v));
    const bc = computeDistributionOverlap(tVals, uVals);
    if (bc == null) return;
    const barMaxW = 36;
    const barW = Math.max(2, bc * barMaxW);
    const labelGroup = svg.select('g').append('g')
      .attr('class', 'pcp-sim-label')
      .attr('transform', `translate(${xPos}, -22)`);
    labelGroup.append('rect').attr('x', -barMaxW / 2).attr('y', 0)
      .attr('width', barMaxW).attr('height', 4).attr('fill', '#e0e4eb').attr('rx', 2);
    labelGroup.append('rect').attr('x', -barMaxW / 2).attr('y', 0)
      .attr('width', barW).attr('height', 4).attr('fill', simColorScale(bc)).attr('rx', 2);
    labelGroup.append('text').attr('x', 0).attr('y', -3).attr('text-anchor', 'middle')
      .style('font-size', '9px').style('font-weight', '700').style('fill', '#555')
      .text(bc.toFixed(2));
  });
}
