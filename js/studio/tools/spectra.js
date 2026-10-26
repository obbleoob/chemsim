/* ============================================================================
   ChemSim · studio/tools/spectra.js
   ----------------------------------------------------------------------------
   Predicted IR and NMR spectra (textbook-level, labelled as approximate).

   IR      Functional groups are found with SMARTS substructure patterns
           (RDKit) and each contributes its characteristic bands (position,
           width, strength) from standard correlation tables.

   ¹H NMR  1. Equivalent hydrogens: atoms are grouped by topological symmetry
              (an iterative "Morgan / Weisfeiler–Lehman" refinement of atom
              labels); H atoms on equivalent atoms are equivalent.
           2. Chemical shift from additive increments:
              • sp³ C–H: base value (CH₃ 0.86, CH₂ 1.30, CH 1.50 ppm) plus
                α- and β-substituent increments
              • alkene C–H: 5.25 + Z(gem) + Z(cis) + Z(trans)  (Pascual–Meier–Simon)
              • aromatic C–H: 7.27 + ortho/meta/para increments
              • O–H, N–H, CHO, C≡C–H from typical ranges
           3. Splitting by the n + 1 rule from H on neighbouring atoms
              (first-order, equal J ≈ 7 Hz; O–H/N–H exchange, so no coupling).
           Diastereotopic H atoms and long-range coupling are ignored.
   ¹³C     Number of carbon environments with rough shift ranges.
   ============================================================================ */
'use strict';

