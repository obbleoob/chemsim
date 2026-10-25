/* ============================================================================
   ChemSim · studio/state.js
   ----------------------------------------------------------------------------
   The molecule being edited, the current tool, and undo/redo.
   ============================================================================ */
'use strict';

/* ============================================================================
   3. APP STATE & UNDO HISTORY
   ----------------------------------------------------------------------------
   atoms: [{ id, el, x, y, charge }]          (x, y in world units)
   bonds: [{ id, a1, a2, order, stereo }]     (a1 is the narrow end of a wedge)
   ============================================================================ */
const state = {
  atoms: [],
  bonds: [],
  nextId: 1,

  tool: 'atom',         // 'select' | 'erase' | 'atom' | 'bond' | 'ring' | 'charge'
  element: 'C',         // current element for the atom tool
  bondType: 'single',   // current bond for the bond tool
  ringType: '6',
  chargeDelta: 1,

  notation: 'skeletal', // 'skeletal' | 'lewis'
  overlays: { formal: true, ox: false, partial: false, cip: true, lp: false },

  view: { scale: 1.3, x: 0, y: 0 },   // screen = world * scale + (x, y)
  hover: null,          // what the mouse is over: {type:'atom'|'bond'|'vh', ...}
  drag: null,           // current mouse-drag information

  analysis: null,       // result of our own chemistry engine (section 7)
  rd: null,             // result from RDKit (section 8)
  layout: null,         // positions used for the last drawing (section 10)

  undo: [],
  redo: [],
};

function snapshot() {
  return JSON.stringify({ atoms: state.atoms, bonds: state.bonds, nextId: state.nextId });
}
function restore(snap) {
  const s = JSON.parse(snap);
  state.atoms = s.atoms;
  state.bonds = s.bonds;
  state.nextId = s.nextId;
}
/** Call BEFORE changing the molecule so the change can be undone. */
function pushHistory() {
  state.undo.push(snapshot());
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
}
function undo() {
  if (!state.undo.length) { toast('Nothing to undo'); return; }
  state.redo.push(snapshot());
  restore(state.undo.pop());
  log('history', 'Undo. Remaining undo steps:', state.undo.length);
  onMoleculeChanged();
}
function redo() {
  if (!state.redo.length) { toast('Nothing to redo'); return; }
  state.undo.push(snapshot());
  restore(state.redo.pop());
  log('history', 'Redo.');
  onMoleculeChanged();
}
