/* ============================================================================
   ChemSim · studio/editor.js
   ----------------------------------------------------------------------------
   Adding and removing atoms, bonds and rings.
   ============================================================================ */
'use strict';

/* ============================================================================
   6. EDITING OPERATIONS
   ============================================================================ */
function addAtom(el, x, y) {
  const a = { id: state.nextId++, el, x, y, charge: 0 };
  state.atoms.push(a);
  log('edit', `Added atom ${el} (id ${a.id}) at`, Math.round(x), Math.round(y));
  return a;
}

function addBond(id1, id2, order = 1, stereo = 0) {
  if (id1 === id2) return null;
  const existing = findBond(id1, id2);
  if (existing) {
    existing.order = order;
    existing.stereo = stereo;
    if (stereo) { existing.a1 = id1; existing.a2 = id2; }
    log('edit', `Updated bond ${id1}-${id2} → order ${order}, stereo ${stereo}`);
    return existing;
  }
  const b = { id: state.nextId++, a1: id1, a2: id2, order, stereo };
  state.bonds.push(b);
  log('edit', `Added bond ${id1}-${id2} (order ${order}, stereo ${stereo})`);
  return b;
}

function deleteAtom(id) {
  state.bonds = state.bonds.filter((b) => b.a1 !== id && b.a2 !== id);
  state.atoms = state.atoms.filter((a) => a.id !== id);
  log('edit', 'Deleted atom', id);
}
function deleteBond(id) {
  state.bonds = state.bonds.filter((b) => b.id !== id);
  log('edit', 'Deleted bond', id);
}

/**
 * Work out the nicest direction to grow a new bond from an atom:
 *   no neighbours  → 30° up-right (the classic zig-zag start)
 *   one neighbour  → 120° away, choosing the side that continues a zig-zag
 *                    (or 180° for triple bonds / allenes, which are linear)
 *   2+ neighbours  → the middle of the biggest empty gap
 */
function freeDirection(atom, newOrder = 1) {
  const nbs = neighborIds(atom.id).map(getAtom);
  if (nbs.length === 0) return -Math.PI / 6;
  const angles = nbs.map((n) => angleOf(atom, n));
  if (nbs.length === 1) {
    const nb = nbs[0];
    const oldOrder = findBond(atom.id, nb.id).order;
    if (newOrder === 3 || oldOrder === 3 || (newOrder === 2 && oldOrder === 2)) return angles[0] + Math.PI;
    const cands = [angles[0] + (2 * Math.PI) / 3, angles[0] - (2 * Math.PI) / 3];
    // Zig-zag: the new bond should be parallel to the neighbour's other bond.
    const grand = neighborIds(nb.id).filter((id) => id !== atom.id).map(getAtom);
    const crowd = (ang) => {
      const p = { x: atom.x + BOND_LEN * Math.cos(ang), y: atom.y + BOND_LEN * Math.sin(ang) };
      let m = Infinity;
      state.atoms.forEach((a) => { if (a.id !== atom.id) m = Math.min(m, dist(a, p)); });
      return m;
    };
    const scores = cands.map((ang) => {
      let s = Math.min(crowd(ang), BOND_LEN) * 10;  // avoid bumping into atoms
      if (grand.length) {
        const g = angleOf(nb, grand[0]);
        s += Math.cos(ang - g);                     // prefer zig-zag
      } else {
        s += -Math.sin(ang) * 0.1;                  // tie-break: prefer up
      }
      return s;
    });
    return scores[0] >= scores[1] ? cands[0] : cands[1];
  }
  // Biggest gap between existing bonds
  const sorted = angles.map(norm).sort((a, b) => a - b);
  let best = 0, bestGap = -1;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    if (b - a > bestGap) { bestGap = b - a; best = a + (b - a) / 2; }
  }
  return best;
}

