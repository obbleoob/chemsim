/* ============================================================================
   ChemSim · arena/util.js
   ----------------------------------------------------------------------------
   Shared helpers for the Challenge Arena:
     • a seeded random number generator, so an exam can be re-created from its
       seed (and tests are reproducible)
     • number formatting with significant figures and ×10ⁿ notation
     • numeric multiple-choice building: the right answer plus "common
       mistake" distractors, sorted from smallest to largest like USNCO
     • formula parsing / molar masses (from the shared ELEMENTS table)
     • RDKit pictures of molecules for naming and reaction questions

   A question is a plain object:
     { topic, stem (HTML), choices: [HTML or {smi}], answer: index,
       explain (HTML), hint (HTML), fig: SMILES (optional), id, src }
   Mechanism questions have  type: 'mech'  instead of choices (see mech.js).
   ============================================================================ */
'use strict';

const ArenaUtil = (() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- seeded random numbers (mulberry32) ---------------- */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const r = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));        // inclusive
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.shuffle = (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
    r.sample = (arr, n) => r.shuffle(arr).slice(0, n);
    /** A "nice" number between lo and hi with the given step (e.g. 0.05 M steps). */
    r.step = (lo, hi, step) => +(lo + step * r.int(0, Math.round((hi - lo) / step))).toFixed(10);
    return r;
  }
  const newSeed = () => (Math.random() * 2 ** 31) >>> 0;

  /* ---------------- numbers ---------------- */
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const sup = (s) => String(s).replace(/[-0-9]/g, (c) => SUP[c]);
  const sub = (s) => String(s).replace(/[0-9]/g, (c) => SUB[c]);

  /** 0.000123 → "1.23 × 10⁻⁴";  42.0 → "42.0" (sf significant figures, kept). */
  function fmt(x, sf = 3) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const ax = Math.abs(x);
    if (ax >= 1e4 || ax < 1e-3) {
      const e = Math.floor(Math.log10(ax));
      let m = x / 10 ** e;
      let ms = m.toPrecision(sf);
      if (Math.abs(+ms) >= 10) { m /= 10; ms = m.toPrecision(sf); return `${ms} × 10${sup(e + 1)}`; }
      return `${ms} × 10${sup(e)}`;
    }
    let s = x.toPrecision(sf);
    if (/e/.test(s)) s = String(+s);      // e.g. 1.20e+3 → "1200"
    return s.replace('-', '−');
  }

  /**
   * Numeric choices: correct value plus distractors (common mistakes), four
   * distinct options sorted ascending. Values closer than 4 % count as the
   * same; extra "near misses" fill the list if there are too few mistakes.
   * Returns { choices: [string], answer: index, values }.
   */
  function numChoices(correct, wrongs, r, { sf = 3, dp = null, unit = '', n = 4, signed = false } = {}) {
    // dp: fixed decimal places instead of significant figures (pH is written 2.87, 11.00…)
    const show = (v) => (dp !== null ? v.toFixed(dp).replace('-', '−') : fmt(v, sf));
    const same = (a, b) => (dp !== null ? Math.abs(a - b) < 0.05 : Math.abs(a - b) <= 0.04 * Math.max(Math.abs(a), Math.abs(b))) || show(a) === show(b);
    const vals = [correct];
    const tryAdd = (v) => {
      if (vals.length >= n || !isFinite(v) || (!signed && v <= 0)) return;
      if (vals.some((x) => same(x, v))) return;
      vals.push(v);
    };
    r.shuffle(wrongs).forEach(tryAdd);
    const fill = [2, 0.5, 10, 0.1, 1.5, 0.67, 3, 0.33, 4, 0.25];
    for (const f of fill) tryAdd(correct * f);
    if (dp !== null) for (const d of [1, -1, 0.5, -0.5, 2, -2]) tryAdd(correct + d);
    for (let k = 2; vals.length < n; k++) tryAdd(correct + k * Math.abs(correct || 1));   // last resort
    const order = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const u = unit ? ' ' + unit : '';
    return { choices: order.map((o) => show(o.v) + u), answer: order.findIndex((o) => o.i === 0), values: order.map((o) => o.v) };
  }

  /** Shuffle choices given as [correct, wrong, wrong, wrong]. Returns { choices, answer }. */
  function shuffleChoices(list, r) {
    const idx = r.shuffle(list.map((_, i) => i));
    return { choices: idx.map((i) => list[i]), answer: idx.indexOf(0) };
  }

  /* ---------------- formulas ---------------- */
  /** "Ca(OH)2·2H2O" → { Ca: 1, O: 4, H: 6 }. Accepts unicode subscripts too. */
  function parseFormula(f) {
    f = String(f).replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)).replace(/\s/g, '');
    const parts = f.split(/[·.*]/);
    const total = {};
    parts.forEach((p) => {
      let mult = 1;
      const m = p.match(/^(\d+)(.*)$/);
      if (m) { mult = +m[1]; p = m[2]; }
      const counts = parseGroup(p);
      Object.entries(counts).forEach(([el, n]) => { total[el] = (total[el] || 0) + n * mult; });
    });
    return total;
  }
  function parseGroup(s) {
    const stack = [{}];
    const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) { const top = stack[stack.length - 1]; top[m[1]] = (top[m[1]] || 0) + (m[2] ? +m[2] : 1); }
      else if (m[3]) stack.push({});
      else if (m[4]) {
        const g = stack.pop(), k = m[5] ? +m[5] : 1, top = stack[stack.length - 1];
        Object.entries(g).forEach(([el, n]) => { top[el] = (top[el] || 0) + n * k; });
      }
    }
    return stack[0];
  }
  const ATOMIC_MASS = (el) => (typeof ELEMENTS !== 'undefined' && ELEMENTS[el] ? ELEMENTS[el].mass : EXTRA_MASS[el]);
  // elements used in questions that the drawing table (ELEMENTS) may not list
  const EXTRA_MASS = { Ca: 40.078, Mg: 24.305, Al: 26.982, K: 39.098, Fe: 55.845, Cu: 63.546, Zn: 65.38, Ag: 107.868, Ba: 137.327, Pb: 207.2, Mn: 54.938, Cr: 51.996, Ni: 58.693, Sr: 87.62, Sn: 118.71, Hg: 200.59, Au: 196.967, Co: 58.933, Ti: 47.867, Li: 6.94, Na: 22.990, I: 126.904, Ne: 20.180, Ar: 39.948, He: 4.0026, Xe: 131.29, Kr: 83.798, Cs: 132.905, Rb: 85.468, Be: 9.0122, U: 238.029, Pt: 195.084, Bi: 208.980, Cd: 112.414, Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Te: 127.60, Sb: 121.760, V: 50.942, Sc: 44.956, W: 183.84, Mo: 95.95, Zr: 91.224 };
  function molarMass(f) {
    return Object.entries(parseFormula(f)).reduce((s, [el, n]) => {
      const m = ATOMIC_MASS(el);
      if (m === undefined) throw new Error('No atomic mass for ' + el);
      return s + m * n;
    }, 0);
  }
  /** "H2SO4" → "H₂SO₄";  charges written as ^2+ → ²⁺ */
  function chem(f) {
    return String(f)
      .replace(/\^(\d*)([+-])/g, (_, d, s) => sup(d) + (s === '+' ? '⁺' : '⁻'))
      .replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + sub(d));
  }

  /* ---------------- molecule pictures (RDKit) ---------------- */
  const svgCache = new Map();
  const PALETTE = { 6: [0.85, 0.88, 0.92], 7: [0.45, 0.6, 1], 8: [1, 0.42, 0.42], 9: [0.5, 0.95, 0.5], 17: [0.4, 0.9, 0.4], 35: [0.92, 0.55, 0.35], 53: [0.75, 0.5, 0.95], 16: [1, 0.85, 0.3], 15: [1, 0.6, 0.2], 1: [0.9, 0.9, 0.9] };
  /** SVG markup for a SMILES string, or '' if RDKit is not ready / cannot read it. */
  function svg(smi, w = 200, h = 140, opts = {}) {
    const key = `${smi}|${w}|${h}|${JSON.stringify(opts)}`;
    if (svgCache.has(key)) return svgCache.get(key);
    if (typeof RDKit === 'undefined' || !RDKit) return '';
    let mol = null, out = '';
    try {
      mol = RDKit.get_mol(smi);
      if (mol && mol.is_valid()) {
        out = mol.get_svg_with_highlights(JSON.stringify({
          width: w, height: h, backgroundColour: [0, 0, 0, 0], bondLineWidth: 1.6, fixedBondLength: 28,
          addStereoAnnotation: !!opts.stereo, symbolColour: [0.9, 0.93, 0.96], annotationColour: [0.6, 0.85, 0.95],
          atomColourPalette: PALETTE, clearBackground: false, ...(opts.rd || {}),
        }));
        out = out.replace(/<\?xml[^>]*>/, '').replace(/<rect[^>]*style='opacity:1.0;fill:#000000[^>]*>\s*<\/rect>/, '');
      }
    } catch (e) { warn('arena', 'RDKit could not draw', smi, e); }
    finally { if (mol) mol.delete(); }
    if (out) svgCache.set(key, out);
    return out;
  }
  /** RDKit CIP labels: { atoms: {index: 'R'|'S'}, bonds: [[i, j, 'E'|'Z']] } */
  function stereoTags(smi) {
    let mol = null;
    try {
      mol = RDKit.get_mol(smi);
      const t = JSON.parse(mol.get_stereo_tags());
      const atoms = {};
      (t.CIP_atoms || []).forEach(([i, l]) => { l = l.replace(/[()]/g, ''); if (l !== '?') atoms[i] = l; });
      const bonds = (t.CIP_bonds || []).map(([i, j, l]) => [i, j, l.replace(/[()]/g, '')]).filter((b) => b[2] !== '?');
      return { atoms, bonds };
    } finally { if (mol) mol.delete(); }
  }
  /** Canonical SMILES (for comparing structures), or null. */
  function canon(smi) {
    let mol = null;
    try { mol = RDKit.get_mol(smi); return mol && mol.is_valid() ? mol.get_smiles() : null; }
    catch (e) { return null; } finally { if (mol) mol.delete(); }
  }

  /** HTML for one answer choice (text, or a structure picture). */
  function choiceHTML(c, size = [170, 120]) {
    if (c && typeof c === 'object' && c.smi) {
      const pic = svg(c.smi, size[0], size[1], { stereo: c.stereo });
      return `<span class="ar-choice-mol">${pic || `<code>${esc(c.smi)}</code>`}${c.label ? `<span class="small dim">${c.label}</span>` : ''}</span>`;
    }
    return String(c);
  }

  /** Time in seconds → "1:05:09" / "4:09" */
  function clock(s) {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  return { esc, rng, newSeed, fmt, sup, sub, numChoices, shuffleChoices, parseFormula, molarMass, chem, svg, stereoTags, canon, choiceHTML, clock };
})();
