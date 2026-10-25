/* ============================================================================
   ChemSim · studio/layout.js
   ----------------------------------------------------------------------------
   Where labels, Lewis-mode H atoms and lone pairs go.
   ============================================================================ */
'use strict';

/* ============================================================================
   10. LAYOUT FOR DRAWING
   ----------------------------------------------------------------------------
   Decides which atoms get a text label, which side "H" goes on in "OH" or
   "HO", where Lewis-mode hydrogens are placed and where lone-pair dots go.
   ============================================================================ */
function labelShown(a, r) {
  if (a.el !== 'C') return true;
  if (state.notation === 'lewis') return true;
  return r.sigma === 0 || a.charge !== 0 || r.status === 'error';
}

/**
 * Pick angles around an atom for `n` new items (H atoms / lone pairs), filling
 * the biggest empty gaps between existing bonds first. Returns the angles
 * sorted so the ones furthest from existing bonds come first.
 */
function slotAngles(atom, n) {
  if (n <= 0) return [];
  const bondAngles = neighborIds(atom.id).map((id) => norm(angleOf(atom, getAtom(id))));
  if (!bondAngles.length) {
    // Isolated atom: left, right, down, up (gives the classic Lewis layouts)
    const preset = { 1: [0], 2: [Math.PI, 0], 3: [Math.PI, 0, Math.PI / 2], 4: [Math.PI, 0, Math.PI / 2, -Math.PI / 2] };
    if (preset[n]) return preset[n];
    return Array.from({ length: n }, (_, k) => Math.PI + (2 * Math.PI * k) / n);
  }
  const sorted = [...bondAngles].sort((a, b) => a - b);
  const gaps = sorted.map((a, i) => {
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    return { start: a, size: b - a, count: 0 };
  });
  for (let k = 0; k < n; k++) {
    let best = gaps[0];
    gaps.forEach((g) => {
      const s = g.size / (g.count + 1), bs = best.size / (best.count + 1);
      if (s > bs + 1e-6 || (Math.abs(s - bs) < 1e-6 && g.size > best.size)) best = g;
    });
    best.count++;
  }
  const out = [];
  gaps.forEach((g) => { for (let i = 0; i < g.count; i++) out.push(g.start + (g.size * (i + 1)) / (g.count + 1)); });
  const clearance = (ang) => Math.min(...bondAngles.map((b) => angDiff(ang, b)));
  return out.sort((a, b) => clearance(b) - clearance(a));
}

function computeLayout(an) {
  const L = { atoms: {}, virtualH: [], lps: {} };
  if (!an) return L;
  state.atoms.forEach((a) => {
    const r = an.atoms[a.id];
    const nbs = neighborIds(a.id).map(getAtom);
    const show = labelShown(a, r);
    // Which side should the "H₂" go on? Away from the bonds.
    let hSide = 1;
    if (nbs.length) {
      const mx = nbs.reduce((s, n) => s + (n.x - a.x), 0) / nbs.length;
      if (mx > 5) hSide = -1;
    }
    const lewis = state.notation === 'lewis';
    const hText = !lewis && r.implicitH > 0 ? r.implicitH : 0;
    const radius = show ? (a.el.length > 1 ? 11 : 8.5) : 0;
    L.atoms[a.id] = { show, hSide, hText, radius };

    const wantLP = lewis || state.overlays.lp;
    const nSlots = (lewis ? r.implicitH : 0) + (wantLP ? r.lonePairs : 0);
    const slots = slotAngles(a, nSlots);
    if (lewis) {
      r.hNodes.forEach((nodeIdx, k) => {
        const ang = slots[k];
        L.virtualH.push({ x: a.x + BOND_LEN * 0.8 * Math.cos(ang), y: a.y + BOND_LEN * 0.8 * Math.sin(ang), parentId: a.id, node: nodeIdx, ang });
      });
    }
    if (wantLP) {
      let lpSlots = slots.slice(lewis ? r.implicitH : 0);
      // In skeletal view the hidden H text sits on one side; avoid it.
      if (!lewis && hText) {
        const all = slotAngles(a, r.lonePairs + 1);
        lpSlots = all.filter((ang) => angDiff(ang, hSide > 0 ? 0 : Math.PI) > 0.6).slice(0, r.lonePairs);
        while (lpSlots.length < r.lonePairs) lpSlots.push(all[lpSlots.length]);
      }
      L.lps[a.id] = lpSlots;
    }
  });
  return L;
}

/** Choose a free angle near an atom for a small annotation (charge, ox number…). */
function freeAnnotationAngle(a, preferred, extraAngles = []) {
  const taken = [...neighborIds(a.id).map((id) => angleOf(a, getAtom(id))), ...extraAngles];
  for (const p of preferred) if (taken.every((t) => angDiff(p, t) > 0.55)) return p;
  return preferred[0];
}
