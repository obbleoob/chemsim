/* ============================================================================
   ChemSim · wiki/wiki-data.js
   ----------------------------------------------------------------------------
   Loads the element data (data/elements.json, built by tools/build_elements.py)
   and the hand-written wiki articles (data/wiki/*.json), and holds the small
   tables the Element Wiki needs: category colours, heatmap definitions and
   flame-test colours.
   ============================================================================ */
'use strict';

const WikiData = (() => {
  // Colour per element category (chosen to stay readable on the dark theme).
  const CATEGORIES = {
    'alkali metal':          { label: 'Alkali metals',         color: '#f87171' },
    'alkaline earth metal':  { label: 'Alkaline earth metals', color: '#fb923c' },
    'transition metal':      { label: 'Transition metals',     color: '#facc15' },
    'post-transition metal': { label: 'Post-transition metals', color: '#a3e635' },
    'metalloid':             { label: 'Metalloids',            color: '#34d399' },
    'nonmetal':              { label: 'Reactive nonmetals',    color: '#22d3ee' },
    'halogen':               { label: 'Halogens',              color: '#60a5fa' },
    'noble gas':             { label: 'Noble gases',           color: '#a78bfa' },
    'lanthanide':            { label: 'Lanthanides',           color: '#f472b6' },
    'actinide':              { label: 'Actinides',             color: '#e879f9' },
    'unknown':               { label: 'Unknown chemistry',     color: '#94a3b8' },
  };

  /* Heatmap overlays. get() returns the number to colour by (or null).
     trend: which way the value usually increases, shown as arrows. */
  const HEATMAPS = {
    category: { label: 'Category' },
    en: {
      label: 'Electronegativity', unit: '(Pauling)', get: (e) => e.en, digits: 2,
      trend: { across: 'up', down: 'down' },
      explain: 'How strongly an atom pulls shared electrons. It rises across a period (more protons, same shell) and falls down a group (outer electrons further from the nucleus). Fluorine is the maximum at 3.98.',
    },
    radius: {
      label: 'Atomic radius', unit: 'pm', get: (e) => e.radius.calculated || e.radius.empirical || e.radius.rahm, digits: 0,
      trend: { across: 'down', down: 'up' },
      explain: 'Calculated atomic radius (where missing: the empirical or Rahm value). Atoms shrink across a period because the growing nuclear charge pulls the same shell in tighter, and grow down a group as new shells are added.',
    },
    ie1: {
      label: '1st ionization energy', unit: 'kJ/mol', get: (e) => e.ie[0], digits: 0,
      trend: { across: 'up', down: 'down' },
      explain: 'Energy to remove the outermost electron from a gas-phase atom. Highest for noble gases, lowest for alkali metals. Note the small dips at groups 13 and 16 (new p subshell, then the first paired p electron).',
    },
    ea: {
      label: 'Electron affinity', unit: 'kJ/mol', get: (e) => e.ea, digits: 1,
      trend: { across: 'up', down: 'down' },
      explain: 'Energy released when a gas-phase atom gains an electron. The halogens are highest (Cl, not F, is the record holder, because F is so small its electrons repel). Noble gases and group 2 have ~0.',
    },
    density: {
      label: 'Density', unit: 'g/cm³', get: (e) => e.density, digits: 2, log: true,
      explain: 'Density of the element at about room temperature (gases at 0 °C, 1 atm). Shown on a log scale. The densest elements (Os, Ir) sit in the middle of period 6, where heavy nuclei and small atomic radii combine.',
    },
    mp: {
      label: 'Melting point', unit: 'K', get: (e) => e.mp, digits: 0,
      explain: 'Melting point in kelvin. Tall peaks at carbon (graphite/diamond networks) and tungsten (strong metallic bonding from many d electrons); deep valleys at the noble gases.',
    },
    bp: {
      label: 'Boiling point', unit: 'K', get: (e) => e.bp, digits: 0,
      explain: 'Boiling point in kelvin. Shows the same metallic-bonding hump across the d-block as melting point.',
    },
  };

  /* Flame-test colours (standard qualitative analysis). Only elements that give
     a characteristic colour are listed; color is an approximate sRGB rendering. */
  const FLAME = {
    Li: { color: '#ff2045', name: 'crimson red', note: 'Strong red line at 670.8 nm.' },
    Na: { color: '#ffb300', name: 'intense yellow-orange', note: 'The sodium D lines at 589.0 and 589.6 nm. So bright it masks other colours: view through cobalt-blue glass to filter it.' },
    K:  { color: '#c9a0ff', name: 'lilac (pale violet)', note: 'Faint; red 766/770 nm and violet 404 nm lines. Easily masked by sodium contamination.' },
    Rb: { color: '#d0208a', name: 'red-violet', note: 'Rubidium was discovered by its red spectral lines (Latin rubidus, deep red).' },
    Cs: { color: '#7f7dff', name: 'blue-violet', note: 'Caesium was discovered by its two blue lines (Latin caesius, sky blue).' },
    Ca: { color: '#ff6a2b', name: 'orange-red (brick red)', note: 'Mostly CaOH band emission, not atomic lines.' },
    Sr: { color: '#ff1a2a', name: 'crimson', note: 'Used in red fireworks and road flares (SrCl₂, Sr(NO₃)₂).' },
    Ba: { color: '#a6f06a', name: 'pale apple-green', note: 'Used in green fireworks; BaCl emission bands.' },
    Ra: { color: '#ff2a55', name: 'carmine red', note: 'Rarely tested for obvious reasons: radium is intensely radioactive.' },
    Cu: { color: '#33d6a6', name: 'blue-green (emerald)', note: 'Copper(II) gives green; copper(II) chloride gives a more blue flame. Used in blue/green fireworks.' },
    B:  { color: '#47ff6e', name: 'bright green', note: 'Boric acid in methanol burns with a vivid green flame.' },
    In: { color: '#5a50ff', name: 'indigo blue', note: 'Indium was named after the indigo line in its spectrum (451 nm).' },
    Tl: { color: '#31ff4f', name: 'bright pure green', note: 'Named from Greek thallos, green shoot, after its 535 nm line. Thallium is very toxic.' },
    Pb: { color: '#b8c8ff', name: 'pale bluish-white', note: 'Faint.' },
    As: { color: '#9dc3ff', name: 'pale blue', note: 'Faint; arsenic compounds are toxic.' },
    Sb: { color: '#bdf0c4', name: 'pale green', note: 'Faint.' },
    Se: { color: '#4fa9ff', name: 'azure blue', note: '' },
    Te: { color: '#a0f0ac', name: 'pale green', note: '' },
    Zn: { color: '#a3efe1', name: 'pale bluish-green', note: 'Faint; often described as colourless.' },
    Mn: { color: '#ccff80', name: 'yellowish green', note: 'Faint (manganese(II)).' },
    Mo: { color: '#dcff8e', name: 'yellowish green', note: 'Faint.' },
    Fe: { color: '#ffc44d', name: 'gold / orange sparks', note: 'Iron filings give orange sparks; iron salts give a weak golden colour.' },
  };

  let elements = null;           // array, index z-1
  let bySym = {};
  let articles = {};             // symbol → article object
  let loadPromise = null;

  const ARTICLE_FILES = ['period1-2', 'period3', 'period4', 'period5', 'period6', 'period7', 'lanthanides', 'actinides'];

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const t0 = performance.now();
      const resp = await fetch('data/elements.json');
      if (!resp.ok) throw new Error('Could not load data/elements.json (HTTP ' + resp.status + ')');
      elements = (await resp.json()).elements;
      bySym = Object.fromEntries(elements.map((e) => [e.sym, e]));
      log('wiki', `Loaded ${elements.length} elements in ${(performance.now() - t0).toFixed(0)} ms`);
      // Articles are optional: a missing batch just means shorter pages.
      await Promise.all(ARTICLE_FILES.map(async (f) => {
        try {
          const r = await fetch(`data/wiki/${f}.json`);
          if (!r.ok) return;
          Object.assign(articles, await r.json());
        } catch (e) { warn('wiki', 'Article batch failed to load', f, e); }
      }));
      log('wiki', `Loaded ${Object.keys(articles).length} wiki articles`);
      return elements;
    })();
    loadPromise.catch(() => { loadPromise = null; });
    return loadPromise;
  }

  return {
    CATEGORIES, HEATMAPS, FLAME, load,
    get elements() { return elements; },
    get: (sym) => bySym[sym],
    byZ: (z) => elements && elements[z - 1],
    article: (sym) => articles[sym] || null,
  };
})();
