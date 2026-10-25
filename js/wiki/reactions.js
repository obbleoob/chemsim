/* ============================================================================
   ChemSim · wiki/reactions.js
   ----------------------------------------------------------------------------
   Animated reaction cards for element pages, plus the flame-test animation.

   cardsFor(element) picks reactions from chemistry rules (group, activity
   series, …), so every relevant element gets them without per-element setup:
     water      metal dropped into water (alkali & alkaline-earth metals);
                violence scales down group 1, Li fizzes … Cs explodes
     acid       metal strip in hydrochloric acid, bubble rate = reactivity
     noacid     metal in acid, nothing happens (below H in the activity series)
     burn       element burning in air/oxygen with its flame colour
     displace   halogen displacement: colour change in solution
     precip     silver halide precipitates
     deposit    a more reactive metal pushes a less reactive one out of solution
     discharge  noble-gas discharge tube with the colour computed from its spectrum
     splint     oxygen relights a glowing splint
     thermite   aluminium + iron(III) oxide
   Animations are cartoons of what you would see, not simulations; the Beaker
   Lab (Phase 2) will add real quantities.
   ============================================================================ */
'use strict';

const WikiReactions = (() => {
  const running = new Set();

  // Rough activity: bubble rate in dilute HCl (0 = no reaction)
  const ACID_RATE = { Mg: 1.0, Al: 0.45, Zn: 0.6, Fe: 0.3, Ni: 0.15, Sn: 0.15, Pb: 0.06, Mn: 0.7, Cr: 0.3, Co: 0.15, Cd: 0.2, Ti: 0.05, Be: 0.4 };
  const NO_ACID = new Set(['Cu', 'Ag', 'Au', 'Pt', 'Pd', 'Hg', 'Ir', 'Rh', 'Os', 'Ru']);
  const ALKALI_VIOLENCE = { Li: 1, Na: 2, K: 3, Rb: 4, Cs: 5, Fr: 5 };

  function cardsFor(e) {
    const s = e.sym, cards = [];
    if (ALKALI_VIOLENCE[s]) {
      const v = ALKALI_VIOLENCE[s];
      const desc = {
        1: 'Lithium floats and fizzes steadily. It is the least reactive alkali metal, because its outer electron is held most tightly.',
        2: 'Sodium melts into a silvery ball (the reaction releases enough heat), whizzes around on the surface and fizzes. The indicator turns pink: NaOH is formed.',
        3: 'Potassium reacts so fast that the hydrogen ignites with a lilac flame, and it may spit.',
        4: 'Rubidium reacts explosively: it sinks, and the hydrogen ignites instantly.',
        5: s === 'Fr' ? 'Predicted to be the most violent of all, but nobody has ever had enough francium to try (the most stable isotope has a 22-minute half-life).' : 'Caesium explodes on contact with water, shattering glass containers. The reaction rate rises down the group as the outer electron gets further from the nucleus and easier to lose.',
      }[v];
      cards.push({ type: 'water', eq: `2${s} + 2H₂O → 2${s}OH + H₂↑`, text: desc + ' (Phenolphthalein indicator in the water.)', p: { violence: v, flame: v >= 3 ? (s === 'K' ? '#c9a0ff' : s === 'Rb' ? '#d0208a' : '#7f7dff') : null } });
    }
    if (['Ca', 'Sr', 'Ba'].includes(s)) {
      cards.push({ type: 'water', eq: `${s} + 2H₂O → ${s}(OH)₂ + H₂↑`, text: `${e.name} sinks and fizzes steadily, forming the hydroxide. ${s === 'Ca' ? 'Calcium hydroxide is only slightly soluble, so the water turns milky.' : 'Reactivity increases down group 2.'}`, p: { violence: s === 'Ca' ? 1.2 : 1.6, sinks: true, milky: s === 'Ca' } });
    }
    if (ACID_RATE[s]) {
      const r = ACID_RATE[s];
      const ion = { Al: 'AlCl₃', Fe: 'FeCl₂', Cr: 'CrCl₂', Mn: 'MnCl₂', Co: 'CoCl₂', Ni: 'NiCl₂', Sn: 'SnCl₂', Pb: 'PbCl₂', Cd: 'CdCl₂', Ti: 'TiCl₃', Be: 'BeCl₂' }[s] || `${s}Cl₂`;
      const eq = s === 'Al' ? '2Al + 6HCl → 2AlCl₃ + 3H₂↑' : s === 'Ti' ? '2Ti + 6HCl → 2TiCl₃ + 3H₂↑' : `${s} + 2HCl → ${ion} + H₂↑`;
      const extra = s === 'Al' ? ' Slow to start: a thin protective Al₂O₃ layer must dissolve first.' : s === 'Pb' ? ' Very slow: insoluble PbCl₂ coats the surface.' : '';
      cards.push({ type: 'acid', eq, text: `${e.name} is above hydrogen in the reactivity series, so it displaces hydrogen from acid. Bubble rate shows how reactive it is.${extra}`, p: { rate: r, metal: '#a8b0bb' } });
    }
    if (NO_ACID.has(s)) {
      cards.push({ type: 'noacid', eq: `${s} + HCl → no reaction`, text: `${e.name} is below hydrogen in the reactivity series, so it cannot displace hydrogen from dilute acid.${s === 'Au' || s === 'Pt' ? ' Dissolving it takes aqua regia (HNO₃ + 3HCl).' : s === 'Cu' || s === 'Ag' ? ' It does dissolve in oxidising nitric acid.' : ''}`, p: { metal: s === 'Cu' ? '#d97745' : s === 'Au' ? '#f5c542' : '#d1d5db' } });
    }
    const BURN = {
      H: ['2H₂ + O₂ → 2H₂O', 'Hydrogen burns with an almost invisible pale-blue flame; a test tube of it held to a flame gives the famous squeaky pop.', '#a5c8ff', 'pop'],
      C: ['C + O₂ → CO₂', 'Charcoal glows orange-red and burns without much flame. In limited oxygen, toxic carbon monoxide (CO) forms instead.', '#ff7a2a', 'glow'],
      Mg: ['2Mg + O₂ → 2MgO', 'Magnesium burns with a blinding white light (do not look straight at it), leaving white magnesium oxide ash. Used in flares and old camera flashes.', '#ffffff', 'bright'],
      S: ['S + O₂ → SO₂', 'Sulfur melts and burns with a pale-blue flame, giving choking sulfur dioxide.', '#4d7cff', 'flame'],
      P: ['P₄ + 5O₂ → P₄O₁₀', 'White phosphorus catches fire in air by itself (around 30 °C) and burns with a bright yellow-white flame and dense white smoke.', '#fff3b0', 'smoke'],
      Fe: ['3Fe + 2O₂ → Fe₃O₄', 'Iron wool burns in oxygen with bright orange sparks. Solid iron only rusts slowly.', '#ffb347', 'sparks'],
      Na: ['4Na + O₂ → 2Na₂O', 'Heated sodium burns with an intense yellow-orange flame (the sodium D lines).', '#ffb300', 'flame'],
      Li: ['4Li + O₂ → 2Li₂O', 'Lithium burns with a crimson flame.', '#ff2045', 'flame'],
      K: ['K + O₂ → KO₂', 'Potassium burns with a lilac flame, forming potassium superoxide.', '#c9a0ff', 'flame'],
      Ca: ['2Ca + O₂ → 2CaO', 'Calcium burns with a brick-red flame.', '#ff6a2b', 'flame'],
      Cu: ['2Cu + O₂ → 2CuO', 'Copper does not burn as a solid, but heated copper turns black (CuO) and copper dust gives green sparks.', '#33d6a6', 'glow'],
      Zn: ['2Zn + O₂ → 2ZnO', 'Zinc dust burns with a bluish-green flame, forming white zinc oxide ("philosopher\'s wool").', '#a3efe1', 'flame'],
      Al: ['4Al + 3O₂ → 2Al₂O₃', 'Aluminium powder burns brilliantly (rocket fuel, sparklers). Solid aluminium is protected by its oxide layer.', '#fffbe6', 'sparks'],
    };
    if (BURN[s]) { const [eq, text, color, style] = BURN[s]; cards.push({ type: 'burn', eq, text, p: { color, style } }); }
    if (s === 'Cl') cards.push({ type: 'displace', eq: 'Cl₂ + 2KBr → 2KCl + Br₂', text: 'Chlorine water added to colourless potassium bromide turns it orange: chlorine is more reactive than bromine and takes its electrons. Reactivity falls down group 17.', p: { from: '#e6f0ff', to: '#ff9a2e' } });
    if (s === 'Br') cards.push({ type: 'displace', eq: 'Br₂ + 2KI → 2KBr + I₂', text: 'Orange bromine water added to potassium iodide turns brown as iodine forms. Bromine can displace iodine but not chlorine.', p: { from: '#e6f0ff', to: '#8a4a1c' } });
    if (s === 'I') cards.push({ type: 'displace', eq: 'I₂ + starch → blue-black complex', text: 'Iodine is the classic test for starch: the triiodide ion slips inside starch helices and turns deep blue-black.', p: { from: '#f4f0d0', to: '#1c1f4a' } });
    if (s === 'F') cards.push({ type: 'burn', eq: '2F₂ + 2H₂O → 4HF + O₂', text: 'Fluorine is the most reactive element of all. Even water and glass burn in it, and it is only demonstrated with special equipment.', p: { color: '#e8ffb0', style: 'flame' } });
    const PRECIP = { Cl: ['white', '#f8fafc', 'AgCl'], Br: ['cream', '#f3e7b8', 'AgBr'], I: ['yellow', '#f6d84a', 'AgI'] };
    if (PRECIP[s]) { const [n, col, f] = PRECIP[s]; cards.push({ type: 'precip', eq: `Ag⁺(aq) + ${s}⁻(aq) → ${f}(s)`, text: `The silver nitrate test: ${s === 'Cl' ? 'chloride' : s === 'Br' ? 'bromide' : 'iodide'} ions give a ${n} precipitate. Used in qualitative analysis to tell halides apart (and with ammonia: AgCl dissolves, AgI does not).`, p: { color: col } }); }
    if (s === 'Ag') cards.push({ type: 'precip', eq: 'Ag⁺(aq) + Cl⁻(aq) → AgCl(s)', text: 'Silver ions are detected by adding chloride: a white precipitate of silver chloride forms, which darkens in light (the basis of film photography).', p: { color: '#f8fafc' } });
    if (s === 'Zn') cards.push({ type: 'deposit', eq: 'Zn + CuSO₄ → ZnSO₄ + Cu', text: 'Zinc is more reactive than copper. A zinc strip in blue copper(II) sulfate gets coated with brown copper, and the blue colour fades.', p: { from: '#3b82f6', to: '#dbeafe', metal: '#9ca3af', coat: '#a0522d' } });
    if (s === 'Cu') cards.push({ type: 'deposit', eq: 'Cu + 2AgNO₃ → Cu(NO₃)₂ + 2Ag', text: 'A copper wire in colourless silver nitrate grows a "tree" of glittering silver crystals, and the solution slowly turns blue as Cu²⁺ ions form.', p: { from: '#eef2ff', to: '#60a5fa', metal: '#d97745', coat: '#e5e7eb', crystals: true } });
    if (s === 'Fe') cards.push({ type: 'deposit', eq: 'Fe + CuSO₄ → FeSO₄ + Cu', text: 'An iron nail in copper(II) sulfate becomes coated in copper. This is "cementation", once used to recover copper from mine water.', p: { from: '#3b82f6', to: '#a7c5a0', metal: '#6b7280', coat: '#a0522d' } });
    if (e.category === 'noble gas' && e.lines && e.lines.length) {
      const g = Spectrum.glowColor(e.lines);
      cards.push({ type: 'discharge', eq: `${s} (low-pressure gas) + high voltage → light`, text: `Noble gases hardly react${s === 'Xe' || s === 'Kr' ? ` (${s === 'Xe' ? 'xenon does form XeF₂, XeF₄ and XeF₆' : 'krypton forms KrF₂'}, though)` : ''}, but excited by electricity they glow. This colour is computed from ${e.name}'s NIST spectrum.`, p: { color: g ? Spectrum.css(g) : '#fff' } });
    }
    if (s === 'O') cards.push({ type: 'splint', eq: 'C (glowing splint) + O₂ → CO₂', text: 'The test for oxygen: a glowing splint bursts back into flame in pure oxygen.', p: {} });
    if (s === 'Al') cards.push({ type: 'thermite', eq: '2Al + Fe₂O₃ → Al₂O₃ + 2Fe', text: 'The thermite reaction is so exothermic (ΔH ≈ −850 kJ/mol) that it produces molten iron at over 2500 °C. Used to weld railway tracks.', p: {} });
    return cards;
  }

  /* ---------------- animation engine ---------------- */
  function loop(canvas, draw) {
    const st = { t: 0, particles: [], alive: true };
    let last = performance.now();
    const frame = (now) => {
      if (!st.alive || !canvas.isConnected) { running.delete(st); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      st.t += dt;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth || 220, H = canvas.clientHeight || 160;
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      draw(c, W, H, st, dt);
      requestAnimationFrame(frame);
    };
    running.add(st);
    requestAnimationFrame(frame);
    return st;
  }
  function stopAll() { running.forEach((s) => { s.alive = false; }); running.clear(); }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const mix = (c1, c2, t) => {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = h(c1), b = h(c2);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  };

  function beaker(c, W, H, liquid, level = 0.62) {
    const bx = W * 0.22, bw = W * 0.56, by = H * 0.12, bh = H * 0.8;
    const top = by + bh * (1 - level);
    c.fillStyle = liquid;
    c.fillRect(bx + 2, top, bw - 4, by + bh - top - 2);
    c.strokeStyle = 'rgba(203,213,225,0.8)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(bx - 4, by); c.lineTo(bx, by + 4); c.lineTo(bx, by + bh); c.lineTo(bx + bw, by + bh); c.lineTo(bx + bw, by + 4); c.lineTo(bx + bw + 4, by); c.stroke();
    return { bx, bw, by, bh, top };
  }

  function bubbles(c, st, dt, x0, x1, yBottom, yTop, rate, size = 2.5) {
    if (Math.random() < rate * dt * 60) st.particles.push({ x: rnd(x0, x1), y: yBottom, r: rnd(size * 0.6, size * 1.4), v: rnd(30, 60) });
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
    st.particles = st.particles.filter((p) => {
      p.y -= p.v * dt; p.x += Math.sin(p.y * 0.2) * 0.3;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
      return p.y > yTop;
    });
  }

  function flameShape(c, x, y, w, h, color, t, alpha = 1) {
    for (let i = 0; i < 3; i++) {
      const hh = h * (1 - i * 0.25) * (0.9 + 0.1 * Math.sin(t * 13 + i));
      const ww = w * (1 - i * 0.3);
      const grd = c.createRadialGradient(x, y - hh * 0.3, 1, x, y - hh * 0.3, hh);
      grd.addColorStop(0, i === 2 ? 'rgba(255,255,255,0.9)' : color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = alpha * (0.55 + i * 0.15);
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(x - ww / 2, y);
      c.quadraticCurveTo(x - ww * 0.6, y - hh * 0.5, x + Math.sin(t * 9 + i) * ww * 0.15, y - hh);
      c.quadraticCurveTo(x + ww * 0.6, y - hh * 0.5, x + ww / 2, y);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  const ANIM = {
    water(c, W, H, st, dt, p) {
      const T = st.t % 8;   // loop every 8 s
      const pink = Math.min(1, Math.max(0, (T - 1) / 4));
      const b = beaker(c, W, H, mix('#1e3a5f', '#d9468f', pink * 0.75));
      const v = p.violence;
      if (T > 0.6) {
        const x = b.bx + b.bw / 2 + Math.sin(T * (1 + v * 0.8)) * b.bw * 0.32 * (p.sinks ? 0.3 : 1);
        const y = p.sinks ? b.by + b.bh - 10 : b.top - 4;
        const size = Math.max(2, 9 - (T - 0.6) * (0.6 + v * 0.5));
        c.fillStyle = '#cbd5e1';
        c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
        bubbles(c, st, dt, x - size, x + size, y, b.top - 30, 0.3 + v * 0.6, 2);
        if (p.flame && size > 2.5) flameShape(c, x, y - 2, 14 + v * 4, 24 + v * 8, p.flame, st.t);
        if (v >= 4 && T > 1 && T < 1.6) {          // explosion flash
          c.fillStyle = `rgba(255,255,255,${1.6 - T})`;
          c.beginPath(); c.arc(x, y, 30 + (T - 1) * 80, 0, Math.PI * 2); c.fill();
        }
        if (p.milky) { c.fillStyle = `rgba(240,240,240,${Math.min(0.35, (T - 1) * 0.08)})`; c.fillRect(b.bx + 2, b.top, b.bw - 4, b.by + b.bh - b.top - 2); }
      } else {
        c.fillStyle = '#cbd5e1';
        c.beginPath(); c.arc(b.bx + b.bw / 2, b.by - 10 + T * 30, 9, 0, Math.PI * 2); c.fill();
      }
    },
    acid(c, W, H, st, dt, p) {
      const b = beaker(c, W, H, 'rgba(147,197,253,0.25)');
      const sx = b.bx + b.bw / 2 - 6;
      c.fillStyle = p.metal || '#9ca3af';
      c.fillRect(sx, b.by - 6, 12, b.bh - 8);
      const delay = p.rate < 0.5 ? Math.min(1, st.t / 3) : 1;
      bubbles(c, st, dt, sx - 2, sx + 14, b.by + b.bh - 10, b.top, p.rate * 1.6 * delay, 2.2);
    },
    noacid(c, W, H, st, dt, p) {
      const b = beaker(c, W, H, 'rgba(147,197,253,0.25)');
      c.fillStyle = p.metal;
      c.fillRect(b.bx + b.bw / 2 - 6, b.by - 6, 12, b.bh - 8);
      c.fillStyle = '#94a3b8'; c.font = '11px Inter, sans-serif'; c.textAlign = 'center';
      c.fillText('…nothing happens', W / 2, H - 4);
    },
    burn(c, W, H, st, dt, p) {
      // deflagrating spoon + flame
      c.strokeStyle = '#94a3b8'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(W * 0.5, H * 0.05); c.lineTo(W * 0.5, H * 0.72); c.stroke();
      c.fillStyle = '#64748b'; c.beginPath(); c.ellipse(W * 0.5, H * 0.75, 16, 5, 0, 0, Math.PI * 2); c.fill();
      const x = W / 2, y = H * 0.72;
      if (p.style === 'bright') {
        const g = c.createRadialGradient(x, y - 10, 2, x, y - 10, 70);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (p.style === 'pop') {
        const T = st.t % 3;
        if (T < 0.25) { c.fillStyle = `rgba(165,200,255,${1 - T * 4})`; c.beginPath(); c.arc(x, y - 20, 10 + T * 120, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e6edf3'; c.font = '700 16px Inter'; c.textAlign = 'center'; c.fillText('POP!', x, H * 0.2); }
        flameShape(c, x, y, 16, 30, p.color, st.t, 0.4);
        return;
      }
      if (p.style === 'glow') {
        const g = c.createRadialGradient(x, y - 4, 1, x, y - 4, 20 + Math.sin(st.t * 3) * 3);
        g.addColorStop(0, '#fff2b0'); g.addColorStop(0.4, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y - 4, 24, 0, Math.PI * 2); c.fill();
        return;
      }
      flameShape(c, x, y, 34, 70, p.color, st.t);
      if (p.style === 'smoke') {
        if (Math.random() < 0.5) st.particles.push({ x: x + rnd(-6, 6), y: y - 50, r: rnd(4, 8), v: rnd(15, 30) });
        st.particles = st.particles.filter((q) => { q.y -= q.v * dt; q.r += dt * 6; c.fillStyle = 'rgba(240,240,240,0.18)'; c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.fill(); return q.y > -20; });
      }
      if (p.style === 'sparks') {
        for (let k = 0; k < 3; k++) st.particles.push({ x, y: y - 10, vx: rnd(-90, 90), vy: rnd(-140, -40), life: rnd(0.3, 0.8) });
        st.particles = st.particles.filter((q) => {
          q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.life -= dt;
          c.strokeStyle = p.color; c.lineWidth = 1.5; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); c.stroke();
          return q.life > 0;
        });
      }
    },
    displace(c, W, H, st, dt, p) {
      const T = st.t % 7;
      const t = Math.min(1, Math.max(0, (T - 1) / 3));
      const b = beaker(c, W, H, mix(p.from, p.to, t).replace('rgb', 'rgba').replace(')', ',0.75)'));
      if (T < 1.5) { c.fillStyle = p.to; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(b.bx + b.bw / 2 + Math.sin(k) * 4, b.by - 18 + ((T * 60 + k * 12) % 40), 2.5, 0, Math.PI * 2); c.fill(); } }
    },
    precip(c, W, H, st, dt, p) {
      const T = st.t % 8;
      const b = beaker(c, W, H, 'rgba(147,197,253,0.2)');
      const cloud = Math.min(1, Math.max(0, (T - 0.8) / 1.5));
      const settle = Math.min(1, Math.max(0, (T - 3) / 4));
      if (T < 1.2) { c.fillStyle = 'rgba(220,230,255,0.9)'; c.beginPath(); c.arc(b.bx + b.bw / 2, b.by - 10 + ((T * 50) % 30), 2.5, 0, Math.PI * 2); c.fill(); }
      const fluid = b.by + b.bh - b.top;
      const top = b.top + settle * fluid * 0.8;
      c.fillStyle = p.color; c.globalAlpha = 0.65 * cloud * (1 - settle * 0.4);
      c.fillRect(b.bx + 2, top, b.bw - 4, b.by + b.bh - top - 2);
      c.globalAlpha = Math.min(1, cloud * 0.9 + settle * 0.1);
      c.fillRect(b.bx + 2, b.by + b.bh - 2 - 10 * settle, b.bw - 4, 10 * settle);
      c.globalAlpha = 1;
    },
    deposit(c, W, H, st, dt, p) {
      const T = st.t % 10;
      const t = Math.min(1, T / 6);
      const b = beaker(c, W, H, mix(p.from, p.to, t).replace('rgb', 'rgba').replace(')', ',0.7)'));
      const sx = b.bx + b.bw / 2 - 5;
      c.fillStyle = p.metal; c.fillRect(sx, b.by - 6, 10, b.bh - 8);
      c.fillStyle = p.coat; c.globalAlpha = t;
      c.fillRect(sx - 2, b.top, 14, b.by + b.bh - b.top - 10);
      if (p.crystals) {
        for (let k = 0; k < 14; k++) {
          const yy = b.top + 8 + k * ((b.by + b.bh - b.top - 20) / 14);
          const len = t * (8 + (k * 7) % 12);
          c.strokeStyle = '#f1f5f9'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(sx + (k % 2 ? 12 : -2), yy); c.lineTo(sx + (k % 2 ? 12 + len : -2 - len), yy - len * 0.4); c.stroke();
        }
      }
      c.globalAlpha = 1;
    },
    discharge(c, W, H, st, dt, p) {
      const y = H / 2, x0 = W * 0.12, x1 = W * 0.88;
      const flick = 0.85 + 0.15 * Math.sin(st.t * 40) * Math.sin(st.t * 7);
      const g = c.createLinearGradient(0, y - 14, 0, y + 14);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = flick; c.fillStyle = g; c.fillRect(x0, y - 14, x1 - x0, 28); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(203,213,225,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect ? c.roundRect(x0, y - 12, x1 - x0, 24, 12) : c.rect(x0, y - 12, x1 - x0, 24); c.stroke();
      c.fillStyle = '#64748b'; c.fillRect(x0 - 14, y - 6, 14, 12); c.fillRect(x1, y - 6, 14, 12);
      c.fillStyle = '#94a3b8'; c.font = '10px Inter'; c.textAlign = 'center'; c.fillText('−   high voltage   +', W / 2, H - 6);
    },
    splint(c, W, H, st) {
      const T = st.t % 5;
      const inGas = T > 1.5;
      c.strokeStyle = '#a16207'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(W * 0.2, H * 0.15); c.lineTo(W * 0.52, H * 0.62); c.stroke();
      const x = W * 0.52, y = H * 0.62;
      if (inGas) flameShape(c, x, y + 4, 18, 36, '#ffb347', st.t);
      else { const g = c.createRadialGradient(x, y, 1, x, y, 7); g.addColorStop(0, '#ffdd88'); g.addColorStop(1, 'rgba(255,80,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(203,213,225,0.6)'; c.lineWidth = 1.5;
      c.strokeRect(W * 0.4, H * 0.5, W * 0.26, H * 0.46);
      c.fillStyle = '#94a3b8'; c.font = '10px Inter'; c.textAlign = 'center'; c.fillText('O₂', W * 0.53, H * 0.93);
    },
    thermite(c, W, H, st, dt) {
      const T = st.t % 7;
      c.fillStyle = '#7c2d12';
      c.beginPath(); c.moveTo(W * 0.35, H * 0.35); c.lineTo(W * 0.65, H * 0.35); c.lineTo(W * 0.55, H * 0.7); c.lineTo(W * 0.45, H * 0.7); c.fill();
      if (T > 1) {
        const g = c.createRadialGradient(W / 2, H * 0.4, 2, W / 2, H * 0.4, 60);
        g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.4, 'rgba(255,170,60,0.7)'); g.addColorStop(1, 'rgba(255,100,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        for (let k = 0; k < 4; k++) st.particles.push({ x: W / 2, y: H * 0.35, vx: rnd(-120, 120), vy: rnd(-160, -40), life: rnd(0.3, 0.9) });
        if (T > 2.5) { c.fillStyle = '#ffb020'; c.beginPath(); c.ellipse(W / 2, H * 0.9, 18 + (T - 2.5) * 4, 5, 0, 0, Math.PI * 2); c.fill(); }
      }
      st.particles = st.particles.filter((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 250 * dt; q.life -= dt; c.fillStyle = '#ffd27a'; c.fillRect(q.x, q.y, 2, 2); return q.life > 0; });
    },
  };

  function mountAll(root, e) {
    const cards = cardsFor(e);
    root.querySelectorAll('.rx-card.anim').forEach((el) => {
      const card = cards[Number(el.dataset.rx)];
      const cv = el.querySelector('.rx-canvas');
      let st = loop(cv, (c, W, H, s, dt) => ANIM[card.type](c, W, H, s, dt, card.p));
      el.querySelector('[data-rx-play]').addEventListener('click', () => { st.alive = false; st = loop(cv, (c, W, H, s, dt) => ANIM[card.type](c, W, H, s, dt, card.p)); });
    });
  }

  /** Flame-test animation in the given colour. */
  function flame(canvas, color) {
    loop(canvas, (c, W, H, st) => {
      // Bunsen burner
      c.fillStyle = '#475569'; c.fillRect(W / 2 - 7, H * 0.78, 14, H * 0.22);
      flameShape(c, W / 2, H * 0.78, 30, H * 0.62, color, st.t);
      // wire loop
      c.strokeStyle = '#cbd5e1'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(W * 0.95, H * 0.2); c.lineTo(W / 2 + 6, H * 0.5); c.stroke();
      c.beginPath(); c.arc(W / 2 + 2, H * 0.52, 3.5, 0, Math.PI * 2); c.stroke();
    });
  }

  return { cardsFor, mountAll, stopAll, flame };
})();
