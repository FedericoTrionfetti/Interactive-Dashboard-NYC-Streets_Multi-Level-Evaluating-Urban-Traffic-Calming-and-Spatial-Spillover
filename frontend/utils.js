// =============================================================================
//  UTILS — Funzioni di utilità pure
//  Dipende da: nulla (nessuna dipendenza esterna)
// =============================================================================

// Calcola il p-esimo percentile di un array di valori (interpolazione lineare)
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
