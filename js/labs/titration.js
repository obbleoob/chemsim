/* ============================================================================
   ChemSim · labs/titration.js
   ----------------------------------------------------------------------------
   Acid–base titration. A pipette puts a known volume of the analyte into a
   conical flask; the titrant runs in from a 50 mL burette. The pH at every
   point comes from the Beaker Lab's equilibrium solver (BeakerSolver), so
   weak acids, weak bases, buffers and polyprotic acids all behave correctly
   without any special formulas.

   Procedure (as in a real school lab):
     1. Choose the titration and an indicator. Fill the burette.
     2. Run 1 is a quick "rough" titration to find roughly where the end point is.
     3. Further accurate runs: add dropwise near the end point, record the
        final reading. Two titres within 0.10 mL are "concordant".
     4. Calculate the concentration (and pKa for weak acids/bases from the
        half-equivalence point of the pH curve), then write the report.
   ============================================================================ */
'use strict';

const TitrationLab = (() => {
  const D = BeakerData;
  const DROP = 0.05;                 // mL per drop
  const BURETTE_MAX = 50;

  /* ---------------- the titrations on offer ----------------
     analyte/titrant: components per 1 M of the substance (as in the Beaker
     Lab's shelf). ratios: mol titrant per mol analyte at each equivalence
     point. pKa: of the weak acid (or of the conjugate acid of a weak base). */
  const PRESETS = {
    'HCl-NaOH': {
      name: 'Hydrochloric acid with sodium hydroxide', kind: 'strong acid + strong base',
      analyte: { name: 'hydrochloric acid', f: 'HCl', c: { Cl: 1 } }, titrant: { name: 'sodium hydroxide', f: 'NaOH', c: { Na: 1 } },
      ratios: [1], eqn: 'HCl + NaOH → NaCl + H₂O',
    },
    'HAc-NaOH': {
      name: 'Ethanoic acid with sodium hydroxide', kind: 'weak acid + strong base',
      analyte: { name: 'ethanoic acid', f: 'CH₃COOH', c: { Ac: 1 } }, titrant: { name: 'sodium hydroxide', f: 'NaOH', c: { Na: 1 } },
      ratios: [1], pKa: [4.76], weak: 'acid', eqn: 'CH₃COOH + NaOH → CH₃COONa + H₂O',
    },
    'NH3-HCl': {
      name: 'Ammonia with hydrochloric acid', kind: 'weak base + strong acid',
      analyte: { name: 'ammonia', f: 'NH₃', c: { NH3: 1 } }, titrant: { name: 'hydrochloric acid', f: 'HCl', c: { Cl: 1 } },
      ratios: [1], pKa: [9.25], weak: 'base', eqn: 'NH₃ + HCl → NH₄Cl',
    },
    'NaOH-HCl': {
      name: 'Sodium hydroxide with hydrochloric acid', kind: 'strong base + strong acid',
      analyte: { name: 'sodium hydroxide', f: 'NaOH', c: { Na: 1 } }, titrant: { name: 'hydrochloric acid', f: 'HCl', c: { Cl: 1 } },
      ratios: [1], eqn: 'NaOH + HCl → NaCl + H₂O',
    },
    'H3PO4-NaOH': {
      name: 'Phosphoric acid with sodium hydroxide', kind: 'polyprotic acid + strong base',
      analyte: { name: 'phosphoric acid', f: 'H₃PO₄', c: { PO4: 1 } }, titrant: { name: 'sodium hydroxide', f: 'NaOH', c: { Na: 1 } },
      ratios: [1, 2], pKa: [2.15, 7.20, 12.35], weak: 'acid', eqn: 'H₃PO₄ + NaOH → NaH₂PO₄ + H₂O, then NaH₂PO₄ + NaOH → Na₂HPO₄ + H₂O',
    },
    'Na2CO3-HCl': {
      name: 'Sodium carbonate with hydrochloric acid', kind: 'diprotic base + strong acid',
      analyte: { name: 'sodium carbonate', f: 'Na₂CO₃', c: { Na: 2, CO3: 1 } }, titrant: { name: 'hydrochloric acid', f: 'HCl', c: { Cl: 1 } },
      ratios: [1, 2], pKa: [6.35, 10.33], weak: 'base', eqn: 'Na₂CO₃ + HCl → NaHCO₃ + NaCl, then NaHCO₃ + HCl → NaCl + CO₂ + H₂O',
    },
  };
  const IND_KEYS = ['phph', 'mo', 'btb', 'univ'];
  const IND_PKA = { phph: 9.1, mo: 3.7, btb: 7.0 };

  /* ---------------- chemistry ---------------- */
  /** pH after adding Vt mL of titrant (conc cT) to Va mL of analyte (conc cA). */
  function computePH(p, cA, Va, cT, Vt, warm) {
    const V = Va + Vt;
    const tot = {};
    for (const [k, v] of Object.entries(p.analyte.c)) tot[k] = (tot[k] || 0) + (v * cA * Va) / V;
    for (const [k, v] of Object.entries(p.titrant.c)) tot[k] = (tot[k] || 0) + (v * cT * Vt) / V;
    return BeakerSolver.solve(tot, 25, warm || null);
  }
  /** Full theoretical curve, used for the report and the tests. */
  function theoryCurve(p, cA, Va, cT, Vmax, step = 0.1) {
    const pts = [];
    let eq = null;
    for (let v = 0; v <= Vmax + 1e-9; v += step) { eq = computePH(p, cA, Va, cT, v, eq); pts.push([+v.toFixed(3), eq.pH]); }
    return pts;
  }
  const eqVolumes = (p, cA, Va, cT) => p.ratios.map((r) => (r * cA * Va) / cT);

  /** Steepest point of a measured curve (max ΔpH/ΔV) and the derivative curve. */
  function analyseCurve(pts) {
    if (pts.length < 5) return null;
    const d = [];
    for (let i = 1; i < pts.length; i++) {
      const dv = pts[i][0] - pts[i - 1][0];
      if (dv > 1e-6) d.push([(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] - pts[i - 1][1]) / dv]);
    }
    let best = null;
    d.forEach((q) => { if (!best || Math.abs(q[1]) > Math.abs(best[1])) best = q; });
    const veq = best ? best[0] : null;
    const pHat = (v) => {
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= v) {
        const [a, pa] = pts[i - 1], [b, pb] = pts[i];
        return b - a > 1e-9 ? pa + ((pb - pa) * (v - a)) / (b - a) : pb;
      }
      return null;
    };
    return { veq, deriv: d, halfPH: veq ? pHat(veq / 2) : null, pHat };
  }

  /** Does an indicator change colour inside the steep part at this equivalence volume? */
  function indicatorSuits(ind, p, cA, Va, cT, veq) {
    if (ind === 'univ') return { ok: false, why: 'Universal indicator changes gradually through many colours, so it does not give a sharp end point.' };
    if (!IND_PKA[ind]) return { ok: false, why: 'No indicator was used.' };
    const lo = computePH(p, cA, Va, cT, Math.max(0, veq - 2 * DROP)).pH;
    const hi = computePH(p, cA, Va, cT, veq + 2 * DROP).pH;
    const [a, b] = lo < hi ? [lo, hi] : [hi, lo];
    const k = IND_PKA[ind];
    const ok = k >= a - 0.3 && k <= b + 0.3;
    return { ok, lo: a, hi: b, why: ok
      ? `${D.INDICATORS[ind].label} (changes around pH ${k}) lies inside the vertical section (pH ${a.toFixed(1)}–${b.toFixed(1)} within ±2 drops of equivalence).`
      : `${D.INDICATORS[ind].label} changes around pH ${k}, outside the vertical section at equivalence (pH ${a.toFixed(1)}–${b.toFixed(1)}), so its colour change does not mark the equivalence point sharply.` };
  }

  /* ---------------- lab state ---------------- */
  let el = null, cv = null, plotCv = null, raf = 0, last = 0;
  let st = null;

  function newState(keep) {
    const presetKey = keep ? keep.presetKey : 'HAc-NaOH';
    return {
      presetKey,
      unknown: keep ? keep.unknown : true,
      cA: keep ? keep.cA : randConc(),
      cT: 0.100, Va: 25.0,
      ind: keep ? keep.ind : 'phph',
      meter: keep ? keep.meter : true,
      reading: null,                 // burette reading (mL); null = not filled
      flow: 0,                       // mL/s from the stopcock
      swirl: true,
      run: null,                     // { initial, added, pts, eq }
      runs: [],                      // finished runs
      flash: 0, flashColor: null,
      drops: [], tAnim: 0, dropAcc: 0, solveAcc: 0,
      answers: {},
    };
  }
  const randConc = () => Math.round((0.065 + Math.random() * 0.075) * 10000) / 10000;
  const preset = () => PRESETS[st.presetKey];
  const round05 = (v) => Math.round(v / 0.05) * 0.05;

  /* ---------------- UI ---------------- */
  function mount(container) {
    el = container;
    st = newState();
    el.innerHTML = `
      <div class="lab-grid">
        <aside class="panel lab-left">
          <div class="card"><h2>1 · Set up</h2>
            <label class="field">Titration<select id="t-preset">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')}</select></label>
            <div class="dim small" id="t-kind"></div>
            <label class="chip block"><input type="checkbox" id="t-unknown" checked /> Analyte concentration is an unknown to find</label>
            <label class="field">Indicator<select id="t-ind">${IND_KEYS.map((k) => `<option value="${k}">${D.INDICATORS[k].label}: ${D.INDICATORS[k].range}</option>`).join('')}<option value="none">None (pH meter only)</option></select></label>
            <label class="chip block"><input type="checkbox" id="t-meter" checked /> pH meter in the flask (draws the curve)</label>
            <div class="dim small" id="t-setup-note"></div>
          </div>
          <div class="card"><h2>2 · Procedure</h2><ol class="steps" id="t-steps"></ol>
            <div class="btn-row"><button class="hbtn small" id="t-fill" data-tip="Rinse the burette with titrant, fill it and run some out to clear the air bubble from the tip.">Fill burette</button>
            <button class="hbtn small accent" id="t-newrun" data-tip="Pipette 25.00 mL of analyte into a clean conical flask and add 3 drops of indicator.">New run</button></div>
          </div>
          <div class="card"><h2>Burette</h2>
            <label class="ctl full" data-tip="Open the stopcock gradually. Near the end point, add one drop at a time.">Stopcock <input type="range" id="t-flow" min="0" max="100" value="0" /> <span id="t-flow-v">closed</span></label>
            <div class="btn-row">
              <button class="hbtn small" id="t-drop" data-tip="Add a single drop (0.05 mL)">+1 drop</button>
              <button class="hbtn small" id="t-half">+0.50 mL</button>
              <button class="hbtn small" id="t-one">+1.00 mL</button>
              <button class="hbtn small" id="t-close">Close</button>
            </div>
            <label class="chip"><input type="checkbox" id="t-swirl" checked /> Swirl flask</label>
            <label class="chip"><input type="checkbox" id="t-exact" /> Show exact reading</label>
            <div class="btn-row"><button class="hbtn small accent full" id="t-record" data-tip="The indicator has just changed colour permanently: close the tap and write down the burette reading.">✔ End point reached: record final reading</button></div>
          </div>
        </aside>
        <section class="lab-center"><canvas id="t-canvas" aria-label="Burette and conical flask"></canvas>
          <div class="lab-status" id="t-status"></div></section>
        <aside class="panel lab-right">
          <div class="card"><h2>pH curve <span class="h2-note" id="t-curve-note"></span></h2>
            <canvas id="t-plot" class="plot"></canvas>
            <label class="chip small"><input type="checkbox" id="t-deriv" /> show ΔpH/ΔV (finds the steepest point)</label></div>
          <div class="card"><h2>Results</h2><table class="data-table"><thead><tr><th>Run</th><th>Initial / mL</th><th>Final / mL</th><th>Titre / mL</th></tr></thead><tbody id="t-runs"></tbody></table>
            <div class="small dim" id="t-concord"></div></div>
          <div class="card"><h2>3 · Calculate</h2><div id="t-questions"></div></div>
        </aside>
      </div>`;
    cv = el.querySelector('#t-canvas');
    plotCv = el.querySelector('#t-plot');
    wire();
    applySetup();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function unmount() { cancelAnimationFrame(raf); raf = 0; el = null; }

  function wire() {
    const q = (id) => el.querySelector(id);
    q('#t-preset').value = st.presetKey;
    q('#t-preset').addEventListener('change', (e) => { st = newState({ ...st, presetKey: e.target.value, cA: randConc() }); applySetup(); });
    q('#t-unknown').addEventListener('change', (e) => { st = newState({ ...st, unknown: e.target.checked, cA: e.target.checked ? randConc() : 0.1 }); applySetup(); });
    q('#t-ind').addEventListener('change', (e) => { st.ind = e.target.value; if (st.run) toast('The new indicator is used from the next run'); applySetup(true); });
    q('#t-meter').addEventListener('change', (e) => { st.meter = e.target.checked; drawPlot(); });
    q('#t-fill').addEventListener('click', fill);
    q('#t-newrun').addEventListener('click', newRun);
    q('#t-flow').addEventListener('input', (e) => setFlow(Number(e.target.value)));
    q('#t-drop').addEventListener('click', () => addTitrant(DROP));
    q('#t-half').addEventListener('click', () => addTitrant(0.5));
    q('#t-one').addEventListener('click', () => addTitrant(1.0));
    q('#t-close').addEventListener('click', () => setFlow(0));
    q('#t-swirl').addEventListener('change', (e) => { st.swirl = e.target.checked; });
    q('#t-exact').addEventListener('change', (e) => { st.exact = e.target.checked; });
    q('#t-record').addEventListener('click', recordEnd);
    q('#t-deriv').addEventListener('change', drawPlot);
  }

  function applySetup(keepRuns) {
    const p = preset();
    if (!keepRuns) { st.ind = el.querySelector('#t-ind').value; }
    if (!st.unknown) st.cA = 0.1;
    el.querySelector('#t-unknown').checked = st.unknown;
    el.querySelector('#t-kind').textContent = `${p.kind} · ${p.eqn}`;
    el.querySelector('#t-setup-note').innerHTML = `Flask: ${st.Va.toFixed(2)} mL of ${p.analyte.name} (${p.analyte.f}), ${st.unknown ? '<b>concentration unknown</b>' : `${st.cA.toFixed(3)} mol/L`}.<br/>Burette: ${p.titrant.name} (${p.titrant.f}), ${st.cT.toFixed(3)} mol/L.`;
    renderSteps(); renderRuns(); renderQuestions(); drawPlot(); status();
  }

  function renderSteps() {
    const steps = [
      ['Fill the burette', st.reading !== null],
      ['Start a run: pipette the analyte, add indicator', st.runs.length > 0 || !!st.run],
      ['Rough titration (run 1): find the end point roughly', st.runs.length >= 1],
      ['Accurate runs: go dropwise near the end point', st.runs.length >= 2],
      ['Get two concordant titres (within 0.10 mL)', !!concordant()],
      ['Calculate, then press 📝 Lab report', false],
    ];
    el.querySelector('#t-steps').innerHTML = steps.map(([t, done], i) => {
      const cur = !done && steps.slice(0, i).every((s) => s[1]);
      return `<li class="${done ? 'done' : cur ? 'current' : ''}">${t}</li>`;
    }).join('');
  }

  function fill() {
    if (st.run && st.run.added > 0) { toast('Finish or record this run before refilling'); return; }
    st.reading = round05(Math.random() * 0.9 + 0.05);
    toast(`Burette filled. Initial reading ${st.reading.toFixed(2)} mL: read the bottom of the meniscus at eye level.`);
    renderSteps(); status();
  }

  function newRun() {
    if (st.reading === null) { toast('Fill the burette first'); return; }
    if (st.run && st.run.added > 0) { toast('Record the end point of the current run first (or it will be discarded)'); if (!confirm('Discard the current run?')) return; }
    if (BURETTE_MAX - st.reading < eqVolumes(preset(), st.cA, st.Va, st.cT).slice(-1)[0] + 3) {
      st.reading = round05(Math.random() * 0.9 + 0.05);
      toast(`Not enough titrant left, so the burette was refilled to ${st.reading.toFixed(2)} mL`);
    }
    const eq = computePH(preset(), st.cA, st.Va, st.cT, 0);
    st.run = { initial: st.reading, added: 0, pts: [[0, eq.pH]], eq, ind: st.ind };
    setFlow(0);
    renderSteps(); status(); drawPlot();
  }

  function setFlow(x) {
    st.flow = x <= 0 ? 0 : 0.02 * Math.pow(100, x / 100);     // 0.02–2 mL/s
    el.querySelector('#t-flow').value = x;
    el.querySelector('#t-flow-v').textContent = x <= 0 ? 'closed' : st.flow < 0.25 ? `${(st.flow / DROP).toFixed(1)} drops/s` : `${st.flow.toFixed(2)} mL/s`;
  }

  /** Add titrant from the burette into the flask. */
  function addTitrant(mL) {
    if (!st.run) { toast('Start a run first (New run)'); setFlow(0); return; }
    if (st.reading === null) return;
    const room = BURETTE_MAX - st.reading;
    if (room <= 1e-6) { toast('The burette is empty: record the run and refill', true); setFlow(0); return; }
    mL = Math.min(mL, room);
    const before = st.run.eq.pH;
    st.reading += mL;
    st.run.added += mL;
    st.run.eq = computePH(preset(), st.cA, st.Va, st.cT, st.run.added, st.run.eq);
    const pts = st.run.pts;
    if (st.run.added - pts[pts.length - 1][0] >= 0.02 || Math.abs(st.run.eq.pH - pts[pts.length - 1][1]) > 0.05) pts.push([st.run.added, st.run.eq.pH]);
    // where the drops land, the titrant is briefly much more concentrated: a flash of colour
    if (st.run.ind !== 'none') {
      const local = computePH(preset(), st.cA, st.Va, st.cT, st.run.added + Math.max(0.3, mL * 4));
      const cNow = indColor(st.run.eq.pH), cLoc = indColor(local.pH);
      if (Math.hypot(cNow[0] - cLoc[0], cNow[1] - cLoc[1], cNow[2] - cLoc[2]) > 0.12) { st.flash = 1; st.flashColor = cLoc; }
    }
    if (Math.abs(st.run.eq.pH - before) > 1.5) log('labs', `Big pH jump at ${st.run.added.toFixed(2)} mL: ${before.toFixed(2)} → ${st.run.eq.pH.toFixed(2)}`);
    if (st.run.added > 0 && Math.abs(mL - DROP) < 1e-9) spawnDrop();
    st.dirty = true;
  }

  function recordEnd() {
    if (!st.run || st.run.added <= 0) { toast('Titrate first: open the stopcock until the indicator changes colour'); return; }
    setFlow(0);
    const finalR = round05(st.reading), initR = round05(st.run.initial);
    const titre = +(finalR - initR).toFixed(2);
    st.runs.push({ n: st.runs.length + 1, rough: st.runs.length === 0, initial: initR, final: finalR, titre, ind: st.run.ind, pts: st.run.pts, trueAdded: st.run.added });
    st.lastCurve = st.run.pts;
    st.run = null;
    toast(`Run ${st.runs.length} recorded: titre ${titre.toFixed(2)} mL`);
    renderSteps(); renderRuns(); renderQuestions(); status(); drawPlot();
  }

  /** Two accurate titres within 0.10 mL → their mean. */
  function concordant() {
    const acc = st.runs.filter((r) => !r.rough);
    let best = null;
    for (let i = 0; i < acc.length; i++) for (let j = i + 1; j < acc.length; j++) {
      const d = Math.abs(acc[i].titre - acc[j].titre);
      if (d <= 0.1 + 1e-9 && (!best || d < best.d)) best = { d, runs: [acc[i], acc[j]] };
    }
    if (!best) return null;
    // include every accurate titre within 0.10 mL of the chosen pair
    const ref = (best.runs[0].titre + best.runs[1].titre) / 2;
    const set = acc.filter((r) => Math.abs(r.titre - ref) <= 0.1 + 1e-9);
    return { runs: set, mean: set.reduce((a, r) => a + r.titre, 0) / set.length };
  }

  function renderRuns() {
    const c = concordant();
    el.querySelector('#t-runs').innerHTML = st.runs.map((r) => `<tr class="${c && c.runs.includes(r) ? 'concord' : ''}"><td>${r.rough ? 'Rough' : r.n}</td><td>${r.initial.toFixed(2)}</td><td>${r.final.toFixed(2)}</td><td><b>${r.titre.toFixed(2)}</b></td></tr>`).join('')
      || '<tr><td colspan="4" class="dim">No runs yet</td></tr>';
    el.querySelector('#t-concord').innerHTML = c ? `Concordant titres (✓): mean <b>${c.mean.toFixed(2)} mL</b>` : st.runs.length > 1 ? 'Not yet concordant: do another accurate run.' : '';
  }

  function renderQuestions() {
    const p = preset();
    const qs = [['titre', 'Mean titre you will use (mL)']];
    qs.push(['conc', `Concentration of the ${p.analyte.name} (mol/L)`]);
    if (p.weak && p.ratios.length === 1) qs.push(['pka', p.weak === 'acid' ? 'pKa of the acid, from the half-equivalence pH' : 'pKa of NH₄⁺, from the half-equivalence pH']);
    el.querySelector('#t-questions').innerHTML = qs.map(([k, label]) => `<label class="field">${label}<input type="number" step="any" data-q="${k}" value="${st.answers[k] !== undefined ? st.answers[k] : ''}" /></label>`).join('')
      + `<details class="small hint"><summary>Hint</summary>
         n(${p.titrant.f}) = c × V = ${st.cT.toFixed(3)} mol/L × titre/1000<br/>
         n(${p.analyte.f}) = n(${p.titrant.f}) ÷ ${p.ratios.length > 1 ? '(1 or 2, depending on which end point your indicator shows)' : '1'}<br/>
         c(${p.analyte.f}) = n ÷ (${st.Va.toFixed(2)}/1000 L)${p.weak && p.ratios.length === 1 ? '<br/>At half the equivalence volume, [weak acid] = [conjugate base], so pH = pKa.' : ''}</details>`;
    el.querySelectorAll('[data-q]').forEach((inp) => inp.addEventListener('input', () => { st.answers[inp.dataset.q] = inp.value === '' ? undefined : Number(inp.value); }));
  }

  function status() {
    const p = preset();
    let s;
    if (st.reading === null) s = 'Fill the burette to begin.';
    else if (!st.run) s = st.runs.length ? 'Run recorded. Start another run, or calculate and write the report.' : 'Burette ready. Press "New run" to pipette the analyte into the flask.';
    else s = `Run ${st.runs.length + 1}${st.runs.length === 0 ? ' (rough)' : ''}: ${st.run.added.toFixed(2)} mL of ${p.titrant.f} added.`;
    el.querySelector('#t-status').textContent = s;
  }

  /* ---------------- drawing ---------------- */
  const indColor = (pH) => {
    const ind = st.run ? st.run.ind : st.ind;
    if (ind === 'none' || !D.INDICATORS[ind]) return [0.92, 0.95, 1.0];
    const c = D.INDICATORS[ind].color(pH);
    const f = ind === 'phph' ? Math.min(1, Math.max(0, (pH - 8.0) / 1.6)) * 0.85 + 0.05 : 0.8;   // phenolphthalein fades to colourless
    if (ind === 'phph') return [1 - f + f * c[0], 1 - f + f * c[1], 1 - f + f * c[2]];
    return c.map((v) => 0.15 + 0.85 * v);
  };
  const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')},${a})`;

  function spawnDrop() { st.drops.push({ y: 0, v: 0 }); }

  function loop(now) {
    if (!el) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    st.tAnim += dt;
    if (st.flow > 0) {
      st.solveAcc += st.flow * dt;
      st.dropAcc += st.flow * dt;
      while (st.dropAcc > DROP) { st.dropAcc -= DROP; if (st.flow < 0.6) spawnDrop(); }
      if (st.solveAcc >= 0.01) { addTitrant(st.solveAcc); st.solveAcc = 0; }
    }
    if (st.dirty && Math.floor(st.tAnim * 5) !== Math.floor((st.tAnim - dt) * 5)) { st.dirty = false; status(); drawPlot(); }
    st.flash = Math.max(0, st.flash - dt * (st.swirl ? 2.5 : 0.5));
    st.drops.forEach((d) => { d.v += 900 * dt; d.y += d.v * dt; });
    st.drops = st.drops.filter((d) => d.y < 60);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const k = Math.min(W / 520, H / 640);
    c.save();
    c.translate((W - 520 * k) / 2, (H - 640 * k) / 2);
    c.scale(k, k);

    // retort stand
    c.fillStyle = '#2a3445'; c.fillRect(60, 30, 8, 590); c.fillRect(30, 612, 200, 10);
    c.fillRect(64, 150, 120, 6); c.fillRect(64, 330, 120, 6);
    // white tile
    c.fillStyle = '#e9edf2'; c.fillRect(120, 600, 200, 10);

    const bx = 200, y0 = 60, y50 = 400;
    const yR = (r) => y0 + (r / 50) * (y50 - y0);
    // burette glass
    c.fillStyle = 'rgba(200,220,255,0.06)'; c.fillRect(bx - 9, 40, 18, 400);
    // liquid
    if (st.reading !== null) {
      const top = yR(st.reading);
      c.fillStyle = 'rgba(190,215,255,0.35)'; c.fillRect(bx - 8, top, 16, 440 - top);
    }
    c.strokeStyle = 'rgba(220,235,255,0.6)'; c.lineWidth = 1.5; c.strokeRect(bx - 9, 40, 18, 400);
    // graduations
    c.fillStyle = 'rgba(230,240,255,0.8)'; c.font = '9px Inter, sans-serif'; c.textAlign = 'right';
    for (let r = 0; r <= 50; r++) {
      const y = yR(r);
      c.fillRect(bx - 9, y, r % 5 === 0 ? 9 : 5, 0.8);
      if (r % 5 === 0) c.fillText(String(r), bx - 12, y + 3);
    }
    // stopcock + tip
    c.fillStyle = '#9aa7b8'; c.fillRect(bx - 4, 440, 8, 24);
    const open = st.flow > 0;
    c.save(); c.translate(bx, 452); c.rotate(open ? 0 : Math.PI / 2);
    c.fillStyle = '#d9a441'; c.fillRect(-18, -3, 36, 6); c.restore();
    c.fillStyle = 'rgba(200,220,255,0.3)'; c.beginPath(); c.moveTo(bx - 3, 464); c.lineTo(bx + 3, 464); c.lineTo(bx + 1, 490); c.lineTo(bx - 1, 490); c.fill();

    // stream or drops
    if (st.flow >= 0.6) { c.fillStyle = 'rgba(190,215,255,0.55)'; c.fillRect(bx - 1.2, 490, 2.4, 555 - 490); }
    c.fillStyle = 'rgba(200,225,255,0.85)';
    st.drops.forEach((d) => { c.beginPath(); c.ellipse(bx, 492 + d.y, 2.2, 3, 0, 0, Math.PI * 2); c.fill(); });

    // conical flask
    const fx = 220;
    const vol = st.run ? st.Va + st.run.added : 0;
    const pH = st.run ? st.run.eq.pH : 7;
    const flaskPath = () => {
      c.beginPath();
      c.moveTo(fx - 14, 500); c.lineTo(fx - 14, 530); c.lineTo(fx - 70, 598); c.quadraticCurveTo(fx - 72, 602, fx - 66, 602);
      c.lineTo(fx + 66, 602); c.quadraticCurveTo(fx + 72, 602, fx + 70, 598); c.lineTo(fx + 14, 530); c.lineTo(fx + 14, 500);
    };
    if (vol > 0) {
      const level = 600 - Math.min(64, 14 + vol * 0.55);
      c.save(); flaskPath(); c.clip();
      const wob = st.swirl ? Math.sin(st.tAnim * 7) * 4 : 0;
      c.fillStyle = rgb(indColor(pH), 0.85);
      c.beginPath(); c.moveTo(fx - 80, level - wob); c.lineTo(fx + 80, level + wob); c.lineTo(fx + 80, 610); c.lineTo(fx - 80, 610); c.fill();
      if (st.flash > 0.02 && st.flashColor) {
        c.fillStyle = rgb(st.flashColor, 0.9 * st.flash);
        c.beginPath(); c.ellipse(fx - (st.swirl ? Math.sin(st.tAnim * 7) * 18 : 0), level + 10, 16 + (1 - st.flash) * 30, 7 + (1 - st.flash) * 10, 0, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    flaskPath(); c.strokeStyle = 'rgba(220,235,255,0.7)'; c.lineWidth = 2; c.stroke();

    // pH probe + meter
    if (st.meter && st.run) {
      c.strokeStyle = '#5b6b82'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx + 8, 470); c.lineTo(fx + 8, 585); c.stroke();
      c.strokeStyle = '#34445f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx + 8, 470); c.quadraticCurveTo(fx + 40, 430, 380, 470); c.stroke();
      c.fillStyle = '#121a27'; c.strokeStyle = '#3b4a63'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect(370, 470, 120, 64, 8); c.fill(); c.stroke();
      c.fillStyle = '#9fe870'; c.font = 'bold 26px "JetBrains Mono", monospace'; c.textAlign = 'center';
      c.fillText(pH.toFixed(2), 430, 512);
      c.font = '10px Inter, sans-serif'; c.fillStyle = '#9aa7b8'; c.fillText('pH meter', 430, 527);
    }

    // magnifier on the meniscus
    if (st.reading !== null) {
      const my = Math.max(110, Math.min(380, yR(st.reading)));
      const mx = 330, R = 62;
      c.save();
      c.beginPath(); c.arc(mx, my, R, 0, Math.PI * 2); c.fillStyle = '#0d1420'; c.fill(); c.clip();
      const zoom = 70;                           // px per mL
      const Z = (r) => my + (r - st.reading) * zoom;
      c.fillStyle = 'rgba(190,215,255,0.28)'; c.fillRect(mx - 40, Z(st.reading), 80, R * 2);
      // meniscus (curved, bottom at the reading)
      c.strokeStyle = 'rgba(210,230,255,0.95)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(mx - 40, Z(st.reading) - 7); c.quadraticCurveTo(mx, Z(st.reading) + 7, mx + 40, Z(st.reading) - 7); c.stroke();
      c.fillStyle = '#e6edf3'; c.font = 'bold 12px Inter, sans-serif'; c.textAlign = 'left';
      for (let r = Math.floor((st.reading - 1) * 10) / 10; r <= st.reading + 1; r += 0.1) {
        const rr = Math.round(r * 10) / 10;
        if (rr < 0 || rr > 50) continue;
        const major = Math.abs(rr - Math.round(rr)) < 1e-6;
        c.fillRect(mx - 40, Z(rr), major ? 34 : Math.abs(rr * 10 % 5) < 1e-6 ? 24 : 14, major ? 2 : 1);
        if (major) c.fillText(String(Math.round(rr)), mx - 2, Z(rr) + 4);
      }
      c.restore();
      c.strokeStyle = '#94a3b8'; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, R, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(bx + 10, yR(st.reading)); c.lineTo(mx - R, my); c.strokeStyle = 'rgba(148,163,184,0.4)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#9aa7b8'; c.font = '11px Inter, sans-serif'; c.textAlign = 'center';
      c.fillText(st.exact ? `reading ${st.reading.toFixed(2)} mL` : 'read the bottom of the meniscus', mx, my + R + 16);
    }
    c.restore();
  }

  function drawPlot() {
    if (!el) return;
    const p = preset();
    const pts = st.run ? st.run.pts : st.lastCurve || [];
    const show = st.meter;
    const series = [];
    if (show && pts.length) series.push({ pts, color: '#22d3ee', width: 2.2, label: st.run ? 'this run' : 'last run' });
    const wantD = el.querySelector('#t-deriv').checked;
    const an = analyseCurve(pts);
    if (wantD && an) {
      const maxD = Math.max(...an.deriv.map((d) => Math.abs(d[1])), 1e-9);
      series.push({ pts: an.deriv.map(([v, d]) => [v, (Math.abs(d) / maxD) * 13.5]), color: '#f472b6', width: 1.4, label: 'ΔpH/ΔV (scaled)' });
    }
    const vmax = Math.max(10, Math.ceil(((pts.length ? pts[pts.length - 1][0] : 0) + 2) / 5) * 5, Math.ceil(eqVolumes(p, st.cA, st.Va, st.cT).slice(-1)[0] * 1.5 / 5) * 5);
    const bands = [];
    const ind = st.run ? st.run.ind : st.ind;
    if (IND_PKA[ind]) bands.push({ y0: IND_PKA[ind] - 0.8, y1: IND_PKA[ind] + 0.8, color: 'rgba(251,191,36,0.10)' });
    LabPlot.draw(plotCv, { x: { label: `Volume of ${p.titrant.f} added / mL`, min: 0, max: vmax }, y: { label: 'pH', min: 0, max: 14 }, series, bands,
      notes: show ? [] : [{ x: vmax * 0.2, y: 7, text: 'Turn on the pH meter to see the curve' }] });
    el.querySelector('#t-curve-note').textContent = IND_PKA[ind] ? 'shaded: indicator colour change' : '';
  }

  /* ---------------- report ---------------- */
  function report() {
    const p = preset();
    if (!st.runs.length) { toast('Do at least one titration run first'); return null; }
    const conc = concordant();
    const acc = st.runs.filter((r) => !r.rough);
    const meanTitre = conc ? conc.mean : (acc.length ? acc : st.runs).reduce((a, r) => a + r.titre, 0) / (acc.length || st.runs.length);
    const veqs = eqVolumes(p, st.cA, st.Va, st.cT);
    // which equivalence point did the end point show?
    let k = 0;
    veqs.forEach((v, i) => { if (Math.abs(meanTitre - v) < Math.abs(meanTitre - veqs[k])) k = i; });
    const ratio = p.ratios[k], veq = veqs[k];
    const cFromTitre = (st.cT * meanTitre) / 1000 / ratio / (st.Va / 1000);
    const used = st.runs[st.runs.length - 1].ind;
    const suit = indicatorSuits(used, p, st.cA, st.Va, st.cT, veq);
    const curve = [...st.runs].reverse().find((r) => r.pts.length > 10);
    const an = curve ? analyseCurve(curve.pts) : null;
    const theory = theoryCurve(p, st.cA, st.Va, st.cT, Math.max(veqs.slice(-1)[0] * 1.6, 10), 0.1);

    // scoring
    let score = 0;
    const fb = [];
    if (conc) { score += 20; fb.push(LabsHub.verdict(true, `Concordant titres (${conc.runs.map((r) => r.titre.toFixed(2)).join(', ')} mL)`)); }
    else fb.push(LabsHub.verdict(false, 'No two accurate titres agree within 0.10 mL: do more runs for a reliable mean.'));
    const dv = Math.abs(meanTitre - veq);
    score += dv <= 0.1 ? 30 : dv <= 0.3 ? 18 : dv <= 1 ? 8 : 0;
    fb.push(LabsHub.verdict(dv <= 0.3, `Mean titre ${meanTitre.toFixed(2)} mL vs true equivalence volume ${veq.toFixed(2)} mL (${(meanTitre - veq >= 0 ? '+' : '') + (meanTitre - veq).toFixed(2)} mL)${dv > 0.3 ? '. Overshooting the end point is the usual cause: add dropwise near the end and swirl.' : ''}`));
    const ans = st.answers;
    if (ans.conc !== undefined) {
      const e1 = LabsHub.pctErr(ans.conc, cFromTitre);
      const okCalc = e1 <= 1.5;
      score += okCalc ? 30 : e1 <= 5 ? 12 : 0;
      fb.push(LabsHub.verdict(okCalc, `Your concentration ${ans.conc} mol/L; from your titre it should be ${cFromTitre.toFixed(4)} mol/L (${e1.toFixed(1)} % difference)${okCalc ? '' : '. Check the mole ratio and the unit conversion (mL → L).'}`));
    } else fb.push(LabsHub.verdict(false, 'You did not enter a concentration.'));
    let pkaLine = '';
    if (p.weak && p.ratios.length === 1) {
      const want = p.weak === 'acid' ? p.pKa[0] : p.pKa[0];
      if (ans.pka !== undefined) {
        const okP = Math.abs(ans.pka - want) <= 0.15;
        score += okP ? 20 : Math.abs(ans.pka - want) <= 0.4 ? 10 : 0;
        fb.push(LabsHub.verdict(okP, `Your pKa ${ans.pka}; literature value ${want}${an && an.halfPH ? `; your curve gives pH ${an.halfPH.toFixed(2)} at half-equivalence (${(an.veq / 2).toFixed(2)} mL)` : ''}.`));
      } else fb.push(LabsHub.verdict(false, 'You did not enter a pKa.'));
      pkaLine = an && an.halfPH ? `Half-equivalence: ${(an.veq / 2).toFixed(2)} mL → pH ${an.halfPH.toFixed(2)} ≈ pKa` : '';
    } else score += 20;
    if (!suit.ok) score = Math.max(0, score - 10);
    fb.push(LabsHub.verdict(suit.ok, suit.why));

    const vlines = veqs.map((v, i) => ({ x: v, color: '#d97706', label: `equivalence ${p.ratios.length > 1 ? i + 1 : ''} (${v.toFixed(2)} mL)`, row: i }));
    const graph = LabPlot.toImage({
      x: { label: `Volume of ${p.titrant.f} added / mL`, min: 0, max: theory[theory.length - 1][0] }, y: { label: 'pH', min: 0, max: 14 },
      series: [
        { pts: theory, color: '#9ca3af', width: 1.5, dash: [4, 3], label: 'theory' },
        ...(curve ? [{ pts: curve.pts, color: '#0e7490', width: 2.2, label: `run ${curve.rough ? '(rough)' : curve.n}` }] : []),
      ],
      vlines, bands: IND_PKA[used] ? [{ y0: IND_PKA[used] - 0.8, y1: IND_PKA[used] + 0.8, color: 'rgba(217,119,6,0.12)' }] : [],
    });
    const nT = (st.cT * meanTitre) / 1000;
    return {
      title: `Titration: ${p.name}`,
      subtitle: `${p.kind}, indicator: ${used === 'none' ? 'none' : D.INDICATORS[used].label}`,
      score: Math.round(score),
      sections: [
        { h: 'Aim', html: `<p>To find the concentration of ${p.analyte.name} (${p.analyte.f}) by titration with ${st.cT.toFixed(3)} mol/L ${p.titrant.name}${p.weak && p.ratios.length === 1 ? ', and to find the pKa from the pH curve' : ''}.</p><p>${p.eqn}</p>` },
        { h: 'Method', html: `<p>${st.Va.toFixed(2)} mL of ${p.analyte.name} was pipetted into a conical flask and ${used === 'none' ? 'a pH probe was inserted' : `3 drops of ${D.INDICATORS[used].label.toLowerCase()} were added`}. ${p.titrant.name[0].toUpperCase() + p.titrant.name.slice(1)} was added from a burette with swirling, dropwise near the end point, until the ${used === 'none' ? 'pH jump' : 'first permanent colour change'}. Burette readings were taken from the bottom of the meniscus to the nearest 0.05 mL. A rough titration was followed by accurate runs until two titres agreed within 0.10 mL.</p>` },
        { h: 'Results', html: LabsHub.table(['Run', 'Initial reading / mL', 'Final reading / mL', 'Titre / mL'], st.runs.map((r) => [r.rough ? 'Rough' : r.n, r.initial.toFixed(2), r.final.toFixed(2), `${r.titre.toFixed(2)}${conc && conc.runs.includes(r) ? ' ✓' : ''}`]))
          + `<p>Mean ${conc ? 'of concordant titres (✓)' : 'titre'}: <b>${meanTitre.toFixed(2)} mL</b></p>` },
        { h: 'pH curve', html: LabsHub.img(graph, 'Titration curve') + (an ? `<p>Steepest point of your curve: ${an.veq.toFixed(2)} mL. ${pkaLine}</p>` : '<p class="dim">No pH-meter data was recorded (turn the pH meter on to get a curve).</p>') },
        { h: 'Calculation (from your mean titre)', html: LabsHub.calc([
          `n(${p.titrant.f}) = ${st.cT.toFixed(3)} mol/L × ${meanTitre.toFixed(2)}/1000 L = ${nT.toExponential(3)} mol`,
          `n(${p.analyte.f}) = n(${p.titrant.f}) ÷ ${ratio}${p.ratios.length > 1 ? `   (end point ${k + 1}: ${k === 0 ? 'first' : 'second'} equivalence)` : ''} = ${(nT / ratio).toExponential(3)} mol`,
          `c(${p.analyte.f}) = ${(nT / ratio).toExponential(3)} mol ÷ ${(st.Va / 1000).toFixed(5)} L = ${cFromTitre.toFixed(4)} mol/L`,
          ...(st.unknown ? [`True concentration (revealed): ${st.cA.toFixed(4)} mol/L  →  error ${LabsHub.pctErr(cFromTitre, st.cA).toFixed(2)} %`] : []),
        ]) },
        { h: 'Feedback', html: fb.join('') },
        { h: 'Evaluation: sources of error', html: `<ul>
          <li><b>Reading the burette:</b> each reading is ±0.05 mL, and a titre uses two readings, so ±0.10 mL, which is ${(10 / Math.max(meanTitre, 1)).toFixed(2)} % of your titre. A bigger titre gives a smaller percentage error.</li>
          <li><b>Pipette:</b> a 25 mL grade-B pipette is about ±0.06 mL (±0.24 %).</li>
          <li><b>End point vs equivalence point:</b> the indicator changes over a pH range; ${suit.ok ? 'here it falls in the steep part, so the error is less than a drop.' : 'here it does NOT fall in the steep part, which is a systematic error.'}</li>
          <li><b>Overshooting:</b> adding titrant quickly near the end point gives titres that are too big. The rough run tells you where to slow down.</li>
          ${p.analyte.c.CO3 ? '<li><b>CO₂:</b> boiling off dissolved CO₂ near the second end point sharpens the methyl-orange change.</li>' : ''}
          ${p.titrant.c.Na ? '<li><b>NaOH absorbs CO₂ from air</b> over time, so real NaOH solutions are standardised first (e.g. against potassium hydrogen phthalate).</li>' : ''}
        </ul>` },
      ],
    };
  }

  LabsHub.add({ id: 'titration', icon: '💧', title: 'Acid–base titration', blurb: 'Burette, indicators and a live pH curve. Find an unknown concentration and a pKa.', topics: ['concordant titres', 'equivalence point', 'indicators', 'pKa from half-equivalence', 'polyprotic acids'], mount, unmount, report });

  // console / test access
  return { PRESETS, computePH, theoryCurve, eqVolumes, analyseCurve, indicatorSuits, get state() { return st; }, addTitrant, newRun, fill, recordEnd, setFlow };
})();
