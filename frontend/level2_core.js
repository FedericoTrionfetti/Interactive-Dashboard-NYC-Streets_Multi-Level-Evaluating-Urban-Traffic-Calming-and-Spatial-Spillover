// =============================================================================
//  LEVEL 2 — CORE: Stato, Fetch, Layer Mappa, Crossfilter, Wiring
//  Estratto da level2.js. Si appoggia a level2_timeseries.js e level2_events.js
//  per le parti di visualizzazione.
//  Dipende da: config.js, state.js, map.js, crossfilter.js, level1.js
// =============================================================================

// ── Stato Level 2 ─────────────────────────────────────────────────────────────
let _l2TargetData         = null;  // { rcsta, intervention, installYear, installMonth }
let _l2LayerTarget        = null;  // Leaflet layer: target segment
let _l2LayerCohortA       = null;  // Leaflet layer: Cohort A
let _l2LayerCohortB       = null;  // Leaflet layer: Cohort B
let _l2LayerNearFar       = null;  // Leaflet layer: vicini oltre il raggio (≤1500m)
let _l2RadiusCircle       = null;  // Leaflet buffer: dashed radius
let _l2TimeWindow         = 1;     // anni pre/post
let _l2SavedMapView       = null;  // {center, zoom} salvati per exitL2
let _l2FullData           = null;  // Cache risposta API con radius=1500
let _l2TargetInfoControl  = null;  // Leaflet control per la target info box
let _l2PrevMapColorNone   = false; // stato mapColorNone prima di entrare in L2
let _l2PrevMapColorByGroup = true; // stato mapColorByGroup prima di entrare in L2
let _l2TargetEventData    = null;
let _l2NeighborsEventData = null;
let _l2IsFetchingNeighbors = false;
let _l2NeighborsEventDebounce = null;

// DC charts per Cohort A (dichiarati globalmente, inizializzati prima del primo render)
let ndxA       = null;
let dimARadius = null;
const l2ChartARisk = new dc.BarChart('#l2-chart-a-risk', 'l2Group');
const l2ChartAPre  = new dc.BarChart('#l2-chart-a-pre',  'l2Group');
const l2ChartAPost = new dc.BarChart('#l2-chart-a-post', 'l2Group');

// =============================================================================
//  COLORI
// =============================================================================

// Colore Cohort A in base alla variazione % del risk rate (CB RdYlGn 5 classi)
function cohortAColor(reductionP) {
  if (!isFinite(reductionP)) return '#94a3b8';
  if (reductionP > 100)  return COLORS_L2_POSITIVE[4];
  if (reductionP > 75)   return COLORS_L2_POSITIVE[3];
  if (reductionP > 50)   return COLORS_L2_POSITIVE[2];
  if (reductionP > 25)   return COLORS_L2_POSITIVE[1];
  if (reductionP > 0)    return COLORS_L2_POSITIVE[0];
  if (reductionP >= -25) return COLORS_L2_NEGATIVE[0];
  if (reductionP >= -50) return COLORS_L2_NEGATIVE[1];
  if (reductionP >= -75) return COLORS_L2_NEGATIVE[2];
  return COLORS_L2_NEGATIVE[3];
}

// Colore Cohort B in base alla variazione AADT
function cohortBColor(reductionP) {
  if (!isFinite(reductionP) || reductionP === 0) return '#94a3b8';
  return reductionP < 0 ? '#1a9850' : '#d73027';
}

// =============================================================================
//  PARAMETRI E URL
// =============================================================================

function _l2GetParams() {
  return {
    radius_m:             +document.getElementById('l2-radius-slider').max,
    time_window:          _l2TimeWindow,
    crash_reduction_min:  -9999,
    crash_reduction_max:  9999,
    b_crash_reduction_min: -9999,
    b_crash_reduction_max: 9999,
    aadt_threshold:       5000,
    corr_threshold:       -0.5,
  };
}

function _l2BuildUrl(targetData, params) {
  const p = params || _l2GetParams();
  const base = `http://localhost:5000/api/level2?rcsta=${targetData.rcsta}`
    + `&install_year=${targetData.installYear}&install_month=${targetData.installMonth}`
    + `&intervention=${encodeURIComponent(targetData.intervention || '')}`;
  return `${base}&radius_m=${p.radius_m}&time_window=${p.time_window}`
    + `&crash_reduction_min=${p.crash_reduction_min}&crash_reduction_max=${p.crash_reduction_max}`
    + `&b_crash_reduction_min=${p.b_crash_reduction_min}&b_crash_reduction_max=${p.b_crash_reduction_max}`
    + `&aadt_threshold=${p.aadt_threshold}&corr_threshold=${p.corr_threshold}`;
}

// =============================================================================
//  LAYER MANAGEMENT
// =============================================================================

