/* ============================================================================
   ChemSim · studio/arrows.js
   ----------------------------------------------------------------------------
   Curved electron-pushing arrows for drawing reaction mechanisms.

     • Full arrow (two-barbed head) = an electron PAIR moves (polar mechanisms).
     • Half arrow (one barb, "fishhook") = ONE electron moves (radicals).

   An arrow starts where the electrons are: a lone pair (click an atom) or a
   bond (click the bond). It ends where they go: an atom (forming a new bond
   or a lone pair) or a bond (making it a double/triple bond).
   Arrows are stored with the drawing (undo, autosave, PNG/SVG export):
     state.arrows = [{ id, kind: 'full'|'half', from: {type, id}, to: {type, id}, bend: ±1 }]
   ============================================================================ */
'use strict';

state.arrows = state.arrows || [];
state.arrowType = 'full';
state.arrowFrom = null;            // first click of an arrow that is being drawn

/** Where an arrow end sits: atoms slightly off-centre (at a lone pair), bonds at the midpoint. */
function arrowEndPoint(end, other, L, isStart) {
  if (end.type === 'bond') {
    const b = state.bonds.find((x) => x.id === end.id);
    if (!b) return null;
    const A = getAtom(b.a1), B = getAtom(b.a2);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, bond: b };
  }
  const a = getAtom(end.id);
  if (!a) return null;
  const toward = other ? angleOf(a, other) : -Math.PI / 2;
  if (isStart) {
    // start at the lone pair closest to the direction of travel, if there is one
    const lps = (L && L.lps && L.lps[a.id]) || [];
    let ang = toward;
    if (lps.length) ang = lps.reduce((best, x) => (angDiff(x, toward) < angDiff(best, toward) ? x : best), lps[0]);
    else ang = freeAnnotationAngle(a, [toward - 0.6, toward + 0.6, toward]);
    return { x: a.x + 15 * Math.cos(ang), y: a.y + 15 * Math.sin(ang) };
  }
  return { x: a.x + 14 * Math.cos(toward), y: a.y + 14 * Math.sin(toward) };
}

/** The quadratic Bézier of an arrow: { p0, c, p1 } or null. */
function arrowCurve(ar, L) {
  const centre = (end) => {
    if (end.type === 'atom') return getAtom(end.id);
    const b = state.bonds.find((x) => x.id === end.id);
    if (!b) return null;
    const A = getAtom(b.a1), B = getAtom(b.a2);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  };
  const cf = centre(ar.from), ct = centre(ar.to);
  if (!cf || !ct) return null;
  const p0 = arrowEndPoint(ar.from, ct, L, true), p1 = arrowEndPoint(ar.to, cf, L, false);
  if (!p0 || !p1) return null;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const h = Math.max(16, len * 0.45) * (ar.bend || 1);
  return { p0, p1, c: { x: (p0.x + p1.x) / 2 + nx * h, y: (p0.y + p1.y) / 2 + ny * h } };
}

const bez = (q, t) => ({
  x: (1 - t) * (1 - t) * q.p0.x + 2 * (1 - t) * t * q.c.x + t * t * q.p1.x,
  y: (1 - t) * (1 - t) * q.p0.y + 2 * (1 - t) * t * q.c.y + t * t * q.p1.y,
});

