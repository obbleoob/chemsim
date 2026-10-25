/* Element Wiki: data checked against reference values, every page opens,
   heatmaps, trend walk, spectra/glow colours, navigation. */
'use strict';

const fs = require('fs');
const path = require('path');

module.exports = async (h) => {
  // ---------- 1. data file vs textbook reference values ----------
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'elements.json'), 'utf8')).elements;
  const E = Object.fromEntries(data.map((e) => [e.sym, e]));
  h.eq(data.length, 118, '118 elements in data file');
  h.check(data.every((e, i) => e.z === i + 1), 'atomic numbers 1…118 in order');
  h.near(E.H.mass, 1.008, 0.001, 'H atomic weight 1.008');
  h.near(E.C.mass, 12.011, 0.001, 'C atomic weight 12.011');
  h.near(E.Cl.mass, 35.45, 0.01, 'Cl atomic weight 35.45');
  h.eq(E.F.en, 3.98, 'F electronegativity 3.98');
  h.eq(E.Na.en, 0.93, 'Na electronegativity 0.93');
  h.near(E.He.ie[0], 2372.3, 1, 'He 1st IE 2372 kJ/mol');
  h.near(E.Na.ie[0], 495.8, 1, 'Na 1st IE 495.8 kJ/mol');
  h.near(E.Na.ie[1], 4562, 5, 'Na 2nd IE 4562 kJ/mol');
  h.near(E.Cl.ea, 349, 1, 'Cl electron affinity 349 kJ/mol');
  h.near(E.Fe.mp, 1811, 2, 'Fe melting point 1811 K');
  h.near(E.W.mp, 3695, 2, 'W melting point 3695 K (CRC)');
  h.near(E.Sn.mp, 505.1, 0.5, 'Sn melting point 505 K (not the 286 K allotrope transition)');
  h.check(E.C.mp == null && E.C.sublimes, 'carbon sublimes rather than melting at 1 atm');
  h.near(E.Hg.mp, 234.3, 0.5, 'Hg melting point 234.3 K');
  h.near(E.Ga.mp, 302.9, 0.5, 'Ga melting point 302.9 K');
  h.near(E.Os.density, 22.59, 0.05, 'Os density 22.59 g/cm³');
  h.eq(E.Fe.crystal.code, 'BCC', 'Fe is bcc');
  h.eq(E.Cu.crystal.code, 'FCC', 'Cu is fcc');
  h.eq(E.Mg.crystal.code, 'HEX', 'Mg is hcp');
  h.eq(E.Si.crystal.code, 'DIA', 'Si is diamond cubic');
  h.eq(E.Po.crystal.code, 'SC', 'Po is simple cubic');
  h.eq(E.Na.configShort, '[Ne] 3s1', 'Na configuration');
  h.eq(E.Cr.configShort, '[Ar] 3d5 4s1', 'Cr anomalous configuration');
  h.check(E.Na.lines.some(([nm]) => Math.abs(nm - 589.0) < 0.1) && E.Na.lines.some(([nm]) => Math.abs(nm - 589.59) < 0.1), 'Na D lines at 589.0 / 589.6 nm');
  for (const nm of [656.28, 486.13, 434.05, 410.17]) h.check(E.H.lines.some(([x]) => Math.abs(x - nm) < 0.05), `H Balmer line ${nm} nm`);
  h.check(E.Li.radius.calculated < E.Na.radius.calculated && E.Na.radius.calculated < E.K.radius.calculated, 'atomic radius grows down group 1');
  h.check(E.Na.ie[0] < E.Mg.ie[0] && E.Mg.ie[0] > E.Al.ie[0], 'IE dip from Mg to Al (new p subshell)');
  h.check(data.every((e) => !e.ie.length || e.ie[0] < 2400), 'no impossible first ionization energies');
  h.check(data.filter((e) => e.z >= 100).every((e) => e.predictedBulk), 'superheavy bulk properties flagged as predicted');

  // articles: every element has the four main sections
  const arts = {};
  fs.readdirSync(path.join(__dirname, '..', 'data', 'wiki')).forEach((f) => Object.assign(arts, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'wiki', f), 'utf8'))));
  const incomplete = data.filter((e) => !arts[e.sym] || !['history', 'production', 'chemistry', 'safety'].every((k) => arts[e.sym][k]));
  h.check(incomplete.length === 0, 'all 118 articles have history, production, chemistry and safety', incomplete.map((e) => e.sym).join(' '));

  // ---------- 2. the UI ----------
  const { browser, page, errors } = await h.launch();
  await h.openApp(page, '#wiki');
  await page.waitForSelector('.pt-cell[data-sym="Og"]', { timeout: 30000 });
  h.eq(await page.locator('.pt-cell[data-sym]').count(), 118, '118 cells in the table');

  // heatmap colours change and Fluorine is the hottest electronegativity cell
  await page.click('[data-heat="en"]');
  const enVals = await page.evaluate(() => ({
    F: document.querySelector('.pt-cell[data-sym="F"] .val').textContent,
    Cs: getComputedStyle(document.querySelector('.pt-cell[data-sym="Cs"]')).backgroundColor,
    Fbg: getComputedStyle(document.querySelector('.pt-cell[data-sym="F"]')).backgroundColor,
    He: document.querySelector('.pt-cell[data-sym="He"] .val').textContent,
  }));
  h.eq(enVals.F, '3.98', 'EN heatmap shows 3.98 on F');
  h.check(enVals.Cs !== enVals.Fbg, 'F and Cs get different heatmap colours');
  h.eq(enVals.He, '—', 'He has no electronegativity (shown as —)');

  // filters
  await page.selectOption('#wiki-phase', 'liquid');
  const liquids = await page.evaluate(() => [...document.querySelectorAll('.pt-cell[data-sym]:not(.dimmed)')].map((c) => c.dataset.sym).sort());
  h.eq(JSON.stringify(liquids), JSON.stringify(['Br', 'Hg']), 'liquid filter → Br and Hg');
  await page.selectOption('#wiki-phase', 'all');

  // trend walk
  await page.click('[data-heat="ie1"]');
  await page.click('[data-walk="p3"]');
  await page.waitForTimeout(500);
  h.check(await page.locator('.pt-cell.walk').count() === 1, 'trend walk highlights one cell at a time');

  // every element page opens with all sections and no errors
  const failures = await page.evaluate(async () => {
    const bad = [];
    for (const e of WikiData.elements) {
      try {
        WikiPage.open(e.sym);
        const secs = document.querySelectorAll('#el-page .el-sec').length;
        if (secs !== 9) bad.push(`${e.sym}: ${secs} sections`);
        if (!document.querySelector('#el-page .el-head h2').textContent.includes(e.name)) bad.push(`${e.sym}: wrong title`);
      } catch (err) { bad.push(`${e.sym}: ${err.message}`); }
    }
    return bad;
  });
  h.check(failures.length === 0, 'all 118 element pages render', failures.join('; '));

  // a few specifics
  await page.evaluate(() => WikiPage.open('Na'));
  await page.waitForTimeout(300);
  h.check(await page.isVisible('#spec-canvas'), 'Na page has an emission spectrum');
  h.check((await page.textContent('#sec-spectrum')).includes('yellow-orange'), 'Na flame test is yellow-orange');
  h.check((await page.textContent('#sec-reactions')).includes('2Na + 2H₂O'), 'Na page shows the water reaction');
  h.check(await page.locator('#crystal-canvas').count() === 1, 'Na page shows a crystal viewer');
  await page.evaluate(() => WikiPage.open('Og'));
  h.check((await page.textContent('#el-page')).includes('Mostly predicted'), 'Og page warns that properties are predicted');

  // glow colours computed from spectra look right
  const glows = await page.evaluate(() => Object.fromEntries(['Ne', 'Na', 'H'].map((s) => [s, Spectrum.glowColor(WikiData.get(s).lines)])));
  h.check(glows.Ne[0] > glows.Ne[1] && glows.Ne[0] > glows.Ne[2], 'neon glows red-orange', JSON.stringify(glows.Ne));
  h.check(glows.Na[0] > 200 && glows.Na[1] > 120 && glows.Na[2] < 80, 'sodium glows yellow-orange', JSON.stringify(glows.Na));
  h.check(glows.H[0] > glows.H[1], 'hydrogen glows pink-red (Balmer H-α)', JSON.stringify(glows.H));

  // URL routing and Back button
  await page.click('.mode-tab[data-mode="studio"]');
  await h.openApp(page, '#wiki/Fe');
  await page.waitForSelector('#el-page:not(.hidden)', { timeout: 30000 });
  h.check((await page.textContent('#el-page h2')).includes('Iron'), '#wiki/Fe opens the iron page directly');
  await page.click('#el-page [data-close]');
  h.check(await page.isHidden('#el-page'), 'close button returns to the table');
  await page.click('.pt-cell[data-sym="Au"]');
  await page.waitForTimeout(200);
  h.eq(await page.evaluate(() => location.hash), '#wiki/Au', 'clicking a cell updates the URL');
  await page.goBack();
  await page.waitForTimeout(200);
  h.check(await page.isHidden('#el-page'), 'Back button closes the page');

  h.check(errors.length === 0, 'no console errors', errors.join('\n'));
  await browser.close();
};