function _l2ClearLayers() {
  if (_l2LayerTarget)  { map.removeLayer(_l2LayerTarget);  _l2LayerTarget  = null; }
  if (_l2LayerCohortA) { map.removeLayer(_l2LayerCohortA); _l2LayerCohortA = null; }
  if (_l2LayerCohortB) { map.removeLayer(_l2LayerCohortB); _l2LayerCohortB = null; }
  if (_l2LayerNearFar) { map.removeLayer(_l2LayerNearFar); _l2LayerNearFar = null; }
  if (_l2RadiusCircle) { map.removeLayer(_l2RadiusCircle); _l2RadiusCircle = null; }
}

window._l2ToggleNativeLayers = function(show) {
  if (show) {
    if (_l2LayerTarget  && !map.hasLayer(_l2LayerTarget))  _l2LayerTarget.addTo(map);
    if (_l2LayerCohortA && !map.hasLayer(_l2LayerCohortA)) _l2LayerCohortA.addTo(map);
    if (_l2LayerNearFar && !map.hasLayer(_l2LayerNearFar)) _l2LayerNearFar.addTo(map);
    if (_l2LayerCohortB && !map.hasLayer(_l2LayerCohortB)) _l2LayerCohortB.addTo(map);
    if (_l2RadiusCircle && !map.hasLayer(_l2RadiusCircle)) _l2RadiusCircle.addTo(map);
  } else {
    if (_l2LayerTarget  && map.hasLayer(_l2LayerTarget))  map.removeLayer(_l2LayerTarget);
    if (_l2LayerCohortA && map.hasLayer(_l2LayerCohortA)) map.removeLayer(_l2LayerCohortA);
    if (_l2LayerNearFar && map.hasLayer(_l2LayerNearFar)) map.removeLayer(_l2LayerNearFar);
    if (_l2LayerCohortB && map.hasLayer(_l2LayerCohortB)) map.removeLayer(_l2LayerCohortB);
  }
};

// =============================================================================
//  RENDER CLIENT-SIDE (per raggio)
// =============================================================================

