/* ============================================================================
   ChemSim · studio/engine.js
   ----------------------------------------------------------------------------
   Our own chemistry engine: valence, octet, charges, oxidation numbers.
   ============================================================================ */
'use strict';

/* ============================================================================
   7. CHEMISTRY ENGINE (our own, runs instantly on every edit)
   ----------------------------------------------------------------------------
   For each atom we work out:
     • bondSum     – sum of bond orders (double = 2, triple = 3)
     • implicitH   – how many H atoms are assumed (skeletal drawings hide them)
     • lone pairs  – from the valence electrons left over
     • formal charge, electrons around the atom, octet status
     • hybridisation & VSEPR shape from the steric number
     • oxidation number and Gasteiger partial charge
   It also flags valence errors ("Texas carbon"), expanded octets, etc.
   ============================================================================ */

/**
 * The "normal" number of bonds for an atom given its charge, from the octet
 * rule. effective electrons = valence electrons − charge. An atom wants to
 * reach 8 (or 2 for H): it either shares all of them (if ≤ 4) or makes
 * 8 − e bonds and keeps the rest as lone pairs.
 *   C: 4 → 4 bonds     N: 5 → 3 bonds     O: 6 → 2     F: 7 → 1
 *   N⁺: 4 → 4 bonds    O⁻: 7 → 1 bond     C⁺: 3 → 3    B: 3 → 3
 */
function allowedValences(el, charge) {
  const E = ELEMENTS[el];
  const eff = E.ve - charge;
  if (eff < 0 || eff > 8) return { eff, list: [], normal: null };
  const normal = el === 'H' ? (eff <= 1 ? eff : 2 - eff) : (eff <= 4 ? eff : 8 - eff);
  const list = [normal];
  // Period 3+ atoms may "expand their octet": extra valences in steps of 2
  // (e.g. S: 2, 4, 6   P: 3, 5   Cl: 1, 3, 5, 7).
  if (E.period >= 3) for (let v = normal + 2; v <= eff; v += 2) list.push(v);
  return { eff, list, normal };
}

