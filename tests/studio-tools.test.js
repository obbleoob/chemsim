/* Molecule Studio tools (Phase 4): every tool against textbook examples. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#studio');
  await h.waitForRDKit(page);
  const load = (smi) => page.evaluate((s) => ChemSim.loadSmiles(s, { quiet: true }), smi);

  /* ---------- curved arrows ---------- */
  await load('[OH-].CBr');
  const pos = await page.evaluate(() => {
    const s = ChemSim.state, r = document.getElementById('canvas').getBoundingClientRect();
    const sc = (a) => ({ x: r.left + a.x * s.view.scale + s.view.x, y: r.top + a.y * s.view.scale + s.view.y });
    const O = s.atoms.find((a) => a.el === 'O'), C = s.atoms.find((a) => a.el === 'C'), Br = s.atoms.find((a) => a.el === 'Br');
    return { O: sc(O), C: sc(C), Br: sc(Br), mid: { x: (sc(C).x + sc(Br).x) / 2, y: (sc(C).y + sc(Br).y) / 2 } };
  });
  await page.click('[data-tool="arrow"][data-arrow="full"]');
  await page.mouse.click(pos.O.x, pos.O.y); await page.mouse.click(pos.C.x, pos.C.y);
  await page.mouse.click(pos.mid.x, pos.mid.y); await page.mouse.click(pos.Br.x, pos.Br.y);
  let ar = await page.evaluate(() => ChemSim.state.arrows.map((a) => `${a.kind}:${a.from.type}->${a.to.type}`));
  h.eq(ar, ['full:atom->atom', 'full:bond->atom'], 'SN2 arrows: lone pair → C, C–Br bond → Br');
  await page.keyboard.press('Control+z');
  h.eq(await page.evaluate(() => ChemSim.state.arrows.length), 1, 'undo removes the last arrow');
  await page.waitForTimeout(700);
  h.check(await page.evaluate(async () => ((await ChemStore.get('autosave', 'studio')).arrows || []).length === 1), 'arrows are autosaved with the drawing');
  await page.click('[data-tool="atom"][data-el="C"]');

  /* ---------- spectra ---------- */
  const H = (smi) => page.evaluate((s) => { ChemSim.loadSmiles(s, { quiet: true }); return Spectra.predictH().map((e) => ({ d: e.shift, n: e.n, m: e.mult })); }, smi);
  const has = (envs, d, n, m, tol = 0.3) => envs.some((e) => Math.abs(e.d - d) <= tol && e.n === n && (!m || e.m === m));
  let E = await H('CCO');
  h.check(E.length === 3 && has(E, 3.69, 2, 'q') && has(E, 1.22, 3, 't') && has(E, 2.5, 1, 'br s', 2.5), 'ethanol ¹H: 3.7 (2H, q), 1.2 (3H, t), OH (br s)', JSON.stringify(E));
  E = await H('CCOC(C)=O');
  h.check(E.length === 3 && has(E, 4.12, 2, 'q') && has(E, 2.05, 3, 's') && has(E, 1.26, 3, 't'), 'ethyl ethanoate ¹H: 4.1 q, 2.0 s, 1.3 t', JSON.stringify(E));
  E = await H('CC(C)=O');
  h.check(E.length === 1 && has(E, 2.17, 6, 's'), 'propanone ¹H: one singlet, 6H, 2.2 ppm', JSON.stringify(E));
  E = await H('c1ccccc1');
  h.check(E.length === 1 && has(E, 7.27, 6), 'benzene ¹H: one signal, 6H, 7.3 ppm', JSON.stringify(E));
  E = await H('CC(C)O');
  h.check(has(E, 4.0, 1, 'sept', 0.45) && has(E, 1.2, 6, 'd'), 'propan-2-ol ¹H: CH septet, 2×CH₃ doublet (6H)', JSON.stringify(E));
  E = await H('CC=O');
  h.check(has(E, 9.79, 1, 'q') && has(E, 2.2, 3, 'd'), 'ethanal ¹H: CHO quartet at 9.8, CH₃ doublet', JSON.stringify(E));
  E = await H('Cc1ccccc1');
  h.check(has(E, 2.35, 3, 's') && E.filter((e) => e.d > 6.5).reduce((a, e) => a + e.n, 0) === 5, 'methylbenzene ¹H: CH₃ singlet at 2.3, 5 aromatic H', JSON.stringify(E));
  E = await H('c1ccncc1');
  h.check(E.length === 3 && has(E, 8.6, 2) && has(E, 7.25, 2) && has(E, 7.65, 1), 'pyridine ¹H: 8.6 (2H), 7.7 (1H), 7.3 (2H)', JSON.stringify(E));
  const C = (smi) => page.evaluate((s) => { ChemSim.loadSmiles(s, { quiet: true }); return Spectra.predictC().length; }, smi);
  h.eq([await C('CCO'), await C('Cc1ccccc1'), await C('c1ccccc1'), await C('CC(C)=O'), await C('Cc1ccc(C)cc1')], [2, 5, 1, 2, 3], '¹³C signal counts: ethanol 2, toluene 5, benzene 1, propanone 2, p-xylene 3');
  const IR = (smi) => page.evaluate((s) => { ChemSim.loadSmiles(s, { quiet: true }); return Spectra.predictIR().flatMap((g) => g.bands.map((b) => b.nu)); }, smi);
  const near = (list, v, tol = 30) => list.some((x) => Math.abs(x - v) <= tol);
  h.check(near(await IR('CC(C)=O'), 1715), 'IR: ketone C=O near 1715 cm⁻¹');
  let ir = await IR('CC(=O)O');
  h.check(near(ir, 3000, 100) && near(ir, 1710), 'IR: carboxylic acid broad O–H ~3000 and C=O ~1710');
  h.check(near(await IR('CCC#N'), 2250), 'IR: nitrile C≡N near 2250');
  ir = await IR('CCO');
  h.check(near(ir, 3350, 60) && !near(ir, 1715, 60), 'IR: alcohol O–H ~3350, no C=O');
  h.check(near(await IR('CC(=O)c1ccccc1'), 1690, 15), 'IR: conjugated ketone C=O lowered to ~1690');

  /* ---------- Hückel ---------- */
  const hk = (smi) => page.evaluate((s) => { ChemSim.loadSmiles(s, { quiet: true }); const r = Huckel.solve(); return { x: r.orbs.map((o) => +o.x.toFixed(3)), E: r.Epi, DE: r.DE, rings: r.rings, homo: r.homo }; }, smi);
  let k = await hk('C=C');
  h.eq(k.x, [1, -1], 'Hückel ethene: α ± β');
  k = await hk('C=CC=C');
  h.eq(k.x, [1.618, 0.618, -0.618, -1.618], 'Hückel butadiene: α ± 1.618β, α ± 0.618β');
  h.near(k.DE, 0.472, 0.002, 'butadiene delocalisation energy 0.472β');
  k = await hk('c1ccccc1');
  h.eq(k.x, [2, 1, 1, -1, -1, -2], 'Hückel benzene: 2, 1, 1, −1, −1, −2');
  h.check(Math.abs(k.DE - 2) < 1e-6 && k.rings[0].aromatic, 'benzene: delocalisation 2β, aromatic (6 π electrons)');
  k = await hk('[CH2+]C=C');
  h.eq(k.x, [1.414, 0, -1.414], 'allyl cation: α + √2β, α, α − √2β');
  k = await hk('C1=CC=C1');
  h.check(k.rings[0].anti && k.x[1] === 0 && k.x[2] === 0, 'cyclobutadiene: antiaromatic, two non-bonding MOs');

  /* ---------- drug-likeness ---------- */
  const dl = (smi) => page.evaluate((s) => { ChemSim.loadSmiles(s, { quiet: true }); const r = DrugLike.compute(); return { v: r.lipV, gi: r.gi, bbb: r.bbb, veber: r.veber.every((x) => x[2]), alerts: r.alerts.map((a) => a.name) }; }, smi);
  let d = await dl('CC(=O)Oc1ccccc1C(=O)O');
  h.check(d.v === 0 && d.gi && !d.bbb && d.veber, 'aspirin: passes Lipinski and Veber, well absorbed, does not enter the brain', JSON.stringify(d));
  d = await dl('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
  h.check(d.v === 0 && d.bbb, 'ibuprofen: passes Lipinski, crosses the blood–brain barrier', JSON.stringify(d));
  d = await dl('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O');
  h.check(d.v >= 1 && !d.veber, 'C40 fatty acid: too greasy (cLogP > 5) and too flexible', JSON.stringify(d));
  d = await dl('Oc1ccccc1O');
  h.check(d.alerts.includes('Catechol'), 'catechol flagged as a PAINS-type alert');

  /* ---------- conformations ---------- */
  const conf = await page.evaluate(() => {
    const out = {};
    for (const [n, s] of [['ethane', 'CC'], ['butane', 'CCCC']]) {
      ChemSim.loadSmiles(s, { quiet: true });
      const list = Conformers.rotatable();
      const b = list.length > 1 ? list[1] : list[0];
      const sc = Conformers.scan(Conformers.setup(b.id, false));
      const at = (deg) => sc.pts.reduce((m, p) => (Math.abs(p[0] - deg) < Math.abs(m[0] - deg) ? p : m), sc.pts[0])[1];
      out[n] = [at(0), at(60), at(120), at(180)];
    }
    return out;
  });
  h.check(Math.abs(conf.ethane[0] - 12) < 0.3 && conf.ethane[1] < 0.3, `ethane: eclipsed 12 kJ/mol above staggered (${conf.ethane.map((v) => v.toFixed(1))})`);
  h.check(Math.abs(conf.butane[0] - 19) < 0.5 && Math.abs(conf.butane[1] - 3.8) < 0.3 && Math.abs(conf.butane[2] - 16) < 0.5 && conf.butane[3] < 0.2, `butane: syn 19, gauche 3.8, eclipsed 16, anti 0 kJ/mol (${conf.butane.map((v) => v.toFixed(1))})`);

  /* ---------- projections ---------- */
  const pj = await page.evaluate(() => {
    const out = {};
    ChemSim.loadSmiles('C[C@H](N)C(=O)O', { quiet: true }); let f = Projections.fischer(); out.ala = [f.top, f.rows[0].left, f.rows[0].right, f.bottom, f.dl.letter];
    ChemSim.loadSmiles('OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)C=O', { quiet: true }); f = Projections.fischer(); out.glc = [f.top, ...f.rows.map((r) => (r.right === 'OH' ? 'R' : 'L')), f.dl.letter];
    ChemSim.loadSmiles('OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', { quiet: true });
    const hw = Projections.haworth(); out.haw = [hw.faces.slice(1).map((x) => x.subs.find((s) => s.label !== 'H').face > 0 ? 'up' : 'down').join(','), hw.series + hw.anomer];
    const ch = Projections.chair(); const best = ch.dG >= 0 ? ch.A : ch.B; out.glcChair = best.atoms.flatMap((a) => a.subs.filter((s) => s.label !== 'H').map((s) => s.axial)).some(Boolean);
    ChemSim.loadSmiles('CC1CCCCC1', { quiet: true }); const mc = Projections.chair(); out.me = Math.abs(mc.dG);
    ChemSim.loadSmiles('CC(C)(C)C1CCCCC1', { quiet: true }); out.tbu = Projections.chair().pA;
    return out;
  });
  h.eq(pj.ala, ['COOH', 'NH₂', 'H', 'CH₃', 'L'], 'Fischer L-alanine: COOH top, NH₂ on the left');
  h.eq(pj.glc, ['CHO', 'R', 'L', 'R', 'R', 'D'], 'Fischer D-glucose: OH right, left, right, right');
  h.eq(pj.haw, ['up,down,up,down,up', 'Dβ'], 'Haworth β-D-glucose: C1 OH up … CH₂OH up, β-anomer');
  h.check(!pj.glcChair, 'β-D-glucose: the favoured chair has every group equatorial');
  h.near(pj.me, 7.3, 0.01, 'methylcyclohexane: chairs differ by the CH₃ A-value (7.3 kJ/mol)');
  h.check(pj.tbu > 99.9 || pj.tbu < 0.1, 'tert-butylcyclohexane is locked in one chair (> 99.9 %)');

  /* ---------- synthesis ---------- */
  const rs = await page.evaluate(() => ({
    asp: Synthesis.retro('CC(=O)Oc1ccccc1C(=O)O').map((r) => r.pre.sort().join(' + ')),
    tert: Synthesis.retro('CCC(C)(C)O').filter((r) => r.id === 'grignard').map((r) => r.pre.sort().join(' + ')),
    ester: Synthesis.retro('CCOC(C)=O').map((r) => r.id),
    biaryl: Synthesis.retro('c1ccc(-c2ccccc2)cc1').map((r) => r.id),
  }));
  h.check(rs.asp.includes('CC(=O)OC(C)=O + O=C(O)c1ccccc1O'), 'retrosynthesis: aspirin ⇐ salicylic acid + ethanoic anhydride');
  h.check(rs.tert.includes('CC(C)=O + CCBr') && rs.tert.includes('CBr + CCC(C)=O'), 'retrosynthesis: 2-methylbutan-2-ol ⇐ both Grignard disconnections');
  h.check(rs.ester.includes('ester_fischer') && rs.ester.includes('ester_acyl'), 'retrosynthesis: ester ⇐ Fischer and acyl chloride routes');
  h.check(rs.biaryl.includes('suzuki'), 'retrosynthesis: biphenyl ⇐ Suzuki coupling');
  const sb = (smi, rg) => page.evaluate(([s, r]) => { ChemSim.loadSmiles(s, { quiet: true }); const b = ChemSim.state.bonds.find((x) => x.order === 2); return Synthesis.sandbox(b.id, r).products.map((p) => p.smi + '|' + p.note); }, [smi, rg]);
  h.check((await sb('C=CC', 'HBr'))[0].startsWith('CC(C)Br'), 'propene + HBr → 2-bromopropane (Markovnikov)');
  h.check((await sb('C=CC', 'HBr_ROOR'))[0].startsWith('CCCBr'), 'propene + HBr/peroxide → 1-bromopropane (anti-Markovnikov)');
  h.check((await sb('C=CC', 'hydrobor'))[0].startsWith('CCCO'), 'propene hydroboration → propan-1-ol');
  h.check(/meso/.test((await sb('C/C=C/C', 'Br2'))[0]), 'trans-but-2-ene + Br₂ (anti) → meso-2,3-dibromobutane');
  h.check(/racemic/.test((await sb('C/C=C\\C', 'Br2'))[0]), 'cis-but-2-ene + Br₂ (anti) → racemic dibromide');
  h.check(/meso/.test((await sb('C/C=C\\C', 'OsO4'))[0]), 'cis-but-2-ene + OsO₄ (syn) → meso diol');
  const ozo = await sb('CC(C)=CC', 'O3');
  h.check(ozo.some((p) => p.startsWith('CC(C)=O')) && ozo.some((p) => p.startsWith('CC=O')), 'ozonolysis of 2-methylbut-2-ene → propanone + ethanal');

  /* ---------- calculator ---------- */
  const calc = await page.evaluate(() => {
    const rx = Calculator.parse('OC(=O)c1ccccc1O.CC(=O)OC(C)=O>>CC(=O)Oc1ccccc1C(=O)O.CC(=O)O');
    rx.species[0].mass = 2.0; rx.species[1].mass = 5.4; Calculator.rxn = rx; Calculator.actual = 2.1; Calculator.desired = 0;
    const c = Calculator.compute();
    const comb = Calculator.parse('C.O=O>>O=C=O.O');
    const nh3 = Calculator.parse('N#N.[H][H]>>N');
    return { AE: c.AE, theory: c.prod.theory, y: c.yieldPct, lim: c.lim.formula.text, nu: comb.species.map((s) => s.nu), nh3: nh3.species.map((s) => s.nu) };
  });
  h.near(calc.AE, 75.0, 0.1, 'aspirin synthesis atom economy 75.0 %');
  h.near(calc.theory, 2.609, 0.002, 'aspirin theoretical yield from 2.0 g salicylic acid: 2.61 g');
  h.near(calc.y, 80.5, 0.1, 'percentage yield 2.1 g / 2.61 g = 80.5 %');
  h.eq(calc.lim, 'C7H6O3', 'salicylic acid is the limiting reagent');
  h.eq(calc.nu, [1, 2, 1, 2], 'balances CH₄ + 2O₂ → CO₂ + 2H₂O');
  h.eq(calc.nh3, [1, 3, 2], 'balances N₂ + 3H₂ → 2NH₃');

  /* ---------- library, notebook, files, presentation, safety ---------- */
  const misc = await page.evaluate(async () => {
    ChemSim.loadSmiles('CC(=O)Oc1ccccc1C(=O)O', { quiet: true });
    await Library.save('Aspirin', 'Drugs', ['NSAID']);
    ChemSim.loadSmiles('CCO', { quiet: true });
    const lib = await Library.all('molecule');
    Library.openRecord(lib.find((x) => x.value.name === 'Aspirin').value);
    const reopened = ChemSim.state.rd.smiles;
    const ex = Files.exports();
    const mb = ex.mol;
    ChemSim.loadSmiles('C', { quiet: true });
    const msg = Files.loadMol(mb);
    const back = ChemSim.state.rd.smiles;
    const svg = Present.figureSVG();
    ChemSim.loadSmiles('CCO', { quiet: true });
    const eth = Safety.lookup(ChemSim.state.rd.smiles);
    ChemSim.loadSmiles('CCCCN=[N+]=[N-]', { quiet: true });
    const az = Safety.estimate();
    return { reopened, inchikey: ex.inchikey, back, msg, svgOk: svg.startsWith('<svg') && (svg.match(/<path/g) || []).length > 10, eth: eth && eth[2], az: az.pics };
  });
  h.eq(misc.reopened, 'CC(=O)Oc1ccccc1C(=O)O', 'library: a saved molecule reopens');
  h.eq(misc.inchikey, 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', 'aspirin InChIKey');
  h.eq(misc.back, 'CC(=O)Oc1ccccc1C(=O)O', 'MOL file export → import round trip');
  h.check(misc.svgOk, 'presentation mode builds a vector SVG');
  h.eq(misc.eth, [2, 7], 'ethanol: flammable + irritant pictograms');
  h.check(misc.az.includes(1), 'an organic azide is flagged as potentially explosive');

  /* ---------- every tab opens without errors ---------- */
  await load('CC(=O)Oc1ccccc1C(=O)O');
  await page.click('#btn-tools');
  const tabs = await page.$$eval('[data-tool-tab]', (els) => els.map((e) => e.dataset.toolTab));
  for (const t of tabs) { await page.click(`[data-tool-tab="${t}"]`); await page.waitForTimeout(250); }
  h.check(tabs.length >= 10, `${tabs.length} tool tabs open (${tabs.join(', ')})`);
  await page.click('#tools-close');
  await page.click('#btn-present'); await page.waitForTimeout(200);
  h.check(await page.isVisible('.present-overlay'), 'presentation mode opens');
  await page.click('#pr-close');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