function _l2RenderWithRadius(radiusM) {
  if (!_l2FullData || !ndxA) return;

  if (dimARadius) dimARadius.filterRange([0, radiusM + 0.0001]);
  dc.redrawAll('l2Group');

  const aFiltered     = ndxA.allFiltered();
  const aActiveRcstas = new Set(aFiltered.map(f => f.properties.RCSTA));
  const cohortAFeatures = _l2FullData.cohort_a?.features || [];

  const finalActive = new Set();
  if (_l2TargetData) finalActive.add(_l2TargetData.rcsta);
  cohortAFeatures.forEach(f => {
    if (aActiveRcstas.has(f.properties.RCSTA) && (f.properties.distance_m || 0) <= radiusM)
      finalActive.add(f.properties.RCSTA);
  });
  window._l2ActiveRcstas = finalActive;

  clearTimeout(_l2NeighborsEventDebounce);
  _l2NeighborsEventDebounce = setTimeout(() => {
    if (typeof _l2FetchNeighborsEvents === 'function')
      _l2FetchNeighborsEvents(Array.from(finalActive));
  }, 500);

  if (typeof updateMap === 'function' && !mapColorNone) {
    if (typeof buildBgLayer === 'function') buildBgLayer();
    updateMap();
  }

  if (_l2LayerCohortA) { map.removeLayer(_l2LayerCohortA); _l2LayerCohortA = null; }
  if (_l2LayerNearFar) { map.removeLayer(_l2LayerNearFar); _l2LayerNearFar = null; }
  if (_l2LayerCohortB) { map.removeLayer(_l2LayerCohortB); _l2LayerCohortB = null; }

  if (cohortAFeatures.length > 0) {
    _l2LayerCohortA = L.geoJSON({ type: 'FeatureCollection', features: cohortAFeatures }, {
      style: f => {
        const isActive = aActiveRcstas.has(f.properties.RCSTA) && (f.properties.distance_m || 0) <= radiusM;
        return isActive
          ? { color: cohortAColor(f.properties.reduction_norm_aadt), weight: 3, opacity: 0.9, fillOpacity: 0 }
          : { color: '#556080', weight: 3, opacity: 0.35, fillOpacity: 0 };
      },
      renderer: canvasRenderer,
      onEachFeature: (feature, layer) => {
        const isActive = aActiveRcstas.has(feature.properties.RCSTA) && (feature.properties.distance_m || 0) <= radiusM;
        if (isActive) {
          _bindL2Tooltip(layer, feature, 3, 5, 0.9, p => {
            const d   = isFinite(p.reduction_norm_aadt) ? (p.reduction_norm_aadt > 0 ? '+' : '') + p.reduction_norm_aadt.toFixed(1) : '—';
            const pre  = p.risk_rate_pre  != null ? p.risk_rate_pre.toFixed(3)  : '—';
            const post = p.risk_rate_post != null ? p.risk_rate_post.toFixed(3) : '—';

            const getAnnualSparklineSVG = (aadt_arr, cr_arr, ts_arr) => {
              if (!ts_arr || !ts_arr.length) return '';
              const annual = {};
              for (let i = 0; i < ts_arr.length; i++) {
                const y = ts_arr[i].substring(0, 4);
                if (!annual[y]) annual[y] = { aadt: 0, crashes: 0 };
                annual[y].aadt = Math.max(annual[y].aadt, aadt_arr[i] || 0);
                annual[y].crashes += cr_arr[i] || 0;
              }
              const data = Object.keys(annual).sort().map(y => ({ year: y, aadt: annual[y].aadt, crashes: annual[y].crashes }));
              if (!data.length) return '';

              const width = 200, height = 80, pad = { t: 30, b: 15, l: 10, r: 10 };
              const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
              const maxAADT   = Math.max(...data.map(d => d.aadt),   1);
              const maxCrashes = Math.max(...data.map(d => d.crashes), 1);
              const xStep = w / Math.max(data.length, 1);
              const getX  = i => pad.l + i * xStep + xStep / 2;

              let svg = `<svg width="${width}" height="${height}" style="overflow:visible; font-family:sans-serif; margin-top:4px;">`;
              const barW = Math.max(4, Math.min(12, xStep - 2));

              const labels = data.map((d, i) => {
                const px = getX(i);
                const bh = (d.aadt / maxAADT) * h;
                const barY = pad.t + h - bh;
                const py = pad.t + h - (d.crashes / maxCrashes) * h;
                const crashY = py - 6;
                const aadtY  = Math.min(barY - 3, crashY - 10);
                return { px, barY, py, bh, aadtY, crashY, aadtText: d.aadt >= 1000 ? Math.round(d.aadt / 1000) + 'k' : Math.round(d.aadt), crashes: d.crashes, year: d.year.slice(2) };
              });

              labels.forEach(L => {
                svg += `<rect x="${L.px - barW/2}" y="${L.barY}" width="${barW}" height="${L.bh}" fill="${COLOR_AADT_BARS}" opacity="0.8"></rect>`;
                svg += `<text x="${L.px}" y="${pad.t + h + 10}" text-anchor="middle" fill="#475569" font-size="8px">${L.year}</text>`;
                svg += `<text x="${L.px}" y="${L.aadtY}" text-anchor="middle" fill="${COLOR_AADT_BARS}" font-size="7.5px" font-weight="bold">${L.aadtText}</text>`;
              });

              let pathD = '';
              labels.forEach((L, i) => {
                pathD += (i === 0 ? 'M' : 'L') + `${L.px},${L.py} `;
                svg += `<circle cx="${L.px}" cy="${L.py}" r="2.5" fill="${COLOR_CRASHES_LINE}" stroke="#fff" stroke-width="1"></circle>`;
                svg += `<text x="${L.px}" y="${L.crashY}" text-anchor="middle" fill="${COLOR_CRASHES_LINE}" stroke="#000" stroke-width="0.5" paint-order="stroke fill" font-size="8.5px" font-weight="bold">${L.crashes}</text>`;
              });
              svg += `<path d="${pathD}" fill="none" stroke="${COLOR_CRASHES_LINE}" stroke-width="1.5"></path>`;

              if (_l2TargetData) {
                const iy = String(_l2TargetData.installYear);
                let intX = null;
                for (let i = 0; i < data.length; i++) {
                  if (data[i].year === iy) {
                    intX = pad.l + i * xStep + ((_l2TargetData.installMonth - 0.5) / 12) * xStep;
                    break;
                  }
                }
                if (intX !== null)
                  svg += `<line x1="${intX}" y1="-5" x2="${intX}" y2="${pad.t + h}" stroke="#facc15" stroke-width="2" stroke-dasharray="3,3" opacity="0.9"></line>`;
              }
              svg += '</svg>';
              return svg;
            };

            const rName = p.road_name && p.road_name !== 'null' && p.road_name !== 'None' ? p.road_name : 'RCSTA ' + p.RCSTA;
            return `<strong>${rName}</strong>
                    <span class="l2-tt-row">Risk Rate Var. %: <b>${d}</b></span>
                    <span class="l2-tt-row">Pre Risk Rate: ${pre} | Post: ${post}</span>
                    <span class="l2-tt-row">Distance: ${p.distance_m != null ? Math.round(p.distance_m) + ' m' : '—'}</span>
                    <div style="font-size:11px; font-weight:bold; margin-top:8px; display:flex; justify-content:space-between;">
                      <span style="color:${COLOR_CRASHES_LINE};">Crashes</span><span style="color:${COLOR_AADT_BARS};">AADT</span>
                    </div>
                    ${getAnnualSparklineSVG(p.aadt_array, p.ncrashes_array, p.ts_array)}`;
          });
        } else {
          _bindL2Tooltip(layer, feature, 3, 5, 0.35, p => {
            const rName = p.road_name && p.road_name !== 'null' && p.road_name !== 'None' ? p.road_name : 'RCSTA ' + p.RCSTA;
            return `<strong>${rName}</strong><span class="l2-tt-row">Filtered Out (Unselected)</span><span class="l2-tt-row">Distance: ${p.distance_m != null ? Math.round(p.distance_m) + ' m' : '—'}</span>`;
          });
        }
      },
    });
    if (mapColorNone) _l2LayerCohortA.addTo(map);
  }

  const activeACount = cohortAFeatures.filter(f =>
    aActiveRcstas.has(f.properties.RCSTA) && (f.properties.distance_m || 0) <= radiusM
  ).length;
  const countEl = document.getElementById('l2-cohort-a-count');
  if (countEl) countEl.textContent = `${activeACount} segments`;

  if (_l2LayerTarget) _l2LayerTarget.bringToFront();

  if (_l2RadiusCircle) { map.removeLayer(_l2RadiusCircle); _l2RadiusCircle = null; }
  if (_l2FullData?.target?.geometry) {
    const buffered = turf.buffer(_l2FullData.target.geometry, radiusM / 1000, { units: 'kilometers' });
    _l2RadiusCircle = L.geoJSON(buffered, {
      style: { color: '#ffffff', weight: 2, opacity: 0.7, fill: false, dashArray: '8, 6', interactive: false }
    });
    _l2RadiusCircle.addTo(map);
  }

  if (typeof _l2RedrawLineplot === 'function') _l2RedrawLineplot();
}

