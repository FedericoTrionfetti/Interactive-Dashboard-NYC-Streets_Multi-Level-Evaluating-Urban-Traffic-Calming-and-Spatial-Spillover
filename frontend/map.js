// =============================================================================
//  UTILITY GEOSPAZIALI
// =============================================================================

// Estrae e normalizza il valore numerico di un campo dalla feature GeoJSON
function getNumericValue(item, field) {
  const props = item && item.properties ? item.properties : item;
  if (!props) return null;
  const raw = props[field];
  if (field === 'speed_limit') {
    const num = Number(raw);
    if (!Number.isFinite(num) || num === 0 || raw === null || raw === undefined) return 25;
    return num;
  }
  if (field === '_n_interventions' && (raw === null || raw === undefined || raw === '')) return 0;
  if (raw === null || raw === undefined) return null;
  if (field === 'oneway') return (raw === 'Y' || raw === 1 || raw === '1' || raw === true || raw === 'Yes') ? 1 : 0;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return field === '_n_interventions' ? Math.trunc(num) : num;
}

// Associa il valore numerico all'indice della classe quintile
function getQuantileIndex(value, breaks) {
  for (let i = 0; i < 5; i++) {
    if (value <= breaks[i + 1]) return i;
  }
  return 4;
}

// Calcola i breakpoint quintili per una variabile (con cache)
function computeBreaks(features, field) {
  if (_breakCache[field]) return _breakCache[field];

  if (field === 'speed_limit') {
    _breakCache[field] = [10, 15, 25, 35, 45, 55];
    return _breakCache[field];
  }

  const source = Array.isArray(allGeoProps) && allGeoProps.length ? allGeoProps : (features || []);
  const vals = source.map(f => getNumericValue(f, field)).filter(v => v !== null).sort((a, b) => a - b);
  if (!vals.length) { _breakCache[field] = null; return null; }
  const n = vals.length;
  const quantile = p => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    return vals[lo] + (vals[Math.ceil(idx)] - vals[lo]) * (idx - lo);
  };
  _breakCache[field] = [0, 0.2, 0.4, 0.6, 0.8, 1].map(quantile);
  return _breakCache[field];
}

// Mappa un valore numerico al colore della palette in base ai quintili
function getColor(value, breaks, palette) {
  if (value === null || value === undefined || isNaN(+value)) return '#ccc';
  const v = +value;
  for (let i = 0; i < 5; i++) {
    if (v <= breaks[i + 1]) return palette[i];
  }
  return palette[4];
}

// =============================================================================
//  MAPPA LEAFLET
// =============================================================================

const map = L.map('map').setView([40.707, -74], 10);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd', maxZoom: 20
}).addTo(map);

const canvasRenderer = L.canvas({ padding: 0.5 });

// Genera la rete stradale di sfondo colorata per quintili
function buildBgLayer() {
  if (mapColorNone) return; // colorazione disabilitata
  if (bgLayer) map.removeLayer(bgLayer);
  const cfg = VAR_CONFIG[activeVarIdx];

  let baseFeatures = allGeoJsonData.features;
  if (typeof _inL2 !== 'undefined' && _inL2 && window._l2ActiveRcstas) {
    baseFeatures = baseFeatures.filter(f => window._l2ActiveRcstas.has(f.properties.RCSTA));
  }

  const breaks = computeBreaks(allGeoJsonData.features, cfg.field); // Always compute breaks on full dataset for consistent coloring
  bgLayer = L.geoJSON({ type: 'FeatureCollection', features: baseFeatures }, {
    style: feature => {
      if (mapColorByGroup) {
        return { color: GROUP_COLORS.NONE, weight: 1.5, opacity: 0.8, fillOpacity: 0 };
      }
      const val = getNumericValue(feature, cfg.field);
      return { color: breaks ? getColor(val, breaks, cfg.palette) : '#ccc', weight: 1.5, opacity: 0.8, fillOpacity: 0 };
    },
    renderer: canvasRenderer
  });
  if (bgLayerVisible) bgLayer.addTo(map);
  if (selOutlineLayer) { selOutlineLayer.remove(); selOutlineLayer.addTo(map); }
  if (selColorLayer) { selColorLayer.remove(); selColorLayer.addTo(map); }
  updateLegend();
}

