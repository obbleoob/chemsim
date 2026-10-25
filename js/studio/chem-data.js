/* ============================================================================
   ChemSim · studio/chem-data.js
   ----------------------------------------------------------------------------
   Molecule Studio constants: toolbar, Gasteiger parameters, VSEPR, drawing sizes.
   ============================================================================ */
'use strict';

// The order of the element buttons in the left toolbar.
const TOOLBAR_ELEMENTS = ['C', 'H', 'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I', 'B', 'Si'];

// Keyboard shortcuts: hover an atom and press the key to change it.
const ELEMENT_KEYS = { c: 'C', h: 'H', n: 'N', o: 'O', p: 'P', s: 'S', f: 'F', l: 'Cl', r: 'Br', i: 'I', b: 'B' };

// Non-metals that by convention "win" the electrons when bonded to H for
// oxidation numbers. (P is less electronegative than H on the Pauling scale,
// 2.19 vs 2.20, but textbooks still give P −3 in PH₃.)
const NONMETALS_OVER_H = new Set(['C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I']);

// Gasteiger–Marsili parameters [a, b, c]: the electronegativity of an atom
// carrying partial charge q is  χ(q) = a + b·q + c·q². Values from Gasteiger &
// Marsili (1980), the same table RDKit uses. They depend on hybridisation.
const GASTEIGER = {
  H:  { any: [7.17, 6.24, -0.56] },
  B:  { any: [5.98, 6.82, 1.605] },
  C:  { sp3: [7.98, 9.18, 1.88], sp2: [8.79, 9.32, 1.51], sp: [10.39, 9.45, 0.73] },
  N:  { sp3: [11.54, 10.82, 1.36], sp2: [12.87, 11.15, 0.85], sp: [15.68, 11.70, -0.27] },
  O:  { sp3: [14.18, 12.92, 1.39], sp2: [17.07, 13.79, 0.47] },
  F:  { any: [14.66, 13.85, 2.31] },
  Si: { any: [7.30, 6.567, 0.657] },
  P:  { any: [8.90, 8.24, 0.96] },
  S:  { sp3: [10.14, 9.13, 1.38], sp2: [10.88, 9.485, 1.325] },
  Cl: { any: [11.00, 9.69, 1.35] },
  Br: { any: [10.08, 8.47, 1.16] },
  I:  { any: [9.90, 7.96, 0.96] },
};

// VSEPR names, indexed by steric number, then by number of lone pairs.
const VSEPR = {
  2: { electron: 'linear', shapes: { 0: 'linear', 1: 'linear' } },
  3: { electron: 'trigonal planar', shapes: { 0: 'trigonal planar', 1: 'bent (~120°)', 2: 'linear' } },
  4: { electron: 'tetrahedral', shapes: { 0: 'tetrahedral', 1: 'trigonal pyramidal', 2: 'bent (~104.5°)', 3: 'linear' } },
  5: { electron: 'trigonal bipyramidal', shapes: { 0: 'trigonal bipyramidal', 1: 'see-saw', 2: 'T-shaped', 3: 'linear' } },
  6: { electron: 'octahedral', shapes: { 0: 'octahedral', 1: 'square pyramidal', 2: 'square planar' } },
};
const HYBRID_BY_SN = { 1: 's', 2: 'sp', 3: 'sp²', 4: 'sp³', 5: 'sp³d', 6: 'sp³d²' };

// Drawing constants (in "world" units: 1 unit = 1 screen pixel at 100% zoom)
const BOND_LEN = 50;      // standard bond length on screen
const LABEL_FONT = 17;    // atom label size
const SUB_FONT = 12;      // subscript size (the 2 in NH₂)
const SNAP_ANGLE = Math.PI / 12;   // drag-to-draw bonds snap to 15° steps

const BOND_TYPES = {
  single: { order: 1, stereo: 0 },
  double: { order: 2, stereo: 0 },
  triple: { order: 3, stereo: 0 },
  wedge:  { order: 1, stereo: 1 },   // 1 = "wedge" in the MOL file format
  dash:   { order: 1, stereo: 6 },   // 6 = "hash" in the MOL file format
};
