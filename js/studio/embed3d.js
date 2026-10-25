/* ============================================================================
   ChemSim · studio/embed3d.js
   ----------------------------------------------------------------------------
   Builds 3D coordinates with a small force field.
   ============================================================================ */
'use strict';

/* ============================================================================
   15. 3D MODEL BUILDER
   ----------------------------------------------------------------------------
   RDKit.js (the browser version) does not include RDKit's 3D embedding, so we
   use a small "toy" force field of our own:
     1. Start from your 2D drawing (z ≈ 0). Wedge atoms are pushed up (+z) and
        dash atoms down (−z), so stereochemistry starts out right.
     2. Add the hidden hydrogens pointing away from the existing bonds.
     3. Minimise an energy made of simple springs:
          • bonds      → ideal length from covalent radii (shorter for = and ≡)
          • angles     → VSEPR angle (109.5° sp³, 120° sp², 180° sp) via the
                         1–3 distance (law of cosines)
          • planarity  → sp² centres and the 6 atoms around a C=C stay flat
          • chirality  → a stereocentre may not flip (signed volume)
          • E/Z        → substituents keep cis/trans from the drawing
          • clashes    → non-bonded atoms push apart
   The result is not a quantum-chemistry geometry, but shapes, angles and
   stereochemistry are right, which is what you need for learning.
   ============================================================================ */
function bondLength(el1, el2, order) {
  const base = ELEMENTS[el1].covR + ELEMENTS[el2].covR;
  return base * (order === 2 ? 0.87 : order === 3 ? 0.78 : 1);
}
function idealAngle(nd) {
  if (nd.sn === 2) return Math.PI;
  if (nd.sn === 3) return (120 * Math.PI) / 180;
  if (nd.sn === 4) return ((nd.lp === 1 ? 107 : nd.lp >= 2 ? 104.5 : 109.47) * Math.PI) / 180;
  return null;   // SN 5/6: handled by 90° repulsion instead
}

