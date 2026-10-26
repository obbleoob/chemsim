/* ============================================================================
   ChemSim · studio/export.js
   ----------------------------------------------------------------------------
   PNG export with a transparent background.
   ============================================================================ */
'use strict';

/* ============================================================================
   17. PNG EXPORT (transparent background)
   ============================================================================ */
function fileBaseName() {
  const f = state.analysis ? hillFormula(state.analysis.counts, state.analysis.netCharge).text : 'molecule';
  return (f || 'molecule').replace(/[^A-Za-z0-9+-]/g, '');
}

function downloadDataUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportPNG() {
  if (!state.atoms.length) { toast('Nothing to export yet'); return; }
  const ink = $('export-ink').value;          // 'dark' (black ink) or 'light'
  const L = computeLayout(state.analysis);
  const pts = [...state.atoms, ...L.virtualH];
  (state.arrows || []).forEach((ar) => { const q = arrowCurve(ar, L); if (q) pts.push(q.p0, q.p1, bez(q, 0.5)); });
  const pad = 34;
  const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const S = 4;                                // 4× resolution for crisp printing
  const off = document.createElement('canvas');
  off.width = Math.ceil((maxX - minX) * S);
  off.height = Math.ceil((maxY - minY) * S);
  const c = off.getContext('2d');             // starts fully transparent
  c.setTransform(S, 0, 0, S, -minX * S, -minY * S);
  drawMolecule(c, L, THEMES[ink], false);
  const url = off.toDataURL('image/png');
  downloadDataUrl(url, fileBaseName() + '.png');
  log('export', `Exported PNG ${off.width}×${off.height}px with ${ink === 'dark' ? 'black' : 'white'} ink`);
  toast('PNG saved (transparent background) ⬇');
}
