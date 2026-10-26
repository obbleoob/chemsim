/* ============================================================================
   ChemSim · labs/qual.js
   ----------------------------------------------------------------------------
   Qualitative salt analysis, played as a game. You are given an "unknown"
   salt solution. Every test takes a fresh 1 mL sample in its own test tube;
   each tube is a separate simulated beaker (createBeakerSim), so what you
   see (precipitates, their colours, whether they dissolve in excess, gases,
   flame colours) comes from the same equilibrium engine as the Beaker Lab
   rather than from a lookup table.

   The observations are written in plain words ("a pale blue precipitate"),
   never naming the ion: working that out is your job.

   Scoring: start at 100. Up to 5 tests are free, then −4 per extra test;
   −15 for each wrong identification; −10 for opening the reference table.
   ============================================================================ */
'use strict';

const QualLab = (() => {
  const D = BeakerData;

  /* ---------------- the ions ---------------- */
  // comp: the solver component; z: charge; solid: appearance of the solid salt
  const CATIONS = {
    Na:  { label: 'Na⁺', name: 'sodium', comp: 'Na', z: 1, f: 'Na' },
    K:   { label: 'K⁺', name: 'potassium', comp: 'K', z: 1, f: 'K' },
    Li:  { label: 'Li⁺', name: 'lithium', comp: 'Li', z: 1, f: 'Li' },
    NH4: { label: 'NH₄⁺', name: 'ammonium', comp: 'NH3', z: 1, f: 'NH₄', poly: true },
    Ca:  { label: 'Ca²⁺', name: 'calcium', comp: 'Ca', z: 2, f: 'Ca' },
    Ba:  { label: 'Ba²⁺', name: 'barium', comp: 'Ba', z: 2, f: 'Ba' },
    Mg:  { label: 'Mg²⁺', name: 'magnesium', comp: 'Mg', z: 2, f: 'Mg' },
    Cu:  { label: 'Cu²⁺', name: 'copper(II)', comp: 'Cu', z: 2, f: 'Cu', solid: 'blue crystals' },
    Fe2: { label: 'Fe²⁺', name: 'iron(II)', comp: 'Fe2', z: 2, f: 'Fe', solid: 'pale green crystals' },
    Fe3: { label: 'Fe³⁺', name: 'iron(III)', comp: 'Fe3', z: 3, f: 'Fe', solid: 'yellow-brown crystals' },
    Zn:  { label: 'Zn²⁺', name: 'zinc', comp: 'Zn', z: 2, f: 'Zn' },
    Al:  { label: 'Al³⁺', name: 'aluminium', comp: 'Al', z: 3, f: 'Al' },
    Pb:  { label: 'Pb²⁺', name: 'lead(II)', comp: 'Pb', z: 2, f: 'Pb' },
    Ag:  { label: 'Ag⁺', name: 'silver', comp: 'Ag', z: 1, f: 'Ag' },
  };
  const ANIONS = {
    Cl:  { label: 'Cl⁻', name: 'chloride', comp: 'Cl', z: 1, f: 'Cl' },
    Br:  { label: 'Br⁻', name: 'bromide', comp: 'Br', z: 1, f: 'Br' },
    I:   { label: 'I⁻', name: 'iodide', comp: 'I', z: 1, f: 'I' },
    SO4: { label: 'SO₄²⁻', name: 'sulfate', comp: 'SO4', z: 2, f: 'SO₄', poly: true },
    CO3: { label: 'CO₃²⁻', name: 'carbonate', comp: 'CO3', z: 2, f: 'CO₃', poly: true },
    NO3: { label: 'NO₃⁻', name: 'nitrate', comp: 'NO3', z: 1, f: 'NO₃', poly: true },
  };
  // Pairs that are insoluble, unstable or undergo redox, beyond what the solver catches
  const NOT_STOCKED = new Set(['Fe3-I', 'Cu-I', 'Ag-SO4', 'Ag-Cl', 'Ag-Br', 'Ag-I', 'Fe2-CO3', 'Zn-CO3', 'Cu-CO3', 'Pb-CO3', 'Fe3-CO3', 'Al-CO3', 'Ag-CO3', 'Mg-CO3', 'Ca-CO3', 'Ba-CO3']);

  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (n) => (n === 1 ? '' : String(n).split('').map((d) => SUB[d]).join(''));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function formula(ck, ak) {
    const c = CATIONS[ck], a = ANIONS[ak];
    const g = gcd(c.z, a.z), nc = a.z / g, na = c.z / g;
    const part = (x, n) => (n === 1 ? x.f : x.poly ? `(${x.f})${sub(n)}` : x.f + sub(n));
    return part(c, nc) + part(a, na);
  }
  /** Components of a 0.1 mol/L solution of the salt (plus a little of its own acid for ions that hydrolyse). */
  function stockSolution(ck, ak) {
    const c = CATIONS[ck], a = ANIONS[ak];
    const g = gcd(c.z, a.z), nc = a.z / g, na = c.z / g;
    const tot = { [c.comp]: 0.1 * nc };
    tot[a.comp] = (tot[a.comp] || 0) + 0.1 * na;
    if (c.z === 3 || ck === 'Pb' || ck === 'Cu' || ck === 'Fe2') tot[a.comp] += 0.02 / a.z;   // stops hydrolysis, like real stock bottles
    return tot;
  }

  let stockCache = null;
  /** All cation/anion pairs that make a clear 0.1 M solution (checked with the solver). */
  function stockList() {
    if (stockCache) return stockCache;
    stockCache = [];
    for (const ck of Object.keys(CATIONS)) for (const ak of Object.keys(ANIONS)) {
      if (NOT_STOCKED.has(`${ck}-${ak}`)) continue;
      const eq = BeakerSolver.solve(stockSolution(ck, ak), 20);
      const solid = Object.values(eq.solids).some((v) => v > 1e-6);
      if (!solid) stockCache.push({ ck, ak });
    }
    log('labs', `Qualitative analysis: ${stockCache.length} possible unknowns`);
    return stockCache;
  }

  /* ---------------- reagents (lab bench strengths) ---------------- */
  const R = {
    NaOH: { id: 'q_NaOH2', name: 'sodium hydroxide 2 M', kind: 'solution', c: { Na: 2 } },
    NH3: { id: 'q_NH3_2', name: 'ammonia 2 M', kind: 'solution', c: { NH3: 2 } },
    NH3c: { id: 'q_NH3_15', name: 'concentrated ammonia 15 M', kind: 'solution', c: { NH3: 15 } },
    HNO3: { id: 'q_HNO3_2', name: 'nitric acid 2 M', kind: 'solution', c: { NO3: 2 } },
    HCl: { id: 'q_HCl_2', name: 'hydrochloric acid 2 M', kind: 'solution', c: { Cl: 2 } },
    AgNO3: { id: 'q_AgNO3', name: 'silver nitrate 0.1 M', kind: 'solution', c: { Ag: 0.1, NO3: 0.1 } },
    BaCl2: { id: 'q_BaCl2', name: 'barium chloride 0.1 M', kind: 'solution', c: { Ba: 0.1, Cl: 0.2 } },
    KSCN: { id: 'q_KSCN', name: 'potassium thiocyanate 0.1 M', kind: 'solution', c: { K: 0.1, SCN: 0.1 } },
  };

  /* ---------------- test tubes ---------------- */
  function newTube(unknown) {
    const t = createBeakerSim({ vesselCp: 6, lossK: 0.05, maxML: 20, quiet: true });
    t.reset({ waterML: 0.001 });
    t.add(unknown, 1);
    t.runFor(1);
    return t;
  }
  /** Keep the tube at a set temperature (a hot-water bath) for some seconds. */
  function holdAt(t, Tc, seconds) {
    for (let i = 0; i < seconds * 10; i++) { t.state.T = Tc; t.tick(0.1); }
  }

  /** A snapshot of what you can see in a tube. */
  function look(t) {
    const s = t.state;
    return {
      V: s.V * 1000,
      color: t.liquidColor().slice(),
      ppt: t.precipitates().filter((p) => p.mol > 2e-6).map((p) => ({ name: p.name, mol: p.mol, color: p.color, desc: D.SOLIDS[p.name].name })),
      gas: s.gasRate.CO2 + s.gasRate.H2 + s.gasRate.O2 > 3e-7,
    };
  }

  /** Name a liquid colour in everyday words. */
  function colourName(rgb) {
    const base = [0.86, 0.93, 1.0];
    const rel = rgb.map((v, i) => Math.min(1, v / base[i]));
    const mx = Math.max(...rel), mn = Math.min(...rel);
    if (mn > 0.9) return 'colourless';
    const l = (mx + mn) / 2, sat = mx - mn;
    let h;
    const [r, g, b] = rel;
    if (mx === r) h = ((g - b) / (mx - mn || 1)) * 60;
    else if (mx === g) h = (2 + (b - r) / (mx - mn || 1)) * 60;
    else h = (4 + (r - g) / (mx - mn || 1)) * 60;
    if (h < 0) h += 360;
    let name = h < 18 || h >= 335 ? 'red' : h < 42 ? 'orange' : h < 68 ? 'yellow' : h < 165 ? 'green' : h < 255 ? 'blue' : h < 290 ? 'violet' : 'pink';
    if (name === 'red' && l < 0.45) return 'blood-red';
    if ((name === 'orange' || name === 'yellow') && l < 0.6 && sat > 0.4) return 'yellow-brown';
    const strength = sat < 0.22 ? 'pale ' : l < 0.45 ? 'deep ' : '';
    return strength + name;
  }

  const pptWords = (list) => {
    const names = [...new Set(list.map((p) => p.desc))];
    return names.length === 1 ? `a ${names[0]} precipitate` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} precipitates`;
  };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const forms = (list) => `${cap(pptWords(list))} ${list.length > 1 && new Set(list.map((p) => p.desc)).size > 1 ? 'form' : 'forms'}`;

  /** Plain-language observation for the change from `before` to `after`.
      stage: words for where we are ('in excess', 'in dilute ammonia'), '' for a
      plain addition, or null to say nothing about precipitates. */
  function describe(before, after, stage) {
    const out = [];
    if (after.gas && !(before && before.gas)) out.push('Effervescence: bubbles of a colourless gas.');
    if (stage !== null) {
      const old = before ? before.ppt : [];
      const fresh = after.ppt.filter((p) => !old.some((q) => q.name === p.name));
      const where = stage ? ' ' + stage : '';
      if (old.length) {
        // what happened to each precipitate that was already there
        const fate = old.map((q) => {
          const now = after.ppt.find((p) => p.name === q.name);
          const f = now ? now.mol / q.mol : 0;
          return { q, f };
        });
        const several = new Set(old.map((q) => q.desc)).size > 1;
        fate.forEach(({ q, f }) => {
          const what = several || fresh.length ? `The ${q.desc} precipitate` : 'The precipitate';
          if (f < 0.05) out.push(`${what} dissolves${where}.`);
          else if (f < 0.3) out.push(`Most of ${what.toLowerCase()} dissolves${where}.`);
          else if (f < 0.8) out.push(`${what} partly dissolves${where}.`);
          else if (stage) out.push(`${what} does not dissolve${where}.`);
        });
        if (fresh.length) out.push(`${forms(fresh)}${old.length ? ' as well' : ''}.`);
        else if (!stage && fate.every(({ f }) => f >= 0.8)) out.push('No further precipitate.');
      } else if (fresh.length) out.push(`${forms(fresh)}.`);
      else out.push('No precipitate.');
    }
    const c0 = before ? colourName(before.color) : null, c1 = colourName(after.color);
    if (c0 !== c1) out.push(c1 === 'colourless' ? 'The solution becomes colourless.' : `The solution turns ${c1}.`);
    else if (!before) out.push(`The solution is ${c1}.`);
    if (after.ppt.some((p) => p.name === 'Fe(OH)2')) out.push('(On standing in air the surface slowly turns brown.)');
    return out.join(' ');
  }

  /* ---------------- the tests ----------------
     Each returns { stages: [{ label, look, text, extra }] }. */
  const TESTS = {
    look: {
      name: 'Look at it', icon: '👁', free: true, tip: 'Colour of the solid and of its solution',
      run(u, unk) {
        const t = newTube(u);
        const o = look(t);
        const solid = CATIONS[unk.ck].solid || 'white crystals';
        return { stages: [{ label: '', look: o, text: `The solid is ${solid}. The solution is ${colourName(o.color)}.` }] };
      },
    },
    naoh: {
      name: 'Sodium hydroxide', icon: '🧪', tip: 'A few drops of 2 M NaOH, then excess',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.NaOH, 0.05); t.runFor(3); const o1 = look(t);
        t.add(R.NaOH, 3); t.runFor(4); const o2 = look(t);
        return { stages: [
          { label: 'a few drops', look: o1, text: describe(o0, o1, '') },
          { label: 'in excess', look: o2, text: describe(o1, o2, 'in excess') },
        ] };
      },
    },
    nh3: {
      name: 'Aqueous ammonia', icon: '🧪', tip: 'A few drops of 2 M NH₃(aq), then excess',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.NH3, 0.05); t.runFor(3); const o1 = look(t);
        t.add(R.NH3, 3); t.runFor(4); const o2 = look(t);
        return { stages: [
          { label: 'a few drops', look: o1, text: describe(o0, o1, '') },
          { label: 'in excess', look: o2, text: describe(o1, o2, 'in excess') },
        ] };
      },
    },
    warm: {
      name: 'Warm with NaOH; red litmus', icon: '♨️', tip: 'Add NaOH, warm in a water bath, hold damp red litmus paper at the mouth of the tube',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.NaOH, 2); holdAt(t, 85, 12);
        const o1 = look(t);
        const r = t.dampLitmus();
        const lit = r.result === 'blue' ? 'The damp red litmus paper turns blue: an alkaline gas is given off (it has a sharp smell).' : 'The damp red litmus paper stays red.';
        // copper(II) hydroxide dehydrates to black CuO on warming
        const cuo = o1.ppt.find((p) => p.name === 'Cu(OH)2');
        if (cuo) { cuo.desc = 'black'; cuo.color = '#1d1a19'; }
        return { stages: [{ label: 'warmed', look: o1, text: `${describe(o0, o1, '')}${cuo ? ' (It turns black on warming.)' : ''} ${lit}`, litmus: r.result === 'blue' ? '#4f5bd5' : '#d9434f' }] };
      },
    },
    flame: {
      name: 'Flame test', icon: '🔥', tip: 'Dip a clean nichrome wire in the solution and hold it in a blue Bunsen flame',
      run(u) {
        const t = newTube(u);
        const a = t.flameTest(false), b = t.flameTest(true);
        const txt = (r) => (r.sym ? `${WikiData.FLAME[r.sym].name} flame.` : 'No characteristic colour (the flame stays blue/orange).');
        return { stages: [
          { label: 'flame', look: look(t), text: txt(a), flame: a.color || '#f6a03c' },
          { label: 'through cobalt-blue glass', look: look(t), text: txt(b), flame: b.color || '#3d5bd9' },
        ] };
      },
    },
    hcl: {
      name: 'Dilute acid; limewater', icon: '🫧', tip: 'Add 2 M HCl to a little of the solid; bubble any gas through limewater',
      run(u) {
        // done on a spatula of the solid (≈ 1 mmol) moistened with 1 mL of water
        const solid = { ...u, id: u.id + '-solid', c: Object.fromEntries(Object.entries(u.c).map(([k, v]) => [k, v * 10])) };
        const t = newTube(solid); const o0 = look(t);
        // a delivery tube takes all the gas given off into the limewater
        let co2 = 0;
        const before = t.state.gas.CO2;
        t.add(R.HCl, 3);
        co2 += Math.max(0, t.state.gas.CO2 - before);
        for (let i = 0; i < 46; i++) { t.tick(0.1); co2 += t.state.gasRate.CO2 * 0.1; }
        const o1 = look(t);
        o1.gas = o1.gas || co2 > 5e-6;
        const lime = co2 > 5e-6 ? 'The gas turns limewater milky.' : o1.gas ? 'The limewater stays clear.' : '';
        return { stages: [{ label: 'acid added', look: o1, text: `${describe(o0, o1, '')} ${lime}`.trim(), bubbles: o1.gas }] };
      },
    },
    ag: {
      name: 'Silver nitrate (acidified)', icon: '⚪', tip: 'Acidify with 2 M HNO₃, add AgNO₃(aq); then test the precipitate with dilute and with concentrated ammonia',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.HNO3, 0.5); t.add(R.AgNO3, 1.5); t.runFor(3); const o1 = look(t);
        const stages = [{ label: 'HNO₃ + AgNO₃', look: o1, text: describe(o0, o1, '') }];
        if (o1.ppt.length) {
          const a = newTube(u); a.add(R.HNO3, 0.5); a.add(R.AgNO3, 1.5); a.runFor(2); const a1 = look(a);
          a.add(R.NH3, 3); a.runFor(4); const a2 = look(a);
          const b = newTube(u); b.add(R.HNO3, 0.5); b.add(R.AgNO3, 1.5); b.runFor(2); const b1 = look(b);
          b.add(R.NH3c, 3); b.runFor(4); const b2 = look(b);
          stages.push({ label: '+ dilute NH₃', look: a2, text: describe(a1, a2, 'in dilute ammonia') });
          stages.push({ label: '+ conc. NH₃', look: b2, text: describe(b1, b2, 'in concentrated ammonia') });
        }
        return { stages };
      },
    },
    ba: {
      name: 'Barium chloride (acidified)', icon: '🥛', tip: 'Acidify with 2 M HCl, then add BaCl₂(aq)',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.HCl, 0.5); t.runFor(2); const o1 = look(t);
        t.add(R.BaCl2, 1); t.runFor(3); const o2 = look(t);
        const st1 = describe(o0, o1, '');
        return { stages: [{ label: 'HCl + BaCl₂', look: o2, text: (o1.ppt.length || o1.gas ? `On adding the acid: ${st1} ` : '') + `On adding BaCl₂: ${describe(o1, o2, '')}` }] };
      },
    },
    scn: {
      name: 'Potassium thiocyanate', icon: '🩸', tip: 'Add two drops of KSCN(aq)',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.KSCN, 0.1); t.runFor(2); const o1 = look(t);
        return { stages: [{ label: 'KSCN', look: o1, text: describe(o0, o1, '') || 'No visible change.' }] };
      },
    },
    devarda: {
      name: 'NaOH + Devarda’s alloy, warm', icon: '🧲', tip: 'Add NaOH and Devarda’s alloy (Al/Cu/Zn), warm, test the gas with damp red litmus',
      run(u) {
        const t = newTube(u); const o0 = look(t);
        t.add(R.NaOH, 3);
        // the alloy reduces nitrate to ammonia: 3NO₃⁻ + 8Al + 5OH⁻ + 18H₂O → 3NH₃ + 8[Al(OH)₄]⁻
        const tot = t.state.totals;
        const x = tot.NO3 || 0;
        if (x > 0) { tot.NO3 = 0; tot.NH3 = (tot.NH3 || 0) + x; tot.Al = (tot.Al || 0) + (8 * x) / 3; }
        t.state.gasRate.H2 = 1e-6;          // the alloy also fizzes a little with the alkali
        holdAt(t, 85, 12);
        const o1 = look(t);
        const r = t.dampLitmus();
        const lit = r.result === 'blue' ? 'The damp red litmus paper turns blue (alkaline gas).' : 'The damp red litmus paper stays red.';
        return { stages: [{ label: 'warmed', look: o1, text: `The alloy fizzes slowly. ${lit}`, litmus: r.result === 'blue' ? '#4f5bd5' : '#d9434f' }] };
      },
    },
  };

  /* Key observations for each ion (shown in the report after the game). */
  const KEY = {
    Na: 'Yellow flame (persistent, masks other colours). No precipitate with NaOH or NH₃.',
    K: 'Lilac flame, best seen through cobalt-blue glass. No precipitate with NaOH or NH₃.',
    Li: 'Crimson flame. No precipitate with NaOH or NH₃ at this concentration.',
    NH4: 'Warming with NaOH gives ammonia, which turns damp red litmus blue. No flame colour.',
    Ca: 'Brick-red flame. White precipitate with NaOH (insoluble in excess); little or none with NH₃.',
    Ba: 'Apple-green flame. No precipitate with NaOH or NH₃ (Ba(OH)₂ is soluble).',
    Mg: 'White precipitate with NaOH, insoluble in excess. No flame colour.',
    Cu: 'Blue solution. Pale blue precipitate with NaOH (insoluble in excess); with NH₃ a pale blue precipitate dissolves in excess to a deep blue solution of [Cu(NH₃)₄]²⁺. Blue-green flame.',
    Fe2: 'Pale green solution. Dirty-green precipitate with NaOH or NH₃ that browns in air.',
    Fe3: 'Yellow-brown solution. Rust-brown precipitate with NaOH or NH₃. Blood-red colour with KSCN.',
    Zn: 'White precipitate with NaOH that dissolves in excess (amphoteric); also dissolves in excess NH₃ ([Zn(NH₃)₄]²⁺).',
    Al: 'White precipitate with NaOH that dissolves in excess; does NOT dissolve in excess NH₃ (unlike zinc).',
    Pb: 'White precipitate with NaOH that dissolves in excess; white with NH₃, insoluble in excess. White PbCl₂ with HCl.',
    Ag: 'Brown Ag₂O with NaOH. Brown precipitate with a little NH₃ that dissolves in excess. White AgCl with HCl.',
    Cl: 'White precipitate with acidified AgNO₃, soluble in dilute NH₃.',
    Br: 'Cream precipitate with acidified AgNO₃, insoluble in dilute but soluble in concentrated NH₃.',
    I: 'Yellow precipitate with acidified AgNO₃, insoluble even in concentrated NH₃.',
    SO4: 'White precipitate with acidified BaCl₂ (BaSO₄).',
    CO3: 'Effervescence with dilute acid; the gas (CO₂) turns limewater milky.',
    NO3: 'No result with AgNO₃ or BaCl₂. With NaOH and Devarda’s alloy, warming gives NH₃ (red litmus → blue), after ruling out NH₄⁺ first.',
  };

  /* ---------------- game state & UI ---------------- */
  let el = null, game = null;
  const esc = LabsHub.esc;

  function newGame(pick) {
    const list = stockList();
    const u = pick || list[Math.floor(Math.random() * list.length)];
    game = {
      ck: u.ck, ak: u.ak, formula: formula(u.ck, u.ak),
      reagent: { id: `unknown-${u.ck}-${u.ak}`, name: 'the unknown', kind: 'solution', c: stockSolution(u.ck, u.ak) },
      done: [], score: 100, wrong: 0, hints: false, solved: { c: false, a: false }, finished: false, gaveUp: false, notes: '',
    };
    log('labs', 'New unknown salt chosen (hidden)');
  }

  async function stats(update) {
    let s = { played: 0, solved: 0, best: 0, streak: 0 };
    try { s = (await ChemStore.get('labs', 'qual-stats')) || s; } catch (e) { /* storage unavailable */ }
    if (update) { update(s); try { await ChemStore.put('labs', 'qual-stats', s); } catch (e) { /* ignore */ } }
    return s;
  }

  function mount(container) {
    el = container;
    newGame();
    el.innerHTML = `
      <div class="lab-grid qual-grid">
        <aside class="panel lab-left">
          <div class="card"><h2>Your unknown</h2><p class="small">A bottle labelled <b>“Salt X, 0.1 mol/L”</b>. It contains one cation and one anion. Each test uses a fresh 1 mL sample.</p>
            <div class="score-box"><span>Score</span><b id="q-score">100</b></div>
            <div class="small dim" id="q-stats"></div></div>
          <div class="card"><h2>Tests</h2><div class="test-list" id="q-tests">${Object.entries(TESTS).map(([k, t]) => `<button class="hbtn small test-btn" data-t="${k}" data-tip="${esc(t.tip)}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>
            <p class="small dim">Up to 5 tests are free (looking is always free), then −4 points each.</p></div>
          <div class="card"><h2>Identify it</h2>
            <label class="field">Cation<select id="q-cat"><option value="">?</option>${Object.entries(CATIONS).map(([k, c]) => `<option value="${k}">${c.label} ${c.name}</option>`).join('')}</select></label>
            <label class="field">Anion<select id="q-an"><option value="">?</option>${Object.entries(ANIONS).map(([k, a]) => `<option value="${k}">${a.label} ${a.name}</option>`).join('')}</select></label>
            <button class="hbtn accent full" id="q-submit">Submit identification</button>
            <div class="btn-row"><button class="hbtn small" id="q-ref" data-tip="Costs 10 points">📋 Reference table</button>
            <button class="hbtn small" id="q-giveup">Give up</button><button class="hbtn small" id="q-new">🔀 New unknown</button></div>
            <div id="q-verdict" class="small"></div></div>
        </aside>
        <section class="lab-center qual-center">
          <div id="q-results" class="qual-results"><div class="dim empty-note">Choose a test on the left. Results appear here as test tubes with your observations.</div></div>
        </section>
        <aside class="panel lab-right">
          <div class="card"><h2>Notebook</h2><textarea id="q-notes" class="notes" placeholder="Your deductions, e.g. “no flame colour → not Na/K/Li/Ca/Ba/Cu”"></textarea></div>
          <div class="card hidden" id="q-refcard"><h2>Reference table</h2><div class="ref-table small" id="q-reftable"></div></div>
        </aside>
      </div>`;
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => runTest(b.dataset.t)));
    el.querySelector('#q-submit').addEventListener('click', submit);
    el.querySelector('#q-ref').addEventListener('click', showRef);
    el.querySelector('#q-giveup').addEventListener('click', giveUp);
    el.querySelector('#q-new').addEventListener('click', () => { if (!game.finished && game.done.length && !confirm('Start a new unknown? This one will count as not solved.')) return; if (!game.finished && game.done.length) stats((s) => { s.played++; s.streak = 0; }); newGame(); resetUI(); });
    el.querySelector('#q-notes').addEventListener('input', (e) => { game.notes = e.target.value; });
    resetUI();
  }
  function unmount() { el = null; }

  function resetUI() {
    el.querySelector('#q-results').innerHTML = '<div class="dim empty-note">Choose a test on the left. Results appear here as test tubes with your observations.</div>';
    el.querySelector('#q-cat').value = ''; el.querySelector('#q-an').value = '';
    el.querySelector('#q-verdict').innerHTML = '';
    el.querySelector('#q-notes').value = '';
    el.querySelector('#q-refcard').classList.add('hidden');
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.remove('used'));
    updateScore();
    stats().then((s) => { if (el) el.querySelector('#q-stats').textContent = s.played ? `Played ${s.played} · solved ${s.solved} · best ${s.best} · streak ${s.streak}` : ''; });
  }

  function updateScore() { el.querySelector('#q-score').textContent = Math.max(0, Math.round(game.score)); }

  function runTest(k) {
    if (game.finished) { toast('This unknown is finished: start a new one'); return; }
    const T = TESTS[k];
    let res;
    try { res = T.run(game.reagent, game); } catch (e) { logError('labs', `Test ${k} failed`, e); toast('That test hit an error; see the console', true); return; }
    if (!T.free) {
      const paid = game.done.filter((d) => !TESTS[d.k].free).length;
      if (paid >= 5) game.score -= 4;
    }
    game.done.push({ k, name: T.name, stages: res.stages.map((s) => ({ label: s.label, text: s.text })) });
    el.querySelector(`[data-t="${k}"]`).classList.add('used');
    const box = el.querySelector('#q-results');
    if (box.querySelector('.empty-note')) box.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'tube-card';
    card.innerHTML = `<h3>${T.icon} ${esc(T.name)} <span class="dim small">#${game.done.length}</span></h3>
      <div class="tube-row">${res.stages.map((s) => `<figure>${tubeSVG(s)}<figcaption>${esc(s.label)}</figcaption></figure>`).join('')}</div>
      <ul class="obs">${res.stages.map((s) => `<li>${s.label ? `<b>${esc(s.label)}:</b> ` : ''}${esc(s.text)}</li>`).join('')}</ul>`;
    box.prepend(card);
    updateScore();
  }

  /** A test tube drawn as SVG: liquid colour, precipitate cloud and sediment, bubbles, litmus or flame. */
  function tubeSVG(stage) {
    const o = stage.look;
    const col = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
    const h = Math.min(105, 18 + (o ? o.V : 1) * 11);
    const top = 140 - h;
    let inner = '';
    if (o) {
      inner += `<rect x="13" y="${top}" width="34" height="${h + 20}" fill="${col(o.color)}" opacity="0.92"/>`;
      o.ppt.forEach((p, i) => {
        inner += `<rect x="13" y="${top}" width="34" height="${h + 20}" fill="${p.color}" opacity="${Math.min(0.55, 0.15 + p.mol * 900)}"/>`;
        for (let k = 0; k < 26; k++) inner += `<circle cx="${15 + ((k * 37 + i * 11) % 30)}" cy="${top + 6 + ((k * 53 + i * 7) % Math.max(10, h - 6))}" r="1.3" fill="${p.color}" opacity="0.9"/>`;
        inner += `<ellipse cx="30" cy="${146 - i * 4}" rx="15" ry="${4 + Math.min(4, p.mol * 2e4)}" fill="${p.color}"/>`;
      });
      if (stage.bubbles || o.gas) for (let k = 0; k < 9; k++) inner += `<circle cx="${18 + (k * 7) % 24}" cy="${top + 8 + (k * 17) % Math.max(10, h - 10)}" r="${1.5 + (k % 3)}" fill="none" stroke="white" stroke-width="0.8" opacity="0.8"/>`;
    }
    const extra = stage.litmus ? `<rect x="40" y="2" width="9" height="26" rx="1.5" fill="${stage.litmus}" stroke="#fff3" />`
      : stage.flame ? `<path d="M30 0 C 20 14, 22 22, 30 30 C 38 22, 40 14, 30 0 Z" fill="${stage.flame}" opacity="0.9"/><line x1="30" y1="30" x2="30" y2="40" stroke="#bbb" stroke-width="1.5"/>` : '';
    return `<svg viewBox="0 -2 60 162" width="66" height="176" class="tube" aria-hidden="true">${extra}
      <defs><clipPath id="tc${tubeSVG.n = (tubeSVG.n || 0) + 1}"><path d="M14 30 V140 a16 16 0 0 0 32 0 V30 Z"/></clipPath></defs>
      <g clip-path="url(#tc${tubeSVG.n})">${inner}</g>
      <path d="M12 28 H48 M14 30 V140 a16 16 0 0 0 32 0 V30" fill="none" stroke="rgba(220,235,255,0.75)" stroke-width="2"/></svg>`;
  }

  function submit() {
    if (game.finished) return;
    const c = el.querySelector('#q-cat').value, a = el.querySelector('#q-an').value;
    if (!c || !a) { toast('Choose both a cation and an anion'); return; }
    const okC = c === game.ck, okA = a === game.ak;
    const v = el.querySelector('#q-verdict');
    if (okC) game.solved.c = true;
    if (okA) game.solved.a = true;
    if (okC && okA) {
      game.finished = true;
      v.innerHTML = `<div class="ok">✔ Correct! Salt X is <b>${game.formula}</b>, ${CATIONS[c].name} ${ANIONS[a].name}. Final score ${Math.max(0, Math.round(game.score))}. Press 📝 Lab report for the write-up.</div>`;
      stats((s) => { s.played++; s.solved++; s.streak++; s.best = Math.max(s.best, Math.round(game.score)); });
      toast('🎉 Identified!');
    } else {
      game.wrong++;
      game.score -= 15;
      v.innerHTML = `<div class="bad">✘ Not quite: the ${okC ? 'cation is right but the anion' : okA ? 'anion is right but the cation' : 'cation and anion are both'} wrong. −15 points.</div>`;
    }
    updateScore();
  }

  function giveUp() {
    if (game.finished) return;
    game.finished = true; game.gaveUp = true; game.score = 0;
    el.querySelector('#q-verdict').innerHTML = `<div class="bad">Salt X was <b>${game.formula}</b> (${CATIONS[game.ck].name} ${ANIONS[game.ak].name}). Read the key observations in the 📝 Lab report.</div>`;
    stats((s) => { s.played++; s.streak = 0; });
    updateScore();
  }

  function showRef() {
    const card = el.querySelector('#q-refcard');
    if (!game.hints) { game.hints = true; game.score -= 10; updateScore(); }
    card.classList.remove('hidden');
    el.querySelector('#q-reftable').innerHTML = Object.entries(KEY).map(([k, t]) => `<div><b>${(CATIONS[k] || ANIONS[k]).label}</b> ${esc(t)}</div>`).join('');
  }

  function report() {
    if (!game.done.length) { toast('Do some tests first'); return null; }
    if (!game.finished) { toast('Identify the salt (or give up) before writing the report'); return null; }
    const c = CATIONS[game.ck], a = ANIONS[game.ak];
    return {
      title: 'Qualitative analysis of an unknown salt',
      subtitle: game.gaveUp ? 'not identified' : `identified as ${game.formula}`,
      score: Math.max(0, Math.round(game.score)),
      sections: [
        { h: 'Aim', html: '<p>To identify the cation and anion in an unknown salt solution using precipitation reactions, gas tests and flame tests.</p>' },
        { h: 'Observations', html: LabsHub.table(['#', 'Test', 'Observations'], game.done.map((d, i) => [i + 1, esc(d.name), d.stages.map((s) => `${s.label ? `<b>${esc(s.label)}:</b> ` : ''}${esc(s.text)}`).join('<br/>')])) },
        { h: 'Conclusion', html: `<p>Salt X: <b>${game.formula}</b>, ${c.name} ${a.name}${game.gaveUp ? ' (revealed; not identified)' : ''}.</p>
          <p>${LabsHub.verdict(!game.gaveUp && game.wrong === 0, `${game.wrong} wrong identification${game.wrong === 1 ? '' : 's'}, ${game.done.length} tests${game.hints ? ', reference table used' : ''}.`)}</p>` },
        { h: 'Key observations for these ions', html: `<p><b>${c.label}:</b> ${esc(KEY[game.ck])}</p><p><b>${a.label}:</b> ${esc(KEY[game.ak])}</p>` },
        ...(game.notes ? [{ h: 'Your notes', html: `<p>${esc(game.notes).replace(/\n/g, '<br/>')}</p>` }] : []),
        { h: 'Evaluation', html: `<ul><li>Use a <b>fresh sample</b> for each test, and clean the flame-test wire (dip in conc. HCl, heat until no colour) between samples.</li>
          <li>The <b>acid</b> in the AgNO₃ and BaCl₂ tests removes carbonate (and hydroxide), which would otherwise also give precipitates.</li>
          <li><b>Sodium contamination</b> gives a yellow flame that hides other colours: cobalt-blue glass filters it out.</li>
          <li>A test is only as good as its <b>control</b>: try it on distilled water too if a result is faint.</li></ul>` },
      ],
    };
  }

  LabsHub.add({ id: 'qual', icon: '🧫', title: 'Qualitative salt analysis', blurb: 'Identify an unknown salt with precipitate, gas and flame tests. Scored as a game.', topics: ['cation tests', 'anion tests', 'amphoteric hydroxides', 'complex ions', 'flame tests'], mount, unmount, report });

  // console / test access
  return { CATIONS, ANIONS, TESTS, stockList, stockSolution, formula, colourName, newGame, runTestOn: (ck, ak, k) => { newGame({ ck, ak }); return TESTS[k].run(game.reagent, game); }, get game() { return game; } };
})();
