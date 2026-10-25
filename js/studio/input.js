/* ============================================================================
   ChemSim · studio/input.js
   ----------------------------------------------------------------------------
   Mouse and keyboard handling for the drawing tools.
   ============================================================================ */
'use strict';

/* ============================================================================
   12. MOUSE & KEYBOARD (the drawing tools)
   ============================================================================ */

/** What is under the mouse? Atoms win over bonds. */
function hitTest(p) {
  const tol = 12 / state.view.scale;
  let best = null, bd = tol;
  state.atoms.forEach((a) => { const d = dist(a, p); if (d < bd) { bd = d; best = { type: 'atom', id: a.id }; } });
  if (best) return best;
  if (state.layout) {
    state.layout.virtualH.forEach((h) => { const d = dist(h, p); if (d < bd) { bd = d; best = { type: 'vh', node: h.node, parentId: h.parentId }; } });
    if (best) return best;
  }
  bd = 7 / state.view.scale;
  state.bonds.forEach((b) => {
    const d = pointSegmentDistance(p, getAtom(b.a1), getAtom(b.a2));
    if (d < bd) { bd = d; best = { type: 'bond', id: b.id }; }
  });
  return best;
}

function eventWorld(e) {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const p = eventWorld(e);
  state.drag = { sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, start: p, hit: hitTest(p), moved: false, pushed: false };
  hideCanvasTooltip();
});

canvas.addEventListener('pointermove', (e) => {
  const p = eventWorld(e);
  const d = state.drag;
  if (!d) { updateHover(p, e); return; }
  if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
  if (!d.moved) return;

  const hitAtom = d.hit && d.hit.type === 'atom' ? getAtom(d.hit.id) : null;
  if (state.tool === 'select') {
    if (hitAtom) {
      if (!d.pushed) { pushHistory(); d.pushed = true; }
      hitAtom.x = p.x; hitAtom.y = p.y;
      state.analysis = analyze();
    } else {
      state.view.x += e.clientX - d.lastX;
      state.view.y += e.clientY - d.lastY;
    }
  } else if (hitAtom && (state.tool === 'atom' || state.tool === 'bond')) {
    // Drag from an atom: preview a new bond, snapping to an atom or to 15° steps.
    const target = atomNear(p.x, p.y, 14 / state.view.scale, hitAtom.id);
    let to;
    if (target) to = { x: target.x, y: target.y };
    else {
      const ang = Math.round(angleOf(hitAtom, p) / SNAP_ANGLE) * SNAP_ANGLE;
      to = { x: hitAtom.x + BOND_LEN * Math.cos(ang), y: hitAtom.y + BOND_LEN * Math.sin(ang) };
    }
    d.preview = { from: hitAtom, to, target };
  }
  d.lastX = e.clientX; d.lastY = e.clientY;
  render();
});

canvas.addEventListener('pointerup', (e) => {
  const d = state.drag;
  state.drag = null;
  if (!d) return;
  if (!d.moved) handleClick(d.hit, d.start);
  else if (d.preview) handleDragCreate(d);
  else if (d.pushed) onMoleculeChanged();
  else render();
});

canvas.addEventListener('pointerleave', () => {
  if (!state.drag) { state.hover = null; hideCanvasTooltip(); render(); }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const before = screenToWorld(sx, sy);
  const factor = Math.exp(-e.deltaY * 0.0015);
  state.view.scale = Math.min(4, Math.max(0.3, state.view.scale * factor));
  state.view.x = sx - before.x * state.view.scale;
  state.view.y = sy - before.y * state.view.scale;
  render();
}, { passive: false });

function updateHover(p, e) {
  const h = hitTest(p);
  const same = JSON.stringify(h) === JSON.stringify(state.hover);
  state.hover = h;
  if (!same) render();
  if (h) showCanvasTooltip(h, e); else hideCanvasTooltip();
}

