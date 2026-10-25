/* ============================================================================
   ChemSim · wiki/crystal.js
   ----------------------------------------------------------------------------
   A small rotating 3D unit-cell viewer drawn on a 2D canvas (no WebGL needed).
   Drag to rotate; it spins slowly on its own.

     SC   simple cubic           – atoms on the 8 corners        (Po)
     BCC  body-centred cubic     – corners + 1 in the centre     (Na, Fe, W)
     FCC  face-centred cubic     – corners + 6 face centres      (Cu, Al, Au)
     HEX  hexagonal close-packed – ABAB layers in a hexagonal prism (Mg, Zn, Ti)
     DIA  diamond cubic          – FCC + 4 atoms in tetrahedral holes (C, Si, Ge)
   Other lattice types (orthorhombic, tetragonal, rhombohedral, monoclinic,
   complex cubic, other hexagonal) are shown as the *shape* of their cell with
   corner atoms only. Their real cells contain more atoms, and the page says so.
   ============================================================================ */
'use strict';

const Crystal = (() => {
  const INFO = {
    SC:   { name: 'Simple cubic', cn: 6, packing: 52, atoms: 1, note: 'Rare for elements: polonium is the only one at room temperature.' },
    BCC:  { name: 'Body-centred cubic', cn: 8, packing: 68, atoms: 2, note: 'One atom at each corner (each shared by 8 cells) plus one in the centre: 8 × ⅛ + 1 = 2 atoms per cell.' },
    FCC:  { name: 'Face-centred cubic (cubic close-packed)', cn: 12, packing: 74, atoms: 4, note: 'Close-packed layers stacked ABCABC. 8 × ⅛ + 6 × ½ = 4 atoms per cell. Usually ductile, because the close-packed planes slip easily.' },
    HEX:  { name: 'Hexagonal close-packed', cn: 12, packing: 74, atoms: 6, note: 'Close-packed layers stacked ABAB. The hexagonal prism shown holds 6 atoms (the smallest true unit cell holds 2).' },
    DIA:  { name: 'Diamond cubic', cn: 4, packing: 34, atoms: 8, note: 'An FCC lattice with 4 more atoms filling half of the tetrahedral holes, so every atom has 4 tetrahedral bonds. 8 atoms per cell.' },
    HEXO: { name: 'Hexagonal (not close-packed)', note: 'Hexagonal symmetry, but the atoms form molecules, layers or chains (e.g. graphite layers, Se/Te helices, solid H₂/N₂). Only the cell shape is shown.' },
    ORC:  { name: 'Orthorhombic', note: 'Box with three different edge lengths, all angles 90°. The real cell has several atoms (often molecules, as in S₈ or I₂); only the shape is shown.' },
    TET:  { name: 'Tetragonal', note: 'Box with a square base and a different height (a = b ≠ c). Only the cell shape is shown.' },
    RHL:  { name: 'Rhombohedral', note: 'A cube squashed along its body diagonal: all edges equal, angles not 90°. Only the cell shape is shown.' },
    MCL:  { name: 'Monoclinic', note: 'Box with one tilted angle. The real cell holds many atoms (e.g. Pu has 16). Only the cell shape is shown.' },
    CUB:  { name: 'Complex cubic', note: 'Cubic, but with a large basis (e.g. α-manganese has 58 atoms per cell). Only the cell shape is shown.' },
  };

  function structure(code) {
    const pts = [], edges = [];
    const cube = (sx = 1, sy = 1, sz = 1, shear = 0) => {
      const P = (x, y, z) => [(x - 0.5) * sx + (z - 0.5) * shear, (y - 0.5) * sy, (z - 0.5) * sz];
      const corners = [];
      for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) corners.push([x, y, z]);
      corners.forEach((c) => pts.push({ p: P(...c), kind: 'corner' }));
      corners.forEach((a, i) => corners.forEach((b, j) => {
        if (j > i && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1) edges.push([P(...a), P(...b)]);
      }));
      return P;
    };
    if (code === 'SC') cube();
    else if (code === 'BCC') { const P = cube(); pts.push({ p: P(0.5, 0.5, 0.5), kind: 'body' }); }
    else if (code === 'FCC' || code === 'DIA') {
      const P = cube();
      [[0.5, 0.5, 0], [0.5, 0.5, 1], [0.5, 0, 0.5], [0.5, 1, 0.5], [0, 0.5, 0.5], [1, 0.5, 0.5]].forEach((f) => pts.push({ p: P(...f), kind: 'face' }));
      if (code === 'DIA') {
        const inner = [[0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
        inner.forEach((t) => pts.push({ p: P(...t), kind: 'body' }));
        // tetrahedral bonds from each inner atom to its 4 nearest neighbours
        const all = pts.map((q) => q.p);
        inner.forEach((t) => {
          const p = P(...t);
          all.forEach((q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d > 0.01 && d < 0.45) edges.push([p, q, 'bond']); });
        });
      }
    } else if (code === 'HEX') {
      const R = 0.62, h = 0.82;
      const hexPts = (y) => Array.from({ length: 6 }, (_, k) => [R * Math.cos((k * Math.PI) / 3), y, R * Math.sin((k * Math.PI) / 3)]);
      [-h / 2, h / 2].forEach((y) => {
        const ring = hexPts(y);
        ring.forEach((p, k) => { pts.push({ p, kind: 'corner' }); edges.push([p, ring[(k + 1) % 6]]); });
        pts.push({ p: [0, y, 0], kind: 'face' });
      });
      hexPts(-h / 2).forEach((p, k) => edges.push([p, hexPts(h / 2)[k]]));
      // middle (B) layer: 3 atoms over alternate triangular hollows
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
        pts.push({ p: [R * 0.577 * Math.cos(a), 0, R * 0.577 * Math.sin(a)], kind: 'body' });
      }
    } else if (code === 'TET') cube(0.8, 1.25, 0.8);
    else if (code === 'ORC') cube(0.75, 1.15, 0.95);
    else if (code === 'MCL') cube(0.9, 1.0, 0.8, 0.35);
    else if (code === 'RHL') cube(0.9, 0.9, 0.9, 0.3);
    else if (code === 'HEXO') {
      const R = 0.62, h = 0.9;
      const ring = (y) => Array.from({ length: 6 }, (_, k) => [R * Math.cos((k * Math.PI) / 3), y, R * Math.sin((k * Math.PI) / 3)]);
      [-h / 2, h / 2].forEach((y) => { const r = ring(y); r.forEach((p, k) => { pts.push({ p, kind: 'corner' }); edges.push([p, r[(k + 1) % 6]]); }); });
      ring(-h / 2).forEach((p, k) => edges.push([p, ring(h / 2)[k]]));
    } else cube();   // CUB and anything unknown
    return { pts, edges };
  }

  /** Mount a viewer in `canvas`. Returns a stop() function. */
  function mount(canvas, code, color = '#22d3ee') {
    const s = structure(code);
    let rotY = 0.6, rotX = -0.45, dragging = null, last = performance.now(), running = true;
    const kindCol = { corner: color, face: '#fbbf24', body: '#f472b6' };
    const rot = ([x, y, z]) => {
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
    };
    function frame(now) {
      if (!running) return;
      if (!canvas.isConnected) { running = false; return; }
      const dt = Math.min(50, now - last); last = now;
      if (!dragging) rotY += dt * 0.00035;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth || 260, H = canvas.clientHeight || 260;
      if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const S = Math.min(W, H) * 0.55;
      const proj = (p) => { const r = rot(p); const f = 1 / (1 + r[2] * 0.25); return [W / 2 + r[0] * S * f, H / 2 - r[1] * S * f, r[2], f]; };
      s.edges.forEach(([a, b, kind]) => {
        const A = proj(a), B = proj(b);
        c.strokeStyle = kind === 'bond' ? 'rgba(244,114,182,0.8)' : 'rgba(148,163,184,0.45)';
        c.lineWidth = kind === 'bond' ? 3 : 1.2;
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      });
      s.pts.map((q) => ({ q, P: proj(q.p) })).sort((a, b) => b.P[2] - a.P[2]).forEach(({ q, P }) => {
        const r = (code === 'DIA' ? 0.075 : 0.11) * S * P[3];
        const col = kindCol[q.kind];
        const grd = c.createRadialGradient(P[0] - r * 0.35, P[1] - r * 0.35, r * 0.1, P[0], P[1], r);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.35, col);
        grd.addColorStop(1, '#0b0f17');
        c.fillStyle = grd;
        c.beginPath(); c.arc(P[0], P[1], r, 0, Math.PI * 2); c.fill();
      });
      requestAnimationFrame(frame);
    }
    canvas.onpointerdown = (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => {
      if (!dragging) return;
      rotY += (e.clientX - dragging.x) * 0.01;
      rotX = Math.max(-1.4, Math.min(1.4, rotX + (e.clientY - dragging.y) * 0.01));
      dragging = { x: e.clientX, y: e.clientY };
    };
    canvas.onpointerup = () => { dragging = null; };
    requestAnimationFrame(frame);
    return () => { running = false; };
  }

  return { INFO, mount, structure };
})();
