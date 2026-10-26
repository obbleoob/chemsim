/* Beaker Lab: textbook reference experiments must give textbook results. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#beaker');
  await page.waitForSelector('#beaker-canvas');

  // Run a scenario inside the page. steps: [['add', id, amount] | ['run', s] | ['set', key, value]]
  const run = (steps, water = 100) => page.evaluate(({ steps, water }) => {
    const B = ChemBeaker.sim;
    B.reset({ waterML: water });
    for (const st of steps) {
      if (st[0] === 'add') B.add(st[1], st[2]);
      else if (st[0] === 'run') B.runFor(st[1]);
      else if (st[0] === 'set') B.state[st[1]] = st[2];
    }
    const s = B.state;
    return {
      pH: s.eq.pH, T: s.T, V: s.V, solids: s.eq.solids, species: s.eq.species, gas: s.gas,
      gasRate: s.gasRate, lumps: s.lumps.map((l) => ({ key: l.key, n: l.n, coat: l.coat })),
      soluble: s.soluble, color: B.liquidColor(), log: s.log.map((e) => e.text),
    };
  }, { steps, water });
  const solidsMol = (r, name) => (r.solids[name] || 0) * r.V;

  // ---- acids, bases, buffers ----
  let r = await run([['add', 'HCl01', 50], ['add', 'NaOH01', 50]], 0.001);
  h.near(r.pH, 7.08, 0.05, 'HCl + NaOH (equal moles) → neutral (pH 7.08 at 20 °C)');
  h.near(r.T - 20, 0.58, 0.05, 'neutralisation warms by 0.58 K (ΔH = −55.8 kJ/mol)');
  r = await run([['add', 'HAc', 10]], 90);
  h.near(r.pH, 2.88, 0.06, '0.1 M ethanoic acid pH 2.88');
  r = await run([['add', 'NH3', 10]], 90);
  h.near(r.pH, 11.2, 0.12, '0.1 M ammonia pH ≈ 11.1–11.3');
  r = await run([['add', 'HAc', 10], ['add', 's_NaAc', 0.8203], ['run', 30]], 90);
  h.near(r.pH, 4.76, 0.08, 'acetate buffer (0.1 M / 0.1 M) pH ≈ pKa = 4.76');
  r = await run([['add', 'Na2CO3sol', 10]], 90);
  h.near(r.pH, 11.66, 0.12, '0.1 M sodium carbonate pH ≈ 11.6');

  // ---- dissolving: endothermic & exothermic ----
  r = await run([['add', 's_NH4NO3', 10], ['run', 60]], 50);
  h.check(r.T < 10, 'dissolving ammonium nitrate cools the water (instant cold pack)', `T=${r.T.toFixed(1)}`);
  r = await run([['add', 's_NaOH', 2], ['run', 30]], 50);
  h.near(r.T, 28.1, 1.0, 'dissolving 2 g NaOH in 50 mL warms it by ~8 K');
  h.check(r.pH > 13.5, 'and gives a strongly alkaline solution');

  // ---- precipitation ----
  r = await run([['add', 'AgNO3', 5], ['add', 'NaCl1', 1]], 50);
  h.check(solidsMol(r, 'AgCl') > 4.9e-4, 'AgNO₃ + NaCl → white AgCl precipitate');
  r = await run([['add', 'AgNO3', 5], ['add', 'NaCl1', 1], ['add', 'NH3', 30]], 50);
  h.check(!solidsMol(r, 'AgCl'), 'AgCl dissolves in excess ammonia ([Ag(NH₃)₂]⁺)');
  r = await run([['add', 'AgNO3', 5], ['add', 'KIsol', 10], ['add', 'NH3', 30]], 50);
  h.check(solidsMol(r, 'AgI') > 4e-4, 'AgI does NOT dissolve in ammonia');
  r = await run([['add', 'BaCl2', 5], ['add', 'H2SO4', 1]], 50);
  h.check(solidsMol(r, 'BaSO4') > 4.9e-4, 'BaCl₂ + sulfate → white BaSO₄ (even in acid)');
  r = await run([['add', 'PbNO3', 5], ['add', 'KIsol', 20]], 50);
  h.check(solidsMol(r, 'PbI2') > 4e-4, 'Pb(NO₃)₂ + KI → yellow PbI₂');
  r = await run([['add', 'CuSO4sol', 10], ['add', 'NaOH1', 5]], 50);
  h.check(solidsMol(r, 'Cu(OH)2') > 2.4e-3, 'CuSO₄ + NaOH → pale blue Cu(OH)₂');
  r = await run([['add', 'CuSO4sol', 1], ['add', 'NH3', 2], ['add', 'NH3', 60]], 10);
  h.check(!solidsMol(r, 'Cu(OH)2') && r.species['Cu(NH3)4++'] > 0.005, 'excess ammonia gives the deep-blue [Cu(NH₃)₄]²⁺ solution');
  h.check(r.color[2] > 0.6 && r.color[0] < 0.35, 'deep-blue colour', JSON.stringify(r.color));
  r = await run([['add', 'ZnSO4', 2], ['add', 'NaOH1', 2]], 50);
  h.check(solidsMol(r, 'Zn(OH)2') > 5e-4, 'Zn²⁺ + a little NaOH → white Zn(OH)₂');
  r = await run([['add', 'ZnSO4', 2], ['add', 'NaOH1', 40]], 50);
  h.check(solidsMol(r, 'Zn(OH)2') < 1e-4, 'Zn(OH)₂ dissolves in excess NaOH (amphoteric)');
  r = await run([['add', 'FeCl3', 5], ['add', 'NaOH1', 5]], 50);
  h.check(solidsMol(r, 'Fe(OH)3') > 4.9e-4, 'Fe³⁺ + NaOH → rust-brown Fe(OH)₃');
  r = await run([['add', 'FeCl3', 1], ['add', 'KSCN', 2]], 50);
  h.check(r.species['FeSCN++'] > 1e-5 && r.color[0] > r.color[2] * 1.3, 'Fe³⁺ + SCN⁻ → blood-red [Fe(SCN)]²⁺');
  r = await run([['add', 'limewater', 20]], 0.001);
  h.near(r.pH, 12.77, 0.08, 'limewater (0.02 M) pH ≈ 12.8 at 20 °C');
  h.check(!solidsMol(r, 'Ca(OH)2'), 'saturated limewater stays clear');

  // ---- metals ----
  r = await run([['add', 'HCl1', 50], ['add', 'm_Mg', 0.1], ['run', 90]], 40);
  h.check(r.lumps[0].n < 1e-4, 'magnesium dissolves in 1 M HCl within ~90 s');
  h.check(r.T > 23, 'Mg + HCl is exothermic', `T=${r.T.toFixed(1)}`);
  h.check(r.log.some((t) => t.includes('hydrogen')), 'notebook records hydrogen');
  r = await run([['add', 'HCl1', 20], ['add', 'm_Cu', 1], ['run', 60]], 30);
  h.check(r.lumps[0].n > 0.0157 * 0.999, 'copper does not react with hydrochloric acid');
  r = await run([['add', 'm_Na', 0.1], ['run', 30]], 100);
  h.near(r.pH, 12.7, 0.15, 'sodium + water → NaOH solution (pH ≈ 12.7)');
  h.check(r.T > 21, 'sodium + water is exothermic');
  r = await run([['add', 'CuSO4sol', 20], ['add', 'm_Zn', 1], ['run', 240]], 50);
  h.check((r.lumps[0].coat.Cu || 0) > 0.002, 'zinc displaces copper from CuSO₄ (copper deposit)');
  r = await run([['add', 'AgNO3', 20], ['add', 'm_Cu', 1], ['run', 120]], 50);
  h.check((r.lumps[0].coat.Ag || 0) > 3e-4 && r.species.Cu > 1e-3, 'copper + silver nitrate → silver crystals and blue Cu²⁺');

  // ---- gases & tests ----
  const tests = (steps, water, fn) => page.evaluate(({ steps, water, fn }) => {
    const B = ChemBeaker.sim;
    B.reset({ waterML: water });
    for (const st of steps) { if (st[0] === 'add') B.add(st[1], st[2]); else B.runFor(st[1]); }
    return B[fn]().result;
  }, { steps, water, fn });
  h.eq(await tests([['add', 'HCl1', 50], ['add', 'm_Mg', 0.2], ['run', 5]], 40, 'litSplint'), 'pop', 'Mg + HCl: lit splint gives a squeaky pop (H₂)');
  h.eq(await tests([['add', 'HCl1', 30], ['add', 'l_CaCO3', 2], ['run', 10]], 50, 'limewaterTest'), 'milky', 'marble + HCl: limewater turns milky (CO₂)');
  h.eq(await tests([['add', 'HCl1', 30], ['add', 'l_CaCO3', 2], ['run', 10]], 50, 'litSplint'), 'out', 'marble + HCl: CO₂ puts out a lit splint');
  h.eq(await tests([['add', 'H2O2', 30], ['add', 'l_MnO2', 0.5], ['run', 5]], 50, 'glowingSplint'), 'relight', 'H₂O₂ + MnO₂: a glowing splint relights (O₂)');
  h.eq(await tests([['add', 'NH4Clsol', 10], ['add', 'NaOH1', 15], ['run', 1]], 50, 'dampLitmus'), 'none', 'cold ammonium + alkali: little ammonia yet');
  h.eq(await tests([['add', 'bleach', 10], ['add', 'HCl1', 10], ['run', 3]], 50, 'dampLitmus'), 'bleached', 'bleach + acid: chlorine bleaches damp litmus');
  r = await run([['add', 'bleach', 10], ['add', 'HCl1', 10], ['run', 3]], 50);
  h.check(r.log.some((t) => t.includes('CHLORINE')), 'bleach + acid triggers a chlorine safety warning');
  h.eq(await tests([['add', 'H2O2', 1]], 0.001, 'litSplint'), 'none', 'no gas: splint just burns');

  // ---- solubility and temperature ----
  r = await run([['add', 's_KNO3', 30], ['run', 120], ['set', 'burnerW', 800], ['run', 120], ['set', 'burnerW', 0], ['run', 20]], 50);
  h.check(r.soluble.KNO3.crystals < 1e-6 && r.T > 40, 'heating dissolves all the potassium nitrate', `T=${r.T.toFixed(0)} crystals=${r.soluble.KNO3.crystals}`);
  r = await run([['add', 's_KNO3', 30], ['run', 120], ['set', 'burnerW', 800], ['run', 120], ['set', 'burnerW', 0], ['set', 'ice', true], ['run', 400]], 50);
  h.check(r.soluble.KNO3.crystals * 101.1 > 15 && r.T < 6, 'cooling in ice brings KNO₃ crystals back', `T=${r.T.toFixed(1)} g=${(r.soluble.KNO3.crystals * 101.1).toFixed(1)}`);
  r = await run([['set', 'burnerW', 1000], ['run', 400]], 50);
  h.check(r.T <= 100.001 && r.V < 0.05, 'boiling caps at 100 °C and evaporates water', `T=${r.T} V=${r.V}`);

  // ---- indicators ----
  const ind = (steps) => page.evaluate((steps) => {
    const B = ChemBeaker.sim; B.reset({ waterML: 50 });
    steps.forEach((st) => B.add(st[0], st[1]));
    return B.liquidColor();
  }, steps);
  const pinkBase = await ind([['NaOH1', 5], ['i_phph', 3]]);
  const clearAcid = await ind([['HCl1', 5], ['i_phph', 3]]);
  h.check(pinkBase[1] < 0.6 && pinkBase[0] > 0.7, 'phenolphthalein is pink in alkali', JSON.stringify(pinkBase));
  h.check(clearAcid[1] > 0.85, 'phenolphthalein is colourless in acid', JSON.stringify(clearAcid));
  const moAcid = await ind([['HCl1', 5], ['i_mo', 3]]);
  h.check(moAcid[0] > moAcid[1] * 1.5, 'methyl orange is red in acid', JSON.stringify(moAcid));

  // ---- the page itself ----
  await page.evaluate(() => { ChemBeaker.sim.reset({ waterML: 100 }); ChemBeaker.add('CuSO4sol', 10); });
  await page.waitForTimeout(600);
  h.check((await page.textContent('#r-species')).includes('Cu²⁺'), 'species table lists Cu²⁺');
  await page.click('.shelf-item[data-id="NaOH1"]');
  await page.click('#shelf-go');
  await page.waitForTimeout(600);
  h.check((await page.textContent('#r-solids')).includes('Cu(OH)2'), 'adding from the shelf works and shows the precipitate');
  h.check((await page.textContent('#r-log')).includes('precipitate'), 'notebook logs the precipitate');
  await page.click('[data-test="flame"]');
  h.check((await page.textContent('#test-result')).toLowerCase().includes('sodium'), 'flame test shows sodium (from NaOH)');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