// =============================================================================
//  LEGENDA
// =============================================================================

function _l2GetLegendHtml() {
  return `
    <div class="legend-title" style="font-size:10.5px; margin-bottom:4px; font-weight:700;">Risk Rate Variation</div>
    <div class="legend-row" style="margin-bottom:3px; font-size:9.5px;"><span class="legend-swatch" style="background:#FFD600;border:1px solid #FFD600;height:7px;"></span>Target segment</div>
    <div style="display:flex; flex-direction:column; gap:0px; margin-bottom: 4px;">
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_POSITIVE[4]};height:7px;"></span>&gt; 100%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_POSITIVE[3]};height:7px;"></span>75% to 100%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_POSITIVE[2]};height:7px;"></span>50% to 75%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_POSITIVE[1]};height:7px;"></span>25% to 50%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_POSITIVE[0]};height:7px;"></span>0% to 25%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_NEGATIVE[0]};height:7px;"></span>-25% to 0%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_NEGATIVE[1]};height:7px;"></span>-50% to -25%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_NEGATIVE[2]};height:7px;"></span>-75% to -50%</div>
      <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:${COLORS_L2_NEGATIVE[3]};height:7px;"></span>-100% to -75%</div>
    </div>
    <div class="legend-row" style="margin-bottom:0; font-size:9.5px;"><span class="legend-swatch" style="background:#556080;opacity:0.35;height:7px;"></span>Filtered out</div>
  `;
}

function _l2UpdateLegend() {
  if (typeof updateLegend === 'function') updateLegend();
}

// =============================================================================
//  INFO BOX TARGET
// =============================================================================

