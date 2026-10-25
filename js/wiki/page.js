/* ============================================================================
   ChemSim · wiki/page.js
   ----------------------------------------------------------------------------
   The full-screen page for one element. Sections:
     Overview · Discovery & history · Abundance & production · Atomic
     properties · Physical properties & crystal · Spectrum & flame ·
     Reactions · Isotopes · Safety
   Data comes from data/elements.json (numbers) and data/wiki/*.json (the
   written articles). The URL becomes #wiki/Na so pages can be bookmarked.
   ============================================================================ */
'use strict';

const WikiPage = (() => {
  let overlay = null;
  let current = null;
  let stopCrystal = null;

  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const supNum = (n) => String(n).split('').map((d) => SUP[d] || d).join('');
  /** "[Ne] 3s1" → "[Ne] 3s¹" */
  // A leading * in the source data marks a predicted configuration.
  const prettyConfig = (s) => {
    const predicted = /^\*/.test(s || '');
    const t = (s || '').replace(/^\*/, '').replace(/([spdf])(\d+)/g, (_, l, n) => l + supNum(n));
    return predicted ? `${t} <span class="tag warn small">predicted</span>` : t;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Articles may use **bold** and blank lines between paragraphs. */
  const md = (s) => (s ? esc(s).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>')}</p>`).join('') : '');
  const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
  const ox = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'el-page hidden';
    overlay.id = 'el-page';
    document.getElementById('view-wiki').appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-goto]');
      if (nav) { open(nav.dataset.goto); return; }
      if (e.target.closest('[data-close]')) close();
      const jump = e.target.closest('[data-jump]');
      if (jump) overlay.querySelector('#sec-' + jump.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.addEventListener('keydown', (e) => {
      if (!current || !ChemRouter.isActive('wiki')) return;
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && current.z < 118) open(WikiData.byZ(current.z + 1).sym);
      if (e.key === 'ArrowLeft' && current.z > 1) open(WikiData.byZ(current.z - 1).sym);
    });
    return overlay;
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    if (stopCrystal) stopCrystal();
    WikiReactions.stopAll();
    current = null;
    if (location.hash.startsWith('#wiki/')) history.replaceState(null, '', '#wiki');
    log('wiki', 'Closed element page');
  }

  function open(sym) {
    const e = WikiData.get(sym);
    if (!e) { warn('wiki', 'No such element', sym); return; }
    ensureOverlay();
    if (stopCrystal) stopCrystal();
    WikiReactions.stopAll();
    current = e;
    const art = WikiData.article(sym) || {};
    const cat = WikiData.CATEGORIES[e.category];
    log('wiki', `Opening page for ${e.name} (Z=${e.z})`, { article: !!WikiData.article(sym) });

    const sections = [
      ['overview', 'Overview'], ['history', 'Discovery & history'], ['abundance', 'Abundance & production'],
      ['atomic', 'Atomic properties'], ['physical', 'Physical properties'], ['spectrum', 'Spectrum & flame'],
      ['reactions', 'Reactions'], ['isotopes', 'Isotopes'], ['safety', 'Safety'],
    ];
    const prev = e.z > 1 ? WikiData.byZ(e.z - 1) : null, next = e.z < 118 ? WikiData.byZ(e.z + 1) : null;

    overlay.innerHTML = `
      <div class="el-head" style="--cat:${cat.color}">
        <div class="el-tile">
          <span class="z">${e.z}</span><span class="sym">${e.sym}</span><span class="m">${num(e.mass, 3)}</span>
        </div>
        <div class="el-title">
          <h2>${e.name}</h2>
          <div class="el-tags">
            <span class="tag" style="border-color:${cat.color};color:${cat.color}">${cat.label.replace(/s$/, '')}</span>
            ${e.group ? `<span class="tag">Group ${e.group}</span>` : ''}<span class="tag">Period ${e.period}</span>
            <span class="tag">${(e.block || '?').toUpperCase()}-block</span>
            ${e.phase ? `<span class="tag">${e.phase} at 25 °C${e.predictedBulk ? ' (predicted)' : ''}</span>` : ''}
            ${e.radioactive ? '<span class="tag warn">☢ radioactive</span>' : ''}
          </div>
          <p class="el-config">${prettyConfig(e.configShort)}</p>
        </div>
        <div class="el-nav">
          <button class="hbtn small" ${prev ? `data-goto="${prev.sym}"` : 'disabled'} data-tip="Previous element (←)">← ${prev ? prev.sym : ''}</button>
          <button class="hbtn small" ${next ? `data-goto="${next.sym}"` : 'disabled'} data-tip="Next element (→)">${next ? next.sym : ''} →</button>
          <button class="hbtn small" data-close data-tip="Back to the table (Esc)">✕ Table</button>
        </div>
      </div>
      <nav class="el-toc">${sections.map(([id, t]) => `<button data-jump="${id}">${t}</button>`).join('')}</nav>
      <div class="el-body">
        ${e.predictedBulk ? `<div class="issue warn"><b>Mostly predicted.</b> ${e.z >= 100 ? 'Only a handful of atoms of this element have ever been made, and they decay within seconds or less.' : 'This element is so intensely radioactive that a visible sample has never existed.'} Bulk properties such as melting point, density and crystal structure are <b>theoretical predictions</b>, not measurements.</div>` : ''}
        ${secOverview(e, art)}
        ${secHistory(e, art)}
        ${secAbundance(e, art)}
        ${secAtomic(e)}
        ${secPhysical(e)}
        ${secSpectrum(e)}
        ${secReactions(e, art)}
        ${secIsotopes(e)}
        ${secSafety(e, art)}
        <p class="dim small attribution">Data: mendeleev (MIT), NIST Atomic Spectra Database, Periodic-Table-JSON / Wikipedia (CC BY-SA 3.0). ${art.history ? 'Article text written for ChemSim; a draft, so please report mistakes.' : ''} See data/SOURCES.md.</p>
      </div>`;
    overlay.classList.remove('hidden');
    overlay.scrollTop = 0;
    if (location.hash !== '#wiki/' + sym) history.replaceState(null, '', '#wiki/' + sym);

    // interactive pieces
    drawIEChart(overlay.querySelector('#ie-chart'), e);
    drawShells(overlay.querySelector('#shell-canvas'), e);
    const cc = overlay.querySelector('#crystal-canvas');
    if (cc && e.crystal) stopCrystal = Crystal.mount(cc, e.crystal.code, cat.color);
    setupSpectrum(e);
    WikiReactions.mountAll(overlay, e);
  }

  /* ---------------- sections ---------------- */
  const section = (id, title, body) => `<section class="el-sec" id="sec-${id}"><h3>${title}</h3>${body}</section>`;
  const facts = (rows) => `<dl class="facts">${rows.filter((r) => r && r[1] != null && r[1] !== '' && r[1] !== '—').map(([k, v, tip]) => `<div${tip ? ` data-tip="${esc(tip)}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  function secOverview(e, art) {
    const body = art.overview ? md(art.overview) : (e.description ? `<p>${esc(e.description)}</p>` : '');
    const summary = e.summary && !art.overview ? `<blockquote class="wiki-quote">${esc(e.summary)}<br/><a href="${e.wiki}" target="_blank" rel="noopener">Wikipedia ↗</a> <span class="dim small">(CC BY-SA 3.0)</span></blockquote>` : '';
    return section('overview', 'Overview', `
      ${body}${summary}
      ${facts([
        ['Appearance', esc(e.appearance)],
        ['Name origin', esc(e.nameOrigin)],
        ['Uses', esc(art.uses || e.uses)],
      ])}`);
  }

  function secHistory(e, art) {
    const d = e.discovery;
    const when = d.ancient ? 'Known since antiquity' : d.year ? String(d.year) : '—';
    return section('history', 'Discovery &amp; history', `
      ${facts([['Discovered', when], ['By', esc(d.by && !d.ancient ? d.by : null)], ['Where', esc(d.where)]])}
      ${md(art.history) || '<p class="dim">No history article yet.</p>'}`);
  }

  function secAbundance(e, art) {
    const crust = e.abundance.crust, sea = e.abundance.sea;
    const ppm = (v) => (v == null ? null : v >= 1 ? `${num(v, 1)} ppm (mg/kg)` : `${Number(v).toExponential(1)} ppm`);
    const gold = { lithophile: 'Lithophile: "rock-loving", concentrates in silicate rocks', siderophile: 'Siderophile: "iron-loving", sank into the metallic core', chalcophile: 'Chalcophile: "ore-loving", forms sulfide minerals', atmophile: 'Atmophile: volatile, found in the atmosphere and oceans', synthetic: 'Synthetic: made in reactors or accelerators' };
    return section('abundance', 'Abundance &amp; production', `
      ${facts([
        ["Earth's crust", ppm(crust), 'Mass fraction in the continental crust'],
        ['Seawater', sea == null ? null : `${sea >= 1 ? num(sea, 1) : Number(sea).toExponential(1)} mg/L`],
        ['Geochemical class', e.goldschmidt ? esc(gold[e.goldschmidt] || e.goldschmidt) : null],
      ])}
      ${crust != null ? abundanceBar(crust) : ''}
      ${md(art.production) || (e.production ? `<p>${esc(e.production)}</p>` : '')}`);
  }

  /** Log-scale bar from 10⁻⁶ ppm to 10⁶ ppm (100 %). */
  function abundanceBar(ppm) {
    const t = Math.max(0, Math.min(1, (Math.log10(Math.max(ppm, 1e-6)) + 6) / 12));
    return `<div class="abund"><div class="abund-bar"><i style="left:${t * 100}%"></i></div>
      <div class="abund-scale"><span>10⁻⁶ ppm</span><span>1 ppm</span><span>1 %</span><span>100 %</span></div></div>`;
  }

  function secAtomic(e) {
    const r = e.radius;
    const radiusRows = [['Atomic (calculated)', r.calculated], ['Atomic (empirical)', r.empirical], ['Covalent', r.covalent], ['van der Waals', r.vdw], ['Metallic', r.metallic]]
      .filter(([, v]) => v).map(([k, v]) => [k, `${v} pm`]);
    const oxMain = e.ox.main.map((o) => `<span class="ox-chip main">${ox(o)}</span>`).join('');
    const oxOther = e.ox.other.map((o) => `<span class="ox-chip">${ox(o)}</span>`).join('');
    return section('atomic', 'Atomic properties', `
      <div class="two-col">
        <div>
          ${facts([
            ['Electron configuration', prettyConfig(e.config)],
            ['Shorthand', prettyConfig(e.configShort)],
            ['Electrons per shell', (e.shells || []).join(', ')],
            ['Electronegativity', e.en == null ? 'not defined' : `${e.en} (Pauling)`],
            ['Electron affinity', e.ea == null ? null : `${num(e.ea, 1)} kJ/mol`, 'Energy released when a gas-phase atom gains one electron'],
            ['1st ionization energy', e.ie[0] ? `${num(e.ie[0], 1)} kJ/mol` : null],
            ...radiusRows,
          ])}
          <h4>Oxidation states</h4>
          <div class="ox-row">${oxMain || '<span class="dim">—</span>'} ${oxOther ? `<span class="dim small">less common:</span> ${oxOther}` : ''}</div>
        </div>
        <div>
          <h4>Valence orbital diagram</h4>
          ${orbitalBoxes(e)}
          <h4>Shell model</h4>
          <canvas id="shell-canvas" class="shell-canvas"></canvas>
        </div>
      </div>
      <h4>Successive ionization energies</h4>
      ${e.ie.length ? `<canvas id="ie-chart" class="ie-chart"></canvas><p class="dim small">Log scale. A huge jump means the next electron comes from a full inner shell; count the electrons before the jump to find the number of valence electrons.${e.ieCalcFrom != null ? ` Faded bars (from electron ${e.ieCalcFrom + 1}) are calculated values, not measurements.` : ''}</p>` : '<p class="dim">No measured ionization energies.</p>'}`);
  }

  /** Orbital boxes for the subshells outside the noble-gas core, filled by Hund's rule. */
  function orbitalBoxes(e) {
    const short = (e.configShort || e.config || '').replace(/^\*/, '');
    const core = (short.match(/^\[(\w+)\]/) || [])[1];
    const subs = [...short.matchAll(/(\d)([spdf])(\d+)/g)].map((m) => ({ n: m[1], l: m[2], e: Number(m[3]) }));
    if (!subs.length) return '<p class="dim">—</p>';
    const nOrb = { s: 1, p: 3, d: 5, f: 7 };
    const html = subs.map((s) => {
      const k = nOrb[s.l];
      const boxes = Array.from({ length: k }, (_, i) => {
        const up = s.e > i ? '↑' : '';
        const down = s.e > k + i ? '↓' : '';
        return `<span class="obox">${up}${down}</span>`;
      }).join('');
      return `<div class="osub"><div class="oboxes">${boxes}</div><div class="olabel">${s.n}${s.l}${supNum(s.e)}</div></div>`;
    }).join('');
    return `<div class="orbitals">${core ? `<div class="osub core"><div class="ocore">[${core}]</div><div class="olabel">core</div></div>` : ''}${html}</div>
      <p class="dim small">Hund's rule: electrons spread out over a subshell's orbitals with parallel spins before they pair up.</p>`;
  }

  function secPhysical(e) {
    const K = (v) => (v == null ? null : `${num(v, 2)} K (${num(v - 273.15, 1)} °C)`);
    const pred = e.predictedBulk ? ' <span class="tag warn small">predicted</span>' : '';
    const ci = e.crystal ? Crystal.INFO[e.crystal.code] || {} : null;
    return section('physical', 'Physical properties', `
      <div class="two-col">
        <div>
          ${facts([
            ['Melting point', e.mp == null ? null : K(e.mp) + pred],
            [e.sublimes ? 'Sublimes at' : 'Boiling point', e.bp == null ? null : K(e.bp) + pred],
            ['Density', e.density == null ? null : `${num(e.density, 4)} g/cm³${pred}`],
            ['Molar heat capacity', e.molarHeat == null ? null : `${num(e.molarHeat, 2)} J/(mol·K)`],
            ['Thermal conductivity', e.thermalConductivity == null ? null : `${num(e.thermalConductivity, 1)} W/(m·K)`],
            ['Crystal structure', e.crystal ? esc(e.crystal.name) + pred : null],
            ['Lattice constant a', e.crystal && e.crystal.a ? `${e.crystal.a} Å (${num(e.crystal.a * 100, 0)} pm)` : null],
            ['Coordination number', ci && ci.cn ? `${ci.cn} nearest neighbours` : null],
            ['Packing efficiency', ci && ci.packing ? `${ci.packing} % of space filled` : null],
          ])}
        </div>
        <div>
          ${e.crystal ? `<canvas id="crystal-canvas" class="crystal-canvas" data-tip="Drag to rotate"></canvas>
            <p class="small"><b>${esc(ci.name || e.crystal.name)}.</b> ${esc(ci.note || '')}</p>
            <p class="dim small">Colours: corner atoms in the element's colour${['FCC', 'DIA', 'HEX'].includes(e.crystal.code) ? ', face atoms gold' : ''}${['BCC', 'DIA', 'HEX'].includes(e.crystal.code) ? ', inner atoms pink' : ''}.</p>` : '<p class="dim">No crystal structure data.</p>'}
        </div>
      </div>`);
  }

  function secSpectrum(e) {
    const f = WikiData.FLAME[e.sym];
    const glow = Spectrum.glowColor(e.lines);
    const glowCss = glow ? Spectrum.css(glow) : null;
    return section('spectrum', 'Spectrum &amp; flame', `
      ${e.lines && e.lines.length ? `
        <div class="spec-controls">
          <div class="segmented"><button class="seg active" data-spec="emission">Emission</button><button class="seg" data-spec="absorption">Absorption</button></div>
          <span class="dim small" id="spec-readout">Hover the spectrum to read wavelengths.</span>
        </div>
        <canvas id="spec-canvas" class="spec-canvas"></canvas>
        <p class="dim small">The ${e.lines.length} strongest visible lines of neutral ${e.name} (${e.sym} I) from the NIST Atomic Spectra Database. Each element's lines are as unique as a fingerprint, which is how astronomers know what stars are made of.</p>
        <div class="glow-row">
          <div class="discharge" style="--glow:${glowCss}"><div class="tube"></div></div>
          <p class="small"><b>Glow colour (estimated):</b> what the mix of these lines looks like to the eye, for example in a gas-discharge tube. Calculated with the CIE 1931 colour-matching functions; real tubes also depend on pressure and the ions present.</p>
        </div>` : '<p class="dim">No visible emission lines in the NIST data for this element.</p>'}
      <h4>Flame test</h4>
      ${f ? `<div class="flame-row">
          <div class="flame-box"><canvas class="flame-canvas" data-flame="${f.color}"></canvas></div>
          <div><p><b style="color:${f.color}">${esc(f.name)}</b></p><p class="small">${esc(f.note)}</p>
          <p class="dim small">A flame test works because heat excites electrons to higher levels. When they fall back they emit light only at the element's characteristic wavelengths.</p></div>
        </div>` : '<p class="dim">This element has no characteristic flame colour.</p>'}`);
  }

  function setupSpectrum(e) {
    const cv = overlay.querySelector('#spec-canvas');
    if (!cv) return;
    let mode = 'emission';
    const redraw = (hl) => Spectrum.draw(cv, e.lines, { mode, highlight: hl });
    let toNm = redraw();
    overlay.querySelectorAll('[data-spec]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.spec;
      overlay.querySelectorAll('[data-spec]').forEach((x) => x.classList.toggle('active', x === b));
      toNm = redraw();
    }));
    const readout = overlay.querySelector('#spec-readout');
    cv.addEventListener('mousemove', (ev) => {
      const r = cv.getBoundingClientRect();
      const nm = toNm(ev.clientX - r.left);
      const line = Spectrum.nearest(e.lines, nm, 3);
      readout.innerHTML = line ? `<b>${line[0].toFixed(2)} nm</b>, relative intensity ${(line[1] * 100).toFixed(1)} %` : `${nm.toFixed(0)} nm`;
    });
    overlay.querySelectorAll('.flame-canvas').forEach((c) => WikiReactions.flame(c, c.dataset.flame));
  }

  function secReactions(e, art) {
    const list = art.reactions || [];
    const cards = WikiReactions.cardsFor(e);
    if (!list.length && !cards.length) return section('reactions', 'Reactions', '<p class="dim">No reactions listed yet.</p>');
    return section('reactions', 'Reactions', `
      ${md(art.chemistry)}
      ${cards.map((c, i) => `<div class="rx-card anim" data-rx="${i}"><canvas class="rx-canvas"></canvas><div class="rx-text"><div class="rx-eq">${c.eq}</div><p class="small">${c.text}</p><button class="mini-btn" data-rx-play="${i}">▶ Replay</button></div></div>`).join('')}
      ${list.map((r) => `<div class="rx-card"><div class="rx-text"><div class="rx-eq">${esc(r.eq)}</div>${r.note ? `<p class="small">${esc(r.note)}</p>` : ''}</div></div>`).join('')}`);
  }

  function secIsotopes(e) {
    if (!e.isotopes.length) return section('isotopes', 'Isotopes', '<p class="dim">—</p>');
    const unitName = { zsec: 'zs', asec: 'as', fsec: 'fs', psec: 'ps', nsec: 'ns', usec: 'µs', msec: 'ms', sec: 's', minute: 'min', hour: 'h', day: 'd', year: 'years', kyear: 'thousand years', Myear: 'million years', Gyear: 'billion years', Tyear: '×10¹² years', Pyear: '×10¹⁵ years', Eyear: '×10¹⁸ years', Zyear: '×10²¹ years', Yyear: '×10²⁴ years' };
    const rows = e.isotopes.map((i) => `<tr>
      <td><sup>${i.A}</sup>${e.sym}</td><td>${i.mass ?? '—'}</td>
      <td>${i.abundance != null ? `${num(i.abundance, 4)} %` : '<span class="dim">trace / none</span>'}</td>
      <td>${i.halfLife ? `${num(i.halfLife, 3)} ${unitName[i.unit] || i.unit}` : '<span class="ok">stable</span>'}</td></tr>`).join('');
    return section('isotopes', 'Isotopes', `
      <table class="iso-table"><thead><tr><th>Isotope</th><th>Mass (u)</th><th>Natural abundance</th><th>Half-life</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="dim small">All isotopes with natural abundance, plus the longest-lived radioactive ones. The atomic weight (${num(e.mass, 4)}) is the abundance-weighted average of the natural isotopes.</p>`);
  }

  function secSafety(e, art) {
    return section('safety', 'Safety', md(art.safety) || `<p class="dim">${e.radioactive ? 'Radioactive: handled only in specialised facilities.' : 'No safety notes yet.'}</p>`);
  }

  /* ---------------- canvases ---------------- */
  function setupCanvas(cv) {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, W, H };
  }

  function drawIEChart(cv, e) {
    if (!cv || !e.ie.length) return;
    const { c, W, H } = setupCanvas(cv);
    const ies = e.ie.slice(0, 30);
    const L = 54, B = 22, T = 10, R = 8;
    const lo = Math.log10(Math.min(...ies)) - 0.5, hi = Math.log10(Math.max(...ies)) + 0.05;
    const bw = (W - L - R) / ies.length;
    const y = (v) => T + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - T - B);
    // biggest jump marks the first core electron
    let jump = -1, best = 0;
    for (let i = 1; i < ies.length; i++) { const r = ies[i] / ies[i - 1]; if (r > best) { best = r; jump = i; } }
    c.font = '10px Inter, sans-serif';
    c.fillStyle = '#64748b';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let p = Math.ceil(lo); p <= hi; p++) {
      const v = Math.pow(10, p);
      c.fillRect(L - 3, y(v), W - L - R + 3, 0.5);
      c.fillText(v >= 1000 ? `${v / 1000}k` : v, L - 6, y(v));
    }
    const calcFrom = e.ieCalcFrom == null ? Infinity : e.ieCalcFrom;
    ies.forEach((v, i) => {
      const core = best > 1.8 && i >= jump;
      c.fillStyle = core ? '#f87171' : '#22d3ee';
      c.globalAlpha = i >= calcFrom ? 0.45 : 1;   // calculated, not measured
      const x = L + i * bw + 1;
      c.fillRect(x, y(v), Math.max(1, bw - 2), H - B - y(v));
      c.globalAlpha = 1;
      if (ies.length <= 30) { c.fillStyle = '#94a3b8'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(i + 1, x + bw / 2 - 1, H - B + 5); }
    });
    c.save(); c.translate(12, H / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillStyle = '#94a3b8'; c.fillText('kJ/mol', 0, 0); c.restore();
    if (best > 1.8) {
      c.fillStyle = '#fca5a5'; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(`×${best.toFixed(1)} jump after electron ${jump}: core electrons (red)`, L + 6, T);
    }
  }

  function drawShells(cv, e) {
    if (!cv || !e.shells) return;
    const { c, W, H } = setupCanvas(cv);
    const cx = W / 2, cy = H / 2, n = e.shells.length;
    const maxR = Math.min(W, H) / 2 - 8;
    c.fillStyle = WikiData.CATEGORIES[e.category].color;
    c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0b0f17'; c.font = '700 9px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${e.z}+`, cx, cy);
    e.shells.forEach((count, i) => {
      const r = 18 + ((maxR - 18) * (i + 1)) / n;
      c.strokeStyle = 'rgba(148,163,184,0.35)'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      const dot = count > 18 ? 1.6 : 2.4;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 - Math.PI / 2;
        c.fillStyle = i === n - 1 ? '#fbbf24' : '#e6edf3';
        c.beginPath(); c.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), dot, 0, Math.PI * 2); c.fill();
      }
    });
  }

  return { open, close, get current() { return current; } };
})();
