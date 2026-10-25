/* ============================================================================
   ChemSim · wiki/table.js
   ----------------------------------------------------------------------------
   The interactive periodic table:
     • 118 cells laid out on an 18-column grid (f-block in two rows below)
     • colour by category, or by a property as a heatmap (legend + trend arrows)
     • "walk a trend": step along a period or group and watch the value change
       on a mini chart
     • search box and filters (state at 25 °C, block, radioactive)
   Clicking a cell opens that element's page (wiki/page.js).
   ============================================================================ */
'use strict';

const WikiTable = (() => {
  const st = { heat: 'category', search: '', phase: 'all', block: 'all', radio: 'all', walk: null, walkTimer: null };
  let root = null;

  // Perceptual colour scale (inferno-like: dark purple → orange → pale yellow)
  const SCALE = ['#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'];
  function scaleColor(t) {
    t = Math.max(0, Math.min(1, t));
    const x = t * (SCALE.length - 1);
    const i = Math.min(SCALE.length - 2, Math.floor(x));
    const f = x - i;
    const a = hex(SCALE[i]), b = hex(SCALE[i + 1]);
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
  }
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  /** Black or white text, whichever reads better on this background. */
  function textOn(rgb) {
    const [r, g, b] = rgb.startsWith('#') ? hex(rgb) : rgb.match(/\d+/g).map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b0f17' : '#f8fafc';
  }

  function build(container) {
    root = container;
    const H = WikiData.HEATMAPS;
    container.innerHTML = `
      <div class="wiki-bar">
        <div class="wiki-heat" role="group" aria-label="Colour the table by">
          ${Object.entries(H).map(([k, h]) => `<button class="chip-btn${k === st.heat ? ' active' : ''}" data-heat="${k}">${h.label}</button>`).join('')}
        </div>
        <div class="wiki-filters">
          <input id="wiki-search" type="search" placeholder="Search name, symbol or number…" spellcheck="false" />
          <select id="wiki-phase" aria-label="State at 25 °C" data-tip="Measured state at 25 °C. Elements whose state is only predicted are left out."><option value="all">Any state</option><option value="solid">Solid</option><option value="liquid">Liquid</option><option value="gas">Gas</option></select>
          <select id="wiki-block" aria-label="Block"><option value="all">Any block</option><option value="s">s-block</option><option value="p">p-block</option><option value="d">d-block</option><option value="f">f-block</option></select>
          <select id="wiki-radio" aria-label="Radioactivity"><option value="all">Stable &amp; radioactive</option><option value="stable">Has stable isotopes</option><option value="radio">Radioactive only</option></select>
        </div>
      </div>
      <div class="wiki-main">
        <div class="ptable-wrap">
          <div class="ptable" id="ptable"></div>
          <div class="ptable-legend" id="ptable-legend"></div>
        </div>
        <aside class="trend-panel" id="trend-panel">
          <h3>Walk a trend</h3>
          <p class="dim small">Step along a row or column to watch the selected property change.</p>
          <div class="walk-buttons">
            <span class="dim small">Periods</span>
            <div>${[1, 2, 3, 4, 5, 6, 7].map((p) => `<button class="mini-btn" data-walk="p${p}">${p}</button>`).join('')}</div>
            <span class="dim small">Groups</span>
            <div>${[1, 2, 13, 14, 15, 16, 17, 18].map((g) => `<button class="mini-btn" data-walk="g${g}">${g}</button>`).join('')}</div>
          </div>
          <canvas id="trend-chart" width="300" height="190"></canvas>
          <div id="trend-explain" class="trend-explain"></div>
        </aside>
      </div>`;

    const grid = container.querySelector('#ptable');
    WikiData.elements.forEach((e) => {
      const c = document.createElement('button');
      c.className = 'pt-cell';
      c.dataset.sym = e.sym;
      // grid: row 1 = group numbers, column 1 = period numbers,
      // and a gap row above the f-block (source rows 9-10)
      c.style.gridColumn = e.x + 1;
      c.style.gridRow = e.y >= 9 ? e.y + 2 : e.y + 1;
      c.innerHTML = `<span class="z">${e.z}</span><span class="sym">${e.sym}</span><span class="nm">${e.name}</span><span class="val"></span>`;
      grid.appendChild(c);
    });
    // placeholders that point to the f-block rows
    [['57–71', 6], ['89–103', 7]].forEach(([t, row]) => {
      const p = document.createElement('div');
      p.className = 'pt-cell pt-ref';
      p.style.gridColumn = 4; p.style.gridRow = row + 1;
      p.innerHTML = `<span class="sym small">${t}</span>`;
      grid.appendChild(p);
    });
    const gap = document.createElement('div');
    gap.className = 'pt-gap'; gap.style.gridRow = 10; gap.style.gridColumn = '2 / span 18';
    grid.appendChild(gap);
    // group numbers above the table
    for (let g = 1; g <= 18; g++) {
      const h = document.createElement('div');
      h.className = 'pt-group-label';
      h.textContent = g;
      h.style.gridColumn = g + 1;
      h.style.gridRow = 1;
      grid.appendChild(h);
    }
    for (let p = 1; p <= 7; p++) {
      const h = document.createElement('div');
      h.className = 'pt-period-label';
      h.textContent = p;
      h.style.gridColumn = 1;
      h.style.gridRow = p + 1;
      grid.appendChild(h);
    }

    grid.addEventListener('click', (ev) => {
      const c = ev.target.closest('.pt-cell[data-sym]');
      if (c) openFromTable(c.dataset.sym);
    });
    grid.addEventListener('mouseover', (ev) => {
      const c = ev.target.closest('.pt-cell[data-sym]');
      if (c) c.dataset.tip = cellTip(WikiData.get(c.dataset.sym));
    });
    container.querySelectorAll('[data-heat]').forEach((b) => b.addEventListener('click', () => setHeat(b.dataset.heat)));
    container.querySelector('#wiki-search').addEventListener('input', (e) => { st.search = e.target.value.trim().toLowerCase(); applyFilters(); });
    container.querySelector('#wiki-search').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const hit = WikiData.elements.find((x) => matches(x));
      if (hit) openFromTable(hit.sym);
    });
    ['phase', 'block', 'radio'].forEach((k) => container.querySelector('#wiki-' + k).addEventListener('change', (e) => { st[k] = e.target.value; applyFilters(); }));
    container.querySelectorAll('[data-walk]').forEach((b) => b.addEventListener('click', () => startWalk(b.dataset.walk)));

    setHeat(st.heat);
    log('wiki', 'Periodic table built');
  }

  /** Push a history entry so the Back button returns to the table. */
  function openFromTable(sym) {
    history.pushState(null, '', '#wiki/' + sym);
    WikiPage.open(sym);
  }

  function cellTip(e) {
    const H = WikiData.HEATMAPS;
    const bits = [`${e.name} (${e.sym}), Z = ${e.z}`, WikiData.CATEGORIES[e.category].label.replace(/s$/, ''), `mass ${e.mass}`];
    if (st.heat !== 'category') {
      const v = H[st.heat].get(e);
      bits.push(`${H[st.heat].label}: ${v == null ? 'no data' : fmt(v, H[st.heat].digits)} ${v == null ? '' : H[st.heat].unit}`);
    }
    return bits.join(' · ') + '. Click for the full page.';
  }

  const fmt = (v, d) => (v == null ? '—' : Number(v).toFixed(d));

  function setHeat(key) {
    st.heat = key;
    root.querySelectorAll('[data-heat]').forEach((b) => b.classList.toggle('active', b.dataset.heat === key));
    const H = WikiData.HEATMAPS[key];
    const legend = root.querySelector('#ptable-legend');
    const cells = root.querySelectorAll('.pt-cell[data-sym]');
    if (key === 'category') {
      cells.forEach((c) => {
        const e = WikiData.get(c.dataset.sym);
        const col = WikiData.CATEGORIES[e.category].color;
        c.style.background = `linear-gradient(160deg, ${col}33, ${col}14)`;
        c.style.borderColor = col + '88';
        c.style.color = '';
        c.querySelector('.val').textContent = '';
      });
      legend.innerHTML = Object.entries(WikiData.CATEGORIES).map(([k, v]) =>
        `<span class="leg-item" data-cat="${k}"><i style="background:${v.color}"></i>${v.label}</span>`).join('');
      legend.querySelectorAll('[data-cat]').forEach((it) => {
        it.addEventListener('mouseenter', () => cells.forEach((c) => c.classList.toggle('dimmed', WikiData.get(c.dataset.sym).category !== it.dataset.cat)));
        it.addEventListener('mouseleave', () => applyFilters());
      });
    } else {
      const vals = WikiData.elements.map(H.get).filter((v) => v != null && v > 0 || (v != null && !H.log));
      const tr = (v) => (H.log ? Math.log10(Math.max(v, 1e-6)) : v);
      const lo = Math.min(...vals.map(tr)), hi = Math.max(...vals.map(tr));
      cells.forEach((c) => {
        const e = WikiData.get(c.dataset.sym);
        const v = H.get(e);
        const val = c.querySelector('.val');
        if (v == null) {
          c.style.background = 'repeating-linear-gradient(45deg, #151b27, #151b27 4px, #1a2130 4px, #1a2130 8px)';
          c.style.borderColor = '#263247';
          c.style.color = '#64748b';
          val.textContent = '—';
        } else {
          const col = scaleColor((tr(v) - lo) / (hi - lo || 1));
          c.style.background = col;
          c.style.borderColor = 'transparent';
          c.style.color = textOn(col);
          val.textContent = fmt(v, H.digits);
        }
      });
      const mid = H.log ? Math.pow(10, (lo + hi) / 2) : (lo + hi) / 2;
      const show = (x) => (H.log ? Math.pow(10, x) : x);
      const arrows = H.trend ? `<span class="trend-arrows">→ across a period: <b>${H.trend.across === 'up' ? 'increases ↑' : 'decreases ↓'}</b> · ↓ down a group: <b>${H.trend.down === 'up' ? 'increases ↑' : 'decreases ↓'}</b></span>` : '';
      legend.innerHTML = `
        <div class="heat-legend">
          <span>${fmt(show(lo), H.digits)}</span>
          <div class="heat-bar" style="background:linear-gradient(90deg, ${SCALE.join(',')})"></div>
          <span>${fmt(show(hi), H.digits)} ${H.unit}</span>
          ${H.log ? `<span class="dim small">(log scale, middle ≈ ${fmt(mid, H.digits)})</span>` : ''}
          <span class="dim small">▨ no data</span>
        </div>${arrows}`;
    }
    applyFilters();
    root.querySelector('#trend-explain').innerHTML = key === 'category'
      ? '<p class="dim small">Pick a property above (e.g. Electronegativity) to see it as a heatmap and to walk its trend.</p>'
      : `<p class="small">${H.explain}</p>`;
    if (st.walk) drawWalkChart(st.walk.list, st.walk.step);
    log('wiki', 'Heatmap →', key);
  }

  function matches(e) {
    const q = st.search;
    if (q && !(e.name.toLowerCase().startsWith(q) || e.sym.toLowerCase() === q || String(e.z) === q)) return false;
    // predicted states (e.g. copernicium 'liquid') are not real observations
    if (st.phase !== 'all' && (e.phase !== st.phase || e.predictedBulk)) return false;
    if (st.block !== 'all' && e.block !== st.block) return false;
    const hasStable = e.isotopes.some((i) => i.abundance && !i.halfLife);
    if (st.radio === 'stable' && !hasStable) return false;
    if (st.radio === 'radio' && hasStable) return false;
    return true;
  }

  function applyFilters() {
    root.querySelectorAll('.pt-cell[data-sym]').forEach((c) => c.classList.toggle('dimmed', !matches(WikiData.get(c.dataset.sym))));
  }

  /* ---------- trend walk ---------- */
  function startWalk(id) {
    clearInterval(st.walkTimer);
    if (st.heat === 'category') setHeat('en');
    const kind = id[0], n = Number(id.slice(1));
    const list = WikiData.elements.filter((e) => (kind === 'p' ? e.period === n && e.y <= 7 : e.group === n)).sort((a, b) => (kind === 'p' ? a.x - b.x : a.z - b.z));
    root.querySelectorAll('[data-walk]').forEach((b) => b.classList.toggle('active', b.dataset.walk === id));
    st.walk = { id, list, step: 0 };
    log('wiki', `Walking ${kind === 'p' ? 'period' : 'group'} ${n}:`, list.map((e) => e.sym).join(' '));
    const tick = () => {
      root.querySelectorAll('.pt-cell.walk').forEach((c) => c.classList.remove('walk'));
      const e = list[st.walk.step];
      root.querySelector(`.pt-cell[data-sym="${e.sym}"]`).classList.add('walk');
      drawWalkChart(list, st.walk.step);
      st.walk.step++;
      if (st.walk.step >= list.length) {
        clearInterval(st.walkTimer);
        setTimeout(() => root.querySelectorAll('.pt-cell.walk').forEach((c) => c.classList.remove('walk')), 900);
      }
    };
    tick();
    st.walkTimer = setInterval(tick, 420);
  }

  function drawWalkChart(list, upto) {
    const cv = root.querySelector('#trend-chart');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 300, Hh = cv.clientHeight || 190;
    cv.width = W * dpr; cv.height = Hh * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, Hh);
    const H = WikiData.HEATMAPS[st.heat];
    if (!H.get) return;
    const vals = list.map(H.get);
    const known = vals.filter((v) => v != null);
    if (!known.length) return;
    const lo = Math.min(...known), hi = Math.max(...known);
    const L = 40, R = 10, T = 14, B = 26;
    const x = (i) => L + (list.length === 1 ? 0 : (i * (W - L - R)) / (list.length - 1));
    const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (Hh - T - B);
    c.strokeStyle = '#263247'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(L, T); c.lineTo(L, Hh - B); c.lineTo(W - R, Hh - B); c.stroke();
    c.fillStyle = '#94a3b8'; c.font = '10px Inter, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(fmt(hi, H.digits), L - 4, y(hi));
    c.fillText(fmt(lo, H.digits), L - 4, y(lo));
    c.textAlign = 'center'; c.textBaseline = 'top';
    list.forEach((e, i) => { c.fillStyle = i <= upto ? '#e6edf3' : '#475569'; c.fillText(e.sym, x(i), Hh - B + 6); });
    c.strokeStyle = '#22d3ee'; c.lineWidth = 2; c.beginPath();
    let started = false;
    vals.forEach((v, i) => {
      if (i > upto || v == null) return;
      if (!started) { c.moveTo(x(i), y(v)); started = true; } else c.lineTo(x(i), y(v));
    });
    c.stroke();
    vals.forEach((v, i) => {
      if (i > upto || v == null) return;
      c.fillStyle = i === upto ? '#fbbf24' : '#22d3ee';
      c.beginPath(); c.arc(x(i), y(v), i === upto ? 4.5 : 3, 0, Math.PI * 2); c.fill();
    });
    const cur = list[Math.min(upto, list.length - 1)];
    const cv2 = H.get(cur);
    c.fillStyle = '#fbbf24'; c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '600 11px Inter, sans-serif';
    c.fillText(`${cur.sym}: ${cv2 == null ? 'no data' : fmt(cv2, H.digits) + ' ' + H.unit}`, L + 4, 0);
  }

  return { build, setHeat, startWalk, get state() { return st; } };
})();