// Disegna i livelli di evidenziazione per i segmenti filtrati
function buildSelLayers(features) {
  if (selOutlineLayer) map.removeLayer(selOutlineLayer);
  if (selColorLayer) map.removeLayer(selColorLayer);
  const cfg = VAR_CONFIG[activeVarIdx];
  const breaks = computeBreaks(allGeoJsonData.features, cfg.field);
  selOutlineLayer = L.geoJSON(null, {
    style: { color: '#ffffff', weight: 10, opacity: 0.9, fillOpacity: 0 },
    renderer: canvasRenderer
  }).addTo(map);
  selColorLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: feature => {
      const isActive = !lastActiveIds || lastActiveIds.has(feature.properties.RCSTA);
      const isTreated = feature.properties.treated == true; // eslint-disable-line eqeqeq

      if (!mapColorByGroup) {
        const val = getNumericValue(feature, cfg.field);
        return { color: breaks ? getColor(val, breaks, cfg.palette) : '#ccc', weight: 4, opacity: 1, fillOpacity: 0 };
      }

      if (!isActive && !bgLayerVisible) {
        return { opacity: 0, weight: 0, fillOpacity: 0, color: 'transparent' };
      }

      let color;
      if (isTreated) {
        color = isActive ? GROUP_COLORS.AT : GROUP_COLORS.IT;
      } else {
        color = isActive ? GROUP_COLORS.AU : GROUP_COLORS.IU;
      }
      const weight = isActive ? 4 : 1.5;
      const opacity = isActive ? 0.9 : 0.4;
      return { color, weight, opacity, fillOpacity: 0 };
    },
    renderer: canvasRenderer
  }).addTo(map);
}

// Avvio principale: memorizza i dati e inizializza i layer
function buildMap(geojson) {
  allGeoJsonData = geojson;
  buildBgLayer();
  updateMap();
}

// Aggiorna la mappa: mostra solo i segmenti trattati attivi
function updateMap(activeIds) {
  if (activeIds !== undefined) lastActiveIds = activeIds ? new Set(activeIds) : null;

  const inL2 = typeof _inL2 !== 'undefined' && _inL2;
  const inL1 = typeof _currentL1RCSTAs !== 'undefined' && _currentL1RCSTAs && !inL2;

  if (inL2 && typeof _l2ToggleNativeLayers === 'function') {
    _l2ToggleNativeLayers(mapColorNone);
  }

  if (inL1) {
    if (bgLayerVisible && typeof bgLayer !== 'undefined' && bgLayer) {
      bgLayer.addTo(map);
    }
    if (typeof greyOutMapExcept === 'function') {
      greyOutMapExcept(_currentL1RCSTAs);
      if (mapColorNone) {
        if (selColorLayer) selColorLayer.remove();
        if (selOutlineLayer) selOutlineLayer.remove();
      }
      updateLegend();
    }
    if (highlightMapLayer) highlightMapLayer.bringToFront();
    return;
  }

  if (mapColorNone) return; // colorazione disabilitata, non aggiornare i layer

  const ids = activeIds !== undefined ? activeIds : lastActiveIds;

  let baseFeatures = allGeoJsonData.features;
  if (inL2 && window._l2ActiveRcstas) {
    baseFeatures = baseFeatures.filter(f => window._l2ActiveRcstas.has(f.properties.RCSTA));
  }

  let featuresToDraw = [];
  if (mapColorByGroup) {
    featuresToDraw = baseFeatures.slice().sort((a, b) => {
      const aT = a.properties.treated == true; // eslint-disable-line eqeqeq
      const bT = b.properties.treated == true; // eslint-disable-line eqeqeq
      if (aT !== bT) return aT ? 1 : -1;
      const aA = inL2 ? true : (!ids || ids.has(a.properties.RCSTA));
      const bA = inL2 ? true : (!ids || ids.has(b.properties.RCSTA));
      if (aA !== bA) return aA ? 1 : -1;
      return 0;
    });
  } else {
    featuresToDraw = baseFeatures.filter(f =>
      inL2 ? true : (f.properties.treated == true && (!ids || ids.has(f.properties.RCSTA)))
    );
  }

  buildSelLayers(featuresToDraw);

  if (highlightMapLayer) {
    highlightMapLayer.bringToFront();
  }
}

