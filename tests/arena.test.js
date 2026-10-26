/* Challenge Arena: every generator makes valid questions, answers match
   independent calculations, stereo labels match RDKit, mechanism answers
   are accepted (and wrong ones rejected), and the practice / exam / review
   flows work and are saved. */
'use strict';

module.exports = async (h) => {
  const { browser, page, errors } = await h.launch();
  page.on('dialog', (d) => d.accept());
  await h.openApp(page, '#arena');
  await page.waitForSelector('#ar-start-practice');
  await h.waitForRDKit(page);
  await page.evaluate(() => ArenaMain.loadElements());
  h.check(await page.isVisible('#view-arena'), 'Arena home opens');

  /* ---------------- helpers ---------------- */
  const u = await page.evaluate(() => {
    const U = ArenaUtil;
    const nc = U.numChoices(2.5, [25, 0.25, 2.51, 5], U.rng(1), { unit: 'g' });
    return {
      mm: U.molarMass('CuSO4·5H2O'), mm2: U.molarMass('Ca(OH)2'), pf: U.parseFormula('Al2(SO4)3'), pfu: U.parseFormula('C₆H₁₂O₆'),
      f1: U.fmt(0.000123, 3), f2: U.fmt(42, 3), f3: U.fmt(123456, 3), f4: U.fmt(-0.5, 2), chem: U.chem('SO4^2-'),
      nc, ncSorted: nc.values.every((v, i, a) => i === 0 || a[i - 1] < v), ncCorrect: nc.values[nc.answer],
      sf: ['0.00450', '100.0', '3.040 × 10⁵', '1002', '0.0300', '4.00 × 10⁻³'].map(ArenaGen.sigFigs),
      mo: ['O₂', 'N₂', 'B₂', 'NO', 'F₂', 'O₂⁻', 'He₂⁺', 'C₂'].map((s) => ({ O: [12], N: [10], B: [6], NO: [11], F: [14], 'O-': [13], He: [3, 'H'], C: [8] })[s.replace(/[₂⁺]/g, '').replace('⁻', '-')]).map((d) => ArenaGen.mo(d[0], d[1])),
      seedSame: U.rng(5)() === U.rng(5)(),
    };
  });
  h.near(u.mm, 249.68, 0.05, 'molar mass of CuSO₄·5H₂O = 249.68 g/mol');
  h.near(u.mm2, 74.09, 0.02, 'molar mass of Ca(OH)₂ = 74.09 g/mol');
  h.eq(u.pf, { Al: 2, S: 3, O: 12 }, 'formula parser handles brackets: Al₂(SO₄)₃');
  h.eq(u.pfu, { C: 6, H: 12, O: 6 }, 'formula parser reads unicode subscripts');
  h.eq([u.f1, u.f2, u.f3, u.f4], ['1.23 × 10⁻⁴', '42.0', '1.23 × 10⁵', '−0.50'], 'number formatting keeps significant figures');
  h.eq(u.chem, 'SO₄²⁻', 'chem() writes subscripts and charges');
  h.check(u.ncSorted && u.nc.choices.length === 4 && u.ncCorrect === 2.5, 'numeric choices: 4 options, ascending, correct one included');
  h.check(!u.nc.values.includes(2.51), 'numeric choices drop a distractor within 4% of the answer');
  h.eq(u.sf, [3, 4, 4, 4, 3, 3], 'significant-figure counter follows the rules');
  h.eq(u.mo.map((m) => [m.bo, m.unpaired]), [[2, 2], [3, 0], [1, 2], [2.5, 1], [1, 0], [1.5, 1], [0.5, 1], [2, 0]], 'MO theory: bond orders and unpaired electrons (O₂, N₂, B₂, NO, F₂, O₂⁻, He₂⁺, C₂)');
  h.check(u.seedSame, 'seeded random numbers repeat');

  /* ---------------- every generator, many seeds ---------------- */
  const gv = await page.evaluate(() => {
    const bad = [];
    let n = 0;
    for (const g of ArenaGen.gens) {
      if (!ArenaGen.ready(g)) { bad.push(g.id + ' not ready'); continue; }
      for (let s = 1; s <= 80; s++) {
        let q;
        try { q = ArenaGen.make(g.id, s * 7919 + 13); } catch (e) { bad.push(`${g.id}#${s} threw ${e.message}`); continue; }
        const labels = q.choices.map((c) => (typeof c === 'object' ? c.smi : c));
        if (q.choices.length !== 4 || new Set(labels).size !== 4) bad.push(`${g.id}#${s} choices ${labels.join(' | ')}`);
        if (!(q.answer >= 0 && q.answer < 4)) bad.push(`${g.id}#${s} answer ${q.answer}`);
        if (/NaN(?!O)|undefined|Infinity|null/.test(q.stem + labels.join() + q.explain)) bad.push(`${g.id}#${s} text: ${q.stem.slice(0, 60)}`);
        if (!q.explain || !q.hint) bad.push(`${g.id}#${s} missing explanation or hint`);
        if (q.topic !== g.topic) bad.push(`${g.id} topic`);
        n++;
      }
    }
    return { bad: bad.slice(0, 10), n, gens: ArenaGen.gens.length, topics: [...new Set(ArenaGen.gens.map((g) => g.topic))].length };
  });
  h.check(gv.bad.length === 0, `${gv.gens} generators × 80 seeds = ${gv.n} questions: 4 distinct choices, valid answer, explanation and hint`, gv.bad.join('\n'));
  h.eq(gv.topics, 10, 'generators cover all ten USNCO topics');

  /* ---------------- answers recomputed from the question text ---------------- */
  const ind = await page.evaluate(() => {
    const num = (s) => parseFloat(String(s).replace('−', '-').replace(/ × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_, e) => 'e' + e.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '-0123456789'['⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)])));
    const ans = (q) => num(q.choices[q.answer]);
    const out = { ecell: 0, ecellBad: [], half: 0, halfBad: [], ph: 0, phBad: [], gas: 0, gasBad: [], flame: 0, oxn: 0 };
    for (let s = 1; s < 400; s++) {
      const q = ArenaGen.make('ecell', s);
      if (/What is E°<sub>cell<\/sub>/.test(q.stem)) {
        const E = [...q.stem.matchAll(/E° = ([+−])(\d\.\d\d) V/g)].map((m) => (m[1] === '−' ? -1 : 1) * +m[2]);
        const want = Math.max(...E) - Math.min(...E);
        out.ecell++; if (Math.abs(ans(q) - want) > 0.006) out.ecellBad.push(q.stem);
      }
      const hq = ArenaGen.make('halflife', s);
      const m = hq.stem.match(/half-life of ([\d.]+) \w+\. What percentage of a sample remains after ([\d.]+)/);
      if (m) { const want = 100 * 0.5 ** (+m[2] / +m[1]); out.half++; if (Math.abs(ans(hq) / want - 1) > 0.006) out.halfBad.push(hq.stem); }
      const pq = ArenaGen.make('phstrong', s);
      const pm = pq.stem.match(/pH of ([\d.]+) M (\S+)/);
      const k = { 'HCl': 1, 'HNO₃': 1, 'HClO₄': 1, 'NaOH': -1, 'KOH': -1, 'Ba(OH)₂': -2, 'Sr(OH)₂': -2 }[pm[2]];
      const want = k > 0 ? -Math.log10(+pm[1]) : 14 + Math.log10(+pm[1] * -k);
      out.ph++; if (Math.abs(ans(pq) - want) > 0.006) out.phBad.push(pq.stem);
      const gq = ArenaGen.make('idealgas', s);
      const gm = gq.stem.match(/What volume does ([\d.]+) g of (.+?) gas occupy at (−?-?\d+) °C and ([\d.]+) atm/);
      if (gm) {
        const Mm = { helium: 4.0026, neon: 20.18, argon: 39.948, nitrogen: 28.014, oxygen: 31.998, 'carbon dioxide': 44.009, methane: 16.043, 'sulfur dioxide': 64.06, chlorine: 70.9, ammonia: 17.031, propane: 44.097, hydrogen: 2.016, krypton: 83.798, 'sulfur hexafluoride': 146.05 }[gm[2]];
        const V = (+gm[1] / Mm) * 0.08206 * (+gm[3] + 273.15) / +gm[4];
        out.gas++; if (Math.abs(ans(gq) / V - 1) > 0.006) out.gasBad.push(gq.stem);
      }
      const fq = ArenaGen.make('flame', s);
      const right = fq.choices[fq.answer];
      const colour = fq.stem.match(/<b>(.+?)<\/b>/)[1];
      const sym = right.match(/\((\w+?)[⁺²]/)[1];
      if (WikiData.FLAME[sym].name === colour) out.flame++;
      const oq = ArenaGen.make('oxnum', s);
      if (oq.choices.length === 4) out.oxn++;
    }
    return out;
  });
  h.check(ind.ecell > 20 && !ind.ecellBad.length, `E°cell = E°(cathode) − E°(anode) checked on ${ind.ecell} generated cells`, ind.ecellBad[0]);
  h.check(ind.half > 20 && !ind.halfBad.length, `first-order decay (½)^(t/t½) checked on ${ind.half} questions`, ind.halfBad[0]);
  h.check(!ind.phBad.length, `strong acid/base pH checked on ${ind.ph} questions`, ind.phBad[0]);
  h.check(ind.gas > 20 && !ind.gasBad.length, `ideal-gas volume V = nRT/P checked on ${ind.gas} questions`, ind.gasBad[0]);
  h.eq(ind.flame, 399, 'flame-test answers match the Element Wiki flame colours');

  /* ---------------- hand-written bank ---------------- */
  const bk = await page.evaluate(() => {
    const ids = ArenaBank.Q.map((x) => x.id);
    const per = {};
    ArenaBank.Q.forEach((x) => { per[x.t] = (per[x.t] || 0) + 1; });
    const bad = ArenaBank.Q.filter((x) => x.c.length !== 4 || !x.e || !x.h || (x.keep && !(x.a >= 0 && x.a < 4)) || !per[x.t]).map((x) => x.id);
    const badSmi = []; ArenaBank.Q.forEach((x) => x.c.forEach((c) => { if (c && c.smi && !ArenaUtil.canon(c.smi)) badSmi.push(x.id + ':' + c.smi); }));
    const q = ArenaBank.toQuestion(ArenaBank.Q[0], ArenaUtil.rng(3));
    return { n: ids.length, dup: ids.filter((x, i) => ids.indexOf(x) !== i), bad, badSmi, per, shuffled: q.choices[q.answer] === ArenaBank.Q[0].c[0] };
  });
  h.check(bk.n >= 140 && !bk.dup.length, `${bk.n} hand-written questions with unique ids`);
  h.check(Object.keys(bk.per).length === 10 && Object.values(bk.per).every((n) => n >= 11), 'every topic has at least 11 hand-written questions', JSON.stringify(bk.per));
  h.check(!bk.bad.length, 'every bank question has 4 choices, an explanation and a hint', bk.bad.join(','));
  h.check(!bk.badSmi.length, 'every structure in the bank is valid SMILES', bk.badSmi.join(','));
  h.check(bk.shuffled, 'shuffled choices keep track of the correct answer');

  /* ---------------- stereochemistry (RDKit CIP) ---------------- */
  const st = await page.evaluate(() => {
    const T = (s) => ArenaUtil.stereoTags(s);
    return {
      ala: Object.values(T('C[C@@H](C(=O)O)N').atoms), cys: Object.values(T('C([C@@H](C(=O)O)N)S').atoms),
      fum: T('OC(=O)/C=C/C(=O)O').bonds.map((b) => b[2]), mal: T('OC(=O)/C=C\\C(=O)O').bonds.map((b) => b[2]),
      trans: Object.values(T('Br[C@@H]1CCCC[C@H]1Br').atoms), cis: Object.values(T('Br[C@@H]1CCCC[C@@H]1Br').atoms).sort(),
      rsAns: Array.from({ length: 60 }, (_, s) => { const q = ArenaGen.make('rs', s + 1); return [q.fig, q.choices[q.answer]]; }),
      ezAns: Array.from({ length: 60 }, (_, s) => { const q = ArenaGen.make('ez', s + 1); return [q.fig, q.choices[q.answer]]; }),
    };
  });
  h.eq(st.ala, ['S'], 'L-alanine is S');
  h.eq(st.cys, ['R'], 'L-cysteine is R (the sulfur outranks COOH)');
  h.eq([st.fum, st.mal], [['E'], ['Z']], 'fumaric acid is E, maleic acid is Z');
  h.eq([st.trans, st.cis], [['R', 'R'], ['R', 'S']], 'trans-1,2-dibromocyclohexane is (R,R); cis is meso (R,S)');
  const rsOk = st.rsAns.every(([smi, a]) => a.includes('no stereocentre') || /^\(?\d?[RS]/.test(a));
  h.check(rsOk && new Set(st.rsAns.map((x) => x[1])).size >= 4, 'R/S generator gives R, S, two-centre and achiral answers');
  h.check(st.ezAns.some((x) => x[1] === 'E') && st.ezAns.some((x) => x[1] === 'Z'), 'E/Z generator produces both E and Z isomers');

  /* ---------------- mechanisms ---------------- */
  const mech = await page.evaluate(() => ArenaMech.ITEMS.map((it) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const ctl = ArenaMech.mount(host, it);
    const model = it.sets[0].map(ctl.specToArrow);
    const ok = it.sets.every((set) => ArenaMech.evaluate(it, set.map(ctl.specToArrow)).ok);
    const reordered = ArenaMech.evaluate(it, model.slice().reverse()).ok;
    const reversed = ArenaMech.evaluate(it, model.map((a) => ({ ...a, from: a.to, to: a.from }))).ok;
    const missing = model.length > 1 ? ArenaMech.evaluate(it, model.slice(1)) : { ok: false, missing: 1 };
    const extra = ArenaMech.evaluate(it, [...model, model[0]]);
    const wrongKind = ArenaMech.evaluate(it, model.map((a) => ({ ...a, kind: a.kind === 'full' ? 'half' : 'full' }))).ok;
    host.remove();
    return { id: it.id, ok, reordered, reversed, missingOk: missing.ok, missingN: missing.missing, extraOk: extra.ok, extraN: extra.extra, wrongKind };
  }));
  h.check(mech.every((m) => m.ok && m.reordered), `all ${mech.length} mechanism model answers are accepted, in any order`, JSON.stringify(mech.filter((m) => !m.ok || !m.reordered)));
  h.check(mech.every((m) => !m.reversed && !m.wrongKind), 'arrows pointing the wrong way, or full/fishhook mixed up, are rejected');
  h.check(mech.every((m) => !m.missingOk && m.missingN === 1 && !m.extraOk && m.extraN === 1), 'a missing or an extra arrow is reported');

  // draw one by clicking, like a student
  await page.evaluate(() => { ArenaMain.startPractice({ topics: ['organic'], adaptive: false, mech: true, mechOnly: true }); });
  await page.waitForSelector('.ar-q');
  await page.evaluate(() => { const P = ArenaMain.practice; P.q = ArenaMech.toQuestion(ArenaMech.ITEMS[0]); P.state = { picked: null, done: false, hinted: false, firstTry: null, mechTries: 0 }; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForSelector('.mech-svg');
  const G1 = await page.evaluate(() => { const G = ArenaMech.geometry(ArenaMech.ITEMS[0].smi); return { O: G.atoms.findIndex((a) => a.map === 1), C: G.atoms.findIndex((a) => a.map === 2), Br: G.atoms.findIndex((a) => a.map === 3) }; });
  // a wrong first attempt: C–Br bond → C (backwards)
  await page.click('[data-bond="0"]', { force: true }); await page.click(`[data-atom="${G1.C}"]`, { force: true });
  await page.click('#ar-check');
  h.check(/Not quite/.test(await page.textContent('#ar-fb')), 'a wrong arrow is marked “not quite”');
  h.eq(await page.locator('.mech-arrow.bad').count(), 1, 'the wrong arrow is shown in red');
  await page.click('[data-act="clear"]');
  await page.click(`[data-atom="${G1.O}"]`, { force: true }); await page.click(`[data-atom="${G1.C}"]`, { force: true });
  await page.click('[data-bond="0"]', { force: true }); await page.click(`[data-atom="${G1.Br}"]`, { force: true });
  await page.click('#ar-check');
  h.check(/Correct/.test(await page.textContent('#ar-fb')), 'drawing the SN2 arrows by clicking gives “Correct”');
  h.eq(await page.locator('.mech-arrow.good').count(), 2, 'both arrows turn green');
  h.eq(await page.evaluate(() => ArenaMain.practice.correct), 0, 'a mechanism only counts as correct if it was right first time');
  await page.click('#ar-end');
  await page.click('#ar-modal-close');

  /* ---------------- practice flow, stats and weak topics ---------------- */
  await page.evaluate(async () => { await ChemStore.remove('quiz', 'stats'); });
  await page.evaluate(() => { location.hash = '#arena/home'; });
  await page.waitForSelector('#ar-start-practice');
  await page.click('#ar-none');
  await page.check('[data-topic="stoich"]');
  await page.click('#ar-start-practice');
  await page.waitForSelector('.ar-choice');
  h.eq(await page.evaluate(() => ArenaMain.practice.q.topic), 'stoich', 'practice asks from the chosen topic');
  await page.keyboard.press('h');
  h.check(await page.isVisible('#ar-hint'), 'H shows the hint');
  const wrongIdx = await page.evaluate(() => (ArenaMain.practice.q.answer + 1) % 4);
  await page.keyboard.press(String(wrongIdx + 1));
  h.check(await page.isVisible('#ar-fb') && /Not this time/.test(await page.textContent('#ar-fb')), 'a wrong answer shows feedback and the explanation');
  h.eq(await page.locator('.ar-choice.right').count(), 1, 'the correct choice is highlighted');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const ans2 = await page.evaluate(() => ArenaMain.practice.q.answer);
  await page.click(`.ar-choice[data-i="${ans2}"]`);
  h.check(/Correct/.test(await page.textContent('#ar-fb')), 'the right answer is marked correct');
  await page.waitForTimeout(300);
  const sv = await page.evaluate(() => ChemStore.get('quiz', 'stats'));
  h.check(sv && sv.topics.stoich.seen === 2 && sv.topics.stoich.correct === 1, 'per-topic stats are saved in the quiz store');
  // a missed bank question goes onto the revisit list
  await page.evaluate(() => { const P = ArenaMain.practice; P.q = ArenaBank.toQuestion(ArenaBank.Q.find((x) => x.id === 's1'), ArenaUtil.rng(1)); P.state = { picked: null, done: false, hinted: false, firstTry: null, mechTries: 0 }; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.waitForTimeout(100);
  await page.evaluate(() => { const q = ArenaMain.practice.q; document.querySelector(`.ar-choice[data-i="${(q.answer + 1) % 4}"]`).click(); });
  h.check((await page.evaluate(() => ArenaMain.stats.missed)).includes('bank:s1'), 'a missed hand-written question is kept to revisit');
  await page.click('#ar-end');
  h.check(/answered <b>3<\/b>/.test(await page.innerHTML('#ar-modal-body')), 'ending practice shows a session summary');
  await page.click('#ar-modal-close');

  const ad = await page.evaluate(() => {
    const S = ArenaMain.stats;
    S.topics.kinetics = { seen: 20, correct: 4, recent: [1, 1, 1, 1, ...Array(16).fill(0)] };
    S.topics.thermo = { seen: 20, correct: 19, recent: [...Array(19).fill(1), 0] };
    const r = ArenaUtil.rng(9), c = { kinetics: 0, thermo: 0 };
    for (let i = 0; i < 3000; i++) c[ArenaMain.pickTopic(r, ['kinetics', 'thermo'], true)]++;
    const c2 = { kinetics: 0, thermo: 0 };
    for (let i = 0; i < 3000; i++) c2[ArenaMain.pickTopic(r, ['kinetics', 'thermo'], false)]++;
    return { c, c2 };
  });
  h.check(ad.c.kinetics > 4 * ad.c.thermo, `weak topics come up more often (20% topic ${ad.c.kinetics} vs 95% topic ${ad.c.thermo} of 3000)`);
  h.check(Math.abs(ad.c2.kinetics - 1500) < 150, 'without “focus on weak topics” the choice is even');

  /* ---------------- exams ---------------- */
  const ex = await page.evaluate(() => {
    const a = ArenaMain.buildExam(60, 1234), b = ArenaMain.buildExam(60, 1234), c = ArenaMain.buildExam(60, 99);
    const order = ArenaBank.TOPICS.map((t) => t.id);
    const blocks = order.map((t, i) => a.slice(i * 6, i * 6 + 6).every((q) => q.topic === t));
    return { n: a.length, blocks: blocks.every(Boolean), same: a.map((q) => q.stem).join() === b.map((q) => q.stem).join(), diff: a.map((q) => q.stem).join() !== c.map((q) => q.stem).join(), mech: a.some((q) => q.type === 'mech'), uniq: new Set(a.map((q) => q.stem + q.choices.join())).size };
  });
  h.eq(ex.n, 60, 'a full exam has 60 questions');
  h.check(ex.blocks, 'six questions per topic, in the USNCO topic order');
  h.check(ex.same && ex.diff, 'the same exam code gives the same exam; a different code a different one');
  h.check(!ex.mech, 'exams are multiple choice only (no mechanism drawing)');
  h.eq(ex.uniq, 60, 'no question repeats within an exam');

  await page.evaluate(() => { location.hash = '#arena'; });
  await page.waitForSelector('#ar-start-exam');
  await page.check('[name="ar-exam"][value="quick"]');
  await page.fill('#ar-seed', '777');
  await page.click('#ar-start-exam');
  await page.waitForSelector('.ar-nav');
  h.eq(await page.locator('.ar-navb').count(), 10, 'quick exam: 10 questions in the navigator');
  h.check(/1:5\d|1:00|0:59|18:00|17:5\d/.test(await page.textContent('#ar-timer')), 'the timer is running', await page.textContent('#ar-timer'));
  h.eq(await page.locator('#ar-hintbtn').count(), 0, 'no hints in exam mode');
  // answer the first question, flag it, then leave and resume
  await page.keyboard.press('2');
  await page.keyboard.press('f');
  h.check(await page.locator('.ar-navb').first().evaluate((e) => e.classList.contains('done') && e.classList.contains('flag')), 'answered and flagged questions are marked in the navigator');
  await page.click('#ar-pause');
  await page.waitForSelector('#ar-resume');
  h.check(/1 answered/.test(await page.textContent('.ar-resume')), 'the home page offers to resume the unfinished exam');
  await page.reload();
  await page.waitForSelector('#ar-resume');
  await page.click('#ar-resume');
  await page.waitForSelector('.ar-nav');
  h.eq(await page.evaluate(() => ArenaMain.exam.answers[0]), 1, 'after a reload the exam resumes with its answers');
  // answer everything correctly except question 10
  await page.evaluate(() => { const E = ArenaMain.exam; E.qs.forEach((q, i) => { E.answers[i] = q.answer; }); E.answers[9] = (E.qs[9].answer + 1) % 4; });
  await page.click('#ar-submit');
  await page.waitForSelector('.ar-big');
  h.eq(await page.textContent('.ar-big'), '9/10', 'the results page shows the score');
  h.eq(await page.locator('.ar-ritem').count(), 10, 'every question is listed in the review');
  h.eq(await page.locator('.ar-ritem.missed').count(), 1, 'the missed question is marked');
  await page.check('#ar-onlywrong');
  h.eq(await page.locator('.ar-ritem:not(.hidden)').count(), 1, '“only questions I missed” filter works');
  const saved = await page.evaluate(async () => (await ChemStore.getAll('quiz')).filter((x) => x.value && x.value.kind === 'exam').map((x) => x.value));
  h.check(saved.length === 1 && saved[0].score === 9 && saved[0].seed === 777 && saved[0].items.length === 10, 'the exam is saved with its code, score and questions');
  h.eq(await page.evaluate(() => ChemStore.get('quiz', 'exam-inprogress')), undefined, 'the in-progress copy is removed after submitting');
  await page.click('#ar-home');
  await page.waitForSelector('.ar-hrow');
  h.check(/9\/10/.test(await page.textContent('.ar-hrow')), 'the past-exams list shows the result');
  await page.click('.ar-hrow [data-open]');
  await page.waitForSelector('.ar-big');
  h.eq(await page.textContent('.ar-big'), '9/10', 'a saved exam can be opened for review later');

  // time runs out → submitted automatically
  await page.evaluate(() => ArenaMain.startExam('quick', 5));
  await page.waitForSelector('.ar-nav');
  await page.evaluate(() => { ArenaMain.exam.startedAt = Date.now() - 19 * 60 * 1000; });
  await page.waitForSelector('.ar-big', { timeout: 5000 });
  h.eq(await page.textContent('.ar-big'), '0/10', 'when time is up the exam is submitted automatically');

  // data sheet
  await page.evaluate(() => { location.hash = '#arena'; });
  await page.evaluate(() => ArenaMain.startPractice({ topics: ['equil'], adaptive: false, mech: false }));
  await page.waitForSelector('#ar-datasheet');
  await page.click('#ar-datasheet');
  await page.waitForSelector('.ds-cell');
  h.eq(await page.locator('.ds-cell').count(), 118, 'the data sheet shows a full periodic table');
  h.check(/96 485/.test(await page.textContent('.ds-consts')), 'the data sheet lists the constants');
  await page.click('#ar-modal-close');

  h.eq(errors, [], 'no console errors in the Arena');
  await browser.close();
};
