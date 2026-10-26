/* ============================================================================
   ChemSim · bulk/particles.js
   ----------------------------------------------------------------------------
   Particle box: molecular dynamics of a few hundred to 1500 particles in 2D.

   Physics (reduced Lennard-Jones units: σ = ε = m = k_B = 1)
     • Lennard-Jones pair potential U = 4ε[(σ/r)¹² − (σ/r)⁶], cut off at 2.5σ
       and shifted. "No attraction" uses only the repulsive part (WCA), which
       behaves like an ideal-ish gas that can never condense.
     • Velocity-Verlet integration (dt = 0.004), cell lists, periodic box.
     • Thermostat: Berendsen (gently scales velocities toward the set T);
       switch it off for constant energy.
     • Measured: T from the kinetic energy (2N − 2 degrees of freedom),
       pressure from the virial  P = ρT + (1/2A) Σ r·F,  potential energy,
       compressibility Z = P / ρT (1 for an ideal gas), speed distribution vs
       the 2D Maxwell–Boltzmann law f(v) = (v/T)·exp(−v²/2T), radial
       distribution function g(r).
   With argon's ε/k = 120 K and σ = 0.34 nm, T* = 1 is about 120 K.
   ============================================================================ */
'use strict';

const ParticleBox = (() => {
  const RC = 2.5, RC2 = RC * RC, DT = 0.004;
  const ESHIFT = 4 * (Math.pow(RC, -12) - Math.pow(RC, -6));
  const WCA = Math.pow(2, 1 / 6);

  let el = null, cv = null, raf = 0, running = true;
  const sim = { N: 0, L: 0, x: null, y: null, vx: null, vy: null, fx: null, fy: null, sp: null, Tset: 1.0, rho: 0.3, attract: true, thermo: true, gravity: 0, vir: 0, pe: 0, t: 0, solute: 0.0, hist: [], gr: null, grSamples: 0 };
  const opts = { N: 600, rho: 0.30, T: 1.0, attract: true, thermo: true, gravity: false, solute: 0, color: 'speed', steps: 6 };

  /* ---------------- set-up ---------------- */
  function init(N = opts.N, rho = opts.rho, T = opts.T) {
    sim.N = N; sim.rho = rho; sim.L = Math.sqrt(N / rho); sim.Tset = T;
    ['x', 'y', 'vx', 'vy', 'fx', 'fy'].forEach((k) => { sim[k] = new Float64Array(N); });
    sim.sp = new Uint8Array(N);
    // start on a square lattice with random velocities
    const n = Math.ceil(Math.sqrt(N)), a = sim.L / n;
    for (let i = 0; i < N; i++) {
      sim.x[i] = (i % n + 0.5) * a; sim.y[i] = (Math.floor(i / n) + 0.5) * a;
      sim.vx[i] = gauss() * Math.sqrt(T); sim.vy[i] = gauss() * Math.sqrt(T);
    }
    setSolute(opts.solute);
    removeDrift(); scaleTo(T);
    sim.t = 0; sim.hist = []; sim.gr = null; sim.grSamples = 0;
    forces();
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function removeDrift() {
    let mx = 0, my = 0;
    for (let i = 0; i < sim.N; i++) { mx += sim.vx[i]; my += sim.vy[i]; }
    mx /= sim.N; my /= sim.N;
    for (let i = 0; i < sim.N; i++) { sim.vx[i] -= mx; sim.vy[i] -= my; }
  }
  const kinetic = () => { let k = 0; for (let i = 0; i < sim.N; i++) k += sim.vx[i] ** 2 + sim.vy[i] ** 2; return 0.5 * k; };
  const temperature = () => (2 * kinetic()) / (2 * sim.N - 2);
  function scaleTo(T) { const t = temperature(); if (t > 0) { const f = Math.sqrt(T / t); for (let i = 0; i < sim.N; i++) { sim.vx[i] *= f; sim.vy[i] *= f; } } }
  function setSolute(frac) {
    opts.solute = frac;
    const k = Math.round(frac * sim.N);
    for (let i = 0; i < sim.N; i++) sim.sp[i] = 0;
    // pick solute particles spread through the box
    for (let j = 0; j < k; j++) sim.sp[Math.floor((j * sim.N) / Math.max(1, k))] = 1;
  }

  /* ---------------- forces (cell list) ---------------- */
  function forces() {
    const { N, L, x, y, fx, fy } = sim;
    fx.fill(0); fy.fill(0);
    const rcut = sim.attract ? RC : WCA, rcut2 = rcut * rcut;
    const shift = sim.attract ? ESHIFT : -1;    // WCA: U + ε, so U(rc) = 0
    const nc = Math.max(1, Math.floor(L / rcut)), cs = L / nc;
    const head = new Int32Array(nc * nc).fill(-1), next = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const cx = Math.min(nc - 1, Math.floor(x[i] / cs)), cy = Math.min(nc - 1, Math.floor(y[i] / cs));
      const c = cy * nc + cx; next[i] = head[c]; head[c] = i;
    }
    let vir = 0, pe = 0;
    const half = L / 2, pbc = !sim.gravity;
    const pair = (i, j) => {
      let rx = x[i] - x[j], ry = y[i] - y[j];
      if (rx > half) rx -= L; else if (rx < -half) rx += L;
      if (pbc) { if (ry > half) ry -= L; else if (ry < -half) ry += L; }
      const r2 = rx * rx + ry * ry;
      if (r2 >= rcut2 || r2 < 1e-12) return;
      const ir2 = 1 / r2, ir6 = ir2 * ir2 * ir2;
      const f = 24 * ir2 * ir6 * (2 * ir6 - 1);     // F/r
      fx[i] += f * rx; fy[i] += f * ry; fx[j] -= f * rx; fy[j] -= f * ry;
      vir += f * r2;
      pe += 4 * ir6 * (ir6 - 1) - shift;
    };
    if (nc < 3) {
      // tiny box: every pair (the 3×3 cell search would visit cells twice)
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pair(i, j);
    } else {
      for (let cy = 0; cy < nc; cy++) for (let cx = 0; cx < nc; cx++) {
        for (let i = head[cy * nc + cx]; i >= 0; i = next[i]) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const yy = cy + dy;
            if (!pbc && (yy < 0 || yy >= nc)) continue;      // walls: no wrap-around in y
            const c2 = ((yy + nc) % nc) * nc + ((cx + dx + nc) % nc);
            for (let j = head[c2]; j >= 0; j = next[j]) if (j > i) pair(i, j);
          }
        }
      }
    }
    if (sim.gravity) for (let i = 0; i < N; i++) { fy[i] -= sim.gravity; pe += sim.gravity * y[i]; }
    sim.vir = vir; sim.pe = pe;
  }

  function step() {
    const { N, L, x, y, vx, vy, fx, fy } = sim;
    const h = DT;
    for (let i = 0; i < N; i++) {
      vx[i] += 0.5 * h * fx[i]; vy[i] += 0.5 * h * fy[i];
      x[i] += h * vx[i]; y[i] += h * vy[i];
      if (sim.gravity) {             // walls at the bottom and top
        if (y[i] < 0.5) { y[i] = 0.5 + (0.5 - y[i]); vy[i] = Math.abs(vy[i]); }
        if (y[i] > L - 0.5) { y[i] = L - 0.5 - (y[i] - (L - 0.5)); vy[i] = -Math.abs(vy[i]); }
      } else { if (y[i] < 0) y[i] += L; else if (y[i] >= L) y[i] -= L; }
      if (x[i] < 0) x[i] += L; else if (x[i] >= L) x[i] -= L;
    }
    forces();
    for (let i = 0; i < N; i++) { vx[i] += 0.5 * h * fx[i]; vy[i] += 0.5 * h * fy[i]; }
    if (sim.thermo) {               // Berendsen thermostat, τ = 0.4
      const t = temperature();
      if (t > 0) { const f = Math.sqrt(1 + (h / 0.4) * (sim.Tset / t - 1)); for (let i = 0; i < N; i++) { vx[i] *= f; vy[i] *= f; } }
    }
    sim.t += h;
  }

  /* ---------------- measurements ---------------- */
  function measure() {
    const T = temperature(), A = sim.L * sim.L, rho = sim.N / A;
    const P = rho * T + sim.vir / (2 * A);
    return { T, P, rho, Z: P / (rho * T), peN: sim.pe / sim.N, eN: (sim.pe + kinetic()) / sim.N, neighbours: meanNeighbours() };
  }
  function meanNeighbours() {
    // average number of particles within 1.5σ (sampled)
    const { N, L, x, y } = sim, half = L / 2;
    let tot = 0, n = 0;
    for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 80))) {
      let k = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        let rx = x[i] - x[j], ry = y[i] - y[j];
        if (!sim.gravity) { if (rx > half) rx -= L; else if (rx < -half) rx += L; if (ry > half) ry -= L; else if (ry < -half) ry += L; }
        if (rx * rx + ry * ry < 2.25) k++;
      }
      tot += k; n++;
    }
    return tot / n;
  }
  function speedHistogram(bins = 30, vmax = null) {
    const T = temperature();
    vmax = vmax || Math.max(3.5 * Math.sqrt(T), 0.5);
    const h = new Array(bins).fill(0), w = vmax / bins;
    for (let i = 0; i < sim.N; i++) { const v = Math.hypot(sim.vx[i], sim.vy[i]); const b = Math.floor(v / w); if (b < bins) h[b]++; }
    const pts = h.map((c, b) => [(b + 0.5) * w, c / (sim.N * w)]);
    const theory = Array.from({ length: 80 }, (_, k) => { const v = (k / 79) * vmax; return [v, (v / T) * Math.exp((-v * v) / (2 * T))]; });
    return { pts, theory };
  }
  function radialDistribution(rmax = 4, bins = 60) {
    const { N, L, x, y } = sim, half = L / 2, dr = rmax / bins;
    const g = new Array(bins).fill(0);
    const samp = Math.min(N, 300);
    for (let s = 0; s < samp; s++) {
      const i = Math.floor((s * N) / samp);
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        let rx = x[i] - x[j], ry = y[i] - y[j];
        if (rx > half) rx -= L; else if (rx < -half) rx += L;
        if (ry > half) ry -= L; else if (ry < -half) ry += L;
        const r = Math.hypot(rx, ry);
        if (r < rmax) g[Math.floor(r / dr)]++;
      }
    }
    const rho = N / (L * L);
    return g.map((c, b) => { const r = (b + 0.5) * dr; return [r, c / (samp * rho * 2 * Math.PI * r * dr)]; });
  }
  function phaseGuess(m) {
    if (!sim.attract) return 'gas-like (no attractions, so it can never condense)';
    // 2D Lennard-Jones: critical point T* ≈ 0.53, triple point T* ≈ 0.41
    if (m.neighbours > 5.2 && m.T < 0.45) return 'solid-like (hexagonal packing)';
    if (m.T > 0.55) return m.neighbours > 3.8 ? 'dense supercritical fluid (above T_c ≈ 0.53, no liquid–gas boundary)' : 'gas (above T_c ≈ 0.53 it cannot condense)';
    if (m.neighbours > 3.8) return 'liquid-like (dense and disordered)';
    if (m.neighbours > 1.6) return 'gas and liquid coexisting (droplets)';
    return 'gas';
  }

  /* ---------------- UI ---------------- */
  function mount(container) {
    el = container;
    el.innerHTML = `
      <div class="bulk-grid">
        <aside class="panel">
          <div class="card"><h2>Particles</h2>
            <label class="ctl full">Number <input type="range" id="pb-N" min="100" max="1500" step="50" value="${opts.N}"/> <span id="pb-Nv" class="mono"></span></label>
            <label class="ctl full">Density ρ* <input type="range" id="pb-rho" min="0.02" max="0.85" step="0.01" value="${opts.rho}"/> <span id="pb-rhov" class="mono"></span></label>
            <label class="ctl full">Temperature T* <input type="range" id="pb-T" min="0.1" max="3" step="0.01" value="${opts.T}"/> <span id="pb-Tv" class="mono"></span></label>
            <label class="chip block"><input type="checkbox" id="pb-att" checked/> Attractions (Lennard-Jones)</label>
            <label class="chip block"><input type="checkbox" id="pb-thermo" checked/> Thermostat (constant T)</label>
            <label class="chip block"><input type="checkbox" id="pb-grav"/> Gravity and walls</label>
            <div class="btn-row"><button class="hbtn small accent" id="pb-run">⏸ Pause</button><button class="hbtn small" id="pb-reset">↺ Restart</button></div>
            <label class="ctl">Colour by <select id="pb-col"><option value="speed">speed</option><option value="species">species</option></select></label></div>
          <div class="card"><h2>Presets</h2><div class="btn-row">
            <button class="hbtn small" data-pre="gas">Dilute gas</button><button class="hbtn small" data-pre="liquid">Liquid</button>
            <button class="hbtn small" data-pre="solid">Crystal</button><button class="hbtn small" data-pre="coex">Condensing</button><button class="hbtn small" data-pre="ideal">Ideal gas</button></div></div>
          <div class="card"><h2>Solution (concentration)</h2>
            <label class="ctl full">Solute fraction <input type="range" id="pb-sol" min="0" max="0.5" step="0.01" value="${opts.solute}"/> <span id="pb-solv" class="mono"></span></label>
            <div class="btn-row"><button class="hbtn small" id="pb-dilute" data-tip="Double the volume with more solvent (same solute particles)">💧 Dilute ×2</button></div>
            <div id="pb-conc" class="small"></div></div>
        </aside>
        <section class="bulk-center"><canvas id="pb-canvas" aria-label="Particle box"></canvas><div class="lab-status" id="pb-status"></div></section>
        <aside class="panel">
          <div class="card big-reads pb-reads"><div class="read"><div class="k">T*</div><div class="v" id="pb-rT"></div></div><div class="read"><div class="k">P*</div><div class="v" id="pb-rP"></div></div><div class="read"><div class="k">Z = P/ρT</div><div class="v" id="pb-rZ"></div></div></div>
          <div class="card small" id="pb-info"></div>
          <div class="card"><h2>Speed distribution</h2><canvas class="plot" id="pb-hist"></canvas><p class="muted-note">Bars: the particles now. Line: Maxwell–Boltzmann for the measured temperature.</p></div>
          <div class="card"><h2>Radial distribution g(r)</h2><canvas class="plot" id="pb-gr"></canvas><p class="muted-note">How likely a neighbour is at distance r. Gas: flat after 1σ. Liquid: a few fading peaks. Crystal: sharp peaks at the lattice distances.</p></div>
        </aside>
      </div>`;
    cv = el.querySelector('#pb-canvas');
    const q = (s) => el.querySelector(s);
    const lab = () => { q('#pb-Nv').textContent = opts.N; q('#pb-rhov').textContent = opts.rho.toFixed(2); q('#pb-Tv').textContent = opts.T.toFixed(2); q('#pb-solv').textContent = `${Math.round(opts.solute * 100)} %`; };
    q('#pb-N').addEventListener('change', (e) => { opts.N = Number(e.target.value); lab(); init(); });
    q('#pb-rho').addEventListener('change', (e) => { opts.rho = Number(e.target.value); lab(); init(); });
    q('#pb-T').addEventListener('input', (e) => { opts.T = Number(e.target.value); sim.Tset = opts.T; lab(); });
    q('#pb-att').addEventListener('change', (e) => { sim.attract = opts.attract = e.target.checked; forces(); });
    q('#pb-thermo').addEventListener('change', (e) => { sim.thermo = opts.thermo = e.target.checked; });
    q('#pb-grav').addEventListener('change', (e) => { sim.gravity = e.target.checked ? 0.15 : 0; opts.gravity = e.target.checked; forces(); });
    q('#pb-run').addEventListener('click', () => { running = !running; q('#pb-run').textContent = running ? '⏸ Pause' : '▶ Run'; });
    q('#pb-reset').addEventListener('click', () => init());
    q('#pb-col').addEventListener('change', (e) => { opts.color = e.target.value; });
    q('#pb-sol').addEventListener('input', (e) => { setSolute(Number(e.target.value)); lab(); if (opts.solute > 0) { opts.color = 'species'; q('#pb-col').value = 'species'; } });
    q('#pb-dilute').addEventListener('click', () => dilute());
    el.querySelectorAll('[data-pre]').forEach((b) => b.addEventListener('click', () => {
      const P = { gas: [400, 0.05, 2.0, true], liquid: [700, 0.7, 0.9, true], solid: [700, 0.82, 0.3, true], coex: [800, 0.3, 0.42, true], ideal: [400, 0.05, 1.5, false] }[b.dataset.pre];
      [opts.N, opts.rho, opts.T, opts.attract] = P;
      q('#pb-N').value = opts.N; q('#pb-rho').value = opts.rho; q('#pb-T').value = opts.T; q('#pb-att').checked = opts.attract; sim.attract = opts.attract;
      lab(); init();
    }));
    sim.attract = opts.attract; sim.thermo = opts.thermo; sim.gravity = opts.gravity ? 0.15 : 0;
    lab(); init();
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); el = null; }

  /** Double the area with extra solvent particles: the solute concentration halves. */
  function dilute() {
    const N0 = sim.N, L0 = sim.L, N1 = Math.min(3000, N0 * 2);
    const L1 = L0 * Math.SQRT2;
    const old = { x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy, sp: sim.sp };
    ['x', 'y', 'vx', 'vy', 'fx', 'fy'].forEach((k) => { sim[k] = new Float64Array(N1); });
    sim.sp = new Uint8Array(N1);
    for (let i = 0; i < N0; i++) { sim.x[i] = old.x[i] * Math.SQRT2; sim.y[i] = old.y[i] * Math.SQRT2; sim.vx[i] = old.vx[i]; sim.vy[i] = old.vy[i]; sim.sp[i] = old.sp[i]; }
    for (let i = N0; i < N1; i++) { const j = i - N0; sim.x[i] = (old.x[j] * Math.SQRT2 + L1 / 2) % L1; sim.y[i] = (old.y[j] * Math.SQRT2 + L1 / 3) % L1; sim.vx[i] = old.vx[j]; sim.vy[i] = -old.vy[j]; sim.sp[i] = 0; }
    sim.N = N1; sim.L = L1;
    opts.N = N1; opts.rho = N1 / (L1 * L1);
    // let the overlapping new particles relax gently
    const tsave = sim.Tset; sim.Tset = Math.min(tsave, 0.8);
    for (let k = 0; k < 40; k++) { forces(); for (let i = 0; i < sim.N; i++) { const f = Math.hypot(sim.fx[i], sim.fy[i]); if (f > 50) { sim.fx[i] *= 50 / f; sim.fy[i] *= 50 / f; } sim.x[i] = (sim.x[i] + 0.0005 * sim.fx[i] + sim.L) % sim.L; sim.y[i] = (sim.y[i] + 0.0005 * sim.fy[i] + sim.L) % sim.L; } }
    sim.Tset = tsave; scaleTo(sim.Tset); forces();
    opts.solute = [...sim.sp].filter(Boolean).length / sim.N;
    el.querySelector('#pb-sol').value = opts.solute;
    el.querySelector('#pb-N').value = Math.min(1500, opts.N);
    toast('Diluted: twice the volume, same solute particles → half the concentration');
  }

  const speedColor = (v, T) => {
    const f = Math.min(1, v / (2.6 * Math.sqrt(T)));
    return `hsl(${220 - 220 * f}, 85%, ${45 + 15 * f}%)`;
  };

  let uiT = 0, grT = 0;
  function loop(now) {
    if (!el) return;
    if (running) for (let k = 0; k < opts.steps; k++) step();
    draw();
    uiT += 1;
    if (uiT % 10 === 0) panel();
    raf = requestAnimationFrame(loop);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0f17'; c.fillRect(0, 0, W, H);
    const S = Math.min(W - 20, H - 20) / sim.L, ox = (W - sim.L * S) / 2, oy = (H - sim.L * S) / 2;
    c.strokeStyle = '#334155'; c.lineWidth = 1.5; c.strokeRect(ox, oy, sim.L * S, sim.L * S);
    const T = temperature(), r = Math.max(1.2, 0.5 * S);
    for (let i = 0; i < sim.N; i++) {
      c.fillStyle = opts.color === 'species' ? (sim.sp[i] ? '#f87171' : '#60a5fa') : speedColor(Math.hypot(sim.vx[i], sim.vy[i]), T);
      c.beginPath(); c.arc(ox + sim.x[i] * S, oy + (sim.L - sim.y[i]) * S, r, 0, Math.PI * 2); c.fill();
    }
    // concentration sample square
    if (opts.solute > 0) {
      const a = sim.L / 4;
      c.strokeStyle = '#fde047'; c.setLineDash([4, 3]); c.strokeRect(ox + a * 1.5 * S, oy + a * 1.5 * S, a * S, a * S); c.setLineDash([]);
    }
  }

  function panel() {
    const m = measure();
    const q = (s) => el.querySelector(s);
    q('#pb-rT').textContent = m.T.toFixed(2); q('#pb-rP').textContent = m.P.toFixed(3); q('#pb-rZ').textContent = m.Z.toFixed(2);
    q('#pb-info').innerHTML = `<div>ρ* = ${m.rho.toFixed(3)} · potential energy ${m.peN.toFixed(2)} ε per particle · total ${m.eN.toFixed(2)} ε</div>
      <div>Neighbours within 1.5σ: ${m.neighbours.toFixed(1)}</div><div>Looks like: <b>${phaseGuess(m)}</b></div>
      <div class="dim">${sim.attract ? `Z < 1: attractions pull particles together and lower the pressure; Z > 1: they are being squeezed against their repulsive cores.` : 'Without attractions Z stays close to 1 at low density (ideal gas: PV = NkT).'} For argon, T* = ${m.T.toFixed(2)} ≈ ${(m.T * 120).toFixed(0)} K.</div>`;
    q('#pb-status').textContent = `${sim.N} particles · t* = ${sim.t.toFixed(1)}`;
    const h = speedHistogram();
    LabPlot.draw(q('#pb-hist'), { x: { label: 'speed v*', min: 0 }, y: { label: 'f(v)', min: 0 }, series: [{ pts: h.pts, color: '#22d3ee', dots: true, r: 3 }, { pts: h.theory, color: '#f472b6', width: 1.8 }] });
    grT++;
    if (grT % 3 === 0) LabPlot.draw(q('#pb-gr'), { x: { label: 'r / σ', min: 0, max: 4 }, y: { label: 'g(r)', min: 0 }, series: [{ pts: radialDistribution(), color: '#a78bfa', width: 1.8 }] });
    if (opts.solute > 0) {
      const a = sim.L / 4;
      let n = 0;
      for (let i = 0; i < sim.N; i++) if (sim.sp[i] && sim.x[i] >= a * 1.5 && sim.x[i] < a * 2.5 && sim.y[i] >= sim.L - a * 2.5 && sim.y[i] < sim.L - a * 1.5) n++;
      const nTot = [...sim.sp].filter(Boolean).length;
      const cBox = nTot / (sim.L * sim.L), cSq = n / (a * a);
      q('#pb-conc').innerHTML = `<div>Whole box: <b>${nTot}</b> solute in ${(sim.L * sim.L).toFixed(0)} σ² → <b>${(cBox * 100).toFixed(2)}</b> per 100 σ²</div>
        <div>Yellow square: <b>${n}</b> solute → ${(cSq * 100).toFixed(2)} per 100 σ² (it fluctuates: about ±${Math.sqrt(Math.max(n, 1)).toFixed(0)} particles)</div>
        <div class="dim">Concentration = amount of solute ÷ volume. Molarity counts moles (6.02×10²³ particles) per litre; diluting to twice the volume halves it.</div>`;
    } else q('#pb-conc').innerHTML = '<span class="dim">Add some solute (red particles) to explore concentration.</span>';
  }

  BulkHub.add({ id: 'particles', icon: '🔵', title: 'Particle box', mount, unmount });
  return { sim, opts, init, step, measure, temperature, speedHistogram, radialDistribution, forces };
})();
