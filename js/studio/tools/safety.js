/* ============================================================================
   ChemSim · studio/tools/safety.js
   ----------------------------------------------------------------------------
   ⚠️ Safety & storage: GHS hazard pictograms, signal word, hazard (H)
   statements and a storage class.
     1. Built-in table of ~75 common laboratory chemicals (classifications as
        commonly given on suppliers' safety data sheets, EU CLP / GHS).
     2. Otherwise: hazards ESTIMATED from structural alerts (peroxides,
        azides, nitro groups, acyl halides, heavy metals, small volatile
        organics…), clearly labelled as an estimate.
     3. "Look up on PubChem" fetches the official GHS classification (online).
   Always read the real safety data sheet before using a chemical.
   ============================================================================ */
'use strict';

const Safety = (() => {
  const esc = (s) => StudioTools.esc(s);

  const GHS = {
    GHS01: { icon: '💥', name: 'Explosive', text: 'Explosives, self-reactive substances, organic peroxides' },
    GHS02: { icon: '🔥', name: 'Flammable', text: 'Flammable gases, liquids and solids; pyrophoric; reacts with water to give flammable gas' },
    GHS03: { icon: '⭕', name: 'Oxidising', text: 'Oxidisers: can cause or intensify fire' },
    GHS04: { icon: '🧯', name: 'Gas under pressure', text: 'Compressed, liquefied or refrigerated gases' },
    GHS05: { icon: '🧪', name: 'Corrosive', text: 'Corrosive to metals; severe skin burns and eye damage' },
    GHS06: { icon: '☠️', name: 'Acute toxicity', text: 'Fatal or toxic if swallowed, in contact with skin or inhaled' },
    GHS07: { icon: '❗', name: 'Harmful / irritant', text: 'Harmful; skin, eye or respiratory irritation; narcotic effects' },
    GHS08: { icon: '🫁', name: 'Health hazard', text: 'Carcinogenic, mutagenic, toxic to reproduction; respiratory sensitiser; organ damage; aspiration hazard' },
    GHS09: { icon: '🐟', name: 'Environment', text: 'Toxic to aquatic life' },
  };
  const H = {
    H200: 'Unstable explosive', H201: 'Explosive; mass explosion hazard', H202: 'Explosive; severe projection hazard', H220: 'Extremely flammable gas', H221: 'Flammable gas', H224: 'Extremely flammable liquid and vapour',
    H225: 'Highly flammable liquid and vapour', H226: 'Flammable liquid and vapour', H228: 'Flammable solid', H251: 'Self-heating: may catch fire', H260: 'In contact with water releases flammable gases which may ignite spontaneously', H261: 'In contact with water releases flammable gas',
    H270: 'May cause or intensify fire; oxidiser', H271: 'May cause fire or explosion; strong oxidiser', H272: 'May intensify fire; oxidiser', H280: 'Contains gas under pressure; may explode if heated', H290: 'May be corrosive to metals',
    H300: 'Fatal if swallowed', H301: 'Toxic if swallowed', H302: 'Harmful if swallowed', H304: 'May be fatal if swallowed and enters airways', H310: 'Fatal in contact with skin', H311: 'Toxic in contact with skin', H312: 'Harmful in contact with skin',
    H314: 'Causes severe skin burns and eye damage', H315: 'Causes skin irritation', H317: 'May cause an allergic skin reaction', H318: 'Causes serious eye damage', H319: 'Causes serious eye irritation', H330: 'Fatal if inhaled', H331: 'Toxic if inhaled', H332: 'Harmful if inhaled',
    H334: 'May cause allergy or asthma symptoms if inhaled', H335: 'May cause respiratory irritation', H336: 'May cause drowsiness or dizziness', H340: 'May cause genetic defects', H341: 'Suspected of causing genetic defects', H350: 'May cause cancer', H351: 'Suspected of causing cancer',
    H360: 'May damage fertility or the unborn child', H361: 'Suspected of damaging fertility or the unborn child', H370: 'Causes damage to organs', H372: 'Causes damage to organs through prolonged or repeated exposure', H373: 'May cause damage to organs through prolonged or repeated exposure',
    H400: 'Very toxic to aquatic life', H410: 'Very toxic to aquatic life with long-lasting effects', H411: 'Toxic to aquatic life with long-lasting effects', H412: 'Harmful to aquatic life with long-lasting effects', H420: 'Harms public health and the environment by destroying ozone in the upper atmosphere',
  };
  // [name, SMILES, pictograms (numbers), signal, H statements]
  const DB = [
    ['Water', 'O', [], '', []], ['Ethanol', 'CCO', [2, 7], 'Danger', [225, 319]], ['Methanol', 'CO', [2, 6, 8], 'Danger', [225, 301, 311, 331, 370]], ['Acetone', 'CC(C)=O', [2, 7], 'Danger', [225, 319, 336]],
    ['Diethyl ether', 'CCOCC', [2, 7], 'Danger', [224, 302, 336]], ['Hexane', 'CCCCCC', [2, 7, 8, 9], 'Danger', [225, 304, 315, 336, 361, 373, 411]], ['Toluene', 'Cc1ccccc1', [2, 7, 8], 'Danger', [225, 304, 315, 336, 361, 373]],
    ['Benzene', 'c1ccccc1', [2, 7, 8], 'Danger', [225, 304, 315, 319, 340, 350, 372]], ['Dichloromethane', 'ClCCl', [8], 'Warning', [351]], ['Chloroform', 'ClC(Cl)Cl', [6, 8], 'Danger', [302, 331, 315, 319, 351, 361, 372]],
    ['Ethanoic (acetic) acid', 'CC(=O)O', [2, 5], 'Danger', [226, 314]], ['Methanoic (formic) acid', 'OC=O', [2, 5, 6], 'Danger', [226, 302, 314, 331]], ['Hydrogen chloride / hydrochloric acid', 'Cl', [5, 7], 'Danger', [290, 314, 335]],
    ['Sulfuric acid', 'OS(=O)(=O)O', [5], 'Danger', [290, 314]], ['Nitric acid', 'O[N+](=O)[O-]', [3, 5], 'Danger', [272, 290, 314, 331]], ['Phosphoric acid', 'OP(=O)(O)O', [5], 'Danger', [290, 314]],
    ['Sodium hydroxide', '[Na+].[OH-]', [5], 'Danger', [290, 314]], ['Potassium hydroxide', '[K+].[OH-]', [5, 7], 'Danger', [290, 302, 314]], ['Ammonia', 'N', [4, 5, 6, 9], 'Danger', [221, 280, 314, 331, 400]],
    ['Hydrogen peroxide (30 %)', 'OO', [3, 5, 7], 'Danger', [271, 302, 314, 332]], ['Sodium hypochlorite (bleach)', '[Na+].[O-]Cl', [5, 9], 'Danger', [290, 314, 400]], ['Phenol', 'Oc1ccccc1', [5, 6, 8], 'Danger', [301, 311, 331, 314, 341, 373]],
    ['Aniline', 'Nc1ccccc1', [6, 8, 9], 'Danger', [301, 311, 317, 318, 331, 341, 351, 372, 400]], ['Formaldehyde', 'C=O', [5, 6, 8], 'Danger', [301, 311, 314, 317, 331, 341, 350]], ['Acetaldehyde', 'CC=O', [2, 7, 8], 'Danger', [224, 319, 335, 341, 351]],
    ['Benzaldehyde', 'O=Cc1ccccc1', [7], 'Warning', [302]], ['Nitrobenzene', '[O-][N+](=O)c1ccccc1', [6, 8, 9], 'Danger', [301, 311, 331, 351, 360, 372, 412]], ['Acetonitrile', 'CC#N', [2, 7], 'Danger', [225, 302, 312, 332, 319]],
    ['N,N-Dimethylformamide (DMF)', 'CN(C)C=O', [2, 7, 8], 'Danger', [226, 312, 332, 319, 360]], ['Dimethyl sulfoxide (DMSO)', 'CS(C)=O', [], '', []], ['Tetrahydrofuran (THF)', 'C1CCOC1', [2, 7, 8], 'Danger', [225, 302, 319, 335, 351]],
    ['Ethyl ethanoate (ethyl acetate)', 'CCOC(C)=O', [2, 7], 'Danger', [225, 319, 336]], ['Pyridine', 'c1ccncc1', [2, 7], 'Danger', [225, 302, 312, 332, 315, 319]], ['Tetrachloromethane', 'ClC(Cl)(Cl)Cl', [6, 8], 'Danger', [301, 311, 331, 351, 372, 412, 420]],
    ['Bromine', 'BrBr', [5, 6, 9], 'Danger', [314, 330, 400]], ['Chlorine', 'ClCl', [3, 4, 6, 9], 'Danger', [270, 280, 330, 315, 319, 335, 400]], ['Iodine', 'II', [7, 9], 'Warning', [312, 332, 315, 319, 335, 372, 400]],
    ['Hydrogen', '[H][H]', [2, 4], 'Danger', [220, 280]], ['Methane', 'C', [2, 4], 'Danger', [220, 280]], ['Carbon monoxide', '[C-]#[O+]', [2, 4, 6, 8], 'Danger', [220, 280, 331, 360, 372]], ['Carbon dioxide', 'O=C=O', [4], 'Warning', [280]],
    ['Oxygen', 'O=O', [3, 4], 'Danger', [270, 280]], ['Hydrogen sulfide', 'S', [2, 4, 6, 9], 'Danger', [220, 280, 330, 400]], ['Hydrogen cyanide', 'C#N', [2, 6, 9], 'Danger', [224, 300, 310, 330, 400, 410]],
    ['Sodium cyanide', '[Na+].[C-]#N', [6, 9], 'Danger', [300, 310, 330, 410]], ['Ethanoyl (acetyl) chloride', 'CC(=O)Cl', [2, 5], 'Danger', [225, 314]], ['Ethanoic anhydride', 'CC(=O)OC(C)=O', [2, 5, 6], 'Danger', [226, 302, 314, 330]],
    ['Thionyl chloride', 'O=S(Cl)Cl', [5, 6], 'Danger', [302, 314, 331]], ['Aspirin', 'CC(=O)Oc1ccccc1C(=O)O', [7], 'Warning', [302, 315, 319, 335]], ['Paracetamol', 'CC(=O)Nc1ccc(O)cc1', [7], 'Warning', [302, 315, 319]],
    ['Caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', [7], 'Warning', [302]], ['Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', [7], 'Warning', [302, 315, 319, 335]], ['Salicylic acid', 'OC(=O)c1ccccc1O', [5, 7], 'Danger', [302, 318]],
    ['Glucose', 'OCC1OC(O)C(O)C(O)C1O', [], '', []], ['Sodium chloride', '[Na+].[Cl-]', [], '', []], ['Copper(II) sulfate', '[Cu+2].[O-]S(=O)(=O)[O-]', [7, 9], 'Warning', [302, 315, 319, 410]],
    ['Silver nitrate', '[Ag+].[O-][N+](=O)[O-]', [3, 5, 9], 'Danger', [272, 314, 410]], ['Potassium permanganate', '[K+].[O-][Mn](=O)(=O)=O', [3, 7, 8, 9], 'Danger', [272, 302, 361, 410]],
    ['Sodium (metal)', '[Na]', [2, 5], 'Danger', [260, 314]], ['Magnesium (powder)', '[Mg]', [2], 'Danger', [228, 251, 261]], ['Lithium aluminium hydride', '[Li+].[AlH4-]', [2, 5], 'Danger', [260, 314]],
    ['Sodium borohydride', '[Na+].[BH4-]', [2, 5, 6, 8], 'Danger', [260, 301, 314, 360]], ['Mercury', '[Hg]', [6, 8, 9], 'Danger', [330, 360, 372, 410]], ['2,4,6-Trinitrotoluene (TNT)', 'Cc1c(cc(cc1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]', [1, 6, 8, 9], 'Danger', [201, 301, 311, 331, 373, 411]],
    ['Nitroglycerin', 'C(C(CO[N+](=O)[O-])O[N+](=O)[O-])O[N+](=O)[O-]', [1, 6, 8, 9], 'Danger', [201, 300, 310, 330, 373, 411]], ['Ammonium nitrate', '[NH4+].[O-][N+](=O)[O-]', [3, 7], 'Warning', [272, 319]],
    ['Benzoic acid', 'OC(=O)c1ccccc1', [5, 7, 8], 'Danger', [315, 318, 372]], ['Naphthalene', 'c1ccc2ccccc2c1', [7, 8, 9], 'Warning', [302, 351, 410]], ['Ethane-1,2-diol (ethylene glycol)', 'OCCO', [7, 8], 'Warning', [302, 373]],
    ['Glycerol', 'OCC(O)CO', [], '', []], ['Propan-2-ol', 'CC(C)O', [2, 7], 'Danger', [225, 319, 336]], ['Butan-1-ol', 'CCCCO', [2, 5, 7], 'Danger', [226, 302, 315, 318, 335, 336]], ['Styrene', 'C=Cc1ccccc1', [2, 7, 8], 'Warning', [226, 315, 319, 332, 361, 372]],
    ['Cyclohexane', 'C1CCCCC1', [2, 7, 8, 9], 'Danger', [225, 304, 315, 336, 410]], ['Bromoethane', 'CCBr', [2, 6, 8], 'Danger', [225, 302, 332, 351]], ['Iodomethane', 'CI', [6, 8], 'Danger', [301, 312, 331, 315, 319, 335, 351]],
    ['Nicotine', 'CN1CCCC1c1cccnc1', [6, 9], 'Danger', [300, 310, 330, 411]], ['Ethene', 'C=C', [2, 4, 7], 'Danger', [220, 280, 336]], ['Propanone oxime', 'CC(C)=NO', [7], 'Warning', [302, 319]],
  ];
  let index = null;
  const canon = (smi) => { let m = null; try { m = RDKit.get_mol(smi); return m && m.is_valid() ? m.get_smiles() : null; } catch (e) { return null; } finally { if (m) m.delete(); } };
  const stripStereo = (smi) => smi.replace(/[@/\\]/g, '').replace(/\[([A-Z][a-z]?)H\]/g, '$1');
  function lookup(smi) {
    if (!index) { index = new Map(); DB.forEach((d) => { const c = canon(d[1]); if (c) { index.set(c, d); index.set(canon(stripStereo(c)) || c, d); } }); }
    return index.get(smi) || index.get(canon(stripStereo(smi)) || '');
  }

  /** Hazards estimated from structural features (no database entry). */
  function estimate() {
    const est = [];
    const g = StudioTools.graph();
    const counts = state.analysis ? state.analysis.counts : {};
    const heavy = [...g.atoms.values()].length;
    const alerts = StudioTools.withMol((mol) => {
      const has = (s) => StudioTools.matches(mol, s).length > 0;
      const n = (s) => StudioTools.matches(mol, s).length;
      return {
        peroxide: has('[OX2][OX2]'), azide: has('[N-]=[N+]=N') || has('N=[N+]=[N-]'), diazo: has('[N+]#N') || has('C=[N+]=[N-]'), polyNitro: n('[N+](=O)[O-]') >= 2,
        nitro: has('[N+](=O)[O-]'), acylHal: has('[CX3](=O)[Cl,Br]'), strongAcid: has('[SX4](=O)(=O)[OH]') || has('P(=O)[OH]'), amine: has('[NX3;H2,H1;!$(NC=O)]'), aldehyde: has('[CX3H1](=O)'),
        halo: has('[CX4][Cl,Br,I]'), isocyanate: has('N=C=[O,S]'), epoxide: has('C1OC1'), michael: has('C=CC(=O)'), arom: has('a'),
      };
    }) || {};
    const pics = new Set(), hs = new Set();
    const add = (p, hlist, why) => { p.forEach((x) => pics.add(x)); hlist.forEach((x) => hs.add(x)); est.push(why); };
    if (alerts.peroxide || alerts.azide || alerts.diazo || alerts.polyNitro) add([1], [200], 'Contains an explosophore (peroxide, azide, diazo or several nitro groups): may be shock- or heat-sensitive.');
    else if (alerts.nitro) add([7, 8], [302, 373], 'Nitro compounds are often toxic and energetic.');
    if (alerts.acylHal) add([5], [314], 'Acyl halides react with water (and skin moisture) to give HCl: corrosive.');
    if (alerts.strongAcid) add([5], [314], 'Sulfonic/phosphonic acids are strong acids: corrosive.');
    if (alerts.amine) add([5, 7], [314, 302], 'Amines are basic and often corrosive or irritant.');
    if (alerts.aldehyde) add([7, 8], [317, 341], 'Aldehydes irritate and can sensitise the skin.');
    if (alerts.halo || alerts.epoxide) add([6, 8], [351], 'Alkyl halides and epoxides are alkylating agents (possible carcinogens).');
    if (alerts.isocyanate) add([6, 8], [334, 330], 'Isocyanates are toxic and respiratory sensitisers.');
    if (['Hg', 'Pb', 'Cd', 'Cr', 'As', 'Tl', 'Ba'].some((m) => counts[m])) add([6, 8, 9], [301, 373, 410], 'Contains a toxic heavy metal.');
    const ionic = state.atoms.some((a) => a.charge);
    if (!ionic && heavy <= 12 && (counts.C || 0) >= 1 && !counts.F && !(counts.Cl >= 2) && !(counts.Br >= 2)) add([2], [225], 'A small, neutral organic molecule is likely to be volatile and flammable.');
    if (alerts.arom && (counts.Cl || counts.Br)) add([9], [411], 'Halogenated aromatics persist in the environment.');
    return { pics: [...pics].sort(), hs: [...hs].sort(), why: est };
  }

  function storage(pics, name = '', smi = '') {
    const p = new Set(pics);
    if (p.has(1)) return 'Explosives: special licensed storage only; never in a normal lab store.';
    if (p.has(4)) return `Gas cylinder: chained upright in a ventilated area${p.has(2) ? ', away from oxidising gases' : ''}.`;
    if (p.has(3)) return 'Oxidisers: separate cabinet, away from flammables, organics and reducing agents.';
    if (p.has(2)) return 'Flammables cabinet (fire-resistant, ventilated); away from oxidisers and heat sources.';
    if (p.has(5)) return /hydroxide|ammonia|amine|\[OH-\]|^N$|aniline|hypochlorite/i.test(name + ' ' + smi) ? 'Corrosives (bases): separate from acids.' : 'Corrosives (acids): acid cabinet, separate from bases, cyanides and bleach.';
    if (p.has(6)) return 'Toxics: locked cabinet with restricted access.';
    if (p.has(8) || p.has(7)) return 'General chemical store; label clearly and keep closed.';
    return 'No special storage class (general store).';
  }

  function diamond(code) {
    const g = GHS[code];
    return `<div class="ghs" data-tip="${esc(code + ': ' + g.name + '. ' + g.text)}"><div class="ghs-d"><span>${g.icon}</span></div><div class="ghs-l">${g.name}</div></div>`;
  }

  async function pubchem(smi, box) {
    box.innerHTML = '<p class="small dim">Asking PubChem…</p>';
    try {
      const cidR = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smi)}/cids/JSON`);
      const cid = (await cidR.json()).IdentifierList.CID[0];
      const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`);
      if (!r.ok) throw new Error('No GHS classification on PubChem for this compound');
      const txt = await r.text();
      const pics = [...new Set((txt.match(/GHS0\d/g) || []))].sort();
      const hs = [...new Set((txt.match(/H\d{3}/g) || []))].sort();
      const signal = /"Danger"/.test(txt) ? 'Danger' : /"Warning"/.test(txt) ? 'Warning' : '';
      box.innerHTML = `<div class="card"><h2>PubChem (CID ${cid}) <span class="h2-note">${signal}</span></h2><div class="ghs-row">${pics.map(diamond).join('') || '<span class="small">No pictograms listed.</span>'}</div>
        <div class="small">${hs.map((h) => `<b>${h}</b> ${esc(H[h] || '')}`).join('<br/>')}</div><p class="muted-note">From the aggregated GHS notifications on PubChem (pubchem.ncbi.nlm.nih.gov).</p></div>`;
    } catch (e) { box.innerHTML = `<p class="small">PubChem lookup failed: ${esc(e.message)}. (Needs internet.)</p>`; }
  }

  function render(el) {
    if (!state.atoms.length || !(state.rd && state.rd.smiles)) { el.innerHTML = '<p class="muted-note">Draw or load a molecule to see its hazards.</p>'; return; }
    const smi = state.rd.smiles;
    const hit = lookup(smi);
    let pics, hs, signal, src, why = [], name = '';
    if (hit) { [name, , pics, signal, hs] = hit; hs = hs.map((n) => 'H' + n); src = `Built-in data for <b>${esc(name)}</b>`; }
    else { const e = estimate(); pics = e.pics; hs = e.hs.map((n) => 'H' + n); why = e.why; signal = pics.some((p) => [1, 5, 6, 8].includes(p)) ? 'Danger (estimated)' : pics.length ? 'Warning (estimated)' : ''; src = '<span class="pill warn">estimated from the structure</span> not in the built-in table'; }
    const codes = pics.map((p) => `GHS0${p}`);
    el.innerHTML = `
      <div class="card"><h2>GHS classification <span class="h2-note">${src}</span></h2>
        ${signal ? `<div class="signal ${/Danger/.test(signal) ? 'danger' : 'warning'}">${esc(signal)}</div>` : '<div class="small">No GHS hazard pictograms.</div>'}
        <div class="ghs-row">${codes.map(diamond).join('')}</div>
        ${hs.length ? `<table class="tt"><tbody>${hs.map((h) => `<tr><td class="mono"><b>${h}</b></td><td>${esc(H[h] || '')}</td></tr>`).join('')}</tbody></table>` : ''}
        ${why.length ? `<ul class="small">${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>
      <div class="card"><h2>Storage</h2><p class="small">${esc(storage(pics, name, smi))}</p>
        <p class="muted-note">General rules: keep oxidisers away from flammables; acids away from bases, cyanides and bleach; water-reactive metals and hydrides dry and away from water; label every container.</p></div>
      <div class="row"><button class="hbtn small" id="sf-pub">🌐 Look up on PubChem</button></div><div id="sf-pub-out"></div>
      <p class="muted-note">For learning only. Always read the supplier's safety data sheet (SDS) and do a risk assessment before handling a chemical.</p>`;
    el.querySelector('#sf-pub').addEventListener('click', () => pubchem(smi, el.querySelector('#sf-pub-out')));
  }

  StudioTools.add({ id: 'safety', icon: '⚠️', title: 'Safety: GHS hazards & storage', short: 'Safety', render });
  return { lookup, estimate, storage, GHS };
})();
