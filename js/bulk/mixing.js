/* ============================================================================
   ChemSim · bulk/mixing.js
   ----------------------------------------------------------------------------
   Diffusion and mixing.

   Dye diffusion   Thousands of dye molecules do Brownian random walks:
                   each step Δx = √(2DΔt)·(random normal number).
                   D follows Stokes–Einstein, D ∝ T/η, with water's real
                   viscosity η(T) = 2.414×10⁻⁵ Pa·s · 10^(247.8 K/(T − 140 K)).
                   The spread is compared with theory: ⟨x²⟩ = 2Dt in each
                   direction, and a Gaussian concentration profile. Stirring
                   adds a flow, which mixes far faster than diffusion alone.

   Two liquids     A lattice model of a "regular solution" (Monte Carlo with
                   neighbour swaps, so the amounts stay fixed). Unlike
                   neighbours cost energy χ·kT/z, where χ is the interaction
                   parameter: χ < 2 → the liquids mix at any ratio (like
                   ethanol + water); χ > 2 → they separate (like hexane +
                   water). Gravity makes the less dense liquid float.
                   Free energy of mixing: ΔG/RT = x ln x + (1−x) ln(1−x) + χx(1−x).
   ============================================================================ */
'use strict';

const Mixing = (() => {
  let el = null, cv = null, raf = 0, mode = 'dye', running = true;
  const kB = 1.380649e-23;

  /* ---------------- dye diffusion ---------------- */
  const dye = { n: 3000, x: null, y: null, x0: null, y0: null, t: 0, T: 298, r: 0.5e-9, box: 2e-3, speed: 200, stir: false, start: 'line' };
  const etaWater = (T) => 2.414e-5 * Math.pow(10, 247.8 / (T - 140));
  /** Stokes–Einstein diffusion coefficient (m²/s) for a molecule of radius r. */
  const diffusionCoefficient = (T, r = dye.r) => (kB * T) / (6 * Math.PI * etaWater(T) * r);

  function dyeInit() {
    dye.x = new Float64Array(dye.n); dye.y = new Float64Array(dye.n); dye.x0 = new Float64Array(dye.n); dye.y0 = new Float64Array(dye.n);
    for (let i = 0; i < dye.n; i++) {
      dye.x[i] = dye.start === 'drop' ? dye.box / 2 + gauss() * dye.box * 0.01 : dye.box / 2 + (Math.random() - 0.5) * dye.box * 0.01;
      dye.y[i] = dye.start === 'drop' ? dye.box / 2 + gauss() * dye.box * 0.01 : Math.random() * dye.box;
      dye.x0[i] = dye.x[i]; dye.y0[i] = dye.y[i];
    }
    dye.t = 0; dye.msd = [];
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /** Advance the dye by time dt (s). Particles are not reflected, so the MSD stays ideal; they are drawn wrapped. */
  function dyeStep(dt) {
    const D = diffusionCoefficient(dye.T), s = Math.sqrt(2 * D * dt);
    const L = dye.box;
    for (let i = 0; i < dye.n; i++) {
      let ux = 0, uy = 0;
      if (dye.stir) {           // a pair of counter-rotating eddies, ~0.2 mm/s
        const X = ((dye.x[i] % L) + L) % L / L, Y = ((dye.y[i] % L) + L) % L / L;
        ux = 2e-4 * Math.sin(Math.PI * 2 * X) * Math.cos(Math.PI * Y);
        uy = -2e-4 * Math.cos(Math.PI * 2 * X) * Math.sin(Math.PI * Y) * 2;
      }
      dye.x[i] += s * gauss() + ux * dt; dye.y[i] += s * gauss() + uy * dt;
    }
    dye.t += dt;
  }
  function msd() {
    let sx = 0, sy = 0;
    for (let i = 0; i < dye.n; i++) { sx += (dye.x[i] - dye.x0[i]) ** 2; sy += (dye.y[i] - dye.y0[i]) ** 2; }
    return { x: sx / dye.n, y: sy / dye.n };
  }

  /* ---------------- two liquids on a lattice ---------------- */
  const lat = { W: 120, H: 76, speed: 8, s: null, chi: 0.5, grav: 0.0, xA: 0.5, start: 'layers', A: 'ethanol', B: 'water', colA: [250, 204, 21], colB: [59, 130, 246], sweeps: 0 };
  const PAIRS = {
    ethanolwater: { name: 'Ethanol + water', A: 'ethanol', B: 'water', chi: 0.4, grav: 0.02, colA: [250, 204, 21], note: 'Both form hydrogen bonds with each other, so they mix in any ratio (miscible). Mixing actually releases a little heat and the volume shrinks.' },
    hexanewater: { name: 'Hexane (oil) + water', A: 'hexane', B: 'water', chi: 5, grav: 0.15, colA: [251, 146, 60], note: 'Water molecules prefer each other (hydrogen bonds) to non-polar hexane, so the two separate; hexane is less dense (0.66 g/mL) and floats on top.' },
    butanolwater: { name: '1-Butanol + water', A: '1-butanol', B: 'water', chi: 2.4, grav: 0.08, colA: [190, 242, 100], note: 'Partly miscible: χ is a little above 2, so the liquids form two layers, each containing some of the other (about 8 % butanol dissolves in water).' },
    dyewater: { name: 'Food dye + water', A: 'dye', B: 'water', chi: 0, grav: 0, colA: [236, 72, 153], xA: 0.15, note: 'No energy penalty at all (χ = 0): the dye spreads out by diffusion until it is evenly mixed, driven purely by entropy.' },
  };

  function latInit() {
    const n = lat.W * lat.H;
    lat.s = new Uint8Array(n);
    const nA = Math.round(lat.xA * n);
    if (lat.start === 'layers') {
      // A on top (rows from the top), B below
      for (let k = 0; k < n; k++) lat.s[k] = k < nA ? 1 : 0;
    } else {
      const idx = Array.from({ length: n }, (_, k) => k);
      for (let k = n - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]]; }
      for (let k = 0; k < nA; k++) lat.s[idx[k]] = 1;
    }
    lat.sweeps = 0;
  }
  const at = (x, y) => lat.s[((y + lat.H) % lat.H) * lat.W + ((x + lat.W) % lat.W)];
  /** Unlike neighbours of site (x, y) if it held species v (4 nearest + 4 diagonal neighbours). */
  function unlike(x, y, v, skipX, skipY) {
    let u = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const X = x + dx, Y = y + dy;
      if (Y < 0 || Y >= lat.H) continue;               // walls at top and bottom
      if (X === skipX && Y === skipY) continue;
      if (at(X, Y) !== v) u++;
    }
    return u;
  }
  /** Monte Carlo: try swapping random neighbouring A/B pairs (Kawasaki dynamics). */
  function latSweep(attempts) {
    const W = lat.W, H = lat.H, z = 8;
    let acc = 0;
    for (let k = 0; k < attempts; k++) {
      const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
      // swap partner up to 3 cells away: still conserves the amounts, but moves
      // liquid around faster than single-cell hops (so layers form in seconds)
      let ddx = 0, ddy = 0;
      while (!ddx && !ddy) { ddx = Math.floor(Math.random() * 7) - 3; ddy = Math.floor(Math.random() * 7) - 3; }
      const x2 = x + ddx, y2 = y + ddy;
      if (y2 < 0 || y2 >= H) continue;
      const X2 = (x2 + W) % W;
      const a = lat.s[y * W + x], b = lat.s[y2 * W + X2];
      if (a === b) continue;
      const before = unlike(x, y, a, X2, y2) + unlike(X2, y2, b, x, y);
      const after = unlike(x, y, b, X2, y2) + unlike(X2, y2, a, x, y);
      let dE = (lat.chi / z) * (after - before);
      // gravity: species A (1) lighter → prefers small y (top)
      dE += lat.grav * (a === 1 ? y2 - y : y - y2);
      if (dE <= 0 || Math.random() < Math.exp(-dE)) { lat.s[y * W + x] = b; lat.s[y2 * W + X2] = a; acc++; }
    }
    lat.sweeps += attempts / (W * H);
    return acc;
  }
  /** How mixed is it? 1 = random mixture, 0 = completely separated. */
  function mixedness() {
    let u = 0, tot = 0;
    for (let y = 0; y < lat.H - 1; y++) for (let x = 0; x < lat.W; x++) {
      const v = lat.s[y * lat.W + x];
      if (at(x + 1, y) !== v) u++; if (at(x, y + 1) !== v) u++; tot += 2;
    }
    const xA = lat.s.reduce((a, b) => a + b, 0) / lat.s.length;
    return (u / tot) / (2 * xA * (1 - xA));
  }
  const dGmix = (x, chi) => (x <= 0 || x >= 1 ? 0 : x * Math.log(x) + (1 - x) * Math.log(1 - x) + chi * x * (1 - x));

  /* ---------------- UI ---------------- */
  function mount(container) {
    el = container;
    el.innerHTML = `
      <div class="bulk-grid">
        <aside class="panel">
          <div class="seg"><button class="seg-b${mode === 'dye' ? ' active' : ''}" data-mx="dye">💧 Dye diffusion</button><button class="seg-b${mode === 'liq' ? ' active' : ''}" data-mx="liq">🫗 Two liquids</button></div>
          <div id="mx-ctl"></div>
        </aside>
        <section class="bulk-center"><canvas id="mx-canvas" aria-label="Mixing simulation"></canvas><div class="lab-status" id="mx-status"></div></section>
        <aside class="panel" id="mx-right"></aside>
      </div>`;
    cv = el.querySelector('#mx-canvas');
    el.querySelectorAll('[data-mx]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mx; el.querySelectorAll('[data-mx]').forEach((x) => x.classList.toggle('active', x === b)); controls(); }));
    controls();
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); el = null; }

  function controls() {
    const box = el.querySelector('#mx-ctl'), right = el.querySelector('#mx-right');
    if (mode === 'dye') {
      box.innerHTML = `<div class="card"><h2>Dye in still water</h2>
        <label class="ctl full">Temperature <input type="range" id="dy-T" min="275" max="363" step="1" value="${dye.T}"/> <span id="dy-Tv" class="mono"></span></label>
        <label class="ctl full">Molecule radius <input type="range" id="dy-r" min="0.2" max="5" step="0.1" value="${dye.r * 1e9}"/> <span id="dy-rv" class="mono"></span></label>
        <label class="ctl full">Time speed <select id="dy-sp"><option value="20">20×</option><option value="200" selected>200×</option><option value="2000">2000×</option></select></label>
        <label class="chip block"><input type="checkbox" id="dy-stir"/> Stir (adds a flow)</label>
        <div class="btn-row"><button class="hbtn small" data-st="line">Start: a thin line</button><button class="hbtn small" data-st="drop">Start: a drop</button></div></div>
        <div class="card small" id="dy-D"></div>`;
      right.innerHTML = `<div class="card"><h2>Mean-square displacement</h2><canvas class="plot" id="dy-msd"></canvas><div class="small" id="dy-fit"></div></div>
        <div class="card"><h2>Concentration across the box</h2><canvas class="plot" id="dy-prof"></canvas><p class="muted-note">Dots: dye now. Line: the theory for diffusion from a line, c ∝ exp(−x²/4Dt).</p></div>`;
      const upd = () => { el.querySelector('#dy-Tv').textContent = `${dye.T} K (${dye.T - 273} °C)`; el.querySelector('#dy-rv').textContent = `${(dye.r * 1e9).toFixed(1)} nm`; };
      el.querySelector('#dy-T').addEventListener('input', (e) => { dye.T = Number(e.target.value); upd(); });
      el.querySelector('#dy-r').addEventListener('input', (e) => { dye.r = Number(e.target.value) * 1e-9; upd(); });
      el.querySelector('#dy-sp').addEventListener('change', (e) => { dye.speed = Number(e.target.value); });
      el.querySelector('#dy-stir').addEventListener('change', (e) => { dye.stir = e.target.checked; });
      el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { dye.start = b.dataset.st; dyeInit(); }));
      upd(); dyeInit();
    } else {
      box.innerHTML = `<div class="card"><h2>Liquid pair</h2><select id="lq-pair">${Object.entries(PAIRS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')}</select><p class="small dim" id="lq-note"></p></div>
        <div class="card"><h2>Settings</h2>
          <label class="ctl full">Interaction χ <input type="range" id="lq-chi" min="0" max="6" step="0.05"/> <span id="lq-chiv" class="mono"></span></label>
          <label class="ctl full">Gravity <input type="range" id="lq-g" min="0" max="0.3" step="0.005"/> <span id="lq-gv" class="mono"></span></label>
          <label class="ctl full">Fraction of A <input type="range" id="lq-x" min="0.05" max="0.95" step="0.05"/> <span id="lq-xv" class="mono"></span></label>
          <label class="ctl">Speed <select id="lq-speed"><option value="2">slow</option><option value="8" selected>normal</option><option value="30">fast</option></select></label>
          <div class="btn-row"><button class="hbtn small accent" id="lq-layers">Pour in layers</button><button class="hbtn small" id="lq-shake">🫨 Shake</button><button class="hbtn small" id="lq-run">⏸ Pause</button></div></div>`;
      right.innerHTML = `<div class="card big-meter"><div class="k">Mixedness (1 = fully mixed, 0 = separated)</div><div class="v" id="lq-mix">—</div></div>
        <div class="card"><h2>Free energy of mixing</h2><canvas class="plot" id="lq-dg"></canvas><p class="muted-note" id="lq-dgnote"></p></div>`;
      const pairSel = el.querySelector('#lq-pair');
      const apply = (k) => {
        const p = PAIRS[k];
        Object.assign(lat, { chi: p.chi, grav: p.grav, A: p.A, B: p.B, colA: p.colA, xA: p.xA || 0.5 });
        el.querySelector('#lq-note').textContent = p.note;
        el.querySelector('#lq-chi').value = lat.chi; el.querySelector('#lq-g').value = lat.grav; el.querySelector('#lq-x').value = lat.xA;
        lab(); latInit();
      };
      const lab = () => {
        el.querySelector('#lq-chiv').textContent = lat.chi.toFixed(2); el.querySelector('#lq-gv').textContent = lat.grav.toFixed(3); el.querySelector('#lq-xv').textContent = `${Math.round(lat.xA * 100)} %`;
        drawDG();
      };
      pairSel.addEventListener('change', (e) => apply(e.target.value));
      el.querySelector('#lq-chi').addEventListener('input', (e) => { lat.chi = Number(e.target.value); lab(); });
      el.querySelector('#lq-g').addEventListener('input', (e) => { lat.grav = Number(e.target.value); lab(); });
      el.querySelector('#lq-x').addEventListener('change', (e) => { lat.xA = Number(e.target.value); lab(); latInit(); });
      el.querySelector('#lq-layers').addEventListener('click', () => { lat.start = 'layers'; latInit(); });
      el.querySelector('#lq-shake').addEventListener('click', () => { lat.start = 'shake'; latInit(); });
      el.querySelector('#lq-speed').addEventListener('change', (e) => { lat.speed = Number(e.target.value); });
      el.querySelector('#lq-run').addEventListener('click', (e) => { running = !running; e.target.textContent = running ? '⏸ Pause' : '▶ Run'; });
      apply(pairSel.value);
    }
  }

  function drawDG() {
    const pts = Array.from({ length: 101 }, (_, k) => [k / 100, dGmix(k / 100, lat.chi)]);
    LabPlot.draw(el.querySelector('#lq-dg'), { x: { label: 'mole fraction of A', min: 0, max: 1 }, y: { label: 'ΔG_mix / RT' }, series: [{ pts, color: '#22d3ee', width: 2 }], hlines: [{ y: 0, color: '#475569' }], vlines: [{ x: lat.xA, color: '#f472b6' }] });
    el.querySelector('#lq-dgnote').textContent = lat.chi < 2 ? `χ = ${lat.chi.toFixed(2)} < 2: the curve has a single minimum, so mixing lowers G at every composition. The liquids are miscible.` : `χ = ${lat.chi.toFixed(2)} > 2: the curve has two minima with a hump between them, so a 50 : 50 mixture lowers G by splitting into two layers of different composition.`;
  }

  let frame = 0;
  function loop() {
    if (!el) return;
    frame++;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (W && H) {
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#0b0f17'; c.fillRect(0, 0, W, H);
      if (mode === 'dye') runDye(c, W, H); else runLiq(c, W, H);
    }
    raf = requestAnimationFrame(loop);
  }

  function runDye(c, W, H) {
    if (running) for (let k = 0; k < 4; k++) dyeStep((dye.speed / 60) / 4);
    const S = Math.min(W - 30, H - 30) / dye.box, ox = (W - dye.box * S) / 2, oy = (H - dye.box * S) / 2;
    c.fillStyle = '#0e2a47'; c.fillRect(ox, oy, dye.box * S, dye.box * S);
    c.fillStyle = 'rgba(244,114,182,0.55)';
    const L = dye.box;
    for (let i = 0; i < dye.n; i++) {
      const x = ((dye.x[i] % L) + L) % L, y = ((dye.y[i] % L) + L) % L;
      c.fillRect(ox + x * S, oy + y * S, 2, 2);
    }
    c.fillStyle = '#9aa7b8'; c.font = '11px Inter, sans-serif'; c.textAlign = 'left';
    c.fillText(`${(dye.box * 1000).toFixed(0)} mm × ${(dye.box * 1000).toFixed(0)} mm of water`, ox, oy - 6);
    if (frame % 8) return;
    const D = diffusionCoefficient(dye.T);
    el.querySelector('#mx-status').textContent = `t = ${dye.t < 120 ? dye.t.toFixed(0) + ' s' : (dye.t / 60).toFixed(1) + ' min'} (×${dye.speed})${dye.stir ? ' · stirring' : ''}`;
    el.querySelector('#dy-D').innerHTML = `<div>Viscosity of water: <b>${(etaWater(dye.T) * 1000).toFixed(3)} mPa·s</b></div><div>Diffusion coefficient: <b>${(D * 1e10).toFixed(2)} × 10⁻¹⁰ m²/s</b></div>
      <div class="dim">Stokes–Einstein: D = kT / (6πηr). Warmer water is less viscous, so the dye spreads faster; bigger molecules spread more slowly. Typical spreading distance √(2Dt): ${(Math.sqrt(2 * D * 60) * 1e6).toFixed(0)} µm in a minute, ${(Math.sqrt(2 * D * 3600) * 1e3).toFixed(2)} mm in an hour.</div>`;
    const m = msd();
    dye.msd.push([dye.t, m.x * 1e12]);
    if (dye.msd.length > 400) dye.msd = dye.msd.filter((_, i) => i % 2 === 0);
    const fit = LabPlot.linfit(dye.msd.map(([t, v]) => [t, v]));
    LabPlot.draw(el.querySelector('#dy-msd'), { x: { label: 't / s', min: 0 }, y: { label: '⟨Δx²⟩ / µm²', min: 0 }, series: [{ pts: dye.msd, color: '#22d3ee', dots: true, r: 2 }, { pts: [[0, 0], [dye.t, 2 * D * dye.t * 1e12]], color: '#f472b6', width: 1.5, dash: [5, 4] }] });
    el.querySelector('#dy-fit').innerHTML = fit && !dye.stir ? `Slope of the data: ${(fit.m).toFixed(3)} µm²/s → D = slope/2 = <b>${(fit.m / 2 / 1e2).toFixed(2)} × 10⁻¹⁰ m²/s</b> (theory ${(D * 1e10).toFixed(2)}). Pink line: ⟨Δx²⟩ = 2Dt.` : dye.stir ? 'With stirring the spread grows far faster than ⟨Δx²⟩ = 2Dt: stirring moves dye with the flow (convection).' : '';
    if (dye.start === 'line') {
      const bins = 40, w = dye.box / bins, h = new Array(bins).fill(0);
      for (let i = 0; i < dye.n; i++) { const x = dye.x[i]; const b = Math.floor(x / w); if (b >= 0 && b < bins) h[b]++; }
      const pts = h.map((n, b) => [((b + 0.5) * w - dye.box / 2) * 1e3, n / (dye.n * w * 1e3)]);
      const sig2 = 2 * D * dye.t + (dye.box * 0.01) ** 2 / 12;
      const th = Array.from({ length: 101 }, (_, k) => { const x = (k / 100 - 0.5) * dye.box; return [x * 1e3, Math.exp((-x * x) / (2 * sig2)) / Math.sqrt(2 * Math.PI * sig2) / 1e3]; });
      LabPlot.draw(el.querySelector('#dy-prof'), { x: { label: 'distance from the start line / mm', min: -dye.box * 500, max: dye.box * 500 }, y: { label: 'concentration', min: 0 }, series: [{ pts, color: '#f472b6', dots: true, r: 3 }, { pts: th, color: '#22d3ee', width: 1.6 }] });
    }
  }

  function runLiq(c, W, H) {
    if (running) latSweep(lat.W * lat.H * (lat.speed || 8));   // Monte Carlo sweeps per frame
    const S = Math.min((W - 20) / lat.W, (H - 20) / lat.H), ox = (W - lat.W * S) / 2, oy = (H - lat.H * S) / 2;
    const img = c.createImageData(lat.W, lat.H);
    for (let k = 0; k < lat.s.length; k++) {
      const col = lat.s[k] ? lat.colA : lat.colB;
      img.data[4 * k] = col[0]; img.data[4 * k + 1] = col[1]; img.data[4 * k + 2] = col[2]; img.data[4 * k + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = lat.W; off.height = lat.H;
    off.getContext('2d').putImageData(img, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(off, ox, oy, lat.W * S, lat.H * S);
    c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.strokeRect(ox, oy, lat.W * S, lat.H * S);
    c.fillStyle = '#e6edf3'; c.font = '12px Inter, sans-serif'; c.textAlign = 'left';
    c.fillText(`■ ${lat.A}`, ox, oy - 6); c.fillStyle = `rgb(${lat.colA})`; c.fillText('■', ox, oy - 6);
    if (frame % 10) return;
    el.querySelector('#lq-mix').textContent = mixedness().toFixed(2);
    el.querySelector('#mx-status').textContent = `${lat.sweeps.toFixed(0)} Monte Carlo sweeps · yellow/orange = ${lat.A}, blue = ${lat.B}`;
  }

  BulkHub.add({ id: 'mixing', icon: '🫗', title: 'Diffusion & mixing', mount, unmount });
  return { diffusionCoefficient, etaWater, dye, dyeInit, dyeStep, msd, lat, latInit, latSweep, mixedness, dGmix, PAIRS };
})();
