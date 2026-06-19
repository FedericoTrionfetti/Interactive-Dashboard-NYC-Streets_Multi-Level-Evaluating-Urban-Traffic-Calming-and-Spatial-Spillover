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
