/* ============================================================================
   ChemSim · studio/tools/conformers.js
   ----------------------------------------------------------------------------
   Newman projections and conformational energy scans.

   Pick a single (non-ring) bond. The molecule's 3D model (embed3D) is viewed
   straight down that bond: the front carbon's bonds meet in the centre, the
   back carbon is the circle. A slider rotates the back half about the bond.

   Energy model (textbook increments, labelled as approximate): every pair of
   front/back substituents i, j costs
       E_ecl(i,j) · cos²(1.5φ)          for |φ| < 60°   (eclipsing)
       E_gau(i,j) · cos²(1.5(φ − 60°))  for |φ| < 120°  (gauche)
   with E_ecl: H/H 4.0, H/CH₃ 6.0, CH₃/CH₃ 11 kJ/mol and E_gau(CH₃/CH₃) 3.8 kJ/mol
   (the standard ethane/butane numbers). This reproduces ethane's 12 kJ/mol
   barrier and butane's anti 0 / gauche 3.8 / eclipsed 16 / syn 19 kJ/mol.
   ============================================================================ */
'use strict';

const Conformers = (() => {
  const esc = (s) => StudioTools.esc(s);
  // size classes: H, X (O, N, halogen, S), Me (carbon groups), L (bulky: tBu, Ph, iPr)
  const ECL = { 'H-H': 4.0, 'H-X': 5.0, 'H-Me': 6.0, 'H-L': 8.0, 'X-X': 6.0, 'Me-X': 8.0, 'Me-Me': 11.0, 'L-X': 12.0, 'L-Me': 15.0, 'L-L': 20.0 };
  const GAU = { 'Me-Me': 3.8, 'Me-X': 2.0, 'X-X': 1.5, 'L-X': 4.0, 'L-Me': 8.0, 'L-L': 14.0 };
  const pairKey = (a, b) => [a, b].sort((x, y) => ['H', 'L', 'Me', 'X'].indexOf(x) - ['H', 'L', 'Me', 'X'].indexOf(y)).join('-');
  const keyFix = (k) => ({ 'L-H': 'H-L', 'X-H': 'H-X', 'Me-H': 'H-Me', 'X-Me': 'Me-X', 'X-L': 'L-X', 'Me-L': 'L-Me' }[k] || k);

  let sel = null;          // { bondId, flip }
  let rot = 0, playing = false, raf = 0;

  /** Single, non-ring bonds between two atoms that each have another neighbour. */
  function rotatable() {
    const an = state.analysis;
    const g = StudioTools.graph();
    return state.bonds.filter((b) => {
      const A = g.atoms.get(b.a1), B = g.atoms.get(b.a2);
      if (!A || !B || b.order !== 1) return false;
      if (an.bonds[b.id] && an.bonds[b.id].ringSize) return false;
      return A.nbrs.length + A.h >= 2 && B.nbrs.length + B.h >= 2;
    });
  }

  /** Geometry for the chosen bond: indices into the 3D model. */
  function setup(bondId, flip) {
    const an = state.analysis, E = StudioTools.embed();
    if (!E) return null;
    const b = state.bonds.find((x) => x.id === bondId);
    if (!b) return null;
    const [fa, ba] = flip ? [b.a2, b.a1] : [b.a1, b.a2];
    const iA = an.nodeIndex.get(fa), iB = an.nodeIndex.get(ba);
    const nb = an.nodes.map(() => []);
    an.edges.forEach((e) => { nb[e.i].push(e.j); nb[e.j].push(e.i); });
    // the back half: everything reachable from B without crossing A
    const back = new Set([iB]);
    const stack = [iB];
    while (stack.length) { const x = stack.pop(); nb[x].forEach((y) => { if (y !== iA && !back.has(y)) { back.add(y); stack.push(y); } }); }
    const P = Array.from({ length: an.nodes.length }, (_, i) => [E.coords[3 * i], E.coords[3 * i + 1], E.coords[3 * i + 2]]);
    const sub = (i, c) => {
      const nd = an.nodes[i];
      if (nd.implicit || nd.el === 'H') return { i, label: 'H', cls: 'H' };
      const label = StudioTools.groupLabel(an.nodes[c].atomId, nd.atomId);
      const g = StudioTools.graph().atoms.get(nd.atomId);
      let cls = 'X';
      if (nd.el === 'C') {
        const heavyBranches = g ? g.nbrs.filter((n) => n.id !== an.nodes[c].atomId).length : 0;
        cls = (g && g.arom) || heavyBranches >= 2 ? 'L' : 'Me';
      }
      return { i, label, cls };
    };
    const front = nb[iA].filter((x) => x !== iB).map((x) => sub(x, iA));
    const backSubs = nb[iB].filter((x) => x !== iA).map((x) => sub(x, iB));
    return { iA, iB, back, P, front, backSubs, fa, ba };
  }

  /** Rotate the back half by θ (radians) about the A→B axis; returns new coordinates. */
  function rotated(S, theta) {
    const A = S.P[S.iA], B = S.P[S.iB];
    let u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L = Math.hypot(...u); u = u.map((v) => v / L);
    const c = Math.cos(theta), s = Math.sin(theta);
    return S.P.map((p, i) => {
      if (!S.back.has(i)) return p;
      const v = [p[0] - B[0], p[1] - B[1], p[2] - B[2]];
      const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      return [0, 1, 2].map((k) => B[k] + v[k] * c + cr[k] * s + u[k] * d * (1 - c));
    });
  }

  function dihedral(p0, p1, p2, p3) {
    const b0 = p0.map((v, k) => v - p1[k]), b1 = p2.map((v, k) => v - p1[k]), b2 = p3.map((v, k) => v - p2[k]);
    const n = Math.hypot(...b1); const u = b1.map((v) => v / n);
    const proj = (v) => { const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2]; return v.map((x, k) => x - d * u[k]); };
    const v = proj(b0), w = proj(b2);
    const x = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const y = cr[0] * w[0] + cr[1] * w[1] + cr[2] * w[2];
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  /** Energy (kJ/mol) of a geometry, and the reference dihedral of the two largest groups. */
  function energy(S, Q) {
    let E = 0;
    S.front.forEach((f) => S.backSubs.forEach((b) => {
      const phi = Math.abs(dihedral(Q[f.i], Q[S.iA], Q[S.iB], Q[b.i]));
      const k = keyFix(pairKey(f.cls, b.cls));
      // both shapes are cos² bumps: eclipsing peaks at 0° and is gone by 60°;
      // gauche peaks at 60° and is gone by 0° and 120° (so 0/60/120/180° give the textbook values)
      if (phi < 60) E += (ECL[k] || 0) * Math.cos((1.5 * phi * Math.PI) / 180) ** 2;
      const gau = GAU[k] || 0;
      if (gau && phi < 120) E += gau * Math.cos((1.5 * (phi - 60) * Math.PI) / 180) ** 2;
    }));
    return E;
  }
  const rank = { L: 3, Me: 2, X: 1.5, H: 0 };
  const biggest = (list) => list.reduce((m, x) => (rank[x.cls] > rank[m.cls] ? x : m), list[0]);

  function scan(S) {
    const f = biggest(S.front), b = biggest(S.backSubs);
    const pts = [];
    for (let d = 0; d < 360; d += 3) {
      const Q = rotated(S, (d * Math.PI) / 180);
      let ref = dihedral(Q[f.i], Q[S.iA], Q[S.iB], Q[b.i]);
      if (ref < 0) ref += 360;
      pts.push([ref, energy(S, Q)]);
    }
    pts.sort((a, b2) => a[0] - b2[0]);
    const min = Math.min(...pts.map((p) => p[1]));
    return { pts: pts.map(([x, y]) => [x, y - min]), f, b, min };
  }

  function conformerName(phi) {
    const a = Math.abs(phi);
    if (a < 30) return 'syn-periplanar (fully eclipsed)';
    if (a < 90) return 'gauche (synclinal, staggered)';
    if (a < 150) return 'anticlinal (eclipsed)';
    return 'anti (antiperiplanar, staggered)';
  }

  /** The Newman projection as SVG. */
  function newmanSVG(S, Q) {
    const A = Q[S.iA], B = Q[S.iB];
    let u = B.map((v, k) => v - A[k]); const L = Math.hypot(...u); u = u.map((v) => v / L);
    // screen axes perpendicular to the bond, fixed by the first front substituent
    const ref = S.P[S.front[0].i].map((v, k) => v - S.P[S.iA][k]);
    const dr = ref[0] * u[0] + ref[1] * u[1] + ref[2] * u[2];
    let e1 = ref.map((v, k) => v - dr * u[k]); const l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
    const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
    const ang = (p, o) => { const v = p.map((x, k) => x - o[k]); return Math.atan2(v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2], v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2]); };
    const cx = 130, cy = 120, R = 42, len = 88;
    const colour = (cls) => (cls === 'H' ? '#cbd5e1' : cls === 'X' ? '#f87171' : '#22d3ee');
    let s = `<svg viewBox="0 0 260 240" class="tsvg" style="max-width:300px">`;
    const lab = (t, x, y, col) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="600" fill="${col}">${esc(t)}</text>`;
    S.backSubs.forEach((b) => {
      const a = -ang(Q[b.i], B) - Math.PI / 2;
      s += `<line x1="${cx + R * Math.cos(a)}" y1="${cy + R * Math.sin(a)}" x2="${cx + len * Math.cos(a)}" y2="${cy + len * Math.sin(a)}" stroke="#94a3b8" stroke-width="2.5"/>`;
      s += lab(b.label, cx + (len + 16) * Math.cos(a), cy + (len + 12) * Math.sin(a), colour(b.cls));
    });
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0f1520" stroke="#e6edf3" stroke-width="2.5"/>`;
    S.front.forEach((f) => {
      const a = -ang(Q[f.i], A) - Math.PI / 2;
      s += `<line x1="${cx}" y1="${cy}" x2="${cx + (len - 6) * Math.cos(a)}" y2="${cy + (len - 6) * Math.sin(a)}" stroke="#e6edf3" stroke-width="2.5"/>`;
      s += lab(f.label, cx + (len + 10) * Math.cos(a), cy + (len + 6) * Math.sin(a), colour(f.cls));
    });
    s += `<circle cx="${cx}" cy="${cy}" r="3" fill="#e6edf3"/>`;
    return s + '</svg>';
  }

  /* ---------------- the tab ---------------- */
  function render(el) {
    stop();
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Draw a molecule with a single C–C bond (try butane: CCCC, or 1,2-dichloroethane).</p>'; return; }
    const list = rotatable();
    if (!list.length) { el.innerHTML = '<p class="muted-note">No rotatable single bond (a non-ring single bond with groups on both ends).</p>'; return; }
    if (!sel || !list.some((b) => b.id === sel.bondId)) {
      // default: the most central bond
      const best = list.map((b) => {
        const g = StudioTools.graph();
        const sideSize = (from, to) => { const seen = new Set([from]); const st = [to]; let n = 0; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); n++; g.atoms.get(x).nbrs.forEach((m) => st.push(m.id)); } return n; };
        return { b, score: Math.min(sideSize(b.a1, b.a2), sideSize(b.a2, b.a1)) };
      }).sort((x, y) => y.score - x.score)[0].b;
      sel = { bondId: best.id, flip: false }; rot = 0;
    }
    const S = setup(sel.bondId, sel.flip);
    if (!S) { el.innerHTML = '<p class="muted-note">Could not build a 3D model of this molecule.</p>'; return; }
    const sc = scan(S);
    el.innerHTML = `
      <div class="row"><label class="small">Bond
        <select id="cf-bond">${list.map((b) => `<option value="${b.id}"${b.id === sel.bondId ? ' selected' : ''}>${atomLabelName(b.a1)}–${atomLabelName(b.a2)}</option>`).join('')}</select></label>
        <button class="hbtn small" id="cf-pick">🎯 Pick on drawing</button><button class="hbtn small" id="cf-flip" data-tip="Look along the bond from the other end">⇄ Other end</button></div>
      <div class="row" style="align-items:flex-start"><div id="cf-newman"></div>
        <div class="small" style="flex:1;min-width:150px" id="cf-info"></div></div>
      <div class="row"><label class="small" style="flex:1">Rotate back carbon <input type="range" id="cf-rot" min="0" max="360" step="1" value="${rot}" style="width:100%"/></label>
        <button class="hbtn small" id="cf-play">▶ Spin</button></div>
      <canvas class="tplot" id="cf-plot"></canvas>
      <p class="muted-note">Energy relative to the most stable conformer, from textbook eclipsing (H/H 4, H/CH₃ 6, CH₃/CH₃ 11 kJ/mol) and gauche (CH₃/CH₃ 3.8 kJ/mol) increments, with similar values for other groups. x-axis: the dihedral angle between the two largest groups, ${esc(sc.f.label)} and ${esc(sc.b.label)}.</p>`;
    const update = () => {
      const Q = rotated(S, (rot * Math.PI) / 180);
      el.querySelector('#cf-newman').innerHTML = newmanSVG(S, Q);
      let phi = dihedral(Q[sc.f.i], Q[S.iA], Q[S.iB], Q[sc.b.i]);
      const E = energy(S, Q) - sc.min;
      const stag = (() => { let m = 180; S.front.forEach((f) => S.backSubs.forEach((b) => { m = Math.min(m, Math.abs(dihedral(Q[f.i], Q[S.iA], Q[S.iB], Q[b.i]))); })); return m; })();
      el.querySelector('#cf-info').innerHTML = `<div>Looking from <b>${atomLabelName(S.fa)}</b> (front, centre) to <b>${atomLabelName(S.ba)}</b> (back, circle).</div>
        <div style="margin-top:6px">Dihedral ${esc(sc.f.label)}/${esc(sc.b.label)}: <b>${phi.toFixed(0)}°</b></div>
        <div>${conformerName(phi)}</div>
        <div>${stag < 15 ? '<span class="pill warn">eclipsed</span>' : stag > 45 ? '<span class="pill ok">staggered</span>' : '<span class="pill">skewed</span>'}</div>
        <div style="margin-top:6px">Relative energy: <b>${E.toFixed(1)} kJ/mol</b></div>
        <div class="dim">Barrier to rotation: ${Math.max(...sc.pts.map((p) => p[1])).toFixed(1)} kJ/mol</div>`;
      let x = phi < 0 ? phi + 360 : phi;
      LabPlot.draw(el.querySelector('#cf-plot'), { x: { label: `dihedral ${sc.f.label}–C–C–${sc.b.label} / °`, min: 0, max: 360 }, y: { label: 'E / kJ mol⁻¹', min: 0 }, series: [{ pts: sc.pts, color: '#22d3ee', width: 2 }, { pts: [[x, E]], color: '#f472b6', dots: true, r: 5 }], vlines: [60, 180, 300].map((v) => ({ x: v, color: '#334155', dash: [2, 4] })) });
      StudioTools.highlight({ bonds: [sel.bondId], atoms: [S.fa], labels: [{ id: S.fa, text: 'front' }] });
    };
    update();
    el.querySelector('#cf-rot').addEventListener('input', (e) => { rot = Number(e.target.value); update(); });
    el.querySelector('#cf-bond').addEventListener('change', (e) => { sel = { bondId: Number(e.target.value), flip: false }; rot = 0; render(el); });
    el.querySelector('#cf-flip').addEventListener('click', () => { sel.flip = !sel.flip; render(el); });
    el.querySelector('#cf-pick').addEventListener('click', () => StudioTools.requestPick('bond', (id) => {
      if (!list.some((b) => b.id === id)) { toast('That bond cannot rotate (it is a ring bond, a multiple bond, or ends at a terminal atom)'); return; }
      sel = { bondId: id, flip: false }; rot = 0; render(el);
    }, 'Click the bond you want to look along'));
    el.querySelector('#cf-play').addEventListener('click', () => {
      if (playing) { stop(); el.querySelector('#cf-play').textContent = '▶ Spin'; return; }
      playing = true; el.querySelector('#cf-play').textContent = '⏸ Stop';
      const step = () => { if (!playing) return; rot = (rot + 1.5) % 360; const r = el.querySelector('#cf-rot'); if (!r) { stop(); return; } r.value = rot; update(); raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    });
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }

  StudioTools.add({ id: 'newman', icon: '🎯', title: 'Newman projection & conformational energy', short: 'Newman', render, hide: () => { stop(); StudioTools.clearHighlight(); } });
  return { rotatable, setup, rotated, energy, scan, dihedral, get sel() { return sel; }, set sel(v) { sel = v; } };
})();
