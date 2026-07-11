// =============================================================================
//  LEVEL 2 – TIMESERIES: Lineplot, AADT Bar, Moving Average
//  Estratto da level2.js (righe 934-1547).
//  Dipende da: config.js, state.js, level2_core.js (ndxA, _l2FullData, _l2TargetData)
// =============================================================================

let _l2TargetTimeseries = null;

// =============================================================================
//  TIME SERIES UTILITIES
// =============================================================================

function _aggregateTimeSeries(features) {
  const sumByDate   = {};
  const countByDate = {};
  features.forEach(f => {
    const ts = f.properties.ts_array;
    const rr = f.properties.rr_array;
    if (ts && rr) {
      for (let i = 0; i < ts.length; i++) {
        if (!sumByDate[ts[i]]) { sumByDate[ts[i]] = 0; countByDate[ts[i]] = 0; }
        sumByDate[ts[i]]   += rr[i];
        countByDate[ts[i]]++;
      }
    }
  });
  const dates = Object.keys(sumByDate).sort();
  return { ts: dates, riskRates: dates.map(d => sumByDate[d] / countByDate[d]) };
}

function _applyMovingAverage(series, windowSize) {
  if (!series || !series.riskRates || windowSize <= 1) return series;
  const smoothedRates = [];
  for (let i = 0; i < series.riskRates.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) { sum += series.riskRates[j]; count++; }
    smoothedRates.push(sum / count);
  }
  return { ts: series.ts, riskRates: smoothedRates, interventions: series.interventions };
}

// =============================================================================
//  REDRAW LINEPLOT (aggiornamento client-side)
// =============================================================================

function _l2RedrawLineplot() {
  if (!_l2TargetTimeseries) return;

  let activeA = [];
  if (ndxA) {
    const radiusM       = +document.getElementById('l2-radius-slider').value;
    const aFiltered     = ndxA.allFiltered();
    const aActiveRcstas = new Set(aFiltered.map(f => f.properties.RCSTA));
    const cohortAFeatures = _l2FullData?.cohort_a?.features || [];
    activeA = cohortAFeatures.filter(f =>
      aActiveRcstas.has(f.properties.RCSTA) && (f.properties.distance_m || 0) <= radiusM
    );
  }

  const maSelect = document.getElementById('l2-lineplot-ma');
  const maWindow = maSelect ? parseInt(maSelect.value, 10) || 1 : 1;

  const aggA         = _applyMovingAverage(_aggregateTimeSeries(activeA), maWindow);
  const smoothedTarget = _applyMovingAverage(_l2TargetTimeseries, maWindow);

  const computeStats = (activeFeatures) => {
    const totalA = _l2FullData?.cohort_a?.features?.length || 0;
    if (!activeFeatures || !activeFeatures.length) return { pre: '—', post: '—', var: '—', color: '#888', count: 0, total: totalA };
    const preMean  = d3.mean(activeFeatures, f => f.properties.risk_rate_pre);
    const postMean = d3.mean(activeFeatures, f => f.properties.risk_rate_post);
    if (preMean == null || postMean == null) return { pre: '—', post: '—', var: '—', color: '#888', count: activeFeatures.length, total: totalA };
    const varPct = (postMean - preMean) / preMean * 100;
    const color  = varPct > 0 ? '#d7191c' : '#1a9641';
    return {
      pre: preMean.toFixed(4), post: postMean.toFixed(4),
      var: `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%`, color,
      count: activeFeatures.length, total: totalA
    };
  };

  const statsContainer = document.getElementById('l2-avg-local-info-inner');
  if (statsContainer) {
    const statsA = computeStats(activeA);
    statsContainer.innerHTML = `
      <div style="font-size: 11px; font-weight: 700; color: #1f77b4; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        Avg Local
      </div>
      <div style="display: flex; gap: 16px; font-size: 11px; white-space:nowrap; margin-bottom: 4px;">
        <div><span style="color:#777;">Segments:</span> <span style="font-weight:600; color:#333;">${statsA.count} / ${statsA.total}</span></div>
      </div>
      <div style="display: flex; font-size: 11px; white-space:nowrap;">
        <div><span style="color:#777;">Var. %:</span> <span style="font-weight:700; color:${statsA.color};">${statsA.var}</span></div>
      </div>
    `;
  }

  _l2DrawLineplot(smoothedTarget, aggA, null);
}