function _l2PopulateInfoBox(targetData, apiInfo, metaInfo) {
  const timeSel = document.getElementById('l2-time-select');
  if (timeSel && apiInfo) {
    const opt2 = timeSel.querySelector('option[value="2"]');
    const opt3 = timeSel.querySelector('option[value="3"]');
    if (opt2) opt2.disabled = !apiInfo.has_2y;
    if (opt3) opt3.disabled = !apiInfo.has_3y;
  }

  const mapInfoEl = document.getElementById('l2-target-map-info-inner');
  if (mapInfoEl) {
    const road     = apiInfo?.road_name || targetData.roadName || '—';
    const preRR    = apiInfo?.crashes_pre_norm_aadt;
    const postRR   = apiInfo?.crashes_post_norm_aadt;
    const redRR_pct = apiInfo?.reduction_norm_aadt_static_pct;
    let riskHtml = '—';
    if (preRR != null && postRR != null && redRR_pct != null && isFinite(redRR_pct)) {
      const pct   = -redRR_pct;
      const color = pct < 0 ? '#1a9850' : '#d73027';
      riskHtml = `<span style="color:${color};font-weight:700">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</span>`;
    }

    let borrowedHtml = '';
    if (metaInfo?.has_borrowed_date) {
      borrowedHtml = `
      <div style="margin-top:6px; font-size:10px; color:#64748b; font-style:italic; line-height:1.2;">
        Distant correlations from previous intervention (${metaInfo.most_recent_borrowed}) due to lack of traffic post-data.
      </div>`;
    }

    mapInfoEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; white-space:nowrap;">
        <span style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#555;">TARGET SEGMENT</span>
        <span style="font-size:13px; font-weight:700; color:#eab308; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${road}">${road}</span>
      </div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:11px; margin-bottom:6px; white-space:nowrap;">
        <div><span style="color:#777;">RCSTA:</span> <span style="font-weight:600; color:#333;">${targetData.rcsta}</span></div>
        <div><span style="color:#777;">Type:</span> <span style="font-weight:600; color:#333;">${targetData.intervention || '—'}</span></div>
        <div><span style="color:#777;">Date:</span> <span style="font-weight:600; color:#333;">${String(targetData.installMonth || 1).padStart(2, '0')}/${targetData.installYear}</span></div>
      </div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:11px; white-space:nowrap;">
        <div><span style="color:#777;">Pre Risk:</span> <span style="font-weight:600; color:#333;">${preRR != null ? preRR.toFixed(4) : '—'}</span></div>
        <div><span style="color:#777;">Post Risk:</span> <span style="font-weight:600; color:#333;">${postRR != null ? postRR.toFixed(4) : '—'}</span></div>
        <div><span style="color:#777;">Var %:</span> ${riskHtml}</div>
      </div>
      ${borrowedHtml}
      <div id="l2-target-events-container" style="width:100%;"></div>
    `;
  }
}

// =============================================================================
//  ENTER / EXIT L2
// =============================================================================

function enterL2(rcsta, intervention, installMonth, installYear, roadName) {
  _l2TargetData = { rcsta, intervention, installMonth, installYear, roadName };

  const l0TimeSel      = document.getElementById('time-window-select');
  const initialTimeWindow = l0TimeSel ? l0TimeSel.value : '1';
  _l2TimeWindow = parseInt(initialTimeWindow, 10);

  _inL2      = true;
  _l2FullData = null;

  _l2PrevMapColorNone    = mapColorNone;
  _l2PrevMapColorByGroup = mapColorByGroup;
  mapColorNone    = true;
  mapColorByGroup = false;

  if (typeof selColorLayer  !== 'undefined' && selColorLayer)  selColorLayer.remove();
  if (typeof selOutlineLayer !== 'undefined' && selOutlineLayer) selOutlineLayer.remove();

  const optNone  = document.getElementById('opt-none');
  const optGroup = document.getElementById('opt-group');
  const sel      = document.getElementById('variable-select');
  if (optNone)  optNone.style.display  = '';
  if (optGroup) optGroup.style.display = 'none';
  if (sel)      sel.value = 'none';

  const mapInfoEl = document.getElementById('l2-target-map-info-inner');
  if (mapInfoEl) {
    mapInfoEl.innerHTML = `
      <div class="l2-info-label">TARGET SEGMENT</div>
      <div class="l2-info-road">${roadName || '—'}</div>
      <div class="l2-info-grid">
        <div class="l2-info-item"><span class="l2-info-key">RCSTA</span><span class="l2-info-val">${rcsta}</span></div>
        <div class="l2-info-item"><span class="l2-info-key">Type</span><span class="l2-info-val">${intervention || '—'}</span></div>
        <div class="l2-info-item"><span class="l2-info-key">Date</span><span class="l2-info-val">${installMonth}/${installYear}</span></div>
        <div class="l2-info-item"><span class="l2-info-key">Risk Rate Var. %</span><span class="l2-info-val" id="l2-crash-delta-map">…</span></div>
      </div>
    `;
  }

  const timeSel = document.getElementById('l2-time-select');
  if (timeSel) {
    timeSel.value = initialTimeWindow;
    Array.from(timeSel.options).forEach(opt => opt.disabled = false);
  }

  _l2SavedMapView = { center: map.getCenter(), zoom: map.getZoom() };

  document.getElementById('pc-panel').style.display           = 'none';
  document.getElementById('l2-filter-panel').style.display    = 'flex';
  document.getElementById('l2-lineplot-panel').style.display  = 'flex';
  document.getElementById('l1-panel').style.display           = 'none';
  document.getElementById('analyze-btn').style.display        = 'none';
  document.getElementById('l1-actions').style.display         = 'none';
  document.getElementById('l2-back-btn').style.display        = '';
  document.getElementById('summary-stats-bar').style.display  = 'none';
  const rph = document.getElementById('l2-right-placeholder');
  if (rph) rph.style.display = 'flex';

  _l2InitialBounds = null;
  ['l2-crash-min','l2-crash-max','l2-b-crash-min','l2-b-crash-max','l2-crash-pre','l2-crash-post','l2-b-crash-pre','l2-b-crash-post'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id.includes('pre'))  { el.min = 0; el.max = 50; el.value = 0; }
      else if (id.includes('post')) { el.min = 0; el.max = 50; el.value = 50; }
      else { el.min = 0; el.max = 0; el.value = 0; }
    }
    const lbl = document.getElementById(id + '-label');
    if (lbl) lbl.textContent = id.includes('pre') ? '0' : (id.includes('post') ? '50' : '0%');
  });

  const radSl  = document.getElementById('l2-radius-slider');
  if (radSl)  { radSl.value = 250; const lbl = document.getElementById('l2-radius-label'); if (lbl) lbl.textContent = '250 m'; }
  const aadtSl = document.getElementById('l2-aadt-thresh');
  if (aadtSl) { aadtSl.value = 5000; const lbl = document.getElementById('l2-aadt-thresh-label'); if (lbl) lbl.textContent = '5,000'; }
  const corrSl = document.getElementById('l2-corr-slider');
  if (corrSl) { corrSl.value = -75; const lbl = document.getElementById('l2-corr-label'); if (lbl) lbl.textContent = '-0.75'; }

  const maSel = document.getElementById('l2-lineplot-ma');
  if (maSel) maSel.value = '12';
  _l2Fetch();
}

function _l2ShowLoading(on) {
  const ov  = document.getElementById('l2-loading-overlay');
  const btn = document.getElementById('l2-apply-btn');
  if (ov)  ov.style.display  = on ? 'flex' : 'none';
  if (btn) btn.disabled = on;
}

// =============================================================================
//  CROSSFILTER L2
// =============================================================================

function _l2BuildCrossfilter(data) {
  if (ndxA) dc.filterAll('l2Group');

  ndxA = crossfilter(data.cohort_a?.features || []);
  dimARadius = ndxA.dimension(f => f.properties.distance_m || 0);

  const configs = [
    { chart: l2ChartARisk, ndx: ndxA, field: 'reduction_norm_aadt', domain: [-100, 100], binSize: 10,  color: '#1f77b4' },
    { chart: l2ChartAPre,  ndx: ndxA, field: 'risk_rate_pre',       domain: [0, 2.00],  binSize: 0.1, color: '#1f77b4' },
    { chart: l2ChartAPost, ndx: ndxA, field: 'risk_rate_post',      domain: [0, 2.00],  binSize: 0.1, color: '#1f77b4' },
  ];

  configs.forEach(cfg => {
    const dim = cfg.ndx.dimension(d => {
      const v = d.properties[cfg.field];
      if (!isFinite(v))        return -9999;
      if (v <= cfg.domain[0])  return cfg.domain[0];
      if (v >= cfg.domain[1])  return cfg.domain[1] - 0.001;
      return v;
    });
    const group = dim.group(v => v === -9999 ? -9999 : Math.floor(v / cfg.binSize) * cfg.binSize);
    const filteredGroup = { all: () => group.all().filter(d => d.key !== -9999) };

    cfg.chart
      .width(320).height(145).useViewBoxResizing(true)
      .margins({ top: 5, right: 10, bottom: 20, left: 35 })
      .dimension(dim).group(filteredGroup)
      .x(d3.scaleLinear().domain(cfg.domain))
      .xUnits(() => Math.ceil((cfg.domain[1] - cfg.domain[0]) / cfg.binSize))
      .elasticY(true).brushOn(true)
      .ordinalColors([cfg.color]).transitionDuration(0);

    cfg.chart.xAxis().ticks(5);
    if (cfg.field === 'reduction_norm_aadt')
      cfg.chart.xAxis().tickFormat(d => d >= 100 ? '>100' : (d <= -100 ? '-100' : d));
    cfg.chart.yAxis().ticks(3);
    cfg.chart._l2Group = group;
  });

  dc.chartRegistry.list('l2Group').forEach(chart => {
    chart.on('pretransition.mean', ch => {
      const g = ch.select('g.chart-body');
      if (g.empty()) return;
      g.selectAll('.mean-line-t').remove();
      const bins  = ch._l2Group.all().filter(d => d.key !== -9999 && d.value > 0);
      if (!bins.length) return;
      const total = d3.sum(bins, d => d.value);
      if (!total) return;
      const meanT = d3.sum(bins, d => d.key * d.value) / total;
      const xSc   = ch.x();
      const effH  = ch.effectiveHeight();
      g.append('line').attr('class', 'mean-line-t')
        .attr('stroke', ch.colors()(0)).attr('stroke-width', 2).style('pointer-events', 'none')
        .attr('x1', xSc(meanT)).attr('x2', xSc(meanT)).attr('y1', 0).attr('y2', effH);
      g.append('text').attr('class', 'mean-line-t')
        .attr('fill', ch.colors()(0)).attr('font-size', '9px').attr('font-weight', 'bold').style('pointer-events', 'none')
        .attr('x', xSc(meanT) + 4).attr('y', 10).text(meanT.toFixed(2));
    });

    chart.on('filtered.radius', () => {
      if (window._l2RenderDebounce) clearTimeout(window._l2RenderDebounce);
      window._l2RenderDebounce = setTimeout(() => {
        const rad = +document.getElementById('l2-radius-slider').value;
        _l2RenderWithRadius(rad);
      }, 50);
    });
  });

  dc.renderAll('l2Group');
}

// =============================================================================
//  FETCH L2
// =============================================================================

function _l2Fetch(skipZoom = false) {
  if (!_l2TargetData) return;
  const params = _l2GetParams();
  const fetchParams = { ...params, radius_m: 1500, aadt_threshold: 5000, corr_threshold: -0.5 };
  const url = _l2BuildUrl(_l2TargetData, fetchParams);
  _l2ShowLoading(true);

  fetch(url)
    .then(r => r.json())
    .then(data => {
      [data.cohort_a, data.cohort_b].forEach(cohort => {
        if (cohort?.features) {
          cohort.features.forEach(f => {
            if (f.properties.reduction_norm_aadt != null && isFinite(f.properties.reduction_norm_aadt))
              f.properties.reduction_norm_aadt = -f.properties.reduction_norm_aadt;
          });
        }
      });
      if (data.target?.properties?.reduction_norm_aadt != null && isFinite(data.target.properties.reduction_norm_aadt))
        data.target.properties.reduction_norm_aadt = -data.target.properties.reduction_norm_aadt;

      _l2FullData = data;

      if (!skipZoom && data.target?.properties?.bbox) {
        const bb  = data.target.properties.bbox;
        const pad = 0.003;
        map.flyToBounds([[bb[0] - pad, bb[1] - pad], [bb[2] + pad, bb[3] + pad]], { duration: 1.0, maxZoom: 18 });
      }

      _l2PopulateInfoBox(_l2TargetData, data.target?.properties, data.meta);
      _l2BuildCrossfilter(data);
      _l2FetchLineplot(_l2TargetData.rcsta);

      if (typeof selColorLayer  !== 'undefined' && selColorLayer)  try { selColorLayer.remove();  } catch (e) {}
      if (typeof selOutlineLayer !== 'undefined' && selOutlineLayer) try { selOutlineLayer.remove(); } catch (e) {}

      // Fetch events per target
      const evUrl = `http://localhost:5000/api/level2/events?rcsta=${_l2TargetData.rcsta}`
        + `&install_year=${_l2TargetData.installYear}&install_month=${_l2TargetData.installMonth}`
        + `&time_window=${fetchParams.time_window}`;
      fetch(evUrl).then(r => r.json()).then(evData => {
        _l2TargetEventData = evData;
        _l2RenderSelectedEventChart();
      }).catch(err => console.error('Events fetch error:', err));

      _l2ClearLayers();
      _buildL2StaticLayers(data);
      _l2RenderWithRadius(+document.getElementById('l2-radius-slider').value);
    })
    .catch(err => console.error('[L2] fetch error:', err))
    .finally(() => _l2ShowLoading(false));
}

