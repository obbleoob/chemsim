/* ============================================================================
   ChemSim · arena/gen.js
   ----------------------------------------------------------------------------
   Question GENERATORS: each one invents a fresh numeric (or data) question
   from random numbers, so practice never runs out. Wrong answers are not
   random: each is what you get from a typical mistake (°C instead of K,
   forgetting a coefficient, log instead of ln…), so a wrong pick tells you
   which mistake you made. The explanation shows the full working.

     ArenaGen.add({ id, topic, label, make(r) → question })
     ArenaGen.make(id, seed)       one question
     ArenaGen.list(topic)          generators for a topic

   Data used here are standard textbook values (CRC Handbook / NIST /
   IUPAC); where sources disagree the value is stated in the question.
   ============================================================================ */
'use strict';

const ArenaGen = (() => {
  const U = ArenaUtil;
  const { fmt, chem, sup } = U;
  const gens = [];
  const R_ATM = 0.08206, R_J = 8.314, F = 96485, NA = 6.022e23, H_PLANCK = 6.626e-34, C_LIGHT = 2.998e8;

  function add(def) { gens.push(def); }
  function make(id, seed) {
    const g = gens.find((x) => x.id === id);
    if (!g) throw new Error('No generator ' + id);
    const r = U.rng(seed);
    const q = g.make(r);
    if (!q) return null;
    return { id: 'gen:' + id, gen: id, seed, topic: g.topic, src: 'gen', ...q };
  }
  const list = (topic) => gens.filter((g) => !topic || g.topic === topic);
  /** Is the generator usable right now? (some need the element data loaded) */
  const ready = (g) => !g.needs || g.needs();
  const elementsReady = () => typeof WikiData !== 'undefined' && !!WikiData.elements;

  /** numeric MC question helper */
  function numQ(r, { stem, correct, wrongs, unit, sf = 3, dp = null, explain, hint, signed }) {
    const nc = U.numChoices(correct, wrongs, r, { sf, dp, unit, signed });
    return { stem, choices: nc.choices, answer: nc.answer, explain, hint };
  }
  const M = (f) => U.molarMass(f);
  const g2 = (x) => fmt(x, 3);

  /* ======================================================================
     STOICHIOMETRY & SOLUTIONS
     ====================================================================== */
  const COMPOUNDS = [
    ['H2O', 'water'], ['CO2', 'carbon dioxide'], ['NaCl', 'sodium chloride'], ['CaCO3', 'calcium carbonate'],
    ['C6H12O6', 'glucose'], ['H2SO4', 'sulfuric acid'], ['NH3', 'ammonia'], ['Al2(SO4)3', 'aluminium sulfate'],
    ['Ca(OH)2', 'calcium hydroxide'], ['KMnO4', 'potassium permanganate'], ['CuSO4·5H2O', 'copper(II) sulfate pentahydrate'],
    ['Mg3(PO4)2', 'magnesium phosphate'], ['C2H5OH', 'ethanol'], ['Fe2O3', 'iron(III) oxide'], ['(NH4)2SO4', 'ammonium sulfate'],
  ];
  add({
    id: 'moles', topic: 'stoich', label: 'Moles, mass and atoms',
    make(r) {
      const [f, name] = r.pick(COMPOUNDS);
      const Mm = M(f), counts = U.parseFormula(f);
      const mass = r.pick([2.50, 5.00, 10.0, 12.5, 25.0, 40.0, 50.0, 7.50]);
      const n = mass / Mm;
      if (r() < 0.5) {
        return numQ(r, {
          stem: `How many moles of ${name} (${chem(f)}) are in ${fmt(mass, 3)} g of the substance?`,
          correct: n, wrongs: [mass * Mm, Mm / mass, n * NA], unit: 'mol',
          explain: `M(${chem(f)}) = ${Mm.toFixed(2)} g/mol, so n = m/M = ${fmt(mass, 3)} g ÷ ${Mm.toFixed(2)} g/mol = <b>${g2(n)} mol</b>.`,
          hint: 'n = m / M. Add up the atomic masses to get M first.',
        });
      }
      const els = Object.keys(counts).filter((e) => counts[e] > 1);
      const el = els.length ? r.pick(els) : r.pick(Object.keys(counts));
      const atoms = n * counts[el] * NA;
      return numQ(r, {
        stem: `How many ${el} atoms are in ${fmt(mass, 3)} g of ${name} (${chem(f)})?`,
        correct: atoms, wrongs: [n * NA, n * counts[el], atoms * Mm / 10, mass * counts[el] * NA], unit: 'atoms',
        explain: `n(${chem(f)}) = ${fmt(mass, 3)} / ${Mm.toFixed(2)} = ${g2(n)} mol. Each formula unit has ${counts[el]} ${el}, so n(${el}) = ${g2(n * counts[el])} mol and N = n × N<sub>A</sub> = <b>${g2(atoms)}</b> atoms.`,
        hint: `Moles of compound → moles of ${el} (use the subscript) → number of atoms (× 6.022 × 10²³).`,
      });
    },
  });

  const REACTIONS = [
    { eq: '2 Al + 3 Cl₂ → 2 AlCl₃', A: ['Al', 2, 'aluminium'], B: ['Cl2', 3, 'chlorine'], P: ['AlCl3', 2, 'aluminium chloride'] },
    { eq: 'N₂ + 3 H₂ → 2 NH₃', A: ['N2', 1, 'nitrogen'], B: ['H2', 3, 'hydrogen'], P: ['NH3', 2, 'ammonia'] },
    { eq: '4 Fe + 3 O₂ → 2 Fe₂O₃', A: ['Fe', 4, 'iron'], B: ['O2', 3, 'oxygen'], P: ['Fe2O3', 2, 'iron(III) oxide'] },
    { eq: '2 Na + Cl₂ → 2 NaCl', A: ['Na', 2, 'sodium'], B: ['Cl2', 1, 'chlorine'], P: ['NaCl', 2, 'sodium chloride'] },
    { eq: 'P₄ + 6 Cl₂ → 4 PCl₃', A: ['P4', 1, 'white phosphorus (P₄)'], B: ['Cl2', 6, 'chlorine'], P: ['PCl3', 4, 'phosphorus trichloride'] },
    { eq: 'Fe₂O₃ + 3 CO → 2 Fe + 3 CO₂', A: ['Fe2O3', 1, 'iron(III) oxide'], B: ['CO', 3, 'carbon monoxide'], P: ['Fe', 2, 'iron'] },
    { eq: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O', A: ['CH4', 1, 'methane'], B: ['O2', 2, 'oxygen'], P: ['H2O', 2, 'water'] },
    { eq: '2 Mg + O₂ → 2 MgO', A: ['Mg', 2, 'magnesium'], B: ['O2', 1, 'oxygen'], P: ['MgO', 2, 'magnesium oxide'] },
  ];
  add({
    id: 'limiting', topic: 'stoich', label: 'Limiting reagent',
    make(r) {
      const R = r.pick(REACTIONS);
      const [fa, ca, na] = R.A, [fb, cb, nb] = R.B, [fp, cp, np] = R.P;
      const ma = +fmt(r.step(5, 40, 0.5), 3), Ma = M(fa), Mb = M(fb), Mp = M(fp);
      const molA = ma / Ma;
      // pick B so that either A or B limits (ratio 0.5–1.6 of the exact amount)
      const exactB = molA * cb / ca;
      const molBtarget = exactB * r.pick([0.55, 0.7, 0.8, 1.25, 1.4, 1.6]);
      const mb = +fmt(molBtarget * Mb, 3), molB = mb / Mb;
      const ext = Math.min(molA / ca, molB / cb);
      const lim = molA / ca < molB / cb ? 'A' : 'B';
      const mp = ext * cp * Mp;
      const wrongExt = Math.max(molA / ca, molB / cb);
      return numQ(r, {
        stem: `${R.eq}<br>What mass of ${np} can be made from ${fmt(ma, 3)} g of ${na} and ${fmt(mb, 3)} g of ${nb}?`,
        correct: mp, wrongs: [wrongExt * cp * Mp, Math.min(molA, molB) * Mp, ma + mb, ext * Mp], unit: 'g',
        explain: `n(${chem(fa)}) = ${fmt(ma, 3)}/${Ma.toFixed(2)} = ${g2(molA)} mol → ÷${ca} = ${g2(molA / ca)}; n(${chem(fb)}) = ${fmt(mb, 3)}/${Mb.toFixed(2)} = ${g2(molB)} mol → ÷${cb} = ${g2(molB / cb)}. ` +
          `The smaller value belongs to the <b>limiting reagent</b>, ${lim === 'A' ? na : nb}. ` +
          `n(${chem(fp)}) = ${g2(ext)} × ${cp} = ${g2(ext * cp)} mol; m = ${g2(ext * cp)} × ${Mp.toFixed(2)} = <b>${g2(mp)} g</b>.`,
        hint: 'Divide each reactant’s moles by its coefficient. The smaller result is the limiting reagent and sets how much product forms.',
      });
    },
  });

  add({
    id: 'dilution', topic: 'stoich', label: 'Dilution',
    make(r) {
      const sol = r.pick(['HCl', 'NaOH', 'H₂SO₄', 'NaCl', 'CuSO₄', 'KNO₃']);
      const c1 = r.pick([0.500, 1.00, 2.00, 6.00, 0.250, 3.00]);
      const V1 = r.pick([10.0, 20.0, 25.0, 50.0, 5.00]);
      const c2 = +(c1 / r.pick([2, 2.5, 4, 5, 8, 10])).toPrecision(3);
      const Vtot = V1 * c1 / c2, water = Vtot - V1;
      if (r() < 0.5) {
        return numQ(r, {
          stem: `What volume of water must be added to ${fmt(V1, 3)} mL of ${fmt(c1, 3)} M ${sol} to dilute it to ${fmt(c2, 3)} M? (Assume volumes are additive.)`,
          correct: water, wrongs: [Vtot, V1 * c2 / c1, V1 * (c1 - c2), Vtot + V1], unit: 'mL',
          explain: `c₁V₁ = c₂V₂ gives the <i>final</i> volume: V₂ = ${fmt(V1, 3)} × ${fmt(c1, 3)} / ${fmt(c2, 3)} = ${g2(Vtot)} mL. Water to add = ${g2(Vtot)} − ${fmt(V1, 3)} = <b>${g2(water)} mL</b>.`,
          hint: 'c₁V₁ = c₂V₂ gives the total volume after dilution, not the volume of water added.',
        });
      }
      return numQ(r, {
        stem: `${fmt(V1, 3)} mL of ${fmt(c1, 3)} M ${sol} is diluted with water to a total volume of ${fmt(Vtot, 3)} mL. What is the new concentration?`,
        correct: c2, wrongs: [c1 * Vtot / V1, c1 * V1 / (Vtot + V1), c1 - c2, c1 * V1 / water], unit: 'M',
        explain: `c₂ = c₁V₁/V₂ = ${fmt(c1, 3)} × ${fmt(V1, 3)} / ${fmt(Vtot, 3)} = <b>${g2(c2)} M</b>.`,
        hint: 'The moles of solute (c × V) stay the same when you add water.',
      });
    },
  });

  const ACIDS_TITR = [['HCl', 1, 'hydrochloric acid'], ['HNO₃', 1, 'nitric acid'], ['H₂SO₄', 2, 'sulfuric acid'], ['H₂C₂O₄', 2, 'oxalic acid'], ['H₃PO₄', 3, 'phosphoric acid (to the third end point)']];
  add({
    id: 'titration', topic: 'stoich', label: 'Titration volumes',
    make(r) {
      const [acid, h, name] = r.pick(ACIDS_TITR);
      const base = r.pick([['NaOH', 1], ['KOH', 1], ['Ba(OH)₂', 2]]);
      const ca = r.pick([0.0500, 0.100, 0.150, 0.200, 0.120]), Va = r.pick([10.0, 20.0, 25.0, 15.0]);
      const cb = r.pick([0.100, 0.200, 0.250, 0.0800]);
      const Vb = Va * ca * h / (cb * base[1]);
      return numQ(r, {
        stem: `What volume of ${fmt(cb, 3)} M ${base[0]} is needed to completely neutralise ${fmt(Va, 3)} mL of ${fmt(ca, 3)} M ${name.includes('(') ? 'H₃PO₄' : acid}${name.includes('(') ? ' (all three protons)' : ''}?`,
        correct: Vb, wrongs: [Va * ca / cb, Va * ca * base[1] / (cb * h), Va * cb / ca, Va * ca * h * base[1] / cb], unit: 'mL',
        explain: `n(H⁺) = ${h} × ${fmt(ca, 3)} M × ${fmt(Va, 3)} mL = ${g2(h * ca * Va)} mmol. Each ${base[0]} supplies ${base[1]} OH⁻, so n(${base[0]}) = ${g2(h * ca * Va / base[1])} mmol and V = ${g2(h * ca * Va / base[1])} / ${fmt(cb, 3)} = <b>${g2(Vb)} mL</b>.`,
        hint: 'Count H⁺ per acid molecule and OH⁻ per base formula unit: n(H⁺) = n(OH⁻) at the end point.',
      });
    },
  });

  const EMPIRICAL = [
    ['CH', 'CH2', 'CH3', 'C3H8', 'C2H5', 'C3H4'],
    ['CH2O', 'C2H4O', 'C2H6O', 'CH4O', 'C3H8O', 'C4H8O'],
    ['NO', 'NO2', 'N2O', 'N2O5', 'N2O3'],
    ['FeO', 'Fe2O3', 'Fe3O4'],
    ['CuO', 'Cu2O'],
    ['SO2', 'SO3', 'S2O'],
  ];
  add({
    id: 'empirical', topic: 'stoich', label: 'Empirical formula',
    make(r) {
      let fam;
      do { fam = r.pick(EMPIRICAL); } while (fam.length < 4 && r() < 0.6);
      const f = r.pick(fam);
      const counts = U.parseFormula(f), Mm = M(f);
      const els = Object.keys(counts);
      const pct = els.map((e) => (100 * counts[e] * M(e)) / Mm);
      const others = r.shuffle(fam.filter((x) => x !== f)).slice(0, 3);
      const pad = ['C2H3', 'C5H12', 'N3O', 'Fe3O2', 'Cu3O', 'SO4', 'C3H6O2', 'CHO'].filter((x) => U.parseFormula(x) && Object.keys(U.parseFormula(x)).sort().join() === els.slice().sort().join() && !fam.includes(x));
      while (others.length < 3 && pad.length) others.push(pad.shift());
      while (others.length < 3) others.push(els.map((e, i) => e + (counts[e] + i + 1)).join(''));
      const list = [f, ...others].map((x) => chem(x));
      const sc = U.shuffleChoices(list, r);
      const ratio = els.map((e, i) => `${e}: ${pct[i].toFixed(1)}/${M(e).toFixed(2)} = ${(pct[i] / M(e)).toFixed(3)}`).join('; ');
      return {
        stem: `A compound contains only ${els.length > 2 ? els.slice(0, -1).join(', ') + ' and ' + els[els.length - 1] : els.join(' and ')}: ${els.map((e, i) => `${pct[i].toFixed(1)}% ${e}`).join(', ')} by mass. What is its empirical formula?`,
        choices: sc.choices, answer: sc.answer,
        explain: `Take 100 g: moles = ${ratio}. Divide by the smallest and round to whole numbers: <b>${chem(f)}</b>.`,
        hint: 'Assume 100 g, convert each mass to moles, then divide by the smallest number of moles.',
      };
    },
  });

  add({
    id: 'yield', topic: 'stoich', label: 'Percent yield',
    make(r) {
      const R = r.pick([
        { eq: 'CaCO₃ → CaO + CO₂ (strong heating)', a: 'CaCO3', an: 'calcium carbonate', p: 'CaO', pn: 'calcium oxide', k: 1 },
        { eq: '2 KClO₃ → 2 KCl + 3 O₂', a: 'KClO3', an: 'potassium chlorate', p: 'O2', pn: 'oxygen', k: 1.5 },
        { eq: 'C₆H₁₂O₆ → 2 C₂H₅OH + 2 CO₂ (fermentation)', a: 'C6H12O6', an: 'glucose', p: 'C2H5OH', pn: 'ethanol', k: 2 },
        { eq: 'CH₃COOH + C₂H₅OH → CH₃COOC₂H₅ + H₂O', a: 'C2H4O2', an: 'ethanoic acid (excess ethanol)', p: 'C4H8O2', pn: 'ethyl ethanoate', k: 1 },
      ]);
      const ma = r.pick([10.0, 15.0, 20.0, 25.0, 50.0]);
      const theo = (ma / M(R.a)) * R.k * M(R.p);
      const pctY = r.int(55, 92);
      const actual = +(theo * pctY / 100).toPrecision(3);
      const y = 100 * actual / theo;
      return numQ(r, {
        stem: `${R.eq}<br>${fmt(ma, 3)} g of ${R.an} gives ${fmt(actual, 3)} g of ${R.pn}. What is the percent yield?`,
        correct: y, wrongs: [100 * actual / ma, 100 * actual / (theo / R.k), 100 * actual / (theo * R.k), 100 * (ma - actual) / ma], unit: '%',
        explain: `Theoretical yield = ${fmt(ma, 3)}/${M(R.a).toFixed(2)} × ${R.k} × ${M(R.p).toFixed(2)} = ${g2(theo)} g. Percent yield = ${fmt(actual, 3)}/${g2(theo)} × 100 = <b>${g2(y)}%</b>.`,
        hint: 'Percent yield = actual mass ÷ theoretical mass × 100, where the theoretical mass comes from the mole ratio.',
      });
    },
  });

  /* ======================================================================
     STATES OF MATTER & GASES
     ====================================================================== */
  const GASES = [['He', 'helium'], ['Ne', 'neon'], ['Ar', 'argon'], ['N2', 'nitrogen'], ['O2', 'oxygen'], ['CO2', 'carbon dioxide'], ['CH4', 'methane'], ['SO2', 'sulfur dioxide'], ['Cl2', 'chlorine'], ['NH3', 'ammonia'], ['C3H8', 'propane'], ['H2', 'hydrogen'], ['Kr', 'krypton'], ['SF6', 'sulfur hexafluoride']];
  add({
    id: 'idealgas', topic: 'states', label: 'Ideal gas law',
    make(r) {
      const [f, name] = r.pick(GASES);
      const Tc = r.pick([0, 25, 27, 37, 100, 127, -23]), T = Tc + 273.15;
      const P = r.pick([1.00, 0.500, 2.00, 1.50, 0.800, 3.00]);
      const mass = r.pick([1.00, 2.00, 4.00, 5.00, 8.00, 10.0]);
      const n = mass / M(f);
      const V = n * R_ATM * T / P;
      if (r() < 0.55) {
        return numQ(r, {
          stem: `What volume does ${fmt(mass, 3)} g of ${name} gas occupy at ${Tc} °C and ${fmt(P, 3)} atm?`,
          correct: V, wrongs: [Tc ? n * R_ATM * Tc / P : V * 1.1, n * 22.4, n * R_J * T / P, n * R_ATM * T * P, mass * R_ATM * T / P], unit: 'L',
          explain: `n = ${fmt(mass, 3)}/${M(f).toFixed(2)} = ${g2(n)} mol. V = nRT/P = ${g2(n)} × 0.08206 × ${T.toFixed(2)} / ${fmt(P, 3)} = <b>${g2(V)} L</b>.`,
          hint: 'PV = nRT with R = 0.08206 L·atm/(mol·K), and T in kelvin.',
        });
      }
      const Vg = +V.toPrecision(3);
      const Mcalc = mass * R_ATM * T / (P * Vg);
      return numQ(r, {
        stem: `A ${fmt(mass, 3)} g sample of an unknown gas occupies ${fmt(Vg, 3)} L at ${Tc} °C and ${fmt(P, 3)} atm. What is its molar mass?`,
        correct: Mcalc, wrongs: [Tc ? mass * R_ATM * Tc / (P * Vg) : Mcalc * 1.3, mass * 22.4 / Vg, P * Vg / (mass * R_ATM * T), mass * R_J * T / (P * Vg)], unit: 'g/mol',
        explain: `M = mRT/(PV) = ${fmt(mass, 3)} × 0.08206 × ${T.toFixed(2)} / (${fmt(P, 3)} × ${fmt(Vg, 3)}) = <b>${g2(Mcalc)} g/mol</b> (it could be ${name}).`,
        hint: 'Combine n = m/M with PV = nRT: M = mRT/(PV).',
      });
    },
  });

  add({
    id: 'combined', topic: 'states', label: 'Combined gas law',
    make(r) {
      const P1 = r.pick([100, 101.3, 120, 80.0, 150]), V1 = r.pick([2.00, 5.00, 10.0, 0.500, 1.50]);
      const T1c = r.pick([20, 25, 0, 50]), T2c = r.pick([100, 150, -20, 200, 80].filter((x) => x !== T1c));
      const P2 = r.pick([200, 50.0, 300, 75.0, 101.3]);
      const T1 = T1c + 273.15, T2 = T2c + 273.15;
      const V2 = P1 * V1 * T2 / (T1 * P2);
      return numQ(r, {
        stem: `A gas occupies ${fmt(V1, 3)} L at ${fmt(P1, 4)} kPa and ${fmt(T1c, 3)} °C. What is its volume at ${fmt(P2, 4)} kPa and ${fmt(T2c, 3)} °C?`,
        correct: V2, wrongs: [T1c ? P1 * V1 * T2c / (T1c * P2) : V2 * 1.25, P2 * V1 * T2 / (T1 * P1), P1 * V1 * T1 / (T2 * P2), P1 * V1 / P2], unit: 'L',
        explain: `V₂ = V₁ × (P₁/P₂) × (T₂/T₁) = ${fmt(V1, 3)} × (${fmt(P1, 4)}/${fmt(P2, 4)}) × (${T2.toFixed(2)}/${T1.toFixed(2)}) = <b>${g2(V2)} L</b>.`,
        hint: 'P₁V₁/T₁ = P₂V₂/T₂, with temperatures in kelvin.',
      });
    },
  });

  add({
    id: 'graham', topic: 'states', label: 'Effusion (Graham’s law)',
    make(r) {
      const [a, b] = r.sample(GASES, 2).sort((x, y) => M(x[0]) - M(y[0]));
      if (Math.abs(M(a[0]) - M(b[0])) < 3) return this.make(r);
      const ratio = Math.sqrt(M(b[0]) / M(a[0]));
      return numQ(r, {
        stem: `Under the same conditions, how many times faster does ${a[1]} (${chem(a[0])}) effuse than ${b[1]} (${chem(b[0])})?`,
        correct: ratio, wrongs: [M(b[0]) / M(a[0]), 1 / ratio, (M(b[0]) / M(a[0])) ** 2], unit: '',
        explain: `Rate ∝ 1/√M: rate(${chem(a[0])})/rate(${chem(b[0])}) = √(${M(b[0]).toFixed(2)}/${M(a[0]).toFixed(2)}) = <b>${g2(ratio)}</b>. Lighter molecules move faster at the same temperature.`,
        hint: 'Graham’s law: rate₁/rate₂ = √(M₂/M₁).',
      });
    },
  });

  add({
    id: 'partial', topic: 'states', label: 'Partial pressures',
    make(r) {
      const [a, b] = r.sample(GASES.filter((g) => g[0] !== 'NH3'), 2);
      const ma = r.pick([2.00, 4.00, 8.00, 16.0, 10.0]), mb = r.pick([2.00, 4.00, 8.00, 14.0, 6.00]);
      const P = r.pick([1.00, 2.00, 5.00, 0.800, 3.00]);
      const na = ma / M(a[0]), nb = mb / M(b[0]);
      const pa = P * na / (na + nb);
      return numQ(r, {
        stem: `A container holds ${fmt(ma, 3)} g of ${chem(a[0])} and ${fmt(mb, 3)} g of ${chem(b[0])} at a total pressure of ${fmt(P, 3)} atm. What is the partial pressure of ${chem(a[0])}?`,
        correct: pa, wrongs: [P * ma / (ma + mb), P * nb / (na + nb), P / 2, P * na / nb], unit: 'atm',
        explain: `n(${chem(a[0])}) = ${g2(na)} mol, n(${chem(b[0])}) = ${g2(nb)} mol. Mole fraction χ = ${g2(na / (na + nb))}, so p = χP = <b>${g2(pa)} atm</b>.`,
        hint: 'Partial pressure = mole fraction × total pressure (use moles, not grams).',
      });
    },
  });

  add({
    id: 'gasdensity', topic: 'states', label: 'Identify a gas from its density',
    make(r) {
      const cands = r.sample(GASES.filter((g) => M(g[0]) > 3), 4);
      const ok = cands.every((g, i) => cands.every((h, j) => i === j || Math.abs(M(g[0]) - M(h[0])) > 3));
      if (!ok) return this.make(r);
      const [f] = cands[0];
      const Tc = r.pick([0, 25, 100]), T = Tc + 273.15, P = r.pick([1.00, 0.750, 1.50]);
      const d = +(P * M(f) / (R_ATM * T)).toPrecision(3);
      const sc = U.shuffleChoices(cands.map((g) => `${chem(g[0])} (${g[1]})`), r);
      return {
        stem: `A gas has a density of ${fmt(d, 3)} g/L at ${Tc} °C and ${fmt(P, 3)} atm. Which gas could it be?`,
        choices: sc.choices, answer: sc.answer,
        explain: `M = dRT/P = ${fmt(d, 3)} × 0.08206 × ${T.toFixed(2)} / ${fmt(P, 3)} = ${(d * R_ATM * T / P).toFixed(1)} g/mol, which matches <b>${chem(f)}</b> (${M(f).toFixed(1)} g/mol).`,
        hint: 'Rearrange PV = nRT with n = m/M and d = m/V: M = dRT/P.',
      };
    },
  });

  /* ======================================================================
     THERMODYNAMICS
     ====================================================================== */
  const SPEC_HEAT = { Al: ['aluminium', 0.897], Cu: ['copper', 0.385], Fe: ['iron', 0.449], Pb: ['lead', 0.129], Ag: ['silver', 0.235], Zn: ['zinc', 0.388] };
  add({
    id: 'calorimetry', topic: 'thermo', label: 'Calorimetry',
    make(r) {
      const [sym, [name, c]] = r.pick(Object.entries(SPEC_HEAT));
      const m1 = r.pick([25.0, 50.0, 75.0, 100, 40.0]), T1 = r.pick([95.0, 100.0, 85.0, 150.0]);
      const m2 = r.pick([50.0, 100, 150, 200, 75.0]), T2 = r.pick([20.0, 22.0, 25.0, 18.0]);
      if (r() < 0.4) {
        const dT = r.pick([5.0, 10.0, 15.0, 25.0, 30.0]);
        const q = m2 * 4.184 * dT;
        return numQ(r, {
          stem: `How much heat is needed to warm ${fmt(m2, 3)} g of water by ${fmt(dT, 3)} °C? (c(water) = 4.184 J g⁻¹ K⁻¹)`,
          correct: q / 1000, wrongs: [m2 * dT / 1000, m2 * 4.184 * (dT + 273.15) / 1000, q / 4.184 / 1000 * 1, q], unit: 'kJ',
          explain: `q = mcΔT = ${fmt(m2, 3)} × 4.184 × ${fmt(dT, 3)} = ${q.toFixed(0)} J = <b>${g2(q / 1000)} kJ</b>. A change of 1 °C equals a change of 1 K.`,
          hint: 'q = m·c·ΔT. A temperature change in °C is the same number in K.',
        });
      }
      const Tf = (m1 * c * T1 + m2 * 4.184 * T2) / (m1 * c + m2 * 4.184);
      return numQ(r, {
        stem: `A ${fmt(m1, 3)} g piece of ${name} (c = ${c} J g⁻¹ K⁻¹) at ${fmt(T1, 3)} °C is dropped into ${fmt(m2, 3)} g of water (c = 4.184 J g⁻¹ K⁻¹) at ${fmt(T2, 3)} °C in an insulated cup. What is the final temperature?`,
        correct: Tf, wrongs: [(T1 + T2) / 2, (m1 * T1 + m2 * T2) / (m1 + m2), (m1 * 4.184 * T1 + m2 * c * T2) / (m1 * 4.184 + m2 * c)], unit: '°C', sf: 3,
        explain: `Heat lost by the metal = heat gained by the water: ${fmt(m1, 3)}·${c}·(${fmt(T1, 3)} − T) = ${fmt(m2, 3)}·4.184·(T − ${fmt(T2, 3)}). Solving: T = <b>${fmt(Tf, 3)} °C</b>. Water’s large heat capacity keeps T close to its starting value.`,
        hint: 'Set m·c·ΔT (metal) equal to m·c·ΔT (water) and solve for the shared final temperature.',
      });
    },
  });

  const DHF = { 'CO2(g)': -393.5, 'H2O(l)': -285.8, 'H2O(g)': -241.8, 'CH4(g)': -74.8, 'C3H8(g)': -103.8, 'C2H5OH(l)': -277.7, 'CH3OH(l)': -238.7, 'CaCO3(s)': -1206.9, 'CaO(s)': -635.1, 'Fe2O3(s)': -824.2, 'Al2O3(s)': -1675.7, 'NH3(g)': -46.1, 'NO(g)': 90.3, 'SO2(g)': -296.8, 'SO3(g)': -395.7, 'C2H2(g)': 226.7, 'C6H6(l)': 49.0, 'HCl(g)': -92.3, 'NH4Cl(s)': -314.4 };
  const HESS = [
    { name: 'the combustion of methane', re: [['CH4(g)', 1], ['O2(g)', 2]], pr: [['CO2(g)', 1], ['H2O(l)', 2]] },
    { name: 'the combustion of propane', re: [['C3H8(g)', 1], ['O2(g)', 5]], pr: [['CO2(g)', 3], ['H2O(l)', 4]] },
    { name: 'the combustion of ethanol', re: [['C2H5OH(l)', 1], ['O2(g)', 3]], pr: [['CO2(g)', 2], ['H2O(l)', 3]] },
    { name: 'the decomposition of limestone', re: [['CaCO3(s)', 1]], pr: [['CaO(s)', 1], ['CO2(g)', 1]] },
    { name: 'the thermite reaction', re: [['Fe2O3(s)', 1], ['Al(s)', 2]], pr: [['Al2O3(s)', 1], ['Fe(s)', 2]] },
    { name: 'the oxidation of ammonia (Ostwald process)', re: [['NH3(g)', 4], ['O2(g)', 5]], pr: [['NO(g)', 4], ['H2O(g)', 6]] },
    { name: 'the oxidation of sulfur dioxide', re: [['SO2(g)', 2], ['O2(g)', 1]], pr: [['SO3(g)', 2]] },
    { name: 'the combustion of ethyne (acetylene)', re: [['C2H2(g)', 2], ['O2(g)', 5]], pr: [['CO2(g)', 4], ['H2O(l)', 2]] },
    { name: 'the reaction of ammonia with hydrogen chloride', re: [['NH3(g)', 1], ['HCl(g)', 1]], pr: [['NH4Cl(s)', 1]] },
  ];
  const side = (list) => list.map(([s, k]) => `${k > 1 ? k + ' ' : ''}${chem(s.replace(/\(.*\)/, ''))}(${s.match(/\((.*)\)/)[1]})`).join(' + ');
  add({
    id: 'hess', topic: 'thermo', label: 'ΔH from enthalpies of formation',
    make(r) {
      const H = r.pick(HESS);
      const sum = (list, coef = true) => list.reduce((s, [sp, k]) => s + (DHF[sp] || 0) * (coef ? k : 1), 0);
      const dH = sum(H.pr) - sum(H.re);
      const used = [...H.re, ...H.pr].filter(([s]) => DHF[s] !== undefined);
      return numQ(r, {
        stem: `Use the standard enthalpies of formation to find ΔH° for ${H.name}:<br><span class="ar-eq">${side(H.re)} → ${side(H.pr)}</span><div class="ar-data">${used.map(([s]) => `ΔH°<sub>f</sub> ${chem(s.replace(/\(.*\)/, ''))}(${s.match(/\((.*)\)/)[1]}) = ${String(DHF[s]).replace('-', '−')} kJ/mol`).join('<br>')}</div>`,
        correct: dH, wrongs: [-dH, sum(H.pr, false) - sum(H.re, false), sum(H.pr) + sum(H.re)], unit: 'kJ', signed: true, sf: 4,
        explain: `ΔH° = ΣΔH°<sub>f</sub>(products) − ΣΔH°<sub>f</sub>(reactants) = (${fmt(sum(H.pr), 5)}) − (${fmt(sum(H.re), 5)}) = <b>${fmt(dH, 4)} kJ</b>. Elements in their standard states (O₂, Al, Fe…) have ΔH°<sub>f</sub> = 0. Remember to multiply by the coefficients.`,
        hint: 'Products minus reactants, each multiplied by its coefficient; elements count as zero.',
      });
    },
  });

  add({
    id: 'gibbs', topic: 'thermo', label: 'ΔG = ΔH − TΔS',
    make(r) {
      const dH = r.pick([-120, -85.0, 45.0, 92.0, 178, -40.0, 131]);
      const dS = r.pick(dH > 0 ? [160, 125, 198, 285] : [-150, -95.0, 60.0, -210]);
      if (r() < 0.5 || dH < 0 && dS > 0) {
        const Tc = r.pick([25, 100, 500, 1000]), T = Tc + 273.15;
        const dG = dH - T * dS / 1000;
        return numQ(r, {
          stem: `For a reaction ΔH° = ${dH} kJ/mol and ΔS° = ${dS} J mol⁻¹ K⁻¹. Assuming both are independent of temperature, what is ΔG° at ${Tc} °C?`,
          correct: dG, wrongs: [dH - T * dS, dH - Tc * dS / 1000, dH + T * dS / 1000], unit: 'kJ/mol', signed: true,
          explain: `ΔG° = ΔH° − TΔS° = ${dH} − (${T.toFixed(2)} K)(${dS / 1000} kJ mol⁻¹ K⁻¹) = <b>${g2(dG)} kJ/mol</b>. ${dG < 0 ? 'Negative: product-favoured at this temperature.' : 'Positive: reactant-favoured at this temperature.'}`,
          hint: 'Convert ΔS to kJ (÷1000) and T to kelvin before using ΔG = ΔH − TΔS.',
        });
      }
      const Tx = dH * 1000 / dS;
      return numQ(r, {
        stem: `For a reaction ΔH° = ${dH} kJ/mol and ΔS° = ${dS} J mol⁻¹ K⁻¹. At what temperature does ΔG° = 0 (the crossover between product- and reactant-favoured)?`,
        correct: Tx, wrongs: [dH / dS, Tx - 273.15, dS / dH * 1000], unit: 'K',
        explain: `ΔG° = 0 when T = ΔH°/ΔS° = ${dH * 1000} J/mol ÷ ${dS} J mol⁻¹ K⁻¹ = <b>${g2(Tx)} K</b>. ${dH > 0 ? 'Above this temperature the reaction is product-favoured (the −TΔS term wins).' : 'Below this temperature the reaction is product-favoured.'}`,
        hint: 'Set ΔH − TΔS = 0 and use the same energy unit for both.',
      });
    },
  });

  const BE = { 'H–H': 436, 'Cl–Cl': 243, 'H–Cl': 432, 'C–H': 413, 'O=O': 498, 'C=O': 799, 'O–H': 463, 'C–C': 348, 'C=C': 614, 'N≡N': 945, 'N–H': 391, 'Br–Br': 193, 'H–Br': 366, 'C–Cl': 328, 'F–F': 155, 'H–F': 567 };
  const BOND_RXN = [
    { eq: 'H₂ + Cl₂ → 2 HCl', br: { 'H–H': 1, 'Cl–Cl': 1 }, fo: { 'H–Cl': 2 } },
    { eq: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O (all gases)', br: { 'C–H': 4, 'O=O': 2 }, fo: { 'C=O': 2, 'O–H': 4 } },
    { eq: 'N₂ + 3 H₂ → 2 NH₃', br: { 'N≡N': 1, 'H–H': 3 }, fo: { 'N–H': 6 } },
    { eq: 'H₂C=CH₂ + H₂ → H₃C–CH₃', br: { 'C=C': 1, 'H–H': 1 }, fo: { 'C–C': 1, 'C–H': 2 } },
    { eq: 'H₂ + Br₂ → 2 HBr (gases)', br: { 'H–H': 1, 'Br–Br': 1 }, fo: { 'H–Br': 2 } },
    { eq: 'CH₄ + Cl₂ → CH₃Cl + HCl', br: { 'C–H': 1, 'Cl–Cl': 1 }, fo: { 'C–Cl': 1, 'H–Cl': 1 } },
    { eq: 'H₂ + F₂ → 2 HF', br: { 'H–H': 1, 'F–F': 1 }, fo: { 'H–F': 2 } },
  ];
  add({
    id: 'bondenthalpy', topic: 'thermo', label: 'Bond enthalpies',
    make(r) {
      const X = r.pick(BOND_RXN);
      const S = (o) => Object.entries(o).reduce((s, [b, k]) => s + BE[b] * k, 0);
      const S1 = (o) => Object.entries(o).reduce((s, [b]) => s + BE[b], 0);
      const dH = S(X.br) - S(X.fo);
      const bonds = [...new Set([...Object.keys(X.br), ...Object.keys(X.fo)])];
      return numQ(r, {
        stem: `Estimate ΔH for <span class="ar-eq">${X.eq}</span> from average bond enthalpies (kJ/mol): ${bonds.map((b) => `${b} ${BE[b]}`).join(', ')}.`,
        correct: dH, wrongs: [-dH, S1(X.br) - S1(X.fo), S(X.br) + S(X.fo)], unit: 'kJ', signed: true,
        explain: `ΔH ≈ Σ(bonds broken) − Σ(bonds formed) = ${S(X.br)} − ${S(X.fo)} = <b>${fmt(dH, 3)} kJ</b>. Breaking bonds costs energy; forming them releases it.`,
        hint: 'Energy in (bonds broken) minus energy out (bonds formed). Count every bond, using the coefficients.',
      });
    },
  });

  /* ======================================================================
     KINETICS
     ====================================================================== */
  add({
    id: 'halflife', topic: 'kinetics', label: 'First-order half-life',
    make(r) {
      const iso = r.pick([['iodine-131', 8.02, 'days'], ['phosphorus-32', 14.3, 'days'], ['radon-222', 3.82, 'days'], ['cobalt-60', 5.27, 'years'], ['a first-order reactant', 25.0, 'min'], ['N₂O₅ (first-order decomposition)', 3.6, 'h'], ['technetium-99m', 6.01, 'h']]);
      const [name, th, unit] = iso;
      const k = Math.LN2 / th;
      const v = r.int(0, 2);
      if (v === 0) {
        const t = +(th * r.pick([1.5, 2.5, 3.2, 0.7, 4.0, 1.25])).toPrecision(3);
        const frac = Math.exp(-k * t);
        return numQ(r, {
          stem: `${name[0].toUpperCase() + name.slice(1)} has a half-life of ${th} ${unit}. What percentage of a sample remains after ${fmt(t, 3)} ${unit}?`,
          correct: 100 * frac, wrongs: [100 * (1 - t / (2 * th)), 100 / (t / th + 1), 100 * (1 - frac), 100 * 0.5 ** Math.floor(t / th)], unit: '%',
          explain: `Number of half-lives = ${fmt(t, 3)}/${th} = ${(t / th).toFixed(3)}. Fraction left = (½)^${(t / th).toFixed(3)} = ${frac.toFixed(4)}, i.e. <b>${g2(100 * frac)}%</b>. (Same as e<sup>−kt</sup> with k = ln2/t<sub>½</sub>.)`,
          hint: 'Fraction remaining = (½)^(t / t½), even when t/t½ is not a whole number.',
        });
      }
      if (v === 1) {
        return numQ(r, {
          stem: `The first-order rate constant for the decay of ${name} is ${fmt(k, 3)} ${unit}⁻¹. What is its half-life?`,
          correct: th, wrongs: [1 / k, k * Math.LN2, Math.log10(2) / k, 0.5 / k], unit,
          explain: `t<sub>½</sub> = ln 2 / k = 0.693 / ${fmt(k, 3)} = <b>${g2(th)} ${unit}</b>. For a first-order reaction the half-life does not depend on concentration.`,
          hint: 'For first order: t½ = 0.693 / k.',
        });
      }
      const pct = r.pick([10, 20, 25, 5, 1]);
      const t = Math.log(100 / pct) / k;
      return numQ(r, {
        stem: `${name[0].toUpperCase() + name.slice(1)} has a half-life of ${th} ${unit}. How long until only ${pct}% of the original amount remains?`,
        correct: t, wrongs: [th * (100 / pct) / 2, th * (100 - pct) / 50, Math.log10(100 / pct) / k, th * 100 / pct], unit,
        explain: `ln(N₀/N) = kt with k = 0.693/${th} = ${fmt(k, 3)} ${unit}⁻¹. t = ln(100/${pct}) / k = ${Math.log(100 / pct).toFixed(3)} / ${fmt(k, 3)} = <b>${g2(t)} ${unit}</b>.`,
        hint: 'Use ln(N₀/N) = kt with k = ln 2 / t½.',
      });
    },
  });

  const ORD = ['', '', '²', '³'];
  const rateLaw = (m, n) => `rate = k${m ? '[A]' + ORD[m] : ''}${n ? '[B]' + ORD[n] : ''}`.replace('k$', 'k');
  add({
    id: 'ratelaw', topic: 'kinetics', label: 'Rate law from initial rates',
    make(r) {
      const m = r.int(0, 2), n = r.int(0, 2);
      if (m === 0 && n === 0) return this.make(r);
      const a0 = r.pick([0.10, 0.020, 0.050]), b0 = r.pick([0.10, 0.030, 0.20]);
      const k = r.pick([1.5, 2.4, 0.36, 4.2, 0.85]);
      const fa = r.pick([2, 3]), fb = r.pick([2, 3]);
      const rate = (a, b) => k * a ** m * b ** n;
      const rows = [[a0, b0], [a0 * fa, b0], [a0, b0 * fb]];
      const all = [];
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) if (i + j > 0) all.push([i, j]);
      const wrong = r.shuffle(all.filter(([i, j]) => !(i === m && j === n))).slice(0, 3);
      const sc = U.shuffleChoices([[m, n], ...wrong].map(([i, j]) => rateLaw(i, j)), r);
      return {
        stem: `Initial rates for A + B → products:<table class="ar-table"><tr><th>Expt</th><th>[A]₀ (M)</th><th>[B]₀ (M)</th><th>Initial rate (M/s)</th></tr>${rows.map(([a, b], i) => `<tr><td>${i + 1}</td><td>${fmt(a, 2)}</td><td>${fmt(b, 2)}</td><td>${fmt(rate(a, b), 3)}</td></tr>`).join('')}</table>What is the rate law?`,
        choices: sc.choices, answer: sc.answer,
        explain: `Expt 1→2: [A] × ${fa}, rate × ${fmt(fa ** m, 2)} = ${fa}^${m}, so order in A = ${m}. Expt 1→3: [B] × ${fb}, rate × ${fmt(fb ** n, 2)} = ${fb}^${n}, so order in B = ${n}. <b>${rateLaw(m, n)}</b>.`,
        hint: 'Compare two experiments where only one concentration changes: (rate ratio) = (concentration ratio)^order.',
      };
    },
  });

  add({
    id: 'arrhenius', topic: 'kinetics', label: 'Activation energy (Arrhenius)',
    make(r) {
      const Ea = r.pick([40, 50, 65, 75, 88, 100, 120]) * 1000;
      const T1 = r.pick([298, 300, 310, 320]), T2 = T1 + r.pick([10, 20, 25, 40, 50]);
      const ratio = +Math.exp((Ea / R_J) * (1 / T1 - 1 / T2)).toPrecision(3);
      const EaCalc = R_J * Math.log(ratio) / (1 / T1 - 1 / T2) / 1000;
      return numQ(r, {
        stem: `The rate constant of a reaction increases by a factor of ${fmt(ratio, 3)} when the temperature is raised from ${T1} K to ${T2} K. What is the activation energy?`,
        correct: EaCalc, wrongs: [EaCalc / 2.303, EaCalc * 2.303, R_J * ratio / (1 / T1 - 1 / T2) / 1000, R_J * Math.log(ratio) / (T2 - T1) / 1000], unit: 'kJ/mol',
        explain: `ln(k₂/k₁) = (E<sub>a</sub>/R)(1/T₁ − 1/T₂) → E<sub>a</sub> = 8.314 × ln(${fmt(ratio, 3)}) / (1/${T1} − 1/${T2}) = 8.314 × ${Math.log(ratio).toFixed(3)} / ${(1 / T1 - 1 / T2).toExponential(3)} = <b>${g2(EaCalc)} kJ/mol</b>.`,
        hint: 'Two-point Arrhenius: ln(k₂/k₁) = (Ea/R)(1/T₁ − 1/T₂), natural log, R = 8.314 J mol⁻¹ K⁻¹.',
      });
    },
  });

  add({
    id: 'kunits', topic: 'kinetics', label: 'Units of the rate constant',
    make(r) {
      const n = r.int(0, 3);
      const unit = (o) => (o === 1 ? 's⁻¹' : o === 0 ? 'M s⁻¹' : `M${sup(1 - o)} s⁻¹`);
      const opts = [0, 1, 2, 3].map(unit);
      const sc = U.shuffleChoices([unit(n), ...opts.filter((u) => u !== unit(n))], r);
      const word = ['zero', 'first', 'second', 'third'][n];
      return {
        stem: `A reaction is ${word} order overall. With concentrations in M (mol/L) and time in seconds, what are the units of its rate constant k?`,
        choices: sc.choices, answer: sc.answer,
        explain: `rate (M s⁻¹) = k × M^${n}, so k has units M^(1−${n}) s⁻¹ = <b>${unit(n)}</b>.`,
        hint: 'Rate always has units of M/s. Divide by Mⁿ for an n-th order reaction.',
      };
    },
  });

  /* ======================================================================
     EQUILIBRIUM, ACIDS & BASES
     ====================================================================== */
  const pH = (h) => -Math.log10(h);
  add({
    id: 'phstrong', topic: 'equil', label: 'pH of strong acids and bases',
    make(r) {
      const sp = r.pick([['HCl', 1, 'a'], ['HNO₃', 1, 'a'], ['HClO₄', 1, 'a'], ['NaOH', 1, 'b'], ['KOH', 1, 'b'], ['Ba(OH)₂', 2, 'b'], ['Sr(OH)₂', 2, 'b']]);
      const c = r.pick([0.0010, 0.0050, 0.010, 0.020, 0.025, 0.050, 0.0020, 0.15]);
      const [f, k, t] = sp;
      const val = t === 'a' ? pH(c * k) : 14 + Math.log10(c * k);
      const wrongs = t === 'a' ? [14 - val, pH(c), pH(c * 2), -Math.log(c), val + 1, val - 0.3] : [14 - val, 14 + Math.log10(c), 14 + Math.log10(2 * c * k), 14 + Math.log10(c / 2), val - 1, 14 + Math.log(c * k)];
      return numQ(r, {
        stem: `What is the pH of ${fmt(c, 2)} M ${f} at 25 °C?`,
        correct: val, wrongs: wrongs.filter((x) => Math.abs(x - val) > 0.05), unit: '', dp: 2,
        explain: t === 'a' ? `${f} is a strong acid: [H⁺] = ${fmt(c * k, 2)} M, pH = −log(${fmt(c * k, 2)}) = <b>${val.toFixed(2)}</b>.`
          : `${f} is a strong base giving ${k} OH⁻ per formula unit: [OH⁻] = ${fmt(c * k, 2)} M, pOH = ${(14 - val).toFixed(2)}, pH = 14.00 − pOH = <b>${val.toFixed(2)}</b>.`,
        hint: t === 'a' ? 'Strong acids ionise completely: [H⁺] = concentration.' : 'Find [OH⁻] (count the OH groups), then pOH, then pH = 14 − pOH.',
      });
    },
  });

  const WEAK = [['ethanoic (acetic) acid, CH₃COOH', 1.8e-5], ['hydrofluoric acid, HF', 6.8e-4], ['hydrocyanic acid, HCN', 6.2e-10], ['nitrous acid, HNO₂', 4.5e-4], ['benzoic acid, C₆H₅COOH', 6.3e-5], ['hypochlorous acid, HOCl', 3.0e-8], ['methanoic (formic) acid, HCOOH', 1.8e-4]];
  add({
    id: 'phweak', topic: 'equil', label: 'pH of weak acids and bases',
    make(r) {
      const c = r.pick([0.010, 0.050, 0.10, 0.20, 0.25, 0.50]);
      if (r() < 0.75) {
        const [name, Ka] = r.pick(WEAK);
        const x = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * c)) / 2;
        const v = pH(x);
        return numQ(r, {
          stem: `What is the pH of ${fmt(c, 2)} M ${name}? (K<sub>a</sub> = ${fmt(Ka, 2)})`,
          correct: v, wrongs: [pH(c), pH(Ka * c), pH(Ka), pH(Math.sqrt(Ka / c)), 14 - v].filter((y) => Math.abs(y - v) > 0.08), unit: '', dp: 2,
          explain: `HA ⇌ H⁺ + A⁻: K<sub>a</sub> = x²/(${fmt(c, 2)} − x). ${x / c < 0.05 ? `Since x ≪ c, x ≈ √(K<sub>a</sub>c) = ${fmt(Math.sqrt(Ka * c), 3)} M.` : `Solving the quadratic, x = ${fmt(x, 3)} M.`} pH = <b>${v.toFixed(2)}</b>.`,
          hint: 'Set up an ICE table; for a weak acid [H⁺] ≈ √(Ka·c) when the acid is only slightly ionised.',
        });
      }
      const Kb = 1.8e-5;
      const x = (-Kb + Math.sqrt(Kb * Kb + 4 * Kb * c)) / 2;
      const v = 14 + Math.log10(x);
      return numQ(r, {
        stem: `What is the pH of ${fmt(c, 2)} M aqueous ammonia? (K<sub>b</sub> = 1.8 × 10⁻⁵)`,
        correct: v, wrongs: [14 - v, 14 + Math.log10(c), pH(x), 14 + Math.log10(Kb * c)].filter((y) => Math.abs(y - v) > 0.08), unit: '', dp: 2,
        explain: `NH₃ + H₂O ⇌ NH₄⁺ + OH⁻: [OH⁻] ≈ √(K<sub>b</sub>c) = ${fmt(x, 3)} M, pOH = ${(14 - v).toFixed(2)}, pH = <b>${v.toFixed(2)}</b>.`,
        hint: 'A weak base: find [OH⁻] ≈ √(Kb·c), then pOH, then pH.',
      });
    },
  });

  add({
    id: 'buffer', topic: 'equil', label: 'Buffer pH',
    make(r) {
      const [name, Ka] = r.pick(WEAK.filter((w) => w[1] > 1e-6));
      const pKa = -Math.log10(Ka);
      const short = name.split(', ')[1];
      const ca = r.pick([0.100, 0.200, 0.150]), Va = r.pick([50.0, 100, 40.0]);
      const cb = r.pick([0.100, 0.200]), Vb = +(ca * Va / cb * r.pick([0.2, 0.25, 0.4, 0.6, 0.75, 0.3])).toPrecision(3);
      const nA = ca * Va, nB = cb * Vb;               // mmol
      const v = pKa + Math.log10(nB / (nA - nB));
      return numQ(r, {
        stem: `${fmt(Vb, 3)} mL of ${fmt(cb, 3)} M NaOH is added to ${fmt(Va, 3)} mL of ${fmt(ca, 3)} M ${short} (K<sub>a</sub> = ${fmt(Ka, 2)}). What is the pH of the mixture?`,
        correct: v, wrongs: [pKa, pKa + Math.log10(nB / nA), pKa - Math.log10(nB / (nA - nB)), pKa + Math.log10((nA - nB) / nA)].filter((y) => Math.abs(y - v) > 0.05), unit: '', dp: 2,
        explain: `OH⁻ converts acid to its conjugate base: n(A⁻) = ${g2(nB)} mmol, n(HA) left = ${g2(nA)} − ${g2(nB)} = ${g2(nA - nB)} mmol. Henderson–Hasselbalch: pH = pK<sub>a</sub> + log(n(A⁻)/n(HA)) = ${pKa.toFixed(2)} + log(${g2(nB)}/${g2(nA - nB)}) = <b>${v.toFixed(2)}</b>.`,
        hint: 'React the OH⁻ with the acid first (it goes to completion), then use pH = pKa + log([A⁻]/[HA]).',
      });
    },
  });

  const KSP = [['AgCl', 1.8e-10, 1, 1, 'Ag⁺', 'Cl⁻'], ['BaSO₄', 1.1e-10, 1, 1, 'Ba²⁺', 'SO₄²⁻'], ['CaF₂', 3.9e-11, 1, 2, 'Ca²⁺', 'F⁻'], ['PbI₂', 7.1e-9, 1, 2, 'Pb²⁺', 'I⁻'], ['Mg(OH)₂', 5.6e-12, 1, 2, 'Mg²⁺', 'OH⁻'], ['Ag₂CrO₄', 1.1e-12, 2, 1, 'Ag⁺', 'CrO₄²⁻'], ['Ag₂CO₃', 8.5e-12, 2, 1, 'Ag⁺', 'CO₃²⁻'], ['CaCO₃', 3.4e-9, 1, 1, 'Ca²⁺', 'CO₃²⁻']];
  add({
    id: 'ksp', topic: 'equil', label: 'Solubility and Ksp',
    make(r) {
      const [salt, Ksp, a, b, cat, an] = r.pick(KSP);
      const coef = a ** a * b ** b, n = a + b;
      const s = (Ksp / coef) ** (1 / n);
      const v = r.int(0, 2);
      if (v === 0) {
        return numQ(r, {
          stem: `K<sub>sp</sub> of ${salt} is ${fmt(Ksp, 2)} at 25 °C. What is its molar solubility in pure water?`,
          correct: s, wrongs: [Math.sqrt(Ksp), Ksp ** (1 / n), (Ksp / n) ** (1 / n), Ksp / coef], unit: 'M',
          explain: `${salt}(s) ⇌ ${a > 1 ? a : ''}${cat} + ${b > 1 ? b : ''}${an}. K<sub>sp</sub> = (${a > 1 ? a : ''}s)^${a}(${b > 1 ? b : ''}s)^${b} = ${coef}s^${n}, so s = (${fmt(Ksp, 2)}/${coef})^(1/${n}) = <b>${fmt(s, 3)} M</b>.`,
          hint: 'Write Ksp in terms of the molar solubility s, remembering the coefficients become both multipliers and powers.',
        });
      }
      if (v === 1) {
        const sm = +s.toPrecision(2);
        const K = coef * sm ** n;
        return numQ(r, {
          stem: `The molar solubility of ${salt} in water is ${fmt(sm, 2)} M at 25 °C. What is K<sub>sp</sub>?`,
          correct: K, wrongs: [sm ** n, sm * sm, n * sm ** n, coef * sm], unit: '', sf: 2,
          explain: `K<sub>sp</sub> = ${coef}s^${n} = ${coef} × (${fmt(sm, 2)})^${n} = <b>${fmt(K, 2)}</b>.`,
          hint: `Dissolving s mol/L gives ${a}s of ${cat} and ${b}s of ${an}.`,
        });
      }
      // common ion: dissolve in a solution of the anion
      const c = r.pick([0.010, 0.050, 0.10, 0.20]);
      const sci = (Ksp / (a ** a * (b * 0 + c) ** b)) ** (1 / a);
      return numQ(r, {
        stem: `K<sub>sp</sub> of ${salt} is ${fmt(Ksp, 2)}. What is its molar solubility in a solution that is ${fmt(c, 2)} M in ${an} (from a soluble sodium salt)?`,
        correct: sci, wrongs: [s, Ksp / c, Math.sqrt(Ksp / c), (Ksp / c) ** (1 / n)], unit: 'M',
        explain: `The common ion suppresses dissolving. With [${an}] ≈ ${fmt(c, 2)} M: K<sub>sp</sub> = (${a > 1 ? a : ''}s)^${a} × (${fmt(c, 2)})^${b}, so s = <b>${fmt(sci, 3)} M</b> (much less than ${fmt(s, 3)} M in pure water).`,
        hint: 'Treat the common-ion concentration as fixed (the salt adds almost nothing to it).',
      });
    },
  });

  add({
    id: 'kc', topic: 'equil', label: 'K from equilibrium amounts',
    make(r) {
      const R = r.pick([
        { eq: 'H₂(g) + I₂(g) ⇌ 2 HI(g)', type: 'hi' },
        { eq: 'N₂O₄(g) ⇌ 2 NO₂(g)', type: 'no2' },
        { eq: 'PCl₅(g) ⇌ PCl₃(g) + Cl₂(g)', type: 'pcl5' },
      ]);
      const V = r.pick([1.00, 2.00, 5.00]);
      const n0 = r.pick([0.200, 0.500, 1.00, 0.400]);
      const f = r.pick([0.2, 0.3, 0.4, 0.6, 0.7, 0.8]);
      let K, stem, wrongs, explain;
      if (R.type === 'hi') {
        const nHI = +(2 * n0 * f).toPrecision(3);
        const h = (n0 - nHI / 2) / V, hi = nHI / V;
        K = hi * hi / (h * h);
        stem = `${fmt(n0, 3)} mol of H₂ and ${fmt(n0, 3)} mol of I₂ are placed in a ${fmt(V, 3)} L flask. At equilibrium (${R.eq}) the flask contains ${fmt(nHI, 3)} mol of HI. What is K<sub>c</sub>?`;
        wrongs = [hi / (h * h), hi * hi / ((n0 / V) ** 2), (hi / (n0 / V - hi)) ** 2, 1 / K];
        explain = `Forming ${fmt(nHI, 3)} mol HI uses ${g2(nHI / 2)} mol each of H₂ and I₂, leaving ${g2(n0 - nHI / 2)} mol. K<sub>c</sub> = [HI]²/([H₂][I₂]) = (${g2(hi)})²/(${g2(h)})² = <b>${g2(K)}</b>.`;
      } else if (R.type === 'no2') {
        const x = n0 * f / 2;
        const no2 = 2 * x / V, n2o4 = (n0 - x) / V;
        K = no2 * no2 / n2o4;
        stem = `${fmt(n0, 3)} mol of N₂O₄ is placed in a ${fmt(V, 3)} L flask. At equilibrium (${R.eq}) ${fmt(100 * f / 2, 2)}% of the N₂O₄ has dissociated. What is K<sub>c</sub>?`;
        wrongs = [no2 / n2o4, (x / V) ** 2 / n2o4, no2 * no2 / (n0 / V), 1 / K];
        explain = `x = ${g2(x)} mol N₂O₄ reacts, giving ${g2(2 * x)} mol NO₂. [NO₂] = ${g2(no2)} M, [N₂O₄] = ${g2(n2o4)} M. K<sub>c</sub> = [NO₂]²/[N₂O₄] = <b>${g2(K)}</b>.`;
      } else {
        const x = n0 * f;
        const p = x / V, a = (n0 - x) / V;
        K = p * p / a;
        stem = `${fmt(n0, 3)} mol of PCl₅ is heated in a ${fmt(V, 3)} L container. At equilibrium (${R.eq}) ${fmt(100 * f, 2)}% of the PCl₅ has decomposed. What is K<sub>c</sub>?`;
        wrongs = [p / a, p * p / (n0 / V), x * x / (n0 - x), 1 / K];
        explain = `x = ${g2(x)} mol decomposes: [PCl₃] = [Cl₂] = ${g2(p)} M, [PCl₅] = ${g2(a)} M. K<sub>c</sub> = ${g2(p)}²/${g2(a)} = <b>${g2(K)}</b>.`;
      }
      return { ...numQ(r, { stem, correct: K, wrongs, unit: '', explain, hint: 'Make an ICE table in moles, divide by the volume, then substitute into the K expression (with powers = coefficients).' }) };
    },
  });

  add({
    id: 'kp', topic: 'equil', label: 'Kp and Kc',
    make(r) {
      const R = r.pick([['N₂(g) + 3 H₂(g) ⇌ 2 NH₃(g)', -2], ['2 SO₂(g) + O₂(g) ⇌ 2 SO₃(g)', -1], ['N₂O₄(g) ⇌ 2 NO₂(g)', 1], ['PCl₅(g) ⇌ PCl₃(g) + Cl₂(g)', 1], ['H₂(g) + I₂(g) ⇌ 2 HI(g)', 0]]);
      const T = r.pick([400, 500, 700, 1000, 298]);
      const Kc = +fmt(r.pick([0.050, 0.50, 4.0, 2.5e-3, 13, 0.21]), 2);
      const Kp = Kc * (R_ATM * T) ** R[1];
      return numQ(r, {
        stem: `For ${R[0]}, K<sub>c</sub> = ${fmt(Kc, 2)} at ${T} K. What is K<sub>p</sub> (pressures in atm) at this temperature?`,
        correct: Kp, wrongs: [Kc * (R_ATM * T) ** -R[1], Kc * (R_J * T) ** R[1], Kc * (R_ATM * T), Kc / (R_ATM * T) ** 2], unit: '', sf: 2,
        explain: `K<sub>p</sub> = K<sub>c</sub>(RT)^Δn with Δn = (moles of gas products − reactants) = ${R[1]}. K<sub>p</sub> = ${fmt(Kc, 2)} × (0.08206 × ${T})^${R[1]} = <b>${fmt(Kp, 2)}</b>.${R[1] === 0 ? ' With Δn = 0, K<sub>p</sub> = K<sub>c</sub>.' : ''}`,
        hint: 'Kp = Kc(RT)^Δn, Δn counting gases only, R = 0.08206 L·atm/(mol·K).',
      });
    },
  });

  /* ======================================================================
     REDOX & ELECTROCHEMISTRY
     ====================================================================== */
  const HALF = [
    ['F₂ + 2e⁻ → 2 F⁻', 2.87, 2], ['Au³⁺ + 3e⁻ → Au', 1.50, 3], ['Cl₂ + 2e⁻ → 2 Cl⁻', 1.36, 2], ['Br₂ + 2e⁻ → 2 Br⁻', 1.07, 2],
    ['Ag⁺ + e⁻ → Ag', 0.80, 1], ['Fe³⁺ + e⁻ → Fe²⁺', 0.77, 1], ['I₂ + 2e⁻ → 2 I⁻', 0.54, 2], ['Cu²⁺ + 2e⁻ → Cu', 0.34, 2],
    ['2 H⁺ + 2e⁻ → H₂', 0.00, 2], ['Pb²⁺ + 2e⁻ → Pb', -0.13, 2], ['Ni²⁺ + 2e⁻ → Ni', -0.25, 2], ['Fe²⁺ + 2e⁻ → Fe', -0.44, 2],
    ['Zn²⁺ + 2e⁻ → Zn', -0.76, 2], ['Al³⁺ + 3e⁻ → Al', -1.66, 3], ['Mg²⁺ + 2e⁻ → Mg', -2.37, 2], ['Na⁺ + e⁻ → Na', -2.71, 1], ['Li⁺ + e⁻ → Li', -3.04, 1],
  ];
  const lcm = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x); return a * b / g(a, b); };
  const sgn = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
  add({
    id: 'ecell', topic: 'redox', label: 'Cell potential, ΔG and K',
    make(r) {
      let [a, b] = r.sample(HALF, 2);
      if (a[1] < b[1]) [a, b] = [b, a];          // a = cathode (higher E°)
      if (a[1] - b[1] < 0.2) return this.make(r);
      const E = a[1] - b[1], n = lcm(a[2], b[2]);
      const table = `<div class="ar-data">${a[0]} &nbsp; E° = ${sgn(a[1])} V<br>${b[0]} &nbsp; E° = ${sgn(b[1])} V</div>`;
      const v = r.int(0, 2);
      if (v === 0) {
        const mult = n / a[2];
        return numQ(r, {
          stem: `${table}What is E°<sub>cell</sub> of the galvanic cell made from these two half-cells?`,
          correct: E, wrongs: [a[1] + b[1], mult * a[1] - b[1], -E, a[1] - (n / b[2]) * b[1]].filter((x) => Math.abs(x - E) > 0.02), unit: 'V', signed: true,
          explain: `The half-reaction with the higher E° (${a[0]}) is the cathode. E°<sub>cell</sub> = E°<sub>cathode</sub> − E°<sub>anode</sub> = ${sgn(a[1])} − (${sgn(b[1])}) = <b>${sgn(E)} V</b>. E° is an intensive property: do <i>not</i> multiply it when balancing electrons.`,
          hint: 'E°cell = E°(cathode) − E°(anode). The more positive E° is reduced. Never multiply E° by coefficients.',
        });
      }
      const dG = -n * F * E / 1000;
      if (v === 1) {
        return numQ(r, {
          stem: `${table}What is ΔG° for the spontaneous cell reaction (balanced with the smallest whole-number coefficients)?`,
          correct: dG, wrongs: [-F * E / 1000, -n * F * E, n * F * E / 1000, -n * R_J * E / 1000 * 100].filter((x) => isFinite(x)), unit: 'kJ', signed: true,
          explain: `E°<sub>cell</sub> = ${sgn(E)} V and n = ${n} electrons transferred. ΔG° = −nFE° = −${n} × 96 485 × ${E.toFixed(2)} = <b>${fmt(dG, 3)} kJ</b>.`,
          hint: 'ΔG° = −nFE°, with n = electrons in the balanced equation, F = 96 485 C/mol; convert J to kJ.',
        });
      }
      const logK = n * E / 0.05916;
      return numQ(r, {
        stem: `${table}What is log₁₀ K at 25 °C for the spontaneous cell reaction (smallest whole-number coefficients)?`,
        correct: logK, wrongs: [E / 0.05916, n * E / 0.0257, n * E * 0.05916, logK * 2.303], unit: '', sf: 3,
        explain: `log K = nE°/0.0592 V = ${n} × ${E.toFixed(2)} / 0.0592 = <b>${logK.toFixed(1)}</b>, so K ≈ 10^${logK.toFixed(0)}: the reaction goes essentially to completion.`,
        hint: 'At 25 °C, E° = (0.0592 V / n) log K.',
      });
    },
  });

  const METALS_EL = [['Cu²⁺', 'copper', 'Cu', 2], ['Ag⁺', 'silver', 'Ag', 1], ['Zn²⁺', 'zinc', 'Zn', 2], ['Ni²⁺', 'nickel', 'Ni', 2], ['Al³⁺ (molten Al₂O₃)', 'aluminium', 'Al', 3], ['Cr³⁺', 'chromium', 'Cr', 3], ['Au³⁺', 'gold', 'Au', 3]];
  add({
    id: 'faraday', topic: 'redox', label: 'Electrolysis (Faraday)',
    make(r) {
      const [ion, name, sym, n] = r.pick(METALS_EL);
      const I = r.pick([0.500, 1.50, 2.00, 2.50, 5.00, 10.0]), tmin = r.pick([10.0, 20.0, 30.0, 45.0, 60.0, 90.0]);
      const Q = I * tmin * 60, mass = Q / F / n * M(sym);
      return numQ(r, {
        stem: `A current of ${fmt(I, 3)} A is passed through a solution of ${ion} for ${fmt(tmin, 3)} minutes. What mass of ${name} is deposited at the cathode?`,
        correct: mass, wrongs: [Q / F * M(sym), mass / 60, Q / F * n * M(sym), I * tmin / F / n * M(sym) * 3600], unit: 'g',
        explain: `Q = It = ${fmt(I, 3)} × ${tmin * 60} s = ${Q.toFixed(0)} C; n(e⁻) = Q/F = ${fmt(Q / F, 3)} mol; n(${sym}) = n(e⁻)/${n} = ${fmt(Q / F / n, 3)} mol; m = × ${M(sym).toFixed(2)} = <b>${g2(mass)} g</b>.`,
        hint: 'Charge (C) = current × time in seconds; moles of electrons = Q/96 485; divide by the ion’s charge.',
      });
    },
  });

  const OXN = [
    ['Mn', 'KMnO₄', 7], ['Cr', 'Cr₂O₇²⁻', 6], ['S', 'S₂O₃²⁻ (thiosulfate)', 2], ['N', 'NH₄⁺', -3], ['N', 'NO₃⁻', 5], ['N', 'N₂H₄ (hydrazine)', -2],
    ['C', 'CH₂O (methanal)', 0], ['P', 'H₂PO₄⁻', 5], ['Cl', 'ClO₄⁻', 7], ['Cl', 'ClO⁻', 1], ['O', 'H₂O₂', -1], ['O', 'OF₂', 2], ['H', 'NaH', -1],
    ['Xe', 'XeF₄', 4], ['I', 'IO₃⁻', 5], ['Os', 'OsO₄', 8], ['U', 'UO₂²⁺', 6], ['Co', '[Co(NH₃)₆]³⁺', 3], ['Fe', '[Fe(CN)₆]⁴⁻', 2],
    ['V', 'VO₂⁺', 5], ['Mn', 'MnO₄²⁻ (manganate)', 6], ['S', 'H₂SO₃', 4], ['C', 'C₂O₄²⁻ (oxalate)', 3], ['N', 'N₂O', 1], ['Cl', 'ClO₂', 4], ['C', 'CH₃OH', -2], ['Pt', '[PtCl₆]²⁻', 4],
  ];
  add({
    id: 'oxnum', topic: 'redox', label: 'Oxidation numbers',
    make(r) {
      const [el, sp, ox] = r.pick(OXN);
      const pool = [ox - 2, ox - 1, ox + 1, ox + 2, -ox, ox + 3, ox - 3].filter((x, i, arr) => x !== ox && arr.indexOf(x) === i && x >= -4 && x <= 8);
      const vals = [ox, ...r.sample(pool, 3)].sort((a, b) => a - b);
      const s = (x) => (x > 0 ? '+' + x : x < 0 ? '−' + -x : '0');
      return {
        stem: `What is the oxidation number of ${el} in ${sp}?`,
        choices: vals.map(s), answer: vals.indexOf(ox),
        explain: `Using O = −2 (except in peroxides and with F), H = +1 (−1 in metal hydrides), F = −1, and making the total equal the overall charge gives <b>${el} = ${s(ox)}</b>.`,
        hint: 'Oxidation numbers add up to the charge of the species. Fix the ones you know (O, H, F, group 1) first.',
      };
    },
  });

  add({
    id: 'nernst', topic: 'redox', label: 'Nernst equation',
    make(r) {
      const cell = r.pick([['Zn', 'Cu', 1.10, 2, 'Zn²⁺', 'Cu²⁺'], ['Zn', 'Ag', 1.56, 2, 'Zn²⁺', 'Ag⁺'], ['Ni', 'Cu', 0.59, 2, 'Ni²⁺', 'Cu²⁺'], ['Mg', 'Zn', 1.61, 2, 'Mg²⁺', 'Zn²⁺']]);
      const [an, ca, E0, n, ia, ic] = cell;
      const cA = r.pick([0.0010, 0.010, 0.10, 1.0, 2.0]), cC = r.pick([0.0010, 0.010, 0.10, 1.0, 0.50].filter((x) => x !== cA));
      const pw = ic === 'Ag⁺' ? 2 : 1;
      const Q = cA / cC ** pw;
      const E = E0 - (0.05916 / n) * Math.log10(Q);
      return numQ(r, {
        stem: `E°<sub>cell</sub> = ${E0.toFixed(2)} V for ${an}(s) | ${ia}(${fmt(cA, 2)} M) || ${ic}(${fmt(cC, 2)} M) | ${ca}(s). What is E<sub>cell</sub> at 25 °C?`,
        correct: E, wrongs: [E0, E0 + (0.05916 / n) * Math.log10(Q), E0 - 0.05916 * Math.log10(Q), E0 - (0.05916 / n) * Math.log10(cA / cC)].filter((x) => Math.abs(x - E) > 0.004), unit: 'V', signed: true, sf: 3,
        explain: `Q = [${ia}]/[${ic}]${pw > 1 ? '²' : ''} = ${fmt(Q, 3)}. E = E° − (0.0592/${n}) log Q = ${E0.toFixed(2)} − ${(0.05916 / n).toFixed(4)} × ${Math.log10(Q).toFixed(2)} = <b>${E.toFixed(3)} V</b>.`,
        hint: 'E = E° − (0.0592/n) log Q, where Q = [anode ion]/[cathode ion] (with powers from the balanced equation).',
      });
    },
  });

  /* ======================================================================
     ATOMIC STRUCTURE & PERIODICITY (uses the Element Wiki data)
     ====================================================================== */
  const cfg = (s) => String(s).replace(/([spdf])(\d+)/g, (_, l, n) => l + sup(n));
  const E = (sym) => WikiData.get(sym);
  add({
    id: 'config', topic: 'atomic', label: 'Electron configurations', needs: elementsReady,
    make(r) {
      if (r() < 0.6) {
        const z = r.pick([...Array(33).keys()].map((i) => i + 4).filter((z) => z !== 18 && z !== 10));
        const el = WikiData.byZ(z);
        const correct = el.configShort;
        const pool = new Set();
        [-2, -1, 1, 2].forEach((d) => { const o = WikiData.byZ(z + d); if (o && o.configShort !== correct) pool.add(o.configShort); });
        // the classic exceptions: offer the "aufbau" answer
        if (el.sym === 'Cr') pool.add('[Ar] 3d4 4s2');
        if (el.sym === 'Cu') pool.add('[Ar] 3d9 4s2');
        const wrong = r.sample([...pool], 3);
        const sc = U.shuffleChoices([correct, ...wrong].map(cfg), r);
        return {
          stem: `What is the ground-state electron configuration of ${el.name} (Z = ${z})?`,
          choices: sc.choices, answer: sc.answer,
          explain: `${el.name}: <b>${cfg(correct)}</b>.${el.sym === 'Cr' || el.sym === 'Cu' ? ' This is an exception to the aufbau order: a half-filled or filled 3d subshell is extra stable, so one 4s electron moves into 3d.' : ''}`,
          hint: 'Fill 1s 2s 2p 3s 3p 4s 3d 4p… and watch for Cr and Cu.',
        };
      }
      // a transition-metal ion: the 4s electrons leave first
      const sym = r.pick(['Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn']);
      const el = E(sym), ch = r.pick(sym === 'Zn' ? [2] : [2, 3]);
      const d = el.group - ch;
      const fmtd = (dn, s) => `[Ar]${dn ? ' 3d' + dn : ''}${s ? ' 4s' + s : ''}`.trim();
      const correct = fmtd(d, 0);
      const ok = (dn) => dn >= 0 && dn <= 10;
      const wrong = [[d - 2, 2], [d - 1, 1], [d, 2], [d + 2, 0], [d - 1, 2], [d + 1, 0], [d - 2, 0]].filter(([dn]) => ok(dn)).map(([dn, s]) => fmtd(dn, s))
        .filter((w, i, a) => w !== correct && a.indexOf(w) === i);
      const sc = U.shuffleChoices([correct, ...r.sample(wrong, 3)].map(cfg), r);
      return {
        stem: `What is the ground-state electron configuration of the ${sym}${sup(ch)}⁺ ion?`,
        choices: sc.choices, answer: sc.answer,
        explain: `${sym} is ${cfg(el.configShort)}. Transition metals lose their 4s electrons before 3d, so ${sym}${ch > 1 ? sup(ch) : ''}⁺ is <b>${cfg(correct)}</b>.`,
        hint: 'When transition metals form ions, the 4s electrons are removed first.',
      };
    },
  });

  const TRENDS = {
    ie1: { label: 'the highest first ionization energy', get: (e) => e.ie && e.ie[0], unit: 'kJ/mol', why: 'Ionization energy increases across a period (more nuclear charge, same shell) and decreases down a group (outer electrons further out and better shielded).' },
    en: { label: 'the highest electronegativity', get: (e) => e.en, unit: '(Pauling)', why: 'Electronegativity increases across a period and decreases down a group; fluorine is the most electronegative element.' },
    rad: { label: 'the largest atomic radius', get: (e) => e.radius && (e.radius.calculated || e.radius.empirical), unit: 'pm', why: 'Atoms get smaller across a period (stronger pull of the nucleus on the same shell) and larger down a group (extra shells).' },
    radS: { label: 'the smallest atomic radius', get: (e) => e.radius && -(e.radius.calculated || e.radius.empirical), unit: 'pm', why: 'Atoms get smaller across a period (stronger pull of the nucleus on the same shell) and larger down a group (extra shells).', show: (v) => -v },
    ieL: { label: 'the lowest first ionization energy', get: (e) => e.ie && -e.ie[0], unit: 'kJ/mol', why: 'The lowest ionization energies belong to large atoms with one electron outside a noble-gas core (group 1, lower down the table).', show: (v) => -v },
  };
  const MAIN = ['Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'K', 'Ca', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Rb', 'Sr', 'In', 'Sn', 'Sb', 'Te', 'I', 'Cs', 'Ba'];
  add({
    id: 'trend', topic: 'atomic', label: 'Periodic trends', needs: elementsReady,
    make(r) {
      const key = r.pick(Object.keys(TRENDS)), T = TRENDS[key];
      const pool = MAIN.map(E).filter((e) => e && T.get(e) != null);
      // four elements from one period or one group, so the trend decides it
      const byPeriod = r() < 0.5;
      const groups = {};
      pool.forEach((e) => { const k = byPeriod ? e.period : e.group; (groups[k] = groups[k] || []).push(e); });
      const keys = Object.keys(groups).filter((k) => groups[k].length >= 4);
      const set = r.sample(groups[r.pick(keys)], 4);
      const vals = set.map(T.get), best = Math.max(...vals);
      const second = Math.max(...vals.filter((v) => v !== best));
      if (Math.abs(best - second) < 0.03 * Math.abs(best)) return this.make(r);
      const win = set[vals.indexOf(best)];
      const sc = U.shuffleChoices([win, ...set.filter((e) => e !== win)].map((e) => `${e.name} (${e.sym})`), r);
      const show = T.show || ((v) => v);
      return {
        stem: `Which of these elements has ${T.label}?`,
        choices: sc.choices, answer: sc.answer,
        explain: `${T.why} Values: ${set.map((e) => `${e.sym} ${fmt(show(T.get(e)), 3)}`).join(', ')} ${T.unit}. Answer: <b>${win.name}</b>.`,
        hint: byPeriod ? 'All four are in the same period: think about what happens to nuclear charge across a row.' : 'All four are in the same group: think about what extra shells do.',
      };
    },
  });

  add({
    id: 'particles', topic: 'atomic', label: 'Protons, neutrons, electrons', needs: elementsReady,
    make(r) {
      const z = r.int(3, 56);
      const el = WikiData.byZ(z);
      const A = Math.round(el.mass) + r.pick([0, 0, 1, 2, -1]);
      const ch = r.pick([0, ...(el.ox && el.ox.main ? el.ox.main : [])].filter((c) => Math.abs(c) <= 4));
      const p = z, n = A - z, e = z - ch;
      const lab = (pp, nn, ee) => `${pp} p, ${nn} n, ${ee} e⁻`;
      const wrong = [lab(p, A, e), lab(p, n, z + ch), lab(n, p, e), lab(p, n - 1, e), lab(p, n, z), lab(p, n + 1, e), lab(p, n, e + 1), lab(p, A, z)]
        .filter((w, i, a) => w !== lab(p, n, e) && a.indexOf(w) === i);
      const sc = U.shuffleChoices([lab(p, n, e), ...r.sample(wrong, 3)], r);
      const chs = ch === 0 ? '' : (Math.abs(ch) > 1 ? sup(Math.abs(ch)) : '') + (ch > 0 ? '⁺' : '⁻');
      return {
        stem: `How many protons (p), neutrons (n) and electrons (e⁻) are in <b>${sup(A)}${el.sym}${chs}</b>?`,
        choices: sc.choices, answer: sc.answer,
        explain: `Z = ${z} for ${el.name}, so ${p} protons. Neutrons = A − Z = ${A} − ${z} = ${n}. Electrons = Z − charge = ${z} − (${ch}) = ${e}. <b>${lab(p, n, e)}</b>.`,
        hint: 'Z (from the periodic table) = protons; mass number − Z = neutrons; a positive charge means electrons were lost.',
      };
    },
  });

  add({
    id: 'unpaired', topic: 'atomic', label: 'Unpaired electrons in ions', needs: elementsReady,
    make(r) {
      const sym = r.pick(['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn']);
      const el = E(sym), ch = r.pick([2, 3].filter((c) => el.group - c >= 0 && !(sym === 'Sc' && c === 2)));
      const d = el.group - ch, unp = d <= 5 ? d : 10 - d;
      const vals = [unp, ...r.sample([0, 1, 2, 3, 4, 5, 6].filter((x) => x !== unp), 3)].sort((a, b) => a - b);
      return {
        stem: `How many unpaired electrons does a gas-phase ${sym}${sup(ch)}⁺ ion have in its ground state?`,
        choices: vals.map(String), answer: vals.indexOf(unp),
        explain: `${sym}${sup(ch)}⁺ is [Ar] 3d${sup(d)} (4s electrons leave first). Hund’s rule: ${d <= 5 ? `the ${d} d electrons occupy separate orbitals` : `five d orbitals hold ${d} electrons: ${d - 5} are paired`}, so <b>${unp}</b> unpaired.`,
        hint: 'Find the d-electron count (group number − charge), then fill five d orbitals singly before pairing.',
      };
    },
  });

  add({
    id: 'photon', topic: 'atomic', label: 'Photons and the hydrogen spectrum',
    make(r) {
      if (r() < 0.5) {
        const lam = r.pick([250, 300, 410, 486, 532, 589, 656, 700, 1064]);
        const Ej = H_PLANCK * C_LIGHT / (lam * 1e-9), Ekj = Ej * NA / 1000;
        return numQ(r, {
          stem: `What is the energy of one mole of photons with a wavelength of ${lam} nm?`,
          correct: Ekj, wrongs: [Ekj * 1000, Ekj / 1000, Ekj * 2, Ej * 1e21], unit: 'kJ/mol',
          explain: `E(photon) = hc/λ = (6.626 × 10⁻³⁴)(2.998 × 10⁸)/(${lam} × 10⁻⁹ m) = ${fmt(Ej, 3)} J. Per mole: × 6.022 × 10²³ = <b>${g2(Ekj)} kJ/mol</b>.`,
          hint: 'E = hc/λ with λ in metres, then multiply by Avogadro’s number.',
        });
      }
      const n1 = r.pick([1, 2, 2, 3]), n2 = n1 + r.int(1, 3);
      const RH = 1.097e7;
      const lam = 1 / (RH * (1 / n1 ** 2 - 1 / n2 ** 2)) * 1e9;
      return numQ(r, {
        stem: `What is the wavelength of light emitted when the electron in a hydrogen atom falls from n = ${n2} to n = ${n1}? (R<sub>H</sub> = 1.097 × 10⁷ m⁻¹)`,
        correct: lam, wrongs: [1 / (RH * (1 / n1 - 1 / n2)) * 1e9, 1 / (RH * (1 / n1 ** 2 + 1 / n2 ** 2)) * 1e9, RH * (1 / n1 ** 2 - 1 / n2 ** 2) * 1e-5, 1 / (RH / n2 ** 2) * 1e9], unit: 'nm',
        explain: `1/λ = R<sub>H</sub>(1/${n1}² − 1/${n2}²) = ${fmt(RH * (1 / n1 ** 2 - 1 / n2 ** 2), 4)} m⁻¹, so λ = <b>${g2(lam)} nm</b>${n1 === 2 ? ' (a visible Balmer line)' : n1 === 1 ? ' (ultraviolet, Lyman series)' : ' (infrared, Paschen series)'}.`,
        hint: 'Rydberg: 1/λ = R(1/n₁² − 1/n₂²), with the squares.',
      });
    },
  });

  add({
    id: 'discovery', topic: 'atomic', label: 'Element history (from the wiki)', needs: elementsReady,
    make(r) {
      const pool = WikiData.elements.filter((e) => e.discovery && e.discovery.by && !e.discovery.ancient && e.discovery.year && e.z <= 98 && e.discovery.by.length < 50 && !/,|Lab|Calif|Univ|Argonne/i.test(e.discovery.by));
      const el = r.pick(pool);
      const others = r.shuffle(pool.filter((e) => e.discovery.by !== el.discovery.by && Math.abs(e.discovery.year - el.discovery.year) > 3));
      const names = [];
      for (const o of others) { if (!names.includes(o.discovery.by)) names.push(o.discovery.by); if (names.length === 3) break; }
      const sc = U.shuffleChoices([el.discovery.by, ...names], r);
      return {
        stem: `${el.name} (${el.sym}) was discovered (or first isolated) in ${el.discovery.year}${el.discovery.where ? ' in ' + el.discovery.where : ''}. By whom?`,
        choices: sc.choices, answer: sc.answer,
        explain: `<b>${el.discovery.by}</b>. ${WikiData.article(el.sym) && WikiData.article(el.sym).history ? WikiData.article(el.sym).history.replace(/\*\*/g, '').replace(/\*/g, '').slice(0, 280) + '…' : ''} <a href="#wiki/${el.sym}">Open the ${el.name} page</a>.`,
        hint: `Look at the History section of the ${el.name} page in the Element Wiki.`,
      };
    },
  });

  add({
    id: 'category', topic: 'atomic', label: 'Element families', needs: elementsReady,
    make(r) {
      const cats = ['alkali metal', 'alkaline earth metal', 'transition metal', 'metalloid', 'halogen', 'noble gas', 'lanthanide', 'actinide'];
      const cat = r.pick(cats);
      const inCat = WikiData.elements.filter((e) => e.category === cat && e.z <= 103);
      const outCat = WikiData.elements.filter((e) => e.category !== cat && e.category !== 'unknown' && e.z <= 92);
      const win = r.pick(inCat);
      const sc = U.shuffleChoices([win, ...r.sample(outCat, 3)].map((e) => `${e.name} (${e.sym})`), r);
      return {
        stem: `Which of these elements is ${/^[aeiou]/.test(cat) ? 'an' : 'a'} ${cat}?`,
        choices: sc.choices, answer: sc.answer,
        explain: `<b>${win.name}</b> is ${/^[aeiou]/.test(cat) ? 'an' : 'a'} ${cat} (group ${win.group || 'f-block'}, period ${win.period}).`,
        hint: 'Picture where each element sits on the periodic table.',
      };
    },
  });

  /* ======================================================================
     BONDING & MOLECULAR STRUCTURE
     ====================================================================== */
  // formula, electron domains, shape, hybridisation of the centre, polar (null = ion)
  const VSEPR = [
    ['CH₄', 4, 'tetrahedral', 'sp³', false], ['NH₃', 4, 'trigonal pyramidal', 'sp³', true], ['H₂O', 4, 'bent', 'sp³', true], ['BF₃', 3, 'trigonal planar', 'sp²', false],
    ['CO₂', 2, 'linear', 'sp', false], ['SF₆', 6, 'octahedral', 'sp³d²', false], ['PCl₅', 5, 'trigonal bipyramidal', 'sp³d', false], ['SF₄', 5, 'see-saw', 'sp³d', true],
    ['ClF₃', 5, 'T-shaped', 'sp³d', true], ['XeF₂', 5, 'linear', 'sp³d', false], ['XeF₄', 6, 'square planar', 'sp³d²', false], ['BrF₅', 6, 'square pyramidal', 'sp³d²', true],
    ['SO₂', 3, 'bent', 'sp²', true], ['SO₃', 3, 'trigonal planar', 'sp²', false], ['NO₃⁻', 3, 'trigonal planar', 'sp²', null], ['ClO₃⁻', 4, 'trigonal pyramidal', 'sp³', null],
    ['I₃⁻', 5, 'linear', 'sp³d', null], ['PCl₃', 4, 'trigonal pyramidal', 'sp³', true], ['H₂S', 4, 'bent', 'sp³', true], ['ICl₄⁻', 6, 'square planar', 'sp³d²', null],
    ['NH₄⁺', 4, 'tetrahedral', 'sp³', null], ['CO₃²⁻', 3, 'trigonal planar', 'sp²', null], ['XeO₃', 4, 'trigonal pyramidal', 'sp³', true], ['ClO₂⁻', 4, 'bent', 'sp³', null],
    ['O₃', 3, 'bent', 'sp²', true], ['HCN', 2, 'linear', 'sp', true], ['BeCl₂ (gas)', 2, 'linear', 'sp', false], ['CCl₄', 4, 'tetrahedral', 'sp³', false],
    ['CH₂Cl₂', 4, 'tetrahedral', 'sp³', true], ['CHCl₃', 4, 'tetrahedral', 'sp³', true], ['IF₅', 6, 'square pyramidal', 'sp³d²', true], ['SiF₆²⁻', 6, 'octahedral', 'sp³d²', null],
    ['SOCl₂', 4, 'trigonal pyramidal', 'sp³', true], ['XeOF₄', 6, 'square pyramidal', 'sp³d²', true], ['NO₂⁺', 2, 'linear', 'sp', null], ['SnCl₂ (gas)', 3, 'bent', 'sp²', true],
  ];
  const SHAPES = ['linear', 'bent', 'trigonal planar', 'trigonal pyramidal', 'T-shaped', 'tetrahedral', 'see-saw', 'square planar', 'trigonal bipyramidal', 'square pyramidal', 'octahedral'];
  add({
    id: 'vsepr', topic: 'bonding', label: 'VSEPR shapes, hybridisation and polarity',
    make(r) {
      const v = r.int(0, 3);
      if (v <= 1) {
        const [f, dom, shape, hyb] = r.pick(VSEPR);
        if (v === 0) {
          const wrong = r.sample(SHAPES.filter((s) => s !== shape), 3);
          const sc = U.shuffleChoices([shape, ...wrong], r);
          return {
            stem: `What is the molecular geometry of ${f}?`, choices: sc.choices, answer: sc.answer,
            explain: `${f} has ${dom} electron domains around the central atom (bonds + lone pairs; a multiple bond counts once). The atoms (ignoring lone pairs) are arranged <b>${shape}</b>.`,
            hint: 'Draw the Lewis structure, count electron domains on the central atom, then name the shape from the atom positions only.',
          };
        }
        const hs = ['sp', 'sp²', 'sp³', 'sp³d', 'sp³d²'];
        const sc = U.shuffleChoices([hyb, ...r.sample(hs.filter((h) => h !== hyb), 3)], r);
        return {
          stem: `What is the hybridisation of the central atom in ${f}?`, choices: sc.choices, answer: sc.answer,
          explain: `${dom} electron domains → <b>${hyb}</b> (2 → sp, 3 → sp², 4 → sp³, 5 → sp³d, 6 → sp³d²).`,
          hint: 'Count electron domains (bonded atoms + lone pairs) on the central atom.',
        };
      }
      const neutral = VSEPR.filter((x) => x[4] !== null);
      const wantPolar = v === 2;
      const win = r.pick(neutral.filter((x) => x[4] === wantPolar));
      const others = r.sample(neutral.filter((x) => x[4] !== wantPolar), 3);
      const sc = U.shuffleChoices([win, ...others].map((x) => x[0]), r);
      return {
        stem: `Which of these molecules is ${wantPolar ? 'polar' : 'non-polar'}?`, choices: sc.choices, answer: sc.answer,
        explain: `<b>${win[0]}</b> is ${win[2]}: ${wantPolar ? 'its bond dipoles do not cancel' : 'its bond dipoles cancel by symmetry'}. The others: ${others.map((x) => `${x[0]} (${x[2]})`).join(', ')} are ${wantPolar ? 'non-polar' : 'polar'}.`,
        hint: 'A molecule is non-polar when its shape is symmetric enough for the bond dipoles to cancel.',
      };
    },
  });

  // second-period diatomics by molecular orbital theory
  const DIATOMIC = { 'H₂⁺': [1, 'H'], 'H₂': [2, 'H'], 'He₂⁺': [3, 'H'], 'Li₂': [2], 'B₂': [6], 'C₂': [8], 'N₂': [10], 'N₂⁺': [9], 'O₂': [12], 'O₂⁺': [11], 'O₂⁻': [13], 'O₂²⁻': [14], 'F₂': [14], 'NO': [11], 'NO⁺': [10], 'CN⁻': [10], 'CO': [10], 'C₂²⁻': [10] };
  function mo(ne, first) {
    // returns { bo, unpaired }
    if (first) { const b = Math.min(ne, 2), a = Math.max(0, ne - 2); return { bo: (b - a) / 2, unpaired: ne % 2 }; }
    // valence MOs; σ2p below π2p only after N₂ (more than 10 valence electrons)
    const order = ne <= 10 ? [['s', 2, 1], ['s*', 2, -1], ['p', 4, 1], ['sp', 2, 1], ['p*', 4, -1], ['sp*', 2, -1]]
      : [['s', 2, 1], ['s*', 2, -1], ['sp', 2, 1], ['p', 4, 1], ['p*', 4, -1], ['sp*', 2, -1]];
    let left = ne, bond = 0, unp = 0;
    for (const [, cap, sgn2] of order) {
      const k = Math.min(cap, left);
      left -= k; bond += sgn2 * k;
      if (cap === 4 && k > 0 && k < 4) unp += k <= 2 ? k : 4 - k;
      if (cap === 2 && k === 1) unp += 1;
    }
    return { bo: bond / 2, unpaired: unp };
  }
  add({
    id: 'mo', topic: 'bonding', label: 'Molecular orbital theory',
    make(r) {
      const sp = Object.keys(DIATOMIC);
      const data = (s) => mo(DIATOMIC[s][0], DIATOMIC[s][1]);
      const v = r.int(0, 2);
      if (v === 0) {
        const s = r.pick(sp), d = data(s);
        const vals = [d.bo, ...r.sample([0, 0.5, 1, 1.5, 2, 2.5, 3].filter((x) => x !== d.bo), 3)].sort((a, b) => a - b);
        return {
          stem: `According to molecular orbital theory, what is the bond order of ${s}?`, choices: vals.map(String), answer: vals.indexOf(d.bo),
          explain: `${s} has ${DIATOMIC[s][0]} ${DIATOMIC[s][1] ? '' : 'valence '}electrons. Bond order = ½(bonding − antibonding) = <b>${d.bo}</b>${d.unpaired ? `, with ${d.unpaired} unpaired electron${d.unpaired > 1 ? 's' : ''} (paramagnetic)` : ' (all electrons paired)'}.`,
          hint: 'Fill σ2s, σ*2s, π2p/σ2p, π*2p, σ*2p (π below σ for N₂ and lighter), then take ½(bonding − antibonding).',
        };
      }
      if (v === 1) {
        let set;
        for (let t = 0; t < 30; t++) {
          set = r.sample(sp, 4);
          const bos = set.map((s) => data(s).bo), mx = Math.max(...bos);
          if (bos.filter((b) => b === mx).length === 1) break;
          set = null;
        }
        if (!set) return this.make(r);
        const bos = set.map((s) => data(s).bo), win = set[bos.indexOf(Math.max(...bos))];
        const sc = U.shuffleChoices([win, ...set.filter((s) => s !== win)], r);
        return {
          stem: 'Which species has the highest bond order?', choices: sc.choices, answer: sc.answer,
          explain: `Bond orders: ${set.map((s) => `${s} ${data(s).bo}`).join(', ')}. Highest: <b>${win}</b>.`,
          hint: 'Count electrons (including the charge), fill the MO diagram, and compare ½(bonding − antibonding).',
        };
      }
      const para = sp.filter((s) => data(s).unpaired > 0), dia = sp.filter((s) => data(s).unpaired === 0);
      const win = r.pick(para);
      const sc = U.shuffleChoices([win, ...r.sample(dia, 3)], r);
      return {
        stem: 'Which species is paramagnetic?', choices: sc.choices, answer: sc.answer,
        explain: `<b>${win}</b> has ${data(win).unpaired} unpaired electron${data(win).unpaired > 1 ? 's' : ''} in its MO diagram; the others have all electrons paired. (O₂ is the famous case: Lewis structures miss its two unpaired π* electrons.)`,
        hint: 'Paramagnetic = at least one unpaired electron. Watch the degenerate π and π* pairs (Hund’s rule).',
      };
    },
  });

  const IONR = { 'Li⁺': [1, 76], 'Na⁺': [1, 102], 'K⁺': [1, 138], 'Rb⁺': [1, 152], 'Cs⁺': [1, 167], 'Mg²⁺': [2, 72], 'Ca²⁺': [2, 100], 'Sr²⁺': [2, 118], 'Ba²⁺': [2, 135], 'F⁻': [1, 133], 'Cl⁻': [1, 181], 'Br⁻': [1, 196], 'I⁻': [1, 220], 'O²⁻': [2, 140], 'S²⁻': [2, 184] };
  const SALTS = [['LiF', 'Li⁺', 'F⁻'], ['NaCl', 'Na⁺', 'Cl⁻'], ['KBr', 'K⁺', 'Br⁻'], ['CsI', 'Cs⁺', 'I⁻'], ['NaF', 'Na⁺', 'F⁻'], ['KCl', 'K⁺', 'Cl⁻'], ['RbI', 'Rb⁺', 'I⁻'], ['MgO', 'Mg²⁺', 'O²⁻'], ['CaO', 'Ca²⁺', 'O²⁻'], ['BaO', 'Ba²⁺', 'O²⁻'], ['SrS', 'Sr²⁺', 'S²⁻'], ['MgF₂', 'Mg²⁺', 'F⁻'], ['CaCl₂', 'Ca²⁺', 'Cl⁻'], ['NaBr', 'Na⁺', 'Br⁻'], ['LiCl', 'Li⁺', 'Cl⁻'], ['BaS', 'Ba²⁺', 'S²⁻']];
  add({
    id: 'lattice', topic: 'bonding', label: 'Lattice energy',
    make(r) {
      const score = ([, c, a]) => IONR[c][0] * IONR[a][0] / (IONR[c][1] + IONR[a][1]);
      for (let t = 0; t < 40; t++) {
        const set = r.sample(SALTS, 4), sc0 = set.map(score);
        const mx = Math.max(...sc0), sec = Math.max(...sc0.filter((x) => x !== mx));
        if ((mx - sec) / mx < 0.08) continue;
        const win = set[sc0.indexOf(mx)];
        const sc = U.shuffleChoices([win, ...set.filter((s) => s !== win)].map((s) => s[0]), r);
        return {
          stem: 'Which ionic compound has the largest lattice energy (most exothermic lattice formation)?', choices: sc.choices, answer: sc.answer,
          explain: `Lattice energy ∝ (charge × charge)/(r⁺ + r⁻). Ion charges matter most, then size. <b>${win[0]}</b>: ${win[1]} (${IONR[win[1]][1]} pm) + ${win[2]} (${IONR[win[2]][1]} pm). Compare ${set.map((s) => `${s[0]} ${(score(s) * 1000).toFixed(1)}`).join(', ')} (in units of z⁺z⁻/r × 1000).`,
          hint: 'Coulomb’s law: higher charges and smaller ions give a stronger lattice.',
        };
      }
      return null;
    },
  });

  /* ======================================================================
     DESCRIPTIVE & LABORATORY CHEMISTRY
     ====================================================================== */
  // insoluble products for (cation salt, anion salt) pairs at 0.05 M each after mixing
  const CATS = { 'AgNO₃': 'Ag', 'Pb(NO₃)₂': 'Pb', 'Ba(NO₃)₂': 'Ba', 'Cu(NO₃)₂': 'Cu', 'Mg(NO₃)₂': 'Mg', 'Zn(NO₃)₂': 'Zn', 'Ca(NO₃)₂': 'Ca', 'NH₄NO₃': 'NH4', 'KNO₃': 'K' };
  const ANS = { 'NaCl': 'Cl', 'KI': 'I', 'Na₂SO₄': 'SO4', 'Na₂CO₃': 'CO3', 'NaOH': 'OH', 'NaNO₃': 'NO3' };
  const PPT = {
    'Ag|Cl': 'white AgCl', 'Ag|I': 'yellow AgI', 'Ag|CO3': 'pale yellow Ag₂CO₃', 'Ag|OH': 'brown Ag₂O',
    'Pb|Cl': 'white PbCl₂', 'Pb|I': 'bright yellow PbI₂', 'Pb|SO4': 'white PbSO₄', 'Pb|CO3': 'white PbCO₃', 'Pb|OH': 'white Pb(OH)₂',
    'Ba|SO4': 'white BaSO₄', 'Ba|CO3': 'white BaCO₃', 'Cu|CO3': 'blue-green copper(II) carbonate', 'Cu|OH': 'pale blue Cu(OH)₂',
    'Mg|CO3': 'white MgCO₃', 'Mg|OH': 'white Mg(OH)₂', 'Zn|CO3': 'white ZnCO₃', 'Zn|OH': 'white Zn(OH)₂', 'Ca|CO3': 'white CaCO₃',
  };
  // pairs to avoid: borderline solubility (CaSO₄, Ag₂SO₄, Ca(OH)₂) or redox (Cu²⁺/I⁻)
  const AVOID = new Set(['Ca|SO4', 'Ag|SO4', 'Ca|OH', 'Cu|I']);
  add({
    id: 'precip', topic: 'descr', label: 'Precipitation (solubility rules)',
    make(r) {
      const pairs = [];
      Object.keys(CATS).forEach((c) => Object.keys(ANS).forEach((a) => { const k = CATS[c] + '|' + ANS[a]; if (!AVOID.has(k)) pairs.push([c, a, PPT[k] || null]); }));
      const wantPpt = r() < 0.6;
      const win = r.pick(pairs.filter((p) => !!p[2] === wantPpt));
      const others = r.sample(pairs.filter((p) => !!p[2] !== wantPpt), 3);
      const lab = (p) => `${p[0]} + ${p[1]}`;
      const sc = U.shuffleChoices([win, ...others].map(lab), r);
      return {
        stem: `Equal volumes of 0.10 M solutions are mixed. Which pair ${wantPpt ? 'forms a precipitate' : 'does <u>not</u> form a precipitate'}?`,
        choices: sc.choices, answer: sc.answer,
        explain: wantPpt ? `<b>${lab(win)}</b> gives a ${win[2]} precipitate. The other pairs only give soluble products (nitrates, and salts of Na⁺, K⁺ and NH₄⁺, are always soluble).`
          : `<b>${lab(win)}</b>: every possible product is soluble. The others give precipitates: ${others.map((p) => p[2]).join('; ')}.`,
        hint: 'Solubility rules: nitrates and Group 1/NH₄⁺ salts are soluble; most carbonates and hydroxides are not; Ag⁺ and Pb²⁺ halides and Ba²⁺/Pb²⁺ sulfates are insoluble.',
      };
    },
  });

  add({
    id: 'flame', topic: 'descr', label: 'Flame tests (from the wiki)', needs: () => typeof WikiData !== 'undefined',
    make(r) {
      const syms = ['Li', 'Na', 'K', 'Ca', 'Ba', 'Cu', 'Sr', 'Cs'];
      let set;
      do { set = r.sample(syms, 4); } while (set.includes('Li') && set.includes('Sr'));
      const win = set[0];
      const name = (s) => ({ Li: 'lithium', Na: 'sodium', K: 'potassium', Ca: 'calcium', Ba: 'barium', Cu: 'copper(II)', Sr: 'strontium', Cs: 'caesium' }[s]);
      const sc = U.shuffleChoices(set.map((s) => `${name(s)} (${s}${s === 'Na' || s === 'K' || s === 'Li' || s === 'Cs' ? '⁺' : '²⁺'})`), r);
      return {
        stem: `In a flame test, a salt colours the flame <b>${WikiData.FLAME[win].name}</b>. Which cation is most likely present?`,
        choices: sc.choices, answer: sc.answer,
        explain: `<b>${name(win)}</b>: ${WikiData.FLAME[win].note} The colour comes from electrons falling back to lower energy levels after being excited by the flame; each element emits its own set of wavelengths.`,
        hint: 'Sodium yellow, potassium lilac, lithium/strontium red, calcium brick red, barium green, copper blue-green.',
      };
    },
  });

  /** number of significant figures in a written number (no ambiguous trailing zeros) */
  function sigFigs(s) {
    let m = s.replace(/^[-+]/, '').split(/\s*×/)[0];
    if (m.includes('.')) { m = m.replace('.', '').replace(/^0+/, ''); return m.length; }
    m = m.replace(/^0+/, '');
    return m.replace(/0+$/, '').length;
  }
  add({
    id: 'sigfigs', topic: 'descr', label: 'Significant figures',
    make(r) {
      const forms = [
        () => '0.00' + r.int(1, 9) + r.pick(['0', '05', '50', '3', '30', '700']),
        () => r.int(1, 9) + '0' + r.int(0, 9) + '.' + r.pick(['0', '00', '5', '50']),
        () => r.int(1, 9) + '.' + r.pick(['0', '00', '030', '400', '05']) + ' × 10' + sup(r.int(-6, 8)),
        () => '0.' + r.pick(['0', '00']) + r.int(10, 99) + '0',
        () => String(r.int(101, 9909)).replace(/0+$/, '') + '.0',
        () => r.int(1, 9) + '00' + r.int(1, 9),
      ];
      const s = r.pick(forms)();
      const n = sigFigs(s);
      const vals = [n, ...r.sample([n - 2, n - 1, n + 1, n + 2, n + 3].filter((x) => x >= 1 && x !== n), 3)].sort((a, b) => a - b);
      return {
        stem: `How many significant figures are in the measurement <b>${s}</b> g?`,
        choices: vals.map(String), answer: vals.indexOf(n),
        explain: `<b>${n}</b>. Leading zeros are never significant; zeros between digits are; trailing zeros are significant only when there is a decimal point. In scientific notation count the digits of the number before ×10.`,
        hint: 'Rules: non-zero digits count; zeros between them count; leading zeros don’t; trailing zeros count if there is a decimal point.',
      };
    },
  });

  return { add, make, list, ready, sigFigs, mo, gens };
})();