/** A simple click (no drag) with the current tool. */
function handleClick(hit, p) {
  const tool = state.tool;
  log('input', `Click with tool "${tool}" on`, hit || 'empty space');
  if (hit && hit.type === 'vh') hit = null;   // Lewis-mode H atoms are not editable
  const atom = hit && hit.type === 'atom' ? getAtom(hit.id) : null;
  const bond = hit && hit.type === 'bond' ? state.bonds.find((b) => b.id === hit.id) : null;

  if (tool === 'select') return;

  if (tool === 'atom') {
    pushHistory();
    if (atom) {
      if (atom.el === state.element && state.element !== 'H') growFrom(atom, state.element);
      else { atom.el = state.element; atom.charge = 0; }
    } else if (bond) {
      state.undo.pop();
      return;
    } else {
      addAtom(state.element, p.x, p.y);
    }
  } else if (tool === 'bond') {
    const bt = BOND_TYPES[state.bondType];
    pushHistory();
    if (atom) {
      growFrom(atom, 'C', bt.order, bt.stereo);
    } else if (bond) {
      if (state.bondType === 'single' && !bond.stereo) {
        bond.order = (bond.order % 3) + 1;          // cycle 1 → 2 → 3 → 1
      } else if (bt.stereo) {
        if (bond.stereo === bt.stereo) { const t = bond.a1; bond.a1 = bond.a2; bond.a2 = t; } // flip direction
        else { bond.stereo = bt.stereo; bond.order = 1; }
      } else {
        bond.order = bt.order;
        bond.stereo = 0;
      }
    } else {
      const a = addAtom('C', p.x - (BOND_LEN / 2) * Math.cos(Math.PI / 6), p.y + (BOND_LEN / 2) * Math.sin(Math.PI / 6));
      const b = addAtom('C', p.x + (BOND_LEN / 2) * Math.cos(Math.PI / 6), p.y - (BOND_LEN / 2) * Math.sin(Math.PI / 6));
      addBond(a.id, b.id, bt.order, bt.stereo);
    }
  } else if (tool === 'ring') {
    pushHistory();
    placeRing(state.ringType, atom ? { type: 'atom', id: atom.id } : bond ? { type: 'bond', id: bond.id } : null, p);
  } else if (tool === 'charge') {
    if (!atom) return;
    pushHistory();
    atom.charge = Math.max(-3, Math.min(3, atom.charge + state.chargeDelta));
  } else if (tool === 'erase') {
    if (!atom && !bond) return;
    pushHistory();
    if (atom) deleteAtom(atom.id); else deleteBond(bond.id);
    state.hover = null;
  }
  onMoleculeChanged();
}

/** Mouse was dragged from an atom: make a bond to the target. */
function handleDragCreate(d) {
  const { from, to, target } = d.preview;
  pushHistory();
  const bt = state.tool === 'bond' ? BOND_TYPES[state.bondType] : BOND_TYPES.single;
  const el = state.tool === 'atom' ? state.element : 'C';
  const end = target || atomNear(to.x, to.y, BOND_LEN * 0.25, from.id) || addAtom(el, to.x, to.y);
  addBond(from.id, end.id, bt.order, bt.stereo);
  onMoleculeChanged();
}

window.addEventListener('keydown', (e) => {
  if (!ChemRouter.isActive('studio')) return;   // shortcuts only in the Molecule Studio tab
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') { closeModal3D(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const h = state.hover;
  if (!h) return;
  if (h.type === 'atom') {
    const a = getAtom(h.id);
    const el = ELEMENT_KEYS[e.key.toLowerCase()];
    if (el) { pushHistory(); a.el = el; a.charge = 0; onMoleculeChanged(); return; }
    if (e.key === '+' || e.key === '=') { pushHistory(); a.charge = Math.min(3, a.charge + 1); onMoleculeChanged(); return; }
    if (e.key === '-') { pushHistory(); a.charge = Math.max(-3, a.charge - 1); onMoleculeChanged(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { pushHistory(); deleteAtom(a.id); state.hover = null; hideCanvasTooltip(); onMoleculeChanged(); }
  } else if (h.type === 'bond') {
    const b = state.bonds.find((x) => x.id === h.id);
    if (['1', '2', '3'].includes(e.key)) { pushHistory(); b.order = Number(e.key); b.stereo = 0; onMoleculeChanged(); return; }
    if (e.key === 'w') { pushHistory(); b.order = 1; b.stereo = 1; onMoleculeChanged(); return; }
    if (e.key === 'd') { pushHistory(); b.order = 1; b.stereo = 6; onMoleculeChanged(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { pushHistory(); deleteBond(b.id); state.hover = null; hideCanvasTooltip(); onMoleculeChanged(); }
  }
});
