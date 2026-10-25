/* ============================================================================
   ChemSim · studio/main.js
   ----------------------------------------------------------------------------
   Examples, toolbar buttons and start-up of the Molecule Studio.
   ============================================================================ */
'use strict';

/* ============================================================================
   18. EXAMPLES, BUTTONS & START-UP
   ============================================================================ */
const EXAMPLES = [
  ['Basics', [
    ['Water', 'O'], ['Ammonia', 'N'], ['Methane', 'C'], ['Ethanol', 'CCO'], ['Acetic acid', 'CC(=O)O'],
    ['Acetone', 'CC(C)=O'], ['Carbon dioxide', 'O=C=O'], ['Hydrogen cyanide', 'C#N'], ['Benzene', 'c1ccccc1'], ['Phenol', 'Oc1ccccc1'],
  ]],
  ['Formal charges', [
    ['Ammonium ion', '[NH4+]'], ['Hydronium ion', '[OH3+]'], ['Acetate ion', 'CC(=O)[O-]'], ['Nitromethane', 'C[N+](=O)[O-]'],
    ['Ozone', '[O-][O+]=O'], ['tert-Butyl cation', 'C[C+](C)C'], ['Carbonate ion', '[O-]C([O-])=O'],
  ]],
  ['Octet exceptions', [
    ['Boron trifluoride (incomplete)', 'FB(F)F'], ['Sulfuric acid (expanded)', 'OS(=O)(=O)O'], ['Phosphoric acid (expanded)', 'OP(=O)(O)O'],
    ['Sulfur hexafluoride (expanded)', 'FS(F)(F)(F)(F)F'], ['⚠ Texas carbon (broken on purpose!)', '__TEXAS__'],
  ]],
  ['Stereochemistry', [
    ['L-Alanine (S)', 'C[C@H](N)C(=O)O'], ['(R)-2-Butanol', 'CC[C@@H](C)O'], ['cis-2-Butene (Z)', 'C/C=C\\C'], ['trans-2-Butene (E)', 'C/C=C/C'],
    ['β-D-Glucose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'],
  ]],
  ['Famous molecules', [
    ['Caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C'], ['Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'], ['Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'],
    ['Paracetamol', 'CC(=O)Nc1ccc(O)cc1'], ['Nicotine', 'CN1CCC[C@H]1c1cccnc1'],
  ]],
];

function populateExamples() {
  const sel = $('example-select');
  if (sel.options.length > 1) return;
  EXAMPLES.forEach(([group, list]) => {
    const og = document.createElement('optgroup');
    og.label = group;
    list.forEach(([name, smi]) => {
      const o = document.createElement('option');
      o.value = smi;
      o.textContent = name;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  log('ui', 'Example list ready');
}

/** The deliberately broken "Texas carbon" example (RDKit refuses to build it). */
function loadTexasCarbon() {
  pushHistory();
  state.atoms = []; state.bonds = [];
  const c = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const centre = addAtom('C', c.x, c.y);
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI / 2 + (2 * Math.PI * k) / 5;
    const a = addAtom('C', c.x + BOND_LEN * Math.cos(ang), c.y + BOND_LEN * Math.sin(ang));
    addBond(centre.id, a.id);
  }
  fitView();
  onMoleculeChanged();
  toast('Hover the red carbon to see what is wrong!');
}

function setTool(tool, extra = {}) {
  state.tool = tool;
  Object.assign(state, extra);
  document.querySelectorAll('#view-studio .tool[data-tool]').forEach((b) => {
    let on = b.dataset.tool === tool;
    if (on && tool === 'atom') on = b.dataset.el === state.element;
    if (on && tool === 'bond') on = b.dataset.bond === state.bondType;
    if (on && tool === 'ring') on = b.dataset.ring === state.ringType;
    if (on && tool === 'charge') on = Number(b.dataset.charge) === state.chargeDelta;
    b.classList.toggle('active', on);
  });
  canvas.classList.toggle('move-cursor', tool === 'select');
  canvas.classList.toggle('erase-cursor', tool === 'erase');
  const hints = {
    select: 'Move: drag an atom to move it · drag empty space to pan · scroll to zoom.',
    erase: 'Eraser: click an atom or bond to delete it.',
    atom: `Atom ${state.element}: click empty space to place ${state.element} · click an atom to turn it into ${state.element} · click a ${state.element} again to grow a chain · drag from an atom to draw a bond. Shortcut: hover an atom and press C, N, O, S, P, F, L (Cl), R (Br), I, H, B.`,
    bond: `Bond (${state.bondType}): click an atom to grow a bond · click a bond to change it${state.bondType === 'single' ? ' (single → double → triple)' : ''} · drag between atoms to connect them.${state.bondType === 'wedge' || state.bondType === 'dash' ? ' Start at the stereocentre (the narrow end). Click again to flip.' : ''}`,
    ring: 'Ring: click empty space for a new ring, an atom to attach one, or a bond to fuse one.',
    charge: `Charge: click an atom to add ${state.chargeDelta > 0 ? '+1' : '−1'} to its formal charge. Shortcut: hover an atom and press + or −.`,
  };
  $('hint-bar').textContent = '💡 ' + hints[tool];
  log('ui', 'Tool →', tool, extra);
}

function setNotation(n) {
  state.notation = n;
  $('btn-skeletal').classList.toggle('active', n === 'skeletal');
  $('btn-lewis').classList.toggle('active', n === 'lewis');
  log('ui', 'Notation →', n);
  render();
}

/* ---------- Autosave: the current drawing survives a page refresh ---------- */
let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const data = { atoms: state.atoms, bonds: state.bonds, nextId: state.nextId, notation: state.notation, overlays: state.overlays, savedAt: new Date().toISOString() };
    ChemStore.put('autosave', 'studio', data)
      .then(() => log('storage', `Autosaved drawing (${state.atoms.length} atoms)`))
      .catch((e) => warn('storage', 'Autosave failed', e));
  }, 500);
}