function analyze() {
  const t0 = performance.now();
  const atoms = state.atoms;
  const adj = new Map(atoms.map((a) => [a.id, []]));
  state.bonds.forEach((b) => {
    adj.get(b.a1).push({ bond: b, other: b.a2 });
    adj.get(b.a2).push({ bond: b, other: b.a1 });
  });

  const res = { atoms: {}, bonds: {}, issues: [], nodes: [], edges: [], nodeIndex: new Map(), adj };

  // ---------- 7a. Valence, implicit H, lone pairs, octet ----------
  atoms.forEach((a, idx) => {
    const E = ELEMENTS[a.el];
    const links = adj.get(a.id);
    const bondSum = links.reduce((s, l) => s + l.bond.order, 0);
    const { eff, list, normal } = allowedValences(a.el, a.charge);
    const r = {
      id: a.id, el: a.el, label: `${a.el}${idx + 1}`, charge: a.charge,
      bondSum, sigma: links.length, eff, normalValence: normal,
      implicitH: 0, valence: bondSum, lonePairs: 0, radical: 0,
      status: 'ok', msgs: [], fix: null,
    };

    if (!list.length) {
      r.status = 'error';
      r.msgs.push({ level: 'error', text: `A charge of ${signed(a.charge)} is impossible for ${E.name}: it would need ${eff < 0 ? 'fewer than zero' : 'more than eight'} valence electrons.` });
      r.fix = { charge: 0, label: 'Reset charge to 0' };
    } else {
      const fit = list.find((v) => v >= bondSum);
      if (fit !== undefined) {
        // Explicitly drawn H atoms never receive extra hydrogens.
        r.implicitH = a.el === 'H' ? 0 : fit - bondSum;
        r.valence = a.el === 'H' ? bondSum : fit;
      } else {
        r.status = 'error';
        r.over = true;
        r.valence = bondSum;
        explainOverValence(a, r, list);
      }
    }

    const nonBonding = r.eff - r.valence;     // electrons not used in bonds
    if (nonBonding >= 0) {
      r.lonePairs = Math.floor(nonBonding / 2);
      r.radical = nonBonding % 2;
    }
    r.nonBondingElectrons = Math.max(0, nonBonding);
    r.electrons = 2 * r.valence + r.nonBondingElectrons;       // electrons "around" the atom
    r.fcComputed = E.ve - r.nonBondingElectrons - r.valence;   // V − N − B/2

    // ----- educational notes (only if no hard error) -----
    if (r.status !== 'error') {
      const octet = a.el === 'H' ? 2 : 8;
      if (r.valence > r.normalValence) {
        r.status = 'info';
        r.msgs.push({ level: 'info', text: `<b>Expanded octet:</b> ${r.electrons} electrons around ${a.el}. Period-${E.period} elements are big enough to hold more than 8 (as in SF₆ or H₂SO₄). Period-2 atoms (C, N, O, F) never can.` });
      } else if (r.electrons < octet && !r.radical && !(a.el === 'H' && a.charge === 1)) {
        r.status = 'warn';
        if (a.el === 'B' || (a.el === 'C' && a.charge === 1)) {
          r.msgs.push({ level: 'warn', text: `<b>Incomplete octet:</b> only ${r.electrons} electrons around ${a.el}. ${a.el === 'B' ? 'Boron is fine with 6 electrons, but this makes it a strong Lewis acid (electron-pair acceptor).' : 'This is a carbocation: electron-poor and very reactive, it wants to accept an electron pair.'}` });
        } else {
          r.msgs.push({ level: 'warn', text: `<b>Incomplete octet:</b> only ${r.electrons} electrons around ${a.el} (it wants ${octet}).` });
        }
      }
      if (r.radical) {
        r.status = 'warn';
        r.msgs.push({ level: 'warn', text: `<b>Radical:</b> ${a.el} has an unpaired electron${a.el === 'H' && r.sigma === 0 ? '. A lone H atom is a hydrogen radical (H•). Bond it to something!' : '.'}` });
      }
      if (a.el === 'H' && a.charge === 1 && r.sigma === 0) {
        r.status = 'info';
        r.msgs.push({ level: 'info', text: '<b>H⁺</b> is a bare proton with no electrons at all.' });
      }
    }
    res.atoms[a.id] = r;
  });

  // ---------- 7b. Expanded graph: every atom including implicit H ----------
  atoms.forEach((a) => {
    res.nodeIndex.set(a.id, res.nodes.length);
    res.nodes.push({ atomId: a.id, el: a.el, charge: a.charge, implicit: false });
  });
  state.bonds.forEach((b) => res.edges.push({ i: res.nodeIndex.get(b.a1), j: res.nodeIndex.get(b.a2), order: b.order, bondId: b.id }));
  atoms.forEach((a) => {
    const r = res.atoms[a.id];
    r.hNodes = [];
    for (let k = 0; k < r.implicitH; k++) {
      const idx = res.nodes.length;
      res.nodes.push({ el: 'H', charge: 0, implicit: true, parentId: a.id });
      res.edges.push({ i: res.nodeIndex.get(a.id), j: idx, order: 1, implicit: true });
      r.hNodes.push(idx);
    }
  });
  const nodeNb = res.nodes.map(() => []);
  res.edges.forEach((e) => { nodeNb[e.i].push(e); nodeNb[e.j].push(e); });
  res.nodeNb = nodeNb;

  // ---------- 7c. Hybridisation & VSEPR (steric number = σ neighbours + lone pairs) ----------
  res.nodes.forEach((nd, i) => {
    let sn, lp;
    if (nd.implicit) { sn = 1; lp = 0; } else {
      const r = res.atoms[nd.atomId];
      lp = r.lonePairs;
      sn = nodeNb[i].length + lp;
    }
    nd.sn = sn;
    nd.lp = lp;
    nd.hyb = sn <= 1 ? (nd.el === 'H' ? 's' : '—') : (HYBRID_BY_SN[sn] || '—');
    nd.gKey = sn >= 4 ? 'sp3' : sn === 3 ? 'sp2' : 'sp';
    if (!nd.implicit) {
      const r = res.atoms[nd.atomId];
      r.sn = sn;
      r.hyb = nd.hyb;
      const v = VSEPR[sn];
      r.electronGeometry = v ? v.electron : null;
      const bondedNeighbours = nodeNb[i].length;
      r.shape = bondedNeighbours >= 2 && v ? v.shapes[lp] || null : null;
    }
  });

  // ---------- 7d. Oxidation numbers ----------
  // Treat every bond as ionic: the more electronegative partner takes the
  // bonding electrons. Same element → split evenly (contributes 0).
  const moreEN = (x, y) => {   // is element x more electronegative than y?
    if (x === y) return false;
    if (y === 'H' && NONMETALS_OVER_H.has(x)) return true;
    if (x === 'H' && NONMETALS_OVER_H.has(y)) return false;
    return ELEMENTS[x].en > ELEMENTS[y].en;
  };
  res.nodes.forEach((nd, i) => {
    let ox = nd.charge;
    const parts = {};   // element → {gain, lose, same}
    nodeNb[i].forEach((e) => {
      const other = res.nodes[e.i === i ? e.j : e.i].el;
      parts[other] = parts[other] || { more: 0, less: 0, same: 0 };
      if (other === nd.el) parts[other].same += e.order;
      else if (moreEN(other, nd.el)) { ox += e.order; parts[other].more += e.order; }
      else { ox -= e.order; parts[other].less += e.order; }
    });
    nd.ox = ox;
    nd.oxParts = parts;
    if (!nd.implicit) { res.atoms[nd.atomId].ox = ox; res.atoms[nd.atomId].oxParts = parts; }
  });

  // ---------- 7e. Gasteiger–Marsili partial charges ----------
  const q = gasteigerCharges(res.nodes, res.edges);
  res.nodes.forEach((nd, i) => {
    nd.q = q[i];
    if (!nd.implicit) {
      const r = res.atoms[nd.atomId];
      r.partial = q[i];
      // "group" charge = the atom plus its hidden H atoms (used in skeletal view)
      r.partialGroup = q[i] + r.hNodes.reduce((s, h) => s + q[h], 0);
    }
  });

  // ---------- 7f. Bond polarity (Pauling ΔEN) & ring membership ----------
  res.edges.forEach((e) => {
    const A = res.nodes[e.i], B = res.nodes[e.j];
    e.dEN = Math.abs(ELEMENTS[A.el].en - ELEMENTS[B.el].en);
    e.negEnd = ELEMENTS[A.el].en >= ELEMENTS[B.el].en ? e.i : e.j;
    e.kind = e.dEN < 0.4 ? 'non-polar covalent' : e.dEN <= 1.7 ? 'polar covalent' : 'ionic character';
    if (e.bondId) res.bonds[e.bondId] = e;
  });
  findRings(res);

  // ---------- 7g. Formula, mass, fragments ----------
  const counts = {};
  res.nodes.forEach((nd) => { counts[nd.el] = (counts[nd.el] || 0) + 1; });
  res.counts = counts;
  res.netCharge = atoms.reduce((s, a) => s + a.charge, 0);
  res.mw = res.nodes.reduce((s, nd) => s + ELEMENTS[nd.el].mass, 0);
  res.fragments = countFragments(adj);

  // ---------- 7h. Issue list for the right panel ----------
  atoms.forEach((a) => {
    const r = res.atoms[a.id];
    r.msgs.forEach((m) => res.issues.push({ ...m, atomId: a.id, label: r.label, fix: m.level === 'error' ? r.fix : null }));
  });
  if (res.fragments > 1) {
    res.issues.push({ level: 'info', text: `The drawing contains <b>${res.fragments} separate molecules/ions</b>. They are all included in the formula.` });
  }

  log('analysis', `Analysed ${atoms.length} atoms, ${state.bonds.length} bonds in ${(performance.now() - t0).toFixed(1)} ms`,
    { formula: hillFormula(counts, res.netCharge).text, issues: res.issues.length });
  return res;
}