/** Draw every arrow (called at the end of drawMolecule). */
function drawArrows(c, L, T, interactive) {
  const col = T.arrow || '#f472b6';
  (state.arrows || []).forEach((ar) => {
    const q = arrowCurve(ar, L);
    if (!q) return;
    const hovered = interactive && state.hover && state.hover.type === 'arrow' && state.hover.id === ar.id;
    c.strokeStyle = hovered ? '#22d3ee' : col;
    c.fillStyle = hovered ? '#22d3ee' : col;
    c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(q.p0.x, q.p0.y); c.quadraticCurveTo(q.c.x, q.c.y, q.p1.x, q.p1.y); c.stroke();
    // head: direction of the curve at its end
    const ux0 = q.p1.x - q.c.x, uy0 = q.p1.y - q.c.y, ul = Math.hypot(ux0, uy0) || 1;
    const ux = ux0 / ul, uy = uy0 / ul, nx = -uy, ny = ux;
    const tip = q.p1, back = { x: tip.x - ux * 8, y: tip.y - uy * 8 };
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    if (ar.kind === 'half') {
      // one barb, on the outside of the curve
      const side = (ar.bend || 1) > 0 ? 1 : -1;
      c.lineTo(back.x + nx * 4.5 * side, back.y + ny * 4.5 * side);
      c.lineTo(back.x + ux * 2, back.y + uy * 2);
    } else {
      c.lineTo(back.x + nx * 4, back.y + ny * 4);
      c.lineTo(back.x + ux * 2.5, back.y + uy * 2.5);
      c.lineTo(back.x - nx * 4, back.y - ny * 4);
    }
    c.closePath(); c.fill();
  });
  // the first click of an arrow being drawn
  if (interactive && state.arrowFrom) {
    const f = state.arrowFrom;
    const P = f.type === 'atom' ? getAtom(f.id) : (() => { const b = state.bonds.find((x) => x.id === f.id); return b ? { x: (getAtom(b.a1).x + getAtom(b.a2).x) / 2, y: (getAtom(b.a1).y + getAtom(b.a2).y) / 2 } : null; })();
    if (P) {
      c.strokeStyle = '#f472b6'; c.lineWidth = 1.5; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(P.x, P.y, 12, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  }
}

/** Is p near an arrow? → { type: 'arrow', id } */
function arrowHit(p) {
  const L = state.layout;
  let best = null, bd = 6 / state.view.scale;
  (state.arrows || []).forEach((ar) => {
    const q = arrowCurve(ar, L);
    if (!q) return;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const s = bez(q, t);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = { type: 'arrow', id: ar.id }; }
    }
  });
  return best;
}

/** A click with the arrow tool. Returns true if it changed the drawing. */
function arrowToolClick(hit) {
  if (hit && hit.type === 'arrow') {
    pushHistory();
    const ar = state.arrows.find((x) => x.id === hit.id);
    ar.bend = -(ar.bend || 1);        // click an arrow: curve it the other way
    return true;
  }
  if (!hit || (hit.type !== 'atom' && hit.type !== 'bond')) { state.arrowFrom = null; render(); return false; }
  if (!state.arrowFrom) {
    state.arrowFrom = { type: hit.type, id: hit.id };
    $('hint-bar').textContent = `💡 Now click where the electron${state.arrowType === 'half' ? '' : 's'} go: an atom (new bond or lone pair) or a bond (it becomes a multiple bond).`;
    render();
    return false;
  }
  const from = state.arrowFrom;
  state.arrowFrom = null;
  if (from.type === hit.type && from.id === hit.id) { render(); return false; }
  pushHistory();
  state.arrows.push({ id: state.nextId++, kind: state.arrowType, from, to: { type: hit.type, id: hit.id }, bend: 1 });
  log('edit', `Added ${state.arrowType} arrow`, from, '→', hit);
  setTool('arrow');
  return true;
}

/** Remove arrows that point at atoms/bonds that no longer exist. */
function pruneArrows() {
  const ok = (e) => (e.type === 'atom' ? !!getAtom(e.id) : state.bonds.some((b) => b.id === e.id));
  state.arrows = (state.arrows || []).filter((a) => ok(a.from) && ok(a.to));
}

function arrowTooltip(id) {
  const ar = state.arrows.find((x) => x.id === id);
  if (!ar) return '';
  const what = ar.kind === 'half' ? 'one electron (fishhook arrow, radical chemistry)' : 'an electron pair';
  const src = ar.from.type === 'atom' ? `a lone pair on ${atomLabelName(ar.from.id)}` : 'a bond';
  const dst = ar.to.type === 'atom' ? `${atomLabelName(ar.to.id)} (a new bond or lone pair forms there)` : 'a bond (its bond order goes up)';
  return `<b>Curved arrow</b><br/>Moves ${what} from ${src} to ${dst}.<br/><span class="dim">Arrow tool: click to curve it the other way · Eraser: click to delete.</span>`;
}
