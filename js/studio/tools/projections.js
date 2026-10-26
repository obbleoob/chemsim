/* ============================================================================
   ChemSim · studio/tools/projections.js
   ----------------------------------------------------------------------------
   Fischer, chair and Haworth projections, worked out from the molecule's 3D
   model (embed3D keeps the configuration you drew with wedges and dashes).

   Fischer   The longest open carbon chain through the stereocentres is drawn
             vertically, the most oxidised end (CHO, COOH…) at the top.
             Vertical bonds point away from you, horizontal bonds toward you.
             Which horizontal group goes left is decided by the sign of a
             triple product in 3D, so the projection always has the same
             configuration as the drawing. D/L comes from the lowest
             stereocentre (sugars) or the α-carbon (amino acids).

   Chair     For a saturated six-membered ring each substituent is "up" or
             "down" relative to the ring. In a chair, on alternate carbons
             "up" is axial or equatorial; the ring flip swaps them. The
             energy of each chair is the sum of the A-values (axial
             preference energies) of its axial groups.

   Haworth   Pyranose / furanose rings drawn flat with the ring O at the back
             right; groups point straight up or down. α/β: the anomeric OH is
             trans (α) or cis (β) to the CH₂OH group on the last ring carbon.
   ============================================================================ */
'use strict';

