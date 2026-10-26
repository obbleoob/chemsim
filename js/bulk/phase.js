/* ============================================================================
   ChemSim · bulk/phase.js
   ----------------------------------------------------------------------------
   Interactive phase diagrams (pressure on a log scale against temperature).

   Water   IAPWS formulations (Wagner & Pruss 1993 vapour pressure; IAPWS 2011
           sublimation and ice-Ih melting curves). Triple point 273.16 K,
           611.657 Pa; critical point 647.096 K, 22.064 MPa.
   CO₂     Span & Wagner (1996) vapour, sublimation and melting equations.
           Triple point 216.59 K, 0.518 MPa: at 1 atm CO₂ never melts, it sublimes
           at 194.7 K ("dry ice").
   Others  N₂, CH₄, NH₃ and I₂ use a simple model through their real triple and
           critical points (Clausius–Clapeyron lines), labelled approximate.

   Drag the point to see which phase is stable, the boiling / melting point at
   that pressure, and a particle picture of the phase.
   ============================================================================ */
'use strict';

const PhaseDiagram = (() => {
  const R = 8.314;
  /* ---------------- substances ---------------- */
  const water = {
    name: 'Water (H₂O)', Tt: 273.16, Pt: 611.657, Tc: 647.096, Pc: 22.064e6, Tmin: 200, Tmax: 700, Pmin: 1, Pmax: 1e9, slope: -1, exact: true,
    pVap(T) {
      const t = 1 - T / this.Tc;
      const a = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502], e = [1, 1.5, 3, 3.5, 4, 7.5];
      return this.Pc * Math.exp((this.Tc / T) * a.reduce((s, ai, i) => s + ai * Math.pow(t, e[i]), 0));
    },
    pSub(T) {
      const th = T / this.Tt, a = [-21.2144006, 27.3203819, -6.1059813], b = [0.00333333333, 1.20666667, 1.70333333];
      return this.Pt * Math.exp(a.reduce((s, ai, i) => s + ai * Math.pow(th, b[i]), 0) / th);
    },
    pMelt(T) {      // ice Ih, valid 251.165–273.16 K
      const th = T / this.Tt, a = [1195393.37, 80818.3159, 3338.26860], b = [3, 25.75, 103.75];
      return this.Pt * (1 + a.reduce((s, ai, i) => s + ai * (1 - Math.pow(th, b[i])), 0));
    },
    meltRange: [251.165, 273.16],
    note: 'Water is unusual: its melting line leans LEFT (ice is less dense than liquid water), so pressure lowers the melting point. Above 210 MPa other forms of ice (III, V, VI…) take over; they are not drawn.',
  };
  const co2 = {
    name: 'Carbon dioxide (CO₂)', Tt: 216.592, Pt: 0.51795e6, Tc: 304.1282, Pc: 7.3773e6, Tmin: 150, Tmax: 350, Pmin: 1e3, Pmax: 1e9, slope: 1, exact: true,
    pVap(T) {
      const t = 1 - T / this.Tc, a = [-7.0602087, 1.9391218, -1.6463597, -3.2995634], e = [1, 1.5, 2, 4];
      return this.Pc * Math.exp((this.Tc / T) * a.reduce((s, ai, i) => s + ai * Math.pow(t, e[i]), 0));
    },
    pSub(T) {
      const t = 1 - T / this.Tt;
      return this.Pt * Math.exp((this.Tt / T) * (-14.740846 * t + 2.4327015 * Math.pow(t, 1.9) - 5.3061778 * Math.pow(t, 2.9)));
    },
    pMelt(T) { const d = T / this.Tt - 1; return this.Pt * (1 + 1955.539 * d + 2055.4593 * d * d); },
    meltRange: [216.592, 350],
    note: 'CO₂’s triple point is above 1 atm (5.1 atm), so at normal pressure solid CO₂ (dry ice) turns straight into gas at −78.5 °C. Liquid CO₂ only exists under pressure, e.g. in fire extinguishers.',
  };
  /** A simple model through the real triple and critical points. */
  function simple(name, Tt, Pt, Tc, Pc, dHsub, meltSlope, Tmin, Tmax, note) {
    const B = Math.log(Pc / Pt) / (1 / Tt - 1 / Tc);
    return {
      name, Tt, Pt, Tc, Pc, Tmin, Tmax, Pmin: Math.max(1, Pt / 1e4), Pmax: 1e9, slope: 1, exact: false,
      pVap: (T) => Pt * Math.exp(-B * (1 / T - 1 / Tt)),
      pSub: (T) => Pt * Math.exp(-(dHsub * 1000 / R) * (1 / T - 1 / Tt)),
      pMelt: (T) => Pt + meltSlope * 1e6 * (T - Tt),
      meltRange: [Tt, Tmax], note,
    };
  }
  const SUBSTANCES = {
    water, co2,
    n2: simple('Nitrogen (N₂)', 63.15, 12.52e3, 126.19, 3.3958e6, 6.3, 1.5, 40, 160, 'Liquid nitrogen boils at 77 K (−196 °C) at 1 atm. Simplified model through the real triple and critical points.'),
    ch4: simple('Methane (CH₄)', 90.69, 11.70e3, 190.56, 4.599e6, 9.1, 2.5, 60, 230, 'Natural gas is shipped as a liquid at 112 K (LNG). Simplified model.'),
    nh3: simple('Ammonia (NH₃)', 195.49, 6.06e3, 405.4, 11.333e6, 29.0, 3.0, 160, 450, 'Hydrogen bonding gives ammonia a much higher boiling point (240 K) than methane. Simplified model.'),
    i2: simple('Iodine (I₂)', 386.75, 12.07e3, 819, 11.7e6, 62.4, 3.0, 280, 880, 'Iodine’s vapour pressure is high enough that warm crystals give off violet vapour (sublimation) well below its melting point. Simplified model.'),
  };

  /** Which phase is stable at (T, P)? */
  function classify(s, T, P) {
    if (T >= s.Tc && P >= s.Pc && !(s.slope > 0 && P > s.pMelt(T))) return 'supercritical';
    if (s.slope < 0) {
      if (T < s.Tt) {
        if (P <= s.pSub(T)) return 'gas';
        if (T >= s.meltRange[0] && P > s.pMelt(T)) return 'liquid';
        return 'solid';
      }
      if (T >= s.Tc) return 'gas';
      return P > s.pVap(T) ? 'liquid' : 'gas';
    }
    if (T < s.Tt) return P > s.pSub(T) ? 'solid' : 'gas';
    if (P > s.pMelt(T)) return 'solid';
    if (T >= s.Tc) return 'gas';
    return P > s.pVap(T) ? 'liquid' : 'gas';
  }

  /** Temperature where curve f(T) reaches pressure P, by bisection on [a, b]. */
  function solveT(f, P, a, b) {
    let fa = Math.log(f(a)) - Math.log(P), fb = Math.log(f(b)) - Math.log(P);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2, fm = Math.log(f(m)) - Math.log(P);
      if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }
  /** Boiling (or sublimation) and melting temperature at pressure P. */
  function transitions(s, P) {
    const out = {};
    if (P >= s.Pt && P < s.Pc) out.boil = solveT((T) => s.pVap(T), P, s.Tt, s.Tc);
    if (P < s.Pt) out.sublime = solveT((T) => s.pSub(T), P, s.Tmin * 0.5, s.Tt);
    if (P >= s.Pt) {
      const [a, b] = s.meltRange;
      out.melt = s.slope < 0 ? solveT((T) => s.pMelt(T), P, a, b) : solveT((T) => s.pMelt(T), P, s.Tt, Math.max(b, s.Tt * 3));
    }
    return out;
  }

  /* ---------------- state & UI ---------------- */
  let el = null, cv = null, pcv = null, raf = 0, last = 0;
  let key = 'water', T = 298.15, P = 101325, path = null, phaseNow = null, logBox = [];
  let parts = [];

  const fmtP = (p) => (p >= 1e6 ? `${(p / 1e6).toPrecision(4)} MPa` : p >= 1e3 ? `${(p / 1e3).toPrecision(4)} kPa` : `${p.toPrecision(3)} Pa`) + ` (${(p / 101325).toPrecision(3)} atm)`;
  const fmtT = (t) => `${t.toFixed(1)} K (${(t - 273.15).toFixed(1)} °C)`;
  const COL = { solid: [96, 165, 250], liquid: [34, 211, 238], gas: [251, 191, 36], supercritical: [192, 132, 252] };

  function mount(container) {
    el = container;
    const s = SUBSTANCES[key];
    el.innerHTML = `
      <div class="bulk-grid">
        <aside class="panel">
          <div class="card"><h2>Substance</h2><select id="ph-sub">${Object.entries(SUBSTANCES).map(([k, v]) => `<option value="${k}"${k === key ? ' selected' : ''}>${v.name}</option>`).join('')}</select>
            <p class="small dim" id="ph-note"></p></div>
          <div class="card"><h2>Conditions</h2>
            <label class="ctl full">T <input type="range" id="ph-T" step="0.1"/> <span id="ph-Tv" class="mono"></span></label>
            <label class="ctl full">log P <input type="range" id="ph-P" step="0.01"/> <span id="ph-Pv" class="mono"></span></label>
            <div class="btn-row"><button class="hbtn small" id="ph-atm">1 atm, 25 °C</button><button class="hbtn small" id="ph-tp">Triple point</button><button class="hbtn small" id="ph-cp">Critical point</button></div>
            <div class="btn-row"><button class="hbtn small accent" id="ph-heat">🔥 Heat at this P</button><button class="hbtn small" id="ph-cool">❄️ Cool</button><button class="hbtn small" id="ph-comp">⬇ Compress at this T</button><button class="hbtn small" id="ph-exp">⬆ Expand</button></div></div>
          <div class="card"><h2>What happened</h2><div id="ph-log" class="log small"></div></div>
        </aside>
        <section class="bulk-center"><canvas id="ph-canvas" aria-label="Phase diagram"></canvas></section>
        <aside class="panel">
          <div class="card"><h2>Here</h2><div class="phase-tag" id="ph-phase"></div><div id="ph-info" class="small"></div></div>
          <div class="card"><h2>Particle view</h2><canvas id="ph-part" class="part-cv"></canvas><p class="muted-note" id="ph-partnote"></p></div>
          <div class="card"><h2>Key points</h2><div id="ph-keys" class="small"></div></div>
        </aside>
      </div>`;
    cv = el.querySelector('#ph-canvas'); pcv = el.querySelector('#ph-part');
    el.querySelector('#ph-sub').addEventListener('change', (e) => { key = e.target.value; const ss = SUBSTANCES[key]; T = Math.min(ss.Tmax, Math.max(ss.Tmin, 298.15)); P = 101325; logBox = []; setup(); });
    el.querySelector('#ph-T').addEventListener('input', (e) => { path = null; set(Number(e.target.value), P); });
    el.querySelector('#ph-P').addEventListener('input', (e) => { path = null; set(T, Math.pow(10, Number(e.target.value))); });
    el.querySelector('#ph-atm').addEventListener('click', () => { path = null; set(298.15, 101325); });
    el.querySelector('#ph-tp').addEventListener('click', () => { const ss = SUBSTANCES[key]; path = null; set(ss.Tt, ss.Pt); });
    el.querySelector('#ph-cp').addEventListener('click', () => { const ss = SUBSTANCES[key]; path = null; set(ss.Tc, ss.Pc); });
    el.querySelector('#ph-heat').addEventListener('click', () => { path = { dT: 1 }; });
    el.querySelector('#ph-cool').addEventListener('click', () => { path = { dT: -1 }; });
    el.querySelector('#ph-comp').addEventListener('click', () => { path = { dlogP: 1 }; });
    el.querySelector('#ph-exp').addEventListener('click', () => { path = { dlogP: -1 }; });
    // drag the point on the diagram
    const pick = (e) => {
      const r = cv.getBoundingClientRect(), g = geom();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const s2 = SUBSTANCES[key];
      const t = s2.Tmin + ((x - g.L) / g.pw) * (s2.Tmax - s2.Tmin);
      const lp = Math.log10(s2.Pmax) - ((y - g.T) / g.ph) * (Math.log10(s2.Pmax) - Math.log10(s2.Pmin));
      path = null;
      set(Math.max(s2.Tmin, Math.min(s2.Tmax, t)), Math.pow(10, Math.max(Math.log10(s2.Pmin), Math.min(Math.log10(s2.Pmax), lp))));
    };
    let dragging = false;
    cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); pick(e); });
    cv.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    cv.addEventListener('pointerup', () => { dragging = false; });
    setup();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() { cancelAnimationFrame(raf); el = null; }

  let regionCache = null;
  function setup() {
    const s = SUBSTANCES[key];
    regionCache = null;
    const tI = el.querySelector('#ph-T'), pI = el.querySelector('#ph-P');
    tI.min = s.Tmin; tI.max = s.Tmax; pI.min = Math.log10(s.Pmin); pI.max = Math.log10(s.Pmax);
    el.querySelector('#ph-note').textContent = s.note + (s.exact ? '' : ' (approximate curves)');
    const n = transitions(s, 101325);
    el.querySelector('#ph-keys').innerHTML = `
      <div><b>Triple point:</b> ${fmtT(s.Tt)}, ${fmtP(s.Pt)}: solid, liquid and gas coexist.</div>
      <div><b>Critical point:</b> ${fmtT(s.Tc)}, ${fmtP(s.Pc)}: above it liquid and gas become one supercritical fluid.</div>
      <div><b>At 1 atm:</b> ${n.boil ? `boils at ${fmtT(n.boil)}` : n.sublime ? `sublimes at ${fmtT(n.sublime)}` : ''}${n.melt ? `, melts at ${fmtT(n.melt)}` : ''}.</div>`;
    set(T, P);
  }

  function set(t, p) {
    const s = SUBSTANCES[key];
    T = t; P = p;
    el.querySelector('#ph-T').value = T; el.querySelector('#ph-P').value = Math.log10(P);
    el.querySelector('#ph-Tv').textContent = `${T.toFixed(1)} K`;
    el.querySelector('#ph-Pv').textContent = fmtP(P).split(' (')[0];
    const ph = classify(s, T, P);
    if (phaseNow && ph !== phaseNow) {
      const verb = { 'solid>liquid': 'melts', 'liquid>solid': 'freezes', 'liquid>gas': 'boils (vaporises)', 'gas>liquid': 'condenses', 'solid>gas': 'sublimes', 'gas>solid': 'deposits (solid forms directly from gas)' }[`${phaseNow}>${ph}`] || `becomes ${ph === 'supercritical' ? 'a supercritical fluid' : ph}`;
      logBox.unshift(`At ${T.toFixed(1)} K and ${fmtP(P).split(' (')[0]}: the ${phaseNow} ${verb}.`);
      logBox = logBox.slice(0, 30);
      el.querySelector('#ph-log').innerHTML = logBox.map((x) => `<div class="log-entry">${x}</div>`).join('');
    }
    if (ph !== phaseNow) initParticles(ph);
    phaseNow = ph;
    const tr = transitions(s, P);
    const tag = el.querySelector('#ph-phase');
    tag.textContent = ph === 'supercritical' ? 'supercritical fluid' : ph;
    tag.style.background = `rgba(${COL[ph]},0.2)`; tag.style.color = `rgb(${COL[ph]})`;
    const vp = T >= s.Tt && T < s.Tc ? s.pVap(T) : T < s.Tt ? s.pSub(T) : null;
    el.querySelector('#ph-info').innerHTML = `<div>${fmtT(T)}</div><div>${fmtP(P)}</div>
      ${vp ? `<div style="margin-top:6px">${T < s.Tt ? 'Sublimation' : 'Vapour'} pressure at this T: <b>${fmtP(vp)}</b></div>` : ''}
      ${tr.boil ? `<div>Boiling point at this P: <b>${fmtT(tr.boil)}</b></div>` : ''}${tr.sublime ? `<div>Sublimation point at this P: <b>${fmtT(tr.sublime)}</b></div>` : ''}
      ${tr.melt ? `<div>Melting point at this P: <b>${fmtT(tr.melt)}</b></div>` : ''}
      ${P >= s.Pc && T >= s.Tc ? '<div class="dim">No boiling is possible here: there is no surface between liquid and gas.</div>' : ''}`;
    el.querySelector('#ph-partnote').textContent = {
      solid: 'Particles vibrate about fixed places in a lattice. Hotter = bigger vibrations.',
      liquid: 'Particles touch but slide past each other; the liquid takes the shape of its container.',
      gas: 'Particles are far apart and move fast in straight lines between collisions.',
      supercritical: 'As dense as a liquid in places, but with no surface: it fills the container like a gas.',
    }[ph];
  }

  /* ---------------- diagram drawing ---------------- */
  function geom() {
    const W = cv.clientWidth, H = cv.clientHeight;
    return { W, H, L: 70, R: 18, T: 18, B: 44, pw: W - 88, ph: H - 62 };
  }
  function draw() {
    const s = SUBSTANCES[key];
    const dpr = window.devicePixelRatio || 1;
    const g = geom();
    if (!g.W || !g.H) return;
    if (cv.width !== Math.round(g.W * dpr) || cv.height !== Math.round(g.H * dpr)) { cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); regionCache = null; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lp0 = Math.log10(s.Pmin), lp1 = Math.log10(s.Pmax);
    const X = (t) => g.L + ((t - s.Tmin) / (s.Tmax - s.Tmin)) * g.pw;
    const Y = (p) => g.T + ((lp1 - Math.log10(p)) / (lp1 - lp0)) * g.ph;
    // phase regions (cached image)
    if (!regionCache) {
      const off = document.createElement('canvas');
      off.width = cv.width; off.height = cv.height;
      const oc = off.getContext('2d');
      oc.setTransform(dpr, 0, 0, dpr, 0, 0);
      oc.fillStyle = '#0b0f17'; oc.fillRect(0, 0, g.W, g.H);
      const step = 3;
      for (let x = 0; x < g.pw; x += step) for (let y = 0; y < g.ph; y += step) {
        const t = s.Tmin + ((x + 1) / g.pw) * (s.Tmax - s.Tmin);
        const p = Math.pow(10, lp1 - ((y + 1) / g.ph) * (lp1 - lp0));
        const ph = classify(s, t, p);
        oc.fillStyle = `rgba(${COL[ph]},0.16)`;
        oc.fillRect(g.L + x, g.T + y, step, step);
      }
      regionCache = off;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(regionCache, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // grid + axes
    c.font = '11px Inter, sans-serif'; c.fillStyle = '#9aa7b8'; c.strokeStyle = 'rgba(148,163,184,0.15)'; c.lineWidth = 1;
    for (let e = Math.ceil(lp0); e <= lp1; e++) {
      c.beginPath(); c.moveTo(g.L, Y(10 ** e)); c.lineTo(g.L + g.pw, Y(10 ** e)); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(e >= 6 ? `${10 ** (e - 6)} MPa` : e >= 3 ? `${10 ** (e - 3)} kPa` : `${10 ** e} Pa`, g.L - 6, Y(10 ** e));
    }
    const ts = LabPlot.niceStep(s.Tmax - s.Tmin, 8);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = Math.ceil(s.Tmin / ts) * ts; t <= s.Tmax; t += ts) {
      c.beginPath(); c.moveTo(X(t), g.T); c.lineTo(X(t), g.T + g.ph); c.stroke();
      c.fillText(String(t), X(t), g.T + g.ph + 5);
    }
    c.fillStyle = '#e6edf3'; c.fillText('Temperature / K', g.L + g.pw / 2, g.H - 18);
    // 1 atm line
    c.strokeStyle = 'rgba(226,232,240,0.35)'; c.setLineDash([5, 5]);
    c.beginPath(); c.moveTo(g.L, Y(101325)); c.lineTo(g.L + g.pw, Y(101325)); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#cbd5e1'; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText('1 atm', g.L + 4, Y(101325) - 2);
    // curves
    const curve = (f, a, b, col) => {
      c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath();
      let on = false;
      for (let i = 0; i <= 300; i++) {
        const t = a + ((b - a) * i) / 300, p = f(t);
        if (!isFinite(p) || p <= 0 || p > s.Pmax * 1.01 || p < s.Pmin * 0.99) { on = false; continue; }
        if (on) c.lineTo(X(t), Y(p)); else { c.moveTo(X(t), Y(p)); on = true; }
      }
      c.stroke();
    };
    curve((t) => s.pSub(t), s.Tmin, s.Tt, '#e2e8f0');
    curve((t) => s.pVap(t), s.Tt, s.Tc, '#e2e8f0');
    curve((t) => s.pMelt(t), s.slope < 0 ? s.meltRange[0] : s.Tt, s.slope < 0 ? s.Tt : s.Tmax, '#e2e8f0');
    // region labels
    c.font = '600 14px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lab = (txt, t, p, ph) => { c.fillStyle = `rgba(${COL[ph]},0.9)`; c.fillText(txt, X(t), Y(p)); };
    lab('SOLID', s.Tmin + (s.Tt - s.Tmin) * 0.45, Math.min(s.Pmax / 30, s.Pc * 3), 'solid');
    lab('LIQUID', (s.Tt + s.Tc) / 2, Math.min(s.Pmax / 10, s.Pc * 4), 'liquid');
    lab('GAS', (s.Tt + s.Tc) / 2, Math.max(s.Pmin * 10, s.Pt / 20), 'gas');
    if (X(s.Tc) < g.L + g.pw - 40) lab('SUPERCRITICAL', (s.Tc + s.Tmax) / 2 + (s.Tmax - s.Tc) * 0.1, Math.min(s.Pmax / 5, s.Pc * 6), 'supercritical');
    // triple and critical points
    [[s.Tt, s.Pt, 'triple point'], [s.Tc, s.Pc, 'critical point']].forEach(([t, p, n]) => {
      c.fillStyle = '#f472b6'; c.beginPath(); c.arc(X(t), Y(p), 5, 0, Math.PI * 2); c.fill();
      c.font = '11px Inter, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(n, X(t) + 7, Y(p) + 3);
    });
    // the current point
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.fillStyle = `rgb(${COL[phaseNow]})`;
    c.beginPath(); c.arc(X(T), Y(P), 8, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(X(T), Y(P)); c.lineTo(X(T), g.T + g.ph); c.moveTo(X(T), Y(P)); c.lineTo(g.L, Y(P)); c.stroke(); c.setLineDash([]);
    c.save(); c.translate(16, g.T + g.ph / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#e6edf3'; c.font = '12px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Pressure (log scale)', 0, 0); c.restore();
  }

  /* ---------------- particle view ---------------- */
  function initParticles(ph) {
    parts = [];
    const n = ph === 'gas' ? 36 : 120;
    for (let i = 0; i < n; i++) {
      const col = i % 12, row = Math.floor(i / 12);
      parts.push({ hx: 0.08 + col * 0.077, hy: 0.92 - row * 0.077, x: Math.random(), y: ph === 'liquid' ? 0.35 + Math.random() * 0.6 : Math.random(), vx: Math.random() - 0.5, vy: Math.random() - 0.5 });
    }
  }
  function drawParticles(dt) {
    const s = SUBSTANCES[key];
    const dpr = window.devicePixelRatio || 1;
    const W = pcv.clientWidth, H = pcv.clientHeight;
    if (!W) return;
    if (pcv.width !== W * dpr) { pcv.width = W * dpr; pcv.height = H * dpr; }
    const c = pcv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0f17'; c.fillRect(0, 0, W, H);
    const speed = Math.sqrt(T / s.Tt) * 0.35;
    const ph = phaseNow;
    parts.forEach((p) => {
      if (ph === 'solid') {
        const amp = 0.006 * Math.sqrt(T / s.Tt);
        p.x = p.hx + (Math.random() - 0.5) * amp * 2; p.y = p.hy + (Math.random() - 0.5) * amp * 2;
      } else {
        const sp = ph === 'liquid' ? speed * 0.25 : ph === 'gas' ? speed * 1.4 : speed;
        if (ph !== 'gas') { p.vx += (Math.random() - 0.5) * 2.5 * dt; p.vy += (Math.random() - 0.5) * 2.5 * dt; }
        const v = Math.hypot(p.vx, p.vy) || 1;
        p.vx = (p.vx / v) * sp; p.vy = (p.vy / v) * sp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const ymin = ph === 'liquid' ? 0.3 : 0.02;
        if (p.x < 0.02) { p.x = 0.02; p.vx = Math.abs(p.vx); } if (p.x > 0.98) { p.x = 0.98; p.vx = -Math.abs(p.vx); }
        if (p.y < ymin) { p.y = ymin; p.vy = Math.abs(p.vy); } if (p.y > 0.98) { p.y = 0.98; p.vy = -Math.abs(p.vy); }
      }
      c.fillStyle = `rgb(${COL[ph]})`;
      c.beginPath(); c.arc(p.x * W, p.y * H, ph === 'gas' ? 4 : 5, 0, Math.PI * 2); c.fill();
    });
    if (ph === 'liquid') { c.strokeStyle = 'rgba(34,211,238,0.5)'; c.beginPath(); c.moveTo(0, 0.27 * H); c.lineTo(W, 0.27 * H); c.stroke(); }
  }

  function loop(now) {
    if (!el) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (path) {
      const s = SUBSTANCES[key];
      if (path.dT) { const t = T + path.dT * (s.Tmax - s.Tmin) * 0.12 * dt; if (t >= s.Tmax || t <= s.Tmin) path = null; else set(t, P); }
      if (path && path.dlogP) { const lp = Math.log10(P) + path.dlogP * 0.9 * dt; if (lp >= Math.log10(s.Pmax) || lp <= Math.log10(s.Pmin)) path = null; else set(T, 10 ** lp); }
    }
    draw();
    drawParticles(dt);
    raf = requestAnimationFrame(loop);
  }

  BulkHub.add({ id: 'phase', icon: '🧊', title: 'Phase diagrams', mount, unmount });
  return { SUBSTANCES, classify, transitions, get state() { return { key, T, P }; }, set: (t, p) => set(t, p) };
})();
