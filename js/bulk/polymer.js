/* ============================================================================
   ChemSim · bulk/polymer.js
   ----------------------------------------------------------------------------
   Polymer builder.

   Chemistry   Choose a monomer (addition: ethene, propene, chloroethene,
               styrene, PTFE, PMMA, acrylonitrile; condensation: nylon-6,6,
               PET, poly(lactic acid), nylon-6) and see the repeat unit, the
               by-product, molar mass for a degree of polymerisation, Tg, Tm
               and uses. Copolymers: alternating, random or block sequences.

   Physics     A coarse-grained bead-spring chain in 2D (Langevin dynamics,
               k_BT = 1): harmonic bonds (length b = 1), a bending energy
               κ(1 − cos θ) for stiffness, and Lennard-Jones interactions
               between non-neighbouring beads whose attraction ε sets the
               solvent quality (ε ≈ 0: good solvent, the coil swells;
               ε ≈ 1: poor solvent, it collapses into a globule). A "phantom"
               chain has no bead–bead interactions at all.
               Measured: radius of gyration R_g and end-to-end distance R_ee.
               Theory for a phantom chain (freely rotating, c = ⟨cos θ⟩ =
               I₁(κ)/I₀(κ)):  ⟨R²⟩ = n b² (1+c)/(1−c) − 2 b² c (1−cⁿ)/(1−c)²
               with n = N − 1 bonds; scaling R_g ∝ N^ν (2D: ν = ½ ideal,
               ¾ good solvent, ½ collapsed).
   ============================================================================ */
'use strict';

