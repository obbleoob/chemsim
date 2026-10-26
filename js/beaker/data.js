/* ============================================================================
   ChemSim · beaker/data.js
   ----------------------------------------------------------------------------
   All the chemistry data the Beaker Lab uses. The simulation (sim.js) and the
   equilibrium solver (solver.js) contain NO chemistry of their own: they read
   it all from here, so you can extend the lab by adding rows below.

   Conventions
   • Concentrations in mol/L, enthalpies in kJ/mol, 25 °C standard values.
   • ΔHf° values: NBS / CRC Handbook standard enthalpies of formation
     (aqueous ions on the H⁺ = 0 convention).
   • Equilibrium constants: standard 25 °C values (Smith & Martell, CRC).
     The solver treats solutions as ideal (concentration ≈ activity), which is
     good to roughly ±0.2 pH units below ~0.5 M.

   "Components" are the building blocks the solver keeps track of (Na⁺, Cl⁻,
   CO₃²⁻, NH₃, …) plus H⁺. Every other dissolved species is written as made
   from components:
       species = Σ a·component + h·H⁺ − w·H₂O … with formation constant logK
   e.g. OH⁻ = H₂O − H⁺  →  h = −1, w = 1, logK = −pKw
        HCO₃⁻ = CO₃²⁻ + H⁺  →  h = 1, logK = 10.33
   ============================================================================ */
'use strict';

