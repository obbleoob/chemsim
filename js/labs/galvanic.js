/* ============================================================================
   ChemSim · labs/galvanic.js
   ----------------------------------------------------------------------------
   Electrochemistry: galvanic (voltaic) cells and electrolysis.

   Galvanic cell
     Two half-cells (metal in a solution of its ions, or the standard hydrogen
     electrode) joined by a wire and a KNO₃ salt bridge. Each electrode's
     potential comes from the Nernst equation
         E = E° + (RT / nF) · ln[Mⁿ⁺]          (activity ≈ concentration)
     and the cell voltage is E(right) − E(left). With a load connected a
     current I = E / (R + r) flows; Faraday's law turns the charge into moles,
     so the anode dissolves, the cathode grows and the concentrations (and
     therefore the voltage) change: the cell runs down.

   Electrolysis
     A power supply drives a current through an electrolyte. Products follow
     the usual rules (selective discharge); the current is
         I = (V − decomposition voltage) / R
     and the amounts come from Faraday's law: n = It / (zF).
   ============================================================================ */
'use strict';

const GalvanicLab = (() => {
  const F = 96485, Rgas = 8.314;

  /* ---------------- half-cells ---------------- */
  // E: standard reduction potential (V, 25 °C); n: electrons; M: g/mol of the metal
  const HALF = {
    Mg: { label: 'Mg²⁺ | Mg', metal: 'Mg', ion: 'Mg²⁺', salt: 'MgSO₄', n: 2, E: -2.37, M: 24.31, metalColor: '#c9ced3', sol: [0.9, 0.94, 1] },
    Al: { label: 'Al³⁺ | Al', metal: 'Al', ion: 'Al³⁺', salt: 'Al₂(SO₄)₃', n: 3, E: -1.66, M: 26.98, metalColor: '#d5d9de', sol: [0.9, 0.94, 1] },
    Zn: { label: 'Zn²⁺ | Zn', metal: 'Zn', ion: 'Zn²⁺', salt: 'ZnSO₄', n: 2, E: -0.76, M: 65.38, metalColor: '#a7adb5', sol: [0.9, 0.94, 1] },
    Fe: { label: 'Fe²⁺ | Fe', metal: 'Fe', ion: 'Fe²⁺', salt: 'FeSO₄', n: 2, E: -0.44, M: 55.85, metalColor: '#7d838b', sol: [0.8, 0.95, 0.8] },
    Ni: { label: 'Ni²⁺ | Ni', metal: 'Ni', ion: 'Ni²⁺', salt: 'NiSO₄', n: 2, E: -0.25, M: 58.69, metalColor: '#b8b3a8', sol: [0.55, 0.9, 0.6] },
    Sn: { label: 'Sn²⁺ | Sn', metal: 'Sn', ion: 'Sn²⁺', salt: 'SnSO₄', n: 2, E: -0.14, M: 118.71, metalColor: '#cfd3d6', sol: [0.9, 0.94, 1] },
    Pb: { label: 'Pb²⁺ | Pb', metal: 'Pb', ion: 'Pb²⁺', salt: 'Pb(NO₃)₂', n: 2, E: -0.13, M: 207.2, metalColor: '#6f7784', sol: [0.9, 0.94, 1] },
    H2: { label: 'H⁺ | H₂ (Pt)', metal: 'Pt', ion: 'H⁺', salt: 'HCl', n: 2, E: 0.0, M: 2.016, metalColor: '#d8dadc', sol: [0.9, 0.94, 1], gas: true },
    Cu: { label: 'Cu²⁺ | Cu', metal: 'Cu', ion: 'Cu²⁺', salt: 'CuSO₄', n: 2, E: 0.34, M: 63.55, metalColor: '#c8743f', sol: [0.35, 0.6, 1.0] },
    Ag: { label: 'Ag⁺ | Ag', metal: 'Ag', ion: 'Ag⁺', salt: 'AgNO₃', n: 1, E: 0.80, M: 107.87, metalColor: '#d9dde2', sol: [0.9, 0.94, 1] },
  };
  const LOADS = {
    meter: { label: 'Voltmeter only (no current)', R: Infinity },
    r100: { label: '100 Ω resistor', R: 100 },
    bulb: { label: '10 Ω bulb', R: 10 },
    wire: { label: 'Wire (short circuit)', R: 0.5 },
  };
  const R_BRIDGE = 40;          // Ω: internal resistance of the cell (mostly the salt bridge)
  const VOL = 0.1;              // L of solution in each half-cell

  /** Electrode potential (reduction, V) from the Nernst equation. */
  function electrodeE(key, c, Tc = 25) {
    const h = HALF[key], T = Tc + 273.15;
    const cc = Math.max(c, 1e-15);
    if (h.gas) return h.E + ((Rgas * T) / (2 * F)) * Math.log(cc * cc);   // 2H⁺ + 2e⁻ → H₂ at 1 bar
    return h.E + ((Rgas * T) / (h.n * F)) * Math.log(cc);
  }
  /** Cell voltage E(right) − E(left). */
  const cellE = (L, cL, Rk, cR, Tc = 25) => electrodeE(Rk, cR, Tc) - electrodeE(L, cL, Tc);
  const lcm = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return (a * b) / g(a, b); };

  /** Coefficient of the oxidised form (ion, or H⁺) when N electrons are transferred. */
  const oxCoef = (h, N) => (h.gas ? N : N / h.n);
  const redCoef = (h, N) => (h.gas ? N / 2 : N / h.n);

  /** Balanced overall equation for anode a (oxidised) and cathode c (reduced). */
  function overall(a, c) {
    const A = HALF[a], C = HALF[c], N = lcm(A.n, C.n);
    const k = (x) => (x === 1 ? '' : x);
    const red = (h) => (h.gas ? 'H₂' : h.metal), ox = (h) => (h.gas ? 'H⁺' : h.ion);
    return { N, text: `${k(redCoef(A, N))}${red(A)} + ${k(oxCoef(C, N))}${ox(C)} → ${k(oxCoef(A, N))}${ox(A)} + ${k(redCoef(C, N))}${red(C)}` };
  }
  function halfEq(key, ox) {
    const h = HALF[key];
    if (h.gas) return ox ? 'H₂ → 2H⁺ + 2e⁻' : '2H⁺ + 2e⁻ → H₂';
    return ox ? `${h.metal} → ${h.ion} + ${h.n === 1 ? '' : h.n}e⁻` : `${h.ion} + ${h.n === 1 ? '' : h.n}e⁻ → ${h.metal}`;
  }

  /* ---------------- electrolysis ---------------- */
  // Each: cathode/anode products, decomposition voltage (incl. typical overpotentials), conc
  const ELECTROLYTES = {
    CuSO4_C: { label: 'Copper(II) sulfate, graphite electrodes', conc: 1.0, ion: 'Cu²⁺', color: [0.35, 0.6, 1.0], Ed: 1.49,
      cathode: { kind: 'metal', name: 'copper', f: 'Cu', z: 2, M: 63.55, color: '#c8743f', eq: 'Cu²⁺ + 2e⁻ → Cu', usesIon: true, then: 'H2' },
      anode: { kind: 'gas', name: 'oxygen', f: 'O₂', z: 4, eq: '2H₂O → O₂ + 4H⁺ + 4e⁻' }, note: 'The blue colour fades as Cu²⁺ is used up, and the solution becomes acidic (H₂SO₄ forms).' },
    CuSO4_Cu: { label: 'Copper(II) sulfate, copper electrodes', conc: 1.0, ion: 'Cu²⁺', color: [0.35, 0.6, 1.0], Ed: 0.05,
      cathode: { kind: 'metal', name: 'copper', f: 'Cu', z: 2, M: 63.55, color: '#c8743f', eq: 'Cu²⁺ + 2e⁻ → Cu' },
      anode: { kind: 'dissolve', name: 'copper (dissolves)', f: 'Cu', z: 2, M: 63.55, eq: 'Cu → Cu²⁺ + 2e⁻' }, note: 'Copper moves from the anode to the cathode and the colour stays the same: this is how copper is purified and how objects are copper-plated.' },
    NaCl_conc: { label: 'Concentrated sodium chloride (brine), graphite', conc: 5.0, ion: 'Cl⁻', color: [0.9, 0.94, 1], Ed: 2.3,
      cathode: { kind: 'gas', name: 'hydrogen', f: 'H₂', z: 2, eq: '2H₂O + 2e⁻ → H₂ + 2OH⁻' },
      anode: { kind: 'gas', name: 'chlorine', f: 'Cl₂', z: 2, eq: '2Cl⁻ → Cl₂ + 2e⁻', toxic: true }, note: 'Sodium is NOT discharged: water is reduced more easily. The solution becomes sodium hydroxide (the chlor-alkali process). Chlorine dissolves a little at first, so slightly less than 1:1 is collected.' },
    NaCl_dil: { label: 'Dilute sodium chloride, graphite', conc: 0.05, ion: 'Cl⁻', color: [0.9, 0.94, 1], Ed: 2.0,
      cathode: { kind: 'gas', name: 'hydrogen', f: 'H₂', z: 2, eq: '2H₂O + 2e⁻ → H₂ + 2OH⁻' },
      anode: { kind: 'gas', name: 'oxygen (mostly)', f: 'O₂', z: 4, eq: '2H₂O → O₂ + 4H⁺ + 4e⁻' }, note: 'With little chloride, water is oxidised instead: mainly oxygen at the anode.' },
    H2SO4: { label: 'Dilute sulfuric acid (electrolysis of water), platinum', conc: 0.5, ion: 'H⁺', color: [0.9, 0.94, 1], Ed: 1.7,
      cathode: { kind: 'gas', name: 'hydrogen', f: 'H₂', z: 2, eq: '2H⁺ + 2e⁻ → H₂' },
      anode: { kind: 'gas', name: 'oxygen', f: 'O₂', z: 4, eq: '2H₂O → O₂ + 4H⁺ + 4e⁻' }, note: 'Hydrogen and oxygen in a 2 : 1 volume ratio. The acid is not used up; only water is.' },
    CuCl2: { label: 'Copper(II) chloride, graphite', conc: 1.0, ion: 'Cu²⁺', color: [0.35, 0.75, 0.85], Ed: 1.35,
      cathode: { kind: 'metal', name: 'copper', f: 'Cu', z: 2, M: 63.55, color: '#c8743f', eq: 'Cu²⁺ + 2e⁻ → Cu', usesIon: true, then: 'H2' },
      anode: { kind: 'gas', name: 'chlorine', f: 'Cl₂', z: 2, eq: '2Cl⁻ → Cl₂ + 2e⁻', toxic: true }, note: 'Chlorine bleaches damp litmus paper.' },
    KI: { label: 'Potassium iodide, graphite', conc: 0.5, ion: 'I⁻', color: [0.9, 0.94, 1], Ed: 1.35,
      cathode: { kind: 'gas', name: 'hydrogen', f: 'H₂', z: 2, eq: '2H₂O + 2e⁻ → H₂ + 2OH⁻' },
      anode: { kind: 'solution', name: 'iodine (brown solution)', f: 'I₂', z: 2, M: 253.8, eq: '2I⁻ → I₂ + 2e⁻' }, note: 'Brown iodine spreads from the anode; starch would turn it blue-black.' },
  };
  const R_CELL = 4;             // Ω: resistance of the electrolysis cell
  const MOLAR_VOL = 24.0;       // dm³/mol of gas at room temperature and pressure

  /* ---------------- state ---------------- */
  let el = null, cv = null, plotCv = null, raf = 0, last = 0, st = null;

  function newState() {
    return {
      mode: 'cell',
      L: 'Zn', R: 'Cu', cL: 1.0, cR: 1.0, T: 25, bridge: true, load: 'meter',
      massL: 5, massR: 5, cL0: 1, cR0: 1,
      running: true, speed: 1, simT: 0, charge: 0,
      readings: [],
      e: { key: 'CuSO4_C', V: 6, on: false, t: 0, Q: 0, I: 0, ionLeft: 0, runs: [], catMass: 10, anMass: 10 },
      dots: Array.from({ length: 26 }, (_, i) => i / 26), ions: Array.from({ length: 14 }, (_, i) => ({ p: i / 14, plus: i % 2 === 0 })),
      anim: 0, answers: {},
    };
  }

  /* ---------------- UI ---------------- */
  function mount(container) {
    el = container;
    st = newState();
    const opts = (sel) => Object.entries(HALF).map(([k, h]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${h.label}  (E° = ${h.E >= 0 ? '+' : ''}${h.E.toFixed(2)} V)</option>`).join('');
    el.innerHTML = `
      <div class="lab-grid">
        <aside class="panel lab-left">
          <div class="seg" role="tablist"><button class="seg-b active" data-mode="cell">⚡ Galvanic cell</button><button class="seg-b" data-mode="elec">🔋 Electrolysis</button></div>
          <div id="g-cell-ctl">
            <div class="card"><h2>Left half-cell</h2>
              <select id="g-L">${opts('Zn')}</select>
              <label class="ctl full">[ion] <input type="range" id="g-cL" min="-3" max="0.3" step="0.05" value="0" /> <span id="g-cL-v"></span></label></div>
            <div class="card"><h2>Right half-cell</h2>
              <select id="g-R">${opts('Cu')}</select>
              <label class="ctl full">[ion] <input type="range" id="g-cR" min="-3" max="0.3" step="0.05" value="0" /> <span id="g-cR-v"></span></label></div>
            <div class="card"><h2>Circuit</h2>
              <label class="chip block"><input type="checkbox" id="g-bridge" checked /> Salt bridge (KNO₃) in place</label>
              <label class="field">Connected across the cell<select id="g-load">${Object.entries(LOADS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join('')}</select></label>
              <label class="ctl full">Temperature <input type="range" id="g-T" min="0" max="80" step="1" value="25" /> <span id="g-T-v">25 °C</span></label>
              <label class="ctl" data-tip="Speed up time to watch the cell run down">⏩ <select id="g-speed"><option value="1">1×</option><option value="60">1 min/s</option><option value="3600">1 h/s</option><option value="36000">10 h/s</option></select></label>
              <div class="btn-row"><button class="hbtn small" id="g-daniell" data-tip="Zn | Zn²⁺ (1 M) || Cu²⁺ (1 M) | Cu">Daniell cell</button><button class="hbtn small" id="g-reset">↺ Fresh cell</button></div></div>
          </div>
          <div id="g-elec-ctl" class="hidden">
            <div class="card"><h2>Electrolyte</h2><select id="e-key">${Object.entries(ELECTROLYTES).map(([k, x]) => `<option value="${k}">${x.label}</option>`).join('')}</select>
              <p class="small dim" id="e-note"></p></div>
            <div class="card"><h2>Power supply</h2>
              <label class="ctl full">Voltage <input type="range" id="e-V" min="0" max="12" step="0.1" value="6" /> <span id="e-V-v">6.0 V</span></label>
              <label class="ctl" data-tip="Speed up time">⏩ <select id="e-speed"><option value="1">1×</option><option value="10">10×</option><option value="60">1 min/s</option></select></label>
              <div class="btn-row"><button class="hbtn small accent" id="e-on">▶ Switch on</button><button class="hbtn small" id="e-reset">↺ Reset</button><button class="hbtn small" id="e-record" data-tip="Save this run (current, time, products) in the results table">📋 Record run</button></div></div>
          </div>
        </aside>
        <section class="lab-center"><canvas id="g-canvas" aria-label="Electrochemical cell"></canvas></section>
        <aside class="panel lab-right">
          <div id="g-cell-read">
            <div class="card big-meter"><div class="k">Voltmeter</div><div class="v" id="g-E">1.100 V</div><div class="small dim" id="g-I"></div></div>
            <div class="card"><h2>What is happening</h2><div class="small" id="g-explain"></div></div>
            <div class="card"><h2>Readings <span class="h2-note">for a Nernst plot</span></h2>
              <button class="hbtn small" id="g-rec">📋 Record reading</button> <button class="mini" id="g-clr" data-tip="Clear readings">🗑</button>
              <table class="data-table"><thead><tr><th>Cell</th><th>[left]</th><th>[right]</th><th>T</th><th>E / V</th></tr></thead><tbody id="g-rows"></tbody></table>
              <canvas id="g-plot" class="plot"></canvas>
              <div class="small dim" id="g-fit"></div></div>
            <div class="card"><h2>Questions</h2>
              <label class="field">E°cell of the Daniell cell (V)<input type="number" step="any" data-q="e0" /></label>
              <label class="field">Slope of your Nernst plot (V per unit of log₁₀Q)<input type="number" step="any" data-q="slope" /></label>
              <label class="field">Electrons transferred, n, from the slope<input type="number" step="1" data-q="n" /></label>
              <details class="small hint"><summary>Hint</summary>E = E° − (2.303RT/nF)·log₁₀Q. At 25 °C, 2.303RT/F = 0.0592 V, so the slope is −0.0592/n. Q = [anode ion]/[cathode ion] for two 2+ ions. Record readings with the same two metals at 25 °C while changing one concentration.</details></div>
          </div>
          <div id="g-elec-read" class="hidden">
            <div class="card big-reads e-reads"><div class="read"><div class="k">Current</div><div class="v" id="e-I">0.00 A</div></div><div class="read"><div class="k">Time</div><div class="v" id="e-t">0:00</div></div><div class="read"><div class="k">Charge</div><div class="v" id="e-Q">0 C</div></div></div>
            <div class="card"><h2>Products</h2><div class="small" id="e-prod"></div></div>
            <div class="card"><h2>Results</h2><table class="data-table"><thead><tr><th>Electrolyte</th><th>I / A</th><th>t / s</th><th>Cathode</th><th>Anode</th></tr></thead><tbody id="e-rows"></tbody></table></div>
            <div class="card"><h2>Question</h2>
              <label class="field">From your recorded run, the mass of copper expected at the cathode (g), calculated with Faraday’s law<input type="number" step="any" data-q="cu" /></label>
              <details class="small hint"><summary>Hint</summary>n(e⁻) = It/F; n(Cu) = n(e⁻)/2; m = n × 63.55 g/mol. F = 96 485 C/mol.</details></div>
          </div>
        </aside>
      </div>`;
    cv = el.querySelector('#g-canvas');
    plotCv = el.querySelector('#g-plot');
    wire();
    refresh();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); raf = 0; el = null; }

  function wire() {
    const q = (s) => el.querySelector(s);
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    q('#g-L').addEventListener('change', (e) => { st.L = e.target.value; freshCell(); });
    q('#g-R').addEventListener('change', (e) => { st.R = e.target.value; freshCell(); });
    q('#g-cL').addEventListener('input', (e) => { st.cL = st.cL0 = Math.pow(10, Number(e.target.value)); refresh(); });
    q('#g-cR').addEventListener('input', (e) => { st.cR = st.cR0 = Math.pow(10, Number(e.target.value)); refresh(); });
    q('#g-bridge').addEventListener('change', (e) => { st.bridge = e.target.checked; refresh(); });
    q('#g-load').addEventListener('change', (e) => { st.load = e.target.value; refresh(); });
    q('#g-T').addEventListener('input', (e) => { st.T = Number(e.target.value); q('#g-T-v').textContent = `${st.T} °C`; refresh(); });
    q('#g-speed').addEventListener('change', (e) => { st.speed = Number(e.target.value); });
    q('#g-daniell').addEventListener('click', () => {
      st.L = 'Zn'; st.R = 'Cu'; q('#g-L').value = 'Zn'; q('#g-R').value = 'Cu';
      st.T = 25; q('#g-T').value = 25; q('#g-T-v').textContent = '25 °C';
      q('#g-cL').value = 0; q('#g-cR').value = 0; st.cL0 = st.cR0 = 1; freshCell();
    });
    q('#g-reset').addEventListener('click', freshCell);
    q('#g-rec').addEventListener('click', record);
    q('#g-clr').addEventListener('click', () => { st.readings = []; refresh(); });
    q('#e-key').addEventListener('change', (e) => { st.e.key = e.target.value; resetElec(); });
    q('#e-V').addEventListener('input', (e) => { st.e.V = Number(e.target.value); q('#e-V-v').textContent = `${st.e.V.toFixed(1)} V`; });
    q('#e-speed').addEventListener('change', (e) => { st.e.speed = Number(e.target.value); });
    q('#e-on').addEventListener('click', () => { st.e.on = !st.e.on; q('#e-on').textContent = st.e.on ? '⏸ Switch off' : '▶ Switch on'; });
    q('#e-reset').addEventListener('click', resetElec);
    q('#e-record').addEventListener('click', recordElec);
    el.querySelectorAll('[data-q]').forEach((inp) => inp.addEventListener('input', () => { st.answers[inp.dataset.q] = inp.value === '' ? undefined : Number(inp.value); }));
    resetElec();
  }

  function setMode(m) {
    st.mode = m;
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    ['cell', 'elec'].forEach((k) => {
      el.querySelector(`#g-${k}-ctl`).classList.toggle('hidden', k !== m);
      el.querySelector(`#g-${k}-read`).classList.toggle('hidden', k !== m);
    });
    refresh();
  }

  function freshCell() {
    st.cL = st.cL0; st.cR = st.cR0; st.massL = 5; st.massR = 5; st.simT = 0; st.charge = 0; st.flat = false;
    refresh();
  }

  /* ---------------- cell physics ---------------- */
  function cellNow() {
    const E = cellE(st.L, st.cL, st.R, st.cR, st.T);
    const Rl = LOADS[st.load].R;
    const closed = st.bridge && isFinite(Rl) && st.L !== st.R && !st.flat;
    const I = closed ? E / (Rl + R_BRIDGE) : 0;
    const Vread = st.bridge ? (isFinite(Rl) ? I * Rl : E) : 0;
    return { E, I, Vread, closed };
  }

  function stepCell(dt) {
    const { I, closed } = cellNow();
    if (!closed || Math.abs(I) < 1e-12) return;
    // positive I: electrons flow left → right in the wire (left is the anode)
    const anode = I > 0 ? 'L' : 'R', cath = I > 0 ? 'R' : 'L';
    const A = HALF[st[anode]], C = HALF[st[cath]];
    let rem = dt;
    for (let k = 0; k < 400 && rem > 0; k++) {
      const { I: Inow, closed: cl } = cellNow();
      if (!cl || Inow * (anode === 'L' ? 1 : -1) <= 1e-12) break;
      const cC = st['c' + cath];
      // limit each sub-step to 2 % of the cathode ions or anode metal left
      const nE = Math.abs(Inow) / F;                       // mol e⁻ per s
      const lim = Math.min(cC * VOL * C.n * 0.02, (st['mass' + anode] / A.M) * A.n * 0.02) / nE;
      const h = Math.max(1e-6, Math.min(rem, lim || rem));
      const ne = nE * h;
      st['c' + anode] += ne / A.n / VOL * (A.gas ? 2 : 1);
      st['c' + cath] -= ne / C.n / VOL * (C.gas ? 2 : 1);
      if (!A.gas) st['mass' + anode] -= (ne / A.n) * A.M;
      if (!C.gas) st['mass' + cath] += (ne / C.n) * C.M;
      st.charge += ne * F;
      rem -= h;
      if (st['c' + cath] < 1e-9 || st['mass' + anode] <= 0.01) {
        st['c' + cath] = Math.max(st['c' + cath], 1e-12);
        st.flat = true;
        toast(st['mass' + anode] <= 0.01 ? 'The anode has dissolved away: the cell is flat.' : 'The cathode ions are used up: the cell is flat.');
        break;
      }
    }
    st.simT += dt;
  }

  /* ---------------- electrolysis physics ---------------- */
  function resetElec() {
    const x = ELECTROLYTES[st.e.key];
    Object.assign(st.e, { t: 0, Q: 0, I: 0, on: false, ionLeft: x.conc * VOL, catMass: 10, anMass: 10, gasC: 0, gasA: 0, metal: 0, h2After: 0, speed: st.e.speed || 1 });
    if (el) {
      el.querySelector('#e-on').textContent = '▶ Switch on';
      el.querySelector('#e-note').textContent = x.note;
    }
  }
  function stepElec(dt) {
    const e = st.e, x = ELECTROLYTES[e.key];
    e.I = e.on ? Math.max(0, (e.V - x.Ed) / R_CELL) : 0;
    if (!e.on || e.I <= 0) return;
    const dQ = e.I * dt;
    e.Q += dQ; e.t += dt;
    const ne = dQ / F;
    // cathode
    if (x.cathode.kind === 'metal') {
      let n = ne / x.cathode.z;
      if (x.cathode.usesIon) {
        const use = Math.min(n, e.ionLeft);
        e.ionLeft -= use; e.metal += use;
        e.catMass += use * x.cathode.M;
        if (use < n) e.h2After += ((n - use) * x.cathode.z) / 2;      // once Cu²⁺ is gone: hydrogen
      } else { e.metal += n; e.catMass += n * x.cathode.M; }
    } else e.gasC += ne / x.cathode.z;
    // anode
    if (x.anode.kind === 'gas') e.gasA += ne / x.anode.z;
    else if (x.anode.kind === 'dissolve') e.anMass -= (ne / x.anode.z) * x.anode.M;
    else e.gasA += ne / x.anode.z;     // iodine in solution (mol)
  }

  function recordElec() {
    const e = st.e, x = ELECTROLYTES[e.key];
    if (e.Q <= 0) { toast('Switch on and run the electrolysis first'); return; }
    const cath = x.cathode.kind === 'metal' ? `${(e.metal * x.cathode.M).toFixed(3)} g ${x.cathode.name}${e.h2After > 1e-6 ? ` + ${(e.h2After * MOLAR_VOL * 1000).toFixed(1)} cm³ H₂` : ''}` : `${(e.gasC * MOLAR_VOL * 1000).toFixed(1)} cm³ ${x.cathode.f}`;
    const an = x.anode.kind === 'gas' ? `${(e.gasA * MOLAR_VOL * 1000).toFixed(1)} cm³ ${x.anode.f}` : x.anode.kind === 'dissolve' ? `−${((e.Q / F / 2) * x.anode.M).toFixed(3)} g Cu` : `${(e.gasA * 1000).toFixed(2)} mmol I₂`;
    e.runs.push({ key: e.key, label: x.label, I: e.I, V: e.V, t: e.t, Q: e.Q, cath, an, cuMass: x.cathode.f === 'Cu' ? e.metal * x.cathode.M : null });
    toast('Run recorded');
    refresh();
  }

  function record() {
    const { E, Vread } = cellNow();
    if (!st.bridge) { toast('No salt bridge: the circuit is incomplete, so there is nothing to measure'); return; }
    if (LOADS[st.load].R !== Infinity) toast('Note: with a load connected the meter reads less than the true cell voltage (I × r is lost inside the cell)');
    st.readings.push({ L: st.L, R: st.R, cL: st.cL, cR: st.cR, T: st.T, E: +Vread.toFixed(4), Etrue: E });
    refresh();
  }

  /** Nernst analysis of the readings that share the latest pair and temperature. */
  function nernstData() {
    const lastR = st.readings[st.readings.length - 1];
    if (!lastR) return null;
    const set = st.readings.filter((r) => r.L === lastR.L && r.R === lastR.R && r.T === lastR.T);
    const anode = HALF[lastR.L].E <= HALF[lastR.R].E ? 'L' : 'R';
    const a = lastR[anode], c = lastR[anode === 'L' ? 'R' : 'L'];
    const { N } = overall(a, c);
    const A = HALF[a], C = HALF[c];
    // Q = [anode ion]^a / [cathode ion]^c (metals and H₂ at 1 bar have activity 1)
    const logQ = (r) => {
      const ca = anode === 'L' ? r.cL : r.cR, cc = anode === 'L' ? r.cR : r.cL;
      return oxCoef(A, N) * Math.log10(ca) - oxCoef(C, N) * Math.log10(cc);
    };
    const sign = anode === 'L' ? 1 : -1;                 // E as "cathode − anode"
    const pts = set.map((r) => [logQ(r), sign * r.E]);
    const fit = pts.length >= 2 ? LabPlot.linfit(pts) : null;
    const E0 = C.E - A.E;
    const k = (2.303 * Rgas * (lastR.T + 273.15)) / F;
    return { pts, fit, N, E0, k, a, c, T: lastR.T };
  }

  /* ---------------- refresh text panels ---------------- */
  function refresh() {
    if (!el) return;
    const q = (s) => el.querySelector(s);
    const fmtC = (c) => (c >= 0.1 ? c.toFixed(2) : c >= 0.001 ? c.toFixed(4) : c.toExponential(1)) + ' M';
    q('#g-cL-v').textContent = fmtC(st.cL); q('#g-cR-v').textContent = fmtC(st.cR);
    const { E, I, Vread, closed } = cellNow();
    q('#g-E').textContent = `${Vread >= 0 ? '+' : '−'}${Math.abs(Vread).toFixed(3)} V`;
    q('#g-I').textContent = !st.bridge ? 'No salt bridge: open circuit, so the meter reads 0.' : closed ? `Current ${(Math.abs(I) * 1000).toFixed(1)} mA · EMF ${E.toFixed(3)} V · ${st.simT > 0 ? `running ${fmtTime(st.simT)}, ${st.charge.toFixed(0)} C passed` : ''}${st.flat ? ' · FLAT' : ''}` : 'A voltmeter draws almost no current, so it reads the full EMF.';
    const left = HALF[st.L], right = HALF[st.R];
    if (st.L === st.R) q('#g-explain').innerHTML = `Two identical half-cells: E°cell = 0. ${Math.abs(E) > 1e-4 ? `Different concentrations still give a voltage: a <b>concentration cell</b> (${E.toFixed(3)} V).` : ''}`;
    else {
      const anodeKey = E >= 0 ? st.L : st.R, cathKey = E >= 0 ? st.R : st.L;
      const ov = overall(anodeKey, cathKey);
      const E0 = HALF[cathKey].E - HALF[anodeKey].E;
      const dG = (-ov.N * F * Math.abs(E)) / 1000;
      const logK = (ov.N * F * E0) / (2.303 * Rgas * (st.T + 273.15));
      q('#g-explain').innerHTML = `
        <div><b>Anode (−), oxidation:</b> ${halfEq(anodeKey, true)} <span class="dim">(${E >= 0 ? 'left' : 'right'})</span></div>
        <div><b>Cathode (+), reduction:</b> ${halfEq(cathKey, false)} <span class="dim">(${E >= 0 ? 'right' : 'left'})</span></div>
        <div><b>Overall:</b> ${ov.text}</div>
        <div class="mono">${HALF[anodeKey].gas ? 'Pt | H₂ | H⁺' : `${HALF[anodeKey].metal}(s) | ${HALF[anodeKey].ion}`}(${fmtC(E >= 0 ? st.cL : st.cR)}) ‖ ${HALF[cathKey].ion}(${fmtC(E >= 0 ? st.cR : st.cL)}) | ${HALF[cathKey].gas ? 'H₂ | Pt' : `${HALF[cathKey].metal}(s)`}</div>
        <div>E°cell = ${HALF[cathKey].E.toFixed(2)} − (${HALF[anodeKey].E.toFixed(2)}) = <b>${E0.toFixed(2)} V</b>; Nernst: E = <b>${Math.abs(E).toFixed(3)} V</b></div>
        <div>ΔG = −nFE = −${ov.N} × 96 485 × ${Math.abs(E).toFixed(3)} = <b>${dG.toFixed(0)} kJ/mol</b>; K = 10^${logK.toFixed(1)}</div>
        <div class="dim">Electrons flow through the wire from anode to cathode. In the salt bridge, K⁺ moves toward the cathode and NO₃⁻ toward the anode to keep both solutions neutral.</div>`;
    }
    q('#g-rows').innerHTML = st.readings.map((r) => `<tr><td>${HALF[r.L].metal}|${HALF[r.R].metal}</td><td>${fmtC(r.cL)}</td><td>${fmtC(r.cR)}</td><td>${r.T}</td><td>${r.E.toFixed(3)}</td></tr>`).join('') || '<tr><td colspan="5" class="dim">No readings yet</td></tr>';
    drawNernst();
    refreshElec();
  }

  function drawNernst() {
    const nd = nernstData();
    const fitBox = el.querySelector('#g-fit');
    if (!nd || nd.pts.length < 1) { LabPlot.draw(plotCv, { x: { label: 'log₁₀ Q', min: -3, max: 3 }, y: { label: 'E / V', min: 0, max: 1.5 }, series: [], notes: [{ x: -2.8, y: 0.75, text: 'Record readings to plot E against log Q' }] }); fitBox.textContent = ''; return; }
    const xs = nd.pts.map((p) => p[0]);
    const x0 = Math.min(-1, ...xs) - 0.5, x1 = Math.max(1, ...xs) + 0.5;
    const theory = [[x0, nd.E0 - (nd.k / nd.N) * x0], [x1, nd.E0 - (nd.k / nd.N) * x1]];
    LabPlot.draw(plotCv, { x: { label: 'log₁₀ Q', min: x0, max: x1 }, y: { label: 'E / V' },
      series: [{ pts: theory, color: '#64748b', width: 1.2, dash: [4, 3], label: `theory (slope −${(nd.k / nd.N).toFixed(4)})` }, { pts: nd.pts, color: '#22d3ee', dots: true, r: 4, label: 'your readings' }] });
    fitBox.innerHTML = nd.fit ? `Best-fit line: E = ${nd.fit.b.toFixed(3)} ${nd.fit.m < 0 ? '−' : '+'} ${Math.abs(nd.fit.m).toFixed(4)}·log₁₀Q (r² = ${nd.fit.r2.toFixed(3)})` : 'Record at least two readings (same metals and temperature) for a best-fit line.';
  }

  function refreshElec() {
    const e = st.e, x = ELECTROLYTES[e.key], q = (s) => el.querySelector(s);
    q('#e-I').textContent = `${e.I.toFixed(2)} A`;
    q('#e-t').textContent = fmtTime(e.t);
    q('#e-Q').textContent = `${e.Q.toFixed(0)} C`;
    const cath = x.cathode.kind === 'metal'
      ? `${x.cathode.name}: <b>${(e.metal * x.cathode.M).toFixed(3)} g</b> deposited${e.h2After > 1e-7 ? `; then hydrogen ${(e.h2After * MOLAR_VOL * 1000).toFixed(1)} cm³ (the Cu²⁺ ran out)` : ''}`
      : `${x.cathode.name}: <b>${(e.gasC * MOLAR_VOL * 1000).toFixed(1)} cm³</b>`;
    const an = x.anode.kind === 'gas' ? `${x.anode.name}: <b>${(e.gasA * MOLAR_VOL * 1000).toFixed(1)} cm³</b>${x.anode.toxic ? ' ☠ toxic' : ''}`
      : x.anode.kind === 'dissolve' ? `${x.anode.name}: <b>${((e.Q / F / 2) * x.anode.M).toFixed(3)} g</b> lost` : `${x.anode.name}: <b>${(e.gasA * 1000).toFixed(2)} mmol</b>`;
    q('#e-prod').innerHTML = `<div><b>Cathode (−):</b> ${x.cathode.eq}<br/>${cath}</div><div><b>Anode (+):</b> ${x.anode.eq}<br/>${an}</div>
      <div class="dim">Decomposition voltage ≈ ${x.Ed.toFixed(2)} V (including overpotential); below it almost no current flows. I = (V − ${x.Ed.toFixed(2)}) / ${R_CELL} Ω.</div>`;
    q('#e-rows').innerHTML = e.runs.map((r) => `<tr><td>${esc(r.label.split(',')[0])}</td><td>${r.I.toFixed(2)}</td><td>${r.t.toFixed(0)}</td><td>${r.cath}</td><td>${r.an}</td></tr>`).join('') || '<tr><td colspan="5" class="dim">No runs recorded</td></tr>';
  }
  const esc = (s) => LabsHub.esc(s);
  const fmtTime = (t) => (t < 3600 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : `${(t / 3600).toFixed(1)} h`);

  /* ---------------- animation ---------------- */
  let textTimer = 0;
  function loop(now) {
    if (!el) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    st.anim += dt;
    if (st.mode === 'cell') stepCell(dt * st.speed);
    else stepElec(dt * (st.e.speed || 1));
    textTimer += dt;
    if (textTimer > 0.3) { textTimer = 0; refresh(); }
    if (st.mode === 'cell') drawCell(dt); else drawElec(dt);
    raf = requestAnimationFrame(loop);
  }

  function setup() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const k = Math.min(W / 760, H / 520);
    c.translate((W - 760 * k) / 2, (H - 520 * k) / 2);
    c.scale(k, k);
    return c;
  }
  const rgb = (a, alpha = 0.85) => `rgba(${a.map((v) => Math.round(v * 255)).join(',')},${alpha})`;
  const tint = (base, c) => base.map((v) => 1 - (1 - v) * Math.min(1.6, Math.pow(Math.max(c, 0), 0.5)));   // deeper colour at higher conc

  function beaker(c, x, y, w, h, fill) {
    c.fillStyle = fill; c.fillRect(x + 2, y + h * 0.3, w - 4, h * 0.7 - 2);
    c.strokeStyle = 'rgba(220,235,255,0.65)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.lineTo(x + w, y + h); c.lineTo(x + w, y); c.stroke();
  }
  function label(c, text, x, y, color = '#e6edf3', size = 13, align = 'center') {
    c.fillStyle = color; c.font = `${size}px Inter, sans-serif`; c.textAlign = align; c.fillText(text, x, y);
  }

  function drawCell(dt) {
    const c = setup();
    if (!c) return;
    const { E, I, Vread, closed } = cellNow();
    const Lh = HALF[st.L], Rh = HALF[st.R];
    const bx = [90, 470], by = 230, bw = 200, bh = 220;
    beaker(c, bx[0], by, bw, bh, rgb(tint(Lh.sol, st.cL)));
    beaker(c, bx[1], by, bw, bh, rgb(tint(Rh.sol, st.cR)));
    // electrodes
    const elec = (h, x, mass) => {
      const w = h.gas ? 10 : Math.max(6, Math.min(34, 8 + mass * 3));
      c.fillStyle = h.metalColor; c.fillRect(x - w / 2, 150, w, 270);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.strokeRect(x - w / 2, 150, w, 270);
      if (h.gas) {   // hydrogen electrode: glass hood + bubbles
        c.strokeStyle = 'rgba(220,235,255,0.6)'; c.strokeRect(x - 22, 140, 44, 230);
        for (let i = 0; i < 6; i++) { const yy = 400 - ((st.anim * 60 + i * 40) % 220); c.beginPath(); c.arc(x - 8 + (i % 3) * 8, yy, 3, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke(); }
      }
    };
    elec(Lh, bx[0] + bw / 2, st.massL); elec(Rh, bx[1] + bw / 2, st.massR);
    label(c, Lh.gas ? 'Pt, H₂ 1 bar' : `${Lh.metal}`, bx[0] + bw / 2 + 30, 190, '#e6edf3', 14, 'left');
    label(c, Rh.gas ? 'Pt, H₂ 1 bar' : `${Rh.metal}`, bx[1] + bw / 2 - 30, 190, '#e6edf3', 14, 'right');
    label(c, `${Lh.salt}(aq)  [${Lh.ion}] = ${st.cL < 0.001 ? st.cL.toExponential(1) : st.cL.toFixed(3)} M`, bx[0] + bw / 2, by + bh + 22, '#9aa7b8', 12);
    label(c, `${Rh.salt}(aq)  [${Rh.ion}] = ${st.cR < 0.001 ? st.cR.toExponential(1) : st.cR.toFixed(3)} M`, bx[1] + bw / 2, by + bh + 22, '#9aa7b8', 12);
    // salt bridge (inverted U)
    if (st.bridge) {
      c.strokeStyle = 'rgba(250,250,240,0.55)'; c.lineWidth = 22; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(bx[0] + bw - 40, by + 120); c.lineTo(bx[0] + bw - 40, by + 20); c.lineTo(bx[1] + 40, by + 20); c.lineTo(bx[1] + 40, by + 120); c.stroke();
      label(c, 'salt bridge (KNO₃)', 380, by + 6, '#cbd5e1', 11);
      c.fillStyle = '#c084fc'; c.beginPath(); c.arc(318, by + 50, 4, 0, Math.PI * 2); c.fill();
      label(c, 'K⁺', 326, by + 54, '#c084fc', 11, 'left');
      c.fillStyle = '#fb923c'; c.beginPath(); c.arc(408, by + 50, 4, 0, Math.PI * 2); c.fill();
      label(c, 'NO₃⁻', 416, by + 54, '#fb923c', 11, 'left');
      // ions drifting
      const path = (p) => {
        const a = bx[0] + bw - 40, b = bx[1] + 40, top = by + 20, down = 100;
        const total = down * 2 + (b - a);
        let d = p * total;
        if (d < down) return [a, by + 120 - d];
        d -= down;
        if (d < b - a) return [a + d, top];
        d -= b - a;
        return [b, top + d];
      };
      const flow = closed ? Math.sign(I) * Math.min(0.25, 0.02 + Math.log10(1 + Math.abs(I) * 1e4) * 0.04) : 0;
      st.ions.forEach((ion) => {
        // K⁺ toward the cathode (the right when I > 0); NO₃⁻ the other way
        ion.p = (ion.p + (ion.plus ? 1 : -1) * flow * dt + 1) % 1;
        const [x, y] = path(ion.p);
        c.fillStyle = ion.plus ? '#c084fc' : '#fb923c';
        c.beginPath(); c.arc(x, y + (ion.plus ? -4 : 4), 3.2, 0, Math.PI * 2); c.fill();
      });
    }
    // wires and meter
    const lx = bx[0] + bw / 2, rx = bx[1] + bw / 2;
    c.strokeStyle = '#94a3b8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(lx, 150); c.lineTo(lx, 70); c.lineTo(330, 70); c.moveTo(430, 70); c.lineTo(rx, 70); c.lineTo(rx, 150); c.stroke();
    // meter / load box
    c.fillStyle = '#111827'; c.strokeStyle = '#475569'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(330, 38, 100, 64, 10); c.fill(); c.stroke();
    if (st.load === 'bulb') {
      const glow = closed ? Math.min(1, Math.abs(I) * 30) : 0;
      c.fillStyle = `rgba(255,220,120,${0.15 + glow * 0.85})`; c.beginPath(); c.arc(380, 62, 16, 0, Math.PI * 2); c.fill();
      if (glow > 0.2) { c.fillStyle = `rgba(255,220,120,${glow * 0.25})`; c.beginPath(); c.arc(380, 62, 34, 0, Math.PI * 2); c.fill(); }
      label(c, `${Vread.toFixed(2)} V`, 380, 96, '#9fe870', 11);
    } else {
      label(c, `${Vread >= 0 ? '+' : '−'}${Math.abs(Vread).toFixed(3)}`, 380, 72, '#9fe870', 20);
      label(c, st.load === 'meter' ? 'V' : LOADS[st.load].label, 380, 92, '#9aa7b8', 10);
    }
    label(c, 'COM', 342, 30, '#64748b', 10); label(c, '+', 420, 30, '#ef4444', 13);
    // electrons along the wire (anode → cathode)
    if (closed && Math.abs(I) > 1e-7) {
      const speed = Math.sign(I) * Math.min(0.6, 0.05 + Math.log10(1 + Math.abs(I) * 1e4) * 0.1);
      const pathW = (p) => {
        const seg = [[lx, 150], [lx, 70], [rx, 70], [rx, 150]];
        const lens = [80, rx - lx, 80], tot = lens[0] + lens[1] + lens[2];
        let d = p * tot;
        for (let i = 0; i < 3; i++) {
          if (d <= lens[i]) { const [ax, ay] = seg[i], [bxx, byy] = seg[i + 1]; const f = d / lens[i]; return [ax + (bxx - ax) * f, ay + (byy - ay) * f]; }
          d -= lens[i];
        }
        return seg[3];
      };
      st.dots = st.dots.map((p) => (p + speed * dt + 1) % 1);
      c.fillStyle = '#fde047';
      st.dots.forEach((p) => { const [x, y] = pathW(p); if (x > 330 && x < 430 && y < 104) return; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); });
      label(c, `e⁻ → (${(Math.abs(I) * 1000).toFixed(1)} mA)`, 380, 124, '#fde047', 11);
    }
    // anode/cathode tags
    if (st.L !== st.R || Math.abs(E) > 1e-4) {
      const leftAn = E >= 0;
      label(c, leftAn ? 'ANODE (−) oxidation' : 'CATHODE (+) reduction', bx[0] + bw / 2, by + bh + 42, leftAn ? '#fca5a5' : '#93c5fd', 12);
      label(c, leftAn ? 'CATHODE (+) reduction' : 'ANODE (−) oxidation', bx[1] + bw / 2, by + bh + 42, leftAn ? '#93c5fd' : '#fca5a5', 12);
    }
    if (!st.bridge) label(c, 'No salt bridge: no current can flow', 380, by + 60, '#fbbf24', 13);
    if (st.flat) label(c, 'The cell is flat', 380, 170, '#f87171', 16);
  }

  function drawElec() {
    const c = setup();
    if (!c) return;
    const e = st.e, x = ELECTROLYTES[e.key];
    const frac = x.cathode.usesIon ? e.ionLeft / (x.conc * VOL) : 1;
    let col = x.color.map((v) => 1 - (1 - v) * frac);
    if (x.anode.f === 'I₂') col = [1 - Math.min(0.6, e.gasA * 400), 0.94 - Math.min(0.55, e.gasA * 500), 1 - Math.min(0.85, e.gasA * 900)];
    beaker(c, 200, 200, 360, 260, rgb(col));
    label(c, x.label, 380, 490, '#9aa7b8', 12);
    // electrodes
    const ex = [300, 460];
    const cathColor = x.cathode.kind === 'metal' && e.metal > 1e-4 ? x.cathode.color : x.key === 'CuSO4_Cu' ? '#c8743f' : '#3a3a3a';
    const anColor = x.anode.kind === 'dissolve' ? '#c8743f' : e.key === 'H2SO4' ? '#d8dadc' : '#3a3a3a';
    c.fillStyle = e.key === 'CuSO4_Cu' ? '#c8743f' : e.key === 'H2SO4' ? '#d8dadc' : '#3a3a3a';
    c.fillRect(ex[0] - 8, 150, 16, 280);
    if (x.cathode.kind === 'metal') { c.fillStyle = x.cathode.color; const th = Math.min(8, e.metal * 30); c.fillRect(ex[0] - 8 - th, 290, 16 + 2 * th, 140); }
    c.fillStyle = anColor;
    const anW = x.anode.kind === 'dissolve' ? Math.max(4, 16 - (e.Q / F / 2) * 63.55 * 2) : 16;
    c.fillRect(ex[1] - anW / 2, 150, anW, 280);
    label(c, 'cathode (−)', ex[0] - 16, 205, '#93c5fd', 12, 'right'); label(c, 'anode (+)', ex[1] + 16, 205, '#fca5a5', 12, 'left');
    // inverted gas-collection tubes, filled with electrolyte, standing in the liquid
    const tube = (xx, mol, name, side) => {
      const vol = mol * MOLAR_VOL * 1000;    // cm³
      const top = 225, bot = 440, cap = 50;  // the tube holds 50 cm³
      c.fillStyle = rgb(col, 0.9); c.fillRect(xx - 15, top, 30, bot - top);
      const h = Math.min(bot - top - 4, (vol / cap) * (bot - top));
      c.fillStyle = name === 'Cl₂' ? 'rgba(200,240,120,0.75)' : 'rgba(15,21,32,0.92)';
      c.fillRect(xx - 15, top, 30, h);
      c.strokeStyle = 'rgba(220,235,255,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(xx - 16, bot); c.lineTo(xx - 16, top + 10); c.quadraticCurveTo(xx - 16, top, xx, top); c.quadraticCurveTo(xx + 16, top, xx + 16, top + 10); c.lineTo(xx + 16, bot); c.stroke();
      label(c, `${name}: ${vol.toFixed(1)} cm³`, xx + (side < 0 ? -22 : 22), top + 14, '#e6edf3', 12, side < 0 ? 'right' : 'left');
      for (let i = 0; i < 8; i++) { if (!e.on || e.I <= 0) break; const yy = bot - 10 - ((st.anim * 80 + i * 30) % Math.max(10, bot - top - h - 12)); c.beginPath(); c.arc(xx - 6 + (i % 3) * 6, yy, 2.2, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke(); }
    };
    if (x.cathode.kind === 'gas' || e.h2After > 0) tube(ex[0], x.cathode.kind === 'gas' ? e.gasC : e.h2After, 'H₂', -1);
    if (x.anode.kind === 'gas') tube(ex[1], e.gasA, x.anode.f, 1);
    // power supply
    c.strokeStyle = '#94a3b8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(ex[0], 150); c.lineTo(ex[0], 60); c.lineTo(340, 60); c.moveTo(420, 60); c.lineTo(ex[1], 60); c.lineTo(ex[1], 150); c.stroke();
    c.fillStyle = '#111827'; c.strokeStyle = '#475569'; c.lineWidth = 2; c.beginPath(); c.roundRect(340, 30, 80, 60, 8); c.fill(); c.stroke();
    label(c, `${e.V.toFixed(1)} V`, 380, 58, '#9fe870', 18); label(c, `${e.I.toFixed(2)} A`, 380, 80, '#fbbf24', 12);
    label(c, '−', 352, 24, '#93c5fd', 14); label(c, '+', 408, 24, '#ef4444', 14);
    if (e.on && e.I <= 0) label(c, `Below the decomposition voltage (${x.Ed.toFixed(2)} V): no electrolysis`, 380, 190, '#fbbf24', 13);
  }

  /* ---------------- report ---------------- */
  function report() {
    const nd = nernstData();
    if (!nd && !st.e.runs.length) { toast('Record some voltmeter readings (or an electrolysis run) first'); return null; }
    const sections = [];
    let score = 0, max = 0;
    const fb = [];
    if (nd) {
      const readingsTbl = LabsHub.table(['Left', '[left] / M', 'Right', '[right] / M', 'T / °C', 'E / V'], st.readings.map((r) => [HALF[r.L].label, r.cL.toPrecision(3), HALF[r.R].label, r.cR.toPrecision(3), r.T, r.E.toFixed(3)]));
      const xs = nd.pts.map((p) => p[0]);
      const x0 = Math.min(-1, ...xs) - 0.5, x1 = Math.max(1, ...xs) + 0.5;
      const img = LabPlot.toImage({ x: { label: 'log₁₀ Q', min: x0, max: x1 }, y: { label: 'E / V' },
        series: [{ pts: [[x0, nd.E0 - (nd.k / nd.N) * x0], [x1, nd.E0 - (nd.k / nd.N) * x1]], color: '#6b7280', dash: [4, 3], width: 1.3, label: 'Nernst equation' },
          ...(nd.fit ? [{ pts: [[x0, nd.fit.b + nd.fit.m * x0], [x1, nd.fit.b + nd.fit.m * x1]], color: '#0e7490', width: 1.5, label: 'your best fit' }] : []),
          { pts: nd.pts, color: '#0e7490', dots: true, r: 4 }] });
      sections.push({ h: 'Aim', html: '<p>To measure the EMF of galvanic cells and test the Nernst equation, E = E° − (0.0592/n)·log₁₀Q at 25 °C.</p>' });
      sections.push({ h: 'Readings', html: readingsTbl });
      sections.push({ h: 'Nernst plot', html: LabsHub.img(img, 'E against log Q') + `<p>Cell: ${HALF[nd.a].metal} anode, ${HALF[nd.c].metal} cathode, ${nd.T} °C, n = ${nd.N}. Theory: intercept E° = ${nd.E0.toFixed(3)} V, slope −${(nd.k / nd.N).toFixed(4)} V.</p>`
        + (nd.fit ? `<p>Your best fit: intercept ${nd.fit.b.toFixed(3)} V, slope ${nd.fit.m.toFixed(4)} V (r² = ${nd.fit.r2.toFixed(3)}).</p>` : '<p class="dim">Only one reading: record several concentrations for a line.</p>') });
      const a = st.answers;
      max += 30;
      if (a.e0 !== undefined) { const ok = Math.abs(a.e0 - 1.10) <= 0.02; score += ok ? 10 : 0; fb.push(LabsHub.verdict(ok, `E°(Daniell) = ${a.e0} V (expected +1.10 V = 0.34 − (−0.76))`)); }
      else fb.push(LabsHub.verdict(false, 'E°cell of the Daniell cell not answered'));
      const wantSlope = nd.fit ? nd.fit.m : -(nd.k / nd.N);
      if (a.slope !== undefined) { const ok = Math.abs(a.slope - wantSlope) <= Math.abs(wantSlope) * 0.1 + 0.002; score += ok ? 10 : 0; fb.push(LabsHub.verdict(ok, `Slope ${a.slope} V (your data give ${wantSlope.toFixed(4)} V; theory −${(nd.k / nd.N).toFixed(4)} V)`)); }
      else fb.push(LabsHub.verdict(false, 'Slope not answered'));
      if (a.n !== undefined) { const ok = a.n === nd.N; score += ok ? 10 : 0; fb.push(LabsHub.verdict(ok, `n = ${a.n} (expected ${nd.N}: slope = −0.0592/n)`)); }
      else fb.push(LabsHub.verdict(false, 'n not answered'));
    }
    if (st.e.runs.length) {
      sections.push({ h: 'Electrolysis', html: LabsHub.table(['Electrolyte', 'V / V', 'I / A', 't / s', 'Q / C', 'Cathode', 'Anode'], st.e.runs.map((r) => [esc(r.label), r.V.toFixed(1), r.I.toFixed(3), r.t.toFixed(0), r.Q.toFixed(0), r.cath, r.an])) });
      const cuRun = [...st.e.runs].reverse().find((r) => r.cuMass !== null);
      if (cuRun) {
        const theory = (cuRun.Q / F / 2) * 63.55;
        sections.push({ h: 'Faraday’s law', html: LabsHub.calc([`Q = I × t = ${cuRun.I.toFixed(3)} A × ${cuRun.t.toFixed(0)} s = ${cuRun.Q.toFixed(0)} C`, `n(e⁻) = Q / F = ${(cuRun.Q / F).toExponential(3)} mol`, `n(Cu) = n(e⁻) / 2 = ${(cuRun.Q / F / 2).toExponential(3)} mol`, `m(Cu) = n × 63.55 = ${theory.toFixed(4)} g   (deposited: ${cuRun.cuMass.toFixed(4)} g)`]) });
        max += 20;
        if (st.answers.cu !== undefined) { const ok = LabsHub.pctErr(st.answers.cu, theory) <= 2; score += ok ? 20 : 0; fb.push(LabsHub.verdict(ok, `Your predicted copper mass ${st.answers.cu} g vs Faraday’s law ${theory.toFixed(4)} g`)); }
        else fb.push(LabsHub.verdict(false, 'Copper mass question not answered'));
      }
    }
    sections.push({ h: 'Feedback', html: fb.join('') || '<p class="dim">No questions answered.</p>' });
    sections.push({ h: 'Evaluation', html: `<ul><li>Real cells show a lower voltage than calculated when current flows: the <b>internal resistance</b> (mostly the salt bridge) loses I·r. A high-resistance voltmeter avoids this.</li>
      <li>The Nernst equation uses <b>activities</b>; at high concentration activity coefficients are below 1, so measured slopes and E° values differ slightly from ideal.</li>
      <li>Metal surfaces must be <b>clean</b> (sand them); oxide layers (especially on Al and Mg) make the measured voltage much lower than E° predicts.</li>
      <li>In electrolysis, <b>overpotential</b> raises the voltage needed for gases such as O₂ and H₂, which is why the decomposition voltage is above the E° difference.</li></ul>` });
    return { title: 'Electrochemistry: galvanic cells and electrolysis', subtitle: nd ? `${HALF[nd.a].metal} | ${HALF[nd.c].metal} cell` : 'electrolysis', score: max ? Math.round((score / max) * 100) : undefined, sections };
  }

  LabsHub.add({ id: 'galvanic', icon: '⚡', title: 'Galvanic cells & electrolysis', blurb: 'Build cells from ten half-cells, watch electrons and ions move, test the Nernst equation, run electrolysis with Faraday’s law.', topics: ['E° and cell notation', 'Nernst equation', 'salt bridge', 'ΔG = −nFE', 'Faraday’s law'], mount, unmount, report });

  return { HALF, ELECTROLYTES, electrodeE, cellE, overall, halfEq, get state() { return st; }, stepCell, stepElec, cellNow, record, recordElec, setMode, refresh };
})();
