/* ============================================================================
   ChemSim · studio/render.js
   ----------------------------------------------------------------------------
   Drawing the molecule on the canvas.
   ============================================================================ */
'use strict';

/* ============================================================================
   11. RENDERING
   ----------------------------------------------------------------------------
   The canvas is redrawn from scratch every time something changes. The same
   draw function is used for the screen (dark theme) and the PNG export
   (black or white ink on a transparent background).
   ============================================================================ */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const THEMES = {
  screen: {
    bond: '#d8e0ea', label: (el) => ELEMENTS[el].color, charge: '#f8fafc', ox: '#fbbf24', oxBg: 'rgba(251,191,36,0.13)',
    cip: '#c084fc', lp: '#cbd5e1', pos: '96,165,250', neg: '248,113,113', dipole: '#a5b4fc', err: '#f87171', warn: '#fbbf24',
  },
  dark: { // black ink for white paper
    bond: '#111111', label: (el) => ELEMENTS[el].print, charge: '#111111', ox: '#b45309', oxBg: 'rgba(180,83,9,0.10)',
    cip: '#7e22ce', lp: '#111111', pos: '29,78,216', neg: '200,30,30', dipole: '#4338ca',
  },
  light: { // white ink for dark slides
    bond: '#ffffff', label: (el) => (el === 'C' || el === 'H' ? '#ffffff' : ELEMENTS[el].color), charge: '#ffffff', ox: '#fbbf24', oxBg: 'rgba(251,191,36,0.15)',
    cip: '#d8b4fe', lp: '#ffffff', pos: '96,165,250', neg: '248,113,113', dipole: '#c7d2fe',
  },
};

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const first = canvas.width === 300 && canvas.height === 150; // browser default size
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (first || (!state.view.x && !state.view.y)) { state.view.x = w / 2; state.view.y = h / 2; }
  render();
}

/** Zoom & pan so the whole molecule fits nicely on screen. */
function fitView() {
  if (!state.atoms.length) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const xs = state.atoms.map((a) => a.x), ys = state.atoms.map((a) => a.y);
  const bw = Math.max(...xs) - Math.min(...xs) || 1, bh = Math.max(...ys) - Math.min(...ys) || 1;
  const s = Math.max(0.4, Math.min(1.8, (w - 220) / bw, (h - 220) / bh));
  state.view.scale = s;
  state.view.x = w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * s;
  state.view.y = h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * s;
  log('view', 'Fit view: zoom', s.toFixed(2));
}

const worldToScreen = (x, y) => ({ x: x * state.view.scale + state.view.x, y: y * state.view.scale + state.view.y });
const screenToWorld = (x, y) => ({ x: (x - state.view.x) / state.view.scale, y: (y - state.view.y) / state.view.scale });

function render() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // subtle dot grid so you can judge distances
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = BOND_LEN * state.view.scale;
  if (g > 14) {
    ctx.fillStyle = 'rgba(148,163,184,0.10)';
    const ox = state.view.x % g, oy = state.view.y % g;
    for (let x = ox; x < canvas.clientWidth; x += g) for (let y = oy; y < canvas.clientHeight; y += g) ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  ctx.setTransform(dpr * state.view.scale, 0, 0, dpr * state.view.scale, dpr * state.view.x, dpr * state.view.y);
  // The molecule may have been swapped in (undo, autosave) since the last analysis.
  if (state.analysis && state.atoms.some((a) => !state.analysis.atoms[a.id])) state.analysis = analyze();
  state.layout = computeLayout(state.analysis);
  drawMolecule(ctx, state.layout, THEMES.screen, true);
  drawDragPreview(ctx);

  document.getElementById('canvas-empty').classList.toggle('hidden', state.atoms.length > 0);
}

/**
 * Draw the whole molecule.
 * @param interactive  true on screen (shows hover & error halos), false for export
 */