const BeakerData = (() => {
  const DHF_WATER = -285.83;     // ΔHf° of liquid water
  const DHF_H = 0;               // ΔHf° of H⁺(aq) by convention

  /* ---------------- components ---------------- */
  // key: { label, z (charge), dHf, M (g/mol, for display) }
  const COMPONENTS = {
    Na:   { label: 'Na⁺',     z: 1,  dHf: -240.1 },
    K:    { label: 'K⁺',      z: 1,  dHf: -252.4 },
    Li:   { label: 'Li⁺',     z: 1,  dHf: -278.5 },
    NH3:  { label: 'NH₃',     z: 0,  dHf: -80.3 },
    Ca:   { label: 'Ca²⁺',    z: 2,  dHf: -542.8 },
    Mg:   { label: 'Mg²⁺',    z: 2,  dHf: -466.9 },
    Ba:   { label: 'Ba²⁺',    z: 2,  dHf: -537.6 },
    Sr:   { label: 'Sr²⁺',    z: 2,  dHf: -545.8 },
    Cu:   { label: 'Cu²⁺',    z: 2,  dHf: 64.8,   color: [0.62, 0.80, 1.0], ref: 0.1 },
    Zn:   { label: 'Zn²⁺',    z: 2,  dHf: -153.9 },
    Fe2:  { label: 'Fe²⁺',    z: 2,  dHf: -89.1,  color: [0.85, 1.0, 0.85], ref: 0.1 },
    Fe3:  { label: 'Fe³⁺',    z: 3,  dHf: -48.5,  color: [1.0, 0.86, 0.45], ref: 0.1 },
    Al:   { label: 'Al³⁺',    z: 3,  dHf: -531.0 },
    Ag:   { label: 'Ag⁺',     z: 1,  dHf: 105.6 },
    Pb:   { label: 'Pb²⁺',    z: 2,  dHf: -1.7 },
    Co:   { label: 'Co²⁺',    z: 2,  dHf: -58.2,  color: [1.0, 0.72, 0.80], ref: 0.1 },
    Ni:   { label: 'Ni²⁺',    z: 2,  dHf: -54.0,  color: [0.70, 0.95, 0.70], ref: 0.1 },
    Mn:   { label: 'Mn²⁺',    z: 2,  dHf: -220.8 },
    Cl:   { label: 'Cl⁻',     z: -1, dHf: -167.2 },
    Br:   { label: 'Br⁻',     z: -1, dHf: -121.6 },
    I:    { label: 'I⁻',      z: -1, dHf: -55.2 },
    F:    { label: 'F⁻',      z: -1, dHf: -332.6 },
    NO3:  { label: 'NO₃⁻',    z: -1, dHf: -207.4 },
    SO4:  { label: 'SO₄²⁻',   z: -2, dHf: -909.3 },
    CO3:  { label: 'CO₃²⁻',   z: -2, dHf: -677.1 },
    PO4:  { label: 'PO₄³⁻',   z: -3, dHf: -1277.4 },
    Ac:   { label: 'CH₃COO⁻', z: -1, dHf: -486.0 },
    Ox:   { label: 'C₂O₄²⁻',  z: -2, dHf: -825.1 },
    CrO4: { label: 'CrO₄²⁻',  z: -2, dHf: -881.2, color: [1.0, 0.92, 0.25], ref: 0.01 },
    SCN:  { label: 'SCN⁻',    z: -1, dHf: 76.4 },
    ClO:  { label: 'ClO⁻',    z: -1, dHf: -107.1 },
  };

  /* ---------------- other aqueous species ----------------
     a: components, h: H⁺, w: water consumed, logK: formation constant,
     dHf: ΔHf° (null = assume no extra enthalpy), color/ref: tint at ref M */
  const SPECIES = {
    'OH-':      { label: 'OH⁻',      a: {}, h: -1, w: 1, logK: null /* −pKw(T) */, z: -1, dHf: -230.0 },
    'HSO4-':    { label: 'HSO₄⁻',    a: { SO4: 1 }, h: 1, logK: 1.99, z: -1, dHf: -887.3 },
    'HCO3-':    { label: 'HCO₃⁻',    a: { CO3: 1 }, h: 1, logK: 10.33, z: -1, dHf: -692.0 },
    'CO2aq':    { label: 'CO₂(aq)',  a: { CO3: 1 }, h: 2, w: -1, logK: 16.68, z: 0, dHf: -413.8 },
    'HPO4--':   { label: 'HPO₄²⁻',   a: { PO4: 1 }, h: 1, logK: 12.35, z: -2, dHf: -1292.1 },
    'H2PO4-':   { label: 'H₂PO₄⁻',   a: { PO4: 1 }, h: 2, logK: 19.55, z: -1, dHf: -1296.3 },
    'H3PO4':    { label: 'H₃PO₄',    a: { PO4: 1 }, h: 3, logK: 21.70, z: 0, dHf: -1288.3 },
    'HAc':      { label: 'CH₃COOH',  a: { Ac: 1 }, h: 1, logK: 4.76, z: 0, dHf: -485.8 },
    'NH4+':     { label: 'NH₄⁺',     a: { NH3: 1 }, h: 1, logK: 9.25, z: 1, dHf: -132.5 },
    'HF':       { label: 'HF',       a: { F: 1 }, h: 1, logK: 3.17, z: 0, dHf: -320.1 },
    'HClO':     { label: 'HClO',     a: { ClO: 1 }, h: 1, logK: 7.53, z: 0, dHf: -120.9 },
    'Cl2aq':    { label: 'Cl₂(aq)',  a: { ClO: 1, Cl: 1 }, h: 2, w: -1, logK: 10.91, z: 0, dHf: -23.4, color: [0.88, 1.0, 0.62], ref: 0.05 },
    'HOx-':     { label: 'HC₂O₄⁻',   a: { Ox: 1 }, h: 1, logK: 4.27, z: -1, dHf: -818.4 },
    'H2Ox':     { label: 'H₂C₂O₄',   a: { Ox: 1 }, h: 2, logK: 5.52, z: 0, dHf: null },
    'HCrO4-':   { label: 'HCrO₄⁻',   a: { CrO4: 1 }, h: 1, logK: 6.51, z: -1, dHf: -878.2, color: [1.0, 0.85, 0.25], ref: 0.01 },
    'Cr2O7--':  { label: 'Cr₂O₇²⁻',  a: { CrO4: 2 }, h: 2, w: -1, logK: 14.56, z: -2, dHf: -1490.3, color: [1.0, 0.55, 0.12], ref: 0.01 },
    // metal-ion hydrolysis (why Fe³⁺ and Al³⁺ solutions are acidic)
    'FeOH++':   { label: 'FeOH²⁺',   a: { Fe3: 1 }, h: -1, w: 1, logK: -2.19, z: 2, dHf: -290.8, color: [1.0, 0.78, 0.35], ref: 0.1 },
    'Fe(OH)2+': { label: 'Fe(OH)₂⁺', a: { Fe3: 1 }, h: -2, w: 2, logK: -5.67, z: 1, dHf: null, color: [1.0, 0.75, 0.40], ref: 0.1 },
    'AlOH++':   { label: 'AlOH²⁺',   a: { Al: 1 }, h: -1, w: 1, logK: -4.97, z: 2, dHf: null },
    'Al(OH)4-': { label: 'Al(OH)₄⁻', a: { Al: 1 }, h: -4, w: 4, logK: -23.0, z: -1, dHf: -1502.5 },
    'Zn(OH)4--':{ label: 'Zn(OH)₄²⁻',a: { Zn: 1 }, h: -4, w: 4, logK: -40.5, z: -2, dHf: null },
    'CuOH+':    { label: 'CuOH⁺',    a: { Cu: 1 }, h: -1, w: 1, logK: -7.5, z: 1, dHf: null },
    'PbOH+':    { label: 'PbOH⁺',    a: { Pb: 1 }, h: -1, w: 1, logK: -7.7, z: 1, dHf: null },
    // complexes
    'Cu(NH3)4++': { label: '[Cu(NH₃)₄]²⁺', a: { Cu: 1, NH3: 4 }, logK: 13.3, z: 2, dHf: -348.5, color: [0.18, 0.36, 0.95], ref: 0.006 },
    'Ag(NH3)2+':  { label: '[Ag(NH₃)₂]⁺',  a: { Ag: 1, NH3: 2 }, logK: 7.23, z: 1, dHf: -111.3 },
    'Zn(NH3)4++': { label: '[Zn(NH₃)₄]²⁺', a: { Zn: 1, NH3: 4 }, logK: 9.46, z: 2, dHf: -533.5 },
    'Ni(NH3)6++': { label: '[Ni(NH₃)₆]²⁺', a: { Ni: 1, NH3: 6 }, logK: 8.6, z: 2, dHf: null, color: [0.62, 0.62, 1.0], ref: 0.05 },
    'FeSCN++':    { label: '[Fe(SCN)]²⁺',  a: { Fe3: 1, SCN: 1 }, logK: 2.95, z: 2, dHf: null, color: [0.72, 0.04, 0.04], ref: 0.002 },
  };

  /* ---------------- sparingly soluble solids (precipitates) ----------------
     a/h/w: composition in components (as for species); logKsp: dissolution
     constant in that basis, e.g. Cu(OH)₂ + 2H⁺ ⇌ Cu²⁺ + 2H₂O, log K = 8.34
     (from Ksp = 2.2×10⁻²⁰ and Kw). eq: the precipitation equation shown. */
  const SOLIDS = {
    'AgCl':    { a: { Ag: 1, Cl: 1 }, logKsp: -9.74, dHf: -127.0, color: '#f4f6f8', name: 'white', eq: 'Ag⁺ + Cl⁻ → AgCl(s)' },
    'AgBr':    { a: { Ag: 1, Br: 1 }, logKsp: -12.30, dHf: -100.4, color: '#efe6c2', name: 'cream', eq: 'Ag⁺ + Br⁻ → AgBr(s)' },
    'AgI':     { a: { Ag: 1, I: 1 }, logKsp: -16.08, dHf: -61.8, color: '#f2d64e', name: 'yellow', eq: 'Ag⁺ + I⁻ → AgI(s)' },
    'Ag2CrO4': { a: { Ag: 2, CrO4: 1 }, logKsp: -11.92, dHf: -731.7, color: '#a8322a', name: 'brick-red', eq: '2Ag⁺ + CrO₄²⁻ → Ag₂CrO₄(s)' },
    'Ag2CO3':  { a: { Ag: 2, CO3: 1 }, logKsp: -11.09, dHf: -505.8, color: '#eee2b0', name: 'pale yellow', eq: '2Ag⁺ + CO₃²⁻ → Ag₂CO₃(s)' },
    'Ag3PO4':  { a: { Ag: 3, PO4: 1 }, logKsp: -17.59, dHf: null, color: '#e8cf3a', name: 'yellow', eq: '3Ag⁺ + PO₄³⁻ → Ag₃PO₄(s)' },
    'Ag2O':    { a: { Ag: 2 }, h: -2, w: 1, logKsp: 12.6, dHf: -31.1, color: '#5b4632', name: 'brown', eq: '2Ag⁺ + 2OH⁻ → Ag₂O(s) + H₂O' },
    'BaSO4':   { a: { Ba: 1, SO4: 1 }, logKsp: -9.97, dHf: -1473.2, color: '#ffffff', name: 'white', eq: 'Ba²⁺ + SO₄²⁻ → BaSO₄(s)' },
    // conditional Ksp (matches the measured solubility of ~2 g/L in this ideal-solution model)
    'CaSO4':   { a: { Ca: 1, SO4: 1 }, logKsp: -3.66, dHf: -1434.5, color: '#f7f7f7', name: 'white', eq: 'Ca²⁺ + SO₄²⁻ → CaSO₄(s)' },
    'SrSO4':   { a: { Sr: 1, SO4: 1 }, logKsp: -6.63, dHf: -1453.1, color: '#ffffff', name: 'white', eq: 'Sr²⁺ + SO₄²⁻ → SrSO₄(s)' },
    'PbSO4':   { a: { Pb: 1, SO4: 1 }, logKsp: -7.79, dHf: -920.0, color: '#ffffff', name: 'white', eq: 'Pb²⁺ + SO₄²⁻ → PbSO₄(s)' },
    'CaCO3':   { a: { Ca: 1, CO3: 1 }, logKsp: -8.48, dHf: -1207.6, color: '#fbfbf8', name: 'white', eq: 'Ca²⁺ + CO₃²⁻ → CaCO₃(s)' },
    'BaCO3':   { a: { Ba: 1, CO3: 1 }, logKsp: -8.56, dHf: -1213.0, color: '#ffffff', name: 'white', eq: 'Ba²⁺ + CO₃²⁻ → BaCO₃(s)' },
    'SrCO3':   { a: { Sr: 1, CO3: 1 }, logKsp: -9.27, dHf: -1220.1, color: '#ffffff', name: 'white', eq: 'Sr²⁺ + CO₃²⁻ → SrCO₃(s)' },
    'MgCO3':   { a: { Mg: 1, CO3: 1 }, logKsp: -7.46, dHf: -1095.8, color: '#ffffff', name: 'white', eq: 'Mg²⁺ + CO₃²⁻ → MgCO₃(s)' },
    'PbCO3':   { a: { Pb: 1, CO3: 1 }, logKsp: -13.13, dHf: -699.1, color: '#ffffff', name: 'white', eq: 'Pb²⁺ + CO₃²⁻ → PbCO₃(s)' },
    // conditional Ksp from the measured solubility (~1.6 g/L = 0.022 M at 20 °C)
    'Ca(OH)2': { a: { Ca: 1 }, h: -2, w: 2, logKsp: 23.63, dHf: -985.2, color: '#fbfbfb', name: 'white', eq: 'Ca²⁺ + 2OH⁻ → Ca(OH)₂(s)' },
    'Mg(OH)2': { a: { Mg: 1 }, h: -2, w: 2, logKsp: 16.75, dHf: -924.5, color: '#fbfbfb', name: 'white', eq: 'Mg²⁺ + 2OH⁻ → Mg(OH)₂(s)' },
    'Cu(OH)2': { a: { Cu: 1 }, h: -2, w: 2, logKsp: 8.34, dHf: -449.8, color: '#6fb2ff', name: 'pale blue', eq: 'Cu²⁺ + 2OH⁻ → Cu(OH)₂(s)' },
    'Fe(OH)2': { a: { Fe2: 1 }, h: -2, w: 2, logKsp: 11.69, dHf: -569.0, color: '#6f8f5a', name: 'dirty green', eq: 'Fe²⁺ + 2OH⁻ → Fe(OH)₂(s)' },
    // freshly precipitated (amorphous) iron(III) hydroxide, Baes & Mesmer
    'Fe(OH)3': { a: { Fe3: 1 }, h: -3, w: 3, logKsp: 3.96, dHf: -823.0, color: '#9c4a1a', name: 'rust-brown', eq: 'Fe³⁺ + 3OH⁻ → Fe(OH)₃(s)' },
    'Zn(OH)2': { a: { Zn: 1 }, h: -2, w: 2, logKsp: 11.5, dHf: -641.9, color: '#ffffff', name: 'white', eq: 'Zn²⁺ + 2OH⁻ → Zn(OH)₂(s)' },
    'Al(OH)3': { a: { Al: 1 }, h: -3, w: 3, logKsp: 9.1, dHf: -1276.0, color: '#f2f5f7', name: 'white gelatinous', eq: 'Al³⁺ + 3OH⁻ → Al(OH)₃(s)' },
    'Pb(OH)2': { a: { Pb: 1 }, h: -2, w: 2, logKsp: 8.15, dHf: -515.9, color: '#ffffff', name: 'white', eq: 'Pb²⁺ + 2OH⁻ → Pb(OH)₂(s)' },
    'Co(OH)2': { a: { Co: 1 }, h: -2, w: 2, logKsp: 13.2, dHf: -539.7, color: '#d06f8a', name: 'pink (blue at first)', eq: 'Co²⁺ + 2OH⁻ → Co(OH)₂(s)' },
    'Ni(OH)2': { a: { Ni: 1 }, h: -2, w: 2, logKsp: 12.74, dHf: -529.7, color: '#7ccf6b', name: 'apple green', eq: 'Ni²⁺ + 2OH⁻ → Ni(OH)₂(s)' },
    'Mn(OH)2': { a: { Mn: 1 }, h: -2, w: 2, logKsp: 15.28, dHf: -695.4, color: '#e8dcc8', name: 'off-white', eq: 'Mn²⁺ + 2OH⁻ → Mn(OH)₂(s)' },
    'PbI2':    { a: { Pb: 1, I: 2 }, logKsp: -8.01, dHf: -175.5, color: '#ffd400', name: 'bright yellow', eq: 'Pb²⁺ + 2I⁻ → PbI₂(s)' },
    'PbCl2':   { a: { Pb: 1, Cl: 2 }, logKsp: -4.77, dHf: -359.4, color: '#ffffff', name: 'white', eq: 'Pb²⁺ + 2Cl⁻ → PbCl₂(s)' },
    'PbBr2':   { a: { Pb: 1, Br: 2 }, logKsp: -5.68, dHf: -278.7, color: '#ffffff', name: 'white', eq: 'Pb²⁺ + 2Br⁻ → PbBr₂(s)' },
    'CaF2':    { a: { Ca: 1, F: 2 }, logKsp: -10.41, dHf: -1228.0, color: '#ffffff', name: 'white', eq: 'Ca²⁺ + 2F⁻ → CaF₂(s)' },
    'PbCrO4':  { a: { Pb: 1, CrO4: 1 }, logKsp: -12.6, dHf: -930.9, color: '#ffc61a', name: 'yellow', eq: 'Pb²⁺ + CrO₄²⁻ → PbCrO₄(s)' },
    'BaCrO4':  { a: { Ba: 1, CrO4: 1 }, logKsp: -9.93, dHf: -1446.0, color: '#f6e04a', name: 'pale yellow', eq: 'Ba²⁺ + CrO₄²⁻ → BaCrO₄(s)' },
    'CaC2O4':  { a: { Ca: 1, Ox: 1 }, logKsp: -8.64, dHf: -1360.6, color: '#ffffff', name: 'white', eq: 'Ca²⁺ + C₂O₄²⁻ → CaC₂O₄(s)' },
    'Ca3(PO4)2': { a: { Ca: 3, PO4: 2 }, logKsp: -32.7, dHf: -4120.8, color: '#ffffff', name: 'white', eq: '3Ca²⁺ + 2PO₄³⁻ → Ca₃(PO₄)₂(s)' },
  };

  /* ---------------- soluble solids you can add from the shelf ----------------
     yield: what one formula unit becomes when it dissolves (components,
     h = H⁺ produced, water = H₂O produced). sol: solubility, g of anhydrous
     salt per 100 g water at 0,10,…,100 °C (CRC Handbook). solM: molar mass of
     the anhydrous salt used in the solubility table. */
  const SOLUBLE = {
    NaCl:     { label: 'NaCl', M: 58.44, yield: { a: { Na: 1, Cl: 1 } }, dHf: -411.2, sol: [35.7, 35.8, 35.9, 36.1, 36.4, 36.7, 37.1, 37.5, 38.0, 38.5, 39.2], color: '#ffffff', habit: 'cubes' },
    KNO3:     { label: 'KNO₃', M: 101.10, yield: { a: { K: 1, NO3: 1 } }, dHf: -494.6, sol: [13.3, 20.9, 31.6, 45.8, 63.9, 85.5, 110, 138, 169, 202, 246], color: '#ffffff', habit: 'needles' },
    NH4NO3:   { label: 'NH₄NO₃', M: 80.04, yield: { a: { NH3: 1, NO3: 1 }, h: 1 }, dHf: -365.6, sol: [118, 150, 192, 242, 297, 344, 421, 499, 580, 740, 871], color: '#ffffff', habit: 'prills' },
    NaOH:     { label: 'NaOH', M: 40.00, yield: { a: { Na: 1 }, h: -1, water: 1 }, dHf: -425.6, sol: [42, 51, 109, 119, 129, 145, 174, 220, 314, 330, 347], color: '#ffffff', habit: 'pellets' },
    CaCl2:    { label: 'CaCl₂', M: 110.98, yield: { a: { Ca: 1, Cl: 2 } }, dHf: -795.8, sol: [59.5, 64.7, 74.5, 100, 128, 132, 137, 141, 147, 154, 159], color: '#ffffff', habit: 'granules' },
    CuSO4_5H2O: { label: 'CuSO₄·5H₂O', M: 249.69, solM: 159.61, yield: { a: { Cu: 1, SO4: 1 }, water: 5 }, dHf: -2279.7, sol: [14.3, 17.4, 20.7, 25.0, 28.5, 33.3, 40.0, 47.0, 55.0, 64.2, 75.4], color: '#2f7fe0', habit: 'crystals' },
    CuSO4:    { label: 'CuSO₄ (anhydrous)', M: 159.61, yield: { a: { Cu: 1, SO4: 1 } }, dHf: -771.4, sol: [14.3, 17.4, 20.7, 25.0, 28.5, 33.3, 40.0, 47.0, 55.0, 64.2, 75.4], color: '#eef0ee', crystalColor: '#2f7fe0', habit: 'powder' },
    NaHCO3:   { label: 'NaHCO₃', M: 84.01, yield: { a: { Na: 1, CO3: 1 }, h: 1 }, dHf: -950.8, sol: [6.9, 8.2, 9.6, 11.1, 12.7, 14.5, 16.4, 17.5, 19.0, 20.5, 23.6], color: '#ffffff', habit: 'powder' },
    Na2CO3:   { label: 'Na₂CO₃', M: 105.99, yield: { a: { Na: 2, CO3: 1 } }, dHf: -1130.7, sol: [7.0, 12.5, 21.5, 39.7, 49.0, 48.5, 46.0, 45.5, 43.9, 43.9, 45.5], color: '#ffffff', habit: 'powder' },
    NH4Cl:    { label: 'NH₄Cl', M: 53.49, yield: { a: { NH3: 1, Cl: 1 }, h: 1 }, dHf: -314.4, sol: [29.4, 33.3, 37.2, 41.4, 45.8, 50.4, 55.3, 60.2, 65.6, 71.2, 77.3], color: '#ffffff', habit: 'crystals' },
    KI:       { label: 'KI', M: 166.00, yield: { a: { K: 1, I: 1 } }, dHf: -327.9, sol: [128, 136, 144, 153, 162, 168, 176, 184, 192, 198, 206], color: '#ffffff', habit: 'cubes' },
    KCl:      { label: 'KCl', M: 74.55, yield: { a: { K: 1, Cl: 1 } }, dHf: -436.7, sol: [27.6, 31.0, 34.0, 37.0, 40.0, 42.6, 45.5, 48.3, 51.1, 54.0, 56.7], color: '#ffffff', habit: 'cubes' },
    NaAc:     { label: 'CH₃COONa', M: 82.03, yield: { a: { Na: 1, Ac: 1 } }, dHf: -708.8, sol: [36.2, 40.8, 46.4, 54.6, 65.6, 83, 139, 146, 153, 161, 170], color: '#ffffff', habit: 'crystals' },
  };

  /* ---------------- lumps: solids that react at a finite rate ----------------
     Metals react with H⁺ (and/or water / hydroxide) to give ions + H₂, and
     displace less reactive metal ions. Rates (mol/s) =
       1e-4 · A · (kAcid·[H⁺] + kWater + kBase·[OH⁻]) · 2^((T−20)/10)
     where A = (n / 0.004 mol)^(2/3) is a surface-area factor.
     E°: standard reduction potential of the ion (V). */
  const METALS = {
    K:  { label: 'Potassium', ion: 'K', n: 1, E: -2.93, M: 39.10, kWater: 25, kAcid: 40, color: '#c7cdd4', water: true },
    Na: { label: 'Sodium', ion: 'Na', n: 1, E: -2.71, M: 22.99, kWater: 8, kAcid: 15, color: '#d4d9de', water: true },
    Li: { label: 'Lithium', ion: 'Li', n: 1, E: -3.04, M: 6.94, kWater: 1.0, kAcid: 3, color: '#b9bec4', water: true },
    Ca: { label: 'Calcium', ion: 'Ca', n: 2, E: -2.87, M: 40.08, kWater: 0.4, kAcid: 1.5, color: '#d9dcd3', water: true },
    Mg: { label: 'Magnesium', ion: 'Mg', n: 2, E: -2.37, M: 24.31, kWater: 0.0003, kAcid: 1.6, color: '#c9ced3' },
    Al: { label: 'Aluminium', ion: 'Al', n: 3, E: -1.66, M: 26.98, kWater: 0, kAcid: 0.35, kBase: 0.35, oxide: 25, color: '#d5d9de' },
    Zn: { label: 'Zinc', ion: 'Zn', n: 2, E: -0.76, M: 65.38, kWater: 0, kAcid: 0.12, color: '#a7adb5' },
    Fe: { label: 'Iron', ion: 'Fe2', n: 2, E: -0.44, M: 55.85, kWater: 0, kAcid: 0.04, color: '#7d838b' },
    Pb: { label: 'Lead', ion: 'Pb', n: 2, E: -0.13, M: 207.2, kWater: 0, kAcid: 0.004, color: '#6f7784' },
    Cu: { label: 'Copper', ion: 'Cu', n: 2, E: 0.34, M: 63.55, kWater: 0, kAcid: 0, color: '#c8743f' },
    Ag: { label: 'Silver', ion: 'Ag', n: 1, E: 0.80, M: 107.87, kWater: 0, kAcid: 0, color: '#d9dde2' },
  };
  const DISPLACE_K = 0.6;   // displacement rate constant (same units as kAcid)

  // Lumps that are not metals
  const OTHER_LUMPS = {
    CaCO3: { label: 'Marble chips (CaCO₃)', M: 100.09, solid: 'CaCO3', kAcid: 0.9, kNeutral: 0.002, color: '#efeee8' },
    CaO:   { label: 'Quicklime (CaO)', M: 56.08, yield: { a: { Ca: 1 }, h: -2, water: 1 }, dHf: -634.9, kNeutral: 2.0, color: '#f4f2ea' },
    MnO2:  { label: 'Manganese(IV) oxide', M: 86.94, catalyst: 'H2O2', kCat: 0.6, color: '#2b2622' },
    Yeast: { label: 'Yeast (catalase)', M: 1, catalyst: 'H2O2', kCat: 1.5, color: '#c9a86b' },
  };

  /* ---------------- gases ---------------- */
  const GASES = {
    H2:  { label: 'H₂', dHf: 0 },
    O2:  { label: 'O₂', dHf: 0 },
    CO2: { label: 'CO₂', dHf: -393.5, from: { species: 'CO2aq', a: { CO3: 1 }, h: 2, w: -1 } },
    Cl2: { label: 'Cl₂', dHf: 0, from: { species: 'Cl2aq', a: { ClO: 1, Cl: 1 }, h: 2, w: -1 }, toxic: true, color: [0.75, 0.95, 0.35] },
    NH3: { label: 'NH₃', dHf: -45.9, from: { species: 'NH3', a: { NH3: 1 } }, irritant: true },
  };

  /* ---------------- reagents on the shelf ----------------
     kind: 'solution' (per-litre component totals in `c`), 'soluble' (solid
     salt, key into SOLUBLE), 'metal', 'lump', 'indicator', 'special'. */
  const SHELF = [
    { group: 'Water' },
    { id: 'water', name: 'Distilled water', kind: 'solution', c: {}, unit: 'mL', amount: 50 },
    { group: 'Acids' },
    { id: 'HCl1', name: 'Hydrochloric acid 1 M', formula: 'HCl', kind: 'solution', c: { Cl: 1 }, hazards: ['corrosive'], amount: 10 },
    { id: 'HCl01', name: 'Hydrochloric acid 0.1 M', formula: 'HCl', kind: 'solution', c: { Cl: 0.1 }, hazards: ['irritant'], amount: 10 },
    { id: 'H2SO4', name: 'Sulfuric acid 1 M', formula: 'H₂SO₄', kind: 'solution', c: { SO4: 1 }, hazards: ['corrosive'], amount: 10 },
    { id: 'HNO3', name: 'Nitric acid 1 M', formula: 'HNO₃', kind: 'solution', c: { NO3: 1 }, hazards: ['corrosive', 'oxidiser'], amount: 10 },
    { id: 'HAc', name: 'Ethanoic (acetic) acid 1 M', formula: 'CH₃COOH', kind: 'solution', c: { Ac: 1 }, hazards: ['irritant'], amount: 10 },
    { group: 'Bases' },
    { id: 'NaOH1', name: 'Sodium hydroxide 1 M', formula: 'NaOH', kind: 'solution', c: { Na: 1 }, hazards: ['corrosive'], amount: 10 },
    { id: 'NaOH01', name: 'Sodium hydroxide 0.1 M', formula: 'NaOH', kind: 'solution', c: { Na: 0.1 }, hazards: ['irritant'], amount: 10 },
    { id: 'NH3', name: 'Ammonia solution 1 M', formula: 'NH₃(aq)', kind: 'solution', c: { NH3: 1 }, hazards: ['irritant'], amount: 10 },
    { id: 'limewater', name: 'Limewater (sat. Ca(OH)₂)', formula: 'Ca(OH)₂', kind: 'solution', c: { Ca: 0.02 }, hazards: ['irritant'], amount: 20 },
    { group: 'Salt solutions' },
    { id: 'NaCl1', name: 'Sodium chloride 1 M', formula: 'NaCl', kind: 'solution', c: { Na: 1, Cl: 1 }, amount: 10 },
    { id: 'KBr', name: 'Potassium bromide 0.1 M', formula: 'KBr', kind: 'solution', c: { K: 0.1, Br: 0.1 }, amount: 10 },
    { id: 'KIsol', name: 'Potassium iodide 0.1 M', formula: 'KI', kind: 'solution', c: { K: 0.1, I: 0.1 }, amount: 10 },
    { id: 'AgNO3', name: 'Silver nitrate 0.1 M', formula: 'AgNO₃', kind: 'solution', c: { Ag: 0.1, NO3: 0.1 }, hazards: ['irritant'], note: 'Stains skin black.', amount: 5 },
    { id: 'BaCl2', name: 'Barium chloride 0.1 M', formula: 'BaCl₂', kind: 'solution', c: { Ba: 0.1, Cl: 0.2 }, hazards: ['toxic'], amount: 5 },
    { id: 'PbNO3', name: 'Lead(II) nitrate 0.1 M', formula: 'Pb(NO₃)₂', kind: 'solution', c: { Pb: 0.1, NO3: 0.2 }, hazards: ['toxic'], amount: 5 },
    { id: 'CuSO4sol', name: 'Copper(II) sulfate 0.5 M', formula: 'CuSO₄', kind: 'solution', c: { Cu: 0.5, SO4: 0.5 }, hazards: ['irritant'], amount: 10 },
    { id: 'FeCl3', name: 'Iron(III) chloride 0.1 M', formula: 'FeCl₃', kind: 'solution', c: { Fe3: 0.1, Cl: 0.31 }, hazards: ['irritant'], note: 'Contains a little HCl to stop hydrolysis, like real stock solutions.', amount: 5 },
    { id: 'FeSO4', name: 'Iron(II) sulfate 0.1 M', formula: 'FeSO₄', kind: 'solution', c: { Fe2: 0.1, SO4: 0.1 }, amount: 5 },
    { id: 'ZnSO4', name: 'Zinc sulfate 0.5 M', formula: 'ZnSO₄', kind: 'solution', c: { Zn: 0.5, SO4: 0.5 }, amount: 5 },
    { id: 'MgSO4', name: 'Magnesium sulfate 0.5 M', formula: 'MgSO₄', kind: 'solution', c: { Mg: 0.5, SO4: 0.5 }, amount: 5 },
    { id: 'CaCl2sol', name: 'Calcium chloride 0.5 M', formula: 'CaCl₂', kind: 'solution', c: { Ca: 0.5, Cl: 1 }, amount: 5 },
    { id: 'AlCl3', name: 'Aluminium chloride 0.1 M', formula: 'AlCl₃', kind: 'solution', c: { Al: 0.1, Cl: 0.3 }, amount: 5 },
    { id: 'CoCl2', name: 'Cobalt(II) chloride 0.1 M', formula: 'CoCl₂', kind: 'solution', c: { Co: 0.1, Cl: 0.2 }, hazards: ['toxic'], amount: 5 },
    { id: 'NiSO4', name: 'Nickel(II) sulfate 0.1 M', formula: 'NiSO₄', kind: 'solution', c: { Ni: 0.1, SO4: 0.1 }, hazards: ['toxic'], amount: 5 },
    { id: 'K2CrO4', name: 'Potassium chromate 0.1 M', formula: 'K₂CrO₄', kind: 'solution', c: { K: 0.2, CrO4: 0.1 }, hazards: ['toxic'], note: 'Chromium(VI) is carcinogenic.', amount: 2 },
    { id: 'KSCN', name: 'Potassium thiocyanate 0.1 M', formula: 'KSCN', kind: 'solution', c: { K: 0.1, SCN: 0.1 }, amount: 2 },
    { id: 'Na2CO3sol', name: 'Sodium carbonate 1 M', formula: 'Na₂CO₃', kind: 'solution', c: { Na: 2, CO3: 1 }, hazards: ['irritant'], amount: 10 },
    { id: 'Na3PO4', name: 'Sodium phosphate 0.1 M', formula: 'Na₃PO₄', kind: 'solution', c: { Na: 0.3, PO4: 0.1 }, hazards: ['irritant'], amount: 5 },
    { id: 'NH4Clsol', name: 'Ammonium chloride 1 M', formula: 'NH₄Cl', kind: 'solution', c: { NH3: 1, Cl: 1 }, amount: 10 },
    { id: 'NaOx', name: 'Sodium oxalate 0.1 M', formula: 'Na₂C₂O₄', kind: 'solution', c: { Na: 0.2, Ox: 0.1 }, hazards: ['toxic'], amount: 5 },
    { id: 'bleach', name: 'Bleach (sodium hypochlorite ~5 %)', formula: 'NaClO', kind: 'solution', c: { Na: 0.75, ClO: 0.7 }, hazards: ['corrosive'], note: 'Never mix with acids or ammonia.', amount: 10 },
    { group: 'Solid salts' },
    { id: 's_NaCl', name: 'Sodium chloride', kind: 'soluble', key: 'NaCl', amount: 5 },
    { id: 's_KNO3', name: 'Potassium nitrate', kind: 'soluble', key: 'KNO3', hazards: ['oxidiser'], amount: 10 },
    { id: 's_NH4NO3', name: 'Ammonium nitrate', kind: 'soluble', key: 'NH4NO3', hazards: ['oxidiser'], note: 'Dissolving it is strongly endothermic (instant cold packs).', amount: 10 },
    { id: 's_NaOH', name: 'Sodium hydroxide pellets', kind: 'soluble', key: 'NaOH', hazards: ['corrosive'], note: 'Dissolving it releases a lot of heat.', amount: 2 },
    { id: 's_CaCl2', name: 'Calcium chloride (anhydrous)', kind: 'soluble', key: 'CaCl2', hazards: ['irritant'], amount: 5 },
    { id: 's_CuSO4_5', name: 'Copper(II) sulfate crystals', kind: 'soluble', key: 'CuSO4_5H2O', hazards: ['irritant'], amount: 5 },
    { id: 's_CuSO4', name: 'Anhydrous copper(II) sulfate', kind: 'soluble', key: 'CuSO4', hazards: ['irritant'], note: 'White powder that turns blue with water (a test for water).', amount: 2 },
    { id: 's_NaHCO3', name: 'Sodium hydrogencarbonate (baking soda)', kind: 'soluble', key: 'NaHCO3', amount: 2 },
    { id: 's_Na2CO3', name: 'Sodium carbonate (washing soda)', kind: 'soluble', key: 'Na2CO3', hazards: ['irritant'], amount: 2 },
    { id: 's_NH4Cl', name: 'Ammonium chloride', kind: 'soluble', key: 'NH4Cl', amount: 5 },
    { id: 's_KI', name: 'Potassium iodide', kind: 'soluble', key: 'KI', amount: 1 },
    { id: 's_NaAc', name: 'Sodium ethanoate (acetate)', kind: 'soluble', key: 'NaAc', amount: 5 },
    { group: 'Metals' },
    { id: 'm_Mg', name: 'Magnesium ribbon', kind: 'metal', key: 'Mg', hazards: ['flammable'], amount: 0.1 },
    { id: 'm_Zn', name: 'Zinc granules', kind: 'metal', key: 'Zn', amount: 1 },
    { id: 'm_Fe', name: 'Iron filings', kind: 'metal', key: 'Fe', amount: 1 },
    { id: 'm_Al', name: 'Aluminium foil', kind: 'metal', key: 'Al', amount: 0.2 },
    { id: 'm_Cu', name: 'Copper turnings', kind: 'metal', key: 'Cu', amount: 1 },
    { id: 'm_Ca', name: 'Calcium granules', kind: 'metal', key: 'Ca', hazards: ['flammable'], amount: 0.1 },
    { id: 'm_Li', name: 'Lithium (small piece)', kind: 'metal', key: 'Li', hazards: ['flammable', 'corrosive'], amount: 0.05 },
    { id: 'm_Na', name: 'Sodium (small piece)', kind: 'metal', key: 'Na', hazards: ['flammable', 'corrosive'], amount: 0.1 },
    { id: 'm_K', name: 'Potassium (small piece)', kind: 'metal', key: 'K', hazards: ['flammable', 'corrosive'], amount: 0.1 },
    { group: 'Other' },
    { id: 'H2O2', name: 'Hydrogen peroxide 3 %', formula: 'H₂O₂', kind: 'special', h2o2: 0.88, hazards: ['irritant'], amount: 20 },
    { id: 'H2O2_30', name: 'Hydrogen peroxide 30 % (demo)', formula: 'H₂O₂', kind: 'special', h2o2: 8.8, hazards: ['corrosive', 'oxidiser'], note: 'Teacher-demonstration strength: burns skin.', amount: 10 },
    { id: 'l_CaCO3', name: 'Marble chips', kind: 'lump', key: 'CaCO3', amount: 2 },
    { id: 'l_CaO', name: 'Quicklime', kind: 'lump', key: 'CaO', hazards: ['corrosive'], note: 'Reacts with water releasing heat.', amount: 2 },
    { id: 'l_MnO2', name: 'Manganese(IV) oxide (catalyst)', kind: 'lump', key: 'MnO2', hazards: ['irritant'], amount: 0.5 },
    { id: 'l_Yeast', name: 'Yeast (catalase enzyme)', kind: 'lump', key: 'Yeast', amount: 1 },
    { id: 'detergent', name: 'Washing-up liquid', kind: 'special', detergent: true, amount: 2 },
    { group: 'Indicators' },
    { id: 'i_phph', name: 'Phenolphthalein', kind: 'indicator', key: 'phph', amount: 3, unit: 'drops' },
    { id: 'i_mo', name: 'Methyl orange', kind: 'indicator', key: 'mo', amount: 3, unit: 'drops' },
    { id: 'i_btb', name: 'Bromothymol blue', kind: 'indicator', key: 'btb', amount: 3, unit: 'drops' },
    { id: 'i_univ', name: 'Universal indicator', kind: 'indicator', key: 'univ', amount: 5, unit: 'drops' },
  ];

  /* ---------------- indicators ----------------
     color(pH) → [r,g,b] (0-1) of the indicator at its working strength. */
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sigmoid = (pH, pKa) => 1 / (1 + Math.pow(10, pKa - pH));     // fraction in base form
  const INDICATORS = {
    phph: { label: 'Phenolphthalein', range: '8.2–10.0 (colourless → pink)', color: (pH) => lerp([1, 1, 1], [0.95, 0.15, 0.55], sigmoid(pH, 9.1)), strength: 0.8 },
    mo:   { label: 'Methyl orange', range: '3.1–4.4 (red → yellow)', color: (pH) => lerp([0.92, 0.18, 0.15], [1.0, 0.82, 0.2], sigmoid(pH, 3.7)), strength: 0.75 },
    btb:  { label: 'Bromothymol blue', range: '6.0–7.6 (yellow → blue)', color: (pH) => lerp([1.0, 0.9, 0.2], [0.15, 0.35, 0.9], sigmoid(pH, 7.0)), strength: 0.75 },
    univ: { label: 'Universal indicator', range: 'pH 1–14 rainbow', color: (pH) => universal(pH), strength: 0.8 },
    litmus: { label: 'Litmus', range: '4.5–8.3 (red → blue)', color: (pH) => lerp([0.9, 0.2, 0.25], [0.3, 0.35, 0.85], sigmoid(pH, 6.5)) },
  };
  // The classic universal-indicator colour chart
  const UNIV = [[1, [0.85, 0.05, 0.1]], [3, [0.95, 0.35, 0.1]], [4, [1.0, 0.6, 0.1]], [5, [1.0, 0.85, 0.15]], [6, [0.75, 0.9, 0.2]], [7, [0.2, 0.75, 0.25]],
    [8, [0.1, 0.6, 0.55]], [9, [0.15, 0.4, 0.85]], [10, [0.2, 0.25, 0.8]], [11, [0.35, 0.15, 0.7]], [13, [0.45, 0.1, 0.6]]];
  function universal(pH) {
    if (pH <= UNIV[0][0]) return UNIV[0][1];
    for (let i = 1; i < UNIV.length; i++) {
      if (pH <= UNIV[i][0]) return lerp(UNIV[i - 1][1], UNIV[i][1], (pH - UNIV[i - 1][0]) / (UNIV[i][0] - UNIV[i - 1][0]));
    }
    return UNIV[UNIV.length - 1][1];
  }

  /** pKw as a function of temperature (Harned & Owen fit; 14.00 at 25 °C, 12.26 at 100 °C). */
  function pKw(Tc) {
    const T = Tc + 273.15;
    return 4471 / T - 6.0875 + 0.01706 * T;
  }

  /** Solubility (g per 100 g water) by linear interpolation of the table. */
  function solubility(key, Tc) {
    const s = SOLUBLE[key].sol;
    const t = Math.max(0, Math.min(100, Tc)) / 10;
    const i = Math.min(9, Math.floor(t));
    return s[i] + (s[i + 1] - s[i]) * (t - i);
  }

  const HAZARDS = {
    corrosive: { icon: '🧪', label: 'Corrosive' },
    toxic: { icon: '☠️', label: 'Toxic' },
    irritant: { icon: '⚠️', label: 'Irritant / harmful' },
    flammable: { icon: '🔥', label: 'Flammable / reacts with water' },
    oxidiser: { icon: '⭕', label: 'Oxidiser' },
  };

  return { DHF_WATER, DHF_H, COMPONENTS, SPECIES, SOLIDS, SOLUBLE, METALS, DISPLACE_K, OTHER_LUMPS, GASES, SHELF, INDICATORS, HAZARDS, pKw, solubility };
})();
