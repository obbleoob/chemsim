/* Core: tabs, URL hash routing, coming-soon pages, data export/import. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();

  await h.openApp(page, '#wiki');
  await page.waitForTimeout(300);
  h.eq(await page.evaluate(() => ChemRouter.active), 'wiki', 'opening #wiki starts on the Wiki tab');
  h.check(await page.isVisible('#view-wiki'), 'wiki view visible');
  h.check(await page.isHidden('#view-studio'), 'studio view hidden');

  for (const mode of ['beaker', 'labs', 'arena', 'studio']) {
    await page.click(`.mode-tab[data-mode="${mode}"]`);
    h.eq(await page.evaluate(() => location.hash), '#' + mode, `tab ${mode} updates the URL`);
    h.check(await page.isVisible('#view-' + mode), `${mode} view visible`);
  }
  await page.goBack();
  h.eq(await page.evaluate(() => ChemRouter.active), 'arena', 'Back button returns to previous tab');

  // keyboard shortcuts must not leak out of the studio
  await page.click('.mode-tab[data-mode="studio"]');
  await h.waitForRDKit(page);
  await page.evaluate(() => { ChemSim.loadSmiles('CC', { quiet: true }); });
  await page.click('.mode-tab[data-mode="wiki"]');
  await page.keyboard.press('Control+z');
  await page.click('.mode-tab[data-mode="studio"]');
  h.eq(await page.textContent('#p-smiles'), 'CC', 'Ctrl+Z in another tab does not change the drawing');

  // data export → import round trip
  await page.evaluate(() => ChemStore.put('settings', 'test-key', { hello: 'world' }));
  await page.click('#btn-data-menu');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-data-export')]);
  const file = await dl.path();
  const data = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  h.check(data.app === 'ChemSim' && data.stores.settings.some((x) => x.key === 'test-key'), 'export file contains saved settings');
  await page.evaluate(() => ChemStore.remove('settings', 'test-key'));
  await page.setInputFiles('#data-import-file', file);
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => ChemStore.get('settings', 'test-key'));
  h.check(back && back.hello === 'world', 'import restores saved settings');
  await page.evaluate(() => ChemStore.remove('settings', 'test-key'));

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
