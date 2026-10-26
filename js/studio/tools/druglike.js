/* ============================================================================
   ChemSim · studio/tools/druglike.js
   ----------------------------------------------------------------------------
   Drug-likeness and ADME rules of thumb, from RDKit descriptors:
     • Lipinski's rule of five (oral drugs: MW ≤ 500, cLogP ≤ 5, H-bond
       donors ≤ 5, acceptors ≤ 10; one violation is allowed)
     • Veber (oral bioavailability: ≤ 10 rotatable bonds, TPSA ≤ 140 Å²)
     • Ghose (logP −0.4…5.6, MW 160…480, molar refractivity 40…130, 20…70 atoms)
     • Solubility estimate (ESOL, Delaney 2004)
     • Gut absorption / brain penetration from TPSA and logP, in the style of
       the BOILED-Egg plot (Daina & Zoete 2016; approximate ellipses, with
       Crippen logP instead of WLOGP)
     • Bioavailability radar (the six SwissADME ranges)
     • Structural alerts: a simplified subset of PAINS-type and reactive /
       toxicophore groups (false positives and negatives are possible)
   These are screening rules for medicinal chemists, not predictions of
   whether a molecule is a good drug.
   ============================================================================ */
'use strict';

const DrugLike = (() => {
  const esc = (s) => StudioTools.esc(s);

  const ALERTS = [
    ['Catechol', '[OH]c:c[OH]', 'redox-active, often a false positive in assays (PAINS)'],
    ['Quinone', '[#6]1(=O)[#6]=,:[#6][#6](=O)[#6]=,:[#6]1', 'redox cycling, reacts with proteins (PAINS)'],
    ['Rhodanine', 'S=C1SC(=*)C(=O)N1', 'frequent hitter (PAINS)'],
    ['Rhodanine core', 'S=C1SCC(=O)N1', 'frequent hitter (PAINS)'],
    ['Azo group', 'c[NX2]=[NX2]c', 'coloured, can interfere with assays (PAINS)'],
    ['Phenolic Mannich base', '[OH]c1ccccc1[CH2][NX3]', 'PAINS'],
    ['2-Aminothiophene', '[NX3]c1sccc1', 'PAINS'],
    ['Hydroxyphenyl hydrazone', '[OH]c1ccccc1[CX3]=N[NX3]', 'PAINS'],
    ['Ene-one (Michael acceptor)', '[CX3]=[CX3][CX3](=O)[#6,#1]', 'reacts with cysteine thiols'],
    ['Aldehyde', '[CX3H1](=O)[#6]', 'reactive'],
    ['Alkyl halide', '[CX4][Cl,Br,I]', 'alkylating agent'],
    ['Epoxide', 'C1OC1', 'alkylating agent'],
    ['Aziridine', 'C1NC1', 'alkylating agent'],
    ['Nitroaromatic', 'c[N+](=O)[O-]', 'toxicophore (can be reduced to reactive species)'],
    ['Acyl halide', '[CX3](=O)[Cl,Br,I]', 'very reactive'],
    ['Anhydride', '[CX3](=O)O[CX3](=O)', 'very reactive'],
    ['Isocyanate / isothiocyanate', 'N=C=[O,S]', 'reactive'],
    ['Peroxide', '[OX2][OX2]', 'unstable, oxidising'],
    ['Thiol', '[SX2H]', 'can form disulfides'],
    ['Hydrazine', '[NX3][NX3]', 'toxicophore'],
    ['Polyene', '[CX3]=[CX3][CX3]=[CX3][CX3]=[CX3]', 'light/oxygen sensitive'],
  ];

  function compute() {
    const d = state.rd && state.rd.desc;
    if (!d) return null;
    const g = StudioTools.graph();
    const heavy = d.NumHeavyAtoms || 1;
    const aromAtoms = [...g.atoms.values()].filter((a) => a.arom).length;
    const AP = aromAtoms / heavy;
    const logS = 0.16 - 0.63 * d.CrippenClogP - 0.0062 * d.amw + 0.066 * d.NumRotatableBonds - 0.74 * AP;   // ESOL
    const lip = [
      ['Molecular weight ≤ 500', d.amw, d.amw <= 500, 'g/mol'],
      ['cLogP ≤ 5', d.CrippenClogP, d.CrippenClogP <= 5, ''],
      ['H-bond donors ≤ 5', d.lipinskiHBD, d.lipinskiHBD <= 5, '(OH + NH)'],
      ['H-bond acceptors ≤ 10', d.lipinskiHBA, d.lipinskiHBA <= 10, '(N + O)'],
    ];
    const lipV = lip.filter((x) => !x[2]).length;
    const veber = [['Rotatable bonds ≤ 10', d.NumRotatableBonds, d.NumRotatableBonds <= 10, ''], ['TPSA ≤ 140 Å²', d.tpsa, d.tpsa <= 140, 'Å²']];
    const ghose = [
      ['−0.4 ≤ logP ≤ 5.6', d.CrippenClogP, d.CrippenClogP >= -0.4 && d.CrippenClogP <= 5.6, ''],
      ['160 ≤ MW ≤ 480', d.amw, d.amw >= 160 && d.amw <= 480, 'g/mol'],
      ['40 ≤ molar refractivity ≤ 130', d.CrippenMR, d.CrippenMR >= 40 && d.CrippenMR <= 130, ''],
      ['20 ≤ atoms ≤ 70', d.NumAtoms, d.NumAtoms >= 20 && d.NumAtoms <= 70, '(including H)'],
    ];
    const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const gi = inEllipse(d.tpsa, d.CrippenClogP, 66, 2.5, 66, 4.0);
    const bbb = inEllipse(d.tpsa, d.CrippenClogP, 33, 3.0, 37, 2.2);
    const alerts = StudioTools.withMol((mol) => ALERTS.map(([name, smarts, why]) => ({ name, why, atoms: [...new Set(StudioTools.matches(mol, smarts).flat())] })).filter((a) => a.atoms.length)) || [];
    const radar = [
      ['LIPO', d.CrippenClogP, -0.7, 5.0, -2, 7],
      ['SIZE', d.amw, 150, 500, 0, 700],
      ['POLAR', d.tpsa, 20, 130, 0, 180],
      ['INSOLU', logS, -6, 0, -9, 1],
      ['INSATU', d.FractionCSP3, 0.25, 1, 0, 1],
      ['FLEX', d.NumRotatableBonds, 0, 9, 0, 15],
    ];
    return { d, lip, lipV, veber, ghose, logS, AP, gi, bbb, alerts, radar };
  }

  const solClass = (logS) => (logS > 0 ? 'highly soluble' : logS > -2 ? 'very soluble' : logS > -4 ? 'soluble' : logS > -6 ? 'moderately soluble' : logS > -10 ? 'poorly soluble' : 'insoluble');

  function radarSVG(radar) {
    const W = 250, cx = 125, cy = 120, R = 92;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / radar.length;
    const pt = (i, f) => [cx + R * f * Math.cos(ang(i)), cy + R * f * Math.sin(ang(i))];
    const norm = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    let s = `<svg viewBox="0 0 ${W} 245" class="tsvg" style="max-width:280px">`;
    // the "drug-like" band
    const band = radar.map((r, i) => pt(i, 0.15 + 0.85 * norm(r[3], r[4], r[5]))).map((p) => p.join(',')).join(' ');
    const bandIn = radar.map((r, i) => pt(i, 0.15 + 0.85 * norm(r[2], r[4], r[5]))).map((p) => p.join(',')).join(' ');
    s += `<polygon points="${band}" fill="rgba(244,114,182,0.22)" stroke="rgba(244,114,182,0.6)"/><polygon points="${bandIn}" fill="#0f1520"/>`;
    [0.25, 0.5, 0.75, 1].forEach((f) => { s += `<polygon points="${radar.map((_, i) => pt(i, f).join(',')).join(' ')}" fill="none" stroke="#1f2a3d"/>`; });
    radar.forEach((r, i) => { const [x, y] = pt(i, 1.13); s += `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="#1f2a3d"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="#9aa7b8">${r[0]}</text>`; });
    const mol = radar.map((r, i) => pt(i, 0.15 + 0.85 * norm(r[1], r[4], r[5]))).map((p) => p.join(',')).join(' ');
    s += `<polygon points="${mol}" fill="none" stroke="#22d3ee" stroke-width="2"/>`;
    return s + '</svg>';
  }

  function eggSVG(d) {
    const W = 260, H = 200, L = 34, B = 26;
    const X = (tpsa) => L + (tpsa / 180) * (W - L - 8), Y = (lp) => H - B - ((lp + 4) / 12) * (H - B - 8);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="tsvg" style="max-width:300px">`;
    s += `<ellipse cx="${X(66)}" cy="${Y(2.5)}" rx="${X(66 + 66) - X(66)}" ry="${Y(2.5) - Y(6.5)}" fill="#f8fafc" opacity="0.9"/>`;
    s += `<ellipse cx="${X(33)}" cy="${Y(3.0)}" rx="${X(70) - X(33)}" ry="${Y(3.0) - Y(5.2)}" fill="#fcd34d"/>`;
    s += `<line x1="${L}" y1="${H - B}" x2="${W - 4}" y2="${H - B}" stroke="#64748b"/><line x1="${L}" y1="8" x2="${L}" y2="${H - B}" stroke="#64748b"/>`;
    [0, 60, 120, 180].forEach((v) => { s += `<text x="${X(v)}" y="${H - B + 12}" font-size="9" fill="#9aa7b8" text-anchor="middle">${v}</text>`; });
    [-4, 0, 4, 8].forEach((v) => { s += `<text x="${L - 4}" y="${Y(v) + 3}" font-size="9" fill="#9aa7b8" text-anchor="end">${v}</text>`; });
    s += `<text x="${(W + L) / 2}" y="${H - 2}" font-size="10" fill="#e6edf3" text-anchor="middle">TPSA / Å²</text><text x="10" y="${H / 2}" font-size="10" fill="#e6edf3" transform="rotate(-90 10 ${H / 2})" text-anchor="middle">logP</text>`;
    const px = X(Math.min(180, d.tpsa)), py = Y(Math.max(-4, Math.min(8, d.CrippenClogP)));
    s += `<circle cx="${px}" cy="${py}" r="5" fill="#ef4444" stroke="#fff"/>`;
    return s + '</svg>';
  }

  const row = ([label, v, ok, unit]) => `<tr><td>${label}</td><td class="mono">${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v} <span class="dim small">${unit}</span></td><td>${ok ? '<span class="pill ok">✔</span>' : '<span class="pill bad">✘</span>'}</td></tr>`;

  function render(el) {
    if (!state.atoms.length) { el.innerHTML = '<p class="muted-note">Draw or load a molecule (try Aspirin, Ibuprofen or Caffeine from the examples).</p>'; return; }
    const r = compute();
    if (!r) { el.innerHTML = '<p class="muted-note">RDKit needs a valid structure (fix any red atoms) to compute descriptors.</p>'; return; }
    el.innerHTML = `
      <div class="card"><h2>Lipinski rule of five <span class="h2-note">${r.lipV <= 1 ? '<span class="pill ok">passes</span>' : '<span class="pill bad">fails</span>'} ${r.lipV} violation${r.lipV === 1 ? '' : 's'}</span></h2>
        <table class="tt"><tbody>${r.lip.map(row).join('')}</tbody></table>
        <p class="muted-note">Most oral drugs break at most one of these. (Natural products and transporter substrates are common exceptions.)</p></div>
      <div class="card"><h2>Veber <span class="h2-note">${r.veber.every((x) => x[2]) ? '<span class="pill ok">passes</span>' : '<span class="pill bad">fails</span>'}</span></h2><table class="tt"><tbody>${r.veber.map(row).join('')}</tbody></table></div>
      <div class="card"><h2>Ghose <span class="h2-note">${r.ghose.every((x) => x[2]) ? '<span class="pill ok">passes</span>' : '<span class="pill warn">outside range</span>'}</span></h2><table class="tt"><tbody>${r.ghose.map(row).join('')}</tbody></table></div>
      <div class="card"><h2>Absorption & brain penetration</h2>
        <div class="row" style="align-items:flex-start">${eggSVG(r.d)}
        <div class="small" style="flex:1;min-width:150px">
          <div>Gut absorption: ${r.gi ? '<span class="pill ok">high</span>' : '<span class="pill bad">low</span>'}</div>
          <div>Crosses blood–brain barrier: ${r.bbb ? '<span class="pill warn">likely</span>' : '<span class="pill">unlikely</span>'}</div>
          <div style="margin-top:6px">Water solubility (ESOL): log S = <b>${r.logS.toFixed(2)}</b> (${solClass(r.logS)})</div>
          <p class="muted-note">White: likely absorbed from the gut. Yolk: likely to enter the brain. Small, not-too-polar molecules (TPSA below ~80 Å²) get into the brain; very polar ones stay out.</p></div></div></div>
      <div class="card"><h2>Bioavailability radar</h2><div class="row">${radarSVG(r.radar)}
        <p class="muted-note" style="flex:1;min-width:150px">The pink band is the drug-like range for lipophilicity, size, polarity, solubility, saturation (fraction of sp³ carbons ${r.d.FractionCSP3.toFixed(2)}) and flexibility. The cyan outline is your molecule.</p></div></div>
      <div class="card"><h2>Structural alerts <span class="h2-note">${r.alerts.length ? `${r.alerts.length} found` : 'none'}</span></h2>
        ${r.alerts.length ? `<table class="tt"><tbody>${r.alerts.map((a, i) => `<tr data-a="${i}"><td><b>${esc(a.name)}</b></td><td class="small">${esc(a.why)}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No PAINS-type or reactive groups from the built-in list.</p>'}
        <p class="muted-note">A simplified subset of published filters; hover a row to see the atoms. Many real drugs contain an alert (aspirin is an ester, many antibiotics are reactive by design).</p></div>`;
    el.querySelectorAll('tr[data-a]').forEach((tr) => tr.addEventListener('mouseenter', () => StudioTools.highlight({ atoms: r.alerts[tr.dataset.a].atoms, color: '248,113,113' })));
    el.querySelectorAll('table').forEach((tb) => tb.addEventListener('mouseleave', () => StudioTools.clearHighlight()));
  }

  StudioTools.add({ id: 'drug', icon: '💊', title: 'Drug-likeness & ADME', short: 'Drug-like', render, hide: () => StudioTools.clearHighlight() });
  return { compute };
})();