function embed3D(an) {
  const t0 = performance.now();
  const nodes = an.nodes, edges = an.edges, N = nodes.length;
  const P = new Float64Array(N * 3);
  const nb = nodes.map(() => []);
  edges.forEach((e) => { nb[e.i].push(e.j); nb[e.j].push(e.i); });
  let seed = 12345;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };  // repeatable

  // 1. heavy (drawn) atoms from the 2D coordinates
  nodes.forEach((nd, i) => {
    if (nd.implicit) return;
    const a = getAtom(nd.atomId);
    P[3 * i] = a.x * MOL_SCALE;
    P[3 * i + 1] = -a.y * MOL_SCALE;
    P[3 * i + 2] = rand() * 0.3;
  });
  // wedge → up, dash → down
  state.bonds.forEach((b) => {
    if (!b.stereo) return;
    const j = an.nodeIndex.get(b.a2);
    P[3 * j + 2] += b.stereo === 1 ? 1.1 : -1.1;
  });

  // 2. place implicit H atoms pointing away from existing neighbours
  state.atoms.forEach((a) => {
    const r = an.atoms[a.id];
    if (!r.hNodes.length) return;
    const c = an.nodeIndex.get(a.id);
    const placed = nb[c].filter((j) => !nodes[j].implicit);
    let vx = 0, vy = 0, vz = 0;
    placed.forEach((j) => {
      const dx = P[3 * j] - P[3 * c], dy = P[3 * j + 1] - P[3 * c + 1], dz = P[3 * j + 2] - P[3 * c + 2];
      const l = Math.hypot(dx, dy, dz) || 1;
      vx -= dx / l; vy -= dy / l; vz -= dz / l;
    });
    let vl = Math.hypot(vx, vy, vz);
    if (vl < 0.3) { vx = 0.2; vy = 0.3; vz = 1; vl = Math.hypot(vx, vy, vz); }
    vx /= vl; vy /= vl; vz /= vl;
    // two perpendicular directions to spread several H atoms
    let ux = -vy, uy = vx, uz = 0;
    if (Math.hypot(ux, uy, uz) < 0.1) { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const wx = vy * uz - vz * uy, wy = vz * ux - vx * uz, wz = vx * uy - vy * ux;
    const n = r.hNodes.length;
    const spread = n === 1 ? 0 : n === 2 ? 0.95 : 1.2;
    r.hNodes.forEach((h, k) => {
      const phi = (2 * Math.PI * k) / n;
      const dx = vx * Math.cos(spread) + (ux * Math.cos(phi) + wx * Math.sin(phi)) * Math.sin(spread);
      const dy = vy * Math.cos(spread) + (uy * Math.cos(phi) + wy * Math.sin(phi)) * Math.sin(spread);
      const dz = vz * Math.cos(spread) + (uz * Math.cos(phi) + wz * Math.sin(phi)) * Math.sin(spread);
      const L = bondLength(a.el, 'H', 1);
      P[3 * h] = P[3 * c] + dx * L + rand() * 0.05;
      P[3 * h + 1] = P[3 * c + 1] + dy * L + rand() * 0.05;
      P[3 * h + 2] = P[3 * c + 2] + dz * L + rand() * 0.05;
    });
  });

  // 3. build the list of energy terms
  const dTerms = [];        // [i, j, target, k, onlyIfShorter]
  const near = new Set();   // pairs that are 1-2 or 1-3 (no clash term)
  const key = (i, j) => (i < j ? i * N + j : j * N + i);
  edges.forEach((e) => {
    dTerms.push([e.i, e.j, bondLength(nodes[e.i].el, nodes[e.j].el, e.order), 120, false]);
    near.add(key(e.i, e.j));
  });
  const bl = (i, j) => { const e = edges.find((x) => (x.i === i && x.j === j) || (x.i === j && x.j === i)); return bondLength(nodes[i].el, nodes[j].el, e ? e.order : 1); };
  nodes.forEach((nd, c) => {
    const ns = nb[c];
    const th = idealAngle(nd);
    for (let x = 0; x < ns.length; x++) for (let y = x + 1; y < ns.length; y++) {
      const i = ns[x], j = ns[y];
      const ri = bl(c, i), rj = bl(c, j);
      if (th !== null) dTerms.push([i, j, Math.sqrt(ri * ri + rj * rj - 2 * ri * rj * Math.cos(th)), 40, false]);
      else dTerms.push([i, j, Math.sqrt(ri * ri + rj * rj) * 0.98, 40, true]);   // ≥ 90°
      near.add(key(i, j));
    }
  });
  const planar = [];   // [c, a, b, d]: signed volume should be 0
  nodes.forEach((nd, c) => { if (nd.sn === 3 && nb[c].length === 3) planar.push([c, ...nb[c]]); });
  const chiral = [];   // [c, a, b, d, sign]
  edges.forEach((e) => {
    if (e.order !== 2) return;
    const I = nb[e.i].filter((x) => x !== e.j), J = nb[e.j].filter((x) => x !== e.i);
    I.forEach((a) => J.forEach((d) => planar.push([e.i, e.j, a, d])));
    // E/Z: keep cis/trans of explicitly drawn substituents
    I.filter((a) => !nodes[a].implicit).forEach((a) => J.filter((d) => !nodes[d].implicit).forEach((d) => {
      const A = getAtom(nodes[a].atomId), Bi = getAtom(nodes[e.i].atomId), Bj = getAtom(nodes[e.j].atomId), D = getAtom(nodes[d].atomId);
      const cr1 = (Bj.x - Bi.x) * (A.y - Bi.y) - (Bj.y - Bi.y) * (A.x - Bi.x);
      const cr2 = (Bj.x - Bi.x) * (D.y - Bi.y) - (Bj.y - Bi.y) * (D.x - Bi.x);
      const cis = Math.sign(cr1) === Math.sign(cr2);
      const r1 = bl(e.i, a), r2 = bl(e.i, e.j), r3 = bl(e.j, d);
      const ax = -r1 / 2, ay = (r1 * Math.sqrt(3)) / 2;
      const dx = r2 + r3 / 2, dy = ((cis ? 1 : -1) * r3 * Math.sqrt(3)) / 2;
      dTerms.push([a, d, Math.hypot(dx - ax, dy - ay), 25, false]);
    }));
  });
  // Stereocentres: any atom at the narrow end of a wedge/dash. The handedness
  // is read straight from the 2D drawing (s = +1 wedge toward you, −1 dash):
  //   • 3 other drawn neighbours: looking from the wedge, their clockwise /
  //     anticlockwise order fixes the chirality → volume of those three.
  //   • 2 other drawn neighbours (+ hidden H): the wedge is above the plane
  //     → volume of (wedge, neighbour 1, neighbour 2).
  const cross2 = (o, p, q) => (P[3 * p] - P[3 * o]) * (P[3 * q + 1] - P[3 * o + 1]) - (P[3 * p + 1] - P[3 * o + 1]) * (P[3 * q] - P[3 * o]);
  state.bonds.forEach((b) => {
    if (!b.stereo) return;
    const c = an.nodeIndex.get(b.a1);
    if (nb[c].length < 4 || chiral.some((x) => x[0] === c)) return;
    const w = an.nodeIndex.get(b.a2);
    const s = b.stereo === 1 ? 1 : -1;
    const drawn = nb[c].filter((x) => x !== w && !nodes[x].implicit);
    if (drawn.length >= 3) {
      const [o0, o1, o2] = drawn;
      const area = cross2(o0, o1, o2);
      if (Math.abs(area) > 0.05) chiral.push([c, o0, o1, o2, -s * Math.sign(area)]);
    } else if (drawn.length === 2) {
      const [o0, o1] = drawn;
      const cr = cross2(c, o0, o1);
      if (Math.abs(cr) > 0.05) chiral.push([c, w, o0, o1, s * Math.sign(cr)]);
    }
  });

  // 4. energy + gradient
  const G = new Float64Array(N * 3);
  function energy(Pos, Grad) {
    Grad.fill(0);
    let E = 0;
    const dterm = (i, j, d0, k, onlyShort) => {
      const dx = Pos[3 * i] - Pos[3 * j], dy = Pos[3 * i + 1] - Pos[3 * j + 1], dz = Pos[3 * i + 2] - Pos[3 * j + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const diff = d - d0;
      if (onlyShort && diff > 0) return;
      E += k * diff * diff;
      const g = (2 * k * diff) / d;
      Grad[3 * i] += g * dx; Grad[3 * i + 1] += g * dy; Grad[3 * i + 2] += g * dz;
      Grad[3 * j] -= g * dx; Grad[3 * j + 1] -= g * dy; Grad[3 * j + 2] -= g * dz;
    };
    dTerms.forEach((t) => dterm(t[0], t[1], t[2], t[3], t[4]));
    // clashes between atoms that are not 1-2 or 1-3 neighbours
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      if (near.has(key(i, j))) continue;
      const hi = nodes[i].el === 'H', hj = nodes[j].el === 'H';
      const dmin = hi && hj ? 2.0 : hi || hj ? 2.45 : 2.75;
      dterm(i, j, dmin, 6, true);
    }
    // volume terms (planarity → 0, chirality → keep sign)
    const vterm = (c, a, b, d, target, k, oneSided) => {
      const ax = Pos[3 * a] - Pos[3 * c], ay = Pos[3 * a + 1] - Pos[3 * c + 1], az = Pos[3 * a + 2] - Pos[3 * c + 2];
      const bx = Pos[3 * b] - Pos[3 * c], by = Pos[3 * b + 1] - Pos[3 * c + 1], bz = Pos[3 * b + 2] - Pos[3 * c + 2];
      const dx = Pos[3 * d] - Pos[3 * c], dy = Pos[3 * d + 1] - Pos[3 * c + 1], dz = Pos[3 * d + 2] - Pos[3 * c + 2];
      const V = ax * (by * dz - bz * dy) + ay * (bz * dx - bx * dz) + az * (bx * dy - by * dx);
      let diff = V - target;
      if (oneSided) { if (oneSided * V >= Math.abs(target)) return; diff = V - target; }
      E += k * diff * diff;
      const g = 2 * k * diff;
      // dV/da = b × d, dV/db = d × a, dV/dd = a × b, dV/dc = −(sum)
      const ga = [by * dz - bz * dy, bz * dx - bx * dz, bx * dy - by * dx];
      const gb = [dy * az - dz * ay, dz * ax - dx * az, dx * ay - dy * ax];
      const gd = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      for (let m = 0; m < 3; m++) {
        Grad[3 * a + m] += g * ga[m];
        Grad[3 * b + m] += g * gb[m];
        Grad[3 * d + m] += g * gd[m];
        Grad[3 * c + m] -= g * (ga[m] + gb[m] + gd[m]);
      }
    };
    planar.forEach(([c, a, b, d]) => vterm(c, a, b, d, 0, 15, 0));
    chiral.forEach(([c, a, b, d, s]) => vterm(c, a, b, d, s * 0.5, 40, s));
    return E;
  }

  // 5. minimise (steepest descent with an adaptive step size)
  let E = energy(P, G);
  let step = 0.002;
  const trial = new Float64Array(N * 3), G2 = new Float64Array(N * 3);
  let it = 0;
  for (; it < 4000; it++) {
    for (let k = 0; k < 3 * N; k++) {
      const s = Math.max(-0.2, Math.min(0.2, step * G[k]));
      trial[k] = P[k] - s;
    }
    const E2 = energy(trial, G2);
    if (E2 < E) {
      P.set(trial); G.set(G2);
      const dE = E - E2;
      E = E2;
      step = Math.min(step * 1.15, 0.05);
      if (dE < 1e-9 && it > 300) break;
    } else {
      step *= 0.5;
      if (step < 1e-9) break;
    }
  }
  // centre the molecule on the origin
  const cen = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let m = 0; m < 3; m++) cen[m] += P[3 * i + m] / N;
  for (let i = 0; i < N; i++) for (let m = 0; m < 3; m++) P[3 * i + m] -= cen[m];
  log('3d', `Embedded ${N} atoms: ${it} iterations, final energy ${E.toFixed(4)}, ${(performance.now() - t0).toFixed(0)} ms`,
    { terms: dTerms.length, planar: planar.length, stereocentres: chiral.length });

  // 6. write a 3D MOL block for 3Dmol.js
  const f = (v) => v.toFixed(4).padStart(10);
  const p3 = (v) => String(v).padStart(3);
  const lines = ['', '  ChemSim 3D', ''];
  lines.push(`${p3(N)}${p3(edges.length)}  0  0  0  0  0  0  0  0999 V2000`);
  nodes.forEach((nd, i) => lines.push(`${f(P[3 * i])}${f(P[3 * i + 1])}${f(P[3 * i + 2])} ${nd.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`));
  edges.forEach((e) => lines.push(`${p3(e.i + 1)}${p3(e.j + 1)}${p3(e.order)}  0`));
  const charged = nodes.map((nd, i) => [i + 1, nd.charge]).filter(([, c]) => c);
  for (let k = 0; k < charged.length; k += 8) {
    const chunk = charged.slice(k, k + 8);
    lines.push(`M  CHG${p3(chunk.length)}` + chunk.map(([i, c]) => ` ${p3(i)} ${p3(c)}`).join(''));
  }
  lines.push('M  END', '$$$$');
  return { molblock: lines.join('\n'), coords: P, charges: nodes.map((nd) => nd.q), elements: nodes.map((nd) => nd.el) };
}