// =============================================================================
//  TOOLTIP + LAYER STATICI
// =============================================================================

function _bindL2Tooltip(layer, feature, baseWeight, hoverWeight, opacity, getHtml) {
  const tooltip = document.getElementById('l2-map-tooltip');
  layer.on({
    mouseover: e => {
      tooltip.innerHTML = getHtml(feature.properties);
      tooltip.style.display = 'block';
      tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
      layer.setStyle({ weight: hoverWeight, opacity: 1 });
    },
    mousemove: e => {
      tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    },
    mouseout: () => {
      tooltip.style.display = 'none';
      layer.setStyle({ weight: baseWeight, opacity });
    },
  });
}

function _buildL2StaticLayers(data) {
  if (data.target) {
    _l2LayerTarget = L.geoJSON(data.target, {
      style: { color: '#FFD600', weight: 7, opacity: 1, fillOpacity: 0, dashArray: null },
      renderer: canvasRenderer,
      onEachFeature: (feature, layer) => {
        _bindL2Tooltip(layer, feature, 7, 7, 1, p => {
          return `<strong>${p.road_name || 'RCSTA ' + p.RCSTA}</strong>
                  <span class="l2-tt-row">⭐ TARGET</span>
                  <span class="l2-tt-row">Type: ${p.intervention || '—'}</span>
                  <span class="l2-tt-row">Date: ${p.install_month}/${p.install_year}</span>`;
        });
      },
    }).addTo(map);
  }

  if (data.target?.geometry) {
    const radius   = +document.getElementById('l2-radius-slider').value;
    const buffered = turf.buffer(data.target.geometry, radius / 1000, { units: 'kilometers' });
    _l2RadiusCircle = L.geoJSON(buffered, {
      style: { color: '#ffffff', weight: 2, opacity: 0.7, fill: false, dashArray: '8, 6', interactive: false }
    }).addTo(map);
  }

  _l2UpdateLegend();
}

