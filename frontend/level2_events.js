// =============================================================================
//  LEVEL 2 – EVENTS: Heatmap, Radar, Barplot, Scatter Temporale
//  Estratto da level2.js (righe 1549-2281) + temp_scatter.js.
//  Dipende da: config.js, state.js, level2_core.js (_l2TargetData, _l2TargetEventData, etc.)
// =============================================================================

// =============================================================================
//  FETCH E ROUTING EVENTI
// =============================================================================

function _l2FetchNeighborsEvents(activeRcstasArray) {
  if (!_l2TargetData) return;
  const neighborsOnly = activeRcstasArray.filter(r => r !== _l2TargetData.rcsta);

  if (!neighborsOnly.length) {
    _l2NeighborsEventData = null;
    _l2IsFetchingNeighbors = false;
    _l2RenderSelectedEventChart();
    return;
  }

  const p = _l2GetParams();
  const payload = {
    rcstas:        neighborsOnly,
    install_year:  _l2TargetData.installYear,
    install_month: _l2TargetData.installMonth,
    time_window:   p.time_window
  };

  _l2IsFetchingNeighbors = true;
  _l2RenderSelectedEventChart();

  fetch('http://localhost:5000/api/level2/events/group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => { _l2NeighborsEventData = data; _l2IsFetchingNeighbors = false; _l2RenderSelectedEventChart(); })
    .catch(err => { console.error('Neighbors events fetch error:', err); _l2IsFetchingNeighbors = false; _l2RenderSelectedEventChart(); });
}

function _l2RenderEventCharts(data) {
  _l2TargetEventData = data;
  _l2RenderSelectedEventChart();
}

function _l2RenderSelectedEventChart() {
  const container = document.getElementById('l2-events-chart-container');
  const sel = document.getElementById('l2-events-select');
  if (!container || !sel) return;

  if (_l2IsFetchingNeighbors) {
    container.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; height:100%; flex-direction:column;">
        <div class="l2-loading-inner">
          <div class="l2-spinner"></div>
          <span class="l2-loading-text">Computing...</span>
        </div>
      </div>
    `;
    return;
  }

  const targetData = _l2TargetEventData;
  const groupData  = _l2NeighborsEventData;

  if (!targetData || !targetData.Pre || !targetData.Post) {
    container.innerHTML = `<div style="color:#888; font-size:11px; text-align:center; padding:10px;">No events found</div>`;
    return;
  }

  let nNeighbors = 1;
  if (window._l2ActiveRcstas) nNeighbors = Math.max(1, window._l2ActiveRcstas.size - 1);

  const key = sel.value;
  if (key === 'time_heatmap') { _l2DrawTimeHeatmapToggle('l2-events-chart-container', targetData, groupData); return; }
  if (key === 'victim_type')  { _l2DrawVictimTypeBarplotCombined('l2-events-chart-container', targetData, groupData, nNeighbors); return; }
  if (key === 'crash_type')   { _l2DrawCrashTypeRadarCombined('l2-events-chart-container', targetData, groupData, nNeighbors); return; }
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('l2-events-select');
  if (sel) sel.addEventListener('change', _l2RenderSelectedEventChart);
});

// =============================================================================
//  TIME HEATMAP CON TOGGLE TARGET/GROUP + COMPACT/EXPAND
// =============================================================================

function _l2DrawTimeHeatmapToggle(containerId, tData, gData) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  // ── Header: segmented pill + expand icon in a single row ──────────────────
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:6px;';

  // Segmented pill control (Target | Group)
  const pill = document.createElement('div');
  pill.style.cssText = [
    'display:flex; align-items:center;',
    'background:#f1f5f9; border-radius:20px;',
    'border:1px solid #e2e8f0; padding:2px; gap:2px;',
    'box-shadow:inset 0 1px 2px rgba(0,0,0,0.06);'
  ].join('');

  const mkTab = (label) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.tab = label;
    Object.assign(btn.style, {
      fontSize: '11px', fontWeight: '600', padding: '3px 14px',
      borderRadius: '18px', border: 'none', cursor: 'pointer',
      transition: 'all 0.18s ease', background: 'transparent', color: '#64748b'
    });
    return btn;
  };
  const tabTarget = mkTab('Target');
  const tabGroup  = mkTab('Group');
  pill.appendChild(tabTarget);
  pill.appendChild(tabGroup);

  const setActiveTab = (isGroup) => {
    const active   = isGroup ? tabGroup  : tabTarget;
    const inactive = isGroup ? tabTarget : tabGroup;
    Object.assign(active.style,   { background: '#ffffff', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' });
    Object.assign(inactive.style, { background: 'transparent', color: '#64748b', boxShadow: 'none' });
  };

  // Expand/Compact icon button
  if (window._l2TimeHeatmapExpanded === undefined) window._l2TimeHeatmapExpanded = false;
  const expandBtn = document.createElement('button');
  const expandIcon = () => window._l2TimeHeatmapExpanded ? '⊟ Compact' : '⊞ Expand';
  expandBtn.innerHTML = expandIcon();
  Object.assign(expandBtn.style, {
    fontSize: '10px', padding: '3px 9px', cursor: 'pointer',
    borderRadius: '12px', border: '1px solid #e2e8f0',
    background: 'transparent', color: '#94a3b8', fontWeight: '500',
    transition: 'all 0.15s ease', lineHeight: '1.2'
  });
  expandBtn.onmouseover = () => Object.assign(expandBtn.style, { background: '#f8fafc', color: '#475569', borderColor: '#cbd5e1' });
  expandBtn.onmouseout  = () => Object.assign(expandBtn.style, { background: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0' });

  topBar.appendChild(pill);

  // Similarity placeholder — centrato nella topBar
  const simContainer = document.createElement('div');
  Object.assign(simContainer.style, { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  topBar.appendChild(simContainer);

  topBar.appendChild(expandBtn);

  const chartWrapper = document.createElement('div');
  Object.assign(chartWrapper.style, { flex: '1', width: '100%', display: 'flex', flexDirection: 'row' });
  chartWrapper.id = containerId + '-inner';

  container.appendChild(topBar);
  container.appendChild(chartWrapper);
  container.style.flexDirection = 'column';

  window._l2TimeHeatmapIsGroup = window._l2TimeHeatmapIsGroup || false;

  const drawCurrent = () => {
    setActiveTab(window._l2TimeHeatmapIsGroup);
    const preScatter  = window._l2TimeHeatmapIsGroup ? (gData ? gData.Pre.scatter  : []) : (tData ? tData.Pre.scatter : []);
    const postScatter = window._l2TimeHeatmapIsGroup ? (gData ? gData.Post.scatter : []) : (tData ? tData.Post.scatter : []);
    _l2DrawTimeHeatmap(chartWrapper.id, preScatter || [], postScatter || [], window._l2TimeHeatmapExpanded, window._l2TimeHeatmapIsGroup, simContainer);
  };

  tabTarget.addEventListener('click', () => { window._l2TimeHeatmapIsGroup = false; drawCurrent(); });
  tabGroup.addEventListener('click',  () => { window._l2TimeHeatmapIsGroup = true;  drawCurrent(); });
  expandBtn.addEventListener('click', () => {
    window._l2TimeHeatmapExpanded = !window._l2TimeHeatmapExpanded;
    expandBtn.innerHTML = expandIcon();
    drawCurrent();
  });

  drawCurrent();
}

// =============================================================================
//  TIME HEATMAP (Pre + Post, side-by-side)
// =============================================================================

function _l2CreateSimilarityBar(similarity, isSmall = false) {
  const simColorScale = d3.scaleQuantize().domain([0, 1]).range(COLORS_SIMILARITY);
  const color = simColorScale(similarity);
  const val = similarity.toFixed(2);
  const barMaxW = isSmall ? 30 : 50;
  const barW = Math.max(2, similarity * barMaxW);
  const pad = isSmall ? '1px 4px' : '2px 6px';
  const fontS = isSmall ? '8px' : '9px';
  const h = isSmall ? '4px' : '6px';
  
  return `
    <div title="Similarity (Pre vs Post)" style="display:flex; flex-direction:row; align-items:center; gap:4px; margin-left: ${isSmall ? '4px' : '12px'}; cursor:default; background: #f8fafc; padding: ${pad}; border-radius: 4px; border: 1px solid #e2e8f0;">
      <span style="font-size:${fontS}; font-weight:700; color:#475569; line-height:1;">${val}</span>
      <div style="width:${barMaxW}px; height:${h}; background:#e2e8f0; border-radius:2px; overflow:hidden;">
        <div style="width:${barW}px; height:100%; background:${color}; border-radius:2px;"></div>
      </div>
    </div>
  `;
}

function _l2DrawTimeHeatmap(containerId, preData, postData, isExpanded, isGroup = false, simContainer = null) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Object.assign(container.style, { display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: '10px', overflow: 'hidden' });

  const divPre  = document.createElement('div');
  const divPost = document.createElement('div');
  divPre.style.flex = divPost.style.flex = '1';
  divPre.style.minWidth = divPost.style.minWidth = '0';
  container.appendChild(divPre);
  container.appendChild(divPost);

  const computeGrid = (scatterData, expandedFlag = isExpanded) => {
    if (expandedFlag) {
      const matrix = Array.from({ length: 7 }, () => Array(12).fill(0));
      (scatterData || []).forEach(d => {
        const dIdx = d.day_of_week, hIdx = Math.floor(d.hour / 2);
        if (dIdx >= 0 && dIdx < 7 && hIdx >= 0 && hIdx < 12) {
          const row = (hIdx - 3 + 12) % 12;
          matrix[dIdx][row] += 1;
        }
      });
      return matrix;
    } else {
      const matrix = Array.from({ length: 2 }, () => Array(3).fill(0));
      (scatterData || []).forEach(d => {
        const dIdx = d.day_of_week, h = d.hour;
        let col = (dIdx < 5) ? 0 : 1; 
        let row = 0;
        if (h >= 6 && h < 14) row = 0;
        else if (h >= 14 && h < 22) row = 1;
        else row = 2; 
        matrix[col][row] += 1;
      });
      return matrix;
    }
  };

  const gridPre = computeGrid(preData);
  const gridPost = computeGrid(postData);

  const globalMaxVal = Math.max(d3.max(gridPre.flat()), d3.max(gridPost.flat()), 1);
  const colorScale = d3.scaleSequential(d3.interpolatePurples).domain([0, globalMaxVal]);

  const parentH = container.parentElement ? container.parentElement.clientHeight : 200;
  const hmH = container.clientHeight > 0 ? container.clientHeight : Math.max(100, parentH - 60);
  divPre.style.height = divPost.style.height = hmH + 'px';

  const drawHeatmap = (targetDiv, grid, title) => {
    const margin = { top: 18, right: 6, bottom: 22, left: isExpanded ? 40 : 75 };
    const divW = targetDiv.clientWidth || 140;
    const divH = targetDiv.clientHeight || hmH;
    const width = divW - margin.left - margin.right;
    const height = divH - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) return;

    const svg = d3.select(targetDiv).append('svg').attr('width', divW).attr('height', divH)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    let cols = isExpanded ? 7 : 2;
    let rows = isExpanded ? 12 : 3;
    let colLabels = isExpanded ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mon-Fri', 'Sat-Sun'];
    let rowLabels = isExpanded ? ['6-8','8-10','10-12','12-14','14-16','16-18','18-20','20-22','22-24','0-2','2-4','4-6'] : ['Morning (6-14)', 'Afternoon (14-22)', 'Night (22-6)'];

    const flatData = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        flatData.push({ col: c, row: r, value: grid[c][r] });
      }
    }

    const x = d3.scaleBand().domain(d3.range(cols)).range([0, width]).padding(0.05);
    const y = d3.scaleBand().domain(d3.range(rows)).range([0, height]).padding(0.05);

    svg.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickSize(0).tickFormat(d => isExpanded ? colLabels[d][0] : colLabels[d]))
      .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', isExpanded ? '8px' : '9px');
    svg.append('g').call(d3.axisLeft(y).tickSize(0).tickFormat(d => rowLabels[d]))
      .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', isExpanded ? '7.5px' : '8px');
    svg.selectAll('.domain').remove();

    svg.append('text').attr('x', width / 2).attr('y', -5).attr('text-anchor', 'middle')
      .style('font-size', '10px').style('font-family', 'Inter, sans-serif').style('font-weight', '700').text(title);
    svg.append('text').attr('x', width / 2).attr('y', height + 17).attr('text-anchor', 'middle')
      .style('font-size', '7.5px').style('fill', '#94a3b8').text('Day of week');

    let ttHeat = d3.select('body').select('#heatmap-tooltip');
    if (ttHeat.empty()) {
      ttHeat = d3.select('body').append('div').attr('id', 'heatmap-tooltip')
        .style('position', 'absolute').style('background', 'rgba(255,255,255,0.97)')
        .style('border', '1px solid #d0d5dd').style('border-radius', '6px').style('padding', '6px 10px')
        .style('pointer-events', 'none').style('font-size', '11px').style('font-family', 'Inter, sans-serif')
        .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10000).style('display', 'none');
    }

    svg.selectAll('.cell').data(flatData).enter().append('rect')
      .attr('x', d => x(d.col)).attr('y', d => y(d.row))
      .attr('width', x.bandwidth()).attr('height', y.bandwidth())
      .attr('fill', d => d.value === 0 ? '#f8fafc' : colorScale(d.value))
      .attr('stroke', '#e2e8f0').attr('rx', 1)
      .on('mouseover', function (e, d) {
        d3.select(this).attr('stroke', '#475569').attr('stroke-width', 1.5);
        ttHeat.html(`<div style="font-weight:700;margin-bottom:4px;">${title}</div><div>Day: <b>${colLabels[d.col]}</b></div><div>Time: <b>${rowLabels[d.row]}</b></div><div>Crashes: <b>${d.value}</b></div>`).style('display', 'block');
      })
      .on('mousemove', function (e) {
        let lp = e.pageX + 15; if (lp + ttHeat.node().offsetWidth > window.innerWidth - 10) lp = e.pageX - ttHeat.node().offsetWidth - 15;
        let tp = e.pageY - 10; if (tp + ttHeat.node().offsetHeight > window.innerHeight - 10) tp = e.pageY - ttHeat.node().offsetHeight - 15;
        ttHeat.style('left', lp + 'px').style('top', tp + 'px');
      })
      .on('mouseout', function () { d3.select(this).attr('stroke', '#e2e8f0').attr('stroke-width', 1); ttHeat.style('display', 'none'); });
  };

  const countPre = preData ? preData.length : 0;
  const countPost = postData ? postData.length : 0;
  drawHeatmap(divPre, gridPre, `Pre (n=${countPre})`);
  drawHeatmap(divPost, gridPost, `Post (n=${countPost})`);

  let sim = 0;
  if (countPre > 0 && countPost > 0) {
    const flatPre = computeGrid(preData, true).flat(), flatPost = computeGrid(postData, true).flat();
    flatPre.forEach((val, i) => sim += Math.min(val / countPre, flatPost[i] / countPost));
  }
  if (simContainer) {
    simContainer.innerHTML = _l2CreateSimilarityBar(sim);
  } else {
    container.style.position = 'relative';
    const simDiv = document.createElement('div');
    Object.assign(simDiv.style, { position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 });
    simDiv.innerHTML = _l2CreateSimilarityBar(sim);
    container.appendChild(simDiv);
  }
}

// =============================================================================
//  VICTIM TYPE BARPLOT
// =============================================================================

function _l2DrawVictimTypeBarplotCombined(containerId, tData, gData, nNeighbors) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  container.style.overflow = 'hidden';
  container.style.display  = 'flex';
  container.style.flexDirection = 'column';

  const categories    = ['Cyclist', 'Motorist', 'Pedestrian'];
  const allCatKeys    = ['Cyclist', 'Motorist', 'Pedestrian', 'Other/Unknown'];

  const tPreObj  = tData.Pre.victim_type  || {};
  const tPostObj = tData.Post.victim_type || {};
  const gPreObj  = gData ? (gData.Pre.victim_type  || {}) : {};
  const gPostObj = gData ? (gData.Post.victim_type || {}) : {};

  let tooltip = d3.select('body').select('#victim-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', 'victim-tooltip')
      .style('position', 'absolute').style('background', 'rgba(255,255,255,0.97)')
      .style('border', '1px solid #d0d5dd').style('border-radius', '6px').style('padding', '6px 10px')
      .style('pointer-events', 'none').style('font-size', '11px').style('font-family', 'Inter, sans-serif')
      .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10000).style('display', 'none');
  }

  const barRow = document.createElement('div');
  barRow.style.display = 'flex';
  barRow.style.flexDirection = 'row';
  barRow.style.flex = '1';
  barRow.style.gap = '8px';
  barRow.style.paddingTop = '4px';
  container.appendChild(barRow);

  const getPrePostMax = (preObj, postObj) => {
    const preKnown  = Math.max(1, categories.reduce((s, c) => s + (preObj[c]  || 0), 0));
    const postKnown = Math.max(1, categories.reduce((s, c) => s + (postObj[c] || 0), 0));
    const arr = categories.map(cat => Math.max((preObj[cat] || 0)/preKnown*100, (postObj[cat] || 0)/postKnown*100));
    return Math.max(...arr, 0);
  };
  const globalMaxY = Math.max(getPrePostMax(tPreObj, tPostObj), getPrePostMax(gPreObj, gPostObj), 1);

  const drawBarplot = (parentEl, preObj, postObj, title, preColor, postColor) => {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { flex: '1', minWidth: '0', height: '100%', display: 'flex', flexDirection: 'column' });
    parentEl.appendChild(wrapper);

    const labelEl = document.createElement('div');
    labelEl.textContent = title;
    Object.assign(labelEl.style, { fontSize: '10px', fontWeight: '700', fontFamily: 'Inter, sans-serif', color: '#334155', marginBottom: '2px', textAlign: 'center' });
    wrapper.appendChild(labelEl);

    const totalPre = allCatKeys.reduce((s, c) => s + (preObj[c] || 0), 0);
    const totalPost = allCatKeys.reduce((s, c) => s + (postObj[c] || 0), 0);

    let sim = 0;
    if (totalPre > 0 && totalPost > 0) {
      allCatKeys.forEach(cat => {
        sim += Math.min((preObj[cat] || 0) / totalPre, (postObj[cat] || 0) / totalPost);
      });
    }

    const legendHtml = document.createElement('div');
    Object.assign(legendHtml.style, { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' });
    legendHtml.innerHTML = `
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; border-radius:2px; background:${preColor}; opacity:1;"></div><span style="font-size:8.5px; font-family:Inter, sans-serif; color:#334155;">Pre (n=${totalPre})</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; border-radius:2px; background:${postColor}; opacity:1;"></div><span style="font-size:8.5px; font-family:Inter, sans-serif; color:#334155;">Post (n=${totalPost})</span></div>
      ${_l2CreateSimilarityBar(sim, true)}
    `;
    wrapper.appendChild(legendHtml);

    const svgWrapper = document.createElement('div');
    svgWrapper.style.flex = '1'; svgWrapper.style.width = '100%';
    wrapper.appendChild(svgWrapper);

    const preKnown  = Math.max(1, categories.reduce((s, c) => s + (preObj[c]  || 0), 0));
    const postKnown = Math.max(1, categories.reduce((s, c) => s + (postObj[c] || 0), 0));

    const dataArr = categories.map(cat => ({
      category: cat,
      Pre: (preObj[cat] || 0) / preKnown * 100,
      Post: (postObj[cat] || 0) / postKnown * 100,
      counts: {
        Pre: preObj[cat] || 0,
        Post: postObj[cat] || 0
      }
    }));

    const cW = (container.clientWidth || 300) / 2 - 4; 
    const cH = Math.max(60, (container.clientHeight || 180) - 65);
    const margin = { top: 15, right: 10, bottom: 20, left: 30 };
    const width  = cW - margin.left - margin.right;
    const height = cH - margin.top  - margin.bottom;
    if (width <= 0 || height <= 0) return;

    const svg = d3.select(svgWrapper).append('svg').attr('width', cW).attr('height', cH)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const subgroups = ['Pre', 'Post'];
    const x0 = d3.scaleBand().domain(categories).range([0, width]).padding(0.2);
    const x1 = d3.scaleBand().domain(subgroups).range([0, x0.bandwidth()]).padding(0.05);
    const y = d3.scaleLinear().domain([0, globalMaxY * 1.15]).range([height, 0]);

    svg.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', '9px');
    
    svg.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(d => d.toFixed(0) + '%'))
      .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', '8px');

    const colors = { 'Pre': preColor, 'Post': postColor };

    const categoryGroups = svg.selectAll('.cat-group').data(dataArr).enter().append('g')
      .attr('class', 'cat-group').attr('transform', d => `translate(${x0(d.category)},0)`);

    categoryGroups.selectAll('.vbar')
      .data(d => subgroups.map(k => ({ key: k, value: d[k], category: d.category, count: d.counts[k] })))
      .enter().append('rect').attr('class', 'vbar')
      .attr('x', d => x1(d.key)).attr('y', d => y(d.value))
      .attr('width', x1.bandwidth()).attr('height', d => Math.max(0, height - y(d.value)))
      .attr('fill', d => colors[d.key]);

    categoryGroups.selectAll('.hover-overlay')
      .data(d => subgroups.map(k => ({ key: k, value: d[k], category: d.category, count: d.counts[k] })))
      .enter().append('rect').attr('class', 'hover-overlay')
      .attr('x', d => x1(d.key)).attr('y', 0).attr('width', x1.bandwidth()).attr('height', height)
      .attr('fill', 'transparent').style('cursor', 'default')
      .on('mouseover', function (e, d) {
        categoryGroups.selectAll('.vbar').filter(b => b.key === d.key && b.category === d.category).attr('opacity', 0.7);
        tooltip.html(`<div style="font-weight:700;margin-bottom:4px;">${title} - ${d.key}</div><div>Victim: <b>${d.category}</b></div><div>Share: <b>${d.value.toFixed(1)}%</b></div><div>Count: <b>${d.count}</b></div>`).style('display', 'block');
      })
      .on('mousemove', function (e) {
        let lp = e.pageX + 15;
        if (lp + tooltip.node().offsetWidth > window.innerWidth - 10) lp = e.pageX - tooltip.node().offsetWidth - 15;
        tooltip.style('left', lp + 'px').style('top', (e.pageY - 10) + 'px');
      })
      .on('mouseout', function (e, d) {
        categoryGroups.selectAll('.vbar').filter(b => b.key === d.key && b.category === d.category).attr('opacity', 1);
        tooltip.style('display', 'none');
      });


  };

  drawBarplot(barRow, tPreObj, tPostObj, 'Target Segment', COLOR_PRE_BARS, COLOR_POST_BARS);
  drawBarplot(barRow, gPreObj, gPostObj, 'Group', COLOR_PRE_BARS, COLOR_POST_BARS);

  const getClassifiedRate = (obj) => {
    const total = allCatKeys.reduce((s, c) => s + (obj[c] || 0), 0);
    const known = categories.reduce((s, c) => s + (obj[c] || 0), 0);
    return total > 0 ? (known / total * 100).toFixed(1) : '0.0';
  };

  const classTPre  = getClassifiedRate(tPreObj);
  const classTPost = getClassifiedRate(tPostObj);
  const classGPre  = getClassifiedRate(gPreObj);
  const classGPost = getClassifiedRate(gPostObj);

  d3.select(container).append('div')
    .style('text-align', 'center').style('font-size', '9px').style('color', '#64748b')
    .style('padding', '4px 0 2px').style('font-family', 'Inter, sans-serif')
    .html(`Classified Data &mdash; Target: Pre <b>${classTPre}%</b> &middot; Post <b>${classTPost}%</b> | Group: Pre <b>${classGPre}%</b> &middot; Post <b>${classGPost}%</b>`);
}

// =============================================================================
//  CRASH TYPE RADAR
// =============================================================================

function _l2DrawCrashTypeRadarCombined(containerId, tData, gData, nNeighbors) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  let tooltip = d3.select('body').select('#radar-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', 'radar-tooltip')
      .style('position', 'absolute').style('background', 'rgba(255,255,255,0.97)')
      .style('border', '1px solid #d0d5dd').style('border-radius', '6px').style('padding', '6px 10px')
      .style('pointer-events', 'none').style('font-size', '11px').style('font-family', 'Inter, sans-serif')
      .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10000).style('display', 'none');
  }

  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  const radarRow = document.createElement('div');
  radarRow.style.display = 'flex';
  radarRow.style.flexDirection = 'row';
  radarRow.style.flex = '1';
  radarRow.style.gap = '4px';
  radarRow.style.paddingTop = '4px';
  container.appendChild(radarRow);

  const axesNames = [
    'Driver Inattention/Distraction', 'Failure to Yield Right-of-Way',
    'Following Too Closely', 'Passing or Lane Usage Improper',
    'Unsafe Speed', 'Backing Unsafely'
  ];
  const shortNames = ['Inattention', 'Yield ROW', 'Following Close', 'Lane Usage', 'Unsafe Speed', 'Backing'];

  const getAggregatedData = obj => {
    obj = obj || {};
    const agg = {};
    axesNames.forEach(a => agg[a] = 0);
    agg['Other/Unknown'] = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (axesNames.includes(k)) agg[k] += v;
      else agg['Other/Unknown'] += v;
    }
    return agg;
  };

  const getKnownTotal = agg => axesNames.reduce((s, k) => s + agg[k], 0);
  const getTotal = agg => getKnownTotal(agg) + agg['Other/Unknown'];

  const toPercent = agg => {
    const tot = Math.max(1, getKnownTotal(agg));
    const out = {};
    axesNames.forEach(k => out[k] = (agg[k] / tot) * 100);
    return out;
  };

  const tPreRaw  = getAggregatedData(tData.Pre.crash_type);
  const tPostRaw = getAggregatedData(tData.Post.crash_type);
  const gPreRaw  = getAggregatedData(gData ? gData.Pre.crash_type  : {});
  const gPostRaw = getAggregatedData(gData ? gData.Post.crash_type : {});

  const tPreAgg  = toPercent(tPreRaw);
  const tPostAgg = toPercent(tPostRaw);
  const gPreAgg  = toPercent(gPreRaw);
  const gPostAgg = toPercent(gPostRaw);

  const drawRadar = (parentEl, datasetPre, datasetPost, rawPre, rawPost, title, preColor, postColor) => {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { flex: '1', minWidth: '0', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' });
    parentEl.appendChild(wrapper);

    const labelEl = document.createElement('div');
    labelEl.textContent = title;
    Object.assign(labelEl.style, { fontSize: '10px', fontWeight: '700', fontFamily: 'Inter, sans-serif', color: '#334155', marginBottom: '2px' });
    wrapper.appendChild(labelEl);

    const totalPre = getTotal(rawPre);
    const totalPost = getTotal(rawPost);

    let sim = 0;
    if (totalPre > 0 && totalPost > 0) {
      [...axesNames, 'Other/Unknown'].forEach(cat => {
        sim += Math.min((rawPre[cat] || 0) / totalPre, (rawPost[cat] || 0) / totalPost);
      });
    }

    const legendHtml = document.createElement('div');
    Object.assign(legendHtml.style, { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' });
    legendHtml.innerHTML = `
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; border-radius:2px; background:${preColor}; opacity:0.85;"></div><span style="font-size:8.5px; font-family:Inter, sans-serif; color:#334155;">Pre (n=${totalPre})</span></div>
      <div style="display:flex; align-items:center; gap:4px;"><div style="width:8px; height:8px; border-radius:2px; background:${postColor}; opacity:0.85;"></div><span style="font-size:8.5px; font-family:Inter, sans-serif; color:#334155;">Post (n=${totalPost})</span></div>
      ${_l2CreateSimilarityBar(sim, true)}
    `;
    wrapper.appendChild(legendHtml);

    const svgWrapper = document.createElement('div');
    svgWrapper.style.flex = '1'; svgWrapper.style.width = '100%';
    wrapper.appendChild(svgWrapper);

    const containerW = container.clientWidth || 300;
    // Riserva spazio per la nota in basso e per la nuova legenda
    const containerH = (container.clientHeight || 200) - 45;
    const W = Math.max(40, containerW / 2 - 8);
    const H = Math.max(40, containerH - 28);
    const labelPad = 8;
    const radius = Math.max(20, Math.min(W / 2 - labelPad - 12, H / 2 - labelPad - 8));
    svgWrapper.style.width = W + 'px'; svgWrapper.style.height = H + 'px';

    const svg = d3.select(svgWrapper).append('svg')
      .attr('width', W).attr('height', H).style('overflow', 'visible')
      .append('g').attr('transform', `translate(${W/2},${H/2})`);

    const preData  = axesNames.map(axis => ({ axis, value: datasetPre[axis]  || 0, count: rawPre[axis] || 0 }));
    const postData = axesNames.map(axis => ({ axis, value: datasetPost[axis] || 0, count: rawPost[axis] || 0 }));
    const maxVal = Math.max(d3.max(preData, d => d.value), d3.max(postData, d => d.value), 1);
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, maxVal]);
    const angleSlice = Math.PI * 2 / axesNames.length;
    const rotationOffset = -Math.PI / 12;

    [0.33, 0.66, 1.0].forEach(f => svg.append('circle').attr('r', rScale(maxVal * f))
      .style('fill', 'none').style('stroke', '#e2e8f0').style('stroke-dasharray', '2,2'));

    axesNames.forEach((name, i) => {
      const angle = angleSlice * i - Math.PI / 2 + rotationOffset;
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);

      svg.append('line').attr('x1', 0).attr('y1', 0)
        .attr('x2', rScale(maxVal) * cosA).attr('y2', rScale(maxVal) * sinA)
        .style('stroke', '#cbd5e1').style('stroke-width', '1px');

      const onMouseOver = e => tooltip.html(`<div style="font-weight:700;margin-bottom:4px;">${name}</div>
          <div>Pre: <b>${preData[i].value.toFixed(1)}%</b></div>
          <div>Post: <b>${postData[i].value.toFixed(1)}%</b></div>`).style('display', 'block');
      const onMouseMove = e => {
        let lp = e.pageX + 15; if (lp + tooltip.node().offsetWidth > window.innerWidth - 10) lp = e.pageX - tooltip.node().offsetWidth - 15;
        let tp = e.pageY - 10; if (tp + tooltip.node().offsetHeight > window.innerHeight - 10) tp = e.pageY - tooltip.node().offsetHeight - 15;
        tooltip.style('left', lp + 'px').style('top', tp + 'px');
      };
      const onMouseOut = () => tooltip.style('display', 'none');

      svg.append('line').attr('x1', 0).attr('y1', 0)
        .attr('x2', rScale(maxVal) * cosA).attr('y2', rScale(maxVal) * sinA)
        .style('stroke', 'transparent').style('stroke-width', '15px').style('cursor', 'default')
        .on('mouseover', onMouseOver).on('mousemove', onMouseMove).on('mouseout', onMouseOut);

      const labelR = radius + labelPad + 2;
      const lx = labelR * cosA, ly = labelR * sinA;
      const anchor = Math.abs(cosA) < 0.15 ? 'middle' : (cosA > 0 ? 'start' : 'end');
      const shortName = shortNames[i];
      const textEl = svg.append('text').attr('x', lx).attr('y', ly)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', sinA < -0.5 ? 'auto' : (sinA > 0.5 ? 'hanging' : 'middle'))
        .style('font-size', '8px').style('font-family', 'Inter, sans-serif').style('fill', '#475569')
        .style('font-weight', '600').style('cursor', 'default')
        .on('mouseover', onMouseOver).on('mousemove', onMouseMove).on('mouseout', onMouseOut);

      const words = shortName.split(' ');
      if (words.length <= 2) {
        textEl.text(shortName);
      } else {
        const mid = Math.ceil(words.length / 2);
        textEl.append('tspan').attr('x', lx).attr('dy', '-0.5em').text(words.slice(0, mid).join(' '));
        textEl.append('tspan').attr('x', lx).attr('dy', '1.1em').text(words.slice(mid).join(' '));
      }
    });

    const radarLine = d3.lineRadial()
      .angle((d, i) => i * angleSlice + rotationOffset).radius(d => rScale(d.value)).curve(d3.curveLinearClosed);

    svg.append('path').datum(preData).attr('d', radarLine)
      .style('fill', preColor).style('fill-opacity', 0.3).style('stroke', preColor).style('stroke-width', 2);
    svg.append('path').datum(postData).attr('d', radarLine)
      .style('fill', postColor).style('fill-opacity', 0.4).style('stroke', postColor).style('stroke-width', 2);


  };

  drawRadar(radarRow, tPreAgg, tPostAgg, tPreRaw, tPostRaw, 'Target Segment', '#bcbddc', '#756bb1');
  drawRadar(radarRow, gPreAgg, gPostAgg, gPreRaw, gPostRaw, 'Group',          '#bcbddc', '#756bb1');

  const getClassifiedRate = (raw) => {
    const tot = getTotal(raw);
    return tot > 0 ? (getKnownTotal(raw) / tot * 100).toFixed(1) : '0.0';
  };

  const classTPre  = getClassifiedRate(tPreRaw);
  const classTPost = getClassifiedRate(tPostRaw);
  const classGPre  = getClassifiedRate(gPreRaw);
  const classGPost = getClassifiedRate(gPostRaw);

  d3.select(container).append('div')
    .style('text-align', 'center').style('font-size', '9px').style('color', '#64748b')
    .style('padding', '4px 0 2px').style('font-family', 'Inter, sans-serif')
    .html(`Classified Data &mdash; Target: Pre <b>${classTPre}%</b> &middot; Post <b>${classTPost}%</b> | Group: Pre <b>${classGPre}%</b> &middot; Post <b>${classGPost}%</b>`);
}



// =============================================================================
//  TIME SCATTER (da temp_scatter.js, integrato qui)
// =============================================================================

function _l2DrawTimeScatterplot(containerId, preData, postData, isTarget) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const margin = { top: 20, right: 20, bottom: 30, left: 35 };
  const width  = container.clientWidth  - margin.left - margin.right;
  const height = container.clientHeight - margin.top  - margin.bottom;

  const svg = d3.select(container).append('svg')
    .attr('width', container.clientWidth).attr('height', container.clientHeight)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().domain([-0.5, 6.5]).range([0, width]);
  const yScale = d3.scaleLinear().domain([-0.5, 23.5]).range([height, 0]);
  const days   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale).tickValues([0,1,2,3,4,5,6]).tickFormat(d => days[d]))
    .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', '9px').style('fill', '#475569');
  svg.append('g')
    .call(d3.axisLeft(yScale).tickValues([0, 6, 12, 18, 23]).tickFormat(d => d + ':00'))
    .selectAll('text').style('font-family', 'Inter, sans-serif').style('font-size', '9px').style('fill', '#475569');

  svg.append('g').attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale).tickValues([0,1,2,3,4,5,6]).tickSize(-height).tickFormat(''))
    .selectAll('line').attr('stroke', '#f1f5f9').attr('stroke-dasharray', '2,2');
  svg.append('g')
    .call(d3.axisLeft(yScale).tickValues(d3.range(0, 24, 3)).tickSize(-width).tickFormat(''))
    .selectAll('line').attr('stroke', '#f1f5f9').attr('stroke-dasharray', '2,2');
  svg.selectAll('.domain').attr('stroke', '#e2e8f0');

  const preColor  = '#94a3b8';
  const postColor = isTarget ? '#ef4444' : '#3b82f6';

  let tooltip = d3.select('body').select('#time-scatter-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('id', 'time-scatter-tooltip')
      .style('position', 'absolute').style('background', 'rgba(255, 255, 255, 0.95)')
      .style('border', '1px solid #d0d5dd').style('border-radius', '6px').style('padding', '6px 10px')
      .style('pointer-events', 'none').style('font-size', '11px').style('font-family', 'Inter, sans-serif')
      .style('box-shadow', '0 4px 6px rgba(0,0,0,0.1)').style('z-index', 10000).style('display', 'none');
  }

  const drawPoints = (dataset, color, label) => {
    svg.selectAll('.dot-' + label).data(dataset).enter().append('circle')
      .attr('class', 'dot-' + label)
      .attr('cx', d => xScale(d.day_of_week + (Math.random() - 0.5) * 0.6))
      .attr('cy', d => yScale(d.hour + (Math.random() - 0.5) * 0.8))
      .attr('r', 3.5).attr('fill', color).attr('opacity', 0.7)
      .attr('stroke', '#fff').attr('stroke-width', 0.5).style('cursor', 'pointer').style('pointer-events', 'all')
      .on('mouseover', function (e, d) {
        d3.select(this).attr('r', 6).attr('opacity', 1).attr('stroke', '#000');
        tooltip.html(`
          <div style="font-weight:700; margin-bottom:4px;">${label} Event</div>
          <div>Date: <b>${d.ts_str}</b></div>
          <div>Time: <b>${d.hour}:00</b> (${days[d.day_of_week]})</div>
          <div style="margin-top:2px;">Type: <b>${d.crash_type}</b></div>
          <div>Victim: <b>${d.victim_type}</b></div>
        `).style('display', 'block');
      })
      .on('mousemove', function (e) {
        let lp = e.pageX + 15;
        if (lp + tooltip.node().offsetWidth > window.innerWidth - 10) lp = e.pageX - tooltip.node().offsetWidth - 15;
        tooltip.style('left', lp + 'px').style('top', (e.pageY - 10) + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', 3.5).attr('opacity', 0.7).attr('stroke', '#fff');
        tooltip.style('display', 'none');
      });
  };

  drawPoints(preData,  preColor,  'Pre');
  drawPoints(postData, postColor, 'Post');

  const legend = svg.append('g').attr('transform', `translate(${width - 40}, 0)`);
  legend.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4).attr('fill', preColor).attr('opacity', 0.8);
  legend.append('text').attr('x', 8).attr('y', 3).text('Pre').style('font-size', '10px').style('font-family', 'Inter, sans-serif').style('fill', '#475569');
  legend.append('circle').attr('cx', 0).attr('cy', 15).attr('r', 4).attr('fill', postColor).attr('opacity', 0.8);
  legend.append('text').attr('x', 8).attr('y', 18).text('Post').style('font-size', '10px').style('font-family', 'Inter, sans-serif').style('fill', '#475569');
}
