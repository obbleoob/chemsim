/* ============================================================================
   ChemSim · beaker/sim.js
   ----------------------------------------------------------------------------
   The Beaker Lab simulation. Every tick (0.1 s of lab time) it:
     1. adds heat from the burner, or removes it with the ice bath / room air
     2. dissolves (or crystallises) solid salts toward their solubility at T
     3. runs the slow reactions: metals + acid/water, metal displacement,
        marble chips + acid, quicklime + water, H₂O₂ decomposition on a catalyst
     4. lets gases escape: CO₂, Cl₂, NH₃ (and H₂/O₂ made by reactions)
     5. solves the equilibrium (pH, complexes, precipitates)
     6. converts the total reaction enthalpy into a temperature change
   Heat is never hard-coded: it comes from standard enthalpies of formation
   (Hess's law), so neutralisation, dissolving NH₄NO₃ or NaOH, etc. all give
   the right ΔT automatically.
   ============================================================================ */
'use strict';

const BeakerSim = (() => {
  const D = BeakerData;
  const AIR_HEADSPACE = 0.01;      // mol of air above the liquid (≈ 0.25 L)
  const ROOM = 20;                 // room temperature, °C
  const N_REF = 0.004;             // mol: reference lump size for the area factor

  let s = null;                    // the whole state
  const reagentCache = {};         // speciation enthalpy of each bottle (kJ per L)

  /* ---------------- helpers ---------------- */
  const area = (n) => Math.pow(Math.max(n, 0) / N_REF, 2 / 3);
  const tempFactor = (T) => Math.pow(2, (T - 20) / 10);
  const dHfComp = (c) => D.COMPONENTS[c].dHf;
  /** Enthalpy of a set of components + H⁺ + water (the "component basis"). */
  function basisH(a, water = 0) {
    let h = water * D.DHF_WATER;
    for (const [c, k] of Object.entries(a || {})) h += k * dHfComp(c);
    return h;
  }
  /** Relative formation enthalpy of a species from its components (kJ/mol). */
  function relH(name) {
    const sp = D.SPECIES[name];
    if (!sp || sp.dHf == null) return 0;
    return sp.dHf - basisH(sp.a, sp.w || 0);
  }
  function relHSolid(name) {
    const so = D.SOLIDS[name];
    if (!so || so.dHf == null) return 0;
    return so.dHf - basisH(so.a, so.w || 0);
  }
  /** Σ n·ΔH(relative) over dissolved species and precipitates (kJ). */
  function speciationH(eq, V) {
    if (!eq) return 0;
    let h = 0;
    for (const [name, c] of Object.entries(eq.species)) h += c * V * relH(name);
    for (const [name, c] of Object.entries(eq.solids)) h += c * V * relHSolid(name);
    return h;
  }
  const conc = (name) => (s.eq && s.eq.species[name]) || 0;
  const heatCapacity = () => s.V * 1000 * 4.18 + 60;   // J/K: water + glass

  function log(text, opts = {}) {
    const entry = { t: s.t, text, ...opts };
    s.log.push(entry);
    if (s.log.length > 200) s.log.shift();
    if (s.onEvent) s.onEvent(entry);
    if (typeof window !== 'undefined' && window.log) window.log('beaker', text);
  }
  function warnOnce(key, text) {
    if (s.warned.has(key)) return;
    s.warned.add(key);
    log(text, { level: 'warn', icon: '⚠️' });
  }

  /* ---------------- reset & additions ---------------- */
  function reset({ waterML = 100, T = ROOM } = {}) {
    s = {
      t: 0, T, V: waterML / 1000,
      totals: {},                // component → mol
      h2o2: 0, detergent: 0, indicators: {},
      soluble: {},               // key → { crystals (mol undissolved), dissolved (mol) }
      lumps: [],                 // { key, kind, n (mol), oxide, coat: {metal: mol} }
      gas: { H2: 0, O2: 0, CO2: 0, Cl2: 0, NH3: 0 },
      gasRate: { H2: 0, O2: 0, CO2: 0, Cl2: 0, NH3: 0 },
      bubbles: 0,                // total bubbling (mol/s) for the renderer
      eq: null, Sprev: 0,
      burnerW: 0, ice: false, stir: false,
      settled: {},               // precipitate → fraction settled at the bottom
      prevSolids: {}, log: [], warned: new Set(), onEvent: s && s.onEvent,
      lastLoggedT: T, boiling: false, evaporated: 0,
    };
    equilibrate();
    return s;
  }

  function addTotals(c, amountL) {
    for (const [k, v] of Object.entries(c)) s.totals[k] = (s.totals[k] || 0) + v * amountL;
  }

  /** Speciation enthalpy of a reagent bottle, per litre (kJ/L). */
  function reagentH(item) {
    if (reagentCache[item.id] !== undefined) return reagentCache[item.id];
    if (!Object.keys(item.c || {}).length) return (reagentCache[item.id] = 0);
    const eq = BeakerSolver.solve(item.c, ROOM);
    return (reagentCache[item.id] = speciationH(eq, 1));
  }

  /** Add something from the shelf. amount: mL, g, or drops depending on kind. */
  function add(id, amount) {
    const item = D.SHELF.find((x) => x.id === id);
    if (!item) throw new Error('Unknown reagent ' + id);
    const name = item.name;
    if (item.kind === 'solution' || item.kind === 'special') {
      const L = amount / 1000;
      if (s.V + L > 0.25) { log('The beaker is full (250 mL). Empty it first.', { level: 'warn', icon: '🫗' }); return false; }
      // mixing: the new liquid is at room temperature
      const cOld = heatCapacity(), cNew = L * 1000 * 4.18;
      s.T = (cOld * s.T + cNew * ROOM) / (cOld + cNew);
      s.V += L;
      if (item.kind === 'solution') {
        addTotals(item.c, L);
        s.Sprev += reagentH(item) * L;
      }
      if (item.h2o2) s.h2o2 += item.h2o2 * L;
      if (item.detergent) s.detergent += amount;
      log(`Added ${fmtAmount(amount, 'mL')} of ${name}.`, { icon: '🧪' });
      if (item.id === 'H2O2_30') warnOnce('h2o2-30', '30 % hydrogen peroxide is corrosive and a strong oxidiser. In a real lab, only a teacher would use it, with gloves and goggles.');
    } else if (item.kind === 'soluble') {
      const sol = D.SOLUBLE[item.key];
      const mol = amount / sol.M;
      const r = (s.soluble[item.key] = s.soluble[item.key] || { crystals: 0, dissolved: 0 });
      r.crystals += mol;
      log(`Added ${fmtAmount(amount, 'g')} of ${name} (${sol.label}, ${mol.toFixed(4)} mol).`, { icon: '🥄' });
    } else if (item.kind === 'metal' || item.kind === 'lump') {
      const def = item.kind === 'metal' ? D.METALS[item.key] : D.OTHER_LUMPS[item.key];
      const mol = amount / def.M;
      let lump = s.lumps.find((l) => l.key === item.key && l.kind === item.kind);
      if (!lump) { lump = { key: item.key, kind: item.kind, n: 0, oxide: def.oxide || 0, coat: {}, x: 0.25 + Math.random() * 0.5, added: s.t }; s.lumps.push(lump); }
      lump.n += mol;
      log(`Added ${fmtAmount(amount, 'g')} of ${name} (${mol.toFixed(4)} mol).`, { icon: item.kind === 'metal' ? '🔩' : '🪨' });
      if (def.water && amount > 0.3) warnOnce('bigmetal-' + item.key, `That is a big piece of ${def.label.toLowerCase()}! Large pieces of reactive metals can explode in water. Real demonstrations use pieces the size of a grain of rice.`);
      if (item.key === 'K') warnOnce('K', 'Potassium reacts so violently that the hydrogen ignites (lilac flame). Use a safety screen.');
    } else if (item.kind === 'indicator') {
      s.indicators[item.key] = (s.indicators[item.key] || 0) + amount;
      log(`Added ${amount} drops of ${name}.`, { icon: '💧' });
    }
    safetyChecks();
    equilibrate(true);
    return true;
  }

  const fmtAmount = (v, unit) => `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;

  function safetyChecks() {
    const t = s.totals;
    if ((t.ClO || 0) > 1e-4 && (t.NH3 || 0) > 1e-4) warnOnce('bleach-nh3', '☠ Bleach + ammonia produces toxic chloramine vapours. Never mix them at home!');
    if (s.detergent > 0 && s.h2o2 > 0.05) warnOnce('toothpaste', 'Peroxide + detergent: if a catalyst is added, the oxygen will make a column of foam (“elephant’s toothpaste”).');
  }

  /* ---------------- the simulation tick ---------------- */
  function tick(dt = 0.1) {
    s.t += dt;
    let dH = 0;                   // kJ released (−) or absorbed (+) by processes this tick
    const T = s.T, V = s.V;
    const H = conc('H+'), OH = conc('OH-');
    const rate = { H2: 0, O2: 0, CO2: 0, Cl2: 0, NH3: 0 };

    // 1. dissolving and crystallising soluble salts
    for (const [key, r] of Object.entries(s.soluble)) {
      const sol = D.SOLUBLE[key];
      const nSat = (D.solubility(key, T) * 10 * V) / (sol.solM || sol.M);   // mol that can dissolve
      // what is "dissolved" can be used up by reactions: cap it by the totals
      const y = sol.yield;
      for (const [c, k] of Object.entries(y.a)) r.dissolved = Math.min(r.dissolved, (s.totals[c] || 0) / k);
      let d = 0;
      if (r.crystals > 0 && r.dissolved < nSat) {
        const k = 0.0025 * (s.stir ? 3 : 1) * (1 + T / 40);
        d = Math.min(r.crystals, nSat - r.dissolved, k * Math.pow(r.crystals / 0.01, 2 / 3) * (1 - r.dissolved / nSat) * dt + 1e-9);
      } else if (r.dissolved > nSat * 1.005) {
        d = -(r.dissolved - nSat) * (1 - Math.exp(-dt / 6));     // crystals grow back on cooling
      }
      if (d) {
        r.crystals -= d; r.dissolved += d;
        addTotals(y.a, d);
        dH += d * (basisH(y.a, y.water || 0) - sol.dHf);
        if (d < 0 && !r.crystallising) { r.crystallising = true; log(`Crystals of ${sol.label} are forming: the solution is supersaturated at ${T.toFixed(0)} °C.`, { icon: '❄️' }); }
        if (d > 0) r.crystallising = false;
      }
      if (r.crystals < 1e-9 && r.crystals !== 0) { r.crystals = 0; log(`All the ${sol.label} has dissolved.`, { icon: '✔️' }); }
    }

    // 2. lumps: metals, marble chips, quicklime, catalysts
    let catK = 0;
    for (const lump of s.lumps) {
      if (lump.n <= 1e-10) continue;
      if (lump.kind === 'metal') {
        const m = D.METALS[lump.key];
        const A = area(lump.n);
        const protect = lump.oxide > 0 ? 0.02 : 1;
        if (lump.oxide > 0) lump.oxide -= dt * (H + OH) * 1.0;
        let r = 1e-4 * A * ((m.kAcid || 0) * H * protect + (m.kWater || 0) + (m.kBase || 0) * OH * protect) * tempFactor(T);
        let xi = Math.min(lump.n, r * dt);
        if (xi > 0) {
          lump.n -= xi;
          addTotals({ [m.ion]: 1 }, xi);
          s.gas.H2 += (xi * m.n) / 2; rate.H2 += (r * m.n) / 2;
          dH += xi * dHfComp(m.ion);
          if (!lump.reacting && r * m.n / 2 > 2e-7) { lump.reacting = true; log(`${m.label} reacts, giving off hydrogen: ${metalEq(m, H > OH * 10)}`, { icon: '🫧' }); }
        }
        // displacement of less reactive metal ions
        for (const [ionMetal, def] of Object.entries(D.METALS)) {
          if (def.E <= m.E + 0.15 || !def.ion) continue;
          const free = conc(def.ion);
          if (free < 1e-7) continue;
          const rd = 1e-4 * A * D.DISPLACE_K * free * tempFactor(T);
          const xiM = Math.min(lump.n, rd * dt, ((s.totals[def.ion] || 0) * def.n) / m.n);
          if (xiM <= 0) continue;
          const nDep = (xiM * m.n) / def.n;
          lump.n -= xiM;
          addTotals({ [m.ion]: 1 }, xiM);
          addTotals({ [def.ion]: -1 }, nDep);
          lump.coat[ionMetal] = (lump.coat[ionMetal] || 0) + nDep;
          dH += xiM * dHfComp(m.ion) - nDep * dHfComp(def.ion);
          const k = 'disp-' + lump.key + ionMetal;
          if (!s.warned.has(k)) { s.warned.add(k); log(`${m.label} displaces ${def.label.toLowerCase()} from solution: ${dispEq(m, def)}. ${def.label} is deposited on the ${m.label.toLowerCase()}.`, { icon: '🔁' }); }
        }
      } else {
        const L = D.OTHER_LUMPS[lump.key];
        if (L.catalyst) { catK += L.kCat * Math.min(3, area(lump.n * L.M / 86.94)); continue; }
        if (L.solid) {          // marble chips: dissolve while undersaturated
          const si = s.eq && s.eq.SI[L.solid] !== undefined ? s.eq.SI[L.solid] : -10;
          if (si >= 0) continue;
          const r = 1e-4 * area(lump.n) * (L.kAcid * H + L.kNeutral) * (1 - Math.pow(10, si)) * tempFactor(T);
          const xi = Math.min(lump.n, r * dt);
          lump.n -= xi;
          const so = D.SOLIDS[L.solid];
          addTotals(so.a, xi);
          dH += xi * (basisH(so.a, so.w || 0) - so.dHf);
          // in acid, most of the CO₂ forms right at the chip surface and bubbles straight off
          if (L.solid === 'CaCO3' && H > 1e-5) {
            const direct = Math.min(xi * 0.8, s.totals.CO3 * 0.999);
            s.totals.CO3 -= direct; s.gas.CO2 += direct; rate.CO2 += direct / dt;
            dH += direct * (D.GASES.CO2.dHf - basisH({ CO3: 1 }, -1));
          }
          if (!lump.reacting && r > 1e-6) { lump.reacting = true; log('Marble chips fizz in the acid: CaCO₃ + 2H⁺ → Ca²⁺ + CO₂↑ + H₂O', { icon: '🫧' }); }
        } else if (L.yield) {   // quicklime
          const r = 1e-4 * area(lump.n) * L.kNeutral * tempFactor(T);
          const xi = Math.min(lump.n, r * dt);
          lump.n -= xi;
          addTotals(L.yield.a, xi);
          dH += xi * (basisH(L.yield.a, L.yield.water || 0) - L.dHf);
          if (!lump.reacting) { lump.reacting = true; log('Quicklime reacts with water, releasing heat: CaO + H₂O → Ca(OH)₂', { icon: '♨️' }); }
        }
      }
    }

    // 3. hydrogen peroxide decomposition (catalysed by MnO₂, catalase, I⁻ or Fe³⁺)
    if (s.h2o2 > 1e-9) {
      const k = catK + 0.4 * (s.eq ? (s.eq.species.I || 0) * 20 : 0) + 0.15 * conc('Fe3') * 50 + 0.0003 * tempFactor(T);
      const r = 0.02 * k * (s.h2o2 / V) * V * tempFactor(T) / tempFactor(20);
      const xi = Math.min(s.h2o2, r * dt);
      s.h2o2 -= xi;
      s.gas.O2 += xi / 2; rate.O2 += r / 2;
      dH += xi * (D.DHF_WATER - -191.2);
      if (!s.peroxideLogged && r > 2e-6) { s.peroxideLogged = true; log('Hydrogen peroxide decomposes on the catalyst: 2H₂O₂ → 2H₂O + O₂↑ (exothermic)', { icon: '🫧' }); }
    }

    // 4. gases escaping from the solution
    const satCO2 = 0.034 * Math.exp(-0.024 * (T - 25));
    const co2 = conc('CO2aq');
    if (co2 > 1e-6 && (s.totals.CO3 || 0) > 0) {
      const k = (co2 > satCO2 ? 0.6 : 0.01) * (s.stir ? 2 : 1);
      const xi = Math.min((s.totals.CO3 || 0) * 0.999, co2 * V * k * dt + (co2 > satCO2 ? (co2 - satCO2) * V * 0.3 * dt : 0));
      if (xi > 0) {
        s.totals.CO3 -= xi; s.gas.CO2 += xi; rate.CO2 += xi / dt;
        dH += xi * (D.GASES.CO2.dHf - basisH({ CO3: 1 }, -1));
        if (!s.co2Logged && xi / dt > 2e-6) { s.co2Logged = true; log('Bubbles of carbon dioxide: the acid turns carbonate into CO₂ gas (2H⁺ + CO₃²⁻ → CO₂↑ + H₂O).', { icon: '🫧' }); }
      }
    }
    const cl2 = conc('Cl2aq');
    if (cl2 > 1e-6) {
      const xi = Math.min(Math.min(s.totals.ClO || 0, s.totals.Cl || 0) * 0.999, cl2 * V * 0.5 * dt);
      if (xi > 0) {
        s.totals.ClO -= xi; s.totals.Cl -= xi; s.gas.Cl2 += xi; rate.Cl2 += xi / dt;
        dH += xi * (D.GASES.Cl2.dHf - basisH({ ClO: 1, Cl: 1 }, -1));
        warnOnce('cl2', '☠ Toxic CHLORINE gas is escaping! Acid + bleach releases chlorine: HClO + H⁺ + Cl⁻ → Cl₂ + H₂O. Never mix bleach with acidic cleaners.');
      }
    }
    const nh3 = conc('NH3');
    if (nh3 > 1e-4 && T > 35) {
      const xi = Math.min((s.totals.NH3 || 0) * 0.999, nh3 * V * 0.002 * Math.pow(2, (T - 40) / 10) * dt);
      if (xi > 0) {
        s.totals.NH3 -= xi; s.gas.NH3 += xi; rate.NH3 += xi / dt;
        dH += xi * (D.GASES.NH3.dHf - dHfComp('NH3'));
        if (xi / dt > 1e-6) warnOnce('nh3', 'A sharp smell of ammonia: warming an alkaline ammonium solution drives off NH₃ gas (test: damp red litmus turns blue).');
      }
    }

    // 5. headspace: gases slowly mix away into the room
    for (const g of Object.keys(s.gas)) s.gas[g] *= Math.exp(-dt / 15);
    s.gasRate = rate;
    s.bubbles = rate.H2 + rate.O2 + rate.CO2 + rate.Cl2;

    // 6. heat flow: burner, ice bath, room
    const Cp = heatCapacity();
    let q = 0;   // J into the beaker
    if (s.burnerW > 0) q += s.burnerW * 0.5 * dt;          // half the burner's power reaches the liquid
    if (s.ice) q += -8 * (s.T - 0) * dt;                    // ice bath pulls toward 0 °C
    q += -0.25 * (s.T - ROOM) * dt;                          // slow loss to the room

    // 7. equilibrium + enthalpy → temperature
    const Sbefore = s.Sprev;
    equilibrate();
    const dS = s.Sprev - Sbefore;
    const total_kJ = dH + dS;
    s.T += (q - total_kJ * 1000) / Cp;
    if (s.T > 100) {
      const excessJ = (s.T - 100) * Cp;
      const nEvap = excessJ / 40700;
      s.V = Math.max(0.005, s.V - (nEvap * 18.02) / 1000);
      s.evaporated += nEvap * 18.02;
      s.T = 100;
      if (!s.boiling) { s.boiling = true; log('The water is boiling (100 °C). Steam carries water away, so the solution gets more concentrated.', { icon: '♨️' }); }
    } else if (s.boiling && s.T < 99.5) s.boiling = false;
    if (s.T < 0) { s.T = 0; warnOnce('freeze', 'The liquid has cooled to 0 °C. (Freezing is not simulated; dissolved salts would lower the freezing point.)'); }
    if (s.T > 60 && !s.boiling) warnOnce('hot', `Careful: the beaker is hot (${s.T.toFixed(0)} °C). Use tongs and heat-proof gloves.`);
    if (Math.abs(s.T - s.lastLoggedT) > 5 && s.burnerW === 0 && !s.ice) {
      log(`Temperature ${s.T > s.lastLoggedT ? 'rose' : 'fell'} to ${s.T.toFixed(1)} °C (${s.T > s.lastLoggedT ? 'exothermic' : 'endothermic'}).`, { icon: '🌡️' });
      s.lastLoggedT = s.T;
    } else if (s.burnerW || s.ice) s.lastLoggedT = s.T;

    // 8. settling of precipitates (stirring keeps them suspended)
    for (const name of Object.keys(s.eq.solids)) {
      const f = s.settled[name] || 0;
      s.settled[name] = s.stir ? f * Math.exp(-dt / 1.5) : 1 - (1 - f) * Math.exp(-dt / 10);
    }
  }

  function metalEq(m, acid) {
    const ion = D.COMPONENTS[m.ion].label;
    const sym = Object.keys(D.METALS).find((k) => D.METALS[k] === m);
    if (!acid && m.water) return m.n === 1 ? `2${sym} + 2H₂O → 2${ion} + 2OH⁻ + H₂↑` : `${sym} + 2H₂O → ${ion} + 2OH⁻ + H₂↑`;
    if (m.n === 1) return `2${sym} + 2H⁺ → 2${ion} + H₂↑`;
    if (m.n === 2) return `${sym} + 2H⁺ → ${ion} + H₂↑`;
    return `2${sym} + 6H⁺ → 2${ion} + 3H₂↑`;
  }
  function dispEq(m, d) {
    const a = Object.keys(D.METALS).find((k) => D.METALS[k] === m);
    const b = Object.keys(D.METALS).find((k) => D.METALS[k] === d);
    const ia = D.COMPONENTS[m.ion].label, ib = D.COMPONENTS[d.ion].label;
    if (m.n === d.n) return `${a} + ${ib} → ${ia} + ${b}`;
    return `${d.n === 1 ? '' : d.n}${a} + ${m.n}${ib} → ${d.n === 1 ? '' : d.n}${ia} + ${m.n}${b}`.replace(/^1/, '');
  }

  /** Solve the equilibrium and log new precipitates. */
  function equilibrate(fromAdd = false) {
    const V = s.V;
    const c = {};
    for (const [k, v] of Object.entries(s.totals)) if (v > 1e-14) c[k] = v / V;
    let eq;
    try { eq = BeakerSolver.solve(c, s.T, s.eq); }
    catch (e) { (window.logError || console.error)('beaker', 'Solver crashed', e); return; }
    if (!eq.ok && typeof window !== 'undefined' && window.warn) window.warn('beaker', 'Solver did not fully converge', c);
    const newH = speciationH(eq, V);
    s.eq = eq;
    // new / vanished precipitates
    for (const [name, cc] of Object.entries(eq.solids)) {
      // only announce precipitates big enough to see (≥ 1 % of the limiting ion)
      const so0 = D.SOLIDS[name];
      const lim = Math.min(...Object.entries(so0.a).map(([k, a]) => (s.totals[k] || 0) / a));
      if (cc * V > Math.max(1e-6, 0.01 * lim) && !(s.prevSolids[name] > 1e-7)) {
        const so = D.SOLIDS[name];
        log(`A ${so.name} precipitate forms: ${so.eq}`, { icon: '☁️', solid: name });
        s.settled[name] = 0;
      }
    }
    for (const [name, n] of Object.entries(s.prevSolids)) {
      if (n > 1e-7 && !(eq.solids[name] * V > 1e-8)) log(`The ${name} precipitate dissolves again.`, { icon: '💧' });
    }
    s.prevSolids = Object.fromEntries(Object.entries(eq.solids).map(([k, v]) => [k, v * V]));
    if (!fromAdd) s.Sprev = newH;      // tick() turns the change into a temperature change
    else {
      // an addition: apply the heat of mixing straight away (e.g. acid + base)
      const dS = newH - s.Sprev;
      s.Sprev = newH;
      s.T -= (dS * 1000) / heatCapacity();
    }
  }

  /* ---------------- gas tests ---------------- */
  function fractions() {
    const tot = AIR_HEADSPACE + Object.values(s.gas).reduce((a, b) => a + b, 0);
    const f = {};
    for (const [g, n] of Object.entries(s.gas)) f[g] = n / tot;
    f.O2 = (s.gas.O2 + AIR_HEADSPACE * 0.21) / tot;   // air already contains 21 % O₂
    return f;
  }
  /* A test is held right where the gas comes out, so a vigorous stream of
     bubbles counts even before much gas has built up in the beaker. */
  const streaming = (g, molPerS) => s.gasRate[g] > molPerS;

  function litSplint() {
    const f = fractions();
    let r;
    if (f.H2 > 0.04 || streaming('H2', 2e-5)) { r = { result: 'pop', text: 'Squeaky POP! The gas is hydrogen: 2H₂ + O₂ → 2H₂O.' }; s.gas.H2 *= 0.1; }
    else if (f.CO2 > 0.06 || streaming('CO2', 3e-5)) r = { result: 'out', text: 'The flame goes out: the gas is carbon dioxide, which does not support burning.' };
    else if (f.O2 > 0.35 || streaming('O2', 2e-5)) r = { result: 'bright', text: 'The splint burns more brightly: there is extra oxygen.' };
    else if (f.Cl2 > 0.003) r = { result: 'cl2', text: 'A pale green, choking gas: chlorine! It is toxic, so test it with damp litmus instead.' };
    else r = { result: 'none', text: 'Nothing special happens: the splint just keeps burning in air.' };
    log('Lit splint: ' + r.text, { icon: '🔥' });
    return r;
  }
  function glowingSplint() {
    const f = fractions();
    const r = f.O2 > 0.3 || streaming('O2', 2e-5) ? { result: 'relight', text: 'The glowing splint bursts back into flame: the gas is oxygen!' }
      : { result: 'none', text: 'The splint just keeps glowing (no extra oxygen).' };
    log('Glowing splint: ' + r.text, { icon: '✨' });
    return r;
  }
  function limewaterTest() {
    const f = fractions();
    const r = f.CO2 > 0.03 || streaming('CO2', 1e-5) ? { result: 'milky', text: 'The limewater turns milky: the gas is carbon dioxide (Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O).' }
      : { result: 'clear', text: 'The limewater stays clear: no significant CO₂.' };
    log('Limewater: ' + r.text, { icon: '🥛' });
    return r;
  }
  function dampLitmus() {
    const f = fractions();
    let r;
    if (f.Cl2 > 0.002 || streaming('Cl2', 1e-6)) r = { result: 'bleached', text: 'Damp blue litmus turns red, then white: chlorine bleaches it.' };
    else if (f.NH3 > 0.002 || streaming('NH3', 1e-6)) r = { result: 'blue', text: 'Damp red litmus turns blue: the alkaline gas is ammonia.' };
    else r = { result: 'none', text: 'No change: no acidic or alkaline gas above the liquid.' };
    log('Damp litmus paper: ' + r.text, { icon: '📄' });
    return r;
  }
  /** Flame test of the solution: returns the dominant flame colour. */
  function flameTest(cobaltGlass = false) {
    const metals = ['Li', 'Na', 'K', 'Ca', 'Sr', 'Ba', 'Cu'];
    const present = metals.map((m) => [m, (s.totals[m] || 0) / s.V]).filter(([, c]) => c > 1e-4).sort((a, b) => b[1] - a[1]);
    let shown = present.map(([m]) => m);
    if (cobaltGlass) shown = shown.filter((m) => m !== 'Na');
    else if (shown.includes('Na')) shown = ['Na'];           // sodium's yellow masks everything
    const sym = shown[0] || null;
    const F = (typeof WikiData !== 'undefined' && WikiData.FLAME[sym]) || null;
    const names = { Li: 'lithium', Na: 'sodium', K: 'potassium', Ca: 'calcium', Sr: 'strontium', Ba: 'barium', Cu: 'copper(II)' };
    const text = sym && F ? `${F.name} flame: ${names[sym]} ions${present.length > 1 && !cobaltGlass && sym === 'Na' ? ' (sodium’s yellow hides other colours; try cobalt-blue glass)' : ''}.` : 'No characteristic flame colour.';
    log('Flame test: ' + text, { icon: '🔥' });
    return { sym, color: F ? F.color : null, text };
  }

  /* ---------------- views for the UI ---------------- */
  /** Colour of the liquid (Beer–Lambert-style mixing of coloured species). */
  function liquidColor() {
    const col = [0.86, 0.93, 1.0];     // water looks very faintly blue
    if (!s.eq) return col;
    const tint = (rgb, c, ref) => { for (let i = 0; i < 3; i++) col[i] *= Math.pow(rgb[i], Math.min(6, c / ref)); };
    for (const [k, def] of Object.entries(D.COMPONENTS)) if (def.color) tint(def.color, s.eq.species[k] || 0, def.ref);
    for (const [k, def] of Object.entries(D.SPECIES)) if (def.color) tint(def.color, s.eq.species[k] || 0, def.ref);
    for (const [k, drops] of Object.entries(s.indicators)) {
      const ind = D.INDICATORS[k];
      const ic = ind.color(s.eq.pH);
      const f = Math.min(1, (drops / Math.max(0.02, s.V * 10)) * 0.25) * ind.strength;
      for (let i = 0; i < 3; i++) col[i] *= 1 - f + f * ic[i];
    }
    return col;
  }
  function precipitates() {
    return Object.entries(s.eq ? s.eq.solids : {}).filter(([, c]) => c * s.V > 1e-7).map(([name, c]) => ({
      name, mol: c * s.V, conc: c, color: D.SOLIDS[name].color, settled: s.settled[name] || 0,
    }));
  }
  function crystals() {
    return Object.entries(s.soluble).filter(([, r]) => r.crystals > 1e-7).map(([key, r]) => {
      const sol = D.SOLUBLE[key];
      return { key, mol: r.crystals, g: r.crystals * sol.M, color: r.crystallising && sol.crystalColor ? sol.crystalColor : sol.color, habit: sol.habit, label: sol.label };
    });
  }
  function topSpecies(n = 14) {
    if (!s.eq) return [];
    const out = [];
    for (const [name, c] of Object.entries(s.eq.species)) {
      if (c < 1e-9 || name === 'H+' || name === 'OH-') continue;
      const def = D.COMPONENTS[name] || D.SPECIES[name];
      out.push({ name, label: def ? def.label : name, c, color: def && def.color });
    }
    return out.sort((a, b) => b.c - a.c).slice(0, n);
  }

  /** Run the simulation forward quickly (used by tests). */
  function runFor(seconds, dt = 0.1) { for (let t = 0; t < seconds; t += dt) tick(dt); return s; }

  return {
    reset, add, tick, runFor, litSplint, glowingSplint, limewaterTest, dampLitmus, flameTest, fractions,
    liquidColor, precipitates, crystals, topSpecies,
    get state() { return s; },
    set onEvent(fn) { if (s) s.onEvent = fn; },
  };
})();