async function restoreAutosave() {
  try {
    const d = await ChemStore.get('autosave', 'studio');
    if (!d || !Array.isArray(d.atoms)) return;
    if (state.atoms.length) return;   // you already started drawing
    if (d.notation) setNotation(d.notation);   // before swapping atoms in (it redraws)
    state.atoms = d.atoms;
    state.bonds = d.bonds || [];
    state.nextId = d.nextId || 1;
    if (d.overlays) {
      Object.assign(state.overlays, d.overlays);
      const ids = { formal: 'ov-formal', ox: 'ov-ox', partial: 'ov-partial', cip: 'ov-cip', lp: 'ov-lp' };
      Object.entries(ids).forEach(([k, id]) => { $(id).checked = !!state.overlays[k]; });
    }
    fitView();
    onMoleculeChanged();
    log('storage', `Restored autosaved drawing from ${d.savedAt} (${state.atoms.length} atoms)`);
  } catch (e) {
    warn('storage', 'Could not restore autosave', e);
  }
}

function initStudio() {
  // Element buttons
  const grid = $('atom-buttons');
  TOOLBAR_ELEMENTS.forEach((el) => {
    const b = document.createElement('button');
    b.className = 'tool atom-btn';
    b.dataset.tool = 'atom';
    b.dataset.el = el;
    b.style.color = ELEMENTS[el].color;
    b.innerHTML = `${el}<small>${ELEMENTS[el].en.toFixed(2)}</small>`;
    b.dataset.tip = `${ELEMENTS[el].name}: ${ELEMENTS[el].ve} valence electrons, electronegativity ${ELEMENTS[el].en}, usually forms ${allowedValences(el, 0).normal} bond${allowedValences(el, 0).normal === 1 ? '' : 's'}${ELEMENTS[el].period >= 3 && el !== 'Si' ? ' (expanded octet possible)' : ''}.`;
    grid.appendChild(b);
  });

  document.querySelectorAll('#view-studio .tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tool;
    if (t === 'atom') setTool('atom', { element: b.dataset.el });
    else if (t === 'bond') setTool('bond', { bondType: b.dataset.bond });
    else if (t === 'ring') setTool('ring', { ringType: b.dataset.ring });
    else if (t === 'charge') setTool('charge', { chargeDelta: Number(b.dataset.charge) });
    else setTool(t);
  }));

  $('btn-skeletal').addEventListener('click', () => setNotation('skeletal'));
  $('btn-lewis').addEventListener('click', () => setNotation('lewis'));
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-clean').addEventListener('click', cleanUp);
  $('btn-3d').addEventListener('click', open3D);
  $('btn-export').addEventListener('click', exportPNG);
  $('btn-clear').addEventListener('click', () => {
    if (!state.atoms.length) return;
    pushHistory();
    state.atoms = []; state.bonds = [];
    onMoleculeChanged();
    toast('Canvas cleared (Ctrl+Z to undo)');
  });

  const ovMap = { 'ov-formal': 'formal', 'ov-ox': 'ox', 'ov-partial': 'partial', 'ov-cip': 'cip', 'ov-lp': 'lp' };
  Object.entries(ovMap).forEach(([id, k]) => $(id).addEventListener('change', (e) => { state.overlays[k] = e.target.checked; log('ui', 'Overlay', k, e.target.checked); render(); }));

  $('example-select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    if (v === '__TEXAS__') loadTexasCarbon(); else loadSmiles(v);
    e.target.value = '';
  });
  $('btn-load-smiles').addEventListener('click', () => loadSmiles($('smiles-input').value.trim()));
  $('smiles-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSmiles(e.target.value.trim()); });
  $('btn-load-name').addEventListener('click', () => loadByName($('name-input').value));
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadByName(e.target.value); });

  bind3DControls();
  populateExamples();
  setTool('atom', { element: 'C' });

  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  onMoleculeChanged();

  // Load the chemistry engine in the background (the editor already works).
  window.addEventListener('chemsim:rdkit-ready', () => onMoleculeChanged());
  loadRDKit();
  restoreAutosave();
  // Pre-load 3Dmol quietly so the 3D button opens fast.
  load3Dmol().catch((e) => warn('3dmol', 'Pre-load failed (will retry when you press 3D View)', e));

  // Handy for debugging in the console: type  ChemSim.state  or  ChemSim.toMolblock()
  window.ChemSim = { state, analyze, toMolblock, loadSmiles, embed3D: () => embed3D(state.analysis) };
  log('boot', 'Molecule Studio ready. Tip: type ChemSim.state in the console to inspect the molecule.');
}

ChemRouter.register('studio', {
  title: 'Molecule Studio',
  init: initStudio,
  show: () => { resizeCanvas(); },
  hide: () => { hideCanvasTooltip(); closeModal3D(); },
});