// =============================================================================
//  LINEPLOT PRINCIPALE
// =============================================================================

function _l2DrawLineplot(targetData, cohortAData) {
  const container = document.getElementById('l2-lineplot-container');
  if (!container) return;

  const cWidth  = container.clientWidth;
  const cHeight = container.clientHeight;
  container.innerHTML = '';

  if (!targetData || !targetData.ts || !targetData.ts.length) {
    container.innerHTML = '<div style="padding:20px;color:#888;">No time series data available</div>';
    return;
  }

  const margin = { top: 10, right: 30, bottom: 25, left: 50 };
  const width  = cWidth  - margin.left - margin.right;
  const height = cHeight - margin.top  - margin.bottom - 24;

  const svg = d3.select(container).append('svg')
    .attr('width',  width  + margin.left + margin.right)
    .attr('height', height + margin.top  + margin.bottom)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const parseTime = d3.timeParse('%Y-%m-%d');
  const parseData = dataObj => {
    if (!dataObj || !dataObj.ts) return [];
    return dataObj.ts.map((d, i) => ({ date: parseTime(d), riskRate: dataObj.riskRates[i] || 0 }));
  };

  const parsedTarget = parseData(targetData);
  let parsedA = parseData(cohortAData);

  const targetExtent = d3.extent(parsedTarget, d => d.date);
  if (targetExtent[0]) parsedA = parsedA.filter(d => d.date >= targetExtent[0]);

  const allData = [...parsedTarget, ...parsedA];

  const x = d3.scaleTime()
    .domain([targetExtent[0] || d3.min(allData, d => d.date), d3.max(allData, d => d.date)])
    .range([0, width]);

  const yMax = d3.max(allData, d => d.riskRate) || 1;
  const y = d3.scaleLinear().domain([0, yMax * 1.15]).range([height, 0]);

  svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(6));
  svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.3f')));

  svg.append('text')
    .attr('transform', 'rotate(-90)').attr('y', -42).attr('x', -height / 2)
    .attr('fill', '#090909').style('text-anchor', 'middle').style('font-size', '10px')
    .text('Risk Rate (crashes / 1 000 veh)');

  const drawLine = (data, color, isDashed, opacity = 1) => {
    if (!data.length) return;
    const line = d3.line().x(d => x(d.date)).y(d => y(d.riskRate)).curve(d3.curveMonotoneX);
    const p = svg.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('opacity', opacity).attr('d', line);
    if (isDashed) p.attr('stroke-dasharray', '4, 4');
  };

  const labelsToDraw = [];

  if (_l2TargetData?.installYear) {
    const yInt   = +_l2TargetData.installYear;
    const mInt   = +(_l2TargetData.installMonth || 1);
    const intDate = new Date(yInt, mInt - 1, 15);
    const xDom   = x.domain();

    const preStartDate = new Date(intDate); preStartDate.setFullYear(preStartDate.getFullYear() - _l2TimeWindow);
    const postEndDate  = new Date(intDate); postEndDate.setFullYear(postEndDate.getFullYear()   + _l2TimeWindow);

    const preStartT = Math.max(xDom[0].getTime(), preStartDate.getTime());
    const preEndT   = Math.min(xDom[1].getTime(), intDate.getTime());
    if (preStartT < preEndT) {
      svg.insert('rect', ':first-child')
        .attr('x', x(new Date(preStartT))).attr('y', 0)
        .attr('width', x(new Date(preEndT)) - x(new Date(preStartT))).attr('height', height)
        .attr('fill', COLOR_PRE_PERIOD).attr('opacity', 0.35);
    }

    const postStartT = Math.max(xDom[0].getTime(), intDate.getTime());
    const postEndT   = Math.min(xDom[1].getTime(), postEndDate.getTime());
    if (postStartT < postEndT) {
      svg.insert('rect', ':first-child')
        .attr('x', x(new Date(postStartT))).attr('y', 0)
        .attr('width', x(new Date(postEndT)) - x(new Date(postStartT))).attr('height', height)
        .attr('fill', COLOR_POST_PERIOD).attr('opacity', 0.4);
    }

    const labelsByDate = {};
    const addLabel = (dateKey, date, text, isTarget) => {
      if (!labelsByDate[dateKey]) labelsByDate[dateKey] = { x: x(date), texts: [], isTarget: false };
      labelsByDate[dateKey].texts.push(text);
      if (isTarget) labelsByDate[dateKey].isTarget = true;
    };

    if (intDate >= xDom[0] && intDate <= xDom[1]) {
      addLabel(`${yInt}-${mInt}`, intDate, `${_l2TargetData.intervention || 'Target Intervention'} (${String(mInt).padStart(2,'0')}/${yInt})`, true);
    }

    if (_l2TargetTimeseries?.interventions) {
      _l2TargetTimeseries.interventions.forEach(inv => {
        const isTarget = inv.year === yInt && inv.month === mInt && inv.intervention === _l2TargetData.intervention;
        if (isTarget) return;
        const invDate = new Date(inv.year, inv.month - 1, 15);
        if (invDate >= xDom[0] && invDate <= xDom[1])
          addLabel(`${inv.year}-${inv.month}`, invDate, `${inv.intervention} (${String(inv.month).padStart(2,'0')}/${inv.year})`, false);
      });
    }

    Object.values(labelsByDate).forEach(lbl => {
      lbl.color = lbl.isTarget ? '#000000' : '#9e9ac8';
      labelsToDraw.push(lbl);
    });

    labelsToDraw.forEach(lbl => {
      if (lbl.isTarget) {
        svg.append('line').attr('x1', lbl.x).attr('x2', lbl.x).attr('y1', 0).attr('y2', height)
          .attr('stroke', '#ffffff').attr('stroke-width', 5).attr('stroke-dasharray', '6,4').style('opacity', 1.0);
      }
      svg.append('line').attr('x1', lbl.x).attr('x2', lbl.x).attr('y1', 0).attr('y2', height)
        .attr('stroke', lbl.color).attr('stroke-width', lbl.isTarget ? 2 : 1.5)
        .attr('stroke-dasharray', lbl.isTarget ? '6,4' : '4,2')
        .style('opacity', lbl.isTarget ? 0.9 : 0.6);
    });
  }

  drawLine(parsedTarget, COLOR_TARGET,    false, 1.0);  // Target = Yellow
  drawLine(parsedA,      COLOR_AVG_LOCAL, false, 0.8);  // Cohort A = CB Blues

  // Legenda
  d3.select(container).insert('div', 'svg')
    .attr('class', 'lineplot-legend')
    .style('display', 'flex').style('flex-wrap', 'wrap').style('gap', '16px')
    .style('font-size', '10px').style('margin-bottom', '4px')
    .style('justify-content', 'center').style('color', '#475569')
    .html(`
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:12px; background:${COLOR_PRE_PERIOD}; border-radius:2px;"></div><span>Pre</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:12px; background:${COLOR_POST_PERIOD}; border-radius:2px;"></div><span>Post</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:2px; background:${COLOR_AVG_LOCAL};"></div><span>Avg Local</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:2px; background:${COLOR_TARGET};"></div><span>Target Segment</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:2px; border-bottom:2px dashed ${COLOR_TARGET};"></div><span>Target Intervention</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:12px; height:2px; border-bottom:2px dashed #9e9ac8;"></div><span>Other Interventions (hover)</span></div>
    `);

  // Hover tooltip
  d3.select(container).style('position', 'relative');
  const tooltipDiv = d3.select(container).append('div')
    .style('position', 'absolute').style('display', 'none')
    .style('background', 'rgba(255, 255, 255, 0.95)').style('border', '1px solid #d0d5dd')
    .style('border-radius', '6px').style('padding', '4px 8px').style('pointer-events', 'none')
    .style('font-size', '10px').style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10);

  const focusLine = svg.append('line').style('display', 'none')
    .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('stroke-dasharray', '4,4')
    .attr('y1', 0).attr('y2', height);

  const allDatesSet = new Set();
  if (parsedTarget) parsedTarget.forEach(d => allDatesSet.add(d.date.getTime()));
  if (parsedA)      parsedA.forEach(d => allDatesSet.add(d.date.getTime()));
  const allUniqueDates = Array.from(allDatesSet).map(t => new Date(t)).sort((a, b) => a - b);

  svg.append('rect').attr('width', width).attr('height', height)
    .attr('fill', 'none').attr('pointer-events', 'all')
    .on('mouseover', () => { focusLine.style('display', null); tooltipDiv.style('display', 'block'); })
    .on('mouseout',  () => { focusLine.style('display', 'none'); tooltipDiv.style('display', 'none'); })
    .on('mousemove', function (e) {
      if (!allUniqueDates.length) return;
      const x0 = x.invert(d3.pointer(e)[0]);
      const i  = d3.bisector(d => d).left(allUniqueDates, x0, 1);
      if (i >= allUniqueDates.length) return;
      const d0 = allUniqueDates[i - 1], d1 = allUniqueDates[i];
      const hoverDate = (d1 && x0 - d0 > d1 - x0) ? d1 : d0;
      const hoverTime = hoverDate.getTime();

      const tPt = parsedTarget.find(d => d.date.getTime() === hoverTime);
      const aPt = parsedA.find(d => d.date.getTime() === hoverTime);
      const formatDate = d3.timeFormat('%B %Y');

      let mx = d3.pointer(e, container)[0];
      let my = d3.pointer(e, container)[1];

      const svgX = d3.pointer(e)[0];
      let nearInv = null, minDist = 8;
      labelsToDraw.forEach(l => { const dist = Math.abs(l.x - svgX); if (dist < minDist) { minDist = dist; nearInv = l; } });
      let invHtml = '';
      if (nearInv) {
        const color = nearInv.isTarget ? '#000000' : '#9e9ac8';
        invHtml = `<div style="font-size:10px; font-weight:normal; color:#64748b; margin-top:6px; padding-top:4px; border-top:1px dashed #e2e8f0; line-height:1.4;">
          Intervention:<br/>
          <span style="font-weight:bold; color:${color};">${nearInv.texts.join('<br/>')}</span>
        </div>`;
      }

      let html = `<div style="font-weight:700; margin-bottom:6px; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">${formatDate(hoverDate)}</div>`;
      html += `<table style="width:100%; border-collapse:collapse; text-align:right; font-size:9.5px;">
          <tr style="border-bottom:1px solid #f0f0f0; color:#64748b;">
            <th style="text-align:left; padding-right:12px; padding-bottom:4px;">Group</th>
            <th style="padding-left:6px; padding-bottom:4px;">Risk Rate</th>
          </tr>`;
      if (tPt) html += `<tr><td style="text-align:left; white-space:nowrap; color:#334155; font-weight:600; padding-right:12px; padding-top:4px; padding-bottom:3px;">
            <div style="display:inline-block; width:8px; height:8px; background:#FFD600; border:1px solid #d97706; margin-right:6px; border-radius:1px;"></div>Target
          </td><td style="color:#1e293b; font-weight:700; padding-left:6px; padding-top:4px; padding-bottom:3px;">${tPt.riskRate.toFixed(4)}</td></tr>`;
      if (aPt) html += `<tr><td style="text-align:left; white-space:nowrap; color:#334155; font-weight:600; padding-right:12px; padding-top:3px; padding-bottom:3px;">
            <div style="display:inline-block; width:8px; height:8px; background:#1f77b4; margin-right:6px; border-radius:1px;"></div>Avg Local
          </td><td style="color:#1e293b; font-weight:700; padding-left:6px; padding-top:3px; padding-bottom:3px;">${aPt.riskRate.toFixed(4)}</td></tr>`;
      html += '</table>' + invHtml;

      tooltipDiv.html(html);
      focusLine.attr('transform', `translate(${x(hoverDate)}, 0)`);

      if (mx > width - 200) mx -= 210; else mx += 15;
      if (my > height - 120) my -= 130; else my += 15;
      tooltipDiv.style('left', mx + 'px').style('top', my + 'px');
    });

  // AADT & Crashes bar chart
  const xDomain = x.domain();
  const minYear = xDomain[0]?.getFullYear() || new Date().getFullYear();
  const maxYear = xDomain[1]?.getFullYear() || new Date().getFullYear();

  const targetAnnual = {};
  for (let yr = minYear; yr <= maxYear; yr++) targetAnnual[yr] = { year: yr, aadt: 0, crashes: 0 };

  if (_l2TargetTimeseries?.ts) {
    _l2TargetTimeseries.ts.forEach((t, i) => {
      const year = new Date(t).getFullYear();
      if (targetAnnual[year]) {
        targetAnnual[year].crashes += _l2TargetTimeseries.n_crashes[i] || 0;
        targetAnnual[year].aadt = Math.max(targetAnnual[year].aadt, _l2TargetTimeseries.aadt[i] || 0);
      }
    });
  }

  const annualData = Object.values(targetAnnual).sort((a, b) => a.year - b.year);
  if (typeof _l2DrawAADTAndCrashesChart === 'function')
    _l2DrawAADTAndCrashesChart('l2-aadt-bar-container', annualData, x, margin);
}

