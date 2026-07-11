// =============================================================================
//  CONFIG — Costanti e configurazione globale
//  Caricato per primo: nessuna dipendenza su altri file JS.
// =============================================================================

// Palette sequenziale ColorBrewer Oranges (5 classi)
const CB_ORANGES = ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603'];

// Colori per i 4 gruppi di segmenti (AT/IT = trattati, AU/IU = non trattati)
const GROUP_COLORS = {
  AT: '#2171b5',   // Active Treated    — CB Blues[7]
  IT: '#9ecae1',   // Inactive Treated  — CB Blues[4]
  AU: '#525252',   // Active Untreated  — CB Greys[7]
  IU: '#bdbdbd',   // Inactive Untreated — CB Greys[3]
  NONE: '#525252', // Untreated puri senza selezione
};

// Variabili disponibili per la colorazione della mappa (dropdown topright)
const VAR_CONFIG = [
  { field: 'length_m',    palette: CB_ORANGES, label: 'Length (m)' },
  { field: 'speed_limit', palette: CB_ORANGES, label: 'Speed Limit (mph)' },
  { field: 'total_lanes', palette: CB_ORANGES, label: 'Total Lanes' },
  { field: 'density',     palette: CB_ORANGES, label: 'Population Density' },
  { field: 'MHI',         palette: CB_ORANGES, label: 'Median Income (MHI)' },
];

// Abbreviazioni per i tipi di intervento (usato nel PCP e nella tabella L1)
const ABBR = {
  'Enhanced_Crossing': 'Enh. Crossing',
  'Speed_Hump':        'Spd. Hump',
  'Traffic_Calming':   'Tr. Calming',
  'Turn_Calming':      'Trn. Calming',
};

// Colore univoco di highlight per hover/selezione (amber) — usato in tutti i livelli
const HIGHLIGHT    = '#f59e0b';
const HIGHLIGHT_L0 = HIGHLIGHT;   // alias per compatibilità
const HIGHLIGHT_L1 = HIGHLIGHT;   // alias per compatibilità

// Stili default e attivi per i punti scatter L1
const DOT_DEFAULT = { r: 5, opacity: '0.8', stroke: '#fff',     sw: '1'   };
const DOT_ACTIVE  = { r: 8, opacity: '1',   stroke: HIGHLIGHT,  sw: '2.5' };

// =============================================================================
//  PALETTE — Colori tematici centralizzati
//  Modificare SOLO qui per cambiare le scale colori della dashboard.
// =============================================================================

// ── Treated / Untreated (PCP, crossfilter, level0) ────────────────────────────
const COLORS_TREATED = {
  selected:   '#1f77b4',   // trattato selezionato (CB Blues)
  unselected: '#8eb1d4',   // trattato non selezionato
};
const COLORS_UNTREATED = {
  selected:   '#555555',   // non trattato selezionato (CB Greys)
  unselected: '#c7c7c7',   // non trattato non selezionato
};

// ── Target segment (giallo) ───────────────────────────────────────────────────
const COLOR_TARGET = '#FFD600';

// ── Level 2 — Variazione Risk Rate (mappa Cohort A) ──────────────────────────
// Positivo = peggioramento (rosso), Negativo = miglioramento (verde)
const COLORS_L2_POSITIVE = ['#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d']; // 0%→25%, 25%→50%, 50%→75%, 75%→100%, >100%
const COLORS_L2_NEGATIVE = ['#c7e9c0', '#a1d99b', '#41ab5d', '#005a32'];             // -25%→0%, -50%→-25%, -75%→-50%, <-75%

// ── Level 2 — Pre / Post period backgrounds (lineplot) ───────────────────────
const COLOR_PRE_PERIOD  = '#bcbddc';   // viola chiaro — finestra Pre
const COLOR_POST_PERIOD = '#756bb1';   // viola scuro  — finestra Post
const COLOR_PRE_BARS    = '#bcbddc';   // colore barre barplot Pre (victim/crash type)
const COLOR_POST_BARS   = '#756bb1';   // colore barre barplot Post

// ── Level 2 — Similarity bar (scala rosa) ────────────────────────────────────
const COLORS_SIMILARITY = ['#fff7f3','#fde0dd','#fcc5c0','#fa9fb5','#f768a1','#dd3497'];

// ── Level 2 — AADT / Crashes in hover tooltip e annual chart ─────────────────
const COLOR_AADT_BARS   = '#94a3b8';   // grigio — barre traffico AADT
const COLOR_CRASHES_LINE = '#3b82f6';  // blu    — linea/punti crashes nel tooltip

// ── Avg Local (lineplot) ──────────────────────────────────────────────────────
const COLOR_AVG_LOCAL = '#1f77b4';     // blu — linea Avg Local nel lineplot L2