const Projections = (() => {
  const esc = (s) => StudioTools.esc(s);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const det3 = (a, b, c) => dot(a, cross(b, c));

  /** 3D model helpers: coordinates by atom id, and the node neighbours of an atom. */
  function model() {
    const an = state.analysis, E = StudioTools.embed();
    if (!an || !E) return null;
    const P = (i) => [E.coords[3 * i], E.coords[3 * i + 1], E.coords[3 * i + 2]];
    const nb = an.nodes.map(() => []);
    an.edges.forEach((e) => { nb[e.i].push(e.j); nb[e.j].push(e.i); });
    const idx = (id) => an.nodeIndex.get(id);
    const label = (fromId, node) => { const nd = an.nodes[node]; return nd.implicit || nd.el === 'H' ? 'H' : StudioTools.groupLabel(fromId, nd.atomId); };
    return { an, P, nb, idx, label };
  }

  /* ================= Fischer ================= */
  function fischer() {
    const g = StudioTools.graph(), M = model();
    if (!M) return { error: 'No structure.' };
    const cip = (state.rd && state.rd.cipAtoms) || {};
    const stereo = new Set(Object.keys(cip).map(Number));
    if (!stereo.size) return { error: 'There are no defined stereocentres. Draw wedges/dashes at a carbon with four different groups (or load L-alanine or a sugar from the examples).' };
    const inRing = new Set(g.rings.flat());
    const ok = (id) => { const A = g.atoms.get(id); return A && A.el === 'C' && !inRing.has(id); };
    // longest path through open-chain carbons, scored by stereocentres inside it
    let best = null, steps = 0;
    const dfs = (path, seen) => {
      if (++steps > 60000) return;
      const inner = path.slice(1, -1).filter((id) => stereo.has(id)).length;
      const score = inner * 100 + path.length;
      if (path.length >= 3 && (!best || score > best.score)) best = { path: path.slice(), score };
      const last = path[path.length - 1];
      g.atoms.get(last).nbrs.forEach((n) => { if (ok(n.id) && !seen.has(n.id) && n.order === 1 || (ok(n.id) && !seen.has(n.id) && path.length === 1)) { seen.add(n.id); path.push(n.id); dfs(path, seen); path.pop(); seen.delete(n.id); } });
    };
    [...g.atoms.keys()].filter(ok).forEach((s) => dfs([s], new Set([s])));
    if (!best || !best.path.slice(1, -1).some((id) => stereo.has(id))) return { error: 'The stereocentres are not on an open carbon chain (Fischer projections are for chains such as sugars and amino acids).' };
    let chain = best.path;
    // most oxidised end on top
    const ox = (id) => g.atoms.get(id).nbrs.reduce((s, n) => s + ('ONSFClBrI'.includes(g.atoms.get(n.id).el) && g.atoms.get(n.id).el !== 'C' ? n.order : 0), 0);
    if (ox(chain[chain.length - 1]) > ox(chain[0])) chain = chain.slice().reverse();
    const rows = [];
    for (let k = 1; k < chain.length - 1; k++) {
      const c = chain[k], ic = M.idx(c), up = M.idx(chain[k - 1]), dn = M.idx(chain[k + 1]);
      const others = M.nb[ic].filter((x) => x !== up && x !== dn);
      let left = null, right = null;
      if (others.length === 2) {
        const C = M.P(ic);
        const s = det3(sub(M.P(up), C), sub(M.P(dn), C), sub(M.P(others[0]), C));
        [left, right] = s > 0 ? [others[0], others[1]] : [others[1], others[0]];
      } else if (others.length === 1) right = others[0];
      rows.push({ id: c, left: left === null ? '' : M.label(c, left), right: right === null ? '' : M.label(c, right), cip: cip[c] || '', stereo: stereo.has(c) });
    }
    const top = StudioTools.groupLabel(chain[1], chain[0]), bottom = StudioTools.groupLabel(chain[chain.length - 2], chain[chain.length - 1]);
    // D/L
    let dl = null;
    const isAmino = rows.length && rows[0].stereo && /^NH/.test(rows[0].left + rows[0].right) && /COO/.test(top);
    if (isAmino) dl = { letter: /^NH/.test(rows[0].left) ? 'L' : 'D', why: 'the NH₂ on the α-carbon (just below COOH)' };
    else {
      const last = [...rows].reverse().find((r) => r.stereo && (/^(OH|NH)/.test(r.left) || /^(OH|NH)/.test(r.right)));
      if (last) dl = { letter: /^(OH|NH)/.test(last.right) ? 'D' : 'L', why: `the ${/^(OH|NH)/.test(last.right) ? last.right : last.left} on the lowest stereocentre (${atomLabelName(last.id)})` };
    }
    return { chain, rows, top, bottom, dl };
  }

  function fischerSVG(f) {
    const n = f.rows.length, gap = 58, W = 260, H = 80 + gap * n + 40, cx = 130;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="tsvg" style="max-width:280px">`;
    const t = (txt, x, y, anchor = 'middle', col = '#e6edf3') => `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-size="15" font-weight="600" fill="${col}">${esc(txt)}</text>`;
    s += t(f.top, cx, 26);
    s += `<line x1="${cx}" y1="38" x2="${cx}" y2="${50 + gap * n}" stroke="#e6edf3" stroke-width="2"/>`;
    f.rows.forEach((r, k) => {
      const y = 50 + gap * (k + 0.5);
      s += `<line x1="${cx - 46}" y1="${y}" x2="${cx + 46}" y2="${y}" stroke="#e6edf3" stroke-width="2"/>`;
      if (r.left) s += t(r.left, cx - 52, y, 'end', r.left === 'H' ? '#cbd5e1' : '#f9a8d4');
      if (r.right) s += t(r.right, cx + 52, y, 'start', r.right === 'H' ? '#cbd5e1' : '#f9a8d4');
      if (r.cip) s += `<text x="${cx + 6}" y="${y - 11}" font-size="11" font-style="italic" font-weight="700" fill="#c084fc">${r.cip}</text>`;
    });
    s += t(f.bottom, cx, 64 + gap * n);
    return s + '</svg>';
  }

  /* ================= rings: up/down from the 3D model ================= */
  /** Ring atoms in order, with each atom's substituents marked up (+1) or down (−1). */
  function ringFaces(ring, M) {
    const pts = ring.map((id) => M.P(M.idx(id)));
    // Newell normal of the ring in this order (right-hand rule)
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; }
    const L = Math.hypot(...n) || 1; n = n.map((v) => v / L);
    return ring.map((id, k) => {
      const i = M.idx(id), prev = M.idx(ring[(k + ring.length - 1) % ring.length]), next = M.idx(ring[(k + 1) % ring.length]);
      const subs = M.nb[i].filter((x) => x !== prev && x !== next).map((x) => ({ node: x, label: M.label(id, x), face: Math.sign(dot(sub(M.P(x), M.P(i)), n)) || 1 }));
      // two substituents must be on opposite faces; if the model is ambiguous, split them
      if (subs.length === 2 && subs[0].face === subs[1].face) subs[1].face = -subs[0].face;
      return { id, subs };
    });
  }

  /* ================= chair ================= */
  const AVAL = { 'CH₃': 7.3, 'CH₂CH₃': 7.5, 'CH(CH₃)₂': 9.2, 'C(CH₃)₃': 20.5, Ph: 11.7, OH: 3.6, 'OCH₃': 2.5, 'OCOCH₃': 2.9, F: 1.0, Cl: 2.2, Br: 2.0, I: 1.9, 'NH₂': 5.9, COOH: 5.9, 'COO⁻': 8.0, 'CO₂CH₃': 5.3, CN: 0.8, CHO: 3.0, 'CH₂OH': 7.3, 'COCH₃': 5.0 };
  const aValue = (label) => (label === 'H' ? 0 : AVAL[label] !== undefined ? AVAL[label] : /^C/.test(label) ? 7.5 : 3.0);

  function chairRing() {
    const g = StudioTools.graph();
    return g.rings.find((r) => r.length === 6 && r.every((id) => { const A = g.atoms.get(id); return A && !A.arom && A.nbrs.filter((n) => r.includes(n.id)).every((n) => n.order === 1); }));
  }

  function chair() {
    const ring = chairRing(), M = model();
    if (!ring || !M) return { error: 'Chair conformations need a saturated six-membered ring (cyclohexane, a substituted cyclohexane, or a pyranose sugar).' };
    const faces = ringFaces(ring, M);
    // conformer A: ring atom k is an "up" carbon when k is even; conformer B: the ring flip
    const conf = (flip) => {
      let E = 0;
      const atoms = faces.map((f, k) => {
        const upCarbon = (k % 2 === 0) !== flip;
        const subs = f.subs.map((s) => {
          const axial = (s.face > 0) === upCarbon;
          if (axial) E += aValue(s.label);
          return { ...s, axial };
        });
        return { ...f, upCarbon, subs };
      });
      return { atoms, E };
    };
    const A = conf(false), B = conf(true);
    const dG = B.E - A.E;          // kJ/mol, positive: A more stable
    const K = Math.exp((dG * 1000) / (8.314 * 298.15));
    const pA = (100 * K) / (1 + K);
    return { ring, A, B, dG, pA };
  }

  /** Draw one chair: an ideal chair in 3D, viewed slightly from above. */
  function chairSVG(c, title) {
    const R = 1.45, zz = 0.25, view = (p) => [p[0] * 70 + 150, -(p[2] + 0.36 * p[1]) * 70 + 110];
    const ring3 = c.atoms.map((a, k) => { const ang = (k * Math.PI) / 3 + 0.35; return [R * Math.cos(ang), R * Math.sin(ang), a.upCarbon ? zz : -zz]; });
    let s = `<svg viewBox="0 0 300 220" class="tsvg">`;
    s += `<text x="10" y="18" font-size="12" fill="#9aa7b8">${esc(title)}</text>`;
    for (let k = 0; k < 6; k++) {
      const [x1, y1] = view(ring3[k]), [x2, y2] = view(ring3[(k + 1) % 6]);
      const front = ring3[k][1] + ring3[(k + 1) % 6][1] < 0;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e6edf3" stroke-width="${front ? 3 : 2}"/>`;
    }
    c.atoms.forEach((a, k) => {
      const p = ring3[k], up = a.upCarbon ? 1 : -1;
      const radial = [Math.cos((k * Math.PI) / 3 + 0.35), Math.sin((k * Math.PI) / 3 + 0.35), 0];
      a.subs.forEach((sb) => {
        const d = sb.axial ? [0, 0, up * 0.95] : [radial[0] * 0.9, radial[1] * 0.9, -up * 0.32];
        const end = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
        const [x1, y1] = view(p), [x2, y2] = view(end);
        const heavy = sb.label !== 'H';
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sb.axial ? '#f472b6' : '#22d3ee'}" stroke-width="${heavy ? 2.2 : 1.3}" opacity="${heavy ? 1 : 0.7}"/>`;
        const [lx, ly] = view([p[0] + d[0] * 1.35, p[1] + d[1] * 1.35, p[2] + d[2] * 1.35]);
        if (heavy) s += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${sb.axial ? '#f9a8d4' : '#a5f3fc'}">${esc(sb.label)}</text>`;
      });
      const el = getAtom(a.id).el;
      if (el !== 'C') { const [x, y] = view(p); s += `<circle cx="${x}" cy="${y}" r="9" fill="#0f1520"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${ELEMENTS[el].color}">${el}</text>`; }
    });
    s += `<text x="10" y="210" font-size="11" fill="#9aa7b8">axial: <tspan fill="#f472b6">pink</tspan> · equatorial: <tspan fill="#22d3ee">cyan</tspan> · E(axial groups) = ${c.E.toFixed(1)} kJ/mol</text>`;
    return s + '</svg>';
  }

  /* ================= Haworth ================= */
  function haworth() {
    const g = StudioTools.graph(), M = model();
    const ring = M && g.rings.find((r) => (r.length === 6 || r.length === 5) && r.filter((id) => g.atoms.get(id).el === 'O').length === 1 && r.every((id) => !g.atoms.get(id).arom));
    if (!ring) return { error: 'Haworth projections are for sugar rings: a five- or six-membered ring containing one oxygen (pyranose or furanose). Try β-D-glucose from the examples.' };
    // order: ring O first, then the anomeric carbon (the one that also carries an O outside the ring)
    const oIdx = ring.findIndex((id) => g.atoms.get(id).el === 'O');
    let order = [...ring.slice(oIdx), ...ring.slice(0, oIdx)];
    const exoO = (id) => g.atoms.get(id).nbrs.some((n) => !ring.includes(n.id) && g.atoms.get(n.id).el === 'O');
    if (!exoO(order[1]) && exoO(order[order.length - 1])) order = [order[0], ...order.slice(1).reverse()];
    const faces = ringFaces(order, M);
    // Haworth convention: viewed from above, O → C1 → C2 … runs clockwise, so "up" is opposite the right-hand normal
    faces.forEach((f) => f.subs.forEach((s) => { s.face = -s.face; }));
    const c1 = faces[1], last = faces[faces.length - 1];
    const anomOH = c1.subs.find((s) => /^O/.test(s.label));
    const tail = last.subs.find((s) => s.label !== 'H');
    let anomer = null;
    if (anomOH && tail) anomer = anomOH.face === tail.face ? 'β' : 'α';
    const series = tail ? (tail.face > 0 ? 'D' : 'L') : null;
    return { order, faces, anomer, series, size: ring.length };
  }

  function haworthSVG(h) {
    const P6 = [[205, 70], [245, 110], [205, 150], [95, 150], [55, 110], [95, 70]];       // O, C1, C2, C3, C4, C5
    const P5 = [[150, 62], [225, 102], [195, 150], [105, 150], [75, 102]];
    const P = h.size === 6 ? P6 : P5;
    let s = `<svg viewBox="0 0 300 220" class="tsvg">`;
    for (let k = 0; k < P.length; k++) {
      const [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
      const front = y1 >= 110 && y2 >= 110;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e6edf3" stroke-width="${front ? 6 : 2}" stroke-linecap="round"/>`;
    }
    h.faces.forEach((f, k) => {
      const [x, y] = P[k];
      if (k === 0) { s += `<circle cx="${x}" cy="${y}" r="10" fill="#0f1520"/><text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="700" fill="${ELEMENTS.O.color}">O</text>`; return; }
      f.subs.forEach((sb) => {
        const dy = sb.face > 0 ? -34 : 34;
        s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + dy}" stroke="#cbd5e1" stroke-width="1.8"/>`;
        s += `<text x="${x}" y="${y + dy + (dy < 0 ? -8 : 10)}" text-anchor="middle" dominant-baseline="middle" font-size="12.5" font-weight="600" fill="${sb.label === 'H' ? '#94a3b8' : '#f9a8d4'}">${esc(sb.label)}</text>`;
      });
      s += `<text x="${x + (k === 1 ? 12 : k === P.length - 1 ? -14 : 0)}" y="${y + (k === 1 || k === P.length - 1 ? -10 : 14)}" font-size="9" fill="#64748b" text-anchor="middle">${k}</text>`;
    });
    return s + '</svg>';
  }

  /* ================= the tab ================= */
  let view = 'fischer';
  function render(el) {
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Load L-alanine, (R)-2-butanol or β-D-glucose from the Stereochemistry examples, or draw your own.</p>'; return; }
    el.innerHTML = `<div class="seg"><button class="seg-b${view === 'fischer' ? ' active' : ''}" data-pv="fischer">Fischer</button><button class="seg-b${view === 'chair' ? ' active' : ''}" data-pv="chair">Chair</button><button class="seg-b${view === 'haworth' ? ' active' : ''}" data-pv="haworth">Haworth</button></div><div id="pv-body"></div>`;
    el.querySelectorAll('[data-pv]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.pv; render(el); }));
    const box = el.querySelector('#pv-body');
    if (view === 'fischer') {
      const f = fischer();
      if (f.error) { box.innerHTML = `<p class="muted-note">${esc(f.error)}</p>`; return; }
      box.innerHTML = `<div class="row" style="align-items:flex-start">${fischerSVG(f)}<div class="small" style="flex:1;min-width:150px">
        <p><b>How to read it:</b> vertical bonds go <i>back</i> (away from you), horizontal bonds come <i>forward</i>. The chain runs top to bottom with the most oxidised carbon at the top.</p>
        ${f.dl ? `<p>This is the <b>${f.dl.letter}</b> isomer: ${esc(f.dl.why)} is on the ${f.dl.letter === 'D' ? 'right' : 'left'}.</p>` : ''}
        <p>R/S labels (purple) come from RDKit’s CIP rules. A quick check: if the lowest-priority group (usually H) is on a horizontal bond, the apparent direction 1→2→3 is <i>reversed</i>.</p>
        <p class="muted-note">Rotating a Fischer projection by 180° in the page keeps it the same molecule; rotating by 90° or swapping two groups gives the enantiomer.</p></div></div>`;
      StudioTools.highlight({ atoms: f.chain, color: '192,132,252' });
    } else if (view === 'chair') {
      const c = chair();
      if (c.error) { box.innerHTML = `<p class="muted-note">${esc(c.error)}</p>`; return; }
      const better = c.dG >= 0 ? 'A' : 'B';
      box.innerHTML = `${chairSVG(c.A, 'Chair A')}${chairSVG(c.B, 'Chair B (after a ring flip)')}
        <div class="card small"><b>Ring flip:</b> every axial group becomes equatorial and vice versa (up stays up, down stays down).
        <div style="margin-top:6px">ΔG(B − A) = <b>${c.dG.toFixed(1)} kJ/mol</b> → at 25 °C about <b>${c.pA.toFixed(c.pA > 99 || c.pA < 1 ? 1 : 0)} % chair A</b> and ${(100 - c.pA).toFixed(c.pA > 99 || c.pA < 1 ? 1 : 0)} % chair B. Chair ${better} is favoured: big groups prefer equatorial positions, away from the 1,3-diaxial hydrogens.</div>
        <p class="muted-note">Energies are sums of A-values (e.g. CH₃ 7.3, OH 3.6, tert-butyl ≈ 20 kJ/mol). Interactions between axial groups on the same side, and anomeric effects in sugars, are not included.</p></div>`;
      StudioTools.highlight({ atoms: c.ring, color: '34,211,238' });
    } else {
      const h = haworth();
      if (h.error) { box.innerHTML = `<p class="muted-note">${esc(h.error)}</p>`; return; }
      box.innerHTML = `${haworthSVG(h)}<div class="small"><p>The ring is drawn flat and seen slightly from above; the thick bonds are nearest to you. Carbon 1 (the anomeric carbon) is on the right, next to the ring oxygen.</p>
        ${h.series ? `<p><b>${h.series}-sugar</b>: the group on the last ring carbon points ${h.series === 'D' ? 'up' : 'down'}.</p>` : ''}
        ${h.anomer ? `<p><b>${h.anomer}-anomer</b>: the OH on C1 is ${h.anomer === 'β' ? 'on the same side as (cis to)' : 'on the opposite side to (trans to)'} the CH₂OH group.</p>` : ''}
        <p class="muted-note">In water, glucose's α and β forms interconvert through the open-chain form (mutarotation); about 64 % is β because all its groups can be equatorial in the chair.</p></div>`;
      StudioTools.highlight({ atoms: h.order, color: '244,114,182' });
    }
  }

  StudioTools.add({ id: 'proj', icon: '✝️', title: 'Fischer, chair & Haworth projections', short: 'Projections', render, hide: () => StudioTools.clearHighlight() });
  return { fischer, chair, haworth };
})();
