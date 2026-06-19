// =============================================================================
//  STATE — Variabili di stato globale
//  Caricato dopo config.js. Nessuna logica: solo dichiarazioni let/const.
//  Ogni modulo che modifica questi valori li legge/scrive direttamente.
// =============================================================================

// ── MAPPA ────────────────────────────────────────────────────────────────────
let allGeoJsonData = null;     // GeoJSON completo della rete stradale
let allGeoProps    = null;     // Array di features (per calcolo breakpoint)
let bgLayer        = null;     // Layer Leaflet: rete di sfondo colorata
let selOutlineLayer = null;    // Layer Leaflet: contorno bianco selezione
let selColorLayer   = null;    // Layer Leaflet: segmenti colorati per gruppo/var
let bgLayerVisible  = false;   // true = network visibile
let lastActiveIds   = null;    // Set<RCSTA> degli ID attivi all'ultimo update
let activeVarIdx    = 0;       // Indice corrente in VAR_CONFIG per la colorazione
const _breakCache   = {};      // Cache dei breakpoint quintile per variabile

// ── PARALLEL COORDINATES (PCP) ───────────────────────────────────────────────
let pc          = null;    // Istanza ParCoords
let _allPcData  = null;    // Dataset completo alimentato nel PCP
let _pcpDim     = null;    // Dimensione crossfilter RCSTA (treated)
let _pcpDimU    = null;    // Dimensione crossfilter RCSTA (untreated)
let _isBrushingPCP  = false; // true durante un brush attivo sul PCP
let _pcpFadeActive  = false; // true quando Density Curves è attivo

// ── DC.JS / CROSSFILTER ──────────────────────────────────────────────────────
let scatterDimT = null;          // Dim master RCSTA (treated) per orchestrazione
let scatterDimU = null;          // Dim master RCSTA (untreated)
let _uDims      = new Map();     // Mappa chart → dim untreated per sync T→U
let _updateLinkedCharts = null;  // Riferimento all'orchestratore (assegnato in buildCrossfilter)

// ── TIMELINE ─────────────────────────────────────────────────────────────────
let currentYearMin  = null;
let currentYearMax  = null;
let globalYearMin   = 2015;
let globalYearMax   = 2022;
let globalMasterData = null;   // Dataset master (tutti gli anni correnti)

// ── LEVEL 1 ──────────────────────────────────────────────────────────────────
let _currentL1RCSTAs = null;   // Set<RCSTA> del gruppo L1 corrente (null = L0)
let _intDimTRef      = null;   // Riferimento alla dim intervento (per resetFilters)
let _tableSortCol    = 'doi';
let _tableSortAsc    = false;
let _NUM_COLS = [
  'install_year', 'crashes_pre_norm_1y', 'reduction_norm_aadt_1y',
  'reduction_norm_1y', 'severity_index_pre_1y', 'doi'
];
let _l1Data     = null;   // Dataset corrente L1
let _scatterSvg  = null;  // Riferimento SVG scatter L1
let _scatterDots = null;  // Selezione D3 dei dot scatter

// ── HIGHLIGHT BIDIREZIONALE ───────────────────────────────────────────────────
const _dotIndex      = new Map(); // RCSTA → array di elementi SVG (scatter)
const _rowIndex      = new Map(); // RCSTA → array di TR (tabella)
const _l1LayerIndex  = new Map(); // RCSTA → layer Leaflet (mappa L1)
let _highlightedRCSTA = null;     // RCSTA attualmente hovered
let _highlightedExact = null;     // Record esatto hovered (per multi-intervento)
let _lockedRCSTA      = null;     // RCSTA bloccato via click
let _lockedExact      = null;     // Record esatto bloccato

// ── LEVEL 2 (usato anche da map.js) ──────────────────────────────────────────
let _inL2 = false;   // true quando siamo in Level 2 (usato da map.js e updateLegend)

// ── MAP COLORING FLAGS ────────────────────────────────────────────────────────
let mapColorByGroup = true;  // true = colorazione per gruppo (default)
let mapColorNone    = false; // true = colorazione disabilitata (usato in L2)