/** Build a helpful error message for an atom with too many bonds. */
function explainOverValence(a, r, list) {
  const E = ELEMENTS[a.el];
  const max = Math.max(...list);
  let text;
  if (a.el === 'C' && a.charge === 0) {
    text = `<b>Texas carbon!</b> This carbon has <b>${r.bondSum} bonds</b>. Carbon has only 4 valence electrons and 4 valence orbitals (2s, 2pₓ, 2p_y, 2p_z), so it can form <b>at most 4 bonds</b> (an octet). Remove a bond or lower a bond order.`;
  } else if (a.el === 'H') {
    text = `<b>Hydrogen can only form ONE bond.</b> It has a single 1s orbital that holds 2 electrons (a "duet"). This H has ${r.bondSum} bonds.`;
  } else if (E.period === 2) {
    text = `<b>${E.name} is over its limit:</b> it has ${r.bondSum} bonds, but with charge ${signed(a.charge)} it can make at most ${max}. Period-2 atoms can never have more than 8 electrons around them.`;
    // Suggest the charge that would make this valid (e.g. N with 4 bonds → N⁺).
    for (const c of [1, -1]) {
      const alt = allowedValences(a.el, c);
      if (alt.list.includes(r.bondSum)) {
        const ex = { N: 'NH₄⁺ (ammonium)', O: 'H₃O⁺ (hydronium)', B: 'BH₄⁻ (borohydride)' }[a.el];
        text += ` With <b>${r.bondSum} bonds</b>, ${a.el} would need a formal charge of <b>${signed(c)}</b>${ex ? `, like ${ex}` : ''}.`;
        r.fix = { charge: c, label: `Give ${a.el} a ${signed(c)} charge` };
        break;
      }
    }
  } else {
    text = `<b>Too many bonds:</b> ${E.name} has ${r.bondSum} bonds, but even with an expanded octet it can make at most ${max} with charge ${signed(a.charge)}.`;
  }
  r.msgs.push({ level: 'error', text });
  warn('valence', `${a.el}${atomIndex(a.id) + 1}: ${r.bondSum} bonds exceeds allowed valences [${list}]`);
}

