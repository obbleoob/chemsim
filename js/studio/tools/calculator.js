/* ============================================================================
   ChemSim · studio/tools/calculator.js
   ----------------------------------------------------------------------------
   Stoichiometry, yield and green-chemistry metrics for a reaction written as
   reaction SMILES:  reactant.reactant>>product.product

     • molar masses and formulas from RDKit; the equation is balanced
       automatically when possible (smallest whole-number coefficients)
     • enter masses (g) → moles, equivalents, the limiting reagent,
       theoretical yield and percentage yield
     • atom economy  = M(desired product) × ν / Σ ν·M(reactants) × 100 %
     • E-factor      = (mass of everything in − mass of product) / mass of product
     • reaction mass efficiency (RME) = mass of product / mass of reactants × 100 %
   ============================================================================ */
'use strict';

const Calculator = (() => {
  const esc = (s) => StudioTools.esc(s);
  const Z = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 19: 'K', 20: 'Ca', 26: 'Fe', 29: 'Cu', 30: 'Zn', 35: 'Br', 53: 'I', 3: 'Li', 47: 'Ag', 50: 'Sn', 82: 'Pb', 56: 'Ba', 25: 'Mn', 24: 'Cr' };
  const EXAMPLES = [
    ['Aspirin (salicylic acid + ethanoic anhydride)', 'OC(=O)c1ccccc1O.CC(=O)OC(C)=O>>CC(=O)Oc1ccccc1C(=O)O.CC(=O)O', { 0: 2.0, 1: 5.4 }, 2.1],
    ['Fischer esterification (ethanoic acid + ethanol)', 'CC(=O)O.CCO>>CC(=O)OCC.O', { 0: 6.0, 1: 4.6 }, 6.2],
    ['Hydrogenation of ethene (addition)', 'C=C.[H][H]>>CC', { 0: 2.8, 1: 0.2 }, null],
    ['Grignard (bromobenzene → benzoic acid)', 'Brc1ccccc1.[Mg].O=C=O>>OC(=O)c1ccccc1.[Mg+2].[Br-]', { 0: 3.14, 1: 0.6, 2: 5.0 }, 1.9],
    ['Combustion of methane', 'C.O=O>>O=C=O.O', { 0: 1.6, 1: 8.0 }, null],
    ['Wittig (Ph₃P=CH₂ + cyclohexanone)', 'C=P(c1ccccc1)(c1ccccc1)c1ccccc1.O=C1CCCCC1>>C=C1CCCCC1.O=P(c1ccccc1)(c1ccccc1)c1ccccc1', { 0: 2.76, 1: 0.98 }, 0.8],
  ];

  let rxn = null;          // { species: [...], ok }
  let desired = 0;         // index of the desired product
  let actual = null;       // actual mass of desired product (g)
  let extra = 0;           // solvent / work-up mass for the E-factor (g)

  /** Formula and molar mass of a SMILES from RDKit. */
  function info(smi) {
    let mol = null;
    try {
      mol = RDKit.get_mol(smi);
      if (!mol || !mol.is_valid()) return null;
      const j = JSON.parse(mol.get_json());
      const atoms = j.molecules[0].atoms || [];
      const dflt = (j.defaults && j.defaults.atom) || {};
      const counts = {};
      let charge = 0;
      atoms.forEach((a) => {
        const z = a.z !== undefined ? a.z : dflt.z !== undefined ? dflt.z : 6;
        const el = Z[z] || `Z${z}`;
        counts[el] = (counts[el] || 0) + 1;
        const hs = a.impHs !== undefined ? a.impHs : dflt.impHs || 0;
        if (hs) counts.H = (counts.H || 0) + hs;
        charge += a.chg !== undefined ? a.chg : 0;
      });
      const M = JSON.parse(mol.get_descriptors()).amw;
      return { counts, M, charge, formula: hillFormula(counts, charge) };
    } catch (e) { return null; } finally { if (mol) mol.delete(); }
  }

  function parse(text) {
    const [l, r] = text.split('>>');
    if (!r) return { error: 'Write the reaction as reactants>>products, e.g. CC(=O)O.CCO>>CC(=O)OCC.O' };
    const species = [];
    l.split('.').filter(Boolean).forEach((s) => species.push({ smi: s.trim(), role: 'reactant' }));
    r.split('.').filter(Boolean).forEach((s) => species.push({ smi: s.trim(), role: 'product' }));
    for (const sp of species) {
      const i = info(sp.smi);
      if (!i) return { error: `RDKit could not read “${sp.smi}”` };
      Object.assign(sp, i, { nu: 1, mass: null });
    }
    balance(species);
    return { species };
  }

  /** Smallest whole-number coefficients (1–8) that balance every element and the charge. */
  function balance(species) {
    const els = [...new Set(species.flatMap((s) => Object.keys(s.counts)))];
    const n = species.length;
    if (n > 6) return false;
    const sign = species.map((s) => (s.role === 'reactant' ? 1 : -1));
    const nu = new Array(n).fill(1);
    let best = null;
    const ok = () => els.every((e) => species.reduce((t, s, i) => t + sign[i] * nu[i] * (s.counts[e] || 0), 0) === 0)
      && species.reduce((t, s, i) => t + sign[i] * nu[i] * s.charge, 0) === 0;
    const rec = (k) => {
      if (k === n) { if (ok()) { const sum = nu.reduce((a, b) => a + b, 0); if (!best || sum < best.sum) best = { sum, nu: nu.slice() }; } return; }
      for (let v = 1; v <= 8; v++) { nu[k] = v; if (best && nu.slice(0, k + 1).reduce((a, b) => a + b, 0) >= best.sum) break; rec(k + 1); }
    };
    rec(0);
    if (best) best.nu.forEach((v, i) => { species[i].nu = v; });
    species.balanced = !!best;
    return !!best;
  }

  function compute() {
    const sp = rxn.species;
    const R = sp.filter((s) => s.role === 'reactant'), P = sp.filter((s) => s.role === 'product');
    sp.forEach((s) => { s.mol = s.mass ? s.mass / s.M : null; });
    const given = R.filter((s) => s.mol);
    let lim = null;
    given.forEach((s) => { if (!lim || s.mol / s.nu < lim.mol / lim.nu) lim = s; });
    const ext = lim ? lim.mol / lim.nu : null;            // extent of reaction (mol)
    R.forEach((s) => { s.equiv = lim && s.mol ? (s.mol / s.nu) / ext : null; });
    P.forEach((s) => { s.theory = ext ? ext * s.nu * s.M : null; });
    const prod = P[desired] || P[0];
    const AE = (100 * prod.nu * prod.M) / R.reduce((t, s) => t + s.nu * s.M, 0);
    const massIn = R.reduce((t, s) => t + (s.mass || 0), 0);
    const yieldPct = actual && prod.theory ? (100 * actual) / prod.theory : null;
    const pm = actual || prod.theory;
    const E = pm && massIn ? (massIn + (extra || 0) - pm) / pm : null;
    const RME = pm && massIn ? (100 * pm) / massIn : null;
    return { R, P, lim, ext, prod, AE, yieldPct, E, RME, massIn };
  }

  /* ---------------- the tab ---------------- */
  let text = '';
  function load(reactants, products) {
    text = `${reactants.join('.')}>>${products.join('.')}`;
    rxn = null; actual = null;
    StudioTools.select('calc');
  }

  function render(el) {
    if (!RDKit) { el.innerHTML = '<p class="muted-note">Waiting for RDKit…</p>'; return; }
    if (!text && state.rd && state.rd.smiles) text = `>>${state.rd.smiles}`;
    el.innerHTML = `
      <label class="small">Reaction SMILES (reactants&gt;&gt;products)</label>
      <textarea id="ca-text" rows="2" spellcheck="false">${esc(text)}</textarea>
      <div class="row"><button class="hbtn small accent" id="ca-go">Calculate</button>
        <select id="ca-ex"><option value="">Examples…</option>${EXAMPLES.map((e, i) => `<option value="${i}">${esc(e[0])}</option>`).join('')}</select>
        <button class="hbtn small" id="ca-mine" data-tip="Put the molecule on the canvas in as the product">Use drawing as product</button></div>
      <div id="ca-out"></div>`;
    el.querySelector('#ca-go').addEventListener('click', () => { text = el.querySelector('#ca-text').value.trim(); rxn = null; actual = null; renderOut(el); });
    el.querySelector('#ca-ex').addEventListener('change', (e) => {
      const ex = EXAMPLES[e.target.value];
      if (!ex) return;
      text = ex[1]; rxn = parse(text);
      if (!rxn.error) Object.entries(ex[2]).forEach(([i, g]) => { rxn.species[i].mass = g; });
      actual = ex[3]; desired = 0;
      render(el);
    });
    el.querySelector('#ca-mine').addEventListener('click', () => { const l = (el.querySelector('#ca-text').value.split('>>')[0] || ''); text = `${l}>>${state.rd.smiles}`; rxn = null; render(el); });
    renderOut(el);
  }

  function renderOut(el) {
    const out = el.querySelector('#ca-out');
    if (!text || !text.includes('>>') || text.startsWith('>>')) { out.innerHTML = '<p class="muted-note">Add the reactants in front of “>>” (or pick an example). Masses can be typed into the table.</p>'; return; }
    if (!rxn) rxn = parse(text);
    if (rxn.error) { out.innerHTML = `<p class="issue error">${esc(rxn.error)}</p>`; return; }
    const c = compute();
    const eq = (list) => list.map((s) => `${s.nu > 1 ? s.nu + ' ' : ''}${s.formula.html}`).join(' + ');
    const f3 = (v, d = 3) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
    out.innerHTML = `
      <div class="card"><h2>Equation ${rxn.species.balanced ? '<span class="pill ok">balanced</span>' : '<span class="pill warn">not balanced: check for missing by-products</span>'}</h2>
        <div class="eqn">${eq(c.R)} → ${eq(c.P)}</div></div>
      <div class="card"><h2>Amounts</h2><table class="tt"><thead><tr><th></th><th>ν</th><th>M / g mol⁻¹</th><th>mass / g</th><th>n / mmol</th><th>equiv.</th></tr></thead><tbody>
        ${c.R.map((s) => `<tr${c.lim === s ? ' class="lim"' : ''}><td>${s.formula.html}${c.lim === s ? ' <span class="pill warn">limiting</span>' : ''}</td><td><input type="number" min="1" step="1" class="nu" data-i="${rxn.species.indexOf(s)}" value="${s.nu}" style="width:46px"/></td><td class="mono">${f3(s.M, 2)}</td>
          <td><input type="number" min="0" step="any" class="mass" data-i="${rxn.species.indexOf(s)}" value="${s.mass ?? ''}" style="width:80px"/></td><td class="mono">${s.mol ? f3(s.mol * 1000, 2) : '—'}</td><td class="mono">${s.equiv ? f3(s.equiv, 2) : s.mass ? '' : 'excess?'}</td></tr>`).join('')}
        ${c.P.map((s, k) => `<tr><td><label><input type="radio" name="ca-des" value="${k}"${k === desired ? ' checked' : ''}/> ${s.formula.html}</label></td><td><input type="number" min="1" step="1" class="nu" data-i="${rxn.species.indexOf(s)}" value="${s.nu}" style="width:46px"/></td><td class="mono">${f3(s.M, 2)}</td><td class="mono">${s.theory ? f3(s.theory) + ' (theory)' : '—'}</td><td class="mono">${c.ext ? f3(c.ext * s.nu * 1000, 2) : '—'}</td><td></td></tr>`).join('')}
      </tbody></table>
      <p class="muted-note">Product rows: the radio button marks the product you want (for yield and atom economy). Change ν if the automatic balancing is not what you need.</p></div>
      <div class="card"><h2>Yield</h2>
        <div class="row small">Actual mass of ${c.prod.formula.html} obtained: <input type="number" min="0" step="any" id="ca-act" value="${actual ?? ''}" style="width:90px"/> g</div>
        <div class="small">Limiting reagent: <b>${c.lim ? c.lim.formula.html : '— (enter reactant masses)'}</b></div>
        <div class="small">Theoretical yield: <b>${c.prod.theory ? f3(c.prod.theory) + ' g' : '—'}</b></div>
        <div class="small">Percentage yield: <b>${c.yieldPct ? f3(c.yieldPct, 1) + ' %' : '—'}</b></div></div>
      <div class="card"><h2>Green chemistry</h2>
        <div class="metrics">
          <div><div class="k">Atom economy</div><div class="v">${f3(c.AE, 1)} %</div></div>
          <div><div class="k">E-factor</div><div class="v">${f3(c.E, 2)}</div></div>
          <div><div class="k">RME</div><div class="v">${c.RME ? f3(c.RME, 1) + ' %' : '—'}</div></div></div>
        <div class="row small">Solvent / work-up mass for the E-factor: <input type="number" min="0" step="any" id="ca-extra" value="${extra || ''}" style="width:80px"/> g</div>
        <p class="muted-note"><b>Atom economy</b> asks how much of the reactants' mass ends up in the product if everything goes perfectly (additions such as hydrogenation: 100 %; substitutions and eliminations waste the leaving group). <b>E-factor</b> = kg waste per kg product: oil refining &lt; 0.1, bulk chemicals 1–5, fine chemicals 5–50, pharmaceuticals 25–100+. <b>RME</b> also counts the yield and any excess reagent.</p></div>`;
    out.querySelectorAll('.mass').forEach((i) => i.addEventListener('change', () => { rxn.species[i.dataset.i].mass = i.value === '' ? null : Number(i.value); renderOut(el); }));
    out.querySelectorAll('.nu').forEach((i) => i.addEventListener('change', () => { rxn.species[i.dataset.i].nu = Math.max(1, Math.round(Number(i.value) || 1)); renderOut(el); }));
    out.querySelectorAll('[name="ca-des"]').forEach((r) => r.addEventListener('change', () => { desired = Number(r.value); renderOut(el); }));
    out.querySelector('#ca-act').addEventListener('change', (e) => { actual = e.target.value === '' ? null : Number(e.target.value); renderOut(el); });
    out.querySelector('#ca-extra').addEventListener('change', (e) => { extra = Number(e.target.value) || 0; renderOut(el); });
  }

  StudioTools.add({ id: 'calc', icon: '🧮', title: 'Stoichiometry, yield & green metrics', short: 'Calculator', render, keepOnChange: true });
  return { parse, info, balance, compute, load, set rxn(v) { rxn = v; }, get rxn() { return rxn; }, set actual(v) { actual = v; }, set desired(v) { desired = v; } };
})();