// Legenda in basso a sinistra
const legendControl = L.control({ position: 'bottomleft' });
legendControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'map-legend');
  div.id = 'map-legend-inner';
  return div;
};
legendControl.addTo(map);

function updateLegend() {
  const div = document.getElementById('map-legend-inner');
  if (!div) return;

  const inL2 = typeof _inL2 !== 'undefined' && _inL2;

  // In L2, mostra la legenda L2 solo se la colorazione è "none" (dropdown = Risk rate variation)
  if (inL2 && mapColorNone && typeof _l2GetLegendHtml === 'function') {
    div.innerHTML = _l2GetLegendHtml();
    return;
  }

  let l1Html = '';
  if (!mapColorNone) {
    if (mapColorByGroup) {
      l1Html = `
        <div class="legend-title">Segments Groups</div>
        <div class="legend-row"><span class="legend-swatch" style="background:${GROUP_COLORS.AT}"></span>Selected treated</div>
        <div class="legend-row"><span class="legend-swatch" style="background:${GROUP_COLORS.IT}"></span>Unselected treated</div>
        <div class="legend-row"><span class="legend-swatch" style="background:${GROUP_COLORS.AU}"></span>Selected untreated</div>
        <div class="legend-row"><span class="legend-swatch" style="background:${GROUP_COLORS.IU}"></span>Unselected untreated</div>
      `;
    } else {
      const cfg = VAR_CONFIG[activeVarIdx];
      const breaks = _breakCache[cfg.field];
      l1Html = `<div class="legend-title">${cfg.label}</div>`;

      if (cfg.field === 'speed_limit') {
        const labels = ['10 - 15', '20 - 25', '30 - 35', '40 - 45', '50 - 55'];
        for (let i = 0; i < 5; i++) {
          l1Html += `<div class="legend-row"><span class="legend-swatch" style="background:${cfg.palette[i]}"></span>${labels[i]}</div>`;
        }
      } else if (breaks && allGeoJsonData) {
        const isInt = ['total_lanes'].includes(cfg.field);
        const fmt = v => isInt ? v.toFixed(0) : v.toFixed(2);
        const bins = Array.from({ length: 5 }, () => ({ min: Infinity, max: -Infinity }));
        allGeoJsonData.features.forEach(feature => {
          const v = getNumericValue(feature, cfg.field);
          if (v === null) return;
          const idx = getQuantileIndex(v, breaks);
          bins[idx].min = Math.min(bins[idx].min, v);
          bins[idx].max = Math.max(bins[idx].max, v);
        });

        for (let i = 0; i < 5; i++) {
          let label = 'N/A';
          if (bins[i].min !== Infinity) {
            label = `${fmt(bins[i].min)} &ndash; ${fmt(bins[i].max)}`;
          }
          l1Html += `<div class="legend-row"><span class="legend-swatch" style="background:${cfg.palette[i]}"></span>${label}</div>`;
        }
      }
    }
  }

  div.innerHTML = l1Html || `<div class="legend-title" style="color:#888">Coloring: None</div>`;
}

