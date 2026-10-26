/* ============================================================================
   ChemSim · beaker/render.js
   ----------------------------------------------------------------------------
   Draws the lab bench: beaker, liquid colour, cloudy precipitates that settle,
   crystals, metal pieces, rising bubbles, foam, steam, burner or ice bath,
   thermometer, and short "effect" animations for gas tests (pop, relit
   splint, milky limewater…). Everything is read from BeakerSim.state; this
   file never changes the chemistry.
   ============================================================================ */
'use strict';

const BeakerRender = (() => {
  let canvas = null, ctx = null;
  const bubbles = [], flakes = [], steam = [];
  let foam = 0;
  let lastState = null;         // BeakerSim makes a new state object on every reset
  let effect = null;           // { kind, t0, data }
  let frameT = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

  function mount(cv) {
    canvas = cv;
    ctx = cv.getContext('2d');
  }

  /** Beaker geometry in canvas pixels. */
  function geom(W, H) {
    const bw = Math.min(W * 0.42, H * 0.5);
    const bh = bw * 1.25;
    const bx = W / 2 - bw / 2;
    const by = H * 0.14;
    return { bx, by, bw, bh, bottom: by + bh };
  }

  function playEffect(kind, data = {}) { effect = { kind, t0: performance.now(), data }; }

  function draw(dtReal) {
    if (!canvas) return;
    const s = BeakerSim.state;
    if (s !== lastState) { clearParticles(); lastState = s; }
    frameT += dtReal;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const g = geom(W, H);

    // bench
    const bench = H * 0.86;
    c.fillStyle = '#121925';
    c.fillRect(0, bench, W, H - bench);
    c.fillStyle = '#1a2333';
    c.fillRect(0, bench, W, 3);

    drawHeating(c, g, s, bench);

    // liquid
    const fill = Math.min(1, s.V / 0.25);
    const liqTop = g.bottom - g.bh * 0.92 * fill;
    const liq = BeakerSim.liquidColor();
    const precip = BeakerSim.precipitates();
    let turb = 0, turbCol = [1, 1, 1];
    precip.forEach((p) => {
      const susp = p.conc * (1 - p.settled);
      const t = 1 - Math.exp(-susp * 250);
      const pc = hex2rgb(p.color);
      turbCol = turbCol.map((v, i) => v * (1 - t) + pc[i] * t);
      turb = 1 - (1 - turb) * (1 - t);
    });
    const shown = liq.map((v, i) => v * (1 - turb) + turbCol[i] * turb);
    c.save();
    c.beginPath();
    c.rect(g.bx + 3, liqTop, g.bw - 6, g.bottom - liqTop - 3);
    c.clip();
    const grad = c.createLinearGradient(0, liqTop, 0, g.bottom);
    grad.addColorStop(0, rgb(shown, 0.55 + 0.4 * turb));
    grad.addColorStop(1, rgb(shown.map((v) => v * 0.85), 0.7 + 0.3 * turb));
    c.fillStyle = grad;
    c.fillRect(g.bx, liqTop, g.bw, g.bottom - liqTop);
    // surface shimmer
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(g.bx, liqTop, g.bw, 2);

    // settled precipitate layer
    let layer = 0;
    precip.forEach((p) => {
      const h = Math.min(g.bh * 0.2, p.mol * p.settled * 9000);
      if (h < 0.5) return;
      c.fillStyle = p.color;
      c.globalAlpha = 0.92;
      c.beginPath();
      c.ellipse(g.bx + g.bw / 2, g.bottom - 3 - layer - h / 2, g.bw / 2 - 4, h / 2 + 2, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      layer += h * 0.8;
    });
    // drifting flakes of suspended precipitate
    precip.forEach((p) => {
      const want = Math.min(140, Math.round(p.conc * (1 - p.settled) * 6000));
      let have = flakes.filter((f) => f.name === p.name).length;
      while (have < want) { flakes.push({ name: p.name, x: rnd(g.bx + 6, g.bx + g.bw - 6), y: rnd(liqTop, g.bottom - 6), r: rnd(0.8, 2.2), color: p.color }); have++; }
    });
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      const p = precip.find((q) => q.name === f.name);
      if (!p || Math.random() < 0.02 * (p.settled)) { flakes.splice(i, 1); continue; }
      f.y += (s.stir ? rnd(-30, 30) : 6 + p.settled * 10) * dtReal;
      f.x += (s.stir ? Math.sin(frameT * 3 + i) * 40 : rnd(-3, 3)) * dtReal;
      if (f.y > g.bottom - 6 - layer) f.y = s.stir ? rnd(liqTop, g.bottom) : g.bottom - 6 - layer;
      if (f.y < liqTop) f.y = liqTop + 2;
      f.x = Math.max(g.bx + 5, Math.min(g.bx + g.bw - 5, f.x));
      c.fillStyle = f.color;
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
    }

    // crystals of undissolved salts
    BeakerSim.crystals().forEach((cr, k) => drawCrystals(c, g, cr, k, layer));
    // lumps: metals, marble, catalysts
    s.lumps.forEach((l) => drawLump(c, g, s, l, liqTop));

    // bubbles
    spawnBubbles(g, s, liqTop, dtReal);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.v * dtReal; b.x += Math.sin(b.y * 0.08 + i) * 0.3;
      if (b.y < liqTop) { bubbles.splice(i, 1); continue; }
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.stroke();
    }
    c.restore();

    // foam (detergent + gas)
    const targetFoam = s.detergent > 0 ? Math.min(g.bh * 1.2, (s.gasRate.O2 + s.gasRate.H2 + s.gasRate.CO2) * 2.5e5 * Math.min(1, s.detergent / 2)) : 0;
    foam += (targetFoam - foam) * Math.min(1, dtReal * (targetFoam > foam ? 1.5 : 0.15));
    if (foam > 1) drawFoam(c, g, liqTop, foam);

    // headspace gases (chlorine is visible)
    const f = BeakerSim.fractions();
    if (f.Cl2 > 0.001) {
      c.fillStyle = `rgba(190,240,90,${Math.min(0.5, f.Cl2 * 4)})`;
      c.fillRect(g.bx + 3, g.by, g.bw - 6, liqTop - g.by);
    }
    // steam
    if (s.T > 75) {
      if (Math.random() < (s.T - 75) / 25) steam.push({ x: rnd(g.bx + 10, g.bx + g.bw - 10), y: liqTop, a: 0.35, r: rnd(6, 12) });
    }
    for (let i = steam.length - 1; i >= 0; i--) {
      const p = steam[i];
      p.y -= 30 * dtReal; p.r += 6 * dtReal; p.a -= 0.18 * dtReal;
      if (p.a <= 0) { steam.splice(i, 1); continue; }
      c.fillStyle = `rgba(230,235,240,${p.a})`;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
    }

    drawGlass(c, g);
    if (s.stir) drawStirrer(c, g, liqTop);
    drawThermometer(c, g, s, liqTop);
    drawEffect(c, g, liqTop);
  }

  /** Bubbly foam column; above the rim it domes over and spills down the sides. */
  function drawFoam(c, g, liqTop, h) {
    const inside = Math.min(h, liqTop - g.by);
    const over = Math.max(0, h - inside);
    c.fillStyle = 'rgba(248,248,242,0.95)';
    const blob = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    for (let y = liqTop; y > liqTop - inside; y -= 7) {
      for (let x = g.bx + 6; x < g.bx + g.bw - 4; x += 9) blob(x + ((y / 7) % 2) * 4, y + Math.sin(x * 0.7 + frameT * 3) * 1.5, 6);
    }
    if (over > 0) {
      const domeH = Math.min(over, g.bh * 0.4);
      for (let k = 0; k < 40; k++) {
        const a = Math.PI + (k / 39) * Math.PI;
        blob(g.bx + g.bw / 2 + Math.cos(a) * (g.bw / 2 + 4), g.by + Math.sin(a) * domeH, 9);
      }
      c.beginPath(); c.ellipse(g.bx + g.bw / 2, g.by, g.bw / 2 + 4, domeH, 0, Math.PI, 0); c.fill();
      const spill = Math.min(g.bh, over - domeH);
      if (spill > 0) {
        for (let y = g.by; y < g.by + spill; y += 8) { blob(g.bx - 6 + Math.sin(y) * 2, y, 7); blob(g.bx + g.bw + 6 + Math.cos(y) * 2, y, 7); }
      }
    }
    c.fillStyle = 'rgba(200,200,190,0.35)';
    for (let k = 0; k < 30; k++) blob(g.bx + 10 + ((k * 37) % (g.bw - 20)), liqTop - ((k * 53) % Math.max(1, inside)), 2);
  }

  function drawGlass(c, g) {
    c.strokeStyle = 'rgba(210,225,240,0.85)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(g.bx - 8, g.by - 4);
    c.quadraticCurveTo(g.bx - 2, g.by - 2, g.bx, g.by + 6);
    c.lineTo(g.bx, g.bottom - 6);
    c.quadraticCurveTo(g.bx, g.bottom, g.bx + 6, g.bottom);
    c.lineTo(g.bx + g.bw - 6, g.bottom);
    c.quadraticCurveTo(g.bx + g.bw, g.bottom, g.bx + g.bw, g.bottom - 6);
    c.lineTo(g.bx + g.bw, g.by);
    c.stroke();
    // glass highlight
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(g.bx + 10, g.by + 20); c.lineTo(g.bx + 10, g.bottom - 20); c.stroke();
    // graduations (mL)
    c.fillStyle = 'rgba(210,225,240,0.6)';
    c.font = '10px Inter, sans-serif';
    c.textAlign = 'left';
    for (let ml = 50; ml <= 250; ml += 50) {
      const y = g.bottom - g.bh * 0.92 * (ml / 250);
      c.fillRect(g.bx + g.bw - 16, y, 12, 1);
      c.fillText(ml, g.bx + g.bw - 40, y + 3);
    }
  }

  function drawHeating(c, g, s, bench) {
    const cx = g.bx + g.bw / 2;
    // tripod / gauze
    c.strokeStyle = '#4b5565'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(g.bx - 10, g.bottom + 4); c.lineTo(g.bx + g.bw + 10, g.bottom + 4); c.stroke();
    c.beginPath(); c.moveTo(g.bx, g.bottom + 4); c.lineTo(g.bx - 14, bench); c.moveTo(g.bx + g.bw, g.bottom + 4); c.lineTo(g.bx + g.bw + 14, bench); c.stroke();
    if (s.burnerW > 0) {
      c.fillStyle = '#5b6575';
      c.fillRect(cx - 10, bench - 40, 20, 40);
      c.fillRect(cx - 22, bench - 6, 44, 6);
      const gap = Math.max(12, bench - 40 - g.bottom);     // burner top → beaker bottom
      const h = 14 + (s.burnerW / 1000) * gap * 1.1;
      for (let i = 0; i < 2; i++) {
        const hh = Math.max(3, h * (1 - i * 0.35) * (0.92 + 0.08 * Math.sin(frameT * 20 + i)));
        const grad = c.createRadialGradient(cx, bench - 40 - hh * 0.4, 1, cx, bench - 40 - hh * 0.4, hh);
        grad.addColorStop(0, i ? 'rgba(170,220,255,0.95)' : 'rgba(80,130,255,0.85)');
        grad.addColorStop(1, 'rgba(40,80,255,0)');
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(cx - 9 + i * 3, bench - 40);
        c.quadraticCurveTo(cx - 12, bench - 40 - hh * 0.6, cx, bench - 40 - hh);
        c.quadraticCurveTo(cx + 12, bench - 40 - hh * 0.6, cx + 9 - i * 3, bench - 40);
        c.fill();
      }
    }
    if (s.ice) {
      c.fillStyle = 'rgba(140,200,255,0.22)';
      c.fillRect(g.bx - 34, g.bottom - g.bh * 0.35, g.bw + 68, g.bh * 0.35 + 8);
      c.strokeStyle = 'rgba(160,210,255,0.6)'; c.lineWidth = 2;
      c.strokeRect(g.bx - 34, g.bottom - g.bh * 0.35, g.bw + 68, g.bh * 0.35 + 8);
      c.fillStyle = 'rgba(235,245,255,0.85)';
      for (let k = 0; k < 10; k++) {
        const x = k < 5 ? g.bx - 30 + (k % 2) * 12 : g.bx + g.bw + 6 + (k % 2) * 12;
        const y = g.bottom - 14 - (k % 5) * (g.bh * 0.06);
        c.fillRect(x, y, 14, 12);
      }
    }
  }

  function drawCrystals(c, g, cr, k, layer) {
    const count = Math.min(70, Math.ceil(cr.g * 3));
    c.fillStyle = cr.color;
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < count; i++) {
      // deterministic scatter so crystals don't jump around each frame
      const r1 = Math.abs(Math.sin((i + 1) * 12.9898 + k * 78.233)) % 1;
      const r2 = Math.abs(Math.sin((i + 1) * 4.1414 + k * 3.7)) % 1;
      const x = g.bx + 10 + r1 * (g.bw - 20);
      const y = g.bottom - 6 - layer - r2 * Math.min(18, count / 4);
      c.save(); c.translate(x, y); c.rotate(r1 * 3);
      if (cr.habit === 'needles') { c.fillRect(-6, -1, 12, 2); }
      else if (cr.habit === 'pellets' || cr.habit === 'prills') { c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); }
      else if (cr.habit === 'powder') { c.fillRect(-1.5, -1.5, 3, 3); }
      else { c.fillRect(-3, -3, 6, 6); c.strokeRect(-3, -3, 6, 6); }
      c.restore();
    }
  }

  function drawLump(c, g, s, l, liqTop) {
    if (l.n <= 1e-10 && !Object.keys(l.coat).length) return;
    const D = BeakerData;
    const def = l.kind === 'metal' ? D.METALS[l.key] : D.OTHER_LUMPS[l.key];
    const size = Math.max(3, Math.min(28, Math.cbrt(l.n * def.M) * 12));
    const x = g.bx + g.bw * l.x;
    const floats = l.kind === 'metal' && ['Na', 'K', 'Li'].includes(l.key);
    let y = g.bottom - 6 - size / 2;
    let px = x;
    if (floats) { y = liqTop - 1; px = g.bx + g.bw / 2 + Math.sin(frameT * (l.key === 'K' ? 4 : 2.5)) * g.bw * 0.32; }
    const coatMol = Object.values(l.coat).reduce((a, b) => a + b, 0);
    let col = def.color;
    if (coatMol > 2e-5) {
      const cm = Object.entries(l.coat).sort((a, b) => b[1] - a[1])[0][0];
      col = cm === 'Cu' ? '#9a5130' : cm === 'Ag' ? '#e9edf2' : cm === 'Pb' ? '#5b6370' : col;
    }
    c.fillStyle = col;
    if (l.n > 1e-10) {
      if (l.key === 'Mg' || l.key === 'Al') {
        const len = Math.max(14, size * 2.5);
        c.save(); c.translate(px, y); c.rotate(-0.25);
        c.fillRect(-len / 2, -2, len, 4);
        c.restore();
      }
      else if (l.key === 'MnO2' || l.key === 'Yeast') {
        for (let i = 0; i < 24; i++) { const a = i * 2.4; c.fillRect(px + Math.cos(a) * (i % 7) * 3, g.bottom - 6 - (i % 3) * 2, 3, 2); }
      } else if (floats) { c.beginPath(); c.arc(px, y, size / 2, 0, Math.PI * 2); c.fill(); }
      else {
        for (let i = 0; i < Math.min(8, 1 + Math.floor(size / 5)); i++) {
          c.beginPath();
          c.ellipse(px + (i - 3) * size * 0.45, y + (i % 2) * 3, size * 0.35, size * 0.28, i, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // silver "tree" crystals
    if (l.coat.Ag > 1e-5) {
      c.strokeStyle = '#eef2f6'; c.lineWidth = 1.2;
      const n = Math.min(26, Math.round(l.coat.Ag * 6000));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + Math.sin(i * 7.3) * 1.2;
        const len = 6 + (i * 5) % 14;
        c.beginPath(); c.moveTo(px + (i % 5 - 2) * 4, y); c.lineTo(px + (i % 5 - 2) * 4 + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
      }
    }
    // potassium burns with a lilac flame on the water
    if (floats && l.reacting && l.n > 1e-6 && (l.key === 'K' || (l.key === 'Na' && s.gasRate.H2 > 3e-4))) {
      const fc = l.key === 'K' ? 'rgba(200,150,255,0.85)' : 'rgba(255,190,40,0.85)';
      const grad = c.createRadialGradient(px, y - 10, 1, px, y - 10, 22);
      grad.addColorStop(0, fc); grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad; c.beginPath(); c.arc(px, y - 10, 22, 0, Math.PI * 2); c.fill();
    }
    l._px = px; l._py = y;
  }

  function spawnBubbles(g, s, liqTop, dt) {
    const D = BeakerData;
    // from reacting lumps
    s.lumps.forEach((l) => {
      if (l.n <= 1e-10 || l._px === undefined) return;
      const def = l.kind === 'metal' ? D.METALS[l.key] : D.OTHER_LUMPS[l.key];
      let r = 0;
      if (l.kind === 'metal') {
        const H = s.eq.species['H+'] || 0, OH = s.eq.species['OH-'] || 0;
        r = 1e-4 * Math.pow(l.n / 0.004, 2 / 3) * ((def.kAcid || 0) * H + (def.kWater || 0) + (def.kBase || 0) * OH);
        if (l.oxide > 0) r *= 0.02;
      } else if (def.solid) r = s.gasRate.CO2;
      else if (def.catalyst) r = s.gasRate.O2;
      const want = Math.min(60, r * 4e5) * dt;
      for (let k = 0; k < want || Math.random() < want - k; k++) {
        bubbles.push({ x: l._px + rnd(-10, 10), y: l._py, r: rnd(1, 3), v: rnd(40, 80) });
        if (k > 40) break;
      }
    });
    // degassing from the whole liquid (CO₂, Cl₂)
    const bulk = (s.gasRate.CO2 + s.gasRate.Cl2) * 2e5 * dt;
    for (let k = 0; k < bulk && k < 30; k++) bubbles.push({ x: rnd(g.bx + 8, g.bx + g.bw - 8), y: rnd(liqTop + 20, g.bottom - 8), r: rnd(0.8, 2), v: rnd(30, 60) });
    if (bubbles.length > 600) bubbles.splice(0, bubbles.length - 600);
  }

  function drawStirrer(c, g, liqTop) {
    const x = g.bx + g.bw / 2 + Math.sin(frameT * 6) * g.bw * 0.25;
    c.strokeStyle = 'rgba(220,235,245,0.8)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x, g.by - 30); c.lineTo(x + Math.cos(frameT * 6) * 6, g.bottom - 10); c.stroke();
  }

  function drawThermometer(c, g, s, liqTop) {
    const x = g.bx + g.bw * 0.82, top = g.by - 40, bot = g.bottom - 18;
    c.fillStyle = 'rgba(235,240,245,0.15)';
    c.strokeStyle = 'rgba(235,240,245,0.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect ? c.roundRect(x - 4, top, 8, bot - top, 4) : c.rect(x - 4, top, 8, bot - top); c.fill(); c.stroke();
    const frac = Math.max(0, Math.min(1, (s.T + 10) / 120));
    const lvl = bot - (bot - top - 10) * frac;
    c.fillStyle = '#ef4444';
    c.fillRect(x - 1.8, lvl, 3.6, bot - lvl);
    c.beginPath(); c.arc(x, bot, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fca5a5'; c.font = '600 12px Inter, sans-serif'; c.textAlign = 'left';
    c.fillText(`${s.T.toFixed(1)} °C`, x + 10, top + 10);
  }

  function drawEffect(c, g, liqTop) {
    if (!effect) return;
    const t = (performance.now() - effect.t0) / 1000;
    if (t > 2.5) { effect = null; return; }
    const mx = g.bx + g.bw / 2, my = g.by - 6;
    const splint = (lit, glow) => {
      c.strokeStyle = '#b07a3a'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(mx + 90, my - 90); c.lineTo(mx + 6, my + 2); c.stroke();
      if (glow) { c.fillStyle = 'rgba(255,120,40,0.9)'; c.beginPath(); c.arc(mx + 6, my + 2, 4, 0, Math.PI * 2); c.fill(); }
      if (lit) {
        const grad = c.createRadialGradient(mx + 4, my - 6, 1, mx + 4, my - 6, lit);
        grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(1, 'rgba(255,120,0,0)');
        c.fillStyle = grad; c.beginPath(); c.arc(mx + 4, my - 6, lit, 0, Math.PI * 2); c.fill();
      }
    };
    const k = effect.kind;
    if (k === 'pop') {
      splint(t < 0.4 ? 14 : 0);
      if (t > 0.3 && t < 1.0) {
        c.fillStyle = `rgba(190,215,255,${1 - (t - 0.3) / 0.7})`;
        c.beginPath(); c.arc(mx, my, 20 + (t - 0.3) * 160, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.font = '800 26px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('POP!', mx, my - 40);
      }
    } else if (k === 'out') splint(t < 0.5 ? 14 * (1 - t * 2) : 0, false);
    else if (k === 'bright') splint(14 + 10 * Math.sin(t * 20));
    else if (k === 'relight') splint(t > 0.6 ? 16 : 0, t <= 0.6);
    else if (k === 'lit' || k === 'none') splint(effect.data.glowing ? 0 : 14, effect.data.glowing);
    else if (k === 'limewater') {
      const tx = mx + g.bw * 0.8, ty = g.by + 20;
      c.fillStyle = effect.data.milky ? 'rgba(240,240,240,0.9)' : 'rgba(200,225,255,0.4)';
      c.fillRect(tx - 10, ty + 20, 20, 50);
      c.strokeStyle = 'rgba(220,230,240,0.8)'; c.lineWidth = 2; c.strokeRect(tx - 10, ty, 20, 70);
      c.beginPath(); c.moveTo(mx, my); c.quadraticCurveTo(mx + 40, my - 50, tx, ty + 30); c.stroke();
    } else if (k === 'litmus') {
      c.fillStyle = effect.data.color; c.fillRect(mx - 6, my - 70, 12, 60);
    } else if (k === 'flame') {
      const fx = g.bx - 60, fy = g.bottom;
      const grad = c.createRadialGradient(fx, fy - 40, 2, fx, fy - 40, 50);
      grad.addColorStop(0, effect.data.color || 'rgba(120,160,255,0.8)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad; c.beginPath(); c.ellipse(fx, fy - 40, 22, 55, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#cbd5e1'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx + 40, fy - 120); c.lineTo(fx + 2, fy - 50); c.stroke();
    }
  }

  function clearParticles() { bubbles.length = 0; flakes.length = 0; steam.length = 0; foam = 0; }

  return { mount, draw, playEffect, clearParticles };
})();