const Spectra = (() => {
  const T = () => StudioTools;
  const esc = (s) => StudioTools.esc(s);

  /* ---------------- IR correlation table ---------------- */
  // [name, SMARTS, [[wavenumber, width (cm⁻¹), strength 0–1, label], …]]
  const IR = [
    ['O–H (carboxylic acid)', '[CX3](=O)[OX2H1]', [[3000, 520, 0.55, 'O–H (very broad)'], [1710, 30, 0.95, 'C=O'], [1280, 40, 0.6, 'C–O']]],
    ['O–H (alcohol)', '[OX2H][CX4]', [[3350, 220, 0.75, 'O–H (broad, H-bonded)'], [1075, 40, 0.75, 'C–O']]],
    ['O–H (phenol)', '[OX2H]c', [[3350, 220, 0.7, 'O–H (broad)'], [1220, 40, 0.65, 'C–O']]],
    ['N–H (primary amine)', '[NX3;H2;!$(NC=O)]', [[3430, 40, 0.4, 'N–H asym.'], [3340, 40, 0.4, 'N–H sym.'], [1610, 40, 0.4, 'N–H bend']]],
    ['N–H (secondary amine)', '[NX3;H1;!$(NC=O)]([#6])[#6]', [[3320, 50, 0.35, 'N–H']]],
    ['Amide', '[NX3][CX3]=[OX1]', [[1660, 40, 0.95, 'C=O (amide I)']]],
    ['N–H (amide)', '[NX3;!H0][CX3]=[OX1]', [[3300, 90, 0.55, 'N–H'], [1550, 40, 0.6, 'N–H bend (amide II)']]],
    ['Aldehyde', '[CX3H1](=O)[#6,#1]', [[2820, 25, 0.35, 'C–H (aldehyde)'], [2720, 25, 0.35, 'C–H (aldehyde)'], [1730, 30, 0.95, 'C=O']]],
    ['Ketone', '[#6][CX3](=O)[#6]', [[1715, 30, 0.95, 'C=O']]],
    ['Ester', '[#6][CX3](=O)[OX2][#6]', [[1740, 30, 0.95, 'C=O'], [1200, 60, 0.8, 'C–O']]],
    ['Acid chloride', '[CX3](=O)[Cl]', [[1800, 25, 0.95, 'C=O']]],
    ['Anhydride', '[CX3](=O)[OX2][CX3](=O)', [[1820, 25, 0.85, 'C=O sym.'], [1760, 25, 0.85, 'C=O asym.']]],
    ['Carboxylate', '[CX3](=O)[O-]', [[1580, 40, 0.9, 'CO₂⁻ asym.'], [1410, 40, 0.6, 'CO₂⁻ sym.']]],
    ['Nitrile', '[CX2]#[NX1]', [[2250, 25, 0.5, 'C≡N']]],
    ['Terminal alkyne', '[CX2H1]#[CX2]', [[3300, 25, 0.7, '≡C–H (sharp)'], [2120, 25, 0.25, 'C≡C']]],
    ['Internal alkyne', '[CX2H0](#[CX2H0])', [[2220, 25, 0.1, 'C≡C (weak)']]],
    ['Alkene', '[CX3;!a]=[CX3;!a]', [[1650, 30, 0.35, 'C=C']]],
    ['Alkene C–H', '[CX3;!a;!H0]=[CX3;!a]', [[3080, 30, 0.35, '=C–H']]],
    ['Aromatic ring', 'a1aaaaa1', [[3040, 30, 0.3, 'Ar C–H'], [1600, 18, 0.45, 'C=C ring'], [1500, 18, 0.5, 'C=C ring'], [750, 30, 0.6, 'C–H out of plane']]],
    ['C–H (sp³)', '[CX4;!H0]', [[2930, 60, 0.75, 'C–H sp³'], [2860, 40, 0.5, 'C–H sp³'], [1460, 25, 0.45, 'CH₂/CH₃ bend']]],
    ['Ether', '[OD2]([#6;!$(C=O)])[#6;!$(C=O)]', [[1110, 50, 0.8, 'C–O–C']]],
    ['Nitro', '[N+](=O)[O-]', [[1530, 30, 0.95, 'N=O asym.'], [1350, 30, 0.85, 'N=O sym.']]],
    ['Imine', '[CX3]=[NX2]', [[1660, 30, 0.5, 'C=N']]],
    ['Thiol', '[SX2H]', [[2570, 30, 0.2, 'S–H (weak)']]],
    ['C–F', '[CX4]F', [[1150, 70, 0.85, 'C–F']]],
    ['C–Cl', '[#6]Cl', [[730, 50, 0.7, 'C–Cl']]],
    ['C–Br', '[#6]Br', [[600, 40, 0.65, 'C–Br']]],
    ['Isocyanate', 'N=C=O', [[2270, 30, 0.95, 'N=C=O']]],
    ['Carbon dioxide', 'O=C=O', [[2349, 20, 0.95, 'O=C=O asym.'], [667, 20, 0.6, 'bend']]],
    ['Sulfonyl', '[SX4](=O)(=O)', [[1350, 35, 0.85, 'S=O asym.'], [1160, 35, 0.85, 'S=O sym.']]],
  ];
  // conjugation lowers C=O by ~25 cm⁻¹
  const CONJ_CO = '[CX3](=O)[$(C=C),$(c)]';

  function predictIR() {
    const out = T().withMol((mol) => {
      const groups = [];
      IR.forEach(([name, smarts, bands]) => {
        const m = T().matches(mol, smarts);
        if (m.length) groups.push({ name, bands: bands.map((b) => ({ nu: b[0], w: b[1], s: b[2], label: b[3] })), atoms: [...new Set(m.flat())], n: m.length });
      });
      const conj = T().matches(mol, CONJ_CO).length > 0;
      if (conj) groups.forEach((g) => g.bands.forEach((b) => { if (b.label.startsWith('C=O')) { b.nu -= 25; b.label += ' (conjugated)'; } }));
      // an amide's C=O is not a ketone/ester C=O
      if (groups.some((g) => g.name === 'Amide')) groups.forEach((g) => { if (g.name === 'Ketone') g.drop = true; });
      if (groups.some((g) => g.name === 'O–H (carboxylic acid)')) groups.forEach((g) => { if (g.name === 'O–H (alcohol)' || g.name === 'Ketone') g.drop = true; });
      if (groups.some((g) => g.name === 'Anhydride' || g.name === 'Ester')) groups.forEach((g) => { if (g.name === 'Ether') g.drop = true; });
      return groups.filter((g) => !g.drop);
    });
    return out || [];
  }

  /** Transmittance (%) spectrum from the bands (Lorentzian absorptions). */
  function irCurve(groups) {
    const pts = [];
    const bands = groups.flatMap((g) => g.bands);
    for (let nu = 4000; nu >= 450; nu -= 4) {
      let A = 0;
      bands.forEach((b) => { const x = (nu - b.nu) / (b.w / 2); A += b.s / (1 + x * x); });
      pts.push([nu, 100 * Math.exp(-1.4 * A)]);
    }
    return pts;
  }

  /* ---------------- topological symmetry classes ---------------- */
  function symmetryClasses(g) {
    const ids = [...g.atoms.keys()];
    let lab = new Map(ids.map((id) => { const a = g.atoms.get(id); return [id, `${a.el}|${a.charge}|${a.h}|${a.arom ? 1 : 0}|${a.nbrs.length}`]; }));
    for (let it = 0; it < ids.length + 1; it++) {
      const next = new Map(ids.map((id) => {
        const a = g.atoms.get(id);
        const nb = a.nbrs.map((n) => `${n.order}:${lab.get(n.id)}`).sort().join(',');
        return [id, `${lab.get(id)}[${nb}]`];
      }));
      // compress labels to short integers so they don't grow without limit
      const uniq = [...new Set(next.values())].sort();
      const comp = new Map(ids.map((id) => [id, String(uniq.indexOf(next.get(id)))]));
      const before = new Set(lab.values()).size, after = new Set(comp.values()).size;
      lab = comp;
      if (after === before && it > 1) break;
    }
    return lab;    // id → class label
  }

  /* ---------------- substituent classification ---------------- */
  const HAL = { F: 1, Cl: 1, Br: 1, I: 1 };
  const isCO = (g, id) => { const a = g.atoms.get(id); return a && a.el === 'C' && a.nbrs.some((n) => n.order === 2 && g.atoms.get(n.id).el === 'O'); };
  /** What kind of substituent is atom x, as seen from atom c? */
  function subType(g, cId, xId) {
    const X = g.atoms.get(xId);
    const other = X.nbrs.filter((n) => n.id !== cId);
    if (X.el === 'C') {
      if (X.arom) return 'aryl';
      const tpl = other.find((n) => n.order === 3);
      if (tpl) return g.atoms.get(tpl.id).el === 'N' ? 'CN' : 'alkynyl';
      const dbl = other.find((n) => n.order === 2);
      if (dbl) {
        const D = g.atoms.get(dbl.id);
        if (D.el === 'O') {
          const rest = other.filter((n) => n !== dbl);
          if (!rest.length || X.h > 0) return 'CHO';
          const R = g.atoms.get(rest[0].id);
          if (R.el === 'O') return R.h > 0 ? 'COOH' : R.charge < 0 ? 'COO-' : 'COOR';
          if (R.el === 'N') return 'CONR2';
          if (R.el === 'Cl') return 'COCl';
          return 'COR';
        }
        if (D.el === 'N') return 'imine';
        return 'alkenyl';
      }
      if (other.filter((n) => g.atoms.get(n.id).el === 'F').length >= 2) return 'CF3';
      return 'alkyl';
    }
    if (X.el === 'O') {
      if (X.h > 0) return 'OH';
      const R = other[0] && g.atoms.get(other[0].id);
      if (!R) return X.charge < 0 ? 'OH' : 'OR';
      if (R.arom) return 'OAr';
      if (isCO(g, R.id)) return 'OCOR';
      return 'OR';
    }
    if (X.el === 'N') {
      if (X.charge > 0 && X.nbrs.some((n) => g.atoms.get(n.id).el === 'O')) return 'NO2';
      if (X.charge > 0) return 'N+';
      if (other.some((n) => isCO(g, n.id))) return 'NHCOR';
      return 'NR2';
    }
    if (HAL[X.el]) return X.el;
    if (X.el === 'S') return 'SR';
    return 'alkyl';
  }

  // sp³ C–H: α and β increments (ppm), relative to an alkyl substituent
  const ALPHA = { alkyl: 0, alkenyl: 0.8, alkynyl: 0.9, aryl: 1.45, CHO: 1.25, COR: 1.25, COOH: 1.15, COOR: 1.15, 'COO-': 1.0, CONR2: 1.1, COCl: 1.9, CN: 1.15, imine: 1.0, NR2: 1.45, NHCOR: 1.95, 'N+': 2.3, NO2: 3.4, OH: 2.5, OR: 2.45, OAr: 3.0, OCOR: 2.9, F: 3.4, Cl: 2.2, Br: 1.85, I: 1.3, SR: 1.25, CF3: 0.9 };
  const BETA = { OH: 0.3, OR: 0.3, OAr: 0.4, OCOR: 0.35, F: 0.3, Cl: 0.45, Br: 0.55, I: 0.55, NR2: 0.15, NHCOR: 0.2, NO2: 0.7, 'N+': 0.4, aryl: 0.35, COR: 0.2, CHO: 0.2, COOR: 0.2, COOH: 0.2, CONR2: 0.2, CN: 0.4, alkenyl: 0.15, alkynyl: 0.15 };
  // alkene C–H: Z(gem, cis, trans)
  const ZV = { alkyl: [0.45, -0.22, -0.28], aryl: [1.38, 0.36, -0.07], alkenyl: [1.0, -0.09, -0.23], alkynyl: [0.47, 0.38, 0.12], COR: [1.1, 1.12, 0.87], CHO: [1.02, 0.95, 1.17], COOH: [0.97, 1.41, 0.71], COOR: [0.8, 1.18, 0.55], 'COO-': [0.8, 1.0, 0.5], CONR2: [1.37, 0.98, 0.46], COCl: [1.11, 1.46, 1.01], CN: [0.27, 0.75, 0.55], OR: [1.22, -1.07, -1.21], OH: [1.22, -1.07, -1.21], OAr: [1.22, -1.07, -1.21], OCOR: [2.11, -0.35, -0.64], NR2: [0.8, -1.26, -1.21], NHCOR: [2.08, -0.57, -0.72], 'N+': [1.5, 0.3, 0.3], NO2: [1.87, 1.32, 0.62], F: [1.54, -0.4, -1.02], Cl: [1.08, 0.18, 0.13], Br: [1.07, 0.45, 0.55], I: [1.14, 0.81, 0.88], SR: [1.11, -0.29, -0.13], CF3: [0.66, 0.61, 0.32], imine: [1.0, 0.9, 0.6] };
  // aromatic C–H: ortho, meta, para
  const AR = { alkyl: [-0.18, -0.11, -0.21], aryl: [0.37, 0.2, 0.1], alkenyl: [0.06, -0.03, -0.1], alkynyl: [0.15, -0.02, -0.01], COR: [0.62, 0.14, 0.21], CHO: [0.56, 0.22, 0.29], COOH: [0.85, 0.18, 0.27], COOR: [0.71, 0.11, 0.21], 'COO-': [0.5, 0.05, 0.1], CONR2: [0.61, 0.1, 0.17], COCl: [0.84, 0.22, 0.36], CN: [0.36, 0.18, 0.28], OH: [-0.56, -0.12, -0.45], OR: [-0.48, -0.09, -0.44], OAr: [-0.29, -0.05, -0.23], OCOR: [-0.25, 0.03, -0.13], NR2: [-0.75, -0.25, -0.65], NHCOR: [0.12, -0.07, -0.28], 'N+': [0.69, 0.36, 0.31], NO2: [0.95, 0.26, 0.38], F: [-0.26, 0, -0.2], Cl: [0.03, -0.02, -0.09], Br: [0.18, -0.08, -0.04], I: [0.39, -0.21, 0], SR: [-0.08, -0.1, -0.24], CF3: [0.32, 0.14, 0.2], imine: [0.5, 0.1, 0.2] };
  const MULT = ['s', 'd', 't', 'q', 'quint', 'sext', 'sept', 'oct'];

  /** Which side of the line a→b is point p on (+1 / −1). */
  const sideOf = (a, b, p) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));

  /** Shortest path length between two atoms inside one ring. */
  function ringDistance(ring, i, j) {
    const a = ring.indexOf(i), b = ring.indexOf(j);
    if (a < 0 || b < 0) return null;
    const d = Math.abs(a - b);
    return Math.min(d, ring.length - d);
  }

  /** Predict the ¹H NMR environments. */
  function predictH() {
    const g = T().graph();
    if (!g.atoms.size) return [];
    const cls = symmetryClasses(g);
    const envs = new Map();      // key → env
    const addEnv = (key, parent, n, shift, kind, note) => {
      const e = envs.get(key);
      if (e) { e.n += n; e.atoms.push(parent); return; }
      envs.set(key, { key, n, shift, kind, note, atoms: [parent], cls: key });
    };
    g.atoms.forEach((A) => {
      if (A.h <= 0) return;
      const heavy = A.nbrs.map((n) => ({ ...n, at: g.atoms.get(n.id) }));
      const key = cls.get(A.id);
      if (A.el === 'O') {
        const C = heavy[0] && heavy[0].at;
        if (C && isCO(g, C.id)) addEnv(key, A.id, A.h, 11.5, 'exch', 'carboxylic acid O–H (10–13, broad)');
        else if (C && C.arom) addEnv(key, A.id, A.h, 5.5, 'exch', 'phenol O–H (4–7, broad)');
        else addEnv(key, A.id, A.h, 2.5, 'exch', 'alcohol O–H (1–5, broad, varies with concentration)');
        return;
      }
      if (A.el === 'N') {
        if (A.charge > 0) addEnv(key, A.id, A.h, 7.5, 'exch', 'ammonium N–H');
        else if (heavy.some((n) => isCO(g, n.id))) addEnv(key, A.id, A.h, 6.5, 'exch', 'amide N–H (5–8, broad)');
        else if (heavy.some((n) => n.at.arom)) addEnv(key, A.id, A.h, 3.6, 'exch', 'aryl amine N–H');
        else addEnv(key, A.id, A.h, 1.4, 'exch', 'amine N–H (0.5–3, broad)');
        return;
      }
      if (A.el === 'S') { addEnv(key, A.id, A.h, 1.5, 'exch', 'thiol S–H'); return; }
      if (A.el !== 'C') return;
      // aldehyde H
      if (heavy.some((n) => n.order === 2 && n.at.el === 'O')) {
        const conj = heavy.some((n) => n.order === 1 && (n.at.arom || n.at.nbrs.some((m) => m.order === 2 && g.atoms.get(m.id).el === 'C')));
        addEnv(key, A.id, A.h, conj ? 9.95 : 9.75, 'cho', 'aldehyde H (9–10)');
        return;
      }
      // terminal alkyne H
      const tri = heavy.find((n) => n.order === 3);
      if (tri) {
        const far = tri.at.nbrs.find((n) => n.id !== A.id);
        const st = far ? subType(g, tri.id, far.id) : 'alkyl';
        addEnv(key, A.id, A.h, 1.9 + (st === 'aryl' ? 1.15 : st === 'COR' || st === 'COOR' ? 1.0 : 0), 'alkyne', 'alkyne ≡C–H');
        return;
      }
      // aromatic H
      if (A.arom) {
        const ring = g.rings.find((r) => r.includes(A.id) && r.every((id) => g.atoms.get(id) && g.atoms.get(id).arom)) || [];
        let d = ring.length === 5 ? 6.8 : 7.27;
        if (ring.length) ring.forEach((rid) => {
          if (rid === A.id) return;
          const R = g.atoms.get(rid);
          const pos = ringDistance(ring, A.id, rid);
          if (R.el === 'N' && ring.length === 6) { d += [0, 1.33, -0.02, 0.38][pos] || 0; return; }
          R.nbrs.filter((n) => !ring.includes(n.id)).forEach((n) => {
            const st = subType(g, rid, n.id);
            const inc = AR[st];
            if (inc && pos >= 1 && pos <= 3) d += inc[pos - 1];
          });
        });
        addEnv(key, A.id, A.h, d, 'arom', 'aromatic H');
        return;
      }
      // alkene H
      const dbl = heavy.find((n) => n.order === 2 && n.at.el === 'C');
      if (dbl) {
        const P = getAtom(A.id), Q = getAtom(dbl.id);
        const gem = heavy.filter((n) => n.id !== dbl.id);
        const far = dbl.at.nbrs.filter((n) => n.id !== A.id).map((n) => ({ ...n, st: subType(g, dbl.id, n.id), side: sideOf(P, Q, getAtom(n.id)) }));
        let gemZ = 0;
        gem.forEach((n) => { const z = ZV[subType(g, A.id, n.id)]; if (z) gemZ += z[0]; });
        // where are this carbon's H atoms? one H: opposite its other substituent; two H: one on each side
        const hSides = A.h === 2 ? [1, -1] : [gem.length ? -sideOf(P, Q, getAtom(gem[0].id)) || 1 : 1];
        const shifts = hSides.map((s) => {
          let d = 5.25 + gemZ;
          far.forEach((f) => { const z = ZV[f.st]; if (z) d += f.side === s ? z[1] : z[2]; });
          return d;
        });
        if (A.h === 2 && Math.abs(shifts[0] - shifts[1]) > 0.02) {
          addEnv(key + 'a', A.id, 1, shifts[0], 'vinyl', '=CH₂ (H cis to the larger group)');
          addEnv(key + 'b', A.id, 1, shifts[1], 'vinyl', '=CH₂ (H trans)');
        } else addEnv(key, A.id, A.h, shifts[0], 'vinyl', 'alkene H');
        return;
      }
      // sp³ C–H
      const base = A.h === 3 ? 0.86 : A.h === 2 ? 1.3 : 1.5;
      const fac = A.h === 3 ? 1 : A.h === 2 ? 0.92 : 0.85;
      const alphas = heavy.map((n) => ALPHA[subType(g, A.id, n.id)] || 0).sort((x, y) => y - x);
      let d = base;
      alphas.forEach((inc, k) => { d += inc * fac * (k === 0 ? 1 : 0.8); });
      // β effects only through a saturated carbon (a C=O or ring's own atoms are part of the α group)
      heavy.forEach((n) => {
        if (n.at.el !== 'C' || n.at.arom || n.at.nbrs.some((m) => m.order > 1)) return;
        n.at.nbrs.forEach((m) => { if (m.id !== A.id) d += BETA[subType(g, n.id, m.id)] || 0; });
      });
      const ring = g.rings.find((r) => r.includes(A.id));
      if (ring && ring.length === 3) d -= 1.0;
      addEnv(key, A.id, A.h, Math.min(d, 6.2), 'sp3', A.h === 3 ? 'CH₃' : A.h === 2 ? 'CH₂' : 'CH');
    });
    // splitting: H on neighbouring atoms (not O/N/S, which exchange) in a different environment
    const out = [...envs.values()];
    out.forEach((e) => {
      if (e.kind === 'exch') { e.mult = 'br s'; e.nNb = 0; return; }
      let n = 0;
      const seen = new Set();
      e.atoms.forEach((pid) => {
        g.atoms.get(pid).nbrs.forEach((nb) => {
          const B = g.atoms.get(nb.id);
          if (!B.h || B.el !== 'C' || seen.has(`${pid}-${nb.id}`)) return;
          const bk = cls.get(B.id);
          if (bk === e.cls) return;                     // equivalent H don't split each other
          seen.add(`${pid}-${nb.id}`);
          if (pid === e.atoms[0]) n += B.h;
        });
      });
      // geminal partner of a split =CH₂ also couples (²J small, but counts in the textbook picture)
      e.nNb = n;
      e.mult = n < MULT.length ? MULT[n] : 'm';
      if (e.kind === 'arom' && n > 1) e.mult = 'm';
    });
    out.sort((a, b) => b.shift - a.shift);
    out.forEach((e, i) => { e.letter = String.fromCharCode(97 + i); e.shift = Math.round(e.shift * 100) / 100; });
    return out;
  }

  /** ¹³C environments with a rough shift. */
  function predictC() {
    const g = T().graph();
    const cls = symmetryClasses(g);
    const envs = new Map();
    g.atoms.forEach((A) => {
      if (A.el !== 'C') return;
      const k = cls.get(A.id);
      if (envs.has(k)) { envs.get(k).atoms.push(A.id); return; }
      let d, what;
      const nbAt = A.nbrs.map((n) => ({ ...n, at: g.atoms.get(n.id) }));
      const dblO = nbAt.find((n) => n.order === 2 && n.at.el === 'O');
      if (dblO) {
        const het = nbAt.find((n) => n.order === 1 && (n.at.el === 'O' || n.at.el === 'N' || n.at.el === 'Cl'));
        if (het) { d = het.at.el === 'N' ? 170 : het.at.el === 'Cl' ? 170 : 174; what = het.at.el === 'N' ? 'amide C=O' : het.at.el === 'Cl' ? 'acid chloride C=O' : 'acid/ester C=O'; }
        else if (A.h) { d = 200; what = 'aldehyde C=O'; } else { d = 207; what = 'ketone C=O'; }
      } else if (nbAt.some((n) => n.order === 3)) { d = nbAt.some((n) => n.at.el === 'N') ? 118 : 78; what = d > 100 ? 'nitrile C≡N' : 'alkyne C'; }
      else if (A.arom) {
        d = 128 + (nbAt.some((n) => !n.arom && (n.at.el === 'O' || n.at.el === 'N')) ? 25 : 0) + (nbAt.some((n) => !n.arom && n.at.el === 'C') ? 9 : 0)
          + (nbAt.some((n) => n.arom && n.at.el === 'N') ? 22 : 0);
        what = 'aromatic C';
      } else if (nbAt.some((n) => n.order === 2)) { d = 125 + (nbAt.some((n) => n.order === 1 && n.at.el === 'O') ? 20 : 0); what = 'alkene C'; }
      else {
        const nC = nbAt.filter((n) => n.at.el === 'C').length;
        d = nC ? -2 + 9 * nC : -2;
        nbAt.forEach((n) => {
          d += { O: 49, N: 28, F: 70, Cl: 27, Br: 15, I: -6, S: 12 }[n.at.el] || 0;
          if (n.at.el === 'C') {
            if (n.at.arom) d += 14;
            else if (isCO(g, n.id)) d += 22;
            else if (n.at.nbrs.some((m) => m.order >= 2)) d += 11;
            else n.at.nbrs.forEach((m) => { if (m.id !== A.id && 'ONCl'.includes(g.atoms.get(m.id).el)) d += 8; });   // β heteroatom
          }
        });
        what = nbAt.some((n) => n.at.el === 'O') ? 'C–O' : nbAt.some((n) => n.at.el === 'N') ? 'C–N' : 'sp³ C';
      }
      envs.set(k, { atoms: [A.id], shift: Math.round(d), what });
    });
    return [...envs.values()].sort((a, b) => b.shift - a.shift);
  }

  /* ---------------- drawing ---------------- */
  function drawSpectrum(cv, { xmin, xmax, pts, peaks = [], ylabel, xlabel, invert = false, integ = null }) {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 400, H = cv.clientHeight || 230;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0f1520'; c.fillRect(0, 0, W, H);
    const L = 40, R = 12, Tm = 14, B = 34, pw = W - L - R, ph = H - Tm - B;
    const X = (v) => L + ((xmax - v) / (xmax - xmin)) * pw;         // high values on the LEFT
    const Y = (v) => Tm + ph - (v / 100) * ph;
    c.font = '10.5px Inter, sans-serif'; c.fillStyle = '#9aa7b8'; c.strokeStyle = '#1f2a3d';
    const step = LabPlot.niceStep(xmax - xmin, 8);
    c.textAlign = 'center';
    for (let v = Math.ceil(xmin / step) * step; v <= xmax; v += step) {
      c.beginPath(); c.moveTo(X(v), Tm); c.lineTo(X(v), Tm + ph); c.stroke();
      c.fillText(String(Math.round(v * 10) / 10), X(v), H - B + 14);
    }
    c.fillStyle = '#e6edf3'; c.fillText(xlabel, L + pw / 2, H - 4);
    c.save(); c.translate(11, Tm + ph / 2); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore();
    c.strokeStyle = '#64748b'; c.beginPath(); c.moveTo(L, Tm); c.lineTo(L, Tm + ph); c.lineTo(L + pw, Tm + ph); c.stroke();
    c.strokeStyle = '#22d3ee'; c.lineWidth = 1.4; c.beginPath();
    pts.forEach(([x, y], i) => { const yy = invert ? Y(y) : Y(y); if (i) c.lineTo(X(x), yy); else c.moveTo(X(x), yy); });
    c.stroke();
    if (integ) {
      c.strokeStyle = '#f472b6'; c.lineWidth = 1.2; c.beginPath();
      integ.forEach(([x, y], i) => { if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y)); });
      c.stroke();
    }
    c.fillStyle = '#fde68a'; c.font = '10px Inter, sans-serif'; c.textAlign = 'center';
    peaks.forEach((p) => c.fillText(p.label, X(p.x), Math.max(Tm + 9, Y(p.y) - 5)));
  }

  /** NMR trace: Lorentzian lines, binomial multiplets (J = 7 Hz at 300 MHz). */
  function nmrTrace(envs, xmin, xmax) {
    const J = 7 / 300, w = 0.008;
    const lines = [];
    envs.forEach((e) => {
      const n = e.mult === 'br s' ? 0 : e.mult === 'm' ? 4 : e.nNb;
      const coef = [1];
      for (let k = 0; k < n; k++) { for (let i = coef.length - 1; i > 0; i--) coef[i] += coef[i - 1]; coef.push(1); }
      const tot = coef.reduce((a, b) => a + b, 0);
      coef.forEach((cf, i) => lines.push({ x: e.shift + (i - n / 2) * J, h: (e.n * cf) / tot, w: e.mult === 'br s' ? 0.08 : e.mult === 'm' ? 0.03 : w }));
    });
    const pts = [];
    let maxY = 1e-9;
    const raw = [];
    for (let x = xmax; x >= xmin; x -= (xmax - xmin) / 1800) {
      let y = 0;
      lines.forEach((l) => { const u = (x - l.x) / l.w; y += (l.h * l.w) / (l.w * (1 + u * u)); });
      raw.push([x, y]); maxY = Math.max(maxY, y);
    }
    raw.forEach(([x, y]) => pts.push([x, (y / maxY) * 88]));
    // integral trace (running sum, scaled to total H)
    let acc = 0;
    const tot = envs.reduce((a, e) => a + e.n, 0) || 1;
    const integ = [];
    const sorted = [...envs].sort((a, b) => b.shift - a.shift);
    let k = 0;
    for (let x = xmax; x >= xmin; x -= (xmax - xmin) / 400) {
      while (k < sorted.length && sorted[k].shift >= x) { acc += sorted[k].n; k++; }
      integ.push([x, 5 + (acc / tot) * 90]);
    }
    return { pts, integ };
  }

  /** A small multiplet picture (SVG) for the table. */
  function multSVG(e) {
    const n = e.mult === 'br s' ? 0 : e.mult === 'm' ? 0 : e.nNb;
    const coef = [1];
    for (let k = 0; k < n; k++) { for (let i = coef.length - 1; i > 0; i--) coef[i] += coef[i - 1]; coef.push(1); }
    const mx = Math.max(...coef);
    const W = 64, gap = Math.min(10, 56 / Math.max(1, n));
    const x0 = W / 2 - (n * gap) / 2;
    if (e.mult === 'br s') return `<svg width="${W}" height="22"><path d="M8 20 Q32 -4 56 20" fill="none" stroke="#22d3ee" stroke-width="1.5"/></svg>`;
    if (e.mult === 'm') return `<svg width="${W}" height="22">${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${14 + i * 7}" x2="${14 + i * 7}" y1="20" y2="${20 - [8, 14, 18, 16, 12, 7][i]}" stroke="#22d3ee" stroke-width="1.5"/>`).join('')}</svg>`;
    return `<svg width="${W}" height="22">${coef.map((cf, i) => `<line x1="${x0 + i * gap}" x2="${x0 + i * gap}" y1="20" y2="${20 - (cf / mx) * 18}" stroke="#22d3ee" stroke-width="1.6"/>`).join('')}</svg>`;
  }

  /* ---------------- the tab ---------------- */
  let tab = 'h';
  function render(el) {
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Draw or load a molecule to predict its spectra.</p>'; return; }
    if (!RDKit) { el.innerHTML = '<p class="muted-note">Waiting for RDKit…</p>'; return; }
    el.innerHTML = `
      <div class="seg" role="tablist"><button class="seg-b${tab === 'h' ? ' active' : ''}" data-sp="h">¹H NMR</button><button class="seg-b${tab === 'c' ? ' active' : ''}" data-sp="c">¹³C NMR</button><button class="seg-b${tab === 'ir' ? ' active' : ''}" data-sp="ir">IR</button></div>
      <div id="sp-body"></div>`;
    el.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.sp; render(el); }));
    const box = el.querySelector('#sp-body');
    if (tab === 'ir') renderIR(box); else if (tab === 'c') renderC(box); else renderH(box);
  }

  function renderIR(box) {
    const groups = predictIR();
    box.innerHTML = `<canvas class="tplot" id="sp-ir"></canvas>
      <table class="tt"><thead><tr><th>Group</th><th>Band / cm⁻¹</th><th>What it is</th></tr></thead><tbody>
      ${groups.flatMap((g, gi) => g.bands.map((b, bi) => `<tr data-g="${gi}"><td>${bi === 0 ? esc(g.name) : ''}</td><td class="mono">${Math.round(b.nu)}</td><td>${esc(b.label)} <span class="pill ${b.s > 0.7 ? 'ok' : b.s > 0.35 ? '' : 'warn'}">${b.s > 0.7 ? 'strong' : b.s > 0.35 ? 'medium' : 'weak'}</span></td></tr>`)).join('') || '<tr><td colspan="3" class="dim">No characteristic groups found</td></tr>'}
      </tbody></table>
      <p class="muted-note">Positions are typical textbook values; real spectra shift with conjugation, hydrogen bonding and ring strain. Below ~1500 cm⁻¹ is the <b>fingerprint region</b>: complex and unique to each molecule, so use it to match a known spectrum rather than to assign groups.</p>`;
    const pts = irCurve(groups);
    const peaks = [];
    groups.forEach((g) => g.bands.forEach((b) => { if (b.s > 0.45) peaks.push({ x: b.nu, y: 100 * Math.exp(-1.4 * b.s) - 4, label: b.label.split(' ')[0] }); }));
    drawSpectrum(box.querySelector('#sp-ir'), { xmin: 450, xmax: 4000, pts, peaks: peaks.slice(0, 9), ylabel: '% transmittance', xlabel: 'wavenumber / cm⁻¹' });
    box.querySelectorAll('tr[data-g]').forEach((tr) => tr.addEventListener('mouseenter', () => T().highlight({ atoms: groups[tr.dataset.g].atoms })));
    box.querySelector('table').addEventListener('mouseleave', () => T().clearHighlight());
  }

  function renderH(box) {
    const envs = predictH();
    const xmax = Math.max(10, Math.ceil(Math.max(0, ...envs.map((e) => e.shift)) + 1)), xmin = 0;
    box.innerHTML = `<canvas class="tplot" id="sp-h"></canvas>
      <table class="tt"><thead><tr><th></th><th>δ / ppm</th><th>H</th><th>Splitting</th><th></th><th>Environment</th></tr></thead><tbody>
      ${envs.map((e, i) => `<tr data-e="${i}"><td><b>${e.letter}</b></td><td class="mono">${e.shift.toFixed(2)}</td><td class="mono">${e.n}H</td><td>${e.mult}${e.nNb && e.mult !== 'm' ? ` <span class="dim">(${e.nNb} neighbour H)</span>` : ''}</td><td>${multSVG(e)}</td><td class="small">${esc(e.note)}</td></tr>`).join('') || '<tr><td colspan="6" class="dim">No hydrogen atoms</td></tr>'}
      </tbody></table>
      <p class="muted-note">${envs.length} signal${envs.length === 1 ? '' : 's'}, ${envs.reduce((a, e) => a + e.n, 0)} H in total (the pink integral line steps up in proportion). Hover a row to see the atoms. Predicted with additive increment tables (typical accuracy ±0.3 ppm) and the first-order n + 1 rule; diastereotopic H atoms and long-range coupling are not modelled.</p>`;
    const { pts, integ } = nmrTrace(envs, xmin, xmax);
    drawSpectrum(box.querySelector('#sp-h'), { xmin, xmax, pts, integ, peaks: envs.map((e) => ({ x: e.shift, y: 88, label: e.letter })), ylabel: 'intensity', xlabel: 'δ / ppm' });
    box.querySelectorAll('tr[data-e]').forEach((tr) => tr.addEventListener('mouseenter', () => {
      const e = envs[tr.dataset.e];
      T().highlight({ atoms: e.atoms, labels: e.atoms.map((id) => ({ id, text: e.letter })) });
    }));
    box.querySelector('table').addEventListener('mouseleave', () => T().clearHighlight());
  }

  function renderC(box) {
    const envs = predictC();
    box.innerHTML = `<canvas class="tplot" id="sp-c"></canvas>
      <table class="tt"><thead><tr><th>δ / ppm (≈)</th><th>C</th><th>Type</th></tr></thead><tbody>
      ${envs.map((e, i) => `<tr data-e="${i}"><td class="mono">${e.shift}</td><td class="mono">${e.atoms.length}</td><td>${esc(e.what)}</td></tr>`).join('') || '<tr><td colspan="3" class="dim">No carbon atoms</td></tr>'}
      </tbody></table>
      <p class="muted-note"><b>${envs.length}</b> carbon environment${envs.length === 1 ? '' : 's'} (= signals in a proton-decoupled ¹³C spectrum). Shifts are rough guides (±10 ppm): 0–50 sp³ C, 50–90 C–O/C–N, 110–150 aromatic and alkene C, 160–220 C=O.</p>`;
    const pts = [];
    for (let x = 230; x >= 0; x -= 0.25) {
      let y = 0;
      envs.forEach((e) => { const u = (x - e.shift) / 0.6; y += (e.atoms.length > 1 ? 1.3 : 1) / (1 + u * u); });
      pts.push([x, Math.min(95, y * 62)]);
    }
    drawSpectrum(box.querySelector('#sp-c'), { xmin: 0, xmax: 230, pts, ylabel: 'intensity', xlabel: 'δ / ppm' });
    box.querySelectorAll('tr[data-e]').forEach((tr) => tr.addEventListener('mouseenter', () => T().highlight({ atoms: envs[tr.dataset.e].atoms })));
    box.querySelector('table').addEventListener('mouseleave', () => T().clearHighlight());
  }

  StudioTools.add({ id: 'spectra', icon: '📈', title: 'Predicted spectra (IR, ¹H and ¹³C NMR)', short: 'Spectra', render, hide: () => T().clearHighlight() });
  return { predictIR, predictH, predictC, symmetryClasses };
})();
