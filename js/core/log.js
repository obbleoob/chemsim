/* ============================================================================
   ChemSim · core/log.js
   ----------------------------------------------------------------------------
   Coloured console logging used by every mode.
   ============================================================================ */
'use strict';

/* ============================================================================
   1. LOGGING HELPERS
   ----------------------------------------------------------------------------
   Open your browser's developer console (F12, or Cmd+Option+J on a Mac) to
   see these. Each message starts with [ChemSim:area] so you can tell where it
   came from. Set DEBUG = false to silence the chatty ones.
   ============================================================================ */
const DEBUG = true;

function log(area, ...args) {
  if (DEBUG) console.log(`%c[ChemSim:${area}]`, 'color:#22d3ee;font-weight:bold', ...args);
}
function warn(area, ...args) {
  console.warn(`[ChemSim:${area}]`, ...args);
}
function logError(area, ...args) {
  console.error(`[ChemSim:${area}]`, ...args);
}

log('boot', 'Loading ChemSim scripts…');
