/* ============================================================================
   ChemSim · bulk/trends.js
   ----------------------------------------------------------------------------
   Property trend dashboard: how chain length and functional groups change
   boiling point, melting point, density, viscosity, surface tension and
   water solubility across homologous series.

   Data: CRC Handbook of Chemistry and Physics / NIST Chemistry WebBook
   (boiling points at 1 atm; density and surface tension at 20 °C; viscosity at
   25 °C; solubility in g per 100 g water at 20–25 °C). Values marked ≈ in the
   tooltip are less certain (estimated or measured just above the melting
   point). Properties of liquids are only given where the compound is liquid.
   ============================================================================ */
'use strict';

const Trends = (() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // per series: names, and arrays indexed by carbon number − 1 (null = not applicable / not liquid)
  const SERIES = {
    alkanes: {
      label: 'n-Alkanes CₙH₂ₙ₊₂', color: '#22d3ee', start: 1,
      names: ['methane', 'ethane', 'propane', 'butane', 'pentane', 'hexane', 'heptane', 'octane', 'nonane', 'decane', 'undecane', 'dodecane', 'tridecane', 'tetradecane', 'pentadecane', 'hexadecane', 'heptadecane', 'octadecane', 'nonadecane', 'eicosane'],
      bp: [-161.5, -88.6, -42.1, -0.5, 36.1, 68.7, 98.4, 125.7, 150.8, 174.1, 195.9, 216.3, 235.4, 253.5, 270.6, 286.8, 302.0, 316.3, 329.9, 343.0],
      mp: [-182.5, -182.8, -187.6, -138.3, -129.7, -95.3, -90.6, -56.8, -53.5, -29.7, -25.6, -9.6, -5.4, 5.9, 9.9, 18.2, 22.0, 28.2, 32.1, 36.8],
      density: [null, null, null, null, 0.626, 0.659, 0.684, 0.703, 0.718, 0.730, 0.740, 0.749, 0.756, 0.763, 0.769, 0.773, 0.777, null, null, null],
      viscosity: [null, null, null, null, 0.224, 0.300, 0.387, 0.508, 0.665, 0.838, 1.098, 1.383, 1.724, 2.128, 2.570, 3.032, 3.50, null, null, null],
      tension: [null, null, null, null, 16.0, 18.4, 20.1, 21.6, 22.9, 23.8, 24.7, 25.4, 25.9, 26.6, 27.1, 27.5, 27.9, null, null, null],
      solubility: [0.0023, 0.0060, 0.0062, 0.0061, 0.0038, 0.0010, 0.0003, 0.00007, null, null, null, null, null, null, null, null, null, null, null, null],
      approx: { 'viscosity:17': 1, 'tension:17': 1 },
    },
    alcohols: {
      label: '1-Alkanols CₙH₂ₙ₊₁OH', color: '#f472b6', start: 1,
      names: ['methanol', 'ethanol', 'propan-1-ol', 'butan-1-ol', 'pentan-1-ol', 'hexan-1-ol', 'heptan-1-ol', 'octan-1-ol', 'nonan-1-ol', 'decan-1-ol'],
      bp: [64.7, 78.3, 97.2, 117.7, 138.0, 157.6, 176.4, 195.2, 213.4, 231.1],
      mp: [-97.6, -114.1, -126.2, -88.6, -78.2, -44.6, -34.0, -15.5, -5.5, 6.4],
      density: [0.791, 0.789, 0.803, 0.810, 0.815, 0.819, 0.822, 0.826, 0.828, 0.830],
      viscosity: [0.544, 1.074, 1.945, 2.544, 3.619, 4.578, 5.810, 7.288, 9.1, 10.9],
      tension: [22.5, 22.3, 23.7, 24.6, 25.4, 25.8, 26.4, 27.1, 27.6, 28.5],
      solubility: [Infinity, Infinity, Infinity, 7.7, 2.2, 0.59, 0.17, 0.054, 0.014, 0.0037],
      approx: { 'viscosity:9': 1, 'viscosity:10': 1, 'tension:9': 1, 'tension:10': 1, 'tension:5': 1, 'tension:7': 1 },
    },
    acids: {
      label: 'Carboxylic acids Cₙ₋₁H₂ₙ₋₁COOH', color: '#fbbf24', start: 1,
      names: ['methanoic', 'ethanoic', 'propanoic', 'butanoic', 'pentanoic', 'hexanoic', 'heptanoic', 'octanoic', 'nonanoic', 'decanoic'],
      bp: [100.8, 117.9, 141.2, 163.8, 186.1, 205.8, 223.0, 239.7, 254.5, 268.7],
      mp: [8.3, 16.6, -20.7, -5.1, -34.0, -3.4, -7.5, 16.5, 12.5, 31.4],
      density: [1.220, 1.049, 0.993, 0.958, 0.939, 0.929, 0.918, 0.910, 0.906, null],
      viscosity: [1.607, 1.056, 1.030, 1.426, 1.97, 2.81, 3.84, 5.02, 7.0, null],
      tension: [37.7, 27.6, 26.7, 26.6, 27.3, 28.0, 28.3, 28.8, 29.6, null],
      solubility: [Infinity, Infinity, Infinity, Infinity, 4.97, 1.03, 0.24, 0.068, 0.028, 0.015],
      approx: { 'viscosity:5': 1, 'viscosity:6': 1, 'viscosity:7': 1, 'viscosity:8': 1, 'viscosity:9': 1, 'tension:5': 1, 'tension:6': 1, 'tension:7': 1, 'tension:8': 1, 'tension:9': 1 },
    },
    aldehydes: {
      label: 'Aldehydes Cₙ₋₁H₂ₙ₋₁CHO', color: '#a78bfa', start: 1,
      names: ['methanal', 'ethanal', 'propanal', 'butanal', 'pentanal', 'hexanal', 'heptanal', 'octanal'],
      bp: [-19.1, 20.2, 48.0, 74.8, 103.0, 131.0, 152.8, 171.0],
      mp: [-92.0, -123.4, -80.0, -96.9, -91.5, -56.3, -43.3, 12.0],
      density: [null, 0.785, 0.805, 0.802, 0.810, 0.814, 0.818, 0.821],
      viscosity: [null, 0.21, 0.32, 0.42, 0.55, 0.68, 0.82, 1.0],
      tension: [null, 21.2, 23.8, 24.6, 25.4, 26.2, 26.9, 27.4],
      solubility: [Infinity, Infinity, 30.6, 7.1, 1.17, 0.56, 0.12, 0.056],
      approx: { 'viscosity:2': 1, 'viscosity:3': 1, 'viscosity:4': 1, 'viscosity:5': 1, 'viscosity:6': 1, 'viscosity:7': 1, 'viscosity:8': 1, 'tension:5': 1, 'tension:6': 1, 'tension:7': 1, 'tension:8': 1, 'mp:8': 1 },
    },
  };
  const PROPS = {
    bp: { label: 'Boiling point / °C', why: 'More carbons → more surface area and electrons → stronger London (dispersion) forces → higher boiling point (roughly +20–30 °C per CH₂). Alcohols and acids boil much higher than alkanes of the same size because of hydrogen bonds; acids even form H-bonded pairs (dimers).' },
    mp: { label: 'Melting point / °C', why: 'Melting depends on how well molecules pack in a crystal, not only on attractions. Notice the zig-zag (odd–even effect) in alkanes and acids: even-numbered chains pack better.' },
    density: { label: 'Density of the liquid / g cm⁻³', why: 'Alkanes are all less dense than water (they float). Density rises with chain length as the loose chain ends become a smaller fraction of the liquid. Small acids are dense because of their heavy, closely packed COOH groups.' },
    viscosity: { label: 'Viscosity / mPa·s', why: 'Longer chains tangle and attract each other more, so they flow more slowly. Hydrogen bonding makes alcohols several times more viscous than alkanes of the same length.' },
    tension: { label: 'Surface tension / mN m⁻¹', why: 'Surface tension measures how strongly molecules at the surface are pulled inwards. It rises slowly with chain length. Water (72.8 mN/m) is far higher than any of these because of its hydrogen-bond network.' },
    solubility: { label: 'Solubility in water / g per 100 g (log scale)', why: 'The polar head (OH, COOH, CHO) can hydrogen-bond to water, but each extra CH₂ adds a non-polar part that water must arrange itself around. Small members mix completely ("miscible", drawn at the top); solubility then drops about 3–4 times for each extra carbon.', log: true },
  };
  // comparisons at similar size
  const COMPARE = [
    { title: 'Branching lowers the boiling point (all C₅H₁₂, M = 72)', rows: [['pentane', 'CCCCC', 36.1], ['2-methylbutane', 'CCC(C)C', 27.8], ['2,2-dimethylpropane', 'CC(C)(C)C', 9.5]], note: 'A compact, branched molecule has less surface in contact with its neighbours, so weaker London forces.' },
    { title: 'Functional groups at similar molar mass (M ≈ 58–60)', rows: [['butane (M 58)', 'CCCC', -0.5], ['methoxyethane (60)', 'COCC', 7.4], ['propanal (58)', 'CCC=O', 48.0], ['propanone (58)', 'CC(C)=O', 56.0], ['propan-1-ol (60)', 'CCCO', 97.2], ['ethanoic acid (60)', 'CC(=O)O', 117.9]], note: 'Non-polar < polar (dipole–dipole) < hydrogen-bonded. The acid is highest: two hydrogen bonds hold each pair of molecules together.' },
    { title: 'Hydrogen bonding in small hydrides', rows: [['methane CH₄', 'C', -161.5], ['ammonia NH₃', 'N', -33.3], ['hydrogen fluoride HF', 'F', 19.5], ['water H₂O', 'O', 100.0], ['hydrogen sulfide H₂S', 'S', -60.3]], note: 'Water boils about 160 °C higher than H₂S, its heavier relative: hydrogen bonds, and each water molecule can make up to four of them.' },
  ];

  let el = null, prop = 'bp', on = new Set(['alkanes', 'alcohols', 'acids']), xMode = 'carbons';
  const MW = { alkanes: (n) => 14.027 * n + 2.016, alcohols: (n) => 14.027 * n + 18.015, acids: (n) => 14.027 * n + 31.999, aldehydes: (n) => 14.027 * n + 15.999 };

  function series(key, p) {
    const s = SERIES[key];
    return s[p].map((v, i) => (v === null || v === undefined ? null : [xMode === 'carbons' ? i + 1 : MW[key](i + 1), p === 'solubility' ? (v === Infinity ? 3 : Math.log10(v)) : v, i])).filter(Boolean);
  }

  function mount(container) {
    el = container;
    el.innerHTML = `
      <div class="trend-wrap">
        <div class="card"><div class="row">
          <div class="seg trend-props">${Object.entries(PROPS).map(([k, p]) => `<button class="seg-b${k === prop ? ' active' : ''}" data-p="${k}">${p.label.split(' /')[0].split(' (')[0]}</button>`).join('')}</div></div>
          <div class="row">${Object.entries(SERIES).map(([k, s]) => `<label class="chip"><input type="checkbox" data-s="${k}"${on.has(k) ? ' checked' : ''}/> <span style="color:${s.color}">■</span> ${s.label}</label>`).join('')}
            <label class="ctl">x-axis <select id="tr-x"><option value="carbons">number of carbons</option><option value="mass">molar mass</option></select></label></div>
          <canvas id="tr-plot" class="plot trend-plot"></canvas>
          <div class="small" id="tr-hover">Hover over a point for the compound and value.</div>
          <p class="small" id="tr-why"></p></div>
        <div class="trend-compare">${COMPARE.map((cmp) => `<div class="card"><h2 style="text-transform:none;letter-spacing:0;color:var(--text);font-size:13px">${esc(cmp.title)}</h2>
          <table class="tt"><tbody>${cmp.rows.map(([n, smi, bp]) => `<tr><td>${esc(n)}</td><td class="mono">${smi}</td><td class="mono" style="text-align:right">${bp.toFixed(1)} °C</td><td><div class="bpbar" style="width:${Math.max(4, ((bp + 170) / 300) * 100)}%"></div></td></tr>`).join('')}</tbody></table>
          <p class="muted-note">${esc(cmp.note)}</p></div>`).join('')}</div>
        <p class="muted-note">Data: CRC Handbook of Chemistry and Physics and the NIST Chemistry WebBook (boiling points at 1 atm; densities and surface tensions at 20 °C; viscosities at 25 °C). Liquid properties are shown only where the compound is a liquid at that temperature.</p>
      </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { prop = b.dataset.p; el.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('active', x === b)); draw(); }));
    el.querySelectorAll('[data-s]').forEach((c) => c.addEventListener('change', () => { if (c.checked) on.add(c.dataset.s); else on.delete(c.dataset.s); draw(); }));
    el.querySelector('#tr-x').addEventListener('change', (e) => { xMode = e.target.value; draw(); });
    const cvs = el.querySelector('#tr-plot');
    cvs.addEventListener('mousemove', (e) => hover(e));
    draw();
    window.addEventListener('resize', draw);
  }
  function unmount() { window.removeEventListener('resize', draw); el = null; }

  let geo = null;
  function draw() {
    if (!el) return;
    const P = PROPS[prop];
    const ser = [...on].map((k) => ({ pts: series(k, prop).map(([x, y]) => [x, y]), color: SERIES[k].color, width: 2, label: SERIES[k].label.split(' ')[0] + ' ' + SERIES[k].label.split(' ')[1] }));
    ser.forEach((s) => { s.line = true; s.dots = true; s.r = 3.5; });
    geo = LabPlot.draw(el.querySelector('#tr-plot'), { x: { label: xMode === 'carbons' ? 'number of carbon atoms' : 'molar mass / g mol⁻¹' }, y: { label: P.label }, series: ser, legendLeft: true,
      hlines: prop === 'bp' ? [{ y: 25, color: '#475569', label: 'room temperature' }] : prop === 'density' ? [{ y: 0.998, color: '#3b82f6', label: 'water' }] : prop === 'solubility' ? [{ y: 3, color: '#475569', label: 'miscible' }] : [] });
    el.querySelector('#tr-why').textContent = P.why;
  }
  function hover(e) {
    if (!geo) return;
    const r = e.target.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 14;
    [...on].forEach((k) => series(k, prop).forEach(([x, y, i]) => {
      const d = Math.hypot(geo.X(x) - mx, geo.Y(y) - my);
      if (d < bd) { bd = d; best = { k, i, y }; }
    }));
    const box = el.querySelector('#tr-hover');
    if (!best) { box.textContent = 'Hover over a point for the compound and value.'; return; }
    const s = SERIES[best.k], raw = s[prop][best.i];
    const unit = PROPS[prop].label.split('/ ')[1] || '';
    const approx = s.approx && s.approx[`${prop}:${best.i + 1}`] ? '≈ ' : '';
    box.innerHTML = `<b>${esc(s.names[best.i])}</b> (${best.i + 1} C, M = ${MW[best.k](best.i + 1).toFixed(1)}): ${raw === Infinity ? 'miscible in all proportions' : `${approx}${raw} ${prop === 'solubility' ? 'g / 100 g water' : unit}`}`;
  }

  BulkHub.add({ id: 'trends', icon: '📊', title: 'Property trends', mount, unmount });
  return { SERIES, PROPS, COMPARE };
})();
