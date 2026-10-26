/* ============================================================================
   ChemSim · studio/tools/huckel.js
   ----------------------------------------------------------------------------
   Hückel molecular orbitals for π systems.

   Simple Hückel theory treats only the p orbitals perpendicular to the
   molecular plane. With energies written as E = α + xβ (α: energy of a
   carbon p orbital, β < 0: the interaction between neighbouring p orbitals),
   the orbital energies x are the eigenvalues of the matrix
        M_ii = h_i      (0 for carbon; heteroatoms use Streitwieser's h)
        M_ij = k_ij     (1 for C–C neighbours, 0 if not bonded)
   and the eigenvectors are the MO coefficients. Electrons fill from the
   most bonding (largest x) orbital up.

   Full 3D molecular orbitals of any molecule need real quantum chemistry,
   which does not run well in a browser; Hückel theory is the honest,
   textbook version, and it gets ethene, butadiene, allyl, benzene,
   cyclobutadiene, pyridine and friends right qualitatively.
   ============================================================================ */
'use strict';

const Huckel = (() => {
  const esc = (s) => StudioTools.esc(s);
  // Streitwieser parameters: h (Coulomb), k (resonance with C), electrons given to the π system
  const HETERO = {
    'N1': { h: 0.5, k: 1.0, e: 1, name: 'pyridine-type N (=N–)' },
    'N2': { h: 1.5, k: 0.8, e: 2, name: 'pyrrole/amine-type N (lone pair)' },
    'N+': { h: 2.0, k: 1.0, e: 1, name: 'N⁺ (pyridinium-type)' },
    'O1': { h: 1.0, k: 1.0, e: 1, name: 'carbonyl O (=O)' },
    'O2': { h: 2.0, k: 0.8, e: 2, name: 'ether/hydroxyl O (lone pair)' },
    'O-': { h: 1.0, k: 0.8, e: 2, name: 'O⁻ (lone pair)' },
    'S2': { h: 1.0, k: 0.6, e: 2, name: 'thiophene-type S' },
    'F': { h: 3.0, k: 0.7, e: 2, name: 'F lone pair' },
    'Cl': { h: 2.0, k: 0.4, e: 2, name: 'Cl lone pair' },
    'Br': { h: 1.5, k: 0.3, e: 2, name: 'Br lone pair' },
  };

  /** Jacobi eigenvalue algorithm for a symmetric matrix → { values, vectors (columns) } */
  function jacobi(A) {
    const n = A.length;
    const a = A.map((r) => r.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-14) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
    return { values: a.map((r, i) => r[i]), vectors: v };
  }

  /** Find the π system of the drawing and solve it. */
  function solve() {
    const g = StudioTools.graph();
    const an = state.analysis;
    if (!g.atoms.size || !an) return null;
    const hasMultiple = (A) => A.arom || A.nbrs.some((n) => n.order >= 2);
    // 1. carbon/hetero atoms that carry a p orbital in a π bond (or a charge/radical next to one)
    const pi = new Map();      // id → { type, h, e }
    g.atoms.forEach((A) => {
      const r = an.atoms[A.id];
      if (A.el === 'C' && hasMultiple(A)) pi.set(A.id, { type: 'C', h: 0, e: 1 });
      else if (A.el === 'N' && hasMultiple(A)) pi.set(A.id, A.charge > 0 ? { type: 'N+', ...HETERO['N+'] } : (A.arom && A.h > 0) || (A.arom && A.nbrs.length === 3 && !A.nbrs.some((n) => n.order === 2)) ? { type: 'N2', ...HETERO.N2 } : { type: 'N1', ...HETERO.N1 });
      else if (A.el === 'O' && A.nbrs.some((n) => n.order === 2)) pi.set(A.id, { type: 'O1', ...HETERO.O1 });
      else if (A.el === 'O' && A.arom) pi.set(A.id, { type: 'O2', ...HETERO.O2 });
      else if (A.el === 'S' && A.arom) pi.set(A.id, { type: 'S2', ...HETERO.S2 });
    });
    // 2. atoms next to the π system that donate or accept: C⁺ (0 e), C⁻ / radical C (2 / 1 e), lone-pair heteroatoms (2 e)
    let added = true;
    while (added) {
      added = false;
      g.atoms.forEach((A) => {
        if (pi.has(A.id) || !A.nbrs.some((n) => pi.has(n.id))) return;
        const r = an.atoms[A.id];
        if (A.el === 'C' && A.charge === 1) { pi.set(A.id, { type: 'C+', h: 0, e: 0 }); added = true; }
        else if (A.el === 'C' && A.charge === -1) { pi.set(A.id, { type: 'C−', h: 0, e: 2 }); added = true; }
        else if (A.el === 'C' && r && r.radical) { pi.set(A.id, { type: 'C•', h: 0, e: 1 }); added = true; }
        else if (A.el === 'N' && A.nbrs.length <= 3 && A.charge === 0) pi.set(A.id, { type: 'N2', ...HETERO.N2 });
        else if (A.el === 'O' && A.charge === -1) pi.set(A.id, { type: 'O-', ...HETERO['O-'] });
        else if (A.el === 'O') pi.set(A.id, { type: 'O2', ...HETERO.O2 });
        else if (HETERO[A.el]) pi.set(A.id, { type: A.el, ...HETERO[A.el] });
      });
    }
    const ids = [...pi.keys()];
    if (ids.length < 2) return { ids, empty: true };
    // keep the largest connected π system
    const comp = [];
    const seen = new Set();
    ids.forEach((s) => {
      if (seen.has(s)) return;
      const part = [];
      const stack = [s];
      while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); part.push(x); g.atoms.get(x).nbrs.forEach((n) => { if (pi.has(n.id) && !seen.has(n.id)) stack.push(n.id); }); }
      comp.push(part);
    });
    comp.sort((a, b) => b.length - a.length);
    const sys = comp[0];
    const n = sys.length;
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    sys.forEach((id, i) => {
      M[i][i] = pi.get(id).h || 0;
      g.atoms.get(id).nbrs.forEach((nb) => {
        const j = sys.indexOf(nb.id);
        if (j < 0) return;
        const ti = pi.get(id), tj = pi.get(nb.id);
        // k for a bond to a heteroatom comes from the heteroatom (C–C: 1)
        M[i][j] = ti.k !== undefined && tj.k !== undefined ? Math.min(ti.k, tj.k) : ti.k !== undefined ? ti.k : tj.k !== undefined ? tj.k : 1;
      });
    });
    const { values, vectors } = jacobi(M);
    const orbs = values.map((x, k) => ({ x, c: vectors.map((row) => row[k]) })).sort((a, b) => b.x - a.x);
    // fill electrons; degenerate levels share electrons (Hund's rule)
    const nE = sys.reduce((s, id) => s + pi.get(id).e, 0) - 0;
    let left = nE;
    let i = 0;
    while (i < orbs.length) {
      let j = i;
      while (j + 1 < orbs.length && Math.abs(orbs[j + 1].x - orbs[i].x) < 1e-6) j++;
      const deg = j - i + 1, cap = 2 * deg;
      const put = Math.min(left, cap);
      for (let k = i; k <= j; k++) orbs[k].occ = put / deg;
      left -= put;
      i = j + 1;
    }
    const homo = orbs.reduce((h, o, k) => (o.occ > 0 ? k : h), -1);          // highest orbital with electrons
    const lumoIdx = orbs.findIndex((o) => !(o.occ > 1e-9));                     // lowest empty orbital
    const Epi = orbs.reduce((s, o) => s + (o.occ || 0) * o.x, 0);
    // bond orders and charges
    const bonds = [];
    sys.forEach((a, i2) => g.atoms.get(a).nbrs.forEach((nb) => {
      const j = sys.indexOf(nb.id);
      if (j <= i2) return;
      bonds.push({ a, b: nb.id, p: orbs.reduce((s, o) => s + (o.occ || 0) * o.c[i2] * o.c[j], 0) });
    }));
    const charges = sys.map((id, k) => ({ id, q: pi.get(id).e - orbs.reduce((s, o) => s + (o.occ || 0) * o.c[k] * o.c[k], 0) }));
    // delocalisation energy (hydrocarbons only): compare with isolated C=C π bonds (2β each)
    const allC = sys.every((id) => pi.get(id).type === 'C' || pi.get(id).type.startsWith('C'));
    const nDouble = state.bonds.filter((b) => b.order === 2 && sys.includes(b.a1) && sys.includes(b.a2)).length;
    const ionicE = sys.filter((id) => pi.get(id).type === 'C−').length * 0;    // a localised anion lone pair sits at α (x = 0)
    const DE = allC ? Epi - (2 * nDouble + ionicE) : null;
    // ring aromaticity (Hückel 4n + 2)
    const rings = g.rings.filter((r) => r.every((id) => sys.includes(id))).map((r) => {
      const ringE = r.reduce((s, id) => s + (pi.get(id).e === 1 ? 1 : pi.get(id).e), 0);
      return { size: r.length, e: ringE, aromatic: ringE % 4 === 2, anti: ringE % 4 === 0 && ringE > 0 };
    });
    return { sys, pi, orbs, nE, homo, lumo: lumoIdx, Epi, bonds, charges, DE, rings, n };
  }

  const fmtX = (x) => (Math.abs(x) < 5e-4 ? 'α' : `α ${x > 0 ? '+' : '−'} ${Math.abs(x).toFixed(3)}β`);

  /* ---------------- drawing ---------------- */
  function levelSVG(res, sel) {
    const W = 300, H = 300, top = 20, bot = 280;
    const xs = res.orbs.map((o) => o.x);
    const xmax = Math.max(2.2, ...xs.map(Math.abs));
    const Y = (x) => top + ((xmax - x) / (2 * xmax)) * (bot - top);
    // group degenerate levels
    const groups = [];
    res.orbs.forEach((o, k) => { const gp = groups.find((q) => Math.abs(q.x - o.x) < 1e-6); if (gp) gp.k.push(k); else groups.push({ x: o.x, k: [k] }); });
    let s = `<svg viewBox="0 0 ${W} ${H}" class="tsvg">`;
    s += `<line x1="40" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="#334155" stroke-dasharray="4 3"/><text x="6" y="${Y(0) + 4}" fill="#9aa7b8" font-size="11">α</text>`;
    s += `<text x="6" y="${top + 4}" fill="#64748b" font-size="10">bonding ↓</text>`;
    groups.forEach((gp) => {
      const y = Y(gp.x), w = 44, gap = 8;
      const total = gp.k.length * w + (gp.k.length - 1) * gap;
      gp.k.forEach((k, m) => {
        const x0 = 118 - total / 2 + m * (w + gap);
        const o = res.orbs[k];
        const isSel = k === sel;
        s += `<g class="lvl" data-k="${k}" style="cursor:pointer"><rect x="${x0 - 3}" y="${y - 12}" width="${w + 6}" height="18" fill="transparent"/>
          <line x1="${x0}" x2="${x0 + w}" y1="${y}" y2="${y}" stroke="${isSel ? '#22d3ee' : '#e6edf3'}" stroke-width="${isSel ? 3 : 2}"/>`;
        const occ = Math.round((o.occ || 0) * 2) / 2;
        if (occ >= 1) s += `<text x="${x0 + w / 2 - 9}" y="${y - 2}" fill="#fde047" font-size="13">↑</text>`;
        if (occ >= 2) s += `<text x="${x0 + w / 2 + 3}" y="${y - 2}" fill="#fde047" font-size="13">↓</text>`;
        if (occ > 0 && occ < 1) s += `<text x="${x0 + w / 2 - 4}" y="${y - 2}" fill="#fde047" font-size="11">½</text>`;
        s += '</g>';
      });
      const lab = gp.k.includes(res.homo) ? ' HOMO' : gp.k.includes(res.lumo) ? ' LUMO' : '';
      s += `<text x="${W - 4}" y="${y + 4}" fill="${lab ? '#22d3ee' : '#9aa7b8'}" font-size="10" text-anchor="end">${fmtX(gp.x).replace('α ', '')}${lab}</text>`;
    });
    return s + '</svg>';
  }

  /** The π framework with orbital lobes (size ∝ |c|, colour = phase). */
  function orbitalSVG(res, k) {
    const ids = state.atoms.filter((a) => a.el !== 'H').map((a) => a.id);
    const xs = ids.map((id) => getAtom(id).x), ys = ids.map((id) => getAtom(id).y);
    const pad = 40, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    const W = Math.max(...xs) - x0 + pad, H = Math.max(...ys) - y0 + pad;
    let s = `<svg viewBox="${x0} ${y0} ${W} ${H}" class="tsvg">`;
    state.bonds.forEach((b) => {
      const A = getAtom(b.a1), B = getAtom(b.a2);
      if (A.el === 'H' || B.el === 'H') return;
      const inPi = res.sys.includes(A.id) && res.sys.includes(B.id);
      s += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${inPi ? '#94a3b8' : '#334155'}" stroke-width="${inPi ? 2.5 : 1.5}"/>`;
    });
    const o = res.orbs[k];
    res.sys.forEach((id, i) => {
      const A = getAtom(id), c = o.c[i];
      const r = Math.abs(c) * 30;
      if (r < 0.8) { s += `<circle cx="${A.x}" cy="${A.y}" r="2.5" fill="#64748b"/>`; return; }
      const col = c > 0 ? '239,68,68' : '59,130,246';
      // a p orbital seen from the side: two lobes, top = this phase, bottom = opposite
      s += `<ellipse cx="${A.x}" cy="${A.y - r * 0.55}" rx="${r * 0.55}" ry="${r * 0.8}" fill="rgba(${col},0.75)" stroke="rgb(${col})"/>`;
      s += `<ellipse cx="${A.x}" cy="${A.y + r * 0.55}" rx="${r * 0.55}" ry="${r * 0.8}" fill="rgba(${c > 0 ? '59,130,246' : '239,68,68'},0.35)" stroke="rgba(${c > 0 ? '59,130,246' : '239,68,68'},0.8)"/>`;
    });
    res.sys.forEach((id) => { const A = getAtom(id); if (A.el !== 'C') s += `<text x="${A.x}" y="${A.y + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${ELEMENTS[A.el].color}">${A.el}</text>`; });
    return s + '</svg>';
  }

  /* ---------------- the tab ---------------- */
  let sel = null, lastKey = null;
  function render(el) {
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Draw a conjugated molecule (ethene, butadiene, benzene, an allyl cation, pyridine…).</p>'; return; }
    const res = solve();
    if (!res || res.empty) { el.innerHTML = '<p class="muted-note">No π system found: Hückel theory needs at least two conjugated p orbitals (a C=C, C=O, C=N or an aromatic ring).</p>'; return; }
    const key = snapshot();
    if (key !== lastKey || sel === null || sel >= res.orbs.length) { sel = res.homo >= 0 ? res.homo : 0; lastKey = key; }
    const o = res.orbs[sel];
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const nAlpha = res.nE;
    el.innerHTML = `
      <div class="card"><h2>π system <span class="h2-note">${res.n} p orbitals, ${res.nE} π electrons</span></h2>
        <div class="huckel-grid"><div>${levelSVG(res, sel)}</div>
        <div><div class="small"><b>MO ${sel + 1}</b> ${sel === res.homo ? '(HOMO)' : sel === res.lumo ? '(LUMO)' : ''}: E = ${fmtX(o.x)}<br/>${o.x > 1e-6 ? 'bonding' : o.x < -1e-6 ? 'antibonding' : 'non-bonding'} · nodes: ${countNodes(res, o)}</div>
        ${orbitalSVG(res, sel)}
        <p class="muted-note">Lobe size ∝ coefficient; red and blue are opposite phases. A node lies between neighbouring atoms of opposite phase. Click a level to show that orbital.</p></div></div></div>
      <div class="card"><h2>Energies</h2>
        <div class="small">Total π energy: <b>${nAlpha}α ${res.Epi >= 0 ? '+' : '−'} ${Math.abs(res.Epi).toFixed(3)}β</b></div>
        ${res.DE !== null ? `<div class="small">Delocalisation energy: <b>${Math.abs(res.DE).toFixed(3)}β</b> ${Math.abs(res.DE) > 0.01 ? `(≈ ${(Math.abs(res.DE) * 75).toFixed(0)} kJ/mol with β ≈ −75 kJ/mol)` : '(none: the π bonds are isolated)'}</div>` : '<div class="small dim">Delocalisation energy is shown for hydrocarbons only.</div>'}
        ${res.homo >= 0 && res.lumo >= 0 ? `<div class="small">HOMO–LUMO gap: <b>${(res.orbs[res.homo].x - res.orbs[res.lumo].x).toFixed(3)}|β|</b> (smaller gap → absorbs longer wavelengths)</div>` : ''}
        ${res.rings.map((r) => `<div class="small">${r.size}-membered ring, ${r.e} π electrons: ${r.aromatic ? '<span class="pill ok">aromatic (4n+2)</span>' : r.anti ? '<span class="pill bad">antiaromatic (4n)</span>' : '<span class="pill">not 4n+2</span>'}</div>`).join('')}
      </div>
      <div class="card"><h2>π bond orders & charges</h2>
        <table class="tt"><thead><tr><th>Bond</th><th>π order</th><th>Atom</th><th>π charge</th></tr></thead><tbody>
        ${Array.from({ length: Math.max(res.bonds.length, res.charges.length) }, (_, i) => {
          const b = res.bonds[i], q = res.charges[i];
          return `<tr><td>${b ? `${atomLabelName(b.a)}–${atomLabelName(b.b)}` : ''}</td><td class="mono">${b ? b.p.toFixed(3) : ''}</td><td>${q ? atomLabelName(q.id) : ''}</td><td class="mono">${q ? signed(q.q, 3) : ''}</td></tr>`;
        }).join('')}</tbody></table>
        <p class="muted-note">Coulson π bond order: 1 = full double bond, 0.667 = benzene. π charge: positive = electron-poor (e.g. carbonyl carbon, allyl cation ends).</p></div>`;
    el.querySelectorAll('.lvl').forEach((gEl) => gEl.addEventListener('click', () => { sel = Number(gEl.dataset.k); render(el); }));
    StudioTools.highlight({ atoms: res.sys, color: '34,211,238' });
  }

  function countNodes(res, o) {
    let n = 0;
    res.bonds.forEach((b) => {
      const i = res.sys.indexOf(b.a), j = res.sys.indexOf(b.b);
      if (o.c[i] * o.c[j] < -1e-9) n++;
    });
    return n;
  }

  StudioTools.add({ id: 'huckel', icon: '🌀', title: 'Hückel molecular orbitals (π systems)', short: 'Orbitals', render, hide: () => StudioTools.clearHighlight() });
  return { solve, jacobi };
})();
