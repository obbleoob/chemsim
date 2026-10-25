/* Molecule Studio: examples, valence checker, drawing tools, 3D stereo,
   PNG export, autosave. */
'use strict';

// [SMILES, expected canonical SMILES, expected stereo text (substring), expected issue level or null]
const EXAMPLES = [
  ['C[C@H](N)C(=O)O', 'C[C@H](N)C(=O)O', '(S)', null],
  ['CC[C@@H](C)O', 'CC[C@@H](C)O', '(R)', null],
  ['C/C=C\\C', 'C/C=C\\C', '(Z)', null],
  ['C/C=C/C', 'C/C=C/C', '(E)', null],
  ['C[N+](=O)[O-]', 'C[N+](=O)[O-]', '', null],
  ['C[C+](C)C', 'C[C+](C)C', '', 'warn'],
  ['FB(F)F', 'FB(F)F', '', 'warn'],
  ['OS(=O)(=O)O', 'O=S(=O)(O)O', '', 'info'],
  ['CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'CC(C)Cc1ccc(C(C)C(=O)O)cc1', 'undefined', null],
];

// Stereo must survive the trip through the 3D builder.
const STEREO_3D = ['C[C@H](N)C(=O)O', 'C[C@@H](N)C(=O)O', 'CC[C@@H](C)O', 'C/C=C\\C', 'C/C=C/C',
  'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'CN1CCC[C@H]1c1cccnc1', 'F[C@](Cl)(Br)I', 'F[C@@](Cl)(Br)I',
  'C[C@H]1CC[C@@H](C)CC1', 'C[C@](F)(Cl)O', 'O[C@]12CCCC[C@@H]1CCCC2'];

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#studio');
  await h.waitForRDKit(page);
  await page.evaluate(() => ChemStore.remove('autosave', 'studio'));

  // ---- examples & checker ----
  for (const [smi, canon, stereo, level] of EXAMPLES) {
    await page.evaluate((s) => ChemSim.loadSmiles(s, { quiet: true }), smi);
    const r = await page.evaluate(() => ({
      smiles: document.getElementById('p-smiles').textContent,
      stereo: document.getElementById('p-stereo').textContent,
      levels: ChemSim.state.analysis.issues.map((i) => i.level),
    }));
    h.eq(r.smiles, canon, `SMILES round-trip ${smi}`);
    if (stereo) h.check(r.stereo.includes(stereo), `stereo label ${stereo} for ${smi}`, r.stereo);
    if (level) h.check(r.levels.includes(level), `${level} issue for ${smi}`, JSON.stringify(r.levels));
    else h.check(!r.levels.includes('error'), `no valence errors for ${smi}`);
  }

  // ---- Texas carbon ----
  await page.selectOption('#example-select', '__TEXAS__');
  const texas = await page.textContent('#p-issues');
  h.check(texas.includes('Texas carbon'), 'Texas carbon is flagged');

  // ---- drawing with the mouse ----
  await page.click('#btn-clear');
  const box = await page.locator('#canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.click('.atom-btn[data-el="C"]');
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx, cy);
  await page.click('.atom-btn[data-el="O"]');
  await page.mouse.click(cx, cy);
  h.eq(await page.textContent('#p-smiles'), 'CO', 'click-drawn methanol');
  await page.click('.tool[data-tool="charge"][data-charge="1"]');
  await page.mouse.click(cx, cy);
  h.eq(await page.textContent('#p-smiles'), 'C[OH2+]', '+1 charge tool on O');

  // ---- 3D keeps stereochemistry ----
  for (const smi of STEREO_3D) {
    const r = await page.evaluate((s) => {
      ChemSim.loadSmiles(s, { quiet: true });
      const two = ChemSim.state.rd.smiles;
      const mb = ChemSim.embed3D().molblock;
      const m = RDKit.get_mol(mb);
      const noH = RDKit.get_mol(m.remove_hs());
      const three = noH.get_smiles();
      m.delete(); noH.delete();
      return { two, three };
    }, smi);
    h.eq(r.three, r.two, `3D keeps stereo of ${smi}`);
  }

  // ---- 3D viewer opens ----
  await page.click('#btn-3d');
  await page.waitForTimeout(2000);
  h.check(await page.evaluate(() => !document.getElementById('modal-3d').classList.contains('hidden') && !!document.querySelector('#viewer3d canvas')), '3D viewer shows a WebGL canvas');
  await page.click('#btn-close-3d');

  // ---- PNG export ----
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  h.check(/\.png$/.test(dl.suggestedFilename()), 'PNG export downloads a .png', dl.suggestedFilename());

  // ---- autosave survives a reload ----
  await page.evaluate(() => ChemSim.loadSmiles('CCOC(C)=O', { quiet: true }));
  await page.waitForTimeout(900);
  await page.reload();
  await h.waitForRDKit(page);
  await page.waitForTimeout(500);
  h.eq(await page.textContent('#p-smiles'), 'CCOC(C)=O', 'drawing restored after reload');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
