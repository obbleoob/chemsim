/* ============================================================================
   ChemSim · data/elements.js
   ----------------------------------------------------------------------------
   Shared element table (used by every mode).
   ============================================================================ */
'use strict';

/* ============================================================================
   2. CHEMISTRY DATA TABLES
   ----------------------------------------------------------------------------
   ve      = number of valence electrons of the neutral atom
   en      = Pauling electronegativity
   mass    = standard atomic weight (g/mol)
   period  = row of the periodic table (period 2 atoms can never exceed 8 e⁻)
   covR    = covalent radius in Å (used to build 3D bond lengths)
   color   = label colour on the dark screen
   print   = label colour when exporting with black ink (for white paper)
   ============================================================================ */
const ELEMENTS = {
  H:  { name: 'Hydrogen',   ve: 1, en: 2.20, mass: 1.008,   period: 1, group: 1,  covR: 0.31, color: '#e2e8f0', print: '#222222' },
  B:  { name: 'Boron',      ve: 3, en: 2.04, mass: 10.81,   period: 2, group: 13, covR: 0.84, color: '#fda4af', print: '#be123c' },
  C:  { name: 'Carbon',     ve: 4, en: 2.55, mass: 12.011,  period: 2, group: 14, covR: 0.76, color: '#e6edf3', print: '#111111' },
  N:  { name: 'Nitrogen',   ve: 5, en: 3.04, mass: 14.007,  period: 2, group: 15, covR: 0.71, color: '#7aa7ff', print: '#1d4ed8' },
  O:  { name: 'Oxygen',     ve: 6, en: 3.44, mass: 15.999,  period: 2, group: 16, covR: 0.66, color: '#ff7b7b', print: '#c81e1e' },
  F:  { name: 'Fluorine',   ve: 7, en: 3.98, mass: 18.998,  period: 2, group: 17, covR: 0.57, color: '#86efac', print: '#15803d' },
  Si: { name: 'Silicon',    ve: 4, en: 1.90, mass: 28.085,  period: 3, group: 14, covR: 1.11, color: '#e7c9a9', print: '#7c5c3c' },
  P:  { name: 'Phosphorus', ve: 5, en: 2.19, mass: 30.974,  period: 3, group: 15, covR: 1.07, color: '#fdba74', print: '#c2410c' },
  S:  { name: 'Sulfur',     ve: 6, en: 2.58, mass: 32.06,   period: 3, group: 16, covR: 1.05, color: '#fde047', print: '#a16207' },
  Cl: { name: 'Chlorine',   ve: 7, en: 3.16, mass: 35.45,   period: 3, group: 17, covR: 1.02, color: '#4ade80', print: '#15803d' },
  Br: { name: 'Bromine',    ve: 7, en: 2.96, mass: 79.904,  period: 4, group: 17, covR: 1.20, color: '#f59e7b', print: '#9a3412' },
  I:  { name: 'Iodine',     ve: 7, en: 2.66, mass: 126.904, period: 5, group: 17, covR: 1.39, color: '#d8b4fe', print: '#7e22ce' },
};