const Polymer = (() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const POLY = {
    pe: { name: 'Poly(ethene), PE', type: 'addition', monomer: 'C=C', mname: 'ethene', repeat: '*CC*', M: 28.05, Tg: -125, Tm: 135, uses: 'plastic bags (LDPE), bottles and pipes (HDPE)', stiff: 0.5, note: 'Branched chains (LDPE) pack loosely and are soft; linear chains (HDPE) pack into crystals and are stiffer.' },
    pp: { name: 'Poly(propene), PP', type: 'addition', monomer: 'C=CC', mname: 'propene', repeat: '*CC(C)*', M: 42.08, Tg: -10, Tm: 165, uses: 'food containers, ropes, carpets', stiff: 1.0, note: 'Ziegler–Natta catalysts line all the CH₃ groups up on one side (isotactic), which lets PP crystallise.' },
    pvc: { name: 'Poly(chloroethene), PVC', type: 'addition', monomer: 'C=CCl', mname: 'chloroethene', repeat: '*CC(Cl)*', M: 62.50, Tg: 81, Tm: null, uses: 'window frames, pipes; with plasticisers: cable insulation', stiff: 1.4, note: 'Polar C–Cl bonds attract neighbouring chains, making rigid PVC hard; plasticisers push chains apart to make it flexible.' },
    ps: { name: 'Poly(phenylethene), PS', type: 'addition', monomer: 'C=Cc1ccccc1', mname: 'styrene', repeat: '*CC(c1ccccc1)*', M: 104.15, Tg: 100, Tm: null, uses: 'disposable cups, packaging foam (expanded PS)', stiff: 2.0, note: 'Bulky benzene rings stiffen the chain: PS is glassy and brittle at room temperature (Tg = 100 °C).' },
    ptfe: { name: 'Poly(tetrafluoroethene), PTFE (Teflon)', type: 'addition', monomer: 'C(F)(F)=C(F)F', mname: 'tetrafluoroethene', repeat: '*C(F)(F)C(F)(F)*', M: 100.02, Tg: 115, Tm: 327, uses: 'non-stick coatings, seals, lab equipment', stiff: 3.0, note: 'The F atoms crowd each other, twisting the chain into a stiff helix sheathed in fluorine: very unreactive and slippery.' },
    pmma: { name: 'Poly(methyl methacrylate), PMMA (Perspex)', type: 'addition', monomer: 'C=C(C)C(=O)OC', mname: 'methyl methacrylate', repeat: '*CC(C)(C(=O)OC)*', M: 100.12, Tg: 105, Tm: null, uses: 'clear sheets, lenses, aquarium windows', stiff: 2.2, note: 'Amorphous and glassy, so it is transparent.' },
    pan: { name: 'Poly(propenenitrile), PAN', type: 'addition', monomer: 'C=CC#N', mname: 'acrylonitrile', repeat: '*CC(C#N)*', M: 53.06, Tg: 95, Tm: 317, uses: 'acrylic fibres; precursor of carbon fibre', stiff: 1.8, note: 'Strong dipole–dipole attractions between C≡N groups.' },
    nylon66: { name: 'Nylon-6,6', type: 'condensation', monomer: 'NCCCCCCN.OC(=O)CCCCC(=O)O', mname: 'hexane-1,6-diamine + hexanedioic acid', repeat: '*NCCCCCCNC(=O)CCCCC(=O)*', M: 226.32, byproduct: 'H₂O (2 per repeat unit)', Tg: 50, Tm: 265, uses: 'fibres, ropes, gears', stiff: 1.2, note: 'Amide links hydrogen-bond chain to chain, which makes nylon strong; the same link as in proteins.' },
    pet: { name: 'Poly(ethylene terephthalate), PET', type: 'condensation', monomer: 'OCCO.OC(=O)c1ccc(cc1)C(=O)O', mname: 'ethane-1,2-diol + benzene-1,4-dicarboxylic acid', repeat: '*OCCOC(=O)c1ccc(cc1)C(=O)*', M: 192.17, byproduct: 'H₂O (2 per repeat unit)', Tg: 70, Tm: 260, uses: 'drinks bottles, polyester fibres', stiff: 2.5, note: 'A polyester: rigid benzene rings in the backbone give strength.' },
    pla: { name: 'Poly(lactic acid), PLA', type: 'condensation', monomer: 'CC(O)C(=O)O', mname: 'lactic acid (2-hydroxypropanoic acid)', repeat: '*OC(C)C(=O)*', M: 72.06, byproduct: 'H₂O', Tg: 60, Tm: 175, uses: '3D-printing filament, compostable cups', stiff: 1.5, note: 'Made from plant sugars and biodegradable in industrial composting.' },
    nylon6: { name: 'Nylon-6', type: 'ring-opening', monomer: 'O=C1CCCCCN1', mname: 'caprolactam', repeat: '*NCCCCCC(=O)*', M: 113.16, byproduct: 'none (ring-opening)', Tg: 47, Tm: 220, uses: 'fibres, tights, toothbrush bristles', stiff: 1.2, note: 'Ring-opening polymerisation: no small molecule is lost.' },
  };

  /* ---------------- bead-spring chain ---------------- */
  const ch = { N: 40, kappa: 0.5, eps: 0.1, phantom: false, x: null, y: null, vx: null, vy: null, fx: null, fy: null, t: 0, rg: [], ree: [], runs: [] };
  const KB = 200, DT = 0.004, GAMMA = 1.0, KT = 1.0;
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function chainInit(N = ch.N) {
    ch.N = N;
    ['x', 'y', 'vx', 'vy', 'fx', 'fy'].forEach((k) => { ch[k] = new Float64Array(N); });
    // self-avoiding-ish start: a gentle random walk
    let ang = 0;
    for (let i = 1; i < N; i++) { ang += (Math.random() - 0.5) * 1.2; ch.x[i] = ch.x[i - 1] + Math.cos(ang); ch.y[i] = ch.y[i - 1] + Math.sin(ang); }
    ch.t = 0; ch.rg = []; ch.ree = [];
    chainForces();
  }
  function chainForces() {
    const { N, x, y, fx, fy } = ch;
    fx.fill(0); fy.fill(0);
    for (let i = 0; i < N - 1; i++) {        // bonds
      const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], r = Math.hypot(dx, dy) || 1e-9;
      const f = -KB * (r - 1) / r;
      fx[i + 1] += f * dx; fy[i + 1] += f * dy; fx[i] -= f * dx; fy[i] -= f * dy;
    }
    if (ch.kappa > 0) for (let i = 1; i < N - 1; i++) {   // bending: E = κ(1 − cos θ), θ between successive bonds
      const ax = x[i] - x[i - 1], ay = y[i] - y[i - 1], bx = x[i + 1] - x[i], by = y[i + 1] - y[i];
      const la = Math.hypot(ax, ay) || 1e-9, lb = Math.hypot(bx, by) || 1e-9;
      const c = (ax * bx + ay * by) / (la * lb);
      // dE/da = −κ (b/(la lb) − c a/la²),  dE/db = −κ (a/(la lb) − c b/lb²)
      const ga = [-ch.kappa * (bx / (la * lb) - (c * ax) / (la * la)), -ch.kappa * (by / (la * lb) - (c * ay) / (la * la))];
      const gb = [-ch.kappa * (ax / (la * lb) - (c * bx) / (lb * lb)), -ch.kappa * (ay / (la * lb) - (c * by) / (lb * lb))];
      // a = x_i − x_{i−1}, b = x_{i+1} − x_i
      fx[i - 1] += ga[0]; fy[i - 1] += ga[1];
      fx[i] += -ga[0] + gb[0]; fy[i] += -ga[1] + gb[1];
      fx[i + 1] += -gb[0]; fy[i + 1] += -gb[1];
    }
    if (!ch.phantom) {                        // Lennard-Jones between beads |i − j| > 1
      const rc = ch.eps > 0.05 ? 2.5 : Math.pow(2, 1 / 6), rc2 = rc * rc;
      for (let i = 0; i < N; i++) for (let j = i + 2; j < N; j++) {
        const dx = x[i] - x[j], dy = y[i] - y[j], r2 = dx * dx + dy * dy;
        if (r2 > rc2) continue;
        const ir2 = 1 / Math.max(r2, 0.36), ir6 = ir2 * ir2 * ir2;
        // repulsion always with ε = 1 (excluded volume); attraction scaled by ε
        const f = 24 * ir2 * (2 * ir6 * ir6 - (r2 < Math.pow(2, 1 / 3) ? 1 : ch.eps) * ir6);
        fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
      }
    }
  }
  /** Langevin dynamics (BAOAB-like splitting, mass 1). */
  function chainStep() {
    const { N, x, y, vx, vy, fx, fy } = ch;
    const c1 = Math.exp(-GAMMA * DT), c2 = Math.sqrt((1 - c1 * c1) * KT);
    for (let i = 0; i < N; i++) { vx[i] += 0.5 * DT * fx[i]; vy[i] += 0.5 * DT * fy[i]; x[i] += 0.5 * DT * vx[i]; y[i] += 0.5 * DT * vy[i]; }
    for (let i = 0; i < N; i++) { vx[i] = c1 * vx[i] + c2 * gauss(); vy[i] = c1 * vy[i] + c2 * gauss(); x[i] += 0.5 * DT * vx[i]; y[i] += 0.5 * DT * vy[i]; }
    chainForces();
    for (let i = 0; i < N; i++) { vx[i] += 0.5 * DT * fx[i]; vy[i] += 0.5 * DT * fy[i]; }
    ch.t += DT;
  }
  function sizes() {
    const { N, x, y } = ch;
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += x[i]; cy += y[i]; }
    cx /= N; cy /= N;
    let s = 0;
    for (let i = 0; i < N; i++) s += (x[i] - cx) ** 2 + (y[i] - cy) ** 2;
    return { rg2: s / N, ree2: (x[N - 1] - x[0]) ** 2 + (y[N - 1] - y[0]) ** 2, cx, cy };
  }
  /** ⟨cos θ⟩ for E = κ(1 − cos θ) at kT = 1 in 2D: I₁(κ)/I₀(κ). */
  function meanCos(k) {
    if (k < 1e-6) return 0;
    let i0 = 0, i1 = 0;
    for (let n = 0; n < 400; n++) { const th = (n + 0.5) * Math.PI / 400; const w = Math.exp(k * Math.cos(th)); i0 += w; i1 += w * Math.cos(th); }
    return i1 / i0;
  }
  /** Freely rotating chain: ⟨R_ee²⟩ for n bonds of length 1. */
  function theoryRee2(N, kappa) {
    const n = N - 1, c = meanCos(kappa);
    if (c < 1e-9) return n;
    return (n * (1 + c)) / (1 - c) - (2 * c * (1 - Math.pow(c, n))) / ((1 - c) ** 2);
  }

  /* ---------------- UI ---------------- */
  let el = null, cv = null, raf = 0, key = 'pe', dp = 1000, copoly = { on: false, B: 'pp', arr: 'alternating' }, running = true;

  function mount(container) {
    el = container;
    el.innerHTML = `
      <div class="bulk-grid">
        <aside class="panel">
          <div class="card"><h2>Polymer</h2><select id="py-key">${Object.entries(POLY).map(([k, p]) => `<option value="${k}"${k === key ? ' selected' : ''}>${p.name}</option>`).join('')}</select>
            <div id="py-chem"></div>
            <label class="ctl full">Degree of polymerisation n <input type="range" id="py-dp" min="1" max="5" step="0.05" value="${Math.log10(dp)}"/> <span id="py-dpv" class="mono"></span></label>
            <div class="small" id="py-mass"></div></div>
          <div class="card"><h2>Copolymer</h2><label class="chip block"><input type="checkbox" id="py-co"/> Make a copolymer with</label>
            <select id="py-B">${Object.entries(POLY).filter(([, p]) => p.type === 'addition').map(([k, p]) => `<option value="${k}"${k === copoly.B ? ' selected' : ''}>${p.name}</option>`).join('')}</select>
            <div class="seg" style="margin-top:6px">${['alternating', 'random', 'block'].map((a) => `<button class="seg-b${a === copoly.arr ? ' active' : ''}" data-arr="${a}">${a}</button>`).join('')}</div>
            <div id="py-seq" class="seq-strip"></div></div>
        </aside>
        <section class="bulk-center"><canvas id="py-canvas" aria-label="Polymer chain simulation"></canvas><div class="lab-status" id="py-status"></div></section>
        <aside class="panel">
          <div class="card"><h2>Chain simulation</h2>
            <label class="ctl full">Beads N <input type="range" id="py-N" min="8" max="160" step="4" value="${ch.N}"/> <span id="py-Nv" class="mono"></span></label>
            <label class="ctl full">Stiffness κ <input type="range" id="py-k" min="0" max="8" step="0.1" value="${ch.kappa}"/> <span id="py-kv" class="mono"></span></label>
            <label class="ctl full">Bead attraction ε <input type="range" id="py-e" min="0" max="1.5" step="0.05" value="${ch.eps}"/> <span id="py-ev" class="mono"></span></label>
            <label class="chip block"><input type="checkbox" id="py-ph"/> Phantom chain (beads pass through each other)</label>
            <div class="btn-row"><button class="hbtn small" id="py-run">⏸ Pause</button><button class="hbtn small" id="py-reset">↺ New chain</button><button class="hbtn small accent" id="py-rec" data-tip="Store N and the average R_g for a scaling plot">📋 Record ⟨R_g⟩</button></div></div>
          <div class="card small" id="py-meas"></div>
          <div class="card"><h2>Size over time</h2><canvas class="plot" id="py-plot"></canvas></div>
          <div class="card"><h2>Scaling R_g ∝ N^ν</h2><canvas class="plot" id="py-scal"></canvas><div class="small" id="py-nu"></div></div>
        </aside>
      </div>`;
    cv = el.querySelector('#py-canvas');
    const q = (s) => el.querySelector(s);
    q('#py-key').addEventListener('change', (e) => { key = e.target.value; ch.kappa = POLY[key].stiff; q('#py-k').value = ch.kappa; chem(); labels(); });
    q('#py-dp').addEventListener('input', (e) => { dp = Math.round(10 ** Number(e.target.value)); chem(); });
    q('#py-co').addEventListener('change', (e) => { copoly.on = e.target.checked; chem(); });
    q('#py-B').addEventListener('change', (e) => { copoly.B = e.target.value; chem(); });
    el.querySelectorAll('[data-arr]').forEach((b) => b.addEventListener('click', () => { copoly.arr = b.dataset.arr; el.querySelectorAll('[data-arr]').forEach((x) => x.classList.toggle('active', x === b)); chem(); }));
    q('#py-N').addEventListener('change', (e) => { chainInit(Number(e.target.value)); labels(); });
    q('#py-k').addEventListener('input', (e) => { ch.kappa = Number(e.target.value); ch.rg = []; ch.ree = []; labels(); });
    q('#py-e').addEventListener('input', (e) => { ch.eps = Number(e.target.value); ch.rg = []; ch.ree = []; labels(); });
    q('#py-ph').addEventListener('change', (e) => { ch.phantom = e.target.checked; ch.rg = []; ch.ree = []; labels(); });
    q('#py-run').addEventListener('click', () => { running = !running; q('#py-run').textContent = running ? '⏸ Pause' : '▶ Run'; });
    q('#py-reset').addEventListener('click', () => chainInit());
    q('#py-rec').addEventListener('click', record);
    chainInit(); chem(); labels();
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); el = null; }

  function labels() {
    const q = (s) => el.querySelector(s);
    q('#py-Nv').textContent = ch.N; q('#py-kv').textContent = ch.kappa.toFixed(1); q('#py-ev').textContent = ch.eps.toFixed(2);
  }

  function svg(smi) {
    if (typeof RDKit === 'undefined' || !RDKit || typeof Synthesis === 'undefined') return `<div class="mono">${esc(smi)}</div>`;
    return Synthesis.svgOf(smi, 230, 120);
  }
  function chem() {
    const p = POLY[key];
    const q = (s) => el.querySelector(s);
    if (!RDKit) loadRDKit().then(() => { if (el) chem(); }).catch(() => {});
    q('#py-dpv').textContent = dp.toLocaleString();
    q('#py-chem').innerHTML = `<div class="row">${p.monomer.split('.').map((m) => `<figure class="mol-fig small-fig">${svg(m)}</figure>`).join('<span class="plus">+</span>')}<span class="plus">→</span><figure class="mol-fig">${svg(p.repeat)}<figcaption>repeat unit ([*] = joins the next unit)</figcaption></figure></div>
      <div class="small"><b>${p.type === 'addition' ? 'Addition' : p.type === 'condensation' ? 'Condensation' : 'Ring-opening'} polymerisation</b> of ${esc(p.mname)}${p.byproduct ? `; by-product: ${esc(p.byproduct)}` : '; no by-product (the C=C opens up)'}.</div>
      <div class="small">Glass transition T<sub>g</sub> ${p.Tg} °C${p.Tm ? ` · melts at ${p.Tm} °C` : ' · amorphous (no sharp melting point)'} · ${esc(p.uses)}.</div>
      <p class="muted-note">${esc(p.note)} Below T<sub>g</sub> the chains are frozen (glassy, rigid); above it they can wriggle (rubbery or soft).</p>`;
    const Mn = dp * p.M;
    q('#py-mass').innerHTML = `Molar mass ≈ n × ${p.M.toFixed(2)} = <b>${Mn >= 1e6 ? (Mn / 1e6).toFixed(2) + ' × 10⁶' : Math.round(Mn).toLocaleString()} g/mol</b><br/><span class="dim">Real samples contain chains of many lengths; this is the number-average for chains of exactly n units.</span>`;
    // copolymer sequence
    const seq = [];
    if (copoly.on) {
      const n = 40;
      for (let i = 0; i < n; i++) seq.push(copoly.arr === 'alternating' ? i % 2 : copoly.arr === 'block' ? (i < n / 2 ? 0 : 1) : Math.random() < 0.5 ? 0 : 1);
    }
    q('#py-seq').innerHTML = copoly.on ? `${seq.map((s) => `<i class="${s ? 'b' : 'a'}"></i>`).join('')}<div class="small dim">${esc(POLY[key].name.split(',')[0])} (cyan) and ${esc(POLY[copoly.B].name.split(',')[0])} (pink), ${copoly.arr}. ${copoly.arr === 'block' ? 'Block copolymers can separate into tiny domains (e.g. tough SBS rubber in shoe soles).' : copoly.arr === 'random' ? 'Random copolymers are usually amorphous: the irregular chain cannot crystallise.' : 'Alternating copolymers have a regular repeat (ABAB…).'}</div>` : '';
    ch.colors = copoly.on ? Array.from({ length: ch.N }, (_, i) => (copoly.arr === 'alternating' ? i % 2 : copoly.arr === 'block' ? (i < ch.N / 2 ? 0 : 1) : (i * 7919) % 3 === 0 ? 1 : 0)) : null;
  }

  function record() {
    const avg = ch.rg.length ? ch.rg.reduce((a, b) => a + b, 0) / ch.rg.length : 0;
    if (ch.rg.length < 50) { toast('Let the chain run a little longer to average R_g'); return; }
    ch.runs.push({ N: ch.N, rg: Math.sqrt(avg), kappa: ch.kappa, eps: ch.eps, phantom: ch.phantom });
    toast(`Recorded N = ${ch.N}: ⟨R_g²⟩^½ = ${Math.sqrt(avg).toFixed(2)}. Change N and record again.`);
  }

  let frame = 0;
  function loop() {
    if (!el) return;
    if (running) for (let k = 0; k < 25; k++) chainStep();
    frame++;
    const s = sizes();
    if (running && frame % 2 === 0 && ch.t > 2) { ch.rg.push(s.rg2); ch.ree.push(s.ree2); if (ch.rg.length > 3000) { ch.rg.shift(); ch.ree.shift(); } }
    draw(s);
    if (frame % 15 === 0) panel(s);
    raf = requestAnimationFrame(loop);
  }

  function draw(s) {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0f17'; c.fillRect(0, 0, W, H);
    const span = Math.max(12, Math.sqrt(theoryRee2(ch.N, ch.kappa)) * 2.2, Math.sqrt(s.rg2) * 5);
    const S = Math.min(W, H) / span;
    const X = (v) => W / 2 + (v - s.cx) * S, Y = (v) => H / 2 - (v - s.cy) * S;
    // radius of gyration circle
    c.strokeStyle = 'rgba(244,114,182,0.5)'; c.setLineDash([5, 4]);
    c.beginPath(); c.arc(W / 2, H / 2, Math.sqrt(s.rg2) * S, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#475569'; c.lineWidth = Math.max(1.5, S * 0.25);
    c.beginPath(); for (let i = 0; i < ch.N; i++) { if (i) c.lineTo(X(ch.x[i]), Y(ch.y[i])); else c.moveTo(X(ch.x[i]), Y(ch.y[i])); } c.stroke();
    const r = Math.max(2, S * 0.42);
    for (let i = 0; i < ch.N; i++) {
      c.fillStyle = ch.colors && ch.colors[i] !== undefined ? (ch.colors[i] ? '#f472b6' : '#22d3ee') : i === 0 || i === ch.N - 1 ? '#fde047' : `hsl(${190 + (i / ch.N) * 60}, 80%, 55%)`;
      c.beginPath(); c.arc(X(ch.x[i]), Y(ch.y[i]), r, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(253,224,71,0.6)'; c.setLineDash([2, 4]);
    c.beginPath(); c.moveTo(X(ch.x[0]), Y(ch.y[0])); c.lineTo(X(ch.x[ch.N - 1]), Y(ch.y[ch.N - 1])); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#9aa7b8'; c.font = '11px Inter, sans-serif'; c.textAlign = 'left';
    c.fillText('pink circle: radius of gyration · dotted yellow: end-to-end distance', 10, H - 10);
  }

  function panel(s) {
    const q = (x) => el.querySelector(x);
    const n = ch.rg.length;
    const rg2 = n ? ch.rg.reduce((a, b) => a + b, 0) / n : s.rg2, ree2 = n ? ch.ree.reduce((a, b) => a + b, 0) / n : s.ree2;
    const th = theoryRee2(ch.N, ch.kappa), c = meanCos(ch.kappa), lp = c > 0 ? -1 / Math.log(c) : 0;
    const quality = ch.phantom ? 'phantom (ideal)' : ch.eps < 0.35 ? 'good solvent: the coil swells' : ch.eps > 0.75 ? 'poor solvent: the chain collapses into a globule' : 'near the θ point (close to ideal)';
    q('#py-meas').innerHTML = `<div>⟨R_g²⟩^½ = <b>${Math.sqrt(rg2).toFixed(2)}</b> b · ⟨R_ee²⟩^½ = <b>${Math.sqrt(ree2).toFixed(2)}</b> b <span class="dim">(average of ${n} samples)</span></div>
      <div>Theory for a phantom chain with this stiffness: ⟨R_ee²⟩^½ = ${Math.sqrt(th).toFixed(2)} b${ch.phantom ? ` → ratio ${(Math.sqrt(ree2 / th)).toFixed(2)}` : ''}</div>
      <div>⟨cos θ⟩ = ${c.toFixed(2)}; persistence length ≈ ${lp.toFixed(1)} bonds${lp > 5 ? ' (a stiff, rod-like chain)' : lp < 1.2 ? ' (very flexible)' : ''}</div>
      <div>Solvent: <b>${quality}</b>. For a fully stretched chain R_ee = ${ch.N - 1} b.</div>`;
    q('#py-status').textContent = `${ch.N} beads · t = ${ch.t.toFixed(0)}`;
    const step = Math.max(1, Math.floor(n / 300));
    LabPlot.draw(q('#py-plot'), { x: { label: 'samples', min: 0 }, y: { label: 'R / b', min: 0 }, series: [{ pts: ch.rg.filter((_, i) => i % step === 0).map((v, i) => [i * step, Math.sqrt(v)]), color: '#f472b6', width: 1.2, label: 'R_g' }, { pts: ch.ree.filter((_, i) => i % step === 0).map((v, i) => [i * step, Math.sqrt(v)]), color: '#fde047', width: 1, label: 'R_ee' }] });
    const runs = ch.runs.filter((r) => r.kappa === ch.kappa && r.eps === ch.eps && r.phantom === ch.phantom);
    const pts = runs.map((r) => [Math.log10(r.N), Math.log10(r.rg)]);
    const fit = pts.length >= 2 ? LabPlot.linfit(pts) : null;
    LabPlot.draw(q('#py-scal'), { x: { label: 'log₁₀ N' }, y: { label: 'log₁₀ R_g' }, series: [{ pts, color: '#22d3ee', dots: true, r: 4 }, ...(fit ? [{ pts: [[Math.min(...pts.map((p) => p[0])), fit.b + fit.m * Math.min(...pts.map((p) => p[0]))], [Math.max(...pts.map((p) => p[0])), fit.b + fit.m * Math.max(...pts.map((p) => p[0]))]], color: '#f472b6', width: 1.4 }] : [])] });
    q('#py-nu').innerHTML = fit ? `Slope ν = <b>${fit.m.toFixed(2)}</b> (2D theory: ½ for ideal or collapsed chains, ¾ for a swollen chain in good solvent).` : 'Record ⟨R_g⟩ for two or more chain lengths (same settings) to measure the scaling exponent ν.';
  }

  BulkHub.add({ id: 'polymer', icon: '🧬', title: 'Polymer builder', mount, unmount });
  return { POLY, ch, chainInit, chainStep, sizes, theoryRee2, meanCos };
})();
