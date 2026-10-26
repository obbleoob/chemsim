/* Guided Labs: every lab's numbers must match hand calculations. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#labs');
  await page.waitForSelector('.lab-card');
  h.eq(await page.locator('.lab-card').count(), 4, 'labs home lists 4 labs');

  /* ---------------- titration: pH from textbook formulas ---------------- */
  const pH = (preset, cA, Va, cT, Vt) => page.evaluate(({ preset, cA, Va, cT, Vt }) => TitrationLab.computePH(TitrationLab.PRESETS[preset], cA, Va, cT, Vt).pH, { preset, cA, Va, cT, Vt });
  // strong acid + strong base (0.1 M, 25.00 mL)
  h.near(await pH('HCl-NaOH', 0.1, 25, 0.1, 0), 1.00, 0.01, 'HCl 0.1 M start: pH 1.00');
  h.near(await pH('HCl-NaOH', 0.1, 25, 0.1, 12.5), 1.48, 0.01, 'HCl half-neutralised: pH 1.48 ([H⁺] = 1.25 mmol / 37.5 mL)');
  h.near(await pH('HCl-NaOH', 0.1, 25, 0.1, 24.9), 3.70, 0.02, 'HCl 0.1 mL before equivalence: pH 3.70');
  h.near(await pH('HCl-NaOH', 0.1, 25, 0.1, 25), 7.00, 0.02, 'strong/strong equivalence: pH 7.00');
  h.near(await pH('HCl-NaOH', 0.1, 25, 0.1, 30), 11.96, 0.02, '5 mL excess NaOH: pH 11.96');
  // weak acid + strong base: pKa 4.76
  h.near(await pH('HAc-NaOH', 0.1, 25, 0.1, 0), 2.88, 0.02, 'ethanoic acid 0.1 M: pH 2.88 (√(Ka·c))');
  h.near(await pH('HAc-NaOH', 0.1, 25, 0.1, 5), 4.16, 0.03, 'buffer region: pH = pKa + log(1/4) = 4.16');
  h.near(await pH('HAc-NaOH', 0.1, 25, 0.1, 12.5), 4.76, 0.03, 'half-equivalence: pH = pKa = 4.76');
  h.near(await pH('HAc-NaOH', 0.1, 25, 0.1, 25), 8.73, 0.03, 'weak acid equivalence: pH 8.73 (0.05 M ethanoate)');
  // weak base + strong acid
  h.near(await pH('NH3-HCl', 0.1, 25, 0.1, 0), 11.13, 0.03, 'ammonia 0.1 M: pH 11.13');
  h.near(await pH('NH3-HCl', 0.1, 25, 0.1, 12.5), 9.25, 0.03, 'NH₃ half-equivalence: pH = pKa(NH₄⁺) = 9.25');
  h.near(await pH('NH3-HCl', 0.1, 25, 0.1, 25), 5.28, 0.03, 'weak base equivalence: pH 5.28');
  // polyprotic
  h.near(await pH('H3PO4-NaOH', 0.1, 25, 0.1, 25), 4.68, 0.15, 'H₃PO₄ first equivalence ≈ ½(pKa1 + pKa2) = 4.7');
  h.near(await pH('H3PO4-NaOH', 0.1, 25, 0.1, 50), 9.75, 0.2, 'H₃PO₄ second equivalence ≈ ½(pKa2 + pKa3) ≈ 9.7');
  h.near(await pH('Na2CO3-HCl', 0.1, 25, 0.1, 25), 8.34, 0.1, 'Na₂CO₃ first equivalence (HCO₃⁻): pH 8.34');
  h.near(await pH('Na2CO3-HCl', 0.1, 25, 0.1, 50), 3.91, 0.1, 'Na₂CO₃ second equivalence (0.033 M CO₂): pH 3.91');

  const t = await page.evaluate(() => {
    const T = TitrationLab, P = T.PRESETS;
    const curve = T.theoryCurve(P['HAc-NaOH'], 0.1, 25, 0.1, 40, 0.05);
    const an = T.analyseCurve(curve);
    return {
      veq: an.veq, half: an.halfPH, eqv: T.eqVolumes(P['H3PO4-NaOH'], 0.08, 25, 0.1),
      phHAc: T.indicatorSuits('phph', P['HAc-NaOH'], 0.1, 25, 0.1, 25).ok, moHAc: T.indicatorSuits('mo', P['HAc-NaOH'], 0.1, 25, 0.1, 25).ok,
      moNH3: T.indicatorSuits('mo', P['NH3-HCl'], 0.1, 25, 0.1, 25).ok, phNH3: T.indicatorSuits('phph', P['NH3-HCl'], 0.1, 25, 0.1, 25).ok,
      btbHCl: T.indicatorSuits('btb', P['HCl-NaOH'], 0.1, 25, 0.1, 25).ok, univ: T.indicatorSuits('univ', P['HCl-NaOH'], 0.1, 25, 0.1, 25).ok,
    };
  });
  h.near(t.veq, 25, 0.06, 'steepest point of the HAc curve is at the equivalence volume (25.00 mL)');
  h.near(t.half, 4.76, 0.04, 'half-equivalence pH read from the curve = pKa');
  h.check(Math.abs(t.eqv[0] - 20) < 1e-9 && Math.abs(t.eqv[1] - 40) < 1e-9, 'H₃PO₄ 0.080 M: equivalence at 20.00 and 40.00 mL');
  h.check(t.phHAc && !t.moHAc, 'weak acid + strong base: phenolphthalein suits, methyl orange does not');
  h.check(t.moNH3 && !t.phNH3, 'weak base + strong acid: methyl orange suits, phenolphthalein does not');
  h.check(t.btbHCl && !t.univ, 'strong/strong: bromothymol blue suits; universal indicator never gives a sharp end point');

  // a full titration run through the lab's own controls
  await page.evaluate(() => { location.hash = '#labs/titration'; });
  await page.waitForSelector('#t-canvas');
  await page.selectOption('#t-preset', 'HCl-NaOH');
  const run = await page.evaluate(() => {
    const T = TitrationLab;
    T.fill();
    const st = T.state;
    const veq = T.eqVolumes(T.PRESETS[st.presetKey], st.cA, st.Va, st.cT)[0];
    const titrate = (overshootDrops) => { T.newRun(); T.addTitrant(Math.floor(veq) - 1); while (T.state.run.eq.pH < 8.2) T.addTitrant(0.05); for (let i = 0; i < overshootDrops; i++) T.addTitrant(0.05); T.recordEnd(); };
    titrate(6); titrate(0); titrate(0);
    return { veq, runs: st.runs.map((r) => r.titre), cA: st.cA };
  });
  h.check(run.runs.length === 3, 'three titration runs recorded');
  h.check(Math.abs(run.runs[1] - run.veq) <= 0.1, `accurate run titre ${run.runs[1]} mL within 0.10 mL of equivalence (${run.veq.toFixed(2)} mL)`);
  h.check(Math.abs(run.runs[1] - run.runs[2]) <= 0.1, 'accurate runs are concordant');
  await page.fill('[data-q="conc"]', String((0.1 * run.runs[1]) / 25));
  await page.click('#lab-report-btn');
  await page.waitForSelector('#report-overlay:not(.hidden)');
  const rep = await page.textContent('#report-doc');
  h.check(/Concordant titres/.test(rep) && /Your concentration/.test(rep) && /True concentration/.test(rep), 'titration report has results, feedback and the revealed concentration');
  h.check(/✔ Your concentration/.test(rep), 'the correct concentration answer is marked right');
  await page.click('#rep-close');

  /* ---------------- qualitative analysis ---------------- */
  await page.evaluate(() => { location.hash = '#labs/qual'; });
  await page.waitForSelector('#q-tests');
  const q = await page.evaluate(() => {
    const Q = QualLab;
    const txt = (ck, ak, k) => Q.runTestOn(ck, ak, k).stages.map((s) => s.text).join(' | ');
    return {
      n: Q.stockList().length,
      zn: [txt('Zn', 'SO4', 'naoh'), txt('Zn', 'SO4', 'nh3')], al: [txt('Al', 'Cl', 'naoh'), txt('Al', 'Cl', 'nh3')],
      pb: txt('Pb', 'NO3', 'naoh'), cu: txt('Cu', 'SO4', 'nh3'), fe3: txt('Fe3', 'Cl', 'scn'), fe2: txt('Fe2', 'SO4', 'naoh'),
      cl: txt('Na', 'Cl', 'ag'), br: txt('K', 'Br', 'ag'), i: txt('Na', 'I', 'ag'), so4: txt('K', 'SO4', 'ba'), co3: txt('Na', 'CO3', 'hcl'),
      nh4: txt('NH4', 'Cl', 'warm'), na: txt('Na', 'NO3', 'flame'), k: txt('K', 'NO3', 'flame'), ca: txt('Ca', 'Cl', 'naoh'), ba: txt('Ba', 'Cl', 'naoh'),
      no3: txt('Ba', 'NO3', 'devarda'), noNo3: txt('Ba', 'Cl', 'devarda'), mg: txt('Mg', 'SO4', 'nh3'),
      all: Q.stockList().flatMap(({ ck, ak }) => ['look', 'naoh', 'nh3', 'warm', 'flame', 'hcl', 'ag', 'ba', 'scn', 'devarda'].map((k) => txt(ck, ak, k))).join(' '),
    };
  });
  h.check(q.n >= 55, `${q.n} possible unknown salts (only clear 0.1 M solutions)`);
  h.check(/white precipitate forms/i.test(q.zn[0]) && /dissolves in excess/.test(q.zn[0]) && /dissolves in excess/.test(q.zn[1]), 'Zn²⁺: white ppt dissolving in excess NaOH and in excess NH₃');
  h.check(/dissolves in excess/.test(q.al[0]) && /does not dissolve in excess/.test(q.al[1]), 'Al³⁺: dissolves in excess NaOH but not in excess NH₃');
  h.check(/dissolves in excess/.test(q.pb), 'Pb²⁺: Pb(OH)₂ is amphoteric');
  h.check(/pale blue precipitate/.test(q.cu) && /deep blue/.test(q.cu), 'Cu²⁺ + NH₃: pale blue ppt → deep blue solution');
  h.check(/blood-red/.test(q.fe3), 'Fe³⁺ + SCN⁻: blood-red');
  h.check(/dirty green/.test(q.fe2), 'Fe²⁺ + NaOH: dirty green ppt');
  h.check(/white precipitate/.test(q.cl) && /dissolves in dilute ammonia/.test(q.cl), 'Cl⁻: white AgCl, soluble in dilute NH₃');
  h.check(/cream precipitate/.test(q.br) && /does not dissolve in dilute/.test(q.br) && /dissolves in concentrated/.test(q.br), 'Br⁻: cream AgBr, soluble only in conc. NH₃');
  h.check(/yellow precipitate/.test(q.i) && /does not dissolve in concentrated/.test(q.i), 'I⁻: yellow AgI, insoluble in conc. NH₃');
  h.check(/white precipitate forms/.test(q.so4), 'SO₄²⁻: white BaSO₄ with acidified BaCl₂');
  h.check(/Effervescence/.test(q.co3) && /limewater milky/.test(q.co3), 'CO₃²⁻: fizzes with acid, gas turns limewater milky');
  h.check(/litmus paper turns blue/.test(q.nh4), 'NH₄⁺: warming with NaOH gives NH₃ (red litmus → blue)');
  h.check(/yellow/.test(q.na) && /lilac/.test(q.k.split('|')[1]), 'flame tests: Na yellow, K lilac through cobalt glass');
  h.check(/white precipitate/.test(q.ca) && !/precipitate forms/.test(q.ba), 'NaOH: Ca²⁺ gives a ppt, Ba²⁺ does not');
  h.check(/turns blue/.test(q.no3) && /stays red/.test(q.noNo3), 'NO₃⁻: Devarda’s alloy test positive only for nitrate');
  h.check(/white precipitate/.test(q.mg), 'Mg²⁺ + NH₃: white Mg(OH)₂');
  const giveaway = /sodium|potassium|lithium|ammonium|calcium|barium|magnesium|copper|iron|zinc|alumin|lead|silver|chloride|bromide|iodide|sulfate|carbonate|nitrate|Cu²|Zn²|Fe³|Fe²|SO₄|CO₃|NO₃|Cl⁻|Br⁻|I⁻/i;
  h.check(!giveaway.test(q.all), 'observations never name the ions', (q.all.match(giveaway) || [])[0]);

  // play a round through the UI
  await page.evaluate(() => QualLab.newGame({ ck: 'Cu', ak: 'SO4' }));
  await page.click('[data-t="nh3"]'); await page.click('[data-t="ba"]');
  h.eq(await page.locator('.tube-card').count(), 2, 'each test adds a test-tube card');
  await page.selectOption('#q-cat', 'Fe2'); await page.selectOption('#q-an', 'SO4'); await page.click('#q-submit');
  h.check(/anion is right but the cation/.test(await page.textContent('#q-verdict')), 'wrong cation is reported');
  await page.selectOption('#q-cat', 'Cu'); await page.click('#q-submit');
  h.check(/Correct/.test(await page.textContent('#q-verdict')), 'correct identification accepted');
  h.eq(await page.textContent('#q-score'), '85', 'score: 100 − 15 for one wrong guess');

  /* ---------------- galvanic cells ---------------- */
  const g = await page.evaluate(() => {
    const G = GalvanicLab;
    return {
      zn: G.electrodeE('Zn', 1), daniell: G.cellE('Zn', 1, 'Cu', 1), cu001: G.cellE('Zn', 1, 'Cu', 0.01), zn001: G.cellE('Zn', 0.01, 'Cu', 1),
      agcu: G.cellE('Cu', 1, 'Ag', 1), she: G.cellE('Zn', 1, 'H2', 1), conc: G.cellE('Cu', 0.01, 'Cu', 1), hot: G.cellE('Zn', 1, 'Cu', 0.01, 50),
      eqAg: G.overall('Cu', 'Ag'), eqAl: G.overall('Al', 'Cu'), eqH: G.overall('Zn', 'H2'),
    };
  });
  h.near(g.zn, -0.76, 1e-9, 'E(Zn²⁺|Zn, 1 M) = E° = −0.76 V');
  h.near(g.daniell, 1.10, 1e-9, 'Daniell cell, 1 M: E°cell = +1.10 V');
  h.near(g.cu001, 1.0408, 0.0005, '[Cu²⁺] = 0.01 M: E = 1.10 − 0.0296 × 2 = 1.041 V');
  h.near(g.zn001, 1.1592, 0.0005, '[Zn²⁺] = 0.01 M: E = 1.159 V');
  h.near(g.agcu, 0.46, 1e-9, 'Cu | Ag cell: 0.80 − 0.34 = 0.46 V');
  h.near(g.she, 0.76, 1e-9, 'Zn against the standard hydrogen electrode: 0.76 V');
  h.near(g.conc, 0.0592, 0.0005, 'copper concentration cell (0.01 | 1 M): 0.0592 V');
  h.near(g.hot, 1.10 - (8.314 * 323.15 / (2 * 96485)) * Math.log(100), 1e-6, 'Nernst slope scales with temperature (50 °C)');
  h.eq(g.eqAg.text, 'Cu + 2Ag⁺ → Cu²⁺ + 2Ag', 'balanced Cu/Ag equation');
  h.eq(g.eqAl.text, '2Al + 3Cu²⁺ → 2Al³⁺ + 3Cu', 'balanced Al/Cu equation (6 electrons)');
  h.eq(g.eqH.text, 'Zn + 2H⁺ → Zn²⁺ + H₂', 'balanced Zn/H₂ equation');

  await page.evaluate(() => { location.hash = '#labs/galvanic'; });
  await page.waitForSelector('#g-canvas');
  const run2 = await page.evaluate(() => {
    const G = GalvanicLab, st = G.state;
    st.load = 'wire';
    const E0 = G.cellNow().E;
    G.stepCell(20000);                     // 20 000 s through a short circuit
    return { E0, E1: G.cellNow().E, cZn: st.cL, cCu: st.cR, dZn: 5 - st.massL, dCu: st.massR - 5, Q: st.charge };
  });
  h.check(run2.E1 < run2.E0, `the cell runs down under load (${run2.E0.toFixed(3)} → ${run2.E1.toFixed(3)} V)`);
  h.near(run2.dZn / 65.38, run2.dCu / 63.55, 1e-9, 'mol Zn dissolved = mol Cu deposited');
  h.near(run2.Q, (run2.dCu / 63.55) * 2 * 96485, 1e-6, 'charge = 2F × mol Cu (Faraday)');
  h.near(run2.cZn - 1, 1 - run2.cCu, 1e-9, '[Zn²⁺] rises as much as [Cu²⁺] falls');
  // Nernst readings through the UI
  await page.evaluate(() => { const st = GalvanicLab.state; st.load = 'meter'; st.L = 'Zn'; st.R = 'Cu'; st.cL = 1; st.flat = false; for (const c of [1, 0.1, 0.01, 0.001]) { st.cR = c; GalvanicLab.record(); } GalvanicLab.refresh(); });
  h.check(/Best-fit line: E = 1\.100 − 0\.0296/.test(await page.textContent('#g-fit')), 'Nernst plot of the Daniell cell: intercept 1.100 V, slope −0.0296 V');
  // electrolysis
  const e = await page.evaluate(() => {
    const G = GalvanicLab, st = G.state;
    G.setMode('elec');
    st.e.key = 'CuSO4_C'; st.e.V = 6; st.e.on = true;
    for (let i = 0; i < 600; i++) G.stepElec(1);
    const cu = st.e.metal * 63.55, o2 = st.e.gasA * 24000, I = st.e.I;
    G.recordElec();
    st.e.key = 'H2SO4'; Object.assign(st.e, { t: 0, Q: 0, gasA: 0, gasC: 0, metal: 0, h2After: 0, on: true, V: 6 });
    for (let i = 0; i < 300; i++) G.stepElec(1);
    const ratio = st.e.gasC / st.e.gasA;
    st.e.V = 1.0; G.stepElec(1);
    return { cu, o2, I, ratio, Ilow: st.e.I };
  });
  h.near(e.I, (6 - 1.49) / 4, 1e-9, 'electrolysis current I = (V − decomposition voltage)/R');
  h.near(e.cu, (e.I * 600 / 96485 / 2) * 63.55, 1e-9, `Faraday: ${e.cu.toFixed(4)} g Cu in 10 min at ${e.I.toFixed(3)} A`);
  h.near(e.o2, (e.I * 600 / 96485 / 4) * 24000, 1e-6, 'O₂ volume = Q/4F × 24 dm³/mol');
  h.near(e.ratio, 2, 1e-9, 'electrolysis of water: H₂ : O₂ = 2 : 1');
  h.eq(e.Ilow, 0, 'no current below the decomposition voltage');

  /* ---------------- calorimetry ---------------- */
  await page.evaluate(() => { location.hash = '#labs/calorimetry'; });
  await page.waitForSelector('#c-canvas');
  const cal = await page.evaluate(() => {
    const C = CalorimetryLab;
    const doRun = (expt, params, mixAt = 60, after = 420) => {
      C.setExpt(expt, params); C.startRun(); C.simulate(mixAt); C.mix(); C.simulate(after); C.stop();
      return C.state.runs[C.state.runs.length - 1];
    };
    const out = {};
    const calib = doRun('calib', { vol: 50, hotT: 45 });
    out.Ccal = C.state.calib.C;
    const dH = (r) => { const a = r.analysis, am = C.amount(r); return -((C.liquidMass(r) * 4.18 + C.CUP_CP) * a.dT) / am.n / 1000; };
    const n = doRun('neutral', { acid: 'HCl', vol: 50 });
    out.neutral = dH(n); out.dTneutral = n.analysis.dT; out.dTraw = n.analysis.dTraw;
    out.nh4no3 = dH(doRun('dissolve', { salt: 'NH4NO3', saltG: 4, vol: 50 }));
    out.naoh = dH(doRun('dissolve', { salt: 'NaOH', saltG: 2, vol: 50 }));
    out.zn = dH(doRun('displace', { vol: 50, znG: 2 }, 60, 600));
    out.mg = dH(doRun('mg', { vol: 50, mgG: 0.2 }));
    out.hac = dH(doRun('neutral', { acid: 'HAc', vol: 50 }));
    return out;
  });
  h.near(cal.Ccal, 18, 4, `calibration finds the cup's heat capacity (${cal.Ccal.toFixed(1)} J/K; true 18 J/K)`);
  h.near(cal.dTneutral, 2790 / (100 * 4.18 + 18), 0.15, 'neutralisation 50 + 50 mL of 1 M: ΔT = 2790 J / 436 J/K = 6.4 K');
  h.check(cal.dTneutral >= cal.dTraw - 0.02, 'extrapolation corrects for heat loss (ΔT ≥ peak ΔT)');
  h.near(cal.neutral, -55.8, 1.5, `ΔH neutralisation ${cal.neutral.toFixed(1)} kJ/mol (−55.8)`);
  h.near(cal.hac, -55.9, 2.5, `ΔH ethanoic acid + NaOH ${cal.hac.toFixed(1)} kJ/mol (≈ −56)`);
  h.near(cal.nh4no3, 25.7, 2.5, `ΔH solution NH₄NO₃ ${cal.nh4no3.toFixed(1)} kJ/mol (+25.7)`);
  h.near(cal.naoh, -44.5, 3, `ΔH solution NaOH ${cal.naoh.toFixed(1)} kJ/mol (−44.5)`);
  h.near(cal.zn, -218.7, 15, `ΔH Zn + Cu²⁺ ${cal.zn.toFixed(0)} kJ/mol (−218.7)`);
  h.near(cal.mg, -466.9, 30, `ΔH Mg + 2H⁺ ${cal.mg.toFixed(0)} kJ/mol (−466.9)`);
  await page.click('#lab-report-btn');
  await page.waitForSelector('#report-overlay:not(.hidden)');
  h.check(/Calibration/.test(await page.textContent('#report-doc')), 'calorimetry report includes the calibration');
  await page.click('#rep-close');

  // saved reports appear on the labs home page
  await page.evaluate(() => { location.hash = '#labs'; });
  await page.waitForSelector('.saved-row', { timeout: 5000 }).catch(() => {});
  h.check(await page.locator('.saved-row').count() >= 2, 'reports are saved and listed on the labs home page');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