// =============================================================================
//  EXIT L2
// =============================================================================

function exitL2() {
  _inL2       = false;
  _l2ClearLayers();
  _l2TargetData = null;
  _l2FullData   = null;

  mapColorNone    = _l2PrevMapColorNone    ?? false;
  mapColorByGroup = _l2PrevMapColorByGroup ?? true;

  document.getElementById('l1-panel').style.display           = 'flex';
  document.getElementById('analyze-btn').style.display        = 'none';
  document.getElementById('l1-actions').style.display         = 'flex';
  document.getElementById('l2-back-btn').style.display        = 'none';
  document.getElementById('l2-filter-panel').style.display    = 'none';
  document.getElementById('l2-lineplot-panel').style.display  = 'none';
  document.getElementById('pc-panel').style.display           = '';
  document.getElementById('summary-stats-bar').style.display  = '';
  const rph = document.getElementById('l2-right-placeholder');
  if (rph) rph.style.display = 'none';

  _updateSpilloverBtn();

  const optNone  = document.getElementById('opt-none');
  const optGroup = document.getElementById('opt-group');
  const sel      = document.getElementById('variable-select');
  if (optNone)  optNone.style.display  = 'none';
  if (optGroup) optGroup.style.display = '';
  if (sel) {
    if (mapColorNone)    sel.value = 'none';
    else if (mapColorByGroup) sel.value = 'group';
    else sel.value = String(activeVarIdx);
  }

  if (_l2TargetInfoControl) { _l2TargetInfoControl.remove(); _l2TargetInfoControl = null; }

  if (typeof updateMap === 'function') updateMap();
  if (_l2SavedMapView) {
    map.setView(_l2SavedMapView.center, _l2SavedMapView.zoom);
    _l2SavedMapView = null;
  }

  updateLegend();

  // Restore the highlight on the map if a segment was locked
  if (typeof clearHighlight === 'function') clearHighlight();
  if (typeof highlightRCSTA === 'function' && typeof _lockedRCSTA !== 'undefined' && _lockedRCSTA != null) {
    highlightRCSTA(_lockedRCSTA, typeof _lockedExact !== 'undefined' ? _lockedExact : null);
  }
}