// Controllo "Show/Hide network"
const toggleControl = L.control({ position: 'topleft' });
toggleControl.onAdd = function () {
  const btn = L.DomUtil.create('button', 'map-overlay-btn');
  btn.id = 'network-toggle-btn';
  btn.textContent = 'Show network';
  L.DomEvent.disableClickPropagation(btn);
  btn.addEventListener('click', () => {
    bgLayerVisible = !bgLayerVisible;
    if (bgLayerVisible) {
      bgLayer.addTo(map);
      if (selOutlineLayer) { selOutlineLayer.remove(); selOutlineLayer.addTo(map); }
      if (selColorLayer) { selColorLayer.remove(); selColorLayer.addTo(map); }
      btn.textContent = 'Hide network';
    } else {
      bgLayer.remove();
      btn.textContent = 'Show network';
    }
    if (typeof _currentL1RCSTAs !== 'undefined' && _currentL1RCSTAs != null) {
      greyOutMapExcept(_currentL1RCSTAs);
    } else {
      updateMap(); // forza il ricalcolo di selColorLayer al Level 0
    }
  });
  return btn;
};
toggleControl.addTo(map);

// Menu a discesa per selezionare la metrica cromatica
const dropdownControl = L.control({ position: 'topright' });
dropdownControl.onAdd = function () {
  const wrap = L.DomUtil.create('div', 'map-overlay-select-wrap');
  const select = L.DomUtil.create('select', 'map-overlay-select', wrap);
  select.id = 'variable-select';

  // Opzione "None" per nascondere la colorazione
  const optNone = document.createElement('option');
  optNone.value = 'none';
  optNone.id = 'opt-none';
  optNone.textContent = 'Risk rate variation';
  optNone.style.display = 'none'; // Only visible in L2
  select.appendChild(optNone);

  const optGroup = document.createElement('option');
  optGroup.value = 'group';
  optGroup.id = 'opt-group';
  optGroup.textContent = 'Segments Groups';
  if (mapColorByGroup) optGroup.selected = true;
  select.appendChild(optGroup);

  VAR_CONFIG.forEach((cfg, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = cfg.label;
    if (!mapColorByGroup && idx === activeVarIdx) opt.selected = true;
    select.appendChild(opt);
  });
  L.DomEvent.disableClickPropagation(wrap);
  L.DomEvent.disableScrollPropagation(wrap);
  select.addEventListener('change', () => {
    if (select.value === 'none') {
      mapColorNone = true;
      mapColorByGroup = false;
      // Nascondi tutti i layer colorati
      if (bgLayer) bgLayer.remove();
      if (selColorLayer) selColorLayer.remove();
      if (selOutlineLayer) selOutlineLayer.remove();
      updateLegend();
      if (typeof _inL2 !== 'undefined' && _inL2 && typeof _l2ToggleNativeLayers === 'function') {
        _l2ToggleNativeLayers(true);
      }
      return;
    }
    mapColorNone = false;
    if (select.value === 'group') {
      mapColorByGroup = true;
    } else {
      mapColorByGroup = false;
      activeVarIdx = +select.value;
    }
    buildBgLayer();
    updateMap();
  });
  return wrap;
};
dropdownControl.addTo(map);

// Livello per gli highlight temporanei (es. hover da L0)
let highlightMapLayer = null;

function highlightMapFeatures(features) {
  if (highlightMapLayer) map.removeLayer(highlightMapLayer);
  if (!features || features.length === 0) return;
  highlightMapLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: { color: '#ef4444', weight: 6, opacity: 1, fillOpacity: 0 },
    renderer: canvasRenderer
  }).addTo(map);
  highlightMapLayer.bringToFront();
}

function clearMapHighlight() {
  if (highlightMapLayer) {
    map.removeLayer(highlightMapLayer);
    highlightMapLayer = null;
  }
}

// Deselect on empty map click
map.on('click', function(e) {
  if (window._justClickedMapFeature) return;
  if (typeof _inL2 !== 'undefined' && _inL2) return;
  if (typeof _currentL1RCSTAs !== 'undefined' && _currentL1RCSTAs != null) {
    if (typeof _lockedRCSTA !== 'undefined' && _lockedRCSTA != null) {
      _lockedRCSTA = null; 
      _lockedExact = null;
      if (typeof clearHighlight === 'function') clearHighlight();
    }
  }
});