/** Return an atom already sitting at (x,y) (within a small radius), or null. */
function atomNear(x, y, radius = BOND_LEN * 0.3, excludeId = null) {
  let best = null, bd = radius;
  state.atoms.forEach((a) => {
    if (a.id === excludeId) return;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < bd) { bd = d; best = a; }
  });
  return best;
}

/** Grow a new atom from `atom` in the best free direction. */
function growFrom(atom, el = 'C', order = 1, stereo = 0) {
  const ang = freeDirection(atom, order);
  const x = atom.x + BOND_LEN * Math.cos(ang);
  const y = atom.y + BOND_LEN * Math.sin(ang);
  const target = atomNear(x, y, BOND_LEN * 0.25, atom.id) || addAtom(el, x, y);
  addBond(atom.id, target.id, order, stereo);
  return target;
}

/**
 * Place a ring. `hit` can be an atom (spiro attach), a bond (fused ring) or
 * nothing (a free ring centred on point p). Existing atoms that land on a ring
 * corner are re-used, so rings fuse neatly.
 */
function placeRing(kind, hit, p) {
  const aromatic = kind === 'benzene';
  const n = aromatic ? 6 : parseInt(kind, 10);
  const R = BOND_LEN / (2 * Math.sin(Math.PI / n));     // centre → corner
  const apothem = BOND_LEN / (2 * Math.tan(Math.PI / n)); // centre → edge
  let cx, cy, startAng, step = (2 * Math.PI) / n;
  let doubleOffset = 0;   // which ring bonds get the double bonds (benzene)

  if (hit && hit.type === 'bond') {
    const b = state.bonds.find((x) => x.id === hit.id);
    const A = getAtom(b.a1), B = getAtom(b.a2);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const len = dist(A, B) || 1;
    const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
    // Put the ring on the emptier side of the bond.
    const crowd = (sx, sy) => {
      let m = Infinity;
      state.atoms.forEach((a) => { if (a.id !== A.id && a.id !== B.id) m = Math.min(m, Math.hypot(a.x - sx, a.y - sy)); });
      return m;
    };
    const side = crowd(mx + nx * apothem, my + ny * apothem) >= crowd(mx - nx * apothem, my - ny * apothem) ? 1 : -1;
    cx = mx + side * nx * apothem;
    cy = my + side * ny * apothem;
    startAng = Math.atan2(A.y - cy, A.x - cx);
    // Walk round the ring in the direction that reaches B second.
    const angB = Math.atan2(B.y - cy, B.x - cx);
    if (angDiff(startAng + step, angB) > angDiff(startAng - step, angB)) step = -step;
    doubleOffset = b.order === 2 ? 0 : 1;
  } else if (hit && hit.type === 'atom') {
    const A = getAtom(hit.id);
    const dir = freeDirection(A);
    cx = A.x + R * Math.cos(dir);
    cy = A.y + R * Math.sin(dir);
    startAng = Math.atan2(A.y - cy, A.x - cx);
    doubleOffset = bondsOf(A.id).some((b) => b.order === 2) ? 1 : 0;
  } else {
    cx = p.x; cy = p.y;
    startAng = -Math.PI / 2;
  }

  const ids = [];
  for (let k = 0; k < n; k++) {
    const x = cx + R * Math.cos(startAng + k * step);
    const y = cy + R * Math.sin(startAng + k * step);
    const ex = atomNear(x, y, BOND_LEN * 0.3);
    ids.push(ex ? ex.id : addAtom('C', x, y).id);
  }
  for (let k = 0; k < n; k++) {
    const i = ids[k], j = ids[(k + 1) % n];
    const existing = findBond(i, j);
    if (existing) continue;    // keep fused bonds as they are
    const order = aromatic && (k % 2 === doubleOffset % 2) ? 2 : 1;
    addBond(i, j, order, 0);
  }
  log('edit', `Placed ${aromatic ? 'benzene' : n + '-membered'} ring`, ids);
}