// =============================================================================
//  SPILLOVER BUTTON
// =============================================================================

function _updateSpilloverBtn() {
  const btn = document.getElementById('spillover-btn');
  if (!btn) return;
  if (_lockedRCSTA != null) {
    btn.classList.remove('disabled');
    btn.style.opacity = '1';
    btn.title = '';
    btn.textContent = 'Effectiveness Analysis →';
  } else {
    btn.classList.add('disabled');
    btn.style.opacity = '0.5';
    btn.title = 'Select a segment for the Effectiveness Analysis';
    btn.textContent = 'Select a target segment';
  }
}

// =============================================================================
//  WIRING CONTROLLI L2 (DOMContentLoaded)
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {

  const l2BackBtn = document.getElementById('l2-back-btn');
  if (l2BackBtn) l2BackBtn.addEventListener('click', exitL2);

  const l2MaSel = document.getElementById('l2-lineplot-ma');
  if (l2MaSel) l2MaSel.addEventListener('change', () => { _l2RedrawLineplot(); });

  // Time window select — trigger refetch
  const l2TimeSel = document.getElementById('l2-time-select');
  if (l2TimeSel) {
    l2TimeSel.addEventListener('change', () => {
      if (!_l2TargetData) return;
      _l2TimeWindow = parseInt(l2TimeSel.value, 10);
      _l2Fetch(true);
    });
  }

  // Radius slider — aggiornamento istantaneo client-side
  const radiusSlider = document.getElementById('l2-radius-slider');
  if (radiusSlider) {
    radiusSlider.addEventListener('input', () => {
      const v = +radiusSlider.value;
      document.getElementById('l2-radius-label').textContent = v.toLocaleString() + ' m';
      if (_l2FullData) _l2RenderWithRadius(v);
    });
  }

  // Correlation slider
  const corrSlider = document.getElementById('l2-corr-slider');
  if (corrSlider) {
    corrSlider.addEventListener('input', () => {
      document.getElementById('l2-corr-label').textContent = (+corrSlider.value / 100).toFixed(2);
      if (_l2FullData) _l2RenderWithRadius(+document.getElementById('l2-radius-slider').value);
    });
  }

  // AADT threshold slider
  const aadtThresh = document.getElementById('l2-aadt-thresh');
  if (aadtThresh) {
    aadtThresh.addEventListener('input', () => {
      document.getElementById('l2-aadt-thresh-label').textContent = (+aadtThresh.value).toLocaleString();
      if (_l2FullData) _l2RenderWithRadius(+document.getElementById('l2-radius-slider').value);
    });
  }

  // Crash Δ% sliders
  const crashMin = document.getElementById('l2-crash-min');
  const crashMax = document.getElementById('l2-crash-max');
  if (crashMin) crashMin.addEventListener('input', () => { document.getElementById('l2-crash-min-label').textContent = crashMin.value; });
  if (crashMax) crashMax.addEventListener('input', () => {
    const v = +crashMax.value;
    document.getElementById('l2-crash-max-label').textContent = (v > 0 ? '+' : '') + v;
  });

  // Cohort B Crash Δ% sliders
  const bCrashMin = document.getElementById('l2-b-crash-min');
  const bCrashMax = document.getElementById('l2-b-crash-max');
  if (bCrashMin) bCrashMin.addEventListener('input', () => { document.getElementById('l2-b-crash-min-label').textContent = bCrashMin.value; });
  if (bCrashMax) bCrashMax.addEventListener('input', () => {
    const v = +bCrashMax.value;
    document.getElementById('l2-b-crash-max-label').textContent = (v > 0 ? '+' : '') + v;
  });

  ['l2-crash-pre', 'l2-crash-post'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      const lbl = document.getElementById(id + '-label');
      if (lbl) lbl.textContent = el.value;
    });
  });

  // Spillover button
  const spilloverBtn = document.getElementById('spillover-btn');
  if (spilloverBtn) {
    spilloverBtn.addEventListener('click', () => {
      if (!_lockedRCSTA || !_l1Data) return;
      const locked = _lockedExact || _l1Data.find(d => String(d.RCSTA) === String(_lockedRCSTA));
      if (!locked) return;
      enterL2(locked.RCSTA, locked.intervention || '', locked.install_month || 6, locked.install_year, locked.road_name || '');
    });
  }
});
