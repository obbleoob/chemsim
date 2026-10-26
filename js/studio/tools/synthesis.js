/* ============================================================================
   ChemSim · studio/tools/synthesis.js
   ----------------------------------------------------------------------------
   Synthesis tools for the drawn molecule:
     • How it's made   functional groups (SMARTS) → standard preparations
                       (data/routes.js), each shown with the actual starting
                       material for YOUR molecule where a rule exists
     • Selectivity     alkene + reagent → product(s) with Markovnikov/anti-
                       Markovnikov regiochemistry and syn/anti stereochemistry
                       (built with wedges, so RDKit assigns R/S, racemates and
                       meso forms correctly)
     • Retrosynthesis  known disconnections applied backwards, as a tree you
                       can expand (1–3 steps). A learning aid, not a planner.

   Everything works on a small editable molecule graph (MG):
     { atoms: [{ el, charge, x, y }], bonds: [{ a, b, order, stereo }] }
   which is written as a MOL block for RDKit (SMILES, pictures, checks).
   ============================================================================ */
'use strict';

const Synthesis = (() => {
  const esc = (s) => StudioTools.esc(s);

  /* ---------------- the molecule graph ---------------- */
  const MG = {
    fromState() {
      const map = new Map();
      const m = { atoms: [], bonds: [] };
      state.atoms.forEach((a) => { map.set(a.id, m.atoms.length); m.atoms.push({ el: a.el, charge: a.charge, x: a.x, y: a.y, id: a.id }); });
      state.bonds.forEach((b) => m.bonds.push({ a: map.get(b.a1), b: map.get(b.a2), order: b.order, stereo: b.stereo }));
      return m;
    },
    fromSmiles(smi) {
      let mol = null;
      try {
        mol = RDKit.get_mol(smi);
        if (!mol || !mol.is_valid()) return null;
        mol.set_new_coords(true);
        mol.convert_to_kekule_form && mol.convert_to_kekule_form();
        const p = parseMolblock(mol.get_molblock());
        return { atoms: p.atoms.map((a) => ({ el: a.el, charge: a.charge, x: a.x * 33, y: -a.y * 33 })), bonds: p.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order === 4 ? 1 : b.order, stereo: b.stereo })) };
      } finally { if (mol) mol.delete(); }
    },
    clone: (m) => ({ atoms: m.atoms.map((a) => ({ ...a })), bonds: m.bonds.map((b) => ({ ...b })) }),
    nbrs: (m, i) => m.bonds.filter((b) => b.a === i || b.b === i).map((b) => ({ j: b.a === i ? b.b : b.a, order: b.order, bond: b })),
    bond: (m, i, j) => m.bonds.find((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i)),
    add(m, el, from, order = 1, opts = {}) {
      const A = m.atoms[from];
      const ang = opts.angle !== undefined ? opts.angle : MG.freeAngle(m, from);
      m.atoms.push({ el, charge: opts.charge || 0, x: A.x + 33 * Math.cos(ang), y: A.y + 33 * Math.sin(ang) });
      const j = m.atoms.length - 1;
      m.bonds.push({ a: from, b: j, order, stereo: opts.stereo || 0 });
      return j;
    },
    freeAngle(m, i) {
      const A = m.atoms[i];
      const angs = MG.nbrs(m, i).map((n) => Math.atan2(m.atoms[n.j].y - A.y, m.atoms[n.j].x - A.x)).sort((a, b) => a - b);
      if (!angs.length) return -Math.PI / 6;
      if (angs.length === 1) return angs[0] + (2 * Math.PI) / 3;
      let best = 0, gap = -1;
      for (let k = 0; k < angs.length; k++) {
        const a = angs[k], b = k + 1 < angs.length ? angs[k + 1] : angs[0] + 2 * Math.PI;
        if (b - a > gap) { gap = b - a; best = a + (b - a) / 2; }
      }
      return best;
    },
    removeBond(m, bond) { m.bonds = m.bonds.filter((b) => b !== bond); },
    removeAtom(m, i) {
      m.bonds = m.bonds.filter((b) => b.a !== i && b.b !== i).map((b) => ({ ...b, a: b.a > i ? b.a - 1 : b.a, b: b.b > i ? b.b - 1 : b.b }));
      m.atoms.splice(i, 1);
    },
    /** Split into connected pieces. */
    pieces(m) {
      const seen = new Set(), out = [];
      m.atoms.forEach((_, s) => {
        if (seen.has(s)) return;
        const comp = [];
        const st = [s];
        while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); comp.push(x); MG.nbrs(m, x).forEach((n) => st.push(n.j)); }
        comp.sort((a, b) => a - b);
        const idx = new Map(comp.map((x, k) => [x, k]));
        out.push({ atoms: comp.map((x) => ({ ...m.atoms[x] })), bonds: m.bonds.filter((b) => idx.has(b.a)).map((b) => ({ ...b, a: idx.get(b.a), b: idx.get(b.b) })) });
      });
      return out;
    },
    molblock(m) {
      const f = (v) => v.toFixed(4).padStart(10), p3 = (v) => String(v).padStart(3);
      const L = ['', '  ChemSim-syn', '', `${p3(m.atoms.length)}${p3(m.bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
      m.atoms.forEach((a) => L.push(`${f((a.x || 0) * MOL_SCALE)}${f(-(a.y || 0) * MOL_SCALE)}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`));
      m.bonds.forEach((b) => L.push(`${p3(b.a + 1)}${p3(b.b + 1)}${p3(b.order)}${p3(b.stereo || 0)}`));
      const ch = m.atoms.map((a, i) => [i + 1, a.charge]).filter(([, c]) => c);
      for (let k = 0; k < ch.length; k += 8) L.push(`M  CHG${p3(ch.slice(k, k + 8).length)}` + ch.slice(k, k + 8).map(([i, c]) => ` ${p3(i)} ${p3(c)}`).join(''));
      L.push('M  END');
      return L.join('\n');
    },
    /** Canonical SMILES (null if RDKit rejects it). */
    smiles(m) {
      let mol = null;
      try {
        mol = RDKit.get_mol(MG.molblock(m));
        if (!mol || !mol.is_valid()) return null;
        mol.remove_hs_in_place();          // explicit H atoms were only there to carry wedges
        return mol.get_smiles();
      } catch (e) { return null; } finally { if (mol) mol.delete(); }
    },
    /** H count of atom i from its valence. */
    h(m, i) {
      const a = m.atoms[i];
      if (a.el === 'H') return 0;
      const v = allowedValences(a.el, a.charge || 0).normal || 0;
      return Math.max(0, v - MG.nbrs(m, i).reduce((s, n) => s + n.order, 0));
    },
  };
  /** A picture of a molecule from its SMILES (RDKit SVG, dark theme). */
  function svgOf(smi, w = 150, h = 110) {
    let mol = null;
    try {
      mol = RDKit.get_mol(smi);
      if (!mol || !mol.is_valid()) return '';
      return mol.get_svg_with_highlights(JSON.stringify({ width: w, height: h, backgroundColour: [0.06, 0.08, 0.13, 1], bondLineWidth: 1.6, addStereoAnnotation: true, legendColour: [0.9, 0.9, 0.9],
        symbolColour: [0.9, 0.93, 0.96], atomColourPalette: { 6: [0.85, 0.88, 0.92], 7: [0.45, 0.6, 1], 8: [1, 0.4, 0.4], 9: [0.5, 0.95, 0.5], 17: [0.4, 0.9, 0.4], 35: [0.9, 0.5, 0.3], 53: [0.75, 0.45, 0.95], 16: [1, 0.85, 0.3], 15: [1, 0.6, 0.2] } }));
    } catch (e) { return ''; } finally { if (mol) mol.delete(); }
  }

  /* ---------------- aromaticity of an MG (from RDKit) ---------------- */
  function aromSet(m) {
    let mol = null;
    try {
      mol = RDKit.get_mol(MG.molblock(m));
      if (!mol || !mol.is_valid()) return new Set();
      const ext = (JSON.parse(mol.get_json()).molecules[0].extensions || []).find((x) => x.name === 'rdkitRepresentation') || {};
      return new Set(ext.aromaticAtoms || []);
    } catch (e) { return new Set(); } finally { if (mol) mol.delete(); }
  }

  /* ---------------- retrosynthesis rules ----------------
     Each rule(m, ar) returns [{ precursors: [MG…], site: [atom indices], text }] */
  const isC = (m, i) => m.atoms[i].el === 'C';
  const heavyN = (m, i) => MG.nbrs(m, i).filter((n) => m.atoms[n.j].el !== 'H');
  const cCount = (m, i) => MG.nbrs(m, i).filter((n) => isC(m, n.j)).length;
  const sp3 = (m, i, ar) => isC(m, i) && !ar.has(i) && MG.nbrs(m, i).every((n) => n.order === 1);
  const dblO = (m, i) => MG.nbrs(m, i).find((n) => n.order === 2 && m.atoms[n.j].el === 'O');
  const sglO = (m, i, needH) => MG.nbrs(m, i).find((n) => n.order === 1 && m.atoms[n.j].el === 'O' && (needH === undefined || (MG.h(m, n.j) > 0) === needH));
  const halo = (m, i) => MG.nbrs(m, i).find((n) => n.order === 1 && ['Cl', 'Br', 'I'].includes(m.atoms[n.j].el));
  const each = (m, pred) => m.atoms.map((_, i) => i).filter((i) => pred(i));

  /** Disconnect bond i–j; fn(clone, iNew, jNew) edits the two halves before splitting. */
  function disconnect(m, i, j, fn) {
    const c = MG.clone(m);
    MG.removeBond(c, MG.bond(c, i, j));
    fn(c, i, j);
    return MG.pieces(c);
  }
  /** Change atoms in a copy. */
  function edit(m, fn) { const c = MG.clone(m); fn(c); return [c]; }
  const dropAtom = (c, i) => MG.removeAtom(c, i);

  const RULES = {
    hydrogenate: { name: 'Hydrogenation', fwd: 'H₂, Pd/C', apply(m, ar) {
      const out = [];
      m.bonds.forEach((b) => {
        if (b.order !== 1 || !sp3(m, b.a, ar) || !sp3(m, b.b, ar) || !MG.h(m, b.a) || !MG.h(m, b.b)) return;
        if ([b.a, b.b].some((i) => MG.nbrs(m, i).some((n) => !isC(m, n.j)))) return;      // no enols / enamines
        if (cCount(m, b.a) + cCount(m, b.b) < 3) return;
        out.push({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 2; }) });
      });
      return out.slice(0, 2);
    } },
    eliminate_hx: { name: 'E2 elimination (reverse)', fwd: 'NaOEt, EtOH, heat', apply(m, ar) {
      return alkenes(m, ar).map(({ b, more }) => ({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 1; MG.add(c, 'Br', more); }) }));
    } },
    dehydrate: { name: 'Dehydration (reverse)', fwd: 'conc. H₂SO₄, 170 °C', apply(m, ar) {
      return alkenes(m, ar).map(({ b, more }) => ({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 1; MG.add(c, 'O', more); }) }));
    } },
    wittig: { name: 'Wittig disconnection', fwd: 'Ph₃P=CHR (from R–Br + PPh₃, then BuLi)', apply(m, ar) {
      const out = [];
      alkenes(m, ar).forEach(({ b }) => [[b.a, b.b], [b.b, b.a]].forEach(([x, y]) => {
        out.push({ site: [x, y], text: `C=O on the ${m.atoms[x].el}${x + 1} side, ylide from the other`, precursors: disconnect(m, x, y, (c) => { MG.add(c, 'O', x, 2); MG.add(c, 'Br', y); }) });
      }));
      return out;
    } },
    lindlar: { name: 'Partial hydrogenation of an alkyne', fwd: 'H₂, Lindlar catalyst (gives cis)', apply(m, ar) {
      return alkenes(m, ar).filter(({ b }) => heavyN(m, b.a).length <= 2 && heavyN(m, b.b).length <= 2).map(({ b }) => ({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 3; }) }));
    } },
    alkyne_alkylation: { name: 'Acetylide alkylation', fwd: 'NaNH₂, then R–Br', apply(m) {
      const out = [];
      m.bonds.filter((b) => b.order === 3 && isC(m, b.a) && isC(m, b.b)).forEach((t) => [[t.a, t.b], [t.b, t.a]].forEach(([x, y]) => {
        MG.nbrs(m, y).filter((n) => n.j !== x && n.order === 1 && isC(m, n.j) && MG.h(m, n.j) >= 2).forEach((n) => {
          out.push({ site: [y, n.j], precursors: disconnect(m, y, n.j, (c) => { MG.add(c, 'Br', n.j); }) });
        });
      }));
      return out;
    } },
    reduce_carbonyl: { name: 'Reduction of C=O', fwd: 'NaBH₄, MeOH', apply(m, ar) {
      return each(m, (i) => sp3(m, i, ar) && sglO(m, i, true) && MG.h(m, i) >= 1).map((i) => {
        const o = sglO(m, i, true);
        return { site: [i, o.j], precursors: edit(m, (c) => { MG.bond(c, i, o.j).order = 2; }) };
      });
    } },
    grignard: { name: 'Grignard disconnection', fwd: 'R–MgBr, dry ether; then H₃O⁺', apply(m, ar) {
      const out = [];
      each(m, (i) => sp3(m, i, ar) && sglO(m, i, true)).forEach((i) => {
        MG.nbrs(m, i).filter((n) => isC(m, n.j) && n.order === 1).forEach((n) => {
          out.push({ site: [i, n.j], precursors: disconnect(m, i, n.j, (c) => { MG.bond(c, i, sglO(c, i, true).j).order = 2; MG.add(c, 'Br', n.j); }) });
        });
      });
      return out;
    } },
    hydrate: { name: 'Hydration of an alkene (reverse)', fwd: 'H₂O, H₂SO₄ (Markovnikov)', apply(m, ar) {
      const out = [];
      each(m, (i) => sp3(m, i, ar) && sglO(m, i, true) && MG.h(m, i) <= 1).forEach((i) => {
        MG.nbrs(m, i).filter((n) => sp3(m, n.j, ar) && MG.h(m, n.j) >= 1).slice(0, 1).forEach((n) => {
          const o = sglO(m, i, true).j;
          out.push({ site: [i, n.j], precursors: edit(m, (c) => { MG.bond(c, i, n.j).order = 2; dropAtom(c, o); }) });
        });
      });
      return out;
    } },
    hydroborate: { name: 'Hydroboration–oxidation (reverse)', fwd: '1. BH₃·THF  2. H₂O₂, NaOH', apply(m, ar) {
      const out = [];
      each(m, (i) => sp3(m, i, ar) && sglO(m, i, true) && MG.h(m, i) >= 1).forEach((i) => {
        MG.nbrs(m, i).filter((n) => sp3(m, n.j, ar) && MG.h(m, n.j) >= 1 && cCount(m, n.j) >= cCount(m, i)).slice(0, 1).forEach((n) => {
          const o = sglO(m, i, true).j;
          out.push({ site: [i, n.j], precursors: edit(m, (c) => { MG.bond(c, i, n.j).order = 2; dropAtom(c, o); }) });
        });
      });
      return out;
    } },
    reduce_ester: { name: 'Reduction of an ester', fwd: 'LiAlH₄, dry THF; then H₃O⁺', apply(m, ar) {
      return each(m, (i) => sp3(m, i, ar) && sglO(m, i, true) && MG.h(m, i) === 2 && cCount(m, i) === 1).map((i) => ({ site: [i], precursors: edit(m, (c) => { MG.add(c, 'O', i, 2); const o = sglO(c, i, true).j; MG.add(c, 'C', o); }) }));
    } },
    hydrolyse_halide: { name: 'Hydrolysis of a haloalkane', fwd: 'NaOH(aq), reflux', apply(m, ar) {
      return each(m, (i) => sp3(m, i, ar) && sglO(m, i, true)).map((i) => ({ site: [i], precursors: edit(m, (c) => { c.atoms[sglO(c, i, true).j].el = 'Br'; }) }));
    } },
    dihydroxylate: { name: 'Dihydroxylation', fwd: 'OsO₄ (cat.), NMO', apply(m, ar) {
      const out = [];
      m.bonds.forEach((b) => {
        if (b.order !== 1 || !sp3(m, b.a, ar) || !sp3(m, b.b, ar) || !sglO(m, b.a, true) || !sglO(m, b.b, true)) return;
        const o1 = sglO(m, b.a, true).j, o2 = sglO(m, b.b, true).j;
        out.push({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 2; [o1, o2].sort((x, y) => y - x).forEach((o) => dropAtom(c, o)); }) });
      });
      return out;
    } },
    williamson: { name: 'Williamson disconnection', fwd: 'NaH, then R–Br (SN2, DMF)', apply(m, ar) {
      const out = [];
      each(m, (i) => m.atoms[i].el === 'O' && MG.nbrs(m, i).length === 2 && MG.nbrs(m, i).every((n) => n.order === 1 && isC(m, n.j) && !dblO(m, n.j))).forEach((o) => {
        MG.nbrs(m, o).filter((n) => sp3(m, n.j, ar) && cCount(m, n.j) <= 1).forEach((n) => {
          out.push({ site: [o, n.j], precursors: disconnect(m, o, n.j, (c) => { MG.add(c, 'Br', n.j); }) });
        });
      });
      return out;
    } },
    epoxidise: { name: 'Epoxidation', fwd: 'mCPBA, CH₂Cl₂', apply(m) {
      const out = [];
      each(m, (o) => m.atoms[o].el === 'O' && MG.nbrs(m, o).length === 2).forEach((o) => {
        const [x, y] = MG.nbrs(m, o).map((n) => n.j);
        if (MG.bond(m, x, y)) out.push({ site: [o, x, y], precursors: edit(m, (c) => { MG.bond(c, x, y).order = 2; dropAtom(c, o); }) });
      });
      return out;
    } },
    oxidise_to_aldehyde: { name: 'Oxidation of a primary alcohol', fwd: 'PCC, CH₂Cl₂', apply(m) {
      return each(m, (i) => isC(m, i) && dblO(m, i) && MG.h(m, i) === 1 && cCount(m, i) <= 1 && MG.nbrs(m, i).length <= 2).map((i) => ({ site: [i], precursors: edit(m, (c) => { MG.bond(c, i, dblO(c, i).j).order = 1; }) }));
    } },
    oxidise_2alcohol: { name: 'Oxidation of a secondary alcohol', fwd: 'Na₂Cr₂O₇, H₂SO₄ (or PCC)', apply(m) {
      return each(m, (i) => isC(m, i) && dblO(m, i) && cCount(m, i) === 2 && MG.nbrs(m, i).length === 3).map((i) => ({ site: [i], precursors: edit(m, (c) => { MG.bond(c, i, dblO(c, i).j).order = 1; }) }));
    } },
    friedel_acyl: { name: 'Friedel–Crafts acylation', fwd: 'RCOCl, AlCl₃', apply(m, ar) {
      const out = [];
      each(m, (i) => isC(m, i) && dblO(m, i) && MG.nbrs(m, i).length === 3 && MG.nbrs(m, i).filter((n) => n.order === 1).every((n) => isC(m, n.j))).forEach((i) => {
        MG.nbrs(m, i).filter((n) => ar.has(n.j) && n.order === 1).slice(0, 1).forEach((n) => {
          out.push({ site: [i, n.j], precursors: disconnect(m, i, n.j, (c) => { MG.add(c, 'Cl', i); }) });
        });
      });
      return out;
    } },
    oxidise_to_acid: { name: 'Oxidation of a primary alcohol', fwd: 'K₂Cr₂O₇, H₂SO₄, reflux', apply(m) {
      return acids(m).map(({ c, od, oh }) => ({ site: [c], precursors: edit(m, (x) => { dropAtom(x, od); }) }));
    } },
    nitrile_hydrolysis: { name: 'Hydrolysis of a nitrile', fwd: 'H₃O⁺, reflux', apply(m) {
      return acids(m).map(({ c, od, oh }) => ({ site: [c], precursors: edit(m, (x) => { x.atoms[od].el = 'N'; MG.bond(x, c, od).order = 3; dropAtom(x, oh); }) }));
    } },
    grignard_co2: { name: 'Carboxylation of a Grignard', fwd: '1. Mg, ether  2. CO₂  3. H₃O⁺', apply(m) {
      const out = [];
      acids(m).forEach(({ c, od, oh }) => {
        const r = MG.nbrs(m, c).find((n) => n.j !== od && n.j !== oh && isC(m, n.j));
        if (r) out.push({ site: [c, r.j], precursors: disconnect(m, c, r.j, (x) => { MG.add(x, 'Br', r.j); }).filter((p) => p.atoms.length > 3) });
      });
      return out;
    } },
    ester_fischer: { name: 'Fischer esterification', fwd: 'conc. H₂SO₄ (cat.), reflux', apply(m) {
      return esters(m).map(({ c, o, r }) => ({ site: [c, o], precursors: disconnect(m, c, o, (x) => { MG.add(x, 'O', c); }) }));
    } },
    ester_acyl: { name: 'Acyl chloride + alcohol', fwd: 'pyridine, CH₂Cl₂', apply(m) {
      return esters(m).map(({ c, o }) => ({ site: [c, o], precursors: disconnect(m, c, o, (x) => { MG.add(x, 'Cl', c); }) }));
    } },
    ester_anhydride: { name: 'Acid anhydride + alcohol/phenol', fwd: 'anhydride, H₂SO₄ or H₃PO₄ (cat.), warm', apply(m) {
      return esters(m).map(({ c, o }) => ({ site: [c, o], precursors: disconnect(m, c, o, (x) => {
        // the acyl half becomes the symmetrical anhydride R–C(=O)–O–C(=O)–R
        x.atoms[o].el = 'O';
      }).map((p, k, arr) => p) })).map((r) => {
        const pieces = r.precursors;
        const acylIdx = pieces.findIndex((p) => p.atoms.some((a, i) => a.el === 'C' && MG.nbrs(p, i).some((n) => n.order === 2 && p.atoms[n.j].el === 'O') && MG.nbrs(p, i).length === 2));
        if (acylIdx < 0) return null;
        const acyl = pieces[acylIdx];
        const ci = acyl.atoms.findIndex((a, i) => a.el === 'C' && MG.nbrs(acyl, i).some((n) => n.order === 2 && acyl.atoms[n.j].el === 'O') && MG.nbrs(acyl, i).length === 2);
        // RC(=O)– + –O–C(=O)R
        const anh = MG.clone(acyl);
        const n0 = anh.atoms.length;
        const bridge = MG.add(anh, 'O', ci);
        acyl.atoms.forEach((a) => anh.atoms.push({ ...a, x: a.x + 80 }));
        acyl.bonds.forEach((bb) => anh.bonds.push({ ...bb, a: bb.a + n0 + 1, b: bb.b + n0 + 1 }));
        anh.bonds.push({ a: bridge, b: ci + n0 + 1, order: 1, stereo: 0 });
        const alc = pieces[1 - acylIdx];
        const oi = alc.atoms.findIndex((a, i) => a.el === 'O' && MG.nbrs(alc, i).length === 1);
        return oi >= 0 ? { site: r.site, precursors: [anh, alc] } : null;
      }).filter(Boolean);
    } },
    amide_acyl: { name: 'Acyl chloride + amine', fwd: '2 equiv. amine (or Et₃N), CH₂Cl₂', apply(m) {
      return each(m, (c) => isC(m, c) && dblO(m, c)).flatMap((c) => MG.nbrs(m, c).filter((n) => n.order === 1 && m.atoms[n.j].el === 'N').map((n) => ({ site: [c, n.j], precursors: disconnect(m, c, n.j, (x) => { MG.add(x, 'Cl', c); }) })));
    } },
    acyl_chloride: { name: 'From the carboxylic acid', fwd: 'SOCl₂', apply(m) {
      return each(m, (c) => isC(m, c) && dblO(m, c) && halo(m, c) && m.atoms[halo(m, c).j].el === 'Cl').map((c) => ({ site: [c], precursors: edit(m, (x) => { x.atoms[halo(x, c).j].el = 'O'; }) }));
    } },
    cyanide: { name: 'SN2 with cyanide', fwd: 'NaCN, DMSO', apply(m, ar) {
      const out = [];
      m.bonds.filter((b) => b.order === 3).forEach((t) => {
        const [c, n] = m.atoms[t.a].el === 'C' ? [t.a, t.b] : [t.b, t.a];
        if (m.atoms[n].el !== 'N') return;
        const r = MG.nbrs(m, c).find((x) => x.j !== n && sp3(m, x.j, ar));
        if (r) out.push({ site: [c, r.j], precursors: disconnect(m, c, r.j, (x) => { MG.add(x, 'Br', r.j); }).filter((p) => p.atoms.length > 2) });
      });
      return out;
    } },
    reduce_nitrile: { name: 'Reduction of a nitrile', fwd: 'LiAlH₄, then H₂O', apply(m, ar) {
      return each(m, (n) => m.atoms[n].el === 'N' && MG.h(m, n) === 2 && MG.nbrs(m, n).length === 1).map((n) => MG.nbrs(m, n)[0].j).filter((c) => sp3(m, c, ar) && MG.h(m, c) === 2 && cCount(m, c) === 1)
        .map((c) => ({ site: [c], precursors: edit(m, (x) => { const n = MG.nbrs(x, c).find((k) => x.atoms[k.j].el === 'N').j; MG.bond(x, c, n).order = 3; }) }));
    } },
    reductive_amination: { name: 'Reductive amination', fwd: 'NaBH₃CN, MeOH, pH 6', apply(m, ar) {
      const out = [];
      each(m, (n) => m.atoms[n].el === 'N' && !m.atoms[n].charge && MG.nbrs(m, n).every((k) => k.order === 1) && !MG.nbrs(m, n).some((k) => dblO(m, k.j))).forEach((n) => {
        MG.nbrs(m, n).filter((k) => sp3(m, k.j, ar) && MG.h(m, k.j) >= 1 && cCount(m, k.j) >= 1).forEach((k) => {
          out.push({ site: [n, k.j], precursors: disconnect(m, n, k.j, (x) => { MG.add(x, 'O', k.j, 2); }) });
        });
      });
      return out;
    } },
    reduce_nitro: { name: 'Reduction of a nitroarene', fwd: 'Sn, conc. HCl; then NaOH', apply(m, ar) {
      return each(m, (n) => m.atoms[n].el === 'N' && MG.h(m, n) === 2 && MG.nbrs(m, n).length === 1 && ar.has(MG.nbrs(m, n)[0].j)).map((n) => ({ site: [n], precursors: edit(m, (x) => { x.atoms[n].charge = 1; MG.add(x, 'O', n, 2); MG.add(x, 'O', n, 1, { charge: -1 }); }) }));
    } },
    alcohol_to_halide: { name: 'From the alcohol', fwd: 'PBr₃ or SOCl₂', apply(m, ar) {
      return each(m, (c) => sp3(m, c, ar) && halo(m, c)).map((c) => ({ site: [c], precursors: edit(m, (x) => { x.atoms[halo(x, c).j].el = 'O'; }) }));
    } },
    hydrohalogenate: { name: 'Addition of HX to an alkene', fwd: 'HBr (Markovnikov)', apply(m, ar) {
      const out = [];
      each(m, (c) => sp3(m, c, ar) && halo(m, c) && MG.h(m, c) <= 1).forEach((c) => {
        MG.nbrs(m, c).filter((n) => sp3(m, n.j, ar) && MG.h(m, n.j) >= 1).slice(0, 1).forEach((n) => {
          const x = halo(m, c).j;
          out.push({ site: [c, n.j], precursors: edit(m, (q) => { MG.bond(q, c, n.j).order = 2; dropAtom(q, x); }) });
        });
      });
      return out;
    } },
    halogenate: { name: 'Addition of X₂ to an alkene', fwd: 'Br₂, CH₂Cl₂ (anti)', apply(m, ar) {
      const out = [];
      m.bonds.forEach((b) => {
        if (b.order !== 1 || !sp3(m, b.a, ar) || !sp3(m, b.b, ar) || !halo(m, b.a) || !halo(m, b.b)) return;
        const x1 = halo(m, b.a).j, x2 = halo(m, b.b).j;
        out.push({ site: [b.a, b.b], precursors: edit(m, (c) => { MG.bond(c, b.a, b.b).order = 2; [x1, x2].sort((p, q) => q - p).forEach((x) => dropAtom(c, x)); }) });
      });
      return out;
    } },
    aryl_halogenation: { name: 'Electrophilic halogenation', fwd: 'Br₂, FeBr₃', apply(m, ar) {
      return each(m, (c) => ar.has(c) && halo(m, c)).slice(0, 2).map((c) => ({ site: [c], precursors: edit(m, (x) => { dropAtom(x, halo(x, c).j); }) }));
    } },
    nitration: { name: 'Nitration', fwd: 'conc. HNO₃, conc. H₂SO₄, < 55 °C', apply(m, ar) {
      return each(m, (n) => m.atoms[n].el === 'N' && m.atoms[n].charge === 1 && MG.nbrs(m, n).filter((k) => m.atoms[k.j].el === 'O').length === 2 && MG.nbrs(m, n).some((k) => ar.has(k.j))).slice(0, 2)
        .map((n) => ({ site: [n], precursors: edit(m, (x) => { const os = MG.nbrs(x, n).filter((k) => x.atoms[k.j].el === 'O').map((k) => k.j).sort((p, q) => q - p); os.forEach((o) => dropAtom(x, o)); dropAtom(x, n); }) }));
    } },
    friedel_alkyl: { name: 'Friedel–Crafts alkylation', fwd: 'R–Cl, AlCl₃', apply(m, ar) {
      const out = [];
      each(m, (c) => sp3(m, c, ar) && MG.nbrs(m, c).some((n) => ar.has(n.j)) && MG.nbrs(m, c).every((n) => isC(m, n.j))).forEach((c) => {
        const a = MG.nbrs(m, c).find((n) => ar.has(n.j));
        if (cCount(m, c) >= 2 || MG.h(m, c) === 3) out.push({ site: [c, a.j], precursors: disconnect(m, c, a.j, (x) => { MG.add(x, 'Cl', c); }) });
      });
      return out.slice(0, 2);
    } },
    suzuki: { name: 'Suzuki coupling', fwd: 'Pd(PPh₃)₄, K₂CO₃', apply(m, ar) {
      return m.bonds.filter((b) => b.order === 1 && ar.has(b.a) && ar.has(b.b) && !ringBond(m, b)).map((b) => ({ site: [b.a, b.b], precursors: disconnect(m, b.a, b.b, (x) => { MG.add(x, 'Br', b.a); const B = MG.add(x, 'B', b.b); MG.add(x, 'O', B); MG.add(x, 'O', B); }) }));
    } },
  };
  function ringBond(m, bond) {
    const c = MG.clone(m);
    MG.removeBond(c, MG.bond(c, bond.a, bond.b));
    return MG.pieces(c).length === MG.pieces(m).length;
  }
  function alkenes(m, ar) {
    return m.bonds.filter((b) => b.order === 2 && isC(m, b.a) && isC(m, b.b) && !ar.has(b.a) && !ar.has(b.b)).map((b) => ({ b, more: cCount(m, b.a) >= cCount(m, b.b) ? b.a : b.b }));
  }
  function acids(m) {
    return each(m, (c) => isC(m, c) && dblO(m, c) && sglO(m, c, true)).map((c) => ({ c, od: dblO(m, c).j, oh: sglO(m, c, true).j }));
  }
  function esters(m) {
    return each(m, (c) => isC(m, c) && dblO(m, c)).flatMap((c) => MG.nbrs(m, c).filter((n) => n.order === 1 && m.atoms[n.j].el === 'O' && MG.nbrs(m, n.j).length === 2).map((n) => ({ c, o: n.j })));
  }

  /** Simple starting materials (canonical SMILES) you could buy. */
  const COMMON = new Set(['c1ccccc1', 'Cc1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1', 'O=C(O)c1ccccc1', 'O=Cc1ccccc1', 'Brc1ccccc1', 'Clc1ccccc1', 'CC(C)=O', 'CC(=O)O', 'CC(=O)OC(C)=O', 'CC(=O)Cl', 'CCO', 'CO', 'CCCO', 'CC(C)O', 'CCCCO', 'CC=O', 'C=O', 'O=C=O', 'C=C', 'C=CC', 'CC=CC', 'C=CCC', 'CBr', 'CCBr', 'CCCBr', 'CC(C)Br', 'CI', 'CCl', 'CC(C)(C)O', 'CCOCC', 'C#C', 'CC#N', 'CCC(=O)O', 'O=C(O)CO', 'OC(O)', 'CN', 'CCN', 'N', 'CC(C)=C', 'C1CCCCC1', 'O=C1CCCCC1', 'OC1CCCCC1', 'C1=CCCCC1', 'CC(=O)CC', 'CCC=O', 'BrCc1ccccc1', 'OCc1ccccc1', 'CCCC=O', 'ClCc1ccccc1', 'CC(C)Cl', 'CCCl', 'CC(C)(C)Cl', 'CC(C)(C)Br', 'C=CC=C', 'CCCCBr', 'OB(O)c1ccccc1', 'CC(C)C=O', 'OCC(O)CO', 'OCCO', 'C1COCCO1', 'C1CCOC1', 'CCC(C)=O', 'O', 'ClC(Cl)Cl', 'O=C(Cl)c1ccccc1', 'CCC(=O)Cl', 'NCc1ccccc1', 'CNC', 'CN(C)C', 'CCNCC']);
  const heavyCount = (smi) => { let mol = null; try { mol = RDKit.get_mol(smi); return mol && mol.is_valid() ? JSON.parse(mol.get_descriptors()).NumHeavyAtoms : 99; } finally { if (mol) mol.delete(); } };
  const isSimple = (smi) => !!smi && (COMMON.has(smi) || heavyCount(smi) <= 4);

  /** All disconnections of a molecule (given as SMILES). */
  function retro(smi) {
    const m = MG.fromSmiles(smi);
    if (!m) return [];
    const ar = aromSet(m);
    const out = [], seen = new Set();
    Object.entries(RULES).forEach(([id, rule]) => {
      let res = [];
      try { res = rule.apply(m, ar); } catch (e) { warn('synthesis', `rule ${id} failed`, e); }
      res.forEach((r) => {
        const pre = r.precursors.map((p) => MG.smiles(p)).filter(Boolean);
        if (!pre.length || pre.length !== r.precursors.length) return;
        const key = id + ':' + pre.slice().sort().join('.');
        if (seen.has(key) || pre.includes(smi)) return;
        seen.add(key);
        out.push({ id, name: rule.name, fwd: rule.fwd, pre, text: r.text || '' });
      });
    });
    // rank: C–C bond-forming disconnections first, then fewer heavy atoms in the biggest precursor
    const ccForming = ['grignard', 'wittig', 'alkyne_alkylation', 'friedel_acyl', 'friedel_alkyl', 'suzuki', 'grignard_co2', 'cyanide'];
    const size = (s) => s.replace(/[^A-Z]/g, '').length;
    out.sort((a, b) => (ccForming.includes(b.id) - ccForming.includes(a.id)) || (Math.max(...a.pre.map(size)) - Math.max(...b.pre.map(size))));
    return out;
  }

  /** Precursors for one route of "How it's made", for the current molecule. */
  function routePrecursors(ruleId) {
    const smi = state.rd && state.rd.smiles;
    if (!smi || !RULES[ruleId]) return [];
    return retro(smi).filter((r) => r.id === ruleId);
  }

  /* ---------------- selectivity sandbox ---------------- */
  const REAGENTS = {
    HBr: { name: 'HBr', add: ['Br', 'H'], regio: 'markovnikov', stereo: 'none', mech: 'Electrophilic addition: H⁺ adds first to give the MORE stable carbocation, then Br⁻ attacks it. Markovnikov.', cation: true },
    HBr_ROOR: { name: 'HBr, peroxides (ROOR)', add: ['H', 'Br'], regio: 'markovnikov', stereo: 'none', mech: 'Radical chain: Br• adds first to give the more stable carbon RADICAL, so Br ends up on the LESS substituted carbon (anti-Markovnikov). Only works for HBr.' },
    H2O: { name: 'H₂O, H₂SO₄ (cat.)', add: ['O', 'H'], regio: 'markovnikov', stereo: 'none', mech: 'Acid-catalysed hydration via a carbocation: Markovnikov; rearrangements are possible.', cation: true },
    oxymerc: { name: '1. Hg(OAc)₂, H₂O  2. NaBH₄', add: ['O', 'H'], regio: 'markovnikov', stereo: 'none', mech: 'Oxymercuration: a bridged mercurinium ion, so no rearrangement; Markovnikov alcohol.' },
    hydrobor: { name: '1. BH₃·THF  2. H₂O₂, NaOH', add: ['H', 'O'], regio: 'markovnikov', stereo: 'syn', mech: 'Hydroboration: B adds to the less hindered carbon in a concerted four-centre step (syn); oxidation replaces B by OH with retention. Anti-Markovnikov, syn.' },
    Br2: { name: 'Br₂, CH₂Cl₂', add: ['Br', 'Br'], regio: 'none', stereo: 'anti', mech: 'A cyclic bromonium ion forms; Br⁻ opens it from the back face: anti addition.' },
    Br2H2O: { name: 'Br₂, H₂O', add: ['O', 'Br'], regio: 'markovnikov', stereo: 'anti', mech: 'Bromonium ion opened by water at the MORE substituted carbon (it carries more positive charge): halohydrin, anti.' },
    H2: { name: 'H₂, Pd/C', add: ['H', 'H'], regio: 'none', stereo: 'syn', mech: 'Both H atoms are delivered from the catalyst surface to the same face: syn.' },
    mCPBA: { name: 'mCPBA', epoxide: true, stereo: 'syn', mech: 'Concerted O transfer: stereospecific, the alkene geometry is kept (cis alkene → cis epoxide).' },
    OsO4: { name: 'OsO₄ (cat.), NMO', add: ['O', 'O'], regio: 'none', stereo: 'syn', mech: 'Cyclic osmate ester: both OH groups on the same face (syn diol).' },
    O3: { name: '1. O₃  2. Me₂S', cleave: 'ozone', mech: 'Ozonolysis cuts the C=C; each alkene carbon becomes a C=O (aldehyde or ketone).' },
    KMnO4: { name: 'KMnO₄, H⁺, heat', cleave: 'permanganate', mech: 'Oxidative cleavage: C=C carbons with H become carboxylic acids (=CH₂ becomes CO₂); carbons with two R groups become ketones.' },
  };

  function sandbox(bondId, key) {
    const R = REAGENTS[key];
    const m = MG.fromState();
    const b0 = state.bonds.find((b) => b.id === bondId);
    const ia = state.atoms.findIndex((a) => a.id === b0.a1), ib = state.atoms.findIndex((a) => a.id === b0.a2);
    const c = cCount(m, ia), d = cCount(m, ib);
    const more = c >= d ? ia : ib, less = more === ia ? ib : ia;
    const tie = c === d;
    const notes = [];
    const products = [];
    const build = (fn) => { const x = MG.clone(m); fn(x); return x; };
    if (R.cleave) {
      const x = build((q) => {
        MG.removeBond(q, MG.bond(q, ia, ib));
        [ia, ib].forEach((i) => {
          MG.add(q, 'O', i, 2);
          if (R.cleave === 'permanganate' && MG.h(q, i) >= 1) MG.add(q, 'O', i, 1);
        });
      });
      MG.pieces(x).forEach((p) => {
        let s = MG.smiles(p);
        if (s === 'O=CO' && R.cleave === 'permanganate') s = 'O=C=O';
        if (s) products.push({ smi: s });
      });
    } else if (R.epoxide) {
      // O bridges the two carbons; both C–O bonds wedged = same face (syn)
      const x = build((q) => {
        MG.bond(q, ia, ib).order = 1;
        const A = q.atoms[ia], B = q.atoms[ib];
        const ang = MG.freeAngle(q, ia);
        q.atoms.push({ el: 'O', charge: 0, x: (A.x + B.x) / 2 + 22 * Math.cos(ang), y: (A.y + B.y) / 2 + 22 * Math.sin(ang) });
        const o = q.atoms.length - 1;
        q.bonds.push({ a: ia, b: o, order: 1, stereo: 1 }, { a: ib, b: o, order: 1, stereo: 1 });
      });
      products.push(...withEnantiomer(x));
    } else {
      // where does each added group go?
      const [gMore, gLess] = R.add;            // [group on the more substituted C, group on the less substituted C]
      const stereo = R.stereo;
      const x = build((q) => {
        MG.bond(q, ia, ib).order = 1;
        const put = (atom, el, face) => MG.add(q, el, atom, 1, { stereo: face });
        // syn: both new bonds toward you (wedge); anti: one wedge, one dash
        const fMore = stereo === 'none' ? 0 : 1, fLess = stereo === 'none' ? 0 : stereo === 'syn' ? 1 : 6;
        put(more, gMore, fMore);
        put(less, gLess, fLess);
      });
      // explicit H atoms only matter for stereo; RDKit folds them in
      products.push(...withEnantiomer(x));
      if (R.regio === 'markovnikov' && !tie) notes.push(key === 'HBr_ROOR' ? `Br goes to the less substituted carbon (${atomLabelName(state.atoms[less].id)}).` : key === 'hydrobor' ? `OH goes to the less substituted carbon (${atomLabelName(state.atoms[less].id)}): anti-Markovnikov.` : `${R.add[0] === 'O' ? 'OH' : R.add[0]} goes to the more substituted carbon (${atomLabelName(state.atoms[more].id)}): Markovnikov.`);
      if (R.regio === 'markovnikov' && tie) notes.push('Both alkene carbons are equally substituted, so both orientations form (a mixture of regioisomers).');
      if (R.cation) {
        const cat = more;
        const neighbourMore = MG.nbrs(m, cat).some((n) => n.j !== less && isC(m, n.j) && cCount(m, n.j) > cCount(m, cat) && cCount(m, n.j) >= 3);
        if (neighbourMore) notes.push('⚠ The carbocation is next to a more substituted carbon: a 1,2-hydride or methyl shift can give a rearranged product.');
      }
    }
    return { R, products, notes, more, less };
  }
  /** Product SMILES, plus its enantiomer if chiral (formed equally from an achiral alkene). */
  function withEnantiomer(x) {
    const s = MG.smiles(x);
    if (!s) return [];
    const mirror = MG.clone(x);
    mirror.bonds.forEach((b) => { if (b.stereo === 1) b.stereo = 6; else if (b.stereo === 6) b.stereo = 1; });
    const s2 = MG.smiles(mirror);
    if (!s.includes('@')) return [{ smi: s, note: '' }];
    if (s2 === s) return [{ smi: s, note: 'meso / achiral (its mirror image is the same compound)' }];
    return [{ smi: s, note: 'racemic: formed 50 : 50 with its enantiomer →' }, { smi: s2, note: 'enantiomer' }];
  }

  /* ---------------- the tab ---------------- */
  let view = 'how', sbBond = null, sbReagent = 'HBr';
  const tree = { root: null, open: new Map() };

  function render(el) {
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Draw or load a target molecule (try ethyl ethanoate, 2-methylbutan-2-ol, or an alkene such as 1-methylcyclohexene: CC1=CCCCC1).</p>'; return; }
    if (!RDKit || !(state.rd && state.rd.ok)) { el.innerHTML = '<p class="muted-note">RDKit needs a valid structure (fix any red atoms).</p>'; return; }
    el.innerHTML = `<div class="seg"><button class="seg-b${view === 'how' ? ' active' : ''}" data-sv="how">How it’s made</button><button class="seg-b${view === 'sel' ? ' active' : ''}" data-sv="sel">Selectivity</button><button class="seg-b${view === 'retro' ? ' active' : ''}" data-sv="retro">Retrosynthesis</button></div><div id="sv-body"></div>`;
    el.querySelectorAll('[data-sv]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.sv; render(el); }));
    const box = el.querySelector('#sv-body');
    if (view === 'how') renderHow(box); else if (view === 'sel') renderSel(box); else renderRetro(box);
  }

  function renderHow(box) {
    const found = StudioTools.withMol((mol) => ROUTES.map((g) => ({ g, atoms: [...new Set(StudioTools.matches(mol, g.smarts).flat())] })).filter((x) => x.atoms.length)) || [];
    // hide generic groups when a more specific one covers them
    const ids = new Set(found.map((f) => f.g.id));
    const shown = found.filter((f) => !(f.g.id === 'alkane' && ids.size > 1) && !(f.g.id === 'arene' && ids.size > 2) && !(f.g.id === 'alcohol' && ids.has('diol')) && !(f.g.id === 'halide' && ids.has('dihalide')) && !(f.g.id === 'ether' && (ids.has('epoxide') || ids.has('acetal'))) && !(f.g.id === 'ketone' && (ids.has('ester') || ids.has('amide') || ids.has('acid'))));
    if (!shown.length) { box.innerHTML = '<p class="muted-note">No functional groups from the route database were found.</p>'; return; }
    box.innerHTML = `<p class="small">Functional groups found: ${shown.map((f, i) => `<button class="pill fg-pill" data-fg="${i}">${esc(f.g.name)}</button>`).join(' ')}</p><div id="how-list"></div>`;
    const list = box.querySelector('#how-list');
    const show = (i) => {
      const f = shown[i];
      StudioTools.highlight({ atoms: f.atoms, color: '52,211,153' });
      list.innerHTML = f.g.routes.map((r, k) => `<div class="card route"><h2 style="text-transform:none;letter-spacing:0;color:var(--text);font-size:14px">${esc(r.name)} <span class="h2-note">${esc(r.mech)}</span></h2>
        <table class="tt"><tbody>
          <tr><th>From</th><td>${esc(r.from)}</td></tr>
          <tr><th>Reagents</th><td><b>${esc(r.reagents)}</b></td></tr>
          <tr><th>Conditions</th><td>${esc(r.cond)}</td></tr>
          <tr><th>Solvent</th><td>${esc(r.solvent)}</td></tr>
          ${r.notes ? `<tr><th>Notes</th><td>${esc(r.notes)}</td></tr>` : ''}
        </tbody></table>
        ${r.retro ? `<div class="pre-row" data-rr="${r.retro}" data-k="${k}"></div>` : ''}</div>`).join('');
      list.querySelectorAll('[data-rr]').forEach((d) => {
        const pre = routePrecursors(d.dataset.rr);
        if (!pre.length) { d.innerHTML = '<p class="muted-note">This route does not apply directly to your molecule’s structure.</p>'; return; }
        d.innerHTML = `<div class="small dim">For your molecule, start from:</div>` + pre.slice(0, 2).map((p) => `<div class="row">${p.pre.map((s) => `<figure class="mol-fig">${svgOf(s)}<figcaption class="mono">${esc(s)}${isSimple(s) ? ' ✓' : ''}</figcaption><button class="mini" data-load="${esc(s)}">Draw</button></figure>`).join('<span class="plus">+</span>')}</div>`).join('');
      });
      list.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => loadSmiles(b.dataset.load)));
      box.querySelectorAll('.fg-pill').forEach((p, j) => p.classList.toggle('ok', j === i));
    };
    box.querySelectorAll('[data-fg]').forEach((p) => p.addEventListener('click', () => show(Number(p.dataset.fg))));
    show(0);
  }

  function renderSel(box) {
    const ar = new Set([...StudioTools.graph().atoms.values()].filter((a) => a.arom).map((a) => a.id));
    const alk = state.bonds.filter((b) => b.order === 2 && getAtom(b.a1).el === 'C' && getAtom(b.a2).el === 'C' && !ar.has(b.a1) && !ar.has(b.a2));
    if (!alk.length) { box.innerHTML = '<p class="muted-note">The selectivity sandbox needs an alkene (a non-aromatic C=C). Try propene (C=CC), 1-methylcyclohexene (CC1=CCCCC1), cis-2-butene or styrene.</p>'; return; }
    if (!sbBond || !alk.some((b) => b.id === sbBond)) sbBond = alk[0].id;
    const res = sandbox(sbBond, sbReagent);
    box.innerHTML = `<div class="row">${alk.length > 1 ? `<label class="small">Alkene <select id="sb-bond">${alk.map((b) => `<option value="${b.id}"${b.id === sbBond ? ' selected' : ''}>${atomLabelName(b.a1)}=${atomLabelName(b.a2)}</option>`).join('')}</select></label>` : ''}
      <label class="small">Reagent <select id="sb-r">${Object.entries(REAGENTS).map(([k, r]) => `<option value="${k}"${k === sbReagent ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
      <div class="card"><h2>Product${res.products.length > 1 ? 's' : ''}</h2><div class="row">${res.products.map((p) => `<figure class="mol-fig">${svgOf(p.smi, 170, 130)}<figcaption class="mono">${esc(p.smi)}</figcaption>${p.note ? `<figcaption class="small">${esc(p.note)}</figcaption>` : ''}<button class="mini" data-load="${esc(p.smi)}">Draw</button></figure>`).join('')}</div>
        <p class="small"><b>Mechanism:</b> ${esc(res.R.mech)}</p>
        ${res.R.stereo && res.R.stereo !== 'none' ? `<p class="small"><b>Stereochemistry:</b> ${res.R.stereo} addition${res.R.stereo === 'syn' ? ' (both new bonds on the same face)' : ' (new bonds on opposite faces)'}.</p>` : ''}
        ${res.notes.map((n) => `<p class="small">${esc(n)}</p>`).join('')}
        <p class="muted-note">Pictures by RDKit: wedges show the stereochemistry it assigned. Products from an achiral alkene and achiral reagents are racemic whenever they are chiral.</p></div>`;
    StudioTools.highlight({ bonds: [sbBond], atoms: [state.atoms[res.more] && state.atoms[res.more].id].filter(Boolean), labels: state.atoms[res.more] ? [{ id: state.atoms[res.more].id, text: 'more subst.' }] : [] });
    const sb = box.querySelector('#sb-bond');
    if (sb) sb.addEventListener('change', (e) => { sbBond = Number(e.target.value); renderSel(box); });
    box.querySelector('#sb-r').addEventListener('change', (e) => { sbReagent = e.target.value; renderSel(box); });
    box.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => loadSmiles(b.dataset.load)));
  }

  function renderRetro(box) {
    const smi = state.rd.smiles;
    if (tree.root !== smi) { tree.root = smi; tree.open = new Map(); }
    const node = (s, depth, path) => {
      const kids = tree.open.get(path);
      const simple = isSimple(s);
      let h = `<div class="rnode" style="margin-left:${depth * 14}px"><div class="row"><figure class="mol-fig small-fig">${svgOf(s, 120, 90)}<figcaption class="mono">${esc(s)}</figcaption></figure>
        <div class="small">${simple ? '<span class="pill ok">simple starting material</span>' : depth >= 3 ? '<span class="pill">depth limit</span>' : `<button class="hbtn small" data-exp="${esc(path)}" data-smi="${esc(s)}">${kids ? '▾ Hide' : '▸ Disconnect'}</button>`}
        <button class="mini" data-load="${esc(s)}">Draw</button></div></div>`;
      if (kids) {
        if (!kids.length) h += `<div class="muted-note" style="margin-left:${depth * 14 + 14}px">No known disconnection from the rule set.</div>`;
        kids.slice(0, 6).forEach((k, i) => {
          h += `<div class="rstep" style="margin-left:${depth * 14 + 8}px">⇐ <b>${esc(k.name)}</b> <span class="dim">(forward: ${esc(k.fwd)})</span>${k.text ? ` <span class="dim">· ${esc(k.text)}</span>` : ''} <button class="mini" data-calc="${esc(k.pre.join('.'))}" data-prod="${esc(s)}" data-tip="Open this step in the yield & green-metrics calculator">🧮</button></div>`;
          k.pre.forEach((p, j) => { h += node(p, depth + 1, `${path}/${i}.${j}`); });
        });
      }
      return h + '</div>';
    };
    box.innerHTML = `<p class="small">Each step works backwards (⇐): the precursors below a molecule can be turned into it by the forward reaction shown. Expand precursors to go deeper (up to 3 steps). ✓ marks simple, commercially available compounds.</p><div class="retro-tree">${node(smi, 0, 'r')}</div>
      <p class="muted-note">Rule-based (about 35 standard disconnections). It does not check protecting-group needs, competing functional groups or stereochemistry, which a real synthesis must.</p>`;
    box.querySelectorAll('[data-calc]').forEach((b) => b.addEventListener('click', () => Calculator.load(b.dataset.calc.split('.'), [b.dataset.prod])));
    box.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.exp;
      if (tree.open.has(p)) { [...tree.open.keys()].filter((k) => k.startsWith(p)).forEach((k) => tree.open.delete(k)); }
      else tree.open.set(p, retro(b.dataset.smi));
      renderRetro(box);
    }));
    box.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => loadSmiles(b.dataset.load)));
  }

  StudioTools.add({ id: 'synth', icon: '⚗️', title: 'Synthesis: preparations, selectivity, retrosynthesis', short: 'Synthesis', render, hide: () => StudioTools.clearHighlight() });
  return { MG, retro, sandbox, routePrecursors, svgOf, isSimple, REAGENTS, RULES };
})();
