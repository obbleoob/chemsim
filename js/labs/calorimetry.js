/* ============================================================================
   ChemSim · labs/calorimetry.js
   ----------------------------------------------------------------------------
   Coffee-cup calorimetry. A lidded polystyrene cup is an independent
   simulated beaker (createBeakerSim) with a small heat capacity and slow heat
   loss, so the temperature change comes from the same Hess's-law enthalpy
   model as the Beaker Lab, and heat really leaks away during the experiment.

   Method (as in a school lab):
     • A data logger records the temperature every 5 s.
     • Record a steady starting temperature for ~1 minute, then mix.
     • Keep recording for several minutes after the peak.
     • Extrapolate the cooling (or warming) line back to the moment of mixing
       to correct for heat lost while the reaction was happening.
     • q = (m·c + C_cal)·ΔT, ΔH = −q / n.
   A calibration run (hot + cold water) measures the cup's own heat
   capacity C_cal.
   ============================================================================ */
'use strict';

const CalorimetryLab = (() => {
  const D = BeakerData;
  const CUP_CP = 18;            // J/K: true heat capacity of cup + thermometer + stirrer (to be found by calibration)
  const LOSS_K = 0.03;          // W/K: heat loss through the lid and walls
  const LOG_EVERY = 5;          // s between data-logger readings
  const C_WATER = 4.18;         // J g⁻¹ K⁻¹

  /* ---------------- experiments ----------------
     setup: what goes into the cup first; add: what is added at "mix".
     n(params): moles for ΔH; per: what ΔH is per; lit: accepted value (kJ/mol, CRC). */
  const SALTS = {
    NH4NO3: { shelf: 's_NH4NO3', label: 'ammonium nitrate, NH₄NO₃', M: 80.04, lit: 25.7 },
    NaOH: { shelf: 's_NaOH', label: 'sodium hydroxide, NaOH', M: 40.00, lit: -44.5 },
    KNO3: { shelf: 's_KNO3', label: 'potassium nitrate, KNO₃', M: 101.10, lit: 34.9 },
    NH4Cl: { shelf: 's_NH4Cl', label: 'ammonium chloride, NH₄Cl', M: 53.49, lit: 14.8 },
    CaCl2: { shelf: 's_CaCl2', label: 'calcium chloride, CaCl₂', M: 110.98, lit: -81.3 },
    NaCl: { shelf: 's_NaCl', label: 'sodium chloride, NaCl', M: 58.44, lit: 3.9 },
  };
  const ACIDS = {
    HCl: { shelf: 'HCl1', label: 'hydrochloric acid 1.0 M', base: 'NaOH1', baseLabel: 'sodium hydroxide 1.0 M', lit: -55.8, eq: 'H⁺(aq) + OH⁻(aq) → H₂O(l)' },
    HNO3: { shelf: 'HNO3', label: 'nitric acid 1.0 M', base: 'NaOH1', baseLabel: 'sodium hydroxide 1.0 M', lit: -55.8, eq: 'H⁺(aq) + OH⁻(aq) → H₂O(l)' },
    HAc: { shelf: 'HAc', label: 'ethanoic acid 1.0 M', base: 'NaOH1', baseLabel: 'sodium hydroxide 1.0 M', lit: -55.9, eq: 'CH₃COOH(aq) + OH⁻(aq) → CH₃COO⁻(aq) + H₂O(l)' },
    NH3: { shelf: 'HCl1', label: 'hydrochloric acid 1.0 M', base: 'NH3', baseLabel: 'ammonia 1.0 M', lit: -52.2, eq: 'NH₃(aq) + H⁺(aq) → NH₄⁺(aq)' },
  };
  const EXPTS = {
    calib: { name: 'Calibrate the calorimeter (hot + cold water)', icon: '🎯' },
    dissolve: { name: 'Enthalpy of solution of a salt', icon: '🧂' },
    neutral: { name: 'Enthalpy of neutralisation', icon: '⚖️' },
    displace: { name: 'Zinc + copper(II) sulfate (displacement)', icon: '🔁', lit: -218.7, eq: 'Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s)' },
    mg: { name: 'Magnesium + hydrochloric acid', icon: '🫧', lit: -466.9, eq: 'Mg(s) + 2H⁺(aq) → Mg²⁺(aq) + H₂(g)' },
  };

  const WATER = { id: 'cal_water', name: 'distilled water', kind: 'solution', c: {} };
  const hotWater = (T) => ({ id: 'cal_hot', name: `water at ${T.toFixed(1)} °C`, kind: 'solution', c: {}, T });
  const ZN_POWDER = { id: 'cal_zn', name: 'zinc powder', kind: 'metal', key: 'Zn', areaFactor: 10 };

  /* ---------------- state ---------------- */
  let el = null, cv = null, plotCv = null, raf = 0, last = 0;
  let st = null;

  function newState() {
    return {
      expt: 'neutral', salt: 'NH4NO3', saltG: 4.0, acid: 'HCl', vol: 50, hotT: 45.0, znG: 2.0, mgG: 0.20,
      speed: 10, run: null, runs: [], calib: null, answers: {}, anim: 0,
    };
  }

  function makeCup() {
    const cup = createBeakerSim({ vesselCp: CUP_CP, lossK: LOSS_K, maxML: 220, quiet: true });
    cup.reset({ waterML: 0.001 });
    cup.state.stir = true;
    return cup;
  }

  /** Begin a run: fill the cup with the first reagent and start logging. */
  function startRun() {
    const cup = makeCup();
    const e = st.expt, p = { ...st };
    if (e === 'calib') cup.add(WATER, p.vol);
    if (e === 'dissolve') cup.add(WATER, p.vol);
    if (e === 'neutral') cup.add(D.SHELF.find((x) => x.id === ACIDS[p.acid].shelf), p.vol);
    if (e === 'displace') cup.add(D.SHELF.find((x) => x.id === 'CuSO4sol'), p.vol);
    if (e === 'mg') cup.add(D.SHELF.find((x) => x.id === 'HCl1'), p.vol);
    cup.state.T = 20;     // everything starts at room temperature
    st.run = { expt: e, params: p, cup, t: 0, data: [[0, reading(cup)]], tMix: null, mixed: false, stopped: false, nextLog: LOG_EVERY };
    log('labs', `Calorimetry run started: ${e}`);
  }
  const reading = (cup) => Math.round((cup.state.T + (Math.random() - 0.5) * 0.04) * 10) / 10;   // ±0.1 °C logger

  /** Mix: add the second reagent at the current time. */
  function mix() {
    const r = st.run;
    if (!r || r.mixed) return;
    const p = r.params, cup = r.cup;
    r.data.push([r.t, reading(cup)]);            // last reading before mixing
    if (r.expt === 'calib') cup.add(hotWater(p.hotT), p.vol);
    if (r.expt === 'dissolve') cup.add(D.SHELF.find((x) => x.id === SALTS[p.salt].shelf), p.saltG);
    if (r.expt === 'neutral') cup.add(D.SHELF.find((x) => x.id === ACIDS[p.acid].base), p.vol);
    if (r.expt === 'displace') cup.add(ZN_POWDER, p.znG);
    if (r.expt === 'mg') cup.add(D.SHELF.find((x) => x.id === 'm_Mg'), p.mgG);
    r.mixed = true; r.tMix = r.t;
    log('labs', `Mixed at t = ${r.t.toFixed(0)} s`);
  }

  function stop() {
    const r = st.run;
    if (!r) return;
    if (!r.mixed) { toast('Mix the reagents before stopping'); return; }
    r.stopped = true;
    r.analysis = analyse(r);
    st.runs.push(r);
    if (r.expt === 'calib' && r.analysis) st.calib = calibResult(r);
    st.lastCup = r.cup;
    st.run = null;
    toast('Run saved. Read off ΔT from the graph and do the calculation.');
    renderRuns(); renderQuestions(); setButtons();
  }

  /* ---------------- analysis ---------------- */
  /** Starting temperature, extremum, and the cooling line extrapolated back to the mixing time. */
  function analyse(r) {
    const pre = r.data.filter(([t]) => t <= r.tMix + 1e-9);
    const post = r.data.filter(([t]) => t > r.tMix);
    if (post.length < 6) return null;
    const T0 = pre.reduce((a, [, T]) => a + T, 0) / pre.length;
    const up = post.reduce((m, p) => Math.abs(p[1] - T0) > Math.abs(m[1] - T0) ? p : m, post[0]);
    const after = post.filter(([t]) => t >= up[0] + 30);
    const fit = after.length >= 4 ? LabPlot.linfit(after) : null;
    const Tex = fit ? fit.m * r.tMix + fit.b : up[1];
    return { T0, Tpeak: up[1], tPeak: up[0], fit, Tex, dTraw: up[1] - T0, dT: Tex - T0 };
  }
  /** C_cal from a hot + cold water run: heat lost by hot water = heat gained by cold water + cup. */
  function calibResult(r) {
    const a = r.analysis, p = r.params;
    const Tm = a.Tex;
    const lost = p.vol * C_WATER * (p.hotT - Tm), gained = p.vol * C_WATER * (Tm - a.T0);
    return { C: (lost - gained) / (Tm - a.T0), Tm, T0: a.T0, hot: p.hotT, vol: p.vol };
  }

  /** Amount (mol) the ΔH refers to, and what it is per. */
  function amount(r) {
    const p = r.params;
    if (r.expt === 'dissolve') return { n: p.saltG / SALTS[p.salt].M, per: `mol of ${p.salt}`, lit: SALTS[p.salt].lit, eq: `${p.salt}(s) → ions(aq)` };
    if (r.expt === 'neutral') return { n: (p.vol / 1000) * 1.0, per: 'mol of water formed', lit: ACIDS[p.acid].lit, eq: ACIDS[p.acid].eq };
    if (r.expt === 'displace') return { n: Math.min((p.vol / 1000) * 0.5, p.znG / 65.38), per: 'mol of Cu²⁺ (limiting)', lit: EXPTS.displace.lit, eq: EXPTS.displace.eq };
    if (r.expt === 'mg') return { n: Math.min(p.mgG / 24.31, (p.vol / 1000) * 1.0 / 2), per: 'mol of Mg', lit: EXPTS.mg.lit, eq: EXPTS.mg.eq };
    return null;
  }
  /** Mass of liquid heated (g), density 1.00 g/mL. */
  const liquidMass = (r) => (r.expt === 'calib' || r.expt === 'neutral' ? 2 * r.params.vol : r.params.vol);

  /* ---------------- UI ---------------- */
  function mount(container) {
    el = container;
    st = newState();
    el.innerHTML = `
      <div class="lab-grid">
        <aside class="panel lab-left">
          <div class="card"><h2>Experiment</h2>
            <select id="c-expt">${Object.entries(EXPTS).map(([k, x]) => `<option value="${k}"${k === st.expt ? ' selected' : ''}>${x.icon} ${x.name}</option>`).join('')}</select>
            <div id="c-params"></div></div>
          <div class="card"><h2>Procedure</h2><ol class="steps" id="c-steps"></ol>
            <div class="btn-row">
              <button class="hbtn small" id="c-start" data-tip="Put the first reagent in the cup and start the data logger">▶ Start logging</button>
              <button class="hbtn small accent" id="c-mix" data-tip="Add the second reagent, replace the lid and stir">⤵ Mix</button>
              <button class="hbtn small" id="c-stop" data-tip="Stop logging and save this run">■ Stop</button>
            </div>
            <label class="ctl" data-tip="Speed up time (a run takes several minutes)">⏩ <select id="c-speed"><option value="1">1×</option><option value="5">5×</option><option value="10" selected>10×</option><option value="30">30×</option></select></label>
          </div>
          <div class="card"><h2>Runs</h2><div id="c-runs" class="small"></div></div>
        </aside>
        <section class="lab-center"><canvas id="c-canvas" aria-label="Polystyrene-cup calorimeter"></canvas>
          <div class="lab-status" id="c-status"></div></section>
        <aside class="panel lab-right">
          <div class="card"><h2>Temperature–time graph</h2><canvas id="c-plot" class="plot tall"></canvas>
            <div class="small dim" id="c-an"></div></div>
          <div class="card"><h2>Calculate</h2><div id="c-q"></div></div>
        </aside>
      </div>`;
    cv = el.querySelector('#c-canvas');
    plotCv = el.querySelector('#c-plot');
    el.querySelector('#c-expt').addEventListener('change', (e) => { if (st.run && !confirm('Abandon the current run?')) { e.target.value = st.expt; return; } st.run = null; st.expt = e.target.value; renderParams(); setButtons(); });
    el.querySelector('#c-start').addEventListener('click', () => { startRun(); setButtons(); });
    el.querySelector('#c-mix').addEventListener('click', () => { mix(); setButtons(); });
    el.querySelector('#c-stop').addEventListener('click', stop);
    el.querySelector('#c-speed').addEventListener('change', (e) => { st.speed = Number(e.target.value); });
    renderParams(); renderRuns(); renderQuestions(); setButtons();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); raf = 0; el = null; }

  function renderParams() {
    const e = st.expt;
    const num = (id, label, val, step, unit) => `<label class="field">${label}<span class="input-row"><input type="number" id="${id}" value="${val}" step="${step}" min="0" /><span class="dim">${unit}</span></span></label>`;
    let h = '';
    if (e === 'calib') h = num('p-vol', 'Cold water in the cup (room temp.)', st.vol, 5, 'mL') + num('p-hot', 'Hot water added (same volume) at', st.hotT, 0.5, '°C')
      + '<p class="small dim">The hot water loses heat; the cold water <i>and the cup</i> gain it. The difference tells you the cup’s heat capacity C<sub>cal</sub>.</p>';
    if (e === 'dissolve') h = `<label class="field">Salt<select id="p-salt">${Object.entries(SALTS).map(([k, s]) => `<option value="${k}"${k === st.salt ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>` + num('p-g', 'Mass of salt', st.saltG, 0.5, 'g') + num('p-vol', 'Water', st.vol, 5, 'mL');
    if (e === 'neutral') h = `<label class="field">Reaction<select id="p-acid">${Object.entries(ACIDS).map(([k, a]) => `<option value="${k}"${k === st.acid ? ' selected' : ''}>${a.label} + ${a.baseLabel}</option>`).join('')}</select></label>` + num('p-vol', 'Volume of each solution', st.vol, 5, 'mL');
    if (e === 'displace') h = num('p-vol', '0.50 M copper(II) sulfate', st.vol, 5, 'mL') + num('p-zn', 'Zinc powder (in excess)', st.znG, 0.5, 'g');
    if (e === 'mg') h = num('p-vol', '1.0 M hydrochloric acid', st.vol, 5, 'mL') + num('p-mg', 'Magnesium ribbon', st.mgG, 0.05, 'g');
    el.querySelector('#c-params').innerHTML = h;
    const bind = (id, key, lo, hi) => { const i = el.querySelector(id); if (i) i.addEventListener('input', () => { const v = Number(i.value); if (v >= lo && v <= hi) st[key] = v; }); };
    bind('#p-vol', 'vol', 10, 100); bind('#p-hot', 'hotT', 25, 70); bind('#p-g', 'saltG', 0.1, 20); bind('#p-zn', 'znG', 0.2, 10); bind('#p-mg', 'mgG', 0.02, 1);
    const sel = (id, key) => { const i = el.querySelector(id); if (i) i.addEventListener('change', () => { st[key] = i.value; }); };
    sel('#p-salt', 'salt'); sel('#p-acid', 'acid');
    renderSteps();
  }

  function renderSteps() {
    const r = st.run;
    const steps = [
      ['Choose the experiment and amounts', true],
      ['Start the logger; record a steady starting temperature (≥ 1 min)', !!r && (r.t >= 60 || r.mixed)],
      ['Mix, replace the lid, keep stirring', !!r && r.mixed],
      ['Keep logging ≥ 4 minutes after the peak, then stop', st.runs.some((x) => x.expt === st.expt)],
      ['Extrapolate back to the mixing time to find ΔT, then calculate', false],
    ];
    el.querySelector('#c-steps').innerHTML = steps.map(([t, done], i) => `<li class="${done ? 'done' : !done && steps.slice(0, i).every((s) => s[1]) ? 'current' : ''}">${t}</li>`).join('');
  }

  function setButtons() {
    const r = st.run;
    el.querySelector('#c-start').disabled = !!r;
    el.querySelector('#c-mix').disabled = !r || r.mixed;
    el.querySelector('#c-stop').disabled = !r || !r.mixed;
    el.querySelector('#c-expt').disabled = false;
    el.querySelectorAll('#c-params input, #c-params select').forEach((i) => { i.disabled = !!r; });
    renderSteps();
  }

  function renderRuns() {
    el.querySelector('#c-runs').innerHTML = st.runs.map((r, i) => {
      const a = r.analysis;
      return `<div class="run-row"><b>${i + 1}.</b> ${EXPTS[r.expt].icon} ${EXPTS[r.expt].name.split('(')[0]} ${a ? `ΔT ≈ ${a.dT >= 0 ? '+' : ''}${a.dT.toFixed(1)} K` : '(too short)'}</div>`;
    }).join('') + (st.calib ? `<div class="ok">C<sub>cal</sub> from calibration: ${st.calib.C.toFixed(0)} J/K</div>` : '<div class="dim">No calibration yet (C<sub>cal</sub> = 0 assumed)</div>');
  }

  function renderQuestions() {
    const r = [...st.runs].reverse().find((x) => x.expt !== 'calib');
    const box = el.querySelector('#c-q');
    if (!r) { box.innerHTML = '<p class="small dim">Finish a measurement run (not the calibration) to calculate ΔH.</p>'; return; }
    const am = amount(r);
    box.innerHTML = `<p class="small">Latest run: <b>${EXPTS[r.expt].name}</b>. ΔH is per ${am.per} (n = ${am.n.toFixed(4)} mol).</p>
      <label class="field">ΔT from your graph (extrapolated) / K<input type="number" step="any" data-q="dT" value="${st.answers.dT ?? ''}" /></label>
      <label class="field">Heat q / J<input type="number" step="any" data-q="q" value="${st.answers.q ?? ''}" /></label>
      <label class="field">ΔH / kJ mol⁻¹ (include the sign)<input type="number" step="any" data-q="dH" value="${st.answers.dH ?? ''}" /></label>
      <details class="small hint"><summary>Hint</summary>q = (m × 4.18 + C<sub>cal</sub>) × ΔT with m = ${liquidMass(r)} g (1.00 g/mL)${st.calib ? ` and C<sub>cal</sub> = ${st.calib.C.toFixed(0)} J/K from your calibration` : ''}.<br/>ΔH = −q / n ÷ 1000. A temperature rise means an exothermic reaction (ΔH negative).</details>`;
    box.querySelectorAll('[data-q]').forEach((i) => i.addEventListener('input', () => { st.answers[i.dataset.q] = i.value === '' ? undefined : Number(i.value); }));
  }

  /* ---------------- loop & drawing ---------------- */
  let uiTimer = 0;
  function loop(now) {
    if (!el) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    st.anim += dt;
    const r = st.run;
    if (r) {
      let simDt = dt * st.speed;
      while (simDt > 1e-9) {
        const h = Math.min(0.1, simDt);
        r.cup.tick(h); r.t += h; simDt -= h;
        if (r.t >= r.nextLog) { r.data.push([r.nextLog, reading(r.cup)]); r.nextLog += LOG_EVERY; }
      }
      if (r.t > 1800 && r.mixed) { stop(); toast('Logger stopped automatically at 30 minutes'); }
    }
    uiTimer += dt;
    if (uiTimer > 0.25) { uiTimer = 0; drawPlot(); status(); renderSteps(); }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function status() {
    const r = st.run;
    el.querySelector('#c-status').textContent = r ? `t = ${Math.floor(r.t / 60)}:${String(Math.floor(r.t % 60)).padStart(2, '0')} · ${r.cup.state.T.toFixed(1)} °C${r.mixed ? '' : ' · waiting to mix'}` : st.runs.length ? 'Run saved. Start another, or write the report.' : 'Press ▶ Start logging.';
  }

  function drawPlot() {
    const r = st.run || st.runs[st.runs.length - 1];
    if (!r) { LabPlot.draw(plotCv, { x: { label: 'time / s', min: 0, max: 600 }, y: { label: 'T / °C', min: 15, max: 30 }, series: [] }); el.querySelector('#c-an').textContent = ''; return; }
    const series = [{ pts: r.data, color: '#22d3ee', dots: true, r: 2.2 }];
    const a = r.stopped ? r.analysis : null;
    const vlines = r.tMix !== null ? [{ x: r.tMix, color: '#fbbf24', label: 'mix' }] : [];
    if (a && a.fit) {
      const tEnd = r.data[r.data.length - 1][0];
      series.push({ pts: [[r.tMix, a.fit.m * r.tMix + a.fit.b], [tEnd, a.fit.m * tEnd + a.fit.b]], color: '#f472b6', dash: [5, 4], width: 1.5, label: 'extrapolated cooling line' });
      series.push({ pts: [[0, a.T0], [r.tMix, a.T0]], color: '#94a3b8', dash: [3, 3], width: 1.2, label: 'starting temperature' });
    }
    const tMax = Math.max(300, Math.ceil(r.data[r.data.length - 1][0] / 60) * 60);
    LabPlot.draw(plotCv, { x: { label: 'time / s', min: 0, max: tMax }, y: { label: 'T / °C' }, series, vlines, legendLeft: true });
    el.querySelector('#c-an').innerHTML = a ? `T<sub>start</sub> = ${a.T0.toFixed(2)} °C · peak ${a.Tpeak.toFixed(1)} °C (ΔT<sub>raw</sub> ${a.dTraw.toFixed(2)} K) · extrapolated to the mixing time: ${a.Tex.toFixed(2)} °C` : 'The pink line (after you stop) extrapolates the cooling back to the mixing time.';
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const k = Math.min(W / 520, H / 560);
    c.save(); c.translate((W - 520 * k) / 2, (H - 560 * k) / 2); c.scale(k, k);
    const r = st.run;
    const cup = r ? r.cup : st.lastCup || null;
    // outer beaker for stability
    c.strokeStyle = 'rgba(220,235,255,0.35)'; c.lineWidth = 2;
    c.strokeRect(110, 210, 300, 290);
    // two nested polystyrene cups
    const cupPath = (inset) => { c.beginPath(); c.moveTo(150 + inset, 180); c.lineTo(370 - inset, 180); c.lineTo(345 - inset, 480); c.lineTo(175 + inset, 480); c.closePath(); };
    cupPath(0); c.fillStyle = '#e8e6df'; c.fill();
    cupPath(10); c.fillStyle = '#f5f3ee'; c.fill();
    // liquid
    if (cup && cup.state.V > 0.002) {
      const frac = Math.min(1, cup.state.V / 0.2);
      const top = 470 - frac * 270;
      const col = cup.liquidColor();
      c.save(); cupPath(12); c.clip();
      c.fillStyle = `rgba(${col.map((v) => Math.round(v * 230)).join(',')},0.95)`;
      c.fillRect(150, top, 230, 480 - top);
      // bubbles (Mg + acid) and fizz
      if (cup.state.bubbles > 1e-6) for (let i = 0; i < 14; i++) { const yy = 470 - ((st.anim * 90 + i * 37) % (470 - top)); c.beginPath(); c.arc(200 + (i * 29) % 120, yy, 2 + (i % 3), 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke(); }
      // undissolved solid / metal powder
      const solid = cup.crystals().reduce((a, x) => a + x.g, 0) + cup.state.lumps.reduce((a, l) => a + l.n * (l.kind === 'metal' ? D.METALS[l.key].M : 1), 0);
      if (solid > 0.01) { c.fillStyle = cup.state.lumps.some((l) => l.key === 'Zn' && l.n > 1e-5) ? '#8d939b' : '#ffffff'; c.fillRect(185, 470 - Math.min(12, solid * 3), 150, Math.min(12, solid * 3)); }
      const cu = cup.state.lumps.reduce((a, l) => a + (l.coat.Cu || 0), 0);
      if (cu > 1e-5) { c.fillStyle = '#9b4e24'; c.fillRect(190, 466, 140, 6); }
      c.restore();
    }
    // lid, thermometer, stirrer
    c.fillStyle = '#d6d3ca'; c.fillRect(140, 168, 240, 14);
    c.fillStyle = '#9aa7b8'; c.fillRect(300, 60, 6, 400);
    c.fillStyle = '#ef4444'; c.beginPath(); c.arc(303, 462, 7, 0, Math.PI * 2); c.fill();
    const stirY = 30 * Math.sin(st.anim * 3);
    c.strokeStyle = '#cbd5e1'; c.lineWidth = 3; c.beginPath(); c.moveTo(230, 120 + stirY * 0.3); c.lineTo(230, 450 + stirY * 0.3); c.moveTo(210, 450 + stirY * 0.3); c.lineTo(250, 450 + stirY * 0.3); c.stroke();
    // data logger box
    c.fillStyle = '#111827'; c.strokeStyle = '#3b4a63'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(340, 50, 150, 80, 8); c.fill(); c.stroke();
    c.fillStyle = '#9fe870'; c.font = 'bold 28px "JetBrains Mono", monospace'; c.textAlign = 'center';
    c.fillText(r ? `${reading(r.cup).toFixed(1)}` : '--.-', 415, 96);
    c.font = '11px Inter, sans-serif'; c.fillStyle = '#9aa7b8'; c.fillText(r ? `°C · logging every ${LOG_EVERY} s` : '°C · logger off', 415, 118);
    c.strokeStyle = '#475569'; c.beginPath(); c.moveTo(340, 90); c.quadraticCurveTo(310, 80, 306, 60); c.stroke();
    c.fillStyle = '#9aa7b8'; c.font = '12px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText('two nested polystyrene cups with a lid', 260, 525);
    c.restore();
  }

  /* ---------------- report ---------------- */
  function report() {
    const meas = st.runs.filter((r) => r.expt !== 'calib' && r.analysis);
    if (!meas.length && !st.calib) { toast('Finish at least one run first (start, mix, then stop after the peak)'); return null; }
    const sections = [];
    const fb = [];
    let score = 0, max = 0;
    sections.push({ h: 'Aim', html: '<p>To measure enthalpy changes with a polystyrene-cup calorimeter, correcting for heat loss by extrapolation.</p>' });
    if (st.calib) {
      const c = st.calib;
      sections.push({ h: 'Calibration', html: LabsHub.calc([
        `${c.vol} mL water at ${c.T0.toFixed(2)} °C + ${c.vol} mL water at ${c.hot.toFixed(1)} °C → ${c.Tm.toFixed(2)} °C (extrapolated)`,
        `heat lost by hot water   = ${c.vol} g × 4.18 × (${c.hot.toFixed(1)} − ${c.Tm.toFixed(2)}) = ${(c.vol * C_WATER * (c.hot - c.Tm)).toFixed(0)} J`,
        `heat gained by cold water = ${c.vol} g × 4.18 × (${c.Tm.toFixed(2)} − ${c.T0.toFixed(2)}) = ${(c.vol * C_WATER * (c.Tm - c.T0)).toFixed(0)} J`,
        `C_cal = difference ÷ ΔT(cold) = ${c.C.toFixed(1)} J/K   (true value in this simulation: ${CUP_CP} J/K)`,
      ]) });
    }
    meas.forEach((r, i) => {
      const a = r.analysis, am = amount(r);
      const m = liquidMass(r), Ccal = st.calib ? st.calib.C : 0;
      const q = (m * C_WATER + Ccal) * a.dT;
      const dH = -q / am.n / 1000;
      const qRaw = (m * C_WATER + Ccal) * a.dTraw;
      const img = LabPlot.toImage({ x: { label: 'time / s', min: 0, max: r.data[r.data.length - 1][0] }, y: { label: 'T / °C' }, legendLeft: true,
        series: [{ pts: r.data, color: '#0e7490', dots: true, r: 2 },
          ...(a.fit ? [{ pts: [[r.tMix, a.Tex], [r.data[r.data.length - 1][0], a.fit.m * r.data[r.data.length - 1][0] + a.fit.b]], color: '#be185d', dash: [5, 4], width: 1.5, label: 'extrapolation' }] : [])],
        vlines: [{ x: r.tMix, color: '#d97706', label: 'mix' }] });
      sections.push({ h: `Run ${i + 1}: ${EXPTS[r.expt].name}`, html: `<p>${am.eq}</p>` + LabsHub.img(img, 'Temperature–time graph') + LabsHub.calc([
        `T(start) = ${a.T0.toFixed(2)} °C; extrapolated T at mixing = ${a.Tex.toFixed(2)} °C → ΔT = ${a.dT.toFixed(2)} K   (uncorrected peak ΔT = ${a.dTraw.toFixed(2)} K)`,
        `q = (${m} g × 4.18 J g⁻¹ K⁻¹ + ${Ccal.toFixed(0)} J/K) × ${a.dT.toFixed(2)} K = ${q.toFixed(0)} J`,
        `n = ${am.n.toFixed(4)} ${am.per}`,
        `ΔH = −q / n = ${dH.toFixed(1)} kJ/mol   (accepted ≈ ${am.lit > 0 ? '+' : ''}${am.lit} kJ/mol, error ${LabsHub.pctErr(dH, am.lit).toFixed(1)} %)`,
        `Without the extrapolation: ${(-qRaw / am.n / 1000).toFixed(1)} kJ/mol`,
      ]) });
      if (i === meas.length - 1) {
        const ans = st.answers;
        max += 3;
        if (ans.dT !== undefined) { const ok = Math.abs(ans.dT - a.dT) <= Math.max(0.2, Math.abs(a.dT) * 0.05); score += ok; fb.push(LabsHub.verdict(ok, `ΔT ${ans.dT} K (the extrapolation gives ${a.dT.toFixed(2)} K)`)); } else fb.push(LabsHub.verdict(false, 'ΔT not entered'));
        if (ans.q !== undefined) {
          const want = Math.abs((m * C_WATER + Ccal) * (ans.dT ?? a.dT)), alt = Math.abs(m * C_WATER * (ans.dT ?? a.dT));
          const ok = Math.min(LabsHub.pctErr(Math.abs(ans.q), want), LabsHub.pctErr(Math.abs(ans.q), alt)) <= 3;
          score += ok; fb.push(LabsHub.verdict(ok, `q = ${ans.q} J (with your ΔT: ${want.toFixed(0)} J${Ccal ? `, or ${alt.toFixed(0)} J without C_cal` : ''})`));
        } else fb.push(LabsHub.verdict(false, 'q not entered'));
        if (ans.dH !== undefined) {
          const signOk = Math.sign(ans.dH) === Math.sign(am.lit);
          const ok = signOk && LabsHub.pctErr(ans.dH, am.lit) <= 12;
          score += ok;
          fb.push(LabsHub.verdict(ok, `ΔH = ${ans.dH} kJ/mol vs accepted ${am.lit} kJ/mol${signOk ? ` (${LabsHub.pctErr(ans.dH, am.lit).toFixed(1)} % off)` : ': check the SIGN (temperature rise → exothermic → ΔH < 0)'}`));
        } else fb.push(LabsHub.verdict(false, 'ΔH not entered'));
      }
    });
    if (!st.calib && meas.length) fb.push(LabsHub.verdict(false, 'No calibration run: the cup’s heat capacity was ignored, so |ΔH| comes out slightly too small.'));
    sections.push({ h: 'Feedback', html: fb.join('') });
    sections.push({ h: 'Evaluation', html: `<ul>
      <li><b>Heat loss</b> to the surroundings is the biggest error: the lid, nested cups and the extrapolation all reduce it. Compare the corrected and uncorrected ΔH above.</li>
      <li><b>Heat capacity of the calorimeter</b>: the cup, stirrer and thermometer absorb heat too; the calibration measures this.</li>
      <li><b>Assumptions</b>: solutions have the density (1.00 g/mL) and specific heat (4.18 J g⁻¹ K⁻¹) of water; dissolving solids add a little mass that is often ignored.</li>
      <li><b>Thermometer resolution</b> ±0.1 °C on a ΔT of a few kelvin is a few percent: a bigger ΔT (more reagent, less water) gives a smaller percentage error.</li>
      <li><b>Incomplete reaction</b> (e.g. zinc granules instead of powder) or slow dissolving makes the peak lower and later.</li></ul>` });
    return { title: 'Calorimetry: measuring ΔH', subtitle: meas.length ? EXPTS[meas[meas.length - 1].expt].name : 'calibration', score: max ? Math.round((score / max) * 100) : undefined, sections };
  }

  LabsHub.add({ id: 'calorimetry', icon: '🌡️', title: 'Calorimetry', blurb: 'Coffee-cup calorimeter with a data logger: enthalpies of solution, neutralisation and displacement, with heat-loss correction.', topics: ['q = mcΔT', 'calibration', 'extrapolation', 'Hess’s law data', 'error analysis'], mount, unmount, report });

  return { SALTS, ACIDS, EXPTS, CUP_CP, get state() { return st; }, startRun, mix, stop, analyse, amount, liquidMass, setExpt: (e, params = {}) => { st.expt = e; Object.assign(st, params); }, simulate: (seconds) => { const r = st.run; for (let t = 0; t < seconds; t += 0.1) { r.cup.tick(0.1); r.t += 0.1; if (r.t >= r.nextLog) { r.data.push([r.nextLog, reading(r.cup)]); r.nextLog += LOG_EVERY; } } } };
})();
