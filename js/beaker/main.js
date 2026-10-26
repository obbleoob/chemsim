/* ============================================================================
   ChemSim · beaker/main.js
   ----------------------------------------------------------------------------
   The Beaker Lab mode: builds the page (shelf · bench · readouts), wires the
   controls and runs the animation loop. The chemistry lives in sim.js /
   solver.js / data.js, the drawing in render.js.
   ============================================================================ */
'use strict';

(function () {
  const D = BeakerData;
  let root = null, running = false, lastFrame = 0, acc = 0;
  let speed = 1;
  let selected = null;
  let panelTimer = 0;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtC = (c) => (c >= 0.01 ? c.toFixed(3) : c.toExponential(1).replace('e-', '×10⁻').replace(/⁻(\d+)/, (_, d) => '⁻' + d.split('').map((x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[x]).join('')));

  function build() {
    root = document.getElementById('view-beaker');
    root.innerHTML = `
      <div class="beaker-layout">
        <aside class="panel shelf" aria-label="Chemical shelf">
          <input id="shelf-search" type="search" placeholder="Search chemicals…" spellcheck="false" />
          <div id="shelf-list" class="shelf-list"></div>
          <div class="shelf-add" id="shelf-add">
            <div class="shelf-sel" id="shelf-sel">Pick a chemical, then add it (or drag it onto the beaker).</div>
            <div class="input-row"><input id="shelf-amount" type="number" min="0" step="any" /><span id="shelf-unit">mL</span><button id="shelf-go" class="hbtn accent small">Add ▶</button></div>
          </div>
        </aside>
        <section class="bench">
          <div class="bench-bar">
            <label class="ctl" data-tip="Start again with a clean beaker of distilled water.">New beaker
              <select id="b-water"><option value="50">50 mL water</option><option value="100" selected>100 mL water</option><option value="200">200 mL water</option></select>
              <button id="b-reset" class="hbtn small">🔄</button></label>
            <label class="ctl" data-tip="Bunsen burner power. About half of it reaches the liquid.">🔥 Burner <input id="b-burner" type="range" min="0" max="1000" step="50" value="0" /> <span id="b-burner-v">off</span></label>
            <label class="chip"><input type="checkbox" id="b-ice" /> 🧊 Ice bath</label>
            <label class="chip"><input type="checkbox" id="b-stir" /> 🥄 Stir</label>
            <label class="ctl" data-tip="Run the simulation faster than real time.">⏩ <select id="b-speed"><option value="1">1×</option><option value="3">3×</option><option value="10">10×</option></select></label>
          </div>
          <div class="bench-stage">
            <canvas id="beaker-canvas" aria-label="Virtual beaker"></canvas>
            <div class="drop-hint hidden" id="drop-hint">Drop to add</div>
          </div>
          <div class="bench-tests">
            <span class="dim small">Tests:</span>
            <button class="hbtn small" data-test="lit" data-tip="Hold a burning splint at the mouth of the beaker. H₂ pops; CO₂ puts it out.">🔥 Lit splint</button>
            <button class="hbtn small" data-test="glow" data-tip="A glowing splint relights in oxygen.">✨ Glowing splint</button>
            <button class="hbtn small" data-test="lime" data-tip="Bubble the gas through limewater: milky = CO₂.">🥛 Limewater</button>
            <button class="hbtn small" data-test="litmus" data-tip="Hold damp litmus paper in the gas: ammonia turns red litmus blue, chlorine bleaches it.">📄 Damp litmus</button>
            <button class="hbtn small" data-test="flame" data-tip="Dip a clean wire loop in the solution and hold it in a flame.">🔥 Flame test</button>
            <label class="chip small" data-tip="Cobalt-blue glass filters out sodium’s yellow so you can see other colours."><input type="checkbox" id="b-cobalt" /> cobalt glass</label>
            <span id="test-result" class="test-result"></span>
          </div>
        </section>
        <aside class="panel readouts" aria-label="Measurements">
          <div class="card big-reads">
            <div class="read"><div class="k" data-tip="pH meter reading of the solution">pH</div><div class="v" id="r-ph">7.00</div><div class="ph-bar"><i id="r-ph-mark"></i></div></div>
            <div class="read"><div class="k">Temperature</div><div class="v" id="r-T">20.0 °C</div></div>
            <div class="read"><div class="k">Volume</div><div class="v" id="r-V">100 mL</div></div>
          </div>
          <div class="card"><h2>Dissolved species <span class="h2-note">mol/L</span></h2><table class="sp-table"><tbody id="r-species"></tbody></table></div>
          <div class="card"><h2>Solids</h2><div id="r-solids" class="small">—</div></div>
          <div class="card"><h2>Gas above the liquid</h2><div id="r-gas" class="small">—</div></div>
          <div class="card notebook"><h2>Lab notebook <button id="r-clearlog" class="mini" data-tip="Clear the notebook">🗑</button></h2><div id="r-log" class="log"></div></div>
          <p class="dim small model-note">Model: ideal solutions (concentrations, not activities), equilibrium constants at 25 °C except Kw, heats from standard enthalpies of formation. Expect textbook-level accuracy.</p>
        </aside>
      </div>`;

    buildShelf();
    BeakerRender.mount(root.querySelector('#beaker-canvas'));
    wire();
    BeakerSim.reset({ waterML: 100 });
    BeakerSim.onEvent = (e) => addLogEntry(e);
    log('beaker', 'Beaker Lab ready');
  }

  function buildShelf(filter = '') {
    const list = root.querySelector('#shelf-list');
    const q = filter.toLowerCase();
    let html = '', groupOpen = false;
    D.SHELF.forEach((item) => {
      if (item.group) {
        if (groupOpen) html += '</div>';
        html += `<div class="shelf-group"><h3>${item.group}</h3>`;
        groupOpen = true;
        return;
      }
      const sol = item.kind === 'soluble' ? D.SOLUBLE[item.key] : null;
      const formula = item.formula || (sol && sol.label) || '';
      if (q && !(`${item.name} ${formula}`.toLowerCase().includes(q))) return;
      const hz = (item.hazards || []).map((h) => `<span title="${D.HAZARDS[h].label}">${D.HAZARDS[h].icon}</span>`).join('');
      const tip = [(item.hazards || []).map((h) => D.HAZARDS[h].label).join(', '), item.note].filter(Boolean).join('. ');
      html += `<button class="shelf-item${selected && selected.id === item.id ? ' active' : ''}" draggable="true" data-id="${item.id}"${tip ? ` data-tip="${esc(tip)}"` : ''}>
        <span class="si-name">${esc(item.name)}</span><span class="si-f">${esc(formula)}</span><span class="si-hz">${hz}</span></button>`;
    });
    if (groupOpen) html += '</div>';
    list.innerHTML = html;
  }

  const unitOf = (item) => (item.unit === 'drops' ? 'drops' : item.kind === 'solution' || item.kind === 'special' ? 'mL' : 'g');

  function select(id) {
    selected = D.SHELF.find((x) => x.id === id);
    root.querySelectorAll('.shelf-item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    root.querySelector('#shelf-sel').innerHTML = `<b>${esc(selected.name)}</b>${selected.note ? `<br/><span class="dim">${esc(selected.note)}</span>` : ''}`;
    root.querySelector('#shelf-amount').value = selected.amount;
    root.querySelector('#shelf-unit').textContent = unitOf(selected);
  }

  function addSelected(id, amount) {
    const item = D.SHELF.find((x) => x.id === id);
    if (!item) return;
    const amt = amount !== undefined ? amount : Number(root.querySelector('#shelf-amount').value) || item.amount;
    if (amt <= 0) return;
    BeakerSim.add(id, amt);
    updatePanel(true);
  }

  function wire() {
    const list = root.querySelector('#shelf-list');
    list.addEventListener('click', (e) => { const b = e.target.closest('.shelf-item'); if (b) select(b.dataset.id); });
    list.addEventListener('dblclick', (e) => { const b = e.target.closest('.shelf-item'); if (b) { select(b.dataset.id); addSelected(b.dataset.id); } });
    list.addEventListener('dragstart', (e) => {
      const b = e.target.closest('.shelf-item');
      if (!b) return;
      select(b.dataset.id);
      e.dataTransfer.setData('text/plain', b.dataset.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    root.querySelector('#shelf-search').addEventListener('input', (e) => buildShelf(e.target.value));
    root.querySelector('#shelf-go').addEventListener('click', () => { if (selected) addSelected(selected.id); else toast('Pick a chemical from the shelf first'); });
    root.querySelector('#shelf-amount').addEventListener('keydown', (e) => { if (e.key === 'Enter' && selected) addSelected(selected.id); });

    const stage = root.querySelector('.bench-stage');
    const hint = root.querySelector('#drop-hint');
    stage.addEventListener('dragover', (e) => { e.preventDefault(); hint.classList.remove('hidden'); });
    stage.addEventListener('dragleave', () => hint.classList.add('hidden'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      hint.classList.add('hidden');
      const id = e.dataTransfer.getData('text/plain');
      if (id) addSelected(id);
    });

    root.querySelector('#b-reset').addEventListener('click', () => {
      BeakerSim.reset({ waterML: Number(root.querySelector('#b-water').value) });
      BeakerSim.onEvent = (e) => addLogEntry(e);
      BeakerRender.clearParticles();
      root.querySelector('#r-log').innerHTML = '';
      root.querySelector('#b-burner').value = 0; root.querySelector('#b-ice').checked = false; root.querySelector('#b-stir').checked = false;
      root.querySelector('#b-burner-v').textContent = 'off';
      updatePanel(true);
      toast('Fresh beaker of distilled water');
    });
    root.querySelector('#b-burner').addEventListener('input', (e) => {
      BeakerSim.state.burnerW = Number(e.target.value);
      root.querySelector('#b-burner-v').textContent = e.target.value > 0 ? `${e.target.value} W` : 'off';
      if (e.target.value > 0) { BeakerSim.state.ice = false; root.querySelector('#b-ice').checked = false; }
    });
    root.querySelector('#b-ice').addEventListener('change', (e) => {
      BeakerSim.state.ice = e.target.checked;
      if (e.target.checked) { BeakerSim.state.burnerW = 0; root.querySelector('#b-burner').value = 0; root.querySelector('#b-burner-v').textContent = 'off'; }
    });
    root.querySelector('#b-stir').addEventListener('change', (e) => { BeakerSim.state.stir = e.target.checked; });
    root.querySelector('#b-speed').addEventListener('change', (e) => { speed = Number(e.target.value); });
    root.querySelector('#r-clearlog').addEventListener('click', () => { root.querySelector('#r-log').innerHTML = ''; });

    root.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => runTest(b.dataset.test)));
  }

  function runTest(kind) {
    let r;
    const out = root.querySelector('#test-result');
    if (kind === 'lit') { r = BeakerSim.litSplint(); BeakerRender.playEffect(r.result === 'pop' ? 'pop' : r.result === 'out' ? 'out' : r.result === 'bright' ? 'bright' : 'lit'); }
    if (kind === 'glow') { r = BeakerSim.glowingSplint(); BeakerRender.playEffect(r.result === 'relight' ? 'relight' : 'none', { glowing: true }); }
    if (kind === 'lime') { r = BeakerSim.limewaterTest(); BeakerRender.playEffect('limewater', { milky: r.result === 'milky' }); }
    if (kind === 'litmus') {
      r = BeakerSim.dampLitmus();
      BeakerRender.playEffect('litmus', { color: r.result === 'blue' ? '#4f5bd5' : r.result === 'bleached' ? '#f4f4f0' : '#d9434f' });
    }
    if (kind === 'flame') { r = BeakerSim.flameTest(root.querySelector('#b-cobalt').checked); BeakerRender.playEffect('flame', { color: r.color }); }
    out.textContent = r.text;
    out.classList.remove('flash'); void out.offsetWidth; out.classList.add('flash');
  }

  function addLogEntry(e) {
    if (!root) return;
    const box = root.querySelector('#r-log');
    const div = document.createElement('div');
    div.className = 'log-entry' + (e.level === 'warn' ? ' warn' : '');
    const mm = Math.floor(e.t / 60), ss = Math.floor(e.t % 60);
    div.innerHTML = `<span class="lt">${mm}:${String(ss).padStart(2, '0')}</span> ${e.icon || '•'} ${esc(e.text)}`;
    box.prepend(div);
    while (box.children.length > 120) box.lastChild.remove();
    if (e.level === 'warn') toast(e.text, true);
  }

  function updatePanel(force = false) {
    const s = BeakerSim.state;
    if (!s || !s.eq) return;
    const pH = s.eq.pH;
    root.querySelector('#r-ph').textContent = pH.toFixed(2);
    const mark = root.querySelector('#r-ph-mark');
    mark.style.left = `${Math.max(0, Math.min(100, (pH / 14) * 100))}%`;
    root.querySelector('#r-T').textContent = `${s.T.toFixed(1)} °C`;
    root.querySelector('#r-V').textContent = `${(s.V * 1000).toFixed(1)} mL`;
    const sp = BeakerSim.topSpecies(14);
    root.querySelector('#r-species').innerHTML = sp.length ? sp.map((x) => `<tr><td>${x.color ? `<i class="sw" style="background:rgb(${x.color.map((v) => Math.round(v * 255)).join(',')})"></i>` : ''}${x.label}</td><td>${fmtC(x.c)}</td></tr>`).join('')
      : '<tr><td class="dim">Only water (H₂O ⇌ H⁺ + OH⁻)</td><td></td></tr>';
    const solids = [];
    BeakerSim.precipitates().forEach((p) => solids.push(`<div><i class="sw" style="background:${p.color}"></i>${p.name} precipitate: ${(p.mol * 1000).toFixed(3)} mmol ${p.settled > 0.6 ? '(settled)' : '(suspended)'}</div>`));
    BeakerSim.crystals().forEach((c) => solids.push(`<div><i class="sw" style="background:${c.color}"></i>${c.label} crystals: ${c.g.toFixed(2)} g</div>`));
    s.lumps.forEach((l) => {
      const def = l.kind === 'metal' ? D.METALS[l.key] : D.OTHER_LUMPS[l.key];
      if (l.n > 1e-9) solids.push(`<div><i class="sw" style="background:${def.color}"></i>${def.label}: ${(l.n * def.M).toFixed(3)} g</div>`);
      Object.entries(l.coat).forEach(([m, n]) => solids.push(`<div><i class="sw" style="background:${D.METALS[m].color}"></i>${D.METALS[m].label} deposited: ${(n * D.METALS[m].M * 1000).toFixed(1)} mg</div>`));
    });
    if (s.h2o2 > 1e-6) solids.push(`<div class="dim">H₂O₂ remaining: ${(s.h2o2 * 1000).toFixed(2)} mmol</div>`);
    root.querySelector('#r-solids').innerHTML = solids.join('') || '<span class="dim">None</span>';
    const f = BeakerSim.fractions();
    const gas = Object.entries(f).filter(([g, v]) => (g === 'O2' ? v > 0.215 : v > 0.002)).map(([g, v]) => `<div>${D.GASES[g].label}: ${(v * 100).toFixed(1)} %${D.GASES[g].toxic ? ' ☠' : ''}</div>`);
    const bub = s.bubbles > 1e-6 ? `<div class="dim">Bubbling: ${(s.bubbles * 1e6).toFixed(0)} µmol/s</div>` : '';
    root.querySelector('#r-gas').innerHTML = (gas.join('') || '<span class="dim">Just air</span>') + bub;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    acc += dt * speed;
    let steps = 0;
    try {
      while (acc >= 0.1 && steps < 40) { BeakerSim.tick(0.1); acc -= 0.1; steps++; }
      BeakerRender.draw(dt);
    } catch (e) {
      logError('beaker', 'Simulation error', e);
      running = false;
      toast('The Beaker Lab hit an error; see the console. Try a new beaker.', true);
      return;
    }
    panelTimer += dt;
    if (panelTimer > 0.25) { panelTimer = 0; updatePanel(); }
    requestAnimationFrame(loop);
  }

  ChemRouter.register('beaker', {
    title: 'Beaker Lab',
    init: build,
    show: () => { running = true; lastFrame = performance.now(); requestAnimationFrame(loop); updatePanel(true); },
    hide: () => { running = false; },
  });

  // console / test access
  window.ChemBeaker = { sim: BeakerSim, add: (id, amt) => addSelected(id, amt), test: runTest };
})();