// =============================================================================
//  FETCH TIMESERIES
// =============================================================================

function _l2FetchLineplot(rcsta) {
  fetch(`http://127.0.0.1:5000/api/level2/timeseries?rcsta=${rcsta}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) { console.error('Timeseries error:', data.error); return; }
      _l2TargetTimeseries = {
        ts: data.ts, riskRates: data.risk_rate,
        interventions: data.interventions,
        aadt:     data.aadt      || [],
        n_crashes: data.n_crashes || []
      };
      _l2RedrawLineplot();
    })
    .catch(err => console.error('Lineplot fetch err:', err));
}

// =============================================================================
//  AADT + CRASHES BAR CHART
// =============================================================================

function _l2DrawAADTAndCrashesChart(containerId, annualData, xLineplot, margin) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const barMargin = { top: 16, right: margin.right, bottom: 22, left: margin.left };
  const barWidth  = container.clientWidth  - barMargin.left - barMargin.right;
  const barHeight = container.clientHeight - barMargin.top  - barMargin.bottom;
  if (barWidth <= 0 || barHeight <= 0) return;

  const svg = d3.select(container).append('svg')
    .attr('width', container.clientWidth).attr('height', container.clientHeight)
    .append('g').attr('transform', `translate(${barMargin.left},${barMargin.top})`);

  const yAadtMin = d3.min(annualData, d => d.aadt) || 0;
  const yAadtMax = d3.max(annualData, d => d.aadt) || 1;
  const yAadt    = d3.scaleLinear().domain([yAadtMin * 0.85, yAadtMax * 1.15]).range([barHeight, 0]);

  const yCrashesMax = d3.max(annualData, d => d.crashes) || 1;
  const yCrashes    = d3.scaleLinear().domain([0, yCrashesMax * 1.2]).range([barHeight, 0]);

  const getXMid = year => xLineplot(new Date(year, 0, 1));

  svg.append('g').attr('class', 'y-axis-crashes').attr('transform', 'translate(-15,0)')
    .call(d3.axisLeft(yCrashes).ticks(3).tickFormat(d3.format('d')))
    .selectAll('text').attr('fill', COLOR_TARGET).style('font-size', '8px');
  svg.selectAll('.y-axis-crashes path, .y-axis-crashes line').attr('stroke', '#e2e8f0');

  svg.append('g').attr('class', 'y-axis-aadt').attr('transform', `translate(${barWidth - 15},0)`)
    .call(d3.axisRight(yAadt).ticks(3).tickFormat(d3.format('.2s')))
    .selectAll('text').attr('fill', COLOR_AADT_BARS).style('font-size', '8px');
  svg.selectAll('.y-axis-aadt path, .y-axis-aadt line').attr('stroke', '#e2e8f0');

  svg.append('line').attr('x1', 0).attr('x2', barWidth).attr('y1', barHeight).attr('y2', barHeight).attr('stroke', '#ccc');

  svg.append('text').attr('y', -4).attr('x', -15).attr('fill', COLOR_TARGET)
    .style('text-anchor', 'start').style('font-weight', '700').style('font-size', '9px').text('● Crashes');
  svg.append('text').attr('y', -4).attr('x', barWidth - 15).attr('fill', COLOR_AADT_BARS)
    .style('text-anchor', 'end').style('font-weight', '700').style('font-size', '9px').text('AADT ■');

  const barWidthPx = Math.max(6, Math.min(14, barWidth / annualData.length - 4));
  const bars = svg.selectAll('.bar').data(annualData).enter().append('rect').attr('class', 'bar')
    .attr('x', d => getXMid(d.year) - barWidthPx / 2).attr('y', d => yAadt(d.aadt))
    .attr('width', barWidthPx).attr('height', d => Math.max(0, barHeight - yAadt(d.aadt)))
    .attr('fill', COLOR_AADT_BARS).attr('opacity', 0.75).style('pointer-events', 'none');

  const line = d3.line().x(d => getXMid(d.year)).y(d => yCrashes(d.crashes)).curve(d3.curveLinear);
  svg.append('path').datum(annualData).attr('fill', 'none').attr('stroke', COLOR_TARGET).attr('stroke-width', 2).attr('d', line);

  const points = svg.selectAll('.crash-point').data(annualData).enter().append('circle').attr('class', 'crash-point')
    .attr('cx', d => getXMid(d.year)).attr('cy', d => yCrashes(d.crashes))
    .attr('r', 3).attr('fill', COLOR_TARGET).attr('stroke', '#fff').attr('stroke-width', 1).style('pointer-events', 'none');

  const step = annualData.length > 8 ? 2 : 1;
  svg.selectAll('.bar-label').data(annualData.filter((d, i) => i % step === 0)).enter().append('text')
    .attr('class', 'bar-label').attr('x', d => getXMid(d.year)).attr('y', barHeight + 13)
    .attr('text-anchor', 'middle').style('font-size', '8.5px').style('font-family', 'Inter, sans-serif').style('fill', '#64748b')
    .text(d => String(d.year));

  svg.append('rect').attr('class', 'bar-overlay').attr('width', barWidth).attr('height', barHeight)
    .attr('fill', 'none').style('pointer-events', 'all')
    .on('mousemove', function (e) {
      const x0 = xLineplot.invert(d3.pointer(e)[0]);
      let closestDist = Infinity, closestD = null;
      annualData.forEach(d => { const dist = Math.abs(x0 - new Date(d.year, 0, 1)); if (dist < closestDist) { closestDist = dist; closestD = d; } });
      if (!closestD) return;
      bars.attr('opacity', 0.75).attr('fill', COLOR_AADT_BARS);
      points.attr('r', 3).attr('stroke-width', 1);
      bars.filter(b => b.year === closestD.year).attr('opacity', 1).attr('fill', d3.color(COLOR_AADT_BARS).darker(0.5));
      points.filter(p => p.year === closestD.year).attr('r', 5).attr('stroke-width', 2);
      if (typeof _l2ShowCombinedTooltip === 'function') _l2ShowCombinedTooltip(e, closestD);
    })
    .on('mouseout', function () {
      bars.attr('opacity', 0.75).attr('fill', COLOR_AADT_BARS);
      points.attr('r', 3).attr('fill', COLOR_TARGET).attr('stroke-width', 1);
      if (typeof _l2HideBarTooltip === 'function') _l2HideBarTooltip();
    });
}

// =============================================================================
//  TOOLTIP AADT/CRASHES
// =============================================================================

let _l2BarTooltip = null;

function _l2ShowCombinedTooltip(e, d) {
  if (!_l2BarTooltip) {
    _l2BarTooltip = d3.select('body').append('div')
      .style('position', 'absolute').style('background', 'rgba(255, 255, 255, 0.95)')
      .style('border', '1px solid #d0d5dd').style('border-radius', '6px').style('padding', '6px 10px')
      .style('pointer-events', 'none').style('font-size', '11px').style('font-family', 'Inter, sans-serif')
      .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10000).style('display', 'none');
  }
  _l2BarTooltip.html(`
    <div style="font-weight:700; margin-bottom:4px;">Year: ${d.year}</div>
    <div>AADT: <span style="font-weight:600; color: ${COLOR_AADT_BARS};">${Math.round(d.aadt).toLocaleString()}</span></div>
    <div>Crashes: <span style="font-weight:600; color: ${COLOR_TARGET};">${d.crashes.toLocaleString()}</span></div>
  `);
  _l2BarTooltip.style('display', 'block');
  const ttWidth = _l2BarTooltip.node().offsetWidth;
  let leftPos = e.pageX + 15;
  if (leftPos + ttWidth > window.innerWidth - 10) leftPos = e.pageX - ttWidth - 15;
  _l2BarTooltip.style('left', leftPos + 'px').style('top', (e.pageY - 50) + 'px');
}

function _l2HideBarTooltip() {
  if (_l2BarTooltip) _l2BarTooltip.style('display', 'none');
}