/** Gasteiger–Marsili iterative partial equalisation of orbital electronegativity. */
function gasteigerCharges(nodes, edges) {
  const n = nodes.length;
  const P = nodes.map((nd) => {
    const g = GASTEIGER[nd.el] || GASTEIGER.C;
    return g[nd.gKey] || g.any || g.sp3 || g.sp2;
  });
  const q = nodes.map((nd) => nd.charge || 0);
  for (let it = 0; it < 6; it++) {
    const damp = Math.pow(0.5, it + 1);
    const chi = q.map((qi, i) => P[i][0] + P[i][1] * qi + P[i][2] * qi * qi);
    const dq = new Array(n).fill(0);
    edges.forEach((e) => {
      const { i, j } = e;
      if (chi[i] === chi[j]) return;
      const donor = chi[i] < chi[j] ? i : j;          // less electronegative
      const acceptor = donor === i ? j : i;
      const chiPlus = nodes[donor].el === 'H' ? 20.02 : P[donor][0] + P[donor][1] + P[donor][2];
      const t = ((chi[acceptor] - chi[donor]) / chiPlus) * damp;
      dq[donor] += t;
      dq[acceptor] -= t;
    });
    for (let i = 0; i < n; i++) q[i] += dq[i];
  }
  return q;
}

/** For every bond, find the smallest ring it is part of (if any, up to 8 atoms). */
function findRings(res) {
  state.bonds.forEach((b) => {
    // breadth-first search from a1 to a2 without using this bond
    const prev = new Map([[b.a1, null]]);
    const queue = [b.a1];
    let found = false;
    while (queue.length && !found) {
      const cur = queue.shift();
      const depth = (function d(x) { let k = 0; while (prev.get(x) !== null) { x = prev.get(x); k++; } return k; })(cur);
      if (depth >= 7) continue;
      for (const l of res.adj.get(cur)) {
        if (l.bond.id === b.id || prev.has(l.other)) continue;
        prev.set(l.other, cur);
        if (l.other === b.a2) { found = true; break; }
        queue.push(l.other);
      }
    }
    const e = res.bonds[b.id];
    if (found) {
      const path = [];
      let x = b.a2;
      while (x !== null) { path.push(x); x = prev.get(x); }
      e.ringSize = path.length;
      const pts = path.map(getAtom);
      e.ringCenter = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    } else {
      e.ringSize = 0;
    }
  });
}

function countFragments(adj) {
  const seen = new Set();
  let n = 0;
  state.atoms.forEach((a) => {
    if (seen.has(a.id)) return;
    n++;
    const stack = [a.id];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      adj.get(x).forEach((l) => stack.push(l.other));
    }
  });
  return n;
}

/** Hill-order formula: C first, H second, then alphabetical (or all alphabetical if no C). */
function hillFormula(counts, netCharge = 0) {
  const els = Object.keys(counts);
  let order;
  if (counts.C) order = ['C', ...(counts.H ? ['H'] : []), ...els.filter((e) => e !== 'C' && e !== 'H').sort()];
  else order = els.sort();
  let html = '', text = '';
  order.forEach((el) => {
    const n = counts[el];
    html += el + (n > 1 ? `<sub>${n}</sub>` : '');
    text += el + (n > 1 ? n : '');
  });
  if (netCharge) {
    html += `<sup>${chargeText(netCharge)}</sup>`;
    text += chargeText(netCharge);
  }
  return { html, text };
}
