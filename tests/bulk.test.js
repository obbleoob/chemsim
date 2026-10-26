/* Bulk & phase science (Phase 5): reference data and physics checks. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#beaker/phase');
  await page.waitForSelector('#ph-canvas');

  /* ---------- phase diagrams ---------- */
  const ph = await page.evaluate(() => {
    const W = PhaseDiagram.SUBSTANCES.water, C = PhaseDiagram.SUBSTANCES.co2, cl = PhaseDiagram.classify, tr = PhaseDiagram.transitions;
    return {
      wBoil: tr(W, 101325).boil, wMelt: tr(W, 101325).melt, wVap25: W.pVap(298.15), wSub: W.pSub(263.15), wVapTt: W.pVap(W.Tt), wVapTc: W.pVap(W.Tc - 1e-9),
      wPhases: [cl(W, 298.15, 101325), cl(W, 263.15, 101325), cl(W, 400, 101325), cl(W, 700, 30e6), cl(W, 263.15, 150e6), cl(W, 250, 50)],
      cSub: tr(C, 101325).sublime, cVap20: C.pVap(293.15), cPhases: [cl(C, 298.15, 101325), cl(C, 190, 101325), cl(C, 250, 2e6), cl(C, 320, 10e6)], cBoil1: tr(C, 101325).boil,
      boilEverest: tr(W, 33700).boil,
    };
  });
  h.near(ph.wBoil, 373.12, 0.05, `water boils at 373.12 K at 1 atm (${ph.wBoil.toFixed(3)})`);
  h.near(ph.wMelt, 273.152, 0.01, 'ice melts at 273.15 K at 1 atm');
  h.near(ph.wVap25 / 3169.9, 1, 0.003, 'vapour pressure of water at 25 °C: 3.17 kPa');
  h.near(ph.wSub / 259.9, 1, 0.01, 'vapour pressure of ice at −10 °C: 260 Pa');
  h.near(ph.wVapTt / 611.657, 1, 0.002, 'vapour-pressure curve meets the triple point');
  h.near(ph.wVapTc / 22.064e6, 1, 0.001, 'vapour-pressure curve ends at the critical point');
  h.eq(ph.wPhases, ['liquid', 'solid', 'gas', 'supercritical', 'liquid', 'gas'], 'water phases: 25 °C liquid, −10 °C ice, 400 K steam, supercritical, ice melts under 150 MPa, vapour at 50 Pa (below ice’s 76 Pa vapour pressure)');
  h.near(ph.boilEverest, 344.7, 1.0, 'water boils at about 71 °C on Everest (33.7 kPa)');
  h.near(ph.cSub, 194.7, 0.3, `dry ice sublimes at 194.7 K (−78.5 °C) at 1 atm (${ph.cSub && ph.cSub.toFixed(2)})`);
  h.check(ph.cBoil1 === undefined, 'CO₂ has no boiling point at 1 atm (triple point is at 5.1 atm)');
  h.near(ph.cVap20 / 5.729e6, 1, 0.01, 'CO₂ vapour pressure at 20 °C: 5.73 MPa');
  h.eq(ph.cPhases, ['gas', 'solid', 'liquid', 'supercritical'], 'CO₂ phases: gas at room conditions, dry ice at 190 K, liquid at 250 K/2 MPa, supercritical at 320 K/10 MPa');
  await page.click('#ph-tp');
  h.check(/triple point|solid|liquid|gas/i.test(await page.textContent('#ph-phase')), 'triple-point button works');

  /* ---------- particle box (Lennard-Jones MD) ---------- */
  await page.evaluate(() => { location.hash = '#beaker/particles'; });
  await page.waitForSelector('#pb-canvas');
  const md = await page.evaluate(() => {
    const P = ParticleBox, s = P.sim, out = {};
    // ideal-ish gas: repulsion only, dilute
    s.attract = false; s.thermo = true; s.gravity = 0; P.init(400, 0.05, 1.5);
    for (let i = 0; i < 3000; i++) P.step();
    let Z = 0, T = 0, n = 0;
    for (let i = 0; i < 3000; i++) { P.step(); if (i % 20 === 0) { const m = P.measure(); Z += m.Z; T += m.T; n++; } }
    out.Zideal = Z / n; out.T = T / n;
    let vs = 0; for (let i = 0; i < s.N; i++) vs += Math.hypot(s.vx[i], s.vy[i]); out.vmean = vs / s.N; out.vth = Math.sqrt(Math.PI * out.T / 2);
    // attractions at low temperature lower the pressure
    s.attract = true; P.init(500, 0.3, 0.45);
    for (let i = 0; i < 4000; i++) P.step();
    let Z2 = 0, nb = 0; n = 0;
    for (let i = 0; i < 2000; i++) { P.step(); if (i % 20 === 0) { const m = P.measure(); Z2 += m.Z; nb += m.neighbours; n++; } }
    out.Zlj = Z2 / n; out.nb = nb / n;
    // energy conservation without the thermostat
    s.thermo = false; P.init(400, 0.3, 1.0);
    for (let i = 0; i < 500; i++) P.step();
    const e0 = P.measure().eN;
    for (let i = 0; i < 3000; i++) P.step();
    out.drift = Math.abs(P.measure().eN - e0);
    s.thermo = true;
    return out;
  });
  h.near(md.Zideal, 1.0, 0.12, `dilute repulsive gas behaves ideally: Z = PV/NkT ≈ 1 (${md.Zideal.toFixed(3)})`);
  h.near(md.T, 1.5, 0.08, 'thermostat holds the set temperature');
  h.near(md.vmean / md.vth, 1, 0.06, 'mean speed matches 2D Maxwell–Boltzmann √(πkT/2m)');
  h.check(md.Zlj < 0.6 && md.nb > 2.0, `attractions at T* = 0.45: particles cluster (Z ${md.Zlj.toFixed(2)}, ${md.nb.toFixed(1)} neighbours)`);
  h.check(md.drift < 0.02, `constant energy without the thermostat (drift ${md.drift.toFixed(4)} ε per particle)`);

  /* ---------- diffusion & mixing ---------- */
  await page.evaluate(() => { location.hash = '#beaker/mixing'; });
  await page.waitForSelector('#mx-canvas');
  const mx = await page.evaluate(() => {
    const M = Mixing, out = {};
    out.eta25 = M.etaWater(298.15) * 1000; out.eta80 = M.etaWater(353.15) * 1000;
    out.D = M.diffusionCoefficient(298.15, 0.5e-9);
    M.dye.n = 4000; M.dye.stir = false; M.dye.T = 298.15; M.dye.r = 0.5e-9; M.dye.start = 'line'; M.dyeInit();
    for (let i = 0; i < 200; i++) M.dyeStep(1);
    const m = M.msd(); out.msdRatio = m.x / (2 * out.D * M.dye.t); out.msdRatioY = m.y / (2 * out.D * M.dye.t);
    out.Dhot = M.diffusionCoefficient(353.15, 0.5e-9) / out.D;
    Object.assign(M.lat, { W: 60, H: 40, chi: 0, grav: 0, xA: 0.5, start: 'layers' }); M.latInit();
    for (let i = 0; i < 1500; i++) M.latSweep(M.lat.W * M.lat.H);
    out.mixMiscible = M.mixedness();
    Object.assign(M.lat, { chi: 4.5, grav: 0, xA: 0.5, start: 'shake' }); M.latInit();
    const start = M.mixedness();
    for (let i = 0; i < 60; i++) M.latSweep(M.lat.W * M.lat.H);
    out.mixShaken0 = start; out.mixImmiscible = M.mixedness();
    out.dg = [M.dGmix(0.5, 1), M.dGmix(0.25, 1), M.dGmix(0.5, 3), M.dGmix(0.15, 3)];
    return out;
  });
  h.near(mx.eta25, 0.890, 0.015, 'viscosity of water at 25 °C: 0.890 mPa·s');
  h.near(mx.eta80, 0.355, 0.02, 'viscosity of water at 80 °C: 0.355 mPa·s');
  h.near(mx.D * 1e10, 4.9, 0.1, 'Stokes–Einstein D for a 0.5 nm molecule in water: 4.9 × 10⁻¹⁰ m²/s');
  h.check(Math.abs(mx.msdRatio - 1) < 0.08 && Math.abs(mx.msdRatioY - 1) < 0.08, `random walk obeys ⟨Δx²⟩ = 2Dt (${mx.msdRatio.toFixed(3)}, ${mx.msdRatioY.toFixed(3)})`);
  h.check(mx.Dhot > 2.5, `dye diffuses ${mx.Dhot.toFixed(1)}× faster at 80 °C (lower viscosity, higher T)`);
  h.check(mx.mixMiscible > 0.6, `χ = 0: layers mix by themselves (mixedness ${mx.mixMiscible.toFixed(2)})`);
  h.check(mx.mixShaken0 > 0.9 && mx.mixImmiscible < 0.5, `χ = 4.5: a shaken mixture separates again (${mx.mixShaken0.toFixed(2)} → ${mx.mixImmiscible.toFixed(2)})`);
  h.check(mx.dg[0] < mx.dg[1] && mx.dg[2] > mx.dg[3], 'ΔG_mix: one minimum at χ = 1, a central hump at χ = 3 (phase separation above χ = 2)');

  /* ---------- property trends ---------- */
  await page.evaluate(() => { location.hash = '#beaker/trends'; });
  await page.waitForSelector('#tr-plot');
  const tr = await page.evaluate(() => {
    const S = Trends.SERIES;
    const inc = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
    return { alkInc: inc(S.alkanes.bp), alcInc: inc(S.alcohols.bp), hb: S.alcohols.bp.every((v, i) => v > S.alkanes.bp[i]), acid: S.acids.bp.every((v, i) => v > S.alcohols.bp[i]), ch4: S.alkanes.bp[0], butanol: S.alcohols.solubility[3], floats: S.alkanes.density.filter((v) => v !== null).every((v) => v < 1) };
  });
  h.check(tr.alkInc && tr.alcInc, 'boiling point rises with every extra CH₂ (alkanes and alcohols)');
  h.check(tr.hb, 'every 1-alkanol boils higher than the alkane with the same number of carbons (hydrogen bonding)');
  h.check(tr.acid, 'carboxylic acids boil higher still (H-bonded dimers)');
  h.eq(tr.ch4, -161.5, 'methane boils at −161.5 °C');
  h.check(tr.floats, 'all liquid alkanes are less dense than water');
  for (const p of ['mp', 'density', 'viscosity', 'tension', 'solubility']) { await page.click(`[data-p="${p}"]`); }

  /* ---------- polymers ---------- */
  await page.evaluate(() => { location.hash = '#beaker/polymer'; });
  await page.waitForSelector('#py-canvas');
  const py = await page.evaluate(() => {
    const P = Polymer, c = P.ch, out = {};
    out.cos0 = P.meanCos(0); out.th0 = P.theoryRee2(20, 0); out.cos3 = P.meanCos(3);
    const run = (N, kappa, eps, phantom, steps) => {
      Object.assign(c, { kappa, eps, phantom }); P.chainInit(N);
      for (let i = 0; i < 4000; i++) P.chainStep();
      let r2 = 0, g2 = 0, n = 0;
      for (let i = 0; i < steps; i++) { P.chainStep(); if (i % 40 === 0) { const s = P.sizes(); r2 += s.ree2; g2 += s.rg2; n++; } }
      return { ree2: r2 / n, rg2: g2 / n };
    };
    out.phantom = run(16, 0, 0, true, 120000);
    out.stiff = run(16, 3, 0, true, 120000);
    out.good = run(30, 0.0, 0.0, false, 40000);
    out.poor = run(30, 0.0, 1.3, false, 40000);
    out.thStiff = P.theoryRee2(16, 3);
    return out;
  });
  h.check(py.cos0 === 0 && py.th0 === 19, 'freely jointed chain theory: ⟨R²⟩ = (N − 1) b²');
  h.near(py.cos3, 0.80, 0.02, '⟨cos θ⟩ for κ = 3kT in 2D: I₁(3)/I₀(3) = 0.80');
  h.near(py.phantom.ree2 / 15, 1, 0.25, `phantom chain simulation matches ⟨R²⟩ = (N − 1) b² (${(py.phantom.ree2 / 15).toFixed(2)})`);
  h.near(py.stiff.ree2 / py.thStiff, 1, 0.25, `stiff phantom chain matches the freely rotating chain (${(py.stiff.ree2 / py.thStiff).toFixed(2)})`);
  h.check(py.good.rg2 > 1.5 * py.poor.rg2, `good solvent swells the coil; poor solvent collapses it (R_g² ${py.good.rg2.toFixed(1)} vs ${py.poor.rg2.toFixed(1)})`);
  h.check(/Molar mass/.test(await page.textContent('#py-mass')), 'polymer molar mass shown');

  /* ---------- the beaker sandbox still works ---------- */
  await page.evaluate(() => { location.hash = '#beaker'; });
  await page.waitForTimeout(300);
  h.check(await page.isVisible('#beaker-canvas') && !(await page.isVisible('#bulk-stage')), 'Beaker sandbox comes back at #beaker');
  const pH = await page.evaluate(() => { ChemBeaker.sim.reset({ waterML: 50 }); ChemBeaker.add('HCl01', 10); return ChemBeaker.sim.state.eq.pH; });
  h.near(pH, 1.78, 0.05, 'sandbox chemistry still runs (0.1 M HCl diluted 1:6, pH 1.78)');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