function drawMolecule(c, L, T, interactive) {
  const an = state.analysis;
  if (!an) return;
  const ov = state.overlays;
  const lewis = state.notation === 'lewis';
  const rd = state.rd || {};

  // ----- partial-charge glow (drawn first, underneath everything) -----
  if (ov.partial) {
    const glow = (x, y, q) => {
      const a = Math.min(0.75, Math.abs(q) / 0.45);
      if (a < 0.04) return;
      const rgb = q < 0 ? T.neg : T.pos;
      const grd = c.createRadialGradient(x, y, 0, x, y, 22);
      grd.addColorStop(0, `rgba(${rgb},${a})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = grd;
      c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.fill();
    };
    state.atoms.forEach((a) => { const r = an.atoms[a.id]; glow(a.x, a.y, lewis ? r.partial : r.partialGroup); });
    L.virtualH.forEach((h) => glow(h.x, h.y, an.nodes[h.node].q));
  }

  // ----- error / warning halos -----
  if (interactive) {
    state.atoms.forEach((a) => {
      const r = an.atoms[a.id];
      if (r.status !== 'error' && r.status !== 'warn') return;
      const col = r.status === 'error' ? '248,113,113' : '251,191,36';
      c.fillStyle = `rgba(${col},0.22)`;
      c.strokeStyle = `rgba(${col},0.9)`;
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(a.x, a.y, 15, 0, Math.PI * 2); c.fill(); c.stroke();
    });
  }

  // ----- bonds -----
  c.lineCap = 'round';
  c.lineJoin = 'round';
  state.bonds.forEach((b) => {
    const A = getAtom(b.a1), B = getAtom(b.a2);
    if (!A || !B) return;
    drawBond(c, A, B, L.atoms[A.id].radius, L.atoms[B.id].radius, b, an.bonds[b.id], T);
  });
  L.virtualH.forEach((h) => {
    const P = getAtom(h.parentId);
    drawBond(c, P, h, L.atoms[P.id].radius, 6.5, { order: 1, stereo: 0 }, null, T);
  });

  // ----- dipole arrows on polar bonds (point toward the δ− end) -----
  if (ov.partial) {
    const arrows = [];
    state.bonds.forEach((b) => arrows.push({ A: getAtom(b.a1), B: getAtom(b.a2), e: an.bonds[b.id] }));
    L.virtualH.forEach((h) => {
      const P = getAtom(h.parentId);
      const e = an.edges.find((x) => x.j === h.node);
      arrows.push({ A: P, B: h, e, AisI: true });
    });
    arrows.forEach(({ A, B, e }) => {
      if (!e || e.dEN < 0.4) return;
      const negIsA = e.negEnd === e.i;
      drawDipole(c, negIsA ? B : A, negIsA ? A : B, T);
    });
  }

  // ----- atom labels -----
  state.atoms.forEach((a) => {
    const la = L.atoms[a.id];
    if (la.show) drawLabel(c, a, la, T);
  });
  L.virtualH.forEach((h) => drawText(c, 'H', h.x, h.y, LABEL_FONT, T.label('H'), '600'));

  // ----- lone pairs -----
  Object.entries(L.lps).forEach(([id, angs]) => {
    const a = getAtom(Number(id));
    const R = L.atoms[a.id].show ? 13.5 : 9;
    c.fillStyle = T.lp;
    angs.forEach((ang) => {
      const cx = a.x + R * Math.cos(ang), cy = a.y + R * Math.sin(ang);
      const px = -Math.sin(ang) * 3.6, py = Math.cos(ang) * 3.6;
      c.beginPath(); c.arc(cx + px, cy + py, 1.9, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx - px, cy - py, 1.9, 0, Math.PI * 2); c.fill();
    });
  });

  // ----- formal charges, oxidation numbers, partial-charge text, R/S -----
  state.atoms.forEach((a) => {
    const r = an.atoms[a.id];
    const la = L.atoms[a.id];
    const lpAngs = L.lps[a.id] || [];
    const hAngs = L.virtualH.filter((h) => h.parentId === a.id).map((h) => h.ang);
    const extra = [...lpAngs, ...hAngs, ...(la.hText ? [la.hSide > 0 ? 0 : Math.PI] : [])];
    if (ov.formal && a.charge !== 0) {
      const ang = freeAnnotationAngle(a, [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 2], extra);
      const R = la.show ? 14 : 10;
      const x = a.x + R * Math.cos(ang), y = a.y + R * Math.sin(ang);
      c.strokeStyle = T.charge;
      c.lineWidth = 1.1;
      c.beginPath(); c.arc(x, y, 6.2, 0, Math.PI * 2); c.stroke();
      drawText(c, chargeText(a.charge), x, y + 0.3, 10.5, T.charge, '700');
    }
    if (ov.ox) {
      const ang = freeAnnotationAngle(a, [Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, 0, Math.PI], extra);
      drawOxBox(c, a.x + 19 * Math.cos(ang), a.y + 19 * Math.sin(ang), r.ox, T);
    }
    if (ov.partial) {
      const q = lewis ? r.partial : r.partialGroup;
      if (Math.abs(q) >= 0.05) {
        const ang = freeAnnotationAngle(a, [-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, Math.PI + 0.4, 0.4], extra);
        drawText(c, q < 0 ? 'δ−' : 'δ+', a.x + 20 * Math.cos(ang), a.y + 20 * Math.sin(ang), 11.5, `rgb(${q < 0 ? T.neg : T.pos})`, '700');
      }
    }
    if (ov.cip && rd.cipAtoms && rd.cipAtoms[a.id]) {
      const ang = freeAnnotationAngle(a, [-Math.PI / 2, Math.PI / 2, Math.PI, 0], extra);
      drawText(c, `(${rd.cipAtoms[a.id]})`, a.x + 21 * Math.cos(ang), a.y + 21 * Math.sin(ang), 11.5, T.cip, '700', 'italic ');
    }
  });
  L.virtualH.forEach((h) => {
    const nd = an.nodes[h.node];
    if (ov.ox) drawOxBox(c, h.x + 17 * Math.cos(h.ang), h.y + 17 * Math.sin(h.ang), nd.ox, T);
  });
  if (ov.cip && rd.cipBonds) {
    state.bonds.forEach((b) => {
      const lab = rd.cipBonds[b.id];
      if (!lab) return;
      const A = getAtom(b.a1), B = getAtom(b.a2);
      const e = an.bonds[b.id];
      const nx = -(B.y - A.y) / dist(A, B), ny = (B.x - A.x) / dist(A, B);
      const side = bondSide(b, e) || 1;
      drawText(c, `(${lab})`, (A.x + B.x) / 2 - side * nx * 13, (A.y + B.y) / 2 - side * ny * 13, 11.5, T.cip, '700', 'italic ');
    });
  }

  // ----- hover highlight -----
  if (interactive && state.hover) {
    c.strokeStyle = 'rgba(34,211,238,0.95)';
    c.fillStyle = 'rgba(34,211,238,0.12)';
    c.lineWidth = 1.8;
    if (state.hover.type === 'atom') {
      const a = getAtom(state.hover.id);
      if (a) { c.beginPath(); c.arc(a.x, a.y, 13, 0, Math.PI * 2); c.fill(); c.stroke(); }
    } else if (state.hover.type === 'bond') {
      const b = state.bonds.find((x) => x.id === state.hover.id);
      if (b) {
        const A = getAtom(b.a1), B = getAtom(b.a2);
        c.strokeStyle = 'rgba(34,211,238,0.35)';
        c.lineWidth = 12;
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      }
    } else if (state.hover.type === 'vh') {
      const h = L.virtualH.find((x) => x.node === state.hover.node);
      if (h) { c.beginPath(); c.arc(h.x, h.y, 10, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }
  }
}

function drawText(c, text, x, y, size, color, weight = '600', style = '') {
  c.font = `${style}${weight} ${size}px Inter, system-ui, sans-serif`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y);
}

function drawOxBox(c, x, y, ox, T) {
  const t = signed(ox);
  c.font = `700 10px JetBrains Mono, monospace`;
  const w = c.measureText(t).width + 6;
  c.fillStyle = T.oxBg;
  c.strokeStyle = T.ox;
  c.lineWidth = 0.8;
  roundRect(c, x - w / 2, y - 6.5, w, 13, 3);
  c.fill(); c.stroke();
  c.fillStyle = T.ox;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(t, x, y + 0.5);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Draw an element label, with attached hydrogens ("OH", "NH₂", "H₃C") in skeletal view. */
function drawLabel(c, a, la, T) {
  const col = T.label(a.el);
  drawText(c, a.el, a.x, a.y, LABEL_FONT, col, '600');
  if (!la.hText) return;
  c.font = `600 ${LABEL_FONT}px Inter, system-ui, sans-serif`;
  const elW = c.measureText(a.el).width;
  const hW = c.measureText('H').width;
  c.font = `600 ${SUB_FONT}px Inter, system-ui, sans-serif`;
  const subW = la.hText > 1 ? c.measureText(String(la.hText)).width : 0;
  let hx;
  if (la.hSide > 0) hx = a.x + elW / 2 + hW / 2 + 0.5;
  else hx = a.x - elW / 2 - subW - hW / 2 - 0.5;
  drawText(c, 'H', hx, a.y, LABEL_FONT, col, '600');
  if (la.hText > 1) drawText(c, String(la.hText), hx + hW / 2 + subW / 2 + 0.3, a.y + 6, SUB_FONT, col, '600');
}

/** Which side of a bond should the second line of a double bond go on? (+1/−1/0 = centred) */
function bondSide(b, e) {
  const A = getAtom(b.a1), B = getAtom(b.a2);
  if (e && e.ringSize && e.ringCenter) {
    const cr = (B.x - A.x) * (e.ringCenter.y - A.y) - (B.y - A.y) * (e.ringCenter.x - A.x);
    return cr > 0 ? 1 : -1;
  }
  let sum = 0, count = 0;
  [[A, B], [B, A]].forEach(([P, Q]) => {
    neighborIds(P.id).filter((id) => id !== Q.id).forEach((id) => {
      const N = getAtom(id);
      const cr = (B.x - A.x) * (N.y - A.y) - (B.y - A.y) * (N.x - A.x);
      sum += Math.sign(cr);
      count++;
    });
  });
  if (!count || sum === 0) return 0;
  // Terminal C=O style bonds (one end has no other neighbours) look best centred
  const endsWithLabel = neighborIds(A.id).length === 1 || neighborIds(B.id).length === 1;
  if (endsWithLabel && Math.abs(sum) < count) return 0;
  return sum > 0 ? 1 : -1;
}

function drawBond(c, A, B, rA, rB, b, e, T) {
  const len = dist(A, B);
  if (len < 1) return;
  const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
  const nx = -uy, ny = ux;
  // Shorten the bond so it doesn't run into the text labels.
  const p1 = { x: A.x + ux * rA, y: A.y + uy * rA };
  const p2 = { x: B.x - ux * rB, y: B.y - uy * rB };
  c.strokeStyle = T.bond;
  c.fillStyle = T.bond;
  c.lineWidth = 2;
  const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };

  if (b.stereo === 1) {          // solid wedge: narrow at A, wide at B
    c.beginPath();
    c.moveTo(p1.x, p1.y);
    c.lineTo(p2.x + nx * 4.8, p2.y + ny * 4.8);
    c.lineTo(p2.x - nx * 4.8, p2.y - ny * 4.8);
    c.closePath();
    c.fill();
    return;
  }
  if (b.stereo === 6) {          // hashed dash
    c.lineWidth = 1.5;
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const t = 0.08 + (k / n) * 0.92;
      const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
      const w = 0.6 + 4.6 * t;
      line(x + nx * w, y + ny * w, x - nx * w, y - ny * w);
    }
    return;
  }
  if (b.order === 1) { line(p1.x, p1.y, p2.x, p2.y); return; }
  if (b.order === 3) {
    line(p1.x, p1.y, p2.x, p2.y);
    line(p1.x + nx * 4.6, p1.y + ny * 4.6, p2.x + nx * 4.6, p2.y + ny * 4.6);
    line(p1.x - nx * 4.6, p1.y - ny * 4.6, p2.x - nx * 4.6, p2.y - ny * 4.6);
    return;
  }
  // double bond
  const side = b.id ? bondSide(b, e) : 0;
  if (side === 0) {
    line(p1.x + nx * 2.8, p1.y + ny * 2.8, p2.x + nx * 2.8, p2.y + ny * 2.8);
    line(p1.x - nx * 2.8, p1.y - ny * 2.8, p2.x - nx * 2.8, p2.y - ny * 2.8);
  } else {
    line(p1.x, p1.y, p2.x, p2.y);
    const o = 5.6 * side;
    const s1 = rA ? 0 : 0.14, s2 = rB ? 0 : 0.14;   // inner line is a bit shorter
    const q1 = { x: p1.x + (p2.x - p1.x) * s1, y: p1.y + (p2.y - p1.y) * s1 };
    const q2 = { x: p2.x - (p2.x - p1.x) * s2, y: p2.y - (p2.y - p1.y) * s2 };
    line(q1.x + nx * o, q1.y + ny * o, q2.x + nx * o, q2.y + ny * o);
  }
}

/** Dipole arrow: crossed tail at δ+ end, arrowhead at δ− end. */
function drawDipole(c, from, to, T) {
  const len = dist(from, to);
  const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
  const nx = -uy, ny = ux;
  const off = 9;
  const s = { x: from.x + ux * len * 0.22 + nx * off, y: from.y + uy * len * 0.22 + ny * off };
  const e = { x: from.x + ux * len * 0.78 + nx * off, y: from.y + uy * len * 0.78 + ny * off };
  c.strokeStyle = T.dipole;
  c.fillStyle = T.dipole;
  c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(e.x, e.y); c.stroke();
  // cross at the tail (the "+" end)
  const cx = s.x + ux * 4, cy = s.y + uy * 4;
  c.beginPath(); c.moveTo(cx + nx * 3.5, cy + ny * 3.5); c.lineTo(cx - nx * 3.5, cy - ny * 3.5); c.stroke();
  // arrow head
  c.beginPath();
  c.moveTo(e.x + ux * 2, e.y + uy * 2);
  c.lineTo(e.x - ux * 5 + nx * 3.2, e.y - uy * 5 + ny * 3.2);
  c.lineTo(e.x - ux * 5 - nx * 3.2, e.y - uy * 5 - ny * 3.2);
  c.closePath();
  c.fill();
}

function drawDragPreview(c) {
  const d = state.drag;
  if (!d || !d.preview) return;
  const { from, to } = d.preview;
  c.strokeStyle = 'rgba(34,211,238,0.9)';
  c.lineWidth = 2;
  c.setLineDash([5, 4]);
  c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
  c.setLineDash([]);
  c.fillStyle = 'rgba(34,211,238,0.25)';
  c.beginPath(); c.arc(to.x, to.y, 8, 0, Math.PI * 2); c.fill();
}
