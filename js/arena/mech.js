/* ============================================================================
   ChemSim · arena/mech.js
   ----------------------------------------------------------------------------
   Arrow-pushing questions. The reactants are drawn from SMILES (RDKit makes
   the 2D coordinates), every atom and bond is clickable, and the student
   draws curved arrows the same way as with the Molecule Studio’s arrow tool:

     click where the electrons ARE   (an atom = its lone pair, or a bond)
     then where they GO              (an atom, or a bond that becomes double)

   Full arrows move an electron pair; fishhooks (half arrows) move one
   electron. Atoms in the SMILES carry map numbers ([O-:1]), and the answer
   is written with them: 'a1' = atom 1, 'b2-3' = the bond between atoms 2
   and 3, '*ring' = any ring bond. Arrow order does not matter.
   ============================================================================ */
'use strict';

const ArenaMech = (() => {
  const U = ArenaUtil;
  const NS = 'http://www.w3.org/2000/svg';
  const VE = { H: 1, B: 3, C: 4, N: 5, O: 6, F: 7, P: 5, S: 6, Cl: 7, Br: 7, I: 7 };
  const Z = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I' };

  const A = (from, to, kind = 'full') => ({ from, to, kind });
  const ITEMS = [
    { id: 'mx1', name: 'SN2 substitution', smi: '[OH-:1].[CH3:2][Br:3]',
      q: 'Draw the arrows for the one-step SN2 reaction of hydroxide with bromomethane.',
      sets: [[A('a1', 'a2'), A('b2-3', 'a3')]],
      e: 'A lone pair on O⁻ attacks the δ+ carbon from the back (O → C), and at the same moment the C–Br bond breaks, its electrons leaving with bromide (C–Br → Br).', h: 'Two arrows: nucleophile → carbon, and the bond to the leaving group → the leaving group.' },
    { id: 'mx2', name: 'SN1 step 1: ionisation', smi: 'C[C:1](C)(C)[Br:2]',
      q: 'Draw the arrow for the first (rate-determining) step of the SN1 reaction of 2-bromo-2-methylpropane.',
      sets: [[A('b1-2', 'a2')]],
      e: 'The C–Br bond breaks heterolytically; both electrons go to the more electronegative Br, leaving a tertiary carbocation.', h: 'One arrow, from a bond to an atom.' },
    { id: 'mx3', name: 'SN1 step 2: nucleophile capture', smi: 'C[C+:1](C)C.[OH2:2]',
      q: 'Draw the arrow for water attacking the tert-butyl carbocation.',
      sets: [[A('a2', 'a1')]],
      e: 'A lone pair on the water O forms a new bond to the empty p orbital of the carbocation, giving an oxonium ion (which then loses H⁺).', h: 'Lone pair → electron-poor carbon.' },
    { id: 'mx4', name: 'E2 elimination', smi: 'CC[O-:1].[H:2][CH2:3][CH:4](C)[Br:5]',
      q: 'Draw the three arrows for the E2 elimination of 2-bromopropane by ethoxide.',
      sets: [[A('a1', 'a2'), A('b2-3', 'b3-4'), A('b4-5', 'a5')]],
      e: 'All at once: ethoxide takes the β-hydrogen (O → H), the C–H bond electrons become the new C=C π bond (C–H → C–C), and the C–Br bond breaks (C–Br → Br).', h: 'Base → H; C–H bond → C–C bond; C–Br bond → Br.' },
    { id: 'mx5', name: 'Electrophilic addition step 1', smi: '[CH2:1]=[CH2:2].[H:3][Br:4]',
      q: 'Draw the arrows for the first step of the addition of HBr to ethene.',
      sets: [[A('b1-2', 'a3'), A('b3-4', 'a4')]],
      e: 'The electron-rich π bond attacks the δ+ hydrogen (C=C → H), and the H–Br bond breaks heterolytically (H–Br → Br), giving a carbocation and Br⁻.', h: 'The π bond is the nucleophile here.' },
    { id: 'mx6', name: 'Electrophilic addition step 2', smi: 'C[CH+:1]C.[Br-:2]',
      q: 'Draw the arrow for bromide capturing the carbocation.',
      sets: [[A('a2', 'a1')]],
      e: 'A bromide lone pair forms the C–Br bond to the cationic carbon.', h: 'Lone pair → C⁺.' },
    { id: 'mx7', name: 'Nucleophilic addition to C=O', smi: '[N:3]#[C-:1].C[CH:2]=[O:4]',
      q: 'Draw the arrows for cyanide adding to ethanal.',
      sets: [[A('a1', 'a2'), A('b2-4', 'a4')]],
      e: 'The carbon lone pair of CN⁻ attacks the δ+ carbonyl carbon; the C=O π electrons move onto oxygen, giving an alkoxide.', h: 'Nucleophile → C of C=O; C=O π bond → O.' },
    { id: 'mx8', name: 'Ester hydrolysis step 1', smi: '[OH-:1].C[C:2](=[O:3])OC',
      q: 'Draw the arrows for hydroxide adding to methyl ethanoate (first step of saponification).',
      sets: [[A('a1', 'a2'), A('b2-3', 'a3')]],
      e: 'OH⁻ attacks the carbonyl carbon and the π electrons move onto the carbonyl O, forming a tetrahedral intermediate.', h: 'Same pattern as any nucleophilic addition to C=O.' },
    { id: 'mx9', name: 'Ester hydrolysis step 2', smi: 'C[C:1]([O-:2])([OH:4])[O:3]C',
      q: 'Draw the arrows for the tetrahedral intermediate collapsing and expelling methoxide.',
      sets: [[A('a2', 'b1-2'), A('b1-3', 'a3')]],
      e: 'A lone pair on O⁻ comes back down to re-form the C=O (O → C–O bond), pushing out methoxide (C–OCH₃ → O).', h: 'Lone pair → C–O bond (making it double); a C–O bond → its O.' },
    { id: 'mx10', name: 'Enolate formation', smi: '[OH-:1].[H:2][CH2:3][C:4](C)=[O:5]',
      q: 'Draw the three arrows for hydroxide removing an α-hydrogen from propanone to give the enolate.',
      sets: [[A('a1', 'a2'), A('b2-3', 'b3-4'), A('b4-5', 'a5')]],
      e: 'OH⁻ takes the α-H; the C–H electrons form a C=C; the C=O π electrons move onto O. The negative charge is shared by C and O (resonance).', h: 'Base → H; C–H → C–C; C=O → O.' },
    { id: 'mx11', name: 'Proton transfer', smi: '[NH3:1].[H:2][Cl:3]',
      q: 'Draw the arrows for ammonia reacting with hydrogen chloride.',
      sets: [[A('a1', 'a2'), A('b2-3', 'a3')]],
      e: 'The N lone pair takes the proton (N → H) and the H–Cl electrons stay on chlorine (H–Cl → Cl): NH₄⁺ + Cl⁻.', h: 'Brønsted acid–base reactions are two-arrow reactions too.' },
    { id: 'mx12', name: 'Homolysis', smi: '[Cl:1][Cl:2]',
      q: 'Use fishhook (half) arrows to show the homolysis of Cl₂ by UV light.',
      sets: [[A('b1-2', 'a1', 'half'), A('b1-2', 'a2', 'half')]],
      e: 'The bond breaks evenly: one electron goes to each Cl, giving two Cl· radicals. Each single-electron move is a fishhook.', h: 'Switch to fishhook arrows; one electron goes each way.' },
    { id: 'mx13', name: 'Radical H-abstraction', smi: '[Cl:1].[H:2][CH3:3]',
      q: 'Use fishhook arrows to show a chlorine radical taking a hydrogen atom from methane.',
      sets: [[A('a1', 'a2', 'half'), A('b2-3', 'a2', 'half'), A('b2-3', 'a3', 'half')]],
      e: 'Cl·’s electron pairs with one electron from the C–H bond to make H–Cl; the other C–H electron stays on carbon, giving ·CH₃. Three fishhooks.', h: 'Three half arrows: Cl· → H, C–H → H, C–H → C.' },
    { id: 'mx14', name: 'Aromatic nitration step 1', smi: 'c1cc[cH:1][cH:2]c1.[O:3]=[N+:4]=[O:5]',
      q: 'Draw the arrows for benzene attacking the nitronium ion, NO₂⁺.',
      sets: [[A('*ring', 'a4'), A('b3-4', 'a3')], [A('*ring', 'a4'), A('b4-5', 'a5')]],
      e: 'A π bond of the ring attacks the N of NO₂⁺ and one N=O π bond moves onto O, giving the arenium (σ) complex.', h: 'Ring π bond → N; N=O π bond → O.' },
    { id: 'mx15', name: 'Aromatic nitration step 2', smi: '[OH2:4].[H:1][C:2]1([N+](=O)[O-])C=CC=C[CH+:3]1',
      q: 'Draw the arrows for water removing H⁺ from the arenium ion to restore the aromatic ring.',
      sets: [[A('a4', 'a1'), A('b1-2', 'b2-3')]],
      e: 'Water takes the proton on the sp³ carbon, and the C–H electrons form a C=C bond to the cationic carbon, restoring the aromatic sextet.', h: 'Base → H; C–H bond → bond to the C⁺.' },
    { id: 'mx16', name: 'Hydride reduction', smi: '[H:2][BH3-:1].C[CH:3]=[O:4]',
      q: 'Draw the arrows for borohydride delivering a hydride to ethanal.',
      sets: [[A('b1-2', 'a3'), A('b3-4', 'a4')]],
      e: 'The B–H bond electrons (a hydride) attack the carbonyl carbon and the C=O π electrons move onto oxygen.', h: 'The nucleophile here is a B–H bond.' },
    { id: 'mx17', name: 'Bromine addition (simplified)', smi: '[CH2:1]=[CH2:2].[Br:3][Br:4]',
      q: 'Draw the arrows for the first step of the addition of Br₂ to ethene (show it as a simple carbocation, without the bromonium bridge).',
      sets: [[A('b1-2', 'a3'), A('b3-4', 'a4')]],
      e: 'The π bond attacks the nearer Br of the polarised Br–Br and the Br–Br bond breaks, giving Br⁻. (Really a bridged bromonium ion forms, which explains anti addition.)', h: 'Like HBr: π bond → the near Br; Br–Br bond → the far Br.' },
  ];

  /* ---------------- geometry from RDKit ---------------- */
  const cache = {};
  function geometry(smi) {
    if (cache[smi]) return cache[smi];
    let mol = null;
    try {
      mol = RDKit.get_mol(smi, JSON.stringify({ removeHs: false }));
      if (!mol || !mol.is_valid()) throw new Error('RDKit could not read ' + smi);
      const mb = mol.get_molblock().split('\n');
      const js = JSON.parse(mol.get_json()), def = js.defaults.atom, mj = js.molecules[0];
      const na = +mb[3].slice(0, 3), nb = +mb[3].slice(3, 6);
      const atoms = [];
      for (let i = 0; i < na; i++) {
        const L = mb[4 + i];
        const x = +L.slice(0, 10), y = +L.slice(10, 20), f = L.slice(31).trim().split(/\s+/);
        const j = { ...def, ...mj.atoms[i] };
        atoms.push({ i, x, y: -y, el: Z[j.z] || f[0], chg: j.chg || 0, h: j.impHs || 0, rad: j.nRad || 0, map: +f[10] || 0 });
      }
      const bonds = [];
      for (let k = 0; k < nb; k++) {
        const L = mb[4 + na + k];
        bonds.push({ a: +L.slice(0, 3) - 1, b: +L.slice(3, 6) - 1, order: +L.slice(6, 9) });
      }
      // rings (for '*ring'): RDKit's ring info
      const rings = (mj.extensions && mj.extensions[0] && mj.extensions[0].atomRings) || [];
      const inRing = new Set(); rings.forEach((rg) => rg.forEach((x) => inRing.add(x)));
      bonds.forEach((b) => { b.ring = inRing.has(b.a) && inRing.has(b.b) && rings.some((rg) => rg.includes(b.a) && rg.includes(b.b)); });
      layoutFragments(atoms, bonds);
      atoms.forEach((a) => {
        const bo = bonds.reduce((s, b) => s + (b.a === a.i || b.b === a.i ? b.order : 0), 0);
        const e = (VE[a.el] || 0) - a.chg - bo - a.h;
        a.lp = a.el === 'H' ? 0 : Math.max(0, Math.floor((e - a.rad) / 2));
        a.bo = bo;
      });
      cache[smi] = { atoms, bonds };
      return cache[smi];
    } finally { if (mol) mol.delete(); }
  }

  /** Put the separate molecules side by side, in SMILES order. */
  function layoutFragments(atoms, bonds) {
    const comp = atoms.map(() => -1);
    let nc = 0;
    atoms.forEach((a) => {
      if (comp[a.i] >= 0) return;
      const st = [a.i]; comp[a.i] = nc;
      while (st.length) {
        const k = st.pop();
        bonds.forEach((b) => { const o = b.a === k ? b.b : b.b === k ? b.a : -1; if (o >= 0 && comp[o] < 0) { comp[o] = nc; st.push(o); } });
      }
      nc++;
    });
    let x0 = 0;
    for (let c = 0; c < nc; c++) {
      const g = atoms.filter((a) => comp[a.i] === c);
      const minX = Math.min(...g.map((a) => a.x)), maxX = Math.max(...g.map((a) => a.x));
      const cy = (Math.min(...g.map((a) => a.y)) + Math.max(...g.map((a) => a.y))) / 2;
      g.forEach((a) => { a.x = a.x - minX + x0; a.y -= cy; });
      x0 += maxX - minX + 2.2;
    }
  }

  /* ---------------- answer checking ---------------- */
  const endKey = (G, end) => {
    if (end.type === 'atom') { const a = G.atoms[end.i]; return a.map ? 'a' + a.map : 'i' + a.i; }
    const b = G.bonds[end.i], m1 = G.atoms[b.a].map, m2 = G.atoms[b.b].map;
    return m1 && m2 ? 'b' + Math.min(m1, m2) + '-' + Math.max(m1, m2) : 'j' + end.i;
  };
  function endMatches(G, end, spec) {
    const specs = Array.isArray(spec) ? spec : [spec];
    return specs.some((s) => {
      if (s === '*ring') return end.type === 'bond' && G.bonds[end.i].ring;
      if (s.startsWith('b')) { const [p, q] = s.slice(1).split('-').map(Number); return endKey(G, end) === 'b' + Math.min(p, q) + '-' + Math.max(p, q); }
      return endKey(G, end) === s;
    });
  }
  const arrowMatches = (G, ar, ex) => ar.kind === ex.kind && endMatches(G, ar.from, ex.from) && endMatches(G, ar.to, ex.to);

  /** Compare the student’s arrows with each accepted answer set. */
  function evaluate(item, arrows) {
    const G = geometry(item.smi);
    let best = null;
    for (const set of item.sets) {
      // maximum matching between drawn arrows and expected arrows (augmenting paths)
      const arrowTo = new Array(arrows.length).fill(-1);
      const tryK = (k, seen) => {
        for (let i = 0; i < arrows.length; i++) {
          if (seen[i] || !arrowMatches(G, arrows[i], set[k])) continue;
          seen[i] = true;
          if (arrowTo[i] < 0 || tryK(arrowTo[i], seen)) { arrowTo[i] = k; return true; }
        }
        return false;
      };
      set.forEach((_, k) => tryK(k, new Array(arrows.length).fill(false)));
      const good = arrowTo.map((k) => k >= 0);
      const nGood = good.filter(Boolean).length;
      const res = { ok: nGood === set.length && arrows.length === set.length, good, missing: set.length - nGood, extra: arrows.length - nGood, set };
      if (!best || res.ok || nGood - res.extra > best.good.filter(Boolean).length - best.extra) best = res;
      if (res.ok) break;
    }
    return best;
  }

  /* ---------------- drawing ---------------- */
  const SCALE = 50, PAD = 40;
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  };
  const label = (a) => {
    if (a.el === 'H') return 'H';
    const hs = a.h ? 'H' + (a.h > 1 ? U.sub(a.h) : '') : '';
    if (a.el === 'O' && a.h === 2 && a.chg === 0) return 'H₂O';
    return a.el + hs;
  };
  const chgText = (c) => (c === 0 ? '' : (Math.abs(c) > 1 ? Math.abs(c) : '') + (c > 0 ? '+' : '−'));

  /**
   * Show an interactive question inside `host`.
   * Returns { arrows, check(), showAnswer(), lock(), onChange }.
   */
  function mount(host, item, opts = {}) {
    const G = geometry(item.smi);
    const px = (a) => ({ x: PAD + a.x * SCALE, y: PAD + 20 + (a.y - Math.min(...G.atoms.map((b) => b.y))) * SCALE });
    const P = G.atoms.map(px);
    const W = Math.max(...P.map((p) => p.x)) + PAD + 20, H = Math.max(...P.map((p) => p.y)) + PAD + 30;
    const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cy = P.reduce((s, p) => s + p.y, 0) / P.length;
    host.innerHTML = `
      <div class="mech-bar">
        <div class="seg" role="group" aria-label="Arrow type">
          <button class="mini active" data-kind="full" data-tip="Full arrow: an electron PAIR moves">⤻ Full arrow</button>
          <button class="mini" data-kind="half" data-tip="Fishhook: ONE electron moves (radicals)">⇀ Fishhook</button>
        </div>
        <button class="mini" data-act="undo">↶ Undo</button>
        <button class="mini" data-act="clear">Clear</button>
        <span class="small dim mech-status">Click a lone pair (atom) or bond, then where the electrons go.</span>
      </div>
      <div class="mech-wrap"></div>`;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'mech-svg' }, host.querySelector('.mech-wrap'));
    const gB = el('g', {}, svg), gA = el('g', {}, svg), gR = el('g', {}, svg), gHit = el('g', {}, svg);
    const st = { arrows: [], from: null, kind: 'full', locked: false, marks: null, answer: null };

    // bonds
    G.bonds.forEach((b, k) => {
      const p = P[b.a], q = P[b.b];
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const sh = (t) => ({ x1: p.x + dx * t, y1: p.y + dy * t, x2: q.x - dx * t, y2: q.y - dy * t });
      const s = sh(0.22);
      const offs = b.order === 2 ? [-3, 3] : b.order === 3 ? [-4.5, 0, 4.5] : [0];
      offs.forEach((o) => el('line', { x1: s.x1 + nx * o, y1: s.y1 + ny * o, x2: s.x2 + nx * o, y2: s.y2 + ny * o, class: 'mech-bond' }, gB));
      const hit = el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: 'mech-hit-bond', 'data-bond': k }, gHit);
      hit.addEventListener('click', () => pick({ type: 'bond', i: k }));
    });
    // atoms
    G.atoms.forEach((a, i) => {
      const p = P[i];
      const t = label(a);
      const g = el('g', { class: 'mech-atom el-' + a.el }, gA);
      el('text', { x: p.x, y: p.y + 5, 'text-anchor': 'middle', class: 'mech-label' }, g).textContent = t;
      if (a.chg) {
        const cc = el('g', {}, g);
        el('circle', { cx: p.x + 10 + t.length * 3.2, cy: p.y - 11, r: 6.5, class: 'mech-chg-c' }, cc);
        el('text', { x: p.x + 10 + t.length * 3.2, y: p.y - 7.5, 'text-anchor': 'middle', class: 'mech-chg' }, cc).textContent = chgText(a.chg);
      }
      // lone pairs: dot pairs in the directions furthest from bonds
      const nb = G.bonds.filter((b) => b.a === i || b.b === i).map((b) => { const o = P[b.a === i ? b.b : b.a]; return Math.atan2(o.y - p.y, o.x - p.x); });
      const dirs = [];
      const cand = [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
      const angd = (u, v) => Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
      const halfW = Math.max(9, t.length * 4.2);
      for (let n = 0; n < (a.lp + (a.rad ? 1 : 0)); n++) {
        let best = null, bs = -1;
        cand.forEach((c) => {
          const s0 = Math.min(...nb.map((x) => angd(x, c)).concat([9]), ...dirs.map((x) => angd(x, c)));
          const sideBias = t.length > 1 && Math.abs(Math.cos(c)) > 0.7 ? -0.6 : 0;   // avoid the H text
          if (s0 + sideBias > bs) { bs = s0 + sideBias; best = c; }
        });
        dirs.push(best);
        const rx = Math.cos(best), ry = Math.sin(best);
        const r0 = Math.abs(rx) > 0.7 ? halfW + 4 : 13;
        const ox = p.x + rx * r0, oy = p.y + 1 + ry * r0;
        const single = a.rad && n === a.lp;
        (single ? [0] : [-3, 3]).forEach((d) => el('circle', { cx: ox - ry * d, cy: oy + rx * d, r: 1.7, class: 'mech-lp' }, g));
      }
      const hit = el('circle', { cx: p.x, cy: p.y, r: 15, class: 'mech-hit-atom', 'data-atom': i }, gHit);
      hit.addEventListener('click', () => pick({ type: 'atom', i }));
    });

    /* arrows */
    const centre = (end) => (end.type === 'atom' ? P[end.i] : { x: (P[G.bonds[end.i].a].x + P[G.bonds[end.i].b].x) / 2, y: (P[G.bonds[end.i].a].y + P[G.bonds[end.i].b].y) / 2 });
    function curve(ar) {
      const c0 = centre(ar.from), c1 = centre(ar.to);
      const dx = c1.x - c0.x, dy = c1.y - c0.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      let nx = -uy, ny = ux;
      // bend away from the middle of the drawing
      const mx = (c0.x + c1.x) / 2, my = (c0.y + c1.y) / 2;
      if ((mx + nx * 10 - cx) * nx + (my + ny * 10 - cy) * ny < 0) { nx = -nx; ny = -ny; }
      if (ar.flip) { nx = -nx; ny = -ny; }
      const p0 = ar.from.type === 'atom' ? { x: c0.x + ux * 10 + nx * 9, y: c0.y + uy * 10 + ny * 9 } : { x: c0.x + nx * 4, y: c0.y + ny * 4 };
      const p1 = ar.to.type === 'atom' ? { x: c1.x - ux * 14 + nx * 6, y: c1.y - uy * 14 + ny * 6 } : { x: c1.x + nx * 5, y: c1.y + ny * 5 };
      const h = Math.max(18, L * 0.38);
      return { p0, p1, c: { x: (p0.x + p1.x) / 2 + nx * h, y: (p0.y + p1.y) / 2 + ny * h } };
    }
    function drawArrow(ar, cls, parent = gR) {
      const q = curve(ar);
      const g = el('g', { class: 'mech-arrow ' + cls }, parent);
      el('path', { d: `M${q.p0.x},${q.p0.y} Q${q.c.x},${q.c.y} ${q.p1.x},${q.p1.y}`, class: 'mech-arrow-line' }, g);
      const ux0 = q.p1.x - q.c.x, uy0 = q.p1.y - q.c.y, ul = Math.hypot(ux0, uy0) || 1, ux = ux0 / ul, uy = uy0 / ul;
      const bx = q.p1.x - ux * 9, by = q.p1.y - uy * 9;
      const pts = ar.kind === 'half' ? `${q.p1.x},${q.p1.y} ${bx - uy * 5},${by + ux * 5} ${bx + ux * 2},${by + uy * 2}`
        : `${q.p1.x},${q.p1.y} ${bx - uy * 4.5},${by + ux * 4.5} ${bx + uy * 4.5},${by - ux * 4.5}`;
      el('polygon', { points: pts, class: 'mech-arrow-head' }, g);
      return g;
    }
    function redraw() {
      gR.innerHTML = '';
      st.arrows.forEach((ar, k) => {
        const g = drawArrow(ar, st.marks ? (st.marks[k] ? 'good' : 'bad') : '');
        if (!st.locked) {
          g.addEventListener('click', (e) => { e.stopPropagation(); st.arrows.splice(k, 1); st.marks = null; redraw(); changed(); });
          g.addEventListener('contextmenu', (e) => { e.preventDefault(); ar.flip = !ar.flip; redraw(); });
        }
      });
      if (st.answer) st.answer.forEach((ar) => drawArrow(ar, 'answer'));
      svg.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      if (st.from) {
        const sel = st.from.type === 'atom' ? svg.querySelector(`[data-atom="${st.from.i}"]`) : svg.querySelector(`[data-bond="${st.from.i}"]`);
        if (sel) sel.classList.add('sel');
      }
      host.querySelector('.mech-status').textContent = st.locked ? '' : st.from ? 'Now click where the electrons go (an atom or a bond). Click the same place again to cancel.'
        : st.arrows.length ? `${st.arrows.length} arrow${st.arrows.length > 1 ? 's' : ''}. Click an arrow to delete it; right-click to flip its curve.` : 'Click a lone pair (atom) or bond, then where the electrons go.';
    }
    function pick(end) {
      if (st.locked) return;
      if (!st.from) { st.from = end; redraw(); return; }
      if (st.from.type === end.type && st.from.i === end.i) { st.from = null; redraw(); return; }
      st.arrows.push({ from: st.from, to: end, kind: st.kind });
      st.from = null; st.marks = null;
      redraw(); changed();
    }
    const changed = () => { if (api.onChange) api.onChange(st.arrows.slice()); };

    host.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      st.kind = b.dataset.kind;
      host.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    host.querySelector('[data-act="undo"]').addEventListener('click', () => { if (st.locked) return; st.arrows.pop(); st.marks = null; redraw(); changed(); });
    host.querySelector('[data-act="clear"]').addEventListener('click', () => { if (st.locked) return; st.arrows = []; st.from = null; st.marks = null; redraw(); changed(); });

    /** Turn an answer-set arrow spec into a drawable arrow. */
    function specToArrow(ex) {
      const find = (spec) => {
        const s = Array.isArray(spec) ? spec[0] : spec;
        if (s === '*ring') { const ring = G.bonds.findIndex((b, k) => b.ring && endMatches(G, { type: 'bond', i: k }, '*ring') && G.bonds[k].order === 2); return { type: 'bond', i: ring >= 0 ? ring : G.bonds.findIndex((b) => b.ring) }; }
        if (s.startsWith('a')) return { type: 'atom', i: G.atoms.findIndex((a) => a.map === +s.slice(1)) };
        const [p, q] = s.slice(1).split('-').map(Number);
        return { type: 'bond', i: G.bonds.findIndex((b) => { const m = [G.atoms[b.a].map, G.atoms[b.b].map].sort((x, y) => x - y); return m[0] === Math.min(p, q) && m[1] === Math.max(p, q); }) };
      };
      return { from: find(ex.from), to: find(ex.to), kind: ex.kind };
    }

    const api = {
      get arrows() { return st.arrows.slice(); },
      setArrows(list) { st.arrows = list.map((a) => ({ ...a })); redraw(); },
      check() { const r = evaluate(item, st.arrows); st.marks = r.good; redraw(); return r; },
      showAnswer() { st.answer = item.sets[0].map(specToArrow); redraw(); },
      lock() { st.locked = true; st.from = null; host.classList.add('locked'); redraw(); },
      onChange: opts.onChange || null,
      specToArrow,
    };
    redraw();
    return api;
  }

  function toQuestion(item) {
    return { id: 'mech:' + item.id, topic: 'organic', src: 'mech', type: 'mech', item, stem: `<b>${item.name}.</b> ${item.q}`, explain: item.e, hint: item.h };
  }

  return { ITEMS, geometry, evaluate, mount, toQuestion };
})();
